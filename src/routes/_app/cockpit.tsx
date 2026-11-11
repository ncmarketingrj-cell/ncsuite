import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { subDays, format, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useGlobalDate, type Period } from "@/contexts/DateContext";
import {
  AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import {
  Activity, Zap, TrendingUp, TrendingDown, Target, AlertTriangle, CheckCircle2,
  Radio, Rocket, DollarSign, BarChart3, Flame, ArrowUpRight, ArrowDownRight,
  ChevronDown, RotateCcw, X, Info, Eye, MousePointerClick, ShieldCheck, Compass,
  MessageCircle, PhoneCall, Users, AlertOctagon,
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

// ─── CLASSIFICAÇÃO DE OBJETIVOS (SEPARA COMPRADORES DE CLIQUES) ────────────────
export function classifyCampaignType(
  campName = "",
  resultType = "",
  metaObjective = ""
): {
  isLead: boolean;
  typeLabel: string;
  metricType: "MENSAGEM" | "CADASTRO" | "CLIQUES" | "ENGAJAMENTO" | "ALCANCE" | "OUTRO";
} {
  const name = (campName || "").toLowerCase();
  const rt = (resultType || "").toLowerCase();
  const obj = (metaObjective || "").toUpperCase();

  // 1. Conversas por Mensagem / WhatsApp / Direct (Compradores Reais da Loja)
  if (
    rt.includes("conversa") ||
    rt.includes("mensagem") ||
    rt.includes("messaging") ||
    rt.includes("whatsapp") ||
    rt.includes("direct") ||
    obj === "MESSAGES" ||
    name.includes("mensagem") ||
    name.includes("mensagens") ||
    name.includes("whatsapp") ||
    name.includes("wpp") ||
    name.includes("msg") ||
    name.includes("conversa") ||
    name.includes("vendedores") ||
    name.includes("atendimento") ||
    name.includes("grupo de vendedores")
  ) {
    return { isLead: true, typeLabel: "Conversas no WhatsApp", metricType: "MENSAGEM" };
  }

  // 2. Cadastros / Leads (Formulários Instantâneos)
  if (
    rt.includes("cadastro") ||
    rt.includes("lead") ||
    name.includes("formulario") ||
    name.includes("formulário") ||
    name.includes("cadastro") ||
    obj === "OUTCOME_LEADS" ||
    obj === "LEAD_GENERATION"
  ) {
    return { isLead: true, typeLabel: "Cadastros / Formulários", metricType: "CADASTRO" };
  }

  // 3. Consignado / Compra de Veículos
  if (
    rt.includes("consignado") ||
    name.includes("consignado") ||
    name.includes("compramos seu carro") ||
    name.includes("avaliacao") ||
    name.includes("avaliação")
  ) {
    return { isLead: true, typeLabel: "Leads Consignado", metricType: "CADASTRO" };
  }

  // 4. Tráfego / Cliques no link (Visitantes - NÃO são leads nem conversas!)
  if (
    rt.includes("clique") ||
    rt.includes("link_click") ||
    name.includes("trafego") ||
    name.includes("tráfego") ||
    obj === "OUTCOME_TRAFFIC" ||
    obj === "LINK_CLICKS"
  ) {
    return { isLead: false, typeLabel: "Cliques no Link (Tráfego)", metricType: "CLIQUES" };
  }

  // 5. Visitas ao Perfil / Instagram / Engajamento
  if (
    rt.includes("perfil") ||
    name.includes("visita ao perfil") ||
    name.includes("post do instagram") ||
    name.includes("| insta") ||
    name.endsWith("insta")
  ) {
    return { isLead: false, typeLabel: "Visitas ao Perfil do IG", metricType: "ENGAJAMENTO" };
  }

  // 6. Vídeo / Alcance / Reconhecimento
  if (rt.includes("thruplay") || rt.includes("video") || obj === "VIDEO_VIEWS") {
    return { isLead: false, typeLabel: "Visualizações de Vídeo", metricType: "ALCANCE" };
  }

  if (rt.includes("alcance") || obj === "OUTCOME_AWARENESS") {
    return { isLead: false, typeLabel: "Alcance / Marca", metricType: "ALCANCE" };
  }

  // Fallback automotivo: se campanha tem "carro/veiculo/estoque" no nome
  if (name.includes("veiculo") || name.includes("carro") || name.includes("estoque")) {
    return { isLead: true, typeLabel: "Mensagens nos Veículos", metricType: "MENSAGEM" };
  }

  return { isLead: false, typeLabel: "Tráfego Geral", metricType: "OUTRO" };
}

// ─── SVG GAUGE MATH ─────────────────────────────────────────────────────────────
const G_START = 140; // Ângulo inicial (inferior esquerdo)
const G_SWEEP = 260; // Arco total de varredura
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
      const target = Math.max(0, to);
      const step = Math.max(target / 45, 0.5);
      const id = setInterval(() => {
        s = Math.min(s + step, target);
        setVal(s);
        if (s >= target) clearInterval(id);
      }, 16);
      return () => clearInterval(id);
    }, delay * 1000);
    return () => clearTimeout(t);
  }, [to, delay]);
  return <>{Math.round(val)}</>;
}

// ─── DIDACTIC TELEMETRY BRIEFING INTERFACES ──────────────────────────────────────
export interface GaugeBenchmark {
  bad: string;
  mid: string;
  good: string;
}

export interface GaugeTelemetryInfo {
  category: string;
  icon: any;
  what: string;
  formula: string;
  benchmark: GaugeBenchmark;
  actionGood: string;
  actionMid: string;
  actionBad: string;
}

interface Zone { from: number; to: number; color: string }

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  techLabel?: string;
  sub?: string;
  unit?: string;
  zones?: Zone[];
  size?: number;
  delay?: number;
  textValue?: string;
  decisionBadge?: { label: string; color: string };
  info?: GaugeTelemetryInfo;
  alignTooltip?: "left" | "center" | "right";
}

