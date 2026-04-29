import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFileUpload } from '@/hooks/useFileUpload';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Loader2, Sparkles, CheckCircle, Image as ImageIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';


interface PDFUploaderProps {
  testId: string;
  onPDFsChange?: (pdfs: {
    pdf_url?: string;
    practice_question_count?: number;
    easy_question_count?: number;
    medium_question_count?: number;
    hard_question_count?: number;
  }) => void;
  onQuestionsCreated?: () => void;
}

interface ParsedQuestion {
  question_text: string;
  options: string[];
  correct_answer: string;
  marks: number;
  difficulty: string;
  order_index: number;
  media_url?: string;
  media_type?: string;
}

export const PDFUploader = ({ testId, onPDFsChange, onQuestionsCreated }: PDFUploaderProps) => {
  const { uploadPDF, uploading } = useFileUpload();
  const { toast } = useToast();

  const [pdfUrl, setPdfUrl] = useState('');
  const [currentPdfView, setCurrentPdfView] = useState<string>('');
  const [processingOCR, setProcessingOCR] = useState(false);
  const [extractedQuestions, setExtractedQuestions] = useState<ParsedQuestion[]>([]);
  const [questionsCreated, setQuestionsCreated] = useState(false);
  const [extractedImages, setExtractedImages] = useState<string[]>([]);

  const handlePDFUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('pdf')) {
      toast({ title: 'Error', description: 'Please upload a PDF file', variant: 'destructive' });
      return;
    }

    const url = await uploadPDF(file, testId, 'questions');
    if (url) {
      setPdfUrl(url);
      setExtractedQuestions([]);
      setQuestionsCreated(false);
      toast({ title: 'Success', description: 'PDF uploaded successfully' });
    }
  };

  const handleExtractQuestions = async () => {
    if (!pdfUrl) {
      toast({ title: 'Error', description: 'Please upload a PDF first', variant: 'destructive' });
      return;
    }

    setProcessingOCR(true);
    toast({ title: 'Processing', description: 'Extracting questions and images from PDF...' });

    try {
      // Step 1: OCR Extract with image detection
      // Bucket is private — download via authenticated storage API instead of public fetch
      const bucketMarker = '/test-files/';
      const idx = pdfUrl.indexOf(bucketMarker);
      if (idx === -1) throw new Error('Invalid PDF URL');
      const storagePath = decodeURIComponent(pdfUrl.substring(idx + bucketMarker.length).split('?')[0]);

      const { data: blob, error: dlError } = await supabase.storage
        .from('test-files')
        .download(storagePath);
      if (dlError || !blob) throw dlError || new Error('Failed to download PDF');

      if (blob.size === 0) throw new Error('Downloaded PDF is empty');

      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const base64Data = result.split(',')[1];
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('pdf-ocr', {
        body: { 
          pdfBase64: base64,
          mimeType: 'application/pdf',
          extractImages: true
        }
      });

      if (ocrError) throw ocrError;
      if (!ocrData?.text) throw new Error('No text extracted from PDF');

      // Store extracted images if any
      if (ocrData.images && ocrData.images.length > 0) {
        setExtractedImages(ocrData.images);
      }

      // Step 2: Parse Questions with image associations
      const { data: parseData, error: parseError } = await supabase.functions.invoke('parse-questions', {
        body: { 
          extractedText: ocrData.text,
          difficulty: 'easy', // Default difficulty, user can change per-question
          images: ocrData.images || []
        }
      });

      if (parseError) throw parseError;

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
    }
  };

  const handleSaveQuestions = async () => {
    if (extractedQuestions.length === 0) return;

    try {
      // Get count of existing questions for this test
      const { count: existingCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('test_id', testId);

      let orderOffset = existingCount || 0;

      // Count questions by difficulty
      const difficultyCounts = { practice: 0, easy: 0, medium: 0, hard: 0 };

      const newQuestions = extractedQuestions.map((q: ParsedQuestion, idx: number) => {
        const diff = q.difficulty || 'easy';
        difficultyCounts[diff as keyof typeof difficultyCounts]++;
        return {
          test_id: testId,
          question_type: 'mcq',
          difficulty: diff,
          question_text: q.question_text,
          options: q.options,
          correct_answer: q.correct_answer,
          marks: q.marks || 1,
          order_index: orderOffset + idx,
          media_url: q.media_url || null,
          media_type: q.media_type || null,
        };
      });

      // Insert questions into Supabase
      const { error: insertError } = await supabase
        .from('questions')
        .insert(newQuestions);

      if (insertError) throw insertError;

      // Fire-and-forget: generate Khan-style explanations in the background
      supabase.functions.invoke('generate-insights', {
        body: { mode: 'explanations', testId, testSubject: '' },
      }).catch(err => console.error('Explanation generation failed:', err));

      // Report counts by difficulty
      onPDFsChange?.({ 
        pdf_url: pdfUrl,
        practice_question_count: difficultyCounts.practice,
        easy_question_count: difficultyCounts.easy,
        medium_question_count: difficultyCounts.medium,
        hard_question_count: difficultyCounts.hard,
      });
      
      setQuestionsCreated(true);
      
      // Build summary of what was saved
      const summary = Object.entries(difficultyCounts)
        .filter(([_, count]) => count > 0)
        .map(([level, count]) => `${count} ${level}`)
        .join(', ');
      
      toast({ 
        title: 'Success!', 
        description: `Created ${newQuestions.length} questions: ${summary}.`
      });

      onQuestionsCreated?.();
    } catch (error: any) {
      console.error('Save questions error:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to save questions', 
        variant: 'destructive' 
      });
    }
  };

  const updateQuestionDifficulty = (index: number, difficulty: string) => {
    setExtractedQuestions(prev => 
      prev.map((q, i) => i === index ? { ...q, difficulty } : q)
    );
  };

  return (
    <div className="space-y-6">
      <Card className="cloud-bubble p-6">
        <div className="mb-2">
          <h3 className="text-xl font-semibold">Upload Question PDF</h3>
          <p className="text-muted-foreground text-sm mt-2">
            Upload a PDF with questions. AI will extract questions and images automatically. You can then assign difficulty levels.
          </p>
        </div>


        {/* Single Upload Area */}
        <div className="space-y-4">
          <div className={`p-6 border-2 border-dashed rounded-2xl text-center transition-colors ${pdfUrl ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}>
            <input
              type="file"
              id="pdf-upload"
              accept="application/pdf"
              onChange={handlePDFUpload}
              className="hidden"
            />
            
            {!pdfUrl ? (
              <div 
                onClick={() => document.getElementById('pdf-upload')?.click()}
                className="cursor-pointer py-8"
              >
                <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">Click to upload PDF</p>
                <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
              </div>
            ) : (
              <div className="py-4">
                <div className="flex items-center justify-center gap-2 text-primary mb-4">
                  <FileText className="h-6 w-6" />
                  <span className="font-medium">PDF Uploaded</span>
                  <CheckCircle className="h-5 w-5" />
                </div>
                <div className="flex gap-2 justify-center">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentPdfView(pdfUrl)}
                    className="rounded-xl"
                    size="sm"
                  >
                    View PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => document.getElementById('pdf-upload')?.click()}
                    disabled={uploading}
                    className="rounded-xl"
                    size="sm"
                  >
                    Replace
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Extract Button */}
          {pdfUrl && !extractedQuestions.length && (
            <Button
              onClick={handleExtractQuestions}
              disabled={processingOCR}
              className="w-full rounded-xl h-12"
              size="lg"
            >
              {processingOCR ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Extracting Questions & Images...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5 mr-2" />
                  Extract Questions with AI
                </>
              )}
            </Button>
          )}

          {/* Extracted Images Preview */}
          {extractedImages.length > 0 && (
            <div className="p-4 bg-muted/30 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <ImageIcon className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{extractedImages.length} images detected</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Images will be automatically linked to their related questions.
              </p>
            </div>
          )}

          {/* Extracted Questions Preview */}
          {extractedQuestions.length > 0 && !questionsCreated && (
            <div className="space-y-4 mt-6">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">Extracted Questions ({extractedQuestions.length})</h4>
                <div className="text-xs text-muted-foreground">
                  {(() => {
                    const counts = extractedQuestions.reduce((acc, q) => {
                      const d = q.difficulty || 'easy';
                      acc[d] = (acc[d] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);
                    return Object.entries(counts)
                      .filter(([_, c]) => c > 0)
                      .map(([level, count]) => `${count} ${level}`)
                      .join(' • ');
                  })()}
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto space-y-3 pr-2">
                {extractedQuestions.map((q, idx) => (
                  <div key={idx} className="p-4 bg-muted/30 rounded-xl">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Q{idx + 1}: {q.question_text.substring(0, 100)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {q.options.length} options • Answer: {q.correct_answer}
                          {q.media_url && ' • Has image'}
                        </p>
                      </div>
                      <Select 
                        value={q.difficulty || 'easy'} 
                        onValueChange={(v) => updateQuestionDifficulty(idx, v)}
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
                  </div>
                ))}
              </div>

              <Button
                onClick={handleSaveQuestions}
                className="w-full rounded-xl h-12"
                size="lg"
              >
                <CheckCircle className="h-5 w-5 mr-2" />
                Save {extractedQuestions.length} Questions
              </Button>
            </div>
          )}

          {/* Success State */}
          {questionsCreated && (
            <div className="p-6 bg-primary/10 rounded-xl text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-primary" />
              <h4 className="font-semibold text-lg">Questions Created!</h4>
              <p className="text-sm text-muted-foreground mt-1">
                {extractedQuestions.length} questions added to your test.
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setPdfUrl('');
                  setExtractedQuestions([]);
                  setQuestionsCreated(false);
                  setExtractedImages([]);
                }}
                className="mt-4 rounded-xl"
              >
                Upload Another PDF
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* PDF Viewer */}
      {currentPdfView && (
        <Card className="cloud-bubble p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">PDF Preview</h3>
            <Button
              variant="outline"
              onClick={() => setCurrentPdfView('')}
              className="rounded-xl"
            >
              Close Preview
            </Button>
          </div>
          <div className="border border-border rounded-xl overflow-hidden">
            <iframe
              src={currentPdfView}
              className="w-full h-[600px]"
              title="PDF Preview"
            />
          </div>
        </Card>
      )}
    </div>
  );
};
