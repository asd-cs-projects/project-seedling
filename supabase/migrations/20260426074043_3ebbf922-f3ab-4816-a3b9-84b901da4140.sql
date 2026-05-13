-- Restructure student_summaries to be per-subject
ALTER TABLE public.student_summaries
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT 'All Subjects';

-- Drop the old unique constraint on student_id only
ALTER TABLE public.student_summaries
  DROP CONSTRAINT IF EXISTS student_summaries_student_id_key;

-- Add new uniqueness on (student_id, subject)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'student_summaries_student_subject_key'
  ) THEN
    ALTER TABLE public.student_summaries
      ADD CONSTRAINT student_summaries_student_subject_key UNIQUE (student_id, subject);
  END IF;
END $$;

-- Allow students to insert their own summary rows
DROP POLICY IF EXISTS "Students can insert own summary" ON public.student_summaries;
CREATE POLICY "Students can insert own summary"
  ON public.student_summaries
  FOR INSERT
  TO authenticated
  WITH CHECK (student_id = auth.uid());

-- Allow students to update their own summary rows (for daily refresh)
DROP POLICY IF EXISTS "Students can update own summary" ON public.student_summaries;
CREATE POLICY "Students can update own summary"
  ON public.student_summaries
  FOR UPDATE
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());