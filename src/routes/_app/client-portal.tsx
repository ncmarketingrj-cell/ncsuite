import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { 
  Users, PhoneOutgoing, CalendarCheck, ShieldCheck, 
  Calendar, Clock, MessageSquare, 
  Filter, Smile, Phone, Inbox, Target
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/client-portal")({
  head: () => ({ meta: [{ title: "Portal do Cliente — NC Performance Suite" }] }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  const { user } = useAuth();
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  // 1. Carrega dados do perfil
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile_portal", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const isAgencyUser = profile?.role === "admin" || profile?.role === "agency_sdr" || profile?.role === "gestor_trafego" || profile?.role === "ceo" || profile?.role === "gerente";

  // 2. Carrega lista de clientes (Apenas Agência)
  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list_portal"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data || [];
    },
    enabled: isAgencyUser,
  });

  useEffect(() => {
    if (profile?.role === "client_store" && profile?.client_id) {
      setSelectedClientId(profile.client_id);
    } else if (isAgencyUser && clients.length > 0 && !selectedClientId) {
      setSelectedClientId(clients[0].id);
    }
  }, [profile, clients]);

  // 3. Carrega pipelines do cliente
  const { data: pipelines = [] } = useQuery({
    queryKey: ["client_pipelines", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data } = await supabase.from("crm_pipelines").select("*").eq("client_id", selectedClientId).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedClientId
  });

  useEffect(() => {
    if (pipelines.length > 0) {
      setSelectedPipelineId(pipelines[0].id);
    } else {
      setSelectedPipelineId("");
    }
  }, [pipelines]);

  // 4. Carrega estágios do funil selecionado para mapeamento semântico
  const { data: stages = [] } = useQuery({
    queryKey: ["client_pipeline_stages", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return [];
      const { data } = await supabase.from("crm_pipeline_stages").select("*").eq("pipeline_id", selectedPipelineId);
      return data || [];
    },
    enabled: !!selectedPipelineId
  });

  // 5. Busca leads e agendamentos
  const { data: portalData, isLoading } = useQuery({
    queryKey: ["client-portal-data", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return { leads: [], appointments: [] };

      let leadsQuery = supabase.from("crm_leads").select("*").eq("pipeline_id", selectedPipelineId);
      let apptsQuery = supabase.from("crm_appointments").select("*, crm_leads!inner(name, phone, client_id, pipeline_id)").eq("crm_leads.pipeline_id", selectedPipelineId);

      const [leadsRes, apptsRes] = await Promise.all([
        leadsQuery.order("created_at", { ascending: false }),
        apptsQuery.order("appointment_date", { ascending: true })
      ]);

      return {
        leads: leadsRes.data || [],
        appointments: apptsRes.data || []
      };
    },
    enabled: !!selectedPipelineId,
  });

  const leads = portalData?.leads || [];
  const appointments = portalData?.appointments || [];

  // ── PROCESSAMENTO DE MÉTRICAS USANDO SEMÂNTICA DAS ETAPAS ────────────────
  
  // Agrupa stages por cor para dar sentido semântico
  const neutralStages = stages.filter(s => s.color === 'neutral').map(s => s.id);
  const activeStages = stages.filter(s => ['amber', 'blue'].includes(s.color)).map(s => s.id);
  const successStages = stages.filter(s => s.color === 'success').map(s => s.id);

  const totalLeads = leads.length;
  const leadsEmNegociacao = leads.filter((l: any) => activeStages.includes(l.stage_id)).length;
  
  // Agendados vem da tabela de appointments real
  const proximasVisitas = appointments.filter((appt: any) => appt.status === "Agendado");
  const leadsAgendados = proximasVisitas.length;

  const leadsRecebidosHoje = leads.filter((l: any) => {
    return new Date(l.created_at).toDateString() === new Date().toDateString();
  }).length;

  const leadsSemResposta = leads.filter((l: any) => neutralStages.includes(l.stage_id)).length;
  const leadsRespondidosNaoAgendados = leads.filter((l: any) => activeStages.includes(l.stage_id)).length;

  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-6">
      <PageHeader 
        eyebrow="Acesso Cliente" 
        title="Portal de Transparência Comercial" 
        description="Acompanhe em tempo real o trabalho da nossa equipe de SDRs."
        actions={
          <div className="flex flex-col sm:flex-row items-center gap-3">
            {isAgencyUser && clients.length > 0 && (
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold">
                <Filter className="h-3.5 w-3.5 text-primary" />
                <select 
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="bg-transparent border-none text-foreground font-black focus:outline-none cursor-pointer"
                >
                  {clients.map((c: any) => (
                    <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            
            {pipelines.length > 0 && (
              <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold">
                <Target className="h-3.5 w-3.5 text-purple-400" />
                <select 
                  value={selectedPipelineId}
                  onChange={(e) => setSelectedPipelineId(e.target.value)}
                  className="bg-transparent border-none text-foreground font-black focus:outline-none cursor-pointer"
                >
                  {pipelines.map((p: any) => (
                    <option key={p.id} value={p.id} className="bg-card text-foreground">{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="bg-success/10 border border-success/20 text-success px-4 py-1.5 rounded-full flex items-center gap-2 text-xs font-bold shadow-sm">
              <ShieldCheck className="h-4 w-4" />
              Modo Leitura
            </div>
          </div>
        }
      />

      {/* Grid de KPIs Premium */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-white/15 transition-all">
          <div className="absolute top-0 right-0 h-16 w-16 bg-blue-500/5 rounded-bl-full group-hover:bg-blue-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total de Leads</p>
              <h4 className="text-2xl font-black font-mono mt-0.5">{totalLeads}</h4>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-xs text-muted-foreground">
            <span>Recebidos hoje</span>
            <span className="font-bold font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">+{leadsRecebidosHoje}</span>
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-white/15 transition-all">
          <div className="absolute top-0 right-0 h-16 w-16 bg-amber-500/5 rounded-bl-full group-hover:bg-amber-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <PhoneOutgoing className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Em Negociação</p>
              <h4 className="text-2xl font-black font-mono mt-0.5">{leadsEmNegociacao}</h4>
            </div>
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-white/15 transition-all">
          <div className="absolute top-0 right-0 h-16 w-16 bg-red-500/5 rounded-bl-full group-hover:bg-red-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Não Respondidos</p>
              <h4 className="text-2xl font-black font-mono mt-0.5 text-red-400">{leadsSemResposta}</h4>
            </div>
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-panel p-5 rounded-2xl relative overflow-hidden group hover:border-white/15 transition-all">
          <div className="absolute top-0 right-0 h-16 w-16 bg-purple-500/5 rounded-bl-full group-hover:bg-purple-500/10 transition-colors" />
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Em Contato</p>
              <h4 className="text-2xl font-black font-mono mt-0.5">{leadsRespondidosNaoAgendados}</h4>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel p-6 rounded-2xl border border-success/20 flex flex-col justify-between relative overflow-hidden shadow-[0_0_20px_rgba(34,197,94,0.05)]">
          <div className="absolute -top-10 -right-10 h-32 w-32 bg-success/5 rounded-full blur-xl" />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-2xl bg-success/10 text-success flex items-center justify-center">
                <CalendarCheck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-success">Total de Agendados</p>
                <h4 className="text-4xl font-black font-mono mt-0.5 text-success">{leadsAgendados}</h4>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Leads qualificados e agendados pela equipe para visitar a loja.
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-success">
            <Smile className="h-4 w-4" /> Pronto para recebê-los na loja!
          </div>
        </div>

        <div className="glass-panel p-6 rounded-2xl lg:col-span-2 flex flex-col space-y-4 max-h-[350px]">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Agenda de Visitas Marcadas</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground bg-white/5 px-2.5 py-1 rounded-full">
              {proximasVisitas.length} Compromissos
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
            {proximasVisitas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="h-8 w-8 text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">Nenhuma visita agendada no momento.</p>
              </div>
            ) : (
              proximasVisitas.map((appt: any) => (
                <div key={appt.id} className="p-3.5 border border-white/5 rounded-xl bg-white/[0.01] flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{appt.crm_leads?.name}</span>
                      {appt.crm_leads?.phone && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {appt.crm_leads.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 text-primary text-xs font-bold px-2.5 py-1 rounded-lg">
                      <Calendar className="h-3.5 w-3.5" />
                      {new Date(appt.appointment_date).toLocaleDateString('pt-BR')}
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 text-foreground text-xs font-mono font-bold px-2.5 py-1 rounded-lg">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      {new Date(appt.appointment_date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 mt-4 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2">Funil Comercial</h3>
        {selectedPipelineId ? (
          <KanbanBoard readOnly={true} pipelineId={selectedPipelineId} clientId={selectedClientId} />
        ) : (
          <div className="p-8 text-center text-muted-foreground border border-white/5 rounded-2xl">
            Nenhum funil configurado para este cliente.
          </div>
        )}
      </div>
    </div>
  );
}
