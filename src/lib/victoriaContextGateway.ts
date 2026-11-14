import {
  buildVictoriaAnalysisContext,
  validateVictoriaAnalysisContext,
  generateSeniorStructuredAnalysis,
  sanitizeVictoriaOutputText,
  buildSuggestedQuestionsForContext,
  VictoriaSessionController,
  VICTORIA_REQUEST_TIMEOUT_MS,
  VICTORIA_ANALYTICAL_TEMPERATURE,
  type VictoriaAnalysisContext,
  type VictoriaSurfaceId,
  type VictoriaEntityLevel,
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
  ragDocuments?: CuratedRagDocument[];
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
    t.allClicks ?? raw.all_clicks ?? linkClicks
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
    has_creative_data: Boolean(raw.creative_url || raw.thumbnail_url),
    has_copy_data: Boolean(raw.body || raw.headline),
    has_audience_targeting: Boolean(raw.targeting),
    has_landing_page_data: false,
    has_crm_funnel_data: false,
    account_max_cpl_target: isComparableWithAccountCpl ? input.accountMaxCplTarget ?? null : null,
    comparable_same_objective_avg: isComparableWithAccountCpl ? input.sameObjectiveAvgCost ?? null : null,
    rag_documents: input.ragDocuments || [],
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

  for (const c of input.campaigns || []) {
    const cost = Number(c.cost || 0);
    const impr = Number(c.impressions || 0);
    const reach = Number(c.reach || 0);
    const clicks = Number(c.clicks || 0);
    const allClicks = Number(c.allClicks ?? c.clicks ?? 0);
    const conv = Number(c.conversions || 0);

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

    if (cls.category === "MESSAGES") {
      messageResults += conv;
      messageSpend += cost;
    }
  }

  const finalReach =
    input.deduplicatedAccountReach && input.deduplicatedAccountReach > 0
      ? Number(input.deduplicatedAccountReach)
      : summedReach;

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
    odax_objective: "OUTCOME_ENGAGEMENT",
    optimization_goal: "CONVERSATIONS",
    result_type: "MESSAGES",
    result_indicator: "actions:onsite_conversion.messaging_conversation_started_7d",
    spend: totalSpend,
    impressions: totalImpressions,
    reach: finalReach,
    reach_scope:
      input.deduplicatedAccountReach && input.deduplicatedAccountReach > 0
        ? "deduplicated_account"
        : "daily_sum_non_deduplicated",
    link_clicks: totalLinkClicks,
    all_clicks: totalAllClicks,
    conversions: messageResults,
    metric_vector: vector,
    account_max_cpl_target: input.accountMaxCplTarget ?? null,
    comparable_same_objective_avg:
      messageResults > 0 ? messageSpend / messageResults : null,
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
  onToken?: (partialText: string, ctx: VictoriaAnalysisContext) => void;
  timeoutMs?: number;
}

export interface ExecuteVictoriaDiagnosticResult {
  aborted: boolean;
  timedOut: boolean;
  fromCache: boolean;
  status: "SUCCESS" | "FALLBACK_STRUCTURED" | "INSUFFICIENT_DATA" | "ABORTED" | "TIMEOUT";
  text: string;
  suggestedQuestions: string[];
  context: VictoriaAnalysisContext;
}

/**
 * Executa uma chamada governada à Victoria AI com:
 * 1. Validação prévia do contrato VictoriaAnalysisContext
 * 2. Isolamento de sessão e cancelamento (AbortController) ao trocar de entidade
 * 3. Timeout estrito de 20 segundos
 * 4. Verificação de request_id + analysis_context_hash antes de cada token
 * 5. Sanitização pós-resposta contra vazamento de unidade cruzada (CPL em Alcance / R$ 7,93)
 */
