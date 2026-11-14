import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  FileText, Download, Printer, ArrowLeft, Target, 
  Calendar, CheckCircle2, Loader2, Globe, Brain,
  TrendingUp, Users, PieChart, Send, Copy, Settings,
  Eye, FileCheck, RefreshCw, Smartphone, Sparkles,
  Award, MessageSquare, AlertCircle, Plus, Search, X
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { DateRangePicker } from "@/components/DateRangePicker";
import { TemplateModal } from "@/components/TemplateModal";
import { WhatsAppSendModal } from "@/components/WhatsAppSendModal";
import { calibrateCampaignMetricsArray, calibrateAdMetricsArray, ensureDatabaseCalibrated } from "@/lib/metaConversionCalibrator";
import { useGlobalDate, getLocalDateString } from "@/contexts/DateContext";
import {
  buildReportSnapshot,
  classifyMetaEvent,
  computeUnitCost,
  formatMetricVectorSummary,
  formatPeriodLabel,
  getCampaignSelectionGroupLabel,
  getCampaignSelectorResultDisplay,
  parseCivilDate,
  type ReportSnapshot,
} from "@/lib/metricsDomain";
import {
  createMonotonicRequestGuard,
  invalidateMetaSnapshotConsumers,
  useActiveMetaSnapshot,
} from "@/lib/metaSnapshotCache";
import { SnapshotStatusBadge } from "@/components/SnapshotStatusBadge";
import { formatCurrencyBRLStrict } from "@/lib/metaIntegrationCore";

function fmtBRLWithSymbol(v: number | null | undefined): string {
  const f = formatCurrencyBRLStrict(v ?? null);
  return f ? `R$ ${f}` : "R$ 0,00";
}
import {
  fetchAllCustomReportTemplates,
  renderReportTemplateText,
  type ReportTemplateRecord,
} from "@/lib/reportTemplateEngine";

interface CampaignData {
  id: string;
  name: string;
  cost: number;
  impressions: number;
  clicks: number;
  inlineLinkClicks?: number;
  allClicks?: number;
  conversions: number;
  reach: number;
  objective: string;
  rawObjective?: string;
  optimizationGoal?: string;
  resultType?: string;
  resultIndicator?: string;
  platform: "meta" | "google";
  selected: boolean;
  campaignName?: string;
  adSetName?: string;
}

interface SavedReport {
  id: string;
  createdAt: string;
  clientName: string;
  periodText: string;
  reportMode: string;
  source: "api" | "upload";
  campaigns: CampaignData[];
  generatedText: string;
  reportLevel?: "campaign" | "adset" | "ad";
}

