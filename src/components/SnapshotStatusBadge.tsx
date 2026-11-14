import { Loader2, CheckCircle2, AlertTriangle, Clock, RefreshCw } from "lucide-react";
import {
  resolveSyncBadgePresentation,
  type SyncAccountRecord,
  type SyncRunRecord,
} from "@/lib/syncStatusDomain";

export interface SnapshotStatusBadgeProps {
  snapshotId?: string | null;
  committedAt?: string | null;
  startedAt?: string | null;
  lastSyncAt?: string | null;
  latestSyncRun?: SyncRunRecord | null;
  accounts?: SyncAccountRecord[] | null;
  selectedAccountId?: string | null;
  accountLastSyncAt?: string | null;
  hasSyncError?: boolean;
  /** Carregamento local das queries desta página (NÃO significa sync remoto Meta). */
  isPageLoading?: boolean;
  /** Execução confirmada de sincronização remota com Meta Ads (local ou backend). */
  isMetaSyncing?: boolean;
  staleThresholdMinutes?: number;
  className?: string;
}

export function SnapshotStatusBadge({
  snapshotId,
  committedAt,
  startedAt,
  lastSyncAt,
  latestSyncRun,
  accounts,
  selectedAccountId,
  accountLastSyncAt,
  hasSyncError = false,
  isPageLoading = false,
  isMetaSyncing = false,
  staleThresholdMinutes = 30,
  className = "",
}: SnapshotStatusBadgeProps) {
  const vm = resolveSyncBadgePresentation({
    isPageLoading,
    isMetaSyncing,
    snapshotId,
    committedAt,
    startedAt,
    lastSyncAt,
    latestSyncRun,
    accounts,
    selectedAccountId,
    accountLastSyncAt,
    hasSyncError,
    staleThresholdMinutes,
  });

  const containerStyle =
    vm.state === "error"
      ? "border-rose-500/35 bg-rose-500/10 text-rose-200"
      : vm.state === "partial" || vm.state === "stale"
        ? "border-amber-500/35 bg-amber-500/10 text-amber-200"
        : vm.state === "syncing"
          ? "border-primary/35 bg-primary/10 text-primary"
          : vm.state === "loading_page"
            ? "border-sky-500/30 bg-sky-500/10 text-sky-200"
            : vm.state === "unavailable"
              ? "border-white/15 bg-white/[0.04] text-muted-foreground"
              : "border-emerald-500/25 bg-emerald-500/5 text-muted-foreground";

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-mono ${containerStyle} ${className}`}
      title={vm.tooltip}
      data-testid="snapshot-status-badge"
      data-sync-state={vm.state}
      data-page-loading={vm.isPageLoading ? "true" : "false"}
      data-meta-syncing={vm.isMetaSyncing ? "true" : "false"}
    >
      {vm.state === "syncing" ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          <span className="font-bold text-primary">{vm.primaryLabel}</span>
          {vm.secondaryLabel && (
            <>
              <span className="text-primary/40">•</span>
              <span className="text-muted-foreground">{vm.secondaryLabel}</span>
            </>
          )}
        </>
      ) : vm.state === "loading_page" ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin text-sky-400 shrink-0" />
          <span className="font-bold text-sky-300">{vm.primaryLabel}</span>
          {vm.secondaryLabel && (
            <>
              <span className="text-sky-400/40">•</span>
              <span className="text-muted-foreground">{vm.secondaryLabel}</span>
            </>
          )}
        </>
      ) : vm.state === "error" ? (
        <>
          <AlertTriangle className="h-3 w-3 text-rose-400 shrink-0" />
          <span className="font-bold text-rose-300">{vm.primaryLabel}</span>
          {vm.secondaryLabel && (
            <>
              <span className="text-rose-400/40">•</span>
              <span className="text-rose-200/85 max-w-[260px] truncate">{vm.secondaryLabel}</span>
            </>
          )}
        </>
      ) : vm.state === "partial" ? (
        <>
          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-300">{vm.primaryLabel}</span>
          <span className="text-amber-400/40">•</span>
          <span>
            <strong className="text-foreground">{vm.timeFormatted}</strong>
          </span>
          {vm.coverage.shortSummary && (
            <>
              <span className="text-amber-400/40">•</span>
              <span className="text-amber-200/90">{vm.coverage.shortSummary}</span>
            </>
          )}
        </>
      ) : vm.state === "stale" ? (
        <>
          <Clock className="h-3 w-3 text-amber-400 shrink-0" />
          <span className="font-bold text-amber-300">{vm.primaryLabel}</span>
          <span className="text-amber-400/40">•</span>
          <span>
            Último: <strong className="text-amber-100">{vm.timeFormatted}</strong>
          </span>
          {vm.coverage.shortSummary && (
            <>
              <span className="text-amber-400/40">•</span>
              <span className="text-amber-200/80">{vm.coverage.shortSummary}</span>
            </>
          )}
        </>
      ) : vm.state === "unavailable" ? (
        <>
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span>{vm.primaryLabel}</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          <span>
            {vm.primaryLabel} <strong className="text-foreground">{vm.timeFormatted}</strong>
          </span>
          {(vm.mixedTimestampsNotice || vm.coverage.shortSummary) && (
            <>
              <span className="text-muted-foreground/40">•</span>
              <span className="text-muted-foreground">
                {vm.mixedTimestampsNotice || vm.coverage.shortSummary}
              </span>
            </>
          )}
        </>
      )}

      <span className="text-muted-foreground/40">•</span>
      <span className="text-[9px] text-muted-foreground/80">
        snap: <strong className="text-foreground/90">{vm.shortSnapshotId}</strong>
      </span>
    </div>
  );
}
