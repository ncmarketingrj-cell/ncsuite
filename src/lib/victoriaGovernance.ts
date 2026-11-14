import {
  classifyMetaEvent,
  computeUnitCost,
  type MetaConversionCategory,
} from "./metricsDomain.ts";

export type ProposalStatus = "pending" | "approved" | "rejected" | "error" | "expired";
export type ProposalRisk = "low" | "medium" | "high";

export interface GovernedActionProposal {
  proposalId: string;
  type: string;
  campaignId?: string;
  campaignName?: string;
  accountId?: string | null;
  accountName?: string | null;
  value?: number;
  reportId?: string;
  title?: string;
  description?: string;
  risk: ProposalRisk;
  windowStart?: string;
  windowEnd?: string;
  contextHash?: string;
  ruleId?: string;
  justificationSource?: "user_command" | "diagnostic_rule" | "ui_navigation";
  evidence?: {
    cost?: number;
    results?: number;
    unitLabel?: string;
    unitCostFormatted?: string;
    targetCpl?: number;
    targetSourceLabel?: string;
  };
  createdAt: string;
  expiresAt: string;
  params?: Record<string, any>;
}

const READONLY_EXPLICIT_NEGATIONS = [
  /somente\s+leitura/i,
  /apenas\s+analis/i,
  /só\s+analis/i,
  /so\s+analis/i,
  /sem\s+alterar/i,
  /n[aã]o\s+alter/i,
  /n[aã]o\s+execut/i,
  /n[aã]o\s+paus/i,
  /sem\s+pausar/i,
  /sem\s+editar/i,
  /n[aã]o\s+mud/i,
  /somente\s+diagn[oó]stico/i,
  /apenas\s+relat[oó]rio/i,
];

const EXPLICIT_MUTATION_INTENT = [
  /\bpausar\b/i,
  /\bpause\b/i,
  /\bescalar\s+(verba|or[çc]amento|campanha)/i,
  /\b(aumentar|aumente|reduzir|reduza|ajustar|ajuste|alterar|altere|atualizar|atualize|definir|defina)\s+(o\s+|a\s+)?(verba|or[çc]amento|budget)/i,
  /\bclonar\s+funil\b/i,
  /\bcriar\s+campanha\b/i,
  /\baprovo\b/i,
  /\bexecute\s+a\b/i,
];

const PURE_ANALYSIS_INTENT = [
  /\banalis(ar|e)\b/i,
  /\ban[aá]lise\b/i,
  /\bdiagnostic(ar|o)\b/i,
  /\brelat[oó]rio\b/i,
  /\bmelhores\s+e\s+piores\b/i,
  /\bqual\s+(o\s+|a\s+)?(cpl|cpa|cpm|ctr|cvr|gasto|investimento|resultado)/i,
  /\bcomo\s+foi\b/i,
  /\bresum(ir|o)\b/i,
  /\bdesempenho\b/i,
  /\bcompar(ar|ativo)\b/i,
  /\baudit(ar|oria)\b/i,
  /\bexplique\b/i,
  /\bquais\s+campanhas\b/i,
];

/**
 * Determina de forma determinística se a solicitação do usuário é somente-leitura (ID 09 / Fixture C).
 * Em consultas informativas ou quando houver negação explícita de alteração, proíbe geração/execução de ações mutáveis.
 */
export function isReadOnlyAnalysisRequest(
  messageText: string,
  explicitReadOnly?: boolean
): boolean {
  if (explicitReadOnly === true) return true;
  const text = (messageText || "").trim();
  if (!text) return true;

  if (READONLY_EXPLICIT_NEGATIONS.some((re) => re.test(text))) {
    return true;
  }

  if (EXPLICIT_MUTATION_INTENT.some((re) => re.test(text))) {
    return false;
  }

  if (PURE_ANALYSIS_INTENT.some((re) => re.test(text))) {
    return true;
  }

  // Padrão seguro: se não houver comando explícito de alteração, tratar como leitura
  return true;
}

