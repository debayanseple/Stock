import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Package, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getInviteByToken } from "@/lib/invites.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — StockLine" },
      { name: "description", content: "Sign in to StockLine to manage products, suppliers, and stock movements." },
      { property: "og:title", content: "Sign in — StockLine" },
      { property: "og:description", content: "Sign in to StockLine to manage products, suppliers, and stock movements." },
      { property: "og:url", content: "/auth" },
    ],
    links: [{ rel: "canonical", href: "/auth" }],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { invite: inviteToken } = useSearch({ from: "/auth" });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Look up invite details via a public server function (uses admin client server-side).
  const fetchInvite = useServerFn(getInviteByToken);
  const { data: invite } = useQuery({
    queryKey: ["invite", inviteToken],
    enabled: !!inviteToken,
    queryFn: async () => {
      return await fetchInvite({ data: { token: inviteToken! } });
    },
    staleTime: 60_000,
  });

  const inviteValid = !!invite && !invite.accepted_at && new Date(invite.expires_at) > new Date();

  useEffect(() => {
    if (invite?.email) setEmail(invite.email);
  }, [invite?.email]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && !inviteToken) navigate({ to: "/dashboard" });
    });
  }, [navigate, inviteToken]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Signed in");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return toast.error("Please enter your name");
    if (!inviteValid && !orgName.trim()) return toast.error("Please enter your organization name");
    if (inviteValid && invite && email.toLowerCase().trim() !== invite.email.toLowerCase()) {
      return toast.error(`This invite is for ${invite.email}. Please use that email.`);
    }
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/pending`,
        data: {
          full_name: fullName.trim(),
          org_name: orgName.trim(),
          ...(inviteValid ? { invite_token: inviteToken } : {}),
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    if (inviteValid) {
      toast.success("Account created. You can sign in now.");
    } else {
      toast.success("Account created. Awaiting approval by an administrator.");
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password reset link sent. Check your email.");
    setShowForgot(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4 sm:p-6">
      <div className="w-full max-w-[420px] flex flex-col items-center gap-6">
        {inviteToken && (
          <Card className="w-full border-primary/40 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Mail className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div className="text-sm">
                {inviteValid && invite ? (
                  <>
                    You've been invited to join <strong>{invite.org_name}</strong> as{" "}
                    <strong>{invite.role === "admin" ? "an admin" : "a staff member"}</strong>. Create your account below to accept.
                  </>
                ) : (
                  <>This invite link is invalid or has expired. Ask the person who invited you to send a new one.</>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        <Card className="w-full shadow-lg border-border/60">
          <CardHeader className="text-center space-y-5 pt-8 pb-6 px-6 sm:px-8">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
              <Package className="h-7 w-7" />
            </div>
            <div className="space-y-2">
              <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-foreground">
                {showForgot ? "Reset your password" : "Sign in to StockLine"}
              </h1>
              <CardDescription className="text-sm leading-relaxed text-muted-foreground">
                {showForgot ? "We'll email you a reset link" : "Inventory & stock management portal"}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-8 sm:px-8">
            {showForgot ? (
              <form onSubmit={handleForgot} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="fp-email" className="text-sm font-medium">Email</Label>
                  <Input id="fp-email" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="h-11" />
                </div>
                <div className="space-y-3 pt-1">
                  <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading}>{loading ? "Sending…" : "Send reset link"}</Button>
                  <Button type="button" variant="ghost" className="w-full h-11 text-sm font-medium" onClick={() => setShowForgot(false)}>
                    Back to sign in
                  </Button>
                </div>
              </form>
            ) : (
            <Tabs defaultValue={inviteValid ? "signup" : "signin"} className="space-y-5">
              <TabsList className="grid w-full grid-cols-2 h-11 p-1 bg-muted/60">
                <TabsTrigger value="signin" className="text-sm font-medium">Sign in</TabsTrigger>
                <TabsTrigger value="signup" className="text-sm font-medium">Sign up</TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="mt-0">
                <form onSubmit={handleSignIn} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="si-email" className="text-sm font-medium">Email</Label>
                    <Input id="si-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="si-pw" className="text-sm font-medium">Password</Label>
                      <button
                        type="button"
                        onClick={() => { setResetEmail(email); setShowForgot(true); }}
                        className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <Input id="si-pw" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
                  </div>
                  <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="mt-0">
                <form onSubmit={handleSignUp} className="space-y-5">
                  <div className="space-y-1.5">
                    <Label htmlFor="su-name" className="text-sm font-medium">Name</Label>
                    <Input id="su-name" type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" className="h-11" />
                  </div>
                  {!inviteValid && (
                    <div className="space-y-1.5">
                      <Label htmlFor="su-org" className="text-sm font-medium">Organization</Label>
                      <Input id="su-org" type="text" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Your company or team" className="h-11" />
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <Label htmlFor="su-email" className="text-sm font-medium">Email</Label>
                    <Input id="su-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" readOnly={inviteValid} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="su-pw" className="text-sm font-medium">Password</Label>
                    <Input id="su-pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
                  </div>
                  <Button type="submit" className="w-full h-11 text-sm font-medium" disabled={loading || (!!inviteToken && !inviteValid)}>
                    {loading ? "Creating…" : inviteValid ? "Accept invite & create account" : "Create account"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
            )}
          </CardContent>
        </Card>
        <div className="px-4 py-2.5 rounded-full bg-background/80 border border-border shadow-sm text-xs text-muted-foreground flex items-center gap-1.5">
          <span>Powered by</span>
          <span className="font-medium text-foreground">©</span>
          <a
            href="https://zerotheorys.lovable.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary hover:text-primary/80 transition-colors"
          >
            ZeroTheorys
          </a>
        </div>
      </div>
    </div>
  );
}