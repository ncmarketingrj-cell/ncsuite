import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, User, Building2, Plug, BookOpen, Cpu, Plus, Trash2, Check, X, Loader2, Wifi, WifiOff, ChevronDown } from "lucide-react";
import { toast } from "sonner";
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
        {tab === "tutorial" && <TabTutorial />}
        {tab === "sistema" && <TabSistema />}
      </motion.div>
    </div>
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
  const [token, setToken] = useState(""); const [accountId, setAccountId] = useState(""); const [testing, setTesting] = useState(false); const [connected, setConnected] = useState<boolean | null>(null);
  const save = async () => {
    if (!token.trim() || !accountId.trim()) { toast.error("Preencha todos os campos"); return; }
    try { const { data: u } = await supabase.auth.getUser(); const { error } = await (supabase as any).from("meta_ads_configs").upsert({ user_id: u.user?.id, access_token: token, ad_account_id: accountId }, { onConflict: "user_id" }); if (error) throw error; toast.success("Credenciais salvas"); } catch (err: any) { toast.error(err.message ?? "Erro ao salvar"); }
  };
  const test = async () => { setTesting(true); try { const { error } = await supabase.functions.invoke("sync-meta-ads"); if (error) throw error; setConnected(true); toast.success("Conexão OK"); } catch { setConnected(false); toast.error("Falha"); } finally { setTesting(false); } };
  return (
    <div className="space-y-6">
      <h3 className="font-display text-lg font-semibold">Meta Ads</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label-mono mb-1 block text-muted-foreground">Access Token</label><input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder="EAAxxxx..." className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
        <div><label className="label-mono mb-1 block text-muted-foreground">Ad Account ID</label><input value={accountId} onChange={(e) => setAccountId(e.target.value)} placeholder="act_123456" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={save} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:shadow-glow"><Check className="h-3.5 w-3.5" /> Salvar</button>
        <button onClick={test} disabled={testing} className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs font-medium disabled:opacity-50">{testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : connected ? <Wifi className="h-3.5 w-3.5 text-success" /> : <WifiOff className="h-3.5 w-3.5" />} Testar</button>
        {connected !== null && <span className={`label-mono ${connected ? "text-success" : "text-destructive"}`}>{connected ? "Conectado" : "Desconectado"}</span>}
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
