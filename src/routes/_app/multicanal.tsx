import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { DollarSign, MousePointer, Users, Target, Loader2 } from "lucide-react";
import { BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { PageHeader } from "@/components/PageHeader";
import { useMetrics } from "@/hooks/useMetrics";
import { useClients } from "@/hooks/useClients";
import { useCampaigns } from "@/hooks/useCampaigns";

export const Route = createFileRoute("/_app/multicanal")({
  head: () => ({ meta: [{ title: "Performance — NC Suite" }] }),
  component: MulticanalPage,
});

const COLORS = ["#00d4ff", "#9b87f5", "#f97316", "#22c55e", "#ef4444", "#eab308"];

function MulticanalPage() {
  const [clientId, setClientId] = useState("");
  const { clients } = useClients();
  const { campaigns } = useCampaigns({ clientId: clientId || undefined });
  const { data: metrics = [], isLoading } = useMetrics({ clientId: clientId || undefined, days: 30 });

  const totalInvest = metrics.reduce((s, m) => s + (m.cost ?? 0), 0);
  const totalLeads = metrics.reduce((s, m) => s + (m.conversions ?? 0), 0);
  const cpl = totalLeads > 0 ? totalInvest / totalLeads : 0;
  const roas = totalInvest > 0 ? ((totalLeads * 500) / totalInvest).toFixed(1) : "0";

  const barData = campaigns.slice(0, 8).map((c) => ({ name: c.name?.slice(0, 20), invest: c.budget ?? 0 }));
  const pieData = campaigns.filter((c) => (c.budget ?? 0) > 0).slice(0, 6).map((c) => ({ name: c.name, value: c.budget ?? 0 }));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Performance" title="Dashboard de Performance" description="Visão consolidada multi-cliente e multi-campanha." />
      <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
        <option value="">Todos os clientes</option>
        {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KPI icon={DollarSign} label="Total Investido" value={`R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} trend="+12%" />
            <KPI icon={Users} label="Total Leads" value={totalLeads.toLocaleString("pt-BR")} trend="+8%" />
            <KPI icon={Target} label="CPL Médio" value={`R$ ${cpl.toFixed(2)}`} trend="-5%" />
            <KPI icon={MousePointer} label="ROAS Médio" value={`${roas}x`} trend="+15%" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
              <p className="label-mono mb-4 text-primary">Investimento por campanha</p>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="name" tick={{ fill: "#888", fontSize: 9 }} />
                  <YAxis tick={{ fill: "#888", fontSize: 10 }} />
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                  <Bar dataKey="invest" fill="#00d4ff" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-6">
              <p className="label-mono mb-4 text-primary">Distribuição de budget</p>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name?.slice(0, 12)} (${(percent * 100).toFixed(0)}%)`}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </motion.div>
          </div>

          {/* Campaign table */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel overflow-hidden">
            <div className="border-b border-white/5 p-4"><p className="label-mono text-primary">Campanhas</p></div>
            <div className="custom-scrollbar overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-white/5 label-mono text-left text-muted-foreground">
                  <th className="px-4 py-3">Nome</th><th className="px-2 py-3">Status</th><th className="px-2 py-3 text-right">Budget</th><th className="px-4 py-3">Plataforma</th>
                </tr></thead>
                <tbody>{campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium">{c.name}</td>
                    <td className="px-2 py-3"><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${c.status === "active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{c.status === "active" ? "Ativo" : "Pausado"}</span></td>
                    <td className="px-2 py-3 text-right font-mono text-xs">R$ {(c.budget ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.platform ?? "Meta Ads"}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}

function KPI({ icon: Icon, label, value, trend }: { icon: any; label: string; value: string; trend: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
      <div className="flex items-center justify-between"><span className="label-mono text-muted-foreground">{label}</span><Icon className="h-4 w-4 text-primary" /></div>
      <p className="mt-2 font-display text-2xl font-bold">{value}</p>
      <p className={`mt-1 text-xs font-medium ${trend.startsWith("+") ? "text-success" : "text-destructive"}`}>{trend}</p>
    </motion.div>
  );
}
