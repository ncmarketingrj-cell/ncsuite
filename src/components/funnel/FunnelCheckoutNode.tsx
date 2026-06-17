import { memo } from "react";
import { Handle, Position } from "@xyflow/react";
import { CreditCard, Zap, MoreHorizontal } from "lucide-react";

export const FunnelCheckoutNode = memo(({ id, data, selected }: { id: string, data: any, selected: boolean }) => {
  return (
    <>
      <Handle type="target" position={Position.Top} className="w-3 h-3 border-2 border-background bg-muted-foreground" />
      <div 
        className={`relative group w-[240px] rounded-2xl border transition-all duration-300 backdrop-blur-md overflow-hidden ${
          selected ? "border-emerald-500 shadow-xl shadow-emerald-500/20 bg-background/90" : "border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10"
        }`}
      >
        <div className="h-1.5 w-full bg-emerald-500" />
        
        <div className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center bg-emerald-500/20">
                <CreditCard className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-500">Checkout</p>
                <h3 className="text-sm font-bold mt-0.5">{data.label || "Pagamento Stripe"}</h3>
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
          
          <div className="mt-4 flex items-center gap-2 p-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10">
             <Zap className="h-3 w-3 text-emerald-500" />
             <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">1-Click Upsell Ready</span>
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="w-3 h-3 border-2 border-background bg-emerald-500" />
    </>
  );
});
