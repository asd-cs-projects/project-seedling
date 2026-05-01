import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { MediaDisplay } from "@/components/ui/media-display";
import { Clock, BookOpen, ChevronLeft, ChevronRight, Flag, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getStoredAnswer } from "@/lib/utils";

interface Question {
  id: string;
  test_id: string;
  passage_id?: string | null;
  question_type: string;
  difficulty: string;
  question_text: string;
  options: string[] | null;
  correct_answer: string;
  marks: number;
  order_index: number;
  media_url?: string | null;
  media_type?: string | null;
  passage_text?: string | null;
  passage_title?: string | null;
}

const AssessmentInterface = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string>("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [timeRemaining, setTimeRemaining] = useState(3600);
  const [testData, setTestData] = useState<any>(null);
  const [testId, setTestId] = useState<string>('');
  const [isRetake, setIsRetake] = useState(false);
  
  const [assignedLevel, setAssignedLevel] = useState<"basic" | "easy" | "medium" | "hard" | null>(null);
  const [practiceComplete, setPracticeComplete] = useState(false);
  const [practiceScore, setPracticeScore] = useState(0);
  const [isSingleDifficulty, setIsSingleDifficulty] = useState(false);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [markedForReview, setMarkedForReview] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [fiveMinWarningShown, setFiveMinWarningShown] = useState(false);
  const [teacherEndedTest, setTeacherEndedTest] = useState(false);

  // Auto-save state to database
  const saveSession = useCallback(async () => {
    if (!user || !testId) return;
    
    try {
      await supabase
        .from('test_sessions')
        .upsert({
          test_id: testId,
          student_id: user.id,
          answers,
          current_question: currentQuestionIndex,
          time_remaining: timeRemaining,
          marked_for_review: Array.from(markedForReview),
          difficulty_level: assignedLevel,
          practice_complete: practiceComplete,
          last_saved_at: new Date().toISOString(),
        }, {
          onConflict: 'test_id,student_id'
        });
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }, [user, testId, answers, currentQuestionIndex, timeRemaining, markedForReview, assignedLevel, practiceComplete]);

  // Save on visibility change and before unload
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        saveSession();
      }
    };

    const handleBeforeUnload = () => {
      saveSession();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Auto-save every 30 seconds
    const autoSaveInterval = setInterval(saveSession, 30000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      clearInterval(autoSaveInterval);
    };
  }, [saveSession]);

  // Listen for teacher ending the test (session deletion)
  useEffect(() => {
    if (!user || !testId) return;

    const channel = supabase
      .channel(`test_session:${user.id}:${testId}`)
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'test_sessions',
          filter: `student_id=eq.${user.id}`,
        },
        (payload) => {
          // Teacher deleted the session — show interstitial
          console.log('Session deleted by teacher:', payload);
          setTeacherEndedTest(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, testId]);

  // Auto-redirect after teacher ends test
  useEffect(() => {
    if (!teacherEndedTest) return;
    const timer = setTimeout(() => {
      localStorage.removeItem('currentTest');
      navigate('/student/dashboard');
    }, 5000);
    return () => clearTimeout(timer);
  }, [teacherEndedTest, navigate]);

  useEffect(() => {
    initializeTest();
  }, []);

  useEffect(() => {
    if (testData && testId) {
      loadQuestions();
    }
  }, [testData, testId]);

  useEffect(() => {
    if (testData?.duration_minutes && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            // Auto-submit and tag the attempt as Timed Out
            handleSubmit('timed_out');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [testData]);

  // 5-minute warning toast
  useEffect(() => {
    if (timeRemaining <= 300 && timeRemaining > 0 && !fiveMinWarningShown && practiceComplete) {
      toast({
        title: "⏱️ 5 Minutes Remaining!",
        description: "Please start wrapping up your answers.",
        duration: 10000,
      });
      setFiveMinWarningShown(true);
    }
  }, [timeRemaining, fiveMinWarningShown, practiceComplete, toast]);

  const initializeTest = async () => {
    try {
      const testDataStr = localStorage.getItem("currentTest");

      if (!testDataStr) {
        toast({ title: "Error", description: "Missing test data", variant: "destructive" });
        navigate("/student/dashboard");
        return;
      }

      const test = JSON.parse(testDataStr);
      setTestData(test);
      setTestId(test.id);
      setIsRetake(test.isRetake || false);
      setTimeRemaining(test.duration_minutes * 60);

      // Check for existing session
      if (user) {
        const { data: session } = await supabase
          .from('test_sessions')
          .select('*')
          .eq('test_id', test.id)
          .eq('student_id', user.id)
          .single();

        if (session) {
          setAnswers((session.answers as Record<string, string>) || {});
          const restoredQuestions = questions;
          const restoredAnswer = restoredQuestions.length
            ? getStoredAnswer(session.answers, restoredQuestions[session.current_question || 0], session.current_question || 0)
            : '';
          setSelectedAnswer(restoredAnswer || '');
          setCurrentQuestionIndex(session.current_question || 0);
          setTimeRemaining(session.time_remaining || test.duration_minutes * 60);
          setMarkedForReview(new Set((session.marked_for_review as number[]) || []));
          setAssignedLevel(session.difficulty_level as any);
          setPracticeComplete(session.practice_complete || false);
          toast({ title: "Session Restored", description: "Continuing from where you left off" });
        }
      }
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load test", variant: "destructive" });
      navigate("/student/dashboard");
    }
  };

  // Group questions by passage and shuffle groups (not individual questions within groups)
  const groupAndShuffleQuestions = (questionsToGroup: Question[]): Question[] => {
    const passageGroups = new Map<string, Question[]>();
    const standaloneQuestions: Question[] = [];

    questionsToGroup.forEach(q => {
      if (q.passage_id) {
        const group = passageGroups.get(q.passage_id) || [];
        group.push(q);
        passageGroups.set(q.passage_id, group);
      } else {
        standaloneQuestions.push(q);
      }
    });

    passageGroups.forEach((group) => {
      group.sort((a, b) => a.order_index - b.order_index);
    });

    const groupsArray = Array.from(passageGroups.values());
    for (let i = groupsArray.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [groupsArray[i], groupsArray[j]] = [groupsArray[j], groupsArray[i]];
    }

    for (let i = standaloneQuestions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [standaloneQuestions[i], standaloneQuestions[j]] = [standaloneQuestions[j], standaloneQuestions[i]];
    }

    const result: Question[] = [];
    groupsArray.forEach(group => result.push(...group));
    result.push(...standaloneQuestions);

    return result;
  };

  const loadQuestions = async () => {
    setLoading(true);
    try {
      // Fetch questions WITHOUT correct_answer via SECURITY DEFINER RPC.
      // Students never see the answer key client-side; scoring happens server-side.
      const { data: allQuestionsRaw, error } = await (supabase as any)
        .rpc('get_assessment_questions', { _test_id: testId });

      if (error) throw error;
      const allQuestions = (allQuestionsRaw as any[]) ?? [];

      if (!allQuestions || allQuestions.length === 0) {
        toast({ title: "Error", description: "No questions found for this test", variant: "destructive" });
        setLoading(false);
        return;
      }

      const { data: passagesData } = await supabase
        .from('passages')
        .select('*')
        .eq('test_id', testId);

      const passageMap = new Map(passagesData?.map(p => [p.id, p]) || []);

      const mappedQuestions = allQuestions.map((q: any) => ({
        ...q,
        // correct_answer is intentionally absent from the RPC payload; keep as empty string
        correct_answer: '',
        options: ((q.options as string[] | null) || []).slice(0, 4),
        passage_text: q.passage_id ? passageMap.get(q.passage_id)?.content : null,
        passage_title: q.passage_id ? passageMap.get(q.passage_id)?.title : null,
      })) as Question[];

      const availableDifficulties = [...new Set(mappedQuestions.map(q => q.difficulty))];
      const hasPractice = availableDifficulties.includes('practice');
      const nonPracticeDiffs = availableDifficulties.filter(d => d !== 'practice');
      
      setIsSingleDifficulty(nonPracticeDiffs.length === 1);
      
      if (!practiceComplete) {
        const practiceQs = mappedQuestions.filter(q => q.difficulty === 'practice');
        if (practiceQs.length > 0) {
          setQuestions(groupAndShuffleQuestions(practiceQs));
          setLoading(false);
          return;
        }
        setPracticeComplete(true);
        
        if (nonPracticeDiffs.length === 1) {
          setAssignedLevel(nonPracticeDiffs[0] as "easy" | "medium" | "hard");
        }
      }

      let level = assignedLevel;
      
      if (!level && nonPracticeDiffs.length === 1) {
        level = nonPracticeDiffs[0] as "easy" | "medium" | "hard";
        setAssignedLevel(level);
      } else if (!level) {
        level = 'easy';
      }
      
      let mainQs = mappedQuestions.filter(q => q.difficulty === level);
      
      if (mainQs.length === 0) {
        for (const diff of nonPracticeDiffs) {
          mainQs = mappedQuestions.filter(q => q.difficulty === diff);
          if (mainQs.length > 0) break;
        }
      }

      if (mainQs.length > 0) {
        setQuestions(groupAndShuffleQuestions(mainQs));
      } else {
        toast({ title: "Error", description: "No questions available", variant: "destructive" });
      }
      
      setLoading(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to load questions", variant: "destructive" });
      setLoading(false);
    }
  };

  // Practice score is computed server-side too — we no longer have correct_answer client-side
  const calculatePracticeScore = async (): Promise<number> => {
    try {
      const { data, error } = await (supabase as any).rpc('score_submission', {
        _test_id: testId,
        _difficulty: 'practice',
        _answers: answers,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row?.score ?? 0;
    } catch (e) {
      console.error('Practice scoring failed:', e);
      return 0;
    }
  };

  const assignDifficultyLevel = async (score: number, availableDifficulties: string[]) => {
    let targetLevel: "basic" | "easy" | "medium" | "hard" | null = null;

    const nonPracticeDiffs = availableDifficulties.filter(d => d !== 'practice');

    if (nonPracticeDiffs.length === 1) {
      targetLevel = nonPracticeDiffs[0] as any;
    } else {
      // New entry-level thresholds:
      // Basic: 0-20%, Easy: 20-50%, Medium: 50-80%, Hard: 80-100%
      if (score >= 80) targetLevel = "hard";
      else if (score >= 50) targetLevel = "medium";
      else if (score >= 20) targetLevel = "easy";
      else targetLevel = "basic";

      // Fall back to closest available level if target not present
      const order: ("basic" | "easy" | "medium" | "hard")[] = ["basic", "easy", "medium", "hard"];
      if (!nonPracticeDiffs.includes(targetLevel as string)) {
        const targetIdx = order.indexOf(targetLevel as any);
        let best: any = null;
        let bestDist = Infinity;
        for (const d of nonPracticeDiffs) {
          const idx = order.indexOf(d as any);
          if (idx < 0) continue;
          const dist = Math.abs(idx - targetIdx);
          if (dist < bestDist) { bestDist = dist; best = d; }
        }
        if (best) targetLevel = best;
      }
    }

    setAssignedLevel(targetLevel);
    setPracticeScore(score);
    setPracticeComplete(true);
    setIsSingleDifficulty(nonPracticeDiffs.length === 1);

    const levelLabel = nonPracticeDiffs.length === 1 ? 'General' : targetLevel?.toUpperCase();
    toast({
      title: "Practice Complete!",
      description: `You scored ${score}%. Starting ${levelLabel} level test.`,
      duration: 3000,
    });

    setAnswers({});
    setCurrentQuestionIndex(0);
    setSelectedAnswer("");
    setMarkedForReview(new Set());
    setFiveMinWarningShown(false);

    setLoading(true);
    const { data: allQuestionsRaw } = await (supabase as any)
      .rpc('get_assessment_questions', { _test_id: testId });
    const allQuestions = ((allQuestionsRaw as any[]) ?? []).filter((q: any) => q.difficulty === targetLevel);

    const { data: passagesData } = await supabase
      .from('passages')
      .select('*')
      .eq('test_id', testId);

    const passageMap = new Map(passagesData?.map(p => [p.id, p]) || []);

    if (allQuestions && allQuestions.length > 0) {
      const mapped = allQuestions.map((q: any) => ({
        ...q,
        correct_answer: '',
        options: ((q.options as string[] | null) || []).slice(0, 4),
        passage_text: q.passage_id ? passageMap.get(q.passage_id)?.content : null,
        passage_title: q.passage_id ? passageMap.get(q.passage_id)?.title : null,
      })) as Question[];
      setQuestions(groupAndShuffleQuestions(mapped));
    }
    setLoading(false);
  };

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswer(answer);
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) return;
    // Store ONLY by question id to prevent collisions across questions
    // (previous version also stored by index/order_index which caused cross-bleed
    // when different questions shared the same numeric index across difficulty tiers).
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handleNextQuestion = async () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer(getStoredAnswer(answers, questions[currentQuestionIndex + 1], currentQuestionIndex + 1) || "");
    } else {
      if (!practiceComplete) {
        const score = await calculatePracticeScore();
        const { data: allQuestions } = await (supabase as any)
          .rpc('get_assessment_questions', { _test_id: testId });
        
        const availableDifficulties = [...new Set(((allQuestions as any[]) || []).map((q: any) => q.difficulty))];
        assignDifficultyLevel(score, availableDifficulties);
      } else {
        handleSubmit();
      }
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      setSelectedAnswer(getStoredAnswer(answers, questions[currentQuestionIndex - 1], currentQuestionIndex - 1) || "");
    }
  };

  const handleSubmit = async (reason: 'completed' | 'timed_out' = 'completed') => {
    if (!practiceComplete) {
      const score = await calculatePracticeScore();
      const { data: allQs } = await (supabase as any)
        .rpc('get_assessment_questions', { _test_id: testId });
      
      const availableDiffs = [...new Set(((allQs as any[]) || []).map((q: any) => q.difficulty))];
      assignDifficultyLevel(score, availableDiffs);
      return;
    }

    const timeSpent = (testData?.duration_minutes * 60 || 3600) - timeRemaining;

    // Server-side scoring — students never see correct_answer client-side
    const { data: scoreData, error: scoreErr } = await (supabase as any).rpc('score_submission', {
      _test_id: testId,
      _difficulty: assignedLevel,
      _answers: answers,
    });
    if (scoreErr) {
      console.error('Scoring failed:', scoreErr);
      toast({ title: 'Error', description: 'Could not score your submission. Try again.', variant: 'destructive' });
      return;
    }
    const scoreRow = Array.isArray(scoreData) ? scoreData[0] : scoreData;
    const correctAnswers = scoreRow?.correct_answers ?? 0;
    const wrongAnswers = scoreRow?.wrong_answers ?? 0;
    const answeredQuestions = scoreRow?.total_questions ?? questions.length;
    const finalScore = scoreRow?.score ?? 0;

    if (user) {
      // Check if a first attempt already exists for this test (to handle the unique constraint)
      if (!isRetake) {
        const { data: existingResult } = await supabase
          .from('test_results')
          .select('id')
          .eq('test_id', testId)
          .eq('student_id', user.id)
          .eq('is_retake', false)
          .maybeSingle();

        if (existingResult) {
          // First attempt already exists — treat this as a retake
          console.log('First attempt already exists, saving as retake');
          const { data: insertedResult, error } = await supabase
            .from('test_results')
            .insert({
              test_id: testId,
              student_id: user.id,
              score: finalScore,
              correct_answers: correctAnswers,
              wrong_answers: wrongAnswers,
              total_questions: answeredQuestions,
              difficulty_level: assignedLevel,
              practice_score: practiceScore,
              time_spent: timeSpent,
              answers,
              is_retake: true,
              status: reason,
            } as any)
            .select()
            .single();

          if (error) {
            console.error('Error saving result:', error);
            toast({ title: 'Error', description: error.message || 'Failed to save your attempt.', variant: 'destructive' });
            return;
          }

          await supabase.from('test_sessions').delete().eq('test_id', testId).eq('student_id', user.id);
          localStorage.removeItem('currentTest');
          toast({ title: "Test Submitted!", description: `Your score: ${finalScore}%`, duration: 5000 });
          navigate("/student/dashboard");
          return;
        }
      }

      const { data: insertedResult, error } = await supabase
        .from('test_results')
        .insert({
          test_id: testId,
          student_id: user.id,
          score: finalScore,
          correct_answers: correctAnswers,
          wrong_answers: wrongAnswers,
          total_questions: answeredQuestions,
          difficulty_level: assignedLevel,
          practice_score: practiceScore,
          time_spent: timeSpent,
          answers,
          is_retake: isRetake,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving result:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to save your attempt. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      // Generate AI insights in the background (don't block navigation).
      // Insights function now fetches questions/answers server-side using its
      // service role + verifies the caller's JWT, so we no longer ship
      // correct_answer through the client.
      if (insertedResult && !isRetake) {
        supabase.functions.invoke('generate-insights', {
          body: {
            resultId: insertedResult.id,
            testTitle: testData?.title || 'Test',
            testSubject: testData?.subject || 'General',
          },
        }).catch(err => console.error('AI insights generation failed:', err));
      }

      // Delete the session since test is complete
      await supabase
        .from('test_sessions')
        .delete()
        .eq('test_id', testId)
        .eq('student_id', user.id);
    }

    // Clear localStorage
    localStorage.removeItem('currentTest');

    toast({
      title: "Test Submitted!",
      description: `Your score: ${finalScore}%`,
      duration: 5000,
    });

    navigate("/student/dashboard");
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleMarkForReview = () => {
    const newMarked = new Set(markedForReview);
    if (newMarked.has(currentQuestionIndex)) {
      newMarked.delete(currentQuestionIndex);
    } else {
      newMarked.add(currentQuestionIndex);
    }
    setMarkedForReview(newMarked);
  };

  // Teacher ended test interstitial
  if (teacherEndedTest) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
            <AlertTriangle className="h-10 w-10 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Test Ended by Teacher</h2>
          <p className="text-muted-foreground mb-6">
            Your teacher has ended this test session. You will be redirected to your dashboard shortly.
          </p>
          <div className="animate-pulse text-sm text-muted-foreground">Redirecting in a few seconds...</div>
          <Button
            variant="outline"
            className="mt-4 rounded-xl"
            onClick={() => {
              localStorage.removeItem('currentTest');
              navigate('/student/dashboard');
            }}
          >
            Go to Dashboard Now
          </Button>
        </div>
      </div>
    );
  }

  if (loading || !questions.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-lg text-muted-foreground">Loading assessment...</div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const hasPassage = currentQuestion.passage_text;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10">
      {/* Top Navigation Bar */}
      <div className="cloud-bubble-top sticky top-0 z-50 px-6 py-4 mb-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Timer */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Time Remaining</p>
              <p className={`text-xl font-bold font-mono ${timeRemaining < 300 ? 'text-destructive' : 'text-foreground'}`}>
                {formatTime(timeRemaining)}
              </p>
            </div>
          </div>

          {/* Question Navigation Bubbles */}
          <div className="flex gap-2 flex-wrap justify-center max-w-md">
            {questions.map((_, idx) => {
              const isAnswered = !!getStoredAnswer(answers, questions[idx], idx);
              const isCurrent = idx === currentQuestionIndex;
              const isMarked = markedForReview.has(idx);

              return (
                <button
                  key={idx}
                  onClick={() => {
                    setCurrentQuestionIndex(idx);
                    setSelectedAnswer(getStoredAnswer(answers, questions[idx], idx) || "");
                  }}
                  className={`question-nav-bubble ${
                    isCurrent ? 'active' : isAnswered ? 'answered' : 'unanswered'
                  } ${isMarked ? 'ring-2 ring-warning' : ''}`}
                  title={isMarked ? 'Marked for review' : ''}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Test Info — phase + difficulty badge */}
          <div className="text-right flex flex-col items-end gap-1.5">
            <p className="text-xs text-muted-foreground">
              {practiceComplete ? 'Main Test' : 'Practice Round'}
            </p>
            {practiceComplete && assignedLevel ? (
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full border-2 ${
                  isSingleDifficulty
                    ? 'bg-primary/10 text-primary border-primary/30'
                    : assignedLevel === 'easy'
                      ? 'bg-success/15 text-success border-success/30'
                      : assignedLevel === 'medium'
                        ? 'bg-warning/15 text-warning-foreground border-warning/40'
                        : 'bg-destructive/15 text-destructive border-destructive/30'
                }`}
                title="Your assigned difficulty level"
              >
                {isSingleDifficulty ? 'GENERAL' : `${assignedLevel.toUpperCase()} LEVEL`}
              </span>
            ) : (
              <span className="text-xs font-bold px-3 py-1.5 rounded-full bg-accent/15 text-accent border-2 border-accent/30">
                PRACTICE
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-6 pb-8">
        <div className={`grid ${hasPassage ? 'lg:grid-cols-[60%_40%]' : 'lg:grid-cols-1 max-w-3xl mx-auto'} gap-6`}>
          {/* Left Panel - Reading Passage (only show if passage exists) */}
          {hasPassage && (
            <div className="passage-bubble p-6">
              <div className="flex items-center gap-3 mb-4">
                <BookOpen className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-lg">
                  {currentQuestion.passage_title || 'Reading Passage'}
                </h3>
              </div>
              <div className="passage-text">
                {currentQuestion.passage_text}
              </div>
            </div>
          )}

          {/* Right Panel - Question & Answers */}
          <div className="space-y-6">
            {/* Question Card */}
            <div className="question-bubble">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground mb-2">
                  Question {currentQuestionIndex + 1} of {questions.length}
                </p>
                <h4 className="font-semibold text-lg text-foreground mb-2">
                  {currentQuestion.question_text}
                </h4>
                <p className="text-xs text-muted-foreground">
                  [{currentQuestion.marks} mark{currentQuestion.marks !== 1 ? 's' : ''}]
                </p>
              </div>

              {/* Media Display */}
              {currentQuestion.media_url && (
                <div className="mb-4">
                  <MediaDisplay
                    url={currentQuestion.media_url}
                    type={currentQuestion.media_type}
                    alt="Question media"
                    size="lg"
                  />
                </div>
              )}

              {/* Answer Options */}
              <div className="space-y-3">
                {currentQuestion.question_type === 'mcq' && currentQuestion.options && (
                  <>
                    {currentQuestion.options.slice(0, 4).map((option, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const isSelected = selectedAnswer === letter;

                      return (
                        <div
                          key={idx}
                          onClick={() => handleAnswerSelect(letter)}
                          className={`answer-card ${isSelected ? 'selected' : ''}`}
                        >
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                              isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                            }`}>
                              <span className="text-sm font-medium">{letter}</span>
                            </div>
                            <span className="text-foreground">{option}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between gap-4">
              <Button
                variant="outline"
                onClick={handlePrevQuestion}
                disabled={currentQuestionIndex === 0}
                className="rounded-xl"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>

              <Button
                variant="outline"
                onClick={toggleMarkForReview}
                className={`rounded-xl ${markedForReview.has(currentQuestionIndex) ? 'bg-warning/20 border-warning' : ''}`}
              >
                <Flag className={`h-4 w-4 mr-1 ${markedForReview.has(currentQuestionIndex) ? 'text-warning' : ''}`} />
                {markedForReview.has(currentQuestionIndex) ? 'Marked' : 'Mark for Review'}
              </Button>

              <Button
                onClick={handleNextQuestion}
                className="nav-btn-next"
              >
                {isLastQuestion ? (practiceComplete ? 'Submit Test' : 'Complete Practice') : 'Next'}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default AssessmentInterface;
