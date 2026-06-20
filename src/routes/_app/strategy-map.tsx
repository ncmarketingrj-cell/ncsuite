import {
  createContext, useCallback, useContext, useEffect, useRef, useState, Fragment,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ReactFlow, MiniMap, Controls, Background, BackgroundVariant,
  ReactFlowProvider, useReactFlow, useViewport, addEdge, Panel,
  Handle, Position, ConnectionMode,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  applyNodeChanges, applyEdgeChanges, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Plus, Trash2, Download, Presentation, ChevronLeft, ChevronRight,
  Sparkles, X, List, GitBranch, Loader2, FileText, Play, Square,
  Maximize2, ChevronDown, Save, LayoutGrid, Layers, Search, ExternalLink,
  Link2, HelpCircle, CheckCircle2, AlertCircle, Clock, Circle, Undo2,
  Redo2, Pencil, Palette,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import dagre from "dagre";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export const Route = createFileRoute("/_app/strategy-map")({
  component: () => (
    <ReactFlowProvider>
      <StrategyMapPage />
    </ReactFlowProvider>
  ),
});

// ─── Constantes ───────────────────────────────────────────────────────────────
const LEVEL_COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

const STATUS_CONFIG = {
  todo:       { label: "A Fazer",       color: "#6b7280", Icon: Circle },
  inprogress: { label: "Em Progresso",  color: "#f97316", Icon: Clock },
  done:       { label: "Concluído",     color: "#22c55e", Icon: CheckCircle2 },
  blocked:    { label: "Bloqueado",     color: "#e11d48", Icon: AlertCircle },
} as const;
type StatusKey = keyof typeof STATUS_CONFIG;

// Direção → lado oposto → posição React Flow
const OPPOSITE = { top: "bottom", bottom: "top", left: "right", right: "left" } as const;
const POS_MAP = {
  top: Position.Top, bottom: Position.Bottom,
  left: Position.Left, right: Position.Right,
} as const;
type Dir = "top" | "bottom" | "left" | "right";

// Botões + : centralizados em cada lado, centro na borda do nó
const QUICK_DIRS: { dir: Dir; style: React.CSSProperties }[] = [
  { dir: "top",    style: { top: -14,  left: "50%", transform: "translateX(-50%)" } },
  { dir: "bottom", style: { bottom: -14, left: "50%", transform: "translateX(-50%)" } },
  { dir: "left",   style: { left: -14, top: "50%",  transform: "translateY(-50%)" } },
  { dir: "right",  style: { right: -14, top: "50%", transform: "translateY(-50%)" } },
];

// ─── Context ──────────────────────────────────────────────────────────────────
interface MapCtx {
  addChildNode: (parentId: string, dir: Dir) => void;
  editNode:     (nodeId: string) => void;
  deleteNode:   (nodeId: string) => void;
  searchTerm:   string;
}
const MapActionsCtx = createContext<MapCtx>({
  addChildNode: () => {},
  editNode: () => {},
  deleteNode: () => {},
  searchTerm: "",
});

// ─── MindNode ─────────────────────────────────────────────────────────────────
function MindNode({ id, data, selected }: { id: string; data: any; selected: boolean }) {
  const [showNote, setShowNote] = useState(false);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { addChildNode, editNode, deleteNode, searchTerm } = useContext(MapActionsCtx);
  const { setNodes } = useReactFlow();

  const showHandles = () => { clearTimeout(hoverTimer.current); setHovered(true); };
  const hideHandles = () => { hoverTimer.current = setTimeout(() => setHovered(false), 100); };

  const statusCfg = data.status ? STATUS_CONFIG[data.status as StatusKey] : null;
  const dimmed = !!searchTerm && !String(data.label || "").toLowerCase().includes(searchTerm.toLowerCase());

  const updateLabel = (label: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));

  const nodeColor = data.color || "#e11d48";

  return (
    <div
      style={{
        background: data.bgColor || "hsl(var(--card))",
        borderColor: nodeColor,
        boxShadow: selected
          ? `0 0 0 2px ${nodeColor}66, 0 0 28px ${nodeColor}33`
          : "0 2px 14px rgba(0,0,0,0.2)",
        opacity: dimmed ? 0.15 : 1,
        minWidth: 160,
        maxWidth: 240,
      }}
      className="group relative rounded-2xl border-2 cursor-default transition-shadow duration-200"
      onMouseEnter={showHandles}
      onMouseLeave={hideHandles}
    >
      {/* ── Slide badge ── */}
      {data.slideOrder != null && (
        <div className="absolute -top-2.5 -left-2.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-black text-primary-foreground z-20">
          {data.slideOrder + 1}
        </div>
      )}

      {/* ── Status dot ── */}
      {statusCfg && (
        <div
          className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full border-2 border-background z-20"
          style={{ background: statusCfg.color }}
          title={statusCfg.label}
        />
      )}

      {/* ── React Flow Handles (para arrastar e conectar) ── */}
      {(Object.keys(POS_MAP) as Dir[]).map(dir => (
        <Fragment key={dir}>
          {/* Source: o usuário arrasta daqui */}
          <Handle
            type="source"
            position={POS_MAP[dir]}
            id={dir}
            style={{
              width: 10, height: 10,
              background: nodeColor,
              border: "2px solid hsl(var(--background))",
              opacity: hovered ? 1 : 0,
              transition: "opacity 0.15s",
              zIndex: 5,
            }}
          />
          {/* Target: o usuário larga aqui (invisível, grande) */}
          <Handle
            type="target"
            position={POS_MAP[dir]}
            id={`t-${dir}`}
            style={{
              width: 20, height: 20,
              background: "transparent",
              border: "none",
              opacity: 0,
              zIndex: 4,
            }}
          />
        </Fragment>
      ))}

      {/* ── Botões + (quick-add filho por direção) ── */}
      {QUICK_DIRS.map(({ dir, style }) => (
        <button
          key={dir}
          className="nodrag nopan absolute z-30 h-6 w-6 rounded-full flex items-center justify-center text-primary-foreground hover:scale-110 transition-all shadow-lg"
          style={{
            ...style,
            background: nodeColor,
            opacity: hovered ? 1 : 0,
            pointerEvents: hovered ? "all" : "none",
            transition: "opacity 0.15s, transform 0.1s",
          }}
          onMouseEnter={showHandles}
          onMouseLeave={hideHandles}
          onMouseDown={e => e.stopPropagation()}
          onClick={e => { e.stopPropagation(); addChildNode(id, dir); }}
          title={`Novo filho (${dir})`}
        >
          <Plus className="h-3 w-3" />
        </button>
      ))}

      {/* ── Conteúdo do nó ── */}
      <div className="p-3">
        {/* Header: emoji + label + ações */}
        <div className="flex items-start gap-1.5">
          {data.emoji && (
            <span className="text-base leading-none mt-0.5 shrink-0">{data.emoji}</span>
          )}
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={e => updateLabel(e.currentTarget.textContent || "")}
            className="nodrag text-sm font-bold text-foreground outline-none leading-snug flex-1 break-words min-w-0"
            style={{ fontSize: `${data.fontSize || 13}px` }}
          >
            {data.label}
          </div>
          {/* Editar / Excluir */}
          <div className="nodrag flex-shrink-0 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <button
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Editar nó"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); editNode(id); }}
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
            <button
              className="p-1 rounded-lg hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors"
              title="Excluir nó"
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); deleteNode(id); }}
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          </div>
        </div>

        {/* Nota */}
        {data.note && (
          <button
            onClick={e => { e.stopPropagation(); setShowNote(v => !v); }}
            className="nodrag mt-1.5 flex items-center gap-1 text-[9px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            <FileText className="h-2.5 w-2.5" />
            {showNote ? "Ocultar nota" : "Ver nota"}
          </button>
        )}
        <AnimatePresence>
          {showNote && data.note && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="mt-2 text-[10px] text-muted-foreground border-t border-border pt-2 leading-relaxed whitespace-pre-wrap">
                {data.note}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Links */}
        {data.links && (data.links as any[]).length > 0 && (
          <div className="flex gap-1 mt-1.5 flex-wrap">
            {(data.links as any[]).map((lk: any, i: number) => (
              <a key={i} href={lk.url} target="_blank" rel="noopener noreferrer"
                className="nodrag flex items-center gap-0.5 text-[9px] text-blue-400 hover:text-blue-300 bg-blue-500/10 rounded px-1.5 py-0.5 border border-blue-500/20"
                onClick={e => e.stopPropagation()}>
                <ExternalLink className="h-2 w-2" />{lk.label || "Link"}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const NODE_TYPES = { mind: MindNode };

// ─── Layouts ──────────────────────────────────────────────────────────────────
function applyRadialLayout(nodes: Node[]): Node[] {
  const childrenMap = new Map<string | null, string[]>();
  nodes.forEach(n => {
    const pid = (n.parentId as string) || null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(n.id);
  });
  const getDepth = (id: string, memo = new Map<string, number>()): number => {
    if (memo.has(id)) return memo.get(id)!;
    const node = nodes.find(n => n.id === id);
    if (!node || !node.parentId) return 0;
    const d = 1 + getDepth(node.parentId as string, memo);
    memo.set(id, d); return d;
  };
  return nodes.map(n => {
    const depth = getDepth(n.id);
    if (depth === 0) return { ...n, position: { x: 0, y: 0 } };
    const pid = n.parentId as string;
    const siblings = childrenMap.get(pid) || [];
    const idx = siblings.indexOf(n.id);
    const radius = depth * 310;
    const spread = Math.min(Math.PI * 1.6, (2 * Math.PI) / Math.max(1, depth));
    const angle = (-(siblings.length - 1) / 2 + idx) * (spread / Math.max(1, siblings.length - 1)) - Math.PI / 2;
    return { ...n, position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius } };
  });
}
function applyTreeLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "TB", ranksep: 80, nodesep: 40 });
  nodes.forEach(n => g.setNode(n.id, { width: 220, height: 70 }));
  edges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map(n => {
    const pos = g.node(n.id);
    return pos ? { ...n, position: { x: pos.x - 110, y: pos.y - 35 } } : n;
  });
}
function applyListLayout(nodes: Node[]): Node[] {
  const roots = nodes.filter(n => !n.parentId);
  let y = 0;
  const placed: Node[] = [];
  const place = (id: string, depth: number) => {
    const n = nodes.find(nn => nn.id === id);
    if (!n) return;
    placed.push({ ...n, position: { x: depth * 60, y } });
    y += 90;
    nodes.filter(nn => nn.parentId === id).forEach(c => place(c.id, depth + 1));
  };
  roots.forEach(r => place(r.id, 0));
  return placed;
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function CanvasHUD({ onFit }: { onFit: () => void }) {
  const { zoom } = useViewport();
  const { getNodes } = useReactFlow();
  return (
    <div className="flex items-center gap-2 bg-card/90 backdrop-blur border border-border rounded-xl px-3 py-1.5 text-[10px] text-muted-foreground shadow-md">
      <span className="font-mono font-bold">{Math.round(zoom * 100)}%</span>
      <div className="w-px h-3 bg-border" />
      <span>{getNodes().length} nós</span>
      <button onClick={onFit} title="Recentralizar" className="ml-0.5 hover:text-foreground transition-colors">
        <Maximize2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
function StrategyMapPage() {
  const rf = useReactFlow();

  const [maps, setMaps] = useState<any[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [mapTitle, setMapTitle] = useState("Novo Mapa Mental");
  const [layout, setLayout] = useState<"radial"|"tree"|"list"|"free">("radial");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);

  // UI panels
  const [showAI, setShowAI] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<"style"|"content"|"links">("style");
  const [presentMode, setPresentMode] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showMapList, setShowMapList] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");

  // Refs
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const selectedRef = useRef<Node | null>(null);
  const activeMapIdRef = useRef<string | null>(null);
  const mapTitleRef = useRef("Novo Mapa Mental");
  const layoutRef = useRef<string>("radial");
  nodesRef.current = nodes;
  edgesRef.current = edges;
  selectedRef.current = selectedNode;
  activeMapIdRef.current = activeMapId;
  mapTitleRef.current = mapTitle;
  layoutRef.current = layout;

  // History
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIdxRef = useRef(-1);
  const pushHistory = useCallback((ns: Node[], es: Edge[]) => {
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push({ nodes: [...ns], edges: [...es] });
    if (historyRef.current.length > 60) historyRef.current.shift(); else historyIdxRef.current++;
  }, []);
  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const s = historyRef.current[historyIdxRef.current];
    setNodes([...s.nodes]); setEdges([...s.edges]); toast("↩ Desfeito");
  }, []);
  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const s = historyRef.current[historyIdxRef.current];
    setNodes([...s.nodes]); setEdges([...s.edges]); toast("↪ Refeito");
  }, []);

  // ── DB ──
  useEffect(() => { loadMaps(); }, []);

  const loadMaps = async () => {
    const { data } = await (supabase as any).from("mind_maps").select("*").order("updated_at", { ascending: false });
    setMaps(data || []);
    if (data?.length > 0) loadMap(data[0].id, data[0]);
  };

  const loadMap = async (mapId: string, meta?: any) => {
    setActiveMapId(mapId);
    if (meta) { setMapTitle(meta.title); setLayout(meta.layout); }
    const [{ data: dbN }, { data: dbE }] = await Promise.all([
      (supabase as any).from("mind_map_nodes").select("*").eq("map_id", mapId),
      (supabase as any).from("mind_map_edges").select("*").eq("map_id", mapId),
    ]);
    const ns: Node[] = ((dbN as any[]) || []).map((n: any) => ({
      id: n.id, type: "mind",
      position: { x: Number(n.pos_x), y: Number(n.pos_y) },
      parentId: n.parent_id || undefined,
      data: {
        label: n.label, emoji: n.emoji, note: n.note,
        color: n.color, bgColor: n.bg_color,
        fontSize: n.font_size, bold: n.bold,
        slideOrder: n.slide_order,
        status: n.metadata?.status || undefined,
        links: n.metadata?.links || [],
      },
    }));
    const es: Edge[] = ((dbE as any[]) || []).map((e: any) => ({
      id: e.id,
      source: e.source_id, sourceHandle: e.metadata?.sourceHandle || null,
      target: e.target_id, targetHandle: e.metadata?.targetHandle || null,
      label: e.label, type: "smoothstep", animated: e.animated,
      markerEnd: { type: MarkerType.ArrowClosed, color: e.color || "#6b7280" },
      style: { stroke: e.color || "#6b7280", strokeWidth: 2 },
    }));
    setNodes(ns); setEdges(es);
    historyRef.current = [{ nodes: ns, edges: es }]; historyIdxRef.current = 0;
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 600 }), 100);
  };

  const createMap = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase as any).from("mind_maps").insert({
      user_id: user.id, title: "Novo Mapa Mental", layout: "radial",
    }).select().single();
    if (data) {
      await (supabase as any).from("mind_map_nodes").insert({
        map_id: data.id, label: "Tema Central", emoji: "🎯", color: "#e11d48", pos_x: 0, pos_y: 0,
      });
      setMaps(prev => [data, ...prev]);
      loadMap(data.id, data);
    }
  };

  const saveMap = useCallback(async () => {
    const mapId = activeMapIdRef.current;
    if (!mapId) return;
    setSaving(true);
    try {
      const ns = nodesRef.current;
      const es = edgesRef.current;
      await (supabase as any).from("mind_maps").update({ title: mapTitleRef.current, layout: layoutRef.current, updated_at: new Date().toISOString() }).eq("id", mapId);
      await (supabase as any).from("mind_map_nodes").delete().eq("map_id", mapId);
      await (supabase as any).from("mind_map_edges").delete().eq("map_id", mapId);
      if (ns.length > 0) {
        await (supabase as any).from("mind_map_nodes").insert(ns.map(n => ({
          id: n.id, map_id: mapId, parent_id: n.parentId || null,
          label: n.data.label || "Tópico", emoji: n.data.emoji || null, note: n.data.note || null,
          color: n.data.color || "#e11d48", bg_color: n.data.bgColor || null,
          font_size: n.data.fontSize || 13, bold: n.data.bold || false,
          pos_x: n.position.x, pos_y: n.position.y,
          slide_order: n.data.slideOrder ?? null,
          metadata: { status: n.data.status || null, links: n.data.links || [] },
        })));
      }
      if (es.length > 0) {
        await (supabase as any).from("mind_map_edges").insert(es.map(e => ({
          id: e.id, map_id: mapId,
          source_id: e.source, target_id: e.target,
          label: String(e.label || ""),
          style: e.type || "smoothstep",
          color: (e.style as any)?.stroke || "#6b7280",
          animated: e.animated || false,
          metadata: { sourceHandle: e.sourceHandle, targetHandle: e.targetHandle },
        })));
      }
      toast.success("Mapa salvo!");
    } catch { toast.error("Erro ao salvar"); }
    finally { setSaving(false); }
  }, []);

  // ── Node actions ──

  // Cria nó filho na direção especificada a partir do + button do nó pai
  const addChildNode = useCallback((parentId: string, dir: Dir) => {
    const parent = nodesRef.current.find(n => n.id === parentId);
    if (!parent) return;

    const existingInDir = edgesRef.current.filter(
      e => e.source === parentId && e.sourceHandle === dir
    ).length;

    const OFFSETS: Record<Dir, [number, number]> = {
      right:  [320,  0],
      left:   [-320, 0],
      top:    [0,   -180],
      bottom: [0,    180],
    };
    const [dx, dy] = OFFSETS[dir];
    const jitter = existingInDir * (dir === "left" || dir === "right" ? 120 : 70);

    const id = `n_${Date.now()}`;
    const depth = (() => {
      let d = 0, cur = parent;
      while (cur.parentId) {
        d++;
        const p = nodesRef.current.find(n => n.id === cur.parentId);
        if (!p) break;
        cur = p;
      }
      return d;
    })();

    const newNode: Node = {
      id, type: "mind",
      position: {
        x: parent.position.x + dx + (dir === "left"||dir === "right" ? 0 : jitter),
        y: parent.position.y + dy + (dir === "left"||dir === "right" ? jitter : 0),
      },
      parentId,
      data: {
        label: "Novo Tópico",
        color: LEVEL_COLORS[Math.min(depth + 1, LEVEL_COLORS.length - 1)],
        emoji: "💡", fontSize: 13, links: [],
      },
    };

    const newEdge: Edge = {
      id: `e_${parentId}_${id}_${Date.now()}`,
      source: parentId,
      sourceHandle: dir,
      target: id,
      targetHandle: `t-${OPPOSITE[dir]}`,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
      style: { stroke: "#6b7280", strokeWidth: 2 },
    };

    setNodes(ns => { const u = [...ns, newNode]; pushHistory(u, edgesRef.current); return u; });
    setEdges(es => [...es, newEdge]);
    // Selecionar e abrir editor do novo nó
    setTimeout(() => {
      setSelectedNode(newNode);
      setShowEditor(true);
      setEditorTab("style");
    }, 50);
  }, [pushHistory]);

  // Cria nó solto (sem pai) no centro do viewport
  const addStandaloneNode = useCallback(() => {
    const vp = rf.getViewport();
    const cx = (-vp.x + (canvasRef.current?.clientWidth || 800) / 2) / vp.zoom;
    const cy = (-vp.y + (canvasRef.current?.clientHeight || 600) / 2) / vp.zoom;
    const id = `n_${Date.now()}`;
    const newNode: Node = {
      id, type: "mind",
      position: { x: cx - 90, y: cy - 35 },
      data: { label: "Novo Tópico", color: LEVEL_COLORS[0], emoji: "💡", fontSize: 13, links: [] },
    };
    setNodes(ns => { const u = [...ns, newNode]; pushHistory(u, edgesRef.current); return u; });
    setTimeout(() => {
      setSelectedNode(newNode);
      setShowEditor(true);
      setEditorTab("style");
    }, 50);
  }, [pushHistory]);

  const canvasRef = useRef<HTMLDivElement>(null);

  const editNode = useCallback((nodeId: string) => {
    const n = nodesRef.current.find(n => n.id === nodeId);
    if (n) { setSelectedNode(n); setShowEditor(true); setEditorTab("style"); }
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    const toDelete = new Set<string>();
    const collect = (id: string) => {
      toDelete.add(id);
      nodesRef.current.filter(n => n.parentId === id).forEach(c => collect(c.id));
    };
    collect(nodeId);
    setNodes(ns => { const u = ns.filter(n => !toDelete.has(n.id)); pushHistory(u, edgesRef.current); return u; });
    setEdges(es => es.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)));
    setSelectedNode(prev => toDelete.has(prev?.id || "") ? null : prev);
    setShowEditor(false);
  }, [pushHistory]);

  const updateSelectedNode = (patch: Record<string, any>) => {
    if (!selectedNode) return;
    const updated = { ...selectedNode, data: { ...selectedNode.data, ...patch } };
    setNodes(ns => ns.map(n => n.id === selectedNode.id ? updated : n));
    setSelectedNode(updated);
  };

  // ── Layout ──
  const applyLayout = (l: "radial"|"tree"|"list"|"free") => {
    setLayout(l);
    let laid: Node[];
    if (l === "radial") laid = applyRadialLayout(nodesRef.current);
    else if (l === "tree") laid = applyTreeLayout(nodesRef.current, edgesRef.current);
    else if (l === "list") laid = applyListLayout(nodesRef.current);
    else return;
    setNodes(laid);
    pushHistory(laid, edgesRef.current);
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 600 }), 50);
  };

  // ── Presentation ──
  const slideNodes = nodes
    .filter(n => n.data.slideOrder != null)
    .sort((a, b) => (a.data.slideOrder as number) - (b.data.slideOrder as number));

  const goToSlide = (i: number) => {
    const node = slideNodes[i];
    if (!node) return;
    setSlideIndex(i);
    rf.setCenter(node.position.x + 90, node.position.y + 40, { zoom: 1.4, duration: 700 });
  };

  const toggleSlide = () => {
    if (!selectedNode) return;
    const cur = selectedNode.data.slideOrder;
    if (cur != null) {
      updateSelectedNode({ slideOrder: undefined });
      toast("Removido da apresentação");
    } else {
      updateSelectedNode({ slideOrder: slideNodes.length });
      toast.success(`Slide ${slideNodes.length + 1} adicionado`);
    }
  };

  // ── AI ──
  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://xudumzedcxuuhxokissm.supabase.co";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-mind-map-generator`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ prompt: aiPrompt, layout, maxDepth: 3, maxBranches: 5 }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);
      const ns: Node[] = result.nodes.map((n: any) => ({
        id: n.id, type: "mind",
        position: { x: Number(n.pos_x || 0), y: Number(n.pos_y || 0) },
        parentId: n.parentId || undefined,
        data: { label: n.label, emoji: n.emoji, color: n.color, fontSize: 13, links: [] },
      }));
      const es: Edge[] = result.edges.map((e: any) => ({
        id: e.id, source: e.source_id, target: e.target_id, type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: { stroke: "#6b7280", strokeWidth: 2 },
      }));
      setMapTitle(result.title || aiPrompt);
      setNodes(ns); setEdges(es);
      pushHistory(ns, es);
      setShowAI(false); setAiPrompt("");
      toast.success(`"${result.title}" gerado com ${ns.length} nós!`);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 800 }), 100);
    } catch (err: any) { toast.error(err.message || "Erro ao gerar"); }
    finally { setAiLoading(false); }
  };

  // ── Export ──
  const exportPNG = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const cv = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const a = document.createElement("a"); a.href = cv.toDataURL("image/png"); a.download = `${mapTitleRef.current}.png`; a.click();
    toast.success("PNG exportado!");
  };
  const exportPDF = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const cv = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [cv.width/2, cv.height/2] });
    pdf.addImage(cv.toDataURL("image/png"), "PNG", 0, 0, cv.width/2, cv.height/2);
    pdf.save(`${mapTitleRef.current}.pdf`);
    toast.success("PDF exportado!");
  };

  // ── Keyboard shortcuts ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const ce = (e.target as HTMLElement).contentEditable;
      if (tag === "INPUT" || tag === "TEXTAREA" || ce === "true") return;
      if (e.key === "Delete" || e.key === "Backspace") { if (selectedRef.current && !showEditor) deleteNode(selectedRef.current.id); }
      if ((e.ctrlKey||e.metaKey) && e.key === "s") { e.preventDefault(); saveMap(); }
      if ((e.ctrlKey||e.metaKey) && !e.shiftKey && e.key === "z") { e.preventDefault(); undo(); }
      if ((e.ctrlKey||e.metaKey) && (e.shiftKey && e.key === "z" || e.key === "y")) { e.preventDefault(); redo(); }
      if ((e.ctrlKey||e.metaKey) && e.key === "f") { e.preventDefault(); setShowSearch(v => !v); }
      if (e.key === "Escape") { setSelectedNode(null); setShowEditor(false); setShowSearch(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deleteNode, saveMap, undo, redo, showEditor]);

  // ── Flow ──
  const onNodesChange = useCallback((changes: NodeChange[]) =>
    setNodes(ns => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) =>
    setEdges(es => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((conn: Connection) => {
    const newEdge: Edge = {
      ...conn,
      id: `e_${conn.source}_${conn.target}_${Date.now()}`,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
      style: { stroke: "#6b7280", strokeWidth: 2 },
    };
    setEdges(es => { const u = addEdge(newEdge, es); pushHistory(nodesRef.current, u); return u; });
  }, [pushHistory]);

  // ── Context ──
  const ctxValue: MapCtx = { addChildNode, editNode, deleteNode, searchTerm };

  return (
    <MapActionsCtx.Provider value={ctxValue}>
      <div className="relative flex flex-1 w-full flex-col bg-background overflow-hidden">

        {/* ── Top Bar ── */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-4 py-2.5 bg-background/85 backdrop-blur-xl border-b border-border">

          {/* Left */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="h-7 w-7 rounded-xl bg-primary/15 border border-primary/30 flex items-center justify-center">
                <Brain className="h-3.5 w-3.5 text-primary" />
              </div>
              <span className="text-xs font-black text-foreground tracking-wide hidden sm:block">STRATEGY MAP</span>
            </div>
            <div className="h-4 w-px bg-border" />
            <button onClick={() => setShowMapList(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-foreground/80 hover:text-foreground truncate max-w-[180px]">
              <span className="truncate">{mapTitle}</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            </button>
          </div>

          {/* Center: layout */}
          <div className="flex items-center gap-1 bg-muted/40 border border-border rounded-xl p-1">
            {([
              { val: "radial", icon: Layers, label: "Radial" },
              { val: "tree",   icon: GitBranch, label: "Árvore" },
              { val: "list",   icon: List, label: "Lista" },
            ] as const).map(({ val, icon: Icon, label }) => (
              <button key={val} onClick={() => applyLayout(val)} title={label}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  layout === val ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}>
                <Icon className="h-3 w-3" />
                <span className="hidden sm:block">{label}</span>
              </button>
            ))}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            {/* Search */}
            <AnimatePresence>
              {showSearch && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 150, opacity: 1 }} exit={{ width: 0, opacity: 0 }} className="overflow-hidden">
                  <input autoFocus value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Buscar nó..."
                    className="w-full rounded-xl bg-muted/40 border border-border px-3 py-1.5 text-[11px] text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={() => setShowSearch(v => !v)}
              className={`rounded-xl border px-2.5 py-1.5 text-[10px] transition-all ${
                showSearch ? "bg-primary/15 border-primary/30 text-primary" : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
              }`}>
              <Search className="h-3 w-3" />
            </button>

            <button onClick={() => setShowAI(v => !v)}
              className="flex items-center gap-1.5 rounded-xl bg-primary/15 border border-primary/30 px-3 py-1.5 text-[10px] font-black text-primary hover:bg-primary/25 transition-all">
              <Sparkles className="h-3 w-3" />
              <span className="hidden sm:block">Victoria IA</span>
            </button>

            {/* Adicionar Nó SOLTO (sem pai) */}
            <button onClick={addStandaloneNode}
              className="flex items-center gap-1 rounded-xl bg-muted/30 border border-border px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <Plus className="h-3 w-3" />
              <span className="hidden sm:block">Adicionar Nó</span>
            </button>

            {/* Apresentação */}
            {selectedNode && (
              <button onClick={toggleSlide}
                className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                  selectedNode.data.slideOrder != null
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                }`}>
                <Presentation className="h-3 w-3" />
              </button>
            )}

            <div className="h-4 w-px bg-border" />

            <button onClick={undo} title="Desfazer (Ctrl+Z)"
              className="rounded-xl bg-muted/30 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-all">
              <Undo2 className="h-3 w-3" />
            </button>
            <button onClick={redo} title="Refazer"
              className="rounded-xl bg-muted/30 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-all">
              <Redo2 className="h-3 w-3" />
            </button>

            <div className="h-4 w-px bg-border" />

            {slideNodes.length > 0 && (
              <button onClick={() => { setPresentMode(true); goToSlide(0); }}
                className="flex items-center gap-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 text-[10px] font-black text-amber-400 hover:bg-amber-500/25 transition-all">
                <Play className="h-3 w-3" />
                <span className="hidden sm:block">Apresentar</span>
              </button>
            )}

            <button onClick={saveMap} disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-[10px] font-black text-emerald-400 hover:bg-emerald-500/25 disabled:opacity-50 transition-all">
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              <span className="hidden sm:block">Salvar</span>
            </button>

            <div className="relative">
              <button onClick={() => document.getElementById("exp-menu")?.classList.toggle("hidden")}
                className="rounded-xl bg-muted/30 border border-border px-2.5 py-1.5 text-[10px] text-muted-foreground hover:text-foreground transition-all">
                <Download className="h-3 w-3" />
              </button>
              <div id="exp-menu" className="hidden absolute right-0 top-9 bg-card border border-border rounded-xl overflow-hidden z-50 w-28 shadow-xl">
                <button onClick={exportPNG} className="w-full px-3 py-2 text-[11px] text-left text-muted-foreground hover:bg-muted hover:text-foreground">PNG</button>
                <button onClick={exportPDF} className="w-full px-3 py-2 text-[11px] text-left text-muted-foreground hover:bg-muted hover:text-foreground">PDF</button>
              </div>
            </div>

            <button onClick={createMap} title="Novo mapa"
              className="rounded-xl bg-muted/30 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-all">
              <LayoutGrid className="h-3 w-3" />
            </button>

            <button onClick={() => setShowHelp(true)} title="Atalhos"
              className="rounded-xl bg-muted/30 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-all">
              <HelpCircle className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ── Map list dropdown ── */}
        <AnimatePresence>
          {showMapList && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
              className="absolute top-14 left-4 z-40 w-64 bg-card border border-border rounded-2xl overflow-hidden shadow-2xl">
              <div className="p-2">
                <button onClick={() => { createMap(); setShowMapList(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-muted text-[11px] font-bold text-primary">
                  <Plus className="h-3 w-3" /> Novo mapa
                </button>
                {maps.map(m => (
                  <button key={m.id} onClick={() => { loadMap(m.id, m); setShowMapList(false); }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-medium transition-all ${
                      m.id === activeMapId ? "bg-primary/20 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}>
                    <Brain className="h-3 w-3 inline mr-1.5 opacity-50" />{m.title}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Canvas ── */}
        <div className="absolute inset-0 pt-12" ref={canvasRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            onNodeClick={(_, node) => { setSelectedNode(node); }}
            onPaneClick={() => { setSelectedNode(null); }}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
              style: { stroke: "#6b7280", strokeWidth: 2 },
            }}
          >
            <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="hsl(var(--border) / 0.4)" />
            <MiniMap nodeColor={n => (n.data?.color as string) || "#e11d48"}
              className="!bg-card/90 !border !border-border !rounded-xl" />
            <Controls className="!bg-card/90 !border !border-border !rounded-xl" />
            <Panel position="bottom-left">
              <CanvasHUD onFit={() => rf.fitView({ padding: 0.2, duration: 500 })} />
            </Panel>
          </ReactFlow>
        </div>

        {/* ── Super Node Editor (3 tabs) ── */}
        <AnimatePresence>
          {showEditor && selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
              className="absolute left-4 top-14 z-40 w-72 bg-card/95 border border-border rounded-2xl shadow-2xl overflow-hidden"
              style={{ maxHeight: "calc(100vh - 80px)" }}
            >
              {/* Header */}
              <div className="flex items-center border-b border-border">
                {([
                  { key: "style",   label: "🎨 Estilo"    },
                  { key: "content", label: "📝 Conteúdo"  },
                  { key: "links",   label: "🔗 Links"     },
                ] as const).map(t => (
                  <button key={t.key} onClick={() => setEditorTab(t.key)}
                    className={`flex-1 py-2.5 text-[10px] font-black transition-all border-b-2 ${
                      editorTab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}>
                    {t.label}
                  </button>
                ))}
                <button onClick={() => setShowEditor(false)} className="px-3 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto" style={{ maxHeight: "calc(100vh - 140px)" }}>

                {/* ── Estilo ── */}
                {editorTab === "style" && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Emoji</label>
                      <input value={selectedNode.data.emoji as string || ""} onChange={e => updateSelectedNode({ emoji: e.target.value })}
                        placeholder="🎯"
                        className="w-full rounded-xl bg-muted/30 border border-border px-3 py-2 text-base text-foreground outline-none focus:border-primary/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Cor do nó</label>
                      <div className="flex gap-1.5 flex-wrap">
                        {["#e11d48","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ec4899","#ffffff"].map(c => (
                          <button key={c} onClick={() => updateSelectedNode({ color: c })}
                            className={`h-7 w-7 rounded-xl border-2 hover:scale-110 transition-all ${selectedNode.data.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                            style={{ background: c }} />
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Status</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {(Object.entries(STATUS_CONFIG) as [StatusKey, (typeof STATUS_CONFIG)[StatusKey]][]).map(([key, cfg]) => (
                          <button key={key}
                            onClick={() => updateSelectedNode({ status: selectedNode.data.status === key ? undefined : key })}
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-all"
                            style={selectedNode.data.status === key
                              ? { color: cfg.color, borderColor: cfg.color, background: `${cfg.color}18` }
                              : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                            <div className="h-2 w-2 rounded-full shrink-0" style={{ background: cfg.color }} />
                            {cfg.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">
                        {`Fonte — ${String(selectedNode.data.fontSize || 13)}px`}
                      </label>
                      <input type="range" min={10} max={24} step={1}
                        value={selectedNode.data.fontSize as number || 13}
                        onChange={e => updateSelectedNode({ fontSize: Number(e.target.value) })}
                        className="w-full accent-primary"
                      />
                    </div>

                    {/* Slide */}
                    <button onClick={toggleSlide}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2 text-[10px] font-bold transition-all ${
                        selectedNode.data.slideOrder != null
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          : "bg-muted/30 border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      <Presentation className="h-3 w-3" />
                      {selectedNode.data.slideOrder != null ? `Slide ${(selectedNode.data.slideOrder as number)+1} — Remover` : "Adicionar ao slideshow"}
                    </button>

                    {/* Excluir nó */}
                    <button onClick={() => deleteNode(selectedNode.id)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 py-2 text-[10px] font-bold text-destructive hover:bg-destructive/20 transition-all">
                      <Trash2 className="h-3 w-3" /> Excluir nó
                    </button>
                  </>
                )}

                {/* ── Conteúdo ── */}
                {editorTab === "content" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Nota do nó</label>
                    <p className="text-[9px] text-muted-foreground/50">Aparece expansível dentro do nó ao clicar em "Ver nota".</p>
                    <textarea
                      value={selectedNode.data.note as string || ""}
                      onChange={e => updateSelectedNode({ note: e.target.value })}
                      placeholder={`Descreva esta etapa...\n\n- Ponto 1\n- Ponto 2`}
                      rows={9}
                      className="w-full rounded-xl bg-muted/30 border border-border px-3 py-2.5 text-[11px] text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 resize-none font-mono leading-relaxed"
                    />
                    {!!selectedNode.data.note && (
                      <div className="rounded-xl bg-muted/20 border border-border px-3 py-2 text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                        {String(selectedNode.data.note)}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Links ── */}
                {editorTab === "links" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Links externos</label>
                    <div className="space-y-1.5">
                      {((selectedNode.data.links || []) as any[]).map((lk: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 bg-muted/30 rounded-xl px-3 py-2 border border-border">
                          <Link2 className="h-3 w-3 text-blue-400 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-bold text-foreground truncate">{lk.label || "Sem título"}</p>
                            <p className="text-[9px] text-muted-foreground truncate">{lk.url}</p>
                          </div>
                          <button onClick={() => {
                            const links = ((selectedNode.data.links || []) as any[]).filter((_: any, j: number) => j !== i);
                            updateSelectedNode({ links });
                          }} className="text-muted-foreground/50 hover:text-destructive transition-colors">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-2 border border-dashed border-border rounded-xl p-3">
                      <input value={newLinkLabel} onChange={e => setNewLinkLabel(e.target.value)}
                        placeholder="Título do link"
                        className="w-full rounded-lg bg-muted/30 border border-border px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50"
                      />
                      <input value={newLinkUrl} onChange={e => setNewLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg bg-muted/30 border border-border px-2.5 py-1.5 text-[11px] text-foreground outline-none focus:border-primary/50"
                      />
                      <button onClick={() => {
                        if (!newLinkUrl.trim()) return;
                        const links = [...((selectedNode.data.links || []) as any[]), { label: newLinkLabel || newLinkUrl, url: newLinkUrl }];
                        updateSelectedNode({ links });
                        setNewLinkLabel(""); setNewLinkUrl("");
                      }} className="w-full rounded-lg bg-primary/15 border border-primary/30 py-1.5 text-[10px] font-bold text-primary hover:bg-primary/25 transition-all">
                        + Adicionar link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Victoria AI Sidebar ── */}
        <AnimatePresence>
          {showAI && (
            <motion.div initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
              className="absolute right-0 top-12 bottom-0 z-40 w-80 bg-card/95 border-l border-border flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-black text-foreground">Victoria IA · Gerador</span>
                </div>
                <button onClick={() => setShowAI(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <p className="text-[10px] text-muted-foreground leading-relaxed">Descreva o tema ou estratégia para gerar nós automaticamente.</p>
                <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Ex: Estratégia de lançamento de seminovos no RJ..." rows={5}
                  className="w-full rounded-xl bg-muted/30 border border-border px-3 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary/50 resize-none"
                />
                <div className="flex gap-1.5">
                  {(["radial","tree","list"] as const).map(l => (
                    <button key={l} onClick={() => setLayout(l)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                        layout === l ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      {l === "radial" ? "Radial" : l === "tree" ? "Árvore" : "Lista"}
                    </button>
                  ))}
                </div>
                <button onClick={generateWithAI} disabled={aiLoading || !aiPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-primary-foreground hover:opacity-90 disabled:opacity-50">
                  {aiLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</> : <><Sparkles className="h-3.5 w-3.5" /> Gerar Mapa</>}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Presentation Bar ── */}
        <AnimatePresence>
          {presentMode && (
            <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
              className="absolute inset-x-0 bottom-0 z-50">
              <div className="flex items-center justify-center gap-4 bg-card/90 backdrop-blur-xl border-t border-border px-6 py-3">
                <button onClick={() => setPresentMode(false)}
                  className="rounded-xl bg-destructive/15 border border-destructive/30 px-3 py-1.5 text-[10px] font-black text-destructive hover:bg-destructive/20 transition-all">
                  <Square className="h-3 w-3 inline mr-1" />Encerrar
                </button>
                <button onClick={() => goToSlide(Math.max(0, slideIndex - 1))} disabled={slideIndex === 0}
                  className="rounded-xl bg-muted/40 border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  {slideNodes.map((_, i) => (
                    <button key={i} onClick={() => goToSlide(i)}
                      className={`h-2 rounded-full transition-all ${i === slideIndex ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"}`} />
                  ))}
                </div>
                <button onClick={() => goToSlide(Math.min(slideNodes.length - 1, slideIndex + 1))} disabled={slideIndex >= slideNodes.length - 1}
                  className="rounded-xl bg-muted/40 border border-border p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-all">
                  <ChevronRight className="h-4 w-4" />
                </button>
                <span className="text-[10px] text-muted-foreground font-mono">{slideIndex + 1} / {slideNodes.length}</span>
                <button onClick={() => rf.fitView({ padding: 0.1, duration: 600 })}
                  className="rounded-xl bg-muted/40 border border-border p-1.5 text-muted-foreground hover:text-foreground transition-all">
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Help Modal ── */}
        <AnimatePresence>
          {showHelp && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={() => setShowHelp(false)}>
              <motion.div
                initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                className="bg-card border border-border rounded-2xl p-6 w-[400px] shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-primary" />
                    <span className="text-sm font-black text-foreground">Como usar o Strategy Map</span>
                  </div>
                  <button onClick={() => setShowHelp(false)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                </div>
                <div className="space-y-3">
                  <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1">
                    <p className="text-[10px] font-black text-foreground">➕ Botões laterais nos nós</p>
                    <p className="text-[10px] text-muted-foreground">Passe o mouse sobre um nó → clique num dos 4 botões + nos lados para criar um filho naquela direção.</p>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1">
                    <p className="text-[10px] font-black text-foreground">✏️ / 🗑 Editar e excluir</p>
                    <p className="text-[10px] text-muted-foreground">Ícones aparecem no canto superior direito do nó ao hover. Editar abre o painel de personalização.</p>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1">
                    <p className="text-[10px] font-black text-foreground">🔗 Conectar dois nós quaisquer</p>
                    <p className="text-[10px] text-muted-foreground">Passe o mouse sobre um nó → aparecem círculos coloridos nas bordas → arraste de um círculo até outro nó para criar uma conexão cruzada.</p>
                  </div>
                  <div className="bg-muted/30 border border-border rounded-xl p-3 space-y-1">
                    <p className="text-[10px] font-black text-foreground">🆕 Adicionar Nó (toolbar)</p>
                    <p className="text-[10px] text-muted-foreground">Cria um nó solto sem pai no centro do canvas. Ideal para tópicos independentes.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[["Ctrl+S","Salvar"],["Ctrl+Z","Desfazer"],["Ctrl+Shift+Z","Refazer"],["Ctrl+F","Buscar"],["Delete","Excluir nó selecionado"],["Esc","Fechar painéis"]].map(([k, d]) => (
                      <div key={k} className="flex items-center justify-between py-1 border-b border-border/30 last:border-0 col-span-1">
                        <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[9px] font-mono font-bold text-foreground">{k}</kbd>
                        <span className="text-[9px] text-muted-foreground ml-2">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </MapActionsCtx.Provider>
  );
}
