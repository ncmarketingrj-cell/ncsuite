import { useCallback, useRef, useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ReactFlow, MiniMap, Controls, Background, BackgroundVariant,
  ReactFlowProvider, useReactFlow, addEdge, Panel,
  type Node, type Edge, type Connection, type NodeChange, type EdgeChange,
  applyNodeChanges, applyEdgeChanges, MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Plus, Trash2, Download, Presentation, ChevronLeft, ChevronRight,
  Sparkles, X, AlignCenter, AlignLeft, List, GitBranch, ZoomIn, ZoomOut,
  Loader2, Bold, Smile, FileText, Play, Square, Maximize2, ChevronDown,
  Save, LayoutGrid, Workflow, Layers,
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

// ─── Cores por nível ────────────────────────────────────────────────────────
const LEVEL_COLORS = ["#e11d48", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#a855f7"];

const getLevelColor = (nodes: Node[], node: Node): string => {
  let depth = 0;
  let cur = node;
  while (cur.parentId) {
    const parent = nodes.find(n => n.id === cur.parentId);
    if (!parent) break;
    cur = parent;
    depth++;
    if (depth > 5) break;
  }
  return LEVEL_COLORS[Math.min(depth, LEVEL_COLORS.length - 1)];
};

// ─── Custom Node ─────────────────────────────────────────────────────────────
function MindNode({ id, data, selected }: { id: string; data: any; selected: boolean }) {
  const [showNote, setShowNote] = useState(false);
  const { setNodes } = useReactFlow();

  const updateLabel = (label: string) =>
    setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, label } } : n));

  return (
    <div
      className={`group relative rounded-2xl border-2 transition-all duration-200 cursor-pointer min-w-[140px] max-w-[220px] ${
        selected ? "shadow-[0_0_0_3px_rgba(255,255,255,0.4)]" : ""
      }`}
      style={{
        background: data.bgColor || "rgba(15,15,20,0.92)",
        borderColor: data.color || "#e11d48",
        boxShadow: selected ? `0 0 20px ${data.color}55` : `0 2px 12px rgba(0,0,0,0.5)`,
      }}
    >
      {/* Slide badge */}
      {data.slideOrder != null && (
        <div className="absolute -top-2 -left-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center text-[9px] font-black text-white z-10">
          {data.slideOrder + 1}
        </div>
      )}

      <div className="p-3">
        {/* Emoji + label */}
        <div className="flex items-start gap-1.5">
          {data.emoji && <span className="text-base leading-none mt-0.5 shrink-0">{data.emoji}</span>}
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={e => updateLabel(e.currentTarget.textContent || "")}
            className="text-sm font-bold text-white outline-none leading-snug flex-1 break-words"
            style={{ fontSize: `${data.fontSize || 13}px` }}
          >
            {data.label}
          </div>
        </div>

        {/* Note toggle */}
        {data.note && (
          <button
            onClick={e => { e.stopPropagation(); setShowNote(v => !v); }}
            className="mt-1.5 flex items-center gap-1 text-[9px] text-white/40 hover:text-white/70"
          >
            <FileText className="h-2.5 w-2.5" />
            {showNote ? "Ocultar nota" : "Ver nota"}
          </button>
        )}
        <AnimatePresence>
          {showNote && data.note && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <p className="mt-2 text-[10px] text-white/60 border-t border-white/10 pt-2 leading-relaxed">
                {data.note}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Handles invisíveis mas funcionais */}
      <div className="absolute inset-0 pointer-events-none">
        {["top","bottom","left","right"].map(pos => (
          <div
            key={pos}
            data-handleid={pos}
            data-handlepos={pos}
            className="react-flow__handle"
            style={{
              position:"absolute",
              [pos === "top" ? "top" : pos === "bottom" ? "bottom" : pos === "left" ? "left" : "right"]: -4,
              [pos === "top" || pos === "bottom" ? "left" : "top"]: "50%",
              transform: "translate(-50%, -50%)",
              width:8, height:8,
              borderRadius:"50%",
              background: data.color || "#e11d48",
              border: "2px solid #000",
              pointerEvents:"all",
            }}
          />
        ))}
      </div>
    </div>
  );
}

const NODE_TYPES = { mind: MindNode };

