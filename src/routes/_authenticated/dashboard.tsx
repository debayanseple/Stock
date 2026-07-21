import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, IndianRupee, AlertTriangle } from "lucide-react";
import type { Category, Product, Transaction } from "@/lib/inventory-types";
import { stockStatus, formatINR } from "@/lib/inventory-types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Legend, PieChart, Pie, Cell } from "recharts";
import { format, startOfQuarter, endOfQuarter, subQuarters, startOfYear, endOfYear, subYears, differenceInCalendarDays } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — StockSathi" }] }),
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
  const { since, until, days, label: rangeLabel } = useMemo(() => resolveRange(range), [range]);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
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
        .select("id, type, quantity, created_at, product_id, products(name, sku, unit_price, category_id)")
        .gte("created_at", sinceIso)
        .lte("created_at", untilIso)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Array<Transaction & { products: { name: string; sku: string; unit_price: number; category_id: string | null } | null }>;
    },
  });

  const items = products.data ?? [];
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
    const label = p.category_id ? catNames.get(p.category_id) ?? "Uncategorized" : "Uncategorized";
    catValues.set(label, (catValues.get(label) ?? 0) + Number(p.unit_price) * p.quantity);
  });
  const catData = Array.from(catValues.entries())
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
  const pieColors = ["var(--primary)", "var(--accent-brand)", "var(--success)", "var(--warning)", "var(--primary-glow)", "var(--destructive)", "var(--muted-foreground)"];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-xs text-muted-foreground">Insights across your inventory and movements.</p>
        </div>
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

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total products" value={totalProducts} icon={Package} />
        <StatCard
          label="Total stock value"
          value={formatINR(totalValue)}
          icon={IndianRupee}
        />
        <StatCard label="Low / out of stock" value={lowStock.length} icon={AlertTriangle} tone="warn" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top movers · {rangeLabel}</CardTitle></CardHeader>
          <CardContent className="h-64">
            {topMovers.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMovers}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="In" stackId="a" fill="var(--primary)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Out" stackId="a" fill="var(--warning)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No movements in this range</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily stock flow · {rangeLabel}</CardTitle></CardHeader>
          <CardContent className="h-64">
            {rows.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} interval={Math.max(0, Math.floor(days / 10))} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="In" stroke="var(--primary)" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="Out" stroke="var(--warning)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No movements in this range</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Top sellers · {rangeLabel}</CardTitle></CardHeader>
          <CardContent>
            {topSellers.length ? (
              <ul className="space-y-2">
                {topSellers.map((p, i) => (
                  <li key={p.name + i} className="flex items-center justify-between gap-3 text-sm border-b last:border-0 pb-2 last:pb-0">
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="h-6 w-6 shrink-0 rounded-md bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">{i + 1}</span>
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
              <p className="text-sm text-muted-foreground">No stock-out activity in this range.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stock value by category</CardTitle></CardHeader>
          <CardContent className="h-64">
            {catData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={catData} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40} paddingAngle={2}>
                    {catData.map((_, i) => <Cell key={i} fill={pieColors[i % pieColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Add products to see distribution</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Low-stock alerts</CardTitle></CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items are above their reorder threshold.</p>
            ) : (
              <ul className="space-y-2">
                {lowStock.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
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
          <CardTitle>Recent transactions</CardTitle>
          <Link to="/transactions" className="text-xs text-primary hover:underline">View all</Link>
        </CardHeader>
        <CardContent>
          {recent.data?.length ? (
            <ul className="divide-y">
              {recent.data.map((t) => (
              <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{t.products?.name ?? "Deleted product"}</div>
                    <div className="text-xs text-muted-foreground truncate">{format(new Date(t.created_at), "PPp")}{t.notes ? ` · ${t.notes}` : ""}</div>
                  </div>
                  <Badge variant={t.type === "in" ? "default" : "secondary"} className="shrink-0">
                    {t.type === "in" ? "+" : "−"}{t.quantity}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No transactions yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: React.ElementType; tone?: "warn" | "ok" }) {
  const toneCls = tone === "warn"
    ? "bg-destructive/10 text-destructive"
    : tone === "ok"
    ? "bg-success/10 text-success"
    : "bg-primary/10 text-primary";
  return (
    <Card>
      <CardContent className="pt-4 sm:pt-6">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-lg sm:text-2xl font-semibold mt-1 break-words">{value}</div>
          </div>
          <div className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-md flex items-center justify-center ${toneCls}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StockBadge({ product }: { product: Product }) {
  const s = stockStatus(product);
  if (s === "out") return <Badge variant="destructive">Out of stock</Badge>;
  if (s === "low") return <Badge className="bg-warning text-warning-foreground hover:bg-warning/90">Low · {product.quantity}</Badge>;
  return <Badge className="bg-success text-success-foreground hover:bg-success/90">{product.quantity}</Badge>;
}