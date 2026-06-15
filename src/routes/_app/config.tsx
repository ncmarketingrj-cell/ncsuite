import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Check, X, Loader2, Wifi, WifiOff, ChevronDown, Zap, Brain, LayoutDashboard, FileText, Target, Upload, Send, Users, Database, Lock, MessageSquareWarning, Bug, Lightbulb, Frown, HelpCircle, StickyNote, Filter, Eye, Clock, Megaphone } from "lucide-react";
import { SyncButton } from "@/components/SyncButton";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/config")({
  head: () => ({ meta: [{ title: "Configurações — NC Suite" }] }),
  component: ConfigPage,
});

const TABS = [
  { id: "conta",       label: "Meu Perfil",          icon: User,                   adminOnly: false },
  { id: "tutorial",   label: "NC Academy",            icon: BookOpen,               adminOnly: false },
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
  const [tab, setTab] = useState<Tab>("tutorial");

  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
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
        {tab === "tutorial"    && <TabTutorial />}
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
        <div className="grid grid-cols-3 gap-2">
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
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [showTokenPlain, setShowTokenPlain] = useState(false);
  
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
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      if (data) {
        setToken(data.access_token || "");
        setOpenaiConfigured(data.openai_key_configured || false);
      }
      setIsLoading(false);
    };
    loadConfig();
  }, []);

  const save = async () => {
    if (!token.trim()) { toast.error("Preencha o Token"); return; }
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("meta_ads_configs").upsert({
        user_id: u.user?.id,
        access_token: token,
        ad_account_id: "ALL_ACCOUNTS"
      }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("✅ Configurações salvas! Clique em 'Sincronizar Agora' no Dashboard.");
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
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            type={showTokenPlain ? "text" : "password"}
            placeholder="EAANmoU71vRU..."
            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none font-mono"
          />
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
      </div>

      <div className="flex items-center gap-3 pt-2 mb-8">
        <button onClick={save} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow transition">
          <Check className="h-3.5 w-3.5" /> SALVAR META ADS
        </button>
        <button onClick={test} disabled={testing} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium disabled:opacity-50 hover:bg-white/5">
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
             const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "620606037088-ndk939vngs3kpsf1jeb5u70g00b1v4vj.apps.googleusercontent.com"; 
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
    </div>
  );
}

