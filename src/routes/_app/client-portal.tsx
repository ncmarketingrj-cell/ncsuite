import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { Users, PhoneOutgoing, CalendarCheck, ShieldCheck } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/client-portal")({
  head: () => ({ meta: [{ title: "Portal do Cliente — NC Performance Suite" }] }),
  component: ClientPortalPage,
});

function ClientPortalPage() {
  // Queries simples para montar o Dashboard Superior de Esforço da SDR
  // Na prática, a role client_store vai puxar automaticamente apenas os dados do próprio client_id
  
  const { data: metrics } = useQuery({
    queryKey: ["client-portal-metrics"],
    queryFn: async () => {
      const [leadsRes, activitiesRes, appointmentsRes] = await Promise.all([
        (supabase as any).from("crm_leads").select("*", { count: "exact", head: true }),
        (supabase as any).from("crm_activities").select("*", { count: "exact", head: true }),
        (supabase as any).from("crm_appointments").select("*", { count: "exact", head: true }).eq("status", "Agendado")
      ]);

      return {
        leadsCount: leadsRes.count || 0,
        activitiesCount: activitiesRes.count || 0,
        appointmentsCount: appointmentsRes.count || 0,
      };
    }
  });

  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-6">
      <PageHeader 
        eyebrow="Acesso Cliente" 
        title="Portal de Transparência Comercial" 
        description="Acompanhe em tempo real o trabalho da nossa equipe de SDRs (Pré-vendas) nos leads gerados pelas suas campanhas."
        actions={
          <div className="bg-success/10 border border-success/20 text-success px-4 py-2 rounded-full flex items-center gap-2 text-xs font-bold shadow-sm">
            <ShieldCheck className="h-4 w-4" />
            Modo Somente Leitura
          </div>
        }
      />

      {/* Métricas de Esforço */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Volume de Leads</p>
            <p className="text-2xl font-black font-mono mt-0.5">{metrics?.leadsCount || 0}</p>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
            <PhoneOutgoing className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Tentativas de Contato (Follow-up)</p>
            <p className="text-2xl font-black font-mono mt-0.5">{metrics?.activitiesCount || 0}</p>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center gap-4 border border-success/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
          <div className="h-12 w-12 rounded-xl bg-success/10 text-success flex items-center justify-center shrink-0">
            <CalendarCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-success">Visitas Agendadas</p>
            <p className="text-2xl font-black font-mono mt-0.5">{metrics?.appointmentsCount || 0}</p>
          </div>
        </div>
      </div>

      {/* Kanban Board - Somente Leitura */}
      <div className="flex-1 mt-2">
        <div className="mb-4">
          <h3 className="text-sm font-bold flex items-center gap-2">
            Funil Comercial 
            <span className="text-[10px] font-normal text-muted-foreground px-2 py-0.5 rounded-full bg-white/5">Sincronizado em tempo real</span>
          </h3>
        </div>
        <KanbanBoard readOnly={true} />
      </div>
    </div>
  );
}
