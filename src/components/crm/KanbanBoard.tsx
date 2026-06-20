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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { KanbanColumn } from "./KanbanColumn";
import { LeadCard } from "./LeadCard";
import { LeadDrawer } from "./LeadDrawer";

const COLUMNS = [
  { id: "Novo Lead", title: "Novos Leads" },
  { id: "Tentativa de Contato", title: "Tentativa de Contato" },
  { id: "Em Negociação", title: "Em Negociação" },
  { id: "Visita Agendada", title: "Visita Agendada" },
  { id: "Vendido", title: "Vendido" },
  { id: "Perdido", title: "Perdido" },
];

export function KanbanBoard({ readOnly = false }: { readOnly?: boolean }) {
  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeLead, setActiveLead] = useState<any | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    fetchLeads();
  }, []);

  const fetchLeads = async () => {
    setLoading(true);
    // Para roles SDR ou admin, fetch traz todos que o RLS permite
    const { data, error } = await (supabase as any)
      .from("crm_leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar leads do CRM.");
    } else {
      setLeads(data || []);
    }
    setLoading(false);
  };

  const handleDragStart = (event: any) => {
    if (readOnly) return;
    const { active } = event;
    setActiveId(active.id);
    setActiveLead(leads.find(l => l.id === active.id));
  };

  const handleDragOver = (event: any) => {
    if (readOnly) return;
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    if (activeId === overId) return;

    const isActiveColumn = COLUMNS.some((col) => col.id === activeId);
    const isOverColumn = COLUMNS.some((col) => col.id === overId);

    // Mover entre colunas (atualizar status localmente antes do drop final)
    // Para simplificar, faremos a atualização principal no DragEnd
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
    const overColumnId = COLUMNS.some(c => c.id === overId) 
      ? overId 
      : leads.find(l => l.id === overId)?.status;

    if (!overColumnId) return;

    const leadIndex = leads.findIndex((l) => l.id === leadId);
    const currentLead = leads[leadIndex];

    if (currentLead.status !== overColumnId) {
      // Atualiza estado local optimisticamente
      const newLeads = [...leads];
      newLeads[leadIndex].status = overColumnId;
      newLeads[leadIndex].updated_at = new Date().toISOString();
      setLeads(newLeads);

      // Persiste no banco
      const { error } = await (supabase as any)
        .from("crm_leads")
        .update({ status: overColumnId, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (error) {
        toast.error("Erro ao mover card.");
        fetchLeads(); // Reverte estado local se der erro
      } else {
        // Registra atividade automática (se tivermos função no banco, ou fazer via app)
        await (supabase as any).from("crm_activities").insert({
          lead_id: leadId,
          type: "StatusChange",
          description: `Lead movido para ${overColumnId}`,
        });
      }
    }
  };

  const openDrawer = (lead: any) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
          {COLUMNS.map((col) => {
            const columnLeads = leads.filter((l) => l.status === col.id);
            return (
              <KanbanColumn 
                key={col.id} 
                column={col} 
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
      />
    </div>
  );
}
