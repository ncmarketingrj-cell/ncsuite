import { useMemo } from "react";
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useFunnelState, type FunnelNode } from "@/hooks/useFunnelState";
import { GripVertical, FileText, Bot, CreditCard } from "lucide-react";

// Sortable Item Component
const SortableNodeItem = ({ node }: { node: FunnelNode }) => {
  const { hoveredNodeId, setHoveredNodeId, setSelectedNodeId } = useFunnelState();
  const isHovered = hoveredNodeId === node.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon = node.type === "ai_agent" ? Bot : node.type === "checkout" ? CreditCard : FileText;
  const iconColor = node.type === "ai_agent" ? "text-amber-500 bg-amber-500/10" : 
                    node.type === "checkout" ? "text-emerald-500 bg-emerald-500/10" : 
                    "text-indigo-500 bg-indigo-500/10";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-3 p-2 rounded-xl border transition-all ${
        isDragging ? "bg-white/10 border-primary/50 shadow-2xl z-50" : 
        isHovered ? "bg-white/5 border-white/20" : "bg-transparent border-transparent hover:bg-white/[0.02]"
      }`}
      onMouseEnter={() => setHoveredNodeId(node.id)}
      onMouseLeave={() => setHoveredNodeId(null)}
      onClick={() => setSelectedNodeId(node.id)}
    >
      <button 
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-white/10 rounded text-muted-foreground hover:text-white transition-colors"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${iconColor}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{node.data.label as string}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{node.type}</p>
      </div>
    </div>
  );
};

export const OutlinePanel = () => {
  const { nodes, setNodes, edges, setEdges } = useFunnelState();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Derive order from nodes array. 
  // In a real DAG, we would topological sort based on edges, but for simplicity of the UI list, 
  // we let the user reorder the array.
  const nodeIds = useMemo(() => nodes.map(n => n.id), [nodes]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = nodes.findIndex((n) => n.id === active.id);
      const newIndex = nodes.findIndex((n) => n.id === over.id);

      const newOrder = arrayMove(nodes, oldIndex, newIndex);
      
      // Update nodes order
      setNodes(newOrder);

      // Advanced logic: if we want Outline Mode to actually change parent-child relationships,
      // we would mutate `edges` here. For this implementation, dragging just reorganizes the Outline View.
      // E.g., re-evaluating auto-layout logic (dagre) would happen here.
    }
  };

  return (
    <div className="w-72 border-l border-white/5 bg-background/50 backdrop-blur-md flex flex-col h-full">
      <div className="p-4 border-b border-white/5">
        <h3 className="text-sm font-black text-white">Outline Mode</h3>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Visão Linear do Funil</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scrollbar-none">
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext 
            items={nodeIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {nodes.map(node => (
                <SortableNodeItem key={node.id} node={node} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};
