import {
  buildVictoriaAnalysisContext,
  validateVictoriaAnalysisContext,
  generateSeniorStructuredAnalysis,
  generateQuickExecutiveAnalysis,
  sanitizeVictoriaOutputText,
  stripTechnicalArtifactsForQuickMode,
  enforceVictoriaPostLlmGuardrails,
  resolveVictoriaResponseMode,
  extractUserTargetFromPrompt,
  matchesCanonicalContextIdentity,
  buildSuggestedQuestionsForContext,
  VictoriaSessionController,
  VICTORIA_REQUEST_TIMEOUT_MS,
  VICTORIA_ANALYTICAL_TEMPERATURE,
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  VICTORIA_DEFAULT_OPERATIONAL_MODE,
  type VictoriaAnalysisContext,
  type VictoriaSurfaceId,
  type VictoriaEntityLevel,
  type VictoriaOperationalMode,
  type CuratedRagDocument,
} from "./victoriaContract.ts";
import {
  classifyMetaEvent,
  emptyMetricVector,
  accumulateMetricVector,
  type MetricVector,
} from "./metricsDomain.ts";
import type { CreativeAdRecord, FatigueDiagnostic } from "./creativeIntelligenceDomain.ts";

export interface MetricasItemAdapterInput {
  item: any;
  surface?: VictoriaSurfaceId;
  route?: string;
  userId?: string | null;
  conversationId?: string | null;
  accountId: string;
  accountName: string;
  dateFrom: string;
  dateTo: string;
  preset?: string | null;
  lastSyncAt?: string | null;
  accountMaxCplTarget?: number | null;
  sameObjectiveAvgCost?: number | null;
  sameObjectivePeerCount?: number;
  sameObjectiveBenchmarkCriteria?: string | null;
  ragDocuments?: CuratedRagDocument[];
  operationalMode?: VictoriaOperationalMode;
  siblingEntities?: any[];
  userPrompt?: string | null;
  userTargetAmount?: number | null;
}

/**
 * Adaptador canônico para itens da tela de Métricas (Campanha, Conjunto, Anúncio),
 * Gaveta Lateral (Campaign Inspector) e VictoriaFloatingChat.
 * Garante que campanhas de Alcance (REACH) NUNCA recebam referência de CPL de Mensagens (ex: R$ 7,93).
 */
