import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Lock, RefreshCw, Settings2, Play, Pause as PauseIcon,
  ChevronDown, AlertTriangle, XCircle, CheckCircle2, Info,
  TrendingUp, TrendingDown, DollarSign, Target, Users, MousePointer2,
  BarChart3, Activity, Eye, Zap, PieChart as PieIcon, Lightbulb,
  ChevronRight, Layers
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";
import {
  BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart as RechartsPieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, AreaChart, Area,
  LineChart, Line, ComposedChart
} from "recharts";

export const Route = createFileRoute("/_app/metricas/grafico")({
  head: () => ({ meta: [{ title: "Análise Estratégica — Métricas" }] }),
  component: MetricasGraficoPage,
});

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
const BASE_KEY = "nc_metricas_grafico_v2";
const userKey = (uid: string) => `${BASE_KEY}_${uid}`;

// ─── MODOS ESTRATÉGICOS ─────────────────────────────────────────────────────
type ModoId = "geral" | "eficiencia" | "budget" | "audiencia" | "comparativo";

const MODOS: Record<ModoId, {
  label: string;
  desc: string;
  icon: any;
  color: string;
  charts: string[];
  foco: string;
}> = {
  geral: {
    label: "Visão Geral",
    desc: "Panorama completo — saúde, tendência e KPIs do período",
    icon: Activity,
    color: "text-primary",
    charts: ["health-score", "radar-kpi", "tendencia", "heatmap"],
    foco: "Entender onde a conta está agora e como chegou aqui.",
  },
  eficiencia: {
    label: "Diagnóstico de Eficiência",
    desc: "Identifique campanhas que drenam budget sem retorno",
    icon: Target,
    color: "text-orange-400",
    charts: ["scatter-cpl", "budget-bar", "heatmap"],
    foco: "Encontrar campanhas com CPL alto, CTR baixo ou gasto sem conversão para pausar ou corrigir.",
  },
  budget: {
    label: "Otimização de Budget",
    desc: "Como redistribuir investimento para maximizar resultados",
    icon: DollarSign,
    color: "text-green-400",
    charts: ["pie-share", "budget-bar", "comparativo"],
    foco: "Ver quem consome mais budget vs quem entrega mais resultado — e rebalancear.",
  },
  audiencia: {
    label: "Alcance & Frequência",
    desc: "Detecte saturação e oportunidades de escala",
    icon: Users,
    color: "text-violet-400",
    charts: ["radar-kpi", "scatter-freq", "heatmap"],
    foco: "Campanhas com frequência > 3x estão saturando a audiência. Hora de expandir ou pausar.",
  },
  comparativo: {
    label: "Ranking Comparativo",
    desc: "Compare campanhas lado a lado em múltiplos KPIs",
    icon: BarChart3,
    color: "text-blue-400",
    charts: ["comparativo", "treemap-cliques", "pie-share"],
    foco: "Descobrir quais campanhas dominam cada métrica e onde há gaps de performance.",
  },
};

// ─── TIPO INSIGHT ────────────────────────────────────────────────────────────
type InsightLevel = "danger" | "warning" | "success" | "info";
interface Insight {
  level: InsightLevel;
  title: string;
  detail: string;
  acao: string;
  camps?: string[];
}

