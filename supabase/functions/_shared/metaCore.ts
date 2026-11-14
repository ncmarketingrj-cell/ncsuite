// src/lib/metaIntegrationCore.ts
// Nucleo puro, deterministico e compartilhado de integracao Meta Graph API v21.0 -> NC Performance Suite.
// Espelhado em supabase/functions/_shared/metaCore.ts para garantir paridade exata entre backend Deno e frontend/testes.

export const META_GRAPH_VERSION = "v21.0";
export const META_INDICATOR_SPEC_VERSION = "2026.11.2";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export type FieldState =
  | "observado"
  | "calculado"
  | "informado_pelo_usuario"
  | "estimado"
  | "indisponivel";

export type MetaErrorKind =
  | "none"
  | "rate_limit"
  | "transient"
  | "permission_denied"
  | "invalid_token"
  | "unsupported_field"
  | "not_found"
  | "network"
  | "unknown";

export interface MetaPaginatedResult<T = any> {
  ok: boolean;
  data: T[];
  pagesFetched: number;
  truncated: boolean;
  statusCode: number | null;
  attempts: number;
  error: string | null;
  errorCode: number | null;
  errorKind: MetaErrorKind;
  rateLimitUsagePct: number | null;
}

export interface MetaRetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxPages?: number;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const TRANSIENT_META_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);
const RATE_LIMIT_META_CODES = new Set([4, 17, 32, 613]);
const PERMISSION_META_CODES = new Set([10, 200, 294]);

export function classifyMetaError(statusCode: number | null, errorObj: any): MetaErrorKind {
  const code = Number(errorObj?.code || 0);
  const msg = String(errorObj?.message || "").toLowerCase();

  if (code === 190 || msg.includes("access token") && msg.includes("expired") || msg.includes("invalid oauth access token")) {
    return "invalid_token";
  }
  if (PERMISSION_META_CODES.has(code) || msg.includes("permission") || msg.includes("requires")) {
    return "permission_denied";
  }
  if (statusCode === 429 || RATE_LIMIT_META_CODES.has(code) || msg.includes("too many calls") || msg.includes("rate limit")) {
    return "rate_limit";
  }
  if (
    errorObj?.is_transient === true ||
    TRANSIENT_META_CODES.has(code) ||
    statusCode === 500 ||
    statusCode === 502 ||
    statusCode === 503 ||
    statusCode === 504
  ) {
    return "transient";
  }
  if (code === 100 || msg.includes("nonexisting field") || msg.includes("invalid parameter")) {
    return "unsupported_field";
  }
  if (code === 803 || statusCode === 404) {
    return "not_found";
  }
  if (statusCode !== null || errorObj) {
    return "unknown";
  }
  return "none";
}

function parseUsagePct(headers: Headers | null | undefined): number | null {
  if (!headers) return null;
  for (const h of ["x-app-usage", "x-business-use-case-usage", "x-ad-account-usage"]) {
    const raw = headers.get(h);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.call_count === "number") {
        return Math.max(parsed.call_count || 0, parsed.total_cputime || 0, parsed.total_time || 0);
      }
      if (typeof parsed === "object" && parsed !== null) {
        for (const val of Object.values(parsed)) {
          if (Array.isArray(val) && val[0]) {
            const first = val[0] as any;
            return Math.max(first.call_count || 0, first.total_cputime || 0, first.total_time || 0);
          }
        }
      }
    } catch {
      // ignora header nao-JSON
    }
  }
  return null;
}

export async function metaFetchJsonWithRetry(
  url: string,
  options: MetaRetryOptions = {}
): Promise<{
  ok: boolean;
  data: any;
  statusCode: number | null;
  attempts: number;
  error: string | null;
  errorCode: number | null;
  errorKind: MetaErrorKind;
  rateLimitUsagePct: number | null;
}> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 350;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const fetchFn = options.fetchFn ?? fetch;
  const sleepFn = options.sleepFn ?? defaultSleep;

  let attempts = 0;
  let lastStatus: number | null = null;
  let lastError: string | null = null;
  let lastErrorCode: number | null = null;
  let lastKind: MetaErrorKind = "unknown";
  let lastUsagePct: number | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts = attempt + 1;
    try {
      const res = await fetchFn(url);
      lastStatus = res.status;
      lastUsagePct = parseUsagePct(res.headers) ?? lastUsagePct;

      let json: any = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }

      if (res.ok && json && !json.error) {
        return {
          ok: true,
          data: json,
          statusCode: res.status,
          attempts,
          error: null,
          errorCode: null,
          errorKind: "none",
          rateLimitUsagePct: lastUsagePct,
        };
      }

      const errorObj = json?.error;
      lastErrorCode = errorObj?.code ? Number(errorObj.code) : null;
      lastError = errorObj?.message || `HTTP ${res.status}`;
      lastKind = classifyMetaError(res.status, errorObj);

      const shouldRetry =
        attempt < maxRetries &&
        (lastKind === "rate_limit" || lastKind === "transient");

      if (!shouldRetry) {
        return {
          ok: false,
          data: json,
          statusCode: res.status,
          attempts,
          error: lastError,
          errorCode: lastErrorCode,
          errorKind: lastKind,
          rateLimitUsagePct: lastUsagePct,
        };
      }

      const retryAfterSec = Number(res.headers?.get("Retry-After") || "0");
      const expDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const delayMs = retryAfterSec > 0 ? Math.min(maxDelayMs, retryAfterSec * 1000) : expDelay;
      await sleepFn(delayMs);
    } catch (err: any) {
      lastKind = "network";
      lastError = err?.message || "Network error";
      if (attempt >= maxRetries) {
        return {
          ok: false,
          data: null,
          statusCode: lastStatus,
          attempts,
          error: lastError,
          errorCode: null,
          errorKind: "network",
          rateLimitUsagePct: lastUsagePct,
        };
      }
      const delayMs = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      await sleepFn(delayMs);
    }
  }

  return {
    ok: false,
    data: null,
    statusCode: lastStatus,
    attempts,
    error: lastError,
    errorCode: lastErrorCode,
    errorKind: lastKind,
    rateLimitUsagePct: lastUsagePct,
  };
}

