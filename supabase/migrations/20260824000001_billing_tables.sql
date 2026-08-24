-- Billing tables for POS/invoicing

-- Payment method enum
DO $$ BEGIN
  CREATE TYPE public.payment_method AS ENUM ('cash', 'upi', 'card', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Payment status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'partial', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Bills table
CREATE TABLE IF NOT EXISTS public.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_name text,
  customer_phone text,
  customer_email text,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  tax_amount numeric(12,2) NOT NULL DEFAULT 0,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_status public.payment_status NOT NULL DEFAULT 'pending',
  payment_method public.payment_method,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  due_amount numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.bills TO authenticated;
GRANT ALL ON public.bills TO service_role;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can manage bills" ON public.bills;
CREATE POLICY "Staff can manage bills"
  ON public.bills FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'staff') OR public.has_role(auth.uid(), 'admin'));

-- Bill items table (line items)
CREATE TABLE IF NOT EXISTS public.bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name text NOT NULL,
  product_sku text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.bill_items TO authenticated;
GRANT ALL ON public.bill_items TO service_role;

ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;

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

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bills_org_id ON public.bills(org_id);
CREATE INDEX IF NOT EXISTS idx_bills_created_at ON public.bills(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_customer_phone ON public.bills(customer_phone);
CREATE INDEX IF NOT EXISTS idx_bill_items_bill_id ON public.bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_items_product_id ON public.bill_items(product_id);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_bills_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_bills_updated ON public.bills;
CREATE TRIGGER on_bills_updated
  BEFORE UPDATE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.update_bills_updated_at();

-- Function to create bill with stock adjustment (atomic)
CREATE OR REPLACE FUNCTION public.create_bill_with_stock(
  _org_id uuid,
  _customer_name text,
  _customer_phone text,
  _customer_email text,
  _items jsonb, -- array of {product_id, quantity, unit_price}
  _payment_method public.payment_method,
  _paid_amount numeric,
  _notes text,
  _discount_amount numeric DEFAULT 0,
  _tax_amount numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_current_stock integer;
  v_product_name text;
  v_product_sku text;
  v_due_amount numeric;
  v_total_amount numeric;
BEGIN
  -- Validate and calculate totals
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;

    -- Check stock
    SELECT quantity, name, sku INTO v_current_stock, v_product_name, v_product_sku
    FROM public.products
    WHERE id = v_product_id AND org_id = _org_id
    FOR UPDATE; -- Lock row

    IF v_current_stock < v_quantity THEN
      RAISE EXCEPTION 'Insufficient stock for product % (SKU: %). Available: %, Requested: %', v_product_name, v_product_sku, v_current_stock, v_quantity;
    END IF;

    v_line_total := v_unit_price * v_quantity;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;

  v_total_amount := v_subtotal + _tax_amount - _discount_amount;
  v_due_amount := v_total_amount - _paid_amount;

  -- Determine payment status
  IF _paid_amount >= v_total_amount THEN
    -- paid
  ELSIF _paid_amount > 0 THEN
    -- partial
  ELSE
    -- pending
  END IF;

  -- Insert bill
  INSERT INTO public.bills (
    org_id, customer_name, customer_phone, customer_email,
    subtotal, tax_amount, discount_amount, total_amount,
    payment_status, payment_method, paid_amount, due_amount,
    notes, created_by
  ) VALUES (
    _org_id, _customer_name, _customer_phone, _customer_email,
    v_subtotal, _tax_amount, _discount_amount, v_total_amount,
    CASE
      WHEN _paid_amount >= v_total_amount THEN 'paid'::public.payment_status
      WHEN _paid_amount > 0 THEN 'partial'::public.payment_status
      ELSE 'pending'::public.payment_status
    END,
    _payment_method, _paid_amount, v_due_amount,
    _notes, auth.uid()
  ) RETURNING id INTO v_bill_id;

  -- Insert bill items and create stock-out transactions
  FOR v_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    v_product_id := (v_item->>'product_id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    v_unit_price := (v_item->>'unit_price')::numeric;
    v_line_total := v_unit_price * v_quantity;

    -- Get product name/sku (already fetched above, but re-fetch for safety)
    SELECT name, sku INTO v_product_name, v_product_sku
    FROM public.products WHERE id = v_product_id;

    -- Insert bill item
    INSERT INTO public.bill_items (bill_id, product_id, product_name, product_sku, unit_price, quantity, line_total)
    VALUES (v_bill_id, v_product_id, v_product_name, v_product_sku, v_unit_price, v_quantity, v_line_total);

    -- Create stock-out transaction
    INSERT INTO public.transactions (org_id, product_id, type, quantity, notes, created_by)
    VALUES (_org_id, v_product_id, 'out', v_quantity, 'Sale via bill #' || v_bill_id, auth.uid());

    -- Decrement product quantity
    UPDATE public.products
    SET quantity = quantity - v_quantity, updated_at = now()
    WHERE id = v_product_id;
  END LOOP;

  RETURN v_bill_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bill_with_stock TO authenticated;