import { format, parseISO, subDays, addDays, differenceInCalendarDays } from "date-fns";
import { supabase } from "@/integrations/supabase-external/client";
import {
  META_GRAPH_BASE,
  mergeSocialCrosspostRecords,
  metaFetchJsonWithRetry,
  metaFetchPaginatedWithStatus,
} from "./metaIntegrationCore";
import {
  classifySocialErrorState,
  buildSocialSourceTelemetry,
  deriveOverallSocialState,
  isVictoriaSocialContextUsable,
  SOCIAL_SOURCE_LABELS,
  type SocialDataState,
  type SocialSourceKey,
  type SocialSourceTelemetry,
  type SocialDataSourceKind,
} from "./metaSocialErrors";

const META_API_BASE = META_GRAPH_BASE;

export interface RealSocialAccount {
  page_id: string;
  page_name: string;
  access_token: string;
  facebook_followers: number;
  instagram_account_id: string | null;
  instagram_handle: string | null;
  instagram_followers: number;
  profile_picture_url?: string | null;
}

export interface RealDailyPoint {
  date: string;
  label: string;
  reachIg: number;
  newFollowersIg: number;
  newFollowersFb: number;
  viewsFb: number;
  engFb: number;
  isSelectedRange: boolean;
}

export interface RealSocialPost {
  id: string;
  accountName: string;
  accountHandle: string;
  title: string;
  content: string;
  post_type: "reels" | "image" | "carousel" | "stories";
  media_product_type?: string;
  platform: "instagram" | "facebook";
  likes_count: number;
  comments_count: number;
  shares_count: number;
  saved_count: number;
  reach_count: number;
  views_count: number;
  total_interactions: number;
  engagement_rate: number;
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  ai_sentiment: string;
  ai_recommendation: string;
}

export interface RealDemographics {
  available: boolean;
  totalSample: number;
  gender: { male: number; female: number };
  age: { range: string; male: number; female: number }[];
}

export {
  classifySocialErrorState,
  buildSocialSourceTelemetry,
  deriveOverallSocialState,
  isVictoriaSocialContextUsable,
  SOCIAL_SOURCE_LABELS,
};
export type {
  SocialDataState,
  SocialSourceKey,
  SocialSourceTelemetry,
  SocialDataSourceKind,
};

export interface SocialSectionStatus {
  state: SocialDataState;
  message?: string;
  endpoint?: string;
  accountId?: string;
  accountName?: string;
  updatedAt: string;
}

export interface SocialEndpointFailureLog {
  endpoint: string;
  accountId: string;
  accountName: string;
  section: string;
  state: SocialDataState;
  message: string;
  timestamp: string;
}

export type SocialFieldAvailability = "available" | "unavailable" | "error";

export interface RealSocialInsightsResult {
  accounts: RealSocialAccount[];
  dailySeries: RealDailyPoint[];
  chartWindowDays: number;
  kpis: {
    followersIg: number;
    followersFb: number;
    newFollowersIg: number;
    newFollowersFb: number;
    reachIg: number;
    viewsIg: number;
    viewsFb: number;
    interactionsIg: number;
    interactionsFb: number;
    accountsEngaged: number;
    profileViews: number;
    websiteClicks: number;
    reachDeltaPct: number | null;
    followersDeltaPct: number | null;
  };
  fieldAvailability?: {
    reachIg: SocialFieldAvailability;
    viewsIg: SocialFieldAvailability;
    viewsFb: SocialFieldAvailability;
    interactionsIg: SocialFieldAvailability;
    interactionsFb: SocialFieldAvailability;
    profileViews: SocialFieldAvailability;
    websiteClicks: SocialFieldAvailability;
    followers: SocialFieldAvailability;
  };
  demographics: RealDemographics;
  posts: RealSocialPost[];
  heatmapMatrix: number[][];
  hasPostsForHeatmap: boolean;
  heatmapSampleSize?: number;
  apiLimitations?: string[];
  syncSource: "meta_graph_v21" | "no_token" | "api_error";
  errorMessage?: string;
  overallState?: SocialDataState;
  sectionStates?: {
    identity: SocialSectionStatus;
    followers: SocialSectionStatus;
    accountInsights: SocialSectionStatus;
    dailySeries: SocialSectionStatus;
    demographics: SocialSectionStatus;
    posts: SocialSectionStatus;
    postInsights: SocialSectionStatus;
  };
  endpointLogs?: SocialEndpointFailureLog[];
  windowUsed?: {
    dateFrom: string;
    dateTo: string;
    chartSince: string;
    chartDays: number;
  };
  snapshotAt?: string;
  isFromLastValidSnapshot?: boolean;
  lastValidSnapshotAt?: string | null;
}

const DEFAULT_META_CALL_TIMEOUT_MS = 10_000;
const DEFAULT_META_PAGINATED_TIMEOUT_MS = 12_000;
const CONSOLIDATED_MAX_ACCOUNTS = 6;
const SOCIAL_SNAPSHOT_CACHE_PREFIX = "nc_social_last_snapshot_v1_";
const SOCIAL_OVERVIEW_CACHE_PREFIX = "nc_social_overview_v2_";
const SOCIAL_POSTS_CACHE_PREFIX = "nc_social_posts_v2_";
const inMemorySocialSnapshots = new Map<string, RealSocialInsightsResult>();
const inMemoryOverviewSnapshots = new Map<string, SocialOverviewResult>();
const inMemoryPostsSnapshots = new Map<string, SocialPostsResult>();

export type SimulatedSocialFault =
  | "token_expired"
  | "permission_denied"
  | "rate_limited"
  | "timeout"
  | "posts_error"
  | "overview_error"
  | "empty_posts"
  | null;

export function resolveSimulatedSocialFault(override?: string | null): SimulatedSocialFault {
  const raw =
    override ??
    (typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("sim_fault")
      : null);
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  if (
    norm === "token_expired" ||
    norm === "permission_denied" ||
    norm === "rate_limited" ||
    norm === "timeout" ||
    norm === "posts_error" ||
    norm === "overview_error" ||
    norm === "empty_posts"
  ) {
    return norm;
  }
  return null;
}

function createLinkedAbortController(
  parentSignal?: AbortSignal,
  timeoutMs = 15_000
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const onParentAbort = () => controller.abort();
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
    }
  }
  if (timeoutMs > 0) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  const cleanup = () => {
    if (timer) clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener("abort", onParentAbort);
  };
  return { controller, cleanup };
}

function withBoundedTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  signal?: AbortSignal
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(`Requisição cancelada em ${label}`));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(`Timeout (${Math.round(timeoutMs / 1000)}s) em ${label}`));
    };
    const timer = setTimeout(onAbort, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(err);
      }
    );
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

export function saveLastValidSocialSnapshot(cacheKey: string, snapshot: RealSocialInsightsResult): void {
  const stamped: RealSocialInsightsResult = {
    ...snapshot,
    snapshotAt: snapshot.snapshotAt || new Date().toISOString(),
    isFromLastValidSnapshot: false,
  };
  inMemorySocialSnapshots.set(cacheKey, stamped);
  if (typeof localStorage !== "undefined") {
    try {
      // Compactar para evitar estourar quota em localStorage
      const compact: RealSocialInsightsResult = {
        ...stamped,
        posts: stamped.posts.slice(0, 20),
      };
      localStorage.setItem(`${SOCIAL_SNAPSHOT_CACHE_PREFIX}${cacheKey}`, JSON.stringify(compact));
    } catch {
      // ignore quota errors
    }
  }
}

