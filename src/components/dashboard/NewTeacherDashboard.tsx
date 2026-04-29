import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { Upload, Users, TrendingUp, BarChart3, LogOut, Copy, PlusCircle, FolderOpen, ChartLine, ArrowLeft, Trash2, Edit, Eye, User, Radio } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { CreateTestWizard } from "@/components/teacher/CreateTestWizard";
import { TestEditor } from "@/components/teacher/TestEditor";
import { TestResultsPage } from "@/components/teacher/TestResultsPage";
import { StudentDetailPage } from "@/components/teacher/StudentDetailPage";
import { LiveSessionsMonitor } from "@/components/teacher/LiveSessionsMonitor";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import sckoolLogo from "@/assets/sckool-logo.jpeg";

type ActiveSection = "home" | "create" | "tests" | "students" | "test-results" | "student-detail" | "monitoring";
const NewTeacherDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, profile, signOut, loading } = useAuth();
  const [tests, setTests] = useState<any[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [allResults, setAllResults] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState<ActiveSection>("home");
  const [editingQuestionsTestId, setEditingQuestionsTestId] = useState<string | null>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [selectedTestId, setSelectedTestId] = useState<string | null>(null);
  const [selectedTestTitle, setSelectedTestTitle] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string>('');
  const [activeSessionsCount, setActiveSessionsCount] = useState(0);

  useEffect(() => {
    if (!loading && user) {
      fetchTests();
      fetchResults();
      fetchStudents();
      fetchActiveSessionsCount();
    }
  }, [user, loading]);

  const fetchActiveSessionsCount = async () => {
    if (!user) return;
    try {
      const { data: teacherTests } = await supabase
        .from('tests')
        .select('id')
        .eq('teacher_id', user.id);
      
      if (!teacherTests?.length) {
        setActiveSessionsCount(0);
        return;
      }
      
      const testIds = teacherTests.map(t => t.id);
      
      // Active = any session row exists for the teacher's tests (sessions are deleted on submit)
      const { count } = await supabase
        .from('test_sessions')
        .select('*', { count: 'exact', head: true })
        .in('test_id', testIds);
      
      setActiveSessionsCount(count || 0);
    } catch (error) {
      console.error('Error fetching active sessions count:', error);
    }
  };

  // Realtime subscription so the active count updates live
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('teacher-active-sessions')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'test_sessions' }, () => {
        fetchActiveSessionsCount();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);


  const fetchTests = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('tests').select('*').eq('teacher_id', user.id).order('created_at', { ascending: false });
    if (error) {
      console.error('Error fetching tests:', error);
      toast({ title: "Error", description: "Failed to load tests", variant: "destructive" });
    } else {
      setTests(data || []);
      // Fetch question counts in parallel for draft detection
      const ids = (data || []).map(t => t.id);
      if (ids.length > 0) {
        const counts: Record<string, number> = {};
        await Promise.all(ids.map(async (id) => {
          const { count } = await supabase
            .from('questions')
            .select('id', { count: 'exact', head: true })
            .eq('test_id', id);
          counts[id] = count || 0;
        }));
        setQuestionCounts(counts);
      }
    }
  };

  const fetchResults = async () => {
    if (!user) return;
    const { data, error } = await supabase.from('test_results').select(`
        *,
        tests!inner(teacher_id)
      `).eq('tests.teacher_id', user.id).eq('is_retake', false);
    if (error) {
      console.error('Error fetching results:', error);
    } else {
      setAllResults(data || []);
    }
  };

  const fetchStudents = async () => {
    const { data, error } = await supabase.from('profiles').select('*');
    if (!error && data) {
      setStudents(data);
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast({ title: "Logged out", description: "See you next time!" });
  };

  const copyTestCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({ title: "Copied!", description: "Test code copied to clipboard" });
  };

  const handleDeleteTest = async (testId: string) => {
    if (!window.confirm('Are you sure you want to delete this test? This action cannot be undone.')) {
      return;
    }
    const { error } = await supabase.from('tests').delete().eq('id', testId);
    if (error) {
      toast({ title: "Error", description: "Failed to delete test", variant: "destructive" });
    } else {
      setTests(tests.filter(t => t.id !== testId));
      toast({ title: "Test Deleted", description: "Test and all its questions have been deleted" });
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>;
  }
  if (!user) return null;

  // Analytics calculations
  const avgScore = allResults.length > 0 ? (allResults.reduce((sum, r) => sum + (r.score || 0), 0) / allResults.length).toFixed(1) : 0;
  const studentCount = new Set(allResults.map(r => r.student_id)).size;
  const genderPerformance = Object.entries(allResults.reduce((acc: any, r) => {
    const student = students.find((s: any) => s.user_id === r.student_id);
    const gender = student?.gender || 'Unknown';
    if (!acc[gender]) acc[gender] = { total: 0, count: 0 };
    acc[gender].total += r.score || 0;
    acc[gender].count += 1;
    return acc;
  }, {})).map(([gender, data]: [string, any]) => ({
    gender,
    avgScore: parseFloat((data.total / data.count).toFixed(1))
  }));
  const classPerformance = Object.entries(allResults.reduce((acc: any, r) => {
    const student = students.find((s: any) => s.user_id === r.student_id);
    const className = student ? `${student.grade}-${student.class}` : 'Unknown';
    if (!acc[className]) acc[className] = { total: 0, count: 0 };
    acc[className].total += r.score || 0;
    acc[className].count += 1;
    return acc;
  }, {})).map(([name, data]: [string, any]) => ({
    name,
    avgScore: parseFloat((data.total / data.count).toFixed(1))
  }));
  const performanceTrend = allResults.sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime()).slice(-10).map((r, i) => {
    const student = students.find(s => s.user_id === r.student_id);
    return {
      test: student?.full_name?.split(' ')[0] || `S${i + 1}`,
      score: r.score || 0,
      fullName: student?.full_name || 'Unknown'
    };
  });
  const difficultyDistribution = Object.entries(allResults.reduce((acc: any, r) => {
    const diff = r.difficulty_level || 'Unknown';
    acc[diff] = (acc[diff] || 0) + 1;
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));
  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

  // Determine which tests have been hosted (have at least one result)
  const hostedTestIds = new Set(allResults.map(r => r.test_id));

  // Render section content
  const renderSection = () => {
    switch (activeSection) {
      case "create":
        return <CreateTestWizard teacherId={user.id} onComplete={testCode => {
          fetchTests();
          setActiveSection("tests");
        }} onCancel={() => setActiveSection("home")} />;
      case "tests":
        if (editingQuestionsTestId) {
          return <TestEditor testId={editingQuestionsTestId} onClose={() => {
            setEditingQuestionsTestId(null);
            fetchTests();
          }} />;
        }
        return <Card className="cloud-bubble p-6 animate-fade-in">
            <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
              <div>
                <h3 className="text-xl font-semibold mb-1">My Tests</h3>
                <p className="text-muted-foreground text-sm">Create, manage, and review analytics for your tests</p>
              </div>
              <Button
                onClick={() => setActiveSection("create")}
                className="gap-2 rounded-xl h-11 px-5"
              >
                <PlusCircle className="h-4 w-4" />
                Create New Test
              </Button>
            </div>

            <div className="space-y-4">
               {tests.length === 0 ? (
                 <div className="text-center py-16 border border-dashed border-border rounded-2xl">
                   <FolderOpen className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
                   <p className="text-muted-foreground">No tests created yet.</p>
                   <p className="text-xs text-muted-foreground mt-1">Click "Create New Test" to get started.</p>
                 </div>
               ) : tests.map((test) => {
                 const testResults = allResults.filter(r => r.test_id === test.id);
                 const attemptCount = testResults.length;
                 const avgTestScore = attemptCount > 0
                   ? Math.round((testResults.reduce((sum, r) => sum + (r.score || 0), 0) / attemptCount) * 10) / 10
                   : null;
                 const avgTimeMinutes = attemptCount > 0
                   ? Math.round(testResults.reduce((sum, r) => sum + (r.time_spent || 0), 0) / attemptCount / 60)
                   : 0;
                 const isHosted = attemptCount > 0;
                 const qCount = questionCounts[test.id] ?? 0;
                 const isDraft = !isHosted && qCount === 0;

                 return (
                   <div
                     key={test.id}
                     className="p-5 bg-card border border-border/60 rounded-2xl hover:border-primary/40 hover:shadow-md transition-all"
                   >
                     {/* Header row */}
                     <div className="flex items-start justify-between gap-4 mb-4">
                       <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-2 mb-1 flex-wrap">
                           <h4 className="font-semibold text-foreground text-lg truncate">{test.title}</h4>
                           {isHosted && (
                             <Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-full text-[10px] uppercase tracking-wide">
                               Hosted
                             </Badge>
                           )}
                           {isDraft && (
                             <Badge variant="outline" className="border-accent text-accent rounded-full text-[10px] uppercase tracking-wide">
                               Draft
                             </Badge>
                           )}
                         </div>
                         {test.description && (
                           <p className="text-sm text-muted-foreground line-clamp-1">{test.description}</p>
                         )}
                         <p className="text-xs text-muted-foreground mt-1">
                           {test.subject} • {test.duration_minutes || 60} min
                           {test.target_grade ? ` • ${test.target_grade}${test.target_section ? '-' + test.target_section : ''}` : ''}
                           {' • '}{new Date(test.created_at).toLocaleDateString()}
                         </p>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                         <div className="text-right px-3 py-1.5 rounded-xl bg-primary/5 border border-primary/10">
                           <p className="text-base font-bold text-primary font-mono leading-tight">{test.test_code}</p>
                           <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Test Code</p>
                         </div>
                         <Button variant="ghost" size="icon" onClick={() => copyTestCode(test.test_code)} className="rounded-xl" title="Copy test code">
                           <Copy className="h-4 w-4" />
                         </Button>
                       </div>
                     </div>

                     {/* Stats strip */}
                     <div className="grid grid-cols-3 gap-3 mb-4">
                       <div className="p-3 bg-muted/40 rounded-xl">
                         <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Score</p>
                         <p className="text-lg font-semibold text-foreground">
                           {avgTestScore !== null ? `${avgTestScore}%` : '—'}
                         </p>
                       </div>
                       <div className="p-3 bg-muted/40 rounded-xl">
                         <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Attempts</p>
                         <p className="text-lg font-semibold text-foreground">{attemptCount}</p>
                       </div>
                       <div className="p-3 bg-muted/40 rounded-xl">
                         <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Avg Time</p>
                         <p className="text-lg font-semibold text-foreground">
                           {attemptCount > 0 ? `${avgTimeMinutes} min` : '—'}
                         </p>
                       </div>
                     </div>

                     {/* Action row */}
                     <div className="flex items-center justify-end gap-2 flex-wrap">
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() => setEditingQuestionsTestId(test.id)}
                         className="rounded-xl gap-2"
                       >
                         <Edit className="h-4 w-4" />
                         Edit
                       </Button>
                       <Button
                         variant="outline"
                         size="sm"
                         disabled={!isHosted}
                         onClick={() => {
                           setSelectedTestId(test.id);
                           setSelectedTestTitle(test.title);
                           setActiveSection("test-results");
                         }}
                         className="rounded-xl gap-2"
                         title={isHosted ? 'View results & analytics' : 'No attempts yet'}
                       >
                         <ChartLine className="h-4 w-4" />
                         View Results
                       </Button>
                       <Button
                         variant="outline"
                         size="sm"
                         onClick={() => handleDeleteTest(test.id)}
                         className="rounded-xl gap-2 text-destructive hover:text-destructive"
                       >
                         <Trash2 className="h-4 w-4" />
                         Delete
                       </Button>
                     </div>
                   </div>
                 );
               })}
            </div>
          </Card>;
      // analytics merged into "tests" tab — no standalone analytics view
      case "students":
        // Group results by student
        const studentMap = new Map<string, { student: any; results: any[] }>();
        allResults.forEach(result => {
          const student = students.find(s => s.user_id === result.student_id);
          if (!studentMap.has(result.student_id)) {
            studentMap.set(result.student_id, { student, results: [] });
          }
          studentMap.get(result.student_id)!.results.push(result);
        });
        
        const studentsList = Array.from(studentMap.entries()).map(([id, data]) => ({
          id,
          name: data.student?.full_name || 'Unknown Student',
          grade: data.student?.grade,
          class: data.student?.class,
          testsCompleted: data.results.length,
          avgScore: Math.round(data.results.reduce((sum, r) => sum + (r.score || 0), 0) / data.results.length),
          lastTest: data.results.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())[0]
        }));

        return <Card className="cloud-bubble p-6 animate-fade-in">
            <h3 className="text-xl font-semibold mb-2">Students</h3>
            <p className="text-muted-foreground text-sm mb-6">View detailed individual student performance</p>
            <div className="space-y-4">
              {studentsList.length === 0 ? <p className="text-muted-foreground text-center py-12">No student results yet</p> : studentsList.map((studentData, idx) => {
              return <div 
                key={idx} 
                className="p-5 bg-muted/30 rounded-2xl hover:bg-muted/50 transition-colors cursor-pointer"
                onClick={() => {
                  setSelectedStudentId(studentData.id);
                  setSelectedStudentName(studentData.name);
                  setActiveSection("student-detail");
                }}
              >
                      <div className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{studentData.name}</p>
                            <p className="text-sm text-muted-foreground mt-1">
                              {studentData.grade} - {studentData.class} • {studentData.testsCompleted} tests completed
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-2xl font-bold text-primary">{studentData.avgScore}%</p>
                            <p className="text-xs text-muted-foreground">Avg Score</p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="rounded-xl gap-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedStudentId(studentData.id);
                              setSelectedStudentName(studentData.name);
                              setActiveSection("student-detail");
                            }}
                          >
                            <Eye className="h-4 w-4" />
                            Details
                          </Button>
                        </div>
                      </div>
                    </div>;
            })}
            </div>
          </Card>;
      case "test-results":
        if (!selectedTestId) return null;
        return <TestResultsPage 
          testId={selectedTestId} 
          testTitle={selectedTestTitle}
          onBack={() => setActiveSection("tests")}
        />;
      case "student-detail":
        if (!selectedStudentId) return null;
        return <StudentDetailPage
          studentId={selectedStudentId}
          studentName={selectedStudentName}
          onBack={() => setActiveSection("students")}
        />;
      case "monitoring":
        return <LiveSessionsMonitor onBack={() => setActiveSection("home")} />;
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
                {activeSection === "home" ? "Teacher Dashboard" : 
                 activeSection === "create" ? "Create Test" : 
                 activeSection === "tests" ? "My Tests" : 
                 activeSection === "test-results" ? "Test Results" :
                 activeSection === "student-detail" ? "Student Details" :
                 activeSection === "monitoring" ? "Live Monitoring" :
                 "Students"}
              </h1>
              <p className="text-muted-foreground">Welcome, {profile?.full_name || 'Teacher'}!</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout} className="rounded-xl">
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>

        {/* Back button when in a section */}
        {activeSection !== "home" && <button onClick={() => {
          if (activeSection === "create") {
            setActiveSection("tests");
          } else {
            setActiveSection("home");
          }
        }} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="h-4 w-4" />
            <span className="text-sm">Back to {activeSection === "create" ? "My Tests" : "Dashboard"}</span>
          </button>}

        {activeSection === "home" ? <>
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
              <Card className="cloud-bubble p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Upload className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tests Created</p>
                    <p className="text-2xl font-bold">{tests.length}</p>
                  </div>
                </div>
              </Card>
              <Card className="cloud-bubble p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center flex-shrink-0">
                    <Users className="h-5 w-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Students</p>
                    <p className="text-2xl font-bold">{studentCount}</p>
                  </div>
                </div>
              </Card>
              <Card className="cloud-bubble p-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                    <Radio className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Sessions</p>
                    <p className="text-2xl font-bold">{activeSessionsCount}</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Navigation Bubbles */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
              <div onClick={() => setActiveSection("tests")} className="nav-bubble group cursor-pointer">
                <FolderOpen className="h-10 w-10 mb-3 text-primary group-hover:scale-110 transition-transform" />
                <p className="font-semibold">My Tests</p>
                <p className="text-xs text-muted-foreground mt-1">Create, manage & view analytics</p>
              </div>

              <div onClick={() => setActiveSection("students")} className="nav-bubble group cursor-pointer">
                <Users className="h-10 w-10 mb-3 text-primary group-hover:scale-110 transition-transform" />
                <p className="font-semibold">Students</p>
                <p className="text-xs text-muted-foreground mt-1">Individual Student Performance</p>
              </div>

              <div onClick={() => setActiveSection("monitoring")} className="nav-bubble group cursor-pointer relative">
                <Radio className="h-10 w-10 mb-3 text-success group-hover:scale-110 transition-transform" />
                {activeSessionsCount > 0 && (
                  <div className="absolute top-2 right-2 w-6 h-6 bg-success text-success-foreground rounded-full flex items-center justify-center text-xs font-bold animate-pulse">
                    {activeSessionsCount}
                  </div>
                )}
                <p className="font-semibold">Live Monitoring</p>
                <p className="text-xs text-muted-foreground mt-1">Watch Active Test Sessions</p>
              </div>
            </div>
          </> : renderSection()}
      </div>
    </div>;
};
export default NewTeacherDashboard;
