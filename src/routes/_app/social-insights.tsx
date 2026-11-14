import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Users, Eye, Globe, Sparkles, Heart, MessageSquare,
  RefreshCw, Instagram, Facebook, ThumbsUp,
  Loader2, Bot, UserPlus, Activity, Clock, TrendingUp, TrendingDown,
  Wifi, WifiOff, Image as ImageIcon, Film, Layers, Share2, Calendar,
  Bookmark, ExternalLink, MessageCircle, ChevronDown, AlertCircle, Play
} from "lucide-react";
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, ReferenceLine
} from "recharts";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { useGlobalDate, getLocalDateString } from "@/contexts/DateContext";
import { DateRangePicker } from "@/components/DateRangePicker";
import { supabase } from "@/integrations/supabase-external/client";
import {
  fetchLiveSocialAccounts,
  fetchRealSocialInsights,
  type RealSocialPost,
} from "@/lib/metaSocialService";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_app/social-insights")({
  head: () => ({ meta: [{ title: "Insights do Meta — NC Suite" }] }),
  component: SocialInsightsPage,
});

const DAYS_OF_WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}h`);

type ChartMetricKey = "reachIg" | "newFollowers" | "engFb" | "viewsFb";

function PostMediaPreview({
  post,
  mediaFit,
}: {
  post: RealSocialPost;
  mediaFit: "cover" | "contain";
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);

  const isVideo = post.post_type === "reels" || Boolean(post.media_url?.includes(".mp4"));
  const previewImage = post.thumbnail_url || (!isVideo ? post.media_url : null);

  if (isVideo && post.media_url && !videoFailed) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-black">
        <video
          src={post.media_url}
          poster={post.thumbnail_url || undefined}
          controls
          muted
          playsInline
          preload="metadata"
          onError={() => setVideoFailed(true)}
          className={`w-full h-full ${mediaFit === "cover" ? "object-cover" : "object-contain"}`}
        />
      </div>
    );
  }

  if (previewImage && !imgFailed) {
    return (
      <div className="relative w-full h-full flex items-center justify-center bg-neutral-950">
        <img
          src={previewImage}
          alt={post.title}
          onError={() => setImgFailed(true)}
          className={`w-full h-full transition-transform duration-500 ${
            mediaFit === "cover" ? "object-cover group-hover/media:scale-105" : "object-contain"
          }`}
        />
        {isVideo && (
          <a
            href={post.permalink || "#"}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/45 transition-colors"
            title="Assistir Reels no Instagram"
          >
            <span className="h-11 w-11 rounded-full bg-white/90 text-black flex items-center justify-center shadow-lg">
              <Play className="h-5 w-5 fill-current ml-0.5" />
            </span>
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center text-muted-foreground p-4 text-center space-y-2">
      {post.platform === "facebook" && post.content ? (
        <p className="text-[11px] text-slate-200 line-clamp-6 leading-relaxed bg-white/[0.03] border border-white/10 rounded-xl p-3 text-left">
          {post.content}
        </p>
      ) : (
        <>
          <ImageIcon className="w-7 h-7 text-muted-foreground/50" />
          <span className="text-xs leading-snug">
            Mídia externa protegida pela Meta. Use "Ver Post" para abrir no aplicativo.
          </span>
        </>
      )}
    </div>
  );
}

function SocialInsightsPage() {
  const qc = useQueryClient();
  const [selectedPage, setSelectedPage] = useState("all");
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useGlobalDate();

  // Controles do gráfico de evolução
  const [chartDaysWindow, setChartDaysWindow] = useState<7 | 14 | 30>(14);
  const [chartMetric, setChartMetric] = useState<ChartMetricKey>("reachIg");

  // Estados de IA
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiReportTab, setAiReportTab] = useState<"general" | "content" | "public">("general");

  const [countdown, setCountdown] = useState(300);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  // Filtros de postagem
  const [sortPostsBy, setSortPostsBy] = useState<"recent" | "reach" | "likes" | "comments" | "engagement">("recent");
  const [postTypeFilter, setPostTypeFilter] = useState<"all" | "reels" | "image" | "carousel">("all");
  const [selectedPostDetail, setSelectedPostDetail] = useState<string | null>(null);
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">("contain");

  const dateRange = useMemo(
    () => ({
      startDate: new Date(dateFrom + "T12:00:00"),
      endDate: new Date(dateTo + "T12:00:00"),
    }),
    [dateFrom, dateTo]
  );

  const setDateRange = useCallback(
    (range: { startDate: Date; endDate: Date }) => {
      setDateFrom(getLocalDateString(range.startDate));
      setDateTo(getLocalDateString(range.endDate));
    },
    [setDateFrom, setDateTo]
  );

  // 1. Contas reais conectadas no Meta (/me/accounts)
  const { data: liveAccountsData, isLoading: loadingAccounts } = useQuery({
    queryKey: ["live_meta_social_accounts"],
    queryFn: async () => fetchLiveSocialAccounts(false),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const activePages = liveAccountsData?.accounts || [];
  const masterToken = liveAccountsData?.masterToken || null;

  // 2. Insights e posts 100% REAIS da Meta Graph API v21.0
  const {
    data: realInsights,
    isFetching: fetchingInsights,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ["real_social_insights_v21", selectedPage, dateFrom, dateTo, chartDaysWindow, activePages.length],
    enabled: !loadingAccounts,
    queryFn: async () => {
      const result = await fetchRealSocialInsights({
        accounts: activePages,
        selectedPageId: selectedPage,
        dateFrom,
        dateTo,
        chartDaysOverride: chartDaysWindow,
        masterToken,
      });
      setLastSync(new Date());
      return result;
    },
    staleTime: 3 * 60 * 1000,
    retry: false,
  });

  const kpis = realInsights?.kpis || {
    followersIg: 0,
    followersFb: 0,
    newFollowersIg: 0,
    newFollowersFb: 0,
    reachIg: 0,
    viewsIg: 0,
    viewsFb: 0,
    interactionsIg: 0,
    interactionsFb: 0,
    accountsEngaged: 0,
    profileViews: 0,
    websiteClicks: 0,
    reachDeltaPct: null,
    followersDeltaPct: null,
  };

  const dailySeries = realInsights?.dailySeries || [];
  const demographics = realInsights?.demographics || {
    available: false,
    totalSample: 0,
    gender: { male: 0, female: 0 },
    age: [],
  };
  const heatmapMatrix = realInsights?.heatmapMatrix || Array.from({ length: 7 }, () => Array(24).fill(0));
  const hasPostsForHeatmap = Boolean(realInsights?.hasPostsForHeatmap);

  // Série pronta para o gráfico redesenhado (sempre legível e com resumo imediato)
  const chartView = useMemo(() => {
    const mapped = dailySeries.map((d) => {
      let value = 0;
      if (chartMetric === "reachIg") value = d.reachIg;
      else if (chartMetric === "newFollowers") value = d.newFollowersIg + d.newFollowersFb;
      else if (chartMetric === "engFb") value = d.engFb;
      else if (chartMetric === "viewsFb") value = d.viewsFb;

      return {
        ...d,
        value,
      };
    });

    const total = mapped.reduce((acc, item) => acc + item.value, 0);
    const nonZero = mapped.filter((item) => item.value > 0);
    const avg = mapped.length > 0 ? Math.round(total / mapped.length) : 0;
    const peak = nonZero.length > 0
      ? nonZero.reduce((best, cur) => (cur.value > best.value ? cur : best), nonZero[0])
      : null;

    return {
      data: mapped,
      total,
      avg,
      peak,
      hasAnyData: total > 0,
    };
  }, [dailySeries, chartMetric]);

  // Posts reais filtrados e ordenados
  const listPosts = useMemo(() => {
    const raw = realInsights?.posts || [];
    let filtered = [...raw];
    if (postTypeFilter !== "all") {
      filtered = filtered.filter((p) => p.post_type === postTypeFilter);
    }

    return filtered.sort((a, b) => {
      if (sortPostsBy === "recent") {
        return new Date(b.published_at || 0).getTime() - new Date(a.published_at || 0).getTime();
      }
      if (sortPostsBy === "reach") return b.reach_count - a.reach_count;
      if (sortPostsBy === "likes") return b.likes_count - a.likes_count;
      if (sortPostsBy === "comments") return b.comments_count - a.comments_count;
      return b.engagement_rate - a.engagement_rate;
    });
  }, [realInsights?.posts, postTypeFilter, sortPostsBy]);

  // Sincronização automática (countdown visual + refetch)
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          refetchInsights();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [refetchInsights]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    try {
      await fetchLiveSocialAccounts(true);
      await qc.invalidateQueries({ queryKey: ["live_meta_social_accounts"] });
      await refetchInsights();
      setLastSync(new Date());
      setCountdown(300);
      toast.success("Contas e métricas reais atualizadas direto da Meta API!");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao sincronizar com a Meta API.");
    } finally {
      setIsSyncing(false);
    }
  };

  const generateAiInsights = async () => {
    setIsGeneratingAi(true);
    const accLabel =
      selectedPage === "all"
        ? `Consolidado (${activePages.length} páginas conectadas)`
        : activePages.find((p) => p.page_id === selectedPage)?.page_name || selectedPage;

    const topPostsSummary = listPosts
      .slice(0, 5)
      .map(
        (p, idx) =>
          `${idx + 1}. [${p.platform.toUpperCase()} - ${p.accountHandle}] "${p.title}" | Alcance: ${p.reach_count} | Views: ${p.views_count} | Curtidas: ${p.likes_count} | Comentários: ${p.comments_count} | Engajamento: ${p.engagement_rate.toFixed(1)}%`
      )
      .join("\n");

    try {
      const { data, error } = await supabase.functions.invoke("victoria-agent", {
        body: {
          action: "chat",
          message: `Analise estes DADOS REAIS da Meta Graph API v21.0 da conta "${accLabel}" no período ${dateFrom} a ${dateTo}:
