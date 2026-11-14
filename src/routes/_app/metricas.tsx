// src/routes/_app/metricas.tsx
// NC Performance Suite — Métricas & Campanhas (Página Unificada)

import { createFileRoute, redirect, useSearch, useNavigate, useLocation, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, Pause, Loader2, RefreshCw, Layers, ChevronDown,
  LayoutGrid, Image as ImageIcon, CheckSquare, Square, Sparkles,
  BarChart3, TrendingUp, DollarSign, Users, MousePointer2, Target, Zap,
  Activity, Eye, Lock, BookOpen, MessageCircle, Car, Video, Globe,
  AlertTriangle, XCircle, CheckCircle2, Info, Settings2,
  ChevronRight, Megaphone, FlaskConical, Pencil,
  BarChart2, PieChart as PieIcon, SlidersHorizontal,
  ShieldAlert, ExternalLink, ArrowRight, Brain,
  Bot, Flame, Snowflake, Thermometer
} from "lucide-react";
import { VictoriaFloatingChat, type ContextItem } from "@/components/victoria/VictoriaFloatingChat";
import { useAccountRules, type AccountRule } from "@/hooks/useAccountRulesAndNotes";
import { listMindMapsByAccount } from "@/components/mindmap/mindMapService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { hasPermissionAccess, isMasterAdmin } from "@/lib/userHierarchy";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useGlobalDate } from "@/contexts/DateContext";
import { PageHeader } from "@/components/PageHeader";
import { useChartConfig } from "@/hooks/useChartConfig";
import { ChartEngine } from "@/components/charts/ChartEngine";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart as RechartsPieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ComposedChart, Line,
} from "recharts";
import { subDays, format, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  calibrateCampaignMetricsArray,
  calibrateAdSetMetricsArray,
  calibrateAdMetricsArray,
  calibratePeriodStatsInMemory,
  ensureDatabaseCalibrated,
  calibrateMetaConversionsFromGraph,
  getMetaResultDetail,
} from "@/lib/metaConversionCalibrator";
import {
  classifyMetaEvent,
  computeUnitCost,
  computeWeightedAggregates,
  evaluateCampaignHealth,
  formatMetricVectorSummary,
  normalizeCampaignItem,
  type MetricVector,
} from "@/lib/metricsDomain";

// â"€â"€â"€ ROTA â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas & Campanhas — NC Suite" }] }),
  beforeLoad: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session) throw redirect({ to: "/login" });
    if (ADMIN_EMAILS.includes(session.user.email || "")) return;
    const { data: profile } = await (supabase as any)
      .from("profiles").select("role, permissions").eq("id", session.user.id).maybeSingle();
    if (profile?.role === "admin") return;
  },
  validateSearch: (s: Record<string, unknown>): { account?: string; campaign?: string; date?: string; view?: string; accountId?: string; campId?: string } => ({
    account: (s.account as string) || (s.accountId as string) || undefined,
    campaign: (s.campaign as string) || (s.campId as string) || undefined,
    date: s.date as string | undefined,
    view: s.view as string | undefined,
    accountId: (s.accountId as string) || (s.account as string) || undefined,
    campId: (s.campId as string) || (s.campaign as string) || undefined,
  }),
  component: MetricasCampanhasPage,
});

// â"€â"€â"€ TIPOS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

type Level      = "campanhas" | "conjuntos" | "anuncios";
type ViewMode   = "gestao" | "analise" | "demograficos";
type ModoId     = "geral" | "eficiencia" | "budget" | "audiencia" | "comparativo";
type InsightLvl = "danger" | "warning" | "success" | "info";

interface Insight { level: InsightLvl; title: string; detail: string; acao: string; camps?: string[]; }

// â"€â"€â"€ CONSTANTES â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const OBJECTIVE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  OUTCOME_LEADS:      { label: "Leads",      color: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: Target },
  LEAD_GENERATION:    { label: "Leads",      color: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: Target },
  MESSAGES:           { label: "Mensagens",  color: "text-blue-400 bg-blue-500/10 border-blue-500/20",       icon: MessageCircle },
  OUTCOME_ENGAGEMENT: { label: "Engaj.",     color: "text-pink-400 bg-pink-500/10 border-pink-500/20",       icon: Zap },
  ENGAGEMENT:         { label: "Engaj.",     color: "text-pink-400 bg-pink-500/10 border-pink-500/20",       icon: Zap },
  OUTCOME_TRAFFIC:    { label: "Tráfego",    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",    icon: Car },
  LINK_CLICKS:        { label: "Tráfego",    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",    icon: Car },
  VIDEO_VIEWS:        { label: "Vídeo",      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",       icon: Video },
  OUTCOME_AWARENESS:  { label: "Alcance",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Users },
  REACH:              { label: "Alcance",    color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Users },
  OUTCOME_SALES:      { label: "Vendas",     color: "text-primary bg-primary/10 border-primary/20",          icon: Target },
  CONVERSIONS:        { label: "Conversões", color: "text-primary bg-primary/10 border-primary/20",          icon: Target },
  VISIT_INSTAGRAM_PROFILE: { label: "Instagram", color: "text-pink-400 bg-pink-500/10 border-pink-500/20", icon: Zap },
  INSTAGRAM_PROFILE:       { label: "Instagram", color: "text-pink-400 bg-pink-500/10 border-pink-500/20", icon: Zap },
  LANDING_PAGE_VIEWS:      { label: "Pág. Destino", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Globe },
  UNKNOWN:                 { label: "Revisar",   color: "text-amber-300 bg-amber-500/10 border-amber-500/30", icon: AlertTriangle },
};

const PLACEMENT_MAP: Record<string, string> = {
  feed: "Feed", story: "Stories", reels: "Reels", marketplace: "Marketplace",
  search: "Busca", video_feeds: "Video Feeds", profile_feed: "Perfil",
  right_hand_column: "Coluna Direita",
};
const PUBLISHER_MAP: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram",
  audience_network: "Aud. Network", messenger: "Messenger",
};
const PUBLISHER_COLOR: Record<string, string> = {
  facebook: "bg-blue-600/15 text-blue-400 border-blue-600/20",
  instagram: "bg-pink-500/15 text-pink-400 border-pink-500/20",
  audience_network: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  messenger: "bg-violet-500/15 text-violet-400 border-violet-500/20",
};

const LEVEL_TABS: { id: Level; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas",          icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos de Anúncios", icon: LayoutGrid },
  { id: "anuncios",  label: "Anúncios",            icon: ImageIcon },
];

const MODOS: Record<ModoId, { label: string; desc: string; icon: any; color: string; foco: string }> = {
  geral:      { label: "Visão Geral",           desc: "Saúde, tendência e KPIs do período",                    icon: Activity,  color: "text-primary",       foco: "Panorama completo — onde a conta está e como chegou aqui." },
  eficiencia: { label: "Diagnóstico",           desc: "Identifique campanhas que drenam budget sem retorno",    icon: Target,    color: "text-orange-400",    foco: "Campanhas com CPL alto, CTR baixo ou gasto sem conversão — pausar ou corrigir." },
  budget:     { label: "Otimização de Budget",  desc: "Redistribua investimento para maximizar resultados",     icon: DollarSign,color: "text-green-400",     foco: "Quem consome mais budget vs quem entrega mais resultado — rebalancear." },
  audiencia:  { label: "Alcance & Frequência",  desc: "Detecte saturação e oportunidades de escala",           icon: Users,     color: "text-violet-400",    foco: "Campanhas com frequência > 3x estão saturando a audiência." },
  comparativo:{ label: "Ranking Comparativo",   desc: "Compare campanhas lado a lado em múltiplos KPIs",       icon: BarChart3, color: "text-blue-400",      foco: "Quais campanhas dominam cada métrica e onde há gaps de performance." },
};

const INSIGHT_ICON: Record<InsightLvl, any> = { danger: XCircle, warning: AlertTriangle, success: CheckCircle2, info: Info };
const INSIGHT_COLOR: Record<InsightLvl, string> = {
  danger:  "border-red-500/30 bg-red-500/5 text-red-400",
  warning: "border-orange-400/30 bg-orange-400/5 text-orange-400",
  success: "border-green-500/30 bg-green-500/5 text-green-400",
  info:    "border-blue-400/30 bg-blue-400/5 text-blue-400",
};

const CHART_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#10b981","#f59e0b","#ef4444","#ec4899","#3b82f6"];

const DECISION_COLORS: Record<string, string> = {
  red:    "text-red-400 border-red-400/30 bg-red-400/5",
  orange: "text-orange-400 border-orange-400/30 bg-orange-400/5",
  yellow: "text-yellow-400 border-yellow-400/30 bg-yellow-400/5",
  green:  "text-green-400 border-green-400/30 bg-green-400/5",
  blue:   "text-blue-400 border-blue-400/30 bg-blue-400/5",
};

// â"€â"€â"€ HELPERS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtN   = (v: number) => v.toLocaleString("pt-BR");
const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function processMetrics(item: any, rawData: any[], startStr: string, endStr: string) {
  const m = (rawData || []).filter((x: any) => { if (!x.date) return true; const d = x.date.split("T")[0]; return d >= startStr && d <= endStr; });
  const cost        = m.reduce((s: number, x: any) => s + Number(x.cost        || 0), 0);
  const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
  const clicks      = m.reduce((s: number, x: any) => s + Number(x.inline_link_clicks ?? x.clicks ?? 0), 0);
  const allClicks   = m.reduce((s: number, x: any) => s + Number(x.all_clicks  ?? x.clicks ?? 0), 0);
  const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
  const reach       = m.reduce((s: number, x: any) => s + Number(x.reach       || 0), 0);
  const purchaseVal = m.reduce((s: number, x: any) => s + Number(x.purchase_value || 0), 0);
  const freq        = reach > 0 ? impressions / reach : 0;
  const ctr         = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const ctrAll      = impressions > 0 ? (allClicks / impressions) * 100 : 0;
  const cpm         = impressions > 0 ? (cost / impressions) * 1000 : 0;
  const cpc         = clicks > 0 ? cost / clicks : 0;
  const roas        = cost > 0 && purchaseVal > 0 ? purchaseVal / cost : null;

  const storedType = m.find((x: any) => x.result_type)?.result_type || item.result_type;
  const resultIndicator = m.find((x: any) => x.result_indicator)?.result_indicator || item.result_indicator || null;
  const optimizationGoal = m.find((x: any) => x.optimization_goal)?.optimization_goal || item.optimization_goal || null;
  const classification = classifyMetaEvent({
    campaignName: item.name + (item.campaigns?.name ? ` ${item.campaigns.name}` : ""),
    rawObjective: item.objective || item.campaigns?.objective,
    resultType: storedType,
    resultsIndicator: resultIndicator || undefined,
    optimizationGoal: optimizationGoal || undefined,
    isVehicleContext: false,
  });
  const effectiveResults = classification.category === "REACH" ? (reach > 0 ? reach : conversions) : conversions;
  const unitCost = computeUnitCost(cost, effectiveResults, classification.category);
  const cpl = unitCost ?? 0;
  const result_type = classification.category;

  return {
    ...item,
    result_type,
    result_indicator: resultIndicator,
    optimization_goal: optimizationGoal,
    t: { cost, conversions, clicks, allClicks, impressions, reach, freq, cpl, ctr, ctrAll, cpm, cpc, roas, purchaseValue: purchaseVal },
    _metrics: m,
  };
}

function gerarInsights(camps: any[], totCost: number, totConv: number, avgCpl: number, avgCtr: number, avgCpm: number): Insight[] {
  const ins: Insight[] = [];
  if (!camps.length) return ins;
  const convEligible = camps.filter(c => ["MESSAGES", "LEADS", "PURCHASES"].includes(c.result_type));
  const zeroConv = convEligible.filter(c => c.t.conversions === 0 && c.t.cost > totCost * 0.03 && c.t.cost > 50);
  if (zeroConv.length) ins.push({ level: "danger", title: `${zeroConv.length} campanha${zeroConv.length>1?"s":""} gastando sem conversão`, detail: `Desperdiçado: R$ ${fmtBRL(zeroConv.reduce((s,c) => s+c.t.cost,0))}`, acao: "Pausar e revisar criativo e segmentação", camps: zeroConv.map(c=>c.name) });
  const highCpl = convEligible.filter(c => c.t.cpl > 0 && avgCpl > 0 && c.t.cpl > avgCpl * 1.8 && c.t.cost > 30);
  if (highCpl.length) ins.push({ level: "warning", title: `${highCpl.length} campanha${highCpl.length>1?"s":""} com CPL acima de 80% da média`, detail: `Média: R$ ${avgCpl.toFixed(2)} — ${highCpl.slice(0,2).map(c=>`${c.name.substring(0,18)}: R$ ${c.t.cpl.toFixed(2)}`).join(", ")}`, acao: "Reduzir budget, testar criativos ou ajustar público", camps: highCpl.map(c=>c.name) });
  const highFreq = camps.filter(c => c.t.freq > 3 && c.t.impressions > 500);
  if (highFreq.length) ins.push({ level: "warning", title: `${highFreq.length} campanha${highFreq.length>1?"s":""} com frequência > 3x (saturação)`, detail: "Audiência vendo o mesmo anúncio repetidamente — CTR tende a cair", acao: "Expandir audiência, renovar criativos ou excluir convertidos", camps: highFreq.map(c=>c.name) });
  const lowCtr = camps.filter(c => c.t.impressions > 1000 && c.t.ctr < 0.5 && c.t.cost > 20);
  if (lowCtr.length) ins.push({ level: "warning", title: `${lowCtr.length} campanha${lowCtr.length>1?"s":""} com CTR abaixo de 0,5%`, detail: "Benchmark Meta Ads: 1—2%. Criativo ou segmentação fraco", acao: "Testar novos hooks, thumbnails e textos", camps: lowCtr.map(c=>c.name) });
  const topEff = convEligible.filter(c => c.t.cpl > 0 && avgCpl > 0 && c.t.cpl < avgCpl * 0.7 && c.t.conversions >= 3 && c.t.cost > 0);
  if (topEff.length) ins.push({ level: "success", title: `${topEff.length} campanha${topEff.length>1?"s":""} com CPL ${Math.round((1-topEff[0].t.cpl/avgCpl)*100)}% abaixo da média — prontas para escalar`, detail: `"${topEff[0].name.substring(0,35)}" — CPL R$ ${topEff[0].t.cpl.toFixed(2)} com ${topEff[0].t.conversions} conversões`, acao: "Aumentar budget 10—20% por dia e monitorar CPL", camps: topEff.map(c=>c.name) });
  const goodCtr = camps.filter(c => c.t.ctr >= 2 && c.t.impressions > 500);
  if (goodCtr.length && !topEff.some(c=>goodCtr.find(g=>g.id===c.id))) ins.push({ level: "success", title: `${goodCtr.length} campanha${goodCtr.length>1?"s":""} com CTR ≥ 2% — acima do benchmark`, detail: `Meta Ads benchmark: 1—1,5%. Campanhas: ${goodCtr.slice(0,2).map(c=>c.name.substring(0,18)).join(", ")}`, acao: "Escalar budget e testar variações do criativo", camps: goodCtr.map(c=>c.name) });
  if (avgCpm > 25) ins.push({ level: "info", title: `CPM médio R$ ${avgCpm.toFixed(2)} — leilão competitivo`, detail: "CPM alto pode indicar público muito disputado ou segmentação restrita", acao: "Testar públicos mais amplos ou similares" });
  if (ins.length === 0 && totConv > 0) ins.push({ level: "info", title: "Conta saudável no período", detail: `${camps.length} campanhas, ${avgCpl > 0 ? `CPL médio R$ ${avgCpl.toFixed(2)}, ` : ""}CTR ${avgCtr.toFixed(2)}%`, acao: "Continue monitorando — considere testes A/B" });
  return ins;
}

function calcHealthScore(c: any, avgCpl: number): number {
  if (c.t.cost === 0 && c.t.impressions === 0) return 50;
  const isConv = ["MESSAGES", "LEADS", "PURCHASES"].includes(c.result_type);
  let score = 100;
  if (isConv) {
    if (c.t.conversions === 0 && c.t.cost > 50) score -= 40;
    else if (c.t.conversions === 0 && c.t.cost > 20) score -= 25;
    if (c.t.cpl > 0 && avgCpl > 0) {
      if (c.t.cpl > avgCpl * 2.5) score -= 25;
      else if (c.t.cpl > avgCpl * 1.8) score -= 15;
      else if (c.t.cpl < avgCpl * 0.7) score += 10;
    }
  }
  if (c.t.impressions > 1000) {
    if (c.t.ctr < 0.5) score -= 25;
    else if (c.t.ctr < 1.0) score -= 12;
    else if (c.t.ctr >= 2.0) score += 10;
  }
  if (c.t.freq > 5) score -= 25;
  else if (c.t.freq > 3.5) score -= 15;
  else if (c.t.freq > 2.5) score -= 8;
  return Math.max(0, Math.min(100, score));
}

function getDecision(c: any, avgCpl: number, accountTargetCpl?: number | null): { label: string; tier: string; reason: string; action: string } {
  const normalized = normalizeCampaignItem({
    id: c.id,
    name: c.name,
    cost: Number(c.t?.cost || 0),
    conversions: Number(c.t?.conversions || 0),
    clicks: Number(c.t?.clicks || 0),
    impressions: Number(c.t?.impressions || 0),
    reach: Number(c.t?.reach || 0),
    rawObjective: c.objective || c.campaigns?.objective,
    resultType: c.result_type,
    isVehicleContext: true,
  });

  const diag = evaluateCampaignHealth({
    item: normalized,
    targetCandidates: {
      accountThresholdMaxCpl: accountTargetCpl && accountTargetCpl > 0 ? accountTargetCpl : null,
      regionalBenchmarkCpl: avgCpl > 0 ? avgCpl : null,
    },
    minSpendForPauseDecision: 50,
    minResultsForScale: 3,
  });

  const tier =
    diag.status === "PAUSAR"
      ? "red"
      : diag.status === "OTIMIZAR"
      ? "orange"
      : diag.status === "ESCALAR"
      ? "green"
      : diag.status === "AGUARDAR_AMOSTRA"
      ? "yellow"
      : "blue";

  return {
    label: diag.status === "AGUARDAR_AMOSTRA" ? "MONITORAR" : diag.status,
    tier,
    reason: diag.headline,
    action: diag.recommendation,
  };
}

export function getCampaignTemperature(c: any, avgCpl: number): {
  temp: "hot" | "warm" | "cold";
  label: string;
  badgeClass: string;
  icon: any;
  reason: string;
} {
  const cost = c.t?.cost || 0;
  const convs = c.t?.conversions || 0;
  const cpl = c.t?.cpl || 0;
  const ctr = c.t?.ctr || 0;
  const freq = c.t?.freq || 1;
  const cat = c.result_type || "";
  const isAwareness = cat === "REACH" || cat === "VIDEO_VIEWS" || cat === "ENGAGEMENT";
  const isConvGoal = cat === "MESSAGES" || cat === "LEADS" || cat === "PURCHASES";

  if (cost <= 0 && convs <= 0) {
    return {
      temp: "warm",
      label: "Morna",
      badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      icon: Zap,
      reason: "Sem gasto registrado no período para diagnóstico térmico"
    };
  }

  if (isAwareness) {
    if (freq > 4.2) {
      return {
        temp: "cold",
        label: "Fria",
        badgeClass: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]",
        icon: Snowflake,
        reason: `Alcance/Frequência ${freq.toFixed(1)}x saturando a audiência`
      };
    }
    return {
      temp: "warm",
      label: "Morna",
      badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
      icon: Zap,
      reason: `Campanha de ${cat === "REACH" ? "alcance" : "topo de funil"} — avaliada por CPM/alcance (não por WhatsApp)`
    };
  }

  // 1. Fria / Congelada
  if (
    (isConvGoal && convs === 0 && cost > 25) ||
    (isConvGoal && cpl > 0 && avgCpl > 0 && cpl > avgCpl * 1.5) ||
    (ctr < 0.8 && cost > 20 && !isAwareness) ||
    freq > 3.8
  ) {
    return {
      temp: "cold",
      label: "Fria",
      badgeClass: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.2)]",
      icon: Snowflake,
      reason: convs === 0
        ? `Alerta: R$ ${cost.toFixed(2)} gastos sem nenhuma conversão`
        : cpl > avgCpl * 1.5
        ? `CPL R$ ${cpl.toFixed(2)} (${Math.round((cpl / avgCpl - 1) * 100)}% acima da meta)`
        : `Frequência ${freq.toFixed(1)}x saturando o leilão`
    };
  }

  // 2. Quente / Em Chamas
  if (
    isConvGoal &&
    ((cpl > 0 && avgCpl > 0 && cpl <= avgCpl * 0.85 && convs >= 2) ||
      (convs >= 4 && ctr >= 1.5))
  ) {
    return {
      temp: "hot",
      label: "Quente",
      badgeClass: "border-rose-500/50 bg-gradient-to-r from-rose-500/20 to-amber-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] animate-pulse",
      icon: Flame,
      reason: `CPL R$ ${cpl.toFixed(2)} altamente eficiente · Pronta para acelerar verba`
    };
  }

  // 3. Morna
  return {
    temp: "warm",
    label: "Morna",
    badgeClass: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    icon: Zap,
    reason: "Performance equilibrada dentro do benchmark operacional"
  };
}
function generateLocalDiagnostic(item: any, avgCpl: number): string {
  const { cost, conversions, clicks, impressions, reach, freq, cpl, ctr, cpm, cpc } = item.t;
  const cplStr = cpl > 0 ? `R$ ${cpl.toFixed(2)}` : "N/A";
  const costStr = `R$ ${cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const avgCplStr = avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "N/A";
  
  let diag = `### 🤖 Diagnóstico da Victoria IA\n\n`;
  
  if (conversions === 0 && cost > 30) {
    diag += `⚠️ **Desempenho Crítico:** Esta campanha gastou **${costStr}** e não gerou nenhuma conversão/lead. Há um vazamento de verba ativo que precisa de intervenção imediata.\n\n`;
  } else if (cpl > 0 && avgCpl > 0 && cpl > avgCpl * 1.5) {
    diag += `⚠️ **Desempenho Preocupante:** O custo por lead de **${cplStr}** está significativamente acima da média da conta (**${avgCplStr}**). A campanha gera resultados, mas a eficiência financeira está comprometida.\n\n`;
  } else if (conversions > 2 && cpl > 0 && avgCpl > 0 && cpl < avgCpl * 0.8) {
    diag += `🔥 **Excelente Performance!** A campanha está operando com altíssima eficiência. O CPL de **${cplStr}** está abaixo da média geral da conta, e o volume de conversões indica que o público está respondendo muito bem.\n\n`;
  } else {
    diag += `📈 **Desempenho Estável:** A campanha exibe métricas de custo e conversão equilibradas. Apresenta tração inicial saudável no período avaliado.\n\n`;
  }

  diag += `#### 📍 Análise de Gargalos:\n`;
  let gargalos = false;
  
  if (ctr < 1.0 && impressions > 1000) {
    diag += `- 📉 **CTR Baixo (${ctr.toFixed(2)}%):** A taxa de clique está abaixo de 1%. Isso indica que o criativo (imagem/vídeo) não está chamando a atenção necessária ou a copy está fraca para o público selecionado.\n`;
    gargalos = true;
  }
  if (freq > 3.0) {
    diag += `- ⚠️ **Saturação de Público (Frequência ${freq.toFixed(1)}x):** A audiência está vendo o mesmo anúncio repetidamente no período. Isso desgasta a campanha, eleva o CPM e reduz o CTR.\n`;
    gargalos = true;
  }
  if (cpm > 30) {
    diag += `- 💸 **CPM Elevado (R$ ${cpm.toFixed(2)}):** O custo por mil impressões está alto, indicando forte concorrência no leilão ou que o público selecionado é excessivamente restrito.\n`;
    gargalos = true;
  }
  if (!gargalos) {
    diag += `- ✨ Não foram detectadas anomalias graves nas métricas secundárias (CTR, Frequência e CPM estão dentro de limites saudáveis).\n`;
  }

  diag += `\n#### 💡 Recomendações Práticas:\n`;
  if (conversions === 0 && cost > 30) {
    diag += `1. **Pausar o anúncio** para estancar o gasto sem conversão.\n`;
    diag += `2. Revisar o formulário ou página de destino para certificar-se de que não há falhas técnicas.\n`;
    diag += `3. Testar criativos mais chamativos com propostas de valor diferentes.\n`;
  } else if (freq > 3.0) {
    diag += `1. **Ampliar o público-alvo** (adicionar novos interesses ou expandir a localização).\n`;
    diag += `2. Inserir novos criativos no conjunto para rotacionar as imagens/vídeos exibidos.\n`;
    diag += `3. Criar público de exclusão de quem já converteu (leads) nos últimos 30 dias.\n`;
  } else if (ctr < 1.0) {
    diag += `1. **Testar novas variações de criativos** focando em ganchos fortes nos primeiros 3 segundos.\n`;
    diag += `2. Trocar a headline e a oferta principal no anúncio.\n`;
  } else if (cpl > 0 && avgCpl > 0 && cpl < avgCpl * 0.8 && conversions > 2) {
    diag += `1. **Escalar o orçamento** de forma gradual (10% a 20% ao dia) para não resetar a fase de aprendizado do leilão.\n`;
    diag += `2. Criar um público Semelhante (Lookalike) a partir do público que já converteu.\n`;
  } else {
    diag += `1. Manter a campanha em monitoramento ativo.\n`;
    diag += `2. Realizar testes A/B pontuais nas copys secundárias.\n`;
  }

  return diag;
}

