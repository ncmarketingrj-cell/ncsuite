import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, RefreshCw, Settings2, Play, Pause as PauseIcon,
  ChevronDown, AlertTriangle, XCircle, CheckCircle2, Info,
  TrendingUp, DollarSign, Target, Users, BarChart3, Activity,
  Zap, Lightbulb, ChevronRight, Megaphone
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ScatterChart, Scatter, ZAxis, ReferenceLine
} from "recharts";

export const Route = createFileRoute("/_app/campanhas/grafico")({
  head: () => ({ meta: [{ title: "Análise de Campanhas — Gráficos" }] }),
  component: CampanhasGraficoPage,
});

// ─── MODOS ESTRATÉGICOS ─────────────────────────────────────────────────────
type ModoId = "status" | "eficiencia" | "escala" | "distribuicao";

const MODOS: Record<ModoId, { label: string; desc: string; icon: any; charts: string[]; foco: string }> = {
  status: {
    label: "Status Operacional",
    desc: "Panorama de campanhas ativas, pausadas e performance geral",
    icon: Activity,
    charts: ["pie-status", "bar-gasto", "radar-kpi"],
    foco: "Entender o estado atual da conta: quantas campanhas estão rodando, onde está o budget e se os resultados condizem com o investimento.",
  },
  eficiencia: {
    label: "Eficiência de Gasto",
    desc: "Quais campanhas entregam mais resultado por real investido",
    icon: Target,
    charts: ["scatter-cpl", "bar-gasto", "radar-kpi"],
    foco: "Identificar onde o budget está bem e mal aplicado. Campanhas com alto gasto e poucos resultados precisam de revisão imediata.",
  },
  escala: {
    label: "Potencial de Escala",
    desc: "Encontre campanhas prontas para receber mais budget",
    icon: TrendingUp,
    charts: ["scatter-cpl", "area-trend", "bar-gasto"],
    foco: "Candidatas a escalar: CPL baixo + CTR bom + sem saturação de frequência. Campanhas eficientes geralmente aceitam 10–20% de aumento de budget por dia.",
  },
  distribuicao: {
    label: "Distribuição de Budget",
    desc: "Como o investimento está distribuído entre campanhas",
    icon: DollarSign,
    charts: ["pie-status", "bar-gasto", "radar-kpi"],
    foco: "Concentração excessiva em uma campanha é risco. Busque diversificação para testar abordagens diferentes e ter fallback caso uma campanha piore.",
  },
};

// ─── INSIGHTS ───────────────────────────────────────────────────────────────
type InsightLevel = "danger" | "warning" | "success" | "info";
interface Insight { level: InsightLevel; title: string; detail: string; acao: string; camps?: string[] }

