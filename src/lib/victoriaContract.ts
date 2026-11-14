import {
  classifyMetaEvent,
  computeUnitCost,
  emptyMetricVector,
  accumulateMetricVector,
  type MetaConversionCategory,
  type MetricVector,
} from "./metricsDomain.ts";

export const VICTORIA_CONTRACT_VERSION = "2026.11.4";
export const VICTORIA_PROMPT_VERSION = "2026.11.4-senior-10part";
export const VICTORIA_BUILD_TAG = "2026.11.4-e2e";
export const VICTORIA_DEFAULT_ANALYTICAL_MODEL = "gemini-2.5-flash";
export const VICTORIA_ANALYTICAL_TEMPERATURE = 0.2;
export const VICTORIA_CREATIVE_TEMPERATURE = 0.65;
export const VICTORIA_REQUEST_TIMEOUT_MS = 20000;
export const VICTORIA_DEFAULT_OPERATIONAL_MODE = "READ_ONLY_ANALYSIS" as const;
export type VictoriaOperationalMode = "READ_ONLY_ANALYSIS" | "ACTION_PROPOSAL";

export type VictoriaSurfaceId =
  | "metricas"
  | "command_center"
  | "cockpit"
  | "relatorios"
  | "criativos"
  | "auditoria"
  | "social_media"
  | "gestao"
  | "regras"
  | "strategy_map"
  | "notificacoes"
  | "victoria_hub"
  | "floating_chat"
  | "sidebar";

export type VictoriaEntityLevel =
  | "account"
  | "campaign"
  | "adset"
  | "ad"
  | "post"
  | "page"
  | "report"
  | "client"
  | "rule"
  | "funnel";

export type VictoriaConfidenceLevel = "baixa" | "media" | "alta";

export type RagEvidenceLevel =
  | "OFFICIAL_DOC"
  | "INTERNAL_RULE"
  | "CASE_STUDY"
  | "MARKET_NEWS"
  | "OPINION"
  | "UNVERIFIED";

export type RagApprovalStatus =
  | "APPROVED"
  | "PENDING_REVIEW"
  | "REJECTED"
  | "ARCHIVED";

export interface CuratedRagDocument {
  id: string;
  title: string;
  author: string;
  source: string;
  url: string | null;
  canonical_url?: string | null;
  published_at: string | null;
  ingested_at: string;
  valid_until: string | null;
  category: string;
  region: string;
  objective: string;
  evidence_level: RagEvidenceLevel;
  version: string;
  approval_status: RagApprovalStatus;
  similarity?: number;
  content: string;
  semantic_hash?: string;
  rejection_reason?: string | null;
}

export interface CanonicalMetricSpec {
  category: MetaConversionCategory;
  code: string;
  odax_objectives: string[];
  optimization_goals: string[];
  official_event: string;
  label_singular: string;
  label_plural: string;
  cost_label: string;
  short_badge: string;
  unit: string;
  denominator_field: "conversions" | "reach" | "link_clicks" | "impressions";
  multiplier: 1 | 1000;
  formula_description: string;
  attribution_window: string;
  primary_kpis: string[];
  secondary_kpis: string[];
  allowed_comparable_metrics: string[];
  forbidden_labels: string[];
}

