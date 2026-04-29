import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Download, User, Clock, CheckCircle, XCircle, TrendingUp, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf';
import sckoolLogo from '@/assets/sckool-logo.jpeg';

interface StudentDetailPageProps {
  studentId: string;
  studentName: string;
  onBack: () => void;
}

interface StudentResult {
  id: string;
  test_id: string;
  score: number;
  correct_answers: number;
  wrong_answers: number;
  total_questions: number;
  difficulty_level: string;
  practice_score: number;
  time_spent: number;
  completed_at: string;
  test_title?: string;
  test_subject?: string;
}

export const StudentDetailPage = ({ studentId, studentName, onBack }: StudentDetailPageProps) => {
  const { toast } = useToast();
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    fetchData();
  }, [studentId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch student profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', studentId)
        .maybeSingle();

      if (!profileError && profileData) {
        setProfile(profileData);
      }

      // Fetch results with test info
      const { data: resultsData, error: resultsError } = await supabase
        .from('test_results')
        .select('*')
        .eq('student_id', studentId)
        .eq('is_retake', false)
        .order('completed_at', { ascending: false });

      if (resultsError) throw resultsError;

      // Fetch tests to get titles
      const { data: testsData, error: testsError } = await supabase
        .from('tests')
        .select('id, title, subject');

      if (testsError) throw testsError;

      const testsMap: Record<string, any> = {};
      testsData?.forEach(t => {
        testsMap[t.id] = t;
      });

      const mappedResults = (resultsData || []).map(r => ({
        ...r,
        test_title: testsMap[r.test_id]?.title || 'Unknown Test',
        test_subject: testsMap[r.test_id]?.subject || 'Unknown Subject',
      }));

      setResults(mappedResults);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error', description: 'Failed to load student data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generateStudentReport = async () => {
    const doc = new jsPDF();
    
    const avgScore = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
      : 0;
    const totalTime = results.reduce((sum, r) => sum + (r.time_spent || 0), 0);
    const totalCorrect = results.reduce((sum, r) => sum + (r.correct_answers || 0), 0);
    const totalWrong = results.reduce((sum, r) => sum + (r.wrong_answers || 0), 0);

    // Load logo
    const loadImageAsBase64 = (src: string): Promise<string> => {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          resolve(canvas.toDataURL('image/jpeg'));
        };
        img.onerror = () => resolve('');
        img.src = src;
      });
    };
    
    const logoBase64 = await loadImageAsBase64(sckoolLogo);
    
    // Watermark
    if (logoBase64) {
      doc.setGState(new (doc as any).GState({ opacity: 0.08 }));
      doc.addImage(logoBase64, 'JPEG', 55, 100, 100, 100);
      doc.setGState(new (doc as any).GState({ opacity: 1 }));
    }
    
    // Header
    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', 15, 10, 20, 20);
    }
    
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 37, 41);
    doc.text('ASD Benchmark Portal', 40, 18);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(108, 117, 125);
    doc.text('Student Performance Report', 40, 26);
    
    doc.setDrawColor(0, 123, 255);
    doc.setLineWidth(0.5);
    doc.line(15, 35, 195, 35);
    
    // Student info box
    doc.setFillColor(248, 249, 250);
    doc.roundedRect(15, 42, 180, 30, 3, 3, 'F');
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 37, 41);
    doc.text('Student Information', 20, 52);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Name: ${profile?.full_name || studentName}`, 25, 62);
    doc.text(`Grade: ${profile?.grade || 'N/A'} | Class: ${profile?.class || 'N/A'}`, 100, 62);
    doc.text(`Gender: ${profile?.gender || 'N/A'}`, 25, 69);
    
    // Stats boxes
    doc.setFillColor(0, 123, 255);
    doc.roundedRect(15, 80, 40, 25, 2, 2, 'F');
    doc.setFillColor(40, 167, 69);
    doc.roundedRect(60, 80, 40, 25, 2, 2, 'F');
    doc.setFillColor(255, 193, 7);
    doc.roundedRect(105, 80, 40, 25, 2, 2, 'F');
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(`${results.length}`, 35, 92, { align: 'center' });
    doc.text(`${avgScore}%`, 80, 92, { align: 'center' });
    doc.text(`${Math.floor(totalTime / 60)}m`, 125, 92, { align: 'center' });
    
    doc.setFontSize(7);
    doc.text('Tests', 35, 100, { align: 'center' });
    doc.text('Avg Score', 80, 100, { align: 'center' });
    doc.text('Total Time', 125, 100, { align: 'center' });
    
    // Test History
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(33, 37, 41);
    doc.text('Test History', 15, 120);
    
    let y = 130;
    doc.setFillColor(0, 123, 255);
    doc.rect(15, y - 5, 180, 8, 'F');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('Test', 17, y);
    doc.text('Subject', 70, y);
    doc.text('Score', 105, y);
    doc.text('Correct', 125, y);
    doc.text('Date', 160, y);
    
    y += 8;
    doc.setTextColor(33, 37, 41);
    doc.setFont('helvetica', 'normal');
    
    results.slice(0, 15).forEach((r, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 249, 250);
        doc.rect(15, y - 4, 180, 7, 'F');
      }
      doc.text((r.test_title || 'Unknown').substring(0, 20), 17, y);
      doc.text((r.test_subject || '-').substring(0, 12), 70, y);
      doc.text(`${r.score || 0}%`, 105, y);
      doc.text(`${r.correct_answers || 0}/${r.total_questions || 0}`, 125, y);
      doc.text(new Date(r.completed_at).toLocaleDateString(), 160, y);
      y += 7;
    });
    
    // Footer
    doc.setDrawColor(0, 123, 255);
    doc.line(15, 280, 195, 280);
    doc.setFontSize(8);
    doc.setTextColor(108, 117, 125);
    doc.text(`Generated by ASD Benchmark Portal on ${new Date().toLocaleString()}`, 105, 287, { align: 'center' });
    
    doc.save(`${profile?.full_name || studentName}_report.pdf`);
    toast({ title: 'Downloaded', description: 'Student report downloaded as PDF' });
  };

  // Calculate stats
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
    : 0;

  const totalTests = results.length;
  const totalTime = Math.floor(results.reduce((sum, r) => sum + (r.time_spent || 0), 0) / 60);

  // Score trend
  const scoreTrend = results
    .slice()
    .reverse()
    .slice(-10)
    .map((r, idx) => ({
      test: r.test_title?.substring(0, 10) || `T${idx + 1}`,
      score: r.score || 0,
    }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">{profile?.full_name || studentName}</h2>
              <p className="text-sm text-muted-foreground">
                {profile?.grade || 'N/A'} - {profile?.class || 'N/A'} • ID: {profile?.student_id || 'N/A'}
                {profile?.gender && ` • ${profile.gender}`}
              </p>
            </div>
          </div>
        </div>
        <Button onClick={generateStudentReport} className="gap-2 rounded-xl">
          <Download className="h-4 w-4" />
          Download Report (PDF)
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Tests Taken</p>
              <p className="text-2xl font-bold">{totalTests}</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-2xl font-bold">{avgScore}%</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Time</p>
              <p className="text-2xl font-bold">{totalTime} min</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Best Score</p>
              <p className="text-2xl font-bold">
                {results.length > 0 ? Math.max(...results.map(r => r.score || 0)) : 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* Score Trend */}
      <Card className="cloud-bubble p-6">
        <h3 className="text-lg font-semibold mb-4">Score Progress</h3>
        {scoreTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={scoreTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="test" stroke="hsl(var(--muted-foreground))" />
              <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
              <Tooltip 
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '1rem'
                }}
              />
              <Line 
                type="monotone" 
                dataKey="score" 
                stroke="hsl(var(--primary))" 
                strokeWidth={3}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-center py-8">No test history yet</p>
        )}
      </Card>

      {/* Test History */}
      <Card className="cloud-bubble p-6">
        <h3 className="text-lg font-semibold mb-4">Test History</h3>
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No tests completed yet</p>
          ) : (
            results.map((result) => (
              <div 
                key={result.id} 
                className="p-4 bg-muted/30 rounded-xl"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="font-semibold">{result.test_title}</p>
                    <p className="text-sm text-muted-foreground">{result.test_subject}</p>
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        {result.correct_answers || 0} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-destructive" />
                        {result.wrong_answers || 0} wrong
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor((result.time_spent || 0) / 60)} min
                      </span>
                      {result.difficulty_level && (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                          {result.difficulty_level}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{result.score || 0}%</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(result.completed_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};