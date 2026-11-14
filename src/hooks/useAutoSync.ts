// src/hooks/useAutoSync.ts
// NC Performance Suite — Coordenador de Sincronização Automática & Manual
// Separa cooldown de execução no navegador do timestamp real do snapshot comprometido,
// suporta heartbeat, recuperação de locks zumbis e polling limitado pós-disparo.

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { ensureDatabaseCalibrated } from "@/lib/metaConversionCalibrator";
import {
  fetchLatestCommittedSnapshot,
  invalidateMetaSnapshotConsumers,
  refreshSharedSyncTelemetry,
  registerSyncQueryClient,
} from "@/lib/metaSnapshotCache";
import {
  DEFAULT_LOCAL_SYNC_LOCK_TTL_MS,
  SYNC_LAST_CYCLE_STORAGE_KEY,
  SYNC_STATUS_EVENT,
  SYNC_STATUS_STORAGE_KEY,
  isFailedSyncStatus,
  isLocalSyncLockActive,
  isSyncJobActivelyRunning,
  isTerminalCommittedSyncStatus,
  normalizeTimestampToEpochMs,
  type SyncRunRecord,
} from "@/lib/syncStatusDomain";

const REALTIME_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos alinhado ao pg_cron
const DB_FRESH_COOLDOWN_MS = 180 * 1000;          // 3 minutos de cooldown entre execuções no banco
const META_INVOKE_TIMEOUT_MS = 160 * 1000;        // >115s típicos de 19 contas na Meta Graph API
const AUX_INVOKE_TIMEOUT_MS = 90 * 1000;
const HEARTBEAT_TICK_MS = 20 * 1000;
const POLL_INTERVAL_MS = 5 * 1000;
const MAX_POLL_ATTEMPTS = 36;                     // 36 * 5s = 180s máximo

export type SyncStatus = {
  lastSync: string | null;    // ISO timestamp do snapshot efetivamente concluído
  nextSync: string | null;    // ISO timestamp da próxima checagem
  isSyncing: boolean;
  startedAt?: string | null;  // ISO timestamp de início para expirar locks órfãos
  heartbeatAt?: string | null;
  lastResult: "success" | "error" | "partial" | null;
  lastError?: string | null;
};

export { SYNC_STATUS_EVENT };

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${Math.round(ms / 1000)}s) em ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function sleepAbortable(ms: number, isCancelled: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    if (isCancelled()) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    const check = setInterval(() => {
      if (isCancelled()) {
        clearTimeout(timer);
        clearInterval(check);
        resolve();
      }
    }, 500);
    setTimeout(() => clearInterval(check), ms + 50);
  });
}

function dispatchSyncStatus(status: Partial<SyncStatus>) {
  try {
    const current = getSyncStatus();
    const updated: SyncStatus = { ...current, ...status };
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(updated));
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: updated }));
    }
  } catch {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status }));
    }
  }
}

export function getSyncStatus(): SyncStatus {
  const empty: SyncStatus = {
    lastSync: null,
    nextSync: null,
    isSyncing: false,
    startedAt: null,
    heartbeatAt: null,
    lastResult: null,
    lastError: null,
  };
  if (typeof window === "undefined" || typeof localStorage === "undefined") return empty;
  try {
    const stored = localStorage.getItem(SYNC_STATUS_STORAGE_KEY);
    if (!stored) return empty;
    const parsed: SyncStatus = JSON.parse(stored);
    if (parsed.isSyncing) {
      if (!isLocalSyncLockActive(parsed, Date.now(), DEFAULT_LOCAL_SYNC_LOCK_TTL_MS)) {
        const recovered: SyncStatus = {
          ...parsed,
          isSyncing: false,
          startedAt: null,
          heartbeatAt: null,
          lastError: parsed.lastError || "Lock anterior expirado sem heartbeat",
        };
        localStorage.setItem(SYNC_STATUS_STORAGE_KEY, JSON.stringify(recovered));
        return recovered;
      }
    }
    return parsed;
  } catch {
    return empty;
  }
}

function getLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function pollRemoteSyncUntilTerminal(
  targetSyncId: string | null,
  isCancelled: () => boolean,
  onTick?: () => void
): Promise<SyncRunRecord | null> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (isCancelled()) return null;
    await sleepAbortable(POLL_INTERVAL_MS, isCancelled);
    if (isCancelled()) return null;

    onTick?.();

    try {
      let query = (supabase as any)
        .from("sync_history")
        .select("id, status, started_at, completed_at, accounts_synced, partial_failures, error_message");
      if (targetSyncId) {
        query = query.eq("id", targetSyncId);
      } else {
        query = query.order("started_at", { ascending: false }).limit(1);
      }
      const { data, error } = await query;
      if (error || !Array.isArray(data) || data.length === 0) continue;

      const row = data[0] as SyncRunRecord;
      if (isTerminalCommittedSyncStatus(row.status) || isFailedSyncStatus(row.status)) {
        return row;
      }
      if (!isSyncJobActivelyRunning(row, Date.now())) {
        // Job remoto expirou sem completar
        return {
          ...row,
          status: "timeout",
          error_message: row.error_message || "Execução remota expirada sem heartbeat",
        };
      }
    } catch {
      // ignora falha transitória de rede durante polling e tenta próximo ciclo
    }
  }
  return null;
}

