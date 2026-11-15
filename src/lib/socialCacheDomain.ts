/**
 * Camada compartilhada de cache, frescor (TTL por classe de dado),
 * single-flight deduplication e SWR (Stale-While-Revalidate) para o Hub Social Media.
 *
 * Regras centrais:
 * 1. Chaves completas com tenant, conta/escopo, rede, período, classe de dado e versão do contrato.
 * 2. TTLs configuráveis por classe de dado (contas, perfil, insights, posts, planejador).
 * 3. Single-flight por chave: requisições simultâneas compartilham a mesma Promise
 *    e NÃO são canceladas quando o usuário navega para outra rota do hub.
 * 4. SWR: se vencido, entrega imediatamente o último snapshot válido e revalida em segundo plano.
 * 5. Preservação em falhas (rate limit, timeout, permissão, erro parcial): nunca zera métricas indisponíveis.
 */

export const SOCIAL_CACHE_CONTRACT_VERSION = "2026.11.social.v2";

export type SocialDataClass =
  | "accounts"
  | "profile"
  | "insights"
  | "posts"
  | "planner";

export type SocialNetworkScope = "all" | "instagram" | "facebook";

export const DEFAULT_SOCIAL_CACHE_TTLS_MS: Record<SocialDataClass, number> = {
  accounts: 15 * 60 * 1000, // 15 min: páginas e vínculos IG/FB
  profile: 30 * 60 * 1000, // 30 min: metadados de perfil e seguidores
  insights: 10 * 60 * 1000, // 10 min: série diária, KPIs e demografia
  posts: 10 * 60 * 1000, // 10 min: posts publicados e insights de mídia
  planner: 5 * 60 * 1000, // 5 min: agendamentos + fila Supabase + heatmap
};

export interface SocialDataClassPolicy {
  dataClass: SocialDataClass;
  ttlMs: number;
  sharedAcrossRoutes: string[];
  keyDimensions: string[];
  canReuseBetweenPlannerAndAnalytics: boolean;
  fallbackPolicy: "preserve_last_valid_snapshot" | "error_without_fake_zero";
}

export const SOCIAL_DATA_CLASS_MATRIX: Record<SocialDataClass, SocialDataClassPolicy> = {
  accounts: {
    dataClass: "accounts",
    ttlMs: DEFAULT_SOCIAL_CACHE_TTLS_MS.accounts,
    sharedAcrossRoutes: ["/social", "/social-insights", "/social-audit"],
    keyDimensions: ["tenantId", "variant"],
    canReuseBetweenPlannerAndAnalytics: true,
    fallbackPolicy: "preserve_last_valid_snapshot",
  },
  profile: {
    dataClass: "profile",
    ttlMs: DEFAULT_SOCIAL_CACHE_TTLS_MS.profile,
    sharedAcrossRoutes: ["/social", "/social-insights"],
    keyDimensions: ["tenantId", "accountScope", "network"],
    canReuseBetweenPlannerAndAnalytics: true,
    fallbackPolicy: "preserve_last_valid_snapshot",
  },
  insights: {
    dataClass: "insights",
    ttlMs: DEFAULT_SOCIAL_CACHE_TTLS_MS.insights,
    sharedAcrossRoutes: ["/social-insights", "/social-audit"],
    keyDimensions: ["tenantId", "accountScope", "network", "period", "variant"],
    canReuseBetweenPlannerAndAnalytics: false,
    fallbackPolicy: "preserve_last_valid_snapshot",
  },
  posts: {
    dataClass: "posts",
    ttlMs: DEFAULT_SOCIAL_CACHE_TTLS_MS.posts,
    sharedAcrossRoutes: ["/social-insights", "/social-audit"],
    keyDimensions: ["tenantId", "accountScope", "network", "period", "variant"],
    canReuseBetweenPlannerAndAnalytics: false,
    fallbackPolicy: "preserve_last_valid_snapshot",
  },
  planner: {
    dataClass: "planner",
    ttlMs: DEFAULT_SOCIAL_CACHE_TTLS_MS.planner,
    sharedAcrossRoutes: ["/social"],
    keyDimensions: ["tenantId", "accountScope", "network", "variant"],
    canReuseBetweenPlannerAndAnalytics: false,
    fallbackPolicy: "preserve_last_valid_snapshot",
  },
};

const STORAGE_PREFIX = "nc_social_hub_cache_v2::";
const MAX_LOCAL_STORAGE_POSTS = 25;

