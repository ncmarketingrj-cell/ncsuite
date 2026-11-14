// src/lib/metricsDomain.ts
// Camada semântica compartilhada da NC Performance Suite:
// - Datas civis (DateOnly) sem deslocamento de fuso UTC/local
// - Modelo explícito de eventos Meta (separando objetivo bruto, optimization_goal, destino e unidade)
// - Agregações ponderadas, custo por 1.000 alcançados e divisão por zero segura (null, nunca R$ 0,00)
// - Precedência única de metas e motor de diagnóstico unificado
// - Snapshot imutável de relatórios (única fonte para texto WhatsApp, prévia visual e PDF)

import {
  type MetricVector,
  type NormalizedResultCategory,
  emptyMetricVector,
  accumulateMetricVector,
  formatMetricVectorSummary,
} from "./metaIntegrationCore.ts";

export type { MetricVector, NormalizedResultCategory };
export { emptyMetricVector, accumulateMetricVector, formatMetricVectorSummary };

export const EVENT_MODEL_VERSION = "2026.11.2";

export type DataLoadState =
  | "initial"
  | "loading"
  | "success"
  | "partial"
  | "stale"
  | "error"
  | "empty";

export type MetaConversionCategory =
  | "MESSAGES"
  | "INSTAGRAM_PROFILE"
  | "LANDING_PAGE_VIEWS"
  | "PURCHASES"
  | "LEADS"
  | "CHECKOUT"
  | "ADD_TO_CART"
  | "VIDEO_VIEWS"
  | "ENGAGEMENT"
  | "REACH"
  | "LINK_CLICKS"
  | "UNKNOWN";

export interface QueryScopeContext {
  workspaceId?: string | null;
  clientId?: string | null;
  adAccountId: string; // "all" ou ID
  socialAccountId?: string | null;
  campaignId?: string | null;
  adSetId?: string | null;
  adId?: string | null;
  granularity: "account" | "campaign" | "adset" | "ad";
  statusFilter: "all" | "active" | "paused";
  statusMeaning: "current_status" | "active_in_period";
  dateFrom: string; // YYYY-MM-DD civil
  dateTo: string;   // YYYY-MM-DD civil
  timezone: string; // ex: "America/Sao_Paulo"
  currency: string; // ex: "BRL"
  selectedEvent?: MetaConversionCategory | "ALL";
  attributionWindow?: string; // ex: "7d_click_1d_view"
  actionReportTime?: "impression" | "conversion" | "mixed";
  source: string;
  queryVersion: string;
  updatedAt?: string | null;
  loadState: DataLoadState;
  completeness: "complete" | "partial" | "unknown" | "unavailable";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DATAS CIVIS (DateOnly YYYY-MM-DD — imune a deslocamento UTC -> America/Sao_Paulo)
// ─────────────────────────────────────────────────────────────────────────────

export interface CivilDateParts {
  year: number;
  month: number; // 1..12
  day: number;   // 1..31
}

export function parseCivilDate(dateStr: string): CivilDateParts | null {
  if (!dateStr || typeof dateStr !== "string") return null;
  const clean = dateStr.trim().split("T")[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const maxDay = daysInCivilMonth(year, month);
  if (day > maxDay) return null;
  return { year, month, day };
}

export function daysInCivilMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

export function toCivilDateString(parts: CivilDateParts): string {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function formatCivilDateBR(dateStr: string): string {
  const p = parseCivilDate(dateStr);
  if (!p) return dateStr;
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
}

export function isFullCalendarMonth(dateFrom: string, dateTo: string): boolean {
  const s = parseCivilDate(dateFrom);
  const e = parseCivilDate(dateTo);
  if (!s || !e) return false;
  if (s.year !== e.year || s.month !== e.month) return false;
  return s.day === 1 && e.day === daysInCivilMonth(e.year, e.month);
}

const MONTHS_PT_UPPER = [
  "JANEIRO", "FEVEREIRO", "MARÇO", "ABRIL", "MAIO", "JUNHO",
  "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO",
];

export function formatPeriodLabel(dateFrom: string, dateTo: string): {
  label: string;
  isSingleDay: boolean;
  isFullMonth: boolean;
  reportTitlePrefix: string;
} {
  const s = parseCivilDate(dateFrom);
  const e = parseCivilDate(dateTo);
  if (!s || !e) {
    return {
      label: dateFrom === dateTo ? formatCivilDateBR(dateFrom) : `${formatCivilDateBR(dateFrom)} a ${formatCivilDateBR(dateTo)}`,
      isSingleDay: dateFrom === dateTo,
      isFullMonth: false,
      reportTitlePrefix: "Relatório de performance",
    };
  }

  const sNorm = toCivilDateString(s);
  const eNorm = toCivilDateString(e);

  if (sNorm === eNorm) {
    return {
      label: formatCivilDateBR(sNorm),
      isSingleDay: true,
      isFullMonth: false,
      reportTitlePrefix: "Relatório diário",
    };
  }

  if (isFullCalendarMonth(sNorm, eNorm)) {
    return {
      label: `${MONTHS_PT_UPPER[s.month - 1]} ${s.year}`,
      isSingleDay: false,
      isFullMonth: true,
      reportTitlePrefix: "Relatório mensal",
    };
  }

  return {
    label: `${formatCivilDateBR(sNorm)} a ${formatCivilDateBR(eNorm)}`,
    isSingleDay: false,
    isFullMonth: false,
    reportTitlePrefix: "Relatório de performance",
  };
}

export function isDateWithinCivilRange(dateStr: string, dateFrom: string, dateTo: string): boolean {
  const p = parseCivilDate(dateStr);
  const s = parseCivilDate(dateFrom);
  const e = parseCivilDate(dateTo);
  if (!p || !s || !e) return false;
  const v = toCivilDateString(p);
  return v >= toCivilDateString(s) && v <= toCivilDateString(e);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MODELO EXPLÍCITO DE EVENTOS META
// ─────────────────────────────────────────────────────────────────────────────

export type EditorialReportGroup =
  | "MESSAGES_VEHICLES"
  | "MESSAGES_GENERAL"
  | "LEADS_CONSIGNADO"
  | "LEADS_FORM"
  | "PURCHASES"
  | "LANDING_PAGE"
  | "INSTAGRAM_PROFILE"
  | "REACH_AWARENESS"
  | "LINK_CLICKS"
  | "ENGAGEMENT"
  | "VIDEO_VIEWS"
  | "REVIEW_REQUIRED";

export type ClassificationConfidence = "high" | "medium" | "low" | "unknown";

export interface EventClassification {
  modelVersion: string;
  rawObjective: string;
  optimizationGoal: string;
  destinationType: string;
  primaryMetric: string;
  category: MetaConversionCategory;
  unitSingular: string;
  unitPlural: string;
  costUnitLabel: string;
  shortBadge: string;
  channel: "whatsapp_direct" | "website" | "instagram" | "lead_form" | "awareness" | "feed" | "unknown";
  editorialGroup: EditorialReportGroup;
  isConversionGoal: boolean; // true apenas para objetivos de conversão comercial direta (Mensagens, Cadastros, Compras)
  confidence: ClassificationConfidence;
  source: "meta_indicator" | "optimization_goal" | "result_type" | "meta_objective" | "actions_payload" | "name_heuristic" | "fallback";
  requiresReview: boolean;
}

export interface ClassifyMetaEventInput {
  campaignName?: string;
  rawObjective?: string;
  optimizationGoal?: string;
  resultType?: string;
  destinationType?: string;
  resultsIndicator?: string;
  actions?: Array<{ action_type?: string; value?: any; [k: string]: any }>;
  isVehicleContext?: boolean;
}

function buildDetailFromCategory(
  category: MetaConversionCategory,
  input: ClassifyMetaEventInput,
  confidence: ClassificationConfidence,
  source: EventClassification["source"]
): EventClassification {
  const nameLower = (input.campaignName || "").toLowerCase();
  const isConsignado = /consignado|compramos seu carro|avalia[çc][ãa]o/i.test(nameLower);
  const rawObjective = (input.rawObjective || "").toUpperCase();
  const optimizationGoal = (input.optimizationGoal || "").toUpperCase();
  const destinationType = (input.destinationType || "").toUpperCase();

  switch (category) {
    case "MESSAGES":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "MESSAGING",
        primaryMetric: "onsite_conversion.messaging_conversation_started_7d",
        category,
        unitSingular: "conversa iniciada",
        unitPlural: "conversas iniciadas",
        costUnitLabel: "Por conversa por mensagem iniciada",
        shortBadge: "MENSAGENS",
        channel: "whatsapp_direct",
        editorialGroup: isConsignado
          ? "LEADS_CONSIGNADO"
          : input.isVehicleContext
          ? "MESSAGES_VEHICLES"
          : "MESSAGES_GENERAL",
        isConversionGoal: true,
        confidence,
        source,
        requiresReview: false,
      };

    case "LEADS":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "LEAD_FORM",
        primaryMetric: "lead",
        category,
        unitSingular: "cadastro",
        unitPlural: "cadastros",
        costUnitLabel: "Por cadastro / lead",
        shortBadge: "CADASTROS",
        channel: "lead_form",
        editorialGroup: isConsignado ? "LEADS_CONSIGNADO" : "LEADS_FORM",
        isConversionGoal: true,
        confidence,
        source,
        requiresReview: false,
      };

    case "PURCHASES":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "WEBSITE",
        primaryMetric: "purchase",
        category,
        unitSingular: "compra",
        unitPlural: "compras",
        costUnitLabel: "Por compra",
        shortBadge: "COMPRAS",
        channel: "website",
        editorialGroup: "PURCHASES",
        isConversionGoal: true,
        confidence,
        source,
        requiresReview: false,
      };

    case "LANDING_PAGE_VIEWS":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "WEBSITE",
        primaryMetric: "landing_page_view",
        category,
        unitSingular: "visualização da página de destino",
        unitPlural: "visualizações da página de destino",
        costUnitLabel: "Por visualização da página de destino",
        shortBadge: "SITE / LP",
        channel: "website",
        editorialGroup: "LANDING_PAGE",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "INSTAGRAM_PROFILE":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "INSTAGRAM_PROFILE",
        primaryMetric: "profile_visit",
        category,
        unitSingular: "visita ao perfil do Instagram",
        unitPlural: "visitas ao perfil do Instagram",
        costUnitLabel: "Por visita ao perfil do Instagram",
        shortBadge: "PERFIL INSTA",
        channel: "instagram",
        editorialGroup: "INSTAGRAM_PROFILE",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "REACH":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "AWARENESS",
        primaryMetric: "reach",
        category,
        unitSingular: "pessoa alcançada",
        unitPlural: "pessoas alcançadas",
        costUnitLabel: "Por 1.000 pessoas alcançadas",
        shortBadge: "ALCANCE",
        channel: "awareness",
        editorialGroup: "REACH_AWARENESS",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "VIDEO_VIEWS":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "VIDEO",
        primaryMetric: "video_thruplay",
        category,
        unitSingular: "ThruPlay",
        unitPlural: "ThruPlays",
        costUnitLabel: "Por ThruPlay",
        shortBadge: "THRUPLAY",
        channel: "awareness",
        editorialGroup: "VIDEO_VIEWS",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "ENGAGEMENT":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "POST",
        primaryMetric: "post_engagement",
        category,
        unitSingular: "engajamento com a publicação",
        unitPlural: "engajamentos com a publicação",
        costUnitLabel: "Por engajamento com a publicação",
        shortBadge: "ENGAJAMENTO",
        channel: "feed",
        editorialGroup: "ENGAGEMENT",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "LINK_CLICKS":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "WEBSITE",
        primaryMetric: "inline_link_clicks",
        category,
        unitSingular: "clique no link",
        unitPlural: "cliques no link",
        costUnitLabel: "Por clique no link",
        shortBadge: "CLIQUES",
        channel: "website",
        editorialGroup: "LINK_CLICKS",
        isConversionGoal: false,
        confidence,
        source,
        requiresReview: false,
      };

    case "CHECKOUT":
    case "ADD_TO_CART":
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "WEBSITE",
        primaryMetric: category === "CHECKOUT" ? "initiate_checkout" : "add_to_cart",
        category,
        unitSingular: category === "CHECKOUT" ? "finalização iniciada" : "adição ao carrinho",
        unitPlural: category === "CHECKOUT" ? "finalizações iniciadas" : "adições ao carrinho",
        costUnitLabel: category === "CHECKOUT" ? "Por finalização iniciada" : "Por adição ao carrinho",
        shortBadge: category === "CHECKOUT" ? "CHECKOUT" : "CARRINHO",
        channel: "website",
        editorialGroup: "PURCHASES",
        isConversionGoal: true,
        confidence,
        source,
        requiresReview: false,
      };

