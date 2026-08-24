import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getInviteByToken = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ token: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("org_invites")
      .select("id, org_id, email, role, expires_at, accepted_at, organizations(name)")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) return null;
    const org = invite.organizations as { name: string } | null;
    return {
      id: invite.id,
      org_id: invite.org_id,
      org_name: org?.name ?? "",
      email: invite.email,
      role: invite.role,
      expires_at: invite.expires_at,
      accepted_at: invite.accepted_at,
    };
  });
