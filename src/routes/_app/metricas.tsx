import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, MousePointer, Users, Target, Loader2 } from "lucide-react";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { useMetrics } from "@/hooks/useMetrics";
import { useClients } from "@/hooks/useClients";
import { useCampaigns } from "@/hooks/useCampaigns";

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas — NC Suite" }] }),
  component: MetricasPage,
});

const COLORS = ["#00d4ff", "#9b87f5", "#f97316", "#22c55e", "#ef4444", "#eab308"];

function MetricasPage() {
  const [days, setDays] = useState(30);
  const [clientId, setClientId] = useState("");
  const { clients } = useClients();
  const { data: metrics = [], isLoading } = useMetrics({ days, clientId: clientId || undefined });
  const { campaigns } = useCampaigns();

  const totalCost = metrics.reduce((s, m) => s + (m.cost ?? 0), 0);
  const totalClicks = metrics.reduce((s, m) => s + (m.clicks ?? 0), 0);
  const totalConv = metrics.reduce((s, m) => s + (m.conversions ?? 0), 0);
  const cpl = totalConv > 0 ? totalCost / totalConv : 0;

  // Aggregate by date for line chart
  const byDate = metrics.reduce<Record<string, { date: string; cost: number }>>((acc, m) => {
    const d = m.date ?? "N/A";
    if (!acc[d]) acc[d] = { date: d, cost: 0 };
    acc[d].cost += m.cost ?? 0;
    return acc;
  }, {});
  const lineData = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

  // Aggregate by campaign for bar chart
  const byCamp = metrics.reduce<Record<string, { name: string; clicks: number }>>((acc, m) => {
    const cid = m.campaign_id ?? "N/A";
    const camp = campaigns.find((c) => c.id === cid);
    if (!acc[cid]) acc[cid] = { name: camp?.name ?? cid.slice(0, 8), clicks: 0 };
    acc[cid].clicks += m.clicks ?? 0;
    return acc;
  }, {});
  const barData = Object.values(byCamp).slice(0, 10);

  // Budget distribution pie
  const pieData = campaigns.filter((c) => (c.budget ?? 0) > 0).slice(0, 6).map((c) => ({ name: c.name, value: c.budget ?? 0 }));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Performance" title="Métricas" description="Análise detalhada de performance das campanhas." />

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="">Todos os clientes</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPI icon={DollarSign} label="Total Investido" value={`R$ ${totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} />
            <KPI icon={MousePointer} label="Total Cliques" value={totalClicks.toLocaleString("pt-BR")} />
            <KPI icon={Users} label="Total Conversões" value={totalConv.toLocaleString("pt-BR")} />
            <KPI icon={Target} label="CPL Médio" value={`R$ ${cpl.toFixed(2)}`} />
          </div>

          {/* Charts */}
          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
              <p className="label-mono mb-4 text-primary">Custo ao longo do tempo</p>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={lineData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fill: "#888", fontSize: 10 }} />
                  <YAxis tick={{ fill: "#888", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Line type="monotone" dataKey="cost" stroke="#00d4ff" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-6">
              <p className="label-mono mb-4 text-primary">Cliques por campanha</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#888", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="clicks" fill="#9b87f5" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel p-6 lg:col-span-2">
              <p className="label-mono mb-4 text-primary">Distribuição de budget</p>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
      <div className="flex items-center justify-between">
        <span className="label-mono text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
    </motion.div>
  );
}