export function buildContextFromMetricasItem(
  input: MetricasItemAdapterInput
): VictoriaAnalysisContext {
  const raw = input.item || {};
  const t = raw.t || {};

  const rawType = raw.entityLevel || raw.type;
  const entityLevel: VictoriaEntityLevel =
    rawType === "adset" || rawType === "conjunto"
      ? "adset"
      : rawType === "ad" || rawType === "anuncio"
        ? "ad"
        : rawType === "account"
          ? "account"
          : "campaign";

  const entityId = String(
    raw.external_id || raw.id || raw.campaign_id || "unknown_entity"
  );
  const entityName = String(raw.name || "Campanha Meta Ads");
  const rawObjective =
    raw.objective || raw.campaigns?.objective || raw.rawObjective || null;
  const resultType =
    raw.result_type || raw.resultType || t.result_type || null;
  const resultIndicator =
    raw.result_indicator || raw.resultIndicator || t.result_indicator || null;
  const optimizationGoal =
    raw.optimization_goal || raw.optimizationGoal || t.optimization_goal || null;

  const cls = classifyMetaEvent({
    campaignName: entityName,
    rawObjective: rawObjective ?? undefined,
    optimizationGoal: optimizationGoal ?? undefined,
    resultType: resultType ?? undefined,
    resultsIndicator: resultIndicator ?? undefined,
    isVehicleContext: false,
  });

  // Regra crítica (Falha 2): NUNCA passar média de custo por conversa (ex: R$ 7,93) para campanhas de REACH/VISITAS/CLIQUES
  const isComparableWithAccountCpl =
    cls.category === "MESSAGES" || cls.category === "LEADS";

  const spend = Number(t.cost ?? raw.cost ?? raw.spend ?? 0);
  const impressions = Number(t.impressions ?? raw.impressions ?? 0);
  const reach = Number(t.reach ?? raw.reach ?? 0);
  const linkClicks = Number(
    t.linkClicks ??
      t.link_clicks ??
      t.inline_link_clicks ??
      raw.linkClicks ??
      raw.link_clicks ??
      raw.inline_link_clicks ??
      t.clicks ??
      raw.clicks ??
      0
  );
  const allClicks = Number(
    t.allClicks ??
      t.all_clicks ??
      raw.allClicks ??
      raw.all_clicks ??
      raw.clicks ??
      t.clicks ??
      linkClicks
  );
  const conversions =
    cls.category === "REACH"
      ? reach > 0
        ? reach
        : Number(t.conversions ?? raw.conversions ?? 0)
      : Number(t.conversions ?? raw.conversions ?? 0);

  const parsedPromptTarget = input.userPrompt
    ? extractUserTargetFromPrompt(input.userPrompt)
    : null;
  const resolvedUserTargetAmount =
    typeof input.userTargetAmount === "number" && Number.isFinite(input.userTargetAmount) && input.userTargetAmount > 0
      ? input.userTargetAmount
      : parsedPromptTarget?.amount ?? null;

  return buildVictoriaAnalysisContext({
    source_surface: input.surface || "metricas",
    route: input.route || "/metricas",
    user_id: input.userId ?? null,
    conversation_id: input.conversationId ?? null,
    ad_account_id: String(raw.ad_account_id || input.accountId || "all"),
    ad_account_name: input.accountName || raw.adAccountName || "Conta Meta Ads",
    entity_level: entityLevel,
    entity_id: entityId,
    internal_id: raw.id ? String(raw.id) : null,
    external_id: raw.external_id ? String(raw.external_id) : null,
    entity_name: entityName,
    effective_status: String(raw.derived_status?.code || raw.delivery_status || raw.status || "ACTIVE"),
    parent_ids: {
      account_id: String(raw.ad_account_id || input.accountId || ""),
      campaign_id: raw.campaign_id ? String(raw.campaign_id) : null,
      adset_id: raw.adset_id ? String(raw.adset_id) : null,
      client_id: raw.client_id ? String(raw.client_id) : null,
    },
    date_from: input.dateFrom,
    date_to: input.dateTo,
    preset: input.preset ?? null,
    last_sync_at: input.lastSyncAt ?? null,
    odax_objective: rawObjective,
    optimization_goal: optimizationGoal,
    result_type: resultType,
    result_indicator: resultIndicator,
    spend,
    daily_budget: Number(raw.daily_budget) > 0 ? Number(raw.daily_budget) : Number(raw.budget) > 0 ? Number(raw.budget) : null,
    lifetime_budget: Number(raw.lifetime_budget) > 0 ? Number(raw.lifetime_budget) : null,
    impressions,
    reach,
    reach_scope: "deduplicated_entity",
    frequency: t.freq ? Number(t.freq) : null,
    link_clicks: linkClicks,
    all_clicks: allClicks,
    conversions,
    purchase_value: Number(t.purchaseValue ?? raw.purchase_value ?? raw.purchaseValue ?? 0) || null,
    has_creative_data: Boolean(raw.creative_image_url || raw.thumbnail_url || raw.creative_url),
    has_copy_data: Boolean(raw.creative_body || raw.creative_title || raw.body || raw.headline),
    has_audience_targeting: Boolean(raw.targeting),
    creative_media_url: raw.creative_image_url || raw.thumbnail_url || raw.creative_url || null,
    creative_format: raw.creative_format || null,
    creative_body: raw.creative_body || raw.body || null,
    creative_title: raw.creative_title || raw.headline || null,
    creative_cta_type: raw.call_to_action_type || null,
    placement_summary: raw.placement_summary || null,
    has_landing_page_data: false,
    has_crm_funnel_data: false,
    account_max_cpl_target: isComparableWithAccountCpl ? input.accountMaxCplTarget ?? null : null,
    comparable_same_objective_avg:
      input.sameObjectiveAvgCost &&
        input.sameObjectiveAvgCost > 0 &&
        (typeof input.sameObjectivePeerCount === "number"
          ? input.sameObjectivePeerCount > 0
          : isComparableWithAccountCpl)
        ? input.sameObjectiveAvgCost
        : null,
    comparable_peer_count: input.sameObjectivePeerCount,
    comparable_benchmark_criteria: input.sameObjectiveBenchmarkCriteria ?? null,
    user_target_amount: resolvedUserTargetAmount,
    user_target_raw_text: parsedPromptTarget?.rawText ?? null,
    rag_documents: input.ragDocuments || [],
    operational_mode: input.operationalMode || VICTORIA_DEFAULT_OPERATIONAL_MODE,
    sibling_entities: (input.siblingEntities || []).map((sib: any) => ({
      id: sib.id ? String(sib.id) : undefined,
      external_id: sib.external_id ? String(sib.external_id) : undefined,
      name: sib.name ? String(sib.name) : undefined,
      spend: Number(sib.t?.cost ?? sib.cost ?? sib.spend ?? 0),
      reach: Number(sib.t?.reach ?? sib.reach ?? 0),
      impressions: Number(sib.t?.impressions ?? sib.impressions ?? 0),
      cpm: Number(sib.t?.cpm ?? sib.cpm ?? 0),
      cost_per_result: sib.t?.cpl !== undefined ? Number(sib.t.cpl) : null,
      result_value: Number(sib.t?.conversions ?? sib.conversions ?? 0),
    })),
  });
}

export interface AccountSurfaceAdapterInput {
  surface: VictoriaSurfaceId;
  route: string;
  userId?: string | null;
  conversationId?: string | null;
  accountId: string;
  accountName: string;
  dateFrom: string;
  dateTo: string;
  lastSyncAt?: string | null;
  campaigns: Array<{
    id?: string;
    name?: string;
    objective?: string | null;
    result_type?: string | null;
    result_indicator?: string | null;
    optimization_goal?: string | null;
    cost?: number;
    conversions?: number;
    clicks?: number;
    allClicks?: number;
    impressions?: number;
    reach?: number;
  }>;
  deduplicatedAccountReach?: number | null;
  accountMaxCplTarget?: number | null;
  ragDocuments?: CuratedRagDocument[];
  userPrompt?: string | null;
  userTargetAmount?: number | null;
}

/**
 * Adaptador canônico para superfícies de Conta (Command Center, Cockpit, Relatórios, Auditoria, Sidebar, Victoria Hub).
 * Separa resultados por tipo em MetricVector e NUNCA soma conversas com alcance/visitas/cliques.
 */
