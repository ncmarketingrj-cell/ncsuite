import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { FileText, MoreHorizontal } from "lucide-react";

type NodeData = {
  label: string;
  icon?: any;
  color?: string;
  payload?: any;
  onContextMenuClick?: (e: React.MouseEvent, nodeId: string) => void;
};

export const FunnelStageNode = memo(({ id, data, selected }: { id: string, data: NodeData, selected: boolean }) => {
  const Icon = data.icon || FileText;
  const colorClass = data.color || "bg-indigo-500";

  return (
    <>
      <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-background bg-muted-foreground" />
      <div 
        className={`relative group w-[240px] rounded-2xl border transition-all duration-300 backdrop-blur-md overflow-hidden ${
          selected ? "border-primary shadow-xl shadow-primary/20 bg-background/90" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
        }`}
      >
        <div className={`h-1.5 w-full ${colorClass}`} />
        
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${colorClass.replace("bg-", "bg-opacity-20 text-")}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Etapa Padrão</p>
                <h3 className="text-sm font-bold mt-0.5">{data.label || "Nova Etapa"}</h3>
              </div>
            </div>
            <button 
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-all text-muted-foreground hover:text-white"
              onClick={(e) => {
                e.stopPropagation();
                if (data.onContextMenuClick) data.onContextMenuClick(e, id);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          
          {data.payload?.markdown && (
            <div className="mt-3 p-2 rounded-lg bg-black/20 border border-white/5">
              <p className="text-xs text-muted-foreground truncate">{data.payload.markdown}</p>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-background bg-primary" />
    </>
  );
});
