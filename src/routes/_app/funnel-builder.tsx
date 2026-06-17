import { useCallback, useRef, useMemo, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
  useReactFlow
} from "@xyflow/react";
import '@xyflow/react/dist/style.css';

import { useFunnelState, type FunnelNode } from "@/hooks/useFunnelState";
import { FunnelStageNode } from "@/components/funnel/FunnelStageNode";
import { FunnelAiNode } from "@/components/funnel/FunnelAiNode";
import { FunnelCheckoutNode } from "@/components/funnel/FunnelCheckoutNode";
import { FunnelEdge } from "@/components/funnel/FunnelEdge";
import { ContextMenuPortal } from "@/components/funnel/ContextMenuPortal";
import { OutlinePanel } from "@/components/funnel/OutlinePanel";
import { NodeDetailDrawer } from "@/components/funnel/NodeDetailDrawer";
import { useFunnelAutoSave } from "@/hooks/useFunnelAutoSave";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Save, Plus, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Registrar tipos customizados
const nodeTypes = {
  stage: FunnelStageNode,
  ai_agent: FunnelAiNode,
  checkout: FunnelCheckoutNode,
};

const edgeTypes = {
  custom: FunnelEdge,
};

export const Route = createFileRoute("/_app/funnel-builder")({
  component: () => (
    <ReactFlowProvider>
      <FunnelBuilder />
    </ReactFlowProvider>
  )
});

const initialNodes: FunnelNode[] = [
  {
    id: "node-1",
    type: "stage",
    position: { x: 250, y: 100 },
    data: { label: "Meta Ads (Inbound)", color: "bg-blue-500" },
  },
  {
    id: "node-2",
    type: "ai_agent",
    position: { x: 250, y: 300 },
    data: { label: "Victoria RAG Triage" },
  },
  {
    id: "node-3",
    type: "checkout",
    position: { x: 250, y: 500 },
    data: { label: "Laudo Cautelar Upsell" },
  }
];

const initialEdges = [
  { id: "e1-2", source: "node-1", target: "node-2", type: "custom", data: { friction: 0.1, label: "Clicou no Anúncio" } },
  { id: "e2-3", source: "node-2", target: "node-3", type: "custom", animated: true, data: { friction: 0.8, label: "Agendou Visita" } },
];

function FunnelBuilder() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setNodes,
    setEdges,
    contextMenu,
    setContextMenu,
    updateNodeLabel,
    setSelectedNodeId
  } = useFunnelState();

  const { isSaving, lastSaved } = useFunnelAutoSave("funnel-draft-id");

  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();

  // Inicializar com dados mock
  useEffect(() => {
    if (nodes.length === 0) {
      setNodes(initialNodes);
      setEdges(initialEdges);
    }
  }, []);

  const onNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: any) => {
      event.preventDefault();

      if (!reactFlowWrapper.current) return;

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      
      // Calculate position relative to viewport, but ensure it doesn't overflow
      const x = event.clientX;
      const y = event.clientY;

      setContextMenu({
        x,
        y,
        nodeId: node.id,
        edgeId: null,
      });
    },
    [setContextMenu]
  );

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, [setContextMenu]);

  const handleAddNode = useCallback(() => {
    const id = `node-${Date.now()}`;
    const newNode: FunnelNode = {
      id,
      type: "stage",
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { label: "Nova Etapa", color: "bg-indigo-500" },
    };
    setNodes([...nodes, newNode]);
  }, [nodes, setNodes]);

  const handleDeleteNode = useCallback((id: string) => {
    setNodes(nodes.filter(n => n.id !== id));
    setEdges(edges.filter(e => e.source !== id && e.target !== id));
  }, [nodes, edges, setNodes, setEdges]);

  const handleChangeColor = useCallback((id: string, color: string) => {
    setNodes(nodes.map(n => {
      if (n.id === id) {
        return { ...n, data: { ...n.data, color } };
      }
      return n;
    }));
  }, [nodes, setNodes]);

  // Inject the context menu click handler into node data so custom nodes can trigger it
  const nodesWithContextMenu = useMemo(() => {
    return nodes.map(node => ({
      ...node,
      data: {
        ...node.data,
        onContextMenuClick: onNodeContextMenu
      }
    }));
  }, [nodes, onNodeContextMenu]);

  return (
    <div className="flex h-screen w-full flex-col bg-[#030711]">
      {/* Top Toolbar */}
      <header className="flex h-14 items-center justify-between border-b border-white/5 bg-background/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link to="/organizador" className="p-2 hover:bg-white/5 rounded-full transition-colors text-muted-foreground hover:text-white">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="h-6 w-px bg-white/10" />
          <div>
            <h1 className="text-sm font-bold text-white">Funil Automotivo: Lançamento Corolla</h1>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isSaving ? (
                <>
                  <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">Salvando alterações...</p>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                  <p className="text-[10px] text-emerald-500/80 uppercase tracking-wider font-mono">
                    {lastSaved 
                      ? `Salvo ${formatDistanceToNow(lastSaved, { addSuffix: true, locale: ptBR })}` 
                      : "Sincronizado na Nuvem"}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleAddNode}
            className="flex items-center gap-2 bg-primary/10 text-primary hover:bg-primary/20 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-primary/20"
          >
            <Plus className="w-3.5 h-3.5" />
            Adicionar Nó
          </button>
          <button className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors border border-white/5">
            <Save className="w-3.5 h-3.5 text-muted-foreground" />
            Salvar Snapshot
          </button>
        </div>
      </header>

      {/* Canvas Area */}
      <div className="flex flex-1 overflow-hidden">
        <div className="relative flex-1" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodesWithContextMenu}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeContextMenu={onNodeContextMenu}
            onPaneClick={onPaneClick}
            fitView
            className="bg-dot-pattern"
            proOptions={{ hideAttribution: true }} // React flow attribution
          >
            <Background {...({ color: "#ffffff", variant: BackgroundVariant.Dots, gap: 24, size: 1, opacity: 0.05 } as any)} />
            <Controls 
              position="bottom-left" 
              className="bg-background/80 backdrop-blur-md border-white/10 rounded-xl shadow-2xl overflow-hidden" 
            />
            <MiniMap 
              position="bottom-right"
              nodeColor={(n: any) => {
                if (n.type === 'ai_agent') return '#f59e0b';
                if (n.type === 'checkout') return '#10b981';
                return '#6366f1';
              }}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-background/80 backdrop-blur-md border-white/10 rounded-xl overflow-hidden shadow-2xl"
            />
          </ReactFlow>

          {/* Portal Context Menu */}
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

        {/* Outline Mode Panel */}
        <OutlinePanel />
      </div>

      {/* Detail Drawer (TipTap Editor) */}
      <NodeDetailDrawer />
    </div>
  );
}
