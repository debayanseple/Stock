import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, Search, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight } from "lucide-react";
import type { Category, Product, Supplier } from "@/lib/inventory-types";
import { stockStatus, downloadCSV } from "@/lib/inventory-types";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({ meta: [{ title: "Products — StockHub" }] }),
  component: ProductsPage,
});

type Form = {
  name: string; sku: string; category_id: string; supplier_id: string;
  unit_price: string; quantity: string; reorder_threshold: string; description: string;
};
type FieldErrors = Partial<Record<"name" | "sku" | "unit_price" | "quantity" | "reorder_threshold", string>>;
const emptyForm: Form = { name: "", sku: "", category_id: "", supplier_id: "", unit_price: "0", quantity: "0", reorder_threshold: "0", description: "" };

function ProductsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const skuRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);
  const thresholdRef = useRef<HTMLInputElement>(null);
  const [txnOpen, setTxnOpen] = useState<{ product: Product; type: "in" | "out" } | null>(null);
  const [txnQty, setTxnQty] = useState("1");
  const [txnNotes, setTxnNotes] = useState("");
  const [txnError, setTxnError] = useState<string | null>(null);
  const txnQtyRef = useRef<HTMLInputElement>(null);

  const [globalTxnOpen, setGlobalTxnOpen] = useState(false);
  const [globalTxnProductId, setGlobalTxnProductId] = useState("");
  const [globalTxnType, setGlobalTxnType] = useState<"in" | "out">("in");
  const [globalTxnQty, setGlobalTxnQty] = useState("1");
  const [globalTxnNotes, setGlobalTxnNotes] = useState("");
  const [globalTxnError, setGlobalTxnError] = useState<string | null>(null);
  const globalTxnQtyRef = useRef<HTMLInputElement>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data as Category[];
    },
  });
  const suppliers = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const catMap = useMemo(() => new Map((categories.data ?? []).map((c) => [c.id, c.name])), [categories.data]);
  const supMap = useMemo(() => new Map((suppliers.data ?? []).map((s) => [s.id, s.name])), [suppliers.data]);

  const validateForm = (f: Form): FieldErrors => {
    const e: FieldErrors = {};
    if (!f.name.trim()) e.name = "Name is required";
    const sku = f.sku.trim();
    if (!sku) e.sku = "SKU is required";
    else {
      const dup = (products.data ?? []).some((p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== editing?.id);
      if (dup) e.sku = "SKU must be unique";
    }
    const price = Number(f.unit_price);
    if (f.unit_price === "" || Number.isNaN(price) || price < 0) e.unit_price = "Enter a price ≥ 0";
    const qty = Number(f.quantity);
    if (f.quantity === "" || !Number.isInteger(qty) || qty < 0) e.quantity = "Whole number ≥ 0";
    const th = Number(f.reorder_threshold);
    if (f.reorder_threshold === "" || !Number.isInteger(th) || th < 0) e.reorder_threshold = "Whole number ≥ 0";
    return e;
  };

  const setField = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((prev) => {
      const next = { ...prev, [k]: v };
      if (errors[k as keyof FieldErrors]) {
        const e = validateForm(next);
        setErrors((prevErr) => ({ ...prevErr, [k]: e[k as keyof FieldErrors] }));
      }
      return next;
    });
  };

  useEffect(() => {
    if (open) {
      setErrors({});
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (txnOpen) {
      setTxnError(null);
      setTimeout(() => txnQtyRef.current?.focus(), 50);
    }
  }, [txnOpen]);

  const filtered = (products.data ?? []).filter((p) => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false;
    }
    if (catFilter !== "all" && p.category_id !== catFilter) return false;
    if (statusFilter !== "all" && stockStatus(p) !== statusFilter) return false;
    return true;
  });

  const save = useMutation({
    mutationFn: async () => {
      const eMap = validateForm(form);
      if (Object.keys(eMap).length) {
        setErrors(eMap);
        const order: (keyof FieldErrors)[] = ["name", "sku", "unit_price", "quantity", "reorder_threshold"];
        const refs: Record<keyof FieldErrors, React.RefObject<HTMLInputElement | null>> = {
          name: nameRef, sku: skuRef, unit_price: priceRef, quantity: qtyRef, reorder_threshold: thresholdRef,
        };
        const first = order.find((k) => eMap[k]);
        if (first) refs[first].current?.focus();
        throw new Error(eMap[first!] ?? "Please fix the errors");
      }
      const unit_price = Number(form.unit_price);
      const quantity = Number(form.quantity);
      const reorder_threshold = Number(form.reorder_threshold);
      const payload = {
        name: form.name.trim(),
        sku: form.sku.trim(),
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        unit_price, quantity, reorder_threshold,
        description: form.description || null,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) {
          if (error.code === "23505") { setErrors((p) => ({ ...p, sku: "SKU must be unique" })); skuRef.current?.focus(); }
          throw error;
        }
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) {
          if (error.code === "23505") { setErrors((p) => ({ ...p, sku: "SKU must be unique" })); skuRef.current?.focus(); }
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false); setEditing(null); setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Product deleted"); qc.invalidateQueries({ queryKey: ["products"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const logTxn = useMutation({
    mutationFn: async () => {
      if (!txnOpen) return;
      const qty = Number(txnQty);
      if (txnQty === "" || !Number.isInteger(qty) || qty <= 0) {
        setTxnError("Enter a whole number greater than 0");
        txnQtyRef.current?.focus();
        throw new Error("Enter a whole number greater than 0");
      }
      if (txnOpen.type === "out" && qty > txnOpen.product.quantity) {
        setTxnError(`Only ${txnOpen.product.quantity} in stock — cannot remove more`);
        txnQtyRef.current?.focus();
        throw new Error("Insufficient stock");
      }
      const { error } = await supabase.from("transactions").insert({
        product_id: txnOpen.product.id,
        type: txnOpen.type,
        quantity: qty,
        notes: txnNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction recorded");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setTxnOpen(null); setTxnQty("1"); setTxnNotes(""); setTxnError(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name, sku: p.sku,
      category_id: p.category_id ?? "", supplier_id: p.supplier_id ?? "",
      unit_price: String(p.unit_price), quantity: String(p.quantity),
      reorder_threshold: String(p.reorder_threshold), description: p.description ?? "",
    });
    setOpen(true);
  };

  const exportCSV = () => {
    downloadCSV("products.csv", filtered.map((p) => ({
      name: p.name, sku: p.sku,
      category: catMap.get(p.category_id ?? "") ?? "",
      supplier: supMap.get(p.supplier_id ?? "") ?? "",
      unit_price: p.unit_price, quantity: p.quantity,
      reorder_threshold: p.reorder_threshold,
      status: stockStatus(p),
    })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search name or SKU" className="pl-8 w-full" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="ok">In stock</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={exportCSV} className="w-full sm:w-auto"><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" /> New product</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle></DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="p-name">Name *</Label>
                  <Input id="p-name" ref={nameRef} value={form.name}
                    aria-invalid={!!errors.name} aria-describedby={errors.name ? "p-name-err" : undefined}
                    onChange={(e) => setField("name", e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, name: validateForm(form).name }))} />
                  {errors.name && <p id="p-name-err" className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-sku">SKU *</Label>
                  <Input id="p-sku" ref={skuRef} value={form.sku} autoCapitalize="characters"
                    aria-invalid={!!errors.sku} aria-describedby={errors.sku ? "p-sku-err" : undefined}
                    onChange={(e) => setField("sku", e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, sku: validateForm(form).sku }))} />
                  {errors.sku && <p id="p-sku-err" className="text-xs text-destructive">{errors.sku}</p>}
                </div>
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={form.category_id || "__none"} onValueChange={(v) => setForm({ ...form, category_id: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Supplier</Label>
                  <Select value={form.supplier_id || "__none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "__none" ? "" : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">None</SelectItem>
                      {(suppliers.data ?? []).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-price">Unit price</Label>
                  <Input id="p-price" ref={priceRef} type="number" inputMode="decimal" min="0" step="0.01" value={form.unit_price}
                    aria-invalid={!!errors.unit_price} aria-describedby={errors.unit_price ? "p-price-err" : undefined}
                    onChange={(e) => setField("unit_price", e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, unit_price: validateForm(form).unit_price }))} />
                  {errors.unit_price && <p id="p-price-err" className="text-xs text-destructive">{errors.unit_price}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-qty">Quantity {editing && <span className="text-xs text-muted-foreground">(use transactions to change stock)</span>}</Label>
                  <Input id="p-qty" ref={qtyRef} type="number" inputMode="numeric" min="0" step="1" value={form.quantity} disabled={!!editing}
                    aria-invalid={!!errors.quantity} aria-describedby={errors.quantity ? "p-qty-err" : undefined}
                    onChange={(e) => setField("quantity", e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, quantity: validateForm(form).quantity }))} />
                  {errors.quantity && <p id="p-qty-err" className="text-xs text-destructive">{errors.quantity}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="p-threshold">Reorder threshold</Label>
                  <Input id="p-threshold" ref={thresholdRef} type="number" inputMode="numeric" min="0" step="1" value={form.reorder_threshold}
                    aria-invalid={!!errors.reorder_threshold} aria-describedby={errors.reorder_threshold ? "p-threshold-err" : undefined}
                    onChange={(e) => setField("reorder_threshold", e.target.value)}
                    onBlur={() => setErrors((p) => ({ ...p, reorder_threshold: validateForm(form).reorder_threshold }))} />
                  {errors.reorder_threshold
                    ? <p id="p-threshold-err" className="text-xs text-destructive">{errors.reorder_threshold}</p>
                    : <p className="text-xs text-muted-foreground">Alert when stock falls to or below this number.</p>}
                </div>
                <div className="space-y-1 col-span-2"><Label>Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="grid gap-3 sm:hidden">
        {products.isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No products match your filters.</p>
        ) : filtered.map((p) => {
          const s = stockStatus(p);
          return (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="font-mono text-xs text-muted-foreground truncate">{p.sku}</div>
                  </div>
                  {s === "out" ? <Badge variant="destructive" className="shrink-0">Out</Badge>
                    : s === "low" ? <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 shrink-0">Low · {p.quantity}</Badge>
                    : <Badge className="bg-success text-success-foreground hover:bg-success/90 shrink-0">{p.quantity}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div><span className="block uppercase tracking-wide text-[10px]">Category</span><span className="text-foreground">{catMap.get(p.category_id ?? "") ?? "—"}</span></div>
                  <div><span className="block uppercase tracking-wide text-[10px]">Supplier</span><span className="text-foreground">{supMap.get(p.supplier_id ?? "") ?? "—"}</span></div>
                  <div><span className="block uppercase tracking-wide text-[10px]">Price</span><span className="text-foreground">${Number(p.unit_price).toFixed(2)}</span></div>
                  <div><span className="block uppercase tracking-wide text-[10px]">Stock</span><span className="text-foreground">{p.quantity}</span></div>
                </div>
                <div className="flex gap-1 justify-end border-t pt-2 -mx-1">
                  <Button variant="ghost" size="icon" title="Stock in" onClick={() => setTxnOpen({ product: p, type: "in" })}><ArrowDownToLine className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Stock out" onClick={() => setTxnOpen({ product: p, type: "out" })}><ArrowUpFromLine className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="hidden sm:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="w-56 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">No products match your filters.</TableCell></TableRow>
              ) : filtered.map((p) => {
                const s = stockStatus(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                    <TableCell>{catMap.get(p.category_id ?? "") ?? "—"}</TableCell>
                    <TableCell>{supMap.get(p.supplier_id ?? "") ?? "—"}</TableCell>
                    <TableCell className="text-right">${Number(p.unit_price).toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {s === "out" ? <Badge variant="destructive">Out</Badge>
                        : s === "low" ? <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">Low · {p.quantity}</Badge>
                        : <Badge className="bg-success text-success-foreground hover:bg-success/90">{p.quantity}</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" title="Stock in" onClick={() => setTxnOpen({ product: p, type: "in" })}><ArrowDownToLine className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" title="Stock out" onClick={() => setTxnOpen({ product: p, type: "out" })}><ArrowUpFromLine className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id); }}><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!txnOpen} onOpenChange={(v) => { if (!v) setTxnOpen(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {txnOpen?.type === "in" ? "Stock in" : "Stock out"} — {txnOpen?.product.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">Current stock: {txnOpen?.product.quantity ?? 0}</div>
            <div className="space-y-1">
              <Label htmlFor="txn-qty">Quantity *</Label>
              <Input id="txn-qty" ref={txnQtyRef} type="number" inputMode="numeric" min="1" step="1" value={txnQty}
                aria-invalid={!!txnError} aria-describedby={txnError ? "txn-qty-err" : undefined}
                onChange={(e) => { setTxnQty(e.target.value); if (txnError) setTxnError(null); }} />
              {txnError && <p id="txn-qty-err" className="text-xs text-destructive">{txnError}</p>}
            </div>
            <div className="space-y-1"><Label>Notes / reference</Label><Textarea value={txnNotes} onChange={(e) => setTxnNotes(e.target.value)} placeholder="PO number, customer, reason…" /></div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setTxnOpen(null)}>Cancel</Button>
            <Button onClick={() => logTxn.mutate()} disabled={logTxn.isPending}>Record</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}