
-- Hide super_admin from org admins' views of profiles & user_roles
DROP POLICY IF EXISTS "Org admins read org profiles" ON public.profiles;
CREATE POLICY "Org admins read org profiles" ON public.profiles
FOR SELECT
USING (
  is_org_admin(auth.uid(), org_id)
  AND NOT public.has_role(id, 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins update org member status" ON public.profiles;
CREATE POLICY "Org admins update org member status" ON public.profiles
FOR UPDATE
USING (
  is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
  AND NOT public.has_role(id, 'super_admin'::app_role)
)
WITH CHECK (
  is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
  AND NOT public.has_role(id, 'super_admin'::app_role)
);

DROP POLICY IF EXISTS "Org admins read org roles" ON public.user_roles;
CREATE POLICY "Org admins read org roles" ON public.user_roles
FOR SELECT
USING (
  role <> 'super_admin'::app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id AND is_org_admin(auth.uid(), p.org_id)
  )
);

-- Enforce max 2 approved members per organization (excluding super_admin)
CREATE OR REPLACE FUNCTION public.enforce_org_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_is_super boolean;
BEGIN
  IF NEW.org_id IS NULL OR NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  -- Skip check for super_admin users
  SELECT public.has_role(NEW.id, 'super_admin'::app_role) INTO v_is_super;
  IF v_is_super THEN RETURN NEW; END IF;

  -- If unchanged status/org, allow
  IF TG_OP = 'UPDATE' AND OLD.org_id = NEW.org_id AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.profiles p
  WHERE p.org_id = NEW.org_id
    AND p.status = 'approved'
    AND p.id <> NEW.id
    AND NOT public.has_role(p.id, 'super_admin'::app_role);

  IF v_count >= 2 THEN
    RAISE EXCEPTION 'This organization has reached the maximum of 2 approved members.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_org_member_limit_trg ON public.profiles;
CREATE TRIGGER enforce_org_member_limit_trg
BEFORE INSERT OR UPDATE OF status, org_id ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_org_member_limit();