// ─── COCKPIT GAUGE (AUTOMOTIVE SUPERCAR HUD DIAL) ────────────────────────────────
function CockpitGauge({
  value,
  max = 100,
  label,
  techLabel,
  sub,
  unit = "%",
  zones,
  size = 196,
  delay = 0,
  textValue,
  decisionBadge,
  info,
  alignTooltip = "center",
}: GaugeProps) {
  const cx = size / 2;
  const cy = 76;
  const R = 54;
  const arcLen = R * toRad(G_SWEEP);

  const pct = Math.min(Math.max(value / max, 0), 1);
  const valueSweep = pct * G_SWEEP;
  const offset = arcLen * (1 - pct);

  const zones_ = zones ?? [
    { from: 0, to: 0.35, color: "#ef4444" },
    { from: 0.35, to: 0.70, color: "#f59e0b" },
    { from: 0.70, to: 1.0, color: "#22c55e" },
  ];

  const activeZone = [...zones_].reverse().find(z => pct >= z.from) ?? zones_[0];
  const glowColor = activeZone.color;
  const needleDeg = G_START + valueSweep;
  const gid = label.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase();

  // Status diagnosis text
  const statusLabel =
    pct >= 0.70 ? "EXCELENTE" : pct >= 0.35 ? "ATENÇÃO" : "CRÍTICO";
  const currentAction =
    pct >= 0.70
      ? info?.actionGood ?? "Desempenho excelente. Mantenha os parâmetros vigentes."
      : pct >= 0.35
      ? info?.actionMid ?? "Desempenho moderado. Monitore de perto e aplique ajustes pontuais."
      : info?.actionBad ?? "Abaixo do limiar ideal. Execute a ação corretiva imediatamente.";

  // Graduations
  const majorTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const deg = G_START + f * G_SWEEP;
    return {
      outer: pt(cx, cy, R + 6, deg),
      inner: pt(cx, cy, R + 14, deg),
      f,
    };
  });

  const minorTicks = [...Array(17)].map((_, i) => {
    if (i % 4 === 0) return null;
    const deg = G_START + (i / 16) * G_SWEEP;
    return {
      outer: pt(cx, cy, R + 6, deg),
      inner: pt(cx, cy, R + 10, deg),
    };
  }).filter(Boolean) as { outer: { x: number; y: number }; inner: { x: number; y: number } }[];

  // Tooltip positioning
  const tooltipPosCls =
    alignTooltip === "left"
      ? "left-0 sm:left-2"
      : alignTooltip === "right"
      ? "right-0 sm:right-2"
      : "left-1/2 -translate-x-1/2";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, type: "spring", stiffness: 130, damping: 20 }}
      className="relative group/gauge flex flex-col"
    >
      {/* ── CARD SHELL ──────────────────────────────────────────────────────── */}
      <div
        className="relative rounded-2xl bg-card border border-border p-3.5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg"
        style={{
          boxShadow: `0 0 0 1px ${glowColor}15, 0 10px 25px -5px ${glowColor}08`,
          borderColor: `${glowColor}25`,
        }}
      >
        {/* Corner Decals */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t border-l opacity-30" style={{ borderColor: glowColor }} />
          <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t border-r opacity-30" style={{ borderColor: glowColor }} />
          <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l opacity-30" style={{ borderColor: glowColor }} />
          <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r opacity-30" style={{ borderColor: glowColor }} />
        </div>

        {/* ── UPPER ZONE: DIAL SVG ───────────────────────────────────────────── */}
        <div className="flex justify-center relative select-none">
          <svg
            width={size}
            height={116}
            viewBox={`0 0 ${size} 122`}
            className="overflow-visible block"
          >
            <defs>
              <filter id={`needle-glow-${gid}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id={`arc-glow-${gid}`} x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Dark background groove */}
            <path
              d={arcD(cx, cy, R, G_START, G_SWEEP)}
              stroke="rgba(120,120,130,0.14)"
              strokeWidth={9}
              fill="none"
              strokeLinecap="round"
            />

            {/* Inactive zone outlines */}
            {zones_.map((z, i) => {
              const zs = z.from * G_SWEEP;
              const ze = z.to * G_SWEEP;
              return (
                <path
                  key={i}
                  d={arcD(cx, cy, R, G_START + zs, ze - zs - 1.5)}
                  stroke={z.color}
                  strokeWidth={2.5}
                  fill="none"
                  opacity={0.25}
                  strokeLinecap="butt"
                />
              );
            })}

            {/* Active glowing filled arc with spring reveal */}
            <motion.path
              d={arcD(cx, cy, R, G_START, G_SWEEP)}
              stroke={glowColor}
              strokeWidth={8}
              fill="none"
              strokeLinecap="round"
              filter={`url(#arc-glow-${gid})`}
              initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
              animate={{ strokeDashoffset: offset, strokeDasharray: arcLen }}
              transition={{ duration: 1.4, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Minor Ticks */}
            {minorTicks.map((t, i) => (
              <line
                key={`m-${i}`}
                x1={t.outer.x}
                y1={t.outer.y}
                x2={t.inner.x}
                y2={t.inner.y}
                stroke="currentColor"
                className="text-muted-foreground/35"
                strokeWidth={1}
                strokeLinecap="round"
              />
            ))}

            {/* Major Ticks */}
            {majorTicks.map((t, i) => (
              <line
                key={`M-${i}`}
                x1={t.outer.x}
                y1={t.outer.y}
                x2={t.inner.x}
                y2={t.inner.y}
                stroke={i === 0 || i === 4 ? glowColor : "currentColor"}
                className={i === 0 || i === 4 ? "" : "text-muted-foreground/70"}
                strokeWidth={i === 0 || i === 4 ? 2 : 1.5}
                strokeLinecap="round"
              />
            ))}

            {/* ── DYNAMIC NEEDLE (SERVO MOTOR SPRING SWEEP) ──────────────────── */}
            <motion.g
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              initial={{ rotate: G_START - 270 }}
              animate={{ rotate: needleDeg - 270 }}
              transition={{
                type: "spring",
                stiffness: 52,
                damping: 12,
                mass: 0.75,
                delay: delay + 0.1,
              }}
            >
              {/* Needle Blade */}
              <path
                d={`M ${cx - 2.8} ${cy + 6} L ${cx} ${cy - (R - 5)} L ${cx + 2.8} ${cy + 6} Z`}
                fill={glowColor}
                filter={`url(#needle-glow-${gid})`}
                opacity={0.95}
              />
              {/* White Needle Spine for high-speed laser appearance */}
              <line
                x1={cx}
                y1={cy + 4}
                x2={cx}
                y2={cy - (R - 6)}
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle cx={cx} cy={cy + 8} r={2.5} fill="currentColor" className="text-muted-foreground/40" />
            </motion.g>

            {/* Multi-layered Gunmetal Hub Cap with Colored Ruby Core */}
            <circle cx={cx} cy={cy} r={9} fill="currentColor" className="text-card" stroke={glowColor} strokeWidth={2} />
            <circle cx={cx} cy={cy} r={5.5} fill="currentColor" className="text-muted" />
            <circle cx={cx} cy={cy} r={2.5} fill={glowColor} />
          </svg>
        </div>

        {/* ── LOWER ZONE: HUD DIGITAL READOUT BOX (ZERO OVERLAPS) ─────────────── */}
        <div className="mt-2 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/70 flex flex-col items-center justify-center text-center shadow-inner relative z-10">
          <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-foreground leading-none">
            {textValue ?? `${Math.round(value)}${unit}`}
          </span>

          {/* Nome Didático Principal em Destaque */}
          <div className="flex items-center justify-center gap-1.5 mt-2 w-full">
            <span className="w-1.5 h-1.5 rounded-full shrink-0 animate-pulse" style={{ backgroundColor: glowColor }} />
            <p className="text-[11px] font-black uppercase tracking-wider text-foreground truncate max-w-[155px]">
              {label}
            </p>
            {info && (
              <Info className="h-3 w-3 text-muted-foreground/60 hover:text-foreground shrink-0 cursor-help transition-colors" />
            )}
          </div>

          {/* Nome Técnico (Sub) */}
          {techLabel && (
            <span className="text-[8px] font-mono font-bold tracking-widest uppercase text-muted-foreground/80 mt-0.5">
              {techLabel}
            </span>
          )}

          {/* Tomada de Decisão / Subtítulo */}
          {decisionBadge ? (
            <span
              className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full mt-1.5 tracking-wider truncate max-w-[160px]"
              style={{
                backgroundColor: `${decisionBadge.color}15`,
                color: decisionBadge.color,
                border: `1px solid ${decisionBadge.color}30`,
              }}
            >
              {decisionBadge.label}
            </span>
          ) : sub ? (
            <p className="text-[9px] font-medium text-muted-foreground/85 mt-1 tracking-wide truncate max-w-[160px]">
              {sub}
            </p>
          ) : null}
        </div>

        {/* Dynamic bottom accent line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${glowColor}80, transparent)` }}
        />
      </div>

      {/* ── TELEMETRY EXPLANATORY BALLOON (ON HOVER) ────────────────────────── */}
      {info && (
        <div
          className={`absolute bottom-[calc(100%+10px)] ${tooltipPosCls} w-80 p-4 rounded-2xl bg-zinc-950/98 text-zinc-100 border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl opacity-0 group-hover/gauge:opacity-100 group-hover/gauge:translate-y-0 translate-y-2 pointer-events-none transition-all duration-200 z-[999] text-left`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${glowColor}25`, border: `1px solid ${glowColor}40` }}
              >
                <info.icon className="h-4 w-4" style={{ color: glowColor }} />
              </div>
              <div className="min-w-0">
                <span className="text-[8px] font-black tracking-widest uppercase text-zinc-400 block">
                  {info.category}
                </span>
                <span className="text-xs font-black tracking-wider text-white uppercase truncate block">
                  {label}
                </span>
              </div>
            </div>
            <span
              className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0"
              style={{
                borderColor: `${glowColor}60`,
                color: glowColor,
                backgroundColor: `${glowColor}15`,
              }}
            >
              {statusLabel}
            </span>
          </div>

          {/* Body Content */}
          <div className="space-y-2.5 text-[10px] leading-relaxed text-zinc-300">
            {/* O Que Mede em Palavras Simples */}
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block mb-0.5">
                O QUE SIGNIFICA NA PRÁTICA
              </span>
              <p className="text-[10px] text-zinc-300 leading-snug">{info.what}</p>
            </div>

            {/* Fórmula */}
            <div className="p-2 rounded-lg bg-white/5 border border-white/10 font-mono text-[9px] text-zinc-300 flex items-center justify-between">
              <span className="text-[8px] font-black text-zinc-400 uppercase">FÓRMULA MATEMÁTICA:</span>
              <span className="text-primary font-bold text-[9px]">{info.formula}</span>
            </div>

            {/* Benchmark Automotivo */}
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                PADRÃO DO MERCADO AUTOMOTIVO
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[8px] text-center font-mono">
                <div className="p-1.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/25">
                  <span className="block text-[7px] text-red-400 font-sans font-bold">PREJUÍZO/ALERTA</span>
                  {info.benchmark.bad}
                </div>
                <div className="p-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25">
                  <span className="block text-[7px] text-amber-400 font-sans font-bold">MÉDIA NORMAL</span>
                  {info.benchmark.mid}
                </div>
                <div className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                  <span className="block text-[7px] text-emerald-400 font-sans font-bold">IDEAL/LUCRO</span>
                  {info.benchmark.good}
                </div>
              </div>
            </div>

            {/* Diagnóstico & Tomada de Decisão */}
            <div className="pt-2 border-t border-white/10">
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 block mb-0.5">
                TOMADA DE DECISÃO RECOMENDADA
              </span>
              <p className="text-[10px] text-zinc-100 leading-snug font-medium">{currentAction}</p>
            </div>
          </div>

          {/* Caret / Arrow */}
          <div
            className={`absolute top-full -mt-px border-solid border-t-zinc-950 border-t-8 border-x-transparent border-x-8 border-b-0 ${
              alignTooltip === "left"
                ? "left-6"
                : alignTooltip === "right"
                ? "right-6"
                : "left-1/2 -translate-x-1/2"
            }`}
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── COCKPIT THERMOMETER (LEILÃO & PRESSÃO DE CPM) ──────────────────────────────
function CockpitThermometer({
  pressure,
  label,
  sub,
  delay = 0,
  info,
}: {
  pressure: number;
  label: string;
  sub: string;
  delay?: number;
  info?: GaugeTelemetryInfo;
}) {
  const S = 196;
  const cx = S / 2;
  const cy = 76;
  const R = 54;
  const pct = Math.min(Math.max(pressure / 100, 0), 1);
  const rotDeg = -90 + pct * 180;

  const col =
    pressure > 70 ? "#ef4444" : pressure > 40 ? "#f59e0b" : "#10b981";
  const decisionText =
    pressure > 70 ? "LEILÃO DISPUTADO: EXPANDIR RAIO" : pressure > 40 ? "LEILÃO NORMAL: MANTER" : "LEILÃO BARATO: ESCALAR";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, type: "spring", stiffness: 130, damping: 20 }}
      className="relative group/gauge flex flex-col"
    >
      <div
        className="relative rounded-2xl bg-card border border-border p-3.5 flex flex-col justify-between transition-all duration-300 hover:shadow-lg"
        style={{
          boxShadow: `0 0 0 1px ${col}15, 0 10px 25px -5px ${col}08`,
          borderColor: `${col}25`,
        }}
      >
        {/* Corner Decals */}
        <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
          <div className="absolute top-2 left-2 w-2.5 h-2.5 border-t border-l opacity-30" style={{ borderColor: col }} />
          <div className="absolute top-2 right-2 w-2.5 h-2.5 border-t border-r opacity-30" style={{ borderColor: col }} />
          <div className="absolute bottom-2 left-2 w-2.5 h-2.5 border-b border-l opacity-30" style={{ borderColor: col }} />
          <div className="absolute bottom-2 right-2 w-2.5 h-2.5 border-b border-r opacity-30" style={{ borderColor: col }} />
        </div>

        {/* Thermometer Dial SVG */}
        <div className="flex justify-center relative select-none">
          <svg width={S} height={116} viewBox={`0 0 ${S} 122`} className="overflow-visible block">
            <defs>
              <linearGradient id="therm-arc-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="50%" stopColor="#f59e0b" />
                <stop offset="100%" stopColor="#ef4444" />
              </linearGradient>
              <filter id="therm-glow" x="-40%" y="-40%" width="180%" height="180%">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Background semi-circle track */}
            <path
              d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
              fill="none"
              stroke="rgba(120,120,130,0.15)"
              strokeWidth={9}
              strokeLinecap="round"
            />

            {/* Glowing gradient arc */}
            <motion.path
              d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
              fill="none"
              stroke="url(#therm-arc-grad)"
              strokeWidth={8}
              strokeLinecap="round"
              filter="url(#therm-glow)"
              initial={{ strokeDasharray: "0 170" }}
              animate={{ strokeDasharray: `${pct * 170} 170` }}
              transition={{ duration: 1.4, delay: delay + 0.15, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* Semi-circle graduation ticks */}
            {[0, 0.25, 0.5, 0.75, 1].map((f, i) => {
              const deg = 180 + f * 180;
              const outer = pt(cx, cy, R + 6, deg);
              const inner = pt(cx, cy, R + 13, deg);
              return (
                <line
                  key={i}
                  x1={outer.x}
                  y1={outer.y}
                  x2={inner.x}
                  y2={inner.y}
                  stroke="currentColor"
                  className="text-muted-foreground/60"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                />
              );
            })}

            {/* Needle Sweeping from -90° to +90° */}
            <motion.g
              style={{ transformOrigin: `${cx}px ${cy}px` }}
              initial={{ rotate: -90 }}
              animate={{ rotate: rotDeg }}
              transition={{
                type: "spring",
                stiffness: 55,
                damping: 12,
                mass: 0.75,
                delay: delay + 0.1,
              }}
            >
              <path
                d={`M ${cx - 2.5} ${cy + 6} L ${cx} ${cy - (R - 5)} L ${cx + 2.5} ${cy + 6} Z`}
                fill={col}
                opacity={0.95}
              />
              <line
                x1={cx}
                y1={cy + 4}
                x2={cx}
                y2={cy - (R - 6)}
                stroke="#ffffff"
                strokeWidth={1.5}
                strokeLinecap="round"
                opacity={0.9}
              />
              <circle cx={cx} cy={cy + 8} r={2.5} fill="currentColor" className="text-muted-foreground/40" />
            </motion.g>

            {/* Metallic Center Hub */}
            <circle cx={cx} cy={cy} r={9} fill="currentColor" className="text-card" stroke={col} strokeWidth={2} />
            <circle cx={cx} cy={cy} r={5.5} fill="currentColor" className="text-muted" />
            <circle cx={cx} cy={cy} r={2.5} fill={col} />
          </svg>
        </div>

        {/* Readout Box */}
        <div className="mt-2 px-3 py-2.5 rounded-xl bg-muted/20 border border-border/70 flex flex-col items-center justify-center text-center shadow-inner relative z-10">
          <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-foreground leading-none">
            {Math.round(pressure)}%
          </span>
          <div className="flex items-center justify-center gap-1.5 mt-2 w-full">
            <Flame className="h-3.5 w-3.5 text-amber-500 animate-pulse shrink-0" />
            <p className="text-[11px] font-black uppercase tracking-wider text-foreground truncate max-w-[155px]">
              {label}
            </p>
            {info && (
              <Info className="h-3 w-3 text-muted-foreground/60 hover:text-foreground shrink-0 cursor-help transition-colors" />
            )}
          </div>
          <span className="text-[8px] font-mono font-bold tracking-widest uppercase text-muted-foreground/80 mt-0.5">
            CUSTO DE IMPRESSÃO (CPM)
          </span>
          <span
            className="text-[8px] font-black uppercase px-2 py-0.5 rounded-full mt-1.5 tracking-wider truncate max-w-[160px]"
            style={{
              backgroundColor: `${col}15`,
              color: col,
              border: `1px solid ${col}30`,
            }}
          >
            {decisionText}
          </span>
          <p className="text-[9px] font-medium text-muted-foreground/85 mt-1 tracking-wide truncate max-w-[160px]">
            {sub}
          </p>
        </div>

        {/* Bottom accent line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-b-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${col}80, transparent)` }}
        />
      </div>

      {/* Thermometer Tooltip Balloon */}
      {info && (
        <div className="absolute bottom-[calc(100%+10px)] left-0 sm:left-2 w-80 p-4 rounded-2xl bg-zinc-950/98 text-zinc-100 border border-white/20 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] backdrop-blur-2xl opacity-0 group-hover/gauge:opacity-100 group-hover/gauge:translate-y-0 translate-y-2 pointer-events-none transition-all duration-200 z-[999] text-left">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className="p-1.5 rounded-lg shrink-0 flex items-center justify-center"
                style={{ backgroundColor: `${col}25`, border: `1px solid ${col}40` }}
              >
                <Flame className="h-4 w-4" style={{ color: col }} />
              </div>
              <div>
                <span className="text-[8px] font-black tracking-widest uppercase text-zinc-400 block">
                  {info.category}
                </span>
                <span className="text-xs font-black tracking-wider text-white uppercase truncate block">
                  {label}
                </span>
              </div>
            </div>
            <span
              className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0"
              style={{
                borderColor: `${col}60`,
                color: col,
                backgroundColor: `${col}15`,
              }}
            >
              {pressure > 70 ? "LEILÃO CARO" : pressure > 40 ? "LEILÃO NORMAL" : "LEILÃO BARATO"}
            </span>
          </div>

          <div className="space-y-2.5 text-[10px] leading-relaxed text-zinc-300">
            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block mb-0.5">
                O QUE SIGNIFICA NA PRÁTICA
              </span>
              <p className="text-[10px] text-zinc-300 leading-snug">{info.what}</p>
            </div>

            <div className="p-2 rounded-lg bg-white/5 border border-white/10 font-mono text-[9px] text-zinc-300 flex items-center justify-between">
              <span className="text-[8px] font-black text-zinc-400 uppercase">FÓRMULA MATEMÁTICA:</span>
              <span className="text-primary font-bold text-[9px]">{info.formula}</span>
            </div>

            <div>
              <span className="text-[8px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                PADRÃO DO MERCADO AUTOMOTIVO
              </span>
              <div className="grid grid-cols-3 gap-1.5 text-[8px] text-center font-mono">
                <div className="p-1.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                  <span className="block text-[7px] text-emerald-400 font-sans font-bold">ESTÁVEL</span>
                  {info.benchmark.good}
                </div>
                <div className="p-1.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/25">
                  <span className="block text-[7px] text-amber-400 font-sans font-bold">MÉDIA</span>
                  {info.benchmark.mid}
                </div>
                <div className="p-1.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/25">
                  <span className="block text-[7px] text-red-400 font-sans font-bold">DISPUTA ALTA</span>
                  {info.benchmark.bad}
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-white/10">
              <span className="text-[8px] font-black uppercase tracking-widest text-emerald-400 block mb-0.5">
                TOMADA DE DECISÃO RECOMENDADA
              </span>
              <p className="text-[10px] text-zinc-100 leading-snug font-medium">
                {pressure > 70
                  ? info.actionBad
                  : pressure > 40
                  ? info.actionMid
                  : info.actionGood}
              </p>
            </div>
          </div>
          <div className="absolute top-full left-6 -mt-px border-solid border-t-zinc-950 border-t-8 border-x-transparent border-x-8 border-b-0" />
        </div>
      )}
    </motion.div>
  );
}

// ─── SCORE ORB (CENTRAL COCKPIT HEALTH CORE) ────────────────────────────────────
function ScoreOrb({
  score,
  components,
  isLoading,
}: {
  score: number;
  components: Record<string, number>;
  isLoading: boolean;
}) {
  const S = 240;
  const cx = S / 2;
  const cy = S / 2 - 2;
  const R = 78;
  const arcLen = R * toRad(G_SWEEP);
  const pct = Math.min(Math.max(score / 100, 0), 1);
  const offset = arcLen * (1 - pct);

  const color = score >= 80 ? "#22c55e" : score >= 55 ? "#f59e0b" : "#ef4444";
  const label = score >= 80 ? "OPERAÇÃO LUCRATIVA" : score >= 55 ? "ATENÇÃO NECESSÁRIA" : "RISCO DE DESPERDÍCIO";

  const comps = [
    {
      key: "cplEfficiency",
      label: "Custo por Comprador",
      weight: "25%",
      desc: "Avalia se o valor pago por cada conversa de WhatsApp está barato ou caro.",
    },
    {
      key: "cpmTrend",
      label: "Estabilidade de Preço",
      weight: "15%",
      desc: "Protege o orçamento contra dias em que o Meta Ads está cobrando caro por anúncio.",
    },
    {
      key: "fatigue",
      label: "Oxigenação dos Anúncios",
      weight: "20%",
      desc: "Mede se o mesmo cliente já cansou de ver a mesma foto de carro repetidamente.",
    },
    {
      key: "conversion",
      label: "Conversão em Contato",
      weight: "20%",
      desc: "Quantos visitantes que clicaram realmente mandaram mensagem no WhatsApp.",
    },
    {
      key: "funnelHealth",
      label: "Atração no Feed",
      weight: "20%",
      desc: "Força de atração visual das fotos e ofertas para fazer as pessoas clicarem.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, type: "spring", stiffness: 90 }}
      className="flex flex-col items-center w-full"
    >
      {/* Central Dial */}
      <div className="relative select-none">
        <svg width={S} height={S * 0.82} viewBox={`0 0 ${S} ${S * 0.88}`}>
          <defs>
            <filter id="orb-glow-filter" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer dotted halo */}
          {[...Array(32)].map((_, i) => {
            const deg = G_START + (i / 31) * G_SWEEP;
            const ptCircle = pt(cx, cy, R + 18, deg);
            return (
              <circle
                key={i}
                cx={ptCircle.x}
                cy={ptCircle.y}
                r={i % 4 === 0 ? 2.5 : 1.2}
                fill="rgba(255,255,255,0.18)"
              />
            );
          })}

          {/* Background Track */}
          <path
            d={arcD(cx, cy, R, G_START, G_SWEEP)}
            stroke="rgba(120,120,130,0.12)"
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
          />

          {/* Colored Baseline Zones */}
          {[
            { from: 0, sw: 0.35 * G_SWEEP, color: "#ef4444" },
            { from: 0.35 * G_SWEEP, sw: 0.35 * G_SWEEP, color: "#f59e0b" },
            { from: 0.70 * G_SWEEP, sw: 0.30 * G_SWEEP - 1, color: "#22c55e" },
          ].map((z, i) => (
            <path
              key={i}
              d={arcD(cx, cy, R, G_START + z.from, z.sw)}
              stroke={z.color}
              strokeWidth={3}
              fill="none"
              opacity={0.25}
              strokeLinecap="butt"
            />
          ))}

          {/* Active Glowing Progress Arc */}
          <motion.path
            d={arcD(cx, cy, R, G_START, G_SWEEP)}
            stroke={color}
            strokeWidth={14}
            fill="none"
            strokeLinecap="round"
            filter="url(#orb-glow-filter)"
            initial={{ strokeDashoffset: arcLen, strokeDasharray: arcLen }}
            animate={{ strokeDashoffset: isLoading ? arcLen : offset, strokeDasharray: arcLen }}
            transition={{ duration: 1.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Score Number Display */}
          <motion.text
            x={cx}
            y={cy - 4}
            textAnchor="middle"
            fill="currentColor"
            className="text-foreground"
            fontSize={52}
            fontWeight="900"
            fontFamily="'Courier New', monospace"
            letterSpacing="-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {isLoading ? "--" : <AnimCounter to={score} delay={0.4} />}
          </motion.text>

          {/* Status Label Pill */}
          <motion.text
            x={cx}
            y={cy + 24}
            textAnchor="middle"
            fill={color}
            fontSize={10}
            fontWeight="900"
            fontFamily="monospace"
            letterSpacing="2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
          >
            {label}
          </motion.text>
        </svg>

        <div
          className="absolute inset-0 pointer-events-none rounded-full"
          style={{ background: `radial-gradient(ellipse at center bottom, ${color}12 0%, transparent 65%)` }}
        />
      </div>

      {/* ── 5 PILLARS TELEMETRY GRID (RESTRUCTURED: 2 COLUMNS, ZERO OVERLAPS) ── */}
      <div className="grid grid-cols-2 gap-2 w-full mt-3">
        {comps.map((c, i) => {
          const v = components[c.key] ?? 0;
          const col = v >= 70 ? "#22c55e" : v >= 45 ? "#f59e0b" : "#ef4444";
          const isFull = i === 4;

          return (
            <motion.div
              key={c.key}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8 + i * 0.08 }}
              className={`flex flex-col gap-1 rounded-xl border p-2.5 relative group/pillar ${
                isFull ? "col-span-2" : "col-span-1"
              }`}
              style={{ borderColor: `${col}25`, background: `${col}08` }}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[8px] font-black uppercase tracking-wider truncate" style={{ color: col }}>
                  {c.label}
                </span>
                <span className="text-[8px] text-muted-foreground font-mono font-bold shrink-0 ml-1">
                  {c.weight}
                </span>
              </div>

              <div className="flex items-baseline justify-between mt-0.5">
                <span className="text-sm font-black font-mono text-foreground leading-none">
                  {Math.round(v)}
                  <span className="text-[9px] font-normal text-muted-foreground ml-0.5">/100</span>
                </span>
                <span
                  className="text-[8px] font-black uppercase px-1 rounded font-mono"
                  style={{ color: col, backgroundColor: `${col}15` }}
                >
                  {v >= 70 ? "BOM" : v >= 45 ? "ALERTA" : "CRÍTICO"}
                </span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden mt-1">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: col }}
                  initial={{ width: 0 }}
                  animate={{ width: `${v}%` }}
                  transition={{ duration: 1.2, delay: 1.0 + i * 0.08, ease: "easeOut" }}
                />
              </div>

              {/* Hover popup for each pillar */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 rounded-xl bg-zinc-950/98 text-zinc-200 border border-white/15 shadow-2xl text-[9px] leading-relaxed opacity-0 pointer-events-none group-hover/pillar:opacity-100 transition-all z-50 text-center">
                <p className="font-bold text-white mb-0.5 uppercase tracking-wider">{c.label} ({c.weight})</p>
                <p className="text-[8px] text-zinc-300">{c.desc}</p>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── SCORE HISTÓRICO ─────────────────────────────────────────────────────────────
function ScoreHistorico({ data }: { data: Array<{ date: string; score: number }> }) {
  if (!data?.length) return null;
  const trend = data[data.length - 1].score - data[0].score;
  const trendColor = trend >= 0 ? "#22c55e" : "#ef4444";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 1.2 }}
      className="w-full"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground">
          Tendência — {data.length} {data.length === 1 ? "dia" : "dias"}
        </span>
        <span className="text-[10px] font-black font-mono" style={{ color: trendColor }}>
          {trend >= 0 ? "+" : ""}
          {trend} pts
        </span>
      </div>
      <div className="h-[56px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.35} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" hide />
            <YAxis domain={[0, 100]} hide />
            <RTooltip
              contentStyle={{
                background: "rgba(10,10,15,0.95)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 8,
                fontSize: 10,
                fontFamily: "monospace",
                color: "#fff",
              }}
              formatter={(v: any) => [`${v} pts`, "Saúde da Conta"]}
            />
            <Area
              type="monotone"
              dataKey="score"
              stroke="#ef4444"
              strokeWidth={2}
              fill="url(#scoreGrad)"
              dot={{ r: 2, fill: "#ef4444", strokeWidth: 0 }}
              activeDot={{ r: 4, fill: "#ef4444" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between mt-1">
        {data
          .filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 5) === 0)
          .map((d, i) => (
            <span key={i} className="text-[8px] font-mono text-muted-foreground/70">
              {d.date}
            </span>
          ))}
      </div>
    </motion.div>
  );
}

// ─── CENTRAL DE DECISÃO EXECUTIVA (PARA PESSOAS LEIGAS E DIRETORES) ──────────────
function CentralDecisaoExecutiva({
  score,
  meta,
  recommendations,
}: {
  score: number;
  meta: any;
  recommendations: any[];
}) {
  const m = meta ?? {};
  const BRL = (v: number) =>
    `R$ ${v?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0,00"}`;

  // Diagnóstico Geral da Conta
  const hasRealLeads = (m.realLeads ?? 0) > 0;
  const targetCpl = Number(m.targetCpl || 5.0);
  const isCPLGood = m.CPL > 0 && m.CPL <= targetCpl;
  const isHealthy = score >= 70 && hasRealLeads && isCPLGood;
  const isCritical = score < 50 || (!hasRealLeads && m.cost > 30) || (hasRealLeads && m.CPL > targetCpl * 1.5);

  const executiveState = isHealthy
    ? {
        headline: "OPERAÇÃO LUCRATIVA E EFICIENTE",
        directiveTitle: "Momento Ideal para Escalar: Compradores chegando com CPL barato no WhatsApp.",
        color: "#22c55e",
        badgeBg: "rgba(34, 197, 94, 0.12)",
        badgeBorder: "border-emerald-500/30",
        icon: TrendingUp,
      }
    : isCritical
    ? {
        headline: "ATENÇÃO: RISCO DE DESPERDÍCIO",
        directiveTitle: !hasRealLeads
          ? "Você está gastando verba em cliques de tráfego sem gerar conversas de compradores no WhatsApp."
          : "Custo por comprador acima da meta da loja. Há vazamento de verba ativo.",
        color: "#ef4444",
        badgeBg: "rgba(239, 68, 68, 0.12)",
        badgeBorder: "border-red-500/30",
        icon: AlertOctagon,
      }
    : {
        headline: "OPERAÇÃO EM MONITORAMENTO",
        directiveTitle: "Resultados moderados. Otimize os criativos e públicos antes de aumentar a verba.",
        color: "#f59e0b",
        badgeBg: "rgba(245, 158, 11, 0.12)",
        badgeBorder: "border-amber-500/30",
        icon: AlertTriangle,
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card/90 p-5 shadow-lg backdrop-blur-xl relative overflow-hidden"
    >
      {/* ── LINHA SUPERIOR: STATUS EXECUTIVO & RESUMO COMERCIAL ── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-border">
        <div className="flex items-start sm:items-center gap-3">
          <div
            className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 border ${executiveState.badgeBorder}`}
            style={{ backgroundColor: executiveState.badgeBg }}
          >
            <executiveState.icon className="h-6 w-6" style={{ color: executiveState.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                DIRETRIZ EXECUTIVA DO COCKPIT
              </span>
              <span
                className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full border"
                style={{
                  borderColor: `${executiveState.color}40`,
                  color: executiveState.color,
                  backgroundColor: `${executiveState.color}15`,
                }}
              >
                {executiveState.headline}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-foreground mt-0.5 leading-snug">
              {executiveState.directiveTitle}
            </h2>
          </div>
        </div>

        {/* ── 4 PILARES COMERCIAIS EM LINGUAGEM LEIGA DE CONCESSIONÁRIA ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 shrink-0">
          <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border/60 text-center">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">
              INVESTIMENTO TOTAL
            </span>
            <span className="text-sm font-black font-mono text-foreground">{BRL(m.cost)}</span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border/60 text-center">
            <span className="text-[8px] font-black uppercase tracking-wider text-emerald-500 block">
              COMPRADORES (WHATSAPP)
            </span>
            <span className="text-sm font-black font-mono text-emerald-500">
              {m.realLeads ?? 0} {m.realLeads === 1 ? "conversa" : "conversas"}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border/60 text-center">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">
              CUSTO P/ COMPRADOR
            </span>
            <span
              className="text-sm font-black font-mono"
              style={{
                color: (m.realLeads ?? 0) > 0 ? (m.CPL <= targetCpl ? "#22c55e" : "#f59e0b") : "#ef4444",
              }}
            >
              {(m.realLeads ?? 0) > 0 ? BRL(m.CPL) : "Sem Contatos"}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-muted/30 border border-border/60 text-center">
            <span className="text-[8px] font-black uppercase tracking-wider text-muted-foreground block">
              VISITANTES ATRAÍDOS
            </span>
            <span className="text-sm font-black font-mono text-foreground">{m.clicks ?? 0} cliques</span>
          </div>
        </div>
      </div>

      {/* ── LINHA INFERIOR: AS 3 DECISÕES TÁTICAS DO DIA ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3">
        {/* Decisão 1: Escala */}
        <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-500">
              ONDE INVESTIR MAIS (ESCALA)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {m.topScaleCampaign
              ? `Campanha "${m.topScaleCampaign.name.slice(0, 24)}..." está trazendo contatos a ${BRL(m.topScaleCampaign.cpl)}. Aumente a verba diária em 20%.`
              : "Aguardando campanhas atingirem mais de 3 conversas saudáveis para liberar escala segura."}
          </p>
        </div>

        {/* Decisão 2: Estancar Desperdício */}
        <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/20 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-red-500">
              ESTANCAR DESPERDÍCIO (PAUSAR)
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {m.topWasteCampaign
              ? `Campanha "${m.topWasteCampaign.name.slice(0, 24)}..." já gastou ${BRL(m.topWasteCampaign.cost)} sem trazer nenhum comprador. Pause imediatamente.`
              : "Nenhuma campanha em sangria grave no momento. A verba está bem distribuída."}
          </p>
        </div>

        {/* Decisão 3: Criativos e Fotos */}
        <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-1">
            <Flame className="h-4 w-4 text-amber-500" />
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-500">
              ATRAÇÃO & FOTOS DO PÁTIO
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-snug">
            {m.avgFreq > 2.6
              ? `Frequência em ${m.avgFreq.toFixed(1)}× (o cliente já decorou as fotos). Troque as imagens dos carros para o CPL não disparar.`
              : m.CTR < 1.2 && m.impr > 500
              ? `Taxa de cliques em ${m.CTR.toFixed(1)}% (baixa atração). Teste fotos reais no pátio com preço de parcela visível na arte.`
              : "Criativos com boa atração visual e sem saturação crítica no momento."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── RECOMENDAÇÕES INTELIGENTES ──────────────────────────────────────────────────
function RecomendacoesInteligentes({
  recs,
}: {
  recs: Array<{ prio: string; color: string; title: string; desc: string; icon: any }>;
}) {
  if (!recs.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.9 }}
      className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-foreground">
            Diagnóstico & Plano de Ação para o Gestor
          </h3>
          <p className="text-[10px] text-muted-foreground mt-0.5 tracking-widest uppercase">
            Ações prioritárias para alavancar a eficiência das vendas
          </p>
        </div>
        <div className="flex gap-2">
          {(["CRÍTICO", "ATENÇÃO", "OPORTUNIDADE"] as const).map((p) => {
            const count = recs.filter((r) => r.prio === p).length;
            if (!count) return null;
            const col = p === "CRÍTICO" ? "#ef4444" : p === "ATENÇÃO" ? "#f59e0b" : "#22c55e";
            return (
              <span
                key={p}
                className="text-[8px] font-black px-2.5 py-1 rounded-md border"
                style={{ color: col, borderColor: `${col}30`, background: `${col}10` }}
              >
                {count}× {p}
              </span>
            );
          })}
        </div>
      </div>
      <div className="divide-y divide-border">
        {recs.map((rec, i) => {
          const Icon = rec.icon;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.0 + i * 0.08 }}
              className="flex gap-4 px-6 py-4 hover:bg-muted/40 transition-colors"
            >
              <div className="w-1 self-stretch rounded-full shrink-0" style={{ backgroundColor: rec.color }} />
              <div
                className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${rec.color}14`, border: `1px solid ${rec.color}25` }}
              >
                <Icon className="h-4 w-4" style={{ color: rec.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[8px] font-black px-1.5 py-0.5 rounded"
                    style={{ color: rec.color, background: `${rec.color}15` }}
                  >
                    {rec.prio}
                  </span>
                  <span className="text-[12px] font-black text-foreground leading-tight">
                    {rec.title}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">{rec.desc}</p>
              </div>
              <div
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black"
                style={{ background: `${rec.color}15`, color: rec.color }}
              >
                {i + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ─── RANKING TÁTICO (COMPRADORES VS OFENSORAS) ───────────────────────────────────
function RankingTatico({ data }: { data: any[] }) {
  if (!data?.length) return null;

  const topCamps = [...data].filter((d) => d.leads > 0).sort((a, b) => a.cpl - b.cpl).slice(0, 3);
  const worstCamps = [...data]
    .sort((a, b) => {
      if (a.leads === 0 && b.leads === 0) return b.spend - a.spend;
      if (a.leads === 0) return -1;
      if (b.leads === 0) return 1;
      return b.cpl - a.cpl;
    })
    .slice(0, 3);

  const BRL = (v: number) =>
    `R$ ${v?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.8 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      {/* Coluna Verde (Escalar) */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-emerald-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2 mb-3">
          <TrendingUp className="h-4 w-4" /> Top 3 — Mais Trazem Compradores (Baixo Custo)
        </h3>
        <div className="space-y-2.5">
          {topCamps.length === 0 && (
            <p className="text-[10px] text-muted-foreground font-mono">
              Nenhuma campanha com mensagens/leads confirmados no período.
            </p>
          )}
          {topCamps.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-black uppercase text-foreground truncate">{c.name}</p>
                <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                  {c.leads} Conversas/Leads · Investimento: {BRL(c.spend)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-black text-emerald-500 font-mono">{BRL(c.cpl)}</p>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">Custo/Conversa</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Coluna Vermelha (Ofensoras) */}
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-red-500" />
        <h3 className="text-xs font-black uppercase tracking-widest text-red-500 flex items-center gap-2 mb-3">
          <AlertTriangle className="h-4 w-4" /> Top 3 — Ofensoras (Gastam sem Trazer Comprador)
        </h3>
        <div className="space-y-2.5">
          {worstCamps.length === 0 && (
            <p className="text-[10px] text-muted-foreground font-mono">Nenhuma campanha registrada no período.</p>
          )}
          {worstCamps.map((c) => (
            <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border shadow-sm">
              <div className="flex-1 min-w-0 pr-4">
                <p className="text-[11px] font-black uppercase text-foreground truncate">{c.name}</p>
                <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                  {c.leads > 0 ? `${c.leads} Conversas` : "0 Conversas de Compra"} · Investimento: {BRL(c.spend)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[13px] font-black text-red-500 font-mono">
                  {c.leads > 0 ? BRL(c.cpl) : "SEM LEADS"}
                </p>
                <p className="text-[8px] uppercase tracking-wider text-muted-foreground">
                  {c.leads > 0 ? "Custo/Conversa" : "Pausar"}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

// ─── FILTER BAR ──────────────────────────────────────────────────────────────────
function CockpitFilterBar() {
  const {
    period,
    setPeriod,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    accountId,
    setAccountId,
    campaignId,
    setCampaignId,
    adSetId,
    setAdSetId,
    resetToDefault,
  } = useGlobalDate();

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
      let q = (supabase as any)
        .from("campaigns")
        .select("id, name, status, ad_account_id")
        .eq("status", "active")
        .order("name");
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
        const { data: cids } = await (supabase as any)
          .from("campaigns")
          .select("id")
          .eq("ad_account_id", accountId);
        const ids = (cids as any[])?.map((c: any) => c.id) ?? [];
        if (ids.length) q = q.in("campaign_id", ids);
        else return [];
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
      className="relative z-40 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-background/80 px-4 py-3 backdrop-blur-xl shadow-sm"
    >
      {/* Account selector */}
      <div ref={accountRef} className="relative">
        <button
          onClick={() => {
            setShowAccounts(!showAccounts);
            setShowCampaigns(false);
            setShowAdSets(false);
          }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={
            accountId !== "all"
              ? { borderColor: "var(--primary)", color: "var(--primary)" }
              : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }
          }
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: accountId !== "all" ? "var(--primary)" : "currentColor" }}
          />
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
              <button
                onClick={() => {
                  setAccountId("all");
                  setShowAccounts(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${
                  accountId === "all" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                Todas as Contas
              </button>
              {accounts.map((acc: any) => (
                <button
                  key={acc.id}
                  onClick={() => {
                    setAccountId(acc.id);
                    setShowAccounts(false);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${
                    accountId === acc.id ? "text-primary" : "text-foreground/80"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: accountId === acc.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }}
                  />
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
          onClick={() => {
            setShowCampaigns(!showCampaigns);
            setShowAccounts(false);
            setShowAdSets(false);
          }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={
            campaignId !== "all"
              ? { borderColor: "var(--primary)", color: "var(--primary)" }
              : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }
          }
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: campaignId !== "all" ? "var(--primary)" : "currentColor" }}
          />
          {selectedCampaign?.name
            ? selectedCampaign.name.slice(0, 22) + (selectedCampaign.name.length > 22 ? "…" : "")
            : "Todas as Campanhas"}
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
              <button
                onClick={() => {
                  setCampaignId("all");
                  setShowCampaigns(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${
                  campaignId === "all" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                Todas as Campanhas
              </button>
              {campaigns.length === 0 && (
                <p className="px-4 py-3 text-[9px] text-muted-foreground font-mono">
                  Nenhuma campanha ativa{accountId !== "all" ? " nesta conta" : ""}
                </p>
              )}
              {campaigns.map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCampaignId(c.id);
                    setShowCampaigns(false);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${
                    campaignId === c.id ? "text-primary" : "text-foreground/80"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: campaignId === c.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }}
                  />
                  {c.name.slice(0, 32)}
                  {c.name.length > 32 ? "…" : ""}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ad Set selector */}
      <div ref={adSetRef} className="relative">
        <button
          onClick={() => {
            setShowAdSets(!showAdSets);
            setShowAccounts(false);
            setShowCampaigns(false);
          }}
          className="flex items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-[10px] font-black uppercase tracking-widest transition hover:bg-muted/50"
          style={
            adSetId !== "all"
              ? { borderColor: "var(--primary)", color: "var(--primary)" }
              : { borderColor: "transparent", color: "hsl(var(--muted-foreground))" }
          }
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: adSetId !== "all" ? "var(--primary)" : "currentColor" }}
          />
          {selectedAdSet?.name
            ? selectedAdSet.name.slice(0, 20) + (selectedAdSet.name.length > 20 ? "…" : "")
            : "Todos os Conjuntos"}
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
              <button
                onClick={() => {
                  setAdSetId("all");
                  setShowAdSets(false);
                }}
                className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 ${
                  adSetId === "all" ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                Todos os Conjuntos
              </button>
              {adSets.length === 0 && (
                <p className="px-4 py-3 text-[9px] text-muted-foreground font-mono">
                  Nenhum conjunto encontrado
                </p>
              )}
              {adSets.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setAdSetId(s.id);
                    setShowAdSets(false);
                  }}
                  className={`flex w-full items-center gap-2 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-left transition hover:bg-muted/50 border-t border-border/50 ${
                    adSetId === s.id ? "text-primary" : "text-foreground/80"
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: adSetId === s.id ? "var(--primary)" : "hsl(var(--muted-foreground)/0.3)" }}
                  />
                  {s.name.slice(0, 30)}
                  {s.name.length > 30 ? "…" : ""}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator */}
      <div className="h-5 w-px bg-border" />

      {/* Date Range Picker */}
      <DateRangePicker
        startDate={new Date(dateFrom + "T00:00:00")}
        endDate={new Date(dateTo + "T00:00:00")}
        onChange={(start, end) => {
          setDateFrom(format(start, "yyyy-MM-dd"));
          setDateTo(format(end, "yyyy-MM-dd"));
          setPeriod("custom");
        }}
      />

      {/* Reset button */}
      {isFiltered && (
        <motion.button
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          onClick={resetToDefault}
          className="ml-auto flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
        >
          <X className="h-2.5 w-2.5" />
          Limpar
        </motion.button>
      )}
    </motion.div>
  );
}

// ─── RIGOROUS MATHEMATICAL DATA ENGINE (CALCULADO MINUCIOSAMENTE) ────────────────
function useCockpitData() {
  const { dateFrom, dateTo, accountId, campaignId, adSetId } = useGlobalDate();

  const totalDays = Math.max(differenceInDays(parseISO(dateTo), parseISO(dateFrom)) + 1, 1);
  const queryLookbackDays = totalDays <= 3 ? 14 : totalDays * 2;
  const queryDateFrom = format(subDays(parseISO(dateFrom), queryLookbackDays), "yyyy-MM-dd");

  const { data: raw, isLoading } = useQuery({
    queryKey: ["cockpit-raw", dateFrom, dateTo, queryDateFrom, accountId, campaignId, adSetId],
    staleTime: 2 * 60 * 1000,
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      let q = (supabase as any)
        .from("campaigns")
        .select(
          `id, name, status, delivery_status, objective, daily_budget, budget, lifetime_budget, budget_currency, external_id, ad_account_id, metrics(cost, conversions, impressions, clicks, reach, frequency, result_type, date)`
        );

      if (accountId !== "all") q = q.eq("ad_account_id", accountId);
      if (campaignId !== "all") q = q.eq("id", campaignId);

      if (adSetId !== "all") {
        const { data: adSetData } = await (supabase as any)
          .from("ad_sets")
          .select("campaign_id")
          .eq("id", adSetId)
          .single();
        if (adSetData?.campaign_id) q = q.eq("id", adSetData.campaign_id);
      }

      const { data, error } = await q;
      if (error) {
        console.error("[cockpit] query error:", error);
        return [];
      }

      const campaignsWithMetrics = (data as any[]) ?? [];
      const rows: any[] = [];

      for (const camp of campaignsWithMetrics) {
        if (!camp.metrics) continue;
        const campBudget = camp.daily_budget ?? camp.budget ?? 0;

        for (const m of camp.metrics) {
          if (!m.date) continue;
          const d = m.date.split("T")[0];
          if (d < queryDateFrom || d > dateTo) continue;

          const freq =
            m.frequency && m.frequency > 0
              ? m.frequency
              : m.reach && m.reach > 0
              ? m.impressions / m.reach
              : 1.0;

          rows.push({
            campaign_id: camp.id,
            cost: Number(m.cost ?? 0),
            conversions: Number(m.conversions ?? 0),
            impressions: Number(m.impressions ?? 0),
            clicks: Number(m.clicks ?? 0),
            cpm: m.impressions > 0 ? (Number(m.cost ?? 0) / m.impressions) * 1000 : 0,
            frequency: freq,
            result_type: m.result_type,
            date: d,
            campaigns: {
              id: camp.id,
              name: camp.name,
              ad_account_id: camp.ad_account_id,
              objective: camp.objective,
              daily_budget: campBudget,
            },
          });
        }
      }
      return rows;
    },
  });

  return useMemo(() => {
    if (isLoading) {
      return {
        score: 0,
        components: {},
        gauges: {},
        radar: [],
        dailyScores: [],
        recommendations: [],
        isLoading: true,
        meta: null,
      };
    }
    if (!raw?.length) {
      return {
        score: 0,
        components: {},
        gauges: {},
        radar: [],
        dailyScores: [],
        recommendations: [],
        isLoading: false,
        meta: null,
      };
    }

    // Split: Active Selected Window (Recent) vs Historical Baseline (Prior)
    const recent = raw.filter((r: any) => r.date >= dateFrom && r.date <= dateTo);
    const priorStartDate = format(subDays(parseISO(dateFrom), totalDays), "yyyy-MM-dd");
    let prior = raw.filter((r: any) => r.date >= priorStartDate && r.date < dateFrom);
    if (!prior.length) {
      prior = raw.filter((r: any) => r.date < dateFrom);
    }

    // ─── AGREGADOR COM SEPARAÇÃO RIGOROSA: COMPRADORES VS CLIQUES ─────────────
    const agg = (rows: any[]) => {
      let cost = 0;
      let rawConv = 0;
      let realLeads = 0;
      let leadCost = 0;
      let trafficCost = 0;
      let clicks = 0;
      let impr = 0;
      let freqWeightedSum = 0;
      let cpmWeightedSum = 0;

      for (const r of rows) {
        cost += r.cost;
        clicks += r.clicks;
        impr += r.impressions;
        rawConv += r.conversions;
        freqWeightedSum += r.frequency * (r.impressions || 1);
        cpmWeightedSum += r.cpm * (r.impressions || 1);

        // Classificação inteligente de campanha
        const cType = classifyCampaignType(
          r.campaigns?.name ?? "",
          r.result_type ?? "",
          r.campaigns?.objective ?? ""
        );

        if (cType.isLead) {
          // AQUI: Somente contatos/mensagens reais entram em realLeads!
          realLeads += r.conversions;
          leadCost += r.cost;
        } else {
          trafficCost += r.cost;
        }
      }

      const avgFreq = impr > 0 ? freqWeightedSum / impr : rows.length ? 1.0 : 0;
      const avgCPM = impr > 0 ? cpmWeightedSum / impr : 0;

      return {
        cost,
        rawConv,
        realLeads,
        leadCost,
        trafficCost,
        clicks,
        impr,
        avgFreq,
        avgCPM,
      };
    };

    const R = agg(recent);
    const P = agg(prior);

    // ─── MÉTRICAS RIGOROSAS BASEADAS EM COMPRADORES REAIS ───────────────────────
    // CPL Real: se há conversas reais, divide o gasto nas campanhas de lead pelo número de conversas reais
    // (ou custo total / conversas reais se leadCost for zero)
    const effectiveLeadCost = R.leadCost > 0 ? R.leadCost : R.cost;
    const CPL = R.realLeads > 0 ? effectiveLeadCost / R.realLeads : 0;
    const CPC = R.clicks > 0 ? R.cost / R.clicks : 0;
    const CTR = R.impr > 0 ? (R.clicks / R.impr) * 100 : 0;

    // CVR Real: Porcentagem de cliques que se transformaram em conversas no WhatsApp
    const CVR = R.clicks > 0 ? (R.realLeads / R.clicks) * 100 : 0;
    const friction = R.clicks > 0 ? Math.max(0, 100 - CVR) : 0;

    // Oscilação de Leilão / CPM
    const cpmTrendRatio = P.avgCPM > 0 ? R.avgCPM / P.avgCPM : 1.0;
    
    // Benchmark Regional Ativo (Padrão RJ: R$ 5,00)
    let regionalTarget = 5.0;
    try {
      const savedBench = localStorage.getItem("nc_regional_benchmark");
      if (savedBench) {
        const parsed = JSON.parse(savedBench);
        if (parsed.targetCpl && Number(parsed.targetCpl) > 0) regionalTarget = Number(parsed.targetCpl);
      }
    } catch {}
    const TARGET_CPL = regionalTarget;

    // ─── COMPONENTES DO SCORE DE SAÚDE (CALIBRADO PARA VENDAS REAIS) ───────────
    // 1. Eficiência de CPL: se CPL <= 25 (100%), se CPL == 35 (70%), se sem leads mas gastou (20%)
    const cplEfficiency =
      R.realLeads > 0
        ? Math.min(100, Math.max(0, (TARGET_CPL / CPL) * 70))
        : R.cost === 0
        ? 80
        : 15;

    // 2. Pressão do Leilão
    const pressure = Math.min(100, Math.max(0, (cpmTrendRatio - 0.5) * 100));
    const cpmTrend = Math.max(0, 100 - pressure);

    // 3. Fadiga de Criativo: ideal <= 1.8x, alerta > 2.8x
    const fatigue = Math.min(100, Math.max(0, 100 - ((R.avgFreq - 1.0) / 3.0) * 100));

    // 4. Conversão Funil: Benchmark 4.0% de conversas/cliques
    const conversion = Math.min(100, (CVR / 4.0) * 100);

    // 5. Atração de Criativo (CTR): Benchmark 2.0%
    const funnelHealth = Math.min(100, (CTR / 2.0) * 100);

    // Score Global de Saúde da Conta
    const score = Math.round(
      cplEfficiency * 0.30 +
        cpmTrend * 0.15 +
        fatigue * 0.20 +
        conversion * 0.20 +
        funnelHealth * 0.15
    );

    // Mapeamento por campanha
    const campMap: Record<string, any> = {};
    for (const r of recent) {
      const cid = r.campaign_id;
      if (!campMap[cid]) {
        const cType = classifyCampaignType(
          r.campaigns?.name ?? "",
          r.result_type ?? "",
          r.campaigns?.objective ?? ""
        );
        campMap[cid] = {
          name: r.campaigns?.name ?? cid,
          cost: 0,
          conv: 0,
          realLeads: 0,
          isLeadCamp: cType.isLead,
          typeLabel: cType.typeLabel,
          clicks: 0,
          impr: 0,
          budget: Number(r.campaigns?.daily_budget ?? 0),
          cpms: [],
        };
      }
      campMap[cid].cost += r.cost;
      campMap[cid].conv += r.conversions;
      if (campMap[cid].isLeadCamp) {
        campMap[cid].realLeads += r.conversions;
      }
      campMap[cid].clicks += r.clicks;
      campMap[cid].impr += r.impressions;
      if (r.cpm > 0) campMap[cid].cpms.push(r.cpm);
    }

    const camps = Object.values(campMap);
    const activeCamps = camps.filter((c) => c.cost > 0);
    const totalBudget = camps.reduce((s: number, c: any) => s + c.budget, 0);
    const activeBudget = activeCamps.reduce((s: number, c: any) => s + c.budget, 0);

    const dailyCost = R.cost / Math.max(totalDays, 1);

    const scale =
      activeBudget > 0
        ? Math.min(100, (dailyCost / activeBudget) * 100)
        : P.cost > 0
        ? Math.min(100, (R.cost / P.cost) * 80)
        : 75;

    const budgetHealth =
      totalBudget > 0
        ? Math.min(100, (activeBudget / totalBudget) * 100)
        : (activeCamps.length / Math.max(camps.length, 1)) * 100;

    const momentum = Math.round(cpmTrend * 0.4 + conversion * 0.35 + fatigue * 0.25);

    const isToday = dateTo === format(new Date(), "yyyy-MM-dd");
    let hourlyIntensity = 50;
    if (isToday) {
      const currentHourFraction = Math.max(0.1, (new Date().getHours() + new Date().getMinutes() / 60) / 24);
      const spendPacing = activeBudget > 0 ? dailyCost / activeBudget : 0.5;
      hourlyIntensity = Math.min(100, Math.max(0, (spendPacing / currentHourFraction) * 50));
    }

    // Campanhas de destaque para decisão executiva
    const campsWithLeads = camps
      .filter((c) => c.realLeads > 0)
      .map((c) => ({ ...c, cpl: c.cost / c.realLeads }))
      .sort((a, b) => a.cpl - b.cpl);

    const campsWithoutLeads = camps
      .filter((c) => c.realLeads === 0 && c.cost > 10)
      .sort((a, b) => b.cost - a.cost);

    const topScaleCampaign = campsWithLeads[0] ?? null;
    const topWasteCampaign = campsWithoutLeads[0] ?? null;

    // Radar / Táticas
    const radar = camps
      .filter((c: any) => c.cost > 0 || c.realLeads > 0)
      .map((c: any) => {
        const campCPL = c.realLeads > 0 ? c.cost / c.realLeads : c.cost;
        const avgCampCPM =
          c.cpms.length > 0
            ? c.cpms.reduce((a: number, b: number) => a + b, 0) / c.cpms.length
            : 0;
        const trend =
          avgCampCPM < R.avgCPM * 0.85 ? "up" : avgCampCPM > R.avgCPM * 1.15 ? "down" : "stable";
        return {
          id: c.name,
          name: c.name,
          cpl: +campCPL.toFixed(2),
          leads: c.realLeads,
          rawConv: c.conv,
          isLeadCamp: c.isLeadCamp,
          spend: +c.cost.toFixed(2),
          trend,
        };
      })
      .sort((a: any, b: any) => b.spend - a.spend)
      .slice(0, 16);

    // Histórico Diário
    const showDays = Math.min(totalDays, 14);
    const byDate: Record<string, any[]> = {};
    for (const r of recent) {
      if (!byDate[r.date]) byDate[r.date] = [];
      byDate[r.date].push(r);
    }

    const todayParsed = parseISO(dateTo);
    const dailyScores = [...Array(showDays)].map((_, i) => {
      const dt = format(subDays(todayParsed, showDays - 1 - i), "yyyy-MM-dd");
      const label = format(subDays(todayParsed, showDays - 1 - i), "dd/MM", { locale: ptBR });
      const dd = byDate[dt] ?? [];
      if (!dd.length) return { date: label, score: 0 };
      const d = agg(dd);
      const s1 =
        d.cost > 0 && d.realLeads > 0
          ? Math.min(100, (TARGET_CPL / (d.cost / d.realLeads)) * 70)
          : d.cost === 0
          ? 70
          : 25;
      const s3 = Math.max(0, 100 - ((d.avgFreq - 1.0) / 3.0) * 100);
      const s4 = d.clicks > 0 ? Math.min(100, ((d.realLeads / d.clicks) / 0.04) * 100) : 25;
      const s5 = d.impr > 0 ? Math.min(100, ((d.clicks / d.impr) / 0.02) * 100) : 35;
      return {
        date: label,
        score: Math.round(s1 * 0.35 + s3 * 0.25 + s4 * 0.25 + s5 * 0.15),
      };
    });

    // Recomendações Táticas para Tomada de Decisão
    type RecPrio = "CRÍTICO" | "ATENÇÃO" | "OPORTUNIDADE";
    const recs: Array<{ prio: RecPrio; color: string; title: string; desc: string; icon: any }> = [];

    if (R.realLeads === 0 && R.cost > 30) {
      recs.push({
        prio: "CRÍTICO",
        color: "#ef4444",
        icon: AlertOctagon,
        title: "Investimento Sem Geração de Conversas no WhatsApp",
        desc: `Foram investidos R$ ${R.cost.toFixed(2)} em cliques/tráfego sem gerar nenhum comprador direto. Ative uma campanha focada em Mensagens de WhatsApp para que a equipe de vendas receba contatos.`,
      });
    }

    if (topWasteCampaign) {
      recs.push({
        prio: "CRÍTICO",
        color: "#ef4444",
        icon: AlertTriangle,
        title: `Pausar Campanha Ofensora: "${topWasteCampaign.name.slice(0, 30)}"`,
        desc: `Esta campanha consumiu R$ ${topWasteCampaign.cost.toFixed(2)} sem trazer nenhum comprador. Pause-a para estancar o desperdício e realocar a verba nas campanhas campeãs.`,
      });
    }

    if (R.avgFreq > 2.8) {
      recs.push({
        prio: "CRÍTICO",
        color: "#ef4444",
        icon: Flame,
        title: "Saturação Severa do Público (Frequência Alta)",
        desc: `Frequência de ${R.avgFreq.toFixed(1)}×. Os mesmos clientes estão vendo os anúncios repetidamente. Pause os criativos antigos e suba 3 novos modelos de veículos com novas fotos do pátio.`,
      });
    }

    if (CVR < 2.0 && R.clicks > 30) {
      recs.push({
        prio: "ATENÇÃO",
        color: "#f59e0b",
        icon: Target,
        title: "Muitos Cliques, Poucas Mensagens no WhatsApp",
        desc: `Apenas ${CVR.toFixed(1)}% dos visitantes chamaram a loja. Revise a mensagem inicial do WhatsApp ou garanta que o modelo anunciado tenha o preço visível na arte.`,
      });
    }

    if (topScaleCampaign && topScaleCampaign.cpl <= 35) {
      recs.push({
        prio: "OPORTUNIDADE",
        color: "#22c55e",
        icon: Rocket,
        title: `Aumentar Orçamento na Campeã: "${topScaleCampaign.name.slice(0, 30)}"`,
        desc: `Esta campanha gerou ${topScaleCampaign.realLeads} conversas a um custo de R$ ${topScaleCampaign.cpl.toFixed(2)} cada. Aumente a verba diária em 20% para abastecer a equipe de vendas.`,
      });
    }

    return {
      score,
      components: { cplEfficiency, cpmTrend, fatigue, conversion, funnelHealth },
      gauges: {
        scale,
        fatigue,
        pressure,
        conversion,
        budgetHealth,
        momentum,
        hourlyIntensity,
        cplEfficiency,
      },
      radar,
      dailyScores,
      recommendations: recs.slice(0, 5),
      isLoading: false,
      meta: {
        CPL,
        targetCpl: TARGET_CPL,
        CVR,
        avgFreq: R.avgFreq,
        cpmTrendRatio,
        activeBudget,
        dailyCost,
        CPC,
        CTR,
        realLeads: R.realLeads,
        rawConv: R.rawConv,
        clicks: R.clicks,
        cost: R.cost,
        impr: R.impr,
        friction,
        topScaleCampaign,
        topWasteCampaign,
        campsWithLeadsCount: campsWithLeads.length,
      },
    };
  }, [raw, isLoading, dateFrom, dateTo, accountId, campaignId, totalDays]);
}

// ─── MAIN COCKPIT DASHBOARD ──────────────────────────────────────────────────────
function CockpitPage() {
  const { score, components, gauges: g, radar, dailyScores, recommendations, isLoading, meta } = useCockpitData() as any;
  const { accountId, campaignId, adSetId, dateFrom, dateTo } = useGlobalDate();
  const [clock, setClock] = useState("");

  useEffect(() => {
    const update = () => setClock(new Date().toLocaleTimeString("pt-BR"));
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  const gv = g ?? {};
  const m = meta ?? {};

  const BRL = (v: number) =>
    `R$ ${v?.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "0,00"}`;
  const FMT = (v: number, unit = "") =>
    `${v?.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? "0"}${unit}`;

  // ─── OS 11 RELÓGIOS EM LINGUAGEM LEIGA & FOCO EM TOMADA DE DECISÃO ───────────
  const gaugeConfig = [
    // 1. Volume de Conversas no WhatsApp (O INDICADOR MAIS IMPORTANTE!)
    {
      label: "Conversas no WhatsApp",
      techLabel: "VOLUME DE COMPRADORES",
      textValue: String(m.realLeads ?? 0),
      sub: (m.realLeads ?? 0) > 0 ? `${m.realLeads} clientes iniciaram contato` : "Nenhum comprador hoje",
      value: Math.min(100, (((m.realLeads ?? 0) / 40) * 100)),
      zones: [
        { from: 0, to: 0.3, color: "#ef4444" },
        { from: 0.3, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.realLeads ?? 0) > 15
          ? { label: "🟢 VENDEDORES ABASTECIDOS", color: "#22c55e" }
          : (m.realLeads ?? 0) > 0
          ? { label: "🟡 FLUXO REGULAR", color: "#f59e0b" }
          : { label: "🔴 SEM COMPRADORES", color: "#ef4444" },
      info: {
        category: "COMPRADORES REAIS",
        icon: MessageCircle,
        what: "Número exato de pessoas que clicaram nos anúncios e iniciaram conversa de compra no WhatsApp ou enviaram formulário.",
        formula: "Soma de Conversas por Mensagem + Cadastros Nativos",
        benchmark: { bad: "0 a 5 contatos", mid: "5 a 20 contatos", good: "> 20 contatos" },
        actionGood: "Volume robusto de compradores chegando. Garanta que os vendedores atendam em menos de 5 minutos.",
        actionMid: "Fluxo moderado. Continue mantendo as melhores campanhas de mensagens ativas.",
        actionBad: "Nenhum comprador chamou a loja. Transfira a verba de campanhas de cliques para campanhas de mensagens diretas.",
      },
    },

    // 2. Custo por Conversa / Lead
    {
      label: "Custo por Comprador",
      techLabel: "CPL REAL (WHATSAPP)",
      textValue: (m.realLeads ?? 0) > 0 ? BRL(m.CPL) : "Sem Contatos",
      sub: (m.realLeads ?? 0) > 0 ? "Valor pago por cada contato" : "R$ gastos em tráfego",
      value: (m.realLeads ?? 0) > 0 ? Math.min(100, Math.max(0, (35 / m.CPL) * 70)) : 20,
      zones: [
        { from: 0, to: 0.4, color: "#ef4444" },
        { from: 0.4, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.realLeads ?? 0) > 0 && m.CPL <= 25
          ? { label: "🟢 CUSTO EXCELENTE: ESCALAR", color: "#22c55e" }
          : (m.realLeads ?? 0) > 0 && m.CPL <= 40
          ? { label: "🟡 NA META DA LOJA", color: "#f59e0b" }
          : { label: "🔴 MUITO CARO / CORRIGIR", color: "#ef4444" },
      info: {
        category: "EFICIÊNCIA FINANCEIRA",
        icon: Target,
        what: "Quanto a loja desembolsou em média para colocar um cliente de verdade conversando no WhatsApp dos vendedores.",
        formula: "Investimento em Mensagens ÷ Conversas Geradas",
        benchmark: { bad: "> R$ 45 Caro", mid: "R$ 25 a R$ 40 Na Meta", good: "< R$ 25 Barato" },
        actionGood: "Cada comprador está custando pouco. Aumente o orçamento para vender mais carros com alta margem de lucro.",
        actionMid: "Custo por contato saudável e dentro do padrão do setor automotivo.",
        actionBad: "Custo elevado por contato. Pause as campanhas ofensoras no ranking abaixo.",
      },
    },

    // 3. Taxa de Contatos (CVR Real)
    {
      label: "Taxa de Contatos",
      techLabel: "CONVERSÃO (CVR)",
      textValue: FMT(m.CVR, "%"),
      sub: "De cada 100 cliques, quantos chamam",
      value: Math.min(100, ((m.CVR ?? 0) / 6.0) * 100),
      zones: [
        { from: 0, to: 0.35, color: "#ef4444" },
        { from: 0.35, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.CVR ?? 0) >= 5.0
          ? { label: "🟢 OFERTA MAGNÉTICA", color: "#22c55e" }
          : (m.CVR ?? 0) >= 2.0
          ? { label: "🟡 RETENÇÃO NORMAL", color: "#f59e0b" }
          : { label: "🔴 POUCOS CHAMAM", color: "#ef4444" },
      info: {
        category: "CONVERSÃO COMERCIAL",
        icon: TrendingUp,
        what: "Porcentagem das pessoas que clicaram no anúncio do carro e realmente mandaram mensagem no WhatsApp.",
        formula: "(Conversas no WhatsApp ÷ Cliques Totais) × 100",
        benchmark: { bad: "< 2,0% Baixa", mid: "2,0% a 5,0% Normal", good: "> 5,0% Alta" },
        actionGood: "Excelente retenção. As pessoas que clicam estão com forte interesse em fechar negócio.",
        actionMid: "Conversão dentro da média. Otimize a saudação inicial do WhatsApp.",
        actionBad: "Muitos cliques mas poucos chamam. O anúncio promete algo diferente ou a mensagem do WhatsApp assusta o cliente.",
      },
    },

    // 4. Desistência pós-clique
    {
      label: "Desistência Pós-Clique",
      techLabel: "TAXA DE ATRITO",
      textValue: FMT(m.friction, "%"),
      sub: "Clicaram mas não chamaram",
      value: Math.min(100, Math.max(0, 100 - (m.friction ?? 90))),
      zones: [
        { from: 0, to: 0.3, color: "#ef4444" },
        { from: 0.3, to: 0.65, color: "#f59e0b" },
        { from: 0.65, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.friction ?? 90) < 85
          ? { label: "🟢 BAIXA PERDA", color: "#22c55e" }
          : (m.friction ?? 90) < 95
          ? { label: "🟡 PERDA ESPERADA", color: "#f59e0b" }
          : { label: "🔴 ALTA FUGA DE CLIENTE", color: "#ef4444" },
      info: {
        category: "FUNIL DE ATENDIMENTO",
        icon: AlertTriangle,
        what: "Porcentagem de visitantes que clicaram no anúncio mas desistiram antes de enviar a primeira mensagem no WhatsApp.",
        formula: "100% − Taxa de Conversão em Contatos",
        benchmark: { bad: "> 95% Alta Fuga", mid: "85% a 95% Normal", good: "< 85% Ótima Retenção" },
        actionGood: "Quase todos os visitantes qualificados chegam e iniciam atendimento com sua equipe.",
        actionMid: "Desistência esperada para o comportamento de tráfego móvel.",
        actionBad: "Muitas pessoas abandonam. Facilite o link de WhatsApp para abrir direto no aplicativo.",
      },
    },

    // 5. Custo por Visitante (CPC)
    {
      label: "Custo por Visitante",
      techLabel: "CUSTO POR CLIQUE (CPC)",
      textValue: BRL(m.CPC),
      sub: "Valor pago por interessado",
      value: Math.min(100, Math.max(0, 100 - (((m.CPC ?? 0) - 0.5) / 2.5) * 100)),
      zones: [
        { from: 0, to: 0.4, color: "#ef4444" },
        { from: 0.4, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.CPC ?? 0) < 0.8
          ? { label: "🟢 CLIQUE MUITO BARATO", color: "#22c55e" }
          : (m.CPC ?? 0) < 1.8
          ? { label: "🟡 PREÇO JUSTO", color: "#f59e0b" }
          : { label: "🔴 CLIQUE CARO", color: "#ef4444" },
      info: {
        category: "AQUISIÇÃO DE TRÁFEGO",
        icon: MousePointerClick,
        what: "Custo médio desembolsado por cada visitante que clicou no anúncio para ver fotos ou detalhes do carro.",
        formula: "Investimento Total ÷ Cliques no Link",
        benchmark: { bad: "> R$ 2,00 Caro", mid: "R$ 0,80 a R$ 1,80 Normal", good: "< R$ 0,80 Barato" },
        actionGood: "Tráfego muito barato entrando no funil com alta eficiência financeira.",
        actionMid: "Custo por clique saudável para o mercado de compra e venda de automóveis.",
        actionBad: "Clique caro encarecendo as conversas. Troque a foto de capa e use fotos com mais iluminação.",
      },
    },

    // 6. Atração Visual do Anúncio (CTR)
    {
      label: "Atração do Anúncio",
      techLabel: "ENGAJAMENTO (CTR)",
      textValue: FMT(m.CTR, "%"),
      sub: "Interesse visual no feed",
      value: Math.min(100, ((m.CTR ?? 0) / 3.0) * 100),
      zones: [
        { from: 0, to: 0.4, color: "#ef4444" },
        { from: 0.4, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.CTR ?? 0) >= 2.0
          ? { label: "🟢 ANÚNCIO MAGNÉTICO", color: "#22c55e" }
          : (m.CTR ?? 0) >= 1.0
          ? { label: "🟡 ATRAÇÃO NORMAL", color: "#f59e0b" }
          : { label: "🔴 FOTO DESINTERESSANTE", color: "#ef4444" },
      info: {
        category: "IMPACTO VISUAL",
        icon: Zap,
        what: "Mede o poder do anúncio de parar o dedo do cliente no feed do Instagram/Facebook e fazê-lo clicar.",
        formula: "(Cliques no Link ÷ Impressões) × 100",
        benchmark: { bad: "< 1,0% Fraco", mid: "1,0% a 2,0% Médio", good: "> 2,0% Excelente" },
        actionGood: "O modelo de veículo ou ângulo da foto parou o feed. Crie novos anúncios com o mesmo estilo.",
        actionMid: "Atração dentro da média. Teste colocar a entrada ou parcela em destaque na foto.",
        actionBad: "Anúncio ignorado. Substitua por fotos reais do pátio tiradas de dia e sem excesso de texto.",
      },
    },

    // 7. Saturação do Público (Fadiga Criativa)
    {
      label: "Saturação do Anúncio",
      techLabel: "FADIGA (FREQUÊNCIA)",
      textValue: FMT(m.avgFreq, "×"),
      sub: "Repetição por pessoa",
      value: gv.fatigue ?? 85,
      zones: [
        { from: 0, to: 0.35, color: "#ef4444" },
        { from: 0.35, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        (m.avgFreq ?? 1.0) <= 1.8
          ? { label: "🟢 PÚBLICO FRESCO", color: "#22c55e" }
          : (m.avgFreq ?? 1.0) <= 2.6
          ? { label: "🟡 INÍCIO DE REPETIÇÃO", color: "#f59e0b" }
          : { label: "🔴 SATURADO: TROCAR FOTOS", color: "#ef4444" },
      info: {
        category: "SATURAÇÃO DE PÚBLICO",
        icon: Flame,
        what: "Quantas vezes a mesma pessoa viu seus anúncios. Quanto mais repete, mais caro o anúncio fica.",
        formula: "Total de Impressões ÷ Pessoas Únicas Alcançadas",
        benchmark: { bad: "> 3,0× Saturado", mid: "1,8× a 2,8× Alerta", good: "1,0× a 1,8× Fresco" },
        actionGood: "Seus anúncios estão alcançando clientes novos todos os dias. Mantenha rodando.",
        actionMid: "Começando a saturar. Prepare novos carros e novas fotos para rodízio preventivo.",
        actionBad: "O cliente já decorou seu anúncio e não clica mais. Pause e coloque outros carros do pátio no ar.",
      },
    },

    // 8. Ritmo de Gasto Diário (Burn Rate)
    {
      label: "Ritmo de Gasto Diário",
      techLabel: "CONSUMO DA VERBA",
      textValue: BRL(m.dailyCost),
      sub: m.activeBudget > 0 ? `Orçamento: ${BRL(m.activeBudget)}/dia` : "Gasto diário consolidado",
      value: gv.scale ?? 75,
      zones: [
        { from: 0, to: 0.5, color: "#ef4444" },
        { from: 0.5, to: 0.8, color: "#f59e0b" },
        { from: 0.8, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        gv.scale >= 80 && gv.scale <= 110
          ? { label: "🟢 CONSUMO NO RITMO", color: "#22c55e" }
          : gv.scale < 70
          ? { label: "🟡 ENTREGA LENTA", color: "#f59e0b" }
          : { label: "🔴 QUEIMA ACELERADA", color: "#ef4444" },
      info: {
        category: "GESTÃO ORÇAMENTÁRIA",
        icon: DollarSign,
        what: "Mede se o Meta Ads está gastando o orçamento diário programado no ritmo correto ou se a entrega travou.",
        formula: "(Gasto Diário Atual ÷ Orçamento Programado) × 100",
        benchmark: { bad: "< 70% Travado", mid: "70% a 85% Lento", good: "85% a 105% Ideal" },
        actionGood: "Ritmo ideal. A plataforma está distribuindo a verba de forma constante.",
        actionMid: "Gasto abaixo do planejado. Aumente o público de interesse ou a área de quilometragem.",
        actionBad: "Consumo travado ou orçamento zerado. Verifique os limites de conta e fundos.",
      },
    },

    // 9. Horário de Entrega (Intensidade Horária)
    {
      label: "Distribuição no Dia",
      techLabel: "PACING HORÁRIO",
      textValue: FMT(gv.hourlyIntensity, "%"),
      sub: "Entrega vs Horário comercial",
      value: gv.hourlyIntensity ?? 50,
      zones: [
        { from: 0, to: 0.35, color: "#f59e0b" },
        { from: 0.35, to: 0.75, color: "#22c55e" },
        { from: 0.75, to: 1.0, color: "#ef4444" },
      ],
      decisionBadge:
        gv.hourlyIntensity >= 35 && gv.hourlyIntensity <= 75
          ? { label: "🟢 ENTREGA LINEAR", color: "#22c55e" }
          : gv.hourlyIntensity < 35
          ? { label: "🟡 INÍCIO LENTO", color: "#f59e0b" }
          : { label: "🔴 GASTOU MUITO CEDO", color: "#ef4444" },
      info: {
        category: "ENTREGA NO TEMPO",
        icon: Activity,
        what: "Se os anúncios estão sendo entregues de forma uniforme enquanto a loja está aberta ou se gastaram tudo cedo.",
        formula: "(Gasto Acumulado ÷ Orçamento Diário) ÷ (Hora Atual ÷ 24)",
        benchmark: { bad: "> 85% Acelerado", mid: "< 35% Lento", good: "35% a 75% Equilibrado" },
        actionGood: "Leads chegando distribuídos ao longo de todo o horário comercial da loja.",
        actionMid: "Consumo concentrado. Garanta que haja vendedores de plantão nos horários de pico.",
        actionBad: "O algoritmo gastou a verba muito rápido pela manhã e deixará a tarde descoberta.",
      },
    },

    // 10. Potencial para Investir Mais (Escala)
    {
      label: "Potencial para Escalar",
      techLabel: "MARGEM DE ESCALA",
      textValue: FMT(gv.momentum, "%"),
      sub: "Pode colocar mais verba?",
      value: gv.momentum ?? 50,
      zones: [
        { from: 0, to: 0.45, color: "#ef4444" },
        { from: 0.45, to: 0.7, color: "#f59e0b" },
        { from: 0.7, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        gv.momentum >= 70
          ? { label: "🟢 PODE ESCALAR (+20%)", color: "#22c55e" }
          : gv.momentum >= 45
          ? { label: "🟡 ESCALA GRADUAL", color: "#f59e0b" }
          : { label: "🔴 NÃO AUMENTAR VERBA", color: "#ef4444" },
      info: {
        category: "DECISÃO DE CRESCIMENTO",
        icon: Rocket,
        what: "Informa ao gestor se a conta está pronta para receber mais verba sem encarecer o custo por comprador.",
        formula: "(Estabilidade de Leilão × 0.4) + (Conversão × 0.35) + (Fadiga × 0.25)",
        benchmark: { bad: "< 45% Instável", mid: "45% a 70% Moderado", good: "> 70% Pronto para Escala" },
        actionGood: "Sinal verde total! Aumente 20% do orçamento nas melhores campanhas para vender mais carros.",
        actionMid: "Aumente o orçamento apenas na campanha com menor CPL do ranking.",
        actionBad: "Não aumente orçamento agora. Corrija primeiro os criativos e a taxa de conversas.",
      },
    },

    // 11. Aproveitamento do Orçamento
    {
      label: "Aproveitamento da Verba",
      techLabel: "SAÚDE DO ORÇAMENTO",
      textValue: FMT(gv.budgetHealth, "%"),
      sub: "Dinheiro em campanhas ativas",
      value: gv.budgetHealth ?? 75,
      zones: [
        { from: 0, to: 0.4, color: "#ef4444" },
        { from: 0.4, to: 0.75, color: "#f59e0b" },
        { from: 0.75, to: 1.0, color: "#22c55e" },
      ],
      decisionBadge:
        gv.budgetHealth >= 80
          ? { label: "🟢 100% APROVEITADO", color: "#22c55e" }
          : gv.budgetHealth >= 50
          ? { label: "🟡 PARCIALMENTE ATIVO", color: "#f59e0b" }
          : { label: "🔴 VERBA PARADA", color: "#ef4444" },
      info: {
        category: "ALOCAÇÃO DE CAPITAL",
        icon: DollarSign,
        what: "Mede se o dinheiro da conta está focado nas campanhas ativas que trazem clientes ou travado em campanhas pausadas.",
        formula: "(Orçamento em Campanhas Ativas ÷ Orçamento Total) × 100",
        benchmark: { bad: "< 50% Disperso", mid: "50% a 80% Parcial", good: "> 80% Concentrado" },
        actionGood: "Capital concentrado e gerando resultados contínuos para o estoque.",
        actionMid: "Parte da verba está em campanhas inativas ou com entrega reduzida.",
        actionBad: "Muito dinheiro parado em campanhas pausadas. Remaneje a verba para as campanhas que trazem mensagens.",
      },
    },
  ];

  // Leilão Telemetry Info
  const thermInfo: GaugeTelemetryInfo = {
    category: "DINÂMICA DE LEILÃO",
    icon: Flame,
    what: "Informa se o custo dos anúncios do Meta Ads está mais caro hoje por conta de disputa de concorrentes na sua região.",
    formula: "(CPM Período Atual ÷ CPM Período Anterior) × 100",
    benchmark: { bad: "> 70% Disputa Alta", mid: "40% a 70% Normal", good: "< 40% Leilão Aberto" },
    actionGood: "Leilão calmo com anúncios baratos. Excelente momento para investir mais e gerar leads baratos.",
    actionMid: "Pressão normal de mercado no segmento automotivo.",
    actionBad: "Leilão em alta disputa (anúncio caro). Abra mais o raio de localização da loja para pegar compradores mais baratos.",
  };

  const criticalCount = gaugeConfig.filter((gc) => gc.value < 40).length;
  const warningCount = gaugeConfig.filter((gc) => gc.value >= 40 && gc.value < 70).length;

  return (
    <div className="min-h-screen w-full pb-24 bg-background text-foreground relative">
      {/* Background Blueprint Grid */}
      <div
        className="absolute inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)",
          backgroundSize: "60px 60px",
          opacity: 0.025,
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto px-4 pt-4 space-y-5">
        {/* ── HEADER ─────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader
            eyebrow="Sistema Vital · Telemetria Automotiva"
            title="Cockpit de Performance"
            description="Painel tático e executivo em tempo real — vendas no WhatsApp, custo por comprador e decisões do dia."
            compact
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-4 py-2.5 backdrop-blur-md shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#22c55e] animate-pulse shadow-[0_0_8px_#22c55e]" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">LIVE</span>
            </div>
            <div className="text-[10px] font-mono text-muted-foreground">{clock || "--:--:--"}</div>
            {criticalCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-red-500/15 border border-red-500/25 px-2 py-1">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                <span className="text-[9px] font-black text-red-500">
                  {criticalCount} CRÍTICO{criticalCount > 1 ? "S" : ""}
                </span>
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1 rounded-md bg-amber-500/15 border border-amber-500/25 px-2 py-1">
                <Radio className="h-3 w-3 text-amber-500" />
                <span className="text-[9px] font-black text-amber-500">{warningCount} ATENÇÃO</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* ── FILTER BAR ─────────────────────────────────────────── */}
        <CockpitFilterBar />

        {/* Context summary */}
        {(accountId !== "all" || campaignId !== "all" || adSetId !== "all") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 text-[9px] font-mono text-muted-foreground"
          >
            <Activity className="h-3 w-3" />
            Filtrando: {accountId !== "all" ? "conta selecionada" : "todas as contas"} ·{" "}
            {campaignId !== "all" ? "campanha selecionada" : "todas as campanhas"} ·{" "}
            {adSetId !== "all" ? "conjunto selecionado" : "todos os conjuntos"} · {dateFrom} → {dateTo}
          </motion.div>
        )}

        {/* ── CENTRAL DE DECISÃO EXECUTIVA (RESUMO COMERCIAL & AÇÕES DIRETAS) ── */}
        {!isLoading && meta && (
          <CentralDecisaoExecutiva
            score={score ?? 0}
            meta={meta}
            recommendations={recommendations}
          />
        )}

        {/* ── SCORE ORB (SIDEBAR) + GAUGES GRID ───────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start">
          {/* Left Column: Score Orb & Trend */}
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-card/60 p-5 backdrop-blur-xl shadow-sm">
            <div className="flex items-center justify-between w-full">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">
                Saúde Comercial da Conta
              </p>
              <Compass className="h-3.5 w-3.5 text-muted-foreground/60" />
            </div>

            <ScoreOrb score={score ?? 0} components={components ?? {}} isLoading={isLoading} />

            {!isLoading && dailyScores?.length > 0 && (
              <div className="w-full border-t border-border pt-4">
                <ScoreHistorico data={dailyScores} />
              </div>
            )}
          </div>

          {/* Right Column: 12 High-Tech Gauges Grid */}
          <div>
            {isLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="rounded-2xl border border-border bg-card/40 backdrop-blur-sm p-5 flex flex-col items-center justify-center gap-3 relative overflow-hidden"
                    style={{ height: 210 }}
                  >
                    <div className="w-20 h-20 rounded-full border-4 border-muted border-t-primary animate-[spin_2.5s_linear_infinite]" />
                    <div className="h-2 w-24 bg-muted rounded-full animate-pulse mt-2" />
                    <div className="h-1.5 w-16 bg-muted/60 rounded-full animate-pulse" />
                  </motion.div>
                ))}
              </div>
            ) : !meta ? (
              <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
                <p className="text-muted-foreground text-sm font-mono font-bold">
                  Nenhuma métrica registrada para o período selecionado
                </p>
                <p className="text-muted-foreground/60 text-xs font-mono mt-1">
                  {dateFrom} → {dateTo}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                {/* 1. Termômetro de Leilão */}
                <CockpitThermometer
                  pressure={gv.pressure ?? 50}
                  label="Disputa no Mercado"
                  sub={`CPM oscilou ${((meta.cpmTrendRatio ?? 1) * 100 - 100).toFixed(0)}% vs histórico`}
                  delay={0}
                  info={thermInfo}
                />

                {/* 2 to 12. Os 11 Relógios com Linguagem Humana e Decisão Direta */}
                {gaugeConfig.map((gc, i) => {
                  const colIdx = (i + 1) % 4;
                  const align: "left" | "center" | "right" =
                    colIdx === 0 ? "right" : colIdx === 1 ? "left" : "center";

                  return (
                    <CockpitGauge
                      key={gc.label}
                      value={gc.value}
                      max={100}
                      label={gc.label}
                      techLabel={gc.techLabel}
                      sub={gc.sub}
                      unit="%"
                      zones={gc.zones}
                      delay={(i + 1) * 0.06}
                      textValue={gc.textValue}
                      decisionBadge={gc.decisionBadge}
                      info={gc.info}
                      alignTooltip={align}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RANKING TÁTICO: COMPRADORES VS OFENSORAS ────────────── */}
        {!isLoading && radar?.length > 0 && <RankingTatico data={radar} />}

        {/* ── RECOMENDAÇÕES INTELIGENTES ─────────────────────────── */}
        {!isLoading && recommendations?.length > 0 && <RecomendacoesInteligentes recs={recommendations} />}

        {/* ── CALLOUT RESUMO VITAL ───────────────────────────────── */}
        {!isLoading && meta && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3"
          >
            {[
              {
                label: "Custo Médio / Comprador",
                value: (meta.realLeads ?? 0) > 0 ? BRL(meta.CPL) : "Sem Contatos",
                icon: <Target className="h-4 w-4" />,
                good: (meta.realLeads ?? 0) > 0 && meta.CPL <= 35,
              },
              {
                label: "Conversão em Contato",
                value: `${meta.CVR?.toFixed(1) ?? "0"}%`,
                icon: <TrendingUp className="h-4 w-4" />,
                good: meta.CVR >= 3.0,
              },
              {
                label: "Saturação de Público",
                value: `${meta.avgFreq?.toFixed(1) ?? "1.0"}×`,
                icon: <Activity className="h-4 w-4" />,
                good: meta.avgFreq <= 2.2,
              },
              {
                label: "Oscilação do Leilão",
                value: `${((meta.cpmTrendRatio - 1) * 100).toFixed(0)}%`,
                icon: <Zap className="h-4 w-4" />,
                good: meta.cpmTrendRatio <= 1.05,
              },
            ].map((item, i) => {
              const col = item.good ? "#22c55e" : "#ef4444";
              return (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border p-3.5 bg-card/60"
                  style={{ borderColor: `${col}25` }}
                >
                  <div
                    className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: `${col}15`, color: col }}
                  >
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground truncate">
                      {item.label}
                    </p>
                    <p className="text-sm font-black font-mono truncate" style={{ color: col }}>
                      {item.value}
                    </p>
                  </div>
                  <div className="ml-auto shrink-0">
                    {item.good ? (
                      <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-[#ef4444] animate-pulse" />
                    )}
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
