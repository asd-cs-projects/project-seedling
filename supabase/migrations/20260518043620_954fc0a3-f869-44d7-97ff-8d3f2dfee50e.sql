
-- Recreate handle_new_user to populate profile + role atomically from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.app_role;
BEGIN
  -- Profile
  INSERT INTO public.profiles (
    user_id, full_name, student_id, grade, class, gender, age, subject
  ) VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email),
    NULLIF(NEW.raw_user_meta_data ->> 'student_id', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'grade', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'class', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'gender', ''),
    NULLIF(NEW.raw_user_meta_data ->> 'age', '')::int,
    NULLIF(NEW.raw_user_meta_data ->> 'subject', '')
  )
  ON CONFLICT (user_id) DO NOTHING;

  -- Role
  v_role := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.app_role, 'student');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Unique profiles.user_id (for ON CONFLICT)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_user_id_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Unique school ID (case-insensitive, only when set)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_student_id_unique
  ON public.profiles (lower(student_id))
  WHERE student_id IS NOT NULL;
