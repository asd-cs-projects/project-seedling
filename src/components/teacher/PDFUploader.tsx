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
  passage_id?: string | null;   // slug from parser
  passage_title?: string | null;
  passage_text?: string | null;
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
  // Default difficulty applied to the whole PDF (and to each newly-extracted question).
  const [defaultDifficulty, setDefaultDifficulty] = useState<string>('easy');
  // Per-passage (module) material — image uploaded by teacher and applied to every
  // question inside that passage. Keyed by the parser's passage_id slug.
  const [passageMedia, setPassageMedia] = useState<Record<string, string>>({});
  const [uploadingPassage, setUploadingPassage] = useState<string | null>(null);

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
      // Step 1: create a short-lived signed URL and let the edge function (and OpenRouter)
      // fetch the PDF directly. Avoids the slow download → base64 → giant JSON upload path.
      const bucketMarker = '/test-files/';
      const idx = pdfUrl.indexOf(bucketMarker);
      if (idx === -1) throw new Error('Invalid PDF URL');
      const storagePath = decodeURIComponent(pdfUrl.substring(idx + bucketMarker.length).split('?')[0]);

      const { data: signed, error: signErr } = await supabase.storage
        .from('test-files')
        .createSignedUrl(storagePath, 600);
      if (signErr || !signed?.signedUrl) throw signErr || new Error('Failed to sign PDF URL');

      const { data: ocrData, error: ocrError } = await supabase.functions.invoke('pdf-ocr', {
        body: {
          pdfUrl: signed.signedUrl,
          mimeType: 'application/pdf',
          extractImages: true,
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
          difficulty: defaultDifficulty,
          images: ocrData.images || []
        }
      });

      if (parseError) throw parseError;

      if (parseData?.questions && parseData.questions.length > 0) {
        // Force every parsed question to the chosen default; teacher can still override below.
        setExtractedQuestions(
          parseData.questions.map((q: ParsedQuestion) => ({ ...q, difficulty: defaultDifficulty }))
        );
        toast({ 
          title: 'Questions Extracted!', 
          description: `Found ${parseData.questions.length} questions at "${defaultDifficulty}". Adjust per passage or per question, then save.`
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
      // 1) Create passage rows for any unique passage_id slugs returned by the parser
      //    so each "module" in the PDF is persisted and questions can FK to it.
      const slugToUuid = new Map<string, string>();
      const uniquePassages = new Map<string, { title: string; content: string }>();
      extractedQuestions.forEach((q) => {
        if (q.passage_id && !uniquePassages.has(q.passage_id)) {
          uniquePassages.set(q.passage_id, {
            title: q.passage_title || q.passage_id,
            content: q.passage_text || '',
          });
        }
      });

      if (uniquePassages.size > 0) {
        // De-dupe against existing passages on this test by passage_code (slug)
        const slugs = Array.from(uniquePassages.keys());
        const { data: existingPassages } = await supabase
          .from('passages')
          .select('id, passage_code')
          .eq('test_id', testId)
          .in('passage_code', slugs);

        existingPassages?.forEach((p) => slugToUuid.set(p.passage_code, p.id));

        const toInsert = slugs
          .filter((slug) => !slugToUuid.has(slug))
          .map((slug) => ({
            test_id: testId,
            passage_code: slug,
            title: uniquePassages.get(slug)!.title,
            content: uniquePassages.get(slug)!.content || uniquePassages.get(slug)!.title,
            passage_type: passageMedia[slug] ? 'image' : 'text',
            media_url: passageMedia[slug] || null,
          }));

        if (toInsert.length > 0) {
          const { data: inserted, error: pErr } = await supabase
            .from('passages')
            .insert(toInsert)
            .select('id, passage_code');
          if (pErr) throw pErr;
          inserted?.forEach((p) => slugToUuid.set(p.passage_code, p.id));
        }

        // For passages that already existed but the teacher just attached an image to,
        // patch the media_url onto the existing row.
        for (const slug of slugs) {
          if (passageMedia[slug] && slugToUuid.has(slug)) {
            const passageId = slugToUuid.get(slug)!;
            await supabase
              .from('passages')
              .update({ media_url: passageMedia[slug], passage_type: 'image' })
              .eq('id', passageId);
          }
        }
      }

      // Get count of existing questions for this test
      const { count: existingCount } = await supabase
        .from('questions')
        .select('*', { count: 'exact', head: true })
        .eq('test_id', testId);

      let orderOffset = existingCount || 0;

      // Count questions by difficulty
      const difficultyCounts: Record<string, number> = { practice: 0, basic: 0, easy: 0, medium: 0, hard: 0 };

      const newQuestions = extractedQuestions.map((q: ParsedQuestion, idx: number) => {
        const diff = q.difficulty || defaultDifficulty;
        difficultyCounts[diff] = (difficultyCounts[diff] || 0) + 1;
        return {
          test_id: testId,
          passage_id: q.passage_id ? slugToUuid.get(q.passage_id) ?? null : null,
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

  /** Bulk-set difficulty for every question that belongs to a given passage slug (or standalone group when slug is null). */
  const setPassageDifficulty = (passageId: string | null, difficulty: string) => {
    setExtractedQuestions(prev =>
      prev.map(q => ((q.passage_id || null) === passageId ? { ...q, difficulty } : q))
    );
  };

  /** Apply a single difficulty to ALL extracted questions (whole-PDF override). */
  const applyDifficultyToAll = (difficulty: string) => {
    setDefaultDifficulty(difficulty);
    setExtractedQuestions(prev => prev.map(q => ({ ...q, difficulty })));
  };

  /** Upload an image for an entire module/passage. Stored on the passage row at save time. */
  const handlePassageMediaUpload = async (
    passageKey: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPassage(passageKey);
    try {
      const ext = file.name.split('.').pop();
      const path = `${testId}/passages/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from('test-files')
        .upload(path, file, { cacheControl: '3600', upsert: false });
      if (error) throw error;
      setPassageMedia(prev => ({ ...prev, [passageKey]: path }));
      toast({ title: 'Uploaded', description: 'Module image attached' });
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploadingPassage(null);
      if (e.target) e.target.value = '';
    }
  };

  // Group extracted questions by passage for UI rendering
  const groupedExtracted = (() => {
    const map = new Map<string | null, { title: string; questions: { q: ParsedQuestion; idx: number }[] }>();
    extractedQuestions.forEach((q, idx) => {
      const key = q.passage_id || null;
      if (!map.has(key)) {
        map.set(key, {
          title: q.passage_title || (key ? key : 'Standalone questions'),
          questions: [],
        });
      }
      map.get(key)!.questions.push({ q, idx });
    });
    return Array.from(map.entries());
  })();

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
          {/* Default difficulty for the whole PDF */}
          <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/30 border border-border">
            <div className="flex-1">
              <p className="text-sm font-medium">Default difficulty for this PDF</p>
              <p className="text-xs text-muted-foreground">
                Every extracted question (and passage/module) starts at this level. You can override per passage or per question afterwards.
              </p>
            </div>
            <Select
              value={defaultDifficulty}
              onValueChange={(v) => {
                if (extractedQuestions.length > 0) applyDifficultyToAll(v);
                else setDefaultDifficulty(v);
              }}
            >
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="practice">Practice</SelectItem>
                <SelectItem value="basic">Basic</SelectItem>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hard">Hard</SelectItem>
              </SelectContent>
            </Select>
          </div>

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

              <div className="max-h-[480px] overflow-y-auto space-y-4 pr-2">
                {groupedExtracted.map(([passageKey, group]) => {
                  // Each passage = one module. Show a single difficulty selector that
                  // bulk-applies to every question inside this module.
                  const groupDifficulty = group.questions[0]?.q.difficulty || defaultDifficulty;
                  const allSame = group.questions.every(({ q }) => q.difficulty === groupDifficulty);
                  return (
                    <div key={passageKey ?? 'standalone'} className="p-4 bg-muted/20 rounded-xl border border-border">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {passageKey ? `Module: ${group.title}` : group.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {group.questions.length} question{group.questions.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <Select
                          value={allSame ? groupDifficulty : 'mixed'}
                          onValueChange={(v) => setPassageDifficulty(passageKey, v)}
                        >
                          <SelectTrigger className="w-32 h-9 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {!allSame && <SelectItem value="mixed" disabled>Mixed</SelectItem>}
                            <SelectItem value="practice">Practice</SelectItem>
                            <SelectItem value="basic">Basic</SelectItem>
                            <SelectItem value="easy">Easy</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="hard">Hard</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {/* Per-module material upload (image applied to whole passage) */}
                      {passageKey && (
                        <div className="mb-3 flex items-center gap-2 p-2 rounded-lg bg-background/60 border border-dashed border-border">
                          <input
                            id={`passage-media-${passageKey}`}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handlePassageMediaUpload(passageKey, e)}
                          />
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-xs flex-1 truncate">
                            {passageMedia[passageKey]
                              ? `Module image attached: ${passageMedia[passageKey].split('/').pop()}`
                              : 'Attach an image as material for this whole module (optional)'}
                          </span>
                          {passageMedia[passageKey] && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setPassageMedia(prev => {
                                const n = { ...prev }; delete n[passageKey]; return n;
                              })}
                            >
                              Remove
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            disabled={uploadingPassage === passageKey}
                            onClick={() => document.getElementById(`passage-media-${passageKey}`)?.click()}
                          >
                            {uploadingPassage === passageKey ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (passageMedia[passageKey] ? 'Replace' : 'Upload')}
                          </Button>
                        </div>
                      )}
                      <div className="space-y-2">
                        {group.questions.map(({ q, idx }) => (
                          <div key={idx} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-background/60">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                Q{idx + 1}: {q.question_text.substring(0, 110)}{q.question_text.length > 110 ? '…' : ''}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {q.options.length} options • Answer: {q.correct_answer}
                                {q.media_url && ' • Has image'}
                              </p>
                            </div>
                            <Select
                              value={q.difficulty || defaultDifficulty}
                              onValueChange={(v) => updateQuestionDifficulty(idx, v)}
                            >
                              <SelectTrigger className="w-24 h-7 text-[11px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="practice">Practice</SelectItem>
                                <SelectItem value="basic">Basic</SelectItem>
                                <SelectItem value="easy">Easy</SelectItem>
                                <SelectItem value="medium">Medium</SelectItem>
                                <SelectItem value="hard">Hard</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
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
