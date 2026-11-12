import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Globe, Check, X, Loader2, Wifi, WifiOff, ChevronDown, Zap, Brain, LayoutDashboard, FileText, Target, Upload, Send, Users, Database, Lock, MessageSquareWarning, Bug, Lightbulb, Frown, HelpCircle, StickyNote, Filter, Eye, Clock, Megaphone, Share2, RefreshCw, Instagram, Sparkles, Crown, Shield, ShieldCheck, Key, EyeOff, Copy, UserCheck, UserX, Award, Briefcase, Phone, Palette, ArrowUpDown, ChevronRight, AlertTriangle } from "lucide-react";
import { SyncButton } from "@/components/SyncButton";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { purgeAdAccount } from "@/lib/adAccountService";
import {
  getUserLevel,
  getHierarchyInfo,
  checkHierarchyAuthority,
  getAllowedAssignableRoles,
  generateStrongPassword,
  isMasterAdmin,
} from "@/lib/userHierarchy";
import {
  createSystemUser,
  updateSystemUser,
  deleteSystemUser,
  toggleUserStatus,
} from "@/lib/userService";

export const Route = createFileRoute("/_app/config")({
  head: () => ({ meta: [{ title: "Configurações — NC Suite" }] }),
  component: ConfigPage,
});

const TABS = [
  { id: "conta",       label: "Meu Perfil",          icon: User,                   adminOnly: false },
  { id: "agente",      label: "Agente Victoria",     icon: Brain,                  adminOnly: true  },
  { id: "sac",        label: "SAC / Feedback",        icon: MessageSquareWarning,   adminOnly: false },
  { id: "usuarios",   label: "Gestão de Usuários",   icon: Users,                  adminOnly: true  },
  { id: "clientes",   label: "Gestão de Clientes",   icon: Building2,              adminOnly: true  },
  { id: "integracoes",label: "Integrações Master",    icon: Plug,                   adminOnly: true  },
  { id: "automacoes", label: "Regras de Automação",  icon: Zap,                    adminOnly: true  },
  { id: "sistema",    label: "Status do Sistema",    icon: Cpu,                    adminOnly: true  },
] as const;
type Tab = typeof TABS[number]["id"];

function ConfigPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("conta");

  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      let { data } = await (supabase as any).from("profiles").select("role, permissions, position").eq("id", user.id).maybeSingle();
      
      // Auto-fix master admin permissions if they were somehow demoted
      if (user?.email === "nc.marketingrj@gmail.com" && data?.role !== "admin") {
        await (supabase as any).from("profiles").update({
          role: "admin",
          position: "Administrador Master",
          permissions: {
            "dashboard": "edit", "metricas": "edit", "clientes": "edit",
            "relatorios": "edit", "criativos": "edit", "social": "edit",
            "automacoes": "edit", "reunioes": "edit", "cobrancas": "edit",
            "strategy_map": "edit", "agente": "edit", "auditoria": "edit",
            "criar_usuarios": "edit"
          }
        }).eq("id", user.id);
        
        // Refetch after fix
        const retry = await (supabase as any).from("profiles").select("role, permissions, position").eq("id", user.id).maybeSingle();
        data = retry.data;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
  const isAdmin = profile?.role === "admin" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const isStaff = isAdmin || profile?.role === "staff" || 
    /gestor|director|diretor|staff|sócio|socio|dono/i.test(profile?.position || "");
  const perms = (profile as any)?.permissions ?? {};
  const canManageUsers = isAdmin || !!perms.criar_usuarios;

  const visibleTabs = TABS.filter(t => {
    if (!t.adminOnly) return true;
    if (t.id === "usuarios") return canManageUsers;
    if (t.id === "integracoes") return isStaff;
    return isAdmin;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Sistema" title="Configurações" description="Gerencie sua experiência e aprenda a usar a NC Suite." />

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {visibleTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative flex items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-xs font-bold transition-all ${tab === t.id ? "bg-primary text-primary-foreground shadow-glow-sm" : "text-muted-foreground hover:bg-white/[0.05]"}`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-8"
      >
        {tab === "conta"       && <TabConta />}
        {tab === "agente"      && isAdmin && <TabAgente />}
        {tab === "sac"         && <TabSac isAdmin={isAdmin} userId={user?.id ?? ""} />}
        {tab === "usuarios"    && canManageUsers && <TabUsuarios isAdmin={isAdmin} currentUserProfile={profile} />}
        {tab === "clientes"    && isAdmin && <TabClientes />}
        {tab === "integracoes" && isStaff && <TabIntegracoes />}
        {tab === "automacoes"  && isAdmin && <TabAutomacoes />}
        {tab === "sistema"     && isAdmin && <TabSistema />}
      </motion.div>
    </div>
  );
}

function TabAutomacoes() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const { data: accounts = [] } = useQuery({ queryKey: ["ad-accounts"], queryFn: async () => (await supabase.from("ad_accounts").select("*")).data ?? [] });
  const { data: rules = [], isLoading } = useQuery({ queryKey: ["automation-rules"], queryFn: async () => (await supabase.from("automation_rules").select("*, ad_accounts(name)")).data ?? [] });

  const addRule = useMutation({
    mutationFn: async (rule: any) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("automation_rules").insert({ ...rule, user_id: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["automation-rules"] }); toast.success("Regra criada!"); setShowModal(false); }
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="header-sport font-display text-lg font-semibold text-gradient">Automações Inteligentes</h3>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow"><Plus className="h-3 w-3" /> Nova Regra</button>
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !rules.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma automação ativa.</p> : (
        <div className="grid gap-3">{rules.map((r: any) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-white/5 bg-background/40 p-4 transition hover:border-primary/20">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary"><Zap className="h-4 w-4" /></div>
              <div>
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-tighter">Se {r.metric} {r.condition} {r.value} na conta {r.ad_accounts?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${r.is_active ? "bg-success/20 text-success" : "bg-white/5 text-muted-foreground"}`}>{r.is_active ? "ATIVO" : "PAUSADO"}</span>
              <button className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}</div>
      )}

      <AnimatePresence>{showModal && <AddRuleModal accounts={accounts} onClose={() => setShowModal(false)} onSave={(d) => addRule.mutate(d)} />}</AnimatePresence>
    </div>
  );
}

function AddRuleModal({ accounts, onClose, onSave }: { accounts: any[], onClose: () => void, onSave: (d: any) => void }) {
  const [name, setName] = useState(""); const [metric, setMetric] = useState("cpl"); const [cond, setCond] = useState(">"); const [val, setVal] = useState(""); const [accId, setAccId] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-4">
        <h4 className="font-display text-lg font-semibold">Nova regra de alerta</h4>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da regra (ex: CPL Alto)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <select value={metric} onChange={(e) => setMetric(e.target.value)} className="rounded-lg border border-white/10 bg-background px-2 py-2 text-xs">
            <option value="cpl">CPL</option><option value="spend">Gasto Diário</option><option value="roas">ROAS</option>
          </select>
          <select value={cond} onChange={(e) => setCond(e.target.value)} className="rounded-lg border border-white/10 bg-background px-2 py-2 text-xs">
            <option value=">">{">"}</option><option value="<">{"<"}</option><option value=">=">{">="}</option>
          </select>
          <input value={val} onChange={(e) => setVal(e.target.value)} type="number" placeholder="Valor" className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs" />
        </div>
        <select value={accId} onChange={(e) => setAccId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs">
          <option value="">Selecione a conta</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
          <button onClick={() => onSave({ name, metric, condition: cond, value: parseFloat(val), ad_account_id: accId })} className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:shadow-glow">Criar Automação</button>
        </div>
      </motion.div>
    </motion.div>
  );
}


