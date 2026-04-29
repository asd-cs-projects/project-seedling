import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { GeminiLoader } from '@/components/ui/gemini-loader';
import { GlobalPassageManager } from './GlobalPassageManager';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Plus, Edit, Trash2, Save, Upload, Image as ImageIcon, Music, Video, X, Loader2, BookOpen, FileText, Sparkles, CheckCircle, Table as TableIcon, Shapes, PlusCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { MediaDisplay } from '@/components/ui/media-display';
import { PassageManager } from './PassageManager';
import { usePassages, Passage } from '@/hooks/usePassages';
import { useFileUpload } from '@/hooks/useFileUpload';

import sckoolLogo from '@/assets/sckool-logo.jpeg';

interface Question {
  id: string;
  test_id: string;
  question_type: string;
  difficulty: string;
  question_text: string;
  options: string[];
  correct_answer: string;
  marks: number;
  order_index: number;
  media_url?: string;
  media_type?: string;
  passage_id?: string;
  passage_title?: string;
  passage_text?: string;
  explanation?: string | null;
  option_explanations?: Record<string, string> | null;
}

interface Test {
  id: string;
  title: string;
  subject: string;
  duration_minutes: number;
  test_code: string;
}

interface TestEditorProps {
  testId: string;
  onClose: () => void;
}

