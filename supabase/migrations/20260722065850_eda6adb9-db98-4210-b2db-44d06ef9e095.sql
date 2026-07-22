
DROP POLICY IF EXISTS "Staff can view supplier messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Staff can insert own supplier messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can update own supplier messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Users can delete own supplier messages" ON public.supplier_messages;

DROP POLICY IF EXISTS "Staff can view transactions" ON public.transactions;
DROP POLICY IF EXISTS "Staff can insert own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete own transactions" ON public.transactions;

-- Tighten update/delete on transactions & supplier_messages to owner-or-admin within same org
CREATE POLICY "Org owner or admin update transactions" ON public.transactions
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);

DROP POLICY IF EXISTS "Org members update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Org members delete transactions" ON public.transactions;

CREATE POLICY "Org owner or admin delete transactions" ON public.transactions
FOR DELETE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);

CREATE POLICY "Org owner or admin update messages" ON public.supplier_messages
FOR UPDATE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
) WITH CHECK (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);

DROP POLICY IF EXISTS "Org members update messages" ON public.supplier_messages;
DROP POLICY IF EXISTS "Org members delete messages" ON public.supplier_messages;

CREATE POLICY "Org owner or admin delete messages" ON public.supplier_messages
FOR DELETE USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR (is_approved(auth.uid()) AND org_id = current_user_org()
      AND (created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)))
);
