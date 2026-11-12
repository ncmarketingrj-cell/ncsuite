import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, Shield, ShieldCheck, Crown, Star, Award, Target, Briefcase, Palette,
  Phone, Lock, Key, Copy, Check, Eye, EyeOff, Plus, Trash2, Search, X, Loader2,
  ArrowRight, Settings, AlertTriangle, ExternalLink, RefreshCw, Sparkles, UserCheck,
  UserX, MessageSquareWarning, Zap, CheckCheck, HelpCircle, Mail, ChevronDown
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { AvatarUpload } from "@/components/AvatarUpload";
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
  MASTER_ADMIN_EMAILS,
} from "@/lib/userHierarchy";
import {
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  toggleUserStatus,
} from "@/lib/userService";

export const Route = createFileRoute("/_app/perfil")({
  head: () => ({ meta: [{ title: "Meu Perfil & Membros — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: ProfileRoutePage,
});

// ──────────────────────────────────────────────────────────────────────────────
// Constantes de Módulos & Cargos
// ──────────────────────────────────────────────────────────────────────────────
export const PERMISSION_MODULES = [
  { key: "dashboard", label: "Command Center", description: "Painel executivo com gráficos e metas" },
  { key: "metricas", label: "Métricas", description: "Tabelas analíticas de campanhas e anúncios" },
  { key: "clientes", label: "Clientes", description: "Lojas, ad accounts e acessos a clientes" },
  { key: "relatorios", label: "Relatórios", description: "Geração e exportação de relatórios em PDF" },
  { key: "criativos", label: "Criativos", description: "Biblioteca de criativos e ranking de mídia" },
  { key: "social", label: "Social Media", description: "Planejador de feed, posts e insights do Instagram" },
  { key: "automacoes", label: "Automações", description: "Central de alertas sonoros e regras inteligentes" },
  { key: "reunioes", label: "Reuniões", description: "Agendamentos, pautas e atas de reuniões" },
  { key: "cobrancas", label: "Cobranças", description: "Faturas, links de cobrança e snapshots" },
  { key: "strategy_map", label: "Mapa Estratégico", description: "Mapas mentais de funil e jornadas de venda" },
  { key: "agente", label: "Agente IA", description: "Victoria AI, diagnósticos e chat estratégico" },
  { key: "auditoria", label: "Auditoria Hub", description: "Logs de auditoria e integridade do motor" },
  { key: "criar_usuarios", label: "Gestão Usuários", description: "Cadastro e alteração de credenciais da equipe" },
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
    dashboard: "edit", metricas: "edit", clientes: "view", relatorios: "edit",
    criativos: "edit", social: "none", automacoes: "edit", reunioes: "none",
    cobrancas: "none", strategy_map: "edit", agente: "edit", auditoria: "none",
    criar_usuarios: "none",
  },
  "Social Media": {
    dashboard: "view", metricas: "none", clientes: "view", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "none", reunioes: "none",
    cobrancas: "none", strategy_map: "edit", agente: "view", auditoria: "none",
    criar_usuarios: "none",
  },
  "Gerente": {
    dashboard: "edit", metricas: "edit", clientes: "edit", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "view", reunioes: "edit",
    cobrancas: "none", strategy_map: "edit", agente: "edit", auditoria: "none",
    criar_usuarios: "view",
  },
  "Diretor": {
    dashboard: "edit", metricas: "edit", clientes: "edit", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "edit", reunioes: "edit",
    cobrancas: "edit", strategy_map: "edit", agente: "edit", auditoria: "edit",
    criar_usuarios: "edit",
  },
  "CEO": {
    dashboard: "edit", metricas: "edit", clientes: "edit", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "edit", reunioes: "edit",
    cobrancas: "edit", strategy_map: "edit", agente: "edit", auditoria: "edit",
    criar_usuarios: "edit",
  },
  "Administrador": {
    dashboard: "edit", metricas: "edit", clientes: "edit", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "edit", reunioes: "edit",
    cobrancas: "edit", strategy_map: "edit", agente: "edit", auditoria: "edit",
    criar_usuarios: "edit",
  },
  "Desenvolvedor": {
    dashboard: "edit", metricas: "edit", clientes: "edit", relatorios: "edit",
    criativos: "edit", social: "edit", automacoes: "edit", reunioes: "edit",
    cobrancas: "edit", strategy_map: "edit", agente: "edit", auditoria: "edit",
    criar_usuarios: "edit",
  },
  "Designer": {
    dashboard: "view", metricas: "none", clientes: "view", relatorios: "none",
    criativos: "edit", social: "view", automacoes: "none", reunioes: "none",
    cobrancas: "none", strategy_map: "edit", agente: "view", auditoria: "none",
    criar_usuarios: "none",
  },
  "SDR": {
    dashboard: "view", metricas: "none", clientes: "view", relatorios: "none",
    criativos: "none", social: "none", automacoes: "none", reunioes: "edit",
    cobrancas: "none", strategy_map: "none", agente: "view", auditoria: "none",
    criar_usuarios: "none",
  },
  "Outros": {
    dashboard: "view", metricas: "none", clientes: "none", relatorios: "none",
    criativos: "none", social: "none", automacoes: "none", reunioes: "none",
    cobrancas: "none", strategy_map: "none", agente: "none", auditoria: "none",
    criar_usuarios: "none",
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
  const search = Route.useSearch() as { tab?: string };
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();

  // Perfil do usuário atual logado
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
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
  const isAdmin = profile?.role === "admin" || (user?.email ? MASTER_ADMIN_EMAILS.includes(user.email) : false);
  const isStaff = isAdmin || profile?.role === "staff" || /gestor|director|diretor|staff|sócio|socio|dono|ceo/i.test(profile?.position || "");
  const canManageUsers = isCallerMaster || callerLevel >= 70 || isAdmin || !!profile?.permissions?.criar_usuarios;
  const canAccessConfig = isCallerMaster || callerLevel >= 70 || isAdmin || isStaff;

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
      setAvatarUrl(profile.avatar_url || "");
      setWhatsappNumbers(profile.whatsapp_numbers || []);
    }
  }, [profile]);

  // Salvar perfil
  const handleSaveProfile = async () => {
    if (!user?.id) return;
    setSavingProfile(true);
    try {
      const cleanPhones = whatsappNumbers.map(p => p.trim()).filter(Boolean);
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName.trim(),
        position,
        avatar_url: avatarUrl,
        whatsapp_numbers: cleanPhones,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;

      await supabase.auth.updateUser({
        data: { full_name: fullName.trim(), position, avatar_url: avatarUrl }
      });

      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      toast.success("Perfil profissional salvo com sucesso!");
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
      const { error } = await supabase.auth.updateUser({
        password: newPassword.trim(),
      });
      if (error) throw error;

      // Salva nota em permissions._last_password para permitir visualização
      const existingPerms = profile?.permissions || {};
      await supabase.from("profiles").update({
        permissions: {
          ...existingPerms,
          _last_password: newPassword.trim(),
        },
        updated_at: new Date().toISOString(),
      }).eq("id", user.id);

      toast.success("Sua senha foi alterada com sucesso!");
      setNewPassword("");
      setConfirmPassword("");
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
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
          Abaixo estão os 13 módulos operacionais da NC Suite e o seu nível de acesso ativo no momento.
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
}: {
  callerUser: any;
  callerProfile: any;
  effectiveCaller: any;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"todos" | "subordinados" | "diretoria" | "gerencia" | "gestores" | "operacao" | "inativos">("todos");

  // Revelação de senhas geradas
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

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
  const [editShowPassword, setEditShowPassword] = useState(false);
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
  const [newShowPassword, setNewShowPassword] = useState(false);
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
      return (data ?? []) as any[];
    },
  });

  const copyToClipboard = (text: string, msg = "Copiado para a área de transferência!") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const copyFullAccessCredentials = (u: any) => {
    const email = u.email || "";
    const pwd = u.permissions?._last_password || "(Senha definida pelo usuário)";
    const text = `*NC Suite — Credenciais de Acesso*\n👤 Usuário: ${u.full_name || "Membro"}\n📧 Login: ${email}\n🔑 Senha: ${pwd}\n🌐 Acesso: https://ncsuite.lovable.app/login`;
    copyToClipboard(text, "Credenciais completas copiadas para envio!");
  };

  // Abrir Modal de Edição
  const handleOpenEdit = (targetUser: any) => {
    setEditingUser(targetUser);
    setEditEmail(targetUser.email || "");
    setEditPassword(targetUser.permissions?._last_password || "");
    setEditShowPassword(false);
    setEditName(targetUser.full_name || "");
    setEditPosition(targetUser.position || "Gestor de Tráfego");
    setEditRole(targetUser.role || "outro");
    setEditStatus(targetUser.status === "inativo" ? "inativo" : "ativo");
    setEditPermissions(targetUser.permissions || CARGO_DEFAULT_PERMISSIONS[targetUser.position] || {});
    setEditAvatarUrl(targetUser.avatar_url || "");
  };

  // Abrir Modal de Cadastro
  const handleOpenAdd = () => {
    const defaultRole = allowedAssignable.roles[0]?.value || "gestor_trafego";
    const defaultPosition = allowedAssignable.positions[0] || "Gestor de Tráfego";
    setNewName("");
    setNewEmail("");
    setNewPassword(generateStrongPassword());
    setNewShowPassword(true);
    setNewPosition(defaultPosition);
    setNewRole(defaultRole);
    setNewPermissions(CARGO_DEFAULT_PERMISSIONS[defaultPosition] || {});
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

      {/* ── BARRA DE PESQUISA & FILTRO HIERÁRQUICO ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
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
                    <div className="relative shrink-0">
                      <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center overflow-hidden shadow-md ${targetInfo.badgeBg} ${targetInfo.badgeBorder}`}>
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.full_name} className="h-full w-full object-cover" />
                        ) : (
                          renderRankIcon(targetInfo.iconName, `h-6 w-6 ${targetInfo.badgeText}`)
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background ${isInactive ? "bg-red-500" : "bg-emerald-500"}`}
                        title={isInactive ? "Suspenso" : "Ativo"}
                      />
                    </div>

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
                <div className="rounded-2xl border border-white/5 bg-black/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      <span className="font-bold uppercase tracking-wider text-[9px]">Login / E-mail:</span>
                      <span className="font-mono text-foreground">{u.email || "Sem e-mail"}</span>
                    </div>
                    {u.email && (
                      <button
                        onClick={() => copyToClipboard(u.email, "E-mail de login copiado!")}
                        className="text-muted-foreground hover:text-primary transition p-1"
                        title="Copiar login"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {/* Senha Criada / Atual visível para superiores */}
                  <div className="flex items-center justify-between text-[11px] border-t border-white/5 pt-2">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Key className="h-3.5 w-3.5 text-amber-400" />
                      <span className="font-bold uppercase tracking-wider text-[9px]">Senha:</span>
                      {authCheck.isSuperior || (isSelf && isCallerMaster) ? (
                        savedPassword ? (
                          <span className="font-mono font-bold text-foreground">
                            {isRevealed ? savedPassword : "••••••••••••"}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/60 italic">
                            Definida pelo usuário / Criptografada
                          </span>
                        )
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40 italic">
                          Protegida pela Hierarquia
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      {savedPassword && (authCheck.isSuperior || (isSelf && isCallerMaster)) && (
                        <>
                          <button
                            onClick={() => togglePasswordReveal(u.id)}
                            className="text-muted-foreground hover:text-foreground transition p-1"
                            title={isRevealed ? "Ocultar senha" : "Ver senha"}
                          >
                            {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          </button>
                          <button
                            onClick={() => copyToClipboard(savedPassword, "Senha copiada!")}
                            className="text-muted-foreground hover:text-amber-400 transition p-1"
                            title="Copiar senha"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        </>
                      )}

                      {u.email && (authCheck.isSuperior || (isSelf && isCallerMaster)) && (
                        <button
                          onClick={() => copyFullAccessCredentials(u)}
                          className="text-[9px] font-bold text-primary hover:underline px-1 transition"
                          title="Copiar dados de acesso completos para enviar ao membro"
                        >
                          Copiar Acesso
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

                {/* ── 13 MÓDULOS DE PERMISSÃO (COMO NA FOTO DO USUÁRIO) ── */}
                {targetInfo.level < 90 && (
                  <div className="space-y-1.5 pt-2 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
                        Permissões por Módulo
                      </span>
                      {authCheck.canEditPermissions && (
                        <span className="text-[9px] text-primary font-bold">
                          Clique para alterar rapidamente
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {PERMISSION_MODULES.map(({ key, label }) => {
                        const level = u.permissions?.[key] || "none";
                        const canChange = authCheck.canEditPermissions;

                        return (
                          <div
                            key={key}
                            className="flex flex-col gap-0.5 bg-white/[0.02] border border-white/5 rounded-xl p-2"
                          >
                            <span className="text-[9px] font-bold text-muted-foreground truncate">{label}</span>
                            {canChange ? (
                              <div className="relative">
                                <select
                                  value={level}
                                  onChange={(e) => handleQuickPermissionChange(u, key, e.target.value)}
                                  className={`w-full bg-transparent text-[10px] font-black uppercase focus:outline-none cursor-pointer border-none p-0 pr-3 truncate ${
                                    level === "edit"
                                      ? "text-primary"
                                      : level === "view"
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
                                  level === "edit"
                                    ? "text-primary"
                                    : level === "view"
                                    ? "text-blue-400"
                                    : "text-muted-foreground/40"
                                }`}
                              >
                                {level === "edit" ? "Escrita" : level === "view" ? "Leitura" : "Bloqueado"}
                              </span>
                            )}
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

      {/* ── MODAL: EDITAR LOGIN / SENHA & ACESSOS ── */}
      <AnimatePresence>
        {editingUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="glass-panel w-full max-w-xl p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar border border-white/15"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Key className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-bold text-foreground">
                      Gerenciar Credenciais & Acessos
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Editando colaborador: <strong className="text-foreground">{editingUser.full_name || editingUser.email}</strong>
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setEditingUser(null)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Fields */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nome Completo
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome completo"
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold flex items-center justify-between">
                    <span>E-mail / Login de Acesso</span>
                    <span className="text-[9px] text-primary font-normal">Pode alterar o e-mail cadastrado</span>
                  </label>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="colaborador@empresa.com"
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
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
                      placeholder="Deixe em branco para manter a atual ou digite nova senha"
                      className="w-full rounded-xl border border-white/10 bg-background/50 pl-3 pr-10 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setEditShowPassword(!editShowPassword)}
                      className="absolute right-3 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {editShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Cargo / Função
                    </label>
                    <select
                      value={editPosition}
                      onChange={(e) => {
                        const pos = e.target.value;
                        setEditPosition(pos);
                        if (CARGO_DEFAULT_PERMISSIONS[pos]) {
                          setEditPermissions(CARGO_DEFAULT_PERMISSIONS[pos]);
                        }
                      }}
                      className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {POSITIONS_LIST.map((p) => (
                        <option key={p} value={p} className="bg-card text-foreground">
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Nível de Acesso (Role)
                    </label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {allowedAssignable.roles.map((r) => (
                        <option key={r.value} value={r.value} className="bg-card text-foreground">
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Presets de Permissões */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Permissões por Módulo (13 Módulos)
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const allEdit: Record<string, string> = {};
                          PERMISSION_MODULES.forEach(m => allEdit[m.key] = "edit");
                          setEditPermissions(allEdit);
                        }}
                        className="text-[9px] font-bold text-primary hover:underline"
                      >
                        Acesso Total
                      </button>
                      <span className="text-white/20">|</span>
                      <button
                        type="button"
                        onClick={() => {
                          const def = CARGO_DEFAULT_PERMISSIONS[editPosition] || {};
                          setEditPermissions(def);
                        }}
                        className="text-[9px] font-bold text-muted-foreground hover:text-foreground"
                      >
                        Padrão do Cargo
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PERMISSION_MODULES.map(({ key, label }) => {
                      const currentVal = editPermissions[key] || "none";
                      return (
                        <div key={key} className="rounded-xl border border-white/5 bg-background/40 p-2 space-y-1">
                          <span className="text-[10px] font-bold text-muted-foreground block truncate">{label}</span>
                          <select
                            value={currentVal}
                            onChange={(e) => setEditPermissions({ ...editPermissions, [key]: e.target.value })}
                            className={`w-full bg-transparent text-[11px] font-black uppercase focus:outline-none border-none p-0 cursor-pointer ${
                              currentVal === "edit"
                                ? "text-primary"
                                : currentVal === "view"
                                ? "text-blue-400"
                                : "text-muted-foreground/40"
                            }`}
                          >
                            <option value="none" className="bg-card text-muted-foreground">Bloqueado</option>
                            <option value="view" className="bg-card text-blue-400">Leitura</option>
                            <option value="edit" className="bg-card text-primary">Escrita</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Botões do Modal */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>Salvar Credenciais & Acessos</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MODAL: CADASTRAR NOVO COLABORADOR ── */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="glass-panel w-full max-w-xl p-6 space-y-5 shadow-2xl overflow-y-auto max-h-[92vh] custom-scrollbar border border-white/15"
            >
              <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                    <Plus className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-base font-bold text-foreground">
                      Cadastrar Novo Colaborador
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Crie o login, senha inicial e defina as permissões por módulo da equipe.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nome Completo *
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Carlos Eduardo"
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
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
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
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
                      className="w-full rounded-xl border border-white/10 bg-background/50 pl-3 pr-10 py-2 text-sm text-foreground focus:border-primary focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setNewShowPassword(!newShowPassword)}
                      className="absolute right-3 top-2 text-muted-foreground hover:text-foreground"
                    >
                      {newShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Cargo / Função
                    </label>
                    <select
                      value={newPosition}
                      onChange={(e) => {
                        const pos = e.target.value;
                        setNewPosition(pos);
                        if (CARGO_DEFAULT_PERMISSIONS[pos]) {
                          setNewPermissions(CARGO_DEFAULT_PERMISSIONS[pos]);
                        }
                      }}
                      className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {POSITIONS_LIST.map((p) => (
                        <option key={p} value={p} className="bg-card text-foreground">
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Nível de Acesso (Role)
                    </label>
                    <select
                      value={newRole}
                      onChange={(e) => setNewRole(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                    >
                      {allowedAssignable.roles.map((r) => (
                        <option key={r.value} value={r.value} className="bg-card text-foreground">
                          {r.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Permissões rápidas */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold block">
                    Permissões por Módulo (13 Módulos)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {PERMISSION_MODULES.map(({ key, label }) => {
                      const currentVal = newPermissions[key] || "none";
                      return (
                        <div key={key} className="rounded-xl border border-white/5 bg-background/40 p-2 space-y-1">
                          <span className="text-[10px] font-bold text-muted-foreground block truncate">{label}</span>
                          <select
                            value={currentVal}
                            onChange={(e) => setNewPermissions({ ...newPermissions, [key]: e.target.value })}
                            className={`w-full bg-transparent text-[11px] font-black uppercase focus:outline-none border-none p-0 cursor-pointer ${
                              currentVal === "edit"
                                ? "text-primary"
                                : currentVal === "view"
                                ? "text-blue-400"
                                : "text-muted-foreground/40"
                            }`}
                          >
                            <option value="none" className="bg-card text-muted-foreground">Bloqueado</option>
                            <option value="view" className="bg-card text-blue-400">Leitura</option>
                            <option value="edit" className="bg-card text-primary">Escrita</option>
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>Criar Colaborador</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
