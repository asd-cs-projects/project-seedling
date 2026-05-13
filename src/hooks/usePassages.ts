import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Passage {
  id: string;
  test_id: string;
  passage_code: string;
  title: string | null;
  content: string;
  passage_type: string | null;
  media_url: string | null;
  created_at: string | null;
}

export const usePassages = (testId: string) => {
  const { toast } = useToast();
  const [passages, setPassages] = useState<Passage[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (testId) {
      fetchPassages();
    }
  }, [testId]);

  const fetchPassages = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('passages')
        .select('*')
        .eq('test_id', testId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setPassages(data || []);
    } catch (error: any) {
      console.error('Error fetching passages:', error);
    } finally {
      setLoading(false);
    }
  };

  const createPassage = async (passage: Omit<Passage, 'id' | 'created_at'>) => {
    try {
      const { data, error } = await supabase
        .from('passages')
        .insert([passage])
        .select()
        .single();

      if (error) throw error;

      setPassages(prev => [...prev, data]);
      toast({ title: 'Success', description: 'Passage created successfully' });
      return data;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to create passage', variant: 'destructive' });
      return null;
    }
  };

  const updatePassage = async (id: string, updates: Partial<Passage>) => {
    try {
      const { data, error } = await supabase
        .from('passages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      setPassages(prev => prev.map(p => p.id === id ? data : p));
      toast({ title: 'Success', description: 'Passage updated successfully' });
      return data;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to update passage', variant: 'destructive' });
      return null;
    }
  };

  const deletePassage = async (id: string) => {
    try {
      const { error } = await supabase
        .from('passages')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPassages(prev => prev.filter(p => p.id !== id));
      toast({ title: 'Success', description: 'Passage deleted successfully' });
      return true;
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete passage', variant: 'destructive' });
      return false;
    }
  };

  return {
    passages,
    loading,
    fetchPassages,
    createPassage,
    updatePassage,
    deletePassage,
  };
};
