import { Loader2, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { formatShortSnapshotId, formatSnapshotTimestampBR } from "@/lib/metaSnapshotCache";

interface SnapshotStatusBadgeProps {
  snapshotId?: string | null;
  committedAt?: string | null;
  lastSyncAt?: string | null;
  hasSyncError?: boolean;
  isUpdating?: boolean;
  staleThresholdMinutes?: number;
  className?: string;
}

export function SnapshotStatusBadge({
  snapshotId,
  committedAt,
  lastSyncAt,
  hasSyncError = false,
  isUpdating = false,
  staleThresholdMinutes = 30,
  className = "",
}: SnapshotStatusBadgeProps) {
  const shortId = formatShortSnapshotId(snapshotId);
  const effectiveSyncAt = lastSyncAt || committedAt || null;
  const formattedTime = formatSnapshotTimestampBR(effectiveSyncAt);
  const parsedMs = effectiveSyncAt ? Date.parse(effectiveSyncAt) : NaN;
  const ageMinutes = Number.isFinite(parsedMs) ? Math.max(0, Math.round((Date.now() - parsedMs) / 60000)) : null;
  const isStale = ageMinutes !== null && ageMinutes > staleThresholdMinutes;

  const statusLabel = isUpdating
    ? "Sincronização em andamento..."
    : hasSyncError
      ? "Erro parcial de sincronização"
      : !effectiveSyncAt || ageMinutes === null
        ? "Sem timestamp de sync"
        : isStale
          ? `Dados possivelmente defasados (${ageMinutes}m)`
          : "Snapshot atualizado";

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-1.5 text-[10px] font-mono ${
        hasSyncError
          ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
          : isStale
            ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
            : "border-white/10 bg-white/[0.03] text-muted-foreground"
      } ${className}`}
      title={`Snapshot efetivo: ${snapshotId || "initial"} | Status: ${statusLabel} | Último sync: ${formattedTime}`}
      data-testid="snapshot-status-badge"
    >
      {isUpdating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          <span className="font-bold text-primary">Sincronização em andamento...</span>
        </>
      ) : hasSyncError ? (
        <>
          <AlertTriangle className="h-3 w-3 text-rose-400 shrink-0" />
          <span className="font-bold text-rose-300">
            Erro parcial <strong className="text-foreground">{formattedTime}</strong>
          </span>
        </>
      ) : !effectiveSyncAt || ageMinutes === null ? (
        <>
          <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
          <span>Sem timestamp de sync</span>
        </>
      ) : isStale ? (
        <>
          <Clock className="h-3 w-3 text-amber-400 shrink-0" />
          <span>
            Defasado ({ageMinutes}m) <strong className="text-amber-200">{formattedTime}</strong>
          </span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          <span>
            Snapshot atualizado <strong className="text-foreground">{formattedTime}</strong>
          </span>
        </>
      )}
      <span className="text-muted-foreground/40">•</span>
      <span className="text-[9px] text-muted-foreground/80">
        snap: <strong className="text-foreground/90">{shortId}</strong>
      </span>
    </div>
  );
}