    default:
      return {
        modelVersion: EVENT_MODEL_VERSION,
        rawObjective,
        optimizationGoal,
        destinationType: destinationType || "UNKNOWN",
        primaryMetric: "unknown",
        category: "UNKNOWN",
        unitSingular: "resultado (revisar evento)",
        unitPlural: "resultados (revisar evento)",
        costUnitLabel: "Por resultado (evento não classificado)",
        shortBadge: "REVISAR EVENTO",
        channel: "unknown",
        editorialGroup: "REVIEW_REQUIRED",
        isConversionGoal: false,
        confidence: "unknown",
        source: "fallback",
        requiresReview: true,
      };
  }
}

export function classifyMetaEvent(input: ClassifyMetaEventInput): EventClassification {
  const indicator = (input.resultsIndicator || "").toLowerCase();
  const rt = (input.resultType || "").trim();
  const rtUpper = rt.toUpperCase();
  const rtLower = rt.toLowerCase();
  const opt = (input.optimizationGoal || "").toUpperCase();
  const obj = (input.rawObjective || "").toUpperCase();
  const dest = (input.destinationType || "").toUpperCase();
  const actions = Array.isArray(input.actions) ? input.actions : [];

  // 1. Meta API results[0].indicator (fonte oficial de mais alta confiança)
  if (indicator) {
    if (indicator.includes("page_visit")) {
      return {
        ...buildDetailFromCategory("ENGAGEMENT", input, "high", "meta_indicator"),
        primaryMetric: "page_visit_view",
        unitSingular: "visita à página",
        unitPlural: "visitas à página",
        costUnitLabel: "Por visita à página",
        shortBadge: "VISITAS PÁGINA",
      };
    }
    if (indicator.includes("purchase")) return buildDetailFromCategory("PURCHASES", input, "high", "meta_indicator");
    if (indicator.includes("landing_page_view")) return buildDetailFromCategory("LANDING_PAGE_VIEWS", input, "high", "meta_indicator");
    if (indicator.includes("profile_visit") || indicator.includes("instagram_profile")) return buildDetailFromCategory("INSTAGRAM_PROFILE", input, "high", "meta_indicator");
    if (indicator.includes("messaging")) return buildDetailFromCategory("MESSAGES", input, "high", "meta_indicator");
    if (indicator.includes("contact_website")) {
      return {
        ...buildDetailFromCategory("LEADS", input, "high", "meta_indicator"),
        primaryMetric: "conversions:contact_website",
        unitSingular: "contato no site",
        unitPlural: "contatos no site",
        costUnitLabel: "Por contato no site",
        shortBadge: "CONTATOS SITE",
      };
    }
    if (indicator.includes("lead") || indicator.includes("registration")) return buildDetailFromCategory("LEADS", input, "high", "meta_indicator");
    if (indicator.includes("thruplay") || indicator.includes("video_view")) return buildDetailFromCategory("VIDEO_VIEWS", input, "high", "meta_indicator");
    if (indicator === "reach" || indicator === "impressions") return buildDetailFromCategory("REACH", input, "high", "meta_indicator");
    if (indicator === "like" || indicator === "actions:like" || indicator.endsWith(":like")) {
      return {
        ...buildDetailFromCategory("ENGAGEMENT", input, "high", "meta_indicator"),
        primaryMetric: "like",
        unitSingular: "curtida na página",
        unitPlural: "curtidas na página",
        costUnitLabel: "Por curtida na página",
        shortBadge: "CURTIDAS",
      };
    }
    if (indicator.includes("post_engagement") || indicator.includes("page_engagement")) return buildDetailFromCategory("ENGAGEMENT", input, "high", "meta_indicator");
    if (indicator.includes("link_click")) return buildDetailFromCategory("LINK_CLICKS", input, "high", "meta_indicator");
  }

  // 2. optimization_goal / destination_type explícitos da Meta
  if (opt) {
    if (opt === "REPLIES" || opt === "CONVERSATIONS" || dest === "WHATSAPP" || dest === "MESSAGING") {
      return buildDetailFromCategory("MESSAGES", input, "high", "optimization_goal");
    }
    if (opt === "LANDING_PAGE_VIEWS") return buildDetailFromCategory("LANDING_PAGE_VIEWS", input, "high", "optimization_goal");
    if (opt === "VISIT_INSTAGRAM_PROFILE" || opt === "PROFILE_VISIT") return buildDetailFromCategory("INSTAGRAM_PROFILE", input, "high", "optimization_goal");
    if (opt === "PURCHASE" || opt === "PURCHASES" || opt === "VALUE") return buildDetailFromCategory("PURCHASES", input, "high", "optimization_goal");
    if (opt === "LEAD" || opt === "LEADS" || opt === "LEAD_GENERATION" || opt === "QUALITY_LEAD") return buildDetailFromCategory("LEADS", input, "high", "optimization_goal");
    if (opt === "REACH" || opt === "AD_RECALL_LIFT") return buildDetailFromCategory("REACH", input, "high", "optimization_goal");
    if (opt === "THRUPLAY" || opt === "VIDEO_VIEWS") return buildDetailFromCategory("VIDEO_VIEWS", input, "high", "optimization_goal");
    if (opt === "POST_ENGAGEMENT") return buildDetailFromCategory("ENGAGEMENT", input, "high", "optimization_goal");
    if (opt === "LINK_CLICKS") return buildDetailFromCategory("LINK_CLICKS", input, "high", "optimization_goal");
  }

  // 3. result_type já normalizado no banco (ex: "MESSAGES", "LANDING_PAGE_VIEWS", "INSTAGRAM_PROFILE", "REACH")
  const knownCategories: MetaConversionCategory[] = [
    "MESSAGES",
    "INSTAGRAM_PROFILE",
    "LANDING_PAGE_VIEWS",
    "PURCHASES",
    "LEADS",
    "CHECKOUT",
    "ADD_TO_CART",
    "VIDEO_VIEWS",
    "ENGAGEMENT",
    "REACH",
    "LINK_CLICKS",
  ];
  if (knownCategories.includes(rtUpper as MetaConversionCategory)) {
    return buildDetailFromCategory(rtUpper as MetaConversionCategory, input, "high", "result_type");
  }

  // Também aceita rótulos em PT ou indicadores Meta exatos armazenados em result_type
  if (rtLower) {
    if (rtLower.includes("mensagem") || rtLower.includes("conversa") || rtLower.includes("whatsapp") || rtLower.includes("messaging")) {
      return buildDetailFromCategory("MESSAGES", input, "high", "result_type");
    }
    if (rtLower.includes("perfil") || rtLower.includes("profile_visit") || rtLower.includes("instagram_profile")) {
      return buildDetailFromCategory("INSTAGRAM_PROFILE", input, "high", "result_type");
    }
    if (rtLower.includes("página") || rtLower.includes("pagina") || rtLower.includes("landing_page")) {
      return buildDetailFromCategory("LANDING_PAGE_VIEWS", input, "high", "result_type");
    }
    if (rtLower.includes("compra") || rtLower.includes("venda") || rtLower.includes("purchase")) {
      return buildDetailFromCategory("PURCHASES", input, "high", "result_type");
    }
    if (rtLower.includes("cadastro") || rtLower.includes("lead") || rtLower.includes("formulário") || rtLower.includes("formulario")) {
      return buildDetailFromCategory("LEADS", input, "high", "result_type");
    }
    if (rtLower.includes("alcance") || rtLower.includes("reach")) {
      return buildDetailFromCategory("REACH", input, "high", "result_type");
    }
    if (rtLower.includes("thruplay") || rtLower.includes("vídeo") || rtLower.includes("video")) {
      return buildDetailFromCategory("VIDEO_VIEWS", input, "high", "result_type");
    }
    if (rtLower.includes("engajamento") || rtLower.includes("curtida") || rtLower.includes("post_engagement")) {
      return buildDetailFromCategory("ENGAGEMENT", input, "high", "result_type");
    }
    if (rtLower.includes("clique") || rtLower.includes("link_click")) {
      return buildDetailFromCategory("LINK_CLICKS", input, "high", "result_type");
    }
  }

  // 4. Objective bruto da Meta combinando com actions (antes de heurística fraca de nome)
  if (obj === "OUTCOME_AWARENESS" || obj === "AWARENESS" || obj === "REACH") {
    return buildDetailFromCategory("REACH", input, "high", "meta_objective");
  }
  if (obj === "OUTCOME_SALES" || obj === "CATALOG_SALES") {
    return buildDetailFromCategory("PURCHASES", input, "high", "meta_objective");
  }
  if (obj === "MESSAGES") {
    return buildDetailFromCategory("MESSAGES", input, "high", "meta_objective");
  }
  if (obj === "VIDEO_VIEWS") {
    return buildDetailFromCategory("VIDEO_VIEWS", input, "high", "meta_objective");
  }

  // Actions payload quando disponível
  if (actions.length > 0) {
    const hasAct = (pred: (act: string) => boolean) =>
      actions.some((a) => pred(String(a.action_type || "").toLowerCase()));
    if (hasAct((a) => a.includes("messaging_conversation_started") || a === "whatsapp_conversation_started")) {
      return buildDetailFromCategory("MESSAGES", input, "high", "actions_payload");
    }
    if (hasAct((a) => a.includes("purchase"))) {
      return buildDetailFromCategory("PURCHASES", input, "medium", "actions_payload");
    }
    if (hasAct((a) => a.includes("profile_visit") || a.includes("instagram_profile"))) {
      return buildDetailFromCategory("INSTAGRAM_PROFILE", input, "medium", "actions_payload");
    }
    if (hasAct((a) => a.includes("landing_page_view"))) {
      return buildDetailFromCategory("LANDING_PAGE_VIEWS", input, "medium", "actions_payload");
    }
    if (hasAct((a) => a === "lead" || a.includes("leadgen") || a.includes("complete_registration"))) {
      return buildDetailFromCategory("LEADS", input, "medium", "actions_payload");
    }
  }

  if (obj === "OUTCOME_LEADS" || obj === "LEAD_GENERATION") {
    return buildDetailFromCategory("LEADS", input, "medium", "meta_objective");
  }

  if (obj === "OUTCOME_TRAFFIC" || obj === "LINK_CLICKS") {
    return buildDetailFromCategory("LINK_CLICKS", input, "medium", "meta_objective");
  }

  // Sem optimization_goal/actions confirmando conversas, nunca forcar OUTCOME_ENGAGEMENT nem inferir por nome de campanha!
  return buildDetailFromCategory("UNKNOWN", input, "unknown", "fallback");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. PRECISION-SAFE ARITHMETIC & FORMULAS
// ─────────────────────────────────────────────────────────────────────────────

export function roundCurrency(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + 1e-9) * 100) / 100;
}