export async function executeGovernedVictoriaDiagnostic(
  params: ExecuteVictoriaDiagnosticParams
): Promise<ExecuteVictoriaDiagnosticResult> {
  const { ctx } = params;
  const sessionCtrl = params.controller || globalVictoriaSessionController;
  const suggestedQuestions = buildSuggestedQuestionsForContext(ctx);

  // 1. Validar contrato antes de invocar modelo
  const validation = validateVictoriaAnalysisContext(ctx);
  if (!validation.valid && validation.degradedResponse) {
    return {
      aborted: false,
      timedOut: false,
      fromCache: false,
      status: "INSUFFICIENT_DATA",
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

  if (reqSession.cachedResponse) {
    if (params.onToken) {
      params.onToken(reqSession.cachedResponse, ctx);
    }
    return {
      aborted: false,
      timedOut: false,
      fromCache: true,
      status: "SUCCESS",
      text: reqSession.cachedResponse,
      suggestedQuestions,
      context: ctx,
    };
  }

  // 3. Configurar timeout de 20s acoplado ao AbortSignal da sessão
  const timeoutMs = params.timeoutMs ?? VICTORIA_REQUEST_TIMEOUT_MS;
  let timedOut = false;
  const timeoutController = new AbortController();
  const onSessionAbort = () => timeoutController.abort("SESSION_SWITCHED");
  reqSession.signal.addEventListener("abort", onSessionAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    timeoutController.abort("VICTORIA_TIMEOUT_20S");
  }, timeoutMs);

  const structuredBaseline = generateSeniorStructuredAnalysis(ctx);

  try {
    const promptToSend =
      params.userPrompt ||
      [
        `Gere uma análise técnica sênior para a entidade selecionada seguindo rigorosamente o contrato VictoriaAnalysisContext (${ctx.contract_version}).`,
        `Comece obrigatoriamente respondendo: "O que esta campanha foi configurada para otimizar?"`,
        `Use exclusivamente a unidade oficial "${ctx.result_indicator.cost_label}" (${ctx.result_indicator.unit}) e os números exatos do contexto JSON abaixo.`,
        `Proibido usar o termo "CPL" se a categoria for REACH, INSTAGRAM_PROFILE, LANDING_PAGE_VIEWS, LINK_CLICKS, VIDEO_VIEWS ou ENGAGEMENT.`,
        `Proibido comparar CPM com custo por conversa de outra campanha.`,
      ].join("\n");

    const response = await fetch(params.endpointUrl, {
      method: "POST",
      signal: timeoutController.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.authToken || params.anonKey}`,
        apikey: params.anonKey,
      },
      body: JSON.stringify({
        action: "chat",
        readOnly: true,
        temperature: VICTORIA_ANALYTICAL_TEMPERATURE,
        selectedAccountId: ctx.ad_account_id !== "all" ? ctx.ad_account_id : undefined,
        analysisContext: ctx,
        messages: [{ role: "user", content: promptToSend }],
        externalContext: `CONTRATO CANÔNICO VICTORIA (${ctx.contract_version}) [HASH: ${ctx.analysis_context_hash}]:\n${JSON.stringify(ctx, null, 2)}\n\nESTRUTURA SÊNIOR DE REFERÊNCIA:\n${structuredBaseline}`,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    let rawAccumulated = "";

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
        data?.diagnosis || data?.insight || data?.reply || data?.message || "";
    }

    if (
      !sessionCtrl.canRenderToken({
        requestId: reqSession.requestId,
        contextHash: reqSession.contextHash,
        accountId: ctx.ad_account_id,
        entityLevel: ctx.entity_level,
        entityId: ctx.entity_id,
      })
    ) {
      return {
        aborted: true,
        timedOut: false,
        fromCache: false,
        status: "ABORTED",
        text: "",
        suggestedQuestions,
        context: ctx,
      };
    }

    const sanitized = sanitizeVictoriaOutputText(rawAccumulated, ctx);
    // Se a resposta vier vazia, com erro de provedor ou sem a seção obrigatória de otimização, usa a estrutura sênior determinística validada
    const isValidSeniorResponse =
      sanitized.length >= 120 &&
      !/^\[ERRO\s+\d+\]/i.test(sanitized) &&
      !/tive um problema de comunicação/i.test(sanitized) &&
      sanitized.includes("O que esta campanha foi configurada para otimizar?");

    const finalText = isValidSeniorResponse ? sanitized : structuredBaseline;

    sessionCtrl.commitResponse({
      cacheKey: reqSession.cacheKey,
      requestId: reqSession.requestId,
      contextHash: reqSession.contextHash,
      accountId: ctx.ad_account_id,
      entityLevel: ctx.entity_level,
      entityId: ctx.entity_id,
      text: finalText,
    });

    if (params.onToken) {
      params.onToken(finalText, ctx);
    }

    return {
      aborted: false,
      timedOut: false,
      fromCache: false,
      status: isValidSeniorResponse ? "SUCCESS" : "FALLBACK_STRUCTURED",
      text: finalText,
      suggestedQuestions,
      context: ctx,
    };
  } catch (err: any) {
    if (reqSession.signal.aborted && !timedOut) {
      return {
        aborted: true,
        timedOut: false,
        fromCache: false,
        status: "ABORTED",
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
      })
    ) {
      sessionCtrl.commitResponse({
        cacheKey: reqSession.cacheKey,
        requestId: reqSession.requestId,
        contextHash: reqSession.contextHash,
        accountId: ctx.ad_account_id,
        entityLevel: ctx.entity_level,
        entityId: ctx.entity_id,
        text: fallbackText,
      });
      if (params.onToken) {
        params.onToken(fallbackText, ctx);
      }
    }

    return {
      aborted: false,
      timedOut,
      fromCache: false,
      status: timedOut ? "TIMEOUT" : "FALLBACK_STRUCTURED",
      text: fallbackText,
      suggestedQuestions,
      context: ctx,
    };
  } finally {
    clearTimeout(timer);
    reqSession.signal.removeEventListener("abort", onSessionAbort);
  }
}
