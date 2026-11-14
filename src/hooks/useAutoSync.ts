// src/hooks/useAutoSync.ts
// NC Performance Suite — Worker de Sincronização Automática Contínua (3 minutos)
// Sincroniza em tempo real Meta Ads, Google Ads e Métricas Sociais a cada 3 minutos,
// garantindo paridade imediata de 100% com o Gerenciador de Anúncios.

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { ensureDatabaseCalibrated, calibrateMetaConversionsFromGraph } from "@/lib/metaConversionCalibrator";

const REALTIME_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos rigorosos em tempo real
const STALE_SYNC_LOCK_MS = 120 * 1000; // Libera lock preso em localStorage após 120s
const INVOKE_TIMEOUT_MS = 90 * 1000; // Timeout defensivo por Edge Function
const STORAGE_REALTIME_KEY = "nc_last_realtime_sync";
const STORAGE_SYNC_STATUS = "nc_auto_sync_status";

export type SyncStatus = {
  lastSync: string | null;   // ISO timestamp
  nextSync: string | null;   // ISO timestamp
  isSyncing: boolean;
  startedAt?: string | null; // ISO timestamp para expirar locks órfãos
  lastResult: "success" | "error" | "partial" | null;
};

export const SYNC_STATUS_EVENT = "nc_sync_status_changed";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout (${Math.round(ms / 1000)}s) em ${label}`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

function dispatchSyncStatus(status: Partial<SyncStatus>) {
  try {
    const current = getSyncStatus();
    const updated = { ...current, ...status };
    localStorage.setItem(STORAGE_SYNC_STATUS, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: updated }));
  } catch {
    // localStorage indisponível — dispara apenas o evento
    window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: status }));
  }
}

export function getSyncStatus(): SyncStatus {
  const empty: SyncStatus = { lastSync: null, nextSync: null, isSyncing: false, startedAt: null, lastResult: null };
  try {
    const stored = localStorage.getItem(STORAGE_SYNC_STATUS);
    if (!stored) return empty;
    const parsed: SyncStatus = JSON.parse(stored);
    if (parsed.isSyncing) {
      const startedMs = parsed.startedAt ? new Date(parsed.startedAt).getTime() : 0;
      if (!startedMs || Number.isNaN(startedMs) || Date.now() - startedMs > STALE_SYNC_LOCK_MS) {
        const recovered: SyncStatus = { ...parsed, isSyncing: false, startedAt: null };
        localStorage.setItem(STORAGE_SYNC_STATUS, JSON.stringify(recovered));
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

export function useAutoSync() {
  const qc = useQueryClient();
  const isSyncingRef = useRef(false);
  const syncSeqRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async (triggeredBy: "auto" | "manual" = "auto") => {
    if (isSyncingRef.current) {
      console.log("[AUTO-SYNC] Já está sincronizando em andamento, ignorando nova chamada...");
      return;
    }

    const mySeq = ++syncSeqRef.current;
    isSyncingRef.current = true;
    dispatchSyncStatus({ isSyncing: true, startedAt: new Date().toISOString() });

    try {
      // ── SYNC DE 3 MINUTOS: Ontem + Hoje (D-1 e D0), TODOS os níveis ─────
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const timeRange = {
        since: getLocalDateString(yesterday),
        until: getLocalDateString(today)
      };

      console.log(`[AUTO-SYNC] ⚡ Iniciando Sync Unificado 3min [${triggeredBy}]: ${timeRange.since} → ${timeRange.until}`);

      // Executa todos os sincronizadores oficiais em paralelo com timeout defensivo
      const syncResults = await Promise.allSettled([
        withTimeout(
          supabase.functions.invoke("sync-meta-ads", { body: { triggered_by: "auto", time_range: timeRange } }),
          INVOKE_TIMEOUT_MS,
          "sync-meta-ads"
        ),
        withTimeout(
          supabase.functions.invoke("sync-google-ads", { body: { triggered_by: "auto", time_range: timeRange } }),
          INVOKE_TIMEOUT_MS,
          "sync-google-ads"
        ),
        withTimeout(
          supabase.functions.invoke("get-meta-billing", { body: {} }),
          INVOKE_TIMEOUT_MS,
          "get-meta-billing"
        ),
        withTimeout(
          supabase.functions.invoke("sync-social-media", { body: { action: "sync-metrics" } }),
          INVOKE_TIMEOUT_MS,
          "sync-social-media"
        )
      ]);

      // Evita sobrescrever estado mais novo em caso de resposta atrasada
      if (mySeq !== syncSeqRef.current) return;

      // Verifica se houve falha total
      const failures = syncResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));
      if (failures.length === syncResults.length) {
        throw new Error("Todos os serviços de sincronização falharam.");
      }

      // Calibração em tempo real direta com Meta Graph API para D-1 e D0
      try {
        await withTimeout(calibrateMetaConversionsFromGraph(supabase, timeRange.since, timeRange.until, "all"), 30_000, "calibrate-graph");
      } catch (calibGraphErr) {
        console.warn("[AUTO-SYNC] Calibração Graph ignorada:", calibGraphErr);
      }

      // Calibração rápida de segurança no banco
      try {
        await withTimeout(ensureDatabaseCalibrated(supabase, false), 20_000, "calibrate-db");
      } catch (calibErr) {
        console.warn("[AUTO-SYNC] Calibração de segurança ignorada:", calibErr);
      }

      // Executar motor de alertas após sync
      try {
        await withTimeout(supabase.functions.invoke("run-automations", { body: {} }), 30_000, "run-automations");
      } catch (autoErr) {
        console.warn("[AUTO-SYNC] Automações ignoradas:", autoErr);
      }

      if (mySeq !== syncSeqRef.current) return;

      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_REALTIME_KEY, now);

      const nextSync = new Date(Date.now() + REALTIME_SYNC_INTERVAL_MS).toISOString();
      const lastResult = failures.length > 0 ? "partial" : "success";
      dispatchSyncStatus({ isSyncing: false, startedAt: null, lastSync: now, nextSync, lastResult });

      // Atualiza IMEDIATAMENTE toda a UI sem depender de reload manual
      qc.invalidateQueries();

      console.log(`[AUTO-SYNC] ✅ Sync unificado 3min concluído em ${now}. Status: ${lastResult}. Próximo em ${nextSync}`);

    } catch (error: any) {
      if (mySeq === syncSeqRef.current) {
        console.error("[AUTO-SYNC] ❌ Erro no sync unificado:", error?.message || error);
        dispatchSyncStatus({ isSyncing: false, startedAt: null, lastResult: "error" });
      }
    } finally {
      if (mySeq === syncSeqRef.current) {
        isSyncingRef.current = false;
      }
    }
  }, [qc]);

  useEffect(() => {
    const checkAndSync = () => {
      const lastRealtimeSyncStr = localStorage.getItem(STORAGE_REALTIME_KEY);
      const lastRealtimeSync = lastRealtimeSyncStr ? new Date(lastRealtimeSyncStr).getTime() : 0;
      const elapsed = Date.now() - lastRealtimeSync;

      if (elapsed >= REALTIME_SYNC_INTERVAL_MS) {
        console.log(`[AUTO-SYNC] ⏰ ${Math.floor(elapsed / 1000)}s desde último sync (>= 180s). Sincronizando agora...`);
        runSync("auto");
      } else {
        const remaining = REALTIME_SYNC_INTERVAL_MS - elapsed;
        dispatchSyncStatus({
          lastSync: lastRealtimeSyncStr,
          nextSync: new Date(Date.now() + remaining).toISOString(),
          isSyncing: isSyncingRef.current,
          lastResult: getSyncStatus().lastResult
        });
      }
    };

    // Verificar imediatamente ao montar
    checkAndSync();

    // Checar a cada 15 segundos se já passaram os 3 minutos
    intervalRef.current = setInterval(checkAndSync, 15 * 1000);

    // Quando o usuário alterna abas e volta para o app, verifica imediatamente
    const onVisibilityOrFocus = () => {
      if (document.visibilityState === "visible") {
        checkAndSync();
      }
    };
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
    };
  }, [runSync]);

  return { runSync };
}
