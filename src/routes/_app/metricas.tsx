import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  ChevronDown, Globe, Target, LineChart, Users, MousePointer2, 
  DollarSign, Loader2, ArrowLeft, BarChart3, PieChart as PieChartIcon,
  ChevronRight, ArrowUpRight, Trophy, TrendingUp, TrendingDown
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, PieChart, Pie, Sector
} from "recharts";
import { format, subDays, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas Avançadas — NC Suite" }] }),
  component: MetricasPage,
});

const COLORS = ["hsl(var(--primary))", "hsl(var(--secondary))", "hsl(var(--accent))", "#f59e0b", "#10b981", "#6366f1"];

function MetricasPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [showAccounts, setShowAccounts] = useState(false);
  const [days, setDays] = useState<number>(30);

  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts-metrics"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const { data: dashData, isLoading } = useQuery({
    queryKey: ["advanced-metrics", selectedAccountId, days],
    queryFn: async () => {
      const dateLimit = subDays(new Date(), days).toISOString();

      // Busca métricas de performance globais
      let qMetrics = (supabase as any).from("metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qMetrics = qMetrics.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: rawMetrics } = await qMetrics;

      // Busca demográficos
      let qDemos = (supabase as any).from("demographic_metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qDemos = qDemos.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: rawDemos } = await qDemos;

      // --- Processamento de Temporalidade (Área) ---
      const temporalMap = new Map();
      let currentPeriod = { cost: 0, conversions: 0, clicks: 0, impressions: 0, reach: 0 };
      
      (rawMetrics || []).forEach(m => {
        const d = m.date;
        const cur = temporalMap.get(d) || { date: d, cost: 0, conversions: 0, clicks: 0, impressions: 0, reach: 0 };
        cur.cost += Number(m.cost || 0);
        cur.conversions += Number(m.conversions || 0);
        cur.clicks += Number(m.clicks || 0);
        cur.impressions += Number(m.impressions || 0);
        cur.reach += Number(m.reach || 0);
        temporalMap.set(d, cur);

        currentPeriod.cost += Number(m.cost || 0);
        currentPeriod.conversions += Number(m.conversions || 0);
        currentPeriod.clicks += Number(m.clicks || 0);
        currentPeriod.impressions += Number(m.impressions || 0);
        currentPeriod.reach += Number(m.reach || 0);
      });
      const temporalData = Array.from(temporalMap.values()).sort((a, b) => a.date.localeCompare(b.date));
      const cpl = currentPeriod.conversions > 0 ? currentPeriod.cost / currentPeriod.conversions : 0;
      const cpm = currentPeriod.impressions > 0 ? (currentPeriod.cost / currentPeriod.impressions) * 1000 : 0;
      const freq = currentPeriod.reach > 0 ? currentPeriod.impressions / currentPeriod.reach : 0;
      const ctr = currentPeriod.impressions > 0 ? (currentPeriod.clicks / currentPeriod.impressions) * 100 : 0;

      // --- Processamento Demográfico (Idade e Gênero) ---
      const demoMap = new Map();
      (rawDemos || []).forEach(d => {
        if (!d.age_range || !d.gender || d.gender === 'unknown') return;
        const key = `${d.age_range}-${d.gender}`;
        const cur = demoMap.get(key) || { age: d.age_range, gender: d.gender, conversions: 0, spend: 0 };
        cur.conversions += Number(d.conversions || 0);
        cur.spend += Number(d.spend || 0);
        demoMap.set(key, cur);
      });
      const demographicData = Array.from(demoMap.values()).sort((a, b) => b.conversions - a.conversions).slice(0, 8); // Top 8

      // --- Processamento de Plataformas (Pie Chart) ---
      const platformMap = new Map();
      (rawDemos || []).forEach(d => {
        if (!d.platform) return;
        const p = d.platform;
        const cur = platformMap.get(p) || { name: p, value: 0 };
        cur.value += Number(d.spend || 0); // Distribuição de investimento por plataforma
        platformMap.set(p, cur);
      });
      const platformData = Array.from(platformMap.values());

      return { temporalData, demographicData, platformData, totals: currentPeriod, cpl, cpm, freq, ctr };
    }
  });

  const selectedAccount = accounts.find(a => a.id === selectedAccountId);

  return (
    <div className="mx-auto max-w-[1600px] space-y-12 pb-20">
      
      {/* HEADER TÉCNICO E FILTROS */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-3 mb-4">
             <Link to="/dashboard" className="flex items-center justify-center h-8 w-8 rounded-full bg-white/5 hover:bg-white/10 transition-colors">
               <ArrowLeft className="h-4 w-4 text-muted-foreground" />
             </Link>
             <h1 className="text-3xl font-black tracking-tighter text-gradient uppercase">Controle de Métricas</h1>
          </div>
          
          <div className="flex items-center gap-3 flex-wrap">
            {/* Seletor de Conta Global (Igual ao Dashboard) */}
            <div className="relative">
              <button 
                onClick={() => setShowAccounts(!showAccounts)}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10"
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

            {/* Seletor de Período */}
            <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-1">
              {[7, 14, 30, 90].map((d) => (
                 <button
                   key={d}
                   onClick={() => setDays(d)}
                   className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${days === d ? 'bg-primary text-primary-foreground shadow-glow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                 >
                   {d}D
                 </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex h-64 items-center justify-center">
           <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8">
          
          {/* Stats Layer */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-8">
            <StatCard 
              label="Alcance"
              value={dashData?.totals?.reach ?? 0} 
              icon={Globe} 
            />
            <StatCard 
              label="Impressões"
              value={dashData?.totals?.impressions ?? 0} 
              icon={Target} 
            />
            <StatCard 
              label="Frequência"
              value={dashData?.freq ?? 0} 
              icon={Users} 
            />
            <StatCard 
              label="CTR Médio"
              value={dashData?.ctr ?? 0} 
              prefix=""
              suffix="%" 
              icon={MousePointer2} 
            />
            <StatCard 
              label="CPM Médio"
              value={dashData?.cpm ?? 0} 
              prefix="R$ " 
              icon={DollarSign} 
            />
            <StatCard 
              label="Investimento"
              value={dashData?.totals?.cost ?? 0} 
              prefix="R$ " 
              icon={LineChart} 
            />
            <StatCard 
              label="Resultados"
              value={dashData?.totals?.conversions ?? 0} 
              icon={Trophy} 
            />
            <StatCard 
              label="Custo por Result."
              value={dashData?.cpl ?? 0} 
              prefix="R$ " 
              icon={Target} 
            />
          </div>

          {/* Tabela Deep Dive */}
          <section className="space-y-4">
            <h2 className="text-lg font-black uppercase tracking-tight">Detalhamento Técnico de Ativos</h2>
            <PerformanceTable selectedAccountId={selectedAccountId} dateRange={`last_${days}d`} />
          </section>

          {/* Gráfico 1: Performance Temporal Escalonada */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8">
            <div className="mb-8 flex items-center justify-between">
              <div className="flex items-center gap-3">
                 <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                   <LineChart className="h-5 w-5 text-primary" />
                 </div>
                 <div>
                   <h3 className="text-xl font-black tracking-tight uppercase">Volumetria de Escala</h3>
                   <p className="text-xs text-muted-foreground font-medium mt-1">Comparativo de Investimento vs Conversões ({days} dias)</p>
                 </div>
              </div>
            </div>
            
            <div className="w-full relative h-[350px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dashData?.temporalData || []}>
                  <defs>
                    <linearGradient id="colorCostMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorConvMetric" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--secondary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--secondary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.1)" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
                    tickFormatter={(val) => format(new Date(val), 'dd MMM', { locale: ptBR }).toUpperCase()}
                  />
                  <YAxis 
                    yAxisId="left"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--muted-foreground))', fontFamily: 'monospace' }}
                    tickFormatter={(val) => `R$${val >= 1000 ? (val/1000).toFixed(1)+'k' : val}`}
                  />
                  <YAxis 
                    yAxisId="right"
                    orientation="right"
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 9, fontWeight: 700, fill: 'hsl(var(--secondary))', fontFamily: 'monospace' }} 
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                    itemStyle={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace' }}
                    labelStyle={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', textTransform: 'uppercase', marginBottom: '8px' }}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="cost" name="Investimento" stroke="hsl(var(--primary))" strokeWidth={3} fill="url(#colorCostMetric)" />
                  <Area yAxisId="right" type="monotone" dataKey="conversions" name="Conversões" stroke="hsl(var(--secondary))" strokeWidth={3} fill="url(#colorConvMetric)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          <div className="grid gap-8 lg:grid-cols-2">
            
            {/* Gráfico 2: Demográfico Deep Dive */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-8">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                     <Users className="h-5 w-5 text-secondary" />
                   </div>
                   <div>
                     <h3 className="text-lg font-black tracking-tight uppercase">Raio-X de Público</h3>
                     <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase mt-1">Idade e Gênero (Top Conversões)</p>
                   </div>
                </div>
              </div>
              
              <div className="w-full relative h-[300px]">
                {dashData?.demographicData && dashData.demographicData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={dashData.demographicData} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.1)" horizontal={true} vertical={false} />
                      <XAxis type="number" hide />
                      <YAxis 
                        type="category" 
                        dataKey="age" 
                        axisLine={false} 
                        tickLine={false}
                        tick={{ fontSize: 10, fontWeight: 900, fill: 'hsl(var(--foreground))', fontFamily: 'monospace' }}
                      />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--white)/0.05)' }}
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace' }}
                      />
                      <Bar dataKey="conversions" name="Conversões" radius={[0, 4, 4, 0]} barSize={20}>
                        {dashData.demographicData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.gender === 'female' ? '#ec4899' : '#3b82f6'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-xs uppercase tracking-widest font-bold">Sem dados demográficos suficientes</div>
                )}
              </div>
              <div className="mt-4 flex items-center justify-center gap-6">
                 <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><div className="h-2 w-2 rounded-full bg-[#ec4899]" /> Mulheres</div>
                 <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"><div className="h-2 w-2 rounded-full bg-[#3b82f6]" /> Homens</div>
              </div>
            </motion.div>

            {/* Gráfico 3: Distribuição de Plataforma */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-panel p-8">
              <div className="mb-8 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="h-10 w-10 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                     <PieChartIcon className="h-5 w-5 text-accent" />
                   </div>
                   <div>
                     <h3 className="text-lg font-black tracking-tight uppercase">Ecossistema</h3>
                     <p className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase mt-1">Distribuição de Investimento</p>
                   </div>
                </div>
              </div>

              <div className="w-full relative h-[300px]">
                {dashData?.platformData && dashData.platformData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={dashData.platformData}
                        cx="50%"
                        cy="50%"
                        innerRadius={80}
                        outerRadius={110}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                      >
                        {dashData.platformData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--background))', borderColor: 'hsl(var(--border))', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px', fontWeight: 800, fontFamily: 'monospace', color: '#fff' }}
                        formatter={(val: number) => `R$ ${val.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        wrapperStyle={{ fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-xs uppercase tracking-widest font-bold">Sem dados de plataforma</div>
                )}
              </div>
            </motion.div>

          </div>
        </div>
      )}
    </div>
  );
}

// --- TABELA DE BREAKDOWN COM DRILL-DOWN ---
function PerformanceTable({ selectedAccountId, dateRange }: { selectedAccountId: string, dateRange: string }) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const { data: tableData = [], isLoading } = useQuery({
    queryKey: ["dash-table-advanced", selectedAccountId, dateRange],
    queryFn: async () => {
      let days = 30;
      if (dateRange === "last_7d") days = 7;
      if (dateRange === "last_90d") days = 90;
      const startDateStr = dateRange === "all_time" ? null : subDays(new Date(), days).toISOString();

      // Puxa Campanhas + Conta de Anúncios (Para saber o "Portfólio/Conta")
      let q = (supabase as any)
        .from("campaigns")
        .select(`
          id, name, status, budget,
          ad_account:ad_accounts(name),
          metrics(impressions, clicks, cost, conversions, reach, date),
          demographic_metrics(age_range, gender, conversions, spend, date)
        `);

      if (selectedAccountId !== "all") {
        q = q.eq("ad_account_id", selectedAccountId);
      }

      const { data, error } = await q.order("name");
      if (error) throw error;

      return (data || []).map((c: any) => {
        const metrics = (c.metrics || []).filter((m: any) => !startDateStr || isAfter(new Date(m.date), new Date(startDateStr)));
        const totalCost = metrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const totalImpressions = metrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const totalClicks = metrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
        const totalConversions = metrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const totalReach = metrics.reduce((s: number, m: any) => s + Number(m.reach || 0), 0);
        
        const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
        const cpm = totalImpressions > 0 ? (totalCost / totalImpressions) * 1000 : 0;
        const cpa = totalConversions > 0 ? totalCost / totalConversions : 0;
        const freq = totalReach > 0 ? totalImpressions / totalReach : 0;
        const roas = totalCost > 0 ? (totalConversions * 150) / totalCost : 0; // Mock ROAS value estimation se não tiver valor real

        // Processa demographic metrics para o "Breakdown" da campanha
        const demos = (c.demographic_metrics || []).filter((m: any) => !startDateStr || isAfter(new Date(m.date), new Date(startDateStr)));
        
        // Agrupar dados por idade e gênero
        const demoMap = new Map();
        demos.forEach((d: any) => {
           const key = `${d.age_range}-${d.gender}`;
           const curr = demoMap.get(key) || { age_range: d.age_range, gender: d.gender, conversions: 0, spend: 0 };
           curr.conversions += Number(d.conversions || 0);
           curr.spend += Number(d.spend || 0);
           demoMap.set(key, curr);
        });

        const topDemos = Array.from(demoMap.values())
          .filter((d: any) => d.conversions > 0)
          .sort((a: any, b: any) => b.conversions - a.conversions)
          .slice(0, 3); // Pega os 3 públicos que mais convertem

        return { 
          ...c, 
          accountName: c.ad_account?.name || "Desconhecido",
          totalCost, 
          totalImpressions, 
          totalClicks, 
          totalConversions, 
          totalReach,
          ctr, 
          cpm,
          freq,
          cpa,
          roas,
          topDemos
        };
      }).filter(c => c.totalImpressions > 0); // Oculta campanhas zeradas
    },
  });

  return (
    <div className="glass-panel overflow-hidden border border-white/5 bg-card/40">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-4 w-10"></th>
              <th className="px-4 py-4 min-w-[200px]">Status / Nome</th>
              <th className="px-4 py-4 text-right">Orçamento</th>
              <th className="px-4 py-4 text-right">Investimento</th>
              <th className="px-4 py-4 text-right">Alcance</th>
              <th className="px-4 py-4 text-right">Impressões</th>
              <th className="px-4 py-4 text-right">Frequência</th>
              <th className="px-4 py-4 text-right">CPM</th>
              <th className="px-4 py-4 text-right">CTR</th>
              <th className="px-4 py-4 text-right">Resultados</th>
              <th className="px-4 py-4 text-right">Custo / Res</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></td></tr>
            ) : tableData.length > 0 ? (
              tableData.map((c: any) => (
                <React.Fragment key={c.id}>
                  {/* Main Row */}
                  <tr 
                    onClick={() => toggleRow(c.id)}
                    className="group cursor-pointer transition hover:bg-white/[0.02]"
                  >
                    <td className="px-4 py-4">
                      <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${expandedRows[c.id] ? "rotate-90" : ""}`} />
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shadow-glow-sm ${c.status === 'active' ? 'bg-success shadow-success/50' : 'bg-muted-foreground'}`}></span>
                          <span className="font-bold text-foreground text-xs whitespace-nowrap">{c.name.length > 30 ? c.name.substring(0, 30) + '...' : c.name}</span>
                        </div>
                        <span className="text-[9px] text-muted-foreground ml-4">{c.accountName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{c.budget > 0 ? `R$ ${c.budget.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">R$ {c.totalCost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{c.totalReach.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs">{c.totalImpressions.toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{c.freq.toFixed(2)}</td>
                    <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">R$ {c.cpm.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-4 text-right">
                      <span className={`inline-flex items-center rounded bg-white/5 px-2 py-0.5 font-mono text-xs font-bold ${c.ctr >= 1.5 ? 'text-success' : c.ctr > 0 ? 'text-primary' : 'text-muted-foreground'}`}>
                        {c.ctr.toFixed(2)}%
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs font-bold text-secondary">
                      +{c.totalConversions.toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-4 text-right font-mono text-xs font-bold text-foreground">
                      {c.cpa > 0 ? `R$ ${c.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—'}
                    </td>
                  </tr>

                  {/* Expanded Breakdown Row */}
                  <AnimatePresence>
                    {expandedRows[c.id] && (
                      <motion.tr 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: 'auto' }} 
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-black/20 border-b border-white/5 overflow-hidden"
                      >
                        <td colSpan={11} className="p-0">
                          <div className="px-14 py-6 border-l-2 border-primary/50 ml-4 my-2">
                            <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                              <Target className="h-3 w-3" /> Breakdown de Conversão (AdSets / Públicos)
                            </h4>
                            
                            {c.topDemos.length > 0 ? (
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                {c.topDemos.map((demo: any, idx: number) => (
                                  <div key={idx} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between relative overflow-hidden">
                                    <div className="absolute top-0 right-0 h-full w-1 bg-primary/30" />
                                    <div>
                                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                        {demo.gender === 'male' ? 'Homens' : demo.gender === 'female' ? 'Mulheres' : 'Indefinido'}
                                      </p>
                                      <p className="text-xl font-black font-mono mt-1">
                                        {demo.age_range === 'unknown' || !demo.age_range ? 'Idade Indefinida' : demo.age_range}
                                      </p>
                                    </div>
                                    <div className="mt-4 flex items-end justify-between">
                                      <div>
                                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Conversões</p>
                                        <p className="text-sm font-bold text-success font-mono">+{demo.conversions}</p>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Custo Relativo</p>
                                        <p className="text-sm font-bold font-mono">R$ {demo.spend.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-xs text-muted-foreground p-4 bg-white/5 rounded-xl border border-white/10 border-dashed">
                                Sem dados demográficos de conversão suficientes para gerar breakdown deste ativo.
                              </div>
                            )}

                            <div className="mt-4 flex justify-end">
                               <button 
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   window.dispatchEvent(new CustomEvent('set-ai-prompt', { detail: { prompt: `Faça uma análise estratégica da campanha "${c.name}". Avalie o desempenho recente com base nos públicos que mais convertem e sugira otimizações.` } }));
                                   window.dispatchEvent(new CustomEvent('open-ai-agent'));
                                 }}
                                 className="text-[10px] font-bold uppercase tracking-widest text-primary hover:text-primary/80 transition flex items-center gap-1 relative z-10"
                               >
                                 Ver Análise Completa da IA <ArrowUpRight className="h-3 w-3" />
                               </button>
                            </div>
                          </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                </React.Fragment>
              ))
            ) : (
              <tr><td colSpan={11} className="px-4 py-8 text-center text-muted-foreground text-xs">
                Nenhum dado encontrado. Clique em <span className="text-primary font-bold">"Sincronizar Agora"</span> para importar campanhas.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, prefix = "", suffix = "", icon: Icon, trend, isPositive, sparklineData = [] }: any) {
  const max = Math.max(...(sparklineData.length ? sparklineData : [1]), 0.1);
  const min = Math.min(...(sparklineData.length ? sparklineData : [0]));
  const range = max - min || 1;
  
  const points = sparklineData.map((val: number, i: number) => 
    `${(i / (sparklineData.length - 1 || 1)) * 100},${100 - ((val - min) / range) * 90 - 5}`
  ).join(" ");

  return (
    <div className="glass-panel p-5 relative overflow-hidden group transition hover:border-primary/30">
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

      <div className="flex items-center justify-between mb-4 relative z-10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/5 text-muted-foreground shadow-inner">
          <Icon className="h-4 w-4 text-foreground" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-background/80 backdrop-blur-md border border-white/10 shadow-xl ${isPositive ? 'text-success border-success/20' : 'text-primary border-primary/20'}`}>
            {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trend}
          </div>
        )}
      </div>
      <div className="relative z-10">
        <p className="text-[10px] uppercase tracking-wider font-black text-muted-foreground/80 mb-1">{label}</p>
        <h4 className="text-2xl font-black font-mono tracking-tighter text-foreground drop-shadow-md">
          {prefix}{typeof value === 'number' ? value.toLocaleString('pt-BR', { minimumFractionDigits: value % 1 !== 0 ? 2 : 0 }) : value}{suffix}
        </h4>
      </div>
    </div>
  );
}

import React from "react";
