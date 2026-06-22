import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, GripVertical, Save, Edit2, Loader2, Target } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors 
} from "@dnd-kit/core";
import { 
  arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Define the color palette available for stages
const STAGE_COLORS = [
  { id: "neutral", label: "Cinza", bg: "bg-white/10", text: "text-white" },
  { id: "blue", label: "Azul", bg: "bg-blue-500/20", text: "text-blue-400" },
  { id: "amber", label: "Laranja", bg: "bg-amber-500/20", text: "text-amber-400" },
  { id: "purple", label: "Roxo", bg: "bg-purple-500/20", text: "text-purple-400" },
  { id: "success", label: "Verde", bg: "bg-success/20", text: "text-success" },
  { id: "red", label: "Vermelho", bg: "bg-red-500/20", text: "text-red-400" },
];

export function PipelineManagerModal({ 
  isOpen, 
  onClose,
  preselectedClientId 
}: { 
  isOpen: boolean; 
  onClose: () => void;
  preselectedClientId?: string;
}) {
  const qc = useQueryClient();
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null);
  const [pipelineName, setPipelineName] = useState("");
  const [selectedClientId, setSelectedClientId] = useState(preselectedClientId || "");
  const [stages, setStages] = useState<any[]>([]);
  const [isEditingName, setIsEditingName] = useState(false);

  // Queries
  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data || [];
    }
  });

  const { data: pipelines = [], isLoading: loadingPipelines } = useQuery({
    queryKey: ["crm_pipelines"],
    queryFn: async () => {
      let query = supabase.from("crm_pipelines").select("*, clients(name)").order("created_at", { ascending: false });
      if (selectedClientId) query = query.eq("client_id", selectedClientId);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch stages when a pipeline is selected
  useEffect(() => {
    if (activePipelineId) {
      const fetchStages = async () => {
        const { data } = await supabase
          .from("crm_pipeline_stages")
          .select("*")
          .eq("pipeline_id", activePipelineId)
          .order("stage_order", { ascending: true });
        
        if (data) {
          setStages(data.map(s => ({ ...s, isNew: false, isDeleted: false, isEdited: false })));
        }
      };
      fetchStages();
      
      const pipe = pipelines.find(p => p.id === activePipelineId);
      if (pipe) setPipelineName(pipe.name);
    } else {
      setStages([]);
      setPipelineName("");
    }
  }, [activePipelineId, pipelines]);

  // Mutations
  const savePipeline = useMutation({
    mutationFn: async () => {
      if (!pipelineName.trim()) throw new Error("O nome do funil é obrigatório");
      if (!selectedClientId) throw new Error("Vincule a uma loja/cliente");

      let pid = activePipelineId;

      // 1. Save or Update Pipeline
      if (pid && pid !== "new") {
        await supabase.from("crm_pipelines").update({ name: pipelineName, client_id: selectedClientId }).eq("id", pid);
      } else {
        const { data, error } = await supabase.from("crm_pipelines").insert({
          name: pipelineName,
          client_id: selectedClientId
        }).select().single();
        if (error) throw error;
        pid = data.id;
      }

      // 2. Process Stages
      // Filter out deleted items that were never saved (newly added then deleted)
      const validStages = stages.filter(s => !(s.isNew && s.isDeleted));

      // Separate into creates, updates, deletes
      const toDelete = validStages.filter(s => s.isDeleted && !s.isNew).map(s => s.id);
      const toUpdate = validStages.filter(s => !s.isDeleted && !s.isNew && (s.isEdited || true)); // Update all order just in case
      const toCreate = validStages.filter(s => !s.isDeleted && s.isNew);

      // Perform DB actions
      if (toDelete.length > 0) {
        await supabase.from("crm_pipeline_stages").delete().in("id", toDelete);
      }

      for (let i = 0; i < toUpdate.length; i++) {
        const s = toUpdate[i];
        await supabase.from("crm_pipeline_stages")
          .update({ name: s.name, color: s.color, stage_order: i })
          .eq("id", s.id);
      }

      if (toCreate.length > 0) {
        const createPayload = toCreate.map((s, index) => ({
          pipeline_id: pid,
          name: s.name,
          color: s.color,
          stage_order: toUpdate.length + index // Place after updated items
        }));
        await supabase.from("crm_pipeline_stages").insert(createPayload);
      }

      return pid;
    },
    onSuccess: (pid) => {
      toast.success("Funil salvo com sucesso!");
      qc.invalidateQueries({ queryKey: ["crm_pipelines"] });
      qc.invalidateQueries({ queryKey: ["crm_pipeline_stages"] });
      setActivePipelineId(pid);
      setIsEditingName(false);
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao salvar funil");
    }
  });

  const deletePipeline = useMutation({
    mutationFn: async (id: string) => {
      if (!confirm("Tem certeza que deseja excluir este funil permanentemente? Todos os leads atrelados ficarão sem etapa e funil.")) return;
      const { error } = await supabase.from("crm_pipelines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Funil excluído!");
      setActivePipelineId(null);
      qc.invalidateQueries({ queryKey: ["crm_pipelines"] });
    }
  });

  // Stage Handlers
  const handleAddStage = () => {
    const newStage = {
      id: `new-${Date.now()}`,
      name: "Nova Etapa",
      color: "neutral",
      isNew: true,
      isDeleted: false,
      isEdited: false
    };
    setStages([...stages, newStage]);
  };

  const handleUpdateStage = (id: string, field: string, value: any) => {
    setStages(stages.map(s => s.id === id ? { ...s, [field]: value, isEdited: true } : s));
  };

  const handleDeleteStage = (id: string) => {
    setStages(stages.map(s => s.id === id ? { ...s, isDeleted: true } : s));
  };

  // DnD Config
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setStages((items) => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        const newArray = arrayMove(items, oldIndex, newIndex);
        return newArray.map(s => ({ ...s, isEdited: true }));
      });
    }
  };

  if (!isOpen) return null;

  const visibleStages = stages.filter(s => !s.isDeleted);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 10 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10 }}
          className="bg-card border border-white/10 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-white/5 bg-black/20">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">Gerenciador de Funis</h2>
                <p className="text-xs text-muted-foreground">Crie e personalize o pipeline de leads por cliente.</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-muted-foreground hover:text-foreground transition-all">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar - Pipeline List */}
            <div className="w-1/3 border-r border-white/5 bg-black/10 flex flex-col">
              <div className="p-4 border-b border-white/5 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Filtrar Loja / Cliente</label>
                  <select 
                    value={selectedClientId}
                    onChange={(e) => {
                      setSelectedClientId(e.target.value);
                      setActivePipelineId(null);
                    }}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    <option value="">Selecione uma loja...</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                
                <button 
                  onClick={() => {
                    setActivePipelineId("new");
                    setPipelineName("Novo Funil de Vendas");
                    setStages([]);
                    setIsEditingName(true);
                  }}
                  disabled={!selectedClientId}
                  className="w-full flex items-center justify-center gap-2 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 rounded-lg px-4 py-2 text-sm font-bold transition-all disabled:opacity-50"
                >
                  <Plus className="h-4 w-4" /> Criar Novo Funil
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {loadingPipelines ? (
                  <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : pipelines.filter(p => p.client_id === selectedClientId).length === 0 ? (
                  <p className="text-xs text-center text-muted-foreground/50 p-4">Nenhum funil encontrado.</p>
                ) : (
                  pipelines.filter(p => p.client_id === selectedClientId).map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setActivePipelineId(p.id)}
                      className={`w-full text-left px-3 py-3 rounded-lg flex items-center justify-between group cursor-pointer transition-all ${
                        activePipelineId === p.id 
                          ? "bg-white/10 border border-white/20" 
                          : "hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      <div className="truncate">
                        <p className={`text-sm font-bold truncate ${activePipelineId === p.id ? "text-foreground" : "text-muted-foreground"}`}>
                          {p.name}
                        </p>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); deletePipeline.mutate(p.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-500/20 rounded-md transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Main Area - Stage Editor */}
            <div className="flex-1 flex flex-col bg-background/50 relative">
              {!activePipelineId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground/50">
                  <Target className="h-12 w-12 mb-3 opacity-20" />
                  <p className="text-sm font-medium">Selecione ou crie um funil para editar suas etapas.</p>
                </div>
              ) : (
                <>
                  <div className="p-5 border-b border-white/5 flex items-center justify-between bg-black/10">
                    {isEditingName ? (
                      <input 
                        autoFocus
                        value={pipelineName}
                        onChange={(e) => setPipelineName(e.target.value)}
                        onBlur={() => setIsEditingName(false)}
                        onKeyDown={(e) => e.key === "Enter" && setIsEditingName(false)}
                        className="bg-black/50 border border-primary/50 rounded-lg px-3 py-1.5 text-lg font-bold text-foreground focus:outline-none w-1/2"
                      />
                    ) : (
                      <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setIsEditingName(true)}>
                        <h3 className="text-lg font-bold text-foreground">{pipelineName}</h3>
                        <Edit2 className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={handleAddStage}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 text-foreground border border-white/10 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                      >
                        <Plus className="h-3.5 w-3.5" /> Nova Etapa
                      </button>
                      <button 
                        onClick={() => savePipeline.mutate()}
                        disabled={savePipeline.isPending}
                        className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-1.5 text-xs font-bold transition-all shadow-glow-sm disabled:opacity-50"
                      >
                        {savePipeline.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        Salvar Funil
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                    {visibleStages.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <p className="text-sm">Este funil ainda não tem etapas.</p>
                      </div>
                    ) : (
                      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={visibleStages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                          <div className="space-y-2 max-w-2xl mx-auto">
                            {visibleStages.map((stage) => (
                              <SortableStageItem 
                                key={stage.id} 
                                stage={stage} 
                                onUpdate={handleUpdateStage}
                                onDelete={handleDeleteStage}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Draggable Stage Item Component
function SortableStageItem({ stage, onUpdate, onDelete }: { stage: any; onUpdate: any; onDelete: any }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id });
  const style = { transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 10 : 1 };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`flex items-center gap-3 p-3 bg-card border ${isDragging ? "border-primary shadow-glow-sm" : "border-white/5"} rounded-xl group relative`}
    >
      <div {...attributes} {...listeners} className="cursor-grab hover:text-foreground text-muted-foreground p-1">
        <GripVertical className="h-5 w-5" />
      </div>

      <input 
        value={stage.name}
        onChange={(e) => onUpdate(stage.id, "name", e.target.value)}
        className="flex-1 bg-transparent border-none focus:outline-none font-bold text-sm text-foreground"
        placeholder="Nome da etapa..."
      />

      <select 
        value={stage.color}
        onChange={(e) => onUpdate(stage.id, "color", e.target.value)}
        className={`bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none appearance-none cursor-pointer ${
          STAGE_COLORS.find(c => c.id === stage.color)?.text || "text-white"
        }`}
      >
        {STAGE_COLORS.map(c => (
          <option key={c.id} value={c.id} className="bg-card text-foreground">{c.label}</option>
        ))}
      </select>

      <button 
        onClick={() => onDelete(stage.id)}
        className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
