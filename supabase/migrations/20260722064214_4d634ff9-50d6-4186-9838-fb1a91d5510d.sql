
-- 1. Add super_admin to app_role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';

-- Commit the enum add so it's usable in the same migration
COMMIT;
BEGIN;

-- 2. Organizations table
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER organizations_updated BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  full_name text,
  email text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Helper functions (SECURITY DEFINER — bypass RLS to avoid recursion)
CREATE OR REPLACE FUNCTION public.current_user_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id = _user_id AND status = 'approved')
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_org() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_approved(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_org() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_approved(uuid) TO authenticated;

-- 5. Seed default organization for existing data
INSERT INTO public.organizations (id, name, status)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Organization', 'approved');

-- 6. Add org_id to existing tables
ALTER TABLE public.categories       ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.suppliers        ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.products         ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.transactions     ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.supplier_messages ADD COLUMN org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

UPDATE public.categories        SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.suppliers         SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.products          SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.transactions      SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;
UPDATE public.supplier_messages SET org_id = '00000000-0000-0000-0000-000000000001' WHERE org_id IS NULL;

ALTER TABLE public.categories        ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.suppliers         ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.products          ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.transactions      ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.supplier_messages ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX idx_categories_org        ON public.categories(org_id);
CREATE INDEX idx_suppliers_org         ON public.suppliers(org_id);
CREATE INDEX idx_products_org          ON public.products(org_id);
CREATE INDEX idx_transactions_org      ON public.transactions(org_id);
CREATE INDEX idx_supplier_messages_org ON public.supplier_messages(org_id);

-- 7. Signup trigger: create profile + organization + admin role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id uuid;
  v_org_name text;
  v_full_name text;
  v_is_super boolean;
BEGIN
  v_org_name := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'org_name'), ''), 'My Organization');
  v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), '');
  v_is_super  := (LOWER(NEW.email) = 'zerotheorys@gmail.com');

  IF v_is_super THEN
    -- Attach super admin to the default org (approved)
    v_org_id := '00000000-0000-0000-0000-000000000001';
    INSERT INTO public.profiles (id, org_id, full_name, email, status)
    VALUES (NEW.id, v_org_id, v_full_name, NEW.email, 'approved');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.organizations (name, status, created_by)
    VALUES (v_org_name, 'pending', NEW.id)
    RETURNING id INTO v_org_id;

    INSERT INTO public.profiles (id, org_id, full_name, email, status)
    VALUES (NEW.id, v_org_id, v_full_name, NEW.email, 'pending');

    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. RLS policies

-- profiles
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Users update own profile name" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid() AND status = (SELECT status FROM public.profiles WHERE id = auth.uid()));

-- organizations
CREATE POLICY "Users read own org" ON public.organizations FOR SELECT TO authenticated
  USING (id = public.current_user_org() OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "Super admin manage orgs" ON public.organizations FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Replace existing data policies with org-scoped versions
DROP POLICY IF EXISTS "Staff can manage products" ON public.products;
DROP POLICY IF EXISTS "Staff can manage categories" ON public.categories;
DROP POLICY IF EXISTS "Staff can manage suppliers" ON public.suppliers;
DROP POLICY IF EXISTS "Users can view messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can create messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can update own or admin" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can delete own or admin" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can create transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own or admin" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own or admin" ON public.transactions;

-- Products
CREATE POLICY "Org members read products" ON public.products FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members write products" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members update products" ON public.products FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members delete products" ON public.products FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));

-- Categories
CREATE POLICY "Org members read categories" ON public.categories FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members write categories" ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members update categories" ON public.categories FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members delete categories" ON public.categories FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));

-- Suppliers
CREATE POLICY "Org members read suppliers" ON public.suppliers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members write suppliers" ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members update suppliers" ON public.suppliers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members delete suppliers" ON public.suppliers FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));

-- Transactions
CREATE POLICY "Org members read transactions" ON public.transactions FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members write transactions" ON public.transactions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members update transactions" ON public.transactions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members delete transactions" ON public.transactions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));

-- Supplier messages
CREATE POLICY "Org members read messages" ON public.supplier_messages FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members write messages" ON public.supplier_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members update messages" ON public.supplier_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));
CREATE POLICY "Org members delete messages" ON public.supplier_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin') OR (public.is_approved(auth.uid()) AND org_id = public.current_user_org()));

-- 9. Backfill profiles/roles for any existing auth users (attach to default org, approved)
INSERT INTO public.profiles (id, org_id, full_name, email, status)
SELECT u.id,
       '00000000-0000-0000-0000-000000000001',
       COALESCE(u.raw_user_meta_data->>'full_name', ''),
       u.email,
       'approved'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Promote zerotheorys@gmail.com if already registered
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'::app_role FROM auth.users u
WHERE LOWER(u.email) = 'zerotheorys@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
