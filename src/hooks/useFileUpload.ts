import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export const useFileUpload = () => {
  const { toast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const uploadFile = async (
    file: File,
    folder: string,
    bucket: string = 'test-files'
  ): Promise<string | null> => {
    setUploading(true);
    setProgress(0);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      setProgress(100);
      toast({
        title: 'Success',
        description: 'File uploaded successfully',
      });

      return publicUrl;
    } catch (error: any) {
      toast({
        title: 'Upload Error',
        description: error.message || 'Failed to upload file',
        variant: 'destructive',
      });
      return null;
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const uploadMedia = async (file: File, testId: string) => {
    return uploadFile(file, `${testId}/media`);
  };

  const uploadPDF = async (file: File, testId: string, type: string) => {
    return uploadFile(file, `${testId}/pdfs/${type}`);
  };

  const deleteFile = async (url: string, bucket: string = 'test-files') => {
    try {
      const path = url.split(`${bucket}/`)[1];
      if (!path) throw new Error('Invalid file path');

      const { error } = await supabase.storage
        .from(bucket)
        .remove([path]);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'File deleted successfully',
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Delete Error',
        description: error.message || 'Failed to delete file',
        variant: 'destructive',
      });
      return false;
    }
  };

  return {
    uploading,
    progress,
    uploadFile,
    uploadMedia,
    uploadPDF,
    deleteFile,
  };
};