export function roundPercent(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, decimals);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Calcula custo por unidade respeitando multiplicador x1000 para REACH e retornando null para resultado zero/inválido.
 * Nunca retorna R$ 0,00 quando results === 0 (Fixture C / D).
 */
export function computeUnitCost(
  cost: number,
  results: number,
  category: MetaConversionCategory
): number | null {
  if (!Number.isFinite(cost) || !Number.isFinite(results) || results <= 0 || cost < 0) {
    return null;
  }
  if (category === "REACH") {
    return (cost / results) * 1000;
  }
  return cost / results;
}

export function computeCtr(clicks: number, impressions: number): number | null {
  if (!Number.isFinite(clicks) || !Number.isFinite(impressions) || impressions <= 0) return null;
  return (clicks / impressions) * 100;
}

export function computeCpm(cost: number, impressions: number): number | null {
  if (!Number.isFinite(cost) || !Number.isFinite(impressions) || impressions <= 0) return null;
  return (cost / impressions) * 1000;
}

export function computeCpc(cost: number, clicks: number): number | null {
  if (!Number.isFinite(cost) || !Number.isFinite(clicks) || clicks <= 0) return null;
  return cost / clicks;
}

export function computeFrequency(impressions: number, reach: number): number | null {
  if (!Number.isFinite(impressions) || !Number.isFinite(reach) || reach <= 0) return null;
  return impressions / reach;
}

export interface CvrResult {
  value: number | null;
  isFunnelCompatible: boolean;
  reason?: string;
}

