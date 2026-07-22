
DO $$
DECLARE
  super_id uuid;
BEGIN
  SELECT id INTO super_id FROM auth.users WHERE lower(email) = 'zerotheorys@gmail.com' LIMIT 1;

  DELETE FROM public.transactions;
  DELETE FROM public.supplier_messages;
  DELETE FROM public.products;
  DELETE FROM public.categories;
  DELETE FROM public.suppliers;
  DELETE FROM public.org_invites;

  IF super_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE user_id <> super_id;
    DELETE FROM public.profiles WHERE id <> super_id;
    DELETE FROM public.organizations WHERE id <> (SELECT org_id FROM public.profiles WHERE id = super_id);
    DELETE FROM auth.users WHERE id <> super_id;
  ELSE
    DELETE FROM public.user_roles;
    DELETE FROM public.profiles;
    DELETE FROM public.organizations;
    DELETE FROM auth.users;
  END IF;
END $$;
