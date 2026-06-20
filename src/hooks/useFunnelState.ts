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
  addNodeAfter: (sourceId: string, nodeKind?: string) => void;
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

  addNodeAfter: (sourceId, nodeKind = "Anúncio") => {
    const { nodes, edges } = get();
    const source = nodes.find(n => n.id === sourceId);
    if (!source) return;
    const existingChildren = nodes.filter(n =>
      edges.some(e => e.source === sourceId && e.target === n.id)
    );
    const id = `n_${Date.now()}`;
    const newNode: FunnelNode = {
      id, type: "stage",
      position: { x: source.position.x + existingChildren.length * 280, y: source.position.y + 180 },
      data: { label: "Nova Etapa", nodeKind },
    };
    const newEdge: Edge = {
      id: `e_${sourceId}_${id}`,
      source: sourceId, target: id,
      type: "smoothstep",
    };
    set({ nodes: [...nodes, newNode], edges: [...edges, newEdge] });
  },
}));
