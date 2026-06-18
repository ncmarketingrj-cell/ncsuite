import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Share2, ArrowLeft, TrendingUp, Users, Heart,
  MessageCircle, Eye, Globe, BarChart3, Calendar, Copy,
  CheckCircle2, Send, Image, Sparkles, Zap, Settings2,
  ChevronDown, ToggleLeft, ToggleRight,
  Smile, AlignLeft, ListChecks, Trophy, PieChart,
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

/* ─── helpers ──────────────────────────────────────── */
function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}
function fmtPct(n: number) { return n.toFixed(2) + "%"; }

const PRESETS = [
  { label: "7d", days: 7 }, { label: "15d", days: 15 },
  { label: "30d", days: 30 }, { label: "60d", days: 60 }, { label: "90d", days: 90 },
];

function Toggle({ label, icon: Icon, checked, onChange }: {
  label: string; icon: any; checked: boolean; onChange: () => void;
}) {
  return (
    <button onClick={onChange} className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold transition-all border ${
      checked ? "bg-primary/10 text-primary border-primary/20" : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted/50"
    }`}>
      <span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{label}</span>
      {checked ? <ToggleRight className="h-4 w-4 text-primary" /> : <ToggleLeft className="h-4 w-4 opacity-30" />}
    </button>
  );
}

/* ─── main ─────────────────────────────────────────── */
function SocialRelatoriosPage() {
  /* ── filters ── */
  const [selectedPageId, setSelectedPageId] = useState<string>("all");
  const [pageDropdownOpen, setPageDropdownOpen] = useState(false);
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });
  const [selectedPlatform, setSelectedPlatform] = useState<"all" | "facebook" | "instagram">("all");

  /* ── customisation ── */
  const [sections, setSections] = useState({
    overview: true, organicVsPaid: true, topPosts: true, followers: true, analysis: true,
  });
  const [tone, setTone] = useState<"formal" | "descontraido" | "tecnico">("formal");
  const [useEmojis, setUseEmojis] = useState(true);
  const [customIntro, setCustomIntro] = useState("");
  const [topN, setTopN] = useState(5);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [copied, setCopied] = useState(false);

  /* ── pages ── */
  const { data: pages = [] } = useQuery({
    queryKey: ["sr_pages"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*");
      return (data as any[]) ?? [];
    },
  });
  const realPages = pages.filter((p: any) => !String(p.page_id ?? "").startsWith("mock_"));
  const selectedPage = realPages.find((p: any) => (p.page_id ?? p.id) === selectedPageId) ?? null;
  const isConnected = realPages.length > 0;

  /* ── posts ── */
  const { data: rawPosts = [], isLoading } = useQuery({
    queryKey: ["sr_posts", selectedPageId, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startIso = startOfDay(dateRange.startDate).toISOString();
      const endIso   = endOfDay(dateRange.endDate).toISOString();

      /* use scheduled_at for date range since that's the real post date */
      const { data } = await (supabase as any)
        .from("social_posts")
        .select("*")
        .gte("scheduled_at", startIso)
        .lte("scheduled_at", endIso)
        .order("scheduled_at", { ascending: false });

      return (data as any[]) ?? [];
    },
  });

  /* client-side page filter (page_id on post = social_pages.page_id) */
  const posts = selectedPageId === "all"
    ? rawPosts
    : rawPosts.filter((p: any) => p.page_id === selectedPageId);

  /* client-side platform filter (platform is a string, not array) */
  const platformPosts = selectedPlatform === "all"
    ? posts
    : posts.filter((p: any) => {
        const pl: string = (p.platform || "").toLowerCase();
        return selectedPlatform === "instagram" ? pl.includes("instagram") : pl.includes("facebook");
      });

  /* status buckets */
  const published  = platformPosts.filter((p: any) => p.status === "published");
  const scheduled  = platformPosts.filter((p: any) => p.status === "scheduled");
  const allCounted = platformPosts; /* total for display */

  /* organic / paid */
  const organic = published.filter((p: any) => !p.is_paid);
  const paid    = published.filter((p: any) => !!p.is_paid);

  /* aggregate metrics from published posts */
  const totalReach       = published.reduce((s: number, p: any) => s + (Number(p.reach_count) || 0), 0);
  const totalImpressions = published.reduce((s: number, p: any) => s + (Number(p.impressions_count) || 0), 0);
  const totalLikes       = published.reduce((s: number, p: any) => s + (Number(p.likes_count) || 0), 0);
  const totalComments    = published.reduce((s: number, p: any) => s + (Number(p.comments_count) || 0), 0);
  const totalEng         = totalLikes + totalComments;
  const engRate          = totalImpressions > 0 ? (totalEng / totalImpressions) * 100 : 0;

  /* followers */
  const fbFollowers = selectedPage
    ? Number(selectedPage.facebook_followers || 0)
    : realPages.reduce((s: number, p: any) => s + Number(p.facebook_followers || 0), 0);
  const igFollowers = selectedPage
    ? Number(selectedPage.instagram_followers || 0)
    : realPages.reduce((s: number, p: any) => s + Number(p.instagram_followers || 0), 0);

  /* top posts sorted by engagement */
  const topPosts = [...published]
    .sort((a: any, b: any) =>
      (Number(b.likes_count || 0) + Number(b.comments_count || 0)) -
      (Number(a.likes_count || 0) + Number(a.comments_count || 0))
    )
    .slice(0, topN);

  /* labels */
  const periodLabel = `${format(dateRange.startDate, "dd/MM/yyyy", { locale: ptBR })} – ${format(dateRange.endDate, "dd/MM/yyyy", { locale: ptBR })}`;
  const pageLabel   = selectedPage
    ? selectedPage.page_name
    : realPages.map((p: any) => p.page_name).join(", ") || "Todas as páginas";

  /* ─── report text — computed directly, always fresh ── */
  const E = useEmojis;
  const ic = (emoji: string, fallback = "") => E ? emoji : fallback;

  const reportLines: string[] = [];

  reportLines.push(`${ic("📊")} *RELATÓRIO SOCIAL MEDIA*`);
  reportLines.push(`${ic("📱")} ${pageLabel}`);
  reportLines.push(`${ic("📅")} Período: ${periodLabel}`);
  if (selectedPlatform !== "all") reportLines.push(`${ic("🔍")} Plataforma: ${selectedPlatform === "instagram" ? "Instagram" : "Facebook"}`);
  if (customIntro) { reportLines.push(``); reportLines.push(customIntro); }
  reportLines.push(``);

  if (sections.overview) {
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(`${ic("📈")} *VISÃO GERAL*`);
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(``);
    reportLines.push(`${ic("•", "-")} Publicações no período: *${allCounted.length}*`);
    if (published.length !== allCounted.length) {
      reportLines.push(`  ├ Publicados: ${published.length}`);
      reportLines.push(`  └ Agendados: ${scheduled.length}`);
    }
    if (published.length > 0 && (organic.length > 0 || paid.length > 0)) {
      reportLines.push(`  ├ Orgânicos: ${organic.length}`);
      reportLines.push(`  └ Pagos/Impulsionados: ${paid.length}`);
    }
    reportLines.push(``);
    if (totalReach > 0 || totalImpressions > 0) {
      reportLines.push(`${ic("•", "-")} Alcance total: *${fmtNum(totalReach)}*`);
      reportLines.push(`${ic("•", "-")} Impressões: *${fmtNum(totalImpressions)}*`);
      reportLines.push(`${ic("•", "-")} Engajamentos: *${fmtNum(totalEng)}*`);
      reportLines.push(`  ├ ${ic("❤️","*")} Curtidas: ${fmtNum(totalLikes)}`);
      reportLines.push(`  └ ${ic("💬","#")} Comentários: ${fmtNum(totalComments)}`);
      if (engRate > 0) reportLines.push(`${ic("•", "-")} Taxa de engajamento: *${fmtPct(engRate)}*`);
    } else {
      reportLines.push(`${ic("ℹ️","i")} Métricas de alcance serão sincronizadas após a publicação via Meta.`);
    }
    reportLines.push(``);
  }

  if (sections.followers && (fbFollowers > 0 || igFollowers > 0)) {
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(`${ic("👥")} *SEGUIDORES*`);
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(``);
    if (fbFollowers > 0) reportLines.push(`${ic("•", "-")} Facebook: *${fmtNum(fbFollowers)}* seguidores`);
    if (igFollowers > 0) reportLines.push(`${ic("•", "-")} Instagram: *${fmtNum(igFollowers)}* seguidores`);
    reportLines.push(``);
  }

  if (sections.organicVsPaid && published.length > 0) {
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(`${ic("📊")} *ORGÂNICO vs PAGO*`);
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(``);
    const orgPct  = published.length ? Math.round((organic.length / published.length) * 100) : 0;
    const paidPct = 100 - orgPct;
    reportLines.push(`${ic("🌱", "+")} Orgânico: ${organic.length} posts (${orgPct}%)`);
    reportLines.push(`${ic("💰", "$")} Pago/Impulsionado: ${paid.length} posts (${paidPct}%)`);
    if (tone !== "tecnico") {
      reportLines.push(``);
      reportLines.push(
        orgPct >= 80
          ? (tone === "descontraido" ? ic("✨") + " Quase tudo orgânico — ótimo trabalho de conteúdo!" : "A estratégia se baseia predominantemente em conteúdo orgânico.")
          : paid.length > organic.length
          ? (tone === "descontraido" ? ic("🚀") + " Impulsionamento em ação para maximizar o alcance!" : "O investimento em tráfego pago foi predominante no período.")
          : "A estratégia combinou conteúdo orgânico e impulsionamento."
      );
    }
    reportLines.push(``);
  }

  if (sections.topPosts && topPosts.length > 0) {
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(`${ic("🏆")} *TOP ${topPosts.length} POSTS*`);
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(``);
    topPosts.forEach((p: any, i: number) => {
      const text = (p.content || p.caption || p.title || "Sem conteúdo").slice(0, 60);
      const more = (p.content || p.caption || p.title || "").length > 60 ? "…" : "";
      reportLines.push(`${i + 1}. ${text}${more}`);
      reportLines.push(`   ${ic("❤️","*")} ${Number(p.likes_count)||0}  ${ic("💬","#")} ${Number(p.comments_count)||0}  ${ic("👁️","^")} ${fmtNum(Number(p.reach_count)||0)}`);
      reportLines.push(``);
    });
  }

  if (sections.analysis) {
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(`${ic("✅")} *ANÁLISE*`);
    reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
    reportLines.push(``);
    if (allCounted.length === 0) {
      reportLines.push("Nenhuma publicação registrada no período selecionado.");
    } else if (tone === "tecnico") {
      reportLines.push(`Posts: ${allCounted.length} | Publicados: ${published.length} | Agendados: ${scheduled.length}`);
      if (engRate > 0) {
        reportLines.push(`Taxa de engajamento: ${fmtPct(engRate)} | Alcance médio/post: ${published.length ? fmtNum(Math.round(totalReach / published.length)) : "—"}`);
        reportLines.push(`Performance: ${engRate >= 3 ? "ACIMA DA MÉDIA" : engRate >= 1 ? "NA MÉDIA" : "ABAIXO DA MÉDIA"}`);
      }
    } else if (tone === "descontraido") {
      reportLines.push(
        allCounted.length > 0 && engRate >= 3
          ? ic("🔥") + ` Engajamento incrível de ${fmtPct(engRate)}! O público está adorando o conteúdo.`
          : engRate >= 1
          ? ic("👍") + ` Bom engajamento de ${fmtPct(engRate)}. Consistência é a chave!`
          : ic("💡") + ` ${published.length} posts publicados no período. Continue criando conteúdo relevante para crescer o engajamento!`
      );
    } else {
      reportLines.push(
        engRate >= 3
          ? `A taxa de engajamento de ${fmtPct(engRate)} supera a média do setor.`
          : engRate >= 1
          ? `A taxa de engajamento de ${fmtPct(engRate)} está dentro da média esperada.`
          : `Foram publicados ${published.length} post${published.length !== 1 ? "s" : ""} no período, com ${allCounted.length - published.length} ainda agendado${allCounted.length - published.length !== 1 ? "s" : ""}.`
      );
    }
    reportLines.push(``);
  }

  reportLines.push(`━━━━━━━━━━━━━━━━━━━━━━`);
  reportLines.push(``);
  reportLines.push(`_Relatório gerado por NC Performance Suite_`);
  reportLines.push(`_${format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}_`);

  const reportText = reportLines.join("\n");

  /* ── actions ── */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      toast.success("Relatório copiado!");
      setTimeout(() => setCopied(false), 3000);
    } catch { toast.error("Erro ao copiar."); }
  };

  const handleWhatsApp = () => window.open(`https://wa.me/?text=${encodeURIComponent(reportText)}`, "_blank");

  /* ── kpis ── */
  const kpis = [
    { label: "Posts no período", value: allCounted.length, sub: `${published.length} publicados · ${scheduled.length} agendados`, color: "text-pink-500", bg: "bg-pink-500/10", border: "border-pink-500/20", icon: Image },
    { label: "Alcance", value: totalReach > 0 ? fmtNum(totalReach) : "—", sub: totalReach > 0 ? "pessoas únicas" : "aguardando sync", color: "text-blue-500", bg: "bg-blue-500/10", border: "border-blue-500/20", icon: Globe },
    { label: "Impressões", value: totalImpressions > 0 ? fmtNum(totalImpressions) : "—", sub: totalImpressions > 0 ? "visualizações" : "aguardando sync", color: "text-violet-500", bg: "bg-violet-500/10", border: "border-violet-500/20", icon: Eye },
    { label: "Engajamentos", value: totalEng > 0 ? fmtNum(totalEng) : "—", sub: `${fmtNum(totalLikes)} ❤ · ${fmtNum(totalComments)} 💬`, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", icon: Heart },
    {
      label: "Taxa Eng.", value: engRate > 0 ? fmtPct(engRate) : "—",
      sub: engRate >= 3 ? "Excelente" : engRate >= 1 ? "Bom" : engRate > 0 ? "Baixo" : "sem dados",
      color: engRate >= 3 ? "text-emerald-500" : engRate >= 1 ? "text-yellow-500" : "text-muted-foreground",
      bg: engRate >= 3 ? "bg-emerald-500/10" : engRate >= 1 ? "bg-yellow-500/10" : "bg-muted/30",
      border: engRate >= 3 ? "border-emerald-500/20" : engRate >= 1 ? "border-yellow-500/20" : "border-border",
      icon: TrendingUp,
    },
    { label: "Seguidores", value: fmtNum(fbFollowers + igFollowers), sub: `FB ${fmtNum(fbFollowers)} · IG ${fmtNum(igFollowers)}`, color: "text-cyan-500", bg: "bg-cyan-500/10", border: "border-cyan-500/20", icon: Users },
  ];

  /* ══════════════════════════════════════
      RENDER
  ══════════════════════════════════════ */
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
              <BarChart3 className="h-5 w-5 text-pink-500" /> Relatórios Social Media
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">{pageLabel} · {periodLabel}</p>
          </div>
        </div>
        {!isConnected && (
          <div className="flex items-center gap-2 rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs font-bold text-yellow-500">
            <Zap className="h-3.5 w-3.5" /> Meta não conectado
            <Link to="/config" className="underline underline-offset-2">Conectar</Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-5">

        {/* ══ LEFT PANEL ══ */}
        <div className="space-y-3">

          {/* PAGE DROPDOWN */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Share2 className="h-3 w-3" /> Página
            </p>
            <div className="relative">
              <button
                onClick={() => setPageDropdownOpen(o => !o)}
                className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-xs font-bold hover:bg-muted/50 transition-all"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate">{selectedPage ? selectedPage.page_name : "Todas as páginas"}</span>
                </span>
                <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${pageDropdownOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {pageDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPageDropdownOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 6, scale: 0.97 }}
                      transition={{ duration: 0.13 }}
                      className="absolute left-0 right-0 top-full z-50 mt-1.5 rounded-2xl border border-border bg-card p-1.5 shadow-2xl"
                    >
                      <button
                        onClick={() => { setSelectedPageId("all"); setPageDropdownOpen(false); }}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${selectedPageId === "all" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                      >
                        <span className="flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Todas as páginas</span>
                        {selectedPageId === "all" && <CheckCircle2 className="h-3.5 w-3.5" />}
                      </button>
                      {realPages.length > 0 && <div className="my-1 border-t border-border/50" />}
                      {realPages.length === 0 && <p className="text-[10px] text-muted-foreground/60 text-center py-3">Nenhuma página conectada</p>}
                      {realPages.map((page: any) => {
                        const key = page.page_id ?? page.id;
                        const isSel = selectedPageId === key;
                        return (
                          <button
                            key={key}
                            onClick={() => { setSelectedPageId(key); setPageDropdownOpen(false); }}
                            className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${isSel ? "bg-pink-500/10 text-pink-500" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`}
                          >
                            <div className="text-left min-w-0">
                              <p className={`font-black truncate ${isSel ? "text-pink-500" : "text-foreground"}`}>{page.page_name}</p>
                              <div className="flex gap-2 mt-0.5">
                                {page.facebook_followers > 0 && <span className="text-[10px] text-blue-500">{fmtNum(page.facebook_followers)} FB</span>}
                                {page.instagram_followers > 0 && <span className="text-[10px] text-pink-500">{fmtNum(page.instagram_followers)} IG</span>}
                              </div>
                            </div>
                            {isSel && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 ml-2" />}
                          </button>
                        );
                      })}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* PERIOD */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Período
            </p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(({ label, days }) => (
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
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Plataforma</p>
            <div className="grid grid-cols-3 gap-1.5">
              {(["all", "facebook", "instagram"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setSelectedPlatform(p)}
                  className={`rounded-xl py-2 text-[10px] font-black transition-all ${selectedPlatform === p ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}
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
              <span className="flex items-center gap-1.5"><Settings2 className="h-3 w-3" /> Personalizar</span>
              <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-4">

                    {/* sections */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <ListChecks className="h-3 w-3" /> Seções
                      </p>
                      <Toggle label="Visão Geral"      icon={BarChart3}  checked={sections.overview}       onChange={() => setSections(s => ({ ...s, overview: !s.overview }))} />
                      <Toggle label="Seguidores"       icon={Users}      checked={sections.followers}      onChange={() => setSections(s => ({ ...s, followers: !s.followers }))} />
                      <Toggle label="Orgânico vs Pago" icon={PieChart}   checked={sections.organicVsPaid}  onChange={() => setSections(s => ({ ...s, organicVsPaid: !s.organicVsPaid }))} />
                      <Toggle label="Top Posts"        icon={Trophy}     checked={sections.topPosts}       onChange={() => setSections(s => ({ ...s, topPosts: !s.topPosts }))} />
                      <Toggle label="Análise"          icon={Sparkles}   checked={sections.analysis}       onChange={() => setSections(s => ({ ...s, analysis: !s.analysis }))} />
                    </div>

                    {/* top n */}
                    {sections.topPosts && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Trophy className="h-3 w-3" /> Top Posts
                        </p>
                        <div className="flex gap-1.5">
                          {[3, 5, 10].map(n => (
                            <button key={n} onClick={() => setTopN(n)}
                              className={`flex-1 rounded-xl py-1.5 text-[11px] font-black transition-all ${topN === n ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted"}`}>
                              Top {n}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* tone */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <AlignLeft className="h-3 w-3" /> Tom
                      </p>
                      {(["formal", "descontraido", "tecnico"] as const).map(t => (
                        <button key={t} onClick={() => setTone(t)}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold border transition-all ${
                            tone === t ? "border-primary/40 bg-primary/10 text-primary" : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50"
                          }`}>
                          <span className="text-sm">{t === "formal" ? "📋" : t === "descontraido" ? "😊" : "📐"}</span>
                          {t === "formal" ? "Formal" : t === "descontraido" ? "Descontraído" : "Técnico"}
                        </button>
                      ))}
                    </div>

                    {/* emojis */}
                    <Toggle label="Emojis no texto" icon={Smile} checked={useEmojis} onChange={() => setUseEmojis(e => !e)} />

                    {/* custom intro */}
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                        <FileText className="h-3 w-3" /> Introdução
                      </p>
                      <textarea
                        value={customIntro}
                        onChange={e => setCustomIntro(e.target.value)}
                        placeholder="Ex: Prezados, segue análise..."
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

        {/* ══ RIGHT PANEL ══ */}
        <div className="space-y-5 min-w-0">

          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {kpis.map((kpi) => (
              <motion.div key={kpi.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={`rounded-2xl border ${kpi.border} ${kpi.bg} p-4`}>
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

          {/* ORGANIC VS PAID */}
          {sections.organicVsPaid && published.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-1.5">
                <PieChart className="h-3 w-3" /> Distribuição Orgânico vs Pago
              </p>
              <div className="space-y-3">
                {[
                  { label: "Orgânico", count: organic.length, color: "bg-emerald-500", text: "text-emerald-500" },
                  { label: "Pago / Impulsionado", count: paid.length, color: "bg-violet-500", text: "text-violet-500" },
                ].map(({ label, count, color, text }) => (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-bold ${text}`}>{label}</span>
                      <span className="text-xs font-bold">{count} posts · {published.length ? Math.round((count / published.length) * 100) : 0}%</span>
                    </div>
                    <div className="h-2.5 rounded-full bg-muted/40 overflow-hidden">
                      <motion.div className={`h-full rounded-full ${color}`}
                        initial={{ width: 0 }}
                        animate={{ width: published.length ? `${(count / published.length) * 100}%` : "0%" }}
                        transition={{ duration: 0.7, ease: "easeOut" }}
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
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Top {topPosts.length} — Mais Engajamento</p>
              </div>
              <div className="divide-y divide-border/40">
                {topPosts.map((post: any, i: number) => {
                  const text = (post.content || post.caption || post.title || "Sem conteúdo").slice(0, 80);
                  const eng  = Number(post.likes_count || 0) + Number(post.comments_count || 0);
                  return (
                    <div key={post.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-black text-primary">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground line-clamp-1">{text}</p>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-0.5"><Heart className="h-3 w-3 text-red-400" /> {Number(post.likes_count)||0}</span>
                          <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3 text-blue-400" /> {Number(post.comments_count)||0}</span>
                          <span className="flex items-center gap-0.5"><Eye className="h-3 w-3 text-violet-400" /> {fmtNum(Number(post.reach_count)||0)}</span>
                          {post.platform && <span className={`font-bold ${post.platform.includes("instagram") ? "text-pink-500" : "text-blue-500"}`}>{post.platform.includes("instagram") ? "IG" : "FB"}</span>}
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

          {/* REPORT TEXT */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border/50 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-primary" />
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mensagem para WhatsApp</p>
                <span className="rounded bg-muted/50 px-2 py-0.5 text-[9px] font-bold text-muted-foreground uppercase">
                  {tone === "formal" ? "Formal" : tone === "descontraido" ? "Descontraído" : "Técnico"}{useEmojis ? " · emojis" : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/40 px-3 py-1.5 text-[11px] font-bold text-muted-foreground hover:text-foreground transition-colors">
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado!" : "Copiar"}
                </button>
                <button onClick={handleWhatsApp}
                  className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white transition-colors">
                  <Send className="h-3.5 w-3.5" /> WhatsApp
                </button>
              </div>
            </div>
            <div className="p-5">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-foreground/80 max-h-[420px] overflow-y-auto custom-scrollbar">
                {reportText}
              </pre>
            </div>
          </div>

          {/* EMPTY STATES */}
          {!isLoading && allCounted.length === 0 && isConnected && (
            <div className="rounded-2xl border border-border bg-card p-10 text-center">
              <BarChart3 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm font-bold">Nenhuma publicação no período</p>
              <p className="text-xs text-muted-foreground mt-1">
                {selectedPageId !== "all" ? "Tente outra página ou amplie o período." : "Ajuste o período ou crie publicações no Social Media."}
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
              <p className="text-xs text-muted-foreground mt-1">Conecte sua conta para sincronizar métricas reais.</p>
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
