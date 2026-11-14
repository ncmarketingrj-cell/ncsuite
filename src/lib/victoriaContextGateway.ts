import {
  buildVictoriaAnalysisContext,
  validateVictoriaAnalysisContext,
  generateSeniorStructuredAnalysis,
  sanitizeVictoriaOutputText,
  enforceVictoriaPostLlmGuardrails,
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

  const entityLevel: VictoriaEntityLevel =
    raw.type === "adset" || raw.type === "conjunto"
      ? "adset"
      : raw.type === "ad" || raw.type === "anuncio"
      ? "ad"
      : raw.type === "account"
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
    t.linkClicks ?? t.clicks ?? raw.inline_link_clicks ?? raw.clicks ?? 0
  );
  const allClicks = Number(
    t.allClicks ?? raw.allClicks ?? raw.all_clicks ?? linkClicks
  );
  const conversions =
    cls.category === "REACH"
      ? reach > 0
        ? reach
        : Number(t.conversions ?? raw.conversions ?? 0)
      : Number(t.conversions ?? raw.conversions ?? 0);

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
    effective_status: String(raw.delivery_status || raw.status || "ACTIVE"),
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
    daily_budget: raw.daily_budget ? Number(raw.daily_budget) : raw.budget ? Number(raw.budget) : null,
    lifetime_budget: raw.lifetime_budget ? Number(raw.lifetime_budget) : null,
    impressions,
    reach,
    reach_scope: "deduplicated_entity",
    frequency: t.freq ? Number(t.freq) : null,
    link_clicks: linkClicks,
    all_clicks: allClicks,
    conversions,
    purchase_value: Number(t.purchaseValue ?? raw.purchase_value ?? raw.purchaseValue ?? 0) || null,
    has_creative_data: Boolean(raw.creative_url || raw.thumbnail_url),
    has_copy_data: Boolean(raw.body || raw.headline),
    has_audience_targeting: Boolean(raw.targeting),
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
  const { ctx } = params;
  const sessionCtrl = params.controller || globalVictoriaSessionController;
  const suggestedQuestions = buildSuggestedQuestionsForContext(ctx);
  const requireFull10 = params.requireFull10Sections !== false;
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
  });

  if (reqSession.cachedResponse && !params.userPrompt) {
    const cachedGuard = enforceVictoriaPostLlmGuardrails(reqSession.cachedResponse, ctx, {
      requireFull10Sections: requireFull10,
    });
    if (params.onToken) {
      params.onToken(cachedGuard.text, ctx);
    }
    return {
      aborted: false,
      timedOut: false,
      fromCache: true,
      status: cachedGuard.replacedByDeterministic ? "FALLBACK_STRUCTURED" : "SUCCESS",
      responseOrigin: cachedGuard.replacedByDeterministic ? "deterministic_fallback" : "generative",
      fallbackReason: cachedGuard.replacedByDeterministic ? cachedGuard.reasons.join(",") : null,
      latencyMs: Date.now() - callStartedAt,
      text: cachedGuard.text,
      suggestedQuestions,
      context: ctx,
    };
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

  const structuredBaseline = generateSeniorStructuredAnalysis(ctx);

  try {
    const promptToSend =
      params.userPrompt ||
      [
        `Gere uma análise técnica sênior para a entidade selecionada seguindo rigorosamente o contrato VictoriaAnalysisContext (${VICTORIA_CONTRACT_VERSION}).`,
        `Comece obrigatoriamente respondendo: "O que esta campanha foi configurada para otimizar?" e inclua todas as 10 seções obrigatórias.`,
        `Use exclusivamente a unidade oficial "${ctx.result_indicator.cost_label}" (${ctx.result_indicator.unit}) e os números exatos do contexto.`,
        `Proibido usar o termo "CPL" se a categoria for REACH, INSTAGRAM_PROFILE, LANDING_PAGE_VIEWS, LINK_CLICKS, VIDEO_VIEWS ou ENGAGEMENT.`,
        `Proibido citar qualquer outra campanha da conta ou comparar CPM com custo por conversa.`,
      ].join("\n");

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
    let serverUsedFallback = false;
    let serverFallbackReason: string | null = null;
    let serverLatencyMs: number | undefined;

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
          } catch {}
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
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          const jsonStr = trimmed.slice(6);
          if (jsonStr === "[DONE]") continue;
          try {
            const parsed = JSON.parse(jsonStr);
            if (parsed.victoria_meta) {
              responseMeta = parsed.victoria_meta;
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
              if (Array.isArray(vf.rag_citations) && vf.rag_citations.length > 0) {
                ragCitations = vf.rag_citations;
              }
              if (typeof vf.final_text === "string" && vf.final_text.trim()) {
                rawAccumulated = vf.final_text;
              }
              if (typeof vf.latency_ms === "number") {
                serverLatencyMs = vf.latency_ms;
              }
            }
            const chunk = parsed.choices?.[0]?.delta?.content || "";
            if (chunk) {
              rawAccumulated += chunk;
              const safePartial = sanitizeVictoriaOutputText(rawAccumulated, ctx);
              if (
                params.onToken &&
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
          } catch {}
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
        };
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
