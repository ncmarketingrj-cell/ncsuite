import { createFileRoute, redirect } from "@tanstack/react-router";
import { motion, useMotionValue, animate as fmAnimate } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";
import { PageHeader } from "@/components/PageHeader";
import {
  ScatterChart, Scatter, XAxis, YAxis, ZAxis,
  CartesianGrid, Tooltip as RTip, ResponsiveContainer, Cell, ReferenceArea,
} from "recharts";
import { Activity, Zap, TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2, Radio } from "lucide-react";

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
// Arc: 135° (lower-left / 7h clock) → clockwise 270° → 45° (lower-right / 5h clock)
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
function AnimCounter({ to, decimals = 0, delay = 0 }: { to: number; decimals?: number; delay?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      let start = 0;
      const step = to / 60;
      const id = setInterval(() => {
        start = Math.min(start + step, to);
        setVal(start);
        if (start >= to) clearInterval(id);
      }, 16);
      return () => clearInterval(id);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [to, delay]);
  return <>{val.toFixed(decimals)}</>;
}

// ─── COCKPIT GAUGE ───────────────────────────────────────────────────────────────
interface Zone { from: number; to: number; color: string }

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  sub?: string;
  unit?: string;
  zones?: Zone[];
  size?: number;
  delay?: number;
  inverse?: boolean; // if true: lower = better → zones flipped
  icon?: React.ReactNode;
}

