import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Users, FileText, Video, Table2, Presentation, Link2,
  Upload, ExternalLink, Play, Pause, Trash2, Plus,
  ChevronDown, ChevronUp, Eye, EyeOff, X, Maximize2,
  Minimize2, BarChart3, TrendingUp, DollarSign, Target,
  Megaphone, LayoutGrid, Image as ImageIcon, Loader2,
  RefreshCw, Download, Share2, Columns, Lock, Unlock,
  Globe, FileSpreadsheet, CheckCircle2, AlertCircle,
  Info, Star, Zap, Layers
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
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

// ─── Coluna configs ───────────────────────────────────────────────────────────

const BASE_COLS = [
  { key: "name", label: "Nome" },
  { key: "status", label: "Status" },
  { key: "spent", label: "Gasto" },
  { key: "impressions", label: "Impressões" },
  { key: "clicks", label: "Cliques" },
  { key: "ctr", label: "CTR" },
  { key: "conversions", label: "Conv." },
  { key: "cpl", label: "CPL" },
];

const ADVANCED_COLS = [
  { key: "cpm", label: "CPM" },
  { key: "cpc", label: "CPC" },
  { key: "reach", label: "Alcance" },
  { key: "frequency", label: "Freq." },
  { key: "roas", label: "ROAS" },
  { key: "revenue", label: "Receita" },
];

// ─── Helper formatters ────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const fmtNum = (v: number) =>
  v >= 1000 ? (v / 1000).toFixed(1) + "k" : v.toString();

const fmtPct = (v: number) => v.toFixed(2) + "%";

function fmtCell(key: string, row: any): string {
  const v = row[key];
  if (v === undefined || v === null) return "—";
  if (key === "spent" || key === "cpl" || key === "cpm" || key === "cpc" || key === "revenue")
    return fmtBRL(Number(v));
  if (key === "ctr" || key === "frequency" || key === "roas")
    return fmtPct(Number(v));
  if (key === "impressions" || key === "clicks" || key === "reach")
    return fmtNum(Number(v));
  if (key === "status") {
    return v === "ACTIVE" ? "Ativo" : v === "PAUSED" ? "Pausado" : v;
  }
  return String(v);
}

// ─── Main component ───────────────────────────────────────────────────────────

