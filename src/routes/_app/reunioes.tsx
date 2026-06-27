import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Users, FileText, Video, Table2, Link2, Upload, ExternalLink,
  Trash2, Plus, ChevronDown, X, Maximize2,
  TrendingUp, DollarSign, Target, Megaphone, LayoutGrid,
  Image as ImageIcon, Loader2, RefreshCw, Lock, Unlock,
  Globe, FileSpreadsheet, Search, CheckSquare, Square,
  PanelLeft, PanelRight, Columns2, Play, Presentation,
  PenLine, GripVertical, Monitor, Download, FileImage,
  AlignLeft
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import { DateRangePicker } from "@/components/DateRangePicker";
import { useAuth } from "@/lib/auth";
import { subDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/reunioes")({
  head: () => ({ meta: [{ title: "Reuniões — NC Suite" }] }),
  component: ReunioesPage,
});

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaType =
  | "youtube"       // YouTube (embed via /embed/ID)
  | "pdf"           // .pdf
  | "video"         // .mp4 .webm .mov .avi .mkv
  | "image"         // .png .jpg .gif .svg .webp .avif
  | "text"          // .txt .md .csv (rendered inline)
  | "google"        // Google Docs / Sheets / Slides / Drive
  | "office-online" // Office Online viewer (OneDrive / public .docx/.xlsx/.pptx URL)
  | "office-local"  // local Office file — download only
  | "url";          // generic embed / iframe

type MediaItem = {
  id: string;
  type: MediaType;
  name: string;
  src: string;            // original URL or blob:
  embedSrc?: string;      // processed embed URL (YouTube /embed, Office viewer, etc.)
  thumbnail?: string;     // cover image URL (YouTube thumb, user image preview, etc.)
  textContent?: string;   // content for text/csv files
  ext?: string;           // original extension for display
  size?: string;
};

// ─── YouTube helpers ──────────────────────────────────────────────────────────

function extractYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

type RightTab = "data" | "notes";
type CampLevel = "campanhas" | "conjuntos" | "anuncios";
type LayoutPreset = "stage" | "split" | "focus-data" | "media-only";

