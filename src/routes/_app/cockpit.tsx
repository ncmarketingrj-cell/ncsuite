import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { useGlobalDate, type Period } from "@/contexts/DateContext";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip as RTip, ResponsiveContainer, Cell, ReferenceArea,
  AreaChart, Area, Tooltip as RTooltip,
} from "recharts";
import {
  Activity, Zap, TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2,
  Radio, Rocket, DollarSign, BarChart3, Flame, ArrowUpRight, ArrowDownRight,
  ChevronDown, RotateCcw, X, Info,
} from "lucide-react";

// ─── ROUTE ──────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_app/cockpit")({
  head: () => ({ meta: [{ title: "Cockpit de Performance — NC Suite" }] }),
  beforeLoad: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data: r } = await supabase.auth.refreshSession();
      session = r.session;
    }
    if (!session) throw redirect({ to: "/login" });
  },
  component: CockpitPage,
});

// ─── SVG GAUGE MATH ─────────────────────────────────────────────────────────────
const G_START = 135;
const G_SWEEP = 270;
const toRad = (d: number) => (d * Math.PI) / 180;

function pt(cx: number, cy: number, r: number, deg: number) {
  return { x: cx + r * Math.cos(toRad(deg)), y: cy + r * Math.sin(toRad(deg)) };
}

function arcD(cx: number, cy: number, r: number, startDeg: number, sweepDeg: number) {
  if (sweepDeg <= 0) return "";
  const capped = Math.min(sweepDeg, 359.99);
  const s = pt(cx, cy, r, startDeg);
  const e = pt(cx, cy, r, startDeg + capped);
  const large = capped > 180 ? 1 : 0;
  return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
}

// ─── ANIMATED COUNTER ────────────────────────────────────────────────────────────
function AnimCounter({ to, delay = 0 }: { to: number; delay?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      let s = 0;
      const step = to / 60;
      const id = setInterval(() => { s = Math.min(s + step, to); setVal(s); if (s >= to) clearInterval(id); }, 16);
      return () => clearInterval(id);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [to, delay]);
  return <>{Math.round(val)}</>;
}

// ─── COCKPIT GAUGE ───────────────────────────────────────────────────────────────
interface Zone { from: number; to: number; color: string }

interface GaugeProps {
  value: number; max?: number; label: string; sub?: string; unit?: string;
  zones?: Zone[]; size?: number; delay?: number;
}

