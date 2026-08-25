import type { Category, Supplier } from "@/lib/inventory-types";

export const PRODUCT_CSV_TEMPLATE_HEADERS = [
  "name",
  "sku",
  "category",
  "supplier",
  "unit_price",
  "quantity",
  "reorder_threshold",
  "description",
] as const;

export function buildProductTemplate(): string {
  return [
    PRODUCT_CSV_TEMPLATE_HEADERS.join(","),
    [
      "Sample Soap",
      "SOAP-001",
      "Personal Care",
      "Acme Supplies",
      "49.99",
      "100",
      "10",
      "Rose fragrance 100g",
    ].join(","),
    ["Sample Chips", "CHIPS-001", "Snacks", "", "20", "50", "5", ""].join(","),
  ].join("\n");
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF. */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cur);
    cur = "";
  };
  const pushRow = () => {
    if (row.some((c) => c.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") pushCell();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      pushCell();
      pushRow();
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    pushCell();
    pushRow();
  }
  return rows;
}

export type ParsedProduct = {
  name: string;
  sku: string;
  category_name: string | null;
  supplier_name: string | null;
  unit_price: number;
  quantity: number;
  reorder_threshold: number;
  description: string | null;
};

export type CsvRowError = { row: number; message: string };

export function parseProductsCsv(
  text: string,
  opts: {
    categories: Category[];
    suppliers: Supplier[];
    existingSkus: Set<string>; // lowercase
  },
): { items: ParsedProduct[]; errors: CsvRowError[]; totalDataRows: number } {
  const rows = parseCsvRows(text);
  const errors: CsvRowError[] = [];
  const items: ParsedProduct[] = [];
  const seenSkus = new Set<string>();

  if (rows.length === 0)
    return { items, errors: [{ row: 0, message: "File is empty" }], totalDataRows: 0 };

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => headers.findIndex((h) => names.includes(h));
  const cName = idx("name", "product name");
  const cSku = idx("sku", "code");
  const cCat = idx("category", "category name");
  const cSup = idx("supplier", "supplier name");
  const cPrice = idx("unit_price", "price", "mrp");
  const cQty = idx("quantity", "qty", "stock");
  const cThresh = idx("reorder_threshold", "threshold", "reorder");
  const cDesc = idx("description", "notes");

  if (cName === -1 || cSku === -1 || cPrice === -1)
    return {
      items,
      errors: [{ row: 1, message: 'Missing required columns: "name", "sku", "unit_price"' }],
      totalDataRows: rows.length - 1,
    };

  const dataRows = rows.slice(1);
  dataRows.forEach((cells, i) => {
    const rowNo = i + 2; // 1-based incl. header
    const get = (ci: number) => (ci >= 0 && ci < cells.length ? cells[ci].trim() : "");
    const name = get(cName);
    const sku = get(cSku).toUpperCase();
    const priceStr = get(cPrice);
    const qtyStr = get(cQty);
    const threshStr = get(cThresh);
    const catName = cCat >= 0 ? get(cCat) : "";
    const supName = cSup >= 0 ? get(cSup) : "";

    if (!name) return errors.push({ row: rowNo, message: "name is required" });
    if (!sku) return errors.push({ row: rowNo, message: "sku is required" });
    const skuKey = sku.toLowerCase();
    if (opts.existingSkus.has(skuKey))
      return errors.push({ row: rowNo, message: `SKU "${sku}" already exists` });
    if (seenSkus.has(skuKey))
      return errors.push({ row: rowNo, message: `Duplicate SKU "${sku}" in file` });

    const unit_price = Number(priceStr);
    if (priceStr === "" || Number.isNaN(unit_price) || unit_price <= 0)
      return errors.push({ row: rowNo, message: "unit_price must be a number > 0" });

    const quantity = qtyStr === "" ? 0 : Number(qtyStr);
    if (Number.isNaN(quantity) || !Number.isInteger(quantity) || quantity < 0)
      return errors.push({ row: rowNo, message: "quantity must be a whole number ≥ 0" });

    const reorder_threshold = threshStr === "" ? 0 : Number(threshStr);
    if (
      Number.isNaN(reorder_threshold) ||
      !Number.isInteger(reorder_threshold) ||
      reorder_threshold < 0
    )
      return errors.push({ row: rowNo, message: "reorder_threshold must be a whole number ≥ 0" });

    seenSkus.add(skuKey);
    // Keep unknown category/supplier names — they may be auto-created, or nulled.
    items.push({
      name,
      sku,
      category_name: catName || null,
      supplier_name: supName || null,
      unit_price,
      quantity,
      reorder_threshold,
      description: get(cDesc) || null,
    });
  });

  return { items, errors, totalDataRows: dataRows.length };
}

export function resolveRefIds<T extends { id: string; name: string }>(
  name: string | null,
  list: T[],
): string | null {
  if (!name) return null;
  return list.find((x) => x.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}
