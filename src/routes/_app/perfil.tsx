import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Shield, ShieldCheck, Crown, Star, Award, Target, Briefcase, Palette,
  Phone, Lock, Key, Copy, Check, Eye, EyeOff, Plus, Trash2, Search, X, Loader2,
  ArrowRight, Settings, AlertTriangle, ExternalLink, RefreshCw, Sparkles, UserCheck,
  UserX, MessageSquareWarning, Zap, CheckCheck, HelpCircle, Mail, ChevronDown, Share2
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AvatarUpload } from "@/components/AvatarUpload";
import { UserAvatar } from "@/components/UserAvatar";
import { DidacticUserAccessEditor } from "@/components/DidacticUserAccessEditor";
import { TeamActivityMonitor } from "@/components/TeamActivityMonitor";
import { isUserOnlineNow } from "@/lib/activityPixelService";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  getUserLevel,
  getHierarchyInfo,
  checkHierarchyAuthority,
  getAllowedAssignableRoles,
  generateStrongPassword,
  isMasterAdmin,
  canUserManageUsers,
  canUserAccessConfig,
  getCargoDefinition,
  MASTER_ADMIN_EMAILS,
} from "@/lib/userHierarchy";
import {
  createSystemUser,
  updateSystemUser,
  updateOwnPassword,
  deleteSystemUser,
  toggleUserStatus,
  resolveUserAvatar,
  saveUserAvatarImmediate,
} from "@/lib/userService";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Meu Perfil & Membros — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: string; view?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
  }),
  component: ProfileRoutePage,
});

// ──────────────────────────────────────────────────────────────────────────────
// Estrutura Robusta de Módulos & Permissões por HUB da NC Suite
// ──────────────────────────────────────────────────────────────────────────────
export type PermissionMode = "read_only" | "full";

export interface PermissionModuleDef {
  key: string;
  label: string;
  description: string;
  hub: "trafego" | "operacao" | "gestao";
  hubLabel: string;
  mode: PermissionMode; // read_only (apenas Bloqueado ou Liberado) | full (Bloqueado, Leitura ou Escrita)
}

export const PERMISSION_MODULES: PermissionModuleDef[] = [
  // ── HUB TRÁFEGO & PERFORMANCE ──
  {
    key: "dashboard",
    label: "Command Center",
    description: "Painel executivo com métricas consolidadas e gráficos",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },
  {
    key: "metricas",
    label: "Métricas & KPIs",
    description: "Tabelas analíticas de campanhas, conjuntos e anúncios",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },
  {
    key: "simulador",
    label: "Simulador",
    description: "Simulador de cenários de CPL, investimento e leads",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },
  {
    key: "cockpit",
    label: "Cockpit",
    description: "Controle operacional de campanhas e alteração de orçamento",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full", // Operacional: Leitura ou Escrita (Pausar/Orçamento)
  },
  {
    key: "relatorios",
    label: "Relatórios",
    description: "Geração e exportação de relatórios executivos em PDF",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },
  {
    key: "criativos",
    label: "Criativos",
    description: "Biblioteca de criativos, upload de peças e ranking",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },
  {
    key: "auditoria",
    label: "Auditoria Hub",
    description: "Diagnóstico de integridade e varreduras do motor",
    hub: "trafego",
    hubLabel: "Hub Tráfego & Performance",
    mode: "full",
  },

  // ── HUB OPERAÇÃO, REGRAS & IA ──
  {
    key: "automacoes",
    label: "Automações",
    description: "Central de regras inteligentes, gatilhos e alertas",
    hub: "operacao",
    hubLabel: "Hub Operação & Automações",
    mode: "full",
  },
  {
    key: "agente",
    label: "Victoria AI",
    description: "Assistente de IA, grounding RAG e comandos autônomos",
    hub: "operacao",
    hubLabel: "Hub Operação & Automações",
    mode: "full",
  },
  {
    key: "gestao_victoria",
    label: "Mente da Victoria AI",
    description: "Central neural: calibração de IA, aprendizado RAG, radar de mercado e diretrizes táticas",
    hub: "operacao",
    hubLabel: "Hub Operação & Automações",
    mode: "full",
  },
  {
    key: "strategy_map",
    label: "Mapa Estratégico",
    description: "Whiteboard de funis, jornadas e mapas mentais",
    hub: "operacao",
    hubLabel: "Hub Operação & Automações",
    mode: "full",
  },
  {
    key: "reunioes",
    label: "Reuniões",
    description: "Agendamento de reuniões, atas e pautas",
    hub: "operacao",
    hubLabel: "Hub Operação & Automações",
    mode: "full",
  },

  // ── HUB GESTÃO & ADMINISTRATIVO ──
  {
    key: "clientes",
    label: "Clientes",
    description: "Lojas, ad accounts integradas e dados de clientes",
    hub: "gestao",
    hubLabel: "Hub Gestão & Clientes",
    mode: "full",
  },
  {
    key: "cobrancas",
    label: "Cobranças",
    description: "Faturas, links de cobrança e controle financeiro",
    hub: "gestao",
    hubLabel: "Hub Gestão & Clientes",
    mode: "full",
  },
  {
    key: "social",
    label: "Social Media",
    description: "Planejador de feed, posts e insights do Instagram",
    hub: "gestao",
    hubLabel: "Hub Gestão & Clientes",
    mode: "full",
  },
  {
    key: "criar_usuarios",
    label: "Gestão Usuários",
    description: "Cadastro de colaboradores, senhas e permissões",
    hub: "gestao",
    hubLabel: "Hub Gestão & Clientes",
    mode: "full",
  },
];

export const HUBS_DEFINITIONS = [
  { id: "trafego", label: "Hub Tráfego & Performance", icon: "gauge", colorBadge: "text-primary border-primary/30 bg-primary/10" },
  { id: "operacao", label: "Hub Operação & Automações", icon: "zap", colorBadge: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  { id: "gestao", label: "Hub Gestão & Clientes", icon: "building", colorBadge: "text-blue-400 border-blue-500/30 bg-blue-500/10" },
] as const;

export const POSITIONS_LIST = [
  "Gestor de Tráfego",
  "Social Media",
  "Gerente",
  "Diretor",
  "CEO",
  "Administrador",
  "Desenvolvedor",
  "Designer",
  "Videomaker",
  "SDR",
  "Outros",
];

const CARGO_DEFAULT_PERMISSIONS: Record<string, Record<string, "none" | "view" | "edit">> = {
  "Gestor de Tráfego": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "view", relatorios: "edit", criativos: "edit", social: "none",
    automacoes: "edit", reunioes: "none", cobrancas: "none", strategy_map: "edit",
    agente: "edit", gestao_victoria: "none", auditoria: "view", criar_usuarios: "none",
  },
  "Social Media": {
    dashboard: "view", metricas: "none", simulador: "none", cockpit: "none",
    clientes: "view", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "edit",
    agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
  },
  "Gerente": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "view", reunioes: "edit", cobrancas: "none", strategy_map: "edit",
    agente: "edit", gestao_victoria: "view", auditoria: "view", criar_usuarios: "view",
  },
  "Diretor": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
    agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
  },
  "CEO": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
    agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
  },
  "Administrador": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
    agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
  },
  "Desenvolvedor": {
    dashboard: "view", metricas: "view", simulador: "view", cockpit: "edit",
    clientes: "edit", relatorios: "edit", criativos: "edit", social: "edit",
    automacoes: "edit", reunioes: "edit", cobrancas: "edit", strategy_map: "edit",
    agente: "edit", gestao_victoria: "edit", auditoria: "edit", criar_usuarios: "edit",
  },
  "Designer": {
    dashboard: "view", metricas: "none", simulador: "none", cockpit: "none",
    clientes: "view", relatorios: "none", criativos: "edit", social: "view",
    automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "edit",
    agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
  },
  "SDR": {
    dashboard: "view", metricas: "none", simulador: "none", cockpit: "none",
    clientes: "view", relatorios: "none", criativos: "none", social: "none",
    automacoes: "none", reunioes: "edit", cobrancas: "none", strategy_map: "none",
    agente: "view", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
  },
  "Outros": {
    dashboard: "view", metricas: "none", simulador: "none", cockpit: "none",
    clientes: "none", relatorios: "none", criativos: "none", social: "none",
    automacoes: "none", reunioes: "none", cobrancas: "none", strategy_map: "none",
    agente: "none", gestao_victoria: "none", auditoria: "none", criar_usuarios: "none",
  },
};

