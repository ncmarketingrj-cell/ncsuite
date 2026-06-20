import { create } from 'zustand';
import {
  Node,
  Edge,
  Connection,
  EdgeChange,
  NodeChange,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
} from '@xyflow/react';

// Custom types for Funnel Node and Edge data
export type FunnelNodeData = {
  label: string;
  payload?: any;
  [key: string]: any;
};

export type FunnelNode = Node<FunnelNodeData>;

interface ContextMenuState {
  x: number;
  y: number;
  nodeId: string | null;
  edgeId: string | null;
}

interface FunnelState {
  nodes: FunnelNode[];
  edges: Edge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  isOutlineMode: boolean;
  contextMenu: ContextMenuState | null;

  // React Flow handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Custom Actions
  setNodes: (nodes: FunnelNode[]) => void;
  setEdges: (edges: Edge[]) => void;
  updateNodePayload: (id: string, payload: any) => void;
  updateNodeLabel: (id: string, label: string) => void;
  setSelectedNodeId: (id: string | null) => void;
  setHoveredNodeId: (id: string | null) => void;
  toggleOutlineMode: () => void;
  setContextMenu: (menu: ContextMenuState | null) => void;
  addNodeAfter: (sourceId: string, dir?: "top"|"bottom"|"left"|"right", nodeKind?: string) => void;
  deleteNodeById: (nodeId: string) => void;
}

export const useFunnelState = create<FunnelState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  hoveredNodeId: null,
  isOutlineMode: false,
  contextMenu: null,

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes) as FunnelNode[],
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },

  setNodes: (nodes) => {
    set({ nodes });
  },

  setEdges: (edges) => {
    set({ edges });
  },

  updateNodePayload: (id, payload) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, payload: { ...node.data.payload, ...payload } },
          };
        }
        return node;
      }),
    });
  },

  updateNodeLabel: (id, label) => {
    set({
      nodes: get().nodes.map((node) => {
        if (node.id === id) {
          return {
            ...node,
            data: { ...node.data, label },
          };
        }
        return node;
      }),
    });
  },

  setSelectedNodeId: (id) => {
    set({ selectedNodeId: id });
  },

  setHoveredNodeId: (id) => {
    set({ hoveredNodeId: id });
  },

  toggleOutlineMode: () => {
    set((state) => ({ isOutlineMode: !state.isOutlineMode }));
  },

  setContextMenu: (menu) => {
    set({ contextMenu: menu });
  },

  addNodeAfter: (sourceId, dir = "bottom", nodeKind = "Anúncio") => {
    const { nodes, edges } = get();
    const source = nodes.find(n => n.id === sourceId);
    if (!source) return;

    const existingInDir = edges.filter(e => e.source === sourceId && e.sourceHandle === dir).length;
    const OFFSETS: Record<string, [number, number]> = {
      right:  [300,   0],
      left:   [-300,  0],
      top:    [0,   -200],
      bottom: [0,    200],
    };
    const [dx, dy] = OFFSETS[dir] || [0, 200];
    const jitter = existingInDir * (dir === "left" || dir === "right" ? 130 : 80);
    const OPPOSITE: Record<string, string> = { right: "left", left: "right", top: "bottom", bottom: "top" };

    const id = `n_${Date.now()}`;
    const newNode: FunnelNode = {
      id, type: "stage",
      position: {
        x: source.position.x + dx + (dir === "left" || dir === "right" ? 0 : jitter),
        y: source.position.y + dy + (dir === "left" || dir === "right" ? jitter : 0),
      },
      data: { label: "Nova Etapa", nodeKind },
    };
    const newEdge: Edge = {
      id: `e_${sourceId}_${id}_${Date.now()}`,
      source: sourceId,
      sourceHandle: dir,
      target: id,
      targetHandle: `t-${OPPOSITE[dir]}`,
      type: "smoothstep",
    };
    set({ nodes: [...nodes, newNode], edges: [...edges, newEdge] });
  },

  deleteNodeById: (nodeId) => {
    const { nodes, edges } = get();
    // Remove o nó e todos os seus filhos diretos via arestas
    const toDelete = new Set<string>();
    const collect = (id: string) => {
      toDelete.add(id);
      edges.filter(e => e.source === id).forEach(e => collect(e.target));
    };
    collect(nodeId);
    set({
      nodes: nodes.filter(n => !toDelete.has(n.id)),
      edges: edges.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target)),
      selectedNodeId: null,
    });
  },
}));
