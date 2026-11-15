import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import {
  type AiScriptGenerationInput,
  type AiStructuredScriptDraft,
  type ContentCommentEntry,
  type ContentPipelineStage,
  type ProjectTaskStatus,
  type SocialAccountStrategy,
  type SocialContentItem,
  type SocialExperiment,
  type SocialLearningRecord,
  type SocialProjectTask,
  appendContentHistory,
  buildEmptyAccountStrategy,
  synthesizeStructuredScript,
} from "@/lib/socialStrategyDomain";

const sb = supabase as any;

export interface TeamMemberOption {
  id: string;
  full_name: string;
  role: string;
  position: string | null;
  email: string | null;
  status: string | null;
}

export interface ClientOption {
  id: string;
  name: string;
  niche: string | null;
  hero_product: string | null;
}

function asStringArray(val: unknown): string[] {
  if (!Array.isArray(val)) return [];
  return val.map((v) => String(v ?? "").trim()).filter(Boolean);
}

function asArray<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

function normalizeStrategyRow(row: any, accountNameFallback = ""): SocialAccountStrategy {
  return {
    id: row.id,
    page_id: String(row.page_id),
    client_id: row.client_id ?? null,
    account_name: String(row.account_name || accountNameFallback || ""),
    is_automotive: Boolean(row.is_automotive),
    primary_objective: String(row.primary_objective || ""),
    secondary_objectives: asStringArray(row.secondary_objectives),
    target_audience: String(row.target_audience || ""),
    audience_segments: asStringArray(row.audience_segments),
    positioning: String(row.positioning || ""),
    differentials: asStringArray(row.differentials),
    tone_of_voice: String(row.tone_of_voice || ""),
    language_guidelines: String(row.language_guidelines || ""),
    editorial_pillars: asStringArray(row.editorial_pillars),
    confirmed_offers: asStringArray(row.confirmed_offers),
    forbidden_claims: String(row.forbidden_claims || ""),
    restrictions: String(row.restrictions || ""),
    competitors: asArray(row.competitors),
    seasonality: asArray(row.seasonality),
    ctas_by_objective: asArray(row.ctas_by_objective),
    updated_at: row.updated_at ?? null,
  };
}

