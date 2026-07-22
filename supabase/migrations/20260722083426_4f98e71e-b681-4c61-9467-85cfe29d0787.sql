
-- 1) org_invites table
CREATE TABLE public.org_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role app_role NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_invites_role_check CHECK (role IN ('admin','staff'))
);

CREATE INDEX org_invites_org_idx ON public.org_invites(org_id);
CREATE INDEX org_invites_email_idx ON public.org_invites(lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_invites TO authenticated;
GRANT ALL ON public.org_invites TO service_role;

ALTER TABLE public.org_invites ENABLE ROW LEVEL SECURITY;

-- Org admins (or super admin) can view/manage their org's invites
CREATE POLICY "Org admins view org invites" ON public.org_invites
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "Org admins create invites" ON public.org_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    AND invited_by = auth.uid()
  );

CREATE POLICY "Org admins delete invites" ON public.org_invites
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER trg_org_invites_updated_at BEFORE UPDATE ON public.org_invites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) Function to look up an invite by token (bypasses RLS, used from unauthenticated signup)
CREATE OR REPLACE FUNCTION public.get_invite_by_token(_token text)
RETURNS TABLE(id uuid, org_id uuid, org_name text, email text, role app_role, expires_at timestamptz, accepted_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.org_id, o.name AS org_name, i.email, i.role, i.expires_at, i.accepted_at
  FROM public.org_invites i
  JOIN public.organizations o ON o.id = i.org_id
  WHERE i.token = _token
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.get_invite_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_by_token(text) TO anon, authenticated;

-- 3) Update per-role member limit: max 1 admin + 1 staff per org (excluding super_admin)
CREATE OR REPLACE FUNCTION public.enforce_org_member_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_super boolean;
  v_admin_count int;
  v_staff_count int;
BEGIN
  IF NEW.org_id IS NULL OR NEW.status <> 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT public.has_role(NEW.id, 'super_admin'::app_role) INTO v_is_super;
  IF v_is_super THEN RETURN NEW; END IF;

  -- If nothing meaningful changed, allow
  IF TG_OP = 'UPDATE' AND OLD.org_id = NEW.org_id AND OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE public.has_role(p.id, 'admin'::app_role)),
    COUNT(*) FILTER (WHERE NOT public.has_role(p.id, 'admin'::app_role))
  INTO v_admin_count, v_staff_count
  FROM public.profiles p
  WHERE p.org_id = NEW.org_id
    AND p.status = 'approved'
    AND p.id <> NEW.id
    AND NOT public.has_role(p.id, 'super_admin'::app_role);

  IF public.has_role(NEW.id, 'admin'::app_role) THEN
    IF v_admin_count >= 1 THEN
      RAISE EXCEPTION 'This organization already has an admin (limit: 1 admin, 1 staff).';
    END IF;
  ELSE
    IF v_staff_count >= 1 THEN
      RAISE EXCEPTION 'This organization already has a staff member (limit: 1 admin, 1 staff).';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4) Update handle_new_user to honor invite_token from metadata:
--    - attaches to invite's org as approved with the invite's role, consumes the invite,
--    - no new org, no super-admin approval needed.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_org_name text;
  v_full_name text;
  v_is_super boolean;
  v_invite_token text;
  v_invite record;
BEGIN
  v_org_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'org_name'), ''), 'My Organization');
  v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
  v_is_super  := (LOWER(NEW.email) = 'zerotheorys@gmail.com');
  v_invite_token := NULLIF(TRIM(NEW.raw_user_meta_data->>'invite_token'), '');

  IF v_is_super THEN
    v_org_id := '00000000-0000-0000-0000-000000000001';
    INSERT INTO public.profiles (id, org_id, full_name, email, status)
    VALUES (NEW.id, v_org_id, v_full_name, NEW.email, 'approved');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    RETURN NEW;
  END IF;

  IF v_invite_token IS NOT NULL THEN
    SELECT * INTO v_invite FROM public.org_invites
      WHERE token = v_invite_token
        AND accepted_at IS NULL
        AND expires_at > now()
      LIMIT 1;

    IF v_invite.id IS NOT NULL THEN
      -- Join existing org as approved with the invite's role
      INSERT INTO public.profiles (id, org_id, full_name, email, status)
      VALUES (NEW.id, v_invite.org_id, v_full_name, NEW.email, 'approved');

      INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, v_invite.role)
        ON CONFLICT (user_id, role) DO NOTHING;

      UPDATE public.org_invites
        SET accepted_at = now(), accepted_by = NEW.id, updated_at = now()
        WHERE id = v_invite.id;

      RETURN NEW;
    END IF;
    -- If invite invalid/expired, fall through to normal signup
  END IF;

  -- Normal signup: new pending org
  INSERT INTO public.organizations (name, status, created_by)
  VALUES (v_org_name, 'pending', NEW.id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.profiles (id, org_id, full_name, email, status)
  VALUES (NEW.id, v_org_id, v_full_name, NEW.email, 'pending');

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;
