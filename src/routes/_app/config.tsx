import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Check, X, Loader2, Wifi, WifiOff, ChevronDown, Zap, Brain, LayoutDashboard, FileText, Target, Upload, Send } from "lucide-react";
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
  { id: "conta", label: "Minha Conta", icon: User, adminOnly: false },
  { id: "tutorial", label: "NC Academy", icon: BookOpen, adminOnly: false },
  { id: "clientes", label: "Gestão de Clientes", icon: Building2, adminOnly: true },
  { id: "integracoes", label: "Integrações Master", icon: Plug, adminOnly: true },
  { id: "automacoes", label: "Regras de Automação", icon: Zap, adminOnly: true },
  { id: "sistema", label: "Status do Sistema", icon: Cpu, adminOnly: true },
] as const;
type Tab = typeof TABS[number]["id"];

function ConfigPage() {
  const { user } = useAuth();
  const isAdmin = user?.email === "nc.marketingrj@gmail.com";
  const [tab, setTab] = useState<Tab>("tutorial");

  const visibleTabs = TABS.filter(t => !t.adminOnly || isAdmin);

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
        {tab === "conta" && <TabConta />}
        {tab === "tutorial" && <TabTutorial />}
        {tab === "clientes" && isAdmin && <TabClientes />}
        {tab === "integracoes" && isAdmin && <TabIntegracoes />}
        {tab === "automacoes" && isAdmin && <TabAutomacoes />}
        {tab === "sistema" && isAdmin && <TabSistema />}
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
        <h3 className="font-display text-lg font-semibold text-gradient">Automações Inteligentes</h3>
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

function TabConta() {
  const [agency, setAgency] = useState(() => typeof window !== "undefined" ? localStorage.getItem("nc_agency_name") ?? "" : "");
  const [email, setEmail] = useState(() => typeof window !== "undefined" ? localStorage.getItem("nc_agency_email") ?? "" : "");
  const save = () => { localStorage.setItem("nc_agency_name", agency); localStorage.setItem("nc_agency_email", email); toast.success("Dados salvos"); };
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Dados da Conta</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label-mono mb-1 block text-muted-foreground">Nome da agência</label><input value={agency} onChange={(e) => setAgency(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
        <div><label className="label-mono mb-1 block text-muted-foreground">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      <button onClick={save} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:shadow-glow"><Check className="h-3.5 w-3.5" /> Salvar</button>
    </div>
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
  const [webhook, setWebhook] = useState("");
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [openaiConfigured, setOpenaiConfigured] = useState(false);
  const [showTokenPlain, setShowTokenPlain] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      if (data) {
        setToken(data.access_token || "");
        setWebhook(data.webhook_url || "");
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
        webhook_url: webhook,
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
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 text-gradient">
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

        <div className="space-y-2">
          <label className="label-mono text-[10px] text-muted-foreground uppercase">WhatsApp Webhook URL (Evolution / Z-API)</label>
          <input
            value={webhook}
            onChange={(e) => setWebhook(e.target.value)}
            type="text"
            placeholder="https://api.sua-instancia.com/message/send"
            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
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

      <div className="flex items-center gap-3 pt-2">
        <button onClick={save} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:shadow-glow transition">
          <Check className="h-3.5 w-3.5" /> SALVAR CONFIGURAÇÕES
        </button>
        <button onClick={test} disabled={testing} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium disabled:opacity-50 hover:bg-white/5">
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5" />}
          TESTAR HEARTBEAT
        </button>
      </div>
    </div>
  );
}

function VisualGuide({ module, step }: { module: string, step: number }) {
  return (
    <div className="relative w-full h-48 bg-black/40 rounded-2xl border border-white/5 overflow-hidden group/guide">
      <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
      <div className="absolute inset-0 flex items-center justify-center p-4 text-center">
        {module === "dashboard" && (
           <div className="space-y-4">
              <div className="flex gap-2">
                 <div className="h-16 w-24 rounded bg-primary/10 border border-primary/20 relative">
                    <div className="absolute -top-4 -right-4">
                       <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity }}>
                          <ChevronDown className="h-6 w-6 text-primary" />
                       </motion.div>
                    </div>
                 </div>
                 <div className="h-16 w-24 rounded bg-white/5 border border-white/10" />
              </div>
              <p className="text-[10px] font-bold text-primary uppercase tracking-widest">Analise os KPIs em tempo real</p>
           </div>
        )}
        {module === "operacao" && (
           <div className="flex flex-col items-center gap-3">
              <div className="grid grid-cols-3 gap-2 w-full max-w-[200px]">
                 {[1,2,3].map(i => <div key={i} className={`h-12 rounded border ${i===2 ? 'border-primary bg-primary/10' : 'border-white/5 bg-white/5'}`} />)}
              </div>
              <div className="flex items-center gap-2">
                 <div className="w-8 h-[2px] bg-primary" />
                 <p className="text-[9px] font-black text-primary uppercase">Hub de Módulos</p>
              </div>
           </div>
        )}
        {module === "relatorios" && (
           <div className="relative p-4 border border-white/10 rounded-xl bg-white/5 w-48">
              <div className="h-2 w-full bg-white/10 rounded mb-2" />
              <div className="h-2 w-2/3 bg-white/10 rounded mb-4" />
              <div className="h-8 w-full rounded bg-primary flex items-center justify-center text-[10px] font-black text-background">
                 EXPORTAR PDF
              </div>
              <div className="absolute -left-6 top-1/2 -translate-y-1/2">
                 <motion.div animate={{ x: [0, 5, 0] }} transition={{ repeat: Infinity }} className="rotate-90">
                    <ChevronDown className="h-6 w-6 text-primary" />
                 </motion.div>
              </div>
           </div>
        )}
        {module === "agente" && (
           <div className="relative h-32 w-48 bg-white/5 rounded-xl border border-white/10 p-3">
              <div className="flex items-center gap-2 mb-4">
                 <Brain className="h-4 w-4 text-primary" />
                 <div className="h-1.5 w-20 bg-white/20 rounded" />
              </div>
              <div className="h-8 w-full rounded bg-primary/20 border border-primary/30 flex items-center px-2">
                 <div className="h-2 w-24 bg-primary/40 rounded" />
              </div>
              <p className="mt-3 text-[8px] font-black text-primary uppercase animate-pulse">Victoria está ouvindo...</p>
           </div>
        )}
      </div>
    </div>
  );
}