export function computeCvr(
  results: number,
  clicks: number,
  category: MetaConversionCategory
): CvrResult {
  if (!Number.isFinite(results) || !Number.isFinite(clicks) || clicks <= 0 || results < 0) {
    return { value: null, isFunnelCompatible: false, reason: "Cliques insuficientes para taxa de conversão" };
  }
  // Alcance/Engajamento/Vídeo não são etapas pós-clique no link
  if (category === "REACH" || category === "VIDEO_VIEWS" || category === "ENGAGEMENT" || category === "UNKNOWN") {
    return {
      value: null,
      isFunnelCompatible: false,
      reason: `Evento (${category}) não é etapa pós-clique no funil`,
    };
  }
  const ratio = (results / clicks) * 100;
  if (ratio > 100) {
    return {
      value: ratio,
      isFunnelCompatible: false,
      reason: "Razão >100% indica diferença de atribuição ou evento não subordinado a cliques no link",
    };
  }
  return { value: ratio, isFunnelCompatible: true };
}

export interface RawCampaignMetricRow {
  id: string;
  name: string;
  status?: string;
  rawObjective?: string;
  optimizationGoal?: string;
  resultType?: string;
  resultsIndicator?: string;
  cost: number;
  conversions: number; // Somente conversões/resultados reais do evento (NUNCA cliques fallback)
  clicks: number;
  inlineLinkClicks?: number;
  allClicks?: number;
  impressions: number;
  reach: number;
  reachIsDeduplicated?: boolean;
  isVehicleContext?: boolean;
}

export interface NormalizedCampaignItem extends RawCampaignMetricRow {
  classification: EventClassification;
  unitCost: number | null;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  frequency: number | null;
  cvr: CvrResult;
}

export function normalizeCampaignItem(row: RawCampaignMetricRow): NormalizedCampaignItem {
  const cost = Number.isFinite(row.cost) ? Math.max(0, row.cost) : 0;
  const conversions = Number.isFinite(row.conversions) ? Math.max(0, row.conversions) : 0;
  const clicks = Number.isFinite(row.clicks) ? Math.max(0, row.clicks) : 0;
  const impressions = Number.isFinite(row.impressions) ? Math.max(0, row.impressions) : 0;
  const reach = Number.isFinite(row.reach) ? Math.max(0, row.reach) : 0;

  const classification = classifyMetaEvent({
    campaignName: row.name,
    rawObjective: row.rawObjective,
    optimizationGoal: row.optimizationGoal,
    resultType: row.resultType,
    resultsIndicator: row.resultsIndicator,
    isVehicleContext: row.isVehicleContext,
  });

  // Para REACH, o denominador da unidade "Por 1.000 pessoas alcançadas" é o alcance (ou conversions se já espelha alcance)
  const effectiveResults = classification.category === "REACH" ? (reach > 0 ? reach : conversions) : conversions;

  return {
    ...row,
    cost,
    conversions: effectiveResults,
    clicks,
    impressions,
    reach,
    classification,
    unitCost: computeUnitCost(cost, effectiveResults, classification.category),
    ctr: computeCtr(clicks, impressions),
    cpm: computeCpm(cost, impressions),
    cpc: computeCpc(cost, clicks),
    frequency: computeFrequency(impressions, reach),
    cvr: computeCvr(effectiveResults, clicks, classification.category),
  };
}

export interface EventGroupAggregate {
  category: MetaConversionCategory;
  unitPlural: string;
  costUnitLabel: string;
  isConversionGoal: boolean;
  campaignCount: number;
  spend: number;
  results: number;
  clicks: number;
  impressions: number;
  reachSum: number;
  unitCost: number | null; // Calculado estritamente sobre spend do grupo / results do grupo
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  items: NormalizedCampaignItem[];
}

export interface WeightedAggregateSummary {
  totalMediaSpend: number;
  totalClicks: number;
  inlineLinkClicks: number;
  allClicks: number;
  totalImpressions: number;
  reachEstimateSum: number;
  accountDeduplicatedReach: number | null;
  hasDeduplicatedReach: boolean;
  reachLabel: string;
  ctr: number | null;
  ctrAll: number | null;
  cpm: number | null;
  cpc: number | null;
  // Separação estrita: apenas campanhas de conversão comercial direta (Mensagens, Cadastros, Compras)
  conversionSpend: number;
  conversionResults: number;
  cpaEligible: number | null; // conversionSpend / conversionResults
  blendedMediaCostPerConversion: number | null; // totalMediaSpend / conversionResults (rótulo separado!)
  // Separação específica de Mensagens (WhatsApp/Direct)
  messagesSpend: number;
  messagesCount: number;
  cpaMessages: number | null;
  hasMixedObjectives: boolean;
  groupsByCategory: EventGroupAggregate[];
  metricVector: MetricVector;
}

export function computeWeightedAggregates(
  rows: RawCampaignMetricRow[],
  options: { deduplicatedAccountReach?: number | null } = {}
): WeightedAggregateSummary {
  const normalized = rows.map(normalizeCampaignItem);
  const metricVector = emptyMetricVector();

  let totalMediaSpend = 0;
  let totalClicks = 0;
  let totalAllClicks = 0;
  let totalImpressions = 0;
  let reachEstimateSum = 0;
  let conversionSpend = 0;
  let conversionResults = 0;
  let messagesSpend = 0;
  let messagesCount = 0;

  const groupMap = new Map<MetaConversionCategory, NormalizedCampaignItem[]>();

  for (const item of normalized) {
    const linkClk = item.inlineLinkClicks ?? item.clicks;
    const allClk = item.allClicks ?? item.clicks;
    totalMediaSpend += item.cost;
    totalClicks += linkClk;
    totalAllClicks += allClk;
    totalImpressions += item.impressions;
    reachEstimateSum += item.reach;

    accumulateMetricVector(
      metricVector,
      item.classification.category as NormalizedResultCategory,
      item.conversions,
      item.resultsIndicator || item.classification.primaryMetric
    );

    if (item.classification.isConversionGoal) {
      conversionSpend += item.cost;
      conversionResults += item.conversions;
    }
    if (item.classification.category === "MESSAGES") {
      messagesSpend += item.cost;
      messagesCount += item.conversions;
    }

    const list = groupMap.get(item.classification.category) || [];
    list.push(item);
    groupMap.set(item.classification.category, list);
  }

  const groupsByCategory: EventGroupAggregate[] = Array.from(groupMap.entries()).map(([category, items]) => {
    const spend = items.reduce((s, x) => s + x.cost, 0);
    const results = items.reduce((s, x) => s + x.conversions, 0);
    const clicks = items.reduce((s, x) => s + (x.inlineLinkClicks ?? x.clicks), 0);
    const impressions = items.reduce((s, x) => s + x.impressions, 0);
    const reachSum = items.reduce((s, x) => s + x.reach, 0);
    const sample = items[0].classification;
    return {
      category,
      unitPlural: sample.unitPlural,
      costUnitLabel: sample.costUnitLabel,
      isConversionGoal: sample.isConversionGoal,
      campaignCount: items.length,
      spend,
      results,
      clicks,
      impressions,
      reachSum,
      unitCost: computeUnitCost(spend, results, category),
      ctr: computeCtr(clicks, impressions),
      cpm: computeCpm(spend, impressions),
      cpc: computeCpc(spend, clicks),
      items,
    };
  });

  const nonZeroGroups = groupsByCategory.filter((g) => g.spend > 0 || g.results > 0);
  const hasMixedObjectives = nonZeroGroups.length > 1;

  const dedupReach =
    options.deduplicatedAccountReach !== undefined &&
    options.deduplicatedAccountReach !== null &&
    Number.isFinite(options.deduplicatedAccountReach) &&
    options.deduplicatedAccountReach >= 0
      ? options.deduplicatedAccountReach
      : null;
  const singleCampDedup = dedupReach === null && normalized.length === 1 && Boolean(normalized[0]?.reachIsDeduplicated);
  const hasDeduplicatedReach = dedupReach !== null || singleCampDedup;
  const reachLabel = dedupReach !== null
    ? "Alcance da conta (deduplicado)"
    : singleCampDedup
    ? "Alcance da campanha"
    : "Alcance (soma não deduplicada por campanha)";

  return {
    totalMediaSpend,
    totalClicks,
    inlineLinkClicks: totalClicks,
    allClicks: totalAllClicks,
    totalImpressions,
    reachEstimateSum,
    accountDeduplicatedReach: dedupReach ?? (singleCampDedup ? normalized[0].reach : null),
    hasDeduplicatedReach,
    reachLabel,
    ctr: computeCtr(totalClicks, totalImpressions),
    ctrAll: computeCtr(totalAllClicks, totalImpressions),
    cpm: computeCpm(totalMediaSpend, totalImpressions),
    cpc: computeCpc(totalMediaSpend, totalClicks),
    conversionSpend,
    conversionResults,
    cpaEligible: conversionResults > 0 ? conversionSpend / conversionResults : null,
    blendedMediaCostPerConversion: conversionResults > 0 ? totalMediaSpend / conversionResults : null,
    messagesSpend,
    messagesCount,
    cpaMessages: messagesCount > 0 ? messagesSpend / messagesCount : null,
    hasMixedObjectives,
    groupsByCategory,
    metricVector,
  };
}