function VisualGuide({ module, step }: { module: string, step: number }) {
  const [isOpen, setIsOpen] = useState(false);
  let imgSrc = "/assets/mockup-dashboard.png";
  let altText = "Visualização do Dashboard";

  if (module === "dashboard") {
    imgSrc = "/assets/mockup-dashboard.png";
    altText = "Painel principal e KPIs";
  } else if (module === "agente") {
    if (step === 2) {
      imgSrc = "/assets/victoria-maia.png";
      altText = "Victoria Maia - Análise Multimodal";
    } else {
      imgSrc = "/assets/mockup-victoria.png";
      altText = "Interface da Victoria AI";
    }
  } else if (module === "relatorios") {
    imgSrc = "/assets/mockup-reports.png";
    altText = "Painel de Relatórios";
  } else if (module === "campanhas") {
    imgSrc = "/assets/mockup-dashboard.png";
    altText = "Gestão de Campanhas de Tráfego";
  } else if (module === "automacoes") {
    imgSrc = "/assets/mockup-dashboard.png";
    altText = "Configurações de Alertas e Automações";
  } else if (module === "integracoes") {
    imgSrc = "/assets/nc-logo.png";
    altText = "Integrações Meta Ads e Google Ads";
  }

  return (
    <>
      <div 
        onClick={() => setIsOpen(true)}
        className="relative w-full h-64 bg-black/60 rounded-2xl border border-white/10 overflow-hidden group/guide flex items-center justify-center cursor-zoom-in mt-3"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent opacity-60 z-10" />
        <img 
          src={imgSrc} 
          alt={altText}
          className="w-full h-full object-cover transition-all duration-700 group-hover/guide:scale-105"
        />
        <div className="absolute bottom-3 left-3 right-3 bg-black/70 backdrop-blur-md border border-white/5 px-3 py-1.5 rounded-lg z-20 flex items-center justify-between">
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">{altText}</span>
          <span className="text-[9px] text-muted-foreground flex items-center gap-1">
            <Eye className="h-3 w-3" /> Ampliar Print
          </span>
        </div>
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 cursor-zoom-out"
          >
            <button 
              onClick={() => setIsOpen(false)}
              className="absolute top-4 right-4 h-10 w-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-all border border-white/10"
            >
              <X className="h-5 w-5" />
            </button>
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-5xl max-h-[90vh] overflow-hidden rounded-2xl border border-white/10 bg-background/50 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <img 
                src={imgSrc} 
                alt={altText}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
              <div className="bg-background/80 border-t border-white/10 px-6 py-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground">{altText}</h4>
                  <p className="text-xs text-muted-foreground">Print real do sistema</p>
                </div>
                <button 
                  onClick={() => setIsOpen(false)}
                  className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-primary-foreground hover:shadow-glow"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

const ACADEMY_MODULES = [
  {
    id: "dashboard",
    title: "1. Dashboard & KPIs",
    desc: "Acompanhe e analise dados consolidados em tempo real",
    icon: LayoutDashboard,
    steps: [
      {
        title: "Leitura de KPIs em Tempo Real",
        content: "No painel principal (Dashboard), você visualiza métricas consolidadas como Investimento, Leads Gerados, Cliques e Custo por Lead (CPL) Geral. As sparklines indicam a tendência do tráfego das últimas 24h.",
      },
      {
        title: "Filtros de Período e Conta",
        content: "Utilize o Date Range Picker no topo direito para escolher qualquer período de data personalizado. Use também o seletor de contas para isolar dados de uma única loja ou ver a performance agregada.",
      }
    ]
  },
  {
    id: "agente",
    title: "2. Victoria AI (Estrategista)",
    desc: "Tire dúvidas e execute otimizações com Inteligência Artificial",
    icon: Brain,
    steps: [
      {
        title: "Briefing Automotivo e Análise de Período",
        content: "Abra a Victoria AI na lateral direita. Peça briefings das contas e análises do fim de semana. Ela sabe a data de referência atual e calcula com exatidão matemática o investimento, CPL e leads gerados.",
      },
      {
        title: "Action Cards (Otimização em 1-Clique)",
        content: "A Victoria detecta campanhas com CPL alto ou CTR crítico e gera Cards de Ação interativos. Você pode pausar a campanha ou ajustar o orçamento diretamente pelo chat clicando em 'Aplicar Otimização'.",
      },
      {
        title: "Análise Multimodal de Criativos",
        content: "Envie fotos tiradas pelo celular no pátio da loja ou arquivos de criativos de tráfego. A Victoria analisará o enquadramento, iluminação e apelo comercial do carro, dando consultoria visual profissional.",
      }
    ]
  },
  {
    id: "campanhas",
    title: "3. Gestão de Campanhas",
    desc: "Monitore o status e gerencie os orçamentos ativamente",
    icon: Megaphone,
    steps: [
      {
        title: "Visão Detalhada de Anúncios",
        content: "Na aba 'Gestão de Ads', acompanhe todas as campanhas em andamento de forma organizada, exibindo status ativo/pausado, orçamento diário definido e o canal de tráfego (Meta ou Google).",
      },
      {
        title: "Alteração de Orçamento e Status",
        content: "Otimize criativos ou mude orçamentos rapidamente direto na tabela. Isso permite realizar alterações urgentes de verba sem a necessidade de acessar os gerenciadores nativos de anúncios.",
      }
    ]
  },
  {
    id: "relatorios",
    title: "4. Relatórios Estratégicos",
    desc: "Crie briefings premium para clientes em segundos",
    icon: FileText,
    steps: [
      {
        title: "Gerador Automático de Briefings",
        content: "Na aba 'Relatórios', selecione a conta de anúncio e o período. A Suite processará o histórico de dados e gerará um relatório profissional formatado em Markdown com análise tática.",
      },
      {
        title: "Personalização e Download em PDF",
        content: "Insira observações de rodapé, faça ajustes no texto gerado e clique em 'Exportar para PDF' para gerar um documento premium com a marca da agência pronto para enviar ao cliente no WhatsApp.",
      }
    ]
  },
  {
    id: "automacoes",
    title: "5. Automações e Alertas",
    desc: "Regras inteligentes para proteger seu orçamento de tráfego",
    icon: Zap,
    steps: [
      {
        title: "Configurando Regras Personalizadas",
        content: "Vá em Configurações > Regras de Automação. Adicione critérios como 'CPL maior que R$ 45,00'. O sistema monitora a conta em tempo real e emite avisos assim que o gatilho for acionado.",
      },
      {
        title: "Central de Notificações",
        content: "Acompanhe as notificações no painel superior do aplicativo para identificar anomalias rapidamente antes que comprometam o orçamento mensal.",
      }
    ]
  },
  {
    id: "integracoes",
    title: "6. Conexões e Setup Master",
    desc: "Conecte fontes de dados de forma simples e segura",
    icon: Plug,
    steps: [
      {
        title: "Setup do Token de Acesso da Meta",
        content: "Insira seu Token de Usuário do Sistema de Longa Duração da Meta na aba 'Integrações' para habilitar a extração e sincronização automática das campanhas do Facebook e Instagram.",
      },
      {
        title: "Conexão Google Ads via OAuth",
        content: "Clique em 'Nova Conexão Google Ads' para logar na sua conta do Google de forma totalmente segura, trazendo dados de campanhas de pesquisa, display, Youtube e PMax para o dashboard.",
      }
    ]
  }
];

function TabTutorial() {
  const [activeModule, setActiveModule] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const toggleStep = (id: string) => {
    setCompletedSteps(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const progress = (Object.keys(completedSteps).filter(k => completedSteps[k]).length / 
                    ACADEMY_MODULES.reduce((acc, m) => acc + m.steps.length, 0)) * 100;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-white/5 pb-6">
        <div>
          <h3 className="header-sport text-2xl font-black uppercase tracking-tight text-gradient">NC Academy</h3>
          <p className="text-xs text-muted-foreground font-medium">Aprenda a dominar o NC Performance Suite do zero.</p>
        </div>
        <div className="flex items-center gap-4">
           <div className="text-right">
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Seu Progresso</p>
              <p className="text-lg font-black">{Math.round(progress)}%</p>
           </div>
           <div className="h-12 w-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ height: 0 }} 
                animate={{ height: `${progress}%` }} 
                className="w-full bg-primary shadow-glow-sm" 
              />
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="space-y-2 lg:col-span-1">
          {ACADEMY_MODULES.map((mod, idx) => (
            <button
              key={mod.id}
              onClick={() => setActiveModule(idx)}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl transition-all border ${activeModule === idx ? "bg-primary/10 border-primary/30 text-primary" : "bg-white/[0.02] border-white/5 text-muted-foreground hover:bg-white/5"}`}
            >
              <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${activeModule === idx ? "bg-primary/20" : "bg-white/5"}`}>
                 <mod.icon className="h-4 w-4" />
              </div>
              <div className="text-left min-w-0">
                 <p className="text-[10px] font-black uppercase tracking-tighter truncate">{mod.title}</p>
                 <p className="text-[9px] font-medium opacity-60 truncate">{mod.desc}</p>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-3 space-y-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeModule}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                 <h4 className="text-xl font-bold">{ACADEMY_MODULES[activeModule].title.split(".")[1]}</h4>
                 <p className="text-sm text-muted-foreground leading-relaxed">{ACADEMY_MODULES[activeModule].desc}</p>
              </div>

              {ACADEMY_MODULES[activeModule].steps.map((step, sIdx) => {
                const stepId = `${ACADEMY_MODULES[activeModule].id}-${sIdx}`;
                const isDone = completedSteps[stepId];
                
                return (
                  <div key={sIdx} className={`group relative p-6 rounded-3xl border transition-all ${isDone ? "bg-success/[0.02] border-success/20" : "bg-white/[0.02] border-white/5 hover:border-white/10"}`}>
                    <div className="flex items-start gap-4">
                      <button 
                        onClick={() => toggleStep(stepId)}
                        className={`mt-1 h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${isDone ? "bg-success border-success text-white" : "border-white/10 hover:border-primary/50"}`}
                      >
                        {isDone && <Check className="h-4 w-4" />}
                      </button>
                      
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center justify-between">
                           <h5 className={`text-sm font-bold uppercase tracking-tight ${isDone ? "text-success/80 line-through" : "text-foreground"}`}>{step.title}</h5>
                           <span className="text-[10px] font-black text-muted-foreground/30 uppercase tracking-widest">Passo {sIdx + 1}</span>
                        </div>
                        
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {step.content}
                        </p>

                        <VisualGuide module={ACADEMY_MODULES[activeModule].id} step={sIdx} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
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
  { key: "metricas",       label: "Métricas"       },
  { key: "automacoes",     label: "Automações"     },
  { key: "criar_usuarios", label: "Criar Usuários" },
  { key: "agente",         label: "Agente IA"      },
] as const;

const ROLE_LABEL: Record<string, string> = {
  admin:         "ADMIN",
  ceo:           "CEO",
  gerente:       "GERENTE",
  gestor_trafego:"TRÁFEGO",
  social_media:  "SOCIAL",
  videomaker:    "VIDEO",
  outro:         "MEMBRO",
};

function TabUsuarios({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [editRole, setEditRole] = useState("outro");
  const [editPosition, setEditPosition] = useState("Gestor de Tráfego");
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPosition, setNewPosition] = useState("Gestor de Tráfego");
  const [newRole, setNewRole] = useState("outro");
  const [creating, setCreating] = useState(false);

  const handleTogglePermission = async (userId: string, key: string, currentPerms: any) => {
    const updated = { ...(currentPerms ?? {}), [key]: !currentPerms?.[key] };
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
    "Social Media",
    "Gerente",
    "Diretor",
    "Videomaker",
    "Designer",
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

  const handleDelete = async (userId: string, targetRole?: string) => {
    if (targetRole === "admin" && !isAdmin) {
      toast.error("Apenas administradores podem excluir outros administradores.");
      return;
    }
    if (!confirm("Tem certeza que deseja excluir permanentemente este usuário da Suite? Esta ação não pode ser desfeita.")) return;
    try {
      const { error } = await supabase.rpc("admin_delete_user", { target_user_id: userId });
      if (error) throw error;
      toast.success("Usuário excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["admin_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário");
    }
  };

  const handleUpdate = async () => {
    if (!editingUser) return;
    if (editingUser.role === "admin" && !isAdmin) {
      toast.error("Apenas administradores podem editar outros administradores.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_update_user", {
        target_user_id: editingUser.id,
        new_role: editRole,
        new_position: editPosition,
        new_name: editName,
        new_password: editPassword.trim() || null
      });
      if (error) throw error;
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

      toast.success("Novo usuário cadastrado com sucesso!");
      setShowAddModal(false);
      setNewEmail("");
      setNewPassword("");
      setNewName("");
      setNewPosition("Gestor de Tráfego");
      setNewRole("outro");
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
          {filteredUsers.map((u: any) => (
            <div key={u.id} className="rounded-xl border border-white/5 bg-background/40 p-4 hover:border-primary/20 transition duration-300 space-y-3">

              {/* Linha superior: avatar + info + ações */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                    {u.avatar_url
                      ? <img src={u.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
                      : <User className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                      {u.full_name || "Membro Sem Nome"}
                      <span className={`rounded-full px-2 py-0.5 text-[8px] font-black tracking-widest ${u.role === "admin" ? "bg-red-500/20 text-red-400" : "bg-white/5 text-muted-foreground"}`}>
                        {ROLE_LABEL[u.role] ?? "MEMBRO"}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">{u.position || "Sem cargo"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {u.role === "admin" && !isAdmin ? (
                    <span className="flex items-center gap-1 rounded-full border border-white/5 bg-white/[0.03] px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/40">
                      <Lock className="h-2.5 w-2.5" /> Admin
                    </span>
                  ) : (
                    <>
                      <button
                        onClick={() => { setEditingUser(u); setEditRole(u.role || "outro"); setEditPosition(u.position || POSITIONS_LIST[0]); setEditName(u.full_name || ""); setEditPassword(""); }}
                        className="rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider hover:bg-white/5 transition"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDelete(u.id, u.role)}
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
                {u.role === "admin" ? (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/40 font-bold uppercase tracking-wider">
                    <Lock className="h-3 w-3" /> Acesso total — permissões bloqueadas
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 mr-0.5">Acesso:</span>
                    {PERMISSION_PAGES.map(({ key, label }) => {
                      const active = !!(u.permissions?.[key]);
                      return (
                        <button
                          key={key}
                          onClick={() => handleTogglePermission(u.id, key, u.permissions)}
                          className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-wide border transition-all ${
                            active
                              ? "bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
                              : "bg-white/[0.03] text-muted-foreground/40 border-white/5 hover:bg-white/8 hover:text-muted-foreground"
                          }`}
                        >
                          {active ? "✓ " : "+ "}{label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Modal de Cadastro */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-4 shadow-2xl">
              <h4 className="font-display text-base font-bold text-gradient">Cadastrar Novo Usuário</h4>
              
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
                  <select value={newPosition} onChange={(e) => setNewPosition(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none">
                    {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowAddModal(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold uppercase">Cancelar</button>
                <button onClick={handleCreateUser} disabled={creating} className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold uppercase text-primary-foreground hover:shadow-glow transition disabled:opacity-50">
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
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-4 shadow-2xl">
              <h4 className="font-display text-base font-bold text-gradient">Alterar Dados do Usuário</h4>

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
                  <label className="label-mono text-[10px] text-muted-foreground uppercase">Nível de Acesso</label>
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
                  <select value={editPosition} onChange={(e) => setEditPosition(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:outline-none">
                    {POSITIONS_LIST.map(pos => <option key={pos} value={pos}>{pos}</option>)}
                  </select>
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setEditingUser(null)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-bold uppercase">Cancelar</button>
                <button onClick={handleUpdate} disabled={saving} className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold uppercase text-primary-foreground hover:shadow-glow transition disabled:opacity-50">
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