const ACADEMY_MODULES = [
  {
    id: "dashboard",
    title: "1. Domine o Dashboard",
    desc: "Como interpretar seus dados de performance",
    icon: LayoutDashboard,
    steps: [
      {
        title: "Leitura de KPIs",
        content: "No topo do Dashboard, acompanhe o Investimento, Conversões e CPL em tempo real. As sparklines (linhas azuis) mostram a tendência das últimas 24h.",
      },
      {
        title: "Visão Multi-Conta",
        content: "Use o seletor no topo para filtrar dados de uma conta específica ou ver o resultado consolidado de toda a sua operação.",
      }
    ]
  },
  {
    id: "operacao",
    title: "2. Operações e Hub",
    desc: "Navegando entre as ferramentas",
    icon: Zap,
    steps: [
      {
        title: "O Hub de Módulos",
        content: "O centro da tela organiza suas ferramentas. Clique nos cards de 'Performance', 'Operação' ou 'Lab' para abrir as funções específicas de cada área.",
      }
    ]
  },
  {
    id: "relatorios",
    title: "3. Relatórios Estratégicos",
    desc: "Crie entregas profissionais em segundos",
    icon: FileText,
    steps: [
      {
        title: "Gerador de Markdown",
        content: "Vá em 'Relatórios' no Hub. Selecione o período e o cliente. A Victoria vai consolidar os dados e gerar um texto formatado pronto para enviar ao cliente.",
      }
    ]
  },
  {
    id: "agente",
    title: "4. IA Orquestradora",
    desc: "Conversando com a Victoria",
    icon: Brain,
    steps: [
      {
        title: "Comandos Rápidos",
        content: "Na sidebar direita, use os botões rápidos como 'Como está a performance?' para receber um briefing instantâneo do que está acontecendo nas contas.",
      },
      {
        title: "Análise Profunda",
        content: "Peça para a Victoria analisar breakdowns específicos: 'Victoria, qual a faixa etária que mais converteu na campanha de Teste?'",
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
          <h3 className="text-2xl font-black uppercase tracking-tight text-gradient">NC Academy</h3>
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
      <h3 className="font-display text-lg font-semibold">Informações do Sistema</h3>
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
