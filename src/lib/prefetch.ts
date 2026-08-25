import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Prefetch helpers: warm the React Query cache for a section before the user
// commits to navigating there. Keys must match the ones used by each page.
export function prefetchSection(qc: QueryClient, path: string): void {
  switch (true) {
    case path.startsWith("/products"):
      prefetchProducts(qc);
      prefetchCategories(qc);
      prefetchSuppliers(qc);
      break;
    case path.startsWith("/categories"):
      prefetchCategories(qc);
      break;
    case path.startsWith("/suppliers"):
      prefetchSuppliers(qc);
      break;
    case path.startsWith("/transactions"):
      qc.prefetchQuery({
        queryKey: ["transactions", "all"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("transactions")
            .select("*, products(name, sku)")
            .order("created_at", { ascending: false })
            .limit(500);
          if (error) throw error;
          return data;
        },
        staleTime: 30_000,
      });
      break;
    case path.startsWith("/billing"):
      prefetchProducts(qc);
      break;
    case path.startsWith("/dashboard"):
      prefetchProducts(qc);
      prefetchCategories(qc);
      prefetchRecentTransactions(qc);
      prefetchRecentBills(qc);
      break;
  }
}

function prefetchProducts(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .is("deleted_at", null)
        .order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

function prefetchCategories(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

function prefetchSuppliers(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data;
    },
    staleTime: 60_000,
  });
}

function prefetchRecentTransactions(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: ["transactions", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}

function prefetchRecentBills(qc: QueryClient) {
  void qc.prefetchQuery({
    queryKey: ["bills", "recent"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select("id, customer_name, total_amount, payment_status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
  });
}
