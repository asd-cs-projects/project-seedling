import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface Question {
  id?: string;
  test_id: string;
  question_type: 'mcq' | 'short_answer' | 'long_answer';
  difficulty: 'practice' | 'basic' | 'easy' | 'medium' | 'hard';
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

// Strip frontend-only fields before persisting
const stripClientOnly = ({ passage_text, passage_title, sub_question_label, ...rest }: Partial<Question>) => rest;

export const useQuestions = (testId: string) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const run = useCallback(async <T,>(label: string, fn: () => Promise<T>, successMsg?: string): Promise<T | null> => {
    setLoading(true);
    try {
      const result = await fn();
      if (successMsg) toast({ title: 'Success', description: successMsg });
      return result;
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || `Failed to ${label}`, variant: 'destructive' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchQuestions = useCallback((difficulty?: string) =>
    run('fetch questions', async () => {
      let query = supabase.from('questions').select('*').eq('test_id', testId).order('order_index', { ascending: true });
      if (difficulty) query = query.eq('difficulty', difficulty);
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Question[];
    }).then(r => r ?? []), [run, testId]);

  const createQuestion = useCallback((question: Question) =>
    run('create question', async () => {
      const { data, error } = await supabase.from('questions').insert([stripClientOnly(question) as any]).select().single();
      if (error) throw error;
      return data as Question;
    }, 'Question created successfully'), [run]);

  const updateQuestion = useCallback((id: string, updates: Partial<Question>) =>
    run('update question', async () => {
      const { data, error } = await supabase.from('questions').update(stripClientOnly(updates) as any).eq('id', id).select().single();
      if (error) throw error;
      return data as Question;
    }, 'Question updated successfully'), [run]);

  const deleteQuestion = useCallback((id: string) =>
    run('delete question', async () => {
      const { error } = await supabase.from('questions').delete().eq('id', id);
      if (error) throw error;
      return true;
    }, 'Question deleted successfully'), [run]);

  const reorderQuestions = useCallback((questionIds: string[]) =>
    run('reorder questions', async () => {
      // Run all updates in parallel rather than awaiting sequentially
      await Promise.all(questionIds.map((id, order_index) =>
        supabase.from('questions').update({ order_index }).eq('id', id).then(({ error }) => {
          if (error) throw error;
        })
      ));
      return true;
    }, 'Questions reordered successfully'), [run]);

  return { loading, fetchQuestions, createQuestion, updateQuestion, deleteQuestion, reorderQuestions };
};