export function getLastValidSocialSnapshot(cacheKey: string): RealSocialInsightsResult | null {
  const mem = inMemorySocialSnapshots.get(cacheKey);
  if (mem) return mem;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SOCIAL_SNAPSHOT_CACHE_PREFIX}${cacheKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kpis) {
      inMemorySocialSnapshots.set(cacheKey, parsed);
      return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

async function fetchMetaJson(
  url: string,
  timeoutMs = DEFAULT_META_CALL_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<any> {
  const endpointLabel = url.split("?")[0].replace(META_API_BASE, "");
  const t0 = Date.now();
  try {
    const res = await metaFetchJsonWithRetry(url, {
      maxRetries: 1,
      baseDelayMs: 300,
      timeoutMs,
      signal,
    });
    if (res.ok) return res.data;
    const elapsed = Date.now() - t0;
    // Só aciona o proxy se foi bloqueio rápido de rede (ex: Brave Shields) e não um timeout/abort
    if (res.errorKind === "network" && !signal?.aborted && elapsed < Math.max(3500, timeoutMs - 2000)) {
      const remainingMs = Math.max(4000, timeoutMs - elapsed);
      try {
        const proxyResp: any = await withBoundedTimeout(
          supabase.functions.invoke("sync-social-media", {
            body: { action: "graph-proxy", url, timeoutMs: remainingMs },
          }),
          remainingMs,
          `proxy:${endpointLabel}`,
          signal
        );
        if (!proxyResp?.error && proxyResp?.data) return proxyResp.data;
      } catch (proxyErr: any) {
        return { error: { message: proxyErr?.message || "Timeout ao consultar proxy Meta", code: 504 } };
      }
    }
    return res.data?.error
      ? res.data
      : { error: { message: res.error || "Erro ao consultar Meta API", code: res.errorCode || 500, errorKind: res.errorKind } };
  } catch (err: any) {
    return { error: { message: err?.message || `Timeout ao consultar ${endpointLabel}`, code: 504, is_timeout: true } };
  }
}

async function fetchMetaPaginatedList(
  endpoint: string,
  token: string,
  params: Record<string, string>,
  maxPages = 5,
  timeoutMs = DEFAULT_META_PAGINATED_TIMEOUT_MS,
  signal?: AbortSignal
) {
  const t0 = Date.now();
  try {
    const res = await metaFetchPaginatedWithStatus(endpoint, token, params, {
      maxRetries: 1,
      baseDelayMs: 300,
      maxPages,
      timeoutMs,
      signal,
    });
    const elapsed = Date.now() - t0;
    if (!res.ok && res.errorKind === "network" && !signal?.aborted && elapsed < Math.max(4000, timeoutMs - 2000)) {
      const remainingMs = Math.max(4500, timeoutMs - elapsed);
      try {
        const proxyResp: any = await withBoundedTimeout(
          supabase.functions.invoke("sync-social-media", {
            body: { action: "graph-proxy", paginated: true, endpoint, params, token, maxPages, timeoutMs: remainingMs },
          }),
          remainingMs,
          `proxy:${endpoint}`,
          signal
        );
        if (!proxyResp?.error && proxyResp?.data?.paginated) {
          return proxyResp.data;
        }
      } catch (proxyErr: any) {
        return {
          ok: false,
          data: [],
          pagesFetched: 0,
          truncated: false,
          statusCode: 504,
          attempts: 1,
          error: proxyErr?.message || `Timeout em ${endpoint}`,
          errorCode: 504,
          errorKind: "network" as const,
          rateLimitUsagePct: null,
        };
      }
    }
    return res;
  } catch (err: any) {
    return {
      ok: false,
      data: [],
      pagesFetched: 0,
      truncated: false,
      statusCode: 504,
      attempts: 1,
      error: err?.message || `Timeout em ${endpoint}`,
      errorCode: 504,
      errorKind: "network" as const,
      rateLimitUsagePct: null,
    };
  }
}

export async function getActiveMasterMetaToken(): Promise<string | null> {
  const { data } = await supabase
    .from("meta_ads_configs")
    .select("access_token")
    .not("access_token", "is", null)
    .order("created_at", { ascending: false })
    .limit(15);

  const valid = ((data || []) as any[]).find((row) => {
    const t = String(row?.access_token || "").trim();
    return t.length >= 20 && !t.startsWith("mock_");
  });
  return valid?.access_token ? String(valid.access_token).trim() : null;
}

/**
 * Busca as contas reais conectadas diretamente no Meta Graph API (/me/accounts)
 * usando o token ativo, com proxy automático via Edge Function quando o navegador bloqueia graph.facebook.com.
 */
export async function fetchLiveSocialAccounts(
  syncToDb = false,
  options?: { signal?: AbortSignal; simulatedFault?: SimulatedSocialFault }
): Promise<{
  accounts: RealSocialAccount[];
  masterToken: string | null;
  hasMasterToken?: boolean;
  error?: string;
  telemetry: SocialSourceTelemetry;
}> {
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const timeoutMs = 12_000;
  const fault = resolveSimulatedSocialFault(options?.simulatedFault);

  if (fault === "token_expired") {
    const finishedAt = new Date().toISOString();
    const errMsg = "Error validating access token: Session has expired (code 190)";
    return {
      accounts: [],
      masterToken: null,
      hasMasterToken: false,
      error: errMsg,
      telemetry: buildSocialSourceTelemetry({
        source: "accounts",
        state: "token_expired",
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        timeoutMs,
        error: errMsg,
        itemCount: 0,
        dataSource: "meta_graph_v21",
        snapshotAt: finishedAt,
        fromCache: false,
      }),
    };
  }

  const [masterTokenRaw, dbPagesRes] = await Promise.all([
    getActiveMasterMetaToken().catch(() => null),
    supabase.from("social_pages").select("*").order("page_name").then((r) => r, () => ({ data: [] })),
  ]);
  const masterToken = masterTokenRaw;
  const dbPages = (dbPagesRes as any)?.data || [];

  const mapDbPages = (fallbackToken: string) => {
    const list = ((dbPages || []) as any[])
      .filter((p) => p.page_id && !String(p.page_id).startsWith("mock_"))
      .map((p) => ({
        page_id: p.page_id,
        page_name: p.page_name,
        access_token: p.access_token || fallbackToken,
        facebook_followers: Number(p.facebook_followers || 0),
        instagram_account_id: p.instagram_account_id || null,
        instagram_handle: p.instagram_handle || null,
        instagram_followers: Number(p.instagram_followers || 0),
        profile_picture_url: null,
      }));
    list.sort(
      (a, b) =>
        b.instagram_followers + b.facebook_followers - (a.instagram_followers + a.facebook_followers)
    );
    return list;
  };

  if (!masterToken) {
    try {
      const { data: edgeData, error: edgeErr } = await withBoundedTimeout(
        supabase.functions.invoke("sync-social-media", {
          body: { action: "get-live-accounts", syncToDb },
        }),
        timeoutMs,
        "get-live-accounts",
        options?.signal
      );
      if (!edgeErr && edgeData) {
        const finishedAt = new Date().toISOString();
        const edgeAccs: RealSocialAccount[] = edgeData.accounts || [];
        return {
          accounts: edgeAccs,
          masterToken: edgeData.masterToken || null,
          hasMasterToken: Boolean(edgeData.hasMasterToken || edgeData.masterToken),
          error: edgeData.error,
          telemetry: buildSocialSourceTelemetry({
            source: "accounts",
            state: edgeAccs.length > 0 ? "success" : edgeData.hasMasterToken ? "empty" : "token_expired",
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            timeoutMs,
            error: edgeData.error || null,
            itemCount: edgeAccs.length,
            dataSource: "edge_proxy",
            snapshotAt: finishedAt,
            fromCache: false,
          }),
        };
      }
    } catch {
      // prossegue para fallback local
    }

    const mappedDb = mapDbPages("");
    const finishedAt = new Date().toISOString();
    const errMsg = "Token Master da Meta não configurado em Configurações → Integrações Master.";
    return {
      accounts: mappedDb,
      masterToken: null,
      hasMasterToken: false,
      error: errMsg,
      telemetry: buildSocialSourceTelemetry({
        source: "accounts",
        state: mappedDb.length > 0 ? "partial" : "token_expired",
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        timeoutMs,
        error: errMsg,
        itemCount: mappedDb.length,
        dataSource: mappedDb.length > 0 ? "supabase_cache" : "none",
        snapshotAt: finishedAt,
        fromCache: mappedDb.length > 0,
      }),
    };
  }

  const mePaginated = await fetchMetaPaginatedList(
    "/me/accounts",
    masterToken,
    {
      fields:
        "id,name,access_token,fan_count,followers_count,instagram_business_account{id,username,followers_count,profile_picture_url}",
      limit: "100",
    },
    10,
    timeoutMs,
    options?.signal
  );

  if (!mePaginated.ok && mePaginated.data.length === 0) {
    try {
      const { data: edgeData, error: edgeErr } = await withBoundedTimeout(
        supabase.functions.invoke("sync-social-media", {
          body: { action: "get-live-accounts", syncToDb },
        }),
        8_000,
        "get-live-accounts-fallback",
        options?.signal
      );
      if (!edgeErr && edgeData && Array.isArray(edgeData.accounts) && edgeData.accounts.length > 0) {
        const finishedAt = new Date().toISOString();
        return {
          accounts: edgeData.accounts,
          masterToken: edgeData.masterToken || masterToken,
          hasMasterToken: true,
          error: edgeData.error,
          telemetry: buildSocialSourceTelemetry({
            source: "accounts",
            state: "success",
            startedAt,
            finishedAt,
            durationMs: Date.now() - t0,
            timeoutMs,
            error: edgeData.error || null,
            itemCount: edgeData.accounts.length,
            dataSource: "edge_proxy",
            snapshotAt: finishedAt,
            fromCache: false,
          }),
        };
      }
    } catch {
      // prossegue para fallback em dbPages
    }

    const mappedDb = mapDbPages(masterToken);
    const finishedAt = new Date().toISOString();
    const classified = classifySocialErrorState(mePaginated.error || "Não foi possível consultar páginas conectadas no Meta.");
    return {
      accounts: mappedDb,
      masterToken,
      hasMasterToken: true,
      error: classified.message,
      telemetry: buildSocialSourceTelemetry({
        source: "accounts",
        state: mappedDb.length > 0 ? "partial" : classified.state,
        startedAt,
        finishedAt,
        durationMs: Date.now() - t0,
        timeoutMs,
        error: classified.message,
        itemCount: mappedDb.length,
        dataSource: mappedDb.length > 0 ? "supabase_cache" : "meta_graph_v21",
        snapshotAt: finishedAt,
        fromCache: mappedDb.length > 0,
      }),
    };
  }

  const accounts: RealSocialAccount[] = mePaginated.data.map((p: any) => ({
    page_id: p.id,
    page_name: p.name,
    access_token: p.access_token || masterToken,
    facebook_followers: Number(p.followers_count ?? p.fan_count ?? 0),
    instagram_account_id: p.instagram_business_account?.id || null,
    instagram_handle: p.instagram_business_account?.username || null,
    instagram_followers: Number(p.instagram_business_account?.followers_count ?? 0),
    profile_picture_url: p.instagram_business_account?.profile_picture_url || null,
  }));

  accounts.sort(
    (a, b) =>
      b.instagram_followers + b.facebook_followers - (a.instagram_followers + a.facebook_followers)
  );

  if (syncToDb && accounts.length > 0) {
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData?.user?.id;
      if (userId) {
        const nowIso = new Date().toISOString();
        const rows = accounts.map((acc) => ({
          user_id: userId,
          page_id: acc.page_id,
          page_name: acc.page_name,
          instagram_account_id: acc.instagram_account_id,
          instagram_handle: acc.instagram_handle,
          access_token: acc.access_token,
          facebook_followers: acc.facebook_followers,
          instagram_followers: acc.instagram_followers,
          updated_at: nowIso,
        }));
        await (supabase as any).from("social_pages").upsert(rows, { onConflict: "page_id" });
      }
    } catch {
      // ignora erro de permissão de escrita
    }
  }

  const finishedAt = new Date().toISOString();
  return {
    accounts,
    masterToken,
    hasMasterToken: true,
    telemetry: buildSocialSourceTelemetry({
      source: "accounts",
      state: accounts.length > 0 ? "success" : "empty",
      startedAt,
      finishedAt,
      durationMs: Date.now() - t0,
      timeoutMs,
      error: null,
      itemCount: accounts.length,
      dataSource: "meta_graph_v21",
      snapshotAt: finishedAt,
      fromCache: false,
    }),
  };
}

function parseDemographicsFromApi(demoRes: any): RealDemographics {
  const empty: RealDemographics = {
    available: false,
    totalSample: 0,
    gender: { male: 0, female: 0 },
    age: [],
  };

  const results = demoRes?.data?.[0]?.total_value?.breakdowns?.[0]?.results;
  if (!Array.isArray(results) || results.length === 0) return empty;

  const buckets: Record<string, { male: number; female: number }> = {
    "18-24": { male: 0, female: 0 },
    "25-34": { male: 0, female: 0 },
    "35-44": { male: 0, female: 0 },
    "45-54": { male: 0, female: 0 },
    "55+": { male: 0, female: 0 },
  };

  let totalMale = 0;
  let totalFemale = 0;
  let totalAll = 0;

  for (const row of results) {
    const [ageKeyRaw, genderKey] = row.dimension_values || [];
    const val = Number(row.value || 0);
    if (val <= 0) continue;

    let bucketKey = ageKeyRaw;
    if (ageKeyRaw === "55-64" || ageKeyRaw === "65+") bucketKey = "55+";
    if (!buckets[bucketKey]) continue;

    if (genderKey === "M") {
      buckets[bucketKey].male += val;
      totalMale += val;
      totalAll += val;
    } else if (genderKey === "F") {
      buckets[bucketKey].female += val;
      totalFemale += val;
      totalAll += val;
    }
  }

  if (totalAll === 0) return empty;

  const malePct = Math.round((totalMale / totalAll) * 100);
  const femalePct = 100 - malePct;

  const ageArr = Object.entries(buckets).map(([range, counts]) => ({
    range,
    male: Math.round((counts.male / totalAll) * 100),
    female: Math.round((counts.female / totalAll) * 100),
  }));

  return {
    available: true,
    totalSample: totalAll,
    gender: { male: malePct, female: femalePct },
    age: ageArr,
  };
}

function classifyPostRecommendation(post: {
  mediaType: string;
  reach: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saved: number;
  caption: string;
}) {
  const interactions = post.likes + post.comments + post.shares + post.saved;
  const eng = post.reach > 0 ? interactions / post.reach : 0;

  if (post.reach === 0 && interactions === 0) {
    return {
      sentiment: "Recente / Em Coleta",
      recommendation: "Publicação recente com volume ainda em consolidação pela Meta API. Acompanhe nas próximas 24h.",
    };
  }
  if (eng >= 0.06 || post.shares >= 3 || post.saved >= 3) {
    return {
      sentiment: "Altamente Engajador",
      recommendation: `Taxa de ${(eng * 100).toFixed(1)}% (${post.shares} compartilhamentos e ${post.saved} salvamentos). Excelente candidato para impulsionamento local no Meta Ads.`,
    };
  }
  if (/preço|parcela|fipe|oferta|seminovo|ipva|zero|entrada|whatsapp|chama/i.test(post.caption)) {
    return {
      sentiment: "Foco Comercial",
      recommendation: `Publicação de oferta direta com ${post.views.toLocaleString("pt-BR")} visualizações e ${post.comments} comentários. Priorize resposta rápida no Direct/WhatsApp.`,
    };
  }
  return {
    sentiment: "Engajamento Orgânico",
    recommendation: `Alcançou ${post.reach.toLocaleString("pt-BR")} pessoas com ${post.views.toLocaleString("pt-BR")} visualizações. Teste gancho mais forte nos 3 primeiros segundos para elevar compartilhamentos.`,
  };
}

function buildRealHeatmap(posts: RealSocialPost[]): { matrix: number[][]; hasData: boolean } {
  const sums: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  const counts: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  let totalWeight = 0;

  for (const p of posts) {
    if (!p.published_at) continue;
    const dt = new Date(p.published_at);
    if (isNaN(dt.getTime())) continue;
    const day = dt.getDay();
    const hour = dt.getHours();
    const score = Math.max(1, p.likes_count + p.comments_count * 2 + p.shares_count * 3 + p.saved_count * 2 + Math.round(p.reach_count / 100));
    sums[day][hour] += score;
    counts[day][hour] += 1;
    totalWeight += score;
  }

  if (totalWeight === 0) {
    return { matrix: sums, hasData: false };
  }

  let maxVal = 0;
  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const avg = counts[d][h] > 0 ? sums[d][h] / counts[d][h] : 0;
      sums[d][h] = avg;
      if (avg > maxVal) maxVal = avg;
    }
  }

  const normalized = sums.map((row) =>
    row.map((v) => (maxVal > 0 && v > 0 ? Math.max(0.18, Number((v / maxVal).toFixed(2))) : 0))
  );

  return { matrix: normalized, hasData: true };
}

/**
 * Busca dados 100% REAIS do Meta Graph API v21.0 para uma conta específica ou consolidação real das contas conectadas.
 */
