import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Save, X, Upload, Loader2 } from 'lucide-react';
import { Passage } from '@/hooks/usePassages';

interface PassageManagerProps {
  testId: string;
  passages: Passage[];
  onPassageCreated: (passage: Passage) => void;
  onClose: () => void;
}

export const PassageManager = ({ testId, passages, onPassageCreated, onClose }: PassageManagerProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    passage_code: '',
    title: '',
    content: '',
    passage_type: 'text',
    media_url: '',
  });

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingMedia(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${testId}/passages/${crypto.randomUUID()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('test-files')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('test-files')
        .getPublicUrl(fileName);

      setForm(prev => ({ ...prev, media_url: publicUrl }));
      toast({ title: 'Uploaded', description: 'Media uploaded successfully' });
    } catch (error: any) {
      console.error('Upload error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to upload', variant: 'destructive' });
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.passage_code || !form.content) {
      toast({ title: 'Error', description: 'Passage code and content are required', variant: 'destructive' });
      return;
    }

    // Check for duplicate passage code
    if (passages.some(p => p.passage_code === form.passage_code)) {
      toast({ title: 'Error', description: 'Passage code already exists', variant: 'destructive' });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('passages')
        .insert({
          test_id: testId,
          passage_code: form.passage_code,
          title: form.title || null,
          content: form.content,
          passage_type: form.passage_type,
          media_url: form.media_url || null,
        })
        .select()
        .single();

      if (error) throw error;

      toast({ title: 'Success', description: 'Passage created successfully' });
      onPassageCreated(data);
      onClose();
    } catch (error: any) {
      console.error('Error creating passage:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create passage', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-4 border border-border rounded-xl bg-muted/30">
      <div className="flex items-center justify-between">
        <h4 className="font-medium flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Create New Passage
        </h4>
        <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Passage Code *</Label>
          <Input
            value={form.passage_code}
            onChange={(e) => setForm(prev => ({ ...prev, passage_code: e.target.value }))}
            placeholder="e.g., PASSAGE_A"
          />
        </div>
        <div className="space-y-2">
          <Label>Title (optional)</Label>
          <Input
            value={form.title}
            onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="e.g., The Story of..."
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Content *</Label>
        <Textarea
          value={form.content}
          onChange={(e) => setForm(prev => ({ ...prev, content: e.target.value }))}
          placeholder="Enter the passage content here..."
          rows={5}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Passage Type</Label>
          <Select
            value={form.passage_type}
            onValueChange={(v) => setForm(prev => ({ ...prev, passage_type: v }))}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Text Only</SelectItem>
              <SelectItem value="image">With Image</SelectItem>
              <SelectItem value="mixed">Mixed Content</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Media (optional)</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleMediaUpload}
            className="hidden"
          />
          {form.media_url ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground truncate flex-1">{form.media_url.split('/').pop()}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setForm(prev => ({ ...prev, media_url: '' }))}
              >
                Remove
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingMedia}
            >
              {uploadingMedia ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              Upload Image
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Create Passage
        </Button>
      </div>
    </div>
  );
};
