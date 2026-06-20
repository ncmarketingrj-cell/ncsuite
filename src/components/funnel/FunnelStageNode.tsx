import { memo, useRef, useState, Fragment } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  FileText, Megaphone, Globe, MessageCircle, ShoppingCart, Mail,
  Camera, Target, Pencil, TrendingUp, TrendingDown, RefreshCcw,
  BarChart2, Bell, Plus, Trash2,
} from "lucide-react";
import { useFunnelState } from "@/hooks/useFunnelState";

const NODE_TYPE_ICONS: Record<string, any> = {
  Anúncio:            Megaphone,
  "Landing Page":     Globe,
  WhatsApp:           MessageCircle,
  Checkout:           ShoppingCart,
  Email:              Mail,
  Instagram:          Camera,
  "Captura de Lead":  Target,
  Upsell:             TrendingUp,
  Downsell:           TrendingDown,
  "Cross-sell":       RefreshCcw,
  "Quiz/Enquete":     BarChart2,
  "E-mail Sequência": Bell,
  Remarketing:        Bell,
  Outro:              FileText,
};

const ACCENT_COLORS: Record<string, string> = {
  Anúncio:            "#3b82f6",
  "Landing Page":     "#8b5cf6",
  WhatsApp:           "#10b981",
  Checkout:           "#f59e0b",
  Email:              "#0ea5e9",
  Instagram:          "#ec4899",
  "Captura de Lead":  "#f97316",
  Upsell:             "#22c55e",
  Downsell:           "#f97316",
  "Cross-sell":       "#a855f7",
  "Quiz/Enquete":     "#06b6d4",
  "E-mail Sequência": "#0ea5e9",
  Remarketing:        "#ef4444",
  Outro:              "#64748b",
};

type Dir = "top" | "bottom" | "left" | "right";
const POS_MAP: Record<Dir, Position> = {
  top: Position.Top, bottom: Position.Bottom, left: Position.Left, right: Position.Right,
};

const QUICK_DIRS: { dir: Dir; style: React.CSSProperties }[] = [
  { dir: "top",    style: { top: -14,  left: "50%",  transform: "translateX(-50%)" } },
  { dir: "bottom", style: { bottom: -14, left: "50%", transform: "translateX(-50%)" } },
  { dir: "left",   style: { left: -14, top: "50%",  transform: "translateY(-50%)" } },
  { dir: "right",  style: { right: -14, top: "50%", transform: "translateY(-50%)" } },
];

type NodeData = {
  label: string;
  nodeKind?: string;
  payload?: any;
  color?: string;
  croMode?: boolean;
};

export const FunnelStageNode = memo(({ id, data, selected }: { id: string; data: NodeData; selected: boolean }) => {
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { updateNodeLabel, setSelectedNodeId, addNodeAfter, deleteNodeById } = useFunnelState();
  const kind = data.nodeKind || "Anúncio";
  const Icon = NODE_TYPE_ICONS[kind] || FileText;
  const accentColor = data.color || ACCENT_COLORS[kind] || "#6b7280";

  const showButtons = () => { clearTimeout(hoverTimer.current); setHovered(true); };
  const hideButtons = () => { hoverTimer.current = setTimeout(() => setHovered(false), 100); };

  return (
    <div
      className="relative"
      onMouseEnter={showButtons}
      onMouseLeave={hideButtons}
    >
      {/* ── Handles React Flow (source + target em cada lado) ── */}
      {(Object.keys(POS_MAP) as Dir[]).map(dir => (
        <Fragment key={dir}>
          <Handle
            type="source"
            position={POS_MAP[dir]}
            id={dir}
            style={{
              width: 10, height: 10,
              background: accentColor,
              border: "2px solid hsl(var(--background))",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s",
              zIndex: 5,
              boxShadow: `0 0 8px ${accentColor}60`,
            }}
          />
          <Handle
            type="target"
            position={POS_MAP[dir]}
            id={`t-${dir}`}
            style={{ width: 20, height: 20, background: "transparent", border: "none", opacity: 0, zIndex: 4 }}
          />
        </Fragment>
      ))}

      {/* ── Botões + direcionais ── */}
      {QUICK_DIRS.map(({ dir, style }) => (
        <button
          key={dir}
          className="nodrag nopan absolute z-30 h-6 w-6 rounded-full flex items-center justify-center text-white hover:scale-110 transition-all shadow-lg"
          style={{
            ...style,
            background: accentColor,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "all" : "none",
            transition: "opacity 0.15s, transform 0.1s",
          }}
          onMouseEnter={showButtons}
          onMouseLeave={hideButtons}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); addNodeAfter(id, dir, kind); }}
          title={`Criar nó filho (${dir})`}
        >
          <Plus className="h-3 w-3" />
        </button>
      ))}

      {/* ── Card principal ── */}
      <div
        className="group w-[240px] rounded-2xl border transition-all duration-200 overflow-hidden bg-card/90 backdrop-blur-xl"
        style={
          selected
            ? { borderColor: `${accentColor}60`, boxShadow: `0 0 0 1.5px ${accentColor}40, 0 8px 32px ${accentColor}15` }
            : { borderColor: "hsl(var(--border) / 0.7)" }
        }
      >
        {/* Stripe superior */}
        <div className="h-1 w-full" style={{ background: accentColor }} />

        <div className="p-3.5">
          {/* Header: ícone + tipo + label + ações */}
          <div className="flex items-start gap-2.5">
            <div className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${accentColor}18` }}>
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
                  onChange={e => updateNodeLabel(id, e.target.value)}
                  onBlur={() => setIsEditingLabel(false)}
                  onKeyDown={e => e.key === "Enter" && setIsEditingLabel(false)}
                />
              ) : (
                <h3 className="text-sm font-bold text-foreground truncate leading-snug">
                  {data.label || "Nova Etapa"}
                </h3>
              )}
            </div>

            {/* Editar / Excluir */}
            <div className="nodrag flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Editar"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); setSelectedNodeId(id); }}
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                className="p-1.5 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
                title="Excluir"
                onMouseDown={e => e.stopPropagation()}
                onClick={e => { e.stopPropagation(); deleteNodeById(id); }}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Conteúdo / copy */}
          {data.payload?.markdown ? (
            <div className="mt-2.5 px-2 py-1.5 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed"
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

          {/* CRO stats */}
          {data.croMode && (
            <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between text-[10px] font-mono">
              <div>
                <span className="text-muted-foreground">Volume: </span>
                <span className="font-bold text-foreground">{data.payload?.leads || 120}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Conversão: </span>
                <span className={`font-bold ${Number(data.payload?.conversion || 100) < 30 ? "text-destructive animate-pulse" : "text-emerald-400"}`}>
                  {data.payload?.conversion || 100}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Glow line no bottom on hover */}
        <div
          className="absolute bottom-0 left-0 right-0 h-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: `linear-gradient(90deg, transparent, ${accentColor}50, transparent)` }}
        />
      </div>
    </div>
  );
});
