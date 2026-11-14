import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback, Fragment, memo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3, Users, Eye, Globe, Sparkles, Heart, MessageSquare,
  RefreshCw, Instagram, Facebook, ThumbsUp,
  Loader2, Bot, UserPlus, Activity, Clock, TrendingUp, TrendingDown,
  Wifi, WifiOff, Image as ImageIcon, Film, Layers, Share2, Calendar,
  Bookmark, ExternalLink, MessageCircle, ChevronDown, AlertCircle, Play,
  CheckCircle2, ShieldAlert, KeyRound, Gauge, Database
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
  fetchAccountSocialOverview,
  fetchAccountSocialPosts,
  getLastValidSocialSnapshot,
  saveLastValidSocialSnapshot,
  buildSocialSourceTelemetry,
  deriveOverallSocialState,
  isVictoriaSocialContextUsable,
  resolveSimulatedSocialFault,
  type RealSocialPost,
  type SocialDataState,
  type SocialFieldAvailability,
  type SocialOverviewResult,
  type SocialPostsResult,
  type RealSocialInsightsResult,
  type SocialSourceTelemetry,
  type SimulatedSocialFault,
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

const INITIAL_VISIBLE_POSTS = 12;

const SocialSyncCountdown = memo(function SocialSyncCountdown({
  onExpire,
  resetTrigger,
}: {
  onExpire: () => void;
  resetTrigger: number;
}) {
  const [secondsLeft, setSecondsLeft] = useState(300);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;

  useEffect(() => {
    setSecondsLeft(300);
  }, [resetTrigger]);

  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onExpireRef.current();
          return 300;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span className="flex items-center gap-1" data-testid="social-sync-countdown">
      <Clock className="w-3 h-3" />
      Próximo sync{" "}
      <strong className="text-foreground font-mono">
        {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
      </strong>
    </span>
  );
});

const STATE_BADGE_META: Record<
  SocialDataState,
  { label: string; className: string }
