import {
  useCallback, useEffect, useRef, useState, useMemo,
} from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ReactFlow, MiniMap, Controls, Background, BackgroundVariant,
  ReactFlowProvider, useReactFlow, useViewport, addEdge, Panel,
  ConnectionMode,
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
  Redo2, Pencil, Palette, Folder, Copy, Cloud, CloudCheck, Check,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import dagre from "dagre";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import { MindMeisterNode } from "@/components/mindmap/MindMeisterNode";
import { MindMapActionsContext, type MindMapDir } from "@/components/mindmap/MindMapContext";
import { MindMapManagerModal } from "@/components/mindmap/MindMapManagerModal";
import {
  listUserMindMaps,
  createNewMindMap,
  loadMindMapContent,
  saveMindMapContent,
  type MindMapRecord,
} from "@/components/mindmap/mindMapService";
import { type MindMapTemplate } from "@/components/mindmap/mindMapTemplates";

export const Route = createFileRoute("/_app/strategy-map")({
  component: () => (
    <ReactFlowProvider>
      <StrategyMapPage />
    </ReactFlowProvider>
  ),
});

// ─── Paletas MindMeister ──────────────────────────────────────────────────────
const MINDMEISTER_BRANCH_COLORS = [
  "#3b82f6", // Safira
  "#10b981", // Esmeralda
  "#8b5cf6", // Violeta
  "#f59e0b", // Âmbar
  "#ec4899", // Rosa choque
  "#06b6d4", // Ciano
  "#f97316", // Laranja
  "#e11d48", // Carmim
];

const THEMES = [
  { id: "mindmeister_dark", name: "MindMeister Dark", bg: "#0c0d14", dots: "rgba(255,255,255,0.08)" },
  { id: "cyber_neon",       name: "Cyber Neon",        bg: "#08090f", dots: "rgba(59,130,246,0.15)" },
  { id: "ocean_slate",      name: "Ocean Slate",       bg: "#0a1120", dots: "rgba(14,165,233,0.12)" },
  { id: "sunset_warm",      name: "Sunset Warm",       bg: "#140c0f", dots: "rgba(244,63,94,0.12)" },
];

const NODE_TYPES = { mind: MindMeisterNode };

// ─── Layouts ──────────────────────────────────────────────────────────────────
function applyRadialLayout(nodes: Node[]): Node[] {
  const childrenMap = new Map<string | null, string[]>();
  nodes.forEach((n) => {
    const pid = (n.data?.parentId as string) || null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(n.id);
  });

  const getDepth = (id: string, memo = new Map<string, number>()): number => {
    if (memo.has(id)) return memo.get(id)!;
    const node = nodes.find((n) => n.id === id);
    if (!node || !node.data?.parentId) return 0;
    const d = 1 + getDepth(node.data.parentId as string, memo);
    memo.set(id, d);
    return d;
  };

  return nodes.map((n) => {
    const depth = getDepth(n.id);
    if (depth === 0) return { ...n, position: { x: 0, y: 0 } };
    const pid = n.data?.parentId as string;
    const siblings = childrenMap.get(pid) || [];
    const idx = siblings.indexOf(n.id);
    const radius = depth * 320;
    const spread = Math.min(Math.PI * 1.6, (2 * Math.PI) / Math.max(1, depth));
    const angle =
      (-(siblings.length - 1) / 2 + idx) * (spread / Math.max(1, siblings.length - 1)) -
      Math.PI / 2;
    return { ...n, position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius } };
  });
}

function applyTreeLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 100, nodesep: 50 });
  nodes.forEach((n) => g.setNode(n.id, { width: 220, height: 75 }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return pos ? { ...n, position: { x: pos.x - 110, y: pos.y - 37 } } : n;
  });
}

