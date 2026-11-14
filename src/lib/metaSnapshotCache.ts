// src/lib/metaSnapshotCache.ts
// Coordenador central de chaves de query, snapshotId efetivo, telemetria global de sync,
// guarda anti-concorrência e invalidação pós-commit para todos os consumidores Meta Ads.

import { useEffect, useState } from "react";
import type { Query, QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import {
  DEFAULT_META_TIMEZONE,
  META_SNAPSHOT_EVENT,
  META_SNAPSHOT_CONSUMER_DOMAINS,
  getMetaSnapshotScopeTuple,
  buildMetaSnapshotKey,
  isMatchingMetaConsumerKey,
  createMonotonicRequestGuard,
  type MetaSnapshotScopeParams,
} from "./metaSnapshotScope.ts";
import {
  SYNC_STATUS_EVENT,
  SYNC_STATUS_STORAGE_KEY,
  formatShortSnapshotId as formatShortIdFromDomain,
  formatSyncTimestampBRT,
  isSyncJobActivelyRunning,
  isTerminalCommittedSyncStatus,
  normalizeTimestampToEpochMs,
  readValidatedLocalSyncStatus,
  type SyncAccountRecord,
  type SyncRunRecord,
} from "./syncStatusDomain.ts";

export {
  DEFAULT_META_TIMEZONE,
  META_SNAPSHOT_EVENT,
  META_SNAPSHOT_CONSUMER_DOMAINS,
  getMetaSnapshotScopeTuple,
  buildMetaSnapshotKey,
  isMatchingMetaConsumerKey,
  createMonotonicRequestGuard,
};
export type { MetaSnapshotScopeParams, SyncAccountRecord, SyncRunRecord };

export interface ActiveMetaSnapshotInfo {
  snapshotId: string;
  committedAt: string;
  tenantId: string;
  accountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  source?: string;
  startedAt?: string | null;
  latestSyncRun?: SyncRunRecord | null;
  accounts?: SyncAccountRecord[];
  accountLastSyncAt?: string | null;
  isMetaSyncRunning?: boolean;
}

const SNAPSHOT_STORAGE_KEY = "nc_active_meta_snapshot_v1";
const COMMITTED_SYNC_STATUSES = ["success", "partial_success", "partial", "completed"];
const SYNC_HISTORY_COLUMNS =
  "id, status, started_at, completed_at, accounts_synced, campaigns_synced, metrics_synced, error_message, triggered_by, partial_failures, sync_coverage, sync_version";
const SYNC_HISTORY_MINIMAL_COLUMNS =
  "id, status, started_at, completed_at, accounts_synced, error_message, triggered_by";

let inMemorySnapshot: ActiveMetaSnapshotInfo | null = null;

interface SharedTelemetryState {
  latestSyncRun: SyncRunRecord | null;
  lastCommittedRun: SyncRunRecord | null;
  accounts: SyncAccountRecord[];
  fetchedAtMs: number;
}

let sharedTelemetry: SharedTelemetryState = {
  latestSyncRun: null,
  lastCommittedRun: null,
  accounts: [],
  fetchedAtMs: 0,
};

let telemetryRequestSeq = 0;
let inFlightTelemetryPromise: Promise<SharedTelemetryState> | null = null;
let lastInvalidatedRunId: string | null = null;
let wasRemoteJobActive = false;

const telemetryListeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let sharedEventsBound = false;

function notifyTelemetryListeners() {
  for (const fn of telemetryListeners) {
    try {
      fn();
    } catch {
      // ignore subscriber errors
    }
  }
}

function loadStoredSnapshot(): ActiveMetaSnapshotInfo {
  if (inMemorySnapshot) return inMemorySnapshot;
  const fallback: ActiveMetaSnapshotInfo = {
    snapshotId: "initial",
    committedAt: "",
    tenantId: "default-tenant",
    source: "init",
  };
  if (typeof window === "undefined" || typeof localStorage === "undefined") {
    return fallback;
  }
  try {
    const raw = localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.snapshotId === "string") {
      const committedMs = normalizeTimestampToEpochMs(parsed.committedAt);
      inMemorySnapshot = {
        snapshotId: parsed.snapshotId,
        committedAt: committedMs !== null ? String(parsed.committedAt) : "",
        tenantId: parsed.tenantId || "default-tenant",
        accountId: parsed.accountId || null,
        dateFrom: parsed.dateFrom || null,
        dateTo: parsed.dateTo || null,
        source: parsed.source || "storage",
      };
      return inMemorySnapshot;
    }
  } catch {
    // ignore storage errors
  }
  return fallback;
}

