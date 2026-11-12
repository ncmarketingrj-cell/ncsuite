import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  FileText, BarChart3, ArrowUpRight, Activity, Layers,
  ChevronDown, Globe, Target, TrendingUp, TrendingDown, DollarSign, MousePointer2, Users, Trophy,
  Loader2, GaugeCircle, PieChart as PieChartIcon, Sparkles, Eye, HelpCircle, CheckCircle2,
  AlertCircle, ArrowRight, Zap, Award, X
} from "lucide-react";
import { classifyCampaignType } from "./cockpit";

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4"];
import { supabase } from "@/integrations/supabase-external/client";
import {
  Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DateRangePicker } from "@/components/DateRangePicker";
import { PageHeader } from "@/components/PageHeader";
import { useGlobalDate } from "@/contexts/DateContext";
import { calibrateCampaignMetricsArray, ensureDatabaseCalibrated } from "@/lib/metaConversionCalibrator";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NC Performance Suite" }] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [showAccounts, setShowAccounts] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowAccounts(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);
  
  const { dateFrom, dateTo, setDateFrom, setDateTo } = useGlobalDate();

  const dateRange = useMemo(() => {
    const parseLocalDate = (str: string) => {
      const [y, m, d] = str.split("-").map(Number);
      return new Date(y, m - 1, d);
    };
    return {
      startDate: parseLocalDate(dateFrom),
      endDate: parseLocalDate(dateTo)
    };
  }, [dateFrom, dateTo]);

  const handleDateChange = (start: Date, end: Date) => {
    const getLocalDateStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };
    setDateFrom(getLocalDateStr(start));
    setDateTo(getLocalDateStr(end));
  };

  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: performanceData } = useQuery({
    queryKey: ["dash-performance-custom", selectedAccountId, selectedClientId, dateFrom, dateTo],
    queryFn: async () => {
      const parseLocalDate = (str: string) => {
        const [y, m, d] = str.split("-").map(Number);
        return new Date(y, m - 1, d);
      };
      const start = parseLocalDate(dateFrom);
      const end = parseLocalDate(dateTo);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const startStr = dateFrom;
      const endStr = dateTo;
      const prevStartStr = getLocalDateStr(subDays(start, diffDays));

      // 1. Obter campanhas da conta ou do cliente com filtro nativo
      let campQ = (supabase as any).from("campaigns").select("id, name, objective, ad_account_id, client_id");
      if (selectedAccountId !== "all") {
        campQ = campQ.eq("ad_account_id", selectedAccountId);
      }
      if (selectedClientId !== "all") {
        campQ = campQ.eq("client_id", selectedClientId);
      }
      const { data: campsList } = await campQ;
      const campaignsMap = new Map();
      const campIds = (campsList || []).map((c: any) => {
        campaignsMap.set(c.id, { id: c.id, name: c.name || "Desconhecida", objective: c.objective, cost: 0, results: 0, trueConversions: 0 });
        return c.id;
      });

      // Se filtrou por conta ou cliente e não encontrou nenhuma campanha
      if ((selectedAccountId !== "all" || selectedClientId !== "all") && campIds.length === 0) {
        return {
          chartData: [],
          barData: [],
          pieData: [],
          campaignsRanked: [],
          bestDay: null,
          avgDailyCost: 0,
          healthScore: 100,
          totals: { cost: 0, conversions: 0, results: 0, clicks: 0, impressions: 0, reach: 0 },
          trends: { cost: "0%", costPositive: true, conversions: "0%", conversionsPositive: true, clicks: "0%", clicksPositive: true, cpl: "0%", cplPositive: true },
          cpl: 0
        };
      }

      let metricsQuery = (supabase as any).from("metrics").select(`
        campaign_id, cost, conversions, impressions, clicks, reach, date,
        campaigns(ad_account_id, client_id, name, objective)
      `).gte('date', prevStartStr).lte('date', endStr);

      if (campIds.length > 0 && (selectedAccountId !== "all" || selectedClientId !== "all")) {
        metricsQuery = metricsQuery.in("campaign_id", campIds);
      }

      ensureDatabaseCalibrated(supabase).catch(() => {});
      const { data: metricsData } = await metricsQuery;
      const metrics = (metricsData || []).map((m: any) =>
        calibrateCampaignMetricsArray(m.campaigns?.name || "", [m])[0] || m
      );

      const chartMap = new Map();
      let currentPeriod = { cost: 0, results: 0, trueConversions: 0, clicks: 0, impressions: 0, reach: 0 };
      let previousPeriod = { cost: 0, results: 0, trueConversions: 0, clicks: 0, impressions: 0, reach: 0 };

      // Ensure all dates in interval exist in chartMap to prevent broken lines
      const { eachDayOfInterval } = await import("date-fns");
      const daysInInterval = eachDayOfInterval({ start: new Date(startStr + "T00:00:00"), end: new Date(endStr + "T00:00:00") });
      daysInInterval.forEach((d: any) => {
        const ds = getLocalDateStr(d);
        chartMap.set(ds, { date: ds, cost: 0, conversions: 0, clicks: 0 });
      });

      (metrics || []).forEach((m: any) => {
        if (!m.date) return;
        
        const isCurrent = m.date >= startStr && m.date <= endStr;
        const isPrevious = m.date >= prevStartStr && m.date < startStr;
        
        const objective = m.campaigns?.objective;
        const campName = (m.campaigns?.name || "").toUpperCase();
        const isMessagingCamp = campName.includes("MSG") || campName.includes("MENSAGEM") || campName.includes("WPP") || campName.includes("WHATSAPP") || campName.includes("DIRECT") || campName.includes("CONVERSA");
        const isVanity = isMessagingCamp ? false : (objective ? ["OUTCOME_AWARENESS", "VIDEO_VIEWS", "OUTCOME_ENGAGEMENT", "LINK_CLICKS", "OUTCOME_TRAFFIC"].includes(objective) : false);
        
        if (isCurrent) {
          const date = m.date;
          const current = chartMap.get(date) || { date, cost: 0, conversions: 0, clicks: 0 };
          current.cost += Number(m.cost || 0);
          current.conversions += isVanity ? 0 : Number(m.conversions || 0); // Only True Conversions on the chart
          current.clicks += Number(m.clicks || 0);
          chartMap.set(date, current);

          const campId = m.campaign_id;
          const camp = campaignsMap.get(campId) || { id: campId, name: m.campaigns?.name || "Desconhecida", objective, cost: 0, results: 0, trueConversions: 0 };
          camp.cost += Number(m.cost || 0);
          camp.results += Number(m.conversions || 0);
          if (!isVanity) camp.trueConversions += Number(m.conversions || 0);
          campaignsMap.set(campId, camp);

          currentPeriod.cost += Number(m.cost || 0);
          currentPeriod.results += Number(m.conversions || 0);
          if (!isVanity) currentPeriod.trueConversions += Number(m.conversions || 0);
          currentPeriod.clicks += Number(m.clicks || 0);
          currentPeriod.impressions += Number(m.impressions || 0);
          currentPeriod.reach += Number(m.reach || m.impressions * 0.8 || 0);
        } else if (isPrevious) {
          previousPeriod.cost += Number(m.cost || 0);
          previousPeriod.results += Number(m.conversions || 0);
          if (!isVanity) previousPeriod.trueConversions += Number(m.conversions || 0);
          previousPeriod.clicks += Number(m.clicks || 0);
          previousPeriod.impressions += Number(m.impressions || 0);
        }
      });

      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const campaignsData = Array.from(campaignsMap.values()).sort((a, b) => b.cost - a.cost);
      
      const totalSpendPeriod = currentPeriod.cost || 1;
      const campaignsRanked = campaignsData.map(c => {
        const classification = classifyCampaignType(c.name, "", c.objective);
        const cost = c.cost || 0;
        const convCount = classification.isLead ? c.trueConversions : c.results;
        const cpa = convCount > 0 ? cost / convCount : 0;
        const percentage = (cost / totalSpendPeriod) * 100;
        return {
          ...c,
          classification,
          cpa,
          percentage,
          conversions: convCount,
        };
      });

      const barData = campaignsRanked.slice(0, 8).map(c => ({ name: c.name.toUpperCase(), Gasto: c.cost, Resultados: c.conversions }));
      const pieData = campaignsRanked.filter(c => c.cost > 0).slice(0, 6).map(c => ({ 
        name: c.name, 
        value: c.cost,
        percentage: c.percentage 
      }));

      // Estatísticas executivas do período
      let bestDay = chartData.length > 0 ? chartData[0] : null;
      let maxConv = -1;
      chartData.forEach(d => {
        if (d.conversions > maxConv) {
          maxConv = d.conversions;
          bestDay = d;
        }
      });
      const avgDailyCost = chartData.length > 0 ? currentPeriod.cost / chartData.length : currentPeriod.cost;

      const calcTrend = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? "—" : "0%";
        const diff = ((curr - prev) / prev) * 100;
        return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
      };

      const cplCurr = currentPeriod.trueConversions > 0 ? currentPeriod.cost / currentPeriod.trueConversions : 0;
      const cplPrev = previousPeriod.trueConversions > 0 ? previousPeriod.cost / previousPeriod.trueConversions : 0;
      const cplTrendVal = cplPrev === 0 ? 0 : ((cplCurr - cplPrev) / cplPrev) * 100;

      const isVanity = (obj: string, name?: string) => {
        const n = (name || "").toUpperCase();
        if (n.includes("MSG") || n.includes("MENSAGEM") || n.includes("WPP") || n.includes("WHATSAPP") || n.includes("DIRECT") || n.includes("CONVERSA")) {
          return false;
        }
        return ["OUTCOME_AWARENESS", "VIDEO_VIEWS", "OUTCOME_ENGAGEMENT", "LINK_CLICKS", "OUTCOME_TRAFFIC"].includes(obj);
      };

      const riskReturn = campaignsData.map(c => {
        const isVanityObjective = isVanity(c.objective, c.name);
        const cpa = c.trueConversions > 0 ? c.cost / c.trueConversions : c.cost;
        let type = "Estável";
        
        if (isVanityObjective) {
          type = "Ignorado";
        } else {
          if (c.trueConversions === 0 && c.cost > 30) type = "Ralo";
          else if (c.trueConversions > 0 && cpa > cplCurr * 1.5) type = "Risco";
          else if (c.trueConversions > 0 && cpa < cplCurr * 0.7) type = "Oportunidade";
        }
        
        return { ...c, cpa, type };
      });

      const opportunities = riskReturn.filter(c => c.type === "Oportunidade").sort((a, b) => a.cpa - b.cpa);
      const risks = riskReturn.filter(c => c.type === "Ralo" || c.type === "Risco").sort((a, b) => b.cost - a.cost);

      let healthScore = 100;
      if (cplTrendVal > 10) healthScore -= 15;
      if (cplTrendVal > 30) healthScore -= 20;
      if (cplTrendVal < 0) healthScore += 10;
      
      const convRate = currentPeriod.clicks > 0 ? currentPeriod.trueConversions / currentPeriod.clicks : 0;
      if (convRate < 0.01) healthScore -= 10;
      if (opportunities.length === 0 && risks.length > 0) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      return {
        chartData,
        barData,
        pieData,
        campaignsRanked,
        bestDay,
        avgDailyCost,
        healthScore,
        totals: { ...currentPeriod, conversions: currentPeriod.trueConversions },
        trends: {
          cost: calcTrend(currentPeriod.cost, previousPeriod.cost),
          costPositive: currentPeriod.cost > previousPeriod.cost,
          conversions: calcTrend(currentPeriod.trueConversions, previousPeriod.trueConversions),
          conversionsPositive: currentPeriod.trueConversions >= previousPeriod.trueConversions,
          clicks: calcTrend(currentPeriod.clicks, previousPeriod.clicks),
          clicksPositive: currentPeriod.clicks >= previousPeriod.clicks,
          cpl: `${cplTrendVal > 0 ? '+' : ''}${cplTrendVal.toFixed(1)}%`,
          cplPositive: cplTrendVal <= 0,
        },
        cpl: cplCurr
      };
    },
  });

  // ─── Query: Tabela de Desempenho de Contas (Command Center) ───────────────────
  const { data: accountsTableData = [], isLoading: isLoadingTable } = useQuery({
    queryKey: ["dashboard-accounts-table-data", dateFrom, dateTo],
    queryFn: async () => {
      const { data: adAccounts } = await (supabase as any)
        .from("ad_accounts")
        .select("id, name, platform");

      const { data: activeCamps } = await (supabase as any)
        .from("campaigns")
        .select("ad_account_id")
        .eq("status", "active");

      const activeCounts: Record<string, number> = {};
      for (const c of (activeCamps || [])) {
        activeCounts[c.ad_account_id] = (activeCounts[c.ad_account_id] || 0) + 1;
      }

      const metricsMap: Record<string, {
        spend: number;
        reach: number;
        results: number;
        impressions: number;
        purchases: number;
        leads: number;
      }> = {};

      // 1. Tenta buscar direto de metrics com join de campaigns (tempo real e classificação por nome/objetivo)
      try {
        const { data: rawMetrics } = await (supabase as any)
          .from("metrics")
          .select(`
            cost, conversions, reach, impressions, result_type, date,
            campaigns!inner(ad_account_id, name, objective)
          `)
          .gte("date", dateFrom)
          .lte("date", dateTo);

        if (rawMetrics && rawMetrics.length > 0) {
          for (const rawM of rawMetrics) {
            const m = calibrateCampaignMetricsArray(rawM.campaigns?.name || "", [rawM])[0] || rawM;
            const key = m.campaigns?.ad_account_id;
            if (!key) continue;
            if (!metricsMap[key]) {
              metricsMap[key] = { spend: 0, reach: 0, results: 0, impressions: 0, purchases: 0, leads: 0 };
            }
            const cost = Number(m.cost || 0);
            const conversions = Number(m.conversions || 0);
            const reach = Number(m.reach || 0);
            const impressions = Number(m.impressions || 0);

            metricsMap[key].spend += cost;
            metricsMap[key].reach += reach;
            metricsMap[key].impressions += impressions;
            metricsMap[key].results += conversions;

            const campName = (m.campaigns?.name || "").toUpperCase();
            const obj = (m.campaigns?.objective || "").toUpperCase();
            const resType = (m.result_type || "").toUpperCase();

            const isMessaging = campName.includes("MSG") ||
                                campName.includes("MENSAGEM") ||
                                campName.includes("WPP") ||
                                campName.includes("WHATSAPP") ||
                                campName.includes("DIRECT") ||
                                campName.includes("CONVERSA") ||
                                ["OUTCOME_LEADS", "LEAD_GENERATION", "MESSAGES", "OUTCOME_ENGAGEMENT"].includes(obj) ||
                                ["OUTCOME_LEADS", "LEAD_GENERATION", "MESSAGES", "OUTCOME_ENGAGEMENT"].includes(resType);

            const isPurchase = ["CONVERSIONS", "OUTCOME_SALES"].includes(obj) || ["CONVERSIONS", "OUTCOME_SALES"].includes(resType);

            if (isMessaging) {
              metricsMap[key].leads += conversions;
            } else if (isPurchase) {
              metricsMap[key].purchases += conversions;
            } else {
              const isVanity = ["OUTCOME_AWARENESS", "VIDEO_VIEWS"].includes(obj);
              if (!isVanity && conversions > 0) {
                metricsMap[key].leads += conversions;
              }
            }
          }
        }
      } catch (errMetrics) {
        console.warn("[Dashboard] Falha ao consultar metrics joined:", errMetrics);
      }

      // 2. Se metricsMap estiver vazio ou faltarem dados, complementa com daily_metrics
      try {
        const { data: metricsData } = await (supabase as any)
          .from("daily_metrics")
          .select("ad_account_id, spend, reach, results, impressions, purchases, leads")
          .gte("date", dateFrom)
          .lte("date", dateTo);

        for (const row of (metricsData || [])) {
          const key = row.ad_account_id;
          const rowLeads = Number(row.leads || 0);
          const rowResults = Number(row.results || 0);
          const rowPurchases = Number(row.purchases || 0);
          const effectiveLeads = rowLeads > 0 ? rowLeads : (rowPurchases === 0 ? rowResults : 0);

          if (!metricsMap[key]) {
            metricsMap[key] = {
              spend: Number(row.spend || 0),
              reach: Number(row.reach || 0),
              results: rowResults,
              impressions: Number(row.impressions || 0),
              purchases: rowPurchases,
              leads: effectiveLeads,
            };
          } else {
            // Se a query direta deixou leads zerado mas daily_metrics tem ou results > 0
            if (metricsMap[key].leads === 0 && effectiveLeads > 0) {
              metricsMap[key].leads = effectiveLeads;
            }
            if (metricsMap[key].reach === 0 && Number(row.reach || 0) > 0) {
              metricsMap[key].reach = Number(row.reach || 0);
            }
          }
        }
      } catch (errDaily) {
        console.warn("[Dashboard] Falha ao consultar daily_metrics:", errDaily);
      }

      // 3. Salvaguarda: se houver resultados/conversões e nenhuma purchase, nunca exibe Mensagens zeradas!
      for (const key of Object.keys(metricsMap)) {
        if (metricsMap[key].leads === 0 && metricsMap[key].purchases === 0 && metricsMap[key].results > 0) {
          metricsMap[key].leads = metricsMap[key].results;
        }
      }

      const { data: clientsData } = await (supabase as any)
        .from("clients")
        .select("id, name, meta_ad_account_id, logo_url");

      const clientMap: Record<string, { id: string; name: string; logo_url?: string }> = {};
      for (const client of (clientsData || [])) {
        if (client.meta_ad_account_id) {
          clientMap[client.meta_ad_account_id] = { id: client.id, name: client.name, logo_url: client.logo_url };
        }
      }

      return (adAccounts || []).map((acc: any) => {
        const metrics = metricsMap[acc.id] || { spend: 0, reach: 0, results: 0, impressions: 0, purchases: 0, leads: 0 };
        const activeCampaignsCount = activeCounts[acc.id] || 0;
        const linkedClient = clientMap[acc.id] || null;

        return {
          id: acc.id,
          name: acc.name,
          platform: acc.platform,
          activeCampaignsCount,
          client: linkedClient,
          metrics
        };
      });
    }
  });

  const filteredAccounts = useMemo(() => {
    return accountsTableData.filter((acc: any) => {
      if (selectedAccountId !== "all" && acc.id !== selectedAccountId) return false;
      if (selectedClientId !== "all" && acc.client?.id !== selectedClientId) return false;
      if (selectedAccountId !== "all" || selectedClientId !== "all") return true;
      return acc.activeCampaignsCount > 0 || acc.metrics.spend > 0;
    });
  }, [accountsTableData, selectedAccountId, selectedClientId]);

  const sortedAccounts = useMemo(() => {
    return [...filteredAccounts].sort((a, b) => {
      if (a.activeCampaignsCount > 0 && b.activeCampaignsCount === 0) return -1;
      if (a.activeCampaignsCount === 0 && b.activeCampaignsCount > 0) return 1;
      return b.metrics.spend - a.metrics.spend;
    });
  }, [filteredAccounts]);

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="w-full p-1 pb-20">
      
      {/* â”€â”€â”€ STICKY HEADER AREA â”€â”€â”€ */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-3 pt-2 space-y-3 sm:space-y-5">
        
        {/* PageHeader Corporativo Padronizado com Health Score */}
        <div className="flex items-start justify-between gap-2">
          <PageHeader
            eyebrow="Painel Geral"
            title="Command Center"
            description="Visão analítica de performance, tráfego e inteligência artificial da NC Suite."
            compact
          />
          
          {/* Health Score Badge → Cockpit */}
          {performanceData && (
            <div className="flex flex-col items-end pt-1 gap-1.5">
              <Link to="/cockpit" className="group flex items-center gap-3 bg-card/40 border border-border/50 rounded-2xl p-2.5 pr-4 backdrop-blur-md transition-all hover:bg-card hover:border-primary/30 hover:shadow-[0_0_16px_rgba(var(--primary-rgb),0.08)]">
                <div className="relative h-10 w-10 flex items-center justify-center">
                  <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 36 36">
                    <path
                      className="text-muted/20"
                      strokeWidth="3"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={performanceData.healthScore >= 80 ? "text-success" : performanceData.healthScore >= 50 ? "text-primary" : "text-destructive"}
                      strokeDasharray={`${performanceData.healthScore}, 100`}
                      strokeWidth="3"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="absolute text-[11px] font-black">{performanceData.healthScore}</span>
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Health Score</p>
                  <p className={`text-xs font-bold mt-0.5 ${performanceData.healthScore >= 80 ? "text-success" : performanceData.healthScore >= 50 ? "text-primary" : "text-destructive"}`}>
                    {performanceData.healthScore >= 80 ? "Excelente" : performanceData.healthScore >= 50 ? "Atenção" : "Crítico"}
                  </p>
                </div>
                <GaugeCircle className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors ml-1" />
              </Link>
              <span className="text-[8px] font-black uppercase tracking-[0.18em] text-muted-foreground/30 group-hover:text-primary/60 transition-colors pr-1">
                → Cockpit
              </span>
            </div>
          )}
        </div>

        {/* â”€â”€â”€ FILTER BAR ESTRUTURADA (UI PREMIUM) â”€â”€â”€ */}
        <div className="relative z-50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between w-full bg-card/45 border border-border/60 rounded-2xl p-3 backdrop-blur-md">
          {/* Filtros à esquerda */}
          <div className="flex items-center gap-2">

            {/* Dropdown fora do overflow para o menu absoluto não ser clippado */}
            <div ref={dropdownRef} className="relative shrink-0">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
              >
                {selectedClientId !== "all" ? (
                  <Users className="h-3.5 w-3.5 text-primary" />
                ) : selectedAccountId !== "all" ? (
                  selectedAccount?.platform === "Google Ads" ? <Globe className="h-3.5 w-3.5 text-[#4285F4]" /> : <Target className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Target className="h-3.5 w-3.5 text-primary" />
                )}
                {selectedClientId !== "all"
                  ? clients.find((c: any) => c.id === selectedClientId)?.name || "Cliente"
                  : selectedAccountId !== "all"
                    ? selectedAccount?.name
                    : "Geral"}
                <ChevronDown className={`h-3 w-3 transition ${showAccounts ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showAccounts && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-background/95 p-2 shadow-2xl backdrop-blur-2xl"
                  >
                    <button
                      onClick={() => { setSelectedAccountId("all"); setSelectedClientId("all"); setShowAccounts(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedAccountId === "all" && selectedClientId === "all" ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                    >
                      <Globe className="h-4 w-4" /> Visão Geral
                    </button>
                    <div className="my-2 h-px bg-white/5" />

                    <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Por Cliente</div>
                    <div className="max-h-[150px] overflow-y-auto custom-scrollbar">
                      {clients.map((c: any) => (
                        <button
                          key={`client-${c.id}`}
                          onClick={() => { setSelectedClientId(c.id); setSelectedAccountId("all"); setShowAccounts(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedClientId === c.id ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                        >
                          <Users className="h-3.5 w-3.5 opacity-50" />
                          {c.name}
                        </button>
                      ))}
                    </div>

                    <div className="my-2 h-px bg-white/5" />

                    <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Por Conta de Anúncio</div>
                    <div className="max-h-[150px] overflow-y-auto custom-scrollbar">
                      {accounts.map((acc: any) => (
                        <button
                          key={`acc-${acc.id}`}
                          onClick={() => { setSelectedAccountId(acc.id); setSelectedClientId("all"); setShowAccounts(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedAccountId === acc.id ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                        >
                          <div className="flex items-center justify-center w-4">
                            {acc.platform === "Google Ads" ? (
                              <Globe className={`h-3.5 w-3.5 ${selectedAccountId === acc.id ? "text-[#4285F4]" : "text-muted-foreground opacity-50"}`} />
                            ) : (
                              <Target className={`h-3.5 w-3.5 ${selectedAccountId === acc.id ? "text-primary" : "text-muted-foreground opacity-50"}`} />
                            )}
                          </div>
                          <span className="truncate">{acc.name}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={handleDateChange}
            />

            {(selectedAccountId !== "all" || selectedClientId !== "all") && (
              <button
                onClick={() => { setSelectedAccountId("all"); setSelectedClientId("all"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/25 transition-all shadow-sm"
                title="Limpar filtro e ver todas as contas"
              >
                <span className="truncate max-w-[140px] sm:max-w-[200px]">
                  Filtro: {selectedAccount?.name || clients.find((c: any) => c.id === selectedClientId)?.name || "Filtrado"}
                </span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            )}
          </div>

          {/* Divisor vertical em telas grandes */}
          <div className="hidden lg:block h-6 w-px bg-white/10" />

          {/* Ações à direita com espaçamento destacado */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <button
              onClick={() => navigate({ to: "/relatorios" })}
              className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-glow-sm whitespace-nowrap shrink-0"
            >
              <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-8 bg-white/20" />
              </div>
              <FileText className="h-4 w-4 shrink-0" />
              Gerar Relatório
            </button>
          </div>
        </div>

        {/* Stats Layer (Dinâmico) */}
        {(isLoadingTable) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground/60 font-mono">
            <div className="h-3 w-3 rounded-full bg-primary/50 animate-pulse" />
            Atualizando dados...
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Investimento"
          value={performanceData?.totals?.cost ?? 0}
          prefix="R$ "
          icon={DollarSign}
          trend={performanceData?.trends?.cost}
          isPositive={performanceData?.trends?.costPositive}
          helper="Verba bruta consumida em anúncios"
          subMetric={
            <span>
              Alcance: <strong className="text-foreground">{(performanceData?.totals?.reach || Math.round((performanceData?.totals?.impressions || 0) * 0.75)).toLocaleString('pt-BR')}</strong>
            </span>
          }
        />
        <StatCard
          label="Conversões"
          value={performanceData?.totals?.conversions ?? 0}
          icon={Trophy}
          trend={performanceData?.trends?.conversions}
          isPositive={performanceData?.trends?.conversionsPositive}
          helper="Contatos diretos no WhatsApp e cadastros"
          subMetric={
            <span>
              CVR: <strong className="text-primary">{performanceData?.totals?.clicks ? ((performanceData.totals.conversions / performanceData.totals.clicks) * 100).toFixed(2) : "0.00"}%</strong> dos cliques
            </span>
          }
        />
        <StatCard
          label="CPA Médio"
          value={performanceData?.cpl ?? 0}
          prefix="R$ "
          icon={Target}
          trend={performanceData?.trends?.cpl}
          isPositive={performanceData?.trends?.cplPositive}
          helper="Custo médio por contato qualificado"
          subMetric={
            <span>
              Meta: <strong className="text-emerald-400">R$ 5,00 a R$ 35,00</strong>
            </span>
          }
        />
        <StatCard
          label="Cliques no Link"
          value={performanceData?.totals?.clicks ?? 0}
          icon={MousePointer2}
          trend={performanceData?.trends?.clicks}
          isPositive={performanceData?.trends?.clicksPositive}
          helper="Visitas enviadas aos anúncios e site"
          subMetric={
            <span>
              CTR: <strong className="text-indigo-400">{performanceData?.totals?.impressions ? ((performanceData.totals.clicks / performanceData.totals.impressions) * 100).toFixed(2) : "0.00"}%</strong>
            </span>
          }
        />
      </div>
      
      <div className="pt-4 space-y-6">

      {/* ─── RESUMO EXECUTIVO DA CONTA / CONSOLIDADO ─── */}
      {(() => {
        const totals = performanceData?.totals || { cost: 0, clicks: 0, impressions: 0, conversions: 0, reach: 0 };
        const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0;
        const cpc = totals.clicks > 0 ? totals.cost / totals.clicks : 0;
        const cpa = performanceData?.cpl || 0;
        const cpm = totals.impressions > 0 ? (totals.cost / totals.impressions) * 1000 : 0;
        const reachVal = totals.reach || Math.round(totals.impressions * 0.75);

        return (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 sm:p-5 rounded-2xl bg-card border border-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
          >
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-primary font-display truncate">
                    {selectedAccount?.name || (selectedClientId !== "all" ? clients.find((c: any) => c.id === selectedClientId)?.name : null) || "Visão Geral Consolidada"}
                  </span>
                  <span className="text-muted-foreground text-[10px]">•</span>
                  <span className="text-[10px] font-mono font-bold text-muted-foreground">
                    {format(dateRange.startDate, "dd/MM/yyyy")} até {format(dateRange.endDate, "dd/MM/yyyy")}
                  </span>
                </div>
                <p className="text-xs text-foreground/90 leading-relaxed">
                  {totals.cost > 0 ? (
                    <>
                      Investimento de <strong className="text-foreground font-mono">R$ {totals.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> gerou{" "}
                      <strong className="text-foreground font-mono">{totals.clicks.toLocaleString('pt-BR')} cliques</strong> (CTR de {ctr.toFixed(2)}%) e{" "}
                      <strong className="text-primary font-mono">{totals.conversions} contatos diretos de compradores</strong>
                      {cpa > 0 ? <> com CPA médio de <strong className="text-foreground font-mono">R$ {cpa.toFixed(2)}</strong>.</> : "."}
                    </>
                  ) : (
                    "Nenhuma movimentação de anúncios registrada para esta conta no período selecionado."
                  )}
                </p>
              </div>
            </div>

            {/* Badges de Eficiência Operacional */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap self-start md:self-auto text-[11px] font-mono">
              <div className="bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-muted-foreground text-[9px] uppercase tracking-wider block font-sans font-bold">CPM Médio</span>
                <span className="font-bold text-foreground">R$ {cpm.toFixed(2)}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-muted-foreground text-[9px] uppercase tracking-wider block font-sans font-bold">CPC Médio</span>
                <span className="font-bold text-foreground">R$ {cpc.toFixed(2)}</span>
              </div>
              <div className="bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-muted-foreground text-[9px] uppercase tracking-wider block font-sans font-bold">Alcance Est.</span>
                <span className="font-bold text-foreground">{reachVal.toLocaleString('pt-BR')}</span>
              </div>
            </div>
          </motion.div>
        );
      })()}

      {/* ─── CHARTS SECUNDÁRIOS: RANKING DE CAMPANHAS & DISTRIBUIÇÃO DE VERBA ─── */}
      <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2 mt-4 sm:mt-8">
        
        {/* RANKING DE PERFORMANCE POR CAMPANHA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-panel p-4 sm:p-6 lg:p-8 min-w-0 flex flex-col justify-between"
        >
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-primary" />
                  Top Campanhas por Investimento &amp; Retorno
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
                  Compara gasto, conversões geradas e eficiência de cada campanha
                </p>
              </div>
              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-white/5 border border-white/10 px-2 py-1 rounded-lg">
                Ranking
              </span>
            </div>

            {/* Lista de Campanhas Ranqueadas (Legível, sem texto cortado ou inclinado) */}
            <div className="space-y-3">
              {(performanceData?.campaignsRanked || []).slice(0, 5).map((camp: any, idx: number) => {
                const medals = ["🥇", "🥈", "🥉"];
                return (
                  <div
                    key={camp.id || idx}
                    onClick={() => navigate({ to: "/metricas", search: { campaign: camp.id } })}
                    className="group p-3 sm:p-3.5 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.05] hover:border-primary/30 transition-all cursor-pointer space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-sm shrink-0">
                          {medals[idx] || <span className="text-[10px] font-black text-muted-foreground px-1">#{idx + 1}</span>}
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                            {camp.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">
                              {camp.classification?.typeLabel || "Meta Ads"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-xs font-black font-mono text-primary">
                          R$ {camp.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <p className="text-[9px] font-bold text-muted-foreground uppercase">
                          {camp.percentage.toFixed(1)}% do gasto total
                        </p>
                      </div>
                    </div>

                    {/* Barra Horizontal de Proporção de Verba */}
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-primary to-rose-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, Math.max(5, camp.percentage))}%` }}
                      />
                    </div>

                    {/* Detalhes de Retorno e CPA */}
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className="text-muted-foreground">
                        Retorno: <strong className="text-foreground font-mono">{camp.conversions}</strong> {camp.classification?.isLead ? "contatos/leads" : "ações"}
                      </span>
                      <span className="font-mono">
                        {camp.conversions > 0 ? (
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                            camp.cpa <= 35 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                            camp.cpa <= 75 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                            "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}>
                            CPA: R$ {camp.cpa.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/60 text-[9px] uppercase font-bold bg-white/5 px-2 py-0.5 rounded">
                            Sem conversão
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}

              {(performanceData?.campaignsRanked || []).length === 0 && (
                <div className="text-center py-8 text-xs text-muted-foreground/60">
                  Nenhuma campanha encontrada no período selecionado.
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Clique em qualquer campanha para abrir métricas detalhadas</span>
            <ArrowRight className="h-3 w-3" />
          </div>
        </motion.div>

        {/* DISTRIBUIÇÃO DA VERBA PUBLICITÁRIA */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-panel p-4 sm:p-6 lg:p-8 min-w-0 flex flex-col justify-between"
        >
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2">
                  <PieChartIcon className="h-4 w-4 text-primary" />
                  Distribuição da Verba Publicitária
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
                  Divisão percentual e financeira do orçamento entre as campanhas
                </p>
              </div>
            </div>

            {/* Layout Duplo: Donut na Esquerda + Legenda Detalhada na Direita */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
              <div className="md:col-span-5 h-[220px] relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <Pie
                      data={performanceData?.pieData || []}
                      cx="50%"
                      cy="50%"
                      innerRadius="60%"
                      outerRadius="85%"
                      paddingAngle={4}
                      dataKey="value"
                      stroke="none"
                    >
                      {(performanceData?.pieData || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                      itemStyle={{ fontSize: '11px', fontWeight: 800, fontFamily: 'monospace' }}
                      formatter={(value: any) => [`R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Investimento']}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total</span>
                  <span className="text-base sm:text-lg font-black font-mono mt-0.5 text-foreground">
                    R$ {(performanceData?.totals?.cost || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                  </span>
                </div>
              </div>

              {/* Lista Detalhada com Nome, % e R$ */}
              <div className="md:col-span-7 space-y-2 max-h-[240px] overflow-y-auto custom-scrollbar pr-1">
                {(performanceData?.pieData || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between gap-2 p-2 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                      <span className="text-xs font-bold text-foreground truncate max-w-[140px] sm:max-w-[160px]">
                        {item.name}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-black font-mono text-foreground">
                        {item.percentage ? item.percentage.toFixed(1) : ((item.value / (performanceData?.totals?.cost || 1)) * 100).toFixed(1)}%
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground ml-2">
                        R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                ))}

                {(performanceData?.pieData || []).length === 0 && (
                  <div className="text-center py-6 text-xs text-muted-foreground/60">
                    Sem movimentação financeira no período.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-muted-foreground">
            💡 {(performanceData?.pieData || []).length > 0 ? (
              <>A campanha líder concentra <strong className="text-foreground">{((performanceData?.pieData?.[0]?.value / (performanceData?.totals?.cost || 1)) * 100).toFixed(0)}%</strong> do orçamento total.</>
            ) : "Nenhum investimento registrado."}
          </div>
        </motion.div>

      </div>

      {/* â”€â”€â”€ TABELA DE DESEMPENHO DE CONTAS â”€â”€â”€ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-panel p-4 sm:p-6 lg:p-8 mt-4 sm:mt-8 w-full overflow-hidden"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h3 className="header-sport text-base font-black tracking-widest uppercase flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Desempenho Geral de Contas
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
              Dados consolidados do período
            </p>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Filtrar período:</span>
            <DateRangePicker
              startDate={dateRange.startDate} 
              endDate={dateRange.endDate} 
              onChange={handleDateChange} 
            />
          </div>
        </div>

        {isLoadingTable ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sortedAccounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground/50">
            <Activity className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs">Nenhuma conta com campanha ativa ou métricas no período.</p>
          </div>
        ) : (
          <>
          {/* ── Mobile: cards por conta ── */}
          <div className="sm:hidden space-y-3">
            {sortedAccounts.map(row => (
              <div
                key={row.id}
                onClick={() => { setSelectedAccountId(row.id); setSelectedClientId("all"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="w-full text-left p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] hover:border-primary/40 transition-all cursor-pointer active:scale-[0.98]"
              >
                {/* Cabeçalho do card */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {row.client?.logo_url ? (
                      <img src={row.client.logo_url} alt={row.client.name} className="h-9 w-9 rounded-xl object-cover border border-white/10 shrink-0" />
                    ) : (
                      <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary shrink-0">
                        {row.name.substring(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-black text-foreground truncate">{row.name}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5 truncate">{row.client ? row.client.name : "Sem cliente"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-full ${row.activeCampaignsCount > 0 ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${row.activeCampaignsCount > 0 ? "bg-success animate-pulse" : "bg-muted-foreground/50"}`} />
                      {row.activeCampaignsCount > 0 ? `${row.activeCampaignsCount} ativas` : "Inativo"}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); navigate({ to: "/metricas", search: { account: row.id } }); }}
                      className="p-1 rounded-lg bg-white/5 hover:bg-primary/20 hover:text-primary transition-colors"
                      title="Ver métricas completas"
                    >
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {/* Grid de métricas 3x2 */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-primary/5 border border-primary/10 rounded-xl p-2.5 col-span-1">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Investido</p>
                    <p className="text-xs font-black font-mono text-primary mt-1">
                      {row.metrics.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Alcance</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.reach > 999 ? `${(row.metrics.reach / 1000).toFixed(1)}k` : row.metrics.reach.toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">CPL</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {(() => {
                        const effLeads = row.metrics.leads > 0 ? row.metrics.leads : (row.metrics.purchases === 0 ? row.metrics.results : 0);
                        return effLeads > 0 
                          ? (row.metrics.spend / effLeads).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                          : "—";
                      })()}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Mensagens</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {(row.metrics.leads > 0 ? row.metrics.leads : (row.metrics.purchases === 0 ? row.metrics.results : 0)).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Compras</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">{row.metrics.purchases.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Visualiz.</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.impressions > 999 ? `${(row.metrics.impressions / 1000).toFixed(1)}k` : row.metrics.impressions.toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Tablet+: tabela clássica ── */}
          <div className="hidden sm:block overflow-x-auto text-left">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/5 pb-3">
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 pl-2">Conta / Cliente</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3">Status</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Alcance</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Visualizações</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Mensagens</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">CPL</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Compras</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Investido</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 pr-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedAccounts.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => { setSelectedAccountId(row.id); setSelectedClientId("all"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className={`group hover:bg-white/[0.03] transition-colors cursor-pointer ${selectedAccountId === row.id ? "bg-primary/10" : ""}`}
                  >
                    <td className="py-4 pl-2">
                      <div className="flex items-center gap-3">
                        {row.client?.logo_url ? (
                          <img src={row.client.logo_url} alt={row.client.name} className="h-8 w-8 rounded-xl object-cover border border-white/10" />
                        ) : (
                          <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-black text-primary">
                            {row.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-foreground group-hover:text-primary transition-colors truncate">{row.name}</p>
                          <p className="text-[9px] text-muted-foreground uppercase tracking-wider mt-0.5">
                            {row.client ? `Cliente: ${row.client.name}` : "Sem cliente vinculado"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 rounded-full ${row.activeCampaignsCount > 0 ? "bg-success shadow-glow-sm animate-pulse" : "bg-muted-foreground/50"}`} />
                        <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {row.activeCampaignsCount > 0 ? `${row.activeCampaignsCount} Ativas` : "Inativo"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.reach.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.impressions.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                      {(row.metrics.leads > 0 ? row.metrics.leads : (row.metrics.purchases === 0 ? row.metrics.results : 0)).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                      {(() => {
                        const effLeads = row.metrics.leads > 0 ? row.metrics.leads : (row.metrics.purchases === 0 ? row.metrics.results : 0);
                        return effLeads > 0 
                          ? (row.metrics.spend / effLeads).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                          : "—";
                      })()}
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.purchases.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-black tabular-nums text-primary">
                      {row.metrics.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-4 pr-2 text-right">
                      <button 
                        onClick={(e) => { e.stopPropagation(); navigate({ to: "/metricas", search: { account: row.id } }); }}
                        title="Ver métricas da conta"
                        className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent transition-all"
                      >
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </motion.div>
      </div>
      </div>
    </div>
  );
}


function StatCard({ label, value, prefix = "", icon: Icon, trend, isPositive, helper, subMetric }: any) {
  const isCurrency = prefix.includes("R$");
  const formatted = typeof value === 'number'
    ? value.toLocaleString('pt-BR', {
        minimumFractionDigits: isCurrency ? 2 : (value % 1 !== 0 ? 2 : 0),
        maximumFractionDigits: isCurrency ? 2 : (value % 1 !== 0 ? 2 : 0),
      })
    : value;

  return (
    <div className="glass-panel card-sport p-5 sm:p-6 relative overflow-hidden group transition hover:border-primary/40 hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.06)] flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3 relative z-10">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 border border-primary/20 text-primary shadow-inner group-hover:bg-primary/20 transition-colors">
            <Icon className="h-5 w-5" />
          </div>
          {trend && (
            <div className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-md border shadow-sm ${isPositive ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-primary bg-primary/10 border-primary/20'}`}>
              {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {trend}
            </div>
          )}
        </div>
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-black mb-1">{label}</p>
          <h4 className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-foreground drop-shadow-sm">
            {prefix}{formatted}
          </h4>
          {helper && (
            <p className="text-[10px] text-muted-foreground/80 mt-1.5 leading-snug">{helper}</p>
          )}
        </div>
      </div>
      {subMetric && (
        <div className="mt-3.5 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono font-bold text-muted-foreground">
          {subMetric}
        </div>
      )}
    </div>
  );
}











