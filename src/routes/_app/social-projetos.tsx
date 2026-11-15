import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock,
  FolderKanban,
  ListChecks,
  Plus,
  Repeat,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SocialHubChrome } from "@/components/social/SocialHubChrome";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import { useSocialAccountsQuery } from "@/hooks/useSocialHubData";
import {
  useDeleteSocialTaskMutation,
  useSaveSocialContentMutation,
  useSaveSocialTaskMutation,
  useSocialContentItemsQuery,
  useSocialProjectTasksQuery,
  useSocialTeamMembersQuery,
} from "@/lib/socialHubService";
import type { ProjectTaskPriority, ProjectTaskStatus } from "@/lib/socialStrategyDomain";

export const Route = createFileRoute("/_app/social-projetos")({
  component: SocialProjectsPage,
});

const STATUS_LABELS: Record<ProjectTaskStatus, string> = {
  todo: "A fazer",
  in_progress: "Em andamento",
  review: "Em revisão",
  waiting_approval: "Aguardando aprovação",
  blocked: "Bloqueada",
  done: "Concluída",
  cancelled: "Cancelada",
};

function SocialProjectsPage() {
  const { user } = useAuth();
  const { canEdit, profile } = usePagePermission();
  const canEditSocial = canEdit("social");
  const tenantId = user?.id ?? null;

  const { selectedPage } = useSocialHubFilters();
  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];
  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;

  const tasksQuery = useSocialProjectTasksQuery({ tenantId, pageId: selectedPage });
  const contentItemsQuery = useSocialContentItemsQuery({ tenantId, pageId: selectedPage });
  const teamMembersQuery = useSocialTeamMembersQuery(tenantId);

  const saveTask = useSaveSocialTaskMutation();
  const deleteTask = useDeleteSocialTaskMutation();
  const saveContent = useSaveSocialContentMutation();

  const [viewMode, setViewMode] = useState<"tasks" | "approvals" | "calendar">("tasks");
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  // Formulário nova tarefa
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<ProjectTaskPriority>("media");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [recurrence, setRecurrence] = useState("");

  const nowMs = Date.now();

  const filteredTasks = useMemo(() => {
    return (tasksQuery.data || []).filter((t) => {
      if (statusFilter === "open" && (t.status === "done" || t.status === "cancelled")) {
        return false;
      }
      if (statusFilter === "overdue") {
        if (!t.due_at || Date.parse(t.due_at) >= nowMs || t.status === "done" || t.status === "cancelled") {
          return false;
        }
      } else if (statusFilter !== "all" && statusFilter !== "open" && t.status !== statusFilter) {
        return false;
      }
      if (assigneeFilter !== "all" && t.assignee_id !== assigneeFilter) {
        return false;
      }
      return true;
    });
  }, [tasksQuery.data, statusFilter, assigneeFilter, nowMs]);

  const approvalQueue = useMemo(
    () =>
      (contentItemsQuery.data || []).filter(
        (c) => c.stage === "internal_review" || c.stage === "client_approval"
      ),
    [contentItemsQuery.data]
  );

  const calendarGroups = useMemo(() => {
    const groups = new Map<string, Array<{ kind: "task" | "approval"; title: string; subtitle: string; badge: string }>>();
    for (const t of filteredTasks) {
      const key = t.due_at ? t.due_at.slice(0, 10) : "Sem data";
      const list = groups.get(key) || [];
      list.push({
        kind: "task",
        title: t.title,
        subtitle: `${t.account_name || "Geral"} • ${t.assignee_name || "Sem responsável"}`,
        badge: STATUS_LABELS[t.status],
      });
      groups.set(key, list);
    }
    for (const c of approvalQueue) {
      const key = (c.due_at || c.scheduled_at || "").slice(0, 10) || "Sem data";
      const list = groups.get(key) || [];
      list.push({
        kind: "approval",
        title: `Aprovar: ${c.title}`,
        subtitle: `${c.account_name} • ${c.format}`,
        badge: c.stage === "client_approval" ? "Aprovação cliente" : "Revisão interna",
      });
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredTasks, approvalQueue]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSocial || !title.trim()) return;
    const member = (teamMembersQuery.data || []).find((m) => m.id === assigneeId);
    try {
      await saveTask.mutateAsync({
        page_id: selectedPage === "all" ? null : selectedPage,
        account_name: selectedAccount?.page_name || "Todas as Contas",
        title: title.trim(),
        description,
        priority,
        status: "todo",
        assignee_id: member?.id || null,
        assignee_name: member?.full_name || "",
        due_at: dueDate ? new Date(`${dueDate}T18:00:00`).toISOString() : null,
        recurrence_rule: recurrence || null,
        source_type: "manual",
        actorName: profile?.full_name || "Equipe",
        changeLabel: "Tarefa criada no módulo Projetos Social",
      });
      toast.success("Tarefa criada.");
      setTitle("");
      setDescription("");
      setDueDate("");
      setRecurrence("");
      setShowNew(false);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar tarefa.");
    }
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <PageHeader
        eyebrow="Social Hub"
        title="Projetos & Operação Social"
        description="Tarefas vinculadas a contas, responsáveis, aprovações pendentes, recorrências e calendário operacional."
      />

      <SocialHubChrome
        tenantId={tenantId}
        rightSlot={
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setViewMode("tasks")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${
                viewMode === "tasks"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <ListChecks className="h-3.5 w-3.5" /> Tarefas ({filteredTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("approvals")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${
                viewMode === "approvals"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <FolderKanban className="h-3.5 w-3.5" /> Aprovações ({approvalQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold inline-flex items-center gap-1 ${
                viewMode === "calendar"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Calendário
            </button>
            {canEditSocial && (
              <button
                type="button"
                onClick={() => setShowNew((v) => !v)}
                className="rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 inline-flex items-center gap-1"
              >
                <Plus className="h-3.5 w-3.5" /> Nova tarefa
              </button>
            )}
          </div>
        }
      />

      {showNew && canEditSocial && (
        <form
          onSubmit={handleCreateTask}
          className="rounded-2xl border border-primary/30 bg-card p-5 space-y-3 shadow-sm"
        >
          <h3 className="text-sm font-black">
            Nova Tarefa — {selectedAccount?.page_name || "Escopo Geral Social"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="O que precisa ser feito *"
              className="h-9 rounded-xl border border-border bg-background px-3 text-xs"
              required
            />
            <select
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
            >
              <option value="">Selecionar responsável...</option>
              {(teamMembersQuery.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name} ({m.role})
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Contexto, link de referência ou critério de entrega"
            className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
          />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
            >
              <option value="baixa">Prioridade Baixa</option>
              <option value="media">Prioridade Média</option>
              <option value="alta">Prioridade Alta</option>
              <option value="urgente">Urgente</option>
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
            />
            <select
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value)}
              className="h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
            >
              <option value="">Sem recorrência</option>
              <option value="semanal">Recorrente: Semanal</option>
              <option value="quinzenal">Recorrente: Quinzenal</option>
              <option value="mensal">Recorrente: Mensal</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowNew(false)}
              className="h-9 rounded-xl border border-border px-3 text-xs font-semibold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveTask.isPending}
              className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground"
            >
              Criar tarefa
            </button>
          </div>
        </form>
      )}

      {/* Filtros de Tarefas */}
      {viewMode !== "approvals" && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold"
          >
            <option value="open">Abertas</option>
            <option value="overdue">Somente atrasadas</option>
            <option value="all">Todos os status</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="h-8 rounded-xl border border-border bg-card px-2.5 text-xs font-semibold"
            >
              <option value="all">Todos os responsáveis</option>
              {(teamMembersQuery.data || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {viewMode === "tasks" ? (
        <div className="space-y-2.5">
          {filteredTasks.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
              <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto" />
              <p className="text-sm font-bold">Nenhuma tarefa encontrada neste filtro</p>
              <p className="text-xs text-muted-foreground">
                Você pode criar tarefas manualmente acima ou gerar tarefas em 1 clique a partir de Conteúdo e Sinais da Visão Geral.
              </p>
            </div>
          ) : (
            filteredTasks.map((task) => {
              const isOverdue =
                task.due_at &&
                Date.parse(task.due_at) < nowMs &&
                task.status !== "done" &&
                task.status !== "cancelled";
              return (
                <div
                  key={task.id}
                  className={`rounded-2xl border p-4 bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isOverdue ? "border-rose-500/40" : "border-border"
                  }`}
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase text-primary">
                        {task.priority}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {task.account_name || "Geral"}
                      </span>
                      {task.recurrence_rule && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold">
                          <Repeat className="h-3 w-3" /> {task.recurrence_rule}
                        </span>
                      )}
                      {isOverdue && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-500">
                          <AlertCircle className="h-3 w-3" /> Atrasada
                        </span>
                      )}
                    </div>
                    <h4 className="text-sm font-bold">{task.title}</h4>
                    {task.description && (
                      <p className="text-xs text-muted-foreground whitespace-pre-line line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground flex items-center gap-2">
                      <span>Responsável: {task.assignee_name || "A definir"}</span>
                      {task.due_at && (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(task.due_at).toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      disabled={!canEditSocial || saveTask.isPending}
                      value={task.status}
                      onChange={async (e) => {
                        await saveTask.mutateAsync({
                          ...task,
                          status: e.target.value as ProjectTaskStatus,
                          actorName: profile?.full_name || "Equipe",
                          changeLabel: `Status alterado para ${STATUS_LABELS[e.target.value as ProjectTaskStatus]}`,
                        });
                        toast.success("Status atualizado.");
                      }}
                      className="h-8 rounded-xl border border-border bg-background px-2.5 text-xs font-semibold"
                    >
                      {Object.entries(STATUS_LABELS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    {canEditSocial && (
                      <button
                        type="button"
                        onClick={() => deleteTask.mutateAsync(task.id)}
                        className="h-8 w-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-rose-500"
                        title="Excluir tarefa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      ) : viewMode === "approvals" ? (
        <div className="space-y-2.5">
          {approvalQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
              Nenhum conteúdo aguardando revisão interna ou aprovação do cliente neste filtro.
            </div>
          ) : (
            approvalQueue.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-primary">
                    {item.account_name} •{" "}
                    {item.stage === "client_approval" ? "Aprovação do cliente" : "Revisão interna"}
                  </span>
                  <h4 className="text-sm font-bold">{item.title}</h4>
                  <p className="text-xs text-muted-foreground">
                    Formato: {item.format} • Aprovador: {item.approver_name || "A definir"}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={"/social-conteudo" as any}
                    className="rounded-xl border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Abrir roteiro
                  </Link>
                  {canEditSocial && (
                    <button
                      type="button"
                      onClick={async () => {
                        const nextStage =
                          item.stage === "internal_review" ? "client_approval" : "scheduled";
                        await saveContent.mutateAsync({
                          ...item,
                          stage: nextStage,
                          actorName: profile?.full_name || "Equipe",
                          historyAction: `Aprovado via aba Projetos -> ${nextStage}`,
                          fromStage: item.stage,
                        });
                        toast.success("Conteúdo avançado na fila.");
                      }}
                      className="rounded-xl bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      {item.stage === "internal_review" ? "Enviar p/ Cliente" : "Aprovar p/ Agendamento"}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* CALENDÁRIO OPERACIONAL */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {calendarGroups.length === 0 ? (
            <div className="md:col-span-2 lg:col-span-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center text-xs text-muted-foreground">
              Nenhum prazo operacional ou aprovação agendada neste escopo.
            </div>
          ) : (
            calendarGroups.map(([dateKey, entries]) => (
              <div key={dateKey} className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="text-xs font-black">
                    {dateKey === "Sem data"
                      ? "Sem data definida"
                      : new Date(`${dateKey}T12:00:00`).toLocaleDateString("pt-BR", {
                          weekday: "short",
                          day: "2-digit",
                          month: "2-digit",
                        })}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{entries.length} item(ns)</span>
                </div>
                <ul className="space-y-1.5">
                  {entries.map((entry, idx) => (
                    <li key={idx} className="rounded-xl border border-border/70 bg-background/60 p-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold truncate">{entry.title}</span>
                        <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {entry.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{entry.subtitle}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
