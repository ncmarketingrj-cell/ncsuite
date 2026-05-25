import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Search, Store, TrendingUp, TrendingDown,
  Minus, ChevronRight, Wifi, WifiOff, Package, Target,
  Loader2, X, AlertCircle, Download, Calendar
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/clientes")({
  head: () => ({ meta: [{ title: "Clientes — NC Suite" }] }),
  component: ClientesLayout,
});

// ─── Types ───────────────────────────────────────────────────────────────────

type ClientRow = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  niche: string | null;
  logo_url: string | null;
  weekly_budget_goal: number | null;
  meta_tax_rate: number | null;
  daily_leads_goal: number | null;
  daily_purchases_goal: number | null;
  target_roas: number | null;
  target_cpa: number | null;
  meta_ad_account_id: string | null;
  stock_quantity: number | null;
  stock_alert_threshold: number | null;
  contact_name: string | null;
  platform: string | null;
  product_type: string | null;
  created_at: string | null;
};

type DayMetrics = {
  spend: number;
  leads: number;
  purchases: number;
  roas: number;
  impressions: number;
  results: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const NICHE_COLOR: Record<string, string> = {
  "E-commerce":    "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Infoproduto":   "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Serviços":      "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Varejo":        "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Automotivo":    "bg-primary/10 text-primary border-primary/20",
  "Imóveis":       "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Saúde":         "bg-rose-500/10 text-rose-400 border-rose-500/20",
  "Educação":      "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const STATUS_STYLE: Record<string, string> = {
  ativo:        "bg-success/10 text-success border-success/20",
  pausado:      "bg-muted/40 text-muted-foreground border-border",
  otimizando:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
};

const STATUS_DOT: Record<string, string> = {
  ativo:      "bg-success",
  pausado:    "bg-muted-foreground",
  otimizando: "bg-amber-400 animate-pulse",
};

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtNum(n: number) {
  return n.toLocaleString("pt-BR");
}

function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase();
}

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const over = max > 0 && value > max;
  return (
    <div className="relative h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
      <motion.div
        className={`h-full rounded-full ${over ? "bg-destructive" : color}`}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </div>
  );
}

