import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Store, Wifi, WifiOff, Target, TrendingUp, TrendingDown,
  Package, Users, Zap, FileText, Settings, Plus, Trash2, Edit3,
  Loader2, Save, CheckCircle2, AlertCircle, ExternalLink,
  DollarSign, BarChart3, ShoppingCart, MousePointer, Eye,
  Phone, Globe, Clock, ChevronDown, ChevronUp, X, Calendar
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGlobalDate, getLocalDateString } from "@/contexts/DateContext";

export const Route = createFileRoute("/_app/clientes/$clientId")({
  head: () => ({ meta: [{ title: "Cliente — NC Suite" }] }),
  component: ClientDetailPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type ClientFull = {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  niche: string | null;
  logo_url: string | null;
  store_url: string | null;
  platform: string | null;
  product_type: string | null;
  average_ticket: number | null;
  sale_cycle_days: number | null;
  contact_name: string | null;
  contact_phone: string | null;
  weekly_budget_goal: number | null;
  meta_tax_rate: number | null;
  objective_budgets: Record<string, number> | null;
  stock_quantity: number | null;
  stock_alert_threshold: number | null;
  hero_product: string | null;
  daily_leads_goal: number | null;
  daily_purchases_goal: number | null;
  target_cpa: number | null;
  target_roas: number | null;
  target_ctr: number | null;
  target_cpm: number | null;
  target_conversion_rate: number | null;
  peak_hours_start: string | null;
  peak_hours_end: string | null;
  notes: string | null;
  rules: RuleItem[] | null;
  meta_ad_account_id: string | null;
  monthly_budget: number | null;
  created_at: string | null;
};

type RuleItem = { id: string; title: string; category: string; content: string };

type MetricRow = {
  date: string;
  spend: number;
  leads: number;
  purchases: number;
  results: number;
  impressions: number;
  clicks: number;
  roas: number;
  ctr: number;
  cpm: number;
  cpa: number;
  reach: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtBRL(n: number | null | undefined, decimals = 0) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: decimals });
}
function fmtNum(n: number | null | undefined) {
  if (n == null) return "—";
  return n.toLocaleString("pt-BR");
}
function pct(v: number, total: number) {
  return total > 0 ? Math.min((v / total) * 100, 100) : 0;
}

const RULE_CATEGORIES = ["Audiência", "Criativos", "Orçamento", "Negócio", "Operação", "Outros"];
const RULE_CAT_COLOR: Record<string, string> = {
  "Audiência":  "bg-violet-500/10 text-violet-400 border-violet-500/20",
  "Criativos":  "bg-blue-500/10 text-blue-400 border-blue-500/20",
  "Orçamento":  "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Negócio":    "bg-amber-500/10 text-amber-400 border-amber-500/20",
  "Operação":   "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  "Outros":     "bg-muted/40 text-muted-foreground border-border",
};

const NICHES = ["E-commerce", "Infoproduto", "Serviços", "Varejo", "Automotivo", "Imóveis", "Saúde", "Educação", "Outro"];
const PLATFORMS = ["Shopify", "Nuvemshop", "Loja Integrada", "WooCommerce", "Mercado Livre", "Site Próprio", "Outro"];
const PRODUCT_TYPES = ["Físico", "Digital", "Serviço"];
const STATUSES = ["ativo", "pausado", "otimizando"];
const OBJECTIVES = ["conversao", "leads", "trafego", "engajamento", "awareness", "mensagens"];
const OBJECTIVE_LABELS: Record<string, string> = {
  conversao: "Conversão", leads: "Leads", trafego: "Tráfego",
  engajamento: "Engajamento", awareness: "Awareness", mensagens: "Mensagens",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3 flex items-center gap-2">
      <div className="h-px flex-1 bg-primary/15" />
      {children}
      <div className="h-px flex-1 bg-primary/15" />
    </h3>
  );
}

function Field({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-foreground">{value ?? <span className="text-muted-foreground/50 italic text-xs">Não informado</span>}</p>
    </div>
  );
}