function CockpitGauge({ value, max = 100, label, sub, unit = "%", zones, size = 188, delay = 0 }: GaugeProps) {
  const cx = size / 2, cy = size / 2 + 8, R = size / 2 - 22;
  const arcLen = R * toRad(G_SWEEP);
  const pct = Math.min(Math.max(value / max, 0), 1);
  const valueSweep = pct * G_SWEEP;
  const offset = arcLen * (1 - pct);

  const zones_ = zones ?? [
    { from: 0, to: 0.4, color: "#ef4444" },
    { from: 0.4, to: 0.7, color: "#f59e0b" },
    { from: 0.7, to: 1, color: "#22c55e" },
  ];

  const activeZone = [...zones_].reverse().find(z => pct >= z.from) ?? zones_[0];
  const glowColor = activeZone.color;
  const needleDeg = G_START + valueSweep;
  const needleTip = pt(cx, cy, R - 6, needleDeg);
  const nb1 = pt(cx, cy, 7, needleDeg + 90);
  const nb2 = pt(cx, cy, 7, needleDeg - 90);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const deg = G_START + f * G_SWEEP;
    return { outer: pt(cx, cy, R + 5, deg), inner: pt(cx, cy, R + 13, deg) };
  });
  const gid = label.replace(/\s/g, "-");

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, type: "spring", stiffness: 120, damping: 18 }}
      className="relative"
    >
      <div className="relative rounded-2xl bg-card border border-border overflow-hidden"
        style={{ borderColor: `${glowColor}22`, boxShadow: `0 0 0 1px ${glowColor}14, 0 0 32px ${glowColor}09, inset 0 1px 0 rgba(255,255,255,0.04)` }}>
        {[["top-2 left-2 border-t-2 border-l-2 rounded-tl-lg"], ["top-2 right-2 border-t-2 border-r-2 rounded-tr-lg"], ["bottom-2 left-2 border-b-2 border-l-2 rounded-bl-lg"], ["bottom-2 right-2 border-b-2 border-r-2 rounded-br-lg"]].map(([cls], i) => (
          <div key={i} className={`absolute w-3 h-3 opacity-30 ${cls}`} style={{ borderColor: glowColor }} />
        ))}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px)", mixBlendMode: "multiply" }} />
        <div className="flex justify-center">
          <svg width={size} height={size * 0.78} viewBox={`0 0 ${size} ${size * 0.88}`} style={{ display: "block" }}>
            <defs>
              <filter id={`glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id={`glow2-${gid}`} x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="6" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <path d={arcD(cx, cy, R, G_START, G_SWEEP)} stroke="rgba(255,255,255,0.06)" strokeWidth={12} fill="none" strokeLinecap="round" />
            {zones_.map((z, i) => {
              const zs = z.from * G_SWEEP, ze = z.to * G_SWEEP;
              return <path key={i} d={arcD(cx, cy, R, G_START + zs, ze - zs - 1)} stroke={z.color} strokeWidth={3} fill="none" opacity={0.22} strokeLinecap="butt" />;
            })}
            <motion.path
              d={arcD(cx, cy, R, G_START, G_SWEEP)}
              stroke={glowColor} strokeWidth={12} fill="none" strokeLinecap="round"
              filter={`url(#glow-${gid})`}
              initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
              animate={{ strokeDashoffset: offset, strokeDasharray: arcLen }}
              transition={{ duration: 1.6, delay: delay + 0.25, ease: [0.22, 1, 0.36, 1] }}
            />
            {ticks.map((t, i) => (
              <line key={i} x1={t.outer.x} y1={t.outer.y} x2={t.inner.x} y2={t.inner.y}
                stroke="rgba(255,255,255,0.35)" strokeWidth={i === 0 || i === 4 ? 2 : 1.5} strokeLinecap="round" />
            ))}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 1.4, duration: 0.4 }}>
              <polygon points={`${needleTip.x},${needleTip.y} ${nb1.x},${nb1.y} ${nb2.x},${nb2.y}`}
                fill={glowColor} filter={`url(#glow2-${gid})`} opacity={0.95} />
              <circle cx={cx} cy={cy} r={7} fill="currentColor" className="text-card" stroke={glowColor} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={3} fill={glowColor} />
            </motion.g>
            <motion.text x={cx} y={cy + 26} textAnchor="middle" fill="currentColor" className="text-foreground" fontSize={size * 0.13}
              fontWeight="900" fontFamily="'Courier New', monospace" letterSpacing="-1"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.6 }}>
              {Math.round(value)}{unit}
            </motion.text>
          </svg>
        </div>
        <div className="px-3 pb-4 text-center -mt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          {sub && <p className="text-[8px] text-muted-foreground/60 mt-0.5 tracking-wider">{sub}</p>}
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${glowColor}60, transparent)` }} />
      </div>
    </motion.div>
  );
}

// ─── SCORE ORB ───────────────────────────────────────────────────────────────────
function ScoreOrb({ score, components, isLoading }: { score: number; components: Record<string, number>; isLoading: boolean }) {
  const S = 260, cx = S / 2, cy = S / 2 + 8, R = S / 2 - 24;
  const arcLen = R * toRad(G_SWEEP);
  const pct = score / 100;
  const offset = arcLen * (1 - pct);
  const color = score >= 80 ? "#22c55e" : score >= 55 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Excelente" : score >= 55 ? "Atenção" : "Crítico";

  const comps = [
    { key: "cplEfficiency", label: "Efic. CPL", weight: "25%", tooltip: "Mede se o Custo por Lead atual está batendo a meta." },
    { key: "cpmTrend", label: "Tend. CPM", weight: "15%", tooltip: "Avalia se o leilão do mercado está encarecendo." },
    { key: "fatigue", label: "Fadiga", weight: "20%", tooltip: "Nível de saturação visual dos criativos." },
    { key: "conversion", label: "Conversão", weight: "20%", tooltip: "Qualidade do tráfego vs retenção na Landing Page." },
    { key: "funnelHealth", label: "Funil", weight: "20%", tooltip: "Cliques e engajamento da primeira etapa do funil (CTR)." },
  ];

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, type: "spring", stiffness: 80 }} className="flex flex-col items-center gap-6">
      <div className="relative">
        <svg width={S} height={S * 0.82} viewBox={`0 0 ${S} ${S * 0.92}`}>
          <defs>
            <filter id="orb-glow"><feGaussianBlur stdDeviation="8" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {[...Array(36)].map((_, i) => {
            const deg = G_START + (i / 36) * G_SWEEP;
            const outer = pt(cx, cy, R + 22, deg);
            return <circle key={i} cx={outer.x} cy={outer.y} r={i % 6 === 0 ? 3 : 1.5} fill="rgba(255,255,255,0.15)" />;
          })}
          <path d={arcD(cx, cy, R, G_START, G_SWEEP)} stroke="rgba(255,255,255,0.07)" strokeWidth={16} fill="none" strokeLinecap="round" />
          {[{ from: 0, sw: 0.4 * G_SWEEP, color: "#ef4444" }, { from: 0.4 * G_SWEEP, sw: 0.3 * G_SWEEP, color: "#f59e0b" }, { from: 0.7 * G_SWEEP, sw: 0.3 * G_SWEEP - 1, color: "#22c55e" }].map((z, i) => (
            <path key={i} d={arcD(cx, cy, R, G_START + z.from, z.sw)} stroke={z.color} strokeWidth={4} fill="none" opacity={0.25} strokeLinecap="butt" />
          ))}
          <motion.path d={arcD(cx, cy, R, G_START, G_SWEEP)} stroke={color} strokeWidth={16} fill="none" strokeLinecap="round" filter="url(#orb-glow)"
            initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
            animate={{ strokeDashoffset: isLoading ? arcLen : offset, strokeDasharray: arcLen }}
            transition={{ duration: 2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }} />
          <motion.text x={cx} y={cy + 2} textAnchor="middle" fill="currentColor" className="text-foreground" fontSize={60} fontWeight="900"
            fontFamily="'Courier New', monospace" letterSpacing="-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            {isLoading ? "--" : <AnimCounter to={score} delay={0.5} />}
          </motion.text>
          <motion.text x={cx} y={cy + 26} textAnchor="middle" fill={color} fontSize={11} fontWeight="800"
            fontFamily="monospace" letterSpacing="3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            {label.toUpperCase()}
          </motion.text>
        </svg>
        <div className="absolute inset-0 pointer-events-none rounded-full" style={{ background: `radial-gradient(ellipse at center bottom, ${color}12 0%, transparent 65%)` }} />
      </div>
      <div className="grid grid-cols-5 gap-2 w-full max-w-lg">
        {comps.map((c, i) => {
          const v = components[c.key] ?? 0;
          const col = v >= 70 ? "#22c55e" : v >= 45 ? "#f59e0b" : "#ef4444";
          return (
            <motion.div key={c.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.2 + i * 0.08 }}
              className="flex flex-col items-center gap-1 rounded-xl border p-2" style={{ borderColor: `${col}25`, background: `${col}08` }}>
              <div className="flex items-center justify-between w-full relative group/orb">
                <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: col }}>{c.label}</span>
                <Info className="h-2 w-2 text-muted-foreground/40 hover:text-foreground cursor-help" />
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 w-32 p-1.5 rounded-lg bg-popover/95 backdrop-blur-xl border border-white/10 shadow-2xl text-[8px] leading-relaxed text-muted-foreground opacity-0 pointer-events-none group-hover/orb:opacity-100 transition-all z-50 text-center">
                  {c.tooltip}
                </div>
              </div>
              <span className="text-xs font-black font-mono text-foreground">{Math.round(v)}</span>
              <div className="w-full h-1 rounded-full bg-muted overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: col }}
                  initial={{ width: 0 }} animate={{ width: `${v}%` }}
                  transition={{ duration: 1, delay: 1.4 + i * 0.08, ease: "easeOut" }} />
              </div>
              <span className="text-[7px] text-muted-foreground font-mono">{c.weight}</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── SCORE HISTÓRICO ─────────────────────────────────────────────────────────────
function ScoreHistorico({ data }: { data: Array<{ date: string; score: number }> }) {
  if (!data.length) return null;
  const trend = data[data.length - 1].score - data[0].score;
  const trendColor = trend >= 0 ? "#22c55e" : "#ef4444";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.6 }} className="w-full">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">Tendência — {data.length} dias</span>
        <span className="text-[9px] font-black font-mono" style={{ color: trendColor }}>{trend >= 0 ? "+" : ""}{trend} pts</span>
      </div>
      <div className="h-[56px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9b87f5" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#9b87f5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={[0, 100]} hide />
            <RTooltip contentStyle={{ background: "rgba(10,10,15,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, fontSize: 10, fontFamily: "monospace" }} formatter={(v: any) => [`${v} pts`, "Score"]} />
            <Area type="monotone" dataKey="score" stroke="#9b87f5" strokeWidth={2} fill="url(#scoreGrad)" dot={{ r: 2, fill: "#9b87f5", strokeWidth: 0 }} activeDot={{ r: 4, fill: "#9b87f5" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-1">
        {data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0).map((d, i) => (
          <span key={i} className="text-[7px] font-mono text-muted-foreground/60">{d.date}</span>
        ))}
      </div>
    </motion.div>
  );
}

// ─── RECOMENDAÇÕES ───────────────────────────────────────────────────────────────
function RecomendacoesInteligentes({ recs }: { recs: Array<{ prio: string; color: string; title: string; desc: string; icon: any }> }) {
  if (!recs.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 1.2 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">Diagnóstico & Ações</h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 tracking-widest uppercase">O que fazer agora — baseado nos indicadores</p>
        </div>
        <div className="flex gap-2">
          {(["CRÍTICO", "ATENÇÃO", "OPORTUNIDADE"] as const).map(p => {
            const count = recs.filter(r => r.prio === p).length;
            if (!count) return null;
            const col = p === "CRÍTICO" ? "#ef4444" : p === "ATENÇÃO" ? "#f59e0b" : "#22c55e";
            return <span key={p} className="text-[8px] font-black px-2 py-1 rounded-md border" style={{ color: col, borderColor: `${col}30`, background: `${col}10` }}>{count}× {p}</span>;
          })}
        </div>
      </div>
      <div className="divide-y divide-border">
        {recs.map((rec, i) => {
          const Icon = rec.icon;
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.3 + i * 0.08 }}
              className="flex gap-4 px-6 py-4 hover:bg-muted/50 transition-colors">
              <div className="w-0.5 self-stretch rounded-full shrink-0" style={{ backgroundColor: rec.color }} />
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${rec.color}14`, border: `1px solid ${rec.color}25` }}>
                <Icon className="h-4 w-4" style={{ color: rec.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[8px] font-black px-1.5 py-0.5 rounded" style={{ color: rec.color, background: `${rec.color}12` }}>{rec.prio}</span>
                  <span className="text-[11px] font-black text-foreground leading-tight">{rec.title}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-relaxed">{rec.desc}</p>
              </div>
              <div className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black" style={{ background: `${rec.color}15`, color: rec.color }}>{i + 1}</div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── RADAR TÁTICO ────────────────────────────────────────────────────────────────
const RADAR_COLORS: Record<string, string> = { up: "#22c55e", down: "#ef4444", stable: "#f59e0b" };

function CustomDot(props: any) {
  const { cx, cy, payload } = props;
  const r = Math.sqrt((payload.spend / Math.PI)) * 0.9 + 10;
  const col = RADAR_COLORS[payload.trend] ?? "#9b87f5";
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 6} fill={col} opacity={0.08} />
      <circle cx={cx} cy={cy} r={r} fill={col} opacity={0.85} />
      <circle cx={cx} cy={cy} r={r * 0.45} fill="rgba(0,0,0,0.5)" />
      <text x={cx} y={cy + r + 13} textAnchor="middle" fill="rgba(255,255,255,0.55)" fontSize={8} fontWeight="700" fontFamily="monospace">
        {payload.name?.split(" ").slice(-2).join(" ").slice(0, 14)}
      </text>
    </g>
  );
}

