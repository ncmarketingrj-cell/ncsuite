import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Check, X, Loader2, Wifi, WifiOff, ChevronDown, Zap, Brain } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { useClients } from "@/hooks/useClients";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/config")({
  head: () => ({ meta: [{ title: "Configurações — NC Suite" }] }),
  component: ConfigPage,
});

const TABS = [
  { id: "conta", label: "Conta", icon: User },
  { id: "clientes", label: "Clientes", icon: Building2 },
  { id: "integracoes", label: "Integrações", icon: Plug },
  { id: "automacoes", label: "Automações", icon: Zap },
  { id: "tutorial", label: "Tutorial", icon: BookOpen },
  { id: "sistema", label: "Sistema", icon: Cpu },
] as const;
type Tab = typeof TABS[number]["id"];

function ConfigPage() {
  const [tab, setTab] = useState<Tab>("conta");
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Sistema" title="Configurações" description="Gerencie conta, clientes, integrações e preferências." />
      <div className="flex gap-2 overflow-x-auto pb-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`relative flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-xs font-medium transition ${tab === t.id ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:bg-white/[0.03]"}`}>
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>
      <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
        {tab === "conta" && <TabConta />}
        {tab === "clientes" && <TabClientes />}
        {tab === "integracoes" && <TabIntegracoes />}
        {tab === "automacoes" && <TabAutomacoes />}
        {tab === "tutorial" && <TabTutorial />}
        {tab === "sistema" && <TabSistema />}
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
      toast.success("Configurações do Agente salvas com sucesso!");
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
          <label className="label-mono text-[10px] text-muted-foreground uppercase">Meta Access Token (System User)</label>
          <input 
            value={token} 
            onChange={(e) => setToken(e.target.value)} 
            type="password" 
            placeholder="EAANmoU71..." 
            className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" 
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
          <p className="text-[10px] text-muted-foreground italic">O agente disparará alertas proativos para esta URL quando as regras forem atingidas.</p>
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

const TUTORIALS = [
  { q: "Como subir um print?", a: "Vá em Extração de Dados, clique em upload e selecione a imagem. O motor extrai as campanhas automaticamente." },
  { q: "Como gerar um relatório?", a: "Após a extração, clique em 'Montar Relatório'. Adicione cliente, período, formato e salve." },
  { q: "Como conectar o Meta Ads?", a: "Vá em Configurações → Integrações. Cole token e ID. Teste a conexão." },
];
function TabTutorial() {
  const [open, setOpen] = useState<number | null>(null);
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Guia rápido</h3>
      {TUTORIALS.map((t, i) => (
        <div key={i} className="rounded-lg border border-white/5 overflow-hidden">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between p-4 text-left text-sm font-medium hover:bg-white/[0.02]">{t.q}<ChevronDown className={`h-4 w-4 text-primary transition ${open === i ? "rotate-180" : ""}`} /></button>
          <AnimatePresence>{open === i && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden"><p className="px-4 pb-4 text-sm text-muted-foreground">{t.a}</p></motion.div>}</AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function TabSistema() {
  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold">Informações do Sistema</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ label: "Versão", value: "2.0.0" }, { label: "Plataforma", value: "NC Performance Suite" }, { label: "Stack", value: "React 18 + Vite + Supabase" }, { label: "Edge Runtime", value: "Supabase Edge Functions" }, { label: "DB", value: "PostgreSQL (Supabase)" }, { label: "Auth", value: "Supabase Auth" }].map((info) => (
          <div key={info.label} className="flex items-center justify-between rounded-lg border border-white/5 bg-background/40 p-3"><span className="label-mono text-muted-foreground">{info.label}</span><span className="text-sm font-medium">{info.value}</span></div>
        ))}
      </div>
    </div>
  );
}
