import { useCallback, useRef, useMemo, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  addEdge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { motion, AnimatePresence } from "framer-motion";

import { useFunnelState, type FunnelNode } from "@/hooks/useFunnelState";
import { FunnelStageNode } from "@/components/funnel/FunnelStageNode";
import { FunnelAiNode } from "@/components/funnel/FunnelAiNode";
import { FunnelCheckoutNode } from "@/components/funnel/FunnelCheckoutNode";
import { FunnelEdge } from "@/components/funnel/FunnelEdge";
import { ContextMenuPortal } from "@/components/funnel/ContextMenuPortal";
import { NodeDetailDrawer } from "@/components/funnel/NodeDetailDrawer";
import { useFunnelAutoSave } from "@/hooks/useFunnelAutoSave";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useTheme } from "@/routes/__root";

import {
  Loader2, CheckCircle2, List,
  Layout, Megaphone, Globe, MessageCircle, ShoppingCart,
  Bot, Target, ChevronLeft, HelpCircle, X, MousePointerClick,
  MoveHorizontal, GitBranch, Pencil, ChevronRight
} from "lucide-react";
import { Link } from "@tanstack/react-router";

const nodeTypes = {
  stage: FunnelStageNode,
  ai_agent: FunnelAiNode,
  checkout: FunnelCheckoutNode,
};

const edgeTypes = { custom: FunnelEdge };

export const Route = createFileRoute("/_app/funnel-builder")({
  component: () => (
    <ReactFlowProvider>
      <FunnelBuilder />
    </ReactFlowProvider>
  ),
});

// Paleta de tipos de nó — exibida na sidebar esquerda
const NODE_PALETTE = [
  {
    kind: "Anúncio",
    type: "stage",
    icon: Megaphone,
    color: "#3b82f6",
    description: "Meta Ads, Google, TikTok...",
  },
  {
    kind: "Landing Page",
    type: "stage",
    icon: Globe,
    color: "#8b5cf6",
    description: "Página de destino da campanha",
  },
  {
    kind: "WhatsApp",
    type: "stage",
    icon: MessageCircle,
    color: "#10b981",
    description: "Contato via WhatsApp ou grupo",
  },
  {
    kind: "Checkout",
    type: "checkout",
    icon: ShoppingCart,
    color: "#f59e0b",
    description: "Página de pagamento ou oferta",
  },
  {
    kind: "Agente IA",
    type: "ai_agent",
    icon: Bot,
    color: "#a855f7",
    description: "Triagem e qualificação automática",
  },
  {
    kind: "Captura de Lead",
    type: "stage",
    icon: Target,
    color: "#f97316",
    description: "Formulário, quiz ou captação",
  },
];

const GUIDE_STEPS = [
  {
    icon: MousePointerClick,
    title: "Adicione uma etapa",
    desc: 'Clique em qualquer bloco da paleta à esquerda para adicionar ao mapa.',
  },
  {
    icon: MoveHorizontal,
    title: "Conecte as etapas",
    desc: "Arraste a bolinha inferior de um bloco até a bolinha superior de outro para criar uma seta.",
  },
  {
    icon: Pencil,
    title: "Edite o conteúdo",
    desc: "Dê duplo-clique em qualquer bloco para abrir o painel de edição completo.",
  },
  {
    icon: GitBranch,
    title: "Visualize o funil",
    desc: 'Use "Etapas" para ver a lista ordenada. O mapa se salva automaticamente.',
  },
];

const initialNodes: FunnelNode[] = [
  {
    id: "node-1",
    type: "stage",
    position: { x: 160, y: 160 },
    data: { label: "Meta Ads — Corolla", nodeKind: "Anúncio" },
  },
  {
    id: "node-2",
    type: "stage",
    position: { x: 460, y: 160 },
    data: { label: "Landing Page de Oferta", nodeKind: "Landing Page" },
  },
  {
    id: "node-3",
    type: "ai_agent",
    position: { x: 460, y: 380 },
    data: { label: "Triagem WhatsApp (Victoria RAG)" },
  },
  {
    id: "node-4",
    type: "checkout",
    position: { x: 760, y: 260 },
    data: { label: "Laudo Cautelar — Upsell" },
  },
];

const initialEdges = [
  { id: "e1-2", source: "node-1", target: "node-2", type: "custom", data: { label: "Clicou no Anúncio", friction: 0.1 } },
  { id: "e2-3", source: "node-2", target: "node-3", type: "custom", animated: true, data: { label: "Preencheu Form", friction: 0.35 } },
  { id: "e3-4", source: "node-3", target: "node-4", type: "custom", animated: true, data: { label: "Agendou Visita", friction: 0.8 } },
];