function normalizeContentRow(row: any): SocialContentItem {
  return {
    id: row.id,
    page_id: String(row.page_id),
    client_id: row.client_id ?? null,
    account_name: String(row.account_name || ""),
    title: String(row.title || ""),
    stage: (row.stage || "idea") as ContentPipelineStage,
    format: String(row.format || "Reels"),
    platform: (row.platform || "instagram") as "instagram" | "facebook" | "both",
    objective: String(row.objective || ""),
    editorial_pillar: String(row.editorial_pillar || ""),
    audience_segment: String(row.audience_segment || ""),
    origin_insight: String(row.origin_insight || ""),
    hypothesis: String(row.hypothesis || ""),
    priority: (row.priority || "media") as SocialContentItem["priority"],
    effort: (row.effort || "medio") as SocialContentItem["effort"],
    hook_variations: asStringArray(row.hook_variations),
    script_scenes: asArray(row.script_scenes),
    shot_list: asStringArray(row.shot_list),
    on_screen_text: String(row.on_screen_text || ""),
    caption: String(row.caption || ""),
    cta: String(row.cta || ""),
    cover_suggestion: String(row.cover_suggestion || ""),
    brief_notes: String(row.brief_notes || ""),
    related_materials: asStringArray(row.related_materials),
    ai_grounding: row.ai_grounding ?? null,
    assignee_id: row.assignee_id ?? null,
    assignee_name: String(row.assignee_name || ""),
    approver_id: row.approver_id ?? null,
    approver_name: String(row.approver_name || ""),
    due_at: row.due_at ?? null,
    scheduled_at: row.scheduled_at ?? null,
    published_url: row.published_url ?? null,
    planner_post_id: row.planner_post_id ?? null,
    meta_post_id: row.meta_post_id ?? null,
    comments: asArray<ContentCommentEntry>(row.comments),
    history: asArray(row.history),
    created_by: row.created_by ?? null,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

function normalizeExperimentRow(row: any): SocialExperiment {
  return {
    id: row.id,
    page_id: String(row.page_id),
    client_id: row.client_id ?? null,
    account_name: String(row.account_name || ""),
    title: String(row.title || ""),
    hypothesis: String(row.hypothesis || ""),
    primary_variable: String(row.primary_variable || ""),
    variants: asStringArray(row.variants),
    audience_context: String(row.audience_context || ""),
    format: String(row.format || "Reels"),
    objective: String(row.objective || ""),
    primary_metric: String(row.primary_metric || "engagement_rate"),
    window_start: row.window_start ?? null,
    window_end: row.window_end ?? null,
    closure_criteria: String(row.closure_criteria || ""),
    status: row.status || "planned",
    is_manual_meta_native: Boolean(row.is_manual_meta_native),
    sample_count: Number(row.sample_count || 0),
    observed_result_summary: String(row.observed_result_summary || ""),
    sample_notes: String(row.sample_notes || ""),
    conclusion_status: row.conclusion_status || "pending",
    learning_notes: String(row.learning_notes || ""),
    next_action: String(row.next_action || ""),
    linked_content_ids: asStringArray(row.linked_content_ids),
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

function normalizeLearningRow(row: any): SocialLearningRecord {
  return {
    id: row.id,
    page_id: String(row.page_id),
    client_id: row.client_id ?? null,
    account_name: String(row.account_name || ""),
    title: String(row.title || ""),
    category: String(row.category || "conteudo"),
    observation: String(row.observation || ""),
    evidence_summary: String(row.evidence_summary || ""),
    evidence_post_ids: asStringArray(row.evidence_post_ids),
    period_label: String(row.period_label || ""),
    sample_coverage: String(row.sample_coverage || ""),
    ai_generated: Boolean(row.ai_generated),
    validation_status: row.validation_status || "pending",
    human_correction: row.human_correction ?? null,
    actionable_next_step: String(row.actionable_next_step || ""),
    linked_experiment_id: row.linked_experiment_id ?? null,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

function normalizeTaskRow(row: any): SocialProjectTask {
  return {
    id: row.id,
    page_id: row.page_id ? String(row.page_id) : null,
    client_id: row.client_id ?? null,
    account_name: String(row.account_name || ""),
    title: String(row.title || ""),
    description: String(row.description || ""),
    task_type: String(row.task_type || "producao"),
    priority: row.priority || "media",
    status: (row.status || "todo") as ProjectTaskStatus,
    assignee_id: row.assignee_id ?? null,
    assignee_name: String(row.assignee_name || ""),
    due_at: row.due_at ?? null,
    recurrence_rule: row.recurrence_rule ?? null,
    source_type: row.source_type || "manual",
    source_id: row.source_id ?? null,
    linked_content_id: row.linked_content_id ?? null,
    linked_post_id: row.linked_post_id ?? null,
    linked_experiment_id: row.linked_experiment_id ?? null,
    tags: asStringArray(row.tags),
    history: asArray(row.history),
    created_by: row.created_by ?? null,
    created_at: String(row.created_at || new Date().toISOString()),
    updated_at: String(row.updated_at || new Date().toISOString()),
  };
}

export async function notifyAssignedMember(params: {
  assigneeId?: string | null;
  title: string;
  message: string;
  link?: string;
}): Promise<void> {
  if (!params.assigneeId) return;
  try {
    await sb.from("notifications").insert({
      user_id: params.assigneeId,
      title: params.title,
      message: params.message,
      type: "social_task",
      is_read: false,
      link: params.link || "/social-projetos",
      metadata: { module: "social_hub" },
    });
  } catch {
    // non-blocking notification delivery
  }
}

export function useSocialTeamMembersQuery(tenantId?: string | null) {
  return useQuery({
    queryKey: ["social-hub", "team-members", tenantId || "default"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<TeamMemberOption[]> => {
      const { data, error } = await sb
        .from("profiles")
        .select("id, full_name, role, position, email, status")
        .neq("role", "client_store")
        .order("full_name");
      if (error) throw error;
      return (data || []) as TeamMemberOption[];
    },
  });
}

export function useSocialClientsQuery(tenantId?: string | null) {
  return useQuery({
    queryKey: ["social-hub", "clients", tenantId || "default"],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await sb
        .from("clients")
        .select("id, name, niche, hero_product")
        .order("name");
      if (error) throw error;
      return (data || []) as ClientOption[];
    },
  });
}

// ---------- ESTRATÉGIA ----------

export function useSocialStrategiesMapQuery(tenantId?: string | null) {
  return useQuery({
    queryKey: ["social-hub", "strategies-all", tenantId || "default"],
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SocialAccountStrategy[]> => {
      const { data, error } = await sb
        .from("social_account_strategies")
        .select("*")
        .order("account_name");
      if (error) throw error;
      return (data || []).map((r: any) => normalizeStrategyRow(r));
    },
  });
}

export function useSocialAccountStrategyQuery(params: {
  tenantId?: string | null;
  pageId: string;
  accountName: string;
}) {
  return useQuery({
    queryKey: ["social-hub", "strategy", params.tenantId || "default", params.pageId],
    enabled: Boolean(params.pageId && params.pageId !== "all"),
    staleTime: 60 * 1000,
    queryFn: async (): Promise<SocialAccountStrategy> => {
      const { data, error } = await sb
        .from("social_account_strategies")
        .select("*")
        .eq("page_id", params.pageId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return buildEmptyAccountStrategy({ page_id: params.pageId, page_name: params.accountName });
      }
      return normalizeStrategyRow(data, params.accountName);
    },
  });
}

export function useUpsertSocialStrategyMutation(tenantId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (strategy: SocialAccountStrategy): Promise<SocialAccountStrategy> => {
      const { data: userData } = await supabase.auth.getUser();
      const payload = {
        page_id: strategy.page_id,
        client_id: strategy.client_id ?? null,
        account_name: strategy.account_name,
        is_automotive: strategy.is_automotive,
        primary_objective: strategy.primary_objective.trim(),
        secondary_objectives: strategy.secondary_objectives,
        target_audience: strategy.target_audience.trim(),
        audience_segments: strategy.audience_segments,
        positioning: strategy.positioning.trim(),
        differentials: strategy.differentials,
        tone_of_voice: strategy.tone_of_voice.trim(),
        language_guidelines: strategy.language_guidelines.trim(),
        editorial_pillars: strategy.editorial_pillars,
        confirmed_offers: strategy.confirmed_offers,
        forbidden_claims: strategy.forbidden_claims.trim(),
        restrictions: strategy.restrictions.trim(),
        competitors: strategy.competitors,
        seasonality: strategy.seasonality,
        ctas_by_objective: strategy.ctas_by_objective,
        updated_by: userData?.user?.id ?? null,
      };
      const { data, error } = await sb
        .from("social_account_strategies")
        .upsert(payload, { onConflict: "page_id" })
        .select("*")
        .single();
      if (error) throw error;
      return normalizeStrategyRow(data, strategy.account_name);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["social-hub", "strategy", tenantId || "default", saved.page_id] });
      qc.invalidateQueries({ queryKey: ["social-hub", "strategies-all"] });
    },
  });
}

// ---------- CONTEÚDO (IDEIAS, ROTEIROS & APROVAÇÃO) ----------

export function useSocialContentItemsQuery(params: {
  tenantId?: string | null;
  pageId: string;
}) {
  return useQuery({
    queryKey: ["social-hub", "content-items", params.tenantId || "default", params.pageId],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SocialContentItem[]> => {
      let query = sb.from("social_content_items").select("*").order("updated_at", { ascending: false });
      if (params.pageId && params.pageId !== "all") {
        query = query.eq("page_id", params.pageId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeContentRow);
    },
  });
}

export function useSaveSocialContentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      item: Partial<SocialContentItem> & {
        id?: string;
        page_id: string;
        account_name: string;
        title: string;
        actorName?: string;
        historyAction?: string;
        fromStage?: ContentPipelineStage | null;
      }
    ): Promise<SocialContentItem> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const nextHistory = item.historyAction
        ? appendContentHistory(item.history || [], {
            actorName: item.actorName || "Equipe",
            actorId: userId,
            action: item.historyAction,
            fromStage: item.fromStage ?? null,
            toStage: item.stage ?? null,
          })
        : item.history || [];

      const payload: Record<string, any> = {
        page_id: item.page_id,
        client_id: item.client_id ?? null,
        account_name: item.account_name,
        title: item.title.trim(),
        stage: item.stage || "idea",
        format: item.format || "Reels",
        platform: item.platform || "instagram",
        objective: item.objective || "",
        editorial_pillar: item.editorial_pillar || "",
        audience_segment: item.audience_segment || "",
        origin_insight: item.origin_insight || "",
        hypothesis: item.hypothesis || "",
        priority: item.priority || "media",
        effort: item.effort || "medio",
        hook_variations: item.hook_variations || [],
        script_scenes: item.script_scenes || [],
        shot_list: item.shot_list || [],
        on_screen_text: item.on_screen_text || "",
        caption: item.caption || "",
        cta: item.cta || "",
        cover_suggestion: item.cover_suggestion || "",
        brief_notes: item.brief_notes || "",
        related_materials: item.related_materials || [],
        ai_grounding: item.ai_grounding ?? null,
        assignee_id: item.assignee_id ?? null,
        assignee_name: item.assignee_name || "",
        approver_id: item.approver_id ?? null,
        approver_name: item.approver_name || "",
        due_at: item.due_at ?? null,
        scheduled_at: item.scheduled_at ?? null,
        published_url: item.published_url ?? null,
        planner_post_id: item.planner_post_id ?? null,
        meta_post_id: item.meta_post_id ?? null,
        comments: item.comments || [],
        history: nextHistory,
      };

      let result;
      if (item.id) {
        const { data, error } = await sb
          .from("social_content_items")
          .update(payload)
          .eq("id", item.id)
          .select("*")
          .single();
        if (error) throw error;
        result = normalizeContentRow(data);
      } else {
        payload.created_by = userId;
        const { data, error } = await sb
          .from("social_content_items")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        result = normalizeContentRow(data);
      }

      if (result.stage === "internal_review" || result.stage === "client_approval") {
        await notifyAssignedMember({
          assigneeId: result.approver_id || result.assignee_id,
          title: `Aprovação Social pendente: ${result.title}`,
          message: `${result.account_name} moveu "${result.title}" para ${result.stage === "client_approval" ? "Aprovação do cliente" : "Revisão interna"}.`,
          link: "/social-conteudo",
        });
      }

      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "content-items"] });
    },
  });
}

