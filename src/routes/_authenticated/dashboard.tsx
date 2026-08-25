import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Package,
  IndianRupee,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Receipt,
  Wallet,
} from "lucide-react";
import type { Category, Product, Transaction, Bill } from "@/lib/inventory-types";
import { stockStatus, formatINR } from "@/lib/inventory-types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  format,
  startOfQuarter,
  endOfQuarter,
  subQuarters,
  startOfYear,
  endOfYear,
  subYears,
  differenceInCalendarDays,
} from "date-fns";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StockLine" },
      {
        name: "description",
        content:
          "See total products, stock value, low-stock alerts, and recent movement trends at a glance.",
      },
      { property: "og:title", content: "Dashboard — StockLine" },
      {
        property: "og:description",
        content:
          "See total products, stock value, low-stock alerts, and recent movement trends at a glance.",
      },
      { property: "og:url", content: "/dashboard" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
  component: Dashboard,
});

type Range = "7" | "30" | "this_quarter" | "last_quarter" | "last_year";

const RANGE_LABELS: Record<Range, string> = {
  "7": "Last 7 days",
  "30": "Last 30 days",
  this_quarter: "This quarter",
  last_quarter: "Last quarter",
  last_year: "Last year",
};

function resolveRange(range: Range): { since: Date; until: Date; days: number; label: string } {
  const now = new Date();
  let since: Date;
  let until: Date = now;
  if (range === "7" || range === "30") {
    const n = Number(range);
    since = new Date(now.getTime() - n * 86400_000);
  } else if (range === "this_quarter") {
    since = startOfQuarter(now);
    until = endOfQuarter(now);
  } else if (range === "last_quarter") {
    const lq = subQuarters(now, 1);
    since = startOfQuarter(lq);
    until = endOfQuarter(lq);
  } else {
    const ly = subYears(now, 1);
    since = startOfYear(ly);
    until = endOfYear(ly);
  }
  const days = Math.max(1, differenceInCalendarDays(until > now ? now : until, since) + 1);
  return { since, until, days, label: RANGE_LABELS[range] };
}

