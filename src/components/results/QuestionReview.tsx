import { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, BookOpen, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MediaDisplay } from '@/components/ui/media-display';
import { getStoredAnswer } from '@/lib/utils';

interface Question {
  id: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  difficulty: string;
  media_url?: string;
  media_type?: string;
  passage_id?: string;
  explanation?: string | null;
  option_explanations?: Record<string, string> | null;
}

interface QuestionReviewProps {
  testId: string;
  answers: Record<number, string>;
  questions?: Question[];
  showReviewLinks?: boolean;
  difficultyFilter?: string | null;
  /** Set of question indices the student marked for review during the test */
  markedForReview?: number[] | null;
}

export const QuestionReview = ({ testId, answers, questions: providedQuestions, showReviewLinks = true, difficultyFilter, markedForReview }: QuestionReviewProps) => {
  const markedSet = new Set(markedForReview ?? []);
  const [questions, setQuestions] = useState<Question[]>(providedQuestions || []);
  const [loading, setLoading] = useState(!providedQuestions);
  const [expandedPassages, setExpandedPassages] = useState<Set<string>>(new Set());
  const [passages, setPassages] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!providedQuestions) {
      fetchQuestions();
    }
  }, [testId, providedQuestions, difficultyFilter]);

  const fetchQuestions = async () => {
    setLoading(true);
    try {
      // Use SECURITY DEFINER RPC — only callable for tests the caller is the
      // teacher of, OR has a completed result for. Returns correct_answer +
      // explanations after submission, never before.
      const { data: questionsData, error: questionsError } = await (supabase as any)
        .rpc('get_review_questions', { _test_id: testId });

      if (questionsError) throw questionsError;

      let filtered = (questionsData as any[]) ?? [];
      filtered = filtered.filter((q: any) => q.difficulty !== 'practice');
      if (difficultyFilter) {
        filtered = filtered.filter((q: any) => q.difficulty === difficultyFilter);
      }

      const { data: passagesData } = await supabase
        .from('passages')
        .select('*')
        .eq('test_id', testId);

      const passageMap: Record<string, any> = {};
      passagesData?.forEach(p => {
        passageMap[p.id] = p;
      });
      setPassages(passageMap);

      setQuestions((filtered.map((q: any) => ({
        ...q,
        options: (q.options as string[]) || [],
        option_explanations: (q.option_explanations as Record<string, string> | null) ?? null,
      })) as Question[]) || []);
    } catch (error) {
      console.error('Error fetching questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePassage = (passageId: string) => {
    setExpandedPassages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(passageId)) {
        newSet.delete(passageId);
      } else {
        newSet.add(passageId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const optionLabels = ['A', 'B', 'C', 'D'];

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold mb-4">Question Review</h3>
      
      {questions.map((question, idx) => {
        const studentAnswer = getStoredAnswer(answers, question, idx);
        const isCorrect = studentAnswer === question.correct_answer;
        const passage = question.passage_id ? passages[question.passage_id] : null;

        const isMarked = markedSet.has(idx);
        return (
          <Card
            key={question.id}
            className={`p-4 border-l-4 ${
              isMarked
                ? 'marked-review border-l-warning'
                : isCorrect
                  ? 'border-l-success bg-success/10'
                  : 'border-l-destructive bg-destructive/10'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                {isCorrect ? (
                  <CheckCircle className="h-5 w-5 text-success" />
                ) : (
                  <XCircle className="h-5 w-5 text-destructive" />
                )}
                <span className="font-semibold">Question {idx + 1}</span>
                <Badge variant="outline" className="text-xs">
                  {question.difficulty}
                </Badge>
                {isMarked && (
                  <Badge className="bg-warning text-warning-foreground text-xs">
                    Marked for Review
                  </Badge>
                )}
              </div>
              {!isCorrect && showReviewLinks && (
                <Button variant="outline" size="sm" className="gap-1 text-xs">
                  <BookOpen className="h-3 w-3" />
                  Review Topic
                </Button>
              )}
            </div>

            {/* Passage Section */}
            {passage && (
              <div className="mb-3">
                <button
                  onClick={() => togglePassage(passage.id)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {expandedPassages.has(passage.id) ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span>View Passage: {passage.title || 'Reading Passage'}</span>
                </button>
                {expandedPassages.has(passage.id) && (
                  <div className="mt-2 p-3 bg-muted/30 rounded-lg text-sm">
                    <p className="whitespace-pre-wrap">{passage.content}</p>
                  </div>
                )}
              </div>
            )}

            {/* Question Media */}
            {question.media_url && (
              <div className="mb-3">
                <MediaDisplay
                  url={question.media_url}
                  type={question.media_type as 'image' | 'audio' | 'video'}
                  alt="Question media"
                />
              </div>
            )}

            {/* Question Text */}
            <p className="mb-4 text-foreground">{question.question_text}</p>

            {/* Options */}
            <div className="space-y-2">
              {question.options.map((option, optIdx) => {
                const label = optionLabels[optIdx];
                const isStudentChoice = studentAnswer === label;
                const isCorrectAnswer = question.correct_answer === label;
                const optExplanation = question.option_explanations?.[label];

                let optionClass = 'p-3 rounded-lg border transition-colors ';
                
                  if (isCorrectAnswer) {
                    optionClass += 'bg-success/15 border-success';
                  } else if (isStudentChoice && !isCorrect) {
                    optionClass += 'bg-destructive/15 border-destructive';
                } else {
                  optionClass += 'bg-muted/20 border-transparent';
                }

                return (
                  <div key={optIdx} className={optionClass}>
                    <div className="flex items-center gap-3">
                      <span className={`font-semibold w-6 h-6 rounded-full flex items-center justify-center text-sm ${
                        isCorrectAnswer 
                          ? 'bg-success text-success-foreground' 
                          : isStudentChoice && !isCorrect 
                            ? 'bg-destructive text-destructive-foreground' 
                            : 'bg-muted text-muted-foreground'
                      }`}>
                        {label}
                      </span>
                      <span className={isCorrectAnswer ? 'font-medium' : ''}>{option}</span>
                      {isCorrectAnswer && (
                        <Badge className="ml-auto bg-success text-success-foreground text-xs">Correct</Badge>
                      )}
                      {isStudentChoice && !isCorrect && (
                        <Badge className="ml-auto bg-destructive text-destructive-foreground text-xs">Your Answer</Badge>
                      )}
                      {isStudentChoice && isCorrect && (
                        <Badge className="ml-auto bg-success text-success-foreground text-xs">Your Answer ✓</Badge>
                      )}
                    </div>
                    {optExplanation && (isCorrectAnswer || isStudentChoice) && (
                      <p className="mt-2 ml-9 text-xs text-foreground/75 leading-5">{optExplanation}</p>
                    )}
                  </div>
                );
              })}
            </div>

            {!studentAnswer && (
              <p className="mt-3 text-sm text-muted-foreground italic">Not answered</p>
            )}

            {/* Khan-style explanation */}
            {question.explanation && (
              <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <Lightbulb className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold text-primary">Explanation</span>
                </div>
                <p className="text-sm text-foreground/85 leading-6">{question.explanation}</p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};