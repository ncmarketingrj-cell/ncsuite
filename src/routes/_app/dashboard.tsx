import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Upload, FileText, BarChart3, Settings, ArrowUpRight, Activity,
  Sparkles, Layers, Cpu, Link2, Megaphone, LineChart, Palette, Zap,
  ChevronDown, Globe, Target, TrendingUp, TrendingDown, DollarSign, MousePointer2, Users, Trophy,
  Loader2, Bot, Brain, Clock, ChevronRight, Download, Calendar,
  AlertTriangle, BookOpen, Rocket, GaugeCircle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
import { format, subDays, isAfter } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { SyncButton } from "@/components/SyncButton";
import { DateRangePicker } from "@/components/DateRangePicker";

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
  const [showAccounts, setShowAccounts] = useState(false);
  
  // Período de data flexível personalizado (Padrão: últimos 30 dias)
  const [dateRange, setDateRange] = useState<{ startDate: Date; endDate: Date }>({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: performanceData, isLoading: isLoadingPerformance } = useQuery({
    queryKey: ["dash-performance-custom", selectedAccountId, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const diffTime = Math.abs(dateRange.endDate.getTime() - dateRange.startDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      // Helper para formatar a data local como YYYY-MM-DD de forma segura
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      const prevStartStr = getLocalDateStr(subDays(dateRange.startDate, diffDays));

      let metricsQuery = (supabase as any).from("metrics").select(`
        campaign_id, cost, conversions, impressions, clicks, reach, date,
        campaigns!inner(ad_account_id, name)
      `).gte('date', prevStartStr).lte('date', endStr);

      if (selectedAccountId !== "all") {
        metricsQuery = metricsQuery.eq("campaigns.ad_account_id", selectedAccountId);
      }

      const { data: metricsData } = await metricsQuery;
      const metrics = metricsData || [];

      const chartMap = new Map();
      let currentPeriod = { cost: 0, conversions: 0, clicks: 0, impressions: 0 };
      let previousPeriod = { cost: 0, conversions: 0, clicks: 0, impressions: 0 };

      (metrics || []).forEach(m => {
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

          currentPeriod.cost += Number(m.cost || 0);
          currentPeriod.conversions += Number(m.conversions || 0);
          currentPeriod.clicks += Number(m.clicks || 0);
          currentPeriod.impressions += Number(m.impressions || 0);
        } else if (isPrevious) {
          previousPeriod.cost += Number(m.cost || 0);
          previousPeriod.conversions += Number(m.conversions || 0);
          previousPeriod.clicks += Number(m.clicks || 0);
          previousPeriod.impressions += Number(m.impressions || 0);
        }
      });

      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      const calcTrend = (curr: number, prev: number) => {
        if (prev === 0) return curr > 0 ? "+100%" : "0%";
        const diff = ((curr - prev) / prev) * 100;
        return `${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`;
      };

      const cplCurr = currentPeriod.conversions > 0 ? currentPeriod.cost / currentPeriod.conversions : 0;
      const cplPrev = previousPeriod.conversions > 0 ? previousPeriod.cost / previousPeriod.conversions : 0;
      const cplTrendVal = cplPrev === 0 ? 0 : ((cplCurr - cplPrev) / cplPrev) * 100;

      return {
        chartData,
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
    queryKey: ["dash-situacao", selectedAccountId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
      const yesterdayDate = new Date(today); yesterdayDate.setDate(today.getDate()-1);
      const yesterdayStr = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth()+1).padStart(2,'0')}-${String(yesterdayDate.getDate()).padStart(2,'0')}`;

      // Campanhas ativas com delivery_status e orçamento
      let campQuery = (supabase as any).from("campaigns").select("id, name, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, ad_account_id").eq("status", "active");
      if (selectedAccountId !== "all") campQuery = campQuery.eq("ad_account_id", selectedAccountId);
      const { data: campaigns = [] } = await campQuery;

      // Métricas de ontem + hoje para frequência e spend do dia
      let metricsQuery = (supabase as any).from("metrics").select("campaign_id, frequency, cost, date, conversions").gte("date", yesterdayStr).lte("date", todayStr);
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
    <div className="mx-auto max-w-[1600px] p-1 pb-20">
      
      {/* ─── STICKY HEADER AREA ─── */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl border-b border-white/5 pb-4 pt-2 space-y-5">
        {/* Top Bar: Seletor & Global Actions */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between pb-2">
          <div>
            <h1 className="text-4xl font-black tracking-tighter text-gradient mb-2 uppercase">Command Center</h1>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <button 
                  onClick={() => setShowAccounts(!showAccounts)}
                  className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
                >
                  <Target className="h-3.5 w-3.5 text-primary" />
                  {selectedAccountId === "all" ? "Todas as Contas Meta" : selectedAccount?.name}
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
                            <div className={`h-1.5 w-1.5 rounded-full ${selectedAccountId === acc.id ? 'bg-primary animate-pulse' : 'bg-white/10'}`} />
                            {acc.name}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* 📅 SELETOR DE PERÍODO PERSONALIZADO PREMIUM */}
              <DateRangePicker 
                startDate={dateRange.startDate} 
                endDate={dateRange.endDate} 
                onChange={(start, end) => setDateRange({ startDate: start, endDate: end })} 
              />

              <SyncButton mode="quick" />
              
              {/* NOVO: Botão Gerar Relatório */}
              <button 
                onClick={() => navigate({ to: "/relatorios" })}
                className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-primary/10 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-primary transition-all hover:bg-primary hover:text-primary-foreground hover:shadow-[0_0_20px_rgba(var(--primary),0.4)]"
              >
                <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(100%)]">
                  <div className="relative h-full w-8 bg-white/20" />
                </div>
                <FileText className="h-4 w-4" />
                Gerar Relatório
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {config ? (
              <span className="inline-flex items-center rounded-full bg-success/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-success border border-success/30 shadow-glow-sm">
                Ads Conectado
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-amber-500 border border-amber-500/30">
                Sem Integração Ads
              </span>
            )}
          </div>
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
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Aprendendo</p>
                <p className={`text-xl font-black tabular-nums leading-none mt-0.5 ${situacao.aprendendo > 0 ? "text-amber-500" : "text-foreground"}`}>
                  {situacao.aprendendo}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
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
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Freq. Alta</p>
                <p className={`text-xl font-black tabular-nums leading-none mt-0.5 ${situacao.freqAlta > 0 ? "text-destructive" : "text-foreground"}`}>
                  {situacao.freqAlta}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
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
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Budget Pacing</p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <p className="text-xl font-black tabular-nums leading-none text-foreground">{situacao.pctDia}%</p>
                  <span className="text-[9px] text-muted-foreground">do dia</span>
                </div>
                <div className="flex gap-2 mt-1.5">
                  <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full bg-success transition-all" style={{ width: `${Math.min(situacao.pctDia, 100)}%` }} />
                  </div>
                </div>
                <p className="text-[9px] text-muted-foreground mt-0.5">
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
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Escalar</p>
                <p className={`text-xl font-black tabular-nums leading-none mt-0.5 ${situacao.prontas > 0 ? "text-primary" : "text-foreground"}`}>
                  {situacao.prontas}
                </p>
                <p className="text-[9px] text-muted-foreground mt-0.5">
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

      {/* HUB DE FUNÇÕES */}
      <section className="space-y-6">
        {/* Divisor chassis-line */}
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-border/50" />
          <span className="chassis-line label-mono text-muted-foreground/38">Hub de Módulos Estratégicos</span>
          <div className="h-px flex-1 bg-border/50" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HUB_GROUPS.map((group) => (
            <div key={group.label} className="space-y-4">
              {/* Título de grupo com acento esportivo */}
              <h3 className={`header-sport text-[10px] font-black uppercase tracking-widest ${group.color}`}>
                {group.label}
              </h3>
              <div className="grid gap-3">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="card-sport group relative flex items-center gap-4 p-4 rounded-2xl bg-white/[0.022] border border-white/5 transition-all hover:bg-white/[0.05] hover:border-primary/20 hover:translate-x-1"
                  >
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${item.tagColor} ring-1 ring-white/10 group-hover:scale-110 group-hover:shadow-glow-sm`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{item.title}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.tagColor}`}>{item.tag}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-all group-hover:scale-110" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Data Core: Insights & Charts */}
      <div className="grid gap-8 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-panel col-span-2 flex flex-col p-8 min-h-[450px]"
        >
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h3 className="header-sport text-xl font-black tracking-tight uppercase">Performance Temporal</h3>
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
          
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height={320}>
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
          className="glass-panel p-8 flex flex-col bg-gradient-to-br from-primary/[0.03] to-transparent border-primary/20"
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
      </div>
      </div>

    </div>
  );
}


function StatCard({ label, value, prefix = "", icon: Icon, trend, isPositive, sparklineData = [] }: any) {
  const max = Math.max(...(sparklineData.length ? sparklineData : [1]), 0.1);
  const min = Math.min(...(sparklineData.length ? sparklineData : [0]));
  const range = max - min || 1;
  
  const points = sparklineData.map((val: number, i: number) => 
    `${(i / (sparklineData.length - 1 || 1)) * 100},${100 - ((val - min) / range) * 90 - 5}`
  ).join(" ");

  return (
    <div className="glass-panel card-sport p-5 relative overflow-hidden group transition hover:border-primary/30">
      {/* Sparkline de fundo */}
      <div className="absolute inset-x-0 bottom-0 h-20 opacity-20 pointer-events-none">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {points && (
             <polyline points={points} fill="none" stroke={isPositive ? "hsl(var(--success))" : "hsl(var(--primary))"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
          {points && (
             <polygon points={`0,100 ${points} 100,100`} fill={isPositive ? "hsl(var(--success))" : "hsl(var(--primary))"} opacity="0.1" />
          )}
        </svg>
      </div>
      {/* NC corner mark */}
      <div className="absolute top-2.5 right-3 font-display font-black text-[8px] tracking-wider text-primary/18 select-none pointer-events-none">NC</div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/15 text-primary shadow-inner group-hover:bg-primary/15 transition-colors">
          <Icon className="h-4 w-4" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-background/80 backdrop-blur-md border shadow-xl ${isPositive ? 'text-success border-success/22' : 'text-primary border-primary/22'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="kpi-tag mb-2">{label}</p>
        <h4 className="text-3xl font-black font-mono tracking-tighter text-foreground drop-shadow-md">
          {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0 }) : value}
        </h4>
      </div>
    </div>
  );
}