function Dashboard() {
  const [range, setRange] = useState<Range>("30");
  const [lowOpen, setLowOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sheetScrollRef = useRef<HTMLDivElement>(null);

  // Welcome toast after just being approved (flag set on the /pending screen).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("stockline:justApproved") === "1") {
      localStorage.removeItem("stockline:justApproved");
      toast.success("Welcome to StockLine", {
        description: "Your organization has been approved. You're all set.",
        icon: <CheckCircle2 className="h-4 w-4" />,
      });
    }
  }, []);

  const refreshAll = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["products"] }),
      qc.invalidateQueries({ queryKey: ["categories"] }),
      qc.invalidateQueries({ queryKey: ["transactions"] }),
      qc.invalidateQueries({ queryKey: ["bills"] }),
    ]);
    toast.success("Stock levels updated");
  };
  const { since, until, days, label: rangeLabel } = useMemo(() => resolveRange(range), [range]);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").is("deleted_at", null);
      if (error) throw error;
      return data as Product[];
    },
  });

  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data as Category[];
    },
  });

  const recent = useQuery({
    queryKey: ["transactions", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data as (Transaction & { products: { name: string; sku: string } | null })[];
    },
  });

  const window = useQuery({
    queryKey: ["transactions", "window", sinceIso, untilIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select(
          "id, type, quantity, created_at, product_id, products(name, sku, unit_price, category_id)",
        )
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Array<
        Transaction & {
          products: {
            name: string;
            sku: string;
            unit_price: number;
            category_id: string | null;
          } | null;
        }
      >;
    },
  });

  const items = products.data ?? [];

  const billsWindow = useQuery({
    queryKey: ["bills", "window", sinceIso, untilIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(
          "id, customer_name, total_amount, paid_amount, due_amount, payment_status, payment_method, created_at",
        )
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Pick<
        Bill,
        | "id"
        | "customer_name"
        | "total_amount"
        | "paid_amount"
        | "due_amount"
        | "payment_status"
        | "payment_method"
        | "created_at"
      >[];
    },
  });

  const recentBills = useQuery({
    queryKey: ["bills", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, customer_name, total_amount, payment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data as Pick<
        Bill,
        "id" | "customer_name" | "total_amount" | "payment_status" | "created_at"
      >[];
    },
  });

  const lastUpdated = Math.max(
    products.dataUpdatedAt || 0,
    categories.dataUpdatedAt || 0,
    recent.dataUpdatedAt || 0,
    window.dataUpdatedAt || 0,
    billsWindow.dataUpdatedAt || 0,
    recentBills.dataUpdatedAt || 0,
  );
  const isSyncing =
    products.isFetching ||
    categories.isFetching ||
    recent.isFetching ||
    window.isFetching ||
    billsWindow.isFetching ||
    recentBills.isFetching;
  const hasError = !!(
    products.error ||
    categories.error ||
    recent.error ||
    window.error ||
    billsWindow.error ||
    recentBills.error
  );
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const lastUpdatedLabel = lastUpdated ? formatRelative(lastUpdated, nowTick) : "—";
  const lastUpdatedFull = lastUpdated ? format(new Date(lastUpdated), "PPpp") : "";

  const totalProducts = items.length;
  const totalValue = items.reduce((s, p) => s + Number(p.unit_price) * p.quantity, 0);
  const lowStock = items.filter((p) => stockStatus(p) !== "ok");

  const rows = window.data ?? [];

  const short = (n: string) => (n.length > 14 ? n.slice(0, 14) + "…" : n);

  // Top products by total movement in the window
  const perProduct = new Map<string, { name: string; In: number; Out: number; movement: number }>();
  rows.forEach((r) => {
    const key = r.product_id;
    const name = r.products?.name ?? "Deleted product";
    const cur = perProduct.get(key) ?? { name, In: 0, Out: 0, movement: 0 };
    if (r.type === "in") cur.In += r.quantity;
    else cur.Out += r.quantity;
    cur.movement += r.quantity;
    perProduct.set(key, cur);
  });
  const topMovers = Array.from(perProduct.values())
    .sort((a, b) => b.movement - a.movement)
    .slice(0, 7)
    .map((p) => ({ name: short(p.name), In: p.In, Out: p.Out }));

  // Top sellers (stock-out only) by revenue value
  const topSellers = Array.from(perProduct.entries())
    .map(([id, p]) => {
      const price = Number(rows.find((r) => r.product_id === id)?.products?.unit_price ?? 0);
      return { name: p.name, units: p.Out, value: p.Out * price };
    })
    .filter((p) => p.units > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  // Daily trend
  const dayMap = new Map<string, { day: string; In: number; Out: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(until.getTime() - i * 86400_000);
    const key = format(d, "yyyy-MM-dd");
    dayMap.set(key, { day: format(d, days > 30 ? "MMM d" : "MMM d"), In: 0, Out: 0 });
  }
  rows.forEach((r) => {
    const key = format(new Date(r.created_at), "yyyy-MM-dd");
    const cur = dayMap.get(key);
    if (cur) {
      if (r.type === "in") cur.In += r.quantity;
      else cur.Out += r.quantity;
    }
  });
  const trend = Array.from(dayMap.values());

  // Category value distribution (current stock value)
  const catNames = new Map((categories.data ?? []).map((c) => [c.id, c.name]));
  const catValues = new Map<string, number>();
  items.forEach((p) => {
    const label = p.category_id
      ? (catNames.get(p.category_id) ?? "Uncategorized")
      : "Uncategorized";
    catValues.set(label, (catValues.get(label) ?? 0) + Number(p.unit_price) * p.quantity);
  });
  const catData = Array.from(catValues.entries())
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const pieColors = [
    "var(--primary)",
    "var(--accent-brand)",
    "var(--success)",
    "var(--warning)",
    "var(--primary-glow)",
    "var(--destructive)",
    "var(--muted-foreground)",
  ];

  // ===== Sales analytics (from bills) =====
  const billRows = billsWindow.data ?? [];
  const salesRevenue = billRows.reduce((s, b) => s + Number(b.total_amount), 0);
  const salesCollected = billRows.reduce((s, b) => s + Number(b.paid_amount), 0);
  const outstandingDues = billRows.reduce(
    (s, b) => s + (b.payment_status === "paid" ? 0 : Number(b.due_amount)),
    0,
  );
  const billsCount = billRows.length;
  const avgBillValue = billsCount ? salesRevenue / billsCount : 0;

  // Daily revenue trend
  const salesDayMap = new Map<string, { day: string; revenue: number; bills: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(until.getTime() - i * 86400_000);
    salesDayMap.set(format(d, "yyyy-MM-dd"), { day: format(d, "MMM d"), revenue: 0, bills: 0 });
  }
  billRows.forEach((b) => {
    const cur = salesDayMap.get(format(new Date(b.created_at), "yyyy-MM-dd"));
    if (cur) {
      cur.revenue += Number(b.total_amount);
      cur.bills += 1;
    }
  });
  const salesTrend = Array.from(salesDayMap.values());
  const hasSales = billRows.length > 0;

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Overview</h2>
            <p className="text-xs text-muted-foreground">
              Insights across your inventory and movements.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SyncStatus
              isSyncing={isSyncing}
              hasError={hasError}
              label={lastUpdatedLabel}
              title={lastUpdatedFull}
              onRefresh={refreshAll}
            />
            <Select value={range} onValueChange={(v) => setRange(v as Range)}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="this_quarter">This quarter</SelectItem>
                <SelectItem value="last_quarter">Last quarter</SelectItem>
                <SelectItem value="last_year">Last year</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total products"
            value={totalProducts}
            icon={Package}
            onClick={() => navigate({ to: "/products" })}
          />
          <StatCard
            label="Total stock value"
            value={formatINR(totalValue)}
            icon={IndianRupee}
            onClick={() => navigate({ to: "/products" })}
          />
          <StatCard
            label="Low / out of stock"
            value={lowStock.length}
            icon={AlertTriangle}
            tone="warn"
            onClick={() => setLowOpen(true)}
            badge={lowStock.length > 0 ? "View" : undefined}
          />
        </div>

        {/* Sales summary */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Receipt className="h-4 w-4 text-primary" /> Sales · {rangeLabel}
            </h3>
            <Link to="/billing" className="text-xs text-primary hover:underline">
              Open billing
            </Link>
          </div>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Sales revenue"
              value={formatINR(salesRevenue)}
              icon={IndianRupee}
              tone="ok"
              onClick={() => navigate({ to: "/billing" })}
            />
            <StatCard
              label="Bills created"
              value={billsCount}
              icon={Receipt}
              onClick={() => navigate({ to: "/billing" })}
              badge={billsCount > 0 ? `Avg ${formatINR(avgBillValue)}` : undefined}
            />
            <StatCard
              label="Collected"
              value={formatINR(salesCollected)}
              icon={CheckCircle2}
              tone="ok"
              onClick={() => navigate({ to: "/billing" })}
            />
            <StatCard
              label="Outstanding dues"
              value={formatINR(outstandingDues)}
              icon={Wallet}
              tone={outstandingDues > 0 ? "warn" : "ok"}
              onClick={() => navigate({ to: "/billing" })}
            />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Daily sales · {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {hasSales ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend}>
                    <defs>
                      <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      interval={Math.max(0, Math.floor(days / 10))}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: number) => formatINR(v)} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue"
                      stroke="var(--success)"
                      strokeWidth={2}
                      fill="url(#salesGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No bills in this range — create one from Billing.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top movers · {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {topMovers.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topMovers}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-15}
                      textAnchor="end"
                      height={50}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="In" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="Out" stackId="a" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No movements in this range
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily stock flow · {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {rows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 11 }}
                      interval={Math.max(0, Math.floor(days / 10))}
                    />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line
                      type="monotone"
                      dataKey="In"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="Out"
                      stroke="var(--warning)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No movements in this range
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Top sellers · {rangeLabel}</CardTitle>
            </CardHeader>
            <CardContent>
              {topSellers.length ? (
                <ul className="space-y-2">
                  {topSellers.map((p, i) => (
                    <li
                      key={p.name + i}
                      className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0"
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <span className="h-6 w-6 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                          {i + 1}
                        </span>
                        <span className="truncate font-medium">{p.name}</span>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">{formatINR(p.value)}</div>
                        <div className="text-xs text-muted-foreground">{p.units} units out</div>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No stock-out activity in this range.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock value by category</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              {catData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={catData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      innerRadius={40}
                      paddingAngle={2}
                    >
                      {catData.map((_, i) => (
                        <Cell key={i} fill={pieColors[i % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatINR(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  Add products to see distribution
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Low-stock alerts</CardTitle>
              {lowStock.length > 0 && (
                <button
                  onClick={() => setLowOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  See all ({lowStock.length})
                </button>
              )}
            </CardHeader>
            <CardContent>
              {lowStock.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  All items are above their reorder threshold.
                </p>
              ) : (
                <ul className="space-y-2">
                  {lowStock.slice(0, 8).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0"
                    >
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.sku}</div>
                      </div>
                      <StockBadge product={p} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent bills</CardTitle>
            <Link to="/billing" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentBills.data?.length ? (
              <ul className="divide-y">
                {recentBills.data.map((b) => (
                  <li key={b.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{b.customer_name || "Walk-in customer"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {format(new Date(b.created_at), "PPp")}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-semibold">{formatINR(Number(b.total_amount))}</div>
                      <Badge
                        variant={
                          b.payment_status === "paid"
                            ? "default"
                            : b.payment_status === "partial"
                              ? "secondary"
                              : "destructive"
                        }
                        className="capitalize mt-0.5"
                      >
                        {b.payment_status}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No bills yet — create one from Billing.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent transactions</CardTitle>
            <Link to="/transactions" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recent.data?.length ? (
              <ul className="divide-y">
                {recent.data.map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{t.products?.name ?? "Deleted product"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {format(new Date(t.created_at), "PPp")}
                        {t.notes ? ` · ${t.notes}` : ""}
                      </div>
                    </div>
                    <Badge variant={t.type === "in" ? "default" : "secondary"} className="shrink-0">
                      {t.type === "in" ? "+" : "−"}
                      {t.quantity}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            )}
          </CardContent>
        </Card>

        <Sheet open={lowOpen} onOpenChange={setLowOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85vh] flex flex-col sm:max-w-lg sm:mx-auto sm:rounded-t-xl"
          >
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" /> Low-stock items
              </SheetTitle>
              <SheetDescription>
                {lowStock.length === 0
                  ? "Nothing to reorder — everything is above threshold."
                  : `${lowStock.length} item${lowStock.length === 1 ? "" : "s"} at or below reorder threshold.`}
              </SheetDescription>
              <div className="pt-1">
                <SyncStatus
                  isSyncing={isSyncing}
                  hasError={hasError}
                  label={lastUpdatedLabel}
                  title={lastUpdatedFull}
                  onRefresh={refreshAll}
                  compact
                />
              </div>
            </SheetHeader>
            <div ref={sheetScrollRef} className="flex-1 overflow-y-auto -mx-6 px-6 py-2">
              <PullToRefresh
                onRefresh={refreshAll}
                scrollElement={sheetScrollRef.current}
                alwaysEnabled
              >
                {lowStock.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Pull down to refresh.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {lowStock
                      .slice()
                      .sort((a, b) => a.quantity - b.quantity)
                      .map((p) => (
                        <li key={p.id}>
                          <SheetClose asChild>
                            <Link
                              to="/products"
                              className="flex items-center justify-between gap-3 py-3 -mx-2 px-2 rounded-md active:bg-muted"
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">{p.name}</div>
                                <div className="text-xs text-muted-foreground font-mono truncate">
                                  {p.sku}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <StockBadge product={p} />
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </Link>
                          </SheetClose>
                        </li>
                      ))}
                  </ul>
                )}
              </PullToRefresh>
            </div>
            <SheetFooter className="pt-2">
              <SheetClose asChild>
                <Button asChild className="w-full">
                  <Link to="/products">Open products</Link>
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </PullToRefresh>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  onClick,
  badge,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  tone?: "warn" | "ok";
  onClick?: () => void;
  badge?: string;
}) {
  const toneCls =
    tone === "warn"
      ? "bg-destructive/10 text-destructive"
      : tone === "ok"
        ? "bg-success/10 text-success"
        : "bg-primary/10 text-primary";
  const inner = (
    <CardContent className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="text-xl sm:text-2xl font-semibold mt-1 break-words leading-tight">
            {value}
          </div>
          {badge && (
            <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary">
              {badge} <ChevronRight className="h-3 w-3" />
            </div>
          )}
        </div>
        <div
          className={`h-9 w-9 sm:h-10 sm:w-10 shrink-0 rounded-lg flex items-center justify-center ${toneCls}`}
        >
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
    </CardContent>
  );
  if (onClick) {
    return (
      <Card
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onClick();
          }
        }}
        className="cursor-pointer select-none min-h-[92px] transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-[0.98] active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {inner}
      </Card>
    );
  }
  return <Card className="min-h-[92px]">{inner}</Card>;
}

function StockBadge({ product }: { product: Product }) {
  const s = stockStatus(product);
  if (s === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (s === "low")
    return (
      <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
        Low · {product.quantity}
      </Badge>
    );
  return (
    <Badge className="bg-success text-success-foreground hover:bg-success/90">
      {product.quantity}
    </Badge>
  );
}

function formatRelative(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function SyncStatus({
  isSyncing,
  hasError,
  label,
  title,
  onRefresh,
  compact,
}: {
  isSyncing: boolean;
  hasError: boolean;
  label: string;
  title?: string;
  onRefresh: () => void | Promise<void>;
  compact?: boolean;
}) {
  const status = hasError ? "Sync failed" : isSyncing ? "Syncing…" : "Up to date";
  const dotCls = hasError
    ? "bg-destructive"
    : isSyncing
      ? "bg-warning animate-pulse"
      : "bg-success";
  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-xs ${compact ? "" : "sm:text-xs"}`}
      title={title}
      aria-live="polite"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dotCls}`} aria-hidden />
      <span className="text-muted-foreground">
        <span className="font-medium text-foreground">{status}</span>
        <span className="hidden sm:inline"> · Last updated {label}</span>
        <span className="sm:hidden"> · {label}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={() => onRefresh()}
        disabled={isSyncing}
        aria-label="Refresh now"
      >
        {hasError ? (
          <RefreshCw className="h-3.5 w-3.5 text-destructive" />
        ) : isSyncing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        )}
      </Button>
    </div>
  );
}
