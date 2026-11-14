// src/lib/syncStatusDomain.ts
// Contrato único e puro para estado de sincronização Meta, locks ativos, cobertura por conta,
// cálculo de defasagem e normalização/formatação inequívoca em America/Sao_Paulo.
// Seguro para Vite, SSR e `node --experimental-strip-types --test`.

export const SYNC_DISPLAY_TIMEZONE = "America/Sao_Paulo";
export const SYNC_STATUS_EVENT = "nc_sync_status_changed";
export const SYNC_STATUS_STORAGE_KEY = "nc_auto_sync_status";
export const SYNC_LAST_CYCLE_STORAGE_KEY = "nc_last_realtime_sync";
export const DEFAULT_SYNC_STALE_THRESHOLD_MINUTES = 30;
export const DEFAULT_REMOTE_JOB_LOCK_TTL_MS = 4 * 60 * 1000; // 4 min sem heartbeat => zumbi/timeout
export const DEFAULT_LOCAL_SYNC_LOCK_TTL_MS = 180 * 1000;   // 3 min sem heartbeat local => lock expirado
export const MIXED_ACCOUNT_TIMESTAMPS_GAP_MS = 10 * 60 * 1000; // >10 min entre contas => horários distintos

export type SyncRunStatus =
  | "running"
  | "success"
  | "partial_success"
  | "partial"
  | "completed"
  | "error"
  | "failed"
  | "timeout"
  | string;

export interface SyncRunRecord {
  id: string;
  status: SyncRunStatus;
  started_at?: string | null;
  completed_at?: string | null;
  heartbeat_at?: string | null;
  accounts_synced?: number | null;
  accounts_total?: number | null;
  campaigns_synced?: number | null;
  metrics_synced?: number | null;
  error_message?: string | null;
  triggered_by?: string | null;
  partial_failures?: any[] | null;
  sync_coverage?: Record<string, any> | null;
  sync_version?: string | null;
}

export interface SyncAccountRecord {
  id: string;
  name?: string | null;
  last_sync?: string | null;
  status?: number | string | null;
  platform?: string | null;
}

export interface LocalSyncLockLike {
  isSyncing?: boolean;
  startedAt?: string | null;
  heartbeatAt?: string | null;
}

export interface SyncCoverageIssue {
  accountId: string;
  accountName: string;
  kind: "permission_denied" | "rate_limit" | "error" | "partial" | "stale";
  message: string;
}

export interface SyncCoverageSummary {
  totalAccounts: number;
  completedAccounts: number;
  partialAccounts: number;
  permissionBlockedAccounts: number;
  rateLimitedAccounts: number;
  failedAccounts: number;
  staleAccounts: number;
  zeroDeliveryHealthyAccounts: number;
  hasPartialOrError: boolean;
  hasMixedAccountTimestamps: boolean;
  earliestAccountSyncAt: string | null;
  latestAccountSyncAt: string | null;
  shortSummary: string;
  issues: SyncCoverageIssue[];
}

export type SyncBadgeVisualState =
  | "syncing"
  | "loading_page"
  | "partial"
  | "error"
  | "stale"
  | "unavailable"
  | "fresh";

export interface ResolveSyncBadgeInput {
  isPageLoading?: boolean;
  isMetaSyncing?: boolean;
  snapshotId?: string | null;
  committedAt?: string | null;
  startedAt?: string | null;
  lastSyncAt?: string | null;
  latestSyncRun?: SyncRunRecord | null;
  selectedAccountId?: string | null;
  accountLastSyncAt?: string | null;
  accounts?: SyncAccountRecord[] | null;
  hasSyncError?: boolean;
  staleThresholdMinutes?: number;
  nowMs?: number;
}

export interface SyncBadgePresentation {
  state: SyncBadgeVisualState;
  isPageLoading: boolean;
  isMetaSyncing: boolean;
  primaryLabel: string;
  secondaryLabel: string | null;
  timeFormatted: string;
  timeShort: string;
  startedAtFormatted: string | null;
  completedAtFormatted: string | null;
  ageMinutes: number | null;
  isStale: boolean;
  snapshotId: string;
  shortSnapshotId: string;
  coverage: SyncCoverageSummary;
  errorCause: string | null;
  previousSnapshotNotice: string | null;
  mixedTimestampsNotice: string | null;
  tooltip: string;
}

const UNAVAILABLE_TIME_LABEL = "Horário indisponível";