export interface SocialCacheKeyParams {
  tenantId?: string | null;
  accountScope: string;
  network?: SocialNetworkScope;
  period?: string;
  dataClass: SocialDataClass;
  variant?: string;
}

export interface SocialCacheEnvelope<T> {
  key: string;
  dataClass: SocialDataClass;
  contractVersion: string;
  tenantId: string;
  accountScope: string;
  network: SocialNetworkScope;
  period: string;
  snapshotAt: string;
  data: T;
}

export type SocialSnapshotFreshness = "fresh" | "stale" | "missing";

export interface SocialFreshnessEvaluation<T> {
  status: SocialSnapshotFreshness;
  ageMs: number | null;
  ttlMs: number;
  envelope: SocialCacheEnvelope<T> | null;
}

export interface SocialSWRResolution<T> {
  data: T;
  source:
    | "cache_fresh"
    | "cache_stale_swr"
    | "meta_live"
    | "fallback_last_valid";
  snapshotAt: string;
  isStale: boolean;
  revalidatingInBackground: boolean;
  error?: string | null;
}

export interface SocialPerfEventRecord {
  timestamp: string;
  event:
    | "meta_call"
    | "supabase_read"
    | "cache_hit"
    | "stale_swr_hit"
    | "deduped_in_flight"
    | "manual_sync"
    | "fallback_preserved"
    | "call_started"
    | "call_completed"
    | "call_failed"
    | "call_aborted";
  dataClass?: SocialDataClass;
  scopeTag?: string;
  network?: SocialNetworkScope;
  period?: string;
  durationMs?: number;
  reason?: string;
  status?: "ok" | "deduped" | "stale" | "error" | "aborted";
}

export interface SocialRouteTransitionRecord {
  from: string;
  to: string;
  durationMs: number;
  cacheWarm: boolean;
  timestamp: string;
}

export interface SocialPerfMetrics {
  version: string;
  initializedAt: string;
  metaCalls: number;
  supabaseReads: number;
  cacheHits: number;
  staleSwrHits: number;
  dedupedInFlightHits: number;
  callsStarted: number;
  callsDeduped: number;
  callsCompleted: number;
  callsAborted: number;
  callsFailed: number;
  manualSyncs: number;
  fallbackPreservations: number;
  routeTransitionsMs: number[];
  routeTransitions: SocialRouteTransitionRecord[];
  recentEvents: SocialPerfEventRecord[];
}

const MAX_PERF_EVENTS = 60;
const memoryStore = new Map<string, SocialCacheEnvelope<unknown>>();
const inFlightMap = new Map<string, Promise<unknown>>();
const backgroundRevalidatingKeys = new Set<string>();

let customTtls: Partial<Record<SocialDataClass, number>> = {};

function anonymizeScopeTag(accountScope?: string): string {
  const clean = (accountScope || "all").trim();
  if (!clean || clean === "all") return "all";
  return clean.length <= 6 ? `acc:${clean}` : `acc:...${clean.slice(-4)}`;
}

const perfMetrics: SocialPerfMetrics = {
  version: SOCIAL_CACHE_CONTRACT_VERSION,
  initializedAt: new Date().toISOString(),
  metaCalls: 0,
  supabaseReads: 0,
  cacheHits: 0,
  staleSwrHits: 0,
  dedupedInFlightHits: 0,
  callsStarted: 0,
  callsDeduped: 0,
  callsCompleted: 0,
  callsAborted: 0,
  callsFailed: 0,
  manualSyncs: 0,
  fallbackPreservations: 0,
  routeTransitionsMs: [],
  routeTransitions: [],
  recentEvents: [],
};

function syncWindowSocialPerfSnapshot(): void {
  if (typeof window !== "undefined") {
    (window as any).__ncSocialPerf = getSocialPerfMetrics();
  }
}

export function configureSocialCacheTtls(
  overrides: Partial<Record<SocialDataClass, number>>
): void {
  customTtls = { ...customTtls, ...overrides };
}

export function getSocialCacheTtlMs(dataClass: SocialDataClass): number {
  const override = customTtls[dataClass];
  if (typeof override === "number" && override > 0) return override;
  return DEFAULT_SOCIAL_CACHE_TTLS_MS[dataClass];
}

