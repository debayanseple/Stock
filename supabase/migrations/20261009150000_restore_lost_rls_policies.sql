-- Restore RLS policies lost to a CASCADE drop.
--
-- 20260826070432_fix_is_org_admin_arg_order ran
--   DROP FUNCTION public.is_org_admin(uuid, uuid) CASCADE;
-- which silently dropped every policy that referenced it. That migration
-- only recreated the profiles and user_roles policies, leaving
-- org_invites, bills and bill_items with RLS enabled and ZERO policies.
--
-- Effect: any client INSERT/SELECT against those tables fails with
-- "new row violates row-level security policy for table org_invites".
-- Bill creation kept working because create_bill_with_stock() is
-- SECURITY DEFINER (it bypasses RLS), but Bill History and team invites
-- did not.
--
-- Definitions below are restored verbatim from their original migrations:
--   org_invites  -> 20260722083426_4f98e71e
--   bills        -> 20260824000001_billing_tables
--   bill_items   -> 20260824000001_billing_tables

-- ---------- org_invites ----------
DROP POLICY IF EXISTS "Org admins view org invites" ON public.org_invites;
CREATE POLICY "Org admins view org invites" ON public.org_invites
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

DROP POLICY IF EXISTS "Org admins create invites" ON public.org_invites;
CREATE POLICY "Org admins create invites" ON public.org_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_org_admin(auth.uid(), org_id)
    AND invited_by = auth.uid()
  );

DROP POLICY IF EXISTS "Org admins delete invites" ON public.org_invites;
CREATE POLICY "Org admins delete invites" ON public.org_invites
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(auth.uid(), org_id)
    OR public.has_role(auth.uid(), 'super_admin')
  );

-- ---------- bills ----------
DROP POLICY IF EXISTS "Staff can manage bills" ON public.bills;
CREATE POLICY "Staff can manage bills"
  ON public.bills FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- ---------- bill_items ----------
DROP POLICY IF EXISTS "Staff can manage bill items" ON public.bill_items;
CREATE POLICY "Staff can manage bill items"
  ON public.bill_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id
      AND (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bills b
      WHERE b.id = bill_items.bill_id
      AND (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
    )
  );