export function useDeleteSocialContentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("social_content_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "content-items"] });
    },
  });
}

// ---------- PROJETOS / TAREFAS ----------

export function useSocialProjectTasksQuery(params: {
  tenantId?: string | null;
  pageId: string;
}) {
  return useQuery({
    queryKey: ["social-hub", "project-tasks", params.tenantId || "default", params.pageId],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SocialProjectTask[]> => {
      let query = sb
        .from("social_project_tasks")
        .select("*")
        .order("due_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (params.pageId && params.pageId !== "all") {
        query = query.eq("page_id", params.pageId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeTaskRow);
    },
  });
}

export function useSaveSocialTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      task: Partial<SocialProjectTask> & { id?: string; title: string; actorName?: string; changeLabel?: string }
    ): Promise<SocialProjectTask> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const history = task.changeLabel
        ? [
            { at: new Date().toISOString(), actorName: task.actorName || "Equipe", change: task.changeLabel },
            ...(task.history || []),
          ].slice(0, 40)
        : task.history || [];

      const payload: Record<string, any> = {
        page_id: task.page_id && task.page_id !== "all" ? task.page_id : null,
        client_id: task.client_id ?? null,
        account_name: task.account_name || "",
        title: task.title.trim(),
        description: task.description || "",
        task_type: task.task_type || "producao",
        priority: task.priority || "media",
        status: task.status || "todo",
        assignee_id: task.assignee_id ?? null,
        assignee_name: task.assignee_name || "",
        due_at: task.due_at ?? null,
        recurrence_rule: task.recurrence_rule ?? null,
        source_type: task.source_type || "manual",
        source_id: task.source_id ?? null,
        linked_content_id: task.linked_content_id ?? null,
        linked_post_id: task.linked_post_id ?? null,
        linked_experiment_id: task.linked_experiment_id ?? null,
        tags: task.tags || [],
        history,
      };

      let saved: SocialProjectTask;
      if (task.id) {
        const { data, error } = await sb
          .from("social_project_tasks")
          .update(payload)
          .eq("id", task.id)
          .select("*")
          .single();
        if (error) throw error;
        saved = normalizeTaskRow(data);
      } else {
        payload.created_by = userId;
        const { data, error } = await sb
          .from("social_project_tasks")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        saved = normalizeTaskRow(data);

        if (saved.assignee_id) {
          await notifyAssignedMember({
            assigneeId: saved.assignee_id,
            title: `Nova tarefa Social: ${saved.title}`,
            message: `${saved.account_name || "Hub Social"} • Prioridade ${saved.priority}`,
            link: "/social-projetos",
          });
        }
      }
      return saved;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "project-tasks"] });
    },
  });
}

