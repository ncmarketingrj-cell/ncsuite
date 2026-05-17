import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  ChevronDown, Globe, Target, LineChart, Users, MousePointer2, 
  DollarSign, Loader2, ArrowLeft, BarChart3, PieChart as PieChartIcon
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend, Cell, PieChart, Pie, Sector
} from "recharts";
import { format, subDays } from "date-fns";
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
      let qMetrics = supabase.from("metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qMetrics = qMetrics.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: rawMetrics } = await qMetrics;

      // Busca demográficos
      let qDemos = supabase.from("demographic_metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qDemos = qDemos.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: rawDemos } = await qDemos;

      // --- Processamento de Temporalidade (Área) ---
      const temporalMap = new Map();
      (rawMetrics || []).forEach(m => {
        const d = m.date;
        const cur = temporalMap.get(d) || { date: d, cost: 0, conversions: 0 };
        cur.cost += Number(m.cost || 0);
        cur.conversions += Number(m.conversions || 0);
        temporalMap.set(d, cur);
      });
      const temporalData = Array.from(temporalMap.values()).sort((a, b) => a.date.localeCompare(b.date));

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

      return { temporalData, demographicData, platformData };
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
