import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Upload, FileText, BarChart3, Settings, ArrowUpRight, Activity,
  Sparkles, Layers, Cpu, Link2, Megaphone, LineChart, Palette, Zap,
  ChevronDown, Globe, Target, TrendingUp, TrendingDown, DollarSign, MousePointer2, Users, Trophy,
  Loader2, Bot, Brain, Clock, ChevronRight, Download, Calendar,
  AlertTriangle, BookOpen, Rocket, GaugeCircle, PieChart as PieChartIcon
} from "lucide-react";

const COLORS = ["#00d4ff", "#9b87f5", "#f97316", "#22c55e", "#ef4444", "#eab308"];
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import { format, subDays, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SyncButton } from "@/components/SyncButton";
import { DateRangePicker } from "@/components/DateRangePicker";
import { PageHeader } from "@/components/PageHeader";
import { useGlobalDate } from "@/contexts/DateContext";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NC Performance Suite" }] }),
  component: Dashboard,
});

const HUB_GROUPS = [
  {
    label: "Núcleo de Performance",
    color: "text-primary",
    items: [
      { to: "/multicanal", icon: BarChart3, title: "Performance Meta", desc: "Visão consolidada multiconas.", tag: "LIVE", tagColor: "bg-success/20 text-success" },
      { to: "/metricas", icon: LineChart, title: "Controle de KPIs", desc: "Análise de tendências e ROAS.", tag: "DATA", tagColor: "bg-primary/20 text-primary" },
    ]
  },
  {
    label: "Operação Estratégica",
    color: "text-violet-600 dark:text-violet-400",
    items: [
      { to: "/campanhas", icon: Megaphone, title: "Gestão de Ads", desc: "Controle total de campanhas.", tag: "OPS", tagColor: "bg-violet-500/20 text-violet-600 dark:text-violet-400" },
      { to: "/upload", icon: Upload, title: "Extração de Dados", highlight: true, desc: "Processamento de planilhas.", tag: "SYNC", tagColor: "bg-amber-500/20 text-amber-500" },
    ]
  },
  {
    label: "Lab & Conversão",
    color: "text-accent",
    items: [
      { to: "/criativos", icon: Palette, title: "Galeria de Criativos", desc: "Análise visual de performance.", tag: "LAB", tagColor: "bg-accent/20 text-accent" },
      { to: "/organizador", icon: Link2, title: "Central de Links", desc: "Link Pages de alta conversão.", tag: "CONV", tagColor: "bg-accent/20 text-accent" },
    ]
  }
];

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [showAccounts, setShowAccounts] = useState(false);
  const [showClients, setShowClients] = useState(false);
  
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

  const { data: performanceData, isLoading: isLoadingPerformance } = useQuery({
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

      let metricsQuery = (supabase as any).from("metrics").select(`
        campaign_id, cost, conversions, impressions, clicks, reach, date,
        campaigns!inner(ad_account_id, client_id, name)
      `).gte('date', prevStartStr).lte('date', endStr);

      if (selectedAccountId !== "all") {
        metricsQuery = metricsQuery.eq("campaigns.ad_account_id", selectedAccountId);
      }
      if (selectedClientId !== "all") {
        metricsQuery = metricsQuery.eq("campaigns.client_id", selectedClientId);
      }

      const { data: metricsData } = await metricsQuery;
      const metrics = metricsData || [];

      const chartMap = new Map();
      const campaignsMap = new Map();
      let currentPeriod = { cost: 0, conversions: 0, clicks: 0, impressions: 0, reach: 0 };
      let previousPeriod = { cost: 0, conversions: 0, clicks: 0, impressions: 0, reach: 0 };

      (metrics || []).forEach((m: any) => {
        if (!m.date) return;
        
        // Comparação robusta de string ISO pura YYYY-MM-DD (livre de fuso horário do navegador)
        const isCurrent = m.date >= startStr && m.date <= endStr;
        const isPrevious = m.date >= prevStartStr && m.date < startStr;
        
        if (isCurrent) {
          const date = m.date;
          const current = chartMap.get(date) || { date, cost: 0, conversions: 0, clicks: 0 };
          current.cost += Number(m.cost || 0);
          current.conversions += Number(m.conversions || 0);
          current.clicks += Number(m.clicks || 0);
          chartMap.set(date, current);

          const campId = m.campaign_id;
          const camp = campaignsMap.get(campId) || { id: campId, name: m.campaigns?.name || "Desconhecida", cost: 0, conversions: 0 };
          camp.cost += Number(m.cost || 0);
          camp.conversions += Number(m.conversions || 0);
          campaignsMap.set(campId, camp);

          currentPeriod.cost += Number(m.cost || 0);
          currentPeriod.conversions += Number(m.conversions || 0);
          currentPeriod.clicks += Number(m.clicks || 0);
          currentPeriod.impressions += Number(m.impressions || 0);
          currentPeriod.reach += Number(m.reach || m.impressions * 0.8 || 0);
        } else if (isPrevious) {
          previousPeriod.cost += Number(m.cost || 0);
          previousPeriod.conversions += Number(m.conversions || 0);
          previousPeriod.clicks += Number(m.clicks || 0);
          previousPeriod.impressions += Number(m.impressions || 0);
        }
      });

      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const campaignsData = Array.from(campaignsMap.values()).sort((a, b) => b.cost - a.cost);
      
      const barData = campaignsData.slice(0, 8).map(c => ({ name: c.name.slice(0, 16).toUpperCase(), Gasto: c.cost, Resultados: c.conversions }));
      const pieData = campaignsData.filter(c => c.cost > 0).slice(0, 6).map(c => ({ name: c.name, value: c.cost }));

      const calcTrend = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? "+100%" : "0%";
        const diff = ((curr - prev) / prev) * 100;
        return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
      };

      const cplCurr = currentPeriod.conversions > 0 ? currentPeriod.cost / currentPeriod.conversions : 0;
      const cplPrev = previousPeriod.conversions > 0 ? previousPeriod.cost / previousPeriod.conversions : 0;
      const cplTrendVal = cplPrev === 0 ? 0 : ((cplCurr - cplPrev) / cplPrev) * 100;

      const funnelData = [
        { id: "reach", step: "Alcance", value: Math.max(currentPeriod.reach, currentPeriod.impressions * 0.8), fill: "hsl(var(--primary) / 0.5)" },
        { id: "clicks", step: "Cliques", value: currentPeriod.clicks, fill: "hsl(var(--primary) / 0.8)" },
        { id: "convs", step: "Conversões", value: currentPeriod.conversions, fill: "hsl(var(--primary))" }
      ];

      const riskReturn = campaignsData.map(c => {
        const cpa = c.conversions > 0 ? c.cost / c.conversions : c.cost;
        let type = "Estável";
        if (c.conversions === 0 && c.cost > 30) type = "Ralo";
        else if (c.conversions > 0 && cpa > cplCurr * 1.5) type = "Risco";
        else if (c.conversions > 0 && cpa < cplCurr * 0.7) type = "Oportunidade";
        
        return { ...c, cpa, type };
      });

      const opportunities = riskReturn.filter(c => c.type === "Oportunidade").sort((a, b) => a.cpa - b.cpa);
      const risks = riskReturn.filter(c => c.type === "Ralo" || c.type === "Risco").sort((a, b) => b.cost - a.cost);

      let healthScore = 100;
      if (cplTrendVal > 10) healthScore -= 15;
      if (cplTrendVal > 30) healthScore -= 20;
      if (cplTrendVal < 0) healthScore += 10;
      
      const convRate = currentPeriod.clicks > 0 ? currentPeriod.conversions / currentPeriod.clicks : 0;
      if (convRate < 0.01) healthScore -= 10;
      if (opportunities.length === 0 && risks.length > 0) healthScore -= 10;

      healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

      return {
        chartData,
        barData,
        pieData,
        funnelData,
        opportunities,
        risks,
        healthScore,
        totals: currentPeriod,
        trends: {
          cost: calcTrend(currentPeriod.cost, previousPeriod.cost),
          costPositive: currentPeriod.cost > previousPeriod.cost,
          conversions: calcTrend(currentPeriod.conversions, previousPeriod.conversions),
          conversionsPositive: currentPeriod.conversions >= previousPeriod.conversions,
          clicks: calcTrend(currentPeriod.clicks, previousPeriod.clicks),
          clicksPositive: currentPeriod.clicks >= previousPeriod.clicks,
          cpl: `${cplTrendVal > 0 ? '+' : ''}${cplTrendVal.toFixed(1)}%`,
          cplPositive: cplTrendVal <= 0,
        },
        cpl: cplCurr
      };
    },
  });

  // ─── Query: Painel de Situação Operacional ───────────────────────────────────
  const { data: situacao } = useQuery({
    queryKey: ["dash-situacao", selectedAccountId, selectedClientId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const yesterdayDate = new Date(today); yesterdayDate.setDate(today.getDate()-1);
      const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth()+1).padStart(2,'0')}-${String(yesterdayDate.getDate()).padStart(2,'0')}`;

      // Campanhas ativas com delivery_status e orçamento
      let campQuery = (supabase as any).from("campaigns").select("id, name, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, ad_account_id, client_id").eq("status", "active");
      if (selectedAccountId !== "all") campQuery = campQuery.eq("ad_account_id", selectedAccountId);
      if (selectedClientId !== "all") campQuery = campQuery.eq("client_id", selectedClientId);
      const { data: campaigns = [] } = await campQuery;

      // Métricas de ontem + hoje para frequência e spend do dia
      let metricsQuery = (supabase as any).from("metrics").select("campaign_id, frequency, cost, date, conversions, campaigns!inner(ad_account_id, client_id)").gte("date", yesterdayStr).lte("date", todayStr);
      if (selectedAccountId !== "all") metricsQuery = metricsQuery.eq("campaigns.ad_account_id", selectedAccountId);
      if (selectedClientId !== "all") metricsQuery = metricsQuery.eq("campaigns.client_id", selectedClientId);
      
      const { data: recentMetrics = [] } = await metricsQuery;

      // Threshold de frequência configurado
      let threshQuery = (supabase as any).from("alert_thresholds").select("max_frequency, max_cpl").maybeSingle();
      const { data: threshold } = await threshQuery;
      const maxFreq = threshold?.max_frequency ?? 3.5;

      // Agregar métricas por campanha (média de frequência dos últimos 2 dias)
      const metricsByCampaign = new Map<string, { freq: number[], spend: number, conversions: number }>();
      for (const m of recentMetrics) {
        const existing = metricsByCampaign.get(m.campaign_id) || { freq: [], spend: 0, conversions: 0 };
        if (m.frequency > 0) existing.freq.push(Number(m.frequency));
        existing.spend += Number(m.cost || 0);
        existing.conversions += Number(m.conversions || 0);
        metricsByCampaign.set(m.campaign_id, existing);
      }

      // Campanhas em Aprendizado
      const aprendendo = campaigns.filter((c: any) => c.delivery_status === 'LEARNING');

      // Campanhas com frequência alta
      const freqAlta = campaigns.filter((c: any) => {
        const m = metricsByCampaign.get(c.id);
        if (!m || m.freq.length === 0) return false;
        const avgFreq = m.freq.reduce((a: number, b: number) => a + b, 0) / m.freq.length;
        return avgFreq > maxFreq;
      });

      // Budget Pacing — hora atual do dia (0-23) → % do dia decorrida
      const hour = today.getHours();
      const minutesFrac = today.getMinutes() / 60;
      const pctDia = ((hour + minutesFrac) / 24) * 100;

      const pacingDetails = campaigns.filter((c: any) => c.daily_budget > 0).map((c: any) => {
        const m = metricsByCampaign.get(c.id);
        const spendHoje = m?.spend || 0;
        const budget = Number(c.daily_budget);
        const pctGasto = budget > 0 ? (spendHoje / budget) * 100 : 0;
        const diff = pctGasto - pctDia;
        const status = diff > 15 ? "acelerado" : diff < -15 ? "abaixo" : "ritmo";
        return { name: c.name, spendHoje, budget, pctGasto, pctDia, status };
      });

      const emRitmo = pacingDetails.filter((p: any) => p.status === "ritmo").length;
      const acelerado = pacingDetails.filter((p: any) => p.status === "acelerado").length;
      const abaixo = pacingDetails.filter((p: any) => p.status === "abaixo").length;

      // Prontas para escalar: CPL abaixo da média geral + conversões relevantes
      const totalMetricas = Array.from(metricsByCampaign.values());
      const avgCpl = (() => {
        const withConv = totalMetricas.filter(m => m.conversions > 0);
        if (withConv.length === 0) return 0;
        const totalSpend = withConv.reduce((a, m) => a + m.spend, 0);
        const totalConv = withConv.reduce((a, m) => a + m.conversions, 0);
        return totalConv > 0 ? totalSpend / totalConv : 0;
      })();

      const prontas = campaigns.filter((c: any) => {
        const m = metricsByCampaign.get(c.id);
        if (!m || m.conversions < 5) return false;
        const cpl = m.conversions > 0 ? m.spend / m.conversions : Infinity;
        return avgCpl > 0 && cpl < avgCpl * 0.8;
      });

      return {
        aprendendo: aprendendo.length,
        aprendendoNomes: aprendendo.slice(0,3).map((c: any) => c.name),
        freqAlta: freqAlta.length,
        freqAltaNomes: freqAlta.slice(0,3).map((c: any) => c.name),
        pacingOk: emRitmo,
        pacingAcelerado: acelerado,
        pacingAbaixo: abaixo,
        pacingTotal: pacingDetails.length,
        prontas: prontas.length,
        prontasNomes: prontas.slice(0,3).map((c: any) => c.name),
        totalAtivas: campaigns.length,
        pctDia: Math.round(pctDia),
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

      const { data: metricsData } = await (supabase as any)
        .from("daily_metrics")
        .select("ad_account_id, spend, reach, results, impressions, purchases, leads")
        .gte("date", dateFrom)
        .lte("date", dateTo);

      const metricsMap: Record<string, {
        spend: number;
        reach: number;
        results: number;
        impressions: number;
        purchases: number;
        leads: number;
      }> = {};

      for (const row of (metricsData || [])) {
        const key = row.ad_account_id;
        if (!metricsMap[key]) {
          metricsMap[key] = { spend: 0, reach: 0, results: 0, impressions: 0, purchases: 0, leads: 0 };
        }
        metricsMap[key].spend += Number(row.spend || 0);
        metricsMap[key].reach += Number(row.reach || 0);
        metricsMap[key].results += Number(row.results || 0);
        metricsMap[key].impressions += Number(row.impressions || 0);
        metricsMap[key].purchases += Number(row.purchases || 0);
        metricsMap[key].leads += Number(row.leads || 0);
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
    return accountsTableData.filter((acc: any) => acc.activeCampaignsCount > 0 || acc.metrics.spend > 0);
  }, [accountsTableData]);

  const sortedAccounts = useMemo(() => {
    return [...filteredAccounts].sort((a, b) => {
      if (a.activeCampaignsCount > 0 && b.activeCampaignsCount === 0) return -1;
      if (a.activeCampaignsCount === 0 && b.activeCampaignsCount > 0) return 1;
      return b.metrics.spend - a.metrics.spend;
    });
  }, [filteredAccounts]);

  const { data: config } = useQuery({
    queryKey: ["agent-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      return data;
    },
  });

  const { data: synthesis } = useQuery({
    queryKey: ["agent-synthesis"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("agent_memory")
        .select("value, updated_at")
        .eq("key", "strategic_synthesis")
        .maybeSingle();
      return data;
    },
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="w-full p-1 pb-20">
      
      {/* ─── STICKY HEADER AREA ─── */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-3 pt-2 space-y-3 sm:space-y-5">
        
        {/* PageHeader Corporativo Padronizado com Health Score */}
        <div className="flex items-start justify-between gap-2">
          <PageHeader
            eyebrow="Painel Geral"
            title="Command Center"
            description="Visão analítica de performance, tráfego e inteligência artificial da NC Suite."
            compact
          />
          
          {/* Health Score Badge */}
          {performanceData && (
            <div className="flex flex-col items-end pt-1">
              <div className="flex items-center gap-3 bg-card/40 border border-border/50 rounded-2xl p-2.5 pr-4 backdrop-blur-md transition-all hover:bg-card">
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
              </div>
            </div>
          )}
        </div>

        {/* ─── FILTER BAR ESTRUTURADA (UI PREMIUM) ─── */}
        <div className="relative z-50 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between w-full bg-card/45 border border-border/60 rounded-2xl p-3 backdrop-blur-md">
          {/* Filtros à esquerda */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            
            <div className="relative">
              <button 
                onClick={() => { setShowClients(!showClients); setShowAccounts(false); }}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
              >
                <Users className="h-3.5 w-3.5 text-primary" />
                {selectedClientId === "all" ? "Todos os Clientes" : clients.find((c: any) => c.id === selectedClientId)?.name || "Cliente"}
                <ChevronDown className={`h-3 w-3 transition ${showClients ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showClients && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-background/95 p-2 shadow-2xl backdrop-blur-2xl"
                  >
                    <button 
                      onClick={() => { setSelectedClientId("all"); setShowClients(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedClientId === "all" ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                    >
                      <Users className="h-4 w-4" /> Todos os Clientes
                    </button>
                    <div className="my-2 h-px bg-white/5" />
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                      {clients.map((c: any) => (
                        <button 
                          key={c.id}
                          onClick={() => { setSelectedClientId(c.id); setShowClients(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedClientId === c.id ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="relative">
              <button 
                onClick={() => { setShowAccounts(!showAccounts); setShowClients(false); }}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
              >
                {selectedAccountId === "all" ? (
                  <Target className="h-3.5 w-3.5 text-primary" />
                ) : (
                  selectedAccount?.platform === "Google Ads" ? <Globe className="h-3.5 w-3.5 text-[#4285F4]" /> : <Target className="h-3.5 w-3.5 text-primary" />
                )}
                {selectedAccountId === "all" ? "Todas as Contas" : selectedAccount?.name}
                <ChevronDown className={`h-3 w-3 transition ${showAccounts ? "rotate-180" : ""}`} />
              </button>

              <AnimatePresence>
                {showAccounts && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute left-0 top-full z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-background/95 p-2 shadow-2xl backdrop-blur-2xl"
                  >
                    <button 
                      onClick={() => { setSelectedAccountId("all"); setShowAccounts(false); }}
                      className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedAccountId === "all" ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                    >
                      <Globe className="h-4 w-4" /> Todas as Contas
                    </button>
                    <div className="my-2 h-px bg-white/5" />
                    <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                      {accounts.map(acc => (
                        <button 
                          key={acc.id}
                          onClick={() => { setSelectedAccountId(acc.id); setShowAccounts(false); }}
                          className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-[11px] font-bold uppercase tracking-widest transition ${selectedAccountId === acc.id ? "bg-primary/20 text-primary" : "hover:bg-white/5 text-muted-foreground"}`}
                        >
                          <div className="flex items-center justify-center w-4">
                            {acc.platform === "Google Ads" ? (
                              <Globe className={`h-3.5 w-3.5 ${selectedAccountId === acc.id ? 'text-[#4285F4]' : 'text-muted-foreground opacity-50'}`} />
                            ) : (
                              <Target className={`h-3.5 w-3.5 ${selectedAccountId === acc.id ? 'text-primary' : 'text-muted-foreground opacity-50'}`} />
                            )}
                          </div>
                          {acc.name}
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
          </div>

          {/* Divisor vertical em telas grandes */}
          <div className="hidden lg:block h-6 w-px bg-white/10" />

          {/* Ações à direita com espaçamento destacado */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="flex-1 sm:flex-none">
              <SyncButton mode="quick" />
            </div>
            <button 
              onClick={() => navigate({ to: "/relatorios" })}
              className="group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-2.5 text-[11px] sm:text-xs font-black uppercase tracking-widest text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-glow-sm flex-1 sm:flex-none"
            >
              <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-8 bg-white/20" />
              </div>
              <FileText className="h-4 w-4 shrink-0" />
              Gerar Relatório
            </button>
          </div>
        </div>

        {/* Indicador de Ads Conectado */}
        <div className="flex items-center gap-4">
          {config ? (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-800 border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900/50 shadow-glow-sm">
              Ads Conectado
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-800 border border-amber-200 dark:bg-amber-950/70 dark:text-amber-300 dark:border-amber-900/30">
              Sem Integração Ads
            </span>
          )}
        </div>

        {/* ─── PAINEL DE SITUAÇÃO OPERACIONAL ─── */}
        {situacao && situacao.totalAtivas > 0 && (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {/* Campanhas Aprendendo */}
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all cursor-pointer hover:scale-[1.02] ${
                situacao.aprendendo > 0
                  ? "border-amber-500/30 bg-amber-500/[0.07] hover:bg-amber-500/[0.12]"
                  : "border-border/50 bg-card/50"
              }`}
              title={situacao.aprendendoNomes.join(", ") || "Nenhuma campanha em aprendizado"}
              onClick={() => navigate({ to: "/campanhas" })}
            >
              <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${situacao.aprendendo > 0 ? "bg-amber-500/20" : "bg-muted"}`}>
                <BookOpen className={`h-4 w-4 ${situacao.aprendendo > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Aprendendo</p>
                <p className={`text-2xl font-black tabular-nums leading-none mt-1 ${situacao.aprendendo > 0 ? "text-amber-500" : "text-foreground"}`}>
                  {situacao.aprendendo}
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                  {situacao.aprendendo > 0 ? "Não otimizar ainda" : "Tudo estável"}
                </p>
              </div>
              {situacao.aprendendo > 0 && (
                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </motion.div>

            {/* Frequência Alta */}
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all cursor-pointer hover:scale-[1.02] ${
                situacao.freqAlta > 0
                  ? "border-destructive/30 bg-destructive/[0.06] hover:bg-destructive/[0.10]"
                  : "border-border/50 bg-card/50"
              }`}
              title={situacao.freqAltaNomes.join(", ") || "Frequência dentro do limite"}
              onClick={() => navigate({ to: "/campanhas" })}
            >
              <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${situacao.freqAlta > 0 ? "bg-destructive/15" : "bg-muted"}`}>
                <AlertTriangle className={`h-4 w-4 ${situacao.freqAlta > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Freq. Alta</p>
                <p className={`text-2xl font-black tabular-nums leading-none mt-1 ${situacao.freqAlta > 0 ? "text-destructive" : "text-foreground"}`}>
                  {situacao.freqAlta}
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                  {situacao.freqAlta > 0 ? "Saturação iminente" : "Audiência saudável"}
                </p>
              </div>
              {situacao.freqAlta > 0 && (
                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
              )}
            </motion.div>

            {/* Budget Pacing */}
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="group relative flex items-center gap-3 rounded-2xl border border-border/50 bg-card/50 px-4 py-3 transition-all cursor-pointer hover:scale-[1.02] hover:bg-card"
              title={`${situacao.pctDia}% do dia — ${situacao.pacingOk} no ritmo, ${situacao.pacingAcelerado} acelerado, ${situacao.pacingAbaixo} abaixo`}
              onClick={() => navigate({ to: "/campanhas" })}
            >
              <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-success/15">
                <GaugeCircle className="h-4 w-4 text-success" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Budget Pacing</p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  <p className="text-2xl font-black tabular-nums leading-none text-foreground">{situacao.pctDia}%</p>
                  <span className="text-[10px] text-muted-foreground">do dia</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(situacao.pctDia, 100)}%` }} />
                  </div>
                </div>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                  {situacao.pacingOk} ritmo · {situacao.pacingAcelerado} acelerado · {situacao.pacingAbaixo} abaixo
                </p>
              </div>
            </motion.div>

            {/* Prontas para Escalar */}
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className={`group relative flex items-center gap-3 rounded-2xl border px-4 py-3 transition-all cursor-pointer hover:scale-[1.02] ${
                situacao.prontas > 0
                  ? "border-primary/30 bg-primary/[0.06] hover:bg-primary/[0.10]"
                  : "border-border/50 bg-card/50"
              }`}
              title={situacao.prontasNomes.join(", ") || "Nenhuma campanha com CPL ótimo ainda"}
              onClick={() => navigate({ to: "/campanhas" })}
            >
              <div className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center ${situacao.prontas > 0 ? "bg-primary/15" : "bg-muted"}`}>
                <Rocket className={`h-4 w-4 ${situacao.prontas > 0 ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground">Escalar</p>
                <p className={`text-2xl font-black tabular-nums leading-none mt-1 ${situacao.prontas > 0 ? "text-primary" : "text-foreground"}`}>
                  {situacao.prontas}
                </p>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-1">
                  {situacao.prontas > 0 ? "CPL abaixo da média" : "Monitorar mais"}
                </p>
              </div>
              {situacao.prontas > 0 && (
                <div className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              )}
            </motion.div>
          </div>
        )}

        {/* Stats Layer (Dinâmico) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Investimento (30d)" 
          value={performanceData?.totals?.cost ?? 0} 
          prefix="R$ " 
          icon={DollarSign} 
          trend={performanceData?.trends?.cost} 
          isPositive={performanceData?.trends?.costPositive}
          sparklineData={performanceData?.chartData.map(d => d.cost) || []}
        />
        <StatCard 
          label="Conversões (30d)" 
          value={performanceData?.totals?.conversions ?? 0} 
          icon={Trophy} 
          trend={performanceData?.trends?.conversions} 
          isPositive={performanceData?.trends?.conversionsPositive}
          sparklineData={performanceData?.chartData.map(d => d.conversions) || []}
        />
        <StatCard 
          label="CPA Médio (30d)" 
          value={performanceData?.cpl ?? 0} 
          prefix="R$ " 
          icon={Target} 
          trend={performanceData?.trends?.cpl} 
          isPositive={performanceData?.trends?.cplPositive}
          sparklineData={performanceData?.chartData.map(d => d.cost / (d.conversions || 1)) || []}
        />
        <StatCard 
          label="Cliques Úteis (30d)" 
          value={performanceData?.totals?.clicks ?? 0} 
          icon={MousePointer2} 
          trend={performanceData?.trends?.clicks} 
          isPositive={performanceData?.trends?.clicksPositive}
          sparklineData={performanceData?.chartData.map(d => d.clicks) || []}
        />
      </div>
      
      <div className="pt-4 space-y-6">

      {/* HUB DE FUNÇÕES COMPACTO */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-border/50" />
          <span className="chassis-line label-mono text-muted-foreground/38">Módulos Estratégicos</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>
        <div className="flex flex-wrap gap-3 justify-center">
          {HUB_GROUPS.flatMap(g => g.items).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="group relative flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.022] border border-white/5 transition-all hover:bg-white/[0.05] hover:border-primary/20 hover:-translate-y-0.5"
            >
              <item.icon className={`h-4 w-4 ${item.tagColor.split(' ')[1]}`} />
              <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">{item.title}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Data Core: Insights & Charts */}
      <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-panel col-span-2 flex flex-col p-4 sm:p-6 lg:p-8 min-h-[280px] sm:min-h-[380px] lg:min-h-[450px]"
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-base sm:text-xl font-black tracking-tight uppercase">Performance Temporal</h3>
              <p className="text-xs text-muted-foreground font-medium mt-1">Análise volumétrica de investimento e conversão (30d)</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="h-2 w-2 rounded-full bg-primary" /> Invest
              </div>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="h-2 w-2 rounded-full bg-violet-500" /> Conv
              </div>
            </div>
          </div>
          
          <div className="w-full" style={{ height: "clamp(180px, 40vw, 320px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={performanceData?.chartData || []}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(262 83% 74%)" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(262 83% 74%)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
                  tickFormatter={(val) => format(new Date(val), 'dd MMM', { locale: ptBR }).toUpperCase()}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace' }}
                  labelStyle={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: '8px' }}
                />
                <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                <Area type="monotone" dataKey="conversions" stroke="hsl(262 83% 74%)" strokeWidth={3} fillOpacity={1} fill="url(#colorConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* AI Synthesis Box */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel p-4 sm:p-6 lg:p-8 flex flex-col bg-gradient-to-br from-primary/[0.03] to-transparent border-primary/20"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20 shadow-glow-sm">
               <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
               <h3 className="header-sport text-lg font-black tracking-tight uppercase">AI Synthesis</h3>
               <p className="text-[10px] text-muted-foreground font-black tracking-widest uppercase opacity-50">Victoria v2.1 Intelligence</p>
            </div>
          </div>
          
          <div className="flex-1 space-y-6">
            <div className="rounded-2xl bg-white/[0.03] p-5 border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition">
                <Sparkles className="h-12 w-12 text-primary" />
              </div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-3 flex items-center gap-2">
                <Zap className="h-3 w-3 animate-pulse" /> Estratégia em Tempo Real
              </p>
              
              {/* Leitura do agent_memory real da base */}
              {synthesis?.value?.text ? (
                <div className="space-y-2">
                   <p className="text-xs leading-relaxed text-foreground/90 font-medium">
                     {synthesis.value.text}
                   </p>
                   {synthesis.value.action_recommended && (
                     <div className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                        <Target className="h-3 w-3" /> Recomendação: {synthesis.value.action_recommended}
                     </div>
                   )}
                </div>
              ) : (
                <p className="text-xs leading-relaxed text-muted-foreground/80 font-medium">
                  Analisando fluxos de tráfego, breakdowns de conversão e comparativo mensal para gerar o próximo insight estratégico. O agente orquestrador está rodando nos bastidores.
                </p>
              )}

              <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
                  <p className="text-[9px] text-muted-foreground font-bold flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> 
                    {synthesis?.updated_at ? format(new Date(synthesis.updated_at), "dd/MM HH:mm") : "Aguardando Sync"}
                  </p>
                  <span className="text-[9px] font-black text-primary/50 uppercase tracking-tighter">Powered by MCP Agent</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ─── CHARTS ADICIONAIS MULTICANAL E EVOLUCAO ─── */}
      <div className="grid gap-4 sm:gap-6 lg:gap-8 lg:grid-cols-2 2xl:grid-cols-4 mt-4 sm:mt-8">
        {/* Top Campanhas (Barras) */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass-panel p-4 sm:p-6 lg:p-8"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase">Top Campanhas (Gasto)</h3>
              <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">Comparativo de Resultados x Gasto</p>
            </div>
            <BarChart3 className="h-5 w-5 text-primary/50" />
          </div>
          <div className="w-full" style={{ height: "clamp(200px, 45vw, 280px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={performanceData?.barData || []} margin={{ top: 20, right: 0, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 800, fontFamily: 'monospace' }}
                  labelStyle={{ fontSize: '9px', textTransform: 'uppercase', marginBottom: '4px', color: 'hsl(var(--muted-foreground))' }}
                  cursor={{ fill: 'hsl(var(--white) / 0.02)' }}
                />
                <Bar dataKey="Gasto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} barSize={24} />
                <Bar dataKey="Resultados" fill="hsl(262 83% 74%)" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Share de Gasto (Pizza) */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-panel p-4 sm:p-6 lg:p-8"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase">Share de Investimento</h3>
              <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">Distribuição de Verba por Campanha</p>
            </div>
            <PieChartIcon className="h-5 w-5 text-primary/50" />
          </div>
          <div className="w-full relative flex items-center justify-center" style={{ height: "clamp(200px, 45vw, 280px)" }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={performanceData?.pieData || []}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={5}
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
                  formatter={(value: any) => [`R$ ${Number(value).toFixed(2)}`, 'Gasto']}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none flex-col">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</span>
              <span className="text-xl font-black font-mono mt-1 drop-shadow-sm text-foreground">
                R$ {(performanceData?.totals?.cost || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Funil de Conversão */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="glass-panel p-4 sm:p-6 lg:p-8"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase">Funil Global de Tráfego</h3>
              <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">Atrito de Conversão Geral</p>
            </div>
            <Activity className="h-5 w-5 text-primary/50" />
          </div>
          <div className="flex flex-col gap-3 justify-center" style={{ minHeight: "clamp(200px, 45vw, 280px)" }}>
            {performanceData?.funnelData?.map((f: any, idx: number, arr: any[]) => {
              const prev = idx > 0 ? arr[idx-1].value : f.value;
              const drop = prev > 0 ? (f.value / prev) * 100 : 0;
              return (
                <div key={f.id} className="relative flex flex-col gap-1">
                  <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-widest text-muted-foreground px-1">
                    <span>{f.step}</span>
                    <span className="font-mono text-foreground text-sm">{Math.floor(f.value).toLocaleString('pt-BR')}</span>
                  </div>
                  <div className="h-8 rounded-xl bg-white/5 relative overflow-hidden border border-white/5 group">
                    <motion.div 
                      initial={{ width: 0 }} animate={{ width: `${Math.max(drop, 2)}%` }} transition={{ duration: 1, delay: 0.5 + (idx * 0.2) }}
                      className="absolute top-0 left-0 h-full rounded-xl transition-colors"
                      style={{ backgroundColor: f.fill }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-[10px] font-black text-white mix-blend-difference">{drop.toFixed(1)}% de retenção</span>
                    </div>
                  </div>
                  {idx < arr.length - 1 && (
                    <div className="h-4 flex items-center justify-center">
                      <ChevronDown className="h-3 w-3 text-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Risco vs Oportunidade */}
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          className="glass-panel p-4 sm:p-6 lg:p-8"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-xs sm:text-sm font-black tracking-widest uppercase">Risco x Retorno</h3>
              <p className="text-[10px] text-muted-foreground uppercase mt-1 tracking-widest">Avaliação baseada no CPA Médio</p>
            </div>
            <Target className="h-5 w-5 text-primary/50" />
          </div>
          <div className="overflow-y-auto custom-scrollbar pr-2 space-y-4" style={{ height: "clamp(200px, 45vw, 280px)" }}>
            
            {performanceData?.opportunities && performanceData.opportunities.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-success mb-2 flex items-center gap-2"><TrendingUp className="h-3 w-3"/> Oportunidades (Escalar)</p>
                {performanceData.opportunities.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-success/5 border border-success/10 hover:bg-success/10 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-foreground truncate">{c.name}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">R$ {c.cost.toFixed(2)} gasto</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black font-mono text-success">R$ {c.cpa.toFixed(2)}</p>
                      <p className="text-[9px] text-muted-foreground">CPA</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {performanceData?.risks && performanceData.risks.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-destructive mb-2 flex items-center gap-2"><AlertTriangle className="h-3 w-3"/> Ralos de Verba (Pausar)</p>
                {performanceData.risks.map((c: any) => (
                  <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-destructive/5 border border-destructive/10 hover:bg-destructive/10 transition-colors">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-foreground truncate">{c.name}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{c.conversions} conversões</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black font-mono text-destructive">R$ {c.cost.toFixed(2)}</p>
                      <p className="text-[9px] text-muted-foreground">Gasto sem retorno</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {(!performanceData?.opportunities?.length && !performanceData?.risks?.length) && (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground/50">
                <Activity className="h-8 w-8 mb-2 opacity-20" />
                <p className="text-xs">Tudo rodando dentro da média de CPA</p>
              </div>
            )}

          </div>
        </motion.div>
      </div>

      {/* ─── TABELA DE DESEMPENHO DE CONTAS ─── */}
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
              <button
                key={row.id}
                onClick={() => navigate({ to: "/metricas", search: { account: row.id } })}
                className="w-full text-left p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] hover:bg-white/[0.06] transition-all active:scale-[0.98]"
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
                    <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
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
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Resultados</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">{row.metrics.results.toLocaleString('pt-BR')}</p>
                  </div>
                  <div className="bg-white/[0.03] border border-white/5 rounded-xl p-2.5">
                    <p className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">Mensagens</p>
                    <p className="text-xs font-black font-mono text-foreground mt-1">{row.metrics.leads.toLocaleString('pt-BR')}</p>
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
              </button>
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
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Compras</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 text-right">Investido</th>
                  <th className="text-[10px] font-black uppercase tracking-wider text-muted-foreground pb-3 pr-2 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {sortedAccounts.map(row => (
                  <tr
                    key={row.id}
                    onClick={() => navigate({ to: "/metricas", search: { account: row.id } })}
                    className="group hover:bg-white/[0.02] transition-colors cursor-pointer"
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
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.leads.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-bold tabular-nums text-foreground">{row.metrics.purchases.toLocaleString('pt-BR')}</td>
                    <td className="py-4 text-right font-mono text-[11px] font-black tabular-nums text-primary">
                      {row.metrics.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </td>
                    <td className="py-4 pr-2 text-right">
                      <button className="inline-flex items-center justify-center h-6 w-6 rounded-lg bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-transparent transition-all">
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


function StatCard({ label, value, prefix = "", icon: Icon, trend, isPositive }: any) {
  return (
    <div className="glass-panel card-sport p-6 relative overflow-hidden group transition hover:border-primary/30">
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 border border-primary/15 text-primary shadow-inner group-hover:bg-primary/15 transition-colors">
          <Icon className="h-4.5 w-4.5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-background/80 backdrop-blur-md border shadow-xl ${isPositive ? 'text-success border-success/22' : 'text-primary border-primary/22'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-xs uppercase tracking-wider text-muted-foreground font-black mb-1.5">{label}</p>
        <h4 className="text-3xl font-black font-mono tracking-tighter text-foreground drop-shadow-md">
          {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0 }) : value}
        </h4>
      </div>
    </div>
  );
}