/**
 * Normaliza timestamp (ISO com offset, ISO sem timezone tratado como UTC,
 * formato Postgres `+00`, Date ou epoch ms) para epoch milissegundos numérico.
 * Retorna null quando ausente ou inválido — nunca inventa Date.now().
 */
export function normalizeTimestampToEpochMs(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  if (raw instanceof Date) {
    const ms = raw.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null" || trimmed === "undefined" || trimmed === "initial") {
    return null;
  }

  // Formato ISO ou Postgres SQL (`YYYY-MM-DD HH:mm:ss(.sss)?(+00|-03:00|Z)?`)
  let normalized = trimmed;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(normalized)) {
    normalized = normalized.replace(" ", "T");
  }
  // Offset curto de Postgres (`+00`, `-03`) => `+00:00`, `-03:00`
  if (/([+-]\d{2})$/.test(normalized)) {
    normalized = `${normalized}:00`;
  }
  // Timestamp com data+hora sem timezone explícito => assumir UTC inequivocamente
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)
  ) {
    normalized = `${normalized}Z`;
  }

  // Rejeitar strings puras sem horário (ex.: "2026-11-14") para carimbo de relógio de sync
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Converte um timestamp válido uma única vez para `America/Sao_Paulo` (`DD/MM/YYYY, HH:mm:ss`).
 */
export function formatSyncTimestampBRT(raw: unknown): string {
  const ms = normalizeTimestampToEpochMs(raw);
  if (ms === null) return UNAVAILABLE_TIME_LABEL;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SYNC_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Converte um timestamp válido uma única vez para horário local `HH:mm:ss` em `America/Sao_Paulo`.
 */
export function formatSyncTimeBRT(raw: unknown): string {
  const ms = normalizeTimestampToEpochMs(raw);
  if (ms === null) return UNAVAILABLE_TIME_LABEL;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SYNC_DISPLAY_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(ms));
}

/**
 * Calcula defasagem em minutos exclusivamente a partir de timestamps numéricos normalizados.
 */
export function computeFreshnessAgeMinutes(raw: unknown, nowMs: number = Date.now()): number | null {
  const ms = normalizeTimestampToEpochMs(raw);
  if (ms === null || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((nowMs - ms) / 60000));
}

export function formatShortSnapshotId(snapshotId: string | null | undefined): string {
  if (!snapshotId || snapshotId === "initial" || snapshotId === "pending-snapshot") return "local";
  return snapshotId.length > 14 ? `${snapshotId.slice(0, 8)}…${snapshotId.slice(-4)}` : snapshotId;
}

/**
 * Valida se um job remoto em `sync_history` está realmente ativo.
 * Locks sem heartbeat ou antigos além de `maxIdleMs` NÃO são tratados como execução ativa.
 */
export function isSyncJobActivelyRunning(
  run: SyncRunRecord | null | undefined,
  nowMs: number = Date.now(),
  maxIdleMs: number = DEFAULT_REMOTE_JOB_LOCK_TTL_MS
): boolean {
  if (!run || String(run.status || "").toLowerCase() !== "running") return false;
  if (normalizeTimestampToEpochMs(run.completed_at) !== null) return false;

  const refMs =
    normalizeTimestampToEpochMs(run.heartbeat_at) ??
    normalizeTimestampToEpochMs(run.started_at);

  if (refMs === null) return false;
  if (nowMs - refMs > maxIdleMs) return false;
  return true;
}

/**
 * Valida se um lock local de navegador ainda é válido pelo heartbeat/início.
 */
export function isLocalSyncLockActive(
  lock: LocalSyncLockLike | null | undefined,
  nowMs: number = Date.now(),
  maxIdleMs: number = DEFAULT_LOCAL_SYNC_LOCK_TTL_MS
): boolean {
  if (!lock || !lock.isSyncing) return false;
  const refMs =
    normalizeTimestampToEpochMs(lock.heartbeatAt) ??
    normalizeTimestampToEpochMs(lock.startedAt);
  if (refMs === null) return false;
  return nowMs - refMs <= maxIdleMs;
}