export async function metaFetchPaginatedWithStatus<T = any>(
  path: string,
  token: string,
  params: Record<string, string> = {},
  options: MetaRetryOptions = {}
): Promise<MetaPaginatedResult<T>> {
  const maxPages = options.maxPages ?? 50;
  const normalizedPath = path.startsWith("http")
    ? path
    : `${META_GRAPH_BASE}${path.startsWith("/") ? path : `/${path}`}`;

  const firstUrl = new URL(normalizedPath);
  if (!firstUrl.searchParams.has("access_token")) {
    firstUrl.searchParams.set("access_token", token);
  }
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      firstUrl.searchParams.set(k, v);
    }
  }

  const all: T[] = [];
  let nextUrl: string | null = firstUrl.toString();
  let pagesFetched = 0;
  let totalAttempts = 0;
  let rateLimitUsagePct: number | null = null;
  let lastStatusCode: number | null = null;

  while (nextUrl && pagesFetched < maxPages) {
    pagesFetched++;
    const res = await metaFetchJsonWithRetry(nextUrl, options);
    totalAttempts += res.attempts;
    lastStatusCode = res.statusCode;
    if (res.rateLimitUsagePct !== null) rateLimitUsagePct = res.rateLimitUsagePct;

    if (!res.ok) {
      return {
        ok: false,
        data: all,
        pagesFetched,
        truncated: false,
        statusCode: res.statusCode,
        attempts: totalAttempts,
        error: res.error,
        errorCode: res.errorCode,
        errorKind: res.errorKind,
        rateLimitUsagePct,
      };
    }

    if (Array.isArray(res.data?.data)) {
      all.push(...res.data.data);
    }
    nextUrl = res.data?.paging?.next || null;
  }

  const truncated = Boolean(nextUrl);
  return {
    ok: !truncated,
    data: all,
    pagesFetched,
    truncated,
    statusCode: lastStatusCode,
    attempts: totalAttempts,
    error: truncated ? `Paginação atingiu o limite de ${maxPages} páginas sem concluir.` : null,
    errorCode: null,
    errorKind: truncated ? "rate_limit" : "none",
    rateLimitUsagePct,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZACAO EXATA DE EVENTOS, OBJETIVOS, CLICKS, ATTRIBUTION & RESULTADOS
// Zero nomes hardcoded de clientes, vendedores ou campanhas!
// ─────────────────────────────────────────────────────────────────────────────

export type NormalizedResultCategory =
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

export interface MetricVector {
  conversations: number;
  leads: number;
  websiteContacts: number;
  purchases: number;
  checkout: number;
  addToCart: number;
  profileVisits: number;
  pageVisits: number;
  landingPageViews: number;
  linkClicks: number;
  reach: number;
  videoViews: number;
  engagements: number;
  unknownResults: number;
}

export function emptyMetricVector(): MetricVector {
  return {
    conversations: 0,
    leads: 0,
    websiteContacts: 0,
    purchases: 0,
    checkout: 0,
    addToCart: 0,
    profileVisits: 0,
    pageVisits: 0,
    landingPageViews: 0,
    linkClicks: 0,
    reach: 0,
    videoViews: 0,
    engagements: 0,
    unknownResults: 0,
  };
}

export function accumulateMetricVector(
  vec: MetricVector,
  category: NormalizedResultCategory,
  count: number | null | undefined,
  resultIndicator?: string | null
): MetricVector {
  const n = typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
  if (n <= 0) return vec;
  const ind = String(resultIndicator || "").toLowerCase();
  if (ind.includes("page_visit")) {
    vec.pageVisits += n;
    return vec;
  }
  if (ind.includes("contact_website")) {
    vec.websiteContacts += n;
    return vec;
  }
  switch (category) {
    case "MESSAGES":
      vec.conversations += n;
      break;
    case "LEADS":
      vec.leads += n;
      break;
    case "PURCHASES":
      vec.purchases += n;
      break;
    case "CHECKOUT":
      vec.checkout += n;
      break;
    case "ADD_TO_CART":
      vec.addToCart += n;
      break;
    case "INSTAGRAM_PROFILE":
      vec.profileVisits += n;
      break;
    case "LANDING_PAGE_VIEWS":
      vec.landingPageViews += n;
      break;
    case "LINK_CLICKS":
      vec.linkClicks += n;
      break;
    case "REACH":
      vec.reach += n;
      break;
    case "VIDEO_VIEWS":
      vec.videoViews += n;
      break;
    case "ENGAGEMENT":
      vec.engagements += n;
      break;
    default:
      vec.unknownResults += n;
      break;
  }
  return vec;
}

export function formatMetricVectorSummary(vec: MetricVector): Array<{ key: keyof MetricVector; label: string; value: number }> {
  const entries: Array<{ key: keyof MetricVector; label: string; value: number }> = [
    { key: "conversations", label: "Conversas", value: vec.conversations },
    { key: "leads", label: "Cadastros / Leads", value: vec.leads },
    { key: "websiteContacts", label: "Contatos no Site", value: vec.websiteContacts },
    { key: "purchases", label: "Compras", value: vec.purchases },
    { key: "checkout", label: "Checkouts", value: vec.checkout },
    { key: "addToCart", label: "Add to Cart", value: vec.addToCart },
    { key: "profileVisits", label: "Visitas ao Perfil", value: vec.profileVisits },
    { key: "pageVisits", label: "Visitas à Página", value: vec.pageVisits },
    { key: "landingPageViews", label: "Vis. Página Destino", value: vec.landingPageViews },
    { key: "linkClicks", label: "Cliques no Link (obj.)", value: vec.linkClicks },
    { key: "reach", label: "Alcance (obj.)", value: vec.reach },
    { key: "videoViews", label: "Video ThruPlay", value: vec.videoViews },
    { key: "engagements", label: "Engajamentos / Curtidas", value: vec.engagements },
    { key: "unknownResults", label: "Não classificados", value: vec.unknownResults },
  ];
  return entries.filter((e) => e.value > 0);
}

export function parseMetaActionNumericValue(action: any): number {
  if (!action) return 0;
  // Quando janelas estao explicitas (7d_click / 1d_view), preservar precisao e somar janelas compativeis
  const has7dClick = action["7d_click"] !== undefined && action["7d_click"] !== null;
  const has1dView = action["1d_view"] !== undefined && action["1d_view"] !== null;
  if (has7dClick || has1dView) {
    const c = parseFloat(String(action["7d_click"] ?? "0"));
    const v = parseFloat(String(action["1d_view"] ?? "0"));
    const total = (Number.isFinite(c) ? c : 0) + (Number.isFinite(v) ? v : 0);
    if (total > 0) return total;
  }
  const raw = action.value ?? action["28d_click"] ?? action["1d_click"] ?? 0;
  const n = parseFloat(String(raw));
  return Number.isFinite(n) ? n : 0;
}

export function extractActionByExactTypes(actions: any[] = [], candidateTypes: string[]): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;
  const byType = new Map<string, number>();
  for (const a of actions) {
    const t = String(a?.action_type || "").toLowerCase();
    if (!t) continue;
    byType.set(t, parseMetaActionNumericValue(a));
  }
  for (const candidate of candidateTypes) {
    const key = candidate.toLowerCase();
    if (byType.has(key)) {
      return byType.get(key) || 0;
    }
  }
  return 0;
}

