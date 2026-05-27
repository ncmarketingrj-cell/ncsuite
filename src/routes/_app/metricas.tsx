// src/routes/_app/metricas.tsx
// NC Performance Suite — Métricas & Campanhas (Página Unificada)

import { createFileRoute, redirect, useSearch, useNavigate, useLocation } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, Pause, Loader2, RefreshCw, Layers, ChevronDown,
  LayoutGrid, Image as ImageIcon, CheckSquare, Square, Sparkles,
  BarChart3, TrendingUp, DollarSign, Users, MousePointer2, Target, Zap,
  Activity, Eye, Lock, BookOpen, MessageCircle, Car, Video,
  AlertTriangle, XCircle, CheckCircle2, Info, Settings2,
  ChevronRight, Megaphone, FlaskConical, Pencil,
  BarChart2, PieChart as PieIcon, SlidersHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DateRangePicker } from "@/components/DateRangePicker";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart as RechartsPieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine, ComposedChart, Line,
} from "recharts";
import { subDays, format, eachDayOfInterval } from "date-fns";
import { ptBR } from "date-fns/locale";

// ─── ROTA ────────────────────────────────────────────────────────────────────

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas & Campanhas — NC Suite" }] }),
  beforeLoad: async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) throw redirect({ to: "/login" });
    if (ADMIN_EMAILS.includes(sessionData.session.user.email || "")) return;
    const { data: profile } = await (supabase as any)
      .from("profiles").select("role, permissions").eq("id", sessionData.session.user.id).maybeSingle();
    if (profile?.role === "admin") return;
  },
  validateSearch: (s: Record<string, unknown>): { account?: string; campaign?: string; date?: string; view?: string } => ({
    account: s.account as string | undefined,
    campaign: s.campaign as string | undefined,
    date: s.date as string | undefined,
    view: s.view as string | undefined,
  }),
  component: MetricasCampanhasPage,
});

// ─── TIPOS ───────────────────────────────────────────────────────────────────

type Level      = "campanhas" | "conjuntos" | "anuncios";
type ViewMode   = "gestao" | "analise" | "demograficos";
type ModoId     = "geral" | "eficiencia" | "budget" | "audiencia" | "comparativo";
type InsightLvl = "danger" | "warning" | "success" | "info";

interface Insight { level: InsightLvl; title: string; detail: string; acao: string; camps?: string[]; }

// ─── CONSTANTES ───────────────────────────────────────────────────────────────

