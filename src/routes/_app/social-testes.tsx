import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Edit3,
  FlaskConical,
  Info,
  ListTodo,
  Plus,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SocialHubChrome } from "@/components/social/SocialHubChrome";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useGlobalDate } from "@/contexts/DateContext";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import { useSocialAccountsQuery } from "@/hooks/useSocialHubData";
import {
  useSaveSocialExperimentMutation,
  useSaveSocialLearningMutation,
  useSaveSocialTaskMutation,
  useSocialExperimentsQuery,
  useSocialLearningsQuery,
} from "@/lib/socialHubService";
import {
  validateExperimentConclusion,
  type ExperimentConclusionStatus,
  type SocialExperiment,
  type SocialLearningRecord,
} from "@/lib/socialStrategyDomain";

export const Route = createFileRoute("/_app/social-testes")({
  component: SocialExperimentsAndLearningsPage,
});

function SocialExperimentsAndLearningsPage() {
  const { user } = useAuth();
  const { canEdit, profile } = usePagePermission();
  const canEditSocial = canEdit("social");
  const tenantId = user?.id ?? null;

  const { dateFrom, dateTo } = useGlobalDate();
  const { selectedPage } = useSocialHubFilters();

  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];
  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;

  const experimentsQuery = useSocialExperimentsQuery({ tenantId, pageId: selectedPage });
  const learningsQuery = useSocialLearningsQuery({ tenantId, pageId: selectedPage });
  const saveExp = useSaveSocialExperimentMutation();
  const saveLearning = useSaveSocialLearningMutation();
  const saveTask = useSaveSocialTaskMutation();

  const [tab, setTab] = useState<"experiments" | "learnings">("experiments");

  // Formulário novo teste
  const [showNewExp, setShowNewExp] = useState(false);
  const [expTitle, setExpTitle] = useState("");
  const [expHypothesis, setExpHypothesis] = useState("");
  const [expVariable, setExpVariable] = useState("");
  const [expVariantsText, setExpVariantsText] = useState("Variação A | Variação B");
  const [expMetric, setExpMetric] = useState("taxa_engajamento");
  const [expClosure, setExpClosure] = useState("");
  const [expManualNative, setExpManualNative] = useState(false);

  // Formulário novo aprendizado
  const [showNewLearning, setShowNewLearning] = useState(false);
  const [learnTitle, setLearnTitle] = useState("");
  const [learnObs, setLearnObs] = useState("");
  const [learnEvidence, setLearnEvidence] = useState("");
  const [learnNext, setLearnNext] = useState("");

  const [editingCorrectionId, setEditingCorrectionId] = useState<string | null>(null);
  const [correctionText, setCorrectionText] = useState("");

  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSocial || !selectedAccount || selectedPage === "all") return;
    try {
      await saveExp.mutateAsync({
        page_id: selectedPage,
        account_name: selectedAccount.page_name,
        title: expTitle,
        hypothesis: expHypothesis,
        primary_variable: expVariable,
        variants: expVariantsText.split("|").map((v) => v.trim()).filter(Boolean),
        primary_metric: expMetric,
        closure_criteria: expClosure,
        is_manual_meta_native: expManualNative,
        status: "running",
        window_start: dateFrom,
        window_end: dateTo,
      });
      toast.success("Teste direcional registrado.");
      setExpTitle("");
      setExpHypothesis("");
      setExpVariable("");
      setExpClosure("");
      setShowNewExp(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao registrar teste.");
    }
  };

  const handleUpdateConclusion = async (
    exp: SocialExperiment,
    conclusionStatus: ExperimentConclusionStatus,
    sampleCount: number
  ) => {
    if (!canEditSocial) return;
    const validation = validateExperimentConclusion({
      conclusionStatus,
      sampleCount,
      primaryVariable: exp.primary_variable,
      closureCriteria: exp.closure_criteria,
    });
    if (validation.warning) {
      toast.info(validation.warning);
    }
    try {
      await saveExp.mutateAsync({
        ...exp,
        sample_count: sampleCount,
        conclusion_status: validation.normalizedStatus,
        status:
          validation.normalizedStatus === "insufficient_sample"
            ? "inconclusive"
            : conclusionStatus === "pending"
              ? "running"
              : "concluded",
      });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao atualizar conclusão.");
    }
  };

  const handleCreateLearning = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSocial || !selectedAccount || selectedPage === "all") return;
    try {
      await saveLearning.mutateAsync({
        page_id: selectedPage,
        account_name: selectedAccount.page_name,
        title: learnTitle,
        observation: learnObs,
        evidence_summary: learnEvidence,
        actionable_next_step: learnNext,
        period_label: `${dateFrom} a ${dateTo}`,
        ai_generated: false,
        validation_status: "confirmed",
      });
      toast.success("Aprendizado salvo no banco da conta.");
      setLearnTitle("");
      setLearnObs("");
      setLearnEvidence("");
      setLearnNext("");
      setShowNewLearning(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar aprendizado.");
    }
  };

  const handleLearningDecision = async (
    item: SocialLearningRecord,
    status: "confirmed" | "corrected" | "rejected",
    humanCorrection?: string
  ) => {
    if (!canEditSocial) return;
    try {
      await saveLearning.mutateAsync({
        ...item,
        validation_status: status,
        human_correction: humanCorrection ?? item.human_correction ?? null,
      });
      setEditingCorrectionId(null);
      setCorrectionText("");
      toast.success("Status de validação atualizado.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao validar aprendizado.");
    }
  };

  const handleTurnIntoTask = async (title: string, desc: string, pageId: string, accountName: string, expId?: string) => {
    if (!canEditSocial) return;
    try {
      await saveTask.mutateAsync({
        page_id: pageId,
        account_name: accountName,
        title,
        description: desc,
        task_type: "experimento_social",
        priority: "media",
        status: "todo",
        source_type: expId ? "experiment" : "learning",
        linked_experiment_id: expId || null,
        actorName: profile?.full_name || "Equipe",
        changeLabel: "Criada a partir de Inteligência / Testes & Aprendizados",
      });
      toast.success("Tarefa criada em Projetos.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar tarefa.");
    }
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <PageHeader
        eyebrow="Social Hub"
        title="Testes & Aprendizados"
        description="Registre o que foi testado e o que funcionou melhor em cada conta."
      />

      <SocialHubChrome
        tenantId={tenantId}
        requireExplicitAccount={showNewExp || showNewLearning ? "experiment" : null}
        rightSlot={
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setTab("experiments")}
              className={`rounded-xl px-3 py-2 sm:py-1.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-0 ${
                tab === "experiments"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <FlaskConical className="h-3.5 w-3.5" /> Testes ({experimentsQuery.data?.length || 0})
            </button>
            <button
              type="button"
              onClick={() => setTab("learnings")}
              className={`rounded-xl px-3 py-2 sm:py-1.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-0 ${
                tab === "learnings"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" /> Aprendizados ({learningsQuery.data?.length || 0})
            </button>
          </div>
        }
      />

      {/* Aviso metodológico transparente */}
      <div className="flex items-start gap-2.5 rounded-2xl border border-blue-500/25 bg-blue-500/8 px-4 py-3 text-xs text-blue-800 dark:text-blue-200">
        <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-500" />
        <p>
          <strong>Leitura direcional em orgânico:</strong> testes orgânicos não isolam 100% fatores sazonais ou mudanças de distribuição do algoritmo. Só conclua vencedor quando atingir amostra mínima suficiente dentro da janela planejada.
        </p>
      </div>

      {tab === "experiments" ? (
        <div className="space-y-4">
          {canEditSocial && selectedPage !== "all" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewExp((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Novo teste de conteúdo
              </button>
            </div>
          )}

          {showNewExp && selectedPage !== "all" && selectedAccount && (
            <form
              onSubmit={handleCreateExperiment}
              className="rounded-2xl border border-primary/30 bg-card p-5 space-y-3 shadow-sm"
            >
              <h3 className="text-sm font-black">Novo Experimento — {selectedAccount.page_name}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Título do teste (ex.: Gancho com pergunta vs demonstração direta)"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  required
                />
                <input
                  type="text"
                  value={expVariable}
                  onChange={(e) => setExpVariable(e.target.value)}
                  placeholder="1 variável principal testada *"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  required
                />
              </div>
              <textarea
                rows={2}
                value={expHypothesis}
                onChange={(e) => setExpHypothesis(e.target.value)}
                placeholder="Hipótese do teste *"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                required
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  value={expVariantsText}
                  onChange={(e) => setExpVariantsText(e.target.value)}
                  placeholder="Variações separadas por |"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
                <input
                  type="text"
                  value={expMetric}
                  onChange={(e) => setExpMetric(e.target.value)}
                  placeholder="Métrica principal (ex.: salvamentos, retenção 3s)"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
                <input
                  type="text"
                  value={expClosure}
                  onChange={(e) => setExpClosure(e.target.value)}
                  placeholder="Critério de encerramento *"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  required
                />
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={expManualNative}
                  onChange={(e) => setExpManualNative(e.target.checked)}
                />
                Teste nativo realizado direto na Meta (preenchimento manual de resultado)
              </label>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewExp(false)}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                >
                  Salvar experimento
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {(experimentsQuery.data || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
                Nenhum experimento registrado nesta conta. Selecione uma conta específica acima para criar o primeiro teste estruturado.
              </div>
            ) : (
              (experimentsQuery.data || []).map((exp) => (
                <div key={exp.id} className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-primary">
                        {exp.account_name} • Variável: {exp.primary_variable}
                      </span>
                      <h4 className="text-sm font-black">{exp.title}</h4>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      {exp.is_manual_meta_native && (
                        <span className="rounded-md bg-muted px-2 py-0.5 font-semibold">
                          Meta nativo (manual)
                        </span>
                      )}
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 font-bold text-primary">
                        {exp.conclusion_status}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <strong className="text-foreground">Hipótese:</strong> {exp.hypothesis}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Métrica principal: <strong>{exp.primary_metric}</strong> • Critério:{" "}
                    <strong>{exp.closure_criteria || "Não informado"}</strong> • Amostra:{" "}
                    <strong>{exp.sample_count}</strong>
                  </p>

                  {exp.conclusion_status === "insufficient_sample" && (
                    <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Amostra insuficiente (&lt; 4 leituras): não foi possível validar vencedor.
                    </div>
                  )}

                  {canEditSocial && (
                    <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateConclusion(exp, "validated", Math.max(exp.sample_count, 4))
                        }
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                      >
                        Concluir (amostra ≥ 4)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateConclusion(exp, "validated", exp.sample_count)}
                        className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
                      >
                        Testar validação com amostra atual ({exp.sample_count})
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTurnIntoTask(
                            `Aplicar teste: ${exp.title}`,
                            `Hipótese: ${exp.hypothesis}\nVariável: ${exp.primary_variable}`,
                            exp.page_id,
                            exp.account_name,
                            exp.id
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
                      >
                        <ListTodo className="h-3 w-3" /> Criar tarefa
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        /* BANCO DE APRENDIZADOS */
        <div className="space-y-4">
          {canEditSocial && selectedPage !== "all" && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowNewLearning((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Registrar aprendizado
              </button>
            </div>
          )}

          {showNewLearning && selectedPage !== "all" && selectedAccount && (
            <form
              onSubmit={handleCreateLearning}
              className="rounded-2xl border border-primary/30 bg-card p-5 space-y-3 shadow-sm"
            >
              <h3 className="text-sm font-black">Novo Aprendizado — {selectedAccount.page_name}</h3>
              <input
                type="text"
                value={learnTitle}
                onChange={(e) => setLearnTitle(e.target.value)}
                placeholder="Título do aprendizado *"
                className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                required
              />
              <textarea
                rows={2}
                value={learnObs}
                onChange={(e) => setLearnObs(e.target.value)}
                placeholder="O que foi observado nos dados ou atendimento *"
                className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                required
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={learnEvidence}
                  onChange={(e) => setLearnEvidence(e.target.value)}
                  placeholder="Evidência (posts, métricas, período)"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
                <input
                  type="text"
                  value={learnNext}
                  onChange={(e) => setLearnNext(e.target.value)}
                  placeholder="Próxima ação prática"
                  className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewLearning(false)}
                  className="h-9 rounded-xl border border-border px-3 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
                >
                  Salvar aprendizado
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {(learningsQuery.data || []).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
                Nenhum aprendizado registrado ainda para este escopo.
              </div>
            ) : (
              (learningsQuery.data || []).map((item) => (
                <div key={item.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold text-primary">
                        {item.account_name} • {item.period_label || "Período registrado"}
                      </span>
                      <h4 className="text-sm font-black">{item.title}</h4>
                    </div>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-bold">
                      {item.validation_status}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{item.observation}</p>
                  {item.evidence_summary && (
                    <p className="text-[11px]">
                      <strong>Evidência:</strong> {item.evidence_summary}
                    </p>
                  )}
                  {item.human_correction && (
                    <p className="text-[11px] text-blue-600 dark:text-blue-400">
                      <strong>Correção da equipe:</strong> {item.human_correction}
                    </p>
                  )}

                  {editingCorrectionId === item.id && (
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        value={correctionText}
                        onChange={(e) => setCorrectionText(e.target.value)}
                        placeholder="Escreva a correção humana para este aprendizado..."
                        className="flex-1 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleLearningDecision(item, "corrected", correctionText)}
                        className="h-8 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      >
                        Salvar correção
                      </button>
                    </div>
                  )}

                  {canEditSocial && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
                      <button
                        type="button"
                        onClick={() => handleLearningDecision(item, "confirmed")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-600"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCorrectionId(item.id);
                          setCorrectionText(item.human_correction || "");
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold"
                      >
                        <Edit3 className="h-3 w-3" /> Corrigir
                      </button>
                      <button
                        type="button"
                        onClick={() => handleLearningDecision(item, "rejected")}
                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 px-2.5 py-1 text-[11px] font-semibold text-rose-500"
                      >
                        <XCircle className="h-3 w-3" /> Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTurnIntoTask(
                            item.actionable_next_step || `Aplicar aprendizado: ${item.title}`,
                            item.observation,
                            item.page_id,
                            item.account_name
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
                      >
                        <ListTodo className="h-3 w-3" /> Virar tarefa
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
