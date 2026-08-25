import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

// Role-aware landing page:
//   super_admin → /admin portal
//   admin       → /dashboard
//   staff       → /billing (POS-first)
export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/auth", search: { invite: undefined } });

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id);

    const set = new Set((roles ?? []).map((r) => r.role as string));
    if (set.has("super_admin")) throw redirect({ to: "/admin" });
    if (set.has("admin")) throw redirect({ to: "/dashboard" });
    throw redirect({ to: "/billing" });
  },
});
