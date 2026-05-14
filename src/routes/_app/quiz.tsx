import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { HelpCircle, Plus, BarChart3, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/quiz")({
  head: () => ({ meta: [{ title: "Quizzes — NC Suite" }] }),
  component: QuizPage,
});

type Quiz = { id: string; title: string; slug: string; description: string | null; theme_color: string | null; is_active: boolean | null; created_at: string | null };

function QuizPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const { data: quizzes = [], isLoading } = useQuery({
    queryKey: ["quizzes"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).from("quizzes").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as Quiz[];
      } catch { return [] as Quiz[]; }
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim() || !slug.trim()) throw new Error("Preencha título e slug");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("quizzes").insert({ title, slug, user_id: u.user?.id, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quizzes"] }); toast.success("Quiz criado"); setShowCreate(false); setTitle(""); setSlug(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Conversão" title="Quizzes" description="Crie quizzes interativos para captura de leads."
        actions={<button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"><Plus className="h-4 w-4" /> Novo quiz</button>}
      />

      {showCreate && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
          <h3 className="font-display text-lg font-semibold mb-4">Criar Quiz</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do quiz" className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="slug-do-quiz" className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
            <button onClick={() => create.mutate()} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">Criar</button>
          </div>
        </motion.div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !quizzes.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><HelpCircle className="h-6 w-6 text-primary/60" />Nenhum quiz criado ainda.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {quizzes.map((q, i) => (
            <motion.div key={q.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel p-5 group">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">{q.title}</h3>
                <span className={`h-2 w-2 rounded-full ${q.is_active ? "bg-success" : "bg-muted-foreground"}`} />
              </div>
              <p className="label-mono mt-1 text-muted-foreground">/q/{q.slug}</p>
              {q.description && <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{q.description}</p>}
              <div className="mt-4 flex items-center gap-3 text-xs">
                <a href={`/q/${q.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Ver</a>
                <span className="flex items-center gap-1 text-muted-foreground"><BarChart3 className="h-3 w-3" /> Analytics</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
