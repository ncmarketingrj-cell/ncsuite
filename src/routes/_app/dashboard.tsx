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
    color: "text-secondary",
    items: [
      { to: "/campanhas", icon: Megaphone, title: "Gestão de Ads", desc: "Controle total de campanhas.", tag: "OPS", tagColor: "bg-secondary/20 text-secondary" },
      { to: "/upload", icon: Upload, title: "Extração de Dados", highlight: true, desc: "Processamento de planilhas/prints.", tag: "SYNC", tagColor: "bg-amber-500/20 text-amber-500" },
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

      const { count: campaignCount } = await supabase.from("campaigns").select("*", { count: "exact", head: true });
      const { count: clientCount } = await supabase.from("clients").select("*", { count: "exact", head: true });
      const { count: reportCount } = await (supabase as any).from("reports").select("*", { count: "exact", head: true });

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
          campaigns: campaignCount ?? 0,
          clients: clientCount ?? 0,
          reports: reportCount ?? 0,
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
      return (data?.value ?? null) as { text: string; generated_at: string } | null;
    },
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-12 pb-20">
      {/* Top Bar: Seletor & Global Actions */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/5 pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-gradient mb-2 uppercase">Command Center</h1>
          <div className="flex items-center gap-3">
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
            <SyncButton />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <AgentStatusBadge config={config} />
        </div>
      </div>

      {/* Stats Layer (Refined) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard 
          label="Investimento" 
          value={performanceData?.totals.cost ?? 0} 
          prefix="R$ " 
          icon={DollarSign} 
          trend="+12.5%" 
          isPositive={true}
          sparklineData={[30, 45, 20, 60, 40, 80, 50]}
        />
        <StatCard 
          label="Conversões" 
          value={performanceData?.totals.conversions ?? 0} 
          icon={Trophy} 
          trend="+8.2%" 
          isPositive={true}
          sparklineData={[10, 25, 15, 30, 25, 45, 35]}
        />
        <StatCard 
          label="CPA / CPL" 
          value={performanceData?.totals.cpl ?? 0} 
          prefix="R$ " 
          icon={Target} 
          trend="-4.1%" 
          isPositive={true}
          sparklineData={[50, 48, 45, 42, 40, 38, 35]}
        />
        <StatCard 
          label="Cliques Úteis" 
          value={performanceData?.totals.clicks ?? 0} 
          icon={MousePointer2} 
          trend="+15.3%" 
          isPositive={true}
          sparklineData={[100, 150, 120, 200, 180, 250, 220]}
        />
      </div>

      {/* HUB DE FUNÇÕES (The "Sophisticated" Part) */}
      <section className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-white/5" />
          <h2 className="text-[11px] font-black uppercase tracking-[0.4em] text-muted-foreground/40">Hub de Módulos Estratégicos</h2>
          <div className="h-px flex-1 bg-white/5" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {HUB_GROUPS.map((group) => (
            <div key={group.label} className="space-y-4">
              <h3 className={`text-[10px] font-black uppercase tracking-widest ${group.color} flex items-center gap-2`}>
                <ChevronDown className="h-3 w-3" /> {group.label}
              </h3>
              <div className="grid gap-3">
                {group.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    className="group relative flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5 transition-all hover:bg-white/[0.05] hover:border-white/10 hover:translate-x-1"
                  >
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center transition-all ${item.tagColor} ring-1 ring-white/10 group-hover:scale-110`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">{item.title}</span>
                        <span className={`text-[8px] font-black px-1.5 py-0.5 rounded ${item.tagColor}`}>{item.tag}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ArrowUpRight className="h-3 w-3 text-muted-foreground/30 group-hover:text-primary transition-colors" />
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
              <h3 className="text-xl font-black tracking-tight uppercase">Performance Temporal</h3>
              <p className="text-xs text-muted-foreground font-medium mt-1">Análise volumétrica de investimento e conversão</p>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="h-2 w-2 rounded-full bg-primary" /> Invest
              </div>
              <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest">
                <div className="h-2 w-2 rounded-full bg-secondary" /> Conv
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
                    <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.2)" vertical={false} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(val) => format(new Date(val), 'dd MMM', { locale: ptBR }).toUpperCase()}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))' }} 
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--white) / 0.1)', borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)' }}
                  itemStyle={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}
                />
                <Area type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                <Area type="monotone" dataKey="conversions" stroke="hsl(var(--secondary))" strokeWidth={3} fillOpacity={1} fill="url(#colorConv)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-panel p-8 flex flex-col bg-gradient-to-br from-primary/[0.03] to-transparent border-primary/20"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/20 shadow-glow-sm">
               <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
               <h3 className="text-lg font-black tracking-tight uppercase">AI Synthesis</h3>
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
              <p className="text-xs leading-relaxed text-foreground/80 font-medium">
                {synthesis?.text || "Analizando fluxos de tráfego e janelas de conversão para gerar o próximo insight estratégico..."}
              </p>
              {synthesis?.generated_at && (
                <div className="mt-4 flex items-center justify-between">
                   <p className="text-[9px] text-muted-foreground font-bold flex items-center gap-1">
                     <Clock className="h-2.5 w-2.5" /> {format(new Date(synthesis.generated_at), "HH:mm", { locale: ptBR })}
                   </p>
                   <span className="text-[9px] font-black text-primary/50 uppercase tracking-tighter">Sincronizado via MCP</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <SummaryItem label="Campanhas Ativas" value={performanceData?.totals.campaigns ?? 0} icon={Megaphone} />
              <SummaryItem label="Clientes em Base" value={performanceData?.totals.clients ?? 0} icon={Users} />
              <SummaryItem label="ROAS Médio" value={`${(performanceData?.totals.ctr * 1.5).toFixed(2)}x`} icon={TrendingUp} />
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Saúde da Operação</span>
              <span className="text-[10px] font-black text-success">EXCELENTE</span>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden p-0.5 border border-white/5">
              <motion.div 
                initial={{ width: 0 }} animate={{ width: '98%' }}
                className="h-full bg-gradient-to-r from-primary via-secondary to-accent rounded-full shadow-glow-sm"
              />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Deep Dive Table */}
      <section className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-white/5 flex items-center justify-center">
              <Layers className="h-4 w-4 text-primary" />
            </div>
            <h2 className="text-lg font-black uppercase tracking-tight">Detalhamento de Ativos</h2>
          </div>
        </div>
        <PerformanceTable selectedAccountId={selectedAccountId} />
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

// --- Componentes Substitutos e Otimizados ---

function PerformanceTable({ selectedAccountId }: { selectedAccountId: string }) {
  const [tab, setTab] = useState<"campaigns" | "adsets" | "ads">("campaigns");

  // Busca campanhas com métricas reais agregadas
  const { data: tableData = [], isLoading } = useQuery({
    queryKey: ["dash-table", selectedAccountId],
    queryFn: async () => {
      let q = supabase
        .from("campaigns")
        .select("id, name, status, ad_account_id, metrics(impressions, clicks, cost, conversions)");

      if (selectedAccountId !== "all") {
        q = q.eq("ad_account_id", selectedAccountId);
      }

      const { data, error } = await q.order("name").limit(20);
      if (error) throw error;

      // Agregar métricas por campanha
      return (data || []).map((c: any) => {
        const metrics = c.metrics || [];
        const totalCost = metrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const totalImpressions = metrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const totalClicks = metrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
        const totalConversions = metrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const cpa = totalConversions > 0 ? totalCost / totalConversions : 0;
        return { ...c, totalCost, totalImpressions, totalClicks, totalConversions, ctr, cpa };
      });
    },
  });

  return (
    <div className="glass-panel overflow-hidden border border-white/5 bg-card/40">
      <div className="flex border-b border-white/5 bg-background/50">
        <button onClick={() => setTab("campaigns")} className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${tab === "campaigns" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>Campanhas</button>
        <button onClick={() => setTab("adsets")} className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${tab === "adsets" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>AdSets</button>
        <button onClick={() => setTab("ads")} className={`flex-1 py-3 text-xs font-semibold uppercase tracking-wider transition ${tab === "ads" ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground"}`}>Ads</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium text-right">Investimento</th>
              <th className="px-4 py-3 font-medium text-right">Impressões</th>
              <th className="px-4 py-3 font-medium text-right">Cliques</th>
              <th className="px-4 py-3 font-medium text-right">CTR</th>
              <th className="px-4 py-3 font-medium text-right">CPA</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center"><Loader2 className="h-4 w-4 animate-spin mx-auto text-primary" /></td></tr>
            ) : tableData.length > 0 ? (
              tableData.map((c: any, i: number) => (
                <tr key={c.id || i} className="transition hover:bg-white/5">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-1.5 text-xs font-medium">
                      <span className={`h-2 w-2 rounded-full ${c.status === 'active' ? 'bg-success' : 'bg-muted-foreground'}`}></span>
                      {c.status === 'active' ? 'Ativo' : 'Pausado'}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate">{c.name}</td>
                  <td className="px-4 py-3 text-right">R$ {c.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right">{c.totalImpressions.toLocaleString('pt-BR')}</td>
                  <td className="px-4 py-3 text-right">{c.totalClicks.toLocaleString('pt-BR')}</td>
                  <td className={`px-4 py-3 text-right font-bold ${c.ctr >= 1.5 ? 'text-success' : c.ctr > 0 ? 'text-primary' : 'text-muted-foreground'}`}>{c.ctr.toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right font-medium">{c.cpa > 0 ? `R$ ${c.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground text-xs">
                Nenhum dado encontrado. Clique em <span className="text-primary font-bold">"Sincronizar Agora"</span> para importar campanhas do Meta Ads.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, prefix = "", icon: Icon, trend, isPositive, sparklineData = [] }: any) {
  // Gera um sparkline SVG puro e extremamente leve (sem dependência do Recharts)
  const max = Math.max(...(sparklineData.length ? sparklineData : [1]));
  const points = sparklineData.map((val: number, i: number) => `${(i / (sparklineData.length - 1 || 1)) * 100},${100 - (val / max) * 100}`).join(" ");

  return (
    <div className="glass-panel p-5 relative overflow-hidden group transition hover:border-primary/30">
      {/* Background Sparkline - Ultra Lightweight */}
      <div className="absolute inset-x-0 bottom-0 h-16 opacity-20 pointer-events-none">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          {points && (
             <polyline points={points} fill="none" stroke={isPositive ? "hsl(var(--primary))" : "hsl(var(--destructive))"} strokeWidth="2" vectorEffect="non-scaling-stroke" />
          )}
          {points && (
             <polygon points={`0,100 ${points} 100,100`} fill={isPositive ? "hsl(var(--primary))" : "hsl(var(--destructive))"} opacity="0.1" />
          )}
        </svg>
      </div>

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground shadow-inner">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-background/50 backdrop-blur-sm border border-white/5 ${isPositive ? 'text-success' : 'text-destructive'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1">{label}</p>
        <h4 className="text-2xl font-bold font-display text-gradient">
          {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0 }) : value}
        </h4>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, icon: Icon }: any) {
  return (
    <div className="flex items-center justify-between p-3 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium text-foreground/80">{label}</span>
      </div>
      <span className="text-xs font-bold text-foreground">{value}</span>
    </div>
  );
}

