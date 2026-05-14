import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, CheckCircle } from "lucide-react";

export const Route = createFileRoute("/q/$slug")({
  head: () => ({ meta: [{ title: "Quiz — NC Performance Suite" }] }),
  component: PublicQuizPage,
});

function PublicQuizPage() {
  const { slug } = Route.useParams();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ["public-quiz", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("quizzes").select("*").eq("slug", slug).eq("is_active", true).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["public-quiz-steps", quiz?.id],
    enabled: !!quiz?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("quiz_steps").select("*").eq("quiz_id", quiz.id).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const submit = async () => {
    try {
      await (supabase as any).from("quiz_submissions").insert({ quiz_id: quiz.id, answers, completed: true });
      setSubmitted(true);
    } catch { /* noop */ }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (error || !quiz) return (
    <div className="flex min-h-screen items-center justify-center text-center">
      <div><h1 className="font-display text-2xl font-bold">Quiz não encontrado</h1><p className="mt-2 text-sm text-muted-foreground">Este quiz não existe ou foi desativado.</p></div>
    </div>
  );

  if (submitted) return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
        <CheckCircle className="mx-auto h-16 w-16 text-success" />
        <h1 className="mt-4 font-display text-3xl font-bold">Obrigado!</h1>
        <p className="mt-2 text-muted-foreground">Suas respostas foram enviadas com sucesso.</p>
      </motion.div>
    </div>
  );

  const currentStep = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ background: quiz.bg_color || "hsl(222 47% 6%)" }}>
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold" style={{ color: quiz.theme_color || "#00d4ff" }}>{quiz.title}</h1>
          {quiz.description && <p className="mt-2 text-sm text-muted-foreground">{quiz.description}</p>}
          <div className="mt-4 flex justify-center gap-1">
            {steps.map((_: any, i: number) => <div key={i} className={`h-1.5 w-8 rounded-full transition ${i <= step ? "bg-primary" : "bg-white/10"}`} />)}
          </div>
        </div>

        {currentStep ? (
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="glass-panel p-6 text-center">
              <h2 className="font-display text-lg font-semibold">{currentStep.title}</h2>
              {currentStep.content && <p className="mt-2 text-sm text-muted-foreground">{currentStep.content}</p>}
              {currentStep.options && (
                <div className="mt-6 space-y-2">
                  {(Array.isArray(currentStep.options) ? currentStep.options : []).map((opt: string, i: number) => (
                    <button key={i} onClick={() => setAnswers({ ...answers, [step]: opt })} className={`w-full rounded-lg border px-4 py-3 text-sm text-left transition ${answers[step] === opt ? "border-primary bg-primary/10 text-primary" : "border-white/10 hover:border-white/20"}`}>
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <button onClick={() => isLast ? submit() : setStep(step + 1)} className="mt-6 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-6 py-3 text-sm font-semibold text-background">
                {isLast ? "Enviar" : "Próximo"} <ArrowRight className="h-4 w-4" />
              </button>
            </motion.div>
          </AnimatePresence>
        ) : (
          <div className="glass-panel p-6 text-center text-sm text-muted-foreground">Este quiz ainda não possui perguntas.</div>
        )}
      </div>
    </div>
  );
}