export function readValidatedLocalSyncStatus(nowMs: number = Date.now()): {
  isSyncing: boolean;
  startedAt: string | null;
  heartbeatAt: string | null;
  lastSync: string | null;
  lastResult: "success" | "partial" | "error" | null;
} {
  const empty = { isSyncing: false, startedAt: null, heartbeatAt: null, lastSync: null, lastResult: null };
  if (typeof window === "undefined" || typeof localStorage === "undefined") return empty;
  try {
    const raw = localStorage.getItem(SYNC_STATUS_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw);
    const active = isLocalSyncLockActive(parsed, nowMs);
    return {
      isSyncing: active,
      startedAt: active ? (parsed.startedAt || null) : null,
      heartbeatAt: active ? (parsed.heartbeatAt || null) : null,
      lastSync: parsed.lastSync || null,
      lastResult: parsed.lastResult || null,
    };
  } catch {
    return empty;
  }
}

export function isTerminalCommittedSyncStatus(status: SyncRunStatus | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "success" || s === "partial_success" || s === "partial" || s === "completed";
}

export function isFailedSyncStatus(status: SyncRunStatus | null | undefined): boolean {
  const s = String(status || "").toLowerCase();
  return s === "error" || s === "failed" || s === "timeout";
}

function classifyFailureKind(item: any): SyncCoverageIssue["kind"] {
  const kind = String(item?.errorKind || "").toLowerCase();
  const msg = String(item?.error || item?.reason || "").toLowerCase();
  if (kind === "permission_denied" || msg.includes("(#200)") || msg.includes("permission") || msg.includes("oauth")) {
    return "permission_denied";
  }
  if (kind === "rate_limit" || msg.includes("rate limit") || msg.includes("circuit breaker") || msg.includes("too many calls")) {
    return "rate_limit";
  }
  return "error";
}

/**
 * Resume cobertura por conta a partir de `sync_coverage`, `partial_failures` e `ad_accounts`.
 * Diferencia falhas de acesso/rate limit de contas saudáveis com 0 campanhas/gasto.
 */
