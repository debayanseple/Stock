-- Restore correct argument order: (_user_id, _org_id).
-- A previous direct edit swapped them to (_org_id, _user_id), which made
-- is_org_admin(auth.uid(), org_id) inside RLS policies always evaluate false,
-- so org admins could not see staff members on the Team members page.
-- Parameter names cannot be changed via CREATE OR REPLACE, and the policies
-- below depend on this function, so we drop both and recreate exactly as
-- defined in migrations 20260722070004 / 20260722072411.

DROP FUNCTION public.is_org_admin(uuid, uuid) CASCADE;

CREATE OR REPLACE FUNCTION public.is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = _user_id
      AND ur.role = 'admin'
      AND p.org_id = _org_id
      AND p.status = 'approved'
  )
$$;

REVOKE EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid, uuid) TO authenticated;

-- Recreate policies dropped by CASCADE

CREATE POLICY "Org admins read org profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND NOT public.has_role(id, 'super_admin'::app_role)
);

CREATE POLICY "Org admins update org member status"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
  AND NOT public.has_role(id, 'super_admin'::app_role)
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
  AND NOT public.has_role(id, 'super_admin'::app_role)
);

CREATE POLICY "Org admins read org roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  role <> 'super_admin'::app_role
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id AND public.is_org_admin(auth.uid(), p.org_id)
  )
);

CREATE POLICY "Org admins delete org roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (
  role <> 'super_admin'::app_role
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id AND public.is_org_admin(auth.uid(), p.org_id)
  )
);