export function useAutoSync() {
  const qc = useQueryClient();
  const isSyncingRef = useRef(false);
  const syncSeqRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const unmountedRef = useRef(false);

  useEffect(() => {
    registerSyncQueryClient(qc);
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, [qc]);

  const runSync = useCallback(async (triggeredBy: "auto" | "manual" = "auto") => {
    if (isSyncingRef.current) {
      return;
    }

    const mySeq = ++syncSeqRef.current;
    const isStaleRun = () => unmountedRef.current || mySeq !== syncSeqRef.current;
    const nowIso = new Date().toISOString();
    isSyncingRef.current = true;
    dispatchSyncStatus({
      isSyncing: true,
      startedAt: nowIso,
      heartbeatAt: nowIso,
      lastError: null,
    });

    const heartbeatTimer = setInterval(() => {
      if (isStaleRun()) return;
      dispatchSyncStatus({ heartbeatAt: new Date().toISOString() });
    }, HEARTBEAT_TICK_MS);

    try {
      // ── SYNC INCREMENTAL D-1 + D0 ───────────────────────────────────────────
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const timeRange = {
        since: getLocalDateString(yesterday),
        until: getLocalDateString(today),
      };

      if (triggeredBy === "auto") {
        const { data: recentRows } = await (supabase as any)
          .from("sync_history")
          .select("id, status, started_at, completed_at, accounts_synced, partial_failures, error_message")
          .order("started_at", { ascending: false })
          .limit(1);

        const recentSync = (recentRows?.[0] as SyncRunRecord | undefined) || null;
        if (recentSync) {
          const completedMs = normalizeTimestampToEpochMs(recentSync.completed_at) ?? 0;
          const nowMs = Date.now();
          const remoteRunning = isSyncJobActivelyRunning(recentSync, nowMs);
          const isCompletedFresh =
            isTerminalCommittedSyncStatus(recentSync.status) &&
            completedMs > 0 &&
            nowMs - completedMs < DB_FRESH_COOLDOWN_MS;

          if (remoteRunning) {
            // Acompanha execução ativa no backend sem disparar duplicata e sem liberar premature "success"
            const settled = await pollRemoteSyncUntilTerminal(
              recentSync.id,
              isStaleRun,
              () => dispatchSyncStatus({ heartbeatAt: new Date().toISOString() })
            );
            if (isStaleRun()) return;

            const confirmedSnapshot = await fetchLatestCommittedSnapshot({
              fallbackSnapshotId: settled && isTerminalCommittedSyncStatus(settled.status) ? settled.id : undefined,
            });
            const cycleDoneIso = new Date().toISOString();
            if (typeof localStorage !== "undefined") {
              localStorage.setItem(SYNC_LAST_CYCLE_STORAGE_KEY, cycleDoneIso);
            }

            const resultKind: SyncStatus["lastResult"] = settled
              ? isFailedSyncStatus(settled.status)
                ? "error"
                : settled.status === "partial_success" || settled.status === "partial" || (Array.isArray(settled.partial_failures) && settled.partial_failures.length > 0)
                  ? "partial"
                  : "success"
              : "partial";

            dispatchSyncStatus({
              isSyncing: false,
              startedAt: null,
              heartbeatAt: null,
              lastSync: confirmedSnapshot.committedAt || null,
              nextSync: new Date(Date.now() + REALTIME_SYNC_INTERVAL_MS).toISOString(),
              lastResult: resultKind,
              lastError: settled?.error_message || null,
            });
            await invalidateMetaSnapshotConsumers({
              queryClient: qc,
              accountId: "all",
              dateFrom: timeRange.since,
              dateTo: timeRange.until,
              snapshotId: confirmedSnapshot.snapshotId,
              committedAt: confirmedSnapshot.committedAt,
            });
            return;
          }

          if (isCompletedFresh) {
            const confirmedSnapshot = await fetchLatestCommittedSnapshot({ fallbackSnapshotId: recentSync.id });
            const cycleDoneIso = new Date().toISOString();
            if (typeof localStorage !== "undefined") {
              localStorage.setItem(SYNC_LAST_CYCLE_STORAGE_KEY, cycleDoneIso);
            }
            const isPartial =
              recentSync.status === "partial_success" ||
              recentSync.status === "partial" ||
              (Array.isArray(recentSync.partial_failures) && recentSync.partial_failures.length > 0);
            dispatchSyncStatus({
              isSyncing: false,
              startedAt: null,
              heartbeatAt: null,
              lastSync: confirmedSnapshot.committedAt || recentSync.completed_at || null,
              nextSync: new Date(nowMs + REALTIME_SYNC_INTERVAL_MS).toISOString(),
              lastResult: isPartial ? "partial" : "success",
              lastError: recentSync.error_message || null,
            });
            await invalidateMetaSnapshotConsumers({
              queryClient: qc,
              accountId: "all",
              dateFrom: timeRange.since,
              dateTo: timeRange.until,
              snapshotId: confirmedSnapshot.snapshotId,
              committedAt: confirmedSnapshot.committedAt,
            });
            return;
          }
        }
      }

      const syncResults = await Promise.allSettled([
        withTimeout(
          supabase.functions.invoke("sync-meta-ads", {
            body: {
              triggered_by: triggeredBy,
              sync_mode: triggeredBy === "manual" ? "full" : "incremental",
              time_range: timeRange,
            },
          }),
          META_INVOKE_TIMEOUT_MS,
          "sync-meta-ads"
        ),
        withTimeout(
          supabase.functions.invoke("sync-google-ads", { body: { triggered_by: triggeredBy, time_range: timeRange } }),
          AUX_INVOKE_TIMEOUT_MS,
          "sync-google-ads"
        ),
        withTimeout(
          supabase.functions.invoke("get-meta-billing", { body: {} }),
          AUX_INVOKE_TIMEOUT_MS,
          "get-meta-billing"
        ),
        ...(triggeredBy === "manual"
          ? [
              withTimeout(
                supabase.functions.invoke("sync-social-media", { body: { action: "sync-metrics" } }),
                AUX_INVOKE_TIMEOUT_MS,
                "sync-social-media"
              ),
            ]
          : []),
      ]);

      if (isStaleRun()) return;

      const metaFulfilled = syncResults[0]?.status === "fulfilled" ? syncResults[0].value : null;
      let metaData: any = metaFulfilled?.data || null;
      const metaInvokeErr =
        syncResults[0]?.status === "rejected"
          ? syncResults[0].reason
          : metaFulfilled?.error || null;

      // Se a edge function retornou skipped_active_sync, acompanha o job ativo até terminar
      if (metaData?.status === "skipped_active_sync" && metaData?.active_sync_id) {
        const settled = await pollRemoteSyncUntilTerminal(
          metaData.active_sync_id,
          isStaleRun,
          () => dispatchSyncStatus({ heartbeatAt: new Date().toISOString() })
        );
        if (isStaleRun()) return;
        if (settled) {
          metaData = {
            ...metaData,
            status: settled.status,
            partial_failures: settled.partial_failures || [],
            error: settled.error_message || null,
          };
        }
      }

      const failures = syncResults.filter(
        (r) => r.status === "rejected" || (r.status === "fulfilled" && r.value.error)
      );
      if (failures.length === syncResults.length) {
        throw new Error(metaInvokeErr?.message || "Todos os serviços de sincronização falharam.");
      }

      if (typeof window === "undefined" || !window.location.pathname.includes("/social-insights")) {
        try {
          await withTimeout(ensureDatabaseCalibrated(supabase, false), 15_000, "calibrate-db");
        } catch (calibErr) {
          console.warn("[AUTO-SYNC] Calibração ignorada:", calibErr);
        }
      }

      try {
        await withTimeout(supabase.functions.invoke("run-automations", { body: {} }), 30_000, "run-automations");
      } catch (autoErr) {
        console.warn("[AUTO-SYNC] Automações ignoradas:", autoErr);
      }

      if (isStaleRun()) return;

      const confirmedSnapshot = await fetchLatestCommittedSnapshot({
        fallbackSnapshotId: metaData?.sync_id || undefined,
      });

      const cycleDoneIso = new Date().toISOString();
      if (typeof localStorage !== "undefined") {
        // Armazena quando o ciclo de sync terminou (para cooldown de 5m), NUNCA um timestamp antigo de snapshot!
        localStorage.setItem(SYNC_LAST_CYCLE_STORAGE_KEY, cycleDoneIso);
      }

      const metaFailed = Boolean(metaInvokeErr) || isFailedSyncStatus(metaData?.status);
      const hasMetaPartial =
        metaData?.status === "partial_success" ||
        metaData?.status === "partial" ||
        (Array.isArray(metaData?.partial_failures) && metaData.partial_failures.length > 0);

      const lastResult: SyncStatus["lastResult"] =
        metaFailed && failures.length === syncResults.length
          ? "error"
          : metaFailed || hasMetaPartial || failures.length > 0
            ? "partial"
            : "success";

      const nextSync = new Date(Date.now() + REALTIME_SYNC_INTERVAL_MS).toISOString();
      dispatchSyncStatus({
        isSyncing: false,
        startedAt: null,
        heartbeatAt: null,
        lastSync: confirmedSnapshot.committedAt || null,
        nextSync,
        lastResult,
        lastError: metaInvokeErr?.message || metaData?.error || null,
      });

      await invalidateMetaSnapshotConsumers({
        queryClient: qc,
        accountId: "all",
        dateFrom: timeRange.since,
        dateTo: timeRange.until,
        snapshotId: confirmedSnapshot.snapshotId,
        committedAt: confirmedSnapshot.committedAt,
      });
    } catch (error: any) {
      if (!isStaleRun()) {
        if (typeof localStorage !== "undefined") {
          localStorage.setItem(SYNC_LAST_CYCLE_STORAGE_KEY, new Date().toISOString());
        }
        dispatchSyncStatus({
          isSyncing: false,
          startedAt: null,
          heartbeatAt: null,
          lastResult: "error",
          lastError: error?.message || "Falha na sincronização",
        });
      }
    } finally {
      clearInterval(heartbeatTimer);
      if (mySeq === syncSeqRef.current) {
        isSyncingRef.current = false;
        const cur = getSyncStatus();
        if (cur.isSyncing) {
          dispatchSyncStatus({ isSyncing: false, startedAt: null, heartbeatAt: null });
        }
        refreshSharedSyncTelemetry(true).catch(() => {});
      }
    }
  }, [qc]);

  useEffect(() => {
    const checkAndSync = () => {
      if (
        typeof window !== "undefined" &&
        window.location.pathname.includes("/social-insights") &&
        (window as any).__ncSocialInsightsLoading === true
      ) {
        return;
      }

      const lastCycleStr =
        typeof localStorage !== "undefined" ? localStorage.getItem(SYNC_LAST_CYCLE_STORAGE_KEY) : null;
      const lastCycleMs = normalizeTimestampToEpochMs(lastCycleStr) ?? 0;
      const elapsed = lastCycleMs > 0 ? Date.now() - lastCycleMs : REALTIME_SYNC_INTERVAL_MS;

      if (elapsed >= REALTIME_SYNC_INTERVAL_MS) {
        runSync("auto");
      } else {
        const remaining = REALTIME_SYNC_INTERVAL_MS - elapsed;
        const current = getSyncStatus();
        dispatchSyncStatus({
          lastSync: current.lastSync,
          nextSync: new Date(Date.now() + remaining).toISOString(),
          isSyncing: isSyncingRef.current,
          lastResult: current.lastResult,
        });
      }
    };

    const isSocialRoute =
      typeof window !== "undefined" && window.location.pathname.includes("/social-insights");
    const initialTimer = setTimeout(checkAndSync, isSocialRoute ? 25_000 : 8_000);

    intervalRef.current = setInterval(checkAndSync, 30 * 1000);

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkAndSync();
      }
    };
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [runSync]);

  return { runSync };
}

export function useAutoSyncStatus(): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>(() => getSyncStatus());

  useEffect(() => {
    const refreshFromStore = (detail?: Partial<SyncStatus>) => {
      const validated = getSyncStatus();
      setStatus(detail ? { ...validated, ...detail, isSyncing: detail.isSyncing ?? validated.isSyncing } : validated);
    };

    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<Partial<SyncStatus>>)?.detail;
      refreshFromStore(detail);
    };

    const onStorage = (ev: StorageEvent) => {
      if (ev.key === SYNC_STATUS_STORAGE_KEY) {
        refreshFromStore();
      }
    };

    window.addEventListener(SYNC_STATUS_EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);

    // Se um lock ativo estiver em andamento, revalida TTL a cada 10s para liberar caso expire/trave
    let lockWatchTimer: ReturnType<typeof setInterval> | null = null;
    if (status.isSyncing) {
      lockWatchTimer = setInterval(() => {
        const current = getSyncStatus();
        if (!current.isSyncing) {
          setStatus(current);
        }
      }, 10_000);
    }

    return () => {
      window.removeEventListener(SYNC_STATUS_EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
      if (lockWatchTimer) clearInterval(lockWatchTimer);
    };
  }, [status.isSyncing]);

  return status;
}
