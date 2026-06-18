import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { Bot, Sparkles, MoreHorizontal } from "lucide-react";

export const FunnelAiNode = memo(({ id, data, selected }: { id: string, data: any, selected: boolean }) => {
  return (
    <>
      <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-background bg-muted-foreground" />
      <div 
        className={`relative group w-[260px] rounded-2xl border transition-all duration-300 backdrop-blur-md overflow-hidden ${
          selected ? "border-amber-500 shadow-xl shadow-amber-500/20 bg-background/90" : "border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10"
        }`}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 to-orange-500/10 pointer-events-none" />
        <div className="absolute top-0 right-0 p-2">
           <Sparkles className="h-4 w-4 text-amber-500 opacity-50" />
        </div>
        
        <div className="p-4 relative z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-amber-500/20">
                <Bot className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-500">Agente RAG</p>
                <h3 className="text-sm font-bold mt-0.5">{data.label || "AI Automotiva"}</h3>
              </div>
            </div>
            <button 
              className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-black/20 transition-all text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                if (data.onContextMenuClick) data.onContextMenuClick(e, id);
              }}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
          
          <div className="mt-4 p-2.5 rounded-lg border border-amber-500/20 bg-black/40 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] text-muted-foreground font-mono">Knowledge Base</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Ativo</span>
            </div>
            <p className="text-xs text-foreground/80 truncate">
              {data.payload?.kb_name || "Nenhuma base selecionada"}
            </p>
          </div>

          {/* CRO Performance Heatmap Stats */}
          {data.croMode && (
            <div className="mt-3 pt-2.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-muted-foreground text-amber-500/80">Triados:</span>{" "}
                <span className="font-bold text-amber-400">{data.payload?.leads || 85}</span>
              </div>
              <div>
                <span className="text-muted-foreground text-amber-500/80">Q. Rate:</span>{" "}
                <span className="font-bold text-emerald-400">{data.payload?.conversion || 70}%</span>
              </div>
            </div>
          )}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-background bg-amber-500" />
    </>
  );
});