function StatusDot({ value, target, inverse = false }: { value: number; target: number; inverse?: boolean }) {
  if (!target) return null;
  const ratio = value / target;
  let color = "bg-success";
  if (inverse ? ratio > 1.15 : ratio < 0.7) color = "bg-destructive";
  else if (inverse ? ratio > 1 : ratio < 0.9) color = "bg-amber-400";
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${color}`} />;
}

// ─── New Client Modal ────────────────────────────────────────────────────────

function NewClientModal({ open, onClose, adAccounts }: {
  open: boolean;
  onClose: () => void;
  adAccounts: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [niche, setNiche] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("clients").insert({
        name,
        meta_ad_account_id: accountId || null,
        niche: niche || null,
        status: "ativo",
        user_id: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients_full"] });
      toast.success("Cliente criado");
      onClose();
      setName(""); setAccountId(""); setNiche("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.95, y: 12 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 12 }}
          className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-black tracking-tight">Novo Cliente</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Preencha os dados básicos e complete o cadastro depois</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-xl bg-muted/40 flex items-center justify-center hover:bg-muted/70 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome / Loja *</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Ex: Loja da Maria"
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Conta de Anúncio Meta</label>
              <select
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Selecionar conta...</option>
                {adAccounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nicho</label>
              <select
                value={niche}
                onChange={e => setNiche(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50"
              >
                <option value="">Selecionar nicho...</option>
                {Object.keys(NICHE_COLOR).map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value="Outro">Outro</option>
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 rounded-xl border border-border py-2.5 text-sm font-bold text-muted-foreground hover:bg-muted/40 transition-colors">
              Cancelar
            </button>
            <button
              onClick={() => create.mutate()}
              disabled={!name.trim() || create.isPending}
              className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-black text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Criar Cliente
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Client Card ─────────────────────────────────────────────────────────────

function ClientCard({ client, metrics, account, dateLabel }: {
  client: ClientRow;
  metrics: DayMetrics | null;
  account: { id: string; name: string } | null;
  dateLabel: string;
}) {
  const taxRate = client.meta_tax_rate ?? 0.1215;
  const weeklyBruto = client.weekly_budget_goal ?? 0;
  const weeklyEffective = weeklyBruto * (1 - taxRate);
  const dailyBudget = weeklyEffective / 7;

  const spendPct = dailyBudget > 0 && metrics ? (metrics.spend / dailyBudget) * 100 : 0;
  const status = client.status ?? "ativo";

  const nicheColor = client.niche ? (NICHE_COLOR[client.niche] ?? "bg-white/5 text-muted-foreground border-border") : null;
  const statusStyle = STATUS_STYLE[status] ?? STATUS_STYLE.pausado;
  const statusDot = STATUS_DOT[status] ?? STATUS_DOT.pausado;

  const lowStock = client.stock_quantity != null && client.stock_alert_threshold != null
    && client.stock_quantity <= client.stock_alert_threshold;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className="group relative flex flex-col rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 hover:shadow-glow-sm transition-all duration-200"
    >
      {/* racing stripe topo */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

      {/* Header do card */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {/* Avatar */}
        <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden border border-border bg-muted/30 flex items-center justify-center">
          {client.logo_url ? (
            <img src={client.logo_url} alt={client.name} className="h-full w-full object-cover" />
          ) : (
            <span className="text-sm font-black text-muted-foreground">{initials(client.name)}</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-black truncate">{client.name}</h3>
            {lowStock && (
              <span title="Estoque baixo" className="text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {nicheColor && (
              <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${nicheColor}`}>
                {client.niche}
              </span>
            )}
            <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] font-bold ${statusStyle}`}>
              <span className={`h-1 w-1 rounded-full ${statusDot}`} />
              {status}
            </span>
          </div>
        </div>
      </div>

      {/* Conta Meta */}
      <div className="px-4 pb-3">
        <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${account ? "bg-blue-500/5 border border-blue-500/15" : "bg-muted/20 border border-border"}`}>
          {account ? (
            <>
              <Wifi className="h-3 w-3 text-blue-400 shrink-0" />
              <span className="text-[10px] font-bold text-blue-400 truncate">{account.name}</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3 text-muted-foreground/50 shrink-0" />
              <span className="text-[10px] text-muted-foreground/50">Sem conta vinculada</span>
            </>
          )}
        </div>
      </div>

      {/* KPIs do dia */}
      <div className="px-4 pb-3 space-y-2.5">
        {/* Gasto vs Orçamento */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground font-semibold">{dateLabel}</span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-black text-foreground">
                {metrics ? fmtBRL(metrics.spend) : "—"}
              </span>
              {dailyBudget > 0 && (
                <span className="text-[9px] text-muted-foreground font-mono">/ {fmtBRL(dailyBudget)}</span>
              )}
            </div>
          </div>
          <ProgressBar
            value={metrics?.spend ?? 0}
            max={dailyBudget}
            color={spendPct > 100 ? "bg-destructive" : spendPct > 80 ? "bg-amber-400" : "bg-primary"}
          />
        </div>

        {/* Leads */}
        {(client.daily_leads_goal || metrics?.leads) ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
              <Target className="h-3 w-3" /> Leads hoje
            </span>
            <div className="flex items-center gap-1.5">
              <StatusDot value={metrics?.leads ?? 0} target={client.daily_leads_goal ?? 0} />
              <span className="text-[10px] font-black text-foreground">
                {metrics ? fmtNum(metrics.leads) : "—"}
                {client.daily_leads_goal ? <span className="text-[9px] text-muted-foreground font-mono"> / {client.daily_leads_goal}</span> : null}
              </span>
            </div>
          </div>
        ) : null}

        {/* ROAS */}
        {(client.target_roas || metrics?.roas) ? (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> ROAS
            </span>
            <div className="flex items-center gap-1.5">
              <StatusDot value={metrics?.roas ?? 0} target={client.target_roas ?? 0} />
              <span className="text-[10px] font-black text-foreground">
                {metrics ? `${metrics.roas.toFixed(2)}x` : "—"}
                {client.target_roas ? <span className="text-[9px] text-muted-foreground font-mono"> / {client.target_roas}x</span> : null}
              </span>
            </div>
          </div>
        ) : null}

        {/* Estoque */}
        {client.stock_quantity != null && (
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
              <Package className="h-3 w-3" /> Estoque
            </span>
            <span className={`text-[10px] font-black ${lowStock ? "text-amber-400" : "text-foreground"}`}>
              {fmtNum(client.stock_quantity)} un.
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-auto border-t border-border/50 px-4 py-2.5 flex items-center justify-between">
        {weeklyBruto > 0 ? (
          <div className="flex items-center gap-1">
            <span className="text-[9px] text-muted-foreground font-mono">Verba/sem</span>
            <span className="text-[10px] font-black text-foreground">{fmtBRL(weeklyBruto)}</span>
          </div>
        ) : (
          <span className="text-[9px] text-muted-foreground">Sem orçamento</span>
        )}
        <Link
          to="/clientes/$clientId"
          params={{ clientId: client.id }}
          className="flex items-center gap-1 rounded-lg bg-primary/10 border border-primary/20 px-2.5 py-1 text-[10px] font-black text-primary hover:bg-primary/20 transition-colors"
        >
          Ver detalhes <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </motion.div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

function ClientesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("todos");
  const [showNew, setShowNew] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Busca clientes com todos os campos
  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients_full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").order("name");
      if (error) throw error;
      return data as unknown as ClientRow[];
    },
  });

  // Busca contas de anúncio
  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("id, name").order("name");
      return data as { id: string; name: string }[] ?? [];
    },
  });

  // Métricas do dia selecionado por conta
  const { data: todayMetrics = {} } = useQuery({
    queryKey: ["clients_today_metrics", selectedDate],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("daily_metrics")
        .select("ad_account_id, spend, leads, purchases, roas, impressions, results")
        .eq("date", selectedDate);
      if (!data) return {};
      const map: Record<string, DayMetrics> = {};
      for (const row of data) {
        const key = row.ad_account_id;
        if (!map[key]) map[key] = { spend: 0, leads: 0, purchases: 0, roas: 0, impressions: 0, results: 0 };
        map[key].spend       += row.spend ?? 0;
        map[key].leads       += row.leads ?? 0;
        map[key].purchases   += row.purchases ?? 0;
        map[key].impressions += row.impressions ?? 0;
        map[key].results     += row.results ?? 0;
        if (map[key].spend > 0) map[key].roas = (row.roas ?? 0);
      }
      return map;
    },
    refetchInterval: 3 * 60 * 1000,
    staleTime: 0,
  });

  const accountMap = Object.fromEntries(adAccounts.map(a => [a.id, a]));

  const handleImportFromMeta = async () => {
    if (adAccounts.length === 0) {
      toast.error("Nenhuma conta Meta Ads encontrada. Execute a sincronização primeiro.");
      return;
    }
    const linkedIds = new Set(clients.filter(c => c.meta_ad_account_id).map(c => c.meta_ad_account_id));
    const unlinked = adAccounts.filter(a => !linkedIds.has(a.id));
    if (unlinked.length === 0) {
      toast.info("Todas as contas Meta Ads já estão vinculadas a clientes.");
      return;
    }
    setIsImporting(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const inserts = unlinked.map(a => ({
        name: a.name,
        meta_ad_account_id: a.id,
        status: "ativo",
        niche: "Automotivo",
        user_id: u.user?.id,
      }));
      const { error } = await (supabase as any).from("clients").insert(inserts);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["clients_full"] });
      toast.success(`${unlinked.length} cliente${unlinked.length > 1 ? "s" : ""} importado${unlinked.length > 1 ? "s" : ""} do Meta Ads!`);
    } catch (err: any) {
      toast.error(err.message || "Erro ao importar clientes");
    } finally {
      setIsImporting(false);
    }
  };

  const filtered = clients.filter(c => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase())
      || (c.niche ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "todos" || (c.status ?? "ativo") === filterStatus;
    return matchSearch && matchStatus;
  });

  const counts = {
    total: clients.length,
    ativo: clients.filter(c => (c.status ?? "ativo") === "ativo").length,
    pausado: clients.filter(c => c.status === "pausado").length,
    otimizando: clients.filter(c => c.status === "otimizando").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.total} {counts.total === 1 ? "cliente" : "clientes"} cadastrados
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleImportFromMeta}
            disabled={isImporting}
            className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-black text-primary hover:bg-primary/20 transition-colors active:scale-95 disabled:opacity-50"
            title="Criar clientes automaticamente para cada conta Meta Ads ainda não vinculada"
          >
            {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Importar do Meta
          </button>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90 transition-opacity active:scale-95"
          >
            <Plus className="h-4 w-4" /> Novo Cliente
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Search */}
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome ou nicho..."
            className="w-full rounded-xl border border-border bg-card pl-9 pr-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
          />
        </div>

        {/* Date picker */}
        <div className="relative flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 hover:border-primary/40 transition-colors">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0 pointer-events-none" />
          <input
            type="date"
            value={selectedDate}
            max={new Date().toISOString().slice(0, 10)}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground focus:outline-none cursor-pointer"
          />
          {selectedDate !== new Date().toISOString().slice(0, 10) && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
              className="text-[10px] font-bold text-primary hover:text-primary/70 transition-colors ml-1"
            >
              Hoje
            </button>
          )}
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: "todos", label: `Todos (${counts.total})` },
            { id: "ativo", label: `Ativos (${counts.ativo})` },
            { id: "otimizando", label: `Otimizando (${counts.otimizando})` },
            { id: "pausado", label: `Pausados (${counts.pausado})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`rounded-full border px-3 py-1 text-[11px] font-bold transition-all ${
                filterStatus === f.id
                  ? "bg-primary/15 border-primary/30 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-muted/30 border border-border flex items-center justify-center">
            <Users className="h-6 w-6 text-muted-foreground/40" />
          </div>
          <div>
            <p className="font-bold text-foreground">
              {search ? "Nenhum cliente encontrado" : "Nenhum cliente ainda"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {search ? "Tente outro termo de busca" : "Clique em Novo Cliente para começar"}
            </p>
          </div>
        </div>
      ) : (
        <motion.div
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          initial="hidden"
          animate="visible"
          variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.04 } } }}
        >
          {filtered.map(client => {
            const today = new Date().toISOString().slice(0, 10);
            const dateLabel = selectedDate === today
              ? "Gasto hoje"
              : `Gasto ${new Date(selectedDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
            return (
              <ClientCard
                key={client.id}
                client={client}
                metrics={client.meta_ad_account_id ? (todayMetrics[client.meta_ad_account_id] ?? null) : null}
                account={client.meta_ad_account_id ? (accountMap[client.meta_ad_account_id] ?? null) : null}
                dateLabel={dateLabel}
              />
            );
          })}
        </motion.div>
      )}

      <NewClientModal open={showNew} onClose={() => setShowNew(false)} adAccounts={adAccounts} />
    </div>
  );
}

// Layout wrapper: redireciona para a página filha quando $clientId está ativo
function ClientesLayout() {
  const isDetail = useRouterState({
    select: s => s.matches.some(m => (m as any).routeId === '/_app/clientes/$clientId'),
  });
  if (isDetail) return <Outlet />;
  return <ClientesPage />;
}
