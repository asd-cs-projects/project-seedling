-- Add AI insights columns to test_results table
ALTER TABLE public.test_results 
ADD COLUMN IF NOT EXISTS ai_strengths text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_improvements text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS ai_topic_tags text[] DEFAULT '{}';

-- Create a table for class-level AI summaries per test
CREATE TABLE IF NOT EXISTS public.test_class_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id UUID NOT NULL REFERENCES public.tests(id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  topic_heatmap JSONB DEFAULT '{}'::jsonb,
  generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(test_id)
);

-- Enable RLS on test_class_summaries
ALTER TABLE public.test_class_summaries ENABLE ROW LEVEL SECURITY;

-- Teachers can manage class summaries for their tests
CREATE POLICY "Teachers can manage class summaries" 
ON public.test_class_summaries 
FOR ALL 
USING (EXISTS (
  SELECT 1 FROM tests 
  WHERE tests.id = test_class_summaries.test_id 
  AND tests.teacher_id = auth.uid()
));

-- Students can view class summaries for tests they've taken
CREATE POLICY "Students can view class summaries" 
ON public.test_class_summaries 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM test_results 
  WHERE test_results.test_id = test_class_summaries.test_id 
  AND test_results.student_id = auth.uid()
));

-- Create trigger for updated_at
CREATE TRIGGER update_test_class_summaries_updated_at
BEFORE UPDATE ON public.test_class_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();