export interface SocialOverviewResult {
  accounts: RealSocialAccount[];
  targetAccounts: RealSocialAccount[];
  dailySeries: RealDailyPoint[];
  chartWindowDays: number;
  kpis: RealSocialInsightsResult["kpis"];
  fieldAvailability: NonNullable<RealSocialInsightsResult["fieldAvailability"]>;
  demographics: RealDemographics;
  sectionStates: {
    identity: SocialSectionStatus;
    followers: SocialSectionStatus;
    accountInsights: SocialSectionStatus;
    dailySeries: SocialSectionStatus;
    demographics: SocialSectionStatus;
  };
  telemetry: {
    overview: SocialSourceTelemetry;
    dailySeries: SocialSourceTelemetry;
    demographics: SocialSourceTelemetry;
  };
  endpointLogs: SocialEndpointFailureLog[];
  windowUsed: NonNullable<RealSocialInsightsResult["windowUsed"]>;
  snapshotAt: string;
  fromCache?: boolean;
  lastValidSnapshotAt?: string | null;
  syncSource: "meta_graph_v21" | "no_token" | "api_error";
  errorMessage?: string;
}

export interface SocialPostsResult {
  posts: RealSocialPost[];
  allRecentPosts: RealSocialPost[];
  inPeriodCount: number;
  heatmapMatrix: number[][];
  hasPostsForHeatmap: boolean;
  heatmapSampleSize: number;
  postsState: SocialSectionStatus;
  postInsightsState: SocialSectionStatus;
  telemetry: SocialSourceTelemetry;
  endpointLogs: SocialEndpointFailureLog[];
  snapshotAt: string;
  fromCache?: boolean;
  lastValidSnapshotAt?: string | null;
}

function saveOverviewSnapshot(key: string, data: SocialOverviewResult): void {
  inMemoryOverviewSnapshots.set(key, data);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(`${SOCIAL_OVERVIEW_CACHE_PREFIX}${key}`, JSON.stringify(data));
    } catch {
      // ignore quota
    }
  }
}