function TabClientes() {
  const { clients, isLoading, addClient, removeClient } = useClients();
  const [showModal, setShowModal] = useState(false);
  const [newName, setNewName] = useState("");
  const handleAdd = () => { if (!newName.trim()) return; addClient.mutate({ name: newName }); setNewName(""); setShowModal(false); };
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold">Clientes</h3>
        <button onClick={() => setShowModal(true)} className="inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow"><Plus className="h-3 w-3" /> Novo</button>
      </div>
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !clients.length ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhum cliente cadastrado.</p> : (
        <div className="grid gap-3 sm:grid-cols-2">{clients.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-lg border border-white/5 bg-background/40 p-4">
            <Building2 className="h-5 w-5 text-primary" />
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.name}</p><p className="label-mono text-muted-foreground">{c.id.slice(0, 8)}</p></div>
            <button onClick={() => removeClient.mutate(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}</div>
      )}
      <AnimatePresence>{showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-sm p-6">
            <h4 className="font-display text-lg font-semibold">Novo cliente</h4>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do cliente" className="mt-4 w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" autoFocus />
            <div className="mt-4 flex gap-2 justify-end">
              <button onClick={() => setShowModal(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
              <button onClick={handleAdd} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">Criar</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}

function TabIntegracoes() {
  const qc = useQueryClient();
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [showTokenPlain, setShowTokenPlain] = useState(false);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [whatsappGateway, setWhatsappGateway] = useState("");
  const [whatsappProvider, setWhatsappProvider] = useState("baileys_custom");
  const [whatsappApiKey, setWhatsappApiKey] = useState("");
  const [whatsappInstanceName, setWhatsappInstanceName] = useState("");
  
  // Social Media states
  const [loadingPages, setLoadingPages] = useState(false);
  const [syncingSocialMetrics, setSyncingSocialMetrics] = useState(false);

  // Social Pages Query
  const { data: socialPages = [], refetch: refetchSocialPages } = useQuery({
    queryKey: ["social_pages_configs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*").order("page_name");
      return (data || []) as any[];
    }
  });
  
  // States to edit followers
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [editFB, setEditFB] = useState<number>(0);
  const [editIG, setEditIG] = useState<number>(0);
  const [savingFollowers, setSavingFollowers] = useState(false);

  const startEdit = (sp: any) => {
    setEditingPageId(sp.id);
    setEditFB(sp.facebook_followers || 0);
    setEditIG(sp.instagram_followers || 0);
  };

  const saveFollowers = async (id: string) => {
    setSavingFollowers(true);
    try {
      const { error } = await (supabase as any)
        .from("social_pages")
        .update({
          facebook_followers: editFB,
          instagram_followers: editIG,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);
      if (error) throw error;
      toast.success("Seguidores atualizados!");
      setEditingPageId(null);
      refetchSocialPages();
      qc.invalidateQueries({ queryKey: ["social_pages_insights"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar seguidores.");
    } finally {
      setSavingFollowers(false);
    }
  };
  // Google Ads state
  const { data: googleConfigs, isLoading: loadingGoogle, refetch: refetchGoogle } = useQuery({
    queryKey: ["google_ads_configs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("google_ads_configs").select("*").order("created_at", { ascending: false });
      return data || [];
    }
  });

  // Gestão de Contas de Anúncios Conectadas
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);

  const { data: connectedAdAccounts = [], refetch: refetchAdAccounts, isLoading: loadingAdAccounts } = useQuery({
    queryKey: ["admin_connected_ad_accounts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_accounts")
        .select("id, name, currency, status, last_sync, campaigns(id)")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as any[];
    }
  });

  const handleDeleteAdAccount = async (account: any) => {
    if (!window.confirm(`Tem certeza que deseja desvincular e EXCLUIR a conta "${account.name}" (${account.id}) do sistema?\n\nTodas as campanhas e métricas salvas desta conta serão apagadas permanentemente.`)) {
      return;
    }
    setDeletingAccountId(account.id);
    try {
      const res = await purgeAdAccount(account.id);
      if (!res.success) {
        throw new Error(res.error);
      }
      toast.success(`Conta "${account.name}" removida com sucesso!`);
      await refetchAdAccounts();
      await qc.invalidateQueries({ queryKey: ["ad_accounts"] });
      await qc.invalidateQueries({ queryKey: ["ad-accounts"] });
      await qc.invalidateQueries({ queryKey: ["campaigns"] });
      await qc.invalidateQueries({ queryKey: ["metrics"] });
    } catch (err: any) {
      toast.error(`Falha ao excluir conta: ${err?.message || "Erro desconhecido"}`);
    } finally {
      setDeletingAccountId(null);
    }
  };

  const [isProcessingAuth, setIsProcessingAuth] = useState(false);

  // Hook to get URL parameters (we'll read the code via standard URLSearchParams to avoid strict typing errors with Route.useSearch)
  useEffect(() => {
    const processGoogleAuth = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      
      if (code && !isProcessingAuth) {
        setIsProcessingAuth(true);
        toast.info("Processando autorização do Google Ads...", { id: "google-auth" });
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (!session) throw new Error("Usuário não autenticado");

          // Chama a Edge Function para trocar o código pelo Refresh Token e salvar no banco
          const { error } = await supabase.functions.invoke("google-ads-auth", {
            body: { code, redirectUri: `${window.location.origin}/_app/config` }
          });

          if (error) throw error;
          
          toast.success("Google Ads conectado com sucesso!", { id: "google-auth" });
          refetchGoogle();
          
          // Limpa a URL
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (err: any) {
          console.error("Auth error:", err);
          toast.error("Falha ao conectar o Google Ads.", { id: "google-auth" });
        } finally {
          setIsProcessingAuth(false);
        }
      }
    };
    
    processGoogleAuth();
  }, []);

  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").order("created_at", { ascending: false }).limit(1);
      if (data && data.length > 0) {
        const firstRow = data[0];
        setToken(firstRow.access_token || "");
        setOpenaiConfigured(firstRow.openai_key_configured || false);
        setWhatsappPhone(firstRow.whatsapp_phone || "");
        setWhatsappGateway(firstRow.whatsapp_gateway_url || "");
        setWhatsappProvider(firstRow.whatsapp_provider || "baileys_custom");
        setWhatsappApiKey(firstRow.whatsapp_api_key || "");
        setWhatsappInstanceName(firstRow.whatsapp_instance_name || "");
      }
      setIsLoading(false);
    };
    loadConfig();
  }, []);

  const fetchPages = async () => {
    if (!token.trim()) {
      toast.error("Insira o Meta Access Token primeiro.");
      return;
    }
    setLoadingPages(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "fetch-pages", accessToken: token }
      });
      if (error) throw error;
      refetchSocialPages();
      toast.success("Páginas e Perfis do Instagram sincronizados com sucesso!");
    } catch (err: any) {
      console.error(err);
      toast.error(err.message ?? "Erro ao carregar páginas.");
    } finally {
      setLoadingPages(false);
    }
  };

  const syncSocialMetrics = async () => {
    setSyncingSocialMetrics(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "sync-metrics" }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success("Métricas das redes sociais sincronizadas!");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao sincronizar métricas sociais.");
    } finally {
      setSyncingSocialMetrics(false);
    }
  };

  const save = async () => {
    if (!token.trim()) { toast.error("Preencha o Token"); return; }
    try {
      const { data: u } = await supabase.auth.getUser();
      const payload: Record<string, any> = {
        user_id: u.user?.id,
        access_token: token.trim(),
        whatsapp_phone: whatsappPhone || null,
        whatsapp_gateway_url: whatsappGateway || null,
        ad_account_id: "ALL_ACCOUNTS",
        updated_at: new Date().toISOString()
      };

      const { error } = await (supabase as any).from("meta_ads_configs").upsert(payload, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("✅ Configurações salvas com sucesso!");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const { error } = await supabase.functions.invoke("agent-heartbeat");
      if (error) throw error;
      setConnected(true);
      toast.success("Agente IA Operacional: Contas sincronizadas e regras avaliadas!");
    } catch {
      setConnected(false);
      toast.error("Falha na conexão do agente.");
    } finally {
      setTesting(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="header-sport font-display text-lg font-semibold flex items-center gap-2 text-gradient">
          <Zap className="h-5 w-5 text-primary" /> Núcleo Project Phoenix
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Gerencie o token de acesso master e as saídas de notificação do Agente IA.
        </p>
      </div>

      <div className="grid gap-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="label-mono text-[10px] text-muted-foreground uppercase">Meta Access Token (Long-Lived — System User)</label>
            <button onClick={() => setShowTokenPlain(v => !v)} className="text-[10px] text-muted-foreground hover:text-primary transition">
              {showTokenPlain ? "ocultar" : "mostrar"} token
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type={showTokenPlain ? "text" : "password"}
              placeholder="EAANmoU71vRU..."
              className="flex-1 rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
            />
            <button onClick={save} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow transition whitespace-nowrap">
              <Check className="h-3.5 w-3.5" /> SALVAR TOKEN
            </button>
          </div>
        </div>

        {/* WhatsApp Gateway Config */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#25D366] flex items-center gap-2">
                <MessageSquareWarning className="h-4.5 w-4.5" /> Gateway de Notificações WhatsApp
              </h4>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">
                Escolha o provedor de WhatsApp (Baileys Legado ou Evolution API) para envio de Alertas Críticos do Motor no celular.
              </p>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${whatsappGateway && whatsappPhone && (whatsappProvider !== "evolution_api" || (whatsappApiKey && whatsappInstanceName)) ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
              {whatsappGateway && whatsappPhone && (whatsappProvider !== "evolution_api" || (whatsappApiKey && whatsappInstanceName)) ? "CONFIGURADO" : "PENDENTE"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="label-mono text-[10px] text-muted-foreground uppercase">Provedor do WhatsApp</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWhatsappProvider("baileys_custom")}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${whatsappProvider === "baileys_custom" ? "bg-primary text-primary-foreground border-primary shadow-glow-sm" : "bg-background/50 border-white/10 text-muted-foreground hover:bg-white/[0.02]"}`}
                >
                  Baileys Customizado (Legado)
                </button>
                <button
                  type="button"
                  onClick={() => setWhatsappProvider("evolution_api")}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-bold transition-all ${whatsappProvider === "evolution_api" ? "bg-primary text-primary-foreground border-primary shadow-glow-sm" : "bg-background/50 border-white/10 text-muted-foreground hover:bg-white/[0.02]"}`}
                >
                  Evolution API (Recomendado)
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="label-mono text-[10px] text-muted-foreground uppercase">Endpoint da API (URL)</label>
              <input
                value={whatsappGateway}
                onChange={(e) => setWhatsappGateway(e.target.value)}
                placeholder="https://api.seugateway.com/v1"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <label className="label-mono text-[10px] text-muted-foreground uppercase">Número Destino (Com DDD)</label>
              <input
                value={whatsappPhone}
                onChange={(e) => setWhatsappPhone(e.target.value)}
                placeholder="5521999999999"
                className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
            </div>

            {whatsappProvider === "evolution_api" && (
              <>
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Evolution API Key</label>
                  <input
                    value={whatsappApiKey}
                    onChange={(e) => setWhatsappApiKey(e.target.value)}
                    placeholder="ex: ncmarketing_evolution_..."
                    type="password"
                    className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Nome da Instância</label>
                  <input
                    value={whatsappInstanceName}
                    onChange={(e) => setWhatsappInstanceName(e.target.value)}
                    placeholder="ex: ncmarketing-disparos"
                    className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex justify-end pt-2">
            <button onClick={save} className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary/20 px-6 py-2 text-xs font-bold text-primary hover:bg-primary/30 transition whitespace-nowrap border border-primary/30">
              <Check className="h-3.5 w-3.5" /> SALVAR WHATSAPP
            </button>
          </div>
        </div>

        {/* Módulo de Síntese Estratégica (IA) */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center ${openaiConfigured ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                <Brain className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-tighter">Módulo de Síntese Estratégica (IA)</p>
                <p className="text-[10px] text-muted-foreground">{openaiConfigured ? "Conectado à OpenAI API" : "Aguardando chave nas variáveis de ambiente"}</p>
              </div>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${openaiConfigured ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
              {openaiConfigured ? "ATIVO" : "INATIVO"}
            </span>
          </div>
        </div>

        {/* ══════════ SEÇÃO: TRÁFEGO PAGO ══════════ */}
        <div className="flex items-center gap-3 pt-6">
          <div className="h-9 w-9 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0">
            <Zap className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-primary">Tráfego Pago</h4>
            <p className="text-[10px] text-muted-foreground">Campanhas e métricas de anúncios — Meta Ads e Google Ads. Os syncs abaixo NÃO afetam redes sociais.</p>
          </div>
          <div className="flex-1 h-px bg-primary/20" />
        </div>

        {/* Sync por Mês */}
        <div className="rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground">Sincronização por Mês</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Busca o mês completo de cada período. Use para preencher dados do mês passado,
                2 meses atrás ou 3 meses atrás sem precisar rodar o sync máximo.
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <SyncButton mode="month1" />
            <SyncButton mode="month2" />
            <SyncButton mode="month3" />
          </div>
        </div>

        {/* Sync Máximo */}
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Database className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground">Sincronização Máxima</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Busca o máximo de histórico disponível para todas as contas vinculadas ao token.
                Use somente na carga inicial ou ao adicionar contas novas — não há necessidade de rodar novamente após o mês estar carregado.
              </p>
            </div>
          </div>
          <SyncButton mode="max" />
        </div>

        {/* ══════════ SEÇÃO: GERENCIAMENTO DE CONTAS CONECTADAS ══════════ */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h4 className="text-sm font-black uppercase tracking-wider text-foreground">
                  Contas de Anúncios no Sistema ({connectedAdAccounts.length})
                </h4>
                <p className="text-xs text-muted-foreground">
                  Gerencie ou desvincule contas que perderam acesso ou foram removidas do seu Gerenciador de Anúncios.
                </p>
              </div>
            </div>
            <button
              onClick={() => refetchAdAccounts()}
              disabled={loadingAdAccounts}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingAdAccounts ? "animate-spin" : ""}`} />
              Atualizar Lista
            </button>
          </div>

          {loadingAdAccounts ? (
            <div className="py-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando contas do sistema...
            </div>
          ) : connectedAdAccounts.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma conta de anúncios cadastrada no sistema.
            </div>
          ) : (
            <div className="grid gap-2">
              {connectedAdAccounts.map((acc: any) => {
                const isDeleting = deletingAccountId === acc.id;
                const campCount = Array.isArray(acc.campaigns) ? acc.campaigns.length : 0;
                return (
                  <div
                    key={acc.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-white/5 bg-black/20 hover:border-white/10 transition-all"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                        <Megaphone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xs font-bold text-foreground truncate">{acc.name}</p>
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-white/5 text-muted-foreground border border-white/10">
                            {acc.id}
                          </span>
                          <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${acc.status === 1 || acc.status === "1" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
                            {acc.status === 1 || acc.status === "1" ? "Ativa" : "Desativada"}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Moeda: <strong className="text-foreground/80">{acc.currency || "BRL"}</strong> • {campCount} campanha{campCount !== 1 ? "s" : ""} carregada{campCount !== 1 ? "s" : ""}
                          {acc.last_sync && ` • Último sync: ${new Date(acc.last_sync).toLocaleString("pt-BR")}`}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteAdAccount(acc)}
                      disabled={isDeleting}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-bold transition-all shrink-0 active:scale-95 disabled:opacity-50"
                      title="Excluir conta e dados associados"
                    >
                      {isDeleting ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span>{isDeleting ? "Excluindo..." : "Excluir Conta"}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Google Ads (Tráfego) */}
        <div className="rounded-2xl border border-[#4285F4]/20 bg-[#4285F4]/5 p-4 space-y-3">
          <div className="flex items-start gap-3">
            <Globe className="h-5 w-5 text-[#4285F4] shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-foreground">Google Ads Multicanal</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Conecte sua MCC ou contas isoladas do Google Ads para unificar o seu tráfego no Dashboard.
              </p>
            </div>
          </div>
          <div className="grid gap-3">
            {googleConfigs?.map((gc: any) => (
              <div key={gc.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-[#4285F4]/10 flex items-center justify-center">
                    <Globe className="h-5 w-5 text-[#4285F4]" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{gc.name}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{gc.email || "Sessão Ativa"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-black bg-success/20 text-success uppercase tracking-widest">
                    CONECTADO
                  </span>
                  <button
                    onClick={async () => {
                      if(!confirm("Remover esta conexão?")) return;
                      await (supabase as any).from("google_ads_configs").delete().eq("id", gc.id);
                      refetchGoogle();
                      toast.success("Conexão removida.");
                    }}
                    className="text-muted-foreground hover:text-destructive transition p-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            <button
              onClick={() => {
                 // Redireciona para o Google OAuth
                 const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
                 const redirectUri = `${window.location.origin}/_app/config`;
                 const scope = "https://www.googleapis.com/auth/adwords https://www.googleapis.com/auth/userinfo.email";
                 const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
                 window.location.href = url;
              }}
              disabled={isProcessingAuth}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-dashed border-[#4285F4]/30 bg-[#4285F4]/5 p-4 hover:bg-[#4285F4]/10 hover:border-[#4285F4]/50 transition cursor-pointer"
            >
              {isProcessingAuth ? <Loader2 className="h-5 w-5 animate-spin text-[#4285F4]" /> : <Plus className="h-5 w-5 text-[#4285F4]" />}
              <span className="text-sm font-bold text-[#4285F4]">
                {isProcessingAuth ? "Processando..." : "Nova Conexão Google Ads"}
              </span>
            </button>
          </div>
        </div>

        {/* ══════════ SEÇÃO: SOCIAL MEDIA ══════════ */}
        <div className="flex items-center gap-3 pt-6">
          <div className="h-9 w-9 rounded-lg bg-pink-500/15 border border-pink-500/25 flex items-center justify-center shrink-0">
            <Share2 className="h-4.5 w-4.5 text-pink-500" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest text-pink-500">Social Media</h4>
            <p className="text-[10px] text-muted-foreground">Páginas do Facebook e perfis do Instagram — conteúdo orgânico. O sync abaixo NÃO afeta campanhas de tráfego.</p>
          </div>
          <div className="flex-1 h-px bg-pink-500/20" />
        </div>

        {/* Módulo de Redes Sociais da Meta */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4.5 w-4.5 text-primary animate-pulse" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Redes Sociais da Meta</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Sincronize e gerencie todas as Páginas do Facebook e contas associadas do Instagram vinculadas ao seu token de acesso.
          </p>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={fetchPages}
              disabled={loadingPages || !token}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-medium hover:bg-white/10 transition disabled:opacity-50 cursor-pointer"
            >
              {loadingPages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sincronizar Páginas e Perfis
            </button>
            <button
              onClick={syncSocialMetrics}
              disabled={syncingSocialMetrics || socialPages.length === 0}
              type="button"
              title={socialPages.length === 0 ? "Sincronize as páginas primeiro" : "Busca seguidores, alcance e engajamento das páginas conectadas"}
              className="inline-flex items-center gap-2 rounded-xl bg-pink-500/10 border border-pink-500/20 px-4 py-2 text-xs font-medium text-pink-500 hover:bg-pink-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              {syncingSocialMetrics ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sincronizar Métricas Sociais
            </button>
          </div>

          <div className="grid gap-3 pt-2">
            {socialPages.map((sp: any) => (
              <div key={sp.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Share2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold">{sp.page_name}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-widest">ID: {sp.page_id}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {sp.instagram_handle && (
                        <span className="inline-flex items-center gap-1 rounded bg-pink-500/10 border border-pink-500/20 px-1.5 py-0.5 text-[9px] font-bold text-pink-500">
                          <Instagram className="h-2.5 w-2.5" /> @{sp.instagram_handle}
                        </span>
                      )}
                    </div>
                    
                    {/* Editor de seguidores inline */}
                    <div className="mt-2 pt-2 border-t border-white/5">
                      {editingPageId === sp.id ? (
                        <div className="flex items-center gap-2 flex-wrap bg-white/[0.03] p-2 rounded-lg border border-white/5">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">FB:</span>
                            <input
                              type="number"
                              value={editFB}
                              onChange={(e) => setEditFB(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-16 bg-background border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-bold"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">IG:</span>
                            <input
                              type="number"
                              value={editIG}
                              onChange={(e) => setEditIG(Math.max(0, parseInt(e.target.value) || 0))}
                              className="w-16 bg-background border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-bold"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <button
                              onClick={() => saveFollowers(sp.id)}
                              disabled={savingFollowers}
                              className="p-1 rounded bg-success/20 hover:bg-success/30 text-success text-[10px] font-bold transition flex items-center gap-0.5"
                            >
                              {savingFollowers ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5" />}
                              Salvar
                            </button>
                            <button
                              onClick={() => setEditingPageId(null)}
                              className="p-1 rounded bg-white/5 hover:bg-white/10 text-muted-foreground text-[10px] font-medium transition"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>FB: <strong className="text-white">{sp.facebook_followers?.toLocaleString("pt-BR") || 0}</strong> seg.</span>
                            <span>•</span>
                            <span>IG: <strong className="text-white">{sp.instagram_followers?.toLocaleString("pt-BR") || 0}</strong> seg.</span>
                          </div>
                          <button
                            onClick={() => startEdit(sp)}
                            className="text-[9px] font-bold text-primary hover:underline transition uppercase tracking-wider ml-1"
                          >
                            [Editar]
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-black bg-success/20 text-success uppercase tracking-widest">
                    CONECTADO
                  </span>
                  <button 
                    onClick={async () => {
                      if (!confirm("Remover esta página da sincronização?")) return;
                      await (supabase as any).from("social_pages").delete().eq("id", sp.id);
                      refetchSocialPages();
                      toast.success("Página removida.");
                    }}
                    className="text-muted-foreground hover:text-destructive transition p-2"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}

            {socialPages.length === 0 && !loadingPages && (
              <p className="text-center text-xs text-muted-foreground py-4 border border-dashed border-white/5 rounded-xl">
                Nenhuma Página do Facebook ou Instagram sincronizada. Insira seu token e clique em Sincronizar.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 mb-8">
        <button onClick={test} disabled={testing} className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-3 sm:py-2 text-xs font-medium disabled:opacity-50 hover:bg-white/5 w-full sm:w-auto">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5" />}
          TESTAR HEARTBEAT
        </button>
      </div>

      <div className="h-px w-full bg-white/5 my-8" />
    </div>
  );
}


function TabSistema() {
  return (
    <div className="space-y-4">
      <h3 className="header-sport font-display text-lg font-semibold">Informações do Sistema</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ label: "Versão", value: "2.0.0" }, { label: "Plataforma", value: "NC Performance Suite" }, { label: "Stack", value: "React 18 + Vite + Supabase" }, { label: "Edge Runtime", value: "Supabase Edge Functions" }, { label: "DB", value: "PostgreSQL (Supabase)" }, { label: "Auth", value: "Supabase Auth" }].map((info) => (
          <div key={info.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-background/40 p-3">
            <span className="label-mono text-muted-foreground">{info.label}</span>
            <span className="text-sm font-medium">{info.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TabConta() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [position, setPosition] = useState("Gestor de Tráfego");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [agencyName, setAgencyName] = useState("NC AGÊNCIA");
  const [whatsappNumbers, setWhatsappNumbers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const POSITIONS_LIST = [
    "Gestor de Tráfego",
    "Social Media",
    "Gerente",
    "Diretor",
    "Videomaker",
    "Designer",
    "Outros",
  ];

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profiles", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || "");
      setPosition(profile.position || POSITIONS_LIST[0]);
      setAvatarUrl(profile.avatar_url || "");
      setAgencyName(profile.agency_name || "NC AGÊNCIA");
      setWhatsappNumbers(profile.whatsapp_numbers || []);
    }
  }, [profile]);

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("profiles").upsert({
        id: user.id,
        full_name: fullName,
        position,
        avatar_url: avatarUrl,
        agency_name: agencyName,
        whatsapp_numbers: whatsappNumbers.filter(n => n.trim() !== ""),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
      
      // Também atualiza o full_name nos metadados da autenticação do Supabase
      await supabase.auth.updateUser({
        data: { full_name: fullName, position, avatar_url: avatarUrl }
      });

      qc.invalidateQueries({ queryKey: ["profiles"] });
      qc.invalidateQueries({ queryKey: ["current_user_profile"] });
      toast.success("Perfil atualizado com sucesso!");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar perfil");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="header-sport font-display text-lg font-semibold flex items-center gap-2 text-gradient">Meu Perfil Profissional</h3>
        <p className="text-xs text-muted-foreground mt-1">Gerencie suas informações profissionais, cargo e foto de perfil na NC Suite.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6 items-start">
        {/* Avatar Live Preview */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          <div className="h-24 w-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden shadow-2xl">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar Preview" className="h-full w-full object-cover" />
            ) : (
              <User className="h-10 w-10 text-primary" />
            )}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Foto do Perfil</span>
        </div>

        {/* Inputs */}
        <div className="flex-1 grid gap-4 sm:grid-cols-2 w-full">
          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase">Nome Completo</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Seu nome" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>

          <div className="space-y-1.5">
            <label className="label-mono text-[10px] text-muted-foreground uppercase">Cargo / Função</label>
            <select value={position} onChange={(e) => setPosition(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none text-foreground">
              {POSITIONS_LIST.map(pos => <option key={pos} value={pos} className="bg-card text-foreground">{pos}</option>)}
            </select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="label-mono text-[10px] text-muted-foreground uppercase">URL da Foto de Perfil</label>
            <input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://exemplo.com/sua-foto.jpg" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono" />
          </div>
          </div>
        </div>

      {/* Meus Dispositivos de Alerta */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold flex items-center gap-2">
              <MessageSquareWarning className="h-4.5 w-4.5 text-[#25D366]" /> Meus Dispositivos de Alerta (WhatsApp)
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5 max-w-lg">
              Cadastre seu celular para receber os Alertas Críticos do Motor e mensagens importantes da plataforma.
              {["admin", "master_admin", "ceo"].includes(profile?.role || "") ? " Você pode cadastrar até 5 números (Formato DDI+DDD+Numero, ex: 5521999999999)." : " Você pode cadastrar 1 número (Formato DDI+DDD+Numero, ex: 5521999999999)."}
            </p>
          </div>
        </div>
        
        <div className="space-y-3">
          {whatsappNumbers.map((num, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                value={num}
                onChange={(e) => {
                  const newNums = [...whatsappNumbers];
                  newNums[idx] = e.target.value.replace(/[^0-9+]/g, ""); // Allow digits and +
                  setWhatsappNumbers(newNums);
                }}
                placeholder="Ex: 5521999999999"
                className="flex-1 max-w-sm rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
              />
              <button onClick={() => setWhatsappNumbers(whatsappNumbers.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive p-2 transition">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {whatsappNumbers.length < (["admin", "master_admin", "ceo"].includes(profile?.role || "") ? 5 : 1) && (
            <button onClick={() => setWhatsappNumbers([...whatsappNumbers, ""])} className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline px-1 py-1">
              <Plus className="h-3.5 w-3.5" /> Adicionar Número
            </button>
          )}
          {whatsappNumbers.length === 0 && (
            <p className="text-xs text-muted-foreground italic pl-1">Nenhum número cadastrado. Você não receberá alertas via WhatsApp.</p>
          )}
        </div>
      </div>

      <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow transition disabled:opacity-50">
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
        SALVAR PERFIL
      </button>
    </div>
  );
}

const PERMISSION_PAGES = [
  { key: "dashboard",      label: "Command Center"  },
  { key: "metricas",       label: "Métricas"        },
  { key: "clientes",       label: "Clientes"        },
  { key: "relatorios",     label: "Relatórios"      },
  { key: "criativos",      label: "Criativos"       },
  { key: "social",         label: "Social Media"    },
  { key: "automacoes",     label: "Automações"      },
  { key: "reunioes",       label: "Reuniões"        },
  { key: "cobrancas",      label: "Cobranças"       },
  { key: "strategy_map",   label: "Mapa Estratégico"},
  { key: "agente",         label: "Agente IA"       },
  { key: "auditoria",      label: "Auditoria Hub"   },
  { key: "criar_usuarios", label: "Gestão Usuários" },
] as const;

const ROLE_LABEL: Record<string, string> = {
  admin:           "ADMINISTRADOR",
  diretor:         "DIRETOR",
  ceo:             "CEO",
  gerente:         "GERENTE",
  gestor_trafego:  "GESTOR TRÁFEGO",
  gestor_projetos: "GESTOR PROJETOS",
  social_media:    "SOCIAL MEDIA",
  desenvolvedor:   "DESENVOLVEDOR",
  designer:        "DESIGNER",
  sdr:             "SDR",
  outro:           "MEMBRO",
};

const CARGO_DEFAULT_PERMISSIONS: Record<string, Record<string, "none" | "view" | "edit">> = {
  "Gestor de Tráfego": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "view",
    relatorios: "edit",
    criativos: "edit",
    social: "none",
    automacoes: "edit",
    reunioes: "none",
    cobrancas: "none",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Gestor de Projetos": {
    dashboard: "edit",
    metricas: "view",
    clientes: "edit",
    relatorios: "edit",
    criativos: "view",
    social: "edit",
    automacoes: "none",
    reunioes: "edit",
    cobrancas: "none",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Social Media": {
    dashboard: "view",
    metricas: "none",
    clientes: "view",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "none",
    reunioes: "none",
    cobrancas: "none",
    strategy_map: "edit",
    agente: "view",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Desenvolvedor": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "edit",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "edit",
    reunioes: "edit",
    cobrancas: "edit",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "edit",
    criar_usuarios: "edit",
  },
  "Designer": {
    dashboard: "view",
    metricas: "none",
    clientes: "view",
    relatorios: "none",
    criativos: "edit",
    social: "view",
    automacoes: "none",
    reunioes: "none",
    cobrancas: "none",
    strategy_map: "edit",
    agente: "view",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Diretor": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "edit",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "edit",
    reunioes: "edit",
    cobrancas: "edit",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "edit",
    criar_usuarios: "edit",
  },
  "CEO": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "edit",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "edit",
    reunioes: "edit",
    cobrancas: "edit",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "edit",
    criar_usuarios: "edit",
  },
  "Administrador": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "edit",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "edit",
    reunioes: "edit",
    cobrancas: "edit",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "edit",
    criar_usuarios: "edit",
  },
  "SDR": {
    dashboard: "view",
    metricas: "none",
    clientes: "view",
    relatorios: "none",
    criativos: "none",
    social: "none",
    automacoes: "none",
    reunioes: "edit",
    cobrancas: "none",
    strategy_map: "none",
    agente: "view",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Gerente": {
    dashboard: "edit",
    metricas: "edit",
    clientes: "edit",
    relatorios: "edit",
    criativos: "edit",
    social: "edit",
    automacoes: "view",
    reunioes: "edit",
    cobrancas: "none",
    strategy_map: "edit",
    agente: "edit",
    auditoria: "none",
    criar_usuarios: "none",
  },
  "Outros": {
    dashboard: "view",
    metricas: "none",
    clientes: "none",
    relatorios: "none",
    criativos: "none",
    social: "none",
    automacoes: "none",
    reunioes: "none",
    cobrancas: "none",
    strategy_map: "none",
    agente: "none",
    auditoria: "none",
    criar_usuarios: "none",
  }
};

function TabUsuarios({ isAdmin, currentUserProfile }: { isAdmin: boolean; currentUserProfile?: any }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTab, setFilterTab] = useState<"todos" | "subordinados" | "diretoria" | "gerencia" | "gestores" | "operacao" | "inativos">("todos");

  // Caller hierarchy info
  const effectiveCaller = useMemo(() => {
    return {
      id: user?.id,
      email: user?.email,
      ...(currentUserProfile || {}),
    };
  }, [user, currentUserProfile]);

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
  const [saving, setSaving] = useState(false);

  // Cadastro
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newShowPassword, setNewShowPassword] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPosition, setNewPosition] = useState("Gestor de Tráfego");
  const [newRole, setNewRole] = useState("gestor_trafego");
  const [newPermissions, setNewPermissions] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  // Carrega todos os perfis cadastrados no banco
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

  // Copiar para clipboard com feedback
  const copyToClipboard = (text: string, msg = "Copiado para a área de transferência!") => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  // Abrir modal de edição com dados populados
  const handleOpenEdit = (targetUser: any) => {
    setEditingUser(targetUser);
    setEditEmail(targetUser.email || "");
    setEditPassword("");
    setEditShowPassword(false);
    setEditName(targetUser.full_name || "");
    setEditPosition(targetUser.position || "Gestor de Tráfego");
    setEditRole(targetUser.role || "outro");
    setEditStatus(targetUser.status === "inativo" ? "inativo" : "ativo");
    setEditPermissions(targetUser.permissions || CARGO_DEFAULT_PERMISSIONS[targetUser.position] || {});
  };

  // Abrir modal de cadastro
  const handleOpenAdd = () => {
    const defaultRole = allowedAssignable.roles[0]?.value || "outro";
    const defaultPosition = allowedAssignable.positions[0] || "Gestor de Tráfego";
    setNewEmail("");
    setNewPassword(generateStrongPassword());
    setNewShowPassword(true);
    setNewName("");
    setNewRole(defaultRole);
    setNewPosition(defaultPosition);
    setNewPermissions(CARGO_DEFAULT_PERMISSIONS[defaultPosition] || {});
    setShowAddModal(true);
  };

  // Salvar edição completa de usuário (login, senha, cargo, permissões, status)
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

    setSaving(true);
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
      setSaving(false);
    }
  };

  // Cadastrar novo usuário
  const handleCreateUser = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newName.trim()) {
      toast.error("Por favor, preencha nome, e-mail e senha de acesso.");
      return;
    }
    if (newPassword.trim().length < 6) {
      toast.error("A senha deve conter no mínimo 6 caracteres.");
      return;
    }

    setCreating(true);
    try {
      const res = await createSystemUser({
        email: newEmail.trim(),
        password: newPassword.trim(),
        fullName: newName.trim(),
        position: newPosition,
        role: newRole,
        permissions: newPermissions,
        status: "ativo",
      });

      if (!res.success) {
        throw new Error(res.error || "Erro ao cadastrar usuário");
      }

      toast.success(res.message || "Novo usuário cadastrado e pronto para login!");
      setShowAddModal(false);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Falha ao criar usuário");
    } finally {
      setCreating(false);
    }
  };

  // Toggle rápido de Ativo / Suspenso
  const handleToggleStatus = async (targetUser: any) => {
    const authCheck = checkHierarchyAuthority(effectiveCaller, targetUser);
    if (!authCheck.isSuperior) {
      toast.error(authCheck.reason || "Hierarquia insuficiente para alterar o status deste usuário.");
      return;
    }

    const nextStatus = targetUser.status === "inativo" ? "ativo" : "inativo";
    const label = nextStatus === "ativo" ? "ativado" : "suspenso";

    try {
      const res = await toggleUserStatus(targetUser.id, targetUser.status);
      if (!res.success) throw new Error(res.error);
      toast.success(`Usuário ${targetUser.full_name || ""} ${label} com sucesso.`);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao alterar status");
    }
  };

  // Excluir usuário permanentemente
  const handleDelete = async (targetUser: any) => {
    const authCheck = checkHierarchyAuthority(effectiveCaller, targetUser);
    if (!authCheck.canDelete) {
      toast.error(authCheck.reason || "Você não tem autoridade para excluir este usuário.");
      return;
    }

    if (
      !confirm(
        `Tem certeza que deseja excluir permanentemente "${targetUser.full_name || targetUser.email}" da Suite?\n\nEsta ação excluirá o login de acesso e todo o histórico deste usuário.`
      )
    ) {
      return;
    }

    try {
      const res = await deleteSystemUser(targetUser.id);
      if (!res.success) throw new Error(res.error);
      toast.success(res.message || "Usuário excluído permanentemente com sucesso!");
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao excluir usuário");
    }
  };

  // Alteração direta de permissão na lista (apenas se for superior)
  const handleSetPermissionLevel = async (targetUser: any, key: string, level: string) => {
    const authCheck = checkHierarchyAuthority(effectiveCaller, targetUser);
    if (!authCheck.canEditPermissions) {
      toast.error(authCheck.reason || "Você não tem autoridade para alterar as permissões deste usuário.");
      return;
    }

    const updated = { ...(targetUser.permissions ?? {}), [key]: level };
    try {
      const { error } = await (supabase as any).rpc("admin_set_user_permissions", {
        target_user_id: targetUser.id,
        new_permissions: updated,
      });
      if (error) {
        // Fallback direto
        await (supabase as any).from("profiles").update({ permissions: updated }).eq("id", targetUser.id);
      }
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
      toast.success("Permissão atualizada!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao alterar permissão");
    }
  };

  // Estatísticas de hierarquia
  const manageableCount = useMemo(() => {
    return users.filter((u: any) => checkHierarchyAuthority(effectiveCaller, u).isSuperior).length;
  }, [users, effectiveCaller]);

  const leadershipCount = useMemo(() => {
    return users.filter((u: any) => getUserLevel(u) >= 70).length;
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

  // Filtragem de usuários
  const filteredUsers = useMemo(() => {
    return users.filter((u: any) => {
      const searchMatch =
        (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.email || "").toLowerCase().includes(search.toLowerCase()) ||
        (u.position || "").toLowerCase().includes(search.toLowerCase());

      if (!searchMatch) return false;

      const lvl = getUserLevel(u);
      const isSub = checkHierarchyAuthority(effectiveCaller, u).isSuperior;

      if (filterTab === "subordinados") return isSub;
      if (filterTab === "diretoria") return lvl >= 70;
      if (filterTab === "gestores") return lvl >= 50 && lvl < 70;
      if (filterTab === "operacao") return lvl < 50;
      if (filterTab === "inativos") return u.status === "inativo";
      return true;
    });
  }, [users, search, filterTab, effectiveCaller]);

  const renderRankIcon = (iconName: string, className = "h-4 w-4") => {
    switch (iconName) {
      case "crown":
        return <Crown className={className} />;
      case "shield":
        return <ShieldCheck className={className} />;
      case "star":
        return <Sparkles className={className} />;
      case "award":
        return <Award className={className} />;
      case "target":
        return <Target className={className} />;
      case "briefcase":
        return <Briefcase className={className} />;
      case "palette":
        return <Palette className={className} />;
      case "phone":
        return <Phone className={className} />;
      default:
        return <User className={className} />;
    }
  };

  return (
    <div className="space-y-6">
      {/* ══════════ BANNER DE AUTORIDADE HIERÁRQUICA DO USUÁRIO CONECTADO ══════════ */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-background via-white/[0.02] to-background p-5 shadow-2xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center shadow-lg shrink-0 ${callerInfo.badgeBg} ${callerInfo.badgeBorder} ${callerInfo.badgeText}`}>
              {renderRankIcon(callerInfo.iconName, "h-6 w-6")}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border ${callerInfo.badgeBg} ${callerInfo.badgeBorder} ${callerInfo.badgeText}`}>
                  {renderRankIcon(callerInfo.iconName, "h-3 w-3")} NÍVEL {callerInfo.level} • {callerInfo.shortLabel}
                </span>
                <span className="text-xs text-muted-foreground font-mono">
                  {effectiveCaller.email || "Sessão Ativa"}
                </span>
              </div>
              <h3 className="header-sport font-display text-base font-bold text-foreground mt-1">
                Central de Autoridade & Gestão de Usuários
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
                {isCallerMaster
                  ? "👑 Você opera como Administrador Master. Autoridade absoluta e vitalícia para editar logins, redefinir senhas, gerenciar cargos e permissões de toda a Suite."
                  : `Como ${callerInfo.title} (Nível ${callerInfo.level}), você tem autoridade hierárquica para editar logins, senhas, cargos e permissões de todos os colaboradores de níveis inferiores.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95"
            >
              <Plus className="h-4 w-4" /> NOVO USUÁRIO
            </button>
          </div>
        </div>

        {/* Métrica Cards Rápidos */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-4 mt-4 border-t border-white/5">
          <div className="rounded-xl border border-white/5 bg-black/20 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total de Usuários</p>
              <p className="text-lg font-black text-foreground">{users.length}</p>
            </div>
            <Users className="h-4 w-4 text-muted-foreground/40" />
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Seus Subordinados</p>
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

      {/* ══════════ BARRA DE PESQUISA & ABAS DE FILTRO HIERÁRQUICO ══════════ */}
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
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all whitespace-nowrap ${
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
            className="w-full rounded-xl border border-white/10 bg-background/50 pl-3 pr-8 py-2 text-xs focus:border-primary focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ══════════ LISTA DE USUÁRIOS / GRID DE CARDS ══════════ */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center space-y-2">
          <Users className="h-8 w-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm font-bold text-foreground">Nenhum usuário encontrado</p>
          <p className="text-xs text-muted-foreground">Tente alterar os termos da busca ou mudar a aba de filtro.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredUsers.map((u: any) => {
            const targetInfo = getHierarchyInfo(u);
            const authCheck = checkHierarchyAuthority(effectiveCaller, u);
            const isSelf = user?.id === u.id;
            const isInactive = u.status === "inativo";

            // Permissões resumo
            const perms = u.permissions || {};
            const activePermCount = Object.values(perms).filter((v) => v === "edit" || v === "view").length;

            return (
              <div
                key={u.id}
                className={`relative rounded-2xl border p-5 transition-all duration-300 space-y-4 ${
                  targetInfo.level === 100
                    ? "border-amber-500/35 bg-gradient-to-b from-amber-500/[0.04] to-background shadow-lg shadow-amber-500/5"
                    : authCheck.isSuperior
                    ? "border-white/10 bg-background/60 hover:border-primary/40 shadow-sm hover:shadow-glow/5"
                    : "border-white/5 bg-background/30 opacity-90"
                }`}
              >
                {/* Cabeçalho do Card: Avatar + Informações Básicas + Badge Hierárquica */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <div
                        className={`h-12 w-12 rounded-2xl border flex items-center justify-center overflow-hidden shadow-md ${targetInfo.badgeBg} ${targetInfo.badgeBorder}`}
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt={u.full_name || "Avatar"} className="h-full w-full object-cover" />
                        ) : (
                          renderRankIcon(targetInfo.iconName, `h-6 w-6 ${targetInfo.badgeText}`)
                        )}
                      </div>
                      <span
                        className={`absolute -bottom-1 -right-1 h-3.5 w-3.5 rounded-full border-2 border-background ${
                          isInactive ? "bg-red-500" : "bg-emerald-500"
                        }`}
                        title={isInactive ? "Usuário Suspenso" : "Usuário Ativo"}
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

                      <p className="text-xs text-muted-foreground/80 mt-0.5 truncate font-medium">
                        {u.position || "Sem cargo definido"}
                      </p>

                      {/* Login / Email com botão de copiar */}
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] text-muted-foreground group">
                        <span className="font-mono truncate">{u.email || "Sem e-mail cadastrado"}</span>
                        {u.email && (
                          <button
                            onClick={() => copyToClipboard(u.email, "E-mail de login copiado!")}
                            className="text-muted-foreground hover:text-primary transition p-0.5"
                            title="Copiar login do usuário"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Badge da Patente Hierárquica */}
                  <div className="shrink-0 text-right">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wider border ${targetInfo.badgeBg} ${targetInfo.badgeBorder} ${targetInfo.badgeText}`}
                    >
                      {renderRankIcon(targetInfo.iconName, "h-3 w-3")}
                      {targetInfo.shortLabel}
                    </span>
                    <p className="text-[9px] font-mono text-muted-foreground/60 mt-1">
                      Nível {targetInfo.level}
                    </p>
                  </div>
                </div>

                {/* Linha de Relação Hierárquica com o Usuário Logado */}
                <div className="rounded-xl border border-white/5 bg-black/20 p-2.5 flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2 min-w-0">
                    {targetInfo.level === 100 ? (
                      <span className="flex items-center gap-1.5 font-bold text-amber-300">
                        <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        Administrador Master — Proteção Absoluta Vitalícia
                      </span>
                    ) : isSelf ? (
                      <span className="flex items-center gap-1.5 font-bold text-primary">
                        <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                        Seu próprio usuário autenticado
                      </span>
                    ) : authCheck.isSuperior ? (
                      <span className="flex items-center gap-1.5 font-bold text-emerald-400 truncate">
                        <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                        Seu Subordinado (Você pode editar login, senha e acessos)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground/60 font-medium truncate">
                        <Lock className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        Protegido pela Hierarquia (Nível {targetInfo.level} &ge; {callerLevel})
                      </span>
                    )}
                  </div>

                  <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                    {targetInfo.level === 100
                      ? "Acesso Total"
                      : `${activePermCount} de ${PERMISSION_PAGES.length} módulos`}
                  </span>
                </div>

                {/* Seletor / Matriz de Permissões Rápidas (visível se tiver permissões customizáveis) */}
                {targetInfo.level < 90 && (
                  <div className="space-y-1.5 pt-1 border-t border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                        Permissões por Módulo
                      </span>
                      {authCheck.canEditPermissions && (
                        <span className="text-[9px] text-primary/80 font-bold">
                          Clique para alterar rapidamente
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                      {PERMISSION_PAGES.map(({ key, label }) => {
                        const level = u.permissions?.[key] || "none";
                        const canChange = authCheck.canEditPermissions;

                        return (
                          <div
                            key={key}
                            className="flex flex-col gap-0.5 bg-white/[0.02] border border-white/5 rounded-lg p-1.5"
                          >
                            <span className="text-[9px] font-bold text-muted-foreground truncate">{label}</span>
                            {canChange ? (
                              <select
                                value={level}
                                onChange={(e) => handleSetPermissionLevel(u, key, e.target.value)}
                                className={`bg-transparent text-[10px] font-black uppercase focus:outline-none cursor-pointer border-none p-0 ${
                                  level === "edit"
                                    ? "text-primary"
                                    : level === "view"
                                    ? "text-blue-400"
                                    : "text-muted-foreground/40"
                                }`}
                              >
                                <option value="none" className="bg-background text-muted-foreground">Sem Acesso</option>
                                <option value="view" className="bg-background text-blue-400">Leitura</option>
                                <option value="edit" className="bg-background text-primary">Escrita</option>
                              </select>
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
                                {level === "edit" ? "Escrita" : level === "view" ? "Leitura" : "Nenhum"}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ══════════ BOTÕES DE AÇÃO HIERÁRQUICOS ══════════ */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    {/* Botão de Ativar / Suspender */}
                    {authCheck.isSuperior && (
                      <button
                        onClick={() => handleToggleStatus(u)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition ${
                          isInactive
                            ? "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
                            : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                        }`}
                        title={isInactive ? "Reativar acesso do colaborador" : "Suspender temporariamente o acesso"}
                      >
                        {isInactive ? <UserCheck className="h-3 w-3" /> : <UserX className="h-3 w-3" />}
                        <span>{isInactive ? "Reativar" : "Suspender"}</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Botão de Edição (Login / Senha / Cargo) */}
                    {authCheck.isSuperior || (isSelf && isCallerMaster) ? (
                      <button
                        onClick={() => handleOpenEdit(u)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-foreground hover:bg-primary hover:border-primary hover:text-primary-foreground transition shadow-sm"
                      >
                        <Key className="h-3.5 w-3.5" />
                        <span>Editar Login / Senha</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground/40 uppercase tracking-wider px-2 py-1">
                        <Lock className="h-3 w-3" /> Acesso Protegido
                      </span>
                    )}

                    {/* Botão de Excluir */}
                    {authCheck.canDelete && (
                      <button
                        onClick={() => handleDelete(u)}
                        className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/15 transition"
                        title="Excluir usuário permanentemente"
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

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL DE EDIÇÃO COMPLETA: LOGIN (EMAIL), SENHA, CARGO, ROLE E PERMISSÕES     */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
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
              {/* Header do Modal */}
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
                      Editando usuário: <strong className="text-foreground">{editingUser.full_name || editingUser.email}</strong>
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

              {/* Informação de Autoridade */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-2.5 text-xs text-foreground">
                <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                <p>
                  Como <strong>{callerInfo.title} (Nível {callerLevel})</strong>, você possui autoridade para atualizar o <strong>login de acesso (e-mail)</strong>, <strong>redefinir a senha</strong> e os privilégios deste colaborador.
                </p>
              </div>

              {/* ── SEÇÃO 1: CREDENCIAIS DE LOGIN & ACESSO ── */}
              <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-primary" />
                  <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Credenciais de Acesso (Login & Senha)
                  </h5>
                </div>

                {/* E-mail / Login */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Login de Acesso (E-mail)
                    </label>
                    <span className="text-[10px] text-primary font-bold">Totalmente Editável</span>
                  </div>
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(e) => setEditEmail(e.target.value)}
                    placeholder="email.colaborador@empresa.com"
                    className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono text-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Ao alterar este campo, o colaborador passará a utilizar este novo e-mail para entrar no sistema.
                  </p>
                </div>

                {/* Senha de Acesso */}
                <div className="space-y-1 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Nova Senha de Acesso
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const pass = generateStrongPassword();
                          setEditPassword(pass);
                          setEditShowPassword(true);
                          copyToClipboard(pass, "Senha gerada e copiada!");
                        }}
                        className="text-[10px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" /> Gerar Segura
                      </button>
                      {editPassword && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(editPassword, "Senha copiada para enviar!")}
                          className="text-[10px] font-black uppercase text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" /> Copiar Senha
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type={editShowPassword ? "text" : "password"}
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="Deixe em branco para manter a senha atual"
                      className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 pr-10 text-sm focus:border-primary focus:outline-none font-mono text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setEditShowPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {editShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Preencha este campo apenas se desejar redefinir ou cadastrar uma nova senha para este usuário.
                  </p>
                </div>
              </div>

              {/* ── SEÇÃO 2: DADOS PESSOAIS & CARGO ── */}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nome Completo
                  </label>
                  <input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Nome do colaborador"
                    className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Status da Conta
                  </label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
                  >
                    <option value="ativo">🟢 Ativo (Acesso Liberado)</option>
                    <option value="inativo">🔴 Suspenso (Acesso Bloqueado)</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Cargo / Função
                  </label>
                  <select
                    value={editPosition}
                    onChange={(e) => {
                      const pos = e.target.value;
                      setEditPosition(pos);
                      const defaults = CARGO_DEFAULT_PERMISSIONS[pos] || {};
                      setEditPermissions(defaults);
                    }}
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    {allowedAssignable.positions.map((pos: string) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nível de Acesso (Role)
                  </label>
                  <select
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
                  >
                    {allowedAssignable.roles.map((r: any) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* ── SEÇÃO 3: MATRIZ DE PERMISSÕES ── */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Permissões Granulares por Módulo ({PERMISSION_PAGES.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const defaults = CARGO_DEFAULT_PERMISSIONS[editPosition] || {};
                      setEditPermissions(defaults);
                      toast.info(`Preset recomendado para "${editPosition}" aplicado.`);
                    }}
                    className="text-[9px] font-black uppercase text-primary hover:underline"
                  >
                    Aplicar Sugestão do Cargo
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {PERMISSION_PAGES.map(({ key, label }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-background/40 p-2"
                    >
                      <span className="text-[10px] font-bold text-foreground truncate max-w-[110px]">
                        {label}
                      </span>
                      <select
                        value={editPermissions[key] || "none"}
                        onChange={(e) =>
                          setEditPermissions((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className={`rounded border border-white/10 bg-background px-1.5 py-1 text-[10px] font-black uppercase focus:outline-none ${
                          editPermissions[key] === "edit"
                            ? "text-primary"
                            : editPermissions[key] === "view"
                            ? "text-blue-400"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        <option value="none" className="text-muted-foreground">Nenhum</option>
                        <option value="view" className="text-blue-400">Leitura</option>
                        <option value="edit" className="text-primary">Escrita</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Rodapé de Ações */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase text-muted-foreground hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={saving}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:shadow-glow transition disabled:opacity-50"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  <span>{saving ? "Salvando..." : "Salvar Credenciais e Acessos"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════════════════════════════ */}
      {/* MODAL DE CADASTRO: NOVO USUÁRIO                                              */}
      {/* ══════════════════════════════════════════════════════════════════════════════ */}
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
                      Cadastrar Novo Usuário na Suite
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      Crie o login com e-mail e senha confirmados para acesso imediato.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nome Completo
                  </label>
                  <input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ex: Ana Clara Santos"
                    className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none text-foreground"
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    E-mail / Login de Acesso
                  </label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="ana.santos@empresa.com"
                    className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono text-foreground"
                  />
                </div>

                {/* Senha */}
                <div className="space-y-1 sm:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                      Senha Inicial
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const pass = generateStrongPassword();
                          setNewPassword(pass);
                          setNewShowPassword(true);
                          copyToClipboard(pass, "Senha gerada e copiada!");
                        }}
                        className="text-[10px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                      >
                        <Sparkles className="h-3 w-3" /> Gerar Aleatória
                      </button>
                      {newPassword && (
                        <button
                          type="button"
                          onClick={() => copyToClipboard(newPassword, "Senha copiada para enviar!")}
                          className="text-[10px] font-black uppercase text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <Copy className="h-3 w-3" /> Copiar Senha
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="relative">
                    <input
                      type={newShowPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 pr-10 text-sm focus:border-primary focus:outline-none font-mono text-foreground"
                    />
                    <button
                      type="button"
                      onClick={() => setNewShowPassword((v) => !v)}
                      className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      {newShowPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Cargo / Função
                  </label>
                  <select
                    value={newPosition}
                    onChange={(e) => {
                      const pos = e.target.value;
                      setNewPosition(pos);
                      const defaults = CARGO_DEFAULT_PERMISSIONS[pos] || {};
                      setNewPermissions(defaults);
                    }}
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none"
                  >
                    {allowedAssignable.positions.map((pos: string) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Nível de Acesso (Role)
                  </label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs font-bold text-foreground focus:outline-none"
                  >
                    {allowedAssignable.roles.map((r: any) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Matriz de Permissões Sugeridas */}
              <div className="space-y-2 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase font-bold">
                    Permissões por Módulo
                  </label>
                  <span className="text-[9px] font-black uppercase text-primary/80">
                    Preset de "{newPosition}" Ativo
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {PERMISSION_PAGES.map(({ key, label }) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-background/40 p-2"
                    >
                      <span className="text-[10px] font-bold text-foreground truncate max-w-[110px]">
                        {label}
                      </span>
                      <select
                        value={newPermissions[key] || "none"}
                        onChange={(e) =>
                          setNewPermissions((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className={`rounded border border-white/10 bg-background px-1.5 py-1 text-[10px] font-black uppercase focus:outline-none ${
                          newPermissions[key] === "edit"
                            ? "text-primary"
                            : newPermissions[key] === "view"
                            ? "text-blue-400"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        <option value="none" className="text-muted-foreground">Nenhum</option>
                        <option value="view" className="text-blue-400">Leitura</option>
                        <option value="edit" className="text-primary">Escrita</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase text-muted-foreground hover:bg-white/5 transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={creating}
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:shadow-glow transition disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  <span>{creating ? "Cadastrando..." : "Cadastrar Usuário"}</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── SAC Constants ───────────────────────────────────────────────────────────
const TICKET_TYPES_SAC = [
  { value: "bug",         label: "Bug / Erro",   emoji: "🐛", desc: "Algo não funciona corretamente",   border: "border-red-500/30 bg-red-500/5"      },
  { value: "melhoria",   label: "Melhoria",      emoji: "💡", desc: "Ideia para melhorar o sistema",    border: "border-blue-500/30 bg-blue-500/5"    },
  { value: "reclamacao", label: "Reclamação",     emoji: "😤", desc: "Algo que me incomoda",             border: "border-orange-500/30 bg-orange-500/5" },
  { value: "outro",      label: "Outro",          emoji: "📝", desc: "Qualquer outro feedback",          border: "border-purple-500/30 bg-purple-500/5" },
];
const PRIORITIES_SAC = [
  { value: "baixa",   label: "Baixa",   color: "text-green-400"  },
  { value: "normal",  label: "Normal",  color: "text-blue-400"   },
  { value: "alta",    label: "Alta",    color: "text-orange-400" },
  { value: "critica", label: "Crítica", color: "text-red-400"    },
];
const STATUS_MAP_SAC: Record<string, { label: string; color: string }> = {
  aberto:     { label: "Aberto",      color: "bg-blue-500/20 text-blue-400 border-blue-500/30"      },
  em_analise: { label: "Em Análise",  color: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  resolvido:  { label: "Resolvido",   color: "bg-green-500/20 text-green-400 border-green-500/30"   },
  fechado:    { label: "Fechado",     color: "bg-white/10 text-muted-foreground border-white/10"    },
};
function sacTypeCard(type: string) {
  return TICKET_TYPES_SAC.find(t => t.value === type)?.border ?? "border-white/10 bg-white/[0.02]";
}

function TabSac({ isAdmin, userId }: { isAdmin: boolean; userId: string }) {
  const qc = useQueryClient();
  const [type, setType]           = useState("bug");
  const [priority, setPriority]   = useState("normal");
  const [title, setTitle]         = useState("");
  const [description, setDesc]    = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [filterStatus, setFilterStatus] = useState("todos");
  const [filterType,   setFilterType]   = useState("todos");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [adminNotes,   setAdminNotes]   = useState<Record<string, string>>({});

  const { data: myTickets = [] } = useQuery({
    queryKey: ["sac_my_tickets", userId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("sac_tickets").select("*")
        .eq("user_id", userId).order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: !!userId,
    refetchInterval: 30000,
  });

  const { data: allTickets = [], isLoading: loadingAll } = useQuery({
    queryKey: ["sac_all_tickets"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("sac_tickets").select("*")
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
    enabled: isAdmin,
    refetchInterval: 15000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("sac_tickets").insert({
        user_id: userId || null, type, priority,
        title: title.trim(), description: description.trim(), status: "aberto",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      qc.invalidateQueries({ queryKey: ["sac_my_tickets"] });
      qc.invalidateQueries({ queryKey: ["sac_all_tickets"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status: string; notes?: string }) => {
      const { error } = await (supabase as any).from("sac_tickets")
        .update({ status, admin_notes: notes ?? null, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sac_all_tickets"] }); toast.success("Status atualizado!"); },
    onError: (e: any) => toast.error(e.message),
  });

  const filteredTickets = allTickets.filter((t: any) => {
    if (filterStatus !== "todos" && t.status !== filterStatus) return false;
    if (filterType   !== "todos" && t.type   !== filterType)   return false;
    return true;
  });
  const newCount = allTickets.filter((t: any) => t.status === "aberto").length;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="header-sport font-display text-lg font-semibold flex items-center gap-2 text-gradient">
          <MessageSquareWarning className="h-5 w-5 text-primary" /> SAC — Central de Feedback
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Reporte bugs, sugira melhorias ou deixe sua reclamação. Seus envios são confidenciais — apenas os admins recebem.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── FORMULÁRIO ─────────────────────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center py-10 text-center gap-4">
                <div className="h-14 w-14 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                  <Check className="h-7 w-7 text-green-400" />
                </div>
                <div>
                  <h4 className="font-bold">Recebido! 🙏</h4>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">Seu feedback foi enviado para os administradores. Obrigado!</p>
                </div>
                <button onClick={() => { setType("bug"); setPriority("normal"); setTitle(""); setDesc(""); setSubmitted(false); }}
                  className="rounded-full bg-primary/20 text-primary border border-primary/30 px-5 py-2 text-xs font-bold hover:bg-primary/30 transition">
                  Enviar outro
                </button>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Tipo</label>
                  <div className="grid grid-cols-2 gap-2">
                    {TICKET_TYPES_SAC.map(t => (
                      <button key={t.value} type="button" onClick={() => setType(t.value)}
                        className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${type === t.value ? t.border : "border-white/10 bg-white/[0.02] hover:bg-white/5"}`}>
                        <span className="text-lg">{t.emoji}</span>
                        <div><p className="text-xs font-bold leading-tight">{t.label}</p><p className="text-[9px] text-muted-foreground">{t.desc}</p></div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Prioridade</label>
                  <div className="flex gap-2">
                    {PRIORITIES_SAC.map(p => (
                      <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                        className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition-all ${priority === p.value ? `border-white/20 bg-white/10 ${p.color}` : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Título</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} maxLength={100}
                    placeholder="Resumo do problema ou sugestão..."
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Descrição</label>
                  <textarea value={description} onChange={e => setDesc(e.target.value)} rows={3} maxLength={1000}
                    placeholder="Descreva com detalhes: o que estava fazendo, o que aconteceu..."
                    className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none resize-none" />
                  <p className="text-[9px] text-muted-foreground text-right">{description.length}/1000</p>
                </div>
                <button onClick={() => { if (!title.trim()) return toast.error("Informe um título"); if (!description.trim()) return toast.error("Descreva o problema"); submitMutation.mutate(); }}
                  disabled={submitMutation.isPending}
                  className="w-full rounded-full bg-primary py-2.5 text-sm font-black text-background hover:opacity-90 active:scale-95 transition flex items-center justify-center gap-2 disabled:opacity-50">
                  {submitMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Enviar Feedback
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── PAINEL ADMIN / MEUS ENVIOS ──────────────────────────────────── */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
          {isAdmin ? (
            <>
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm flex items-center gap-2">
                  Painel Admin
                  {newCount > 0 && <span className="rounded-full bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 text-[9px] font-black">{newCount} novo{newCount !== 1 ? "s" : ""}</span>}
                </h4>
                <span className="text-[10px] text-muted-foreground">{filteredTickets.length} tickets</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["todos", "aberto", "em_analise", "resolvido", "fechado"].map(s => (
                  <button key={s} onClick={() => setFilterStatus(s)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold border transition-all ${filterStatus === s ? "bg-primary/20 text-primary border-primary/30" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                    {s === "todos" ? "Todos" : STATUS_MAP_SAC[s]?.label ?? s}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["todos", ...TICKET_TYPES_SAC.map(t => t.value)].map(tp => (
                  <button key={tp} onClick={() => setFilterType(tp)}
                    className={`rounded-lg px-2 py-1 text-[10px] font-bold border transition-all ${filterType === tp ? "bg-primary/20 text-primary border-primary/30" : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                    {tp === "todos" ? "Todos" : TICKET_TYPES_SAC.find(t => t.value === tp)?.emoji + " " + TICKET_TYPES_SAC.find(t => t.value === tp)?.label}
                  </button>
                ))}
              </div>
              {loadingAll ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary/50" /></div>
              ) : filteredTickets.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground">Nenhum ticket encontrado.</div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredTickets.map((tk: any) => {
                    const st  = STATUS_MAP_SAC[tk.status] ?? STATUS_MAP_SAC.aberto;
                    const tp  = TICKET_TYPES_SAC.find(t => t.value === tk.type);
                    const pri = PRIORITIES_SAC.find(p => p.value === tk.priority);
                    const isOpen = expandedId === tk.id;
                    return (
                      <motion.div key={tk.id} layout className={`rounded-xl border overflow-hidden ${sacTypeCard(tk.type)}`}>
                        <button type="button" onClick={() => setExpandedId(isOpen ? null : tk.id)}
                          className="w-full flex items-start gap-3 p-3 text-left hover:bg-white/[0.02] transition">
                          <span className="text-lg shrink-0">{tp?.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-xs font-bold truncate">{tk.title}</p>
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                              <span className={`text-[9px] font-bold ${pri?.color ?? ""}`}>{pri?.label}</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{tk.description}</p>
                            <p className="text-[9px] text-muted-foreground/50 font-mono mt-1">
                              {new Date(tk.created_at).toLocaleString("pt-BR")} · #{String(tk.user_id ?? "anon").slice(-6)}
                            </p>
                          </div>
                          <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </button>
                        <AnimatePresence>
                          {isOpen && (
                            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                              <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
                                <p className="text-xs text-foreground/80 leading-relaxed">{tk.description}</p>
                                <textarea rows={2} placeholder="Nota interna (visível ao usuário)..."
                                  value={adminNotes[tk.id] ?? (tk.admin_notes || "")}
                                  onChange={e => setAdminNotes(prev => ({ ...prev, [tk.id]: e.target.value }))}
                                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none resize-none" />
                                <div className="flex flex-wrap gap-1.5">
                                  {["aberto", "em_analise", "resolvido", "fechado"].map(s => (
                                    <button key={s} disabled={tk.status === s || updateStatus.isPending}
                                      onClick={() => updateStatus.mutate({ id: tk.id, status: s, notes: adminNotes[tk.id] ?? tk.admin_notes })}
                                      className={`rounded-lg px-2.5 py-1 text-[10px] font-bold border transition-all disabled:opacity-40 ${tk.status === s ? STATUS_MAP_SAC[s].color : "border-white/10 text-muted-foreground hover:bg-white/5"}`}>
                                      {STATUS_MAP_SAC[s]?.label}
                                    </button>
                                  ))}
                                  <button onClick={() => updateStatus.mutate({ id: tk.id, status: tk.status, notes: adminNotes[tk.id] ?? tk.admin_notes })}
                                    disabled={updateStatus.isPending}
                                    className="ml-auto rounded-lg px-2.5 py-1 text-[10px] font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition">
                                    Salvar Nota
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <>
              <h4 className="font-bold text-sm flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" /> Meus Envios
              </h4>
              {myTickets.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground">
                  <MessageSquareWarning className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">Nenhum envio ainda.</p>
                  <p className="text-xs mt-1 opacity-60">Seus feedbacks aparecerão aqui após o envio.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                  {myTickets.map((tk: any) => {
                    const st = STATUS_MAP_SAC[tk.status] ?? STATUS_MAP_SAC.aberto;
                    const tp = TICKET_TYPES_SAC.find(t => t.value === tk.type);
                    return (
                      <div key={tk.id} className={`rounded-xl border p-3 space-y-1.5 ${sacTypeCard(tk.type)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold">{tp?.emoji} {tk.title}</p>
                          <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full border ${st.color}`}>{st.label}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2">{tk.description}</p>
                        <p className="text-[9px] text-muted-foreground/50 font-mono">{new Date(tk.created_at).toLocaleString("pt-BR")}</p>
                        {tk.admin_notes && (
                          <div className="mt-1 rounded-lg bg-primary/10 border border-primary/20 px-3 py-2">
                            <p className="text-[9px] font-black text-primary uppercase mb-0.5">Resposta dos Admins</p>
                            <p className="text-[11px] text-foreground">{tk.admin_notes}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TabAgente() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // Estados locais do formulário de configs
  const [modelName, setModelName] = useState("gemini-2.5-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [ragThreshold, setRagThreshold] = useState(0.70);
  const [ragCount, setRagCount] = useState(5);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // Estados locais do formulário de novos conhecimentos
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState("manual");
  const [newContent, setNewContent] = useState("");
  const [addingDoc, setAddingDoc] = useState(false);
  const [knowledgeSearch, setKnowledgeSearch] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState("todos");

  // Query das configurações
  const { data: config, isLoading: loadingConfig } = useQuery({
    queryKey: ["victoria_config_user", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from("victoria_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Query dos conhecimentos cadastrados
  const { data: knowledgeList = [], isLoading: loadingKnowledge, refetch: refetchKnowledge } = useQuery({
    queryKey: ["victoria_knowledge_user", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await (supabase as any)
        .from("victoria_knowledge")
        .select("id, title, category, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.id,
  });

  // Preenche os inputs quando a config do banco for carregada
  useEffect(() => {
    if (config) {
      setModelName(config.model_name || "gemini-2.5-flash");
      setTemperature(config.temperature !== undefined ? Number(config.temperature) : 0.7);
      setRagThreshold(config.rag_threshold !== undefined ? Number(config.rag_threshold) : 0.70);
      setRagCount(config.rag_count !== undefined ? Number(config.rag_count) : 5);
      setSystemPrompt(config.system_prompt || "");
    }
  }, [config]);

  // Salvar configurações
  const handleSaveConfig = async () => {
    if (!user?.id) return;
    setSavingConfig(true);
    try {
      const { error } = await (supabase as any)
        .from("victoria_configs")
        .upsert({
          user_id: user.id,
          model_name: modelName,
          temperature,
          rag_threshold: ragThreshold,
          rag_count: ragCount,
          system_prompt: systemPrompt,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("Configurações do Agente salvas com sucesso!");
      qc.invalidateQueries({ queryKey: ["victoria_config_user", user?.id] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar configurações do agente.");
    } finally {
      setSavingConfig(false);
    }
  };

  // Adicionar novo documento à base de conhecimento (com embedding na Edge Function)
  const handleAddDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) {
      toast.error("Preencha o título e o conteúdo do documento.");
      return;
    }
    setAddingDoc(true);
    try {
      const { data, error } = await supabase.functions.invoke("victoria-agent", {
        body: {
          action: "add_knowledge",
          title: newTitle.trim(),
          category: newCategory,
          content: newContent.trim()
        }
      });

      if (error) throw error;
      toast.success("Documento adicionado à Base de Conhecimento e indexado via RAG!");
      setNewTitle("");
      setNewContent("");
      refetchKnowledge();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao adicionar documento.");
    } finally {
      setAddingDoc(false);
    }
  };

  // Excluir documento
  const handleDeleteDocument = async (id: string) => {
    if (!confirm("Deseja realmente remover este documento da base de conhecimento da Victoria?")) return;
    try {
      const { error } = await (supabase as any)
        .from("victoria_knowledge")
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Documento removido da Base de Conhecimento!");
      refetchKnowledge();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao excluir documento.");
    }
  };

  const filteredKnowledge = knowledgeList.filter((k: any) => {
    const matchesSearch = k.title.toLowerCase().includes(knowledgeSearch.toLowerCase()) || 
                          k.content.toLowerCase().includes(knowledgeSearch.toLowerCase());
    const matchesCategory = selectedCategoryFilter === "todos" || k.category === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div>
        <h3 className="header-sport font-display text-lg font-semibold flex items-center gap-2 text-gradient">
          <Brain className="h-5 w-5 text-primary" /> Personalidade e Configurações da Victoria AI
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Ajuste as diretrizes táticas, controle a temperatura das respostas e gerencie o motor de RAG (Busca Vetorial).
        </p>
      </div>

      {loadingConfig ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Coluna 1 e 2: Formulário do Agente */}
          <div className="space-y-6 lg:col-span-2">
            <div className="glass-panel p-6 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2">
                <Settings className="h-4 w-4 text-primary" /> Configurações de Geração
              </h4>

              <div className="grid gap-4 sm:grid-cols-2">
                {/* Modelo */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Modelo da Linguagem (Gemini)</label>
                  <select
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2.5 text-xs text-white focus:border-primary focus:outline-none"
                  >
                    <option value="gemini-2.5-flash">Gemini 2.5 Flash (Padrão e Rápido)</option>
                    <option value="gemini-1.5-pro">Gemini 1.5 Pro (Mais Analítico)</option>
                    <option value="gemini-1.5-flash">Gemini 1.5 Flash (Leve)</option>
                  </select>
                </div>

                {/* Temperatura */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Criatividade (Temperatura)</label>
                    <span className="text-[10px] font-mono font-bold text-primary">{temperature.toFixed(1)}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="0.0"
                      max="1.5"
                      step="0.1"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value))}
                      className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                    />
                  </div>
                </div>

                {/* RAG Threshold */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Filtro de Similaridade RAG (Threshold)</label>
                    <span className="text-[10px] font-mono font-bold text-primary">{ragThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.30"
                    max="0.95"
                    step="0.05"
                    value={ragThreshold}
                    onChange={(e) => setRagThreshold(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                  />
                </div>

                {/* RAG Count */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Máximo de Fragmentos no RAG</label>
                    <span className="text-[10px] font-mono font-bold text-primary">{ragCount} blocos</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="15"
                    step="1"
                    value={ragCount}
                    onChange={(e) => setRagCount(parseInt(e.target.value))}
                    className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                  />
                </div>
              </div>

              {/* Prompt de Sistema */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Instruções de Personalidade (System Prompt)</label>
                  {!systemPrompt && (
                    <span className="text-[9px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">Usando Prompt Padrão da Victoria</span>
                  )}
                </div>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Se deixado em branco, ela usará a personalidade padrão de Estrategista Sênior de Tráfego Pago Automotivo (NC Performance). Digite aqui para customizar o tom de voz e diretrizes específicas..."
                  className="w-full min-h-[220px] rounded-xl border border-white/10 bg-background/50 p-3 text-xs focus:border-primary focus:outline-none font-mono leading-relaxed"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={savingConfig}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:shadow-glow disabled:opacity-50 transition cursor-pointer"
                >
                  {savingConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Salvar Configurações do Agente
                </button>
              </div>
            </div>

            {/* Gerenciador de Documentos de Conhecimento */}
            <div className="glass-panel p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-primary" /> Documentos da Base de Conhecimento RAG
                </h4>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={knowledgeSearch}
                    onChange={(e) => setKnowledgeSearch(e.target.value)}
                    placeholder="Filtrar base..."
                    className="rounded-lg border border-white/10 bg-background/50 px-2.5 py-1 text-[11px] focus:outline-none focus:border-primary w-32 sm:w-44"
                  />
                  <select
                    value={selectedCategoryFilter}
                    onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                    className="rounded-lg border border-white/10 bg-background px-2 py-1 text-[11px] focus:outline-none"
                  >
                    <option value="todos">Todos</option>
                    <option value="manual">Manuais</option>
                    <option value="faq">FAQ</option>
                    <option value="custom">Outros</option>
                  </select>
                </div>
              </div>

              {loadingKnowledge ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : filteredKnowledge.length === 0 ? (
                <p className="text-center text-xs text-muted-foreground py-8">Nenhum documento de conhecimento indexado nesta categoria.</p>
              ) : (
                <div className="grid gap-3 max-h-[350px] overflow-y-auto pr-1 custom-scrollbar">
                  {filteredKnowledge.map((k: any) => (
                    <div key={k.id} className="rounded-xl border border-white/5 bg-background/40 p-4 flex flex-col justify-between hover:border-primary/20 transition">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className={`inline-block text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full border mb-1.5 ${
                            k.category === "manual" ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                            k.category === "faq" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                            "bg-purple-500/10 border-purple-500/20 text-purple-400"
                          }`}>
                            {k.category}
                          </span>
                          <h5 className="text-xs font-bold text-white">{k.title}</h5>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteDocument(k.id)}
                          className="text-muted-foreground hover:text-destructive p-1 transition"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-2 line-clamp-3 leading-relaxed whitespace-pre-wrap">{k.content}</p>
                      <p className="text-[8px] text-muted-foreground/30 font-mono mt-3">{new Date(k.created_at).toLocaleString("pt-BR")}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Coluna 3: Cadastrar Novo Documento */}
          <div className="space-y-6">
            <form onSubmit={handleAddDocument} className="glass-panel p-6 space-y-4">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5 border-b border-white/5 pb-2">
                <Plus className="h-4 w-4 text-primary" /> Indexar Conhecimento
              </h4>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Adicione dados de estoque de carros, FAQs de ofertas ou scripts de conversão. 
                O sistema gerará automaticamente os vetores (embeddings) para que a Victoria consulte em tempo real.
              </p>

              {/* Título */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Título do Bloco</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Tabela de Preços Jeep Renegade Junho"
                  className="w-full rounded-xl border border-white/10 bg-background/50 px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                />
              </div>

              {/* Categoria */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Categoria</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-xs text-white focus:border-primary focus:outline-none"
                >
                  <option value="manual">Manual / Script de Vendas</option>
                  <option value="faq">Estoque / FAQ</option>
                  <option value="custom">Outros Dados Táticos</option>
                </select>
              </div>

              {/* Conteúdo */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Conteúdo Detalhado</label>
                <textarea
                  required
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="Cole aqui o texto corrido, especificações de carros ou informações detalhadas..."
                  className="w-full min-h-[160px] rounded-xl border border-white/10 bg-background/50 p-3 text-xs focus:border-primary focus:outline-none leading-relaxed"
                />
              </div>

              <button
                type="submit"
                disabled={addingDoc}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:shadow-glow disabled:opacity-50 transition cursor-pointer"
              >
                {addingDoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Cadastrar e Indexar RAG
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
