import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Download, Share2, ArrowLeft, TrendingUp, Users,
  Heart, MessageCircle, Eye, Globe, BarChart3, Calendar,
  Copy, CheckCircle2, Loader2, Instagram, Smartphone, Zap,
  RefreshCw, Send, Image, Sparkles
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/social-relatorios")({
  head: () => ({ meta: [{ title: "Relatórios Social Media — NC Suite" }] }),
  component: SocialRelatoriosPage,
});

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

function fmtPct(n: number) {
  return n.toFixed(2) + "%";
}

function SocialRelatoriosPage() {
  const [clientName, setClientName] = useState("");
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "facebook" | "instagram">("all");
  const [copied, setCopied] = useState(false);
  const reportRef = useRef<HTMLPreElement>(null);

  const periodLabel = `${format(dateRange.startDate, "dd/MM/yyyy", { locale: ptBR })} – ${format(dateRange.endDate, "dd/MM/yyyy", { locale: ptBR })}`;

  // Páginas conectadas
  const { data: pages = [] } = useQuery({
    queryKey: ["social_pages_relatorio"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*");
      return (data as any[]) ?? [];
    },
  });

  // Posts no período
  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["social_posts_relatorio", dateRange.startDate, dateRange.endDate, selectedPlatform],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const startIso = startOfDay(dateRange.startDate).toISOString();
      const endIso = endOfDay(dateRange.endDate).toISOString();
      let q = (supabase as any)
        .from("social_posts")
        .select("*")
        .eq("user_id", user.id)
        .gte("created_at", startIso)
        .lte("created_at", endIso)
        .order("created_at", { ascending: false });
      const { data } = await q;
      let rows = (data as any[]) ?? [];
      if (selectedPlatform !== "all") {
        rows = rows.filter((p: any) =>
          selectedPlatform === "instagram"
            ? (p.platforms || []).includes("instagram")
            : (p.platforms || []).includes("facebook") && !(p.platforms || []).includes("instagram")
        );
      }
      return rows;
    },
    enabled: pages.length > 0,
  });

  // Insights da edge function (dados agregados)
  const { data: insightsData } = useQuery({
    queryKey: ["social_insights_relatorio"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;
      const res = await supabase.functions.invoke("sync-social-media", {
        body: { action: "get-insights" },
      });
      return res.data;
    },
    enabled: pages.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const realPages = pages.filter((p: any) => !String(p.page_id || "").startsWith("mock_"));
  const isConnected = realPages.length > 0;

  // Agregações
  const publishedPosts = posts.filter((p: any) => p.status === "published" || p.status === "agendado");
  const organicPosts = publishedPosts.filter((p: any) => !p.is_paid);
  const paidPosts = publishedPosts.filter((p: any) => !!p.is_paid);

  const totalReach = publishedPosts.reduce((s: number, p: any) => s + (p.reach_count || 0), 0);
  const totalImpressions = publishedPosts.reduce((s: number, p: any) => s + (p.impressions_count || 0), 0);
  const totalLikes = publishedPosts.reduce((s: number, p: any) => s + (p.likes_count || 0), 0);
  const totalComments = publishedPosts.reduce((s: number, p: any) => s + (p.comments_count || 0), 0);
  const totalEngagements = totalLikes + totalComments;
  const engagementRate = totalImpressions > 0 ? (totalEngagements / totalImpressions) * 100 : 0;

  const fbFollowers = realPages.reduce((s: number, p: any) => s + (p.facebook_followers || 0), 0);
  const igFollowers = realPages.reduce((s: number, p: any) => s + (p.instagram_followers || 0), 0);

  // Top 5 posts por engajamento
  const topPosts = [...publishedPosts]
    .sort((a: any, b: any) => {
      const ea = (a.likes_count || 0) + (a.comments_count || 0);
      const eb = (b.likes_count || 0) + (b.comments_count || 0);
      return eb - ea;
    })
    .slice(0, 5);

  // Gerar texto WhatsApp
  const generateReportText = () => {
    const client = clientName || "Cliente";
    const pageNames = realPages.map((p: any) => p.page_name).join(", ") || "páginas conectadas";
    const lines: string[] = [];

    lines.push(`📊 *RELATÓRIO SOCIAL MEDIA — ${client.toUpperCase()}*`);
    lines.push(`📅 Período: ${periodLabel}`);
    lines.push(`📱 Páginas: ${pageNames}`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📈 *VISÃO GERAL DO PERÍODO*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);
    lines.push(`• Publicações totais: *${publishedPosts.length}*`);
    lines.push(`  ├ Orgânicas: ${organicPosts.length}`);
    lines.push(`  └ Pagas/Impulsionadas: ${paidPosts.length}`);
    lines.push(``);
    lines.push(`• Alcance total: *${fmtNum(totalReach)}*`);
    lines.push(`• Impressões totais: *${fmtNum(totalImpressions)}*`);
    lines.push(`• Engajamentos: *${fmtNum(totalEngagements)}*`);
    lines.push(`  ├ Curtidas: ${fmtNum(totalLikes)}`);
    lines.push(`  └ Comentários: ${fmtNum(totalComments)}`);
    lines.push(`• Taxa de Engajamento: *${fmtPct(engagementRate)}*`);
    lines.push(``);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`👥 *SEGUIDORES*`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);
    if (fbFollowers > 0) lines.push(`• Facebook: *${fmtNum(fbFollowers)}* seguidores`);
    if (igFollowers > 0) lines.push(`• Instagram: *${fmtNum(igFollowers)}* seguidores`);
    lines.push(``);

    if (topPosts.length > 0) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`🏆 *TOP POSTS DO PERÍODO*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      topPosts.forEach((p: any, i: number) => {
        const caption = p.caption ? p.caption.slice(0, 60) + (p.caption.length > 60 ? "..." : "") : "Sem legenda";
        const eng = (p.likes_count || 0) + (p.comments_count || 0);
        lines.push(`${i + 1}. ${caption}`);
        lines.push(`   ❤️ ${p.likes_count || 0} curtidas · 💬 ${p.comments_count || 0} comentários · 📊 ${fmtNum(p.reach_count || 0)} alcance`);
        lines.push(``);
      });
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);
    lines.push(`✅ *ANÁLISE GERAL*`);
    const hasGoodEngagement = engagementRate >= 3;
    const hasLowEngagement = engagementRate < 1 && publishedPosts.length > 0;
    if (hasGoodEngagement) {
      lines.push(`📊 Taxa de engajamento acima da média (${fmtPct(engagementRate)}) — ótimo desempenho orgânico!`);
    } else if (hasLowEngagement) {
      lines.push(`📊 Taxa de engajamento de ${fmtPct(engagementRate)} — recomendamos investir em impulsionamento de posts estratégicos.`);
    } else if (publishedPosts.length === 0) {
      lines.push(`ℹ️ Nenhuma publicação registrada no período selecionado.`);
    } else {
      lines.push(`📊 Engajamento de ${fmtPct(engagementRate)} no período.`);
    }
    lines.push(``);
    lines.push(`_Relatório gerado por NC Performance Suite_`);
    lines.push(`_${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}_`);

    return lines.join("\n");
  };

  const reportText = generateReportText();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      toast.success("Relatório copiado para a área de transferência!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar. Selecione o texto manualmente.");
    }
  };

  const handleWhatsApp = () => {
    const encoded = encodeURIComponent(reportText);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  };

  const kpis = [
    {
      label: "Publicações",
      value: publishedPosts.length,
      sub: `${organicPosts.length} orgânicas · ${paidPosts.length} pagas`,
      icon: Image,
      color: "text-pink-500",
      bg: "bg-pink-500/10",
      border: "border-pink-500/20",
    },
    {
      label: "Alcance Total",
      value: fmtNum(totalReach),
      sub: "pessoas únicas alcançadas",
      icon: Globe,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      border: "border-blue-500/20",
    },
    {
      label: "Impressões",
      value: fmtNum(totalImpressions),
      sub: "visualizações totais",
      icon: Eye,
      color: "text-violet-500",
      bg: "bg-violet-500/10",
      border: "border-violet-500/20",
    },
    {
      label: "Engajamentos",
      value: fmtNum(totalEngagements),
      sub: `${fmtNum(totalLikes)} curtidas · ${fmtNum(totalComments)} comentários`,
      icon: Heart,
      color: "text-red-500",
      bg: "bg-red-500/10",
      border: "border-red-500/20",
    },
    {
      label: "Taxa de Engajamento",
      value: fmtPct(engagementRate),
      sub: engagementRate >= 3 ? "Excelente" : engagementRate >= 1 ? "Bom" : "Baixo",
      icon: TrendingUp,
      color: engagementRate >= 3 ? "text-emerald-500" : engagementRate >= 1 ? "text-yellow-500" : "text-red-400",
      bg: engagementRate >= 3 ? "bg-emerald-500/10" : engagementRate >= 1 ? "bg-yellow-500/10" : "bg-red-400/10",
      border: engagementRate >= 3 ? "border-emerald-500/20" : engagementRate >= 1 ? "border-yellow-500/20" : "border-red-400/20",
    },
    {
      label: "Seguidores",
      value: fmtNum(fbFollowers + igFollowers),
      sub: `FB ${fmtNum(fbFollowers)} · IG ${fmtNum(igFollowers)}`,
      icon: Users,
      color: "text-cyan-500",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link
            to="/social"
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-pink-500" />
              Relatórios Social Media
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Orgânico · Pago · Performance de Conteúdo</p>
          </div>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-500">
            <Zap className="h-3.5 w-3.5" />
            Meta não conectado — dados limitados
            <Link to="/config" className="underline underline-offset-2 hover:text-yellow-400 transition-colors">Conectar</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* LEFT PANEL — Configurações do Relatório */}
        <div className="space-y-4">
          {/* Período */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" /> Período
            </h3>
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
          </div>

          {/* Cliente */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" /> Cliente
            </h3>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>

          {/* Plataforma */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Smartphone className="h-3.5 w-3.5" /> Plataforma
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(["all", "facebook", "instagram"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatform(p)}
                  className={`rounded-xl px-2 py-2 text-[11px] font-bold transition-all ${
                    selectedPlatform === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/40 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {p === "all" ? "Todas" : p === "facebook" ? "Facebook" : "Instagram"}
                </button>
              ))}
            </div>
          </div>

          {/* Páginas conectadas */}
          {realPages.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Share2 className="h-3.5 w-3.5" /> Páginas
              </h3>
              {realPages.map((page: any) => (
                <div key={page.id} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2">
                  <span className="text-xs font-bold truncate">{page.page_name}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {page.facebook_followers > 0 && (
                      <span className="text-[10px] text-blue-500 font-bold">{fmtNum(page.facebook_followers)} FB</span>
                    )}
                    {page.instagram_followers > 0 && (
                      <span className="text-[10px] text-pink-500 font-bold">{fmtNum(page.instagram_followers)} IG</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* CENTER + RIGHT — Dados + Relatório */}
        <div className="lg:col-span-2 space-y-5">

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {kpis.map((kpi) => (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border ${kpi.border} ${kpi.bg} p-4`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
                  <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">{kpi.label}</span>
                </div>
                <p className={`text-xl font-black ${kpi.color}`}>{isLoading ? "..." : kpi.value}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* Orgânico vs Pago */}
          {publishedPosts.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5" /> Distribuição Orgânico vs Pago
              </h3>
              <div className="flex items-end gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-emerald-500">Orgânico</span>
                    <span className="text-xs font-bold">{organicPosts.length} posts</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-700"
                      style={{ width: publishedPosts.length > 0 ? `${(organicPosts.length / publishedPosts.length) * 100}%` : "0%" }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {publishedPosts.length > 0 ? Math.round((organicPosts.length / publishedPosts.length) * 100) : 0}% do total
                  </p>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-violet-500">Pago / Impulsionado</span>
                    <span className="text-xs font-bold">{paidPosts.length} posts</span>
                  </div>
                  <div className="h-3 rounded-full bg-muted/40 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-all duration-700"
                      style={{ width: publishedPosts.length > 0 ? `${(paidPosts.length / publishedPosts.length) * 100}%` : "0%" }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {publishedPosts.length > 0 ? Math.round((paidPosts.length / publishedPosts.length) * 100) : 0}% do total
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Top Posts */}
          {topPosts.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-yellow-500" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Top {topPosts.length} Posts — Mais Engajamento
                </h3>
              </div>
              <div className="divide-y divide-border/40">
                {topPosts.map((post: any, i: number) => {
                  const eng = (post.likes_count || 0) + (post.comments_count || 0);
                  const caption = post.caption?.slice(0, 80) || "Sem legenda";
                  const platforms: string[] = post.platforms || [];
                  return (
                    <div key={post.id} className="flex items-start gap-3 px-5 py-3">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-black text-primary">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{caption}{post.caption?.length > 80 ? "..." : ""}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1"><Heart className="h-3 w-3 text-red-400" /> {post.likes_count || 0}</span>
                          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3 text-blue-400" /> {post.comments_count || 0}</span>
                          <span className="flex items-center gap-1"><Eye className="h-3 w-3 text-violet-400" /> {fmtNum(post.reach_count || 0)}</span>
                          {platforms.includes("instagram") && <span className="text-pink-500 font-bold">IG</span>}
                          {platforms.includes("facebook") && <span className="text-blue-500 font-bold">FB</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-black text-foreground">{fmtNum(eng)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Relatório WhatsApp */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">
                  Relatório para WhatsApp
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
                <button
                  onClick={handleWhatsApp}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                  WhatsApp
                </button>
              </div>
            </div>
            <div className="p-5">
              <pre
                ref={reportRef}
                className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80 max-h-[400px] overflow-y-auto custom-scrollbar"
              >
                {reportText}
              </pre>
            </div>
          </div>

          {/* Empty state */}
          {!isLoading && publishedPosts.length === 0 && isConnected && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold text-foreground">Nenhuma publicação no período</p>
              <p className="text-xs text-muted-foreground mt-1">Ajuste o período ou publique conteúdo pelo Social Media.</p>
              <Link
                to="/social"
                className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors"
              >
                <Share2 className="h-3.5 w-3.5" /> Ir para Social Media
              </Link>
            </div>
          )}

          {!isConnected && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-10 text-center">
              <Zap className="h-10 w-10 text-yellow-500/40 mx-auto mb-3" />
              <p className="text-sm font-bold text-foreground">Meta não conectado</p>
              <p className="text-xs text-muted-foreground mt-1">Conecte sua conta Meta para ver dados reais de alcance e engajamento.</p>
              <Link
                to="/config"
                className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity"
              >
                Conectar Meta
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
