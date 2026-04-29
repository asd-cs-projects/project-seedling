import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Question {
  id?: string;
  test_id: string;
  question_type: 'mcq' | 'short_answer' | 'long_answer';
  difficulty: 'practice' | 'easy' | 'medium' | 'hard';
  passage_id?: string;
  passage_text?: string;
  passage_title?: string;
  sub_question_label?: string;
  question_text: string;
  options?: string[];
  correct_answer?: string;
  marks: number;
  order_index: number;
  media_url?: string;
  media_type?: 'image' | 'audio' | 'video';
}

export const useQuestions = (testId: string) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const fetchQuestions = async (difficulty?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('questions')
        .select('*')
        .eq('test_id', testId)
        .order('order_index', { ascending: true });

      if (difficulty) {
        query = query.eq('difficulty', difficulty);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Question[];
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to fetch questions',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const createQuestion = async (question: Question) => {
    setLoading(true);
    try {
      const { passage_text, passage_title, sub_question_label, ...dbQuestion } = question;
      const { data, error } = await supabase
        .from('questions')
        .insert([dbQuestion as any])
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Question created successfully',
      });

      return data as Question;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create question',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const updateQuestion = async (id: string, updates: Partial<Question>) => {
    setLoading(true);
    try {
      const { passage_text, passage_title, sub_question_label, ...dbUpdates } = updates;
      const { data, error } = await supabase
        .from('questions')
        .update(dbUpdates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Question updated successfully',
      });

      return data as Question;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update question',
        variant: 'destructive',
      });
      return null;
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('questions')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Question deleted successfully',
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete question',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reorderQuestions = async (questionIds: string[]) => {
    setLoading(true);
    try {
      const updates = questionIds.map((id, index) => ({
        id,
        order_index: index,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('questions')
          .update({ order_index: update.order_index })
          .eq('id', update.id);

        if (error) throw error;
      }

      toast({
        title: 'Success',
        description: 'Questions reordered successfully',
      });

      return true;
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to reorder questions',
        variant: 'destructive',
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    fetchQuestions,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
  };
};