const LEVEL_TABS: { id: CampLevel; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

const LAYOUT_PRESETS: { id: LayoutPreset; label: string; icon: any; pct: number; hideRight?: boolean }[] = [
  { id: "stage", label: "Apresentação", icon: Monitor, pct: 64 },
  { id: "split", label: "Equilibrado", icon: Columns2, pct: 50 },
  { id: "focus-data", label: "Análise", icon: Table2, pct: 36 },
  { id: "media-only", label: "Foco", icon: Maximize2, pct: 100, hideRight: true },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

const fmtNum = (v: number) =>
  v >= 1_000_000 ? (v / 1_000_000).toFixed(1) + "M"
  : v >= 1_000 ? (v / 1_000).toFixed(1) + "k"
  : String(v);

const getLocalDateStr = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

function processMetrics(item: any, rawData: any[], startStr: string, endStr: string) {
  let m = rawData || [];
  if (m.length > 0 && m[0]?.asset_metrics !== undefined) {
    m = m.flatMap((ad: any) => ad.asset_metrics || []);
  }
  m = m.filter((x: any) => {
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

// ─── Component ────────────────────────────────────────────────────────────────

function ReunioesPage() {
  const { user } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;

  // ── Layout ──────────────────────────────────────────────────────────────────
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>("stage");
  const [splitPct, setSplitPct] = useState(64);
  const [hideRight, setHideRight] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const applyPreset = (preset: LayoutPreset) => {
    const p = LAYOUT_PRESETS.find(l => l.id === preset)!;
    setLayoutPreset(preset);
    setSplitPct(p.pct);
    setHideRight(!!p.hideRight);
  };

  // Drag-to-resize
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(22, pct)));
      setLayoutPreset("split"); // custom
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  // Touch resize support
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      if (!isDragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.touches[0].clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(80, Math.max(22, pct)));
    };
    const onEnd = () => { isDragging.current = false; };
    window.addEventListener("touchmove", onTouch);
    window.addEventListener("touchend", onEnd);
    return () => { window.removeEventListener("touchmove", onTouch); window.removeEventListener("touchend", onEnd); };
  }, []);

  // Keyboard + presenting pill auto-hide
  const [pillVisible, setPillVisible] = useState(true);
  const pillTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showPill = useCallback(() => {
    setPillVisible(true);
    if (pillTimerRef.current) clearTimeout(pillTimerRef.current);
    pillTimerRef.current = setTimeout(() => setPillVisible(false), 3000);
  }, []);

  useEffect(() => {
    if (!presenting) { setPillVisible(true); return; }
    // Start auto-hide countdown when entering presenting mode
    showPill();
    const onMove = () => showPill();
    window.addEventListener("mousemove", onMove);
    return () => { window.removeEventListener("mousemove", onMove); if (pillTimerRef.current) clearTimeout(pillTimerRef.current); };
  }, [presenting, showPill]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "F5") { e.preventDefault(); setPresenting(p => !p); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Media ───────────────────────────────────────────────────────────────────
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [activeMedia, setActiveMedia] = useState<MediaItem | null>(null);
  const [addingType, setAddingType] = useState<"url" | "google" | null>(null);
  const [urlInput, setUrlInput] = useState("");
  const [urlName, setUrlName] = useState("");
  const [googleInput, setGoogleInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Right panel ──────────────────────────────────────────────────────────────
  const [rightTab, setRightTab] = useState<RightTab>("data");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Data filters ─────────────────────────────────────────────────────────────
  const [campLevel, setCampLevel] = useState<CampLevel>("campanhas");
  const [campSearch, setCampSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });
  const [selectedCamps, setSelectedCamps] = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());

  // ── Notes ────────────────────────────────────────────────────────────────────
  const [notes, setNotes] = useState(() => {
    try { return localStorage.getItem("nc_reuniao_notes") || ""; } catch { return ""; }
  });
  const saveNotes = useCallback((v: string) => {
    setNotes(v);
    try { localStorage.setItem("nc_reuniao_notes", v); } catch {}
  }, []);

  // ═══ DATA QUERIES ════════════════════════════════════════════════════════════

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
    queryFn: async () => {
      let q = (supabase as any)
        .from("campaigns")
        .select(`id, name, status, budget, external_id, ad_account_id, ad_account:ad_accounts(name), ads(asset_metrics(cost, conversions, impressions, clicks, reach, date))`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.ads, startStr, endStr));
    },
  });

  const { data: adSets = [], isLoading: isLoadingAdSets, refetch: refetchAdSets } = useQuery({
    queryKey: ["reuniao-adsets", Array.from(selectedCamps).join(","), statusFilter, startStr, endStr],
    enabled: campLevel === "conjuntos" || campLevel === "anuncios",
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
    enabled: campLevel === "anuncios",
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

  const kpis = useMemo(() => {
    const ativas = campaigns.filter((c: any) => c.status?.toUpperCase() === "ACTIVE").length;
    const gasto = campaigns.reduce((s: number, c: any) => s + c.t.cost, 0);
    const conv = campaigns.reduce((s: number, c: any) => s + c.t.conversions, 0);
    return { ativas, total: campaigns.length, gasto, conv, cpl: conv > 0 ? gasto / conv : 0 };
  }, [campaigns]);

  const totals = useMemo(() => ({
    cost: filtered.reduce((s: number, c: any) => s + c.t.cost, 0),
    conv: filtered.reduce((s: number, c: any) => s + c.t.conversions, 0),
    impr: filtered.reduce((s: number, c: any) => s + c.t.impressions, 0),
    reach: filtered.reduce((s: number, c: any) => s + c.t.reach, 0),
  }), [filtered]);

  const refetchAll = () => { refetchCamps(); refetchAdSets(); refetchAds(); };

  // ═══ MEDIA HANDLERS ══════════════════════════════════════════════════════════

  const mediaTypeIcon = (item: Pick<MediaItem, "type" | "ext">, size = "h-3.5 w-3.5") => {
    const { type, ext } = item;
    if (type === "youtube") return <Play className={`${size} text-red-500`} />;
    if (type === "pdf") return <FileText className={`${size} text-red-400`} />;
    if (type === "video") return <Video className={`${size} text-purple-400`} />;
    if (type === "image") return <FileImage className={`${size} text-pink-400`} />;
    if (type === "text") return <AlignLeft className={`${size} text-slate-400`} />;
    if (type === "google") return <Globe className={`${size} text-blue-400`} />;
    if (type === "office-online" || type === "office-local") {
      if (ext === "xlsx" || ext === "xls" || ext === "csv") return <FileSpreadsheet className={`${size} text-green-500`} />;
      if (ext === "pptx" || ext === "ppt") return <Presentation className={`${size} text-orange-400`} />;
      return <FileText className={`${size} text-blue-500`} />;
    }
    return <Link2 className={`${size} text-muted-foreground`} />;
  };

  // Netflix card background gradient per type
  const cardGradient = (item: MediaItem) => {
    if (item.type === "youtube") return "from-red-950 via-red-900 to-red-800";
    if (item.type === "pdf") return "from-red-950 via-rose-900 to-rose-800";
    if (item.type === "video") return "from-purple-950 via-purple-900 to-violet-800";
    if (item.type === "image") return "from-pink-950 via-pink-900 to-fuchsia-800";
    if (item.type === "google") return "from-blue-950 via-blue-900 to-sky-800";
    if (item.type === "office-online" || item.type === "office-local") {
      if (item.ext === "xlsx" || item.ext === "xls") return "from-green-950 via-green-900 to-emerald-800";
      if (item.ext === "pptx" || item.ext === "ppt") return "from-orange-950 via-orange-900 to-amber-800";
      return "from-blue-950 via-blue-900 to-indigo-800";
    }
    if (item.type === "text") return "from-slate-800 via-slate-700 to-slate-600";
    return "from-zinc-800 via-zinc-700 to-zinc-600";
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    const pending: Promise<MediaItem>[] = files.map(f => new Promise(resolve => {
      const ext = f.name.split(".").pop()?.toLowerCase() || "";
      const size = (f.size / 1024 / 1024).toFixed(1) + " MB";
      const src = URL.createObjectURL(f);
      const base = { id: crypto.randomUUID(), name: f.name, src, size, ext };

      if (ext === "pdf") return resolve({ ...base, type: "pdf" });
      if (["mp4", "webm", "mov", "avi", "mkv", "m4v"].includes(ext)) return resolve({ ...base, type: "video" });
      if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"].includes(ext)) return resolve({ ...base, type: "image" });
      if (["txt", "md", "markdown", "csv"].includes(ext)) {
        const reader = new FileReader();
        reader.onload = ev => resolve({ ...base, type: "text", textContent: ev.target?.result as string || "" });
        reader.readAsText(f, "UTF-8");
        return;
      }
      if (["pptx", "ppt", "docx", "doc", "xlsx", "xls"].includes(ext)) return resolve({ ...base, type: "office-local" });
      resolve({ ...base, type: "url" });
    }));

    Promise.all(pending).then(newItems => {
      setMediaItems(prev => [...newItems, ...prev]);
      if (newItems[0]) setActiveMedia(newItems[0]);
      toast.success(`${newItems.length} arquivo(s) adicionado(s)`);
    });
    e.target.value = "";
  };

  const handleAddUrl = () => {
    const raw = urlInput.trim();
    if (!raw) return;

    const ext = raw.split("?")[0].split(".").pop()?.toLowerCase() || "";
    const autoName = urlName.trim() || decodeURIComponent(raw.split("/").pop()?.split("?")[0] || "").slice(0, 50) || "Link";

    let type: MediaType = "url";
    let embedSrc: string | undefined;

    // YouTube
    const ytId = extractYouTubeId(raw);
    if (ytId) {
      type = "youtube";
      embedSrc = `https://www.youtube.com/embed/${ytId}?rel=0&modestbranding=1&autoplay=0`;
      const item: MediaItem = {
        id: crypto.randomUUID(), type, name: urlName.trim() || "YouTube",
        src: raw, embedSrc,
        thumbnail: `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`,
      };
      setMediaItems(prev => [item, ...prev]);
      setActiveMedia(item);
      setUrlInput(""); setUrlName(""); setAddingType(null);
      toast.success("YouTube adicionado");
      return;
    }
    // Google Workspace
    if (raw.includes("docs.google.com") || raw.includes("drive.google.com")) {
      type = "google";
    }
    // PDF
    else if (ext === "pdf") {
      type = "pdf";
    }
    // Images
    else if (["png", "jpg", "jpeg", "gif", "svg", "webp", "avif"].includes(ext)) {
      type = "image";
    }
    // Video
    else if (["mp4", "webm", "mov", "avi", "mkv"].includes(ext)) {
      type = "video";
    }
    // Office files from OneDrive / SharePoint / public URL
    else if (
      ["docx", "doc", "pptx", "ppt", "xlsx", "xls"].includes(ext) ||
      raw.includes("onedrive.live.com") ||
      raw.includes("sharepoint.com") ||
      raw.includes("1drv.ms")
    ) {
      type = "office-online";
      embedSrc = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(raw)}`;
    }

    const item: MediaItem = { id: crypto.randomUUID(), type, name: autoName, src: raw, embedSrc, ext };
    setMediaItems(prev => [item, ...prev]);
    setActiveMedia(item);
    setUrlInput(""); setUrlName(""); setAddingType(null);
    toast.success("Conteúdo adicionado");
  };

  const handleAddGoogle = () => {
    const raw = googleInput.trim();
    if (!raw) return;

    let src = raw;
    let name = "Google Drive";

    if (raw.includes("docs.google.com/spreadsheets")) {
      src = raw.replace(/\/(edit|view|preview).*$/, "/pubhtml?widget=true&headers=false");
      name = "Google Sheets";
    } else if (raw.includes("docs.google.com/presentation")) {
      src = raw.replace(/\/(edit|view|preview).*$/, "/embed?start=false&loop=false&delayms=3000");
      name = "Google Slides";
    } else if (raw.includes("docs.google.com/document")) {
      src = raw.replace(/\/(edit|view|preview).*$/, "/pub?embedded=true");
      name = "Google Docs";
    } else if (raw.includes("docs.google.com/forms")) {
      src = raw.replace(/\/(edit|view|preview|viewform).*$/, "/viewform?embedded=true");
      name = "Google Forms";
    } else if (raw.includes("drive.google.com/file/d/")) {
      // Convert Drive file viewer to preview iframe
      const match = raw.match(/\/file\/d\/([^/]+)/);
      if (match) {
        src = `https://drive.google.com/file/d/${match[1]}/preview`;
        name = "Google Drive";
      }
    }

    const item: MediaItem = { id: crypto.randomUUID(), type: "google", name, src };
    setMediaItems(prev => [item, ...prev]);
    setActiveMedia(item);
    setGoogleInput(""); setAddingType(null);
    toast.success(`${name} vinculado`);
  };

  const renderPreview = (item: MediaItem) => {
    // ── YouTube ────────────────────────────────────────────
    if (item.type === "youtube" && item.embedSrc)
      return (
        <iframe
          src={item.embedSrc}
          title={item.name}
          className="absolute inset-0 w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      );

    // ── Video ──────────────────────────────────────────────
    if (item.type === "video")
      return <video src={item.src} controls className="absolute inset-0 w-full h-full object-contain bg-black" />;

    // ── Image ──────────────────────────────────────────────
    if (item.type === "image")
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/20 p-4 overflow-hidden">
          <img src={item.src} alt={item.name} className="max-w-full max-h-full object-contain rounded-xl shadow-lg" />
        </div>
      );

    // ── Text / Markdown / CSV (inline) ─────────────────────
    if (item.type === "text")
      return (
        <div className="absolute inset-0 overflow-auto p-5 bg-card">
          <pre className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap font-mono break-words">
            {item.textContent || "(vazio)"}
          </pre>
        </div>
      );

    // ── Office Online viewer (OneDrive / public URL) ────────
    if (item.type === "office-online" && item.embedSrc)
      return <iframe src={item.embedSrc} title={item.name} className="absolute inset-0 w-full h-full border-0" allow="fullscreen" />;

    // ── Local Office file — cannot render, show info card ──
    if (item.type === "office-local") {
      const extColor: Record<string, string> = {
        docx: "text-blue-400", doc: "text-blue-400",
        xlsx: "text-green-400", xls: "text-green-400",
        pptx: "text-orange-400", ppt: "text-orange-400",
      };
      const color = extColor[item.ext || ""] || "text-muted-foreground";
      const label = item.ext === "docx" || item.ext === "doc" ? "Word"
        : item.ext === "xlsx" || item.ext === "xls" ? "Excel"
        : "PowerPoint";
      return (
        <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground p-6">
          <div className={`h-20 w-20 rounded-3xl bg-muted/50 border border-border flex items-center justify-center ${color}`}>
            {item.ext === "docx" || item.ext === "doc"
              ? <FileText className="h-10 w-10" />
              : item.ext === "xlsx" || item.ext === "xls"
              ? <FileSpreadsheet className="h-10 w-10" />
              : <Presentation className="h-10 w-10" />}
          </div>
          <div className="text-center">
            <p className="font-bold text-foreground mb-1">{item.name}</p>
            <p className="text-xs text-muted-foreground mb-0.5">{label} · {item.size}</p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs leading-relaxed mt-2">
              Arquivos Office locais não podem ser visualizados diretamente no navegador.
              Suba para o <strong>OneDrive</strong> ou <strong>Google Drive</strong> e cole o link de compartilhamento para visualizar aqui.
            </p>
          </div>
          <div className="flex gap-3">
            <a href={item.src} download={item.name}
              className="flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20 transition-all">
              <Download className="h-3.5 w-3.5" /> Baixar arquivo
            </a>
            <button onClick={() => setAddingType("url")}
              className="flex items-center gap-2 rounded-xl border border-border px-4 py-2 text-xs font-semibold hover:bg-muted/50 transition-all">
              <Link2 className="h-3.5 w-3.5" /> Colar link embed
            </button>
          </div>
        </div>
      );
    }

    // ── PDF (local blob: ou URL remota) ───────────────────
    if (item.type === "pdf")
      return <iframe src={item.src} title={item.name} className="absolute inset-0 w-full h-full border-0" allow="fullscreen" />;

    // ── Google / Office Online URL / generic iframe ────────
    const embedUrl = item.embedSrc || (!item.src.startsWith("blob:") ? item.src : null);
    if (embedUrl)
      return <iframe src={embedUrl} title={item.name} className="absolute inset-0 w-full h-full border-0" allow="fullscreen" />;

    // ── Fallback ───────────────────────────────────────────
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-muted-foreground">
        <FileText className="h-10 w-10 opacity-20" />
        <p className="text-xs">Pré-visualização indisponível.</p>
        <a href={item.src} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 text-primary hover:underline text-xs">
          <ExternalLink className="h-3.5 w-3.5" /> Abrir externamente
        </a>
      </div>
    );
  };

  // ═══ RENDER ═══════════════════════════════════════════════════════════════════

  return (
    <div className="flex flex-col flex-1 w-full min-h-[650px] overflow-hidden bg-background">

      {/* ══════════════════════════════════════════════════════
          TOP BAR — compact, all controls in one strip
          ══════════════════════════════════════════════════════ */}
      {!presenting && (
        <div className="shrink-0 flex items-center justify-between gap-3 px-4 md:px-6 py-3 border-b border-border bg-card/60 backdrop-blur-xl">

          {/* Left: identity */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-8 w-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <div className="hidden sm:block">
              <p className="text-[13px] font-black tracking-tight leading-none">Reuniões</p>
              <p className="text-[10px] text-muted-foreground leading-none mt-0.5">Sala de reunião técnica</p>
            </div>
          </div>

          {/* Center: layout presets */}
          <div className="flex items-center gap-1 rounded-xl bg-muted/50 p-1 border border-border/50">
            {LAYOUT_PRESETS.map(p => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                title={p.label}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-all ${
                  layoutPreset === p.id
                    ? "bg-card shadow-sm border border-border/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <p.icon className="h-3.5 w-3.5" />
                <span className="hidden md:block">{p.label}</span>
              </button>
            ))}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setAddingType("url")}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-muted/50 transition-all text-muted-foreground">
              <Link2 className="h-3.5 w-3.5" /> URL
            </button>
            <button onClick={() => setAddingType("google")}
              className="hidden sm:flex items-center gap-1.5 rounded-xl border border-blue-400/30 bg-blue-400/5 px-3 py-1.5 text-[11px] font-semibold hover:bg-blue-400/10 transition-all text-blue-400">
              <Globe className="h-3.5 w-3.5" /> Google
            </button>
            <button onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-[11px] font-semibold hover:bg-muted/50 transition-all">
              <Upload className="h-3.5 w-3.5" /> Upload
            </button>
            <button onClick={() => setPresenting(true)}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 transition-all shadow-glow-sm">
              <Play className="h-3.5 w-3.5" /> Apresentar
            </button>
            <input ref={fileInputRef} type="file" multiple
              accept=".pdf,.mp4,.webm,.mov,.avi,.mkv,.m4v,.png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.bmp,.pptx,.ppt,.docx,.doc,.xlsx,.xls,.csv,.txt,.md"
              className="hidden" onChange={handleFileUpload} />
          </div>
        </div>
      )}

      {/* ── Presenting: floating pill (no bar) ── */}
      <AnimatePresence>
        {presenting && pillVisible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -8 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="fixed top-4 right-4 z-[100] flex items-center gap-2.5 rounded-full border border-white/10 bg-black/60 backdrop-blur-xl px-3.5 py-2 shadow-2xl"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            <span className="text-[11px] font-semibold text-white/80">Apresentando</span>
            <span className="text-white/20 text-[10px]">·</span>
            <span className="text-[10px] text-white/40">F5</span>
            <button
              onClick={() => setPresenting(false)}
              className="ml-1 rounded-full h-5 w-5 flex items-center justify-center bg-white/10 hover:bg-white/25 transition-colors"
            >
              <X className="h-3 w-3 text-white/70" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══════════════════════════════════════════════════════
          SPLIT PANE — the war room
          ══════════════════════════════════════════════════════ */}
      <div
        ref={containerRef}
        className="flex flex-1 min-h-0 overflow-hidden select-none"
      >

        {/* ╔══════════════════════════════════╗
            ║  LEFT — MEDIA STAGE              ║
            ╚══════════════════════════════════╝ */}
        <div
          className="flex flex-col min-h-0 min-w-0 border-r border-border"
          style={{ width: hideRight ? "100%" : `${splitPct}%` }}
        >
          {/* Slim top bar — actions only */}
          <div className="shrink-0 flex items-center justify-between px-3 py-1.5 border-b border-border/50 bg-black/20">
            <div className="flex items-center gap-1.5">
              <button onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all">
                <Upload className="h-3 w-3" /> Upload
              </button>
              <button onClick={() => setAddingType("url")}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all">
                <Play className="h-3 w-3 text-red-400" /> YouTube / URL
              </button>
              <button onClick={() => setAddingType("google")}
                className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-blue-400 hover:bg-blue-400/10 transition-all">
                <Globe className="h-3 w-3" /> Google Drive
              </button>
            </div>
            <div className="flex items-center gap-1">
              {activeMedia && (
                <a href={activeMedia.src} target="_blank" rel="noopener noreferrer"
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all" title="Abrir em nova aba">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {hideRight && (
                <button onClick={() => { setHideRight(false); setSplitPct(64); setLayoutPreset("stage"); }}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all" title="Mostrar painel lateral">
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Media viewer */}
          <div className="flex-1 min-h-0 bg-black/5 relative">
            {activeMedia ? (
              <>
                {renderPreview(activeMedia)}
                {/* Overlay X — remove from library */}
                <button
                  onClick={() => {
                    const remaining = mediaItems.filter(m => m.id !== activeMedia.id);
                    setMediaItems(remaining);
                    setActiveMedia(remaining[0] ?? null);
                  }}
                  className="absolute top-3 right-3 z-20 h-8 w-8 rounded-full bg-black/60 backdrop-blur border border-white/15 flex items-center justify-center text-white/70 hover:text-white hover:bg-black/80 hover:border-white/40 transition-all shadow-lg"
                  title="Remover da biblioteca"
                >
                  <X className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-5 text-muted-foreground">
                <div className="relative">
                  <div className="absolute inset-0 rounded-3xl bg-primary/5 blur-2xl scale-150" />
                  <div className="relative grid grid-cols-3 gap-3 p-2">
                    {[{ Icon: Play, color: "text-red-400" }, { Icon: FileText, color: "text-red-400" }, { Icon: Presentation, color: "text-orange-400" }, { Icon: FileSpreadsheet, color: "text-green-400" }, { Icon: Globe, color: "text-blue-400" }, { Icon: Video, color: "text-purple-400" }].map(({ Icon, color }, i) => (
                      <div key={i} className="h-12 w-12 rounded-xl bg-muted/60 border border-border/60 flex items-center justify-center">
                        <Icon className={`h-5 w-5 opacity-40 ${color}`} />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold mb-1">Palco vazio</p>
                  <p className="text-xs opacity-50 max-w-[200px] leading-relaxed">Adicione conteúdo pela barra acima ou escolha uma mídia abaixo</p>
                </div>
              </div>
            )}
          </div>

          {/* ══ NETFLIX STRIP ══════════════════════════════════ */}
          <div className={`shrink-0 border-t border-border/50 bg-black/60 backdrop-blur transition-all ${mediaItems.length === 0 ? "h-0 overflow-hidden" : "h-[110px]"}`}>
            <div className="h-full flex items-center gap-3 px-3 overflow-x-auto">

              {mediaItems.map(item => {
                const isActive = activeMedia?.id === item.id;
                const hasCover = item.thumbnail || item.type === "image";
                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="group relative shrink-0 cursor-pointer"
                    style={{ width: 128, height: 80 }}
                    onClick={() => setActiveMedia(item)}
                  >
                    {/* Card */}
                    <div className={`w-full h-full rounded-xl overflow-hidden border-2 transition-all duration-200 ${
                      isActive
                        ? "border-primary shadow-[0_0_14px_rgba(var(--primary-rgb),0.6)] scale-105"
                        : "border-transparent group-hover:border-white/30 group-hover:scale-105"
                    }`}>
                      {/* Cover image (YouTube thumb or image file) */}
                      {hasCover ? (
                        <img
                          src={item.thumbnail || item.src}
                          alt={item.name}
                          className="w-full h-full object-cover"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${cardGradient(item)} flex items-center justify-center`}>
                          <div className="opacity-60">
                            {mediaTypeIcon(item, "h-7 w-7")}
                          </div>
                        </div>
                      )}

                      {/* Bottom overlay */}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-4">
                        <p className="text-[10px] text-white font-semibold truncate leading-tight">{item.name}</p>
                      </div>

                      {/* Active play indicator */}
                      {isActive && (
                        <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary flex items-center justify-center">
                          <Play className="h-2 w-2 text-primary-foreground fill-current" />
                        </div>
                      )}
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setMediaItems(p => p.filter(m => m.id !== item.id));
                        if (activeMedia?.id === item.id) setActiveMedia(null);
                      }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-10"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </motion.div>
                );
              })}

              {/* Add card */}
              <motion.div layout className="shrink-0" style={{ width: 128, height: 80 }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-full rounded-xl border-2 border-dashed border-white/15 hover:border-white/40 hover:bg-white/5 transition-all flex flex-col items-center justify-center gap-1 group"
                >
                  <Plus className="h-5 w-5 text-white/30 group-hover:text-white/60 transition-colors" />
                  <span className="text-[9px] text-white/30 group-hover:text-white/50 font-semibold transition-colors">Adicionar</span>
                </button>
              </motion.div>

            </div>
          </div>

          {/* Presenting KPI overlay (bottom of stage) */}
          {presenting && campaigns.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="shrink-0 grid grid-cols-4 gap-px border-t border-white/10 bg-white/5">
              {[
                { label: "Ativas", value: `${kpis.ativas}/${kpis.total}`, icon: Megaphone, color: "text-green-400" },
                { label: "Gasto", value: fmtBRL(kpis.gasto), icon: DollarSign, color: "text-primary" },
                { label: "Conv.", value: fmtNum(kpis.conv), icon: Target, color: "text-purple-400" },
                { label: "CPL", value: kpis.cpl > 0 ? fmtBRL(kpis.cpl) : "—", icon: TrendingUp, color: "text-amber-400" },
              ].map(({ label, value, icon: Icon, color }) => (
                <div key={label} className="flex items-center gap-2.5 px-4 py-2.5 bg-black/40">
                  <Icon className={`h-3.5 w-3.5 ${color}`} />
                  <div>
                    <p className="text-[9px] text-white/40 uppercase tracking-wider">{label}</p>
                    <p className="text-xs font-bold text-white">{value}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>

        {/* ╔══════════════════════════════════╗
            ║  DRAG HANDLE                     ║
            ╚══════════════════════════════════╝ */}
        {!hideRight && (
          <div
            onMouseDown={() => { isDragging.current = true; }}
            onTouchStart={() => { isDragging.current = true; }}
            className="group relative w-1.5 shrink-0 cursor-col-resize bg-border hover:bg-primary/40 transition-colors duration-150 flex items-center justify-center"
          >
            <div className="absolute flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <GripVertical className="h-5 w-5 text-primary" />
            </div>
          </div>
        )}

        {/* ╔══════════════════════════════════╗
            ║  RIGHT — DATA + NOTES (tabbed)   ║
            ╚══════════════════════════════════╝ */}
        {!hideRight && (
          <div className="flex flex-col flex-1 min-h-0 min-w-0">

            {/* Right panel tab bar */}
            <div className="shrink-0 flex items-center gap-0 border-b border-border bg-muted/30">
              <button
                onClick={() => setRightTab("data")}
                className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  rightTab === "data"
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <Table2 className="h-3.5 w-3.5" />
                Dados de Campanhas
                {isLoading && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
              </button>
              <button
                onClick={() => setRightTab("notes")}
                className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
                  rightTab === "notes"
                    ? "border-amber-400 text-amber-400 bg-amber-400/5"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                }`}
              >
                <PenLine className="h-3.5 w-3.5" />
                Anotações
                {notes && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 ml-0.5" />}
              </button>

              {/* Spacer + controls */}
              <div className="flex-1" />
              <div className="flex items-center gap-1 pr-3">
                {rightTab === "data" && isAdmin && (
                  <button onClick={() => setShowAdvanced(p => !p)}
                    className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                      showAdvanced
                        ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                        : "text-muted-foreground hover:bg-muted/50 border border-transparent"
                    }`}>
                    {showAdvanced ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    <span className="hidden lg:block">Avançado</span>
                  </button>
                )}
                {rightTab === "data" && (
                  <button onClick={refetchAll} disabled={isLoading}
                    className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all disabled:opacity-40">
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                  </button>
                )}
                <button onClick={() => { setHideRight(true); setLayoutPreset("media-only"); }}
                  className="rounded-lg p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" title="Ocultar painel">
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── TAB: DATA ─────────────────────────────────────────── */}
            {rightTab === "data" && (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">

                {/* Filters */}
                <div className="shrink-0 px-4 py-2.5 border-b border-border bg-card/40 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Account */}
                    <div className="relative">
                      <select value={accountFilter} onChange={e => setAccountFilter(e.target.value)}
                        className="appearance-none rounded-xl border border-border bg-background/60 py-1.5 pl-3 pr-7 text-[11px] font-semibold focus:border-primary/50 focus:outline-none transition-all">
                        <option value="all">Todas as contas</option>
                        {adAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    </div>
                    {/* Status */}
                    <div className="relative">
                      <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)}
                        className="appearance-none rounded-xl border border-border bg-background/60 py-1.5 pl-3 pr-7 text-[11px] font-semibold focus:border-primary/50 focus:outline-none transition-all">
                        <option value="all">Todos</option>
                        <option value="active">Ativos</option>
                        <option value="paused">Pausados</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                    </div>
                    {/* Date */}
                    <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate}
                      onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
                    {/* Search */}
                    <div className="relative flex-1 min-w-[120px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                      <input type="text" placeholder="Buscar..." value={campSearch}
                        onChange={e => setCampSearch(e.target.value)}
                        className="w-full rounded-xl border border-border bg-background/60 py-1.5 pl-8 pr-3 text-[11px] font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
                    </div>
                  </div>

                  {/* Level tabs */}
                  <div className="flex gap-1">
                    {LEVEL_TABS.map(t => (
                      <button key={t.id} onClick={() => setCampLevel(t.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all ${
                          campLevel === t.id
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted/50 border border-transparent"
                        }`}>
                        <t.icon className="h-3 w-3" />
                        {t.label}
                        {t.id === "campanhas" && selectedCamps.size > 0 && <span className="rounded-full bg-primary text-primary-foreground px-1.5 text-[9px] font-black">{selectedCamps.size}</span>}
                        {t.id === "conjuntos" && selectedAdSets.size > 0 && <span className="rounded-full bg-primary text-primary-foreground px-1.5 text-[9px] font-black">{selectedAdSets.size}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* KPI mini strip */}
                <div className="shrink-0 grid grid-cols-4 gap-px border-b border-border bg-border">
                  {[
                    { label: "Ativas", value: `${kpis.ativas}/${kpis.total}`, icon: Megaphone, color: "text-green-400" },
                    { label: "Gasto", value: fmtBRL(kpis.gasto), icon: DollarSign, color: "text-primary" },
                    { label: "Conv.", value: fmtNum(kpis.conv), icon: Target, color: "text-purple-400" },
                    { label: "CPL", value: kpis.cpl > 0 ? fmtBRL(kpis.cpl) : "—", icon: TrendingUp, color: "text-amber-400" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="flex items-center gap-2 px-3 py-2 bg-card">
                      <Icon className={`h-3 w-3 ${color} shrink-0`} />
                      <div className="min-w-0">
                        <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</p>
                        <p className="text-[11px] font-bold truncate">{value}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Table area — scrollable */}
                <div className="flex-1 min-h-0 overflow-auto">
                  {(campLevel === "conjuntos" && selectedCamps.size === 0) ||
                   (campLevel === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0) ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground text-center px-4">
                      <div className="h-12 w-12 rounded-2xl bg-muted/50 flex items-center justify-center">
                        {campLevel === "conjuntos" ? <LayoutGrid className="h-5 w-5 opacity-30" /> : <ImageIcon className="h-5 w-5 opacity-30" />}
                      </div>
                      <p className="text-xs font-semibold">Selecione campanhas na aba anterior</p>
                    </div>
                  ) : isLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-5 w-5 animate-spin text-primary/40" />
                    </div>
                  ) : (
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-border bg-muted/80 backdrop-blur">
                          <th className="px-3 py-2.5 w-8">
                            <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition">
                              {allSelected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                            </button>
                          </th>
                          <th className="px-2 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground w-14">Status</th>
                          <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nome</th>
                          <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                          <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-purple-400">Conv.</th>
                          <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-emerald-500">CPL</th>
                          <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                          {showAdvanced && isAdmin && <>
                            <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">CTR</th>
                            <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-amber-400">CPM</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr><td colSpan={showAdvanced && isAdmin ? 9 : 7} className="text-center py-10 text-muted-foreground text-xs">Nenhum resultado.</td></tr>
                        ) : filtered.map((c: any, i: number) => {
                          const isActive = c.status?.toUpperCase() === "ACTIVE";
                          const isSel = selSet.has(c.id);
                          return (
                            <motion.tr key={c.id}
                              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.012 }}
                              className={`border-b border-border/40 transition-colors ${isSel ? "bg-primary/5" : "hover:bg-muted/20"}`}>
                              <td className="px-3 py-2.5 text-center">
                                <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">
                                  {isSel ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="px-2 py-2.5 text-center">
                                <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-400" : "bg-muted-foreground"}`} />
                                  {isActive ? "On" : "Off"}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 max-w-[160px]">
                                <p className="font-bold text-foreground/90 truncate uppercase tracking-tight text-[10px]" title={c.name}>{c.name}</p>
                                {campLevel === "campanhas" && c.ad_account?.name && (
                                  <p className="text-[9px] text-muted-foreground/50 font-mono">{c.ad_account.name}</p>
                                )}
                              </td>
                              <td className="px-3 py-2.5 text-right font-mono text-muted-foreground">{c.t.reach > 0 ? fmtNum(c.t.reach) : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-purple-400">{c.t.conversions > 0 ? c.t.conversions : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-500">{c.t.cpl > 0 ? fmtBRL(c.t.cpl) : "—"}</td>
                              <td className="px-3 py-2.5 text-right font-mono font-bold text-primary">{fmtBRL(c.t.cost)}</td>
                              {showAdvanced && isAdmin && <>
                                <td className="px-3 py-2.5 text-right font-mono text-amber-400 text-[10px]">{c.t.ctr > 0 ? c.t.ctr.toFixed(2) + "%" : "—"}</td>
                                <td className="px-3 py-2.5 text-right font-mono text-amber-400 text-[10px]">{c.t.cpm > 0 ? fmtBRL(c.t.cpm) : "—"}</td>
                              </>}
                            </motion.tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-border bg-muted/30 sticky bottom-0">
                          <td colSpan={2} className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total ({filtered.length})</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right font-mono font-bold text-[10px]">{totals.reach > 0 ? fmtNum(totals.reach) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-purple-400 text-[10px]">{totals.conv > 0 ? totals.conv : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-emerald-500 text-[10px]">{totals.conv > 0 ? fmtBRL(totals.cost / totals.conv) : "—"}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-primary text-[10px]">{fmtBRL(totals.cost)}</td>
                          {showAdvanced && isAdmin && <td colSpan={2} />}
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* Table footer status */}
                <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-border/50 bg-card/40">
                  <span className="text-[10px] text-muted-foreground">
                    {filtered.length} {campLevel}
                    {accountFilter !== "all" && ` · ${adAccounts.find((a: any) => a.id === accountFilter)?.name || ""}`}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {format(new Date(), "dd/MM HH:mm", { locale: ptBR })}
                  </span>
                </div>
              </div>
            )}

            {/* ── TAB: NOTES ────────────────────────────────────────── */}
            {rightTab === "notes" && (
              <div className="flex flex-col flex-1 min-h-0">
                {/* Notes header */}
                <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-amber-500/5">
                  <div className="flex items-center gap-2">
                    <PenLine className="h-3.5 w-3.5 text-amber-400" />
                    <span className="text-[11px] font-bold text-amber-400/80 uppercase tracking-widest">Anotações</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-2 py-0.5">salvas automaticamente</span>
                </div>

                {/* Notes textarea — fills all available space */}
                <textarea
                  value={notes}
                  onChange={e => saveNotes(e.target.value)}
                  placeholder={`Anotações da reunião...\n\n• Pontos discutidos\n• Decisões tomadas\n• Próximos passos\n• Tarefas e responsáveis`}
                  className="flex-1 min-h-0 w-full resize-none bg-transparent px-5 py-4 text-sm outline-none placeholder:text-muted-foreground/40 leading-relaxed font-mono"
                  style={{ fontFamily: "inherit" }}
                />

                {/* Notes footer: char count */}
                <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-border/50 bg-card/40">
                  <span className="text-[10px] text-muted-foreground">{notes.length} caracteres</span>
                  {notes && (
                    <button onClick={() => saveNotes("")}
                      className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                      Limpar
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════
          MODALS: URL + Google
          ══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {addingType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
            onClick={() => { setAddingType(null); setUrlInput(""); setUrlName(""); setGoogleInput(""); }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className={`w-full max-w-md rounded-2xl border bg-card shadow-2xl p-5 ${
                addingType === "google" ? "border-blue-400/20" : "border-primary/20"
              }`}
            >
              {addingType === "url" ? (
                <>
                  <p className="text-sm font-bold mb-4 flex items-center gap-2">
                    <Link2 className="h-4 w-4 text-primary" /> Adicionar por URL
                  </p>
                  <div className="flex flex-col gap-2.5">
                    <input autoFocus type="text" placeholder="Nome (opcional)" value={urlName}
                      onChange={e => setUrlName(e.target.value)}
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-all" />
                    <input type="url" placeholder="https://..." value={urlInput}
                      onChange={e => setUrlInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddUrl()}
                      className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-all" />
                    <div className="flex gap-2 mt-1">
                      <button onClick={handleAddUrl}
                        className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition-all">Adicionar</button>
                      <button onClick={() => { setAddingType(null); setUrlInput(""); setUrlName(""); }}
                        className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all">Cancelar</button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold mb-1 flex items-center gap-2">
                    <Globe className="h-4 w-4 text-blue-400" /> Vincular Google Drive
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">Cole a URL do Google Sheets, Slides ou Docs. O arquivo precisa estar com acesso "Qualquer pessoa com o link".</p>
                  <div className="flex flex-col gap-2.5">
                    <input autoFocus type="url" placeholder="https://docs.google.com/..." value={googleInput}
                      onChange={e => setGoogleInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && handleAddGoogle()}
                      className="rounded-xl border border-blue-400/30 bg-background px-3 py-2.5 text-sm outline-none focus:border-blue-400/60 transition-all" />
                    <div className="flex gap-2 mt-1">
                      <button onClick={handleAddGoogle}
                        className="flex-1 rounded-xl bg-blue-500 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-600 transition-all">Vincular</button>
                      <button onClick={() => { setAddingType(null); setGoogleInput(""); }}
                        className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold hover:bg-muted/50 transition-all">Cancelar</button>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
