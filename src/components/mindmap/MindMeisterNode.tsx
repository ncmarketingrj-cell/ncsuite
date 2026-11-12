// ──────────────────────────────────────────────────────────────────────────────
// MindMeisterNode.tsx — Nó Personalizado de Alta Performance no Estilo MindMeister
// ──────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect, useContext, Fragment } from "react";
import { Handle, Position, useReactFlow } from "@xyflow/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Pencil, FileText, ExternalLink, CheckCircle2,
  Clock, AlertCircle, Circle, CheckSquare, Square,
} from "lucide-react";
import { MindMapActionsContext } from "./MindMapContext";

// Direção e handles
type Dir = "top" | "bottom" | "left" | "right";
const POS_MAP = {
  top: Position.Top,
  bottom: Position.Bottom,
  left: Position.Left,
  right: Position.Right,
} as const;

const QUICK_DIRS: { dir: Dir; style: React.CSSProperties; label: string }[] = [
  { dir: "right",  style: { right: -12, top: "50%", transform: "translateY(-50%)" }, label: "Subtópico à Direita" },
  { dir: "bottom", style: { bottom: -12, left: "50%", transform: "translateX(-50%)" }, label: "Subtópico Abaixo" },
  { dir: "left",   style: { left: -12, top: "50%", transform: "translateY(-50%)" }, label: "Subtópico à Esquerda" },
  { dir: "top",    style: { top: -12, left: "50%", transform: "translateX(-50%)" }, label: "Subtópico Acima" },
];