export function buildSocialCacheKey(params: SocialCacheKeyParams): string {
  const tenant = (params.tenantId || "default").trim() || "default";
  const account = (params.accountScope || "all").trim() || "all";
  const network: SocialNetworkScope = params.network || "all";
  const period = (params.period || "default").trim() || "default";
  const variant = params.variant ? `:${params.variant.trim()}` : "";
  return `${SOCIAL_CACHE_CONTRACT_VERSION}|t=${tenant}|c=${params.dataClass}|acc=${account}|net=${network}|p=${period}${variant}`;
}

export function getSocialPerfMetrics(): SocialPerfMetrics & {
  p50NavigationMs: number;
  p95NavigationMs: number;
} {
  const sorted = [...perfMetrics.routeTransitionsMs].sort((a, b) => a - b);
  const percentile = (p: number) => {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)
    );
    return Math.round(sorted[idx]);
  };
  return {
    ...perfMetrics,
    routeTransitionsMs: [...perfMetrics.routeTransitionsMs],
    routeTransitions: [...perfMetrics.routeTransitions],
    recentEvents: [...perfMetrics.recentEvents],
    p50NavigationMs: percentile(50),
    p95NavigationMs: percentile(95),
  };
}

function pushPerfEventRecord(rec: SocialPerfEventRecord): void {
  perfMetrics.recentEvents.push(rec);
  if (perfMetrics.recentEvents.length > MAX_PERF_EVENTS) {
    perfMetrics.recentEvents.shift();
  }
}

export function recordSocialPerfEvent(
  event:
    | "meta_call"
    | "supabase_read"
    | "cache_hit"
    | "stale_swr_hit"
    | "deduped_in_flight"
    | "manual_sync"
    | "fallback_preserved",
  meta?: {
    dataClass?: SocialDataClass;
    accountScope?: string;
    network?: SocialNetworkScope;
    period?: string;
    durationMs?: number;
    reason?: string;
    status?: SocialPerfEventRecord["status"];
  }
): void {
  if (event === "meta_call") perfMetrics.metaCalls += 1;
  else if (event === "supabase_read") perfMetrics.supabaseReads += 1;
  else if (event === "cache_hit") perfMetrics.cacheHits += 1;
  else if (event === "stale_swr_hit") perfMetrics.staleSwrHits += 1;
  else if (event === "deduped_in_flight") {
    perfMetrics.dedupedInFlightHits += 1;
    perfMetrics.callsDeduped += 1;
  } else if (event === "manual_sync") perfMetrics.manualSyncs += 1;
  else if (event === "fallback_preserved") perfMetrics.fallbackPreservations += 1;

  if (meta || event !== "meta_call") {
    pushPerfEventRecord({
      timestamp: new Date().toISOString(),
      event,
      dataClass: meta?.dataClass,
      scopeTag: meta?.accountScope ? anonymizeScopeTag(meta.accountScope) : undefined,
      network: meta?.network,
      period: meta?.period,
      durationMs: meta?.durationMs !== undefined ? Math.round(meta.durationMs) : undefined,
      reason: meta?.reason,
      status: meta?.status || (event === "fallback_preserved" ? "error" : "ok"),
    });
  }

  syncWindowSocialPerfSnapshot();
}

export function recordSocialCacheHitEvent(input: {
  dataClass: SocialDataClass;
  accountScope: string;
  network?: SocialNetworkScope;
  period?: string;
  reason?: string;
}): void {
  recordSocialPerfEvent("cache_hit", {
    ...input,
    reason: input.reason || "react_query_fresh",
    status: "ok",
  });
}

export function recordSocialRouteTransition(
  durationMs: number,
  meta?: { from?: string; to?: string; cacheWarm?: boolean }
): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const rounded = Math.round(durationMs * 10) / 10;
  perfMetrics.routeTransitionsMs.push(rounded);
  if (perfMetrics.routeTransitionsMs.length > 100) {
    perfMetrics.routeTransitionsMs.shift();
  }
  perfMetrics.routeTransitions.push({
    from: meta?.from || "unknown",
    to: meta?.to || "unknown",
    durationMs: rounded,
    cacheWarm: meta?.cacheWarm ?? perfMetrics.cacheHits > 0,
    timestamp: new Date().toISOString(),
  });
  if (perfMetrics.routeTransitions.length > 50) {
    perfMetrics.routeTransitions.shift();
  }
  syncWindowSocialPerfSnapshot();
}

// Garante window.__ncSocialPerf disponível desde o carregamento inicial do módulo
syncWindowSocialPerfSnapshot();

