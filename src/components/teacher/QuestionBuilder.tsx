import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { useQuestions, Question } from '@/hooks/useQuestions';
import { useFileUpload } from '@/hooks/useFileUpload';
import { QuestionPreview } from './QuestionPreview';
import { Trash2, GripVertical, Upload, Plus, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Passage {
  id: string;
  passage_code: string;
  title: string | null;
  content: string;
  passage_type: string | null;
  module_name?: string | null;
}

interface QuestionBuilderProps {
  testId: string;
  onQuestionsChange?: (questions: Question[]) => void;
}

export const QuestionBuilder = ({ testId, onQuestionsChange }: QuestionBuilderProps) => {
  const { toast } = useToast();
  const { createQuestion, fetchQuestions, deleteQuestion, reorderQuestions, loading } = useQuestions(testId);
  const { uploadMedia, uploading } = useFileUpload();
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Partial<Question>>({
    question_type: 'mcq',
    difficulty: 'easy',
    question_text: '',
    marks: 1,
    options: ['', '', '', ''],
    correct_answer: '',
    order_index: 0,
  });
  const [isPassageQuestion, setIsPassageQuestion] = useState(false);
  const [passageId, setPassageId] = useState<string>('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [passages, setPassages] = useState<Passage[]>([]);
  const [selectedPassageId, setSelectedPassageId] = useState<string>('');
  const [isCreatingNewPassage, setIsCreatingNewPassage] = useState(false);
  const [newPassageCode, setNewPassageCode] = useState('');
  const [newPassageTitle, setNewPassageTitle] = useState('');
  const [newPassageContent, setNewPassageContent] = useState('');
  const [newModuleName, setNewModuleName] = useState('');
  const [groupKind, setGroupKind] = useState<'passage' | 'module'>('passage');

  useEffect(() => {
    loadQuestions();
    loadPassages();
  }, [testId]);

  const loadQuestions = async () => {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('test_id', testId)
      .order('order_index');
    
    if (error) {
      console.error('Error loading questions:', error);
      return;
    }
    
    const formattedQuestions: Question[] = (data || []).map(q => ({
      id: q.id,
      test_id: q.test_id,
      question_type: q.question_type as 'mcq' | 'short_answer' | 'long_answer',
      difficulty: q.difficulty as 'practice' | 'easy' | 'medium' | 'hard',
      question_text: q.question_text,
      marks: q.marks || 1,
      order_index: q.order_index || 0,
      options: Array.isArray(q.options) ? q.options as string[] : undefined,
      correct_answer: q.correct_answer || undefined,
      media_url: q.media_url || undefined,
      media_type: (q.media_type as 'image' | 'audio' | 'video') || undefined,
      passage_id: q.passage_id || undefined,
    }));
    
    setQuestions(formattedQuestions);
    onQuestionsChange?.(formattedQuestions);
  };

  const loadPassages = async () => {
    const { data, error } = await supabase
      .from('passages')
      .select('*')
      .eq('test_id', testId)
      .order('created_at');
    
    if (error) {
      console.error('Error loading passages:', error);
      return;
    }
    
    setPassages(data || []);
  };

  const handleCreatePassage = async () => {
    const isModule = groupKind === 'module';
    if (!newPassageCode.trim()) {
      toast({ title: 'Error', description: 'Please enter a code', variant: 'destructive' });
      return;
    }
    if (!isModule && !newPassageContent.trim()) {
      toast({ title: 'Error', description: 'Please enter passage content', variant: 'destructive' });
      return;
    }
    if (isModule && !newModuleName.trim()) {
      toast({ title: 'Error', description: 'Please enter a module name', variant: 'destructive' });
      return;
    }

    const { data, error } = await supabase
      .from('passages')
      .insert({
        test_id: testId,
        passage_code: newPassageCode.trim(),
        title: newPassageTitle.trim() || null,
        content: isModule ? '' : newPassageContent.trim(),
        passage_type: isModule ? 'module' : 'text',
        module_name: isModule ? newModuleName.trim() : null,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Success', description: `${isModule ? 'Module' : 'Passage'} created successfully` });
    setPassages(prev => [...prev, data]);
    setSelectedPassageId(data.id);
    setIsCreatingNewPassage(false);
    setNewPassageCode('');
    setNewPassageTitle('');
    setNewPassageContent('');
    setNewModuleName('');
  };

  const handleAddQuestion = async () => {
    if (!currentQuestion.question_text?.trim()) {
      toast({ title: 'Error', description: 'Please enter question text', variant: 'destructive' });
      return;
    }

    if (currentQuestion.question_type === 'mcq') {
      const filledOptions = currentQuestion.options?.filter(o => o.trim());
      if (!filledOptions || filledOptions.length < 2) {
        toast({ title: 'Error', description: 'Please add at least 2 options', variant: 'destructive' });
        return;
      }
      if (!currentQuestion.correct_answer) {
        toast({ title: 'Error', description: 'Please select the correct answer', variant: 'destructive' });
        return;
      }
    }

    const questionData = {
      test_id: testId,
      question_type: currentQuestion.question_type || 'mcq',
      difficulty: currentQuestion.difficulty || 'easy',
      question_text: currentQuestion.question_text!,
      marks: currentQuestion.marks || 1,
      order_index: questions.length,
      passage_id: isPassageQuestion && selectedPassageId ? selectedPassageId : null,
      options: currentQuestion.question_type === 'mcq' ? currentQuestion.options?.filter(o => o.trim()) : null,
      correct_answer: currentQuestion.correct_answer || null,
      media_url: currentQuestion.media_url || null,
      media_type: currentQuestion.media_type || null,
    };

    const { error } = await supabase
      .from('questions')
      .insert(questionData);

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      return;
    }

    // Fire-and-forget: generate Khan-style explanations in the background
    supabase.functions.invoke('generate-insights', {
      body: { mode: 'explanations', testId, testSubject: '' },
    }).catch(err => console.error('Explanation generation failed:', err));

    toast({ title: 'Success', description: 'Question created successfully' });
    loadQuestions();
    resetForm();
  };

  const handleDeleteQuestion = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this question?')) {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);
      
      if (error) {
        toast({ title: 'Error', description: error.message, variant: 'destructive' });
        return;
      }
      
      toast({ title: 'Success', description: 'Question deleted successfully' });
      loadQuestions();
    }
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const mediaType = file.type.startsWith('image/') ? 'image' :
                     file.type.startsWith('audio/') ? 'audio' :
                     file.type.startsWith('video/') ? 'video' : null;

    if (!mediaType) {
      toast({ title: 'Error', description: 'Invalid file type', variant: 'destructive' });
      return;
    }

    const url = await uploadMedia(file, testId);
    if (url) {
      setCurrentQuestion(prev => ({ ...prev, media_url: url, media_type: mediaType }));
    }
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    const newQuestions = [...questions];
    const draggedItem = newQuestions[draggedIndex];
    newQuestions.splice(draggedIndex, 1);
    newQuestions.splice(index, 0, draggedItem);

    setQuestions(newQuestions);
    setDraggedIndex(index);
  };

  const handleDragEnd = async () => {
    if (draggedIndex !== null) {
      // Update order_index for all questions in database
      const updates = questions.map((q, idx) => ({
        id: q.id,
        order_index: idx
      }));
      
      // Update each question's order_index
      for (const update of updates) {
        await supabase
          .from('questions')
          .update({ order_index: update.order_index })
          .eq('id', update.id);
      }
      
      toast({ title: 'Success', description: 'Questions reordered successfully' });
    }
    setDraggedIndex(null);
  };

  const resetForm = () => {
    setCurrentQuestion({
      question_type: 'mcq',
      difficulty: 'easy',
      question_text: '',
      marks: 1,
      options: ['', '', '', ''],
      correct_answer: '',
      order_index: 0,
    });
    setIsPassageQuestion(false);
    setSelectedPassageId('');
    setEditingIndex(null);
  };

  const handleOptionChange = (index: number, value: string) => {
    const newOptions = [...(currentQuestion.options || ['', '', '', ''])];
    newOptions[index] = value;
    setCurrentQuestion(prev => ({ ...prev, options: newOptions }));
  };

  return (
    <div className="grid lg:grid-cols-[60%_40%] gap-6">
      {/* Question Form */}
      <Card className="cloud-bubble p-6">
        <h3 className="text-xl font-semibold mb-4">Question Builder</h3>
        
        <div className="space-y-4">
            {/* Difficulty */}
            <div className="space-y-2">
              <Label>Difficulty Level</Label>
              <Select value={currentQuestion.difficulty} onValueChange={(v) => setCurrentQuestion(prev => ({ ...prev, difficulty: v as any }))}>
                <SelectTrigger className="input-glassy">
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

            {/* Passage Section */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="passageCheck"
                  checked={isPassageQuestion}
                  onChange={(e) => setIsPassageQuestion(e.target.checked)}
                  className="rounded"
                />
                <Label htmlFor="passageCheck">This is a passage-based question</Label>
              </div>
            </div>

            {isPassageQuestion && (
              <div className="space-y-4 p-4 bg-muted/20 rounded-xl border border-border">
                <div className="space-y-2">
                  <Label>Select Passage</Label>
                  <Select 
                    value={isCreatingNewPassage ? 'new' : selectedPassageId} 
                    onValueChange={(v) => {
                      if (v === 'new') {
                        setIsCreatingNewPassage(true);
                        setSelectedPassageId('');
                      } else {
                        setIsCreatingNewPassage(false);
                        setSelectedPassageId(v);
                      }
                    }}
                  >
                    <SelectTrigger className="input-glassy">
                      <SelectValue placeholder="Select existing or create new" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover border border-border z-50">
                      <SelectItem value="new">+ Create New Passage</SelectItem>
                      {passages.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.passage_code} {p.title ? `- ${p.title}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isCreatingNewPassage && (
                  <div className="space-y-3 p-3 bg-background rounded-lg border border-border">
                    <div className="space-y-2">
                      <Label>Passage Code *</Label>
                      <Input
                        value={newPassageCode}
                        onChange={(e) => setNewPassageCode(e.target.value)}
                        placeholder="e.g., A, B, Passage-1"
                        className="input-glassy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Passage Title (Optional)</Label>
                      <Input
                        value={newPassageTitle}
                        onChange={(e) => setNewPassageTitle(e.target.value)}
                        placeholder="e.g., The Water Cycle"
                        className="input-glassy"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Passage Content *</Label>
                      <Textarea
                        value={newPassageContent}
                        onChange={(e) => setNewPassageContent(e.target.value)}
                        placeholder="Enter the reading passage..."
                        className="input-glassy min-h-[120px]"
                      />
                    </div>
                    <Button
                      type="button"
                      onClick={handleCreatePassage}
                      className="w-full"
                      variant="secondary"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Create Passage
                    </Button>
                  </div>
                )}

                {selectedPassageId && !isCreatingNewPassage && (
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <p className="text-sm font-medium">
                      Linked to: {passages.find(p => p.id === selectedPassageId)?.passage_code}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {passages.find(p => p.id === selectedPassageId)?.content.substring(0, 100)}...
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Question Text */}
            <div className="space-y-2">
              <Label>Question Text</Label>
              <Textarea
                value={currentQuestion.question_text}
                onChange={(e) => setCurrentQuestion(prev => ({ ...prev, question_text: e.target.value }))}
                placeholder="Enter your question..."
                className="input-glassy"
              />
            </div>

            {/* MCQ Options */}
            {currentQuestion.question_type === 'mcq' && (
              <div className="space-y-3">
                <Label>Answer Options</Label>
                {[0, 1, 2, 3].map((idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={currentQuestion.correct_answer === String.fromCharCode(65 + idx)}
                      onChange={() => setCurrentQuestion(prev => ({ ...prev, correct_answer: String.fromCharCode(65 + idx) }))}
                      className="w-4 h-4"
                    />
                    <span className="font-semibold w-6">{String.fromCharCode(65 + idx)}.</span>
                    <Input
                      value={currentQuestion.options?.[idx] || ''}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                      className="input-glassy flex-1"
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Select the radio button for the correct answer</p>
              </div>
            )}

            {/* Marks */}
            <div className="space-y-2">
              <Label>Marks</Label>
              <Input
                type="number"
                value={currentQuestion.marks}
                onChange={(e) => setCurrentQuestion(prev => ({ ...prev, marks: parseInt(e.target.value) || 1 }))}
                min={1}
                max={10}
                className="input-glassy"
              />
            </div>

            {/* Media Upload */}
            <div className="space-y-2">
              <Label>Attach Media (optional)</Label>
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  id="mediaUpload"
                  accept="image/*,audio/*,video/*"
                  onChange={handleMediaUpload}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => document.getElementById('mediaUpload')?.click()}
                  disabled={uploading}
                  className="rounded-xl"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {uploading ? 'Uploading...' : 'Upload Media'}
                </Button>
                {currentQuestion.media_url && (
                  <span className="text-sm text-success">✓ File attached</span>
                )}
              </div>
            </div>

            {/* Add Question Button */}
            <Button
              onClick={handleAddQuestion}
              disabled={loading || uploading}
              className="w-full nav-btn-next"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Question
            </Button>
          </div>
      </Card>

      {/* Live Preview */}
      <div className="space-y-4">
        <Card className="cloud-bubble p-4">
          <h3 className="text-lg font-semibold mb-3">Live Preview</h3>
          <p className="text-sm text-muted-foreground mb-4">See how students will view this question</p>
          {currentQuestion.question_text ? (
            <QuestionPreview
              question={currentQuestion as Question}
              questionNumber={questions.length + 1}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              Start building a question to see the preview
            </div>
          )}
        </Card>
      </div>

      {/* Question List */}
      {questions.length > 0 && (
        <Card className="cloud-bubble p-6 lg:col-span-2">
          <h3 className="text-lg font-semibold mb-4">Questions ({questions.length})</h3>
          <p className="text-sm text-muted-foreground mb-4">Drag to reorder</p>
          <div className="space-y-3">
            {questions.map((q, idx) => (
              <div
                key={q.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDragEnd={handleDragEnd}
                className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors cursor-move"
              >
                <GripVertical className="h-5 w-5 text-muted-foreground" />
                <div className="flex-1">
                  <p className="font-medium">
                    Q{idx + 1}{q.sub_question_label && q.sub_question_label}. {q.question_text.substring(0, 60)}...
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {q.question_type} • {q.difficulty} • {q.marks} marks
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeleteQuestion(q.id!)}
                  className="rounded-xl"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