export function getActiveMetaSnapshot(): ActiveMetaSnapshotInfo {
  return loadStoredSnapshot();
}

export function publishActiveMetaSnapshot(info: ActiveMetaSnapshotInfo): ActiveMetaSnapshotInfo {
  const validCommittedMs = normalizeTimestampToEpochMs(info.committedAt);
  const normalized: ActiveMetaSnapshotInfo = {
    snapshotId: info.snapshotId || "initial",
    committedAt: validCommittedMs !== null ? String(info.committedAt) : "",
    tenantId: info.tenantId || "default-tenant",
    accountId: info.accountId ?? null,
    dateFrom: info.dateFrom ?? null,
    dateTo: info.dateTo ?? null,
    source: info.source || "commit",
  };
  inMemorySnapshot = normalized;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // ignore storage quota errors
    }
    window.dispatchEvent(new CustomEvent(META_SNAPSHOT_EVENT, { detail: normalized }));
  }
  notifyTelemetryListeners();
  return normalized;
}

async function queryLatestSyncHistoryRows(): Promise<{
  latestRun: SyncRunRecord | null;
  lastCommitted: SyncRunRecord | null;
}> {
  try {
    const [latestRes, committedRes] = await Promise.all([
      (supabase as any)
        .from("sync_history")
        .select(SYNC_HISTORY_COLUMNS)
        .order("started_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("sync_history")
        .select(SYNC_HISTORY_COLUMNS)
        .in("status", COMMITTED_SYNC_STATUSES)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);

    if (!latestRes.error && !committedRes.error) {
      return {
        latestRun: (latestRes.data?.[0] as SyncRunRecord) || null,
        lastCommitted: (committedRes.data?.[0] as SyncRunRecord) || null,
      };
    }

    // Fallback seguro caso alguma coluna estendida ainda não exista
    const [minLatest, minCommitted] = await Promise.all([
      (supabase as any)
        .from("sync_history")
        .select(SYNC_HISTORY_MINIMAL_COLUMNS)
        .order("started_at", { ascending: false })
        .limit(1),
      (supabase as any)
        .from("sync_history")
        .select(SYNC_HISTORY_MINIMAL_COLUMNS)
        .in("status", COMMITTED_SYNC_STATUSES)
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);

    return {
      latestRun: (!minLatest.error && minLatest.data?.[0] ? (minLatest.data[0] as SyncRunRecord) : null),
      lastCommitted: (!minCommitted.error && minCommitted.data?.[0] ? (minCommitted.data[0] as SyncRunRecord) : null),
    };
  } catch {
    return { latestRun: null, lastCommitted: null };
  }
}

async function queryAdAccountsFreshness(): Promise<SyncAccountRecord[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("ad_accounts")
      .select("id, name, last_sync, status, platform")
      .order("name");
    if (error || !Array.isArray(data)) return [];
    return data as SyncAccountRecord[];
  } catch {
    return [];
  }
}

/**
 * Busca conjunta e protegida por guarda monotônica de:
 * - último sync_history (qualquer status, incluindo running/error/partial_success)
 * - último snapshot efetivamente concluído (`success` | `partial_success` | `partial` | `completed`)
 * - timestamps individuais de `ad_accounts`
 */
export async function refreshSharedSyncTelemetry(force: boolean = false): Promise<SharedTelemetryState> {
  const now = Date.now();
  if (!force && inFlightTelemetryPromise) {
    return inFlightTelemetryPromise;
  }
  if (!force && sharedTelemetry.fetchedAtMs > 0 && now - sharedTelemetry.fetchedAtMs < 4000) {
    return sharedTelemetry;
  }

  const reqSeq = ++telemetryRequestSeq;
  inFlightTelemetryPromise = (async () => {
    try {
      const [{ latestRun, lastCommitted }, accounts] = await Promise.all([
        queryLatestSyncHistoryRows(),
        queryAdAccountsFreshness(),
      ]);

      // Guarda monotônica anti-race: ignora resposta obsoleta se outra mais nova já concluiu
      if (reqSeq < telemetryRequestSeq) {
        return sharedTelemetry;
      }

      const prevCommittedId = sharedTelemetry.lastCommittedRun?.id || null;
      const remoteActiveNow = isSyncJobActivelyRunning(latestRun, Date.now());

      sharedTelemetry = {
        latestSyncRun: latestRun,
        lastCommittedRun: lastCommitted,
        accounts,
        fetchedAtMs: Date.now(),
      };

      // Atualiza snapshot ativo global sempre que houver snapshot mais novo confirmado no banco
      if (lastCommitted?.id && lastCommitted.completed_at) {
        const cur = getActiveMetaSnapshot();
        const curMs = normalizeTimestampToEpochMs(cur.committedAt) ?? 0;
        const nextMs = normalizeTimestampToEpochMs(lastCommitted.completed_at) ?? 0;
        if (cur.snapshotId === "initial" || nextMs > curMs || (nextMs === curMs && cur.snapshotId !== lastCommitted.id)) {
          publishActiveMetaSnapshot({
            snapshotId: String(lastCommitted.id),
            committedAt: String(lastCommitted.completed_at),
            tenantId: cur.tenantId || "default-tenant",
            source: "sync_history",
          });
        }
      }

      // Detecta transição de execução remota -> concluído (cron ou outro cliente) e atualiza queries
      const finishedRemoteRun =
        wasRemoteJobActive &&
        !remoteActiveNow &&
        lastCommitted?.id &&
        lastCommitted.id !== prevCommittedId &&
        lastCommitted.id !== lastInvalidatedRunId;

      wasRemoteJobActive = remoteActiveNow;
      if (finishedRemoteRun && registeredQueryClient && lastCommitted?.id) {
        lastInvalidatedRunId = lastCommitted.id;
        await invalidateMetaSnapshotConsumers({
          queryClient: registeredQueryClient,
          snapshotId: lastCommitted.id,
          committedAt: lastCommitted.completed_at || "",
        });
      }

      notifyTelemetryListeners();
      return sharedTelemetry;
    } finally {
      inFlightTelemetryPromise = null;
    }
  })();

  return inFlightTelemetryPromise;
}

let registeredQueryClient: QueryClient | null = null;
export function registerSyncQueryClient(qc: QueryClient) {
  registeredQueryClient = qc;
}

function scheduleTelemetryPoll() {
  if (typeof window === "undefined") return;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (telemetryListeners.size === 0) return;

  const localLock = readValidatedLocalSyncStatus();
  const remoteActive = isSyncJobActivelyRunning(sharedTelemetry.latestSyncRun);
  const nextDelayMs = localLock.isSyncing || remoteActive ? 5_000 : 30_000;

  pollTimer = setTimeout(async () => {
    await refreshSharedSyncTelemetry(true);
    scheduleTelemetryPoll();
  }, nextDelayMs);
}

function bindSharedEvents() {
  if (typeof window === "undefined" || sharedEventsBound) return;
  sharedEventsBound = true;

  const onSyncChanged = () => {
    notifyTelemetryListeners();
    scheduleTelemetryPoll();
  };

  window.addEventListener(META_SNAPSHOT_EVENT, onSyncChanged as EventListener);
  window.addEventListener(SYNC_STATUS_EVENT, onSyncChanged as EventListener);
  window.addEventListener("storage", (ev) => {
    if (ev.key === SNAPSHOT_STORAGE_KEY || ev.key === SYNC_STATUS_STORAGE_KEY) {
      if (ev.key === SNAPSHOT_STORAGE_KEY) {
        inMemorySnapshot = null;
      }
      notifyTelemetryListeners();
    }
  });
}

/**
 * Consulta o último snapshot efetivamente persistido no banco (`sync_history` com
 * suporte a `success` e `partial_success`, e fallback seguro para `ad_accounts.last_sync`).
 * Nunca inventa `new Date().toISOString()` quando não há timestamp válido.
 */
export async function fetchLatestCommittedSnapshot(options: {
  tenantId?: string | null;
  accountId?: string | null;
  fallbackSnapshotId?: string | null;
} = {}): Promise<ActiveMetaSnapshotInfo> {
  const tenantId = options.tenantId || "default-tenant";
  const accountId = options.accountId && options.accountId !== "all" ? options.accountId : null;

  const telemetry = await refreshSharedSyncTelemetry(true);
  const lastCommitted = telemetry.lastCommittedRun;

  if (accountId) {
    const matchedAcc = telemetry.accounts.find((a) => a.id === accountId);
    const accLastSyncMs = normalizeTimestampToEpochMs(matchedAcc?.last_sync);
    if (matchedAcc && accLastSyncMs !== null && matchedAcc.last_sync) {
      return {
        snapshotId: String(lastCommitted?.id || options.fallbackSnapshotId || `snap_${accLastSyncMs}`),
        committedAt: String(matchedAcc.last_sync),
        tenantId,
        accountId,
        source: "ad_accounts",
      };
    }
    // Se conta filtrada nunca sincronizou ou falhou permissão, retorna committedAt vazio (Horário indisponível)
    return {
      snapshotId: String(lastCommitted?.id || options.fallbackSnapshotId || "initial"),
      committedAt: "",
      tenantId,
      accountId,
      source: "account_unavailable",
    };
  }

  if (lastCommitted?.id) {
    const committedTs =
      normalizeTimestampToEpochMs(lastCommitted.completed_at) !== null
        ? String(lastCommitted.completed_at)
        : "";
    return {
      snapshotId: String(lastCommitted.id),
      committedAt: committedTs,
      tenantId,
      accountId: null,
      source: "sync_history",
    };
  }

  // Fallback para `ad_accounts.last_sync` mais recente somente se sync_history não retornou
  let bestAccTs: string | null = null;
  let bestAccMs = -1;
  for (const acc of telemetry.accounts) {
    const ms = normalizeTimestampToEpochMs(acc.last_sync);
    if (ms !== null && ms > bestAccMs) {
      bestAccMs = ms;
      bestAccTs = String(acc.last_sync);
    }
  }
  if (bestAccTs && bestAccMs > 0) {
    return {
      snapshotId: String(options.fallbackSnapshotId || `snap_${bestAccMs}`),
      committedAt: bestAccTs,
      tenantId,
      accountId: null,
      source: "ad_accounts",
    };
  }

  const current = getActiveMetaSnapshot();
  return {
    snapshotId: options.fallbackSnapshotId || current.snapshotId || "initial",
    committedAt: current.committedAt || "",
    tenantId,
    accountId: null,
    source: "fallback",
  };
}

function buildActiveSnapshotView(options: { tenantId?: string | null; accountId?: string | null }): ActiveMetaSnapshotInfo {
  const stored = getActiveMetaSnapshot();
  const accountId = options.accountId && options.accountId !== "all" ? options.accountId : null;
  const lastCommitted = sharedTelemetry.lastCommittedRun;
  const latestRun = sharedTelemetry.latestSyncRun;
  const localLock = readValidatedLocalSyncStatus();
  const remoteActive = isSyncJobActivelyRunning(latestRun);
  const isMetaSyncRunning = Boolean(localLock.isSyncing || remoteActive);

  const matchedAcc = accountId
    ? sharedTelemetry.accounts.find((a) => a.id === accountId) || null
    : null;
  const accountLastSyncAt = matchedAcc?.last_sync && normalizeTimestampToEpochMs(matchedAcc.last_sync) !== null
    ? String(matchedAcc.last_sync)
    : null;

  const resolvedSnapshotId = String(lastCommitted?.id || stored.snapshotId || "initial");
  const resolvedCommittedAt = accountId
    ? (accountLastSyncAt || "")
    : (lastCommitted?.completed_at && normalizeTimestampToEpochMs(lastCommitted.completed_at) !== null
        ? String(lastCommitted.completed_at)
        : stored.committedAt || "");

  return {
    ...stored,
    snapshotId: resolvedSnapshotId,
    committedAt: resolvedCommittedAt,
    tenantId: options.tenantId || stored.tenantId || "default-tenant",
    accountId,
    startedAt: isMetaSyncRunning
      ? (localLock.startedAt || (remoteActive ? latestRun?.started_at : null) || null)
      : (latestRun?.started_at || null),
    latestSyncRun: latestRun,
    accounts: sharedTelemetry.accounts,
    accountLastSyncAt,
    isMetaSyncRunning,
  };
}

/**
 * Hook reativo compartilhado por todas as telas consumidoras de snapshot Meta.
 * Retorna o snapshot efetivamente comprometido, estado real do job (com lock TTL),
 * e timestamps individuais de contas.
 */
export function useActiveMetaSnapshot(options: { tenantId?: string | null; accountId?: string | null } = {}) {
  const [snapshot, setSnapshot] = useState<ActiveMetaSnapshotInfo>(() =>
    buildActiveSnapshotView(options)
  );

  useEffect(() => {
    bindSharedEvents();
    let cancelled = false;

    const syncView = () => {
      if (!cancelled) {
        setSnapshot(buildActiveSnapshotView(options));
      }
    };

    telemetryListeners.add(syncView);
    syncView();
    refreshSharedSyncTelemetry(false).then(() => {
      syncView();
      scheduleTelemetryPoll();
    });

    return () => {
      cancelled = true;
      telemetryListeners.delete(syncView);
      if (telemetryListeners.size === 0 && pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
      }
    };
  }, [options.tenantId, options.accountId]);

  return snapshot;
}

export interface InvalidateMetaSnapshotConsumersArgs {
  queryClient?: QueryClient;
  tenantId?: string | null;
  accountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  snapshotId?: string | null;
  committedAt?: string | null;
  refetchActive?: boolean;
}

export function isMatchingMetaConsumerQuery(
  query: Query,
  scope: { tenantId?: string | null; accountId?: string | null; dateFrom?: string | null; dateTo?: string | null }
): boolean {
  return isMatchingMetaConsumerKey(query.queryKey as readonly unknown[], scope);
}

/**
 * Invalidação centralizada pós-commit de snapshot Meta:
 * 1. Confirma o snapshot persistido final
 * 2. Cancela queries em voo anteriores (anti-race)
 * 3. Publica o novo snapshotId (dispara atualização das chaves e listeners)
 * 4. Invalida e refaz as queries ativas relacionadas em todas as telas
 */
export async function invalidateMetaSnapshotConsumers(
  args: InvalidateMetaSnapshotConsumersArgs
): Promise<ActiveMetaSnapshotInfo> {
  const confirmed = args.snapshotId
    ? publishActiveMetaSnapshot({
        snapshotId: args.snapshotId,
        committedAt: args.committedAt || "",
        tenantId: args.tenantId || "default-tenant",
        accountId: args.accountId ?? null,
        dateFrom: args.dateFrom ?? null,
        dateTo: args.dateTo ?? null,
        source: "sync_commit",
      })
    : publishActiveMetaSnapshot(
        await fetchLatestCommittedSnapshot({
          tenantId: args.tenantId,
          accountId: args.accountId,
        })
      );

  if (args.queryClient) {
    const scope = {
      tenantId: confirmed.tenantId,
      accountId: args.accountId,
      dateFrom: args.dateFrom,
      dateTo: args.dateTo,
    };
    const predicate = (q: Query) => isMatchingMetaConsumerQuery(q, scope);
    await args.queryClient.cancelQueries({ predicate });
    await args.queryClient.invalidateQueries({ predicate, refetchType: args.refetchActive === false ? "none" : "active" });
    await args.queryClient.invalidateQueries({ queryKey: ["last-sync-date"] });
    await args.queryClient.invalidateQueries({ queryKey: ["dashboard-latest-sync-run"] });
    await args.queryClient.invalidateQueries({ queryKey: ["mc-latest-sync-run"] });
    await args.queryClient.invalidateQueries({ queryKey: ["reports-latest-sync-run"] });
    await args.queryClient.invalidateQueries({ queryKey: ["sync_history"] });
  }

  return confirmed;
}

export function formatSnapshotTimestampBR(iso: string | null | undefined): string {
  return formatSyncTimestampBRT(iso);
}

export function formatShortSnapshotId(snapshotId: string | null | undefined): string {
  return formatShortIdFromDomain(snapshotId);
}