export function resetSocialCacheForTests(): void {
  memoryStore.clear();
  inFlightMap.clear();
  backgroundRevalidatingKeys.clear();
  customTtls = {};
  perfMetrics.metaCalls = 0;
  perfMetrics.supabaseReads = 0;
  perfMetrics.cacheHits = 0;
  perfMetrics.staleSwrHits = 0;
  perfMetrics.dedupedInFlightHits = 0;
  perfMetrics.callsStarted = 0;
  perfMetrics.callsDeduped = 0;
  perfMetrics.callsCompleted = 0;
  perfMetrics.callsAborted = 0;
  perfMetrics.callsFailed = 0;
  perfMetrics.manualSyncs = 0;
  perfMetrics.fallbackPreservations = 0;
  perfMetrics.routeTransitionsMs = [];
  perfMetrics.routeTransitions = [];
  perfMetrics.recentEvents = [];
  if (typeof localStorage !== "undefined") {
    try {
      const toDelete: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(STORAGE_PREFIX)) toDelete.push(k);
      }
      toDelete.forEach((k) => localStorage.removeItem(k));
    } catch {
      // ignore
    }
  }
}

function compactForStorage<T>(data: T): T {
  if (data && typeof data === "object" && Array.isArray((data as any).posts)) {
    return {
      ...(data as any),
      posts: (data as any).posts.slice(0, MAX_LOCAL_STORAGE_POSTS),
    } as T;
  }
  return data;
}

export function writeSocialCacheEnvelope<T>(
  key: string,
  meta: Omit<SocialCacheEnvelope<T>, "key" | "contractVersion" | "snapshotAt" | "data"> & {
    snapshotAt?: string;
  },
  data: T
): SocialCacheEnvelope<T> {
  const envelope: SocialCacheEnvelope<T> = {
    key,
    dataClass: meta.dataClass,
    contractVersion: SOCIAL_CACHE_CONTRACT_VERSION,
    tenantId: meta.tenantId,
    accountScope: meta.accountScope,
    network: meta.network,
    period: meta.period,
    snapshotAt: meta.snapshotAt || new Date().toISOString(),
    data,
  };
  memoryStore.set(key, envelope as SocialCacheEnvelope<unknown>);
  if (typeof localStorage !== "undefined") {
    try {
      const compact: SocialCacheEnvelope<T> = {
        ...envelope,
        data: compactForStorage(data),
      };
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(compact));
    } catch {
      // ignore storage quota errors
    }
  }
  return envelope;
}

export function readSocialCacheEnvelope<T>(
  key: string
): SocialCacheEnvelope<T> | null {
  const mem = memoryStore.get(key) as SocialCacheEnvelope<T> | undefined;
  if (mem && mem.contractVersion === SOCIAL_CACHE_CONTRACT_VERSION) {
    return mem;
  }
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SocialCacheEnvelope<T>;
    if (
      parsed &&
      parsed.contractVersion === SOCIAL_CACHE_CONTRACT_VERSION &&
      parsed.data !== undefined
    ) {
      memoryStore.set(key, parsed as SocialCacheEnvelope<unknown>);
      return parsed;
    }
  } catch {
    // ignore corrupted storage
  }
  return null;
}

export function evaluateSocialSnapshotFreshness<T>(
  key: string,
  dataClass: SocialDataClass,
  nowMs = Date.now()
): SocialFreshnessEvaluation<T> {
  const ttlMs = getSocialCacheTtlMs(dataClass);
  const envelope = readSocialCacheEnvelope<T>(key);
  if (!envelope) {
    return { status: "missing", ageMs: null, ttlMs, envelope: null };
  }
  const snapMs = Date.parse(envelope.snapshotAt);
  if (!Number.isFinite(snapMs)) {
    return { status: "stale", ageMs: null, ttlMs, envelope };
  }
  const ageMs = Math.max(0, nowMs - snapMs);
  return {
    status: ageMs <= ttlMs ? "fresh" : "stale",
    ageMs,
    ttlMs,
    envelope,
  };
}

/**
 * Garante single-flight por chave de escopo:
 * - Chamadas simultâneas compartilham a mesma Promise em andamento.
 * - Não é abortada por desmontagem de componente/rota.
 */
