import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GeminiLoader } from '@/components/ui/gemini-loader';
import { GlobalPassageManager } from './GlobalPassageManager';
import { QuestionBuilder } from './QuestionBuilder';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, ArrowRight, Check, FileText, Plus, Loader2, Sparkles, X, CheckCircle } from 'lucide-react';
import { useFileUpload } from '@/hooks/useFileUpload';


interface CreateTestWizardProps {
  teacherId: string;
  onComplete?: (testCode: string) => void;
  onCancel?: () => void;
}

export const CreateTestWizard = ({ teacherId, onComplete, onCancel }: CreateTestWizardProps) => {
  const { toast } = useToast();
  const [step, setStep] = useState<'basic' | 'questions'>('basic');
  const [testId, setTestId] = useState<string>('');
  const [testCode, setTestCode] = useState<string>('');
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [questionBuilderKey, setQuestionBuilderKey] = useState(0);
  const [materialOpenSignal, setMaterialOpenSignal] = useState(0);
  const [questionCount, setQuestionCount] = useState(0);
  
  // PDF extraction states
  const { uploadPDF, uploading: uploadingPdf } = useFileUpload();
  const [processingOCR, setProcessingOCR] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfProgressMessage, setPdfProgressMessage] = useState('');
  
  const [basicInfo, setBasicInfo] = useState({
    title: '',
    subject: '',
    duration_minutes: 60,
    description: '',
    target_grade: '',
    target_section: '',
    adaptive_mode: false,
    groups_per_student: 4,
  });

  // Poll the questions count whenever step is 'questions' so the cancel
  // warning knows whether the teacher already added work.
  useEffect(() => {
    if (step !== 'questions' || !testId) return;
    let cancelled = false;
    const fetchCount = async () => {
      const { count } = await supabase
        .from('questions')
        .select('id', { count: 'exact', head: true })
        .eq('test_id', testId);
      if (!cancelled) setQuestionCount(count || 0);
    };
    fetchCount();
    const t = setInterval(fetchCount, 4000);
    return () => { cancelled = true; clearInterval(t); };
  }, [step, testId, questionBuilderKey, extractedQuestions.length]);

  const handleCancel = () => {
    if (step === 'questions' && questionCount > 0) {
      const ok = window.confirm(
        `Heads up: this test will not be created/hosted. It will be saved as a draft with ${questionCount} question${questionCount === 1 ? '' : 's'}, and you can finish it later from My Tests. Leave now?`
      );
      if (!ok) return;
    }
    onCancel?.();
  };

  const generateTestCode = (subject: string) => {
    const prefix = subject === 'English' ? 'E' : subject === 'Science' ? 'S' : subject === 'Social Studies' ? 'SS' : 'M';
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    const codeLength = prefix.length === 2 ? 4 : 5; // Keep total at 6 chars
    for (let i = 0; i < codeLength; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleBasicInfoNext = async () => {
    if (!basicInfo.title || !basicInfo.subject) {
      toast({ title: 'Error', description: 'Please fill in all required fields', variant: 'destructive' });
      return;
    }

    if (!teacherId) {
      toast({ title: 'Error', description: 'Teacher not found', variant: 'destructive' });
      return;
    }

    const code = generateTestCode(basicInfo.subject);
    
    // Save to Supabase
    const { data, error } = await supabase
      .from('tests')
      .insert({
        test_code: code,
        title: basicInfo.title,
        subject: basicInfo.subject,
        duration_minutes: basicInfo.duration_minutes,
        description: basicInfo.description || null,
        target_grade: basicInfo.target_grade || null,
        target_section: basicInfo.target_section || null,
        teacher_id: teacherId,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    setTestId(data.id);
    setTestCode(code);
    toast({ title: 'Success', description: 'Test created! Now add questions.' });
    setStep('questions');
  };

  // PDF extraction handler
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !testId) return;

    if (!file.type.includes('pdf')) {
      toast({ title: 'Error', description: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }

    setProcessingOCR(true);
    setPdfProgress(0);
    setPdfProgressMessage('Uploading PDF...');

    try {
      // Upload PDF first
      setPdfProgress(10);
      const url = await uploadPDF(file, testId, 'questions');
      if (!url) throw new Error('Failed to upload PDF');

      setPdfProgress(30);
      setPdfProgressMessage('Reading PDF content...');

      // Step 1: OCR Extract — encode the original File directly (bucket is private)
      if (file.size === 0) throw new Error('PDF file is empty');

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setPdfProgress(50);
      setPdfProgressMessage('Extracting text with AI...');

      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('pdf-ocr', {
        body: { 
          pdfBase64: base64,
          mimeType: 'application/pdf',
          extractImages: true
        }
      });

      if (ocrError) throw ocrError;
      if (!ocrData?.text) throw new Error('No text extracted from PDF');

      setPdfProgress(75);
      setPdfProgressMessage('Parsing questions...');

      // Step 2: Parse Questions
      const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-questions', {
        body: { 
          extractedText: ocrData.text,
          difficulty: 'easy',
          images: ocrData.images || []
        }
      });

      if (parseError) throw parseError;

      setPdfProgress(100);
      setPdfProgressMessage('Complete!');

      if (parseData?.questions && parseData.questions.length > 0) {
        setExtractedQuestions(parseData.questions);
        toast({ 
          title: 'Questions Extracted!', 
          description: `Found ${parseData.questions.length} questions. Select difficulty level and save.`
        });
      } else {
        toast({ 
          title: 'No Questions Found', 
          description: 'Could not identify MCQ questions in the PDF.',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Extract error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to process PDF', 
        variant: 'destructive' 
      });
    } finally {
      setProcessingOCR(false);
      setPdfProgress(0);
      setPdfProgressMessage('');
      if (pdfInputRef.current) {
        pdfInputRef.current.value = '';
      }
    }
  };

  const updateExtractedQuestionDifficulty = (index: number, difficulty: string) => {
    setExtractedQuestions(prev => 
      prev.map((q, i) => i === index ? { ...q, difficulty } : q)
    );
  };

  const saveExtractedQuestions = async () => {
    if (extractedQuestions.length === 0 || !testId) return;

    try {
      const newQuestions = extractedQuestions.map((q: any, idx: number) => ({
        test_id: testId,
        question_type: 'mcq',
        difficulty: q.difficulty || 'easy',
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        marks: q.marks || 1,
        order_index: idx,
        media_url: q.media_url || null,
        media_type: q.media_type || null,
      }));

      const { error: insertError } = await supabase
        .from('questions')
        .insert(newQuestions);

      if (insertError) throw insertError;

      // Fire-and-forget: generate Khan-style explanations in the background
      supabase.functions.invoke('generate-insights', {
        body: { mode: 'explanations', testId, testSubject: '' },
      }).catch(err => console.error('Explanation generation failed:', err));

      toast({ 
        title: 'Success!', 
        description: `Added ${newQuestions.length} questions to the test.`
      });

      setExtractedQuestions([]);
      setQuestionBuilderKey(k => k + 1);
    } catch (error: any) {
      console.error('Save questions error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save questions', 
        variant: 'destructive' 
      });
    }
  };

  const handleFinalize = () => {
    if (!testId) return;

    toast({
      title: 'Test Created Successfully!',
      description: `Test code: ${testCode}`,
      duration: 5000,
    });

    onComplete?.(testCode);
  };

  return (
    <>
      {/* PDF Processing Dialog */}
      <Dialog open={processingOCR} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md rounded-2xl border-primary/20" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary via-secondary to-accent">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              Importing with Gemini
            </DialogTitle>
            <DialogDescription>
              Reading your PDF and extracting MCQs in the background.
            </DialogDescription>
          </DialogHeader>
          <GeminiLoader
            message={pdfProgressMessage || 'Processing...'}
            subMessage={`${pdfProgress}% complete`}
            size="md"
          />
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
      <Card className="cloud-bubble p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Create New Test</h2>
            <p className="text-muted-foreground text-sm">
              {step === 'basic' ? 'Step 1: Enter test details' : 'Step 2: Add questions'}
            </p>
          </div>
          {onCancel && (
            <Button variant="outline" onClick={handleCancel} className="rounded-xl">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          )}
        </div>

        {step === 'basic' ? (
          <div className="space-y-6">
            <Card className="p-6 border-2 border-border">
              <h3 className="font-semibold mb-4">Test Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Test Title *</Label>
                  <Input
                    id="title"
                    placeholder="e.g., Midterm Assessment 2025"
                    value={basicInfo.title}
                    onChange={(e) => setBasicInfo(prev => ({ ...prev, title: e.target.value }))}
                    className="input-glassy"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Subject *</Label>
                  <Select
                    value={basicInfo.subject}
                    onValueChange={(v) => setBasicInfo(prev => ({ ...prev, subject: v }))}
                  >
                    <SelectTrigger className="input-glassy">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Social Studies">Social Studies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the test..."
                    value={basicInfo.description}
                    onChange={(e) => setBasicInfo(prev => ({ ...prev, description: e.target.value }))}
                    className="input-glassy"
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Target Grade</Label>
                  <Select
                    value={basicInfo.target_grade}
                    onValueChange={(v) => setBasicInfo(prev => ({ ...prev, target_grade: v }))}
                  >
                    <SelectTrigger className="input-glassy">
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'].map(g => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Target Section</Label>
                  <Select
                    value={basicInfo.target_section}
                    onValueChange={(v) => setBasicInfo(prev => ({ ...prev, target_section: v }))}
                  >
                    <SelectTrigger className="input-glassy">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {['Section A', 'Section B', 'Section C', 'Section D'].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (minutes)</Label>
                  <Input
                    id="duration"
                    type="text"
                    value={basicInfo.duration_minutes.toString()}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setBasicInfo(prev => ({ ...prev, duration_minutes: parseInt(val) || 0 }));
                    }}
                    placeholder="e.g., 60"
                    className="input-glassy"
                  />
                </div>
              </div>
            </Card>

            <Button onClick={handleBasicInfoNext} className="w-full nav-btn-next">
              Next: Add Questions
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Add Questions Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="font-semibold">Add Questions</h3>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfUpload}
                  className="hidden"
                />
                <Button 
                  variant="outline" 
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={processingOCR || uploadingPdf}
                  className="gap-2"
                >
                  {processingOCR ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Extracting...
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4" />
                      Import from PDF
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setMaterialOpenSignal(s => s + 1)}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Material
                </Button>
              </div>
            </div>

            {/* Materials manager (passages, images, tables, etc.) */}
            {testId && (
              <GlobalPassageManager
                testId={testId}
                hideWhenEmpty
                openSignal={materialOpenSignal || undefined}
                onChange={() => setQuestionBuilderKey(k => k + 1)}
              />
            )}


            {/* Extracted Questions Preview */}
            {extractedQuestions.length > 0 && (
              <div className="p-4 bg-accent/10 rounded-xl border border-accent/20">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Extracted Questions ({extractedQuestions.length})
                  </h4>
                  <Button variant="ghost" size="sm" onClick={() => setExtractedQuestions([])}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="max-h-[300px] overflow-y-auto space-y-2 mb-4">
                  {extractedQuestions.map((q, idx) => (
                    <div key={idx} className="p-3 bg-background/50 rounded-lg flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">Q{idx + 1}: {q.question_text.substring(0, 60)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {q.options?.length || 4} options • Answer: {q.correct_answer}
                        </p>
                      </div>
                      <Select 
                        value={q.difficulty || 'easy'} 
                        onValueChange={(v) => updateExtractedQuestionDifficulty(idx, v)}
                      >
                        <SelectTrigger className="w-24 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="practice">Practice</SelectItem>
                          <SelectItem value="easy">Easy</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="hard">Hard</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
                <Button onClick={saveExtractedQuestions} className="w-full gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Add {extractedQuestions.length} Questions to Test
                </Button>
              </div>
            )}

            {/* Question Builder */}
            {testId && <QuestionBuilder key={questionBuilderKey} testId={testId} />}

            <div className="flex gap-4 mt-6">
              <Button
                variant="outline"
                onClick={() => setStep('basic')}
                className="rounded-xl"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={handleFinalize}
                className="flex-1 bg-success text-success-foreground hover:bg-success/90"
              >
                <Check className="h-4 w-4 mr-2" />
                Finalize & Generate Test Code
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
    </>
  );
};