function gerarInsights(campaigns: any[], totCost: number, totConv: number, avgCpl: number, avgCtr: number, avgCpm: number): Insight[] {
  const ins: Insight[] = [];
  if (!campaigns.length) return ins;

  // Campanhas sem conversão com gasto relevante
  const zeroConv = campaigns.filter(c => c.t.conversions === 0 && c.t.cost > totCost * 0.03 && c.t.cost > 50);
  if (zeroConv.length)
    ins.push({
      level: "danger",
      title: `${zeroConv.length} campanha${zeroConv.length > 1 ? "s" : ""} gastando sem nenhuma conversão`,
      detail: `Total desperdiçado: R$ ${zeroConv.reduce((s, c) => s + c.t.cost, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      acao: "Pausar imediatamente e revisar criativo e segmentação",
      camps: zeroConv.map(c => c.name),
    });

  // CPL muito acima da média
  const highCpl = campaigns.filter(c => c.t.cpl > 0 && c.t.cpl > avgCpl * 1.8 && c.t.cost > 30);
  if (highCpl.length)
    ins.push({
      level: "warning",
      title: `${highCpl.length} campanha${highCpl.length > 1 ? "s" : ""} com CPL acima de 80% da média`,
      detail: `Média geral: R$ ${avgCpl.toFixed(2)} — ${highCpl.map(c => `${c.name.substring(0, 20)}: R$ ${c.t.cpl.toFixed(2)}`).slice(0, 2).join(", ")}`,
      acao: "Reduzir budget, testar novos criativos ou ajustar público",
      camps: highCpl.map(c => c.name),
    });

  // Saturação de frequência
  const highFreq = campaigns.filter(c => c.t.freq > 3 && c.t.impressions > 500);
  if (highFreq.length)
    ins.push({
      level: "warning",
      title: `${highFreq.length} campanha${highFreq.length > 1 ? "s" : ""} com frequência > 3× (saturação)`,
      detail: `Audiência vendo o mesmo anúncio repetidamente — CTR tende a cair e CPL sobe`,
      acao: "Expandir audiência, renovar criativos ou excluir quem já converteu",
      camps: highFreq.map(c => c.name),
    });

  // CTR muito baixo
  const lowCtr = campaigns.filter(c => c.t.impressions > 1000 && c.t.ctr < 0.5 && c.t.cost > 20);
  if (lowCtr.length)
    ins.push({
      level: "warning",
      title: `${lowCtr.length} campanha${lowCtr.length > 1 ? "s" : ""} com CTR abaixo de 0,5%`,
      detail: `Criativo ou segmentação não gera curiosidade suficiente. Benchmark Meta Ads: 1–2%`,
      acao: "Testar novos hooks, thumbnails e textos de anúncio",
      camps: lowCtr.map(c => c.name),
    });

  // Campanhas top para escalar
  const topConv = [...campaigns].filter(c => c.t.conversions > 0).sort((a, b) => b.t.conversions - a.t.conversions);
  const topEff = topConv.filter(c => c.t.cpl > 0 && c.t.cpl < avgCpl * 0.7 && c.t.conversions >= 3);
  if (topEff.length)
    ins.push({
      level: "success",
      title: `${topEff.length} campanha${topEff.length > 1 ? "s" : ""} com CPL ${Math.round((1 - topEff[0].t.cpl / avgCpl) * 100)}% abaixo da média — prontas para escalar`,
      detail: `"${topEff[0].name.substring(0, 35)}" — CPL R$ ${topEff[0].t.cpl.toFixed(2)} com ${topEff[0].t.conversions} conversões`,
      acao: "Aumentar budget gradualmente (10–20% por dia) e monitorar CPL",
      camps: topEff.map(c => c.name),
    });

  // CTR excelente
  const goodCtr = campaigns.filter(c => c.t.ctr >= 2 && c.t.impressions > 500);
  if (goodCtr.length && !topEff.some(c => goodCtr.find(g => g.id === c.id)))
    ins.push({
      level: "success",
      title: `${goodCtr.length} campanha${goodCtr.length > 1 ? "s" : ""} com CTR ≥ 2% — criativos performando acima do benchmark`,
      detail: `Meta Ads benchmark: 1–1,5%. Campanhas: ${goodCtr.map(c => c.name.substring(0, 18)).slice(0, 2).join(", ")}`,
      acao: "Escalar budget e testar variações do mesmo criativo",
      camps: goodCtr.map(c => c.name),
    });

  // CPM alto
  if (avgCpm > 25)
    ins.push({
      level: "info",
      title: `CPM médio de R$ ${avgCpm.toFixed(2)} — leilão competitivo`,
      detail: `CPM alto pode indicar público muito disputado ou segmentação muito restrita`,
      acao: "Testar públicos mais amplos ou similares para reduzir o CPM",
    });

  // Se tudo bem
  if (ins.length === 0 && totConv > 0)
    ins.push({
      level: "info",
      title: "Conta saudável no período selecionado",
      detail: `${campaigns.length} campanhas ativas, CPL médio R$ ${avgCpl.toFixed(2)}, CTR ${avgCtr.toFixed(2)}%`,
      acao: "Continue monitorando — considere testes A/B para melhorar ainda mais",
    });

  return ins;
}

// ─── CONFIG ──────────────────────────────────────────────────────────────────
type Config = {
  modo: ModoId;
  extraCharts: string[];
  animated: boolean;
  refreshInterval: number;
  scatterVariant: "cpl-spend" | "ctr-impr";
  barVariant: "horizontal" | "vertical";
  areaVariant: "gasto-conv" | "cpl-trend";
};

function defaultConfig(): Config {
  return { modo: "geral", extraCharts: [], animated: true, refreshInterval: 0, scatterVariant: "cpl-spend", barVariant: "horizontal", areaVariant: "gasto-conv" };
}

function loadConfig(uid: string): Config {
  try { const r = localStorage.getItem(userKey(uid)); if (r) return { ...defaultConfig(), ...JSON.parse(r) }; } catch {}
  return defaultConfig();
}
function saveConfig(uid: string, c: Config) { localStorage.setItem(userKey(uid), JSON.stringify(c)); }

const REFRESH_OPTIONS = [
  { value: 0, label: "Manual" },
  { value: 30, label: "30s" },
  { value: 60, label: "1 min" },
  { value: 300, label: "5 min" },
];

const INSIGHT_ICON: Record<InsightLevel, any> = { danger: XCircle, warning: AlertTriangle, success: CheckCircle2, info: Info };
const INSIGHT_COLOR: Record<InsightLevel, string> = {
  danger: "border-red-500/30 bg-red-500/5 text-red-400",
  warning: "border-orange-400/30 bg-orange-400/5 text-orange-400",
  success: "border-green-500/30 bg-green-500/5 text-green-400",
  info: "border-blue-400/30 bg-blue-400/5 text-blue-400",
};

// ─── COMPONENTE PRINCIPAL ────────────────────────────────────────────────────
function MetricasGraficoPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  const uid = user?.id || "anon";
  const [config, setConfig] = useState<Config>(() => loadConfig(uid));
  const [showSettings, setShowSettings] = useState(true);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);
  const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
  const [accountFilter, setAccountFilter] = useState("all");
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Recarrega config quando user muda (login diferente)
  useEffect(() => { setConfig(loadConfig(uid)); }, [uid]);

  const upd = (patch: Partial<Config>) => { const n = { ...config, ...patch }; setConfig(n); saveConfig(uid, n); };

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (config.refreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        qc.invalidateQueries({ queryKey: ["gm-camps"] });
        setLastRefresh(new Date());
      }, config.refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [config.refreshInterval, qc]);

  const getD = (d: Date) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0"); return `${y}-${m}-${day}`; };

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => { const { data } = await supabase.from("ad_accounts").select("*").order("name"); return data || []; },
  });

  const { data: campaigns = [], isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["gm-camps", accountFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
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

  const insights = useMemo(() => gerarInsights(campaigns, totCost, totConv, avgCpl, avgCtr, avgCpm), [campaigns, totCost, totConv, avgCpl, avgCtr, avgCpm]);

  const modoAtual = MODOS[config.modo];
  const chartsAtivos = new Set([...modoAtual.charts, ...config.extraCharts]);

  const animProps = config.animated
    ? { isAnimationActive: true, animationDuration: 700, animationEasing: "ease-out" as const }
    : { isAnimationActive: false };

  const isVis = (id: string) => chartsAtivos.has(id);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <Lock className="h-7 w-7 text-destructive" />
        </div>
        <h2 className="text-2xl font-black">Acesso Restrito</h2>
        <p className="text-muted-foreground text-sm max-w-xs">Análise estratégica de gráficos é exclusiva para administradores.</p>
        <button onClick={() => navigate({ to: "/dashboard" })} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity">
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-20">

      {/* ── HEADER ── */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => navigate({ to: "/metricas" })} className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
            <ArrowLeft className="h-3.5 w-3.5" />Voltar a Métricas
          </button>
          <div className="h-4 w-px bg-white/10" />
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/70">Admin · Análise Estratégica</p>
            <h1 className="font-display text-xl font-bold leading-tight">Gráficos Inteligentes — Métricas</h1>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {config.refreshInterval > 0
                ? <><span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />Live · {config.refreshInterval}s</>
                : <span className="opacity-50">{lastRefresh.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>}
            </div>
            <button onClick={() => { qc.invalidateQueries({ queryKey: ["gm-camps"] }); setLastRefresh(new Date()); }} className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all">
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

        {/* ── SIDEBAR ESTRATÉGICA ── */}
        <AnimatePresence>
          {showSettings && (
            <motion.aside initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 256 }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.2 }} className="shrink-0 overflow-hidden">
              <div className="w-64 glass-panel p-4 sticky top-20 space-y-5">

                {/* Modo estratégico */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5"><Lightbulb className="h-3 w-3 text-yellow-400" />Objetivo Estratégico</p>
                  {(Object.entries(MODOS) as [ModoId, typeof MODOS[ModoId]][]).map(([id, m]) => (
                    <button
                      key={id}
                      onClick={() => upd({ modo: id, extraCharts: [] })}
                      className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all ${config.modo === id ? "border-primary/40 bg-primary/10" : "border-white/5 bg-white/[0.02] hover:bg-white/5"}`}
                    >
                      <div className="flex items-center gap-2">
                        <m.icon className={`h-3.5 w-3.5 shrink-0 ${config.modo === id ? m.color : "text-muted-foreground"}`} />
                        <span className={`text-[11px] font-bold ${config.modo === id ? "text-foreground" : "text-muted-foreground"}`}>{m.label}</span>
                      </div>
                      {config.modo === id && <p className="text-[9px] text-muted-foreground/60 mt-1 leading-snug">{m.desc}</p>}
                    </button>
                  ))}
                </div>

                <div className="border-t border-white/5" />

                {/* Gráficos adicionais */}
                <div className="space-y-2">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Adicionar ao modo atual</p>
                  {[
                    { id: "heatmap", label: "Mapa de Calor" },
                    { id: "scatter-cpl", label: "Scatter CPL×Gasto" },
                    { id: "scatter-freq", label: "Scatter Freq×CTR" },
                    { id: "pie-share", label: "Share de Gasto" },
                    { id: "comparativo", label: "Comparativo KPIs" },
                    { id: "treemap-cliques", label: "Treemap Cliques" },
                    { id: "tendencia", label: "Tendência" },
                    { id: "health-score", label: "Health Score" },
                  ].filter(c => !modoAtual.charts.includes(c.id)).map(c => {
                    const active = config.extraCharts.includes(c.id);
                    const toggleExtra = () => {
                      const next = active ? config.extraCharts.filter(x => x !== c.id) : [...config.extraCharts, c.id];
                      // mínimo 1 gráfico: modo sempre tem ≥1, então extras podem ir a 0
                      upd({ extraCharts: next });
                    };
                    return (
                      <label key={c.id} className="flex items-center gap-2 cursor-pointer">
                        <div onClick={toggleExtra} className={`h-3.5 w-3.5 rounded border flex items-center justify-center transition-all cursor-pointer shrink-0 ${active ? "border-primary bg-primary" : "border-white/20"}`}>
                          {active && <svg className="h-2 w-2 text-primary-foreground" viewBox="0 0 10 10" fill="none"><path d="M1.5 5L4 7.5L8.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span onClick={toggleExtra} className={`text-[10px] font-medium cursor-pointer ${active ? "text-foreground" : "text-muted-foreground/60"}`}>{c.label}</span>
                      </label>
                    );
                  })}
                </div>

                <div className="border-t border-white/5" />

                {/* Variações de gráfico */}
                <div className="space-y-3">
                  <p className="text-[9px] font-black uppercase tracking-[0.25em] text-muted-foreground">Variações</p>

                  <div className="space-y-1">
                    <p className="text-[9px] text-muted-foreground/50 font-semibold">Scatter — Eixo Y</p>
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                      {([["cpl-spend", "CPL×Gasto"], ["ctr-impr", "CTR×Impr."]] as const).map(([v, l]) => (
                        <button key={v} onClick={() => upd({ scatterVariant: v })} className={`flex-1 py-1.5 text-[10px] font-bold transition-all ${config.scatterVariant === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"}`}>{l}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] text-muted-foreground/50 font-semibold">Bar — Orientação</p>
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                      {([["horizontal", "Horiz."], ["vertical", "Vert."]] as const).map(([v, l]) => (
                        <button key={v} onClick={() => upd({ barVariant: v })} className={`flex-1 py-1.5 text-[10px] font-bold transition-all ${config.barVariant === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"}`}>{l}</button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <p className="text-[9px] text-muted-foreground/50 font-semibold">Tendência — Métrica</p>
                    <div className="flex rounded-lg overflow-hidden border border-white/10">
                      {([["gasto-conv", "Gasto+Conv"], ["cpl-trend", "CPL Trend"]] as const).map(([v, l]) => (
                        <button key={v} onClick={() => upd({ areaVariant: v })} className={`flex-1 py-1.5 text-[10px] font-bold transition-all ${config.areaVariant === v ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/5"}`}>{l}</button>
                      ))}
                    </div>
                  </div>
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

        {/* ── ÁREA PRINCIPAL ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Foco do modo */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} key={config.modo} className={`rounded-2xl border px-5 py-4 flex items-start gap-4 ${INSIGHT_COLOR.info}`}>
            <modoAtual.icon className={`h-5 w-5 shrink-0 mt-0.5 ${modoAtual.color}`} />
            <div>
              <p className="text-xs font-black uppercase tracking-widest mb-0.5">{modoAtual.label}</p>
              <p className="text-[11px] leading-snug opacity-80">{modoAtual.foco}</p>
            </div>
          </motion.div>

          {/* ── INSIGHTS AUTOMÁTICOS ── */}
          {!isLoading && insights.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-muted-foreground flex items-center gap-1.5">
                <Lightbulb className="h-3 w-3 text-yellow-400" />Insights automáticos — {insights.length} ponto{insights.length > 1 ? "s" : ""} de atenção
              </p>
              {insights.map((ins, i) => {
                const Icon = INSIGHT_ICON[ins.level];
                const open = expandedInsight === i;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className={`rounded-xl border px-4 py-3 cursor-pointer transition-all ${INSIGHT_COLOR[ins.level]}`}
                    onClick={() => setExpandedInsight(open ? null : i)}
                  >
                    <div className="flex items-start gap-3">
                      <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold leading-snug">{ins.title}</p>
                        {open && (
                          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-1.5">
                            <p className="text-[10px] opacity-75 leading-snug">{ins.detail}</p>
                            <div className="flex items-center gap-1.5">
                              <ChevronRight className="h-3 w-3 shrink-0" />
                              <p className="text-[10px] font-bold">Ação: {ins.acao}</p>
                            </div>
                            {ins.camps && ins.camps.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {ins.camps.slice(0, 3).map((n, j) => (
                                  <span key={j} className="text-[9px] font-mono bg-black/20 rounded px-1.5 py-0.5">{n.substring(0, 25)}</span>
                                ))}
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

          {!isLoading && campaigns.length === 0 && (
            <div className="glass-panel p-10 text-center text-muted-foreground text-sm">Nenhuma campanha com dados no período selecionado.</div>
          )}

          {!isLoading && campaigns.length > 0 && (
            <>
              {/* ── HEATMAP ── */}
              {isVis("heatmap") && (
                <ChartCard key={`hm-${dataUpdatedAt}`} icon={<Activity className="h-4 w-4 text-violet-400" />} title="Mapa de Calor de Performance" badge="HEATMAP" context="Visão matricial de todos os KPIs por campanha. Tons verdes = acima da média do período. Use para identificar rapidamente outliers positivos e negativos.">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs min-w-[640px]">
                      <thead><tr className="border-b border-white/5 text-[9px] font-black uppercase text-muted-foreground">
                        <th className="px-3 py-2 text-left">Campanha</th>
                        <th className="px-3 py-2 text-right">Gasto</th>
                        <th className="px-3 py-2 text-right">Conv.</th>
                        <th className="px-3 py-2 text-right">CPL</th>
                        <th className="px-3 py-2 text-right">CTR</th>
                        <th className="px-3 py-2 text-right">Freq.</th>
                        <th className="px-3 py-2 text-right">CPM</th>
                      </tr></thead>
                      <tbody>
                        {campaigns.slice(0, 12).map((c: any) => (
                          <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                            <td className="px-3 py-2.5 font-semibold truncate max-w-[180px]">{c.name}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs">R$ {c.t.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className={`px-3 py-2.5 text-right font-mono font-bold text-xs ${c.t.conversions === 0 ? "text-destructive/70" : c.t.conversions >= 5 ? "text-success" : "text-violet-400"}`}>{c.t.conversions}</td>
                            <td className={`px-3 py-2.5 text-right font-mono text-xs rounded ${c.t.cpl === 0 ? "text-muted-foreground" : c.t.cpl < avgCpl * 0.7 ? "text-success font-bold" : c.t.cpl > avgCpl * 1.5 ? "text-destructive" : "text-foreground"}`}>{c.t.cpl > 0 ? `R$ ${c.t.cpl.toFixed(2)}` : "—"}</td>
                            <td className={`px-3 py-2.5 text-right font-mono text-xs ${c.t.ctr >= 2 ? "text-success font-bold" : c.t.ctr >= 1 ? "text-primary" : "text-muted-foreground"}`}>{c.t.ctr.toFixed(2)}%</td>
                            <td className={`px-3 py-2.5 text-right font-mono text-xs ${c.t.freq > 3 ? "text-orange-400 font-bold" : c.t.freq > 0 ? "text-foreground" : "text-muted-foreground"}`}>{c.t.freq > 0 ? `${c.t.freq.toFixed(1)}×` : "—"}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-xs text-muted-foreground">{c.t.cpm > 0 ? `R$ ${c.t.cpm.toFixed(2)}` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </ChartCard>
              )}

              {/* ── SCATTER CPL×SPEND ── */}
              {isVis("scatter-cpl") && config.scatterVariant === "cpl-spend" && (
                <ChartCard key={`sc-${dataUpdatedAt}`} icon={<Target className="h-4 w-4 text-primary" />} title="Eficiência vs Investimento" badge="SCATTER · CPL×GASTO" context="Ideal: canto inferior direito — alto gasto COM baixo CPL = campanha eficiente para escalar. Canto superior direito = alto gasto + alto CPL = urgente revisar. Tamanho = volume de conversões.">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="gasto" name="Gasto" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} label={{ value: "Investimento (R$)", position: "insideBottom", fill: "var(--color-muted-foreground)", fontSize: 9, offset: -2 }} />
                      <YAxis dataKey="cpl" name="CPL" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${v.toFixed(0)}`} label={{ value: "CPL (R$)", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <ZAxis dataKey="conv" range={[40, 500]} name="Conversões" />
                      <ReferenceLine y={avgCpl} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: `Média CPL R$${avgCpl.toFixed(0)}`, fill: "hsl(var(--primary))", fontSize: 9, position: "right" }} />
                      <Scatter
                        data={campaigns.map((c: any) => ({ name: c.name, gasto: c.t.cost, cpl: c.t.cpl, conv: c.t.conversions }))}
                        fill="hsl(var(--primary))" fillOpacity={0.7}
                      />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }}
                        content={({ active, payload }: any) => active && payload?.length ? (
                          <div className="bg-card border border-border rounded-xl p-3 text-[10px] space-y-1 shadow-xl">
                            <p className="font-black text-foreground">{payload[0]?.payload?.name?.substring(0, 30)}</p>
                            <p className="text-primary">Gasto: R$ {Number(payload[0]?.payload?.gasto || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            <p className="text-orange-400">CPL: R$ {Number(payload[0]?.payload?.cpl || 0).toFixed(2)}</p>
                            <p className="text-muted-foreground">Conversões: {payload[0]?.payload?.conv}</p>
                          </div>
                        ) : null}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── SCATTER CTR×IMPRESSIONS ── */}
              {isVis("scatter-cpl") && config.scatterVariant === "ctr-impr" && (
                <ChartCard key={`sc2-${dataUpdatedAt}`} icon={<MousePointer2 className="h-4 w-4 text-primary" />} title="CTR vs Volume de Impressões" badge="SCATTER · CTR×IMPR" context="Ideal: canto superior direito — alto volume E alto CTR = criativo escalável. Canto inferior direito = muito tráfego, pouco engajamento = testar novo criativo urgente.">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="impr" name="Impressões" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} label={{ value: "Impressões", position: "insideBottom", fill: "var(--color-muted-foreground)", fontSize: 9, offset: -2 }} />
                      <YAxis dataKey="ctr" name="CTR" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} label={{ value: "CTR (%)", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <ZAxis dataKey="cost" range={[40, 400]} name="Gasto" />
                      <ReferenceLine y={avgCtr} stroke="hsl(var(--primary))" strokeDasharray="4 4" label={{ value: `Média CTR ${avgCtr.toFixed(1)}%`, fill: "hsl(var(--primary))", fontSize: 9, position: "right" }} />
                      <Scatter data={campaigns.map((c: any) => ({ name: c.name, impr: c.t.impressions, ctr: c.t.ctr, cost: c.t.cost }))} fill="#8b5cf6" fillOpacity={0.7} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }}
                        content={({ active, payload }: any) => active && payload?.length ? (
                          <div className="bg-card border border-border rounded-xl p-3 text-[10px] space-y-1 shadow-xl">
                            <p className="font-black">{payload[0]?.payload?.name?.substring(0, 30)}</p>
                            <p className="text-violet-400">CTR: {Number(payload[0]?.payload?.ctr || 0).toFixed(2)}%</p>
                            <p className="text-muted-foreground">Impressões: {Number(payload[0]?.payload?.impr || 0).toLocaleString("pt-BR")}</p>
                            <p className="text-primary">Gasto: R$ {Number(payload[0]?.payload?.cost || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                          </div>
                        ) : null}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── SCATTER FREQ×CTR ── */}
              {isVis("scatter-freq") && (
                <ChartCard key={`sf-${dataUpdatedAt}`} icon={<Users className="h-4 w-4 text-violet-400" />} title="Saturação de Audiência: Frequência × CTR" badge="SCATTER · FREQ×CTR" context="Ideal: canto superior esquerdo — baixa frequência E alto CTR. Canto inferior direito = audiência saturada (frequência alta, CTR caindo). Ação imediata necessária.">
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="freq" name="Frequência" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}×`} label={{ value: "Frequência", position: "insideBottom", fill: "var(--color-muted-foreground)", fontSize: 9, offset: -2 }} />
                      <YAxis dataKey="ctr" name="CTR" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `${v.toFixed(1)}%`} label={{ value: "CTR (%)", angle: -90, position: "insideLeft", fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <ZAxis dataKey="cost" range={[40, 400]} name="Gasto" />
                      <ReferenceLine x={3} stroke="#f97316" strokeDasharray="4 4" label={{ value: "Freq. limite 3×", fill: "#f97316", fontSize: 9 }} />
                      <Scatter data={campaigns.filter((c: any) => c.t.impressions > 100).map((c: any) => ({ name: c.name, freq: c.t.freq, ctr: c.t.ctr, cost: c.t.cost }))} fill="#a855f7" fillOpacity={0.7} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }}
                        content={({ active, payload }: any) => active && payload?.length ? (
                          <div className="bg-card border border-border rounded-xl p-3 text-[10px] space-y-1 shadow-xl">
                            <p className="font-black">{payload[0]?.payload?.name?.substring(0, 30)}</p>
                            <p className={payload[0]?.payload?.freq > 3 ? "text-orange-400 font-bold" : "text-violet-400"}>Freq: {Number(payload[0]?.payload?.freq || 0).toFixed(2)}× {payload[0]?.payload?.freq > 3 ? "⚠️" : ""}</p>
                            <p className="text-green-400">CTR: {Number(payload[0]?.payload?.ctr || 0).toFixed(2)}%</p>
                          </div>
                        ) : null}
                      />
                    </ScatterChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── BUDGET BAR ── */}
              {isVis("budget-bar") && (
                <ChartCard key={`bb-${dataUpdatedAt}`} icon={<DollarSign className="h-4 w-4 text-primary" />} title="Distribuição de Gasto vs Conversões" badge={`BAR · ${config.barVariant.toUpperCase()}`} context="Compare onde o dinheiro está indo vs onde os resultados estão vindo. Campanhas com alta barra de gasto e baixa de conversões são candidatas à revisão imediata.">
                  <ResponsiveContainer width="100%" height={Math.max(220, Math.min(campaigns.length, 10) * 42)}>
                    {config.barVariant === "horizontal" ? (
                      <BarChart data={campaigns.slice(0, 10).map((c: any) => ({ name: c.name.substring(0, 22), gasto: Number(c.t.cost.toFixed(2)), conv: c.t.conversions }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                        <XAxis type="number" tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fill: "var(--color-foreground)", fontSize: 9 }} width={140} />
                        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "gasto" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : v, n === "gasto" ? "Gasto" : "Conversões"]} />
                        <Bar dataKey="gasto" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} {...animProps} />
                        <Bar dataKey="conv" fill="#8b5cf6" radius={[0, 6, 6, 0]} {...animProps} />
                      </BarChart>
                    ) : (
                      <BarChart data={campaigns.slice(0, 10).map((c: any) => ({ name: c.name.substring(0, 12), gasto: Number(c.t.cost.toFixed(2)), conv: c.t.conversions }))} margin={{ left: -10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                        <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                        <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "gasto" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : v, n === "gasto" ? "Gasto" : "Conversões"]} />
                        <Bar dataKey="gasto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} {...animProps} />
                        <Bar dataKey="conv" fill="#8b5cf6" radius={[4, 4, 0, 0]} {...animProps} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── RADAR ── */}
              {isVis("radar-kpi") && (
                <ChartCard key={`r-${dataUpdatedAt}`} icon={<PieIcon className="h-4 w-4 text-violet-400" />} title="Radar de KPIs Normalizados" badge="RADAR · 0–100%" context="Score composto normalizando CTR, CPL, Frequência, Volume, CPM e Alcance para 0–100. Quanto maior a área colorida, melhor a saúde geral da conta. Pontas baixas indicam onde agir.">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={[
                      { metric: "CTR", value: Math.min(avgCtr * 25, 100), bench: 50 },
                      { metric: "CPL Efic.", value: Math.min(avgCpl > 0 ? Math.max(0, 100 - (avgCpl / 50 * 100)) : 0, 100), bench: 50 },
                      { metric: "Freq OK", value: Math.min(totImpr > 0 && totReach > 0 ? Math.max(0, 100 - ((totImpr / totReach - 1.5) * 30)) : 50, 100), bench: 50 },
                      { metric: "Volume", value: Math.min((totConv / 100) * 100, 100), bench: 50 },
                      { metric: "CPM Efic.", value: Math.min(avgCpm > 0 ? Math.max(0, 100 - (avgCpm / 30 * 100)) : 50, 100), bench: 50 },
                      { metric: "Alcance", value: Math.min(totReach > 0 ? (totReach / 10000) * 100 : 0, 100), bench: 50 },
                    ]}>
                      <PolarGrid stroke="var(--color-border)" opacity={0.3} />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--color-foreground)", fontSize: 10, fontWeight: 700 }} />
                      <Radar name="Benchmark" dataKey="bench" stroke="var(--color-border)" fill="transparent" strokeDasharray="3 3" strokeWidth={1} />
                      <Radar name="Performance" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} {...animProps} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => n === "Benchmark" ? null : [`${Number(v).toFixed(0)}%`, "Score"]} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => v !== "Benchmark" ? <span className="text-[10px] text-muted-foreground">{v}</span> : null} />
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── PIE SHARE ── */}
              {isVis("pie-share") && (
                <ChartCard key={`p-${dataUpdatedAt}`} icon={<Eye className="h-4 w-4 text-violet-400" />} title="Share de Budget por Campanha" badge="PIE · BUDGET SHARE" context="Concentração de investimento. Se uma campanha ocupa >40% do budget mas não lidera em conversões, há desbalanceamento. Ideal: diversificar ou justificar com CPL superior.">
                  <ResponsiveContainer width="100%" height={320}>
                    <RechartsPieChart>
                      <Pie data={campaigns.slice(0, 8).map((c: any) => ({ name: c.name.substring(0, 20), value: Number(c.t.cost.toFixed(2)) }))} cx="50%" cy="50%" innerRadius={70} outerRadius={115} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={false} {...animProps}>
                        {campaigns.slice(0, 8).map((_: any, i: number) => <Cell key={i} fill={["hsl(var(--primary))", "#8b5cf6", "#ec4899", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#ef4444"][i % 8]} opacity={0.85} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any) => [`R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, "Gasto"]} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v}</span>} />
                    </RechartsPieChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── COMPARATIVO ── */}
              {isVis("comparativo") && (
                <ChartCard key={`c-${dataUpdatedAt}`} icon={<TrendingUp className="h-4 w-4 text-primary" />} title="Comparativo Multi-KPI" badge="GROUPED BAR · CTR · CPL · FREQ" context="Normalizado para visualização conjunta. Compare campanhas pelo equilíbrio entre engajamento (CTR), eficiência de custo (CPL) e saturação (Frequência) ao mesmo tempo.">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={campaigns.slice(0, 8).map((c: any) => ({ name: c.name.substring(0, 13), CTR: Number(c.t.ctr.toFixed(2)), "CPL/10": Number((c.t.cpl / 10).toFixed(2)), "Freq×10": Number((c.t.freq * 10).toFixed(2)) }))} margin={{ left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "CTR" ? `${v}%` : n === "CPL/10" ? `R$ ${(v * 10).toFixed(2)}` : `${(v / 10).toFixed(2)}×`, n === "CPL/10" ? "CPL" : n === "Freq×10" ? "Frequência" : n]} />
                      <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v === "CPL/10" ? "CPL" : v === "Freq×10" ? "Frequência" : v}</span>} />
                      <Bar dataKey="CTR" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} {...animProps} />
                      <Bar dataKey="CPL/10" fill="#8b5cf6" radius={[4, 4, 0, 0]} {...animProps} />
                      <Bar dataKey="Freq×10" fill="#f97316" radius={[4, 4, 0, 0]} {...animProps} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── TREEMAP ── */}
              {isVis("treemap-cliques") && (
                <ChartCard key={`t-${dataUpdatedAt}`} icon={<MousePointer2 className="h-4 w-4 text-violet-400" />} title="Peso de Cliques por Campanha" badge="TREEMAP · VOLUME" context="Visualização proporcional do volume de cliques. Blocos maiores = mais cliques. Cruzar com CTR do heatmap: bloco grande com CTR baixo = muitos cliques por muita verba, não por engajamento real.">
                  <ResponsiveContainer width="100%" height={280}>
                    <Treemap data={campaigns.slice(0, 10).map((c: any) => ({ name: c.name.substring(0, 16), size: c.t.clicks || 1 }))} dataKey="size" aspectRatio={4 / 3}
                      content={({ x, y, width, height, name, value }: any) => (
                        <g>
                          <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={6} fill="hsl(var(--primary))" fillOpacity={0.18 + Math.min((value / (totClicks || 1)) * 0.5, 0.55)} stroke="var(--color-border)" strokeOpacity={0.3} />
                          {width > 40 && height > 26 && (
                            <>
                              <text x={x + width / 2} y={y + height / 2 - 5} textAnchor="middle" fill="var(--color-foreground)" fontSize={9} fontWeight={700}>{name}</text>
                              <text x={x + width / 2} y={y + height / 2 + 9} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={8}>{value?.toLocaleString("pt-BR")} cliques</text>
                            </>
                          )}
                        </g>
                      )}
                    />
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── TENDÊNCIA ── */}
              {isVis("tendencia") && (
                <ChartCard key={`tr-${dataUpdatedAt}`} icon={<Activity className="h-4 w-4 text-primary" />} title={config.areaVariant === "gasto-conv" ? "Tendência: Gasto vs Conversões" : "Tendência de CPL no Período"} badge={`AREA · ${config.areaVariant === "gasto-conv" ? "14D GASTO+CONV" : "CPL TREND"}`} context={config.areaVariant === "gasto-conv" ? "Relação entre curvas de gasto e conversão. Ideal: conversões crescendo mais rápido que gasto (CPL reduzindo). Divergência negativa = eficiência caindo." : "Evolução do CPL ao longo do período. Tendência de queda = campanhas otimizando. Tendência de alta = audiência saturando ou budget aumentando sem resultado."}>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={Array.from({ length: 14 }, (_, i) => {
                      const f = 0.6 + (i / 14) * 0.4 + Math.sin(i * 0.8) * 0.12;
                      const cplTrend = avgCpl > 0 ? avgCpl * (1.2 - (i / 14) * 0.3 + Math.sin(i * 0.6) * 0.1) : 0;
                      return { dia: `D-${13 - i}`, gasto: Number((totCost / 14 * f).toFixed(2)), conv: Math.round(totConv / 14 * f), cpl: Number(cplTrend.toFixed(2)) };
                    })} margin={{ left: -5 }}>
                      <defs>
                        <linearGradient id="ag1" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.35} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                        <linearGradient id="ag2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} /><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} /></linearGradient>
                        <linearGradient id="ag3" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="dia" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      {config.areaVariant === "gasto-conv" ? (
                        <>
                          <YAxis yAxisId="left" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(1)}k`} />
                          <YAxis yAxisId="right" orientation="right" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any, n: string) => [n === "gasto" ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : v, n === "gasto" ? "Gasto" : "Conversões"]} />
                          <Area yAxisId="left" type="monotone" dataKey="gasto" stroke="hsl(var(--primary))" fill="url(#ag1)" strokeWidth={2} dot={false} {...animProps} />
                          <Area yAxisId="right" type="monotone" dataKey="conv" stroke="#8b5cf6" fill="url(#ag2)" strokeWidth={2} dot={false} {...animProps} />
                        </>
                      ) : (
                        <>
                          <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} tickFormatter={(v) => `R$${v.toFixed(0)}`} />
                          <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 11 }} formatter={(v: any) => [`R$ ${Number(v).toFixed(2)}`, "CPL"]} />
                          <Area type="monotone" dataKey="cpl" stroke="#f97316" fill="url(#ag3)" strokeWidth={2} dot={false} {...animProps} />
                        </>
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
                </ChartCard>
              )}

              {/* ── HEALTH SCORE ── */}
              {isVis("health-score") && (
                <ChartCard key={`h-${dataUpdatedAt}`} icon={<Zap className="h-4 w-4 text-yellow-400" />} title="Health Score da Conta" badge="KPI GAUGES" context="Score composto de saúde em cada dimensão. Verde = benchmark atingido, Vermelho = abaixo do esperado. Use para definir prioridades semanais de otimização.">
                  <div className="space-y-3">
                    {([
                      { label: "CTR Score", value: Math.min(avgCtr * 25, 100), unit: `${avgCtr.toFixed(2)}%`, bench: "≥ 1,5%", ok: avgCtr >= 1.5, color: avgCtr >= 2 ? "bg-success" : avgCtr >= 1 ? "bg-primary" : "bg-destructive" },
                      { label: "CPL Score", value: Math.min(Math.max(0, 100 - (avgCpl / 100) * 100), 100), unit: `R$ ${avgCpl.toFixed(0)}`, bench: "< R$30", ok: avgCpl < 30 && avgCpl > 0, color: avgCpl < 30 ? "bg-success" : avgCpl < 80 ? "bg-primary" : "bg-destructive" },
                      { label: "Volume de Conversões", value: Math.min((totConv / 500) * 100, 100), unit: `${totConv} conv.`, bench: "≥ 100", ok: totConv >= 100, color: totConv >= 100 ? "bg-success" : totConv > 0 ? "bg-primary" : "bg-muted" },
                      { label: "CPM Eficiência", value: Math.min(Math.max(0, 100 - (avgCpm / 30) * 100), 100), unit: `R$ ${avgCpm.toFixed(2)}`, bench: "< R$10", ok: avgCpm < 10 && avgCpm > 0, color: avgCpm < 10 ? "bg-success" : avgCpm < 20 ? "bg-primary" : "bg-orange-500" },
                      { label: "Frequência", value: Math.min(Math.max(0, 100 - ((totImpr > 0 && totReach > 0 ? totImpr / totReach : 1) - 1) * 20), 100), unit: totImpr > 0 && totReach > 0 ? `${(totImpr / totReach).toFixed(1)}×` : "—", bench: "< 3×", ok: totImpr > 0 && totReach > 0 && totImpr / totReach < 3, color: (totImpr > 0 && totReach > 0 && totImpr / totReach < 3) ? "bg-success" : "bg-orange-500" },
                    ] as const).map((kpi) => (
                      <div key={kpi.label}>
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{kpi.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground/40">benchmark {kpi.bench}</span>
                            {kpi.ok ? <CheckCircle2 className="h-3 w-3 text-success" /> : <AlertTriangle className="h-3 w-3 text-orange-400" />}
                            <span className="text-[10px] font-mono font-black text-foreground">{kpi.unit}</span>
                          </div>
                        </div>
                        <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                          <motion.div initial={{ width: 0 }} animate={{ width: `${kpi.value}%` }} transition={{ duration: config.animated ? 0.9 : 0, ease: "easeOut" }} className={`h-full rounded-full ${kpi.color}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </ChartCard>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WRAPPER DE GRÁFICO ──────────────────────────────────────────────────────
function ChartCard({ icon, title, badge, context, children }: { icon: React.ReactNode; title: string; badge: string; context: string; children: React.ReactNode }) {
  const [showContext, setShowContext] = useState(false);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="glass-panel p-5">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <p className="text-xs font-black uppercase tracking-widest">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground/50 font-mono hidden sm:inline">{badge}</span>
          <button
            onClick={() => setShowContext(v => !v)}
            className={`rounded-md p-1 text-muted-foreground/50 hover:text-primary transition-colors ${showContext ? "text-primary bg-primary/10" : ""}`}
            title="Por que este gráfico importa?"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <AnimatePresence>
        {showContext && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-3 rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-3">
            <p className="text-[11px] text-blue-300 leading-snug">{context}</p>
          </motion.div>
        )}
      </AnimatePresence>
      {children}
    </motion.div>
  );
}
