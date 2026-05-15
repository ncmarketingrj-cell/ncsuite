import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  Upload, FileText, BarChart3, Settings, ArrowUpRight, Activity,
  Sparkles, Layers, Cpu, Link2, Megaphone, LineChart, Palette, Zap,
  ChevronDown, Globe, Target, TrendingUp, TrendingDown, DollarSign, MousePointer2, Users, Trophy,
  Loader2, Bot, Brain, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend
} from 'recharts';
import { format, subDays, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NC Performance Suite" }] }),
  component: Dashboard,
});

const HUB_ITEMS = [
  { to: "/multicanal", icon: BarChart3, title: "Performance Meta Ads", desc: "Visão consolidada de campanhas e métricas.", tag: "Core", tagColor: "bg-primary/20 text-primary" },
  { to: "/criativos", icon: Palette, title: "Laboratório de Criativos", desc: "Galeria de criativos e análise de desempenho.", tag: "Lab", tagColor: "bg-secondary/20 text-secondary" },
  { to: "/organizador", icon: Link2, title: "Central de Links", desc: "Crie link pages personalizadas para cada cliente.", tag: "Conversão", tagColor: "bg-accent/20 text-accent" },
  { to: "/metricas", icon: LineChart, title: "Controle de Indicadores", desc: "KPIs, gráficos e análise de tendência.", tag: "Data", tagColor: "bg-primary/20 text-primary" },
  { to: "/integrations", icon: Zap, title: "Integração Meta API", desc: "Sincronize campanhas direto da Graph API.", tag: "API", tagColor: "bg-success/20 text-success" },
  { to: "/campanhas", icon: Megaphone, title: "Gestão de Campanhas", desc: "CRUD completo e controle de budget.", tag: "Ops", tagColor: "bg-secondary/20 text-secondary" },
];