export function useDeleteSocialTaskMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("social_project_tasks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "project-tasks"] });
    },
  });
}

// ---------- TESTES & APRENDIZADOS ----------

export function useSocialExperimentsQuery(params: { tenantId?: string | null; pageId: string }) {
  return useQuery({
    queryKey: ["social-hub", "experiments", params.tenantId || "default", params.pageId],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SocialExperiment[]> => {
      let query = sb.from("social_experiments").select("*").order("updated_at", { ascending: false });
      if (params.pageId && params.pageId !== "all") {
        query = query.eq("page_id", params.pageId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeExperimentRow);
    },
  });
}

export function useSaveSocialExperimentMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      exp: Partial<SocialExperiment> & { id?: string; page_id: string; account_name: string; title: string; hypothesis: string; primary_variable: string }
    ): Promise<SocialExperiment> => {
      const { data: userData } = await supabase.auth.getUser();
      const payload: Record<string, any> = {
        page_id: exp.page_id,
        client_id: exp.client_id ?? null,
        account_name: exp.account_name,
        title: exp.title.trim(),
        hypothesis: exp.hypothesis.trim(),
        primary_variable: exp.primary_variable.trim(),
        variants: exp.variants || [],
        audience_context: exp.audience_context || "",
        format: exp.format || "Reels",
        objective: exp.objective || "",
        primary_metric: exp.primary_metric || "engagement_rate",
        window_start: exp.window_start || null,
        window_end: exp.window_end || null,
        closure_criteria: exp.closure_criteria || "",
        status: exp.status || "planned",
        is_manual_meta_native: Boolean(exp.is_manual_meta_native),
        sample_count: Number(exp.sample_count || 0),
        observed_result_summary: exp.observed_result_summary || "",
        sample_notes: exp.sample_notes || "",
        conclusion_status: exp.conclusion_status || "pending",
        learning_notes: exp.learning_notes || "",
        next_action: exp.next_action || "",
        linked_content_ids: exp.linked_content_ids || [],
      };
      if (exp.id) {
        const { data, error } = await sb.from("social_experiments").update(payload).eq("id", exp.id).select("*").single();
        if (error) throw error;
        return normalizeExperimentRow(data);
      }
      payload.created_by = userData?.user?.id ?? null;
      const { data, error } = await sb.from("social_experiments").insert(payload).select("*").single();
      if (error) throw error;
      return normalizeExperimentRow(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "experiments"] });
    },
  });
}

