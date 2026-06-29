import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell, 
  PieChart, 
  Pie 
} from "recharts";
import { 
  Users, 
  TrendingUp, 
  AlertCircle, 
  Award, 
  Compass,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface CrmDashboardProps {
  clientId?: string; // Forçado para client_store
  isAdminOrSdr: boolean;
}

export function CrmDashboard({ clientId, isAdminOrSdr }: CrmDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [selectedClient, setSelectedClient] = useState<string>(clientId || "ALL");
  const [clientsList, setClientsList] = useState<any[]>([]);
  
  // States para métricas calculadas
  const [metrics, setMetrics] = useState({
    totalLeads: 0,
    noActivityLeads: 0,
    conversionRate: 0,
    closedDeals: 0,
    scheduledAppointments: 0,
    realizedAppointments: 0,
    noShowAppointments: 0,
    showRate: 0,
  });

  const [funnelData, setFunnelData] = useState<any[]>([]);
  const [sourceData, setSourceData] = useState<any[]>([]);
  const [temperatureData, setTemperatureData] = useState<any[]>([]);

  useEffect(() => {
    if (isAdminOrSdr) {
      loadClients();
    }
  }, [isAdminOrSdr]);

  useEffect(() => {
    loadDashboardData();
  }, [selectedClient, clientId]);

  const loadClients = async () => {
    const { data, error } = await (supabase as any)
      .from("clients")
      .select("id, name")
      .order("name");
    if (data) {
      setClientsList(data);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Carregar leads
      let queryLeads = (supabase as any).from("crm_leads").select("*");
      
      // Aplicar filtro de cliente
      const activeClientId = clientId || (selectedClient !== "ALL" ? selectedClient : null);
      if (activeClientId) {
        queryLeads = queryLeads.eq("client_id", activeClientId);
      }

      const { data: leads, error: leadsErr } = await queryLeads;
      if (leadsErr) throw leadsErr;

      const leadsList = leads || [];

      // 2. Carregar etapas
      let queryStages = (supabase as any).from("crm_pipeline_stages").select("id, name");
      const { data: stages } = await queryStages;
      const stageMap = new Map<string, string>();
      if (stages) {
        stages.forEach((s: any) => stageMap.set(s.id, s.name));
      }

      // 3. Processar métricas
      let totalLeads = leadsList.length;
      let closedDeals = 0;

      // Mapeamento para gráficos
      const stageCounts: Record<string, number> = {};
      const sourceCounts: Record<string, number> = {};
      const tempCounts: Record<string, number> = { "Frio": 0, "Morno": 0, "Quente": 0 };

      leadsList.forEach((lead: any) => {
        const lowerStatus = (lead.stage_id ? stageMap.get(lead.stage_id) : lead.status || "").toLowerCase();
        const isClosed = lowerStatus.includes("vendido") || lowerStatus.includes("fechado") || lowerStatus.includes("concluído");
        if (isClosed) closedDeals++;

        // Contar por etapa
        const stageName = (lead.stage_id ? stageMap.get(lead.stage_id) : lead.status) || "Entrada";
        stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;

        // Contar por origem
        const sourceName = lead.source || "Manual";
        sourceCounts[sourceName] = (sourceCounts[sourceName] || 0) + 1;

        // Contar por temperatura
        const temp = lead.negotiation_level || "Frio";
        tempCounts[temp] = (tempCounts[temp] || 0) + 1;
      });

      // 4. Carregar agendamentos (visitas)
      let scheduledAppointments = 0;
      let realizedAppointments = 0;
      let noShowAppointments = 0;

      if (leadsList.length > 0) {
        const leadIds = leadsList.map((l: any) => l.id);
        const { data: appts } = await (supabase as any)
          .from("crm_appointments")
          .select("*")
          .in("lead_id", leadIds);
        
        if (appts) {
          appts.forEach((a: any) => {
            if (a.status === "Agendado") scheduledAppointments++;
            else if (a.status === "Realizado") realizedAppointments++;
            else if (a.status === "No-Show") noShowAppointments++;
          });
        }
      }

      const totalCalculated = realizedAppointments + noShowAppointments;
      const showRate = totalCalculated > 0 ? Math.round((realizedAppointments / totalCalculated) * 100) : 0;

      // Cálculo de Leads sem Atendimento (criado há mais de 15 min e sem notas/atividades)
      const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
      const noActivityLeads = leadsList.filter((l: any) => {
        const created = new Date(l.created_at);
        const lowerStatus = (l.stage_id ? stageMap.get(l.stage_id) : l.status || "").toLowerCase();
        const isNew = lowerStatus.includes("novo") || lowerStatus.includes("entrada");
        return isNew && created < fifteenMinsAgo && (!l.updated_at || l.updated_at === l.created_at);
      }).length;

      const conversionRate = totalLeads > 0 ? Math.round((closedDeals / totalLeads) * 100) : 0;

      setMetrics({
        totalLeads,
        noActivityLeads,
        conversionRate,
        closedDeals,
        scheduledAppointments,
        realizedAppointments,
        noShowAppointments,
        showRate
      });

      // Formatar dados dos gráficos
      // Funil
      const funnel = Object.keys(stageCounts).map(name => ({
        name,
        Quantidade: stageCounts[name]
      })).sort((a, b) => b.Quantidade - a.Quantidade);
      setFunnelData(funnel);

      // Origem
      const sources = Object.keys(sourceCounts).map(name => ({
        name,
        value: sourceCounts[name]
      }));
      setSourceData(sources);

      // Temperatura
      const temps = Object.keys(tempCounts).map(name => ({
        name,
        Quantidade: tempCounts[name]
      }));
      setTemperatureData(temps);

    } catch (err: any) {
      toast.error("Erro ao carregar dados do dashboard.");
    } finally {
      setLoading(false);
    }
  };

  const COLORS = ["#8B5CF6", "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#EC4899"];
  const TEMP_COLORS: Record<string, string> = {
    "Frio": "#3B82F6",
    "Morno": "#F59E0B",
    "Quente": "#EF4444"
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Filter (Apenas se for Admin/SDR da agência) */}
      {isAdminOrSdr && !clientId && (
        <div className="flex items-center justify-between p-4 bg-card border border-white/10 rounded-2xl">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Filtro de Contas
          </span>
          <select
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
            className="bg-white/5 border border-white/10 text-foreground font-black text-xs rounded-xl px-4 py-2 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer max-w-xs bg-card"
          >
            <option value="ALL" className="bg-card text-foreground">Todos os Clientes (Agência)</option>
            {clientsList.map(c => (
              <option key={c.id} value={c.id} className="bg-card text-foreground">
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Leads */}
        <div className="bg-card border border-white/10 hover:border-white/20 transition-all rounded-2xl p-5 flex items-center justify-between group">
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Leads Ativos</p>
            <h3 className="text-3xl font-black text-foreground">{metrics.totalLeads}</h3>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <Users className="h-6 w-6" />
          </div>
        </div>

        {/* Sem Atendimento (SLA) */}
        <div className={`bg-card border transition-all rounded-2xl p-5 flex items-center justify-between group ${metrics.noActivityLeads > 0 ? "border-red-500/30 bg-red-500/[0.02]" : "border-white/10 hover:border-white/20"}`}>
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Atenção ao SLA</p>
            <h3 className={`text-3xl font-black ${metrics.noActivityLeads > 0 ? "text-red-500 animate-pulse" : "text-foreground"}`}>
              {metrics.noActivityLeads}
            </h3>
            {metrics.noActivityLeads > 0 && (
              <p className="text-[10px] text-red-400 font-bold">Aguardando contato há +15m</p>
            )}
          </div>
          <div className={`h-12 w-12 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${metrics.noActivityLeads > 0 ? "bg-red-500/20 text-red-500" : "bg-white/5 text-muted-foreground"}`}>
            <AlertCircle className="h-6 w-6" />
          </div>
        </div>

        {/* Visitas Agendadas */}
        <div className="bg-card border border-white/10 hover:border-white/20 transition-all rounded-2xl p-5 flex items-center justify-between group">
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Visitas Agendadas</p>
            <h3 className="text-3xl font-black text-foreground">{metrics.scheduledAppointments}</h3>
            <p className="text-[10px] text-primary font-bold">Aguardando realização</p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-110 transition-transform">
            <Compass className="h-6 w-6" />
          </div>
        </div>

        {/* Taxa de Comparecimento */}
        <div className="bg-card border border-white/10 hover:border-white/20 transition-all rounded-2xl p-5 flex items-center justify-between group">
          <div className="space-y-2">
            <p className="text-xs font-black text-muted-foreground uppercase tracking-widest">Taxa de Comparecimento</p>
            <h3 className="text-3xl font-black text-emerald-500">{metrics.showRate}%</h3>
            <p className="text-[10px] text-muted-foreground font-bold">
              Realizadas: {metrics.realizedAppointments} | Faltas: {metrics.noShowAppointments}
            </p>
          </div>
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center group-hover:scale-110 transition-transform">
            <Award className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico do Funil de Conversão */}
        <div className="bg-card border border-white/10 rounded-2xl p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">Funil de Vendas do CRM</h4>
              <p className="text-xs text-muted-foreground">Distribuição volumétrica de leads por etapa do pipeline</p>
            </div>
            <TrendingUp className="h-4 w-4 text-primary" />
          </div>

          <div className="h-64">
            {funnelData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Nenhum dado cadastrado
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={funnelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                  <XAxis dataKey="name" stroke="#666" fontSize={10} tickLine={false} />
                  <YAxis stroke="#666" fontSize={10} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#121212", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                    itemStyle={{ color: "#fff", fontSize: "12px" }}
                    labelStyle={{ fontSize: "10px", color: "#666" }}
                  />
                  <Bar dataKey="Quantidade" fill="#8B5CF6" radius={[6, 6, 0, 0]}>
                    {funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Temperatura dos Leads */}
        <div className="bg-card border border-white/10 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground">Temperatura de Leads</h4>
              <p className="text-xs text-muted-foreground">Classificação de interesse comercial</p>
            </div>
            <Compass className="h-4 w-4 text-primary" />
          </div>

          <div className="space-y-4">
            {temperatureData.map((item, index) => {
              const total = metrics.totalLeads || 1;
              const pct = Math.round((item.Quantidade / total) * 100);
              const color = TEMP_COLORS[item.name] || "#666";

              return (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-foreground">
                    <span>{item.name}</span>
                    <span className="font-mono text-muted-foreground">{item.Quantidade} leads ({pct}%)</span>
                  </div>
                  <div className="w-full bg-white/5 h-2.5 rounded-full overflow-hidden border border-white/5">
                    <div 
                       className="h-full rounded-full transition-all duration-500" 
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
            
            {temperatureData.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">Nenhum lead para classificar.</p>
            )}
          </div>
        </div>
      </div>

      {/* Gráfico de Origens dos Leads */}
      <div className="bg-card border border-white/10 rounded-2xl p-5 space-y-4">
        <div className="space-y-1">
          <h4 className="text-sm font-bold text-foreground">Origem de Entrada dos Leads</h4>
          <p className="text-xs text-muted-foreground">Canais que estão gerando contatos comerciais</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <div className="h-48">
            {sourceData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                Sem informações de origem
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sourceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ backgroundColor: "#121212", borderColor: "rgba(255,255,255,0.1)", borderRadius: "12px" }}
                    itemStyle={{ color: "#fff", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {sourceData.map((item, index) => {
              const color = COLORS[index % COLORS.length];
              return (
                <div key={item.name} className="flex items-center gap-2 text-xs">
                  <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="font-bold text-foreground truncate">{item.name}:</span>
                  <span className="font-mono text-muted-foreground shrink-0">{item.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
