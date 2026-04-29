import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { BookOpen, TrendingUp, Award, LogOut, Code, ChartLine, History, User, ArrowLeft, CheckCircle, XCircle, Target, RotateCcw, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import sckoolLogo from "@/assets/sckool-logo.jpeg";
import { StudentResultDetail } from "@/components/results/StudentResultDetail";
import { GeminiLoader } from "@/components/ui/gemini-loader";
import { calculateResultMetrics, getStoredAnswer } from "@/lib/utils";

const SUBJECTS = ['All Subjects', 'English', 'Science', 'Mathematics', 'Social Studies'] as const;
type Subject = typeof SUBJECTS[number];

type ActiveSection = "home" | "performance" | "profile" | "result-detail";

const NewStudentDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut, loading } = useAuth();
  const [testCode, setTestCode] = useState("");
  const [testResults, setTestResults] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [selectedSubject, setSelectedSubject] = useState<Subject>('All Subjects');
  const [selectedResult, setSelectedResult] = useState<{ id: string; testId: string } | null>(null);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [expandedQuestions, setExpandedQuestions] = useState<any[]>([]);
  // AI Summary (per-subject) state
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [summaries, setSummaries] = useState<Record<string, { summary: string; strengths: string[]; improvements: string[]; generatedAt: string | null }>>({});
  const [summaryLoading, setSummaryLoading] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      fetchResults();
      fetchAllSummaries();
    }
  }, [user, loading]);

  const fetchAllSummaries = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('student_summaries')
      .select('subject, summary, strengths, improvements, generated_at')
      .eq('student_id', user.id);
    if (data) {
      const map: Record<string, any> = {};
      data.forEach((row: any) => {
        map[row.subject] = {
          summary: row.summary,
          strengths: Array.isArray(row.strengths) ? row.strengths : [],
          improvements: Array.isArray(row.improvements) ? row.improvements : [],
          generatedAt: row.generated_at,
        };
      });
      setSummaries(map);
    }
  };

  const handleGenerateSummary = async (force = false) => {
    if (!user) return;
    setSummaryLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: {
          mode: 'student-subject-summary',
          subject: selectedSubject,
          forceRegenerate: force,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const insights = (data as any)?.insights;
      const generatedAt = (data as any)?.generatedAt ?? new Date().toISOString();
      if (insights) {
        setSummaries(prev => ({
          ...prev,
          [selectedSubject]: {
            summary: insights.summary || '',
            strengths: insights.strengths || [],
            improvements: insights.improvements || [],
            generatedAt,
          },
        }));
        toast({ title: force ? 'Refreshed' : 'Summary ready', description: `Your ${selectedSubject} summary is up to date.` });
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to generate summary';
      toast({ title: 'Could not generate', description: msg, variant: 'destructive' });
    } finally {
      setSummaryLoading(false);
    }
  };

  const fetchResults = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('test_results').select(`
        *,
        tests(title, subject)
      `).eq('student_id', user.id).order('completed_at', { ascending: false });
    if (error) {
      console.error('Error fetching results:', error);
    } else {
      setTestResults(data || []);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({ title: "Logged out", description: "See you next time!" });
  };

  const handleEnterTestCode = async () => {
    if (!testCode.trim()) {
      toast({ title: "Error", description: "Please enter a test code", variant: "destructive" });
      return;
    }
    if (testCode.length !== 6) {
      toast({ title: "Error", description: "Test code must be 6 characters", variant: "destructive" });
      return;
    }

    const { data: test, error } = await supabase.from('tests').select('*').eq('test_code', testCode.toUpperCase()).eq('is_active', true).single();
    if (error || !test) {
      toast({ title: "Error", description: "Invalid test code", variant: "destructive" });
      return;
    }

    const hasAlreadyTaken = testResults.some(r => r.test_id === test.id);
    if (hasAlreadyTaken) {
      toast({
        title: "Already Taken",
        description: "You have already completed this test. Use the Retry button in History to practice again.",
        variant: "destructive"
      });
      return;
    }

    localStorage.setItem('currentTest', JSON.stringify({ ...test, isRetake: false }));
    navigate('/assessment');
  };

  const handleRetakeTest = async (testId: string) => {
    const { data: test, error } = await supabase
      .from('tests')
      .select('*')
      .eq('id', testId)
      .eq('is_active', true)
      .single();

    if (error || !test) {
      toast({ title: "Error", description: "Test not available", variant: "destructive" });
      return;
    }

    localStorage.setItem('currentTest', JSON.stringify({ ...test, isRetake: true }));
    navigate('/assessment');
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>;
  }
  if (!user) return null;

  // Filter out retakes for stats calculations
  const firstAttemptResults = testResults.filter(r => !r.is_retake);

  // Calculate stats per subject (excluding retakes)
  const getSubjectStats = (subject: Subject) => {
    const relevantFirstAttempts = subject === 'All Subjects' 
      ? firstAttemptResults 
      : firstAttemptResults.filter(r => r.tests?.subject === subject);
    const testsTaken = relevantFirstAttempts.length;
    
    // Get recent results (including retakes) for recent scores - show more
    const allRelevant = subject === 'All Subjects'
      ? testResults
      : testResults.filter(r => r.tests?.subject === subject);
    
    // Group by test_id to compute attempt numbers
    const attemptMap = new Map<string, number>();
    const testGroups: Record<string, any[]> = {};
    allRelevant.forEach(r => {
      if (!testGroups[r.test_id]) testGroups[r.test_id] = [];
      testGroups[r.test_id].push(r);
    });
    Object.values(testGroups).forEach(group => {
      group.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
      group.forEach((r, idx) => attemptMap.set(r.id, idx + 1));
    });
    
    const recentScores = [...allRelevant]
      .sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
      .slice(0, 8)
      .map(r => ({ 
        title: r.tests?.title || 'Test', 
        score: r.score, 
        attemptNumber: attemptMap.get(r.id) || 1
      }));
    return { testsTaken, recentScores };
  };

  const currentSubjectStats = getSubjectStats(selectedSubject);

  // Prepare score data with test names and attempt numbers
  const prepareScoreData = () => {
    const groupedByTest: Record<string, any[]> = {};
    testResults.forEach(r => {
      const testId = r.test_id;
      if (!groupedByTest[testId]) groupedByTest[testId] = [];
      groupedByTest[testId].push(r);
    });

    const allWithAttempts = Object.entries(groupedByTest).flatMap(([_, results]) => {
      const sorted = results.sort((a, b) => 
        new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()
      );
      return sorted.map((r, idx) => ({
        ...r,
        attemptNumber: idx + 1
      }));
    });

    return allWithAttempts
      .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
      .slice(-10)
      .map(r => ({
        name: `${(r.tests?.title || 'Test').substring(0, 10)}${r.attemptNumber > 1 ? ` (#${r.attemptNumber})` : ''}`,
        fullName: `${r.tests?.title || 'Test'} (Attempt ${r.attemptNumber})`,
        score: r.score || 0
      }));
  };

  const scoreData = prepareScoreData();

  // Calculate overall stats (for performance charts - all attempts for trend visibility)
  const totalCorrect = testResults.reduce((sum, r) => sum + (r.correct_answers || 0), 0);
  const totalWrong = testResults.reduce((sum, r) => sum + (r.wrong_answers || 0), 0);
  const totalQuestions = testResults.reduce((sum, r) => sum + (r.total_questions || 0), 0);
  const subjectData = Object.entries(firstAttemptResults.reduce((acc: any, r) => {
    const subject = r.tests?.subject || 'Unknown';
    acc[subject] = (acc[subject] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted-foreground))'];
  
  const renderSection = () => {
    switch (activeSection) {
      case "performance":
        // Group test results by test_id and assign attempt numbers
        const groupedResults: { [key: string]: any[] } = {};
        testResults.forEach((result) => {
          const testId = result.test_id;
          if (!groupedResults[testId]) groupedResults[testId] = [];
          groupedResults[testId].push(result);
        });
        
        const resultsWithAttempts = Object.entries(groupedResults).flatMap(([testId, results]) => {
          const sorted = results.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime());
          return sorted.map((result, index) => ({
            ...result,
            attemptNumber: index + 1,
            totalAttempts: sorted.length
          }));
        }).sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime());

        const handleExpandResult = async (resultId: string, testId: string, difficultyLevel: string | null) => {
          if (expandedResult === resultId) {
            setExpandedResult(null);
            setExpandedQuestions([]);
            return;
          }
          setExpandedResult(resultId);
          // Use SECURITY DEFINER RPC — only returns correct_answer for tests
          // the student has actually completed (which is true here since
          // we're viewing their result row).
          const { data: questionsRaw } = await (supabase as any)
            .rpc('get_review_questions', { _test_id: testId });
          let questions = ((questionsRaw as any[]) ?? []).filter((q: any) => q.difficulty !== 'practice');
          if (difficultyLevel) {
            questions = questions.filter((q: any) => q.difficulty === difficultyLevel);
          }
          setExpandedQuestions(questions);
        };

        return <div className="space-y-6 animate-fade-in">
            <Card className="cloud-bubble p-6">
              <h3 className="text-xl font-semibold mb-2">Performance by Test</h3>
              <p className="text-muted-foreground text-sm mb-4">Click a test to view questions. Use Retry to practice again.</p>
              {resultsWithAttempts.length > 0 ? (
                <div className="space-y-3">
                  {resultsWithAttempts.map((result, idx) => {
                    const accuracy = result.total_questions > 0 
                      ? ((result.correct_answers || 0) / result.total_questions * 100).toFixed(1)
                      : 0;
                    const isExpanded = expandedResult === result.id;
                    const resultAnswers = (result.answers || {}) as Record<string, string>;
                    return (
                      <div key={idx} className="bg-muted/30 rounded-xl overflow-hidden">
                        <div 
                          className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                          onClick={() => handleExpandResult(result.id, result.test_id, result.difficulty_level)}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex items-center gap-2">
                              {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                              <div>
                                <p className="font-semibold">
                                  {result.tests?.title || 'Assessment'} - Attempt {result.attemptNumber}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(result.completed_at).toLocaleDateString()} • {result.tests?.subject || 'General'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-2xl font-bold text-primary">{result.score}%</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-3">
                            <div className="p-2 bg-success/10 rounded-lg text-center">
                              <p className="text-xs text-muted-foreground">Correct</p>
                              <p className="font-bold text-success">{result.correct_answers || 0}</p>
                            </div>
                            <div className="p-2 bg-destructive/10 rounded-lg text-center">
                              <p className="text-xs text-muted-foreground">Wrong</p>
                              <p className="font-bold text-destructive">{result.wrong_answers || 0}</p>
                            </div>
                            <div className="p-2 bg-primary/10 rounded-lg text-center">
                              <p className="text-xs text-muted-foreground">Accuracy</p>
                              <p className="font-bold text-primary">{accuracy}%</p>
                            </div>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="border-t border-border p-4 space-y-4">
                            <div className="flex gap-2">
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); setSelectedResult({ id: result.id, testId: result.test_id }); setActiveSection("result-detail"); }}
                                className="gap-1 rounded-xl"
                              >
                                <Eye className="h-4 w-4" />
                                Full Review
                              </Button>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={(e) => { e.stopPropagation(); handleRetakeTest(result.test_id); }}
                                className="gap-1 rounded-xl"
                              >
                                <RotateCcw className="h-4 w-4" />
                                Retry
                              </Button>
                            </div>
                             {expandedQuestions.length > 0 && (() => {
                               const metrics = calculateResultMetrics(expandedQuestions, resultAnswers);

                               return (
                               <>
                               <div className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground">Questions:</p>
                                 {expandedQuestions.map((q, qIdx) => {
                                   const studentAnswer = getStoredAnswer(resultAnswers, q, qIdx);
                                   const isCorrect = studentAnswer === q.correct_answer;
                                  return (
                                    <div key={q.id} className={`p-3 rounded-lg text-sm ${isCorrect ? 'bg-success/10' : 'bg-destructive/10'}`}>
                                      <div className="flex items-start gap-2">
                                        {isCorrect ? <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />}
                                        <div className="flex-1">
                                          <p className="font-medium">Q{qIdx + 1}: {q.question_text.substring(0, 100)}{q.question_text.length > 100 ? '...' : ''}</p>
                                          <p className="text-xs text-muted-foreground mt-1">
                                             Your answer: {studentAnswer || 'Not answered'} • Correct: {q.correct_answer}
                                          </p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                              
                               <div className="grid grid-cols-3 gap-3 pt-2">
                                 <div className="p-2 bg-success/10 rounded-lg text-center">
                                   <p className="text-xs text-muted-foreground">Reviewed Correct</p>
                                   <p className="font-bold text-success">{metrics.correctAnswers}</p>
                                 </div>
                                 <div className="p-2 bg-destructive/10 rounded-lg text-center">
                                   <p className="text-xs text-muted-foreground">Reviewed Wrong</p>
                                   <p className="font-bold text-destructive">{metrics.wrongAnswers}</p>
                                 </div>
                                 <div className="p-2 bg-primary/10 rounded-lg text-center">
                                   <p className="text-xs text-muted-foreground">Reviewed Score</p>
                                   <p className="font-bold text-primary">{metrics.score}%</p>
                                 </div>
                               </div>
                               </>
                               );
                             })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No test data yet. Take a test to see your performance!</p>
              )}
            </Card>

            {/* Charts */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card className="cloud-bubble p-6">
                <h3 className="text-lg font-semibold mb-4">Score Trend</h3>
                {scoreData.length > 0 ? <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={scoreData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                      <RechartsTooltip contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem'
                  }} formatter={(value: any, name: any, props: any) => [`${value}%`, props.payload.fullName]} />
                      <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{
                    fill: 'hsl(var(--primary))'
                  }} />
                    </LineChart>
                  </ResponsiveContainer> : <p className="text-muted-foreground text-center py-8">No data yet</p>}
              </Card>

              <Card className="cloud-bubble p-6">
                <h3 className="text-lg font-semibold mb-4">Tests by Subject</h3>
                {subjectData.length > 0 ? <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={subjectData} cx="50%" cy="50%" labelLine={false} label={entry => entry.name} outerRadius={80} fill="#8884d8" dataKey="value">
                        {subjectData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip />
                    </PieChart>
                  </ResponsiveContainer> : <p className="text-muted-foreground text-center py-8">No data yet</p>}
              </Card>
            </div>
          </div>;
      case "result-detail":
        if (!selectedResult) return null;
        return <StudentResultDetail 
          resultId={selectedResult.id} 
          testId={selectedResult.testId} 
          onBack={() => setActiveSection("performance")} 
        />;
      case "profile":
        return <Card className="cloud-bubble p-8 animate-fade-in">
            <h3 className="text-xl font-semibold mb-2">Your Profile</h3>
            <p className="text-muted-foreground text-sm mb-6">Personal information</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Email</p>
                  <p className="text-lg font-semibold mt-1">{user.email}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Full Name</p>
                  <p className="text-lg font-semibold mt-1">{profile?.full_name || 'Not set'}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Grade & Class</p>
                  <p className="text-lg font-semibold mt-1">{profile?.grade || '-'}-{profile?.class || '-'}</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Gender</p>
                  <p className="text-lg font-semibold mt-1">{profile?.gender || 'Not set'}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Age</p>
                  <p className="text-lg font-semibold mt-1">{profile?.age ? `${profile.age} years` : 'Not set'}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-xl">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Student ID</p>
                  <p className="text-lg font-semibold mt-1">{profile?.student_id || 'Not set'}</p>
                </div>
                <div className="p-4 bg-primary/10 rounded-xl">
                  <p className="text-xs text-primary uppercase tracking-wide">Tests Taken</p>
                  <p className="text-lg font-semibold mt-1 text-primary">{firstAttemptResults.length}</p>
                </div>
              </div>
            </div>
          </Card>;
      default:
        return null;
    }
  };
  return <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10">
      <div className="container mx-auto p-6 max-w-6xl">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden shadow-md border-2 border-primary/20">
              <img src={sckoolLogo} alt="Sckool Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-foreground">
                {activeSection === "home" ? "Student Dashboard" : activeSection === "performance" ? "Performance" : "Profile"}
              </h1>
              <p className="text-muted-foreground">Welcome back, {profile?.full_name || 'Student'}!</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} className="rounded-xl">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Back button when in a section */}
        {activeSection !== "home" && <button onClick={() => setActiveSection("home")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to Dashboard</span>
          </button>}

        {activeSection === "home" ? <>
            {/* Test Code Entry */}
            <Card className="cloud-bubble p-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Code className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-2">Enter Test Code</h3>
                  <div className="flex gap-3 flex-wrap sm:flex-nowrap">
                    <Input placeholder="Enter 6-letter code (e.g., E1A2B3)" value={testCode} onChange={e => setTestCode(e.target.value.toUpperCase())} className="input-glassy uppercase text-lg tracking-wider" maxLength={6} />
                    <Button onClick={handleEnterTestCode} className="nav-btn-next px-8 whitespace-nowrap">
                      Start Test
                    </Button>
                  </div>
                </div>
              </div>
            </Card>

            {/* Subject Stats Switcher */}
            <Card className="cloud-bubble p-5 mb-10">
              <div className="flex flex-col gap-4">
                {/* Subject Dropdown */}
                <Select value={selectedSubject} onValueChange={(val) => setSelectedSubject(val as Subject)}>
                  <SelectTrigger className="w-full sm:w-64 rounded-xl">
                    <SelectValue placeholder="Select subject" />
                  </SelectTrigger>
                  <SelectContent>
                    {SUBJECTS.map((subject) => (
                      <SelectItem key={subject} value={subject}>{subject}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Stats Display */}
                {currentSubjectStats.testsTaken === 0 ? (
                  <div className="flex items-center justify-center p-6 bg-muted/30 rounded-xl">
                    <p className="text-muted-foreground text-center">No {selectedSubject} tests taken.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                    <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl h-full">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <BookOpen className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Tests Taken</p>
                        <p className="text-3xl font-bold">{currentSubjectStats.testsTaken}</p>
                      </div>
                    </div>

                    <div className="p-4 bg-muted/30 rounded-xl h-full flex flex-col justify-center">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                          <TrendingUp className="h-5 w-5 text-secondary" />
                        </div>
                        <p className="text-xs text-muted-foreground">Recent Scores</p>
                      </div>
                      <TooltipProvider>
                        <div className="flex gap-2 items-center flex-wrap">
                          {currentSubjectStats.recentScores.map((r, i) => (
                            <Tooltip key={i}>
                              <TooltipTrigger asChild>
                                <span className={`text-base font-bold px-3 py-1.5 rounded-lg cursor-default ${
                                  r.score >= 75 ? 'bg-success/15 text-success' : 
                                  r.score >= 50 ? 'bg-warning/15 text-warning' : 
                                  'bg-destructive/15 text-destructive'
                                }`}>
                                  {r.score}%
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{r.title}</p>
                                <p className="text-xs text-muted-foreground">Attempt {r.attemptNumber}</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TooltipProvider>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* AI Summary (per-subject, refresh once per day) */}
            {(() => {
              const cur = summaries[selectedSubject];
              const canRefresh = !cur?.generatedAt || (Date.now() - new Date(cur.generatedAt).getTime()) >= 24 * 60 * 60 * 1000;
              const lastRefreshed = cur?.generatedAt
                ? new Date(cur.generatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                : null;
              return (
                <Card className="cloud-bubble p-5 mb-10 ai-summary-card">
                  <button
                    type="button"
                    onClick={() => setSummaryOpen(o => !o)}
                    className="w-full flex items-center justify-between gap-3 text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-sm">
                        <Sparkles className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <p className="font-semibold">AI Summary — {selectedSubject}</p>
                        <p className="text-xs text-muted-foreground">
                          {cur ? `Last refreshed ${lastRefreshed}` : 'Strengths, weaknesses, and what to focus on next.'}
                        </p>
                      </div>
                    </div>
                    <ChevronDown
                      className={`h-5 w-5 text-muted-foreground transition-transform duration-300 ${summaryOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  <div
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${summaryOpen ? 'grid-rows-[1fr] opacity-100 mt-4' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="overflow-hidden">
                      {summaryLoading ? (
                        <div className="py-2">
                          <GeminiLoader
                            size="md"
                            message={`Analyzing your ${selectedSubject} performance...`}
                            subMessage="This usually takes a few seconds."
                          />
                        </div>
                      ) : !cur ? (
                        <div className="text-center py-6 space-y-3">
                          <p className="text-sm text-muted-foreground">No summary yet for {selectedSubject}.</p>
                          <Button onClick={() => handleGenerateSummary(false)} className="rounded-xl gap-2">
                            <Sparkles className="h-4 w-4" />
                            Generate AI Summary
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-4 ai-summary-content">
                          <div className="p-4 rounded-2xl bg-muted/40 border border-border/40">
                            <p className="text-sm leading-relaxed text-foreground whitespace-pre-line">{cur.summary}</p>
                          </div>
                          <div className="grid md:grid-cols-2 gap-4">
                            <div className="p-4 rounded-2xl bg-success/10 border border-success/20">
                              <p className="text-xs uppercase tracking-wide font-semibold text-success mb-2">Strengths</p>
                              {cur.strengths.length ? (
                                <ul className="space-y-1.5">
                                  {cur.strengths.map((s, i) => (
                                    <li key={i} className="text-sm flex gap-2">
                                      <CheckCircle className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                      <span>{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">None highlighted.</p>
                              )}
                            </div>
                            <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20">
                              <p className="text-xs uppercase tracking-wide font-semibold text-warning mb-2">Improve</p>
                              {cur.improvements.length ? (
                                <ul className="space-y-1.5">
                                  {cur.improvements.map((s, i) => (
                                    <li key={i} className="text-sm flex gap-2">
                                      <Target className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
                                      <span>{s}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-muted-foreground">None highlighted.</p>
                              )}
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGenerateSummary(true)}
                              disabled={!canRefresh || summaryLoading}
                              className="rounded-xl gap-2"
                              title={canRefresh ? 'Refresh summary' : 'You can refresh again in 24 hours'}
                            >
                              <RefreshCw className="h-4 w-4" />
                              {canRefresh ? 'Refresh' : 'Refresh available tomorrow'}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })()}

            {/* Navigation Bubbles */}
            <div className="grid grid-cols-2 gap-6">
              <div onClick={() => setActiveSection("performance")} className="nav-bubble group cursor-pointer">
                <ChartLine className="h-10 w-10 mb-3 text-primary group-hover:scale-110 transition-transform" />
                <p className="font-semibold">Performance</p>
                <p className="text-xs text-muted-foreground mt-1">Scores, Trends & History</p>
              </div>

              <div onClick={() => setActiveSection("profile")} className="nav-bubble group cursor-pointer">
                <User className="h-10 w-10 mb-3 text-accent group-hover:scale-110 transition-transform" />
                <p className="font-semibold">Profile</p>
                <p className="text-xs text-muted-foreground mt-1">Student Details</p>
              </div>
            </div>
          </> : renderSection()}
      </div>
    </div>;
};
export default NewStudentDashboard;
