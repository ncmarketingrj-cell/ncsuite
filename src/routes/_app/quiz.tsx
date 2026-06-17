import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  LayoutList, Plus, Eye, ExternalLink, Edit, Trash2, QrCode, Loader2,
  ArrowRight, HelpCircle, CheckCircle2, XCircle, ListChecks
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/quiz")({
  component: QuizPage,
});

function QuizPage() {
  const qc = useQueryClient();
  const [showQR, setShowQR] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["quiz-page-items"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quizzes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
  });

  // Fetch step counts per quiz
  const { data: stepCounts = {} } = useQuery({
    queryKey: ["quiz-step-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("quiz_steps")
        .select("quiz_id");
      if (error || !data) return {};
      return data.reduce((acc: Record<string, number>, s: any) => {
        acc[s.quiz_id] = (acc[s.quiz_id] || 0) + 1;
        return acc;
      }, {});
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const slug = `quiz-${Math.random().toString(36).substring(2, 8)}`;
      const { data, error } = await (supabase as any)
        .from("quizzes")
        .insert({ title: "Novo Quiz Automotivo", slug, user_id: u.user?.id })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quiz-page-items"] });
      toast.success("Quiz criado! Acesse o editor para adicionar perguntas.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("quizzes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-page-items"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("quizzes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quiz-page-items"] }); toast.success("Excluído."); },
  });

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <LayoutList className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Quizzes Interativos</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Qualifique leads com perguntas e lógica condicional
              </p>
            </div>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 bg-purple-500 text-white hover:bg-purple-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Novo Quiz
          </button>
        </div>

        {/* What is this */}
        <div className="mt-4 p-3 bg-purple-500/8 border border-purple-500/20 rounded-xl flex items-start gap-3">
          <HelpCircle className="w-4 h-4 text-purple-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">Quiz Interativo</span> permite criar fluxos de perguntas
            com imagens, múltipla escolha e lógica condicional para qualificar o cliente antes de captar o lead.
            Perfeito para descobrir o veículo ideal de cada visitante.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 flex-1">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center mb-4">
              <LayoutList className="w-7 h-7 text-purple-500/60" />
            </div>
            <p className="font-black text-foreground/70">Nenhum quiz criado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Crie seu primeiro quiz interativo para qualificar leads automaticamente.
            </p>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="mt-5 flex items-center gap-2 bg-purple-500 text-white hover:bg-purple-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              Criar Primeiro Quiz
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item: any, i: number) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-all flex flex-col"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-purple-500 to-indigo-500" />

                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.is_active ? "bg-purple-500/10 text-purple-500 border-purple-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                          {item.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                          {item.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <h3 className="font-black text-sm text-foreground truncate">{item.title}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">/q/{item.slug}</p>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate({ id: item.id, is_active: !item.is_active })}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-full border-2 border-transparent transition-colors ${item.is_active ? "bg-purple-500" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.is_active ? "translate-x-2" : "-translate-x-2"}`} />
                    </button>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.views_count || 0} visitas</span>
                    <span className="flex items-center gap-1">
                      <ListChecks className="w-3 h-3" />
                      {(stepCounts as any)[item.id] || 0} perguntas
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-[10px] text-muted-foreground mt-2 line-clamp-2 leading-relaxed">{item.description}</p>
                  )}
                </div>

                <div className="border-t border-border p-3 flex items-center gap-1.5">
                  <a href={`/q/${item.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Ver quiz">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => setShowQR(item.slug)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="QR Code">
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    to="/organizador"
                    className="flex-1 flex items-center justify-center gap-1.5 ml-auto px-3 py-1.5 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 text-xs font-bold rounded-lg transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Editar Perguntas
                    <ArrowRight className="w-3 h-3 ml-auto" />
                  </Link>
                  <button
                    onClick={() => { if (confirm("Excluir este quiz?")) deleteMutation.mutate(item.id); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Create card */}
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex flex-col items-center justify-center min-h-[160px] rounded-2xl border-2 border-dashed border-border hover:border-purple-500/40 hover:bg-purple-500/[0.03] transition-all gap-3 p-6 text-center group"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-purple-500/10 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-purple-500 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-muted-foreground group-hover:text-foreground transition-colors">Novo Quiz</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Criar fluxo interativo</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowQR(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-base mb-4">QR Code</h3>
            <div className="bg-white p-3 rounded-xl inline-block">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(window.location.origin + "/q/" + showQR)}`} alt="QR Code" className="w-40 h-40" />
            </div>
            <p className="text-xs text-muted-foreground mt-4 mb-3">/q/{showQR}</p>
            <button onClick={() => setShowQR(null)} className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
