import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Share2, ArrowLeft, TrendingUp, Users, Heart,
  MessageCircle, Eye, Globe, BarChart3, Calendar, Copy,
  CheckCircle2, Send, Image, Sparkles, Zap, Settings2,
  ChevronDown, ChevronUp, ToggleLeft, ToggleRight, Hash,
  Smile, AlignLeft, ListChecks, Trophy, PieChart, Minus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/DateRangePicker";

export const Route = createFileRoute("/_app/social-relatorios")({
  head: () => ({ meta: [{ title: "Relatórios Social Media — NC Suite" }] }),
  component: SocialRelatoriosPage,
});

/* ── helpers ────────────────────────────────── */
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}
function fmtPct(n: number) { return n.toFixed(2) + "%"; }

const PRESET_RANGES = [
  { label: "7 dias", days: 7 },
  { label: "15 dias", days: 15 },
  { label: "30 dias", days: 30 },
  { label: "60 dias", days: 60 },
  { label: "90 dias", days: 90 },
];

/* ── section toggle row ─────────────────────── */
function Toggle({ label, icon: Icon, checked, onChange }: {
  label: string; icon: any; checked: boolean; onChange: () => void;
}) {
  return (
    <button
      onClick={onChange}
      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all ${
        checked ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50"
      }`}
    >
      <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{label}</span>
      {checked
        ? <ToggleRight className="h-4 w-4 text-primary" />
        : <ToggleLeft className="h-4 w-4 text-muted-foreground/40" />}
    </button>
  );
}

/* ── main component ─────────────────────────── */
function SocialRelatoriosPage() {
  /* filters */
  const [selectedPageId, setSelectedPageId] = useState<string>("all");
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "facebook" | "instagram">("all");

  /* customisation */
  const [sections, setSections] = useState({
    overview: true,
    organicVsPaid: true,
    topPosts: true,
    followers: true,
    analysis: true,
  });
  const [tone, setTone] = useState<"formal" | "descontraido" | "tecnico">("formal");
  const [useEmojis, setUseEmojis] = useState(true);
  const [customIntro, setCustomIntro] = useState("");
  const [topN, setTopN] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);

  /* copy state */
  const [copied, setCopied] = useState(false);

  /* ── data ──────────────────────────────────── */
  const { data: pages = [] } = useQuery({
    queryKey: ["social_pages_rel"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*");
      return (data as any[]) ?? [];
    },
  });

  const realPages = useMemo(
    () => pages.filter((p: any) => !String(p.page_id || "").startsWith("mock_")),
    [pages],
  );

  const selectedPage = realPages.find((p: any) => p.page_id === selectedPageId || p.id === selectedPageId) ?? null;

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["social_posts_rel", selectedPageId, dateRange.startDate, dateRange.endDate, selectedPlatform],
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

      /* filter by page when a specific one is selected */
      if (selectedPageId !== "all") {
        q = q.eq("page_id", selectedPageId);
      }

      const { data } = await q;
      let rows: any[] = (data as any[]) ?? [];

      /* platform filter (client-side since posts may not have strict platform field) */
      if (selectedPlatform !== "all") {
        rows = rows.filter((p: any) => {
          const plats: string[] = p.platforms || [];
          return selectedPlatform === "instagram"
            ? plats.includes("instagram")
            : plats.includes("facebook");
        });
      }
      return rows;
    },
  });

  /* ── aggregations ──────────────────────────── */
  const published = posts.filter((p: any) => p.status === "published" || p.status === "agendado");
  const organic = published.filter((p: any) => !p.is_paid);
  const paid = published.filter((p: any) => !!p.is_paid);

  const totalReach = published.reduce((s: number, p: any) => s + (p.reach_count || 0), 0);
  const totalImpressions = published.reduce((s: number, p: any) => s + (p.impressions_count || 0), 0);
  const totalLikes = published.reduce((s: number, p: any) => s + (p.likes_count || 0), 0);
  const totalComments = published.reduce((s: number, p: any) => s + (p.comments_count || 0), 0);
  const totalEng = totalLikes + totalComments;
  const engRate = totalImpressions > 0 ? (totalEng / totalImpressions) * 100 : 0;

  /* followers from the selected page or all pages */
  const fbFollowers = selectedPage
    ? (selectedPage.facebook_followers || 0)
    : realPages.reduce((s: number, p: any) => s + (p.facebook_followers || 0), 0);
  const igFollowers = selectedPage
    ? (selectedPage.instagram_followers || 0)
    : realPages.reduce((s: number, p: any) => s + (p.instagram_followers || 0), 0);

  const topPosts = [...published]
    .sort((a: any, b: any) => {
      const ea = (a.likes_count || 0) + (a.comments_count || 0);
      const eb = (b.likes_count || 0) + (b.comments_count || 0);
      return eb - ea;
    })
    .slice(0, topN);

  const periodLabel = `${format(dateRange.startDate, "dd/MM/yyyy", { locale: ptBR })} – ${format(dateRange.endDate, "dd/MM/yyyy", { locale: ptBR })}`;
  const pageLabel = selectedPage ? selectedPage.page_name : (realPages.length > 0 ? realPages.map((p: any) => p.page_name).join(", ") : "Páginas");
  const isConnected = realPages.length > 0;

  /* ── report text generator ─────────────────── */
  const reportText = useMemo(() => {
    const E = useEmojis;
    const lines: string[] = [];
    const ic = (emoji: string, fallback = "") => E ? emoji : fallback;

    /* header */
    lines.push(`${ic("📊")} *RELATÓRIO SOCIAL MEDIA*`);
    lines.push(`${ic("📱")} ${pageLabel}`);
    lines.push(`${ic("📅")} Período: ${periodLabel}`);
    if (selectedPlatform !== "all") lines.push(`${ic("🔍")} Plataforma: ${selectedPlatform === "instagram" ? "Instagram" : "Facebook"}`);
    if (customIntro) {
      lines.push(``);
      lines.push(customIntro);
    }
    lines.push(``);

    /* overview */
    if (sections.overview) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`${ic("📈")} *VISÃO GERAL*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      lines.push(`${ic("•", "-")} Publicações: *${published.length}*`);
      lines.push(`  ├ Orgânicas: ${organic.length}`);
      lines.push(`  └ Pagas/Impulsionadas: ${paid.length}`);
      lines.push(``);
      lines.push(`${ic("•", "-")} Alcance total: *${fmtNum(totalReach)}*`);
      lines.push(`${ic("•", "-")} Impressões totais: *${fmtNum(totalImpressions)}*`);
      lines.push(`${ic("•", "-")} Engajamentos: *${fmtNum(totalEng)}*`);
      lines.push(`  ├ ${ic("❤️","*")} Curtidas: ${fmtNum(totalLikes)}`);
      lines.push(`  └ ${ic("💬","*")} Comentários: ${fmtNum(totalComments)}`);
      lines.push(`${ic("•", "-")} Taxa de engajamento: *${fmtPct(engRate)}*`);
      lines.push(``);
    }

    /* followers */
    if (sections.followers && (fbFollowers > 0 || igFollowers > 0)) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`${ic("👥")} *SEGUIDORES*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      if (fbFollowers > 0) lines.push(`${ic("•", "-")} Facebook: *${fmtNum(fbFollowers)}* seguidores`);
      if (igFollowers > 0) lines.push(`${ic("•", "-")} Instagram: *${fmtNum(igFollowers)}* seguidores`);
      lines.push(``);
    }

    /* organic vs paid */
    if (sections.organicVsPaid && published.length > 0) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`${ic("📊")} *ORGÂNICO vs PAGO*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      const orgPct = published.length > 0 ? Math.round((organic.length / published.length) * 100) : 0;
      const paidPct = 100 - orgPct;
      lines.push(`${ic("🌱", "+")} Orgânico: ${organic.length} posts (${orgPct}%)`);
      lines.push(`${ic("💰", "$")} Pago/Impulsionado: ${paid.length} posts (${paidPct}%)`);
      if (tone === "formal") {
        lines.push(``);
        lines.push(`${orgPct >= 80 ? "A estratégia se baseia predominantemente em conteúdo orgânico." : paid.length > organic.length ? "O investimento em tráfego pago foi predominante no período." : "A estratégia combinou conteúdo orgânico e impulsionamento."}`);
      } else if (tone === "descontraido") {
        lines.push(``);
        lines.push(`${orgPct >= 80 ? ic("✨") + " Quase tudo orgânico — ótimo trabalho de conteúdo!" : ic("🚀") + " Impulsionamento em ação para maximizar o alcance!"}`);
      }
      lines.push(``);
    }

    /* top posts */
    if (sections.topPosts && topPosts.length > 0) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`${ic("🏆")} *TOP ${topPosts.length} POSTS*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      topPosts.forEach((p: any, i: number) => {
        const cap = p.caption ? p.caption.slice(0, 60) + (p.caption.length > 60 ? "..." : "") : "Sem legenda";
        lines.push(`${i + 1}. ${cap}`);
        lines.push(`   ${ic("❤️","*")} ${p.likes_count || 0}  ${ic("💬","#")} ${p.comments_count || 0}  ${ic("👁️","^")} ${fmtNum(p.reach_count || 0)}`);
        lines.push(``);
      });
    }

    /* analysis */
    if (sections.analysis) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`${ic("✅")} *ANÁLISE*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(``);
      if (published.length === 0) {
        lines.push("Nenhuma publicação registrada no período selecionado.");
      } else if (tone === "tecnico") {
        lines.push(`Taxa de engajamento: ${fmtPct(engRate)} | Alcance médio por post: ${fmtNum(Math.round(totalReach / published.length))} | CPE (estimado): —`);
        lines.push(`Performance: ${engRate >= 3 ? "ACIMA DA MÉDIA" : engRate >= 1 ? "NA MÉDIA" : "ABAIXO DA MÉDIA"}`);
      } else if (tone === "descontraido") {
        lines.push(engRate >= 3
          ? ic("🔥") + ` Engajamento incrível de ${fmtPct(engRate)}! O público está adorando o conteúdo.`
          : engRate >= 1
          ? ic("👍") + ` Bom engajamento de ${fmtPct(engRate)}. Consistência é a chave!`
          : ic("💡") + ` Engajamento de ${fmtPct(engRate)}. Vamos impulsionar os próximos posts para ampliar o alcance!`);
      } else {
        lines.push(engRate >= 3
          ? `A taxa de engajamento de ${fmtPct(engRate)} supera a média do setor, evidenciando alta relevância do conteúdo para o público.`
          : engRate >= 1
          ? `A taxa de engajamento de ${fmtPct(engRate)} está dentro da média esperada para o segmento.`
          : `A taxa de engajamento de ${fmtPct(engRate)} indica oportunidade para investimento em distribuição paga dos posts estratégicos.`);
      }
      lines.push(``);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(``);
    lines.push(`_Relatório gerado por NC Performance Suite_`);
    lines.push(`_${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}_`);

    return lines.join("\n");
  }, [published, organic, paid, totalReach, totalImpressions, totalLikes, totalComments,
      totalEng, engRate, fbFollowers, igFollowers, topPosts, pageLabel, periodLabel,
      sections, tone, useEmojis, customIntro, selectedPlatform, topN]);

  /* ── actions ───────────────────────────────── */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      toast.success("Relatório copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Erro ao copiar. Selecione o texto manualmente.");
    }
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank");
  };

  /* ── kpi cards ─────────────────────────────── */
  const kpis = [
    { label: "Posts", value: published.length, sub: `${organic.length} org · ${paid.length} pago`, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20", icon: Image },
    { label: "Alcance", value: fmtNum(totalReach), sub: "pessoas únicas", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Globe },
    { label: "Impressões", value: fmtNum(totalImpressions), sub: "visualizações", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20", icon: Eye },
    { label: "Engajamentos", value: fmtNum(totalEng), sub: `${fmtNum(totalLikes)} ❤ · ${fmtNum(totalComments)} 💬`, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", icon: Heart },
    {
      label: "Taxa Eng.",
      value: fmtPct(engRate),
      sub: engRate >= 3 ? "Excelente" : engRate >= 1 ? "Bom" : "Baixo",
      color: engRate >= 3 ? "text-emerald-500" : engRate >= 1 ? "text-yellow-500" : "text-red-400",
      bg: engRate >= 3 ? "bg-emerald-500/10" : engRate >= 1 ? "bg-yellow-500/10" : "bg-red-400/10",
      border: engRate >= 3 ? "border-emerald-500/20" : engRate >= 1 ? "border-yellow-500/20" : "border-red-400/20",
      icon: TrendingUp,
    },
    { label: "Seguidores", value: fmtNum(fbFollowers + igFollowers), sub: `FB ${fmtNum(fbFollowers)} · IG ${fmtNum(igFollowers)}`, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20", icon: Users },
  ];

  /* ══════════════════════════════════════════════
      RENDER
  ══════════════════════════════════════════════ */
  return (
    <div className="space-y-5">

      {/* header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Link to="/social" className="flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-pink-500" />
              Relatórios Social Media
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {selectedPage ? selectedPage.page_name : "Todas as páginas"} · {periodLabel}
            </p>
          </div>
        </div>
        {!isConnected && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-500">
            <Zap className="h-3.5 w-3.5" />
            Meta não conectado
            <Link to="/config" className="underline underline-offset-2">Conectar</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">

        {/* ═══════════════════════════════════════
            LEFT PANEL
        ═══════════════════════════════════════ */}
        <div className="space-y-4">

          {/* PAGE SELECTOR */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Share2 className="h-3 w-3" /> Página
            </h3>

            {/* Todas as páginas */}
            <button
              onClick={() => setSelectedPageId("all")}
              className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold border transition-all ${
                selectedPageId === "all"
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              <span className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5" />
                Todas as páginas
              </span>
              {selectedPageId === "all" && <CheckCircle2 className="h-3.5 w-3.5" />}
            </button>

            {realPages.length === 0 && (
              <p className="text-[10px] text-muted-foreground/60 text-center py-2">Nenhuma página conectada</p>
            )}

            {realPages.map((page: any) => {
              const pageKey = page.page_id || page.id;
              const isSelected = selectedPageId === pageKey;
              return (
                <button
                  key={pageKey}
                  onClick={() => setSelectedPageId(pageKey)}
                  className={`flex w-full items-start justify-between rounded-xl px-3 py-2.5 text-xs font-bold border transition-all ${
                    isSelected
                      ? "border-pink-500/40 bg-pink-500/10 text-pink-500"
                      : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="text-left">
                    <p className={`font-black ${isSelected ? "text-pink-500" : "text-foreground"}`}>{page.page_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {page.facebook_followers > 0 && (
                        <span className="text-[10px] text-blue-500">{fmtNum(page.facebook_followers)} FB</span>
                      )}
                      {page.instagram_followers > 0 && (
                        <span className="text-[10px] text-pink-500">{fmtNum(page.instagram_followers)} IG</span>
                      )}
                    </div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                </button>
              );
            })}
          </div>

          {/* DATE RANGE */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Período
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_RANGES.map(({ label, days }) => (
                <button
                  key={label}
                  onClick={() => setDateRange({ startDate: subDays(new Date(), days - 1), endDate: new Date() })}
                  className="rounded-lg border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-bold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
                >
                  {label}
                </button>
              ))}
            </div>
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
          </div>

          {/* PLATFORM */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Hash className="h-3 w-3" /> Plataforma
            </h3>
            <div className="grid grid-cols-3 gap-1.5">
              {(["all", "facebook", "instagram"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatform(p)}
                  className={`rounded-xl py-2 text-[10px] font-black transition-all ${
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

          {/* CUSTOMISATION */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex w-full items-center justify-between px-4 py-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1.5"><Settings2 className="h-3 w-3" /> Personalizar Relatório</span>
              {showAdvanced ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: "auto" }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 space-y-4 border-t border-border/50 pt-3">

                    {/* sections */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <ListChecks className="h-3 w-3" /> Seções
                      </p>
                      <Toggle label="Visão Geral" icon={BarChart3} checked={sections.overview} onChange={() => setSections(s => ({ ...s, overview: !s.overview }))} />
                      <Toggle label="Seguidores" icon={Users} checked={sections.followers} onChange={() => setSections(s => ({ ...s, followers: !s.followers }))} />
                      <Toggle label="Orgânico vs Pago" icon={PieChart} checked={sections.organicVsPaid} onChange={() => setSections(s => ({ ...s, organicVsPaid: !s.organicVsPaid }))} />
                      <Toggle label="Top Posts" icon={Trophy} checked={sections.topPosts} onChange={() => setSections(s => ({ ...s, topPosts: !s.topPosts }))} />
                      <Toggle label="Análise" icon={Sparkles} checked={sections.analysis} onChange={() => setSections(s => ({ ...s, analysis: !s.analysis }))} />
                    </div>

                    {/* top n */}
                    {sections.topPosts && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Trophy className="h-3 w-3" /> Qtd. Top Posts
                        </p>
                        <div className="flex gap-1.5">
                          {[3, 5, 10].map((n) => (
                            <button
                              key={n}
                              onClick={() => setTopN(n)}
                              className={`flex-1 rounded-xl py-1.5 text-[11px] font-black transition-all ${
                                topN === n ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"
                              }`}
                            >
                              Top {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* tone */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <AlignLeft className="h-3 w-3" /> Tom do Relatório
                      </p>
                      {(["formal", "descontraido", "tecnico"] as const).map((t) => (
                        <button
                          key={t}
                          onClick={() => setTone(t)}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                            tone === t
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          }`}
                        >
                          <span className="text-sm">{t === "formal" ? "📋" : t === "descontraido" ? "😊" : "📐"}</span>
                          {t === "formal" ? "Formal" : t === "descontraido" ? "Descontraído" : "Técnico"}
                        </button>
                      ))}
                    </div>

                    {/* emojis */}
                    <Toggle label="Usar emojis no texto" icon={Smile} checked={useEmojis} onChange={() => setUseEmojis(e => !e)} />

                    {/* custom intro */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> Introdução personalizada
                      </p>
                      <textarea
                        value={customIntro}
                        onChange={(e) => setCustomIntro(e.target.value)}
                        placeholder="Ex: Prezados, segue análise do período..."
                        rows={3}
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:border-primary/50 transition-colors"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ═══════════════════════════════════════
            RIGHT PANEL
        ═══════════════════════════════════════ */}
        <div className="space-y-5 min-w-0">

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
                <p className={`text-xl font-black ${kpi.color}`}>
                  {isLoading ? <span className="animate-pulse">...</span> : kpi.value}
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{kpi.sub}</p>
              </motion.div>
            ))}
          </div>

          {/* ORGANIC VS PAID bar */}
          {sections.organicVsPaid && published.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-1.5">
                <PieChart className="h-3 w-3" /> Distribuição Orgânico vs Pago
              </h3>
              <div className="space-y-3">
                {[
                  { label: "Orgânico", count: organic.length, color: "bg-emerald-500", text: "text-emerald-500" },
                  { label: "Pago / Impulsionado", count: paid.length, color: "bg-violet-500", text: "text-violet-500" },
                ].map(({ label, count, color, text }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${text}`}>{label}</span>
                      <span className="text-xs font-bold text-foreground">
                        {count} posts · {published.length > 0 ? Math.round((count / published.length) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${color}`}
                        initial={{ width: 0 }}
                        animate={{ width: published.length > 0 ? `${(count / published.length) * 100}%` : "0%" }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TOP POSTS */}
          {sections.topPosts && topPosts.length > 0 && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/50 flex items-center gap-2">
                <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Top {topPosts.length} Posts — Mais Engajamento
                </h3>
              </div>
              <div className="divide-y divide-border/40">
                {topPosts.map((post: any, i: number) => {
                  const eng = (post.likes_count || 0) + (post.comments_count || 0);
                  const cap = post.caption?.slice(0, 80) || "Sem legenda";
                  const plats: string[] = post.platforms || [];
                  return (
                    <div key={post.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-1">{cap}{post.caption?.length > 80 ? "…" : ""}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-0.5"><Heart className="h-3 w-3 text-red-400" /> {post.likes_count || 0}</span>
                          <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3 text-blue-400" /> {post.comments_count || 0}</span>
                          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3 text-violet-400" /> {fmtNum(post.reach_count || 0)}</span>
                          {plats.includes("instagram") && <span className="text-pink-500 font-bold">IG</span>}
                          {plats.includes("facebook") && <span className="text-blue-500 font-bold">FB</span>}
                          {post.is_paid && <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-black text-violet-500">PAGO</span>}
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-black text-foreground">{fmtNum(eng)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* REPORT PREVIEW */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  Texto do Relatório
                </h3>
                <span className="rounded bg-muted/50 px-2 py-0.5 text-[9px] font-bold text-muted-foreground uppercase">
                  {tone === "formal" ? "Formal" : tone === "descontraido" ? "Descontraído" : "Técnico"}
                  {useEmojis ? " · com emojis" : " · sem emojis"}
                </span>
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
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80 max-h-[420px] overflow-y-auto custom-scrollbar">
                {reportText}
              </pre>
            </div>
          </div>

          {/* empty states */}
          {!isLoading && published.length === 0 && isConnected && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold">Nenhuma publicação no período</p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPageId !== "all"
                  ? "Tente selecionar outra página ou ampliar o período."
                  : "Ajuste o período ou publique conteúdo pelo Social Media."}
              </p>
              <Link to="/social" className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition-colors">
                <Share2 className="h-3.5 w-3.5" /> Ir para Social Media
              </Link>
            </div>
          )}

          {!isConnected && (
            <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-10 text-center">
              <Zap className="h-10 w-10 text-yellow-500/40 mx-auto mb-3" />
              <p className="text-sm font-bold">Meta não conectado</p>
              <p className="text-xs text-muted-foreground mt-1">Conecte sua conta Meta para ver dados reais.</p>
              <Link to="/config" className="inline-flex items-center gap-1.5 mt-4 rounded-xl bg-primary text-primary-foreground px-4 py-2 text-xs font-bold hover:opacity-90 transition-opacity">
                Conectar Meta
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