export function runSharedSocialSync<T>(
  key: string,
  fetcher: () => Promise<T>,
  meta?: {
    dataClass?: SocialDataClass;
    accountScope?: string;
    network?: SocialNetworkScope;
    period?: string;
    reason?: string;
  }
): Promise<T> {
  const existing = inFlightMap.get(key) as Promise<T> | undefined;
  if (existing) {
    recordSocialPerfEvent("deduped_in_flight", {
      dataClass: meta?.dataClass,
      accountScope: meta?.accountScope,
      network: meta?.network,
      period: meta?.period,
      reason: meta?.reason || "in_flight_single_flight",
      status: "deduped",
    });
    return existing;
  }

  const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  perfMetrics.callsStarted += 1;
  pushPerfEventRecord({
    timestamp: new Date().toISOString(),
    event: "call_started",
    dataClass: meta?.dataClass,
    scopeTag: meta?.accountScope ? anonymizeScopeTag(meta.accountScope) : undefined,
    network: meta?.network,
    period: meta?.period,
    reason: meta?.reason || "cache_miss",
    status: "ok",
  });
  syncWindowSocialPerfSnapshot();

  const promise = (async () => {
    try {
      const value = await fetcher();
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      perfMetrics.callsCompleted += 1;
      pushPerfEventRecord({
        timestamp: new Date().toISOString(),
        event: "call_completed",
        dataClass: meta?.dataClass,
        scopeTag: meta?.accountScope ? anonymizeScopeTag(meta.accountScope) : undefined,
        network: meta?.network,
        period: meta?.period,
        durationMs: Math.round(durationMs),
        reason: meta?.reason || "cache_miss",
        status: "ok",
      });
      syncWindowSocialPerfSnapshot();
      return value;
    } catch (err: any) {
      const durationMs =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
      const isAbort =
        err?.name === "AbortError" ||
        String(err?.message || "").toLowerCase().includes("abort");
      if (isAbort) perfMetrics.callsAborted += 1;
      else perfMetrics.callsFailed += 1;
      pushPerfEventRecord({
        timestamp: new Date().toISOString(),
        event: isAbort ? "call_aborted" : "call_failed",
        dataClass: meta?.dataClass,
        scopeTag: meta?.accountScope ? anonymizeScopeTag(meta.accountScope) : undefined,
        network: meta?.network,
        period: meta?.period,
        durationMs: Math.round(durationMs),
        reason: meta?.reason || "error",
        status: isAbort ? "aborted" : "error",
      });
      syncWindowSocialPerfSnapshot();
      throw err;
    } finally {
      inFlightMap.delete(key);
      backgroundRevalidatingKeys.delete(key);
    }
  })();

  inFlightMap.set(key, promise);
  return promise;
}

export function isSocialSyncInFlight(key: string): boolean {
  return inFlightMap.has(key);
}

/**
 * Resolve dados com SWR (Stale-While-Revalidate) e preservação de último snapshot válido:
 * - Cache válido (`fresh`) e `!forceRefresh`: retorna imediatamente sem chamar Meta.
 * - Cache vencido (`stale`) e `!forceRefresh`: retorna imediatamente o último snapshot válido e dispara revalidação em segundo plano.
 * - Cache ausente (`missing`) ou `forceRefresh`: executa sincronização compartilhada (single-flight).
 * - Se falhar (rate limit, timeout, permissão negada, erro parcial) e existir snapshot anterior: preserva o snapshot anterior sem zerar métricas.
 */