function RadarTatico({ data }: { data: any[] }) {
  if (!data.length) return null;
  const maxCPL = Math.max(...data.map(d => d.cpl), 1);
  const maxLeads = Math.max(...data.map(d => d.leads), 1);
  const midCPL = maxCPL / 2, midLeads = maxLeads / 2;
  return (
    <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.8 }}
      className="relative rounded-2xl border border-border bg-card overflow-hidden p-6 shadow-sm">
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "40px 40px", opacity: 0.03 }} />
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">Radar Tático</h3>
            <div className="relative group/radar z-50">
              <Info className="h-3.5 w-3.5 text-muted-foreground/40 hover:text-foreground cursor-help" />
              <div className="absolute bottom-full left-0 mb-2 w-64 p-3 rounded-xl bg-popover/95 backdrop-blur-xl border border-white/10 shadow-2xl text-[10px] leading-relaxed text-muted-foreground opacity-0 pointer-events-none group-hover/radar:opacity-100 transition-all text-left">
                <strong>Como ler este radar:</strong><br/>Campanhas no quadrante superior esquerdo (Verde) têm leads baratos e em volume.<br/>As do canto inferior direito estão consumindo muito e gerando pouco.
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5 tracking-widest uppercase">CPL × Volume — Posicione campanhas no quadrante certo</p>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider">
          {[["#22c55e", "Crescendo"], ["#f59e0b", "Estável"], ["#ef4444", "Caindo"]].map(([col, lbl]) => (
            <span key={lbl} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: col }} />{lbl}</span>
          ))}
        </div>
      </div>
      <div className="relative h-[340px]">
        {[["top-4 left-[8%] text-[#22c55e]/50", "↑ ESCALAR"], ["top-4 right-[8%] text-[#f59e0b]/50", "ANALISAR ↑"], ["bottom-8 left-[8%] text-[#f59e0b]/50", "↓ NICHO"], ["bottom-8 right-[8%] text-[#ef4444]/50", "PAUSAR ↓"]].map(([cls, lbl]) => (
          <div key={lbl} className={`absolute text-[9px] font-black uppercase tracking-widest pointer-events-none z-10 ${cls}`}>{lbl}</div>
        ))}
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
            <ReferenceArea x1={0} x2={midCPL} y1={midLeads} y2={maxLeads * 1.1} fill="#22c55e" fillOpacity={0.04} />
            <ReferenceArea x1={midCPL} x2={maxCPL * 1.1} y1={midLeads} y2={maxLeads * 1.1} fill="#f59e0b" fillOpacity={0.04} />
            <ReferenceArea x1={0} x2={midCPL} y1={0} y2={midLeads} fill="#f59e0b" fillOpacity={0.03} />
            <ReferenceArea x1={midCPL} x2={maxCPL * 1.1} y1={0} y2={midLeads} fill="#ef4444" fillOpacity={0.04} />
            <CartesianGrid strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0.05} />
            <XAxis dataKey="cpl" type="number" name="CPL" unit=" R$" domain={[0, "auto"]} axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "currentColor", opacity: 0.4, fontFamily: "monospace", fontWeight: 700 }} label={{ value: "← CPL (menor = melhor)", position: "insideBottom", offset: -10, fontSize: 8, fill: "currentColor", opacity: 0.4, fontFamily: "monospace" }} />
            <YAxis dataKey="leads" type="number" name="Leads" axisLine={false} tickLine={false} tick={{ fontSize: 8, fill: "currentColor", opacity: 0.4, fontFamily: "monospace", fontWeight: 700 }} label={{ value: "Leads ↑", angle: -90, position: "insideLeft", offset: 10, fontSize: 8, fill: "currentColor", opacity: 0.4, fontFamily: "monospace" }} />
            <ZAxis dataKey="spend" range={[200, 2400]} name="Gasto" />
            <RTip cursor={{ stroke: "rgba(150,150,150,0.2)", strokeWidth: 1 }} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 11, fontFamily: "monospace", color: "hsl(var(--foreground))" }} formatter={(v: any, name: string) => name === "CPL" ? [`R$ ${Number(v).toFixed(2)}`, "CPL"] : name === "Gasto" ? [`R$ ${Number(v).toFixed(2)}`, "Gasto"] : [v, name]} />
            <Scatter data={data} shape={<CustomDot />}>
              {data.map((d, i) => <Cell key={i} fill={RADAR_COLORS[d.trend] ?? "#9b87f5"} />)}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

