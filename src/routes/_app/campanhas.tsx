import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Search, Check, X, Loader2, Filter } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useCampaigns, type Campaign } from "@/hooks/useCampaigns";
import { useClients } from "@/hooks/useClients";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Campanhas — NC Suite" }] }),
  component: CampanhasPage,
});

function CampanhasPage() {
  const [clientFilter, setClientFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);

  const { clients } = useClients();
  const { campaigns, isLoading, addCampaign, updateCampaign, removeCampaign, removeBulk } = useCampaigns({
    clientId: clientFilter || undefined,
    status: statusFilter,
    search: search || undefined,
  });

  const toggle = (id: string) => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  const bulkDelete = () => {
    if (!selected.size) return;
    removeBulk.mutate([...selected]);
    setSelected(new Set());
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader eyebrow="Operação" title="Campanhas" description="Gerencie todas as campanhas ativas, pausadas e encerradas."
        actions={
          <button onClick={() => { setEditing(null); setModal(true); }} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow">
            <Plus className="h-4 w-4" /> Nova campanha
          </button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campanha..." className="w-full rounded-lg border border-white/10 bg-background/50 py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none" />
        </div>
        <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="all">Todos</option>
          <option value="active">Ativo</option>
          <option value="paused">Pausado</option>
        </select>
        {selected.size > 0 && (
          <button onClick={bulkDelete} className="inline-flex items-center gap-1 rounded-full border border-destructive/30 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3 w-3" /> Excluir ({selected.size})
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !campaigns.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground">
          <Filter className="h-6 w-6 text-primary/60" />
          Nenhuma campanha encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c, i) => {
            const client = clients.find((cl) => cl.id === c.client_id);
            return (
              <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                className={`glass-panel flex items-center gap-4 p-4 transition ${selected.has(c.id) ? "ring-1 ring-primary/30" : ""}`}
              >
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="label-mono text-muted-foreground">{client?.name ?? "—"}</p>
                </div>
                <span className="hidden rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">{c.platform ?? "Meta Ads"}</span>
                <span className="font-mono text-sm font-medium">R$ {(c.budget ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                  {c.status === "active" ? "Ativo" : "Pausado"}
                </span>
                <button onClick={() => { setEditing(c); setModal(true); }} className="text-muted-foreground hover:text-primary"><Search className="h-3.5 w-3.5" /></button>
                <button onClick={() => removeCampaign.mutate(c.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modal && <CampaignModal editing={editing} clients={clients} onClose={() => setModal(false)} onSave={(data) => {
          if (editing) updateCampaign.mutate({ id: editing.id, ...data });
          else addCampaign.mutate(data as any);
          setModal(false);
        }} />}
      </AnimatePresence>
    </div>
  );
}

function CampaignModal({ editing, clients, onClose, onSave }: {
  editing: Campaign | null; clients: { id: string; name: string }[];
  onClose: () => void; onSave: (d: Partial<Campaign>) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [clientId, setClientId] = useState(editing?.client_id ?? "");
  const [platform, setPlatform] = useState(editing?.platform ?? "Meta Ads");
  const [status, setStatus] = useState(editing?.status ?? "active");
  const [budget, setBudget] = useState(editing?.budget ?? 0);
  const [link, setLink] = useState(editing?.link ?? "");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">{editing ? "Editar" : "Nova"} campanha</h3>
          <button onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da campanha" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
            <option value="">Selecione o cliente</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-3">
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
              <option value="active">Ativo</option>
              <option value="paused">Pausado</option>
            </select>
            <input type="number" value={budget} onChange={(e) => setBudget(Number(e.target.value))} placeholder="Budget" className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (opcional)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
          <button onClick={() => onSave({ name, client_id: clientId || null, platform, status, budget, link: link || null })} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">
            <Check className="inline h-3 w-3 mr-1" />{editing ? "Salvar" : "Criar"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