function getOverviewSnapshot(key: string): SocialOverviewResult | null {
  const mem = inMemoryOverviewSnapshots.get(key);
  if (mem) return mem;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SOCIAL_OVERVIEW_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.kpis) {
      inMemoryOverviewSnapshots.set(key, parsed);
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function savePostsSnapshot(key: string, data: SocialPostsResult): void {
  inMemoryPostsSnapshots.set(key, data);
  if (typeof localStorage !== "undefined") {
    try {
      const compact: SocialPostsResult = {
        ...data,
        posts: data.posts.slice(0, 24),
        allRecentPosts: data.allRecentPosts.slice(0, 24),
      };
      localStorage.setItem(`${SOCIAL_POSTS_CACHE_PREFIX}${key}`, JSON.stringify(compact));
    } catch {
      // ignore quota
    }
  }
}

function getPostsSnapshot(key: string): SocialPostsResult | null {
  const mem = inMemoryPostsSnapshots.get(key);
  if (mem) return mem;
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${SOCIAL_POSTS_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.posts)) {
      inMemoryPostsSnapshots.set(key, parsed);
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

function resolveTargetSocialAccounts(accounts: RealSocialAccount[], selectedPageId: string): RealSocialAccount[] {
  if (accounts.length === 0) return [];
  if (selectedPageId === "all") return accounts;
  const matched = accounts.find(
    (a) => a.page_id === selectedPageId || a.instagram_account_id === selectedPageId
  );
  return matched ? [matched] : [accounts[0]];
}

/**
 * Consulta isolada de Identidade, Seguidores, Insights da Conta, Série Histórica e Demográficos.
 * Nunca fica bloqueada por publicações ou insights de posts individuais.
 */
export async function fetchAccountSocialOverview(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  dateFrom: string;
  dateTo: string;
  chartDaysOverride?: number;
  masterToken: string | null;
  signal?: AbortSignal;
  simulatedFault?: SimulatedSocialFault;
}): Promise<SocialOverviewResult> {
  const { accounts, selectedPageId, dateFrom, dateTo, chartDaysOverride, masterToken } = params;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const timeoutMs = 15_000;
  const fault = resolveSimulatedSocialFault(params.simulatedFault);
  const cacheKey = `${selectedPageId}:${dateFrom}:${dateTo}:${chartDaysOverride || 14}`;
  const cachedOverview = getOverviewSnapshot(cacheKey);

  const endDateObj = parseISO(dateTo);
  const startDateObj = parseISO(dateFrom);
  const selectedDaysCount = Math.max(1, differenceInCalendarDays(endDateObj, startDateObj) + 1);
  const chartDays = chartDaysOverride || Math.max(14, selectedDaysCount);
  const chartStartDate = subDays(endDateObj, chartDays - 1);
  const chartSince = format(chartStartDate, "yyyy-MM-dd");
  const kpiSince = dateFrom;
  const untilExclusive = format(addDays(endDateObj, 1), "yyyy-MM-dd");

  const windowUsed = { dateFrom, dateTo, chartSince, chartDays };
  const targetAccounts = resolveTargetSocialAccounts(accounts, selectedPageId);

  const buildFaultOverview = (state: SocialDataState, errMsg: string): SocialOverviewResult => {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;
    const sec: SocialSectionStatus = { state, message: errMsg, updatedAt: finishedAt };
    return {
      accounts,
      targetAccounts,
      dailySeries: cachedOverview?.dailySeries || [],
      chartWindowDays: chartDays,
      kpis: cachedOverview?.kpis || {
        followersIg: 0,
        followersFb: 0,
        newFollowersIg: 0,
        newFollowersFb: 0,
        reachIg: 0,
        viewsIg: 0,
        viewsFb: 0,
        interactionsIg: 0,
        interactionsFb: 0,
        accountsEngaged: 0,
        profileViews: 0,
        websiteClicks: 0,
        reachDeltaPct: null,
        followersDeltaPct: null,
      },
      fieldAvailability: {
        reachIg: "error",
        viewsIg: "error",
        viewsFb: "error",
        interactionsIg: "error",
        interactionsFb: "error",
        profileViews: "error",
        websiteClicks: "error",
        followers: "error",
      },
      demographics: cachedOverview?.demographics || {
        available: false,
        totalSample: 0,
        gender: { male: 0, female: 0 },
        age: [],
      },
      sectionStates: {
        identity: sec,
        followers: sec,
        accountInsights: sec,
        dailySeries: sec,
        demographics: sec,
      },
      telemetry: {
        overview: buildSocialSourceTelemetry({
          source: "overview",
          state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: errMsg,
          itemCount: 0,
          dataSource: cachedOverview ? "snapshot_cache" : "meta_graph_v21",
          snapshotAt: cachedOverview?.snapshotAt || finishedAt,
          fromCache: Boolean(cachedOverview),
        }),
        dailySeries: buildSocialSourceTelemetry({
          source: "dailySeries",
          state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: errMsg,
          itemCount: cachedOverview?.dailySeries?.length || 0,
          dataSource: cachedOverview ? "snapshot_cache" : "meta_graph_v21",
          snapshotAt: cachedOverview?.snapshotAt || finishedAt,
          fromCache: Boolean(cachedOverview),
        }),
        demographics: buildSocialSourceTelemetry({
          source: "demographics",
          state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: errMsg,
          itemCount: 0,
          dataSource: cachedOverview ? "snapshot_cache" : "meta_graph_v21",
          snapshotAt: cachedOverview?.snapshotAt || finishedAt,
          fromCache: Boolean(cachedOverview),
        }),
      },
      endpointLogs: [
        {
          endpoint: "/insights",
          accountId: selectedPageId,
          accountName: targetAccounts[0]?.page_name || "Social Insights",
          section: "accountInsights",
          state,
          message: errMsg,
          timestamp: finishedAt,
        },
      ],
      windowUsed,
      snapshotAt: cachedOverview?.snapshotAt || finishedAt,
      fromCache: Boolean(cachedOverview),
      lastValidSnapshotAt: cachedOverview?.snapshotAt || null,
      syncSource: state === "token_expired" ? "no_token" : "api_error",
      errorMessage: errMsg,
    };
  };

  if (fault === "token_expired") {
    return buildFaultOverview("token_expired", "Error validating access token: Session has expired (code 190)");
  }
  if (fault === "permission_denied") {
    return buildFaultOverview("permission_denied", "(#200) Requires pages_read_engagement or instagram_basic permission");
  }
  if (fault === "rate_limited") {
    return buildFaultOverview("rate_limited", "(#4) Application request limit reached — aguarde alguns instantes");
  }
  if (fault === "timeout") {
    return buildFaultOverview("error", `Timeout (${Math.round(timeoutMs / 1000)}s) ao consultar insights da Meta API`);
  }
  if (fault === "overview_error") {
    return buildFaultOverview("error", "Falha simulada na consulta de visão geral (overview_error) — tentar novamente");
  }

  if (!masterToken || targetAccounts.length === 0) {
    const errState: SocialDataState = masterToken ? "empty" : "token_expired";
    const errMsg = masterToken
      ? "Nenhuma página conectada encontrada no Token Meta."
      : "Token de acesso da Meta não configurado.";
    return buildFaultOverview(errState, errMsg);
  }

  const { controller, cleanup } = createLinkedAbortController(params.signal, timeoutMs);
  try {
    const dailyMap = new Map<string, RealDailyPoint>();
    for (let i = 0; i < chartDays; i++) {
      const d = addDays(chartStartDate, i);
      const iso = format(d, "yyyy-MM-dd");
      dailyMap.set(iso, {
        date: iso,
        label: format(d, "dd/MM"),
        reachIg: 0,
        newFollowersIg: 0,
        newFollowersFb: 0,
        viewsFb: 0,
        engFb: 0,
        isSelectedRange: iso >= dateFrom && iso <= dateTo,
      });
    }

    // Soma seguidores diretamente do /me/accounts (evita 41 chamadas redundantes em modo Consolidado)
    let followersIg = 0;
    let followersFb = 0;
    for (const acc of targetAccounts) {
      followersFb += Number(acc.facebook_followers || 0);
      followersIg += Number(acc.instagram_followers || 0);
    }

    let newFollowersIg = 0;
    let newFollowersFb = 0;
    let reachIg = 0;
    let viewsIg = 0;
    let viewsFb = 0;
    let interactionsIg = 0;
    let interactionsFb = 0;
    let accountsEngaged = 0;
    let profileViews = 0;
    let websiteClicks = 0;

    const anyHasIg = targetAccounts.some((acc) => Boolean(acc.instagram_account_id));
    let followersSuccess = targetAccounts.length;
    let followersErrors = 0;
    let igTotalsSuccess = 0;
    let igTotalsErrors = 0;
    let igTsSuccess = 0;
    let igTsErrors = 0;
    let fbInsSuccess = 0;
    let fbInsErrors = 0;
    let demoSuccess = 0;
    let demoErrors = 0;

    const endpointLogs: SocialEndpointFailureLog[] = [];
    const logFailure = (
      endpoint: string,
      acc: RealSocialAccount,
      section: string,
      rawErr: any
    ) => {
      const classified = classifySocialErrorState(rawErr);
      endpointLogs.push({
        endpoint,
        accountId: acc.page_id,
        accountName: acc.page_name,
        section,
        state: classified.state,
        message: classified.message,
        timestamp: new Date().toISOString(),
      });
      return classified;
    };

    const demoTotals = {
      available: false,
      totalSample: 0,
      male: 0,
      female: 0,
      ageMap: new Map<string, { male: number; female: number }>(),
    };

    // Em modo Consolidado ("all"), consulta insights diários das top contas por audiência com concorrência controlada (2)
    const insightAccounts =
      selectedPageId === "all"
        ? targetAccounts.slice(0, CONSOLIDATED_MAX_ACCOUNTS)
        : targetAccounts;
    const accConcurrency = selectedPageId === "all" ? 2 : 1;

    await mapWithConcurrency(insightAccounts, accConcurrency, async (acc, idx) => {
      if (controller.signal.aborted) return;
      const pageToken = acc.access_token || masterToken;
      const igToken = pageToken || masterToken;

      const insightTasks: Promise<void>[] = [
        fetchMetaJson(
          `${META_API_BASE}/${acc.page_id}/insights?metric=page_views_total,page_post_engagements,page_daily_follows&period=day&since=${chartSince}&until=${untilExclusive}&access_token=${encodeURIComponent(pageToken)}`,
          9_500,
          controller.signal
        ).then((fbInsRes) => {
          if (fbInsRes?.error) {
            fbInsErrors++;
            logFailure(`/${acc.page_id}/insights`, acc, "accountInsights", fbInsRes);
            return;
          }
          fbInsSuccess++;
          if (Array.isArray(fbInsRes?.data)) {
            for (const metric of fbInsRes.data) {
              for (const v of metric.values || []) {
                const dayIso = String(v.end_time || "").slice(0, 10);
                const val = Number(v.value || 0);
                const entry = dailyMap.get(dayIso);
                if (entry) {
                  if (metric.name === "page_views_total") entry.viewsFb += val;
                  if (metric.name === "page_post_engagements") entry.engFb += val;
                  if (metric.name === "page_daily_follows") entry.newFollowersFb += val;
                }
                if (dayIso >= dateFrom && dayIso <= dateTo) {
                  if (metric.name === "page_views_total") viewsFb += val;
                  if (metric.name === "page_post_engagements") interactionsFb += val;
                  if (metric.name === "page_daily_follows") newFollowersFb += val;
                }
              }
            }
          }
        }),
      ];

      if (acc.instagram_account_id) {
        const igId = acc.instagram_account_id;
        insightTasks.push(
          fetchMetaJson(
            `${META_API_BASE}/${igId}/insights?metric=reach,follower_count&period=day&since=${chartSince}&until=${untilExclusive}&access_token=${encodeURIComponent(igToken)}`,
            9_500,
            controller.signal
          ).then((igTsRes) => {
            if (igTsRes?.error) {
              igTsErrors++;
              logFailure(`/${igId}/insights(reach,follower_count)`, acc, "dailySeries", igTsRes);
              return;
            }
            igTsSuccess++;
            if (Array.isArray(igTsRes?.data)) {
              for (const metric of igTsRes.data) {
                for (const v of metric.values || []) {
                  const dayIso = String(v.end_time || "").slice(0, 10);
                  const val = Number(v.value || 0);
                  const entry = dailyMap.get(dayIso);
                  if (entry) {
                    if (metric.name === "reach") entry.reachIg += val;
                    if (metric.name === "follower_count") entry.newFollowersIg += val;
                  }
                  if (dayIso >= dateFrom && dayIso <= dateTo) {
                    if (metric.name === "reach") reachIg += val;
                    if (metric.name === "follower_count") newFollowersIg += val;
                  }
                }
              }
            }
          }),
          fetchMetaJson(
            `${META_API_BASE}/${igId}/insights?metric=views,total_interactions,accounts_engaged,profile_views,website_clicks&metric_type=total_value&period=day&since=${kpiSince}&until=${untilExclusive}&access_token=${encodeURIComponent(igToken)}`,
            9_500,
            controller.signal
          ).then((igTotalsRes) => {
            if (igTotalsRes?.error) {
              igTotalsErrors++;
              logFailure(`/${igId}/insights(totals)`, acc, "accountInsights", igTotalsRes);
              return;
            }
            igTotalsSuccess++;
            if (Array.isArray(igTotalsRes?.data)) {
              for (const m of igTotalsRes.data) {
                const val = Number(m.total_value?.value || 0);
                if (m.name === "views") viewsIg += val;
                if (m.name === "total_interactions") interactionsIg += val;
                if (m.name === "accounts_engaged") accountsEngaged += val;
                if (m.name === "profile_views") profileViews += val;
                if (m.name === "website_clicks") websiteClicks += val;
              }
            }
          })
        );

        // Demográficos: sempre para conta individual ou top 3 no consolidado
        if (selectedPageId !== "all" || idx < 3) {
          insightTasks.push(
            fetchMetaJson(
              `${META_API_BASE}/${igId}/insights?metric=follower_demographics&period=lifetime&metric_type=total_value&breakdown=age,gender&access_token=${encodeURIComponent(igToken)}`,
              9_500,
              controller.signal
            ).then((igDemoRes) => {
              if (igDemoRes?.error) {
                demoErrors++;
                logFailure(`/${igId}/insights(demographics)`, acc, "demographics", igDemoRes);
                return;
              }
              demoSuccess++;
              const parsedDemo = parseDemographicsFromApi(igDemoRes);
              if (parsedDemo.available) {
                demoTotals.available = true;
                demoTotals.totalSample += parsedDemo.totalSample;
                const rawResults = igDemoRes?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
                for (const r of rawResults) {
                  const [ageRaw, gKey] = r.dimension_values || [];
                  const val = Number(r.value || 0);
                  if (val <= 0) continue;
                  let ageBucket = ageRaw;
                  if (ageRaw === "55-64" || ageRaw === "65+") ageBucket = "55+";
                  if (!["18-24", "25-34", "35-44", "45-54", "55+"].includes(ageBucket)) continue;
                  const cur = demoTotals.ageMap.get(ageBucket) || { male: 0, female: 0 };
                  if (gKey === "M") {
                    cur.male += val;
                    demoTotals.male += val;
                  } else if (gKey === "F") {
                    cur.female += val;
                    demoTotals.female += val;
                  }
                  demoTotals.ageMap.set(ageBucket, cur);
                }
              }
            })
          );
        }
      }

      await Promise.allSettled(insightTasks);
    });

    const dailySeries = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

    let reachDeltaPct: number | null = null;
    let followersDeltaPct: number | null = null;
    if (dailySeries.length >= selectedDaysCount * 2) {
      const prevSlice = dailySeries.slice(dailySeries.length - selectedDaysCount * 2, dailySeries.length - selectedDaysCount);
      const prevReach = prevSlice.reduce((s, d) => s + d.reachIg, 0);
      const prevFollowers = prevSlice.reduce((s, d) => s + d.newFollowersIg + d.newFollowersFb, 0);
      if (prevReach > 0) reachDeltaPct = Number((((reachIg - prevReach) / prevReach) * 100).toFixed(1));
      if (prevFollowers > 0) followersDeltaPct = Number((((newFollowersIg + newFollowersFb - prevFollowers) / prevFollowers) * 100).toFixed(1));
    }

    let demographics: RealDemographics = { available: false, totalSample: 0, gender: { male: 0, female: 0 }, age: [] };
    const totalGender = demoTotals.male + demoTotals.female;
    if (demoTotals.available && totalGender > 0) {
      const malePct = Math.round((demoTotals.male / totalGender) * 100);
      demographics = {
        available: true,
        totalSample: totalGender,
        gender: { male: malePct, female: 100 - malePct },
        age: ["18-24", "25-34", "35-44", "45-54", "55+"].map((range) => {
          const b = demoTotals.ageMap.get(range) || { male: 0, female: 0 };
          return {
            range,
            male: Math.round((b.male / totalGender) * 100),
            female: Math.round((b.female / totalGender) * 100),
          };
        }),
      };
    }

    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;

    const pickSectionState = (
      sectionName: string,
      okCount: number,
      errCount: number,
      hasData: boolean
    ): SocialSectionStatus => {
      const secLogs = endpointLogs.filter((l) => l.section === sectionName);
      const firstErr = secLogs[0];
      if (okCount > 0 && errCount > 0) {
        return { state: "partial", message: firstErr?.message, endpoint: firstErr?.endpoint, updatedAt: finishedAt };
      }
      if (okCount === 0 && errCount > 0) {
        return {
          state: firstErr?.state || "error",
          message: firstErr?.message || "Não foi possível carregar — tentar novamente",
          endpoint: firstErr?.endpoint,
          accountId: firstErr?.accountId,
          accountName: firstErr?.accountName,
          updatedAt: finishedAt,
        };
      }
      return { state: hasData ? "success" : "empty", updatedAt: finishedAt };
    };

    const identityState: SocialSectionStatus = {
      state: targetAccounts.length > 0 ? "success" : "empty",
      accountId: targetAccounts[0]?.page_id,
      accountName: targetAccounts.length === 1 ? targetAccounts[0].page_name : `${targetAccounts.length} contas`,
      updatedAt: finishedAt,
    };
    const followersState = pickSectionState("followers", followersSuccess, followersErrors, followersIg + followersFb > 0);
    const hasOverviewValues =
      followersIg + followersFb + reachIg + viewsIg + viewsFb + interactionsIg + interactionsFb + profileViews + websiteClicks > 0;
    const accountInsightsState = pickSectionState(
      "accountInsights",
      igTotalsSuccess + fbInsSuccess,
      igTotalsErrors + fbInsErrors,
      hasOverviewValues
    );
    const hasSeriesData = dailySeries.some(
      (d) => d.reachIg + d.viewsFb + d.engFb + d.newFollowersIg + d.newFollowersFb > 0
    );
    const dailySeriesState = pickSectionState(
      "dailySeries",
      igTsSuccess + fbInsSuccess,
      igTsErrors + fbInsErrors,
      hasSeriesData
    );
    const demographicsState: SocialSectionStatus = anyHasIg
      ? pickSectionState("demographics", demoSuccess, demoErrors, demographics.available)
      : {
          state: "empty",
          message: "Conta sem Instagram Business vinculado — exibindo métricas oficiais da Página do Facebook.",
          updatedAt: finishedAt,
        };

    const result: SocialOverviewResult = {
      accounts,
      targetAccounts,
      dailySeries,
      chartWindowDays: chartDays,
      kpis: {
        followersIg,
        followersFb,
        newFollowersIg,
        newFollowersFb,
        reachIg,
        viewsIg,
        viewsFb,
        interactionsIg,
        interactionsFb,
        accountsEngaged,
        profileViews,
        websiteClicks,
        reachDeltaPct,
        followersDeltaPct,
      },
      fieldAvailability: {
        reachIg: !anyHasIg ? "unavailable" : igTsSuccess > 0 ? "available" : "error",
        viewsIg: !anyHasIg ? "unavailable" : igTotalsSuccess > 0 ? "available" : "error",
        viewsFb: fbInsSuccess > 0 ? "available" : "error",
        interactionsIg: !anyHasIg ? "unavailable" : igTotalsSuccess > 0 ? "available" : "error",
        interactionsFb: fbInsSuccess > 0 ? "available" : "error",
        profileViews: !anyHasIg ? "unavailable" : igTotalsSuccess > 0 ? "available" : "error",
        websiteClicks: !anyHasIg ? "unavailable" : igTotalsSuccess > 0 ? "available" : "error",
        followers: followersSuccess > 0 || followersIg + followersFb > 0 ? "available" : "error",
      },
      demographics,
      sectionStates: {
        identity: identityState,
        followers: followersState,
        accountInsights: accountInsightsState,
        dailySeries: dailySeriesState,
        demographics: demographicsState,
      },
      telemetry: {
        overview: buildSocialSourceTelemetry({
          source: "overview",
          state: accountInsightsState.state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: accountInsightsState.message || null,
          itemCount: insightAccounts.length,
          dataSource: "meta_graph_v21",
          snapshotAt: finishedAt,
          fromCache: false,
        }),
        dailySeries: buildSocialSourceTelemetry({
          source: "dailySeries",
          state: dailySeriesState.state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: dailySeriesState.message || null,
          itemCount: dailySeries.length,
          dataSource: "meta_graph_v21",
          snapshotAt: finishedAt,
          fromCache: false,
        }),
        demographics: buildSocialSourceTelemetry({
          source: "demographics",
          state: demographicsState.state,
          startedAt,
          finishedAt,
          durationMs,
          timeoutMs,
          error: demographicsState.message || null,
          itemCount: demographics.age.length,
          dataSource: "meta_graph_v21",
          snapshotAt: finishedAt,
          fromCache: false,
        }),
      },
      endpointLogs,
      windowUsed,
      snapshotAt: finishedAt,
      fromCache: false,
      lastValidSnapshotAt: finishedAt,
      syncSource: "meta_graph_v21",
    };

    if (accountInsightsState.state === "success" || accountInsightsState.state === "partial" || accountInsightsState.state === "empty") {
      saveOverviewSnapshot(cacheKey, result);
    }

    return result;
  } finally {
    cleanup();
  }
}

/**
 * Consulta isolada de Publicações (Instagram + Facebook) e Insights das Publicações.
 * Possui timeout controlado e concorrência limitada; falhas parciais nos insights
 * individuais não descartam as publicações já recuperadas.
 */
export async function fetchAccountSocialPosts(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  masterToken: string | null;
  dateFrom?: string;
  dateTo?: string;
  onlyInPeriod?: boolean;
  signal?: AbortSignal;
  simulatedFault?: SimulatedSocialFault;
}): Promise<SocialPostsResult> {
  const { accounts, selectedPageId, masterToken, dateFrom, dateTo, onlyInPeriod = false } = params;
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const timeoutMs = 16_000;
  const fault = resolveSimulatedSocialFault(params.simulatedFault);
  const cacheKey = `${selectedPageId}:${onlyInPeriod ? `${dateFrom || ""}_${dateTo || ""}` : "recent"}`;
  const cachedPosts = getPostsSnapshot(cacheKey);
  const targetAccounts = resolveTargetSocialAccounts(accounts, selectedPageId);

  const buildFaultPosts = (state: SocialDataState, errMsg: string): SocialPostsResult => {
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;
    const emptyMatrix = Array.from({ length: 7 }, () => Array(24).fill(0));
    return {
      posts: state === "empty" ? [] : cachedPosts?.posts || [],
      allRecentPosts: state === "empty" ? [] : cachedPosts?.allRecentPosts || [],
      inPeriodCount: 0,
      heatmapMatrix: state === "empty" ? emptyMatrix : cachedPosts?.heatmapMatrix || emptyMatrix,
      hasPostsForHeatmap: state === "empty" ? false : Boolean(cachedPosts?.hasPostsForHeatmap),
      heatmapSampleSize: state === "empty" ? 0 : cachedPosts?.heatmapSampleSize || 0,
      postsState: { state, message: errMsg, updatedAt: finishedAt },
      postInsightsState: { state, message: errMsg, updatedAt: finishedAt },
      telemetry: buildSocialSourceTelemetry({
        source: "posts",
        state,
        startedAt,
        finishedAt,
        durationMs,
        timeoutMs,
        error: state === "empty" ? null : errMsg,
        itemCount: state === "empty" ? 0 : cachedPosts?.posts?.length || 0,
        dataSource: cachedPosts && state !== "empty" ? "snapshot_cache" : "meta_graph_v21",
        snapshotAt: cachedPosts?.snapshotAt || finishedAt,
        fromCache: Boolean(cachedPosts && state !== "empty"),
      }),
      endpointLogs:
        state === "empty"
          ? []
          : [
              {
                endpoint: "/posts",
                accountId: selectedPageId,
                accountName: targetAccounts[0]?.page_name || "Social Posts",
                section: "posts",
                state,
                message: errMsg,
                timestamp: finishedAt,
              },
            ],
      snapshotAt: cachedPosts?.snapshotAt || finishedAt,
      fromCache: Boolean(cachedPosts && state !== "empty"),
      lastValidSnapshotAt: cachedPosts?.snapshotAt || null,
    };
  };

  if (fault === "token_expired") {
    return buildFaultPosts("token_expired", "Error validating access token: Session has expired (code 190)");
  }
  if (fault === "permission_denied") {
    return buildFaultPosts("permission_denied", "(#200) Requires pages_read_engagement permission to read posts");
  }
  if (fault === "rate_limited") {
    return buildFaultPosts("rate_limited", "(#4) Application request limit reached on posts endpoint");
  }
  if (fault === "timeout") {
    return buildFaultPosts("error", `Timeout (${Math.round(timeoutMs / 1000)}s) ao consultar publicações da Meta API`);
  }
  if (fault === "posts_error") {
    return buildFaultPosts("error", "Falha simulada ao carregar publicações (posts_error) — tentar novamente");
  }
  if (fault === "empty_posts") {
    return buildFaultPosts("empty", "Nenhuma publicação encontrada no período selecionado.");
  }

  if (!masterToken || targetAccounts.length === 0) {
    return buildFaultPosts(
      masterToken ? "empty" : "token_expired",
      masterToken ? "Nenhuma conta conectada." : "Token de acesso da Meta não configurado."
    );
  }

  const { controller, cleanup } = createLinkedAbortController(params.signal, timeoutMs);
  try {
    const rawPosts: Array<{
      post: RealSocialPost;
      acc: RealSocialAccount;
      rawId: string;
      token: string;
      platform: "instagram" | "facebook";
    }> = [];
    const endpointLogs: SocialEndpointFailureLog[] = [];
    let postListOk = 0;
    let postListErr = 0;
    let postInsOk = 0;
    let postInsErr = 0;

    const logFailure = (
      endpoint: string,
      acc: RealSocialAccount,
      section: string,
      rawErr: any
    ) => {
      const classified = classifySocialErrorState(rawErr);
      endpointLogs.push({
        endpoint,
        accountId: acc.page_id,
        accountName: acc.page_name,
        section,
        state: classified.state,
        message: classified.message,
        timestamp: new Date().toISOString(),
      });
    };

    const postAccounts =
      selectedPageId === "all"
        ? targetAccounts.slice(0, CONSOLIDATED_MAX_ACCOUNTS)
        : targetAccounts;
    const accConcurrency = selectedPageId === "all" ? 2 : 1;

    // Fase 1: Buscar listas de posts (IG + FB) sem bloquear com 160 chamadas de insights individuais
    await mapWithConcurrency(postAccounts, accConcurrency, async (acc) => {
      if (controller.signal.aborted) return;
      const pageToken = acc.access_token || masterToken;
      const igToken = pageToken || masterToken;
      const tasks: Promise<void>[] = [];

      if (acc.instagram_account_id) {
        const igId = acc.instagram_account_id;
        tasks.push(
          (async () => {
            const igLimit = selectedPageId === "all" ? 3 : 15;
            const igMediaRes = await fetchMetaJson(
              `${META_API_BASE}/${igId}/media?fields=id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count&limit=${igLimit}&access_token=${encodeURIComponent(igToken)}`,
              9_500,
              controller.signal
            );
            if (igMediaRes?.error) {
              postListErr++;
              logFailure(`/${igId}/media`, acc, "posts", igMediaRes);
              return;
            }
            postListOk++;
            const mediaItems = Array.isArray(igMediaRes?.data) ? igMediaRes.data : [];
            for (const item of mediaItems) {
              const likes = Number(item.like_count || 0);
              const comments = Number(item.comments_count || 0);
              const isReel = item.media_product_type === "REELS" || item.media_type === "VIDEO";
              const postType: RealSocialPost["post_type"] = isReel
                ? "reels"
                : item.media_type === "CAROUSEL_ALBUM"
                ? "carousel"
                : item.media_product_type === "STORY"
                ? "stories"
                : "image";
              const caption = item.caption || "";
              const firstLine = caption.split("\n").find((l: string) => l.trim()) || `Publicação ${postType.toUpperCase()}`;
              const { sentiment, recommendation } = classifyPostRecommendation({
                mediaType: item.media_type,
                reach: 0,
                views: 0,
                likes,
                comments,
                shares: 0,
                saved: 0,
                caption,
              });

              rawPosts.push({
                rawId: item.id,
                acc,
                token: igToken,
                platform: "instagram",
                post: {
                  id: item.id,
                  accountName: acc.page_name,
                  accountHandle: acc.instagram_handle ? `@${acc.instagram_handle}` : acc.page_name,
                  title: firstLine.length > 52 ? firstLine.slice(0, 49) + "..." : firstLine,
                  content: caption,
                  post_type: postType,
                  media_product_type: item.media_product_type,
                  platform: "instagram",
                  likes_count: likes,
                  comments_count: comments,
                  shares_count: 0,
                  saved_count: 0,
                  reach_count: 0,
                  views_count: 0,
                  total_interactions: likes + comments,
                  engagement_rate: 0,
                  media_url: item.media_url || null,
                  thumbnail_url: item.thumbnail_url || item.media_url || null,
                  permalink: item.permalink || null,
                  published_at: item.timestamp,
                  ai_sentiment: sentiment,
                  ai_recommendation: recommendation,
                },
              });
            }
          })()
        );
      }

      tasks.push(
        (async () => {
          const fbPostsPaginated = await fetchMetaPaginatedList(
            `/${acc.page_id}/posts`,
            pageToken,
            {
              fields: "id,message,created_time,full_picture,permalink_url,likes.summary(true),comments.summary(true),shares",
              limit: selectedPageId === "all" ? "3" : "15",
            },
            1,
            9_500,
            controller.signal
          );
          if (!fbPostsPaginated.ok) {
            postListErr++;
            logFailure(`/${acc.page_id}/posts`, acc, "posts", fbPostsPaginated);
            return;
          }
          postListOk++;
          const fbPosts = Array.isArray(fbPostsPaginated.data) ? fbPostsPaginated.data : [];
          for (const fp of fbPosts) {
            const likes = Number(fp.likes?.summary?.total_count || 0);
            const comments = Number(fp.comments?.summary?.total_count || 0);
            const shares = Number(fp.shares?.count || 0);
            const totalInt = likes + comments + shares;
            const msg = fp.message || "";
            const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Publicação no Facebook";

            rawPosts.push({
              rawId: fp.id,
              acc,
              token: pageToken,
              platform: "facebook",
              post: {
                id: `fb_${fp.id}`,
                accountName: acc.page_name,
                accountHandle: acc.page_name,
                title: firstLine.length > 52 ? firstLine.slice(0, 49) + "..." : firstLine,
                content: msg,
                post_type: "image",
                platform: "facebook",
                likes_count: likes,
                comments_count: comments,
                shares_count: shares,
                saved_count: 0,
                reach_count: 0,
                views_count: 0,
                total_interactions: totalInt,
                engagement_rate: 0,
                media_url: fp.full_picture || null,
                thumbnail_url: fp.full_picture || null,
                permalink: fp.permalink_url || `https://facebook.com/${fp.id}`,
                published_at: fp.created_time,
                ai_sentiment: totalInt > 0 ? "Engajamento Orgânico" : "Institucional Facebook",
                ai_recommendation:
                  totalInt > 0
                    ? `${likes} reações, ${comments} comentários e ${shares} compartilhamentos no Facebook.`
                    : "Publicação ativa na Página do Facebook.",
              },
            });
          }
        })()
      );

      await Promise.allSettled(tasks);
    });

    // Ordenar cronologicamente (mais recentes primeiro) antes de enriquecer com insights
    rawPosts.sort((a, b) => new Date(b.post.published_at).getTime() - new Date(a.post.published_at).getTime());

    // Fase 2: Enriquecer insights individuais apenas para os posts iniciais visíveis (top 8 no consolidado, top 10 na conta individual)
    const maxInsightPosts = selectedPageId === "all" ? 8 : 10;
    const toEnrich = rawPosts.slice(0, maxInsightPosts);

    await mapWithConcurrency(toEnrich, 4, async (entry) => {
      if (controller.signal.aborted) return;
      if (entry.platform === "instagram") {
        const ins = await fetchMetaJson(
          `${META_API_BASE}/${entry.rawId}/insights?metric=reach,views,saved,shares,total_interactions&access_token=${encodeURIComponent(entry.token)}`,
          6_500,
          controller.signal
        );
        if (ins?.error) {
          postInsErr++;
          logFailure(`/${entry.rawId}/insights`, entry.acc, "postInsights", ins);
          return;
        }
        if (Array.isArray(ins?.data)) {
          postInsOk++;
          let pReach = 0;
          let pViews = 0;
          let pSaved = 0;
          let pShares = 0;
          let pInteractions = 0;
          for (const m of ins.data) {
            const v = Number(m.values?.[0]?.value || 0);
            if (m.name === "reach") pReach = v;
            if (m.name === "views") pViews = v;
            if (m.name === "saved") pSaved = v;
            if (m.name === "shares") pShares = v;
            if (m.name === "total_interactions") pInteractions = v;
          }
          const totalInt = pInteractions || entry.post.likes_count + entry.post.comments_count + pSaved + pShares;
          entry.post.reach_count = pReach;
          entry.post.views_count = pViews;
          entry.post.saved_count = pSaved;
          entry.post.shares_count = pShares;
          entry.post.total_interactions = totalInt;
          entry.post.engagement_rate = pReach > 0 ? (totalInt / pReach) * 100 : 0;
          const rec = classifyPostRecommendation({
            mediaType: entry.post.post_type,
            reach: pReach,
            views: pViews,
            likes: entry.post.likes_count,
            comments: entry.post.comments_count,
            shares: pShares,
            saved: pSaved,
            caption: entry.post.content,
          });
          entry.post.ai_sentiment = rec.sentiment;
          entry.post.ai_recommendation = rec.recommendation;
        }
      } else {
        const ins = await fetchMetaJson(
          `${META_API_BASE}/${entry.rawId}/insights?metric=post_impressions_unique,post_impressions&access_token=${encodeURIComponent(entry.token)}`,
          6_500,
          controller.signal
        );
        if (ins?.error) {
          postInsErr++;
          logFailure(`/${entry.rawId}/insights`, entry.acc, "postInsights", ins);
          return;
        }
        if (Array.isArray(ins?.data)) {
          postInsOk++;
          let reach = 0;
          let views = 0;
          for (const m of ins.data) {
            const v = Number(m.values?.[0]?.value || 0);
            if (m.name === "post_impressions_unique") reach = v;
            if (m.name === "post_impressions") views = v;
          }
          entry.post.reach_count = reach;
          entry.post.views_count = views;
          entry.post.engagement_rate = reach > 0 ? (entry.post.total_interactions / reach) * 100 : 0;
        }
      }
    });

    const allRecentPosts = rawPosts.map((r) => r.post);
    const inPeriodPosts =
      dateFrom && dateTo
        ? allRecentPosts.filter((p) => {
            const dayIso = String(p.published_at || "").slice(0, 10);
            return dayIso >= dateFrom && dayIso <= dateTo;
          })
        : allRecentPosts;

    const effectivePosts = onlyInPeriod ? inPeriodPosts : allRecentPosts;
    const { matrix: heatmapMatrix, hasData: hasPostsForHeatmap } = buildRealHeatmap(effectivePosts);
    const firstPostErr = endpointLogs.find((l) => l.section === "posts");
    const firstInsErr = endpointLogs.find((l) => l.section === "postInsights");
    const finishedAt = new Date().toISOString();
    const durationMs = Date.now() - t0;

    const postsState: SocialSectionStatus =
      postListOk > 0 && postListErr > 0
        ? { state: "partial", message: firstPostErr?.message, endpoint: firstPostErr?.endpoint, updatedAt: finishedAt }
        : postListOk === 0 && postListErr > 0
        ? { state: firstPostErr?.state || "error", message: firstPostErr?.message, endpoint: firstPostErr?.endpoint, updatedAt: finishedAt }
        : {
            state: effectivePosts.length > 0 ? "success" : "empty",
            message:
              effectivePosts.length === 0
                ? onlyInPeriod
                  ? "Nenhuma publicação encontrada no período selecionado."
                  : "Nenhuma publicação recente encontrada nesta conta."
                : undefined,
            updatedAt: finishedAt,
          };

    const postInsightsState: SocialSectionStatus =
      postInsOk > 0 && postInsErr > 0
        ? { state: "partial", message: firstInsErr?.message, endpoint: firstInsErr?.endpoint, updatedAt: finishedAt }
        : postInsOk === 0 && postInsErr > 0
        ? { state: firstInsErr?.state || "permission_denied", message: firstInsErr?.message, endpoint: firstInsErr?.endpoint, updatedAt: finishedAt }
        : { state: postInsOk > 0 ? "success" : "empty", updatedAt: finishedAt };

    const result: SocialPostsResult = {
      posts: effectivePosts,
      allRecentPosts,
      inPeriodCount: inPeriodPosts.length,
      heatmapMatrix,
      hasPostsForHeatmap,
      heatmapSampleSize: effectivePosts.filter((p) => Boolean(p.published_at)).length,
      postsState,
      postInsightsState,
      telemetry: buildSocialSourceTelemetry({
        source: "posts",
        state: postsState.state,
        startedAt,
        finishedAt,
        durationMs,
        timeoutMs,
        error: postsState.state === "empty" ? null : postsState.message || null,
        itemCount: effectivePosts.length,
        dataSource: "meta_graph_v21",
        snapshotAt: finishedAt,
        fromCache: false,
      }),
      endpointLogs,
      snapshotAt: finishedAt,
      fromCache: false,
      lastValidSnapshotAt: finishedAt,
    };

    if (postsState.state === "success" || postsState.state === "partial") {
      savePostsSnapshot(cacheKey, result);
    }

    return result;
  } finally {
    cleanup();
  }
}

