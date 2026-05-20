// src/hooks/useAutoSync.ts
// NC Performance Suite — Worker de Sincronização Automática a cada 30 minutos (Full) e 3 minutos (Realtime)

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos (Sync Completo)
const REALTIME_SYNC_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos (Sync Tempo Real - Ontem/Hoje)
const STORAGE_KEY = "nc_last_auto_sync";
const STORAGE_REALTIME_KEY = "nc_last_realtime_sync";
const STORAGE_SYNC_STATUS = "nc_auto_sync_status";

export type SyncStatus = {
  lastSync: string | null;   // ISO timestamp
  nextSync: string | null;   // ISO timestamp
  isSyncing: boolean;
  lastResult: "success" | "error" | "partial" | null;
};

// Evento customizado para notificar o app sobre mudanças no status de sync
export const SYNC_STATUS_EVENT = "nc_sync_status_changed";

function dispatchSyncStatus(status: Partial<SyncStatus>) {
  const stored = localStorage.getItem(STORAGE_SYNC_STATUS);
  const current: SyncStatus = stored ? JSON.parse(stored) : {
    lastSync: null, nextSync: null, isSyncing: false, lastResult: null
  };
  const updated = { ...current, ...status };
  localStorage.setItem(STORAGE_SYNC_STATUS, JSON.stringify(updated));
  window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: updated }));
}

export function getSyncStatus(): SyncStatus {
  const stored = localStorage.getItem(STORAGE_SYNC_STATUS);
  return stored ? JSON.parse(stored) : {
    lastSync: null, nextSync: null, isSyncing: false, lastResult: null
  };
}

