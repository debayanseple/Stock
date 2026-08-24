import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMemo, useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Download,
  Search,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  Mail,
  Phone,
  History,
} from "lucide-react";
import type { Category, Product, Supplier } from "@/lib/inventory-types";
import { stockStatus, downloadCSV, formatINR } from "@/lib/inventory-types";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/products")({
  head: () => ({
    meta: [
      { title: "Products — StockLine" },
      {
        name: "description",
        content:
          "Browse, search, and manage your product inventory with SKUs, prices, and stock levels.",
      },
      { property: "og:title", content: "Products — StockLine" },
      {
        property: "og:description",
        content:
          "Browse, search, and manage your product inventory with SKUs, prices, and stock levels.",
      },
      { property: "og:url", content: "/products" },
    ],
    links: [{ rel: "canonical", href: "/products" }],
  }),
  component: ProductsPage,
});

type Form = {
  name: string;
  sku: string;
  category_id: string;
  supplier_id: string;
  unit_price: string;
  quantity: string;
  reorder_threshold: string;
  description: string;
};
type FieldErrors = Partial<
  Record<"name" | "sku" | "unit_price" | "quantity" | "reorder_threshold", string>
>;
const emptyForm: Form = {
  name: "",
  sku: "",
  category_id: "",
  supplier_id: "",
  unit_price: "0",
  quantity: "0",
  reorder_threshold: "0",
  description: "",
};

function ProductsPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
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

  const [globalTxnOpen, setGlobalTxnOpen] = useState(false);
  const [globalTxnProductId, setGlobalTxnProductId] = useState("");
  const [globalTxnType, setGlobalTxnType] = useState<"in" | "out">("in");
  const [globalTxnQty, setGlobalTxnQty] = useState("1");
  const [globalTxnNotes, setGlobalTxnNotes] = useState("");
  const [globalTxnError, setGlobalTxnError] = useState<string | null>(null);
  const globalTxnQtyRef = useRef<HTMLInputElement>(null);
  const [quickTxnOpen, setQuickTxnOpen] = useState(false);

  const [supplierMsgOpen, setSupplierMsgOpen] = useState(false);
  const [supplierMsgProduct, setSupplierMsgProduct] = useState<Product | null>(null);
  const [supplierMsgSubject, setSupplierMsgSubject] = useState("");
  const [supplierMsgBody, setSupplierMsgBody] = useState("");
  const [confirmChannel, setConfirmChannel] = useState<null | "email" | "call">(null);

  type SupplierMessage = {
    id: string;
    product_id: string;
    supplier_id: string | null;
    channel: string;
    recipient: string | null;
    subject: string | null;
    body: string | null;
    quantity_at_send: number | null;
    threshold_at_send: number | null;
    created_at: string;
  };

  const supplierMessages = useQuery({
    queryKey: ["supplier_messages", supplierMsgProduct?.id],
    enabled: !!supplierMsgProduct,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supplier_messages")
        .select("*")
        .eq("product_id", supplierMsgProduct!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SupplierMessage[];
    },
  });

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

  const catMap = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c.name])),
    [categories.data],
  );
  const supMap = useMemo(
    () => new Map((suppliers.data ?? []).map((s) => [s.id, s.name])),
    [suppliers.data],
  );
  const supRecMap = useMemo(
    () => new Map((suppliers.data ?? []).map((s) => [s.id, s])),
    [suppliers.data],
  );

  const openSupplierMsg = (p: Product) => {
    const sup = p.supplier_id ? (supRecMap.get(p.supplier_id) ?? null) : null;
    const suggestedQty = Math.max((p.reorder_threshold || 0) * 2 - p.quantity, 10);
    setSupplierMsgProduct(p);
    setSupplierMsgSubject(`Reorder request: ${p.name} (SKU ${p.sku})`);
    setSupplierMsgBody(
      `Hi${sup?.name ? ` ${sup.name}` : ""},\n\n` +
        `We are running low on "${p.name}" (SKU: ${p.sku}). Current stock is ${p.quantity} ` +
        `(reorder threshold: ${p.reorder_threshold}).\n\n` +
        `Please arrange a fresh supply of approximately ${suggestedQty} units at the earliest and share ` +
        `expected dispatch date and pricing.\n\nThanks,\nStockLine`,
    );
    setSupplierMsgOpen(true);
  };

  const currentSupplier = supplierMsgProduct?.supplier_id
    ? (supRecMap.get(supplierMsgProduct.supplier_id) ?? null)
    : null;
  const mailtoHref = currentSupplier?.email
    ? `mailto:${currentSupplier.email}?subject=${encodeURIComponent(supplierMsgSubject)}&body=${encodeURIComponent(supplierMsgBody)}`
    : "";
  const telHref = currentSupplier?.phone ? `tel:${currentSupplier.phone.replace(/\s+/g, "")}` : "";

  const logSupplierMessage = useMutation({
    mutationFn: async (channel: "email" | "call") => {
      if (!supplierMsgProduct) throw new Error("No product selected");
      const recipient =
        channel === "email" ? (currentSupplier?.email ?? null) : (currentSupplier?.phone ?? null);
      const { error } = await supabase.from("supplier_messages").insert({
        org_id: profile?.org_id ?? "",
        product_id: supplierMsgProduct.id,
        supplier_id: currentSupplier?.id ?? null,
        channel,
        recipient,
        subject: channel === "email" ? supplierMsgSubject : null,
        body: channel === "email" ? supplierMsgBody : null,
        quantity_at_send: supplierMsgProduct.quantity,
        threshold_at_send: supplierMsgProduct.reorder_threshold,
      });
      if (error) throw error;
      return channel;
    },
    onSuccess: (channel) => {
      qc.invalidateQueries({ queryKey: ["supplier_messages"] });
      const href = channel === "email" ? mailtoHref : telHref;
      if (href) window.location.href = href;
      toast.success(channel === "email" ? "Email opened & logged" : "Call opened & logged");
      setConfirmChannel(null);
      setSupplierMsgOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validateForm = (f: Form): FieldErrors => {
    const e: FieldErrors = {};
    if (!f.name.trim()) e.name = "Name is required";
    const sku = f.sku.trim();
    if (!sku) e.sku = "SKU is required";
    else {
      const dup = (products.data ?? []).some(
        (p) => p.sku.toLowerCase() === sku.toLowerCase() && p.id !== editing?.id,
      );
      if (dup) e.sku = "SKU must be unique";
    }
    const price = Number(f.unit_price);
    if (f.unit_price === "" || Number.isNaN(price) || price <= 0)
      e.unit_price = "Enter a price greater than 0";
    const qty = Number(f.quantity);
    if (f.quantity === "" || !Number.isInteger(qty) || qty <= 0)
      e.quantity = "Enter a quantity greater than 0";
    const th = Number(f.reorder_threshold);
    if (f.reorder_threshold === "" || !Number.isInteger(th) || th < 0)
      e.reorder_threshold = "Whole number ≥ 0";
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
    if (globalTxnOpen) {
      setGlobalTxnError(null);
      setTimeout(() => globalTxnQtyRef.current?.focus(), 50);
    }
  }, [globalTxnOpen]);

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
        const order: (keyof FieldErrors)[] = [
          "name",
          "sku",
          "unit_price",
          "quantity",
          "reorder_threshold",
        ];
        const refs: Record<keyof FieldErrors, React.RefObject<HTMLInputElement | null>> = {
          name: nameRef,
          sku: skuRef,
          unit_price: priceRef,
          quantity: qtyRef,
          reorder_threshold: thresholdRef,
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
        unit_price,
        quantity,
        reorder_threshold,
        description: form.description || null,
      };
      if (editing) {
        const { error } = await supabase.from("products").update(payload).eq("id", editing.id);
        if (error) {
          if (error.code === "23505") {
            setErrors((p) => ({ ...p, sku: "SKU must be unique" }));
            skuRef.current?.focus();
          }
          throw error;
        }
      } else {
        if (!profile?.org_id) throw new Error("No organization assigned");
        const { error } = await supabase
          .from("products")
          .insert({ ...payload, org_id: profile.org_id });
        if (error) {
          if (error.code === "23505") {
            setErrors((p) => ({ ...p, sku: "SKU must be unique" }));
            skuRef.current?.focus();
          }
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Product updated" : "Product added");
      qc.invalidateQueries({ queryKey: ["products"] });
      setOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Product deleted");
      qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recordGlobalTxn = useMutation({
    mutationFn: async () => {
      const product = products.data?.find((p) => p.id === globalTxnProductId);
      if (!product) {
        setGlobalTxnError("Select a product");
        throw new Error("Select a product");
      }
      const qty = Number(globalTxnQty);
      if (globalTxnQty === "" || !Number.isInteger(qty) || qty <= 0) {
        setGlobalTxnError("Enter a whole number greater than 0");
        globalTxnQtyRef.current?.focus();
        throw new Error("Enter a whole number greater than 0");
      }
      if (globalTxnType === "out" && qty > product.quantity) {
        setGlobalTxnError(`Only ${product.quantity} in stock — cannot remove more`);
        globalTxnQtyRef.current?.focus();
        throw new Error("Insufficient stock");
      }
      const { error } = await supabase.from("transactions").insert({
        org_id: profile?.org_id ?? "",
        product_id: product.id,
        type: globalTxnType,
        quantity: qty,
        notes: globalTxnNotes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Transaction recorded");
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      setGlobalTxnOpen(false);
      setGlobalTxnProductId("");
      setGlobalTxnType("in");
      setGlobalTxnQty("1");
      setGlobalTxnNotes("");
      setGlobalTxnError(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };
  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      sku: p.sku,
      category_id: p.category_id ?? "",
      supplier_id: p.supplier_id ?? "",
      unit_price: String(p.unit_price),
      quantity: String(p.quantity),
      reorder_threshold: String(p.reorder_threshold),
      description: p.description ?? "",
    });
    setOpen(true);
  };

  const exportCSV = () => {
    downloadCSV(
      "products.csv",
      filtered.map((p) => ({
        name: p.name,
        sku: p.sku,
        category: catMap.get(p.category_id ?? "") ?? "",
        supplier: supMap.get(p.supplier_id ?? "") ?? "",
        unit_price_inr: Number(p.unit_price).toFixed(2),
        quantity: p.quantity,
        stock_value_inr: (Number(p.unit_price) * p.quantity).toFixed(2),
        reorder_threshold: p.reorder_threshold,
        status: stockStatus(p),
      })),
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center w-full sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Search className="h-4 w-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name or SKU"
              className="pl-8 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stock</SelectItem>
                <SelectItem value="ok">In stock</SelectItem>
                <SelectItem value="low">Low stock</SelectItem>
                <SelectItem value="out">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-end justify-end gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuickTxnOpen(true)}
              className="shrink-0"
            >
              <ArrowLeftRight className="h-4 w-4 mr-1" /> Quick transaction
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNew} className="flex-1 sm:flex-none">
                  <Plus className="h-4 w-4 mr-1" /> New product
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit product" : "New product"}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label htmlFor="p-name">Name *</Label>
                    <Input
                      id="p-name"
                      ref={nameRef}
                      value={form.name}
                      aria-invalid={!!errors.name}
                      aria-describedby={errors.name ? "p-name-err" : undefined}
                      onChange={(e) => setField("name", e.target.value)}
                      onBlur={() => setErrors((p) => ({ ...p, name: validateForm(form).name }))}
                    />
                    {errors.name && (
                      <p id="p-name-err" className="text-xs text-destructive">
                        {errors.name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-sku">SKU *</Label>
                    <Input
                      id="p-sku"
                      ref={skuRef}
                      value={form.sku}
                      autoCapitalize="characters"
                      aria-invalid={!!errors.sku}
                      aria-describedby={errors.sku ? "p-sku-err" : undefined}
                      onChange={(e) => setField("sku", e.target.value)}
                      onBlur={() => setErrors((p) => ({ ...p, sku: validateForm(form).sku }))}
                    />
                    {errors.sku && (
                      <p id="p-sku-err" className="text-xs text-destructive">
                        {errors.sku}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Category</Label>
                    <Select
                      value={form.category_id || "__none"}
                      onValueChange={(v) =>
                        setForm({ ...form, category_id: v === "__none" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {(categories.data ?? []).map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>Supplier</Label>
                    <Select
                      value={form.supplier_id || "__none"}
                      onValueChange={(v) =>
                        setForm({ ...form, supplier_id: v === "__none" ? "" : v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none">None</SelectItem>
                        {(suppliers.data ?? []).map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-price">Unit price *</Label>
                    <Input
                      id="p-price"
                      ref={priceRef}
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={form.unit_price}
                      aria-invalid={!!errors.unit_price}
                      aria-describedby={errors.unit_price ? "p-price-err" : undefined}
                      onChange={(e) => setField("unit_price", e.target.value)}
                      onBlur={() =>
                        setErrors((p) => ({ ...p, unit_price: validateForm(form).unit_price }))
                      }
                    />
                    {errors.unit_price && (
                      <p id="p-price-err" className="text-xs text-destructive">
                        {errors.unit_price}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-qty">
                      Quantity *{" "}
                      {editing && (
                        <span className="text-xs text-muted-foreground">
                          (use transactions to change stock)
                        </span>
                      )}
                    </Label>
                    <Input
                      id="p-qty"
                      ref={qtyRef}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={form.quantity}
                      disabled={!!editing}
                      aria-invalid={!!errors.quantity}
                      aria-describedby={errors.quantity ? "p-qty-err" : undefined}
                      onChange={(e) => setField("quantity", e.target.value)}
                      onBlur={() =>
                        setErrors((p) => ({ ...p, quantity: validateForm(form).quantity }))
                      }
                    />
                    {errors.quantity && (
                      <p id="p-qty-err" className="text-xs text-destructive">
                        {errors.quantity}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="p-threshold">Reorder threshold</Label>
                    <Input
                      id="p-threshold"
                      ref={thresholdRef}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      step="1"
                      value={form.reorder_threshold}
                      aria-invalid={!!errors.reorder_threshold}
                      aria-describedby={errors.reorder_threshold ? "p-threshold-err" : undefined}
                      onChange={(e) => setField("reorder_threshold", e.target.value)}
                      onBlur={() =>
                        setErrors((p) => ({
                          ...p,
                          reorder_threshold: validateForm(form).reorder_threshold,
                        }))
                      }
                    />
                    {errors.reorder_threshold ? (
                      <p id="p-threshold-err" className="text-xs text-destructive">
                        {errors.reorder_threshold}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Alert when stock falls to or below this number.
                      </p>
                    )}
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="grid gap-3 sm:hidden">
        {products.isLoading ? (
          <p className="text-center text-sm text-muted-foreground py-6">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">
            No products match your filters.
          </p>
        ) : (
          filtered.map((p) => {
            const s = stockStatus(p);
            return (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="font-mono text-xs text-muted-foreground truncate">
                        {p.sku}
                      </div>
                    </div>
                    {s === "out" ? (
                      <Badge variant="destructive" className="shrink-0">
                        Out
                      </Badge>
                    ) : s === "low" ? (
                      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90 shrink-0">
                        Low · {p.quantity}
                      </Badge>
                    ) : (
                      <Badge className="bg-success text-success-foreground hover:bg-success/90 shrink-0">
                        {p.quantity}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>
                      <span className="block uppercase tracking-wide text-[10px]">Category</span>
                      <span className="text-foreground">
                        {catMap.get(p.category_id ?? "") ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block uppercase tracking-wide text-[10px]">Supplier</span>
                      <span className="text-foreground">
                        {supMap.get(p.supplier_id ?? "") ?? "—"}
                      </span>
                    </div>
                    <div>
                      <span className="block uppercase tracking-wide text-[10px]">Price</span>
                      <span className="text-foreground">{formatINR(Number(p.unit_price))}</span>
                    </div>
                    <div>
                      <span className="block uppercase tracking-wide text-[10px]">Stock</span>
                      <span className="text-foreground">{p.quantity}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 justify-end border-t pt-2 -mx-1">
                    {(s === "low" || s === "out") && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mr-auto ml-1 border-warning text-warning hover:bg-warning/10"
                        onClick={() => openSupplierMsg(p)}
                      >
                        <Mail className="h-4 w-4 mr-1" /> Message supplier
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Edit product ${p.name}`}
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Delete product ${p.name}`}
                      onClick={() => {
                        if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
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
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Loading…
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No products match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const s = stockStatus(p);
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell>{catMap.get(p.category_id ?? "") ?? "—"}</TableCell>
                      <TableCell>{supMap.get(p.supplier_id ?? "") ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        {formatINR(Number(p.unit_price))}
                      </TableCell>
                      <TableCell className="text-right">
                        {s === "out" ? (
                          <Badge variant="destructive">Out</Badge>
                        ) : s === "low" ? (
                          <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
                            Low · {p.quantity}
                          </Badge>
                        ) : (
                          <Badge className="bg-success text-success-foreground hover:bg-success/90">
                            {p.quantity}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {(s === "low" || s === "out") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mr-1 border-warning text-warning hover:bg-warning/10"
                            onClick={() => openSupplierMsg(p)}
                          >
                            <Mail className="h-4 w-4 mr-1" /> Message supplier
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Edit product ${p.name}`}
                          onClick={() => openEdit(p)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Delete product ${p.name}`}
                          onClick={() => {
                            if (confirm(`Delete "${p.name}"?`)) del.mutate(p.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
      </div>

      {/* Mobile transaction FAB */}
      <div className="fixed bottom-4 right-4 z-50 sm:hidden">
        <Button
          onClick={() => setQuickTxnOpen(true)}
          className="shadow-lg rounded-full h-14 px-4 gap-2"
        >
          <ArrowLeftRight className="h-5 w-5" /> Quick transaction
        </Button>
      </div>

      <Dialog open={globalTxnOpen} onOpenChange={setGlobalTxnOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Record transaction</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Product *</Label>
              <Select value={globalTxnProductId} onValueChange={setGlobalTxnProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {(products.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} · {p.sku} ({p.quantity} in stock)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type *</Label>
              <Select
                value={globalTxnType}
                onValueChange={(v) => setGlobalTxnType(v as "in" | "out")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Stock in</SelectItem>
                  <SelectItem value="out">Stock out</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="global-txn-qty">Quantity *</Label>
              <Input
                id="global-txn-qty"
                ref={globalTxnQtyRef}
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={globalTxnQty}
                aria-invalid={!!globalTxnError}
                aria-describedby={globalTxnError ? "global-txn-qty-err" : undefined}
                onChange={(e) => {
                  setGlobalTxnQty(e.target.value);
                  if (globalTxnError) setGlobalTxnError(null);
                }}
              />
              {globalTxnError && (
                <p id="global-txn-qty-err" className="text-xs text-destructive">
                  {globalTxnError}
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Notes / reference</Label>
              <Textarea
                value={globalTxnNotes}
                onChange={(e) => setGlobalTxnNotes(e.target.value)}
                placeholder="PO number, customer, reason…"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setGlobalTxnOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => recordGlobalTxn.mutate()}
              disabled={recordGlobalTxn.isPending || !globalTxnProductId || !products.data?.length}
            >
              Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={quickTxnOpen} onOpenChange={setQuickTxnOpen}>
        <DialogContent className="max-w-[260px] sm:max-w-[280px] rounded-2xl p-4">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-center text-lg font-semibold">
              Quick transaction
            </DialogTitle>
            <p className="text-center text-xs text-muted-foreground">
              Choose a direction to update stock.
            </p>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={() => {
                setGlobalTxnType("in");
                setQuickTxnOpen(false);
                setGlobalTxnOpen(true);
              }}
              className="group relative flex flex-col items-center justify-center gap-2 rounded-xl border border-success/40 bg-success/10 p-3 transition-all active:scale-95 hover:bg-success/20 hover:border-success/60 focus:outline-none focus:ring-2 focus:ring-success focus:ring-offset-2"
              aria-label="Record stock in"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success text-success-foreground shadow-sm group-hover:scale-105 transition-transform">
                <ArrowDownToLine className="h-5 w-5" />
              </div>
              <div className="text-center">
                <span className="block text-xs font-semibold text-foreground">Stock in</span>
                <span className="block text-[10px] text-muted-foreground">Add units</span>
              </div>
            </button>
            <button
              onClick={() => {
                setGlobalTxnType("out");
                setQuickTxnOpen(false);
                setGlobalTxnOpen(true);
              }}
              className="group relative flex flex-col items-center justify-center gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 transition-all active:scale-95 hover:bg-warning/20 hover:border-warning/60 focus:outline-none focus:ring-2 focus:ring-warning focus:ring-offset-2"
              aria-label="Record stock out"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning text-warning-foreground shadow-sm group-hover:scale-105 transition-transform">
                <ArrowUpFromLine className="h-5 w-5" />
              </div>
              <div className="text-center">
                <span className="block text-xs font-semibold text-foreground">Stock out</span>
                <span className="block text-[10px] text-muted-foreground">Remove units</span>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={supplierMsgOpen} onOpenChange={setSupplierMsgOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Message supplier</DialogTitle>
          </DialogHeader>
          {supplierMsgProduct && (
            <div className="space-y-3">
              <div className="rounded-md border p-3 text-sm space-y-1 bg-muted/40">
                <div>
                  <span className="text-muted-foreground">Product:</span>{" "}
                  <span className="font-medium">{supplierMsgProduct.name}</span>{" "}
                  <span className="font-mono text-xs">({supplierMsgProduct.sku})</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Current stock:</span>{" "}
                  {supplierMsgProduct.quantity} ·{" "}
                  <span className="text-muted-foreground">Threshold:</span>{" "}
                  {supplierMsgProduct.reorder_threshold}
                </div>
                {currentSupplier ? (
                  <div>
                    <span className="text-muted-foreground">Supplier:</span> {currentSupplier.name}
                    {currentSupplier.email && (
                      <>
                        {" "}
                        ·{" "}
                        <a className="underline" href={`mailto:${currentSupplier.email}`}>
                          {currentSupplier.email}
                        </a>
                      </>
                    )}
                    {currentSupplier.phone && <> · {currentSupplier.phone}</>}
                  </div>
                ) : (
                  <div className="text-destructive">
                    No supplier linked to this product. Assign a supplier to send a message.
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-subj">Subject</Label>
                <Input
                  id="sup-subj"
                  value={supplierMsgSubject}
                  onChange={(e) => setSupplierMsgSubject(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-body">Message</Label>
                <Textarea
                  id="sup-body"
                  rows={8}
                  value={supplierMsgBody}
                  onChange={(e) => setSupplierMsgBody(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center gap-2 text-sm font-medium mb-2">
                  <History className="h-4 w-4 text-muted-foreground" />
                  Past outreach for this product
                </div>
                {supplierMessages.isLoading ? (
                  <p className="text-xs text-muted-foreground">Loading history…</p>
                ) : (supplierMessages.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">No previous messages logged.</p>
                ) : (
                  <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {supplierMessages.data!.map((m) => (
                      <li key={m.id} className="text-xs rounded border p-2 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1 font-medium">
                            {m.channel === "email" ? (
                              <Mail className="h-3 w-3" />
                            ) : (
                              <Phone className="h-3 w-3" />
                            )}
                            <span className="capitalize">{m.channel}</span>
                            {m.recipient && (
                              <span className="text-muted-foreground">· {m.recipient}</span>
                            )}
                          </div>
                          <span className="text-muted-foreground">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </div>
                        {m.subject && (
                          <div className="mt-1 truncate">
                            <span className="text-muted-foreground">Subject:</span> {m.subject}
                          </div>
                        )}
                        {m.quantity_at_send != null && (
                          <div className="text-muted-foreground">
                            Stock at send: {m.quantity_at_send} / threshold{" "}
                            {m.threshold_at_send ?? "—"}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setSupplierMsgOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              disabled={!telHref}
              onClick={() =>
                telHref
                  ? setConfirmChannel("call")
                  : toast.error("No phone number on this supplier")
              }
            >
              <Phone className="h-4 w-4 mr-1" /> Call supplier
            </Button>
            <Button
              disabled={!mailtoHref}
              onClick={() =>
                mailtoHref ? setConfirmChannel("email") : toast.error("No email on this supplier")
              }
            >
              <Mail className="h-4 w-4 mr-1" /> Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!confirmChannel}
        onOpenChange={(o) => {
          if (!o) setConfirmChannel(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmChannel === "email" ? "Confirm email" : "Confirm call"}
            </DialogTitle>
          </DialogHeader>
          {confirmChannel && currentSupplier && supplierMsgProduct && (
            <div className="space-y-3 text-sm">
              <div className="rounded-md border p-3 bg-muted/40 space-y-1">
                <div>
                  <span className="text-muted-foreground">To:</span>{" "}
                  <span className="font-medium">{currentSupplier.name}</span>
                  {currentSupplier.contact_name ? ` (${currentSupplier.contact_name})` : ""}
                </div>
                <div>
                  <span className="text-muted-foreground">
                    {confirmChannel === "email" ? "Email:" : "Phone:"}
                  </span>{" "}
                  <span className="font-mono">
                    {confirmChannel === "email" ? currentSupplier.email : currentSupplier.phone}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Product:</span> {supplierMsgProduct.name}{" "}
                  ({supplierMsgProduct.sku})
                </div>
              </div>
              {confirmChannel === "email" ? (
                <>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">
                      Subject
                    </span>
                    <div className="font-medium break-words">
                      {supplierMsgSubject || (
                        <span className="text-destructive">Empty subject</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wide">
                      Message
                    </span>
                    <div className="whitespace-pre-wrap text-xs max-h-40 overflow-y-auto rounded border p-2 bg-background">
                      {supplierMsgBody || <span className="text-destructive">Empty message</span>}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Your mail app will open with this message ready to send.
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Your phone app will dial this number. The call will be logged for the record.
                </p>
              )}
            </div>
          )}
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setConfirmChannel(null)}>
              Back
            </Button>
            <Button
              onClick={() => confirmChannel && logSupplierMessage.mutate(confirmChannel)}
              disabled={logSupplierMessage.isPending}
            >
              {confirmChannel === "email" ? (
                <>
                  <Mail className="h-4 w-4 mr-1" /> Open email
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 mr-1" /> Place call
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