/**
 * Orquestra visão geral + publicações com estados explícitos (`SocialDataState`),
 * timeouts controlados e preservação do último snapshot válido em caso de erro total.
 */
export async function fetchRealSocialInsights(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  dateFrom: string;
  dateTo: string;
  chartDaysOverride?: number;
  masterToken: string | null;
}): Promise<RealSocialInsightsResult> {
  const snapshotKey = `${params.selectedPageId}:${params.dateFrom}:${params.dateTo}:${params.chartDaysOverride || 14}`;
  const [overviewRes, postsRes] = await Promise.allSettled([
    fetchAccountSocialOverview(params),
    fetchAccountSocialPosts({
      accounts: params.accounts,
      selectedPageId: params.selectedPageId,
      masterToken: params.masterToken,
    }),
  ]);

  const nowIso = new Date().toISOString();
  const prevValid = getLastValidSocialSnapshot(snapshotKey);

  if (overviewRes.status === "rejected" && postsRes.status === "rejected") {
    if (prevValid) {
      return {
        ...prevValid,
        overallState: "partial",
        isFromLastValidSnapshot: true,
        lastValidSnapshotAt: prevValid.snapshotAt || null,
        errorMessage: "Não foi possível atualizar agora — exibindo último snapshot válido.",
      };
    }
    throw overviewRes.reason;
  }

  const overview =
    overviewRes.status === "fulfilled"
      ? overviewRes.value
      : await fetchAccountSocialOverview({ ...params, masterToken: null });
  const postsData: SocialPostsResult =
    postsRes.status === "fulfilled"
      ? postsRes.value
      : {
          posts: prevValid?.posts || [],
          allRecentPosts: prevValid?.posts || [],
          inPeriodCount: 0,
          heatmapMatrix: prevValid?.heatmapMatrix || Array.from({ length: 7 }, () => Array(24).fill(0)),
          hasPostsForHeatmap: Boolean(prevValid?.hasPostsForHeatmap),
          heatmapSampleSize: prevValid?.heatmapSampleSize || 0,
          postsState: { state: "error", message: "Falha ao carregar publicações — tentar novamente", updatedAt: nowIso },
          postInsightsState: { state: "error", message: "Falha ao carregar insights de posts", updatedAt: nowIso },
          telemetry: buildSocialSourceTelemetry({
            source: "posts",
            state: "error",
            startedAt: nowIso,
            finishedAt: nowIso,
            durationMs: 0,
            timeoutMs: 16_000,
            error: "Falha ao carregar publicações — tentar novamente",
            itemCount: prevValid?.posts?.length || 0,
            dataSource: prevValid ? "snapshot_cache" : "meta_graph_v21",
            snapshotAt: prevValid?.snapshotAt || nowIso,
            fromCache: Boolean(prevValid),
          }),
          endpointLogs: [],
          snapshotAt: nowIso,
        };

  const allLogs = [...overview.endpointLogs, ...postsData.endpointLogs];
  const anyError =
    overview.sectionStates.followers.state === "error" ||
    overview.sectionStates.accountInsights.state === "error" ||
    postsData.postsState.state === "error";
  const anyPartial =
    overview.sectionStates.accountInsights.state === "partial" ||
    postsData.postsState.state === "partial" ||
    postsData.postInsightsState.state === "partial";
  const anyExpired = allLogs.some((l) => l.state === "token_expired");
  const anyRateLimit = allLogs.some((l) => l.state === "rate_limited");

  let overallState: SocialDataState = "success";
  if (overview.syncSource === "no_token" || anyExpired) overallState = "token_expired";
  else if (anyRateLimit && overview.sectionStates.accountInsights.state === "error") overallState = "rate_limited";
  else if (anyError || anyPartial) overallState = "partial";
  else if (
    overview.kpis.followersIg + overview.kpis.followersFb === 0 &&
    postsData.posts.length === 0
  ) {
    overallState = "empty";
  }

  const assembled: RealSocialInsightsResult = {
    accounts: overview.accounts,
    dailySeries: overview.dailySeries,
    chartWindowDays: overview.chartWindowDays,
    kpis: overview.kpis,
    fieldAvailability: overview.fieldAvailability,
    demographics: overview.demographics,
    posts: postsData.posts,
    heatmapMatrix: postsData.heatmapMatrix,
    hasPostsForHeatmap: postsData.hasPostsForHeatmap,
    heatmapSampleSize: postsData.heatmapSampleSize,
    apiLimitations: [
      "Instagram Graph API não expõe rascunhos/agendados nativos criados fora da plataforma.",
    ],
    syncSource: overview.syncSource,
    errorMessage: overview.errorMessage || allLogs[0]?.message,
    overallState,
    sectionStates: {
      ...overview.sectionStates,
      posts: postsData.postsState,
      postInsights: postsData.postInsightsState,
    },
    endpointLogs: allLogs,
    windowUsed: overview.windowUsed,
    snapshotAt: nowIso,
    isFromLastValidSnapshot: false,
    lastValidSnapshotAt: prevValid?.snapshotAt || nowIso,
  };

  if (overview.syncSource === "meta_graph_v21" && overview.sectionStates.followers.state !== "error") {
    saveLastValidSocialSnapshot(snapshotKey, assembled);
  } else if (prevValid) {
    return {
      ...prevValid,
      overallState,
      sectionStates: assembled.sectionStates,
      endpointLogs: allLogs,
      isFromLastValidSnapshot: true,
      lastValidSnapshotAt: prevValid.snapshotAt || null,
      errorMessage: assembled.errorMessage,
    };
  }

  return assembled;
}

