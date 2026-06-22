import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createFileRoute, Outlet, redirect, Link, useRouterState, Navigate, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, Loader2,
  Bell, User, Bot, Sparkles, Activity, Zap,
  Sun, Moon, Menu, X, BarChart3, LineChart, Palette, Link2,
  ChevronDown, RefreshCw, Users, Store,
  Volume2, VolumeX, LogOut, CreditCard, Share2, ArrowRight, GitBranch, Brain, ChevronRight,
  Lock
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
import { DateProvider } from "@/contexts/DateContext";
import { usePagePermission } from "@/hooks/usePagePermission";

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
      <DateProvider>
        <Shell />
      </DateProvider>
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

const TRAFEGO_NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Command Center" },
  { to: "/metricas", icon: LineChart, label: "Métricas" },
  { to: "/relatorios", icon: FileText, label: "Relatórios" },
  { to: "/criativos", icon: Palette, label: "Criativos" },
  { to: "/automacoes", icon: Zap, label: "Automações" },
  { to: "/auditoria", icon: Activity, label: "Auditoria Hub" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

const SOCIAL_NAV_ITEMS: NavItem[] = [
  { to: "/social", icon: Share2, label: "Social Media" },
  { to: "/social-insights", icon: BarChart3, label: "Insights Meta" },
  { to: "/organizador", icon: Link2, label: "Link Pages" },
  { to: "/social-relatorios", icon: FileText, label: "Relatórios" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

const GESTAO_NAV_ITEMS: NavItem[] = [
  { to: "/clientes", icon: Store, label: "Clientes" },
  { to: "/reunioes", icon: Users, label: "Reuniões" },
  { to: "/cobrancas", icon: CreditCard, label: "Cobranças" },
  { to: "/auditoria", icon: Activity, label: "Auditoria Hub" },
  { to: "/upload", icon: Upload, label: "Upload" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

const FUNIL_NAV_ITEMS: NavItem[] = [
  { to: "/funis", icon: GitBranch, label: "Meus Funis" },
  { to: "/funnel-builder", icon: LayoutDashboard, label: "Funil Builder" },
  { to: "/strategy-map", icon: Brain, label: "Strategy Map" },
  { to: "/link-bio", icon: Link2, label: "Link Bio" },
  { to: "/formulario", icon: FileText, label: "Formulário" },
  { to: "/quiz", icon: BarChart3, label: "Quiz" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

const VICTORIA_NAV_ITEMS: NavItem[] = [
  { to: "/victoria", icon: Bot, label: "Victoria AI Chat" },
  { to: "/config", icon: Settings, label: "Configurações" },
];

const CRM_NAV_ITEMS: NavItem[] = [
  { to: "/crm", icon: Users, label: "SDR Pipeline" },
  { to: "/client-portal", icon: BarChart3, label: "Client Portal" },
  { to: "/crm-config", icon: Settings, label: "Configurações" },
];

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

function Shell() {
  const { loading, user, signOut } = useAuth();
  const nav = useNavigate();

  const handleSignOut = async () => {
    localStorage.setItem("nc_active_module", "hub");
    await signOut();
    nav({ to: "/login", replace: true });
  };

  const { profile, isAdmin, isLoading: profileLoading, perms, hasAccess } = usePagePermission();

  const hasPageAccess = (pathname: string) => {
    if (profileLoading || isAdmin) return true;
    
    if (pathname.startsWith("/metricas")) return hasAccess("metricas");
    if (pathname.startsWith("/automacoes")) return hasAccess("automacoes");
    if (pathname.startsWith("/dashboard")) return hasAccess("dashboard");
    if (pathname.startsWith("/clientes")) return hasAccess("clientes");
    if (pathname.startsWith("/relatorios")) return hasAccess("relatorios");
    if (pathname.startsWith("/criativos")) return hasAccess("criativos");
    if (pathname.startsWith("/social") || pathname.startsWith("/organizador") || pathname.startsWith("/link-bio") || pathname.startsWith("/quiz")) {
      return hasAccess("social");
    }
    if (pathname.startsWith("/reunioes") || pathname.startsWith("/crm")) return hasAccess("reunioes");
    if (pathname.startsWith("/cobrancas")) return hasAccess("cobrancas");
    if (pathname.startsWith("/strategy-map") || pathname.startsWith("/funis") || pathname.startsWith("/funnel-builder")) {
      return hasAccess("strategy_map");
    }
    if (pathname.startsWith("/victoria")) return hasAccess("agente");
    if (pathname.startsWith("/auditoria")) return hasAccess("auditoria");
    if (pathname.startsWith("/config")) return true;
    return true;
  };
  const [activeModule, setActiveModule] = useState<"hub" | "trafego" | "social" | "gestao" | "funil" | "victoria" | "crm">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("nc_active_module");
      return (["hub", "trafego", "social", "gestao", "funil", "victoria", "crm"].includes(stored as any) ? stored : "hub") as any;
    }
    return "hub";
  });

  const path = useRouterState({ select: (s) => s.location.pathname });

  const prevModuleRef = useRef(activeModule);

  useEffect(() => {
    let nextModule = activeModule;
    if (path.startsWith("/victoria")) {
      nextModule = "victoria";
    } else if (path.startsWith("/crm") || path.startsWith("/client-portal")) {
      nextModule = "crm";
    } else if (path.startsWith("/social") || path.startsWith("/organizador") || path.startsWith("/link-bio") || path.startsWith("/quiz")) {
      nextModule = "social";
    } else if (path.startsWith("/dashboard") || path.startsWith("/clientes") || path.startsWith("/relatorios") || path.startsWith("/criativos") || path.startsWith("/metricas") || path.startsWith("/campanhas")) {
      nextModule = "trafego";
    } else if (path.startsWith("/cobrancas")) {
      nextModule = "gestao";
    } else if (path.startsWith("/strategy-map") || path.startsWith("/funis") || path.startsWith("/funnel-builder")) {
      nextModule = "funil";
    }

    if (nextModule !== activeModule) {
      setActiveModule(nextModule as any);
      localStorage.setItem("nc_active_module", nextModule);
      
      if (prevModuleRef.current && prevModuleRef.current !== nextModule) {
        let moduleName = "";
        if (nextModule === "social") moduleName = "Módulo Social";
        else if (nextModule === "crm") moduleName = "CRM Vendas";
        else if (nextModule === "trafego") moduleName = "Núcleo de Performance";
        else if (nextModule === "gestao") moduleName = "Gestão";
        else if (nextModule === "funil") moduleName = "Estratégia de Funil";
        
        if (moduleName) {
          toast(`Alternado para o ${moduleName}`);
        }
      }
      prevModuleRef.current = nextModule as any;
    }
  }, [path]);

  const [showModuleMenu, setShowModuleMenu] = useState(false);

  let currentNavItems = TRAFEGO_NAV_ITEMS;

  if (activeModule === "social") {
    currentNavItems = SOCIAL_NAV_ITEMS;
  } else if (activeModule === "gestao") {
    currentNavItems = GESTAO_NAV_ITEMS;
  } else if (activeModule === "funil") {
    currentNavItems = FUNIL_NAV_ITEMS;
  } else if (activeModule === "victoria") {
    currentNavItems = VICTORIA_NAV_ITEMS;
  } else if (activeModule === "crm") {
    currentNavItems = CRM_NAV_ITEMS;
  }

  const filteredNavItems = currentNavItems.filter(item => hasPageAccess(item.to));

  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const qc = useQueryClient();

  // ── Auto-Sync a cada 30 minutos ──────────────────────────────────────────────
  const { runSync } = useAutoSync();

  // ── Motor de Alertas Sonoros ──────────────────────────────────────────────────
  const { acknowledgeAll, soundEnabled, toggleSound } = useAlertEngine();

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



  // Fecha menus ao navegar
  useEffect(() => {
    setMobileMenuOpen(false);
    setShowUserMenu(false);
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
              <span className="font-display font-black text-white text-2xl relative z-10 tracking-normal">NC</span>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/22 rounded-b-2xl" />
            </div>
          </div>
          <div className="text-center space-y-1.5">
            <p className="font-display font-black text-sm tracking-normal text-foreground">NC Performance Suite</p>
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

  // Se o activeModule for "hub", renderiza a tela de seleção de módulos (Cards direcionais)
  if (activeModule === "hub") {
    const isHubDark = theme === "dark";
    return (
      <div
        className="relative flex min-h-screen w-full flex-col bg-background overflow-y-auto selection:bg-primary/30 justify-center items-center p-6"
        style={{
          backgroundImage: `radial-gradient(circle, ${isHubDark ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.055)"} 1px, transparent 1px)`,
          backgroundSize: "28px 28px",
        }}
      >
        {/* Background glow effects */}
        <div className="absolute inset-0 pointer-events-none -z-10">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full w-[800px] h-[500px] bg-gradient-to-r from-primary/8 via-violet-500/5 to-cyan-500/8 blur-[140px]" />
        </div>

        <div className="w-full max-w-4xl space-y-8 text-center relative z-10 my-auto">
          {/* Logo & Header */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative h-12 w-12 rounded-2xl bg-primary flex items-center justify-center overflow-hidden shadow-glow">
              <div className="absolute inset-x-0 top-0 h-[4px] bg-white/28 rounded-t-2xl pointer-events-none" />
              <span className="font-display font-black text-white text-lg relative z-10 tracking-normal">NC</span>
              <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/22 rounded-b-2xl pointer-events-none" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground mt-2">
              Selecione o Módulo de Trabalho
            </h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-mono">
              NC Performance Suite · Bem-vindo, {profile?.full_name || user?.email}
            </p>
          </div>

          {/* Grid of Directional Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6 pt-4">
            {/* Card 1: Tráfego Pago */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("trafego");
                localStorage.setItem("nc_active_module", "trafego");
                nav({ to: "/dashboard" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-red-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 to-orange-500 rounded-t-2xl" />
              <div className="h-10 w-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
                <LineChart className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-red-500 transition-colors">
                Tráfego Pago
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Command Center, métricas granulares, dashboards de anúncios, relatórios de performance e automação de alertas.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-red-500 tracking-wider">
                Acessar Tráfego <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            {/* Card 2: Social Media */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("social");
                localStorage.setItem("nc_active_module", "social");
                nav({ to: "/social" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-pink-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-500 to-violet-500 rounded-t-2xl" />
              <div className="h-10 w-10 rounded-xl bg-pink-500/10 border border-pink-500/20 flex items-center justify-center mb-4">
                <Share2 className="h-5 w-5 text-pink-500" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-pink-500 transition-colors">
                Social Media
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Planejador visual, calendário editorial integrado, criador de legendas com IA e analytics de conteúdo.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-pink-500 tracking-wider">
                Acessar Redes <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            {/* Card 3: Gestão de Clientes */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("gestao");
                localStorage.setItem("nc_active_module", "gestao");
                nav({ to: "/clientes" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-cyan-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-t-2xl" />
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center mb-4">
                <Store className="h-5 w-5 text-cyan-500" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-cyan-500 transition-colors">
                Gestão de Clientes
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Gestão de carteiras de clientes, faturamento, reuniões de fechamento e o Agente IA Victoria.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-cyan-500 tracking-wider">
                Acessar Gestão <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            {/* Card 3.5: CRM & Vendas (Novo Hub SDR) */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("crm");
                localStorage.setItem("nc_active_module", "crm");
                nav({ to: "/crm" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-emerald-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-t-2xl" />
              <div className="h-10 w-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                <Users className="h-5 w-5 text-emerald-500" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-emerald-500 transition-colors">
                CRM & Vendas
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Pipeline de SDR, Motor de Cadência Comercial, Agendamentos e Portal do Cliente.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-emerald-500 tracking-wider">
                Acessar CRM <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            {/* Card 4: Funis & Mapas */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("funil");
                localStorage.setItem("nc_active_module", "funil");
                nav({ to: "/funis" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-purple-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-t-2xl" />
              <div className="h-10 w-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
                <GitBranch className="h-5 w-5 text-purple-500" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-purple-500 transition-colors">
                Mapas & Funis
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Crie funis automotivos no Mapa Mental. Defina jornadas, rastreie fricções e gerencie Link Bios, Forms e Quizzes.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-purple-500 tracking-wider">
                Acessar Funis <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>

            {/* Card 5: Victoria AI */}
            <motion.div
              whileHover={{ y: -8, scale: 1.02 }}
              onClick={() => {
                setActiveModule("victoria");
                localStorage.setItem("nc_active_module", "victoria");
                nav({ to: "/victoria" });
              }}
              className="group relative rounded-2xl border border-border bg-card p-6 text-left cursor-pointer transition-all duration-300 hover:border-amber-500/40 hover:shadow-lg shadow-sm"
            >
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-amber-500 to-yellow-500 rounded-t-2xl animate-pulse" />
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
                <Bot className="h-5 w-5 text-amber-500 animate-pulse" />
              </div>
              <h3 className="text-base font-black text-foreground group-hover:text-amber-500 transition-colors flex items-center gap-1.5">
                Victoria AI <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[8px] font-black uppercase text-amber-500 tracking-wider">Cérebro</span>
              </h3>
              <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                Orquestrador Multiagente. Crie funis via chat, gere relatórios OCR e execute análises de tráfego sênior em tempo real.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-[10px] font-black uppercase text-amber-500 tracking-wider">
                Acessar Victoria AI <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          </div>

          {/* Theme toggle + Configurações + Footer logout */}
          <div className="pt-4 flex items-center justify-center gap-6 flex-wrap">
            <button
              onClick={toggleTheme}
              className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              {theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            </button>
            <div className="h-3 w-px bg-border" />
            <Link
              to="/config"
              className="text-[10px] font-bold text-muted-foreground hover:text-foreground uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <Settings className="h-3.5 w-3.5" /> Configurações
            </Link>
            <div className="h-3 w-px bg-border" />
            <button
              onClick={handleSignOut}
              className="text-[10px] font-bold text-muted-foreground hover:text-destructive uppercase tracking-wider flex items-center gap-1.5 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair da Conta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen w-full flex-col bg-background overflow-x-hidden selection:bg-primary/30" style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent' }}>

      
      {/* ═══════════════════════════════════════
          TOP NAVIGATION BAR — Premium Horizontal
          ═══════════════════════════════════════ */}
      <header className="sticky top-0 z-50 border-gradient-bottom bg-background/92 backdrop-blur-2xl" style={{ height: '64px' }}>
        <div className="mx-auto flex h-full max-w-[1600px] items-center justify-between gap-2 px-3 md:px-5">
          
          {/* LEFT: Logo & Module Switcher */}
          <div className="flex items-center gap-3 shrink-0">
            <Link 
              to="/dashboard" 
              onClick={() => {
                setActiveModule("hub");
                localStorage.setItem("nc_active_module", "hub");
              }}
              className="flex items-center gap-2 group"
            >
              <div className="relative h-8 w-8 rounded-xl bg-primary flex items-center justify-center overflow-hidden shadow-glow-sm transition-all duration-300 group-hover:shadow-glow">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-white/28 rounded-t-xl pointer-events-none" />
                <span className="font-display font-black text-white text-xs relative z-10 tracking-normal">NC</span>
                <div className="absolute inset-x-0 bottom-0 h-[2px] bg-black/22 rounded-b-xl pointer-events-none" />
              </div>
              <div className="hidden md:flex flex-col leading-none gap-[4px]">
                <span className="font-display text-[12px] font-black tracking-normal leading-none">NC Performance</span>
                <div className="flex items-center gap-[4px]">
                  <div className="h-px w-2.5 bg-primary/65 rounded-full" />
                  <span className="text-[7px] font-mono font-bold uppercase tracking-[0.25em] text-primary leading-none">Suite Automotiva</span>
                  <div className="h-px w-2.5 bg-primary/65 rounded-full" />
                </div>
              </div>
            </Link>

            {(activeModule as string) !== "hub" && (
              <div className="relative ml-2">
                <button
                  onClick={() => setShowModuleMenu(!showModuleMenu)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground hover:bg-muted/50 transition-all duration-200"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    activeModule === "trafego" ? "bg-red-500" : activeModule === "social" ? "bg-pink-500" : activeModule === "funil" ? "bg-purple-500" : activeModule === "gestao" ? "bg-cyan-500" : "bg-amber-500"
                  }`} />
                  <span>
                    {activeModule === "trafego" ? "Tráfego" : activeModule === "social" ? "Social" : activeModule === "funil" ? "Funis" : activeModule === "gestao" ? "Gestão" : "Victoria AI"}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
 
                <AnimatePresence>
                  {showModuleMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowModuleMenu(false)} />
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.96 }}
                        className="absolute left-0 top-full z-50 mt-1.5 w-48 rounded-2xl border border-border bg-card p-1.5 shadow-2xl"
                      >
                        <button
                          onClick={() => {
                            setActiveModule("hub");
                            localStorage.setItem("nc_active_module", "hub");
                            setShowModuleMenu(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                        >
                          <LayoutDashboard className="h-3.5 w-3.5" />
                          Painel de Módulos (Hub)
                        </button>
                        <div className="my-1 border-t border-border" />
                        <button
                          onClick={() => {
                            setActiveModule("trafego");
                            localStorage.setItem("nc_active_module", "trafego");
                            setShowModuleMenu(false);
                            nav({ to: "/dashboard" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "trafego" ? "bg-red-500/10 text-red-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Tráfego Pago
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule("social");
                            localStorage.setItem("nc_active_module", "social");
                            setShowModuleMenu(false);
                            nav({ to: "/social" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "social" ? "bg-pink-500/10 text-pink-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-pink-500" />
                          Social Media
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule("gestao");
                            localStorage.setItem("nc_active_module", "gestao");
                            setShowModuleMenu(false);
                            nav({ to: "/clientes" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "gestao" ? "bg-cyan-500/10 text-cyan-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          Gestão de Clientes
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule("crm");
                            localStorage.setItem("nc_active_module", "crm");
                            setShowModuleMenu(false);
                            nav({ to: "/crm" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "crm" ? "bg-emerald-500/10 text-emerald-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          CRM & Vendas
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule("funil");
                            localStorage.setItem("nc_active_module", "funil");
                            setShowModuleMenu(false);
                            nav({ to: "/funis" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "funil" ? "bg-purple-500/10 text-purple-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
                          Mapas &amp; Funis
                        </button>
                        <button
                          onClick={() => {
                            setActiveModule("victoria");
                            localStorage.setItem("nc_active_module", "victoria");
                            setShowModuleMenu(false);
                            nav({ to: "/victoria" });
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold transition-all ${
                            activeModule === "victoria" ? "bg-amber-500/10 text-amber-500" : "text-foreground/80 hover:bg-muted"
                          }`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                          Victoria AI
                        </button>
                        <div className="my-1 border-t border-border" />
                        <Link
                          to="/config"
                          onClick={() => setShowModuleMenu(false)}
                          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                        >
                          <Settings className="h-3.5 w-3.5" />
                          Configurações
                        </Link>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* CENTER: Navigation Links (Desktop) — todos inline, sem botão Mais */}
          <nav className="hidden lg:flex flex-1 min-w-0 items-center justify-center gap-0 px-1">
            <div className="flex min-w-0 items-center overflow-x-auto scrollbar-none">
              {filteredNavItems.map((item) => {
                const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={`group relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-all duration-200 ${
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    <item.icon className={`h-3.5 w-3.5 shrink-0 transition-transform group-hover:scale-110 ${isActive ? 'text-primary' : ''}`} />
                    <span>{item.label}</span>
                    {isActive && (
                      <motion.div
                        layoutId="nav-indicator"
                        className="absolute inset-x-2 bottom-0 h-[2px] bg-primary rounded-full shadow-glow-sm"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* RIGHT: Actions — largura fixa ~220px, zero breakpoints, estável em qualquer zoom */}
          <div className="flex shrink-0 items-center gap-1">

            {/* Sync — ícone compacto com dot de status, tooltip com detalhes */}
            <button
              onClick={() => runSync("manual")}
              disabled={syncStatus.isSyncing}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:border-primary/30 hover:text-primary active:scale-95 disabled:opacity-60"
              title={syncStatus.isSyncing ? 'Sincronizando...' : syncStatus.lastSync
                ? `Último sync: ${new Date(syncStatus.lastSync).toLocaleTimeString('pt-BR')}`
                : 'Sincronizar agora'}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncStatus.isSyncing ? 'animate-spin text-primary' : ''}`} />
              {syncStatus.lastResult === 'success' && !syncStatus.isSyncing && (
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-green-500" />
              )}
              {syncStatus.lastResult === 'error' && (
                <span className="absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full bg-destructive" />
              )}
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className="relative flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:text-foreground hover:border-primary/30 hover:shadow-glow-sm active:scale-95"
              title={theme === "dark" ? "Modo Claro" : "Modo Escuro"}
            >
              <AnimatePresence mode="wait">
                {theme === "dark" ? (
                  <motion.div key="sun" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Sun className="h-3.5 w-3.5" />
                  </motion.div>
                ) : (
                  <motion.div key="moon" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
                    <Moon className="h-3.5 w-3.5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>

            {/* Victoria AI Badge — sempre visível no desktop */}
            <button
              onClick={() => {
                setActiveModule("victoria");
                localStorage.setItem("nc_active_module", "victoria");
                nav({ to: "/victoria" });
              }}
              className="hidden lg:flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary transition-all hover:bg-primary/20 hover:shadow-glow-sm active:scale-95"
            >
              <Bot className="h-3.5 w-3.5" />
              Victoria
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => { setShowNotifications(!showNotifications); acknowledgeAll(); }}
                className={`relative flex h-8 w-8 items-center justify-center rounded-xl border transition-all active:scale-95 ${
                  showNotifications
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/30"
                }`}
              >
                <Bell className="h-3.5 w-3.5" />
                {hasUnread && (
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
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
                       className="fixed right-3 left-3 sm:absolute sm:left-auto sm:right-0 sm:w-96 top-[4.5rem] sm:top-full z-50 sm:mt-2 rounded-2xl border border-border bg-card p-4 shadow-2xl overflow-hidden"
                    >
                      <div className="flex items-center justify-between border-b border-border pb-2.5 mb-2.5">
                        <div className="flex items-center gap-2">
                          <Activity className="h-4 w-4 text-primary" />
                          <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Alertas do Agente AI</h4>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={toggleSound}
                            title={soundEnabled ? "Desativar som dos alertas" : "Ativar som dos alertas"}
                            className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider transition-all ${
                              soundEnabled
                                ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
                                : "border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                            }`}
                          >
                            {soundEnabled
                              ? <><Volume2 className="h-2.5 w-2.5" /> Som</>
                              : <><VolumeX className="h-2.5 w-2.5" /> Mudo</>
                            }
                          </button>
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

            {/* User Menu — dropdown profissional, avatar sempre visível */}
            <div className="relative pl-2 ml-1 border-l border-border">
              <button
                onClick={() => setShowUserMenu(v => !v)}
                className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0 hover:border-primary/50 transition-all active:scale-95"
                title={profile?.full_name || user?.email?.split('@')[0]}
              >
                {profile?.avatar_url ? (
                  <img src={profile.avatar_url} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  <User className="h-4 w-4 text-primary" />
                )}
              </button>

              <AnimatePresence>
                {showUserMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 8, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.96 }}
                      className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-border bg-card p-2 shadow-2xl"
                    >
                      {/* Identity */}
                      <div className="flex items-center gap-3 px-3 py-2.5 border-b border-border mb-1.5">
                        <div className="h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center overflow-hidden shrink-0">
                          {profile?.avatar_url
                            ? <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                            : <User className="h-4 w-4 text-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold truncate">{profile?.full_name || "Usuário"}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                        </div>
                      </div>
                      {/* Actions */}
                      <button
                        onClick={() => { setIsProfileOpen(true); setShowUserMenu(false); }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-medium text-foreground hover:bg-muted/50 transition-all"
                      >
                        <User className="h-3.5 w-3.5 text-muted-foreground" /> Meu Perfil
                      </button>
                      <button
                        onClick={() => { setShowUserMenu(false); handleSignOut(); }}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-[12px] font-medium text-red-400 hover:bg-red-500/10 transition-all"
                      >
                        <LogOut className="h-3.5 w-3.5" /> Sair da Conta
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            {/* Mobile: Victoria compacto */}
            <button
              onClick={() => {
                setActiveModule("victoria");
                localStorage.setItem("nc_active_module", "victoria");
                nav({ to: "/victoria" });
              }}
              className="flex lg:hidden h-8 w-8 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary"
            >
              <Bot className="h-4 w-4" />
            </button>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex lg:hidden h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:border-primary/30 hover:text-foreground active:scale-95 ml-1"
            >
              <Menu className="h-4 w-4" />
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
              {/* Lista Vertical de Nav (Melhor Legibilidade) */}
              <nav className="p-4 flex flex-col gap-1.5">
                {filteredNavItems.map((item) => {
                  const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3.5 rounded-2xl px-4 py-3.5 text-[13px] font-bold transition-all ${
                        isActive ? "bg-primary/10 text-primary border border-primary/20" : "bg-transparent text-foreground hover:bg-white/[0.03] border border-transparent"
                      }`}
                    >
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${isActive ? 'bg-primary/20' : 'bg-muted/30'}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      {item.label}
                      <ChevronRight className={`h-4 w-4 ml-auto transition-transform ${isActive ? 'opacity-100 translate-x-1' : 'opacity-30'}`} />
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
                <button onClick={handleSignOut} className="rounded-xl border border-border px-3 py-2 text-xs font-bold text-muted-foreground hover:text-destructive transition-colors">
                  Sair
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════
          MOBILE BOTTOM NAVIGATION BAR
          5 ítens: Dashboard · Métricas · Alertas · Config · Mais
          ═══════════════════════════════════════ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/96 backdrop-blur-xl pb-safe-nav">
        <div className="flex items-stretch justify-around px-1 pb-safe">
          {(() => {
            let mobileItems = [
              { to: "/dashboard", icon: LayoutDashboard, label: "Home" },
              { to: "/metricas", icon: LineChart, label: "Métricas" },
            ];
            if (activeModule === "social") {
              mobileItems = [
                { to: "/social", icon: Share2, label: "Social" },
                { to: "/social-insights", icon: BarChart3, label: "Insights" },
              ];
            } else if (activeModule === "gestao") {
              mobileItems = [
                { to: "/clientes", icon: Store, label: "Clientes" },
                { to: "/reunioes", icon: Users, label: "Reuniões" },
              ];
            }
            return mobileItems.map((item) => {
              const isActive = path === item.to || (item.to !== "/dashboard" && path.startsWith(item.to));
              return (
                <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-1 px-3 py-3 text-[10px] font-bold transition-colors ${isActive ? "text-primary" : "text-muted-foreground"}`}>
                  <item.icon className={`h-5 w-5 ${isActive ? "text-primary" : ""}`} />
                  {item.label}
                  {isActive && <span className="absolute bottom-0 h-[2px] w-6 rounded-full bg-primary" />}
                </Link>
              );
            });
          })()}
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
      <main className="relative z-[1] flex flex-1 flex-col overflow-y-auto overscroll-none custom-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
        {(() => {
          const isAuthorized = hasPageAccess(path);
          if (!isAuthorized) {
            return (
              <div className="flex flex-1 flex-col items-center justify-center p-6 text-center my-auto">
                <div className="glass-panel max-w-md p-8 space-y-6 shadow-2xl rounded-3xl border border-white/10 bg-background/50 backdrop-blur-md">
                  <div className="mx-auto h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive">
                    <Lock className="h-8 w-8" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-xl font-black tracking-tight text-foreground uppercase">Acesso Restrito</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      Seu usuário não possui permissão para acessar esta seção. Entre em contato com um administrador para solicitar acesso.
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveModule("hub");
                      localStorage.setItem("nc_active_module", "hub");
                      nav({ to: "/dashboard" });
                    }}
                    className="w-full rounded-full bg-primary py-2.5 text-xs font-black text-background hover:opacity-90 active:scale-95 transition"
                  >
                    VOLTAR AO MENU PRINCIPAL
                  </button>
                </div>
              </div>
            );
          }

          const isFullScreenApp = path.startsWith('/funnel-builder') || path.startsWith('/strategy-map') || path.startsWith('/reunioes');
          return (
            <div className={isFullScreenApp ? "flex flex-1 flex-col w-full" : "mx-auto w-full px-2 py-4 pb-28 sm:p-4 md:pb-8 md:p-6 lg:p-8"}>
              <Outlet />
            </div>
          );
        })()}
      </main>

      {createPortal(
        <AnimatePresence>
          {showNotification && recentNotifications.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="!fixed bottom-24 right-4 sm:bottom-8 sm:right-6 w-[calc(100vw-2rem)] max-w-[340px] z-[9999] rounded-2xl border border-primary/30 bg-card p-4 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent pointer-events-none" />
              <button onClick={() => setShowNotification(false)} className="absolute top-2.5 right-2.5 text-muted-foreground/50 hover:text-foreground transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/12 border border-primary/25 p-2 text-primary shrink-0">
                  <Sparkles className="h-4 w-4 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black uppercase tracking-wider text-primary">Victoria AI</p>
                  <p className="text-[11px] font-bold text-foreground mt-0.5 truncate">{recentNotifications[0].title}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{recentNotifications[0].message}</p>
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
        </AnimatePresence>,
        document.body
      )}

      <AIAgentSidebar isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
      <ProfileSettingsModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} profile={profile} userId={user?.id || ""} />
    </div>
  );
}