export interface AccountMessageSummary {
  totalAccountSpend: number;
  messageEligibleSpend: number;
  messageResults: number;
  messageCpl: number | null;
  hasMessagesCampaigns: boolean;
}

/**
 * Calcula o resumo exclusivo de Mensagens por conta usando apenas campanhas
 * cujo evento oficial classifica como MESSAGES (nunca o gasto total da conta).
 */
export function computeAccountMessageSummary(rows: RawCampaignMetricRow[]): AccountMessageSummary {
  const agg = computeWeightedAggregates(rows);
  const messageResults = agg.messagesCount;
  const messageEligibleSpend = agg.messagesSpend;
  return {
    totalAccountSpend: agg.totalMediaSpend,
    messageEligibleSpend,
    messageResults,
    messageCpl: messageResults > 0 ? messageEligibleSpend / messageResults : null,
    hasMessagesCampaigns: agg.groupsByCategory.some((g) => g.category === "MESSAGES"),
  };
}

const SELECTOR_UNIT_LABEL_BY_CATEGORY: Record<MetaConversionCategory, string> = {
  MESSAGES: "Conversas",
  REACH: "Alcance",
  INSTAGRAM_PROFILE: "Visitas ao perfil",
  LEADS: "Leads",
  PURCHASES: "Compras",
  LANDING_PAGE_VIEWS: "Visualizações da página",
  LINK_CLICKS: "Cliques no link",
  VIDEO_VIEWS: "ThruPlays",
  ENGAGEMENT: "Engajamentos",
  CHECKOUT: "Finalizações de compra",
  ADD_TO_CART: "Adições ao carrinho",
  UNKNOWN: "Resultados",
};

export interface CampaignSelectorResultDisplay {
  category: MetaConversionCategory;
  label: string;
  value: number;
  metricVector: MetricVector;
  formattedPair: string;
  summaryText: string;
}

/**
 * Formata a linha de resumo de uma campanha no seletor de Relatórios usando
 * o MetricVector e o nome oficial da unidade (nunca rotula alcance/perfil/LPV/cliques/vídeo/engajamento como "Conversões").
 */
