import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/hooks/use-profile";
import { Clock, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/pending")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Awaiting approval — StockLine" },
      { name: "description", content: "Your StockLine account is awaiting approval by an administrator." },
      { property: "og:title", content: "Awaiting approval — StockLine" },
      { property: "og:description", content: "Your StockLine account is awaiting approval by an administrator." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const { data: profile, refetch, isFetching } = useProfile();

  useEffect(() => {
    if (profile?.status === "approved") navigate({ to: "/dashboard", replace: true });
  }, [profile?.status, navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  const isRejected = profile?.status === "rejected";

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-4 pt-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Clock className="h-7 w-7" />
          </div>
          <div className="space-y-2">
            <CardTitle className="text-2xl">
              {isRejected ? "Access denied" : "Awaiting approval"}
            </CardTitle>
            <CardDescription>
              {isRejected
                ? "Your account request was declined. Please contact your administrator for details."
                : "Your account is pending approval by an administrator. You'll get access once it's approved."}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pb-8">
          {!isRejected && (
            <Button onClick={() => refetch()} disabled={isFetching} className="w-full" variant="outline">
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              Check status
            </Button>
          )}
          <Button onClick={signOut} variant="ghost" className="w-full">
            <LogOut className="h-4 w-4" /> Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}