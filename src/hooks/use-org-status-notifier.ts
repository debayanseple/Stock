import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type OrgStatus = "pending" | "approved" | "rejected" | "suspended";

/**
 * Polls the current user's organization status and surfaces an in-app
 * toast when the org transitions between approved / suspended /
 * reactivated. On suspension the user is redirected to /pending
 * (the auth gate would do this on the next navigation anyway).
 */
export function useOrgStatusNotifier(orgId: string | null | undefined, enabled: boolean) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const prev = useRef<OrgStatus | undefined>(undefined);

  const { data: status } = useQuery({
    queryKey: ["org-status", orgId],
    enabled: !!orgId && enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async (): Promise<OrgStatus | null> => {
      if (!orgId) return null;
      const { data } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", orgId)
        .maybeSingle();
      return (data?.status as OrgStatus | undefined) ?? null;
    },
  });

  useEffect(() => {
    const current = status ?? undefined;
    const previous = prev.current;
    if (previous && current && previous !== current) {
      if (current === "suspended") {
        toast.error("Your organization has been suspended", {
          description: "Access has been paused by the administrator.",
        });
        qc.invalidateQueries();
        navigate({ to: "/pending", replace: true });
      } else if (current === "approved" && previous === "suspended") {
        toast.success("Your organization has been reactivated", {
          description: "Access has been restored.",
        });
      } else if (current === "approved" && previous === "pending") {
        toast.success("Your organization has been approved");
      } else if (current === "rejected") {
        toast.error("Your organization request was declined");
      }
    }
    prev.current = current;
  }, [status, navigate, qc]);

  return status;
}
