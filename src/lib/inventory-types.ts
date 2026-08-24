export type Category = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
};

export type Product = {
  id: string;
  name: string;
  sku: string;
  category_id: string | null;
  supplier_id: string | null;
  unit_price: number;
  quantity: number;
  reorder_threshold: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type TxnType = "in" | "out";

export type Transaction = {
  id: string;
  product_id: string;
  type: TxnType;
  quantity: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export function stockStatus(
  p: Pick<Product, "quantity" | "reorder_threshold">,
): "out" | "low" | "ok" {
  if (p.quantity <= 0) return "out";
  if (p.quantity <= p.reorder_threshold) return "low";
  return "ok";
}

export function formatINR(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function downloadCSV(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) {
    const blob = new Blob([""], { type: "text/csv" });
    triggerDownload(filename, blob);
    return;
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v).replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  triggerDownload(filename, new Blob([csv], { type: "text/csv" }));
}

function triggerDownload(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type PaymentMethod = "cash" | "upi" | "card" | "other";
export type PaymentStatus = "pending" | "partial" | "paid";

export type BillItem = {
  id: string;
  bill_id: string;
  product_id: string;
  product_name: string;
  product_sku: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  created_at: string;
};

export type Bill = {
  id: string;
  org_id: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod | null;
  paid_amount: number;
  due_amount: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items?: BillItem[];
};