export function buildContextFromAccountSummary(
  input: AccountSurfaceAdapterInput
): VictoriaAnalysisContext {
  const vector: MetricVector = emptyMetricVector();
  let totalSpend = 0;
  let totalImpressions = 0;
  let summedReach = 0;
  let totalLinkClicks = 0;
  let totalAllClicks = 0;
  let messageResults = 0;
  let messageSpend = 0;
  let purchaseResults = 0;
  let purchaseSpend = 0;
  let totalPurchaseValue = 0;

  for (const c of input.campaigns || []) {
    const cost = Number(c.cost || 0);
    const impr = Number(c.impressions || 0);
    const reach = Number(c.reach || 0);
    const clicks = Number(c.clicks || 0);
    const allClicks = Number(c.allClicks ?? c.clicks ?? 0);
    const conv = Number(c.conversions || 0);
    const purchaseVal = Number((c as any).purchase_value ?? (c as any).purchaseValue ?? 0);

    const cls = classifyMetaEvent({
      campaignName: c.name || "",
      rawObjective: c.objective ?? undefined,
      optimizationGoal: c.optimization_goal ?? undefined,
      resultType: c.result_type ?? undefined,
      resultsIndicator: c.result_indicator ?? undefined,
      isVehicleContext: false,
    });

    const resultVal = cls.category === "REACH" ? (reach > 0 ? reach : conv) : conv;
    accumulateMetricVector(vector, cls.category, resultVal, c.result_indicator ?? undefined);

    totalSpend += cost;
    totalImpressions += impr;
    summedReach += reach;
    totalLinkClicks += clicks;
    totalAllClicks += allClicks;
    totalPurchaseValue += purchaseVal;

    if (cls.category === "MESSAGES") {
      messageResults += conv;
      messageSpend += cost;
    } else if (cls.category === "PURCHASES") {
      purchaseResults += conv;
      purchaseSpend += cost;
    }
  }

  const finalReach =
    input.deduplicatedAccountReach && input.deduplicatedAccountReach > 0
      ? Number(input.deduplicatedAccountReach)
      : summedReach;
  const roas = totalSpend > 0 && totalPurchaseValue > 0 ? totalPurchaseValue / totalSpend : null;
  const primaryIsPurchases = messageResults === 0 && (purchaseResults > 0 || totalPurchaseValue > 0);

  const parsedPromptTarget = input.userPrompt
    ? extractUserTargetFromPrompt(input.userPrompt)
    : null;
  const resolvedUserTargetAmount =
    typeof input.userTargetAmount === "number" && Number.isFinite(input.userTargetAmount) && input.userTargetAmount > 0
      ? input.userTargetAmount
      : parsedPromptTarget?.amount ?? null;

  return buildVictoriaAnalysisContext({
    source_surface: input.surface,
    route: input.route,
    user_id: input.userId ?? null,
    conversation_id: input.conversationId ?? null,
    ad_account_id: input.accountId || "all",
    ad_account_name: input.accountName || "Consolidado de Contas",
    entity_level: "account",
    entity_id: input.accountId || "all",
    entity_name: input.accountName || "Consolidado de Contas",
    effective_status: "ACTIVE",
    date_from: input.dateFrom,
    date_to: input.dateTo,
    last_sync_at: input.lastSyncAt ?? null,
    odax_objective: primaryIsPurchases ? "OUTCOME_SALES" : "OUTCOME_ENGAGEMENT",
    optimization_goal: primaryIsPurchases ? "OFFSITE_CONVERSIONS" : "CONVERSATIONS",
    result_type: primaryIsPurchases ? "PURCHASES" : "MESSAGES",
    result_indicator: primaryIsPurchases
      ? "actions:offsite_conversion.fb_pixel_purchase"
      : "actions:onsite_conversion.messaging_conversation_started_7d",
    spend: totalSpend,
    impressions: totalImpressions,
    reach: finalReach,
    reach_scope:
      input.deduplicatedAccountReach && input.deduplicatedAccountReach > 0
        ? "deduplicated_account"
        : "daily_sum_non_deduplicated",
    link_clicks: totalLinkClicks,
    all_clicks: totalAllClicks,
    conversions: primaryIsPurchases ? purchaseResults : messageResults,
    purchase_value: totalPurchaseValue,
    metric_vector: vector,
    account_max_cpl_target: input.accountMaxCplTarget ?? null,
    comparable_same_objective_avg: primaryIsPurchases
      ? (purchaseResults > 0 ? purchaseSpend / purchaseResults : null)
      : (messageResults > 0 ? messageSpend / messageResults : null),
    user_target_amount: resolvedUserTargetAmount,
    user_target_raw_text: parsedPromptTarget?.rawText ?? null,
    rag_documents: input.ragDocuments || [],
  });
}

export const globalVictoriaSessionController = new VictoriaSessionController();

export interface ExecuteVictoriaDiagnosticParams {
  ctx: VictoriaAnalysisContext;
  controller?: VictoriaSessionController;
  endpointUrl: string;
  authToken?: string | null;
  anonKey: string;
  userPrompt?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  onToken?: (partialText: string, ctx: VictoriaAnalysisContext) => void;
  timeoutMs?: number;
  requireFull10Sections?: boolean;
}