function applyListLayout(nodes: Node[]): Node[] {
  const roots = nodes.filter((n) => !n.data?.parentId);
  let y = 0;
  const placed: Node[] = [];
  const place = (id: string, depth: number) => {
    const n = nodes.find((nn) => nn.id === id);
    if (!n) return;
    placed.push({ ...n, position: { x: depth * 80, y } });
    y += 95;
    nodes
      .filter((nn) => nn.data?.parentId === id)
      .forEach((c) => place(c.id, depth + 1));
  };
  roots.forEach((r) => place(r.id, 0));
  return placed;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
function StrategyMapPage() {
  const rf = useReactFlow();

  // Estados dos mapas e gerenciador
  const [maps, setMaps] = useState<MindMapRecord[]>([]);
  const [activeMapId, setActiveMapId] = useState<string | null>(null);
  const [mapTitle, setMapTitle] = useState("Novo Mapa Mental");
  const [layout, setLayout] = useState<"radial" | "tree" | "list" | "free">("radial");
  const [themeId, setThemeId] = useState("mindmeister_dark");
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  // Nós e Arestas
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Status de Salvamento
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI Panels
  const [showAI, setShowAI] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editorTab, setEditorTab] = useState<"style" | "content" | "checklist" | "links">("style");
  const [presentMode, setPresentMode] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [newChecklistText, setNewChecklistText] = useState("");
  const [newLinkLabel, setNewLinkLabel] = useState("");
  const [newLinkUrl, setNewLinkUrl] = useState("");
  const [isEditingTitleInline, setIsEditingTitleInline] = useState(false);

  // Refs de sincronização
  const canvasRef = useRef<HTMLDivElement>(null);
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

  // Histórico Undo / Redo
  const historyRef = useRef<Array<{ nodes: Node[]; edges: Edge[] }>>([]);
  const historyIdxRef = useRef(-1);

  const pushHistory = useCallback((ns: Node[], es: Edge[]) => {
    historyRef.current = historyRef.current.slice(0, historyIdxRef.current + 1);
    historyRef.current.push({ nodes: [...ns], edges: [...es] });
    if (historyRef.current.length > 50) historyRef.current.shift();
    else historyIdxRef.current++;

    // Marca como pendente de salvamento e engatilha auto-save com debounce de 1.5s
    setSaveStatus("unsaved");
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      triggerSilentAutoSave();
    }, 1500);
  }, []);

  const undo = useCallback(() => {
    if (historyIdxRef.current <= 0) return;
    historyIdxRef.current--;
    const s = historyRef.current[historyIdxRef.current];
    setNodes([...s.nodes]);
    setEdges([...s.edges]);
    toast("↩ Desfeito");
  }, []);

  const redo = useCallback(() => {
    if (historyIdxRef.current >= historyRef.current.length - 1) return;
    historyIdxRef.current++;
    const s = historyRef.current[historyIdxRef.current];
    setNodes([...s.nodes]);
    setEdges([...s.edges]);
    toast("↪ Refeito");
  }, []);

  // ── Salvamento Automático & Manual ──
  const triggerSilentAutoSave = async () => {
    const mapId = activeMapIdRef.current;
    if (!mapId) return;

    setSaveStatus("saving");
    try {
      const ok = await saveMindMapContent(
        mapId,
        mapTitleRef.current,
        layoutRef.current,
        nodesRef.current,
        edgesRef.current
      );
      if (ok) {
        setSaveStatus("saved");
      } else {
        setSaveStatus("unsaved");
      }
    } catch {
      setSaveStatus("unsaved");
    }
  };

  const handleManualSave = async () => {
    let mapId = activeMapIdRef.current;

    // Se ainda não tiver ID, cria primeiro
    if (!mapId) {
      const res = await createNewMindMap(mapTitleRef.current, null, layoutRef.current as any);
      mapId = res.map.id;
      setActiveMapId(mapId);
      loadMapsList();
    }

    setSaveStatus("saving");
    const ok = await saveMindMapContent(
      mapId,
      mapTitleRef.current,
      layoutRef.current,
      nodesRef.current,
      edgesRef.current
    );
    setSaveStatus(ok ? "saved" : "unsaved");
    if (ok) {
      toast.success("Mapa mental salvo com sucesso!");
      loadMapsList();
    } else {
      toast.error("Erro ao salvar mapa.");
    }
  };

  // ── Carregamento de Mapas ──
  const loadMapsList = async () => {
    const list = await listUserMindMaps();
    setMaps(list);
    return list;
  };

  const handleSelectMap = async (mapId: string) => {
    const targetMap = maps.find((m) => m.id === mapId);
    setActiveMapId(mapId);
    if (targetMap) {
      setMapTitle(targetMap.title);
      setLayout(targetMap.layout || "radial");
      if (targetMap.theme) setThemeId(targetMap.theme);
    }

    const content = await loadMindMapContent(mapId);
    setNodes(content.nodes);
    setEdges(content.edges);

    historyRef.current = [{ nodes: content.nodes, edges: content.edges }];
    historyIdxRef.current = 0;
    setSaveStatus("saved");

    setTimeout(() => rf.fitView({ padding: 0.25, duration: 600 }), 100);
  };

  const handleCreateNewMap = async (title: string, template?: MindMapTemplate | null) => {
    const res = await createNewMindMap(title, template, "radial");
    setMaps((prev) => [res.map, ...prev]);
    setActiveMapId(res.map.id);
    setMapTitle(res.map.title);
    setLayout(res.map.layout);
    setNodes(res.nodes);
    setEdges(res.edges);

    historyRef.current = [{ nodes: res.nodes, edges: res.edges }];
    historyIdxRef.current = 0;
    setSaveStatus("saved");

    toast.success(`Mapa "${title}" criado!`);
    setTimeout(() => rf.fitView({ padding: 0.25, duration: 700 }), 100);
  };

  // Inicialização ao carregar
  useEffect(() => {
    loadMapsList().then((list) => {
      if (list.length > 0) {
        handleSelectMap(list[0].id);
      } else {
        // Inicializa com um mapa em branco pronto
        handleCreateNewMap("Meu Primeiro Mapa Mental", null);
      }
    });
  }, []);

  // ── Adicionar Filho (MindMeister TAB) ──
  const addChildNode = useCallback(
    (parentId: string, dir: MindMapDir = "right") => {
      const parent = nodesRef.current.find((n) => n.id === parentId);
      if (!parent) return;

      const isParentRoot = !!parent.data?.isRoot;

      // Se o pai for a raiz, escolhe uma nova cor de ramo; se já for ramo, herda a cor
      let branchColor: string =
        (parent.data?.branchColor as string) || (parent.data?.color as string) || "#3b82f6";
      if (isParentRoot) {
        const rootChildrenCount = edgesRef.current.filter((e) => e.source === parentId).length;
        branchColor =
          MINDMEISTER_BRANCH_COLORS[rootChildrenCount % MINDMEISTER_BRANCH_COLORS.length];
      }

      const existingInDir = edgesRef.current.filter(
        (e) => e.source === parentId && e.sourceHandle === dir
      ).length;

      const OFFSETS: Record<MindMapDir, [number, number]> = {
        right: [320, 0],
        left: [-320, 0],
        top: [0, -180],
        bottom: [0, 180],
      };
      const [dx, dy] = OFFSETS[dir];
      const jitter = existingInDir * (dir === "left" || dir === "right" ? 110 : 80);

      const id = `n_${Date.now()}`;
      const newNode: Node = {
        id,
        type: "mind",
        position: {
          x: parent.position.x + dx + (dir === "left" || dir === "right" ? 0 : jitter),
          y: parent.position.y + dy + (dir === "left" || dir === "right" ? jitter : 0),
        },
        data: {
          label: "Novo Subtópico",
          parentId,
          color: branchColor,
          branchColor,
          emoji: "💡",
          fontSize: 13,
          links: [],
          checklist: [],
        },
      };

      const newEdge: Edge = {
        id: `e_${parentId}_${id}_${Date.now()}`,
        source: parentId,
        sourceHandle: dir,
        target: id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: branchColor },
        style: { stroke: branchColor, strokeWidth: 2.5 },
      };

      setNodes((ns) => {
        const updated = [...ns, newNode];
        pushHistory(updated, edgesRef.current);
        return updated;
      });
      setEdges((es) => [...es, newEdge]);

      setTimeout(() => {
        setSelectedNode(newNode);
        setShowEditor(true);
        setEditorTab("style");
      }, 50);
    },
    [pushHistory]
  );

  // ── Adicionar Irmão (MindMeister ENTER) ──
  const addSiblingNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;

      // Se for nó raiz, cria um filho
      if (node.data?.isRoot || !node.data?.parentId) {
        addChildNode(node.id, "right");
        return;
      }

      const parentId = node.data.parentId as string;
      const parent = nodesRef.current.find((n) => n.id === parentId);
      if (!parent) return;

      const branchColor: string =
        (node.data?.branchColor as string) || (node.data?.color as string) || "#3b82f6";
      const id = `n_${Date.now()}`;

      // Posiciona logo abaixo do nó atual
      const newNode: Node = {
        id,
        type: "mind",
        position: {
          x: node.position.x,
          y: node.position.y + 110,
        },
        data: {
          label: "Novo Tópico",
          parentId,
          color: branchColor,
          branchColor,
          emoji: "💡",
          fontSize: 13,
          links: [],
          checklist: [],
        },
      };

      const newEdge: Edge = {
        id: `e_${parentId}_${id}_${Date.now()}`,
        source: parentId,
        sourceHandle: "right",
        target: id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: branchColor },
        style: { stroke: branchColor, strokeWidth: 2.5 },
      };

      setNodes((ns) => {
        const updated = [...ns, newNode];
        pushHistory(updated, edgesRef.current);
        return updated;
      });
      setEdges((es) => [...es, newEdge]);

      setTimeout(() => {
        setSelectedNode(newNode);
        setShowEditor(true);
        setEditorTab("style");
      }, 50);
    },
    [addChildNode, pushHistory]
  );

  // ── Adicionar Nó Solto Central ──
  const addStandaloneNode = useCallback(() => {
    const vp = rf.getViewport();
    const cx = (-vp.x + (canvasRef.current?.clientWidth || 800) / 2) / vp.zoom;
    const cy = (-vp.y + (canvasRef.current?.clientHeight || 600) / 2) / vp.zoom;
    const id = `n_${Date.now()}`;
    const branchColor = MINDMEISTER_BRANCH_COLORS[nodes.length % MINDMEISTER_BRANCH_COLORS.length];

    const newNode: Node = {
      id,
      type: "mind",
      position: { x: cx - 90, y: cy - 35 },
      data: {
        label: "Novo Tópico",
        color: branchColor,
        branchColor,
        emoji: "💡",
        fontSize: 13,
        links: [],
        checklist: [],
      },
    };

    setNodes((ns) => {
      const u = [...ns, newNode];
      pushHistory(u, edgesRef.current);
      return u;
    });

    setTimeout(() => {
      setSelectedNode(newNode);
      setShowEditor(true);
      setEditorTab("style");
    }, 50);
  }, [pushHistory, rf, nodes.length]);

  // ── Excluir Nó e Descendentes ──
  const deleteNode = useCallback(
    (nodeId: string) => {
      const node = nodesRef.current.find((n) => n.id === nodeId);
      if (node?.data?.isRoot) {
        toast.error("O nó central não pode ser excluído.");
        return;
      }

      const toDelete = new Set<string>();
      const collect = (id: string) => {
        toDelete.add(id);
        nodesRef.current.filter((n) => n.data?.parentId === id).forEach((c) => collect(c.id));
      };
      collect(nodeId);

      setNodes((ns) => {
        const u = ns.filter((n) => !toDelete.has(n.id));
        pushHistory(u, edgesRef.current);
        return u;
      });
      setEdges((es) => es.filter((e) => !toDelete.has(e.source) && !toDelete.has(e.target)));
      setSelectedNode((prev) => (toDelete.has(prev?.id || "") ? null : prev));
      setShowEditor(false);
    },
    [pushHistory]
  );

  const editNode = useCallback((nodeId: string) => {
    const n = nodesRef.current.find((nn) => nn.id === nodeId);
    if (n) {
      setSelectedNode(n);
      setShowEditor(true);
      setEditorTab("style");
    }
  }, []);

  const updateSelectedNode = (patch: Record<string, any>) => {
    if (!selectedNode) return;
    const updated = { ...selectedNode, data: { ...selectedNode.data, ...patch } };
    setNodes((ns) => {
      const u = ns.map((n) => (n.id === selectedNode.id ? updated : n));
      pushHistory(u, edgesRef.current);
      return u;
    });
    setSelectedNode(updated);
  };

  // ── Aplicar Layout ──
  const applyLayout = (l: "radial" | "tree" | "list" | "free") => {
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

  // ── Slideshow / Apresentação ──
  const slideNodes = useMemo(() => {
    return nodes
      .filter((n) => n.data?.slideOrder != null)
      .sort((a, b) => (a.data.slideOrder as number) - (b.data.slideOrder as number));
  }, [nodes]);

  const goToSlide = (i: number) => {
    const node = slideNodes[i];
    if (!node) return;
    setSlideIndex(i);
    rf.setCenter(node.position.x + 90, node.position.y + 40, { zoom: 1.4, duration: 700 });
  };

  const toggleSlide = () => {
    if (!selectedNode) return;
    const cur = selectedNode.data?.slideOrder;
    if (cur != null) {
      updateSelectedNode({ slideOrder: undefined });
      toast("Removido da apresentação");
    } else {
      updateSelectedNode({ slideOrder: slideNodes.length });
      toast.success(`Slide ${slideNodes.length + 1} adicionado`);
    }
  };

  // ── IA Victoria ──
  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
      const res = await fetch(`${SUPABASE_URL}/functions/v1/ai-mind-map-generator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ prompt: aiPrompt, layout, maxDepth: 3, maxBranches: 5 }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error);

      const ns: Node[] = result.nodes.map((n: any, idx: number) => ({
        id: n.id,
        type: "mind",
        position: { x: Number(n.pos_x || 0), y: Number(n.pos_y || 0) },
        data: {
          label: n.label,
          emoji: n.emoji,
          color: n.color || MINDMEISTER_BRANCH_COLORS[idx % MINDMEISTER_BRANCH_COLORS.length],
          branchColor: n.color || MINDMEISTER_BRANCH_COLORS[idx % MINDMEISTER_BRANCH_COLORS.length],
          fontSize: n.parentId ? 13 : 16,
          isRoot: !n.parentId,
          links: [],
          checklist: [],
          parentId: n.parentId || undefined,
        },
      }));

      const es: Edge[] = result.edges.map((e: any) => ({
        id: e.id,
        source: e.source_id,
        target: e.target_id,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6b7280" },
        style: { stroke: "#6b7280", strokeWidth: 2.5 },
      }));

      const newTitle = result.title || aiPrompt;
      setMapTitle(newTitle);
      setNodes(ns);
      setEdges(es);
      pushHistory(ns, es);
      setShowAI(false);
      setAiPrompt("");
      toast.success(`"${newTitle}" gerado com ${ns.length} nós pela Victoria IA!`);
      setTimeout(() => rf.fitView({ padding: 0.2, duration: 800 }), 100);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar com IA");
    } finally {
      setAiLoading(false);
    }
  };

  // ── Exportações ──
  const exportPNG = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const cv = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `${mapTitleRef.current}.png`;
    a.click();
    toast.success("Imagem PNG exportada em alta resolução!");
  };

  const exportPDF = async () => {
    const el = document.querySelector(".react-flow__viewport") as HTMLElement;
    if (!el) return;
    const cv = await html2canvas(el, { backgroundColor: "#0a0a0f", scale: 2 });
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [cv.width / 2, cv.height / 2] });
    pdf.addImage(cv.toDataURL("image/png"), "PNG", 0, 0, cv.width / 2, cv.height / 2);
    pdf.save(`${mapTitleRef.current}.pdf`);
    toast.success("Documento PDF exportado!");
  };

  // ── ATALHOS DE TECLADO INTUITIVOS (MINDMEISTER CLASSIC) ──
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement).tagName;
      const isInput = activeTag === "INPUT" || activeTag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable;

      // Se estiver digitando em campo de texto, não dispara atalhos de navegação
      if (isInput) return;

      // TAB: Cria Subtópico (Filho) do nó selecionado
      if (e.key === "Tab") {
        e.preventDefault();
        if (selectedRef.current) {
          addChildNode(selectedRef.current.id, "right");
        } else if (nodesRef.current.length > 0) {
          addChildNode(nodesRef.current[0].id, "right");
        }
      }

      // ENTER: Cria Tópico Irmão (Sibling) no mesmo nível
      if (e.key === "Enter") {
        e.preventDefault();
        if (selectedRef.current) {
          addSiblingNode(selectedRef.current.id);
        }
      }

      // DELETE / BACKSPACE: Exclui nó selecionado
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current && !showEditor) {
          e.preventDefault();
          deleteNode(selectedRef.current.id);
        }
      }

      // CTRL+S: Salvar
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
      }

      // CTRL+Z: Desfazer
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      }

      // CTRL+Y / CTRL+SHIFT+Z: Refazer
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key === "z") || e.key === "y")) {
        e.preventDefault();
        redo();
      }

      // CTRL+F: Buscar
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => !v);
      }

      // ESC: Fechar painéis
      if (e.key === "Escape") {
        setSelectedNode(null);
        setShowEditor(false);
        setShowSearch(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addChildNode, addSiblingNode, deleteNode, undo, redo, showEditor]);

  // Eventos React Flow
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    []
  );

  const onConnect = useCallback(
    (conn: Connection) => {
      const sourceNode = nodesRef.current.find((n) => n.id === conn.source);
      const branchColor: string =
        (sourceNode?.data?.branchColor as string) || (sourceNode?.data?.color as string) || "#3b82f6";

      const newEdge: Edge = {
        ...conn,
        id: `e_${conn.source}_${conn.target}_${Date.now()}`,
        type: "smoothstep",
        markerEnd: { type: MarkerType.ArrowClosed, color: branchColor },
        style: { stroke: branchColor, strokeWidth: 2.5 },
      };
      setEdges((es) => {
        const u = addEdge(newEdge, es);
        pushHistory(nodesRef.current, u);
        return u;
      });
    },
    [pushHistory]
  );

  const activeTheme = THEMES.find((t) => t.id === themeId) || THEMES[0];

  return (
    <MindMapActionsContext.Provider
      value={{
        addChildNode,
        addSiblingNode,
        editNode,
        deleteNode,
        searchTerm,
      }}
    >
      <div className="relative flex flex-1 w-full h-screen flex-col bg-background overflow-hidden select-none">
        {/* ══════════ TOPBAR ELEGANTE ESTILO MINDMEISTER ══════════ */}
        <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between gap-3 px-4 py-2.5 bg-background/90 backdrop-blur-2xl border-b border-white/10 shadow-lg">
          {/* Lado Esquerdo: Identificação, Menu de Mapas e Título Editável */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setIsManagerOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition shadow-glow-sm"
              title="Abrir Central de Mapas Mentais"
            >
              <Brain className="h-4 w-4" />
              <span className="text-xs font-black uppercase tracking-wider hidden sm:block">
                Meus Mapas
              </span>
              <Folder className="h-3 w-3 opacity-60" />
            </button>

            <div className="h-4 w-px bg-white/10" />

            {/* Título Inline Editável */}
            {isEditingTitleInline ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={mapTitle}
                  onChange={(e) => setMapTitle(e.target.value)}
                  onBlur={() => setIsEditingTitleInline(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setIsEditingTitleInline(false);
                  }}
                  className="rounded-lg border border-primary bg-background/80 px-2.5 py-1 text-xs font-bold text-foreground outline-none"
                />
                <button
                  onClick={() => setIsEditingTitleInline(false)}
                  className="p-1 rounded bg-primary text-primary-foreground"
                >
                  <Check className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsEditingTitleInline(true)}
                className="flex items-center gap-2 group text-left min-w-0"
                title="Clique para renomear este mapa"
              >
                <span className="text-sm font-bold text-foreground group-hover:text-primary transition truncate max-w-[220px]">
                  {mapTitle}
                </span>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition" />
              </button>
            )}

            {/* Status do Salvamento */}
            <div className="hidden md:flex items-center gap-1 text-[10px] font-mono font-medium">
              {saveStatus === "saved" && (
                <span className="inline-flex items-center gap-1 text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <Cloud className="h-3 w-3" /> Salvo
                </span>
              )}
              {saveStatus === "saving" && (
                <span className="inline-flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </span>
              )}
              {saveStatus === "unsaved" && (
                <span className="inline-flex items-center gap-1 text-muted-foreground bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Pendente
                </span>
              )}
            </div>
          </div>

          {/* Centro: Layouts Orgânicos */}
          <div className="flex items-center gap-1 bg-white/[0.03] border border-white/10 rounded-xl p-1">
            {[
              { val: "radial", icon: Layers, label: "Radial" },
              { val: "tree", icon: GitBranch, label: "Árvore" },
              { val: "list", icon: List, label: "Lista" },
            ].map(({ val, icon: Icon, label }) => (
              <button
                key={val}
                onClick={() => applyLayout(val as any)}
                title={`Layout ${label}`}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-bold transition ${
                  layout === val
                    ? "bg-primary text-primary-foreground shadow-glow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                <Icon className="h-3 w-3" />
                <span className="hidden lg:block">{label}</span>
              </button>
            ))}
          </div>

          {/* Lado Direito: Ações Estratégicas */}
          <div className="flex items-center gap-2">
            {/* Busca */}
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 160, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <input
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Filtrar tópicos..."
                    className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary"
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <button
              onClick={() => setShowSearch((v) => !v)}
              className={`p-2 rounded-xl border text-xs transition ${
                showSearch
                  ? "bg-primary/20 border-primary text-primary"
                  : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
              }`}
              title="Pesquisar Nós (Ctrl+F)"
            >
              <Search className="h-3.5 w-3.5" />
            </button>

            {/* Botão Nó Solto */}
            <button
              onClick={addStandaloneNode}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-foreground hover:bg-white/10 transition"
              title="Adicionar Novo Tópico Solto"
            >
              <Plus className="h-3.5 w-3.5 text-primary" />
              <span className="hidden md:block">Novo Tópico</span>
            </button>

            {/* Victoria IA */}
            <button
              onClick={() => setShowAI((v) => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 text-xs font-bold text-primary hover:bg-primary/25 transition shadow-glow-sm"
              title="Gerar Estrutura com Victoria IA"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span className="hidden md:block">Victoria IA</span>
            </button>

            {/* Apresentação */}
            {slideNodes.length > 0 && (
              <button
                onClick={() => {
                  setPresentMode(true);
                  goToSlide(0);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs font-bold text-amber-400 hover:bg-amber-500/25 transition"
                title="Apresentar Mapa como Slideshow"
              >
                <Play className="h-3.5 w-3.5" />
                <span className="hidden lg:block">Apresentar</span>
              </button>
            )}

            {/* Salvar */}
            <button
              onClick={handleManualSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-bold text-emerald-400 hover:bg-emerald-500/25 transition shadow-sm"
              title="Salvar Manualmente (Ctrl+S)"
            >
              {saveStatus === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:block">Salvar</span>
            </button>

            {/* Exportar Menu */}
            <div className="relative">
              <button
                onClick={() => document.getElementById("export-dd")?.classList.toggle("hidden")}
                className="p-2 rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition"
                title="Exportar Mapa Mental"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <div
                id="export-dd"
                className="hidden absolute right-0 top-10 bg-card border border-white/10 rounded-xl overflow-hidden z-50 w-32 shadow-2xl"
              >
                <button
                  onClick={exportPNG}
                  className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-primary/20 transition flex items-center justify-between"
                >
                  <span>Imagem PNG</span>
                  <span className="text-[9px] text-muted-foreground font-mono">2x</span>
                </button>
                <button
                  onClick={exportPDF}
                  className="w-full px-3 py-2 text-xs text-left text-foreground hover:bg-primary/20 transition flex items-center justify-between border-t border-white/5"
                >
                  <span>Documento PDF</span>
                </button>
              </div>
            </div>

            {/* Ajuda / Atalhos */}
            <button
              onClick={() => setShowHelp(true)}
              className="p-2 rounded-xl border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground transition"
              title="Atalhos do Teclado"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ══════════ CANVAS REACT FLOW (Estilo MindMeister) ══════════ */}
        <div
          className="absolute inset-0 pt-12"
          ref={canvasRef}
          style={{ background: activeTheme.bg }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            connectionMode={ConnectionMode.Loose}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed, color: "#3b82f6" },
              style: { stroke: "#3b82f6", strokeWidth: 2.5 },
            }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={26}
              size={1.5}
              color={activeTheme.dots}
            />
            <MiniMap
              nodeColor={(n) => (n.data?.color as string) || "#e11d48"}
              className="!bg-card/90 !border !border-white/10 !rounded-2xl shadow-xl"
            />
            <Controls className="!bg-card/90 !border !border-white/10 !rounded-2xl shadow-xl" />

            <Panel position="bottom-left">
              <div className="flex items-center gap-2 bg-card/90 backdrop-blur border border-white/10 rounded-xl px-3 py-1.5 text-[11px] text-muted-foreground shadow-lg">
                <span className="font-mono font-bold text-foreground">{nodes.length} tópicos</span>
                <div className="w-px h-3 bg-white/10" />
                <button
                  onClick={() => rf.fitView({ padding: 0.25, duration: 600 })}
                  className="hover:text-foreground transition flex items-center gap-1"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span>Ajustar Tela</span>
                </button>
              </div>
            </Panel>
          </ReactFlow>
        </div>

        {/* ══════════ PAINEL LATERAL DE PERSONALIZAÇÃO (NÓ SELECIONADO) ══════════ */}
        <AnimatePresence>
          {showEditor && selectedNode && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="absolute left-4 top-16 z-40 w-80 bg-card/95 border border-white/15 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl"
              style={{ maxHeight: "calc(100vh - 84px)" }}
            >
              {/* Abas */}
              <div className="flex items-center border-b border-white/10 bg-white/[0.02]">
                {[
                  { key: "style", label: "🎨 Estilo" },
                  { key: "content", label: "📝 Nota" },
                  { key: "checklist", label: "☑️ Tarefas" },
                  { key: "links", label: "🔗 Links" },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setEditorTab(t.key as any)}
                    className={`flex-1 py-2.5 text-[10px] font-black uppercase tracking-wider transition border-b-2 ${
                      editorTab === t.key
                        ? "border-primary text-primary bg-primary/5"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowEditor(false)}
                  className="px-3 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar" style={{ maxHeight: "calc(100vh - 145px)" }}>
                {/* ── ABA ESTILO ── */}
                {editorTab === "style" && (
                  <>
                    {/* Emoji */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Ícone / Emoji
                      </label>
                      <input
                        value={(selectedNode.data?.emoji as string) || ""}
                        onChange={(e) => updateSelectedNode({ emoji: e.target.value })}
                        placeholder="Ex: 🎯, 🚀, 💡, 📈"
                        className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
                      />
                    </div>

                    {/* Cores da Ramificação */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Cor de Destaque da Ramificação
                      </label>
                      <div className="flex gap-2 flex-wrap">
                        {MINDMEISTER_BRANCH_COLORS.map((c) => (
                          <button
                            key={c}
                            onClick={() => updateSelectedNode({ color: c, branchColor: c })}
                            className={`h-7 w-7 rounded-xl border-2 transition-all hover:scale-110 ${
                              selectedNode.data?.color === c
                                ? "border-white scale-110 shadow-lg"
                                : "border-transparent"
                            }`}
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Status da Tarefa */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        Status de Execução
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          { key: "todo", label: "A Fazer", color: "#6b7280" },
                          { key: "inprogress", label: "Em Progresso", color: "#f59e0b" },
                          { key: "done", label: "Concluído", color: "#10b981" },
                          { key: "blocked", label: "Bloqueado", color: "#ef4444" },
                        ].map((st) => (
                          <button
                            key={st.key}
                            onClick={() =>
                              updateSelectedNode({
                                status: selectedNode.data?.status === st.key ? undefined : st.key,
                              })
                            }
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition ${
                              selectedNode.data?.status === st.key
                                ? "bg-white/15 border-white text-white"
                                : "border-white/5 text-muted-foreground hover:bg-white/5"
                            }`}
                          >
                            <span className="h-2 w-2 rounded-full" style={{ background: st.color }} />
                            <span>{st.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Slideshow */}
                    <button
                      onClick={toggleSlide}
                      className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2 text-xs font-bold transition ${
                        selectedNode.data?.slideOrder != null
                          ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                          : "bg-white/5 border-white/10 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Presentation className="h-3.5 w-3.5" />
                      <span>
                        {selectedNode.data?.slideOrder != null
                          ? `Remover do Slide ${(selectedNode.data?.slideOrder as number) + 1}`
                          : "Adicionar aos Slides da Apresentação"}
                      </span>
                    </button>

                    {/* Excluir Nó */}
                    <button
                      onClick={() => deleteNode(selectedNode.id)}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-destructive/10 border border-destructive/20 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 transition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Excluir Este Nó</span>
                    </button>
                  </>
                )}

                {/* ── ABA CONTEÚDO / NOTAS ── */}
                {editorTab === "content" && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Anotação Estratégica
                    </label>
                    <textarea
                      value={(selectedNode.data?.note as string) || ""}
                      onChange={(e) => updateSelectedNode({ note: e.target.value })}
                      placeholder="Descreva detalhes, orientações operacionais ou diretrizes desta etapa..."
                      rows={8}
                      className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-primary resize-none font-sans leading-relaxed"
                    />
                  </div>
                )}

                {/* ── ABA CHECKLIST / SUB-TAREFAS ── */}
                {editorTab === "checklist" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Tarefas & Checklist Interno
                    </label>

                    <div className="space-y-1.5">
                      {((selectedNode.data?.checklist || []) as any[]).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/5"
                        >
                          <span
                            className={`text-xs text-foreground ${
                              item.done ? "line-through text-muted-foreground" : ""
                            }`}
                          >
                            {item.text}
                          </span>
                          <button
                            onClick={() => {
                              const list = ((selectedNode.data?.checklist || []) as any[]).filter(
                                (_, i) => i !== idx
                              );
                              updateSelectedNode({ checklist: list });
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <input
                        value={newChecklistText}
                        onChange={(e) => setNewChecklistText(e.target.value)}
                        placeholder="Nova sub-tarefa..."
                        className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-1.5 text-xs text-foreground outline-none focus:border-primary"
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && newChecklistText.trim()) {
                            const list = [
                              ...((selectedNode.data?.checklist || []) as any[]),
                              { text: newChecklistText.trim(), done: false },
                            ];
                            updateSelectedNode({ checklist: list });
                            setNewChecklistText("");
                          }
                        }}
                      />
                      <button
                        onClick={() => {
                          if (!newChecklistText.trim()) return;
                          const list = [
                            ...((selectedNode.data?.checklist || []) as any[]),
                            { text: newChecklistText.trim(), done: false },
                          ];
                          updateSelectedNode({ checklist: list });
                          setNewChecklistText("");
                        }}
                        className="p-2 rounded-xl bg-primary text-primary-foreground font-bold"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── ABA LINKS ── */}
                {editorTab === "links" && (
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Links Externos
                    </label>

                    <div className="space-y-2">
                      {((selectedNode.data?.links || []) as any[]).map((lk, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-white/5 border border-white/10 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="font-bold text-foreground truncate">{lk.label}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{lk.url}</p>
                          </div>
                          <button
                            onClick={() => {
                              const links = ((selectedNode.data?.links || []) as any[]).filter(
                                (_, i) => i !== idx
                              );
                              updateSelectedNode({ links });
                            }}
                            className="text-muted-foreground hover:text-destructive p-1"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2 border border-dashed border-white/15 p-3 rounded-xl">
                      <input
                        value={newLinkLabel}
                        onChange={(e) => setNewLinkLabel(e.target.value)}
                        placeholder="Título do link (ex: Campanha no Meta)"
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs text-foreground outline-none"
                      />
                      <input
                        value={newLinkUrl}
                        onChange={(e) => setNewLinkUrl(e.target.value)}
                        placeholder="https://..."
                        className="w-full rounded-lg bg-white/5 border border-white/10 px-2.5 py-1.5 text-xs text-foreground outline-none font-mono"
                      />
                      <button
                        onClick={() => {
                          if (!newLinkUrl.trim()) return;
                          const links = [
                            ...((selectedNode.data?.links || []) as any[]),
                            { label: newLinkLabel || newLinkUrl, url: newLinkUrl },
                          ];
                          updateSelectedNode({ links });
                          setNewLinkLabel("");
                          setNewLinkUrl("");
                        }}
                        className="w-full rounded-lg bg-primary/20 border border-primary/30 py-1.5 text-xs font-bold text-primary hover:bg-primary/30 transition"
                      >
                        + Adicionar Link
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════ MODAL DE GESTÃO COMPLETA DE MAPAS ══════════ */}
        <MindMapManagerModal
          isOpen={isManagerOpen}
          onClose={() => setIsManagerOpen(false)}
          maps={maps}
          activeMapId={activeMapId}
          onSelectMap={handleSelectMap}
          onCreateNew={handleCreateNewMap}
          onRefreshList={loadMapsList}
        />

        {/* ══════════ MODAL DE AJUDA & ATALHOS MINDMEISTER ══════════ */}
        <AnimatePresence>
          {showHelp && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
              onClick={() => setShowHelp(false)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 10 }}
                className="glass-panel w-full max-w-md p-6 space-y-4 shadow-2xl border border-white/15"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <Brain className="h-5 w-5" />
                    <span className="text-sm uppercase tracking-wider">Atalhos MindMeister</span>
                  </div>
                  <button onClick={() => setShowHelp(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { key: "Tab", desc: "Cria um subtópico (filho) do nó selecionado" },
                    { key: "Enter", desc: "Cria um tópico irmão no mesmo nível" },
                    { key: "Delete / Backspace", desc: "Exclui o nó selecionado e seus descendentes" },
                    { key: "Duplo Clique", desc: "Edita o texto do tópico diretamente no canvas" },
                    { key: "Ctrl + S", desc: "Salva o mapa imediatamente na nuvem" },
                    { key: "Ctrl + Z", desc: "Desfazer última alteração" },
                    { key: "Ctrl + Y", desc: "Refazer alteração" },
                    { key: "Ctrl + F", desc: "Buscar e filtrar tópicos no mapa" },
                    { key: "Esc", desc: "Desmarcar nó e fechar painéis" },
                  ].map((it, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02] border border-white/5">
                      <span className="text-muted-foreground">{it.desc}</span>
                      <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/15 font-mono text-[10px] font-bold text-foreground">
                        {it.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════ SIDEBAR VICTORIA IA ══════════ */}
        <AnimatePresence>
          {showAI && (
            <motion.div
              initial={{ x: 340 }}
              animate={{ x: 0 }}
              exit={{ x: 340 }}
              className="absolute right-0 top-12 bottom-0 z-40 w-80 bg-card/95 border-l border-white/15 backdrop-blur-xl flex flex-col shadow-2xl"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2 text-primary font-bold">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm">Victoria IA · Gerador</span>
                </div>
                <button onClick={() => setShowAI(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Descreva o seu objetivo estratégico, produto ou campanha para a Victoria estruturar um mapa mental completo.
                </p>

                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ex: Campanha de lançamento de consórcio e financiamento automotivo para o público do Rio de Janeiro..."
                  rows={6}
                  className="w-full rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-foreground placeholder:text-muted-foreground/50 outline-none focus:border-primary resize-none leading-relaxed"
                />

                <button
                  onClick={generateWithAI}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-primary-foreground hover:shadow-glow transition disabled:opacity-50"
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Gerando Mapa...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Gerar Estrutura
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════ MODO APRESENTAÇÃO (SLIDESHOW NÓ POR NÓ) ══════════ */}
        <AnimatePresence>
          {presentMode && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              className="absolute inset-x-0 bottom-4 z-50 flex justify-center px-4"
            >
              <div className="flex items-center gap-4 bg-card/95 backdrop-blur-2xl border border-white/15 px-6 py-3 rounded-2xl shadow-2xl">
                <button
                  onClick={() => setPresentMode(false)}
                  className="rounded-xl bg-destructive/15 border border-destructive/30 px-3 py-1.5 text-xs font-bold text-destructive hover:bg-destructive/25 transition"
                >
                  <Square className="h-3 w-3 inline mr-1" /> Encerrar
                </button>

                <button
                  onClick={() => goToSlide(Math.max(0, slideIndex - 1))}
                  disabled={slideIndex === 0}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <div className="flex items-center gap-1.5">
                  {slideNodes.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => goToSlide(i)}
                      className={`h-2 rounded-full transition-all ${
                        i === slideIndex
                          ? "w-6 bg-primary"
                          : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60"
                      }`}
                    />
                  ))}
                </div>

                <button
                  onClick={() => goToSlide(Math.min(slideNodes.length - 1, slideIndex + 1))}
                  disabled={slideIndex >= slideNodes.length - 1}
                  className="p-2 rounded-xl bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground disabled:opacity-30 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <span className="text-xs text-muted-foreground font-mono">
                  {slideIndex + 1} / {slideNodes.length}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MindMapActionsContext.Provider>
  );
}
