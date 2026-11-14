import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Share2,
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Trash2,
  Edit3,
  Eye,
  Check,
  CheckCircle2,
  ExternalLink,
  Send,
  Smartphone,
  Search,
  Grid,
  Columns,
  Heart,
  MessageSquare,
  Flame,
  TrendingUp,
  BarChart3,
  Image as ImageIcon,
  Film,
  Layers,
  Sparkles,
  RefreshCw,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck,
  Award,
  Globe,
  Info,
} from "lucide-react";
import {
  format,
  parseISO,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import {
  fetchLiveSocialAccounts,
  fetchRealPlannerPosts,
  publishOrScheduleToMeta,
  deleteMetaScheduledPost,
  type PlannerPost,
  type RealSocialAccount,
  type RealIgProfileDetails,
  type BestSlotItem,
} from "@/lib/metaSocialService";

export const Route = createFileRoute("/_app/social")({
  head: () => ({ meta: [{ title: "Planejador & Feed — NC Performance" }] }),
  component: SocialMediaPage,
});

export type PostStatus = PlannerPost["status"];
export type PostPlatform = PlannerPost["platform"];
export type PostType = PlannerPost["post_type"];
export type SocialPost = PlannerPost;

function SafeMediaThumb({
  src,
  alt,
  className = "h-full w-full object-cover",
  postType,
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  postType?: PostType;
}) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center bg-muted/50 text-muted-foreground p-2">
        {postType === "reels" ? (
          <Film className="h-6 w-6 opacity-50" />
        ) : (
          <ImageIcon className="h-6 w-6 opacity-50" />
        )}
      </div>
    );
  }

  const isRawVideo = /\.(mp4|mov|webm)(\?|$)/i.test(src);
  if (isRawVideo) {
    return (
      <video
        src={src}
        className={className}
        muted
        playsInline
        preload="metadata"
        onError={() => setErrored(true)}
      />
    );
  }

  return <img src={src} alt={alt || ""} className={className} onError={() => setErrored(true)} />;
}

