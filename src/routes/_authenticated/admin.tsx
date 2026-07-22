import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/auth" });
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!data) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Admin portal — StockLine" },
      { name: "description", content: "Super admin portal to approve organizations and manage tenant access." },
      { property: "og:title", content: "Admin portal — StockLine" },
      { property: "og:description", content: "Super admin portal to approve organizations and manage tenant access." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

type Org = { id: string; name: string; status: string; created_at: string };
type Profile = { id: string; email: string | null; full_name: string | null; status: string; org_id: string | null; created_at: string };

function AdminPage() {
  const qc = useQueryClient();

  const orgs = useQuery({
    queryKey: ["admin", "organizations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("id, name, status, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Org[];
    },
  });

  const profiles = useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, email, full_name, status, org_id, created_at").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const setOrgStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "approved") {
        const { data: userRes } = await supabase.auth.getUser();
        patch.approved_at = new Date().toISOString();
        patch.approved_by = userRes.user?.id ?? null;
      }
      const { error } = await supabase.from("organizations").update(patch).eq("id", id);
      if (error) throw error;
      // cascade approval to profiles in that org
      const { error: pErr } = await supabase.from("profiles").update({ status }).eq("org_id", id);
      if (pErr) throw pErr;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Organization approved" : "Organization rejected");
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setProfileStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "User approved" : "User rejected");
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusBadge = (s: string) => {
    const variant = s === "approved" ? "default" : s === "rejected" ? "destructive" : "secondary";
    return <Badge variant={variant as "default" | "destructive" | "secondary"}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Organizations</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.data?.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="font-medium">{o.name}</TableCell>
                  <TableCell>{statusBadge(o.status)}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {o.status !== "approved" && (
                      <Button size="sm" onClick={() => setOrgStatus.mutate({ id: o.id, status: "approved" })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    )}
                    {o.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => setOrgStatus.mutate({ id: o.id, status: "rejected" })}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Users</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.email ?? "—"}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-right space-x-2">
                    {p.status !== "approved" && (
                      <Button size="sm" onClick={() => setProfileStatus.mutate({ id: p.id, status: "approved" })}>
                        <Check className="h-4 w-4" /> Approve
                      </Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" variant="outline" onClick={() => setProfileStatus.mutate({ id: p.id, status: "rejected" })}>
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    )}
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