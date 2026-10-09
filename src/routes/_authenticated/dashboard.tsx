import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package,
  IndianRupee,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  CheckCircle2,
  Receipt,
  Wallet,
  Plus,
  TrendingUp,
  PackageX,
  ArrowRight,
} from "lucide-react";
import type { Category, Product, Transaction, Bill } from "@/lib/inventory-types";
import { stockStatus, formatINR } from "@/lib/inventory-types";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
} from "recharts";
import { format, startOfDay, subDays, differenceInCalendarDays } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { Reveal } from "@/components/reveal";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — StockLine" },
      {
        name: "description",
        content: "Today's sale, pending payments, low stock and top sellers at a glance.",
      },
      { property: "og:title", content: "Dashboard — StockLine" },
      {
        property: "og:description",
        content: "Today's sale, pending payments, low stock and top sellers at a glance.",
      },
      { property: "og:url", content: "/dashboard" },
    ],
    links: [{ rel: "canonical", href: "/dashboard" }],
  }),
  component: Dashboard,
});

type Range = "today" | "7" | "30";

const RANGE_LABELS: Record<Range, string> = {
  today: "Today",
  "7": "Last 7 days",
  "30": "Last 30 days",
};

function resolveRange(range: Range): { since: Date; until: Date; days: number; label: string } {
  const now = new Date();
  const since = range === "today" ? startOfDay(now) : subDays(now, Number(range));
  const days = Math.max(1, differenceInCalendarDays(now, since) + 1);
  return { since, until: now, days, label: RANGE_LABELS[range] };
}

