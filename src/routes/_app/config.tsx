import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Globe, Check, X, Loader2, Wifi, WifiOff, ChevronDown, Zap, Brain, LayoutDashboard, FileText, Target, Upload, Send, Users, Database, Lock, MessageSquareWarning, Bug, Lightbulb, Frown, HelpCircle, StickyNote, Filter, Eye, Clock, Megaphone, Share2, RefreshCw, Instagram } from "lucide-react";
import { SyncButton } from "@/components/SyncButton";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";

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
      let { data } = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
      
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
        const retry = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
        data = retry.data;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
  const isAdmin = profile?.role === "admin" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const perms = (profile as any)?.permissions ?? {};
  const canManageUsers = isAdmin || !!perms.criar_usuarios;

  const visibleTabs = TABS.filter(t => {
    if (!t.adminOnly) return true;
    if (t.id === "usuarios") return canManageUsers;
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
        {tab === "usuarios"    && canManageUsers && <TabUsuarios isAdmin={isAdmin} />}
        {tab === "clientes"    && isAdmin && <TabClientes />}
        {tab === "integracoes" && isAdmin && <TabIntegracoes />}
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
  
  // Social Media states
  const [loadingPages, setLoadingPages] = useState(false);

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

  const save = async () => {
    if (!token.trim()) { toast.error("Preencha o Token"); return; }
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("meta_ads_configs").upsert({
        user_id: u.user?.id,
        access_token: token,
        ad_account_id: "ALL_ACCOUNTS",
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("✅ Token do Meta salvo com sucesso!");
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

        {/* Módulo de Redes Sociais da Meta */}
        <div className="rounded-xl border border-white/5 bg-white/[0.02] p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Share2 className="h-4.5 w-4.5 text-primary animate-pulse" />
            <h4 className="text-xs font-bold uppercase tracking-wider">Redes Sociais da Meta</h4>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Sincronize e gerencie todas as Páginas do Facebook e contas associadas do Instagram vinculadas ao seu token de acesso.
          </p>
          <div className="flex gap-2">
            <button
              onClick={fetchPages}
              disabled={loadingPages || !token}
              type="button"
              className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-medium hover:bg-white/10 transition disabled:opacity-50 cursor-pointer"
            >
              {loadingPages ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sincronizar Páginas e Perfis
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

      {/* GOOGLE ADS CONFIG */}
      <div>
        <h3 className="header-sport font-display text-lg font-semibold flex items-center gap-2 text-gradient">
          <Globe className="h-5 w-5 text-[#4285F4]" /> Google Ads Multicanal
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          Conecte sua MCC ou contas isoladas do Google Ads para unificar o seu tráfego no Dashboard.
        </p>
      </div>

      <div className="grid gap-4">
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
          className="w-full flex items-center justify-center gap-3 rounded-xl border border-dashed border-[#4285F4]/30 bg-[#4285F4]/5 p-6 hover:bg-[#4285F4]/10 hover:border-[#4285F4]/50 transition cursor-pointer"
        >
          {isProcessingAuth ? <Loader2 className="h-5 w-5 animate-spin text-[#4285F4]" /> : <Plus className="h-5 w-5 text-[#4285F4]" />}
          <span className="text-sm font-bold text-[#4285F4]">
            {isProcessingAuth ? "Processando..." : "Nova Conexão Google Ads"}
          </span>
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

function TabUsuarios({ isAdmin }: { isAdmin: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editRole, setEditRole] = useState("outro");
  const [editPosition, setEditPosition] = useState("Gestor de Tráfego");
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editPermissions, setEditPermissions] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPosition, setNewPosition] = useState("Gestor de Tráfego");
  const [newRole, setNewRole] = useState("outro");
  const [newPermissions, setNewPermissions] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const handleSetPermissionLevel = async (userId: string, targetEmail: string, key: string, level: string, currentPerms: any) => {
    if (targetEmail === "nc.marketingrj@gmail.com") {
      toast.error("O Administrador Master possui acesso total vitalício e suas permissões não podem ser alteradas.");
      return;
    }
    
    const updated = { ...(currentPerms ?? {}), [key]: level };
    try {
      const { error } = await (supabase as any).rpc("admin_set_user_permissions", {
        target_user_id: userId,
        new_permissions: updated,
      });
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar permissão");
    }
  };

  const POSITIONS_LIST = [
    "Gestor de Tráfego",
    "Gestor de Projetos",
    "Social Media",
    "Desenvolvedor",
    "Designer",
    "Diretor",
    "CEO",
    "Administrador",
    "SDR",
    "Gerente",
    "Outros",
  ];

  // Carrega todos os perfis cadastrados no banco
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin_users_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  const handleDelete = async (userId: string, targetEmail?: string, targetRole?: string) => {
    if (targetEmail === "nc.marketingrj@gmail.com") {
      toast.error("O Administrador Master (nc.marketingrj@gmail.com) é protegido e não pode ser excluído do sistema.");
      return;
    }
    if (targetRole === "admin" && !isAdmin) {
      toast.error("Apenas administradores podem excluir outros administradores.");
      return;
    }
    if (targetRole === "admin" && user?.email !== "nc.marketingrj@gmail.com") {
      toast.error("Apenas o Administrador Master pode excluir outras contas administrativas.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir permanentemente este usuário da Suite? Esta ação não pode ser desfeita.")) return;
    try {
      const { error } = await (supabase as any).rpc("admin_delete_user", { target_user_id: userId });
      if (error) throw error;
      toast.success("Usuário excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário");
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    
    // Protege o Master Admin contra edições de terceiros
    if (editingUser.email === "nc.marketingrj@gmail.com" && user?.email !== "nc.marketingrj@gmail.com") {
      toast.error("Acesso negado. Apenas o próprio Administrador Master pode editar seus dados.");
      return;
    }
    
    // Apenas o Master Admin pode criar/atualizar outras contas como Admin
    if (editRole === "admin" && user?.email !== "nc.marketingrj@gmail.com" && editingUser.role !== "admin") {
      toast.error("Apenas o Administrador Master pode nomear novos administradores.");
      return;
    }

    if (editingUser.role === "admin" && !isAdmin) {
      toast.error("Apenas administradores podem editar outros administradores.");
      return;
    }
    
    if (editingUser.role === "admin" && user?.email !== "nc.marketingrj@gmail.com" && editingUser.email !== user?.email) {
      toast.error("Apenas o Administrador Master pode editar outras contas administrativas.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await (supabase as any).rpc("admin_update_user", {
        target_user_id: editingUser.id,
        new_role: editRole,
        new_position: editPosition,
        new_name: editName,
        new_password: editPassword.trim() || null
      });
      if (error) throw error;

      // Update permissions
      if (editingUser.email !== "nc.marketingrj@gmail.com") {
        const { error: permErr } = await (supabase as any).rpc("admin_set_user_permissions", {
          target_user_id: editingUser.id,
          new_permissions: editPermissions,
        });
        if (permErr) throw permErr;
      }

      toast.success("Dados do usuário atualizados!");
      setEditingUser(null);
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao atualizar usuário");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateUser = async () => {
    if (!newEmail.trim() || !newPassword.trim() || !newName.trim()) {
      toast.error("Por favor, preencha todos os campos obrigatórios.");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    if (newRole === "admin" && user?.email !== "nc.marketingrj@gmail.com") {
      toast.error("Apenas o Administrador Master pode criar contas administrativas.");
      return;
    }
    
    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Faça login novamente.");

      const { data, error } = await supabase.functions.invoke("admin-create-user", {
        body: {
          new_email: newEmail.trim(),
          new_password: newPassword.trim(),
          new_name: newName.trim(),
          new_position: newPosition,
          new_role: newRole,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Now set the permissions if there are any configured
      if (data?.user_id && newRole !== "admin") {
        const { error: permErr } = await (supabase as any).rpc("admin_set_user_permissions", {
          target_user_id: data.user_id,
          new_permissions: newPermissions,
        });
        if (permErr) {
          console.error("Erro ao definir permissões iniciais:", permErr);
          toast.warning("Usuário criado, mas houve um erro ao definir as permissões padrão.");
        }
      }

      toast.success("Novo usuário cadastrado com sucesso!");
      setShowAddModal(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewPosition("Gestor de Tráfego");
      setNewRole("outro");
      setNewPermissions({});
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar usuário");
    } finally {
      setCreating(false);
    }
  };

  const filteredUsers = users.filter((u: any) => 
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) || 
    (u.position || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
        <div>
          <h3 className="header-sport font-display text-lg font-semibold text-gradient">Gestão Completa de Usuários</h3>
          <p className="text-xs text-muted-foreground mt-1">Gerencie permissões, cargos, atualize informações e exclua contas de equipe.</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <input 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
            placeholder="Buscar por nome ou cargo..." 
            className="w-full sm:w-64 rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none" 
          />
          <button 
            onClick={() => setShowAddModal(true)} 
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:shadow-glow transition"
          >
            <Plus className="h-3.5 w-3.5" /> NOVO USUÁRIO
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filteredUsers.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filteredUsers.map((u: any) => {
            const isMasterAdmin = u.email === "nc.marketingrj@gmail.com";
            return (
              <div key={u.id} className={`rounded-xl border bg-background/40 p-4 transition duration-300 space-y-3 ${isMasterAdmin ? "border-primary/35 shadow-glow/5" : "border-white/5 hover:border-primary/20"}`}>

                {/* Linha superior: avatar + info + ações */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-10 w-10 rounded-full overflow-hidden flex items-center justify-center shrink-0 border ${isMasterAdmin ? "bg-primary/20 border-primary" : "bg-primary/10 border-primary/20"}`}>
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                        : <User className={`h-5 w-5 ${isMasterAdmin ? "text-primary animate-pulse" : "text-primary"}`} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1.5 flex-wrap">
                        {u.full_name || "Membro Sem Nome"}
                        {isMasterAdmin ? (
                          <span className="rounded-full bg-gradient-to-r from-yellow-500 to-primary px-2.5 py-0.5 text-[8px] font-black tracking-widest text-background">
                            MASTER ADMIN
                          </span>
                        ) : (
                          <span className={`rounded-full px-2 py-0.5 text-[8px] font-black tracking-widest ${u.role === "admin" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground"}`}>
                            {ROLE_LABEL[u.role] ?? "MEMBRO"}
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">{u.position || "Sem cargo"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isMasterAdmin ? (
                      user?.email === "nc.marketingrj@gmail.com" ? (
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole("admin");
                            setEditPosition(u.position || POSITIONS_LIST[0]);
                            setEditName(u.full_name || "");
                            setEditPassword("");
                            setEditPermissions(u.permissions || {});
                          }}
                          className="rounded-full border border-primary/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-primary hover:bg-primary/10 transition"
                        >
                          Editar Meus Dados
                        </button>
                      ) : (
                        <span className="flex items-center gap-1 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                          <Lock className="h-2.5 w-2.5" /> Protegido
                        </span>
                      )
                    ) : u.role === "admin" && user?.email !== "nc.marketingrj@gmail.com" ? (
                      <span className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">
                        <Lock className="h-2.5 w-2.5" /> Admin
                      </span>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingUser(u);
                            setEditRole(u.role || "outro");
                            setEditPosition(u.position || POSITIONS_LIST[0]);
                            setEditName(u.full_name || "");
                            setEditPassword("");
                            setEditPermissions(u.permissions || {});
                          }}
                          className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5 transition"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.email, u.role)}
                          className="rounded-full border border-red-500/20 bg-red-500/5 px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-red-400 hover:bg-red-500/10 transition"
                        >
                          Excluir
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Linha de permissões */}
                <div className="border-t border-white/5 pt-3">
                  {isMasterAdmin ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-primary/80 font-black uppercase tracking-wider">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Administrador Master — Acesso Total Vitalício Protegido
                    </div>
                  ) : u.role === "admin" ? (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider">
                      <Lock className="h-3 w-3" /> Acesso total — permissões bloqueadas
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">Configuração de Acessos:</span>
                      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                        {PERMISSION_PAGES.map(({ key, label }) => {
                          const level = u.permissions?.[key] || "none";
                          return (
                            <div key={key} className="flex flex-col gap-1 bg-white/[0.02] border border-white/5 rounded-lg p-1.5 justify-between">
                              <span className="text-[9px] font-bold text-muted-foreground truncate">{label}</span>
                              <select
                                value={level}
                                onChange={(e) => handleSetPermissionLevel(u.id, u.email, key, e.target.value, u.permissions)}
                                className={`bg-transparent text-[10px] font-black uppercase focus:outline-none cursor-pointer border-none p-0 ${
                                  level === "edit" ? "text-primary" : level === "view" ? "text-blue-400" : "text-muted-foreground/40"
                                }`}
                              >
                                <option value="none" className="bg-background text-muted-foreground">Sem Acesso</option>
                                <option value="view" className="bg-background text-blue-400">Leitura</option>
                                <option value="edit" className="bg-background text-primary">Escrita</option>
                              </select>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Cadastro */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
              <h4 className="font-display text-base font-bold text-gradient text-center uppercase tracking-wide">Cadastrar Novo Usuário</h4>
              
              <div className="space-y-1.5">
                <label className="label-mono text-[10px] text-muted-foreground uppercase">Nome Completo</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ex: João Silva" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <label className="label-mono text-[10px] text-muted-foreground uppercase">E-mail</label>
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} type="email" placeholder="exemplo@gmail.com" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Senha de Acesso</label>
                  <button 
                    onClick={() => {
                      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                      let pass = "";
                      for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      setNewPassword(pass);
                    }}
                    type="button"
                    className="text-[9px] font-black uppercase text-primary hover:underline"
                  >
                    Gerar Aleatória
                  </button>
                </div>
                <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Acesso</label>
                  <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none">
                    <option value="gestor_trafego">Gestor de Tráfego</option>
                    <option value="social_media">Social Media / Gestora de Projeto</option>
                    <option value="gerente">Gerente</option>
                    <option value="ceo">CEO</option>
                    <option value="videomaker">Videomaker / Filmmaker</option>
                    <option value="outro">Outros</option>
                    <option value="admin">Administrador (Admin)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Cargo / Função</label>
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
                    {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
              </div>

              {/* Grid de Permissões Sugeridas/Customizáveis */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <div className="flex items-center justify-between">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Permissões de Acesso</label>
                  <span className="text-[9px] font-black uppercase text-primary/80">Sugestão de Cargo Aplicada</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {PERMISSION_PAGES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-background/30 p-2">
                      <span className="text-[10px] font-bold text-foreground truncate max-w-[120px]">{label}</span>
                      <select
                        value={newPermissions[key] || "none"}
                        onChange={(e) => setNewPermissions(prev => ({ ...prev, [key]: e.target.value }))}
                        className={`rounded border border-white/10 bg-background px-1.5 py-1 text-[10px] font-black uppercase focus:outline-none ${
                          newPermissions[key] === "edit" ? "text-primary" : newPermissions[key] === "view" ? "text-blue-400" : "text-muted-foreground/50"
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

              <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                <button onClick={() => setShowAddModal(false)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase">Cancelar</button>
                <button onClick={handleCreateUser} disabled={creating} className="rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase text-primary-foreground hover:shadow-glow transition disabled:opacity-50">
                  {creating ? "Cadastrando..." : "Cadastrar Usuário"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal de Edição */}
      <AnimatePresence>
        {editingUser && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
              <h4 className="font-display text-base font-bold text-gradient text-center uppercase tracking-wide">Alterar Dados do Usuário</h4>

              {editingUser?.email && (
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">E-mail</label>
                  <input value={editingUser.email} readOnly className="w-full rounded-lg border border-white/5 bg-background/20 px-3 py-2 text-sm text-muted-foreground cursor-not-allowed" />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="label-mono text-[10px] text-muted-foreground uppercase">Nome Completo</label>
                <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Nova Senha (Opcional)</label>
                  <button 
                    onClick={() => {
                      const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
                      let pass = "";
                      for (let i = 0; i < 10; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      setEditPassword(pass);
                    }}
                    type="button"
                    className="text-[9px] font-black uppercase text-primary hover:underline"
                  >
                    Gerar Aleatória
                  </button>
                </div>
                <input value={editPassword} onChange={(e) => setEditPassword(e.target.value)} placeholder="Deixar em branco para não alterar" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Acesso</label>
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none">
                    <option value="gestor_trafego">Gestor de Tráfego</option>
                    <option value="social_media">Social Media / Gestora de Projeto</option>
                    <option value="gerente">Gerente</option>
                    <option value="ceo">CEO</option>
                    <option value="videomaker">Videomaker / Filmmaker</option>
                    <option value="outro">Outros</option>
                    {isAdmin && <option value="admin">Administrador (Admin)</option>}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Cargo / Função</label>
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
                    {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
              </div>

              {/* Grid de Permissões Sugeridas/Customizáveis */}
              <div className="space-y-2 border-t border-white/5 pt-3">
                <div className="flex items-center justify-between">
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Permissões de Acesso</label>
                  <span className="text-[9px] font-black uppercase text-primary/80 font-semibold">Tabela de Níveis</span>
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {PERMISSION_PAGES.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between gap-2 rounded-lg border border-white/5 bg-background/30 p-2">
                      <span className="text-[10px] font-bold text-foreground truncate max-w-[120px]">{label}</span>
                      <select
                        value={editPermissions[key] || "none"}
                        onChange={(e) => setEditPermissions(prev => ({ ...prev, [key]: e.target.value }))}
                        className={`rounded border border-white/10 bg-background px-1.5 py-1 text-[10px] font-black uppercase focus:outline-none ${
                          editPermissions[key] === "edit" ? "text-primary" : editPermissions[key] === "view" ? "text-blue-400" : "text-muted-foreground/50"
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

              <div className="flex gap-2 justify-end pt-2 border-t border-white/5">
                <button onClick={() => setEditingUser(null)} className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold uppercase">Cancelar</button>
                <button onClick={handleUpdate} disabled={saving} className="rounded-full bg-primary px-5 py-2 text-xs font-bold uppercase text-primary-foreground hover:shadow-glow transition disabled:opacity-50">
                  {saving ? "Salvando..." : "Salvar Alterações"}
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
