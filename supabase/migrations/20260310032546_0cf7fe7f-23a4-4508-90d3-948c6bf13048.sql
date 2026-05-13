CREATE POLICY "Teachers can delete sessions for their tests"
ON public.test_sessions
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tests
    WHERE tests.id = test_sessions.test_id
    AND tests.teacher_id = auth.uid()
  )
);