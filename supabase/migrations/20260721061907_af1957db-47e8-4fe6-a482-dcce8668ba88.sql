CREATE TABLE public.supplier_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL CHECK (channel IN ('email','call')),
  recipient TEXT,
  subject TEXT,
  body TEXT,
  quantity_at_send INTEGER,
  threshold_at_send INTEGER,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_messages TO authenticated;
GRANT ALL ON public.supplier_messages TO service_role;
ALTER TABLE public.supplier_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth manage supplier_messages" ON public.supplier_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX supplier_messages_product_idx ON public.supplier_messages(product_id, created_at DESC);