function FunnelBuilder() {
  const {
    nodes, edges,
    onNodesChange, onEdgesChange, onConnect,
    setNodes, setEdges,
    contextMenu, setContextMenu,
    setSelectedNodeId, selectedNodeId,
    isOutlineMode, toggleOutlineMode,
  } = useFunnelState();

  const { isSaving, lastSaved } = useFunnelAutoSave("funnel-draft-id");
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { fitView } = useReactFlow();
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (nodes.length === 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
      setTimeout(() => fitView({ padding: 0.2 }), 100);
    }
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();
      setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id, edgeId: null });
    },
    [setContextMenu]
  );

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleAddNode = useCallback((kind: string, type: string) => {
    const id = `node-${Date.now()}`;
    const newNode: FunnelNode = {
      id,
      type,
      position: {
        x: 180 + Math.random() * 320,
        y: 160 + Math.random() * 220,
      },
      data: { label: kind, nodeKind: kind },
    };
    setNodes([...nodes, newNode]);
  }, [nodes, setNodes]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(nodes.filter((n) => n.id !== id));
    setEdges(edges.filter((e) => e.source !== id && e.target !== id));
  }, [nodes, edges, setNodes, setEdges]);

  const handleChangeColor = useCallback((id: string, color: string) => {
    setNodes(nodes.map((n) => n.id === id ? { ...n, data: { ...n.data, color } } : n));
  }, [nodes, setNodes]);

  const nodesWithHandlers = useMemo(() =>
    nodes.map((node) => ({
      ...node,
      data: { ...node.data, onContextMenuClick: onNodeContextMenu },
    })),
    [nodes, onNodeContextMenu]
  );

  const canvasBg = isDark ? "#0a0a12" : "#f0f0f7";
  const dotColor = isDark ? "#6366f1" : "#6366f1";

  return (
    <div className="flex h-screen w-full" style={{ background: canvasBg }}>

      {/* ── LEFT PALETTE SIDEBAR ── */}
      <aside className="flex-shrink-0 w-[200px] border-r border-border bg-background/95 backdrop-blur-md flex flex-col z-10 shadow-md">
        {/* Sidebar Header */}
        <div className="px-3 pt-4 pb-3 border-b border-border">
          <Link
            to="/funis"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Meus Funis
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0">
              <GitBranch className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-black leading-none truncate">Mapa Mental</h1>
              <p className="text-[9px] text-muted-foreground mt-0.5 truncate">Funil: Lançamento Corolla</p>
            </div>
          </div>
        </div>

        {/* Palette Label */}
        <div className="px-3 pt-3 pb-1.5">
          <p className="text-[9px] font-black uppercase tracking-[0.15em] text-muted-foreground">
            Adicionar Etapa
          </p>
          <p className="text-[9px] text-muted-foreground/60 mt-0.5">Clique para adicionar ao mapa</p>
        </div>

        {/* Node type buttons */}
        <div className="flex-1 overflow-y-auto scrollbar-none px-2 pb-2 space-y-1">
          {NODE_PALETTE.map(({ kind, type, icon: Icon, color, description }) => (
            <button
              key={kind}
              onClick={() => handleAddNode(kind, type)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all border border-transparent hover:border-border hover:bg-muted/60 active:scale-[0.98] group"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110"
                style={{ background: `${color}18` }}
              >
                <Icon className="w-4 h-4" style={{ color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold text-foreground leading-none">{kind}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">{description}</p>
              </div>
            </button>
          ))}
        </div>

        {/* Save status + Guide */}
        <div className="border-t border-border p-3 space-y-2">
          {/* Save status */}
          <div className="flex items-center gap-1.5">
            {isSaving ? (
              <>
                <Loader2 className="w-2.5 h-2.5 text-muted-foreground animate-spin flex-shrink-0" />
                <span className="text-[9px] text-muted-foreground font-mono">Salvando...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-2.5 h-2.5 text-emerald-500 flex-shrink-0" />
                <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-mono truncate">
                  {lastSaved ? `Salvo ${formatDistanceToNow(lastSaved, { addSuffix: true, locale: ptBR })}` : "Sincronizado"}
                </span>
              </>
            )}
          </div>

          {/* Guide toggle */}
          <button
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <HelpCircle className="w-3 h-3 flex-shrink-0" />
            Como usar o Mapa Mental
            <ChevronRight className={`w-3 h-3 ml-auto transition-transform ${showGuide ? "rotate-90" : ""}`} />
          </button>
        </div>
      </aside>

      {/* ── MAIN CANVAS AREA ── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Top toolbar (slim) */}
        <header className="flex h-11 items-center justify-between px-4 border-b bg-background/90 backdrop-blur-md border-border/60 z-10 flex-shrink-0">
          <div className="flex items-center gap-2">
            {/* Outline Mode toggle */}
            <button
              onClick={toggleOutlineMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                isOutlineMode
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              <List className="w-3 h-3" />
              Etapas
            </button>
          </div>

          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
            <span className="hidden sm:inline">Duplo-clique para editar</span>
            <span className="hidden sm:inline">·</span>
            <span className="hidden sm:inline">Arraste para conectar</span>
          </div>
        </header>

        {/* Canvas + Outline panel */}
        <div className="flex flex-1 overflow-hidden relative">

          {/* Outline side panel (collapsible) */}
          <AnimatePresence>
            {isOutlineMode && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 240, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="flex-shrink-0 border-r border-border overflow-hidden bg-background/90 backdrop-blur-sm"
              >
                <div className="w-[240px] h-full flex flex-col p-3">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground px-1 mb-3">
                    Etapas do Funil
                  </p>
                  <div className="space-y-1 overflow-y-auto flex-1 scrollbar-none">
                    {nodes.map((node, i) => (
                      <button
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`w-full flex items-center gap-2.5 p-2.5 rounded-xl text-left transition-all border ${
                          selectedNodeId === node.id
                            ? "bg-primary/10 border-primary/30 text-foreground"
                            : "border-transparent hover:bg-muted hover:border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[9px] font-black text-muted-foreground">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate">{(node.data as any).label}</p>
                          <p className="text-[9px] opacity-60 capitalize">{node.type?.replace("_", " ")}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* React Flow */}
          <div className="flex-1 relative" ref={reactFlowWrapper}>
            {/* Empty state */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 pointer-events-none">
                <div className="text-center max-w-xs">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                    <Layout className="w-7 h-7 text-primary/60" />
                  </div>
                  <p className="text-base font-black text-foreground/70">Mapa vazio</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clique em qualquer etapa na paleta à esquerda para começar a montar seu funil.
                  </p>
                </div>
              </div>
            )}

            <ReactFlow
              nodes={nodesWithHandlers}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={onPaneClick}
              onNodeDoubleClick={(_, node) => setSelectedNodeId(node.id)}
              fitView
              proOptions={{ hideAttribution: true }}
              style={{ background: canvasBg }}
            >
              <Background
                {...({
                  color: dotColor,
                  variant: BackgroundVariant.Dots,
                  gap: 24,
                  size: 1,
                  opacity: isDark ? 0.07 : 0.12,
                } as any)}
              />
              <Controls
                position="bottom-left"
                className="!bg-background/90 !backdrop-blur-md !border !border-border !rounded-xl !shadow-lg !overflow-hidden"
              />
              <MiniMap
                position="bottom-right"
                nodeColor={(n: any) => {
                  if (n.type === "ai_agent") return "#a855f7";
                  if (n.type === "checkout") return "#f59e0b";
                  return "#6366f1";
                }}
                maskColor={isDark ? "rgba(0,0,0,0.65)" : "rgba(240,240,247,0.65)"}
                className="!bg-background/90 !backdrop-blur-md !border !border-border !rounded-xl !overflow-hidden !shadow-lg"
              />
            </ReactFlow>

            {/* Context Menu */}
            {contextMenu && (
              <ContextMenuPortal
                x={contextMenu.x}
                y={contextMenu.y}
                nodeId={contextMenu.nodeId}
                onClose={() => setContextMenu(null)}
                onDelete={handleDeleteNode}
                onChangeColor={handleChangeColor}
                onEdit={(id) => setSelectedNodeId(id)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── GUIDE PANEL (floating overlay) ── */}
      <AnimatePresence>
        {showGuide && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowGuide(false)} />
            <motion.div
              initial={{ opacity: 0, x: -12, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -12, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="fixed left-[212px] bottom-16 z-50 w-72 rounded-2xl border border-border bg-background/98 backdrop-blur-xl shadow-2xl p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black uppercase tracking-wider text-foreground">Como usar o Mapa Mental</p>
                <button onClick={() => setShowGuide(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-3">
                {GUIDE_STEPS.map(({ icon: Icon, title, desc }, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
                      <Icon className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground leading-snug">{title}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Node Detail Drawer */}
      <NodeDetailDrawer />
    </div>
  );
}
