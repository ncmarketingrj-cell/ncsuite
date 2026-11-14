import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Bot,
  Sparkles,
  Flame,
  Calendar,
  ChevronDown,
  Users,
  Activity,
  Image as ImageIcon,
  Film,
  BookOpen,
  ExternalLink,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { useGlobalDate } from "@/contexts/DateContext";
import {
  fetchLiveSocialAccounts,
  fetchRealSocialInsights,
  type RealSocialPost,
} from "@/lib/metaSocialService";
import { computeSocialAuditNetworkSplit } from "@/lib/pageSanitizers";
import { formatCivilDateBR } from "@/lib/metricsDomain";

export const Route = createFileRoute("/_app/social-audit")({
  component: SocialAuditPage,
});

function PostPreviewThumb({ post, dimmed = false }: { post: RealSocialPost; dimmed?: boolean }) {
  const [imgError, setImgError] = useState(false);
  const src = post.thumbnail_url || post.media_url;
  const isVideo = post.post_type === "reels";

  if (!src || imgError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground p-4 text-center">
        {isVideo ? (
          <Film className="w-8 h-8 text-primary/40" />
        ) : (
          <ImageIcon className="w-8 h-8 text-primary/40" />
        )}
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/60">
          {post.platform === "facebook" ? "Post Facebook" : isVideo ? "Reels / Vídeo" : "Publicação"}
        </span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={post.title}
      onError={() => setImgError(true)}
      className={`w-full h-full object-cover ${dimmed ? "opacity-65" : ""}`}
    />
  );
}

function formatPct(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "0.0";
}

