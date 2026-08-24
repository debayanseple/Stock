import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { createBill, getBills, getBillById, updateBillPayment } from "@/lib/billing.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Toast, Toaster } from "sonner";
import {
  Plus,
  Minus,
  Trash2,
  Search,
  CreditCard,
  Smartphone,
  Receipt,
  ArrowDown,
  ArrowUp,
  Printer,
  Download,
  QrCode,
  CheckCircle,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  formatINR,
  type Bill,
  type BillItem,
  type Product,
  type PaymentMethod,
} from "@/lib/inventory-types";
import { useProfile } from "@/hooks/use-profile";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing — StockLine" },
      {
        name: "description",
        content: "Create bills and manage customer invoices with automatic stock deduction.",
      },
      { property: "og:title", content: "Billing — StockLine" },
      {
        property: "og:description",
        content: "Create bills and manage customer invoices with automatic stock deduction.",
      },
      { property: "og:url", content: "/billing" },
    ],
    links: [{ rel: "canonical", href: "/billing" }],
  }),
  component: BillingPage,
});

type CartItem = {
  product: Product;
  quantity: number;
};

const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "cash", label: "Cash", icon: <ArrowDown className="h-4 w-4" /> },
  { value: "upi", label: "UPI", icon: <Smartphone className="h-4 w-4" /> },
  { value: "card", label: "Card", icon: <CreditCard className="h-4 w-4" /> },
  { value: "other", label: "Other", icon: <ArrowUp className="h-4 w-4" /> },
];

