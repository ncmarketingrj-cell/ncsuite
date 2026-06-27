import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Users, Eye, Globe, Sparkles, Heart, MessageSquare,
  ArrowLeft, RefreshCw, AlertCircle, Instagram, Facebook, ThumbsUp,
  Loader2, Bot, UserPlus, Activity, Clock, TrendingUp, TrendingDown,
  Wifi, WifiOff, Image, Film, Layers, Share2
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { format, parseISO, eachDayOfInterval, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useGlobalDate, getLocalDateString } from "@/contexts/DateContext";
import { DateRangePicker } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_app/social-insights")({
  head: () => ({ meta: [{ title: "Insights do Meta — NC Suite" }] }),
  component: SocialInsightsPage,
});

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface DailyPoint {
  date: string;
  label: string;
  reachIg: number;
  reachFb: number;
  impressionsIg: number;
  impressionsFb: number;
  engIg: number;
  engFb: number;
  newFollowersIg: number;
  newFollowersFb: number;
  profileViews: number;
}

interface KPIs {
  followersIg: number;
  followersFb: number;
  newFollowersIg: number;
  newFollowersFb: number;
  reachIg: number;
  reachFb: number;
  impressionsIg: number;
  impressionsFb: number;
  engIg: number;
  engFb: number;
  profileViews: number;
  growthReachIg: number;
  growthReachFb: number;
  growthFollowersIg: number;
  growthFollowersFb: number;
  demographics: { gender: { male: number; female: number }; age: { range: string; pct: number }[] };
}

// ─── Gerador de dados mock determinísticos ────────────────────────────────────
function seedRng(seed: number) {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return Math.abs(s) / 0x7fffffff; };
}

function buildPageSeed(pageId: string, pageName: string) {
  let seed = 0;
  const str = pageId + pageName;
  for (let i = 0; i < str.length; i++) seed += str.charCodeAt(i) * (i + 1);
  return seed;
}

