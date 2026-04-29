-- Re-attach the trigger that creates a profile + role row for each new auth user.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: ensure every existing user has a profile row.
INSERT INTO public.profiles (user_id, full_name)
SELECT u.id, COALESCE(u.raw_user_meta_data ->> 'full_name', u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.user_id = u.id
WHERE p.id IS NULL;

-- Backfill: ensure every existing user has a role.
-- Use the role stored in auth metadata when available, otherwise default to student.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id,
       COALESCE(NULLIF(u.raw_user_meta_data ->> 'role', ''), 'student')::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur ON ur.user_id = u.id
WHERE ur.id IS NULL;