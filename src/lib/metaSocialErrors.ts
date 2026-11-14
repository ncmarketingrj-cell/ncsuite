// Pure Meta Social API error classification and state machine helper (shared between frontend and unit tests).

export type SocialDataState =
  | "idle"
  | "loading"
  | "success"
  | "empty"
  | "permission_denied"
  | "token_expired"
  | "rate_limited"
  | "partial"
  | "error";

export type SocialSourceKey =
  | "accounts"
  | "overview"
  | "dailySeries"
  | "posts"
  | "demographics"
  | "manualSync";

export type SocialDataSourceKind =
  | "meta_graph_v21"
  | "edge_proxy"
  | "supabase_cache"
  | "snapshot_cache"
  | "none";

export interface SocialSourceTelemetry {
  source: SocialSourceKey;
  label: string;
  state: SocialDataState;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  timeoutMs: number;
  error: string | null;
  itemCount: number;
  dataSource: SocialDataSourceKind;
  snapshotAt: string | null;
  fromCache: boolean;
  canRetry: boolean;
}

export const SOCIAL_SOURCE_LABELS: Record<SocialSourceKey, string> = {
  accounts: "Contas Conectadas",
  overview: "Visão Geral (KPIs)",
  dailySeries: "Série Histórica",
  posts: "Publicações",
  demographics: "Demográficos",
  manualSync: "Sync Manual",
};

export function classifySocialErrorState(errorInput: any): { state: SocialDataState; message: string } {
  const errObj = errorInput?.error ? errorInput.error : errorInput;
  const code = Number(errObj?.code || errObj?.errorCode || 0);
  const rawMsg = String(errObj?.message || errObj?.error || errorInput || "Erro na Meta API");
  const lower = rawMsg.toLowerCase();

  if (
    code === 190 ||
    errObj?.errorKind === "invalid_token" ||
    lower.includes("access token") ||
    lower.includes("session has expired") ||
    lower.includes("invalid oauth") ||
    lower.includes("token expirado") ||
    lower.includes("token_expired")
  ) {
    return { state: "token_expired", message: rawMsg };
  }
  if (
    code === 10 ||
    code === 200 ||
    code === 230 ||
    code === 294 ||
    errObj?.errorKind === "permission_denied" ||
    lower.includes("permission") ||
    lower.includes("requires") ||
    lower.includes("not authorized") ||
    lower.includes("permissão")
  ) {
    return { state: "permission_denied", message: rawMsg };
  }
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    code === 429 ||
    errObj?.errorKind === "rate_limit" ||
    lower.includes("too many calls") ||
    lower.includes("rate limit") ||
    lower.includes("limite de requisições")
  ) {
    return { state: "rate_limited", message: rawMsg };
  }
  return { state: "error", message: rawMsg };
}

export function buildSocialSourceTelemetry(params: {
  source: SocialSourceKey;
  state: SocialDataState;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  timeoutMs?: number;
  error?: string | null;
  itemCount?: number;
  dataSource?: SocialDataSourceKind;
  snapshotAt?: string | null;
  fromCache?: boolean;
}): SocialSourceTelemetry {
  const startedAt = params.startedAt ?? null;
  const finishedAt =
    params.finishedAt ??
    (params.state !== "idle" && params.state !== "loading" ? new Date().toISOString() : null);
  let durationMs = params.durationMs ?? null;
  if (durationMs === null && startedAt && finishedAt) {
    const diff = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
    durationMs = Number.isFinite(diff) && diff >= 0 ? diff : 0;
  }
  return {
    source: params.source,
    label: SOCIAL_SOURCE_LABELS[params.source],
    state: params.state,
    startedAt,
    finishedAt,
    durationMs,
    timeoutMs: params.timeoutMs ?? 15_000,
    error: params.error ?? null,
    itemCount: params.itemCount ?? 0,
    dataSource: params.dataSource ?? "meta_graph_v21",
    snapshotAt: params.snapshotAt ?? finishedAt,
    fromCache: Boolean(params.fromCache),
    canRetry: params.state !== "loading",
  };
}

export function deriveOverallSocialState(sources: {
  accounts: SocialDataState;
  overview: SocialDataState;
  dailySeries: SocialDataState;
  posts: SocialDataState;
}): SocialDataState {
  const list = [sources.accounts, sources.overview, sources.dailySeries, sources.posts];
  if (list.every((s) => s === "idle")) return "idle";
  if (sources.accounts === "loading") return "loading";
  if (sources.accounts === "token_expired" || sources.overview === "token_expired") return "token_expired";
  if (sources.accounts === "permission_denied" && sources.overview === "permission_denied") return "permission_denied";
  if (sources.accounts === "rate_limited" && sources.overview === "rate_limited") return "rate_limited";
  if (sources.overview === "loading" && sources.posts === "loading") return "loading";

  const dataStates = [sources.overview, sources.dailySeries, sources.posts];
  const hasSuccess = dataStates.some((s) => s === "success" || s === "partial");
  const hasFailure = dataStates.some(
    (s) => s === "error" || s === "permission_denied" || s === "token_expired" || s === "rate_limited"
  );
  const hasLoading = dataStates.some((s) => s === "loading");

  if (hasSuccess && (hasFailure || hasLoading)) return "partial";
  if (!hasSuccess && hasFailure) {
    if (dataStates.includes("token_expired")) return "token_expired";
    if (dataStates.includes("permission_denied")) return "permission_denied";
    if (dataStates.includes("rate_limited")) return "rate_limited";
    return "error";
  }
  if (dataStates.every((s) => s === "empty")) return "empty";
  if (hasSuccess) return "success";
  return "empty";
}

export function isVictoriaSocialContextUsable(params: {
  accountsState: SocialDataState;
  accountsCount: number;
  overviewState: SocialDataState;
  postsState: SocialDataState;
}): boolean {
  if (params.accountsCount <= 0) return false;
  if (
    params.accountsState === "loading" ||
    params.accountsState === "idle" ||
    params.accountsState === "token_expired"
  ) {
    return false;
  }
  const overviewUsable =
    params.overviewState === "success" ||
    params.overviewState === "partial" ||
    params.overviewState === "empty";
  const postsUsable =
    params.postsState === "success" ||
    params.postsState === "partial" ||
    params.postsState === "empty";
  return overviewUsable || postsUsable;
}

