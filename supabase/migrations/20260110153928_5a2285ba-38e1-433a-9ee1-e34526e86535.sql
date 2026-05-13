ALTER TABLE public.test_results
ADD COLUMN IF NOT EXISTS is_retake boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_test_results_test_id_is_retake
ON public.test_results (test_id, is_retake);

CREATE INDEX IF NOT EXISTS idx_test_results_student_id_is_retake
ON public.test_results (student_id, is_retake);