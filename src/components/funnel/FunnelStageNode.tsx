import { memo, useState } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  FileText, Megaphone, Globe,
  MessageCircle, ShoppingCart, Mail, Instagram, Target, Pencil, MoreHorizontal
} from "lucide-react";
import { useFunnelState } from "@/hooks/useFunnelState";

const NODE_TYPE_ICONS: Record<string, any> = {
  Anúncio: Megaphone,
  "Landing Page": Globe,
  WhatsApp: MessageCircle,
  Checkout: ShoppingCart,
  Email: Mail,
  Instagram: Instagram,
  "Captura de Lead": Target,
  Outro: FileText,
};

const ACCENT_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  Anúncio:            { bg: "bg-blue-500/15",    text: "text-blue-400",    border: "border-blue-500/40",    glow: "#3b82f6" },
  "Landing Page":     { bg: "bg-violet-500/15",  text: "text-violet-400",  border: "border-violet-500/40",  glow: "#8b5cf6" },
  WhatsApp:           { bg: "bg-emerald-500/15", text: "text-emerald-400", border: "border-emerald-500/40", glow: "#10b981" },
  Checkout:           { bg: "bg-amber-500/15",   text: "text-amber-400",   border: "border-amber-500/40",   glow: "#f59e0b" },
  Email:              { bg: "bg-sky-500/15",      text: "text-sky-400",     border: "border-sky-500/40",     glow: "#0ea5e9" },
  Instagram:          { bg: "bg-pink-500/15",     text: "text-pink-400",    border: "border-pink-500/40",    glow: "#ec4899" },
  "Captura de Lead":  { bg: "bg-orange-500/15",  text: "text-orange-400",  border: "border-orange-500/40",  glow: "#f97316" },
  Outro:              { bg: "bg-slate-500/15",    text: "text-slate-400",   border: "border-slate-500/40",   glow: "#64748b" },
};

type NodeData = {
  label: string;
  nodeKind?: string;
  payload?: any;
  color?: string;
  onContextMenuClick?: (e: React.MouseEvent, nodeId: string) => void;
};

export const FunnelStageNode = memo(({ id, data, selected }: { id: string; data: NodeData; selected: boolean }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const { updateNodeLabel, setSelectedNodeId } = useFunnelState();
  const kind = data.nodeKind || "Anúncio";
  const Icon = NODE_TYPE_ICONS[kind] || FileText;
  const colors = ACCENT_COLORS[kind] || ACCENT_COLORS["Outro"];

  const accentColor = data.color || colors.glow;

  return (
    <>
      {/* Top handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-4 !h-4 !border-2 !border-background !rounded-full transition-all"
        style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
      />

      {/* Card */}
      <div
        className={`
          group relative w-[240px] rounded-2xl border transition-all duration-200 overflow-hidden cursor-default
          bg-card/90 backdrop-blur-xl
          ${selected
            ? `shadow-xl`
            : "border-border/70 hover:border-border hover:shadow-lg"
          }
        `}
        style={
          selected
            ? { borderColor: `${accentColor}60`, boxShadow: `0 0 0 1.5px ${accentColor}40, 0 8px 32px ${accentColor}15` }
            : {}
        }
        onDoubleClick={() => setSelectedNodeId(id)}
      >
        {/* Top accent stripe */}
        <div className="h-1 w-full" style={{ background: accentColor }} />

        <div className="p-3.5">
          {/* Header row */}
          <div className="flex items-start gap-2.5">
            <div
              className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${accentColor}18` }}
            >
              <Icon className="w-4 h-4" style={{ color: accentColor }} />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: accentColor }}>
                {kind}
              </p>
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

            {/* Actions: edit + menu — sempre visíveis */}
            <div className="nodrag flex-shrink-0 flex items-center gap-0.5">
              <button
                className="p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                title="Editar nome"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditingLabel(true);
                }}
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-muted transition-all text-muted-foreground hover:text-foreground"
                title="Mais opções"
                onClick={(e) => {
                  e.stopPropagation();
                  if (data.onContextMenuClick) data.onContextMenuClick(e, id);
                }}
              >
                <MoreHorizontal className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Content preview / edit CTA */}
          {data.payload?.markdown ? (
            <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-muted/40 border border-border/50">
              <p
                className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: (data.payload.markdown as string).replace(/<[^>]*>/g, "") }}
              />
            </div>
          ) : (
            <button
              className="nodrag mt-2.5 w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-muted/30 hover:bg-muted/60 border border-dashed border-border/50 hover:border-border transition-all text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedNodeId(id)}
            >
              <Pencil className="w-3 h-3" />
              <span className="text-[10px]">Editar copy desta etapa...</span>
            </button>
          )}
        </div>

        {/* Bottom edit hint */}
        <div className="px-3.5 pb-2.5 flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground/50">Duplo-clique para editar</span>
        </div>

        {/* Bottom glow line on hover */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)` }}
        />
      </div>

      {/* Bottom handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-4 !h-4 !border-2 !border-background !rounded-full transition-all"
        style={{ background: accentColor, boxShadow: `0 0 8px ${accentColor}60` }}
      />

      {/* Side handles */}
      <Handle
        type="source"
        position={Position.Right}
        id="right"
        className="!w-3 !h-3 !border-2 !border-background !rounded-full !opacity-0 hover:!opacity-100 !transition-opacity"
        style={{ background: accentColor }}
      />
      <Handle
        type="target"
        position={Position.Left}
        id="left"
        className="!w-3 !h-3 !border-2 !border-background !rounded-full !opacity-0 hover:!opacity-100 !transition-opacity"
        style={{ background: accentColor }}
      />
    </>
  );
});