const OBJECTIVE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  OUTCOME_LEADS:      { label: "Leads",      color: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: Target },
  LEAD_GENERATION:    { label: "Leads",      color: "text-violet-400 bg-violet-500/10 border-violet-500/20", icon: Target },
  MESSAGES:           { label: "Mensagens",  color: "text-blue-400 bg-blue-500/10 border-blue-500/20",       icon: MessageCircle },
  OUTCOME_ENGAGEMENT: { label: "Engaj.",     color: "text-pink-400 bg-pink-500/10 border-pink-500/20",       icon: Zap },
  OUTCOME_TRAFFIC:    { label: "Tráfego",    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",    icon: Car },
  LINK_CLICKS:        { label: "Tráfego",    color: "text-amber-400 bg-amber-500/10 border-amber-500/20",    icon: Car },
  VIDEO_VIEWS:        { label: "Vídeo",      color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",       icon: Video },
  OUTCOME_AWARENESS:  { label: "Awareness",  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20", icon: Users },
  OUTCOME_SALES:      { label: "Vendas",     color: "text-primary bg-primary/10 border-primary/20",          icon: Target },
  CONVERSIONS:        { label: "Conversões", color: "text-primary bg-primary/10 border-primary/20",          icon: Target },
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
  audiencia:  { label: "Alcance & Frequência",  desc: "Detecte saturação e oportunidades de escala",           icon: Users,     color: "text-violet-400",    foco: "Campanhas com frequência > 3× estão saturando a audiência." },
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

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
const fmtN   = (v: number) => v.toLocaleString("pt-BR");
const getLocalDateStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;

function processMetrics(item: any, rawData: any[], startStr: string, endStr: string) {
  const m = (rawData || []).filter((x: any) => { if (!x.date) return true; const d = x.date.split("T")[0]; return d >= startStr && d <= endStr; });
  const cost        = m.reduce((s: number, x: any) => s + Number(x.cost        || 0), 0);
  const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
  const clicks      = m.reduce((s: number, x: any) => s + Number(x.clicks      || 0), 0);
  const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
  const reach       = m.reduce((s: number, x: any) => s + Number(x.reach       || 0), 0);
  const freq        = reach > 0 ? impressions / reach : 0;
  const cpl  = conversions > 0 ? cost / conversions : 0;
  const ctr  = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm  = impressions > 0 ? (cost / impressions) * 1000 : 0;
  const cpc  = clicks > 0 ? cost / clicks : 0;
  const roas = cost > 0 ? (conversions * 150) / cost : 0;
  return { ...item, t: { cost, conversions, clicks, impressions, reach, freq, cpl, ctr, cpm, cpc, roas }, _metrics: m };
}

function gerarInsights(camps: any[], totCost: number, totConv: number, avgCpl: number, avgCtr: number, avgCpm: number): Insight[] {
  const ins: Insight[] = [];
  if (!camps.length) return ins;
  const zeroConv = camps.filter(c => c.t.conversions === 0 && c.t.cost > totCost * 0.03 && c.t.cost > 50);
  if (zeroConv.length) ins.push({ level: "danger", title: `${zeroConv.length} campanha${zeroConv.length>1?"s":""} gastando sem conversão`, detail: `Desperdiçado: R$ ${fmtBRL(zeroConv.reduce((s,c) => s+c.t.cost,0))}`, acao: "Pausar e revisar criativo e segmentação", camps: zeroConv.map(c=>c.name) });
  const highCpl = camps.filter(c => c.t.cpl > 0 && c.t.cpl > avgCpl * 1.8 && c.t.cost > 30);
  if (highCpl.length) ins.push({ level: "warning", title: `${highCpl.length} campanha${highCpl.length>1?"s":""} com CPL acima de 80% da média`, detail: `Média: R$ ${avgCpl.toFixed(2)} — ${highCpl.slice(0,2).map(c=>`${c.name.substring(0,18)}: R$ ${c.t.cpl.toFixed(2)}`).join(", ")}`, acao: "Reduzir budget, testar criativos ou ajustar público", camps: highCpl.map(c=>c.name) });
  const highFreq = camps.filter(c => c.t.freq > 3 && c.t.impressions > 500);
  if (highFreq.length) ins.push({ level: "warning", title: `${highFreq.length} campanha${highFreq.length>1?"s":""} com frequência > 3× (saturação)`, detail: "Audiência vendo o mesmo anúncio repetidamente — CTR tende a cair", acao: "Expandir audiência, renovar criativos ou excluir convertidos", camps: highFreq.map(c=>c.name) });
  const lowCtr = camps.filter(c => c.t.impressions > 1000 && c.t.ctr < 0.5 && c.t.cost > 20);
  if (lowCtr.length) ins.push({ level: "warning", title: `${lowCtr.length} campanha${lowCtr.length>1?"s":""} com CTR abaixo de 0,5%`, detail: "Benchmark Meta Ads: 1–2%. Criativo ou segmentação fraco", acao: "Testar novos hooks, thumbnails e textos", camps: lowCtr.map(c=>c.name) });
  const topEff = camps.filter(c => c.t.cpl > 0 && c.t.cpl < avgCpl * 0.7 && c.t.conversions >= 3);
  if (topEff.length) ins.push({ level: "success", title: `${topEff.length} campanha${topEff.length>1?"s":""} com CPL ${Math.round((1-topEff[0].t.cpl/avgCpl)*100)}% abaixo da média — prontas para escalar`, detail: `"${topEff[0].name.substring(0,35)}" — CPL R$ ${topEff[0].t.cpl.toFixed(2)} com ${topEff[0].t.conversions} conversões`, acao: "Aumentar budget 10–20% por dia e monitorar CPL", camps: topEff.map(c=>c.name) });
  const goodCtr = camps.filter(c => c.t.ctr >= 2 && c.t.impressions > 500);
  if (goodCtr.length && !topEff.some(c=>goodCtr.find(g=>g.id===c.id))) ins.push({ level: "success", title: `${goodCtr.length} campanha${goodCtr.length>1?"s":""} com CTR ≥ 2% — acima do benchmark`, detail: `Meta Ads benchmark: 1–1,5%. Campanhas: ${goodCtr.slice(0,2).map(c=>c.name.substring(0,18)).join(", ")}`, acao: "Escalar budget e testar variações do criativo", camps: goodCtr.map(c=>c.name) });
  if (avgCpm > 25) ins.push({ level: "info", title: `CPM médio R$ ${avgCpm.toFixed(2)} — leilão competitivo`, detail: "CPM alto pode indicar público muito disputado ou segmentação restrita", acao: "Testar públicos mais amplos ou similares" });
  if (ins.length === 0 && totConv > 0) ins.push({ level: "info", title: "Conta saudável no período", detail: `${camps.length} campanhas, CPL médio R$ ${avgCpl.toFixed(2)}, CTR ${avgCtr.toFixed(2)}%`, acao: "Continue monitorando — considere testes A/B" });
  return ins;
}

// ─── SUB-COMPONENTES ──────────────────────────────────────────────────────────

function ObjectiveBadge({ objective }: { objective?: string }) {
  if (!objective) return null;
  const def = OBJECTIVE_MAP[objective];
  if (!def) return <span className="text-[8px] font-mono text-muted-foreground/60 uppercase">{objective.replace("OUTCOME_","")}</span>;
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
      whileHover={{ y: -4, scale: 1.01, boxShadow: "0 10px 30px -10px rgba(99, 102, 241, 0.12)", borderColor: "rgba(99, 102, 241, 0.2)" }}
      transition={{ duration: 0.3, type: "spring", stiffness: 300, damping: 20 }}
      className="glass-panel card-sport p-5 border border-white/[0.08] transition-colors"
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

// ─── TOOLTIP CUSTOMIZADO ──────────────────────────────────────────────────────

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

// ─── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────

function MetricasCampanhasPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchParams = useSearch({ from: "/_app/metricas" });

  // ── Perfil + acesso ──
  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
      return data as { role: string; permissions: Record<string, boolean> } | null;
    },
    enabled: !!user?.id,
  });
  const hasAccess = (user?.email ? ADMIN_EMAILS.includes(user.email) : false) || profileData?.role === "admin" || !!profileData?.permissions?.metricas;

  // ── Estado global compartilhado ──
  const [view,          setView]          = useState<ViewMode>("gestao");
  const [level,         setLevel]         = useState<Level>("campanhas");
  const [accountFilter, setAccountFilter] = useState(searchParams.account || "all");
  const [statusFilter,  setStatusFilter]  = useState<"all"|"active"|"paused">("all");
  const [search,        setSearch]        = useState("");
  const [dateRange,     setDateRange]     = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
  const [scrolled,      setScrolled]      = useState(false);
  const [modoExplicativo, setModoExplicativo] = useState(true);

  // ── Estado de seleção (tabela) ──
  const [selectedCamps,  setSelectedCamps]  = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());
  const [selectedAds,    setSelectedAds]    = useState<Set<string>>(new Set());
  const [changingId,     setChangingId]     = useState<string | null>(null);
  const [auditData,      setAuditData]      = useState<any[]|null>(null);
  const [isAuditing,     setIsAuditing]     = useState(false);

  // ── Estado de análise (charts) ──
  const [modo,            setModo]            = useState<ModoId>("geral");
  const [showSettings,    setShowSettings]    = useState(false);
  const [expandedInsight, setExpandedInsight] = useState<number|null>(null);
  const [refreshInterval, setRefreshInterval] = useState(0);
  const [lastRefresh,     setLastRefresh]     = useState(new Date());
  const intervalRef    = useRef<ReturnType<typeof setInterval>|null>(null);
  const autoSyncMutRef = useRef<any>(null);

  // ── Efeitos ──
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (searchParams.account) setAccountFilter(searchParams.account);
    if (searchParams.date) {
      const parsed = new Date(searchParams.date + "T12:00:00");
      if (!isNaN(parsed.getTime())) setDateRange({ startDate: parsed, endDate: parsed });
    }
    if (searchParams.view && (["gestao", "analise", "demograficos"] as string[]).includes(searchParams.view)) {
      setView(searchParams.view as ViewMode);
    }
    if (searchParams.campaign) setTimeout(() => { const el = document.getElementById(`row-${searchParams.campaign}`); el?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 600);
  }, [searchParams.account, searchParams.campaign, searchParams.date, searchParams.view]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (refreshInterval > 0) {
      intervalRef.current = setInterval(() => { qc.invalidateQueries({ queryKey: ["mc-camps"] }); setLastRefresh(new Date()); }, refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [refreshInterval, qc]);

  // Auto-sync a cada 3 minutos quando a aba está visível
  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible" && !autoSyncMutRef.current?.isPending) {
        autoSyncMutRef.current?.mutate();
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  // ─── QUERIES ─────────────────────────────────────────────────────────────────

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

  const { data: campaigns = [], isLoading: isLoadingCamps } = useQuery({
    queryKey: ["mc-camps", accountFilter, statusFilter, startStr, endStr],
    queryFn: async () => {
      let q = (supabase as any).from("campaigns").select(`id, name, status, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, external_id, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, reach, frequency, date)`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.metrics, startStr, endStr));
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  const { data: adSets = [], isLoading: isLoadingAdSets } = useQuery({
    queryKey: ["mc-adsets", Array.from(selectedCamps).join(","), statusFilter, startStr, endStr],
    enabled: level === "conjuntos" || level === "anuncios",
    queryFn: async () => {
      if (selectedCamps.size === 0) return [];
      let q = (supabase as any).from("ad_sets").select(`id, name, status, budget, external_id, campaign_id, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      q = q.in("campaign_id", Array.from(selectedCamps));
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ["mc-ads", Array.from(selectedAdSets).join(","), Array.from(selectedCamps).join(","), statusFilter, startStr, endStr],
    enabled: level === "anuncios",
    queryFn: async () => {
      let q = (supabase as any).from("ads").select(`id, name, status, external_id, campaign_id, ad_set_id, creative_url, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      if (selectedAdSets.size > 0) q = q.in("ad_set_id", Array.from(selectedAdSets));
      else if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      else return [];
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  // Alcance e frequência reais do período (query sem time_increment → exato como Gerenciador)
  const { data: periodStats = [] } = useQuery({
    queryKey: ["mc-period-stats", accountFilter, startStr, endStr],
    queryFn: async () => {
      let q = (supabase as any)
        .from("campaign_period_stats")
        .select("campaign_id, reach, impressions, frequency")
        .eq("start_date", startStr)
        .eq("end_date", endStr);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      const { data } = await q;
      return data || [];
    },
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: false,
  });

  // Timestamp do último sync (exibido na UI)
  const { data: syncConfig } = useQuery({
    queryKey: ["meta-sync-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("last_heartbeat_at").maybeSingle();
      return data;
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
      const campFilter = selectedCamps.size > 0;
      const campIds = Array.from(selectedCamps);

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
      const ageMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!ageMap[r.age_range]) ageMap[r.age_range] = { name: r.age_range, conv: 0, cost: 0, impr: 0, clicks: 0 }; ageMap[r.age_range].conv += Number(r.conversions||0); ageMap[r.age_range].cost += Number(r.spend||0); ageMap[r.age_range].impr += Number(r.impressions||0); ageMap[r.age_range].clicks += Number(r.clicks||0); });
      const ageData = Object.values(ageMap).filter((v: any) => v.name !== "unknown").map((v: any) => ({ ...v, cpl: v.conv > 0 ? v.cost/v.conv : 0, ctr: v.impr > 0 ? v.clicks/v.impr*100 : 0 })).sort((a: any, b: any) => a.name.localeCompare(b.name));
      const genderMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!genderMap[r.gender]) genderMap[r.gender] = { name: r.gender, value: 0, cost: 0 }; genderMap[r.gender].value += Number(r.conversions||0); genderMap[r.gender].cost += Number(r.spend||0); });
      const genderData = Object.values(genderMap).filter((v: any) => v.name !== "unknown").map((g: any) => ({ ...g, name: g.name === "male" ? "Masculino" : g.name === "female" ? "Feminino" : g.name, cpl: g.value > 0 ? g.cost/g.value : 0 }));
      const platMap: Record<string, any> = {};
      demoRows.forEach((r: any) => { if (!platMap[r.platform]) platMap[r.platform] = { name: r.platform, conv: 0, cost: 0, impr: 0 }; platMap[r.platform].conv += Number(r.conversions||0); platMap[r.platform].cost += Number(r.spend||0); platMap[r.platform].impr += Number(r.impressions||0); });
      const platData = Object.values(platMap).filter((v: any) => v.name !== "unknown").map((v: any) => ({ ...v, name: v.name === "facebook" ? "Facebook" : v.name === "instagram" ? "Instagram" : v.name === "audience_network" ? "Audience Net." : v.name, cpl: v.conv > 0 ? v.cost/v.conv : 0 })).sort((a: any, b: any) => b.conv - a.conv);
      const regionRows = regionRaw.data || [];
      const regionData = regionRows.map((r: any) => ({ name: r.region, conv: Number(r.conversions||0), cost: Number(r.spend||0), cpl: Number(r.conversions||0) > 0 ? Number(r.spend||0)/Number(r.conversions||0) : 0 })).sort((a: any, b: any) => b.conv - a.conv).slice(0, 10);
      const dowMap: Record<number, any> = {};
      (hourlyRaw.data || []).forEach((r: any) => { const dow = new Date(r.date).getDay(); if (!dowMap[dow]) dowMap[dow] = { day: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][dow], conv: 0, cost: 0 }; dowMap[dow].conv += Number(r.conversions||0); dowMap[dow].cost += Number(r.spend||0); });
      const dayOfWeekData = [0,1,2,3,4,5,6].map(i => dowMap[i] || { day: ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"][i], conv: 0, cost: 0 });
      const hourMap: Record<number, any> = {};
      (hourlyRaw.data || []).forEach((r: any) => { const h = Number(r.hour||0); if (!hourMap[h]) hourMap[h] = { hour: h, conv: 0, cost: 0 }; hourMap[h].conv += Number(r.conversions||0); hourMap[h].cost += Number(r.spend||0); });
      const hourlyData = Array.from({ length: 24 }, (_, i) => hourMap[i] || { hour: i, conv: 0, cost: 0 });
      const deviceRows = deviceRaw.data || [];
      const devMap: Record<string, any> = {};
      deviceRows.forEach((r: any) => { const k = r.device || "other"; if (!devMap[k]) devMap[k] = { name: k, conv: 0, cost: 0, impr: 0 }; devMap[k].conv += Number(r.conversions||0); devMap[k].cost += Number(r.spend||0); devMap[k].impr += Number(r.impressions||0); });
      const deviceData = Object.values(devMap).map((v: any) => ({ ...v, name: v.name === "mobile" ? "Mobile" : v.name === "desktop" ? "Desktop" : v.name }));
      return { ageData, genderData, platData, regionData, dayOfWeekData, hourlyData, deviceData };
    },
  });

  // ─── MUTATIONS ───────────────────────────────────────────────────────────────

  const syncMutation = useMutation({
    mutationFn: async () => {
      const payload: any = { time_range: { since: startStr, until: endStr } };
      if (accountFilter !== "all") payload.account_id = accountFilter;
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
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

  // Mantém ref atualizada para o auto-sync sem recria o interval
  autoSyncMutRef.current = syncMutation;

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

  // ─── DADOS DERIVADOS ─────────────────────────────────────────────────────────

  // Injeta alcance e frequência reais (period stats) nas campanhas — torna todas as métricas exatas
  const enrichedCampaigns = useMemo(() => {
    if (!periodStats.length) return campaigns;
    const statsMap = new Map(periodStats.map((ps: any) => [ps.campaign_id, ps]));
    return campaigns.map((c: any) => {
      const ps = statsMap.get(c.id) as any;
      if (!ps || (ps.reach as number) <= 0) return c;
      const freq = (ps.impressions as number) > 0 ? (ps.impressions as number) / (ps.reach as number) : 0;
      return { ...c, t: { ...c.t, reach: ps.reach as number, freq } };
    });
  }, [campaigns, periodStats]);

  const listData = level === "campanhas" ? enrichedCampaigns : level === "conjuntos" ? adSets : ads;
  const filtered = useMemo(() => listData.filter((c: any) => !search || c.name?.toLowerCase().includes(search.toLowerCase())), [listData, search]);

  const selSet    = level === "campanhas" ? selectedCamps  : level === "conjuntos" ? selectedAdSets  : selectedAds;
  const setSelSet = level === "campanhas" ? setSelectedCamps : level === "conjuntos" ? setSelectedAdSets : setSelectedAds;

  const allSelected  = filtered.length > 0 && filtered.every((c: any) => selSet.has(c.id));
  const someSelected = filtered.some((c: any) => selSet.has(c.id));
  const toggleAll    = useCallback(() => allSelected ? setSelSet(new Set()) : setSelSet(new Set(filtered.map((c: any) => c.id))), [allSelected, filtered, setSelSet]);
  const toggleOne    = useCallback((id: string) => { const s = new Set(selSet); s.has(id) ? s.delete(id) : s.add(id); setSelSet(s); }, [selSet, setSelSet]);

  const sel       = selSet.size > 0 ? filtered.filter((c: any) => selSet.has(c.id)) : filtered;
  const totCost   = sel.reduce((s: number, c: any) => s + c.t.cost, 0);
  const totConv   = sel.reduce((s: number, c: any) => s + c.t.conversions, 0);
  const totImpr   = sel.reduce((s: number, c: any) => s + c.t.impressions, 0);
  const totReach  = sel.reduce((s: number, c: any) => s + c.t.reach, 0);
  const totClicks = sel.reduce((s: number, c: any) => s + c.t.clicks, 0);
  const avgCpl    = totConv > 0 ? totCost / totConv : 0;
  const avgCtr    = totImpr > 0 ? (totClicks / totImpr) * 100 : 0;
  const avgCpm    = totImpr > 0 ? (totCost  / totImpr) * 1000 : 0;

  const maxCplThreshold = useMemo(() => {
    if (accountFilter === "all") return null;
    const t = alertThresholds.find((t: any) => t.ad_account_id === accountFilter);
    return t?.max_cpl ?? null;
  }, [alertThresholds, accountFilter]);

  const insights = useMemo(() => gerarInsights(enrichedCampaigns, totCost, totConv, avgCpl, avgCtr, avgCpm), [enrichedCampaigns, totCost, totConv, avgCpl, avgCtr, avgCpm]);

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

  // ─── EARLY RETURNS ────────────────────────────────────────────────────────────

  if (authLoading || profileLoading) return null;

  if (!hasAccess) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center"><Lock className="h-7 w-7 text-destructive"/></div>
      <div><h2 className="text-2xl font-black tracking-tight mb-2">Acesso Restrito</h2><p className="text-muted-foreground text-sm max-w-xs">Solicite ao administrador o acesso às Métricas.</p></div>
      <button onClick={() => navigate({ to: "/dashboard" })} className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition">Voltar ao Dashboard</button>
    </div>
  );

  // ─── KPI BAR ──────────────────────────────────────────────────────────────────

  const kpiItems = [
    { label: "Gasto",      value: `R$ ${fmtBRL(totCost)}`,                                   color: "text-primary",              icon: DollarSign },
    { label: "Resultados", value: fmtN(totConv),                                             color: "text-violet-400",           icon: Target },
    { label: "CPL / CPA",  value: avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—",              color: "text-primary",              icon: Zap },
    { label: "Impressões", value: fmtN(totImpr),                                             color: "text-muted-foreground",     icon: Eye },
    { label: "Alcance",    value: totReach > 0 ? fmtN(totReach) : "—",                       color: "text-muted-foreground",     icon: Users },
    { label: "Cliques",    value: fmtN(totClicks),                                           color: "text-muted-foreground",     icon: MousePointer2 },
    { label: "CTR Médio",  value: `${avgCtr.toFixed(2)}%`,                                   color: avgCtr >= 1.5 ? "text-green-400" : "text-muted-foreground", icon: TrendingUp },
    { label: "CPM Médio",  value: avgCpm > 0 ? `R$ ${avgCpm.toFixed(2)}` : "—",              color: "text-muted-foreground",     icon: BarChart3 },
  ];

  // ─── RENDER ───────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-24">

      {/* ═══ STICKY HEADER ══════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl pt-2 pb-0 space-y-2">

        {/* KPI Bar */}
        <motion.div
          className="flex items-stretch overflow-x-auto rounded-xl border border-white/[0.09] bg-white/[0.03] backdrop-blur-sm divide-x divide-white/[0.07] scrollbar-hide"
          animate={{ opacity: 1 }} initial={{ opacity: 0 }}
        >
          {kpiItems.map(k => (
            <div key={k.label} className={`flex flex-shrink-0 overflow-hidden transition-all duration-300 ${scrolled ? "px-3 py-1.5" : "px-4 py-2.5"}`}>
              {scrolled ? (
                <div className="flex items-center gap-1.5">
                  <k.icon className={`h-3 w-3 flex-shrink-0 ${k.color}`} />
                  <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/50 whitespace-nowrap">{k.label}</span>
                  <span className={`font-mono font-black text-[11px] whitespace-nowrap ${k.color}`}>{k.value}</span>
                </div>
              ) : (
                <div className="flex flex-col justify-center gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/60 whitespace-nowrap">{k.label}</span>
                    <k.icon className={`h-3 w-3 flex-shrink-0 ${k.color}`} />
                  </div>
                  <span className={`font-mono font-black text-[13px] whitespace-nowrap ${k.color}`}>{k.value}</span>
                </div>
              )}
            </div>
          ))}
        </motion.div>

        {/* Controles: View + Filtros */}
        <div className="flex flex-wrap items-center gap-2 pb-1">
          {/* View switcher */}
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.02] p-0.5">
            {([
              { id: "gestao",       label: "Gestão",      icon: LayoutGrid },
              { id: "analise",      label: "Análise",     icon: BarChart2 },
              { id: "demograficos", label: "Demográficos",icon: Users },
            ] as const).map(v => (
              <button key={v.id} onClick={() => setView(v.id)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-wider transition-all ${view === v.id ? "bg-primary text-primary-foreground shadow-glow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <v.icon className="h-3 w-3 shrink-0" />
                <span className="hidden sm:inline">{v.label}</span>
              </button>
            ))}
          </div>

          {/* Conta */}
          <div className="relative shrink-0">
            <Layers className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)} className="appearance-none rounded-xl border border-white/10 bg-background/40 py-1.5 pl-7 pr-6 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
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
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-3 py-1.5 pr-7 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
                <option value="all"    className="bg-background text-foreground">Todos</option>
                <option value="active" className="bg-background text-foreground">Ativos</option>
                <option value="paused" className="bg-background text-foreground">Pausados</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            </div>
          )}

          {/* Search */}
          {view === "gestao" && (
            <div className="relative flex-1 min-w-[140px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-white/10 bg-background/40 py-1.5 pl-8 pr-3 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
            </div>
          )}

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
              <button onClick={runAudit} disabled={isAuditing} className="flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-1.5 text-[11px] font-bold text-orange-400 hover:bg-orange-400/20 transition-all disabled:opacity-50">
                {isAuditing ? <Loader2 className="h-3 w-3 animate-spin"/> : <FlaskConical className="h-3 w-3"/>}
                <span className="hidden sm:inline">Diagnóstico</span>
              </button>
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
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} title="Sincronizar dados com Meta Ads" className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all disabled:opacity-50">
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

      {/* ═══ CONTEÚDO ═══════════════════════════════════════════════════════════ */}
      <div className="pt-4 space-y-5">
        <AnimatePresence mode="wait">

          {/* ──────────────────────────── GESTÃO ────────────────────────────── */}
          {view === "gestao" && (
            <motion.div key="gestao" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

              {/* Sem seleção de nível superior */}
              {((level === "conjuntos" && selectedCamps.size === 0) || (level === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0)) && (
                <div className="glass-panel flex flex-col items-center justify-center gap-5 py-28 text-center border border-dashed border-white/10">
                  <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">{level === "conjuntos" ? <LayoutGrid className="h-8 w-8 text-muted-foreground"/> : <ImageIcon className="h-8 w-8 text-muted-foreground"/>}</div>
                  <div><h3 className="header-sport text-lg font-bold uppercase tracking-tight mb-2">Selecione o nível superior</h3><p className="text-sm text-muted-foreground max-w-md mx-auto">Para ver {level}, marque o checkbox dos itens na aba anterior.</p></div>
                </div>
              )}

              {/* Tabela */}
              {!((level === "conjuntos" && selectedCamps.size === 0) || (level === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0)) && (
                <div className="glass-panel card-sport overflow-hidden">

                  {/* Barra de seleção */}
                  {selSet.size > 0 && (
                    <div className="border-b border-white/5 bg-primary/5 px-4 py-2.5 flex items-center gap-4 overflow-x-auto scrollbar-hide text-xs">
                      <span className="shrink-0 font-black text-primary uppercase tracking-widest text-[11px]">{selSet.size} selecionado{selSet.size>1?"s":""}</span>
                      <span className="shrink-0 text-muted-foreground">Gasto <strong className="text-foreground font-mono">R$ {fmtBRL(totCost)}</strong></span>
                      <span className="shrink-0"><strong className="text-violet-400 font-mono">{totConv}</strong> <span className="text-muted-foreground">resultados</span></span>
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
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <colgroup>
                          <col className="w-10"/>
                          <col className="w-16"/>
                          <col className="min-w-[180px]"/>
                          {level === "campanhas" && <col className="w-24"/>}
                          <col className="w-28 hidden md:table-column"/>
                          <col className="w-16"/>
                          <col className="w-24 hidden lg:table-column"/>
                          <col className="w-24 hidden xl:table-column"/>
                          <col className="w-20"/>
                          <col className="w-24"/>
                          <col className="w-16 hidden lg:table-column"/>
                          <col className="w-20 hidden xl:table-column"/>
                          <col className="w-20 hidden xl:table-column"/>
                          <col className="w-24"/>
                        </colgroup>
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
                            <th className="px-4 py-3 w-20 text-right text-[9px] font-black uppercase tracking-widest text-violet-400/90 whitespace-nowrap">Resultados</th>
                            <th className="px-4 py-3 w-24 text-right text-[9px] font-black uppercase tracking-widest text-emerald-400/90 whitespace-nowrap">CPL / CPA</th>
                            <th className="px-4 py-3 w-16 text-right text-[9px] font-black uppercase tracking-widest text-blue-400/80 whitespace-nowrap hidden lg:table-cell">CTR</th>
                            <th className="px-4 py-3 w-20 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden xl:table-cell">CPC</th>
                            <th className="px-4 py-3 w-20 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/70 whitespace-nowrap hidden xl:table-cell">CPM</th>
                            <th className="px-4 py-3 w-24 text-right text-[9px] font-black uppercase tracking-widest text-primary/80 whitespace-nowrap">Gasto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((c: any) => {
                            const isActive   = c.status?.toUpperCase() === "ACTIVE";
                            const isLearning = c.delivery_status === "LEARNING";
                            const isChanging = changingId === c.id;
                            const isSel      = selSet.has(c.id);
                            const isHighlight= searchParams.campaign === c.id;
                            const cplOver    = maxCplThreshold && c.t.cpl > 0 && c.t.cpl > maxCplThreshold;
                            const freqHigh   = c.t.freq >= 3;
                            const ctrGood    = c.t.ctr >= 2;
                            return (
                              <tr id={`row-${c.id}`} key={c.id} className={`border-b border-white/[0.03] transition-colors ${isHighlight ? "bg-destructive/10 ring-1 ring-inset ring-destructive/40" : isSel ? "bg-primary/5" : "hover:bg-white/[0.015]"}`}>
                                {/* checkbox */}
                                <td className="px-3 py-3 text-center">
                                  <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">{isSel ? <CheckSquare className="h-4 w-4 text-primary"/> : <Square className="h-4 w-4"/>}</button>
                                </td>
                                {/* status toggle */}
                                <td className="px-2 py-2.5 text-center">
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
                                <td className="px-4 py-2.5">
                                  <div className="flex flex-col gap-0.5 min-w-0">
                                    <span className="font-bold text-foreground truncate max-w-[240px] leading-tight" title={c.name}>{c.name}</span>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {isLearning && <LearningBadge/>}
                                      {c.ad_account && <span className="text-[9px] text-muted-foreground/40 font-mono leading-none">{(c.ad_account as any).name}</span>}
                                    </div>
                                  </div>
                                </td>
                                {/* objetivo */}
                                {level === "campanhas" && <td className="px-3 py-2.5 text-center"><ObjectiveBadge objective={c.objective}/></td>}
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
                                  <span className="font-mono font-black text-violet-400">{c.t.conversions > 0 ? fmtN(c.t.conversions) : <span className="text-muted-foreground/30">—</span>}</span>
                                </td>
                                {/* cpl */}
                                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                                  {c.t.cpl > 0 ? (
                                    <span className={`font-mono font-black text-xs ${cplOver ? "text-red-400" : "text-green-400"}`}>R$ {c.t.cpl.toFixed(2)}</span>
                                  ) : <span className="text-muted-foreground/30 font-mono">—</span>}
                                </td>
                                {/* ctr */}
                                <td className="px-4 py-2.5 text-right hidden lg:table-cell whitespace-nowrap">
                                  <span className={`font-mono font-bold text-xs ${ctrGood ? "text-green-400" : c.t.ctr > 0 ? "text-blue-400" : "text-muted-foreground/30"}`}>{c.t.ctr > 0 ? `${c.t.ctr.toFixed(2)}%` : "—"}</span>
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
                            <td className="px-4 py-3 text-right font-mono font-black text-violet-400 text-xs whitespace-nowrap">{totConv > 0 ? fmtN(totConv) : "—"}</td>
                            {/* cpl — always */}
                            <td className="px-4 py-3 text-right font-mono font-black text-green-400 text-xs whitespace-nowrap">{avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—"}</td>
                            {/* ctr — hidden lg */}
                            <td className="px-4 py-3 text-right font-mono font-black text-blue-400 text-xs hidden lg:table-cell whitespace-nowrap">{avgCtr > 0 ? `${avgCtr.toFixed(2)}%` : "—"}</td>
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
                  )}
                </div>
              )}

              {/* Diagnóstico */}
              {auditData && auditData.length > 0 && (
                <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden">
                  <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
                    <FlaskConical className="h-4 w-4 text-orange-400"/>
                    <p className="text-xs font-black uppercase tracking-widest header-sport">Diagnóstico Meta</p>
                    <button onClick={() => setAuditData(null)} className="ml-auto text-muted-foreground/50 hover:text-foreground transition"><span className="text-[10px]">×</span></button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-white/5 bg-white/[0.02]"><th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Campanha</th><th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Objetivo</th><th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">App Conv.</th><th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Total Conv.</th></tr></thead>
                      <tbody>
                        {auditData.map((a: any, i: number) => (
                          <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                            <td className="px-4 py-3 font-semibold max-w-[240px] truncate">{a.campaign_name || a.name}</td>
                            <td className="px-4 py-3 text-center"><ObjectiveBadge objective={a.objective}/></td>
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
                      <tbody>
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

          {/* ──────────────────────────── ANÁLISE ───────────────────────────── */}
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

                  {/* Guia de Interpretação de Métricas */}
                  {modoExplicativo && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="glass-panel p-5 border-l-4 border-l-primary bg-gradient-to-r from-primary/5 via-indigo-500/5 to-transparent rounded-xl space-y-3 relative overflow-hidden"
                    >
                      <div className="absolute right-4 top-4 text-primary/10 pointer-events-none">
                        <Sparkles className="h-20 w-20 animate-pulse" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary animate-spin" style={{ animationDuration: '3s' }} />
                        <h4 className="text-xs font-black uppercase tracking-widest text-foreground">Guia de Interpretação de Métricas</h4>
                        <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold uppercase">Didático & Profissional</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-4xl">
                        Este painel foi desenhado para atender tanto ao especialista que toma decisões estratégicas quanto ao cliente ou leigo que deseja aprender o real significado das métricas de tráfego. Veja abaixo um resumo simples de cada conceito analisado nos gráficos:
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                        {[
                          { t: "Gasto (Investimento)", d: "Valor financeiro total alocado nas campanhas. Indica o custo total operacional no período.", e: "💸" },
                          { t: "Conversões (Resultados)", d: "Total de ações de sucesso obtidas (leads cadastrados, vendas ou conversas iniciadas).", e: "🏆" },
                          { t: "CPL (Custo por Resultado)", d: "Valor médio investido para gerar cada conversão única. Mede a eficiência do seu dinheiro.", e: "🎯" },
                          { t: "CTR (Taxa de Cliques)", d: "Relação entre cliques e visualizações. Mede o interesse pelo criativo. Ideal acima de 1.5%.", e: "👀" },
                          { t: "Frequência (Repetição)", d: "Número médio de vezes que a mesma pessoa viu o anúncio. Evite que ultrapasse 3.0 para não cansar o público.", e: "🔔" },
                          { t: "Alcance vs Impressões", d: "Alcance são pessoas únicas atingidas; Impressões é o número total de exibições acumuladas.", e: "🌍" },
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
                                      <p className="text-[10px] font-bold">→ {ins.acao}</p>
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
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                      {/* Tendência 14 dias — sempre */}
                      <div className="lg:col-span-2">
                        <ChartCard 
                          icon={<TrendingUp className="h-4 w-4 text-primary"/>} 
                          title="Tendência de Performance" 
                          badge={`Últimos ${Math.min(trendData.length, 14)} dias`} 
                          context="Gasto diário vs conversões — identifique os dias de melhor custo-benefício."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A linha de investimento diário (azul) cruzada com o volume absoluto de conversões diárias (barras roxas).",
                            decisao: "Analise a inclinação da linha vs a altura das barras. Picos de conversão com baixo gasto indicam momentos de alta eficiência comercial, ideais para entender quais criativos ou públicos estavam ativos naquele dia."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={220}>
                            <ComposedChart data={trendData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                              <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={45}/>
                              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={35}/>
                              <Tooltip content={<CustomTooltip/>}/>
                              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }}/>
                              <Area yAxisId="left" type="monotone" dataKey="gasto" name="Gasto (R$)" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2}/>
                              <Bar yAxisId="right" dataKey="conversoes" name="Conversões" fill="#8b5cf6" opacity={0.8} radius={[3,3,0,0]}/>
                            </ComposedChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      </div>

                      {/* Pie Status — geral, audiencia */}
                      {(modo === "geral" || modo === "audiencia") && (
                        <ChartCard 
                          icon={<PieIcon className="h-4 w-4 text-violet-400"/>} 
                          title="Status das Campanhas" 
                          context="Proporção ativas vs pausadas — equilíbrio saudável é ter mais ativas do que pausadas."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A proporção numérica e percentual entre as campanhas em execução ativa e as campanhas em pausa.",
                            decisao: "Garanta que seu portfólio ativo esteja alinhado com sua capacidade operacional. Excesso de campanhas pausadas indica retrabalho de testes ou problemas passados de custo por resultado."
                          }}
                        >
                          <div className="flex items-center gap-5">
                            <ResponsiveContainer width="60%" height={180}>
                              <RechartsPieChart>
                                <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4} dataKey="value">
                                  {pieData.map((e, i) => <Cell key={i} fill={e.color}/>)}
                                </Pie>
                                <Tooltip content={<CustomTooltip/>}/>
                              </RechartsPieChart>
                            </ResponsiveContainer>
                            <div className="space-y-3">
                              {pieData.map((e, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ background: e.color }}/>
                                  <div>
                                    <p className="text-[11px] font-bold">{e.value} {e.name}</p>
                                    <p className="text-[9px] text-muted-foreground/60">{campaigns.length > 0 ? Math.round((e.value/campaigns.length)*100) : 0}%</p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </ChartCard>
                      )}

                      {/* Scatter CPL — geral, eficiencia */}
                      {(modo === "geral" || modo === "eficiencia") && scatterData.length > 0 && (
                        <ChartCard 
                          icon={<Activity className="h-4 w-4 text-orange-400"/>} 
                          title="CPL × Investimento" 
                          context="Campanhas no canto inferior direito são as mais eficientes: muito gasto, CPL baixo."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A distribuição espacial correlacionando o investimento financeiro acumulado (eixo X) e o CPL individual (eixo Y).",
                            decisao: "Os anúncios de melhor performance estão no canto inferior direito (alto investimento com custo por lead muito baixo). Campanhas no canto superior esquerdo estão desperdiçando verba a um custo insustentável."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={200}>
                            <ScatterChart>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                              <XAxis type="number" dataKey="x" name="Gasto R$" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                              <YAxis type="number" dataKey="y" name="CPL R$"  tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} width={45}/>
                              <ZAxis dataKey="z" range={[40, 400]}/>
                              {avgCpl > 0 && <ReferenceLine y={avgCpl} stroke="rgba(239,68,68,0.5)" strokeDasharray="4 4" label={{ value: `Média: R$${avgCpl.toFixed(0)}`, fill: "rgba(239,68,68,0.7)", fontSize: 9 }}/>}
                              <Tooltip cursor={{ strokeDasharray: "3 3" }} content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0]?.payload; return <div className="rounded-xl border border-white/10 bg-background/95 px-3 py-2 text-[10px] shadow-xl"><p className="font-black text-foreground mb-1">{d.name?.substring(0,30)}</p><p className="text-primary">Gasto: R$ {fmtBRL(d.x)}</p><p className="text-orange-400">CPL: R$ {d.y}</p><p className="text-violet-400">{d.z} conv.</p></div>; }}/>
                              <Scatter data={scatterData} fill="#f59e0b" opacity={0.8}/>
                            </ScatterChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      )}

                      {/* Gasto por campanha — eficiencia, budget, comparativo */}
                      {(modo === "eficiencia" || modo === "budget" || modo === "comparativo") && barData.length > 0 && (
                        <ChartCard 
                          icon={<BarChart3 className="h-4 w-4 text-green-400"/>} 
                          title="Gasto vs Resultados" 
                          badge="Top 10" 
                          context="Redistribua budget das campanhas com alto gasto mas poucas conversões para as que convertem mais."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "O consumo direto de orçamento das 10 principais campanhas em relação às conversões entregues.",
                            decisao: "Altere a alocação de orçamento: retire recursos de campanhas com alto consumo financeiro e baixas conversões, concentrando capital nas campanhas que lideram os resultados efetivos."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={barData} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false}/>
                              <XAxis type="number" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }} axisLine={false} tickLine={false} width={110}/>
                              <Tooltip content={<CustomTooltip/>}/>
                              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }}/>
                              <Bar dataKey="gasto" name="Gasto (R$)" fill="#6366f1" radius={[0,3,3,0]} opacity={0.85}/>
                              <Bar dataKey="conversoes" name="Conversões" fill="#8b5cf6" radius={[0,3,3,0]} opacity={0.85}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      )}

                      {/* Radar KPIs — geral, audiencia */}
                      {(modo === "geral" || modo === "audiencia") && radarData.length > 0 && (
                        <ChartCard 
                          icon={<Eye className="h-4 w-4 text-cyan-400"/>} 
                          title="Radar de KPIs" 
                          context="Score de 0 a 100 para cada dimensão. Quanto mais preenchido, mais saudável a conta."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A performance geral da conta normalizada em score de 0 a 100 em 6 dimensões cruciais do tráfego.",
                            decisao: "Busque um desenho equilibrado e amplo. Um radar encolhido em um ponto específico (ex: CTR baixo) aponta o diagnóstico exato (neste caso, a necessidade urgente de melhorar o apelo visual do anúncio)."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={200}>
                            <RadarChart data={radarData}>
                              <PolarGrid stroke="rgba(255,255,255,0.1)"/>
                              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.5)" }}/>
                              <Radar name="Score" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2}/>
                            </RadarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      )}

                      {/* Ranking Comparativo — comparativo */}
                      {modo === "comparativo" && comparData.length > 0 && (
                        <ChartCard 
                          icon={<BarChart2 className="h-4 w-4 text-blue-400"/>} 
                          title="Ranking Comparativo" 
                          badge="Score 0–100" 
                          context="Score relativo — 100 = melhor campanha naquela métrica. Use para ver quem lidera cada dimensão."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A performance relativa de cada campanha com pontuação comparada (onde 100 representa a melhor campanha).",
                            decisao: "Ideal para detectar qual campanha é líder absoluta de cliques (CTR) e qual lidera em eficiência de custos (CPL), permitindo isolar as melhores táticas."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={comparData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                              <XAxis dataKey="name" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false}/>
                              <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }} axisLine={false} tickLine={false} domain={[0,100]}/>
                              <Tooltip content={<CustomTooltip/>}/>
                              <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }}/>
                              <Bar dataKey="ctr" name="CTR Score" fill="#3b82f6" radius={[3,3,0,0]} opacity={0.85}/>
                              <Bar dataKey="cpl" name="CPL Score" fill="#10b981" radius={[3,3,0,0]} opacity={0.85}/>
                              <Bar dataKey="freq" name="Freq. Score" fill="#f59e0b" radius={[3,3,0,0]} opacity={0.85}/>
                            </BarChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      )}

                      {/* Pie share de gasto — budget, comparativo */}
                      {(modo === "budget" || modo === "comparativo") && barData.length > 0 && (
                        <ChartCard 
                          icon={<PieIcon className="h-4 w-4 text-green-400"/>} 
                          title="Share de Gasto" 
                          context="Concentração de budget — se uma campanha tiver > 60% do gasto, vale revisar."
                          modoExplicativo={modoExplicativo}
                          didaticInfo={{
                            analise: "A concentração percentual do orçamento total gasto entre as suas principais campanhas.",
                            decisao: "Evite a dependência extrema. Se uma única campanha consome mais de 60% da sua verba, a saúde do seu negócio está vulnerável a instabilidades temporárias do leilão ou bloqueios de conta."
                          }}
                        >
                          <ResponsiveContainer width="100%" height={200}>
                            <RechartsPieChart>
                              <Pie data={budgetData.map((d: any,i: number) => ({ ...d, color: CHART_COLORS[i % CHART_COLORS.length] }))} cx="50%" cy="50%" outerRadius={80} dataKey="gasto" nameKey="name" label={({ name, percent }: any) => `${name}: ${(percent*100).toFixed(0)}%`} labelLine={false}>
                                {budgetData.map((d: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]}/>)}
                              </Pie>
                              <Tooltip content={<CustomTooltip/>}/>
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </ChartCard>
                      )}

                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ──────────────────────────── DEMOGRÁFICOS ──────────────────────── */}
          {view === "demograficos" && (
            <motion.div key="demo" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">
              {loadingBreakdowns ? (
                <div className="flex flex-col items-center gap-3 py-24">
                  <Loader2 className="h-8 w-8 animate-spin text-primary"/>
                  <p className="text-sm text-muted-foreground">Carregando dados demográficos...</p>
                </div>
              ) : !breakdowns ? (
                <div className="glass-panel py-20 text-center space-y-3">
                  <Users className="h-10 w-10 text-muted-foreground/30 mx-auto"/>
                  <p className="text-sm text-muted-foreground">Nenhum dado demográfico disponível para o período selecionado.</p>
                  <p className="text-xs text-muted-foreground/60">Sincronize os dados e aguarde a coleta de breakdowns.</p>
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
                            { t: "Faixa Etária", d: "Identifica grupos etários mais eficientes. Exclua faixas caras e intensifique nas faixas de menor CPL.", e: "🎂" },
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

                  {/* Heatmap Horário */}
                  {breakdowns.hourlyData.length > 0 && (
                    <div className="lg:col-span-2">
                      <ChartCard icon={<Zap className="h-4 w-4 text-yellow-400"/>} title="Conversões por Hora do Dia" context="Horários de pico de conversão — programe seus anúncios para entregar mais nessas janelas." modoExplicativo={modoExplicativo} didaticInfo={{ analise: "A distribuição horária das conversões ao longo das 24 horas, identificando as janelas de máximo engajamento e receptividade do público.", decisao: "Ative o agendamento de anúncios no Gerenciador de Anúncios do Meta para intensificar a entrega nas 3–4 horas de maior pico. Reduza o bid ou pause nos horários de madrugada com zero resultado para otimizar o orçamento diário." }}>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={breakdowns.hourlyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)"/>
                            <XAxis dataKey="hour" tick={{ fontSize: 8, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${v}h`}/>
                            <YAxis tick={{ fontSize: 8, fill: "rgba(255,255,255,0.35)" }} axisLine={false} tickLine={false} width={25}/>
                            <Tooltip content={<CustomTooltip/>}/>
                            <Bar dataKey="conv" name="Conversões" fill="#eab308" radius={[2,2,0,0]} opacity={0.85}/>
                          </BarChart>
                        </ResponsiveContainer>
                      </ChartCard>
                    </div>
                  )}

                </div>
                </>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}
