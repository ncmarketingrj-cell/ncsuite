import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock, Phone, MessageSquare, AlertCircle } from "lucide-react";
import { differenceInHours } from "date-fns";

export function LeadCard({ 
  lead, 
  isDragging, 
  onClick,
  readOnly = false
}: { 
  lead: any; 
  isDragging?: boolean; 
  onClick?: () => void;
  readOnly?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ 
    id: lead.id, 
    data: { ...lead },
    disabled: readOnly
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.3 : 1,
  };

  // Cadência: Verificar se faz mais de 24h desde a última atualização/atividade
  // Se estiver nas colunas de trabalho (Contato/Negociação) e sem atualizar
  const hoursSinceUpdate = differenceInHours(new Date(), new Date(lead.updated_at || lead.created_at));
  const isDelayed = hoursSinceUpdate > 24 && !["Vendido", "Perdido"].includes(lead.status);

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...(readOnly ? {} : attributes)}
      {...(readOnly ? {} : listeners)}
      onClick={(e) => {
        // Se clicar (sem arrastar muito), abre a gaveta
        if (!isDragging) {
          e.stopPropagation();
          onClick?.();
        }
      }}
      className={`
        bg-card border rounded-xl p-3 shadow-sm flex flex-col gap-3 cursor-grab active:cursor-grabbing hover:border-white/20 transition-all group
        ${isDelayed ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'}
        ${isDragging ? 'shadow-2xl scale-105 border-primary/50 bg-primary/5 z-50' : ''}
      `}
    >
      <div className="flex justify-between items-start gap-2">
        <h4 className="text-sm font-bold text-foreground leading-tight">{lead.name}</h4>
        {isDelayed && (
          <span className="shrink-0 flex items-center gap-1 bg-red-500/10 text-red-500 text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border border-red-500/20">
            <AlertCircle className="h-3 w-3" />
            +24h
          </span>
        )}
      </div>

      <div className="flex flex-col gap-1.5 mt-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Phone className="h-3.5 w-3.5" />
          <span>{lead.phone || 'Sem telefone'}</span>
        </div>
        {lead.vehicle_interest && (
          <div className="flex items-center gap-2 text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-1 rounded w-fit">
            {lead.vehicle_interest}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-white/5 mt-1">
        <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${lead.negotiation_level === 'Quente' ? 'bg-red-500/20 text-red-500' : lead.negotiation_level === 'Morno' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
          {lead.negotiation_level || 'Frio'}
        </span>
        
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
          <Clock className="h-3 w-3" />
          {hoursSinceUpdate}h atrás
        </div>
      </div>
    </div>
  );
}
