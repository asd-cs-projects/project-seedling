UPDATE public.user_roles ur
SET role = 'teacher'::public.app_role
FROM auth.users u
WHERE ur.user_id = u.id AND u.email = 'teacher.asd@gmail.com';