export function getCampaignSelectorResultDisplay(
  row: RawCampaignMetricRow
): CampaignSelectorResultDisplay {
  const norm = normalizeCampaignItem(row);
  const vector = emptyMetricVector();
  accumulateMetricVector(
    vector,
    norm.classification.category as NormalizedResultCategory,
    norm.conversions,
    row.resultsIndicator || norm.classification.primaryMetric
  );

  const label = SELECTOR_UNIT_LABEL_BY_CATEGORY[norm.classification.category] || "Resultados";
  const value = norm.conversions;
  const formattedPair = `${label}: ${value.toLocaleString("pt-BR")}`;

  const parts: string[] = [
    `Custo: R$ ${norm.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    `Cliques: ${(norm.inlineLinkClicks ?? norm.clicks).toLocaleString("pt-BR")}`,
    formattedPair,
  ];
  if (norm.classification.category !== "REACH" && norm.reach > 0) {
    parts.push(`Alcance: ${norm.reach.toLocaleString("pt-BR")}`);
  }

  return {
    category: norm.classification.category,
    label,
    value,
    metricVector: vector,
    formattedPair,
    summaryText: parts.join(" • "),
  };
}

export function getCampaignSelectionGroupLabel(rows: RawCampaignMetricRow[]): string {
  const cats = new Set(
    rows.map((r) => normalizeCampaignItem(r).classification.category)
  );
  if (cats.size > 1) return "Resultados por tipo";
  const single = Array.from(cats)[0];
  return single ? (SELECTOR_UNIT_LABEL_BY_CATEGORY[single] || "Resultados") : "Resultados";
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. SNAPSHOT IMUTÁVEL DE RELATÓRIO (ÚNICA FONTE P/ TEXTO, PRÉVIA E PDF)
// ─────────────────────────────────────────────────────────────────────────────

export interface ReportSnapshot {
  snapshotId: string;
  version: string;
  generatedAt: string;
  clientName: string;
  accountName: string;
  dateFrom: string;
  dateTo: string;
  periodLabel: string;
  isFullMonth: boolean;
  reportTitlePrefix: string;
  source: string;
  items: NormalizedCampaignItem[];
  summary: WeightedAggregateSummary;
  whatsappText: string;
}

function fmtBRL(v: number): string {
  return roundCurrency(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(v: number): string {
  return Math.round(v).toLocaleString("pt-BR");
}

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function buildReportSnapshot(params: {
  clientName: string;
  accountName: string;
  dateFrom: string;
  dateTo: string;
  source?: string;
  generatedAt?: string;
  campaigns: RawCampaignMetricRow[];
  deduplicatedAccountReach?: number | null;
  mode?: "standard" | "objective" | "campaigns" | "complete";
  agencyName?: string;
}): ReportSnapshot {
  const periodInfo = formatPeriodLabel(params.dateFrom, params.dateTo);
  const summary = computeWeightedAggregates(params.campaigns, {
    deduplicatedAccountReach: params.deduplicatedAccountReach,
  });
  const items = summary.groupsByCategory.flatMap((g) => g.items);
  const mode = params.mode || "standard";
  const storeDisplay = params.clientName && params.clientName !== "Consolidado"
    ? params.clientName
    : params.accountName || "Consolidado";

  const lines: string[] = [];
  lines.push(`${periodInfo.reportTitlePrefix}:`);
  lines.push(`Loja: ${storeDisplay}`);
  lines.push(`*Período:* ${periodInfo.label}`);
  lines.push("");

  if (mode === "standard") {
    for (const grp of summary.groupsByCategory) {
      if (grp.category === "MESSAGES") {
        lines.push("*Campanha de Mensagens / WhatsApp:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Total de conversas iniciadas: ${fmtInt(grp.results)}`);
        lines.push(`Custo por conversa: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável (0 conversas)"}`);
        lines.push("");
      } else if (grp.category === "LEADS") {
        lines.push("*Campanha de Cadastros / Leads:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Total de cadastros: ${fmtInt(grp.results)}`);
        lines.push(`Custo por cadastro: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável (0 cadastros)"}`);
        lines.push("");
      } else if (grp.category === "PURCHASES") {
        lines.push("*Campanha de Compras / Vendas:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Total de compras: ${fmtInt(grp.results)}`);
        lines.push(`CPA: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "INSTAGRAM_PROFILE") {
        lines.push("*Campanha de Visitas ao Perfil:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Visitas ao perfil: ${fmtInt(grp.results)}`);
        lines.push(`Custo por visita: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "LANDING_PAGE_VIEWS") {
        lines.push("*Visualizações na Página:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Visualizações: ${fmtInt(grp.results)}`);
        lines.push(`Custo por visualização: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "REACH") {
        lines.push("*Campanha de Alcance e Reconhecimento:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Pessoas alcançadas: ${fmtInt(grp.results)} | Impressões: ${fmtInt(grp.impressions)}`);
        lines.push(`Custo por 1.000 contas alcançadas: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "VIDEO_VIEWS") {
        lines.push("*Campanha de Visualizações de Vídeo:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`ThruPlays: ${fmtInt(grp.results)} | Impressões: ${fmtInt(grp.impressions)}`);
        lines.push(`Custo por ThruPlay: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "ENGAGEMENT") {
        lines.push("*Campanha de Engajamento / Página:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`${grp.unitPlural}: ${fmtInt(grp.results)}`);
        lines.push(`Custo unitário: ${grp.unitCost !== null ? `R$ ${fmtBRL(grp.unitCost)}` : "Não calculável"}`);
        lines.push("");
      } else if (grp.category === "LINK_CLICKS") {
        lines.push("*Campanha de Cliques no Link:*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Cliques no link: ${fmtInt(grp.clicks)}`);
        lines.push(`CPC: ${grp.cpc !== null ? `R$ ${fmtBRL(grp.cpc)}` : "Não calculável"}`);
        lines.push("");
      } else {
        lines.push("*Campanhas (Evento em Revisão):*");
        lines.push(`Investimento: R$ ${fmtBRL(grp.spend)}`);
        lines.push(`Cliques: ${fmtInt(grp.clicks)} | Impressões: ${fmtInt(grp.impressions)}`);
        lines.push("");
      }
    }
  } else {
    lines.push("*Totais Gerais:*");
    lines.push(`💵 *Investimento Total:* R$ ${fmtBRL(summary.totalMediaSpend)}`);
    if (summary.conversionResults > 0) {
      lines.push(`📈 *Conversões Elegíveis:* ${fmtInt(summary.conversionResults)}`);
      if (summary.cpaEligible !== null) {
        lines.push(`💲 *CPA (Campanhas de Conversão):* R$ ${fmtBRL(summary.cpaEligible)}`);
      }
    }
    lines.push(`🖱️ *Cliques no Link:* ${fmtInt(summary.totalClicks)}`);
    lines.push(`👁️ *Impressões:* ${fmtInt(summary.totalImpressions)}`);
    lines.push("");
  }

  if (params.agencyName) {
    lines.push(`*${params.agencyName}*`);
  }

  const whatsappText = lines.join("\n").trim();
  const fingerprint = JSON.stringify({
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    clientName: storeDisplay,
    spend: roundCurrency(summary.totalMediaSpend),
    conv: summary.conversionResults,
    clicks: summary.totalClicks,
    impr: summary.totalImpressions,
    ids: items.map((i) => `${i.id}:${i.cost}:${i.conversions}:${i.classification.category}`),
  });

  return {
    snapshotId: `snap_${simpleHash(fingerprint)}`,
    version: EVENT_MODEL_VERSION,
    generatedAt: params.generatedAt || new Date().toISOString(),
    clientName: storeDisplay,
    accountName: params.accountName,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    periodLabel: periodInfo.label,
    isFullMonth: periodInfo.isFullMonth,
    reportTitlePrefix: periodInfo.reportTitlePrefix,
    source: params.source || "supabase_synced_metrics",
    items,
    summary,
    whatsappText,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. MOTOR DE DIAGNÓSTICO COMPARTILHADO E PRECEDÊNCIA DE METAS
// ─────────────────────────────────────────────────────────────────────────────

export type TargetSource =
  | "campaign_rule"
  | "account_threshold"
  | "regional_benchmark"
  | "system_default";

export interface TargetResolution {
  targetValue: number;
  unit: "BRL" | "PCT" | "CPM";
  source: TargetSource;
  sourceLabel: string;
  conflicts: string[];
}

export interface TargetCandidates {
  campaignRuleMaxCpl?: number | null;
  accountThresholdMaxCpl?: number | null;
  regionalBenchmarkCpl?: number | null;
  category: MetaConversionCategory;
  regionLabel?: string;
}

export function resolveTargetPrecedence(candidates: TargetCandidates): TargetResolution {
  const conflicts: string[] = [];
  const validCampaign = candidates.campaignRuleMaxCpl && candidates.campaignRuleMaxCpl > 0 ? candidates.campaignRuleMaxCpl : null;
  const validAccount = candidates.accountThresholdMaxCpl && candidates.accountThresholdMaxCpl > 0 ? candidates.accountThresholdMaxCpl : null;
  const validRegional = candidates.regionalBenchmarkCpl && candidates.regionalBenchmarkCpl > 0 ? candidates.regionalBenchmarkCpl : null;

  if (validCampaign && validAccount && Math.abs(validCampaign - validAccount) > 0.01) {
    conflicts.push(`Regra da campanha (R$ ${validCampaign.toFixed(2)}) diverge do limite da conta (R$ ${validAccount.toFixed(2)})`);
  }
  if (validAccount && validRegional && Math.abs(validAccount - validRegional) > 0.01) {
    conflicts.push(`Limite da conta (R$ ${validAccount.toFixed(2)}) diverge do benchmark regional (R$ ${validRegional.toFixed(2)})`);
  }

  if (candidates.category === "REACH") {
    return {
      targetValue: 18,
      unit: "CPM",
      source: "system_default",
      sourceLabel: "Referência padrão CPM de alcance (R$ 18,00)",
      conflicts,
    };
  }

  if (validCampaign) {
    return {
      targetValue: validCampaign,
      unit: "BRL",
      source: "campaign_rule",
      sourceLabel: "Regra específica da campanha",
      conflicts,
    };
  }
  if (validAccount) {
    return {
      targetValue: validAccount,
      unit: "BRL",
      source: "account_threshold",
      sourceLabel: "Meta configurada da conta",
      conflicts,
    };
  }
  if (validRegional) {
    return {
      targetValue: validRegional,
      unit: "BRL",
      source: "regional_benchmark",
      sourceLabel: `Benchmark regional (${candidates.regionLabel || "configurado"})`,
      conflicts,
    };
  }

  // Default conservador explícito por tipo de evento (nunca sobrescrever tudo por um teto fixo único)
  const conservativeDefault =
    candidates.category === "LEADS" ? 18 :
    candidates.category === "PURCHASES" ? 45 :
    candidates.category === "MESSAGES" ? 25 :
    15;

  return {
    targetValue: conservativeDefault,
    unit: "BRL",
    source: "system_default",
    sourceLabel: `Referência conservadora padrão (${candidates.category})`,
    conflicts,
  };
}

export type DiagnosisVerdictStatus =
  | "ESCALAR"
  | "MANTER"
  | "OTIMIZAR"
  | "PAUSAR"
  | "AGUARDAR_AMOSTRA";

export interface DiagnosisEvaluation {
  campaignId: string;
  campaignName: string;
  category: MetaConversionCategory;
  status: DiagnosisVerdictStatus;
  severity: "success" | "info" | "warning" | "critical";
  eligibility: {
    canScale: boolean;
    canPause: boolean;
    hasSufficientSample: boolean;
    sampleReason: string;
  };
  actualValue: number | null;
  target: TargetResolution;
  headline: string;
  explanation: string;
  recommendation: string;
  reasonCodes: string[];
  evaluatedAt: string;
}

export function evaluateCampaignHealth(params: {
  item: NormalizedCampaignItem;
  targetCandidates?: Partial<TargetCandidates>;
  minSpendForPauseDecision?: number;
  minResultsForScale?: number;
  evaluatedAt?: string;
}): DiagnosisEvaluation {
  const { item } = params;
  const cat = item.classification.category;
  const minSpend = params.minSpendForPauseDecision ?? 40;
  const minScaleResults = params.minResultsForScale ?? 3;
  const target = resolveTargetPrecedence({
    ...params.targetCandidates,
    category: cat,
  });
  const evaluatedAt = params.evaluatedAt || new Date().toISOString();

  // Regra de ouro: gasto zero com resultado positivo NÃO é elegível para escala!
  if (item.cost <= 0) {
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "AGUARDAR_AMOSTRA",
      severity: "info",
      eligibility: {
        canScale: false,
        canPause: false,
        hasSufficientSample: false,
        sampleReason: "Gasto zerado no período; dados insuficientes para decisão de orçamento.",
      },
      actualValue: item.unitCost,
      target,
      headline: "Aguardar amostra com investimento",
      explanation: item.conversions > 0
        ? "Resultados atribuídos sem gasto registrado na janela; não é seguro escalar sem investimento compatível."
        : "Sem investimento registrado no período selecionado.",
      recommendation: "Aguardar entrega mínima com investimento antes de ajustar orçamento.",
      reasonCodes: ["ZERO_SPEND_NO_SCALE"],
      evaluatedAt,
    };
  }

  // Campanhas de Alcance / Awareness (ID 06: NUNCA recomendar pausa por zero WhatsApp!)
  if (cat === "REACH" || cat === "VIDEO_VIEWS" || cat === "ENGAGEMENT") {
    const cpm = item.cpm;
    const freq = item.frequency;
    const isHighCpm = cpm !== null && cpm > target.targetValue * 1.6 && item.impressions >= 1000;
    const isSaturated = freq !== null && freq > 3.2 && item.impressions >= 1000;

    if (item.impressions < 500) {
      return {
        campaignId: item.id,
        campaignName: item.name,
        category: cat,
        status: "AGUARDAR_AMOSTRA",
        severity: "info",
        eligibility: {
          canScale: false,
          canPause: false,
          hasSufficientSample: false,
          sampleReason: "Menos de 500 impressões na janela.",
        },
        actualValue: cpm,
        target,
        headline: "Entrega inicial em reconhecimento",
        explanation: `Campanha de ${item.classification.shortBadge} em fase inicial (${item.impressions} impressões).`,
        recommendation: "Manter veiculação até atingir volume estatístico mínimo.",
        reasonCodes: ["AWARENESS_LOW_IMPRESSIONS"],
        evaluatedAt,
      };
    }

    if (isSaturated || isHighCpm) {
      return {
        campaignId: item.id,
        campaignName: item.name,
        category: cat,
        status: "OTIMIZAR",
        severity: "warning",
        eligibility: {
          canScale: false,
          canPause: false,
          hasSufficientSample: true,
          sampleReason: `${item.impressions} impressões na janela.`,
        },
        actualValue: cpm,
        target,
        headline: isSaturated ? "Frequência elevada em alcance" : "CPM acima da referência",
        explanation: `Campanha avaliada por alcance/impressões (${item.classification.unitPlural}), nunca por zero mensagens.`,
        recommendation: isSaturated
          ? "Renovar criativos ou ampliar segmentação para reduzir repetição."
          : "Revisar criativos e amplitude de público para reduzir CPM.",
        reasonCodes: [isSaturated ? "AWARENESS_HIGH_FREQ" : "AWARENESS_HIGH_CPM"],
        evaluatedAt,
      };
    }

    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "MANTER",
      severity: "success",
      eligibility: {
        canScale: item.ctr !== null && item.ctr >= 1.5,
        canPause: false,
        hasSufficientSample: true,
        sampleReason: `${item.impressions} impressões registradas.`,
      },
      actualValue: cpm,
      target,
      headline: "Entrega saudável de alcance",
      explanation: `Campanha cumprindo objetivo de ${item.classification.unitPlural} com CPM ${cpm !== null ? `R$ ${cpm.toFixed(2)}` : "N/A"}.`,
      recommendation: "Manter entrega de suporte ao funil sem cobrar conversas diretas.",
      reasonCodes: ["AWARENESS_HEALTHY"],
      evaluatedAt,
    };
  }

  // Campanhas de Tráfego (Visitas ao Perfil / LP / Cliques)
  if (cat === "INSTAGRAM_PROFILE" || cat === "LANDING_PAGE_VIEWS" || cat === "LINK_CLICKS") {
    const unitCost = item.unitCost;
    if (item.clicks < 15 && item.cost < minSpend) {
      return {
        campaignId: item.id,
        campaignName: item.name,
        category: cat,
        status: "AGUARDAR_AMOSTRA",
        severity: "info",
        eligibility: {
          canScale: false,
          canPause: false,
          hasSufficientSample: false,
          sampleReason: `Amostra pequena (${item.clicks} cliques e R$ ${item.cost.toFixed(2)}).`,
        },
        actualValue: unitCost,
        target,
        headline: "Aguardar volume mínimo de tráfego",
        explanation: `Campanha de ${item.classification.unitPlural} ainda sem volume suficiente para ajuste.`,
        recommendation: "Aguardar mais cliques antes de decidir otimização.",
        reasonCodes: ["TRAFFIC_INSUFFICIENT_SAMPLE"],
        evaluatedAt,
      };
    }

    if (item.conversions === 0 && item.cost >= minSpend) {
      return {
        campaignId: item.id,
        campaignName: item.name,
        category: cat,
        status: "OTIMIZAR",
        severity: "warning",
        eligibility: {
          canScale: false,
          canPause: true,
          hasSufficientSample: true,
          sampleReason: `Investido R$ ${item.cost.toFixed(2)} com 0 ${item.classification.unitPlural}.`,
        },
        actualValue: null,
        target,
        headline: `Gasto sem ${item.classification.unitPlural}`,
        explanation: `Investido R$ ${item.cost.toFixed(2)} sem registro do evento principal (${item.classification.primaryMetric}).`,
        recommendation: "Verificar destino, rastreamento ou criativo antes de manter verba.",
        reasonCodes: ["TRAFFIC_ZERO_PRIMARY_EVENT"],
        evaluatedAt,
      };
    }

    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "MANTER",
      severity: "info",
      eligibility: {
        canScale: item.ctr !== null && item.ctr >= 1.8 && item.clicks >= 30,
        canPause: false,
        hasSufficientSample: true,
        sampleReason: `${item.clicks} cliques analisados.`,
      },
      actualValue: unitCost,
      target,
      headline: "Tráfego em operação regular",
      explanation: `Gerou ${item.conversions} ${item.classification.unitPlural} a ${unitCost !== null ? `R$ ${unitCost.toFixed(2)}` : "custo não calculável"}.`,
      recommendation: "Manter monitoramento de CTR e qualidade do destino.",
      reasonCodes: ["TRAFFIC_HEALTHY"],
      evaluatedAt,
    };
  }

  // Campanhas de Conversão Comercial Direta (MESSAGES, LEADS, PURCHASES)
  const cpa = item.unitCost;
  const hasMinSample = item.cost >= minSpend || item.conversions >= minScaleResults;

  if (!hasMinSample) {
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "AGUARDAR_AMOSTRA",
      severity: "info",
      eligibility: {
        canScale: false,
        canPause: false,
        hasSufficientSample: false,
        sampleReason: `Gasto R$ ${item.cost.toFixed(2)} e ${item.conversions} ${item.classification.unitPlural} abaixo do mínimo estatístico.`,
      },
      actualValue: cpa,
      target,
      headline: "Amostra insuficiente para decisão",
      explanation: "Evitando pausa ou escala precipitada com baixo volume de dados.",
      recommendation: "Manter orçamento atual até acumular amostra mínima.",
      reasonCodes: ["CONVERSION_INSUFFICIENT_SAMPLE"],
      evaluatedAt,
    };
  }

  if (item.conversions === 0 && item.cost >= minSpend) {
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "PAUSAR",
      severity: "critical",
      eligibility: {
        canScale: false,
        canPause: true,
        hasSufficientSample: true,
        sampleReason: `Investido R$ ${item.cost.toFixed(2)} (>= R$ ${minSpend.toFixed(2)}) sem resultados.`,
      },
      actualValue: null,
      target,
      headline: `Investimento sem ${item.classification.unitPlural}`,
      explanation: `Consumiu R$ ${item.cost.toFixed(2)} na janela sem gerar nenhum evento de ${item.classification.unitSingular}. Custo não calculável.`,
      recommendation: "Avaliar pausa ou troca imediata de criativo e oferta.",
      reasonCodes: ["CONVERSION_ZERO_RESULTS_OVER_MIN_SPEND"],
      evaluatedAt,
    };
  }

  if (cpa !== null && cpa > target.targetValue * 1.5) {
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "PAUSAR",
      severity: "critical",
      eligibility: {
        canScale: false,
        canPause: true,
        hasSufficientSample: true,
        sampleReason: `${item.conversions} resultados com CPA acima de 1,5x da meta.`,
      },
      actualValue: cpa,
      target,
      headline: "Custo por resultado muito acima da meta",
      explanation: `CPA de R$ ${cpa.toFixed(2)} supera em mais de 50% a referência de R$ ${target.targetValue.toFixed(2)} (${target.sourceLabel}).`,
      recommendation: "Revisar oferta/criativos ou pausar após conferência de atendimento.",
      reasonCodes: ["CPA_CRITICAL_OVER_TARGET"],
      evaluatedAt,
    };
  }

  if (cpa !== null && cpa > target.targetValue) {
    const lowCpmNote = item.cpm !== null && item.cpm < 15
      ? ` Apesar do CPM competitivo (R$ ${item.cpm.toFixed(2)}), a conversão pós-clique está pressionando o CPA.`
      : "";
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "OTIMIZAR",
      severity: "warning",
      eligibility: {
        canScale: false, // NUNCA recomendar escala enquanto estiver acima da meta (ID 03!)
        canPause: false,
        hasSufficientSample: true,
        sampleReason: `${item.conversions} resultados com CPA acima da meta.`,
      },
      actualValue: cpa,
      target,
      headline: "Custo acima da meta — otimizar antes de escalar",
      explanation: `CPA de R$ ${cpa.toFixed(2)} está acima da meta de R$ ${target.targetValue.toFixed(2)} (${target.sourceLabel}).${lowCpmNote}`,
      recommendation: "Renovar criativos e revisar página/mensagem inicial antes de aumentar verba.",
      reasonCodes: ["CPA_OVER_TARGET_NO_SCALE"],
      evaluatedAt,
    };
  }

  // CPA dentro da meta
  if (cpa !== null && cpa <= target.targetValue && item.conversions >= minScaleResults) {
    return {
      campaignId: item.id,
      campaignName: item.name,
      category: cat,
      status: "ESCALAR",
      severity: "success",
      eligibility: {
        canScale: true,
        canPause: false,
        hasSufficientSample: true,
        sampleReason: `${item.conversions} resultados dentro da meta.`,
      },
      actualValue: cpa,
      target,
      headline: "Elegível para incremento gradual de orçamento",
      explanation: `CPA de R$ ${cpa.toFixed(2)} dentro da meta de R$ ${target.targetValue.toFixed(2)} (${target.sourceLabel}) com ${item.conversions} ${item.classification.unitPlural}.`,
      recommendation: "Avaliar aumento gradual conforme regra operacional da conta (monitorar aprendizado após alteração).",
      reasonCodes: ["CPA_WITHIN_TARGET_ELIGIBLE_SCALE"],
      evaluatedAt,
    };
  }

  return {
    campaignId: item.id,
    campaignName: item.name,
    category: cat,
    status: "MANTER",
    severity: "info",
    eligibility: {
      canScale: false,
      canPause: false,
      hasSufficientSample: true,
      sampleReason: "Dentro da meta, porém abaixo do mínimo de resultados para escala.",
    },
    actualValue: cpa,
    target,
    headline: "Performance dentro da meta — manter monitoramento",
    explanation: `CPA de ${cpa !== null ? `R$ ${cpa.toFixed(2)}` : "N/A"} dentro da referência de R$ ${target.targetValue.toFixed(2)}.`,
    recommendation: "Manter verba atual até consolidar mais volume de resultados.",
    reasonCodes: ["CPA_WITHIN_TARGET_KEEP"],
    evaluatedAt,
  };
}

