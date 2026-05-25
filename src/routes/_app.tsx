import { useState, useEffect } from "react";
import { createFileRoute, Outlet, redirect, Link, useRouterState, Navigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, Loader2,
  Bell, User, Bot, Sparkles, Activity, Zap,
  Sun, Moon, Menu, X, BarChart3, Megaphone, LineChart, Palette, Link2,
  ChevronDown, RefreshCw, Wifi, WifiOff, Users, Store
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AIAgentSidebar } from "@/components/AIAgentSidebar";
import { ProfileSettingsModal } from "@/components/ProfileSettingsModal";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTheme } from "./__root";
import { toast } from "sonner";
import { useAutoSync, getSyncStatus, SYNC_STATUS_EVENT, type SyncStatus } from "@/hooks/useAutoSync";
import { useAlertEngine } from "@/hooks/useAlertEngine";

function AppErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="h-14 w-14 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
        <span className="font-display font-black text-destructive text-xl">!</span>
      </div>
      <div className="space-y-2 max-w-sm">
        <h2 className="text-xl font-black tracking-tight">Algo deu errado</h2>
        <p className="text-xs text-muted-foreground font-mono break-all">{error?.message || "Erro desconhecido"}</p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => { reset(); window.location.href = "/dashboard"; }}
          className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          Voltar ao Dashboard
        </button>
        <button
          onClick={() => window.location.reload()}
          className="rounded-full border border-white/10 px-5 py-2.5 text-sm font-medium hover:bg-white/5"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_app")({
  component: () => (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  ),
  errorComponent: AppErrorFallback,
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
  { to: "/clientes", icon: Store, label: "Clientes" },
  { to: "/campanhas", icon: Megaphone, label: "Campanhas" },
  { to: "/reunioes", icon: Users, label: "Reuniões" },
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

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

