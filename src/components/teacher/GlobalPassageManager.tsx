import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Plus, Edit, Trash2, ChevronDown, ChevronUp, Save, X, Link as LinkIcon, Upload, Loader2 } from 'lucide-react';

interface Passage {
  id: string;
  test_id: string;
  passage_code: string;
  title: string | null;
  content: string;
  passage_type: string | null;
  media_url?: string | null;
}

interface QuestionLite {
  id: string;
  question_text: string;
  passage_id?: string | null;
  order_index?: number | null;
  difficulty?: string | null;
}

interface GlobalPassageManagerProps {
  testId: string;
  /** Called whenever passages or assignments change so parent can refresh. */
  onChange?: () => void;
  /** Increment this number to externally trigger the "create passage" form. */
  openSignal?: number;
  /** Pre-fill the passage_type when opened externally (text | image | table | diagram). */
  initialType?: string;
  /** Hide the section if there are no passages and the form isn't open. */
  hideWhenEmpty?: boolean;
}

/**
 * Global passage manager that lives ABOVE the question editor.
 * Allows creating/editing passages and bulk-mapping them to questions
 * using a checkbox grid (one paragraph -> many questions in one go).
 */
export const GlobalPassageManager = ({ testId, onChange, openSignal, initialType, hideWhenEmpty }: GlobalPassageManagerProps) => {
  const { toast } = useToast();
  const [passages, setPassages] = useState<Passage[]>([]);
  const [questions, setQuestions] = useState<QuestionLite[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mappingPassageId, setMappingPassageId] = useState<string | null>(null);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());
  const [savingMap, setSavingMap] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [form, setForm] = useState({
    passage_code: '',
    title: '',
    content: '',
    passage_type: 'text',
    media_url: '',
  });

  useEffect(() => {
    if (testId) {
      loadAll();
    }
  }, [testId]);

  // External trigger from parent: toggle the create form open/closed.
  // Reusing the previous "openSignal" name — every increment toggles.
  useEffect(() => {
    if (openSignal === undefined) return;
    setExpanded(true);
    if (creating) {
      // Already open → user wants to collapse it.
      attemptClose();
    } else {
      setEditingId(null);
      setForm({
        passage_code: '',
        title: '',
        content: '',
        passage_type: initialType || 'text',
        media_url: '',
      });
      setCreating(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSignal]);

  const isFormDirty = () => {
    return Boolean(
      form.passage_code.trim() ||
      form.title.trim() ||
      form.content.trim() ||
      form.media_url
    );
  };

  const attemptClose = () => {
    if (isFormDirty()) {
      const ok = window.confirm(
        'You have unsaved material data. Save it first or click OK to discard and close.'
      );
      if (!ok) return;
    }
    resetForm();
  };

  const loadAll = async () => {
    const [{ data: pData }, { data: qData }] = await Promise.all([
      supabase.from('passages').select('*').eq('test_id', testId).order('passage_code'),
      supabase.from('questions').select('id, question_text, passage_id, order_index, difficulty').eq('test_id', testId).order('order_index'),
    ]);
    setPassages((pData as Passage[]) || []);
    setQuestions((qData as QuestionLite[]) || []);
  };

  const resetForm = () => {
    setForm({ passage_code: '', title: '', content: '', passage_type: 'text', media_url: '' });
    setCreating(false);
    setEditingId(null);
  };

  const startEdit = (p: Passage) => {
    setForm({
      passage_code: p.passage_code,
      title: p.title || '',
      content: p.content,
      passage_type: p.passage_type || 'text',
      media_url: p.media_url || '',
    });
    setEditingId(p.id);
    setCreating(true);
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${testId}/passages/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('test-files').upload(path, file, { cacheControl: '3600', upsert: false });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from('test-files').getPublicUrl(path);
      setForm(prev => ({ ...prev, media_url: publicUrl, passage_type: 'image' }));
      toast({ title: 'Uploaded', description: 'Media attached' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Upload failed', variant: 'destructive' });
    } finally {
      setUploadingMedia(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const savePassage = async () => {
    if (!form.passage_code.trim() || !form.content.trim()) {
      toast({ title: 'Missing fields', description: 'Code and content are required', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        const { error } = await supabase
          .from('passages')
          .update({
            passage_code: form.passage_code.trim(),
            title: form.title.trim() || null,
            content: form.content.trim(),
            passage_type: form.passage_type,
            media_url: form.media_url || null,
          })
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Saved', description: 'Passage updated' });
      } else {
        // Check duplicate code
        if (passages.some(p => p.passage_code === form.passage_code.trim())) {
          toast({ title: 'Duplicate code', description: 'That passage code already exists', variant: 'destructive' });
          return;
        }
        const { error } = await supabase.from('passages').insert({
          test_id: testId,
          passage_code: form.passage_code.trim(),
          title: form.title.trim() || null,
          content: form.content.trim(),
          passage_type: form.passage_type,
          media_url: form.media_url || null,
        });
        if (error) throw error;
        toast({ title: 'Created', description: 'Passage added' });
      }
      resetForm();
      await loadAll();
      onChange?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save passage', variant: 'destructive' });
    }
  };

  const deletePassage = async (id: string) => {
    if (!window.confirm('Delete this passage? Linked questions will be unlinked.')) return;
    try {
      // Unlink questions first
      await supabase.from('questions').update({ passage_id: null }).eq('passage_id', id);
      const { error } = await supabase.from('passages').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Deleted', description: 'Passage removed' });
      await loadAll();
      onChange?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to delete', variant: 'destructive' });
    }
  };

  const openMapping = (p: Passage) => {
    setMappingPassageId(p.id);
    const linked = new Set(questions.filter(q => q.passage_id === p.id).map(q => q.id));
    setSelectedQuestionIds(linked);
  };

  const toggleQuestion = (id: string) => {
    setSelectedQuestionIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const saveMapping = async () => {
    if (!mappingPassageId) return;
    setSavingMap(true);
    try {
      const ids = Array.from(selectedQuestionIds);
      // Unlink any question previously linked to this passage but not in the new selection
      const previouslyLinked = questions.filter(q => q.passage_id === mappingPassageId).map(q => q.id);
      const toUnlink = previouslyLinked.filter(id => !selectedQuestionIds.has(id));

      if (toUnlink.length > 0) {
        await supabase.from('questions').update({ passage_id: null }).in('id', toUnlink);
      }
      if (ids.length > 0) {
        await supabase.from('questions').update({ passage_id: mappingPassageId }).in('id', ids);
      }
      toast({ title: 'Saved', description: `Linked ${ids.length} question(s) to passage` });
      setMappingPassageId(null);
      setSelectedQuestionIds(new Set());
      await loadAll();
      onChange?.();
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save mapping', variant: 'destructive' });
    } finally {
      setSavingMap(false);
    }
  };

  const linkedCount = (passageId: string) => questions.filter(q => q.passage_id === passageId).length;

  // When asked to hide-when-empty, only render once there's something meaningful to show.
  if (hideWhenEmpty && passages.length === 0 && !creating) {
    return null;
  }

  return (
    <Card className="cloud-bubble p-5 border border-primary/15">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Materials</h3>
            <p className="text-xs text-muted-foreground">
              Upload materials once, then bulk-link them to many questions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setExpanded(e => !e)} className="rounded-xl">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="space-y-4">
          {/* Passage list FIRST when there are passages, so the create form
              appears at the bottom under the existing materials. */}
          {passages.length === 0 ? (
            !creating && (
              <div className="text-center py-8 border-2 border-dashed border-border rounded-xl">
                <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/60 mb-2" />
                <p className="text-sm text-muted-foreground">
                  No materials yet. Click "Add Material" above to add one.
                </p>
              </div>
            )
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {passages.map(p => (
                <div
                  key={p.id}
                  className="p-4 rounded-xl border border-border bg-background/60 hover:border-primary/40 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-primary/10 text-primary">
                          {p.passage_code}
                        </span>
                        {p.title && <span className="font-medium text-sm">{p.title}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{p.content}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => startEdit(p)}
                        title="Edit passage"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deletePassage(p.id)}
                        title="Delete passage"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/60">
                    <span className="text-xs text-muted-foreground">
                      {linkedCount(p.id)} question{linkedCount(p.id) === 1 ? '' : 's'} linked
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl gap-1 h-7 text-xs"
                      onClick={() => openMapping(p)}
                      disabled={questions.length === 0}
                    >
                      <LinkIcon className="h-3 w-3" />
                      Map Questions
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom-corner Add Material trigger when there are existing materials */}
          {passages.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl gap-1"
                onClick={() => {
                  if (creating) {
                    attemptClose();
                  } else {
                    setEditingId(null);
                    setForm({ passage_code: '', title: '', content: '', passage_type: initialType || 'text', media_url: '' });
                    setCreating(true);
                  }
                }}
              >
                {creating ? (
                  <>
                    <ChevronUp className="h-4 w-4" /> Hide Material Form
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" /> Add Material
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Create / Edit form (rendered below the list) */}
          {creating && (
            <div className="p-4 bg-muted/30 rounded-xl border border-border space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">{editingId ? 'Edit Material' : 'New Material'}</h4>
                <Button variant="ghost" size="icon" onClick={attemptClose} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Material Code *</Label>
                  <Input
                    value={form.passage_code}
                    onChange={(e) => setForm(prev => ({ ...prev, passage_code: e.target.value }))}
                    placeholder="e.g., A, B, P1"
                    className="input-glassy"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Title (optional)</Label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="e.g., The Water Cycle"
                    className="input-glassy"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Content *</Label>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Paste or type the passage text..."
                  rows={5}
                  className="input-glassy"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleMediaUpload}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-xl"
                  disabled={uploadingMedia}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploadingMedia ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  {form.media_url ? 'Replace Image' : 'Add Image'}
                </Button>
                {form.media_url && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm(prev => ({ ...prev, media_url: '' }))}
                  >
                    Remove image
                  </Button>
                )}
                <div className="flex-1" />
                <Button onClick={savePassage} size="sm" className="rounded-xl">
                  <Save className="h-4 w-4 mr-1" /> {editingId ? 'Save Changes' : 'Save Material'}
                </Button>
              </div>
            </div>
          )}

          {/* Bulk mapping panel */}
          {mappingPassageId && (
            <div className="p-4 bg-primary/5 border border-primary/30 rounded-xl space-y-3 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-medium text-sm">
                    Link questions to passage{' '}
                    <span className="font-mono text-primary">
                      {passages.find(p => p.id === mappingPassageId)?.passage_code}
                    </span>
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Tick every question that belongs to this passage. Unticked questions will be unlinked.
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setMappingPassageId(null)} className="h-7 w-7">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
                {questions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No questions yet.</p>
                ) : (
                  questions.map((q, idx) => {
                    const checked = selectedQuestionIds.has(q.id);
                    const linkedToOther = q.passage_id && q.passage_id !== mappingPassageId;
                    return (
                      <label
                        key={q.id}
                        className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors ${
                          checked ? 'bg-primary/15' : 'hover:bg-background'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleQuestion(q.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold">Q{idx + 1}</span>
                            {q.difficulty && (
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                {q.difficulty}
                              </span>
                            )}
                            {linkedToOther && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning-foreground">
                                Currently linked to {passages.find(p => p.id === q.passage_id)?.passage_code}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-foreground/80 line-clamp-2 mt-0.5">
                            {q.question_text}
                          </p>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-primary/20">
                <span className="text-xs text-muted-foreground">
                  {selectedQuestionIds.size} selected
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setMappingPassageId(null)} className="rounded-xl">
                    Cancel
                  </Button>
                  <Button size="sm" onClick={saveMapping} disabled={savingMap} className="rounded-xl">
                    <Save className="h-3.5 w-3.5 mr-1" />
                    {savingMap ? 'Saving...' : 'Save Mapping'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};