export const TestEditor = ({ testId, onClose }: TestEditorProps) => {
  const { toast } = useToast();
  const [test, setTest] = useState<Test | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Question>>({});
  const [loading, setLoading] = useState(true);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showCreatePassage, setShowCreatePassage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  
  // PDF extraction states
  const { uploadPDF, uploading: uploadingPdf } = useFileUpload();
  const [processingOCR, setProcessingOCR] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<any[]>([]);
  const [showPdfUploader, setShowPdfUploader] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [pdfProgressMessage, setPdfProgressMessage] = useState('');

  // "Add Material" UI: chip row + signal to open the global passage manager
  const [showMaterialPicker, setShowMaterialPicker] = useState(false);
  const [materialOpenSignal, setMaterialOpenSignal] = useState(0);
  const [materialInitialType, setMaterialInitialType] = useState<string>('text');
  
  // Use the passages hook
  const { passages, fetchPassages, createPassage } = usePassages(testId);

  // Test form state
  const [testForm, setTestForm] = useState({
    title: '',
    subject: '',
    duration_minutes: 60,
    description: '',
    target_grade: '',
    target_section: '',
  });

  useEffect(() => {
    loadData();
  }, [testId]);

  const loadData = async () => {
    setLoading(true);
    
    try {
      // Load test from Supabase
      const { data: testData, error: testError } = await supabase
        .from('tests')
        .select('*')
        .eq('id', testId)
        .maybeSingle();
      
      if (testError) throw testError;
      
      if (testData) {
        setTest(testData);
        setTestForm({
          title: testData.title || '',
          subject: testData.subject || '',
          duration_minutes: testData.duration_minutes || 60,
          description: testData.description || '',
          target_grade: testData.target_grade || '',
          target_section: testData.target_section || '',
        });
      }

      // Load questions from Supabase
      const { data: questionsData, error: questionsError } = await supabase
        .from('questions')
        .select('*')
        .eq('test_id', testId)
        .order('order_index', { ascending: true });
      
      if (questionsError) throw questionsError;
      
      // Transform questions to match component interface
      const transformedQuestions: Question[] = (questionsData || []).map(q => ({
        id: q.id,
        test_id: q.test_id,
        question_type: q.question_type || 'mcq',
        difficulty: q.difficulty || 'easy',
        question_text: q.question_text,
        options: Array.isArray(q.options) ? q.options as string[] : ['', '', '', ''],
        correct_answer: q.correct_answer || 'A',
        marks: q.marks || 1,
        order_index: q.order_index || 0,
        media_url: q.media_url || undefined,
        media_type: q.media_type || undefined,
        passage_id: q.passage_id || undefined,
        explanation: (q as any).explanation ?? null,
        option_explanations: ((q as any).option_explanations as Record<string, string> | null) ?? null,
      }));
      
      setQuestions(transformedQuestions);
    } catch (error: any) {
      console.error('Error loading data:', error);
      toast({ title: "Error", description: "Failed to load test data", variant: "destructive" });
    }
    
    setLoading(false);
  };

  const saveTestInfo = async () => {
    try {
      const { error } = await supabase
        .from('tests')
        .update({
          title: testForm.title,
          subject: testForm.subject,
          duration_minutes: testForm.duration_minutes,
          description: testForm.description,
          target_grade: testForm.target_grade,
          target_section: testForm.target_section,
        })
        .eq('id', testId);
      
      if (error) throw error;
      
      setTest(prev => prev ? { ...prev, ...testForm } : null);
      toast({ title: "Saved", description: "Test information updated" });
    } catch (error: any) {
      console.error('Error saving test:', error);
      toast({ title: "Error", description: "Failed to save test info", variant: "destructive" });
    }
  };

  const startEditQuestion = (q: Question) => {
    setEditingQuestionId(q.id);
    setEditForm({ ...q });
  };

  const cancelEditQuestion = () => {
    setEditingQuestionId(null);
    setEditForm({});
  };

  const saveQuestion = async () => {
    if (!editingQuestionId || !editForm.question_text) return;

    try {
      // Fix: Send null instead of empty string for passage_id
      const passageId = editForm.passage_id && editForm.passage_id !== 'none' ? editForm.passage_id : null;

      // Clean up option_explanations: only persist non-empty entries; null = let AI fill
      const optExpl = editForm.option_explanations || {};
      const cleanedOptExpl: Record<string, string> = {};
      ['A', 'B', 'C', 'D'].forEach((k) => {
        const v = (optExpl[k] || '').trim();
        if (v) cleanedOptExpl[k] = v;
      });
      const optExplToSave = Object.keys(cleanedOptExpl).length > 0 ? cleanedOptExpl : null;
      const explToSave = (editForm.explanation || '').trim() || null;

      const { error } = await supabase
        .from('questions')
        .update({
          question_text: editForm.question_text,
          question_type: editForm.question_type,
          difficulty: editForm.difficulty,
          options: editForm.options,
          correct_answer: editForm.correct_answer,
          marks: editForm.marks,
          media_url: editForm.media_url,
          media_type: editForm.media_type,
          passage_id: passageId,
          explanation: explToSave,
          option_explanations: optExplToSave,
        } as any)
        .eq('id', editingQuestionId);

      if (error) throw error;

      setQuestions(prev => prev.map(q =>
        q.id === editingQuestionId ? { ...q, ...editForm, explanation: explToSave, option_explanations: optExplToSave } as Question : q
      ));
      setEditingQuestionId(null);
      setEditForm({});
      toast({ title: "Saved", description: "Question updated successfully" });
    } catch (error: any) {
      console.error('Error saving question:', error);
      toast({ title: "Error", description: "Failed to save question", variant: "destructive" });
    }
  };

  const deleteQuestion = async (id: string) => {
    if (!window.confirm('Delete this question?')) return;

    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;

      setQuestions(prev => prev.filter(q => q.id !== id));
      toast({ title: "Deleted", description: "Question removed" });
    } catch (error: any) {
      console.error('Error deleting question:', error);
      toast({ title: "Error", description: "Failed to delete question", variant: "destructive" });
    }
  };

  const addNewQuestion = async () => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      test_id: testId,
      question_type: 'mcq',
      difficulty: 'easy',
      question_text: '',
      options: ['', '', '', ''],
      correct_answer: 'A',
      marks: 1,
      order_index: questions.length,
    };

    try {
      const { error } = await supabase
        .from('questions')
        .insert({
          id: newQ.id,
          test_id: newQ.test_id,
          question_type: newQ.question_type,
          difficulty: newQ.difficulty,
          question_text: newQ.question_text || 'New Question',
          options: newQ.options,
          correct_answer: newQ.correct_answer,
          marks: newQ.marks,
          order_index: newQ.order_index,
        });
      
      if (error) throw error;

      setQuestions(prev => [...prev, newQ]);
      startEditQuestion(newQ);
    } catch (error: any) {
      console.error('Error adding question:', error);
      toast({ title: "Error", description: "Failed to add question", variant: "destructive" });
    }
  };

  // PDF extraction handlers
  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      toast({ title: 'Error', description: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }

    setProcessingOCR(true);
    setPdfProgress(0);
    setPdfProgressMessage('Uploading PDF...');

    try {
      // Upload PDF first (so it's saved on the test for later viewing)
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
    if (extractedQuestions.length === 0) return;

    try {
      const orderOffset = questions.length;

      const newQuestions = extractedQuestions.map((q: any, idx: number) => ({
        test_id: testId,
        question_type: 'mcq',
        difficulty: q.difficulty || 'easy',
        question_text: q.question_text,
        options: q.options,
        correct_answer: q.correct_answer,
        marks: q.marks || 1,
        order_index: orderOffset + idx,
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
      setShowPdfUploader(false);
      loadData(); // Refresh questions
    } catch (error: any) {
      console.error('Save questions error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save questions', 
        variant: 'destructive' 
      });
    }
  };

  const updateOption = (index: number, value: string) => {
    const newOptions = [...(editForm.options || ['', '', '', ''])];
    newOptions[index] = value;
    setEditForm(prev => ({ ...prev, options: newOptions }));
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);

    try {
      // Determine media type
      let mediaType = 'file';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';
      else if (file.type.startsWith('video/')) mediaType = 'video';

      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${testId}/${crypto.randomUUID()}.${fileExt}`;

      // Upload to Supabase storage
      const { error: uploadError, data } = await supabase.storage
        .from('test-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('test-files')
        .getPublicUrl(fileName);

      // Update edit form with media
      setEditForm(prev => ({
        ...prev,
        media_url: publicUrl,
        media_type: mediaType,
      }));

      toast({ title: "Uploaded", description: `${mediaType.charAt(0).toUpperCase() + mediaType.slice(1)} uploaded successfully` });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: "Upload Error", description: error.message || "Failed to upload file", variant: "destructive" });
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removeMedia = () => {
    setEditForm(prev => ({
      ...prev,
      media_url: undefined,
      media_type: undefined,
    }));
  };

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case 'practice': return 'bg-accent/20 text-accent-foreground';
      case 'easy': return 'bg-success/20 text-success';
      case 'medium': return 'bg-warning/20 text-warning-foreground';
      case 'hard': return 'bg-destructive/20 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const renderMediaPreview = (url?: string, type?: string) => {
    return (
      <MediaDisplay
        url={url}
        type={type}
        alt="Question media"
        size="md"
      />
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

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

      <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <img src={sckoolLogo} alt="Sckool Logo" className="h-10 w-10 rounded-full" />
        <div>
          <h2 className="text-2xl font-semibold">Edit Test</h2>
          <p className="text-sm text-muted-foreground">Update test details and questions</p>
        </div>
      </div>

      {/* Test Information */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Test Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Test Title</Label>
            <Input
              value={testForm.title}
              onChange={(e) => setTestForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="e.g., Final Exam - Mathematics"
            />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Select
              value={testForm.subject}
              onValueChange={(v) => setTestForm(prev => ({ ...prev, subject: v }))}
            >
              <SelectTrigger>
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
            <Label>Description</Label>
            <Textarea
              value={testForm.description}
              onChange={(e) => setTestForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Test description..."
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label>Target Grade</Label>
            <Select
              value={testForm.target_grade}
              onValueChange={(v) => setTestForm(prev => ({ ...prev, target_grade: v }))}
            >
              <SelectTrigger>
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
              value={testForm.target_section}
              onValueChange={(v) => setTestForm(prev => ({ ...prev, target_section: v }))}
            >
              <SelectTrigger>
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
            <Label>Duration (minutes)</Label>
            <Input
              type="number"
              value={testForm.duration_minutes}
              onChange={(e) => setTestForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button onClick={saveTestInfo}>
            <Save className="h-4 w-4 mr-2" />
            Save Test Info
          </Button>
        </div>
      </Card>

      {/* Questions Section */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-medium">Questions ({questions.length})</h3>
            <p className="text-sm text-muted-foreground">Edit questions or add new ones</p>
          </div>
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
              <PlusCircle className="h-4 w-4" />
              Add Material
            </Button>
            <Button onClick={addNewQuestion} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Question
            </Button>
          </div>
        </div>

        {/* Material manager — only visible when materials exist or being created */}
        <div className="mb-4">
          <GlobalPassageManager
            testId={testId}
            hideWhenEmpty
            openSignal={materialOpenSignal || undefined}
            initialType={materialInitialType}
            onChange={() => { fetchPassages(); loadData(); }}
          />
        </div>


        {/* Extracted Questions Preview */}
        {extractedQuestions.length > 0 && (
          <div className="mb-6 p-4 bg-accent/10 rounded-xl border border-accent/20">
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

        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
              <p>No questions yet. Click "Add Question" to create one.</p>
            </div>
          ) : (
            questions.map((q, idx) => (
              <div key={q.id} className="border border-border rounded-xl overflow-hidden">
                {editingQuestionId === q.id ? (
                  /* Edit Mode */
                  <div className="p-5 space-y-4 bg-card">
                    <div className="space-y-2">
                      <Label>Question Text</Label>
                      <Textarea
                        value={editForm.question_text || ''}
                        onChange={(e) => setEditForm(prev => ({ ...prev, question_text: e.target.value }))}
                        placeholder="Enter your question here..."
                        rows={3}
                      />
                    </div>

                    {/* Passage Selection */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4" />
                        Link to Passage (optional)
                      </Label>
                      <Select
                        value={editForm.passage_id || 'none'}
                        onValueChange={(v) => {
                          if (v === 'create_new') {
                            setShowCreatePassage(true);
                          } else {
                            setEditForm(prev => ({ ...prev, passage_id: v === 'none' ? undefined : v }));
                          }
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a passage" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No passage</SelectItem>
                          <SelectItem value="create_new" className="text-primary">
                            <span className="flex items-center gap-2">
                              <Plus className="h-4 w-4" />
                              Create New Passage
                            </span>
                          </SelectItem>
                          {passages.length > 0 && (
                            <>
                              <div className="border-t my-1" />
                              {passages.map((passage) => (
                                <SelectItem key={passage.id} value={passage.id}>
                                  {passage.passage_code}: {passage.title || passage.content.substring(0, 30) + '...'}
                                </SelectItem>
                              ))}
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      
                      {/* Show linked passage preview */}
                      {editForm.passage_id && editForm.passage_id !== 'none' && (
                        <div className="p-3 bg-accent/10 rounded-lg border border-accent/20">
                          {(() => {
                            const linkedPassage = passages.find(p => p.id === editForm.passage_id);
                            if (!linkedPassage) return null;
                            return (
                              <div>
                                <p className="text-sm font-medium text-accent-foreground">
                                  📖 {linkedPassage.passage_code}: {linkedPassage.title || 'Untitled'}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {linkedPassage.content}
                                </p>
                              </div>
                            );
                          })()}
                        </div>
                      )}
                      
                      {/* Inline passage creation form */}
                      {showCreatePassage && (
                        <PassageManager
                          testId={testId}
                          passages={passages}
                          onPassageCreated={(newPassage) => {
                            fetchPassages();
                            setEditForm(prev => ({ ...prev, passage_id: newPassage.id }));
                            setShowCreatePassage(false);
                          }}
                          onClose={() => setShowCreatePassage(false)}
                        />
                      )}
                    </div>

                    {/* Media Upload */}
                    <div className="space-y-2">
                      <Label>Media (Image/Video/Audio)</Label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,audio/*,video/*"
                        onChange={handleMediaUpload}
                        className="hidden"
                        id={`media-upload-${q.id}`}
                      />
                      
                      {editForm.media_url ? (
                        <div className="space-y-2">
                          {renderMediaPreview(editForm.media_url, editForm.media_type)}
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingMedia}
                              className="rounded-xl"
                            >
                              {uploadingMedia ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 mr-1" />}
                              Replace
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={removeMedia}
                              className="rounded-xl text-destructive hover:text-destructive"
                            >
                              <X className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div 
                          onClick={() => !uploadingMedia && fileInputRef.current?.click()}
                          className={`border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer transition-colors hover:border-primary/50 hover:bg-muted/30 ${uploadingMedia ? 'opacity-50 cursor-wait' : ''}`}
                        >
                          {uploadingMedia ? (
                            <>
                              <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin text-primary" />
                              <p className="text-sm text-muted-foreground">Uploading...</p>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-center gap-4 mb-2">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                <Music className="h-6 w-6 text-muted-foreground" />
                                <Video className="h-6 w-6 text-muted-foreground" />
                              </div>
                              <p className="text-sm text-muted-foreground">Click to upload image, video, or audio</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Difficulty</Label>
                        <Select 
                          value={editForm.difficulty || 'easy'} 
                          onValueChange={(v) => setEditForm(prev => ({ ...prev, difficulty: v }))}
                        >
                          <SelectTrigger>
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
                      <div className="space-y-2">
                        <Label>Marks</Label>
                        <Input
                          type="number"
                          value={editForm.marks || 1}
                          onChange={(e) => setEditForm(prev => ({ ...prev, marks: parseInt(e.target.value) || 1 }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Options</Label>
                      <div className="space-y-2">
                        {['A', 'B', 'C', 'D'].map((letter, i) => (
                          <div key={letter} className="flex items-center gap-2">
                            <span className="w-8 h-8 flex items-center justify-center bg-muted rounded-lg text-sm font-medium">
                              {letter}
                            </span>
                            <Input
                              value={editForm.options?.[i] || ''}
                              onChange={(e) => updateOption(i, e.target.value)}
                              placeholder={`Option ${letter}`}
                              className="flex-1"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Correct Answer</Label>
                      <Select 
                        value={editForm.correct_answer || 'A'} 
                        onValueChange={(v) => setEditForm(prev => ({ ...prev, correct_answer: v }))}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>

                    {/* Optional Teacher Explanations — leave blank to let AI fill in automatically */}
                    <div className="space-y-3 p-4 bg-muted/20 rounded-xl border border-border/40">
                      <div>
                        <Label className="text-sm font-semibold">Explanations (optional)</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Leave any field blank to let AI generate it automatically.
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Overall explanation</Label>
                        <Textarea
                          value={editForm.explanation || ''}
                          onChange={(e) => setEditForm(prev => ({ ...prev, explanation: e.target.value }))}
                          placeholder="Why the correct answer is right (leave empty for AI)..."
                          rows={2}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Per-option explanations</Label>
                        {['A', 'B', 'C', 'D'].map((letter) => (
                          <div key={letter} className="flex items-start gap-2">
                            <span className="w-8 h-8 mt-1 flex items-center justify-center bg-muted rounded-lg text-xs font-medium shrink-0">
                              {letter}
                            </span>
                            <Textarea
                              value={editForm.option_explanations?.[letter] || ''}
                              onChange={(e) => setEditForm(prev => ({
                                ...prev,
                                option_explanations: { ...(prev.option_explanations || {}), [letter]: e.target.value },
                              }))}
                              placeholder={`Explain why ${letter} is right or wrong (optional)...`}
                              rows={1}
                              className="flex-1 text-sm"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                          <SelectItem value="A">A</SelectItem>
                          <SelectItem value="B">B</SelectItem>
                          <SelectItem value="C">C</SelectItem>
                          <SelectItem value="D">D</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex gap-2 pt-2 border-t">
                      <Button variant="outline" onClick={cancelEditQuestion}>
                        Cancel
                      </Button>
                      <Button onClick={saveQuestion}>
                        <Save className="h-4 w-4 mr-2" />
                        Save Changes
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div className="p-4 bg-muted/30">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <span className="w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded-lg text-sm font-medium">
                          {idx + 1}
                        </span>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${getDifficultyColor(q.difficulty)}`}>
                              {q.difficulty}
                            </span>
                            <span className="text-xs text-muted-foreground">{q.marks} marks</span>
                            {q.media_url && (
                              <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                                {q.media_type === 'image' ? '🖼️' : q.media_type === 'audio' ? '🎵' : '🎬'} Media
                              </span>
                            )}
                            {q.passage_id && (
                              <span className="text-xs bg-accent/20 text-accent-foreground px-2 py-0.5 rounded-full">
                                📖 Passage
                              </span>
                            )}
                          </div>
                          <p className="text-foreground">{q.question_text || 'No question text'}</p>
                          
                          {/* Show media preview in view mode */}
                          {q.media_url && (
                            <div className="mt-3">
                              {renderMediaPreview(q.media_url, q.media_type)}
                            </div>
                          )}
                          
                          <div className="mt-3 space-y-1">
                            {q.options?.map((opt, i) => (
                              <div 
                                key={i}
                                className={`text-sm flex items-center gap-2 ${
                                  q.correct_answer === String.fromCharCode(65 + i) 
                                    ? 'text-success font-medium' 
                                    : 'text-muted-foreground'
                                }`}
                              >
                                <span className="w-5">{String.fromCharCode(65 + i)}.</span>
                                <span>{opt || '(empty)'}</span>
                                {q.correct_answer === String.fromCharCode(65 + i) && (
                                  <span className="text-xs bg-success/20 px-2 py-0.5 rounded">Correct</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditQuestion(q)}
                          className="h-8 w-8"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteQuestion(q.id)}
                          className="h-8 w-8 text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
    </>
  );
};
