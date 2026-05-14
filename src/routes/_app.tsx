import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, LogOut, Loader2,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  ),
});

const DOCK = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/relatorios", icon: FileText, label: "Relatórios" },
  { to: "/config", icon: Settings, label: "Config" },
] as const;

function Shell() {
  const { loading, user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full">
      <AppSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-white/5 bg-background/70 px-6 backdrop-blur-md">
          <div className="md:hidden"><Logo size={28} /></div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden text-xs text-muted-foreground sm:block">{user?.email}</span>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs hover:border-destructive/30 hover:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </div>
        </header>
        <main className="flex-1 px-6 py-8 pb-28">
          <Outlet />
        </main>

        {/* Floating dock */}
        <nav className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="glass-panel flex items-center gap-1 p-1.5 shadow-glow-sm">
            {DOCK.map((it) => {
              const active = path.startsWith(it.to);
              return (
                <Link
                  key={it.to} to={it.to}
                  className="relative flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium transition"
                >
                  {active && (
                    <motion.div
                      layoutId="dock-active"
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-primary to-secondary"
                    />
                  )}
                  <span className={`relative flex items-center gap-1.5 ${active ? "text-background" : "text-muted-foreground"}`}>
                    <it.icon className="h-4 w-4" />
                    <span className="hidden sm:inline">{it.label}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