> = {
  idle: { label: "Aguardando", className: "bg-slate-500/10 text-slate-300 border-slate-500/20" },
  loading: { label: "Carregando", className: "bg-sky-500/10 text-sky-300 border-sky-500/25" },
  success: { label: "Sucesso", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" },
  partial: { label: "Parcial", className: "bg-amber-500/10 text-amber-300 border-amber-500/25" },
  empty: { label: "Vazio no Período", className: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
  permission_denied: { label: "Permissão Negada", className: "bg-rose-500/10 text-rose-300 border-rose-500/25" },
  token_expired: { label: "Token Expirado", className: "bg-rose-500/15 text-rose-300 border-rose-500/30" },
  rate_limited: { label: "Limite da API", className: "bg-orange-500/15 text-orange-300 border-orange-500/30" },
  error: { label: "Erro", className: "bg-red-500/10 text-red-300 border-red-500/25" },
};

function SocialInsightsPage() {
  const qc = useQueryClient();
  const initialUrlParams = useMemo(() => {
    if (typeof window === "undefined") return { account: "all", fault: null as SimulatedSocialFault, onlyPeriod: false };
    const sp = new URLSearchParams(window.location.search);
    return {
      account: sp.get("account") || "all",
      fault: resolveSimulatedSocialFault(sp.get("sim_fault")),
      onlyPeriod: sp.get("only_period") === "1" || sp.get("only_period") === "true",
    };
  }, []);

  const [selectedPage, setSelectedPage] = useState(initialUrlParams.account);
  const [simulatedFault, setSimulatedFault] = useState<SimulatedSocialFault>(initialUrlParams.fault);
  const [onlyPostsInPeriod, setOnlyPostsInPeriod] = useState<boolean>(initialUrlParams.onlyPeriod);
  const [visiblePostsLimit, setVisiblePostsLimit] = useState<number>(INITIAL_VISIBLE_POSTS);
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useGlobalDate();

  // Controles do gráfico de evolução
  const [chartDaysWindow, setChartDaysWindow] = useState<7 | 14 | 30>(14);
  const [chartMetric, setChartMetric] = useState<ChartMetricKey>("reachIg");

  // Estados de IA
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [aiReportTab, setAiReportTab] = useState<"general" | "content" | "public">("general");

  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [manualSyncTelemetry, setManualSyncTelemetry] = useState<SocialSourceTelemetry>(() =>
    buildSocialSourceTelemetry({
      source: "manualSync",
      state: "idle",
      timeoutMs: 20_000,
      dataSource: "none",
    })
  );
  const accountsStartRef = useRef<string>(new Date().toISOString());
  const overviewStartRef = useRef<string>(new Date().toISOString());
  const postsStartRef = useRef<string>(new Date().toISOString());

  // Filtros de postagem
  const [sortPostsBy, setSortPostsBy] = useState<"recent" | "reach" | "likes" | "comments" | "engagement">("recent");
  const [postTypeFilter, setPostTypeFilter] = useState<"all" | "reels" | "image" | "carousel">("all");
  const [selectedPostDetail, setSelectedPostDetail] = useState<string | null>(null);
  const [mediaFit, setMediaFit] = useState<"cover" | "contain">("contain");

  // Sincroniza query params na URL quando houver mudança externa (ex: navegação em testes E2E)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncFromUrl = () => {
      const sp = new URLSearchParams(window.location.search);
      const accParam = sp.get("account");
      if (accParam && accParam !== selectedPage) {
        setSelectedPage(accParam);
      }
      const faultParam = resolveSimulatedSocialFault(sp.get("sim_fault"));
      if (faultParam !== simulatedFault) {
        setSimulatedFault(faultParam);
      }
      const periodParam = sp.get("only_period") === "1" || sp.get("only_period") === "true";
      if (periodParam !== onlyPostsInPeriod && sp.has("only_period")) {
        setOnlyPostsInPeriod(periodParam);
      }
    };
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
  }, [selectedPage, simulatedFault, onlyPostsInPeriod]);

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
      setVisiblePostsLimit(INITIAL_VISIBLE_POSTS);
    },
    [setDateFrom, setDateTo]
  );

  // 1. Contas reais conectadas no Meta (/me/accounts) — máximo 1 retry, AbortSignal real
  const {
    data: liveAccountsData,
    isLoading: loadingAccounts,
    isFetching: fetchingAccounts,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["live_meta_social_accounts", simulatedFault === "token_expired" ? "sim_token_expired" : "live"],
    queryFn: async ({ signal }) => {
      accountsStartRef.current = new Date().toISOString();
      return fetchLiveSocialAccounts(false, { signal, simulatedFault });
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });

  const activePages = liveAccountsData?.accounts || [];
  const masterToken = liveAccountsData?.masterToken || null;
  const hasMasterToken = Boolean(liveAccountsData?.hasMasterToken || masterToken);

  // 2A. Visão Geral (identidade, seguidores, insights IG/FB, série diária e demográficos)
  const overviewSnapshotKey = `overview:${selectedPage}:${dateFrom}:${dateTo}:${chartDaysWindow}`;
  const {
    data: overviewQueryData,
    isFetching: fetchingOverview,
    isError: overviewQueryFailed,
    refetch: refetchOverview,
  } = useQuery({
    queryKey: [
      "real_social_overview_v21",
      selectedPage,
      dateFrom,
      dateTo,
      chartDaysWindow,
      activePages.length,
      simulatedFault || "none",
    ],
    enabled: !loadingAccounts,
    queryFn: async ({
      signal,
    }): Promise<SocialOverviewResult & { isFromFallback?: boolean; fallbackSnapshotAt?: string | null }> => {
      overviewStartRef.current = new Date().toISOString();
      const result = await fetchAccountSocialOverview({
        accounts: activePages,
        selectedPageId: selectedPage,
        dateFrom,
        dateTo,
        chartDaysOverride: chartDaysWindow,
        masterToken,
        signal,
        simulatedFault,
      });
      if (result.syncSource === "meta_graph_v21" && result.sectionStates.accountInsights.state !== "error") {
        saveLastValidSocialSnapshot(overviewSnapshotKey, {
          accounts: result.accounts,
          dailySeries: result.dailySeries,
          chartWindowDays: result.chartWindowDays,
          kpis: result.kpis,
          fieldAvailability: result.fieldAvailability,
          demographics: result.demographics,
          posts: [],
          heatmapMatrix: Array.from({ length: 7 }, () => Array(24).fill(0)),
          hasPostsForHeatmap: false,
          syncSource: result.syncSource,
          snapshotAt: result.snapshotAt,
          windowUsed: result.windowUsed,
        });
        setLastSync(new Date());
        return result;
      }
      const prev = getLastValidSocialSnapshot(overviewSnapshotKey);
      if (prev && !simulatedFault && result.sectionStates.accountInsights.state === "error") {
        return {
          ...result,
          kpis: prev.kpis,
          dailySeries: prev.dailySeries,
          demographics: prev.demographics,
          fieldAvailability: prev.fieldAvailability || result.fieldAvailability,
          isFromFallback: true,
          fromCache: true,
          fallbackSnapshotAt: prev.snapshotAt || null,
        };
      }
      setLastSync(new Date());
      return result;
    },
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });

  // 2B. Publicações & Heatmap (consulta independente da visão geral)
  const postsSnapshotKey = `posts:${selectedPage}:${onlyPostsInPeriod ? `${dateFrom}_${dateTo}` : "recent"}`;
  const {
    data: postsQueryData,
    isFetching: fetchingPosts,
    isError: postsQueryFailed,
    refetch: refetchPosts,
  } = useQuery({
    queryKey: [
      "real_social_posts_v21",
      selectedPage,
      activePages.length,
      onlyPostsInPeriod ? `${dateFrom}_${dateTo}` : "recent",
      simulatedFault || "none",
    ],
    enabled: !loadingAccounts,
    queryFn: async ({
      signal,
    }): Promise<SocialPostsResult & { isFromFallback?: boolean; fallbackSnapshotAt?: string | null }> => {
      postsStartRef.current = new Date().toISOString();
      const result = await fetchAccountSocialPosts({
        accounts: activePages,
        selectedPageId: selectedPage,
        masterToken,
        dateFrom,
        dateTo,
        onlyInPeriod: onlyPostsInPeriod,
        signal,
        simulatedFault,
      });
      if (
        result.postsState.state === "success" ||
        result.postsState.state === "partial" ||
        result.postsState.state === "empty"
      ) {
        saveLastValidSocialSnapshot(postsSnapshotKey, {
          accounts: activePages,
          dailySeries: [],
          chartWindowDays: chartDaysWindow,
          kpis: {
            followersIg: 0, followersFb: 0, newFollowersIg: 0, newFollowersFb: 0,
            reachIg: 0, viewsIg: 0, viewsFb: 0, interactionsIg: 0, interactionsFb: 0,
            accountsEngaged: 0, profileViews: 0, websiteClicks: 0,
            reachDeltaPct: null, followersDeltaPct: null,
          },
          demographics: { available: false, totalSample: 0, gender: { male: 0, female: 0 }, age: [] },
          posts: result.posts,
          heatmapMatrix: result.heatmapMatrix,
          hasPostsForHeatmap: result.hasPostsForHeatmap,
          heatmapSampleSize: result.heatmapSampleSize,
          syncSource: "meta_graph_v21",
          snapshotAt: result.snapshotAt,
        });
        return result;
      }
      const prev = getLastValidSocialSnapshot(postsSnapshotKey);
      if (prev && !simulatedFault && prev.posts.length > 0) {
        return {
          ...result,
          posts: prev.posts,
          heatmapMatrix: prev.heatmapMatrix,
          hasPostsForHeatmap: prev.hasPostsForHeatmap,
          heatmapSampleSize: prev.heatmapSampleSize || prev.posts.length,
          isFromFallback: true,
          fromCache: true,
          fallbackSnapshotAt: prev.snapshotAt || null,
        };
      }
      return result;
    },
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });

  // Sinaliza ao useAutoSync global para não disputar conexões durante o carregamento inicial de /social-insights
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).__ncSocialInsightsLoading = Boolean(loadingAccounts || fetchingOverview || fetchingPosts);
    }
    return () => {
      if (typeof window !== "undefined") {
        (window as any).__ncSocialInsightsLoading = false;
      }
    };
  }, [loadingAccounts, fetchingOverview, fetchingPosts]);

  const refetchAllSocial = useCallback(async () => {
    await Promise.allSettled([refetchOverview(), refetchPosts()]);
  }, [refetchOverview, refetchPosts]);

  const fetchingInsights = fetchingOverview || fetchingPosts;

  const targetAccountsList =
    overviewQueryData?.targetAccounts ||
    (selectedPage === "all" ? activePages : activePages.filter((p) => p.page_id === selectedPage));
  const selectedAccountObj =
    selectedPage === "all" ? null : activePages.find((p) => p.page_id === selectedPage) || null;
  const hasAnyInstagramTarget =
    selectedPage === "all"
      ? activePages.some((a) => Boolean(a.instagram_account_id))
      : Boolean(selectedAccountObj?.instagram_account_id);

  // Quando o usuário seleciona uma conta somente Facebook (ex: Alug Motos Brasil), muda automaticamente
  // a métrica do gráfico de "reachIg" para "viewsFb" para exibir imediatamente a série real do Facebook.
  useEffect(() => {
    if (!loadingAccounts && selectedPage !== "all" && selectedAccountObj && !selectedAccountObj.instagram_account_id) {
      if (chartMetric === "reachIg") {
        setChartMetric("viewsFb");
      }
    } else if (!loadingAccounts && (selectedPage === "all" || selectedAccountObj?.instagram_account_id)) {
      if (chartMetric === "viewsFb" && selectedPage === "all") {
        setChartMetric("reachIg");
      }
    }
  }, [selectedPage, selectedAccountObj, loadingAccounts]);

  const kpis = overviewQueryData?.kpis || {
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

  const fieldAvail = overviewQueryData?.fieldAvailability || {
    reachIg: "available" as SocialFieldAvailability,
    viewsIg: "available" as SocialFieldAvailability,
    viewsFb: "available" as SocialFieldAvailability,
    interactionsIg: "available" as SocialFieldAvailability,
    interactionsFb: "available" as SocialFieldAvailability,
    profileViews: "available" as SocialFieldAvailability,
    websiteClicks: "available" as SocialFieldAvailability,
    followers: "available" as SocialFieldAvailability,
  };

  const sectionStates = overviewQueryData?.sectionStates;
  const overviewInitialLoading = (loadingAccounts || fetchingOverview) && !overviewQueryData;
  const postsInitialLoading = (loadingAccounts || fetchingPosts) && !postsQueryData;

  const dailySeries = overviewQueryData?.dailySeries || [];
  const demographics = overviewQueryData?.demographics || {
    available: false,
    totalSample: 0,
    gender: { male: 0, female: 0 },
    age: [],
  };
  const heatmapMatrix = postsQueryData?.heatmapMatrix || Array.from({ length: 7 }, () => Array(24).fill(0));
  const hasPostsForHeatmap = Boolean(postsQueryData?.hasPostsForHeatmap);

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
    const raw = postsQueryData?.posts || [];
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
  }, [postsQueryData?.posts, postTypeFilter, sortPostsBy]);

  const visiblePosts = useMemo(
    () => listPosts.slice(0, visiblePostsLimit),
    [listPosts, visiblePostsLimit]
  );

  const handleManualSync = async () => {
    const startedAt = new Date().toISOString();
    const t0 = Date.now();
    setIsSyncing(true);
    setManualSyncTelemetry(
      buildSocialSourceTelemetry({
        source: "manualSync",
        state: "loading",
        startedAt,
        timeoutMs: 20_000,
        dataSource: "meta_graph_v21",
      })
    );
    try {
      const bounded = <T,>(promise: Promise<T>, label: string, ms = 18_000) =>
        Promise.race([
          promise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tempo limite excedido ao atualizar ${label}.`)), ms)
          ),
        ]);
      const accSyncRes = await bounded(fetchLiveSocialAccounts(true, { simulatedFault }), "lista de contas Meta", 12_000);
      await qc.invalidateQueries({ queryKey: ["live_meta_social_accounts"] });
      await bounded(refetchAllSocial(), "métricas e publicações sociais", 18_000);
      const finishedAt = new Date().toISOString();
      setLastSync(new Date());
      setManualSyncTelemetry(
        buildSocialSourceTelemetry({
          source: "manualSync",
          state: accSyncRes.telemetry.state === "error" ? "error" : "success",
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          timeoutMs: 20_000,
          error: accSyncRes.error || null,
          itemCount: accSyncRes.accounts.length,
          dataSource: "meta_graph_v21",
          snapshotAt: finishedAt,
          fromCache: false,
        })
      );
      toast.success("Contas e métricas reais atualizadas direto da Meta API!");
    } catch (err: any) {
      const finishedAt = new Date().toISOString();
      const errMsg = err?.message || "Erro ao sincronizar com a Meta API — tentar novamente.";
      setManualSyncTelemetry(
        buildSocialSourceTelemetry({
          source: "manualSync",
          state: "error",
          startedAt,
          finishedAt,
          durationMs: Date.now() - t0,
          timeoutMs: 20_000,
          error: errMsg,
          itemCount: 0,
          dataSource: "meta_graph_v21",
          snapshotAt: finishedAt,
          fromCache: false,
        })
      );
      toast.error(errMsg);
    } finally {
      setIsSyncing(false);
    }
  };

  // Máquina de estados determinística por fonte
  const accountsTelemetry: SocialSourceTelemetry = useMemo(() => {
    if (loadingAccounts || (fetchingAccounts && !liveAccountsData)) {
      return buildSocialSourceTelemetry({
        source: "accounts",
        state: "loading",
        startedAt: accountsStartRef.current,
        timeoutMs: 12_000,
        dataSource: "meta_graph_v21",
      });
    }
    return (
      liveAccountsData?.telemetry ||
      buildSocialSourceTelemetry({
        source: "accounts",
        state: activePages.length > 0 ? "success" : "empty",
        startedAt: accountsStartRef.current,
        timeoutMs: 12_000,
        itemCount: activePages.length,
        dataSource: "meta_graph_v21",
      })
    );
  }, [loadingAccounts, fetchingAccounts, liveAccountsData, activePages.length]);

  const overviewTelemetry: SocialSourceTelemetry = useMemo(() => {
    if (loadingAccounts) {
      return buildSocialSourceTelemetry({
        source: "overview",
        state: "idle",
        timeoutMs: 15_000,
        dataSource: "none",
      });
    }
    if (fetchingOverview && !overviewQueryData) {
      return buildSocialSourceTelemetry({
        source: "overview",
        state: "loading",
        startedAt: overviewStartRef.current,
        timeoutMs: 15_000,
        dataSource: "meta_graph_v21",
      });
    }
    if (overviewQueryData?.telemetry?.overview) {
      return {
        ...overviewQueryData.telemetry.overview,
        fromCache: Boolean(overviewQueryData.fromCache || overviewQueryData.isFromFallback),
      };
    }
    return buildSocialSourceTelemetry({
      source: "overview",
      state: overviewQueryFailed ? "error" : "idle",
      startedAt: overviewStartRef.current,
      timeoutMs: 15_000,
      error: overviewQueryFailed ? "Falha ao carregar visão geral" : null,
    });
  }, [loadingAccounts, fetchingOverview, overviewQueryData, overviewQueryFailed]);

  const dailySeriesTelemetry: SocialSourceTelemetry = useMemo(() => {
    if (loadingAccounts) {
      return buildSocialSourceTelemetry({
        source: "dailySeries",
        state: "idle",
        timeoutMs: 15_000,
        dataSource: "none",
      });
    }
    if (fetchingOverview && !overviewQueryData) {
      return buildSocialSourceTelemetry({
        source: "dailySeries",
        state: "loading",
        startedAt: overviewStartRef.current,
        timeoutMs: 15_000,
        dataSource: "meta_graph_v21",
      });
    }
    if (overviewQueryData?.telemetry?.dailySeries) {
      return {
        ...overviewQueryData.telemetry.dailySeries,
        fromCache: Boolean(overviewQueryData.fromCache || overviewQueryData.isFromFallback),
      };
    }
    return buildSocialSourceTelemetry({
      source: "dailySeries",
      state: overviewQueryFailed ? "error" : "idle",
      startedAt: overviewStartRef.current,
      timeoutMs: 15_000,
    });
  }, [loadingAccounts, fetchingOverview, overviewQueryData, overviewQueryFailed]);

  const demographicsTelemetry: SocialSourceTelemetry = useMemo(() => {
    if (loadingAccounts) {
      return buildSocialSourceTelemetry({
        source: "demographics",
        state: "idle",
        timeoutMs: 15_000,
        dataSource: "none",
      });
    }
    if (fetchingOverview && !overviewQueryData) {
      return buildSocialSourceTelemetry({
        source: "demographics",
        state: "loading",
        startedAt: overviewStartRef.current,
        timeoutMs: 15_000,
        dataSource: "meta_graph_v21",
      });
    }
    if (overviewQueryData?.telemetry?.demographics) {
      return {
        ...overviewQueryData.telemetry.demographics,
        fromCache: Boolean(overviewQueryData.fromCache || overviewQueryData.isFromFallback),
      };
    }
    return buildSocialSourceTelemetry({
      source: "demographics",
      state: overviewQueryFailed ? "error" : "empty",
      startedAt: overviewStartRef.current,
      timeoutMs: 15_000,
    });
  }, [loadingAccounts, fetchingOverview, overviewQueryData, overviewQueryFailed]);

  const postsTelemetry: SocialSourceTelemetry = useMemo(() => {
    if (loadingAccounts) {
      return buildSocialSourceTelemetry({
        source: "posts",
        state: "idle",
        timeoutMs: 16_000,
        dataSource: "none",
      });
    }
    if (fetchingPosts && !postsQueryData) {
      return buildSocialSourceTelemetry({
        source: "posts",
        state: "loading",
        startedAt: postsStartRef.current,
        timeoutMs: 16_000,
        dataSource: "meta_graph_v21",
      });
    }
    if (postsQueryData?.telemetry) {
      return {
        ...postsQueryData.telemetry,
        fromCache: Boolean(postsQueryData.fromCache || postsQueryData.isFromFallback),
      };
    }
    return buildSocialSourceTelemetry({
      source: "posts",
      state: postsQueryFailed ? "error" : "idle",
      startedAt: postsStartRef.current,
      timeoutMs: 16_000,
      error: postsQueryFailed ? "Falha ao carregar publicações" : null,
    });
  }, [loadingAccounts, fetchingPosts, postsQueryData, postsQueryFailed]);

  const overallSocialState = useMemo(
    () =>
      deriveOverallSocialState({
        accounts: accountsTelemetry.state,
        overview: overviewTelemetry.state,
        dailySeries: dailySeriesTelemetry.state,
        posts: postsTelemetry.state,
      }),
    [accountsTelemetry.state, overviewTelemetry.state, dailySeriesTelemetry.state, postsTelemetry.state]
  );

  const canUseVictoria = useMemo(
    () =>
      isVictoriaSocialContextUsable({
        accountsState: accountsTelemetry.state,
        accountsCount: activePages.length,
        overviewState: overviewTelemetry.state,
        postsState: postsTelemetry.state,
      }),
    [accountsTelemetry.state, activePages.length, overviewTelemetry.state, postsTelemetry.state]
  );

  const generateAiInsights = async () => {
    if (!canUseVictoria) return;
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

    const fmtVal = (val: number, avail: SocialFieldAvailability) =>
      avail === "unavailable"
        ? "Indisponível (Conta sem Instagram Business vinculado)"
        : avail === "error"
        ? "Indisponível por falha de leitura na API"
        : val.toLocaleString("pt-BR");

    try {
      const { data, error } = await supabase.functions.invoke("victoria-agent", {
        body: {
          action: "chat",
          message: `Analise estes DADOS REAIS da Meta Graph API v21.0 da conta "${accLabel}" no período ${dateFrom} a ${dateTo}:
- Estado Geral da Coleta: ${overallSocialState} (Visão Geral: ${overviewTelemetry.state} | Posts: ${postsTelemetry.state} | Demográficos: ${demographicsTelemetry.state})
- Canal Conectado: ${hasAnyInstagramTarget ? "Instagram Business + Página Facebook" : "Somente Página do Facebook (Sem Instagram vinculado — NUNCA trate métricas de Instagram como zero)"}
- Seguidores Totais: ${hasAnyInstagramTarget ? `${kpis.followersIg} IG + ` : ""}${kpis.followersFb} FB
- Novos Seguidores no Período: ${kpis.newFollowersIg + kpis.newFollowersFb}
- Alcance Instagram: ${fmtVal(kpis.reachIg, fieldAvail.reachIg)}
- Visualizações Totais: IG=${fmtVal(kpis.viewsIg, fieldAvail.viewsIg)} | FB=${fmtVal(kpis.viewsFb, fieldAvail.viewsFb)}
- Interações Totais: IG=${fmtVal(kpis.interactionsIg, fieldAvail.interactionsIg)} | FB=${fmtVal(kpis.interactionsFb, fieldAvail.interactionsFb)}
- Visitas ao Perfil IG: ${fmtVal(kpis.profileViews, fieldAvail.profileViews)} | Cliques no Site: ${fmtVal(kpis.websiteClicks, fieldAvail.websiteClicks)}
Top Publicações Reais (${postsTelemetry.state}):
${topPostsSummary || (postsTelemetry.state === "error" ? "Publicações indisponíveis por erro de leitura na API (não trate como zero)." : "Nenhuma publicação encontrada no período.")}

Responda de forma objetiva e tática em Markdown com:
1. Pontos fortes reais observados nos números disponíveis (respeitando limitações/indisponibilidades sem inventar zeros)
2. Gargalos reais e ações práticas
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
          `- **Estado das Fontes:** Visão Geral \`${overviewTelemetry.state}\` · Publicações \`${postsTelemetry.state}\` · Canal: **${hasAnyInstagramTarget ? "Instagram + Facebook" : "Somente Facebook"}**.\n` +
          `- **Base Atual:** **${totalFollowers.toLocaleString("pt-BR")} seguidores** (${hasAnyInstagramTarget ? `${kpis.followersIg.toLocaleString("pt-BR")} no Instagram e ` : ""}${kpis.followersFb.toLocaleString("pt-BR")} no Facebook), com **+${(kpis.newFollowersIg + kpis.newFollowersFb).toLocaleString("pt-BR")} novos seguidores** no período.\n` +
          (hasAnyInstagramTarget
            ? `- **Distribuição e Retenção:** **${fmtVal(kpis.reachIg, fieldAvail.reachIg)} pessoas alcançadas** no Instagram e **${totalViews.toLocaleString("pt-BR")} visualizações totais**.\n` +
              `- **Conversão de Perfil:** **${fmtVal(kpis.profileViews, fieldAvail.profileViews)} visitas no perfil** geraram **${fmtVal(kpis.websiteClicks, fieldAvail.websiteClicks)} cliques no link da bio** e **${totalInt.toLocaleString("pt-BR")} interações reais**.\n`
            : `- **Performance Página Facebook:** **${kpis.viewsFb.toLocaleString("pt-BR")} visualizações da página** e **${kpis.interactionsFb.toLocaleString("pt-BR")} engajamentos em publicações** (métricas exclusivas do Instagram não se aplicam a esta conta).\n`) +
          (topPost
            ? `- **Destaque Real no Feed:** "${topPost.title}" (${topPost.accountHandle}) atingiu **${topPost.views_count.toLocaleString("pt-BR")} visualizações**, **${topPost.likes_count} curtidas** e **${topPost.comments_count} comentários**.`
            : postsTelemetry.state === "error"
            ? `- **Publicações:** Leitura de publicações falhou temporariamente na API Meta — utilize "Tentar novamente" na fonte de publicações.`
            : `- **Publicações:** Nenhuma publicação registrada no filtro selecionado.`)
      );
      toast.success("Diagnóstico calculado a partir das métricas reais disponíveis da conta.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Funil real de conversão social (adapta para contas somente Facebook e nunca exibe zeros falsos em loading/erro)
  const funnelData = useMemo(() => {
    if (!hasAnyInstagramTarget) {
      const fbBase = Math.max(1, kpis.viewsFb, kpis.interactionsFb, kpis.followersFb);
      const pctFb = (v: number) => Math.min(100, Math.round((v / fbBase) * 100));
      return [
        {
          step: "Seguidores Página FB",
          value: kpis.followersFb,
          percentage: kpis.followersFb > 0 ? 100 : 0,
          fill: "#3b82f6",
        },
        {
          step: "Visualizações Página FB",
          value: kpis.viewsFb,
          percentage: pctFb(kpis.viewsFb),
          fill: "#f59e0b",
        },
        {
          step: "Engajamentos FB",
          value: kpis.interactionsFb,
          percentage: pctFb(kpis.interactionsFb),
          fill: "#ec4899",
        },
        {
          step: "Novos Seguidores FB",
          value: kpis.newFollowersFb,
          percentage: kpis.newFollowersFb > 0 ? Math.max(4, pctFb(kpis.newFollowersFb)) : 0,
          fill: "#10b981",
        },
      ];
    }

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
  }, [kpis, hasAnyInstagramTarget]);

  const ageChartData = useMemo(() => {
    return demographics.age.map((a) => ({
      range: a.range,
      Homens: a.male,
      Mulheres: a.female,
    }));
  }, [demographics]);

  const isConnected = Boolean(masterToken && activePages.length > 0);
  const networkModeLabel = loadingAccounts
    ? "Verificando canais conectados..."
    : selectedPage === "all"
    ? `Consolidado (${targetAccountsList.length} contas · IG + FB)`
    : selectedAccountObj?.instagram_account_id
    ? `Instagram (@${selectedAccountObj.instagram_handle || selectedAccountObj.instagram_account_id}) + Facebook`
    : "Somente Página do Facebook (Sem Instagram Business)";

  const overviewErrorState: SocialDataState | null = overviewQueryFailed
    ? "error"
    : sectionStates?.accountInsights.state &&
      ["error", "token_expired", "rate_limited", "permission_denied"].includes(sectionStates.accountInsights.state)
    ? sectionStates.accountInsights.state
    : null;
  const followersErrorState: SocialDataState | null = overviewQueryFailed
    ? "error"
    : sectionStates?.followers.state &&
      ["error", "token_expired", "rate_limited", "permission_denied"].includes(sectionStates.followers.state)
    ? sectionStates.followers.state
    : null;
  const postsErrorState: SocialDataState | null = postsQueryFailed
    ? "error"
    : postsQueryData?.postsState.state &&
      ["error", "token_expired", "rate_limited", "permission_denied"].includes(postsQueryData.postsState.state)
    ? postsQueryData.postsState.state
    : null;

  const allEndpointLogs = [
    ...(overviewQueryData?.endpointLogs || []),
    ...(postsQueryData?.endpointLogs || []),
  ];
  const effectiveSnapshotIso =
    overviewQueryData?.fallbackSnapshotAt ||
    overviewQueryData?.snapshotAt ||
    postsQueryData?.snapshotAt ||
    (lastSync ? lastSync.toISOString() : null);
  const isShowingCachedSnapshot = Boolean(
    overviewQueryData?.fromCache ||
      overviewQueryData?.isFromFallback ||
      postsQueryData?.fromCache ||
      postsQueryData?.isFromFallback ||
      accountsTelemetry.fromCache
  );

  const renderMetricDisplay = (
    value: number,
    availability: SocialFieldAvailability,
    isLoadingCard: boolean,
    errorState: SocialDataState | null
  ) => {
    if (isLoadingCard) return { main: "—", statusText: "Carregando..." as string | null, isUnavailable: false, isError: false, isZero: false };
    if (errorState && !overviewQueryData?.fromCache && !overviewQueryData?.isFromFallback) {
      return {
        main: "—",
        statusText: STATE_BADGE_META[errorState]?.label || "Não foi possível carregar — tentar novamente",
        isUnavailable: false,
        isError: true,
        isZero: false,
      };
    }
    if (availability === "error" && !overviewQueryData?.fromCache && !overviewQueryData?.isFromFallback) {
      return {
        main: "—",
        statusText: "Não foi possível carregar — tentar novamente",
        isUnavailable: false,
        isError: true,
        isZero: false,
      };
    }
    if (availability === "unavailable") {
      return {
        main: "—",
        statusText: "Indisponível (Conta somente Facebook)",
        isUnavailable: true,
        isError: false,
        isZero: false,
      };
    }
    if (value === 0) {
      return {
        main: "0",
        statusText: "0 no período selecionado",
        isUnavailable: false,
        isError: false,
        isZero: true,
      };
    }
    return {
      main: value.toLocaleString("pt-BR"),
      statusText: null,
      isUnavailable: false,
      isError: false,
      isZero: false,
    };
  };

  const totalFollowersAll = kpis.followersIg + kpis.followersFb;
  const totalViewsAll = kpis.viewsIg + kpis.viewsFb;
  const totalInteractionsAll = kpis.interactionsIg + kpis.interactionsFb;
  const totalNewFollowersAll = kpis.newFollowersIg + kpis.newFollowersFb;
  const bioCtr = kpis.profileViews > 0 ? ((kpis.websiteClicks / kpis.profileViews) * 100).toFixed(1) : "0.0";

  const reachDisplay = renderMetricDisplay(kpis.reachIg, fieldAvail.reachIg, overviewInitialLoading, overviewErrorState);
  const viewsAvail: SocialFieldAvailability =
    fieldAvail.viewsIg === "error" && fieldAvail.viewsFb === "error"
      ? "error"
      : fieldAvail.viewsIg === "unavailable" && fieldAvail.viewsFb === "unavailable"
      ? "unavailable"
      : "available";
  const viewsDisplay = renderMetricDisplay(totalViewsAll, viewsAvail, overviewInitialLoading, overviewErrorState);
  const interactionsAvail: SocialFieldAvailability =
    fieldAvail.interactionsIg === "error" && fieldAvail.interactionsFb === "error"
      ? "error"
      : fieldAvail.interactionsIg === "unavailable" && fieldAvail.interactionsFb === "unavailable"
      ? "unavailable"
      : "available";
  const interactionsDisplay = renderMetricDisplay(totalInteractionsAll, interactionsAvail, overviewInitialLoading, overviewErrorState);
  const followersDisplay = renderMetricDisplay(totalFollowersAll, fieldAvail.followers, overviewInitialLoading, followersErrorState);
  const websiteDisplay = renderMetricDisplay(kpis.websiteClicks, fieldAvail.websiteClicks, overviewInitialLoading, overviewErrorState);
  const profileDisplay = renderMetricDisplay(kpis.profileViews, fieldAvail.profileViews, overviewInitialLoading, overviewErrorState);

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

  const sourceTelemetryList: Array<{
    telemetry: SocialSourceTelemetry;
    onRetry: () => void;
  }> = [
    { telemetry: accountsTelemetry, onRetry: () => void refetchAccounts() },
    { telemetry: overviewTelemetry, onRetry: () => void refetchOverview() },
    { telemetry: dailySeriesTelemetry, onRetry: () => void refetchOverview() },
    { telemetry: postsTelemetry, onRetry: () => void refetchPosts() },
    { telemetry: demographicsTelemetry, onRetry: () => void refetchOverview() },
    { telemetry: manualSyncTelemetry, onRetry: () => void handleManualSync() },
  ];

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
            {loadingAccounts ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/10 border border-slate-500/20 px-2.5 py-0.5 font-bold text-slate-300">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> VALIDANDO CONEXÃO META...
              </span>
            ) : isConnected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 font-bold text-emerald-400">
                <Wifi className="w-2.5 h-2.5" /> API CONECTADA ({activePages.length} contas reais)
              </span>
            ) : hasMasterToken ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 font-bold text-amber-400">
                <WifiOff className="w-2.5 h-2.5" /> TOKEN ATIVO · SEM PÁGINAS OU BLOQUEIO DE REDE
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 font-bold text-rose-300">
                <WifiOff className="w-2.5 h-2.5" /> {accountsTelemetry.state === "token_expired" ? "TOKEN EXPIRADO OU INVÁLIDO" : "TOKEN META NÃO CONECTADO"}
              </span>
            )}
            <span>·</span>
            <span
              data-testid="social-overall-state"
              data-state={overallSocialState}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-bold text-[11px] uppercase ${STATE_BADGE_META[overallSocialState].className}`}
            >
              Estado Final: {STATE_BADGE_META[overallSocialState].label} ({overallSocialState})
            </span>
            <span>·</span>
            <SocialSyncCountdown
              onExpire={refetchAllSocial}
              resetTrigger={lastSync ? lastSync.getTime() : 0}
            />
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
            data-testid="social-manual-sync-btn"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
            {isSyncing ? "Sincronizando Social..." : "Sincronizar Agora"}
          </button>
          <button
            data-testid="social-victoria-btn"
            onClick={generateAiInsights}
            disabled={isGeneratingAi || !canUseVictoria}
            title={
              canUseVictoria
                ? "Executar diagnóstico contextual da Victoria AI"
                : "Aguardando contexto válido ou resolução de erro crítico de conexão"
            }
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer disabled:opacity-50"
          >
            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Diagnóstico Victoria AI
          </button>
        </div>
      </div>

      {/* Painel de Máquina de Estados Determinística por Fonte */}
      <div
        data-testid="social-state-machine-panel"
        className="rounded-2xl border border-white/10 bg-white/[0.015] p-3.5 space-y-2.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" />
            <span className="font-bold uppercase tracking-wider text-foreground">
              Telemetria &amp; Estado Final por Fonte
            </span>
            {isShowingCachedSnapshot && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                <Database className="h-3 w-3" /> Exibindo Último Snapshot Válido Preservado
              </span>
            )}
          </div>
          {simulatedFault && (
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 font-mono text-[11px] font-bold">
                Modo de Teste Ativo: sim_fault={simulatedFault}
              </span>
              <button
                onClick={() => {
                  setSimulatedFault(null);
                  if (typeof window !== "undefined") {
                    const url = new URL(window.location.href);
                    url.searchParams.delete("sim_fault");
                    window.history.replaceState({}, "", url.toString());
                  }
                }}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold cursor-pointer"
              >
                Limpar Simulação
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {sourceTelemetryList.map(({ telemetry, onRetry }) => {
            const badge = STATE_BADGE_META[telemetry.state] || STATE_BADGE_META.error;
            const isFailed = ["error", "permission_denied", "token_expired", "rate_limited", "partial"].includes(
              telemetry.state
            );
            return (
              <div
                key={telemetry.source}
                data-testid={`social-source-${telemetry.source}`}
                data-state={telemetry.state}
                className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 flex flex-col justify-between gap-1.5 text-[11px]"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-foreground truncate">{telemetry.label}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold uppercase shrink-0 ${badge.className}`}>
                    {telemetry.state}
                  </span>
                </div>
                <div className="text-muted-foreground font-mono text-[10px] flex items-center justify-between gap-1">
                  <span>
                    {telemetry.durationMs !== null ? `${telemetry.durationMs}ms` : telemetry.state === "loading" ? "em curso..." : "—"}
                    {" / "}
                    {Math.round(telemetry.timeoutMs / 1000)}s max
                  </span>
                  <span>{telemetry.itemCount} itens</span>
                </div>
                <div className="text-muted-foreground/80 font-mono text-[10px] flex items-center justify-between gap-1">
                  <span className="truncate">
                    {telemetry.fromCache ? "cache/snapshot" : telemetry.dataSource}
                  </span>
                  {(isFailed || telemetry.state !== "loading") && telemetry.source !== "manualSync" && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="text-primary hover:underline font-sans font-bold cursor-pointer shrink-0"
                    >
                      Tentar
                    </button>
                  )}
                </div>
                {telemetry.error && (
                  <p className="text-[10px] text-amber-300/90 line-clamp-2 leading-tight" title={telemetry.error}>
                    {telemetry.error}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Aviso honesto se não houver Token configurado ou se houver erro crítico de autenticação/permissão/rate-limit */}
      {!loadingAccounts && (!isConnected || ["token_expired", "permission_denied", "rate_limited"].includes(overallSocialState)) && (
        <div
          data-testid="social-critical-banner"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 shrink-0" />
            <div className="text-xs">
              <p className="font-bold text-amber-300">
                {overallSocialState === "token_expired"
                  ? "Token Meta expirado ou inválido (token_expired)"
                  : overallSocialState === "permission_denied"
                  ? "Permissão negada na API Meta (permission_denied)"
                  : overallSocialState === "rate_limited"
                  ? "Limite de requisições da API Meta atingido (rate_limited)"
                  : "Conexão Meta necessária para exibir métricas reais"}
              </p>
              <p className="text-muted-foreground">
                {overviewTelemetry.error ||
                  postsTelemetry.error ||
                  liveAccountsData?.error ||
                  "Configure seu Token Master em Configurações → Integrações Master."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                void refetchAccounts();
                void refetchAllSocial();
              }}
              className="shrink-0 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold uppercase cursor-pointer"
            >
              Tentar Novamente
            </button>
            <Link
              to="/config"
              className="shrink-0 px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold uppercase hover:opacity-90"
            >
              Ir para Integrações
            </Link>
          </div>
        </div>
      )}

      {/* Filtros de Escopo */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-white/5 bg-white/[0.01] rounded-2xl">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Conta Conectada:</span>
          <select
            data-testid="social-account-selector"
            value={selectedPage}
            onChange={(e) => {
              const nextVal = e.target.value;
              setSelectedPage(nextVal);
              setAiReport(null);
              setSelectedPostDetail(null);
              setVisiblePostsLimit(INITIAL_VISIBLE_POSTS);
            }}
            className="rounded-xl border border-white/10 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary/50 font-bold max-w-[360px]"
          >
            <option value="all">
              {loadingAccounts
                ? "Consolidado — Carregando contas conectadas..."
                : `Principais Contas Conectadas (Consolidado · ${activePages.length} contas)`}
            </option>
            {activePages.map((sp) => (
              <option key={sp.page_id} value={sp.page_id}>
                {sp.page_name}
                {sp.instagram_handle
                  ? ` (@${sp.instagram_handle} · ${sp.instagram_followers.toLocaleString("pt-BR")} seg)`
                  : ` (Somente FB · ${sp.facebook_followers} seg)`}
              </option>
            ))}
          </select>
          {fetchingOverview && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando visão geral Meta...
            </span>
          )}
          {fetchingPosts && (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-cyan-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando publicações...
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Janela de Análise:</span>
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
          />
        </div>
      </div>

      {/* Diagnóstico Explícito da Conta, Rede, Janela e Estado de API */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-foreground font-bold" data-testid="social-selected-scope-label">
            {loadingAccounts
              ? "Carregando contas conectadas da Meta..."
              : selectedAccountObj
              ? `${selectedAccountObj.page_name} (FB ID: ${selectedAccountObj.page_id}${
                  selectedAccountObj.instagram_account_id
                    ? ` · IG ID: ${selectedAccountObj.instagram_account_id}`
                    : " · Sem Instagram vinculado"
                })`
              : activePages.length > 0
              ? `Consolidado (${targetAccountsList.length} contas conectadas)`
              : "Nenhuma conta conectada"}
          </span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 border border-primary/25 text-primary font-bold text-[11px]">
            {networkModeLabel}
          </span>
          <span className="text-muted-foreground font-mono text-[11px]">
            Janela: {overviewQueryData?.windowUsed?.dateFrom || dateFrom} → {overviewQueryData?.windowUsed?.dateTo || dateTo} ({overviewQueryData?.chartWindowDays || chartDaysWindow}d série)
          </span>
          {effectiveSnapshotIso && (
            <span className="text-muted-foreground font-mono text-[11px]">
              Snapshot: {format(parseISO(effectiveSnapshotIso), "dd/MM HH:mm:ss")}
              {isShowingCachedSnapshot ? " (último snapshot válido preservado)" : ""}
            </span>
          )}
        </div>
        {(overviewErrorState || followersErrorState || postsErrorState || allEndpointLogs.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-amber-300 font-semibold">
              {allEndpointLogs[0]
                ? `${allEndpointLogs[0].accountName} (${allEndpointLogs[0].endpoint}): ${allEndpointLogs[0].message}`
                : "Falha parcial em endpoints Meta — exibindo dados disponíveis."}
            </span>
            <button
              onClick={() => void refetchAllSocial()}
              className="px-2.5 py-1 rounded-lg bg-primary/20 border border-primary/30 text-primary font-bold hover:bg-primary/30 cursor-pointer"
            >
              Tentar novamente
            </button>
          </div>
        )}
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
          <p className={`${reachDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {reachDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-2">
            <span className="text-muted-foreground truncate">
              {reachDisplay.statusText || "Contas únicas"}
            </span>
            {reachDisplay.isError ? (
              <button onClick={() => void refetchOverview()} className="text-primary font-bold hover:underline cursor-pointer shrink-0">
                Tentar
              </button>
            ) : kpis.reachDeltaPct !== null ? (
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
          <p className={`${viewsDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {viewsDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-1">
            {viewsDisplay.statusText ? (
              <span className="text-muted-foreground truncate">{viewsDisplay.statusText}</span>
            ) : (
              <>
                <span className="text-muted-foreground">IG: {fieldAvail.viewsIg === "unavailable" ? "Indisponível" : kpis.viewsIg.toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground">FB: {fieldAvail.viewsFb === "unavailable" ? "Indisponível" : kpis.viewsFb.toLocaleString("pt-BR")}</span>
              </>
            )}
          </div>
        </motion.div>

        {/* 3. Interações */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-pink-500 to-rose-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Interações</span>
            <ThumbsUp className="h-4 w-4 text-pink-400" />
          </div>
          <p className={`${interactionsDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {interactionsDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-1">
            {interactionsDisplay.statusText ? (
              <span className="text-muted-foreground truncate">{interactionsDisplay.statusText}</span>
            ) : (
              <>
                <span className="text-muted-foreground">Engajadas: {kpis.accountsEngaged.toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground">FB: {fieldAvail.interactionsFb === "unavailable" ? "Indisponível" : kpis.interactionsFb.toLocaleString("pt-BR")}</span>
              </>
            )}
          </div>
        </motion.div>

        {/* 4. Seguidores Reais */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Seguidores Reais</span>
            <UserPlus className="h-4 w-4 text-cyan-400" />
          </div>
          <p className={`${followersDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {followersDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-1">
            {followersDisplay.statusText ? (
              <span className="text-muted-foreground truncate">{followersDisplay.statusText}</span>
            ) : (
              <>
                <span className="text-cyan-400 font-bold">
                  {totalNewFollowersAll >= 0 ? `+${totalNewFollowersAll.toLocaleString("pt-BR")}` : totalNewFollowersAll.toLocaleString("pt-BR")} no período
                </span>
                <span className="text-muted-foreground">IG {kpis.followersIg.toLocaleString("pt-BR")} · FB {kpis.followersFb.toLocaleString("pt-BR")}</span>
              </>
            )}
          </div>
        </motion.div>

        {/* 5. Cliques na Bio */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Cliques no Site</span>
            <Globe className="h-4 w-4 text-emerald-400" />
          </div>
          <p className={`${websiteDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {websiteDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-1">
            {websiteDisplay.statusText ? (
              <span className="text-muted-foreground truncate">{websiteDisplay.statusText}</span>
            ) : (
              <>
                <span className="text-muted-foreground">CTR Perfil: {bioCtr}%</span>
                <span className="text-muted-foreground">Bio / Link</span>
              </>
            )}
          </div>
        </motion.div>

        {/* 6. Visitas ao Perfil */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-panel p-4 space-y-2 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-purple-500 to-pink-500" />
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-bold uppercase tracking-wider">Visitas Perfil IG</span>
            <Users className="h-4 w-4 text-purple-400" />
          </div>
          <p className={`${profileDisplay.isUnavailable ? "text-xs text-amber-300" : "text-2xl text-white"} font-bold tracking-tight`}>
            {profileDisplay.main}
          </p>
          <div className="flex items-center justify-between text-xs pt-1 gap-1">
            {profileDisplay.statusText ? (
              <span className="text-muted-foreground truncate">{profileDisplay.statusText}</span>
            ) : (
              <>
                <span className="text-muted-foreground">No período filtrado</span>
                <span className="text-muted-foreground">{hasAnyInstagramTarget ? "Instagram" : "Somente Facebook"}</span>
              </>
            )}
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
              <div className="h-full rounded-2xl border border-dashed border-white/10 flex flex-col items-center justify-center text-center p-6 space-y-2.5">
                <BarChart3 className="h-7 w-7 text-muted-foreground/40" />
                <p className="text-xs font-bold text-foreground">
                  {overviewInitialLoading
                    ? "Carregando série histórica real da Meta..."
                    : overviewErrorState
                    ? "Não foi possível carregar — tentar novamente"
                    : !hasAnyInstagramTarget && (chartMetric === "reachIg" || chartMetric === "newFollowers")
                    ? "Indisponível pela API Meta (conta sem Instagram Business conectado)"
                    : `0 no período selecionado para "${chartMetricMeta[chartMetric].label}" (últimos ${chartDaysWindow} dias)`}
                </p>
                <p className="text-[11px] text-muted-foreground max-w-md">
                  {overviewErrorState
                    ? (sectionStates?.dailySeries.message || sectionStates?.accountInsights.message || "Falha ao consultar a série diária na Meta Graph API.")
                    : "Alterne a métrica acima ou selecione outra conta conectada."}
                </p>
                {overviewErrorState && (
                  <button
                    onClick={() => void refetchOverview()}
                    className="px-3 py-1.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 cursor-pointer"
                  >
                    Tentar novamente
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Funil de Conversão Social Real */}
        <div className="lg:col-span-4 glass-panel p-5 flex flex-col justify-between" data-testid="social-funnel-panel">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Funil de Conversão Social</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {hasAnyInstagramTarget
                ? "Fluxo real da exposição até o clique no link da bio."
                : "Fluxo real de visualizações e engajamento da Página do Facebook."}
            </p>
          </div>

          {overviewInitialLoading ? (
            <div className="my-4 flex-1 flex flex-col items-center justify-center text-center gap-2 rounded-xl border border-dashed border-white/10 p-6">
              <Loader2 className="h-5 w-5 text-primary animate-spin" />
              <p className="text-xs font-bold text-foreground">Carregando funil social...</p>
            </div>
          ) : overviewErrorState ? (
            <div className="my-4 flex-1 flex flex-col items-center justify-center text-center gap-2 rounded-xl border border-dashed border-amber-500/20 bg-amber-500/[0.03] p-6">
              <AlertCircle className="h-5 w-5 text-amber-400" />
              <p className="text-xs font-bold text-foreground">Funil indisponível</p>
              <p className="text-[11px] text-muted-foreground">
                {overviewQueryData?.sectionStates?.accountInsights?.message || "Não foi possível carregar os dados do funil."}
              </p>
            </div>
          ) : (
            <>
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
                {hasAnyInstagramTarget ? (
                  <>
                    <span className="text-primary font-bold">Resumo Real:</span>{" "}
                    <strong className="text-white">{kpis.profileViews.toLocaleString("pt-BR")}</strong> visitas ao perfil converteram{" "}
                    <strong className="text-white">{kpis.websiteClicks.toLocaleString("pt-BR")}</strong> cliques no site (
                    <strong className="text-emerald-400">{bioCtr}%</strong> CTR).
                  </>
                ) : (
                  <>
                    <span className="text-primary font-bold">Resumo Facebook:</span>{" "}
                    <strong className="text-white">{kpis.viewsFb.toLocaleString("pt-BR")}</strong> visualizações geraram{" "}
                    <strong className="text-white">{kpis.interactionsFb.toLocaleString("pt-BR")}</strong> interações na página.
                  </>
                )}
              </div>
            </>
          )}
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
                Amostra real:{" "}
                <strong className="text-foreground font-mono">
                  {postsInitialLoading || postsErrorState
                    ? "—"
                    : postsQueryData?.heatmapSampleSize ?? postsQueryData?.posts?.length ?? 0}
                </strong>{" "}
                publicações carregadas na janela selecionada (sem valores simulados).
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
              {postsInitialLoading
                ? "Carregando publicações para mapear os melhores horários..."
                : postsErrorState
                ? "Mapa de calor indisponível devido à falha na consulta de publicações."
                : "Ainda não há publicações reais carregadas para mapear os melhores horários desta conta."}
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
              <p className="text-xs font-bold text-foreground">
                {!hasAnyInstagramTarget
                  ? "Conta sem Instagram Business vinculado"
                  : overviewInitialLoading
                  ? "Carregando demográficos..."
                  : "Sem demográficos liberados pela Meta"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {!hasAnyInstagramTarget
                  ? "Esta página opera exclusivamente no Facebook. O endpoint follower_demographics aplica-se apenas a contas Instagram Business."
                  : "A Meta API libera gênero e faixa etária apenas para contas do Instagram com pelo menos 100 seguidores ativos nesta janela."}
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
        data-testid="social-victoria-panel"
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
                <p className="font-bold text-white text-sm mt-0.5 font-mono">
                  {overviewInitialLoading || overviewErrorState ? "—" : totalFollowersAll.toLocaleString("pt-BR")}
                </p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Posts Reais Carregados</span>
                <p className="font-bold text-white text-sm mt-0.5 font-mono">
                  {postsInitialLoading || postsErrorState ? "—" : listPosts.length}
                </p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">Público Masculino / Fem.</span>
                <p className="font-bold text-white text-sm mt-0.5 font-mono">
                  {demographics.available ? `${demographics.gender.male}% / ${demographics.gender.female}%` : "—"}
                </p>
              </div>
              <div className="bg-black/20 p-3 rounded-xl border border-white/5">
                <span className="text-[11px] text-muted-foreground uppercase font-bold">CTR Link na Bio</span>
                <p className="font-bold text-emerald-400 text-sm mt-0.5 font-mono">
                  {overviewInitialLoading || overviewErrorState || !hasAnyInstagramTarget ? "—" : `${bioCtr}%`}
                </p>
              </div>
            </div>
          ) : aiReport ? (
            <div className="prose prose-invert prose-sm max-w-none text-xs leading-relaxed">
              <ReactMarkdown>{aiReport}</ReactMarkdown>
            </div>
          ) : (
            <div className="text-center py-4 space-y-3">
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                {canUseVictoria
                  ? "Clique abaixo para que a Victoria AI analise as métricas e publicações reais desta conta."
                  : overviewInitialLoading || postsInitialLoading
                  ? "Aguardando conclusão das consultas de Social Insights para liberar o diagnóstico da Victoria AI..."
                  : "Diagnóstico indisponível até que ao menos o resumo da conta ou as publicações sejam carregados com sucesso."}
              </p>
              <button
                onClick={generateAiInsights}
                disabled={isGeneratingAi || !isConnected || !canUseVictoria}
                data-testid="social-victoria-generate-btn"
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
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass-panel p-5"
        data-testid="social-posts-panel"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4 mb-4">
          <div>
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
              Publicações Reais do Feed &amp; Reels
              <span className="px-2 py-0.5 rounded-full bg-white/5 text-xs font-mono text-muted-foreground">
                {postsInitialLoading || postsErrorState ? "—" : `${listPosts.length} posts`}
              </span>
            </h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Posts reais recuperados diretamente do Instagram &amp; Facebook com métricas oficiais e pré-visualização.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Escopo Temporal de Posts: Feed Recente vs No Período */}
            <div className="flex bg-white/5 p-1 rounded-xl gap-1 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setOnlyPostsInPeriod(false)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  !onlyPostsInPeriod ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Feed Recente ({postsQueryData?.allRecentPosts?.length ?? listPosts.length})
              </button>
              <button
                type="button"
                onClick={() => setOnlyPostsInPeriod(true)}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  onlyPostsInPeriod ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                No Período ({postsQueryData?.inPeriodCount ?? 0})
              </button>
            </div>

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
          <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center space-y-2.5">
            {postsInitialLoading ? (
              <>
                <Loader2 className="h-6 w-6 text-primary animate-spin mx-auto" />
                <p className="text-xs font-bold text-foreground">Carregando publicações reais da Meta...</p>
              </>
            ) : postsErrorState ? (
              <>
                <AlertCircle className="h-7 w-7 text-amber-400 mx-auto" />
                <p className="text-xs font-bold text-foreground">Não foi possível carregar — tentar novamente</p>
                <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                  {postsQueryData?.postsState.message || "Falha ao recuperar publicações da Meta Graph API."}
                </p>
                <button
                  onClick={() => void refetchPosts()}
                  className="px-3 py-1.5 rounded-xl bg-primary/20 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/30 cursor-pointer"
                >
                  Tentar novamente
                </button>
              </>
            ) : (
              <>
                <ImageIcon className="h-7 w-7 text-muted-foreground/40 mx-auto" />
                <p className="text-xs font-bold text-foreground">
                  {postsQueryData?.postsState.state === "empty"
                    ? "0 no período selecionado (nenhuma publicação retornada pela API Meta)"
                    : "Nenhuma publicação encontrada neste filtro"}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {onlyPostsInPeriod && (postsQueryData?.allRecentPosts?.length ?? 0) > 0
                    ? `Existem ${postsQueryData?.allRecentPosts?.length} publicações recentes fora desta janela. Clique em "Feed Recente" acima para visualizá-las.`
                    : "Selecione outra conta no topo ou limpe o filtro de formato para visualizar as postagens reais da página."}
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
                {visiblePosts.map((post) => {
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

            {listPosts.length > visiblePostsLimit && (
              <div className="pt-4 mt-3 border-t border-white/5 flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11px] text-muted-foreground font-mono">
                  Exibindo {visiblePosts.length} de {listPosts.length} publicações carregadas
                </span>
                <button
                  type="button"
                  onClick={() => setVisiblePostsLimit((prev) => prev + 12)}
                  data-testid="social-load-more-posts-btn"
                  className="px-4 py-1.5 rounded-xl bg-primary/15 border border-primary/30 text-primary text-xs font-bold hover:bg-primary/25 transition-colors cursor-pointer"
                >
                  Carregar mais publicações (+{Math.min(12, listPosts.length - visiblePostsLimit)})
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
