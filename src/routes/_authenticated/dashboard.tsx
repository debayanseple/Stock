import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, DollarSign, AlertTriangle, ArrowLeftRight } from "lucide-react";
import type { Product, Transaction } from "@/lib/inventory-types";
import { stockStatus } from "@/lib/inventory-types";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — StockHub" }] }),
  component: Dashboard,
});

function Dashboard() {
  const products = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*");
      if (error) throw error;
      return data as Product[];
    },
  });

  const txns = useQuery({
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

  const items = products.data ?? [];
  const totalProducts = items.length;
  const totalValue = items.reduce((s, p) => s + Number(p.unit_price) * p.quantity, 0);
  const lowStock = items.filter((p) => stockStatus(p) !== "ok");
  const chartData = [...items]
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 8)
    .map((p) => ({ name: p.name.length > 12 ? p.name.slice(0, 12) + "…" : p.name, qty: p.quantity }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total products" value={totalProducts} icon={Package} />
        <StatCard
          label="Total stock value"
          value={`$${totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          icon={DollarSign}
        />
        <StatCard label="Low / out of stock" value={lowStock.length} icon={AlertTriangle} tone="warn" />
        <StatCard label="Recent movements" value={txns.data?.length ?? 0} icon={ArrowLeftRight} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Top stock levels</CardTitle></CardHeader>
          <CardContent className="h-64">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
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
        <CardHeader><CardTitle>Recent transactions</CardTitle></CardHeader>
        <CardContent>
          {txns.data?.length ? (
            <ul className="divide-y">
              {txns.data.map((t) => (
                <li key={t.id} className="py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{t.products?.name ?? "Deleted product"}</div>
                    <div className="text-xs text-muted-foreground">{format(new Date(t.created_at), "PPp")}{t.notes ? ` · ${t.notes}` : ""}</div>
                  </div>
                  <Badge variant={t.type === "in" ? "default" : "secondary"}>
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

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: React.ReactNode; icon: React.ElementType; tone?: "warn" }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold mt-1">{value}</div>
          </div>
          <div className={`h-9 w-9 rounded-md flex items-center justify-center ${tone === "warn" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
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
  if (s === "low") return <Badge className="bg-orange-500 hover:bg-orange-500 text-white">Low · {product.quantity}</Badge>;
  return <Badge variant="secondary">{product.quantity}</Badge>;
}