export function MindMeisterNode({ id, data, selected }: { id: string; data: any; selected: boolean }) {
  const [hovered, setHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    addChildNode,
    addSiblingNode,
    editNode,
    deleteNode,
    searchTerm,
  } = useContext(MindMapActionsContext);

  const { setNodes } = useReactFlow();

  const isRoot = !!data.isRoot;
  const nodeColor = data.color || data.branchColor || "#e11d48";
  const dimmed = !!searchTerm && !String(data.label || "").toLowerCase().includes(searchTerm.toLowerCase());

  // Foco ao entrar em edição
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const updateLabel = (newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) {
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, label: trimmed } } : n))
      );
    }
    setIsEditing(false);
  };

  const toggleChecklistItem = (itemIndex: number) => {
    const list = Array.isArray(data.checklist) ? [...data.checklist] : [];
    if (list[itemIndex]) {
      list[itemIndex].done = !list[itemIndex].done;
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, checklist: list } } : n))
      );
    }
  };

  const showHandles = () => {
    clearTimeout(hoverTimer.current);
    setHovered(true);
  };

  const hideHandles = () => {
    hoverTimer.current = setTimeout(() => setHovered(false), 120);
  };

  return (
    <div
      onMouseEnter={showHandles}
      onMouseLeave={hideHandles}
      onDoubleClick={() => setIsEditing(true)}
      style={{
        opacity: dimmed ? 0.15 : 1,
      }}
      className="relative group transition-all duration-200 select-none"
    >
      {/* ── TOOLBAR FLUTUANTE RÁPIDA (Estilo MindMeister quando selecionado) ── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: -42, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="nodrag nopan absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 bg-card/95 backdrop-blur-xl border border-white/15 px-2 py-1 rounded-xl shadow-2xl"
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                addChildNode(id, "right");
              }}
              title="Adicionar Subtópico (Tab)"
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-primary text-primary-foreground hover:shadow-glow transition"
            >
              <Plus className="h-3 w-3" />
              <span>Filho</span>
              <kbd className="text-[8px] bg-black/30 px-1 rounded font-mono">Tab</kbd>
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                addSiblingNode(id);
              }}
              title="Adicionar Irmão (Enter)"
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold bg-white/10 hover:bg-white/15 text-foreground transition"
            >
              <Plus className="h-3 w-3" />
              <span>Irmão</span>
              <kbd className="text-[8px] bg-black/30 px-1 rounded font-mono">Enter</kbd>
            </button>

            <div className="w-px h-3.5 bg-white/10" />

            <button
              onClick={(e) => {
                e.stopPropagation();
                editNode(id);
              }}
              title="Formatar Estilo e Cores"
              className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
            >
              <Pencil className="h-3 w-3" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                deleteNode(id);
              }}
              title="Excluir Nó (Del)"
              className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CARD PRINCIPAL DO NÓ (Cápsula MindMeister com Gradiente e Glow) ── */}
      <div
        style={{
          background: data.bgColor || (isRoot ? "linear-gradient(135deg, rgba(225,29,72,0.18) 0%, rgba(18,18,24,0.92) 100%)" : "rgba(18, 18, 26, 0.94)"),
          borderColor: isRoot ? "#e11d48" : nodeColor,
          boxShadow: selected
            ? `0 0 0 2px ${nodeColor}, 0 0 24px ${nodeColor}40`
            : hovered
            ? `0 0 0 1px ${nodeColor}80, 0 8px 20px rgba(0,0,0,0.4)`
            : "0 4px 14px rgba(0,0,0,0.3)",
          minWidth: isRoot ? 190 : 150,
          maxWidth: 320,
        }}
        className={`relative border-2 transition-all duration-200 backdrop-blur-md ${
          isRoot
            ? "rounded-2xl px-5 py-3.5"
            : "rounded-xl px-3.5 py-2.5"
        }`}
      >
        {/* Slide Order Badge se estiver na apresentação */}
        {data.slideOrder != null && (
          <div className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-amber-500 flex items-center justify-center text-[9px] font-black text-black z-30 shadow-md">
            {data.slideOrder + 1}
          </div>
        )}

        {/* Status Indicator Icon */}
        {data.status && (
          <div
            className="absolute -top-2 -right-2 h-5 w-5 rounded-full border-2 border-background flex items-center justify-center z-30 shadow"
            style={{
              background:
                data.status === "done"
                  ? "#10b981"
                  : data.status === "inprogress"
                  ? "#f59e0b"
                  : data.status === "blocked"
                  ? "#ef4444"
                  : "#6b7280",
            }}
            title={`Status: ${data.status}`}
          >
            {data.status === "done" && <CheckCircle2 className="h-3 w-3 text-white" />}
            {data.status === "inprogress" && <Clock className="h-3 w-3 text-white" />}
            {data.status === "blocked" && <AlertCircle className="h-3 w-3 text-white" />}
            {data.status === "todo" && <Circle className="h-2.5 w-2.5 text-white" />}
          </div>
        )}

        {/* Conteúdo Central */}
        <div className="flex items-start gap-2">
          {/* Emoji */}
          {data.emoji && (
            <span
              className={`shrink-0 leading-none select-none ${
                isRoot ? "text-2xl mt-0.5" : "text-base mt-0.5"
              }`}
            >
              {data.emoji}
            </span>
          )}

          {/* Rótulo / Label */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <input
                ref={inputRef}
                defaultValue={data.label}
                onBlur={(e) => updateLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") updateLabel(e.currentTarget.value);
                  if (e.key === "Escape") setIsEditing(false);
                }}
                className="w-full bg-transparent border-b border-primary text-foreground outline-none font-bold"
                style={{ fontSize: `${data.fontSize || (isRoot ? 16 : 13)}px` }}
              />
            ) : (
              <p
                className={`text-foreground leading-snug break-words ${
                  data.bold || isRoot ? "font-black tracking-tight" : "font-semibold"
                }`}
                style={{ fontSize: `${data.fontSize || (isRoot ? 16 : 13)}px` }}
              >
                {data.label || "Tópico"}
              </p>
            )}

            {/* Checklist interno (estilo MindMeister task list) */}
            {Array.isArray(data.checklist) && data.checklist.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-white/10 pt-1.5">
                {data.checklist.map((item: any, idx: number) => (
                  <div
                    key={idx}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleChecklistItem(idx);
                    }}
                    className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer transition"
                  >
                    {item.done ? (
                      <CheckSquare className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                    )}
                    <span className={item.done ? "line-through opacity-50" : ""}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Nota Expansível */}
            {data.note && (
              <div className="mt-1.5">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowNote((v) => !v);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/70 hover:text-foreground transition font-medium"
                >
                  <FileText className="h-2.5 w-2.5" />
                  <span>{showNote ? "Ocultar anotação" : "Ver anotação"}</span>
                </button>
                <AnimatePresence>
                  {showNote && (
                    <motion.p
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="mt-1 text-[11px] text-muted-foreground bg-black/40 border border-white/5 rounded-lg p-2 leading-relaxed whitespace-pre-wrap font-sans"
                    >
                      {data.note}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Links Externos */}
            {Array.isArray(data.links) && data.links.length > 0 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {data.links.map((lk: any, idx: number) => (
                  <a
                    key={idx}
                    href={lk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-bold text-blue-400 hover:text-blue-300 transition"
                  >
                    <ExternalLink className="h-2.5 w-2.5" />
                    <span>{lk.label || "Link"}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── BOTÕES (+) RÁPIDOS DIRECCIONAIS (Hover nos 4 cantos) ── */}
      {QUICK_DIRS.map(({ dir, style, label }) => (
        <button
          key={dir}
          onClick={(e) => {
            e.stopPropagation();
            addChildNode(id, dir);
          }}
          title={label}
          style={{
            ...style,
            background: nodeColor,
            opacity: hovered || selected ? 1 : 0,
            pointerEvents: hovered || selected ? "all" : "none",
          }}
          className="nodrag nopan absolute z-40 h-5 w-5 rounded-full flex items-center justify-center text-white shadow-lg hover:scale-125 transition-all active:scale-95 border border-white/40"
        >
          <Plus className="h-3 w-3 stroke-[3]" />
        </button>
      ))}

      {/* ── HANDLES NATIVOS DO REACT FLOW (Conexões Livres) ── */}
      {(Object.keys(POS_MAP) as Dir[]).map((dir) => (
        <Fragment key={dir}>
          <Handle
            type="source"
            position={POS_MAP[dir]}
            id={dir}
            style={{
              width: 8,
              height: 8,
              background: nodeColor,
              border: "2px solid hsl(var(--background))",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s",
              zIndex: 10,
            }}
          />
          <Handle
            type="target"
            position={POS_MAP[dir]}
            id={`t-${dir}`}
            style={{
              width: 14,
              height: 14,
              background: "transparent",
              border: "none",
              opacity: 0,
              zIndex: 9,
            }}
          />
        </Fragment>
      ))}
    </div>
  );
}
