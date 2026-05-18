import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HelpCircle, Plus, BarChart3, ExternalLink, Loader2, Edit, Trash2, X, Settings, Layers, GripVertical, Image as ImageIcon, Type, LayoutList, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/quiz")({
  head: () => ({ meta: [{ title: "Quizzes Automotivos — NC Suite" }] }),
  component: QuizPage,
});

type Quiz = { id: string; title: string; slug: string; description: string | null; theme_color: string; bg_color: string; is_active: boolean; lead_form_enabled: boolean; created_at: string | null };
type QuizStep = { id: string; quiz_id: string; title: string; content: string | null; step_type: string; options: string[]; image_options: any[]; next_step_map: Record<string, string>; order_index: number };

function QuizPage() {
  const qc = useQueryClient();
  const [editingQuiz, setEditingQuiz] = useState<Quiz | null>(null);

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quizzes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Quiz[];
    },
  });

  const { data: submissionsCount = {} } = useQuery({
    queryKey: ["quiz-submissions-count"],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_submissions").select("quiz_id");
      if (error) return {};
      const counts: Record<string, number> = {};
      data.forEach(sub => { counts[sub.quiz_id] = (counts[sub.quiz_id] || 0) + 1; });
      return counts;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const slug = `quiz-${Math.random().toString(36).substring(2, 8)}`;
      const { data, error } = await supabase.from("quizzes").insert({ title: "Novo Quiz Automotivo", slug, user_id: u.user?.id }).select().single();
      if (error) throw error;
      return data as Quiz;
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["quizzes"] }); setEditingQuiz(data); toast.success("Quiz criado! Configure os passos."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quizzes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quizzes"] }); toast.success("Quiz excluído."); },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Conversão" title="Quiz Builder" description="Crie funis interativos para qualificação de leads do setor automotivo."
        actions={<button onClick={() => createMutation.mutate()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow" disabled={createMutation.isPending}>{createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Novo Quiz</button>}
      />

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : !quizzes.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><HelpCircle className="h-6 w-6 text-primary/60" />Nenhum quiz criado ainda. Comece a capturar leads qualificados.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q, i) => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel flex flex-col overflow-hidden group">
              <div className="p-5 flex-1 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold text-foreground truncate max-w-[200px]">{q.title}</h3>
                    <p className="label-mono mt-1 text-muted-foreground truncate max-w-[200px]">/q/{q.slug}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${q.is_active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>{q.is_active ? "ATIVO" : "INATIVO"}</span>
                </div>
                {q.description && <p className="mt-3 text-xs text-muted-foreground line-clamp-2">{q.description}</p>}
                
                <div className="mt-4 flex gap-2">
                  <div className="px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono">
                    {submissionsCount[q.id] || 0} LEADS
                  </div>
                </div>
              </div>
              
              <div className="bg-card/50 p-3 flex items-center justify-between">
                <a href={`/q/${q.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"><ExternalLink className="h-3.5 w-3.5" /> Ver Quiz</a>
                <div className="flex items-center gap-1">
                  <button onClick={() => toast.info("Painel de Leads em desenvolvimento", { description: "Em breve você poderá ver todos os leads aqui." })} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Ver Leads"><BarChart3 className="h-4 w-4" /></button>
                  <button onClick={() => setEditingQuiz(q)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar Quiz"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => { if(confirm('Excluir este quiz?')) deleteMutation.mutate(q.id); }} className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Editor Modal/Drawer */}
      <AnimatePresence>
        {editingQuiz && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-4xl h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
                <h2 className="font-display text-lg font-bold">Construtor de Quiz</h2>
                <button onClick={() => setEditingQuiz(null)} className="p-2 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <QuizEditorForm quiz={editingQuiz} />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------
// QUIZ EDITOR FORM COMPONENT
// ---------------------------------------------------------
function QuizEditorForm({ quiz }: { quiz: Quiz }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(quiz);

  const { data: steps = [] } = useQuery({
    queryKey: ["quiz-steps", quiz.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("quiz_steps").select("*").eq("quiz_id", quiz.id).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as QuizStep[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<Quiz>) => {
      const { error } = await supabase.from("quizzes").update(data).eq("id", quiz.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quizzes"] }); toast.success("Quiz salvo!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStepMutation = useMutation({
    mutationFn: async (type: string) => {
      const { error } = await supabase.from("quiz_steps").insert({ quiz_id: quiz.id, title: "Nova Pergunta", step_type: type, order_index: steps.length });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", quiz.id] }),
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<QuizStep> }) => {
      const { error } = await supabase.from("quiz_steps").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", quiz.id] }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quiz_steps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", quiz.id] }),
  });

  const handleChange = (field: keyof Quiz, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const save = () => { updateMutation.mutate(formData); };

  const handleOptionsChange = (stepId: string, currentOptions: string[], index: number, value: string) => {
    const newOptions = [...currentOptions];
    newOptions[index] = value;
    updateStepMutation.mutate({ id: stepId, data: { options: newOptions } });
  };

  const addOption = (stepId: string, currentOptions: string[]) => {
    updateStepMutation.mutate({ id: stepId, data: { options: [...currentOptions, "Nova Opção"] } });
  };

  const removeOption = (stepId: string, currentOptions: string[], index: number) => {
    const newOptions = currentOptions.filter((_, i) => i !== index);
    updateStepMutation.mutate({ id: stepId, data: { options: newOptions } });
  };

  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-10">
      
      {/* 1. Configurações Globais */}
      <div className="glass-panel p-6 space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Configurações do Quiz</h3>
        
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Título Interno</label>
            <input value={formData.title} onChange={(e) => handleChange("title", e.target.value)} onBlur={save} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Slug (URL)</label>
            <input value={formData.slug} onChange={(e) => handleChange("slug", e.target.value)} onBlur={save} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Descrição / Subtítulo</label>
          <textarea value={formData.description || ""} onChange={(e) => handleChange("description", e.target.value)} onBlur={save} rows={2} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Fundo</label>
            <div className="flex gap-2">
               <input type="color" value={formData.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} onBlur={save} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
               <input value={formData.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} onBlur={save} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor do Botão / Progresso</label>
            <div className="flex gap-2">
               <input type="color" value={formData.theme_color} onChange={(e) => handleChange("theme_color", e.target.value)} onBlur={save} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
               <input value={formData.theme_color} onChange={(e) => handleChange("theme_color", e.target.value)} onBlur={save} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between border-t border-border mt-2">
           <span className="text-[11px] font-bold text-muted-foreground uppercase">Formulário de Lead Final (Nome, Email, WhatsApp)</span>
           <button onClick={() => { handleChange("lead_form_enabled", !formData.lead_form_enabled); save(); }} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.lead_form_enabled ? 'bg-primary' : 'bg-muted'}`}>
             <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.lead_form_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
           </button>
        </div>
      </div>

      {/* 2. Passos do Quiz */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Passos do Quiz</h3>
          <div className="flex gap-1">
            <button onClick={() => addStepMutation.mutate("choice")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1"><LayoutList className="h-3 w-3" /> Múltipla Escolha</button>
            <button onClick={() => addStepMutation.mutate("image_choice")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-blue-400"><ImageIcon className="h-3 w-3" /> Imagens</button>
            <button onClick={() => addStepMutation.mutate("text_input")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-green-400"><Type className="h-3 w-3" /> Texto</button>
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step, idx) => (
            <div key={step.id} className="glass-panel flex flex-col relative overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 border-b border-border flex items-center justify-between">
                 <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{idx + 1}</span>
                    <span className="text-[10px] font-mono uppercase text-muted-foreground">{step.step_type.replace('_', ' ')}</span>
                 </div>
                 <div className="flex gap-1">
                    <button onClick={() => { if(confirm('Excluir passo?')) deleteStepMutation.mutate(step.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
                 </div>
              </div>
              
              <div className="p-4 space-y-3">
                 <div>
                    <input value={step.title} onChange={(e) => updateStepMutation.mutate({ id: step.id, data: { title: e.target.value } })} placeholder="Qual a sua pergunta?" className="w-full bg-transparent border-b border-border text-base font-bold focus:border-primary focus:outline-none py-1" />
                 </div>
                 
                 <div>
                    <input value={step.content || ""} onChange={(e) => updateStepMutation.mutate({ id: step.id, data: { content: e.target.value } })} placeholder="Subtítulo ou instrução (opcional)" className="w-full text-xs bg-transparent border-none text-muted-foreground focus:text-foreground focus:outline-none" />
                 </div>

                 {/* Renderiza campos específicos por tipo */}
                 {step.step_type === 'choice' && (
                    <div className="pt-2 space-y-2 border-t border-border mt-2">
                       <label className="text-[10px] font-bold text-muted-foreground uppercase">Opções de Resposta</label>
                       {(Array.isArray(step.options) ? step.options : []).map((opt, i) => (
                          <div key={i} className="flex gap-2 items-center">
                             <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
                             <input value={opt} onChange={(e) => handleOptionsChange(step.id, step.options || [], i, e.target.value)} className="flex-1 bg-background/50 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary" />
                             <button onClick={() => removeOption(step.id, step.options || [], i)} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                             
                             {/* Mini Configuração de Ramificação */}
                             <select 
                                value={step.next_step_map?.[opt] || "default"} 
                                onChange={(e) => updateStepMutation.mutate({ id: step.id, data: { next_step_map: { ...(step.next_step_map || {}), [opt]: e.target.value === 'default' ? null : e.target.value } } })}
                                className="bg-background border border-border rounded px-2 py-1.5 text-[10px] text-muted-foreground max-w-[150px] outline-none"
                             >
                                <option value="default">Padrão (Próximo)</option>
                                {steps.filter(s => s.id !== step.id && s.order_index > step.order_index).map(s => (
                                  <option key={s.id} value={s.id}>Ir para: {s.title.substring(0, 15)}...</option>
                                ))}
                                <option value="end">Fim do Quiz</option>
                             </select>
                          </div>
                       ))}
                       <button onClick={() => addOption(step.id, step.options || [])} className="text-[10px] font-bold text-primary hover:underline">+ Adicionar Opção</button>
                    </div>
                 )}

                 {step.step_type === 'text_input' && (
                    <div className="pt-2 border-t border-border mt-2">
                       <div className="w-full bg-background/30 border border-dashed border-border rounded px-3 py-2 text-xs text-muted-foreground italic flex items-center gap-2">
                         <AlignLeft className="h-3.5 w-3.5" /> O usuário verá um campo de texto livre para digitar a resposta.
                       </div>
                    </div>
                 )}

                 {step.step_type === 'image_choice' && (
                    <div className="pt-2 space-y-2 border-t border-border mt-2">
                       <p className="text-xs text-muted-foreground italic">Opções com imagens (Em breve, configure no JSON via banco enquanto a UI é concluída).</p>
                    </div>
                 )}
              </div>
            </div>
          ))}
          {steps.length === 0 && <p className="text-xs text-muted-foreground text-center py-8 border border-dashed border-border rounded-lg">Nenhuma pergunta adicionada. Seu quiz precisa de pelo menos 1 passo.</p>}
        </div>
      </div>

    </div>
  );
}