function CockpitGauge({ value, max = 100, label, sub, unit = "%", zones, size = 188, delay = 0, icon }: GaugeProps) {
  const cx = size / 2;
  const cy = size / 2 + 8;
  const R = size / 2 - 22;
  const arcLen = R * toRad(G_SWEEP);

  const pct = Math.min(Math.max(value / max, 0), 1);
  const valueSweep = pct * G_SWEEP;
  const offset = arcLen * (1 - pct);

  const zones_: Zone[] = zones ?? [
    { from: 0, to: 0.4, color: "#ef4444" },
    { from: 0.4, to: 0.7, color: "#f59e0b" },
    { from: 0.7, to: 1, color: "#22c55e" },
  ];

  const activeZone = [...zones_].reverse().find(z => pct >= z.from) ?? zones_[0];
  const glowColor = activeZone.color;

  // Needle tip
  const needleDeg = G_START + valueSweep;
  const needleTip = pt(cx, cy, R - 6, needleDeg);
  const nb1 = pt(cx, cy, 7, needleDeg + 90);
  const nb2 = pt(cx, cy, 7, needleDeg - 90);

  // Major ticks at 0, 25, 50, 75, 100%
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
      {/* Frame */}
      <div
        className="relative rounded-2xl bg-[#0a0a0f] border overflow-hidden"
        style={{
          borderColor: `${glowColor}22`,
          boxShadow: `0 0 0 1px ${glowColor}14, 0 0 32px ${glowColor}09, inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}
      >
        {/* Corner accents */}
        {[["top-2 left-2 border-t-2 border-l-2 rounded-tl-lg", ""], ["top-2 right-2 border-t-2 border-r-2 rounded-tr-lg", ""], ["bottom-2 left-2 border-b-2 border-l-2 rounded-bl-lg", ""], ["bottom-2 right-2 border-b-2 border-r-2 rounded-br-lg", ""]].map(([cls], i) => (
          <div key={i} className={`absolute w-3 h-3 opacity-30 ${cls}`} style={{ borderColor: glowColor }} />
        ))}

        {/* Scanline overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 4px)",
          mixBlendMode: "multiply",
        }} />

        {/* SVG */}
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

            {/* Background track */}
            <path d={arcD(cx, cy, R, G_START, G_SWEEP)} stroke="rgba(255,255,255,0.06)" strokeWidth={12} fill="none" strokeLinecap="round" />

            {/* Zone bands (subtle) */}
            {zones_.map((z, i) => {
              const zs = z.from * G_SWEEP;
              const ze = z.to * G_SWEEP;
              return <path key={i} d={arcD(cx, cy, R, G_START + zs, ze - zs - 1)} stroke={z.color} strokeWidth={3} fill="none" opacity={0.22} strokeLinecap="butt" />;
            })}

            {/* Value arc (animated via strokeDasharray) */}
            <motion.path
              d={arcD(cx, cy, R, G_START, G_SWEEP)}
              stroke={glowColor}
              strokeWidth={12}
              fill="none"
              strokeLinecap="round"
              filter={`url(#glow-${gid})`}
              initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
              animate={{ strokeDashoffset: offset, strokeDasharray: arcLen }}
              transition={{ duration: 1.6, delay: delay + 0.25, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Tick marks */}
            {ticks.map((t, i) => (
              <line key={i} x1={t.outer.x} y1={t.outer.y} x2={t.inner.x} y2={t.inner.y}
                stroke="rgba(255,255,255,0.35)" strokeWidth={i === 0 || i === 4 ? 2 : 1.5} strokeLinecap="round" />
            ))}

            {/* Needle */}
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 1.4, duration: 0.4 }}>
              <polygon
                points={`${needleTip.x},${needleTip.y} ${nb1.x},${nb1.y} ${nb2.x},${nb2.y}`}
                fill={glowColor}
                filter={`url(#glow2-${gid})`}
                opacity={0.95}
              />
              <circle cx={cx} cy={cy} r={7} fill="#0a0a0f" stroke={glowColor} strokeWidth={2} />
              <circle cx={cx} cy={cy} r={3} fill={glowColor} />
            </motion.g>

            {/* Center value */}
            <motion.text
              x={cx} y={cy + 26}
              textAnchor="middle"
              fill="white"
              fontSize={size * 0.13}
              fontWeight="900"
              fontFamily="'Courier New', monospace"
              letterSpacing="-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.6 }}
            >
              {Math.round(value)}{unit}
            </motion.text>
          </svg>
        </div>

        {/* Label */}
        <div className="px-3 pb-4 text-center -mt-2">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/50">{label}</p>
          {sub && <p className="text-[8px] text-white/25 mt-0.5 tracking-wider">{sub}</p>}
        </div>

        {/* Status bar at bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5" style={{ background: `linear-gradient(90deg, transparent, ${glowColor}60, transparent)` }} />
      </div>
    </motion.div>
  );
}

// ─── SCORE ORB ───────────────────────────────────────────────────────────────────
function ScoreOrb({ score, components, isLoading }: { score: number; components: Record<string, number>; isLoading: boolean }) {
  const S = 260;
  const cx = S / 2;
  const cy = S / 2 + 8;
  const R = S / 2 - 24;
  const arcLen = R * toRad(G_SWEEP);
  const pct = score / 100;
  const offset = arcLen * (1 - pct);

  const color = score >= 80 ? "#22c55e" : score >= 55 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "Excelente" : score >= 55 ? "Atenção" : "Crítico";

  const comps = [
    { key: "cplEfficiency", label: "Efic. CPL", weight: "25%" },
    { key: "cpmTrend", label: "Tend. CPM", weight: "15%" },
    { key: "fatigue", label: "Fadiga", weight: "20%" },
    { key: "conversion", label: "Conversão", weight: "20%" },
    { key: "funnelHealth", label: "Funil", weight: "20%" },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.7, type: "spring", stiffness: 80 }}
      className="flex flex-col items-center gap-6"
    >
      {/* Orb */}
      <div className="relative">
        <svg width={S} height={S * 0.82} viewBox={`0 0 ${S} ${S * 0.92}`}>
          <defs>
            <filter id="orb-glow">
              <feGaussianBlur stdDeviation="8" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="orb-glow2">
              <feGaussianBlur stdDeviation="14" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Outer decorative ring */}
          {[...Array(36)].map((_, i) => {
            const deg = G_START + (i / 36) * G_SWEEP;
            const outer = pt(cx, cy, R + 22, deg);
            const size = i % 6 === 0 ? 3 : 1.5;
            return <circle key={i} cx={outer.x} cy={outer.y} r={size} fill="rgba(255,255,255,0.15)" />;
          })}

          {/* Track */}
          <path d={arcD(cx, cy, R, G_START, G_SWEEP)} stroke="rgba(255,255,255,0.07)" strokeWidth={16} fill="none" strokeLinecap="round" />

          {/* Zone bands */}
          {[
            { from: 0, sw: 0.4 * G_SWEEP, color: "#ef4444" },
            { from: 0.4 * G_SWEEP, sw: 0.3 * G_SWEEP, color: "#f59e0b" },
            { from: 0.7 * G_SWEEP, sw: 0.3 * G_SWEEP - 1, color: "#22c55e" },
          ].map((z, i) => (
            <path key={i} d={arcD(cx, cy, R, G_START + z.from, z.sw)} stroke={z.color} strokeWidth={4} fill="none" opacity={0.25} strokeLinecap="butt" />
          ))}

          {/* Value arc */}
          <motion.path
            d={arcD(cx, cy, R, G_START, G_SWEEP)}
            stroke={color}
            strokeWidth={16}
            fill="none"
            strokeLinecap="round"
            filter="url(#orb-glow)"
            initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
            animate={{ strokeDashoffset: isLoading ? arcLen : offset, strokeDasharray: arcLen }}
            transition={{ duration: 2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Score */}
          <motion.text x={cx} y={cy + 2} textAnchor="middle" fill="white" fontSize={60} fontWeight="900"
            fontFamily="'Courier New', monospace" letterSpacing="-3"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            {isLoading ? "--" : <AnimCounter to={score} delay={0.5} />}
          </motion.text>

          <motion.text x={cx} y={cy + 26} textAnchor="middle" fill={color} fontSize={11} fontWeight="800"
            fontFamily="monospace" letterSpacing="3" textDecoration="none"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}>
            {label.toUpperCase()}
          </motion.text>
        </svg>

        {/* Glow halo */}
        <div className="absolute inset-0 pointer-events-none rounded-full" style={{
          background: `radial-gradient(ellipse at center bottom, ${color}12 0%, transparent 65%)`,
        }} />
      </div>

      {/* Component breakdown */}
      <div className="grid grid-cols-5 gap-2 w-full max-w-lg">
        {comps.map((c, i) => {
          const v = components[c.key] ?? 0;
          const col = v >= 70 ? "#22c55e" : v >= 45 ? "#f59e0b" : "#ef4444";
          return (
            <motion.div key={c.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.2 + i * 0.08 }}
              className="flex flex-col items-center gap-1 rounded-xl border p-2"
              style={{ borderColor: `${col}25`, background: `${col}08` }}
            >
              <span className="text-[8px] font-black uppercase tracking-widest" style={{ color: col }}>
                {c.label}
              </span>
              <span className="text-xs font-black font-mono text-white">{Math.round(v)}</span>
              <div className="w-full h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: col }}
                  initial={{ width: 0 }} animate={{ width: `${v}%` }}
                  transition={{ duration: 1, delay: 1.4 + i * 0.08, ease: "easeOut" }}
                />
              </div>
              <span className="text-[7px] text-white/25 font-mono">{c.weight}</span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── RADAR TÁTICO ────────────────────────────────────────────────────────────────
const RADAR_COLORS: Record<string, string> = {
  up: "#22c55e", down: "#ef4444", stable: "#f59e0b",
};

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
  const midCPL = maxCPL / 2;
  const midLeads = maxLeads / 2;

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.8 }}
      className="relative rounded-2xl border border-white/[0.06] bg-[#0a0a0f] overflow-hidden p-6"
    >
      {/* Grid overlay */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-6">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-white">Radar Tático</h3>
          <p className="text-[10px] text-white/30 mt-0.5 tracking-widest uppercase">CPL × Volume — Posicione campanhas no quadrante certo</p>
        </div>
        <div className="flex items-center gap-4 text-[9px] font-black uppercase tracking-wider">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#22c55e]" />Crescendo</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#f59e0b]" />Estável</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#ef4444]" />Caindo</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-white/20" />= Gasto</span>
        </div>
      </div>

      {/* Chart */}
      <div className="relative h-[340px]">
        {/* Quadrant labels */}
        <div className="absolute top-4 left-[8%] text-[9px] font-black uppercase tracking-widest text-[#22c55e]/50 pointer-events-none z-10">
          ↑ ESCALAR
        </div>
        <div className="absolute top-4 right-[8%] text-[9px] font-black uppercase tracking-widest text-[#f59e0b]/50 pointer-events-none z-10">
          ANALISAR ↑
        </div>
        <div className="absolute bottom-8 left-[8%] text-[9px] font-black uppercase tracking-widest text-[#f59e0b]/50 pointer-events-none z-10">
          ↓ NICHO
        </div>
        <div className="absolute bottom-8 right-[8%] text-[9px] font-black uppercase tracking-widest text-[#ef4444]/50 pointer-events-none z-10">
          PAUSAR ↓
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 30, bottom: 20, left: 10 }}>
            {/* Quadrant backgrounds */}
            <ReferenceArea x1={0} x2={midCPL} y1={midLeads} y2={maxLeads * 1.1} fill="#22c55e" fillOpacity={0.04} />
            <ReferenceArea x1={midCPL} x2={maxCPL * 1.1} y1={midLeads} y2={maxLeads * 1.1} fill="#f59e0b" fillOpacity={0.04} />
            <ReferenceArea x1={0} x2={midCPL} y1={0} y2={midLeads} fill="#f59e0b" fillOpacity={0.03} />
            <ReferenceArea x1={midCPL} x2={maxCPL * 1.1} y1={0} y2={midLeads} fill="#ef4444" fillOpacity={0.04} />

            <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.04)" />
            <XAxis
              dataKey="cpl"
              type="number"
              name="CPL"
              unit=" R$"
              domain={[0, "auto"]}
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontWeight: 700 }}
              label={{ value: "← CPL (menor = melhor)", position: "insideBottom", offset: -10, fontSize: 8, fill: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}
            />
            <YAxis
              dataKey="leads"
              type="number"
              name="Leads"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)", fontFamily: "monospace", fontWeight: 700 }}
              label={{ value: "Leads ↑", angle: -90, position: "insideLeft", offset: 10, fontSize: 8, fill: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}
            />
            <ZAxis dataKey="spend" range={[200, 2400]} name="Gasto" />
            <RTip
              cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }}
              contentStyle={{
                background: "rgba(10,10,15,0.97)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 12,
                fontSize: 11,
                fontFamily: "monospace",
              }}
              formatter={(v: any, name: string) => {
                if (name === "CPL") return [`R$ ${Number(v).toFixed(2)}`, "CPL"];
                if (name === "Gasto") return [`R$ ${Number(v).toFixed(2)}`, "Gasto"];
                return [v, name];
              }}
            />
            <Scatter data={data} shape={<CustomDot />}>
              {data.map((d, i) => (
                <Cell key={i} fill={RADAR_COLORS[d.trend] ?? "#9b87f5"} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

// ─── DATA HOOK ───────────────────────────────────────────────────────────────────
function useCockpitData() {
  const today = new Date();
  const d7 = format(subDays(today, 7), "yyyy-MM-dd");
  const d14 = format(subDays(today, 14), "yyyy-MM-dd");
  const todayStr = format(today, "yyyy-MM-dd");

  const { data: raw, isLoading } = useQuery({
    queryKey: ["cockpit-raw"],
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("metrics")
        .select(`campaign_id, cost, conversions, impressions, clicks, reach, cpm, frequency, date,
                 campaigns!inner(id, name, status, daily_budget, ad_account_id)`)
        .gte("date", d14)
        .lte("date", todayStr);
      return (data as any[]) ?? [];
    },
  });

  return useMemo(() => {
    if (!raw || !raw.length) return { score: 0, components: {}, gauges: {}, radar: [], isLoading };

    const recent = raw.filter((r: any) => r.date >= d7);
    const prior = raw.filter((r: any) => r.date < d7);

    // Aggregate totals (recent)
    let totalCost = 0, totalConversions = 0, totalClicks = 0, totalImpressions = 0;
    let totalFrequency = 0, freqCount = 0, totalCPM = 0, cpmCount = 0;

    const campMap: Record<string, { name: string; cost: number; conversions: number; clicks: number; leads: number; impressions: number; budget: number; status: string; cpms: number[] }> = {};

    for (const r of recent) {
      totalCost += r.cost ?? 0;
      totalConversions += r.conversions ?? 0;
      totalClicks += r.clicks ?? 0;
      totalImpressions += r.impressions ?? 0;
      if (r.frequency) { totalFrequency += r.frequency; freqCount++; }
      if (r.cpm) { totalCPM += r.cpm; cpmCount++; }

      const cid = r.campaign_id;
      if (!campMap[cid]) {
        campMap[cid] = { name: r.campaigns?.name ?? cid, cost: 0, conversions: 0, clicks: 0, leads: 0, impressions: 0, budget: r.campaigns?.daily_budget ?? 0, status: r.campaigns?.status ?? "UNKNOWN", cpms: [] };
      }
      campMap[cid].cost += r.cost ?? 0;
      campMap[cid].conversions += r.conversions ?? 0;
      campMap[cid].clicks += r.clicks ?? 0;
      campMap[cid].impressions += r.impressions ?? 0;
      if (r.cpm) campMap[cid].cpms.push(r.cpm);
    }

    // Prior CPM for trend
    let priorCPM = 0, priorCount = 0;
    for (const r of prior) {
      if (r.cpm) { priorCPM += r.cpm; priorCount++; }
    }

    const avgCPM = cpmCount > 0 ? totalCPM / cpmCount : 0;
    const avgPriorCPM = priorCount > 0 ? priorCPM / priorCount : avgCPM;
    const cpmTrendRatio = avgPriorCPM > 0 ? avgCPM / avgPriorCPM : 1; // <1 = CPM fell (good)

    const avgFreq = freqCount > 0 ? totalFrequency / freqCount : 0;
    const CVR = totalClicks > 0 ? totalConversions / totalClicks : 0;
    const CPL = totalConversions > 0 ? totalCost / totalConversions : 0;
    const TARGET_CPL = 35; // R$ benchmark automotivo

    // ── Component scores (0-100) ─────────────────────────────────────────────────
    const cplEfficiency = CPL > 0 ? Math.min(100, (TARGET_CPL / CPL) * 100) : 40;
    const cpmTrend = Math.min(100, Math.max(0, (2 - cpmTrendRatio) * 100)); // <1 = fell = good
    const fatigue = Math.max(0, 100 - Math.min(100, (avgFreq / 4) * 100));
    const conversion = Math.min(100, (CVR / 0.04) * 100); // 4% CVR = 100
    const funnelHealth = Math.min(100, totalClicks > 0 && totalImpressions > 0 ? (totalClicks / totalImpressions) * 1000 : 50);

    // Weighted score
    const score = Math.round(
      cplEfficiency * 0.25 +
      cpmTrend * 0.15 +
      fatigue * 0.20 +
      conversion * 0.20 +
      funnelHealth * 0.20
    );

    // ── Gauges ───────────────────────────────────────────────────────────────────
    const camps = Object.values(campMap);
    const activeCamps = camps.filter(c => c.cost > 0);
    const totalBudget = camps.reduce((s, c) => s + c.budget, 0);
    const activeBudget = activeCamps.reduce((s, c) => s + c.budget, 0);

    const scale = totalBudget > 0 ? Math.min(100, (totalCost / 7 / (totalBudget || 1)) * 100) : 50;
    const pressure = Math.min(100, Math.max(0, (2 - cpmTrendRatio) * 100));
    const budgetHealth = totalBudget > 0 ? Math.min(100, (activeBudget / totalBudget) * 100) : 50;
    const momentum = Math.min(100, Math.max(0, pressure * 0.5 + conversion * 0.3 + (100 - Math.min(100, avgFreq * 20)) * 0.2));

    // ── Radar data ───────────────────────────────────────────────────────────────
    const radar = camps
      .filter(c => c.cost > 1 || c.conversions > 0)
      .map(c => {
        const campCPL = c.conversions > 0 ? c.cost / c.conversions : CPL * 1.5;
        const avgCampCPM = c.cpms.length > 0 ? c.cpms.reduce((a, b) => a + b, 0) / c.cpms.length : 0;
        const trend = avgCampCPM < avgCPM * 0.85 ? "up" : avgCampCPM > avgCPM * 1.15 ? "down" : "stable";
        return {
          id: c.name,
          name: c.name,
          cpl: Number(campCPL.toFixed(2)),
          leads: c.conversions,
          spend: Number(c.cost.toFixed(2)),
          trend,
        };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 16);

    return {
      score,
      components: { cplEfficiency, cpmTrend, fatigue, conversion, funnelHealth },
      gauges: { scale, fatigue, pressure, conversion, budgetHealth, momentum, avgFreq, CPL, CVR },
      radar,
      isLoading: false,
      meta: { CPL: CPL.toFixed(2), CVR: (CVR * 100).toFixed(2), avgFreq: avgFreq.toFixed(1), cpmTrendRatio: cpmTrendRatio.toFixed(2) },
    };
  }, [raw, d7, isLoading]);
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────────
function CockpitPage() {
  const { score, components, gauges: g, radar, isLoading, meta } = useCockpitData() as any;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const gv = g ?? {};

  const gaugeConfig = [
    {
      label: "Velocímetro de Escala",
      sub: "Capacidade orçamentária utilizada",
      value: gv.scale ?? 0,
      zones: [{ from: 0, to: 0.3, color: "#ef4444" }, { from: 0.3, to: 0.6, color: "#f59e0b" }, { from: 0.6, to: 1, color: "#22c55e" }],
    },
    {
      label: "Fadiga Criativa",
      sub: `Frequência média ${meta?.avgFreq ?? "--"}×`,
      value: gv.fatigue ?? 0,
      zones: [{ from: 0, to: 0.3, color: "#ef4444" }, { from: 0.3, to: 0.6, color: "#f59e0b" }, { from: 0.6, to: 1, color: "#22c55e" }],
    },
    {
      label: "Pressão Competitiva",
      sub: `CPM vs histórico (${((meta?.cpmTrendRatio ?? 1) * 100 - 100).toFixed(0)}%)`,
      value: gv.pressure ?? 0,
      zones: [{ from: 0, to: 0.35, color: "#ef4444" }, { from: 0.35, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }],
    },
    {
      label: "Taxa de Conversão",
      sub: `CVR ${meta?.CVR ?? "--"}% / meta 4%`,
      value: gv.conversion ?? 0,
      zones: [{ from: 0, to: 0.4, color: "#ef4444" }, { from: 0.4, to: 0.7, color: "#f59e0b" }, { from: 0.7, to: 1, color: "#22c55e" }],
    },
    {
      label: "Saúde Orçamentária",
      sub: "% verba em campanhas ativas",
      value: gv.budgetHealth ?? 0,
      zones: [{ from: 0, to: 0.4, color: "#ef4444" }, { from: 0.4, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }],
    },
    {
      label: "Momento Atual",
      sub: `CPL R$ ${meta?.CPL ?? "--"} | Oportunidade`,
      value: gv.momentum ?? 0,
      zones: [{ from: 0, to: 0.35, color: "#ef4444" }, { from: 0.35, to: 0.65, color: "#f59e0b" }, { from: 0.65, to: 1, color: "#22c55e" }],
    },
  ];

  const criticalCount = gaugeConfig.filter(gc => gc.value < 35).length;
  const warningCount = gaugeConfig.filter(gc => gc.value >= 35 && gc.value < 65).length;

  return (
    <div className="min-h-screen w-full pb-24" style={{
      background: "radial-gradient(ellipse at top, #0d0d18 0%, #030307 60%)",
    }}>
      {/* Ambient grid */}
      <div className="fixed inset-0 pointer-events-none z-0" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-4 space-y-8">

        {/* ── HEADER ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between">
          <div>
            <PageHeader
              eyebrow="Sistema Vital · Performance"
              title="Cockpit de Performance"
              description="Painel tático em tempo real — saúde, fadiga, pressão e momento da operação."
              compact
            />
          </div>

          {/* Live status strip */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-4 rounded-xl border border-white/[0.07] bg-black/60 px-4 py-2.5 backdrop-blur-md"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse shadow-[0_0_6px_#22c55e]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">LIVE</span>
            </div>
            <div className="text-[10px] font-mono text-white/30">
              {new Date().toLocaleTimeString("pt-BR")}
            </div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/25 px-2 py-1">
                <AlertTriangle className="h-3 w-3 text-red-400" />
                <span className="text-[9px] font-black text-red-400">{criticalCount} CRÍTICO{criticalCount > 1 ? "S" : ""}</span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/25 px-2 py-1">
                <Radio className="h-3 w-3 text-amber-400" />
                <span className="text-[9px] font-black text-amber-400">{warningCount} ATENÇÃO</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── SCORE ORB + GAUGES ──────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-8 items-start">

          {/* Score orb — left col */}
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/[0.06] bg-[#080810]/80 p-6 backdrop-blur-xl">
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-white/30 mb-2">Score de Saúde</p>
            <ScoreOrb score={score ?? 0} components={components ?? {}} isLoading={isLoading} />
          </div>

          {/* 6 gauges — right col */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {gaugeConfig.map((gc, i) => (
                <CockpitGauge
                  key={gc.label}
                  value={isLoading ? 0 : gc.value}
                  max={100}
                  label={gc.label}
                  sub={gc.sub}
                  unit="%"
                  zones={gc.zones}
                  delay={i * 0.09}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ── RADAR TÁTICO ──────────────────────────────────────────── */}
        {!isLoading && radar?.length > 0 && <RadarTatico data={radar} />}

        {/* ── CALLOUTS ──────────────────────────────────────────────── */}
        {!isLoading && meta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {[
              { label: "CPL Médio", value: `R$ ${meta.CPL}`, icon: <Target className="h-4 w-4" />, good: parseFloat(meta.CPL) < 35 },
              { label: "CVR Médio", value: `${meta.CVR}%`, icon: <TrendingUp className="h-4 w-4" />, good: parseFloat(meta.CVR) > 1.5 },
              { label: "Frequência", value: `${meta.avgFreq}×`, icon: <Activity className="h-4 w-4" />, good: parseFloat(meta.avgFreq) < 3 },
              { label: "Tendência CPM", value: `${((parseFloat(meta.cpmTrendRatio) - 1) * 100).toFixed(1)}%`, icon: <Zap className="h-4 w-4" />, good: parseFloat(meta.cpmTrendRatio) < 1 },
            ].map((item, i) => {
              const col = item.good ? "#22c55e" : "#ef4444";
              return (
                <div key={i} className="flex items-center gap-3 rounded-xl border p-3.5" style={{ borderColor: `${col}20`, background: `${col}07` }}>
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${col}15`, color: col }}>
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{item.label}</p>
                    <p className="text-sm font-black font-mono" style={{ color: col }}>{item.value}</p>
                  </div>
                  <div className="ml-auto">
                    {item.good
                      ? <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
                      : <AlertTriangle className="h-4 w-4 text-[#ef4444] animate-pulse" />}
                  </div>
                </div>
              );
            })}
          </motion.div>
        )}
      </div>
    </div>
  );
}