export interface ExecuteVictoriaDiagnosticResult {
  aborted: boolean;
  timedOut: boolean;
  fromCache: boolean;
  status: "SUCCESS" | "FALLBACK_STRUCTURED" | "INSUFFICIENT_DATA" | "ABORTED" | "TIMEOUT" | "CONTEXT_MISMATCH_BLOCKED";
  responseOrigin: "generative" | "deterministic_fallback";
  fallbackReason?: string | null;
  latencyMs?: number;
  text: string;
  suggestedQuestions: string[];
  context: VictoriaAnalysisContext;
  ragCitations?: Array<{
    id: string;
    title: string;
    version: string;
    evidence_level: string;
    approval_status: string;
  }>;
  ragCandidatesCount?: number;
  responseMeta?: Record<string, any> | null;
}

/**
 * Executa uma chamada governada à Victoria AI (Contrato 2026.11.4) com:
 * 1. Validação prévia do contrato VictoriaAnalysisContext
 * 2. Isolamento de sessão e cancelamento (AbortController) ao trocar de entidade
 * 3. Streaming SSE real com timeout de conexão/primeiro token (20s) + orçamento total de stream (55s)
 * 4. Verificação estrita dos 10 campos de identidade
 * 5. Distinção explícita entre Resposta Generativa (IA) e Fallback Estruturado Determinístico
 */