function FormInput({ label, value, onChange, type = "text", placeholder = "" }: {
  label: string; value: string | number | null | undefined;
  onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

function FormSelect({ label, value, onChange, options }: {
  label: string; value: string | null | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{label}</label>
      <select
        value={value ?? ""}
        onChange={e => onChange(e.target.value)}
        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50"
      >
        <option value="">Selecionar...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function GoalBar({ label, current, goal, unit = "", inverse = false, color = "bg-primary" }: {
  label: string; current: number | null; goal: number | null;
  unit?: string; inverse?: boolean; color?: string;
}) {
  const hasCurrent = current != null;
  const hasGoal = goal != null && goal > 0;
  const progress = hasGoal && hasCurrent ? pct(current!, goal!) : 0;
  const ratio = hasGoal && hasCurrent ? current! / goal! : null;

  let statusColor = "text-success";
  let statusIcon = <CheckCircle2 className="h-3.5 w-3.5" />;
  if (ratio !== null) {
    if (inverse ? ratio > 1.15 : ratio < 0.7) { statusColor = "text-destructive"; statusIcon = <TrendingDown className="h-3.5 w-3.5" />; }
    else if (inverse ? ratio > 1 : ratio < 0.9) { statusColor = "text-amber-400"; statusIcon = <AlertCircle className="h-3.5 w-3.5" />; }
    else statusIcon = <TrendingUp className="h-3.5 w-3.5" />;
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-muted-foreground">{label}</span>
        {ratio !== null && (
          <span className={`flex items-center gap-1 text-[10px] font-black ${statusColor}`}>
            {statusIcon}
            {(ratio * 100).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-xl font-black tracking-tight text-foreground">
          {hasCurrent ? `${current}${unit}` : "—"}
        </span>
        {hasGoal && (
          <span className="text-[11px] text-muted-foreground font-mono mb-0.5">
            / {goal}{unit} meta
          </span>
        )}
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${progress > 100 ? "bg-destructive" : color}`}
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ─── Tab: Visão Geral ─────────────────────────────────────────────────────────

function TabOverview({ client, metrics }: { client: ClientFull; metrics: MetricRow[] }) {
  const totals = useMemo(() => metrics.reduce(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      leads: acc.leads + r.leads,
      purchases: acc.purchases + r.purchases,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
    }),
    { spend: 0, leads: 0, purchases: 0, impressions: 0, clicks: 0 }
  ), [metrics]);

  const avgRoas = metrics.length > 0
    ? metrics.filter(r => r.roas > 0).reduce((s, r) => s + r.roas, 0) / (metrics.filter(r => r.roas > 0).length || 1)
    : 0;
  const avgCpa = totals.leads > 0 ? totals.spend / totals.leads : 0;
  const avgCtr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;

  const kpis = [
    { label: "Gasto Total", value: fmtBRL(totals.spend), icon: DollarSign, color: "text-primary" },
    { label: "Leads", value: fmtNum(totals.leads), icon: Target, color: "text-violet-400" },
    { label: "Compras", value: fmtNum(totals.purchases), icon: ShoppingCart, color: "text-emerald-400" },
    { label: "ROAS Médio", value: avgRoas > 0 ? `${avgRoas.toFixed(2)}x` : "—", icon: TrendingUp, color: "text-blue-400" },
    { label: "CPA Médio", value: avgCpa > 0 ? fmtBRL(avgCpa, 2) : "—", icon: BarChart3, color: "text-amber-400" },
    { label: "CTR Médio", value: avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—", icon: MousePointer, color: "text-cyan-400" },
    { label: "Impressões", value: fmtNum(totals.impressions), icon: Eye, color: "text-rose-400" },
    { label: "Cliques", value: fmtNum(totals.clicks), icon: MousePointer, color: "text-orange-400" },
  ];

  return (
    <div className="space-y-6">
      {!client.meta_ad_account_id && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
          <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
          <p className="text-xs font-semibold text-amber-300">
            Nenhuma conta de anúncio vinculada. Associe uma conta em <strong>Cadastro</strong> para ver métricas.
          </p>
        </div>
      )}

      {/* KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <motion.div
            key={k.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="rounded-xl border border-border bg-card p-3.5"
          >
            <div className="flex items-center gap-2 mb-2">
              <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
              <span className="text-[10px] font-bold text-muted-foreground">{k.label}</span>
            </div>
            <p className="text-lg font-black tracking-tight text-foreground">{k.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Tabela dos últimos 14 dias */}
      {metrics.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Histórico Diário — {metrics.length} dias</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="border-b border-border/50">
                  {["Data", "Gasto", "Leads", "Compras", "ROAS", "CPA", "CTR", "CPM"].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-black text-muted-foreground/70 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...metrics].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30).map((r, i) => (
                  <tr key={r.date} className={`border-b border-border/30 hover:bg-white/[0.02] transition-colors ${i % 2 === 0 ? "" : "bg-white/[0.01]"}`}>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">
                      {format(new Date(r.date), "dd/MM", { locale: ptBR })}
                    </td>
                    <td className="px-3 py-2 font-bold text-foreground whitespace-nowrap">{fmtBRL(r.spend, 2)}</td>
                    <td className="px-3 py-2 font-bold text-violet-400 whitespace-nowrap">{fmtNum(r.leads)}</td>
                    <td className="px-3 py-2 font-bold text-emerald-400 whitespace-nowrap">{fmtNum(r.purchases)}</td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap">
                      <span className={r.roas >= (client.target_roas ?? 0) && r.roas > 0 ? "text-success" : r.roas > 0 ? "text-amber-400" : "text-muted-foreground"}>
                        {r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-bold whitespace-nowrap">
                      <span className={r.cpa > 0 && client.target_cpa && r.cpa > client.target_cpa ? "text-destructive" : "text-foreground"}>
                        {r.cpa > 0 ? fmtBRL(r.cpa, 2) : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{r.ctr > 0 ? `${r.ctr.toFixed(2)}%` : "—"}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground whitespace-nowrap">{r.cpm > 0 ? fmtBRL(r.cpm, 2) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Metas & Performance ─────────────────────────────────────────────────

function TabGoals({ client, metrics }: { client: ClientFull; metrics: MetricRow[] }) {
  const periodDays = metrics.length || 1;
  const todayStr = getLocalDateString();
  const today = metrics.find(r => r.date === todayStr);

  const totalSpend = metrics.reduce((s, r) => s + r.spend, 0);

  const avgPeriod = metrics.length > 0 ? {
    leads: metrics.reduce((s, r) => s + r.leads, 0) / metrics.length,
    spend: metrics.reduce((s, r) => s + r.spend, 0) / metrics.length,
    purchases: metrics.reduce((s, r) => s + r.purchases, 0) / metrics.length,
    roas: metrics.filter(r => r.roas > 0).reduce((s, r) => s + r.roas, 0) / (metrics.filter(r => r.roas > 0).length || 1),
    cpa: metrics.filter(r => r.cpa > 0).reduce((s, r) => s + r.cpa, 0) / (metrics.filter(r => r.cpa > 0).length || 1),
    ctr: metrics.filter(r => r.ctr > 0).reduce((s, r) => s + r.ctr, 0) / (metrics.filter(r => r.ctr > 0).length || 1),
    cpm: metrics.filter(r => r.cpm > 0).reduce((s, r) => s + r.cpm, 0) / (metrics.filter(r => r.cpm > 0).length || 1),
  } : null;

  const taxRate = client.meta_tax_rate ?? 0.1215;
  const weeklyBruto = client.weekly_budget_goal ?? 0;
  const weeklyEffective = weeklyBruto * (1 - taxRate);
  const dailyBudget = weeklyEffective / 7;

  // Metas proporcionais ao período selecionado
  const periodBudgetGoal = dailyBudget * periodDays;
  const periodEffectiveGoal = (weeklyEffective / 7) * periodDays;

  return (
    <div className="space-y-6">
      {/* Orçamento */}
      <div>
        <SectionTitle>Orçamento</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <GoalBar
            label={periodDays === 1 ? "Gasto hoje" : `Gasto no período (${periodDays}d)`}
            current={totalSpend}
            goal={periodBudgetGoal > 0 ? periodBudgetGoal : null}
            unit=""
            color="bg-primary"
          />
          <GoalBar
            label={periodDays === 7 ? "Gasto semanal (efetivo)" : `Verba período efetiva (${periodDays}d)`}
            current={totalSpend}
            goal={periodEffectiveGoal > 0 ? periodEffectiveGoal : null}
            unit=""
            color="bg-blue-500"
          />
          <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
            <p className="text-xs font-bold text-muted-foreground">Calculadora Meta</p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adicionado/sem</span>
                <span className="font-black">{fmtBRL(weeklyBruto, 2)}</span>
              </div>
              <div className="flex justify-between text-destructive/80">
                <span>Imposto ({((taxRate) * 100).toFixed(2)}%)</span>
                <span className="font-black">- {fmtBRL(weeklyBruto * taxRate, 2)}</span>
              </div>
              <div className="border-t border-border pt-1 flex justify-between">
                <span className="text-muted-foreground">Verba efetiva</span>
                <span className="font-black text-success">{fmtBRL(weeklyEffective, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Diário efetivo</span>
                <span className="font-black">{fmtBRL(dailyBudget, 2)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Performance */}
      <div>
        <SectionTitle>Performance (média do período vs meta)</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <GoalBar label="Leads/dia" current={avgPeriod ? Math.round(avgPeriod.leads) : null} goal={client.daily_leads_goal} color="bg-violet-500" />
          <GoalBar label="Compras/dia" current={avgPeriod ? parseFloat(avgPeriod.purchases.toFixed(1)) : null} goal={client.daily_purchases_goal} color="bg-emerald-500" />
          <GoalBar label="ROAS" current={avgPeriod ? parseFloat(avgPeriod.roas.toFixed(2)) : null} goal={client.target_roas} color="bg-blue-500" />
          <GoalBar label="CPA máx (R$)" current={avgPeriod ? parseFloat(avgPeriod.cpa.toFixed(2)) : null} goal={client.target_cpa} inverse color="bg-amber-500" />
          <GoalBar label="CTR mín (%)" current={avgPeriod ? parseFloat(avgPeriod.ctr.toFixed(2)) : null} goal={client.target_ctr} unit="%" color="bg-cyan-500" />
          <GoalBar label="CPM máx (R$)" current={avgPeriod ? parseFloat(avgPeriod.cpm.toFixed(2)) : null} goal={client.target_cpm} inverse color="bg-rose-500" />
        </div>
      </div>

      {/* Estoque */}
      {client.stock_quantity != null && (
        <div>
          <SectionTitle>Estoque</SectionTitle>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-border bg-card p-3.5">
              <p className="text-[10px] font-bold text-muted-foreground mb-1.5">Em Estoque</p>
              <p className={`text-2xl font-black ${client.stock_quantity <= (client.stock_alert_threshold ?? 0) ? "text-amber-400" : "text-foreground"}`}>
                {fmtNum(client.stock_quantity)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">unidades</p>
            </div>
            {client.hero_product && (
              <div className="rounded-xl border border-border bg-card p-3.5 col-span-2">
                <p className="text-[10px] font-bold text-muted-foreground mb-1.5">Produto Principal</p>
                <p className="text-sm font-black text-foreground">{client.hero_product}</p>
              </div>
            )}
            {client.stock_alert_threshold != null && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3.5">
                <p className="text-[10px] font-bold text-amber-400 mb-1.5">Alerta abaixo de</p>
                <p className="text-2xl font-black text-amber-400">{fmtNum(client.stock_alert_threshold)}</p>
                <p className="text-[10px] text-amber-400/60 mt-0.5">unidades</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Cadastro ────────────────────────────────────────────────────────────

function TabCadastro({ client, adAccounts }: {
  client: ClientFull;
  adAccounts: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<Partial<ClientFull>>({ ...client });
  const [dirty, setDirty] = useState(false);

  function set(key: keyof ClientFull, val: string | number | null) {
    setForm(prev => ({ ...prev, [key]: val === "" ? null : val }));
    setDirty(true);
  }

  function setNum(key: keyof ClientFull, val: string) {
    set(key, val === "" ? null : parseFloat(val));
  }

  function setInt(key: keyof ClientFull, val: string) {
    set(key, val === "" ? null : parseInt(val, 10));
  }

  const taxRate = (form.meta_tax_rate ?? 0.1215);
  const bruto = form.weekly_budget_goal ?? 0;
  const effective = bruto * (1 - taxRate);
  const daily = effective / 7;

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any).from("clients").update({
        name: form.name,
        status: form.status,
        niche: form.niche,
        store_url: form.store_url,
        platform: form.platform,
        product_type: form.product_type,
        average_ticket: form.average_ticket,
        sale_cycle_days: form.sale_cycle_days,
        contact_name: form.contact_name,
        contact_phone: form.contact_phone,
        logo_url: form.logo_url,
        meta_ad_account_id: form.meta_ad_account_id,
        weekly_budget_goal: form.weekly_budget_goal,
        meta_tax_rate: form.meta_tax_rate,
        objective_budgets: form.objective_budgets,
        stock_quantity: form.stock_quantity,
        stock_alert_threshold: form.stock_alert_threshold,
        hero_product: form.hero_product,
        daily_leads_goal: form.daily_leads_goal,
        daily_purchases_goal: form.daily_purchases_goal,
        target_cpa: form.target_cpa,
        target_roas: form.target_roas,
        target_ctr: form.target_ctr,
        target_cpm: form.target_cpm,
        target_conversion_rate: form.target_conversion_rate,
        peak_hours_start: form.peak_hours_start,
        peak_hours_end: form.peak_hours_end,
      }).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_detail", client.id] });
      qc.invalidateQueries({ queryKey: ["clients_full"] });
      toast.success("Cadastro salvo");
      setDirty(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      {/* Save bar */}
      <AnimatePresence>
        {dirty && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="sticky top-0 z-10 flex items-center justify-between rounded-xl border border-primary/30 bg-primary/10 px-4 py-3"
          >
            <p className="text-xs font-bold text-primary">Alterações não salvas</p>
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="flex items-center gap-2 rounded-lg bg-primary px-4 py-1.5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Salvar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Informações da Loja */}
      <div>
        <SectionTitle>Informações da Loja</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <FormInput label="Nome / Loja *" value={form.name} onChange={v => set("name", v)} placeholder="Nome da loja" />
          <FormInput label="URL da Loja" value={form.store_url} onChange={v => set("store_url", v)} placeholder="https://suamarca.com.br" />
          <FormInput label="URL do Logo" value={form.logo_url} onChange={v => set("logo_url", v)} placeholder="https://..." />
          <FormSelect label="Nicho" value={form.niche} onChange={v => set("niche", v)} options={NICHES.map(n => ({ value: n, label: n }))} />
          <FormSelect label="Plataforma" value={form.platform} onChange={v => set("platform", v)} options={PLATFORMS.map(p => ({ value: p, label: p }))} />
          <FormSelect label="Tipo de Produto" value={form.product_type} onChange={v => set("product_type", v)} options={PRODUCT_TYPES.map(t => ({ value: t, label: t }))} />
          <FormInput label="Ticket Médio (R$)" value={form.average_ticket} onChange={v => setNum("average_ticket", v)} type="number" placeholder="0.00" />
          <FormInput label="Ciclo de Venda (dias)" value={form.sale_cycle_days} onChange={v => setInt("sale_cycle_days", v)} type="number" placeholder="Ex: 7" />
          <FormSelect label="Status" value={form.status} onChange={v => set("status", v)} options={STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))} />
        </div>
      </div>

      {/* Contato */}
      <div>
        <SectionTitle>Contato</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput label="Nome do Responsável" value={form.contact_name} onChange={v => set("contact_name", v)} placeholder="João Silva" />
          <FormInput label="WhatsApp / Telefone" value={form.contact_phone} onChange={v => set("contact_phone", v)} placeholder="(21) 99999-9999" />
        </div>
      </div>

      {/* Meta Ads */}
      <div>
        <SectionTitle>Meta Ads</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Conta de Anúncio</label>
            <select
              value={form.meta_ad_account_id ?? ""}
              onChange={e => set("meta_ad_account_id", e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-medium text-foreground focus:outline-none focus:border-primary/50"
            >
              <option value="">Sem vínculo</option>
              {adAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orçamento */}
      <div>
        <SectionTitle>Orçamento Semanal</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FormInput
            label="Valor adicionado no Meta (R$)"
            value={form.weekly_budget_goal}
            onChange={v => setNum("weekly_budget_goal", v)}
            type="number"
            placeholder="Ex: 1000.00"
          />
          <FormInput
            label="Taxa de Imposto Meta (%)"
            value={form.meta_tax_rate != null ? (form.meta_tax_rate * 100).toFixed(2) : ""}
            onChange={v => set("meta_tax_rate", v === "" ? null : parseFloat(v) / 100)}
            type="number"
            placeholder="12.15"
          />
          {/* Calculadora readonly */}
          <div className="rounded-xl border border-primary/15 bg-primary/5 p-3.5 sm:col-span-2">
            <p className="text-[10px] font-black text-primary uppercase tracking-wider mb-2">Calculadora</p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Adicionado</span>
                <span className="font-black">{fmtBRL(bruto, 2)}</span>
              </div>
              <div className="flex justify-between text-destructive/80">
                <span>Imposto ({(taxRate * 100).toFixed(2)}%)</span>
                <span className="font-black">- {fmtBRL(bruto * taxRate, 2)}</span>
              </div>
              <div className="border-t border-primary/15 pt-1 flex justify-between">
                <span className="text-muted-foreground">Verba efetiva</span>
                <span className="font-black text-success">{fmtBRL(effective, 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Orçamento diário</span>
                <span className="font-black text-primary">{fmtBRL(daily, 2)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Por objetivo */}
        <div className="mt-4">
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Orçamento por Objetivo (R$/dia)</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {OBJECTIVES.map(obj => (
              <div key={obj}>
                <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">{OBJECTIVE_LABELS[obj]}</label>
                <input
                  type="number"
                  value={form.objective_budgets?.[obj] ?? ""}
                  onChange={e => {
                    const v = e.target.value === "" ? undefined : parseFloat(e.target.value);
                    setForm(prev => ({
                      ...prev,
                      objective_budgets: { ...(prev.objective_budgets ?? {}), [obj]: v as number }
                    }));
                    setDirty(true);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-border bg-background px-2.5 py-2 text-sm font-medium placeholder:text-muted-foreground/40 focus:outline-none focus:border-primary/50"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Metas de Performance */}
      <div>
        <SectionTitle>Metas de Performance</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <FormInput label="Meta Leads/dia" value={form.daily_leads_goal} onChange={v => setInt("daily_leads_goal", v)} type="number" placeholder="Ex: 10" />
          <FormInput label="Meta Compras/dia" value={form.daily_purchases_goal} onChange={v => setInt("daily_purchases_goal", v)} type="number" placeholder="Ex: 3" />
          <FormInput label="CPA máximo (R$)" value={form.target_cpa} onChange={v => setNum("target_cpa", v)} type="number" placeholder="Ex: 50.00" />
          <FormInput label="ROAS mínimo" value={form.target_roas} onChange={v => setNum("target_roas", v)} type="number" placeholder="Ex: 3.0" />
          <FormInput label="CTR mínimo (%)" value={form.target_ctr} onChange={v => setNum("target_ctr", v)} type="number" placeholder="Ex: 1.5" />
          <FormInput label="CPM máximo (R$)" value={form.target_cpm} onChange={v => setNum("target_cpm", v)} type="number" placeholder="Ex: 20.00" />
        </div>
      </div>

      {/* Estoque */}
      <div>
        <SectionTitle>Estoque & Operação</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <FormInput label="Estoque atual (un.)" value={form.stock_quantity} onChange={v => setInt("stock_quantity", v)} type="number" placeholder="Ex: 500" />
          <FormInput label="Alerta abaixo de (un.)" value={form.stock_alert_threshold} onChange={v => setInt("stock_alert_threshold", v)} type="number" placeholder="Ex: 50" />
          <FormInput label="Produto principal" value={form.hero_product} onChange={v => set("hero_product", v)} placeholder="Nome do produto hero" />
          <div className="grid grid-cols-2 gap-2">
            <FormInput label="Horário pico início" value={form.peak_hours_start} onChange={v => set("peak_hours_start", v)} type="time" />
            <FormInput label="Horário pico fim" value={form.peak_hours_end} onChange={v => set("peak_hours_end", v)} type="time" />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={() => save.mutate()}
          disabled={save.isPending || !dirty}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-black text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar Cadastro
        </button>
      </div>
    </div>
  );
}

// ─── Tab: Notas & Regras ──────────────────────────────────────────────────────

type NoteItem = {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  created_at: string;
};

const NOTE_CATEGORIES = ["Geral", "Reunião", "Campanha", "Briefing", "Ajuste", "Financeiro"];
const NOTE_CAT_STYLE: Record<string, { bg: string; text: string; icon: any }> = {
  "Geral":      { bg: "bg-muted/40 border-border", text: "text-muted-foreground", icon: Clock },
  "Reunião":    { bg: "bg-violet-500/10 border-violet-500/20", text: "text-violet-400", icon: Users },
  "Campanha":   { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", icon: TrendingUp },
  "Briefing":   { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", icon: FileText },
  "Ajuste":     { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", icon: Zap },
  "Financeiro": { bg: "bg-rose-500/10 border-rose-500/20", text: "text-rose-400", icon: DollarSign },
};

function TabNotes({ client, notes = [], notesLoading = false }: {
  client: ClientFull;
  notes?: NoteItem[];
  notesLoading?: boolean;
}) {
  const qc = useQueryClient();
  const [rules, setRules] = useState<RuleItem[]>(client.rules ?? []);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleItem | null>(null);
  const [ruleForm, setRuleForm] = useState({ title: "", category: "Outros", content: "" });

  // Estados do histórico de notas
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "", category: "Geral", tagsStr: "" });
  const [searchNote, setSearchNote] = useState("");
  const [filterNoteCategory, setFilterNoteCategory] = useState("todos");

  const saveNoteMutation = useMutation({
    mutationFn: async (newNote: { title: string; content: string; category: string; tags: string[] }) => {
      const { data: u } = await supabase.auth.getUser();
      
      // 1. Tenta inserir na tabela client_notes
      const { error: insertError } = await (supabase as any).from("client_notes").insert({
        client_id: client.id,
        title: newNote.title,
        content: newNote.content,
        category: newNote.category,
        tags: newNote.tags,
        created_by: u.user?.id
      });

      // 2. Fallback: Se falhar (tabela não criada), grava serializado no clients.notes
      if (insertError) {
        console.warn("Inserção em client_notes falhou, utilizando JSON no clients.notes:", insertError);
        
        let currentNotes: any[] = [];
        if (client.notes) {
          try {
            const parsed = JSON.parse(client.notes);
            if (Array.isArray(parsed)) currentNotes = parsed;
          } catch {
            currentNotes = [{
              id: "legacy",
              title: "Nota Geral (Legada)",
              content: client.notes,
              category: "Geral",
              tags: ["Histórico"],
              created_at: client.created_at || new Date().toISOString()
            }];
          }
        }

        const noteObj = {
          id: crypto.randomUUID(),
          title: newNote.title,
          content: newNote.content,
          category: newNote.category,
          tags: newNote.tags,
          created_at: new Date().toISOString()
        };

        const merged = [noteObj, ...currentNotes];
        const { error: updateError } = await (supabase as any)
          .from("clients")
          .update({ notes: JSON.stringify(merged) })
          .eq("id", client.id);

        if (updateError) throw updateError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_notes", client.id] });
      qc.invalidateQueries({ queryKey: ["client_detail", client.id] });
      toast.success("Nota adicionada ao histórico!");
      setNoteForm({ title: "", content: "", category: "Geral", tagsStr: "" });
      setShowNoteForm(false);
    },
    onError: (e: Error) => toast.error("Erro ao salvar nota: " + e.message)
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      // 1. Tenta deletar de client_notes
      const { error: deleteError } = await (supabase as any).from("client_notes").delete().eq("id", noteId);

      // 2. Fallback: deleta do JSON no clients.notes
      if (deleteError) {
        if (client.notes) {
          try {
            const parsed = JSON.parse(client.notes);
            if (Array.isArray(parsed)) {
              const filtered = parsed.filter((n: any) => n.id !== noteId);
              const { error: updateError } = await (supabase as any)
                .from("clients")
                .update({ notes: JSON.stringify(filtered) })
                .eq("id", client.id);
              if (updateError) throw updateError;
            }
          } catch {
            const { error: updateError } = await (supabase as any)
              .from("clients")
              .update({ notes: null })
              .eq("id", client.id);
            if (updateError) throw updateError;
          }
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_notes", client.id] });
      qc.invalidateQueries({ queryKey: ["client_detail", client.id] });
      toast.success("Nota removida com sucesso");
    },
    onError: (e: Error) => toast.error("Erro ao remover nota: " + e.message)
  });

  const saveRules = useMutation({
    mutationFn: async (newRules: RuleItem[]) => {
      const { error } = await (supabase as any).from("clients").update({ rules: newRules }).eq("id", client.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client_detail", client.id] });
      toast.success("Regras salvas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function openNewRule() {
    setEditingRule(null);
    setRuleForm({ title: "", category: "Outros", content: "" });
    setShowRuleForm(true);
  }

  function openEditRule(rule: RuleItem) {
    setEditingRule(rule);
    setRuleForm({ title: rule.title, category: rule.category, content: rule.content });
    setShowRuleForm(true);
  }

  function submitRule() {
    if (!ruleForm.title.trim() || !ruleForm.content.trim()) return;
    let newRules: RuleItem[];
    if (editingRule) {
      newRules = rules.map(r => r.id === editingRule.id ? { ...r, ...ruleForm } : r);
    } else {
      newRules = [...rules, { id: crypto.randomUUID(), ...ruleForm }];
    }
    setRules(newRules);
    saveRules.mutate(newRules);
    setShowRuleForm(false);
  }

  function deleteRule(id: string) {
    const newRules = rules.filter(r => r.id !== id);
    setRules(newRules);
    saveRules.mutate(newRules);
  }

  function handleAddNote() {
    if (!noteForm.title.trim() || !noteForm.content.trim()) {
      toast.error("Por favor preencha o título e o conteúdo da nota.");
      return;
    }
    const tags = noteForm.tagsStr
      ? noteForm.tagsStr.split(",").map(t => t.trim()).filter(t => t !== "")
      : [];
    saveNoteMutation.mutate({
      title: noteForm.title,
      content: noteForm.content,
      category: noteForm.category,
      tags
    });
  }

  // Filtrar notas
  const filteredNotes = notes.filter(n => {
    const matchSearch = !searchNote || 
      n.title.toLowerCase().includes(searchNote.toLowerCase()) ||
      n.content.toLowerCase().includes(searchNote.toLowerCase()) ||
      n.tags.some(t => t.toLowerCase().includes(searchNote.toLowerCase()));
    
    const matchCategory = filterNoteCategory === "todos" || n.category === filterNoteCategory;
    return matchSearch && matchCategory;
  });

  const grouped = RULE_CATEGORIES.reduce<Record<string, RuleItem[]>>((acc, cat) => {
    const items = rules.filter(r => r.category === cat);
    if (items.length > 0) acc[cat] = items;
    return acc;
  }, {});

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Coluna Esquerda: Timeline e Histórico de Notas */}
      <div className="lg:col-span-2 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/40 pb-3">
          <div>
            <h3 className="text-sm font-black tracking-tight flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" /> Histórico de Notas
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Timeline e registros de reuniões, briefings e alterações estratégicas.</p>
          </div>
          
          <button
            onClick={() => setShowNoteForm(!showNoteForm)}
            className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-black text-primary-foreground hover:opacity-90 transition-opacity whitespace-nowrap self-start sm:self-auto"
          >
            {showNoteForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showNoteForm ? "Cancelar" : "Nova Nota"}
          </button>
        </div>

        {/* Form para adicionar nova nota */}
        <AnimatePresence>
          {showNoteForm && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-primary/20 bg-card p-4 space-y-4 shadow-lg relative overflow-hidden"
            >
              <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-primary/20 via-primary to-primary/20" />
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Título da Nota *</label>
                  <input
                    value={noteForm.title}
                    onChange={e => setNoteForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ex: Alinhamento de Verba Q3"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Categoria</label>
                  <select
                    value={noteForm.category}
                    onChange={e => setNoteForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {NOTE_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Tags (separadas por vírgula)</label>
                <input
                  value={noteForm.tagsStr}
                  onChange={e => setNoteForm(p => ({ ...p, tagsStr: e.target.value }))}
                  placeholder="Ex: criativos, escala, urgência"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Conteúdo / Descrição *</label>
                <textarea
                  value={noteForm.content}
                  onChange={e => setNoteForm(p => ({ ...p, content: e.target.value }))}
                  placeholder="Descreva detalhadamente o ocorrido, as mudanças ou o briefing da reunião..."
                  rows={4}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50 resize-none custom-scrollbar"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowNoteForm(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-bold text-muted-foreground hover:bg-muted/40"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAddNote}
                  disabled={saveNoteMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-5 py-2 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saveNoteMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Salvar Nota
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Busca e filtros rápidos */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            value={searchNote}
            onChange={e => setSearchNote(e.target.value)}
            placeholder="Pesquisar nas notas..."
            className="rounded-xl border border-border bg-card px-3 py-2 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 flex-1"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0 shrink-0">
            {["todos", ...NOTE_CATEGORIES].map(cat => (
              <button
                key={cat}
                onClick={() => setFilterNoteCategory(cat)}
                className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold transition-all ${
                  filterNoteCategory === cat
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "border-border text-muted-foreground hover:border-primary/20 hover:text-foreground"
                }`}
              >
                {cat === "todos" ? "Todos" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline de notas */}
        {notesLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed border-border rounded-xl">
            <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-xs font-bold text-muted-foreground">Nenhuma nota encontrada</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Adicione sua primeira nota do histórico usando o botão acima.</p>
          </div>
        ) : (
          <div className="relative pl-6 border-l border-border/60 ml-3 space-y-6 py-2">
            {filteredNotes.map((note) => {
              const style = NOTE_CAT_STYLE[note.category] ?? NOTE_CAT_STYLE.Geral;
              const Icon = style.icon;
              return (
                <motion.div
                  key={note.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="relative group bg-card/40 hover:bg-card border border-border rounded-xl p-4 transition-all duration-200"
                >
                  {/* Ponto na timeline com ícone */}
                  <div className={`absolute -left-[35px] top-4 h-6.5 w-6.5 rounded-full border ${style.bg} flex items-center justify-center shadow-md z-10 bg-background`}>
                    <Icon className={`h-3 w-3 ${style.text}`} />
                  </div>

                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-black text-foreground">{note.title}</h4>
                        <span className={`rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${style.bg} ${style.text}`}>
                          {note.category}
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground font-mono">
                        {format(new Date(note.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </span>
                    </div>

                    <button
                      onClick={() => {
                        if (confirm("Tem certeza que deseja excluir esta nota?")) {
                          deleteNoteMutation.mutate(note.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 rounded-lg bg-destructive/10 flex items-center justify-center hover:bg-destructive/20"
                      title="Deletar nota"
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </button>
                  </div>

                  <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {note.content}
                  </p>

                  {note.tags && note.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                      {note.tags.map(tag => (
                        <span key={tag} className="rounded-full bg-white/[0.04] border border-border px-2 py-0.5 text-[8px] font-bold text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Coluna Direita: Regras & Particularidades */}
      <div className="space-y-6 border-t lg:border-t-0 lg:border-l border-border/40 pt-6 lg:pt-0 lg:pl-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-black tracking-tight">Regras do Cliente</h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">Políticas específicas para o time operacional.</p>
          </div>
          <button
            onClick={openNewRule}
            className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[10px] font-black text-primary hover:bg-primary/20 transition-colors"
          >
            <Plus className="h-3 w-3" /> Nova Regra
          </button>
        </div>

        {rules.length === 0 && !showRuleForm && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2.5 border border-dashed border-border rounded-xl">
            <FileText className="h-7 w-7 text-muted-foreground/30" />
            <div>
              <p className="text-xs font-bold text-muted-foreground">Nenhuma regra cadastrada</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">Adicione regras de escala, pausamento, criativos, etc.</p>
            </div>
          </div>
        )}

        {/* Rule Form */}
        <AnimatePresence>
          {showRuleForm && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.98 }}
              className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-primary">{editingRule ? "Editar Regra" : "Nova Regra"}</p>
                <button onClick={() => setShowRuleForm(false)} className="h-6 w-6 rounded-lg bg-muted/40 flex items-center justify-center">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Título *</label>
                  <input
                    value={ruleForm.title}
                    onChange={e => setRuleForm(p => ({ ...p, title: e.target.value }))}
                    placeholder="Ex: Nunca pausar no final de semana"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Categoria</label>
                  <select
                    value={ruleForm.category}
                    onChange={e => setRuleForm(p => ({ ...p, category: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:border-primary/50"
                  >
                    {RULE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 block">Descrição *</label>
                  <textarea
                    value={ruleForm.content}
                    onChange={e => setRuleForm(p => ({ ...p, content: e.target.value }))}
                    placeholder="Descreva a regra com detalhes e o motivo..."
                    rows={3}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium focus:outline-none focus:border-primary/50 resize-none"
                  />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowRuleForm(false)} className="rounded-xl border border-border px-3 py-1.5 text-xs font-bold text-muted-foreground hover:bg-muted/40">
                  Cancelar
                </button>
                <button
                  onClick={submitRule}
                  disabled={!ruleForm.title.trim() || !ruleForm.content.trim() || saveRules.isPending}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  {saveRules.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                  {editingRule ? "Salvar" : "Adicionar"}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Rules by category */}
        <div className="space-y-4">
          {Object.entries(grouped).map(([cat, items]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className={`rounded border px-2 py-0.5 text-[8px] font-black uppercase tracking-wider ${RULE_CAT_COLOR[cat]}`}>
                  {cat}
                </span>
                <span className="text-[9px] text-muted-foreground font-mono">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map(rule => (
                  <motion.div
                    key={rule.id}
                    layout
                    className="group rounded-xl border border-border bg-card/65 p-3 hover:border-primary/20 transition-colors relative"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-black text-foreground">{rule.title}</p>
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => openEditRule(rule)}
                          className="h-5 w-5 rounded bg-muted/40 flex items-center justify-center hover:bg-muted/70 transition-colors"
                        >
                          <Edit3 className="h-2.5 w-2.5" />
                        </button>
                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="h-5 w-5 rounded bg-destructive/10 flex items-center justify-center hover:bg-destructive/20 transition-colors"
                        >
                          <Trash2 className="h-2.5 w-2.5 text-destructive" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{rule.content}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
  { id: "overview", label: "Visão Geral", icon: BarChart3 },
  { id: "goals", label: "Metas & Performance", icon: Target },
  { id: "cadastro", label: "Cadastro", icon: Settings },
  { id: "notes", label: "Notas & Regras", icon: FileText },
];

function ClientDetailPage() {
  const { clientId } = Route.useParams();
  const [activeTab, setActiveTab] = useState("overview");
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useGlobalDate();

  const { data: client, isLoading: clientLoading } = useQuery({
    queryKey: ["client_detail", clientId],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("*").eq("id", clientId).maybeSingle();
      if (error) throw error;
      return data as ClientFull | null;
    },
  });

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("id, name").order("name");
      return data as { id: string; name: string }[] ?? [];
    },
  });

  // Busca 90 dias — filtro de datas é feito no frontend
  const { data: metrics = [] } = useQuery({
    queryKey: ["client_metrics_90d", client?.meta_ad_account_id],
    enabled: !!client?.meta_ad_account_id,
    queryFn: async () => {
      const since = subDays(new Date(), 89).toISOString().slice(0, 10);
      const { data } = await (supabase as any)
        .from("daily_metrics")
        .select("date, spend, leads, purchases, results, impressions, clicks, roas, ctr, cpm, cpa, reach")
        .eq("ad_account_id", client!.meta_ad_account_id!)
        .gte("date", since)
        .order("date", { ascending: true });
      return (data as MetricRow[]) ?? [];
    },
    refetchInterval: 3 * 60 * 1000,
    staleTime: 0,
  });

  const { data: dbNotes = [], isLoading: notesLoading } = useQuery({
    queryKey: ["client_notes", clientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("client_notes")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false });

      if (error || !data || data.length === 0) {
        if (client?.notes) {
          try {
            const parsed = JSON.parse(client.notes);
            if (Array.isArray(parsed)) {
              return parsed.map((n: any, idx: number) => ({
                id: n.id || `local-${idx}`,
                title: n.title || "Nota Geral",
                content: n.content || "",
                category: n.category || "Geral",
                tags: n.tags || [],
                created_at: n.created_at || client?.created_at || new Date().toISOString()
              }));
            }
          } catch {
            return [{
              id: "legacy",
              title: "Nota Geral (Legada)",
              content: client.notes,
              category: "Geral",
              tags: ["Histórico"],
              created_at: client?.created_at || new Date().toISOString()
            }];
          }
        }
        return [];
      }
      return data as NoteItem[];
    },
    enabled: !!client,
  });

  // Métricas filtradas pelo range do calendário
  const filteredMetrics = useMemo(
    () => metrics.filter(r => r.date >= dateFrom && r.date <= dateTo),
    [metrics, dateFrom, dateTo]
  );

  const accountMap = Object.fromEntries(adAccounts.map(a => [a.id, a]));
  const linkedAccount = client?.meta_ad_account_id ? accountMap[client.meta_ad_account_id] : null;

  const today = getLocalDateString();
  const isDefaultRange = dateFrom === getLocalDateString(subDays(new Date(), 29)) && dateTo === today;

  if (clientLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
        <p className="font-bold">Cliente não encontrado</p>
        <Link to="/clientes" className="text-sm text-primary hover:underline">← Voltar aos clientes</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          to="/clientes"
          className="mt-1 h-8 w-8 shrink-0 rounded-xl border border-border bg-card flex items-center justify-center hover:border-primary/30 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            {/* Logo */}
            <div className="h-10 w-10 shrink-0 rounded-xl border border-border bg-muted/30 flex items-center justify-center overflow-hidden">
              {client.logo_url ? (
                <img src={client.logo_url} alt={client.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-black text-muted-foreground">
                  {client.name.split(" ").slice(0, 2).map(w => w[0]).join("").toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight">{client.name}</h1>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {client.niche && (
                  <span className="text-[10px] font-bold text-muted-foreground">{client.niche}</span>
                )}
                {client.platform && (
                  <>
                    <span className="text-muted-foreground/30">·</span>
                    <span className="text-[10px] font-bold text-muted-foreground">{client.platform}</span>
                  </>
                )}
                {client.store_url && (
                  <a
                    href={client.store_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Ver loja
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Conta Meta badge */}
        <div className={`hidden sm:flex items-center gap-2 rounded-xl border px-3 py-2 ${linkedAccount ? "border-blue-500/20 bg-blue-500/5" : "border-border bg-card"}`}>
          {linkedAccount ? (
            <>
              <Wifi className="h-3.5 w-3.5 text-blue-400" />
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase">Conta Meta</p>
                <p className="text-[11px] font-black text-foreground">{linkedAccount.name}</p>
              </div>
            </>
          ) : (
            <>
              <WifiOff className="h-3.5 w-3.5 text-muted-foreground/50" />
              <p className="text-[11px] text-muted-foreground/50">Sem conta vinculada</p>
            </>
          )}
        </div>
      </div>

      {/* Tabs + filtro de datas */}
      <div className="flex items-center justify-between border-b border-border">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold whitespace-nowrap transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
                {isActive && (
                  <motion.div
                    layoutId="client-tab-indicator"
                    className="absolute bottom-0 inset-x-2 h-[2px] rounded-full bg-primary"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Filtro de datas */}
        <div className="flex items-center gap-1.5 px-1 pb-1 shrink-0">
          <Calendar className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <input
            type="date"
            value={dateFrom}
            max={dateTo}
            onChange={e => setDateFrom(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
          />
          <span className="text-[10px] text-muted-foreground">até</span>
          <input
            type="date"
            value={dateTo}
            min={dateFrom}
            max={today}
            onChange={e => setDateTo(e.target.value)}
            className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-medium text-foreground focus:outline-none focus:border-primary/50 cursor-pointer"
          />
          {!isDefaultRange && (
            <button
              onClick={() => {
                setDateFrom(getLocalDateString(subDays(new Date(), 29)));
                setDateTo(today);
              }}
              className="text-[10px] font-bold text-primary hover:text-primary/70 transition-colors"
            >
              30d
            </button>
          )}
        </div>
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {activeTab === "overview" && <TabOverview client={client} metrics={filteredMetrics} />}
          {activeTab === "goals" && <TabGoals client={client} metrics={filteredMetrics} />}
          {activeTab === "cadastro" && <TabCadastro client={client} adAccounts={adAccounts} />}
          {activeTab === "notes" && <TabNotes client={client} notes={dbNotes} notesLoading={notesLoading} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
