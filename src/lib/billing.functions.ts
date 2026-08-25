import { supabase } from "@/integrations/supabase/client";
import type { Bill, PaymentMethod, PaymentStatus } from "@/lib/inventory-types";

export type CreateBillInput = {
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  items: { product_id: string; quantity: number; unit_price: number }[];
  payment_method: PaymentMethod;
  paid_amount: number;
  notes?: string;
  discount_amount: number;
  tax_amount: number;
};

export async function createBill(input: CreateBillInput): Promise<{ bill_id: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .single();
  if (!profile?.org_id) throw new Error("No organization assigned");

  const { data: billId, error } = await supabase.rpc("create_bill_with_stock", {
    _org_id: profile.org_id,
    _customer_name: input.customer_name ?? "",
    _customer_phone: input.customer_phone ?? "",
    _customer_email: input.customer_email || "",
    _items: input.items,
    _payment_method: input.payment_method,
    _paid_amount: input.paid_amount,
    _notes: input.notes ?? "",
    _discount_amount: input.discount_amount,
    _tax_amount: input.tax_amount,
  });

  if (error) throw new Error(error.message);
  if (!billId) throw new Error("Failed to create bill");
  return { bill_id: billId };
}

export async function updateBillPayment(input: {
  bill_id: string;
  paid_amount: number;
  payment_method: PaymentMethod;
}): Promise<{ success: boolean; payment_status: PaymentStatus; due_amount: number }> {
  const { data: bill, error: billError } = await supabase
    .from("bills")
    .select("total_amount")
    .eq("id", input.bill_id)
    .single();

  if (billError || !bill) throw new Error("Bill not found");

  const dueAmount = Math.max(0, bill.total_amount - input.paid_amount);
  const newStatus: PaymentStatus =
    input.paid_amount >= bill.total_amount ? "paid" : input.paid_amount > 0 ? "partial" : "pending";

  const { error } = await supabase
    .from("bills")
    .update({
      payment_status: newStatus,
      paid_amount: input.paid_amount,
      due_amount: dueAmount,
      payment_method: input.payment_method,
    })
    .eq("id", input.bill_id);

  if (error) throw new Error(error.message);
  return { success: true, payment_status: newStatus, due_amount: dueAmount };
}

export async function getBills(limit = 50, offset = 0): Promise<Bill[]> {
  const { data, error } = await supabase
    .from("bills")
    .select("*, items:bill_items(*)")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return (data as Bill[]) ?? [];
}

export async function getBillById(billId: string): Promise<Bill> {
  const { data, error } = await supabase
    .from("bills")
    .select("*, items:bill_items(*)")
    .eq("id", billId)
    .single();

  if (error) throw new Error(error.message);
  return data as Bill;
}
