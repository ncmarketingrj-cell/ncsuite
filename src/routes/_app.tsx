import { useState, useEffect } from "react";
import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, LogOut, Loader2,
  Bell, Search, User, Bot, Sparkles, Activity, ShieldCheck, Zap,
  Sun, Moon, Menu, X, BarChart3, Megaphone, LineChart, Palette, Link2,
  HelpCircle, ChevronDown
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AIAgentSidebar } from "@/components/AIAgentSidebar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTheme } from "./__root";
import { toast } from "sonner";

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

type NavItem = {
  to: string;
  icon: any;
  label: string;
  group?: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/metricas", icon: LineChart, label: "Métricas" },
  { to: "/campanhas", icon: Megaphone, label: "Campanhas" },
  { to: "/relatorios", icon: FileText, label: "Relatórios" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/criativos", icon: Palette, label: "Criativos" },
];

const MORE_ITEMS: NavItem[] = [
  { to: "/multicanal", icon: BarChart3, label: "Multicanal" },
  { to: "/organizador", icon: Link2, label: "Link Pages" },
  { to: "/automacoes", icon: Zap, label: "Automações" },
  { to: "/agente", icon: Bot, label: "Agente IA" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

function Shell() {
  const { loading, user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  // Carrega os agendamentos ativos de sincronização no Shell para o Background Worker
  const { data: syncSchedules = [] } = useQuery({
    queryKey: ["shell_sync_schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("campaign_schedules")
        .select("*")
        .eq("target_level", "sync")
        .eq("is_active", true);
      if (error) return [];
      return data as any[];
    },
    refetchInterval: 300000, // Atualiza a cada 5 minutos
  });

  // Background Sync Worker para extrair dados diários de forma programada e transparente
  useEffect(() => {
    if (syncSchedules.length === 0) return;

    const checkAndSync = async () => {
      const now = new Date();
      const currentHours = now.getHours();
      const currentMinutes = now.getMinutes();
      const todayStr = now.toISOString().split('T')[0]; // Ex: "2026-05-18"

      for (const sch of syncSchedules) {
        if (!sch.start_time) continue;
        
        // start_time é do tipo "HH:MM:SS" (ex: "08:00:00")
        const [schHours, schMinutes] = sch.start_time.split(':').map(Number);
        
        const scheduledTotalMinutes = schHours * 60 + schMinutes;
        const currentTotalMinutes = currentHours * 60 + currentMinutes;

        // Se a hora atual passou do horário agendado
        if (currentTotalMinutes >= scheduledTotalMinutes) {
          const storageKey = `nc_last_sync_time_${sch.id}`;
          const lastSyncDate = localStorage.getItem(storageKey);

          // Se a última sincronização registrada para este agendamento não ocorreu hoje
          if (lastSyncDate !== todayStr) {
            console.log(`[SYNC WORKER] Disparando sincronização agendada das ${sch.start_time} para o dia ${todayStr}...`);
            
            // Grava imediatamente para evitar loops ou disparos paralelos concorrentes
            localStorage.setItem(storageKey, todayStr);

            try {
              // Notifica o usuário de forma sutil
              toast.info("Iniciando extração agendada do Meta Ads...", {
                description: `Horário programado: ${sch.start_time.substring(0, 5)}`
              });

              // Invoca a sincronização
              const { error } = await supabase.functions.invoke("sync-meta-ads", {
                body: { date_preset: "maximum" }
              });

              if (error) throw error;

              toast.success("NC Performance Suite atualizado! 🏎️", {
                description: "Métricas diárias e anteriores sincronizadas com sucesso."
              });

              // Invalida cache global do React Query para atualizar todos os dados visuais na tela imediatamente!
              qc.invalidateQueries();
            } catch (e: any) {
              console.error("[SYNC WORKER] Falha na sincronização silenciosa:", e.message);
              // Remove a marcação do localStorage para tentar novamente no próximo minuto
              localStorage.removeItem(storageKey);
            }
          }
        }
      }
    };

    // Executa imediatamente e depois a cada 1 minuto
    checkAndSync();
    const interval = setInterval(checkAndSync, 60000);
    return () => clearInterval(interval);
  }, [syncSchedules, qc]);

  useEffect(() => {
    const handleOpenAI = () => setIsAgentOpen(true);
    window.addEventListener('open-ai-agent', handleOpenAI);
    return () => window.removeEventListener('open-ai-agent', handleOpenAI);
  }, []);

  // Monitora ações em tempo real do Agente
  const { data: recentLogs = [] } = useQuery({
    queryKey: ["header_automation_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("*, automation_rules(name)")
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) return [];
      return data as any[];
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (recentLogs.length > 0) {
      const lastLog = recentLogs[0];
      const logTime = new Date(lastLog.created_at).getTime();
      const now = new Date().getTime();
      if (now - logTime < 120000) {
        setShowNotification(true);
        const timer = setTimeout(() => setShowNotification(false), 8000);
        return () => clearTimeout(timer);
      }
    }
  }, [recentLogs]);

  // Fecha o menu mobile ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowMore(false);
  }, [path]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center">
            <span className="font-display font-black text-primary-foreground text-lg">NC</span>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-background overflow-hidden selection:bg-primary/30">
      
      {/* ═══════════════════════════════════════
          TOP NAVIGATION BAR — Premium Horizontal
          ═══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 md:px-8">
          
          {/* LEFT: Logo */}
          <Link to="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-glow-sm">
              <span className="font-display font-black text-primary-foreground text-sm">NC</span>
            </div>
            <div className="hidden sm:flex flex-col leading-none">
              <span className="font-display text-sm font-bold tracking-tight">Performance</span>
              <span className="text-[8px] font-mono font-bold uppercase tracking-[0.25em] text-primary">Suite</span>
            </div>
          </Link>

          {/* CENTER: Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`group relative flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-all duration-200 ${
                    isActive 
                      ? "text-primary bg-primary/10" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  <item.icon className={`h-4 w-4 transition-transform group-hover:scale-110 ${isActive ? 'text-primary' : ''}`} />
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute inset-x-2 -bottom-[17px] h-[2px] bg-primary rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    />
                  )}
                </Link>
              );
            })}

            {/* More dropdown */}
            <div className="relative">
              <button 
                onClick={() => setShowMore(!showMore)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-all ${
                  MORE_ITEMS.some(i => path.startsWith(i.to))
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                Mais
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showMore ? 'rotate-180' : ''}`} />
              </button>
              
              <AnimatePresence>
                {showMore && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-2xl"
                    >
                      {MORE_ITEMS.map((item) => {
                        const isActive = path.startsWith(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            onClick={() => setShowMore(false)}
                            className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                              isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                            }`}
                          >
                            <item.icon className="h-4 w-4" />
                            {item.label}
                          </Link>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </nav>

          {/* RIGHT: Actions */}
          <div className="flex items-center gap-2 sm:gap-3">
            
            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:text-foreground hover:border-primary/30 hover:shadow-glow-sm active:scale-95"
              title={theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            >
              <AnimatePresence mode="wait">
                {theme === "dark" ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun className="h-4 w-4" />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon className="h-4 w-4" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {/* Victoria AI Badge */}
            <button
              onClick={() => setIsAgentOpen(!isAgentOpen)}
              className="hidden sm:flex items-center gap-2 rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary/20 hover:shadow-glow-sm active:scale-95"
            >
              <Bot className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Victoria</span>
              <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
            </button>

            {/* Notifications */}
            <button className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:text-foreground hover:border-primary/30 active:scale-95">
              <Bell className="h-4 w-4" />
              <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary" />
            </button>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
              <div className="hidden md:flex flex-col items-end leading-none">
                <p className="text-[11px] font-bold">{user?.email?.split('@')[0]}</p>
                <button onClick={signOut} className="text-[10px] text-muted-foreground hover:text-primary transition-colors font-semibold mt-0.5">
                  Sair
                </button>
              </div>
              <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                <User className="h-4 w-4 text-primary" />
              </div>
            </div>

            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex lg:hidden h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
            >
              {mobileMenuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="lg:hidden border-t border-border bg-card overflow-hidden"
            >
              <nav className="p-4 grid grid-cols-2 gap-2">
                {[...NAV_ITEMS, ...MORE_ITEMS].map((item) => {
                  const isActive = path === item.to || path.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-3 text-sm font-semibold transition-all ${
                        isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50"
                      }`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* ═══════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════ */}
      <main className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[1600px] p-4 md:p-8 lg:p-10">
          
          {/* Notificação Flutuante de Ação Autônoma da IA */}
          <AnimatePresence>
            {showNotification && recentLogs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-primary/30 bg-card p-4 shadow-2xl"
              >
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black uppercase tracking-wider text-primary">Ação de IA</p>
                    <p className="text-[11px] font-bold text-foreground mt-0.5">{recentLogs[0].automation_rules?.name}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">{recentLogs[0].action_taken}</p>
                    <div className="mt-2 flex justify-end">
                      <Link to="/automacoes" className="text-[9px] font-bold uppercase text-primary hover:underline">Ver Logs</Link>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <Outlet />
        </div>
      </main>

      <AIAgentSidebar isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
    </div>
  );
}
