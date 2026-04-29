-- Drop the unique constraint that prevents multiple results per student/test
ALTER TABLE public.test_results 
DROP CONSTRAINT IF EXISTS test_results_test_id_student_id_key;

-- Add a new composite unique constraint that allows retakes
-- Only enforce uniqueness for first attempts (is_retake = false)
CREATE UNIQUE INDEX idx_test_results_unique_first_attempt 
ON public.test_results (test_id, student_id) 
WHERE is_retake = false;