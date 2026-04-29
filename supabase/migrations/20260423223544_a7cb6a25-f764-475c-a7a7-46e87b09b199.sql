-- 1. Restrict 'tests' SELECT to authenticated users only (no anon enumeration)
DROP POLICY IF EXISTS "Students can view active tests" ON public.tests;

CREATE POLICY "Authenticated users can view active tests"
ON public.tests
FOR SELECT
TO authenticated
USING (is_active = true);

-- 2. Tighten test-files storage SELECT: only teachers who own related tests,
--    or students who have a session/result for a test referencing the file.
--    Files are stored under paths like "<test_id>/..." or "passages/<test_id>/...".
DROP POLICY IF EXISTS "Authenticated users can read test files" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for test-files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view test files" ON storage.objects;

CREATE POLICY "Teachers can read their own test files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-files'
  AND EXISTS (
    SELECT 1 FROM public.tests t
    WHERE t.teacher_id = auth.uid()
      AND (
        position(t.id::text in name) > 0
      )
  )
);

CREATE POLICY "Students can read files for tests they have access to"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'test-files'
  AND (
    EXISTS (
      SELECT 1 FROM public.test_results r
      WHERE r.student_id = auth.uid()
        AND position(r.test_id::text in name) > 0
    )
    OR EXISTS (
      SELECT 1 FROM public.test_sessions s
      WHERE s.student_id = auth.uid()
        AND position(s.test_id::text in name) > 0
    )
  )
);