export const CANONICAL_METRIC_REGISTRY: Record<MetaConversionCategory, CanonicalMetricSpec> = {
  MESSAGES: {
    category: "MESSAGES",
    code: "onsite_conversion.messaging_conversation_started_7d",
    odax_objectives: ["OUTCOME_ENGAGEMENT", "MESSAGES", "OUTCOME_LEADS"],
    optimization_goals: ["CONVERSATIONS", "MESSAGING_CONVERSATION_STARTED_7D", "REPLIES"],
    official_event: "actions:onsite_conversion.messaging_conversation_started_7d",
    label_singular: "conversa iniciada",
    label_plural: "conversas iniciadas",
    cost_label: "Custo por conversa",
    short_badge: "MSG",
    unit: "BRL/conversa",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / conversas_iniciadas",
    attribution_window: "7d_click / 1d_view (Meta Messaging)",
    primary_kpis: ["conversas iniciadas", "custo por conversa", "spend"],
    secondary_kpis: ["CTR (link)", "CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_conversa", "meta_custo_por_conversa_conta"],
    forbidden_labels: ["custo por 1.000 pessoas alcançadas", "custo por visita ao perfil"],
  },
  LEADS: {
    category: "LEADS",
    code: "lead",
    odax_objectives: ["OUTCOME_LEADS", "LEAD_GENERATION"],
    optimization_goals: ["LEAD_GENERATION", "QUALITY_LEAD", "OFFSITE_CONVERSIONS"],
    official_event: "actions:lead / onsite_conversion.lead_grouped",
    label_singular: "cadastro (lead)",
    label_plural: "cadastros (leads)",
    cost_label: "Custo por cadastro (CPL)",
    short_badge: "LEAD",
    unit: "BRL/lead",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / leads",
    attribution_window: "7d_click / 1d_view",
    primary_kpis: ["cadastros (leads)", "custo por cadastro (CPL)", "spend"],
    secondary_kpis: ["CTR (link)", "CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_lead", "meta_cpl_conta"],
    forbidden_labels: ["custo por 1.000 pessoas alcançadas", "custo por visita ao perfil"],
  },
  PURCHASES: {
    category: "PURCHASES",
    code: "purchase",
    odax_objectives: ["OUTCOME_SALES", "CONVERSIONS"],
    optimization_goals: ["OFFSITE_CONVERSIONS", "VALUE"],
    official_event: "actions:purchase / offsite_conversion.fb_pixel_purchase",
    label_singular: "compra",
    label_plural: "compras",
    cost_label: "Custo por compra (CPA)",
    short_badge: "VENDA",
    unit: "BRL/compra",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / compras",
    attribution_window: "7d_click / 1d_view",
    primary_kpis: ["compras", "custo por compra (CPA)", "ROAS", "spend"],
    secondary_kpis: ["CTR (link)", "CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_compra", "meta_cpa_conta"],
    forbidden_labels: ["custo por 1.000 pessoas alcançadas"],
  },
  CHECKOUT: {
    category: "CHECKOUT",
    code: "initiate_checkout",
    odax_objectives: ["OUTCOME_SALES", "CONVERSIONS"],
    optimization_goals: ["OFFSITE_CONVERSIONS"],
    official_event: "actions:initiate_checkout",
    label_singular: "finalização de compra iniciada",
    label_plural: "finalizações de compra iniciadas",
    cost_label: "Custo por checkout iniciado",
    short_badge: "CHK",
    unit: "BRL/checkout",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / checkouts_iniciados",
    attribution_window: "7d_click / 1d_view",
    primary_kpis: ["finalizações de compra iniciadas", "custo por checkout iniciado"],
    secondary_kpis: ["CTR (link)", "CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_checkout"],
    forbidden_labels: ["CPL", "custo por lead"],
  },
  ADD_TO_CART: {
    category: "ADD_TO_CART",
    code: "add_to_cart",
    odax_objectives: ["OUTCOME_SALES", "CONVERSIONS"],
    optimization_goals: ["OFFSITE_CONVERSIONS"],
    official_event: "actions:add_to_cart",
    label_singular: "adição ao carrinho",
    label_plural: "adições ao carrinho",
    cost_label: "Custo por adição ao carrinho",
    short_badge: "CART",
    unit: "BRL/carrinho",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / adicoes_ao_carrinho",
    attribution_window: "7d_click / 1d_view",
    primary_kpis: ["adições ao carrinho", "custo por adição ao carrinho"],
    secondary_kpis: ["CTR (link)", "CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_carrinho"],
    forbidden_labels: ["CPL", "custo por lead"],
  },
  REACH: {
    category: "REACH",
    code: "reach",
    odax_objectives: ["OUTCOME_AWARENESS", "REACH", "BRAND_AWARENESS"],
    optimization_goals: ["REACH", "IMPRESSIONS", "AD_RECALL_LIFT"],
    official_event: "reach (pessoas alcançadas)",
    label_singular: "pessoa alcançada",
    label_plural: "pessoas alcançadas",
    cost_label: "Custo por 1.000 pessoas alcançadas",
    short_badge: "ALC",
    unit: "BRL/1.000_alcançadas",
    denominator_field: "reach",
    multiplier: 1000,
    formula_description: "(spend / reach) * 1000",
    attribution_window: "Impressão servida no período (alcance deduplicado na entidade)",
    primary_kpis: [
      "pessoas alcançadas",
      "custo por 1.000 pessoas alcançadas",
      "CPM (custo por 1.000 impressões)",
      "frequência",
      "impressões",
    ],
    secondary_kpis: ["cliques no link (sinal secundário)", "CTR (link) (sinal secundário)", "cliques totais"],
    allowed_comparable_metrics: ["custo_por_mil_alcancadas", "cpm"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa", "CPA de Mensagens"],
  },
  INSTAGRAM_PROFILE: {
    category: "INSTAGRAM_PROFILE",
    code: "instagram_profile_visit",
    odax_objectives: ["OUTCOME_TRAFFIC", "OUTCOME_ENGAGEMENT"],
    optimization_goals: ["PROFILE_VISIT", "VISIT_INSTAGRAM_PROFILE"],
    official_event: "actions:instagram_profile_visit / visit_instagram_profile",
    label_singular: "visita ao perfil do Instagram",
    label_plural: "visitas ao perfil do Instagram",
    cost_label: "Custo por visita ao perfil",
    short_badge: "PERFIL IG",
    unit: "BRL/visita_perfil",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / visitas_ao_perfil",
    attribution_window: "1d_view / 7d_click",
    primary_kpis: ["visitas ao perfil do Instagram", "custo por visita ao perfil", "CTR (link)"],
    secondary_kpis: ["CPM", "frequência", "alcance", "cliques totais"],
    allowed_comparable_metrics: ["custo_por_visita_perfil"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa"],
  },
  LANDING_PAGE_VIEWS: {
    category: "LANDING_PAGE_VIEWS",
    code: "landing_page_view",
    odax_objectives: ["OUTCOME_TRAFFIC", "LINK_CLICKS"],
    optimization_goals: ["LANDING_PAGE_VIEWS"],
    official_event: "actions:landing_page_view",
    label_singular: "visualização da página de destino",
    label_plural: "visualizações da página de destino",
    cost_label: "Custo por visualização de página (LPV)",
    short_badge: "LPV",
    unit: "BRL/lpv",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / landing_page_views (connect rate = LPV / link_clicks)",
    attribution_window: "1d_view / 7d_click",
    primary_kpis: ["visualizações da página de destino", "custo por visualização de página (LPV)", "cliques no link", "CTR (link)"],
    secondary_kpis: ["CPC (link)", "CPM", "frequência"],
    allowed_comparable_metrics: ["custo_por_lpv"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa"],
  },
  LINK_CLICKS: {
    category: "LINK_CLICKS",
    code: "link_click",
    odax_objectives: ["OUTCOME_TRAFFIC", "LINK_CLICKS"],
    optimization_goals: ["LINK_CLICKS"],
    official_event: "inline_link_clicks / actions:link_click",
    label_singular: "clique no link",
    label_plural: "cliques no link",
    cost_label: "Custo por clique no link (CPC Link)",
    short_badge: "CLIQUE",
    unit: "BRL/clique_link",
    denominator_field: "link_clicks",
    multiplier: 1,
    formula_description: "spend / inline_link_clicks",
    attribution_window: "Clique direcional no link",
    primary_kpis: ["cliques no link", "custo por clique no link (CPC Link)", "CTR (link)"],
    secondary_kpis: ["cliques totais", "CTR (todos)", "CPM", "frequência"],
    allowed_comparable_metrics: ["cpc_link"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa"],
  },
  VIDEO_VIEWS: {
    category: "VIDEO_VIEWS",
    code: "video_thruplay_watched_actions",
    odax_objectives: ["OUTCOME_ENGAGEMENT", "VIDEO_VIEWS"],
    optimization_goals: ["THRUPLAY", "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS"],
    official_event: "video_thruplay_watched_actions",
    label_singular: "visualização ThruPlay",
    label_plural: "visualizações ThruPlay",
    cost_label: "Custo por ThruPlay (CPV)",
    short_badge: "VÍDEO",
    unit: "BRL/thruplay",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / thruplays",
    attribution_window: "Reprodução contínua (ThruPlay / 15s)",
    primary_kpis: ["visualizações ThruPlay", "custo por ThruPlay (CPV)", "retenção de vídeo"],
    secondary_kpis: ["CPM", "frequência", "CTR (link)"],
    allowed_comparable_metrics: ["custo_por_thruplay"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa"],
  },
  ENGAGEMENT: {
    category: "ENGAGEMENT",
    code: "post_engagement",
    odax_objectives: ["OUTCOME_ENGAGEMENT", "POST_ENGAGEMENT"],
    optimization_goals: ["POST_ENGAGEMENT", "PAGE_LIKES"],
    official_event: "actions:post_engagement",
    label_singular: "engajamento com a publicação",
    label_plural: "engajamentos com a publicação",
    cost_label: "Custo por engajamento (CPE)",
    short_badge: "ENG",
    unit: "BRL/engajamento",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / engajamentos",
    attribution_window: "Interação na publicação",
    primary_kpis: ["engajamentos com a publicação", "custo por engajamento (CPE)", "CTR (todos)"],
    secondary_kpis: ["CPM", "frequência", "alcance", "cliques no link"],
    allowed_comparable_metrics: ["custo_por_engajamento"],
    forbidden_labels: ["CPL", "Custo por Lead", "Custo por Conversa"],
  },
  UNKNOWN: {
    category: "UNKNOWN",
    code: "unknown",
    odax_objectives: [],
    optimization_goals: [],
    official_event: "indefinido",
    label_singular: "resultado",
    label_plural: "resultados",
    cost_label: "Custo por resultado",
    short_badge: "RES",
    unit: "BRL/resultado",
    denominator_field: "conversions",
    multiplier: 1,
    formula_description: "spend / resultados",
    attribution_window: "Não especificada",
    primary_kpis: ["spend", "impressões", "alcance"],
    secondary_kpis: ["CTR (link)", "CPM", "frequência"],
    allowed_comparable_metrics: [],
    forbidden_labels: ["CPL"],
  },
};

export interface VictoriaAnalysisContext {
  contract_version: string;
  prompt_version: string;
  model_version: string;
  request_id: string;
  analysis_context_hash: string;

  source_surface: VictoriaSurfaceId;
  route: string;
  user_id: string | null;
  conversation_id: string | null;

  ad_account_id: string;
  ad_account_name: string;
  timezone: string;

  entity_level: VictoriaEntityLevel;
  entity_id: string;
  internal_id?: string | null;
  external_id?: string | null;
  entity_name: string;
  effective_status: string;
  parent_ids: {
    account_id?: string | null;
    campaign_id?: string | null;
    adset_id?: string | null;
    client_id?: string | null;
  };

  period: {
    date_from: string;
    date_to: string;
    days_count: number;
    is_inclusive: boolean;
    preset?: string | null;
    timezone: string;
    last_sync_at?: string | null;
    data_freshness: "fresh" | "recent" | "stale" | "unknown";
  };

  optimization: {
    odax_objective: string;
    optimization_goal: string;
    billing_event: string;
    destination_type: string;
    official_result_event: string;
    category: MetaConversionCategory;
  };

  result_indicator: {
    code: string;
    label_singular: string;
    label_plural: string;
    cost_label: string;
    short_badge: string;
    unit: string;
    denominator_field: "conversions" | "reach" | "link_clicks" | "impressions";
    multiplier: 1 | 1000;
    attribution_window: string;
    source: string;
    allowed_comparable_metrics: string[];
    forbidden_labels: string[];
  };

  operational_mode?: VictoriaOperationalMode;
  isolated_sibling_blocklist?: {
    names: string[];
    distinctive_tokens: string[];
  };

  financial: {
    spend: number;
    daily_budget: number | null;
    lifetime_budget: number | null;
    budget_type: "CBO" | "ABO" | "DAILY" | "LIFETIME" | "UNSPECIFIED";
    currency: string;
  };

  raw_metrics: {
    impressions: number;
    reach: number;
    reach_scope: "deduplicated_entity" | "deduplicated_account" | "daily_sum_non_deduplicated";
    frequency: number;
    link_clicks: number;
    all_clicks: number;
    ctr_link: number;
    ctr_all: number;
    cpm: number;
    cpc_link: number;
    cpc_all: number;
    result_value: number;
    cost_per_result: number | null;
    cost_per_result_formatted: string;
    actions: Record<string, number>;
  };

  metric_vector: MetricVector;

  configuration: {
    has_creative_data: boolean;
    has_copy_data: boolean;
    has_audience_targeting: boolean;
    has_landing_page_data: boolean;
    has_crm_funnel_data: boolean;
    has_hourly_breakdown: boolean;
    placement_summary?: string | null;
    bidding_strategy?: string | null;
  };

  governance_and_benchmarks: {
    account_max_cpl_target: number | null;
    target_metric_category: MetaConversionCategory | null;
    comparable_same_objective_avg: number | null;
    comparable_history_days: number;
    rules_active: string[];
    rag_documents: CuratedRagDocument[];
  };

  missing_fields: string[];
  limitations: string[];
  confidence_level: VictoriaConfidenceLevel;
  confidence_justification: string;
}

/**
 * Gera um hash determinístico FNV-1a (hex) do contexto canônico de análise.
 */
export function computeAnalysisContextHash(input: {
  user_id?: string | null;
  ad_account_id: string;
  entity_level: string;
  entity_id: string;
  date_from: string;
  date_to: string;
  category: string;
  result_code: string;
  spend: number;
  result_value: number;
  impressions: number;
  reach: number;
  link_clicks: number;
  all_clicks: number;
  contract_version?: string;
  prompt_version?: string;
  model_version?: string;
}): string {
  const canonical = [
    input.contract_version || VICTORIA_CONTRACT_VERSION,
    input.prompt_version || VICTORIA_PROMPT_VERSION,
    input.model_version || VICTORIA_DEFAULT_ANALYTICAL_MODEL,
    input.user_id || "anon",
    input.ad_account_id || "no-acc",
    input.entity_level || "unknown",
    input.entity_id || "no-entity",
    input.date_from || "",
    input.date_to || "",
    input.category || "UNKNOWN",
    input.result_code || "unknown",
    Number(input.spend || 0).toFixed(2),
    String(Math.round(Number(input.result_value || 0))),
    String(Math.round(Number(input.impressions || 0))),
    String(Math.round(Number(input.reach || 0))),
    String(Math.round(Number(input.link_clicks || 0))),
    String(Math.round(Number(input.all_clicks || 0))),
  ].join("|");

  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `vctx_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Gera a chave completa de isolamento de cache e sessão (Seção 2).
 */
export function buildVictoriaSessionCacheKey(params: {
  userId?: string | null;
  conversationId?: string | null;
  accountId: string;
  entityLevel: VictoriaEntityLevel;
  entityId: string;
  dateFrom: string;
  dateTo: string;
  contextHash: string;
  modelVersion?: string;
  promptVersion?: string;
}): string {
  return [
    params.userId || "anon",
    params.conversationId || "ephemeral",
    params.accountId || "all",
    params.entityLevel,
    params.entityId,
    `${params.dateFrom}..${params.dateTo}`,
    params.contextHash,
    params.modelVersion || VICTORIA_DEFAULT_ANALYTICAL_MODEL,
    params.promptVersion || VICTORIA_PROMPT_VERSION,
  ].join("::");
}

/**
 * Calcula número de dias inclusivos entre duas datas YYYY-MM-DD.
 */
export function computeInclusiveDays(dateFrom: string, dateTo: string): number {
  if (!dateFrom || !dateTo) return 0;
  const start = Date.parse(`${dateFrom.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${dateTo.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.round((end - start) / 86400000) + 1);
}

/**
 * Calibra o nível de confiança da análise com base na janela temporal, volume de eventos e completude (Seção 5).
 */
export function calibrateAnalysisConfidence(params: {
  daysCount: number;
  impressions: number;
  resultValue: number;
  category: MetaConversionCategory;
  missingFields: string[];
  hasCreativeData: boolean;
  hasAudienceData: boolean;
}): { level: VictoriaConfidenceLevel; justification: string } {
  const reasons: string[] = [];

  if (params.daysCount <= 1) {
    reasons.push("janela de apenas 1 dia (amostra temporal curta sujeita a volatilidade diária do leilão)");
  } else if (params.daysCount < 7) {
    reasons.push(`janela de ${params.daysCount} dias (inferior a um ciclo semanal completo de aprendizado de 7 dias)`);
  }

  if (params.impressions < 500) {
    reasons.push(`volume reduzido de impressões (${params.impressions.toLocaleString("pt-BR")})`);
  }

  if (
    ["MESSAGES", "LEADS", "PURCHASES"].includes(params.category) &&
    params.resultValue < 10
  ) {
    reasons.push(`amostra reduzida de eventos de resultado (${params.resultValue})`);
  }

  if (!params.hasCreativeData) {
    reasons.push("ausência de mídia/copy do criativo no payload");
  }
  if (!params.hasAudienceData) {
    reasons.push("ausência de detalhamento de segmentação/público do conjunto");
  }

  if (params.daysCount <= 2 || params.impressions < 500 || params.missingFields.length >= 4) {
    return {
      level: "baixa",
      justification: `Confiança BAIXA (evidência limitada para conclusão causal definitiva em janela de ${params.daysCount} dia(s)): ${reasons.join("; ")}. As métricas brutas do período são exatas, mas decisões estruturais de orçamento ou pausa exigem janela mínima de 3 a 7 dias.`,
    };
  }

  if (params.daysCount < 7 || !params.hasCreativeData || !params.hasAudienceData) {
    return {
      level: "media",
      justification: `Confiança média: métricas de entrega validadas na janela de ${params.daysCount} dias, porém com limitações de observabilidade (${reasons.join("; ")}).`,
    };
  }

  return {
    level: "alta",
    justification: `Confiança alta: janela de ${params.daysCount} dias com volume estatístico suficiente (${params.impressions.toLocaleString("pt-BR")} impressões) e contexto completo de configuração.`,
  };
}

export interface BuildVictoriaContextInput {
  request_id?: string;
  source_surface: VictoriaSurfaceId;
  route: string;
  user_id?: string | null;
  conversation_id?: string | null;
  ad_account_id: string;
  ad_account_name: string;
  timezone?: string;
  entity_level: VictoriaEntityLevel;
  entity_id: string;
  internal_id?: string | null;
  external_id?: string | null;
  entity_name: string;
  effective_status?: string;
  parent_ids?: {
    account_id?: string | null;
    campaign_id?: string | null;
    adset_id?: string | null;
    client_id?: string | null;
  };
  date_from: string;
  date_to: string;
  preset?: string | null;
  last_sync_at?: string | null;
  odax_objective?: string | null;
  optimization_goal?: string | null;
  billing_event?: string | null;
  destination_type?: string | null;
  result_type?: string | null;
  result_indicator?: string | null;
  spend: number;
  daily_budget?: number | null;
  lifetime_budget?: number | null;
  budget_type?: "CBO" | "ABO" | "DAILY" | "LIFETIME" | "UNSPECIFIED";
  currency?: string;
  impressions: number;
  reach: number;
  reach_scope?: "deduplicated_entity" | "deduplicated_account" | "daily_sum_non_deduplicated";
  frequency?: number | null;
  link_clicks: number;
  all_clicks?: number | null;
  conversions: number;
  actions?: Record<string, number>;
  metric_vector?: MetricVector;
  has_creative_data?: boolean;
  has_copy_data?: boolean;
  has_audience_targeting?: boolean;
  has_landing_page_data?: boolean;
  has_crm_funnel_data?: boolean;
  has_hourly_breakdown?: boolean;
  placement_summary?: string | null;
  bidding_strategy?: string | null;
  account_max_cpl_target?: number | null;
  comparable_same_objective_avg?: number | null;
  comparable_history_days?: number;
  rules_active?: string[];
  rag_documents?: CuratedRagDocument[];
  model_version?: string;
  operational_mode?: VictoriaOperationalMode;
  sibling_entities?: Array<{
    id?: string;
    external_id?: string;
    name?: string;
    spend?: number;
    reach?: number;
    impressions?: number;
    cpm?: number;
    cost_per_result?: number | null;
    result_value?: number;
  }>;
}

/**
 * Constrói o contrato canônico VictoriaAnalysisContext validado e tipado.
 */
export function buildVictoriaAnalysisContext(input: BuildVictoriaContextInput): VictoriaAnalysisContext {
  const cls = classifyMetaEvent({
    campaignName: input.entity_name,
    rawObjective: input.odax_objective ?? undefined,
    optimizationGoal: input.optimization_goal ?? undefined,
    resultType: input.result_type ?? undefined,
    resultsIndicator: input.result_indicator ?? undefined,
    isVehicleContext: false,
  });

  const spec = CANONICAL_METRIC_REGISTRY[cls.category] || CANONICAL_METRIC_REGISTRY.UNKNOWN;

  const spend = Number(input.spend || 0);
  const impressions = Math.max(0, Math.round(Number(input.impressions || 0)));
  const reach = Math.max(0, Math.round(Number(input.reach || 0)));
  const linkClicks = Math.max(0, Math.round(Number(input.link_clicks || 0)));
  const allClicks = Math.max(linkClicks, Math.round(Number(input.all_clicks ?? input.link_clicks ?? 0)));
  const conversions = Math.max(0, Math.round(Number(input.conversions || 0)));

  const frequency =
    input.frequency && Number(input.frequency) > 0
      ? Number(input.frequency)
      : reach > 0
      ? impressions / reach
      : 0;

  const ctrLink = impressions > 0 ? (linkClicks / impressions) * 100 : 0;
  const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : 0;
  const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0;
  const cpcLink = linkClicks > 0 ? spend / linkClicks : 0;
  const cpcAll = allClicks > 0 ? spend / allClicks : 0;

  const resultValue =
    cls.category === "REACH"
      ? reach > 0
        ? reach
        : conversions
      : cls.category === "LINK_CLICKS"
      ? conversions > 0
        ? conversions
        : linkClicks
      : conversions;

  const costPerResult = computeUnitCost(spend, resultValue, cls.category);
  const costPerResultFormatted =
    costPerResult !== null && Number.isFinite(costPerResult)
      ? `R$ ${costPerResult.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "—";

  const vector = input.metric_vector ? { ...input.metric_vector } : emptyMetricVector();
  if (!input.metric_vector) {
    accumulateMetricVector(vector, cls.category, resultValue, input.result_indicator ?? undefined);
  }

  const daysCount = computeInclusiveDays(input.date_from, input.date_to);

  const missingFields: string[] = [];
  const limitations: string[] = [];

  if (!input.has_creative_data) {
    missingFields.push("creative_media_and_thumbnail");
    limitations.push("Sem acesso à imagem/vídeo ou thumbnail do anúncio neste payload — não é possível avaliar estética visual, iluminação de pátio ou áudio.");
  }
  if (!input.has_copy_data) {
    missingFields.push("ad_copy_and_headline");
    limitations.push("Texto principal (copy), headline e CTA do anúncio não estão incluídos nos metadados sincronizados.");
  }
  if (!input.has_audience_targeting) {
    missingFields.push("adset_targeting_spec");
    limitations.push("Configuração detalhada de segmentação do conjunto (raio geográfico, idade, públicos personalizados/Advantage+) não fornecida.");
  }
  if (!input.has_landing_page_data) {
    missingFields.push("destination_url_telemetry");
    limitations.push("Sem telemetria de carregamento de página de destino ou taxa de resposta de WhatsApp/CRM.");
  }
  if (!input.has_crm_funnel_data) {
    missingFields.push("crm_lead_qualification_and_sla");
    limitations.push("Sem integração de fechamento comercial/CRM para aferir qualidade real das conversas ou tempo efetivo de atendimento dos vendedores.");
  }
  if (daysCount <= 1) {
    limitations.push(`Amostra temporal de apenas 1 dia (${input.date_from}) — insuficiente para atribuir causa definitiva ou recomendar pausas/cortes drásticos.`);
  } else if (daysCount < 7) {
    limitations.push(`Período curto (${daysCount} dias: ${input.date_from} a ${input.date_to}) — recomenda-se janela de 7 dias para estabilização estatística do leilão.`);
  }

  let dataFreshness: "fresh" | "recent" | "stale" | "unknown" = "unknown";
  if (input.last_sync_at) {
    const syncMs = Date.parse(input.last_sync_at);
    if (!Number.isNaN(syncMs)) {
      const diffHours = (Date.now() - syncMs) / 3600000;
      dataFreshness = diffHours <= 2 ? "fresh" : diffHours <= 12 ? "recent" : "stale";
    }
  }

  const modelVersion = input.model_version || VICTORIA_DEFAULT_ANALYTICAL_MODEL;
  const contextHash = computeAnalysisContextHash({
    user_id: input.user_id,
    ad_account_id: input.ad_account_id,
    entity_level: input.entity_level,
    entity_id: input.entity_id,
    date_from: input.date_from,
    date_to: input.date_to,
    category: cls.category,
    result_code: spec.code,
    spend,
    result_value: resultValue,
    impressions,
    reach,
    link_clicks: linkClicks,
    all_clicks: allClicks,
    contract_version: VICTORIA_CONTRACT_VERSION,
    prompt_version: VICTORIA_PROMPT_VERSION,
    model_version: modelVersion,
  });

  const confidence = calibrateAnalysisConfidence({
    daysCount,
    impressions,
    resultValue,
    category: cls.category,
    missingFields,
    hasCreativeData: Boolean(input.has_creative_data),
    hasAudienceData: Boolean(input.has_audience_targeting),
  });

  // Filtrar metas da conta: max_cpl de mensagens/leads NUNCA se aplica a REACH, INSTAGRAM_PROFILE, etc.
  const isTargetApplicable =
    input.account_max_cpl_target &&
    input.account_max_cpl_target > 0 &&
    (cls.category === "MESSAGES" || cls.category === "LEADS");

  const approvedRagDocs = (input.rag_documents || []).filter(
    (d) =>
      d.approval_status === "APPROVED" &&
      d.evidence_level !== "OPINION" &&
      d.evidence_level !== "UNVERIFIED"
  );

  return {
    contract_version: VICTORIA_CONTRACT_VERSION,
    prompt_version: VICTORIA_PROMPT_VERSION,
    model_version: modelVersion,
    request_id: input.request_id || `vreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    analysis_context_hash: contextHash,

    source_surface: input.source_surface,
    route: input.route,
    user_id: input.user_id ?? null,
    conversation_id: input.conversation_id ?? null,

    ad_account_id: input.ad_account_id,
    ad_account_name: input.ad_account_name || "Conta não identificada",
    timezone: input.timezone || "America/Sao_Paulo",

    entity_level: input.entity_level,
    entity_id: input.entity_id,
    internal_id: input.internal_id ?? null,
    external_id: input.external_id ?? null,
    entity_name: input.entity_name,
    effective_status: input.effective_status || "ACTIVE",
    parent_ids: {
      account_id: input.parent_ids?.account_id ?? input.ad_account_id,
      campaign_id: input.parent_ids?.campaign_id ?? null,
      adset_id: input.parent_ids?.adset_id ?? null,
      client_id: input.parent_ids?.client_id ?? null,
    },

    period: {
      date_from: input.date_from,
      date_to: input.date_to,
      days_count: daysCount,
      is_inclusive: true,
      preset: input.preset ?? null,
      timezone: input.timezone || "America/Sao_Paulo",
      last_sync_at: input.last_sync_at ?? null,
      data_freshness: dataFreshness,
    },

    optimization: {
      odax_objective: input.odax_objective || spec.odax_objectives[0] || "UNSPECIFIED",
      optimization_goal: input.optimization_goal || spec.optimization_goals[0] || "UNSPECIFIED",
      billing_event: input.billing_event || "IMPRESSIONS",
      destination_type: input.destination_type || (cls.category === "MESSAGES" ? "WHATSAPP" : "UNSPECIFIED"),
      official_result_event: spec.official_event,
      category: cls.category,
    },

    result_indicator: {
      code: spec.code,
      label_singular: spec.label_singular,
      label_plural: spec.label_plural,
      cost_label: spec.cost_label,
      short_badge: spec.short_badge,
      unit: spec.unit,
      denominator_field: spec.denominator_field,
      multiplier: spec.multiplier,
      attribution_window: spec.attribution_window,
      source: "meta_insights_snapshot / metrics",
      allowed_comparable_metrics: spec.allowed_comparable_metrics,
      forbidden_labels: spec.forbidden_labels,
    },

    operational_mode: input.operational_mode || VICTORIA_DEFAULT_OPERATIONAL_MODE,
    isolated_sibling_blocklist: buildSiblingIsolationBlocklist(
      input.entity_name,
      input.entity_id,
      input.sibling_entities || []
    ),

    financial: {
      spend,
      daily_budget: input.daily_budget ?? null,
      lifetime_budget: input.lifetime_budget ?? null,
      budget_type:
        input.budget_type ||
        (input.daily_budget && input.daily_budget > 0
          ? "DAILY"
          : input.lifetime_budget && input.lifetime_budget > 0
          ? "LIFETIME"
          : "UNSPECIFIED"),
      currency: input.currency || "BRL",
    },

    raw_metrics: {
      impressions,
      reach,
      reach_scope: input.reach_scope || "deduplicated_entity",
      frequency,
      link_clicks: linkClicks,
      all_clicks: allClicks,
      ctr_link: ctrLink,
      ctr_all: ctrAll,
      cpm,
      cpc_link: cpcLink,
      cpc_all: cpcAll,
      result_value: resultValue,
      cost_per_result: costPerResult,
      cost_per_result_formatted: costPerResultFormatted,
      actions: input.actions || { [spec.code]: resultValue },
    },

    metric_vector: vector,

    configuration: {
      has_creative_data: Boolean(input.has_creative_data),
      has_copy_data: Boolean(input.has_copy_data),
      has_audience_targeting: Boolean(input.has_audience_targeting),
      has_landing_page_data: Boolean(input.has_landing_page_data),
      has_crm_funnel_data: Boolean(input.has_crm_funnel_data),
      has_hourly_breakdown: Boolean(input.has_hourly_breakdown),
      placement_summary: input.placement_summary ?? null,
      bidding_strategy: input.bidding_strategy ?? null,
    },

    governance_and_benchmarks: {
      account_max_cpl_target: isTargetApplicable ? Number(input.account_max_cpl_target) : null,
      target_metric_category: isTargetApplicable ? cls.category : null,
      comparable_same_objective_avg:
        input.comparable_same_objective_avg && input.comparable_same_objective_avg > 0
          ? Number(input.comparable_same_objective_avg)
          : null,
      comparable_history_days: input.comparable_history_days ?? daysCount,
      rules_active: input.rules_active || [],
      rag_documents: approvedRagDocs,
    },

    missing_fields: missingFields,
    limitations,
    confidence_level: confidence.level,
    confidence_justification: confidence.justification,
  };
}

export interface ContextValidationResult {
  valid: boolean;
  status: "VALID" | "INSUFFICIENT_DATA";
  missingMandatoryFields: string[];
  degradedResponse: string | null;
}

/**
 * Rejeita ou degrada para "dados insuficientes" qualquer análise sem entidade, período, objetivo ou indicador oficial (Seção 1).
 */
export function validateVictoriaAnalysisContext(
  ctx?: Partial<VictoriaAnalysisContext> | null
): ContextValidationResult {
  const missing: string[] = [];
  if (!ctx) {
    return {
      valid: false,
      status: "INSUFFICIENT_DATA",
      missingMandatoryFields: ["context"],
      degradedResponse:
        "### ⚠️ Dados Insuficientes para Análise\n\nNão foi possível iniciar o diagnóstico porque o contrato canônico `VictoriaAnalysisContext` não foi fornecido. Selecione uma conta, entidade e período válidos antes de solicitar a análise.",
    };
  }

  if (!ctx.entity_id || !String(ctx.entity_id).trim()) missing.push("entity_id");
  if (!ctx.entity_level) missing.push("entity_level");
  if (!ctx.ad_account_id || !String(ctx.ad_account_id).trim()) missing.push("ad_account_id");
  if (!ctx.period?.date_from || !ctx.period?.date_to) missing.push("period (date_from / date_to)");
  if (
    ctx.entity_level !== "account" &&
    ctx.entity_level !== "page" &&
    ctx.entity_level !== "client" &&
    (!ctx.optimization?.category || ctx.optimization.category === "UNKNOWN")
  ) {
    missing.push("optimization.category / official_result_event");
  }
  if (
    ctx.entity_level !== "account" &&
    ctx.entity_level !== "page" &&
    ctx.entity_level !== "client" &&
    (!ctx.result_indicator?.code || ctx.result_indicator.code === "unknown")
  ) {
    missing.push("result_indicator.code");
  }

  if (missing.length > 0) {
    return {
      valid: false,
      status: "INSUFFICIENT_DATA",
      missingMandatoryFields: missing,
      degradedResponse: [
        "### ⚠️ Dados Insuficientes para Diagnóstico Confiável",
        "",
        `**O que esta campanha foi configurada para otimizar?** Não foi possível confirmar o objetivo oficial ou escopo completo desta entidade (\`${ctx.entity_name || "entidade sem identificação"}\`).`,
        "",
        `- **Campos obrigatórios ausentes ou não identificados:** \`${missing.join("`, `")}\`.`,
        `- **Política de governança (${VICTORIA_CONTRACT_VERSION}):** A Victoria AI não realiza inferência pelo nome da campanha nem emite diagnóstico quando o objetivo oficial, período ou indicador de resultado estão ausentes.`,
        `- **Ação recomendada:** Execute a sincronização da conta para o período desejado para carregar o \`objective\`, \`optimization_goal\` e \`actions\` oficiais da Meta Graph API.`,
      ].join("\n"),
    };
  }

  return {
    valid: true,
    status: "VALID",
    missingMandatoryFields: [],
    degradedResponse: null,
  };
}

/**
 * Valida se duas métricas possuem a mesma unidade semântica para comparação direta (Seção 3).
 */
export function validateMetricComparison(
  metricAUnit: string,
  metricBUnit: string
): { allowed: boolean; reason?: string } {
  const normA = String(metricAUnit || "").trim().toLowerCase();
  const normB = String(metricBUnit || "").trim().toLowerCase();
  if (!normA || !normB) {
    return { allowed: false, reason: "Unidade de métrica ausente para comparação." };
  }
  if (normA !== normB) {
    return {
      allowed: false,
      reason: `Comparação cruzada bloqueada: "${metricAUnit}" não pode ser comparado diretamente com "${metricBUnit}" por possuírem denominadores e unidades distintos.`,
    };
  }
  return { allowed: true };
}

/**
 * Gera perguntas sugeridas (shortcuts) estritamente compatíveis com o objetivo da entidade (Falha 4 / Seção 9).
 */
export function buildSuggestedQuestionsForContext(
  ctx?: Partial<VictoriaAnalysisContext> | null
): string[] {
  const cat = ctx?.optimization?.category || "UNKNOWN";

  switch (cat) {
    case "REACH":
      return [
        "Como estão o custo por 1.000 pessoas alcançadas, o CPM e a frequência neste período?",
        "A frequência atual indica cobertura saudável ou início de repetição na audiência?",
        "Qual a diferença entre os cliques no link e os cliques totais nesta campanha de alcance?",
        "Quais dados adicionais (janela de 7 dias ou criativo) ajudam a validar este alcance?",
      ];
    case "MESSAGES":
      return [
        "Como evoluíram o volume de conversas iniciadas e o custo por conversa?",
        "A relação entre cliques no link e conversas iniciadas sugere atrito após o clique?",
        "A amostra deste período já permite ajustar orçamento ou devemos aguardar mais dias?",
        "Quais hipóteses explicam a variação entre CTR (link) e taxa de início de conversa?",
      ];
    case "LEADS":
      return [
        "Como está o custo por cadastro (CPL) em relação ao volume de cliques no link?",
        "Há sinais de saturação na frequência ou queda no CTR (link) deste conjunto?",
        "A janela analisada tem volume suficiente para testar nova variação de criativo?",
        "Quais campos do formulário ou página podem explicar a conversão pós-clique?",
      ];
    case "INSTAGRAM_PROFILE":
      return [
        "Qual é o custo por visita ao perfil do Instagram e a taxa de cliques no link?",
        "A frequência e o CPM estão eficientes para geração de tráfego ao perfil?",
        "Qual a proporção entre cliques totais e visitas efetivas ao perfil?",
        "Como avaliar se as visitas ao perfil estão gerando engajamento orgânico?",
      ];
    case "LANDING_PAGE_VIEWS":
    case "LINK_CLICKS":
      return [
        "Qual o custo por visualização de página / clique no link e o CTR (link) atual?",
        "Existe diferença relevante entre cliques totais e cliques direcionais no link?",
        "O CPM e a frequência indicam boa entrega para o objetivo de tráfego?",
        "Quais testes reversíveis podem elevar o CTR (link) sem reiniciar o aprendizado?",
      ];
    default:
      return [
        "Qual o resumo factual das métricas por objetivo neste período?",
        "Quais são as limitações de amostra e observabilidade desta análise?",
        "Existem sinais secundários de atenção em CPM, frequência ou CTR (link)?",
        "Qual o próximo passo seguro de monitoramento antes de alterar orçamento?",
      ];
  }
}

export const MANDATORY_10_SECTION_TITLES = [
  "Escopo analisado",
  "Objetivo e evento oficial",
  "Leitura factual",
  "Indicadores primários e secundários",
  "Limitações e dados ausentes",
  "Hipóteses",
  "Recomendações seguras",
  "Plano de validação",
  "Nível de confiança",
  "Fontes e documentos utilizados",
] as const;

export function isLegacyVictoriaVersion(version?: string | null): boolean {
  if (!version || typeof version !== "string") return true;
  return version.trim() !== VICTORIA_CONTRACT_VERSION;
}

export function buildSiblingIsolationBlocklist(
  currentEntityName: string,
  currentEntityId: string,
  siblings: Array<{
    id?: string;
    external_id?: string;
    name?: string;
    spend?: number;
    reach?: number;
    impressions?: number;
    cpm?: number;
    cost_per_result?: number | null;
    result_value?: number;
  }> = []
): { names: string[]; distinctive_tokens: string[] } {
  const normCurrent = String(currentEntityName || "").trim().toLowerCase();
  const names: string[] = [];
  const tokens = new Set<string>();

  const fmtBrlVal = (n?: number | null) =>
    typeof n === "number" && Number.isFinite(n) && n > 0
      ? n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : null;

  for (const sib of siblings) {
    if (!sib) continue;
    const sid = String(sib.external_id || sib.id || "");
    const sname = String(sib.name || "").trim();
    if (sid && sid === String(currentEntityId)) continue;
    if (sname && sname.toLowerCase() === normCurrent) continue;
    if (sname && sname.length >= 6) {
      names.push(sname);
      // Palavras distintivas longas (>= 5 chars) exclusivas do nome da campanha irmã
      const currentWords = new Set(
        normCurrent
          .split(/[^a-zà-ú0-9]+/i)
          .filter((w) => w.length >= 4)
      );
      for (const word of sname.split(/[^a-zà-ú0-9]+/i)) {
        const cleanW = word.trim();
        if (cleanW.length >= 5 && !currentWords.has(cleanW.toLowerCase()) && !/^(campanha|meta|ads|copia|cópia|alcance|mensagens)$/i.test(cleanW)) {
          tokens.add(cleanW);
        }
      }
    }
    const spendTok = fmtBrlVal(sib.spend);
    if (spendTok && Number(sib.spend) >= 10) tokens.add(`R$ ${spendTok}`);
    const cprTok = fmtBrlVal(sib.cost_per_result ?? null);
    if (cprTok) tokens.add(`R$ ${cprTok}`);
    const cpmTok = fmtBrlVal(sib.cpm);
    if (cpmTok) tokens.add(`R$ ${cpmTok}`);
    if (typeof sib.reach === "number" && sib.reach >= 1000) {
      tokens.add(Math.round(sib.reach).toLocaleString("pt-BR"));
    }
  }

  return {
    names: Array.from(new Set(names)),
    distinctive_tokens: Array.from(tokens),
  };
}

export function detectCrossEntityLeakage(
  text: string,
  ctx?: Partial<VictoriaAnalysisContext> | null
): { leaked: boolean; matches: string[] } {
  const raw = String(text || "");
  if (!raw || !ctx?.isolated_sibling_blocklist) {
    return { leaked: false, matches: [] };
  }
  const ownTokens = new Set<string>();
  const ownSpend = ctx.financial?.spend;
  const ownReach = ctx.raw_metrics?.reach;
  const ownImpr = ctx.raw_metrics?.impressions;
  const ownResult = ctx.raw_metrics?.result_value;
  const ownCpr = ctx.raw_metrics?.cost_per_result;
  const ownCpm = ctx.raw_metrics?.cpm;
  const fmtBrl = (v?: number | null) =>
    typeof v === "number" && Number.isFinite(v)
      ? `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : "";
  [ownSpend, ownCpr, ownCpm].forEach((n) => {
    const f = fmtBrl(n);
    if (f) ownTokens.add(f.toLowerCase());
  });
  [ownReach, ownImpr, ownResult].forEach((n) => {
    if (typeof n === "number" && n > 0) ownTokens.add(Math.round(n).toLocaleString("pt-BR").toLowerCase());
  });

  const lowerText = raw.toLowerCase();
  const matches: string[] = [];

  for (const sibName of ctx.isolated_sibling_blocklist.names) {
    if (sibName && lowerText.includes(sibName.toLowerCase())) {
      matches.push(sibName);
    }
  }
  for (const tok of ctx.isolated_sibling_blocklist.distinctive_tokens) {
    const lt = tok.toLowerCase();
    if (!lt || ownTokens.has(lt)) continue;
    if (lowerText.includes(lt)) {
      matches.push(tok);
    }
  }

  return { leaked: matches.length > 0, matches };
}

export function hasAllMandatory10Sections(text: string): boolean {
  const raw = String(text || "").toLowerCase();
  return MANDATORY_10_SECTION_TITLES.every((title) => raw.includes(title.toLowerCase()));
}

export function matchesCanonicalContextIdentity(
  expected: Pick<
    VictoriaAnalysisContext,
    | "request_id"
    | "analysis_context_hash"
    | "ad_account_id"
    | "entity_level"
    | "entity_id"
    | "period"
    | "result_indicator"
    | "contract_version"
    | "prompt_version"
  >,
  received: Partial<{
    request_id: string | null;
    analysis_context_hash: string | null;
    ad_account_id: string | null;
    entity_level: string | null;
    entity_id: string | null;
    date_from: string | null;
    date_to: string | null;
    result_indicator: string | null;
    contract_version: string | null;
    prompt_version: string | null;
  }>
): { valid: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (received.request_id !== undefined && received.request_id !== expected.request_id) mismatches.push("request_id");
  if (received.analysis_context_hash !== undefined && received.analysis_context_hash !== expected.analysis_context_hash) mismatches.push("analysis_context_hash");
  if (received.ad_account_id !== undefined && received.ad_account_id !== expected.ad_account_id) mismatches.push("ad_account_id");
  if (received.entity_level !== undefined && received.entity_level !== expected.entity_level) mismatches.push("entity_level");
  if (received.entity_id !== undefined && received.entity_id !== expected.entity_id) mismatches.push("entity_id");
  if (received.date_from !== undefined && received.date_from !== expected.period.date_from) mismatches.push("date_from");
  if (received.date_to !== undefined && received.date_to !== expected.period.date_to) mismatches.push("date_to");
  if (received.result_indicator !== undefined && received.result_indicator !== expected.result_indicator.code) mismatches.push("result_indicator");
  if (received.contract_version !== undefined && received.contract_version !== expected.contract_version) mismatches.push("contract_version");
  if (received.prompt_version !== undefined && received.prompt_version !== expected.prompt_version) mismatches.push("prompt_version");

  return { valid: mismatches.length === 0, mismatches };
}

/**
 * Sanitiza o texto de resposta para impedir vazamento de unidade cruzada (ex: chamar Reach de CPL ou comparar CPM com custo por conversa),
 * remover blocos json:action em modo somente-leitura, remover linguagem teatral/ofensiva e bloquear alegações universais não auditadas.
 */
export function sanitizeVictoriaOutputText(
  rawText: string,
  ctx?: Partial<VictoriaAnalysisContext> | null
): string {
  if (!rawText) return "";
  let text = String(rawText);

  // 0. Bloquear blocos json:action quando o modo é READ_ONLY_ANALYSIS ou janela < 3 dias
  const isReadOnly =
    !ctx ||
    ctx.operational_mode !== "ACTION_PROPOSAL" ||
    (ctx.period?.days_count ?? 1) < 3;
  if (isReadOnly) {
    text = text.replace(/```json:action[\s\S]*?```/gi, "").trim();
  }

  // 1. Remover apelidos proibidos e linguagem teatral/ofensiva
  text = text
    .replace(/\bComandante\b/gi, "Parceiro")
    .replace(/falhando\s+miseravelmente/gi, "apresentando desempenho abaixo do esperado")
    .replace(/\bp[íi]fi[oa]s?\b/gi, "abaixo da referência")
    .replace(/\binaceit[áa]vel\b/gi, "acima do limite operacional")
    .replace(/desastre\s+total/gi, "ponto de atenção operacional");

  // 2. Remover alegações universais não verificáveis e promessas de crédito proibidas
  text = text
    .replace(/54%\s+mais\s+(conversas|cliques|leads)[^.\n]*/gi, "maior aderência visual em testes criativos (hipótese sujeita a validação na conta)")
    .replace(/reduz\s+o\s+CPL\s+efetivo\s+pela\s+metade/gi, "contribui para preservar a intenção de contato do lead")
    .replace(/probabilidade\s+de\s+fechamento\s+cai\s+em\s+80%/gi, "a demora no atendimento pode reduzir a taxa de aproveitamento comercial")
    .replace(/0-5\s*min\s*(?:→|->|:)\s*80%\+?\s*(?:de\s*)?convers[ãa]o/gi, "atendimento rápido favorece a continuidade da conversa")
    .replace(/sem\s+consulta\s+(?:ao\s+)?SPC(?:\s*\/\s*Serasa)?/gi, "sujeito à análise formal de crédito")
    .replace(/CPF\s+limpo\s+aprovado\s+na\s+hora/gi, "condições sujeitas à análise de crédito");

  // 3. Se o objetivo for REACH, proibir estritamente o rótulo "CPL" ou "Custo por Lead" ou comparação com custo por conversa
  const cat = ctx?.optimization?.category;
  if (cat === "REACH") {
    text = text
      .replace(/\bCPL\s+Atual\b/gi, "Custo por 1.000 pessoas alcançadas")
      .replace(/\bCPL\s+de\s+R\$/gi, "Custo por 1.000 pessoas alcançadas de R$")
      .replace(/\bCPL\s*:\s*R\$/gi, "Custo por 1.000 pessoas alcançadas: R$")
      .replace(/\bCPL\s+R\$/gi, "Custo por 1.000 pessoas alcançadas R$")
      .replace(/\bcusto\s+por\s+lead\s*\(\s*CPL\s*\)/gi, "custo por 1.000 pessoas alcançadas")
      .replace(/\bcusto\s+por\s+lead\b/gi, "custo por 1.000 pessoas alcançadas")
      .replace(/\bbaixar\s+o\s+CPL\b/gi, "otimizar o custo por 1.000 pessoas alcançadas")
      .replace(/\bmeta\s+de\s+CPL\b/gi, "referência de custo por 1.000 pessoas alcançadas")
      .replace(/\bCPL\b/g, "custo por 1.000 pessoas alcançadas");

    // Bloquear comparação indevida com custo por conversa de mensagens (ex.: R$ 7,93) em campanha de alcance
    text = text.replace(
      /[^.\n]*R\$\s*7[.,]93[^.\n]*\.?/gi,
      " (Nota de governança: Não há benchmark homogêneo disponível para comparação; métricas de alcance e CPM não são comparadas com o custo por conversa de campanhas de mensagens.)"
    );
  } else if (
    cat === "INSTAGRAM_PROFILE" ||
    cat === "LANDING_PAGE_VIEWS" ||
    cat === "LINK_CLICKS" ||
    cat === "VIDEO_VIEWS" ||
    cat === "ENGAGEMENT"
  ) {
    const replacementLabel = ctx?.result_indicator?.cost_label || "custo por resultado";
    text = text
      .replace(/\bCPL\s+Atual\b/gi, replacementLabel)
      .replace(/\bCPL\s+de\s+R\$/gi, `${replacementLabel} de R$`)
      .replace(/\bCPL\s*:\s*R\$/gi, `${replacementLabel}: R$`)
      .replace(/\bCPL\s+R\$/gi, `${replacementLabel} R$`)
      .replace(/\bcusto\s+por\s+lead\b/gi, replacementLabel)
      .replace(/\bCPL\b/g, replacementLabel);
  }

  return text.trim();
}

export function enforceVictoriaPostLlmGuardrails(
  rawText: string,
  ctx: VictoriaAnalysisContext,
  opts?: { requireFull10Sections?: boolean }
): {
  text: string;
  replacedByDeterministic: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const sanitized = sanitizeVictoriaOutputText(rawText, ctx);
  const leak = detectCrossEntityLeakage(sanitized, ctx);
  if (leak.leaked) {
    reasons.push(`cross_entity_leak:${leak.matches.join(",")}`);
  }
  const tooShortOrError =
    sanitized.length < 120 ||
    /^\[ERRO\s+\d+\]/i.test(sanitized) ||
    /tive um problema de comunicação/i.test(sanitized);
  if (tooShortOrError) {
    reasons.push("empty_or_provider_error");
  }
  if (opts?.requireFull10Sections !== false) {
    if (!sanitized.includes("O que esta campanha foi configurada para otimizar?")) {
      reasons.push("missing_opening_question");
    }
    if (!hasAllMandatory10Sections(sanitized)) {
      reasons.push("missing_mandatory_10_sections");
    }
  }

  if (reasons.length > 0) {
    return {
      text: generateSeniorStructuredAnalysis(ctx),
      replacedByDeterministic: true,
      reasons,
    };
  }

  return {
    text: sanitized,
    replacedByDeterministic: false,
    reasons: [],
  };
}

/**
 * Gera a análise sênior estruturada obrigatória em 10 seções (Contrato 2026.11.4) a partir do VictoriaAnalysisContext.
 * Garante 100% de fidelidade numérica, separação FATO / INFERÊNCIA / HIPÓTESE / RECOMENDAÇÃO, isolamento de unidade e fontes RAG.
 */
export function generateSeniorStructuredAnalysis(ctx: VictoriaAnalysisContext): string {
  const validation = validateVictoriaAnalysisContext(ctx);
  if (!validation.valid && validation.degradedResponse) {
    return validation.degradedResponse;
  }

  const fmtBRL = (n: number) =>
    `R$ ${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtNum = (n: number) => Number(n || 0).toLocaleString("pt-BR");
  const fmtPct = (n: number) =>
    `${Number(n || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

  const { raw_metrics: m, financial: f, period: p, optimization: opt, result_indicator: ind } = ctx;
  const cat = opt.category;
  const isSingleDay = p.days_count <= 1;
  const isShortSample = p.days_count < 3;

  const periodText =
    p.date_from === p.date_to
      ? `${p.date_from} (1 dia — intervalo inclusivo)`
      : `${p.date_from} a ${p.date_to} (${p.days_count} dias — intervalo inclusivo)`;

  const budgetText =
    f.daily_budget && f.daily_budget > 0
      ? `${fmtBRL(f.daily_budget)}/dia (${f.budget_type})`
      : f.lifetime_budget && f.lifetime_budget > 0
      ? `${fmtBRL(f.lifetime_budget)} vitalício (${f.budget_type})`
      : "Não informado nos metadados sincronizados";

  const homogeneousRef =
    ctx.governance_and_benchmarks.comparable_same_objective_avg !== null
      ? `Benchmark homogêneo na mesma unidade (${ind.cost_label}): **${fmtBRL(ctx.governance_and_benchmarks.comparable_same_objective_avg)}**.`
      : ctx.governance_and_benchmarks.account_max_cpl_target !== null
      ? `Meta operacional configurada na conta (mesma unidade): **${fmtBRL(ctx.governance_and_benchmarks.account_max_cpl_target)}**.`
      : "Não há benchmark homogêneo disponível para comparação.";

  // Seção 4: Indicadores primários e secundários (estritamente separados por objetivo/unidade)
  let indicatorsSection = "";
  if (cat === "REACH") {
    const costPer1kReach = m.cost_per_result !== null ? fmtBRL(m.cost_per_result) : "—";
    indicatorsSection = [
      `- **Indicador primário (fórmula explícita):** **${ind.cost_label}** = **${costPer1kReach}** (\`(spend / reach) × 1.000\` = \`(${fmtBRL(f.spend)} / ${fmtNum(m.reach)}) × 1.000\`).`,
      `- **Indicadores de entrega e cobertura:** **${fmtNum(m.reach)} pessoas alcançadas**, **${fmtNum(m.impressions)} impressões**, **CPM (custo por 1.000 impressões)** de **${fmtBRL(m.cpm)}** e **frequência média** de **${m.frequency.toFixed(2).replace(".", ",")}x**.`,
      `- **Indicadores secundários (cliques distintos — não são critério de otimização em Alcance):** **CTR (link)** de **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)} cliques no link** · \`CPC link: ${m.link_clicks > 0 ? fmtBRL(m.cpc_link) : "—"}\`) vs. **${fmtNum(m.all_clicks)} cliques totais** (\`CTR todos: ${fmtPct(m.ctr_all)}\`).`,
      `- **Benchmark comparativo:** ${homogeneousRef} Não há mistura de unidades (ex.: CPM ou custo por 1.000 alcançadas não são comparados com custo por conversa).`,
    ].join("\n");
  } else if (cat === "MESSAGES") {
    const cpaMsg = m.cost_per_result !== null ? fmtBRL(m.cost_per_result) : "— (0 conversas no período)";
    const clickToMsgRate =
      m.link_clicks > 0 ? `${((m.result_value / m.link_clicks) * 100).toFixed(2).replace(".", ",")}%` : "—";
    indicatorsSection = [
      `- **Indicador primário (fórmula explícita):** **${ind.cost_label}** = **${cpaMsg}** (\`spend / messaging_conversation_started_7d\` = \`${fmtBRL(f.spend)} / ${fmtNum(m.result_value)}\`), com taxa de clique-para-conversa de **${clickToMsgRate}**.`,
      `- **Indicadores secundários de entrega e cliques:** **CTR (link)** de **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)} cliques no link** · \`CPC link: ${m.link_clicks > 0 ? fmtBRL(m.cpc_link) : "—"}\`), **${fmtNum(m.all_clicks)} cliques totais** (\`CTR todos: ${fmtPct(m.ctr_all)}\`), **CPM** de **${fmtBRL(m.cpm)}** e **frequência** de **${m.frequency.toFixed(2).replace(".", ",")}x**.`,
      `- **Benchmark comparativo:** ${homogeneousRef}`,
    ].join("\n");
  } else {
    const unitCostStr = m.cost_per_result !== null ? fmtBRL(m.cost_per_result) : "—";
    indicatorsSection = [
      `- **Indicador primário (fórmula explícita):** **${ind.cost_label}** = **${unitCostStr}** (\`${ind.unit}\`).`,
      `- **Indicadores secundários:** **CTR (link)** de **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)} cliques no link** · \`CPC link: ${m.link_clicks > 0 ? fmtBRL(m.cpc_link) : "—"}\`) vs. **${fmtNum(m.all_clicks)} cliques totais** (\`CTR todos: ${fmtPct(m.ctr_all)}\`), **CPM** **${fmtBRL(m.cpm)}**, **frequência** **${m.frequency.toFixed(2).replace(".", ",")}x**.`,
      `- **Benchmark comparativo:** ${homogeneousRef}`,
    ].join("\n");
  }

  // Seção 6: Hipóteses
  let hypothesesSection = "";
  if (cat === "REACH") {
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Cobertura eficiente de topo de funil]** O custo por 1.000 pessoas alcançadas de **${m.cost_per_result !== null ? fmtBRL(m.cost_per_result) : "—"}** com CPM de **${fmtBRL(m.cpm)}** sugere inventário amplo e baixa pressão de frequência (**${m.frequency.toFixed(2).replace(".", ",")}x**).`,
      `  - *Evidência a favor:* **${fmtNum(m.reach)}** pessoas alcançadas com frequência próxima de 1x.`,
      `  - *Evidência contra / lacuna:* Amostra de apenas ${p.days_count} dia(s) e ausência do criativo/segmentação completa.`,
      `- **[HIPÓTESE 2 — Interação direcional secundária esperada no objetivo Alcance]** O \`CTR (link)\` de **${fmtPct(m.ctr_link)}** (**${fmtNum(m.link_clicks)}** cliques no link) em oposição a **${fmtNum(m.all_clicks)}** cliques totais é compatível com entregas otimizadas para \`${opt.optimization_goal}\` (exposição ampla, não clique/conversa).`,
      `  - *Evidência a favor:* Evento oficial configurado é \`reach\` (${opt.odax_objective}).`,
      `  - *Evidência contra / lacuna:* Peça criativa e presença de CTA não foram inspecionados neste contexto.`,
    ].join("\n");
  } else {
    const clickConvRatio = m.link_clicks > 0 ? (m.result_value / m.link_clicks) * 100 : 0;
    hypothesesSection = [
      `- **[HIPÓTESE 1 — Conversão pós-clique entre clique no link e resultado oficial]** A relação de **${fmtNum(m.result_value)} ${ind.label_plural}** sobre **${fmtNum(m.link_clicks)} cliques no link** (**${clickConvRatio.toFixed(1).replace(".", ",")}%**) reflete o filtro natural entre interesse inicial no anúncio e execução do evento \`${ind.code}\`.`,
      `  - *Evidência a favor:* \`CTR (link)\` de **${fmtPct(m.ctr_link)}** sustentando volume de **${fmtNum(m.result_value)}** eventos oficiais.`,
      `  - *Evidência contra / lacuna:* Sem telemetria de resposta no WhatsApp/CRM ou da experiência pós-clique.`,
      `- **[HIPÓTESE 2 — Variância de amostra curta (${p.days_count} dia${p.days_count > 1 ? "s" : ""})]** O custo unitário de **${m.cost_per_result_formatted}** está sujeito a oscilações diárias de leilão e não deve motivar decisões irreversíveis com amostra curta.`,
      `  - *Evidência a favor:* Janela restrita a **${p.days_count} dia(s)** (${fmtNum(m.impressions)} impressões).`,
      `  - *Evidência contra / lacuna:* Necessário comparar com histórico móvel de 7 dias da própria campanha.`,
    ].join("\n");
  }

  // Seção 7: Recomendações seguras (sem alteração mutável quando < 3 dias)
  const recommendationAction = isShortSample
    ? "MODO SOMENTE LEITURA (READ_ONLY_ANALYSIS): Manter orçamento, segmentação e status inalterados durante esta janela curta; observar janela acumulada mínima de 3 a 7 dias antes de propor qualquer ajuste."
    : "Avaliar eventual ajuste gradual e reversível de orçamento (<= ±15%–20%) apenas após aprovação humana explícita com pré-visualização e rollback documentado.";

  const recommendationsSection = [
    `- **[RECOMENDAÇÃO 1 — Preservação de Aprendizado e Segurança Operacional]**`,
    `  - **Problema observado:** Leitura baseada em janela de **${p.days_count} dia(s)** (${periodText}) com ausência de criativo/copy/público/CRM no contexto.`,
    `  - **Ação segura recomendada:** ${recommendationAction}`,
    `  - **Risco:** Baixo (reversível, não reinicia fase de aprendizado e não executa mutação automática no Meta Ads).`,
    `  - **Critério de acompanhamento:** Monitorar **${ind.cost_label.toLowerCase()}** e **frequência** ao longo de 72h a 7 dias.`,
  ].join("\n");

  // Seção 10: Fontes e documentos utilizados (RAG curado + contrato)
  const ragDocs = ctx.governance_and_benchmarks.rag_documents || [];
  const sourcesLines = [
    `- **Dados oficiais:** \`${ind.source}\` · Contrato \`${ctx.contract_version}\` · Prompt \`${ctx.prompt_version}\` · Request \`${ctx.request_id}\` · Context Hash \`${ctx.analysis_context_hash}\`.`,
    ragDocs.length > 0
      ? `- **Documentos RAG aprovados recuperados (${ragDocs.length}):** ${ragDocs
          .map((d) => `\`[${d.id}]\` **${d.title}** (\`${d.evidence_level}\` · v\`${d.version}\` · status \`${d.approval_status}\`)`)
          .join("; ")}.`
      : `- **Base de conhecimento RAG:** Nenhum documento específico recuperado para este diagnóstico isolado; aplicado integralmente o contrato determinístico \`${ctx.contract_version}\` (documentos \`REJECTED\` e \`UNVERIFIED\` excluídos por governança).`,
  ];

  const output = [
    `### 🧭 O que esta campanha foi configurada para otimizar?`,
    `Esta entidade (**${ctx.entity_name}** · ID \`${ctx.entity_id}\`) está configurada sob o objetivo **${opt.odax_objective}** (\`optimization_goal: ${opt.optimization_goal}\`), otimizando oficialmente para **${ind.label_plural}** (evento oficial: \`${opt.official_result_event}\`, unidade: **${ind.cost_label}** — \`${ind.unit}\`).`,
    "",
    `#### 1. Escopo analisado`,
    `- **Conta:** ${ctx.ad_account_name} (\`${ctx.ad_account_id}\`) | **Entidade:** ${ctx.entity_name} (\`${ctx.entity_level}\` · ID \`${ctx.entity_id}\`) | **Status:** \`${ctx.effective_status}\``,
    `- **Período:** ${periodText} | **Timezone:** \`${p.timezone}\` | **Modo:** \`${ctx.operational_mode || VICTORIA_DEFAULT_OPERATIONAL_MODE}\``,
    `- **Versão do contrato:** \`${ctx.contract_version}\` | **Prompt:** \`${ctx.prompt_version}\` | **Context Hash:** \`${ctx.analysis_context_hash}\``,
    "",
    `#### 2. Objetivo e evento oficial`,
    `- **O que esta campanha foi configurada para otimizar?** Otimização configurada para **${ind.label_plural}** (\`objective: ${opt.odax_objective}\` · \`optimization_goal: ${opt.optimization_goal}\` · evento oficial \`${ind.code}\`).`,
    `- **Unidade oficial de custo:** **${ind.cost_label}** (\`${ind.unit}\`). Rótulos incompatíveis com este objetivo permanecem bloqueados.`,
    "",
    `#### 3. Leitura factual`,
    `- **[FATO OBSERVADO]** **Investimento (Spend):** ${fmtBRL(f.spend)} | **Orçamento configurado:** ${budgetText}`,
    `- **[FATO OBSERVADO]** **Resultado oficial (${ind.label_plural}):** **${fmtNum(m.result_value)}** | **${ind.cost_label}:** **${m.cost_per_result_formatted}**`,
    `- **[FATO OBSERVADO]** **Exposição:** **${fmtNum(m.impressions)}** impressões | **${fmtNum(m.reach)}** pessoas alcançadas (\`${m.reach_scope}\`) | **Frequência:** **${m.frequency.toFixed(2).replace(".", ",")}x** | **CPM:** **${fmtBRL(m.cpm)}**`,
    `- **[FATO OBSERVADO]** **Cliques separados por tipo:** **${fmtNum(m.link_clicks)}** cliques no link (\`CTR link: ${fmtPct(m.ctr_link)}\` · \`CPC link: ${m.link_clicks > 0 ? fmtBRL(m.cpc_link) : "—"}\`) | **${fmtNum(m.all_clicks)}** cliques totais (\`CTR todos: ${fmtPct(m.ctr_all)}\`)`,
    "",
    `#### 4. Indicadores primários e secundários`,
    indicatorsSection,
    "",
    `#### 5. Limitações e dados ausentes`,
    ...ctx.limitations.map((lim) => `- ${lim}`),
    "",
    `#### 6. Hipóteses`,
    hypothesesSection,
    "",
    `#### 7. Recomendações seguras`,
    recommendationsSection,
    "",
    `#### 8. Plano de validação`,
    `- **Passo 1 (Janela mínima):** Aguardar o fechamento de **3 a 7 dias** acumulados da mesma campanha (**${ctx.entity_name}**) antes de concluir tendência ou propor mudança de orçamento.`,
    `- **Passo 2 (Critério objetivo na unidade oficial):** Validar estabilidade do **${ind.cost_label}**, do **CPM**, da **frequência** e, no caso de mensagens/leads, da relação entre **cliques no link** e **${ind.label_plural}**.`,
    `- **Passo 3 (Governança):** Nenhuma alteração é executada automaticamente no Meta Ads. Alterações futuras exigem solicitação explícita em \`ACTION_PROPOSAL\`, orçamento conhecido, preview e plano de rollback.`,
    "",
    `#### 9. Nível de confiança`,
    `- **Nível de confiança:** **${ctx.confidence_level.toUpperCase()}**`,
    `- **Justificativa:** ${ctx.confidence_justification}`,
    "",
    `#### 10. Fontes e documentos utilizados`,
    ...sourcesLines,
  ].join("\n");

  return sanitizeVictoriaOutputText(output, ctx);
}

/**
 * Controlador de isolamento de sessão, concorrência e cancelamento (AbortController) para gavetas, modais e chats da Victoria (Contrato 2026.11.4).
 */
export class VictoriaSessionController {
  private activeRequestId: string | null = null;
  private activeContextHash: string | null = null;
  private activeEntityKey: string | null = null;
  private activePeriodKey: string | null = null;
  private activeIndicatorCode: string | null = null;
  private activeContractVersion: string | null = null;
  private activePromptVersion: string | null = null;
  private activeAbortController: AbortController | null = null;
  private responseCache = new Map<string, { text: string; createdAt: number; contextHash: string; entityId: string; contractVersion: string; promptVersion: string }>();

  public beginRequest(params: {
    ctx: VictoriaAnalysisContext;
    userId?: string | null;
    conversationId?: string | null;
  }): {
    requestId: string;
    contextHash: string;
    cacheKey: string;
    signal: AbortSignal;
    cachedResponse: string | null;
  } {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort("ENTITY_OR_CONTEXT_SWITCHED");
      } catch {}
    }

    const controller = new AbortController();
    this.activeAbortController = controller;
    this.activeRequestId = params.ctx.request_id;
    this.activeContextHash = params.ctx.analysis_context_hash;
    this.activeEntityKey = `${params.ctx.ad_account_id}::${params.ctx.entity_level}::${params.ctx.entity_id}`;
    this.activePeriodKey = `${params.ctx.period.date_from}..${params.ctx.period.date_to}`;
    this.activeIndicatorCode = params.ctx.result_indicator.code;
    this.activeContractVersion = params.ctx.contract_version;
    this.activePromptVersion = params.ctx.prompt_version;

    const cacheKey = buildVictoriaSessionCacheKey({
      userId: params.userId ?? params.ctx.user_id,
      conversationId: params.conversationId ?? params.ctx.conversation_id,
      accountId: params.ctx.ad_account_id,
      entityLevel: params.ctx.entity_level,
      entityId: params.ctx.entity_id,
      dateFrom: params.ctx.period.date_from,
      dateTo: params.ctx.period.date_to,
      contextHash: params.ctx.analysis_context_hash,
      modelVersion: params.ctx.model_version,
      promptVersion: params.ctx.prompt_version,
    });

    const cached = this.responseCache.get(cacheKey);
    const isFreshCache =
      cached &&
      cached.contextHash === params.ctx.analysis_context_hash &&
      cached.entityId === params.ctx.entity_id &&
      cached.contractVersion === params.ctx.contract_version &&
      cached.promptVersion === params.ctx.prompt_version &&
      Date.now() - cached.createdAt < 5 * 60 * 1000;

    return {
      requestId: params.ctx.request_id,
      contextHash: params.ctx.analysis_context_hash,
      cacheKey,
      signal: controller.signal,
      cachedResponse: isFreshCache ? cached.text : null,
    };
  }

  public canRenderToken(params: {
    requestId: string;
    contextHash: string;
    accountId: string;
    entityLevel: VictoriaEntityLevel;
    entityId: string;
    dateFrom?: string;
    dateTo?: string;
    resultIndicator?: string;
    contractVersion?: string;
    promptVersion?: string;
  }): boolean {
    const entityKey = `${params.accountId}::${params.entityLevel}::${params.entityId}`;
    if (
      this.activeRequestId !== params.requestId ||
      this.activeContextHash !== params.contextHash ||
      this.activeEntityKey !== entityKey ||
      this.activeAbortController === null ||
      this.activeAbortController.signal.aborted
    ) {
      return false;
    }
    if (params.dateFrom && params.dateTo && this.activePeriodKey !== `${params.dateFrom}..${params.dateTo}`) {
      return false;
    }
    if (params.resultIndicator && this.activeIndicatorCode !== params.resultIndicator) {
      return false;
    }
    if (params.contractVersion && this.activeContractVersion !== params.contractVersion) {
      return false;
    }
    if (params.promptVersion && this.activePromptVersion !== params.promptVersion) {
      return false;
    }
    return true;
  }

  public commitResponse(params: {
    cacheKey: string;
    requestId: string;
    contextHash: string;
    accountId: string;
    entityLevel: VictoriaEntityLevel;
    entityId: string;
    dateFrom?: string;
    dateTo?: string;
    resultIndicator?: string;
    contractVersion?: string;
    promptVersion?: string;
    text: string;
  }): boolean {
    if (
      !this.canRenderToken({
        requestId: params.requestId,
        contextHash: params.contextHash,
        accountId: params.accountId,
        entityLevel: params.entityLevel,
        entityId: params.entityId,
        dateFrom: params.dateFrom,
        dateTo: params.dateTo,
        resultIndicator: params.resultIndicator,
        contractVersion: params.contractVersion,
        promptVersion: params.promptVersion,
      })
    ) {
      return false;
    }
    this.responseCache.set(params.cacheKey, {
      text: params.text,
      createdAt: Date.now(),
      contextHash: params.contextHash,
      entityId: params.entityId,
      contractVersion: this.activeContractVersion || VICTORIA_CONTRACT_VERSION,
      promptVersion: this.activePromptVersion || VICTORIA_PROMPT_VERSION,
    });
    return true;
  }

  public abortActive(): void {
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort("MANUAL_ABORT");
      } catch {}
    }
    this.activeAbortController = null;
    this.activeRequestId = null;
    this.activeContextHash = null;
    this.activeEntityKey = null;
    this.activePeriodKey = null;
    this.activeIndicatorCode = null;
    this.activeContractVersion = null;
    this.activePromptVersion = null;
  }

  public clearCache(): void {
    this.responseCache.clear();
  }
}
