-- Allow 'basic' difficulty across questions and test_results
-- (currently a free text column, no check constraint exists per schema dump,
-- so just document by ensuring NULL handling.)

-- 1. Add status column to test_results to track Completed/Timed Out/Incomplete/Not Attempted
ALTER TABLE public.test_results
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed';

-- Validate via trigger (avoid CHECK so we can change values later without restoration issues)
CREATE OR REPLACE FUNCTION public.validate_test_result_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('completed', 'timed_out', 'incomplete', 'not_attempted') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be completed, timed_out, incomplete, or not_attempted.', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_test_result_status_trigger ON public.test_results;
CREATE TRIGGER validate_test_result_status_trigger
BEFORE INSERT OR UPDATE ON public.test_results
FOR EACH ROW EXECUTE FUNCTION public.validate_test_result_status();

-- 2. Adaptive Module Mode + groups_per_student on tests
ALTER TABLE public.tests
  ADD COLUMN IF NOT EXISTS adaptive_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS groups_per_student integer;

-- 3. Module name on passages (allows passages table to also represent named modules
-- without text content). Keep content nullable for module-only entries.
ALTER TABLE public.passages
  ADD COLUMN IF NOT EXISTS module_name text,
  ALTER COLUMN content DROP NOT NULL;

-- 4. Index for status queries
CREATE INDEX IF NOT EXISTS idx_test_results_status ON public.test_results(status);
CREATE INDEX IF NOT EXISTS idx_test_results_test_status ON public.test_results(test_id, status);
