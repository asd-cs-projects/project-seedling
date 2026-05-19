CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.app_role;
  v_age integer;
  v_student_id text;
BEGIN
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.app_role, 'student'::public.app_role);
  v_age := NULLIF(NEW.raw_user_meta_data ->> 'age', '')::integer;
  v_student_id := NULLIF(NEW.raw_user_meta_data ->> 'student_id', '');

  IF v_student_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.profiles WHERE lower(student_id) = lower(v_student_id))
  THEN
    v_student_id := NULL;
  END IF;

  INSERT INTO public.profiles (user_id, full_name, student_id, grade, class, gender, age, subject)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email),
    v_student_id,
    NULLIF(NEW.raw_user_meta_data ->> 'grade', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'class', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'gender', ''),
    v_age,
    NULLIF(NEW.raw_user_meta_data ->> 'subject', '')
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    updated_at = now();

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

INSERT INTO public.profiles (user_id, full_name, grade, class, gender, age, subject)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'full_name', ''), u.email),
  NULLIF(u.raw_user_meta_data ->> 'grade', ''),
  NULLIF(u.raw_user_meta_data ->> 'class', ''),
  NULLIF(u.raw_user_meta_data ->> 'gender', ''),
  NULLIF(u.raw_user_meta_data ->> 'age', '')::integer,
  NULLIF(u.raw_user_meta_data ->> 'subject', '')
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p
SET student_id = sub.requested_id
FROM (
  SELECT u.id, NULLIF(u.raw_user_meta_data ->> 'student_id', '') AS requested_id
  FROM auth.users u
) sub
WHERE sub.id = p.user_id
  AND p.student_id IS NULL
  AND sub.requested_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.profiles p2
    WHERE p2.user_id <> p.user_id
      AND lower(p2.student_id) = lower(sub.requested_id)
  );

INSERT INTO public.user_roles (user_id, role)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'role', '')::public.app_role, 'student'::public.app_role)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id)
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'teacher'::public.app_role
FROM auth.users u
WHERE u.raw_user_meta_data ->> 'role' = 'teacher'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE auth.users
SET email_confirmed_at = now()
WHERE email_confirmed_at IS NULL;

INSERT INTO storage.buckets (id, name, public)
VALUES ('test-files', 'test-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "Teachers can upload to test-files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can update their own test-files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete their own test-files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can update their test-files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can delete their test-files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can read their own test files" ON storage.objects;
DROP POLICY IF EXISTS "Teachers can read their test files" ON storage.objects;
DROP POLICY IF EXISTS "Students can read files for tests they have access to" ON storage.objects;
DROP POLICY IF EXISTS "Students can read assigned test files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read uploaded test files" ON storage.objects;

CREATE POLICY "Teachers can upload to test-files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role));

CREATE POLICY "Teachers can update their test-files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role))
WITH CHECK (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role));

CREATE POLICY "Teachers can delete their test-files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role));

CREATE POLICY "Teachers can read their test files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'test-files' AND public.has_role(auth.uid(), 'teacher'::public.app_role));

CREATE POLICY "Students can read assigned test files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'test-files' AND (
    EXISTS (SELECT 1 FROM public.test_results r WHERE r.student_id = auth.uid() AND (storage.foldername(name))[1] = r.test_id::text)
    OR EXISTS (SELECT 1 FROM public.test_sessions s WHERE s.student_id = auth.uid() AND (storage.foldername(name))[1] = s.test_id::text)
    OR EXISTS (SELECT 1 FROM public.tests t WHERE t.is_active = true AND (storage.foldername(name))[1] = t.id::text)
  )
);