function Shell() {
  const { loading, user, signOut } = useAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!user?.id,
  });

  // isAdmin: imediato via email (evita flash no carregamento) + confirmado via DB
  const isAdmin = profile?.role === "admin" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const perms = (profile as any)?.permissions ?? {};
  // Durante carregamento do perfil, exibe tudo (otimista) — restrições aplicadas só após carregar
  const canSeeMetricas  = profileLoading || isAdmin || !!perms.metricas;
  const canSeeAutomacoes = profileLoading || isAdmin || !!perms.automacoes;

  const filteredNavItems = NAV_ITEMS.filter(item => {
    if (item.to === "/metricas" && !canSeeMetricas) return false;
    return true;
  });

  const filteredMoreItems = MORE_ITEMS.filter(item => {
    if (item.to === "/agente"     && !isAdmin)         return false;
    if (item.to === "/automacoes" && !canSeeAutomacoes) return false;
    return true;
  });

  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus);
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  // ── Auto-Sync a cada 30 minutos ──────────────────────────────────────────────
  const { runSync } = useAutoSync();

  // ── Motor de Alertas Sonoros ──────────────────────────────────────────────────
  const { acknowledgeAll } = useAlertEngine();

  // Ouvir mudanças de status do sync
  useEffect(() => {
    const handler = (e: CustomEvent) => setSyncStatus(e.detail);
    window.addEventListener(SYNC_STATUS_EVENT, handler as EventListener);
    return () => window.removeEventListener(SYNC_STATUS_EVENT, handler as EventListener);
  }, []);

  useEffect(() => {
    const handleOpenAI = () => setIsAgentOpen(true);
    window.addEventListener('open-ai-agent', handleOpenAI);
    return () => window.removeEventListener('open-ai-agent', handleOpenAI);
  }, []);

  // Monitora notificações em tempo real do Agente (da tabela de notifications)
  const { data: recentNotifications = [], refetch: refetchNotifications } = useQuery({
    queryKey: ["header_notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) return [];
      return data as any[];
    },
    refetchInterval: 15000,
  });

  const hasUnread = recentNotifications.some(n => !n.is_read);

  useEffect(() => {
    if (recentNotifications.length > 0) {
      const lastNotif = recentNotifications[0];
      const logTime = new Date(lastNotif.created_at).getTime();
      const now = new Date().getTime();
      if (now - logTime < 60000 && !lastNotif.is_read) {
        setShowNotification(true);
        const timer = setTimeout(() => setShowNotification(false), 8000);
        return () => clearTimeout(timer);
      }
    }
  }, [recentNotifications]);

  const handleMarkAllAsRead = async () => {
    const unreadIds = recentNotifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
    refetchNotifications();
  };



  // Fecha o menu mobile ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowMore(false);
  }, [path]);

  if (loading) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-background overflow-hidden">
        {/* NC Watermark de fundo */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center select-none" aria-hidden="true">
          <span className="nc-watermark-text" style={{ fontSize: 'clamp(14rem, 38vw, 34rem)' }}>NC</span>
        </div>
        {/* Racing stripes decorativas */}
        <div className="pointer-events-none absolute left-0 right-0 top-[38%] h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" aria-hidden="true" />
        <div className="pointer-events-none absolute left-0 right-0 top-[62%] h-px bg-gradient-to-r from-transparent via-primary/10 to-transparent" aria-hidden="true" />

        <div className="relative z-10 flex flex-col items-center gap-7">
          {/* Logo com ping rings */}
          <div className="relative">
            <div className="absolute inset-0 rounded-2xl border-2 border-primary/45 animate-ping-ring" />
            <div className="absolute inset-[-9px] rounded-2xl border border-primary/22 animate-ping-ring" style={{ animationDelay: '0.55s' }} />
            <div className="relative h-16 w-16 rounded-2xl bg-primary flex flex-col items-center justify-center shadow-glow overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[4px] bg-white/28 rounded-t-2xl" />
              <span className="font-display font-black text-white text-2xl relative z-10 tracking-tight">NC</span>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/22 rounded-b-2xl" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <p className="font-display font-black text-sm tracking-tight text-foreground">NC Performance Suite</p>
            <p className="label-mono text-primary">Motor de Tráfego Automotivo</p>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce-dot-1" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/65 animate-bounce-dot-2" />
            <div className="h-1.5 w-1.5 rounded-full bg-primary/35 animate-bounce-dot-3" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  return (
    <div className="relative flex h-screen w-full flex-col bg-background overflow-hidden selection:bg-primary/30">
      {/* ── NC Watermark — identidade permanente de fundo ── */}
      <div
        className="pointer-events-none absolute bottom-[-2.5rem] right-[-1.5rem] z-0 select-none"
        aria-hidden="true"
      >
        <span className="nc-watermark-text" style={{ fontSize: 'clamp(12rem, 26vw, 34rem)' }}>NC</span>
      </div>
      
      {/* ═══════════════════════════════════════
          TOP NAVIGATION BAR — Premium Horizontal
          ═══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-gradient-bottom bg-background/92 backdrop-blur-2xl">
        <div className="mx-auto flex h-16 max-w-[1600px] items-center justify-between px-4 md:px-8">
          
          {/* LEFT: Logo */}
          <Link to="/dashboard" className="flex items-center gap-3 shrink-0 group">
            {/* NC Badge automotivo com racing stripes */}
            <div className="relative h-9 w-9 rounded-xl bg-primary flex items-center justify-center overflow-hidden shadow-glow-sm transition-all duration-300 group-hover:shadow-glow">
              {/* Faixa superior (reflexo de vidro) */}
              <div className="absolute inset-x-0 top-0 h-[3px] bg-white/28 rounded-t-xl pointer-events-none" />
              <span className="font-display font-black text-white text-sm relative z-10 tracking-tight">NC</span>
              {/* Faixa inferior (profundidade de cockpit) */}
              <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/22 rounded-b-xl pointer-events-none" />
            </div>
            {/* Logotipo com tagline automotiva */}
            <div className="hidden sm:flex flex-col leading-none gap-[5px]">
              <span className="font-display text-[13px] font-black tracking-tight leading-none">NC Performance</span>
              <div className="flex items-center gap-[5px]">
                <div className="h-px w-3 bg-primary/65 rounded-full" />
                <span className="text-[7px] font-mono font-bold uppercase tracking-[0.28em] text-primary leading-none">Suite Automotiva</span>
                <div className="h-px w-3 bg-primary/65 rounded-full" />
              </div>
            </div>
          </Link>

          {/* CENTER: Navigation Links (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1">
            {filteredNavItems.map((item) => {
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
                      className="absolute inset-x-2 -bottom-[17px] h-[2px] bg-primary rounded-full shadow-glow-sm"
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
                  filteredMoreItems.some(i => path.startsWith(i.to))
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
                      {filteredMoreItems.map((item) => {
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

            {/* Indicador de Sync */}
            <button
              onClick={() => runSync("manual")}
              disabled={syncStatus.isSyncing}
              className="hidden md:flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-95 disabled:opacity-60"
              title={syncStatus.lastSync ? `Último sync: ${new Date(syncStatus.lastSync).toLocaleTimeString('pt-BR')}` : 'Sincronizar agora'}
            >
              <RefreshCw className={`h-3 w-3 ${syncStatus.isSyncing ? 'animate-spin text-primary' : ''}`} />
              <span className="hidden lg:inline">
                {syncStatus.isSyncing ? 'Sincronizando...' : syncStatus.lastSync
                  ? formatDistanceToNow(new Date(syncStatus.lastSync), { addSuffix: true, locale: ptBR })
                  : 'Sincronizar'}
              </span>
              {syncStatus.lastResult === 'success' && !syncStatus.isSyncing && (
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
              )}
              {syncStatus.lastResult === 'error' && (
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              )}
            </button>

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
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); acknowledgeAll(); }}
                className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                  showNotifications
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                <Bell className="h-4 w-4" />
                {hasUnread && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary animate-pulse" />
                )}
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)} />
                    <motion.div
                       initial={{ opacity: 0, y: 8, scale: 0.96 }}
                       animate={{ opacity: 1, y: 0, scale: 1 }}
                       exit={{ opacity: 0, y: 8, scale: 0.96 }}
                       className="absolute right-0 top-full z-50 mt-2 w-80 sm:w-96 rounded-2xl border border-border bg-card p-4 shadow-2xl overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-border pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Alertas do Agente AI</h4>
                        </div>
                        {hasUnread ? (
                          <button
                            onClick={handleMarkAllAsRead}
                            className="text-[9px] font-black text-primary hover:text-primary/80 transition-colors uppercase tracking-wider"
                          >
                            Lidas
                          </button>
                        ) : (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-black text-primary uppercase">
                            {recentNotifications.length} Alertas
                          </span>
                        )}
                      </div>

                      {recentNotifications.length === 0 ? (
                        <div className="py-8 text-center text-muted-foreground flex flex-col items-center justify-center">
                          <Activity className="h-8 w-8 text-muted-foreground/30 mb-2" />
                          <p className="text-xs font-bold">Nenhum evento recente</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-0.5">As ações automáticas de otimização aparecerão aqui.</p>
                        </div>
                      ) : (
                        <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                          {recentNotifications.map((notif) => {
                            const timeAgo = formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR });
                            return (
                              <Link
                                key={notif.id}
                                to={notif.link || "/automacoes"}
                                onClick={async () => {
                                  setShowNotifications(false);
                                  await supabase.from("notifications").update({ is_read: true }).eq("id", notif.id);
                                  refetchNotifications();
                                }}
                                className={`flex flex-col gap-1 rounded-xl p-2.5 border transition-all text-left relative ${
                                  !notif.is_read 
                                    ? "bg-primary/[0.03] hover:bg-primary/[0.06] border-primary/20" 
                                    : "bg-white/[0.01] hover:bg-white/[0.03] border-transparent"
                                }`}
                              >
                                {!notif.is_read && (
                                  <span className="absolute top-3 right-3 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                                )}
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-[10px] font-black uppercase tracking-wider text-primary leading-tight">
                                    {notif.title}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground font-mono shrink-0">{timeAgo}</span>
                                </div>
                                {(() => {
                                  const sep = notif.message?.indexOf(" — ");
                                  const hasSep = sep > 0 && sep < 60;
                                  const account = hasSep ? notif.message.slice(0, sep) : null;
                                  const detail  = hasSep ? notif.message.slice(sep + 3) : notif.message;
                                  return (
                                    <>
                                      {account && (
                                        <span className="inline-flex rounded bg-white/10 px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                                          {account}
                                        </span>
                                      )}
                                      <p className="text-[11px] text-foreground leading-relaxed font-medium pr-4">
                                        {detail}
                                      </p>
                                    </>
                                  );
                                })()}
                              </Link>
                            );
                          })}
                        </div>
                      )}

                      <div className="border-t border-border mt-3 pt-2.5">
                        <Link
                          to="/automacoes"
                          onClick={() => setShowNotifications(false)}
                          className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-bold text-foreground py-2 transition"
                        >
                          <Zap className="h-3.5 w-3.5 text-primary" /> Ver Central de Automações
                        </Link>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-2 pl-2 ml-1 border-l border-border">
              <div className="hidden md:flex flex-col items-end leading-none">
                <p className="text-[11px] font-bold text-foreground">
                  {profile?.full_name || user?.email?.split('@')[0]}
                </p>
                <button onClick={signOut} className="text-[10px] text-muted-foreground hover:text-primary transition-colors font-semibold mt-0.5">
                  Sair
                </button>
              </div>
              <button 
                onClick={() => setIsProfileOpen(true)}
                className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0 hover:border-primary/50 transition-colors active:scale-95"
                title="Configurações do Perfil"
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-primary" />
                )}
              </button>
            </div>

            {/* Mobile: botão Victoria compacto */}
            <button
              onClick={() => setIsAgentOpen(!isAgentOpen)}
              className="flex sm:hidden h-9 w-9 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"
            >
              <Bot className="h-4 w-4" />
            </button>
          </div>
        </div>

      </header>

      {/* ═══════════════════════════════════════
          MOBILE BOTTOM SHEET — Menu completo
          Só aparece em mobile (lg:hidden no overlay)
          ═══════════════════════════════════════ */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            {/* Overlay escuro */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
            />
            {/* Bottom sheet */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 inset-x-0 z-50 rounded-t-3xl border-t border-border bg-card shadow-2xl overflow-hidden"
            >
              {/* Handle bar */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="h-1 w-10 rounded-full bg-muted-foreground/30" />
              </div>
              {/* Header do sheet */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-primary flex items-center justify-center">
                    <span className="font-display font-black text-white text-[9px]">NC</span>
                  </div>
                  <span className="text-sm font-black tracking-tight">Navegação</span>
                </div>
                <button onClick={() => setMobileMenuOpen(false)} className="h-8 w-8 rounded-full bg-muted/50 flex items-center justify-center">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* Grid de nav */}
              <nav className="p-4 grid grid-cols-3 gap-2.5">
                {[...filteredNavItems, ...filteredMoreItems].map((item) => {
                  const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex flex-col items-center gap-1.5 rounded-2xl px-2 py-3.5 text-[11px] font-bold text-center transition-all ${
                        isActive ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
              {/* Perfil + Sair */}
              <div className="px-4 pb-6 pt-1 border-t border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden">
                    {profile?.avatar_url
                      ? <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                      : <User className="h-4 w-4 text-primary" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold leading-none">{profile?.full_name || user?.email?.split('@')[0]}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{profile?.position || "NC Performance"}</p>
                  </div>
                </div>
                <button onClick={signOut} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors">
                  Sair
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════
          MOBILE BOTTOM NAVIGATION BAR
          5 ítens: Dashboard · Campanhas · Alertas · Config · Mais
          ═══════════════════════════════════════ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/96 backdrop-blur-xl">
        <div className="flex items-stretch justify-around px-1 pb-safe">
          {[
            { to: "/dashboard",  icon: LayoutDashboard, label: "Home" },
            { to: "/campanhas",  icon: Megaphone,        label: "Camps." },
          ].map((item) => {
            const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
            return (
              <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-bold transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                {item.label}
                {isActive && <span className="absolute bottom-0 h-[2px] w-6 rounded-full bg-primary" />}
              </Link>
            );
          })}
          {/* Alertas com badge */}
          <button
            onClick={() => { setShowNotifications(!showNotifications); acknowledgeAll(); }}
            className={`relative flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-bold transition-colors ${showNotifications ? "text-primary" : "text-muted-foreground"}`}
          >
            <Bell className="h-5 w-5" />
            Alertas
            {hasUnread && <span className="absolute top-2.5 right-2.5 h-2 w-2 rounded-full bg-primary animate-pulse" />}
          </button>
          {/* Config */}
          {(() => {
            const isActive = path.startsWith("/config");
            return (
              <Link to="/config" className={`flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-bold transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                <Settings className="h-5 w-5" />
                Config
              </Link>
            );
          })()}
          {/* Mais — abre bottom sheet */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-bold text-muted-foreground"
          >
            <Menu className="h-5 w-5" />
            Mais
          </button>
        </div>
      </nav>

      {/* ═══════════════════════════════════════
          MAIN CONTENT
          ═══════════════════════════════════════ */}
      <main className="relative z-[1] flex-1 overflow-y-auto custom-scrollbar">
        <div className="mx-auto max-w-[1600px] p-4 pb-24 md:pb-8 md:p-8 lg:p-10">
          
          {/* Notificação Flutuante de Ação Autônoma da IA */}
          <AnimatePresence>
            {showNotification && recentNotifications.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="fixed bottom-24 right-4 lg:bottom-6 lg:right-6 z-50 max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-2xl border border-primary/30 bg-card p-4 shadow-2xl overflow-hidden card-sport nc-badge-corner"
              >
                {/* Racing stripe no topo da notificação */}
                <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none" />
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-primary/12 border border-primary/25 p-2 text-primary">
                    <Sparkles className="h-4 w-4 animate-pulse" />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black uppercase tracking-wider text-primary">Victoria AI</p>
                    <p className="text-[11px] font-bold text-foreground mt-0.5">{recentNotifications[0].title}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{recentNotifications[0].message}</p>
                    <div className="mt-2 flex justify-end">
                      <Link 
                        to={recentNotifications[0].link || "/automacoes"} 
                        onClick={async () => {
                          setShowNotification(false);
                          await supabase.from("notifications").update({ is_read: true }).eq("id", recentNotifications[0].id);
                          refetchNotifications();
                        }}
                        className="text-[9px] font-bold uppercase text-primary hover:underline"
                      >
                        Ver Detalhes
                      </Link>
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
      <ProfileSettingsModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} profile={profile} userId={user?.id || ""} />
    </div>
  );
}