// Generate bill HTML for printing/downloading
function generateBillHTML(bill: Bill): string {
  const formatDate = (iso: string) => new Date(iso).toLocaleString();
  const items = bill.items ?? [];

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Bill ${bill.id.slice(0, 8)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; padding: 20px; font-size: 12px; }
    .bill-container { max-width: 400px; margin: 0 auto; }
    .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .shop-name { font-size: 18px; font-weight: bold; margin-bottom: 5px; }
    .bill-title { font-size: 14px; color: #666; }
    .info-row { display: flex; justify-content: space-between; margin: 5px 0; }
    .info-label { font-weight: bold; }
    .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
    .items-table th, .items-table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    .items-table th { background: #f5f5f5; }
    .items-table .text-right { text-align: right; }
    .totals { margin-top: 15px; }
    .total-row { display: flex; justify-content: space-between; margin: 5px 0; }
    .total-final { font-weight: bold; font-size: 14px; border-top: 1px solid #333; padding-top: 10px; }
    .payment-info { margin-top: 15px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
    .footer { text-align: center; margin-top: 20px; color: #666; font-size: 11px; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="bill-container">
    <div class="header">
      <div class="shop-name">StockLine</div>
      <div class="bill-title">Tax Invoice / Bill</div>
    </div>
    
    <div class="info-row">
      <span class="info-label">Bill ID:</span>
      <span>${bill.id.slice(0, 8).toUpperCase()}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Date:</span>
      <span>${formatDate(bill.created_at)}</span>
    </div>
    ${
      bill.customer_name
        ? `
    <div class="info-row">
      <span class="info-label">Customer:</span>
      <span>${bill.customer_name}</span>
    </div>
    `
        : ""
    }
    ${
      bill.customer_phone
        ? `
    <div class="info-row">
      <span class="info-label">Phone:</span>
      <span>${bill.customer_phone}</span>
    </div>
    `
        : ""
    }
    ${
      bill.customer_email
        ? `
    <div class="info-row">
      <span class="info-label">Email:</span>
      <span>${bill.customer_email}</span>
    </div>
    `
        : ""
    }
    
    <table class="items-table">
      <thead>
        <tr>
          <th>Item</th>
          <th class="text-right">Qty</th>
          <th class="text-right">Price</th>
          <th class="text-right">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item) => `
        <tr>
          <td>${item.product_name} <br><small>${item.product_sku}</small></td>
          <td class="text-right">${item.quantity}</td>
          <td class="text-right">₹${item.unit_price.toFixed(2)}</td>
          <td class="text-right">₹${item.line_total.toFixed(2)}</td>
        </tr>
        `,
          )
          .join("")}
      </tbody>
    </table>
    
    <div class="totals">
      <div class="total-row">
        <span>Subtotal</span>
        <span>₹${bill.subtotal.toFixed(2)}</span>
      </div>
      ${
        bill.discount_amount > 0
          ? `
      <div class="total-row">
        <span>Discount</span>
        <span>-₹${bill.discount_amount.toFixed(2)}</span>
      </div>
      `
          : ""
      }
      ${
        bill.tax_amount > 0
          ? `
      <div class="total-row">
        <span>Tax</span>
        <span>+₹${bill.tax_amount.toFixed(2)}</span>
      </div>
      `
          : ""
      }
      <div class="total-row total-final">
        <span>Total</span>
        <span>₹${bill.total_amount.toFixed(2)}</span>
      </div>
    </div>
    
    <div class="payment-info">
      <div class="info-row">
        <span class="info-label">Payment Method:</span>
        <span>${bill.payment_method?.toUpperCase() || "—"}</span>
      </div>
      <div class="total-row total-final">
        <span>Status</span>
        <span>${bill.payment_status.toUpperCase()}</span>
      </div>
      ${
        bill.paid_amount > 0
          ? `
      <div class="total-row">
        <span>Paid</span>
        <span>₹${bill.paid_amount.toFixed(2)}</span>
      </div>
      `
          : ""
      }
      ${
        bill.due_amount > 0
          ? `
      <div class="total-row">
        <span>Due</span>
        <span>₹${bill.due_amount.toFixed(2)}</span>
      </div>
      `
          : ""
      }
    </div>
    
    ${
      bill.notes
        ? `
    <div class="payment-info">
      <div class="info-label">Notes:</div>
      <div>${bill.notes}</div>
    </div>
    `
        : ""
    }
    
    <div class="footer">
      <p>Thank you for your business!</p>
      <p>Generated by StockLine</p>
    </div>
  </div>
</body>
</html>
  `;
}

function BillingPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [paidAmount, setPaidAmount] = useState("");
  const [cashReceived, setCashReceived] = useState("");
  const [paymentCollected, setPaymentCollected] = useState(false);
  const [collectedTotal, setCollectedTotal] = useState<number | null>(null);
  const [discountAmount, setDiscountAmount] = useState("0");
  const [taxAmount, setTaxAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyBills, setHistoryBills] = useState<Bill[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Payment modal state
  const [paymentModal, setPaymentModal] = useState<{
    open: boolean;
    billId: string;
    total: number;
    due: number;
    method: PaymentMethod;
  } | null>(null);
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Bill preview/print state
  const [completedBill, setCompletedBill] = useState<{ billId: string; bill: Bill } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").order("name");
      if (error) throw error;
      return data as Product[];
    },
  });

  const filteredProducts = useMemo(() => {
    if (!products.data) return [];
    const q = search.toLowerCase().trim();
    if (!q) return products.data.filter((p) => p.quantity > 0);
    return products.data.filter(
      (p) =>
        p.quantity > 0 && (p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    );
  }, [products.data, search]);

  const subtotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.unit_price * item.quantity, 0),
    [cart],
  );
  const discount = Number(discountAmount) || 0;
  const tax = Number(taxAmount) || 0;
  const total = subtotal + tax - discount;
  const paid = Number(paidAmount) || 0;
  const due = Math.max(0, total - paid);

  // Any change to the bill total after payment was collected invalidates it —
  // the shopkeeper must press the collected button again for the new amount.
  useEffect(() => {
    if (paymentCollected && collectedTotal !== null && Math.abs(total - collectedTotal) > 0.001) {
      setPaymentCollected(false);
      setCollectedTotal(null);
      toast.info("Cart changed — collect payment again");
    }
  }, [total, paymentCollected, collectedTotal]);

  const createBillMutation = useMutation({
    mutationFn: createBill,
    onSuccess: async (result) => {
      // Bill created successfully
      // Fetch the full bill details for printing
      try {
        const bill = await getBillById(result.bill_id);
        setCompletedBill({ billId: result.bill_id, bill });
      } catch {
        // If fetch fails, still show success
        toast.success(`Bill created: ${result.bill_id.slice(0, 8)}`);
      }

      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["bills"] });

      // Reset form
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setPaidAmount("");
      setCashReceived("");
      setPaymentCollected(false);
      setCollectedTotal(null);
      setDiscountAmount("0");
      setTaxAmount("0");
      setNotes("");
      searchRef.current?.focus();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePaymentMutation = useMutation({
    mutationFn: updateBillPayment,
    onSuccess: (result) => {
      toast.success(`Payment ${result.payment_status === "paid" ? "completed" : "recorded"}`);
      setPaymentModal(null);
      setPaymentProcessing(false);
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["bills"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setPaymentProcessing(false);
    },
  });

  const handleCompletePayment = () => {
    if (!paymentModal) return;
    setPaymentProcessing(true);
    updatePaymentMutation.mutate({
      bill_id: paymentModal.billId,
      paid_amount: paymentModal.total,
      payment_method: paymentModal.method,
    });
  };

  const handleClosePaymentModal = () => {
    setPaymentModal(null);
    setPaymentProcessing(false);
  };

  const handleCloseCompletedBill = () => {
    setCompletedBill(null);
    setCashReceived("");
  };

  // Print bill
  const handlePrintBill = () => {
    if (!completedBill) return;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(generateBillHTML(completedBill.bill));
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => printWindow.print(), 250);
    }
  };

  // Download bill as HTML
  const handleDownloadBill = () => {
    if (!completedBill) return;
    const html = generateBillHTML(completedBill.bill);
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bill-${completedBill.billId.slice(0, 8)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const bills = await getBills(50, 0);
      setHistoryBills(bills);
    } catch (e) {
      toast.error("Failed to load bill history");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (showHistory) loadHistory();
  }, [showHistory]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        if (existing.quantity >= product.quantity) {
          toast.error(`Only ${product.quantity} in stock`);
          return prev;
        }
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setSearch("");
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const newQty = item.quantity + delta;
          if (newQty <= 0) return null;
          if (newQty > item.product.quantity) {
            toast.error(`Only ${item.product.quantity} in stock`);
            return item;
          }
          return { ...item, quantity: newQty };
        })
        .filter((i): i is CartItem => i !== null),
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const handleCreateBill = () => {
    if (cart.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    if (!profile?.org_id) {
      toast.error("No organization assigned");
      return;
    }
    if (paid > total) {
      toast.error("Paid amount cannot exceed total");
      return;
    }
    if (due > 0) {
      toast.error("Please collect full payment before creating bill");
      return;
    }

    createBillMutation.mutate({
      customer_name: customerName || undefined,
      customer_phone: customerPhone || undefined,
      customer_email: customerEmail || undefined,
      items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.product.unit_price,
      })),
      payment_method: paymentMethod,
      paid_amount: paid,
      notes: notes || undefined,
      discount_amount: discount,
      tax_amount: tax,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Create a new bill — add items, enter customer details, collect payment.
        </p>
        <Button variant="outline" onClick={() => setShowHistory((v) => !v)}>
          <Receipt className="h-4 w-4 mr-1" /> {showHistory ? "New Bill" : "Bill History"}
        </Button>
      </div>

      {showHistory ? (
        <BillHistory
          bills={historyBills}
          loading={historyLoading}
          onClose={() => setShowHistory(false)}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          {/* Left: Product selection + Cart */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Search className="h-4 w-4" /> Products
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
              <div className="p-3 border-b">
                <Input
                  ref={searchRef}
                  placeholder="Search product by name or SKU…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto p-3">
                {products.isLoading ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Loading products…
                  </p>
                ) : filteredProducts.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    {search
                      ? "No matching products in stock"
                      : "No products in stock. Add products first."}
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {filteredProducts.map((product) => (
                      <button
                        key={product.id}
                        onClick={() => addToCart(product)}
                        className="group relative flex flex-col p-3 border rounded-lg hover:border-primary/50 hover:bg-accent/30 transition-all text-left"
                      >
                        <div className="font-medium truncate">{product.name}</div>
                        <div className="font-mono text-xs text-muted-foreground truncate">
                          {product.sku}
                        </div>
                        <div className="flex items-center justify-between mt-2">
                          <span className="font-semibold">{formatINR(product.unit_price)}</span>
                          <Badge
                            className={`shrink-0 ${
                              product.quantity <= 0
                                ? "bg-destructive"
                                : product.quantity <= product.reorder_threshold
                                  ? "bg-warning"
                                  : "bg-success"
                            }`}
                          >
                            {product.quantity}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Right: Cart + Customer + Payment */}
          <Card className="flex flex-col">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-4 w-4" /> Cart ({cart.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden p-0">
              {/* Cart items */}
              <div className="flex-1 overflow-y-auto p-3 border-b">
                {cart.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-8">
                    Cart is empty. Search and click products to add.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {cart.map((item) => (
                      <div
                        key={item.product.id}
                        className="flex items-center gap-2 p-2 border rounded-lg bg-muted/30"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{item.product.name}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.product.sku}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            disabled={item.quantity <= 1}
                            aria-label="Decrease quantity"
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="w-8 text-center font-mono">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            disabled={item.quantity >= item.product.quantity}
                            aria-label="Increase quantity"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="shrink-0 font-medium tabular-nums w-24 text-right">
                          {formatINR(item.product.unit_price * item.quantity)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeFromCart(item.product.id)}
                          aria-label="Remove item"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals + Customer + Payment */}
              <div className="p-3 space-y-4 border-b">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>{formatINR(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                      className="w-28 text-right"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span>Tax</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={taxAmount}
                      onChange={(e) => setTaxAmount(e.target.value)}
                      className="w-28 text-right"
                    />
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold text-lg">
                    <span>Total</span>
                    <span>{formatINR(total)}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Customer (optional)</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      placeholder="Name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                    <Input
                      placeholder="Phone"
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                    />
                  </div>
                  <Input
                    placeholder="Email"
                    type="email"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Payment Method</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHODS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            {m.icon}
                            <span>{m.label}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* UPI QR Code Display */}
                  {paymentMethod === "upi" && (
                    <div className="space-y-3 p-3 bg-muted/50 rounded-lg border">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <QrCode className="h-4 w-4" />
                        <span>Scan to Pay via UPI</span>
                      </div>
                      <div className="flex justify-center">
                        <div className="w-48 h-48 bg-white p-4 rounded-lg border shadow-inner flex items-center justify-center">
                          {/* Demo QR Code - replace with real UPI QR generation */}
                          <svg
                            viewBox="0 0 100 100"
                            className="w-full h-full"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <defs>
                              <pattern
                                id="qrPattern"
                                patternUnits="userSpaceOnUse"
                                width="10"
                                height="10"
                              >
                                <rect width="10" height="10" fill="white" />
                                <rect x="0" y="0" width="5" height="5" fill="black" />
                                <rect x="5" y="5" width="5" height="5" fill="black" />
                              </pattern>
                            </defs>
                            <rect width="100" height="100" fill="url(#qrPattern)" />
                            {/* Finder patterns */}
                            <rect
                              x="5"
                              y="5"
                              width="35"
                              height="35"
                              fill="none"
                              stroke="black"
                              strokeWidth="5"
                            />
                            <rect x="10" y="10" width="25" height="25" fill="black" />
                            <rect
                              x="60"
                              y="5"
                              width="35"
                              height="35"
                              fill="none"
                              stroke="black"
                              strokeWidth="5"
                            />
                            <rect x="65" y="10" width="25" height="25" fill="black" />
                            <rect
                              x="5"
                              y="60"
                              width="35"
                              height="35"
                              fill="none"
                              stroke="black"
                              strokeWidth="5"
                            />
                            <rect x="10" y="65" width="25" height="25" fill="black" />
                          </svg>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground text-center">
                        Demo QR — Replace with real UPI QR generation (upi://pay?pa=...)
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() =>
                            navigator.clipboard.writeText(
                              "upi://pay?pa=demo@upi&pn=StockLine&am=" + total.toFixed(2),
                            )
                          }
                        >
                          Copy UPI Link
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          className="flex-1"
                          onClick={() => {
                            setPaidAmount(total.toFixed(2));
                            setPaymentCollected(true);
                            setCollectedTotal(total);
                          }}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Mark as Paid
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Card/Other Payment */}
                  {(paymentMethod === "card" || paymentMethod === "other") && (
                    <div className="space-y-2 p-3 bg-muted/50 rounded-lg border">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {paymentMethod === "card" ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <AlertCircle className="h-4 w-4" />
                        )}
                        <span>{paymentMethod === "card" ? "Card Payment" : "Other Payment"}</span>
                      </div>
                      <p className="text-sm">
                        Amount: <span className="font-semibold text-lg">{formatINR(total)}</span>
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setPaidAmount(total.toFixed(2));
                          setPaymentCollected(true);
                          setCollectedTotal(total);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Mark as Paid
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        Process payment externally, then mark as complete
                      </p>
                    </div>
                  )}

                  {/* Cash Payment - Optional Change Calculator */}
                  {paymentMethod === "cash" && (
                    <div className="space-y-2">
                      <p className="text-sm">
                        Amount: <span className="font-semibold text-lg">{formatINR(total)}</span>
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          setPaidAmount(total.toFixed(2));
                          setPaymentCollected(true);
                          setCollectedTotal(total);
                        }}
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Cash Collected
                      </Button>

                      {/* Optional Change Calculator Dropdown */}
                      <details className="group border rounded-lg overflow-hidden">
                        <summary className="flex items-center justify-between p-3 bg-muted/50 cursor-pointer list-none">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <ArrowDown className="h-4 w-4" />
                            <span>Change Calculator (Optional)</span>
                          </span>
                          <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">
                            ▼
                          </span>
                        </summary>
                        <div className="p-3 space-y-3 border-t">
                          <div className="space-y-1">
                            <Label>Amount Received from Customer</Label>
                            <Input
                              type="number"
                              inputMode="decimal"
                              min={total}
                              step="0.01"
                              placeholder={total.toFixed(2)}
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                            />
                          </div>
                          {Number(cashReceived) > total && (
                            <div className="space-y-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                              <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                                <ArrowUp className="h-4 w-4" />
                                <span>Change to Return</span>
                              </div>
                              <div className="flex justify-between text-lg font-semibold">
                                <span>Return to Customer</span>
                                <span className="text-green-700">
                                  {formatINR(Number(cashReceived) - total)}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    </div>
                  )}

                  <div className="space-y-1">
                    <Label>Notes</Label>
                    <Input
                      placeholder="Reference, PO number, etc."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Create Bill Button */}
              <div className="p-3 border-t">
                <Button
                  className="w-full justify-center gap-2"
                  size="lg"
                  onClick={handleCreateBill}
                  disabled={createBillMutation.isPending || cart.length === 0 || !paymentCollected}
                >
                  {createBillMutation.isPending ? (
                    <>
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      Creating…
                    </>
                  ) : (
                    <>
                      <Receipt className="h-5 w-5" />
                      Create Bill &mdash; {formatINR(total)}
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Toaster position="top-right" />

      {/* Payment Modal */}
      {paymentModal && (
        <Dialog open={paymentModal.open} onOpenChange={handleClosePaymentModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                Complete Payment
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Bill ID</span>
                  <span className="font-mono text-sm">{paymentModal.billId.slice(0, 8)}…</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-muted-foreground">Total Amount</span>
                  <span className="font-semibold">{formatINR(paymentModal.total)}</span>
                </div>
                <div className="flex justify-between text-lg font-semibold border-t pt-2">
                  <span>Amount Due</span>
                  <span className="text-destructive">{formatINR(paymentModal.due)}</span>
                </div>
              </div>

              {paymentModal.method === "upi" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <QrCode className="h-4 w-4" />
                    <span>Scan to Pay via UPI</span>
                  </div>
                  <div className="flex justify-center">
                    <div className="w-56 h-56 bg-white p-4 rounded-lg border shadow-inner flex items-center justify-center">
                      <svg
                        viewBox="0 0 100 100"
                        className="w-full h-full"
                        xmlns="http://www.w3.org/2000/svg"
                      >
                        <defs>
                          <pattern
                            id="qrPatternModal"
                            patternUnits="userSpaceOnUse"
                            width="10"
                            height="10"
                          >
                            <rect width="10" height="10" fill="white" />
                            <rect x="0" y="0" width="5" height="5" fill="black" />
                            <rect x="5" y="5" width="5" height="5" fill="black" />
                          </pattern>
                        </defs>
                        <rect width="100" height="100" fill="url(#qrPatternModal)" />
                        <rect
                          x="5"
                          y="5"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="black"
                          strokeWidth="5"
                        />
                        <rect x="10" y="10" width="25" height="25" fill="black" />
                        <rect
                          x="60"
                          y="5"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="black"
                          strokeWidth="5"
                        />
                        <rect x="65" y="10" width="25" height="25" fill="black" />
                        <rect
                          x="5"
                          y="60"
                          width="35"
                          height="35"
                          fill="none"
                          stroke="black"
                          strokeWidth="5"
                        />
                        <rect x="10" y="65" width="25" height="25" fill="black" />
                      </svg>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Demo QR — Replace with real UPI QR (upi://pay?pa=...)
                  </p>
                </div>
              )}

              {paymentModal.method === "cash" && (
                <div className="space-y-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                    <ArrowDown className="h-4 w-4" />
                    <span>Cash Payment</span>
                  </div>
                  <p className="text-sm text-green-700">
                    Collect{" "}
                    <span className="font-semibold text-lg">{formatINR(paymentModal.due)}</span>{" "}
                    from customer
                  </p>
                </div>
              )}

              {(paymentModal.method === "card" || paymentModal.method === "other") && (
                <div className="space-y-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                    {paymentModal.method === "card" ? (
                      <CreditCard className="h-4 w-4" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <span>{paymentModal.method === "card" ? "Card Payment" : "Other Payment"}</span>
                  </div>
                  <p className="text-sm text-blue-700">
                    Process{" "}
                    <span className="font-semibold text-lg">{formatINR(paymentModal.due)}</span>{" "}
                    externally
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleClosePaymentModal}
                  disabled={paymentProcessing}
                >
                  Later (Keep Pending)
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={handleCompletePayment}
                  disabled={paymentProcessing}
                >
                  {paymentProcessing ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                      Confirming…
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Mark as Paid
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Completed Bill Modal - Print/Download */}
      {completedBill && (
        <Dialog open onOpenChange={handleCloseCompletedBill}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-success" />
                Bill Created Successfully
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="rounded-lg border p-4 bg-success/10 border-success/30">
                <p className="text-sm text-success">
                  Bill <span className="font-mono">{completedBill.billId.slice(0, 8)}</span> created
                  with payment status:{" "}
                  <strong>{completedBill.bill.payment_status.toUpperCase()}</strong>
                </p>
              </div>

              <div className="flex gap-2">
                <Button variant="default" className="flex-1" onClick={handlePrintBill}>
                  <Printer className="h-4 w-4 mr-1" />
                  Print Bill
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleDownloadBill}>
                  <Download className="h-4 w-4 mr-1" />
                  Download HTML
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                The bill has been saved. You can also find it in Bill History.
              </p>

              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={handleCloseCompletedBill}>
                  Close
                </Button>
                <Button
                  variant="default"
                  className="flex-1"
                  onClick={() => {
                    handleCloseCompletedBill();
                    setShowHistory(true);
                  }}
                >
                  <Receipt className="h-4 w-4 mr-1" />
                  View in History
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function BillHistory({
  bills,
  loading,
  onClose,
}: {
  bills: Bill[];
  loading: boolean;
  onClose: () => void;
}) {
  const formatDate = (iso: string) => new Date(iso).toLocaleString();
  const qc = useQueryClient();
  const [payingBillId, setPayingBillId] = useState<string | null>(null);

  const completePaymentMutation = useMutation({
    mutationFn: updateBillPayment,
    onSuccess: () => {
      toast.success("Payment marked as complete");
      qc.invalidateQueries({ queryKey: ["bills"] });
      setPayingBillId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleCompleteFromHistory = (bill: Bill) => {
    setPayingBillId(bill.id);
    completePaymentMutation.mutate({
      bill_id: bill.id,
      paid_amount: bill.total_amount,
      payment_method: bill.payment_method ?? "cash",
    });
  };

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Bill History</CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <Search className="h-4 w-4 rotate-180" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">Loading…</p>
          </div>
        ) : bills.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-muted-foreground">No bills yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-36">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bills.map((bill) => (
                  <TableRow key={bill.id}>
                    <TableCell className="font-mono text-xs">{bill.id.slice(0, 8)}…</TableCell>
                    <TableCell>{formatDate(bill.created_at)}</TableCell>
                    <TableCell>
                      {bill.customer_name || "—"}
                      {bill.customer_phone && (
                        <div className="text-xs text-muted-foreground">{bill.customer_phone}</div>
                      )}
                    </TableCell>
                    <TableCell>{bill.items?.length ?? 0}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatINR(bill.total_amount)}
                    </TableCell>
                    <TableCell>
                      {bill.payment_method && (
                        <Badge variant="outline" className="capitalize">
                          {bill.payment_method}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          bill.payment_status === "paid"
                            ? "default"
                            : bill.payment_status === "partial"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {bill.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {bill.payment_status !== "paid" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="w-full"
                          onClick={() => handleCompleteFromHistory(bill)}
                          disabled={payingBillId === bill.id || completePaymentMutation.isPending}
                        >
                          {payingBillId === bill.id && completePaymentMutation.isPending ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                              Completing…
                            </>
                          ) : (
                            <>
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Mark Paid
                            </>
                          )}
                        </Button>
                      )}
                      {bill.payment_status === "paid" && (
                        <Badge variant="outline" className="text-success border-success">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Completed
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
