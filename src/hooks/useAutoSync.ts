// src/hooks/useAutoSync.ts
// NC Performance Suite — Worker de Sincronização Automática a cada 3 minutos (D-1+D0, todos os níveis)

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";

const REALTIME_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
const STORAGE_REALTIME_KEY = "nc_last_realtime_sync";
const STORAGE_SYNC_STATUS = "nc_auto_sync_status";

export type SyncStatus = {
  lastSync: string | null;   // ISO timestamp
  nextSync: string | null;   // ISO timestamp
  isSyncing: boolean;
  lastResult: "success" | "error" | "partial" | null;
};

export const SYNC_STATUS_EVENT = "nc_sync_status_changed";

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
  try {
    const stored = localStorage.getItem(STORAGE_SYNC_STATUS);
    return stored ? JSON.parse(stored) : {
      lastSync: null, nextSync: null, isSyncing: false, lastResult: null
    };
  } catch {
    return { lastSync: null, nextSync: null, isSyncing: false, lastResult: null };
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
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async (triggeredBy: "auto" | "manual" = "auto") => {
    if (isSyncingRef.current) {
      console.log("[AUTO-SYNC] Já está sincronizando, ignorando...");
      return;
    }

    isSyncingRef.current = true;
    dispatchSyncStatus({ isSyncing: true });

    try {
      // ── SYNC DE 3 MINUTOS: Ontem + Hoje (D-1 e D0), TODOS os níveis ─────
      // Volume pequeno = nunca dá timeout. Mantém tudo sempre atualizado.
      const today = new Date();
      const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      const timeRange = {
        since: getLocalDateString(yesterday),
        until: getLocalDateString(today)
      };

      console.log(`[AUTO-SYNC] ⚡ Iniciando Sync Unificado 3min [${triggeredBy}]: ${timeRange.since} → ${timeRange.until}`);

      // Executa todos os sincronizadores de forma concorrente em paralelo
      const syncResults = await Promise.allSettled([
        supabase.functions.invoke("sync-meta-ads", {
          body: { triggered_by: "auto", time_range: timeRange }
        }),
        supabase.functions.invoke("sync-google-ads", {
          body: { triggered_by: "auto", time_range: timeRange }
        }),
        supabase.functions.invoke("get-meta-billing", {
          body: {}
        }),
        supabase.functions.invoke("sync-social-media", {
          body: { action: "sync-metrics" }
        })
      ]);

      // Verifica se houve falha total ou se pelo menos algum sync rodou
      const failures = syncResults.filter(r => r.status === "rejected" || (r.status === "fulfilled" && r.value.error));
      if (failures.length === syncResults.length) {
        throw new Error("Todos os serviços de sincronização falharam.");
      }

      console.log(`[AUTO-SYNC] 🧠 Serviços sincronizados. Rodando motor de automações/alertas...`);

      // Executar motor de alertas após sync
      await supabase.functions.invoke("run-automations", { body: {} });

      const now = new Date().toISOString();
      localStorage.setItem(STORAGE_REALTIME_KEY, now);

      const nextSync = new Date(Date.now() + REALTIME_SYNC_INTERVAL_MS).toISOString();
      const lastResult = failures.length > 0 ? "partial" : "success";
      dispatchSyncStatus({ isSyncing: false, lastSync: now, nextSync, lastResult });

      // Atualizar toda a UI
      qc.invalidateQueries();

      console.log(`[AUTO-SYNC] ✅ Sync unificado concluído em ${now}. Status: ${lastResult}. Próximo em ${nextSync}`);

    } catch (error: any) {
      console.error("[AUTO-SYNC] ❌ Erro no sync unificado:", error.message);
      dispatchSyncStatus({ isSyncing: false, lastResult: "error" });
    } finally {
      isSyncingRef.current = false;
    }
  }, [qc]);

  useEffect(() => {
    const checkAndSync = () => {
      const lastRealtimeSyncStr = localStorage.getItem(STORAGE_REALTIME_KEY);
      const lastRealtimeSync = lastRealtimeSyncStr ? new Date(lastRealtimeSyncStr).getTime() : 0;
      const elapsed = Date.now() - lastRealtimeSync;

      if (elapsed >= REALTIME_SYNC_INTERVAL_MS) {
        console.log(`[AUTO-SYNC] ${Math.floor(elapsed / 60000)}min desde último sync. Executando...`);
        runSync("auto");
      } else {
        const remaining = REALTIME_SYNC_INTERVAL_MS - elapsed;
        dispatchSyncStatus({
          lastSync: lastRealtimeSyncStr,
          nextSync: new Date(Date.now() + remaining).toISOString(),
          isSyncing: false,
          lastResult: getSyncStatus().lastResult
        });
      }
    };

    // Verificar imediatamente ao montar
    checkAndSync();

    // Checar a cada 30 segundos se já passou os 3 minutos
    intervalRef.current = setInterval(checkAndSync, 30 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runSync]);

  return { runSync };
}
