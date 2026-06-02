import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Save, Trash2, Loader2, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  templates: any[];
}

export function TemplateModal({ isOpen, onClose, onSuccess, templates }: TemplateModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [isLoading, setIsLoading] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [pdfLayout, setPdfLayout] = useState("classic");

  useEffect(() => {
    if (isOpen) {
      setActiveTab("list");
      resetForm();
    }
  }, [isOpen]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setMessageTemplate(`📊 *RELATÓRIO DE PERFORMANCE*\n━━━━━━━━━━━━━━━━━━━━\n🏢 *Cliente:* {{NOME_CLIENTE}}\n📅 *Período:* {{PERIODO}}\n💰 *Investimento:* {{INVESTIMENTO}}\n\n━━━━━━━━━━━━━━━━━━━━\n*RESULTADOS POR TIPO*\n━━━━━━━━━━━━━━━━━━━━\n\n{{RESULTADOS_POR_TIPO}}\n━━━━━━━━━━━━━━━━━━━━\n*DETALHE POR CAMPANHA*\n━━━━━━━━━━━━━━━━━━━━\n\n{{LISTA_CAMPANHAS}}\n━━━━━━━━━━━━━━━━━━━━\n*{{AGENCIA}}*`);
    setPdfLayout("classic");
  };

  const handleEdit = (template: any) => {
    setEditingId(template.id);
    setName(template.name);
    setMessageTemplate(template.message_template);
    setPdfLayout(template.pdf_layout || "classic");
    setActiveTab("create");
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Deseja realmente excluir este template?")) return;
    
    setIsLoading(true);
    const { error } = await supabase.from("report_templates").delete().eq("id", id);
    setIsLoading(false);

    if (error) {
      toast.error("Erro ao excluir template");
    } else {
      toast.success("Template excluído com sucesso");
      onSuccess();
    }
  };

  const handleSave = async () => {
    if (!name || !messageTemplate) {
      toast.warning("Preencha o nome e o modelo da mensagem");
      return;
    }

    setIsLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    
    const payload = {
      name,
      message_template: messageTemplate,
      pdf_layout: pdfLayout,
      is_system: false,
      user_id: userData.user?.id
    };

    let error;
    if (editingId) {
      const res = await supabase.from("report_templates").update(payload).eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase.from("report_templates").insert(payload);
      error = res.error;
    }

    setIsLoading(false);

    if (error) {
      toast.error("Erro ao salvar template");
      console.error(error);
    } else {
      toast.success("Template salvo com sucesso!");
      onSuccess();
      setActiveTab("list");
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-full max-w-2xl bg-black border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100vh - 40px)" }}
      >
        <div className="flex items-center justify-between p-5 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
              <FileText className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-widest text-white">Gerenciar Templates</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">Crie modelos para WhatsApp e PDF</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center transition border border-transparent hover:border-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex border-b border-white/5 bg-background">
          <button 
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 ${activeTab === "list" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}
          >
            Meus Templates
          </button>
          <button 
            onClick={() => { setActiveTab("create"); resetForm(); }}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-1.5 ${activeTab === "create" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-white"}`}
          >
            <Plus className="h-3.5 w-3.5" /> Novo Template
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1">
          {activeTab === "list" && (
            <div className="space-y-3">
              {templates.filter(t => !t.is_system).length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="text-sm font-bold">Nenhum template customizado</p>
                  <p className="text-[10px] mt-1">Crie seu primeiro template ao lado.</p>
                </div>
              ) : (
                templates.filter(t => !t.is_system).map(t => (
                  <div key={t.id} className="flex items-center justify-between p-4 rounded-xl border border-white/5 bg-white/[0.01] hover:bg-white/[0.03] transition group">
                    <div>
                      <h3 className="text-xs font-bold text-white uppercase">{t.name}</h3>
                      <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1">
                        Layout PDF: <span className="text-primary">{t.pdf_layout}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(t)} className="px-3 py-1.5 rounded-lg bg-white/5 text-[10px] font-bold text-white hover:bg-white/10 transition uppercase tracking-widest">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(t.id)} className="h-7 w-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "create" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nome do Template</label>
                <input 
                  value={name} onChange={e => setName(e.target.value)}
                  placeholder="Ex: Mensagem VIP Semanal"
                  className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Layout do PDF</label>
                <select 
                  value={pdfLayout} onChange={e => setPdfLayout(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none"
                >
                  <option value="classic">Clássico (Com Detalhes de Campanha)</option>
                  <option value="analytical">Analítico (Apenas Agrupamento por Objetivo)</option>
                  <option value="minimalist">Minimalista (Cards e Resumos Visuais)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Modelo de Mensagem (WhatsApp)</label>
                </div>
                <textarea 
                  value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)}
                  rows={8}
                  className="w-full rounded-xl border border-white/10 bg-background/50 p-4 text-xs font-mono text-green-400 focus:outline-none focus:border-primary/50 resize-none whitespace-pre leading-relaxed"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {['{{NOME_CLIENTE}}', '{{PERIODO}}', '{{INVESTIMENTO}}', '{{TOTAL_RESULTADOS}}', '{{CPA_MEDIO}}', '{{TOTAL_CAMPANHAS}}', '{{RESULTADOS_POR_TIPO}}', '{{LISTA_CAMPANHAS}}', '{{AGENCIA}}'].map(tag => (
                    <span key={tag} onClick={() => setMessageTemplate(prev => prev + tag)} className="cursor-pointer bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[9px] font-mono hover:bg-primary/20 hover:text-primary transition">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <button 
                onClick={handleSave} disabled={isLoading}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-xs font-black uppercase tracking-widest text-background hover:shadow-glow transition disabled:opacity-50"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingId ? "Atualizar Template" : "Salvar Template"}
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
