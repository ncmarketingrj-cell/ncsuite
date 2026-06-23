import { createFileRoute, redirect } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGlobalDate } from "@/contexts/DateContext";
import { PageHeader } from "@/components/PageHeader";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Zap, Target, DollarSign, Users,
  BarChart3, Bookmark, Trash2, ChevronDown, RotateCcw, Sparkles,
  ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";

// ─── ROUTE ──────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_app/simulador")({
  head: () => ({ meta: [{ title: "Simulador de Impacto — NC Suite" }] }),
  beforeLoad: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data: r } = await supabase.auth.refreshSession();
      session = r.session;
    }
    if (!session) throw redirect({ to: "/login" });
  },
  component: SimuladorPage,
});

// ─── ANIMATED VALUE ──────────────────────────────────────────────────────────────
function useAnimVal(target: number) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) { setVal(target); return; }
    let frame = 0;
    const total = 20;
    const id = setInterval(() => {
      frame++;
      const ease = 1 - Math.pow(1 - frame / total, 3);
      setVal(start + diff * ease);
      if (frame >= total) { setVal(target); prev.current = target; clearInterval(id); }
    }, 16);
    return () => clearInterval(id);
  }, [target]);
  return val;
}

// ─── BASELINE DATA HOOK ──────────────────────────────────────────────────────────
function useBaseline() {
  const { dateFrom, dateTo, accountId, campaignId } = useGlobalDate();

  const { data: raw, isLoading } = useQuery({
    queryKey: ["simulador-baseline", dateFrom, dateTo, accountId, campaignId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("metrics")
        .select("cost, conversions, impressions, clicks, cpm, frequency, date, campaigns!inner(daily_budget, ad_account_id)")
        .gte("date", dateFrom)
        .lte("date", dateTo);
      if (accountId !== "all") q = q.eq("campaigns.ad_account_id", accountId);
      if (campaignId !== "all") q = q.eq("campaign_id", campaignId);
      const { data } = await q;
      return (data as any[]) ?? [];
    },
  });

  return useMemo(() => {
    if (!raw?.length) return { isLoading, baseline: null };

    let cost = 0, conv = 0, impr = 0, clicks = 0;
    let cpmSum = 0, cpmN = 0, freqSum = 0, freqN = 0;
    let totalBudget = 0;
    const budgetSet = new Set<string>();

    for (const r of raw) {
      cost += r.cost ?? 0;
      conv += r.conversions ?? 0;
      impr += r.impressions ?? 0;
      clicks += r.clicks ?? 0;
      if (r.cpm) { cpmSum += r.cpm; cpmN++; }
      if (r.frequency) { freqSum += r.frequency; freqN++; }
    }

    const days = Math.max(1, Math.round((new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / 86400000) + 1);
    const dailyCost = cost / days;
    const cpl = conv > 0 ? cost / conv : 0;
    const cvr = clicks > 0 ? conv / clicks : 0;
    const ctr = impr > 0 ? clicks / impr : 0;
    const cpm = cpmN > 0 ? cpmSum / cpmN : 0;
    const freq = freqN > 0 ? freqSum / freqN : 0;

    return {
      isLoading: false,
      baseline: { cost, conv, impr, clicks, cpl, cvr, ctr, cpm, freq, dailyCost, days },
    };
  }, [raw, isLoading]);
}

// ─── PROJECTION ENGINE ───────────────────────────────────────────────────────────
interface Params {
  budgetMult: number;    // 0.5 → 3.0
  targetFreq: number;    // 1.0 → 5.0
  cpmAdjust: number;     // 0.7 → 1.5
  ctrBoost: number;      // 0.5 → 2.0
  period: 7 | 14 | 30;
}

function project(baseline: NonNullable<ReturnType<typeof useBaseline>["baseline"]>, p: Params) {
  const { dailyCost, cpm, ctr, cvr, freq } = baseline;

  const projCost = dailyCost * p.period * p.budgetMult;
  const adjCPM = cpm * p.cpmAdjust;
  const projImpr = adjCPM > 0 ? (projCost / adjCPM) * 1000 : 0;
  const adjCTR = ctr * p.ctrBoost;
  const projClicks = projImpr * adjCTR;

  // Frequency effect on CVR: lower freq → fresher audience → higher CVR
  const freqDelta = freq - p.targetFreq;
  const fatigueBoost = 1 + freqDelta * 0.12; // each unit of freq reduction = +12% CVR
  const adjCVR = Math.min(Math.max(cvr * fatigueBoost * Math.sqrt(p.ctrBoost), 0.002), 0.18);

  const projLeads = Math.round(projClicks * adjCVR);
  const projCPL = projLeads > 0 ? projCost / projLeads : 0;
  const projReach = p.targetFreq > 0 ? Math.round(projImpr / p.targetFreq) : 0;

  return { projCost, projImpr, projLeads, projCPL, projReach, adjCVR, adjCTR };
}

// ─── SLIDER ──────────────────────────────────────────────────────────────────────
function Slider({ label, value, min, max, step, onChange, format: fmt, color = "#9b87f5", hint }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; format: (v: number) => string; color?: string; hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/50">{label}</span>
        <motion.span
          key={value}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm font-black font-mono"
          style={{ color }}
        >
          {fmt(value)}
        </motion.span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full bg-white/[0.06]" />
        <div className="absolute h-1.5 rounded-full" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}60, ${color})` }} />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:shadow-lg"
          style={{ ["--tw-slider-thumb" as any]: color }}
        />
      </div>
      {hint && <p className="text-[8px] text-white/25 tracking-wide">{hint}</p>}
    </div>
  );
}

// ─── METRIC CARD ─────────────────────────────────────────────────────────────────
function MetricCard({ label, current, projected, format: fmt, inverse = false, icon: Icon, delay = 0 }: {
  label: string; current: number; projected: number; format: (v: number) => string;
  inverse?: boolean; icon: any; delay?: number;
}) {
  const animProjected = useAnimVal(projected);
  const delta = projected - current;
  const pctDelta = current > 0 ? (delta / current) * 100 : 0;
  const isGood = inverse ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(pctDelta) < 1;
  const color = isNeutral ? "#6b7280" : isGood ? "#22c55e" : "#ef4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: "spring", stiffness: 120, damping: 18 }}
      className="relative rounded-2xl border overflow-hidden"
      style={{ borderColor: `${color}20`, background: `linear-gradient(135deg, ${color}06 0%, transparent 60%)` }}
    >
      {/* Top accent */}
      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${color}50, transparent)` }} />

      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: `${color}14`, border: `1px solid ${color}25` }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          {!isNeutral && (
            <motion.div
              initial={{ scale: 0 }} animate={{ scale: 1 }}
              className="flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[9px] font-black"
              style={{ background: `${color}15`, color }}
            >
              {isGood ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
              {Math.abs(pctDelta).toFixed(1)}%
            </motion.div>
          )}
        </div>

        <p className="text-[9px] font-black uppercase tracking-[0.15em] text-white/35 mb-1">{label}</p>

        {/* Projected (big) */}
        <p className="text-xl font-black font-mono leading-none" style={{ color }}>
          {fmt(animProjected)}
        </p>

        {/* Current (small, muted) */}
        <p className="text-[9px] text-white/30 font-mono mt-1">
          atual: {fmt(current)}
        </p>
      </div>
    </motion.div>
  );
}

