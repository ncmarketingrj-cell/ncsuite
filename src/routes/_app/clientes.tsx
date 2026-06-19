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
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalDate, getLocalDateString } from "@/contexts/DateContext";

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
  "E-commerce":    "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900/50",
  "Infoproduto":   "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900/50",
  "Serviços":      "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-900/30",
  "Varejo":        "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900/50",
  "Automotivo":    "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900/50",
  "Imóveis":       "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950 dark:text-cyan-300 dark:border-cyan-900/50",
  "Saúde":         "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 dark:border-rose-900/50",
  "Educação":      "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-900/50",
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
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [weeklyBudget, setWeeklyBudget] = useState("");

  const create = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("clients").insert({
        name,
        meta_ad_account_id: accountId || null,
        niche: niche || null,
        contact_name: contactName || null,
        contact_phone: contactPhone || null,
        weekly_budget_goal: weeklyBudget ? parseFloat(weeklyBudget) : null,
        status: "ativo",
        user_id: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients_full"] });
      toast.success("Cliente cadastrado com sucesso!");
      onClose();
      setName(""); setAccountId(""); setNiche("");
      setContactName(""); setContactPhone(""); setWeeklyBudget("");
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
          className="w-full max-w-xl rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-6 shadow-2xl relative overflow-hidden"
        >
          {/* Fundo decorativo sutil */}
          <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-primary/8 blur-3xl pointer-events-none" />
          
          <div className="flex items-center justify-between mb-5 relative z-10">
            <div>
              <h2 className="text-base font-black tracking-tight">Novo Cliente</h2>
              <p className="text-[11px] text-muted-foreground mt-0.5">Preencha os dados e configure o perfil operacional do cliente</p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-xl bg-muted/40 flex items-center justify-center hover:bg-muted/70 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 relative z-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome da Empresa / Loja *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Loja da Maria"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-all focus:ring-1 focus:ring-primary/20"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nicho de Atuação</label>
                <select
                  value={niche}
                  onChange={e => setNiche(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 transition-all"
                >
                  <option value="">Selecionar nicho...</option>
                  {Object.keys(NICHE_COLOR).map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                  <option value="Outro">Outro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Nome do Responsável</label>
                <input
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">WhatsApp / Contato</label>
                <input
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="Ex: (11) 99999-9999"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Conta de Anúncio Meta</label>
                <select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50 transition-all"
                >
                  <option value="">Selecionar conta...</option>
                  {adAccounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5 block">Orçamento Semanal Adicionado (R$)</label>
                <input
                  value={weeklyBudget}
                  onChange={e => setWeeklyBudget(e.target.value)}
                  type="number"
                  placeholder="Ex: 1000"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium placeholder:text-muted-foreground/30 focus:outline-none focus:border-primary/50 transition-all"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6 relative z-10">
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

  const nicheBgGradient: Record<string, string> = {
    "E-commerce":    "from-blue-500/10 to-transparent",
    "Infoproduto":   "from-violet-500/10 to-transparent",
    "Serviços":      "from-amber-500/10 to-transparent",
    "Varejo":        "from-emerald-500/10 to-transparent",
    "Automotivo":    "from-red-500/10 to-transparent",
    "Imóveis":       "from-cyan-500/10 to-transparent",
    "Saúde":         "from-rose-500/10 to-transparent",
    "Educação":      "from-orange-500/10 to-transparent",
  };
  const bgGrad = client.niche ? (nicheBgGradient[client.niche] ?? "from-white/2 to-transparent") : "from-white/2 to-transparent";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="group relative flex flex-col rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md overflow-hidden hover:border-primary/45 hover:shadow-glow-sm hover:-translate-y-0.5 transition-all duration-300"
    >
      {/* gradiente sutil do nicho */}
      <div className={`absolute inset-0 bg-gradient-to-b ${bgGrad} pointer-events-none opacity-60`} />

      {/* racing stripe topo */}
      <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />

      {/* Header do card */}
      <div className="flex items-start gap-3 p-4 pb-3 relative z-10">
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
          className="flex items-center gap-1 rounded-lg border border-primary/30 bg-transparent px-2.5 py-1 text-[10px] font-black text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
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
  const { selectedDate, setSelectedDate } = useGlobalDate();

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
      {/* PageHeader Padronizado */}
      <PageHeader 
        eyebrow="Nicho Corporativo"
        title="Clientes"
        description={`${counts.total} ${counts.total === 1 ? "cliente cadastrado" : "clientes cadastrados"} no sistema.`}
        actions={
          <>
            <button
              onClick={handleImportFromMeta}
              disabled={isImporting}
              className="flex items-center gap-2 rounded-xl border border-primary bg-transparent px-4 py-2.5 text-sm font-black text-primary hover:bg-primary hover:text-primary-foreground transition-colors active:scale-95 disabled:opacity-50"
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
          </>
        }
        compact
      />

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
            max={getLocalDateString()}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-transparent text-sm font-medium text-foreground focus:outline-none cursor-pointer"
          />
          {selectedDate !== getLocalDateString() && (
            <button
              onClick={() => setSelectedDate(getLocalDateString())}
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
                  ? "bg-primary/10 text-primary border border-primary/20 dark:bg-primary/20 dark:border-primary/30 shadow-glow-sm"
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
            const today = getLocalDateString();
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
