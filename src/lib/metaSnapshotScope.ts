// Pure snapshot cache scope helpers (safe for both Vite and Node unit test runner).
import { EVENT_MODEL_VERSION } from "./metricsDomain.ts";

export const DEFAULT_META_TIMEZONE = "America/Sao_Paulo";
export const META_SNAPSHOT_EVENT = "nc_meta_snapshot_committed";

export const META_SNAPSHOT_CONSUMER_DOMAINS = new Set<string>([
  // Command Center (/dashboard)
  "dash-performance-custom",
  "dashboard-accounts-table-data",
  "ad-accounts",
  "clients",
  "last-sync-date",
  // Métricas (/metricas)
  "mc-camps",
  "mc-adsets",
  "mc-ads",
  "mc-period-stats",
  "mc-account-period-stats",
  "mc-placements",
  "mc-breakdowns",
  "meta-sync-config",
  // Cockpit (/cockpit)
  "cockpit-raw",
  "cockpit-accounts",
  "cockpit-campaigns",
  "cockpit-adsets",
  "cockpit-thresholds",
  // Relatórios (/relatorios)
  "ad-accounts-reports",
  "clients-reports",
  "saved-reports",
  "relatorios-campaigns",
  // Auditoria (/auditoria)
  "auditoria-snapshot",
  // Simulador (/simulador)
  "simulador-ad-accounts",
  "simulador-campaigns",
  // Victoria (/victoria)
  "ad-accounts-victoria",
  "victoria-snapshot",
  // Cobranças (/cobrancas)
  "billing_snapshots",
  "campaign_billing_stats",
]);

export interface MetaSnapshotScopeParams {
  tenantId?: string | null;
  accountId?: string | null;
  dateFrom: string;
  dateTo: string;
  timezone?: string;
  level?: string;
  statusFilter?: string;
  deliveryFilter?: string;
  snapshotId?: string | null;
  eventModelVersion?: string;
}

/**
 * Tupla completa de 10 dimensões exigida para isolamento de cache entre
 * tenant, conta, período, fuso, granularidade, filtros, snapshot e versão semântica.
 */
export function getMetaSnapshotScopeTuple(params: MetaSnapshotScopeParams): readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string
] {
  return [
    params.tenantId || "default-tenant",
    params.accountId || "all",
    params.dateFrom,
    params.dateTo,
    params.timezone || DEFAULT_META_TIMEZONE,
    params.level || "account",
    params.statusFilter || "all",
    params.deliveryFilter || "all",
    params.snapshotId || "initial",
    params.eventModelVersion || EVENT_MODEL_VERSION,
  ] as const;
}

export function buildMetaSnapshotKey(
  domain: string,
  params: MetaSnapshotScopeParams,
  extra: string[] = []
): readonly unknown[] {
  return [domain, ...getMetaSnapshotScopeTuple(params), ...extra] as const;
}

export function isMatchingMetaConsumerKey(
  key: readonly unknown[],
  scope: { tenantId?: string | null; accountId?: string | null; dateFrom?: string | null; dateTo?: string | null }
): boolean {
  if (!Array.isArray(key) || key.length === 0) return false;
  const domain = String(key[0] || "");
  if (!META_SNAPSHOT_CONSUMER_DOMAINS.has(domain)) return false;

  if (key.length < 5) return true;

  const qAccount = String(key[2] || "all");
  const targetAcc = scope.accountId || "all";
  if (targetAcc !== "all" && qAccount !== "all" && qAccount !== targetAcc) {
    return false;
  }

  const qFrom = typeof key[3] === "string" ? key[3] : null;
  const qTo = typeof key[4] === "string" ? key[4] : null;
  if (scope.dateFrom && scope.dateTo && qFrom && qTo) {
    const isRangeLike = /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo);
    if (isRangeLike && (qTo < scope.dateFrom || qFrom > scope.dateTo)) {
      return false;
    }
  }
  return true;
}

export function createMonotonicRequestGuard() {
  let seq = 0;
  return {
    next: () => ++seq,
    isCurrent: (token: number) => token === seq,
    current: () => seq,
  };
}
