-- Allow teachers to insert/update any student's summary (for teacher-generated AI summaries)
CREATE POLICY "Teachers can insert student summaries"
ON public.student_summaries
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can update student summaries"
ON public.student_summaries
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'admin'::app_role));