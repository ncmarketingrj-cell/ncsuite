import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { LeadCard } from "./LeadCard";

export function KanbanColumn({ 
  column, 
  leads, 
  onClickLead,
  readOnly = false
}: { 
  column: any; 
  leads: any[]; 
  onClickLead?: (lead: any) => void;
  readOnly?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    disabled: readOnly,
  });

  return (
    <div className="flex flex-col flex-shrink-0 w-80 bg-white/[0.02] border border-white/5 rounded-2xl overflow-hidden h-full">
      <div className="p-4 border-b border-white/5 bg-black/20 flex items-center justify-between">
        <h3 className="text-xs font-black uppercase tracking-widest text-foreground/80">{column.title}</h3>
        <span className="bg-white/10 text-white text-[10px] px-2 py-0.5 rounded-full font-mono font-bold">
          {leads.length}
        </span>
      </div>

      <div 
        ref={setNodeRef} 
        className={`flex-1 p-3 overflow-y-auto custom-scrollbar flex flex-col gap-3 transition-colors ${isOver ? 'bg-primary/5' : ''}`}
      >
        <SortableContext items={leads.map(l => l.id)} strategy={verticalListSortingStrategy} disabled={readOnly}>
          {leads.map((lead) => (
            <LeadCard 
              key={lead.id} 
              lead={lead} 
              onClick={() => onClickLead?.(lead)} 
              readOnly={readOnly}
            />
          ))}
        </SortableContext>
        
        {leads.length === 0 && (
          <div className="h-full flex items-center justify-center p-4 border-2 border-dashed border-white/5 rounded-xl">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 text-center">Arraste leads aqui</p>
          </div>
        )}
      </div>
    </div>
  );
}
