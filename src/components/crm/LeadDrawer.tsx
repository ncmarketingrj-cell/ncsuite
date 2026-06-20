import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, MessageSquare, Plus, Calendar as CalendarIcon, Clock, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";

export function LeadDrawer({
  lead,
  open,
  onClose,
  onUpdate
}: {
  lead: any;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [aiSummary, setAiSummary] = useState<{ summary: string; nextAction: string } | null>(null);
  const [loadingAi, setLoadingAi] = useState(false);

  useEffect(() => {
    if (open && lead) {
      loadActivities();
      setAiSummary(null);
    }
  }, [open, lead]);

  const loadActivities = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("crm_activities")
      .select("*, profiles:user_id(full_name)")
      .eq("lead_id", lead.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Erro ao carregar histórico");
    } else {
      setActivities(data || []);
    }
    setLoading(false);
  };

  const handleAddActivity = async (type: string, description: string) => {
    if (!description.trim()) return;
    setAddingNote(true);
    
    const { error } = await (supabase as any).from("crm_activities").insert({
      lead_id: lead.id,
      user_id: user?.id,
      type,
      description
    });

    if (error) {
      toast.error("Erro ao registrar atividade");
    } else {
      toast.success("Atividade registrada");
      setNewNote("");
      loadActivities();
      onUpdate(); // Atualiza o kanban (cadência)
    }
    setAddingNote(false);
  };

  const handleGenerateCopilot = async () => {
    setLoadingAi(true);
    try {
      // Simulação da chamada para a Edge Function ou RAG
      // Na prática, isso faria fetch para supabase.functions.invoke('sdr-copilot', { ... })
      await new Promise((r) => setTimeout(r, 1500)); // Simulando delay
      
      const textAtv = activities.map(a => `[${new Date(a.created_at).toLocaleDateString()}] ${a.type}: ${a.description}`).join("\n");
      
      if (activities.length === 0) {
        setAiSummary({
          summary: "Lead recém-cadastrado, nenhuma iteração registrada ainda.",
          nextAction: "Faça o primeiro contato via WhatsApp para apresentar a loja."
        });
      } else {
        setAiSummary({
          summary: "O lead demonstrou interesse, mas não respondeu à última mensagem enviada.",
          nextAction: "Tente uma ligação rápida agora. Se não atender, envie um áudio curto no WhatsApp."
        });
      }
    } catch (e) {
      toast.error("Erro no Copiloto");
    } finally {
      setLoadingAi(false);
    }
  };

  return (
    <AnimatePresence>
      {open && lead && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 shadow-2xl flex flex-col"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div>
                <h2 className="text-xl font-bold text-foreground">{lead.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">{lead.vehicle_interest || 'Não informado'}</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${lead.negotiation_level === 'Quente' ? 'bg-red-500/20 text-red-500' : lead.negotiation_level === 'Morno' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
                    {lead.negotiation_level || 'Frio'}
                  </span>
                </div>
              </div>
              <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
              
              {/* Contatos Rápidos */}
              <div className="flex gap-3">
                <button 
                  onClick={() => handleAddActivity("WhatsApp", "Tentativa de contato via WhatsApp iniciada.")}
                  className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors border border-[#25D366]/20"
                >
                  <MessageSquare className="h-5 w-5 mb-1" />
                  <span className="text-xs font-bold">WhatsApp</span>
                </button>
                <button 
                  onClick={() => handleAddActivity("Ligação", "Ligação efetuada para o cliente.")}
                  className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 transition-colors border border-blue-500/20"
                >
                  <Phone className="h-5 w-5 mb-1" />
                  <span className="text-xs font-bold">Ligar</span>
                </button>
                <button className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-purple-500/10 text-purple-500 hover:bg-purple-500/20 transition-colors border border-purple-500/20">
                  <CalendarIcon className="h-5 w-5 mb-1" />
                  <span className="text-xs font-bold">Agendar</span>
                </button>
              </div>

              {/* Copiloto Victoria AI */}
              <div className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 border border-violet-500/20 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 text-violet-500">
                    <Sparkles className="h-4 w-4" />
                    <span className="text-xs font-black uppercase tracking-widest">SDR Copilot</span>
                  </div>
                  {!aiSummary && (
                    <button 
                      onClick={handleGenerateCopilot}
                      disabled={loadingAi}
                      className="text-xs font-bold bg-violet-500 text-white px-3 py-1 rounded-full hover:bg-violet-600 transition-colors flex items-center gap-2"
                    >
                      {loadingAi ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gerar Insights"}
                    </button>
                  )}
                </div>
                
                {aiSummary && (
                  <div className="space-y-3 mt-4 text-sm text-foreground/90">
                    <div>
                      <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">Resumo</p>
                      <p className="leading-relaxed">{aiSummary.summary}</p>
                    </div>
                    <div className="p-3 bg-violet-500/10 rounded-xl border border-violet-500/20">
                      <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-1">Próxima Ação Sugerida</p>
                      <p className="font-medium text-violet-100">{aiSummary.nextAction}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Registrar Nova Atividade */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-3">Registrar Nota</p>
                <div className="flex flex-col gap-2">
                  <textarea
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="O que foi conversado?"
                    className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary min-h-[80px] resize-none"
                  />
                  <button
                    onClick={() => handleAddActivity("Nota", newNote)}
                    disabled={addingNote || !newNote.trim()}
                    className="self-end bg-primary/20 text-primary hover:bg-primary/30 px-4 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    Salvar Nota
                  </button>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Histórico (Cadência)</p>
                {loading ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : activities.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhuma atividade registrada.</p>
                ) : (
                  <div className="relative border-l border-white/10 ml-3 space-y-6">
                    {activities.map((act) => (
                      <div key={act.id} className="relative pl-6">
                        <div className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-card border-2 border-primary" />
                        <div className="flex items-start justify-between">
                          <p className="text-xs font-bold text-foreground">{act.type}</p>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                            <Clock className="h-3 w-3" />
                            {new Date(act.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{act.description}</p>
                        {act.profiles && act.profiles.full_name && (
                          <p className="text-[10px] text-muted-foreground/50 mt-1 uppercase">Por {act.profiles.full_name}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