export function summarizeSyncCoverage(input: {
  syncCoverage?: Record<string, any> | null;
  partialFailures?: any[] | null;
  accounts?: SyncAccountRecord[] | null;
  selectedAccountId?: string | null;
  staleThresholdMinutes?: number;
  nowMs?: number;
}): SyncCoverageSummary {
  const nowMs = input.nowMs ?? Date.now();
  const staleMin = input.staleThresholdMinutes ?? DEFAULT_SYNC_STALE_THRESHOLD_MINUTES;
  const cov = input.syncCoverage && typeof input.syncCoverage === "object" ? input.syncCoverage : {};
  const partialArr = Array.isArray(input.partialFailures) ? input.partialFailures : [];
  const rawAccounts = Array.isArray(input.accounts) ? input.accounts : [];
  const metaAccounts = rawAccounts.filter((a) => !a.platform || a.platform === "Meta Ads");
  const scopedAccounts =
    input.selectedAccountId && input.selectedAccountId !== "all"
      ? metaAccounts.filter((a) => a.id === input.selectedAccountId)
      : metaAccounts;

  const accountNameById = new Map<string, string>();
  for (const a of metaAccounts) {
    accountNameById.set(a.id, a.name || a.id);
  }

  const issues: SyncCoverageIssue[] = [];
  const issueByAcc = new Map<string, SyncCoverageIssue>();

  // 1. Falhas explícitas registradas em `partial_failures`
  for (const pf of partialArr) {
    const accId = String(pf?.account_id || pf?.ad_account_id || "");
    if (!accId) continue;
    if (input.selectedAccountId && input.selectedAccountId !== "all" && accId !== input.selectedAccountId) {
      continue;
    }
    const kind = classifyFailureKind(pf);
    const accName = String(pf?.account_name || accountNameById.get(accId) || accId);
    const msg = String(pf?.error || pf?.reason || (Array.isArray(pf?.errors) ? pf.errors.join(", ") : "") || "Falha parcial Meta");
    const existing = issueByAcc.get(accId);
    // Priorizar permission_denied e rate_limit sobre erro genérico
    if (!existing || (existing.kind === "error" && (kind === "permission_denied" || kind === "rate_limit"))) {
      const entry: SyncCoverageIssue = { accountId: accId, accountName: accName, kind, message: msg };
      issueByAcc.set(accId, entry);
    }
  }

  // 2. Cobertura detalhada por conta em `sync_coverage`
  const covKeys = Object.keys(cov).filter((k) =>
    !input.selectedAccountId || input.selectedAccountId === "all" ? true : k === input.selectedAccountId
  );

  const allAccIds = new Set<string>([
    ...scopedAccounts.map((a) => a.id),
    ...covKeys,
    ...Array.from(issueByAcc.keys()),
  ]);

  let completedAccounts = 0;
  let partialAccounts = 0;
  let permissionBlockedAccounts = 0;
  let rateLimitedAccounts = 0;
  let failedAccounts = 0;
  let staleAccounts = 0;
  let zeroDeliveryHealthyAccounts = 0;

  let earliestMs: number | null = null;
  let latestMs: number | null = null;
  let earliestStr: string | null = null;
  let latestStr: string | null = null;

  for (const acc of scopedAccounts) {
    const ms = normalizeTimestampToEpochMs(acc.last_sync);
    if (ms !== null) {
      if (earliestMs === null || ms < earliestMs) {
        earliestMs = ms;
        earliestStr = acc.last_sync || null;
      }
      if (latestMs === null || ms > latestMs) {
        latestMs = ms;
        latestStr = acc.last_sync || null;
      }
      if ((nowMs - ms) / 60000 > staleMin) {
        staleAccounts++;
      }
    } else if (!issueByAcc.has(acc.id)) {
      staleAccounts++;
    }
  }

  for (const accId of allAccIds) {
    const entry = cov[accId];
    const pfIssue = issueByAcc.get(accId);
    const accName = String(entry?.account_name || pfIssue?.accountName || accountNameById.get(accId) || accId);

    const covStatus = String(entry?.status || "").toLowerCase();
    const partialErrors: string[] = Array.isArray(entry?.partial_errors) ? entry.partial_errors : [];

    if (covStatus === "permission_denied" || pfIssue?.kind === "permission_denied") {
      permissionBlockedAccounts++;
      issues.push(
        pfIssue || {
          accountId: accId,
          accountName: accName,
          kind: "permission_denied",
          message: String(entry?.error || "Sem permissão de leitura na Meta API"),
        }
      );
      continue;
    }

    if (entry?.skipped_by_rate_limit || covStatus === "rate_limited" || pfIssue?.kind === "rate_limit") {
      rateLimitedAccounts++;
      issues.push(
        pfIssue || {
          accountId: accId,
          accountName: accName,
          kind: "rate_limit",
          message: String(entry?.error || "Pausada por rate limit da Meta API"),
        }
      );
      continue;
    }

    if (covStatus === "failed" || covStatus === "error") {
      failedAccounts++;
      issues.push(
        pfIssue || {
          accountId: accId,
          accountName: accName,
          kind: "error",
          message: String(entry?.error || "Falha na coleta da conta"),
        }
      );
      continue;
    }

    if (partialErrors.length > 0 || covStatus === "partial" || pfIssue) {
      partialAccounts++;
      issues.push(
        pfIssue || {
          accountId: accId,
          accountName: accName,
          kind: "partial",
          message: partialErrors.join("; ") || "Etapas secundárias com falha parcial",
        }
      );
      continue;
    }

    // Conta sem erro de acesso; 0 campanhas/métricas não é erro de sync!
    if (entry && Number(entry.campaigns_listed ?? 0) === 0 && Number(entry.campaign_insights ?? 0) === 0) {
      zeroDeliveryHealthyAccounts++;
    }
    completedAccounts++;
  }

  const totalAccounts = allAccIds.size;
  const hasPartialOrError =
    partialAccounts > 0 || permissionBlockedAccounts > 0 || rateLimitedAccounts > 0 || failedAccounts > 0;
  const hasMixedAccountTimestamps =
    (!input.selectedAccountId || input.selectedAccountId === "all") &&
    earliestMs !== null &&
    latestMs !== null &&
    latestMs - earliestMs > MIXED_ACCOUNT_TIMESTAMPS_GAP_MS;

  const parts: string[] = [];
  if (totalAccounts > 0) {
    const healthyCount = completedAccounts + partialAccounts;
    parts.push(`${healthyCount}/${totalAccounts} conta${totalAccounts === 1 ? "" : "s"}`);
  }
  if (permissionBlockedAccounts > 0) {
    parts.push(`${permissionBlockedAccounts} sem permissão`);
  }
  if (rateLimitedAccounts > 0) {
    parts.push(`${rateLimitedAccounts} em rate limit`);
  }
  if (failedAccounts > 0) {
    parts.push(`${failedAccounts} com falha`);
  }
  if (partialAccounts > 0) {
    parts.push(`${partialAccounts} parcial(is)`);
  }
  if (staleAccounts > 0 && permissionBlockedAccounts + rateLimitedAccounts + failedAccounts === 0) {
    parts.push(`${staleAccounts} desatualizada(s)`);
  }

  return {
    totalAccounts,
    completedAccounts,
    partialAccounts,
    permissionBlockedAccounts,
    rateLimitedAccounts,
    failedAccounts,
    staleAccounts,
    zeroDeliveryHealthyAccounts,
    hasPartialOrError,
    hasMixedAccountTimestamps,
    earliestAccountSyncAt: earliestStr,
    latestAccountSyncAt: latestStr,
    shortSummary: parts.join(" • "),
    issues,
  };
}