// Função auxiliar para formatar a data local de forma segura no formato YYYY-MM-DD
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

  const runSync = useCallback(async (
    triggeredBy: "auto" | "manual" = "auto",
    syncScope: "full" | "realtime" = "full",
    overridePreset?: "maximum" | "last_7d"
  ) => {
    if (isSyncingRef.current) {
      console.log("[AUTO-SYNC] Já está sincronizando, ignorando...");
      return;
    }

    isSyncingRef.current = true;
    dispatchSyncStatus({ isSyncing: true });

    if (triggeredBy === "manual") {
      toast.loading("🔄 Sincronizando com Meta Ads...", { id: "manual-sync" });
    }

    try {
      let bodyPayload: any = { triggered_by: triggeredBy };
      
      if (syncScope === "realtime") {
        const today = new Date();
        
        const timeRange = {
          since: getLocalDateString(today),
          until: getLocalDateString(today)
        };
        console.log(`[AUTO-SYNC] Iniciando sync em tempo real apenas HOJE (${triggeredBy} | range: ${timeRange.since} até ${timeRange.until})...`);
        bodyPayload.time_range = timeRange;
      } else if (overridePreset || triggeredBy === "manual") {
        const preset = overridePreset || "maximum";
        console.log(`[AUTO-SYNC] Sincronização manual profunda de histórico (${triggeredBy} | preset: ${preset})...`);
        bodyPayload.date_preset = preset;
      } else {
        // Sync periódico de 30 minutos: Busca dos últimos 7 dias até ONTEM (excluindo hoje)
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(yesterday.getDate() - 7);
        
        const timeRange = {
          since: getLocalDateString(sevenDaysAgo),
          until: getLocalDateString(yesterday)
        };
        console.log(`[AUTO-SYNC] Sincronização periódica de 30 minutos (Ontem até 7 dias atrás) | range: ${timeRange.since} até ${timeRange.until}...`);
        bodyPayload.time_range = timeRange;
      }

      // 1. Sincronizar dados do Meta Ads
      const { error: syncError } = await supabase.functions.invoke("sync-meta-ads", {
        body: bodyPayload
      });

      if (syncError) throw syncError;

      // 2. Executar motor de alertas após sync
      await supabase.functions.invoke("run-automations", {
        body: {}
      });

      // 3. Registrar timestamps de sincronização
      const now = new Date().toISOString();
      if (syncScope === "full") {
        localStorage.setItem(STORAGE_KEY, now);
        // O sync completo atualiza ontem e hoje também
        localStorage.setItem(STORAGE_REALTIME_KEY, now);
      } else {
        localStorage.setItem(STORAGE_REALTIME_KEY, now);
      }

      // Calcular o próximo disparo esperado (o menor intervalo entre os dois timers)
      const lastFull = localStorage.getItem(STORAGE_KEY);
      const elapsedFull = lastFull ? Date.now() - new Date(lastFull).getTime() : 0;
      const remainingFull = Math.max(0, SYNC_INTERVAL_MS - elapsedFull);
      const remainingRealtime = REALTIME_SYNC_INTERVAL_MS;

      const nextEstimate = new Date(Date.now() + Math.min(remainingFull, remainingRealtime)).toISOString();

      dispatchSyncStatus({
        isSyncing: false,
        lastSync: now,
        nextSync: nextEstimate,
        lastResult: "success"
      });

      // 4. Invalidar todas as queries do react-query para atualizar a UI imediatamente
      qc.invalidateQueries();

      console.log(`[AUTO-SYNC] ✅ Sync (${syncScope}) concluído com sucesso em ${now}`);

      if (triggeredBy === "manual") {
        toast.success("✅ Dados sincronizados com sucesso!", { id: "manual-sync" });
      }

    } catch (error: any) {
      console.error(`[AUTO-SYNC] ❌ Erro no sync (${syncScope}):`, error.message);
      dispatchSyncStatus({
        isSyncing: false,
        lastResult: "error"
      });

      if (triggeredBy === "manual") {
        toast.error(`❌ Erro na sincronização: ${error.message}`, { id: "manual-sync" });
      }
    } finally {
      isSyncingRef.current = false;
    }
  }, [qc]);

  useEffect(() => {
    // Verificar se precisa sincronizar imediatamente
    const checkAndSync = () => {
      const now = Date.now();
      const lastFullSyncStr = localStorage.getItem(STORAGE_KEY);
      const lastRealtimeSyncStr = localStorage.getItem(STORAGE_REALTIME_KEY);

      // 1. Primeira sincronização absoluta
      if (!lastFullSyncStr) {
        console.log("[AUTO-SYNC] Primeira sincronização: Buscando histórico completo...");
        runSync("auto", "full", "maximum");
        return;
      }

      // 2. Verificar sincronização completa (30 minutos)
      const lastFullSync = new Date(lastFullSyncStr).getTime();
      const elapsedFull = now - lastFullSync;

      if (elapsedFull >= SYNC_INTERVAL_MS) {
        console.log(`[AUTO-SYNC] ${Math.floor(elapsedFull / 60000)} min desde último sync completo. Executando...`);
        runSync("auto", "full");
        return;
      }

      // 3. Verificar sincronização de tempo real (3 minutos)
      const lastRealtimeSync = lastRealtimeSyncStr ? new Date(lastRealtimeSyncStr).getTime() : 0;
      const elapsedRealtime = now - lastRealtimeSync;

      if (elapsedRealtime >= REALTIME_SYNC_INTERVAL_MS) {
        console.log(`[AUTO-SYNC] ${Math.floor(elapsedRealtime / 60000)} min desde último sync de tempo real. Executando ontem/hoje...`);
        runSync("auto", "realtime");
      } else {
        // Ainda dentro dos intervalos saudáveis, definir próximo agendamento
        const remainingFull = SYNC_INTERVAL_MS - elapsedFull;
        const remainingRealtime = REALTIME_SYNC_INTERVAL_MS - elapsedRealtime;
        const nextSync = new Date(now + Math.min(remainingFull, remainingRealtime)).toISOString();

        dispatchSyncStatus({
          lastSync: lastFullSyncStr,
          nextSync,
          isSyncing: false,
          lastResult: getSyncStatus().lastResult
        });
      }
    };

    // Executar verificação imediata ao montar o app/hook
    checkAndSync();

    // Configurar checagem de intervalo periódica a cada 30 segundos
    intervalRef.current = setInterval(checkAndSync, 30 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runSync]);

  return { runSync };
}
