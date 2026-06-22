import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { Filter, Search, Plus, Settings, User } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PipelineManagerModal } from "@/components/crm/PipelineManagerModal";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/crm")({
  head: () => ({ meta: [{ title: "Pipeline SDR — NC Performance Suite" }] }),
  component: CrmPage,
});

function CrmPage() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [myLeadsOnly, setMyLeadsOnly] = useState(false);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [showManager, setShowManager] = useState(false);

  // Load available pipelines
  const { data: pipelines = [], isLoading: loadingPipelines } = useQuery({
    queryKey: ["crm_pipelines_dropdown"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crm_pipelines")
        .select("id, name, clients(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    }
  });

  // Auto-select the first pipeline if none is selected
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    } else if (pipelines.length === 0 && !loadingPipelines) {
      setSelectedPipelineId("");
    }
  }, [pipelines, selectedPipelineId, loadingPipelines]);

  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-4">
      <PageHeader 
        eyebrow="Multi-Tenant CRM" 
        title="Pipeline de SDR" 
        description="Gestão de Leads e Cadência Comercial em funis customizados."
        actions={
          <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
            {/* Pipeline Selector */}
            <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold w-full sm:w-auto">
              <Filter className="h-3.5 w-3.5 text-primary" />
              <select 
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="bg-transparent border-none text-foreground font-black focus:outline-none cursor-pointer w-full sm:w-auto"
              >
                {pipelines.length === 0 ? (
                  <option value="">Nenhum funil criado</option>
                ) : (
                  pipelines.map(p => (
                    <option key={p.id} value={p.id} className="bg-card text-foreground">
                      {p.name} {p.clients?.name ? `(${p.clients.name})` : ""}
                    </option>
                  ))
                )}
              </select>
            </div>

            <button 
              onClick={() => setShowManager(true)}
              className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Funis</span>
            </button>

            {/* My Leads Filter */}
            <button 
              onClick={() => setMyLeadsOnly(!myLeadsOnly)}
              className={`flex items-center justify-center gap-2 border rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 ${
                myLeadsOnly 
                  ? "bg-primary/10 text-primary border-primary/30" 
                  : "bg-white/5 text-muted-foreground border-white/10 hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Meus Leads</span>
            </button>

            {/* Search */}
            <div className="relative flex-1 sm:w-48 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar lead, telefone..."
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            
            <button className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-1.5 text-xs font-bold transition-all shrink-0 shadow-lg shadow-primary/20">
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Novo Lead</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 mt-4 overflow-hidden relative">
        {pipelines.length === 0 && !loadingPipelines ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Filter className="h-12 w-12 opacity-20 mb-3" />
            <p className="text-sm font-bold">Nenhum funil encontrado</p>
            <p className="text-xs mt-1">Crie um funil para começar a gerenciar seus leads.</p>
            <button 
              onClick={() => setShowManager(true)}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              Gerenciar Funis
            </button>
          </div>
        ) : (
          <KanbanBoard 
            readOnly={false} 
            pipelineId={selectedPipelineId} 
            myLeadsOnly={myLeadsOnly} 
            searchQuery={searchQuery}
            currentUserId={user?.id}
          />
        )}
      </div>

      <PipelineManagerModal isOpen={showManager} onClose={() => setShowManager(false)} />
    </div>
  );
}