function SocialAuditPage() {
  const { dateFrom, dateTo } = useGlobalDate();
  const [selectedPage, setSelectedPage] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<"diagnostico" | "conteudo" | "estratégia">("diagnostico");
  const [chartDays, setChartDays] = useState<7 | 14 | 30>(14);
  const [chartMetric, setChartMetric] = useState<"reachIg" | "followers" | "engFb">("reachIg");
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [organicPlan, setOrganicPlan] = useState<string | null>(null);

  const {
    data: accountsRes,
    isLoading: isLoadingAccounts,
    refetch: refetchAccounts,
  } = useQuery({
    queryKey: ["real-social-accounts"],
    queryFn: () => fetchLiveSocialAccounts(false),
    staleTime: 5 * 60 * 1000,
  });

  const activePages = accountsRes?.accounts || [];
  const masterToken = accountsRes?.masterToken || null;

  const {
    data: insightsRes,
    isLoading: isLoadingInsights,
    isFetching: isFetchingInsights,
    refetch: refetchInsights,
  } = useQuery({
    queryKey: ["real-social-audit", selectedPage, dateFrom, dateTo, chartDays, activePages.length],
    enabled: !isLoadingAccounts,
    queryFn: () =>
      fetchRealSocialInsights({
        accounts: activePages,
        selectedPageId: selectedPage,
        dateFrom,
        dateTo,
        chartDaysOverride: chartDays,
        masterToken,
      }),
    staleTime: 3 * 60 * 1000,
  });

  const postsList = insightsRes?.posts || [];
  const kpis = insightsRes?.kpis || {
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
  };

  const chartData = useMemo(() => {
    const series = insightsRes?.dailySeries || [];
    return series.map((d) => ({
      date: d.date,
      label: d.label,
      reachIg: d.reachIg,
      followers: d.newFollowersIg + d.newFollowersFb,
      engFb: d.engFb,
    }));
  }, [insightsRes?.dailySeries]);

  const chartAverage = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((acc, pt) => acc + (pt[chartMetric] || 0), 0);
    return Math.round((sum / chartData.length) * 10) / 10;
  }, [chartData, chartMetric]);

  const sortedByEng = useMemo(
    () => [...postsList].sort((a, b) => b.engagement_rate - a.engagement_rate || b.reach_count - a.reach_count),
    [postsList]
  );

  const bestPosts = useMemo(() => sortedByEng.slice(0, 3), [sortedByEng]);

  const lowPosts = useMemo(() => {
    if (sortedByEng.length <= 3) return [];
    const topIds = new Set(bestPosts.map((p) => p.id));
    return [...sortedByEng]
      .reverse()
      .filter((p) => !topIds.has(p.id))
      .slice(0, 3);
  }, [sortedByEng, bestPosts]);

  const auditMetrics = useMemo(() => {
    const split = computeSocialAuditNetworkSplit(postsList, kpis);
    const totalReach = split.instagram.reach;
    const totalLikes = postsList.reduce((acc, p) => acc + (p.likes_count || 0), 0);
    const totalComments = postsList.reduce((acc, p) => acc + (p.comments_count || 0), 0);
    const totalSavesAndShares = postsList.reduce(
      (acc, p) => acc + (p.saved_count || 0) + (p.shares_count || 0),
      0
    );
    const totalInteractions = split.combined.totalInteractions;
    const avgEngRate = split.instagram.avgEngRate;

    const totalFollowers = kpis.followersIg + kpis.followersFb;
    const newFollowers = kpis.newFollowersIg + kpis.newFollowersFb;

    // Score real (0-100) calculado com dados observados
    const hasData = postsList.length > 0 || totalReach > 0 || totalFollowers > 0;
    let healthScore = 0;
    if (hasData) {
      const freqScore = Math.min(35, Math.round((postsList.length / 10) * 35));
      const engScore = Math.min(35, Math.round((avgEngRate / 5) * 35));
      const reachRatio = totalFollowers > 0 ? totalReach / totalFollowers : totalReach > 0 ? 1 : 0;
      const reachScore = Math.min(30, Math.round(Math.min(reachRatio, 2) * 15));
      healthScore = Math.max(10, Math.min(100, freqScore + engScore + reachScore));
    }

    const healthLabel =
      !hasData
        ? "Sem Dados"
        : healthScore >= 75
        ? "Saudável"
        : healthScore >= 45
        ? "Em Evolução"
        : "Crítico";

    const consistencyLabel =
      postsList.length >= 10
        ? `Alta (${postsList.length} posts)`
        : postsList.length >= 4
        ? `Moderada (${postsList.length} posts)`
        : postsList.length > 0
        ? `Baixa (${postsList.length} posts)`
        : "Sem publicações";

    const retentionLabel =
      totalReach === 0
        ? "Sem dados"
        : avgEngRate >= 4
        ? `Forte (${formatPct(avgEngRate)}%)`
        : avgEngRate >= 1.5
        ? `Regular (${formatPct(avgEngRate)}%)`
        : `Baixa (${formatPct(avgEngRate)}%)`;

    const qualityLabel =
      totalInteractions === 0
        ? "Sem interações"
        : `${totalSavesAndShares.toLocaleString("pt-BR")} salvos/compart.`;

    return {
      totalReach,
      totalLikes,
      totalComments,
      totalInteractions,
      totalFollowers,
      newFollowers,
      avgEngRate: formatPct(avgEngRate),
      split,
      healthScore,
      healthLabel,
      consistencyLabel,
      retentionLabel,
      qualityLabel,
      hasData,
    };
  }, [postsList, kpis]);

  const selectedAccountLabel = useMemo(() => {
    if (selectedPage === "all") {
      return `Todas as Contas (${activePages.length} conectadas)`;
    }
    const found = activePages.find((p) => p.page_id === selectedPage);
    return found
      ? `${found.page_name}${found.instagram_handle ? ` (@${found.instagram_handle})` : ""}`
      : "Conta Selecionada";
  }, [selectedPage, activePages]);

  const handleSync = async () => {
    await refetchAccounts();
    await refetchInsights();
    toast.success("Auditoria orgânica sincronizada com os dados reais da Meta API!");
  };

  const generateGrowthPlan = async () => {
    setIsGeneratingPlan(true);
    try {
      const topSummary = bestPosts
        .map(
          (p, i) =>
            `${i + 1}. [${p.platform.toUpperCase()} / ${p.post_type}] "${p.title}" — Engajamento ${p.engagement_rate}%, Alcance ${p.reach_count}, Curtidas ${p.likes_count}, Comentários ${p.comments_count}, Salvos ${p.saved_count}, Shares ${p.shares_count}`
        )
        .join("\n");

      const lowSummary = lowPosts
        .map(
          (p, i) =>
            `${i + 1}. [${p.platform.toUpperCase()} / ${p.post_type}] "${p.title}" — Engajamento ${p.engagement_rate}%, Alcance ${p.reach_count}, Curtidas ${p.likes_count}`
        )
        .join("\n");

      const prompt = `Crie um Manual Prático de Crescimento Orgânico baseado EXCLUSIVAMENTE nos dados reais desta conta Meta/Instagram:
- Conta analisada: ${selectedAccountLabel}
- Janela de análise: ${dateFrom} até ${dateTo}
- Base atual de seguidores: ${auditMetrics.totalFollowers} (IG: ${kpis.followersIg} / FB: ${kpis.followersFb})
- Novos seguidores no período: ${auditMetrics.newFollowers >= 0 ? "+" : ""}${auditMetrics.newFollowers}
- Alcance orgânico IG no período: ${auditMetrics.totalReach}
- Total de interações: ${auditMetrics.totalInteractions}
- Taxa média de engajamento por post: ${auditMetrics.avgEngRate}%
- Publicações reais analisadas: ${postsList.length}

Top publicações reais:
${topSummary || "Sem publicações disponíveis no período."}

Publicações de menor desempenho:
${lowSummary || "Não há publicações de baixo desempenho separadas nesta amostra."}

Entregue um plano direto em português com:
1) Diagnóstico real dos números observados (sem inventar métricas ou marcas).
2) O que repetir com base nos melhores formatos reais encontrados.
3) Correções imediatas para aumentar alcance, salvamentos e compartilhamentos.`;

      const { data, error } = await supabase.functions.invoke("victoria-agent", {
        body: {
          message: prompt,
          mode: "social_audit",
          accountName: selectedAccountLabel,
        },
      });

      if (error) throw error;
      const reply = data?.reply || data?.response || data?.message || data?.plan;
      if (reply && typeof reply === "string") {
        setOrganicPlan(reply);
        toast.success("Manual de crescimento gerado com dados reais pela Victoria AI!");
      } else {
        throw new Error("Resposta vazia da Victoria AI");
      }
    } catch (err) {
      console.warn("Victoria AI fallback local:", err);
      const topLines =
        bestPosts.length > 0
          ? bestPosts
              .map(
                (p, idx) =>
                  `${idx + 1}. "${p.title}" (${p.platform.toUpperCase()} • ${p.post_type}) — Engaj. ${p.engagement_rate}%, Alcance ${p.reach_count.toLocaleString("pt-BR")}, ${p.likes_count} curtidas, ${p.comments_count} comentários.`
              )
              .join("\n")
          : "• Nenhuma publicação real retornada pela API para esta conta no momento.";

      const lowLines =
        lowPosts.length > 0
          ? lowPosts
              .map(
                (p, idx) =>
                  `${idx + 1}. "${p.title}" — Engaj. ${p.engagement_rate}% (${p.reach_count.toLocaleString("pt-BR")} alcance). Reforçar gancho inicial e CTA nos 3 primeiros segundos.`
              )
              .join("\n")
          : "• Amostra reduzida: publique mais conteúdos na janela para comparar formatos vencedores e perdedores.";

      setOrganicPlan(
        `### AUDITORIA ORGÂNICA REAL — ${selectedAccountLabel.toUpperCase()}

#### 1. Diagnóstico Real do Período (${dateFrom} a ${dateTo})
• **Base de Seguidores:** ${auditMetrics.totalFollowers.toLocaleString("pt-BR")} totais (Instagram: ${kpis.followersIg.toLocaleString("pt-BR")} | Facebook: ${kpis.followersFb.toLocaleString("pt-BR")}).
• **Saldo de Seguidores (${chartDays}d / janela):** ${auditMetrics.newFollowers >= 0 ? "+" : ""}${auditMetrics.newFollowers.toLocaleString("pt-BR")} novos seguidores.
• **Alcance Orgânico IG:** ${auditMetrics.totalReach.toLocaleString("pt-BR")} contas alcançadas | **Interações:** ${auditMetrics.totalInteractions.toLocaleString("pt-BR")}.
• **Taxa Média de Engajamento:** ${auditMetrics.avgEngRate}% em ${postsList.length} publicações analisadas.

#### 2. Melhores Publicações Reais (O que Replicar)
${topLines}

#### 3. Pontos de Atenção (Publicações Abaixo da Média)
${lowLines}

#### 4. Plano de Ação Imediato
• Priorize o formato dos seus posts com maior taxa de salvamento e compartilhamento para destravar entrega fora da base.
• Inclua CTA direto para comentários e WhatsApp/Direct nas legendas das próximas postagens para converter alcance em leads.`
      );
      toast.info("Diagnóstico estruturado a partir das métricas reais da conta.");
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const metricLabel =
    chartMetric === "reachIg"
      ? "Alcance Orgânico (IG)"
      : chartMetric === "followers"
      ? "Novos Seguidores"
      : "Engajamento (FB)";

  const metricColor =
    chartMetric === "reachIg" ? "#e11d48" : chartMetric === "followers" ? "#10b981" : "#3b82f6";

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black text-primary uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            Social Media Core • Meta Graph API v21.0
          </div>
          <h2 className="text-xl font-black tracking-tight text-white mt-1">
            Auditoria de Crescimento Orgânico
          </h2>
          <p className="text-xs text-muted-foreground">
            Análise real do desempenho das suas páginas e plano prático de crescimento orgânico.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <Link
            to="/social"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-pink-500/20 hover:opacity-90 active:scale-95 transition"
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Planejador & Feed</span>
          </Link>

          <button
            onClick={handleSync}
            disabled={isFetchingInsights}
            className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetchingInsights ? "animate-spin" : ""}`} />
            <span>Sincronizar</span>
          </button>

          {/* Seletor de Contas */}
          <div className="relative">
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs font-bold text-white focus:outline-none focus:border-primary/50 cursor-pointer appearance-none pr-8 min-w-[220px]"
            >
              <option value="all" className="bg-neutral-900">
                Todas as Contas ({activePages.length})
              </option>
              {activePages.map((page) => (
                <option key={page.page_id} value={page.page_id} className="bg-neutral-900">
                  {page.page_name} {page.instagram_handle ? `(@${page.instagram_handle})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-muted-foreground absolute right-3 top-2.5 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Cartões de Métricas Orgânicas Reais */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="glass-panel p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider block">
              Alcance Orgânico (IG)
            </span>
            <span className="text-xl font-black text-white block mt-1 font-mono">
              {isLoadingInsights ? "..." : auditMetrics.totalReach.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-muted-foreground font-bold mt-2">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            Views IG: {kpis.viewsIg.toLocaleString("pt-BR")}
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider block">
              Engajamento Médio (IG)
            </span>
            <span className="text-xl font-black text-white block mt-1 font-mono">
              {isLoadingInsights ? "..." : `${auditMetrics.avgEngRate}%`}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground font-bold mt-2">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-primary" />
              {auditMetrics.split.instagram.postsCount} posts IG · {auditMetrics.split.facebook.postsCount} posts FB
            </span>
            <span className="text-[8px] font-normal text-muted-foreground/80">
              {auditMetrics.split.instagram.denominatorLabel} · Janela {formatCivilDateBR(dateFrom)}–{formatCivilDateBR(dateTo)}
            </span>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider block">
              Total Interações Reais
            </span>
            <span className="text-xl font-black text-white block mt-1 font-mono">
              {isLoadingInsights ? "..." : auditMetrics.totalInteractions.toLocaleString("pt-BR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-[9px] text-muted-foreground font-bold mt-2">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" />
              IG: {auditMetrics.split.instagram.interactions.toLocaleString("pt-BR")} · FB: {auditMetrics.split.facebook.interactions.toLocaleString("pt-BR")}
            </span>
            <span className="text-[8px] font-normal text-muted-foreground/80">
              Contas engajadas IG: {kpis.accountsEngaged.toLocaleString("pt-BR")}
            </span>
          </div>
        </div>

        <div className="glass-panel p-4 flex flex-col justify-between">
          <div>
            <span className="text-[9px] text-muted-foreground font-black uppercase tracking-wider block">
              Seguidores (Base / Período)
            </span>
            <span className="text-xl font-black text-white block mt-1 font-mono">
              {isLoadingInsights
                ? "..."
                : `${auditMetrics.totalFollowers.toLocaleString("pt-BR")}`}
            </span>
          </div>
          <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-bold mt-2">
            <Users className="w-3 h-3" />
            {auditMetrics.newFollowers >= 0 ? "+" : ""}
            {auditMetrics.newFollowers.toLocaleString("pt-BR")} no período (IG {kpis.followersIg.toLocaleString("pt-BR")} • FB {kpis.followersFb.toLocaleString("pt-BR")})
          </div>
        </div>
      </div>

      {/* Navegação de Abas */}
      <div className="flex border-b border-white/5 gap-4">
        {(["diagnostico", "conteudo", "estratégia"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-xs font-bold transition-all relative capitalize cursor-pointer ${
              activeTab === tab ? "text-primary font-black" : "text-muted-foreground hover:text-white"
            }`}
          >
            {tab === "diagnostico"
              ? "Diagnóstico de Performance"
              : tab === "conteudo"
              ? `O que Funciona vs. O que Falha (${postsList.length})`
              : "Plano Victoria AI"}
            {activeTab === tab && (
              <motion.div
                layoutId="social_audit_tab_bar"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary"
              />
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {activeTab === "diagnostico" && (
          <motion.div
            key="diagnostico-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Gráfico Diário Real de Alcance / Seguidores */}
            <div className="lg:col-span-2 glass-panel p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-white uppercase tracking-wider">
                    Evolução Diária Real — {metricLabel}
                  </h4>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Série histórica dos últimos {chartDays} dias extraída da API oficial da Meta. Média diária:{" "}
                    <span className="text-white font-bold">{chartAverage.toLocaleString("pt-BR")}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                    {(
                      [
                        { id: "reachIg", label: "Alcance IG" },
                        { id: "followers", label: "Seguidores" },
                        { id: "engFb", label: "Engaj. FB" },
                      ] as const
                    ).map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setChartMetric(m.id)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          chartMetric === m.id
                            ? "bg-primary text-white"
                            : "text-muted-foreground hover:text-white"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex bg-white/5 rounded-lg p-0.5 border border-white/10">
                    {([7, 14, 30] as const).map((d) => (
                      <button
                        key={d}
                        onClick={() => setChartDays(d)}
                        className={`px-2 py-1 rounded-md text-[10px] font-bold transition cursor-pointer ${
                          chartDays === d
                            ? "bg-white/15 text-white"
                            : "text-muted-foreground hover:text-white"
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="h-64 w-full">
                {chartData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    Nenhum dado diário retornado para esta conta na janela selecionada.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 10, right: 10, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                      <XAxis dataKey="label" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                      <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                      <Tooltip
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        contentStyle={{
                          backgroundColor: "rgba(10,10,10,0.95)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "12px",
                          fontSize: "11px",
                          color: "#fff",
                        }}
                      />
                      {chartAverage > 0 && (
                        <ReferenceLine
                          y={chartAverage}
                          stroke="rgba(255,255,255,0.35)"
                          strokeDasharray="4 4"
                        />
                      )}
                      <Bar
                        dataKey={chartMetric}
                        name={metricLabel}
                        fill={metricColor}
                        radius={[6, 6, 0, 0]}
                        maxBarSize={36}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Score de Saúde Orgânica Real */}
            <div className="glass-panel p-5 flex flex-col justify-between space-y-4">
              <div>
                <h4 className="text-xs font-black text-white uppercase tracking-wider">
                  Score de Saúde Orgânica
                </h4>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  Índice calculado a partir da frequência real de postagem, alcance vs. base e taxa de engajamento.
                </p>
              </div>

              <div className="flex flex-col items-center justify-center py-4">
                <div className="relative w-36 h-36 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="8"
                      fill="transparent"
                    />
                    <circle
                      cx="72"
                      cy="72"
                      r="64"
                      stroke="#e11d48"
                      strokeWidth="8"
                      fill="transparent"
                      strokeDasharray={402}
                      strokeDashoffset={402 - (402 * auditMetrics.healthScore) / 100}
                      strokeLinecap="round"
                      className="transition-all duration-1000"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-3xl font-black text-white">
                      {auditMetrics.healthScore}
                      <span className="text-xs text-muted-foreground">/100</span>
                    </span>
                    <span
                      className={`text-[8px] font-black uppercase tracking-wider mt-1 px-2 py-0.5 rounded border ${
                        auditMetrics.healthScore >= 75
                          ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                          : auditMetrics.healthScore >= 45
                          ? "text-amber-400 bg-amber-500/10 border-amber-500/20"
                          : "text-rose-400 bg-rose-500/10 border-rose-500/20"
                      }`}
                    >
                      {auditMetrics.healthLabel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-white/5 pt-3">
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Frequência analisada</span>
                  <span className="text-white font-bold">{auditMetrics.consistencyLabel}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Taxa de engajamento</span>
                  <span className="text-white font-bold">{auditMetrics.retentionLabel}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-muted-foreground">Salvos & Compartilhamentos</span>
                  <span className="text-white font-bold">{auditMetrics.qualityLabel}</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === "conteudo" && (
          <motion.div
            key="conteudo-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {postsList.length === 0 ? (
              <div className="glass-panel p-10 text-center space-y-2">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                <h4 className="text-sm font-bold text-white">Nenhuma publicação real encontrada</h4>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  A conta selecionada ainda não possui posts retornados pela Meta Graph API ou não tem perfil do Instagram Business/Página vinculado ao token ativo.
                </p>
              </div>
            ) : (
              <>
                {/* O que deu Certo */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-l-2 border-emerald-500 pl-3">
                    <Flame className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h4 className="text-xs font-black text-white uppercase tracking-wider">
                        O que deu mais resultado (Top Performance Real)
                      </h4>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Publicações reais com maior taxa de engajamento e alcance nesta conta.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {bestPosts.map((post) => (
                      <div
                        key={post.id}
                        className="glass-panel p-4 flex flex-col justify-between space-y-4 hover:border-emerald-500/30 transition-all duration-300"
                      >
                        <div className="space-y-3">
                          <div className="relative aspect-square w-full max-h-60 rounded-xl overflow-hidden bg-neutral-950 border border-white/10 flex items-center justify-center">
                            <PostPreviewThumb post={post} />
                            <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-500/90 text-white flex items-center gap-1 z-10">
                              <TrendingUp className="w-2.5 h-2.5" /> Engaj. {post.engagement_rate}%
                            </span>
                            {post.post_type === "reels" ? (
                              <Film className="w-4 h-4 text-white absolute bottom-2 right-2 shrink-0 drop-shadow-md z-10" />
                            ) : (
                              <ImageIcon className="w-4 h-4 text-white absolute bottom-2 right-2 shrink-0 drop-shadow-md z-10" />
                            )}
                          </div>

                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[9px] font-bold uppercase text-primary">
                                {post.accountHandle || post.accountName} • {post.platform}
                              </span>
                              {post.permalink && (
                                <a
                                  href={post.permalink}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[9px] font-bold text-white/70 hover:text-white flex items-center gap-1"
                                >
                                  Ver Post <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              )}
                            </div>
                            <h5 className="font-bold text-white text-xs truncate mt-1">{post.title}</h5>
                            <p className="text-[10px] text-muted-foreground line-clamp-3 mt-1 leading-relaxed">
                              {post.content}
                            </p>
                          </div>
                        </div>

                        <div className="border-t border-white/5 pt-3 space-y-2">
                          <div className="grid grid-cols-4 gap-1 text-center text-[10px] bg-white/5 rounded-lg p-2">
                            <div>
                              <span className="block text-muted-foreground text-[8px]">Alcance</span>
                              <span className="font-bold text-white">{post.reach_count.toLocaleString("pt-BR")}</span>
                            </div>
                            <div>
                              <span className="block text-muted-foreground text-[8px]">Curtidas</span>
                              <span className="font-bold text-white">{post.likes_count.toLocaleString("pt-BR")}</span>
                            </div>
                            <div>
                              <span className="block text-muted-foreground text-[8px]">Salvos</span>
                              <span className="font-bold text-white">{post.saved_count.toLocaleString("pt-BR")}</span>
                            </div>
                            <div>
                              <span className="block text-muted-foreground text-[8px]">Shares</span>
                              <span className="font-bold text-white">{post.shares_count.toLocaleString("pt-BR")}</span>
                            </div>
                          </div>
                          <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 p-2.5 rounded-xl text-[10px] leading-relaxed">
                            {post.ai_recommendation}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* O que não deu Certo */}
                {lowPosts.length > 0 && (
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-2 border-l-2 border-rose-500 pl-3">
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                      <div>
                        <h4 className="text-xs font-black text-white uppercase tracking-wider">
                          Menor Tração (Abaixo da Média da Conta)
                        </h4>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Publicações reais que geraram menos interação proporcional ao alcance.
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      {lowPosts.map((post) => (
                        <div
                          key={post.id}
                          className="glass-panel p-4 flex flex-col justify-between space-y-4 hover:border-rose-500/30 transition-all duration-300"
                        >
                          <div className="space-y-3">
                            <div className="relative aspect-square w-full max-h-60 rounded-xl overflow-hidden bg-neutral-950 border border-white/10 flex items-center justify-center">
                              <PostPreviewThumb post={post} dimmed />
                              <span className="absolute top-2 left-2 px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-500/90 text-white flex items-center gap-1 z-10">
                                <TrendingDown className="w-2.5 h-2.5" /> Engaj. {post.engagement_rate}%
                              </span>
                            </div>

                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[9px] font-bold uppercase text-primary">
                                  {post.accountHandle || post.accountName} • {post.platform}
                                </span>
                                {post.permalink && (
                                  <a
                                    href={post.permalink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-[9px] font-bold text-white/70 hover:text-white flex items-center gap-1"
                                  >
                                    Ver Post <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </div>
                              <h5 className="font-bold text-white text-xs truncate mt-1">{post.title}</h5>
                              <p className="text-[10px] text-muted-foreground line-clamp-3 mt-1 leading-relaxed">
                                {post.content}
                              </p>
                            </div>
                          </div>

                          <div className="border-t border-white/5 pt-3 space-y-2">
                            <div className="grid grid-cols-4 gap-1 text-center text-[10px] bg-white/5 rounded-lg p-2">
                              <div>
                                <span className="block text-muted-foreground text-[8px]">Alcance</span>
                                <span className="font-bold text-white">{post.reach_count.toLocaleString("pt-BR")}</span>
                              </div>
                              <div>
                                <span className="block text-muted-foreground text-[8px]">Curtidas</span>
                                <span className="font-bold text-white">{post.likes_count.toLocaleString("pt-BR")}</span>
                              </div>
                              <div>
                                <span className="block text-muted-foreground text-[8px]">Coment.</span>
                                <span className="font-bold text-white">{post.comments_count.toLocaleString("pt-BR")}</span>
                              </div>
                              <div>
                                <span className="block text-muted-foreground text-[8px]">Shares</span>
                                <span className="font-bold text-white">{post.shares_count.toLocaleString("pt-BR")}</span>
                              </div>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 p-2.5 rounded-xl text-[10px] leading-relaxed">
                              {post.ai_recommendation}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {activeTab === "estratégia" && (
          <motion.div
            key="estratégia-tab"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {/* Relatório Gerado por IA Victoria */}
            <div className="glass-panel p-6 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-primary/25 border border-primary/30 flex items-center justify-center shrink-0">
                    <Bot className="w-5 h-5 text-primary animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      Assessora de Crescimento Victoria AI
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Analisa os posts reais desta conta para formular seu manual de crescimento orgânico.
                    </p>
                  </div>
                </div>

                <button
                  onClick={generateGrowthPlan}
                  disabled={isGeneratingPlan}
                  className="px-4 py-2 rounded-xl bg-primary text-xs font-black text-primary-foreground shadow-glow hover:opacity-90 transition active:scale-95 flex items-center gap-2 cursor-pointer"
                >
                  {isGeneratingPlan ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Estruturando Auditoria...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      Gerar Manual de Crescimento Orgânico
                    </>
                  )}
                </button>
              </div>

              {organicPlan ? (
                <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-4 text-slate-300">
                  <div className="bg-black/40 border border-white/5 p-5 rounded-2xl whitespace-pre-line">
                    {organicPlan}
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 space-y-3">
                  <BookOpen className="w-10 h-10 text-primary/40 mx-auto animate-bounce" />
                  <h5 className="font-bold text-white text-xs">
                    Crie seu plano de escala orgânica com dados reais
                  </h5>
                  <p className="text-[10px] text-muted-foreground max-w-md mx-auto">
                    A Victoria AI vai analisar as publicações reais da conta selecionada e os indicadores de alcance e engajamento retornados pela Meta API.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <Activity className={`${className} animate-pulse`} />;
}