export async function resolveSocialDataWithSWR<T>(input: {
  keyParams: SocialCacheKeyParams;
  fetcher: () => Promise<{
    data: T;
    isValidForCache: boolean;
    errorMessage?: string | null;
    snapshotAt?: string;
  }>;
  forceRefresh?: boolean;
  nowMs?: number;
  onBackgroundRevalidated?: (fresh: SocialSWRResolution<T>) => void;
  onErrorPreserve?: (prev: T, errorMessage: string) => T;
}): Promise<SocialSWRResolution<T>> {
  const key = buildSocialCacheKey(input.keyParams);
  const evaluation = evaluateSocialSnapshotFreshness<T>(
    key,
    input.keyParams.dataClass,
    input.nowMs
  );

  // 1. Snapshot dentro do prazo de validade -> 0 chamadas Meta
  if (!input.forceRefresh && evaluation.status === "fresh" && evaluation.envelope) {
    recordSocialPerfEvent("cache_hit", {
      dataClass: input.keyParams.dataClass,
      accountScope: input.keyParams.accountScope,
      network: input.keyParams.network || "all",
      period: input.keyParams.period || "default",
      reason: "swr_fresh",
      status: "ok",
    });
    return {
      data: evaluation.envelope.data,
      source: "cache_fresh",
      snapshotAt: evaluation.envelope.snapshotAt,
      isStale: false,
      revalidatingInBackground: false,
    };
  }

  const executeLiveFetch = async (reason: string): Promise<SocialSWRResolution<T>> => {
    if (input.forceRefresh) {
      recordSocialPerfEvent("manual_sync", {
        dataClass: input.keyParams.dataClass,
        accountScope: input.keyParams.accountScope,
        network: input.keyParams.network || "all",
        period: input.keyParams.period || "default",
        reason: "manual_sync",
      });
    }
    try {
      const res = await runSharedSocialSync(key, input.fetcher, {
        dataClass: input.keyParams.dataClass,
        accountScope: input.keyParams.accountScope,
        network: input.keyParams.network || "all",
        period: input.keyParams.period || "default",
        reason,
      });
      if (res.isValidForCache) {
        const env = writeSocialCacheEnvelope(
          key,
          {
            dataClass: input.keyParams.dataClass,
            tenantId: input.keyParams.tenantId || "default",
            accountScope: input.keyParams.accountScope,
            network: input.keyParams.network || "all",
            period: input.keyParams.period || "default",
            snapshotAt: res.snapshotAt,
          },
          res.data
        );
        return {
          data: env.data,
          source: "meta_live",
          snapshotAt: env.snapshotAt,
          isStale: false,
          revalidatingInBackground: false,
          error: res.errorMessage || null,
        };
      }

      // Resposta veio com erro (rate limit, permissão, timeout) -> preservar último snapshot válido se existir
      if (evaluation.envelope) {
        recordSocialPerfEvent("fallback_preserved", {
          dataClass: input.keyParams.dataClass,
          accountScope: input.keyParams.accountScope,
          network: input.keyParams.network || "all",
          period: input.keyParams.period || "default",
          reason: res.errorMessage || "fallback_preserved",
          status: "error",
        });
        const preserved = input.onErrorPreserve
          ? input.onErrorPreserve(
              evaluation.envelope.data,
              res.errorMessage || "Falha ao atualizar na Meta"
            )
          : evaluation.envelope.data;
        return {
          data: preserved,
          source: "fallback_last_valid",
          snapshotAt: evaluation.envelope.snapshotAt,
          isStale: true,
          revalidatingInBackground: false,
          error: res.errorMessage || null,
        };
      }

      return {
        data: res.data,
        source: "meta_live",
        snapshotAt: res.snapshotAt || new Date().toISOString(),
        isStale: false,
        revalidatingInBackground: false,
        error: res.errorMessage || null,
      };
    } catch (err: any) {
      const msg = err?.message || "Erro ao consultar Meta Graph API";
      if (evaluation.envelope) {
        recordSocialPerfEvent("fallback_preserved", {
          dataClass: input.keyParams.dataClass,
          accountScope: input.keyParams.accountScope,
          network: input.keyParams.network || "all",
          period: input.keyParams.period || "default",
          reason: msg,
          status: "error",
        });
        const preserved = input.onErrorPreserve
          ? input.onErrorPreserve(evaluation.envelope.data, msg)
          : evaluation.envelope.data;
        return {
          data: preserved,
          source: "fallback_last_valid",
          snapshotAt: evaluation.envelope.snapshotAt,
          isStale: true,
          revalidatingInBackground: false,
          error: msg,
        };
      }
      throw err;
    }
  };

  // 2. Snapshot vencido -> retorna imediatamente e revalida em segundo plano
  if (!input.forceRefresh && evaluation.status === "stale" && evaluation.envelope) {
    recordSocialPerfEvent("stale_swr_hit", {
      dataClass: input.keyParams.dataClass,
      accountScope: input.keyParams.accountScope,
      network: input.keyParams.network || "all",
      period: input.keyParams.period || "default",
      reason: "swr_stale_revalidate",
      status: "stale",
    });
    if (!backgroundRevalidatingKeys.has(key)) {
      backgroundRevalidatingKeys.add(key);
      void executeLiveFetch("swr_background_revalidate")
        .then((fresh) => {
          input.onBackgroundRevalidated?.(fresh);
        })
        .catch(() => {
          // Erro silencioso em background preserva snapshot atual
        });
    }
    return {
      data: evaluation.envelope.data,
      source: "cache_stale_swr",
      snapshotAt: evaluation.envelope.snapshotAt,
      isStale: true,
      revalidatingInBackground: true,
    };
  }

  // 3. Sem snapshot ou forceRefresh -> executa sincronização compartilhada
  return executeLiveFetch(input.forceRefresh ? "manual_sync" : "cache_miss");
}