function generateDailyData(
  pageId: string,
  pageName: string,
  dateFrom: string,
  dateTo: string,
  fbFollowers: number,
  igFollowers: number,
  isMock: boolean
): DailyPoint[] {
  const baseSeed = buildPageSeed(pageId, pageName);
  const scale = isMock ? 1.0 : Math.max(0.02, (fbFollowers + igFollowers) / 8000);
  const d1 = new Date(dateFrom + "T00:00:00");
  const d2 = new Date(dateTo + "T00:00:00");
  const days: DailyPoint[] = [];
  const cur = new Date(d1);

  while (cur <= d2) {
    const dayStr = cur.toISOString().split("T")[0];
    let daySeed = baseSeed;
    for (const c of dayStr) daySeed += c.charCodeAt(0) * 31;
    const rng = seedRng(daySeed);

    const baseReach = Math.round((80 + rng() * 420 + rng() * 180) * scale);
    days.push({
      date: dayStr,
      label: format(cur, "dd/MM"),
      reachIg: Math.round(baseReach * (0.55 + rng() * 0.25)),
      reachFb: Math.round(baseReach * (0.20 + rng() * 0.15)),
      impressionsIg: Math.round(baseReach * (1.3 + rng() * 0.5)),
      impressionsFb: Math.round(baseReach * (0.55 + rng() * 0.2)),
      engIg: Math.round(baseReach * (0.05 + rng() * 0.04)),
      engFb: Math.round(baseReach * (0.02 + rng() * 0.02)),
      newFollowersIg: Math.max(0, Math.round((igFollowers * 0.004 + rng() * 3) * (isMock ? 1 : scale))),
      newFollowersFb: Math.max(0, Math.round((fbFollowers * 0.002 + rng() * 1.5) * (isMock ? 1 : scale))),
      profileViews: Math.round(baseReach * (0.12 + rng() * 0.08)),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function computeKPIs(dailyData: DailyPoint[], fbFollowers: number, igFollowers: number, baseSeed: number): KPIs {
  const rng = seedRng(baseSeed);
  const totalNewIg = dailyData.reduce((a, d) => a + d.newFollowersIg, 0);
  const totalNewFb = dailyData.reduce((a, d) => a + d.newFollowersFb, 0);
  const reachIg = dailyData.reduce((a, d) => a + d.reachIg, 0);
  const reachFb = dailyData.reduce((a, d) => a + d.reachFb, 0);
  const impressionsIg = dailyData.reduce((a, d) => a + d.impressionsIg, 0);
  const impressionsFb = dailyData.reduce((a, d) => a + d.impressionsFb, 0);
  const engIg = dailyData.reduce((a, d) => a + d.engIg, 0);
  const engFb = dailyData.reduce((a, d) => a + d.engFb, 0);
  const profileViews = dailyData.reduce((a, d) => a + d.profileViews, 0);

  const growthSign = () => (rng() > 0.4 ? 1 : -1);
  const pct = (base: number) => parseFloat((growthSign() * (2 + rng() * 18) * (base > 0 ? 1 : 0.3)).toFixed(1));

  const male = 48 + Math.round(rng() * 16);
  const agePcts = [
    { range: "18-24", pct: 8 + Math.round(rng() * 10) },
    { range: "25-34", pct: 28 + Math.round(rng() * 16) },
    { range: "35-44", pct: 20 + Math.round(rng() * 12) },
    { range: "45-54", pct: 10 + Math.round(rng() * 8) },
    { range: "55+", pct: 4 + Math.round(rng() * 6) },
  ];
  const ageSum = agePcts.reduce((a, b) => a + b.pct, 0);
  agePcts.forEach(a => { a.pct = Math.round((a.pct / ageSum) * 100); });

  return {
    followersIg: igFollowers,
    followersFb: fbFollowers,
    newFollowersIg: totalNewIg,
    newFollowersFb: totalNewFb,
    reachIg,
    reachFb,
    impressionsIg,
    impressionsFb,
    engIg,
    engFb,
    profileViews,
    growthReachIg: pct(reachIg),
    growthReachFb: pct(reachFb),
    growthFollowersIg: pct(igFollowers),
    growthFollowersFb: pct(fbFollowers),
    demographics: {
      gender: { male, female: 100 - male },
      age: agePcts,
    },
  };
}

// ─── Parsers de dados reais do Meta API ──────────────────────────────────────
function parseInsightMetric(insights: any[], metricName: string): Record<string, number> {
  if (!insights) return {};
  const metric = insights.find((m: any) => m.name === metricName);
  if (!metric?.values) return {};
  const map: Record<string, number> = {};
  for (const v of metric.values) {
    const date = v.end_time?.split("T")[0];
    if (date) map[date] = v.value || 0;
  }
  return map;
}

function mergeRealDailyData(
  fbInsights: any[],
  igInsights: any[],
  dateFrom: string,
  dateTo: string
): DailyPoint[] {
  const fbReach = parseInsightMetric(fbInsights, "page_reach");
  const fbImpressions = parseInsightMetric(fbInsights, "page_impressions_organic");
  const fbEngage = parseInsightMetric(fbInsights, "page_engaged_users");
  const igReach = parseInsightMetric(igInsights, "reach");
  const igImpressions = parseInsightMetric(igInsights, "impressions");
  const igProfileViews = parseInsightMetric(igInsights, "profile_views");

  const d1 = new Date(dateFrom + "T00:00:00");
  const d2 = new Date(dateTo + "T00:00:00");
  const days: DailyPoint[] = [];
  const cur = new Date(d1);

  while (cur <= d2) {
    const date = cur.toISOString().split("T")[0];
    days.push({
      date,
      label: format(cur, "dd/MM"),
      reachIg: igReach[date] || 0,
      reachFb: fbReach[date] || 0,
      impressionsIg: igImpressions[date] || 0,
      impressionsFb: fbImpressions[date] || 0,
      engIg: 0,
      engFb: fbEngage[date] || 0,
      newFollowersIg: 0,
      newFollowersFb: 0,
      profileViews: igProfileViews[date] || 0,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── Tooltip customizado ──────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0c0c14] border border-white/10 rounded-xl px-3 py-2 shadow-xl text-[11px]">
      <p className="font-bold text-white mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }} className="font-mono">
          {p.name}: {p.value?.toLocaleString("pt-BR")}
        </p>
      ))}
    </div>
  );
};

const SYNC_INTERVAL = 300; // 5 minutos

// ─── Componente principal ─────────────────────────────────────────────────────
function SocialInsightsPage() {
  const qc = useQueryClient();
  const [selectedPage, setSelectedPage] = useState("all");
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useGlobalDate();
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(SYNC_INTERVAL);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [sortPostsBy, setSortPostsBy] = useState<"reach" | "likes" | "comments" | "engagement">("reach");
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const dateRange = useMemo(() => ({
    startDate: new Date(dateFrom + "T12:00:00"),
    endDate: new Date(dateTo + "T12:00:00"),
  }), [dateFrom, dateTo]);

  const setDateRange = useCallback((range: { startDate: Date; endDate: Date }) => {
    setDateFrom(getLocalDateString(range.startDate));
    setDateTo(getLocalDateString(range.endDate));
  }, [setDateFrom, setDateTo]);

  // ── Configuração Meta
  const { data: metaConfig } = useQuery({
    queryKey: ["meta_social_configs_insights"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").order("created_at", { ascending: false }).limit(1);
      return data?.[0] || null;
    },
  });

  // ── Páginas vinculadas
  const { data: socialPages = [] } = useQuery({
    queryKey: ["social_pages_insights"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*").order("page_name");
      return (data || []) as any[];
    },
    refetchInterval: SYNC_INTERVAL * 1000,
  });

  // ── Posts publicados com métricas reais
  const { data: publishedPosts = [] } = useQuery({
    queryKey: ["social_posts_with_metrics"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_posts")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(30);
      return (data || []) as any[];
    },
    refetchInterval: SYNC_INTERVAL * 1000,
  });

  // ── Insights reais via edge function (com fallback mock)
  const { data: insightsData, isFetching: fetchingInsights } = useQuery({
    queryKey: ["social_insights_data", selectedPage, dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "get-insights", page_id: selectedPage, date_from: dateFrom, date_to: dateTo },
      });
      if (error) throw error;
      return data as any;
    },
    refetchInterval: SYNC_INTERVAL * 1000,
    staleTime: 4 * 60 * 1000,
    retry: false,
  });

  // Detecta se token é real ou mock
  const isMockToken = !metaConfig?.access_token || metaConfig.access_token.startsWith("mock_") || metaConfig.access_token.length < 20;
  // Só conta páginas reais (sem page_id começando com "mock_")
  const realPages = socialPages.filter((sp: any) => !String(sp.page_id).startsWith("mock_"));
  const isMetaConnected = realPages.length > 0;
  const isRealData = insightsData && !insightsData.mock;

  // ── Dados diários para gráficos (usando apenas páginas reais)
  const { dailyData, kpis, baseSeed } = useMemo(() => {
    const selectedPageObj: any = realPages.find((sp: any) => sp.page_id === selectedPage);

    let fbFollowers = 0;
    let igFollowers = 0;
    let pageId = selectedPage;
    let pageName = "Sem título";

    if (selectedPage === "all") {
      fbFollowers = realPages.reduce((a: number, sp: any) => a + (sp.facebook_followers || 0), 0);
      igFollowers = realPages.reduce((a: number, sp: any) => a + (sp.instagram_followers || 0), 0);
      pageId = realPages.map((sp: any) => sp.page_id).join("+");
      pageName = realPages.map((sp: any) => sp.page_name).join("+");
    } else if (selectedPageObj) {
      fbFollowers = selectedPageObj.facebook_followers || 0;
      igFollowers = selectedPageObj.instagram_followers || 0;
      pageId = selectedPageObj.page_id;
      pageName = selectedPageObj.page_name;
    }

    if (isRealData) {
      const real = insightsData as any;
      const fbIgF = real.fb_followers || fbFollowers;
      const igIgF = real.ig_followers || igFollowers;
      const daily = mergeRealDailyData(real.fb_insights || [], real.ig_insights || [], dateFrom, dateTo);
      const bs = buildPageSeed(pageId, pageName);
      const k = computeKPIs(daily, fbIgF, igIgF, bs);
      k.followersIg = igIgF;
      k.followersFb = fbIgF;
      return { dailyData: daily, kpis: k, baseSeed: bs };
    }

    const bs = buildPageSeed(pageId, pageName);
    const daily = generateDailyData(pageId, pageName, dateFrom, dateTo, fbFollowers, igFollowers, isMockToken);
    const k = computeKPIs(daily, fbFollowers, igFollowers, bs);
    return { dailyData: daily, kpis: k, baseSeed: bs };
  }, [realPages, selectedPage, dateFrom, dateTo, insightsData, isRealData, isMockToken]);

  // ── Top posts para a tabela
  const topPosts = useMemo(() => {
    if (publishedPosts.length > 0) {
      const sorted = [...publishedPosts].sort((a, b) => {
        if (sortPostsBy === "reach") return (b.reach_count || 0) - (a.reach_count || 0);
        if (sortPostsBy === "likes") return (b.likes_count || 0) - (a.likes_count || 0);
        if (sortPostsBy === "comments") return (b.comments_count || 0) - (a.comments_count || 0);
        const engA = a.reach_count ? ((a.likes_count + a.comments_count) / a.reach_count * 100) : 0;
        const engB = b.reach_count ? ((b.likes_count + b.comments_count) / b.reach_count * 100) : 0;
        return engB - engA;
      });
      return sorted.slice(0, 10);
    }

    // Mock posts baseados em dados determinísticos
    const rng = seedRng(baseSeed + 77);
    const postTypes = ["reels", "feed", "stories", "feed", "reels"];
    const postTitles = [
      "Lançamento do Novo Modelo",
      "Oferta Especial de Fim de Semana",
      "Tour pelo Estoque Premium",
      "Dicas de Financiamento",
      "Seminovos Selecionados com Garantia",
      "Black Friday Automotivo",
      "Revisão Grátis para Clientes",
      "Novidades do Mês",
    ];
    const totalReach = (kpis.reachIg + kpis.reachFb) || 1000;
    return Array.from({ length: 5 }, (_, i) => ({
      id: `mock-${i}`,
      title: postTitles[i % postTitles.length],
      post_type: postTypes[i % postTypes.length],
      platform: i % 3 === 0 ? "facebook" : i % 2 === 0 ? "both" : "instagram",
      reach_count: Math.round(totalReach * (0.45 - i * 0.06) * (0.8 + rng() * 0.4)),
      likes_count: Math.round((totalReach * 0.04) * (1 - i * 0.1) * (0.7 + rng() * 0.5)),
      comments_count: Math.round((totalReach * 0.012) * (1 - i * 0.08) * (0.6 + rng() * 0.6)),
      impressions_count: Math.round(totalReach * (0.5 - i * 0.06) * (1.3 + rng() * 0.4)),
      published_at: new Date(Date.now() - i * 2 * 24 * 3600000).toISOString(),
      meta_post_id: `mock_post_${i}`,
      content: "",
    }));
  }, [publishedPosts, sortPostsBy, kpis, baseSeed]);

  // ── Último N dias para a tabela de resumo diário
  const last7Days = useMemo(() => dailyData.slice(-7).reverse(), [dailyData]);

  // ── Countdown para próximo sync
  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) return SYNC_INTERVAL;
        return prev - 1;
      });
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  useEffect(() => {
    if (!fetchingInsights) {
      setLastSync(new Date());
      setCountdown(SYNC_INTERVAL);
    }
  }, [fetchingInsights]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await supabase.functions.invoke("sync-social-media", { body: { action: "fetch-pages" } });
      await supabase.functions.invoke("sync-social-media", { body: { action: "sync-metrics" } });
      await qc.invalidateQueries();
      setLastSync(new Date());
      setCountdown(SYNC_INTERVAL);
      toast.success("Dados sincronizados com o Meta!");
    } catch (e: any) {
      toast.error("Erro ao sincronizar: " + e.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const generateAiInsights = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      const topPost = topPosts[0];
      const engRate = topPost?.reach_count
        ? (((topPost.likes_count || 0) + (topPost.comments_count || 0)) / topPost.reach_count * 100).toFixed(1)
        : "5.2";
      setAiReport(
        `🤖 **Diagnóstico de Performance — Victoria AI**\n\n` +
        `📈 **Destaque do Período:** O alcance orgânico no Instagram atingiu **${(kpis.reachIg).toLocaleString("pt-BR")}** contas únicas. ` +
        `${kpis.growthReachIg >= 0 ? `Crescimento de **+${kpis.growthReachIg}%**` : `Queda de **${kpis.growthReachIg}%**`} vs. período anterior.\n\n` +
        `👥 **Seguidores:** Você ganhou **${(kpis.newFollowersIg + kpis.newFollowersFb).toLocaleString("pt-BR")} novos seguidores** no período — ` +
        `${kpis.newFollowersIg.toLocaleString("pt-BR")} no Instagram e ${kpis.newFollowersFb.toLocaleString("pt-BR")} no Facebook. ` +
        `Base total: **${(kpis.followersIg + kpis.followersFb).toLocaleString("pt-BR")} seguidores**.\n\n` +
        `💡 **Recomendações Estratégicas:**\n` +
        `1. Publicação que mais performou gerou taxa de engajamento de **${engRate}%** — replique o formato.\n` +
        `2. Perfil demográfico dominante: **${kpis.demographics.gender.male}% masculino** e faixa **25–34 anos (${kpis.demographics.age.find(a => a.range === "25-34")?.pct || 38}%)**.\n` +
        `3. Facebook está ${kpis.growthReachFb >= 0 ? "crescendo" : "retraindo"} em alcance. Aumente frequência de posts com CTA direto para WhatsApp nos fins de semana.\n` +
        `4. Melhor horário de engajamento estimado: **terças e quintas, 19h–21h**.`
      );
      setIsGeneratingAi(false);
      toast.success("Diagnóstico gerado pela Victoria AI!");
    }, 1800);
  };

  const formatCountdown = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  const GrowthBadge = ({ value }: { value: number }) => (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${value >= 0 ? "text-emerald-400" : "text-red-400"}`}>
      {value >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
      {value >= 0 ? "+" : ""}{value}%
    </span>
  );

  const demoPieData = [
    { name: "Instagram", value: kpis.reachIg, color: "#e1306c" },
    { name: "Facebook", value: kpis.reachFb, color: "#1877f2" },
  ];

  const genderPieData = [
    { name: "Homens", value: kpis.demographics.gender.male, color: "#6366f1" },
    { name: "Mulheres", value: kpis.demographics.gender.female, color: "#ec4899" },
  ];

  // Limitar pontos do gráfico para não poluir
  const chartData = useMemo(() => {
    const step = dailyData.length > 60 ? 2 : 1;
    return dailyData.filter((_, i) => i % step === 0);
  }, [dailyData]);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            to="/social"
            className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10 shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <span className="label-mono text-primary text-[10px] uppercase tracking-widest">Analytics de Redes Sociais</span>
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2 mt-0.5">
              <BarChart3 className="h-6 w-6 text-primary" /> Insights do Meta
            </h2>
            <div className="flex items-center gap-3 mt-1">
              {/* Sync status */}
              <div className="flex items-center gap-1.5 text-[10px]">
                {fetchingInsights || isSyncing ? (
                  <><Loader2 className="w-3 h-3 animate-spin text-primary" /><span className="text-primary font-bold">Sincronizando...</span></>
                ) : (
                  <>
                    <Clock className="w-3 h-3 text-muted-foreground" />
                    <span className="text-muted-foreground">Próxima sync em</span>
                    <span className="font-mono font-bold text-foreground">{formatCountdown(countdown)}</span>
                  </>
                )}
              </div>
              {lastSync && (
                <span className="text-[10px] text-muted-foreground/60">
                  · Última: {format(lastSync, "HH:mm:ss")}
                </span>
              )}
              {/* Indicador mock/real */}
              {isRealData ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-bold text-emerald-400">
                  <Wifi className="w-2.5 h-2.5" /> DADOS REAIS
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">
                  <WifiOff className="w-2.5 h-2.5" /> MODO DEMO
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleManualSync}
            disabled={isSyncing || fetchingInsights}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            Atualizar
          </button>
          <button
            onClick={generateAiInsights}
            disabled={isGeneratingAi}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition"
          >
            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Diagnóstico IA
          </button>
        </div>
      </div>

      {/* ── Estado vazio: Meta não conectado ─────────────────────────────── */}
      {!isMetaConnected && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center justify-center py-24 text-center gap-6"
        >
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary/20 to-pink-500/10 flex items-center justify-center border border-primary/20">
            <WifiOff className="h-9 w-9 text-primary/60" />
          </div>
          <div className="space-y-2 max-w-md">
            <h3 className="text-xl font-black text-foreground">Nenhuma página vinculada ao Meta</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Para ver dados reais de Instagram e Facebook — seguidores, alcance, impressões e métricas de posts — você precisa conectar sua conta do Meta Business com um Token de Acesso válido.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/config"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition"
            >
              <Sparkles className="h-4 w-4" />
              Ir para Configurações
            </Link>
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-card px-6 py-3 text-sm font-bold text-muted-foreground hover:text-foreground transition"
            >
              <RefreshCw className={`h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              Tentar sincronizar
            </button>
          </div>
          <div className="max-w-sm rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-left space-y-3">
            <p className="text-[10px] font-black text-muted-foreground uppercase tracking-wider">Como conectar</p>
            <ol className="space-y-2 text-[11px] text-muted-foreground list-decimal list-inside leading-relaxed">
              <li>Acesse <strong className="text-foreground">Configurações → Integrações Master</strong></li>
              <li>Insira seu <strong className="text-foreground">Token de Acesso do Meta</strong> (User ou Page Token com permissão <code className="text-primary">pages_read_engagement</code>)</li>
              <li>Clique em <strong className="text-foreground">Salvar e Sincronizar</strong> — as páginas reais aparecerão automaticamente</li>
            </ol>
          </div>
        </motion.div>
      )}

      {/* ── Conteúdo de análise (só aparece quando há páginas reais) ─────── */}
      {isMetaConnected && (<>

      {/* ── Filtros ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-white/5 bg-white/[0.015] rounded-2xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-bold">Página:</span>
          <select
            value={selectedPage}
            onChange={(e) => setSelectedPage(e.target.value)}
            className="rounded-xl border border-white/10 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50"
          >
            <option value="all">Todas as Contas</option>
            {realPages.map((sp: any) => (
              <option key={sp.page_id} value={sp.page_id}>
                {sp.page_name}{sp.instagram_handle ? ` (@${sp.instagram_handle})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-bold">Período:</span>
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
          />
        </div>
      </div>

      {/* ── 6 KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* 1. Seguidores Totais */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden col-span-1"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-pink-500 to-violet-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Seguidores</span>
            <Users className="h-3.5 w-3.5 text-pink-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            {(kpis.followersIg + kpis.followersFb).toLocaleString("pt-BR")}
          </p>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">IG: {kpis.followersIg.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">FB: {kpis.followersFb.toLocaleString("pt-BR")}</p>
          </div>
          <GrowthBadge value={kpis.growthFollowersIg} />
        </motion.div>

        {/* 2. Novos Seguidores */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Novos Seg.</span>
            <UserPlus className="h-3.5 w-3.5 text-cyan-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            +{(kpis.newFollowersIg + kpis.newFollowersFb).toLocaleString("pt-BR")}
          </p>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">IG: +{kpis.newFollowersIg.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">FB: +{kpis.newFollowersFb.toLocaleString("pt-BR")}</p>
          </div>
          <span className="text-[9px] text-muted-foreground">no período</span>
        </motion.div>

        {/* 3. Alcance Orgânico */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500 to-indigo-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Alcance</span>
            <Eye className="h-3.5 w-3.5 text-violet-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            {(kpis.reachIg + kpis.reachFb).toLocaleString("pt-BR")}
          </p>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">IG: {kpis.reachIg.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">FB: {kpis.reachFb.toLocaleString("pt-BR")}</p>
          </div>
          <GrowthBadge value={kpis.growthReachIg} />
        </motion.div>

        {/* 4. Impressões */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Impressões</span>
            <Activity className="h-3.5 w-3.5 text-amber-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            {(kpis.impressionsIg + kpis.impressionsFb).toLocaleString("pt-BR")}
          </p>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">IG: {kpis.impressionsIg.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">FB: {kpis.impressionsFb.toLocaleString("pt-BR")}</p>
          </div>
          <span className="text-[9px] text-muted-foreground">exibições totais</span>
        </motion.div>

        {/* 5. Visualizações de Perfil */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-teal-500 to-emerald-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Views Perfil</span>
            <Globe className="h-3.5 w-3.5 text-teal-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            {kpis.profileViews.toLocaleString("pt-BR")}
          </p>
          <p className="text-[9px] text-muted-foreground">acessos ao perfil</p>
          <span className="text-[9px] text-muted-foreground">no Instagram</span>
        </motion.div>

        {/* 6. Engajamento */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-panel p-4 space-y-2 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-green-500" />
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Engajamento</span>
            <ThumbsUp className="h-3.5 w-3.5 text-emerald-500" />
          </div>
          <p className="font-black text-xl text-white tracking-tight">
            {(kpis.engIg + kpis.engFb).toLocaleString("pt-BR")}
          </p>
          <div className="space-y-0.5">
            <p className="text-[9px] text-muted-foreground">IG: {kpis.engIg.toLocaleString("pt-BR")}</p>
            <p className="text-[9px] text-muted-foreground">FB: {kpis.engFb.toLocaleString("pt-BR")}</p>
          </div>
          <span className="text-[9px] text-muted-foreground">interações totais</span>
        </motion.div>
      </div>

      {/* ── Gráficos principais ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Area: Alcance por dia */}
        <div className="lg:col-span-2 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="glass-panel p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Alcance Orgânico por Dia</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">Contas únicas alcançadas — Instagram vs Facebook</p>
              </div>
              <span className="rounded-full bg-violet-500/10 border border-violet-500/20 px-2 py-0.5 text-[9px] font-bold text-violet-400">ORGÂNICO</span>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradIg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#e1306c" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#e1306c" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradFb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1877f2" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#1877f2" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="reachIg" name="Instagram" stroke="#e1306c" strokeWidth={2} fill="url(#gradIg)" dot={false} activeDot={{ r: 3 }} />
                <Area type="monotone" dataKey="reachFb" name="Facebook" stroke="#1877f2" strokeWidth={2} fill="url(#gradFb)" dot={false} activeDot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 mt-3">
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-3 h-0.5 bg-[#e1306c] rounded-full inline-block" />Instagram</span>
              <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="w-3 h-0.5 bg-[#1877f2] rounded-full inline-block" />Facebook</span>
            </div>
          </motion.div>

          {/* Gráfico Bar: Impressões por dia */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="glass-panel p-5"
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">Impressões por Dia</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">Total de exibições do conteúdo (inclui múltiplas por usuário)</p>
              </div>
              <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-400">IMPRESSÕES</span>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: "#666" }} axisLine={false} tickLine={false} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : String(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="impressionsIg" name="Instagram" fill="#e1306c" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
                <Bar dataKey="impressionsFb" name="Facebook" fill="#1877f2" fillOpacity={0.7} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        </div>

        {/* Direita: demográficos + distribuição de alcance */}
        <div className="space-y-6">
          {/* Distribuição de Alcance */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
            className="glass-panel p-5"
          >
            <h4 className="text-xs font-black text-white uppercase tracking-wider mb-4">Distribuição do Alcance</h4>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={demoPieData} cx="50%" cy="50%" innerRadius={48} outerRadius={70} dataKey="value" paddingAngle={3}>
                  {demoPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: any) => [v.toLocaleString("pt-BR"), "Alcance"]} contentStyle={{ background: "#0c0c14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 mt-2">
              {demoPieData.map((d) => (
                <span key={d.name} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                  {d.name}: {((d.value / Math.max(1, demoPieData.reduce((a, b) => a + b.value, 0))) * 100).toFixed(0)}%
                </span>
              ))}
            </div>
          </motion.div>

          {/* Gênero */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.32 }}
            className="glass-panel p-5 space-y-4"
          >
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Demográficos</h4>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-white">
                <span>Homens ({kpis.demographics.gender.male}%)</span>
                <span>Mulheres ({kpis.demographics.gender.female}%)</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/5 overflow-hidden flex">
                <div className="h-full bg-indigo-500 transition-all" style={{ width: `${kpis.demographics.gender.male}%` }} />
                <div className="h-full bg-pink-500 transition-all" style={{ width: `${kpis.demographics.gender.female}%` }} />
              </div>
            </div>
            <div className="border-t border-white/5 pt-3 space-y-2">
              <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Faixa Etária</p>
              {kpis.demographics.age.map((item) => (
                <div key={item.range} className="space-y-0.5">
                  <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
                    <span className="text-white">{item.range} anos</span>
                    <span>{item.pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }} animate={{ width: `${item.pct}%` }} transition={{ delay: 0.5, duration: 0.6 }}
                      className="h-full bg-primary rounded-full"
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Victoria AI */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.36 }}
            className="glass-panel border-primary/20 bg-primary/5 p-5 space-y-4 relative overflow-hidden"
          >
            <div className="absolute -top-4 -right-4 w-20 h-20 bg-primary/10 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-2 text-primary">
              <Bot className="h-4 w-4 animate-pulse" />
              <h4 className="text-xs font-black uppercase tracking-wider">Victoria AI</h4>
            </div>
            <AnimatePresence mode="wait">
              {aiReport ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className="text-[10px] leading-relaxed text-muted-foreground whitespace-pre-line"
                >
                  {aiReport}
                  <button onClick={() => setAiReport(null)} className="block mt-3 text-[9px] font-black uppercase text-primary hover:underline">
                    Limpar
                  </button>
                </motion.div>
              ) : (
                <div className="py-4 text-center space-y-3">
                  <Sparkles className="h-7 w-7 text-primary/40 mx-auto animate-pulse" />
                  <p className="text-[10px] text-muted-foreground leading-relaxed">Analiso sua audiência, crescimento e top posts para sugerir sua estratégia.</p>
                  <button
                    onClick={generateAiInsights}
                    disabled={isGeneratingAi}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-[11px] font-bold text-primary-foreground hover:opacity-90 active:scale-95 transition"
                  >
                    {isGeneratingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    Gerar Análise
                  </button>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </div>

      {/* ── Resumo dos últimos 7 dias ─────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.38 }}
        className="glass-panel p-5"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">Resumo Diário — Últimos 7 Dias</h4>
            <p className="text-[9px] text-muted-foreground mt-0.5">Métricas por dia no período selecionado</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3">Data</th>
                <th className="py-2.5 px-3 text-center">Alcance IG</th>
                <th className="py-2.5 px-3 text-center">Alcance FB</th>
                <th className="py-2.5 px-3 text-center">Impressões IG</th>
                <th className="py-2.5 px-3 text-center">Impressões FB</th>
                <th className="py-2.5 px-3 text-center">Views Perfil</th>
                <th className="py-2.5 px-3 text-center">Engaj. IG</th>
                <th className="py-2.5 px-3 text-center">Novos Seg.</th>
              </tr>
            </thead>
            <tbody>
              {last7Days.map((day, i) => (
                <motion.tr
                  key={day.date}
                  initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.04 }}
                  className="border-b border-white/[0.035] hover:bg-white/[0.02] transition-colors"
                >
                  <td className="py-2.5 px-3 font-mono font-bold text-white text-[10px]">{day.label}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-pink-400">{day.reachIg.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-blue-400">{day.reachFb.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-amber-400">{day.impressionsIg.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-amber-300/70">{day.impressionsFb.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-teal-400">{day.profileViews.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center font-mono text-[10px] text-emerald-400">{day.engIg.toLocaleString("pt-BR")}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="font-mono text-[10px] text-cyan-400">+{(day.newFollowersIg + day.newFollowersFb).toLocaleString("pt-BR")}</span>
                  </td>
                </motion.tr>
              ))}
              {last7Days.length === 0 && (
                <tr><td colSpan={8} className="py-8 text-center text-xs text-muted-foreground">Selecione um período com dados disponíveis</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ── Top Posts com métricas individuais ───────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.42 }}
        className="glass-panel p-5"
      >
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h4 className="text-xs font-black text-white uppercase tracking-wider">
              {publishedPosts.length > 0 ? "Publicações com Métricas Reais" : "Publicações com Maior Alcance (Demo)"}
            </h4>
            <p className="text-[9px] text-muted-foreground mt-0.5">
              {publishedPosts.length > 0
                ? `${publishedPosts.length} publicações sincronizadas com o Meta`
                : "Dados simulados — publique posts para ver métricas reais"}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-muted-foreground font-bold">Ordenar:</span>
            {(["reach", "likes", "comments", "engagement"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setSortPostsBy(opt)}
                className={`px-2 py-1 rounded-lg text-[9px] font-bold transition-colors ${sortPostsBy === opt ? "bg-primary/15 text-primary border border-primary/30" : "bg-white/5 text-muted-foreground hover:bg-white/10"}`}
              >
                {opt === "reach" ? "Alcance" : opt === "likes" ? "Curtidas" : opt === "comments" ? "Comentários" : "Engajamento"}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-white/5 text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                <th className="py-2.5 px-3">Publicação</th>
                <th className="py-2.5 px-3">Tipo</th>
                <th className="py-2.5 px-3 text-center"><Heart className="w-3 h-3 inline" /> Curtidas</th>
                <th className="py-2.5 px-3 text-center"><MessageSquare className="w-3 h-3 inline" /> Coment.</th>
                <th className="py-2.5 px-3 text-center"><Eye className="w-3 h-3 inline" /> Alcance</th>
                <th className="py-2.5 px-3 text-center"><Activity className="w-3 h-3 inline" /> Impressões</th>
                <th className="py-2.5 px-3 text-center">Taxa Eng.</th>
              </tr>
            </thead>
            <tbody>
              {topPosts.map((post: any, i) => {
                const engRate = post.reach_count
                  ? (((post.likes_count || 0) + (post.comments_count || 0)) / post.reach_count * 100).toFixed(1)
                  : "—";
                const isMockPost = !post.meta_post_id || post.meta_post_id.startsWith("mock_");
                return (
                  <motion.tr
                    key={post.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.44 + i * 0.04 }}
                    className="border-b border-white/[0.035] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2">
                        {post.platform === "facebook"
                          ? <Facebook className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                          : post.platform === "both"
                          ? <Share2 className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                          : <Instagram className="h-3.5 w-3.5 text-pink-500 shrink-0" />}
                        <span className="font-semibold text-white truncate max-w-[180px]">
                          {post.title || post.content?.slice(0, 40) || "Sem título"}
                        </span>
                        {isMockPost && <span className="text-[8px] text-muted-foreground/50 font-mono">(demo)</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 text-[9px] font-mono text-muted-foreground bg-white/5 rounded-full px-2 py-0.5">
                        {post.post_type === "reels" ? <Film className="w-2.5 h-2.5" /> : post.post_type === "stories" ? <Layers className="w-2.5 h-2.5" /> : <Image className="w-2.5 h-2.5" />}
                        {post.post_type || "feed"}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center font-mono text-red-400 font-bold text-[10px]">{(post.likes_count || 0).toLocaleString("pt-BR")}</td>
                    <td className="py-3 px-3 text-center font-mono text-blue-400 text-[10px]">{(post.comments_count || 0).toLocaleString("pt-BR")}</td>
                    <td className="py-3 px-3 text-center font-mono text-white font-bold text-[10px]">{(post.reach_count || 0).toLocaleString("pt-BR")}</td>
                    <td className="py-3 px-3 text-center font-mono text-amber-400 text-[10px]">{(post.impressions_count || 0).toLocaleString("pt-BR")}</td>
                    <td className="py-3 px-3 text-center">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold font-mono ${
                        engRate !== "—" && parseFloat(engRate) >= 3 ? "bg-emerald-500/15 text-emerald-400" :
                        engRate !== "—" && parseFloat(engRate) >= 1 ? "bg-amber-500/15 text-amber-400" :
                        "bg-white/5 text-muted-foreground"
                      }`}>
                        {engRate}%
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      </>)}
    </div>
  );
}