function parseMarkdown(text: string) {
  if (!text) return null;
  return text.split("\n").map((line, index) => {
    let content = line;
    if (content.startsWith("### ")) {
      return <h3 key={index} className="text-sm font-black text-foreground uppercase mt-4 mb-2 tracking-wider">{content.replace("### ", "")}</h3>;
    }
    if (content.startsWith("#### ")) {
      return <h4 key={index} className="text-xs font-black text-primary uppercase mt-3 mb-1.5 tracking-wide">{content.replace("#### ", "")}</h4>;
    }
    if (content.startsWith("- ")) {
      const formatted = parseBold(content.replace("- ", ""));
      return <li key={index} className="text-[11px] text-muted-foreground list-none pl-3 border-l border-white/10 my-1">{formatted}</li>;
    }
    if (content.trim() === "") return <div key={index} className="h-2" />;
    const formatted = parseBold(content);
    return <p key={index} className="text-[11px] text-muted-foreground leading-relaxed my-1.5">{formatted}</p>;
  });
}

function parseBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-foreground font-extrabold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

// â"€â"€â"€ SUB-COMPONENTES â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function ObjectiveBadge({ objective, name: _name, resultType }: { objective?: string; name?: string; resultType?: string }) {
  const res = (resultType || "").toUpperCase();
  const obj = (objective || "").toUpperCase();

  const isMsg = res === "MESSAGES" || obj === "MESSAGES";
  const isInsta = res === "INSTAGRAM_PROFILE" || obj === "VISIT_INSTAGRAM_PROFILE" || obj === "INSTAGRAM_PROFILE";
  const isPurchases = res === "PURCHASES" || obj === "OUTCOME_SALES" || obj === "CONVERSIONS";
  const isLp = res === "LANDING_PAGE_VIEWS" || obj === "LANDING_PAGE_VIEWS";
  const isLeads = res === "LEADS" || obj === "OUTCOME_LEADS" || obj === "LEAD_GENERATION";
  const isReach = res === "REACH" || obj === "OUTCOME_AWARENESS" || obj === "REACH";
  const isVideo = res === "VIDEO_VIEWS" || obj === "VIDEO_VIEWS";
  const isClicks = res === "LINK_CLICKS";
  const isEngagement = res === "ENGAGEMENT" || obj === "ENGAGEMENT";

  const effectiveObjective = isMsg ? "MESSAGES" :
                             isInsta ? "INSTAGRAM_PROFILE" :
                             isPurchases ? "OUTCOME_SALES" :
                             isLp ? "LANDING_PAGE_VIEWS" :
                             isLeads ? "OUTCOME_LEADS" :
                             isReach ? "REACH" :
                             isVideo ? "VIDEO_VIEWS" :
                             isClicks ? "LINK_CLICKS" :
                             isEngagement ? "ENGAGEMENT" :
                             (OBJECTIVE_MAP[obj] ? obj : OBJECTIVE_MAP[res] ? res : "UNKNOWN");

  if (!effectiveObjective) return null;
  const def = OBJECTIVE_MAP[effectiveObjective] || OBJECTIVE_MAP["UNKNOWN"];
  if (!def) return <span className="text-[8px] font-mono text-muted-foreground/60 uppercase">{effectiveObjective.replace("OUTCOME_","")}</span>;
  const Icon = def.icon;
  return <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${def.color}`}><Icon className="h-2.5 w-2.5" />{def.label}</span>;
}

function LearningBadge() {
  return <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-500 animate-pulse"><BookOpen className="h-2.5 w-2.5"/>Aprendendo</span>;
}

function ChartCard({ 
  icon, 
  title, 
  badge, 
  context, 
  children,
  modoExplicativo,
  didaticInfo
}: { 
  icon: React.ReactNode; 
  title: string; 
  badge?: string; 
  context?: string; 
  children: React.ReactNode;
  modoExplicativo?: boolean;
  didaticInfo?: { analise: string; decisao: string };
}) {
  const [showCtx, setShowCtx] = useState(false);
  return (
    <motion.div 
      initial={{ opacity: 0, y: 12 }} 
      animate={{ opacity: 1, y: 0 }} 
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="glass-panel card-sport p-5 border border-white/[0.08]"
    >
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <p className="text-xs font-black uppercase tracking-widest header-sport">{title}</p>
        <div className="ml-auto flex items-center gap-2">
          {badge && <span className="text-[9px] text-muted-foreground/50 font-mono hidden sm:inline">{badge}</span>}
          {context && <button onClick={() => setShowCtx(v => !v)} className={`rounded-md p-1 transition-colors ${showCtx ? "text-primary bg-primary/10" : "text-muted-foreground/40 hover:text-primary"}`}><Info className="h-3.5 w-3.5"/></button>}
        </div>
      </div>
      <AnimatePresence>
        {showCtx && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-3 rounded-xl border border-blue-400/20 bg-blue-400/5 px-4 py-3"><p className="text-[11px] text-blue-300 leading-snug">{context}</p></motion.div>}
      </AnimatePresence>
      
      {children}

      {modoExplicativo && didaticInfo && (
        <motion.div 
          initial={{ opacity: 0, height: 0 }} 
          animate={{ opacity: 1, height: "auto" }} 
          className="mt-4 pt-3 border-t border-white/5 space-y-2 text-[10px] text-muted-foreground bg-white/[0.005] -mx-5 -mb-5 px-5 pb-5 rounded-b-xl"
        >
          <div className="flex items-start gap-1.5 leading-relaxed">
            <span className="text-[11px] shrink-0">📊</span>
            <div>
              <span className="font-bold text-foreground">O que analisa: </span>
              {didaticInfo.analise}
            </div>
          </div>
          <div className="flex items-start gap-1.5 leading-relaxed">
            <span className="text-[11px] shrink-0">💡</span>
            <div>
              <span className="font-bold text-primary">Tomada de Decisão: </span>
              {didaticInfo.decisao}
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

// â"€â"€â"€ KPI BAR COMPONENT â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface KPIBarProps {
  totCost: number;
  totConv: number;
  avgCpl: number;
  totImpr: number;
  totReach: number;
  totClicks: number;
  totAllClicks?: number;
  avgCtr: number;
  avgCtrAll?: number;
  avgCpm: number;
  reachLabel?: string;
  metricVector?: MetricVector;
}

function KPIBar({
  totCost,
  totConv,
  avgCpl,
  totImpr,
  totReach,
  totClicks,
  totAllClicks,
  avgCtr,
  avgCtrAll,
  avgCpm,
  reachLabel = "Alcance",
  metricVector,
}: KPIBarProps) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const vectorEntries = metricVector ? formatMetricVectorSummary(metricVector) : [];
  const isMixed = vectorEntries.length > 1;
  const primaryEntry = vectorEntries[0];
  const vectorSummaryText = vectorEntries.map(e => `${fmtN(e.value)} ${e.label.toLowerCase()}`).join(" • ");
  const resultsDisplay = metricVector
    ? (isMixed ? vectorSummaryText : fmtN(primaryEntry?.value ?? totConv))
    : fmtN(totConv);
  const cplLabel = !isMixed && primaryEntry?.key === "reach"
    ? "Custo / 1k Alc."
    : isMixed
    ? "CPA Elegível"
    : "CPL / CPA";
  const clicksSub = typeof totAllClicks === "number" && totAllClicks > totClicks
    ? `Todos: ${fmtN(totAllClicks)}`
    : undefined;
  const ctrSub = typeof avgCtrAll === "number" && avgCtrAll > avgCtr
    ? `Todos: ${avgCtrAll.toFixed(2)}%`
    : undefined;

  const kpiItems = [
    { label: "Gasto",          value: `R$ ${fmtBRL(totCost)}`,                         color: "text-primary",          icon: DollarSign,    sub: undefined },
    { label: isMixed ? "Resultados (Tipo)" : "Resultados", value: resultsDisplay,      color: "text-violet-400",       icon: Target,        sub: isMixed ? "Sem soma mista" : undefined },
    { label: cplLabel,         value: avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—",    color: "text-primary",          icon: Zap,           sub: undefined },
    { label: "Impressões",     value: fmtN(totImpr),                                   color: "text-muted-foreground", icon: Eye,           sub: undefined },
    { label: reachLabel,       value: totReach > 0 ? fmtN(totReach) : "—",             color: "text-muted-foreground", icon: Users,         sub: undefined },
    { label: "Cliques (Link)", value: fmtN(totClicks),                                 color: "text-muted-foreground", icon: MousePointer2, sub: clicksSub },
    { label: "CTR Link",       value: `${avgCtr.toFixed(2)}%`,                         color: avgCtr >= 1.5 ? "text-green-400" : "text-muted-foreground", icon: TrendingUp, sub: ctrSub },
    { label: "CPM Médio",      value: avgCpm > 0 ? `R$ ${avgCpm.toFixed(2)}` : "—",    color: "text-muted-foreground", icon: BarChart3,     sub: undefined },
  ];

  return (
    <motion.div
      className="flex w-full items-stretch overflow-x-auto rounded-xl border border-border bg-card/60 backdrop-blur-sm divide-x divide-border scrollbar-hide"
      animate={{ opacity: 1 }} initial={{ opacity: 0 }}
    >
      {kpiItems.map(k => (
        <div key={k.label} className={`flex-1 min-w-[130px] transition-all duration-300 hover:bg-white/[0.02] ${scrolled ? "px-3 py-1.5" : "px-4 py-2.5"}`} title={k.sub ? `${k.label}: ${k.value} (${k.sub})` : `${k.label}: ${k.value}`}>
          {scrolled ? (
            <div className="flex items-center gap-1.5">
              <k.icon className={`h-3 w-3 flex-shrink-0 ${k.color}`} />
              <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">{k.label}</span>
              <span className={`font-mono font-black text-[11px] whitespace-nowrap truncate max-w-[160px] ${k.color}`}>{k.value}</span>
            </div>
          ) : (
            <div className="flex flex-col justify-center gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">{k.label}</span>
                <k.icon className={`h-3 w-3 flex-shrink-0 ${k.color}`} />
              </div>
              <span className={`font-mono font-black tracking-tight whitespace-nowrap truncate ${isMixed && k.label.startsWith("Resultados") ? "text-[11px]" : "text-[13px]"} ${k.color}`}>{k.value}</span>
              {k.sub && <span className="text-[9px] font-mono text-muted-foreground/70 whitespace-nowrap truncate">{k.sub}</span>}
            </div>
          )}
        </div>
      ))}
    </motion.div>
  );
}

// â"€â"€â"€ TOOLTIP CUSTOMIZADO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-background/95 px-3 py-2.5 text-[11px] shadow-2xl backdrop-blur-md space-y-1">
      {label && <p className="font-black text-foreground mb-1">{label}</p>}
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-mono">{p.name}: {typeof p.value === "number" ? (p.name?.toLowerCase().includes("r$") || p.dataKey?.includes("cost") || p.dataKey?.includes("cpl") || p.dataKey?.includes("cpm") || p.dataKey?.includes("cpc") ? `R$ ${fmtBRL(p.value)}` : fmtN(p.value)) : p.value}</p>
      ))}
    </div>
  );
};

// â"€â"€â"€ COMPONENTE PRINCIPAL â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function MetricasCampanhasPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchParams = useSearch({ from: "/_app/metricas" });

  // â"€â"€ Perfil + acesso â"€â"€
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
      return data as { role: string; permissions: Record<string, boolean> } | null;
    },
    enabled: !!user?.id,
  });
  const isAdmin =
    isMasterAdmin({ email: user?.email, id: user?.id }) ||
    profileData?.role === "admin" ||
    profileData?.role === "master_admin";
  const hasAccess =
    isAdmin ||
    hasPermissionAccess(profileData?.permissions as any, "metricas");

  // â"€â"€ Estado global compartilhado â"€â"€
  const [view,          setView]          = useState<ViewMode>("gestao");
  const [level,         setLevel]         = useState<Level>("campanhas");
  const { dateFrom, dateTo, setDateFrom, setDateTo, accountId: globalAccountId, setAccountId: setGlobalAccountId } = useGlobalDate();
  const targetAccount = searchParams.account || searchParams.accountId || globalAccountId || "all";
  const targetCampaign = searchParams.campaign || searchParams.campId || null;
  const [accountFilter, setAccountFilterState] = useState(targetAccount);
  const setAccountFilter = useCallback((acc: string) => {
    setAccountFilterState(acc);
    setGlobalAccountId(acc || "all");
  }, [setGlobalAccountId]);
  const [statusFilter,  setStatusFilter]  = useState<"all"|"active"|"paused">("all");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(targetCampaign);
  const [search,        setSearch]        = useState("");

  const dateRange = useMemo(() => ({
    startDate: new Date(dateFrom + "T12:00:00"),
    endDate: new Date(dateTo + "T12:00:00")
  }), [dateFrom, dateTo]);

  const setDateRange = useCallback((range: { startDate: Date; endDate: Date }) => {
    setDateFrom(getLocalDateStr(range.startDate));
    setDateTo(getLocalDateStr(range.endDate));
  }, [setDateFrom, setDateTo]);

  const [modoExplicativo, setModoExplicativo] = useState(true);
  const [temperatureMode, setTemperatureMode] = useState(false);
  const [temperatureFilter, setTemperatureFilter] = useState<"all" | "hot" | "warm" | "cold">("all");

  // Victoria AI Floating Chat
  const [isFloatingChatOpen, setIsFloatingChatOpen] = useState(false);
  const [floatingChatContext, setFloatingChatContext] = useState<ContextItem | null>(null);

  // â"€â"€ Estado de seleção (tabela) â"€â"€
  const [selectedCamps,  setSelectedCamps]  = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());
  const [selectedAds,    setSelectedAds]    = useState<Set<string>>(new Set());
  const [changingId,     setChangingId]     = useState<string | null>(null);
  const [auditData,      setAuditData]      = useState<any[]|null>(null);
  const [isAuditing,     setIsAuditing]     = useState(false);
  const [visibleCount,   setVisibleCount]   = useState(40);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [includeNoDelivery, setIncludeNoDelivery] = useState(false);

  useEffect(() => {
    setVisibleCount(40);
  }, [search, level, accountFilter, statusFilter]);

  useEffect(() => {
    setSelectedCamps(new Set());
    setSelectedAdSets(new Set());
    setSelectedAds(new Set());
  }, [accountFilter]);

  // ── Regras e Mapas Mentais da Conta Selecionada ──
  const { rules: activeAccountRules = [] } = useAccountRules(accountFilter !== "all" ? accountFilter : null);

  const { data: accountMindMaps = [] } = useQuery({
    queryKey: ["metricas_mind_maps", accountFilter],
    queryFn: () => listMindMapsByAccount(accountFilter),
    enabled: accountFilter !== "all",
  });

  const campaignRulesMap = useMemo(() => {
    const map = new Map<string, AccountRule[]>();
    activeAccountRules.forEach((rule) => {
      if (rule.campaign_id) {
        const list = map.get(rule.campaign_id) || [];
        list.push(rule);
        map.set(rule.campaign_id, list);
      }
    });
    return map;
  }, [activeAccountRules]);

  // â"€â"€ Estado de análise (charts) â"€â"€
  const [modo,            setModo]            = useState<ModoId>("geral");
  const [showSettings,    setShowSettings]    = useState(true);
  const [expandedInsight, setExpandedInsight] = useState<number|null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [lastRefresh,     setLastRefresh]     = useState(new Date());
  const intervalRef    = useRef<ReturnType<typeof setInterval>|null>(null);

  // â"€â"€ Estado do Campaign Inspector â"€â"€
  const [selectedFocusItem, setSelectedFocusItem] = useState<any | null>(null);
  const [aiInsightText, setAiInsightText] = useState("");
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);



  // â"€â"€ Efeitos â"€â"€

  useEffect(() => {
    const acc = searchParams.account || searchParams.accountId;
    if (acc) setAccountFilter(acc);
    const camp = searchParams.campaign || searchParams.campId;
    if (camp) {
      setSelectedCampaignId(camp);
      setTimeout(() => { const el = document.getElementById(`row-${camp}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 600);
    }
    if (searchParams.date) {
      const parsed = new Date(searchParams.date + "T12:00:00");
      if (!isNaN(parsed.getTime())) setDateRange({ startDate: parsed, endDate: parsed });
    }
    if (searchParams.view && (["gestao", "analise", "demograficos"] as string[]).includes(searchParams.view)) {
      setView(searchParams.view as ViewMode);
    }
  }, [searchParams.account, searchParams.accountId, searchParams.campaign, searchParams.campId, searchParams.date, searchParams.view]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => { qc.invalidateQueries({ queryKey: ["mc-camps"] }); setLastRefresh(new Date()); }, refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval, qc]);

  // Auto-sync desta página REMOVIDO: ele re-sincronizava o período inteiro
  // selecionado (até um mês!) a cada 3 min, estourando o rate limit da API do
  // Meta ("too many calls to this ad-account"). O useAutoSync global já mantém
  // D-1+D0 atualizados; períodos maiores são sincronizados pelo botão Sync.

  // â"€â"€â"€ QUERIES â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => { const { data } = await supabase.from("ad_accounts").select("*").order("name"); return data || []; },
  });

  const { data: alertThresholds = [] } = useQuery({
    queryKey: ["alert_thresholds"],
    queryFn: async () => { const { data } = await (supabase as any).from("alert_thresholds").select("ad_account_id, max_cpl, is_active").eq("is_active", true); return (data as any[]) || []; },
  });

  const startStr = getLocalDateStr(dateRange.startDate);
  const endStr   = getLocalDateStr(dateRange.endDate);

  const { data: campaigns = [], isFetching: isFetchingCamps, isLoading: isLoadingCamps } = useQuery({
    queryKey: ["mc-camps", accountFilter, statusFilter, startStr, endStr],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      ensureDatabaseCalibrated(supabase).catch(() => {});
      const buildQuery = (withExtended: boolean) => {
        const metricsCols = withExtended
          ? "cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, optimization_goal, result_indicator, purchase_value, reach, frequency, date, result_type"
          : "cost, conversions, impressions, clicks, reach, frequency, date, result_type";
        let q = (supabase as any)
          .from("campaigns")
          .select(`id, name, status, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, external_id, ad_account_id, ad_account:ad_accounts(name), metrics(${metricsCols})`);
        if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
        if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
        return q;
      };
      const all: any[] = [];
      let useExtended = true;
      for (let from = 0; from < 5000; from += 1000) {
        let { data, error } = await buildQuery(useExtended).order("name").order("id").range(from, from + 999);
        if (error && useExtended && (error.code === "42703" || error.code === "PGRST204" || String(error.message || "").includes("column"))) {
          useExtended = false;
          ({ data, error } = await buildQuery(false).order("name").order("id").range(from, from + 999));
        }
        if (error) throw error;
        if (!data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all.map((c: any) =>
        processMetrics(c, calibrateCampaignMetricsArray(c.name, c.metrics), startStr, endStr)
      );
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const selectedCampaignObj = useMemo(() => {
    if (!selectedCampaignId) return null;
    return campaigns.find((c: any) => c.id === selectedCampaignId) || null;
  }, [selectedCampaignId, campaigns]);

  const campaignIdsInAccount = useMemo(
    () => campaigns.map((c: any) => c.id).filter(Boolean).slice().sort(),
    [campaigns]
  );

  const selectedCampsKey = useMemo(() => Array.from(selectedCamps).sort().join(","), [selectedCamps]);
  const selectedAdSetsKey = useMemo(() => Array.from(selectedAdSets).sort().join(","), [selectedAdSets]);
  const campaignIdsKey = useMemo(() => campaignIdsInAccount.join(","), [campaignIdsInAccount]);

  const { data: adSets = [], isLoading: isLoadingAdSets } = useQuery({
    queryKey: ["mc-adsets", accountFilter, selectedCampaignId || selectedCampsKey, campaignIdsKey, statusFilter, startStr, endStr],
    enabled: level === "conjuntos" || level === "anuncios" || !!selectedCampaignId,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const targetCampIds = selectedCampaignId
        ? [selectedCampaignId]
        : selectedCamps.size > 0
          ? Array.from(selectedCamps).sort()
          : accountFilter !== "all"
            ? campaignIdsInAccount
            : null;
      if (targetCampIds !== null && targetCampIds.length === 0) return [];
      const buildQuery = (withExtended: boolean, chunkIds: string[] | null) => {
        const metricCols = withExtended
          ? "cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, optimization_goal, result_indicator, purchase_value, reach, date, result_type"
          : "cost, conversions, impressions, clicks, reach, date";
        let q = (supabase as any)
          .from("ad_sets")
          .select(`id, name, status, budget, external_id, campaign_id, campaigns(id, name, objective), asset_metrics(${metricCols})`);
        if (chunkIds) q = q.in("campaign_id", chunkIds);
        if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
        return q;
      };
      const chunks: (string[] | null)[] = targetCampIds === null
        ? [null]
        : Array.from({ length: Math.ceil(targetCampIds.length / 200) }, (_, i) => targetCampIds.slice(i * 200, (i + 1) * 200));
      const all: any[] = [];
      let useExtended = true;
      for (const chunkIds of chunks) {
        for (let from = 0; from < 10000; from += 1000) {
          let { data, error } = await buildQuery(useExtended, chunkIds).order("name").order("id").range(from, from + 999);
          if (error && useExtended && (error.code === "42703" || error.code === "PGRST204" || String(error.message || "").includes("column"))) {
            useExtended = false;
            ({ data, error } = await buildQuery(false, chunkIds).order("name").order("id").range(from, from + 999));
          }
          if (error) throw error;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
      }
      return all.map((c: any) =>
        processMetrics(c, calibrateAdSetMetricsArray(c.name, c.asset_metrics), startStr, endStr)
      );
    },
  });

  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ["mc-ads", accountFilter, selectedAdSetsKey, selectedCampaignId || selectedCampsKey, campaignIdsKey, statusFilter, startStr, endStr],
    enabled: true,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const targetCampIds = selectedCampaignId
        ? [selectedCampaignId]
        : selectedCamps.size > 0
          ? Array.from(selectedCamps).sort()
          : accountFilter !== "all"
            ? campaignIdsInAccount
            : null;
      if (selectedAdSets.size === 0 && targetCampIds !== null && targetCampIds.length === 0) return [];
      const buildQuery = (withExtended: boolean, chunkAdSetIds: string[] | null, chunkCampIds: string[] | null) => {
        const metricCols = withExtended
          ? "cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, optimization_goal, result_indicator, purchase_value, reach, date, result_type"
          : "cost, conversions, impressions, clicks, reach, date";
        let q = (supabase as any)
          .from("ads")
          .select(`id, name, status, external_id, campaign_id, ad_set_id, creative_url, campaigns(id, name, objective), asset_metrics(${metricCols})`);
        if (chunkAdSetIds) q = q.in("ad_set_id", chunkAdSetIds);
        else if (chunkCampIds) q = q.in("campaign_id", chunkCampIds);
        if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
        return q;
      };
      const adSetChunks: (string[] | null)[] = selectedAdSets.size > 0
        ? Array.from({ length: Math.ceil(selectedAdSets.size / 200) }, (_, i) => Array.from(selectedAdSets).sort().slice(i * 200, (i + 1) * 200))
        : [];
      const campChunks: (string[] | null)[] = selectedAdSets.size === 0
        ? (targetCampIds === null
            ? [null]
            : Array.from({ length: Math.ceil(targetCampIds.length / 200) }, (_, i) => targetCampIds.slice(i * 200, (i + 1) * 200)))
        : [];
      const iterations = adSetChunks.length > 0
        ? adSetChunks.map(a => ({ adSets: a, camps: null as string[] | null }))
        : campChunks.map(c => ({ adSets: null as string[] | null, camps: c }));

      const all: any[] = [];
      let useExtended = true;
      for (const it of iterations) {
        for (let from = 0; from < 20000; from += 1000) {
          let { data, error } = await buildQuery(useExtended, it.adSets, it.camps).order("name").order("id").range(from, from + 999);
          if (error && useExtended && (error.code === "42703" || error.code === "PGRST204" || String(error.message || "").includes("column"))) {
            useExtended = false;
            ({ data, error } = await buildQuery(false, it.adSets, it.camps).order("name").order("id").range(from, from + 999));
          }
          if (error) throw error;
          all.push(...(data || []));
          if (!data || data.length < 1000) break;
        }
      }
      return all.map((c: any) =>
        processMetrics(c, calibrateAdMetricsArray(c.name, c.asset_metrics), startStr, endStr)
      );
    },
  });

  // Alcance e frequência reais do período (query sem time_increment → exato como Gerenciador)
  const { data: periodStats = [] } = useQuery({
    queryKey: ["mc-period-stats", accountFilter, startStr, endStr],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const buildQ = (withExtended: boolean, from: number) => {
        const cols = withExtended
          ? "entity_type, entity_id, reach, impressions, frequency, spend, conversions, clicks, inline_link_clicks, all_clicks, result_type, result_indicator, optimization_goal, quality_ranking, engagement_rate_ranking, conversion_rate_ranking"
          : "entity_type, entity_id, reach, impressions, frequency, spend, conversions, clicks, quality_ranking, engagement_rate_ranking, conversion_rate_ranking";
        let q = (supabase as any)
          .from("meta_period_stats")
          .select(cols)
          .eq("start_date", startStr)
          .eq("end_date", endStr)
          .order("entity_id")
          .range(from, from + 999);
        if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
        return q;
      };
      const all: any[] = [];
      let useExtended = true;
      for (let from = 0; from < 20000; from += 1000) {
        let { data, error } = await buildQ(useExtended, from);
        if (error && useExtended && (error.code === "42703" || error.code === "PGRST204" || String(error.message || "").includes("column"))) {
          useExtended = false;
          ({ data, error } = await buildQ(false, from));
        }
        if (error || !data?.length) break;
        all.push(...data);
        if (data.length < 1000) break;
      }
      return all;
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // Alcance deduplicado oficial da conta no período (meta_account_period_stats)
  const { data: accountPeriodStats = [] } = useQuery({
    queryKey: ["mc-account-period-stats", accountFilter, startStr, endStr],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      try {
        let q = (supabase as any)
          .from("meta_account_period_stats")
          .select("ad_account_id, reach, impressions, spend, frequency, conversions, clicks, inline_link_clicks, purchase_value")
          .eq("start_date", startStr)
          .eq("end_date", endStr);
        if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
        const { data, error } = await q;
        if (error) return [];
        return data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // Timestamp do último sync (exibido na UI)
  const { data: syncConfig } = useQuery({
    queryKey: ["meta-sync-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("last_heartbeat_at").order("created_at", { ascending: false }).limit(1);
      return data?.[0] || null;
    },
    refetchInterval: 30 * 1000,
  });

  const { data: placementData = [] } = useQuery({
    queryKey: ["mc-placements", accountFilter, Array.from(selectedCamps).sort().join(","), startStr, endStr],
    enabled: level === "campanhas",
    queryFn: async () => {
      let q = (supabase as any).from("placement_metrics").select("placement, publisher, impressions, clicks, spend, conversions, reach").gte("date", startStr).lte("date", endStr);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      const { data } = await q;
      const grouped: Record<string, any> = {};
      (data || []).forEach((r: any) => {
        const key = `${r.placement}|${r.publisher}`;
        if (!grouped[key]) grouped[key] = { placement: r.placement, publisher: r.publisher, impressions: 0, clicks: 0, spend: 0, conversions: 0, reach: 0 };
        grouped[key].impressions += Number(r.impressions || 0); grouped[key].clicks += Number(r.clicks || 0);
        grouped[key].spend += Number(r.spend || 0); grouped[key].conversions += Number(r.conversions || 0); grouped[key].reach += Number(r.reach || 0);
      });
      return Object.values(grouped).sort((a: any, b: any) => b.spend - a.spend).map((g: any) => ({ ...g, cpl: g.conversions > 0 ? g.spend / g.conversions : 0, ctr: g.impressions > 0 ? g.clicks / g.impressions * 100 : 0 }));
    },
  });

  const { data: breakdowns, isLoading: loadingBreakdowns } = useQuery({
    queryKey: ["mc-breakdowns", accountFilter, Array.from(selectedCamps).sort().join(","), startStr, endStr],
    enabled: view === "demograficos",
    queryFn: async () => {
      const acFilter = accountFilter !== "all";
      const campFilter = selectedCampaignId ? true : selectedCamps.size > 0;
      const campIds = selectedCampaignId ? [selectedCampaignId] : Array.from(selectedCamps);

      let demoQ = (supabase as any).from("demographic_metrics").select("age_range, gender, platform, conversions, spend, impressions, clicks, reach").gte("date", startStr).lte("date", endStr);
      if (acFilter) demoQ = demoQ.eq("ad_account_id", accountFilter);
      if (campFilter) demoQ = demoQ.in("campaign_id", campIds);

      let hourlyQ = (supabase as any).from("hourly_metrics").select("hour, conversions, spend, date").gte("date", startStr).lte("date", endStr);
      if (acFilter) hourlyQ = hourlyQ.eq("ad_account_id", accountFilter);
      if (campFilter) hourlyQ = hourlyQ.in("campaign_id", campIds);

      let regionQ = (supabase as any).from("region_metrics").select("region, conversions, spend, impressions, clicks, reach").gte("date", startStr).lte("date", endStr);
      if (acFilter) regionQ = regionQ.eq("ad_account_id", accountFilter);
      if (campFilter) regionQ = regionQ.in("campaign_id", campIds);

      let deviceQ = (supabase as any).from("device_metrics" as any).select("device, platform, conversions, spend, impressions, clicks, reach").gte("date", startStr).lte("date", endStr);
      if (acFilter) deviceQ = deviceQ.eq("ad_account_id", accountFilter);
      if (campFilter) deviceQ = deviceQ.in("campaign_id", campIds);

      const [demo, hourlyRaw, regionRaw, deviceRaw] = await Promise.all([demoQ, hourlyQ, regionQ, deviceQ]);
      const demoRows = demo.data || [];
      const regionRows = regionRaw.data || [];
      const deviceRows = deviceRaw.data || [];
      const hourlyRows = hourlyRaw.data || [];

      const isRealDataEmpty = demoRows.length === 0 && regionRows.length === 0 && deviceRows.length === 0 && hourlyRows.length === 0;

      if (isRealDataEmpty) {
        return {
          ageData: [],
          genderData: [],
          platData: [],
          regionData: [],
          dayOfWeekData: [],
          hourlyData: [],
          deviceData: [],
          heatMapData: [],
          isSimulated: false,
          hasRealData: false,
        };
      }

      const ageMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!ageMap[r.age_range]) ageMap[r.age_range] = { name: r.age_range, conv: 0, cost: 0, impr: 0, clicks: 0 }; ageMap[r.age_range].conv += Number(r.conversions||0); ageMap[r.age_range].cost += Number(r.spend||0); ageMap[r.age_range].impr += Number(r.impressions||0); ageMap[r.age_range].clicks += Number(r.clicks||0); });
      const ageData = Object.values(ageMap).filter((v: any) => v.name !== "unknown").map((v: any) => ({ ...v, cpl: v.conv > 0 ? v.cost/v.conv : 0, ctr: v.impr > 0 ? v.clicks/v.impr*100 : 0 })).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const genderMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!genderMap[r.gender]) genderMap[r.gender] = { name: r.gender, value: 0, cost: 0 }; genderMap[r.gender].value += Number(r.conversions||0); genderMap[r.gender].cost += Number(r.spend||0); });
      const genderData = Object.values(genderMap).filter((v: any) => v.name !== "unknown").map((g: any) => ({ ...g, name: g.name === "male" ? "Masculino" : g.name === "female" ? "Feminino" : g.name, cpl: g.value > 0 ? g.cost/g.value : 0 }));
      const platMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!platMap[r.platform]) platMap[r.platform] = { name: r.platform, conv: 0, cost: 0, impr: 0 }; platMap[r.platform].conv += Number(r.conversions||0); platMap[r.platform].cost += Number(r.spend||0); platMap[r.platform].impr += Number(r.impressions||0); });
      const platData = Object.values(platMap).filter((v: any) => v.name !== "unknown").map((v: any) => ({ ...v, name: v.name === "facebook" ? "Facebook" : v.name === "instagram" ? "Instagram" : v.name === "audience_network" ? "Audience Net." : v.name, cpl: v.conv > 0 ? v.cost/v.conv : 0 })).sort((a: any, b: any) => b.conv - a.conv);
      const regionData = regionRows.map((r: any) => ({ name: r.region, conv: Number(r.conversions||0), cost: Number(r.spend||0), cpl: Number(r.conversions||0) > 0 ? Number(r.spend||0)/Number(r.conversions||0) : 0 })).sort((a: any, b: any) => b.conv - a.conv).slice(0, 10);
      const dowMap: Record<number, any> = {};
      (hourlyRaw.data || []).forEach((r: any) => { const dow = new Date(r.date).getDay(); if (!dowMap[dow]) dowMap[dow] = { day: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dow], conv: 0, cost: 0 }; dowMap[dow].conv += Number(r.conversions||0); dowMap[dow].cost += Number(r.spend||0); });
      const dayOfWeekData = [0,1,2,3,4,5,6].map(i => dowMap[i] || { day: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][i], conv: 0, cost: 0 });
      const hourMap: Record<number, any> = {};
      (hourlyRaw.data || []).forEach((r: any) => { const h = Number(r.hour||0); if (!hourMap[h]) hourMap[h] = { hour: h, conv: 0, cost: 0 }; hourMap[h].conv += Number(r.conversions||0); hourMap[h].cost += Number(r.spend||0); });
      const hourlyData = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, conv: 0, cost: 0 });
      const devMap: Record<string, any> = {};
      deviceRows.forEach((r: any) => { const k = r.device || "other"; if (!devMap[k]) devMap[k] = { name: k, conv: 0, cost: 0, impr: 0 }; devMap[k].conv += Number(r.conversions||0); devMap[k].cost += Number(r.spend||0); devMap[k].impr += Number(r.impressions||0); });
      const deviceData = Object.values(devMap).map((v: any) => ({ ...v, name: v.name === "mobile" ? "Mobile" : v.name === "desktop" ? "Desktop" : v.name }));

      const heatMapData = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ conv: 0, cost: 0, cpl: 0 })));
      hourlyRows.forEach((r: any) => {
        if (!r.date || typeof r.hour !== "number") return;
        const d = new Date(r.date).getDay();
        const h = r.hour;
        if (d >= 0 && d < 7 && h >= 0 && h < 24) {
          heatMapData[d][h].conv += Number(r.conversions || 0);
          heatMapData[d][h].cost += Number(r.spend || 0);
        }
      });
      for (let d = 0; d < 7; d++) {
        for (let h = 0; h < 24; h++) {
          heatMapData[d][h].cpl = heatMapData[d][h].conv > 0 ? heatMapData[d][h].cost / heatMapData[d][h].conv : 0;
          heatMapData[d][h] = { day: d, hour: h, ...heatMapData[d][h] } as any;
        }
      }

      return { ageData, genderData, platData, regionData, dayOfWeekData, hourlyData, deviceData, heatMapData, isSimulated: false, hasRealData: true };
    },
  });

  // â"€â"€â"€ MUTATIONS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const syncMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { time_range: { since: startStr, until: endStr } };
      if (accountFilter !== "all") payload.account_id = accountFilter;
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: payload });
      if (error) {
        // FunctionsHttpError esconde o corpo da resposta em error.context —
        // extrai a mensagem real em vez do genérico "non-2xx status code"
        let msg = error.message;
        try {
          const body = await (error as any).context?.json?.();
          if (body?.error) msg = String(body.error).split("\n")[0];
        } catch (_) { /* mantém msg genérica */ }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      // Calibra conversões reais de WhatsApp diretamente via Meta Graph API após o sync
      await calibrateMetaConversionsFromGraph(supabase, startStr, endStr, accountFilter);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mc-camps"] });
      qc.invalidateQueries({ queryKey: ["mc-adsets"] });
      qc.invalidateQueries({ queryKey: ["mc-ads"] });
      qc.invalidateQueries({ queryKey: ["mc-period-stats"] });
      qc.invalidateQueries({ queryKey: ["meta-sync-config"] });
      toast.success("Sincronizado com Meta Ads!");
    },
    onError: (e: any) => toast.error(`Erro: ${e.message}`),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, externalId, currentStatus, type }: any) => {
      if (!externalId) throw new Error("ID externo ausente.");
      const target = currentStatus.toUpperCase() === "ACTIVE" ? "PAUSED" : "ACTIVE";
      setChangingId(id);
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: { action: "toggle-status", external_id: externalId, status: target } });
      if (error) throw error; if (data?.error) throw new Error(data.error);
      const table = type === "campanhas" ? "campaigns" : type === "conjuntos" ? "ad_sets" : "ads";
      await (supabase as any).from(table).update({ status: target.toLowerCase() }).eq("id", id);
      return { id, target, type };
    },
    onSuccess: ({ target }) => { qc.invalidateQueries({ queryKey: ["mc-camps"] }); qc.invalidateQueries({ queryKey: ["mc-adsets"] }); qc.invalidateQueries({ queryKey: ["mc-ads"] }); toast.success(`${target === "ACTIVE" ? "Ativado" : "Pausado"}!`); },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setChangingId(null),
  });

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const payload: any = { action: "audit", time_range: { since: startStr, until: endStr } };
      if (accountFilter !== "all") payload.account_id = accountFilter;
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: payload });
      if (error) throw new Error(error.message);
      setAuditData(data?.audit || []);
    } catch (e: any) { toast.error(`Auditoria falhou: ${e.message}`); } finally { setIsAuditing(false); }
  };

  // â"€â"€â"€ DADOS DERIVADOS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  const calibratedPeriodStats = useMemo(
    () => calibratePeriodStatsInMemory(periodStats, campaigns, ads, adSets, startStr, endStr),
    [periodStats, campaigns, ads, adSets, startStr, endStr]
  );

  // Injeta alcance e frequência reais (period stats) nas campanhas — torna todas as métricas exatas
  const enrichedCampaignsBase = useMemo(() => {
    let base = campaigns;
    const campaignStats = calibratedPeriodStats.filter((p: any) => p.entity_type === 'campaign');
    if (campaignStats.length > 0) {
      const statsMap = new Map(campaignStats.map((ps: any) => [ps.entity_id, ps]));
      base = campaigns.map((c: any) => {
        const ps = statsMap.get(c.id) as any;
        if (!ps) return c;
        const cost = Number(ps.spend || 0);
        const conversions = Number(ps.conversions || 0);
        const clicks = Number(ps.inline_link_clicks ?? ps.clicks ?? 0);
        const allClicks = Number(ps.all_clicks ?? ps.clicks ?? 0);
        const impressions = Number(ps.impressions || 0);
        const reach = Number(ps.reach || 0);

        const freq = reach > 0 ? impressions / reach : 0;
        const resIndicator = ps.result_indicator || c.result_indicator || null;
        const optGoal = ps.optimization_goal || c.optimization_goal || null;
        const cat = c.result_type || classifyMetaEvent({
          campaignName: c.name,
          rawObjective: c.objective,
          resultType: ps.result_type,
          resultsIndicator: resIndicator || undefined,
          optimizationGoal: optGoal || undefined,
          isVehicleContext: false,
        }).category;
        const effectiveRes = cat === "REACH" ? (reach > 0 ? reach : conversions) : conversions;
        const cpl = computeUnitCost(cost, effectiveRes, cat) ?? 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? cost / clicks : 0;
        const purchaseVal = Number(c.t?.purchaseValue || 0);
        const roas = cost > 0 && purchaseVal > 0 ? purchaseVal / cost : null;
        
        return { 
          ...c, 
          result_type: cat,
          result_indicator: resIndicator,
          optimization_goal: optGoal,
          t: { 
            ...c.t, 
            cost, conversions, clicks, allClicks, impressions, reach, freq, cpl, ctr, ctrAll, cpm, cpc, roas 
          } 
        };
      });
    }
    return includeNoDelivery
      ? base
      : base.filter((c: any) => (c.t?.reach || 0) >= 1 || (c.t?.impressions || 0) >= 1 || (c.t?.cost || 0) > 0);
  }, [campaigns, calibratedPeriodStats, includeNoDelivery]);

  const enrichedAdSets = useMemo(() => {
    let base = adSets;
    const adsetStats = calibratedPeriodStats.filter((p: any) => p.entity_type === 'adset');
    if (adsetStats.length > 0) {
      const statsMap = new Map(adsetStats.map((ps: any) => [ps.entity_id, ps]));
      base = adSets.map((c: any) => {
        const ps = statsMap.get(c.id) as any;
        if (!ps) return c;
        const cost = Number(ps.spend || 0);
        const conversions = Number(ps.conversions || 0);
        const clicks = Number(ps.inline_link_clicks ?? ps.clicks ?? 0);
        const allClicks = Number(ps.all_clicks ?? ps.clicks ?? 0);
        const impressions = Number(ps.impressions || 0);
        const reach = Number(ps.reach || 0);

        const freq = reach > 0 ? impressions / reach : 0;
        const resIndicator = ps.result_indicator || c.result_indicator || null;
        const optGoal = ps.optimization_goal || c.optimization_goal || null;
        const cat = c.result_type || classifyMetaEvent({
          campaignName: c.name + " " + (c.campaigns?.name || ""),
          rawObjective: c.objective || c.campaigns?.objective,
          resultType: ps.result_type,
          resultsIndicator: resIndicator || undefined,
          optimizationGoal: optGoal || undefined,
          isVehicleContext: false,
        }).category;
        const effectiveRes = cat === "REACH" ? (reach > 0 ? reach : conversions) : conversions;
        const cpl = computeUnitCost(cost, effectiveRes, cat) ?? 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? cost / clicks : 0;
        const purchaseVal = Number(c.t?.purchaseValue || 0);
        const roas = cost > 0 && purchaseVal > 0 ? purchaseVal / cost : null;
        return { ...c, result_type: cat, result_indicator: resIndicator, optimization_goal: optGoal, t: { ...c.t, cost, conversions, clicks, allClicks, impressions, reach, freq, cpl, ctr, ctrAll, cpm, cpc, roas } };
      });
    }
    return includeNoDelivery
      ? base
      : base.filter((c: any) => (c.t?.reach || 0) >= 1 || (c.t?.impressions || 0) >= 1 || (c.t?.cost || 0) > 0);
  }, [adSets, calibratedPeriodStats, includeNoDelivery]);

  const enrichedAds = useMemo(() => {
    let base = ads;
    const adStats = calibratedPeriodStats.filter((p: any) => p.entity_type === 'ad');
    if (adStats.length > 0) {
      const statsMap = new Map(adStats.map((ps: any) => [ps.entity_id, ps]));
      base = ads.map((c: any) => {
        const ps = statsMap.get(c.id) as any;
        if (!ps) return c;
        const cost = Number(ps.spend || 0);
        const conversions = Number(ps.conversions || 0);
        const clicks = Number(ps.inline_link_clicks ?? ps.clicks ?? 0);
        const allClicks = Number(ps.all_clicks ?? ps.clicks ?? 0);
        const impressions = Number(ps.impressions || 0);
        const reach = Number(ps.reach || 0);

        const freq = reach > 0 ? impressions / reach : 0;
        const resIndicator = ps.result_indicator || c.result_indicator || null;
        const optGoal = ps.optimization_goal || c.optimization_goal || null;
        const cat = c.result_type || classifyMetaEvent({
          campaignName: c.name + " " + (c.campaigns?.name || ""),
          rawObjective: c.objective || c.campaigns?.objective,
          resultType: ps.result_type,
          resultsIndicator: resIndicator || undefined,
          optimizationGoal: optGoal || undefined,
          isVehicleContext: false,
        }).category;
        const effectiveRes = cat === "REACH" ? (reach > 0 ? reach : conversions) : conversions;
        const cpl = computeUnitCost(cost, effectiveRes, cat) ?? 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        const cpc = clicks > 0 ? cost / clicks : 0;
        const purchaseVal = Number(c.t?.purchaseValue || 0);
        const roas = cost > 0 && purchaseVal > 0 ? purchaseVal / cost : null;
        return { ...c, result_type: cat, result_indicator: resIndicator, optimization_goal: optGoal, t: { ...c.t, cost, conversions, clicks, allClicks, impressions, reach, freq, cpl, ctr, ctrAll, cpm, cpc, roas } };
      });
    }
    return includeNoDelivery
      ? base
      : base.filter((c: any) => (c.t?.reach || 0) >= 1 || (c.t?.impressions || 0) >= 1 || (c.t?.cost || 0) > 0);
  }, [ads, calibratedPeriodStats, includeNoDelivery]);

  // Preserva números oficiais do Meta no nível campanha e anexa soma dos anúncios para diagnóstico sem sobrescrita destrutiva
  const enrichedCampaigns = useMemo(() => {
    const sumByCamp = new Map<string, number>();
    for (const ad of enrichedAds as any[]) {
      if (!ad.campaign_id) continue;
      sumByCamp.set(ad.campaign_id, (sumByCamp.get(ad.campaign_id) || 0) + Number(ad.t?.conversions || 0));
    }
    return (enrichedCampaignsBase as any[]).map((c: any) => {
      const adSum = sumByCamp.get(c.id);
      if (adSum === undefined) return c;
      const campConv = Number(c.t?.conversions || 0);
      return {
        ...c,
        adResultsSum: adSum,
        hasAdDivergence: Math.abs(adSum - campConv) > 0,
      };
    });
  }, [enrichedCampaignsBase, enrichedAds]);

  const hiddenNoDeliveryCount = useMemo(() => {
    const src = level === "campanhas" ? campaigns : level === "conjuntos" ? adSets : ads;
    return src.filter((c: any) => (c.t?.reach || 0) < 1 && (c.t?.impressions || 0) < 1 && (c.t?.cost || 0) <= 0).length;
  }, [level, campaigns, adSets, ads]);

  const listData = useMemo(() => {
    if (level === "campanhas") return enrichedCampaigns;
    if (level === "conjuntos") return enrichedAdSets;
    return enrichedAds;
  }, [level, enrichedCampaigns, enrichedAdSets, enrichedAds]);

  // Benchmark CPL médio de referência para calibrar a temperatura térmica
  const accountBenchmarkCpl = useMemo(() => {
    let cost = 0;
    let conv = 0;
    for (const item of listData) {
      cost += item.t?.cost || 0;
      conv += item.t?.conversions || 0;
    }
    return conv > 0 ? cost / conv : 0;
  }, [listData]);

  const thermalStats = useMemo(() => {
    let hot = 0, warm = 0, cold = 0;
    let hotCost = 0, warmCost = 0, coldCost = 0;

    for (const c of listData) {
      const cost = c.t?.cost || 0;
      const t = getCampaignTemperature(c, accountBenchmarkCpl);
      if (t.temp === "hot") {
        hot++;
        hotCost += cost;
      } else if (t.temp === "cold") {
        cold++;
        coldCost += cost;
      } else {
        warm++;
        warmCost += cost;
      }
    }

    return {
      total: listData.length,
      hot,
      warm,
      cold,
      hotCost,
      warmCost,
      coldCost,
    };
  }, [listData, accountBenchmarkCpl]);

  const filtered = useMemo(() => {
    return listData.filter((c: any) => {
      const matchSearch = !search || c.name?.toLowerCase().includes(search.toLowerCase());
      if (!matchSearch) return false;
      if (temperatureMode && temperatureFilter !== "all") {
        const t = getCampaignTemperature(c, accountBenchmarkCpl);
        if (t.temp !== temperatureFilter) return false;
      }
      return true;
    });
  }, [listData, search, temperatureMode, temperatureFilter, accountBenchmarkCpl]);

  const handleOpenVictoriaDiagnostic = useCallback((item?: any) => {
    let target = item;
    if (!target) {
      if (selectedFocusItem) {
        target = selectedFocusItem;
      } else if (selectedCamps.size > 0) {
        const firstSelectedId = Array.from(selectedCamps)[0];
        target = listData.find((r: any) => r.id === firstSelectedId);
      } else if (listData.length > 0) {
        // Pega a campanha com maior gasto para um diagnóstico estratégico de impacto
        target = [...listData].sort((a: any, b: any) => (b.t?.cost || 0) - (a.t?.cost || 0))[0];
      }
    }

    if (target) {
      const resultDetail = getMetaResultDetail(
        target.t?.conversions ?? 0,
        target.name + " " + (target.campaigns?.name || ""),
        target.objective || target.campaigns?.objective,
        target.result_type
      );
      setFloatingChatContext({
        id: target.id,
        name: target.name,
        type: level === "campanhas" ? "campaign" : level === "conjuntos" ? "adset" : "ad",
        objective: target.objective,
        resultType: target.result_type,
        t: target.t,
        resultDetail,
      });
    } else {
      setFloatingChatContext(null);
    }
    setIsFloatingChatOpen(true);
  }, [selectedFocusItem, selectedCamps, listData, level]);

  const selSet = level === "campanhas" ? selectedCamps : level === "conjuntos" ? selectedAdSets : selectedAds;
  const setSelSet = level === "campanhas" ? setSelectedCamps : level === "conjuntos" ? setSelectedAdSets : setSelectedAds;

  const allSelected = filtered.length > 0 && filtered.every((c: any) => selSet.has(c.id));
  const someSelected = filtered.some((c: any) => selSet.has(c.id));
  const toggleAll = useCallback(() => allSelected ? setSelSet(new Set()) : setSelSet(new Set(filtered.map((c: any) => c.id))), [allSelected, filtered, setSelSet]);
  const toggleOne = useCallback((id: string) => { const s = new Set(selSet); s.has(id) ? s.delete(id) : s.add(id); setSelSet(s); }, [selSet, setSelSet]);

  const { sel, totCost, totConv, totImpr, totReach, reachLabel, totClicks, totAllClicks, avgCpl, avgCtr, avgCtrAll, avgCpm, metricVector } = useMemo(() => {
    const s = selSet.size > 0 ? filtered.filter((c: any) => selSet.has(c.id)) : filtered;
    const cost = s.reduce((sum: number, c: any) => sum + c.t.cost, 0);
    const conv = s.reduce((sum: number, c: any) => sum + c.t.conversions, 0);
    const impr = s.reduce((sum: number, c: any) => sum + c.t.impressions, 0);
    const summedReach = s.reduce((sum: number, c: any) => sum + c.t.reach, 0);
    const clicks = s.reduce((sum: number, c: any) => sum + c.t.clicks, 0);
    const allClicks = s.reduce((sum: number, c: any) => sum + (c.t.allClicks ?? c.t.clicks ?? 0), 0);

    const canUseAccountReach =
      level === "campanhas" &&
      selSet.size === 0 &&
      !search &&
      statusFilter === "all" &&
      accountFilter !== "all" &&
      Array.isArray(accountPeriodStats) &&
      accountPeriodStats.length === 1 &&
      Number(accountPeriodStats[0]?.reach || 0) > 0;

    const deduplicatedAccountReach = canUseAccountReach
      ? Number(accountPeriodStats[0].reach)
      : null;

    const summary = computeWeightedAggregates(
      s.map((c: any) => ({
        id: c.id,
        name: c.name,
        cost: c.t.cost,
        conversions: c.t.conversions,
        clicks: c.t.clicks,
        allClicks: c.t.allClicks ?? c.t.clicks,
        impressions: c.t.impressions,
        reach: c.t.reach,
        rawObjective: c.objective || c.campaigns?.objective,
        resultType: c.result_type,
        resultIndicator: c.result_indicator,
        optimizationGoal: c.optimization_goal,
        isVehicleContext: false,
      })),
      { deduplicatedAccountReach }
    );

    const isPureReach =
      summary.groupsByCategory.length === 1 &&
      summary.groupsByCategory[0].category === "REACH";

    let computedAvgCpl = 0;
    if (isPureReach) {
      computedAvgCpl = summary.groupsByCategory[0].unitCost ?? 0;
    } else if (summary.cpaEligible !== null) {
      computedAvgCpl = summary.cpaEligible;
    } else if (summary.groupsByCategory.length === 1 && summary.groupsByCategory[0].unitCost !== null) {
      computedAvgCpl = summary.groupsByCategory[0].unitCost;
    } else {
      computedAvgCpl = conv > 0 ? cost / conv : 0;
    }

    return {
      sel: s,
      totCost: cost,
      totConv: conv,
      totImpr: impr,
      totReach: deduplicatedAccountReach ?? summedReach,
      reachLabel: deduplicatedAccountReach !== null ? "Alcance (Conta)" : "Alcance (Soma)",
      totClicks: clicks,
      totAllClicks: allClicks,
      avgCpl: computedAvgCpl,
      avgCtr: impr > 0 ? (clicks / impr) * 100 : 0,
      avgCtrAll: impr > 0 ? (allClicks / impr) * 100 : 0,
      avgCpm: impr > 0 ? (cost / impr) * 1000 : 0,
      metricVector: summary.metricVector,
    };
  }, [selSet, filtered, level, search, statusFilter, accountFilter, accountPeriodStats]);

  const maxCplThreshold = useMemo(() => {
    if (accountFilter === "all") return null;
    const t = alertThresholds.find((t: any) => t.ad_account_id === accountFilter);
    return t?.max_cpl ?? null;
  }, [alertThresholds, accountFilter]);

  const insights = useMemo(() => gerarInsights(enrichedCampaigns, totCost, totConv, avgCpl, avgCtr, avgCpm), [enrichedCampaigns, totCost, totConv, avgCpl, avgCtr, avgCpm]);

  const loadAiInsight = async (item: any) => {
    setIsGeneratingInsight(true);
    setAiInsightText("");
    try {
      const { data, error } = await supabase.functions.invoke("ai-insights", {
        body: {
          metrics: {
            name: item.name,
            type: item.type,
            objective: item.objective,
            spend: item.t.cost,
            conversions: item.t.conversions,
            clicks: item.t.clicks,
            impressions: item.t.impressions,
            reach: item.t.reach,
            frequency: item.t.freq,
            cpl: item.t.cpl,
            ctr: item.t.ctr,
            cpm: item.t.cpm,
            cpc: item.t.cpc,
          },
          context: `Campanha de Meta Ads da conta de tráfego, nível: ${item.type}. Período: ${startStr} a ${endStr}.`
        }
      });
      if (error) throw error;
      setAiInsightText(data?.insight || "Não foi possível obter a análise da Victoria.");
    } catch (e: any) {
      console.error("Erro na Victoria IA:", e);
      const fallbackText = generateLocalDiagnostic(item, avgCpl);
      setAiInsightText(fallbackText);
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  useEffect(() => {
    if (selectedFocusItem) {
      loadAiInsight(selectedFocusItem);
    } else {
      setAiInsightText("");
    }
  }, [selectedFocusItem]);

  // ── Configurações de Gráficos Dinâmicos ──
  const [activeChartTab, setActiveChartTab] = useState<"metricas" | "campanhas">("campanhas");
  useEffect(() => {
    if (isAdmin) {
      setActiveChartTab("metricas");
    }
  }, [isAdmin]);

  const { configs: metricasConfigs } = useChartConfig("metricas");
  const { configs: campanhasConfigs } = useChartConfig("campanhas");

  // Dados consolidados diários para gráficos dinâmicos
  const chartData = useMemo(() => {
    try {
      const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate });
      return days.map(d => {
        const ds = getLocalDateStr(d);
        const targetCamps = selectedCampaignId 
          ? enrichedCampaigns.filter((c: any) => c.id === selectedCampaignId)
          : enrichedCampaigns;
          
        const dayMetrics = targetCamps.flatMap((c: any) => 
          (c._metrics || []).filter((m: any) => (m.date || "").split("T")[0] === ds)
        );
        
        const cost = dayMetrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const conversions = dayMetrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const clicks = dayMetrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
        const impressions = dayMetrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const reach = dayMetrics.reduce((s: number, m: any) => s + Number(m.reach || 0), 0);
        
        const cpl = conversions > 0 ? cost / conversions : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? cost / clicks : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        const frequency = reach > 0 ? impressions / reach : 0;

        return {
          day: format(d, "dd/MM", { locale: ptBR }),
          cost,
          conversions,
          cpl,
          ctr,
          clicks,
          impressions,
          reach,
          cpc,
          cpm,
          frequency
        };
      });
    } catch (e) {
      console.error("Erro ao consolidar dados para gráficos dinâmicos:", e);
      return [];
    }
  }, [enrichedCampaigns, dateRange, selectedCampaignId]);

  // Dados de gráficos — usam enrichedCampaigns para alcance/frequência reais
  const trendData = useMemo(() => {
    try {
      const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate }).slice(-14);
      return days.map(d => {
        const ds = getLocalDateStr(d);
        const dayMetrics = enrichedCampaigns.flatMap((c: any) => (c._metrics || []).filter((m: any) => (m.date||"").split("T")[0] === ds));
        return { date: format(d, "dd/MM", { locale: ptBR }), gasto: dayMetrics.reduce((s: number, m: any) => s + Number(m.cost||0), 0), conversoes: dayMetrics.reduce((s: number, m: any) => s + Number(m.conversions||0), 0) };
      });
    } catch { return []; }
  }, [enrichedCampaigns, dateRange]);

  const itemTrendData = useMemo(() => {
    if (!selectedFocusItem?._metrics) return [];
    try {
      const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate }).slice(-14);
      return days.map(d => {
        const ds = getLocalDateStr(d);
        const dayMetrics = (selectedFocusItem._metrics || []).filter((m: any) => (m.date || "").split("T")[0] === ds);
        return {
          date: format(d, "dd/MM", { locale: ptBR }),
          gasto: dayMetrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0),
          conversoes: dayMetrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0)
        };
      });
    } catch { return []; }
  }, [selectedFocusItem, dateRange]);

  const barData = useMemo(() => [...enrichedCampaigns].filter((c: any) => c.t.cost > 0).sort((a: any, b: any) => b.t.cost - a.t.cost).slice(0, 10).map((c: any) => ({ name: c.name.length > 22 ? c.name.substring(0, 22) + "…" : c.name, gasto: Math.round(c.t.cost * 100) / 100, conversoes: c.t.conversions, cpl: Math.round(c.t.cpl * 100) / 100 })), [enrichedCampaigns]);

  const scatterData = useMemo(() => enrichedCampaigns.filter((c: any) => c.t.cost > 0 && c.t.cpl > 0).map((c: any) => ({ x: Math.round(c.t.cost), y: Math.round(c.t.cpl * 100) / 100, z: c.t.conversions, name: c.name })), [enrichedCampaigns]);

  const pieData = useMemo(() => {
    const active = enrichedCampaigns.filter((c: any) => c.status?.toUpperCase() === "ACTIVE").length;
    return [{ name: "Ativas", value: active, color: "#6366f1" }, { name: "Pausadas", value: enrichedCampaigns.length - active, color: "#334155" }];
  }, [enrichedCampaigns]);

  const radarData = useMemo(() => {
    if (!enrichedCampaigns.length) return [];
    const maxCtr = Math.max(...enrichedCampaigns.map((c: any) => c.t.ctr), 0.01);
    const minCpl = Math.min(...enrichedCampaigns.filter((c: any) => c.t.cpl > 0).map((c: any) => c.t.cpl), Infinity);
    const maxConv = Math.max(...enrichedCampaigns.map((c: any) => c.t.conversions), 1);
    const maxReach = Math.max(...enrichedCampaigns.map((c: any) => c.t.reach), 1);
    const maxCpm = Math.max(...enrichedCampaigns.map((c: any) => c.t.cpm), 0.01);
    const avgFreq = enrichedCampaigns.reduce((s: number, c: any) => s + c.t.freq, 0) / (enrichedCampaigns.length || 1);
    return [
      { metric: "CTR",         value: Math.min(100, (avgCtr / maxCtr) * 100) },
      { metric: "CPL Efic.",   value: avgCpl > 0 && minCpl < Infinity ? Math.min(100, (minCpl / avgCpl) * 100) : 0 },
      { metric: "Volume",      value: Math.min(100, (totConv / maxConv) * 100) },
      { metric: "CPM Efic.",   value: avgCpm > 0 ? Math.min(100, (1 - avgCpm / maxCpm) * 100 + 30) : 0 },
      { metric: "Alcance",     value: Math.min(100, (totReach / maxReach) * 100) },
      { metric: "Freq. OK",    value: Math.min(100, Math.max(0, (1 - (avgFreq - 1) / 3) * 100)) },
    ];
  }, [enrichedCampaigns, avgCtr, avgCpl, avgCpm, totConv, totReach]);

  const budgetData = useMemo(() => [...enrichedCampaigns].filter((c: any) => c.t.cost > 0).sort((a: any, b: any) => b.t.cost - a.t.cost).slice(0, 8).map((c: any) => ({ name: c.name.length > 18 ? c.name.substring(0, 18) + "…" : c.name, gasto: Math.round(c.t.cost), conversoes: c.t.conversions })), [enrichedCampaigns]);

  const comparData = useMemo(() => [...enrichedCampaigns].filter((c: any) => c.t.impressions > 0).sort((a: any, b: any) => b.t.conversions - a.t.conversions).slice(0, 8).map((c: any) => {
    const maxCtr2 = Math.max(...enrichedCampaigns.map((x: any) => x.t.ctr), 0.01);
    const maxCpl2 = Math.max(...enrichedCampaigns.filter((x: any) => x.t.cpl > 0).map((x: any) => x.t.cpl), 0.01);
    return { name: c.name.length > 16 ? c.name.substring(0, 16) + "…" : c.name, ctr: Math.round((c.t.ctr / maxCtr2) * 100), cpl: c.t.cpl > 0 ? Math.round((1 - c.t.cpl / maxCpl2) * 100 + 20) : 0, freq: Math.max(0, Math.round((1 - (c.t.freq - 1) / 3) * 100)) };
  }), [enrichedCampaigns]);

  const funnelData = useMemo(() => {
    const maxVal = Math.max(totImpr, 1);
    return [
      { label: "Impressões",         value: totImpr,   rate: 100,                                                    widthPct: 100,                          color: "#6366f1" },
      { label: "Alcance Único",       value: totReach,  rate: totImpr  > 0 ? (totReach  / totImpr)  * 100 : 0,       widthPct: (totReach  / maxVal) * 100,   color: "#8b5cf6" },
      { label: "Cliques no Link",     value: totClicks, rate: totImpr  > 0 ? (totClicks / totImpr)  * 100 : 0,       widthPct: (totClicks / maxVal) * 100,   color: "#06b6d4" },
      { label: "Leads / Conversões",  value: totConv,   rate: totClicks > 0 ? (totConv   / totClicks) * 100 : 0,     widthPct: (totConv   / maxVal) * 100,   color: "#10b981" },
    ];
  }, [totImpr, totReach, totClicks, totConv]);

  const wastedSpend = useMemo(() =>
    enrichedCampaigns.filter((c: any) => c.t.conversions === 0 && c.t.cost > 20)
      .reduce((s: number, c: any) => s + c.t.cost, 0),
  [enrichedCampaigns]);

  const cplTrendData = useMemo(() => {
    try {
      const days = eachDayOfInterval({ start: dateRange.startDate, end: dateRange.endDate }).slice(-14);
      return days.map(d => {
        const ds = getLocalDateStr(d);
        const dm = enrichedCampaigns.flatMap((c: any) => (c._metrics || []).filter((m: any) => (m.date || "").split("T")[0] === ds));
        const dayCost = dm.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const dayConv = dm.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        return { date: format(d, "dd/MM", { locale: ptBR }), cpl: dayConv > 0 ? Math.round(dayCost / dayConv * 100) / 100 : null as number | null, conversoes: dayConv };
      }).filter(d => d.cpl !== null);
    } catch { return []; }
  }, [enrichedCampaigns, dateRange]);

  const campDecisions = useMemo(() =>
    enrichedCampaigns
      .filter((c: any) => c.t.cost > 0 || c.t.impressions > 0)
      .map((c: any) => ({ ...c, healthScore: calcHealthScore(c, avgCpl), decision: getDecision(c, avgCpl, maxCplThreshold) }))
      .sort((a: any, b: any) => a.healthScore - b.healthScore),
  [enrichedCampaigns, avgCpl, maxCplThreshold]);

  const overallHealthScore = useMemo(() => {
    const withSpend = campDecisions.filter((c: any) => c.t.cost > 0);
    if (!withSpend.length) return 50;
    return Math.round(withSpend.reduce((s: number, c: any) => s + c.healthScore, 0) / withSpend.length);
  }, [campDecisions]);

  // â"€â"€â"€ EARLY RETURNS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  if (authLoading || profileLoading) return null;

  if (!hasAccess) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center"><Lock className="h-7 w-7 text-destructive"/></div>
      <div><h2 className="text-2xl font-black tracking-tight mb-2">Acesso Restrito</h2><p className="text-muted-foreground text-sm max-w-xs">Solicite ao administrador o acesso às Métricas.</p></div>
      <button onClick={() => navigate({ to: "/dashboard" })} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition">Voltar ao Dashboard</button>
    </div>
  );

  // â"€â"€â"€ RENDER â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-24">

      {/* Cabeçalho e KPIs rolam naturalmente para liberar espaço vertical em telas menores e mobile */}
      <div className="space-y-2.5 pb-2.5">
        <PageHeader
          eyebrow="Operação Estratégica"
          title="Controle de KPIs"
          description="Gestão de campanhas, conjuntos e anúncios. Acompanhamento detalhado de métricas e conversões."
          compact
        />

        <KPIBar
          totCost={totCost}
          totConv={totConv}
          avgCpl={avgCpl}
          totImpr={totImpr}
          totReach={totReach}
          reachLabel={reachLabel}
          totClicks={totClicks}
          totAllClicks={totAllClicks}
          avgCtr={avgCtr}
          avgCtrAll={avgCtrAll}
          avgCpm={avgCpm}
          metricVector={metricVector}
        />
      </div>

      {/* STICKY BAR COMPACTA (Filtros + Abas de Nível) */}
      <div className="sticky top-0 z-40 -mx-2.5 px-2.5 sm:-mx-4 sm:px-4 md:-mx-6 md:px-6 lg:-mx-8 lg:px-8 bg-background/98 backdrop-blur-md border-b border-border/60 pt-2 pb-0 space-y-1.5">

        {/* Breadcrumb Contexto de Campanha (Drill-down) */}
        {selectedCampaignObj && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="flex w-full items-center gap-2 bg-gradient-to-r from-primary/10 to-transparent border-l-2 border-primary pl-3 py-1.5 rounded-r-xl"
          >
            <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">Contexto Analítico:</span>
            <div className="flex items-center gap-2 text-primary min-w-0">
              <span className="text-xs font-bold truncate max-w-[220px] sm:max-w-[300px]">{selectedCampaignObj.name}</span>
            </div>
            <button
              onClick={() => setSelectedCampaignId(null)}
              className="ml-auto mr-2 flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 transition-colors shrink-0"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Remover Contexto</span>
            </button>
          </motion.div>
        )}

        {/* Controles: Linha principal compacta (mobile + desktop) */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pb-1">
          {/* View switcher */}
          <div className="flex items-center gap-0.5 rounded-xl border border-border bg-card/50 p-0.5 shrink-0">
            {([
              { id: "gestao",       label: "Gestão",      icon: LayoutGrid },
              { id: "analise",      label: "Análise",     icon: BarChart2 },
              { id: "demograficos", label: "Demográficos",icon: Users },
            ] as const).map(v => (
              <button key={v.id} onClick={() => setView(v.id)} className={`flex items-center gap-1.5 rounded-lg px-2.5 sm:px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${view === v.id ? "bg-primary text-primary-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <v.icon className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Search inline no mobile (tab Gestão) */}
          {view === "gestao" && (
            <div className="relative flex-1 min-w-[110px] sm:hidden">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-border bg-background/60 py-1.5 pl-7 pr-2.5 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
            </div>
          )}

          {/* Toggle de filtros no mobile */}
          <button
            type="button"
            onClick={() => setMobileFiltersOpen(v => !v)}
            className={`sm:hidden flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-all shrink-0 ${
              mobileFiltersOpen || accountFilter !== "all" || statusFilter !== "all"
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card/50 text-muted-foreground"
            }`}
            title="Filtros de conta, período e status"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </button>

          {/* Filtros completos (sempre inline no desktop sm+, expansível no mobile) */}
          <div className={`${mobileFiltersOpen ? "flex w-full order-last pt-1" : "hidden"} sm:flex sm:w-auto sm:order-none flex-wrap items-center gap-1.5 sm:gap-2 flex-1 min-w-0`}>
            {/* Conta */}
            <div className="relative shrink-0">
              <Layers className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="appearance-none rounded-xl border border-border bg-background/60 py-1.5 pl-7 pr-6 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all max-w-[175px] sm:max-w-[210px] truncate">
                <option value="all" className="bg-background text-foreground">Todas as Contas</option>
                {adAccounts.map((a: any) => <option key={a.id} value={a.id} className="bg-background text-foreground">{a.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>

            {/* Período */}
            <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />

            {/* Status (apenas na tab Gestão) */}
            {view === "gestao" && (
              <div className="relative shrink-0">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as any)}
                  className="appearance-none rounded-xl border border-border bg-background/60 py-1.5 pl-3 pr-7 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all cursor-pointer"
                >
                  <option value="all">Todos os status</option>
                  <option value="active">Ativos</option>
                  <option value="paused">Pausados</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              </div>
            )}

            {/* Incluir objetos sem veiculação no período */}
            {view === "gestao" && (hiddenNoDeliveryCount > 0 || includeNoDelivery) && (
              <button
                type="button"
                onClick={() => setIncludeNoDelivery(v => !v)}
                className={`flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[11px] font-bold transition-all shrink-0 ${
                  includeNoDelivery
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-card/50 text-muted-foreground hover:text-foreground"
                }`}
                title="Exibir ou ocultar campanhas, conjuntos e anúncios sem gasto ou entrega no período"
              >
                <Eye className="h-3 w-3" />
                <span>Sem entrega ({hiddenNoDeliveryCount})</span>
              </button>
            )}

            {/* Search desktop */}
            {view === "gestao" && (
              <div className="relative hidden sm:block flex-1 min-w-[140px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-border bg-background/60 py-1.5 pl-8 pr-3 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
              </div>
            )}
          </div>
          {/* Ações */}
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {(view === "analise" || view === "demograficos") && (
              <button 
                onClick={() => setModoExplicativo(v => !v)} 
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all duration-300 ${
                  modoExplicativo 
                    ? "border-primary/40 bg-gradient-to-r from-primary/10 to-indigo-500/10 text-primary shadow-[0_0_12px_rgba(99,102,241,0.15)]" 
                    : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:border-primary/20"
                }`}
                title="Ativa explicações intuitivas sobre as métricas para tomada de decisões"
              >
                <Sparkles className={`h-3.5 w-3.5 ${modoExplicativo ? "text-primary fill-primary animate-pulse" : ""}`} />
                <span>Guia Explicativo {modoExplicativo ? "Ativo 💡" : "Off"}</span>
              </button>
            )}
            {view === "gestao" && (
              <>
                <button 
                  onClick={() => {
                    setTemperatureMode(v => !v);
                    if (temperatureMode) setTemperatureFilter("all");
                  }} 
                  className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${
                    temperatureMode 
                      ? "border-rose-500/50 bg-gradient-to-r from-rose-500/20 to-amber-500/20 text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.3)] ring-1 ring-rose-500/40" 
                      : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground hover:border-white/20"
                  }`}
                  title="Auditoria Térmica do Leilão: filtrar e classificar campanhas por eficiência (Quentes, Mornas, Frias)"
                >
                  <Flame className={`h-3.5 w-3.5 ${temperatureMode ? "text-rose-400 fill-rose-500/40 animate-pulse" : "text-muted-foreground"}`} />
                  <span className="hidden sm:inline">Termômetro</span>
                  {temperatureMode && thermalStats.cold > 0 && (
                    <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-[9px] text-cyan-300 font-mono">
                      {thermalStats.cold} alerta
                    </span>
                  )}
                </button>
                <button 
                  onClick={() => handleOpenVictoriaDiagnostic()} 
                  className="flex items-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20 hover:border-primary/60 transition-all shadow-[0_0_12px_rgba(239,68,68,0.2)] group"
                  title="Abrir Diagnóstico Estratégico em tempo real com a Victoria AI"
                >
                  <Bot className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
                  <span className="hidden sm:inline">Diagnóstico IA</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                </button>
              </>
            )}
            {view === "analise" && (
              <button onClick={() => setShowSettings(v => !v)} className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[11px] font-bold transition-all ${showSettings ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"}`}>
                <Settings2 className="h-3 w-3"/><span className="hidden sm:inline">Configurar</span>
              </button>
            )}
            {syncConfig?.last_heartbeat_at && (
              <div className="hidden sm:flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 whitespace-nowrap" title="Última sincronização com Meta Ads">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 opacity-80" />
                {(() => { const diff = Math.round((Date.now() - new Date(syncConfig.last_heartbeat_at).getTime()) / 60000); return diff < 1 ? "agora" : diff < 60 ? `${diff}m atrás` : `${Math.round(diff/60)}h atrás`; })()}
              </div>
            )}
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} title="Sincronizar dados com Meta Ads" className="flex items-center gap-1.5 rounded-xl border border-border bg-card/50 px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
              {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <RefreshCw className="h-3.5 w-3.5"/>}
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Level Tabs (apenas Gestão) */}
        {view === "gestao" && (
          <div className="flex gap-0 overflow-x-auto scrollbar-hide border-b border-white/5">
            {LEVEL_TABS.map(tab => {
              const selCount = tab.id === "campanhas" ? selectedCamps.size : tab.id === "conjuntos" ? selectedAdSets.size : selectedAds.size;
              return (
                <button key={tab.id} onClick={() => setLevel(tab.id)} className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${level === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20"}`}>
                  <tab.icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.id === "campanhas" ? "Camps." : tab.id === "conjuntos" ? "Conjuntos" : "Anúncios"}</span>
                  {selCount > 0 && <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-black">{selCount}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* â•â•â• CONTEÚDO â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */}
      <div className="pt-4 space-y-5">
        <AnimatePresence mode="wait">

          {/* â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ GESTÃO â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {view === "gestao" && (
            <motion.div key="gestao" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

              {/* Aviso de escopo direto quando não há campanha/conjunto marcado */}
              {((level === "conjuntos" && selectedCamps.size === 0 && !selectedCampaignId) || (level === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0 && !selectedCampaignId)) && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/40 px-4 py-2 text-[11px] text-muted-foreground">
                  <Layers className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>
                    Exibindo todos os {level} {accountFilter === "all" ? "das contas conectadas" : "da conta selecionada"}. Marque itens na aba anterior para filtrar o escopo.
                  </span>
                </div>
              )}

              {/* Tabela */}
              {true && (
                <div className="glass-panel card-sport overflow-hidden">

                  {/* Barra da Auditoria Térmica do Leilão */}
                  {temperatureMode && (
                    <motion.div 
                      initial={{ opacity: 0, y: -6 }} 
                      animate={{ opacity: 1, y: 0 }} 
                      className="border-b border-white/5 bg-gradient-to-r from-rose-950/20 via-background to-cyan-950/20 p-3 sm:p-4 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Thermometer className="h-4 w-4 text-rose-400" />
                          <span className="text-xs font-black uppercase tracking-wider text-foreground">
                            Auditoria Térmica do Leilão
                          </span>
                          <span className="text-[10px] text-muted-foreground hidden md:inline">
                            · Classificação preditiva com base em CPL real, Frequência e Dispersão de Verba
                          </span>
                        </div>
                        <button
                          onClick={() => handleOpenVictoriaDiagnostic()}
                          className="flex items-center gap-1.5 text-[10px] font-bold text-primary hover:underline"
                        >
                          <Bot className="h-3 w-3" />
                          Pedir Diagnóstico Completo da Conta
                        </button>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                        {/* Todas */}
                        <button
                          onClick={() => setTemperatureFilter("all")}
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                            temperatureFilter === "all"
                              ? "border-primary/50 bg-primary/10 shadow-[0_0_10px_rgba(239,68,68,0.15)] ring-1 ring-primary/40"
                              : "border-white/5 bg-white/[0.02] hover:bg-white/[0.04]"
                          }`}
                        >
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Visão Geral</span>
                          <span className="text-sm font-extrabold text-foreground mt-0.5">{thermalStats.total} {level}</span>
                          <span className="text-[9px] text-muted-foreground/60">Todas as veiculações</span>
                        </button>

                        {/* Quentes */}
                        <button
                          onClick={() => setTemperatureFilter("hot")}
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                            temperatureFilter === "hot"
                              ? "border-rose-500/50 bg-rose-500/15 shadow-[0_0_12px_rgba(244,63,94,0.25)] ring-1 ring-rose-500/40"
                              : "border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-rose-400 flex items-center gap-1">
                              <Flame className="h-3 w-3 fill-rose-500/40" /> Quentes
                            </span>
                            <span className="text-[9px] font-mono font-bold text-rose-300">R$ {fmtBRL(thermalStats.hotCost)}</span>
                          </div>
                          <span className="text-sm font-extrabold text-rose-200 mt-0.5">{thermalStats.hot} {level}</span>
                          <span className="text-[9px] text-rose-400/80">CPL baixo · Prontas p/ escalar</span>
                        </button>

                        {/* Mornas */}
                        <button
                          onClick={() => setTemperatureFilter("warm")}
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                            temperatureFilter === "warm"
                              ? "border-amber-500/50 bg-amber-500/15 shadow-[0_0_12px_rgba(245,158,11,0.25)] ring-1 ring-amber-500/40"
                              : "border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1">
                              <Zap className="h-3 w-3" /> Mornas
                            </span>
                            <span className="text-[9px] font-mono font-bold text-amber-300">R$ {fmtBRL(thermalStats.warmCost)}</span>
                          </div>
                          <span className="text-sm font-extrabold text-amber-200 mt-0.5">{thermalStats.warm} {level}</span>
                          <span className="text-[9px] text-amber-400/80">Estáveis · Benchmark normal</span>
                        </button>

                        {/* Frias / Alerta */}
                        <button
                          onClick={() => setTemperatureFilter("cold")}
                          className={`flex flex-col p-2.5 rounded-xl border text-left transition-all ${
                            temperatureFilter === "cold"
                              ? "border-cyan-500/50 bg-cyan-500/15 shadow-[0_0_12px_rgba(6,182,212,0.25)] ring-1 ring-cyan-500/40"
                              : "border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400 flex items-center gap-1">
                              <Snowflake className="h-3 w-3" /> Frias
                            </span>
                            <span className="text-[9px] font-mono font-bold text-cyan-300">R$ {fmtBRL(thermalStats.coldCost)}</span>
                          </div>
                          <span className="text-sm font-extrabold text-cyan-200 mt-0.5">{thermalStats.cold} {level}</span>
                          <span className="text-[9px] text-cyan-400/80">Alerta: gasto s/ conv. ou CPL alto</span>
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {/* Barra de seleção */}
                  {selSet.size > 0 && (
                    <div className="border-b border-white/5 bg-primary/5 px-4 py-2.5 flex items-center gap-4 overflow-x-auto scrollbar-hide text-xs">
                      <span className="shrink-0 font-black text-primary uppercase tracking-widest text-[11px]">{selSet.size} selecionado{selSet.size>1?"s":""}</span>
                      <span className="shrink-0 text-muted-foreground">Gasto <strong className="text-foreground font-mono">R$ {fmtBRL(totCost)}</strong></span>
                      {(() => {
                        const entries = formatMetricVectorSummary(metricVector);
                        const isVecMixed = entries.length > 1;
                        const label = entries.map(e => `${fmtN(e.value)} ${e.label.toLowerCase()}`).join(" • ");
                        return (
                          <span className="shrink-0">
                            <strong className="text-violet-400 font-mono">{isVecMixed ? label : fmtN(entries[0]?.value ?? totConv)}</strong>{" "}
                            <span className="text-muted-foreground">{isVecMixed ? "(por tipo)" : "resultados"}</span>
                          </span>
                        );
                      })()}
                      <span className="shrink-0 text-muted-foreground">CPL <strong className={`font-mono ${maxCplThreshold && avgCpl > maxCplThreshold ? "text-red-400" : "text-green-400"}`}>R$ {avgCpl > 0 ? avgCpl.toFixed(2) : "—"}</strong></span>
                      <span className="shrink-0 text-muted-foreground">Alcance <strong className="text-foreground font-mono">{fmtN(totReach)}</strong></span>
                      <button onClick={() => setSelSet(new Set())} className="ml-auto shrink-0 text-[9px] text-muted-foreground hover:text-foreground underline">Limpar seleção</button>
                    </div>
                  )}

                  {isLoadingCamps || isLoadingAdSets || isLoadingAds ? (
                    <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary"/></div>
                  ) : filtered.length === 0 ? (
                    <div className="py-24 text-center text-sm text-muted-foreground">Nenhum dado encontrado.</div>
                  ) : (
                    <div className="w-full">
                      {/* --- DESKTOP TABLE --- */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-xs border-collapse">

                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.02] sticky top-0 z-10">
                            <th className="px-3 py-3 w-10">
                              <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition">{allSelected ? <CheckSquare className="h-4 w-4 text-primary"/> : someSelected ? <CheckSquare className="h-4 w-4 text-primary/40"/> : <Square className="h-4 w-4"/>}</button>
                            </th>
                            <th className="px-2 py-3 w-16 text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 text-center">Status</th>
                            <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">Nome</th>
                            {level === "campanhas" && <th className="px-3 py-3 w-24 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap">Objetivo</th>}
                            <th className="px-4 py-3 w-28 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden md:table-cell">Orçamento</th>
                            <th className="px-4 py-3 w-16 text-right text-[9px] font-black uppercase tracking-widest text-amber-400/80 whitespace-nowrap">Freq.</th>
                            <th className="px-4 py-3 w-24 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden lg:table-cell">Alcance</th>
                            <th className="px-4 py-3 w-24 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden xl:table-cell">Impressões</th>
                            <th className="px-4 py-3 w-32 text-right text-[9px] font-black uppercase tracking-widest text-violet-400/90 whitespace-nowrap">Resultados</th>
                            <th className="px-4 py-3 w-32 text-right text-[9px] font-black uppercase tracking-widest text-emerald-400/90 whitespace-nowrap">Custo por Res.</th>
                            <th className="px-4 py-3 w-16 text-right text-[9px] font-black uppercase tracking-widest text-blue-400/80 whitespace-nowrap hidden lg:table-cell">CTR</th>
                            <th className="px-4 py-3 w-20 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden xl:table-cell">CPC</th>
                            <th className="px-4 py-3 w-20 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden xl:table-cell">CPM</th>
                            <th className="px-4 py-3 w-24 text-right text-[9px] font-black uppercase tracking-widest text-primary/80 whitespace-nowrap">Gasto</th>
                          </tr>
                        </thead>
                        <tbody className={isFetchingCamps ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
                          {filtered.slice(0, visibleCount).map((c: any) => {
                            const isActive   = c.status?.toUpperCase() === "ACTIVE";
                            const isLearning = c.delivery_status === "LEARNING";
                            const isChanging = changingId === c.id;
                            const isSel      = selSet.has(c.id);
                            const isHighlight= searchParams.campaign === c.id;
                            const cplOver    = Boolean(maxCplThreshold && ["MESSAGES", "LEADS", "PURCHASES"].includes(c.result_type) && c.t.cpl > 0 && c.t.cpl > maxCplThreshold);
                            const freqHigh   = c.t.freq >= 3;
                            const ctrGood    = c.t.ctr >= 2;
                            const resultDetail = getMetaResultDetail(
                              c.t.conversions,
                              c.name + " " + (c.campaigns?.name || ""),
                              c.objective || c.campaigns?.objective,
                              c.result_type
                            );
                            return (
                              <tr 
                                id={`row-${c.id}`} 
                                key={c.id} 
                                onClick={() => toggleOne(c.id)}
                                className={`cursor-pointer border-b border-white/[0.03] transition-colors duration-200 ${isHighlight ? "bg-destructive/10 ring-1 ring-inset ring-destructive/40" : isSel ? "bg-primary/10 shadow-[inset_4px_0_0_0_rgba(99,102,241,1)]" : "hover:bg-white/[0.03]"}`}
                              >
                                {/* checkbox */}
                                <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">{isSel ? <CheckSquare className="h-4 w-4 text-primary"/> : <Square className="h-4 w-4"/>}</button>
                                </td>
                                {/* status toggle */}
                                <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                  <button
                                    onClick={() => !isChanging && toggleMutation.mutate({ id: c.id, externalId: c.external_id, currentStatus: c.status, type: level })}
                                    disabled={isChanging}
                                    className={`relative h-6 w-11 rounded-full transition-all duration-300 border ${isActive ? "bg-primary/20 border-primary/40 hover:bg-primary/30" : "bg-white/5 border-white/10 hover:bg-white/10"} disabled:opacity-40`}
                                    title={isActive ? "Pausar" : "Ativar"}
                                  >
                                    {isChanging ? (
                                      <Loader2 className="h-3 w-3 animate-spin absolute inset-0 m-auto text-primary"/>
                                    ) : (
                                      <span className={`absolute top-0.5 h-4.5 w-4.5 h-[18px] w-[18px] rounded-full transition-all duration-300 flex items-center justify-center ${isActive ? "left-[22px] bg-primary" : "left-0.5 bg-white/30"}`}>
                                        {isActive ? <Play className="h-2 w-2 text-background fill-background"/> : <Pause className="h-2 w-2 text-white/60"/>}
                                      </span>
                                    )}
                                  </button>
                                </td>
                                {/* nome */}
                                <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <button
                                      onClick={() => setSelectedFocusItem({ ...c, type: level })}
                                      className="font-bold text-foreground hover:text-primary transition truncate max-w-[240px] leading-tight text-left"
                                      title="Clique para ver análise detalhada e diagnóstico de IA"
                                    >
                                      {c.name}
                                    </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleOpenVictoriaDiagnostic(c);
                                        }}
                                        className="p-1 rounded-md text-primary/70 hover:text-primary hover:bg-primary/20 transition-all opacity-80 hover:opacity-100"
                                        title="Abrir bate-papo de diagnóstico estratégico com a Victoria AI"
                                      >
                                        <Bot className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isLearning && <LearningBadge/>}
                                      {c.ad_account && <span className="text-[9px] text-muted-foreground/40 font-mono leading-none">{(c.ad_account as any).name}</span>}
                                      {/* Regras da Campanha */}
                                      {(() => {
                                        const campRules = campaignRulesMap.get(c.id) || (c.external_id ? campaignRulesMap.get(c.external_id) : []) || [];
                                        if (campRules.length === 0) return null;
                                        return (
                                          <span
                                            className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 text-[8px] font-black text-red-400"
                                            title={`Regra: ${campRules[0].title} — ${campRules[0].description}`}
                                          >
                                            <ShieldAlert className="h-2.5 w-2.5" />
                                            {campRules.length} {campRules.length === 1 ? "Regra" : "Regras"}
                                          </span>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </td>
                                {/* objetivo */}
                                {level === "campanhas" && <td className="px-3 py-2.5 text-center"><ObjectiveBadge objective={c.objective} name={c.name} resultType={c.result_type || (c.campaigns as any)?.objective}/></td>}
                                {/* orçamento */}
                                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground hidden md:table-cell whitespace-nowrap">
                                  {c.daily_budget ? `R$ ${Number(c.daily_budget).toFixed(0)}/d` : c.lifetime_budget ? `R$ ${Number(c.lifetime_budget).toFixed(0)} total` : c.budget ? `R$ ${Number(c.budget).toFixed(0)}/d` : "—"}
                                </td>
                                {/* freq */}
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <span className={`font-mono font-bold text-xs ${freqHigh ? "text-red-400" : c.t.freq > 0 ? "text-amber-400" : "text-muted-foreground/30"}`}>{c.t.freq > 0 ? c.t.freq.toFixed(1) : "—"}</span>
                                </td>
                                {/* alcance */}
                                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground hidden lg:table-cell whitespace-nowrap">{c.t.reach > 0 ? fmtN(c.t.reach) : "—"}</td>
                                {/* impressões */}
                                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground hidden xl:table-cell whitespace-nowrap">{c.t.impressions > 0 ? fmtN(c.t.impressions) : "—"}</td>
                                {/* resultados */}
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <div className="flex flex-col items-end justify-center">
                                    <span className="font-mono font-black text-violet-400 leading-tight">
                                      {c.t.conversions > 0 ? fmtN(c.t.conversions) : <span className="text-muted-foreground/30">—</span>}
                                    </span>
                                    <span className="text-[8.5px] text-muted-foreground/70 font-medium leading-tight max-w-[170px] truncate" title={resultDetail.resultLabel}>
                                      {resultDetail.resultLabel}
                                    </span>
                                  </div>
                                </td>
                                {/* custo por resultado / cpl */}
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <div className="flex flex-col items-end justify-center">
                                    {c.t.cpl > 0 ? (
                                      <>
                                        <span className={`font-mono font-black text-xs leading-tight transition-colors ${
                                          temperatureMode 
                                            ? (cplOver ? "bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30" : "bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30")
                                            : (cplOver ? "text-red-400" : "text-green-400")
                                        }`}>R$ {c.t.cpl.toFixed(2)}</span>
                                        <span className="text-[8.5px] text-muted-foreground/70 font-medium leading-tight max-w-[170px] truncate" title={resultDetail.costLabel}>
                                          {resultDetail.costLabel}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <span className="text-muted-foreground/30 font-mono text-xs leading-tight">—</span>
                                        <span className="text-[8.5px] text-muted-foreground/40 font-medium leading-tight max-w-[170px] truncate" title={resultDetail.costLabel}>
                                          {resultDetail.costLabel}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </td>
                                {/* ctr (link + todos) */}
                                <td className="px-4 py-2.5 text-right hidden lg:table-cell whitespace-nowrap">
                                  <div className="flex flex-col items-end justify-center">
                                    <span className={`font-mono font-bold text-xs transition-colors ${
                                      temperatureMode
                                        ? (c.t.ctr < 1 ? "bg-red-500/20 text-red-400 px-2 py-0.5 rounded border border-red-500/30" : c.t.ctr >= 2 ? "bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30" : "bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded border border-amber-500/30")
                                        : (ctrGood ? "text-green-400" : c.t.ctr > 0 ? "text-blue-400" : "text-muted-foreground/30")
                                    }`}>{c.t.ctr > 0 ? `${c.t.ctr.toFixed(2)}%` : "—"}</span>
                                    {c.t.ctrAll > c.t.ctr && (
                                      <span className="text-[8.5px] font-mono text-muted-foreground/60">
                                        Todos: {c.t.ctrAll.toFixed(2)}%
                                      </span>
                                    )}
                                  </div>
                                </td>
                                {/* cpc */}
                                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground hidden xl:table-cell whitespace-nowrap">{c.t.cpc > 0 ? `R$ ${c.t.cpc.toFixed(2)}` : "—"}</td>
                                {/* cpm */}
                                <td className="px-4 py-2.5 text-right font-mono text-[11px] text-muted-foreground hidden xl:table-cell whitespace-nowrap">{c.t.cpm > 0 ? `R$ ${c.t.cpm.toFixed(2)}` : "—"}</td>
                                {/* gasto */}
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  <span className={`font-mono font-black text-xs ${c.t.cost > 0 ? "text-primary" : "text-muted-foreground/30"}`}>{c.t.cost > 0 ? `R$ ${fmtBRL(c.t.cost)}` : "—"}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-white/10 bg-white/[0.03]">
                            {/* checkbox */}
                            <td className="px-4 py-3 w-8"/>
                            {/* status */}
                            <td className="px-2 py-3 w-14"/>
                            {/* nome — label TOTAL */}
                            <td className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">TOTAL ({filtered.length} {level})</td>
                            {/* objetivo — campanhas only */}
                            {level === "campanhas" && <td className="px-3 py-3"/>}
                            {/* orçamento — hidden md */}
                            <td className="px-4 py-3 hidden md:table-cell"/>
                            {/* freq — always */}
                            <td className="px-4 py-3 text-right font-mono font-black text-amber-400 text-xs whitespace-nowrap">—</td>
                            {/* alcance — hidden lg */}
                            <td className="px-4 py-3 hidden lg:table-cell"/>
                            {/* impressões — hidden xl */}
                            <td className="px-4 py-3 text-right font-mono font-black text-muted-foreground text-xs hidden xl:table-cell whitespace-nowrap">{totImpr > 0 ? fmtN(totImpr) : "—"}</td>
                            {/* resultados — always */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              {(() => {
                                const entries = formatMetricVectorSummary(metricVector);
                                const isVecMixed = entries.length > 1;
                                const summaryTxt = entries.map(e => `${fmtN(e.value)} ${e.label.toLowerCase()}`).join(" • ");
                                return (
                                  <div className="flex flex-col items-end justify-center">
                                    <span className="font-mono font-black text-violet-400 text-xs leading-tight max-w-[180px] truncate" title={isVecMixed ? summaryTxt : undefined}>
                                      {isVecMixed
                                        ? summaryTxt
                                        : (entries[0]?.value ?? 0) > 0
                                        ? fmtN(entries[0].value)
                                        : totConv > 0
                                        ? fmtN(totConv)
                                        : "—"}
                                    </span>
                                    <span className="text-[8.5px] text-muted-foreground/60 font-medium leading-tight">
                                      {isVecMixed ? "Separado por tipo" : "Total acumulado"}
                                    </span>
                                  </div>
                                );
                              })()}
                            </td>
                            {/* cpl — always */}
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <div className="flex flex-col items-end justify-center">
                                <span className="font-mono font-black text-green-400 text-xs leading-tight">{avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—"}</span>
                                <span className="text-[8.5px] text-muted-foreground/60 font-medium leading-tight">
                                  {formatMetricVectorSummary(metricVector).length > 1 ? "CPA elegível" : "Custo médio por res."}
                                </span>
                              </div>
                            </td>
                            {/* ctr — hidden lg */}
                            <td className="px-4 py-3 text-right font-mono font-black text-blue-400 text-xs hidden lg:table-cell whitespace-nowrap">
                              <div className="flex flex-col items-end justify-center">
                                <span>{avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—"}</span>
                                {avgCtrAll > avgCtr && (
                                  <span className="text-[8.5px] text-muted-foreground/60 font-medium">Todos: {avgCtrAll.toFixed(2)}%</span>
                                )}
                              </div>
                            </td>
                            {/* cpc — hidden xl */}
                            <td className="px-4 py-3 hidden xl:table-cell"/>
                            {/* cpm — hidden xl */}
                            <td className="px-4 py-3 hidden xl:table-cell"/>
                            {/* gasto — always */}
                            <td className="px-4 py-3 text-right font-mono font-black text-primary text-xs whitespace-nowrap">R$ {fmtBRL(totCost)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* --- MOBILE CARDS --- */}
                    <div className="flex flex-col gap-3 lg:hidden mt-2">
                      {/* Cabeçalho de Seleção Geral Mobile */}
                      <div className="flex items-center justify-between px-2 pb-2 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition flex items-center gap-1.5">
                            {allSelected ? <CheckSquare className="h-4 w-4 text-primary"/> : someSelected ? <CheckSquare className="h-4 w-4 text-primary/40"/> : <Square className="h-4 w-4"/>}
                            <span className="text-[10px] font-bold uppercase tracking-widest">Selecionar Todos</span>
                          </button>
                        </div>
                        <span className="text-[10px] font-black uppercase text-muted-foreground/50">{filtered.length} Itens</span>
                      </div>

                      {filtered.slice(0, visibleCount).map((c: any) => {
                        const isActive   = c.status?.toUpperCase() === "ACTIVE";
                        const isLearning = c.delivery_status === "LEARNING";
                        const isChanging = changingId === c.id;
                        const isSel      = selSet.has(c.id);
                        const isHighlight= searchParams.campaign === c.id;
                        const cplOver    = Boolean(maxCplThreshold && ["MESSAGES", "LEADS", "PURCHASES"].includes(c.result_type) && c.t.cpl > 0 && c.t.cpl > maxCplThreshold);
                        const freqHigh   = c.t.freq >= 3;
                        const ctrGood    = c.t.ctr >= 2;
                        const resultDetail = getMetaResultDetail(
                          c.t.conversions,
                          c.name + " " + (c.campaigns?.name || ""),
                          c.objective || c.campaigns?.objective,
                          c.result_type
                        );

                        return (
                          <div 
                            key={`mobile-${c.id}`}
                            className={`flex flex-col gap-3 rounded-2xl p-4 border transition-all ${isHighlight ? "bg-destructive/10 border-destructive/40 shadow-glow-sm" : isSel ? "bg-primary/5 border-primary/30" : "bg-white/[0.02] border-white/5"}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2.5">
                                <button onClick={() => toggleOne(c.id)} className="mt-1 text-muted-foreground hover:text-primary transition">
                                  {isSel ? <CheckSquare className="h-4 w-4 text-primary"/> : <Square className="h-4 w-4"/>}
                                </button>
                                <div className="flex flex-col min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <button
                                    onClick={() => setSelectedFocusItem({ ...c, type: level })}
                                    className="font-bold text-sm text-foreground hover:text-primary transition text-left leading-tight line-clamp-2"
                                  >
                                    {c.name}
                                  </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleOpenVictoriaDiagnostic(c);
                                      }}
                                      className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-primary/30 bg-primary/10 text-primary text-[10px] font-bold shrink-0 hover:bg-primary/20 transition-all"
                                      title="Diagnóstico Estratégico com Victoria AI"
                                    >
                                      <Bot className="h-3 w-3" />
                                      IA
                                    </button>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap mt-1">
                                    {/* Thermal badge */}
                                    {(() => {
                                      const tempInfo = getCampaignTemperature(c, accountBenchmarkCpl);
                                      const TempIcon = tempInfo.icon;
                                      return (
                                        <span 
                                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.2 text-[8.5px] font-bold border transition-all ${tempInfo.badgeClass}`}
                                          title={tempInfo.reason}
                                        >
                                          <TempIcon className="h-2.5 w-2.5" />
                                          {tempInfo.label}
                                        </span>
                                      );
                                    })()}
                                    <button
                                      onClick={() => !isChanging && toggleMutation.mutate({ id: c.id, externalId: c.external_id, currentStatus: c.status, type: level })}
                                      disabled={isChanging}
                                      className={`relative h-5 w-9 rounded-full transition-all duration-300 border ${isActive ? "bg-primary/20 border-primary/40 hover:bg-primary/30" : "bg-white/5 border-white/10 hover:bg-white/10"} disabled:opacity-40 shrink-0`}
                                    >
                                      {isChanging ? (
                                        <Loader2 className="h-2.5 w-2.5 animate-spin absolute inset-0 m-auto text-primary"/>
                                      ) : (
                                        <span className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all duration-300 flex items-center justify-center ${isActive ? "left-[14px] bg-primary" : "left-0.5 bg-white/30"}`} />
                                      )}
                                    </button>
                                    {isLearning && <LearningBadge/>}
                                    {level === "campanhas" && <ObjectiveBadge objective={c.objective} name={c.name}/>}
                                    {/* Regras vinculadas Mobile */}
                                    {(() => {
                                      const campRules = campaignRulesMap.get(c.id) || (c.external_id ? campaignRulesMap.get(c.external_id) : []) || [];
                                      if (campRules.length === 0) return null;
                                      return (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 border border-red-500/25 px-1.5 py-0.5 text-[8px] font-black text-red-400">
                                          <ShieldAlert className="h-2.5 w-2.5" />
                                          {campRules.length} Regra{campRules.length > 1 ? "s" : ""}
                                        </span>
                                      );
                                    })()}
                                  </div>
                                  {c.ad_account && <span className="text-[9px] text-muted-foreground/50 font-mono mt-1.5">{(c.ad_account as any).name}</span>}
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mt-1">
                              <div className="bg-black/20 rounded-xl p-2.5 flex flex-col justify-between border border-white/5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Gasto</span>
                                <span className={`font-mono font-black text-sm mt-0.5 ${c.t.cost > 0 ? "text-primary" : "text-muted-foreground/40"}`}>
                                  {c.t.cost > 0 ? `R$ ${fmtBRL(c.t.cost)}` : "—"}
                                </span>
                              </div>
                              <div className="bg-black/20 rounded-xl p-2.5 flex flex-col justify-between border border-white/5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Resultados</span>
                                <span className={`font-mono font-black text-sm mt-0.5 ${c.t.conversions > 0 ? "text-violet-400" : "text-muted-foreground/40"}`}>
                                  {c.t.conversions > 0 ? fmtN(c.t.conversions) : "—"}
                                </span>
                                <span className="text-[8.5px] text-muted-foreground/70 font-medium leading-tight truncate mt-0.5" title={resultDetail.resultLabel}>
                                  {resultDetail.resultLabel}
                                </span>
                              </div>
                              <div className="bg-black/20 rounded-xl p-2.5 flex flex-col justify-between border border-white/5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Custo por Res.</span>
                                <span className={`font-mono font-black text-sm mt-0.5 ${c.t.cpl > 0 ? (cplOver ? "text-red-400" : "text-emerald-400") : "text-muted-foreground/40"}`}>
                                  {c.t.cpl > 0 ? `R$ ${c.t.cpl.toFixed(2)}` : "—"}
                                </span>
                                <span className="text-[8.5px] text-muted-foreground/70 font-medium leading-tight truncate mt-0.5" title={resultDetail.costLabel}>
                                  {resultDetail.costLabel}
                                </span>
                              </div>
                              <div className="bg-black/20 rounded-xl p-2.5 flex flex-col justify-between border border-white/5">
                                <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">Frequência</span>
                                <span className={`font-mono font-black text-sm mt-0.5 ${freqHigh ? "text-red-400" : c.t.freq > 0 ? "text-amber-400" : "text-muted-foreground/40"}`}>
                                  {c.t.freq > 0 ? c.t.freq.toFixed(2) + "x" : "—"}
                                </span>
                              </div>
                            </div>
                            {/* Oculto em telas menores mas exibido caso precise de mais contexto em MD */}
                            <div className="flex items-center justify-between pt-2 px-1">
                              <span className="text-[9px] font-mono text-muted-foreground">CTR: {c.t.ctr > 0 ? `${c.t.ctr.toFixed(2)}%` : "—"}</span>
                              <span className="text-[9px] font-mono text-muted-foreground">CPC: {c.t.cpc > 0 ? `R$ ${c.t.cpc.toFixed(2)}` : "—"}</span>
                              <span className="text-[9px] font-mono text-muted-foreground">CPM: {c.t.cpm > 0 ? `R$ ${c.t.cpm.toFixed(2)}` : "—"}</span>
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Footer Totais Mobile */}
                      <div className="mt-2 rounded-2xl p-4 bg-primary/5 border border-primary/10">
                        <div className="flex flex-col gap-2">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">TOTAIS ({filtered.length} {level})</span>
                          <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                            <span className="text-xs text-muted-foreground font-bold">Gasto</span>
                            <span className="font-mono font-black text-primary text-sm">R$ {fmtBRL(totCost)}</span>
                          </div>
                          {(() => {
                            const entries = formatMetricVectorSummary(metricVector);
                            const isVecMixed = entries.length > 1;
                            const summaryTxt = entries.map(e => `${fmtN(e.value)} ${e.label.toLowerCase()}`).join(" • ");
                            return (
                              <div className="flex items-center justify-between border-b border-primary/10 pb-2">
                                <span className="text-xs text-muted-foreground font-bold">{isVecMixed ? "Resultados (Tipo)" : "Resultados"}</span>
                                <span className="font-mono font-black text-violet-400 text-sm text-right">
                                  {isVecMixed ? summaryTxt : (totConv > 0 ? fmtN(totConv) : "—")}
                                </span>
                              </div>
                            );
                          })()}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground font-bold">Custo por Res.</span>
                            <span className="font-mono font-black text-emerald-400 text-sm">{avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—"}</span>
                          </div>
                        </div>
                      </div>

                    </div>
                    {/* --- FIM MOBILE CARDS --- */}

                    {/* --- BOTÃO MOSTRAR MAIS --- */}
                    {visibleCount < filtered.length && (
                      <div className="pt-6 pb-2 flex justify-center w-full">
                        <button 
                          onClick={() => setVisibleCount(v => v + 40)}
                          className="rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-xs font-bold text-foreground hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2"
                        >
                          Mostrar Mais ({filtered.length - visibleCount} ocultos)
                        </button>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              )}

              {/* ═══════════════════════════════════════════════════════════════════════
                  SEÇÃO: REGRAS & DIRETRIZES OPERACIONAIS DA CONTA SELECIONADA
                  ═══════════════════════════════════════════════════════════════════════ */}
              {accountFilter !== "all" && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl border border-rose-500/25 bg-gradient-to-br from-card via-card to-rose-950/10 p-5 shadow-lg space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 shrink-0 shadow-glow-sm">
                        <ShieldAlert className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black tracking-tight text-foreground">
                            Regras & Diretrizes Operacionais Desta Conta
                          </h3>
                          <span className="rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-rose-500">
                            {activeAccountRules.filter((r) => r.is_active).length} Ativas
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Políticas inegociáveis, limites operacionais e anotações ativas para guiar o time de tráfego.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {accountMindMaps.length > 0 && (
                        <Link
                          to={"/strategy-map" as any}
                          search={{ account: accountFilter } as any}
                          className="flex items-center gap-1.5 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 text-xs font-bold text-purple-300 hover:bg-purple-600 hover:text-white transition-all shadow-sm"
                        >
                          <Brain className="h-3.5 w-3.5 text-purple-400" />
                          <span>Ver Mapa Mental ({accountMindMaps.length})</span>
                        </Link>
                      )}

                      <Link
                        to={"/regras" as any}
                        search={{ account: accountFilter } as any}
                        className="flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-black text-primary-foreground hover:opacity-90 shadow-glow-sm transition-all"
                      >
                        <span>Gerenciar Regras no Hub</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Lista das Regras da Conta */}
                  {activeAccountRules.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border/60 bg-background/30 p-6 text-center space-y-2">
                      <p className="text-xs font-bold text-muted-foreground">
                        Nenhuma regra operacional cadastrada para esta conta ainda.
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 max-w-md mx-auto">
                        Crie regras de escala, limites de CPL e alertas operacionais para garantir a consistência dos resultados.
                      </p>
                      <Link
                        to={"/regras" as any}
                        search={{ account: accountFilter } as any}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-xs font-bold text-primary hover:bg-primary hover:text-primary-foreground transition-all mt-1"
                      >
                        Adicionar Regra no Hub <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {activeAccountRules.map((rule) => {
                        return (
                          <div
                            key={rule.id}
                            className={`rounded-xl border p-3.5 bg-card/70 transition-all ${
                              rule.is_active ? "border-rose-500/25 shadow-sm" : "border-border/60 opacity-60"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="rounded-full bg-muted/60 border border-border px-2 py-0.5 text-[8px] font-black uppercase text-foreground">
                                {rule.type || "Geral"}
                              </span>

                              <span className={`text-[9px] font-bold ${rule.is_active ? "text-emerald-400" : "text-muted-foreground italic"}`}>
                                {rule.is_active ? "Ativa" : "Pausada"}
                              </span>
                            </div>

                            {rule.campaign_name && (
                              <div className="mt-1 text-[9px] font-semibold text-blue-400 truncate">
                                Campanha: {rule.campaign_name}
                              </div>
                            )}

                            <h4 className="text-xs font-black text-foreground mt-1.5 leading-tight">
                              {rule.title}
                            </h4>

                            <p className="text-[11px] text-muted-foreground font-mono mt-1 leading-relaxed bg-background/50 rounded-lg p-2 border border-border/40">
                              {rule.description}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Diagnóstico */}
              {auditData && auditData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
                    <FlaskConical className="h-4 w-4 text-orange-400"/>
                    <p className="text-xs font-black uppercase tracking-widest header-sport">Diagnóstico Meta</p>
                    <button onClick={() => setAuditData(null)} className="ml-auto text-muted-foreground/50 hover:text-foreground transition"><span className="text-[10px]">x</span></button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-white/5 bg-white/[0.02]"><th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Campanha</th><th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Objetivo</th><th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">App Conv.</th><th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Total Conv.</th></tr></thead>
                      <tbody className={isFetchingCamps ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
                        {auditData.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="px-4 py-3 font-semibold max-w-[240px] truncate">{a.campaign_name || a.name}</td>
                            <td className="px-4 py-3 text-center"><ObjectiveBadge objective={a.objective} name={a.name}/></td>
                            <td className="px-4 py-3 text-right font-mono text-primary">{a.app_conversions ?? "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-violet-400">{a.total_actions ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {/* Placement Breakdown */}
              {level === "campanhas" && placementData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
                    <Layers className="h-4 w-4 text-violet-400"/>
                    <p className="text-xs font-black uppercase tracking-widest header-sport">Breakdown por Placement</p>
                    <span className="ml-auto text-[9px] text-muted-foreground/50">{selectedCamps.size > 0 ? `${selectedCamps.size} campanha(s) selecionada(s)` : "Todas as campanhas"}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-white/5 bg-white/[0.02]">
                        {["Placement","Plataforma","Impressões","CTR","Conversões","CPL","Gasto"].map(h => <th key={h} className={`px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 ${h === "Placement" || h === "Plataforma" ? "text-left" : "text-right"}`}>{h}</th>)}
                      </tr></thead>
                      <tbody className={isFetchingCamps ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
                        {placementData.map((p: any, i: number) => {
                          const maxSpend = placementData[0]?.spend || 1;
                          return (
                            <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                              <td className="px-4 py-3 font-semibold">{PLACEMENT_MAP[p.placement] || p.placement}</td>
                              <td className="px-4 py-3"><span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-bold ${PUBLISHER_COLOR[p.publisher] || "text-muted-foreground bg-white/5 border-white/10"}`}>{PUBLISHER_MAP[p.publisher] || p.publisher}</span></td>
                              <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmtN(p.impressions)}</td>
                              <td className="px-4 py-3 text-right font-mono text-blue-400">{p.ctr.toFixed(2)}%</td>
                              <td className="px-4 py-3 text-right font-mono text-violet-400">{fmtN(p.conversions)}</td>
                              <td className="px-4 py-3 text-right font-mono text-green-400">{p.cpl > 0 ? `R$ ${p.cpl.toFixed(2)}` : "—"}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden hidden sm:block"><div className="h-full rounded-full bg-primary/60" style={{ width: `${(p.spend / maxSpend) * 100}%` }}/></div>
                                  <span className="font-mono font-bold text-primary whitespace-nowrap">R$ {fmtBRL(p.spend)}</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ ANÁLISE â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {view === "analise" && (
            <motion.div key="analise" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

              <div className="flex gap-5">

                {/* Sidebar de modos */}
                <AnimatePresence>
                  {showSettings && (
                    <motion.aside initial={{ opacity: 0, x: -20, width: 0 }} animate={{ opacity: 1, x: 0, width: 220 }} exit={{ opacity: 0, x: -20, width: 0 }} className="shrink-0 space-y-2 overflow-hidden">
                      <div className="glass-panel card-sport p-4 space-y-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-3">Modo de Análise</p>
                        {(Object.entries(MODOS) as [ModoId, any][]).map(([id, m]) => (
                          <button key={id} onClick={() => setModo(id)} className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[11px] font-bold text-left transition-all ${modo === id ? `bg-primary/15 border border-primary/30 ${m.color}` : "text-muted-foreground hover:bg-white/5 border border-transparent"}`}>
                            <m.icon className={`h-3.5 w-3.5 shrink-0 ${modo === id ? m.color : ""}`}/>
                            {m.label}
                          </button>
                        ))}
                        <div className="pt-3 border-t border-white/5 space-y-3">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Refresh Auto</p>
                          <select value={refreshInterval} onChange={e => setRefreshInterval(Number(e.target.value))} className="w-full appearance-none rounded-xl border border-white/10 bg-background/40 px-3 py-1.5 text-xs font-bold focus:outline-none">
                            {[{v:0,l:"Manual"},{v:30,l:"30s"},{v:60,l:"1 min"},{v:300,l:"5 min"}].map(o => <option key={o.v} value={o.v} className="bg-background">{o.l}</option>)}
                          </select>
                          {refreshInterval > 0 && <p className="text-[9px] text-muted-foreground/50">Último sync: {format(lastRefresh, "HH:mm:ss")}</p>}
                        </div>
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>

                {/* Conteúdo dos gráficos */}
                <div className="flex-1 min-w-0 space-y-5">

                  {/* Foco do modo */}
                  <div className={`rounded-xl border p-3.5 flex items-start gap-3 ${INSIGHT_COLOR.info}`}>
                    <Info className="h-4 w-4 mt-0.5 shrink-0"/>
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-wider mb-0.5">{MODOS[modo].label}</p>
                      <p className="text-[11px] leading-relaxed opacity-80">{MODOS[modo].foco}</p>
                    </div>
                  </div>

                  {/* â"€â"€ Painel de Saúde Executivo â"€â"€ */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport p-4 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Saúde da Conta</p>
                      <div className={`text-3xl font-black tabular-nums ${overallHealthScore >= 70 ? "text-green-400" : overallHealthScore >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                        {overallHealthScore}<span className="text-base font-bold opacity-40">/100</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{overallHealthScore >= 70 ? "Conta saudável" : overallHealthScore >= 45 ? "Precisa de atenção" : "Ação urgente"}</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel card-sport p-4">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Verba sem Retorno</p>
                      <div className="text-xl font-black text-red-400 tabular-nums truncate">R$ {fmtBRL(wastedSpend)}</div>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">{enrichedCampaigns.filter((c: any) => c.t.conversions === 0 && c.t.cost > 20).length} camp. sem lead</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel card-sport p-4 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Prontas p/ Escalar</p>
                      <div className="text-3xl font-black text-green-400">{campDecisions.filter((c: any) => c.decision.tier === "green").length}</div>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">campanhas eficientes</p>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel card-sport p-4 text-center">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 mb-2">Pausar Imediato</p>
                      <div className="text-3xl font-black text-red-400">{campDecisions.filter((c: any) => c.decision.tier === "red").length}</div>
                      <p className="text-[10px] text-muted-foreground/60 mt-1.5">gasto sem conversão</p>
                    </motion.div>
                  </div>

                  {/* â"€â"€ Guia de Benchmarks de Sucesso â"€â"€ */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.18 }}
                    className="glass-panel border border-white/[0.06] bg-gradient-to-r from-primary/5 via-violet-500/5 to-transparent rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary animate-pulse" />
                      <h4 className="text-[10px] font-black uppercase text-foreground tracking-widest">Guia de Benchmarks de Sucesso da Victoria AI</h4>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-normal">
                      Compare as métricas das suas campanhas de tráfego com a média ideal do mercado automotivo para calibrar a escala e eficiência:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                      <div className="bg-white/[0.01] border border-white/[0.03] rounded-xl p-3 space-y-1">
                        <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider block">CTR (Taxa de Clique)</span>
                        <p className="text-[10px] font-extrabold text-foreground font-mono">Ideal: &gt; 1.20%</p>
                        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">Abaixo disso indica que o criativo (imagem/vídeo) não está gerando interesse.</p>
                      </div>
                      <div className="bg-white/[0.01] border border-white/[0.03] rounded-xl p-3 space-y-1">
                        <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider block">CPM (Custo por Mil)</span>
                        <p className="text-[10px] font-extrabold text-foreground font-mono">Ideal: R$ 18.00 a R$ 32.00</p>
                        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">CPM muito alto indica leilão saturado ou público-alvo muito restrito.</p>
                      </div>
                      <div className="bg-white/[0.01] border border-white/[0.03] rounded-xl p-3 space-y-1">
                        <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-wider block">CPL (Custo por Lead)</span>
                        <p className="text-[10px] font-extrabold text-foreground font-mono">Ideal: R$ 12.00 a R$ 25.00</p>
                        <p className="text-[9px] text-muted-foreground/50 leading-relaxed">CPL acima de R$ 30 compromete o retorno financeiro da operação comercial.</p>
                      </div>
                    </div>
                  </motion.div>

                  {/* â"€â"€ Funil de Conversão â"€â"€ */}
                  {totImpr > 0 && (
                    <ChartCard
                      icon={<Activity className="h-4 w-4 text-cyan-400"/>}
                      title="Funil de Conversão da Conta"
                      badge="Impressões â†’ Leads"
                      context="Onde os leads estão sendo perdidos. CTR baixo = criativo ou segmentação fraca. Conv. cliquesâ†’leads baixa = oferta ou landing page fraca."
                      modoExplicativo={modoExplicativo}
                      didaticInfo={{
                        analise: "A eficiência em cada etapa do caminho percorrido até o lead: quantas pessoas viram o anúncio, quantas únicas foram alcançadas, quantas clicaram e quantas viraram lead.",
                        decisao: "CTR < 1% = troque o criativo imediatamente. Taxa cliquesâ†’leads < 2% = revise a oferta, a landing page ou o formulário. São as duas maiores alavancas para reduzir CPL sem aumentar investimento."
                      }}
                    >
                      <div className="space-y-3.5 pt-1">
                        {funnelData.map((stage, i) => (
                          <div key={i}>
                            <div className="flex justify-between items-center mb-1.5">
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: stage.color }}/>
                                <span className="text-[11px] font-bold text-foreground">{stage.label}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] font-mono font-bold text-foreground">{fmtN(stage.value)}</span>
                                {i > 0 && stage.value > 0 && (
                                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded whitespace-nowrap ${
                                    i === 2 ? (stage.rate >= 1.5 ? "text-green-400 bg-green-400/10" : stage.rate >= 0.5 ? "text-yellow-400 bg-yellow-400/10" : "text-red-400 bg-red-400/10") :
                                    i === 3 ? (stage.rate >= 3 ? "text-green-400 bg-green-400/10" : stage.rate >= 1 ? "text-yellow-400 bg-yellow-400/10" : "text-red-400 bg-red-400/10") :
                                    "text-muted-foreground bg-white/5"
                                  }`}>{stage.rate.toFixed(i <= 1 ? 0 : 2)}%</span>
                                )}
                              </div>
                            </div>
                            <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full rounded-full"
                                style={{ background: stage.color, opacity: 0.8 }}
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.max(stage.widthPct, stage.value > 0 ? 1 : 0)}%` }}
                                transition={{ duration: 0.9, delay: i * 0.12, ease: "easeOut" }}
                              />
                            </div>
                            {i < funnelData.length - 1 && funnelData[i + 1].value > 0 && stage.value > 0 && (
                              <p className="text-[9px] text-muted-foreground/40 mt-1 pl-4">
                                {fmtN(stage.value - funnelData[i + 1].value)} não avançam â†’ {funnelData[i + 1].label.toLowerCase()}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </ChartCard>
                  )}

                  {/* Insights */}
                  {insights.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-primary"/>Insights Automáticos ({insights.length})</p>
                      {insights.map((ins, i) => {
                        const Icon = INSIGHT_ICON[ins.level];
                        const isExp = expandedInsight === i;
                        return (
                          <div key={i} className={`rounded-xl border p-3 cursor-pointer transition-all ${INSIGHT_COLOR[ins.level]}`} onClick={() => setExpandedInsight(isExp ? null : i)}>
                            <div className="flex items-start gap-2.5">
                              <Icon className="h-3.5 w-3.5 mt-0.5 shrink-0"/>
                              <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold leading-snug">{ins.title}</p>
                                <AnimatePresence>
                                  {isExp && (
                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-2 space-y-1.5">
                                      <p className="text-[10px] opacity-80">{ins.detail}</p>
                                      <p className="text-[10px] font-bold">â†’ {ins.acao}</p>
                                      {ins.camps && ins.camps.length > 0 && <div className="flex flex-wrap gap-1 mt-1">{ins.camps.slice(0,4).map((n,j) => <span key={j} className="text-[9px] rounded px-1.5 py-0.5 bg-white/10 font-mono">{n.substring(0,25)}</span>)}</div>}
                                    </motion.div>
                                  )}
                                </AnimatePresence>
                              </div>
                              <ChevronRight className={`h-3.5 w-3.5 shrink-0 opacity-50 transition-transform ${isExp ? "rotate-90" : ""}`}/>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {campaigns.length === 0 ? (
                    <div className="glass-panel py-20 text-center text-sm text-muted-foreground">Nenhuma campanha no período. Sincronize os dados primeiro.</div>
                  ) : (
                    <>
                      {/* â"€â"€ Motor de Decisão por Campanha â"€â"€ */}
                      {(!selectedCampaignId && campDecisions.length > 0) && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden">
                          <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5">
                            <Target className="h-4 w-4 text-primary"/>
                            <p className="text-xs font-black uppercase tracking-widest header-sport">Motor de Decisão por Campanha</p>
                            <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">{campDecisions.length} camp. Â· urgência decrescente</span>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-white/5 bg-white/[0.02]">
                                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Campanha</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 hidden md:table-cell">CPL</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 hidden md:table-cell">CTR</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 hidden lg:table-cell">Freq.</th>
                                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50 hidden lg:table-cell">Gasto</th>
                                  <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Score</th>
                                  <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Decisão</th>
                                </tr>
                              </thead>
                              <tbody className={isFetchingCamps ? "opacity-50 pointer-events-none transition-opacity duration-200" : "transition-opacity duration-200"}>
                                {campDecisions.map((c: any) => {
                                  const dc = DECISION_COLORS[c.decision.tier] || DECISION_COLORS.blue;
                                  return (
                                    <tr 
                                      key={c.id} 
                                      onClick={() => { setSelectedCampaignId(c.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                      className="border-b border-white/[0.03] hover:bg-white/[0.04] transition-colors cursor-pointer group"
                                    >
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${c.status?.toUpperCase() === "ACTIVE" ? "bg-green-400" : "bg-white/20"}`}/>
                                          <div className="min-w-0">
                                            <p className="font-semibold text-[11px] text-foreground max-w-[200px] truncate group-hover:text-primary transition-colors">{c.name}</p>
                                            <p className="text-[9px] text-muted-foreground/50 mt-0.5 truncate max-w-[200px]">{c.decision.reason}</p>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-right hidden md:table-cell">
                                        {c.t.cpl > 0 ? (
                                          <div>
                                            <p className={`font-mono font-bold text-[11px] ${c.t.cpl < avgCpl * 0.7 ? "text-green-400" : c.t.cpl > avgCpl * 1.8 ? "text-red-400" : "text-yellow-400"}`}>R$ {c.t.cpl.toFixed(2)}</p>
                                            {avgCpl > 0 && <p className="text-[9px] text-muted-foreground/50">{c.t.cpl < avgCpl ? `${Math.round((1-c.t.cpl/avgCpl)*100)}% abaixo` : `${Math.round((c.t.cpl/avgCpl-1)*100)}% acima`}</p>}
                                          </div>
                                        ) : <span className="text-muted-foreground/30 font-mono">—</span>}
                                      </td>
                                      <td className="px-4 py-3 text-right hidden md:table-cell">
                                        <span className={`font-mono font-bold text-[11px] ${c.t.ctr >= 2 ? "text-green-400" : c.t.ctr >= 1 ? "text-yellow-400" : c.t.impressions > 1000 ? "text-red-400" : "text-muted-foreground/40"}`}>
                                          {c.t.impressions > 0 ? `${c.t.ctr.toFixed(2)}%` : "—"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                                        <span className={`font-mono font-bold text-[11px] ${c.t.freq > 0 && c.t.freq <= 2 ? "text-green-400" : c.t.freq <= 3.5 ? "text-yellow-400" : c.t.freq > 3.5 ? "text-red-400" : "text-muted-foreground/40"}`}>
                                          {c.t.freq > 0 ? `${c.t.freq.toFixed(1)}x` : "—"}
                                        </span>
                                      </td>
                                      <td className="px-4 py-3 text-right hidden lg:table-cell">
                                        <span className="font-mono font-bold text-[11px] text-primary">R$ {fmtBRL(c.t.cost)}</span>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <span className={`text-[12px] font-black tabular-nums ${c.healthScore >= 70 ? "text-green-400" : c.healthScore >= 45 ? "text-yellow-400" : "text-red-400"}`}>{c.healthScore}</span>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <span className={`inline-flex items-center rounded border px-2 py-1 text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${dc}`}>
                                          {c.decision.label}
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {modoExplicativo && (
                              <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.005]">
                                <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                                  <span className="font-bold text-green-400">ESCALAR</span> = CPL 30%+ abaixo da média com â‰¥3 leads — aumente budget 20-30%/dia.{" "}
                                  <span className="font-bold text-red-400">PAUSAR</span> = gasto sem nenhum lead — pare e revise.{" "}
                                  <span className="font-bold text-orange-400">RENOVAR/TROCAR</span> = freq. â‰¥4.5x ou CTR â‰¤0.5% — mude o criativo.
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* ── Drill-down da Campanha (Timeline + Ad Rankings) ── */}
                      {selectedCampaignId && selectedCampaignObj && (
                        <div className="space-y-5">
                          {/* Timeline da Campanha */}
                          <ChartCard
                            icon={<TrendingUp className="h-4 w-4 text-primary"/>}
                            title="Linha do Tempo da Campanha (Evolução)"
                            badge="CPL vs CTR vs Frequência"
                          >
                            <div className="h-[250px] w-full mt-4">
                              <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={(selectedCampaignObj._metrics || []).slice().sort((a:any,b:any) => a.date.localeCompare(b.date)).map((m:any) => ({
                                  date: format(new Date(m.date), "dd/MM", { locale: ptBR }),
                                  cpl: Number(m.conversions) > 0 ? Number(m.cost) / Number(m.conversions) : 0,
                                  ctr: Number(m.impressions) > 0 ? (Number(m.clicks) / Number(m.impressions)) * 100 : 0,
                                  freq: Number(m.reach) > 0 ? Number(m.impressions) / Number(m.reach) : 0,
                                  cost: Number(m.cost)
                                }))}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" vertical={false} />
                                  <XAxis dataKey="date" stroke="#ffffff40" fontSize={10} tickMargin={8} />
                                  <YAxis yAxisId="left" stroke="#ffffff40" fontSize={10} tickFormatter={v => `R$${v}`} />
                                  <YAxis yAxisId="right" orientation="right" stroke="#ffffff40" fontSize={10} tickFormatter={v => `${v}%`} />
                                  <Tooltip content={<CustomTooltip />} />
                                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                                  <Bar yAxisId="left" dataKey="cost" name="Gasto" fill="#6366f1" opacity={0.3} radius={[4,4,0,0]} />
                                  <Line yAxisId="left" type="monotone" dataKey="cpl" name="CPL" stroke="#ec4899" strokeWidth={2} dot={{r: 3}} />
                                  <Line yAxisId="right" type="monotone" dataKey="ctr" name="CTR %" stroke="#10b981" strokeWidth={2} />
                                  <Line yAxisId="right" type="monotone" dataKey="freq" name="Frequência" stroke="#f59e0b" strokeWidth={2} strokeDasharray="4 4" />
                                </ComposedChart>
                              </ResponsiveContainer>
                            </div>
                          </ChartCard>

                          {/* Motor de Decisão Meta Ads (Rankings de Qualidade) */}
                          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden mt-5">
                            <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3.5">
                              <Target className="h-4 w-4 text-primary"/>
                              <p className="text-xs font-black uppercase tracking-widest header-sport">Qualidade do Leilão (Meta Rankings)</p>
                              <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">Diagnóstico Algorítmico</span>
                            </div>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-white/5 bg-white/[0.02]">
                                    <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Anúncio</th>
                                    <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Qualidade</th>
                                    <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Engajamento</th>
                                    <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Conversão</th>
                                    <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">CPL</th>
                                    <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Gasto</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {enrichedAds.length === 0 ? (
                                    <tr><td colSpan={6} className="text-center py-6 text-muted-foreground text-[11px]">Nenhum anúncio encontrado ou rankings não disponíveis.</td></tr>
                                  ) : enrichedAds.map((ad: any) => {
                                    const stats = periodStats.find((p: any) => p.entity_type === 'ad' && p.entity_id === ad.id);
                                    
                                    const formatRanking = (val: string) => {
                                      if (!val) return <span className="text-muted-foreground/40">—</span>;
                                      if (val.includes("BELOW")) return <span className="text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded uppercase text-[8px] font-black">Abaixo da Média</span>;
                                      if (val.includes("ABOVE")) return <span className="text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded uppercase text-[8px] font-black">Acima da Média</span>;
                                      return <span className="text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 px-2 py-0.5 rounded uppercase text-[8px] font-black">Na Média</span>;
                                    };

                                    return (
                                      <tr key={ad.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-3">
                                          <div className="flex items-center gap-2">
                                            <div className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${ad.status?.toUpperCase() === "ACTIVE" ? "bg-green-400" : "bg-white/20"}`}/>
                                            <p className="font-semibold text-[11px] text-foreground max-w-[200px] truncate">{ad.name}</p>
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">{formatRanking(stats?.quality_ranking)}</td>
                                        <td className="px-4 py-3 text-center">{formatRanking(stats?.engagement_rate_ranking)}</td>
                                        <td className="px-4 py-3 text-center">{formatRanking(stats?.conversion_rate_ranking)}</td>
                                        <td className="px-4 py-3 text-right">
                                          <span className="font-mono font-bold text-[11px] text-primary">{ad.t.cpl > 0 ? `R$ ${ad.t.cpl.toFixed(2)}` : "—"}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                          <span className="font-mono font-bold text-[11px] text-muted-foreground">R$ {fmtBRL(ad.t.cost)}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </motion.div>
                        </div>
                      )}

                      {/* Seletor Dinâmico de Gráficos e Configuração */}
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4 mb-2">
                        <div className="flex items-center gap-3">
                          <SlidersHorizontal className="h-4 w-4 text-primary" />
                          <div className="flex items-center gap-1 rounded-xl border border-white/5 bg-background/40 p-0.5">
                            {isAdmin && (
                              <button
                                onClick={() => setActiveChartTab("metricas")}
                                className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${activeChartTab === "metricas" ? "bg-primary text-primary-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground"}`}
                              >
                                Métricas da Agência (Painel Executivo)
                              </button>
                            )}
                            <button
                              onClick={() => setActiveChartTab("campanhas")}
                              className={`rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-wider transition-all ${activeChartTab === "campanhas" ? "bg-primary text-primary-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground"} ${!isAdmin ? "w-full text-center" : ""}`}
                            >
                              Meus Gráficos (Campanhas)
                            </button>
                          </div>
                        </div>

                        {/* Botão de Edição de Layout */}
                        <div>
                          {activeChartTab === "metricas" ? (
                            isAdmin && (
                              <button
                                onClick={() => navigate({ to: "/metricas/grafico" as any })}
                                className="flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/10 hover:bg-primary/20 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-primary transition-all shadow-[0_0_12px_rgba(99,102,241,0.15)]"
                              >
                                <Pencil className="h-3 w-3" />
                                Personalizar Painel Executivo
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => navigate({ to: "/campanhas/grafico" as any })}
                              className="flex items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/10 hover:bg-violet-500/20 px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-violet-400 transition-all"
                            >
                              <Pencil className="h-3 w-3" />
                              Personalizar Meus Gráficos
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Renderização Dinâmica dos Gráficos Configurados */}
                      {(() => {
                        const activeConfigs = activeChartTab === "metricas" ? metricasConfigs : campanhasConfigs;
                        if (!activeConfigs || activeConfigs.length === 0) {
                          return (
                            <div className="glass-panel py-20 text-center text-sm text-muted-foreground">
                              Carregando configurações de layout...
                            </div>
                          );
                        }

                        return (
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            {activeConfigs.map((config) => (
                              <div
                                key={config.id}
                                className={config.layout_w === 12 ? "lg:col-span-2" : ""}
                              >
                                <ChartCard
                                  icon={<TrendingUp className="h-4 w-4 text-primary" />}
                                  title={config.title}
                                  badge={config.metric ? config.metric.toUpperCase() : "MÉTRICA"}
                                  context={config.description || "Gráfico de performance personalizado"}
                                  modoExplicativo={modoExplicativo}
                                >
                                  <div className="h-[240px] w-full pt-2">
                                    <ChartEngine config={config} data={chartData} />
                                  </div>
                                </ChartCard>
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ DEMOGRÁFICOS â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {view === "demograficos" && (
            <motion.div key="demo" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {loadingBreakdowns ? (
                <div className="flex flex-col items-center gap-3 py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                  <p className="text-sm text-muted-foreground">Carregando dados demográficos...</p>
                </div>
              ) : !breakdowns || breakdowns.hasRealData === false ? (
                <div className="glass-panel py-20 text-center space-y-3">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto"/>
                  <p className="text-sm text-muted-foreground">Nenhum dado demográfico ou de breakdown retornado pelo Meta Ads para o período e filtro selecionados.</p>
                  <p className="text-xs text-muted-foreground/60">Clique em Sync após selecionar o período desejado para consultar os breakdowns disponíveis na Graph API.</p>
                </div>
              ) : (
                <>

                  {/* Banner de filtros ativos */}
                  {(selectedCamps.size > 0 || accountFilter !== "all") && (
                    <div className="flex flex-wrap items-center gap-2 mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-[11px]">
                      <Layers className="h-3.5 w-3.5 text-primary shrink-0"/>
                      <span className="font-black text-primary uppercase tracking-widest text-[10px]">Filtros Ativos:</span>
                      {accountFilter !== "all" && (
                        <span className="rounded-lg border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-foreground">
                          Conta: {adAccounts.find((a: any) => a.id === accountFilter)?.name || accountFilter}
                        </span>
                      )}
                      {selectedCamps.size > 0 && (
                        <span className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 font-mono text-violet-400">
                          {selectedCamps.size} campanha{selectedCamps.size > 1 ? "s" : ""} selecionada{selectedCamps.size > 1 ? "s" : ""}
                        </span>
                      )}
                      <span className="text-muted-foreground/60 ml-1">— dados demográficos refletem esta seleção</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                  {/* Guia Explicativo Demográficos */}
                  {modoExplicativo && (
                    <div className="lg:col-span-2">
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="glass-panel p-5 border-l-4 border-l-pink-500 bg-gradient-to-r from-pink-500/5 via-violet-500/5 to-transparent rounded-xl space-y-3 relative overflow-hidden"
                      >
                        <div className="absolute right-4 top-4 text-pink-500/10 pointer-events-none">
                          <Users className="h-20 w-20 animate-pulse" />
                        </div>
                        <div className="flex items-center gap-2">
                          <Sparkles className="h-4 w-4 text-pink-400 animate-spin" style={{ animationDuration: '3s' }} />
                          <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Guia de Interpretação — Dados Demográficos</h4>
                          <span className="text-[9px] bg-pink-500/20 text-pink-400 px-2 py-0.5 rounded-full font-bold uppercase">Segmentação Inteligente</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed max-w-4xl">
                          Os dados demográficos revelam quem é o seu público real e onde ele está — use estas informações para refinar sua segmentação e maximizar o retorno sobre investimento.
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                          {[
                            { t: "Gênero & CPL", d: "Revela qual gênero converte ao menor custo. Ajuste criativos e copy para focar no gênero de menor CPL.", e: "👥" },
                            { t: "Faixa Etária", d: "Identifica grupos etários mais eficientes. Exclua faixas caras e intensifique nas faixas de menor CPL.", e: "🎯" },
                            { t: "Plataforma (Facebook/Instagram)", d: "Compara conversões e CPL por rede social. Concentre orçamento na plataforma com menor custo por resultado.", e: "📱" },
                            { t: "Top Regiões", d: "Estados e cidades que mais convertem. Exclua regiões ineficientes e escale nas de maior tração.", e: "📍" },
                            { t: "Dia & Horário de Pico", d: "Janelas de maior engajamento. Programe anúncios para intensificar entrega nos momentos de mais conversão.", e: "⏰" },
                            { t: "Dispositivo (Mobile/Desktop)", d: "Se conversões dominam mobile, sua landing page deve carregar em menos de 2 segundos no celular.", e: "💻" },
                          ].map((item, idx) => (
                            <div key={idx} className="bg-white/[0.015] border border-white/[0.04] rounded-lg p-2.5 hover:bg-white/[0.03] transition-colors">
                              <div className="flex items-center gap-1.5 mb-1">
                                <span className="text-[12px]">{item.e}</span>
                                <span className="text-[10px] font-bold text-foreground">{item.t}</span>
                              </div>
                              <p className="text-[9px] text-muted-foreground leading-relaxed">{item.d}</p>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    </div>
                  )}

                  {/* Gênero */}
                  {breakdowns.genderData.length > 0 && (
                    <ChartCard icon={<Users className="h-4 w-4 text-pink-400"/>} title="Conversões por Gênero" context="Distribuição de resultados por gênero — use para ajustar segmentação e criativos." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A afinidade do produto com o gênero dos usuários que converteram: proporção de resultados entre Masculino e Feminino.", decisao: "Ajuste criativos e copywriting para focar no gênero com melhor CPL. Se mulheres convertem a menor custo, concentre maior orçamento em conjuntos segmentados por público feminino." }}>
                      <div className="flex items-stretch gap-4">
                        <ResponsiveContainer width="55%" height={180}>
                          <RechartsPieChart>
                            <Pie data={breakdowns.genderData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={5} dataKey="value">
                              {breakdowns.genderData.map((_: any, i: number) => <Cell key={i} fill={["#ec4899","#6366f1"][i % 2]}/>)}
                            </Pie>
                            <Tooltip content={<CustomTooltip/>}/>
                          </RechartsPieChart>
                        </ResponsiveContainer>
                        <div className="flex-1 space-y-3 self-center">
                          {breakdowns.genderData.map((g: any, i: number) => (
                            <div key={i}>
                              <div className="flex justify-between mb-1">
                                <span className="text-[10px] font-bold">{g.name}</span>
                                <span className="text-[10px] font-mono text-muted-foreground">{g.value} conv.</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${(g.value / Math.max(...breakdowns.genderData.map((x: any) => x.value), 1)) * 100}%`, background: ["#ec4899","#6366f1"][i%2] }}/>
                              </div>
                              {g.cpl > 0 && <p className="text-[9px] text-muted-foreground/60 mt-0.5">CPL: R$ {g.cpl.toFixed(2)}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </ChartCard>
                  )}

                  {/* Faixa etária */}
                  {breakdowns.ageData.length > 0 && (
                    <ChartCard icon={<Target className="h-4 w-4 text-amber-400"/>} title="CPL por Faixa Etária" context="Faixas com CPL mais baixo têm melhor custo por resultado — priorize na segmentação." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A eficiência financeira de cada faixa etária: quanto custou gerar uma conversão em cada grupo de idade.", decisao: "Negative faixas etárias com CPL muito acima da média ou crie conjuntos exclusivos para as faixas de melhor desempenho, alocando mais orçamento onde o custo por lead é menor." }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={breakdowns.ageData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={45}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="cpl" name="CPL R$" fill="#f59e0b" radius={[3,3,0,0]} opacity={0.85}/>
                          <Bar dataKey="conv" name="Conversões" fill="#8b5cf6" radius={[3,3,0,0]} opacity={0.7}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Plataforma */}
                  {breakdowns.platData.length > 0 && (
                    <ChartCard icon={<Megaphone className="h-4 w-4 text-blue-400"/>} title="Performance por Plataforma" context="Instagram vs Facebook vs Audience Network — redirecione budget para onde o CPL é menor." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A distribuição de conversões e custo por resultado entre as redes de distribuição: Facebook, Instagram e Audience Network.", decisao: "Realoque orçamento para a plataforma com menor CPL. Se o Instagram entrega leads 30% mais baratos, ajuste os conjuntos para priorizar entrega no Instagram com maior proporção de budget." }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={breakdowns.platData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={45}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="conv" name="Conversões" fill="#3b82f6" radius={[3,3,0,0]} opacity={0.85}/>
                          <Bar dataKey="cpl" name="CPL R$" fill="#06b6d4" radius={[3,3,0,0]} opacity={0.7}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Região */}
                  {breakdowns.regionData.length > 0 && (
                    <ChartCard icon={<Activity className="h-4 w-4 text-emerald-400"/>} title="Top Regiões" badge="Top 10" context="Estados que mais convertem — amplie público nessas regiões." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A dispersão geográfica das conversões: os 10 estados ou regiões com maior volume de resultados no período.", decisao: "Exclua estados com alto volume de impressões e zero conversões para reduzir desperdício. Crie conjuntos segmentados geograficamente para os top 3 estados, aumentando o lance ou orçamento nessas regiões de alta tração." }}>
                      <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                        {breakdowns.regionData.map((r: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-[9px] font-mono text-muted-foreground/50 w-4 shrink-0">{i+1}</span>
                            <span className="text-[11px] font-semibold flex-1 truncate">{r.name}</span>
                            <span className="text-[10px] font-mono text-violet-400 shrink-0">{r.conv} conv.</span>
                            {r.cpl > 0 && <span className="text-[10px] font-mono text-green-400 shrink-0">R$ {r.cpl.toFixed(2)}</span>}
                          </div>
                        ))}
                      </div>
                    </ChartCard>
                  )}

                  {/* Dia da semana */}
                  {breakdowns.dayOfWeekData.length > 0 && (
                    <ChartCard icon={<Eye className="h-4 w-4 text-violet-400"/>} title="Conversões por Dia da Semana" context="Dias com mais conversões — concentre budget e publicação de novos anúncios nesses dias." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "Os padrões de comportamento do público ao longo dos 7 dias da semana, identificando quais dias geram mais conversões.", decisao: "Ative o agendamento de anúncios para intensificar a entrega nos dias de maior conversão. Pause ou reduza o orçamento nos dias de baixíssima performance para economizar verba e direcionar ao pico." }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={breakdowns.dayOfWeekData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                          <XAxis dataKey="day" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={30}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="conv" name="Conversões" fill="#8b5cf6" radius={[3,3,0,0]} opacity={0.85}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Dispositivo */}
                  {breakdowns.deviceData.length > 0 && (
                    <ChartCard icon={<MousePointer2 className="h-4 w-4 text-cyan-400"/>} title="Performance por Dispositivo" context="Mobile vs Desktop — maioria das conversões no mobile indica necessidade de landing page responsiva." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A origem do tráfego convertido entre dispositivos móveis (celulares e tablets) e computadores desktop.", decisao: "Se conversões são massivas em mobile, garanta que a landing page carregue em menos de 2 segundos no celular. Use o PageSpeed Insights para verificar. CPL alto em mobile pode indicar lentidão na página ou formulário difícil de preencher." }}>
                      <ResponsiveContainer width="100%" height={180}>
                        <BarChart data={breakdowns.deviceData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                          <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={30}/>
                          <Tooltip content={<CustomTooltip/>}/>
                          <Bar dataKey="conv" name="Conversões" fill="#06b6d4" radius={[3,3,0,0]} opacity={0.85}/>
                          <Bar dataKey="cost" name="Gasto R$" fill="#6366f1" radius={[3,3,0,0]} opacity={0.7}/>
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  )}

                  {/* Heatmap Horário (7x24) */}
                  {breakdowns.heatMapData && breakdowns.heatMapData.length === 7 && (
                    <div className="lg:col-span-2">
                      <ChartCard icon={<Zap className="h-4 w-4 text-yellow-400"/>} title="Densidade de Conversões (Mapa de Calor 7x24)" context="Custo por Lead (CPL) por dia e horário — programe seus anúncios para entregar mais nessas janelas." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A distribuição de custos e conversões ao longo de todos os horários da semana. Tons de verde indicam horários com baixo CPL (eficientes). Tons de vermelho indicam CPL alto (caros).", decisao: "Programe as campanhas no Meta Ads para pausar nas madrugadas sem conversões e concentre o orçamento nos blocos verdes de alta tração." }}>
                        <div className="w-full mt-3 overflow-x-auto pb-4">
                          <div className="min-w-[600px] flex flex-col gap-1 text-[9px] font-mono">
                            <div className="flex gap-1 mb-1 ml-8">
                              {Array.from({ length: 24 }).map((_, h) => (
                                <div key={h} className="flex-1 text-center text-muted-foreground/60">{h}h</div>
                              ))}
                            </div>
                            {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map((dayName, d) => (
                              <div key={d} className="flex gap-1 items-center">
                                <div className="w-7 text-right pr-2 text-muted-foreground font-semibold">{dayName}</div>
                                {breakdowns.heatMapData[d].map((cell: any, h: number) => {
                                  const cpl = cell.cpl;
                                  const conv = cell.conv;
                                  let bgColor = "bg-white/[0.02]";
                                  if (conv > 0) {
                                    if (avgCpl > 0 && cpl < avgCpl * 0.7) bgColor = "bg-green-500/80";
                                    else if (avgCpl > 0 && cpl < avgCpl * 1.3) bgColor = "bg-green-500/40";
                                    else bgColor = "bg-red-500/60";
                                  } else if (cell.cost > 0) {
                                    bgColor = "bg-red-500/20";
                                  }

                                  return (
                                    <div 
                                      key={h} 
                                      className={`flex-1 h-6 rounded-sm ${bgColor} flex items-center justify-center transition-all hover:ring-1 hover:ring-white/50 cursor-crosshair group relative`}
                                    >
                                      {conv > 0 && <span className="text-[7px] text-white/80">{conv}</span>}
                                      {/* Tooltip on hover */}
                                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-max bg-black/90 border border-white/10 p-2 rounded-lg z-50 shadow-xl pointer-events-none">
                                        <p className="font-bold text-white mb-1">{dayName}, {h}h - {h+1}h</p>
                                        <p className="text-white/70">Conversões: <span className="text-white font-bold">{conv}</span></p>
                                        <p className="text-white/70">Gasto: <span className="text-white font-bold">R$ {cell.cost.toFixed(2)}</span></p>
                                        <p className="text-white/70">CPL: <span className="text-white font-bold">R$ {cpl.toFixed(2)}</span></p>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                          {avgCpl > 0 && (
                            <div className="mt-4 flex items-center justify-center gap-4 text-[9px] text-muted-foreground">
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500/80"></div><span>CPL Ótimo (&lt; R$ {(avgCpl*0.7).toFixed(2)})</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-green-500/40"></div><span>CPL Médio</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500/60"></div><span>CPL Alto (&gt; R$ {(avgCpl*1.3).toFixed(2)})</span></div>
                              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500/20"></div><span>Gasto sem Conversão</span></div>
                            </div>
                          )}
                        </div>
                      </ChartCard>
                    </div>
                  )}

                </div>
                </>
              )}
            </motion.div>
          )}

          {/* â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ CAMPAIGN INSPECTOR â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€ */}
          {selectedFocusItem && (
            <div className="fixed inset-0 z-50 overflow-hidden pointer-events-none">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.5 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedFocusItem(null)}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto"
              />
              {/* Gaveta Lateral */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 25, stiffness: 220 }}
                className="absolute right-0 top-0 h-full w-full max-w-lg border-l border-white/10 bg-background/95 p-6 shadow-2xl backdrop-blur-md overflow-y-auto flex flex-col pointer-events-auto"
              >
                {/* Header */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-mono uppercase tracking-wider">{selectedFocusItem.type}</span>
                      <ObjectiveBadge objective={selectedFocusItem.objective} name={selectedFocusItem.name} />
                    </div>
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wide leading-snug">{selectedFocusItem.name}</h3>
                  </div>
                  <button 
                    onClick={() => setSelectedFocusItem(null)}
                    className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-muted-foreground hover:text-foreground transition"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                </div>

                {/* Corpo */}
                <div className="flex-1 space-y-5">
                  {/* Status + Orçamento + Resultados */}
                  {(() => {
                    const focusDetail = getMetaResultDetail(
                      selectedFocusItem.t.conversions,
                      selectedFocusItem.name + " " + (selectedFocusItem.campaigns?.name || ""),
                      selectedFocusItem.objective || selectedFocusItem.campaigns?.objective,
                      selectedFocusItem.result_type
                    );
                    return (
                      <>
                        <div className="grid grid-cols-3 gap-2 bg-white/[0.02] border border-white/5 rounded-xl p-3">
                          <div>
                            <span className="text-[9px] text-muted-foreground/60 uppercase">Status</span>
                            <p className="text-xs font-bold text-foreground mt-0.5">{selectedFocusItem.delivery_status || selectedFocusItem.status || "Ativa"}</p>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground/60 uppercase">Orçamento</span>
                            <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                              {selectedFocusItem.daily_budget ? `R$ ${selectedFocusItem.daily_budget.toFixed(0)}/d` : selectedFocusItem.lifetime_budget ? `R$ ${selectedFocusItem.lifetime_budget.toFixed(0)}` : selectedFocusItem.budget ? `R$ ${selectedFocusItem.budget.toFixed(0)}` : "—"}
                            </p>
                          </div>
                          <div>
                            <span className="text-[9px] text-muted-foreground/60 uppercase truncate block" title={focusDetail.resultLabel}>Resultados</span>
                            <p className="text-xs font-mono font-black text-violet-400 mt-0.5">
                              {selectedFocusItem.t.conversions > 0 ? fmtN(selectedFocusItem.t.conversions) : "—"}
                            </p>
                            <span className="text-[8px] text-muted-foreground/60 leading-none truncate block mt-0.5" title={focusDetail.resultLabel}>
                              {focusDetail.resultLabel}
                            </span>
                          </div>
                        </div>

                        {/* Termômetros de Saúde */}
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-wider">Métricas de Saúde vs Benchmarks</h4>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { label: "CTR (Cliques/Impr.)", val: `${selectedFocusItem.t.ctr.toFixed(2)}%`, pct: Math.min(selectedFocusItem.t.ctr / 2 * 100, 100), desc: "Ideal: > 1.0%", color: selectedFocusItem.t.ctr >= 1.5 ? "bg-green-500" : selectedFocusItem.t.ctr >= 0.8 ? "bg-yellow-500" : "bg-red-500" },
                              { label: "Frequência", val: `${selectedFocusItem.t.freq.toFixed(2)}x`, pct: Math.min(selectedFocusItem.t.freq / 4 * 100, 100), desc: "Ideal: 1.5x a 3.0x", color: selectedFocusItem.t.freq > 3.5 ? "bg-red-500" : selectedFocusItem.t.freq > 2.5 ? "bg-yellow-500" : "bg-green-500" },
                              { label: "CPM (Custo por Mil)", val: `R$ ${selectedFocusItem.t.cpm.toFixed(2)}`, pct: Math.min(selectedFocusItem.t.cpm / 50 * 100, 100), desc: "Ideal: R$ 15 a R$ 35", color: selectedFocusItem.t.cpm > 40 ? "bg-red-500" : selectedFocusItem.t.cpm > 25 ? "bg-yellow-500" : "bg-green-500" },
                              { label: `Custo / Res. (${focusDetail.shortBadge})`, val: selectedFocusItem.t.cpl > 0 ? `R$ ${selectedFocusItem.t.cpl.toFixed(2)}` : "—", pct: selectedFocusItem.t.cpl > 0 ? Math.min(selectedFocusItem.t.cpl / 45 * 100, 100) : 0, desc: focusDetail.costLabel, color: selectedFocusItem.t.cpl > 35 ? "bg-red-500" : selectedFocusItem.t.cpl > 20 ? "bg-yellow-500" : "bg-green-500" },
                            ].map((item, idx) => (
                              <div key={idx} className="bg-white/[0.015] border border-white/[0.04] rounded-xl p-3 space-y-1">
                                <span className="text-[9px] text-muted-foreground/60">{item.label}</span>
                                <div className="flex justify-between items-baseline">
                                  <span className="text-xs font-mono font-black text-foreground">{item.val}</span>
                                  <span className="text-[8px] text-muted-foreground/50 truncate max-w-[120px]" title={item.desc}>{item.desc}</span>
                                </div>
                                <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                                  <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.pct}%` }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}

                  {/* Mini Gráfico Histórico */}
                  {itemTrendData.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-wider">Histórico de Performance (Últimos dias)</h4>
                      <div className="h-32 rounded-xl border border-white/5 bg-white/[0.01] p-3">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={itemTrendData}>
                            <defs>
                              <linearGradient id="colorGastoInspector" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                            <XAxis dataKey="date" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} width={30} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} width={15} />
                            <Tooltip content={<CustomTooltip />} />
                            <Area yAxisId="left" type="monotone" dataKey="gasto" name="Gasto R$" stroke="#6366f1" fillOpacity={1} fill="url(#colorGastoInspector)" strokeWidth={1.5} />
                            <Area yAxisId="right" type="monotone" dataKey="conversoes" name="Conversões" stroke="#a78bfa" fillOpacity={0} strokeWidth={1.5} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Bloco Diagnóstico IA */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black uppercase text-muted-foreground/60 tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3 w-3 text-primary animate-pulse" />
                      Diagnóstico da Victoria IA
                    </h4>
                      <button
                        onClick={() => handleOpenVictoriaDiagnostic(selectedFocusItem)}
                        className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                      >
                        <Bot className="h-3 w-3" />
                        Conversar no Chat Flutuante
                      </button>
                    </div>
                    <div className="rounded-xl border border-primary/20 bg-primary/[0.02] p-4 min-h-[140px] relative overflow-hidden">
                      {isGeneratingInsight ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/40 backdrop-blur-[1px]">
                          <Loader2 className="h-5 w-5 animate-spin text-primary" />
                          <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Victoria analisando dados...</span>
                        </div>
                      ) : null}
                      
                      <div className="space-y-1">
                        {aiInsightText ? parseMarkdown(aiInsightText) : (
                          <p className="text-[11px] text-muted-foreground/50 text-center py-8">Nenhum diagnóstico gerado ainda.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rodapé do Inspector com Recomendação rápida */}
                  {selectedFocusItem.t && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[9px] text-muted-foreground/60 uppercase">Recomendação Estratégica</span>
                        <p className="text-xs font-black text-foreground mt-0.5">{getDecision(selectedFocusItem, avgCpl, maxCplThreshold).label}</p>
                      </div>
                      <span className={`text-[10px] font-mono font-bold px-3 py-1 rounded-lg border ${DECISION_COLORS[getDecision(selectedFocusItem, avgCpl, maxCplThreshold).tier] || "text-muted-foreground border-white/10"}`}>
                        {getDecision(selectedFocusItem, avgCpl, maxCplThreshold).action}
                      </span>
                    </div>
                  )}

                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Victoria AI - Chat Flutuante Diagnóstico Estratégico */}
        <VictoriaFloatingChat
          isOpen={isFloatingChatOpen}
          onClose={() => setIsFloatingChatOpen(false)}
          contextItem={floatingChatContext}
          accountName={adAccounts.find((a: any) => a.id === accountFilter)?.name || "Conta Meta Ads"}
          avgAccountCpl={avgCpl > 0 ? avgCpl : accountBenchmarkCpl}
        />
      </div>
    </div>
  );
}