function Dashboard() {
  const { user } = useAuth();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [showAccounts, setShowAccounts] = useState(false);

  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: performanceData, isLoading: isLoadingPerformance } = useQuery({
    queryKey: ["dash-performance", selectedAccountId],
    queryFn: async () => {
      let metricsQuery = supabase.from("metrics").select(`
        *,
        campaigns!inner(ad_account_id, name)
      `);

      if (selectedAccountId !== "all") {
        metricsQuery = metricsQuery.eq("campaigns.ad_account_id", selectedAccountId);
      }

      const { data: metrics } = await metricsQuery.order("date", { ascending: true });
      
      const { data: campaignCounts } = await supabase.from("campaigns").select("id", { count: "exact", head: true });
      const { data: clientCounts } = await supabase.from("clients").select("id", { count: "exact", head: true });
      const { data: reportCounts } = await supabase.from("reports").select("id", { count: "exact", head: true });

      // Group metrics by date for the chart
      const chartMap = new Map();
      let totalCost = 0;
      let totalConversions = 0;
      let totalClicks = 0;
      let totalImpressions = 0;

      (metrics || []).forEach(m => {
        const date = m.date;
        const current = chartMap.get(date) || { date, cost: 0, conversions: 0, clicks: 0 };
        current.cost += Number(m.cost || 0);
        current.conversions += Number(m.conversions || 0);
        current.clicks += Number(m.clicks || 0);
        chartMap.set(date, current);

        totalCost += Number(m.cost || 0);
        totalConversions += Number(m.conversions || 0);
        totalClicks += Number(m.clicks || 0);
        totalImpressions += Number(m.impressions || 0);
      });

      const chartData = Array.from(chartMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      return {
        chartData,
        totals: {
          cost: totalCost,
          conversions: totalConversions,
          clicks: totalClicks,
          impressions: totalImpressions,
          campaigns: campaignCounts?.length || 0,
          clients: clientCounts?.length || 0,
          reports: reportCounts?.length || 0,
          cpl: totalConversions > 0 ? totalCost / totalConversions : 0,
          ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
        }
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
        .select("value")
        .eq("key", "strategic_synthesis")
        .maybeSingle();
      return data?.value as { text: string; generated_at: string };
    },
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="mx-auto max-w-7xl space-y-10 pb-20">
      {/* Header com Seletor Multicontas */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="label-mono text-primary flex items-center gap-2">
            <Globe className="h-3 w-3" /> Gestão Multicontas
          </h2>
          <div className="relative mt-1">
            <button 
              onClick={() => setShowAccounts(!showAccounts)}
              className="flex items-center gap-3 rounded-lg border border-white/10 bg-background/50 px-4 py-2.5 text-sm font-semibold transition hover:border-primary/40 hover:bg-white/5"
            >
              <Target className="h-4 w-4 text-primary" />
              {selectedAccountId === "all" ? "Todas as Contas Meta" : selectedAccount?.name}
              <ChevronDown className={`h-4 w-4 transition ${showAccounts ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showAccounts && (
                <motion.div 
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
                  className="absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-white/10 bg-background/95 p-2 shadow-2xl backdrop-blur-xl"
                >
                  <button 
                    onClick={() => { setSelectedAccountId("all"); setShowAccounts(false); }}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${selectedAccountId === "all" ? "bg-primary/10 text-primary" : "hover:bg-white/5"}`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Todas as Contas
                  </button>
                  <div className="my-1 h-px bg-white/5" />
                  {accounts.map(acc => (
                    <button 
                      key={acc.id}
                      onClick={() => { setSelectedAccountId(acc.id); setShowAccounts(false); }}
                      className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition ${selectedAccountId === acc.id ? "bg-primary/10 text-primary" : "hover:bg-white/5"}`}
                    >
                      <Target className="h-3.5 w-3.5" /> {acc.name}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <AgentStatusBadge config={config} />
          <SyncButton />
          <Link to="/config" className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 transition hover:bg-white/5">
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Investimento Total" 
          value={performanceData?.totals.cost ?? 0} 
          prefix="R$ " 
          icon={DollarSign} 
          trend="+12.5%" 
          isPositive={true}
        />
        <StatCard 
          label="Conversões" 
          value={performanceData?.totals.conversions ?? 0} 
          icon={Trophy} 
          trend="+8.2%" 
          isPositive={true}
        />
        <StatCard 
          label="CPL Médio" 
          value={performanceData?.totals.cpl ?? 0} 
          prefix="R$ " 
          icon={Target} 
          trend="-4.1%" 
          isPositive={true}
        />
        <StatCard 
          label="Cliques" 
          value={performanceData?.totals.clicks ?? 0} 
          icon={MousePointer2} 
          trend="+15.3%" 
          isPositive={true}
        />
      </div>

      {/* Main Content: Charts & Summary */}
      <div className="grid gap-6 lg:grid-cols-3">
        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="glass-panel col-span-2 flex flex-col p-6 min-h-[400px]"
        >
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-bold">Desempenho Temporal</h3>
              <p className="text-xs text-muted-foreground">Investimento vs Conversões nos últimos dias</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold">
                <span className="h-2 w-2 rounded-full bg-primary" /> Investimento
              </div>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold">
                <span className="h-2 w-2 rounded-full bg-secondary" /> Conversões
              </div>
            </div>
          </div>
          
          <div className="flex-1 w-full relative">
            {performanceData?.chartData.length === 0 && !isLoadingPerformance && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center bg-background/20 backdrop-blur-[2px] rounded-xl">
                <BarChart3 className="h-10 w-10 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground font-medium">Nenhum dado de performance disponível.</p>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mt-1">Clique em "Sincronizar Agora" para importar dados do Meta Ads</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={performanceData?.chartData || []}>
                <defs>
                  <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(val) => format(new Date(val), 'dd/MM', { locale: ptBR })}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} fillOpacity={1} fill="url(#colorCost)" />
                <Area type="monotone" dataKey="conversions" stroke="hsl(var(--secondary))" strokeWidth={2} fillOpacity={1} fill="url(#colorConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel p-6 flex flex-col border-primary/20 bg-primary/[0.02]"
        >
          <div className="flex items-center gap-2 mb-4">
            <Brain className="h-4 w-4 text-primary" />
            <h3 className="font-display text-lg font-bold">Insights do Agente</h3>
          </div>
          
          <div className="flex-1 space-y-4">
            <div className="rounded-xl bg-background/50 p-4 border border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-2">Resumo Executivo (3s)</p>
              <p className="text-xs leading-relaxed text-foreground/90 italic">
                {synthesis?.text || "O agente está analisando os últimos ciclos de tráfego para gerar uma síntese estratégica..."}
              </p>
              {synthesis?.generated_at && (
                <p className="text-[9px] text-muted-foreground mt-3 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Gerado {format(new Date(synthesis.generated_at), "dd/MM HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <SummaryItem label="Campanhas Ativas" value={performanceData?.totals.campaigns ?? 0} icon={Megaphone} />
              <SummaryItem label="Clientes Ativos" value={performanceData?.totals.clients ?? 0} icon={Users} />
              <SummaryItem label="CPA Médio" value={`R$ ${performanceData?.totals.cpl.toFixed(2) ?? 0}`} icon={Target} />
            </div>
          </div>

          <div className="mt-auto pt-6 border-t border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-muted-foreground">Saúde da Operação</span>
              <span className="text-xs font-bold text-success">98%</span>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }} animate={{ width: '98%' }}
                className="h-full bg-gradient-to-r from-primary to-secondary"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Hub modules — 6 cards */}
      <section>
        <p className="label-mono mb-4 text-primary flex items-center gap-2">
          <Sparkles className="h-3 w-3" /> Ecossistema NC
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_ITEMS.map((m, i) => (
            <motion.div
              key={m.to + m.title}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={m.to}
                className="glass-panel group relative block h-full overflow-hidden p-6 transition hover:scale-[1.02]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 transition group-hover:bg-primary group-hover:text-primary-foreground">
                    <m.icon className="h-5 w-5" />
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.tagColor}`}>{m.tag}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-bold">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
                <ArrowUpRight className="absolute right-5 bottom-5 h-4 w-4 text-muted-foreground transition group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-primary" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

import { SyncButton } from "@/components/SyncButton";

function AgentStatusBadge({ config }: { config: any }) {
  const isOnline = config?.last_heartbeat_status === "success";
  return (
    <Link to="/agente" className="flex items-center gap-2 rounded-full border border-white/10 bg-background/50 px-3 py-1.5 transition hover:bg-white/5">
      <div className="relative">
        <Bot className={`h-4 w-4 ${isOnline ? "text-primary" : "text-muted-foreground"}`} />
        {isOnline && (
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
        )}
      </div>
      <div className="hidden flex-col items-start leading-none sm:flex">
        <span className="text-[10px] font-bold uppercase tracking-tighter text-muted-foreground">Agente IA</span>
        <span className={`text-[9px] font-black ${isOnline ? "text-primary" : "text-muted-foreground"}`}>
          {isOnline ? "OPERANDO" : "OFFLINE"}
        </span>
      </div>
    </Link>
  );
}

function StatCard({ label, value, prefix = "", icon: Icon, trend, isPositive }: any) {
  return (
    <motion.div 
      whileHover={{ y: -4 }}
      className="glass-panel p-5 relative overflow-hidden"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">{label}</p>
        <h4 className="text-2xl font-bold font-display">
          {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0 }) : value}
        </h4>
      </div>
      <div className="absolute -right-4 -bottom-4 h-16 w-16 bg-primary/5 rounded-full blur-2xl" />
    </motion.div>
  );
}

function SummaryItem({ label, value, icon: Icon }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}