export interface PlannerPost {
  id: string;
  user_id?: string;
  page_id?: string;
  account_name?: string;
  account_handle?: string;
  title: string;
  content: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink?: string | null;
  post_type: "feed" | "reels" | "stories" | "carousel";
  status: "draft" | "pending_approval" | "scheduled" | "published" | "failed";
  platform: "instagram" | "facebook" | "both";
  scheduled_at?: string | null;
  published_at?: string | null;
  meta_post_id?: string | null;
  error_message?: string | null;
  likes_count: number;
  comments_count: number;
  reach_count: number;
  impressions_count: number;
  shares_count?: number;
  saves_count?: number;
  created_at: string;
  source: "meta_live" | "supabase";
}

export interface RealIgProfileDetails {
  id: string;
  username: string;
  name: string;
  biography: string;
  website: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string | null;
}

export interface BestSlotItem {
  dayIdx: number;
  dayName: string;
  hour: number;
  score: number;
  postsCount: number;
}

export interface PlannerSyncResult {
  posts: PlannerPost[];
  igProfile: RealIgProfileDetails | null;
  heatmapMatrix: number[][];
  hasPostsForHeatmap: boolean;
  heatmapSampleSize?: number;
  apiLimitations?: string[];
  topTimeSlots: BestSlotItem[];
  metaScheduledCount: number;
  metaPublishedCount: number;
  errorMessage?: string;
}

