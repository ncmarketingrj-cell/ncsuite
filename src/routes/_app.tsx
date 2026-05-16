import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, LogOut, Loader2,
  ChevronRight, Bell, Search, User
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";
import { AIAgentSidebar } from "@/components/AIAgentSidebar";

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

  // Breadcrumb logic
  const segments = path.split("/").filter(Boolean);
  const breadcrumb = segments.length > 0 
    ? segments.map(s => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " "))
    : ["Dashboard"];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      {/* 1. Left Sidebar (Slim + Flyout) */}
      <AppSidebar />
      
      {/* 2. Main Center Area */}
      <div className="flex min-w-0 flex-1 flex-col relative overflow-hidden">
        {/* Refined Top Header */}
        <header className="h-14 border-b border-white/5 bg-background/50 backdrop-blur-xl flex items-center justify-between px-8 z-40 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
              <span className="hover:text-primary transition-colors cursor-pointer hidden md:inline">NC Performance Suite</span>
              {breadcrumb.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ChevronRight className="h-2.5 w-2.5 hidden md:block" />
                  <span className={i === breadcrumb.length - 1 ? "text-foreground" : ""}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
             {/* Integrated Search Bar */}
             <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 group focus-within:border-primary/50 transition-all">
                <Search className="h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary" />
                <input 
                  placeholder="Pesquisar métricas..." 
                  className="bg-transparent border-none outline-none text-[11px] w-32 focus:w-48 transition-all"
                />
             </div>

             <div className="flex items-center gap-4 border-l border-white/5 pl-6">
                {/* Status Indicator */}
                <div className="hidden xl:flex items-center gap-2 px-2 py-1 rounded-md bg-success/10 border border-success/20">
                   <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
                   <span className="text-[9px] font-black uppercase tracking-tighter text-success">Agente Online</span>
                </div>

                <button className="relative text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-white/5">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                </button>
                
                <div className="flex items-center gap-3 pl-2 border-l border-white/5">
                   <div className="hidden text-right lg:block">
                      <p className="text-[10px] font-bold leading-none">{user?.email?.split('@')[0]}</p>
                      <button onClick={signOut} className="text-[9px] text-muted-foreground hover:text-destructive transition-colors font-bold uppercase tracking-tighter mt-1">Sair da conta</button>
                   </div>
                   <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 border border-white/10 flex items-center justify-center ring-1 ring-white/5 shadow-glow-sm">
                      <User className="h-4 w-4 text-primary" />
                   </div>
                </div>
             </div>
          </div>
        </header>
        
        {/* Scrollable Main Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,rgba(var(--primary-rgb),0.03),transparent_40%)]">
          <div className="mx-auto max-w-[1400px] p-6 md:p-10">
            <Outlet />
          </div>
        </main>
      </div>

      {/* 3. Right Sidebar (AI Agent) */}
      <AIAgentSidebar />
    </div>
  );
}
