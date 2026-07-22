
-- Helper: is _user_id an admin of _org_id?
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

-- profiles: org admins can read profiles in their org
CREATE POLICY "Org admins read org profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.is_org_admin(auth.uid(), org_id));

-- profiles: org admins can update status of other members in their org
CREATE POLICY "Org admins update org member status"
ON public.profiles FOR UPDATE
TO authenticated
USING (
  public.is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
)
WITH CHECK (
  public.is_org_admin(auth.uid(), org_id)
  AND id <> auth.uid()
);

-- user_roles: remove over-permissive global admin policies
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

-- user_roles: org admins can read roles for members of their org
CREATE POLICY "Org admins read org roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND public.is_org_admin(auth.uid(), p.org_id)
  )
);

-- user_roles: org admins can insert non-super_admin roles for members of their org
CREATE POLICY "Org admins insert org roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (
  role <> 'super_admin'
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND public.is_org_admin(auth.uid(), p.org_id)
  )
);

-- user_roles: org admins can delete non-super_admin roles for members of their org
CREATE POLICY "Org admins delete org roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (
  role <> 'super_admin'
  AND user_id <> auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = user_roles.user_id
      AND public.is_org_admin(auth.uid(), p.org_id)
  )
);

-- Super admins retain full access via existing "Super admin manage profiles" policy
-- and can manage user_roles by adding this explicit policy:
CREATE POLICY "Super admin manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