// ─── 11. Distribuição de Verba Publicitária (Command Center) ──────────────────

export interface CampaignBudgetCandidate {
  id?: string;
  name: string;
  status?: string;
  adAccountId?: string;
  cost: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  conversions?: number;
  results?: number;
}

export interface CampaignBudgetSlice {
  id?: string;
  name: string;
  value: number;
  percentage: number;
  conversions: number;
  isOtherSlice: boolean;
  groupedCampaignsCount: number;
  groupingCriteria: string | null;
}

export interface CampaignBudgetDistributionResult {
  totalConfiguredCampaigns: number;
  deliveringCampaigns: number;
  spendingCampaigns: number;
  totalSpend: number;
  averageSpendPerSpendingCampaign: number | null;
  top2Spend: number;
  top2ConcentrationPct: number;
  leader: CampaignBudgetSlice | null;
  slicesCount: number;
  slices: CampaignBudgetSlice[];
  sumSliceSpend: number;
  sumSlicePercentage: number;
}

/**
 * Calcula a distribuição de verba publicitária separando estritamente:
 * - `totalConfiguredCampaigns`: todas as campanhas sincronizadas/cadastradas no filtro;
 * - `deliveringCampaigns`: campanhas com entrega no período (cost > 0 || impressions > 0 || reach > 0 || conversions > 0 || results > 0 || clicks > 0);
 * - `spendingCampaigns`: campanhas com gasto no período (cost > 0);
 * - `averageSpendPerSpendingCampaign`: totalSpend / spendingCampaigns (ou null quando spendingCampaigns === 0).
 *
 * Campanhas com cost === 0 nunca entram nas fatias nem no grupo `Outras`.
 */
