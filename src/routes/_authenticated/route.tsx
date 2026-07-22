import { createFileRoute, Outlet, redirect, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { LayoutDashboard, Package, Tags, Truck, ArrowLeftRight, LogOut, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("status, org_id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile || profile.status !== "approved") {
      throw redirect({ to: "/pending" });
    }
    // Super admin bypasses org suspension gate below.
    const { data: superRole } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!superRole && profile.org_id) {
      const { data: org } = await supabase
        .from("organizations")
        .select("status")
        .eq("id", profile.org_id)
        .maybeSingle();
      if (!org || org.status === "suspended" || org.status === "rejected") {
        throw redirect({ to: "/pending" });
      }
    }
    if (superRole && location.pathname !== "/admin") {
      throw redirect({ to: "/admin" });
    }
    return { user: data.user };
  },
  component: AuthedLayout,
});

const navItems = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Products", url: "/products", icon: Package },
  { title: "Categories", url: "/categories", icon: Tags },
  { title: "Suppliers", url: "/suppliers", icon: Truck },
  { title: "Transactions", url: "/transactions", icon: ArrowLeftRight },
] as const;

function AuthedLayout() {
  return (
    <SidebarProvider>
      <LayoutShell />
    </SidebarProvider>
  );
}

function LayoutShell() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const { user } = Route.useRouteContext();
  const { setOpenMobile, isMobile } = useSidebar();

  const { data: isSuperAdmin } = useQuery({
    queryKey: ["is_super_admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  const { data: isOrgAdmin } = useQuery({
    queryKey: ["is_org_admin", user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
    staleTime: 60_000,
  });

  const closeOnMobile = () => { if (isMobile) setOpenMobile(false); };

  const signOut = async () => {
    closeOnMobile();
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/auth", replace: true });
  };

  return (
      <div className="min-h-screen flex w-full bg-muted/20">
        <Sidebar collapsible="icon">
          <SidebarHeader className="border-b">
            <Link to={isSuperAdmin ? "/admin" : "/dashboard"} className="flex items-center gap-2 px-2 py-2">
              <img
                src="/logo.png"
                alt="StockLine"
                className="h-8 w-8 rounded-md object-contain bg-background"
              />
              <div className="font-semibold group-data-[collapsible=icon]:hidden">StockLine</div>
            </Link>
          </SidebarHeader>
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupLabel>Manage</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {!isSuperAdmin && navItems.map((item) => (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={pathname === item.url}>
                        <Link to={item.url} onClick={closeOnMobile}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                  {isOrgAdmin && !isSuperAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === "/members"}>
                        <Link to="/members" onClick={closeOnMobile}>
                          <Users className="h-4 w-4" />
                          <span>Team members</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                  {isSuperAdmin && (
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={pathname === "/admin"}>
                        <Link to="/admin" onClick={closeOnMobile}>
                          <Shield className="h-4 w-4" />
                          <span>Admin</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
          <SidebarFooter className="border-t">
            <div className="px-2 py-2 text-xs text-sidebar-foreground/80 truncate group-data-[collapsible=icon]:hidden">
              {(user?.user_metadata as { full_name?: string } | undefined)?.full_name || user?.email}
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="justify-start">
              <LogOut className="h-4 w-4" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </Button>
            <div className="px-2 py-1 text-[10px] text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
              Powered by ©{" "}
              <a
                href="https://zerotheorys.lovable.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-sidebar-foreground"
              >
                ZeroTheorys
              </a>
            </div>
          </SidebarFooter>
        </Sidebar>
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center gap-2 border-b bg-background px-4 sticky top-0 z-10">
            <SidebarTrigger aria-label="Open navigation menu" />
            <h1 className="font-semibold capitalize truncate">
              {navItems.find((n) => n.url === pathname)?.title ?? "StockLine"}
            </h1>
          </header>
          <main className="flex-1 p-3 sm:p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
  );
}