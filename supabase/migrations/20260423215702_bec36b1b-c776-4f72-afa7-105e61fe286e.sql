-- ============================================================
-- SECURITY FIX 1: Prevent privilege escalation via user_roles
-- Restrict self-insert to 'student' role only. Teacher/admin
-- roles must be assigned by an admin or via a trusted server flow.
-- ============================================================
DROP POLICY IF EXISTS "Users can insert their own role" ON public.user_roles;

CREATE POLICY "Users can self-assign student role only"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id AND role = 'student'::public.app_role);

-- ============================================================
-- SECURITY FIX 2: Restrict passages SELECT to authenticated users
-- ============================================================
DROP POLICY IF EXISTS "Students can view passages" ON public.passages;

CREATE POLICY "Authenticated users can view passages for active tests"
ON public.passages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tests
    WHERE tests.id = passages.test_id AND tests.is_active = true
  )
);

-- ============================================================
-- SECURITY FIX 3: Restrict test-files storage bucket writes
-- Only teachers (who own a test) may upload/update/delete.
-- Reads remain public since bucket is public for media display.
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload to test-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update test-files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete test-files" ON storage.objects;

CREATE POLICY "Teachers can upload to test-files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'test-files'
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
);

CREATE POLICY "Teachers can update their own test-files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'test-files'
  AND owner = auth.uid()
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
);

CREATE POLICY "Teachers can delete their own test-files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'test-files'
  AND owner = auth.uid()
  AND public.has_role(auth.uid(), 'teacher'::public.app_role)
);