export function useSocialLearningsQuery(params: { tenantId?: string | null; pageId: string }) {
  return useQuery({
    queryKey: ["social-hub", "learnings", params.tenantId || "default", params.pageId],
    staleTime: 30 * 1000,
    queryFn: async (): Promise<SocialLearningRecord[]> => {
      let query = sb.from("social_learnings").select("*").order("created_at", { ascending: false });
      if (params.pageId && params.pageId !== "all") {
        query = query.eq("page_id", params.pageId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).map(normalizeLearningRow);
    },
  });
}

export function useSaveSocialLearningMutation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      item: Partial<SocialLearningRecord> & { id?: string; page_id: string; account_name: string; title: string; observation: string }
    ): Promise<SocialLearningRecord> => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id ?? null;
      const payload: Record<string, any> = {
        page_id: item.page_id,
        client_id: item.client_id ?? null,
        account_name: item.account_name,
        title: item.title.trim(),
        category: item.category || "conteudo",
        observation: item.observation.trim(),
        evidence_summary: item.evidence_summary || "",
        evidence_post_ids: item.evidence_post_ids || [],
        period_label: item.period_label || "",
        sample_coverage: item.sample_coverage || "",
        ai_generated: Boolean(item.ai_generated),
        validation_status: item.validation_status || "pending",
        human_correction: item.human_correction ?? null,
        actionable_next_step: item.actionable_next_step || "",
        linked_experiment_id: item.linked_experiment_id ?? null,
        validated_by: item.validation_status && item.validation_status !== "pending" ? userId : null,
      };
      if (item.id) {
        const { data, error } = await sb.from("social_learnings").update(payload).eq("id", item.id).select("*").single();
        if (error) throw error;
        return normalizeLearningRow(data);
      }
      payload.created_by = userId;
      const { data, error } = await sb.from("social_learnings").insert(payload).select("*").single();
      if (error) throw error;
      return normalizeLearningRow(data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social-hub", "learnings"] });
    },
  });
}

