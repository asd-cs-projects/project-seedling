import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, Users, Clock, FileQuestion, RefreshCw, StopCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LiveSession {
  id: string;
  student_id: string;
  test_id: string;
  current_question: number;
  time_remaining: number | null;
  started_at: string;
  practice_complete: boolean;
  difficulty_level: string | null;
  student_name?: string;
  test_title?: string;
  total_questions?: number;
}

interface LiveSessionsMonitorProps {
  onBack: () => void;
}

export const LiveSessionsMonitor = ({ onBack }: LiveSessionsMonitorProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<LiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [endingSession, setEndingSession] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      fetchActiveSessions();
      
      // Subscribe to real-time updates
      // Note: Realtime per-row events for test_sessions still flow via
      // postgres_changes (filtered server-side by table RLS). We re-fetch
      // on any change rather than relying on a global broadcast topic.
      const channel = supabase
        .channel(`teacher-monitor:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'test_sessions'
          },
          () => {
            fetchActiveSessions();
          }
        )
        .subscribe();

      // Safety-net polling every 5s in case realtime events are missed
      const interval = setInterval(fetchActiveSessions, 5000);

      return () => {
        supabase.removeChannel(channel);
        clearInterval(interval);
      };
    }
  }, [user]);

  const fetchActiveSessions = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // Get teacher's tests
      const { data: teacherTests, error: testsError } = await supabase
        .from('tests')
        .select('id, title')
        .eq('teacher_id', user.id);

      if (testsError) throw testsError;
      if (!teacherTests?.length) {
        setSessions([]);
        setLoading(false);
        return;
      }

      const testIds = teacherTests.map(t => t.id);
      const testMap = new Map(teacherTests.map(t => [t.id, t.title]));

      // Get active sessions for teacher's tests.
      // Sessions are deleted on submit, so any existing row is an active attempt.
      const { data: sessionsData, error: sessionsError } = await supabase
        .from('test_sessions')
        .select('*')
        .in('test_id', testIds)
        .order('started_at', { ascending: false });

      if (sessionsError) throw sessionsError;

      if (!sessionsData?.length) {
        setSessions([]);
        setLoading(false);
        return;
      }

      // Get student profiles
      const studentIds = sessionsData.map(s => s.student_id);
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', studentIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p.full_name]) || []);

      // Get question counts for each test
      const { data: questionCounts } = await supabase
        .from('questions')
        .select('test_id')
        .in('test_id', testIds);

      const countMap = new Map<string, number>();
      questionCounts?.forEach(q => {
        countMap.set(q.test_id, (countMap.get(q.test_id) || 0) + 1);
      });

      // Enrich sessions with student names and test titles
      const enrichedSessions: LiveSession[] = sessionsData.map(s => ({
        ...s,
        student_name: profileMap.get(s.student_id) || 'Unknown Student',
        test_title: testMap.get(s.test_id) || 'Unknown Test',
        total_questions: countMap.get(s.test_id) || 0,
      }));

      setSessions(enrichedSessions);
    } catch (error) {
      console.error('Error fetching sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeRemaining = (seconds: number | null) => {
    if (!seconds || seconds <= 0) return 'N/A';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercent = (current: number, total: number) => {
    if (total === 0) return 0;
    return Math.round((current / total) * 100);
  };

  const getTimeSinceStart = (startedAt: string) => {
    const started = new Date(startedAt);
    const now = new Date();
    const diffMs = now.getTime() - started.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just started';
    if (diffMins < 60) return `${diffMins} min ago`;
    return `${Math.floor(diffMins / 60)}h ${diffMins % 60}m ago`;
  };

  const handleEndTest = async (session: LiveSession) => {
    if (!window.confirm(`Are you sure you want to end the test for ${session.student_name}? Their current progress will be submitted.`)) return;
    setEndingSession(session.id);
    try {
      // Delete the session — the student's client will detect this and handle accordingly
      const { error } = await supabase
        .from('test_sessions')
        .delete()
        .eq('id', session.id);
      if (error) throw error;
      toast({ title: 'Test Ended', description: `Ended test for ${session.student_name}` });
      fetchActiveSessions();
    } catch (error) {
      console.error('Error ending test:', error);
      toast({ title: 'Error', description: 'Failed to end test', variant: 'destructive' });
    } finally {
      setEndingSession(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-semibold">Live Test Monitoring</h2>
            <p className="text-sm text-muted-foreground">See students currently taking your tests</p>
          </div>
        </div>
        <Button variant="outline" onClick={fetchActiveSessions} className="gap-2 rounded-xl">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : sessions.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Active Sessions</h3>
          <p className="text-muted-foreground">No students are currently taking your tests</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-3 h-3 rounded-full bg-success animate-pulse"></div>
            <span>{sessions.length} active session{sessions.length > 1 ? 's' : ''}</span>
          </div>

          {sessions.map((session) => (
            <Card key={session.id} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full bg-success animate-pulse"></div>
                    <h4 className="font-semibold text-lg">{session.student_name}</h4>
                  </div>
                  <p className="text-sm text-muted-foreground">{session.test_title}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-4 w-4" />
                    {getTimeSinceStart(session.started_at)}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <FileQuestion className="h-4 w-4 text-muted-foreground" />
                    <span>Question {session.current_question + 1} of {session.total_questions}</span>
                  </div>
                  <span className="text-muted-foreground">
                    {getProgressPercent(session.current_question + 1, session.total_questions || 1)}%
                  </span>
                </div>
                <Progress 
                  value={getProgressPercent(session.current_question + 1, session.total_questions || 1)} 
                  className="h-2"
                />

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-4 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      session.practice_complete 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-accent/20 text-accent-foreground'
                    }`}>
                      {session.practice_complete ? 'Main Test' : 'Practice'}
                    </span>
                    {session.difficulty_level && (
                      <span className="text-muted-foreground">
                        Difficulty: {session.difficulty_level}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className={session.time_remaining && session.time_remaining < 300 ? 'text-destructive font-medium' : ''}>
                        {formatTimeRemaining(session.time_remaining)}
                      </span>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleEndTest(session)}
                      disabled={endingSession === session.id}
                      className="gap-1 rounded-xl text-xs"
                    >
                      <StopCircle className="h-3.5 w-3.5" />
                      {endingSession === session.id ? 'Ending...' : 'End Test'}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};