export async function executeGovernedVictoriaDiagnostic(
  params: ExecuteVictoriaDiagnosticParams
): Promise<ExecuteVictoriaDiagnosticResult> {
  const promptTarget = extractUserTargetFromPrompt(params.userPrompt);
  const ctx: VictoriaAnalysisContext =
    promptTarget && (!params.ctx.user_target || params.ctx.user_target.amount !== promptTarget.amount)
      ? {
          ...params.ctx,
          user_target: {
            amount: promptTarget.amount,
            raw_text: promptTarget.rawText,
          },
        }
      : params.ctx;
  const sessionCtrl = params.controller || globalVictoriaSessionController;
  const suggestedQuestions = buildSuggestedQuestionsForContext(ctx);
  const responseMode = resolveVictoriaResponseMode({
    userPrompt: params.userPrompt,
    explicitRequireFull10Sections: params.requireFull10Sections,
  });
  const requireFull10 = responseMode === "detailed_audit";
  const callStartedAt = Date.now();

  // 1. Validar contrato antes de invocar modelo
  const validation = validateVictoriaAnalysisContext(ctx);
  if (!validation.valid && validation.degradedResponse) {
    return {
      aborted: false,
      timedOut: false,
      fromCache: false,
      status: "INSUFFICIENT_DATA",
      responseOrigin: "deterministic_fallback",
      fallbackReason: "insufficient_context_data",
      latencyMs: Date.now() - callStartedAt,
      text: validation.degradedResponse,
      suggestedQuestions,
      context: ctx,
    };
  }

  // 2. Iniciar requisição isolada (cancela anterior se houver troca de campanha)
  const reqSession = sessionCtrl.beginRequest({
    ctx,
    userId: ctx.user_id,
    conversationId: ctx.conversation_id,
    responseMode,
  });

  if (reqSession.cachedResponse && !params.userPrompt) {
    const cachedGuard = enforceVictoriaPostLlmGuardrails(reqSession.cachedResponse, ctx, {
      requireFull10Sections: requireFull10,
      userPrompt: params.userPrompt,
    });
    if (!cachedGuard.replacedByDeterministic) {
      if (params.onToken) {
        params.onToken(cachedGuard.text, ctx);
      }
      return {
        aborted: false,
        timedOut: false,
        fromCache: true,
        status: "SUCCESS",
        responseOrigin: "generative",
        fallbackReason: null,
        latencyMs: Date.now() - callStartedAt,
        text: cachedGuard.text,
        suggestedQuestions,
        context: ctx,
      };
    }
  }

  // 3. Dois timers: primeiro byte/token (20s) e orçamento total de conclusão do stream (55s)
  const firstTokenTimeoutMs = params.timeoutMs ?? VICTORIA_REQUEST_TIMEOUT_MS;
  const totalStreamTimeoutMs = Math.max(firstTokenTimeoutMs * 2.5, 55000);
  let timedOut = false;
  let receivedFirstByte = false;
  const timeoutController = new AbortController();
  const onSessionAbort = () => timeoutController.abort("SESSION_SWITCHED");
  reqSession.signal.addEventListener("abort", onSessionAbort, { once: true });

  const firstTokenTimer = setTimeout(() => {
    if (!receivedFirstByte) {
      timedOut = true;
      timeoutController.abort("VICTORIA_FIRST_TOKEN_TIMEOUT");
    }
  }, firstTokenTimeoutMs);

  const totalTimer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort("VICTORIA_TOTAL_STREAM_TIMEOUT");
  }, totalStreamTimeoutMs);

  const structuredBaseline = requireFull10
    ? generateSeniorStructuredAnalysis(ctx)
    : generateQuickExecutiveAnalysis(ctx, { userPrompt: params.userPrompt });

  try {
    const promptToSend =
      params.userPrompt ||
      (requireFull10
        ? [
            `Gere uma auditoria técnica detalhada em 10 seções para a entidade selecionada seguindo rigorosamente o contrato VictoriaAnalysisContext (${VICTORIA_CONTRACT_VERSION}).`,
            `Comece obrigatoriamente respondendo: "O que esta campanha foi configurada para otimizar?" e inclua todas as 10 seções obrigatórias.`,
            `Use exclusivamente a unidade oficial "${ctx.result_indicator.cost_label}" (${ctx.result_indicator.unit}) e os números exatos do contexto.`,
            `Proibido usar o termo "CPL" se a categoria for REACH, INSTAGRAM_PROFILE, LANDING_PAGE_VIEWS, LINK_CLICKS, VIDEO_VIEWS ou ENGAGEMENT.`,
            `Proibido citar qualquer outra campanha da conta ou comparar CPM com custo por conversa.`,
          ].join("\n")
        : [
            `Responda de forma clara, executiva e prática entre 120 e 200 palavras nesta ordem exata:`,
            `1. Veredito (1 frase direta)`,
            `2. Resultado principal (investimento, ${ctx.result_indicator.label_plural} e ${ctx.result_indicator.cost_label} no período, comparando com meta/referência se existir)`,
            `3. Leitura do funil (apenas sinais úteis como cliques no link, CTR de link, CPC de link, frequência e acesso ao criativo)`,
            `4. O que fazer agora (até 3 ações específicas em ordem de prioridade, sem recomendar apenas "esperar" ou "ver CRM")`,
            `5. Como validar (o que medir e por qual critério, sem prometer certeza)`,
            `PROIBIDO exibir IDs, hashes, versões de contrato/prompt, nomes internos de eventos da API, tabelas ou UUIDs RAG.`,
            `Use exclusivamente a unidade oficial "${ctx.result_indicator.cost_label}" e não cite outras campanhas.`,
          ].join("\n"));

    const outgoingMessages =
      params.conversationHistory && params.conversationHistory.length > 0
        ? params.conversationHistory
        : [{ role: "user" as const, content: promptToSend }];

    const response = await fetch(params.endpointUrl, {
      method: "POST",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.authToken || params.anonKey}`,
        apikey: params.anonKey,
        "X-Victoria-Contract-Version": VICTORIA_CONTRACT_VERSION,
        "X-Victoria-Prompt-Version": VICTORIA_PROMPT_VERSION,
        "X-Victoria-Request-Id": ctx.request_id,
        "X-Victoria-Context-Hash": ctx.analysis_context_hash,
      },
      body: JSON.stringify({
        action: "chat",
        mode: "sse",
        stream: true,
        requireFull10Sections: requireFull10,
        response_mode: responseMode,
        readOnly: ctx.operational_mode !== "ACTION_PROPOSAL",
        operational_mode: ctx.operational_mode || VICTORIA_DEFAULT_OPERATIONAL_MODE,
        contract_version: VICTORIA_CONTRACT_VERSION,
        prompt_version: VICTORIA_PROMPT_VERSION,
        temperature: VICTORIA_ANALYTICAL_TEMPERATURE,
        selectedAccountId: ctx.ad_account_id !== "all" ? ctx.ad_account_id : undefined,
        analysisContext: ctx,
        messages: outgoingMessages,
        externalContext: `CONTRATO CANÔNICO VICTORIA (${VICTORIA_CONTRACT_VERSION}) [HASH: ${ctx.analysis_context_hash}]:\n${JSON.stringify(ctx, null, 2)}`,
      }),
    });

    receivedFirstByte = true;
    clearTimeout(firstTokenTimer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    let rawAccumulated = "";
    let responseMeta: Record<string, any> | null = null;
    let ragCitations: ExecuteVictoriaDiagnosticResult["ragCitations"] = [];
    let ragCandidatesCount = 0;
    let serverUsedFallback = false;
    let serverFallbackReason: string | null = null;
    let serverLatencyMs: number | undefined;
    let upstreamTruncated = false;

    const processSseLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) return;
      const jsonStr = trimmed.slice(6).trim();
      if (!jsonStr || jsonStr === "[DONE]") return;
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed.victoria_meta) {
          responseMeta = parsed.victoria_meta;
          if (typeof parsed.victoria_meta.rag_candidates_count === "number") {
            ragCandidatesCount = parsed.victoria_meta.rag_candidates_count;
          }
          const metaDocs = parsed.victoria_meta.rag_citations ?? parsed.victoria_meta.rag_docs;
          if (Array.isArray(metaDocs) && metaDocs.length > 0) {
            ragCitations = metaDocs;
          }
          if (parsed.victoria_meta.response_origin === "deterministic_fallback") {
            serverUsedFallback = true;
          }
        }
        if (parsed.victoria_final) {
          const vf = parsed.victoria_final;
          if (vf.response_origin === "deterministic_fallback" || vf.replaced_by_deterministic) {
            serverUsedFallback = true;
            serverFallbackReason = Array.isArray(vf.guardrail_reasons) ? vf.guardrail_reasons.join(", ") : "server_fallback";
          }
          if (vf.truncated_by_length) {
            upstreamTruncated = true;
          }
          if (typeof vf.rag_candidates_count === "number") {
            ragCandidatesCount = vf.rag_candidates_count;
          }
          if (Array.isArray(vf.rag_citations)) {
            ragCitations = vf.rag_citations;
          }
          if (typeof vf.final_text === "string" && vf.final_text.trim()) {
            rawAccumulated = vf.final_text;
          }
          if (typeof vf.latency_ms === "number") {
            serverLatencyMs = vf.latency_ms;
          }
        }
        if (parsed.choices?.[0]?.finish_reason === "length") {
          upstreamTruncated = true;
        }
        const chunk = parsed.choices?.[0]?.delta?.content || "";
        if (chunk) {
          rawAccumulated += chunk;
          const sanitizedPartial = sanitizeVictoriaOutputText(rawAccumulated, ctx);
          const safePartial = requireFull10
            ? sanitizedPartial
            : stripTechnicalArtifactsForQuickMode(sanitizedPartial);
          if (
            params.onToken &&
            safePartial &&
            sessionCtrl.canRenderToken({
              requestId: reqSession.requestId,
              contextHash: reqSession.contextHash,
              accountId: ctx.ad_account_id,
              entityLevel: ctx.entity_level,
              entityId: ctx.entity_id,
              dateFrom: ctx.period.date_from,
              dateTo: ctx.period.date_to,
              resultIndicator: ctx.result_indicator.code,
              contractVersion: ctx.contract_version,
              promptVersion: ctx.prompt_version,
            })
          ) {
            params.onToken(safePartial, ctx);
          }
        }
      } catch { }
    };

    if (contentType.includes("text/event-stream") && response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (
          !sessionCtrl.canRenderToken({
            requestId: reqSession.requestId,
            contextHash: reqSession.contextHash,
            accountId: ctx.ad_account_id,
            entityLevel: ctx.entity_level,
            entityId: ctx.entity_id,
            dateFrom: ctx.period.date_from,
            dateTo: ctx.period.date_to,
            resultIndicator: ctx.result_indicator.code,
            contractVersion: ctx.contract_version,
            promptVersion: ctx.prompt_version,
          })
        ) {
          try {
            await reader.cancel();
          } catch { }
          return {
            aborted: true,
            timedOut: false,
            fromCache: false,
            status: "ABORTED",
            responseOrigin: "deterministic_fallback",
            fallbackReason: "entity_switched",
            latencyMs: Date.now() - callStartedAt,
            text: "",
            suggestedQuestions,
            context: ctx,
          };
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          processSseLine(line);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim()) {
        for (const line of buffer.split("\n")) {
          processSseLine(line);
        }
      }
    } else {
      const data = await response.json().catch(() => null);
      rawAccumulated =
        data?.diagnosis || data?.insight || data?.reply || data?.message || data?.content || "";
      if (data && typeof data === "object") {
        serverUsedFallback = Boolean(data.replaced_by_deterministic || data.response_origin === "deterministic_fallback");
        serverFallbackReason = Array.isArray(data.guardrail_reasons) ? data.guardrail_reasons.join(", ") : null;
        serverLatencyMs = typeof data.latency_ms === "number" ? data.latency_ms : undefined;
        responseMeta = {
          request_id: data.request_id,
          analysis_context_hash: data.analysis_context_hash,
          ad_account_id: data.ad_account_id,
          entity_level: data.entity_level,
          entity_id: data.entity_id,
          date_from: data.date_from,
          date_to: data.date_to,
          result_indicator: data.result_indicator,
          contract_version: data.contract_version,
          prompt_version: data.prompt_version,
          rag_citations: data.rag_citations,
          rag_candidates_count: data.rag_candidates_count,
        };
        if (typeof data.rag_candidates_count === "number") {
          ragCandidatesCount = data.rag_candidates_count;
        }
        if (Array.isArray(data.rag_citations)) {
          ragCitations = data.rag_citations;
        }
      }
    }

    if (
      !sessionCtrl.canRenderToken({
        requestId: reqSession.requestId,
        contextHash: reqSession.contextHash,
        accountId: ctx.ad_account_id,
        entityLevel: ctx.entity_level,
        entityId: ctx.entity_id,
        dateFrom: ctx.period.date_from,
        dateTo: ctx.period.date_to,
        resultIndicator: ctx.result_indicator.code,
        contractVersion: ctx.contract_version,
        promptVersion: ctx.prompt_version,
      })
    ) {
      return {
        aborted: true,
        timedOut: false,
        fromCache: false,
        status: "ABORTED",
        responseOrigin: "deterministic_fallback",
        fallbackReason: "entity_switched",
        latencyMs: Date.now() - callStartedAt,
        text: "",
        suggestedQuestions,
        context: ctx,
      };
    }

    // 4. Verificação estrita dos 10 campos obrigatórios de identidade antes da renderização
    if (responseMeta) {
      const idMatch = matchesCanonicalContextIdentity(ctx, {
        request_id: responseMeta.request_id,
        analysis_context_hash: responseMeta.analysis_context_hash,
        ad_account_id: responseMeta.ad_account_id,
        entity_level: responseMeta.entity_level,
        entity_id: responseMeta.entity_id,
        date_from: responseMeta.date_from,
        date_to: responseMeta.date_to,
        result_indicator: responseMeta.result_indicator,
        contract_version: responseMeta.contract_version,
        prompt_version: responseMeta.prompt_version,
      });
      if (!idMatch.valid) {
        console.warn("[VICTORIA_CONTEXT_MISMATCH]", idMatch.mismatches);
        return {
          aborted: false,
          timedOut: false,
          fromCache: false,
          status: "CONTEXT_MISMATCH_BLOCKED",
          responseOrigin: "deterministic_fallback",
          fallbackReason: `context_mismatch:${idMatch.mismatches.join(",")}`,
          latencyMs: Date.now() - callStartedAt,
          text: structuredBaseline,
          suggestedQuestions,
          context: ctx,
          ragCitations,
          ragCandidatesCount: Math.max(ragCandidatesCount, ragCitations?.length || 0),
          responseMeta,
        };
      }
    }

    const enrichedCtx: VictoriaAnalysisContext =
      ragCitations && ragCitations.length > 0 && ctx.governance_and_benchmarks.rag_documents.length === 0
        ? {
          ...ctx,
          governance_and_benchmarks: {
            ...ctx.governance_and_benchmarks,
            rag_documents: ragCitations.map((c) => ({
              id: c.id,
              title: c.title,
              author: "NC Performance Strategy Team",
              source: "Base Curada RAG NC Suite",
              url: null,
              published_at: null,
              ingested_at: new Date().toISOString(),
              valid_until: null,
              category: "rag",
              region: "BR-RJ",
              objective: ctx.optimization.category,
              evidence_level: (c.evidence_level as any) || "INTERNAL_RULE",
              version: c.version || VICTORIA_CONTRACT_VERSION,
              approval_status: (c.approval_status as any) || "APPROVED",
              content: "",
            })),
          },
        }
        : ctx;

    const enforced = enforceVictoriaPostLlmGuardrails(rawAccumulated, enrichedCtx, {
      requireFull10Sections: requireFull10,
      userPrompt: params.userPrompt,
      truncatedByLength: upstreamTruncated,
    });
    const finalText = enforced.text;
    const isDeterministic = serverUsedFallback || enforced.replacedByDeterministic;
    const fallbackReason = serverUsedFallback
      ? serverFallbackReason || "server_fallback"
      : enforced.replacedByDeterministic
        ? enforced.reasons.join(", ")
        : null;

    if (!params.userPrompt && !isDeterministic) {
      sessionCtrl.commitResponse({
        cacheKey: reqSession.cacheKey,
        requestId: reqSession.requestId,
        contextHash: reqSession.contextHash,
        accountId: ctx.ad_account_id,
        entityLevel: ctx.entity_level,
        entityId: ctx.entity_id,
        dateFrom: ctx.period.date_from,
        dateTo: ctx.period.date_to,
        resultIndicator: ctx.result_indicator.code,
        contractVersion: ctx.contract_version,
        promptVersion: ctx.prompt_version,
        text: finalText,
      });
    }

    if (params.onToken) {
      params.onToken(finalText, enrichedCtx);
    }

    return {
      aborted: false,
      timedOut: false,
      fromCache: false,
      status: isDeterministic ? "FALLBACK_STRUCTURED" : "SUCCESS",
      responseOrigin: isDeterministic ? "deterministic_fallback" : "generative",
      fallbackReason,
      latencyMs: serverLatencyMs ?? (Date.now() - callStartedAt),
      text: finalText,
      suggestedQuestions,
      context: enrichedCtx,
      ragCitations,
      ragCandidatesCount: Math.max(ragCandidatesCount, ragCitations?.length || 0),
      responseMeta,
    };
  } catch (err: any) {
    if (reqSession.signal.aborted && !timedOut) {
      return {
        aborted: true,
        timedOut: false,
        fromCache: false,
        status: "ABORTED",
        responseOrigin: "deterministic_fallback",
        fallbackReason: "aborted",
        latencyMs: Date.now() - callStartedAt,
        text: "",
        suggestedQuestions,
        context: ctx,
      };
    }

    const fallbackText = structuredBaseline;
    if (
      sessionCtrl.canRenderToken({
        requestId: reqSession.requestId,
        contextHash: reqSession.contextHash,
        accountId: ctx.ad_account_id,
        entityLevel: ctx.entity_level,
        entityId: ctx.entity_id,
        dateFrom: ctx.period.date_from,
        dateTo: ctx.period.date_to,
        resultIndicator: ctx.result_indicator.code,
        contractVersion: ctx.contract_version,
        promptVersion: ctx.prompt_version,
      })
    ) {
      if (params.onToken) {
        params.onToken(fallbackText, ctx);
      }
    }

    return {
      aborted: false,
      timedOut,
      fromCache: false,
      status: timedOut ? "TIMEOUT" : "FALLBACK_STRUCTURED",
      responseOrigin: "deterministic_fallback",
      fallbackReason: timedOut ? "connection_or_stream_timeout" : err?.message || "network_error",
      latencyMs: Date.now() - callStartedAt,
      text: fallbackText,
      suggestedQuestions,
      context: ctx,
    };
  } finally {
    clearTimeout(firstTokenTimer);
    clearTimeout(totalTimer);
    reqSession.signal.removeEventListener("abort", onSessionAbort);
  }
}

export interface CreativeItemAdapterInput {
  record: CreativeAdRecord;
  fatigue?: FatigueDiagnostic | null;
  sameObjectivePeers?: CreativeAdRecord[];
  dateFrom: string;
  dateTo: string;
  lastSyncAt?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  accountMaxCplTarget?: number | null;
  ragDocuments?: CuratedRagDocument[];
  userPrompt?: string | null;
  userTargetAmount?: number | null;
}

/**
 * Constrói o contexto canônico VictoriaAnalysisContext para /criativos em modo READ_ONLY_ANALYSIS,
 * preservando objetivo, optimization_goal, janela de atribuição, pares homogêneos e limitações.
 */
export function buildContextFromCreativeItem(
  input: CreativeItemAdapterInput
): VictoriaAnalysisContext {
  const { record, sameObjectivePeers = [], fatigue } = input;
  const peers = sameObjectivePeers.filter(
    (p) =>
      p.id !== record.id &&
      p.adAccountId === record.adAccountId &&
      p.resultCategory === record.resultCategory &&
      (p.spend > 0 || p.results > 0)
  );
  const peerSpend = peers.reduce((s, p) => s + p.spend, 0);
  const peerResults = peers.reduce((s, p) => s + p.results, 0);
  const sameObjectiveAvg = peerResults > 0 && peerSpend > 0 ? peerSpend / peerResults : null;
  const isComparableWithAccountCpl =
    record.resultCategory === "MESSAGES" || record.resultCategory === "LEADS";

  const parsedPromptTarget = input.userPrompt
    ? extractUserTargetFromPrompt(input.userPrompt)
    : null;
  const resolvedUserTargetAmount =
    typeof input.userTargetAmount === "number" && Number.isFinite(input.userTargetAmount) && input.userTargetAmount > 0
      ? input.userTargetAmount
      : parsedPromptTarget?.amount ?? null;

  return buildVictoriaAnalysisContext({
    source_surface: "criativos",
    route: "/criativos",
    user_id: input.userId ?? null,
    conversation_id: input.conversationId ?? null,
    ad_account_id: record.adAccountId,
    ad_account_name: record.accountName,
    entity_level: "ad",
    entity_id: record.id,
    internal_id: record.id,
    external_id: record.externalId,
    entity_name: record.name,
    effective_status: record.effectiveStatus,
    parent_ids: {
      account_id: record.adAccountId,
      campaign_id: record.campaignId,
      adset_id: record.adSetId,
      client_id: null,
    },
    date_from: input.dateFrom,
    date_to: input.dateTo,
    last_sync_at: input.lastSyncAt ?? null,
    odax_objective: record.rawObjective,
    optimization_goal: record.optimizationGoal,
    result_type: record.resultLabel,
    result_indicator: record.resultIndicator || record.resultLabel,
    spend: record.spend,
    impressions: record.impressions,
    reach: record.reach,
    reach_scope: "deduplicated_entity",
    frequency: record.frequency,
    link_clicks: record.linkClicks,
    all_clicks: record.allClicks,
    conversions: record.results,
    purchase_value: record.purchaseValue,
    has_creative_data: record.hasRealThumbnail,
    has_copy_data: Boolean(record.creativeBody || record.creativeTitle || record.creativeName),
    has_audience_targeting: false,
    has_landing_page_data: record.resultCategory === "LANDING_PAGE_VIEWS",
    has_crm_funnel_data: false,
    account_max_cpl_target: isComparableWithAccountCpl ? input.accountMaxCplTarget ?? null : null,
    comparable_same_objective_avg: sameObjectiveAvg,
    comparable_peer_count: peers.length,
    comparable_benchmark_criteria:
      peers.length > 0
        ? `Pares de mesma conta (${record.accountName}) e mesmo objetivo/evento (${record.resultLabel})`
        : null,
    rag_documents: [
      ...(input.ragDocuments || []),
      ...(fatigue
        ? [
            {
              id: `fatigue-${record.id}`,
              title: `Diagnóstico de fadiga (${fatigue.status})`,
              author: "NC Creative Intelligence",
              source: "asset_metrics_daily",
              url: null,
              published_at: null,
              ingested_at: new Date().toISOString(),
              valid_until: null,
              category: record.resultCategory,
              region: "BR",
              objective: record.rawObjective || record.resultCategory,
              evidence_level: "INTERNAL_RULE" as const,
              version: "1.0",
              approval_status: "APPROVED" as const,
              content: [
                `Status fadiga: ${fatigue.status} (confiança ${fatigue.confidence}).`,
                `Janela de atribuição: ${record.attributionWindow}.`,
                `Disponibilidade da métrica: ${record.availability} (${record.availabilityNote || "ok"}).`,
                fatigue.signals.length > 0 ? `Sinais: ${fatigue.signals.join("; ")}.` : "Sem sinais fortes de queda no recorte.",
                `Fatores alternativos que podem explicar variação além do criativo: ${fatigue.alternativeFactors.join("; ")}.`,
              ].join(" "),
            },
          ]
        : []),
    ],
    operational_mode: VICTORIA_DEFAULT_OPERATIONAL_MODE,
    user_target_amount: resolvedUserTargetAmount,
    user_target_raw_text: parsedPromptTarget?.rawText ?? null,
    sibling_entities: peers.slice(0, 12).map((p) => ({
      id: p.id,
      external_id: p.externalId || undefined,
      name: p.name,
      spend: p.spend,
      reach: p.reach,
      impressions: p.impressions,
      cpm: p.cpm || 0,
      cost_per_result: p.unitCost,
      result_value: p.results,
    })),
  });
}