// ---------- GERADOR ESTRUTURADO COM IA (VICTORIA-AGENT + FALLBACK SEGURO) ----------

export async function generateStructuredSocialScript(
  input: AiScriptGenerationInput
): Promise<AiStructuredScriptDraft> {
  const prompt = [
    `Você é o estrategista Social da NC Suite atuando exclusivamente para a conta "${input.account.name}" (${input.account.networkCapability === "fb_only" ? "apenas Facebook" : "Instagram e Facebook"}).`,
    `Nicho automotivo: ${input.account.isAutomotive ? "SIM — REGRA RÍGIDA: NUNCA invente preço, quilometragem, ano/modelo, versão, financiamento, parcela, entrada, disponibilidade de estoque ou garantia. Se não estiver listado nas ofertas confirmadas abaixo, marque como [CONFIRMAR COM A LOJA] e liste em pendingConfirmations." : "NÃO"}`,
    `NUNCA prometa viralização, crescimento garantido ou alcance específico.`,
    `Estratégia confirmada da conta:`,
    `- Objetivo principal: ${input.strategy.primary_objective || "Não informado"}`,
    `- Público prioritário: ${input.strategy.target_audience || input.audienceSegment || "Não informado"}`,
    `- Posicionamento: ${input.strategy.positioning || "Não informado"}`,
    `- Tom de voz: ${input.strategy.tone_of_voice || "Natural e claro"}`,
    `- Ofertas/provas confirmadas: ${input.strategy.confirmed_offers.join("; ") || "Nenhuma oferta específica confirmada"}`,
    `- Proibições/Restrições: ${input.strategy.forbidden_claims || input.strategy.restrictions || "Nenhuma"}`,
    `Dados observados da conta (${input.periodLabel}): ${input.cachedKpisSummary || "Sem resumo numérico adicional no momento"}`,
    `Pauta atual -> Pilar: ${input.pillar} | Objetivo: ${input.objective} | Formato: ${input.format} | Origem/Insight: ${input.originInsight} | Hipótese: ${input.hypothesis}`,
    `Responda APENAS um JSON válido com as chaves:`,
    `{"title":"...","interpretation":"...","creativeHypothesis":"...","hookVariations":["...","...","..."],"scriptScenes":[{"scene":"...","timeRange":"...","visualAction":"...","spokenLine":"...","onScreenText":"..."}],"shotList":["..."],"onScreenText":"...","caption":"...","cta":"...","coverSuggestion":"...","briefNotes":"...","testApproachVariations":["...","..."]}`,
  ].join("\n");

  try {
    const { data, error } = await supabase.functions.invoke("victoria-agent", {
      body: {
        action: "chat",
        mode: "social_caption",
        stream: false,
        readOnly: true,
        message: prompt,
      },
    });
    if (error) throw error;
    const rawText = String(data?.reply || data?.content || data?.text || "");
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return synthesizeStructuredScript(
        input,
        {
          title: parsed.title,
          grounding: {
            factsUsed: [],
            interpretation: parsed.interpretation || "",
            creativeHypothesis: parsed.creativeHypothesis || "",
            generatedAt: new Date().toISOString(),
            generatedByMode: "victoria_ai",
            pendingConfirmations: [],
          },
          hookVariations: Array.isArray(parsed.hookVariations) ? parsed.hookVariations : undefined,
          scriptScenes: Array.isArray(parsed.scriptScenes) ? parsed.scriptScenes : undefined,
          shotList: Array.isArray(parsed.shotList) ? parsed.shotList : undefined,
          onScreenText: parsed.onScreenText,
          caption: parsed.caption,
          cta: parsed.cta,
          coverSuggestion: parsed.coverSuggestion,
          briefNotes: parsed.briefNotes,
          testApproachVariations: Array.isArray(parsed.testApproachVariations)
            ? parsed.testApproachVariations
            : undefined,
        },
        "victoria_ai"
      );
    }
  } catch {
    // Fallback determinístico 100% fundamentado no contexto da conta
  }

  return synthesizeStructuredScript(input, null, "structured_template");
}