function renderRankIcon(iconName: string, className = "h-4 w-4") {
  switch (iconName) {
    case "crown": return <Crown className={className} />;
    case "shield": return <Shield className={className} />;
    case "star": return <Star className={className} />;
    case "award": return <Award className={className} />;
    case "target": return <Target className={className} />;
    case "briefcase": return <Briefcase className={className} />;
    case "palette": return <Palette className={className} />;
    case "phone": return <Phone className={className} />;
    default: return <User className={className} />;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Página Principal de Perfil
// ──────────────────────────────────────────────────────────────────────────────
function ProfileRoutePage() {
  const search = Route.useSearch() as { tab?: string; view?: string };
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Perfil do usuário atual logado
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error || !data) return null;
      const resolvedAvatar = resolveUserAvatar({
        ...data,
        email: (data as any).email || user.email,
        user_metadata: user.user_metadata,
      });
      return {
        ...data,
        avatar_url: resolvedAvatar || data.avatar_url || null,
      };
    },
    enabled: !!user?.id,
  });

  const effectiveCaller = useMemo(() => ({
    id: user?.id,
    email: user?.email,
    ...(profile || {}),
  }), [user, profile]);

  const callerLevel = useMemo(() => getUserLevel(effectiveCaller), [effectiveCaller]);
  const callerInfo = useMemo(() => getHierarchyInfo(effectiveCaller), [effectiveCaller]);
  const isCallerMaster = useMemo(() => isMasterAdmin(effectiveCaller), [effectiveCaller]);
  const canManageUsers = canUserManageUsers(effectiveCaller);
  const canAccessConfig = canUserAccessConfig(effectiveCaller);

  const [activeTab, setActiveTab] = useState<"meu_perfil" | "equipe">(() => {
    if (search.tab === "equipe" && canManageUsers) return "equipe";
    return "meu_perfil";
  });

  useEffect(() => {
    if (search.tab === "equipe" && canManageUsers && activeTab !== "equipe") {
      setActiveTab("equipe");
    } else if (search.tab === "meu_perfil" && activeTab !== "meu_perfil") {
      setActiveTab("meu_perfil");
    }
  }, [search.tab, canManageUsers]);

  const handleTabChange = (t: "meu_perfil" | "equipe") => {
    setActiveTab(t);
    navigate({ search: { tab: t } as any, replace: true });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      {/* Cabeçalho da Página com atalho para Configurações (exclusivo para superiores) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <PageHeader
          eyebrow="Identidade & Acessos"
          title="Meu Perfil & Equipe"
          description="Gerencie seus dados profissionais, credenciais de acesso e a estrutura da equipe."
        />

        {/* Botão de Atalho para Configurações do Sistema — Exclusivo para Superiores */}
        {canAccessConfig && (
          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <Link
              to="/config"
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-4 py-2.5 text-xs font-bold text-primary transition-all duration-200 shadow-glow-sm hover:shadow-glow active:scale-95 uppercase tracking-wider"
              title="Acessar painel completo de configurações gerais"
            >
              <Settings className="h-4 w-4" />
              <span>Painel de Configurações</span>
            </Link>
          </div>
        )}
      </div>

      {/* Switcher de Abas (Meu Perfil vs Membros da Equipe) */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-2 overflow-x-auto scrollbar-hide">
        <button
          onClick={() => handleTabChange("meu_perfil")}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
            activeTab === "meu_perfil"
              ? "bg-primary text-primary-foreground shadow-glow-sm"
              : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
          }`}
        >
          <User className="h-4 w-4" /> Meu Perfil Profissional
        </button>

        {canManageUsers && (
          <button
            onClick={() => handleTabChange("equipe")}
            className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-200 ${
              activeTab === "equipe"
                ? "bg-primary text-primary-foreground shadow-glow-sm"
                : "bg-card border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40"
            }`}
          >
            <ShieldCheck className="h-4 w-4" /> Membros & Credenciais da Equipe
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-mono">
              Gestão
            </span>
          </button>
        )}
      </div>

      {/* Conteúdo da Aba Ativa */}
      <AnimatePresence mode="wait">
        {activeTab === "meu_perfil" && (
          <motion.div
            key="meu_perfil"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <MyProfileSection
              user={user}
              profile={profile}
              callerInfo={callerInfo}
              canAccessConfig={canAccessConfig}
              isCallerMaster={isCallerMaster}
            />
          </motion.div>
        )}

        {activeTab === "equipe" && canManageUsers && (
          <motion.div
            key="equipe"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            <TeamManagementSection
              callerUser={user}
              callerProfile={profile}
              effectiveCaller={effectiveCaller}
              initialView={search.view === "pixel" ? "pixel" : "colaboradores"}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SEÇÃO: MEU PERFIL (Visível para qualquer usuário logado)
// ──────────────────────────────────────────────────────────────────────────────
function MyProfileSection({
  user,
  profile,
  callerInfo,
  canAccessConfig,
  isCallerMaster,
}: {
  user: any;
  profile: any;
  callerInfo: any;
  canAccessConfig: boolean;
  isCallerMaster: boolean;
}) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState(POSITIONS_LIST[0]);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  // Alteração de senha própria
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPosition(profile.position || POSITIONS_LIST[0]);
      setAvatarUrl(resolveUserAvatar({ ...profile, user_metadata: user?.user_metadata }) || "");
      setWhatsappNumbers(profile.whatsapp_numbers || []);
    }
  }, [profile, user]);

  // Salvar perfil
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      const cleanPhones = whatsappNumbers.map(p => p.trim()).filter(Boolean);
      const nextPerms = {
        ...(profile?.permissions || {}),
        _avatar_url: avatarUrl || null,
      };
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          position,
          avatar_url: avatarUrl || null,
          permissions: nextPerms,
          whatsapp_numbers: cleanPhones,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      if (error) throw error;

      await saveUserAvatarImmediate(user.id, avatarUrl || null, user.email);

      await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), position, avatar_url: avatarUrl || null }
      });

      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      qc.invalidateQueries({ queryKey: ["team_avatars_directory"] });
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
      qc.invalidateQueries({ queryKey: ["workflow_pixel_snapshot"] });
      toast.success("Perfil e foto profissional salvos com sucesso!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar dados do perfil");
    } finally {
      setSavingProfile(false);
    }
  };

  // Salvar nova senha própria
  const handleUpdatePassword = async () => {
    if (!newPassword.trim()) {
      toast.error("Por favor, digite uma nova senha.");
      return;
    }
    if (newPassword.trim().length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem. Verifique a digitação.");
      return;
    }

    setSavingPassword(true);
    try {
      const res = await updateOwnPassword(user.id, newPassword.trim(), profile?.permissions || {}, {
        role: profile?.role,
        position: profile?.position,
        fullName: profile?.full_name,
      });
      if (!res.success) throw new Error(res.error || "Falha ao alterar senha.");

      toast.success(res.message || "Sua senha foi alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao alterar senha.");
    } finally {
      setSavingPassword(false);
    }
  };

  const isMasterOrAdmin = callerInfo.level >= 90;
  const userPerms = profile?.permissions || {};

  return (
    <div className="space-y-6">
      {/* ── HERO BANNER: Cartão de Identidade & Patente ── */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-card via-card/90 to-background p-6 sm:p-8 shadow-2xl">
        <div className="absolute right-0 top-0 h-48 w-48 bg-primary/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
          <div className="flex items-center gap-5">
            <div className="relative shrink-0">
              <div className={`h-20 w-20 sm:h-24 sm:w-24 rounded-3xl border-2 flex items-center justify-center overflow-hidden shadow-2xl ${callerInfo.badgeBg} ${callerInfo.badgeBorder}`}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  renderRankIcon(callerInfo.iconName, `h-10 w-10 sm:h-12 sm:w-12 ${callerInfo.badgeText}`)
                )}
              </div>
              <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-background bg-emerald-500 shadow-md" title="Usuário Ativo" />
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                  {fullName || profile?.full_name || "Membro NC Suite"}
                </h2>
                <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider border ${callerInfo.badgeBg} ${callerInfo.badgeBorder} ${callerInfo.badgeText}`}>
                  {renderRankIcon(callerInfo.iconName, "h-3 w-3")}
                  {callerInfo.shortLabel}
                </span>
                <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-400 tracking-wider">
                  ATIVO
                </span>
              </div>

              <p className="text-xs sm:text-sm text-muted-foreground font-medium flex items-center gap-2">
                <span>{position}</span>
                <span className="h-1 w-1 rounded-full bg-border" />
                <span className="font-mono text-foreground/80">{user?.email}</span>
              </p>

              <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-xl pt-1">
                {callerInfo.description}
              </p>
            </div>
          </div>

          {/* Atalho Especial para Configurações do Sistema para Superiores */}
          {canAccessConfig && (
            <div className="w-full md:w-auto shrink-0 border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-6 flex flex-col gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Privilégio Superior
              </span>
              <p className="text-[11px] text-muted-foreground max-w-xs">
                Seu nível de autoridade concede acesso aos módulos do sistema.
              </p>
              <Link
                to="/config"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95"
              >
                <Settings className="h-3.5 w-3.5" /> Acessar Configurações
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── GRID: Informações Pessoais, Upload de Foto & WhatsApp ── */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Painel: Dados Básicos e Foto */}
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center gap-2 border-b border-white/5 pb-3">
            <User className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Dados Profissionais & Foto
            </h3>
          </div>

          <div className="space-y-5">
            <AvatarUpload
              value={avatarUrl}
              onChange={(newUrl) => setAvatarUrl(newUrl)}
              userId={user?.id}
              label="Sua Foto de Perfil"
              size="lg"
            />

            <div className="space-y-1.5">
              <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                Nome Completo
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome completo"
                className="w-full rounded-xl border border-white/10 bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                Cargo / Função
              </label>
              <select
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {POSITIONS_LIST.map((pos) => (
                  <option key={pos} value={pos} className="bg-card text-foreground">
                    {pos}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                E-mail de Login
              </label>
              <input
                value={user?.email || ""}
                disabled
                className="w-full rounded-xl border border-white/5 bg-background/20 px-3.5 py-2.5 text-sm text-muted-foreground font-mono cursor-not-allowed"
                title="Para alterar seu e-mail de acesso, contate o Administrador Master."
              />
              <span className="text-[10px] text-muted-foreground/60 block">
                O e-mail de acesso ao sistema é vinculado à conta e gerenciado por superiores.
              </span>
            </div>
          </div>
        </div>

        {/* Painel: WhatsApp de Alertas & Notificações Críticas */}
        <div className="glass-panel p-6 space-y-6 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-3">
              <MessageSquareWarning className="h-4 w-4 text-[#25D366]" />
              <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
                Dispositivos de Alerta (WhatsApp)
              </h3>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Cadastre seu número com DDD para receber avisos do motor, estouro de orçamento e conversões anômalas em tempo real.
              {isMasterOrAdmin ? " Como gestor/administrador, você pode cadastrar até 5 números." : " Você pode cadastrar 1 número prioritário."}
            </p>

            <div className="space-y-2.5 pt-1">
              {whatsappNumbers.map((num, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-2.5 text-xs text-muted-foreground font-mono">📱</span>
                    <input
                      value={num}
                      onChange={(e) => {
                        const copy = [...whatsappNumbers];
                        copy[idx] = e.target.value.replace(/[^0-9+]/g, "");
                        setWhatsappNumbers(copy);
                      }}
                      placeholder="Ex: 5521999999999"
                      className="w-full rounded-xl border border-white/10 bg-background/50 pl-8 pr-3 py-2 text-xs font-mono text-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => setWhatsappNumbers(whatsappNumbers.filter((_, i) => i !== idx))}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-xl transition"
                    title="Remover número"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              {whatsappNumbers.length < (isMasterOrAdmin ? 5 : 1) && (
                <button
                  onClick={() => setWhatsappNumbers([...whatsappNumbers, ""])}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 px-2 py-1 transition"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Dispositivo
                </button>
              )}
            </div>
          </div>

          <button
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 disabled:opacity-50"
          >
            {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            <span>Salvar Informações Profissionais</span>
          </button>
        </div>
      </div>

      {/* ── PAINEL: Segurança & Redefinição de Senha Própria ── */}
      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Segurança & Senha de Acesso
            </h3>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            Proteção Criptográfica SHA-256
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
              Nova Senha
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-xl border border-white/10 bg-background/50 pl-3.5 pr-10 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
              Confirmar Nova Senha
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova senha"
              className="w-full rounded-xl border border-white/10 bg-background/50 px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
            />
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleUpdatePassword}
            disabled={savingPassword || !newPassword}
            className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:border-primary hover:bg-primary hover:text-primary-foreground px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-foreground transition active:scale-95 disabled:opacity-40"
          >
            {savingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Key className="h-3.5 w-3.5" />}
            <span>Atualizar Minha Senha</span>
          </button>
        </div>
      </div>

      {/* ── PAINEL: Módulos & Permissões Ativas na Plataforma ── */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-bold uppercase tracking-wider text-foreground">
              Seus Módulos & Acessos Ativos
            </h3>
          </div>
          <span className="text-[10px] font-mono text-muted-foreground">
            {isMasterOrAdmin ? "Acesso Total Irrestrito" : "Conforme Cargo & Liberação"}
          </span>
        </div>

        <p className="text-xs text-muted-foreground">
          Abaixo estão os 14 módulos operacionais da NC Suite e o seu nível de acesso ativo no momento.
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 pt-2">
          {PERMISSION_MODULES.map(({ key, label, description }) => {
            const rawLevel = isMasterOrAdmin ? "edit" : (userPerms[key] || "none");
            const isEdit = rawLevel === "edit";
            const isView = rawLevel === "view";
            const isNone = !isEdit && !isView;

            return (
              <div
                key={key}
                className="rounded-xl border border-white/5 bg-background/40 p-3 flex flex-col justify-between gap-2"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-foreground truncate">{label}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                        isEdit
                          ? "bg-primary/10 text-primary border-primary/20"
                          : isView
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                          : "bg-white/5 text-muted-foreground/40 border-white/5"
                      }`}
                    >
                      {isEdit ? "Escrita" : isView ? "Leitura" : "Bloqueado"}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">
                    {description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// SEÇÃO: GESTÃO DE MEMBROS & CREDENCIAIS DA EQUIPE (Para Superiores)
// ──────────────────────────────────────────────────────────────────────────────
function TeamManagementSection({
  callerUser,
  callerProfile,
  effectiveCaller,
  initialView = "colaboradores",
}: {
  callerUser: any;
  callerProfile: any;
  effectiveCaller: any;
  initialView?: "colaboradores" | "pixel";
}) {
  const qc = useQueryClient();
  const [subView, setSubView] = useState<"colaboradores" | "pixel">(initialView);

  useEffect(() => {
    setSubView(initialView);
  }, [initialView]);

  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"todos" | "subordinados" | "diretoria" | "gerencia" | "gestores" | "operacao" | "inativos">("todos");

  // Revelação de senhas geradas (individual e global)
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [showAllPasswords, setShowAllPasswords] = useState(false);

  const togglePasswordReveal = (userId: string) => {
    setRevealedPasswords((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const callerInfo = useMemo(() => getHierarchyInfo(effectiveCaller), [effectiveCaller]);
  const callerLevel = useMemo(() => getUserLevel(effectiveCaller), [effectiveCaller]);
  const isCallerMaster = useMemo(() => isMasterAdmin(effectiveCaller), [effectiveCaller]);
  const allowedAssignable = useMemo(() => getAllowedAssignableRoles(effectiveCaller), [effectiveCaller]);

  // Edição
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editShowPassword, setEditShowPassword] = useState(true);
  const [editName, setEditName] = useState("");
  const [editPosition, setEditPosition] = useState("Gestor de Tráfego");
  const [editRole, setEditRole] = useState("outro");
  const [editStatus, setEditStatus] = useState<"ativo" | "inativo">("ativo");
  const [editPermissions, setEditPermissions] = useState<Record<string, string>>({});
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Cadastro de Novo Usuário
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newShowPassword, setNewShowPassword] = useState(true);
  const [newPosition, setNewPosition] = useState("Gestor de Tráfego");
  const [newRole, setNewRole] = useState("gestor_trafego");
  const [newPermissions, setNewPermissions] = useState<Record<string, string>>({});
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [creating, setCreating] = useState(false);

  // Busca lista de todos os usuários
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((u: any) => ({
        ...u,
        avatar_url: resolveUserAvatar(u),
      }));
    },
  });

  const copyToClipboard = (text: string, msg = "Copiado para a área de transferência!") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const copyFullAccessCredentials = (u: any, customEmail?: string, customPass?: string) => {
    const email = (customEmail ?? u?.email) || "";
    const pwd = customPass || u?.permissions?._last_password || "(Senha definida pelo usuário)";
    const text = `🚀 *Acesso NC Performance Suite*\n👤 Usuário: ${u?.full_name || "Membro"}\n📧 Login: ${email}\n🔑 Senha: ${pwd}\n🌐 Acesso: ${window.location.origin}/login`;
    copyToClipboard(text, "Credenciais completas copiadas para envio!");
  };

  // Abrir Modal de Edição
  const handleOpenEdit = (targetUser: any) => {
    setEditingUser(targetUser);
    setEditEmail(targetUser.email || "");
    const saved = targetUser.permissions?._last_password || "";
    setEditPassword(saved);
    setEditShowPassword(true); // Exibe imediatamente para o administrador superior
    setEditName(targetUser.full_name || "");
    setEditPosition(targetUser.position || "Gestor de Tráfego");
    setEditRole(targetUser.role || "outro");
    setEditStatus(targetUser.status === "inativo" ? "inativo" : "ativo");
    setEditPermissions(targetUser.permissions || CARGO_DEFAULT_PERMISSIONS[targetUser.position] || {});
    setEditAvatarUrl(resolveUserAvatar(targetUser) || "");
  };

  // Abrir Modal de Cadastro
  const handleOpenAdd = () => {
    const defaultPosition = allowedAssignable.positions[0] || "Gestor de Tráfego";
    const cargoDef = getCargoDefinition(defaultPosition);
    const defaultRole =
      (cargoDef && allowedAssignable.roles.some((r) => r.value === cargoDef.recommendedRole)
        ? cargoDef.recommendedRole
        : allowedAssignable.roles[0]?.value) || "outro";
    setNewName("");
    setNewEmail("");
    setNewPassword(generateStrongPassword());
    setNewShowPassword(true);
    setNewPosition(defaultPosition);
    setNewRole(defaultRole);
    setNewPermissions(cargoDef?.defaultPermissions || CARGO_DEFAULT_PERMISSIONS[defaultPosition] || {});
    setNewAvatarUrl("");
    setShowAddModal(true);
  };

  // Salvar Edição
  const handleSaveEdit = async () => {
    if (!editingUser) return;
    if (!editEmail.trim()) {
      toast.error("O e-mail/login não pode ficar em branco.");
      return;
    }
    if (editPassword && editPassword.trim().length < 6) {
      toast.error("A nova senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setSavingEdit(true);
    try {
      const res = await updateSystemUser({
        targetUserId: editingUser.id,
        newEmail: editEmail.trim(),
        newPassword: editPassword.trim() || undefined,
        newName: editName.trim(),
        newPosition: editPosition,
        newRole: editRole,
        newPermissions: editPermissions,
        status: editStatus,
        avatarUrl: editAvatarUrl || null,
      });

      if (!res.success) {
        throw new Error(res.error || "Erro ao atualizar usuário");
      }

      toast.success(res.message || "Usuário e credenciais atualizados com sucesso!");
      setEditingUser(null);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      qc.invalidateQueries({ queryKey: ["team_avatars_directory"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao salvar alterações");
    } finally {
      setSavingEdit(false);
    }
  };

  // Cadastrar Novo Usuário
  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      toast.error("Preencha nome completo, e-mail e senha.");
      return;
    }
    if (newPassword.trim().length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }

    setCreating(true);
    try {
      const res = await createSystemUser({
        fullName: newName.trim(),
        email: newEmail.trim(),
        password: newPassword.trim(),
        position: newPosition,
        role: newRole,
        permissions: newPermissions,
        status: "ativo",
        avatarUrl: newAvatarUrl || null,
      });

      if (!res.success) {
        throw new Error(res.error || "Erro ao criar novo colaborador");
      }

      toast.success("Colaborador criado com sucesso!");
      setShowAddModal(false);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
      qc.invalidateQueries({ queryKey: ["team_avatars_directory"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao cadastrar usuário");
    } finally {
      setCreating(false);
    }
  };

  // Toggle de Suspensão
  const handleToggleStatus = async (targetUser: any) => {
    const isInactive = targetUser.status === "inativo";
    const nextStatus = isInactive ? "ativo" : "inativo";
    const confirmMsg = isInactive
      ? `Reativar o acesso de ${targetUser.full_name || targetUser.email}?`
      : `Suspender o acesso de ${targetUser.full_name || targetUser.email}? O usuário não conseguirá entrar na plataforma.`;

    if (!confirm(confirmMsg)) return;

    try {
      const res = await toggleUserStatus(targetUser.id, nextStatus);
      if (!res.success) throw new Error(res.error || "Erro ao alternar status");
      toast.success(res.message || "Status atualizado com sucesso!");
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao alterar status");
    }
  };

  // Excluir Usuário
  const handleDelete = async (targetUser: any) => {
    if (!confirm(`TEM CERTEZA que deseja excluir definitivamente ${targetUser.full_name || targetUser.email}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const res = await deleteSystemUser(targetUser.id);
      if (!res.success) throw new Error(res.error || "Erro ao excluir usuário");
      toast.success(res.message || "Usuário excluído.");
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao excluir usuário");
    }
  };

  // Alterar permissão rápida diretamente pelo card
  const handleQuickPermissionChange = async (targetUser: any, moduleKey: string, newLevel: string) => {
    const currentPermissions = { ...(targetUser.permissions || {}) };
    currentPermissions[moduleKey] = newLevel;

    try {
      await supabase.from("profiles").update({
        permissions: currentPermissions,
        updated_at: new Date().toISOString(),
      }).eq("id", targetUser.id);

      try {
        await (supabase as any).rpc("admin_set_user_permissions", {
          target_user_id: targetUser.id,
          new_permissions: currentPermissions,
        });
      } catch (e) {
        // RPC fallback
      }

      toast.success(`Permissão atualizada!`);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar permissão");
    }
  };

  // Contagens e Filtros
  const manageableCount = useMemo(() => {
    return users.filter((u: any) => checkHierarchyAuthority(effectiveCaller, u).isSuperior).length;
  }, [users, effectiveCaller]);

  const leadershipCount = useMemo(() => {
    return users.filter((u: any) => {
      const lvl = getUserLevel(u);
      return lvl >= 70 && lvl < 100;
    }).length;
  }, [users]);

  const specialistCount = useMemo(() => {
    return users.filter((u: any) => {
      const lvl = getUserLevel(u);
      return lvl >= 50 && lvl < 70;
    }).length;
  }, [users]);

  const operationalCount = useMemo(() => {
    return users.filter((u: any) => getUserLevel(u) < 50).length;
  }, [users]);

  const filteredUsers = useMemo(() => {
    return users.filter((u: any) => {
      const auth = checkHierarchyAuthority(effectiveCaller, u);
      const lvl = getUserLevel(u);

      if (filterTab === "subordinados" && !auth.isSuperior) return false;
      if (filterTab === "diretoria" && (lvl < 70 || lvl >= 100)) return false;
      if (filterTab === "gestores" && (lvl < 50 || lvl >= 70)) return false;
      if (filterTab === "operacao" && lvl >= 50) return false;
      if (filterTab === "inativos" && u.status !== "inativo") return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (u.full_name || "").toLowerCase().includes(q);
        const matchesEmail = (u.email || "").toLowerCase().includes(q);
        const matchesPos = (u.position || "").toLowerCase().includes(q);
        return matchesName || matchesEmail || matchesPos;
      }
      return true;
    });
  }, [users, filterTab, search, effectiveCaller]);

  return (
    <div className="space-y-6">
      {/* ── SUB-NAVEGAÇÃO: COLABORADORES vs PIXEL DE MONITORAMENTO ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="inline-flex rounded-2xl border border-white/10 bg-black/30 p-1 gap-1">
          <button
            type="button"
            onClick={() => setSubView("colaboradores")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
              subView === "colaboradores"
                ? "bg-primary text-primary-foreground shadow-glow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Colaboradores & Acessos
          </button>
          <button
            type="button"
            onClick={() => setSubView("pixel")}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-wider transition ${
              subView === "pixel"
                ? "bg-emerald-500 text-slate-950 shadow-glow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-current animate-pulse" />
            Pixel de Presença & Fluxo
          </button>
        </div>
      </div>

      {subView === "pixel" ? (
        <TeamActivityMonitor />
      ) : (
        <>
      {/* ── CARD DE AUTORIDADE SUPERIOR ── */}
      <div className="glass-panel p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">
                Gestão Hierárquica de Credenciais & Membros
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Superiores têm acesso ao e-mail, senhas geradas, permissões por módulo e alteração de credenciais.
              </p>
            </div>
          </div>

          <button
            onClick={handleOpenAdd}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 shrink-0"
          >
            <Plus className="h-4 w-4" /> Novo Colaborador
          </button>
        </div>

        {/* Métricas Rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 border-t border-white/5">
          <div className="rounded-xl border border-white/5 bg-black/20 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Equipe</p>
              <p className="text-lg font-black text-foreground">{users.length}</p>
            </div>
            <User className="h-4 w-4 text-muted-foreground/40" />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Subordinados</p>
              <p className="text-lg font-black text-primary">{manageableCount}</p>
            </div>
            <UserCheck className="h-4 w-4 text-primary" />
          </div>

          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-purple-300">Diretoria & Gerência</p>
              <p className="text-lg font-black text-purple-300">{leadershipCount}</p>
            </div>
            <Award className="h-4 w-4 text-purple-400" />
          </div>

          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-300">Gestores & Devs</p>
              <p className="text-lg font-black text-blue-300">{specialistCount}</p>
            </div>
            <Briefcase className="h-4 w-4 text-blue-400" />
          </div>
        </div>
      </div>

      {/* ── BARRA DE PESQUISA, FILTROS & VISUALIZAÇÃO GLOBAL DE SENHAS ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
          {[
            { id: "todos", label: "Todos", count: users.length },
            { id: "subordinados", label: "Meus Subordinados", count: manageableCount },
            { id: "diretoria", label: "Diretoria & Gerência", count: leadershipCount },
            { id: "gestores", label: "Gestores", count: specialistCount },
            { id: "operacao", label: "Operação", count: operationalCount },
            { id: "inativos", label: "Suspensos", count: users.filter((u: any) => u.status === "inativo").length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterTab(tab.id as any)}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
                filterTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[9px] font-mono px-1 rounded ${filterTab === tab.id ? "bg-black/30 text-white" : "bg-white/10 text-muted-foreground"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          {/* Botão de Revelação de Senhas para Superiores */}
          <button
            type="button"
            onClick={() => setShowAllPasswords((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold transition whitespace-nowrap shrink-0 ${
              showAllPasswords
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-glow-sm"
                : "bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10 hover:text-foreground"
            }`}
            title={showAllPasswords ? "Ocultar todas as senhas da listagem" : "Mostrar senhas de todos os colaboradores gerenciáveis"}
          >
            {showAllPasswords ? <EyeOff className="h-3.5 w-3.5 text-amber-400" /> : <Eye className="h-3.5 w-3.5" />}
            <span>{showAllPasswords ? "Ocultar Senhas" : "Ver Senhas Salvas"}</span>
          </button>

          <div className="relative w-full sm:w-64 shrink-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome, email ou cargo..."
              className="w-full rounded-xl border border-white/10 bg-background/50 pl-3 pr-8 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── LISTA DE CARDS DE USUÁRIOS ── */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-white/10 p-12 text-center space-y-2">
          <User className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-bold text-foreground">Nenhum membro encontrado</p>
          <p className="text-xs text-muted-foreground">Ajuste o termo de busca ou alterne a aba do filtro.</p>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {filteredUsers.map((u: any) => {
            const targetInfo = getHierarchyInfo(u);
            const authCheck = checkHierarchyAuthority(effectiveCaller, u);
            const isSelf = callerUser?.id === u.id;
            const isInactive = u.status === "inativo";
            const savedPassword = u.permissions?._last_password;
            const isRevealed = !!revealedPasswords[u.id];

            return (
              <div
                key={u.id}
                className={`relative rounded-3xl border p-5 transition-all duration-300 space-y-4 ${
                  targetInfo.level === 100
                    ? "border-amber-500/35 bg-gradient-to-b from-amber-500/[0.04] to-background shadow-lg shadow-amber-500/5"
                    : authCheck.isSuperior
                    ? "border-white/10 bg-background/60 hover:border-primary/40 shadow-sm hover:shadow-glow/5"
                    : "border-white/5 bg-background/30 opacity-90"
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <UserAvatar
                      src={u.avatar_url}
                      name={u.full_name}
                      email={u.email}
                      size="lg"
                      rounded="2xl"
                      onlineStatus={
                        isInactive
                          ? "inactive"
                          : isUserOnlineNow(u.last_seen_at, u.status)
                          ? "online"
                          : null
                      }
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-foreground truncate">
                          {u.full_name || "Membro Sem Nome"}
                        </h4>
                        {isSelf && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                            Você
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider border ${
                            isInactive
                              ? "bg-red-500/10 text-red-400 border-red-500/20"
                              : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                          }`}
                        >
                          {isInactive ? "SUSPENSO" : "ATIVO"}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground mt-0.5 truncate font-medium">
                        {u.position || "Sem cargo"}
                      </p>
                    </div>
                  </div>

                  {/* Patente Badge */}
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${targetInfo.badgeBg} ${targetInfo.badgeBorder} ${targetInfo.badgeText}`}>
                      {renderRankIcon(targetInfo.iconName, "h-3 w-3")}
                      {targetInfo.shortLabel}
                    </span>
                    <p className="text-[9px] font-mono text-muted-foreground/60 mt-0.5">
                      Nível {targetInfo.level}
                    </p>
                  </div>
                </div>

                {/* ── SEÇÃO DE CREDENCIAIS (LOGIN & SENHA) ── */}
                <div className="rounded-2xl border border-border dark:border-white/5 bg-muted/40 dark:bg-black/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                      <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="font-bold uppercase tracking-wider text-[9px] shrink-0">Login / E-mail:</span>
                      <span className="font-mono text-foreground truncate">{u.email || "Sem e-mail"}</span>
                    </div>
                    {u.email && (
                      <button
                        onClick={() => copyToClipboard(u.email, "E-mail de login copiado!")}
                        className="text-muted-foreground hover:text-primary transition p-1 shrink-0"
                        title="Copiar login"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Senha Criada / Atual visível para superiores */}
                  <div className="flex items-center justify-between text-[11px] border-t border-border dark:border-white/5 pt-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                      <Key className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
                      <span className="font-bold uppercase tracking-wider text-[9px] shrink-0">Senha:</span>
                      {authCheck.isSuperior || (isSelf && isCallerMaster) ? (
                        savedPassword ? (
                          <span className="font-mono font-bold text-foreground truncate">
                            {(isRevealed || showAllPasswords) ? savedPassword : "••••••••••••"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 italic truncate">
                            Definida pelo usuário / Criptografada
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40 italic truncate">
                          Protegida pela Hierarquia
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {savedPassword && (authCheck.isSuperior || (isSelf && isCallerMaster)) && (
                        <>
                          <button
                            onClick={() => togglePasswordReveal(u.id)}
                            className="text-muted-foreground hover:text-foreground transition p-1"
                            title={(isRevealed || showAllPasswords) ? "Ocultar senha" : "Ver senha"}
                          >
                            {(isRevealed || showAllPasswords) ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(savedPassword, "Senha copiada!")}
                            className="text-muted-foreground hover:text-amber-500 dark:hover:text-amber-400 transition p-1"
                            title="Copiar senha"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </>
                      )}

                      {u.email && (authCheck.isSuperior || (isSelf && isCallerMaster)) && (
                        <button
                          onClick={() => copyFullAccessCredentials(u)}
                          className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-primary hover:bg-primary/15 bg-primary/10 border border-primary/25 px-2.5 py-1 rounded-lg transition ml-1"
                          title="Copiar dados de acesso completos para enviar ao membro"
                        >
                          <Share2 className="h-3 w-3" />
                          <span>Copiar Acesso</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Relação Hierárquica */}
                <div className="flex items-center justify-between text-[10px] text-muted-foreground px-1">
                  <div>
                    {targetInfo.level === 100 ? (
                      <span className="flex items-center gap-1 font-bold text-amber-400">
                        <Crown className="h-3 w-3" /> Administrador Master — Proteção Absoluta
                      </span>
                    ) : isSelf ? (
                      <span className="flex items-center gap-1 font-bold text-primary">
                        <UserCheck className="h-3 w-3" /> Seu próprio perfil
                      </span>
                    ) : authCheck.isSuperior ? (
                      <span className="flex items-center gap-1 font-bold text-emerald-400">
                        <Check className="h-3 w-3" /> Subordinado direto (Acesso liberado para edição)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-muted-foreground/50">
                        <Lock className="h-3 w-3" /> Protegido por hierarquia superior
                      </span>
                    )}
                  </div>
                </div>

                {/* ── PERMISSÕES ESTRUTURADAS POR HUB DA PLATAFORMA ── */}
                {targetInfo.level < 90 && (
                  <div className="space-y-3 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">
                        Permissões por HUB da Plataforma
                      </span>
                      {authCheck.canEditPermissions && (
                        <span className="text-[9px] text-primary font-bold">
                          Alteração rápida liberada
                        </span>
                      )}
                    </div>

                    <div className="space-y-2">
                      {HUBS_DEFINITIONS.map((hub) => {
                        const hubModules = PERMISSION_MODULES.filter((m) => m.hub === hub.id);
                        return (
                          <div key={hub.id} className="rounded-2xl border border-white/5 bg-black/25 p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${hub.colorBadge}`}>
                                {hub.label}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                              {hubModules.map((m) => {
                                const level = u.permissions?.[m.key] || "none";
                                const canChange = authCheck.canEditPermissions;

                                if (m.mode === "read_only") {
                                  const isView = level === "view" || level === "edit";
                                  return (
                                    <div
                                      key={m.key}
                                      className="flex flex-col gap-0.5 bg-white/[0.02] border border-white/5 rounded-xl p-2"
                                    >
                                      <div className="flex items-center justify-between">
                                        <span className="text-[9px] font-bold text-muted-foreground truncate" title={m.description}>
                                          {m.label}
                                        </span>
                                        <span className="text-[8px] font-mono text-muted-foreground/40">Visualização</span>
                                      </div>
                                      {canChange ? (
                                        <div className="relative">
                                          <select
                                            value={isView ? "view" : "none"}
                                            onChange={(e) => handleQuickPermissionChange(u, m.key, e.target.value)}
                                            className={`w-full bg-transparent text-[10px] font-black uppercase focus:outline-none cursor-pointer border-none p-0 pr-3 truncate ${
                                              isView ? "text-blue-400" : "text-muted-foreground/40"
                                            }`}
                                          >
                                            <option value="none" className="bg-card text-muted-foreground">Bloqueado</option>
                                            <option value="view" className="bg-card text-blue-400">Liberado (Visualizar)</option>
                                          </select>
                                          <ChevronDown className="h-2.5 w-2.5 text-muted-foreground absolute right-0 top-1 pointer-events-none opacity-40" />
                                        </div>
                                      ) : (
                                        <span className={`text-[10px] font-black uppercase ${isView ? "text-blue-400" : "text-muted-foreground/40"}`}>
                                          {isView ? "Liberado" : "Bloqueado"}
                                        </span>
                                      )}
                                    </div>
                                  );
                                }

                                const isEdit = level === "edit";
                                const isView = level === "view";

                                return (
                                  <div
                                    key={m.key}
                                    className="flex flex-col gap-0.5 bg-white/[0.02] border border-white/5 rounded-xl p-2"
                                  >
                                    <span className="text-[9px] font-bold text-muted-foreground truncate" title={m.description}>
                                      {m.label}
                                    </span>
                                    {canChange ? (
                                      <div className="relative">
                                        <select
                                          value={level}
                                          onChange={(e) => handleQuickPermissionChange(u, m.key, e.target.value)}
                                          className={`w-full bg-transparent text-[10px] font-black uppercase focus:outline-none cursor-pointer border-none p-0 pr-3 truncate ${
                                            isEdit
                                              ? "text-primary"
                                              : isView
                                              ? "text-blue-400"
                                              : "text-muted-foreground/40"
                                          }`}
                                        >
                                          <option value="none" className="bg-card text-muted-foreground">Bloqueado</option>
                                          <option value="view" className="bg-card text-blue-400">Leitura</option>
                                          <option value="edit" className="bg-card text-primary">Escrita</option>
                                        </select>
                                        <ChevronDown className="h-2.5 w-2.5 text-muted-foreground absolute right-0 top-1 pointer-events-none opacity-40" />
                                      </div>
                                    ) : (
                                      <span
                                        className={`text-[10px] font-black uppercase ${
                                          isEdit
                                            ? "text-primary"
                                            : isView
                                            ? "text-blue-400"
                                            : "text-muted-foreground/40"
                                        }`}
                                      >
                                        {isEdit ? "Escrita" : isView ? "Leitura" : "Bloqueado"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── BOTÕES DE AÇÃO HIERÁRQUICOS ── */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    {authCheck.isSuperior && (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition ${
                          isInactive
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                        }`}
                      >
                        {isInactive ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                        <span>{isInactive ? "Reativar" : "Suspender"}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {authCheck.isSuperior || (isSelf && isCallerMaster) ? (
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition shadow-sm"
                      >
                        <Key className="h-3.5 w-3.5" />
                        <span>Editar Login / Senha</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider px-2 py-1">
                        <Lock className="h-3 w-3" /> Protegido
                      </span>
                    )}

                    {authCheck.canDelete && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-2 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/20 transition"
                        title="Excluir colaborador"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </>
      )}

      {/* ── MODAL: EDITAR LOGIN / SENHA & ACESSOS (RESPONSIVO E ANTI-CORTE) ── */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {editingUser && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 dark:bg-black/85 backdrop-blur-md p-3 sm:p-6"
              >
                <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
                  <motion.div
                    initial={{ scale: 0.96, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 12 }}
                    className="relative w-full max-w-2xl bg-card border border-border dark:border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto"
                  >
                    {/* Cabeçalho Fixo do Modal */}
                    <div className="shrink-0 flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-border dark:border-white/10 bg-background/95 dark:bg-background/80 backdrop-blur-md">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Key className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-display text-base font-bold text-foreground">
                            Gerenciar Credenciais & Acessos
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Editando colaborador: <strong className="text-foreground">{editingUser.full_name || editingUser.email}</strong>
                          </p>
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCheck className="h-3 w-3" /> Alteração imediata — sem envio de e-mail de confirmação
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            copyFullAccessCredentials(
                              { ...editingUser, full_name: editName || editingUser.full_name },
                              editEmail || editingUser.email,
                              editPassword || editingUser.permissions?._last_password
                            )
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/25 px-3 py-2 text-[11px] font-black uppercase tracking-wider text-primary transition"
                          title="Copiar Login + Senha + Link de acesso prontos para enviar no WhatsApp"
                        >
                          <Share2 className="h-3.5 w-3.5" />
                          <span>Copiar Acesso p/ Envio</span>
                        </button>
                        <button
                          onClick={() => setEditingUser(null)}
                          className="rounded-xl p-2 text-muted-foreground hover:bg-muted dark:hover:bg-white/10 hover:text-foreground transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Corpo do Modal com Scroll Interno Suave */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5">
                      {/* ── 1. CARD: SENHA SALVA ATUAL DO COLABORADOR ── */}
                      {editingUser.permissions?._last_password ? (
                        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] p-4 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2">
                              <Key className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                              <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                                Senha Salva Atualmente
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[9px] font-mono text-amber-800 dark:text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full border border-amber-500/30 font-bold">
                                Visível para Superiores
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyFullAccessCredentials(
                                    { ...editingUser, full_name: editName || editingUser.full_name },
                                    editEmail || editingUser.email,
                                    editPassword || editingUser.permissions?._last_password
                                  )
                                }
                                className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-primary hover:underline"
                              >
                                <Share2 className="h-3 w-3" /> Copiar Acesso Completo
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center justify-between gap-3 bg-muted/60 dark:bg-black/50 rounded-xl p-3 border border-border dark:border-white/10">
                            <span className="font-mono text-sm font-bold text-foreground tracking-wider">
                              {editShowPassword ? (editPassword || editingUser.permissions._last_password) : "••••••••••••"}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setEditShowPassword(!editShowPassword)}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted dark:hover:bg-white/5 transition"
                                title={editShowPassword ? "Ocultar senha" : "Ver senha"}
                              >
                                {editShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(editingUser.permissions._last_password, "Senha salva copiada!")}
                                className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 dark:hover:text-amber-400 hover:bg-muted dark:hover:bg-white/5 transition"
                                title="Copiar senha salva"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] p-3 text-xs text-muted-foreground flex items-center gap-2.5">
                          <Key className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0" />
                          <p>
                            Este colaborador ainda não possui senha de visualização direta gravada. Digite ou gere uma senha abaixo para atualizar.
                          </p>
                        </div>
                      )}

                      {/* ── 2. FOTO & CREDENCIAIS ── */}
                      <div className="space-y-3 rounded-2xl border border-border dark:border-white/10 bg-muted/20 dark:bg-white/[0.02] p-4">
                        <AvatarUpload
                          value={editAvatarUrl}
                          onChange={setEditAvatarUrl}
                          userId={editingUser?.id}
                          label="Foto de Perfil do Colaborador (Visível para toda a equipe)"
                          size="md"
                        />

                        <div className="space-y-1.5">
                          <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                            Nome Completo
                          </label>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Nome completo do colaborador"
                            className="w-full rounded-xl border border-border dark:border-white/10 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-between">
                            <span>E-mail / Login de Acesso</span>
                            <span className="text-[9px] text-primary font-bold">Editável</span>
                          </label>
                          <input
                            type="email"
                            value={editEmail}
                            onChange={(e) => setEditEmail(e.target.value)}
                            placeholder="colaborador@empresa.com"
                            className="w-full rounded-xl border border-border dark:border-white/10 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                              Senha de Acesso
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const pwd = generateStrongPassword();
                                  setEditPassword(pwd);
                                  setEditShowPassword(true);
                                  copyToClipboard(pwd, "Nova senha forte gerada e copiada!");
                                }}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                              >
                                <Sparkles className="h-3 w-3" /> Gerar Senha Forte
                              </button>
                              {editPassword && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(editPassword, "Senha copiada!")}
                                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  <Copy className="h-3 w-3" /> Copiar
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type={editShowPassword ? "text" : "password"}
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              placeholder="Digite para alterar ou mantenha a atual"
                              className="w-full rounded-xl border border-border dark:border-white/10 bg-background pl-3.5 pr-10 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setEditShowPassword(!editShowPassword)}
                              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                            >
                              {editShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* ── 3 & 4. CARGO vs PATENTE HIERÁRQUICA + PERMISSÕES DIDÁTICAS ── */}
                      <DidacticUserAccessEditor
                        position={editPosition}
                        onPositionChange={setEditPosition}
                        role={editRole}
                        onRoleChange={setEditRole}
                        permissions={editPermissions}
                        onPermissionsChange={setEditPermissions}
                        allowedRoles={allowedAssignable.roles}
                        allowedPositions={allowedAssignable.positions}
                        autoApplyCargoDefaults={false}
                      />
                    </div>

                    {/* Rodapé Fixo do Modal (Sempre Acessível) */}
                    <div className="shrink-0 flex items-center justify-between gap-3 p-4 sm:p-5 border-t border-border dark:border-white/10 bg-background/95 dark:bg-background/90 backdrop-blur-md">
                      <button
                        type="button"
                        onClick={() =>
                          copyFullAccessCredentials(
                            { ...editingUser, full_name: editName || editingUser.full_name },
                            editEmail || editingUser.email,
                            editPassword || editingUser.permissions?._last_password
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 text-xs font-bold text-primary transition"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Copiar Acesso p/ Envio</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingUser(null)}
                          className="rounded-xl border border-border dark:border-white/10 px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted dark:hover:bg-white/5 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveEdit}
                          disabled={savingEdit}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 disabled:opacity-50"
                        >
                          {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          <span>Salvar Credenciais & Acessos</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* ── MODAL: CADASTRAR NOVO COLABORADOR (RESPONSIVO E ANTI-CORTE) ── */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {showAddModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/60 dark:bg-black/85 backdrop-blur-md p-3 sm:p-6"
              >
                <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
                  <motion.div
                    initial={{ scale: 0.96, opacity: 0, y: 12 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.96, opacity: 0, y: 12 }}
                    className="relative w-full max-w-2xl bg-card border border-border dark:border-white/15 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh] my-auto"
                  >
                    {/* Cabeçalho Fixo */}
                    <div className="shrink-0 flex items-start justify-between gap-3 p-5 sm:p-6 border-b border-border dark:border-white/10 bg-background/95 dark:bg-background/80 backdrop-blur-md">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Plus className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="font-display text-base font-bold text-foreground">
                            Cadastrar Novo Colaborador
                          </h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Crie o login, senha inicial e defina as permissões por HUB da plataforma.
                          </p>
                          <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            <CheckCheck className="h-3 w-3" /> Ativação imediata — nenhum e-mail de confirmação é enviado
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowAddModal(false)}
                        className="rounded-xl p-2 text-muted-foreground hover:bg-muted dark:hover:bg-white/10 hover:text-foreground transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Corpo do Formulário com Scroll Interno */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-6 space-y-5">
                      <div className="space-y-3 rounded-2xl border border-border dark:border-white/10 bg-muted/20 dark:bg-white/[0.02] p-4">
                        <div className="space-y-1.5">
                          <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                            Nome Completo *
                          </label>
                          <input
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            placeholder="Ex: Carlos Eduardo"
                            className="w-full rounded-xl border border-border dark:border-white/10 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                            E-mail de Login *
                          </label>
                          <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="carlos@ncperformance.com.br"
                            className="w-full rounded-xl border border-border dark:border-white/10 bg-background px-3.5 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                              Senha Inicial *
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  const pwd = generateStrongPassword();
                                  setNewPassword(pwd);
                                  setNewShowPassword(true);
                                  copyToClipboard(pwd, "Senha gerada e copiada!");
                                }}
                                className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1"
                              >
                                <Sparkles className="h-3 w-3" /> Gerar Forte
                              </button>
                              {newPassword && (
                                <button
                                  type="button"
                                  onClick={() => copyToClipboard(newPassword, "Senha copiada!")}
                                  className="text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1"
                                >
                                  <Copy className="h-3 w-3" /> Copiar
                                </button>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type={newShowPassword ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              placeholder="Senha do usuário (mínimo 6 dígitos)"
                              className="w-full rounded-xl border border-border dark:border-white/10 bg-background pl-3.5 pr-10 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setNewShowPassword(!newShowPassword)}
                              className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                            >
                              {newShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <DidacticUserAccessEditor
                        position={newPosition}
                        onPositionChange={setNewPosition}
                        role={newRole}
                        onRoleChange={setNewRole}
                        permissions={newPermissions}
                        onPermissionsChange={setNewPermissions}
                        allowedRoles={allowedAssignable.roles}
                        allowedPositions={allowedAssignable.positions}
                        autoApplyCargoDefaults={true}
                      />
                    </div>

                    {/* Rodapé Fixo */}
                    <div className="shrink-0 flex items-center justify-between gap-3 p-4 sm:p-5 border-t border-border dark:border-white/10 bg-background/95 dark:bg-background/90 backdrop-blur-md">
                      <button
                        type="button"
                        onClick={() =>
                          copyFullAccessCredentials(
                            { full_name: newName || "Novo Colaborador" },
                            newEmail,
                            newPassword
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 hover:bg-primary/20 px-3.5 py-2 text-xs font-bold text-primary transition"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        <span>Copiar Acesso p/ Envio</span>
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowAddModal(false)}
                          className="rounded-xl border border-border dark:border-white/10 px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted dark:hover:bg-white/5 transition"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateUser}
                          disabled={creating}
                          className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 disabled:opacity-50"
                        >
                          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          <span>Criar Colaborador</span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