export default function SocialMediaPage() {
  const qc = useQueryClient();

  const [selectedPage, setSelectedPage] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"calendar" | "kanban" | "grid" | "heatmap" | "performance">("calendar");
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [filterPlatform, setFilterPlatform] = useState<"all" | "instagram" | "facebook">("all");
  const [filterType, setFilterType] = useState<"all" | PostType>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | PostStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [previewPost, setPreviewPost] = useState<SocialPost | null>(null);
  const [dayModalDate, setDayModalDate] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // 1. Busca contas reais conectadas ao Meta Graph API (/me/accounts)
  const {
    data: accountsData,
    isLoading: isLoadingAccounts,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["real-social-accounts"],
    queryFn: () => fetchLiveSocialAccounts(false),
    staleTime: 5 * 60 * 1000,
  });

  const activePages: RealSocialAccount[] = accountsData?.accounts || [];
  const masterToken = accountsData?.masterToken || null;

  const activePageObj = useMemo(() => {
    if (selectedPage === "all") return activePages[0] || null;
    return activePages.find((p) => p.page_id === selectedPage) || activePages[0] || null;
  }, [activePages, selectedPage]);

  // 2. Busca posts reais agendados no Meta + publicados no Meta (IG & FB) + fila do Supabase
  const {
    data: plannerData,
    isLoading: isLoadingPlanner,
    isFetching: isFetchingPlanner,
    refetch: refetchPlanner,
  } = useQuery({
    queryKey: ["real-planner-posts", selectedPage, activePages.length, Boolean(masterToken)],
    enabled: !isLoadingAccounts,
    queryFn: () =>
      fetchRealPlannerPosts({
        accounts: activePages,
        selectedPageId: selectedPage,
        masterToken,
      }),
    staleTime: 2 * 60 * 1000,
  });

  const allPosts = plannerData?.posts || [];
  const igProfile = plannerData?.igProfile || null;
  const heatmapMatrix = plannerData?.heatmapMatrix || Array.from({ length: 7 }, () => Array(24).fill(0));
  const hasPostsForHeatmap = plannerData?.hasPostsForHeatmap || false;
  const topTimeSlots = plannerData?.topTimeSlots || [];

  const filteredPosts = useMemo(() => {
    return allPosts.filter((post) => {
      if (filterPlatform !== "all" && post.platform !== filterPlatform && post.platform !== "both") {
        return false;
      }
      if (filterType !== "all" && post.post_type !== filterType) {
        return false;
      }
      if (filterStatus !== "all" && post.status !== filterStatus) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const inTitle = post.title?.toLowerCase().includes(q);
        const inContent = post.content?.toLowerCase().includes(q);
        const inAcc = post.account_name?.toLowerCase().includes(q) || post.account_handle?.toLowerCase().includes(q);
        if (!inTitle && !inContent && !inAcc) return false;
      }
      return true;
    });
  }, [allPosts, filterPlatform, filterType, filterStatus, searchQuery]);

  const stats = useMemo(() => {
    const published = allPosts.filter((p) => p.status === "published");
    const scheduled = allPosts.filter((p) => p.status === "scheduled");
    const pending = allPosts.filter((p) => p.status === "pending_approval");
    const drafts = allPosts.filter((p) => p.status === "draft");

    const totalReach = published.reduce((acc, p) => acc + (p.reach_count || 0), 0);
    const totalLikes = published.reduce((acc, p) => acc + (p.likes_count || 0), 0);
    const totalComments = published.reduce((acc, p) => acc + (p.comments_count || 0), 0);
    const totalInteractions = published.reduce(
      (acc, p) => acc + (p.likes_count || 0) + (p.comments_count || 0) + (p.shares_count || 0) + (p.saves_count || 0),
      0
    );
    const avgEngRate = totalReach > 0 ? (totalInteractions / totalReach) * 100 : 0;

    return {
      publishedCount: published.length,
      scheduledCount: scheduled.length,
      metaScheduledCount: plannerData?.metaScheduledCount || 0,
      pendingCount: pending.length,
      draftsCount: drafts.length,
      totalReach,
      totalLikes,
      totalComments,
      avgEngRate: avgEngRate.toFixed(1),
    };
  }, [allPosts, plannerData?.metaScheduledCount]);

  const handleSyncSocial = async () => {
    setIsSyncing(true);
    try {
      await refetchAccounts();
      await refetchPlanner();
      toast.success("Planejador sincronizado com publicações e agendamentos reais da Meta API!");
    } catch (err: any) {
      toast.error(`Erro ao sincronizar: ${err?.message || "Tente novamente."}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePublishNow = async (post: SocialPost) => {
    const account =
      activePages.find((p) => p.page_id === post.page_id) ||
      activePageObj ||
      activePages[0];
    if (!account || !masterToken) {
      toast.error("Token Master da Meta ou conta vinculada não encontrados.");
      return;
    }

    const toastId = toast.loading("Publicando diretamente no Meta Graph API...");
    try {
      const res = await publishOrScheduleToMeta({
        account,
        masterToken,
        platform: post.platform,
        postType: post.post_type,
        content: post.content,
        mediaUrl: post.media_url,
        publishImmediately: true,
      });

      if (res.metaPostIds.length === 0) {
        throw new Error(res.errors.join(" | ") || "A Meta API não retornou ID da publicação.");
      }

      if (post.source === "supabase") {
        await (supabase as any)
          .from("social_posts")
          .update({
            status: "published",
            published_at: new Date().toISOString(),
            meta_post_id: res.metaPostIds.join(","),
            error_message: res.errors.length > 0 ? res.errors.join(" | ") : null,
          })
          .eq("id", post.id);
      }

      if (res.errors.length > 0) {
        toast.warning(`Publicado parcialmente (${res.errors.join(" | ")})`, { id: toastId });
      } else {
        toast.success("Publicação enviada com sucesso para as redes reais!", { id: toastId });
      }
      refetchPlanner();
    } catch (err: any) {
      toast.error(`Falha ao publicar na Meta: ${err?.message}`, { id: toastId });
    }
  };

  const handleDeletePost = async (post: SocialPost) => {
    if (post.source === "meta_live" && post.status === "published") {
      toast.info("Posts já publicados no Instagram/Facebook não podem ser apagados pelo Planejador. Gerencie diretamente no app da Meta.");
      return;
    }

    const label =
      post.source === "meta_live"
        ? "Cancelar este post agendado diretamente no Facebook/Meta?"
        : "Tem certeza que deseja excluir esta publicação do Planejador?";
    if (!confirm(label)) return;

    try {
      if (post.source === "meta_live" && post.meta_post_id) {
        const acc = activePages.find((a) => a.page_id === post.page_id);
        const token = acc?.access_token || masterToken;
        if (!token) throw new Error("Token da página não disponível para cancelar no Meta.");
        const delRes = await deleteMetaScheduledPost(post.meta_post_id, token);
        if (!delRes.ok) throw new Error(delRes.error || "Meta API recusou cancelamento.");
        toast.success("Agendamento cancelado no Meta!");
      } else {
        // Se também tiver agendamento nativo vinculado no Facebook, tenta cancelar no Meta também
        if (post.status === "scheduled" && post.meta_post_id) {
          const acc = activePages.find((a) => a.page_id === post.page_id);
          const token = acc?.access_token || masterToken;
          if (token) {
            await deleteMetaScheduledPost(post.meta_post_id.split(",")[0], token);
          }
        }
        const { error } = await supabase.from("social_posts").delete().eq("id", post.id);
        if (error) throw error;
        toast.success("Publicação removida do Planejador.");
      }
      refetchPlanner();
      qc.invalidateQueries({ queryKey: ["real-planner-posts"] });
    } catch (err: any) {
      toast.error(`Erro ao remover: ${err.message}`);
    }
  };

  const handleStatusChange = async (post: SocialPost, newStatus: PostStatus) => {
    if (post.source === "meta_live") {
      toast.info("Status deste post é sincronizado diretamente da Meta API.");
      return;
    }
    try {
      const { error } = await supabase
        .from("social_posts")
        .update({ status: newStatus })
        .eq("id", post.id);
      if (error) throw error;
      toast.success(`Status alterado para ${getStatusLabel(newStatus)}`);
      refetchPlanner();
    } catch {
      toast.error("Erro ao atualizar status");
    }
  };

  const openNewPostForDate = (date: Date, hour = 12) => {
    const dt = new Date(date);
    dt.setHours(hour, 0, 0, 0);
    setEditingPost({
      id: "",
      title: "",
      content: "",
      post_type: "feed",
      status: "scheduled",
      platform: "instagram",
      scheduled_at: dt.toISOString(),
      likes_count: 0,
      comments_count: 0,
      reach_count: 0,
      impressions_count: 0,
      created_at: new Date().toISOString(),
      source: "supabase",
    });
    setIsCreateModalOpen(true);
  };

  const dayModalPosts = useMemo(() => {
    if (!dayModalDate) return [];
    const targetKey = format(dayModalDate, "yyyy-MM-dd");
    return filteredPosts
      .filter((p) => {
        const d = p.status === "scheduled" ? p.scheduled_at || p.created_at : p.published_at || p.scheduled_at || p.created_at;
        if (!d) return false;
        try {
          return format(new Date(d), "yyyy-MM-dd") === targetKey;
        } catch {
          return false;
        }
      })
      .sort((a, b) => {
        const ta = new Date(a.scheduled_at || a.published_at || a.created_at).getTime();
        const tb = new Date(b.scheduled_at || b.published_at || b.created_at).getTime();
        return ta - tb;
      });
  }, [dayModalDate, filteredPosts]);

  return (
    <div className="space-y-6 pb-20">
      {/* ─── HEADER EXECUTIVO DE SOCIAL MEDIA ─── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-pink-500 to-rose-500 flex items-center justify-center text-white shadow-lg shadow-pink-500/20">
              <Share2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
                Planejador & Feed
                <span className="text-[10px] font-bold uppercase tracking-widest bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                  Meta API v21.0 Real
                </span>
              </h1>
              <p className="text-xs text-muted-foreground">
                Agendamentos reais da Meta, histórico de publicações por data, grade 3x3 e publicação direta.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative">
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="bg-card border border-border/80 text-foreground text-xs font-bold rounded-xl px-3 py-2 pr-8 appearance-none focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer hover:border-primary/50 transition shadow-sm min-w-[220px]"
            >
              <option value="all">Todas as Contas ({activePages.length})</option>
              {activePages.map((page) => (
                <option key={page.page_id} value={page.page_id}>
                  {page.page_name} {page.instagram_handle ? `(@${page.instagram_handle})` : "(FB)"}
                </option>
              ))}
            </select>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none" />
          </div>

          <button
            onClick={handleSyncSocial}
            disabled={isSyncing || isFetchingPlanner}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition shadow-sm cursor-pointer disabled:opacity-50"
            title="Recarregar posts agendados e publicados direto da Meta Graph API"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing || isFetchingPlanner ? "animate-spin text-primary" : ""}`} />
            <span className="hidden sm:inline">Sincronizar Meta</span>
          </button>

          <Link
            to="/social-insights"
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-card hover:bg-muted border border-border text-xs font-bold text-muted-foreground hover:text-foreground transition shadow-sm"
          >
            <BarChart3 className="h-3.5 w-3.5 text-pink-500" />
            <span className="hidden md:inline">Insights Meta</span>
          </Link>

          <button
            onClick={() => {
              setEditingPost(null);
              setIsCreateModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-pink-500/25 transition-all transform active:scale-95 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Criar Publicação</span>
          </button>
        </div>
      </div>

      {/* ─── AVISO DE CONEXÃO / LIMITAÇÃO TRANSPARENTE ─── */}
      {(accountsData?.error || plannerData?.errorMessage) && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 flex items-center gap-2">
          <Info className="h-4 w-4 shrink-0 text-amber-400" />
          <span>{accountsData?.error || plannerData?.errorMessage}</span>
        </div>
      )}

      {/* ─── BARRA DE KPIS REAIS ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="glass-panel p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Agendados (Meta + Fila)</span>
            <Clock className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
            {isLoadingPlanner ? "..." : stats.scheduledCount}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {stats.metaScheduledCount} no Facebook + fila NC Suite • {stats.pendingCount} pendente(s) (IG nativo não listado pela API)
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Publicados Carregados</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
            {isLoadingPlanner ? "..." : stats.publishedCount}
          </div>
          <p className="text-[10px] text-emerald-500 font-semibold mt-0.5">
            {stats.totalLikes.toLocaleString("pt-BR")} curtidas e {stats.totalComments.toLocaleString("pt-BR")} coment.
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Taxa Real de Engaj.</span>
            <Flame className="h-4 w-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
            {isLoadingPlanner ? "..." : `${stats.avgEngRate}%`}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Interações / alcance real nos posts
          </p>
        </div>

        <div className="glass-panel p-4 rounded-2xl border border-border/60 bg-card/60 backdrop-blur-md">
          <div className="flex items-center justify-between text-muted-foreground mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider">Alcance nas Amostras IG</span>
            <Eye className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl sm:text-2xl font-bold font-mono text-foreground">
            {isLoadingPlanner ? "..." : stats.totalReach.toLocaleString("pt-BR")}
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Soma de alcance real das mídias
          </p>
        </div>
      </div>

      {/* ─── NAVEGAÇÃO DE ABAS & FILTROS ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
          <button
            onClick={() => setViewMode("calendar")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "calendar"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            <span>Calendário Editorial</span>
          </button>

          <button
            onClick={() => setViewMode("kanban")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "kanban"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Columns className="h-3.5 w-3.5" />
            <span>Pipeline Kanban</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">{allPosts.length}</span>
          </button>

          <button
            onClick={() => setViewMode("grid")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "grid"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Grid className="h-3.5 w-3.5" />
            <span>Feed Planner 3x3</span>
          </button>

          <button
            onClick={() => setViewMode("heatmap")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "heatmap"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            <span>Melhores Horários</span>
          </button>

          <button
            onClick={() => setViewMode("performance")}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              viewMode === "performance"
                ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Top Performance</span>
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar posts ou contas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-card border border-border/80 text-foreground text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary w-40 sm:w-48"
            />
          </div>

          <select
            value={filterPlatform}
            onChange={(e: any) => setFilterPlatform(e.target.value)}
            className="bg-card border border-border/80 text-foreground text-xs font-bold rounded-xl px-2.5 py-1.5 appearance-none focus:outline-none cursor-pointer"
          >
            <option value="all">Redes: Todas</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e: any) => setFilterStatus(e.target.value)}
            className="bg-card border border-border/80 text-foreground text-xs font-bold rounded-xl px-2.5 py-1.5 appearance-none focus:outline-none cursor-pointer"
          >
            <option value="all">Status: Todos</option>
            <option value="scheduled">Agendados</option>
            <option value="published">Publicados</option>
            <option value="pending_approval">Em Aprovação</option>
            <option value="draft">Rascunhos</option>
          </select>

          <select
            value={filterType}
            onChange={(e: any) => setFilterType(e.target.value)}
            className="bg-card border border-border/80 text-foreground text-xs font-bold rounded-xl px-2.5 py-1.5 appearance-none focus:outline-none cursor-pointer hidden md:block"
          >
            <option value="all">Formato: Todos</option>
            <option value="feed">Feed</option>
            <option value="reels">Reels</option>
            <option value="stories">Stories</option>
            <option value="carousel">Carrossel</option>
          </select>
        </div>
      </div>

      {/* ─── RENDERIZAÇÃO DA ABA ATIVA ─── */}
      <AnimatePresence mode="wait">
        {viewMode === "calendar" && (
          <motion.div
            key="calendar"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <EditorialCalendarView
              currentDate={calendarDate}
              onDateChange={setCalendarDate}
              posts={filteredPosts}
              isLoading={isLoadingAccounts || isLoadingPlanner}
              onSelectPost={(p) => setPreviewPost(p)}
              onOpenDay={(d) => setDayModalDate(d)}
              onAddPostOnDate={(date) => openNewPostForDate(date)}
            />
          </motion.div>
        )}

        {viewMode === "kanban" && (
          <motion.div
            key="kanban"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <KanbanPipelineView
              posts={filteredPosts}
              onSelectPost={(p) => setPreviewPost(p)}
              onEditPost={(p) => {
                setEditingPost(p);
                setIsCreateModalOpen(true);
              }}
              onDeletePost={handleDeletePost}
              onPublishNow={handlePublishNow}
              onStatusChange={handleStatusChange}
            />
          </motion.div>
        )}

        {viewMode === "grid" && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <InstagramFeedSimulatorView
              activePage={activePageObj}
              igProfile={igProfile}
              posts={filteredPosts}
              onSelectPost={(p) => setPreviewPost(p)}
              onNewPost={() => {
                setEditingPost(null);
                setIsCreateModalOpen(true);
              }}
            />
          </motion.div>
        )}

        {viewMode === "heatmap" && (
          <motion.div
            key="heatmap"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <BestPostingTimesHeatmapView
              matrix={heatmapMatrix}
              hasData={hasPostsForHeatmap}
              sampleSize={plannerData?.heatmapSampleSize || 0}
              topSlots={topTimeSlots}
              onScheduleAtSlot={(_dayName, hour) => openNewPostForDate(new Date(), hour)}
            />
          </motion.div>
        )}

        {viewMode === "performance" && (
          <motion.div
            key="performance"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            <PerformanceLeaderboardView posts={filteredPosts} onSelectPost={(p) => setPreviewPost(p)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── MODAL DO DIA (TODOS OS POSTS DA DATA) ─── */}
      {dayModalDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg rounded-3xl border border-border/80 bg-card p-5 sm:p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  {format(dayModalDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {dayModalPosts.length} publicação(ões) nesta data
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const d = dayModalDate;
                    setDayModalDate(null);
                    openNewPostForDate(d);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Agendar neste dia
                </button>
                <button
                  onClick={() => setDayModalDate(null)}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2.5 overflow-y-auto custom-scrollbar pr-1">
              {dayModalPosts.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Nenhum post agendado ou publicado nesta data.
                </div>
              ) : (
                dayModalPosts.map((p) => {
                  const dtRaw = p.scheduled_at || p.published_at || p.created_at;
                  const timeStr = dtRaw ? format(new Date(dtRaw), "HH:mm") : "--:--";
                  const statusColor = getStatusColor(p.status);
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setDayModalDate(null);
                        setPreviewPost(p);
                      }}
                      className="flex items-center gap-3 p-3 rounded-2xl border border-border/70 bg-background/60 hover:border-primary/50 cursor-pointer transition"
                    >
                      <div className="h-14 w-14 rounded-xl overflow-hidden bg-muted shrink-0">
                        <SafeMediaThumb src={p.thumbnail_url || p.media_url} alt={p.title} postType={p.post_type} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[11px] font-bold uppercase px-2 py-0.5 rounded-full ${statusColor.badge}`}>
                            {getStatusLabel(p.status)}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground">{timeStr}</span>
                          <span className="text-[11px] font-bold uppercase text-primary">
                            {p.platform === "instagram" ? "IG" : p.platform === "facebook" ? "FB" : "IG+FB"} • {p.post_type}
                          </span>
                          {p.account_handle && (
                            <span className="text-[10px] text-muted-foreground truncate">
                              @{p.account_handle.replace(/^@/, "")}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-foreground truncate mt-1">{p.title}</p>
                        <p className="text-[11px] text-muted-foreground line-clamp-1">{p.content}</p>
                      </div>
                      <div className="text-right text-[10px] font-mono text-muted-foreground shrink-0">
                        {p.status === "published" && (
                          <>
                            <div>❤️ {p.likes_count}</div>
                            <div>💬 {p.comments_count}</div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL DE CRIAÇÃO / EDIÇÃO DE POST (MONTADO CONDICIONALMENTE COM KEY) ─── */}
      {isCreateModalOpen && (
        <CreatePostModal
          key={editingPost?.id || editingPost?.scheduled_at || "new-post"}
          onClose={() => {
            setIsCreateModalOpen(false);
            setEditingPost(null);
          }}
          initialPost={editingPost}
          activePages={activePages}
          selectedPage={selectedPage}
          masterToken={masterToken}
          onSaveSuccess={() => {
            setIsCreateModalOpen(false);
            setEditingPost(null);
            refetchPlanner();
          }}
        />
      )}

      {/* ─── MODAL DE VISUALIZAÇÃO INTERATIVA ─── */}
      {previewPost && (
        <DeviceMockupModal
          post={previewPost}
          page={activePages.find((p) => p.page_id === previewPost.page_id) || activePageObj}
          onClose={() => setPreviewPost(null)}
          onEdit={() => {
            setEditingPost(previewPost);
            setPreviewPost(null);
            setIsCreateModalOpen(true);
          }}
          onPublishNow={() => {
            const p = previewPost;
            setPreviewPost(null);
            handlePublishNow(p);
          }}
          onDelete={() => {
            const p = previewPost;
            setPreviewPost(null);
            handleDeletePost(p);
          }}
        />
      )}
    </div>
  );
}

// ─── ABA 1: CALENDÁRIO EDITORIAL REAL ─────────────────────────────────────────
interface CalendarViewProps {
  currentDate: Date;
  onDateChange: (d: Date) => void;
  posts: SocialPost[];
  isLoading: boolean;
  onSelectPost: (p: SocialPost) => void;
  onOpenDay: (d: Date) => void;
  onAddPostOnDate: (d: Date) => void;
}

function EditorialCalendarView({
  currentDate,
  onDateChange,
  posts,
  isLoading,
  onSelectPost,
  onOpenDay,
  onAddPostOnDate,
}: CalendarViewProps) {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDayNames = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

  const postsByDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    posts.forEach((p) => {
      const d = p.status === "scheduled" ? p.scheduled_at || p.created_at : p.published_at || p.scheduled_at || p.created_at;
      if (!d) return;
      try {
        const dt = new Date(d);
        if (isNaN(dt.getTime())) return;
        const key = format(dt, "yyyy-MM-dd");
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      } catch {
        // ignora data inválida
      }
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const ta = new Date(a.scheduled_at || a.published_at || a.created_at).getTime();
        const tb = new Date(b.scheduled_at || b.published_at || b.created_at).getTime();
        return ta - tb;
      });
    });
    return map;
  }, [posts]);

  return (
    <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-border/80 bg-card space-y-4">
      {/* Controles de Mês e Legenda */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base sm:text-lg font-bold uppercase tracking-wider text-foreground">
            {format(currentDate, "MMMM 'de' yyyy", { locale: ptBR })}
          </h2>
          <button
            onClick={() => onDateChange(new Date())}
            className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition cursor-pointer"
          >
            Hoje
          </button>
          {isLoading && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              Buscando da Meta...
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> Publicado
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-cyan-500" /> Agendado (Meta / Fila)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-purple-500" /> Aprovação
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> Rascunho
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onDateChange(subMonths(currentDate, 1))}
              className="p-2 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDateChange(addMonths(currentDate, 1))}
              className="p-2 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Nota técnica transparente sobre Instagram Scheduled API */}
      <div className="text-[11px] text-muted-foreground bg-muted/30 border border-border/50 rounded-xl px-3 py-2 flex items-center gap-2">
        <Info className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
        <span>
          Exibindo publicações reais do Instagram + Facebook e posts agendados nativamente nas Páginas da Meta. Posts agendados exclusivamente para Instagram pelo Meta Business Suite não são expostos pela API pública do Instagram, mas qualquer post criado/agendado aqui fica registrado por data.
        </span>
      </div>

      {/* Grid de Dias da Semana */}
      <div className="grid grid-cols-7 gap-2">
        {weekDayNames.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold text-muted-foreground py-1 tracking-widest">
            {d}
          </div>
        ))}
      </div>

      {/* Grid do Mês */}
      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {calendarDays.map((day, idx) => {
          const dateKey = format(day, "yyyy-MM-dd");
          const dayPosts = postsByDate.get(dateKey) || [];
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isCurrentDay = isToday(day);

          return (
            <div
              key={idx}
              className={`group relative min-h-[100px] sm:min-h-[125px] p-2 rounded-xl border transition-all flex flex-col justify-between ${
                isCurrentDay
                  ? "border-primary bg-primary/[0.04] shadow-sm"
                  : isCurrentMonth
                  ? "border-border/60 bg-card/60 hover:border-border hover:bg-muted/40"
                  : "border-border/20 bg-muted/10 opacity-40"
              }`}
            >
              <div className="flex items-center justify-between">
                <button
                  onClick={() => dayPosts.length > 0 && onOpenDay(day)}
                  className={`text-xs font-bold font-mono h-6 w-6 rounded-lg flex items-center justify-center ${
                    isCurrentDay
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground"
                  } ${dayPosts.length > 0 ? "cursor-pointer hover:ring-1 hover:ring-primary/50" : ""}`}
                >
                  {format(day, "d")}
                </button>

                <button
                  onClick={() => onAddPostOnDate(day)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded-md bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground transition-all cursor-pointer"
                  title="Agendar post nesta data"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>

              <div className="space-y-1 mt-1.5 overflow-hidden flex-1">
                {dayPosts.slice(0, 3).map((post) => {
                  const statusColor = getStatusColor(post.status);
                  const typeIcon = getTypeIcon(post.post_type);
                  const dtRaw = post.scheduled_at || post.published_at || post.created_at;
                  const timeStr = dtRaw ? format(new Date(dtRaw), "HH:mm") : "";

                  return (
                    <div
                      key={post.id}
                      onClick={() => onSelectPost(post)}
                      title={`${timeStr} • ${post.account_handle || post.account_name || ""} • ${post.title}`}
                      className="p-1.5 rounded-lg border border-border/80 bg-background/80 hover:border-primary/50 hover:bg-card transition-all cursor-pointer text-left shadow-xs flex items-center gap-1.5 min-w-0"
                    >
                      <div className={`h-2 w-2 rounded-full shrink-0 ${statusColor.dot}`} />
                      <span className="text-[11px] font-mono text-muted-foreground shrink-0">{timeStr}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{typeIcon}</span>
                      <p className="text-[10px] font-bold text-foreground truncate min-w-0">
                        {post.title || post.content.slice(0, 24)}
                      </p>
                    </div>
                  );
                })}

                {dayPosts.length > 3 && (
                  <button
                    onClick={() => onOpenDay(day)}
                    className="w-full text-[11px] font-bold text-primary text-center py-0.5 cursor-pointer hover:underline"
                  >
                    +{dayPosts.length - 3} mais nesta data
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── ABA 2: PIPELINE KANBAN ───────────────────────────────────────────────────
interface KanbanViewProps {
  posts: SocialPost[];
  onSelectPost: (p: SocialPost) => void;
  onEditPost: (p: SocialPost) => void;
  onDeletePost: (p: SocialPost) => void;
  onPublishNow: (p: SocialPost) => void;
  onStatusChange: (p: SocialPost, s: PostStatus) => void;
}

function KanbanPipelineView({
  posts,
  onSelectPost,
  onEditPost,
  onDeletePost,
  onPublishNow,
  onStatusChange,
}: KanbanViewProps) {
  const columns: { id: PostStatus; label: string; icon: any; color: string }[] = [
    { id: "draft", label: "Ideias & Rascunhos", icon: Edit3, color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
    { id: "pending_approval", label: "Em Aprovação", icon: ShieldCheck, color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
    { id: "scheduled", label: "Agendados (Meta / Fila)", icon: Clock, color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
    { id: "published", label: "Publicados", icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {columns.map((col) => {
        const colPosts = posts.filter((p) => p.status === col.id);

        return (
          <div
            key={col.id}
            className="flex flex-col rounded-2xl border border-border/80 bg-card/60 backdrop-blur-md p-3.5 min-h-[500px] max-h-[75vh]"
          >
            <div className="flex items-center justify-between pb-3 border-b border-border/60 mb-3">
              <div className="flex items-center gap-2">
                <span className={`p-1.5 rounded-lg border ${col.color}`}>
                  <col.icon className="h-3.5 w-3.5" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  {col.label}
                </span>
              </div>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                {colPosts.length}
              </span>
            </div>

            <div className="space-y-3 flex-1 overflow-y-auto custom-scrollbar pr-1">
              {colPosts.map((post) => (
                <div
                  key={post.id}
                  className="group relative p-3 rounded-xl border border-border/80 bg-background hover:border-primary/50 hover:shadow-md transition-all space-y-2.5"
                >
                  {(post.thumbnail_url || post.media_url) && (
                    <div className="relative h-28 w-full rounded-lg overflow-hidden bg-muted">
                      <SafeMediaThumb
                        src={post.thumbnail_url || post.media_url}
                        alt={post.title}
                        postType={post.post_type}
                        className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute top-2 left-2 flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold text-white uppercase">
                        {getTypeIcon(post.post_type)}
                        <span>{post.post_type}</span>
                      </div>
                      <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/75 backdrop-blur-md px-2 py-0.5 rounded text-[11px] font-bold text-white uppercase">
                        {post.platform === "instagram" ? "IG" : post.platform === "facebook" ? "FB" : "IG + FB"}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="text-[11px] font-bold text-primary truncate">
                        {post.account_handle ? `@${post.account_handle.replace(/^@/, "")}` : post.account_name || "Conta Social"}
                      </span>
                      <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                        {post.source === "meta_live" ? "Meta Live" : "Planejador"}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                      {post.title || "Sem título"}
                    </h4>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                      {post.content || "Sem legenda"}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-border/40">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {post.scheduled_at
                        ? format(new Date(post.scheduled_at), "dd/MM 'às' HH:mm")
                        : post.published_at
                        ? format(new Date(post.published_at), "dd/MM 'às' HH:mm")
                        : "Rascunho"}
                    </span>

                    {post.status === "published" && (
                      <div className="flex items-center gap-2">
                        <span className="flex items-center gap-0.5 text-foreground">
                          <Heart className="h-2.5 w-2.5 text-rose-500 fill-rose-500" />
                          {post.likes_count}
                        </span>
                        <span className="flex items-center gap-0.5 text-foreground">
                          <MessageSquare className="h-2.5 w-2.5 text-primary" />
                          {post.comments_count}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-1">
                    <button
                      onClick={() => onSelectPost(post)}
                      className="p-1.5 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground text-[10px] font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Smartphone className="h-3 w-3" />
                      <span>Detalhes</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {post.source === "supabase" && post.status === "pending_approval" && (
                        <button
                          onClick={() => onStatusChange(post, "scheduled")}
                          className="p-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white transition cursor-pointer"
                          title="Aprovar Publicação"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}

                      {post.source === "supabase" && post.status === "scheduled" && (
                        <button
                          onClick={() => onPublishNow(post)}
                          className="px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-bold transition cursor-pointer flex items-center gap-1"
                          title="Publicar agora na Meta"
                        >
                          <Send className="h-2.5 w-2.5" />
                          <span>Publicar</span>
                        </button>
                      )}

                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition"
                          title="Abrir post no Instagram/Facebook"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}

                      {post.source === "supabase" && (
                        <button
                          onClick={() => onEditPost(post)}
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
                          title="Editar post"
                        >
                          <Edit3 className="h-3 w-3" />
                        </button>
                      )}

                      {(post.source === "supabase" || post.status === "scheduled") && (
                        <button
                          onClick={() => onDeletePost(post)}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 transition cursor-pointer"
                          title={post.source === "meta_live" ? "Cancelar agendamento na Meta" : "Excluir post"}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {colPosts.length === 0 && (
                <div className="h-40 border border-dashed border-border/80 rounded-xl flex items-center justify-center text-xs text-muted-foreground/60">
                  Nenhum post nesta etapa
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── ABA 3: INSTAGRAM FEED PLANNER REAL (GRADE 3X3) ────────────────────────────
interface FeedSimulatorProps {
  activePage: RealSocialAccount | null;
  igProfile: RealIgProfileDetails | null;
  posts: SocialPost[];
  onSelectPost: (p: SocialPost) => void;
  onNewPost: () => void;
}

function InstagramFeedSimulatorView({
  activePage,
  igProfile,
  posts,
  onSelectPost,
  onNewPost,
}: FeedSimulatorProps) {
  const feedPosts = useMemo(() => {
    return [...posts]
      .filter((p) => p.post_type !== "stories" && (p.thumbnail_url || p.media_url))
      .sort((a, b) => {
        const da = new Date(a.scheduled_at || a.published_at || a.created_at).getTime();
        const db = new Date(b.scheduled_at || b.published_at || b.created_at).getTime();
        return db - da;
      });
  }, [posts]);

  const avatarUrl = igProfile?.profile_picture_url || activePage?.profile_picture_url || null;
  const handle = igProfile?.username || activePage?.instagram_handle || activePage?.page_name || "conta_conectada";
  const displayName = igProfile?.name || activePage?.page_name || "Perfil Conectado";
  const followers = igProfile?.followers_count ?? activePage?.instagram_followers ?? activePage?.facebook_followers ?? 0;
  const following = igProfile?.follows_count;
  const mediaCount = igProfile?.media_count ?? feedPosts.length;

  return (
    <div className="max-w-3xl mx-auto glass-panel p-6 sm:p-8 rounded-3xl border border-border/80 bg-card shadow-2xl">
      <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 border-b border-border/60 pb-6 mb-6">
        <div className="relative shrink-0 p-1 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600">
          <div className="p-0.5 bg-background rounded-full h-20 w-20 sm:h-24 sm:w-24 flex items-center justify-center overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="h-full w-full rounded-full object-cover" />
            ) : (
              <ImageIcon className="h-8 w-8 text-muted-foreground" />
            )}
          </div>
        </div>

        <div className="flex-1 text-center sm:text-left space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
            <div className="flex items-center gap-2 justify-center sm:justify-start">
              <h3 className="text-base sm:text-lg font-bold text-foreground">@{handle}</h3>
            </div>

            <button
              onClick={onNewPost}
              className="px-3.5 py-1.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm"
            >
              + Planejar Post
            </button>
          </div>

          <div className="flex items-center justify-center sm:justify-start gap-6 text-xs">
            <div>
              <strong className="text-foreground font-mono">{mediaCount.toLocaleString("pt-BR")}</strong>{" "}
              <span className="text-muted-foreground">publicações</span>
            </div>
            <div>
              <strong className="text-foreground font-mono">{followers.toLocaleString("pt-BR")}</strong>{" "}
              <span className="text-muted-foreground">seguidores</span>
            </div>
            {typeof following === "number" && (
              <div>
                <strong className="text-foreground font-mono">{following.toLocaleString("pt-BR")}</strong>{" "}
                <span className="text-muted-foreground">seguindo</span>
              </div>
            )}
          </div>

          <div className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">
            <p className="font-bold text-foreground">{displayName}</p>
            {igProfile?.biography ? (
              <p className="mt-1">{igProfile.biography}</p>
            ) : (
              <p className="mt-1 italic text-muted-foreground/70">
                Selecione uma conta com Instagram Business vinculado para visualizar a biografia oficial.
              </p>
            )}
            {igProfile?.website && (
              <a
                href={igProfile.website}
                target="_blank"
                rel="noreferrer"
                className="text-primary font-semibold hover:underline inline-flex items-center gap-1 mt-1"
              >
                <Globe className="h-3 w-3" /> {igProfile.website}
              </a>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-2">
          <span>Grade Real do Feed (Agendados + Publicados)</span>
          <span className="text-primary font-mono">{feedPosts.length} itens carregados</span>
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {feedPosts.map((post) => (
            <div
              key={post.id}
              onClick={() => onSelectPost(post)}
              className="group relative aspect-square rounded-xl overflow-hidden bg-muted cursor-pointer"
            >
              <SafeMediaThumb
                src={post.thumbnail_url || post.media_url}
                alt={post.title}
                postType={post.post_type}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
              />

              <div className="absolute top-2 right-2 text-white drop-shadow-md">
                {post.post_type === "reels" && <Film className="h-4 w-4" />}
                {post.post_type === "carousel" && <Layers className="h-4 w-4" />}
              </div>

              {post.status === "scheduled" && (
                <div className="absolute top-2 left-2 bg-cyan-500/90 text-white text-[8px] font-bold uppercase px-1.5 py-0.5 rounded shadow">
                  Agendado
                </div>
              )}

              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 text-white font-bold text-xs">
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5 fill-white" />
                  {post.likes_count || 0}
                </span>
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3.5 w-3.5 fill-white" />
                  {post.comments_count || 0}
                </span>
              </div>
            </div>
          ))}

          {feedPosts.length === 0 && (
            <div className="col-span-3 py-16 text-center text-xs text-muted-foreground">
              Nenhuma publicação com mídia encontrada na conta selecionada.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ABA 4: MELHORES HORÁRIOS REAL (BASEADO NO HISTÓRICO DA CONTA) ──────────────
interface HeatmapProps {
  matrix: number[][];
  hasData: boolean;
  sampleSize?: number;
  topSlots: BestSlotItem[];
  onScheduleAtSlot: (dayName: string, hour: number) => void;
}

function BestPostingTimesHeatmapView({ matrix, hasData, sampleSize = 0, topSlots, onScheduleAtSlot }: HeatmapProps) {
  const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-border/80 bg-card space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <h3 className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Mapa de Calor Real: Horários de Maior Engajamento
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Calculado exclusivamente sobre os horários e interações reais de{" "}
            <strong className="text-foreground font-mono">{sampleSize}</strong>{" "}
            publicações carregadas da Meta (sem interpolação).
          </p>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-bold text-muted-foreground">
          <span>Sem atividade</span>
          <div className="flex items-center gap-1">
            <span className="h-3 w-4 rounded bg-muted/40" />
            <span className="h-3 w-4 rounded bg-primary/30" />
            <span className="h-3 w-4 rounded bg-primary/60" />
            <span className="h-3 w-4 rounded bg-primary" />
          </div>
          <span className="text-primary font-bold">Melhor desempenho</span>
        </div>
      </div>

      {!hasData ? (
        <div className="py-12 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-2xl">
          Ainda não há publicações com métricas na amostra selecionada para calcular o mapa de calor real.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar pb-2">
            <div className="min-w-[700px]">
              <div className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 mb-1.5 text-center text-[11px] font-mono text-muted-foreground">
                <div></div>
                {hours.map((h) => (
                  <div key={h}>{h}h</div>
                ))}
              </div>

              <div className="space-y-1.5">
                {days.map((dayName, dIdx) => (
                  <div key={dIdx} className="grid grid-cols-[80px_repeat(24,1fr)] gap-1 items-center">
                    <span className="text-xs font-bold text-foreground text-left">{dayName}</span>
                    {hours.map((h) => {
                      const ratio = matrix[dIdx]?.[h] || 0;
                      const pct = Math.round(ratio * 100);
                      return (
                        <div
                          key={h}
                          onClick={() => onScheduleAtSlot(dayName, h)}
                          title={
                            pct > 0
                              ? `${dayName} às ${h}:00 — Índice real: ${pct}% (Clique para agendar)`
                              : `${dayName} às ${h}:00 — Sem posts neste horário (Clique para agendar)`
                          }
                          className={`h-7 rounded transition-all cursor-pointer hover:scale-110 hover:ring-2 hover:ring-primary flex items-center justify-center ${
                            pct >= 80
                              ? "bg-primary text-primary-foreground font-bold text-[11px]"
                              : pct >= 55
                              ? "bg-primary/60"
                              : pct > 0
                              ? "bg-primary/30"
                              : "bg-muted/40"
                          }`}
                        >
                          {pct >= 85 ? "★" : ""}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {topSlots.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-border/60">
              {topSlots.map((slot, i) => (
                <div
                  key={`${slot.dayIdx}-${slot.hour}`}
                  onClick={() => onScheduleAtSlot(slot.dayName, slot.hour)}
                  className={`p-3.5 rounded-xl border transition cursor-pointer space-y-1 ${
                    i === 0
                      ? "border-primary/40 bg-primary/5 hover:bg-primary/10"
                      : "border-border/80 bg-card hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-bold uppercase">
                    <span className={i === 0 ? "text-primary" : "text-foreground"}>
                      #{i + 1} Melhor Janela ({slot.dayName})
                    </span>
                    <span>{String(slot.hour).padStart(2, "0")}:00</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Índice relativo de engajamento: {slot.score}% ({slot.postsCount} post(s) publicados neste horário).
                  </p>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── ABA 5: RANKING REAL DE PERFORMANCE ───────────────────────────────────────
interface PerformanceViewProps {
  posts: SocialPost[];
  onSelectPost: (p: SocialPost) => void;
}

function PerformanceLeaderboardView({ posts, onSelectPost }: PerformanceViewProps) {
  const publishedPosts = useMemo(() => {
    return posts
      .filter((p) => p.status === "published")
      .sort(
        (a, b) =>
          (b.reach_count || 0) - (a.reach_count || 0) ||
          b.likes_count + b.comments_count - (a.likes_count + a.comments_count)
      );
  }, [posts]);

  return (
    <div className="space-y-6">
      <div className="glass-panel p-6 rounded-3xl border border-border/80 bg-card">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-400" />
              Ranking Real de Publicações
            </h3>
            <p className="text-xs text-muted-foreground">
              Ordenadas por alcance orgânico e interações reais registradas na Meta API.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border/60 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-3">Posição & Post</th>
                <th className="py-3 px-3">Formato</th>
                <th className="py-3 px-3">Plataforma</th>
                <th className="py-3 px-3">Alcance</th>
                <th className="py-3 px-3">Curtidas</th>
                <th className="py-3 px-3">Comentários</th>
                <th className="py-3 px-3">Taxa Eng.</th>
                <th className="py-3 px-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {publishedPosts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    Nenhuma publicação encontrada para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                publishedPosts.map((post, idx) => {
                  const interactions =
                    post.likes_count + post.comments_count + (post.shares_count || 0) + (post.saves_count || 0);
                  const engRate =
                    post.reach_count > 0 ? ((interactions / post.reach_count) * 100).toFixed(1) : "—";
                  return (
                    <tr key={post.id} className="hover:bg-muted/40 transition">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-xs text-muted-foreground w-5">
                            #{idx + 1}
                          </span>
                          <div className="h-10 w-10 rounded-lg overflow-hidden shrink-0 bg-muted">
                            <SafeMediaThumb
                              src={post.thumbnail_url || post.media_url}
                              alt={post.title}
                              postType={post.post_type}
                            />
                          </div>
                          <div className="min-w-0 max-w-[200px] sm:max-w-[280px]">
                            <p className="font-bold text-foreground truncate">{post.title || "Publicação"}</p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {post.account_name || ""} •{" "}
                              {post.published_at ? format(new Date(post.published_at), "dd/MM/yyyy HH:mm") : ""}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 uppercase font-bold text-[11px] px-2 py-0.5 rounded bg-muted">
                          {getTypeIcon(post.post_type)}
                          {post.post_type}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="text-xs font-semibold capitalize text-foreground">{post.platform}</span>
                      </td>
                      <td className="py-3 px-3 font-mono font-bold text-foreground">
                        {post.reach_count > 0 ? post.reach_count.toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="py-3 px-3 font-mono text-foreground">
                        {post.likes_count.toLocaleString("pt-BR")}
                      </td>
                      <td className="py-3 px-3 font-mono text-foreground">
                        {post.comments_count.toLocaleString("pt-BR")}
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono font-bold text-xs text-emerald-500">
                          {engRate === "—" ? "—" : `${engRate}%`}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => onSelectPost(post)}
                          className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary text-primary hover:text-primary-foreground text-[10px] font-bold transition cursor-pointer"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE CRIAÇÃO / EDIÇÃO DE POST (REAL) ─────────────────────────────────
interface CreatePostModalProps {
  onClose: () => void;
  initialPost: SocialPost | null;
  activePages: RealSocialAccount[];
  selectedPage: string;
  masterToken: string | null;
  onSaveSuccess: () => void;
}

function CreatePostModal({
  onClose,
  initialPost,
  activePages,
  selectedPage,
  masterToken,
  onSaveSuccess,
}: CreatePostModalProps) {
  const [title, setTitle] = useState(initialPost?.title || "");
  const [content, setContent] = useState(initialPost?.content || "");
  const [mediaUrl, setMediaUrl] = useState(initialPost?.media_url || "");
  const [postType, setPostType] = useState<PostType>(initialPost?.post_type || "feed");
  const [platform, setPlatform] = useState<PostPlatform>(initialPost?.platform || "instagram");
  const [scheduledAt, setScheduledAt] = useState<string>(
    initialPost?.scheduled_at ? format(new Date(initialPost.scheduled_at), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [pageId, setPageId] = useState(
    initialPost?.page_id || (selectedPage !== "all" ? selectedPage : "")
  );

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("vendas");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [previewDeviceMode, setPreviewDeviceMode] = useState<"feed" | "reels" | "facebook">("feed");
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Nunca assume silenciosamente a 1ª conta (ex: LumaCar) quando o usuário veio de 'Consolidado' ('all') — ID 38
  const selectedAccount = activePages.find((p) => p.page_id === pageId) || null;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSaving, onClose]);

  const handleInsertEmoji = (emoji: string) => setContent((prev) => prev + emoji);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `social_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const filePath = `social_posts/${fileName}`;

      const { error } = await supabase.storage
        .from("media")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });
      if (error) throw error;

      const {
        data: { publicUrl },
      } = supabase.storage.from("media").getPublicUrl(filePath);

      setMediaUrl(publicUrl);
      toast.success("Mídia enviada com sucesso!");
    } catch (err: any) {
      toast.error(`Erro ao carregar mídia: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleGenerateAiCaption = async () => {
    if (!aiPrompt.trim()) {
      toast.warning("Digite sobre o que é o post antes de gerar a legenda.");
      return;
    }

    setIsGeneratingAi(true);
    try {
      const { data, error } = await supabase.functions.invoke("victoria-agent", {
        body: {
          message: `Crie uma legenda em português para ${platform} (${postType}), tom ${aiTone}, com hashtags relevantes, sobre: ${aiPrompt}. Retorne apenas o texto da legenda pronta para postar.`,
          mode: "social_caption",
        },
      });
      if (error) throw error;
      const text = data?.reply || data?.response || data?.caption || data?.message;
      if (!text) throw new Error("Sem retorno da IA.");
      setContent(String(text).trim());
      toast.success("Legenda gerada pela Victoria AI!");
    } catch (err: any) {
      toast.error(`Não foi possível gerar legenda via IA: ${err?.message || "Erro na Victoria AI"}`);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const handleSave = async (targetStatus: PostStatus, publishImmediately = false) => {
    if (!content.trim()) {
      toast.error("O texto da legenda não pode estar vazio.");
      return;
    }
    if (!pageId || !selectedAccount) {
      toast.error("Selecione explicitamente a conta de destino antes de salvar ou publicar.");
      return;
    }
    if (targetStatus === "scheduled" && !scheduledAt) {
      toast.error("Informe a data e hora do agendamento.");
      return;
    }
    if (publishImmediately) {
      const targetName = selectedAccount.instagram_handle
        ? `${selectedAccount.page_name} (@${selectedAccount.instagram_handle})`
        : selectedAccount.page_name;
      const confirmed =
        typeof window !== "undefined"
          ? window.confirm(
              `Confirmar publicação imediata?\n\nConta de destino: ${targetName}\nCanal: ${platform}\nFormato: ${postType}`
            )
          : true;
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      const schedIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
      let metaPostId: string | null = initialPost?.meta_post_id || null;
      let errorMsg: string | null = null;
      let finalStatus: PostStatus = targetStatus;

      if (publishImmediately) {
        if (!selectedAccount || !masterToken) {
          throw new Error("Token Meta inválido ou conta sem acesso.");
        }
        const metaRes = await publishOrScheduleToMeta({
          account: selectedAccount,
          masterToken,
          platform,
          postType,
          content,
          mediaUrl: mediaUrl || null,
          publishImmediately: true,
        });
        if (metaRes.metaPostIds.length === 0) {
          throw new Error(metaRes.errors.join(" | ") || "A Meta API não conseguiu publicar.");
        }
        metaPostId = metaRes.metaPostIds.join(",");
        if (metaRes.errors.length > 0) errorMsg = metaRes.errors.join(" | ");
      } else if (targetStatus === "scheduled" && schedIso && selectedAccount && masterToken) {
        // Para Facebook (ou Ambos), agenda nativamente na Graph API da Meta
        if (platform === "facebook" || platform === "both") {
          const metaRes = await publishOrScheduleToMeta({
            account: selectedAccount,
            masterToken,
            platform,
            postType,
            content,
            mediaUrl: mediaUrl || null,
            scheduledAtIso: schedIso,
            publishImmediately: false,
          });
          if (metaRes.metaPostIds.length > 0) {
            metaPostId = metaRes.metaPostIds.join(",");
          }
          if (metaRes.errors.length > 0) {
            toast.warning(metaRes.errors.join(" | "));
          }
        } else if (platform === "instagram") {
          toast.info(
            "Instagram salvo no Planejador! (Nota: a API oficial do Instagram só publica direto ou aceita agendamento nativo pelo Meta Business Suite; você poderá disparar com 1 clique aqui no Planejador)."
          );
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      const payload: Record<string, any> = {
        user_id: userData?.user?.id || undefined,
        title: title || content.slice(0, 48),
        content,
        media_url: mediaUrl || null,
        post_type: postType,
        platform,
        status: finalStatus,
        page_id: pageId,
        scheduled_at: schedIso,
        published_at: publishImmediately ? new Date().toISOString() : null,
        meta_post_id: metaPostId,
        error_message: errorMsg,
      };

      if (initialPost?.id && initialPost.source === "supabase") {
        const { error } = await supabase.from("social_posts").update(payload).eq("id", initialPost.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("social_posts").insert([payload]);
        if (error) throw error;
      }

      toast.success(
        publishImmediately
          ? "Publicado com sucesso nas redes reais!"
          : targetStatus === "scheduled"
          ? "Publicação agendada!"
          : "Rascunho salvo no Planejador!"
      );
      onSaveSuccess();
    } catch (err: any) {
      toast.error(`Erro ao salvar/publicar: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-3xl border border-border/80 bg-card p-4 sm:p-7 shadow-2xl space-y-6 my-auto">
        <div className="flex items-center justify-between border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-pink-500/10 text-pink-500">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold uppercase tracking-wider text-foreground">
                {initialPost?.id ? "Editar Publicação" : "Novo Post & Agendamento Real"}
              </h3>
              <p className="text-xs text-muted-foreground">
                Publique ou agende diretamente na Meta e visualize no calendário editorial.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Fechar modal de publicação"
            className="p-2 rounded-xl bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!pageId && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-300 flex items-center justify-between gap-2">
            <span>
              <strong>Atenção (Modo Consolidado):</strong> selecione explicitamente a conta de destino antes de publicar ou agendar.
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Conta de Destino
                </label>
                <select
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">
                    {activePages.length === 0
                      ? "Nenhuma conta conectada"
                      : "Selecione explicitamente a conta de destino..."}
                  </option>
                  {activePages.map((page) => (
                    <option key={page.page_id} value={page.page_id}>
                      {page.page_name} {page.instagram_handle ? `(@${page.instagram_handle})` : "(FB)"}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Canal de Veiculação
                </label>
                <select
                  value={platform}
                  onChange={(e: any) => setPlatform(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-xs font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="instagram">Instagram</option>
                  <option value="facebook">Facebook (Agendamento Nativo Meta)</option>
                  <option value="both">Ambos (Instagram + Facebook)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Formato da Publicação
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-background p-1 rounded-xl border border-border/80">
                  <button
                    type="button"
                    onClick={() => {
                      setPostType("feed");
                      setPreviewDeviceMode("feed");
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      postType === "feed" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <ImageIcon className="h-3 w-3" />
                    <span>Feed</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPostType("reels");
                      setPreviewDeviceMode("reels");
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      postType === "reels" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Film className="h-3 w-3" />
                    <span>Reels</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setPostType("stories");
                      setPreviewDeviceMode("reels");
                    }}
                    className={`py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer ${
                      postType === "stories" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    <span>Stories</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Mídia (Imagem ou Vídeo)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="URL pública da mídia ou upload..."
                    value={mediaUrl}
                    onChange={(e) => setMediaUrl(e.target.value)}
                    className="flex-1 bg-background border border-border/80 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*,video/*"
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  >
                    {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
                    <span>Upload</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-muted/30 border border-border/80 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Gerador de Legenda (Victoria AI)
                </span>
                <select
                  value={aiTone}
                  onChange={(e) => setAiTone(e.target.value)}
                  className="bg-background border border-border/80 text-[10px] font-bold rounded-lg px-2 py-1 text-foreground"
                >
                  <option value="vendas">Tom: Vendas & Oferta</option>
                  <option value="autoridade">Tom: Dica & Autoridade</option>
                  <option value="engajamento">Tom: Pergunta & Enquete</option>
                  <option value="storytelling">Tom: Storytelling</option>
                </select>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Descreva o tema ou oferta do post..."
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  className="flex-1 bg-background border border-border/80 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleGenerateAiCaption}
                  disabled={isGeneratingAi}
                  className="px-3.5 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer flex items-center gap-1 shrink-0"
                >
                  {isGeneratingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  <span>Gerar</span>
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
                <span>Texto da Legenda & Hashtags</span>
                <span className="font-mono">{content.length} / 2.200 caracteres</span>
              </div>
              <textarea
                rows={5}
                placeholder="Escreva a legenda completa aqui..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full bg-background border border-border/80 rounded-xl p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />

              <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto pb-1">
                <span className="text-[10px] text-muted-foreground font-bold shrink-0">Emojis:</span>
                {["🔥", "🚗", "🚀", "💡", "📲", "👇", "✨", "🏁", "🔑", "🎯", "🛡️"].map((em) => (
                  <button
                    key={em}
                    type="button"
                    onClick={() => handleInsertEmoji(em)}
                    className="p-1 rounded bg-muted/60 hover:bg-muted text-xs cursor-pointer transition"
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Agendar para (Data e Hora)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-xs font-mono text-foreground focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                  Título Interno (Opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ex: Condições Especiais da Semana"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-background border border-border/80 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-border/60">
              <button
                type="button"
                onClick={() => handleSave("draft")}
                disabled={isSaving}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Salvar Rascunho
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleSave("pending_approval")}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl border border-purple-500/40 text-purple-400 hover:bg-purple-500/10 font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  Pedir Aprovação
                </button>

                <button
                  type="button"
                  onClick={() => handleSave("scheduled")}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition cursor-pointer"
                >
                  Agendar Post
                </button>

                <button
                  type="button"
                  onClick={() => handleSave("published", true)}
                  disabled={isSaving}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary/20 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  <span>Publicar Agora</span>
                </button>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3 bg-muted/60 p-1 rounded-xl text-xs font-bold">
              {(["feed", "reels", "facebook"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPreviewDeviceMode(m)}
                  className={`px-3 py-1 rounded-lg transition cursor-pointer capitalize ${
                    previewDeviceMode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`}
                >
                  {m === "feed" ? "Instagram Feed" : m === "reels" ? "Reels" : "Facebook"}
                </button>
              ))}
            </div>

            <div className="w-[300px] sm:w-[320px] rounded-[36px] border-[6px] border-zinc-800 bg-black text-white shadow-2xl overflow-hidden flex flex-col">
              <div className="h-5 bg-zinc-800 rounded-b-2xl w-36 mx-auto mb-1 flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-zinc-900" />
              </div>

              <div className="p-3 flex items-center justify-between border-b border-zinc-900">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full overflow-hidden bg-zinc-800">
                    {selectedAccount?.profile_picture_url ? (
                      <img src={selectedAccount.profile_picture_url} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-white">
                      {selectedAccount?.instagram_handle || selectedAccount?.page_name || "conta"}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      {previewDeviceMode === "facebook" ? "Página Facebook" : "Publicação Orgânica"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="relative aspect-square w-full bg-zinc-900 flex items-center justify-center overflow-hidden">
                {mediaUrl ? (
                  <SafeMediaThumb src={mediaUrl} alt={title} postType={postType} />
                ) : (
                  <div className="text-center p-4 text-zinc-600 text-xs flex flex-col items-center gap-2">
                    <ImageIcon className="h-8 w-8 text-zinc-700" />
                    <span>Nenhuma imagem ou vídeo adicionado</span>
                  </div>
                )}
              </div>

              <div className="p-3 space-y-2">
                <div className="text-[10px] text-zinc-300 leading-relaxed max-h-24 overflow-y-auto custom-scrollbar">
                  <strong className="text-white mr-1">
                    {selectedAccount?.instagram_handle || selectedAccount?.page_name || "conta"}
                  </strong>
                  <span>{content || "Sua legenda aparecerá aqui..."}</span>
                </div>

                <p className="text-[8px] text-zinc-500 uppercase tracking-widest font-mono">
                  {scheduledAt ? `Agendado: ${format(new Date(scheduledAt), "dd/MM/yyyy HH:mm")}` : "Publicação Imediata"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL DE DETALHES / PREVIEW DE POST ──────────────────────────────────────
interface DeviceModalProps {
  post: SocialPost;
  page: RealSocialAccount | null;
  onClose: () => void;
  onEdit: () => void;
  onPublishNow: () => void;
  onDelete: () => void;
}

function DeviceMockupModal({
  post,
  page,
  onClose,
  onEdit,
  onPublishNow,
  onDelete,
}: DeviceModalProps) {
  const handle = post.account_handle || page?.instagram_handle || post.account_name || page?.page_name || "social";
  const dateDisplay = post.scheduled_at
    ? format(new Date(post.scheduled_at), "dd/MM/yyyy 'às' HH:mm")
    : post.published_at
    ? format(new Date(post.published_at), "dd/MM/yyyy 'às' HH:mm")
    : "Sem data";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md rounded-3xl border border-border/80 bg-card p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Detalhes da Publicação
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-2xl border border-border bg-background p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                {page?.profile_picture_url ? (
                  <img src={page.profile_picture_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">@{handle.replace(/^@/, "")}</p>
                <p className="text-[10px] text-muted-foreground capitalize">
                  {post.platform} • {post.post_type} • {dateDisplay}
                </p>
              </div>
            </div>

            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${getStatusColor(post.status).badge}`}>
              {getStatusLabel(post.status)}
            </span>
          </div>

          {(post.thumbnail_url || post.media_url) && (
            <div className="rounded-xl overflow-hidden aspect-video bg-muted">
              <SafeMediaThumb src={post.thumbnail_url || post.media_url} alt={post.title} postType={post.post_type} />
            </div>
          )}

          <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto custom-scrollbar">
            {post.content || post.title}
          </div>

          {post.status === "published" && (
            <div className="grid grid-cols-4 gap-2 text-center text-[11px] font-mono pt-2 border-t border-border/40 text-muted-foreground">
              <div>
                <span className="block text-[11px]">Curtidas</span>
                <span className="font-bold text-foreground">{post.likes_count.toLocaleString("pt-BR")}</span>
              </div>
              <div>
                <span className="block text-[11px]">Coment.</span>
                <span className="font-bold text-foreground">{post.comments_count.toLocaleString("pt-BR")}</span>
              </div>
              <div>
                <span className="block text-[11px]">Alcance</span>
                <span className="font-bold text-foreground">
                  {post.reach_count > 0 ? post.reach_count.toLocaleString("pt-BR") : "Indisp."}
                </span>
              </div>
              <div>
                <span className="block text-[11px]">Shares/Salvos</span>
                <span className="font-bold text-foreground">
                  {((post.shares_count || 0) + (post.saves_count || 0)).toLocaleString("pt-BR")}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2 flex-wrap">
          <div>
            {post.permalink && (
              <a
                href={post.permalink}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-foreground font-bold text-xs inline-flex items-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir na Rede
              </a>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(post.source === "supabase" || post.status === "scheduled") && (
              <button
                onClick={onDelete}
                className="px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs cursor-pointer"
              >
                {post.source === "meta_live" ? "Cancelar no Meta" : "Excluir"}
              </button>
            )}

            {post.source === "supabase" && post.status === "scheduled" && (
              <button
                onClick={onPublishNow}
                className="px-3.5 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Publicar Agora
              </button>
            )}

            {post.source === "supabase" && (
              <button
                onClick={onEdit}
                className="px-3.5 py-2 rounded-xl bg-muted hover:bg-muted/80 text-foreground font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Editar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── UTILITÁRIOS VISUAIS ──────────────────────────────────────────────────────
function getStatusColor(status: PostStatus) {
  switch (status) {
    case "published":
      return { dot: "bg-emerald-500", badge: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" };
    case "scheduled":
      return { dot: "bg-cyan-500", badge: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20" };
    case "pending_approval":
      return { dot: "bg-purple-500", badge: "bg-purple-500/10 text-purple-400 border border-purple-500/20" };
    case "draft":
      return { dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-400 border border-amber-500/20" };
    default:
      return { dot: "bg-zinc-500", badge: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20" };
  }
}

function getStatusLabel(status: PostStatus) {
  switch (status) {
    case "published":
      return "Publicado";
    case "scheduled":
      return "Agendado";
    case "pending_approval":
      return "Em Aprovação";
    case "draft":
      return "Rascunho";
    default:
      return status;
  }
}

function getTypeIcon(type: PostType) {
  switch (type) {
    case "reels":
      return <Film className="h-3 w-3" />;
    case "stories":
      return <Layers className="h-3 w-3" />;
    case "carousel":
      return <Layers className="h-3 w-3" />;
    default:
      return <ImageIcon className="h-3 w-3" />;
  }
}
