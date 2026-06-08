import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, Download, Printer, ArrowLeft, Target, 
  Calendar, CheckCircle2, Loader2, Globe, Brain,
  TrendingUp, Users, PieChart, Send, Copy, Settings,
  Eye, FileCheck, RefreshCw, Smartphone, Sparkles,
  Award, MessageSquare, AlertCircle, Plus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";
import { z } from "zod";
import { DateRangePicker } from "@/components/DateRangePicker";
import { TemplateModal } from "@/components/TemplateModal";

const searchSchema = z.object({
  from: z.string().optional(),
});

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Gerador de Relatórios — NC Suite" }] }),
  validateSearch: (search) => searchSchema.parse(search),
  component: RelatoriosPage,
});

interface CampaignData {
  id: string;
  name: string;
  cost: number;
  impressions: number;
  clicks: number;
  conversions: number;
  reach: number;
  objective: string;
  platform: "meta" | "google";
  selected: boolean;
}

interface SavedReport {
  id: string;
  createdAt: string;
  clientName: string;
  periodText: string;
  reportMode: "complete" | "objective" | "campaigns";
  source: "api" | "upload";
  campaigns: CampaignData[];
  generatedText: string;
}

function RelatoriosPage() {
  const search = useSearch({ from: "/_app/relatorios" });
  
  // Parâmetros do Relatório
  const [source, setSource] = useState<"api" | "upload">(search.from === "upload" ? "upload" : "api");
  const [clientName, setClientName] = useState("Pizza Bonne");
  const [periodText, setPeriodText] = useState("");
  const [reportMode, setReportMode] = useState<"complete" | "objective" | "campaigns">("complete");
  
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });
  const [targetWhatsapp, setTargetWhatsapp] = useState("");

  const handleDateChange = (start: Date, end: Date) => {
    setDateRange({ startDate: start, endDate: end });
    const months = ["JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];
    const selectedMonth = months[start.getMonth()];
    const selectedYear = start.getFullYear();
    setPeriodText(`${selectedMonth} ${selectedYear}`);
  };
  
  const [campaignList, setCampaignList] = useState<CampaignData[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [previewOpen, setPreviewOpen] = useState(true);
  const [copied, setCopied] = useState(false);

  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);

  const [isSavedReportsModalOpen, setIsSavedReportsModalOpen] = useState(false);
  const [reportSearchTerm, setReportSearchTerm] = useState("");
  const [reportSearchPeriod, setReportSearchPeriod] = useState("");

  // Controle de Templates
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [activePdfLayout, setActivePdfLayout] = useState("classic");

  const { data: templatesData, refetch: refetchTemplates } = useQuery<any[]>({
    queryKey: ["report-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("report_templates").select("*").order("created_at", { ascending: false });
      return (data as any[]) ?? [];
    },
  });

  // Inicializa o salvamento de relatórios no localStorage
  useEffect(() => {
    const saved = localStorage.getItem("nc_saved_reports");
    if (saved) {
      try {
        setSavedReports(JSON.parse(saved));
      } catch (e) {
        console.error("Erro ao carregar relatórios salvos:", e);
      }
    }
  }, []);

  const handleSaveReport = (showToast = true) => {
    if (!generatedText) {
      toast.warning("Gere o relatório antes de salvar!");
      return;
    }

    const reportId = activeReportId || `report-${Date.now()}`;
    const newReport: SavedReport = {
      id: reportId,
      createdAt: new Date().toISOString(),
      clientName,
      periodText,
      reportMode,
      source,
      campaigns: campaignList,
      generatedText
    };

    let updatedList = [...savedReports];
    const index = updatedList.findIndex(r => r.id === reportId);
    if (index >= 0) {
      updatedList[index] = newReport;
      if (showToast) toast.success("Relatório atualizado no histórico!");
    } else {
      updatedList.unshift(newReport);
      setActiveReportId(reportId);
      if (showToast) toast.success("Relatório salvo no histórico local!");
    }

    setSavedReports(updatedList);
    localStorage.setItem("nc_saved_reports", JSON.stringify(updatedList));
  };

  const handleLoadReport = (rep: SavedReport) => {
    setSource(rep.source);
    setClientName(rep.clientName);
    setPeriodText(rep.periodText);
    setReportMode(rep.reportMode);
    setCampaignList(rep.campaigns);
    setGeneratedText(rep.generatedText);
    setActiveReportId(rep.id);
    toast.success(`Relatório de ${rep.clientName} carregado com sucesso!`);
  };

  const handleDeleteReport = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = savedReports.filter(r => r.id !== id);
    setSavedReports(filtered);
    localStorage.setItem("nc_saved_reports", JSON.stringify(filtered));
    if (activeReportId === id) {
      setActiveReportId(null);
    }
    toast.success("Relatório removido do histórico!");
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

  // Auto-preencher Nome do Cliente ao selecionar conta
  useEffect(() => {
    if (selectedAccountId !== "all" && clientsData) {
      const client = clientsData.find(c => c.meta_ad_account_id === selectedAccountId);
      if (client && client.name) {
        setClientName(client.name);
      }
    }
  }, [selectedAccountId, clientsData]);

  // Carregar dados de acordo com a origem (API ou Upload)
  const loadData = async () => {
    if (source === "upload") {
      try {
        const stored = localStorage.getItem("nc_extracted_campaigns");
        const storedPlat = (localStorage.getItem("nc_extracted_platform") ?? "meta") as "meta" | "google";
        if (stored) {
          const parsed = JSON.parse(stored);
          const mapped: CampaignData[] = parsed.map((c: any, index: number) => {
            const rawObj = detectObjective(c.name);
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
          setCampaignList(mapped);
          
          // Tentar inferir o nome do cliente a partir do primeiro print se houver
          if (mapped.length > 0) {
            setClientName(storedPlat === "meta" ? "LumaCar" : "Pizza Bonne");
          }
        } else {
          setCampaignList([]);
        }
      } catch (e) {
        console.error("Erro ao carregar campanhas do print:", e);
      }
    } else {
      // Buscar dados do Meta Ads / Google Ads integrado local
      try {
        const getLocalDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          return `${y}-${m}-${day}`;
        };

        const startLimit = getLocalDateStr(dateRange.startDate);
        const endLimit = getLocalDateStr(dateRange.endDate);
        
        let metricsQuery = (supabase as any).from("metrics").select(`
          campaign_id, cost, conversions, impressions, clicks, reach,
          campaigns!inner(id, name, ad_account_id)
        `)
        .gte("date", startLimit)
        .lte("date", endLimit);

        if (selectedAccountId !== "all") {
          metricsQuery = metricsQuery.eq("campaigns.ad_account_id", selectedAccountId);
        }

        const { data: dbMetrics, error: mErr } = await metricsQuery;
        if (mErr) {
          console.error("Supabase Query Error:", mErr);
          throw mErr;
        }

        if (!dbMetrics || dbMetrics.length === 0) {
          setCampaignList([]);
          return;
        }

        // Agrupar métricas por campanha e identificar plataforma correta
        const metricsMap = new Map<string, { id: string, name: string, platform: string, cost: number; impressions: number; clicks: number; conversions: number; reach: number }>();
        
        dbMetrics.forEach((m: any) => {
          const campId = m.campaign_id;
          const adAccountId = m.campaigns?.ad_account_id;
          const matchedAccount = accounts.find(a => a.id === adAccountId);
          const platformStr = matchedAccount?.platform === "Google Ads" ? "google" : "meta";
          
          const cur = metricsMap.get(campId) || { 
             id: campId, 
             name: m.campaigns?.name || "Sem Nome", 
             platform: platformStr,
             cost: 0, impressions: 0, clicks: 0, conversions: 0, reach: 0 
          };
          
          cur.cost += Number(m.cost || 0);
          cur.impressions += Number(m.impressions || 0);
          cur.clicks += Number(m.clicks || 0);
          cur.conversions += Number(m.conversions || 0);
          cur.reach += Number(m.reach || 0);
          metricsMap.set(campId, cur);
        });

        const mapped: CampaignData[] = Array.from(metricsMap.values()).map(c => ({
          id: c.id,
          name: c.name,
          cost: c.cost,
          impressions: c.impressions,
          clicks: c.clicks,
          conversions: c.conversions,
          reach: c.reach,
          objective: detectObjective(c.name),
          platform: c.platform as "meta" | "google",
          selected: c.cost > 0 // Seleciona apenas as que tiveram investimento no período
        })).filter(c => c.cost > 0 || c.impressions >= 1 || c.reach >= 1);

        // Ordena por maior custo
        mapped.sort((a, b) => b.cost - a.cost);

        setCampaignList(mapped);
      } catch (err) {
        console.error("Erro ao puxar dados da API local:", err);
        toast.error("Falha ao puxar métricas das contas conectadas.");
      }
    }
  };

  useEffect(() => {
    loadData();
  }, [source, selectedAccountId, dateRange]);

  // Função Heurística Inteligente para Detecção de Objetivos
  const detectObjective = (campName: string): string => {
    const name = campName.toLowerCase();
    if (name.includes("atendimento") || name.includes("mensagem") || name.includes("whatsapp") || name.includes("msg") || name.includes("conversa")) {
      return "💬 Mensagens";
    }
    if (name.includes("clique") || name.includes("click") || name.includes("link") || name.includes("trafego") || name.includes("site") || name.includes("cardapio") || name.includes("visita")) {
      return "👆 Cliques";
    }
    if (name.includes("compra") || name.includes("conversao") || name.includes("venda") || name.includes("pedido") || name.includes("checkout") || name.includes("leads") || name.includes("concluido")) {
      return "🎯 Compras/pedido concluido";
    }
    if (name.includes("alcance") || name.includes("reconhecimento") || name.includes("reach") || name.includes("brand")) {
      return "👁️ Alcance";
    }
    return "🎯 Conversões";
  };

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

    // 1. Agrupar Resultados por Tipo/Objetivo e Plataforma
    const groupedTypes = new Map<string, { cost: number; results: number; reach: number; impressions: number }>();
    const platforms = new Set<string>();

    selected.forEach(c => {
      // Registrar plataforma
      platforms.add(c.platform === 'google' ? 'Google Ads' : 'Meta Ads');

      // Calcular resultado base
      const isClickBased = c.objective.includes("Cliques");
      const isReachBased = c.objective.includes("Alcance") || c.objective.includes("Visualizações") || c.objective.includes("Engajamento");
      
      let resultValue = c.conversions;
      if (isClickBased) resultValue = c.clicks;
      if (isReachBased) resultValue = c.impressions; // Base de cálculo para campanhas de topo

      // Agrupamento por Objetivo
      const cur = groupedTypes.get(c.objective) || { cost: 0, results: 0, reach: 0, impressions: 0 };
      cur.cost += c.cost;
      cur.results += resultValue;
      cur.reach += c.reach;
      cur.impressions += c.impressions;
      groupedTypes.set(c.objective, cur);
    });

    const totalResults = Array.from(groupedTypes.values()).reduce((sum, g) => sum + g.results, 0);
    const totalReach = selected.reduce((sum, c) => sum + c.reach, 0);
    const totalImps = selected.reduce((sum, c) => sum + c.impressions, 0);
    const avgCpa = totalResults > 0 ? totalCost / totalResults : 0;
    const platformString = Array.from(platforms).join(" & ");
    
    // Calcula o período para o relatório
    const displayPeriod = source === "upload" 
      ? periodText 
      : `${format(dateRange.startDate, "dd/MM/yyyy")} a ${format(dateRange.endDate, "dd/MM/yyyy")}`;

    const customTemplate = templatesData?.find(t => t.id === reportMode);

    if (customTemplate) {
      setActivePdfLayout(customTemplate.pdf_layout || "classic");
      let text = customTemplate.message_template;

      // Substituições Globais
      text = text.replace(/\{\{NOME_CLIENTE\}\}/g, clientName);
      text = text.replace(/\{\{PERIODO\}\}/g, displayPeriod);
      text = text.replace(/\{\{TOTAL_CAMPANHAS\}\}/g, selected.length.toString());
      text = text.replace(/\{\{INVESTIMENTO\}\}/g, `R$ ${totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      text = text.replace(/\{\{TOTAL_RESULTADOS\}\}/g, totalResults.toLocaleString("pt-BR"));
      text = text.replace(/\{\{CPA_MEDIO\}\}/g, `R$ ${avgCpa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
      text = text.replace(/\{\{AGENCIA\}\}/g, agencyName.toUpperCase());
      
      // Nova Tag de Plataforma Suportada
      text = text.replace(/\{\{PLATAFORMAS\}\}/g, platformString);

      // Substituição de Lista de Campanhas
      if (text.includes("{{LISTA_CAMPANHAS}}")) {
        let listText = "";
        selected.forEach(c => {
          const isClick = c.objective.includes("Cliques");
          const isReach = c.objective.includes("Alcance") || c.objective.includes("Visualizações") || c.objective.includes("Engajamento");
          
          let resultValue = c.conversions;
          if (isClick) resultValue = c.clicks;
          if (isReach) resultValue = c.impressions;
          
          const costPerRes = resultValue > 0 ? (isReach ? (c.cost / resultValue) * 1000 : c.cost / resultValue) : 0;
          const costLabel = isReach ? "CPM" : "Custo/Resultado";
          const platIcon = c.platform === 'google' ? '🌐' : '🎯';
          
          listText += `${platIcon} *${c.name.toUpperCase()}*\n`;
          listText += `   💵 Investimento: R$ ${c.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          listText += `   📈 Resultados: ${resultValue.toLocaleString("pt-BR")} ${isReach ? 'impr.' : ''}\n`;
          listText += `   💲 ${costLabel}: R$ ${costPerRes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          if (c.reach > 0) listText += `   👥 Alcance: ${c.reach.toLocaleString("pt-BR")}\n`;
          listText += `\n`;
        });
        text = text.replace(/\{\{LISTA_CAMPANHAS\}\}/g, listText);
      }

      // Substituição de Resultados por Tipo
      if (text.includes("{{RESULTADOS_POR_TIPO}}")) {
        let typeText = "";
        groupedTypes.forEach((data, type) => {
          const isClick = type.includes("Cliques");
          const isReach = type.includes("Alcance") || type.includes("Visualizações") || type.includes("Engajamento");
          
          const cpl = data.results > 0 ? (isReach ? (data.cost / data.results) * 1000 : data.cost / data.results) : 0;
          
          let resultLabel = "Resultados";
          if (isClick) resultLabel = "Visitas";
          if (isReach) resultLabel = "Impressões";
          
          let costLabel = "CPL/CPA";
          if (isClick) costLabel = "Custo por Visita";
          if (isReach) costLabel = "CPM";

          typeText += `*${type}*\n`;
          typeText += `   💵 Investimento: R$ ${data.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          typeText += `   📈 ${resultLabel}: ${data.results.toLocaleString("pt-BR")}\n`;
          typeText += `   💲 ${costLabel}: R$ ${cpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        });
        text = text.replace(/\{\{RESULTADOS_POR_TIPO\}\}/g, typeText.trim());
      }

      setGeneratedText(text);
      return;
    }

    // --- Lógica para os Relatórios Padrão (Sem Template Customizado) ---
    const buildHeader = (title: string) => {
      return `📊 *${title}*\n━━━━━━━━━━━━━━━━━━━━\n🏢 *Cliente:* ${clientName}\n📅 *Período:* ${displayPeriod}\n📱 *Plataformas:* ${platformString}\n\n`;
    };

    const buildResultsByType = () => {
      let txt = `━━━━━━━━━━━━━━━━━━━━\n*RESUMO POR OBJETIVO*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      groupedTypes.forEach((data, type) => {
        const isClick = type.includes("Cliques");
        const isReach = type.includes("Alcance") || type.includes("Visualizações") || type.includes("Engajamento");
        
        const cpl = data.results > 0 ? (isReach ? (data.cost / data.results) * 1000 : data.cost / data.results) : 0;
        
        let resultLabel = "Resultados";
        if (isClick) resultLabel = "Visitas";
        if (isReach) resultLabel = "Impressões";
        
        let costLabel = "CPA";
        if (isClick) costLabel = "Custo por Visita";
        if (isReach) costLabel = "CPM";

        txt += `${type}\n`;
        txt += `   💵 Investimento: R$ ${data.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        txt += `   📈 ${resultLabel}: ${data.results.toLocaleString("pt-BR")}\n`;
        txt += `   💲 ${costLabel}: R$ ${cpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        if (data.reach > 0 && !isReach) txt += `   👥 Alcance: ${data.reach.toLocaleString("pt-BR")}\n`;
        if (!isReach) txt += `   👁️ Impressões: ${data.impressions.toLocaleString("pt-BR")}\n\n`;
        else txt += `\n`;
      });
      return txt;
    };

    const buildCampaignDetails = () => {
      let txt = `━━━━━━━━━━━━━━━━━━━━\n*DETALHAMENTO DE CAMPANHAS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      // Agrupa por plataforma para a listagem
      ['google', 'meta'].forEach(plat => {
        const platCampaigns = selected.filter(c => c.platform === plat);
        if (platCampaigns.length === 0) return;
        
        txt += `*— ${plat === 'google' ? 'GOOGLE ADS' : 'META ADS'} —*\n\n`;
        platCampaigns.forEach(c => {
          const resultValue = c.objective.includes("Cliques") ? c.clicks : c.conversions;
          const costPerRes = resultValue > 0 ? c.cost / resultValue : 0;
          const typeLabel = c.objective.substring(2).trim(); // Remove emoji
          
          txt += `📌 *${c.name.toUpperCase()}*\n`;
          txt += `   💵 Invest: R$ ${c.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
          txt += `   📈 Result: ${resultValue.toLocaleString("pt-BR")} (${typeLabel})\n`;
          txt += `   💲 Custo/Res: R$ ${costPerRes.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
        });
      });
      return txt;
    };

    let finalText = "";

    if (reportMode === "complete") {
      setActivePdfLayout("classic");
      finalText += buildHeader("RELATÓRIO DE PERFORMANCE");
      finalText += buildResultsByType();
      finalText += buildCampaignDetails();
    } else if (reportMode === "objective") {
      setActivePdfLayout("analytical");
      finalText += buildHeader("RELATÓRIO DE RESULTADOS");
      finalText += buildResultsByType();
    } else { // campaigns mode
      setActivePdfLayout("minimalist");
      finalText += buildHeader("RELATÓRIO DE CAMPANHAS");
      finalText += `🎯 *CPA Médio Geral:* R$ ${avgCpa.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n`;
      finalText += buildCampaignDetails();
    }

    finalText += `━━━━━━━━━━━━━━━━━━━━\n*${agencyName.toUpperCase()}*`;
    setGeneratedText(finalText);
  }, [campaignList, reportMode, clientName, periodText, templatesData]);

  const handleGenerate = () => {
    const selected = campaignList.filter(c => c.selected);
    if (selected.length === 0) {
      toast.warning("Selecione pelo menos uma campanha!");
      return;
    }
    
    setIsGenerating(true);
    
    setTimeout(() => {
      // Auto-salvar o relatório sempre que compilar sem duplicar toasts
      handleSaveReport(false);
      setIsGenerating(false);
      toast.success("Métricas compiladas e atualizadas em tempo real!");
    }, 600);
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

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      
      {/* HEADER TÉCNICO E PREMIUM */}
      <div className="flex flex-col gap-4 border-b border-white/5 pb-8 print:hidden sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link to="/dashboard" className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <p className="label-mono text-primary font-bold tracking-widest uppercase text-[9px]">Módulo Performance AI</p>
            </div>
            <h1 className="text-3xl font-black tracking-tighter text-gradient uppercase mt-0.5">Motor de Relatórios</h1>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setActiveReportId(null);
              toast.info("Novo relatório iniciado.");
            }}
            className="flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-all border border-primary/20"
            title="Começar um novo relatório do zero"
          >
            <Plus className="h-4 w-4" /> Novo Relatório
          </button>
          
          <button
            onClick={() => setIsSavedReportsModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest text-foreground hover:bg-white/10 transition-all border border-white/10 hover:border-white/20"
          >
            <FileText className="h-4 w-4" /> Salvos
            {savedReports.length > 0 && (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/80">{savedReports.length}</span>
            )}
          </button>

        {/* Alternador de Origem de Dados */}
        <div className="flex rounded-xl bg-white/5 p-1 border border-white/5">
          <button 
            onClick={() => setSource("api")} 
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${source === "api" ? "bg-primary text-background" : "text-muted-foreground hover:text-white"}`}
          >
            <Globe className="h-3.5 w-3.5" /> Meta Ads (Integrado)
          </button>
          <button 
            onClick={() => setSource("upload")} 
            className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-xs font-bold transition-all ${source === "upload" ? "bg-primary text-background" : "text-muted-foreground hover:text-white"}`}
          >
            <Sparkles className="h-3.5 w-3.5" /> Extração de Print (OCR)
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
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome do Cliente</label>
              <input 
                value={clientName} 
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Ex: Pizza Bonne"
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
              />
            </div>

            {source === "upload" && (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Período de Análise (Texto Livre)</label>
                <input 
                  value={periodText} 
                  onChange={(e) => setPeriodText(e.target.value)}
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
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Conta Conectada</label>
                <select 
                  value={selectedAccountId} 
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                >
                  <option value="all">Consolidado (Todas as contas)</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
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
                <option value="complete">Completo (Tipo + Detalhe de Campanha)</option>
                <option value="objective">Apenas por Tipo / Objetivo</option>
                <option value="campaigns">Apenas Métrica de Campanhas</option>
                {templatesData && templatesData.filter(t => !t.is_system).length > 0 && (
                  <optgroup label="Templates Customizados">
                    {templatesData.filter(t => !t.is_system).map(t => (
                      <option key={t.id} value={t.id}>Modelo: {t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

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
                <><Loader2 className="h-4 w-4 animate-spin" /> Compilando...</>
              ) : (
                <><FileCheck className="h-4.5 w-4.5" /> COMPILAR</>
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
        <div className="glass-panel card-sport p-6 space-y-4 lg:col-span-2 border-white/10 bg-white/5 flex flex-col min-h-[400px]">
          <div className="flex items-center justify-between border-b border-border/50 pb-3">
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-primary text-[10px] font-black">2</span>
              <div>
                <h3 className="header-sport text-sm font-black uppercase tracking-widest text-primary">Selecione e Classifique as Campanhas</h3>
                <p className="text-[10px] text-muted-foreground">Marque as campanhas que entrarão no relatório e defina o objetivo/métrica de cada uma.</p>
              </div>
            </div>
            {campaignList.length > 0 && (
              <div className="flex gap-2">
                <button 
                  onClick={() => handleToggleSelectAll(true)}
                  className="rounded bg-white/5 border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase text-white hover:bg-white/10 transition"
                >
                  Marcar Todas
                </button>
                <button 
                  onClick={() => handleToggleSelectAll(false)}
                  className="rounded bg-white/5 border border-white/10 px-2.5 py-1 text-[9px] font-black uppercase text-muted-foreground hover:bg-white/10 transition"
                >
                  Limpar
                </button>
              </div>
            )}
          </div>

          {campaignList.length === 0 ? (
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
                  <p className="text-[10px] text-muted-foreground mt-2 max-w-[250px] leading-relaxed">Não encontramos campanhas na conta escolhida dentro desse período. Verifique o filtro de datas no <strong className="text-white">Passo 1</strong>.</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto max-h-[350px] pr-1 space-y-2 scrollbar-thin">
              {campaignList.map((c) => (
                <div 
                  key={c.id} 
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition ${c.selected ? 'bg-primary/[0.02] border-primary/20 hover:border-primary/45' : 'bg-background/40 border-white/5 hover:border-white/10'}`}
                >
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={() => handleToggleSelect(c.id)}
                      className={`h-5 w-5 rounded border-2 flex items-center justify-center transition ${c.selected ? 'bg-primary border-primary text-background' : 'border-white/10 hover:border-primary/50'}`}
                    >
                      {c.selected && <CheckCircle2 className="h-3.5 w-3.5 stroke-[3]" />}
                    </button>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-bold text-white max-w-[280px] sm:max-w-[340px] truncate">{c.name}</p>
                        <span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${c.platform === 'meta' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary/20 text-secondary border border-secondary/30'}`}>
                          {c.platform === 'meta' ? 'Meta' : 'Google'}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        Custo: R$ {c.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} • Cliques: {c.clicks} • Conversões: {c.conversions}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 w-full sm:w-auto">
                    <label className="text-[9px] text-muted-foreground uppercase font-black px-1 hidden sm:block">Objetivo / Métrica</label>
                    <select
                      value={c.objective}
                      onChange={(e) => handleUpdateObjective(c.id, e.target.value)}
                      className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-[10px] font-bold text-white focus:outline-none focus:border-primary/50 transition-colors w-full sm:w-40"
                    >
                      <optgroup label="Fundo de Funil (Conversão)">
                        <option value="💬 Mensagens">💬 Mensagens (WPP/Direct)</option>
                        <option value="📧 Cadastros / Leads">📧 Cadastros (Leads)</option>
                        <option value="🛒 Adições ao Carrinho">🛒 Adições ao Carrinho</option>
                        <option value="💳 Compras / Vendas">💳 Finalizações de Compra</option>
                        <option value="📲 Instalações de App">📲 Instalações de App</option>
                        <option value="🎯 Outras Conversões">🎯 Outras Conversões</option>
                      </optgroup>
                      <optgroup label="Meio/Topo de Funil">
                        <option value="👆 Cliques no Link">👆 Cliques no Link</option>
                        <option value="👁️ Visualizações / Alcance">👁️ Alcance / Impressões</option>
                        <option value="🔥 Engajamento">🔥 Engajamento</option>
                      </optgroup>
                    </select>
                  </div>
                </div>
              ))}
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
                      <p className="text-[10px] text-muted-foreground mt-0.5">Texto idealizado para envio direto via WhatsApp.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button 
                      onClick={handleCopyToClipboard}
                      className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition"
                    >
                      {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? "Copiado!" : "Copiar"}
                    </button>
                    <button 
                      onClick={handleSendWhatsapp}
                      className="flex items-center gap-1.5 rounded-lg bg-success text-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:shadow-glow transition"
                    >
                      <Send className="h-3.5 w-3.5" /> Enviar
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <textarea
                    value={generatedText}
                    onChange={(e) => setGeneratedText(e.target.value)}
                    rows={18}
                    className="w-full rounded-xl border border-white/10 bg-black/60 p-4 text-xs font-mono text-green-400 focus:outline-none focus:border-primary/50 resize-none whitespace-pre leading-relaxed leading-[1.6]"
                  />
                </div>
              </div>

              <div className="rounded-xl bg-white/[0.02] border border-white/5 p-3 flex items-start gap-2.5 mt-4">
                <Brain className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-white">Dica da Victoria 🧠</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                    Você pode alterar livremente o texto acima caso queira fazer observações manuais ou anotações específicas antes de clicar em Enviar.
                  </p>
                </div>
              </div>
            </div>

            {/* Documento Estilizado (PDF/Impressão) */}
            <div className="glass-panel p-10 bg-background border-white/10 print:shadow-none print:border-none print:p-0 print:bg-white print:text-black flex flex-col justify-between min-h-[500px]">
              <div>
                <div className="border-b border-white/10 print:border-black/10 pb-6 mb-6 flex justify-between items-start">
                  <div>
                    <h2 className="header-sport text-2xl font-black tracking-tighter uppercase print:text-black flex items-center gap-2">
                      <Award className="h-6 w-6 text-primary" />
                      Relatório de Performance
                    </h2>
                    <p className="text-primary font-mono text-[10px] mt-1 print:text-black/60 uppercase tracking-widest font-black">
                      NC Performance Suite • {source === "upload" ? "Print OCR" : "Meta Ads Integrado"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Data de Geração</p>
                    <p className="text-xs font-mono font-bold print:text-black">{format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-8 border-b border-white/5 pb-6">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Cliente Anunciante</p>
                    <p className="text-lg font-black mt-0.5 print:text-black">{clientName}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Janela de Referência</p>
                    <p className="text-lg font-black mt-0.5 print:text-black">{periodText}</p>
                  </div>
                </div>

                {/* Métricas Consolidadas Visualmente Ricas */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Investido</p>
                    <p className="text-base font-mono font-black mt-1.5 print:text-black text-gradient">
                      R$ {campaignList.filter(c => c.selected).reduce((sum, c) => sum + c.cost, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Resultados</p>
                    <p className="text-base font-mono font-black mt-1.5 text-secondary print:text-black">
                      {campaignList.filter(c => c.selected).reduce((sum, c) => sum + (c.conversions || c.clicks), 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Alcance</p>
                    <p className="text-base font-mono font-black mt-1.5 print:text-black">
                      {campaignList.filter(c => c.selected).reduce((sum, c) => sum + c.reach, 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Impressões</p>
                    <p className="text-base font-mono font-black mt-1.5 print:text-black">
                      {campaignList.filter(c => c.selected).reduce((sum, c) => sum + c.impressions, 0).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>

                {activePdfLayout !== "minimalist" && (
                  <div className="space-y-2 mt-6">
                    {activePdfLayout === "analytical" ? (
                      <>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50 mb-3 border-b border-white/5 pb-1">Agrupamento por Objetivo</p>
                        {Array.from(campaignList.filter(c => c.selected).reduce((acc, c) => {
                          const cur = acc.get(c.objective) || { cost: 0, results: 0 };
                          cur.cost += c.cost;
                          cur.results += c.objective.includes("Cliques") ? c.clicks : c.conversions;
                          acc.set(c.objective, cur);
                          return acc;
                        }, new Map<string, { cost: number; results: number }>())).map(([obj, data], idx) => (
                          <div key={idx} className="flex justify-between text-xs py-1.5 border-b border-white/5">
                            <span className="font-bold text-white truncate max-w-[260px]">{obj}</span>
                            <span className="font-mono text-muted-foreground">R$ {data.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} — {data.results.toLocaleString('pt-BR')} res</span>
                          </div>
                        ))}
                      </>
                    ) : (
                      <>
                        <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50 mb-3 border-b border-white/5 pb-1">Campanhas Compiladas</p>
                        {campaignList.filter(c => c.selected).map((c, idx) => (
                          <div key={idx} className="flex justify-between text-xs py-1.5 border-b border-white/5">
                            <span className="font-bold text-white truncate max-w-[260px]">{c.name}</span>
                            <span className="font-mono text-muted-foreground">R$ {c.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="mt-8 pt-6 border-t border-white/5 print:border-black/5 text-center flex items-center justify-between">
                <span className="text-[9px] font-mono text-muted-foreground print:text-black/40">Automação de Relatórios NC Performance Suite</span>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition print:hidden"
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
              {/* Header Fixo do Modal */}
              <div className="flex items-center justify-between border-b border-border bg-muted/20 p-6">
                <div>
                  <h2 className="text-xl font-black uppercase tracking-tighter text-foreground flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Relatórios Salvos
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">Carregue configurações e edite relatórios gerados anteriormente.</p>
                </div>
                <button
                  onClick={() => setIsSavedReportsModalOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground transition"
                >
                  ✕
                </button>
              </div>

              {/* Área de Filtros Fixa */}
              <div className="flex flex-col sm:flex-row gap-4 border-b border-border bg-background p-6">
                <input
                  type="text"
                  placeholder="Filtrar por Cliente..."
                  value={reportSearchTerm}
                  onChange={(e) => setReportSearchTerm(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Filtrar por Período (ex: MAIO)..."
                  value={reportSearchPeriod}
                  onChange={(e) => setReportSearchPeriod(e.target.value)}
                  className="flex-1 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                />
              </div>

              {/* Área de Rolagem do Modal */}
              <div className="flex-1 overflow-y-auto p-6">
                {(() => {
                  const filtered = savedReports.filter(r => 
                    r.clientName.toLowerCase().includes(reportSearchTerm.toLowerCase()) &&
                    r.periodText.toLowerCase().includes(reportSearchPeriod.toLowerCase())
                  );

                  if (filtered.length === 0) {
                    return (
                      <div className="py-12 text-center text-muted-foreground/60">
                        <p className="text-sm font-bold">Nenhum relatório encontrado.</p>
                        <p className="text-[10px] mt-1">Gere um relatório e ele será salvo automaticamente.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filtered.map((report) => (
                        <div 
                          key={report.id}
                          onClick={() => {
                            handleLoadReport(report);
                            setIsSavedReportsModalOpen(false);
                          }}
                          className={`group flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all hover:bg-muted/50 ${
                            activeReportId === report.id
                              ? "bg-primary/[0.05] border-primary/30"
                              : "bg-card border-border"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-foreground uppercase">{report.clientName}</h4>
                              <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                Período: {report.periodText} • {report.reportMode === 'complete' ? 'Completo' : report.reportMode === 'objective' ? 'Por Objetivo' : 'Por Campanhas'}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className={`inline-flex rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${report.source === 'api' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary/20 text-secondary border border-secondary/30'}`}>
                                  {report.source === 'api' ? 'API Conectada' : 'OCR Print'}
                                </span>
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  {report.campaigns.filter(c => c.selected).length} campanhas
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteReport(report.id, e)}
                              className="h-8 w-8 rounded-lg bg-muted/50 hover:bg-red-500/20 hover:text-red-400 border border-border flex items-center justify-center transition"
                              title="Excluir Relatório"
                            >
                              <AlertCircle className="h-4 w-4" />
                            </button>
                          </div>
                          
                          <div className="flex items-center justify-between border-t border-border mt-4 pt-3 text-[10px] text-muted-foreground font-mono">
                            <span>Criado: {new Date(report.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                            <span className="text-primary group-hover:translate-x-1 transition-transform flex items-center gap-0.5 font-bold uppercase tracking-wider text-[9px]">
                              Carregar &rarr;
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
