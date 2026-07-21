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

export function stockStatus(p: Pick<Product, "quantity" | "reorder_threshold">): "out" | "low" | "ok" {
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
  const csv = [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
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