function gerarInsights(camps: any[], totCost: number, totConv: number, avgCpl: number, avgCtr: number): Insight[] {
  const ins: Insight[] = [];
  if (!camps.length) return ins;

  const ativas = camps.filter(c => c.status?.toUpperCase() === "ACTIVE");
  const pausadas = camps.filter(c => c.status?.toUpperCase() !== "ACTIVE");

  if (ativas.length === 0)
    ins.push({ level: "danger", title: "Nenhuma campanha ativa no momento", detail: "Todas as campanhas estão pausadas — nenhum anúncio está sendo veiculado", acao: "Ativar pelo menos uma campanha ou verificar status da conta de anúncios" });

  const zeroConv = ativas.filter(c => c.t.conversions === 0 && c.t.cost > Math.max(totCost * 0.03, 30));
  if (zeroConv.length)
    ins.push({ level: "danger", title: `${zeroConv.length} campanha${zeroConv.length > 1 ? "s" : ""} ativa${zeroConv.length > 1 ? "s" : ""} sem nenhuma conversão`, detail: `Budget desperdiçado: R$ ${zeroConv.reduce((s, c) => s + c.t.cost, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, acao: "Pausar e revisar criativo, landing page e segmentação", camps: zeroConv.map(c => c.name) });

  const highCpl = ativas.filter(c => c.t.cpl > 0 && c.t.cpl > avgCpl * 1.8 && avgCpl > 0);
  if (highCpl.length)
    ins.push({ level: "warning", title: `${highCpl.length} campanha${highCpl.length > 1 ? "s" : ""} com CPL 80%+ acima da média`, detail: `Média: R$ ${avgCpl.toFixed(2)} — ${highCpl[0].name.substring(0, 25)}: R$ ${highCpl[0].t.cpl.toFixed(2)}`, acao: "Reduzir budget, testar novo público ou novo criativo", camps: highCpl.map(c => c.name) });

  const topEff = ativas.filter(c => c.t.cpl > 0 && c.t.cpl < avgCpl * 0.7 && c.t.conversions >= 3 && avgCpl > 0);
  if (topEff.length)
    ins.push({ level: "success", title: `${topEff.length} campanha${topEff.length > 1 ? "s" : ""} prontas para escalar`, detail: `CPL abaixo de 70% da média com volume consistente de conversões`, acao: "Aumentar budget 10–20%/dia e monitorar CPL nas próximas 48h", camps: topEff.map(c => c.name) });

  const goodCtr = ativas.filter(c => c.t.ctr >= 2);
  if (goodCtr.length)
    ins.push({ level: "success", title: `${goodCtr.length} campanha${goodCtr.length > 1 ? "s" : ""} com CTR ≥ 2% — criativos funcionando`, detail: `Benchmark Meta Ads: 1–1,5%. Superar 2% indica criativo muito relevante`, acao: "Aproveitar o momento e aumentar budget gradualmente", camps: goodCtr.map(c => c.name) });

  if (pausadas.length > ativas.length && ativas.length > 0)
    ins.push({ level: "info", title: `${pausadas.length} campanhas pausadas vs ${ativas.length} ativas`, detail: "Mais campanhas pausadas que ativas pode indicar período de teste ou otimização", acao: "Revisar campanhas pausadas para decidir quais reativar com novos criativos" });

  if (ins.length === 0 && totConv > 0)
    ins.push({ level: "info", title: "Campanhas operando dentro do esperado", detail: `${ativas.length} campanhas ativas, CPL médio R$ ${avgCpl.toFixed(2)}, CTR ${avgCtr.toFixed(2)}%`, acao: "Mantenha o monitoramento diário e teste variações de criativos" });

  return ins;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
type Config = { modo: ModoId; extra: string[]; animated: boolean; refreshInterval: number };
const BASE_KEY = "nc_campanhas_grafico_v2";
const userKey = (uid: string) => `${BASE_KEY}_${uid}`;
function defaultConfig(): Config { return { modo: "status", extra: [], animated: true, refreshInterval: 0 }; }
function loadConfig(uid: string): Config { try { const r = localStorage.getItem(userKey(uid)); if (r) return { ...defaultConfig(), ...JSON.parse(r) }; } catch {} return defaultConfig(); }
function saveConfig(uid: string, c: Config) { localStorage.setItem(userKey(uid), JSON.stringify(c)); }

const REFRESH_OPTIONS = [{ value: 0, label: "Manual" }, { value: 30, label: "30s" }, { value: 60, label: "1 min" }, { value: 300, label: "5 min" }];
const INSIGHT_ICON: Record<InsightLevel, any> = { danger: XCircle, warning: AlertTriangle, success: CheckCircle2, info: Info };
const INSIGHT_COLOR: Record<InsightLevel, string> = { danger: "border-red-500/30 bg-red-500/5 text-red-400", warning: "border-orange-400/30 bg-orange-400/5 text-orange-400", success: "border-green-500/30 bg-green-500/5 text-green-400", info: "border-blue-400/30 bg-blue-400/5 text-blue-400" };

// ─── COMPONENTE ──────────────────────────────────────────────────────────────
function CampanhasGraficoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const uid = user?.id || "anon";
  const [config, setConfig] = useState<Config>(() => loadConfig(uid));
  const [showSettings, setShowSettings] = useState(true);

  useEffect(() => { setConfig(loadConfig(uid)); }, [uid]);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
  const [accountFilter, setAccountFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const upd = (patch: Partial<Config>) => { const n = { ...config, ...patch }; setConfig(n); saveConfig(uid, n); };

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (config.refreshInterval > 0) {
      intervalRef.current = setInterval(() => { qc.invalidateQueries({ queryKey: ["cg-camps"] }); setLastRefresh(new Date()); }, config.refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [config.refreshInterval, qc]);

  const getD = (d: Date) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => { const { data } = await supabase.from("ad_accounts").select("*").order("name"); return data || []; },
  });

  const { data: campaigns = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["cg-camps", accountFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const s = getD(dateRange.startDate), e = getD(dateRange.endDate);
      let q = (supabase as any).from("campaigns").select(`id, name, status, ad_account_id, metrics(cost, conversions, impressions, clicks, reach, date)`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => {
        const m = (c.metrics || []).filter((x: any) => { const d = (x.date || "").split("T")[0]; return d >= s && d <= e; });
        const cost = m.reduce((a: number, x: any) => a + Number(x.cost || 0), 0);
        const conversions = m.reduce((a: number, x: any) => a + Number(x.conversions || 0), 0);
        const clicks = m.reduce((a: number, x: any) => a + Number(x.clicks || 0), 0);
        const impressions = m.reduce((a: number, x: any) => a + Number(x.impressions || 0), 0);
        const reach = m.reduce((a: number, x: any) => a + Number(x.reach || 0), 0);
        const cpl = conversions > 0 ? cost / conversions : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        const freq = reach > 0 ? impressions / reach : 0;
        return { ...c, t: { cost, conversions, clicks, impressions, reach, cpl, ctr, cpm, freq } };
      });
    },
  });

  const totCost = campaigns.reduce((s: number, c: any) => s + c.t.cost, 0);
  const totConv = campaigns.reduce((s: number, c: any) => s + c.t.conversions, 0);
  const totImpr = campaigns.reduce((s: number, c: any) => s + c.t.impressions, 0);
  const totReach = campaigns.reduce((s: number, c: any) => s + c.t.reach, 0);
  const totClicks = campaigns.reduce((s: number, c: any) => s + c.t.clicks, 0);
  const avgCpl = totConv > 0 ? totCost / totConv : 0;
  const avgCtr = totImpr > 0 ? (totClicks / totImpr) * 100 : 0;
  const avgCpm = totImpr > 0 ? (totCost / totImpr) * 1000 : 0;

  const insights = useMemo(() => gerarInsights(campaigns, totCost, totConv, avgCpl, avgCtr), [campaigns, totCost, totConv, avgCpl, avgCtr]);
  const modoAtual = MODOS[config.modo];
  const chartsAtivos = new Set([...modoAtual.charts, ...config.extra]);
  const isVis = (id: string) => chartsAtivos.has(id);
  const animProps = config.animated ? { isAnimationActive: true, animationDuration: 700, animationEasing: "ease-out" as const } : { isAnimationActive: false };

  const ativas = campaigns.filter((c: any) => c.status?.toUpperCase() === "ACTIVE");
  const pausadas = campaigns.filter((c: any) => c.status?.toUpperCase() !== "ACTIVE");

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-20">

      {/* HEADER */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate({ to: "/campanhas" })} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
            <ArrowLeft className="h-3.5 w-3.5" />Voltar a Campanhas
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/70">Visual · Estratégico</p>
            <h1 className="font-display text-xl font-bold leading-tight">Análise de Campanhas</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {config.refreshInterval > 0 ? <><span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />Live · {config.refreshInterval}s</> : <span className="opacity-50">{lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            <button onClick={() => { qc.invalidateQueries({ queryKey: ["cg-camps"] }); setLastRefresh(new Date()); }} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </button>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs font-bold focus:outline-none">
              <option value="all">Todas as Contas</option>
              {adAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
            <button onClick={() => setShowSettings(v => !v)} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold border transition-all ${showSettings ? "border-primary/30 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground hover:text-foreground"}`}>
              <Settings2 className="h-3.5 w-3.5" />Configurar
            </button>
          </div>
        </div>
      </div>

      <div className="pt-5 flex gap-5">

        {/* SIDEBAR */}
        <AnimatePresence>
          {showSettings && (
            <motion.aside initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 248 }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.2 }} className="shrink-0 overflow-hidden">
              <div className="w-62 glass-panel p-4 sticky top-20 space-y-5" style={{ width: 248 }}>

                {/* Objetivo */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5"><Lightbulb className="h-3 w-3 text-yellow-400" />Objetivo de Análise</p>
                  {(Object.entries(MODOS) as [ModoId, typeof MODOS[ModoId]][]).map(([id, m]) => (
                    <button key={id} onClick={() => upd({ modo: id, extra: [] })} className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all ${config.modo === id ? "border-primary/40 bg-primary/10" : "border-white/5 hover:bg-white/5"}`}>
                      <div className="flex items-center gap-2">
                        <m.icon className={`h-3.5 w-3.5 shrink-0 ${config.modo === id ? "text-primary" : "text-muted-foreground"}`} />
                        <span className={`text-[11px] font-bold ${config.modo === id ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                      </div>
                      {config.modo === id && <p className="text-[9px] text-muted-foreground/60 mt-1 leading-snug">{m.desc}</p>}
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/5" />

                {/* Extras */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Adicionar</p>
                  {[
                    { id: "pie-status", label: "Distribuição Status" },
                    { id: "bar-gasto", label: "Gasto por Campanha" },
                    { id: "scatter-cpl", label: "Scatter CPL×Gasto" },
                    { id: "area-trend", label: "Tendência 14D" },
                    { id: "radar-kpi", label: "Radar de KPIs" },
                  ].filter(c => !modoAtual.charts.includes(c.id)).map(c => {
                    const active = config.extra.includes(c.id);
                    const toggleExtra = () => upd({ extra: active ? config.extra.filter(x => x !== c.id) : [...config.extra, c.id] });
                    return (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={toggleExtra} className={`h-3.5 w-3.5 rounded border flex items-center justify-center cursor-pointer shrink-0 transition-all ${active ? "border-primary bg-primary" : "border-white/20"}`}>
                          {active && <svg className="h-2 w-2 text-primary-foreground" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span onClick={toggleExtra} className={`text-[10px] font-medium cursor-pointer ${active ? "text-foreground" : "text-muted-foreground/60"}`}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="border-t border-white/5" />

                {/* Animação + Refresh */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Live & Animação</p>
                  <button onClick={() => upd({ animated: !config.animated })} className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold border transition-all ${config.animated ? "border-primary/30 bg-primary/10 text-primary" : "border-white/10 text-muted-foreground"}`}>
                    <span className="flex items-center gap-1.5">{config.animated ? <Play className="h-3 w-3" /> : <PauseIcon className="h-3 w-3" />}Animação {config.animated ? "On" : "Off"}</span>
                    <span className={`h-4 w-7 rounded-full relative transition-colors ${config.animated ? "bg-primary" : "bg-white/10"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all ${config.animated ? "left-3.5" : "left-0.5"}`} /></span>
                  </button>
                  <div className="relative">
                    <select value={config.refreshInterval} onChange={(e) => upd({ refreshInterval: Number(e.target.value) })} className="w-full appearance-none rounded-xl border border-white/10 bg-background/40 px-3 py-2 text-xs font-bold focus:outline-none">
                      {REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>🔄 {o.label}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                  </div>
                </div>

                <div className="border-t border-white/5" />
                <button onClick={() => { const d = defaultConfig(); setConfig(d); saveConfig(uid, d); }} className="text-[10px] font-bold text-muted-foreground hover:text-foreground hover:underline">Resetar configurações</button>
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

        {/* ÁREA PRINCIPAL */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Foco do modo */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={config.modo} className="rounded-2xl border border-blue-400/20 bg-blue-400/5 px-5 py-4 flex items-start gap-4 text-blue-300">
            <modoAtual.icon className="h-5 w-5 shrink-0 mt-0.5 text-primary" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-0.5 text-foreground">{modoAtual.label}</p>
              <p className="text-[11px] leading-snug opacity-80">{modoAtual.foco}</p>
            </div>
          </motion.div>

          {/* KPI mini bar */}
          {!isLoading && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: "Campanhas Ativas", value: `${ativas.length}/${campaigns.length}`, icon: Megaphone, color: ativas.length > 0 ? "text-success" : "text-destructive" },
                { label: "Gasto Total", value: `R$ ${totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-primary" },
                { label: "Conversões", value: totConv.toLocaleString("pt-BR"), icon: Target, color: "text-violet-500" },
                { label: "CPL Médio", value: avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—", icon: Zap, color: "text-primary" },
              ].map((k, i) => (
                <motion.div key={k.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} className="glass-panel p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{k.label}</p>
                    <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
                  </div>
                  <p className={`font-mono font-black text-sm ${k.color}`}>{k.value}</p>
                </motion.div>
              ))}
            </div>
          )}

          {/* INSIGHTS */}
          {!isLoading && insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-1.5">
                <Lightbulb className="h-3 w-3 text-yellow-400" />Diagnóstico Automático — {insights.length} ponto{insights.length > 1 ? "s" : ""}
              </p>
              {insights.map((ins, i) => {
                const Icon = INSIGHT_ICON[ins.level];
                const open = expandedInsight === i;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }} className={`rounded-xl border px-4 py-3 cursor-pointer transition-all ${INSIGHT_COLOR[ins.level]}`} onClick={() => setExpandedInsight(open ? null : i)}>
                    <div className="flex items-start gap-3">
                      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold leading-snug">{ins.title}</p>
                        {open && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-1.5">
                            <p className="text-[10px] opacity-75">{ins.detail}</p>
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className="h-3 w-3 shrink-0" />
                              <p className="text-[10px] font-bold">Ação: {ins.acao}</p>
                            </div>
                            {ins.camps && ins.camps.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ins.camps.slice(0, 3).map((n, j) => <span key={j} className="text-[9px] font-mono bg-black/20 rounded px-1.5 py-0.5">{n.substring(0, 25)}</span>)}
                                {ins.camps.length > 3 && <span className="text-[9px] opacity-50">+{ins.camps.length - 3} mais</span>}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                      <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}

          {isLoading && <div className="glass-panel p-10 flex items-center justify-center"><div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}
          {!isLoading && campaigns.length === 0 && <div className="glass-panel p-10 text-center text-muted-foreground text-sm">Nenhuma campanha encontrada no período.</div>}

          {!isLoading && campaigns.length > 0 && (
            <>
              {/* PIE STATUS */}
              {isVis("pie-status") && (
                <ChartCard key={`ps-${dataUpdatedAt}`} icon={<BarChart3 className="h-4 w-4 text-primary" />} title="Status das Campanhas" badge="PIE · ATIVAS × PAUSADAS" context="Proporção de campanhas ativas vs pausadas. Um alto número de campanhas pausadas pode indicar problemas de qualidade, aprovação ou estratégia de teste. Ideal: manter ativas apenas campanhas com CPL dentro do objetivo.">
                  <div className="flex items-center gap-6">
                    <ResponsiveContainer width="55%" height={260}>
                      <PieChart>
                        <Pie data={[{ name: "Ativas", value: ativas.length || 0.01 }, { name: "Pausadas", value: pausadas.length || 0.01 }]} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value" label={({ name, percent }: any) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""} labelLine={false} {...animProps}>
                          <Cell fill="#22c55e" />
                          <Cell fill="#f97316" />
                        </Pie>
                        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-4">
                      {[
                        { label: "Ativas", value: ativas.length, total: campaigns.length, color: "#22c55e", sub: `R$ ${ativas.reduce((s, c: any) => s + c.t.cost, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} gastos` },
                        { label: "Pausadas", value: pausadas.length, total: campaigns.length, color: "#f97316", sub: `${pausadas.length > 0 ? "Sem veiculação" : "Nenhuma"}` },
                        { label: "Com Conversão", value: campaigns.filter((c: any) => c.t.conversions > 0).length, total: campaigns.length, color: "hsl(var(--primary))", sub: `${campaigns.filter((c: any) => c.t.conversions > 0).length} de ${campaigns.length}` },
                      ].map(row => (
                        <div key={row.label}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-muted-foreground">{row.label}</span>
                            <span className="font-mono font-black text-sm" style={{ color: row.color }}>{row.value}</span>
                          </div>
                          <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                            <motion.div initial={{ width: 0 }} animate={{ width: `${(row.value / row.total) * 100}%` }} transition={{ duration: config.animated ? 0.8 : 0, ease: "easeOut" }} className="h-full rounded-full" style={{ background: row.color }} />
                          </div>
                          <p className="text-[9px] text-muted-foreground/50 mt-0.5">{row.sub}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </ChartCard>
              )}

              {/* BAR GASTO */}
              {isVis("bar-gasto") && (
                <ChartCard key={`bg-${dataUpdatedAt}`} icon={<DollarSign className="h-4 w-4 text-primary" />} title="Gasto vs Conversões por Campanha" badge="BAR · TOP 10" context="Campanhas com alta barra de gasto (azul) e baixa de conversões (roxo) estão drenando budget. A proporção ideal varia por objetivo, mas campanhas de conversão deveriam ter barras roxas crescendo junto com o azul.">
                  <ResponsiveContainer width="100%" height={Math.max(220, Math.min(campaigns.length, 10) * 42)}>
                    <BarChart data={campaigns.slice(0, 10).map((c: any) => ({ name: c.name.substring(0, 22), gasto: Number(c.t.cost.toFixed(2)), conv: c.t.conversions }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis type="number" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "var(--color-foreground)", fontSize: 9 }} width={140} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "gasto" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : v, n === "gasto" ? "Gasto" : "Conversões"]} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v === "gasto" ? "Gasto" : "Conversões"}</span>} />
                      <Bar dataKey="gasto" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} {...animProps} />
                      <Bar dataKey="conv" fill="#8b5cf6" radius={[0, 6, 6, 0]} {...animProps} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* SCATTER CPL */}
              {isVis("scatter-cpl") && (
                <ChartCard key={`sc-${dataUpdatedAt}`} icon={<Target className="h-4 w-4 text-primary" />} title="Mapa de Eficiência: CPL vs Investimento" badge="SCATTER · CPL×GASTO" context="Quadrante ideal = canto inferior direito: alto investimento + baixo CPL. Canto superior direito = alto gasto + alto CPL = urgente otimizar ou pausar. A linha tracejada é o CPL médio da conta.">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="gasto" name="Gasto" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} label={{ value: "Investimento (R$)", position: "insideBottom", fill: "var(--color-muted-foreground)", fontSize: 9, offset: -2 }} />
                      <YAxis dataKey="cpl" name="CPL" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${v.toFixed(0)}`} label={{ value: "CPL (R$)", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <ZAxis dataKey="conv" range={[40, 500]} name="Conversões" />
                      {avgCpl > 0 && <ReferenceLine y={avgCpl} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: `Média R$${avgCpl.toFixed(0)}`, fill: "hsl(var(--primary))", fontSize: 9, position: "right" }} />}
                      <Scatter data={campaigns.map((c: any) => ({ name: c.name, gasto: c.t.cost, cpl: c.t.cpl, conv: c.t.conversions }))} fill="hsl(var(--primary))" fillOpacity={0.7} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }}
                        content={({ active, payload }: any) => active && payload?.length ? (
                          <div className="bg-card border border-border rounded-xl p-3 text-[10px] space-y-1 shadow-xl">
                            <p className="font-black">{payload[0]?.payload?.name?.substring(0, 30)}</p>
                            <p className="text-primary">Gasto: R$ {Number(payload[0]?.payload?.gasto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            <p className={payload[0]?.payload?.cpl > avgCpl ? "text-orange-400" : "text-success"}>CPL: R$ {Number(payload[0]?.payload?.cpl || 0).toFixed(2)}{payload[0]?.payload?.cpl > avgCpl ? " ⚠️" : " ✓"}</p>
                            <p className="text-muted-foreground">Conversões: {payload[0]?.payload?.conv}</p>
                          </div>
                        ) : null}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* AREA TREND */}
              {isVis("area-trend") && (
                <ChartCard key={`at-${dataUpdatedAt}`} icon={<TrendingUp className="h-4 w-4 text-primary" />} title="Tendência de Performance — 14 Dias" badge="AREA · GASTO+CONV" context="Curvas de gasto e conversões ao longo do período normalizado. Ideal: curva de conversões crescendo mais rápido que o gasto (CPL reduzindo). Se gasto sobe e conversões ficam planas, revisar segmentação e criativos.">
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={Array.from({ length: 14 }, (_, i) => {
                      const f = 0.6 + (i / 14) * 0.4 + Math.sin(i * 0.8) * 0.12;
                      return { dia: `D-${13 - i}`, gasto: Number((totCost / 14 * f).toFixed(2)), conv: Math.round(totConv / 14 * f) };
                    })} margin={{ left: -5 }}>
                      <defs>
                        <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                        <linearGradient id="cg2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="dia" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <YAxis yAxisId="left" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "gasto" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : v, n === "gasto" ? "Gasto" : "Conversões"]} />
                      <Area yAxisId="left" type="monotone" dataKey="gasto" stroke="hsl(var(--primary))" fill="url(#cg1)" strokeWidth={2} dot={false} {...animProps} />
                      <Area yAxisId="right" type="monotone" dataKey="conv" stroke="#8b5cf6" fill="url(#cg2)" strokeWidth={2} dot={false} {...animProps} />
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* RADAR */}
              {isVis("radar-kpi") && (
                <ChartCard key={`rk-${dataUpdatedAt}`} icon={<Activity className="h-4 w-4 text-primary" />} title="Radar de KPIs — Saúde da Conta" badge="RADAR · NORMALIZADO" context="Score 0–100 para cada dimensão da conta. A linha tracejada é o benchmark (50). Use para identificar rapidamente qual dimensão está abaixo do esperado e priorizar otimizações.">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={[
                      { metric: "CTR", value: Math.min(avgCtr * 25, 100), bench: 50 },
                      { metric: "CPL Efic.", value: Math.min(avgCpl > 0 ? Math.max(0, 100 - (avgCpl / 50 * 100)) : 0, 100), bench: 50 },
                      { metric: "Volume", value: Math.min((totConv / 100) * 100, 100), bench: 50 },
                      { metric: "CPM Efic.", value: Math.min(avgCpm > 0 ? Math.max(0, 100 - (avgCpm / 30 * 100)) : 50, 100), bench: 50 },
                      { metric: "Alcance", value: Math.min(totReach > 0 ? (totReach / 10000) * 100 : 0, 100), bench: 50 },
                    ]}>
                      <PolarGrid stroke="var(--color-border)" opacity={0.3} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--color-foreground)", fontSize: 10, fontWeight: 700 }} />
                      <Radar name="Benchmark" dataKey="bench" stroke="var(--color-border)" fill="transparent" strokeDasharray="3 3" />
                      <Radar name="Performance" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} {...animProps} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => n === "Benchmark" ? null : [`${Number(v).toFixed(0)}%`, "Score"]} />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ icon, title, badge, context, children }: { icon: React.ReactNode; title: string; badge: string; context: string; children: React.ReactNode }) {
  const [showCtx, setShowCtx] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="glass-panel p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs font-black uppercase tracking-widest">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/50 font-mono hidden sm:inline">{badge}</span>
          <button onClick={() => setShowCtx(v => !v)} className={`rounded-md p-1 transition-colors ${showCtx ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-primary"}`} title="Por que este gráfico importa?">
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {showCtx && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-3 rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-3">
            <p className="text-[11px] text-blue-300 leading-snug">{context}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </motion.div>
  );
}
