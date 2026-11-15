import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  ListTodo,
  Lock,
  Plus,
  ShieldAlert,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SocialHubChrome } from "@/components/social/SocialHubChrome";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useGlobalDate } from "@/contexts/DateContext";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import {
  useSocialAccountsQuery,
  useSocialOverviewQuery,
  useSocialPlannerQuery,
  useSocialPostsQuery,
} from "@/hooks/useSocialHubData";
import {
  useSaveSocialTaskMutation,
  useSocialContentItemsQuery,
  useSocialProjectTasksQuery,
  useSocialStrategiesMapQuery,
  useSocialTeamMembersQuery,
} from "@/lib/socialHubService";
import {
  buildConsolidatedScopeSummary,
  buildOverviewCommandCenter,
  classifySocialAccount,
  CONTENT_PIPELINE_STAGES,
  createTaskPayloadFromRecommendation,
  resolveMetricDisplayState,
  type ActionableRecommendation,
} from "@/lib/socialStrategyDomain";

export const Route = createFileRoute("/_app/social-hub")({
  component: SocialHubOverviewPage,
});

function formatShortDate(iso?: string | null): string {
  if (!iso) return "Sem prazo";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Sem prazo";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function SocialHubOverviewPage() {
  const { user } = useAuth();
  const { canEdit, profile } = usePagePermission();
  const canEditSocial = canEdit("social");
  const tenantId = user?.id ?? null;

  const { dateFrom, dateTo } = useGlobalDate();
  const { selectedPage, selectedNetwork } = useSocialHubFilters();

  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];
  const masterToken = accountsQuery.data?.masterToken ?? null;

  const overviewQuery = useSocialOverviewQuery({
    tenantId,
    accounts,
    selectedPage,
    network: selectedNetwork,
    masterToken,
    dateFrom,
    dateTo,
    enabled: Boolean(tenantId) && !accountsQuery.isLoading,
  });

  const postsQuery = useSocialPostsQuery({
    tenantId,
    accounts,
    selectedPage,
    network: selectedNetwork,
    masterToken,
    dateFrom,
    dateTo,
    onlyInPeriod: false,
    enabled: Boolean(tenantId) && !accountsQuery.isLoading,
  });

  const plannerQuery = useSocialPlannerQuery({
    tenantId,
    accounts,
    selectedPage,
    network: selectedNetwork,
    masterToken,
    enabled: Boolean(tenantId) && !accountsQuery.isLoading,
  });

  const strategiesQuery = useSocialStrategiesMapQuery(tenantId);
  const contentItemsQuery = useSocialContentItemsQuery({ tenantId, pageId: selectedPage });
  const tasksQuery = useSocialProjectTasksQuery({ tenantId, pageId: selectedPage });
  const teamMembersQuery = useSocialTeamMembersQuery(tenantId);
  const saveTask = useSaveSocialTaskMutation();

  const [quickTaskOpen, setQuickTaskOpen] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState("");
  const [quickTaskDue, setQuickTaskDue] = useState("");
  const [quickTaskAssigneeId, setQuickTaskAssigneeId] = useState("");

  const strategies = strategiesQuery.data || [];
  const strategyByPageId = useMemo(
    () => new Map(strategies.map((s) => [s.page_id, s])),
    [strategies]
  );

  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;
  const activeStrategy = selectedPage !== "all" ? strategyByPageId.get(selectedPage) || null : null;
  const accountClassification = selectedAccount
    ? classifySocialAccount(selectedAccount, activeStrategy)
    : null;

  const overviewData = overviewQuery.data;
  const sectionStates = overviewData?.sectionStates;
  const overallDataState = accountsQuery.data?.telemetry?.state === "permission_denied"
    ? "permission_denied"
    : sectionStates?.accountInsights?.state ||
      (overviewQuery.isLoading ? "loading" : "success");

  const scopeSummary = useMemo(
    () =>
      buildConsolidatedScopeSummary({
        selectedPage,
        targetAccounts: overviewData?.targetAccounts || (selectedAccount ? [selectedAccount] : []),
        allAccounts: accounts,
        strategyByPageId,
      }),
    [selectedPage, overviewData?.targetAccounts, selectedAccount, accounts, strategyByPageId]
  );

  const commandCenter = useMemo(
    () =>
      buildOverviewCommandCenter({
        selectedPage,
        accountName: selectedAccount?.page_name || "Todas as Contas",
        strategy: activeStrategy,
        tasks: tasksQuery.data || [],
        contentItems: contentItemsQuery.data || [],
        plannerPosts: plannerQuery.data?.posts || [],
        recentPosts: postsQuery.data?.allRecentPosts || [],
        periodLabel: `${dateFrom} a ${dateTo}`,
      }),
    [
      selectedPage,
      selectedAccount?.page_name,
      activeStrategy,
      tasksQuery.data,
      contentItemsQuery.data,
      plannerQuery.data?.posts,
      postsQuery.data?.allRecentPosts,
      dateFrom,
      dateTo,
    ]
  );

  const igFollowersMetric = resolveMetricDisplayState({
    rawValue: overviewData?.kpis?.followersIg,
    isInstagramExclusive: true,
    accountClassification,
    sectionState: sectionStates?.followers?.state,
    sectionMessage: sectionStates?.followers?.message,
    isLoading: overviewQuery.isLoading,
  });

  const igReachMetric = resolveMetricDisplayState({
    rawValue: overviewData?.kpis?.reachIg,
    isInstagramExclusive: true,
    accountClassification,
    sectionState: sectionStates?.accountInsights?.state,
    sectionMessage: sectionStates?.accountInsights?.message,
    fieldAvailability: overviewData?.fieldAvailability?.reachIg,
    isLoading: overviewQuery.isLoading,
  });

  const fbFansMetric = resolveMetricDisplayState({
    rawValue: overviewData?.kpis?.followersFb,
    isInstagramExclusive: false,
    accountClassification,
    sectionState: sectionStates?.followers?.state,
    sectionMessage: sectionStates?.followers?.message,
    isLoading: overviewQuery.isLoading,
  });

  const interactionsMetric = resolveMetricDisplayState({
    rawValue:
      overviewData?.kpis
        ? (overviewData.kpis.interactionsIg || 0) + (overviewData.kpis.interactionsFb || 0)
        : null,
    isInstagramExclusive: false,
    accountClassification,
    sectionState: sectionStates?.accountInsights?.state,
    sectionMessage: sectionStates?.accountInsights?.message,
    fieldAvailability: overviewData?.fieldAvailability?.interactionsIg,
    isLoading: overviewQuery.isLoading,
  });

  const handleCreateTaskFromRec = async (rec: ActionableRecommendation) => {
    if (!canEditSocial) {
      toast.error("Você tem permissão somente leitura no módulo Social.");
      return;
    }
    try {
      const payload = createTaskPayloadFromRecommendation({
        recommendation: rec,
        dueAtIso: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      });
      await saveTask.mutateAsync({
        ...payload,
        actorName: profile?.full_name || "Equipe",
        changeLabel: "Tarefa criada pela Visão Geral Social",
      });
      toast.success("Tarefa criada e vinculada em Projetos Social.");
    } catch (err: any) {
      toast.error(err?.message || "Não foi possível criar a tarefa.");
    }
  };

  const handleQuickTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTaskTitle.trim()) return;
    if (!canEditSocial) {
      toast.error("Sem permissão de edição em Social.");
      return;
    }
    const member = (teamMembersQuery.data || []).find((m) => m.id === quickTaskAssigneeId);
    try {
      await saveTask.mutateAsync({
        page_id: selectedPage === "all" ? null : selectedPage,
        account_name: selectedAccount?.page_name || "Todas as Contas",
        title: quickTaskTitle.trim(),
        task_type: "operacional",
        priority: "media",
        status: "todo",
        assignee_id: member?.id || null,
        assignee_name: member?.full_name || "",
        due_at: quickTaskDue ? new Date(`${quickTaskDue}T18:00:00`).toISOString() : null,
        source_type: "manual",
        actorName: profile?.full_name || "Equipe",
        changeLabel: "Criada via Ação Rápida na Visão Geral",
      });
      toast.success("Tarefa adicionada ao módulo Projetos.");
      setQuickTaskTitle("");
      setQuickTaskDue("");
      setQuickTaskAssigneeId("");
      setQuickTaskOpen(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar tarefa.");
    }
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <PageHeader
        eyebrow="Social Hub"
        title="Visão Geral Social"
        description="Central diária por conta: prioridades de hoje, calendário da semana, contexto estratégico e sinais acionáveis."
      />

      <SocialHubChrome
        tenantId={tenantId}
        syncStatus={{
          isLoading: accountsQuery.isLoading || overviewQuery.isLoading,
          isFetching: overviewQuery.isFetching || postsQuery.isFetching,
          isFromFallback: overviewData?.fromCache,
          snapshotAt: overviewData?.snapshotAt,
          dataState: overallDataState,
        }}
        rightSlot={
          <div className="flex items-center gap-1.5">
            <Link
              to={"/social-conteudo" as any}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              <Sparkles className="h-3.5 w-3.5" /> Criar ideia
            </Link>
            {canEditSocial && (
              <button
                type="button"
                onClick={() => setQuickTaskOpen((v) => !v)}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
              >
                <Plus className="h-3.5 w-3.5" /> Criar tarefa
              </button>
            )}
          </div>
        }
      />

      {/* Modal/Barra inline rápida de criação de tarefa */}
      {quickTaskOpen && (
        <form
          onSubmit={handleQuickTaskSubmit}
          className="rounded-2xl border border-primary/30 bg-card p-4 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Nova tarefa rápida ({selectedAccount?.page_name || "Consolidado"})
            </p>
            <button
              type="button"
              onClick={() => setQuickTaskOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Fechar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <input
              type="text"
              value={quickTaskTitle}
              onChange={(e) => setQuickTaskTitle(e.target.value)}
              placeholder="Ex.: Aprovar roteiro de oferta semanal..."
              className="md:col-span-2 h-9 rounded-xl border border-border bg-background px-3 text-xs"
              required
            />
            <select
              value={quickTaskAssigneeId}
              onChange={(e) => setQuickTaskAssigneeId(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
            >
              <option value="">Responsável (opcional)</option>
              {(teamMembersQuery.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <input
                type="date"
                value={quickTaskDue}
                onChange={(e) => setQuickTaskDue(e.target.value)}
                className="flex-1 h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
              />
              <button
                type="submit"
                disabled={saveTask.isPending}
                className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                Salvar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* BLOCO A: CONTEXTO DA CONTA */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-foreground">
                {selectedPage === "all"
                  ? "Visão Consolidada de Contas"
                  : selectedAccount?.page_name || "Conta Social"}
              </h2>
              <span className="rounded-lg border border-border bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                Período: {dateFrom} a {dateTo}
              </span>
              {accountClassification?.isAutomotive && (
                <span className="rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Segmento Automotivo (fatos comerciais travados à confirmação)
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
              <Target className="h-3.5 w-3.5 text-primary shrink-0" />
              {selectedPage === "all" ? (
                <span>
                  Objetivo por conta individual.{" "}
                  <Link to={"/social-estrategia" as any} className="text-primary font-semibold hover:underline">
                    Abrir Estratégias
                  </Link>
                </span>
              ) : activeStrategy?.primary_objective ? (
                <span>
                  <strong className="text-foreground">Objetivo atual:</strong>{" "}
                  {activeStrategy.primary_objective}
                </span>
              ) : (
                <span>
                  Objetivo estratégico ainda não definido para esta conta.{" "}
                  <Link to={"/social-estrategia" as any} className="text-primary font-semibold hover:underline">
                    Definir agora
                  </Link>
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/social"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <Calendar className="h-3.5 w-3.5" /> Abrir calendário
            </Link>
            <Link
              to="/social-insights"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              <BarChart3 className="h-3.5 w-3.5" /> Ver análise
            </Link>
          </div>
        </div>

        {/* Estado explícito da consolidação ou permissão */}
        {scopeSummary.isConsolidated && (
          <div className="rounded-xl border border-blue-500/25 bg-blue-500/8 px-3.5 py-2.5 text-xs space-y-1">
            <p className="font-bold text-blue-700 dark:text-blue-300">
              {scopeSummary.comparableWarning}
            </p>
            <p className="text-[11px] text-muted-foreground">
              Contas consideradas nesta soma ({scopeSummary.includedAccounts.length}):{" "}
              {scopeSummary.includedAccounts.map((c) => c.name).join(", ") || "Nenhuma"}.
            </p>
            {scopeSummary.excludedOrLimitedNotes.map((note, idx) => (
              <p key={idx} className="text-[11px] text-amber-700 dark:text-amber-300">
                • {note}
              </p>
            ))}
          </div>
        )}

        {(overallDataState === "permission_denied" ||
          overallDataState === "token_expired" ||
          accountClassification?.isMvmRestrictedCase) && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-200">
            <Lock className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-bold">Dados limitados por permissão na Meta</p>
              <p className="text-[11px] opacity-90 mt-0.5">
                {accountClassification?.isMvmRestrictedCase
                  ? "A conta MVM Brasil Benefícios está fora do fluxo operacional atual por restrição de permissão. Nenhum número foi estimado ou zerado artificialmente."
                  : sectionStates?.accountInsights?.message ||
                    "Esta conta não autorizou leitura de métricas no momento."}
              </p>
            </div>
          </div>
        )}

        {/* Resumo compacto de KPIs com estados reais (N/A para Somente FB, sem zerar indisponibilidade) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Seguidores Instagram", res: igFollowersMetric },
            { label: "Alcance Instagram", res: igReachMetric },
            { label: "Seguidores / Curtidas Facebook", res: fbFansMetric },
            { label: "Interações no Período", res: interactionsMetric },
          ].map((card) => (
            <div
              key={card.label}
              className="rounded-xl border border-border/80 bg-background/60 p-3 space-y-1"
            >
              <p className="text-[11px] font-medium text-muted-foreground">{card.label}</p>
              <p
                className={`text-lg font-black ${
                  card.res.visualState === "available"
                    ? "text-foreground"
                    : "text-amber-600 dark:text-amber-400 text-sm"
                }`}
              >
                {card.res.displayText}
              </p>
              {card.res.reason && (
                <p className="text-[10px] text-muted-foreground leading-tight">{card.res.reason}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* BLOCO B + D: PRIORIDADES DE HOJE E PRÓXIMA AÇÃO */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Prioridades de hoje */}
        <section className="xl:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" /> Prioridades de hoje
              </h3>
              <p className="text-xs text-muted-foreground">
                Atrasos, aprovações pendentes, agendamentos próximos e carga da equipe.
              </p>
            </div>
            <Link
              to={"/social-projetos" as any}
              className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
            >
              Ver Projetos <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/8 p-3">
              <span className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                Atrasadas
              </span>
              <p className="text-xl font-black mt-0.5">
                {commandCenter.todayPriorities.overdueTasks.length}
              </p>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3">
              <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                Aguardando aprovação
              </span>
              <p className="text-xl font-black mt-0.5">
                {commandCenter.todayPriorities.awaitingApprovalContent.length}
              </p>
            </div>
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/8 p-3">
              <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                Prazo até 48h
              </span>
              <p className="text-xl font-black mt-0.5">
                {commandCenter.todayPriorities.dueSoonTasks.length}
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 p-3">
              <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                Agendadas (7d)
              </span>
              <p className="text-xl font-black mt-0.5">
                {commandCenter.todayPriorities.scheduledTodayOrSoon.length}
              </p>
            </div>
          </div>

          {/* Lista detalhada de pendências críticas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-rose-500" /> Tarefas urgentes / atrasadas
              </p>
              {commandCenter.todayPriorities.overdueTasks.length === 0 &&
              commandCenter.todayPriorities.dueSoonTasks.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhuma tarefa vencida ou vencendo nas próximas 48h.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {[
                    ...commandCenter.todayPriorities.overdueTasks,
                    ...commandCenter.todayPriorities.dueSoonTasks,
                  ]
                    .slice(0, 5)
                    .map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{task.title}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {task.account_name || "Geral"} • {task.assignee_name || "Sem responsável"}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] font-bold text-rose-500">
                          {formatShortDate(task.due_at)}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-2">
              <p className="text-xs font-bold flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5 text-primary" /> Pendências por responsável
              </p>
              {commandCenter.todayPriorities.pendingByMember.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem tarefas abertas no momento.</p>
              ) : (
                <ul className="space-y-1.5">
                  {commandCenter.todayPriorities.pendingByMember.slice(0, 5).map((m) => (
                    <li
                      key={m.memberName}
                      className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-2.5 py-1.5 text-xs"
                    >
                      <span className="font-medium truncate">{m.memberName}</span>
                      <div className="flex items-center gap-2 shrink-0 text-[11px]">
                        <span className="font-semibold">{m.openCount} abertas</span>
                        {m.overdueCount > 0 && (
                          <span className="text-rose-500 font-bold">({m.overdueCount} atras.)</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Próxima Ação Recomendada */}
        <section className="rounded-2xl border border-primary/25 bg-card p-5 shadow-sm flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Próxima ação recomendada
            </span>
            {commandCenter.nextRecommendedAction ? (
              <>
                <h3 className="text-sm font-black text-foreground">
                  {commandCenter.nextRecommendedAction.title}
                </h3>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Evidência:</strong>{" "}
                  {commandCenter.nextRecommendedAction.evidence}
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground">Leitura:</strong>{" "}
                  {commandCenter.nextRecommendedAction.explanation}
                </p>
              </>
            ) : (
              <>
                <h3 className="text-sm font-black text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" /> Rotina sob controle
                </h3>
                <p className="text-xs text-muted-foreground">
                  Sem bloqueios críticos hoje. Aproveite para revisar o banco de aprendizados ou planejar próximos roteiros.
                </p>
              </>
            )}
          </div>

          {commandCenter.nextRecommendedAction && (
            <div className="flex flex-col gap-2 pt-2 border-t border-border/70">
              <Link
                to={commandCenter.nextRecommendedAction.targetRoute as any}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                {commandCenter.nextRecommendedAction.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              {canEditSocial && (
                <button
                  type="button"
                  onClick={() => handleCreateTaskFromRec(commandCenter.nextRecommendedAction!)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted"
                >
                  <Plus className="h-3.5 w-3.5" /> Transformar em tarefa
                </button>
              )}
            </div>
          )}
        </section>
      </div>

      {/* BLOCO C: CONTEÚDO DA SEMANA */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Conteúdo da semana & fluxo de produção
            </h3>
            <p className="text-xs text-muted-foreground">{commandCenter.weekSummary.cadenceNote}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={"/social-conteudo" as any}
              className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
            >
              Ideias & Roteiros
            </Link>
            <Link
              to="/social"
              className="rounded-xl bg-primary/10 text-primary px-3 py-1.5 text-xs font-semibold hover:bg-primary/20"
            >
              Planejador & Feed
            </Link>
          </div>
        </div>

        {/* Mini Calendário 7 dias */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {commandCenter.weekSummary.days.map((day) => (
            <div
              key={day.dateIso}
              className="rounded-xl border border-border/80 bg-background/60 p-2.5 space-y-1.5"
            >
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="uppercase text-muted-foreground">{day.weekdayLabel}</span>
                <span>{day.dateIso.slice(8, 10)}/{day.dateIso.slice(5, 7)}</span>
              </div>
              {day.itemsSummary.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">Sem programação</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {day.itemsSummary.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Contagem nos 8 estágios */}
        <div className="flex flex-wrap gap-2 pt-1">
          {CONTENT_PIPELINE_STAGES.map((st) => (
            <div
              key={st.id}
              className="flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/50 px-2.5 py-1 text-xs"
            >
              <span className="text-muted-foreground">{st.shortLabel}:</span>
              <span className="font-black text-foreground">
                {commandCenter.weekSummary.stageCounts[st.id] || 0}
              </span>
            </div>
          ))}
        </div>

        {commandCenter.weekSummary.pillarGaps.length > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span>
              <strong>Pilares definidos nesta conta sem conteúdo ativo:</strong>{" "}
              {commandCenter.weekSummary.pillarGaps.join(", ")}.
            </span>
          </div>
        )}
      </section>

      {/* BLOCO D: SINAIS DE DESEMPENHO & RECOMENDAÇÕES */}
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Sinais de desempenho & aprendizados acionáveis
            </h3>
            <p className="text-xs text-muted-foreground">
              {commandCenter.performanceSignals.coverageText}
            </p>
          </div>
          <Link
            to="/social-audit"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            Abrir Auditoria Orgânica <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {commandCenter.performanceSignals.limitations.length > 0 && (
          <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground space-y-1">
            {commandCenter.performanceSignals.limitations.map((lim, i) => (
              <p key={i}>• {lim}</p>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Publicações que sustentam os sinais */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-foreground">
              Publicações de referência vs própria mediana
            </p>
            {commandCenter.performanceSignals.highlights.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-background/50 p-4 text-xs text-muted-foreground">
                Aguardando amostra suficiente de publicações da conta selecionada para comparar acima/abaixo da mediana histórica.
              </div>
            ) : (
              commandCenter.performanceSignals.highlights.map((hl) => (
                <div
                  key={hl.postId}
                  className="rounded-xl border border-border/80 bg-background/60 p-3 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {hl.direction === "above_baseline" ? (
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <TrendingDown className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                      )}
                      <span className="text-xs font-bold">{hl.relativeScoreLabel}</span>
                      <span className="text-[10px] text-muted-foreground uppercase">
                        • {hl.platform}
                      </span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2">{hl.captionExcerpt}</p>
                    <p className="text-[11px] text-muted-foreground">{hl.metricSummary}</p>
                  </div>
                  {hl.permalink && (
                    <a
                      href={hl.permalink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                    >
                      Abrir post <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Recomendações executáveis */}
          <div className="space-y-2.5">
            <p className="text-xs font-bold text-foreground">Recomendações com evidência e ação</p>
            {commandCenter.performanceSignals.recommendations.length === 0 ? (
              <div className="rounded-xl border border-border/70 bg-background/50 p-4 text-xs text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-muted-foreground" />
                Nenhuma recomendação pendente para este recorte.
              </div>
            ) : (
              commandCenter.performanceSignals.recommendations.slice(0, 4).map((rec) => (
                <div
                  key={rec.id}
                  className="rounded-xl border border-border/80 bg-background/60 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-bold text-foreground">{rec.title}</p>
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary shrink-0">
                      {rec.priority}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">{rec.evidence}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link
                      to={rec.targetRoute as any}
                      className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
                    >
                      {rec.actionLabel} <ArrowRight className="h-3 w-3" />
                    </Link>
                    {canEditSocial && (
                      <button
                        type="button"
                        onClick={() => handleCreateTaskFromRec(rec)}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold hover:bg-muted"
                      >
                        <ShieldAlert className="h-3 w-3 text-primary" /> Criar tarefa
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
