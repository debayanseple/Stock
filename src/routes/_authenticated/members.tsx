import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Bar, CardSkeleton } from "@/components/skeletons";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Check, RefreshCw, UserPlus, Copy, Trash2, MoreHorizontal, Ban, UserX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";

type AppRole = "admin" | "staff" | "super_admin";
type Status = "pending" | "approved" | "rejected";

interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  status: Status;
  org_id: string | null;
  roles: AppRole[];
}

export const Route = createFileRoute("/_authenticated/members")({
  head: () => ({
    meta: [
      { title: "Team members — StockLine" },
      {
        name: "description",
        content: "Approve, remove, and change roles for members of your organization.",
      },
      { property: "og:title", content: "Team members — StockLine" },
      {
        property: "og:description",
        content: "Approve, remove, and change roles for members of your organization.",
      },
      { property: "og:url", content: "/members" },
    ],
    links: [{ rel: "canonical", href: "/members" }],
  }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) throw redirect({ to: "/auth", search: { invite: undefined } });
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userRes.user.id)
      .in("role", ["admin", "super_admin"])
      .maybeSingle();
    if (!role) throw redirect({ to: "/dashboard" });
  },
  component: MembersPage,
});

interface InviteRow {
  id: string;
  email: string;
  role: AppRole;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

function statusBadge(s: Status) {
  if (s === "approved") return <Badge>Approved</Badge>;
  if (s === "pending") return <Badge variant="secondary">Pending</Badge>;
  // Deliberately muted, not destructive: removal is history, not an error.
  return (
    <Badge
      variant="outline"
      className="border-muted-foreground/30 bg-muted/40 text-muted-foreground"
    >
      Removed
    </Badge>
  );
}

function MembersPage() {
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("staff");
  const [linkForInvite, setLinkForInvite] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ["org_members"],
    queryFn: async (): Promise<Member[]> => {
      // RLS scopes profiles + user_roles to the caller's organization.
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("id, full_name, email, status, org_id")
        .order("status", { ascending: true })
        .order("full_name", { ascending: true });
      if (pErr) throw pErr;
      const ids = (profiles ?? []).map((p) => p.id);
      if (ids.length === 0) return [];
      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      if (rErr) throw rErr;
      const byUser = new Map<string, AppRole[]>();
      (roles ?? []).forEach((r) => {
        const arr = byUser.get(r.user_id) ?? [];
        arr.push(r.role as AppRole);
        byUser.set(r.user_id, arr);
      });
      return (profiles ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        email: p.email,
        status: p.status as Status,
        org_id: p.org_id,
        roles: byUser.get(p.id) ?? [],
      }));
    },
  });

  const { data: me } = useQuery({
    queryKey: ["me_id"],
    queryFn: async () => (await supabase.auth.getUser()).data.user?.id ?? null,
    staleTime: Infinity,
  });

  const { data: myProfile } = useQuery({
    queryKey: ["my_profile_org"],
    queryFn: async () => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid) return null;
      const { data } = await supabase.from("profiles").select("org_id").eq("id", uid).maybeSingle();
      return data;
    },
    staleTime: 60_000,
  });

  const { data: invites = [] } = useQuery({
    queryKey: ["org_invites"],
    queryFn: async (): Promise<InviteRow[]> => {
      const { data, error } = await supabase
        .from("org_invites")
        .select("id, email, role, token, expires_at, accepted_at, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InviteRow[];
    },
  });

  // Compute current role capacity (excluding super_admin) — matches DB trigger.
  const nonSuperMembers = members.filter(
    (m) => !m.roles.includes("super_admin") && m.status === "approved",
  );
  const approvedAdminCount = nonSuperMembers.filter((m) => m.roles.includes("admin")).length;
  const approvedStaffCount = nonSuperMembers.filter((m) => !m.roles.includes("admin")).length;
  const pendingAdminInvites = invites.filter(
    (i) => !i.accepted_at && new Date(i.expires_at) > new Date() && i.role === "admin",
  ).length;
  const pendingStaffInvites = invites.filter(
    (i) => !i.accepted_at && new Date(i.expires_at) > new Date() && i.role === "staff",
  ).length;
  const canInviteAdmin = approvedAdminCount + pendingAdminInvites < 1;
  const canInviteStaff = approvedStaffCount + pendingStaffInvites < 1;

  const createInvite = useMutation({
    mutationFn: async ({ email, role }: { email: string; role: AppRole }) => {
      const uid = (await supabase.auth.getUser()).data.user?.id;
      if (!uid || !myProfile?.org_id) throw new Error("Missing organization context");
      const { data, error } = await supabase
        .from("org_invites")
        .insert({
          email: email.toLowerCase().trim(),
          role,
          org_id: myProfile.org_id,
          invited_by: uid,
        })
        .select("token")
        .single();
      if (error) throw error;
      return data.token as string;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/auth?invite=${token}`;
      setLinkForInvite(url);
      navigator.clipboard?.writeText(url).catch(() => {});
      toast.success("Invite created — link copied to clipboard");
      qc.invalidateQueries({ queryKey: ["org_invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const revokeInvite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("org_invites").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invite revoked");
      qc.invalidateQueries({ queryKey: ["org_invites"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return toast.error("Enter an email");
    if (inviteRole === "admin" && !canInviteAdmin)
      return toast.error("Limit reached: 1 admin per organization.");
    if (inviteRole === "staff" && !canInviteStaff)
      return toast.error("Limit reached: 1 staff per organization.");
    createInvite.mutate({ email: inviteEmail, role: inviteRole });
    setInviteEmail("");
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/auth?invite=${token}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success("Invite link copied"),
      () => toast.error("Could not copy"),
    );
  };

  const pendingInvites = invites.filter(
    (i) => !i.accepted_at && new Date(i.expires_at) > new Date(),
  );

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("profiles").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member updated");
      qc.invalidateQueries({ queryKey: ["org_members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const primaryRole = (roles: AppRole[]): AppRole => {
    if (roles.includes("super_admin")) return "super_admin";
    if (roles.includes("admin")) return "admin";
    return "staff";
  };

  // Removed members are kept as history but hidden from the active roster:
  // they cannot be re-approved, only invited again.
  const activeMembers = members.filter((m) => m.status !== "rejected");
  const removedMembers = members.filter((m) => m.status === "rejected");

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Invite and manage the people in your organization (max 1 admin + 1 staff).
        </p>
        <div className="flex gap-2 shrink-0 self-end sm:self-auto">
          <Dialog
            open={inviteOpen}
            onOpenChange={(v) => {
              setInviteOpen(v);
              if (!v) setLinkForInvite(null);
            }}
          >
            <DialogTrigger asChild>
              <Button size="sm">
                <UserPlus className="h-4 w-4 mr-1" /> Invite
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite a team member</DialogTitle>
                <DialogDescription>
                  Share the generated link with them. They'll sign up and join your organization
                  automatically.
                </DialogDescription>
              </DialogHeader>
              {linkForInvite ? (
                <div className="space-y-3">
                  <Label className="text-sm">Invite link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={linkForInvite}
                      onFocus={(e) => e.currentTarget.select()}
                      className="min-w-0 flex-1 text-xs"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard?.writeText(linkForInvite);
                        toast.success("Copied");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Send this link to the invitee. It expires in 7 days.
                  </p>
                  <DialogFooter>
                    <Button
                      onClick={() => {
                        setInviteOpen(false);
                        setLinkForInvite(null);
                      }}
                    >
                      Done
                    </Button>
                  </DialogFooter>
                </div>
              ) : (
                <form onSubmit={handleInviteSubmit} className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="inv-email">Email</Label>
                    <Input
                      id="inv-email"
                      type="email"
                      required
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="teammate@example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Role</Label>
                    <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as AppRole)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin" disabled={!canInviteAdmin}>
                          Admin {!canInviteAdmin && "(limit reached)"}
                        </SelectItem>
                        <SelectItem value="staff" disabled={!canInviteStaff}>
                          Staff {!canInviteStaff && "(limit reached)"}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Admin slots: {approvedAdminCount + pendingAdminInvites}/1 · Staff slots:{" "}
                    {approvedStaffCount + pendingStaffInvites}/1
                  </p>
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={createInvite.isPending || (!canInviteAdmin && !canInviteStaff)}
                    >
                      {createInvite.isPending ? "Creating…" : "Create invite link"}
                    </Button>
                  </DialogFooter>
                </form>
              )}
            </DialogContent>
          </Dialog>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              qc.invalidateQueries({ queryKey: ["org_members"] });
              qc.invalidateQueries({ queryKey: ["org_invites"] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {pendingInvites.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-2">
            <div className="text-sm font-medium">Pending invites</div>
            <div className="space-y-2">
              {pendingInvites.map((inv) => (
                <div key={inv.id} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{inv.email}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="capitalize">
                        {inv.role}
                      </Badge>
                      <span className="truncate">
                        expires {new Date(inv.expires_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9"
                      aria-label="Copy invite link"
                      onClick={() => copyLink(inv.token)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-9 w-9 hover:text-destructive"
                      aria-label="Revoke invite"
                      onClick={() => revokeInvite.mutate(inv.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mobile cards */}
      <div className="sm:hidden space-y-2">
        {isLoading ? (
          <>
            {Array.from({ length: 3 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </>
        ) : activeMembers.length === 0 ? (
          <Card>
            <CardContent className="p-4 text-center text-sm text-muted-foreground">
              No members yet.
            </CardContent>
          </Card>
        ) : (
          activeMembers.map((m) => {
            const isMe = m.id === me;
            const role = primaryRole(m.roles);
            const isSuper = m.roles.includes("super_admin");
            return (
              <Card key={m.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">
                        {m.full_name || "—"}
                        {isMe && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                    </div>
                    {statusBadge(m.status)}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="capitalize shrink-0">
                      {role}
                    </Badge>
                    {!isMe && !isSuper && (
                      <div className="flex gap-2">
                        {m.status !== "approved" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-9"
                            onClick={() => setStatus.mutate({ id: m.id, status: "approved" })}
                          >
                            <Check className="h-4 w-4 mr-1" /> Approve
                          </Button>
                        )}
                        {m.status !== "rejected" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-9 w-9"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onSelect={() => setRemoveTarget(m)}
                              >
                                <Ban className="h-4 w-4" /> Remove member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <>
                  {Array.from({ length: 5 }).map((_, r) => (
                    <TableRow key={r}>
                      {Array.from({ length: 5 }).map((_, c) => (
                        <TableCell key={c}>
                          <Bar className={cn("h-3.5", c === 0 ? "w-32" : "w-20")} />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </>
              ) : activeMembers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No members yet.
                  </TableCell>
                </TableRow>
              ) : (
                activeMembers.map((m) => {
                  const isMe = m.id === me;
                  const role = primaryRole(m.roles);
                  const isSuper = m.roles.includes("super_admin");
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">
                        {m.full_name || "—"}
                        {isMe && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}
                      </TableCell>
                      <TableCell className="text-sm">{m.email}</TableCell>
                      <TableCell>{statusBadge(m.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {isMe || isSuper ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          <div className="inline-flex gap-2 justify-end">
                            {m.status !== "approved" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setStatus.mutate({ id: m.id, status: "approved" })}
                              >
                                <Check className="h-4 w-4 mr-1" /> Approve
                              </Button>
                            )}
                            {m.status !== "rejected" && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    aria-label="More actions"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    className="text-destructive focus:text-destructive"
                                    onSelect={() => setRemoveTarget(m)}
                                  >
                                    <Ban className="h-4 w-4" /> Remove member
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {removedMembers.length > 0 && (
        <Card className="bg-muted/20">
          <CardContent className="space-y-3 p-4">
            <div>
              <div className="text-sm font-medium text-muted-foreground">Removed members</div>
              <p className="mt-0.5 text-xs text-muted-foreground/80">
                These people lost access and cannot be re-approved. To bring one back, send a new
                invite.
              </p>
            </div>
            <ul className="space-y-2">
              {removedMembers.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-3 rounded-md border border-muted-foreground/15 bg-background/60 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-muted-foreground">
                      {m.full_name || "—"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground/70">{m.email}</div>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-muted-foreground/25 capitalize text-muted-foreground/80"
                  >
                    {primaryRole(m.roles)}
                  </Badge>
                  <UserX className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => {
          if (!open) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove member?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget &&
                `${removeTarget.full_name || removeTarget.email} will immediately lose access to this organization. They cannot be re-approved afterwards — to bring them back you must send a new invite.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (removeTarget) setStatus.mutate({ id: removeTarget.id, status: "rejected" });
                setRemoveTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
