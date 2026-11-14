import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  EVENT_MODEL_VERSION,
  classifyMetaEvent,
  computeAccountMessageSummary,
  computeCampaignBudgetDistribution,
  computeUnitCost,
  emptyMetricVector,
  accumulateMetricVector,
  formatMetricVectorSummary,
  type RawCampaignMetricRow,
} from "@/lib/metricsDomain";
import {
  buildMetaSnapshotKey,
  DEFAULT_META_TIMEZONE,
  useActiveMetaSnapshot,
} from "@/lib/metaSnapshotCache";
import { SnapshotStatusBadge } from "@/components/SnapshotStatusBadge";
import { useAutoSyncStatus } from "@/hooks/useAutoSync";
import { useState, useMemo, useRef, useEffect } from "react";
import {
  FileText, BarChart3, ArrowUpRight, Activity, Layers,
  ChevronDown, Globe, Target, TrendingUp, TrendingDown, DollarSign, MousePointer2, Users, Trophy, Coins,
  Loader2, GaugeCircle, PieChart as PieChartIcon, Sparkles, Eye, HelpCircle, CheckCircle2,
  AlertCircle, ArrowRight, Zap, Award, X, MessageCircle
} from "lucide-react";
import { classifyCampaignType } from "./cockpit";

const COLORS = ["#ef4444", "#3b82f6", "#10b981", "#8b5cf6", "#f59e0b", "#06b6d4", "#ec4899", "#14b8a6"];
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

function CustomPieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const data = payload[0]?.payload;
    if (!data) return null;
    return (
      <div className="rounded-xl border border-white/10 bg-popover/95 backdrop-blur-md px-3.5 py-2.5 shadow-2xl z-50 pointer-events-none text-left max-w-[260px]">
        <p className="text-xs font-bold text-popover-foreground truncate">{data.name}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono font-black text-primary">
            R$ {Number(data.value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] font-mono text-muted-foreground font-bold">
            • {(data.percentage ?? 0).toFixed(1)}%
          </span>
        </div>
        {data.isOtherSlice && (
          <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-0.5 text-[10px] text-muted-foreground">
            <p className="font-mono font-bold text-foreground">
              {data.groupedCampaignsCount} {data.groupedCampaignsCount === 1 ? "campanha agrupada" : "campanhas agrupadas"}
            </p>
            <p className="leading-snug text-muted-foreground/90">
              Critério: {data.groupingCriteria || "Campanhas com gasto > 0 no período fora do Top 7"}
            </p>
          </div>
        )}
        {data.conversions > 0 && (
          <p className="text-[10px] text-emerald-400 font-mono mt-0.5">
            {data.conversions} {data.conversions === 1 ? 'resultado' : 'resultados'}
          </p>
        )}
      </div>
    );
  }
  return null;
}

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
    refetchInterval: 3 * 60 * 1000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const activeSnapshot = useActiveMetaSnapshot({ accountId: selectedAccountId });
  const { isSyncing: isAutoSyncing } = useAutoSyncStatus();

  const { data: performanceData, isLoading: isLoadingPerf, isFetching: isFetchingPerf } = useQuery({
    queryKey: buildMetaSnapshotKey("dash-performance-custom", {
      accountId: selectedAccountId,
      dateFrom,
      dateTo,
      timezone: DEFAULT_META_TIMEZONE,
      level: selectedAccountId === "all" ? "account" : "campaign",
      snapshotId: activeSnapshot.snapshotId,
      eventModelVersion: EVENT_MODEL_VERSION,
    }, [selectedClientId]),
    refetchInterval: 3 * 60 * 1000, // Atualização automática em tempo real a cada 3 min
    refetchIntervalInBackground: true,
    staleTime: 30 * 1000,
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
      let campQ = (supabase as any).from("campaigns").select("id, name, objective, status, ad_account_id, client_id");
      if (selectedAccountId !== "all") {
        campQ = campQ.eq("ad_account_id", selectedAccountId);
      }
      if (selectedClientId !== "all") {
        campQ = campQ.eq("client_id", selectedClientId);
      }
      const { data: campsList } = await campQ;
      const campaignsMap = new Map();
      const campIds = (campsList || []).map((c: any) => {
        campaignsMap.set(c.id, {
          id: c.id,
          name: c.name || "Desconhecida",
          objective: c.objective,
          status: c.status,
          adAccountId: c.ad_account_id,
          cost: 0,
          results: 0,
          trueConversions: 0,
          reach: 0,
          impressions: 0,
          clicks: 0,
        });
        return c.id;
      });

      // Se filtrou por conta ou cliente e não encontrou nenhuma campanha
      if ((selectedAccountId !== "all" || selectedClientId !== "all") && campIds.length === 0) {
        return {
          chartData: [],
          barData: [],
          pieData: [],
          budgetDistribution: computeCampaignBudgetDistribution([], 7),
          campaignsRanked: [],
          bestDay: null,
          avgDailyCost: 0,
          healthScore: 100,
          metricVector: emptyMetricVector(),
          totals: { cost: 0, conversionSpend: 0, conversions: 0, trueConversions: 0, results: 0, clicks: 0, inlineLinkClicks: 0, allClicks: 0, impressions: 0, reach: 0, accountReach: 0 },
          trends: { cost: "0%", costPositive: true, conversions: "0%", conversionsPositive: true, clicks: "0%", clicksPositive: true, cpl: "0%", cplPositive: true },
          cpl: 0
        };
      }

      const fetchMetricsPaged = async (selectCols: string) => {
        const allRows: any[] = [];
        let from = 0;
        const pageSize = 1000;
        while (from < 15000) {
          let q = (supabase as any)
            .from("metrics")
            .select(selectCols)
            .gte("date", prevStartStr)
            .lte("date", endStr)
            .range(from, from + pageSize - 1);
          if (campIds.length > 0 && (selectedAccountId !== "all" || selectedClientId !== "all")) {
            q = q.in("campaign_id", campIds);
          }
          const { data, error } = await q;
          if (error) return { data: null as any, error };
          if (!data || data.length === 0) break;
          allRows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return { data: allRows, error: null };
      };

      ensureDatabaseCalibrated(supabase).catch(() => {});
      let metricsRes = await fetchMetricsPaged(`
        campaign_id, cost, conversions, impressions, clicks, inline_link_clicks, all_clicks, reach, date, result_type, optimization_goal, result_indicator,
        campaigns(ad_account_id, client_id, name, objective)
      `);
      if (metricsRes.error) {
        metricsRes = await fetchMetricsPaged(`
          campaign_id, cost, conversions, impressions, clicks, reach, date, result_type,
          campaigns(ad_account_id, client_id, name, objective)
        `);
      }
      const metricsData = metricsRes.data || [];
      const metrics = (metricsData || []).map((m: any) =>
        calibrateCampaignMetricsArray(m.campaigns?.name || "", [m])[0] || m
      );

      let accountReach = 0;
      if (selectedAccountId !== "all" && selectedClientId === "all") {
        try {
          const { data: accPeriod } = await (supabase as any)
            .from("meta_account_period_stats")
            .select("reach")
            .eq("ad_account_id", selectedAccountId)
            .eq("start_date", startStr)
            .eq("end_date", endStr)
            .maybeSingle();
          if (accPeriod?.reach) accountReach = Number(accPeriod.reach);
        } catch {
          // Tabela opcional antes da migration
        }
      }

      const chartMap = new Map();
      const metricVector = emptyMetricVector();
      let currentPeriod = {
        cost: 0,
        conversionSpend: 0,
        results: 0,
        trueConversions: 0,
        clicks: 0,
        inlineLinkClicks: 0,
        allClicks: 0,
        impressions: 0,
        reach: 0,
      };
      let previousPeriod = {
        cost: 0,
        conversionSpend: 0,
        results: 0,
        trueConversions: 0,
        clicks: 0,
        inlineLinkClicks: 0,
        allClicks: 0,
        impressions: 0,
      };

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

        const objective = (m.campaigns?.objective || "").toUpperCase();
        const evClass = classifyMetaEvent({
          campaignName: m.campaigns?.name || "",
          rawObjective: objective,
          optimizationGoal: m.optimization_goal,
          resultType: m.result_type,
          resultsIndicator: m.result_indicator,
        });
        const isConversionGoal = evClass.isConversionGoal;
        const isVanity = !isConversionGoal;
        const linkClk = Number(m.inline_link_clicks !== undefined && m.inline_link_clicks !== null ? m.inline_link_clicks : m.clicks || 0);
        const totalClk = Number(m.all_clicks !== undefined && m.all_clicks !== null ? m.all_clicks : m.clicks || 0);
        const rowConv = Number(m.conversions || 0);

        if (isCurrent) {
          const date = m.date;
          const current = chartMap.get(date) || { date, cost: 0, conversions: 0, clicks: 0 };
          current.cost += Number(m.cost || 0);
          current.conversions += isVanity ? 0 : rowConv;
          current.clicks += linkClk;
          chartMap.set(date, current);

          accumulateMetricVector(
            metricVector,
            evClass.category as any,
            evClass.category === "REACH" ? Math.max(Number(m.reach || 0), rowConv) : rowConv,
            m.result_indicator || evClass.primaryMetric
          );

          const campId = m.campaign_id;
          const camp = campaignsMap.get(campId) || {
            id: campId,
            name: m.campaigns?.name || "Desconhecida",
            objective,
            optimizationGoal: m.optimization_goal || "",
            resultType: m.result_type || "",
            resultIndicator: m.result_indicator || "",
            classification: evClass,
            cost: 0,
            results: 0,
            trueConversions: 0,
            reach: 0,
            impressions: 0,
            clicks: 0,
          };
          if (!camp.resultIndicator && m.result_indicator) camp.resultIndicator = m.result_indicator;
          if (!camp.optimizationGoal && m.optimization_goal) camp.optimizationGoal = m.optimization_goal;
          if (evClass.confidence === "high" && camp.classification?.confidence !== "high") camp.classification = evClass;
          camp.cost += Number(m.cost || 0);
          camp.results += evClass.category === "REACH" ? Math.max(Number(m.reach || 0), rowConv) : rowConv;
          if (!isVanity) camp.trueConversions += rowConv;
          camp.reach = (camp.reach || 0) + Number(m.reach || 0);
          camp.impressions = (camp.impressions || 0) + Number(m.impressions || 0);
          camp.clicks = (camp.clicks || 0) + linkClk;
          campaignsMap.set(campId, camp);

          currentPeriod.cost += Number(m.cost || 0);
          if (!isVanity) currentPeriod.conversionSpend += Number(m.cost || 0);
          currentPeriod.results += rowConv;
          if (!isVanity) currentPeriod.trueConversions += rowConv;
          currentPeriod.clicks += linkClk;
          currentPeriod.inlineLinkClicks += linkClk;
          currentPeriod.allClicks += totalClk;
          currentPeriod.impressions += Number(m.impressions || 0);
          currentPeriod.reach += Number(m.reach || 0);
        } else if (isPrevious) {
          previousPeriod.cost += Number(m.cost || 0);
          if (!isVanity) previousPeriod.conversionSpend += Number(m.cost || 0);
          previousPeriod.results += rowConv;
          if (!isVanity) previousPeriod.trueConversions += rowConv;
          previousPeriod.clicks += linkClk;
          previousPeriod.inlineLinkClicks += linkClk;
          previousPeriod.allClicks += totalClk;
          previousPeriod.impressions += Number(m.impressions || 0);
        }
      });

      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const campaignsData = Array.from(campaignsMap.values()).sort((a, b) => b.cost - a.cost);

      const totalSpendPeriod = currentPeriod.cost || 1;
      const campaignsRanked = campaignsData.map(c => {
        const metaEv = c.classification || classifyMetaEvent({
          campaignName: c.name,
          rawObjective: c.objective,
          optimizationGoal: c.optimizationGoal,
          resultType: c.resultType,
          resultsIndicator: c.resultIndicator,
        });
        const classification = {
          ...classifyCampaignType(c.name, "", c.objective),
          typeLabel: metaEv.shortBadge,
          unitSingular: metaEv.unitSingular,
          unitPlural: metaEv.unitPlural,
          category: metaEv.category,
          isLead: metaEv.isConversionGoal,
          isConversionGoal: metaEv.isConversionGoal,
        };
        const cost = c.cost || 0;
        const convCount = metaEv.isConversionGoal ? c.trueConversions : c.results;
        const unitCost = computeUnitCost(cost, convCount, metaEv.category);
        const cpa = unitCost ?? 0;
        const percentage = (cost / totalSpendPeriod) * 100;
        return {
          ...c,
          classification,
          metaClassification: metaEv,
          unitCost,
          cpa,
          percentage,
          conversions: convCount,
        };
      });

      const barData = campaignsRanked.slice(0, 8).map(c => ({ name: c.name.toUpperCase(), Gasto: c.cost, Resultados: c.conversions }));

      const budgetDistribution = computeCampaignBudgetDistribution(campaignsRanked, 7);
      const pieData = budgetDistribution.slices;

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

      const effectiveConvSpend = currentPeriod.conversionSpend > 0 ? currentPeriod.conversionSpend : currentPeriod.cost;
      const effectivePrevConvSpend = previousPeriod.conversionSpend > 0 ? previousPeriod.conversionSpend : previousPeriod.cost;
      const cplCurr = currentPeriod.trueConversions > 0 ? effectiveConvSpend / currentPeriod.trueConversions : 0;
      const cplPrev = previousPeriod.trueConversions > 0 ? effectivePrevConvSpend / previousPeriod.trueConversions : 0;
      const cplTrendVal = cplPrev === 0 ? 0 : ((cplCurr - cplPrev) / cplPrev) * 100;

      const riskReturn = campaignsData.map(c => {
        const isVanityObjective = !(c.classification?.isConversionGoal ?? false);
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
        budgetDistribution,
        campaignsRanked,
        bestDay,
        avgDailyCost,
        healthScore,
        metricVector,
        metricVectorSummary: formatMetricVectorSummary(metricVector),
        totals: { ...currentPeriod, conversions: currentPeriod.trueConversions, accountReach },
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
  const { data: accountsTableData = [], isLoading: isLoadingTable, isFetching: isFetchingTable } = useQuery({
    queryKey: buildMetaSnapshotKey("dashboard-accounts-table-data", {
      accountId: "all",
      dateFrom,
      dateTo,
      timezone: DEFAULT_META_TIMEZONE,
      level: "account",
      snapshotId: activeSnapshot.snapshotId,
      eventModelVersion: EVENT_MODEL_VERSION,
    }),
    refetchInterval: 3 * 60 * 1000, // Atualização automática em tempo real a cada 3 min
    refetchIntervalInBackground: false,
    staleTime: 30 * 1000,
    queryFn: async () => {
      const { data: adAccounts } = await (supabase as any)
        .from("ad_accounts")
        .select("id, name, platform");

      const { data: activeCamps } = await (supabase as any)
        .from("campaigns")
        .select("ad_account_id, name, objective")
        .eq("status", "active");

      const activeCounts: Record<string, number> = {};
      const messagingAccountsSet = new Set<string>();

      for (const c of (activeCamps || [])) {
        activeCounts[c.ad_account_id] = (activeCounts[c.ad_account_id] || 0) + 1;
        // Apenas objetivo oficial da Meta (nunca heurística por nome da campanha)
        if ((c.objective || "").toUpperCase() === "MESSAGES") {
          messagingAccountsSet.add(c.ad_account_id);
        }
      }

      const rawRowsByAccount: Record<string, RawCampaignMetricRow[]> = {};
      const metricsMap: Record<string, {
        spend: number;
        totalAccountSpend: number;
        messageEligibleSpend: number;
        messageResults: number;
        messageCpl: number | null;
        reach: number;
        results: number;
        impressions: number;
        purchases: number;
        leads: number;
      }> = {};

      // 1. Busca paginada em `metrics` com join em `campaigns` (classificação oficial via result_indicator)
      try {
        const allRawMetrics: any[] = [];
        for (let from = 0; from < 10000; from += 1000) {
          const { data: pageRows, error: pageErr } = await (supabase as any)
            .from("metrics")
            .select(`
              cost, conversions, reach, impressions, clicks, inline_link_clicks, all_clicks,
              result_type, optimization_goal, result_indicator, date,
              campaigns!inner(id, ad_account_id, name, objective)
            `)
            .gte("date", dateFrom)
            .lte("date", dateTo)
            .order("id")
            .range(from, from + 999);
          if (pageErr) throw pageErr;
          if (!pageRows || pageRows.length === 0) break;
          allRawMetrics.push(...pageRows);
          if (pageRows.length < 1000) break;
        }

        if (allRawMetrics.length > 0) {
          for (const rawM of allRawMetrics) {
            const key = rawM.campaigns?.ad_account_id;
            if (!key) continue;
            if (!rawRowsByAccount[key]) rawRowsByAccount[key] = [];
            if (!metricsMap[key]) {
              metricsMap[key] = {
                spend: 0,
                totalAccountSpend: 0,
                messageEligibleSpend: 0,
                messageResults: 0,
                messageCpl: null,
                reach: 0,
                results: 0,
                impressions: 0,
                purchases: 0,
                leads: 0,
              };
            }
            const cost = Number(rawM.cost || 0);
            const conversions = Number(rawM.conversions || 0);
            const reach = Number(rawM.reach || 0);
            const impressions = Number(rawM.impressions || 0);
            const clicks = Number(rawM.inline_link_clicks ?? rawM.clicks ?? 0);

            rawRowsByAccount[key].push({
              id: rawM.campaigns?.id || `${key}-${rawRowsByAccount[key].length}`,
              name: rawM.campaigns?.name || "",
              rawObjective: rawM.campaigns?.objective || "",
              optimizationGoal: rawM.optimization_goal || undefined,
              resultType: rawM.result_type || undefined,
              resultsIndicator: rawM.result_indicator || undefined,
              cost,
              conversions,
              clicks,
              inlineLinkClicks: clicks,
              allClicks: Number(rawM.all_clicks ?? rawM.clicks ?? 0),
              impressions,
              reach,
            });

            metricsMap[key].spend += cost;
            metricsMap[key].totalAccountSpend += cost;
            metricsMap[key].reach += reach;
            metricsMap[key].impressions += impressions;
            metricsMap[key].results += conversions;

            const evAcc = classifyMetaEvent({
              campaignName: rawM.campaigns?.name || "",
              rawObjective: rawM.campaigns?.objective || "",
              optimizationGoal: rawM.optimization_goal,
              resultType: rawM.result_type,
              resultsIndicator: rawM.result_indicator,
            });

            if (evAcc.category === "MESSAGES") {
              messagingAccountsSet.add(key);
            } else if (evAcc.category === "LEADS") {
              metricsMap[key].leads += conversions;
            } else if (evAcc.category === "PURCHASES") {
              metricsMap[key].purchases += conversions;
            }
          }

          // Aplica cálculo estrito de elegibilidade de Mensagens por conta via metricsDomain
          for (const [accKey, accRows] of Object.entries(rawRowsByAccount)) {
            const msgSummary = computeAccountMessageSummary(accRows);
            metricsMap[accKey].totalAccountSpend = msgSummary.totalAccountSpend;
            metricsMap[accKey].spend = msgSummary.totalAccountSpend;
            metricsMap[accKey].messageEligibleSpend = msgSummary.messageEligibleSpend;
            metricsMap[accKey].messageResults = msgSummary.messageResults;
            metricsMap[accKey].messageCpl = msgSummary.messageCpl;
            metricsMap[accKey].leads = msgSummary.messageResults;
            if (msgSummary.hasMessagesCampaigns) {
              messagingAccountsSet.add(accKey);
            }
          }
        }
      } catch (errMetrics) {
        console.warn("[Dashboard] Falha ao consultar metrics joined:", errMetrics);
      }

      // 2. Fallback em daily_metrics apenas para contas sem nenhum registro em metrics (nunca contamina CPL de mensagens)
      try {
        const { data: metricsData } = await (supabase as any)
          .from("daily_metrics")
          .select("ad_account_id, spend, reach, results, impressions, purchases, leads")
          .gte("date", dateFrom)
          .lte("date", dateTo);

        for (const row of (metricsData || [])) {
          const key = row.ad_account_id;
          if (!metricsMap[key]) {
            const rowSpend = Number(row.spend || 0);
            metricsMap[key] = {
              spend: rowSpend,
              totalAccountSpend: rowSpend,
              messageEligibleSpend: 0,
              messageResults: 0,
              messageCpl: null,
              reach: Number(row.reach || 0),
              results: Number(row.results || 0),
              impressions: Number(row.impressions || 0),
              purchases: Number(row.purchases || 0),
              leads: 0,
            };
          } else if (metricsMap[key].reach === 0 && Number(row.reach || 0) > 0) {
            metricsMap[key].reach = Number(row.reach || 0);
          }
        }
      } catch (errDaily) {
        console.warn("[Dashboard] Falha ao consultar daily_metrics:", errDaily);
      }

      // 3. Clientes vinculados às contas
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
        const metrics = metricsMap[acc.id] || {
          spend: 0,
          totalAccountSpend: 0,
          messageEligibleSpend: 0,
          messageResults: 0,
          messageCpl: null,
          reach: 0,
          results: 0,
          impressions: 0,
          purchases: 0,
          leads: 0,
        };
        const activeCampaignsCount = activeCounts[acc.id] || 0;
        const linkedClient = clientMap[acc.id] || null;
        const isMessagingAccount = messagingAccountsSet.has(acc.id);

        return {
          id: acc.id,
          name: acc.name,
          platform: acc.platform,
          activeCampaignsCount,
          client: linkedClient,
          metrics,
          isMessagingAccount,
        };
      });
    }
  });

  const filteredAccounts = useMemo(() => {
    return accountsTableData.filter((acc: any) => {
      // Regra obrigatória: Apenas contas que rodam campanhas de mensagens
      if (!acc.isMessagingAccount) return false;

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
    <div className="w-full max-w-full overflow-x-hidden lg:overflow-x-visible p-1 pb-20">
      
      {/* ─── STICKY HEADER AREA ─── */}
      <div className="sticky top-0 z-40 lg:-mx-1 lg:px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-3 pt-2 space-y-3 sm:space-y-5">
        
        {/* PageHeader Corporativo Padronizado com Health Score */}
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <PageHeader
              eyebrow="Painel Geral"
              title="Command Center"
              description="Visão analítica de performance, tráfego e inteligência artificial da NC Suite."
              compact
            />
          </div>
          
          {/* Health Score Badge → Cockpit */}
          {performanceData && (
            <div className="flex flex-col items-end pt-0.5 sm:pt-1 gap-1 sm:gap-1.5 shrink-0">
              <Link to="/cockpit" className="group flex items-center gap-2 sm:gap-3 bg-card/40 border border-border/50 rounded-2xl p-2 pr-2.5 sm:p-2.5 sm:pr-4 backdrop-blur-md transition-all hover:bg-card hover:border-primary/30 hover:shadow-[0_0_16px_rgba(var(--primary-rgb),0.08)]">
                <div className="relative h-9 w-9 sm:h-10 sm:w-10 flex items-center justify-center shrink-0">
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
                  <span className="absolute text-[10px] sm:text-[11px] font-black">{performanceData.healthScore}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-[8px] sm:text-[9px] font-black uppercase tracking-wider sm:tracking-widest text-muted-foreground whitespace-nowrap">Health Score</p>
                  <p className={`text-[11px] sm:text-xs font-bold mt-0.5 ${performanceData.healthScore >= 80 ? "text-success" : performanceData.healthScore >= 50 ? "text-primary" : "text-destructive"}`}>
                    {performanceData.healthScore >= 80 ? "Excelente" : performanceData.healthScore >= 50 ? "Atenção" : "Crítico"}
                  </p>
                </div>
                <GaugeCircle className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary transition-colors ml-0.5 sm:ml-1 shrink-0" />
              </Link>
              <span className="text-[8px] font-black uppercase tracking-widest sm:tracking-[0.18em] text-muted-foreground/50 group-hover:text-primary/60 transition-colors pr-1 whitespace-nowrap">
                → Cockpit
              </span>
            </div>
          )}
        </div>

        {/* ─── FILTER BAR ESTRUTURADA (UI PREMIUM) ─── */}
        <div className="relative z-50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between w-full bg-card/45 border border-border/60 rounded-2xl p-3 backdrop-blur-md">
          {/* Filtros à esquerda */}
          <div className="flex flex-wrap lg:flex-nowrap items-center gap-2 min-w-0">

            {/* Dropdown fora do overflow para o menu absoluto não ser clippado */}
            <div ref={dropdownRef} className="relative shrink-0">
              <button
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
              >
                {selectedAccountId !== "all" ? (
                  selectedAccount?.platform === "Google Ads" ? <Globe className="h-3.5 w-3.5 text-[#4285F4]" /> : <Target className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Target className="h-3.5 w-3.5 text-primary" />
                )}
                {selectedAccountId !== "all"
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
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedAccountId === "all" ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                    >
                      <Globe className="h-4 w-4" /> Visão Geral
                    </button>
                    <div className="my-2 h-px bg-white/5" />

                    <div className="px-4 py-2 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Por Conta de Anúncio</div>
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
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

            {selectedAccountId !== "all" && (
              <button
                onClick={() => { setSelectedAccountId("all"); setSelectedClientId("all"); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 text-[10px] font-black uppercase tracking-wider text-primary hover:bg-primary/25 transition-all shadow-sm"
                title="Limpar filtro e ver todas as contas"
              >
                <span className="truncate max-w-[140px] sm:max-w-[200px]">
                  Conta: {selectedAccount?.name || "Filtrada"}
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
        <div className="flex flex-wrap items-center justify-between gap-2">
          {(isLoadingTable || isLoadingPerf || isFetchingPerf || isFetchingTable || isAutoSyncing) ? (
            <div className="flex items-center gap-2 text-xs text-primary font-mono">
              <div className="h-3 w-3 rounded-full bg-primary/70 animate-pulse" />
              Atualizando dados...
            </div>
          ) : (
            <div />
          )}
          <SnapshotStatusBadge
            snapshotId={activeSnapshot.snapshotId}
            committedAt={activeSnapshot.committedAt}
            isUpdating={isLoadingTable || isLoadingPerf || isFetchingPerf || isFetchingTable || isAutoSyncing}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Investimento"
          value={performanceData ? performanceData.totals?.cost : null}
          isLoading={!performanceData && (isLoadingPerf || isFetchingPerf)}
          prefix="R$ "
          icon={DollarSign}
          trend={performanceData?.trends?.cost}
          isPositive={performanceData?.trends?.costPositive}
          helper="Verba bruta consumida em anúncios"
          subMetric={
            <span>
              {!performanceData && (isLoadingPerf || isFetchingPerf) ? (
                <span className="text-muted-foreground">Carregando alcance...</span>
              ) : (performanceData?.totals?.accountReach || 0) > 0 ? (
                <>
                  Alcance da conta: <strong className="text-foreground">{Number(performanceData?.totals?.accountReach || 0).toLocaleString('pt-BR')}</strong>
                </>
              ) : (performanceData?.totals?.reach || 0) > 0 ? (
                <>
                  Alcance (soma campanhas): <strong className="text-foreground">{Number(performanceData?.totals?.reach || 0).toLocaleString('pt-BR')}</strong>
                </>
              ) : (
                <>
                  Alcance: <strong className="text-muted-foreground">Indisponível</strong>
                </>
              )}
            </span>
          }
        />
        <StatCard
          label="Conversões"
          value={performanceData ? performanceData.totals?.conversions : null}
          isLoading={!performanceData && (isLoadingPerf || isFetchingPerf)}
          icon={Trophy}
          trend={performanceData?.trends?.conversions}
          isPositive={performanceData?.trends?.conversionsPositive}
          helper="Apenas conversões comerciais diretas (Mensagens, Leads e Compras)"
          subMetric={
            (() => {
              if (!performanceData && (isLoadingPerf || isFetchingPerf)) {
                return <span className="text-muted-foreground">Atualizando dados...</span>;
              }
              const vec = performanceData?.metricVector;
              const secondary: string[] = [];
              if ((vec?.reach ?? 0) > 0) secondary.push(`${vec!.reach.toLocaleString('pt-BR')} alcance`);
              if ((vec?.profileVisits ?? 0) > 0) secondary.push(`${vec!.profileVisits.toLocaleString('pt-BR')} perfil`);
              if ((vec?.landingPageViews ?? 0) > 0) secondary.push(`${vec!.landingPageViews.toLocaleString('pt-BR')} LPV`);
              const linkClk = performanceData?.totals?.inlineLinkClicks ?? performanceData?.totals?.clicks ?? 0;
              if (secondary.length > 0) {
                return <span className="truncate block">Outros obj.: <strong className="text-foreground">{secondary.join(" • ")}</strong></span>;
              }
              return (
                <span>
                  CVR: <strong className="text-primary">{linkClk > 0 ? (((performanceData?.totals?.conversions ?? 0) / linkClk) * 100).toFixed(2) : "0.00"}%</strong> dos cliques no link
                </span>
              );
            })()
          }
        />
        <StatCard
          label="CPA Médio"
          value={performanceData ? performanceData.cpl : null}
          isLoading={!performanceData && (isLoadingPerf || isFetchingPerf)}
          prefix="R$ "
          icon={Target}
          trend={performanceData?.trends?.cpl}
          isPositive={performanceData?.trends?.cplPositive}
          helper="Custo médio sobre investimento elegível de conversão"
          subMetric={
            <span>
              Meta: <strong className="text-emerald-400">R$ 5,00 a R$ 35,00</strong>
            </span>
          }
        />
        <StatCard
          label="Cliques no Link"
          value={performanceData ? (performanceData.totals?.inlineLinkClicks ?? performanceData.totals?.clicks) : null}
          isLoading={!performanceData && (isLoadingPerf || isFetchingPerf)}
          icon={MousePointer2}
          trend={performanceData?.trends?.clicks}
          isPositive={performanceData?.trends?.clicksPositive}
          helper="Cliques no link do anúncio (inline_link_clicks)"
          subMetric={
            <span>
              CTR Link: <strong className="text-indigo-400">{performanceData?.totals?.impressions ? (((performanceData.totals.inlineLinkClicks ?? performanceData.totals.clicks ?? 0) / performanceData.totals.impressions) * 100).toFixed(2) : "—"}%</strong>
              {(performanceData?.totals?.allClicks || 0) > (performanceData?.totals?.inlineLinkClicks || 0) && (
                <> · Todos: <strong className="text-foreground">{Number(performanceData?.totals?.allClicks || 0).toLocaleString('pt-BR')}</strong></>
              )}
            </span>
          }
        />
      </div>
      
      <div className="pt-4 space-y-6">

      {/* ─── RESUMO EXECUTIVO DA CONTA / CONSOLIDADO ─── */}
      {(() => {
        const totals = performanceData?.totals || { cost: 0, clicks: 0, inlineLinkClicks: 0, allClicks: 0, impressions: 0, conversions: 0, reach: 0, accountReach: 0 };
        const linkClk = totals.inlineLinkClicks ?? totals.clicks ?? 0;
        const allClk = totals.allClicks ?? linkClk;
        const ctr = totals.impressions > 0 ? (linkClk / totals.impressions) * 100 : 0;
        const ctrAll = totals.impressions > 0 ? (allClk / totals.impressions) * 100 : 0;
        const cpc = linkClk > 0 ? totals.cost / linkClk : 0;
        const cpcAll = allClk > 0 ? totals.cost / allClk : 0;
        const cpa = performanceData?.cpl || 0;
        const cpm = totals.impressions > 0 ? (totals.cost / totals.impressions) * 1000 : 0;
        const hasAccountReach = (totals.accountReach || 0) > 0;
        const reachVal = hasAccountReach ? totals.accountReach : totals.reach;

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
                  {!performanceData && (isLoadingPerf || isFetchingPerf) ? (
                    "Atualizando dados do snapshot..."
                  ) : totals.cost > 0 ? (
                    <>
                      Investimento de <strong className="text-foreground font-mono">R$ {totals.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong> gerou{" "}
                      <strong className="text-foreground font-mono">{totals.clicks.toLocaleString('pt-BR')} cliques</strong> (CTR de {ctr.toFixed(2)}%) e{" "}
                      <strong className="text-primary font-mono">{totals.conversions} conversas / leads (Meta)</strong>
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
                <span className="text-muted-foreground text-[9px] uppercase tracking-wider block font-sans font-bold">CPC Link</span>
                <span className="font-bold text-foreground">R$ {cpc.toFixed(2)}</span>
                {cpcAll > 0 && (
                  <span className="text-[9px] text-muted-foreground font-mono block">Todos: R$ {cpcAll.toFixed(2)}</span>
                )}
              </div>
              <div className="bg-white/[0.03] border border-white/10 px-3 py-1.5 rounded-xl">
                <span className="text-muted-foreground text-[9px] uppercase tracking-wider block font-sans font-bold">
                  {hasAccountReach ? "Alcance (Conta)" : "Alcance (Soma)"}
                </span>
                <span className="font-bold text-foreground">
                  {reachVal > 0 ? reachVal.toLocaleString('pt-BR') : "—"}
                </span>
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
                  Top Campanhas por Gasto
                </h3>
                <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
                  Ranking por investimento com unidade oficial e eficiência específica de cada objetivo
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

                    {/* Detalhes de Retorno e Custo por Unidade */}
                    <div className="flex items-center justify-between text-[10px] pt-0.5">
                      <span className="text-muted-foreground">
                        Resultado: <strong className="text-foreground font-mono">{Number(camp.conversions || 0).toLocaleString("pt-BR")}</strong>{" "}
                        {camp.metaClassification?.unitPlural || (camp.classification?.isLead ? "conversas/leads" : "resultados")}
                      </span>
                      <span className="font-mono">
                        {camp.unitCost !== null && camp.unitCost !== undefined && camp.conversions > 0 ? (
                          camp.metaClassification?.category === "REACH" ? (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black bg-sky-500/10 text-sky-400 border border-sky-500/20">
                              Custo/1k alc.: R$ {camp.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : camp.metaClassification?.isConversionGoal ? (
                            <span className={`px-2 py-0.5 rounded text-[9px] font-black ${
                              camp.unitCost <= 35 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                              camp.unitCost <= 75 ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                              "bg-red-500/10 text-red-400 border border-red-500/20"
                            }`}>
                              CPA: R$ {camp.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[9px] font-black bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              CPR: R$ {camp.unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground/60 text-[9px] uppercase font-bold bg-white/5 px-2 py-0.5 rounded">
                            Sem entrega de resultado
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
        {(() => {
          const budgetDist =
            performanceData?.budgetDistribution ??
            computeCampaignBudgetDistribution(performanceData?.campaignsRanked || [], 7);
          const pieList = budgetDist.slices;
          const totalSpend = budgetDist.totalSpend;
          const topLeader = budgetDist.leader;
          const top2Share = budgetDist.top2ConcentrationPct;
          const spendingCampaignsCount = budgetDist.spendingCampaigns;
          const deliveringCampaignsCount = budgetDist.deliveringCampaigns;
          const totalConfiguredCampaigns = budgetDist.totalConfiguredCampaigns;
          const avgSpendPerSpendingCamp = budgetDist.averageSpendPerSpendingCampaign;

          return (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="glass-panel p-4 sm:p-6 lg:p-8 min-w-0 flex flex-col justify-between"
              data-testid="budget-distribution-panel"
            >
              <div>
                <div className="mb-4 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase flex items-center gap-2">
                      <PieChartIcon className="h-4 w-4 text-primary" />
                      Distribuição da Verba Publicitária
                    </h3>
                    <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
                      Divisão percentual e financeira do orçamento entre as campanhas com gasto no período
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      data-testid="budget-slices-badge"
                      className="text-[9px] font-black uppercase tracking-wider text-muted-foreground bg-white/5 border border-white/10 px-2 py-1 rounded-lg"
                    >
                      {budgetDist.slicesCount} {budgetDist.slicesCount === 1 ? 'Fatia' : 'Fatias'}
                    </span>
                  </div>
                </div>

                {/* Resumo Explícito de Contagens de Campanhas (Sem ambiguidade) */}
                <div
                  data-testid="budget-campaign-counts-strip"
                  className="mb-4 grid grid-cols-3 gap-2 rounded-xl bg-white/[0.02] border border-white/5 p-2.5 text-[10px]"
                >
                  <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Campanhas com gasto no período
                    </span>
                    <strong data-testid="spending-campaigns-count" className="text-xs sm:text-sm font-black font-mono text-emerald-400 mt-0.5">
                      {spendingCampaignsCount}
                    </strong>
                  </div>
                  <div className="flex flex-col border-l border-white/5 pl-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Campanhas com entrega no período
                    </span>
                    <strong data-testid="delivering-campaigns-count" className="text-xs sm:text-sm font-black font-mono text-blue-400 mt-0.5">
                      {deliveringCampaignsCount}
                    </strong>
                  </div>
                  <div className="flex flex-col border-l border-white/5 pl-2.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                      Campanhas cadastradas
                    </span>
                    <strong data-testid="configured-campaigns-count" className="text-xs sm:text-sm font-black font-mono text-foreground mt-0.5">
                      {totalConfiguredCampaigns}
                    </strong>
                  </div>
                </div>

                {/* Layout Duplo: Donut na Esquerda + Legenda Detalhada na Direita */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-5 h-[230px] sm:h-[250px] relative flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                        <Pie
                          data={pieList}
                          cx="50%"
                          cy="50%"
                          innerRadius="65%"
                          outerRadius="90%"
                          paddingAngle={3}
                          dataKey="value"
                          stroke="hsl(var(--background))"
                          strokeWidth={2}
                        >
                          {pieList.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomPieTooltip />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col z-0 text-center px-2">
                      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total investido</span>
                      <span className="text-base sm:text-lg font-black font-mono mt-0.5 text-foreground">
                        R$ {totalSpend.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[9px] font-mono text-emerald-400/90 mt-0.5 font-bold">
                        {spendingCampaignsCount} com gasto no período
                      </span>
                      <span className="text-[8px] font-mono text-muted-foreground/70">
                        de {totalConfiguredCampaigns} cadastradas
                      </span>
                    </div>
                  </div>

                  {/* Lista Detalhada com Nome, % e R$ com barras de progresso */}
                  <div className="md:col-span-7 space-y-2 max-h-[250px] overflow-y-auto custom-scrollbar pr-1">
                    {pieList.map((item: any, idx: number) => {
                      const pct = item.percentage !== undefined ? item.percentage : ((item.value / (totalSpend || 1)) * 100);
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div
                          key={idx}
                          data-testid={item.isOtherSlice ? "budget-slice-other" : `budget-slice-${idx}`}
                          onClick={() => {
                            if (item.id) {
                              navigate({ to: "/metricas", search: { campaign: item.id } });
                            }
                          }}
                          className={`group p-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-white/10 transition-all ${item.id ? 'cursor-pointer' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className="h-2.5 w-2.5 rounded-full shrink-0 shadow-sm"
                                style={{ backgroundColor: color }}
                              />
                              <div className="min-w-0">
                                <span className="text-xs font-bold text-foreground truncate block max-w-[130px] sm:max-w-[175px] group-hover:text-primary transition-colors">
                                  {item.name}
                                </span>
                                {item.isOtherSlice && (
                                  <span className="text-[9px] text-muted-foreground block leading-tight">
                                    Agrupa {item.groupedCampaignsCount} {item.groupedCampaignsCount === 1 ? "campanha com gasto > 0" : "campanhas com gasto > 0"} fora do Top 7
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0 flex items-center gap-2">
                              <span className="text-xs font-black font-mono text-foreground">
                                {pct.toFixed(1)}%
                              </span>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                R$ {item.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          {/* Mini Barra de Proporção */}
                          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, Math.max(3, pct))}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {pieList.length === 0 && (
                      <div className="text-center py-8 text-xs text-muted-foreground/60">
                        Sem movimentação financeira no período.
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid Estratégico de Alocação de Capital (Preenchimento inteligente do espaço) */}
                <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Card 1: Campanha Líder */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Líder de verba</span>
                      <Trophy className="h-3.5 w-3.5 text-amber-400" />
                    </div>
                    <div className="mt-2">
                      <div data-testid="budget-leader-pct" className="text-sm font-black font-mono text-foreground truncate">
                        {topLeader ? `${topLeader.percentage.toFixed(1)}%` : "—"}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5" title={topLeader?.name || "Nenhuma"}>
                        {topLeader?.name || "Nenhuma campanha com gasto"}
                      </p>
                    </div>
                  </div>

                  {/* Card 2: Média por Campanha com Gasto */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Média por campanha com gasto</span>
                      <Coins className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="mt-2">
                      <div data-testid="budget-avg-per-spending" className="text-sm font-black font-mono text-foreground truncate">
                        {avgSpendPerSpendingCamp !== null
                          ? `R$ ${avgSpendPerSpendingCamp.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : "—"}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {spendingCampaignsCount > 0
                          ? `Em ${spendingCampaignsCount} ${spendingCampaignsCount === 1 ? 'campanha com gasto' : 'campanhas com gasto'}`
                          : "0 campanhas com gasto no período"}
                      </p>
                    </div>
                  </div>

                  {/* Card 3: Concentração Top 2 */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Concentração Top 2</span>
                      <Zap className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="mt-2">
                      <div data-testid="budget-top2-pct" className="text-sm font-black font-mono text-foreground truncate">
                        {spendingCampaignsCount > 0 ? `${top2Share.toFixed(1)}%` : "—"}
                      </div>
                      <p className="text-[10px] font-semibold truncate mt-0.5">
                        {spendingCampaignsCount === 0 ? (
                          <span className="text-muted-foreground">Sem gasto no período</span>
                        ) : top2Share >= 75 ? (
                          <span className="text-amber-400">Alta concentração</span>
                        ) : top2Share >= 45 ? (
                          <span className="text-blue-400">Moderada</span>
                        ) : (
                          <span className="text-emerald-400">Diversificada</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Card 4: Total Investido */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">Total investido</span>
                      <DollarSign className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <div className="mt-2">
                      <div data-testid="budget-total-spend" className="text-sm font-black font-mono text-foreground truncate">
                        R$ {totalSpend.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                        {deliveringCampaignsCount} com entrega • {totalConfiguredCampaigns} cadastradas
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rodapé Executivo de Análise de Verba */}
              <div className="mt-4 pt-3 border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px]">
                <div className="flex items-center gap-1.5 text-muted-foreground min-w-0">
                  <Sparkles className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">
                    {topLeader ? (
                      <>
                        A campanha líder concentra <strong className="text-foreground font-mono">{topLeader.percentage.toFixed(0)}%</strong> da verba entre <strong className="text-foreground font-mono">{spendingCampaignsCount}</strong> campanhas com gasto ({deliveringCampaignsCount} com entrega de {totalConfiguredCampaigns} cadastradas).
                      </>
                    ) : (
                      "Nenhum investimento registrado no período."
                    )}
                  </span>
                </div>
                <button
                  onClick={() => navigate({ to: "/metricas" })}
                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80 font-bold uppercase tracking-wider text-[9px] shrink-0 transition-colors"
                >
                  <span>Ver Métricas</span>
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </motion.div>
          );
        })()}

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
              Desempenho Geral de Contas (Mensagens)
            </h3>
            <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">
              Contas com campanhas ativas de mensagens • Dados consolidados do período
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
            <MessageCircle className="h-8 w-8 mb-2 opacity-20 text-primary" />
            <p className="text-xs">Nenhuma conta com operação ativa de mensagens no período selecionado.</p>
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
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Investido em Mensagens</p>
                    <p className="text-xs font-black font-mono text-primary mt-1">
                      {row.metrics.messageEligibleSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Inv. Total Conta</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.totalAccountSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">CPL de Mensagens</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.messageResults > 0 && row.metrics.messageCpl !== null
                        ? row.metrics.messageCpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) 
                        : "—"}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Mensagens</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.messageResults > 0 ? row.metrics.messageResults.toLocaleString('pt-BR') : "—"}
                    </p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Alcance</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">
                      {row.metrics.reach > 999 ? `${(row.metrics.reach / 1000).toFixed(1)}k` : row.metrics.reach.toLocaleString('pt-BR')}
                    </p>
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
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">MENSAGENS</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">CPL DE MENSAGENS</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">INVESTIDO EM MENSAGENS</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Compras</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">INVESTIMENTO TOTAL DA CONTA</th>
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
                      {row.metrics.messageResults > 0 ? row.metrics.messageResults.toLocaleString('pt-BR') : "—"}
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">
                      {row.metrics.messageResults > 0 && row.metrics.messageCpl !== null
                        ? row.metrics.messageCpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                        : "—"}
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-black tabular-nums text-primary">
                      {row.metrics.messageEligibleSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.purchases.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-muted-foreground">
                      {row.metrics.totalAccountSpend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
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


function StatCard({ label, value, isLoading = false, prefix = "", icon: Icon, trend, isPositive, helper, subMetric }: any) {
  const isCurrency = prefix.includes("R$");
  const isUnavailable = isLoading || value === null || value === undefined;
  const formatted = isUnavailable
    ? "—"
    : typeof value === 'number'
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
          {!isUnavailable && trend && (
            <div className={`flex items-center gap-1 text-[10px] font-black px-2.5 py-1 rounded-lg backdrop-blur-md border shadow-sm ${isPositive ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 'text-primary bg-primary/10 border-primary/20'}`}>
              {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {trend}
            </div>
          )}
        </div>
        <div className="relative z-10">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-black mb-1">{label}</p>
          <h4 className={`text-2xl sm:text-3xl font-black font-mono tracking-tight drop-shadow-sm ${isLoading ? "text-muted-foreground animate-pulse" : "text-foreground"}`}>
            {isUnavailable ? "—" : `${prefix}${formatted}`}
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