/**
 * Resolve o estado completo e consistente para o selo e todos os consumidores do NC Suite.
 * Separa loading de página vs job remoto ativo vs status terminal vs frescor por timestamp.
 */
export function resolveSyncBadgePresentation(input: ResolveSyncBadgeInput): SyncBadgePresentation {
  const nowMs = input.nowMs ?? Date.now();
  const staleThreshold = input.staleThresholdMinutes ?? DEFAULT_SYNC_STALE_THRESHOLD_MINUTES;
  const isPageLoading = Boolean(input.isPageLoading);
  const run = input.latestSyncRun || null;
  const remoteJobActive = isSyncJobActivelyRunning(run, nowMs);
  const isMetaSyncing = Boolean(input.isMetaSyncing || remoteJobActive);

  const isSingleAccount = Boolean(input.selectedAccountId && input.selectedAccountId !== "all");
  const matchedAccount = isSingleAccount
    ? (input.accounts || []).find((a) => a.id === input.selectedAccountId) || null
    : null;

  const coverage = summarizeSyncCoverage({
    syncCoverage: run?.sync_coverage,
    partialFailures: run?.partial_failures,
    accounts: input.accounts,
    selectedAccountId: input.selectedAccountId,
    staleThresholdMinutes: staleThreshold,
    nowMs,
  });

  // Timestamp do snapshot efetivo concluído (usa completed_at do run ou last_sync específico da conta filtrada)
  const rawCompletedAt = isSingleAccount
    ? (input.accountLastSyncAt ?? matchedAccount?.last_sync ?? (coverage.hasPartialOrError ? null : input.lastSyncAt || input.committedAt))
    : (run && isTerminalCommittedSyncStatus(run.status) && run.completed_at
        ? run.completed_at
        : (input.lastSyncAt || input.committedAt || null));

  const effectiveCompletedMs = normalizeTimestampToEpochMs(rawCompletedAt);
  const completedAtFormatted = effectiveCompletedMs !== null ? formatSyncTimestampBRT(effectiveCompletedMs) : null;
  const startedAtRaw = isMetaSyncing
    ? (input.startedAt || (remoteJobActive ? run?.started_at : null) || null)
    : (run?.started_at || input.startedAt || null);
  const startedAtFormatted = normalizeTimestampToEpochMs(startedAtRaw) !== null ? formatSyncTimestampBRT(startedAtRaw) : null;

  const ageMinutes = computeFreshnessAgeMinutes(effectiveCompletedMs, nowMs);
  const isStale = ageMinutes !== null && ageMinutes > staleThreshold;
  const snapshotId = String(
    (run && isTerminalCommittedSyncStatus(run.status) ? run.id : null) ||
    input.snapshotId ||
    "initial"
  );
  const shortSnapshotId = formatShortSnapshotId(snapshotId);
  const timeFormatted = completedAtFormatted || UNAVAILABLE_TIME_LABEL;
  const timeShort = effectiveCompletedMs !== null ? formatSyncTimeBRT(effectiveCompletedMs) : UNAVAILABLE_TIME_LABEL;

  // Avalia falha do último run somente se ele for mais recente (ou se não houver snapshot posterior)
  const runFailedMs = run && isFailedSyncStatus(run.status)
    ? normalizeTimestampToEpochMs(run.completed_at || run.started_at)
    : null;
  const latestRunIsTerminalFailure = Boolean(
    input.hasSyncError ||
    (run && isFailedSyncStatus(run.status) && (effectiveCompletedMs === null || (runFailedMs !== null && runFailedMs >= effectiveCompletedMs)))
  );

  // Avalia parcial: no escopo global considera status do run + cobertura; em conta única, só se aquela conta teve parcial/erro
  const runStatusLower = String(run?.status || "").toLowerCase();
  const isPartialRun = isSingleAccount
    ? coverage.hasPartialOrError
    : runStatusLower === "partial_success" ||
      runStatusLower === "partial" ||
      coverage.hasPartialOrError;

  const accountIssue = isSingleAccount ? coverage.issues[0] || null : null;
  const errorCause =
    accountIssue?.message ||
    (Array.isArray(run?.partial_failures) && run.partial_failures[0]?.error) ||
    run?.error_message ||
    (latestRunIsTerminalFailure ? "Falha ao sincronizar com Meta Graph API" : null);

  const mixedTimestampsNotice = coverage.hasMixedAccountTimestamps
    ? `Contas entre ${formatSyncTimeBRT(coverage.earliestAccountSyncAt)} e ${formatSyncTimeBRT(coverage.latestAccountSyncAt)}`
    : null;

  let state: SyncBadgeVisualState;
  let primaryLabel: string;
  let secondaryLabel: string | null = null;
  let previousSnapshotNotice: string | null = null;

  if (isMetaSyncing) {
    state = "syncing";
    primaryLabel = "Sincronização Meta em andamento";
    if (effectiveCompletedMs !== null) {
      previousSnapshotNotice = `Exibindo snapshot anterior (${timeShort})`;
      secondaryLabel = previousSnapshotNotice;
    } else if (startedAtFormatted) {
      secondaryLabel = `Iniciado em ${startedAtFormatted}`;
    }
  } else if (isPageLoading) {
    state = "loading_page";
    primaryLabel = "Carregando dados desta tela";
    secondaryLabel = effectiveCompletedMs !== null ? `Snapshot: ${timeShort}` : null;
  } else if (latestRunIsTerminalFailure || (isSingleAccount && accountIssue && effectiveCompletedMs === null)) {
    state = "error";
    primaryLabel = "Falha na sincronização";
    secondaryLabel = errorCause || (completedAtFormatted ? `Último válido: ${timeShort}` : UNAVAILABLE_TIME_LABEL);
  } else if (effectiveCompletedMs === null) {
    state = "unavailable";
    primaryLabel = UNAVAILABLE_TIME_LABEL;
    secondaryLabel = isPartialRun && coverage.shortSummary ? coverage.shortSummary : null;
  } else if (isPartialRun && !isStale) {
    state = "partial";
    primaryLabel = "Concluído parcialmente";
    secondaryLabel = [
      `Atualizado às ${timeShort}`,
      coverage.shortSummary || null,
    ].filter(Boolean).join(" • ");
  } else if (isStale) {
    state = "stale";
    primaryLabel = `Dados defasados há ${ageMinutes} min`;
    secondaryLabel = [
      `Último: ${timeFormatted}`,
      isPartialRun ? "Concluído parcialmente" : null,
      coverage.shortSummary || null,
    ].filter(Boolean).join(" • ");
  } else {
    state = "fresh";
    primaryLabel = `Atualizado às ${timeShort}`;
    secondaryLabel = mixedTimestampsNotice || (coverage.shortSummary || null);
  }

  const tooltipLines = [
    `Snapshot efetivo: ${snapshotId}`,
    `Estado: ${primaryLabel}`,
    `Concluído em (BRT): ${completedAtFormatted || UNAVAILABLE_TIME_LABEL}`,
    startedAtFormatted ? `Iniciado em (BRT): ${startedAtFormatted}` : null,
    coverage.shortSummary ? `Cobertura: ${coverage.shortSummary}` : null,
    mixedTimestampsNotice ? `Janela por conta: ${mixedTimestampsNotice}` : null,
    errorCause ? `Observação: ${errorCause}` : null,
    `Fuso: ${SYNC_DISPLAY_TIMEZONE}`,
  ].filter(Boolean);

  return {
    state,
    isPageLoading,
    isMetaSyncing,
    primaryLabel,
    secondaryLabel,
    timeFormatted,
    timeShort,
    startedAtFormatted,
    completedAtFormatted,
    ageMinutes,
    isStale,
    snapshotId,
    shortSnapshotId,
    coverage,
    errorCause,
    previousSnapshotNotice,
    mixedTimestampsNotice,
    tooltip: tooltipLines.join(" | "),
  };
}
