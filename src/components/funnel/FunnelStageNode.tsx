import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  FileText, Megaphone, Globe,
  MessageCircle, ShoppingCart, Mail, Instagram, Target, Pencil,
  MoreHorizontal, TrendingUp, TrendingDown, RefreshCcw,
  BarChart2, Bell, Plus,
} from "lucide-react";
import { useFunnelState } from "@/hooks/useFunnelState";

const NODE_TYPE_ICONS: Record<string, any> = {
  Anúncio:            Megaphone,
  "Landing Page":     Globe,
  WhatsApp:           MessageCircle,
  Checkout:           ShoppingCart,
  Email:              Mail,
  Instagram:          Instagram,
  "Captura de Lead":  Target,
  Upsell:             TrendingUp,
  Downsell:           TrendingDown,
  "Cross-sell":       RefreshCcw,
  "Quiz/Enquete":     BarChart2,
  "E-mail Sequência": Bell,
  Remarketing:        Bell,
  Outro:              FileText,
};

const ACCENT_COLORS: Record<string, { glow: string }> = {
  Anúncio:            { glow: "#3b82f6" },
  "Landing Page":     { glow: "#8b5cf6" },
  WhatsApp:           { glow: "#10b981" },
  Checkout:           { glow: "#f59e0b" },
  Email:              { glow: "#0ea5e9" },
  Instagram:          { glow: "#ec4899" },
  "Captura de Lead":  { glow: "#f97316" },
  Upsell:             { glow: "#22c55e" },
  Downsell:           { glow: "#f97316" },
  "Cross-sell":       { glow: "#a855f7" },
  "Quiz/Enquete":     { glow: "#06b6d4" },
  "E-mail Sequência": { glow: "#0ea5e9" },
  Remarketing:        { glow: "#ef4444" },
  Outro:              { glow: "#64748b" },
};

type NodeData = {
  label: string;
  nodeKind?: string;
  payload?: any;
  color?: string;
  onContextMenuClick?: (e: React.MouseEvent, nodeId: string) => void;
  croMode?: boolean;
};

export const FunnelStageNode = memo(({ id, data, selected }: { id: string; data: NodeData; selected: boolean }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const { updateNodeLabel, setSelectedNodeId, addNodeAfter } = useFunnelState();
  const kind = data.nodeKind || "Anúncio";
  const Icon = NODE_TYPE_ICONS[kind] || FileText;
  const accentColor = data.color || ACCENT_COLORS[kind]?.glow || "#6b7280";

  return (
    <>
      {/* Target handle (top) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !border-2 !border-background !rounded-full transition-all"
        style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
      />

      {/* Card */}
      <div
        className="group relative w-[240px] rounded-2xl border transition-all duration-200 overflow-visible cursor-default bg-card/90 backdrop-blur-xl"
        style={
          selected
            ? { borderColor: `${accentColor}60`, boxShadow: `0 0 0 1.5px ${accentColor}40, 0 8px 32px ${accentColor}15` }
            : { borderColor: "hsl(var(--border) / 0.7)" }
        }
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDoubleClick={() => setSelectedNodeId(id)}
      >
        {/* Quick-add button (bottom center, on hover) */}
        {isHovered && (
          <button
            className="nodrag nopan absolute -bottom-5 left-1/2 -translate-x-1/2 z-20 h-6 w-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-bold hover:scale-110 transition-all shadow-lg"
            onMouseDown={e => e.stopPropagation()}
            onClick={e => { e.stopPropagation(); addNodeAfter(id, kind); }}
            title="Adicionar próxima etapa"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Top accent stripe */}
        <div className="h-1 w-full rounded-t-2xl" style={{ background: accentColor }} />

        <div className="p-3.5">
          {/* Header */}
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accentColor}18` }}>
              <Icon className="w-4 h-4" style={{ color: accentColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: accentColor }}>{kind}</p>
              {isEditingLabel ? (
                <input
                  autoFocus
                  className="nodrag w-full bg-transparent text-sm font-bold text-foreground border-b border-primary/50 outline-none pb-0.5"
                  value={data.label}
                  onChange={(e) => updateNodeLabel(id, e.target.value)}
                  onBlur={() => setIsEditingLabel(false)}
                  onKeyDown={(e) => e.key === "Enter" && setIsEditingLabel(false)}
                />
              ) : (
                <h3 className="text-sm font-bold text-foreground truncate leading-snug">{data.label || "Nova Etapa"}</h3>
              )}
            </div>
            <div className="nodrag flex-shrink-0 flex items-center gap-0.5">
              <button className="p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); setIsEditingLabel(true); }}>
                <Pencil className="w-3 h-3" />
              </button>
              <button className="p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                onClick={(e) => { e.stopPropagation(); if (data.onContextMenuClick) data.onContextMenuClick(e, id); }}>
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content preview */}
          {data.payload?.markdown ? (
            <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: (data.payload.markdown as string).replace(/<[^>]*>/g, "") }}
              />
            </div>
          ) : (
            <button className="nodrag mt-2.5 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 border border-dashed border-border/50 hover:border-border transition-all text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedNodeId(id)}>
              <Pencil className="w-3 h-3" />
              <span className="text-[10px]">Editar copy desta etapa...</span>
            </button>
          )}

          {/* CRO mode stats */}
          {data.croMode && (
            <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-muted-foreground">Volume:</span>{" "}
                <span className="font-bold text-foreground">{data.payload?.leads || 120}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Conversão:</span>{" "}
                <span className={`font-bold ${Number(data.payload?.conversion || 100) < 30 ? "text-destructive font-extrabold animate-pulse" : "text-emerald-400"}`}>
                  {data.payload?.conversion || 100}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Bottom hint */}
        <div className="px-3.5 pb-2.5">
          <span className="text-[9px] text-muted-foreground/40">Duplo-clique para editar</span>
        </div>

        {/* Hover glow line */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity rounded-b-2xl"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)` }}
        />
      </div>

      {/* Source handle (bottom) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2 !border-background !rounded-full transition-all"
        style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
      />

      {/* Side handles */}
      <Handle type="source" position={Position.Right} id="right"
        className="!w-3 !h-3 !border-2 !border-background !rounded-full !opacity-0 hover:!opacity-100 !transition-opacity"
        style={{ background: accentColor }} />
      <Handle type="target" position={Position.Left} id="left"
        className="!w-3 !h-3 !border-2 !border-background !rounded-full !opacity-0 hover:!opacity-100 !transition-opacity"
        style={{ background: accentColor }} />
    </>
  );
});