// ─── FILTER BAR ──────────────────────────────────────────────────────────────────
const PERIODS: { label: string; value: Period }[] = [
  { label: "7D", value: "7d" },
  { label: "14D", value: "14d" },
  { label: "30D", value: "30d" },
  { label: "60D", value: "60d" },
  { label: "90D", value: "90d" },
  { label: "Personalizado", value: "custom" },
];

function CockpitFilterBar() {
  const { period, setPeriod, dateFrom, dateTo, setDateFrom, setDateTo, accountId, setAccountId, campaignId, setCampaignId, adSetId, setAdSetId, resetToDefault } = useGlobalDate();

  const [showAccounts, setShowAccounts] = useState(false);
  const [showCampaigns, setShowCampaigns] = useState(false);
  const [showAdSets, setShowAdSets] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const campaignRef = useRef<HTMLDivElement>(null);
  const adSetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) setShowAccounts(false);
      if (campaignRef.current && !campaignRef.current.contains(e.target as Node)) setShowCampaigns(false);
      if (adSetRef.current && !adSetRef.current.contains(e.target as Node)) setShowAdSets(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: accounts = [] } = useQuery({
    queryKey: ["cockpit-accounts"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("id, name, platform").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ["cockpit-campaigns", accountId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any).from("campaigns").select("id, name, status, ad_account_id").eq("status", "active").order("name");
      if (accountId !== "all") q = q.eq("ad_account_id", accountId);
      const { data } = await q;
      return (data as any[]) ?? [];
    },
  });

  const { data: adSets = [] } = useQuery({
    queryKey: ["cockpit-adsets", campaignId, accountId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      let q = (supabase as any).from("ad_sets").select("id, name, status, campaign_id").order("name");
      if (campaignId !== "all") q = q.eq("campaign_id", campaignId);
      else if (accountId !== "all") {
        // join through campaigns
        const { data: cids } = await (supabase as any).from("campaigns").select("id").eq("ad_account_id", accountId);
        const ids = (cids as any[])?.map((c: any) => c.id) ?? [];
        if (ids.length) q = q.in("campaign_id", ids); else return [];
      }
      const { data } = await q;
      return (data as any[]) ?? [];
    },
  });

  const selectedAccount = accounts.find((a: any) => a.id === accountId);
  const selectedCampaign = campaigns.find((c: any) => c.id === campaignId);
  const selectedAdSet = adSets.find((s: any) => s.id === adSetId);
  const isFiltered = accountId !== "all" || campaignId !== "all" || adSetId !== "all" || period !== "30d";

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative z-50 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/80 px-4 py-3 backdrop-blur-xl shadow-sm"
    >
      {/* Account selector */}
      <div ref={accountRef} className="relative">
        <button
          onClick={() => { setShowAccounts(!showAccounts); setShowCampaigns(false); }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={accountId !== "all" ? { borderColor: "var(--primary)", color: "var(--primary)" } : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accountId !== "all" ? "var(--primary)" : "currentColor" }} />
          {selectedAccount?.name ?? "Todas as Contas"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        <AnimatePresence>
          {showAccounts && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              className="absolute top-full left-0 mt-1.5 z-50 min-w-[220px] rounded-2xl border border-border bg-popover shadow-2xl overflow-hidden"
            >
              <button onClick={() => { setAccountId("all"); setShowAccounts(false); }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${accountId === "all" ? "text-primary" : "text-muted-foreground"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />Todas as Contas
              </button>
              {accounts.map((acc: any) => (
                <button key={acc.id} onClick={() => { setAccountId(acc.id); setShowAccounts(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${accountId === acc.id ? "text-primary" : "text-foreground/70"}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: accountId === acc.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }} />
                  {acc.name}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Campaign selector */}
      <div ref={campaignRef} className="relative">
        <button
          onClick={() => { setShowCampaigns(!showCampaigns); setShowAccounts(false); }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={campaignId !== "all" ? { borderColor: "var(--primary)", color: "var(--primary)" } : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: campaignId !== "all" ? "var(--primary)" : "currentColor" }} />
          {selectedCampaign?.name ? selectedCampaign.name.slice(0, 20) + (selectedCampaign.name.length > 20 ? "…" : "") : "Todas as Campanhas"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        <AnimatePresence>
          {showCampaigns && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              className="absolute top-full left-0 mt-1.5 z-50 min-w-[260px] max-h-[320px] overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl"
            >
              <button onClick={() => { setCampaignId("all"); setShowCampaigns(false); }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${campaignId === "all" ? "text-primary" : "text-muted-foreground"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />Todas as Campanhas
              </button>
              {campaigns.length === 0 && <p className="px-4 py-3 text-[9px] text-muted-foreground font-mono">Nenhuma campanha ativa{accountId !== "all" ? " nesta conta" : ""}</p>}
              {campaigns.map((c: any) => (
                <button key={c.id} onClick={() => { setCampaignId(c.id); setShowCampaigns(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${campaignId === c.id ? "text-primary" : "text-foreground/70"}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: campaignId === c.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }} />
                  {c.name.slice(0, 32)}{c.name.length > 32 ? "…" : ""}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ad Set selector */}
      <div ref={adSetRef} className="relative">
        <button
          onClick={() => { setShowAdSets(!showAdSets); setShowAccounts(false); setShowCampaigns(false); }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={adSetId !== "all" ? { borderColor: "var(--primary)", color: "var(--primary)" } : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: adSetId !== "all" ? "var(--primary)" : "currentColor" }} />
          {selectedAdSet?.name ? selectedAdSet.name.slice(0, 18) + (selectedAdSet.name.length > 18 ? "…" : "") : "Todos os Conjuntos"}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </button>
        <AnimatePresence>
          {showAdSets && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.97 }}
              className="absolute top-full left-0 mt-1.5 z-50 min-w-[260px] max-h-[300px] overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl"
            >
              <button onClick={() => { setAdSetId("all"); setShowAdSets(false); }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${adSetId === "all" ? "text-primary" : "text-muted-foreground"}`}>
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />Todos os Conjuntos
              </button>
              {adSets.length === 0 && <p className="px-4 py-3 text-[9px] text-muted-foreground font-mono">Nenhum conjunto encontrado</p>}
              {adSets.map((s: any) => (
                <button key={s.id} onClick={() => { setAdSetId(s.id); setShowAdSets(false); }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${adSetId === s.id ? "text-primary" : "text-foreground/70"}`}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: adSetId === s.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }} />
                  {s.name.slice(0, 30)}{s.name.length > 30 ? "…" : ""}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-border" />

      {/* Period pills */}
      <div className="flex items-center gap-1">
        {PERIODS.map(p => (
          <button
            key={p.value}
            onClick={() => setPeriod(p.value)}
            className="rounded-lg px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest transition-all"
            style={period === p.value
              ? { background: "hsl(var(--primary)/0.15)", color: "var(--primary)", border: "1px solid hsl(var(--primary)/0.4)" }
              : { color: "hsl(var(--muted-foreground))", border: "1px solid transparent" }
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date inputs */}
      <AnimatePresence>
        {period === "custom" && (
          <motion.div initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: "auto" }} exit={{ opacity: 0, width: 0 }}
            className="flex items-center gap-2 overflow-hidden">
            <div className="h-5 w-px bg-border" />
            <input type="date" value={dateFrom} max={dateTo}
              onChange={e => setDateFrom(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] font-mono text-foreground outline-none focus:border-primary/50"
            />
            <span className="text-muted-foreground text-[10px]">→</span>
            <input type="date" value={dateTo} min={dateFrom} max={new Date().toISOString().split("T")[0]}
              onChange={e => setDateTo(e.target.value)}
              className="rounded-lg border border-border bg-background px-2 py-1.5 text-[9px] font-mono text-foreground outline-none focus:border-primary/50"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset button */}
      {isFiltered && (
        <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }}
          onClick={resetToDefault}
          className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
          <X className="h-2.5 w-2.5" />Limpar
        </motion.button>
      )}
    </motion.div>
  );
}

// ─── DATA HOOK ───────────────────────────────────────────────────────────────────
function useCockpitData() {
  const { dateFrom, dateTo, accountId, campaignId, adSetId } = useGlobalDate();

  const { data: raw, isLoading } = useQuery({
    queryKey: ["cockpit-raw", dateFrom, dateTo, accountId, campaignId, adSetId],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      let q = (supabase as any)
        .from("campaigns")
        .select(`id, name, status, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, external_id, ad_account_id, metrics(cost, conversions, impressions, clicks, reach, frequency, date)`);

      if (accountId !== "all") q = q.eq("ad_account_id", accountId);
      if (campaignId !== "all") q = q.eq("id", campaignId);

      if (adSetId !== "all") {
        const { data: adSetData } = await (supabase as any).from("ad_sets").select("campaign_id").eq("id", adSetId).single();
        if (adSetData?.campaign_id) q = q.eq("id", adSetData.campaign_id);
      }

      const { data, error } = await q;
      if (error) {
        console.error("[cockpit] query error:", error);
        return [];
      }
      
      const campaignsWithMetrics = (data as any[]) ?? [];
      const raw: any[] = [];
      
      for (const camp of campaignsWithMetrics) {
        if (!camp.metrics) continue;
        for (const m of camp.metrics) {
          if (m.date) {
             const d = m.date.split("T")[0];
             if (d < dateFrom || d > dateTo) continue;
          }
          raw.push({
            campaign_id: camp.id,
            cost: m.cost,
            conversions: m.conversions,
            impressions: m.impressions,
            clicks: m.clicks,
            cpm: m.impressions > 0 ? (m.cost / m.impressions) * 1000 : 0,
            frequency: m.frequency,
            date: m.date?.split("T")[0] || m.date,
            campaigns: {
              id: camp.id,
              name: camp.name,
              ad_account_id: camp.ad_account_id,
              objective: camp.objective,
              daily_budget: camp.daily_budget
            }
          });
        }
      }
      return raw;
    },
  });

  return useMemo(() => {
    if (isLoading) return { score: 0, components: {}, gauges: {}, radar: [], dailyScores: [], recommendations: [], isLoading: true, meta: null };
    if (!raw?.length) return { score: 0, components: {}, gauges: {}, radar: [], dailyScores: [], recommendations: [], isLoading: false, meta: null };

    // Split: prior = first half, recent = second half
    const totalDays = Math.max(differenceInDays(parseISO(dateTo), parseISO(dateFrom)), 1);
    const midDate = format(subDays(parseISO(dateTo), Math.floor(totalDays / 2)), "yyyy-MM-dd");
    const recent = raw.filter((r: any) => r.date >= midDate);
    const prior = raw.filter((r: any) => r.date < midDate);

    const agg = (rows: any[]) => {
      let cost = 0, conv = 0, clicks = 0, impr = 0, freqSum = 0, freqN = 0, cpmSum = 0, cpmN = 0;
      for (const r of rows) {
        cost += r.cost ?? 0; conv += r.conversions ?? 0; clicks += r.clicks ?? 0; impr += r.impressions ?? 0;
        if (r.frequency) { freqSum += r.frequency; freqN++; }
        if (r.cpm) { cpmSum += r.cpm; cpmN++; }
      }
      return { cost, conv, clicks, impr, avgFreq: freqN > 0 ? freqSum / freqN : 0, avgCPM: cpmN > 0 ? cpmSum / cpmN : 0 };
    };

    const R = agg(recent);
    const P = agg(prior);

    const CPL = R.conv > 0 ? R.cost / R.conv : 0;
    const CVR = R.clicks > 0 ? R.conv / R.clicks : 0;
    const cpmTrendRatio = P.avgCPM > 0 ? R.avgCPM / P.avgCPM : 1;
    const TARGET_CPL = 35;

    // Component scores
    const cplEfficiency = CPL > 0 ? Math.min(100, (TARGET_CPL / CPL) * 100) : 40;
    const cpmTrend = Math.min(100, Math.max(0, (2 - cpmTrendRatio) * 100));
    const fatigue = Math.max(0, 100 - Math.min(100, (R.avgFreq / 4) * 100));
    const conversion = Math.min(100, (CVR / 0.04) * 100);
    const funnelHealth = R.impr > 0 && R.clicks > 0 ? Math.min(100, (R.clicks / R.impr) * 1000) : 50;

    const score = Math.round(cplEfficiency * 0.25 + cpmTrend * 0.15 + fatigue * 0.20 + conversion * 0.20 + funnelHealth * 0.20);

    // Per-campaign map (for gauges and radar)
    const campMap: Record<string, any> = {};
    for (const r of raw) {
      const cid = r.campaign_id;
      if (!campMap[cid]) campMap[cid] = { name: r.campaigns?.name ?? cid, cost: 0, conv: 0, clicks: 0, impr: 0, budget: r.campaigns?.daily_budget ?? 0, cpms: [] };
      campMap[cid].cost += r.cost ?? 0;
      campMap[cid].conv += r.conversions ?? 0;
      campMap[cid].clicks += r.clicks ?? 0;
      campMap[cid].impr += r.impressions ?? 0;
      if (r.cpm) campMap[cid].cpms.push(r.cpm);
    }

    const camps = Object.values(campMap);
    const activeCamps = camps.filter(c => c.cost > 0);
    const totalBudget = camps.reduce((s: number, c: any) => s + c.budget, 0);
    const activeBudget = activeCamps.reduce((s: number, c: any) => s + c.budget, 0);
    const dailyCost = R.cost / Math.max(Math.ceil(totalDays / 2), 1);

    const scale = totalBudget > 0 ? Math.min(100, (dailyCost / totalBudget) * 100) : 50;
    const pressure = Math.min(100, Math.max(0, (2 - cpmTrendRatio) * 100));
    const budgetHealth = totalBudget > 0 ? Math.min(100, (activeBudget / totalBudget) * 100) : 50;
    const momentum = Math.min(100, Math.max(0, pressure * 0.5 + conversion * 0.3 + (100 - Math.min(100, R.avgFreq * 20)) * 0.2));

    // Radar
    const radar = camps
      .filter((c: any) => c.cost > 1 || c.conv > 0)
      .map((c: any) => {
        const campCPL = c.conv > 0 ? c.cost / c.conv : CPL * 1.5;
        const avgCampCPM = c.cpms.length > 0 ? c.cpms.reduce((a: number, b: number) => a + b, 0) / c.cpms.length : 0;
        const trend = avgCampCPM < R.avgCPM * 0.85 ? "up" : avgCampCPM > R.avgCPM * 1.15 ? "down" : "stable";
        return { id: c.name, name: c.name, cpl: +campCPL.toFixed(2), leads: c.conv, spend: +c.cost.toFixed(2), trend };
      })
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 16);

    // Daily scores (show up to 14 days within range)
    const today2 = parseISO(dateTo);
    const showDays = Math.min(totalDays, 14);
    const byDate: Record<string, any[]> = {};
    for (const r of raw) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    }
    const dailyScores = [...Array(showDays)].map((_, i) => {
      const dt = format(subDays(today2, showDays - 1 - i), "yyyy-MM-dd");
      const label = format(subDays(today2, showDays - 1 - i), "dd/MM", { locale: ptBR });
      const dd = byDate[dt] ?? [];
      if (!dd.length) return { date: label, score: 0 };
      const d = agg(dd);
      const s1 = d.cost > 0 && d.conv > 0 ? Math.min(100, (TARGET_CPL / (d.cost / d.conv)) * 100) : 40;
      const s3 = Math.max(0, 100 - Math.min(100, (d.avgFreq / 4) * 100));
      const s4 = d.clicks > 0 ? Math.min(100, (d.conv / d.clicks / 0.04) * 100) : 30;
      const s5 = d.impr > 0 ? Math.min(100, (d.clicks / d.impr) * 1000) : 30;
      return { date: label, score: Math.round(s1 * 0.30 + s3 * 0.25 + s4 * 0.25 + s5 * 0.20) };
    });

    // Recommendations
    type RecPrio = "CRÍTICO" | "ATENÇÃO" | "OPORTUNIDADE";
    const recs: Array<{ prio: RecPrio; color: string; title: string; desc: string; icon: any }> = [];

    if (fatigue < 30) recs.push({ prio: "CRÍTICO", color: "#ef4444", icon: Flame, title: "Fadiga criativa em nível crítico", desc: `Frequência média de ${R.avgFreq.toFixed(1)}×. Pause os criativos mais antigos e injete mínimo 3 novos anúncios com visuais e copy completamente diferentes.` });
    else if (fatigue < 55) recs.push({ prio: "ATENÇÃO", color: "#f59e0b", icon: AlertTriangle, title: "Frequência moderada — monitore nos próximos 2 dias", desc: "Se o CTR cair mais de 15% sem mudança de público, é sinal de fadiga iminente. Prepare variações criativas como backup." });

    if (conversion < 30) recs.push({ prio: "CRÍTICO", color: "#ef4444", icon: Target, title: "Taxa de conversão abaixo do limiar mínimo", desc: `CVR de ${(CVR * 100).toFixed(2)}% está muito abaixo da meta de 4%. Verifique landing page e alinhamento entre anúncio e oferta.` });
    else if (conversion < 55) recs.push({ prio: "ATENÇÃO", color: "#f59e0b", icon: Target, title: "Conversão abaixo da meta", desc: "CVR pode ser melhorado com testes A/B na CTA da página de destino e qualificação mais precisa da audiência." });

    if (pressure < 35) recs.push({ prio: "ATENÇÃO", color: "#f59e0b", icon: TrendingUp, title: "CPM em alta — custo de atingimento crescendo", desc: `CPM ${((cpmTrendRatio - 1) * 100).toFixed(0)}% acima do histórico. Teste novos públicos lookalike e amplie o range geográfico.` });
    if (budgetHealth < 45) recs.push({ prio: "ATENÇÃO", color: "#f59e0b", icon: DollarSign, title: "Verba mal distribuída entre campanhas", desc: "Mais de 55% do orçamento em campanhas pausadas. Redistribua para campanhas com menor CPL." });
    if (scale < 35) recs.push({ prio: "ATENÇÃO", color: "#f59e0b", icon: BarChart3, title: "Capacidade de escala subutilizada", desc: "Menos de 35% do budget diário sendo consumido. Verifique limites de lance e amplitude do público." });
    if (score >= 75 && !recs.some(r => r.prio === "CRÍTICO")) recs.push({ prio: "OPORTUNIDADE", color: "#22c55e", icon: Rocket, title: "Performance saudável — momento para escalar", desc: `Score ${score}/100. Identifique campanhas no quadrante ESCALAR do Radar e aumente o orçamento em 20–30%.` });

    return {
      score, components: { cplEfficiency, cpmTrend, fatigue, conversion, funnelHealth },
      gauges: { scale, fatigue, pressure, conversion, budgetHealth, momentum },
      radar, dailyScores, recommendations: recs.slice(0, 5), isLoading: false,
      meta: { CPL: CPL.toFixed(2), CVR: (CVR * 100).toFixed(2), avgFreq: R.avgFreq.toFixed(1), cpmTrendRatio: cpmTrendRatio.toFixed(2) },
    };
  }, [raw, isLoading, dateFrom, dateTo, accountId, campaignId]);
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────────
function CockpitPage() {
  const { score, components, gauges: g, radar, dailyScores, recommendations, isLoading, meta } = useCockpitData() as any;
  const { accountId, campaignId, adSetId, dateFrom, dateTo } = useGlobalDate();
  const [tick, setTick] = useState(0);
  useEffect(() => { const id = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(id); }, []);

  const gv = g ?? {};

  const gaugeConfig = [
    { label: "Velocímetro de Escala", sub: "Capacidade orçamentária utilizada", tooltip: "Mede o quanto do orçamento diário programado está sendo efetivamente consumido. Acima de 60% indica que a campanha está conseguindo gastar a verba. Abaixo de 30% indica gargalo de lance ou público muito restrito.", value: gv.scale ?? 0, zones: [{ from: 0, to: 0.3, color: "#ef4444" }, { from: 0.3, to: 0.6, color: "#f59e0b" }, { from: 0.6, to: 1, color: "#22c55e" }] },
    { label: "Fadiga Criativa", sub: `Frequência média ${meta?.avgFreq ?? "--"}×`, tooltip: "Indica se o público está saturado de ver os mesmos anúncios. Uma nota baixa (crítico) significa que os usuários já viram o anúncio muitas vezes. O ideal é manter a barra verde para garantir CTR saudável.", value: gv.fatigue ?? 0, zones: [{ from: 0, to: 0.3, color: "#ef4444" }, { from: 0.3, to: 0.6, color: "#f59e0b" }, { from: 0.6, to: 1, color: "#22c55e" }] },
    { label: "Pressão Competitiva", sub: `CPM vs histórico (${((meta?.cpmTrendRatio ?? 1) * 100 - 100).toFixed(0)}%)`, tooltip: "Compara o custo de atingimento atual (CPM) com o do início do período selecionado. Se a pressão for alta (crítico/vermelho), significa que o leilão do Facebook encareceu recentemente para esse público.", value: gv.pressure ?? 0, zones: [{ from: 0, to: 0.35, color: "#ef4444" }, { from: 0.35, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }] },
    { label: "Taxa de Conversão", sub: `CVR ${meta?.CVR ?? "--"}% / meta 4%`, tooltip: "Mede a capacidade das páginas de destino (Landing Pages) de transformar cliques em leads. A nota será crítica se a conversão despencar abaixo de 1.5%. Verde significa que a página está convertendo muito bem.", value: gv.conversion ?? 0, zones: [{ from: 0, to: 0.4, color: "#ef4444" }, { from: 0.4, to: 0.7, color: "#f59e0b" }, { from: 0.7, to: 1, color: "#22c55e" }] },
    { label: "Saúde Orçamentária", sub: "% verba em campanhas ativas", tooltip: "Mostra a proporção do seu investimento total que está rodando em campanhas ligadas. Se estiver baixo (vermelho), você tem muita verba locada em campanhas que estão pausadas no momento.", value: gv.budgetHealth ?? 0, zones: [{ from: 0, to: 0.4, color: "#ef4444" }, { from: 0.4, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }] },
    { label: "Momento Atual", sub: `CPL R$ ${meta?.CPL ?? "--"} | Oportunidade`, tooltip: "Calculado via Inteligência Artificial cruzando conversão, CPM e CPL. Se o momento for verde (Oportunidade), o cenário está excelente para você injetar mais orçamento (escalar).", value: gv.momentum ?? 0, zones: [{ from: 0, to: 0.35, color: "#ef4444" }, { from: 0.35, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }] },
  ];

  const criticalCount = gaugeConfig.filter(gc => gc.value < 35).length;
  const warningCount = gaugeConfig.filter(gc => gc.value >= 35 && gc.value < 65).length;

  return (
    <div className="min-h-screen w-full pb-24 bg-background text-foreground relative">
      <div className="absolute inset-0 pointer-events-none z-0" style={{ backgroundImage: "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)", backgroundSize: "60px 60px", opacity: 0.03 }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-4 space-y-5">

        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader eyebrow="Sistema Vital · Performance" title="Cockpit de Performance" description="Painel tático em tempo real — saúde, fadiga, pressão e momento da operação." compact />
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-2.5 backdrop-blur-md shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse shadow-[0_0_6px_#22c55e]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">LIVE</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">{new Date().toLocaleTimeString("pt-BR")}</div>
            {criticalCount > 0 && <div className="flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/25 px-2 py-1"><AlertTriangle className="h-3 w-3 text-red-400" /><span className="text-[9px] font-black text-red-400">{criticalCount} CRÍTICO{criticalCount > 1 ? "S" : ""}</span></div>}
            {warningCount > 0 && <div className="flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/25 px-2 py-1"><Radio className="h-3 w-3 text-amber-400" /><span className="text-[9px] font-black text-amber-400">{warningCount} ATENÇÃO</span></div>}
          </motion.div>
        </div>

        {/* ── FILTER BAR ─────────────────────────────────────────── */}
        <CockpitFilterBar />

        {/* Context summary */}
        {(accountId !== "all" || campaignId !== "all" || adSetId !== "all") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground">
            <Activity className="h-3 w-3" />
            Filtrando: {accountId !== "all" ? "conta selecionada" : "todas as contas"} · {campaignId !== "all" ? "campanha selecionada" : "todas as campanhas"} · {adSetId !== "all" ? "conjunto selecionado" : "todos os conjuntos"} · {dateFrom} → {dateTo}
          </motion.div>
        )}

        {/* ── SCORE ORB + GAUGES ─────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-6 backdrop-blur-xl shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Score de Saúde</p>
            <ScoreOrb score={score ?? 0} components={components ?? {}} isLoading={isLoading} />
            {!isLoading && dailyScores?.length > 0 && (
              <div className="w-full border-t border-border pt-4">
                <ScoreHistorico data={dailyScores} />
              </div>
            )}
          </div>
          <div>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-6 flex flex-col items-center justify-center gap-4 relative overflow-hidden" 
                    style={{ height: 200 }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 animate-pulse" />
                    <div className="w-24 h-24 rounded-full border-4 border-muted border-t-primary/20 animate-[spin_3s_linear_infinite]" />
                    <div className="flex flex-col items-center gap-2 mt-2 w-full">
                      <div className="h-2 w-24 bg-muted rounded-full animate-pulse" />
                      <div className="h-1.5 w-16 bg-muted/50 rounded-full animate-pulse" style={{ animationDelay: "150ms" }} />
                    </div>
                  </motion.div>
                ))}
              </div>
            ) : !meta ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
                <p className="text-muted-foreground text-sm font-mono">Sem dados para o período selecionado</p>
                <p className="text-muted-foreground/60 text-xs font-mono mt-1">{dateFrom} → {dateTo}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {gaugeConfig.map((gc, i) => (
                  <CockpitGauge key={gc.label} value={gc.value} max={100} label={gc.label} sub={gc.sub} unit="%" zones={gc.zones} delay={i * 0.09} tooltip={gc.tooltip} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RADAR TÁTICO ──────────────────────────────────────── */}
        {!isLoading && radar?.length > 0 && <RadarTatico data={radar} />}

        {/* ── RECOMENDAÇÕES ─────────────────────────────────────── */}
        {!isLoading && recommendations?.length > 0 && <RecomendacoesInteligentes recs={recommendations} />}

        {/* ── CALLOUTS ──────────────────────────────────────────── */}
        {!isLoading && meta && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }} className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "CPL Médio", value: `R$ ${meta.CPL}`, icon: <Target className="h-4 w-4" />, good: parseFloat(meta.CPL) < 35 },
              { label: "CVR Médio", value: `${meta.CVR}%`, icon: <TrendingUp className="h-4 w-4" />, good: parseFloat(meta.CVR) > 1.5 },
              { label: "Frequência", value: `${meta.avgFreq}×`, icon: <Activity className="h-4 w-4" />, good: parseFloat(meta.avgFreq) < 3 },
              { label: "Tendência CPM", value: `${((parseFloat(meta.cpmTrendRatio) - 1) * 100).toFixed(1)}%`, icon: <Zap className="h-4 w-4" />, good: parseFloat(meta.cpmTrendRatio) < 1 },
            ].map((item, i) => {
              const col = item.good ? "#22c55e" : "#ef4444";
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: `${col}20`, background: `${col}07` }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${col}15`, color: col }}>{item.icon}</div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{item.label}</p>
                    <p className="text-sm font-black font-mono" style={{ color: col }}>{item.value}</p>
                  </div>
                  <div className="ml-auto">{item.good ? <CheckCircle2 className="h-4 w-4 text-[#22c55e]" /> : <AlertTriangle className="h-4 w-4 text-[#ef4444] animate-pulse" />}</div>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}