export function detectStrictConversionCategory(input: {
  rawObjective?: string | null;
  optimizationGoal?: string | null;
  destinationType?: string | null;
  results?: any[] | null;
  actions?: any[] | null;
  storedResultType?: string | null;
}): NormalizedResultCategory {
  const results = Array.isArray(input.results) ? input.results : [];
  const indicator = String(results[0]?.indicator || "").toLowerCase();
  const opt = String(input.optimizationGoal || "").toUpperCase();
  const dest = String(input.destinationType || "").toUpperCase();
  const obj = String(input.rawObjective || "").toUpperCase();
  const stored = String(input.storedResultType || "").toUpperCase();

  // 1. Prioridade maxima: indicator oficial de `results[]`
  if (indicator) {
    if (indicator.includes("page_visit")) return "ENGAGEMENT";
    if (indicator.includes("profile_visit") || indicator.includes("instagram_profile")) return "INSTAGRAM_PROFILE";
    if (
      indicator.includes("messaging_conversation_started") ||
      indicator.includes("total_messaging_connection") ||
      indicator.includes("messaging_first_reply")
    ) return "MESSAGES";
    if (indicator.includes("landing_page_view") || indicator.includes("omni_landing_page_view")) return "LANDING_PAGE_VIEWS";
    if (indicator.includes("initiate_checkout") || indicator.includes("checkout")) return "CHECKOUT";
    if (indicator.includes("add_to_cart")) return "ADD_TO_CART";
    if (indicator.includes("purchase") || indicator.includes("omni_purchase")) return "PURCHASES";
    if (indicator.includes("contact_website")) return "LEADS";
    if (indicator.includes("lead") || indicator.includes("complete_registration")) return "LEADS";
    if (indicator.includes("thruplay") || indicator.includes("video_view")) return "VIDEO_VIEWS";
    if (
      indicator === "like" ||
      indicator === "actions:like" ||
      indicator.endsWith(":like") ||
      indicator.includes("post_engagement") ||
      indicator.includes("page_engagement") ||
      indicator.includes("post_reaction")
    ) return "ENGAGEMENT";
    if (indicator === "reach" || indicator === "impressions") return "REACH";
    if (indicator.includes("link_click")) return "LINK_CLICKS";
  }

  // 2. Segunda prioridade: optimization_goal / destination_type do AdSet/Insight
  if (opt === "PROFILE_AND_PAGE_ENGAGEMENT") {
    const pageV = extractActionByExactTypes(input.actions || [], ["page_visit_view"]);
    const igV = extractActionByExactTypes(input.actions || [], ["profile_visit_view", "visit_instagram_profile", "instagram_profile_visit"]);
    if (pageV > 0 && igV === 0) return "ENGAGEMENT";
    return "INSTAGRAM_PROFILE";
  }
  if (opt === "PROFILE_VISIT" || opt === "VISIT_INSTAGRAM_PROFILE" || dest === "INSTAGRAM_PROFILE" || (dest === "INSTAGRAM_DIRECT" && opt === "PROFILE_VISIT")) {
    return "INSTAGRAM_PROFILE";
  }
  if (opt === "CONVERSATIONS" || opt === "REPLIES" || opt === "MESSAGING_PURCHASE_CONVERSION" || dest === "WHATSAPP" || dest === "MESSENGER" || dest === "INSTAGRAM_DIRECT") {
    return "MESSAGES";
  }
  if (opt === "LANDING_PAGE_VIEWS") return "LANDING_PAGE_VIEWS";
  if (opt === "LEAD_GENERATION" || opt === "QUALITY_LEAD" || opt === "LEAD" || dest === "ON_AD") return "LEADS";
  if (opt === "OFFSITE_CONVERSIONS" || opt === "VALUE" || opt === "PURCHASE" || opt === "PURCHASES") {
    // Se optimization_goal for OFFSITE_CONVERSIONS, distingue purchase vs lead/contact pelos actions reais se houver
    const purchaseVal = extractActionByExactTypes(input.actions || [], [
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "onsite_conversion.purchase",
    ]);
    const leadVal = extractActionByExactTypes(input.actions || [], [
      "offsite_conversion.fb_pixel_lead",
      "lead",
      "complete_registration",
      "offsite_conversion.fb_pixel_complete_registration",
      "contact_website",
      "contact",
    ]);
    if (purchaseVal > 0 && leadVal === 0) return "PURCHASES";
    if (leadVal > 0 && purchaseVal === 0) return "LEADS";
    if (obj === "OUTCOME_LEADS" || obj === "LEAD_GENERATION") return "LEADS";
    return "PURCHASES";
  }
  if (opt === "THRUPLAY" || opt === "VIDEO_VIEWS" || opt === "TWO_SECOND_CONTINUOUS_VIDEO_VIEWS") return "VIDEO_VIEWS";
  if (opt === "POST_ENGAGEMENT" || opt === "PAGE_LIKES" || opt === "ENGAGEMENT") return "ENGAGEMENT";
  if (opt === "REACH" || opt === "IMPRESSIONS" || opt === "AD_RECALL_LIFT") return "REACH";
  if (opt === "LINK_CLICKS") {
    if (dest === "INSTAGRAM_PROFILE") return "INSTAGRAM_PROFILE";
    return "LINK_CLICKS";
  }

  // 3. Terceira prioridade: result_type explicitamente persistido (quando valido e nao desconhecido)
  const validStored: NormalizedResultCategory[] = [
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
  if (validStored.includes(stored as NormalizedResultCategory)) {
    return stored as NormalizedResultCategory;
  }

  // 4. Quarta prioridade: objective bruto oficial da Meta
  if (obj === "MESSAGES") return "MESSAGES";
  if (obj === "VISIT_INSTAGRAM_PROFILE" || obj === "INSTAGRAM_PROFILE") return "INSTAGRAM_PROFILE";
  if (obj === "OUTCOME_LEADS" || obj === "LEAD_GENERATION") return "LEADS";
  if (obj === "OUTCOME_SALES" || obj === "CONVERSIONS" || obj === "CATALOG_SALES") return "PURCHASES";
  if (obj === "OUTCOME_AWARENESS" || obj === "AWARENESS" || obj === "REACH" || obj === "BRAND_AWARENESS") return "REACH";
  if (obj === "VIDEO_VIEWS") return "VIDEO_VIEWS";
  if (obj === "POST_ENGAGEMENT") return "ENGAGEMENT";
  if (obj === "LINK_CLICKS" || obj === "OUTCOME_TRAFFIC") {
    const msgs = extractActionByExactTypes(input.actions || [], [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
      "messaging_conversation_started_7d",
    ]);
    if (msgs > 0) return "MESSAGES";
    const pv = extractActionByExactTypes(input.actions || [], [
      "profile_visit_view",
      "instagram_profile_visit",
      "visit_instagram_profile",
      "profile_visit",
      "onsite_conversion.instagram_profile_visit",
    ]);
    if (pv > 0) return "INSTAGRAM_PROFILE";
    const pageVisits = extractActionByExactTypes(input.actions || [], ["page_visit_view"]);
    if (pageVisits > 0) return "ENGAGEMENT";
    const lpv = extractActionByExactTypes(input.actions || [], [
      "omni_landing_page_view",
      "landing_page_view",
      "onsite_conversion.landing_page_view",
    ]);
    if (lpv > 0) return "LANDING_PAGE_VIEWS";
    return "LINK_CLICKS";
  }
  if (obj === "OUTCOME_ENGAGEMENT") {
    const msgs = extractActionByExactTypes(input.actions || [], [
      "onsite_conversion.messaging_conversation_started_7d",
      "onsite_conversion.total_messaging_connection",
      "messaging_conversation_started_7d",
    ]);
    if (msgs > 0) return "MESSAGES";
    const pv = extractActionByExactTypes(input.actions || [], [
      "profile_visit_view",
      "instagram_profile_visit",
      "visit_instagram_profile",
      "profile_visit",
    ]);
    if (pv > 0) return "INSTAGRAM_PROFILE";
    const pe = extractActionByExactTypes(input.actions || [], ["page_visit_view", "like", "post_engagement", "page_engagement"]);
    if (pe > 0) return "ENGAGEMENT";
    return "UNKNOWN";
  }

  // Nunca forcar fallback silencioso para MESSAGES!
  return "UNKNOWN";
}

export interface ExtractedMetaInsightMetrics {
  category: NormalizedResultCategory;
  resultCount: number | null;
  resultIndicator: string | null;
  resultSource: "meta_results" | "actions" | "reach_field" | "unavailable";
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  inlineLinkClicks: number;
  allClicks: number;
  ctrLink: number | null;
  ctrAll: number | null;
  purchaseValue: number | null;
  roas: number | null;
  unitCost: number | null;
  costPerResultFromMeta: number | null;
}

function matchResultRowForGoal(results: any[], optimizationGoal?: string | null): any | null {
  if (!Array.isArray(results) || results.length === 0) return null;
  if (results.length === 1) return results[0];
  const opt = String(optimizationGoal || "").toUpperCase();
  if (opt) {
    const matched = results.find((r) => {
      const ind = String(r?.indicator || "").toLowerCase();
      if (opt === "PROFILE_VISIT" || opt === "VISIT_INSTAGRAM_PROFILE") return ind.includes("profile_visit") || ind.includes("visit_instagram_profile");
      if (opt === "PROFILE_AND_PAGE_ENGAGEMENT") return ind.includes("profile_visit") || ind.includes("page_visit");
      if (opt === "CONVERSATIONS" || opt === "REPLIES") return ind.includes("messaging_conversation_started") || ind.includes("total_messaging_connection");
      if (opt === "LANDING_PAGE_VIEWS") return ind.includes("landing_page_view");
      if (opt === "LEAD_GENERATION" || opt === "QUALITY_LEAD" || opt === "LEAD") return ind.includes("lead") || ind.includes("contact_website");
      if (opt === "PAGE_LIKES") return ind.includes("like");
      if (opt === "LINK_CLICKS") return ind.includes("link_click");
      if (opt === "THRUPLAY") return ind.includes("thruplay");
      if (opt === "REACH") return ind === "reach";
      return false;
    });
    if (matched) return matched;
  }
  return results[0];
}

function extractMetaResultValuesCount(values: any[] | undefined): number | null {
  if (!Array.isArray(values) || values.length === 0) return null;
  const defaultEntry = values.find(
    (v: any) => Array.isArray(v?.attribution_windows) && v.attribution_windows.includes("default")
  );
  const valObj = defaultEntry ?? values[0];
  const hasSplit = valObj && (valObj["7d_click"] !== undefined || valObj["1d_view"] !== undefined);
  if (hasSplit) {
    return parseMetaActionNumericValue(valObj);
  }
  if (valObj?.value !== undefined && valObj?.value !== null && valObj?.value !== "") {
    const parsed = parseFloat(String(valObj.value));
    if (Number.isFinite(parsed)) return parsed;
  }
  const entry7d = values.find(
    (v: any) => Array.isArray(v?.attribution_windows) && v.attribution_windows.includes("7d_click")
  );
  const entry1d = values.find(
    (v: any) => Array.isArray(v?.attribution_windows) && v.attribution_windows.includes("1d_view")
  );
  if (entry7d || entry1d) {
    const c = parseFloat(String(entry7d?.value ?? "0"));
    const v = parseFloat(String(entry1d?.value ?? "0"));
    return (Number.isFinite(c) ? c : 0) + (Number.isFinite(v) ? v : 0);
  }
  return null;
}

export function extractMetaInsightMetrics(row: any, context: {
  rawObjective?: string | null;
  optimizationGoal?: string | null;
  destinationType?: string | null;
  storedResultType?: string | null;
} = {}): ExtractedMetaInsightMetrics {
  const spend = Number.isFinite(parseFloat(String(row?.spend ?? "0"))) ? parseFloat(String(row?.spend ?? "0")) : 0;
  const impressions = Number.isFinite(parseInt(String(row?.impressions ?? "0"), 10)) ? parseInt(String(row?.impressions ?? "0"), 10) : 0;
  const reach = Number.isFinite(parseInt(String(row?.reach ?? "0"), 10)) ? parseInt(String(row?.reach ?? "0"), 10) : 0;
  const frequency = reach > 0 ? impressions / reach : (parseFloat(String(row?.frequency ?? "0")) || 0);

  const actions = Array.isArray(row?.actions) ? row.actions : [];
  const conversions = Array.isArray(row?.conversions) ? row.conversions : [];
  const combinedActions = conversions.length > 0 ? [...actions, ...conversions] : actions;
  const results = Array.isArray(row?.results) ? row.results : [];
  const optGoal = row?.optimization_goal || context.optimizationGoal || null;
  const rawObj = row?.objective || context.rawObjective || null;

  const inlineLinkClicksRaw = parseInt(String(row?.inline_link_clicks ?? ""), 10);
  const actionLinkClicks = Math.round(extractActionByExactTypes(actions, ["link_click"]));
  const inlineLinkClicks = Number.isFinite(inlineLinkClicksRaw) ? inlineLinkClicksRaw : actionLinkClicks;

  const allClicksRaw = parseInt(String(row?.clicks ?? ""), 10);
  const allClicks = Number.isFinite(allClicksRaw) ? allClicksRaw : inlineLinkClicks;

  const ctrLink = impressions > 0 ? (inlineLinkClicks / impressions) * 100 : null;
  const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : null;

  const matchedResult = matchResultRowForGoal(results, optGoal);
  const resultIndicator = matchedResult?.indicator ? String(matchedResult.indicator) : null;

  const category = detectStrictConversionCategory({
    rawObjective: rawObj,
    optimizationGoal: optGoal,
    destinationType: context.destinationType,
    results: matchedResult ? [matchedResult] : results,
    actions: combinedActions,
    storedResultType: context.storedResultType,
  });

  // Extraction of purchase value for real ROAS (never fabricated!)
  const actionValues = Array.isArray(row?.action_values) ? row.action_values : [];
  let purchaseValue: number | null = null;
  if (actionValues.length > 0) {
    const pv = extractActionByExactTypes(actionValues, [
      "omni_purchase",
      "offsite_conversion.fb_pixel_purchase",
      "purchase",
      "onsite_conversion.purchase",
    ]);
    if (pv > 0) purchaseValue = pv;
  }
  const roas = purchaseValue !== null && spend > 0 ? purchaseValue / spend : null;

  // Cost per result returned by Meta directly if present
  let costPerResultFromMeta: number | null = null;
  if (Array.isArray(row?.cost_per_result) && row.cost_per_result.length > 0) {
    const cprRaw = row.cost_per_result[0]?.values?.[0]?.value;
    const cprNum = parseFloat(String(cprRaw ?? ""));
    if (Number.isFinite(cprNum) && cprNum > 0) costPerResultFromMeta = cprNum;
  }

  let resultCount: number | null = null;
  let resultSource: ExtractedMetaInsightMetrics["resultSource"] = "unavailable";

  // 1. Native Meta `results[]` takes absolute precedence
  if (matchedResult) {
    const parsed = extractMetaResultValuesCount(matchedResult.values);
    if (parsed !== null) {
      resultCount = parsed;
      resultSource = "meta_results";
    } else if (matchedResult.indicator) {
      // Meta returned indicator without value -> explicitly 0 occurrences of that configured result!
      resultCount = 0;
      resultSource = "meta_results";
    }
  }

  // 2. Exact `actions[]` extraction by resolved category (never substituting unrelated actions)
  if (resultCount === null) {
    switch (category) {
      case "MESSAGES":
        resultCount = extractActionByExactTypes(actions, [
          "onsite_conversion.messaging_conversation_started_7d",
          "onsite_conversion.total_messaging_connection",
          "messaging_conversation_started_7d",
          "onsite_conversion.messaging_first_reply",
        ]);
        resultSource = "actions";
        break;
      case "INSTAGRAM_PROFILE":
        resultCount = extractActionByExactTypes(actions, [
          "profile_visit_view",
          "instagram_profile_visit",
          "instagram_profile_view",
          "visit_instagram_profile",
          "onsite_conversion.instagram_profile_visit",
          "profile_visit",
        ]);
        resultSource = "actions";
        break;
      case "LANDING_PAGE_VIEWS":
        resultCount = extractActionByExactTypes(actions, [
          "landing_page_view",
          "onsite_conversion.landing_page_view",
          "omni_landing_page_view",
        ]);
        resultSource = "actions";
        break;
      case "PURCHASES":
        resultCount = extractActionByExactTypes(actions, [
          "omni_purchase",
          "offsite_conversion.fb_pixel_purchase",
          "onsite_conversion.purchase",
          "purchase",
        ]);
        resultSource = "actions";
        break;
      case "LEADS":
        resultCount = extractActionByExactTypes(combinedActions, [
          "contact_website",
          "lead",
          "onsite_conversion.lead_grouped",
          "leadgen_grouped",
          "offsite_conversion.fb_pixel_lead",
          "complete_registration",
          "offsite_conversion.fb_pixel_complete_registration",
        ]);
        resultSource = "actions";
        break;
      case "CHECKOUT":
        resultCount = extractActionByExactTypes(combinedActions, [
          "omni_initiated_checkout",
          "offsite_conversion.fb_pixel_initiate_checkout",
          "initiate_checkout",
        ]);
        resultSource = "actions";
        break;
      case "ADD_TO_CART":
        resultCount = extractActionByExactTypes(combinedActions, [
          "omni_add_to_cart",
          "offsite_conversion.fb_pixel_add_to_cart",
          "add_to_cart",
        ]);
        resultSource = "actions";
        break;
      case "VIDEO_VIEWS":
        resultCount = extractActionByExactTypes(combinedActions, [
          "thruplay",
          "video_thruplay_watched_actions",
          "video_view",
        ]);
        resultSource = "actions";
        break;
      case "ENGAGEMENT":
        resultCount = extractActionByExactTypes(combinedActions, [
          "page_visit_view",
          "like",
          "post_engagement",
          "page_engagement",
          "post_reaction",
        ]);
        resultSource = "actions";
        break;
      case "REACH":
        resultCount = reach;
        resultSource = "reach_field";
        break;
      case "LINK_CLICKS":
        resultCount = inlineLinkClicks;
        resultSource = "actions";
        break;
      case "UNKNOWN":
      default:
        resultCount = null;
        resultSource = "unavailable";
        break;
    }
  }

  let unitCost: number | null = null;
  if (resultCount !== null && resultCount > 0) {
    unitCost = category === "REACH" ? (spend / resultCount) * 1000 : spend / resultCount;
  }

  return {
    category,
    resultCount,
    resultIndicator,
    resultSource,
    spend,
    impressions,
    reach,
    frequency,
    inlineLinkClicks,
    allClicks,
    ctrLink,
    ctrAll,
    purchaseValue,
    roas,
    unitCost,
    costPerResultFromMeta,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILIACAO DE CONTA & ALCANCE DEDUPLICADO (SEM ARREDONDAMENTO INTERMEDIARIO)
// ─────────────────────────────────────────────────────────────────────────────

export interface EntityParityItem {
  id: string;
  externalId: string | null;
  name: string;
  spend: number;
  results: number | null;
  impressions: number;
  reach: number;
  inlineLinkClicks: number;
  allClicks: number;
  category: NormalizedResultCategory;
}

export interface AccountReconciliationSummary {
  totalSpend: number;
  totalResultsKnown: number;
  hasUnclassifiedResults: boolean;
  totalImpressions: number;
  inlineLinkClicks: number;
  allClicks: number;
  ctrLink: number | null;
  ctrAll: number | null;
  cpm: number | null;
  unitCost: number | null;
  accountReach: number | null;
  reachIsDeduplicated: boolean;
  campaignReachSum: number;
  reachDisplayLabel: string;
  unitCostFormatted: string | null;
}

export function formatCurrencyBRLStrict(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function reconcileAccountSummary(params: {
  items: EntityParityItem[];
  deduplicatedAccountReach?: number | null;
}): AccountReconciliationSummary {
  const { items, deduplicatedAccountReach } = params;
  // Nunca acumular valores pre-arredondados! Soma completa em ponto flutuante e formata apenas na exibicao.
  const totalSpend = items.reduce((s, x) => s + (Number.isFinite(x.spend) ? x.spend : 0), 0);
  const totalResultsKnown = items.reduce((s, x) => s + (x.results !== null && Number.isFinite(x.results) ? x.results : 0), 0);
  const hasUnclassifiedResults = items.some((x) => x.category === "UNKNOWN" && x.spend > 0);
  const totalImpressions = items.reduce((s, x) => s + (Number.isFinite(x.impressions) ? x.impressions : 0), 0);
  const inlineLinkClicks = items.reduce((s, x) => s + (Number.isFinite(x.inlineLinkClicks) ? x.inlineLinkClicks : 0), 0);
  const allClicks = items.reduce((s, x) => s + (Number.isFinite(x.allClicks) ? x.allClicks : 0), 0);
  const campaignReachSum = items.reduce((s, x) => s + (Number.isFinite(x.reach) ? x.reach : 0), 0);

  const hasAccountReach =
    deduplicatedAccountReach !== undefined &&
    deduplicatedAccountReach !== null &&
    Number.isFinite(deduplicatedAccountReach) &&
    deduplicatedAccountReach >= 0;

  const accountReach = hasAccountReach ? deduplicatedAccountReach! : null;
  const reachIsDeduplicated = hasAccountReach || items.length === 1;
  const reachDisplayLabel = hasAccountReach
    ? "Alcance da conta (deduplicado)"
    : items.length === 1
    ? "Alcance da campanha"
    : "Alcance (soma não deduplicada)";

  const unitCost = totalResultsKnown > 0 ? totalSpend / totalResultsKnown : null;

  return {
    totalSpend,
    totalResultsKnown,
    hasUnclassifiedResults,
    totalImpressions,
    inlineLinkClicks,
    allClicks,
    ctrLink: totalImpressions > 0 ? (inlineLinkClicks / totalImpressions) * 100 : null,
    ctrAll: totalImpressions > 0 ? (allClicks / totalImpressions) * 100 : null,
    cpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : null,
    unitCost,
    accountReach,
    reachIsDeduplicated,
    campaignReachSum,
    reachDisplayLabel,
    unitCostFormatted: formatCurrencyBRLStrict(unitCost),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BILLING META NORMALIZER (CENTAVOS -> UNIDADE MONETARIA, PERMISSAO VS ZERO)
// ─────────────────────────────────────────────────────────────────────────────

const ZERO_DECIMAL_CURRENCIES = new Set(["JPY", "KRW", "VND", "CLP", "PYG", "BIF", "DJF", "GNF", "ISK", "KMF", "MGA", "RWF", "UGX", "VUV", "XAF", "XOF", "XPF"]);

export function parseMetaMoneyMinorUnit(raw: unknown, currency: string = "BRL"): number | null {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw === "object" && raw !== null && "amount" in (raw as any)) {
    return parseMetaMoneyMinorUnit((raw as any).amount, (raw as any).currency || currency);
  }
  const s = String(raw).trim();
  const num = parseFloat(s);
  if (!Number.isFinite(num)) return null;
  if (s.includes(".")) return num;
  if (ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())) return num;
  return num / 100;
}

export interface NormalizedMetaBilling {
  adAccountId: string;
  currency: string;
  isPrepayAccount: boolean | null;
  balance: number | null;
  amountSpent: number | null;
  spendCap: number | null; // null quando "0" (sem teto configurado) ou ausente
  spendCapState: "configured" | "no_cap" | "unavailable";
  minBillingThreshold: number | null;
  billImmature: number | null;
  accountStatus: number | null;
  disableReason: number | null;
  permissionGaps: string[];
}

export function normalizeMetaBillingAccount(raw: any, permissionGaps: string[] = []): NormalizedMetaBilling {
  const currency = String(raw?.currency || "BRL").toUpperCase();
  const rawCap = parseMetaMoneyMinorUnit(raw?.spend_cap, currency);
  const spendCapState: NormalizedMetaBilling["spendCapState"] =
    rawCap === null ? "unavailable" : rawCap === 0 ? "no_cap" : "configured";

  return {
    adAccountId: String(raw?.id || ""),
    currency,
    isPrepayAccount: raw?.is_prepay_account === undefined ? null : Boolean(raw.is_prepay_account),
    balance: parseMetaMoneyMinorUnit(raw?.balance, currency),
    amountSpent: parseMetaMoneyMinorUnit(raw?.amount_spent, currency),
    spendCap: spendCapState === "configured" ? rawCap : null,
    spendCapState,
    minBillingThreshold: parseMetaMoneyMinorUnit(raw?.min_billing_threshold, currency),
    billImmature: parseMetaMoneyMinorUnit(raw?.bill_amount_immature, currency),
    accountStatus: raw?.account_status !== undefined ? Number(raw.account_status) : null,
    disableReason: raw?.disable_reason !== undefined ? Number(raw.disable_reason) : null,
    permissionGaps,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL MEDIA NORMALIZER (PRESERVA CROSSPOSTS IG+FB SEM FABRICAR METRICAS)
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedSocialPostRecord {
  id: string;
  platform: "instagram" | "facebook";
  metaPostId: string | null;
  pageId: string;
  accountName: string;
  accountHandle: string;
  title: string;
  content: string;
  postType: "feed" | "reels" | "stories" | "carousel";
  status: "draft" | "pending_approval" | "scheduled" | "published" | "failed";
  publishedAt: string | null;
  scheduledAt: string | null;
  likesCount: number;
  commentsCount: number;
  sharesCount: number | null;
  savesCount: number | null;
  reachCount: number | null;
  impressionsCount: number | null;
  reachState: FieldState;
  impressionsState: FieldState;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  source: "meta_live" | "supabase";
}

export function mergeSocialCrosspostRecords(params: {
  dbRows: Array<{
    id: string;
    page_id?: string;
    account_name?: string;
    account_handle?: string;
    title: string;
    content: string;
    post_type: "feed" | "reels" | "stories" | "carousel";
    status: "draft" | "pending_approval" | "scheduled" | "published" | "failed";
    platform: "instagram" | "facebook" | "both";
    scheduled_at?: string | null;
    published_at?: string | null;
    meta_post_id?: string | null;
    likes_count?: number | null;
    comments_count?: number | null;
    shares_count?: number | null;
    saves_count?: number | null;
    reach_count?: number | null;
    impressions_count?: number | null;
    media_url?: string | null;
    thumbnail_url?: string | null;
    permalink?: string | null;
  }>;
  metaLivePosts: NormalizedSocialPostRecord[];
}): NormalizedSocialPostRecord[] {
  const liveByPlatformAndId = new Map<string, NormalizedSocialPostRecord>();
  for (const mp of params.metaLivePosts) {
    if (mp.metaPostId) {
      liveByPlatformAndId.set(`${mp.platform}:${mp.metaPostId}`, mp);
    }
  }

  const matchedLiveKeys = new Set<string>();
  const result: NormalizedSocialPostRecord[] = [];

  for (const row of params.dbRows) {
    const rawMetaIds = (row.meta_post_id || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // Se um post local foi publicado em "both" com IDs do FB e do IG, expande e reconcilia POR CANAL para nunca fundir alcance de redes distintas!
    const targetPlatforms: Array<"facebook" | "instagram"> =
      row.platform === "both" ? ["facebook", "instagram"] : [row.platform];

    let matchedAnyLive = false;
    for (const plat of targetPlatforms) {
      let matchedLive: NormalizedSocialPostRecord | undefined;
      for (const mid of rawMetaIds) {
        const candidate = liveByPlatformAndId.get(`${plat}:${mid}`);
        if (candidate) {
          matchedLive = candidate;
          matchedLiveKeys.add(`${plat}:${mid}`);
          break;
        }
      }

      if (matchedLive) {
        matchedAnyLive = true;
        result.push({
          ...matchedLive,
          id: row.platform === "both" ? `${row.id}_${plat}` : row.id,
        });
      }
    }

    if (!matchedAnyLive) {
      const platFallback: "facebook" | "instagram" =
        row.platform === "facebook" ? "facebook" : "instagram";
      result.push({
        id: row.id,
        platform: platFallback,
        metaPostId: rawMetaIds[0] || null,
        pageId: row.page_id || "",
        accountName: row.account_name || "",
        accountHandle: row.account_handle || "",
        title: row.title,
        content: row.content,
        postType: row.post_type,
        status: row.status,
        scheduledAt: row.scheduled_at || null,
        publishedAt: row.published_at || null,
        likesCount: Number(row.likes_count || 0),
        commentsCount: Number(row.comments_count || 0),
        sharesCount: row.shares_count ?? null,
        savesCount: row.saves_count ?? null,
        reachCount: row.reach_count !== undefined && row.reach_count !== null && row.reach_count > 0 ? Number(row.reach_count) : null,
        impressionsCount: row.impressions_count !== undefined && row.impressions_count !== null && row.impressions_count > 0 ? Number(row.impressions_count) : null,
        reachState: row.reach_count && row.reach_count > 0 ? "observado" : "indisponivel",
        impressionsState: row.impressions_count && row.impressions_count > 0 ? "observado" : "indisponivel",
        permalink: row.permalink || null,
        mediaUrl: row.media_url || null,
        thumbnailUrl: row.thumbnail_url || row.media_url || null,
        source: "supabase",
      });
    }
  }

  for (const mp of params.metaLivePosts) {
    const key = mp.metaPostId ? `${mp.platform}:${mp.metaPostId}` : "";
    if (key && matchedLiveKeys.has(key)) continue;
    result.push(mp);
  }

  return result;
}
