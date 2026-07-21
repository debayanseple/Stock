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

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({ meta: [{ title: "Dashboard — StockHub" }] }),
  component: DashboardRedirect,
});

function DashboardRedirect() {
  // /dashboard is the primary dashboard route; keep _authenticated/ as a redirect.
  if (typeof window !== "undefined") window.location.replace("/dashboard");
  return null;
}