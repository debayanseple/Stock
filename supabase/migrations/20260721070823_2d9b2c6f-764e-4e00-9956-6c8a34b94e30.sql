-- Remove automatic staff role grant on signup
DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;
DROP TRIGGER IF EXISTS assign_default_role_trigger ON auth.users;
DROP FUNCTION IF EXISTS public.assign_default_role();

-- Ensure at least one admin exists so roles can be managed going forward.
-- Promote the earliest existing user to admin only if no admin currently exists.
DO $$
DECLARE
  first_user uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    SELECT id INTO first_user FROM auth.users ORDER BY created_at ASC LIMIT 1;
    IF first_user IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role)
      VALUES (first_user, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
END $$;