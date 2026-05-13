ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS adaptive_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS groups_per_student integer;

ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

CREATE INDEX IF NOT EXISTS idx_test_results_status ON public.test_results(status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_summaries_student_subject
  ON public.student_summaries(student_id, subject);