
CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$$;
