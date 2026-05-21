import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Users, FileText, Video, Table2, Presentation, Link2,
  Upload, ExternalLink, Play, Pause, Trash2, Plus,
  ChevronDown, Eye, EyeOff, X, Maximize2,
  Minimize2, TrendingUp, DollarSign, Target,
  Megaphone, LayoutGrid, Image as ImageIcon, Loader2,
  RefreshCw, Lock, Unlock,
  Globe, FileSpreadsheet, Zap, Layers, Search,
  CheckSquare, Square
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useAuth } from "@/lib/auth";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/reunioes")({
  head: () => ({ meta: [{ title: "Reuniões — NC Suite" }] }),
  component: ReunioesPage,
});

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

// ─── Types ───────────────────────────────────────────────────────────────────

type MediaItem = {
  id: string;
  type: "pdf" | "video" | "spreadsheet" | "powerpoint" | "url" | "google";
  name: string;
  src: string;
  size?: string;
  addedAt: Date;
};

type PanelId = "media" | "data" | "notes";
type CampLevel = "campanhas" | "conjuntos" | "anuncios";

const LEVEL_TABS: { id: CampLevel; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

// ─── Formatters ──────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const fmtNum = (v: number) =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M"
  : v >= 1_000 ? (v / 1_000).toFixed(1) + "k"
  : v.toString();

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function processMetrics(item: any, metrics: any[], startStr: string, endStr: string) {
  const m = (metrics || []).filter((x: any) => {
    if (!x.date) return true;
    const d = x.date.split("T")[0];
    return d >= startStr && d <= endStr;
  });
  const cost = m.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
  const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
  const clicks = m.reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
  const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
  const reach = m.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
  const cpl = conversions > 0 ? cost / conversions : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
  const cpc = clicks > 0 ? cost / clicks : 0;
  const freq = reach > 0 ? impressions / reach : 0;
  return { ...item, t: { cost, conversions, clicks, impressions, reach, cpl, ctr, cpm, cpc, freq } };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function ReunioesPage() {
  const { user } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  // ── Panel visibility ──────────────────────────────────────────────────────
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({
    media: true,
    data: false,
    notes: false,
  });

  // ── Media library ─────────────────────────────────────────────────────────
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlName, setUrlName] = useState("");
  const [googleInput, setGoogleInput] = useState("");
  const [addingType, setAddingType] = useState<"url" | "google" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Data panel state ──────────────────────────────────────────────────────
  const [campLevel, setCampLevel] = useState<CampLevel>("campanhas");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [campSearch, setCampSearch] = useState("");
  const [presenting, setPresenting] = useState(false);
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });
  const [selectedCamps, setSelectedCamps] = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());

  // ── Notes ─────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem("nc_reuniao_notes") || ""; } catch { return ""; }
  });
  const saveNotes = useCallback((v: string) => {
    setNotes(v);
    try { localStorage.setItem("nc_reuniao_notes", v); } catch {}
  }, []);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
      if (e.key === "F5") { e.preventDefault(); setPresenting(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  // ═══════════════════════════════════════════════════════════════════════════
  // DATA QUERIES — same pattern as campanhas.tsx
  // ═══════════════════════════════════════════════════════════════════════════

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    },
  });

  const startStr = getLocalDateStr(dateRange.startDate);
  const endStr = getLocalDateStr(dateRange.endDate);

  const { data: campaigns = [], isLoading: isLoadingCamps, refetch: refetchCamps } = useQuery({
    queryKey: ["reuniao-camps", accountFilter, statusFilter, startStr, endStr],
    enabled: panels.data,
    queryFn: async () => {
      let q = (supabase as any)
        .from("campaigns")
        .select(`id, name, status, budget, external_id, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, reach, date)`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.metrics, startStr, endStr));
    },
  });

  const { data: adSets = [], isLoading: isLoadingAdSets, refetch: refetchAdSets } = useQuery({
    queryKey: ["reuniao-adsets", Array.from(selectedCamps).join(","), statusFilter, startStr, endStr],
    enabled: panels.data && (campLevel === "conjuntos" || campLevel === "anuncios"),
    queryFn: async () => {
      if (selectedCamps.size === 0) return [];
      let q = (supabase as any)
        .from("ad_sets")
        .select(`id, name, status, budget, external_id, campaign_id, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      q = q.in("campaign_id", Array.from(selectedCamps));
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  const { data: ads = [], isLoading: isLoadingAds, refetch: refetchAds } = useQuery({
    queryKey: ["reuniao-ads", Array.from(selectedAdSets).join(","), Array.from(selectedCamps).join(","), statusFilter, startStr, endStr],
    enabled: panels.data && campLevel === "anuncios",
    queryFn: async () => {
      let q = (supabase as any)
        .from("ads")
        .select(`id, name, status, external_id, campaign_id, ad_set_id, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      if (selectedAdSets.size > 0) q = q.in("ad_set_id", Array.from(selectedAdSets));
      else if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      else return [];
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  const isLoading = isLoadingCamps || isLoadingAdSets || isLoadingAds;

  const listData = campLevel === "campanhas" ? campaigns : campLevel === "conjuntos" ? adSets : ads;

  const filtered = useMemo(() =>
    listData.filter((c: any) => !campSearch || c.name?.toLowerCase().includes(campSearch.toLowerCase())),
    [listData, campSearch]
  );

  const selSet = campLevel === "campanhas" ? selectedCamps : campLevel === "conjuntos" ? selectedAdSets : new Set<string>();
  const setSelSet = campLevel === "campanhas" ? setSelectedCamps : campLevel === "conjuntos" ? setSelectedAdSets : (() => {});
  const allSelected = filtered.length > 0 && filtered.every((c: any) => selSet.has(c.id));
  const toggleAll = () => allSelected ? setSelSet(new Set()) : setSelSet(new Set(filtered.map((c: any) => c.id)));
  const toggleOne = (id: string) => { const s = new Set(selSet); s.has(id) ? s.delete(id) : s.add(id); setSelSet(s); };

  // KPI totals from campaigns
  const kpis = useMemo(() => {
    const ativas = campaigns.filter((c: any) => c.status?.toUpperCase() === "ACTIVE").length;
    const gasto = campaigns.reduce((s: number, c: any) => s + c.t.cost, 0);
    const conv = campaigns.reduce((s: number, c: any) => s + c.t.conversions, 0);
    const cpl = conv > 0 ? gasto / conv : 0;
    const impressions = campaigns.reduce((s: number, c: any) => s + c.t.impressions, 0);
    return { ativas, total: campaigns.length, gasto, conv, cpl, impressions };
  }, [campaigns]);

  // Table footer totals
  const totals = useMemo(() => ({
    cost: filtered.reduce((s: number, c: any) => s + c.t.cost, 0),
    conv: filtered.reduce((s: number, c: any) => s + c.t.conversions, 0),
    impr: filtered.reduce((s: number, c: any) => s + c.t.impressions, 0),
    reach: filtered.reduce((s: number, c: any) => s + c.t.reach, 0),
    clicks: filtered.reduce((s: number, c: any) => s + c.t.clicks, 0),
  }), [filtered]);

  const refetchAll = () => { refetchCamps(); refetchAdSets(); refetchAds(); };

  // ═══════════════════════════════════════════════════════════════════════════
  // MEDIA HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const newItems: MediaItem[] = files.map(f => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const type: MediaItem["type"] =
        ext === "pdf" ? "pdf"
        : ["mp4", "webm", "mov", "avi"].includes(ext) ? "video"
        : ["xlsx", "xls", "csv"].includes(ext) ? "spreadsheet"
        : ["pptx", "ppt"].includes(ext) ? "powerpoint"
        : "url";
      return {
        id: crypto.randomUUID(),
        type,
        name: f.name,
        src: URL.createObjectURL(f),
        size: (f.size / 1024 / 1024).toFixed(1) + " MB",
        addedAt: new Date(),
      };
    });
    setMediaItems(prev => [...newItems, ...prev]);
    if (newItems[0]) { setActiveMedia(newItems[0]); setPanels(p => ({ ...p, media: true })); }
    toast.success(`${newItems.length} arquivo(s) adicionado(s)`);
    e.target.value = "";
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const ext = urlInput.split(".").pop()?.split("?")[0].toLowerCase() || "";
    const type: MediaItem["type"] =
      urlInput.includes("docs.google.com") ? "google"
      : ext === "pdf" ? "pdf"
      : ["mp4", "webm"].includes(ext) ? "video"
      : "url";
    const item: MediaItem = {
      id: crypto.randomUUID(),
      type,
      name: urlName.trim() || urlInput.split("/").pop()?.slice(0, 40) || "Link",
      src: urlInput.trim(),
      addedAt: new Date(),
    };
    setMediaItems(prev => [item, ...prev]);
    setActiveMedia(item);
    setPanels(p => ({ ...p, media: true }));
    setUrlInput(""); setUrlName(""); setAddingType(null);
    toast.success("Conteúdo adicionado");
  };

  const handleAddGoogle = () => {
    if (!googleInput.trim()) return;
    let src = googleInput.trim();
    if (src.includes("docs.google.com/spreadsheets") && !src.includes("/pubhtml"))
      src = src.replace(/\/edit.*$/, "/pubhtml?widget=true&headers=false");
    else if (src.includes("docs.google.com/presentation") && !src.includes("/embed"))
      src = src.replace(/\/edit.*$/, "/embed?start=false&loop=false&delayms=3000");
    else if (src.includes("docs.google.com/document") && !src.includes("/pub"))
      src = src.replace(/\/edit.*$/, "/pub?embedded=true");
    const item: MediaItem = {
      id: crypto.randomUUID(),
      type: "google",
      name: googleInput.includes("spreadsheets") ? "Google Sheets"
        : googleInput.includes("presentation") ? "Google Slides"
        : "Google Docs",
      src,
      addedAt: new Date(),
    };
    setMediaItems(prev => [item, ...prev]);
    setActiveMedia(item);
    setPanels(p => ({ ...p, media: true }));
    setGoogleInput(""); setAddingType(null);
    toast.success("Google vinculado");
  };

  const removeMedia = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id));
    if (activeMedia?.id === id) setActiveMedia(mediaItems.find(m => m.id !== id) ?? null);
  };

  const togglePanel = (p: PanelId) => setPanels(prev => ({ ...prev, [p]: !prev[p] }));

  // ── Media icon ────────────────────────────────────────────────────────────
  const mediaTypeIcon = (type: MediaItem["type"]) => {
    if (type === "pdf") return <FileText className="h-4 w-4 text-red-400" />;
    if (type === "video") return <Video className="h-4 w-4 text-purple-400" />;
    if (type === "spreadsheet") return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
    if (type === "powerpoint") return <Presentation className="h-4 w-4 text-orange-400" />;
    if (type === "google") return <Globe className="h-4 w-4 text-blue-400" />;
    return <Link2 className="h-4 w-4 text-muted-foreground" />;
  };

  // ── Media preview ─────────────────────────────────────────────────────────
  const renderPreview = (item: MediaItem) => {
    if (item.type === "video")
      return <video src={item.src} controls className="w-full h-full object-contain bg-black rounded-xl" />;
    if (item.type === "pdf" || item.type === "google" || item.type === "url" || item.type === "spreadsheet" || item.type === "powerpoint") {
      const isSrc = item.src.startsWith("blob:") ? null : item.src;
      if (isSrc)
        return <iframe src={isSrc} title={item.name} className="w-full h-full rounded-xl border-0" allow="fullscreen" />;
    }
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
        <FileSpreadsheet className="h-12 w-12 opacity-30" />
        <p className="text-sm">Pré-visualização indisponível para este formato local.</p>
        <a href={item.src} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-primary hover:underline text-sm">
          <ExternalLink className="h-4 w-4" /> Abrir externamente
        </a>
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className={`flex flex-col min-h-0 flex-1 transition-all duration-500 ${presenting ? "bg-black" : ""}`}>

      {/* ── Header ── */}
      {!presenting && (
        <PageHeader
          icon={<Users className="h-5 w-5" />}
          title="Reuniões"
          subtitle="Ambiente completo para apresentações e reuniões técnicas"
          actions={
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPresenting(true)}
                className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-glow-sm"
              >
                <Play className="h-3.5 w-3.5" />
                Modo Apresentação
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground hover:bg-muted/50 transition-all"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
              <input ref={fileInputRef} type="file" multiple
                accept=".pdf,.mp4,.webm,.mov,.avi,.xlsx,.xls,.csv,.pptx,.ppt"
                className="hidden" onChange={handleFileUpload} />
            </div>
          }
        />
      )}

      {/* ── Presenting bar ── */}
      <AnimatePresence>
        {presenting && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className="flex items-center justify-between px-6 py-3 bg-black/90 backdrop-blur border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="font-black text-primary-foreground text-xs">NC</span>
              </div>
              <span className="text-white/80 text-sm font-semibold">Modo Apresentação</span>
              <span className="text-white/40 text-xs hidden md:block">— F5 para alternar · Esc para sair da tela cheia</span>
            </div>
            <button onClick={() => setPresenting(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-all">
              <X className="h-3.5 w-3.5" /> Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex flex-1 min-h-0 gap-0 transition-all ${presenting ? "p-0" : "p-4 md:p-6 gap-4"}`}>

        {/* ══════════════════════════════════════════
            SIDEBAR
            ══════════════════════════════════════════ */}
        {!presenting && (
          <aside className="hidden xl:flex flex-col gap-3 w-64 shrink-0">

            {/* Panel toggles */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Painéis</p>
              {([
                { id: "media" as PanelId, label: "Mídia & Documentos", icon: FileText, desc: "PDFs, vídeos, slides" },
                { id: "data" as PanelId, label: "Dados de Campanhas", icon: Table2, desc: "Tabela ao vivo do banco" },
                { id: "notes" as PanelId, label: "Anotações", icon: Layers, desc: "Notas da reunião" },
              ] as const).map(({ id, label, icon: Icon, desc }) => (
                <button key={id} onClick={() => togglePanel(id)}
                  className={`w-full flex items-start gap-3 rounded-xl p-3 mb-1.5 text-left transition-all ${
                    panels[id]
                      ? "bg-primary/10 border border-primary/20 text-foreground"
                      : "border border-transparent hover:bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <div className={`mt-0.5 rounded-lg p-1.5 ${panels[id] ? "bg-primary/20" : "bg-muted"}`}>
                    <Icon className={`h-3.5 w-3.5 ${panels[id] ? "text-primary" : ""}`} />
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold leading-none mb-0.5">{label}</p>
                    <p className="text-[10px] text-muted-foreground">{desc}</p>
                  </div>
                  <div className="ml-auto mt-0.5">
                    {panels[id] ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Add content */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Adicionar</p>
              <div className="flex flex-col gap-2">
                <button onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
                  <Upload className="h-3.5 w-3.5" /> Arquivo (PDF, vídeo, PPT, planilha)
                </button>
                <button onClick={() => setAddingType("url")}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground">
                  <Link2 className="h-3.5 w-3.5" /> URL / Embed
                </button>
                <button onClick={() => setAddingType("google")}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-blue-400/30 px-3 py-2.5 text-xs font-medium hover:border-blue-400/50 hover:bg-blue-400/5 transition-all text-muted-foreground hover:text-foreground">
                  <Globe className="h-3.5 w-3.5 text-blue-400" /> Google Sheets / Slides / Docs
                </button>
              </div>
            </div>

            {/* Data controls (when panel is open) */}
            {panels.data && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Tabela</p>
                <div className="flex flex-col gap-2">
                  {isAdmin && (
                    <button onClick={() => setShowAdvanced(p => !p)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                        showAdvanced
                          ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                          : "border border-border hover:bg-muted/50 text-muted-foreground"
                      }`}>
                      {showAdvanced ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      {showAdvanced ? "Métricas avançadas ON" : "Métricas avançadas"}
                    </button>
                  )}
                  <button onClick={refetchAll} disabled={isLoading}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/50 transition-all text-muted-foreground disabled:opacity-50">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                    Atualizar
                  </button>
                </div>
              </div>
            )}

            {/* Media library */}
            {mediaItems.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 flex-1 overflow-hidden flex flex-col">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  Biblioteca ({mediaItems.length})
                </p>
                <div className="flex-1 overflow-y-auto flex flex-col gap-1">
                  {mediaItems.map(item => (
                    <div key={item.id}
                      onClick={() => { setActiveMedia(item); setPanels(p => ({ ...p, media: true })); }}
                      className={`group flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-all ${
                        activeMedia?.id === item.id
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      {mediaTypeIcon(item.type)}
                      <span className="flex-1 text-[11px] font-medium truncate">{item.name}</span>
                      <button onClick={e => { e.stopPropagation(); removeMedia(item.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* ══════════════════════════════════════════
            MAIN CONTENT
            ══════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 gap-4 overflow-y-auto">

          {/* ── URL / Google modals ── */}
          <AnimatePresence>
            {addingType === "url" && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-2xl border border-primary/20 bg-card p-4 shadow-lg">
                <p className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" /> Adicionar por URL
                </p>
                <div className="flex flex-col gap-2">
                  <input autoFocus type="text" placeholder="Nome (opcional)" value={urlName}
                    onChange={e => setUrlName(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all" />
                  <input type="url" placeholder="https://..." value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddUrl()}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all" />
                  <div className="flex gap-2">
                    <button onClick={handleAddUrl} className="flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all">Adicionar</button>
                    <button onClick={() => { setAddingType(null); setUrlInput(""); setUrlName(""); }}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">Cancelar</button>
                  </div>
                </div>
              </motion.div>
            )}
            {addingType === "google" && (
              <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-2xl border border-blue-400/20 bg-card p-4 shadow-lg">
                <p className="text-sm font-bold mb-1 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" /> Vincular Google Drive
                </p>
                <p className="text-xs text-muted-foreground mb-3">Cole a URL do Google Sheets, Slides ou Docs. O arquivo deve estar com acesso "Qualquer pessoa com o link".</p>
                <div className="flex flex-col gap-2">
                  <input autoFocus type="url" placeholder="https://docs.google.com/..." value={googleInput}
                    onChange={e => setGoogleInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddGoogle()}
                    className="rounded-xl border border-blue-400/30 bg-background px-3 py-2 text-sm outline-none focus:border-blue-400/60 transition-all" />
                  <div className="flex gap-2">
                    <button onClick={handleAddGoogle} className="flex-1 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-all">Vincular</button>
                    <button onClick={() => { setAddingType(null); setGoogleInput(""); }}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">Cancelar</button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Empty state ── */}
          {!panels.media && !panels.data && !panels.notes && !presenting && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[400px]">
              <div className="flex flex-col items-center gap-4 text-center max-w-md">
                <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Users className="h-10 w-10 text-primary/60" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Ambiente de Reuniões</h2>
                  <p className="text-sm text-muted-foreground">Ative os painéis na barra lateral para começar. Adicione documentos, vídeos ou carregue dados de campanhas ao vivo.</p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all">
                    <Upload className="h-3.5 w-3.5" /> Upload de arquivo
                  </button>
                  <button onClick={() => togglePanel("data")}
                    className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all">
                    <Table2 className="h-3.5 w-3.5" /> Ver Campanhas
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════
              MEDIA PANEL
              ═══════════════════════════════════════ */}
          <AnimatePresence initial={false}>
            {panels.media && (
              <motion.div key="media-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className={`rounded-2xl border border-border bg-card overflow-hidden transition-all ${
                  fullscreen ? "fixed inset-0 z-50 rounded-none border-0" : presenting ? "min-h-[70vh]" : "min-h-[480px]"
                }`}>
                  {/* Tabs bar */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card/80 backdrop-blur">
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {mediaItems.map(item => (
                        <button key={item.id} onClick={() => setActiveMedia(item)} title={item.name}
                          className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all shrink-0 ${
                            activeMedia?.id === item.id
                              ? "bg-primary/15 border border-primary/30 text-primary"
                              : "border border-transparent hover:bg-muted/50 text-muted-foreground"
                          }`}>
                          {mediaTypeIcon(item.type)}
                          <span className="truncate max-w-[120px]">{item.name}</span>
                        </button>
                      ))}
                      {mediaItems.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">Nenhum conteúdo carregado</span>
                      )}
                      <button onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-all shrink-0">
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {activeMedia && (
                        <a href={activeMedia.src} target="_blank" rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button onClick={() => setFullscreen(p => !p)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </button>
                      {!presenting && (
                        <button onClick={() => togglePanel("media")}
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  {/* Preview */}
                  <div className={`relative bg-muted/20 ${fullscreen ? "h-[calc(100vh-53px)]" : presenting ? "h-[70vh]" : "h-[440px]"}`}>
                    {activeMedia ? renderPreview(activeMedia) : (
                      <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground">
                        <div className="grid grid-cols-2 gap-4 opacity-20">
                          <FileText className="h-10 w-10" /><Video className="h-10 w-10" />
                          <FileSpreadsheet className="h-10 w-10" /><Presentation className="h-10 w-10" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold mb-1">Nenhum arquivo selecionado</p>
                          <p className="text-xs opacity-70">Faça upload ou adicione uma URL para começar</p>
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all">
                            <Upload className="h-3.5 w-3.5" /> Upload
                          </button>
                          <button onClick={() => setAddingType("url")}
                            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">
                            <Link2 className="h-3.5 w-3.5" /> URL
                          </button>
                          <button onClick={() => setAddingType("google")}
                            className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/5 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-400/10 transition-all">
                            <Globe className="h-3.5 w-3.5" /> Google
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════════════════════════════
              DATA PANEL — live campaign data
              ═══════════════════════════════════════ */}
          <AnimatePresence initial={false}>
            {panels.data && (
              <motion.div key="data-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="rounded-2xl border border-border bg-card overflow-hidden">

                  {/* ── Panel header with filters ── */}
                  <div className="border-b border-border bg-card/80 px-5 py-3.5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">Dados de Campanhas</span>
                        {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                      <div className="flex items-center gap-2">
                        {isAdmin && (
                          <button onClick={() => setShowAdvanced(p => !p)}
                            className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all ${
                              showAdvanced
                                ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                                : "border border-border text-muted-foreground hover:bg-muted/50"
                            }`}>
                            {showAdvanced ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                            Avançado
                          </button>
                        )}
                        <button onClick={refetchAll} disabled={isLoading}
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-50">
                          <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
                        </button>
                        <button onClick={() => togglePanel("data")}
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Filters row */}
                    <div className="flex flex-wrap items-center gap-2">
                      {/* Account selector */}
                      <div className="relative">
                        <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
                          className="appearance-none rounded-xl border border-border bg-background/60 py-2 pl-3 pr-8 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all">
                          <option value="all">Todas as contas</option>
                          {adAccounts.map((a: any) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {/* Status */}
                      <div className="relative">
                        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                          className="appearance-none rounded-xl border border-border bg-background/60 py-2 pl-3 pr-8 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all">
                          <option value="all">Todos os status</option>
                          <option value="active">Ativos</option>
                          <option value="paused">Pausados</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {/* Date range */}
                      <DateRangePicker
                        startDate={dateRange.startDate}
                        endDate={dateRange.endDate}
                        onChange={(s, e) => setDateRange({ startDate: s, endDate: e })}
                      />
                      {/* Search */}
                      <div className="relative flex-1 min-w-[180px]">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                        <input type="text" placeholder={`Buscar ${campLevel}...`} value={campSearch}
                          onChange={e => setCampSearch(e.target.value)}
                          className="w-full rounded-xl border border-border bg-background/60 py-2 pl-9 pr-3 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
                      </div>
                    </div>

                    {/* Level tabs */}
                    <div className="flex gap-1">
                      {LEVEL_TABS.map(t => (
                        <button key={t.id} onClick={() => setCampLevel(t.id)}
                          className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all ${
                            campLevel === t.id
                              ? "border-primary text-primary"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}>
                          <t.icon className="h-3 w-3" />
                          {t.label}
                          {t.id === "campanhas" && selectedCamps.size > 0 && (
                            <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-black">{selectedCamps.size} sel.</span>
                          )}
                          {t.id === "conjuntos" && selectedAdSets.size > 0 && (
                            <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-black">{selectedAdSets.size} sel.</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── KPI bar ── */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-b border-border bg-border">
                    {[
                      { label: "Campanhas ativas", value: `${kpis.ativas} / ${kpis.total}`, icon: Megaphone, color: "text-green-400" },
                      { label: "Gasto total", value: fmtBRL(kpis.gasto), icon: DollarSign, color: "text-primary" },
                      { label: "Conversões", value: fmtNum(kpis.conv), icon: Target, color: "text-purple-400" },
                      { label: "CPL médio", value: kpis.cpl > 0 ? fmtBRL(kpis.cpl) : "—", icon: TrendingUp, color: "text-amber-400" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="flex items-center gap-3 px-5 py-3.5 bg-card">
                        <div className="rounded-xl p-2 bg-muted/50">
                          <Icon className={`h-4 w-4 ${color}`} />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                          <p className="text-sm font-bold">{value}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* ── Need parent selection hint ── */}
                  {(campLevel === "conjuntos" && selectedCamps.size === 0) ||
                   (campLevel === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0) ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
                      <div className="h-14 w-14 rounded-2xl bg-muted/50 flex items-center justify-center">
                        {campLevel === "conjuntos" ? <LayoutGrid className="h-7 w-7 opacity-40" /> : <ImageIcon className="h-7 w-7 opacity-40" />}
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-semibold mb-1">Selecione campanhas primeiro</p>
                        <p className="text-xs opacity-60">Volte à aba Campanhas e marque os itens que deseja detalhar.</p>
                      </div>
                    </div>
                  ) : isLoading ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/20">
                            <th className="px-4 py-3 w-10">
                              <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition">
                                {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                              </button>
                            </th>
                            <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground w-16">Status</th>
                            <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nome</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Orçamento</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-purple-400">Conv.</th>
                            <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                            {showAdvanced && isAdmin && <>
                              <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">CTR</th>
                              <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">CPL</th>
                              <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">CPM</th>
                              <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">Freq.</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.length === 0 ? (
                            <tr>
                              <td colSpan={showAdvanced && isAdmin ? 12 : 8} className="text-center py-12 text-muted-foreground text-xs">
                                Nenhum resultado encontrado.
                              </td>
                            </tr>
                          ) : filtered.map((c: any, i: number) => {
                            const isActive = c.status?.toUpperCase() === "ACTIVE";
                            const isSel = selSet.has(c.id);
                            return (
                              <motion.tr key={c.id}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.015 }}
                                className={`border-b border-border/50 transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                                <td className="px-4 py-3 text-center">
                                  <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">
                                    {isSel ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                                  </button>
                                </td>
                                <td className="px-3 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold ${
                                    isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"
                                  }`}>
                                    <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-muted-foreground"}`} />
                                    {isActive ? "Ativo" : "Pausado"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 max-w-[200px]">
                                  <p className="font-bold text-foreground/90 truncate uppercase tracking-tight text-[11px]" title={c.name}>{c.name}</p>
                                  {campLevel === "campanhas" && c.ad_account?.name && (
                                    <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{c.ad_account.name}</p>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                  {c.budget > 0 ? fmtBRL(c.budget) : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                  {c.t.reach > 0 ? fmtNum(c.t.reach) : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                  {fmtNum(c.t.impressions)}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-purple-400">
                                  {c.t.conversions > 0 ? c.t.conversions : "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-primary">
                                  {fmtBRL(c.t.cost)}
                                </td>
                                {showAdvanced && isAdmin && <>
                                  <td className="px-4 py-3 text-right font-mono text-amber-400 text-[10px]">{c.t.ctr > 0 ? c.t.ctr.toFixed(2) + "%" : "—"}</td>
                                  <td className="px-4 py-3 text-right font-mono text-amber-400 text-[10px]">{c.t.cpl > 0 ? fmtBRL(c.t.cpl) : "—"}</td>
                                  <td className="px-4 py-3 text-right font-mono text-amber-400 text-[10px]">{c.t.cpm > 0 ? fmtBRL(c.t.cpm) : "—"}</td>
                                  <td className="px-4 py-3 text-right font-mono text-amber-400 text-[10px]">{c.t.freq > 0 ? c.t.freq.toFixed(2) : "—"}</td>
                                </>}
                              </motion.tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-border bg-muted/20">
                            <td colSpan={3} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                              Total ({filtered.length})
                            </td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{totals.reach > 0 ? fmtNum(totals.reach) : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{fmtNum(totals.impr)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-purple-400 text-[10px]">{totals.conv > 0 ? totals.conv : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary text-[10px]">{fmtBRL(totals.cost)}</td>
                            {showAdvanced && isAdmin && <td colSpan={4} className="px-4 py-3" />}
                          </tr>
                        </tfoot>
                      </table>
                      <p className="text-[10px] text-muted-foreground px-5 py-2 border-t border-border/50">
                        {filtered.length} {campLevel} · {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        {accountFilter !== "all" && ` · ${adAccounts.find((a: any) => a.id === accountFilter)?.name || ""}`}
                      </p>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ═══════════════════════════════════════
              NOTES PANEL
              ═══════════════════════════════════════ */}
          <AnimatePresence initial={false}>
            {panels.notes && (
              <motion.div key="notes-panel" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold">Anotações da Reunião</span>
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-md px-2 py-0.5">salvas automaticamente</span>
                    </div>
                    <button onClick={() => togglePanel("notes")}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea value={notes} onChange={e => saveNotes(e.target.value)}
                    placeholder="Digite suas anotações aqui... pontos discutidos, decisões, próximos passos."
                    className="w-full min-h-[220px] resize-y bg-transparent px-5 py-4 text-sm outline-none placeholder:text-muted-foreground/50 leading-relaxed" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Presenting: KPI overlay ── */}
          {presenting && campaigns.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Campanhas ativas", value: `${kpis.ativas} / ${kpis.total}`, sub: "campanhas rodando", icon: Megaphone, color: "from-green-500/20 to-green-500/5 border-green-500/20 text-green-400" },
                { label: "Gasto Total", value: fmtBRL(kpis.gasto), sub: "período selecionado", icon: DollarSign, color: "from-primary/20 to-primary/5 border-primary/20 text-primary" },
                { label: "Conversões", value: fmtNum(kpis.conv), sub: "total do período", icon: Target, color: "from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-400" },
                { label: "CPL Médio", value: kpis.cpl > 0 ? fmtBRL(kpis.cpl) : "—", sub: "custo por lead", icon: TrendingUp, color: "from-amber-500/20 to-amber-500/5 border-amber-500/20 text-amber-400" },
              ].map(({ label, value, sub, icon: Icon, color }) => (
                <div key={label} className={`rounded-2xl bg-gradient-to-br border p-5 ${color}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider opacity-70">{label}</span>
                    <Icon className="h-4 w-4" />
                  </div>
                  <p className="text-2xl font-black">{value}</p>
                  <p className="text-[10px] opacity-60 mt-1">{sub}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── Mobile controls ── */}
          <div className="flex xl:hidden items-center gap-2 flex-wrap">
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            <button onClick={() => setAddingType("url")}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all">
              <Link2 className="h-3.5 w-3.5" /> URL
            </button>
            <button onClick={() => setAddingType("google")}
              className="flex items-center gap-2 rounded-xl border border-dashed border-blue-400/30 px-3 py-2 text-xs font-medium text-blue-400 hover:bg-blue-400/5 transition-all">
              <Globe className="h-3.5 w-3.5" /> Google
            </button>
            {(["media", "data", "notes"] as PanelId[]).map(p => (
              <button key={p} onClick={() => togglePanel(p)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  panels[p] ? "border-primary/30 bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-muted/50"
                }`}>
                {panels[p] ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {p === "media" ? "Mídia" : p === "data" ? "Dados" : "Notas"}
              </button>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
