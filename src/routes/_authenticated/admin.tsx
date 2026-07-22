import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, Building2, Users, Clock, CheckCircle2, XCircle, TrendingUp, Ban } from "lucide-react";
import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

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
  return <AdminPageInner />;
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: "success" | "warning" | "danger" }) {
  const toneClass =
    tone === "success" ? "text-[color:var(--success,theme(colors.green.600))]" :
    tone === "warning" ? "text-amber-600" :
    tone === "danger" ? "text-destructive" :
    "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={toneClass}>{icon}</span>
          <span>{label}</span>
        </div>
        <div className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function AdminPageInner() {
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

  const stats = useMemo(() => {
    const o = orgs.data ?? [];
    const p = profiles.data ?? [];
    const orgById = new Map(o.map((x) => [x.id, x]));
    // exclude super_admin's own profile row from user counts by filtering profiles with no org_id
    const orgProfiles = p.filter((x) => x.org_id && orgById.has(x.org_id));
    return {
      totalOrgs: o.length,
      pendingOrgs: o.filter((x) => x.status === "pending").length,
      approvedOrgs: o.filter((x) => x.status === "approved").length,
      rejectedOrgs: o.filter((x) => x.status === "rejected").length,
      totalUsers: orgProfiles.length,
      pendingUsers: orgProfiles.filter((x) => x.status === "pending").length,
      approvedUsers: orgProfiles.filter((x) => x.status === "approved").length,
    };
  }, [orgs.data, profiles.data]);

  const orgNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orgs.data ?? []) m.set(o.id, o.name);
    return m;
  }, [orgs.data]);

  const signupChart = useMemo(() => {
    const days: { date: string; label: string; orgs: number; users: number }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        orgs: 0,
        users: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    for (const o of orgs.data ?? []) {
      const k = o.created_at.slice(0, 10);
      const i = idx.get(k);
      if (i !== undefined) days[i].orgs += 1;
    }
    for (const p of profiles.data ?? []) {
      if (!p.org_id) continue;
      const k = p.created_at.slice(0, 10);
      const i = idx.get(k);
      if (i !== undefined) days[i].users += 1;
    }
    return days;
  }, [orgs.data, profiles.data]);

  const pendingOrgs = (orgs.data ?? []).filter((o) => o.status === "pending");
  const recentOrgs = (orgs.data ?? []).slice(0, 5);

  const setOrgStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "approved" | "rejected" | "suspended" }) => {
      const patch: { status: "approved" | "rejected" | "suspended"; approved_at?: string; approved_by?: string | null } = { status };
      if (status === "approved") {
        const { data: userRes } = await supabase.auth.getUser();
        patch.approved_at = new Date().toISOString();
        patch.approved_by = userRes.user?.id ?? null;
      }
      const { error } = await supabase.from("organizations").update(patch).eq("id", id);
      if (error) throw error;
      // cascade status to member profiles so their access reflects org state
      const profileStatus = status === "suspended" ? "rejected" : status;
      const { error: pErr } = await supabase.from("profiles").update({ status: profileStatus }).eq("org_id", id);
      if (pErr) throw pErr;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.status === "approved" ? "Organization approved" :
        v.status === "suspended" ? "Organization suspended" :
        "Organization rejected"
      );
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
    const variant =
      s === "approved" ? "default" :
      s === "rejected" || s === "suspended" ? "destructive" :
      "secondary";
    return <Badge variant={variant as "default" | "destructive" | "secondary"}>{s}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Overview</h2>
        <p className="text-sm text-muted-foreground">Platform-wide activity across all organizations.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Building2 className="h-4 w-4" />} label="Organizations" value={stats.totalOrgs} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Pending orgs" value={stats.pendingOrgs} tone="warning" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Approved orgs" value={stats.approvedOrgs} tone="success" />
        <StatCard icon={<XCircle className="h-4 w-4" />} label="Rejected orgs" value={stats.rejectedOrgs} tone="danger" />
        <StatCard icon={<Users className="h-4 w-4" />} label="Total users" value={stats.totalUsers} />
        <StatCard icon={<Clock className="h-4 w-4" />} label="Pending users" value={stats.pendingUsers} tone="warning" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4" />} label="Approved users" value={stats.approvedUsers} tone="success" />
        <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Avg users / org" value={stats.approvedOrgs ? (stats.approvedUsers / stats.approvedOrgs).toFixed(1) : "0"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Signups · last 30 days</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={signupChart}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="orgs" name="Orgs" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="users" name="Users" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Pending approvals</CardTitle></CardHeader>
          <CardContent>
            {pendingOrgs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No organizations awaiting approval.</p>
            ) : (
              <ul className="space-y-2">
                {pendingOrgs.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 border rounded-md p-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{o.name}</div>
                      <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" onClick={() => setOrgStatus.mutate({ id: o.id, status: "approved" })}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setOrgStatus.mutate({ id: o.id, status: "rejected" })}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

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
                        <Check className="h-4 w-4" /> {o.status === "suspended" ? "Reactivate" : "Approve"}
                      </Button>
                    )}
                    {o.status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (window.confirm(`Suspend "${o.name}"? All members will lose access until reactivated.`)) {
                            setOrgStatus.mutate({ id: o.id, status: "suspended" });
                          }
                        }}
                      >
                        <Ban className="h-4 w-4" /> Suspend
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
                <TableHead>Organization</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.full_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.org_id ? (orgNameById.get(p.org_id) ?? "—") : "—"}</TableCell>
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