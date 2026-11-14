import { Loader2, CheckCircle2 } from "lucide-react";
import { formatShortSnapshotId, formatSnapshotTimestampBR } from "@/lib/metaSnapshotCache";

interface SnapshotStatusBadgeProps {
  snapshotId?: string | null;
  committedAt?: string | null;
  isUpdating?: boolean;
  className?: string;
}

export function SnapshotStatusBadge({
  snapshotId,
  committedAt,
  isUpdating = false,
  className = "",
}: SnapshotStatusBadgeProps) {
  const shortId = formatShortSnapshotId(snapshotId);
  const formattedTime = formatSnapshotTimestampBR(committedAt);

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[10px] font-mono text-muted-foreground ${className}`}
      title={`Snapshot efetivo: ${snapshotId || "initial"} | Atualizado em: ${formattedTime}`}
      data-testid="snapshot-status-badge"
    >
      {isUpdating ? (
        <>
          <Loader2 className="h-3 w-3 animate-spin text-primary shrink-0" />
          <span className="font-bold text-primary">Atualizando dados...</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" />
          <span>
            Sync <strong className="text-foreground">{formattedTime}</strong>
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