- Seguidores Totais: ${kpis.followersIg} IG + ${kpis.followersFb} FB
- Novos Seguidores no Período: ${kpis.newFollowersIg + kpis.newFollowersFb}
- Alcance Instagram: ${kpis.reachIg}
- Visualizações Totais (IG + FB): ${kpis.viewsIg + kpis.viewsFb}
- Interações Totais: ${kpis.interactionsIg + kpis.interactionsFb}
- Visitas ao Perfil IG: ${kpis.profileViews} | Cliques no Site: ${kpis.websiteClicks}
Top Publicações Reais:
${topPostsSummary || "Nenhuma publicação encontrada no período."}

Responda de forma objetiva e tática em Markdown com:
1. Pontos fortes reais observados nos números
2. Gargalos reais e ações práticas para aumentar leads automotivos
3. Quais formatos/posts reais merecem impulsionamento.`,
        },
      });
      if (error || !data?.reply) throw new Error("Fallback local");
      setAiReport(data.reply);
      toast.success("Diagnóstico da Victoria AI gerado com dados reais!");
    } catch {
      const topPost = listPosts[0];
      const totalFollowers = kpis.followersIg + kpis.followersFb;
      const totalViews = kpis.viewsIg + kpis.viewsFb;
      const totalInt = kpis.interactionsIg + kpis.interactionsFb;
      setAiReport(
        `### 📊 Diagnóstico Baseado nos Dados Reais (${accLabel})\n\n` +
          `- **Base Atual:** **${totalFollowers.toLocaleString("pt-BR")} seguidores** (${kpis.followersIg.toLocaleString("pt-BR")} no Instagram e ${kpis.followersFb.toLocaleString("pt-BR")} no Facebook), com **+${(kpis.newFollowersIg + kpis.newFollowersFb).toLocaleString("pt-BR")} novos seguidores** no período.\n` +
          `- **Distribuição e Retenção:** **${kpis.reachIg.toLocaleString("pt-BR")} pessoas alcançadas** no Instagram e **${totalViews.toLocaleString("pt-BR")} visualizações totais**.\n` +
          `- **Conversão de Perfil:** **${kpis.profileViews.toLocaleString("pt-BR")} visitas no perfil** geraram **${kpis.websiteClicks.toLocaleString("pt-BR")} cliques no link da bio** e **${totalInt.toLocaleString("pt-BR")} interações reais**.\n` +
          (topPost
            ? `- **Destaque Real no Feed:** "${topPost.title}" (${topPost.accountHandle}) atingiu **${topPost.views_count.toLocaleString("pt-BR")} visualizações**, **${topPost.likes_count} curtidas** e **${topPost.comments_count} comentários**.`
            : `- **Publicações:** Nenhuma publicação encontrada ainda para esta conta.`)
      );
      toast.success("Diagnóstico calculado a partir das métricas reais da conta.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Funil real de conversão social
  const funnelData = useMemo(() => {
    const totalViews = kpis.viewsIg + kpis.viewsFb;
    const reachBase = Math.max(kpis.reachIg, totalViews > 0 ? totalViews : 1);
    const totalInteractions = kpis.interactionsIg + kpis.interactionsFb;
    const pctOf = (v: number) => (reachBase > 0 ? Math.min(100, Math.round((v / reachBase) * 100)) : 0);

    return [
      {
        step: "Alcance Instagram",
        value: kpis.reachIg,
        percentage: kpis.reachIg > 0 ? 100 : 0,
        fill: "hsl(var(--primary))",
      },
      {
        step: "Visualizações (IG + FB)",
        value: totalViews,
        percentage: totalViews > 0 ? Math.min(100, Math.round((totalViews / Math.max(kpis.reachIg, totalViews)) * 100)) : 0,
        fill: "#f59e0b",
      },
      {
        step: "Interações Totais",
        value: totalInteractions,
        percentage: pctOf(totalInteractions),
        fill: "#ec4899",
      },
      {
        step: "Visitas ao Perfil",
        value: kpis.profileViews,
        percentage: pctOf(kpis.profileViews),
        fill: "#8b5cf6",
      },
      {
        step: "Cliques no Link / Bio",
        value: kpis.websiteClicks,
        percentage: kpis.websiteClicks > 0 ? Math.max(2, pctOf(kpis.websiteClicks)) : 0,
        fill: "#10b981",
      },
    ];
  }, [kpis]);

  const ageChartData = useMemo(() => {
    return demographics.age.map((a) => ({
      range: a.range,
      Homens: a.male,
      Mulheres: a.female,
    }));
  }, [demographics]);

  const isConnected = Boolean(masterToken && activePages.length > 0);
  const totalFollowersAll = kpis.followersIg + kpis.followersFb;
  const totalViewsAll = kpis.viewsIg + kpis.viewsFb;
  const totalInteractionsAll = kpis.interactionsIg + kpis.interactionsFb;
  const totalNewFollowersAll = kpis.newFollowersIg + kpis.newFollowersFb;
  const bioCtr = kpis.profileViews > 0 ? ((kpis.websiteClicks / kpis.profileViews) * 100).toFixed(1) : "0.0";

  const chartMetricMeta: Record<ChartMetricKey, { label: string; color: string; desc: string }> = {
    reachIg: {
      label: "Alcance IG",
      color: "#ef4444",
      desc: "Pessoas únicas alcançadas por dia no Instagram",
    },
    newFollowers: {
      label: "Novos Seguidores",
      color: "#06b6d4",
      desc: "Crescimento diário de novos seguidores (IG + FB)",
    },
    engFb: {
      label: "Engajamento FB",
      color: "#8b5cf6",
      desc: "Interações diárias nas publicações do Facebook",
    },
    viewsFb: {
      label: "Visitas Página FB",
      color: "#f59e0b",
      desc: "Visualizações diárias na Página do Facebook",
    },
  };

  const CustomChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload;
    return (
      <div className="bg-[#0c0c14]/95 border border-white/15 backdrop-blur-md rounded-xl px-3.5 py-2.5 shadow-xl text-xs space-y-1">
        <p className="font-bold text-white flex items-center justify-between gap-4">
          <span>{item.label} ({item.date})</span>
          {item.isSelectedRange && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase">No filtro</span>
          )}
        </p>
        <p className="font-mono text-white font-bold">
          {chartMetricMeta[chartMetric].label}:{" "}
          <span style={{ color: chartMetricMeta[chartMetric].color }}>
            {Number(item.value || 0).toLocaleString("pt-BR")}
          </span>
        </p>
        {chartMetric === "newFollowers" && (
          <p className="text-xs text-muted-foreground font-mono">
            IG: +{item.newFollowersIg} | FB: +{item.newFollowersFb}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-white/5 pb-5">
        <div className="space-y-1">
          <span className="label-mono text-primary text-xs uppercase tracking-widest font-bold">
            Meta Graph API v21.0 • Dados Reais Verificados
          </span>
          <h2 className="text-2xl font-bold tracking-wider text-foreground uppercase flex items-center gap-2 mt-0.5">
            <BarChart3 className="h-6 w-6 text-primary" /> Performance do Meta
          </h2>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground font-semibold">
            {isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 font-bold text-emerald-400">
                <Wifi className="w-2.5 h-2.5" /> API CONECTADA ({activePages.length} contas reais)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 font-bold text-amber-400">
                <WifiOff className="w-2.5 h-2.5" /> TOKEN META NÃO CONECTADO
              </span>
            )}
            <span>·</span>
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Próximo sync{" "}
              <strong className="text-foreground font-mono">
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, "0")}
              </strong>
            </span>
            {lastSync && (
              <>
                <span>·</span>
                <span>Atualizado às {format(lastSync, "HH:mm:ss")}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to="/social"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-pink-500/20 hover:opacity-90 active:scale-95 transition"
          >
            <Calendar className="h-4 w-4" />
            <span>Planejador &amp; Feed</span>
          </Link>
          <button
            onClick={handleManualSync}
            disabled={isSyncing || fetchingInsights}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || fetchingInsights ? "animate-spin" : ""}`} />
            Sincronizar Agora
          </button>
          <button
            onClick={generateAiInsights}
            disabled={isGeneratingAi || !isConnected}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Diagnóstico Victoria AI
          </button>
        </div>
      </div>

      {/* Aviso honesto se não houver Token configurado */}
      {!loadingAccounts && !isConnected && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-amber-300">Conexão Meta necessária para exibir métricas reais</p>
              <p className="text-muted-foreground">
                {liveAccountsData?.error || "Configure seu Token Master em Configurações → Integrações Master."}
              </p>
            </div>
          </div>
          <Link
            to="/config"
            className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold uppercase hover:opacity-90"
          >
            Ir para Integrações
          </Link>
        </div>
      )}

      {/* Filtros de Escopo */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-white/5 bg-white/[0.01] rounded-2xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Conta Conectada:</span>
          <select
            value={selectedPage}
            onChange={(e) => {
              setSelectedPage(e.target.value);
              setAiReport(null);
              setSelectedPostDetail(null);
            }}
            className="rounded-xl border border-white/10 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 font-bold max-w-[340px]"
          >
            <option value="all">Principais Contas Conectadas (Consolidado)</option>
            {activePages.map((sp) => (
              <option key={sp.page_id} value={sp.page_id}>
                {sp.page_name}{sp.instagram_handle ? ` (@${sp.instagram_handle} · ${sp.instagram_followers.toLocaleString("pt-BR")} seg)` : ` (FB · ${sp.facebook_followers} seg)`}
              </option>
            ))}
          </select>
          {fetchingInsights && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados reais da Meta...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Janela de Análise:</span>
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
          />
        </div>
      </div>

      {/* Cards de KPIs Principais (100% Reais) */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        {/* 1. Alcance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500 to-indigo-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Alcance Instagram</span>
            <Eye className="h-4 w-4 text-violet-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {kpis.reachIg.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Contas únicas</span>
            {kpis.reachDeltaPct !== null ? (
              <span className={`font-bold ${kpis.reachDeltaPct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                {kpis.reachDeltaPct >= 0 ? `+${kpis.reachDeltaPct}%` : `${kpis.reachDeltaPct}%`}
              </span>
            ) : (
              <span className="text-muted-foreground/60 font-mono">Meta v21</span>
            )}
          </div>
        </motion.div>

        {/* 2. Visualizações */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Visualizações</span>
            <Activity className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {totalViewsAll.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">IG: {kpis.viewsIg.toLocaleString("pt-BR")}</span>
            <span className="text-muted-foreground">FB: {kpis.viewsFb.toLocaleString("pt-BR")}</span>
          </div>
        </motion.div>

        {/* 3. Interações */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-pink-500 to-rose-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Interações</span>
            <ThumbsUp className="h-4 w-4 text-pink-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {totalInteractionsAll.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Engajadas: {kpis.accountsEngaged.toLocaleString("pt-BR")}</span>
            <span className="text-muted-foreground">FB: {kpis.interactionsFb.toLocaleString("pt-BR")}</span>
          </div>
        </motion.div>

        {/* 4. Seguidores Reais */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Seguidores Reais</span>
            <UserPlus className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {totalFollowersAll.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-cyan-400 font-bold">
              {totalNewFollowersAll >= 0 ? `+${totalNewFollowersAll.toLocaleString("pt-BR")}` : totalNewFollowersAll.toLocaleString("pt-BR")} no período
            </span>
            <span className="text-muted-foreground">IG {kpis.followersIg.toLocaleString("pt-BR")} · FB {kpis.followersFb}</span>
          </div>
        </motion.div>

        {/* 5. Cliques na Bio */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Cliques no Site</span>
            <Globe className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {kpis.websiteClicks.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">CTR Perfil: {bioCtr}%</span>
            <span className="text-muted-foreground">Bio / Link</span>
          </div>
        </motion.div>

        {/* 6. Visitas ao Perfil */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500 to-pink-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Visitas Perfil IG</span>
            <Users className="h-4 w-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white tracking-tight">
            {kpis.profileViews.toLocaleString("pt-BR")}
          </p>
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">No período filtrado</span>
            <span className="text-muted-foreground">Instagram</span>
          </div>
        </motion.div>
      </div>

      {/* Gráficos Visuais Principais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Evolução Diária Redesenhada — Clara, em Barras + Média + Seletor de Janela e Métrica */}
        <div className="lg:col-span-8 glass-panel p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Evolução Diária do Perfil
                </h4>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold uppercase bg-primary/15 text-primary border border-primary/25">
                  Janela de {chartDaysWindow} dias até {format(parseISO(dateTo), "dd/MM")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {chartMetricMeta[chartMetric].desc}.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Seletor de métrica */}
              <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-xs font-bold">
                {(Object.keys(chartMetricMeta) as ChartMetricKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setChartMetric(key)}
                    className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                      chartMetric === key
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {chartMetricMeta[key].label}
                  </button>
                ))}
              </div>

              {/* Janela rápida do gráfico */}
              <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-xs font-bold">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setChartDaysWindow(d)}
                    className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                      chartDaysWindow === d
                        ? "bg-white/15 text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Barra de Resumo Imediato */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2">
              <span className="text-[11px] uppercase font-bold text-muted-foreground block">
                Total ({chartDaysWindow}d)
              </span>
              <span className="text-sm font-bold font-mono text-white">
                {chartView.total.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2">
              <span className="text-[11px] uppercase font-bold text-muted-foreground block">
                Média Diária
              </span>
              <span className="text-sm font-bold font-mono text-white">
                {chartView.avg.toLocaleString("pt-BR")}/dia
              </span>
            </div>
            <div className="rounded-xl bg-white/[0.02] border border-white/5 px-3 py-2">
              <span className="text-[11px] uppercase font-bold text-muted-foreground block">
                Pico da Janela
              </span>
              <span className="text-sm font-bold font-mono text-emerald-400">
                {chartView.peak
                  ? `${chartView.peak.value.toLocaleString("pt-BR")} (${chartView.peak.label})`
                  : "—"}
              </span>
            </div>
          </div>

          <div className="w-full h-64">
            {chartView.hasAnyData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartView.data} margin={{ top: 10, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#a1a1aa" }}
                    axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#a1a1aa" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
                  />
                  <Tooltip content={<CustomChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
                  {chartView.avg > 0 && (
                    <ReferenceLine
                      y={chartView.avg}
                      stroke="rgba(255,255,255,0.28)"
                      strokeDasharray="4 4"
                      label={{
                        value: `Média: ${chartView.avg.toLocaleString("pt-BR")}`,
                        position: "insideTopRight",
                        fill: "#d4d4d8",
                        fontSize: 10,
                      }}
                    />
                  )}
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={36}>
                    {chartView.data.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={chartMetricMeta[chartMetric].color}
                        fillOpacity={entry.isSelectedRange ? 0.95 : 0.45}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-6 space-y-2">
                <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-xs font-bold text-foreground">
                  {fetchingInsights
                    ? "Carregando série histórica real da Meta..."
                    : `Sem movimentação registrada para "${chartMetricMeta[chartMetric].label}" nos últimos ${chartDaysWindow} dias`}
                </p>
                <p className="text-[11px] text-muted-foreground max-w-md">
                  Se esta página não tiver Instagram Business vinculado ou teve 0 interações nesta janela, alterne a métrica acima ou selecione outra conta conectada.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Funil de Conversão Social Real */}
        <div className="lg:col-span-4 glass-panel p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Funil de Conversão Social</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Fluxo real da exposição até o clique no link da bio.
            </p>
          </div>

          <div className="space-y-3.5 my-4 flex-1 flex flex-col justify-center">
            {funnelData.map((f, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.fill }} />
                    {f.step}
                  </span>
                  <span className="text-white font-mono">
                    {f.value.toLocaleString("pt-BR")}{" "}
                    <span className="text-muted-foreground text-[8px]">({f.percentage}%)</span>
                  </span>
                </div>
                <div className="h-2.5 rounded-lg bg-white/5 overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(f.value > 0 ? 4 : 0, f.percentage)}%` }}
                    transition={{ duration: 0.7, delay: i * 0.08 }}
                    className="h-full rounded-lg"
                    style={{ backgroundColor: f.fill }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-white/5 pt-3 text-xs text-muted-foreground leading-relaxed">
            <span className="text-primary font-bold">Resumo Real:</span>{" "}
            <strong className="text-white">{kpis.profileViews.toLocaleString("pt-BR")}</strong> visitas ao perfil converteram{" "}
            <strong className="text-white">{kpis.websiteClicks.toLocaleString("pt-BR")}</strong> cliques no site (
            <strong className="text-emerald-400">{bioCtr}%</strong> CTR).
          </div>
        </div>
      </div>

      {/* Heatmap Real & Demográficos Reais */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Mapa de Calor a partir das publicações reais */}
        <div className="lg:col-span-8 glass-panel p-5 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Mapa de Calor: Horários das Publicações Reais
              </h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Calculado exclusivamente sobre os horários e engajamento real das publicações carregadas abaixo.
              </p>
            </div>
          </div>

          {hasPostsForHeatmap ? (
            <>
              <div className="overflow-x-auto">
                <div className="min-w-[640px] space-y-1 pt-2">
                  <div className="flex text-[11px] text-muted-foreground font-mono font-bold border-b border-white/5 pb-1">
                    <span className="w-10 shrink-0" />
                    <div className="flex-1 grid grid-cols-24 text-center">
                      {HOURS.map((h, i) => (
                        <span key={h} className={i % 3 === 0 ? "" : "text-transparent"}>
                          {h}
                        </span>
                      ))}
                    </div>
                  </div>
                  {DAYS_OF_WEEK.map((dayName, dayIdx) => (
                    <div key={dayName} className="flex items-center">
                      <span className="w-10 text-xs font-bold text-muted-foreground shrink-0">{dayName}</span>
                      <div className="flex-1 grid grid-cols-24 gap-1">
                        {heatmapMatrix[dayIdx].map((weight, hourIdx) => (
                          <div
                            key={hourIdx}
                            style={{
                              backgroundColor:
                                weight > 0 ? `hsl(var(--primary) / ${weight})` : "rgba(255,255,255,0.03)",
                            }}
                            title={
                              weight > 0
                                ? `${dayName} às ${hourIdx}h — Índice de Engajamento Real: ${Math.round(weight * 100)}%`
                                : `${dayName} às ${hourIdx}h — Sem publicações registradas`
                            }
                            className={`h-5 rounded-[3px] border border-black/20 transition-all hover:scale-115 hover:z-10 cursor-help ${
                              weight > 0.8 ? "shadow-glow-sm shadow-primary/40 border-primary/40" : ""
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 justify-end text-[11px] text-muted-foreground pt-1.5 font-bold uppercase tracking-wider">
                <span>Sem Posts</span>
                <div className="flex gap-0.5">
                  <div className="w-2.5 h-2.5 bg-white/5 rounded-[2px]" />
                  <div className="w-2.5 h-2.5 bg-primary/30 rounded-[2px]" />
                  <div className="w-2.5 h-2.5 bg-primary/60 rounded-[2px]" />
                  <div className="w-2.5 h-2.5 bg-primary rounded-[2px]" />
                </div>
                <span>Maior Tração Real</span>
              </div>
            </>
          ) : (
            <div className="h-44 rounded-xl border border-dashed border-white/10 flex items-center justify-center text-xs text-muted-foreground text-center p-4">
              Ainda não há publicações reais carregadas para mapear os melhores horários desta conta.
            </div>
          )}
        </div>

        {/* Demográficos Reais (Meta follower_demographics) */}
        <div className="lg:col-span-4 glass-panel p-5 flex flex-col justify-between space-y-4">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Distribuição Real por Gênero &amp; Idade
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Dados oficiais do `follower_demographics` no Instagram.
            </p>
          </div>

          {demographics.available ? (
            <>
              <div className="w-full h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ageChartData} margin={{ top: 5, right: 0, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" vertical={false} />
                    <XAxis dataKey="range" tick={{ fontSize: 9, fill: "#a1a1aa" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#a1a1aa" }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      formatter={(v: any, name: any) => [`${v}%`, name]}
                      contentStyle={{ backgroundColor: "#0c0c14", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 11 }}
                    />
                    <Bar dataKey="Homens" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Mulheres" fill="#ec4899" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="border-t border-white/5 pt-3 space-y-2 text-xs">
                <div className="flex justify-between font-bold text-foreground">
                  <span className="flex items-center gap-1.5 text-indigo-400">
                    <span className="w-2.5 h-2.5 rounded bg-primary shrink-0" />
                    Homens ({demographics.gender.male}%)
                  </span>
                  <span className="flex items-center gap-1.5 text-pink-400">
                    <span className="w-2.5 h-2.5 rounded bg-[#ec4899] shrink-0" />
                    Mulheres ({demographics.gender.female}%)
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-white/5 overflow-hidden flex">
                  <div className="h-full bg-primary" style={{ width: `${demographics.gender.male}%` }} />
                  <div className="h-full bg-pink-500" style={{ width: `${demographics.gender.female}%` }} />
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 rounded-xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-4 space-y-1.5">
              <Users className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs font-bold text-foreground">Sem demográficos liberados pela Meta</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                A Meta API libera gênero e faixa etária apenas para contas do Instagram com pelo menos 100 seguidores ativos nesta janela.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Victoria AI Marketing Advisor */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel border-primary/20 bg-gradient-to-br from-primary/[0.04] to-pink-500/[0.01] p-5 relative overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-4 mb-4">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Victoria AI Advisor</h4>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Diagnóstico gerado exclusivamente com as métricas e posts reais da conta selecionada.
              </p>
            </div>
          </div>

          <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-[11px] font-bold">
            <button
              onClick={() => setAiReportTab("general")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                aiReportTab === "general" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Diagnóstico IA
            </button>
            <button
              onClick={() => setAiReportTab("public")}
              className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                aiReportTab === "public" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Resumo Numérico
            </button>
          </div>
        </div>

        <div className="min-h-28 flex flex-col justify-center">
          {aiReportTab === "public" ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Seguidores Atuais</span>
                <p className="font-bold text-white text-sm mt-0.5 font-mono">{totalFollowersAll.toLocaleString("pt-BR")}</p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Posts Reais Carregados</span>
                <p className="font-bold text-white text-sm mt-0.5 font-mono">{listPosts.length}</p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Público Masculino / Fem.</span>
                <p className="font-bold text-white text-sm mt-0.5 font-mono">
                  {demographics.available ? `${demographics.gender.male}% / ${demographics.gender.female}%` : "—"}
                </p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">CTR Link na Bio</span>
                <p className="font-bold text-emerald-400 text-sm mt-0.5 font-mono">{bioCtr}%</p>
              </div>
            </div>
          ) : aiReport ? (
            <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed">
              <ReactMarkdown>{aiReport}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Clique abaixo para que a Victoria AI analise as métricas e publicações reais desta conta.
              </p>
              <button
                onClick={generateAiInsights}
                disabled={isGeneratingAi || !isConnected}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer disabled:opacity-50"
              >
                {isGeneratingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                Gerar Diagnóstico com Dados Reais
              </button>
            </div>
          )}
        </div>
      </motion.div>

      {/* Tabela de Performance de Publicações Reais */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="glass-panel p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              Publicações Reais do Feed &amp; Reels
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs font-mono text-muted-foreground">
                {listPosts.length} posts
              </span>
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Posts reais recuperados diretamente do Instagram &amp; Facebook com métricas oficiais e pré-visualização.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro por tipo de post */}
            <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-[11px] font-bold">
              {(["all", "reels", "image", "carousel"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setPostTypeFilter(type)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    postTypeFilter === type ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "all" ? "Todos" : type === "reels" ? "Reels/Vídeos" : type === "image" ? "Fotos/Posts" : "Carrossel"}
                </button>
              ))}
            </div>

            {/* Ordenador */}
            <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-[11px] font-bold">
              {(["recent", "reach", "likes", "comments", "engagement"] as const).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setSortPostsBy(opt)}
                  className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                    sortPostsBy === opt ? "bg-primary/20 text-primary border border-primary/20" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {opt === "recent"
                    ? "Mais Recentes"
                    : opt === "reach"
                    ? "Alcance"
                    : opt === "likes"
                    ? "Curtidas"
                    : opt === "comments"
                    ? "Comentários"
                    : "Engajamento"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {listPosts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center space-y-2">
            {fetchingInsights ? (
              <>
                <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
                <p className="text-xs font-bold text-foreground">Carregando publicações reais da Meta...</p>
              </>
            ) : (
              <>
                <ImageIcon className="h-7 w-7 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-bold text-foreground">Nenhuma publicação encontrada nesta conta / filtro</p>
                <p className="text-[11px] text-muted-foreground">
                  Selecione outra conta no topo ou limpe o filtro de formato para visualizar as postagens reais da página.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-white/5 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <th className="py-3 px-3">Publicação</th>
                  <th className="py-3 px-3">Conta / Canal</th>
                  <th className="py-3 px-3 text-center"><Heart className="w-3.5 h-3.5 inline text-pink-400 mr-1" />Curtidas</th>
                  <th className="py-3 px-3 text-center"><MessageCircle className="w-3.5 h-3.5 inline text-blue-400 mr-1" />Coment.</th>
                  <th className="py-3 px-3 text-center"><Eye className="w-3.5 h-3.5 inline text-violet-400 mr-1" />Alcance</th>
                  <th className="py-3 px-3 text-center"><Activity className="w-3.5 h-3.5 inline text-amber-400 mr-1" />Views</th>
                  <th className="py-3 px-3 text-center"><Bookmark className="w-3.5 h-3.5 inline text-cyan-400 mr-1" />Salvos / Comp.</th>
                  <th className="py-3 px-3 text-center">Taxa Engaj.</th>
                  <th className="py-3 px-3"></th>
                </tr>
              </thead>
              <tbody>
                {listPosts.map((post) => {
                  const isExpanded = selectedPostDetail === post.id;
                  const engRate = post.engagement_rate.toFixed(1);
                  const thumbUrl = post.thumbnail_url || (!post.media_url?.includes(".mp4") ? post.media_url : null);

                  return (
                    <Fragment key={post.id}>
                      <tr
                        className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors cursor-pointer"
                        onClick={() => setSelectedPostDetail(isExpanded ? null : post.id)}
                      >
                        <td className="py-3 px-3 font-semibold text-foreground">
                          <div className="flex items-center gap-3">
                            {thumbUrl ? (
                              <img
                                src={thumbUrl}
                                alt=""
                                className="h-10 w-10 rounded-lg object-cover border border-white/10 shrink-0 bg-neutral-900"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                                {post.post_type === "reels" ? (
                                  <Film className="w-4 h-4 text-primary" />
                                ) : (
                                  <ImageIcon className="w-4 h-4 text-muted-foreground" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="truncate max-w-[260px] block text-xs font-bold">{post.title}</span>
                              <span className="text-xs text-muted-foreground font-mono">
                                {post.published_at ? format(parseISO(post.published_at), "dd/MM/yyyy HH:mm") : "—"}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-col gap-1">
                            {post.platform === "facebook" ? (
                              <span className="inline-flex items-center gap-1 w-fit text-[11px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full">
                                <Facebook className="w-2.5 h-2.5" /> Facebook
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 w-fit text-[11px] font-bold text-pink-400 bg-pink-500/10 border border-pink-500/20 px-2 py-0.5 rounded-full">
                                <Instagram className="w-2.5 h-2.5" /> Instagram
                              </span>
                            )}
                            <span className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                              {post.accountHandle}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-white">
                          {post.likes_count.toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-muted-foreground">
                          {post.comments_count.toLocaleString("pt-BR")}
                        </td>
                        <td className="py-3 px-3 text-center font-mono font-semibold text-white">
                          {post.reach_count > 0 ? post.reach_count.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-muted-foreground">
                          {post.views_count > 0 ? post.views_count.toLocaleString("pt-BR") : "—"}
                        </td>
                        <td className="py-3 px-3 text-center font-mono text-muted-foreground">
                          {post.saved_count} / {post.shares_count}
                        </td>
                        <td className="py-3 px-3 text-center">
                          {post.reach_count > 0 ? (
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                                Number(engRate) >= 6
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : Number(engRate) >= 3
                                  ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                  : "bg-white/5 text-muted-foreground"
                              }`}
                            >
                              {engRate}%
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground/60">—</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <ChevronDown
                            className={`h-4 w-4 text-muted-foreground transition-transform ${
                              isExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </td>
                      </tr>

                      {/* Linha Expandida com Prévia Real do Criativo */}
                      <AnimatePresence>
                        {isExpanded && (
                          <tr>
                            <td colSpan={9} className="p-0 bg-white/[0.005]">
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden border-b border-white/[0.04] px-5 py-5"
                              >
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                  {/* Coluna 1: Prévia Real do Criativo */}
                                  <div className="lg:col-span-4 flex flex-col items-center">
                                    <div className="w-full flex justify-between items-center mb-2 px-1">
                                      <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1.5">
                                        <ImageIcon className="w-3 h-3 text-primary" /> Prévia Real do Criativo
                                      </span>

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setMediaFit((prev) => (prev === "cover" ? "contain" : "cover"));
                                        }}
                                        className="text-[11px] font-bold text-primary hover:text-white px-2 py-0.5 rounded bg-primary/10 border border-primary/20 cursor-pointer"
                                      >
                                        {mediaFit === "cover" ? "Ajustar Mídia" : "Preencher Tela"}
                                      </button>
                                    </div>

                                    <div className="relative w-full max-w-[240px] rounded-[28px] border-[5px] border-neutral-800 bg-black overflow-hidden shadow-2xl flex flex-col justify-between h-[420px]">
                                      {/* Header Real da Conta */}
                                      <div className="flex items-center justify-between p-2.5 bg-neutral-900 border-b border-white/5 z-10 shrink-0">
                                        <div className="flex items-center gap-2 min-w-0">
                                          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-[11px] font-bold text-primary shrink-0 uppercase">
                                            {post.accountHandle.replace("@", "").slice(0, 2)}
                                          </div>
                                          <div className="flex flex-col min-w-0">
                                            <span className="text-xs font-bold text-white leading-tight truncate">
                                              {post.accountHandle}
                                            </span>
                                            <span className="text-[8px] text-muted-foreground leading-none truncate">
                                              {post.accountName}
                                            </span>
                                          </div>
                                        </div>
                                        {post.platform === "facebook" ? (
                                          <Facebook className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                        ) : (
                                          <Instagram className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                                        )}
                                      </div>

                                      {/* Mídia Real */}
                                      <div className="flex-1 bg-neutral-950 overflow-hidden relative group/media flex items-center justify-center">
                                        <PostMediaPreview post={post} mediaFit={mediaFit} />
                                      </div>

                                      {/* Rodapé com Métricas Reais + Link Real */}
                                      <div className="p-2.5 bg-neutral-900 border-t border-white/5 flex items-center justify-between text-xs shrink-0 z-10">
                                        <div className="flex items-center gap-3 text-muted-foreground font-mono">
                                          <span className="flex items-center gap-1">
                                            <Heart className="w-3.5 h-3.5 text-pink-400" /> {post.likes_count}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <MessageCircle className="w-3.5 h-3.5 text-blue-400" /> {post.comments_count}
                                          </span>
                                        </div>

                                        {post.permalink && (
                                          <a
                                            href={post.permalink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={(e) => e.stopPropagation()}
                                            className="flex items-center gap-1 text-[11px] font-bold text-primary hover:bg-primary/20 border border-primary/20 px-2 py-0.5 rounded-lg transition-all cursor-pointer"
                                          >
                                            Ver Post <ExternalLink className="w-2.5 h-2.5" />
                                          </a>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Coluna 2: Legenda Real */}
                                  <div className="lg:col-span-4 flex flex-col">
                                    <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
                                      <Layers className="w-3 h-3 text-amber-400" /> Legenda Oficial
                                    </span>
                                    <div className="flex-1 bg-white/[0.01] border border-white/5 rounded-2xl p-4 flex flex-col justify-between h-[420px]">
                                      <div className="overflow-y-auto text-[11px] leading-relaxed text-slate-200 pr-1 max-h-[340px] whitespace-pre-line font-medium custom-scrollbar">
                                        {post.content || "Publicação sem legenda textual."}
                                      </div>
                                      <div className="border-t border-white/5 pt-2.5 flex items-center justify-between text-[11px] text-muted-foreground mt-2">
                                        <span>Data da Publicação:</span>
                                        <strong className="text-foreground font-mono">
                                          {post.published_at ? format(parseISO(post.published_at), "dd/MM/yyyy HH:mm") : "—"}
                                        </strong>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Coluna 3: Leitura de Performance Real */}
                                  <div className="lg:col-span-4 flex flex-col">
                                    <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider mb-2 flex items-center gap-1.5">
                                      <Bot className="w-3 h-3 text-primary" /> Análise de Performance Real
                                    </span>

                                    <div className="flex-1 bg-primary/[0.02] border border-primary/25 rounded-2xl p-4 flex flex-col justify-between h-[420px]">
                                      <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-2">
                                          <div className="rounded-xl bg-black/30 p-2.5 border border-white/5">
                                            <span className="text-[8px] uppercase text-muted-foreground block">Alcance Real</span>
                                            <span className="text-sm font-bold font-mono text-white">
                                              {post.reach_count > 0 ? post.reach_count.toLocaleString("pt-BR") : "—"}
                                            </span>
                                          </div>
                                          <div className="rounded-xl bg-black/30 p-2.5 border border-white/5">
                                            <span className="text-[8px] uppercase text-muted-foreground block">Visualizações</span>
                                            <span className="text-sm font-bold font-mono text-white">
                                              {post.views_count > 0 ? post.views_count.toLocaleString("pt-BR") : "—"}
                                            </span>
                                          </div>
                                          <div className="rounded-xl bg-black/30 p-2.5 border border-white/5">
                                            <span className="text-[8px] uppercase text-muted-foreground block">Salvos</span>
                                            <span className="text-sm font-bold font-mono text-cyan-400">
                                              {post.saved_count.toLocaleString("pt-BR")}
                                            </span>
                                          </div>
                                          <div className="rounded-xl bg-black/30 p-2.5 border border-white/5">
                                            <span className="text-[8px] uppercase text-muted-foreground block">Compartilhamentos</span>
                                            <span className="text-sm font-bold font-mono text-emerald-400">
                                              {post.shares_count.toLocaleString("pt-BR")}
                                            </span>
                                          </div>
                                        </div>

                                        <div className="space-y-1">
                                          <p className="text-xs text-muted-foreground uppercase font-bold">
                                            Recomendação Estratégica
                                          </p>
                                          <p className="text-[11px] leading-relaxed text-white/90 font-semibold">
                                            {post.ai_recommendation}
                                          </p>
                                        </div>
                                      </div>

                                      <div className="space-y-2.5 pt-3 border-t border-white/5 mt-4">
                                        <div className="flex justify-between items-center text-xs">
                                          <span className="text-muted-foreground uppercase font-bold">Classificação</span>
                                          <span className="px-2 py-0.5 rounded bg-primary/10 border border-primary/20 text-primary font-bold uppercase tracking-wider text-[11px]">
                                            {post.ai_sentiment}
                                          </span>
                                        </div>

                                        {post.reach_count > 0 && (
                                          <div className="space-y-1">
                                            <div className="flex justify-between text-[11px] text-muted-foreground font-bold uppercase">
                                              <span>Taxa de Engajamento Real</span>
                                              <span className="text-white font-mono">{engRate}%</span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-white/5 overflow-hidden relative">
                                              <div
                                                className="h-full bg-gradient-to-r from-primary to-pink-500 rounded-full"
                                                style={{ width: `${Math.min(100, Math.round(Number(engRate) * 10))}%` }}
                                              />
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </motion.div>
                            </td>
                          </tr>
                        )}
                      </AnimatePresence>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}
