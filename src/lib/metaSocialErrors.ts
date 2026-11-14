// Pure Meta Social API error classification helper (shared between frontend and unit tests).

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
    lower.includes("invalid oauth")
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
    lower.includes("not authorized")
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
    lower.includes("rate limit")
  ) {
    return { state: "rate_limited", message: rawMsg };
  }
  return { state: "error", message: rawMsg };
}
