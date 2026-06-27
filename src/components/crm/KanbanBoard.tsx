import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { Loader2, Target } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";
import { LeadDrawer } from "./LeadDrawer";
import { useQuery } from "@tanstack/react-query";

interface KanbanBoardProps {
  readOnly?: boolean;
  clientId?: string; // used mostly in client portal to enforce isolation
  pipelineId?: string; // the specific funnel to load
  myLeadsOnly?: boolean;
  searchQuery?: string;
  currentUserId?: string;
}

export function KanbanBoard({ 
  readOnly = false, 
  clientId, 
  pipelineId, 
  myLeadsOnly, 
  searchQuery = "",
  currentUserId
}: KanbanBoardProps) {
  
  const [leads, setLeads] = useState<any[]>([]);
  const [loadingLeads, setLoadingLeads] = useState(true);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<any | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  // Fetch Pipeline Stages (Columns)
  const { data: stages = [], isLoading: loadingStages } = useQuery({
    queryKey: ["crm_pipeline_stages_board", pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];
      const { data, error } = await supabase
        .from("crm_pipeline_stages")
        .select("*")
        .eq("pipeline_id", pipelineId)
        .order("stage_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!pipelineId
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchLeads();
  }, [clientId, pipelineId, myLeadsOnly, currentUserId]);

  const fetchLeads = async () => {
    if (!pipelineId) {
      setLeads([]);
      setLoadingLeads(false);
      return;
    }

    setLoadingLeads(true);
    let query = supabase.from("crm_leads").select("*");
    
    // Portal do cliente enforce filter
    if (clientId) {
      query = query.eq("client_id", clientId);
    }
    
    // Pipiline enforce filter
    query = query.eq("pipeline_id", pipelineId);

    // Meus Leads filter
    if (myLeadsOnly && currentUserId) {
      query = query.eq("assigned_to", currentUserId);
    }
    
    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar leads do CRM.");
    } else {
      setLeads(data || []);
    }
    setLoadingLeads(false);
  };

  // Filter leads locally by search query
  const filteredLeads = leads.filter(l => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.phone && l.phone.includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q))
    );
  });

  const handleDragStart = (event: any) => {
    if (readOnly) return;
    const { active } = event;
    setActiveId(active.id);
    setActiveLead(leads.find(l => l.id === active.id));
  };

  const handleDragOver = (event: any) => {
    if (readOnly) return;
    // For sorting inside columns, can implement later
  };

  const handleDragEnd = async (event: any) => {
    if (readOnly) return;
    const { active, over } = event;
    setActiveId(null);
    setActiveLead(null);

    if (!over) return;

    const leadId = active.id;
    const overId = over.id;

    // Achar em qual coluna soltou
    // O id do "over" pode ser a coluna inteira (stage_id) ou outro lead.
    const isOverColumn = stages.some(s => s.id === overId);
    let targetStageId = overId;
    
    if (!isOverColumn) {
      // Se soltou sobre outro lead, pega o stage desse lead
      const targetLead = leads.find(l => l.id === overId);
      targetStageId = targetLead?.stage_id;
    }

    if (!targetStageId) return;

    const leadIndex = leads.findIndex((l) => l.id === leadId);
    if (leadIndex === -1) return;

    const currentLead = leads[leadIndex];

    if (currentLead.stage_id !== targetStageId) {
      const stageName = stages.find(s => s.id === targetStageId)?.name || "Nova Etapa";

      // Atualiza estado local optimisticamente
      const newLeads = [...leads];
      newLeads[leadIndex].stage_id = targetStageId;
      newLeads[leadIndex].updated_at = new Date().toISOString();
      setLeads(newLeads);

      // Persiste no banco
      const { error } = await supabase
        .from("crm_leads")
        .update({ stage_id: targetStageId, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (error) {
        toast.error("Erro ao mover card.");
        fetchLeads(); // Reverte estado local se der erro
      } else {
        // Registra atividade
        await supabase.from("crm_activities").insert({
          lead_id: leadId,
          type: "StatusChange",
          description: `Lead movido para a etapa: ${stageName}`,
        });
      }
    }
  };

  const openDrawer = (lead: any) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  if (loadingLeads || loadingStages) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!pipelineId || stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/50 border border-white/5 rounded-2xl bg-white/[0.01]">
        <Target className="h-10 w-10 mb-3 opacity-20" />
        <p className="text-sm font-bold">Nenhum funil ativo.</p>
        {!readOnly && <p className="text-xs mt-1">Crie um funil ou adicione etapas para começar.</p>}
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-200px)] w-full overflow-x-auto custom-scrollbar pb-4">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-full min-w-max px-2">
          {stages.map((stage) => {
            // Mapeia os leads baseados no stage_id. Fallback pra status se ainda n tiver mapeado (safeguard)
            const columnLeads = filteredLeads.filter((l) => l.stage_id === stage.id || (!l.stage_id && l.status === stage.name));
            
            // Map stage object to column object expected by KanbanColumn
            const colObj = { id: stage.id, title: stage.name, color: stage.color };

            return (
              <KanbanColumn 
                key={stage.id} 
                column={colObj} 
                leads={columnLeads} 
                onClickLead={openDrawer}
                readOnly={readOnly}
              />
            );
          })}
        </div>

        <DragOverlay>
          {activeLead ? <LeadCard lead={activeLead} isDragging readOnly={readOnly} /> : null}
        </DragOverlay>
      </DndContext>

      <LeadDrawer 
        lead={selectedLead} 
        open={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        onUpdate={fetchLeads} 
        readOnly={readOnly}
      />
    </div>
  );
}
