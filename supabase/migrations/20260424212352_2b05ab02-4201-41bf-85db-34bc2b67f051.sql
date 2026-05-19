CREATE TABLE IF NOT EXISTS public.student_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL UNIQUE,
  summary text NOT NULL DEFAULT '',
  strengths jsonb,
  improvements jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.student_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own summary"
ON public.student_summaries
FOR SELECT
TO authenticated
USING (student_id = auth.uid());

CREATE POLICY "Teachers can view student summaries"
ON public.student_summaries
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role));

CREATE TRIGGER update_student_summaries_updated_at
BEFORE UPDATE ON public.student_summaries
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();