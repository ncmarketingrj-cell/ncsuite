// src/hooks/useAutoSync.ts
// NC Performance Suite — Worker de Sincronização Automática a cada 30 minutos

import { useEffect, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutos
const STORAGE_KEY = "nc_last_auto_sync";
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

export function useAutoSync() {
  const qc = useQueryClient();
  const isSyncingRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSync = useCallback(async (triggeredBy: "auto" | "manual" = "auto", overridePreset?: "maximum" | "last_7d") => {
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
      const preset = overridePreset || (triggeredBy === "manual" ? "maximum" : "last_7d");
      console.log(`[AUTO-SYNC] Iniciando sync (${triggeredBy} | ${preset})...`);

      // 1. Sincronizar dados do Meta Ads
      const { error: syncError } = await supabase.functions.invoke("sync-meta-ads", {
        body: { date_preset: preset, triggered_by: triggeredBy }
      });

      if (syncError) throw syncError;

      // 2. Executar motor de alertas após sync
      await supabase.functions.invoke("run-automations", {
        body: {}
      });

      // 3. Registrar timestamp do sync
      const now = new Date().toISOString();
      const next = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
      localStorage.setItem(STORAGE_KEY, now);
      dispatchSyncStatus({
        isSyncing: false,
        lastSync: now,
        nextSync: next,
        lastResult: "success"
      });

      // 4. Invalidar todas as queries para atualizar a UI
      qc.invalidateQueries();

      console.log(`[AUTO-SYNC] ✅ Sync concluído com sucesso em ${now}`);

      if (triggeredBy === "manual") {
        toast.success("✅ Dados sincronizados com sucesso!", { id: "manual-sync" });
      }

    } catch (error: any) {
      console.error("[AUTO-SYNC] ❌ Erro:", error.message);
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
      const lastSyncStr = localStorage.getItem(STORAGE_KEY);
      const now = Date.now();

      if (!lastSyncStr) {
        // Nunca sincronizou — sincroniza agora (histórico completo)
        console.log("[AUTO-SYNC] Primeira sincronização: Buscando histórico completo...");
        runSync("auto", "maximum");
        return;
      }

      const lastSync = new Date(lastSyncStr).getTime();
      const elapsed = now - lastSync;

      if (elapsed >= SYNC_INTERVAL_MS) {
        console.log(`[AUTO-SYNC] ${Math.floor(elapsed / 60000)} min desde último sync. Sincronizando...`);
        runSync("auto");
      } else {
        const remaining = SYNC_INTERVAL_MS - elapsed;
        const nextSync = new Date(now + remaining).toISOString();
        console.log(`[AUTO-SYNC] Próximo sync em ${Math.floor(remaining / 60000)} min (${nextSync})`);
        dispatchSyncStatus({
          lastSync: lastSyncStr,
          nextSync,
          isSyncing: false,
          lastResult: getSyncStatus().lastResult
        });
      }
    };

    // Executar verificação imediata
    checkAndSync();

    // Configurar intervalo de checagem a cada 1 minuto
    // (a cada minuto verifica se já passou 30 min desde o último sync)
    intervalRef.current = setInterval(checkAndSync, 60 * 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runSync]);

  return { runSync };
}