// ─── SCENARIO TYPE ───────────────────────────────────────────────────────────────
interface Scenario {
  id: string;
  name: string;
  params: Params;
  projLeads: number;
  projCPL: number;
  projCost: number;
  color: string;
}

const SCENARIO_COLORS = ["#9b87f5", "#00d4ff", "#f97316"];

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────────
function SimuladorPage() {
  const { baseline, isLoading } = useBaseline();

  const [params, setParams] = useState<Params>({
    budgetMult: 1.0,
    targetFreq: 2.5,
    cpmAdjust: 1.0,
    ctrBoost: 1.0,
    period: 30,
  });

  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  // Sync targetFreq default to baseline freq when data loads
  useEffect(() => {
    if (baseline?.freq && baseline.freq > 0) {
      setParams(p => ({ ...p, targetFreq: parseFloat(baseline.freq.toFixed(1)) }));
    }
  }, [baseline?.freq]);

  const proj = useMemo(() => {
    if (!baseline) return null;
    return project(baseline, params);
  }, [baseline, params]);

  const set = useCallback(<K extends keyof Params>(k: K, v: Params[K]) => {
    setParams(p => ({ ...p, [k]: v }));
  }, []);

  const reset = () => {
    setParams({ budgetMult: 1, targetFreq: baseline?.freq ?? 2.5, cpmAdjust: 1, ctrBoost: 1, period: 30 });
  };

  const saveScenario = () => {
    if (!proj || !baseline || scenarios.length >= 3) return;
    const name = scenarioName.trim() || `Cenário ${scenarios.length + 1}`;
    setScenarios(prev => [...prev, {
      id: Date.now().toString(),
      name,
      params: { ...params },
      projLeads: proj.projLeads,
      projCPL: proj.projCPL,
      projCost: proj.projCost,
      color: SCENARIO_COLORS[scenarios.length],
    }]);
    setScenarioName("");
    setShowSaveInput(false);
  };

  // Chart data: baseline vs projection
  const chartData = useMemo(() => {
    if (!baseline || !proj) return [];
    return [
      { name: "Leads", atual: baseline.conv, projetado: proj.projLeads },
      { name: "CPL (R$)", atual: Math.round(baseline.cpl), projetado: Math.round(proj.projCPL) },
      { name: "Custo (R$)", atual: Math.round(baseline.cost), projetado: Math.round(proj.projCost) },
    ];
  }, [baseline, proj]);

  const fmt = {
    brl: (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    num: (v: number) => Math.round(v).toLocaleString("pt-BR"),
    cpl: (v: number) => `R$ ${v.toFixed(2)}`,
    pct: (v: number) => `${(v * 100).toFixed(1)}%`,
    mult: (v: number) => `${v.toFixed(2)}×`,
  };

  const periodLabel = { 7: "7 dias", 14: "14 dias", 30: "30 dias" }[params.period];

  return (
    <div className="min-h-screen pb-24" style={{ background: "radial-gradient(ellipse at top, #0d0d18 0%, #030307 60%)" }}>
      {/* Grid bg */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.016) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.016) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-4 space-y-6">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <PageHeader
            eyebrow="Estratégia · Projeção"
            title="Simulador de Impacto"
            description="Ajuste variáveis e veja o impacto projetado antes de agir — baseado no histórico real de 30 dias."
            compact
          />

          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2"
          >
            <div className="rounded-xl border border-white/[0.07] bg-black/60 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/30 backdrop-blur-md">
              Baseline: últimos 30 dias
            </div>
            <button
              onClick={reset}
              className="flex items-center gap-1.5 rounded-xl border border-white/[0.07] bg-black/60 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-white/40 backdrop-blur-md hover:text-white/70 hover:border-white/20 transition-all"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </motion.div>
        </div>

        {/* ── 3-COL MAIN LAYOUT ──────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px_1fr] gap-5">

          {/* ── BASELINE ─────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f] p-5 space-y-4"
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1.5 w-6 rounded-full bg-white/20" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Baseline atual</h3>
            </div>

            {isLoading || !baseline ? (
              <div className="flex items-center gap-2 text-white/30 text-xs font-mono">
                <div className="h-3 w-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                Carregando baseline...
              </div>
            ) : (
              <div className="space-y-3">
                {[
                  { label: "Custo Total (30d)", val: fmt.brl(baseline.cost), icon: DollarSign },
                  { label: "Leads Gerados", val: fmt.num(baseline.conv), icon: Users },
                  { label: "CPL Médio", val: fmt.cpl(baseline.cpl), icon: Target },
                  { label: "CVR Médio", val: fmt.pct(baseline.cvr), icon: BarChart3 },
                  { label: "CPM Médio", val: fmt.brl(baseline.cpm), icon: Zap },
                  { label: "Frequência Média", val: `${baseline.freq.toFixed(2)}×`, icon: TrendingUp },
                  { label: "CTR Médio", val: fmt.pct(baseline.ctr), icon: Sparkles },
                  { label: "Investimento/Dia", val: fmt.brl(baseline.dailyCost), icon: DollarSign },
                ].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-white/20" />
                        <span className="text-[10px] text-white/40 uppercase tracking-widest font-bold">{item.label}</span>
                      </div>
                      <span className="text-[11px] font-black font-mono text-white/70">{item.val}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* ── CONTROLES ────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl border border-[#9b87f5]/20 bg-[#0a0a0f] p-5 space-y-5"
            style={{ boxShadow: "0 0 40px rgba(155,135,245,0.05), inset 0 1px 0 rgba(255,255,255,0.04)" }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="h-1.5 w-6 rounded-full bg-[#9b87f5]/60" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#9b87f5]/70">Variáveis</h3>
            </div>

            <Slider
              label="Budget"
              value={params.budgetMult}
              min={0.3} max={3.0} step={0.05}
              onChange={v => set("budgetMult", v)}
              format={v => `${(v * 100).toFixed(0)}%`}
              color="#9b87f5"
              hint="Multiplicador do investimento diário atual"
            />
            <Slider
              label="Frequência alvo"
              value={params.targetFreq}
              min={1.0} max={5.0} step={0.1}
              onChange={v => set("targetFreq", v)}
              format={v => `${v.toFixed(1)}×`}
              color="#00d4ff"
              hint="Menor freq. = público mais fresco = melhor CVR"
            />
            <Slider
              label="Ajuste de CPM"
              value={params.cpmAdjust}
              min={0.6} max={1.6} step={0.05}
              onChange={v => set("cpmAdjust", v)}
              format={v => `${v >= 1 ? "+" : ""}${((v - 1) * 100).toFixed(0)}%`}
              color="#f97316"
              hint="Pressão competitiva esperada no leilão"
            />
            <Slider
              label="Boost criativo (CTR)"
              value={params.ctrBoost}
              min={0.5} max={2.5} step={0.05}
              onChange={v => set("ctrBoost", v)}
              format={v => `${(v * 100).toFixed(0)}%`}
              color="#22c55e"
              hint="Impacto de novos criativos no CTR"
            />

            {/* Período */}
            <div className="space-y-2 pt-1">
              <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/40">Período de projeção</span>
              <div className="grid grid-cols-3 gap-1.5">
                {([7, 14, 30] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => set("period", d)}
                    className="rounded-xl border py-2 text-[10px] font-black uppercase tracking-wider transition-all"
                    style={params.period === d
                      ? { borderColor: "#9b87f5", background: "rgba(155,135,245,0.15)", color: "#9b87f5" }
                      : { borderColor: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.3)" }
                    }
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Save scenario */}
            <div className="pt-2 border-t border-white/[0.05]">
              <AnimatePresence>
                {showSaveInput ? (
                  <motion.div key="input" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="space-y-2">
                    <input
                      autoFocus
                      value={scenarioName}
                      onChange={e => setScenarioName(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveScenario()}
                      placeholder="Nome do cenário…"
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-mono text-white placeholder-white/20 outline-none focus:border-[#9b87f5]/50"
                    />
                    <div className="flex gap-2">
                      <button onClick={saveScenario} disabled={scenarios.length >= 3} className="flex-1 rounded-xl bg-[#9b87f5] py-2 text-[10px] font-black uppercase tracking-wider text-black disabled:opacity-40 hover:opacity-90 transition">Salvar</button>
                      <button onClick={() => setShowSaveInput(false)} className="rounded-xl border border-white/10 px-3 py-2 text-[10px] text-white/40 hover:text-white/60 transition">✕</button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="btn"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    onClick={() => setShowSaveInput(true)}
                    disabled={scenarios.length >= 3}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-[#9b87f5]/25 bg-[#9b87f5]/08 py-2.5 text-[10px] font-black uppercase tracking-widest text-[#9b87f5]/70 hover:bg-[#9b87f5]/15 hover:text-[#9b87f5] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <Bookmark className="h-3 w-3" />
                    {scenarios.length >= 3 ? "Máx. 3 cenários" : "Salvar cenário"}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* ── PROJEÇÃO ─────────────────── */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-6 rounded-full bg-[#22c55e]/60" />
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#22c55e]/60">Projeção — {periodLabel}</h3>
            </div>

            {!proj || !baseline ? (
              <div className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f] p-8 flex items-center justify-center text-white/20 text-xs font-mono">
                Aguardando dados…
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Leads Projetados" current={baseline.conv} projected={proj.projLeads} format={v => fmt.num(v)} icon={Users} delay={0.1} />
                <MetricCard label="CPL Projetado" current={baseline.cpl} projected={proj.projCPL} format={v => fmt.cpl(v)} icon={Target} inverse delay={0.15} />
                <MetricCard label="Custo Total" current={baseline.cost} projected={proj.projCost} format={v => fmt.brl(v)} icon={DollarSign} inverse delay={0.2} />
                <MetricCard label="Alcance Est." current={Math.round(baseline.impr / baseline.freq)} projected={proj.projReach} format={v => fmt.num(v)} icon={Zap} delay={0.25} />

                {/* CVR + CTR mini cards */}
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  {[
                    { label: "CVR Ajustado", val: fmt.pct(proj.adjCVR), base: fmt.pct(baseline.cvr), good: proj.adjCVR >= baseline.cvr },
                    { label: "CTR Ajustado", val: fmt.pct(proj.adjCTR), base: fmt.pct(baseline.ctr), good: proj.adjCTR >= baseline.ctr },
                  ].map((item, i) => (
                    <div key={i} className="rounded-xl border border-white/[0.06] bg-[#0a0a0f] p-3">
                      <p className="text-[8px] font-black uppercase tracking-widest text-white/30 mb-1">{item.label}</p>
                      <p className={`text-base font-black font-mono ${item.good ? "text-[#22c55e]" : "text-[#ef4444]"}`}>{item.val}</p>
                      <p className="text-[8px] text-white/25 font-mono">base: {item.base}</p>
                    </div>
                  ))}
                </div>

                {/* Eficiência badge */}
                {(() => {
                  const cplDelta = baseline.cpl > 0 ? ((proj.projCPL - baseline.cpl) / baseline.cpl) * 100 : 0;
                  const leadsDelta = baseline.conv > 0 ? ((proj.projLeads - baseline.conv) / baseline.conv) * 100 : 0;
                  const isWin = leadsDelta > 0 && cplDelta < 10;
                  const col = isWin ? "#22c55e" : cplDelta > 20 ? "#ef4444" : "#f59e0b";
                  const msg = isWin ? "Cenário vantajoso" : cplDelta > 20 ? "CPL muito alto — revisar" : "Monitorar CPL";
                  return (
                    <div className="col-span-2 rounded-xl border p-3 flex items-center gap-3" style={{ borderColor: `${col}25`, background: `${col}08` }}>
                      {isWin ? <ArrowUpRight className="h-5 w-5 shrink-0" style={{ color: col }} /> : <ArrowDownRight className="h-5 w-5 shrink-0" style={{ color: col }} />}
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-wider" style={{ color: col }}>{msg}</p>
                        <p className="text-[8px] text-white/30 mt-0.5">
                          Leads {leadsDelta >= 0 ? "+" : ""}{leadsDelta.toFixed(1)}% · CPL {cplDelta >= 0 ? "+" : ""}{cplDelta.toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </motion.div>
        </div>

        {/* ── COMPARISON CHART ───────────────────────────────────────────── */}
        {proj && baseline && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f] p-6"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Comparativo Visual</h3>
                <p className="text-[10px] text-white/30 mt-0.5 tracking-wider uppercase">Atual vs Projeção — {periodLabel}</p>
              </div>
              <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-white/20" />Atual</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-5 rounded bg-[#9b87f5]" />Projetado</span>
              </div>
            </div>

            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barGap={6} barCategoryGap="35%">
                  <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)", fontFamily: "monospace", fontWeight: 700 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "rgba(255,255,255,0.2)", fontFamily: "monospace" }} />
                  <Tooltip
                    contentStyle={{ background: "rgba(10,10,15,0.97)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, fontSize: 10, fontFamily: "monospace" }}
                    cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  />
                  <Bar dataKey="atual" name="Atual" fill="rgba(255,255,255,0.15)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="projetado" name="Projetado" fill="#9b87f5" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => {
                      const better = entry.name === "CPL (R$)" || entry.name === "Custo (R$)"
                        ? entry.projetado <= entry.atual
                        : entry.projetado >= entry.atual;
                      return <Cell key={i} fill={better ? "#22c55e" : "#ef4444"} fillOpacity={0.85} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        )}

        {/* ── CENÁRIOS SALVOS ────────────────────────────────────────────── */}
        <AnimatePresence>
          {scenarios.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-white/[0.06] bg-[#0a0a0f] overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.05]">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Cenários Comparados</h3>
                <span className="text-[9px] font-black text-white/25 uppercase tracking-widest">{scenarios.length}/3 salvos</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/[0.04]">
                      {["Cenário", "Budget", "Freq.", "CPM", "CTR Boost", "Período", "Leads", "CPL", "Custo", ""].map((h, i) => (
                        <th key={i} className="px-4 py-3 text-left text-[8px] font-black uppercase tracking-widest text-white/25">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => (
                      <motion.tr
                        key={sc.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: sc.color }} />
                            <span className="text-[11px] font-black text-white/80">{sc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-white/50">{(sc.params.budgetMult * 100).toFixed(0)}%</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-white/50">{sc.params.targetFreq.toFixed(1)}×</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-white/50">{sc.params.cpmAdjust >= 1 ? "+" : ""}{((sc.params.cpmAdjust - 1) * 100).toFixed(0)}%</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-white/50">{(sc.params.ctrBoost * 100).toFixed(0)}%</td>
                        <td className="px-4 py-3 text-[10px] font-mono text-white/50">{sc.params.period}d</td>
                        <td className="px-4 py-3 text-[11px] font-black font-mono" style={{ color: sc.color }}>{fmt.num(sc.projLeads)}</td>
                        <td className="px-4 py-3 text-[11px] font-black font-mono text-white/70">{fmt.cpl(sc.projCPL)}</td>
                        <td className="px-4 py-3 text-[11px] font-black font-mono text-white/70">{fmt.brl(sc.projCost)}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => setScenarios(prev => prev.filter(s => s.id !== sc.id))} className="text-white/20 hover:text-red-400 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