function Dashboard() {
  const [range, setRange] = useState<Range>("7");
  const [lowOpen, setLowOpen] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem("stockline:justApproved") === "1") {
      localStorage.removeItem("stockline:justApproved");
      toast.success("Welcome to StockLine", {
        description: "Your shop dashboard is ready.",
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
    toast.success("Shop data updated");
  };

  const { since, until, days, label: rangeLabel } = useMemo(() => resolveRange(range), [range]);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const todayIso = startOfDay(new Date()).toISOString();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*").is("deleted_at", null);
      if (error) throw error;
      return data as Product[];
    },
  });

  useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*");
      if (error) throw error;
      return data as Category[];
    },
  });

  const todayBills = useQuery({
    queryKey: ["bills", "today", todayIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, customer_name, total_amount, paid_amount, due_amount, payment_status")
        .gte("created_at", todayIso);
      if (error) throw error;
      return data as Pick<
        Bill,
        "id" | "customer_name" | "total_amount" | "paid_amount" | "due_amount" | "payment_status"
      >[];
    },
  });

  const dues = useQuery({
    queryKey: ["bills", "dues"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, customer_name, total_amount, due_amount, created_at")
        .neq("payment_status", "paid")
        .gt("due_amount", 0)
        .order("due_amount", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data as Pick<
        Bill,
        "id" | "customer_name" | "total_amount" | "due_amount" | "created_at"
      >[];
    },
  });

  const windowTxns = useQuery({
    queryKey: ["transactions", "window", sinceIso, untilIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, type, quantity, created_at, product_id, products(name, unit_price)")
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Array<Transaction & { products: { name: string; unit_price: number } | null }>;
    },
  });

  const billsWindow = useQuery({
    queryKey: ["bills", "window", sinceIso, untilIso],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, customer_name, total_amount, paid_amount, due_amount, created_at")
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Pick<
        Bill,
        "id" | "customer_name" | "total_amount" | "paid_amount" | "due_amount" | "created_at"
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
        .limit(6);
      if (error) throw error;
      return data as Pick<
        Bill,
        "id" | "customer_name" | "total_amount" | "payment_status" | "created_at"
      >[];
    },
  });

  const isSyncing =
    products.isFetching ||
    todayBills.isFetching ||
    dues.isFetching ||
    windowTxns.isFetching ||
    billsWindow.isFetching;
  const hasError = !!(products.error || todayBills.error || dues.error);

  // First open: show a shimmer that mirrors the real layout so the shop owner
  // sees structure instantly instead of a blank / jumping page.
  const isInitialLoading =
    products.isLoading ||
    todayBills.isLoading ||
    dues.isLoading ||
    billsWindow.isLoading ||
    windowTxns.isLoading ||
    recentBills.isLoading;
  const isChartLoading = billsWindow.isLoading || billsWindow.isFetching;
  const isSellersLoading = windowTxns.isLoading || windowTxns.isFetching;

  if (isInitialLoading) {
    return <DashboardSkeleton />;
  }

  const items = products.data ?? [];
  const outOfStock = items.filter((p) => p.quantity <= 0);
  const lowStock = items.filter((p) => stockStatus(p) === "low");
  const attentionCount = outOfStock.length + lowStock.length;

  const todayRows = todayBills.data ?? [];
  const todaySale = todayRows.reduce((s, b) => s + Number(b.total_amount), 0);
  const todayBillsCount = todayRows.length;
  const todayItems = todayRows.length;

  const dueRows = dues.data ?? [];
  const totalDues = dueRows.reduce((s, b) => s + Number(b.due_amount), 0);

  // Sales trend for the single chart
  const billRows = billsWindow.data ?? [];
  const salesDayMap = new Map<string, { day: string; sale: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(until.getTime() - i * 86400_000);
    salesDayMap.set(format(d, "yyyy-MM-dd"), { day: format(d, "d MMM"), sale: 0 });
  }
  billRows.forEach((b) => {
    const cur = salesDayMap.get(format(new Date(b.created_at), "yyyy-MM-dd"));
    if (cur) cur.sale += Number(b.total_amount);
  });
  const salesTrend = Array.from(salesDayMap.values());

  // Top selling items (by units sold out)
  const soldMap = new Map<string, { name: string; units: number; value: number }>();
  (windowTxns.data ?? []).forEach((r) => {
    if (r.type !== "out") return;
    const name = r.products?.name ?? "Deleted item";
    const price = Number(r.products?.unit_price ?? 0);
    const cur = soldMap.get(r.product_id) ?? { name, units: 0, value: 0 };
    cur.units += r.quantity;
    cur.value += r.quantity * price;
    soldMap.set(r.product_id, cur);
  });
  const topSellers = Array.from(soldMap.values())
    .sort((a, b) => b.units - a.units)
    .slice(0, 5);

  const allGood = outOfStock.length === 0 && lowStock.length === 0 && totalDues === 0;
  const todayLabel = format(new Date(), "EEEE, d MMM yyyy");

  return (
    <PullToRefresh onRefresh={refreshAll}>
      <div className="mx-auto max-w-5xl space-y-4 pb-20 lg:pb-6">
        {/* 1. Greeting + date + range */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Your shop today</h2>
            <p className="text-sm text-muted-foreground">
              {todayLabel} — what needs your eye first.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <SyncPill isSyncing={isSyncing} hasError={hasError} onRefresh={refreshAll} />
            <div
              className="flex rounded-lg border bg-card p-1"
              role="tablist"
              aria-label="Time range"
            >
              {(["today", "7", "30"] as Range[]).map((r) => (
                <button
                  key={r}
                  role="tab"
                  aria-selected={range === r}
                  onClick={() => setRange(r)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {r === "today" ? "Today" : r === "7" ? "7 days" : "30 days"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. Quick actions — big thumb-friendly buttons */}
        <Reveal>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Button
              size="lg"
              className="h-16 flex-col gap-1 text-sm sm:h-14 sm:flex-row sm:gap-2"
              onClick={() => navigate({ to: "/billing" })}
            >
              <Receipt className="h-5 w-5" />
              New Bill
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 flex-col gap-1 text-sm sm:h-14 sm:flex-row sm:gap-2"
              onClick={() => navigate({ to: "/products" })}
            >
              <Plus className="h-5 w-5" />
              Add Stock
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-16 flex-col gap-1 text-sm sm:h-14 sm:flex-row sm:gap-2"
              onClick={() => navigate({ to: "/billing" })}
            >
              <Wallet className="h-5 w-5" />
              Collect Due
            </Button>
          </div>
        </Reveal>

        {/* 3. Critical numbers in plain words */}
        <Reveal>
          <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
            <HeroCard
              title="Today's sale"
              big={formatINR(todaySale)}
              sub={`${todayBillsCount} bills · ${todayItems === 0 ? "no" : todayBillsCount} customers`}
              icon={IndianRupee}
              accent="green"
              onClick={() => navigate({ to: "/billing" })}
            />
            <HeroCard
              title="Money to collect"
              big={formatINR(totalDues)}
              sub={
                dueRows.length === 0
                  ? "Nothing pending — all clear"
                  : `${dueRows.length} customers pending`
              }
              icon={Wallet}
              accent={totalDues > 0 ? "red" : "green"}
              onClick={() => navigate({ to: "/billing" })}
            />
            <HeroCard
              title="Items finished"
              big={String(outOfStock.length)}
              sub={outOfStock.length === 0 ? "All items available" : "Can't sell — order now"}
              icon={PackageX}
              accent={outOfStock.length > 0 ? "red" : "neutral"}
              onClick={() => setLowOpen(true)}
            />
            <HeroCard
              title="Running low"
              big={String(lowStock.length)}
              sub={lowStock.length === 0 ? "Stock is healthy" : "Will finish soon"}
              icon={AlertTriangle}
              accent={lowStock.length > 0 ? "amber" : "neutral"}
              onClick={() => setLowOpen(true)}
            />
          </div>
        </Reveal>

        {/* 4. Needs your attention */}
        {allGood ? (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="flex items-center gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success/15">
                <CheckCircle2 className="h-5 w-5 text-success" />
              </span>
              <div>
                <p className="font-semibold">All good — shop is healthy</p>
                <p className="text-sm text-muted-foreground">
                  No finished items, no low stock, no pending money.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-warning/40 bg-warning/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-warning" />
                Needs your attention
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {outOfStock.length > 0 && (
                <button
                  onClick={() => setLowOpen(true)}
                  className="flex w-full items-center justify-between rounded-lg bg-background px-3 py-2.5 text-left text-sm shadow-sm"
                >
                  <span>
                    <span className="font-semibold text-destructive">
                      {outOfStock.length} items finished
                    </span>{" "}
                    <span className="text-muted-foreground">
                      —{" "}
                      {outOfStock
                        .slice(0, 2)
                        .map((p) => p.name)
                        .join(", ")}
                      {outOfStock.length > 2 ? ` +${outOfStock.length - 2} more` : ""}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              )}
              {lowStock.length > 0 && (
                <button
                  onClick={() => setLowOpen(true)}
                  className="flex w-full items-center justify-between rounded-lg bg-background px-3 py-2.5 text-left text-sm shadow-sm"
                >
                  <span>
                    <span className="font-semibold text-warning-foreground">
                      {lowStock.length} running low
                    </span>{" "}
                    <span className="text-muted-foreground">— order in next 2–3 days</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              )}
              {totalDues > 0 && (
                <Link
                  to="/billing"
                  className="flex w-full items-center justify-between rounded-lg bg-background px-3 py-2.5 text-left text-sm shadow-sm"
                >
                  <span>
                    <span className="font-semibold">{formatINR(totalDues)} pending</span>{" "}
                    <span className="text-muted-foreground">
                      from {dueRows.length} customers — tap to collect
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              )}
            </CardContent>
          </Card>
        )}

        {/* 5. One simple sales visual + top sellers */}
        <div className="grid gap-3 lg:grid-cols-5">
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <TrendingUp className="h-4 w-4 text-success" />
                Money earned · {rangeLabel}
              </CardTitle>
              <Link to="/billing" className="text-xs text-primary hover:underline">
                Billing
              </Link>
            </CardHeader>
            <CardContent className="h-60">
              {isChartLoading ? (
                <div className="flex h-full flex-col justify-end gap-2" aria-label="Loading sales">
                  <div className="flex flex-1 items-end gap-1.5">
                    {[40, 65, 30, 80, 55, 90, 70, 45, 75, 60, 85, 50].map((h, i) => (
                      <Skeleton
                        key={i}
                        className="flex-1 rounded-t-md"
                        style={{ height: `${h}%` }}
                      />
                    ))}
                  </div>
                  <Skeleton className="h-3 w-full" />
                </div>
              ) : billRows.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend} margin={{ left: -12, right: 8, top: 8 }}>
                    <defs>
                      <linearGradient id="shopSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--success)" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) =>
                        `₹${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`
                      }
                    />
                    <Tooltip formatter={(v: number) => [formatINR(Number(v)), "Sale"]} />
                    <Area
                      type="monotone"
                      dataKey="sale"
                      name="Sale"
                      stroke="var(--success)"
                      strokeWidth={2.5}
                      fill="url(#shopSales)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="No sales in this period"
                  sub="Make your first bill — it will show here."
                  action="New Bill"
                  onAction={() => navigate({ to: "/billing" })}
                />
              )}
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Top selling items</CardTitle>
              <span className="text-xs text-muted-foreground">{rangeLabel}</span>
            </CardHeader>
            <CardContent>
              {isSellersLoading ? (
                <ul className="space-y-2" aria-label="Loading top sellers">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex items-center gap-3 px-2 py-2">
                      <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-3/4" />
                        <Skeleton className="h-3 w-1/3" />
                      </div>
                      <Skeleton className="h-4 w-14 shrink-0" />
                    </li>
                  ))}
                </ul>
              ) : topSellers.length ? (
                <ul className="space-y-1">
                  {topSellers.map((p, i) => (
                    <li
                      key={`${p.name}-${i}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50"
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-bold text-primary">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.units} sold</div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold">{formatINR(p.value)}</div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="Nothing sold yet"
                  sub="Sold items will rank here."
                  action="New Bill"
                  onAction={() => navigate({ to: "/billing" })}
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          {/* Money to collect list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Wallet className="h-4 w-4 text-warning" />
                Money to collect
              </CardTitle>
              <Link
                to="/billing"
                className="flex items-center gap-0.5 text-xs text-primary hover:underline"
              >
                Collect <ArrowRight className="h-3 w-3" />
              </Link>
            </CardHeader>
            <CardContent>
              {dueRows.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No pending money. Every customer has paid.
                </p>
              ) : (
                <ul className="divide-y">
                  {dueRows.slice(0, 5).map((b) => (
                    <li
                      key={b.id}
                      className="flex items-center justify-between gap-3 py-2.5 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">
                          {b.customer_name || "Walk-in customer"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {format(new Date(b.created_at), "d MMM, h:mm a")} · Bill{" "}
                          {formatINR(Number(b.total_amount))}
                        </div>
                      </div>
                      <Badge variant="destructive" className="shrink-0">
                        Due {formatINR(Number(b.due_amount))}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Stock status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-1.5 text-base">
                <Package className="h-4 w-4 text-primary" />
                Stock status
              </CardTitle>
              {attentionCount > 0 && (
                <button
                  onClick={() => setLowOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  See all ({attentionCount})
                </button>
              )}
            </CardHeader>
            <CardContent>
              {attentionCount === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Everything is in stock. Nothing to order.
                </p>
              ) : (
                <ul className="space-y-2">
                  {[...outOfStock.slice(0, 3), ...lowStock.slice(0, 3)].slice(0, 5).map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.sku}</div>
                      </div>
                      {p.quantity <= 0 ? (
                        <Badge variant="destructive">Finished</Badge>
                      ) : (
                        <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">
                          Only {p.quantity} left
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent bills in plain language */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Recent bills</CardTitle>
            <Link to="/billing" className="text-xs text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {recentBills.data?.length ? (
              <ul className="divide-y">
                {recentBills.data.map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {b.customer_name || "Walk-in customer"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(b.created_at), "d MMM, h:mm a")}
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
                        className="mt-0.5 capitalize"
                      >
                        {b.payment_status === "paid"
                          ? "Paid"
                          : b.payment_status === "partial"
                            ? "Half paid"
                            : "Not paid"}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No bills yet — tap New Bill to start selling.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Full stock alert sheet */}
        <Sheet open={lowOpen} onOpenChange={setLowOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[85vh] flex flex-col sm:mx-auto sm:max-w-lg sm:rounded-t-xl"
          >
            <SheetHeader className="text-left">
              <SheetTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Items that need ordering
              </SheetTitle>
              <SheetDescription>
                {attentionCount === 0
                  ? "Everything is in stock."
                  : `${outOfStock.length} finished · ${lowStock.length} running low`}
              </SheetDescription>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto px-1 py-2">
              {attentionCount === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nothing to order right now.
                </p>
              ) : (
                <ul className="divide-y">
                  {[...outOfStock, ...lowStock]
                    .slice()
                    .sort((a, b) => a.quantity - b.quantity)
                    .map((p) => (
                      <li key={p.id}>
                        <SheetClose asChild>
                          <Link
                            to="/products"
                            className="flex items-center justify-between gap-3 rounded-md px-2 py-3 active:bg-muted"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium">{p.name}</div>
                              <div className="truncate font-mono text-xs text-muted-foreground">
                                {p.sku} · {p.quantity} left
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {p.quantity <= 0 ? (
                                <Badge variant="destructive">Finished</Badge>
                              ) : (
                                <Badge className="bg-warning text-warning-foreground">Low</Badge>
                              )}
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </Link>
                        </SheetClose>
                      </li>
                    ))}
                </ul>
              )}
            </div>
            <SheetFooter className="pt-2">
              <SheetClose asChild>
                <Button asChild className="w-full">
                  <Link to="/products">Open products & order</Link>
                </Button>
              </SheetClose>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      </div>
    </PullToRefresh>
  );
}

function DashboardSkeleton() {
  return (
    <div
      className="mx-auto max-w-5xl animate-pulse space-y-4 pb-20 lg:pb-6"
      aria-label="Loading shop dashboard"
      aria-busy="true"
    >
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-9 w-28 rounded-lg" />
          <Skeleton className="h-9 w-44 rounded-lg" />
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Skeleton className="h-16 rounded-lg sm:h-14" />
        <Skeleton className="h-16 rounded-lg sm:h-14" />
        <Skeleton className="h-16 rounded-lg sm:h-14" />
      </div>

      {/* Hero cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="overflow-hidden">
            <CardContent className="space-y-2 p-3 sm:p-4">
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Attention box */}
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2 pt-0">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </CardContent>
      </Card>

      {/* Chart + top sellers */}
      <div className="grid gap-3 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-44" />
          </CardHeader>
          <CardContent className="h-60">
            <div className="flex h-full flex-col justify-end gap-2">
              <div className="flex flex-1 items-end gap-1.5">
                {[40, 65, 30, 80, 55, 90, 70, 45, 75, 60, 85, 50].map((h, i) => (
                  <Skeleton key={i} className="flex-1 rounded-t-md" style={{ height: `${h}%` }} />
                ))}
              </div>
              <Skeleton className="h-3 w-full" />
            </div>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <Skeleton className="h-5 w-36" />
          </CardHeader>
          <CardContent className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-2">
                <Skeleton className="h-7 w-7 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-14 shrink-0" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Dues + stock */}
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-2">
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent bills */}
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

function HeroCard({
  title,
  big,
  sub,
  icon: Icon,
  accent,
  onClick,
}: {
  title: string;
  big: string;
  sub: string;
  icon: React.ElementType;
  accent: "green" | "red" | "amber" | "neutral";
  onClick?: () => void;
}) {
  const bar =
    accent === "red"
      ? "bg-destructive"
      : accent === "green"
        ? "bg-success"
        : accent === "amber"
          ? "bg-warning"
          : "bg-primary";
  const iconBox =
    accent === "red"
      ? "bg-destructive/10 text-destructive"
      : accent === "green"
        ? "bg-success/10 text-success"
        : accent === "amber"
          ? "bg-warning/10 text-warning-foreground"
          : "bg-primary/10 text-primary";
  return (
    <Card
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
      className="relative cursor-pointer overflow-hidden transition-all hover:shadow-md active:scale-[0.98]"
    >
      <span className={`absolute inset-y-0 left-0 w-1 ${bar}`} aria-hidden />
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {title}
            </div>
            <div className="mt-0.5 truncate text-xl font-bold leading-tight sm:text-2xl">{big}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</div>
          </div>
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconBox}`}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  sub,
  action,
  onAction,
}: {
  title: string;
  sub: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{sub}</p>
      <Button size="sm" variant="outline" onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

function SyncPill({
  isSyncing,
  hasError,
  onRefresh,
}: {
  isSyncing: boolean;
  hasError: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-xs">
      <span
        className={`h-2 w-2 rounded-full ${hasError ? "bg-destructive" : isSyncing ? "bg-warning animate-pulse" : "bg-success"}`}
        aria-hidden
      />
      <span className="hidden font-medium sm:inline">
        {hasError ? "Sync failed" : isSyncing ? "Updating…" : "Up to date"}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => onRefresh()}
        disabled={isSyncing}
        aria-label="Refresh now"
      >
        {isSyncing ? (
          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        )}
      </Button>
    </div>
  );
}
