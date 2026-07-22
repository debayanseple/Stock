import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { Supplier } from "@/lib/inventory-types";
import { useProfile } from "@/hooks/use-profile";

export const Route = createFileRoute("/_authenticated/suppliers")({
  head: () => ({
    meta: [
      { title: "Suppliers — StockLine" },
      { name: "description", content: "Manage suppliers, contact details, and reorder outreach for your inventory." },
      { property: "og:title", content: "Suppliers — StockLine" },
      { property: "og:description", content: "Manage suppliers, contact details, and reorder outreach for your inventory." },
      { property: "og:url", content: "/suppliers" },
    ],
    links: [{ rel: "canonical", href: "/suppliers" }],
  }),
  component: SuppliersPage,
});

type Form = { name: string; contact_name: string; email: string; phone: string; address: string };
type FieldErrors = Partial<Record<"name" | "phone", string>>;
const empty: Form = { name: "", contact_name: "", email: "", phone: "", address: "" };

function SuppliersPage() {
  const qc = useQueryClient();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [errors, setErrors] = useState<FieldErrors>({});
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const validateForm = (f: Form): FieldErrors => {
    const e: FieldErrors = {};
    if (!f.name.trim()) e.name = "Name is required";
    if (!f.phone.trim()) e.phone = "Phone is required";
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

  const { data = [], isLoading } = useQuery({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("suppliers").select("*").order("name");
      if (error) throw error;
      return data as Supplier[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Name is required");
      const payload = {
        name: form.name.trim(),
        contact_name: form.contact_name || null,
        email: form.email || null,
        phone: form.phone || null,
        address: form.address || null,
      };
      if (editing) {
        const { error } = await supabase.from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        if (!profile?.org_id) throw new Error("No organization assigned");
        const { error } = await supabase.from("suppliers").insert({ ...payload, org_id: profile.org_id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Supplier updated" : "Supplier added");
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      setOpen(false);
      setEditing(null);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Supplier deleted"); qc.invalidateQueries({ queryKey: ["suppliers"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openNew = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm({ name: s.name, contact_name: s.contact_name ?? "", email: s.email ?? "", phone: s.phone ?? "", address: s.address ?? "" });
    setOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-center">
        <p className="text-sm text-muted-foreground">People and companies you source products from.</p>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-1" /> New supplier</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit supplier" : "New supplier"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1"><Label>Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>Contact</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
                <div className="space-y-1"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>Address</Label><Textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Contact</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead className="w-32 text-right">Actions</TableHead></TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No suppliers yet.</TableCell></TableRow>
              ) : data.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contact_name}</TableCell>
                  <TableCell>{s.email}</TableCell>
                  <TableCell>{s.phone}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label={`Edit supplier ${s.name}`} onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Delete supplier ${s.name}`} onClick={() => { if (confirm(`Delete "${s.name}"?`)) del.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}