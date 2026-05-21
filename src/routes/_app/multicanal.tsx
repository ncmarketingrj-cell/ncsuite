import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  DollarSign, MousePointer, Users, Target, Loader2, Sparkles, 
  TrendingUp, BarChart3, PieChart as PieChartIcon, Calendar, Layers, RefreshCw
} from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_app/multicanal")({
  head: () => ({ meta: [{ title: "Consolidado Executivo — NC Performance Suite" }] }),
  component: MulticanalPage,
});

const COLORS = ["#00d4ff", "#9b87f5", "#f97316", "#22c55e", "#ef4444", "#eab308"];

function MulticanalPage() {
  const [clientId, setClientId] = useState("all");
  const [accountId, setAccountId] = useState("all");
  
  // Período flexível de datas (Default: últimos 30 dias)
  const [dateRange, setDateRange] = useState<{ startDate: Date; endDate: Date }>({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });

  // 1. Buscar Clientes
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("name");
      return data || [];
    }
  });

  // 2. Buscar Ad Accounts (Contas Meta)
  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  // 3. Query de métricas consolidada de acordo com o intervalo de datas customizado
  const { data: dashData, isLoading, refetch } = useQuery({
    queryKey: ["multicanal-performance-consolidated", clientId, accountId, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      // Helper para formatar a data local como YYYY-MM-DD de forma segura
      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);

      // Puxa campanhas com métricas associadas filtradas por data
      let q = (supabase as any)
        .from("campaigns")
        .select(`
          id, name, status, budget, client_id, platform, ad_account_id,
          metrics(cost, conversions, impressions, clicks, date)
        `);

      if (clientId !== "all") {
        q = q.eq("client_id", clientId);
      }
      if (accountId !== "all") {
        q = q.eq("ad_account_id", accountId);
      }

      const { data: campaignsRaw, error } = await q;
      if (error) throw error;

      // Agrega métricas no período selecionado
      let totalCost = 0;
      let totalConversions = 0;
      let totalImpressions = 0;
      let totalClicks = 0;

      const campaignData = (campaignsRaw || []).map((c: any) => {
        const filteredMetrics = (c.metrics || []).filter((m: any) => {
          if (!m.date) return false;
          // Comparação robusta de string ISO pura YYYY-MM-DD (livre de fuso horário do navegador)
          return m.date >= startStr && m.date <= endStr;
        });

        const cost = filteredMetrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const conversions = filteredMetrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const impressions = filteredMetrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const clicks = filteredMetrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);

        totalCost += cost;
        totalConversions += conversions;
        totalImpressions += impressions;
        totalClicks += clicks;

        return {
          id: c.id,
          name: c.name,
          status: c.status,
          platform: c.platform || "Meta Ads",
          budget: Number(c.budget || 0),
          cost,
          conversions,
          impressions,
          clicks
        };
      });

      // Ordena campanhas por gasto
      const sortedCampaigns = [...campaignData].sort((a, b) => b.cost - a.cost);

      const cpl = totalConversions > 0 ? totalCost / totalConversions : 0;
      const roas = totalCost > 0 ? (totalConversions * 150) / totalCost : 0; // Estimativa de retorno comercial

      return {
        campaigns: sortedCampaigns,
        totals: {
          cost: totalCost,
          conversions: totalConversions,
          cpl,
          roas,
          impressions: totalImpressions,
          clicks: totalClicks
        }
      };
    }
  });

  const barData = (dashData?.campaigns || [])
    .slice(0, 8)
    .map((c) => ({ 
      name: c.name?.slice(0, 16).toUpperCase(), 
      Gasto: c.cost, 
      Resultados: c.conversions 
    }));

  const pieData = (dashData?.campaigns || [])
    .filter((c) => c.cost > 0)
    .slice(0, 6)
    .map((c) => ({ 
      name: c.name, 
      value: c.cost 
    }));

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-1">
      <PageHeader 
        eyebrow="Consolidado" 
        title="Command Center Executivo" 
        description="Painel de Atribuição, Faturamento e Performance Comercial Consolidada no período personalizado."
        actions={
          <div className="flex flex-wrap items-center gap-4">
            {/* 📅 SELETOR DE PERÍODO PERSONALIZADO PREMIUM */}
            <DateRangePicker 
              startDate={dateRange.startDate} 
              endDate={dateRange.endDate} 
              onChange={(start, end) => setDateRange({ startDate: start, endDate: end })} 
            />
          </div>
        }
      />

      {/* 🛠️ BARRA DE FILTROS EXECUTIVA PREMIUM */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Layers className="h-4 w-4 text-primary" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">Filtro de Carteira e Contas</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Filtro de Conta Meta */}
          <select 
            value={accountId} 
            onChange={(e) => setAccountId(e.target.value)} 
            className="rounded-xl border border-white/10 bg-background/50 px-4 py-2.5 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todas as Contas Meta</option>
            {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>

          {/* Filtro de Cliente */}
          <select 
            value={clientId} 
            onChange={(e) => setClientId(e.target.value)} 
            className="rounded-xl border border-white/10 bg-background/50 px-4 py-2.5 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todos os clientes ativos</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Compilando estatísticas executivas...</p>
        </div>
      ) : (
        <>
          {/* Cards de Métricas Principais (KPIs) */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPI 
              icon={DollarSign} 
              label="Investimento Consolidado" 
              value={`R$ ${(dashData?.totals?.cost ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} 
              desc="Total investido em tráfego"
            />
            <KPI 
              icon={Users} 
              label="Resultados Comerciais" 
              value={(dashData?.totals?.conversions ?? 0).toLocaleString("pt-BR")} 
              desc="Conversões diretas atribuídas"
            />
            <KPI 
              icon={Target} 
              label="CPL Médio de Período" 
              value={dashData?.totals?.cpl ? `R$ ${dashData.totals.cpl.toFixed(2)}` : "R$ 0,00"} 
              desc="Custo por Lead médio consolidado"
            />
            <KPI 
              icon={MousePointer} 
              label="ROAS Comercial Estimado" 
              value={dashData?.totals?.roas ? `${dashData.totals.roas.toFixed(1)}x` : "—"} 
              desc="Retorno sobre investimento"
            />
          </div>

          {/* Gráficos de Performance Consolidados */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gráfico 1: Investimento / Resultados por Campanha */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <BarChart3 className="h-4 w-4 text-primary" />
                <p className="text-xs font-black uppercase tracking-widest text-primary">Volume de Gasto por Ativo</p>
              </div>
              <div className="w-full relative h-[280px]">
                {barData.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Sem dados para plotar.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                      <XAxis dataKey="name" tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 9 }} />
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 10, color: "var(--color-foreground)" }} />
                      <Bar dataKey="Gasto" fill="#00d4ff" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>

            {/* Gráfico 2: Distribuição Faturamento */}
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-6">
              <div className="flex items-center gap-2 mb-6">
                <PieChartIcon className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <p className="text-xs font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Distribuição do Gasto Total</p>
              </div>
              <div className="w-full relative h-[280px]">
                {pieData.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">Sem dados para plotar.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie 
                        data={pieData} 
                        dataKey="value" 
                        nameKey="name" 
                        cx="50%" 
                        cy="50%" 
                        outerRadius={90} 
                        label={({ name, percent, cx, cy, midAngle, innerRadius, outerRadius, value }) => {
                          return `${name?.slice(0, 10)} (${(percent * 100).toFixed(0)}%)`;
                        }}
                        labelLine={false}
                        style={{ fontSize: 9 }}
                      >
                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12, fontSize: 10, color: "var(--color-foreground)" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.div>
          </div>

          {/* Tabela Consolidada de Campanhas */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel overflow-hidden">
            <div className="border-b border-white/5 p-5 bg-white/[0.01]">
              <p className="text-xs font-black uppercase tracking-widest text-primary">Demonstrativo Detalhado de Performance</p>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-6 py-4">Campanha</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Budget</th>
                    <th className="px-4 py-4 text-right">Investido</th>
                    <th className="px-4 py-4 text-right">Resultados</th>
                    <th className="px-6 py-4 text-right text-primary">CPL Médio</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashData?.campaigns || []).map((c) => (
                    <tr key={c.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition-all">
                      <td className="px-6 py-4 font-bold text-foreground/90 uppercase tracking-tight">{c.name}</td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${c.status?.toUpperCase() === "ACTIVE" ? "bg-success/15 text-success animate-pulse" : "bg-white/5 text-muted-foreground"}`}>
                          {c.status?.toUpperCase() === "ACTIVE" ? "Ativo" : "Pausado"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono font-medium">R$ {(c.budget ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-foreground">R$ {(c.cost ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      <td className="px-4 py-4 text-right font-mono font-bold text-foreground">{(c.conversions ?? 0).toLocaleString("pt-BR")}</td>
                      <td className="px-6 py-4 text-right font-mono font-bold text-primary">
                        {c.conversions > 0 ? `R$ ${(c.cost / c.conversions).toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, desc }: { icon: any; label: string; value: string; desc: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">{label}</span>
        <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-3 font-mono text-2xl font-bold tracking-tight text-foreground/90">{value}</p>
      <p className="mt-1 text-[9px] text-muted-foreground/60 font-semibold tracking-wider uppercase">{desc}</p>
    </motion.div>
  );
}