export function computeCampaignBudgetDistribution(
  campaigns: CampaignBudgetCandidate[],
  maxTopSlices = 7
): CampaignBudgetDistributionResult {
  const safeList = Array.isArray(campaigns) ? campaigns : [];
  const totalConfiguredCampaigns = safeList.length;

  const normalized = safeList.map((c) => {
    const cost = Math.max(0, Number(c.cost || 0));
    const impressions = Math.max(0, Number(c.impressions || 0));
    const reach = Math.max(0, Number(c.reach || 0));
    const clicks = Math.max(0, Number(c.clicks || 0));
    const conversions = Math.max(0, Number(c.conversions ?? c.results ?? 0));
    const results = Math.max(0, Number(c.results ?? c.conversions ?? 0));
    const isSpending = cost > 0;
    const isDelivering =
      isSpending || impressions > 0 || reach > 0 || conversions > 0 || results > 0 || clicks > 0;

    return {
      id: c.id,
      name: String(c.name || "Campanha sem nome"),
      status: c.status,
      adAccountId: c.adAccountId,
      cost,
      impressions,
      reach,
      clicks,
      conversions,
      results,
      isSpending,
      isDelivering,
    };
  });

  const deliveringCampaigns = normalized.filter((c) => c.isDelivering).length;
  const spendingList = normalized
    .filter((c) => c.isSpending)
    .sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));

  const spendingCampaigns = spendingList.length;
  const rawTotalSpend = spendingList.reduce((acc, c) => acc + c.cost, 0);
  const totalSpend = Math.round((rawTotalSpend + Number.EPSILON) * 100) / 100;

  const averageSpendPerSpendingCampaign =
    spendingCampaigns > 0
      ? Math.round((totalSpend / spendingCampaigns + Number.EPSILON) * 100) / 100
      : null;

  const topLimit = Math.max(1, Math.floor(maxTopSlices));
  const topCampaigns = spendingList.slice(0, topLimit);
  const otherCampaigns = spendingList.slice(topLimit);

  const slices: CampaignBudgetSlice[] = topCampaigns.map((c) => ({
    id: c.id,
    name: c.name,
    value: Number(c.cost.toFixed(2)),
    percentage: rawTotalSpend > 0 ? (c.cost / rawTotalSpend) * 100 : 0,
    conversions: c.conversions,
    isOtherSlice: false,
    groupedCampaignsCount: 1,
    groupingCriteria: null,
  }));

  if (otherCampaigns.length > 0) {
    const otherSpendRaw = otherCampaigns.reduce((acc, c) => acc + c.cost, 0);
    const otherConversions = otherCampaigns.reduce((acc, c) => acc + c.conversions, 0);
    slices.push({
      id: undefined,
      name: `Outras (${otherCampaigns.length})`,
      value: Number(otherSpendRaw.toFixed(2)),
      percentage: rawTotalSpend > 0 ? (otherSpendRaw / rawTotalSpend) * 100 : 0,
      conversions: otherConversions,
      isOtherSlice: true,
      groupedCampaignsCount: otherCampaigns.length,
      groupingCriteria: `Campanhas com gasto > 0 no período fora do Top ${topLimit}`,
    });
  }

  // Ajuste de precisão centesimal na última fatia para garantir sum(sliceSpend) === totalSpend e sum(slicePercentage) === 100%
  if (slices.length > 0 && totalSpend > 0) {
    const priorSpend = slices.slice(0, -1).reduce((acc, s) => acc + s.value, 0);
    const priorPct = slices.slice(0, -1).reduce((acc, s) => acc + s.percentage, 0);
    const lastIdx = slices.length - 1;
    slices[lastIdx] = {
      ...slices[lastIdx],
      value: Number(Math.max(0, totalSpend - priorSpend).toFixed(2)),
      percentage: Math.max(0, 100 - priorPct),
    };
  }

  const sumSliceSpend = Number(slices.reduce((acc, s) => acc + s.value, 0).toFixed(2));
  const sumSlicePercentage =
    slices.length > 0 && totalSpend > 0
      ? Number(slices.reduce((acc, s) => acc + s.percentage, 0).toFixed(4))
      : 0;

  const top2Spend = Number(
    ((spendingList[0]?.cost || 0) + (spendingList[1]?.cost || 0)).toFixed(2)
  );
  const top2ConcentrationPct =
    rawTotalSpend > 0 ? Number(((top2Spend / rawTotalSpend) * 100).toFixed(2)) : 0;

  return {
    totalConfiguredCampaigns,
    deliveringCampaigns,
    spendingCampaigns,
    totalSpend,
    averageSpendPerSpendingCampaign,
    top2Spend,
    top2ConcentrationPct,
    leader: slices[0] ?? null,
    slicesCount: slices.length,
    slices,
    sumSliceSpend,
    sumSlicePercentage,
  };
}

