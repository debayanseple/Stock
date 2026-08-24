import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/hooks/use-profile";
import { Clock, LogOut, RefreshCw, CheckCircle2, XCircle, Ban } from "lucide-react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/pending")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Awaiting approval — StockLine" },
      {
        name: "description",
        content: "Your StockLine account is awaiting approval by an administrator.",
      },
      { property: "og:title", content: "Awaiting approval — StockLine" },
      {
        property: "og:description",
        content: "Your StockLine account is awaiting approval by an administrator.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  const navigate = useNavigate();
  const { data: profile, refetch, isFetching } = useProfile();
  const prevStatus = useRef<string | undefined>(undefined);
  const prevOrgStatus = useRef<string | undefined>(undefined);

  const { data: orgStatus, refetch: refetchOrg } = useQuery({
    queryKey: ["pending-org-status", profile?.org_id],
    enabled: !!profile?.org_id,
    refetchInterval: 15_000,
    queryFn: async () => {
      if (!profile?.org_id) return null;
      const { data } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", profile.org_id)
        .maybeSingle();
      return (data?.status as string | undefined) ?? null;
    },
  });

  // Poll every 15s while awaiting approval.
  useEffect(() => {
    if (profile?.status !== "pending") return;
    const t = window.setInterval(() => {
      refetch();
    }, 15_000);
    return () => window.clearInterval(t);
  }, [profile?.status, refetch]);

  // Detect status transitions and notify the user.
  useEffect(() => {
    const current = profile?.status;
    const prev = prevStatus.current;
    if (prev && current && prev !== current) {
      if (current === "approved") {
        toast.success("Your account has been approved", {
          description: "Redirecting you to your dashboard…",
          icon: <CheckCircle2 className="h-4 w-4" />,
        });
        localStorage.setItem("stockline:justApproved", "1");
        window.setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
      } else if (current === "rejected") {
        toast.error("Your account request was declined", {
          icon: <XCircle className="h-4 w-4" />,
        });
      }
    }
    prevStatus.current = current;
  }, [profile?.status, navigate]);

  // Notify on org status transitions (suspend / reactivate / approve / reject).
  useEffect(() => {
    const current = orgStatus ?? undefined;
    const prev = prevOrgStatus.current;
    if (prev && current && prev !== current) {
      if (current === "suspended") {
        toast.error("Your organization has been suspended", {
          description: "Access has been paused by the administrator.",
          icon: <Ban className="h-4 w-4" />,
        });
      } else if (current === "approved" && (prev === "suspended" || prev === "pending")) {
        toast.success(
          prev === "suspended"
            ? "Your organization has been reactivated"
            : "Your organization has been approved",
          {
            description: "Redirecting you to your dashboard…",
            icon: <CheckCircle2 className="h-4 w-4" />,
          },
        );
        window.setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1200);
      } else if (current === "rejected") {
        toast.error("Your organization request was declined", {
          icon: <XCircle className="h-4 w-4" />,
        });
      }
    }
    prevOrgStatus.current = current;
  }, [orgStatus, navigate]);

  // Skip pending screen entirely for users already approved on first load.
  useEffect(() => {
    if (profile?.status === "approved" && !prevStatus.current) {
      navigate({ to: "/dashboard", replace: true });
    }
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
            <Button
              onClick={() => {
                refetch();
                refetchOrg();
              }}
              disabled={isFetching}
              className="w-full"
              variant="outline"
            >
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