function ReunioesPage() {
  const { user } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  // Panels visibility
  const [panels, setPanels] = useState<Record<PanelId, boolean>>({
    media: true,
    data: false,
    notes: false,
  });

  // Media library
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [urlName, setUrlName] = useState("");
  const [googleInput, setGoogleInput] = useState("");
  const [addingType, setAddingType] = useState<"url" | "google" | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Campaign data panel
  const [campLevel, setCampLevel] = useState<CampLevel>("campanhas");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [campSearch, setCampSearch] = useState("");
  const [dataLoaded, setDataLoaded] = useState(false);
  const [presenting, setPresenting] = useState(false);

  // Notes
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem("nc_reuniao_notes") || ""; } catch { return ""; }
  });

  const saveNotes = useCallback((v: string) => {
    setNotes(v);
    try { localStorage.setItem("nc_reuniao_notes", v); } catch {}
  }, []);

  // ─── Data queries ───────────────────────────────────────────────────────────

  const dateRange = { startDate: subDays(new Date(), 29), endDate: new Date() };

  const { data: campanhasData = [], isFetching: fetchingCamp, refetch: refetchCamp } = useQuery({
    queryKey: ["reuniao_campanhas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_campaigns")
        .select("*")
        .order("spent", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: dataLoaded,
  });

  const { data: conjuntosData = [], isFetching: fetchingConj, refetch: refetchConj } = useQuery({
    queryKey: ["reuniao_conjuntos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_adsets")
        .select("*")
        .order("spent", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: dataLoaded,
  });

  const { data: anunciosData = [], isFetching: fetchingAds, refetch: refetchAds } = useQuery({
    queryKey: ["reuniao_anuncios"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meta_ads")
        .select("*")
        .order("spent", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    enabled: dataLoaded,
  });

  const rawData = campLevel === "campanhas" ? campanhasData
    : campLevel === "conjuntos" ? conjuntosData
    : anunciosData;

  const filteredData = rawData.filter(r =>
    !campSearch || (r.name || "").toLowerCase().includes(campSearch.toLowerCase())
  );

  const isFetching = fetchingCamp || fetchingConj || fetchingAds;

  const visibleCols = showAdvanced && isAdmin
    ? [...BASE_COLS, ...ADVANCED_COLS]
    : BASE_COLS;

  // ─── KPI totals ─────────────────────────────────────────────────────────────

  const kpis = {
    ativas: campanhasData.filter(c => c.status === "ACTIVE").length,
    total: campanhasData.length,
    gasto: campanhasData.reduce((s, c) => s + (Number(c.spent) || 0), 0),
    conv: campanhasData.reduce((s, c) => s + (Number(c.conversions) || 0), 0),
    cpl: (() => {
      const g = campanhasData.reduce((s, c) => s + (Number(c.spent) || 0), 0);
      const v = campanhasData.reduce((s, c) => s + (Number(c.conversions) || 0), 0);
      return v > 0 ? g / v : 0;
    })(),
  };

  // ─── File upload handler ─────────────────────────────────────────────────────

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
    if (newItems[0]) setActiveMedia(newItems[0]);
    toast.success(`${newItems.length} arquivo(s) adicionado(s)`);
    e.target.value = "";
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    const ext = urlInput.split(".").pop()?.split("?")[0].toLowerCase() || "";
    const type: MediaItem["type"] =
      urlInput.includes("docs.google.com/spreadsheets") ? "google"
      : urlInput.includes("docs.google.com/presentation") ? "google"
      : urlInput.includes("docs.google.com") ? "google"
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
    setUrlInput("");
    setUrlName("");
    setAddingType(null);
    toast.success("Conteúdo adicionado");
  };

  const handleAddGoogle = () => {
    if (!googleInput.trim()) return;
    // Convert Google Sheets/Slides/Docs to embed URLs
    let embedSrc = googleInput.trim();
    if (embedSrc.includes("docs.google.com/spreadsheets") && !embedSrc.includes("/pubhtml")) {
      embedSrc = embedSrc.replace(/\/edit.*$/, "/pubhtml?widget=true&headers=false");
    } else if (embedSrc.includes("docs.google.com/presentation") && !embedSrc.includes("/embed")) {
      embedSrc = embedSrc.replace(/\/edit.*$/, "/embed?start=false&loop=false&delayms=3000");
    } else if (embedSrc.includes("docs.google.com/document") && !embedSrc.includes("/pub")) {
      embedSrc = embedSrc.replace(/\/edit.*$/, "/pub?embedded=true");
    }
    const item: MediaItem = {
      id: crypto.randomUUID(),
      type: "google",
      name: googleInput.includes("spreadsheets") ? "Google Sheets" : googleInput.includes("presentation") ? "Google Slides" : "Google Docs",
      src: embedSrc,
      addedAt: new Date(),
    };
    setMediaItems(prev => [item, ...prev]);
    setActiveMedia(item);
    setGoogleInput("");
    setAddingType(null);
    toast.success("Google vinculado com sucesso");
  };

  const removeMedia = (id: string) => {
    setMediaItems(prev => prev.filter(m => m.id !== id));
    if (activeMedia?.id === id) setActiveMedia(null);
  };

  const togglePanel = (p: PanelId) => {
    setPanels(prev => ({ ...prev, [p]: !prev[p] }));
  };

  const loadData = () => {
    setDataLoaded(true);
    setPanels(prev => ({ ...prev, data: true }));
    setTimeout(() => {
      refetchCamp();
      refetchConj();
      refetchAds();
    }, 100);
  };

  // ─── Presentation mode ───────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
      if (e.key === "F5") { e.preventDefault(); setPresenting(p => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [fullscreen]);

  // ─── Media preview renderer ──────────────────────────────────────────────────

  const renderPreview = (item: MediaItem, className = "") => {
    if (item.type === "video") {
      return (
        <video
          src={item.src}
          controls
          className={`w-full h-full object-contain bg-black rounded-xl ${className}`}
        />
      );
    }
    if (item.type === "pdf") {
      return (
        <iframe
          src={item.src + "#toolbar=1&navpanes=1"}
          title={item.name}
          className={`w-full h-full rounded-xl border-0 ${className}`}
        />
      );
    }
    if (item.type === "google" || item.type === "spreadsheet" || item.type === "powerpoint" || item.type === "url") {
      const isSrc = item.src.startsWith("blob:") || item.src.startsWith("data:")
        ? null
        : item.src;
      if (isSrc) {
        return (
          <iframe
            src={isSrc}
            title={item.name}
            className={`w-full h-full rounded-xl border-0 ${className}`}
            allow="fullscreen"
          />
        );
      }
      return (
        <div className="flex flex-col items-center justify-center gap-4 h-full text-muted-foreground">
          <FileSpreadsheet className="h-12 w-12 opacity-30" />
          <p className="text-sm">Pré-visualização não disponível para este formato local.</p>
          <a href={item.src} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-primary hover:underline text-sm">
            <ExternalLink className="h-4 w-4" /> Abrir externamente
          </a>
        </div>
      );
    }
    return null;
  };

  const mediaTypeIcon = (type: MediaItem["type"]) => {
    if (type === "pdf") return <FileText className="h-4 w-4 text-red-400" />;
    if (type === "video") return <Video className="h-4 w-4 text-purple-400" />;
    if (type === "spreadsheet") return <FileSpreadsheet className="h-4 w-4 text-green-400" />;
    if (type === "powerpoint") return <Presentation className="h-4 w-4 text-orange-400" />;
    if (type === "google") return <Globe className="h-4 w-4 text-blue-400" />;
    return <Link2 className="h-4 w-4 text-muted-foreground" />;
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

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
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.mp4,.webm,.mov,.avi,.xlsx,.xls,.csv,.pptx,.ppt"
                className="hidden"
                onChange={handleFileUpload}
              />
            </div>
          }
        />
      )}

      {/* ── Presentation mode exit bar ── */}
      <AnimatePresence>
        {presenting && (
          <motion.div
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="flex items-center justify-between px-6 py-3 bg-black/90 backdrop-blur border-b border-white/10"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="font-black text-primary-foreground text-xs">NC</span>
              </div>
              <span className="text-white/80 text-sm font-semibold">Modo Apresentação</span>
              <span className="text-white/40 text-xs">— Pressione F5 ou clique em Sair para encerrar</span>
            </div>
            <button
              onClick={() => setPresenting(false)}
              className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold text-white/70 hover:text-white hover:bg-white/10 transition-all"
            >
              <X className="h-3.5 w-3.5" /> Sair
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`flex flex-1 min-h-0 gap-0 transition-all ${presenting ? "p-0" : "p-4 md:p-6 gap-4"}`}>

        {/* ══════════════════════════════════════════
            LEFT SIDEBAR — Panel Controls (non-presenting)
            ══════════════════════════════════════════ */}
        {!presenting && (
          <aside className="hidden xl:flex flex-col gap-3 w-64 shrink-0">

            {/* Panel toggles */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Painéis</p>
              {([
                { id: "media" as PanelId, label: "Mídia & Documentos", icon: FileText, desc: "PDFs, vídeos, slides" },
                { id: "data" as PanelId, label: "Dados de Campanhas", icon: Table2, desc: "Tabela operacional" },
                { id: "notes" as PanelId, label: "Anotações", icon: Layers, desc: "Notas da reunião" },
              ] as const).map(({ id, label, icon: Icon, desc }) => (
                <button
                  key={id}
                  onClick={() => togglePanel(id)}
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
                    {panels[id]
                      ? <Eye className="h-3.5 w-3.5 text-primary" />
                      : <EyeOff className="h-3.5 w-3.5" />}
                  </div>
                </button>
              ))}
            </div>

            {/* Add content shortcuts */}
            <div className="rounded-2xl border border-border bg-card p-4">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Adicionar</p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Arquivo (PDF, vídeo, planilha, PPT)
                </button>
                <button
                  onClick={() => setAddingType("url")}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:border-primary/40 hover:bg-primary/5 transition-all text-muted-foreground hover:text-foreground"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  URL / Embed
                </button>
                <button
                  onClick={() => setAddingType("google")}
                  className="flex items-center gap-2.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-medium hover:border-blue-400/40 hover:bg-blue-400/5 transition-all text-muted-foreground hover:text-foreground"
                >
                  <Globe className="h-3.5 w-3.5 text-blue-400" />
                  Google Sheets / Slides / Docs
                </button>
                {!dataLoaded && (
                  <button
                    onClick={loadData}
                    className="flex items-center gap-2.5 rounded-xl border border-dashed border-primary/30 px-3 py-2.5 text-xs font-medium hover:bg-primary/10 transition-all text-primary"
                  >
                    <Table2 className="h-3.5 w-3.5" />
                    Carregar Dados de Campanhas
                  </button>
                )}
              </div>
            </div>

            {/* Data panel controls (shown when data loaded) */}
            {dataLoaded && panels.data && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Tabela</p>
                <div className="flex flex-col gap-2">
                  {isAdmin && (
                    <button
                      onClick={() => setShowAdvanced(p => !p)}
                      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${
                        showAdvanced
                          ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                          : "border border-border hover:bg-muted/50 text-muted-foreground"
                      }`}
                    >
                      {showAdvanced ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                      {showAdvanced ? "Métricas avançadas ON" : "Mostrar métricas avançadas"}
                    </button>
                  )}
                  <button
                    onClick={() => { refetchCamp(); refetchConj(); refetchAds(); }}
                    disabled={isFetching}
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-semibold hover:bg-muted/50 transition-all text-muted-foreground disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                    Atualizar dados
                  </button>
                </div>
              </div>
            )}

            {/* Media list */}
            {mediaItems.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-4 flex-1 overflow-hidden flex flex-col">
                <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                  Biblioteca ({mediaItems.length})
                </p>
                <div className="flex-1 overflow-y-auto flex flex-col gap-1 custom-scroll">
                  {mediaItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => { setActiveMedia(item); setPanels(p => ({ ...p, media: true })); }}
                      className={`group flex items-center gap-2.5 rounded-xl px-2.5 py-2 cursor-pointer transition-all ${
                        activeMedia?.id === item.id
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-muted/40 border border-transparent"
                      }`}
                    >
                      {mediaTypeIcon(item.type)}
                      <span className="flex-1 text-[11px] font-medium truncate">{item.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); removeMedia(item.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                      >
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
            MAIN CONTENT AREA
            ══════════════════════════════════════════ */}
        <div className="flex-1 flex flex-col min-w-0 gap-4 overflow-y-auto">

          {/* ── Add URL modal ── */}
          <AnimatePresence>
            {addingType === "url" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-2xl border border-primary/20 bg-card p-4 shadow-lg"
              >
                <p className="text-sm font-bold mb-3 flex items-center gap-2">
                  <Link2 className="h-4 w-4 text-primary" />
                  Adicionar por URL
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    type="text"
                    placeholder="Nome do conteúdo (opcional)"
                    value={urlName}
                    onChange={e => setUrlName(e.target.value)}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all"
                  />
                  <input
                    type="url"
                    placeholder="https://exemplo.com/arquivo.pdf"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddUrl()}
                    className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary/50 transition-all"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddUrl}
                      className="flex-1 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all">
                      Adicionar
                    </button>
                    <button onClick={() => { setAddingType(null); setUrlInput(""); setUrlName(""); }}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {addingType === "google" && (
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-2xl border border-blue-400/20 bg-card p-4 shadow-lg"
              >
                <p className="text-sm font-bold mb-1 flex items-center gap-2">
                  <Globe className="h-4 w-4 text-blue-400" />
                  Vincular Google Drive
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Cole a URL do Google Sheets, Slides ou Docs. Certifique-se que o arquivo está com acesso "Qualquer pessoa com o link".
                </p>
                <div className="flex flex-col gap-2">
                  <input
                    autoFocus
                    type="url"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={googleInput}
                    onChange={e => setGoogleInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleAddGoogle()}
                    className="rounded-xl border border-blue-400/30 bg-background px-3 py-2 text-sm outline-none focus:border-blue-400/60 transition-all"
                  />
                  <div className="flex gap-2">
                    <button onClick={handleAddGoogle}
                      className="flex-1 rounded-xl bg-blue-500 px-4 py-2 text-xs font-bold text-white hover:bg-blue-600 transition-all">
                      Vincular
                    </button>
                    <button onClick={() => { setAddingType(null); setGoogleInput(""); }}
                      className="rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">
                      Cancelar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Empty state ── */}
          {!panels.media && !panels.data && !panels.notes && !presenting && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 flex flex-col items-center justify-center gap-6 min-h-[400px]"
            >
              <div className="flex flex-col items-center gap-4 text-center max-w-md">
                <div className="h-20 w-20 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                  <Users className="h-10 w-10 text-primary/60" />
                </div>
                <div>
                  <h2 className="text-xl font-bold mb-2">Ambiente de Reuniões</h2>
                  <p className="text-sm text-muted-foreground">
                    Ative os painéis na barra lateral para começar. Adicione documentos, vídeos, planilhas ou carregue dados de campanhas ao vivo.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all">
                    <Upload className="h-3.5 w-3.5" /> Upload de arquivo
                  </button>
                  <button onClick={loadData}
                    className="flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all">
                    <Table2 className="h-3.5 w-3.5" /> Carregar Campanhas
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Media & Documents Panel ── */}
          <AnimatePresence initial={false}>
            {panels.media && (
              <motion.div
                key="media-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`rounded-2xl border border-border bg-card overflow-hidden transition-all ${
                  fullscreen
                    ? "fixed inset-0 z-50 rounded-none border-0"
                    : presenting
                    ? "min-h-[70vh]"
                    : "min-h-[480px]"
                }`}>

                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/80 backdrop-blur">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        {mediaItems.map(item => (
                          <button
                            key={item.id}
                            onClick={() => setActiveMedia(item)}
                            title={item.name}
                            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all max-w-[140px] truncate ${
                              activeMedia?.id === item.id
                                ? "bg-primary/15 border border-primary/30 text-primary"
                                : "border border-transparent hover:bg-muted/50 text-muted-foreground"
                            }`}
                          >
                            {mediaTypeIcon(item.type)}
                            <span className="truncate max-w-[100px]">{item.name}</span>
                          </button>
                        ))}
                        {mediaItems.length === 0 && (
                          <span className="text-xs text-muted-foreground italic">Nenhum conteúdo carregado</span>
                        )}
                      </div>
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary/40 hover:text-primary transition-all"
                      >
                        <Plus className="h-3 w-3" /> Adicionar
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      {activeMedia && (
                        <a
                          href={activeMedia.src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                          title="Abrir em nova aba"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <button
                        onClick={() => setFullscreen(p => !p)}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                        title={fullscreen ? "Reduzir" : "Tela cheia"}
                      >
                        {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      </button>
                      {!presenting && (
                        <button
                          onClick={() => togglePanel("media")}
                          className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Preview area */}
                  <div className={`relative bg-muted/20 ${
                    fullscreen ? "h-[calc(100vh-53px)]" : presenting ? "h-[70vh]" : "h-[440px]"
                  }`}>
                    {activeMedia ? (
                      renderPreview(activeMedia)
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground">
                        <div className="grid grid-cols-2 gap-4 opacity-20">
                          <FileText className="h-10 w-10" />
                          <Video className="h-10 w-10" />
                          <FileSpreadsheet className="h-10 w-10" />
                          <Presentation className="h-10 w-10" />
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-semibold mb-1">Nenhum arquivo selecionado</p>
                          <p className="text-xs opacity-70">Faça upload ou adicione uma URL para começar</p>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all"
                          >
                            <Upload className="h-3.5 w-3.5" /> Upload
                          </button>
                          <button
                            onClick={() => setAddingType("url")}
                            className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all"
                          >
                            <Link2 className="h-3.5 w-3.5" /> URL
                          </button>
                          <button
                            onClick={() => setAddingType("google")}
                            className="flex items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-400/5 px-4 py-2 text-xs font-semibold text-blue-400 hover:bg-blue-400/10 transition-all"
                          >
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

          {/* ── Campaigns Data Panel ── */}
          <AnimatePresence initial={false}>
            {panels.data && (
              <motion.div
                key="data-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-card overflow-hidden">

                  {/* Panel header */}
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card/80">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Table2 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-bold">Dados de Campanhas</span>
                        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>

                      {/* Level tabs */}
                      <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1">
                        {LEVEL_TABS.map(t => (
                          <button
                            key={t.id}
                            onClick={() => setCampLevel(t.id)}
                            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
                              campLevel === t.id
                                ? "bg-card text-foreground shadow-sm border border-border/50"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            <t.icon className="h-3 w-3" />
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Buscar..."
                          value={campSearch}
                          onChange={e => setCampSearch(e.target.value)}
                          className="rounded-xl border border-border bg-background pl-3 pr-8 py-1.5 text-xs outline-none focus:border-primary/50 w-40 transition-all"
                        />
                        {campSearch && (
                          <button onClick={() => setCampSearch("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {isAdmin && (
                        <button
                          onClick={() => setShowAdvanced(p => !p)}
                          className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-[11px] font-bold transition-all ${
                            showAdvanced
                              ? "bg-amber-500/15 border border-amber-500/30 text-amber-400"
                              : "border border-border text-muted-foreground hover:bg-muted/50"
                          }`}
                          title="Mostrar métricas avançadas (admin)"
                        >
                          {showAdvanced ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                          Avançado
                        </button>
                      )}

                      <button
                        onClick={() => togglePanel("data")}
                        className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* KPI bar */}
                  {dataLoaded && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px border-b border-border bg-border">
                      {[
                        { label: "Campanhas ativas", value: `${kpis.ativas} / ${kpis.total}`, icon: Megaphone, color: "text-green-400" },
                        { label: "Gasto total", value: fmtBRL(kpis.gasto), icon: DollarSign, color: "text-primary" },
                        { label: "Conversões", value: kpis.conv.toString(), icon: Target, color: "text-purple-400" },
                        { label: "CPL médio", value: kpis.cpl > 0 ? fmtBRL(kpis.cpl) : "—", icon: TrendingUp, color: "text-amber-400" },
                      ].map(({ label, value, icon: Icon, color }) => (
                        <div key={label} className="flex items-center gap-3 px-5 py-3.5 bg-card">
                          <div className={`rounded-xl p-2 bg-muted/50`}>
                            <Icon className={`h-4 w-4 ${color}`} />
                          </div>
                          <div>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
                            <p className="text-sm font-bold">{value}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Table */}
                  {!dataLoaded ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-16 text-muted-foreground">
                      <Table2 className="h-10 w-10 opacity-20" />
                      <div className="text-center">
                        <p className="text-sm font-semibold mb-1">Dados não carregados</p>
                        <p className="text-xs opacity-60 mb-4">Clique para importar dados de campanhas ao vivo</p>
                        <button onClick={loadData}
                          className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all mx-auto">
                          <Zap className="h-3.5 w-3.5" /> Carregar dados ao vivo
                        </button>
                      </div>
                    </div>
                  ) : isFetching && filteredData.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                      <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border">
                            {visibleCols.map(col => (
                              <th key={col.key}
                                className="px-4 py-3 text-left font-semibold text-muted-foreground whitespace-nowrap first:pl-5">
                                {col.label}
                                {ADVANCED_COLS.some(ac => ac.key === col.key) && (
                                  <span className="ml-1 rounded px-1 py-0.5 text-[9px] bg-amber-500/15 text-amber-400">ADV</span>
                                )}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {filteredData.length === 0 ? (
                            <tr>
                              <td colSpan={visibleCols.length} className="text-center py-10 text-muted-foreground text-xs">
                                Nenhum resultado encontrado
                              </td>
                            </tr>
                          ) : (
                            filteredData.map((row, i) => (
                              <motion.tr
                                key={row.id || i}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: i * 0.02 }}
                                className="border-b border-border/50 hover:bg-muted/20 transition-colors"
                              >
                                {visibleCols.map(col => (
                                  <td key={col.key} className="px-4 py-3 first:pl-5">
                                    {col.key === "name" ? (
                                      <div className="flex items-center gap-2 max-w-[200px]">
                                        <span className="truncate font-medium text-foreground">{row.name || "—"}</span>
                                      </div>
                                    ) : col.key === "status" ? (
                                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                        row.status === "ACTIVE"
                                          ? "bg-green-500/15 text-green-400"
                                          : "bg-muted text-muted-foreground"
                                      }`}>
                                        <span className={`h-1.5 w-1.5 rounded-full ${row.status === "ACTIVE" ? "bg-green-400" : "bg-muted-foreground"}`} />
                                        {fmtCell("status", row)}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground">{fmtCell(col.key, row)}</span>
                                    )}
                                  </td>
                                ))}
                              </motion.tr>
                            ))
                          )}
                        </tbody>
                      </table>
                      {filteredData.length > 0 && (
                        <p className="text-[10px] text-muted-foreground px-5 py-2.5 border-t border-border/50">
                          {filteredData.length} {campLevel} encontrada(s) · Última atualização: {format(new Date(), "HH:mm", { locale: ptBR })}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Notes Panel ── */}
          <AnimatePresence initial={false}>
            {panels.notes && (
              <motion.div
                key="notes-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" />
                      <span className="text-sm font-bold">Anotações da Reunião</span>
                      <span className="text-[10px] text-muted-foreground bg-muted rounded-md px-2 py-0.5">
                        salvas automaticamente
                      </span>
                    </div>
                    <button
                      onClick={() => togglePanel("notes")}
                      className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    value={notes}
                    onChange={e => saveNotes(e.target.value)}
                    placeholder="Digite suas anotações aqui... Use esta área para pontos discutidos, decisões tomadas, próximos passos, etc."
                    className="w-full min-h-[220px] resize-y bg-transparent px-5 py-4 text-sm outline-none placeholder:text-muted-foreground/50 leading-relaxed"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Presenting: KPI overlay if data loaded ── */}
          {presenting && dataLoaded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-2 sm:grid-cols-4 gap-3"
            >
              {[
                { label: "Campanhas ativas", value: `${kpis.ativas} / ${kpis.total}`, sub: "campanhas rodando", icon: Megaphone, color: "from-green-500/20 to-green-500/5 border-green-500/20 text-green-400" },
                { label: "Gasto Total", value: fmtBRL(kpis.gasto), sub: "últimos 30 dias", icon: DollarSign, color: "from-primary/20 to-primary/5 border-primary/20 text-primary" },
                { label: "Conversões", value: kpis.conv.toString(), sub: "total do período", icon: Target, color: "from-purple-500/20 to-purple-500/5 border-purple-500/20 text-purple-400" },
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

          {/* ── Mobile add bar (xl breakpoint: sidebar hidden) ── */}
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
            {!dataLoaded && (
              <button onClick={loadData}
                className="flex items-center gap-2 rounded-xl border border-primary/30 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-all">
                <Table2 className="h-3.5 w-3.5" /> Carregar Campanhas
              </button>
            )}
            {(["media", "data", "notes"] as PanelId[]).map(p => (
              <button key={p} onClick={() => togglePanel(p)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                  panels[p]
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted/50"
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
