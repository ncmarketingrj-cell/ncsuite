// src/lib/metaSnapshotCache.ts
// Coordenador central de chaves de query, snapshotId efetivo, guarda anti-concorrência
// e invalidação pós-commit para todos os consumidores de snapshots Meta Ads.

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

export {
  DEFAULT_META_TIMEZONE,
  META_SNAPSHOT_EVENT,
  META_SNAPSHOT_CONSUMER_DOMAINS,
  getMetaSnapshotScopeTuple,
  buildMetaSnapshotKey,
  isMatchingMetaConsumerKey,
  createMonotonicRequestGuard,
};
export type { MetaSnapshotScopeParams };

export interface ActiveMetaSnapshotInfo {
  snapshotId: string;
  committedAt: string;
  tenantId: string;
  accountId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  source?: string;
}

const SNAPSHOT_STORAGE_KEY = "nc_active_meta_snapshot_v1";
let inMemorySnapshot: ActiveMetaSnapshotInfo | null = null;

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
      inMemorySnapshot = {
        snapshotId: parsed.snapshotId,
        committedAt: parsed.committedAt || "",
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
  const normalized: ActiveMetaSnapshotInfo = {
    snapshotId: info.snapshotId || `snap_${Date.now()}`,
    committedAt: info.committedAt || new Date().toISOString(),
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
  return normalized;
}

/**
 * Consulta o último snapshot efetivamente persistido no banco (`sync_history` com
 * fallback seguro para `ad_accounts.last_sync` quando RLS restringe `sync_history`).
 */
export async function fetchLatestCommittedSnapshot(options: {
  tenantId?: string | null;
  accountId?: string | null;
  fallbackSnapshotId?: string | null;
} = {}): Promise<ActiveMetaSnapshotInfo> {
  const tenantId = options.tenantId || "default-tenant";
  const accountId = options.accountId && options.accountId !== "all" ? options.accountId : null;

  try {
    const { data: syncRows, error: syncErr } = await (supabase as any)
      .from("sync_history")
      .select("id, status, completed_at, started_at, user_id")
      .in("status", ["success", "partial", "completed"])
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(1);

    if (!syncErr && Array.isArray(syncRows) && syncRows.length > 0 && syncRows[0]?.id) {
      return {
        snapshotId: String(syncRows[0].id),
        committedAt: String(syncRows[0].completed_at || syncRows[0].started_at || new Date().toISOString()),
        tenantId,
        accountId,
        source: "sync_history",
      };
    }
  } catch {
    // fallback para ad_accounts
  }

  try {
    let q = (supabase as any)
      .from("ad_accounts")
      .select("id, last_sync")
      .not("last_sync", "is", null)
      .order("last_sync", { ascending: false })
      .limit(1);
    if (accountId) q = q.eq("id", accountId);
    const { data: accRows } = await q;
    if (Array.isArray(accRows) && accRows.length > 0 && accRows[0]?.last_sync) {
      const ts = String(accRows[0].last_sync);
      const ms = new Date(ts).getTime();
      const derivedId = options.fallbackSnapshotId || (Number.isFinite(ms) ? `snap_${ms}` : `snap_${Date.now()}`);
      return {
        snapshotId: derivedId,
        committedAt: ts,
        tenantId,
        accountId,
        source: "ad_accounts",
      };
    }
  } catch {
    // fallback local
  }

  const current = getActiveMetaSnapshot();
  return {
    snapshotId: options.fallbackSnapshotId || current.snapshotId || "initial",
    committedAt: current.committedAt || new Date().toISOString(),
    tenantId,
    accountId,
    source: "fallback",
  };
}

/**
 * Hook reativo para que qualquer página consumidora exiba o snapshotId e o horário
 * efetivamente carregados e reaja imediatamente a um commit de snapshot.
 */
export function useActiveMetaSnapshot(options: { tenantId?: string | null; accountId?: string | null } = {}) {
  const [snapshot, setSnapshot] = useState<ActiveMetaSnapshotInfo>(() => getActiveMetaSnapshot());

  useEffect(() => {
    let cancelled = false;
    const onCommit = (ev: Event) => {
      const detail = (ev as CustomEvent<ActiveMetaSnapshotInfo>)?.detail;
      if (!cancelled && detail?.snapshotId) {
        setSnapshot(detail);
      }
    };
    window.addEventListener(META_SNAPSHOT_EVENT, onCommit as EventListener);

    fetchLatestCommittedSnapshot({
      tenantId: options.tenantId,
      accountId: options.accountId,
    }).then((latest) => {
      if (cancelled) return;
      const cur = getActiveMetaSnapshot();
      const latestMs = latest.committedAt ? new Date(latest.committedAt).getTime() : 0;
      const curMs = cur.committedAt ? new Date(cur.committedAt).getTime() : 0;
      if (latest.snapshotId !== "initial" && (cur.snapshotId === "initial" || latestMs >= curMs)) {
        publishActiveMetaSnapshot(latest);
        setSnapshot(latest);
      }
    });

    return () => {
      cancelled = true;
      window.removeEventListener(META_SNAPSHOT_EVENT, onCommit as EventListener);
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
        committedAt: args.committedAt || new Date().toISOString(),
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
  }

  return confirmed;
}

/**
 * Guarda monotônica para evitar que respostas antigas (fora de ordem)
 * sobrescrevam estado de conta/período/snapshot mais recente.
 */
export function formatSnapshotTimestampBR(iso: string | null | undefined): string {
  if (!iso) return "Aguardando snapshot";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Aguardando snapshot";
  return d.toLocaleString("pt-BR", {
    timeZone: DEFAULT_META_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatShortSnapshotId(snapshotId: string | null | undefined): string {
  if (!snapshotId || snapshotId === "initial" || snapshotId === "pending-snapshot") return "local";
  return snapshotId.length > 14 ? `${snapshotId.slice(0, 8)}…${snapshotId.slice(-4)}` : snapshotId;
}