function parseMetaTimestampToIso(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const str = String(raw).trim();
  if (/^\d+$/.test(str)) {
    const num = Number(str);
    const ms = num < 1e12 ? num * 1000 : num;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function extractFbAttachmentInfo(fp: any): { mediaUrl: string | null; postType: PlannerPost["post_type"] } {
  const att = fp?.attachments?.data?.[0];
  const mediaType = String(att?.media_type || att?.type || "").toLowerCase();
  const imgSrc =
    fp?.full_picture ||
    att?.media?.image?.src ||
    att?.subattachments?.data?.[0]?.media?.image?.src ||
    null;

  let postType: PlannerPost["post_type"] = "feed";
  if (mediaType.includes("video") || mediaType.includes("reel")) {
    postType = "reels";
  } else if (mediaType.includes("album") || (att?.subattachments?.data?.length || 0) > 1) {
    postType = "carousel";
  }
  return { mediaUrl: imgSrc, postType };
}

const WEEK_DAY_NAMES_PT = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

/**
 * Busca todos os posts REAIS agendados no Meta (/{page}/scheduled_posts e promotable_posts com data agendada),
 * todos os posts REAIS já publicados (IG media, IG stories e FB Page posts) e mescla sem duplicar com `social_posts`.
 */
export async function fetchRealPlannerPosts(params: {
  accounts: RealSocialAccount[];
  selectedPageId: string;
  masterToken: string | null;
}): Promise<PlannerSyncResult> {
  const { accounts, selectedPageId, masterToken } = params;

  const emptyHeatmap = Array.from({ length: 7 }, () => Array(24).fill(0));

  // 1. Buscar posts reais salvos no Supabase (`social_posts`), removendo resíduos mock
  let dbRows: PlannerPost[] = [];
  try {
    let q = supabase.from("social_posts").select("*").order("created_at", { ascending: false });
    if (selectedPageId !== "all") {
      q = q.eq("page_id", selectedPageId);
    }
    const { data, error } = await q;
    if (!error && Array.isArray(data)) {
      dbRows = data
        .filter(
          (row: any) =>
            row.id &&
            !String(row.id).startsWith("sample-") &&
            !String(row.meta_post_id || "").startsWith("mock_")
        )
        .map((row: any) => ({
          id: row.id,
          user_id: row.user_id,
          page_id: row.page_id,
          title: row.title || (row.content ? String(row.content).slice(0, 48) : "Publicação"),
          content: row.content || "",
          media_url: row.media_url || null,
          thumbnail_url: row.media_url || null,
          permalink: null,
          post_type: (row.post_type || "feed") as PlannerPost["post_type"],
          status: (row.status || "draft") as PlannerPost["status"],
          platform: (row.platform || "instagram") as PlannerPost["platform"],
          scheduled_at: row.scheduled_at || null,
          published_at: row.published_at || null,
          meta_post_id: row.meta_post_id || null,
          error_message: row.error_message || null,
          likes_count: Number(row.likes_count || 0),
          comments_count: Number(row.comments_count || 0),
          reach_count: Number(row.reach_count || 0),
          impressions_count: Number(row.impressions_count || 0),
          created_at: row.created_at || new Date().toISOString(),
          source: "supabase" as const,
        }));
    }
  } catch {
    // mantém vazio se tabela estiver indisponível
  }

  if (!masterToken || accounts.length === 0) {
    return {
      posts: dbRows,
      igProfile: null,
      heatmapMatrix: emptyHeatmap,
      hasPostsForHeatmap: false,
      topTimeSlots: [],
      metaScheduledCount: 0,
      metaPublishedCount: 0,
      errorMessage: masterToken
        ? "Nenhuma página conectada encontrada no Meta."
        : "Token Master da Meta não configurado.",
    };
  }

  const isSingle = selectedPageId !== "all";
  const targetAccounts = isSingle
    ? accounts.filter((a) => a.page_id === selectedPageId || a.instagram_account_id === selectedPageId)
    : accounts;

  if (targetAccounts.length === 0) {
    return {
      posts: dbRows,
      igProfile: null,
      heatmapMatrix: emptyHeatmap,
      hasPostsForHeatmap: false,
      topTimeSlots: [],
      metaScheduledCount: 0,
      metaPublishedCount: 0,
    };
  }

  // Perfil completo real do Instagram (para o Feed Planner 3x3)
  let igProfile: RealIgProfileDetails | null = null;
  const igTarget = targetAccounts.find((a) => a.instagram_account_id) || null;
  if (igTarget?.instagram_account_id) {
    const profRes = await fetchMetaJson(
      `${META_API_BASE}/${igTarget.instagram_account_id}?fields=id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url&access_token=${encodeURIComponent(masterToken)}`
    );
    if (profRes && !profRes.error && profRes.id) {
      igProfile = {
        id: profRes.id,
        username: profRes.username || igTarget.instagram_handle || "",
        name: profRes.name || igTarget.page_name,
        biography: profRes.biography || "",
        website: profRes.website || "",
        followers_count: Number(profRes.followers_count ?? igTarget.instagram_followers ?? 0),
        follows_count: Number(profRes.follows_count ?? 0),
        media_count: Number(profRes.media_count ?? 0),
        profile_picture_url: profRes.profile_picture_url || igTarget.profile_picture_url || null,
      };
    }
  }

  const metaPosts: PlannerPost[] = [];
  const metaByMetaId = new Map<string, PlannerPost>();
  let metaScheduledCount = 0;
  let metaPublishedCount = 0;

  await Promise.all(
    targetAccounts.map(async (acc) => {
      const pageToken = acc.access_token || masterToken;
      const fbLimit = isSingle ? "50" : "25";
      const igLimit = isSingle ? "50" : "25";
      const pageDepth = isSingle ? 5 : 2;

      // 1) Agendados no Meta (paginado)
      // 2) Publicados no Facebook (/posts paginado)
      // 3) Publicados no Instagram (/media paginado) + Stories ativos (/stories paginado)
      const [fbSchedRes, fbPromoRes, fbPubRes, igMediaRes, igStoriesRes] = await Promise.all([
        fetchMetaPaginatedList(
          `/${acc.page_id}/scheduled_posts`,
          pageToken,
          {
            fields: "id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published,attachments{media_type,type,url,media{image{src}},subattachments{media{image{src}}}}",
            limit: "50",
          },
          pageDepth
        ),
        fetchMetaPaginatedList(
          `/${acc.page_id}/promotable_posts`,
          pageToken,
          {
            is_published: "false",
            fields: "id,message,created_time,scheduled_publish_time,full_picture,permalink_url,is_published,attachments{media_type,type,url,media{image{src}},subattachments{media{image{src}}}}",
            limit: "50",
          },
          pageDepth
        ),
        fetchMetaPaginatedList(
          `/${acc.page_id}/posts`,
          pageToken,
          {
            fields: "id,message,created_time,full_picture,permalink_url,attachments{media_type,type,media{image{src}},subattachments{media{image{src}}}},likes.summary(true),comments.summary(true),shares",
            limit: fbLimit,
          },
          pageDepth
        ),
        acc.instagram_account_id
          ? fetchMetaPaginatedList(
              `/${acc.instagram_account_id}/media`,
              masterToken,
              {
                fields: "id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp,like_count,comments_count",
                limit: igLimit,
              },
              pageDepth
            )
          : Promise.resolve(null),
        acc.instagram_account_id
          ? fetchMetaPaginatedList(
              `/${acc.instagram_account_id}/stories`,
              masterToken,
              {
                fields: "id,caption,media_type,media_url,thumbnail_url,permalink,timestamp",
                limit: "25",
              },
              2
            )
          : Promise.resolve(null),
      ]);

      // Mesclar agendados reais do Meta (scheduled_posts + promotable_posts com scheduled_publish_time)
      const rawScheduled = [
        ...(Array.isArray(fbSchedRes?.data) ? fbSchedRes.data : []),
        ...(Array.isArray(fbPromoRes?.data) ? fbPromoRes.data.filter((x: any) => x?.scheduled_publish_time) : []),
      ];
      const seenFbSchedIds = new Set<string>();
      for (const sp of rawScheduled) {
        if (!sp?.id || seenFbSchedIds.has(sp.id)) continue;
        seenFbSchedIds.add(sp.id);
        const schedIso = parseMetaTimestampToIso(sp.scheduled_publish_time);
        if (!schedIso) continue;
        const { mediaUrl, postType } = extractFbAttachmentInfo(sp);
        const msg = sp.message || "";
        const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Post Agendado no Meta";
        const item: PlannerPost = {
          id: `meta_sched_${sp.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: msg || "Publicação agendada diretamente no Meta Business Suite.",
          media_url: mediaUrl,
          thumbnail_url: mediaUrl,
          permalink: sp.permalink_url || null,
          post_type: postType,
          status: "scheduled",
          platform: "facebook",
          scheduled_at: schedIso,
          published_at: null,
          meta_post_id: sp.id,
          likes_count: 0,
          comments_count: 0,
          reach_count: 0,
          impressions_count: 0,
          created_at: sp.created_time || schedIso,
          source: "meta_live",
        };
        metaScheduledCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(sp.id, item);
      }

      // Posts publicados do Facebook
      const fbPubList = Array.isArray(fbPubRes?.data) ? fbPubRes.data : [];
      for (const fp of fbPubList) {
        if (!fp?.id) continue;
        const { mediaUrl, postType } = extractFbAttachmentInfo(fp);
        const msg = fp.message || "";
        const firstLine = msg.split("\n").find((l: string) => l.trim()) || "Publicação no Facebook";
        const likes = Number(fp.likes?.summary?.total_count || 0);
        const comments = Number(fp.comments?.summary?.total_count || 0);
        const shares = Number(fp.shares?.count || 0);
        const item: PlannerPost = {
          id: `meta_fb_${fp.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: msg,
          media_url: mediaUrl,
          thumbnail_url: mediaUrl,
          permalink: fp.permalink_url || `https://facebook.com/${fp.id}`,
          post_type: postType,
          status: "published",
          platform: "facebook",
          scheduled_at: null,
          published_at: fp.created_time,
          meta_post_id: fp.id,
          likes_count: likes,
          comments_count: comments,
          shares_count: shares,
          reach_count: 0,
          impressions_count: 0,
          created_at: fp.created_time,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(fp.id, item);
      }

      // Posts publicados no Instagram + enriquecimento de métricas reais em TODOS os posts carregados (em lotes de 10)
      const igList = Array.isArray(igMediaRes?.data) ? igMediaRes.data : [];

      const igInsightsMap = new Map<string, { reach: number; views: number; saved: number; shares: number }>();
      for (let i = 0; i < igList.length; i += 10) {
        await Promise.all(
          igList.slice(i, i + 10).map(async (mItem: any) => {
            const ins = await fetchMetaJson(
              `${META_API_BASE}/${mItem.id}/insights?metric=reach,views,saved,shares&access_token=${encodeURIComponent(masterToken)}`
            );
            let reach = 0;
            let views = 0;
            let saved = 0;
            let shares = 0;
            if (Array.isArray(ins?.data)) {
              for (const met of ins.data) {
                const v = Number(met.values?.[0]?.value || 0);
                if (met.name === "reach") reach = v;
                if (met.name === "views") views = v;
                if (met.name === "saved") saved = v;
                if (met.name === "shares") shares = v;
              }
            }
            igInsightsMap.set(mItem.id, { reach, views, saved, shares });
          })
        );
      }

      for (const igItem of igList) {
        if (!igItem?.id) continue;
        const caption = igItem.caption || "";
        const firstLine = caption.split("\n").find((l: string) => l.trim()) || `Instagram ${igItem.media_type || "Post"}`;
        const isReel = igItem.media_product_type === "REELS" || igItem.media_type === "VIDEO";
        const postType: PlannerPost["post_type"] = isReel
          ? "reels"
          : igItem.media_type === "CAROUSEL_ALBUM"
          ? "carousel"
          : igItem.media_product_type === "STORY"
          ? "stories"
          : "feed";
        const metrics = igInsightsMap.get(igItem.id);
        const item: PlannerPost = {
          id: `meta_ig_${igItem.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: firstLine.length > 52 ? `${firstLine.slice(0, 49)}...` : firstLine,
          content: caption,
          media_url: igItem.thumbnail_url || igItem.media_url || null,
          thumbnail_url: igItem.thumbnail_url || igItem.media_url || null,
          permalink: igItem.permalink || null,
          post_type: postType,
          status: "published",
          platform: "instagram",
          scheduled_at: null,
          published_at: igItem.timestamp,
          meta_post_id: igItem.id,
          likes_count: Number(igItem.like_count || 0),
          comments_count: Number(igItem.comments_count || 0),
          shares_count: metrics?.shares || 0,
          saves_count: metrics?.saved || 0,
          reach_count: metrics?.reach || 0,
          impressions_count: metrics?.views || 0,
          created_at: igItem.timestamp,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(igItem.id, item);
      }

      // Stories ativos no Instagram
      const storiesList = Array.isArray(igStoriesRes?.data) ? igStoriesRes.data : [];
      for (const st of storiesList) {
        if (!st?.id) continue;
        const item: PlannerPost = {
          id: `meta_story_${st.id}`,
          page_id: acc.page_id,
          account_name: acc.page_name,
          account_handle: acc.instagram_handle || acc.page_name,
          title: "Story Ativo (Instagram)",
          content: st.caption || "Story publicado nas últimas 24h no Instagram.",
          media_url: st.thumbnail_url || st.media_url || null,
          thumbnail_url: st.thumbnail_url || st.media_url || null,
          permalink: st.permalink || null,
          post_type: "stories",
          status: "published",
          platform: "instagram",
          scheduled_at: null,
          published_at: st.timestamp,
          meta_post_id: st.id,
          likes_count: 0,
          comments_count: 0,
          reach_count: 0,
          impressions_count: 0,
          created_at: st.timestamp,
          source: "meta_live",
        };
        metaPublishedCount += 1;
        metaPosts.push(item);
        metaByMetaId.set(st.id, item);
      }
    })
  );

  // Reconcilia crossposts ("both") por canal (platform + meta_post_id) usando núcleo compartilhado
  const dbCreatedMap = new Map(dbRows.map((r) => [r.id, r]));
  const normalizedCombined = mergeSocialCrosspostRecords({
    dbRows: dbRows.map((r) => ({
      id: r.id,
      page_id: r.page_id,
      account_name: r.account_name,
      account_handle: r.account_handle,
      title: r.title,
      content: r.content,
      post_type: r.post_type,
      status: r.status,
      platform: r.platform,
      scheduled_at: r.scheduled_at,
      published_at: r.published_at,
      meta_post_id: r.meta_post_id,
      likes_count: r.likes_count,
      comments_count: r.comments_count,
      shares_count: r.shares_count,
      saves_count: r.saves_count,
      reach_count: r.reach_count,
      impressions_count: r.impressions_count,
      media_url: r.media_url,
      thumbnail_url: r.thumbnail_url,
      permalink: r.permalink,
    })),
    metaLivePosts: metaPosts.map((mp) => ({
      id: mp.id,
      platform: mp.platform === "facebook" ? "facebook" : "instagram",
      metaPostId: mp.meta_post_id || null,
      pageId: mp.page_id || "",
      accountName: mp.account_name || "",
      accountHandle: mp.account_handle || "",
      title: mp.title,
      content: mp.content,
      postType: mp.post_type,
      status: mp.status,
      scheduledAt: mp.scheduled_at || null,
      publishedAt: mp.published_at || null,
      likesCount: mp.likes_count,
      commentsCount: mp.comments_count,
      sharesCount: mp.shares_count ?? null,
      savesCount: mp.saves_count ?? null,
      reachCount: mp.reach_count > 0 ? mp.reach_count : null,
      impressionsCount: mp.impressions_count > 0 ? mp.impressions_count : null,
      reachState: mp.reach_count > 0 ? "observado" : "indisponivel",
      impressionsState: mp.impressions_count > 0 ? "observado" : "indisponivel",
      permalink: mp.permalink || null,
      mediaUrl: mp.media_url || null,
      thumbnailUrl: mp.thumbnail_url || null,
      source: "meta_live",
    })),
  });

  const combinedPosts: PlannerPost[] = normalizedCombined
    .map((n) => {
      const baseId = n.id.replace(/_(facebook|instagram)$/, "");
      const orig = dbCreatedMap.get(baseId);
      return {
        id: n.id,
        user_id: orig?.user_id,
        page_id: n.pageId || orig?.page_id,
        account_name: n.accountName || orig?.account_name,
        account_handle: n.accountHandle || orig?.account_handle,
        title: n.title,
        content: n.content,
        media_url: n.mediaUrl,
        thumbnail_url: n.thumbnailUrl,
        permalink: n.permalink,
        post_type: n.postType,
        status: n.status,
        platform: n.platform,
        scheduled_at: n.scheduledAt,
        published_at: n.publishedAt,
        meta_post_id: n.metaPostId,
        error_message: orig?.error_message || null,
        likes_count: n.likesCount,
        comments_count: n.commentsCount,
        shares_count: n.sharesCount ?? 0,
        saves_count: n.savesCount ?? 0,
        reach_count: n.reachCount ?? 0,
        impressions_count: n.impressionsCount ?? 0,
        created_at: orig?.created_at || n.publishedAt || n.scheduledAt || new Date().toISOString(),
        source: (n.source === "meta_live" ? "meta_live" : "supabase") as "meta_live" | "supabase",
      };
    })
    .sort((a, b) => {
      const da = new Date(a.scheduled_at || a.published_at || a.created_at).getTime();
      const db = new Date(b.scheduled_at || b.published_at || b.created_at).getTime();
      return db - da;
    });

  // Calcular matriz real de heatmap e top 3 horários reais com base nos posts publicados
  const publishedForHeat: RealSocialPost[] = combinedPosts
    .filter((p) => p.status === "published" && p.published_at)
    .map((p) => ({
      id: p.id,
      accountName: p.account_name || "",
      accountHandle: p.account_handle || "",
      title: p.title,
      content: p.content,
      post_type: p.post_type === "feed" ? "image" : p.post_type,
      platform: p.platform === "facebook" ? "facebook" : "instagram",
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      shares_count: p.shares_count || 0,
      saved_count: p.saves_count || 0,
      reach_count: p.reach_count,
      views_count: p.impressions_count,
      total_interactions: p.likes_count + p.comments_count + (p.shares_count || 0) + (p.saves_count || 0),
      engagement_rate: 0,
      media_url: p.media_url || null,
      thumbnail_url: p.thumbnail_url || null,
      permalink: p.permalink || null,
      published_at: p.published_at!,
      ai_sentiment: "",
      ai_recommendation: "",
    }));

  const { matrix: heatmapMatrix, hasData: hasPostsForHeatmap } = buildRealHeatmap(publishedForHeat);

  // Calcular top 3 slots reais (dia/hora) onde houve maior engajamento
  const slotAgg = new Map<string, { dayIdx: number; hour: number; total: number; count: number }>();
  for (const p of publishedForHeat) {
    const dt = new Date(p.published_at);
    if (isNaN(dt.getTime())) continue;
    const dIdx = dt.getDay();
    const hr = dt.getHours();
    const key = `${dIdx}-${hr}`;
    const score = Math.max(1, p.likes_count + p.comments_count * 2 + p.shares_count * 3 + p.saved_count * 2 + Math.round(p.reach_count / 100));
    const prev = slotAgg.get(key) || { dayIdx: dIdx, hour: hr, total: 0, count: 0 };
    prev.total += score;
    prev.count += 1;
    slotAgg.set(key, prev);
  }

  const maxSlotAvg = Math.max(1, ...Array.from(slotAgg.values()).map((s) => s.total / s.count));
  const topTimeSlots: BestSlotItem[] = Array.from(slotAgg.values())
    .map((s) => ({
      dayIdx: s.dayIdx,
      dayName: WEEK_DAY_NAMES_PT[s.dayIdx],
      hour: s.hour,
      score: Math.round(((s.total / s.count) / maxSlotAvg) * 100),
      postsCount: s.count,
    }))
    .sort((a, b) => b.score - a.score || b.postsCount - a.postsCount)
    .slice(0, 3);

  return {
    posts: combinedPosts,
    igProfile,
    heatmapMatrix,
    hasPostsForHeatmap,
    heatmapSampleSize: publishedForHeat.length,
    apiLimitations: [
      "Instagram Graph API não retorna rascunhos nem agendamentos nativos feitos no app Instagram/Meta Business Suite; apenas o agendamento nativo do Facebook (/scheduled_posts) e a fila local da NC Suite são listados.",
    ],
    topTimeSlots,
    metaScheduledCount,
    metaPublishedCount,
  };
}

/**
 * Publica agora no Meta (Facebook e/ou Instagram) ou agenda nativamente no Meta Facebook (10 min a 30 dias no futuro).
 */
export async function publishOrScheduleToMeta(params: {
  account: RealSocialAccount;
  masterToken: string;
  platform: "instagram" | "facebook" | "both";
  postType: "feed" | "reels" | "stories" | "carousel";
  content: string;
  mediaUrl?: string | null;
  scheduledAtIso?: string | null;
  publishImmediately: boolean;
}): Promise<{
  metaPostIds: string[];
  facebookScheduledNatively: boolean;
  instagramRequiresLocalQueue: boolean;
  errors: string[];
}> {
  const { account, masterToken, platform, postType, content, mediaUrl, scheduledAtIso, publishImmediately } = params;
  const pageToken = account.access_token || masterToken;
  const metaPostIds: string[] = [];
  const errors: string[] = [];
  let facebookScheduledNatively = false;
  let instagramRequiresLocalQueue = false;

  const isVideo =
    postType === "reels" ||
    Boolean(mediaUrl && /\.(mp4|mov|m4v)(\?|$)/i.test(mediaUrl));

  // Agendamento futuro
  if (!publishImmediately && scheduledAtIso) {
    const schedMs = new Date(scheduledAtIso).getTime();
    const nowMs = Date.now();
    const diffMin = (schedMs - nowMs) / 60000;
    const diffDays = diffMin / (60 * 24);
    const unixSec = Math.floor(schedMs / 1000);

    if (platform === "facebook" || platform === "both") {
      if (diffMin < 10 || diffDays > 30) {
        errors.push(
          "Facebook Meta API exige agendamento entre 10 minutos e 30 dias no futuro para agendamento nativo."
        );
      } else {
        try {
          let fbRes: Response;
          if (mediaUrl && !isVideo) {
            fbRes = await fetch(`${META_API_BASE}/${account.page_id}/photos`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: mediaUrl,
                caption: content,
                published: false,
                scheduled_publish_time: unixSec,
                access_token: pageToken,
              }),
            });
          } else {
            fbRes = await fetch(`${META_API_BASE}/${account.page_id}/feed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: content,
                ...(mediaUrl ? { link: mediaUrl } : {}),
                published: false,
                scheduled_publish_time: unixSec,
                access_token: pageToken,
              }),
            });
          }
          const fbJson = await fbRes.json();
          if (fbJson?.error) {
            errors.push(`Facebook Agendamento: ${fbJson.error.message}`);
          } else if (fbJson?.id || fbJson?.post_id) {
            metaPostIds.push(fbJson.post_id || fbJson.id);
            facebookScheduledNatively = true;
          }
        } catch (err: any) {
          errors.push(`Facebook Agendamento: ${err?.message || "Erro de rede"}`);
        }
      }
    }

    if (platform === "instagram" || platform === "both") {
      instagramRequiresLocalQueue = true;
    }

    return { metaPostIds, facebookScheduledNatively, instagramRequiresLocalQueue, errors };
  }

  // Publicação imediata
  if (platform === "facebook" || platform === "both") {
    try {
      let fbRes: Response;
      if (mediaUrl && isVideo) {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/videos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            file_url: mediaUrl,
            description: content,
            access_token: pageToken,
          }),
        });
      } else if (mediaUrl) {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/photos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            url: mediaUrl,
            caption: content,
            access_token: pageToken,
          }),
        });
      } else {
        fbRes = await fetch(`${META_API_BASE}/${account.page_id}/feed`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content,
            access_token: pageToken,
          }),
        });
      }
      const fbJson = await fbRes.json();
      if (fbJson?.error) {
        errors.push(`Facebook: ${fbJson.error.message}`);
      } else if (fbJson?.id || fbJson?.post_id) {
        metaPostIds.push(fbJson.post_id || fbJson.id);
      }
    } catch (err: any) {
      errors.push(`Facebook: ${err?.message || "Erro ao publicar"}`);
    }
  }

  if (platform === "instagram" || platform === "both") {
    if (!account.instagram_account_id) {
      errors.push("Esta página do Facebook não possui um Instagram Business vinculado.");
    } else if (!mediaUrl) {
      errors.push("Instagram exige URL ou upload de imagem/vídeo para publicar.");
    } else {
      try {
        const containerBody: Record<string, string> = {
          caption: content || "",
          access_token: masterToken,
        };
        if (isVideo) {
          containerBody.media_type = "REELS";
          containerBody.video_url = mediaUrl;
        } else if (postType === "stories") {
          containerBody.media_type = "STORIES";
          containerBody.image_url = mediaUrl;
        } else {
          containerBody.image_url = mediaUrl;
        }

        const cRes = await fetch(`${META_API_BASE}/${account.instagram_account_id}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(containerBody),
        });
        const cJson = await cRes.json();
        if (cJson?.error) throw new Error(cJson.error.message);
        const creationId = cJson.id;

        if (isVideo && creationId) {
          let statusCode = "IN_PROGRESS";
          let attempts = 0;
          while (statusCode === "IN_PROGRESS" && attempts < 12) {
            await new Promise((r) => setTimeout(r, 2500));
            const chk = await fetchMetaJson(
              `${META_API_BASE}/${creationId}?fields=status_code&access_token=${encodeURIComponent(masterToken)}`
            );
            if (chk?.status_code) statusCode = chk.status_code;
            if (statusCode === "ERROR") throw new Error("Processamento do vídeo falhou no Instagram.");
            attempts++;
          }
        }

        const pubRes = await fetch(`${META_API_BASE}/${account.instagram_account_id}/media_publish`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            creation_id: creationId,
            access_token: masterToken,
          }),
        });
        const pubJson = await pubRes.json();
        if (pubJson?.error) throw new Error(pubJson.error.message);
        if (pubJson?.id) metaPostIds.push(pubJson.id);
      } catch (err: any) {
        errors.push(`Instagram: ${err?.message || "Erro ao publicar"}`);
      }
    }
  }

  return { metaPostIds, facebookScheduledNatively, instagramRequiresLocalQueue, errors };
}

export async function deleteMetaScheduledPost(metaPostId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `${META_API_BASE}/${metaPostId}?access_token=${encodeURIComponent(pageToken)}`,
      { method: "DELETE" }
    );
    const json = await res.json();
    if (json?.error) return { ok: false, error: json.error.message };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Erro ao cancelar na Meta" };
  }
}


