import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { format } from "date-fns";
import type { Transaction } from "@/lib/inventory-types";
import { downloadCSV } from "@/lib/inventory-types";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Transactions — StockSathi" },
      { name: "description", content: "Review the full audit log of stock-in and stock-out movements across your inventory." },
      { property: "og:title", content: "Transactions — StockSathi" },
      { property: "og:description", content: "Review the full audit log of stock-in and stock-out movements across your inventory." },
      { property: "og:url", content: "/transactions" },
    ],
    links: [{ rel: "canonical", href: "/transactions" }],
  }),
  component: TransactionsPage,
});

type Row = Transaction & { products: { name: string; sku: string } | null };

function TransactionsPage() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["transactions", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Row[];
    },
  });

  const exportCSV = () => {
    downloadCSV("transactions.csv", data.map((t) => ({
      date: t.created_at,
      product: t.products?.name ?? "",
      sku: t.products?.sku ?? "",
      type: t.type,
      quantity: t.quantity,
      notes: t.notes ?? "",
    })));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <p className="text-sm text-muted-foreground">Every stock-in and stock-out movement.</p>
        <Button variant="outline" onClick={exportCSV} className="w-full sm:w-auto"><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
      </div>
      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
        ) : data.length === 0 ? (
          <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">No transactions yet.</CardContent></Card>
        ) : data.map((t) => (
          <Card key={t.id}>
            <CardContent className="p-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{t.products?.name ?? "Deleted"}</div>
                  <div className="font-mono text-[11px] text-muted-foreground truncate">{t.products?.sku ?? ""}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">{format(new Date(t.created_at), "PPp")}</div>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  {t.type === "in"
                    ? <Badge>Stock in</Badge>
                    : <Badge variant="secondary">Stock out</Badge>}
                  <div className={`text-sm font-semibold ${t.type === "in" ? "text-success" : "text-warning"}`}>
                    {t.type === "in" ? "+" : "−"}{t.quantity}
                  </div>
                </div>
              </div>
              {t.notes && <div className="mt-2 text-xs text-muted-foreground border-t pt-2">{t.notes}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No transactions yet.</TableCell></TableRow>
              ) : data.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="text-sm">{format(new Date(t.created_at), "PPp")}</TableCell>
                  <TableCell className="font-medium">{t.products?.name ?? "Deleted"}</TableCell>
                  <TableCell className="font-mono text-xs">{t.products?.sku ?? ""}</TableCell>
                  <TableCell>
                    {t.type === "in"
                      ? <Badge>Stock in</Badge>
                      : <Badge variant="secondary">Stock out</Badge>}
                  </TableCell>
                  <TableCell className="text-right font-medium">{t.type === "in" ? "+" : "−"}{t.quantity}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.notes}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}