// ─── Algoritmos de Layout ────────────────────────────────────────────────────
function applyRadialLayout(nodes: Node[], edges: Edge[]): Node[] {
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
    memo.set(id, d);
    return d;
  };

  return nodes.map(n => {
    const depth = getDepth(n.id);
    if (depth === 0) return { ...n, position: { x: 0, y: 0 } };

    const pid = n.parentId as string;
    const siblings = childrenMap.get(pid) || [];
    const idx = siblings.indexOf(n.id);
    const radius = depth * 280;
    const siblingStart = -(siblings.length - 1) / 2;
    const angleSpread = Math.min(Math.PI * 1.4, (2 * Math.PI) / Math.max(1, depth));
    const angle = (siblingStart + idx) * (angleSpread / Math.max(1, siblings.length - 1)) - Math.PI / 2;

    return {
      ...n,
      position: {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      },
    };
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

  const placeSubtree = (id: string, depth: number) => {
    const n = nodes.find(nn => nn.id === id);
    if (!n) return;
    placed.push({ ...n, position: { x: depth * 60, y } });
    y += 90;
    nodes.filter(nn => nn.parentId === id).forEach(c => placeSubtree(c.id, depth + 1));
  };

  roots.forEach(r => placeSubtree(r.id, 0));
  return placed;
}

// ─── Página Principal ────────────────────────────────────────────────────────
function StrategyMapPage() {
  const rf = useReactFlow();
  const canvasRef = useRef<HTMLDivElement>(null);

  // Maps list
  const [maps, setMaps] = useState<any[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [mapTitle, setMapTitle] = useState("Novo Mapa Mental");
  const [layout, setLayout] = useState<"radial" | "tree" | "list" | "free">("radial");

  // Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);

  // UI state
  const [showAI, setShowAI] = useState(false);
  const [showStylePanel, setShowStylePanel] = useState(false);
  const [presentMode, setPresentMode] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [showMapList, setShowMapList] = useState(false);

  // Load maps on mount
  useEffect(() => { loadMaps(); }, []);

  const loadMaps = async () => {
    const { data } = await (supabase as any).from("mind_maps").select("*").order("updated_at", { ascending: false });
    setMaps(data || []);
    if (data && data.length > 0 && !activeMapId) loadMap(data[0].id);
  };

  const loadMap = async (mapId: string) => {
    setActiveMapId(mapId);
    const map = maps.find(m => m.id === mapId);
    if (map) { setMapTitle(map.title); setLayout(map.layout); }

    const [{ data: dbNodes }, { data: dbEdges }] = await Promise.all([
      (supabase as any).from("mind_map_nodes").select("*").eq("map_id", mapId),
      (supabase as any).from("mind_map_edges").select("*").eq("map_id", mapId),
    ]);

    const flowNodes: Node[] = ((dbNodes as any[]) || []).map((n: any) => ({
      id: n.id,
      type: "mind",
      position: { x: Number(n.pos_x), y: Number(n.pos_y) },
      parentId: n.parent_id || undefined,
      data: {
        label: n.label, emoji: n.emoji, note: n.note,
        color: n.color, bgColor: n.bg_color,
        fontSize: n.font_size, bold: n.bold,
        slideOrder: n.slide_order,
      },
    }));

    const flowEdges: Edge[] = ((dbEdges as any[]) || []).map((e: any) => ({
      id: e.id,
      source: e.source_id,
      target: e.target_id,
      label: e.label,
      type: e.style || "bezier",
      animated: e.animated,
      markerEnd: { type: MarkerType.ArrowClosed, color: e.color || "#6b7280" },
      style: { stroke: e.color || "#6b7280", strokeWidth: 2 },
    }));

    setNodes(flowNodes);
    setEdges(flowEdges);
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 600 }), 100);
  };

  const createMap = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await (supabase as any).from("mind_maps").insert({
      user_id: user.id, title: "Novo Mapa Mental", layout: "radial"
    }).select().single();
    if (data) {
      // Cria nó raiz
      await (supabase as any).from("mind_map_nodes").insert({
        map_id: data.id, label: "Tema Central", emoji: "🎯", color: "#e11d48", pos_x: 0, pos_y: 0
      });
      setMaps(prev => [data, ...prev]);
      loadMap(data.id);
    }
  };

  const saveMap = async () => {
    if (!activeMapId) return;
    setSaving(true);
    try {
      await (supabase as any).from("mind_maps").update({ title: mapTitle, layout, updated_at: new Date().toISOString() }).eq("id", activeMapId);
      await (supabase as any).from("mind_map_nodes").delete().eq("map_id", activeMapId);
      await (supabase as any).from("mind_map_edges").delete().eq("map_id", activeMapId);

      if (nodes.length > 0) {
        await (supabase as any).from("mind_map_nodes").insert(
          nodes.map(n => ({
            id: n.id, map_id: activeMapId,
            parent_id: n.parentId || null,
            label: n.data.label || "Tópico",
            emoji: n.data.emoji || null,
            note: n.data.note || null,
            color: n.data.color || "#e11d48",
            bg_color: n.data.bgColor || null,
            font_size: n.data.fontSize || 13,
            bold: n.data.bold || false,
            pos_x: n.position.x, pos_y: n.position.y,
            slide_order: n.data.slideOrder ?? null,
          }))
        );
      }

      if (edges.length > 0) {
        await (supabase as any).from("mind_map_edges").insert(
          edges.map(e => ({
            id: e.id, map_id: activeMapId,
            source_id: e.source, target_id: e.target,
            label: String(e.label || ""),
            style: e.type || "bezier",
            color: (e.style as any)?.stroke || "#6b7280",
            animated: e.animated || false,
          }))
        );
      }

      toast.success("Mapa salvo!");
    } catch (err) {
      toast.error("Erro ao salvar mapa");
    } finally {
      setSaving(false);
    }
  };

  // Adiciona nó filho do selecionado (ou raiz livre)
  const addNode = () => {
    const parentId = selectedNode?.id;
    const id = `n_${Date.now()}`;
    const color = parentId
      ? LEVEL_COLORS[Math.min((nodes.find(n => n.id === parentId) ? 1 : 0) + 1, LEVEL_COLORS.length - 1)]
      : LEVEL_COLORS[0];

    const parentPos = selectedNode ? selectedNode.position : { x: 0, y: 0 };
    const childCount = nodes.filter(n => n.parentId === parentId).length;

    const newNode: Node = {
      id, type: "mind",
      position: { x: parentPos.x + 280, y: parentPos.y + childCount * 100 },
      parentId: parentId || undefined,
      data: { label: "Novo Tópico", color, emoji: "💡", fontSize: 13 },
    };

    setNodes(ns => [...ns, newNode]);

    if (parentId) {
      const newEdge: Edge = {
        id: `e_${parentId}_${id}`,
        source: parentId, target: id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: { stroke: "#6b7280", strokeWidth: 2 },
      };
      setEdges(es => [...es, newEdge]);
    }
  };

  const deleteSelected = () => {
    if (!selectedNode) return;
    const toDelete = new Set<string>();
    const collect = (id: string) => {
      toDelete.add(id);
      nodes.filter(n => n.parentId === id).forEach(c => collect(c.id));
    };
    collect(selectedNode.id);
    setNodes(ns => ns.filter(n => !toDelete.has(n.id)));
    setEdges(es => es.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)));
    setSelectedNode(null);
  };

  const applyLayout = (newLayout: "radial" | "tree" | "list" | "free") => {
    setLayout(newLayout);
    let laid: Node[];
    if (newLayout === "radial") laid = applyRadialLayout(nodes, edges);
    else if (newLayout === "tree") laid = applyTreeLayout(nodes, edges);
    else if (newLayout === "list") laid = applyListLayout(nodes);
    else return;
    setNodes(laid);
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 600 }), 50);
  };

  // AI Generator
  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string) || "https://xudumzedcxuuhxokissm.supabase.co";
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-mind-map-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
          "apikey": session?.access_token || "",
        },
        body: JSON.stringify({ prompt: aiPrompt, layout, maxDepth: 3, maxBranches: 5 }),
      });

      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Erro ao gerar mapa");

      const flowNodes: Node[] = result.nodes.map((n: any) => ({
        id: n.id, type: "mind",
        position: { x: Number(n.pos_x || 0), y: Number(n.pos_y || 0) },
        parentId: n.parentId || undefined,
        data: { label: n.label, emoji: n.emoji, color: n.color, fontSize: 13 },
      }));

      const flowEdges: Edge[] = result.edges.map((e: any) => ({
        id: e.id, source: e.source_id, target: e.target_id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: { stroke: "#6b7280", strokeWidth: 2 },
      }));

      setMapTitle(result.title || aiPrompt);
      setNodes(flowNodes);
      setEdges(flowEdges);
      setShowAI(false);
      setAiPrompt("");
      toast.success(`Mapa "${result.title}" gerado com ${flowNodes.length} nós!`);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 800 }), 100);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar mapa com IA");
    } finally {
      setAiLoading(false);
    }
  };

  // Presentation mode
  const slideNodes = nodes
    .filter(n => n.data.slideOrder != null)
    .sort((a, b) => (a.data.slideOrder as number) - (b.data.slideOrder as number));

  const goToSlide = (index: number) => {
    const node = slideNodes[index];
    if (!node) return;
    setSlideIndex(index);
    rf.setCenter(node.position.x + 90, node.position.y + 40, { zoom: 1.4, duration: 700 });
  };

  const toggleSlide = () => {
    if (!selectedNode) return;
    const current = selectedNode.data.slideOrder;
    if (current != null) {
      setNodes(ns => ns.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, slideOrder: undefined } } : n));
      toast("Removido da apresentação");
    } else {
      const nextOrder = slideNodes.length;
      setNodes(ns => ns.map(n => n.id === selectedNode.id ? { ...n, data: { ...n.data, slideOrder: nextOrder } } : n));
      toast.success(`Adicionado como slide ${nextOrder + 1}`);
    }
  };

  // Export
  const exportPNG = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `${mapTitle}.png`;
    a.click();
    toast.success("PNG exportado!");
  };

  const exportPDF = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const canvas = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width / 2, canvas.height / 2] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width / 2, canvas.height / 2);
    pdf.save(`${mapTitle}.pdf`);
    toast.success("PDF exportado!");
  };

  // Node style update helper
  const updateSelectedNode = (patch: Partial<any>) => {
    if (!selectedNode) return;
    setNodes(ns => ns.map(n => n.id === selectedNode.id
      ? { ...n, data: { ...n.data, ...patch } }
      : n
    ));
    setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, ...patch } } : prev);
  };

  const onNodesChange = useCallback((changes: NodeChange[]) =>
    setNodes(ns => applyNodeChanges(changes, ns)), []);
  const onEdgesChange = useCallback((changes: EdgeChange[]) =>
    setEdges(es => applyEdgeChanges(changes, es)), []);
  const onConnect = useCallback((conn: Connection) =>
    setEdges(es => addEdge({
      ...conn, type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
      style: { stroke: "#6b7280", strokeWidth: 2 },
    }, es)), []);

  return (
    <div className="relative flex h-screen w-full flex-col bg-[#0a0a0f] overflow-hidden">

      {/* ── Top Bar ── */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-2 px-4 py-2.5 bg-black/60 backdrop-blur-xl border-b border-white/8">
        {/* Left: title + map selector */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-7 w-7 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center">
              <Brain className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-xs font-black text-white tracking-wide hidden sm:block">STRATEGY MAP</span>
          </div>
          <div className="h-4 w-px bg-white/10" />
          <button
            onClick={() => setShowMapList(v => !v)}
            className="flex items-center gap-1.5 text-xs font-bold text-white/80 hover:text-white truncate max-w-[200px]"
          >
            <span className="truncate">{mapTitle}</span>
            <ChevronDown className="h-3 w-3 shrink-0 text-white/40" />
          </button>
          <input
            value={mapTitle}
            onChange={e => setMapTitle(e.target.value)}
            className="hidden"
          />
        </div>

        {/* Center: layout switcher */}
        <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-xl p-1">
          {([
            { val: "radial", icon: Layers, label: "Radial" },
            { val: "tree",   icon: GitBranch, label: "Árvore" },
            { val: "list",   icon: List, label: "Lista" },
          ] as const).map(({ val, icon: Icon, label }) => (
            <button
              key={val}
              onClick={() => applyLayout(val)}
              title={label}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                layout === val ? "bg-primary text-white" : "text-white/50 hover:text-white hover:bg-white/10"
              }`}
            >
              <Icon className="h-3 w-3" />
              <span className="hidden sm:block">{label}</span>
            </button>
          ))}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowAI(v => !v)}
            className="flex items-center gap-1.5 rounded-xl bg-primary/15 border border-primary/30 px-3 py-1.5 text-[10px] font-black text-primary hover:bg-primary/25 transition-all">
            <Sparkles className="h-3 w-3" />
            <span className="hidden sm:block">Victoria IA</span>
          </button>
          <button onClick={addNode}
            className="flex items-center gap-1 rounded-xl bg-white/8 border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/70 hover:text-white hover:bg-white/12 transition-all">
            <Plus className="h-3 w-3" />
            <span className="hidden sm:block">Nó</span>
          </button>
          {selectedNode && (
            <>
              <button onClick={() => setShowStylePanel(v => !v)}
                className="flex items-center gap-1 rounded-xl bg-white/8 border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/70 hover:text-white transition-all">
                <Smile className="h-3 w-3" />
              </button>
              <button onClick={toggleSlide}
                title="Adicionar/remover do slideshow"
                className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                  selectedNode.data.slideOrder != null
                    ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                    : "bg-white/8 border-white/10 text-white/70 hover:text-white"
                }`}>
                <Presentation className="h-3 w-3" />
              </button>
              <button onClick={deleteSelected}
                className="flex items-center gap-1 rounded-xl bg-red-500/10 border border-red-500/20 px-2.5 py-1.5 text-[10px] font-bold text-red-400 hover:bg-red-500/20 transition-all">
                <Trash2 className="h-3 w-3" />
              </button>
            </>
          )}
          <div className="h-4 w-px bg-white/10" />
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
            <button
              onClick={() => {
                const m = document.getElementById("export-menu");
                if (m) m.classList.toggle("hidden");
              }}
              className="flex items-center gap-1 rounded-xl bg-white/8 border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/70 hover:text-white transition-all">
              <Download className="h-3 w-3" />
            </button>
            <div id="export-menu" className="hidden absolute right-0 top-9 bg-black/90 border border-white/10 rounded-xl overflow-hidden z-50 w-28">
              <button onClick={exportPNG} className="w-full px-3 py-2 text-[11px] text-left text-white/70 hover:bg-white/10 hover:text-white">Exportar PNG</button>
              <button onClick={exportPDF} className="w-full px-3 py-2 text-[11px] text-left text-white/70 hover:bg-white/10 hover:text-white">Exportar PDF</button>
            </div>
          </div>
          <button onClick={() => createMap()}
            className="flex items-center gap-1 rounded-xl bg-white/8 border border-white/10 px-2.5 py-1.5 text-[10px] font-bold text-white/70 hover:text-white transition-all">
            <LayoutGrid className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* ── Map List Dropdown ── */}
      <AnimatePresence>
        {showMapList && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="absolute top-14 left-4 z-40 w-64 bg-black/90 border border-white/10 rounded-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-2">
              <button onClick={() => { createMap(); setShowMapList(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/10 text-[11px] font-bold text-primary">
                <Plus className="h-3 w-3" /> Novo mapa
              </button>
              {maps.map(m => (
                <button key={m.id}
                  onClick={() => { loadMap(m.id); setShowMapList(false); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-[11px] font-medium transition-all ${
                    m.id === activeMapId ? "bg-primary/20 text-primary" : "text-white/60 hover:bg-white/10 hover:text-white"
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
          onNodeClick={(_, node) => { setSelectedNode(node); setShowStylePanel(false); }}
          onPaneClick={() => { setSelectedNode(null); setShowStylePanel(false); }}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: "smoothstep",
            markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
            style: { stroke: "#6b7280", strokeWidth: 2 },
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="rgba(255,255,255,0.04)" />
          <MiniMap
            nodeColor={n => (n.data?.color as string) || "#e11d48"}
            className="!bg-black/80 !border !border-white/10 !rounded-xl"
          />
          <Controls className="!bg-black/80 !border !border-white/10 !rounded-xl" />
        </ReactFlow>
      </div>

      {/* ── AI Sidebar ── */}
      <AnimatePresence>
        {showAI && (
          <motion.div
            initial={{ x: 320 }} animate={{ x: 0 }} exit={{ x: 320 }}
            className="absolute right-0 top-12 bottom-0 z-40 w-80 bg-black/90 border-l border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/8">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="text-sm font-black text-white">Victoria IA · Gerador</span>
              </div>
              <button onClick={() => setShowAI(false)} className="text-white/40 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <p className="text-[10px] text-white/40 leading-relaxed">
                Descreva o tema ou estratégia. A Victoria gera os nós automaticamente com a estrutura ideal.
              </p>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Tema ou briefing</label>
                <textarea
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                  placeholder="Ex: Estratégia de lançamento de seminovos no RJ para o mês de julho..."
                  rows={5}
                  className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-xs text-white placeholder:text-white/25 outline-none focus:border-primary/50 resize-none leading-relaxed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Layout inicial</label>
                <div className="flex gap-1.5">
                  {(["radial","tree","list"] as const).map(l => (
                    <button key={l} onClick={() => setLayout(l)}
                      className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${
                        layout === l ? "bg-primary text-white border-primary" : "border-white/10 text-white/50 hover:border-white/30 hover:text-white"
                      }`}>
                      {l === "radial" ? "Radial" : l === "tree" ? "Árvore" : "Lista"}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={generateWithAI}
                disabled={aiLoading || !aiPrompt.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-black text-white hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {aiLoading ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Gerando...</> : <><Sparkles className="h-3.5 w-3.5" /> Gerar Mapa</>}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Style Panel ── */}
      <AnimatePresence>
        {showStylePanel && selectedNode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="absolute left-4 bottom-4 z-40 w-64 bg-black/90 border border-white/10 rounded-2xl p-4 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-white">Estilo do Nó</span>
              <button onClick={() => setShowStylePanel(false)} className="text-white/40 hover:text-white"><X className="h-3.5 w-3.5" /></button>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Emoji</label>
              <input
                value={selectedNode.data.emoji as string || ""}
                onChange={e => updateSelectedNode({ emoji: e.target.value })}
                placeholder="🎯"
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-primary/50"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Cor da borda</label>
              <div className="flex gap-1.5 flex-wrap">
                {["#e11d48","#f97316","#eab308","#22c55e","#3b82f6","#a855f7","#ec4899","#ffffff"].map(c => (
                  <button key={c} onClick={() => updateSelectedNode({ color: c })}
                    className={`h-6 w-6 rounded-lg border-2 transition-all ${selectedNode.data.color === c ? "border-white scale-110" : "border-transparent"}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Nota</label>
              <textarea
                value={selectedNode.data.note as string || ""}
                onChange={e => updateSelectedNode({ note: e.target.value })}
                placeholder="Adicione uma nota expansível..."
                rows={3}
                className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-primary/50 resize-none"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide">Tamanho da fonte</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={10} max={24} step={1}
                  value={selectedNode.data.fontSize as number || 13}
                  onChange={e => updateSelectedNode({ fontSize: Number(e.target.value) })}
                  className="flex-1 accent-primary"
                />
                <span className="text-[11px] text-white/60 w-6 text-right">{String(selectedNode.data.fontSize || 13)}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Presentation Mode ── */}
      <AnimatePresence>
        {presentMode && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-x-0 bottom-0 z-50"
          >
            <div className="flex items-center justify-center gap-4 bg-black/85 backdrop-blur-xl border-t border-white/10 px-6 py-3">
              <button onClick={() => setPresentMode(false)}
                className="rounded-xl bg-red-500/20 border border-red-500/30 px-3 py-1.5 text-[10px] font-black text-red-400 hover:bg-red-500/30 transition-all">
                <Square className="h-3 w-3 inline mr-1" />Encerrar
              </button>
              <button onClick={() => goToSlide(Math.max(0, slideIndex - 1))} disabled={slideIndex === 0}
                className="rounded-xl bg-white/8 border border-white/10 p-1.5 text-white/70 hover:text-white disabled:opacity-30 transition-all">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-1.5">
                {slideNodes.map((_, i) => (
                  <button key={i} onClick={() => goToSlide(i)}
                    className={`h-2 rounded-full transition-all ${i === slideIndex ? "w-6 bg-primary" : "w-2 bg-white/20 hover:bg-white/40"}`} />
                ))}
              </div>
              <button onClick={() => goToSlide(Math.min(slideNodes.length - 1, slideIndex + 1))} disabled={slideIndex >= slideNodes.length - 1}
                className="rounded-xl bg-white/8 border border-white/10 p-1.5 text-white/70 hover:text-white disabled:opacity-30 transition-all">
                <ChevronRight className="h-4 w-4" />
              </button>
              <span className="text-[10px] text-white/40 font-mono">
                {slideIndex + 1} / {slideNodes.length}
              </span>
              <button onClick={() => rf.fitView({ padding: 0.1, duration: 600 })}
                className="rounded-xl bg-white/8 border border-white/10 p-1.5 text-white/70 hover:text-white transition-all">
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