export function stripJsonActionBlocks(markdown: string): {
  cleanText: string;
  parsedAction: any | null;
} {
  const raw = String(markdown || "");
  const match = raw.match(/```json:action\s*([\s\S]*?)\s*```/i);
  if (!match) {
    return { cleanText: raw, parsedAction: null };
  }
  let parsedAction: any | null = null;
  try {
    parsedAction = JSON.parse(match[1]);
  } catch {
    parsedAction = null;
  }
  const cleanText = raw.replace(/```json:action[\s\S]*?```/gi, "").trim();
  return { cleanText, parsedAction };
}

export function computeProposalContextHash(input: {
  accountId?: string | null;
  campaignId?: string | null;
  windowStart?: string | null;
  windowEnd?: string | null;
  type: string;
  value?: number | null;
}): string {
  const canonical = [
    input.accountId || "all",
    input.campaignId || "none",
    input.windowStart || "",
    input.windowEnd || "",
    input.type,
    input.value !== undefined && input.value !== null ? Number(input.value).toFixed(2) : "",
  ].join("|");

  let h = 2166136261;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function isMutatingActionType(actionType: string): boolean {
  return (
    actionType === "update_budget" ||
    actionType === "pause_campaign" ||
    actionType === "clone_funnel_snapshot" ||
    actionType === "toggle_status"
  );
}

/**
 * Enriquecimento governado de proposta de ação (IDs 10 e 44).
 * Nunca marca ação mutável como risco baixo/"Seguro".
 */
export function buildActionProposal(
  rawAction: Record<string, any>,
  context: {
    accountId?: string | null;
    accountName?: string | null;
    windowStart?: string;
    windowEnd?: string;
    daysCount?: number;
    currentBudget?: number | null;
    explicitUserRequest?: boolean;
    operationalMode?: "READ_ONLY_ANALYSIS" | "ACTION_PROPOSAL";
    nowIso?: string;
    ttlMinutes?: number;
    readOnly?: boolean;
  } = {}
): GovernedActionProposal | null {
  if (!rawAction || !rawAction.type) return null;
  const actionType = String(rawAction.type);
  const mutating = isMutatingActionType(actionType);

  if ((context.readOnly || context.operationalMode !== "ACTION_PROPOSAL") && mutating) {
    return null;
  }

  if (mutating) {
    // Exige pedido explícito, janela >= 3 dias, ID numérico Meta e orçamento atual conhecido (se ajuste de orçamento)
    if (!context.explicitUserRequest) return null;
    if ((context.daysCount ?? 0) < 3) return null;
    const cid = String(rawAction.campaignId || "").trim();
    if (!/^\d{6,}$/.test(cid)) return null;
    if (
      actionType === "update_budget" &&
      (context.currentBudget === null || context.currentBudget === undefined || Number(context.currentBudget) <= 0)
    ) {
      return null;
    }
  }

  const nowDate = context.nowIso ? new Date(context.nowIso) : new Date();
  const safeNow = isNaN(nowDate.getTime()) ? new Date() : nowDate;
  const ttlMs = (context.ttlMinutes ?? 30) * 60 * 1000;
  const expiresAt = rawAction.expiresAt || new Date(safeNow.getTime() + ttlMs).toISOString();

  const risk: ProposalRisk = !mutating
    ? "low"
    : actionType === "pause_campaign" || actionType === "toggle_status"
    ? "high"
    : rawAction.risk === "high"
    ? "high"
    : "medium";

  const accountId = rawAction.accountId ?? context.accountId ?? null;
  const windowStart = rawAction.windowStart ?? context.windowStart;
  const windowEnd = rawAction.windowEnd ?? context.windowEnd;
  const contextHash =
    rawAction.contextHash ||
    computeProposalContextHash({
      accountId,
      campaignId: rawAction.campaignId,
      windowStart,
      windowEnd,
      type: actionType,
      value: rawAction.value,
    });

  return {
    proposalId: rawAction.proposalId || `prop_${contextHash}_${safeNow.getTime().toString(36)}`,
    type: actionType,
    campaignId: rawAction.campaignId,
    campaignName: rawAction.campaignName,
    accountId,
    accountName: rawAction.accountName ?? context.accountName ?? null,
    value: rawAction.value !== undefined ? Number(rawAction.value) : undefined,
    reportId: rawAction.reportId,
    title: rawAction.title,
    description: rawAction.description,
    risk,
    windowStart,
    windowEnd,
    contextHash,
    ruleId: rawAction.ruleId || (mutating ? "victoria-manual-proposal" : undefined),
    justificationSource:
      rawAction.justificationSource || (mutating ? "diagnostic_rule" : "ui_navigation"),
    evidence: rawAction.evidence,
    createdAt: rawAction.createdAt || safeNow.toISOString(),
    expiresAt,
    params: rawAction.params,
  };
}

export interface ActionValidationInput {
  proposal: Partial<GovernedActionProposal> | null | undefined;
  status?: ProposalStatus;
  readOnly?: boolean;
  hasPermission?: boolean;
  userConfirmed?: boolean;
  confirmPhrase?: string;
  currentAccountId?: string | null;
  currentWindowStart?: string;
  currentWindowEnd?: string;
  nowIso?: string;
}

export interface ActionValidationResult {
  allowed: boolean;
  reason?: string;
  code?:
    | "INVALID_PROPOSAL"
    | "READ_ONLY"
    | "PERMISSION_DENIED"
    | "ALREADY_EXECUTED"
    | "REJECTED"
    | "EXPIRED"
    | "CONTEXT_MISMATCH"
    | "CONFIRMATION_REQUIRED";
}

/**
 * Valida pré-condições de governança antes de qualquer escrita em campanha/funil (ID 44).
 */
export function validateActionExecution(input: ActionValidationInput): ActionValidationResult {
  const { proposal } = input;
  if (!proposal || !proposal.type) {
    return { allowed: false, code: "INVALID_PROPOSAL", reason: "Proposta de ação inválida ou incompleta." };
  }

  const mutating = isMutatingActionType(proposal.type);
  if (input.readOnly && mutating) {
    return {
      allowed: false,
      code: "READ_ONLY",
      reason: "Sessão em modo somente-leitura não permite executar mutações.",
    };
  }

  if (input.hasPermission === false) {
    return {
      allowed: false,
      code: "PERMISSION_DENIED",
      reason: "Usuário sem permissão de edição para aplicar alterações.",
    };
  }

  if (input.status === "approved") {
    return {
      allowed: false,
      code: "ALREADY_EXECUTED",
      reason: "Ação já executada anteriormente (bloqueio de idempotência).",
    };
  }

  if (input.status === "rejected") {
    return {
      allowed: false,
      code: "REJECTED",
      reason: "Proposta rejeitada não pode ser executada.",
    };
  }

  if (input.status === "expired") {
    return {
      allowed: false,
      code: "EXPIRED",
      reason: "Proposta expirada; gere uma nova análise antes de executar.",
    };
  }

  const nowMs = input.nowIso ? Date.parse(input.nowIso) : Date.now();
  if (proposal.expiresAt) {
    const expMs = Date.parse(proposal.expiresAt);
    if (!Number.isNaN(expMs) && nowMs > expMs) {
      return {
        allowed: false,
        code: "EXPIRED",
        reason: "A janela de validade desta proposta expirou.",
      };
    }
  }

  if (mutating) {
    if (
      (proposal.type === "update_budget" || proposal.type === "pause_campaign") &&
      !proposal.campaignId
    ) {
      return {
        allowed: false,
        code: "INVALID_PROPOSAL",
        reason: "Campanha de destino não identificada na proposta.",
      };
    }

    if (
      proposal.accountId &&
      input.currentAccountId &&
      input.currentAccountId !== "all" &&
      proposal.accountId !== input.currentAccountId
    ) {
      return {
        allowed: false,
        code: "CONTEXT_MISMATCH",
        reason: "Conta selecionada atualmente diverge da conta da proposta.",
      };
    }

    if (
      proposal.windowStart &&
      proposal.windowEnd &&
      input.currentWindowStart &&
      input.currentWindowEnd &&
      (proposal.windowStart !== input.currentWindowStart ||
        proposal.windowEnd !== input.currentWindowEnd)
    ) {
      return {
        allowed: false,
        code: "CONTEXT_MISMATCH",
        reason: "Janela de datas mudou desde que a proposta foi gerada.",
      };
    }

    if (input.userConfirmed !== true) {
      return {
        allowed: false,
        code: "CONFIRMATION_REQUIRED",
        reason: "Confirmação explícita do operador é obrigatória.",
      };
    }

    if (proposal.risk === "high" && input.confirmPhrase !== "CONFIRMAR") {
      return {
        allowed: false,
        code: "CONFIRMATION_REQUIRED",
        reason: 'Ação de alto risco exige digitação explícita de "CONFIRMAR".',
      };
    }
  }

  return { allowed: true };
}

export function formatVictoriaUnitCost(params: {
  cost: number;
  resultCount: number;
  category: MetaConversionCategory;
}): { value: number | null; formatted: string } {
  const unitCost = computeUnitCost(params.cost, params.resultCount, params.category);
  if (unitCost === null || !Number.isFinite(unitCost)) {
    return { value: null, formatted: "Não calculável" };
  }
  return {
    value: unitCost,
    formatted: `R$ ${unitCost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
  };
}

/**
 * Classifica campanha para contexto da Victoria preservando result_type real (IDs 11 e 12).
 */
export function buildVictoriaCampaignMetricsLine(input: {
  clientName: string;
  campaignName: string;
  status: string;
  rawObjective?: string | null;
  optimizationGoal?: string | null;
  resultType?: string | null;
  cost: number;
  conversions: number;
  clicks: number;
  impressions: number;
  reach: number;
  isVehicleContext?: boolean;
}) {
  const cls = classifyMetaEvent({
    campaignName: input.campaignName,
    rawObjective: input.rawObjective ?? undefined,
    optimizationGoal: input.optimizationGoal ?? undefined,
    resultType: input.resultType ?? undefined,
    isVehicleContext: input.isVehicleContext ?? true,
  });

  const denominator =
    cls.category === "REACH"
      ? input.reach > 0
        ? input.reach
        : input.conversions
      : cls.category === "LINK_CLICKS" && input.conversions <= 0
      ? input.clicks
      : input.conversions;

  const { value: costPerRes, formatted: costPerResFormatted } = formatVictoriaUnitCost({
    cost: input.cost,
    resultCount: denominator,
    category: cls.category,
  });

  const ctr = input.impressions > 0 ? (input.clicks / input.impressions) * 100 : 0;

  return {
    classification: cls,
    resultValue: denominator,
    resultLabel: cls.unitPlural,
    costLabel: cls.costUnitLabel,
    costPerRes,
    costPerResFormatted,
    ctr,
    line: `- [${input.clientName}] ${input.campaignName} | Evento real: ${cls.unitPlural} (${cls.category}) | ${input.status} | Invest: R$${input.cost.toFixed(2)} | ${cls.unitPlural}: ${denominator} | ${cls.costUnitLabel}: ${costPerResFormatted} | Alcance: ${input.reach} | Impressões: ${input.impressions} | CTR: ${ctr.toFixed(2)}%`,
  };
}

/**
 * Sanitização de texto RSS/HTML e validação de evidência de artigo do Radar (ID 26).
 */
export function sanitizeRssText(raw?: string | null): string {
  if (!raw) return "";
  return String(raw)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isHomepageOnlyUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return true;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    const cleanPath = u.pathname.replace(/\/+$/, "");
    return cleanPath === "" && !u.search;
  } catch {
    return true;
  }
}

export function canonicalizeRagUrl(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  try {
    const u = new URL(String(rawUrl).trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    u.hash = "";
    for (const param of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]) {
      u.searchParams.delete(param);
    }
    return u.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function computeRagSemanticHash(title: string, content: string): string {
  const norm = `${ sanitizeRssText(title).toLowerCase() }|${ sanitizeRssText(content).toLowerCase().slice(0, 600) }`;
  let hash = 2166136261;
  for (let i = 0; i < norm.length; i++) {
    hash ^= norm.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `rag_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export interface RagComplianceAuditResult {
  compliant: boolean;
  recommendedApprovalStatus: "APPROVED" | "PENDING_REVIEW" | "REJECTED";
  recommendedEvidenceLevel: "OFFICIAL_DOC" | "INTERNAL_RULE" | "CASE_STUDY" | "MARKET_NEWS" | "OPINION" | "UNVERIFIED";
  violations: string[];
  sanitizedContent: string;
}

/**
 * Audita documentos RAG contra alegações universais sem fonte ("54% mais conversas", "CPL pela metade", "80% conversão"),
 * promessas ilegais/não conformes de crédito ("sem consulta SPC/Serasa") e HTML/URLs truncadas (Seção 7).
 */
export function auditRagDocumentCompliance(input: {
  title: string;
  content: string;
  source?: string | null;
  url?: string | null;
  isRssIngestion?: boolean;
}): RagComplianceAuditResult {
  const violations: string[] = [];
  const rawContent = String(input.content || "");
  const rawTitle = String(input.title || "");
  const combined = `${rawTitle}\n${rawContent}`;

  if (/54%\s+mais\s+(conversas|cliques|leads)/i.test(combined)) {
    violations.push("UNVERIFIED_UNIVERSAL_STAT_54_PCT");
  }
  if (/CPL\s+efetivo\s+pela\s+metade|CPL\s+reduzido\s+pela\s+metade/i.test(combined)) {
    violations.push("UNVERIFIED_UNIVERSAL_STAT_HALF_CPL");
  }
  if (/0-5\s*min\s*(?:→|->|:)\s*80%\+?\s*(?:de\s*)?convers[ãa]o|probabilidade\s+de\s+fechamento\s+cai\s+em\s+80%/i.test(combined)) {
    violations.push("UNVERIFIED_UNIVERSAL_STAT_80_PCT_SLA");
  }
  if (/sem\s+consulta\s+(?:ao\s+)?SPC|sem\s+consulta\s+Serasa|CPF\s+negativado\s+aprovado/i.test(combined)) {
    violations.push("NON_COMPLIANT_CREDIT_CLAIM_SPC");
  }
  if (/&lt;a\s+href=|<a\s+href=/i.test(rawContent)) {
    violations.push("RAW_UNSANITIZED_HTML_LINK");
  }

  let sanitizedContent = sanitizeRssText(rawContent)
    .replace(/sem\s+consulta\s+(?:ao\s+)?SPC(?:\s*\/\s*Serasa)?/gi, "sujeito à análise formal de crédito")
    .replace(/54%\s+mais\s+(conversas|cliques|leads)/gi, "maior engajamento visual observado em testes internos")
    .replace(/reduz\s+o\s+CPL\s+efetivo\s+pela\s+metade/gi, "contribui para preservar a intenção do lead");

  if (violations.length > 0) {
    return {
      compliant: false,
      recommendedApprovalStatus: "REJECTED",
      recommendedEvidenceLevel: "UNVERIFIED",
      violations,
      sanitizedContent,
    };
  }

  // Coletas RSS nunca entram direto como verdade operacional sem revisão humana (Seção 7)
  if (input.isRssIngestion) {
    return {
      compliant: true,
      recommendedApprovalStatus: "PENDING_REVIEW",
      recommendedEvidenceLevel: "MARKET_NEWS",
      violations: [],
      sanitizedContent,
    };
  }

  return {
    compliant: true,
    recommendedApprovalStatus: "APPROVED",
    recommendedEvidenceLevel: "INTERNAL_RULE",
    violations: [],
    sanitizedContent,
  };
}