// ─── Heurística Top-Level para Classificação Precisa de Objetivos Reais ────────
export function detectCampaignObjective(
  campName: string = "",
  resultType: string = "",
  isVehicleStore: boolean = false,
  metaObjective: string = "",
  optimizationGoal: string = "",
  resultsIndicator: string = ""
): string {
  const name = (campName || "").toLowerCase();
  const rt = (resultType || "").toLowerCase();
  const rtUpper = (resultType || "").toUpperCase();
  const metaObj = (metaObjective || "").toUpperCase();
  const isCarDealership = isVehicleStore || name.includes("veiculo") || name.includes("veículo") || name.includes("carro") || name.includes("auto") || name.includes("moto") || name.includes("estoque");

  // Precedência oficial Meta: indicator -> optimization_goal -> resultType (nunca deixa POP/FACTOR caírem em Engajamento!)
  if (resultsIndicator || optimizationGoal) {
    const ev = classifyMetaEvent({
      campaignName: campName,
      rawObjective: metaObjective,
      optimizationGoal,
      resultType,
      resultsIndicator,
      isVehicleContext: isCarDealership,
    });
    if (ev.confidence !== "unknown" && ev.category !== "UNKNOWN") {
      if (ev.category === "MESSAGES") return isCarDealership ? "🚗 Mensagens nos veículos" : "💬 Mensagens";
      if (ev.category === "INSTAGRAM_PROFILE") return "📱 Visitas ao Perfil";
      if (ev.category === "LANDING_PAGE_VIEWS") return "🌐 Visualizações na Página";
      if (ev.category === "PURCHASES") return "💳 Conversões / Compras";
      if (ev.category === "LEADS") return /consignado|compramos seu carro/i.test(name) ? "🚗 Consignado" : "📧 Cadastros / Leads";
      if (ev.category === "VIDEO_VIEWS") return "▶️ Thru-Play";
      if (ev.category === "REACH") return "👁️ Alcance e Impressões";
      if (ev.category === "LINK_CLICKS") return "👆 Cliques no Link";
      if (ev.category === "ENGAGEMENT") return "👍 Engajamento / Página";
    }
  }

  // 0. Prioridade absoluta ao resultType canônico sincronizado da Meta Graph API
  if (rtUpper === "MESSAGES") {
    const isCarDealership = isVehicleStore || name.includes("veiculo") || name.includes("veículo") || name.includes("carro") || name.includes("auto") || name.includes("moto") || name.includes("estoque");
    return isCarDealership ? "🚗 Mensagens nos veículos" : "💬 Mensagens";
  }
  if (rtUpper === "INSTAGRAM_PROFILE") return "📱 Visitas ao Perfil";
  if (rtUpper === "LANDING_PAGE_VIEWS") return "🌐 Visualizações na Página";
  if (rtUpper === "PURCHASES") return "💳 Conversões / Compras";
  if (rtUpper === "LEADS") return /consignado|compramos seu carro/i.test(name) ? "🚗 Consignado" : "📧 Cadastros / Leads";
  if (rtUpper === "VIDEO_VIEWS") return "▶️ Thru-Play";
  if (rtUpper === "REACH") return "👁️ Alcance e Impressões";
  if (rtUpper === "LINK_CLICKS") return "👆 Cliques no Link";
  if (rtUpper === "UNKNOWN") return "📌 Outros / Revisar";

  // 1. Consignado / Compramos seu carro / Avaliação (prioridade máxima em contexto automotivo)
  if (
    rt.includes("consignado") ||
    name.includes("consignado") ||
    name.includes("compramos seu carro") ||
    name.includes("avaliacao") ||
    name.includes("avaliação") ||
    name.includes("compra de veiculo") ||
    name.includes("compra de carro")
  ) {
    return "🚗 Consignado";
  }

  // 2. Visitas ao Perfil do Instagram / Posts impulsionados
  if (
    rt.includes("perfil") ||
    rt.includes("profile") ||
    name.includes("visita ao perfil") ||
    name.includes("visitas ao perfil") ||
    name.includes("post do instagram") ||
    name.includes("post do ig") ||
    name.includes("perfil") ||
    name.includes("visitas perfil") ||
    name.includes("visita perfil") ||
    name.includes("| insta") ||
    name.includes("- insta") ||
    name.includes(" insta") ||
    name.endsWith("insta")
  ) {
    return "📱 Visitas ao Perfil";
  }

  // 3. Visualizações na Página de Destino / Cardápio / Landing Page
  if (
    rt.includes("página de destino") ||
    rt.includes("pagina de destino") ||
    rt.includes("landing_page") ||
    rt.includes("visualizações da página") ||
    rt.includes("visualização da página") ||
    name.includes("cardapio") ||
    name.includes("cardápio") ||
    name.includes("landing") ||
    name.includes("pagina de destino") ||
    name.includes("página de destino") ||
    name.includes("lp ") ||
    name.includes("pagina") ||
    name.includes("página")
  ) {
    return "🌐 Visualizações na Página";
  }

  // 4. Compras no site / Vendas / Delivery / E-commerce
  if (
    rt.includes("compra") ||
    rt.includes("purchase") ||
    rt.includes("pedido") ||
    rt.includes("checkout") ||
    metaObj === "OUTCOME_SALES" ||
    metaObj === "CONVERSIONS" ||
    name.includes("compra") ||
    name.includes("pedido") ||
    name.includes("checkout") ||
    name.includes("cmp de vendas") ||
    name.includes("delivery")
  ) {
    return "💳 Conversões / Compras";
  }

  // 5. Cadastros / Leads (Formulários instantâneos ou cadastros nativos)
  if (
    rt.includes("cadastro") ||
    rt.includes("lead") ||
    name.includes("formulario") ||
    name.includes("formulário") ||
    name.includes("cadastro") ||
    (metaObj === "OUTCOME_LEADS" && !name.includes("msg") && !name.includes("wpp") && !name.includes("whatsapp") && !name.includes("conversa"))
  ) {
    return "📧 Cadastros / Leads";
  }

  // 6. Mensagens / WhatsApp / Direct
  if (
    rt.includes("conversa") ||
    rt.includes("mensagem") ||
    rt.includes("message") ||
    rt.includes("whatsapp") ||
    rt.includes("direct") ||
    metaObj === "MESSAGES" ||
    name.includes("mensagem") ||
    name.includes("mensagens") ||
    name.includes("whatsapp") ||
    name.includes("wpp") ||
    name.includes("msg") ||
    name.includes("conversa") ||
    name.includes("direct") ||
    name.includes("grupo de vendedores") ||
    name.includes("vendedores") ||
    name.includes("atendimento") ||
    name.includes("vaga")
  ) {
    const isCarDealership = isVehicleStore || name.includes("veiculo") || name.includes("veículo") || name.includes("carro") || name.includes("auto") || name.includes("moto") || name.includes("estoque");
    return isCarDealership ? "🚗 Mensagens nos veículos" : "💬 Mensagens";
  }

  // 7. Vídeo / ThruPlay
  if (
    rt.includes("thruplay") ||
    rt.includes("vídeo") ||
    rt.includes("video") ||
    rt.includes("plays") ||
    metaObj === "VIDEO_VIEWS" ||
    name.includes("thruplay") ||
    name.includes("vídeo") ||
    name.includes("video") ||
    name.includes("reels")
  ) {
    return "▶️ Thru-Play";
  }

  // 8. Alcance e Impressões / Reconhecimento
  if (
    rt.includes("alcance") ||
    rt.includes("reach") ||
    rt.includes("impressão") ||
    rt.includes("impressões") ||
    rt.includes("impression") ||
    rt.includes("reconhecimento") ||
    metaObj === "OUTCOME_AWARENESS" ||
    name.includes("alcance") ||
    name.includes("reconhecimento") ||
    name.includes("awareness") ||
    name.includes("artes") ||
    name.includes("branding")
  ) {
    return "👁️ Alcance e Impressões";
  }

  // 9. Cliques no Link / Tráfego
  if (
    rt.includes("clique") ||
    rt.includes("click") ||
    rt.includes("link") ||
    metaObj === "OUTCOME_TRAFFIC" ||
    metaObj === "LINK_CLICKS" ||
    name.includes("clique") ||
    name.includes("click") ||
    name.includes("link") ||
    name.includes("trafego") ||
    name.includes("tráfego") ||
    name.includes("canal")
  ) {
    return "👆 Cliques no Link";
  }

  // 10. Engajamento
  if (
    rt.includes("engajamento") ||
    rt.includes("engagement") ||
    metaObj === "OUTCOME_ENGAGEMENT" ||
    metaObj === "POST_ENGAGEMENT" ||
    name.includes("engajamento")
  ) {
    return "🔥 Engajamento";
  }

  // Fallbacks de Objetivos Nativos da Meta
  if (metaObj === "OUTCOME_TRAFFIC" || metaObj === "LINK_CLICKS") return "👆 Cliques no Link";
  if (metaObj === "OUTCOME_ENGAGEMENT") return "🔥 Engajamento";
  if (metaObj === "OUTCOME_AWARENESS") return "👁️ Alcance e Impressões";
  if (metaObj === "OUTCOME_LEADS") return isVehicleStore ? "🚗 Mensagens nos veículos" : "📧 Cadastros / Leads";

  return "📌 Outros / Revisar";
}

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Gerador de Relatórios — NC Suite" }] }),
  validateSearch: (s: Record<string, unknown>): { from?: string; activeReportId?: string } => ({
    from: s.from as string | undefined,
    activeReportId: s.activeReportId as string | undefined,
  }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const search = useSearch({ from: "/_app/relatorios" });
  const queryClient = useQueryClient();
  const {
    accountId: globalAccountId,
    setAccountId: setGlobalAccountId,
    dateFrom: globalDateFrom,
    dateTo: globalDateTo,
    setDateFrom: setGlobalDateFrom,
    setDateTo: setGlobalDateTo,
  } = useGlobalDate();
  
  // Parâmetros do Relatório
  const [source, setSource] = useState<"api" | "upload">(search.from === "upload" ? "upload" : "api");
  const [clientName, setClientName] = useState("");
  const [periodText, setPeriodText] = useState("");
  const [reportLevel, setReportLevel] = useState<"campaign" | "adset" | "ad">("campaign");
  const [reportMode, setReportMode] = useState<string>("standard_auto");

  // Dados para Relatório de Vendas / E-commerce / Pizzaria / Cardápio
  const [salesRevenue, setSalesRevenue] = useState("");
  const [salesOrders, setSalesOrders] = useState("");
  
  const selectedAccountId = globalAccountId || "all";
  const setSelectedAccountId = (id: string) => {
    setGlobalAccountId(id);
  };

  const dateRange = useMemo(() => {
    const parseLocal = (iso: string, fallback: Date) => {
      const p = parseCivilDate(iso);
      return p ? new Date(p.year, p.month - 1, p.day, 12, 0, 0) : fallback;
    };
    return {
      startDate: parseLocal(globalDateFrom, subDays(new Date(), 29)),
      endDate: parseLocal(globalDateTo, new Date()),
    };
  }, [globalDateFrom, globalDateTo]);

  const setDateRange = (next: { startDate: Date; endDate: Date }) => {
    setGlobalDateFrom(getLocalDateString(next.startDate));
    setGlobalDateTo(getLocalDateString(next.endDate));
  };

  const [targetWhatsapp, setTargetWhatsapp] = useState("");
  const [activeReportId, setActiveReportId] = useState<string | null>(search.activeReportId || null);
  const [campaignList, setCampaignList] = useState<CampaignData[]>([]);
  const [accountPeriodReach, setAccountPeriodReach] = useState<number | null>(null);
  const [campaignSearch, setCampaignSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncingPeriod, setIsSyncingPeriod] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const loadGuardRef = useRef(createMonotonicRequestGuard());
  const activeSnapshot = useActiveMetaSnapshot({ accountId: selectedAccountId });
  const [generatedText, setGeneratedText] = useState("");
  const [isTextManuallyEdited, setIsTextManuallyEdited] = useState(false);
  const [regenerateNonce, setRegenerateNonce] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [isSavedReportsModalOpen, setIsSavedReportsModalOpen] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [savedTab, setSavedTab] = useState<"api" | "upload">("upload");
  const [reportSearchTerm, setReportSearchTerm] = useState("");
  const [reportSearchPeriod, setReportSearchPeriod] = useState("");
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activePdfLayout, setActivePdfLayout] = useState("classic");

  // Fetch das contas Meta Ads (para a origem API)
  const { data: accountsData } = useQuery<any[]>({
    queryKey: ["ad-accounts-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
    enabled: source === "api",
  });
  const accounts = accountsData ?? [];

  // Fetch dos clientes para auto-preenchimento
  const { data: clientsData } = useQuery<any[]>({
    queryKey: ["clients-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*");
      return (data as any[]) ?? [];
    },
    enabled: source === "api",
  });

  const { data: savedReports = [] } = useQuery<SavedReport[]>({
    queryKey: ["saved-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false });
      return (data || []).map((r: any) => ({
        id: r.id,
        createdAt: r.created_at,
        clientName: r.client_name || "",
        periodText: r.period || "",
        reportMode: r.raw_data?.reportMode || "complete",
        source: r.raw_data?.source || "api",
        campaigns: r.raw_data?.campaigns || [],
        generatedText: r.markdown || "",
        reportLevel: r.raw_data?.reportLevel || "campaign",
      }));
    },
  });

  const { data: templatesData, refetch: refetchTemplates } = useQuery<ReportTemplateRecord[]>({
    queryKey: ["report-templates"],
    queryFn: async () => {
      return await fetchAllCustomReportTemplates();
    },
  });

  // Contexto de Loja de Veículos vs Outros Nichos
  const isVehicleContext = useMemo(() => {
    const acc = accounts.find(a => a.id === selectedAccountId);
    const target = `${clientName || ""} ${acc?.name || ""}`.toLowerCase();
    return /veic|veíc|car|auto|moto|repass|multimarc/i.test(target);
  }, [clientName, selectedAccountId, accounts]);

  // Snapshot Único Determinístico (mesmo snapshotId na prévia, WhatsApp, PDF e histórico salvo)
  const activeReportSnapshot = useMemo<ReportSnapshot | null>(() => {
    const selected = campaignList.filter(c => c.selected);
    if (selected.length === 0) return null;
    const allAccSelected =
      selectedAccountId !== "all" &&
      reportLevel === "campaign" &&
      selected.length === campaignList.length &&
      Boolean(accountPeriodReach && accountPeriodReach > 0);
    return buildReportSnapshot({
      clientName: clientName || accounts.find(a => a.id === selectedAccountId)?.name || "Cliente",
      accountName: accounts.find(a => a.id === selectedAccountId)?.name || clientName || "Cliente",
      dateFrom: globalDateFrom,
      dateTo: globalDateTo,
      source: source || "database",
      deduplicatedAccountReach: allAccSelected ? accountPeriodReach : null,
      campaigns: selected.map(c => ({
        id: c.id,
        name: c.name,
        cost: c.cost,
        impressions: c.impressions,
        reach: c.reach,
        clicks: Number(c.inlineLinkClicks ?? c.clicks ?? 0),
        inlineLinkClicks: Number(c.inlineLinkClicks ?? c.clicks ?? 0),
        allClicks: Number(c.allClicks ?? c.clicks ?? 0),
        conversions: c.conversions,
        rawObjective: c.rawObjective,
        optimizationGoal: c.optimizationGoal,
        resultType: c.resultType || c.objective,
        resultsIndicator: c.resultIndicator,
        isVehicleContext,
      })),
    });
  }, [campaignList, clientName, accounts, selectedAccountId, reportLevel, accountPeriodReach, globalDateFrom, globalDateTo, source, isVehicleContext]);

  const handleUpdateCampaignName = (id: string, newName: string) => {
    setCampaignList(prev => prev.map(c => c.id === id ? { ...c, name: newName } : c));
  };

  const handleDateChange = (start: Date, end: Date) => {
    setDateRange({ startDate: start, endDate: end });
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const selectedMonth = months[start.getMonth()];
    const selectedYear = start.getFullYear();
    setPeriodText(`${selectedMonth} ${selectedYear}`);
    setActiveReportId(null);
  };

  const handleSaveReport = async (showToast = true) => {
    if (!generatedText) {
      toast.warning("Gere o relatório antes de salvar!");
      return;
    }

    const totalInvestment = campaignList.filter(c => c.selected).reduce((s, c) => s + c.cost, 0);
    const totalCampaigns = campaignList.filter(c => c.selected).length;

    const selectedSnapshot = activeReportSnapshot || buildReportSnapshot({
      clientName,
      accountName: clientName,
      dateFrom: globalDateFrom,
      dateTo: globalDateTo,
      source: source || "database",
      campaigns: campaignList
        .filter(c => c.selected)
        .map(c => ({
          id: c.id,
          name: c.name,
          cost: c.cost,
          impressions: c.impressions,
          reach: c.reach,
          clicks: Number(c.inlineLinkClicks ?? c.clicks ?? 0),
          inlineLinkClicks: Number(c.inlineLinkClicks ?? c.clicks ?? 0),
          allClicks: Number(c.allClicks ?? c.clicks ?? 0),
          conversions: c.conversions,
          rawObjective: c.rawObjective,
          optimizationGoal: c.optimizationGoal,
          resultType: c.resultType || c.objective,
          resultsIndicator: c.resultIndicator,
          isVehicleContext,
        })),
    });

    const payload = {
      client_name: clientName,
      period: periodText,
      markdown: generatedText,
      raw_data: {
        source,
        campaigns: campaignList,
        reportMode,
        reportLevel,
        salesRevenue,
        salesOrders,
        snapshotId: selectedSnapshot.snapshotId,
        snapshot: selectedSnapshot,
        isTextManuallyEdited,
      },
      total_investment: totalInvestment,
      total_campaigns: totalCampaigns,
    };

    try {
      if (activeReportId) {
        await supabase.from("reports").update(payload).eq("id", activeReportId);
        if (showToast) toast.success("Relatório atualizado!");
      } else {
        const { data } = await supabase.from("reports").insert(payload).select("id").single();
        if (data?.id) setActiveReportId(data.id);
        if (showToast) toast.success("Relatório salvo!");
      }
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
    } catch (err: any) {
      toast.error("Erro ao salvar relatório: " + (err.message ?? "tente novamente"));
    }
  };

  const handleLoadReport = (rep: SavedReport) => {
    setSource(rep.source);
    setClientName(rep.clientName);
    setPeriodText(rep.periodText);
    setReportMode(rep.reportMode);
    setCampaignList(rep.campaigns);
    setIsTextManuallyEdited(Boolean((rep as any).raw_data?.isTextManuallyEdited));
    setGeneratedText(rep.generatedText);
    setActiveReportId(rep.id);
    if ((rep as any).raw_data?.salesRevenue) {
      setSalesRevenue((rep as any).raw_data.salesRevenue);
    }
    if ((rep as any).raw_data?.salesOrders) {
      setSalesOrders((rep as any).raw_data.salesOrders);
    }
    if (rep.reportLevel) {
      setReportLevel(rep.reportLevel);
    }
    toast.success(`Relatório de ${rep.clientName} carregado com sucesso!`);
  };

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("reports").delete().eq("id", id);
    if (activeReportId === id) setActiveReportId(null);
    queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
    toast.success("Relatório removido!");
  };

  // Inicializa o período atual com o nome do mês em português (Ex: "MAIO 2026")
  useEffect(() => {
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const now = new Date();
    setPeriodText(`${months[now.getMonth()]} ${now.getFullYear()}`);
    
    // WhatsApp padrão do localStorage
    const savedWhatsapp = localStorage.getItem("nc_agency_whatsapp") || "";
    setTargetWhatsapp(savedWhatsapp);
  }, []);

  // Auto-preencher Nome do Cliente ao selecionar conta
  useEffect(() => {
    if (source === "api" && !activeReportId) {
      if (selectedAccountId === "all") {
        setClientName("Consolidado");
      } else {
        const client = clientsData?.find(c => c.meta_ad_account_id === selectedAccountId);
        const acc = accounts.find(a => a.id === selectedAccountId);
        const resolvedName = client?.name || acc?.name || "";
        
        if (resolvedName) {
          setClientName(resolvedName);
          
          // Auto-detectar modelo de relatório pelo nicho do cliente (Ex: Pizza/Delivery vs Veículos/Geral)
          const lower = resolvedName.toLowerCase();
          if (/pizza|cardapio|cardápio|delivery|restaurante|burger|comida|ecommerce|e-commerce|loja virtual/i.test(lower)) {
            setReportMode("ecommerce_sales");
          } else {
            setReportMode("standard_auto");
          }
        }
      }
    }
  }, [selectedAccountId, clientsData, accounts, source, activeReportId]);

  // Carregar dados de acordo com a origem (API ou Upload)
  const loadData = async () => {
    const reqToken = loadGuardRef.current.next();
    if (source === "upload") {
      try {
        const stored = localStorage.getItem("nc_extracted_campaigns");
        const storedPlat = (localStorage.getItem("nc_extracted_platform") ?? "meta") as "meta" | "google";
        if (stored) {
          const parsed = JSON.parse(stored);
          const mapped: CampaignData[] = parsed.map((c: any, index: number) => {
            // Usar result_type extraído pelo OCR para classificar o objetivo com inteligência contextual
            const rawObj = detectCampaignObjective(c.name, c.result_type, isVehicleContext);
            return {
              id: `ocr-${index}`,
              name: c.name || "Sem Nome",
              cost: Number(c.cost || 0),
              impressions: Number(c.impressions || 0),
              clicks: Number(c.clicks || 0),
              conversions: Number(c.conversions || 0),
              reach: Number(c.reach || 0),
              objective: rawObj,
              platform: storedPlat,
              selected: true
            };
          });
          if (!loadGuardRef.current.isCurrent(reqToken)) return;
          setCampaignList(mapped);

          // Carregar informações extraídas de cliente, período e modelo
          const storedClient = localStorage.getItem("nc_extracted_client");
          if (storedClient && (!clientName || clientName === "Consolidado")) {
            setClientName(storedClient);
          }

          const storedPeriod = localStorage.getItem("nc_extracted_period");
          if (storedPeriod) {
            setPeriodText(storedPeriod);
          }

          const storedTemplateMode = localStorage.getItem("nc_extracted_template_mode");
          if (storedTemplateMode) {
            setReportMode(storedTemplateMode);
          }

          const storedEcom = localStorage.getItem("nc_extracted_ecommerce_data");
          if (storedEcom) {
            try {
              const parsedEcom = JSON.parse(storedEcom);
              if (parsedEcom.revenue) setSalesRevenue(parsedEcom.revenue);
              if (parsedEcom.orders) setSalesOrders(parsedEcom.orders);
            } catch {}
          }
        } else {
          setCampaignList([]);
        }
      } catch (e) {
        console.error("Erro ao carregar campanhas do print:", e);
      }
    } else {
      // Buscar dados do Meta Ads / Google Ads integrado local
      setIsLoadingData(true);
      setCampaignList([]);
      setAccountPeriodReach(null);
      try {
        const getLocalDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        };

        const startLimit = getLocalDateStr(dateRange.startDate);
        const endLimit = getLocalDateStr(dateRange.endDate);
        
        let mapped: CampaignData[] = [];

        // Helper para buscar com paginação para contornar limite de 1000 do Supabase
        // E garantir que a filtragem ocorra na tabela principal usando campaign_id
        const fetchPaginated = async (table: string, selectQuery: string, accountId: string, extraFilters?: (q: any) => any) => {
           let campaignIds: string[] = [];
           if (accountId !== "all") {
             const { data: camps } = await supabase.from("campaigns").select("id").eq("ad_account_id", accountId);
             campaignIds = (camps || []).map(c => c.id);
             if (campaignIds.length === 0) return []; // Conta não tem campanhas
           }

           let allData: any[] = [];
           const step = 1000;
           
           // Dividir em chunks de 100 para não estourar o limite da URL no IN()
           const chunks = [];
           if (campaignIds.length > 0) {
             for (let i = 0; i < campaignIds.length; i += 100) {
                chunks.push(campaignIds.slice(i, i + 100));
             }
           } else {
             chunks.push([]); // "all" accounts
           }

           for (const chunk of chunks) {
             let from = 0;
             while (true) {
               let q = supabase.from(table).select(selectQuery);
               if (chunk.length > 0) {
                 q = q.in("campaign_id", chunk);
               }
               if (extraFilters) {
                 q = extraFilters(q);
               }
               q = q.range(from, from + step - 1);
               const { data, error } = await q;
               if (error) {
                 console.error(`Erro paginação em ${table}:`, error);
                 break;
               }
               if (data && data.length > 0) allData.push(...data);
               if (!data || data.length < step) break;
               from += step;
             }
             if (accountId === "all" && allData.length >= 15000) break; // Trava de segurança global
           }
           return allData;
        };

        if (reportLevel === "adset") {
          let dbData = await fetchPaginated("ad_sets", `
            id, name, campaign_id, optimization_goal,
            campaigns!inner(id, name, ad_account_id, objective),
            asset_metrics(cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, reach, result_type, result_indicator, optimization_goal, date)
          `, selectedAccountId);
          if (!dbData || dbData.length === 0) {
            dbData = await fetchPaginated("ad_sets", `
              id, name, campaign_id,
              campaigns!inner(id, name, ad_account_id, objective),
              asset_metrics(cost, conversions, impressions, clicks, reach, date)
            `, selectedAccountId);
          }

          mapped = (dbData || []).map((adset: any) => {
            const filteredMetrics = (adset.asset_metrics || []).filter((x: any) => {
              if (!x.date) return true;
              return x.date >= startLimit && x.date <= endLimit;
            });
            const cost = filteredMetrics.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
            const conversions = filteredMetrics.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
            const inlineLinkClicks = filteredMetrics.reduce((s: number, x: any) => s + Number(x.inline_link_clicks ?? x.clicks ?? 0), 0);
            const allClicks = filteredMetrics.reduce((s: number, x: any) => s + Number(x.all_clicks ?? x.clicks ?? 0), 0);
            const impressions = filteredMetrics.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
            const reach = filteredMetrics.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
            const optGoal = filteredMetrics.find((x: any) => x.optimization_goal)?.optimization_goal || adset.optimization_goal || "";
            const resType = filteredMetrics.find((x: any) => x.result_type)?.result_type || "";
            const resInd = filteredMetrics.find((x: any) => x.result_indicator)?.result_indicator || "";

            const adAccountId = adset.campaigns?.ad_account_id;
            const matchedAccount = accounts.find(a => a.id === adAccountId);
            const platformStr = matchedAccount?.platform === "Google Ads" ? "google" : "meta";

            return {
              id: adset.id,
              name: adset.name,
              campaignName: adset.campaigns?.name || "Sem Campanha",
              cost,
              impressions,
              clicks: inlineLinkClicks,
              inlineLinkClicks,
              allClicks,
              conversions,
              reach,
              rawObjective: adset.campaigns?.objective,
              optimizationGoal: optGoal || undefined,
              resultType: resType || undefined,
              resultIndicator: resInd || undefined,
              objective: detectCampaignObjective(adset.name, resType, isVehicleContext, adset.campaigns?.objective, optGoal, resInd),
              platform: platformStr as "meta" | "google",
              selected: cost > 0
            };
          }).filter((c: any) => c.cost > 0 || c.impressions >= 1 || c.reach >= 1);

        } else if (reportLevel === "ad") {
          let dbData = await fetchPaginated("ads", `
            id, name, campaign_id, ad_set_id,
            campaigns!inner(id, name, ad_account_id, objective),
            ad_sets(id, name, optimization_goal),
            asset_metrics(cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, reach, result_type, result_indicator, optimization_goal, date)
          `, selectedAccountId);
          if (!dbData || dbData.length === 0) {
            dbData = await fetchPaginated("ads", `
              id, name, campaign_id, ad_set_id,
              campaigns!inner(id, name, ad_account_id, objective),
              ad_sets(id, name),
              asset_metrics(cost, conversions, impressions, clicks, reach, date)
            `, selectedAccountId);
          }

          mapped = (dbData || []).map((ad: any) => {
            const calibratedAssetMetrics = calibrateAdMetricsArray(ad.name || "", ad.asset_metrics || []);
            const filteredMetrics = calibratedAssetMetrics.filter((x: any) => {
              if (!x.date) return true;
              return x.date >= startLimit && x.date <= endLimit;
            });
            const cost = filteredMetrics.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
            const conversions = filteredMetrics.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
            const inlineLinkClicks = filteredMetrics.reduce((s: number, x: any) => s + Number(x.inline_link_clicks ?? x.clicks ?? 0), 0);
            const allClicks = filteredMetrics.reduce((s: number, x: any) => s + Number(x.all_clicks ?? x.clicks ?? 0), 0);
            const impressions = filteredMetrics.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
            const reach = filteredMetrics.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
            const optGoal = filteredMetrics.find((x: any) => x.optimization_goal)?.optimization_goal || ad.ad_sets?.optimization_goal || "";
            const resType = filteredMetrics.find((x: any) => x.result_type)?.result_type || "";
            const resInd = filteredMetrics.find((x: any) => x.result_indicator)?.result_indicator || "";

            const adAccountId = ad.campaigns?.ad_account_id;
            const matchedAccount = accounts.find(a => a.id === adAccountId);
            const platformStr = matchedAccount?.platform === "Google Ads" ? "google" : "meta";

            return {
              id: ad.id,
              name: ad.name,
              campaignName: ad.campaigns?.name || "Sem Campanha",
              adSetName: ad.ad_sets?.name || "Sem Conjunto",
              cost,
              impressions,
              clicks: inlineLinkClicks,
              inlineLinkClicks,
              allClicks,
              conversions,
              reach,
              rawObjective: ad.campaigns?.objective,
              optimizationGoal: optGoal || undefined,
              resultType: resType || undefined,
              resultIndicator: resInd || undefined,
              objective: detectCampaignObjective(ad.name, resType, isVehicleContext, ad.campaigns?.objective, optGoal, resInd),
              platform: platformStr as "meta" | "google",
              selected: cost > 0
            };
          }).filter((c: any) => c.cost > 0 || c.impressions >= 1 || c.reach >= 1);

        } else {
          // Default: campaign level
          ensureDatabaseCalibrated(supabase).catch(() => {});
          let dbMetrics = await fetchPaginated("metrics", `
            campaign_id, cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, reach, result_type, result_indicator, optimization_goal, date,
            campaigns!inner(id, name, ad_account_id, objective)
          `, selectedAccountId, (q) => {
             return q.gte("date", startLimit).lte("date", endLimit);
          });
          if (!dbMetrics || dbMetrics.length === 0) {
            dbMetrics = await fetchPaginated("metrics", `
              campaign_id, cost, conversions, impressions, clicks, reach, result_type, date,
              campaigns!inner(id, name, ad_account_id, objective)
            `, selectedAccountId, (q) => {
              return q.gte("date", startLimit).lte("date", endLimit);
            });
          }

          if (!dbMetrics || dbMetrics.length === 0) {
            if (!loadGuardRef.current.isCurrent(reqToken)) return;
            setCampaignList([]);
            return;
          }

          // Agrupar métricas por campanha e identificar plataforma correta
          const metricsMap = new Map<string, { id: string, name: string, platform: string, cost: number; impressions: number; clicks: number; inlineLinkClicks: number; allClicks: number; conversions: number; reach: number; resultType?: string; resultIndicator?: string; optimizationGoal?: string; metaObjective?: string }>();
          
          dbMetrics.forEach((rawM: any) => {
            const [m] = calibrateCampaignMetricsArray(rawM.campaigns?.name || "", [rawM]);
            const campId = m.campaign_id;
            const adAccountId = m.campaigns?.ad_account_id;
            const matchedAccount = accounts.find(a => a.id === adAccountId);
            const platformStr = matchedAccount?.platform === "Google Ads" ? "google" : "meta";
            const linkClk = Number(m.inline_link_clicks !== undefined && m.inline_link_clicks !== null ? m.inline_link_clicks : m.clicks || 0);
            const totalClk = Number(m.all_clicks !== undefined && m.all_clicks !== null ? m.all_clicks : m.clicks || 0);
            
            const cur = metricsMap.get(campId) || { 
               id: campId, 
               name: m.campaigns?.name || "Sem Nome", 
               platform: platformStr,
               cost: 0, impressions: 0, clicks: 0, inlineLinkClicks: 0, allClicks: 0, conversions: 0, reach: 0,
               resultType: m.result_type || undefined,
               resultIndicator: m.result_indicator || undefined,
               optimizationGoal: m.optimization_goal || undefined,
               metaObjective: m.campaigns?.objective || undefined,
            };
            
            cur.cost += Number(m.cost || 0);
            cur.impressions += Number(m.impressions || 0);
            cur.clicks += linkClk;
            cur.inlineLinkClicks += linkClk;
            cur.allClicks += totalClk;
            cur.conversions += Number(m.conversions || 0);
            cur.reach += Number(m.reach || 0);
            if (m.result_type) cur.resultType = m.result_type;
            if (m.result_indicator) cur.resultIndicator = m.result_indicator;
            if (m.optimization_goal) cur.optimizationGoal = m.optimization_goal;
            if (m.campaigns?.objective) cur.metaObjective = m.campaigns?.objective;
            metricsMap.set(campId, cur);
          });

          mapped = Array.from(metricsMap.values()).map(c => ({
            id: c.id,
            name: c.name,
            cost: c.cost,
            impressions: c.impressions,
            clicks: c.inlineLinkClicks,
            inlineLinkClicks: c.inlineLinkClicks,
            allClicks: c.allClicks,
            conversions: c.conversions,
            reach: c.reach,
            rawObjective: c.metaObjective,
            optimizationGoal: c.optimizationGoal,
            resultType: c.resultType,
            resultIndicator: c.resultIndicator,
            objective: detectCampaignObjective(c.name, c.resultType, isVehicleContext, c.metaObjective, c.optimizationGoal, c.resultIndicator),
            platform: c.platform as "meta" | "google",
            selected: c.cost > 0 || c.impressions > 0 || c.reach > 0
          }));

          // Buscar alcance deduplicado da conta no período se filtrado para conta única
          let fetchedAccReach: number | null = null;
          if (selectedAccountId !== "all") {
            try {
              const { data: accStat } = await (supabase as any)
                .from("meta_account_period_stats")
                .select("reach")
                .eq("ad_account_id", selectedAccountId)
                .eq("start_date", startLimit)
                .eq("end_date", endLimit)
                .maybeSingle();
              if (accStat?.reach && Number(accStat.reach) > 0) {
                fetchedAccReach = Number(accStat.reach);
              }
            } catch {
              // Opcional caso migration não tenha sido aplicada
            }
          }
          if (!loadGuardRef.current.isCurrent(reqToken)) return;
          setAccountPeriodReach(fetchedAccReach);
        }

        // Ordena por maior custo
        if (!loadGuardRef.current.isCurrent(reqToken)) return;
        mapped.sort((a, b) => b.cost - a.cost);
        setCampaignList(mapped);
      } catch (err) {
        if (!loadGuardRef.current.isCurrent(reqToken)) return;
        console.error("Erro ao puxar dados da API local:", err);
        toast.error("Falha ao puxar métricas das contas conectadas.");
      } finally {
        if (loadGuardRef.current.isCurrent(reqToken)) {
          setIsLoadingData(false);
        }
      }
    }
  };

  const handleSyncPeriod = async () => {
    if (source !== "api") return;
    setIsSyncingPeriod(true);
    try {
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };
      const timeRange = {
        since: getLocalDateStr(dateRange.startDate),
        until: getLocalDateStr(dateRange.endDate),
      };
      const [metaSyncRes] = await Promise.all([
        supabase.functions.invoke("sync-meta-ads", { body: { triggered_by: "manual_report", time_range: timeRange } }),
        supabase.functions.invoke("sync-google-ads", { body: { triggered_by: "manual_report", time_range: timeRange } }),
      ]);
      await invalidateMetaSnapshotConsumers({
        queryClient,
        accountId: selectedAccountId,
        dateFrom: globalDateFrom,
        dateTo: globalDateTo,
        snapshotId: metaSyncRes?.data?.sync_id || undefined,
      });
      toast.success("Sincronização do período concluída! Recarregando dados...");
      await loadData();
    } catch (err: any) {
      toast.error("Falha ao sincronizar período: " + (err.message ?? "erro desconhecido"));
    } finally {
      setIsSyncingPeriod(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [source, selectedAccountId, globalDateFrom, globalDateTo, reportLevel, activeSnapshot.snapshotId]);

  const handleToggleSelectAll = (val: boolean) => {
    setCampaignList(prev => prev.map(c => ({ ...c, selected: val })));
  };

  const handleToggleSelect = (id: string) => {
    setCampaignList(prev => prev.map(c => c.id === id ? { ...c, selected: !c.selected } : c));
  };

  const handleUpdateObjective = (id: string, newObj: string) => {
    setCampaignList(prev => prev.map(c => c.id === id ? { ...c, objective: newObj } : c));
  };

  // Gera o relatório em tempo real de forma reativa a qualquer alteração de campanhas, período ou modelo
  useEffect(() => {
    const selected = campaignList.filter(c => c.selected);
    if (selected.length === 0) {
      setGeneratedText("");
      return;
    }

    const totalCost = selected.reduce((sum, c) => sum + c.cost, 0);
    const agencyName = localStorage.getItem("nc_agency_name") || "NC AGÊNCIA";

    // 1. Agrupar Resultados por Tipo/Objetivo e Plataforma (MetricVector — nunca soma unidades heterogêneas)
    const groupedTypes = new Map<string, { cost: number; results: number; reach: number; impressions: number; linkClicks: number; unitPlural: string; isReach: boolean; isClick: boolean }>();
    const platforms = new Set<string>();

    selected.forEach(c => {
      platforms.add(c.platform === 'google' ? 'Google Ads' : 'Meta Ads');
      const linkClk = Number(c.inlineLinkClicks ?? c.clicks ?? 0);
      const ev = classifyMetaEvent({
        campaignName: c.name,
        rawObjective: c.rawObjective,
        optimizationGoal: c.optimizationGoal,
        resultType: c.resultType || c.objective,
        resultsIndicator: c.resultIndicator,
        isVehicleContext,
      });
      const isClickBased = ev.category === "LINK_CLICKS" || c.objective.includes("Cliques");
      const isReachBased = ev.category === "REACH" || c.objective.includes("Alcance");

      let resultValue = Number(c.conversions || 0);
      if (isClickBased) resultValue = linkClk;
      if (isReachBased) resultValue = c.reach > 0 ? c.reach : Number(c.conversions || 0);

      const cur = groupedTypes.get(c.objective) || {
        cost: 0,
        results: 0,
        reach: 0,
        impressions: 0,
        linkClicks: 0,
        unitPlural: ev.unitPlural,
        isReach: isReachBased,
        isClick: isClickBased,
      };
      cur.cost += c.cost;
      cur.results += resultValue;
      cur.reach += c.reach;
      cur.impressions += c.impressions;
      cur.linkClicks += linkClk;
      groupedTypes.set(c.objective, cur);
    });

    const snapSummary = activeReportSnapshot?.summary;
    const vectorSummary = snapSummary ? formatMetricVectorSummary(snapSummary.metricVector) : [];
    const totalLinkClicks = selected.reduce((sum, c) => sum + Number(c.inlineLinkClicks ?? c.clicks ?? 0), 0);
    const totalAllClicks = selected.reduce((sum, c) => sum + Number(c.allClicks ?? c.clicks ?? 0), 0);
    const platformString = Array.from(platforms).join(" & ");
    
    // Calcula o período civil exato (1 dia -> DD/MM/YYYY; parcial -> início a fim; mês completo -> MÊS ANO)
    const periodInfo = formatPeriodLabel(globalDateFrom, globalDateTo);
    const displayPeriod = source === "upload" ? periodText : periodInfo.label;

    const customTemplate = templatesData?.find(t => t.id === reportMode);

    const allAccountCampaignsSelected =
      selectedAccountId !== "all" &&
      reportLevel === "campaign" &&
      selected.length > 0 &&
      selected.length === campaignList.length &&
      Boolean(accountPeriodReach && accountPeriodReach > 0);
    const effectiveAccountReach = allAccountCampaignsSelected ? accountPeriodReach : null;

    if (customTemplate) {
      setActivePdfLayout(customTemplate.pdf_layout || "classic");
      const storeNameForCustom =
        clientName && clientName !== "Consolidado"
          ? clientName
          : accounts.find(a => a.id === selectedAccountId)?.name || clientName || "Cliente";

      const rendered = renderReportTemplateText({
        templateText: customTemplate.message_template,
        campaigns: selected,
        clientName: storeNameForCustom,
        periodText: displayPeriod,
        reportTitlePrefix: source === "upload" ? undefined : periodInfo.reportTitlePrefix,
        agencyName,
        reportLevel,
        isVehicleContext,
        salesRevenue,
        salesOrders,
        accountPeriodReach: effectiveAccountReach,
      });

      if (!isTextManuallyEdited) {
        setGeneratedText(rendered);
      }
      return;
    }

    // --- Lógica para os Relatórios Padrão (Sem Template Customizado) ---
    const summedReach = selected.reduce((s, c) => s + c.reach, 0);
    const totalReach = effectiveAccountReach ?? summedReach;
    const totalImps = selected.reduce((s, c) => s + c.impressions, 0);

    const buildHeader = (title: string) => {
      return `📊 *${title}*\n━━━━━━━━━━━━━━━━━━━━\n🏢 *Cliente:* ${clientName}\n📅 *Período:* ${displayPeriod}\n📱 *Plataformas:* ${platformString}\n\n`;
    };

    // Bloco de totais gerais — presente em TODOS os modos de relatório (sem soma heterogênea de unidades)
    const buildTotais = () => {
      let txt = `━━━━━━━━━━━━━━━━━━━━\n*📊 TOTAIS GERAIS*\n━━━━━━━━━━━━━━━━━━━━\n`;
      txt += `💵 *Investimento Total:* ${fmtBRLWithSymbol(totalCost)}\n`;
      if (snapSummary && snapSummary.conversionResults > 0) {
        txt += `📈 *Conversões Elegíveis:* ${snapSummary.conversionResults.toLocaleString("pt-BR")}\n`;
        txt += `💲 *CPA (Conversões):* ${snapSummary.cpaEligible !== null ? fmtBRLWithSymbol(snapSummary.cpaEligible) : "Não calculável"}\n`;
      } else if (vectorSummary.length === 1) {
        txt += `📈 *${vectorSummary[0].label}:* ${vectorSummary[0].value.toLocaleString("pt-BR")}\n`;
      }
      if (vectorSummary.length > 1) {
        txt += `📊 *Resultados por tipo:* ${vectorSummary.map((e) => `${e.value.toLocaleString("pt-BR")} ${e.label}`).join(" | ")}\n`;
      }
      txt += `👆 *Cliques no Link:* ${totalLinkClicks.toLocaleString("pt-BR")}`;
      if (totalImps > 0) {
        txt += ` (CTR: ${((totalLinkClicks / totalImps) * 100).toFixed(2)}%)`;
      }
      if (totalAllClicks > totalLinkClicks) {
        txt += ` • Todos: ${totalAllClicks.toLocaleString("pt-BR")}`;
      }
      txt += `\n`;
      if (totalReach > 0) {
        const reachLbl = effectiveAccountReach !== null ? " (conta deduplicado)" : selected.length > 1 ? " (soma)" : "";
        txt += `👥 *Alcance${reachLbl}:* ${totalReach.toLocaleString("pt-BR")}\n`;
      }
      if (totalImps > 0) txt += `👁️ *Impressões Totais:* ${totalImps.toLocaleString("pt-BR")}\n`;
      txt += `📌 *Campanhas no Relatório:* ${selected.length}`;
      if (activeReportSnapshot?.snapshotId) {
        txt += ` • ID: \`${activeReportSnapshot.snapshotId}\``;
      }
      txt += `\n\n`;
      return txt;
    };

    const buildResultsByType = () => {
      let txt = `━━━━━━━━━━━━━━━━━━━━\n*RESULTADOS POR TIPO*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      groupedTypes.forEach((data, type) => {
        const isClick = data.isClick;
        const isReach = data.isReach;
        const cpl = data.results > 0 ? (isReach ? (data.cost / data.results) * 1000 : data.cost / data.results) : null;

        let resultLabel = `Resultados (${data.unitPlural})`;
        if (isClick) resultLabel = "Cliques no Link";
        if (isReach) resultLabel = "Pessoas Alcançadas";

        let costLabel = "Custo por Resultado";
        if (isClick) costLabel = "CPC (Link)";
        if (isReach) costLabel = "Custo por 1.000 Contas Alcançadas";

        txt += `${type}\n`;
        txt += `   💵 Investimento: ${fmtBRLWithSymbol(data.cost)}\n`;
        txt += `   📈 ${resultLabel}: ${data.results.toLocaleString("pt-BR")}\n`;
        txt += `   💲 ${costLabel}: ${cpl !== null ? fmtBRLWithSymbol(cpl) : "Não calculável"}\n`;
        if (data.linkClicks > 0 && !isClick) txt += `   👆 Cliques no link: ${data.linkClicks.toLocaleString("pt-BR")}\n`;
        if (data.reach > 0 && !isReach) txt += `   👥 Alcance${selected.length > 1 ? " (soma)" : ""}: ${data.reach.toLocaleString("pt-BR")}\n`;
        if (data.impressions > 0) {
          txt += `   👁️ Impressões: ${data.impressions.toLocaleString("pt-BR")}`;
          if (isReach && data.cost > 0) {
            txt += ` (CPM: ${fmtBRLWithSymbol((data.cost / data.impressions) * 1000)})`;
          }
          txt += `\n\n`;
        } else {
          txt += `\n`;
        }
      });
      return txt;
    };

    const buildCampaignDetails = () => {
      let levelTitle = "DETALHAMENTO DE CAMPANHAS";
      if (reportLevel === "adset") levelTitle = "DETALHAMENTO DE CONJUNTOS DE ANÚNCIOS";
      if (reportLevel === "ad") levelTitle = "DETALHAMENTO DE ANÚNCIOS";

      let txt = `━━━━━━━━━━━━━━━━━━━━\n*${levelTitle}*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      ['google', 'meta'].forEach(plat => {
        const platCampaigns = selected.filter(c => c.platform === plat);
        if (platCampaigns.length === 0) return;
        
        txt += `*— ${plat === 'google' ? 'GOOGLE ADS' : 'META ADS'} —*\n\n`;
        platCampaigns.forEach(c => {
          const ev = classifyMetaEvent({
            campaignName: c.name,
            rawObjective: c.rawObjective,
            optimizationGoal: c.optimizationGoal,
            resultType: c.resultType || c.objective,
            resultsIndicator: c.resultIndicator,
            isVehicleContext,
          });
          const isClickObj = ev.category === "LINK_CLICKS" || c.objective.includes("Cliques");
          const isReachObj = ev.category === "REACH" || c.objective.includes("Alcance");
          const linkClk = Number(c.inlineLinkClicks ?? c.clicks ?? 0);
          const resultValue = isClickObj ? linkClk : isReachObj ? (c.reach > 0 ? c.reach : c.conversions) : c.conversions;
          const costPerRes = resultValue > 0 ? (isReachObj ? (c.cost / resultValue) * 1000 : c.cost / resultValue) : null;
          const costLabel = isReachObj ? "Custo/1.000 contas alc." : "Custo/Resultado";
          const typeLabel = ev.unitPlural;
          
          txt += `📌 *${c.name.toUpperCase()}*\n`;
          if (reportLevel === "adset" && c.campaignName) {
            txt += `   📁 Campanha: ${c.campaignName}\n`;
          } else if (reportLevel === "ad") {
            if (c.adSetName) txt += `   📦 Conjunto: ${c.adSetName}\n`;
            if (c.campaignName) txt += `   📁 Campanha: ${c.campaignName}\n`;
          }
          txt += `   💵 Invest: ${fmtBRLWithSymbol(c.cost)}\n`;
          txt += `   📈 Result: ${resultValue.toLocaleString("pt-BR")} (${typeLabel})\n`;
          txt += `   💲 ${costLabel}: ${costPerRes !== null ? fmtBRLWithSymbol(costPerRes) : "Não calculável"}\n`;
          if (linkClk > 0 && !isClickObj) txt += `   👆 Cliques no link: ${linkClk.toLocaleString("pt-BR")}\n`;
          txt += `\n`;
        });
      });
      return txt;
    };

    let finalText = "";
    let reportTitle = "RELATÓRIO DE PERFORMANCE";
    if (reportLevel === "adset") reportTitle = "RELATÓRIO DE CONJUNTOS DE ANÚNCIOS";
    if (reportLevel === "ad") reportTitle = "RELATÓRIO DE ANÚNCIOS DE PERFORMANCE";

    if (reportMode === "standard_auto") {
      setActivePdfLayout("minimalist");

      const isConsignado = (c: CampaignData) => 
        /consignado/i.test(c.name) || c.objective.toLowerCase().includes("consignado");

      const isReachOrImpression = (c: CampaignData) => 
        c.objective.includes("Alcance") || 
        c.objective.includes("Thru-Play") || 
        c.objective.includes("Vídeo") ||
        /alcance|reconhecimento|impress[õo]es|plays|vídeo|video|artes/i.test(c.name);

      const isProfile = (c: CampaignData) =>
        c.objective.includes("Perfil") ||
        /visita.*perfil|perfil.*instagram|post.*instagram|insta/i.test(c.name);

      const isPage = (c: CampaignData) =>
        c.objective.includes("Página") ||
        c.objective.includes("Pagina") ||
        /página.*destino|pagina.*destino|site|cardapio|landing|grupo.*vendedores/i.test(c.name);

      const isLink = (c: CampaignData) =>
        c.objective.includes("Cliques") ||
        /clique.*link|link.*click|trafego.*nc|canal.*wpp/i.test(c.name);

      const isCarMsg = (c: CampaignData) =>
        c.objective.includes("veículo") ||
        c.objective.includes("veiculo") ||
        c.objective.includes("Mensagens nos veículos") ||
        (!isConsignado(c) && !isReachOrImpression(c) && !isProfile(c) && !isPage(c) && !isLink(c) && isVehicleContext);

      const isGeneralMsg = (c: CampaignData) =>
        (c.objective.includes("Mensagens") || c.objective.includes("WhatsApp") || c.objective.includes("Direct")) && !isCarMsg(c);

      const carMsgCampaigns = selected.filter(c => isCarMsg(c));
      const reachCampaigns = selected.filter(c => isReachOrImpression(c) && !isConsignado(c));
      const consignadoCampaigns = selected.filter(c => isConsignado(c));
      const profileCampaigns = selected.filter(c => isProfile(c) && !isReachOrImpression(c) && !isConsignado(c));
      const pageCampaigns = selected.filter(c => isPage(c) && !isReachOrImpression(c) && !isConsignado(c));
      const linkCampaigns = selected.filter(c => isLink(c) && !isReachOrImpression(c) && !isConsignado(c));
      const generalMsgCampaigns = selected.filter(c => isGeneralMsg(c));

      // Se alguma campanha não entrou nas regras acima, aloca no bloco contextual principal
      const handledIds = new Set([
        ...carMsgCampaigns.map(c => c.id),
        ...reachCampaigns.map(c => c.id),
        ...consignadoCampaigns.map(c => c.id),
        ...profileCampaigns.map(c => c.id),
        ...pageCampaigns.map(c => c.id),
        ...linkCampaigns.map(c => c.id),
        ...generalMsgCampaigns.map(c => c.id),
      ]);
      const otherCampaigns = selected.filter(c => !handledIds.has(c.id));
      if (otherCampaigns.length > 0) {
        if (isVehicleContext) {
          carMsgCampaigns.push(...otherCampaigns);
        } else {
          generalMsgCampaigns.push(...otherCampaigns);
        }
      }

      const periodInfoStd = formatPeriodLabel(globalDateFrom, globalDateTo);
      const activePeriod = source === "upload"
        ? (periodText.toUpperCase() || periodInfoStd.label)
        : periodInfoStd.label;
      const storeName = clientName && clientName !== "Consolidado" 
        ? clientName 
        : (accounts.find(a => a.id === selectedAccountId)?.name || clientName || "");

      let txt = `${source === "upload" ? "Relatório de performance" : periodInfoStd.reportTitlePrefix}: \n`;
      if (storeName) {
        txt += `Loja: ${storeName}\n`;
      }
      txt += ` *Período:* ${activePeriod}\n\n`;

      // 1. Mensagens nos Veículos
      if (carMsgCampaigns.length > 0) {
        const costMsg = carMsgCampaigns.reduce((s, c) => s + c.cost, 0);
        const leadsMsg = carMsgCampaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
        const cplMsg = leadsMsg > 0 ? costMsg / leadsMsg : null;
        txt += `*Campanha de mensagens nos veiculos:*\n`;
        txt += ` Investimento: ${fmtBRLWithSymbol(costMsg)}\n`;
        txt += ` Total de conversas / leads: ${leadsMsg.toLocaleString("pt-BR")}\n`;
        txt += ` Custo por resultado: ${cplMsg !== null ? fmtBRLWithSymbol(cplMsg) : "Não calculável (0 resultados)"}\n\n`;
      }

      // 2. Mensagens / WhatsApp Geral (quando não for loja de veículos)
      if (generalMsgCampaigns.length > 0) {
        const costMsg = generalMsgCampaigns.reduce((s, c) => s + c.cost, 0);
        const leadsMsg = generalMsgCampaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
        const cplMsg = leadsMsg > 0 ? costMsg / leadsMsg : null;
        txt += `*Campanha de Mensagens / WhatsApp:*\n`;
        txt += ` Investimento: ${fmtBRLWithSymbol(costMsg)}\n`;
        txt += ` Total de conversas: ${leadsMsg.toLocaleString("pt-BR")}\n`;
        txt += ` Custo por conversa: ${cplMsg !== null ? fmtBRLWithSymbol(cplMsg) : "Não calculável (0 conversas)"}\n\n`;
      }

      // 3. Alcance e Impressões
      if (reachCampaigns.length > 0) {
        const costReach = reachCampaigns.reduce((s, c) => s + c.cost, 0);
        const reachedPeople = reachCampaigns.reduce((s, c) => s + (c.reach > 0 ? c.reach : Number(c.conversions || 0)), 0);
        const impsReach = reachCampaigns.reduce((s, c) => s + c.impressions, 0);
        const costPer1kReach = computeUnitCost(costReach, reachedPeople, "REACH");
        const cpmReach = impsReach > 0 ? (costReach / impsReach) * 1000 : null;
        txt += `*Campanha de Alcance e Impressões:*\n`;
        txt += `Investimento: ${fmtBRLWithSymbol(costReach)}\n`;
        txt += `Pessoas alcançadas: ${reachedPeople.toLocaleString("pt-BR")}\n`;
        txt += `Custo por 1.000 contas alcançadas: ${costPer1kReach !== null ? fmtBRLWithSymbol(costPer1kReach) : "Não calculável"}\n`;
        if (impsReach > 0) {
          txt += `Impressões: ${impsReach.toLocaleString("pt-BR")}${cpmReach !== null ? ` (CPM: ${fmtBRLWithSymbol(cpmReach)})` : ""}\n`;
        }
        txt += `\n`;
      }

      // 4. Consignado
      if (consignadoCampaigns.length > 0) {
        const costCons = consignadoCampaigns.reduce((s, c) => s + c.cost, 0);
        const leadsCons = consignadoCampaigns.reduce((s, c) => s + (c.conversions > 0 ? c.conversions : 0), 0);
        const cplCons = leadsCons > 0 ? costCons / leadsCons : null;
        txt += `*Campanha de consignado* \n`;
        txt += `Total de leads: ${leadsCons.toLocaleString("pt-BR")}\n`;
        txt += `Custo por leads: ${cplCons !== null ? fmtBRLWithSymbol(cplCons) : "Não calculável"}\n`;
        txt += `Investimento: ${fmtBRLWithSymbol(costCons)}\n\n`;
      }

      // 5. Visitas ao Perfil do Instagram
      if (profileCampaigns.length > 0) {
        const costProf = profileCampaigns.reduce((s, c) => s + c.cost, 0);
        const visitsProf = profileCampaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
        const cpvProf = visitsProf > 0 ? costProf / visitsProf : null;
        txt += `*Campanha de Visitas ao Perfil:*\n`;
        txt += `Investimento: ${fmtBRLWithSymbol(costProf)}\n`;
        txt += `Visitas ao perfil: ${visitsProf.toLocaleString("pt-BR")}\n`;
        txt += `Custo por visita: ${cpvProf !== null ? fmtBRLWithSymbol(cpvProf) : "Não calculável"}\n\n`;
      }

      // 6. Visualizações na Página / Site
      if (pageCampaigns.length > 0) {
        const costViews = pageCampaigns.reduce((s, c) => s + c.cost, 0);
        const visitsViews = pageCampaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
        const cpView = visitsViews > 0 ? costViews / visitsViews : null;
        txt += `*Visualizações na Página:*\n`;
        txt += `Investimento: ${fmtBRLWithSymbol(costViews)}\n`;
        txt += `Resultados: ${visitsViews.toLocaleString("pt-BR")} visitas\n`;
        txt += `Custo por visualizações: ${cpView !== null ? fmtBRLWithSymbol(cpView) : "Não calculável"}\n\n`;
      }

      // 7. Cliques no Link / Tráfego
      if (linkCampaigns.length > 0) {
        const costLink = linkCampaigns.reduce((s, c) => s + c.cost, 0);
        const clicksLink = linkCampaigns.reduce((s, c) => s + c.clicks, 0);
        const allClicksLink = linkCampaigns.reduce((s, c) => s + Number((c as any).allClicks ?? 0), 0);
        const cpcLink = clicksLink > 0 ? costLink / clicksLink : 0;
        const cpcAll = allClicksLink > 0 ? costLink / allClicksLink : 0;
        txt += `*Campanha de Cliques no Link:*\n`;
        txt += `Investimento: ${fmtBRLWithSymbol(costLink)}\n`;
        txt += `Cliques no link: ${clicksLink.toLocaleString("pt-BR")}\n`;
        if (allClicksLink > 0 && allClicksLink !== clicksLink) {
          txt += `Cliques (Todos): ${allClicksLink.toLocaleString("pt-BR")}\n`;
        }
        txt += `CPC Link: ${clicksLink > 0 ? fmtBRLWithSymbol(cpcLink) : "Não calculável"}${cpcAll > 0 ? ` | CPC (Todos): ${fmtBRLWithSymbol(cpcAll)}` : ""}\n\n`;
      }

      if (!isTextManuallyEdited) {
        setGeneratedText(txt.trim());
      }
      return;
    }

    if (reportMode === "ecommerce_sales") {
      setActivePdfLayout("analytical");

      const isPageViews = (c: CampaignData) => 
        c.objective.includes("Visualizações") || 
        c.objective.includes("Cliques") ||
        /site|cardapio|cardápio|página|destino|landing/i.test(c.name);

      const isSales = (c: CampaignData) =>
        c.objective.includes("Compras") ||
        c.objective.includes("Vendas") ||
        /compra|venda|vendas|purchase|pedido/i.test(c.name);

      const pageViewCampaigns = selected.filter(c => isPageViews(c));
      const salesCampaigns = selected.filter(c => isSales(c));

      // Totais Gerais
      const totalInvest = selected.reduce((s, c) => s + c.cost, 0);
      const totalReach = selected.reduce((s, c) => s + c.reach, 0);
      const totalImps = selected.reduce((s, c) => s + c.impressions, 0);

      // Visualizações na Página
      const investViews = pageViewCampaigns.reduce((s, c) => s + c.cost, 0);
      const visitsCount = pageViewCampaigns.reduce((s, c) => s + (c.objective.includes("Cliques") ? Number(c.clicks || 0) : Number(c.conversions || 0)), 0);
      const costPerView = visitsCount > 0 ? investViews / visitsCount : null;
      const impsViews = pageViewCampaigns.reduce((s, c) => s + c.impressions, 0);
      const cpmViews = impsViews > 0 ? (investViews / impsViews) * 1000 : null;

      // Conversões / Compras
      const investSales = salesCampaigns.reduce((s, c) => s + c.cost, 0);
      const purchasesMeta = salesCampaigns.reduce((s, c) => s + c.conversions, 0);
      const cpaSales = purchasesMeta > 0 ? investSales / purchasesMeta : null;
      const reachSales = salesCampaigns.reduce((s, c) => s + c.reach, 0);
      const impsSales = salesCampaigns.reduce((s, c) => s + c.impressions, 0);

      // Fechamento informado pelo usuário
      const numOrders = Number(String(salesOrders).replace(/\./g, "").replace(",", ".")) || 0;
      const parsedRevenue = Number(String(salesRevenue).replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
      const formattedRevenue = parsedRevenue > 0 
        ? parsedRevenue.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : (salesRevenue || "0,00");

      const convRate = visitsCount > 0 && numOrders > 0 
        ? ((numOrders / visitsCount) * 100).toFixed(2).replace(".", ",")
        : "0,00";

      const storeName = clientName && clientName !== "Consolidado" 
        ? clientName 
        : (accounts.find(a => a.id === selectedAccountId)?.name || clientName || "Cliente");

      const titlePrefix = source === "upload" ? "Relatório mensal" : periodInfo.reportTitlePrefix;
      let txt = `${titlePrefix}: \n`;
      if (storeName) {
        txt += `Loja: ${storeName}\n`;
      }
      txt += ` *Período:* ${displayPeriod}\n\n`;

      txt += `*Totais Gerais:*\n`;
      txt += ` Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      if (totalReach > 0) txt += ` Alcance${selected.length > 1 ? " (soma)" : ""}: ${totalReach.toLocaleString("pt-BR")}\n`;
      if (totalImps > 0) txt += ` Impressões Totais: ${totalImps.toLocaleString("pt-BR")}\n`;
      txt += ` Taxa de conversão: ${convRate}%\n`;
      txt += ` Cálculo da taxa: ${numOrders.toLocaleString("pt-BR")} pedidos ÷ ${visitsCount.toLocaleString("pt-BR")} visualizações no site × 100 = ${convRate}%\n\n`;

      txt += `*Visualizações na Página:*\n`;
      txt += ` Investimento: R$ ${investViews.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      txt += ` Resultados: ${visitsCount.toLocaleString("pt-BR")} visitas\n`;
      txt += ` Custo por visualizações: ${costPerView !== null ? `R$ ${costPerView.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Não calculável"}\n`;
      txt += ` Impressões / Plays: ${impsViews.toLocaleString("pt-BR")}\n`;
      txt += ` CPM: ${cpmViews !== null ? `R$ ${cpmViews.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Não calculável"}\n\n`;

      txt += `*Conversões / Compras:*\n`;
      txt += ` Investimento: R$ ${investSales.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      txt += ` Resultados: ${purchasesMeta.toLocaleString("pt-BR")}\n`;
      txt += ` CPA: ${cpaSales !== null ? `R$ ${cpaSales.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "Não calculável"}\n`;
      if (reachSales > 0) txt += ` Alcance: ${reachSales.toLocaleString("pt-BR")}\n`;
      if (impsSales > 0) txt += ` Impressões: ${impsSales.toLocaleString("pt-BR")}\n`;
      txt += `\n`;

      txt += `*No site/Cardápio:*\n`;
      txt += ` Faturamento Liquido: R$ ${formattedRevenue}\n`;
      txt += ` Resultados: ${numOrders.toLocaleString("pt-BR")} pedidos finalizados\n\n`;

      if (purchasesMeta > 0 && numOrders > 0) {
        txt += `*OBS:* Temos campanhas de venda com ${purchasesMeta} pedidos, esses ${purchasesMeta} pedidos estão inclusos nos ${numOrders.toLocaleString("pt-BR")} pedidos finalizados.\n`;
      }

      if (!isTextManuallyEdited) {
        setGeneratedText(txt.trim());
      }
      return;
    }

    if (reportMode === "complete") {
      setActivePdfLayout("classic");
      finalText += buildHeader(reportTitle);
      finalText += buildTotais();
      finalText += buildResultsByType();
      finalText += buildCampaignDetails();
    } else if (reportMode === "objective") {
      setActivePdfLayout("analytical");
      finalText += buildHeader("RELATÓRIO DE RESULTADOS");
      finalText += buildTotais();
      finalText += buildResultsByType();
    } else { // campaigns mode
      setActivePdfLayout("minimalist");
      finalText += buildHeader(reportTitle);
      finalText += buildTotais();
      finalText += buildCampaignDetails();
    }

    finalText += `━━━━━━━━━━━━━━━━━━━━\n*${agencyName.toUpperCase()}*`;
    if (!isTextManuallyEdited) {
      setGeneratedText(finalText);
    }
  }, [campaignList, reportMode, clientName, periodText, templatesData, reportLevel, salesRevenue, salesOrders, dateRange, selectedAccountId, globalDateFrom, globalDateTo, source, isTextManuallyEdited, regenerateNonce]);

  const handleGenerate = () => {
    if (isLoadingData || isSyncingPeriod) {
      toast.warning("Atualizando dados do snapshot — aguarde concluir antes de gerar ou salvar.");
      return;
    }
    const selected = campaignList.filter(c => c.selected);
    if (selected.length === 0) {
      toast.warning("Selecione pelo menos uma campanha!");
      return;
    }
    if (!generatedText) {
      toast.warning("O relatório ainda está sendo preparado — aguarde um instante.");
      return;
    }
    setIsGenerating(true);
    setTimeout(async () => {
      await handleSaveReport(true);
      setIsGenerating(false);
    }, 300);
  };

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(generatedText);
    setCopied(true);
    toast.success("Relatório copiado para a área de transferência!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendWhatsapp = () => {
    if (!targetWhatsapp) {
      toast.error("Por favor, configure o número de WhatsApp antes de enviar!");
      return;
    }
    const cleanNum = targetWhatsapp.replace(/\D/g, "");
    const url = `https://api.whatsapp.com/send?phone=${cleanNum}&text=${encodeURIComponent(generatedText)}`;
    window.open(url, "_blank");
    toast.info("Abrindo o WhatsApp...");
  };

  const filteredCampaignList = useMemo(() => {
    if (!campaignSearch.trim()) return campaignList;
    const q = campaignSearch.toLowerCase();
    return campaignList.filter(c => 
      c.name.toLowerCase().includes(q) || 
      c.objective.toLowerCase().includes(q) ||
      (c.campaignName && c.campaignName.toLowerCase().includes(q))
    );
  }, [campaignList, campaignSearch]);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      
      {/* HEADER TÉCNICO E PREMIUM */}
      <div className="flex flex-col gap-4 border-b border-white/5 pb-6 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start sm:items-center gap-3">
          <Link to="/dashboard" className="flex items-center justify-center h-10 w-10 shrink-0 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10 mt-1 sm:mt-0">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
              <p className="label-mono text-primary font-bold tracking-widest uppercase text-[11px]">Módulo Performance AI</p>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tighter text-gradient uppercase mt-0.5 leading-tight">Motor de Relatórios</h1>
            <SnapshotStatusBadge
              snapshotId={activeSnapshot.snapshotId}
              committedAt={activeSnapshot.committedAt}
              isUpdating={isLoadingData || isSyncingPeriod}
              className="mt-1.5 w-fit"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
          <button
            onClick={() => {
              setActiveReportId(null);
              setSource("upload");
              setCampaignList([]);
              setGeneratedText("");
              setClientName("");
              setPeriodText("");
              localStorage.removeItem("nc_extracted_campaigns");
              localStorage.removeItem("nc_extracted_platform");
              toast.success("Pronto! Clique em 'Ir para Upload' para extrair um novo print.");
            }}
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-all border border-primary/20"
            title="Limpa todos os dados e começa do zero"
          >
            <Plus className="h-4 w-4" /> Novo Relatório
          </button>
          
          <button
            onClick={() => { setSavedTab(source); setIsSavedReportsModalOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-foreground hover:bg-white/10 transition-all border border-white/10 hover:border-white/20"
          >
            <FileText className="h-4 w-4" /> Salvos
            {savedReports.length > 0 && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80">{savedReports.length}</span>
            )}
          </button>

        {/* Alternador de Origem de Dados */}
        <div className="flex flex-col sm:flex-row rounded-xl bg-white/5 p-1 border border-white/5">
          <button 
            onClick={() => { setSource("api"); setActiveReportId(null); }} 
            className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[11px] sm:text-xs font-bold transition-all flex-1 ${source === "api" ? "bg-primary text-background" : "text-muted-foreground hover:text-white"}`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" /> Meta Ads (Integrado)
          </button>
          <button
            onClick={() => { setSource("upload"); setActiveReportId(null); setClientName(""); }}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[11px] sm:text-xs font-bold transition-all flex-1 ${source === "upload" ? "bg-primary text-background" : "text-muted-foreground hover:text-white"}`}
          >
            <Sparkles className="h-3.5 w-3.5 shrink-0" /> Extração (OCR)
          </button>
        </div>
        </div>
      </div>

      {/* PAINEL DE CONFIGURAÇÕES E PARÂMETROS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:hidden">
        
        {/* Painel Esquerdo: Variáveis do Relatório */}
        <div className="glass-panel card-sport p-6 space-y-6 lg:col-span-1 border-white/10 bg-white/5 relative z-20">
          <div className="border-b border-border/50 pb-3 flex items-center gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">1</span>
            <div>
              <h3 className="header-sport text-sm font-black uppercase tracking-widest text-primary">Parâmetros Principais</h3>
              <p className="text-[9px] text-muted-foreground mt-0.5">Defina o cliente, período e modelo.</p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Loja / Nome do Cliente</label>
              <input 
                value={clientName} 
                onChange={(e) => {
                  setClientName(e.target.value);
                  setActiveReportId(null);
                }}
                placeholder="Ex: LumaCar"
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
              />
            </div>

            {source === "upload" && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Período de Análise (Texto Livre)</label>
                <input 
                  value={periodText} 
                  onChange={(e) => {
                    setPeriodText(e.target.value);
                    setActiveReportId(null);
                  }}
                  placeholder="Ex: ABRIL 2026"
                  className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                />
              </div>
            )}

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Janela de Tempo (Calendário)</label>
              <DateRangePicker 
                startDate={dateRange.startDate} 
                endDate={dateRange.endDate} 
                onChange={handleDateChange}
                className="w-full"
              />
            </div>

            {source === "api" && (
              <>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Conta Conectada</label>
                  <select 
                    value={selectedAccountId} 
                    onChange={(e) => {
                      setSelectedAccountId(e.target.value);
                      setActiveReportId(null);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                  >
                    <option value="all">Consolidado (Todas as contas)</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nível de Granularidade</label>
                  <select
                    value={reportLevel}
                    onChange={(e) => {
                      setReportLevel(e.target.value as "campaign" | "adset" | "ad");
                      setActiveReportId(null);
                    }}
                    className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                  >
                    <option value="campaign">Campanhas</option>
                    <option value="adset">Conjuntos de Anúncios</option>
                    <option value="ad">Anúncios</option>
                  </select>
                </div>

                {/* Botão de re-sincronização do período — resolve dados parciais/faltando */}
                <button
                  onClick={handleSyncPeriod}
                  disabled={isSyncingPeriod}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-white/10 transition disabled:opacity-50"
                  title="Força o download de todos os dados do período selecionado direto da Meta/Google — útil quando o relatório mostra valores menores do que o esperado."
                >
                  {isSyncingPeriod
                    ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Sincronizando período...</>
                    : <><RefreshCw className="h-3.5 w-3.5" /> Re-sincronizar Período</>
                  }
                </button>
              </>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modelo / Composição do Relatório</label>
                <button onClick={() => setIsTemplateModalOpen(true)} className="text-[9px] text-primary hover:underline uppercase font-bold tracking-widest flex items-center gap-1"><Settings className="w-3 h-3"/> Templates</button>
              </div>
              <select 
                value={reportMode} 
                onChange={(e) => setReportMode(e.target.value as any)}
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
              >
                <option value="standard_auto">⭐ Padrão NC (Veículos / Leads / Consignado)</option>
                <option value="ecommerce_sales">🍕 Vendas / Cardápio / E-commerce (Site & Pedidos)</option>
                <option value="complete">📊 Completo Analítico (Tipo + Detalhe)</option>
                <option value="objective">🎯 Apenas por Tipo / Objetivo</option>
                <option value="campaigns">📌 Apenas Métrica de Campanhas</option>
                {templatesData && templatesData.filter(t => !t.is_system).length > 0 && (
                  <optgroup label="Templates Customizados">
                    {templatesData.filter(t => !t.is_system).map(t => (
                      <option key={t.id} value={t.id}>Modelo: {t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            {reportMode === "ecommerce_sales" && (
              <div className="p-4 rounded-xl border border-primary/30 bg-primary/[0.04] space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-white flex items-center gap-1.5">
                    🛒 Fechamento do Site / Cardápio
                  </span>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-emerald-400 ml-1">Faturamento Líquido (R$)</label>
                  <input 
                    value={salesRevenue} 
                    onChange={(e) => setSalesRevenue(e.target.value)}
                    placeholder="Ex: 25.538,08"
                    className="w-full rounded-lg border border-emerald-500/30 bg-emerald-950/20 px-3 py-2 text-xs font-mono font-bold text-emerald-300 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase tracking-widest text-primary ml-1">Pedidos Finalizados no Site / Cardápio</label>
                  <input 
                    value={salesOrders} 
                    onChange={(e) => setSalesOrders(e.target.value)}
                    placeholder="Ex: 244"
                    className="w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-mono font-bold text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between ml-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">WhatsApp de Envio</label>
                <Link to="/config" className="text-[9px] text-primary hover:underline">Configurações</Link>
              </div>
              <input 
                value={targetWhatsapp} 
                onChange={(e) => setTargetWhatsapp(e.target.value)}
                placeholder="Ex: 5521999999999"
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2.5">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || campaignList.length === 0}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-xs font-black uppercase tracking-widest text-background hover:shadow-glow transition hover:scale-[1.01] active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
            >
              {isGenerating ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Salvando...</>
              ) : (
                <><FileCheck className="h-4.5 w-4.5" /> SALVAR</>
              )}
            </button>
            <button
              onClick={() => setIsSavedReportsModalOpen(true)}
              className="flex items-center gap-2 rounded-xl border border-white/10 hover:border-secondary/40 bg-white/5 px-4 py-3.5 text-xs font-black uppercase tracking-widest text-white hover:text-secondary transition hover:scale-[1.01] active:scale-95"
              title="Ver Histórico de Relatórios"
            >
              <FileText className="h-4.5 w-4.5" /> SALVOS
            </button>
          </div>
        </div>

        {/* Painel Direito: Lista de Campanhas e Mapeamento de Objetivos */}
        <div className="glass-panel card-sport p-6 space-y-4 lg:col-span-2 border-white/10 bg-white/5 flex flex-col min-h-[460px]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/50 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">2</span>
              <div>
                <h3 className="header-sport text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2 flex-wrap">
                  {reportLevel === "campaign" ? "Selecione e Classifique as Campanhas" : reportLevel === "adset" ? "Selecione e Classifique os Conjuntos" : "Selecione e Classifique os Anúncios"}
                  {campaignList.length > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground font-mono">
                      {campaignList.filter(c => c.selected).length}/{campaignList.length}
                    </span>
                  )}
                  {campaignList.some(c => c.selected) && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-primary font-mono">
                      {getCampaignSelectionGroupLabel(
                        campaignList.filter(c => c.selected).map(c => ({
                          id: c.id,
                          name: c.name,
                          rawObjective: c.rawObjective,
                          optimizationGoal: c.optimizationGoal,
                          resultType: c.resultType,
                          resultsIndicator: c.resultIndicator,
                          cost: c.cost,
                          conversions: c.conversions,
                          clicks: c.inlineLinkClicks ?? c.clicks,
                          impressions: c.impressions,
                          reach: c.reach,
                        }))
                      )}
                    </span>
                  )}
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Marque as campanhas, edite o nome diretamente para o relatório e confira os objetivos detectados automaticamente.
                </p>
              </div>
            </div>

            {campaignList.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <button 
                  onClick={() => handleToggleSelectAll(true)}
                  className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase text-white hover:bg-white/10 transition"
                >
                  Marcar Todas
                </button>
                <button 
                  onClick={() => setCampaignList(prev => prev.map(c => ({ ...c, selected: c.cost > 0 })))}
                  className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase text-white hover:bg-white/10 transition"
                  title="Selecionar apenas campanhas com gasto acima de zero"
                >
                  Com Gasto
                </button>
                <button 
                  onClick={() => handleToggleSelectAll(false)}
                  className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase text-muted-foreground hover:bg-white/10 transition"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {/* Barra de Pesquisa e Filtro de Campanhas */}
          {campaignList.length > 0 && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                placeholder="Pesquisar por nome de campanha, objetivo ou conjunto..."
                className="w-full rounded-xl border border-white/10 bg-background/50 pl-9 pr-8 py-2 text-xs text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
              {campaignSearch && (
                <button 
                  onClick={() => setCampaignSearch("")} 
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )}

          {isLoadingData && campaignList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-black text-white">Atualizando dados...</p>
              <p className="text-[10px] text-muted-foreground mt-1 max-w-[260px]">Carregando snapshot oficial da conta e período selecionados.</p>
            </div>
          ) : campaignList.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="rounded-full bg-white/5 p-4 mb-4">
                <AlertCircle className="h-10 w-10 text-muted-foreground/40" />
              </div>
              {source === "upload" ? (
                <>
                  <p className="text-sm font-black text-white">Pronto para extrair um Print!</p>
                  <p className="text-[10px] text-muted-foreground mt-2 max-w-[250px] leading-relaxed">Nenhuma campanha na memória. Vá até a aba de Upload e faça a leitura de uma imagem do Meta Ads ou Google Ads para continuarmos.</p>
                  <Link to="/upload" className="mt-5 flex items-center gap-2 rounded-xl bg-primary/10 border border-primary/20 px-4 py-2.5 text-xs font-black uppercase text-primary tracking-widest hover:bg-primary/20 transition">
                    Ir para Upload
                  </Link>
                </>
              ) : (
                <>
                  <p className="text-sm font-black text-white">Nenhum dado retornado no período</p>
                  <p className="text-[10px] text-muted-foreground mt-2 max-w-[250px] leading-relaxed">Não encontramos dados na conta conectada para a granularidade escolhida dentro desse período. Verifique o Passo 1.</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[580px] min-h-[380px] pr-1 space-y-2 scrollbar-thin">
              {filteredCampaignList.slice(0, visibleCount).map((c) => (
                <div 
                  key={c.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition ${c.selected ? 'bg-primary/[0.02] border-primary/20 hover:border-primary/45' : 'bg-background/40 border-white/5 hover:border-white/10'}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button 
                      onClick={() => handleToggleSelect(c.id)}
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition shrink-0 ${c.selected ? 'bg-primary border-primary text-background' : 'border-white/10 hover:border-primary/50'}`}
                      title={c.selected ? "Desmarcar do relatório" : "Marcar para entrar no relatório"}
                    >
                      {c.selected && <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={c.name}
                          onChange={(e) => handleUpdateCampaignName(c.id, e.target.value)}
                          className="text-xs font-bold text-white bg-transparent hover:bg-white/5 focus:bg-background/90 border border-transparent hover:border-white/10 focus:border-primary/50 rounded-lg px-2 py-1 transition-all flex-1 min-w-0 focus:outline-none"
                          title="Clique para editar o nome da campanha no relatório"
                          placeholder="Nome da campanha..."
                        />
                        <span className={`shrink-0 inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${c.platform === 'meta' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary/20 text-secondary border border-secondary/30'}`}>
                          {c.platform === 'meta' ? 'Meta' : 'Google'}
                        </span>
                      </div>
                      {c.campaignName && (
                        <p className="text-[9px] text-muted-foreground/80 font-medium mt-0.5 px-2">
                          {c.adSetName ? `Conjunto: ${c.adSetName} • ` : ""}Campanha: {c.campaignName}
                        </p>
                      )}
                      {(() => {
                        const selectorDisplay = getCampaignSelectorResultDisplay({
                          id: c.id,
                          name: c.name,
                          rawObjective: c.rawObjective,
                          optimizationGoal: c.optimizationGoal,
                          resultType: c.resultType,
                          resultsIndicator: c.resultIndicator,
                          cost: c.cost,
                          conversions: c.conversions,
                          clicks: c.inlineLinkClicks ?? c.clicks,
                          inlineLinkClicks: c.inlineLinkClicks ?? c.clicks,
                          allClicks: c.allClicks ?? c.clicks,
                          impressions: c.impressions,
                          reach: c.reach,
                        });
                        return (
                          <p className="text-[10px] text-muted-foreground font-mono mt-0.5 px-2" data-testid={`selector-summary-${c.id}`}>
                            {selectorDisplay.summaryText}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 w-full sm:w-auto shrink-0">
                    <label className="text-[9px] text-muted-foreground uppercase font-black px-1 hidden sm:block">Objetivo / Métrica</label>
                    <select
                      value={c.objective}
                      onChange={(e) => handleUpdateObjective(c.id, e.target.value)}
                      className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-[10px] font-bold text-white focus:outline-none focus:border-primary/50 transition-colors w-full sm:w-48"
                    >
                      <optgroup label="🚗 Veículos / Leads">
                        <option value="🚗 Mensagens nos veículos">🚗 Mensagens nos veículos</option>
                        <option value="🚗 Consignado">🚗 Campanha de Consignado</option>
                        <option value="💬 Mensagens">💬 Mensagens / WhatsApp</option>
                        <option value="📧 Cadastros / Leads">📧 Cadastros / Leads</option>
                      </optgroup>
                      <optgroup label="📱 Perfil / Tráfego">
                        <option value="📱 Visitas ao Perfil">📱 Visitas ao Perfil (Instagram)</option>
                        <option value="👆 Cliques no Link">👆 Cliques no Link</option>
                        <option value="🌐 Visualizações na Página">🌐 Visualizações na Página</option>
                      </optgroup>
                      <optgroup label="🛒 Vendas / Cardápio">
                        <option value="💳 Conversões / Compras">💳 Conversões / Compras</option>
                      </optgroup>
                      <optgroup label="👁️ Alcance / Topo">
                        <option value="👁️ Alcance e Impressões">👁️ Alcance e Impressões</option>
                        <option value="▶️ Thru-Play">▶️ Thru-Play (Vídeo)</option>
                        <option value="🔥 Engajamento">🔥 Engajamento</option>
                        <option value="🎯 Outros">🎯 Outros</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              ))}
              
              {/* Botão Mostrar Mais */}
              {visibleCount < filteredCampaignList.length && (
                <div className="pt-4 pb-2 flex justify-center w-full">
                  <button 
                    onClick={() => setVisibleCount(v => v + 40)}
                    className="rounded-full border border-white/10 bg-white/5 px-6 py-2 text-xs font-bold text-foreground hover:bg-white/10 hover:border-white/20 transition-all flex items-center gap-2"
                  >
                    Mostrar Mais ({filteredCampaignList.length - visibleCount} ocultos)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ÁREA DO RELATÓRIO PRONTINHO */}
      <AnimatePresence>
        {generatedText && (
          <motion.div 
            initial={{ opacity: 0, y: 30 }} 
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            
            {/* Visualizador da Mensagem Pronta de WhatsApp */}
            <div className="glass-panel p-6 space-y-4 border-primary/20 bg-primary/[0.01] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20 text-success text-[10px] font-black">3</span>
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-1.5"><Smartphone className="h-4 w-4" /> Relatório Pronto</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Texto WhatsApp • {activeReportSnapshot ? `Snapshot ${activeReportSnapshot.snapshotId}` : "Meta Ads"}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isTextManuallyEdited && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsTextManuallyEdited(false);
                          setRegenerateNonce((n) => n + 1);
                          toast.info("Texto regenerado a partir do snapshot oficial.");
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-warning/15 border border-warning/30 text-warning px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-warning/25 transition"
                        title="Descartar edição manual e restaurar texto do snapshot"
                      >
                        Regenerar do Snapshot
                      </button>
                    )}
                    <button 
                      onClick={handleCopyToClipboard}
                      className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition"
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                    <button 
                      onClick={() => {
                        if (!generatedText) {
                          toast.warning("Gere o relatório antes de enviar!");
                          return;
                        }
                        setIsWhatsAppModalOpen(true);
                      }}
                      className="flex items-center gap-1.5 rounded-lg bg-[#25D366] text-black font-black px-3.5 py-1.5 text-[10px] uppercase tracking-widest hover:shadow-glow transition hover:scale-105 active:scale-95"
                      title="Abrir opções de envio para WhatsApp (Número, Grupo ou Seletor)"
                    >
                      <Send className="h-3.5 w-3.5 fill-current" /> Enviar WhatsApp
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  {isTextManuallyEdited && (
                    <p className="text-[10px] text-warning font-bold mb-1.5">
                      Edição manual ativa — alterações automáticas bloqueadas até clicar em “Regenerar do Snapshot”.
                    </p>
                  )}
                  <textarea
                    value={generatedText}
                    onChange={(e) => {
                      setIsTextManuallyEdited(true);
                      setGeneratedText(e.target.value);
                    }}
                    rows={18}
                    className="w-full rounded-xl border border-border bg-background/80 p-4 text-xs font-mono text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-primary/50 resize-none whitespace-pre leading-relaxed leading-[1.6]"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 border border-border p-3 flex items-start gap-2.5 mt-4">
                <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-foreground">Dica da Victoria 🧠</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    Você pode alterar livremente o texto acima caso queira fazer observações manuais ou anotações específicas antes de clicar em Enviar.
                  </p>
                </div>
              </div>
            </div>

            {/* Documento Estilizado (PDF/Impressão) */}
            <div className="glass-panel p-8 sm:p-10 bg-background border-white/10 print:shadow-none print:border-none print:p-0 print:bg-white print:text-black flex flex-col justify-between min-h-[500px]">
              <div>
                <div className="border-b border-white/10 print:border-black/10 pb-6 mb-6 flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <img src="/assets/nc-logo.png" alt="NC Performance" className="h-8 w-auto object-contain print:brightness-90" />
                    <div>
                      <h2 className="header-sport text-2xl font-black tracking-tighter uppercase text-white print:text-black">
                        Relatório de Performance
                      </h2>
                      <p className="text-primary font-mono text-[10px] mt-0.5 print:text-red-700 uppercase tracking-widest font-black">
                        NC Performance Suite • {source === "upload" ? "Print OCR" : "Meta Ads Integrado"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Data de Geração</p>
                    <p className="text-xs font-mono font-bold text-white print:text-black">{format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-6 border-b border-white/5 print:border-black/10 pb-6">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Cliente Anunciante</p>
                    <p className="text-lg font-black mt-0.5 text-white print:text-black">
                      {clientName || accounts.find(a => a.id === selectedAccountId)?.name || "Cliente Anunciante"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Janela de Referência</p>
                    <p className="text-lg font-black mt-0.5 text-white print:text-black">
                      {source === "upload" ? (periodText || "Período OCR") : formatPeriodLabel(globalDateFrom, globalDateTo).label}
                    </p>
                  </div>
                </div>

                {/* Métricas Consolidadas Visualmente Ricas (Snapshot único conciliado) */}
                {(() => {
                  const selectedCamps = campaignList.filter(c => c.selected);
                  const totalCost = selectedCamps.reduce((sum, c) => sum + c.cost, 0);
                  const allAccSelected =
                    selectedAccountId !== "all" &&
                    reportLevel === "campaign" &&
                    selectedCamps.length > 0 &&
                    selectedCamps.length === campaignList.length &&
                    Boolean(accountPeriodReach && accountPeriodReach > 0);
                  const totalReach = allAccSelected && accountPeriodReach ? accountPeriodReach : selectedCamps.reduce((sum, c) => sum + c.reach, 0);
                  const totalImpressions = selectedCamps.reduce((sum, c) => sum + c.impressions, 0);
                  const totalLinkClicks = selectedCamps.reduce((sum, c) => sum + Number(c.inlineLinkClicks ?? c.clicks ?? 0), 0);
                  const totalAllClicks = selectedCamps.reduce((sum, c) => sum + Number(c.allClicks ?? c.clicks ?? 0), 0);

                  const classifiedList = selectedCamps.map(c => ({
                    raw: c,
                    cls: classifyMetaEvent({
                      campaignName: c.name,
                      rawObjective: c.rawObjective,
                      optimizationGoal: c.optimizationGoal,
                      resultType: c.resultType || c.objective,
                      resultsIndicator: c.resultIndicator,
                      isVehicleContext,
                    }),
                  }));
                  const convCamps = classifiedList.filter(x => x.cls.isConversionGoal).map(x => x.raw);
                  const audienceCamps = classifiedList.filter(x => !x.cls.isConversionGoal);

                  const totalConv = convCamps.reduce((sum, c) => sum + Number(c.conversions || 0), 0);
                  const costConv = convCamps.reduce((sum, c) => sum + c.cost, 0);
                  const costAudience = audienceCamps.reduce((sum, x) => sum + x.raw.cost, 0);
                  const cpaConv = totalConv > 0 ? costConv / totalConv : null;
                  const nonConvSummary = formatMetricVectorSummary(
                    activeReportSnapshot?.summary?.metricVector || {
                      conversations: 0, leads: 0, websiteContacts: 0, purchases: 0, checkout: 0, addToCart: 0,
                      profileVisits: 0, pageVisits: 0, landingPageViews: 0, linkClicks: 0, reach: 0, videoViews: 0, engagements: 0, unknownResults: 0,
                    }
                  ).filter((e) => !["conversations", "leads", "websiteContacts", "purchases", "checkout", "addToCart"].includes(e.key as string));
                  const hasMultipleObjectives = convCamps.length > 0 && audienceCamps.length > 0;
                  const ctrLink = totalImpressions > 0 ? (totalLinkClicks / totalImpressions) * 100 : 0;

                  return (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-300">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60">Investido</p>
                          <p className="text-lg font-mono font-black mt-1 text-primary print:text-red-700">
                            {fmtBRLWithSymbol(totalCost)}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 print:text-black/50 mt-1">
                            {selectedCamps.length} camp. selecionadas
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-300">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60">
                            {convCamps.length > 0 ? "Conversas / Conversões" : (nonConvSummary[0]?.label || "Resultados por tipo")}
                          </p>
                          <p className="text-lg font-mono font-black mt-1 text-white print:text-black">
                            {convCamps.length > 0
                              ? totalConv.toLocaleString('pt-BR')
                              : (nonConvSummary[0] ? nonConvSummary[0].value.toLocaleString('pt-BR') : "0")}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 print:text-black/50 mt-1">
                            {convCamps.length > 0
                              ? (cpaConv !== null ? `CPA: ${fmtBRLWithSymbol(cpaConv)}` : "CPA não calculável (0 conv.)")
                              : (nonConvSummary.length > 1
                                ? nonConvSummary.slice(1).map((e) => `${e.value.toLocaleString('pt-BR')} ${e.label}`).join(" · ")
                                : (nonConvSummary[0]?.key === "reach" ? "Pessoas alcançadas" : "Sem mistura de cliques"))}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-300">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60">Cliques no Link</p>
                          <p className="text-lg font-mono font-black mt-1 text-indigo-300 print:text-black">
                            {totalLinkClicks.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 print:text-black/50 mt-1">
                            CTR: {ctrLink.toFixed(2)}%{totalAllClicks > totalLinkClicks ? ` · Todos: ${totalAllClicks.toLocaleString('pt-BR')}` : ""}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-300">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60">
                            {allAccSelected ? "Alcance (Conta)" : selectedCamps.length > 1 ? "Alcance (soma)" : "Alcance"}
                          </p>
                          <p className="text-lg font-mono font-black mt-1 text-white print:text-black">
                            {totalReach > 0 ? totalReach.toLocaleString('pt-BR') : "—"}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 print:text-black/50 mt-1">
                            {allAccSelected ? "Deduplicado (Meta Ads)" : selectedCamps.length > 1 ? "Soma por campanha (não deduplicado)" : "Pessoas impactadas"}
                          </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-300">
                          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60">Impressões</p>
                          <p className="text-lg font-mono font-black mt-1 text-white print:text-black">
                            {totalImpressions.toLocaleString('pt-BR')}
                          </p>
                          <p className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground/80 print:text-black/50 mt-1">
                            Freq: {totalReach > 0 ? (totalImpressions / totalReach).toFixed(1) : "—"}x
                          </p>
                        </div>
                      </div>

                      {/* Diferenciação Didática quando há Objetivos Mistos (Conversão + Audiência/Alcance/Perfil) */}
                      {hasMultipleObjectives && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 p-4 rounded-2xl bg-white/[0.03] border border-white/10 print:bg-gray-50 print:border-gray-200">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 print:text-emerald-700">
                                Frente 1: Conversas &amp; Conversões
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground print:text-gray-700 leading-relaxed">
                              Investido: <strong className="text-foreground print:text-black font-mono">R$ {costConv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> •{" "}
                              Gerou <strong className="text-foreground print:text-black font-mono">{totalConv.toLocaleString('pt-BR')} conversões</strong>{" "}
                              {cpaConv !== null ? <>a <strong className="text-foreground print:text-black font-mono">R$ {cpaConv.toFixed(2)}/conv.</strong></> : "(CPA não calculável)"}.
                            </p>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-blue-400" />
                              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 print:text-blue-700">
                                Frente 2: Outros Objetivos ({nonConvSummary.map((e) => e.label).join(" • ") || "Alcance / Audiência"})
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground print:text-gray-700 leading-relaxed">
                              Investido: <strong className="text-foreground print:text-black font-mono">R$ {costAudience.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong> •{" "}
                              {nonConvSummary.length > 0 ? (
                                nonConvSummary.map((e) => (
                                  <span key={e.key} className="mr-2">
                                    <strong className="text-foreground print:text-black font-mono">{e.value.toLocaleString('pt-BR')}</strong> {e.label.toLowerCase()}
                                  </span>
                                ))
                              ) : (
                                <>Somou <strong className="text-foreground print:text-black font-mono">{audienceCamps.reduce((s, x) => s + x.raw.reach, 0).toLocaleString('pt-BR')} alcance</strong></>
                              )}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Detalhamento Executivo de Campanhas */}
                      <div className="space-y-2 mt-6">
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/60 mb-3 border-b border-white/10 pb-1.5 flex items-center justify-between">
                          <span>Detalhamento das Campanhas Compiladas ({selectedCamps.length})</span>
                          <span className="font-mono text-[9px]">Snapshot: {activeReportSnapshot?.snapshotId || "N/A"}</span>
                        </p>
                        {classifiedList.map(({ raw: c, cls }, idx) => {
                          const isMsg = cls.isConversionGoal;
                          const isReach = cls.category === "REACH";
                          const linkClk = Number(c.inlineLinkClicks ?? c.clicks ?? 0);
                          const resultCount = cls.category === "LINK_CLICKS" ? linkClk : isReach ? (c.reach > 0 ? c.reach : c.conversions) : c.conversions;
                          const resultUnit = cls.unitPlural;
                          const cpa = resultCount > 0 ? (isReach ? (c.cost / resultCount) * 1000 : c.cost / resultCount) : null;

                          return (
                            <div key={idx} className="flex items-center justify-between py-2 border-b border-white/5 print:border-gray-200 text-xs">
                              <div className="min-w-0 pr-4">
                                <p className="font-bold text-white print:text-black truncate text-xs sm:text-sm">{c.name}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${
                                    isMsg ? "bg-emerald-500/10 text-emerald-400 print:bg-emerald-100 print:text-emerald-800" : "bg-blue-500/10 text-blue-400 print:bg-blue-100 print:text-blue-800"
                                  }`}>
                                    {c.objective || "Meta Ads"}
                                  </span>
                                  <span className="text-[9px] font-mono text-muted-foreground print:text-gray-600">
                                    {c.reach.toLocaleString('pt-BR')} alcance • {c.impressions.toLocaleString('pt-BR')} impr.
                                  </span>
                                </div>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="font-mono font-black text-white print:text-black text-xs sm:text-sm">
                                  R$ {c.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </p>
                                <p className="text-[10px] font-mono text-muted-foreground print:text-gray-700">
                                  {resultCount > 0 ? (
                                    <span className="text-emerald-400 print:text-emerald-700 font-bold">
                                      {resultCount.toLocaleString('pt-BR')} {resultUnit} {cpa !== null && cpa > 0 ? `(R$ ${cpa.toFixed(2)})` : ""}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/60">—</span>
                                  )}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 print:border-black/10 text-center flex items-center justify-between">
                <span className="text-[9px] font-mono text-muted-foreground print:text-black/50">Automação de Relatórios NC Performance Suite</span>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-white hover:bg-white/10 transition print:hidden"
                >
                  <Printer className="h-3.5 w-3.5" /> IMPRIMIR PDF
                </button>
              </div>

            </div>

          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE RELATÓRIOS SALVOS */}
      <AnimatePresence>
        {isSavedReportsModalOpen && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm print:hidden">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border bg-muted/20 p-6">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Relatórios Salvos
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Selecione um relatório para abrir e reeditar.</p>
                </div>
                <button
                  onClick={() => setIsSavedReportsModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  ✕
                </button>
              </div>

              {/* Abas OCR vs API */}
              <div className="flex gap-1 border-b border-border bg-background px-6 pt-4 pb-0">
                <button
                  onClick={() => { setSavedTab("upload"); setReportSearchTerm(""); setReportSearchPeriod(""); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-t-lg border-b-2 transition-all ${savedTab === "upload" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Extração OCR
                  <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{savedReports.filter(r => r.source === "upload").length}</span>
                </button>
                <button
                  onClick={() => { setSavedTab("api"); setReportSearchTerm(""); setReportSearchPeriod(""); }}
                  className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-t-lg border-b-2 transition-all ${savedTab === "api" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
                >
                  <Globe className="h-3.5 w-3.5" />
                  Contas Conectadas
                  <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[9px]">{savedReports.filter(r => r.source === "api").length}</span>
                </button>
              </div>

              {/* Filtros */}
              <div className="flex flex-col sm:flex-row gap-3 border-b border-border bg-background px-6 py-3">
                <input
                  type="text"
                  placeholder="Filtrar por cliente..."
                  value={reportSearchTerm}
                  onChange={(e) => setReportSearchTerm(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Filtrar por período (ex: JUNHO)..."
                  value={reportSearchPeriod}
                  onChange={(e) => setReportSearchPeriod(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Lista */}
              <div className="flex-1 overflow-y-auto p-6">
                {(() => {
                  const filtered = savedReports.filter(r =>
                    r.source === savedTab &&
                    r.clientName.toLowerCase().includes(reportSearchTerm.toLowerCase()) &&
                    r.periodText.toLowerCase().includes(reportSearchPeriod.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-muted-foreground/60">
                        <p className="text-sm font-bold">Nenhum relatório {savedTab === "upload" ? "de print OCR" : "de conta conectada"} encontrado.</p>
                        <p className="text-[10px] mt-1">Gere um relatório e ele será salvo automaticamente aqui.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filtered.map((report) => (
                        <div
                          key={report.id}
                          onClick={() => { handleLoadReport(report); setIsSavedReportsModalOpen(false); }}
                          className={`group flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50 ${activeReportId === report.id ? "bg-primary/[0.05] border-primary/30" : "bg-card border-border"}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {savedTab === "upload" ? (
                                  <Sparkles className="h-3.5 w-3.5 text-violet-400 shrink-0" />
                                ) : (
                                  <Globe className="h-3.5 w-3.5 text-primary shrink-0" />
                                )}
                                <h4 className="text-sm font-black text-foreground uppercase truncate">
                                  {report.clientName || "Sem cliente"}
                                </h4>
                              </div>
                              <p className="text-[10px] text-muted-foreground font-mono">
                                {report.periodText} • {
                                  report.reportMode === 'standard_auto'
                                    ? 'Padrão (Veículos)'
                                    : report.reportMode === 'ecommerce_sales'
                                    ? 'Vendas / Site'
                                    : report.reportMode === 'complete'
                                    ? 'Completo'
                                    : report.reportMode === 'objective'
                                    ? 'Por Objetivo'
                                    : report.reportMode === 'campaigns'
                                    ? 'Por Campanhas'
                                    : (templatesData?.find(t => t.id === report.reportMode)?.name || 'Template Personalizado')
                                }
                              </p>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                {report.campaigns.filter(c => c.selected).length} campanha(s) selecionada(s)
                              </p>
                            </div>
                            <button
                              onClick={(e) => handleDeleteReport(report.id, e)}
                              className="h-8 w-8 shrink-0 rounded-lg bg-muted/50 hover:bg-red-500/20 hover:text-red-400 border border-border flex items-center justify-center transition"
                              title="Excluir"
                            >
                              <AlertCircle className="h-4 w-4" />
                            </button>
                          </div>

                          <div className="flex items-center justify-between border-t border-border mt-3 pt-3 text-[10px] text-muted-foreground font-mono">
                            <span>{new Date(report.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-primary group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold uppercase tracking-wider text-[9px]">
                              Abrir &rarr;
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <TemplateModal 
        isOpen={isTemplateModalOpen} 
        onClose={() => setIsTemplateModalOpen(false)} 
        onSuccess={() => refetchTemplates()} 
        templates={templatesData || []}
        activeReportMode={reportMode}
        onSelectReportMode={(modeId) => setReportMode(modeId)}
        liveCampaigns={campaignList}
        liveClientName={clientName && clientName !== "Consolidado" ? clientName : (accounts.find(a => a.id === selectedAccountId)?.name || clientName || "")}
        livePeriodText={source === "upload" ? periodText : `${format(dateRange.startDate, "dd/MM/yyyy")} a ${format(dateRange.endDate, "dd/MM/yyyy")}`}
        liveReportLevel={reportLevel}
        liveIsVehicleContext={isVehicleContext}
        liveSalesRevenue={salesRevenue}
        liveSalesOrders={salesOrders}
      />

      <WhatsAppSendModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        reportText={generatedText}
        storeName={clientName && clientName !== "Consolidado" ? clientName : (accounts.find(a => a.id === selectedAccountId)?.name || clientName || "")}
      />

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .glass-panel { background: white !important; box-shadow: none !important; }
          .text-gradient { background: none !important; -webkit-text-fill-color: black !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
