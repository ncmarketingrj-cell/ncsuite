import test from "node:test";
import assert from "node:assert/strict";

import {
  isReadOnlyAnalysisRequest,
  stripJsonActionBlocks,
  buildActionProposal,
  validateActionExecution,
  sanitizeRssText,
  isHomepageOnlyUrl,
  canonicalizeRagUrl,
  computeRagSemanticHash,
  auditRagDocumentCompliance,
} from "../src/lib/victoriaGovernance.ts";

import {
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  CANONICAL_METRIC_REGISTRY,
  buildVictoriaAnalysisContext,
  validateVictoriaAnalysisContext,
  validateMetricComparison,
  calibrateAnalysisConfidence,
  buildSuggestedQuestionsForContext,
  sanitizeVictoriaOutputText,
  generateSeniorStructuredAnalysis,
  hasAllMandatory10Sections,
  matchesCanonicalContextIdentity,
  isLegacyVictoriaVersion,
  enforceVictoriaPostLlmGuardrails,
  VictoriaSessionController,
  type VictoriaSurfaceId,
} from "../src/lib/victoriaContract.ts";

import {
  buildContextFromMetricasItem,
  executeGovernedVictoriaDiagnostic,
} from "../src/lib/victoriaContextGateway.ts";

import type { MetaConversionCategory } from "../src/lib/metricsDomain.ts";

// ============================================================================
// 1. MANDATORY PRODUCTION FIXTURES (Fly Garage — 2026-11-13)
// ============================================================================

test("Fixture 1 (Fly Garage 13/11/2026 — Mensagens): NC - MSG - 29/06 — Cópia (R$ 150,58 | 19 conversas | R$ 7,93/conversa)", () => {
  const ctx = buildContextFromMetricasItem({
    item: {
      id: "120210999001",
      name: "NC - MSG - 29/06 — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      destinationType: "WHATSAPP",
      resultType: "MESSAGES",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      cost: 150.58,
      conversions: 19,
      impressions: 9436,
      reach: 7196,
      clicks: 137,
      inline_link_clicks: 137,
      all_clicks: 167,
      budget: 150,
    },
    surface: "metricas",
    route: "/metricas",
    userId: "user_henrique",
    conversationId: "conv_fly_msg",
    accountId: "act_3177396632405159",
    accountName: "Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    preset: "yesterday",
    accountMaxCplTarget: 35,
  });

  const validation = validateVictoriaAnalysisContext(ctx);
  assert.equal(validation.valid, true);
  assert.equal(validation.status, "VALID");
  assert.equal(ctx.contract_version, VICTORIA_CONTRACT_VERSION);
  assert.equal(ctx.prompt_version, VICTORIA_PROMPT_VERSION);
  assert.equal(ctx.optimization.category, "MESSAGES");
  assert.equal(ctx.result_indicator.cost_label, "Custo por conversa");
  assert.equal(ctx.financial.spend, 150.58);
  assert.equal(ctx.raw_metrics.result_value, 19);
  assert.ok(ctx.raw_metrics.cost_per_result !== null);
  assert.equal(ctx.raw_metrics.cost_per_result.toFixed(2), "7.93");
  assert.equal(ctx.raw_metrics.impressions, 9436);
  assert.equal(ctx.raw_metrics.reach, 7196);
  assert.equal(ctx.raw_metrics.link_clicks, 137);
  assert.equal(ctx.raw_metrics.all_clicks, 167);
  assert.equal(ctx.confidence_level, "baixa"); // 1-day window + missing creative/CRM fields

  const diagnosis = generateSeniorStructuredAnalysis(ctx);
  assert.ok(diagnosis.includes("O que esta campanha foi configurada para otimizar?"));
  assert.ok(diagnosis.includes("1. Escopo analisado"));
  assert.ok(diagnosis.includes("2. Objetivo e evento oficial"));
  assert.ok(diagnosis.includes("3. Leitura factual"));
  assert.ok(diagnosis.includes("4. Indicadores primários e secundários"));
  assert.ok(diagnosis.includes("5. Limitações e dados ausentes"));
  assert.ok(diagnosis.includes("6. Hipóteses"));
  assert.ok(diagnosis.includes("7. Recomendações seguras"));
  assert.ok(diagnosis.includes("8. Plano de validação"));
  assert.ok(diagnosis.includes("9. Nível de confiança"));
  assert.ok(diagnosis.includes("10. Fontes e documentos utilizados"));
  assert.equal(hasAllMandatory10Sections(diagnosis), true);
  assert.ok(diagnosis.includes("[FATO OBSERVADO]"));
  assert.ok(diagnosis.includes("[HIPÓTESE 1"));
  assert.ok(diagnosis.includes("[RECOMENDAÇÃO 1"));
  assert.ok(diagnosis.includes("R$ 150,58"));
  assert.ok(diagnosis.includes("19 conversas iniciadas"));
  assert.ok(diagnosis.includes("R$ 7,93"));
  assert.ok(diagnosis.includes("9.436"));
  assert.ok(diagnosis.includes("7.196"));
  assert.ok(diagnosis.includes("137"));
  assert.ok(diagnosis.includes("167"));
  // Never leaks Reach campaign data
  assert.equal(diagnosis.includes("Jojo Todynho"), false);
  assert.equal(diagnosis.includes("50.013"), false);
});

test("Fixture 2 (Fly Garage 13/11/2026 — Alcance): CMP | NC - ALCANCE JOJO TODYNHO (R$ 63,56 | 50.013 alcançadas | R$ 1,27/1.000 alcançadas | ZERO CPL)", () => {
  const ctx = buildContextFromMetricasItem({
    item: {
      id: "120210999002",
      name: "CMP | NC - ALCANCE JOJO TODYNHO",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "Fly Garage",
      rawObjective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      destinationType: "UNDEFINED",
      resultType: "REACH",
      resultIndicator: "reach",
      cost: 63.56,
      conversions: 50013,
      impressions: 52360,
      reach: 50013,
      clicks: 21,
      inline_link_clicks: 21,
      all_clicks: 52,
      budget: 65,
    },
    surface: "metricas",
    route: "/metricas",
    userId: "user_henrique",
    conversationId: "conv_fly_reach",
    accountId: "act_3177396632405159",
    accountName: "Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    preset: "yesterday",
    accountMaxCplTarget: 35,
    sameObjectiveAvgCost: 7.93, // Even if passed, gateway must strip it for REACH!
  });

  assert.equal(ctx.optimization.category, "REACH");
  assert.equal(ctx.result_indicator.cost_label, "Custo por 1.000 pessoas alcançadas");
  assert.equal(ctx.governance_and_benchmarks.account_max_cpl_target, null);
  assert.equal(ctx.governance_and_benchmarks.comparable_same_objective_avg, null);
  assert.equal(ctx.financial.spend, 63.56);
  assert.equal(ctx.raw_metrics.result_value, 50013);
  assert.ok(ctx.raw_metrics.cost_per_result !== null);
  assert.equal(ctx.raw_metrics.cost_per_result.toFixed(2), "1.27");
  assert.equal(ctx.raw_metrics.cpm.toFixed(2), "1.21");
  assert.equal(ctx.raw_metrics.impressions, 52360);
  assert.equal(ctx.raw_metrics.reach, 50013);
  assert.equal(ctx.raw_metrics.link_clicks, 21);
  assert.equal(ctx.raw_metrics.all_clicks, 52);

  // Suggested questions must NEVER mention CPL on a Reach campaign
  const suggested = buildSuggestedQuestionsForContext(ctx);
  assert.ok(suggested.length >= 3);
  for (const q of suggested) {
    assert.equal(/\bCPL\b/i.test(q), false, `Suggested question leaked CPL on REACH campaign: ${q}`);
  }

  const diagnosis = generateSeniorStructuredAnalysis(ctx);
  assert.ok(diagnosis.includes("O que esta campanha foi configurada para otimizar?"));
  assert.ok(diagnosis.includes("Custo por 1.000 pessoas alcançadas"));
  assert.ok(diagnosis.includes("R$ 63,56"));
  assert.ok(diagnosis.includes("50.013 pessoas alcançadas"));
  assert.ok(diagnosis.includes("R$ 1,27"));
  assert.ok(diagnosis.includes("R$ 1,21"));
  assert.ok(diagnosis.includes("52.360"));
  assert.ok(diagnosis.includes("Indicadores secundários"));
  assert.equal(hasAllMandatory10Sections(diagnosis), true);
  // Zero occurrence of "CPL" or "R$ 7,93" (from the Messages campaign)
  assert.equal(/\bCPL\b/.test(diagnosis), false, "Reach campaign diagnosis must NEVER contain 'CPL'");
  assert.equal(diagnosis.includes("7,93"), false, "Reach campaign diagnosis must NEVER contain R$ 7,93 from Messages");
});

// ============================================================================
// 2. CONCURRENCY, SESSION ISOLATION & CACHE LEAK PREVENTION TEST
// ============================================================================

test("Race Condition & Drawer Isolation: Opening ALCANCE then immediately switching to MENSAGENS aborts ALCANCE and leaks ZERO tokens", async () => {
  const controller = new VictoriaSessionController();

  const reachCtx = buildContextFromMetricasItem({
    item: {
      id: "120210999002",
      name: "CMP | NC - ALCANCE JOJO TODYNHO",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "Fly Garage",
      rawObjective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      resultType: "REACH",
      resultIndicator: "reach",
      cost: 63.56,
      conversions: 50013,
      impressions: 52360,
      reach: 50013,
      clicks: 21,
      inline_link_clicks: 21,
      all_clicks: 52,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    preset: "yesterday",
  });

  const msgCtx = buildContextFromMetricasItem({
    item: {
      id: "120210999001",
      name: "NC - MSG - 29/06 — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      destinationType: "WHATSAPP",
      resultType: "MESSAGES",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      cost: 150.58,
      conversions: 19,
      impressions: 9436,
      reach: 7196,
      clicks: 137,
      inline_link_clicks: 137,
      all_clicks: 167,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    preset: "yesterday",
  });

  // 1. Start request for Reach campaign
  const reachSession = controller.beginRequest({ ctx: reachCtx });
  assert.equal(reachSession.signal.aborted, false);

  // 2. Before Reach completes, operator clicks Messages campaign in the drawer
  const msgSession = controller.beginRequest({ ctx: msgCtx });

  // 3. Reach signal MUST be aborted immediately
  assert.equal(reachSession.signal.aborted, true, "Previous campaign AbortSignal must be aborted on entity switch");
  assert.equal(msgSession.signal.aborted, false);

  // 4. Late streaming tokens from Reach campaign try to render and commit
  const canRenderLateReach = controller.canRenderToken({
    requestId: reachCtx.request_id,
    contextHash: reachCtx.analysis_context_hash,
    accountId: reachCtx.ad_account_id,
    entityLevel: reachCtx.entity_level,
    entityId: reachCtx.entity_id,
  });
  assert.equal(canRenderLateReach, false, "Late tokens from Reach campaign must be rejected by canRenderToken");

  const committedLateReach = controller.commitResponse({
    cacheKey: reachSession.cacheKey,
    requestId: reachCtx.request_id,
    contextHash: reachCtx.analysis_context_hash,
    accountId: reachCtx.ad_account_id,
    entityLevel: reachCtx.entity_level,
    entityId: reachCtx.entity_id,
    text: "Diagnóstico vazado de CMP | NC - ALCANCE JOJO TODYNHO com 50.013 alcançadas e R$ 1,27",
  });
  assert.equal(committedLateReach, false, "Late commit from Reach campaign must be rejected");

  // 5. Execute governed diagnostic for the active Messages campaign
  let renderedDrawerBody = "";
  const msgResult = await executeGovernedVictoriaDiagnostic({
    ctx: msgCtx,
    controller,
    endpointUrl: "http://127.0.0.1:9/offline-local-fallback",
    anonKey: "test",
    timeoutMs: 100,
    onToken: (partial) => {
      renderedDrawerBody = partial;
    },
  });

  assert.equal(msgResult.aborted, false);
  assert.ok(renderedDrawerBody.includes("NC - MSG - 29/06 — Cópia"));
  assert.ok(renderedDrawerBody.includes("19 conversas iniciadas"));
  assert.ok(renderedDrawerBody.includes("R$ 7,93"));
  assert.equal(renderedDrawerBody.includes("JOJO TODYNHO"), false);
  assert.equal(renderedDrawerBody.includes("50.013"), false);
  assert.equal(renderedDrawerBody.includes("63,56"), false);
  assert.equal(renderedDrawerBody.includes("1,27"), false);
});

// ============================================================================
// 3. METRIC COMPARISON GUARD & CONTRACT DEGRADATION TESTS
// ============================================================================

test("Cross-unit comparison guard blocks comparing CPM with Custo por conversa or CPL with Reach cost", () => {
  const cpmVsMsg = validateMetricComparison(
    "R$ por 1.000 impressões",
    CANONICAL_METRIC_REGISTRY.MESSAGES.unit
  );
  assert.equal(cpmVsMsg.allowed, false);
  assert.ok(cpmVsMsg.reason?.includes("Comparação cruzada bloqueada"));

  const reachVsLeads = validateMetricComparison(
    CANONICAL_METRIC_REGISTRY.REACH.unit,
    CANONICAL_METRIC_REGISTRY.LEADS.unit
  );
  assert.equal(reachVsLeads.allowed, false);

  const sameUnitMsg = validateMetricComparison(
    CANONICAL_METRIC_REGISTRY.MESSAGES.unit,
    CANONICAL_METRIC_REGISTRY.MESSAGES.unit
  );
  assert.equal(sameUnitMsg.allowed, true);
});

test("Contract validation degrades to insufficient data when entity_id, period, or official indicator is missing", () => {
  const brokenCtx = buildVictoriaAnalysisContext({
    source_surface: "metricas",
    route: "/metricas",
    ad_account_id: "act_3177396632405159",
    ad_account_name: "Fly Garage",
    entity_level: "campaign",
    entity_id: "",
    entity_name: "",
    date_from: "",
    date_to: "",
    spend: 50,
    impressions: 0,
    reach: 0,
    link_clicks: 0,
    conversions: 0,
  });

  const check = validateVictoriaAnalysisContext(brokenCtx);
  assert.equal(check.valid, false);
  assert.equal(check.status, "INSUFFICIENT_DATA");
  assert.ok(check.missingMandatoryFields.length >= 2);
  assert.ok(check.degradedResponse?.includes("Dados Insuficientes para Diagnóstico Confiável"));

  const degradedOutput = generateSeniorStructuredAnalysis(brokenCtx);
  assert.ok(degradedOutput.includes("Dados Insuficientes para Diagnóstico Confiável"));
});

// ============================================================================
// 4. RAG CURATION & GOVERNANCE TESTS (IDs 21–30 + Canonical Metadata)
// ============================================================================

test("RAG Governance: canonicalizeRagUrl, computeRagSemanticHash, and auditRagDocumentCompliance reject unverified claims and RSS HTML", () => {
  const canonical = canonicalizeRagUrl("https://www.facebook.com/business/news/ads-2026/?utm_source=rss&fbclid=123/");
  assert.equal(canonical, "https://www.facebook.com/business/news/ads-2026");

  const hashA = computeRagSemanticHash("Guia Meta Ads", "Conteúdo técnico de leilão VCG");
  const hashB = computeRagSemanticHash("guia meta ads", "Conteúdo   técnico de leilão VCG");
  assert.equal(hashA, hashB);

  const badDoc1 = auditRagDocumentCompliance({
    title: "[RADAR MERCADO] Meta Ads 2026: Anúncios com fotos reais no pátio geram 54% mais conversas",
    content: "CPL reduzido pela metade com meta fixa de R$ 5,00.",
    url: "https://www.facebook.com/business",
  });
  assert.equal(badDoc1.compliant, false);
  assert.equal(badDoc1.recommendedApprovalStatus, "REJECTED");

  const badDoc2 = auditRagDocumentCompliance({
    title: "Gatilhos de venda",
    content: "Use Financiamento sem consulta SPC/Serasa e 0-5 min → 80% conversão.",
  });
  assert.equal(badDoc2.compliant, false);
  assert.equal(badDoc2.recommendedApprovalStatus, "REJECTED");

  const rssNewsDoc = auditRagDocumentCompliance({
    title: "Boletim FENABRAVE Novembro",
    content: "Vendas de veículos cresceram no trimestre segundo relatório público.",
    url: "https://fenabrave.org.br/relatorios/2026-11",
    isRssIngestion: true,
  });
  assert.equal(rssNewsDoc.compliant, true);
  assert.equal(rssNewsDoc.recommendedApprovalStatus, "PENDING_REVIEW");

  const cleanInternalDoc = auditRagDocumentCompliance({
    title: "Protocolo de Lançamento NC Performance",
    content: "Validar Pixel Meta, eventos de conversão e tempo de resposta comercial.",
  });
  assert.equal(cleanInternalDoc.compliant, true);
  assert.equal(cleanInternalDoc.recommendedApprovalStatus, "APPROVED");
});

test("Legacy Governance (IDs 21–30): RSS sanitization, read-only guard, action validation, and output sanitization", () => {
  const cleanRss = sanitizeRssText("<b>Vendas de seminovos</b> sobem &amp; crescem");
  assert.equal(cleanRss, "Vendas de seminovos sobem & crescem");

  assert.equal(isHomepageOnlyUrl("https://www.facebook.com/"), true);
  assert.equal(isHomepageOnlyUrl("https://autoesporte.globo.com/mercado/noticia/2026/11/vendas.ghtml"), false);

  assert.equal(isReadOnlyAnalysisRequest("Apenas analise as campanhas sem alterar nada"), true);
  assert.equal(isReadOnlyAnalysisRequest("Pausar campanha agora"), false);

  const stripped = stripJsonActionBlocks(
    "Diagnóstico pronto.\n```json:action\n{\"type\":\"pause_campaign\",\"campaignId\":\"123\"}\n```"
  );
  assert.equal(stripped.parsedAction?.type, "pause_campaign");

  const blockedProposal = buildActionProposal(
    { type: "pause_campaign", campaignId: "120238955348150254" },
    { readOnly: true }
  );
  assert.equal(blockedProposal, null);

  // Also blocked when operationalMode !== ACTION_PROPOSAL or daysCount < 3
  const blockedShortWindow = buildActionProposal(
    { type: "pause_campaign", campaignId: "120238955348150254", accountId: "act_3177396632405159" },
    { readOnly: false, operationalMode: "ACTION_PROPOSAL", explicitUserRequest: true, daysCount: 1, windowStart: "2026-11-13", windowEnd: "2026-11-13" }
  );
  assert.equal(blockedShortWindow, null);

  const activeProposal = buildActionProposal(
    { type: "pause_campaign", campaignId: "120238955348150254", accountId: "act_3177396632405159" },
    { readOnly: false, operationalMode: "ACTION_PROPOSAL", explicitUserRequest: true, daysCount: 5, windowStart: "2026-11-09", windowEnd: "2026-11-13" }
  );
  assert.ok(activeProposal);
  assert.equal(activeProposal.risk, "high");

  const execWithoutConfirm = validateActionExecution({
    proposal: activeProposal,
    userConfirmed: true,
    confirmPhrase: "",
  });
  assert.equal(execWithoutConfirm.allowed, false);
  assert.equal(execWithoutConfirm.code, "CONFIRMATION_REQUIRED");

  const reachCtx = buildVictoriaAnalysisContext({
    source_surface: "metricas",
    route: "/metricas",
    ad_account_id: "act_3177396632405159",
    ad_account_name: "Fly Garage",
    entity_level: "campaign",
    entity_id: "120210999002",
    entity_name: "CMP | NC - ALCANCE JOJO TODYNHO",
    date_from: "2026-11-13",
    date_to: "2026-11-13",
    odax_objective: "OUTCOME_AWARENESS",
    optimization_goal: "REACH",
    result_type: "REACH",
    result_indicator: "reach",
    spend: 63.56,
    reach: 50013,
    impressions: 52360,
    link_clicks: 21,
    all_clicks: 52,
    conversions: 50013,
  });

  const sanitizedOut = sanitizeVictoriaOutputText(
    "O CPL desta campanha foi R$ 1,27 e fotos reais geram 54% mais conversas com Financiamento sem consulta SPC.",
    reachCtx
  );
  assert.equal(/\bCPL\b/.test(sanitizedOut), false);
  assert.equal(sanitizedOut.includes("54%"), false);
  assert.equal(sanitizedOut.includes("SPC"), false);
});

// ============================================================================
// 5. 112 LABELED EVALUATION SCENARIOS (>100 SCENARIOS ACROSS ALL SURFACES & OBJECTIVES)
// ============================================================================

interface LabeledEvalScenario {
  id: string;
  surface: VictoriaSurfaceId;
  route: string;
  category: MetaConversionCategory;
  rawObjective: string;
  optimizationGoal: string;
  resultIndicator: string;
  days: number;
  spend: number;
  results: number;
  impressions: number;
  reach: number;
  linkClicks: number;
  allClicks: number;
  hasCreativeData: boolean;
  hasCopyData: boolean;
  hasAudienceData: boolean;
  hasLandingPageData: boolean;
  hasCrmData: boolean;
  expectedCostLabel: string;
  expectedUnitPlural: string;
  forbiddenInOutput: string[];
}

function build112LabeledScenarios(): LabeledEvalScenario[] {
  const surfaces: Array<{ surface: VictoriaSurfaceId; route: string }> = [
    { surface: "metricas", route: "/metricas" },
    { surface: "command_center", route: "/dashboard" },
    { surface: "cockpit", route: "/cockpit" },
    { surface: "relatorios", route: "/relatorios" },
    { surface: "criativos", route: "/criativos" },
    { surface: "auditoria", route: "/social-audit" },
    { surface: "social_media", route: "/social" },
    { surface: "social_insights", route: "/social-insights" },
    { surface: "gestao", route: "/gestao" },
    { surface: "regras", route: "/config" },
    { surface: "strategy_map", route: "/strategy-map" },
    { surface: "notifications", route: "/dashboard" },
    { surface: "victoria_hub", route: "/victoria" },
    { surface: "floating_chat", route: "/metricas" },
  ];

  const categories: Array<{
    category: MetaConversionCategory;
    rawObjective: string;
    optimizationGoal: string;
    resultIndicator: string;
  }> = [
    {
      category: "MESSAGES",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
    },
    {
      category: "REACH",
      rawObjective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      resultIndicator: "reach",
    },
    {
      category: "INSTAGRAM_PROFILE",
      rawObjective: "OUTCOME_TRAFFIC",
      optimizationGoal: "PROFILE_VISIT",
      resultIndicator: "actions:instagram_profile_visits",
    },
    {
      category: "LANDING_PAGE_VIEWS",
      rawObjective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      resultIndicator: "actions:landing_page_view",
    },
    {
      category: "LINK_CLICKS",
      rawObjective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LINK_CLICKS",
      resultIndicator: "inline_link_clicks",
    },
    {
      category: "LEADS",
      rawObjective: "OUTCOME_LEADS",
      optimizationGoal: "LEAD_GENERATION",
      resultIndicator: "actions:lead",
    },
    {
      category: "PURCHASES",
      rawObjective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      resultIndicator: "actions:purchase",
    },
    {
      category: "VIDEO_VIEWS",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "THRUPLAY",
      resultIndicator: "actions:video_thruplay_watched_actions",
    },
  ];

  const scenarios: LabeledEvalScenario[] = [];
  let counter = 1;

  // 14 surfaces x 8 core categories = 112 labeled scenarios!
  for (let sIdx = 0; sIdx < surfaces.length; sIdx++) {
    const { surface, route } = surfaces[sIdx];
    for (let cIdx = 0; cIdx < categories.length; cIdx++) {
      const catSpec = categories[cIdx];
      const spec = CANONICAL_METRIC_REGISTRY[catSpec.category];
      const windowVariants = [1, 3, 7, 14, 30];
      const days = windowVariants[(sIdx + cIdx) % windowVariants.length];
      const isZeroResultCase = (sIdx + cIdx) % 9 === 0 && catSpec.category !== "REACH";
      const spend = Number((45.5 + sIdx * 12.3 + cIdx * 8.4).toFixed(2));
      const reach = 4000 + sIdx * 1200 + cIdx * 500;
      const impressions = Math.round(reach * 1.35);
      const results = catSpec.category === "REACH"
        ? reach
        : isZeroResultCase
        ? 0
        : 12 + ((sIdx * 3 + cIdx * 2) % 35);
      const linkClicks = 15 + sIdx * 5 + cIdx * 3;
      const allClicks = linkClicks + 12 + cIdx * 2;

      const hasFullMetadata = days >= 14 && (sIdx % 2 === 0);

      const forbidden: string[] = [
        "54% mais conversas",
        "80% de conversão",
        "sem consulta SPC",
      ];
      if (
        catSpec.category === "REACH" ||
        catSpec.category === "INSTAGRAM_PROFILE" ||
        catSpec.category === "LANDING_PAGE_VIEWS" ||
        catSpec.category === "LINK_CLICKS" ||
        catSpec.category === "VIDEO_VIEWS"
      ) {
        forbidden.push("CPL");
      }

      scenarios.push({
        id: `EVAL_${String(counter++).padStart(3, "0")}_${surface.toUpperCase()}_${catSpec.category}_${days}D`,
        surface,
        route,
        category: catSpec.category,
        rawObjective: catSpec.rawObjective,
        optimizationGoal: catSpec.optimizationGoal,
        resultIndicator: catSpec.resultIndicator,
        days,
        spend,
        results,
        impressions,
        reach,
        linkClicks,
        allClicks,
        hasCreativeData: hasFullMetadata,
        hasCopyData: hasFullMetadata,
        hasAudienceData: hasFullMetadata,
        hasLandingPageData: hasFullMetadata,
        hasCrmData: hasFullMetadata,
        expectedCostLabel: spec.cost_label,
        expectedUnitPlural: spec.label_plural,
        forbiddenInOutput: forbidden,
      });
    }
  }

  return scenarios;
}

test("Evaluation Suite (112 Labeled Scenarios): 100% accuracy on objective/unit, zero forbidden labels, exact math, and calibrated confidence", () => {
  const scenarios = build112LabeledScenarios();
  assert.equal(scenarios.length, 112);

  let passed = 0;
  for (const sc of scenarios) {
    const startDate = "2026-11-01";
    const endDay = String(Math.min(30, sc.days)).padStart(2, "0");
    const endDate = `2026-11-${endDay}`;

    const ctx = buildVictoriaAnalysisContext({
      source_surface: sc.surface,
      route: sc.route,
      user_id: "eval_runner",
      conversation_id: `conv_${sc.id}`,
      ad_account_id: "act_3177396632405159",
      ad_account_name: "Fly Garage",
      entity_level: "campaign",
      entity_id: `camp_${sc.id}`,
      entity_name: `CAMPANHA ${sc.id}`,
      effective_status: "ACTIVE",
      date_from: startDate,
      date_to: endDate,
      preset: `${sc.days}d`,
      odax_objective: sc.rawObjective,
      optimization_goal: sc.optimizationGoal,
      result_indicator: sc.resultIndicator,
      result_type: sc.category,
      spend: sc.spend,
      impressions: sc.impressions,
      reach: sc.reach,
      link_clicks: sc.linkClicks,
      all_clicks: sc.allClicks,
      conversions: sc.results,
      has_creative_data: sc.hasCreativeData,
      has_copy_data: sc.hasCopyData,
      has_audience_targeting: sc.hasAudienceData,
      has_landing_page_data: sc.hasLandingPageData,
      has_crm_funnel_data: sc.hasCrmData,
      account_max_cpl_target: 35,
    });

    const expectedCal = calibrateAnalysisConfidence({
      daysCount: ctx.period.days_count,
      impressions: sc.impressions,
      resultValue: sc.results,
      category: sc.category,
      missingFields: ctx.missing_fields,
      hasCreativeData: sc.hasCreativeData,
      hasAudienceData: sc.hasAudienceData,
    });

    // 1. Validate canonical contract
    const v = validateVictoriaAnalysisContext(ctx);
    assert.equal(v.valid, true, `[${sc.id}] context must be valid`);
    assert.equal(ctx.optimization.category, sc.category, `[${sc.id}] category mismatch`);
    assert.equal(ctx.result_indicator.cost_label, sc.expectedCostLabel, `[${sc.id}] cost label mismatch`);
    assert.equal(ctx.result_indicator.label_plural, sc.expectedUnitPlural, `[${sc.id}] unit plural mismatch`);
    assert.equal(ctx.confidence_level, expectedCal.level, `[${sc.id}] confidence calibration mismatch`);

    // 2. Validate suggested questions never leak forbidden labels
    const questions = buildSuggestedQuestionsForContext(ctx);
    for (const q of questions) {
      for (const bad of sc.forbiddenInOutput) {
        if (bad === "CPL") {
          assert.equal(/\bCPL\b/.test(q), false, `[${sc.id}] suggested question leaked CPL: ${q}`);
        }
      }
    }

    // 3. Validate 10-part structured senior analysis output
    const output = generateSeniorStructuredAnalysis(ctx);
    assert.ok(
      output.includes("O que esta campanha foi configurada para otimizar?"),
      `[${sc.id}] must start with 'O que esta campanha foi configurada para otimizar?'`
    );
    assert.equal(hasAllMandatory10Sections(output), true, `[${sc.id}] must include all 10 mandatory sections`);
    assert.ok(output.includes(sc.expectedCostLabel), `[${sc.id}] output must contain official cost label ${sc.expectedCostLabel}`);
    assert.ok(output.includes("[FATO OBSERVADO]"), `[${sc.id}] missing [FATO OBSERVADO]`);
    assert.ok(output.includes("[HIPÓTESE 1"), `[${sc.id}] missing [HIPÓTESE 1`);
    assert.ok(output.includes("[RECOMENDAÇÃO 1"), `[${sc.id}] missing [RECOMENDAÇÃO 1`);

    // 4. Verify zero-conversion handling never shows R$ 0,00 as unit cost
    if (sc.results === 0 && sc.category !== "LINK_CLICKS") {
      assert.equal(ctx.raw_metrics.cost_per_result, null, `[${sc.id}] 0 results must produce null cost_per_result`);
      assert.equal(ctx.raw_metrics.cost_per_result_formatted, "—", `[${sc.id}] 0 results must format as '—', never R$ 0,00`);
    }

    // 5. Verify forbidden terms never appear in output
    for (const bad of sc.forbiddenInOutput) {
      if (bad === "CPL") {
        assert.equal(/\bCPL\b/.test(output), false, `[${sc.id}] output leaked forbidden label 'CPL'`);
      } else {
        assert.equal(output.toLowerCase().includes(bad.toLowerCase()), false, `[${sc.id}] output leaked '${bad}'`);
      }
    }

    passed++;
  }

  assert.equal(passed, 112);
});

// ============================================================================
// 6. CONTRACT 2026.11.4 GOVERNANCE TESTS (10-FIELD IDENTITY, LEGACY TAGGING, CROSS-ENTITY LEAK GUARD)
// ============================================================================

test("Contract 2026.11.4: strict 10-field context identity verification, legacy tagging, and cross-entity leak replacement", () => {
  const reachSibling = {
    id: "camp_reach_jojo",
    external_id: "120238955348150254",
    name: "CMP | NC  - ALCANCE JOJO TODYNHO",
    spend: 63.56,
    reach: 50013,
    impressions: 52360,
    cpm: 1.21,
    cost_per_result: 1.27,
    result_value: 50013,
  };

  const msgCtx = buildContextFromMetricasItem({
    item: {
      id: "camp_msg_2906",
      external_id: "120249884798220254",
      name: "NC - MSG - 29/06 — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "NC - Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      cost: 150.60,
      conversions: 19,
      impressions: 9436,
      reach: 7196,
      clicks: 137,
    },
    surface: "floating_chat",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "NC - Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    siblingEntities: [reachSibling],
    operationalMode: "READ_ONLY_ANALYSIS",
  });

  // Strict 10-field identity check
  const receivedOk = {
    request_id: msgCtx.request_id,
    analysis_context_hash: msgCtx.analysis_context_hash,
    ad_account_id: msgCtx.ad_account_id,
    entity_level: msgCtx.entity_level,
    entity_id: msgCtx.entity_id,
    date_from: msgCtx.period.date_from,
    date_to: msgCtx.period.date_to,
    result_indicator: msgCtx.result_indicator.code,
    contract_version: msgCtx.contract_version,
    prompt_version: msgCtx.prompt_version,
  };
  const matchOk = matchesCanonicalContextIdentity(msgCtx, receivedOk);
  assert.equal(matchOk.valid, true);
  assert.equal(matchOk.mismatches.length, 0);

  const mismatchEntity = matchesCanonicalContextIdentity(msgCtx, {
    ...receivedOk,
    entity_id: "120238955348150254",
  });
  assert.equal(mismatchEntity.valid, false);
  assert.ok(mismatchEntity.mismatches.some((m) => m.includes("entity_id")));

  // Legacy detection
  assert.equal(isLegacyVictoriaVersion(null), true);
  assert.equal(isLegacyVictoriaVersion("2026.11.3"), true);
  assert.equal(isLegacyVictoriaVersion("2026.11.4"), false);

  // Post-LLM guardrails must replace leaky output referencing sibling Reach campaign
  const leakyLlmOutput =
    "A campanha CMP | NC - ALCANCE JOJO TODYNHO atingiu 50.013 pessoas com gasto de R$ 63,56 e CPM R$ 1,21.\n```json:action\n{\"type\":\"pause_campaign\",\"campaignId\":\"120249884798220254\"}\n```";
  const enforced = enforceVictoriaPostLlmGuardrails(leakyLlmOutput, msgCtx, {
    requireFull10Sections: true,
  });
  assert.equal(enforced.replacedByDeterministic, true);
  assert.equal(enforced.text.includes("JOJO TODYNHO"), false);
  assert.equal(enforced.text.includes("50.013"), false);
  assert.equal(enforced.text.includes("63,56"), false);
  assert.equal(enforced.text.includes("json:action"), false);
  assert.equal(hasAllMandatory10Sections(enforced.text), true);
});

// ============================================================================
// 7. AUDIT GAPS 1–6 HARDENING TESTS (NO SELF-BENCHMARK, CPC SPLIT, OBJECTIVES, RAG, SSE ORIGIN)
// ============================================================================

test("Auditoria 6 Gaps: bloqueia auto-comparação (R$ 7,93 vs R$ 7,93), separa CPC Link vs CPC Todos e preserva frescor do snapshot", () => {
  const ctx = buildContextFromMetricasItem({
    item: {
      id: "camp_msg_2906",
      external_id: "120249884798220254",
      name: "NC - MSG - 29/06 — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "NC - Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      cost: 150.6,
      conversions: 19,
      impressions: 9437,
      reach: 7196,
      clicks: 137,
      allClicks: 167,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "NC - Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    lastSyncAt: "2026-11-14T15:25:46.814Z",
    sameObjectiveAvgCost: null,
    sameObjectivePeerCount: 0,
    operationalMode: "READ_ONLY_ANALYSIS",
  });

  assert.equal(ctx.governance_and_benchmarks.comparable_same_objective_avg, null);
  assert.equal(ctx.governance_and_benchmarks.comparable_peer_count, 0);
  assert.ok(Math.abs(ctx.raw_metrics.cpc_link - 150.6 / 137) < 0.001);
  assert.ok(Math.abs(ctx.raw_metrics.cpc_all - 150.6 / 167) < 0.001);
  assert.ok(ctx.period.last_sync_at?.includes("2026-11-14"));

  const report = generateSeniorStructuredAnalysis(ctx);
  assert.equal(hasAllMandatory10Sections(report), true);
  assert.ok(report.includes("Benchmark homogêneo indisponível"));
  assert.ok(report.includes("CPC Link"));
  assert.ok(report.includes("CPC Todos"));
  assert.ok(report.includes("CTR Link"));
  assert.ok(report.includes("CTR Todos"));
  assert.equal(report.includes("7,93** vs benchmark R$ 7,93"), false);
});

test("Auditoria Gap 5: recomendações (Seções 6–8) variam de forma específica por objetivo oficial", () => {
  const objectives = [
    {
      name: "CMP | NC - ALCANCE JOJO TODYNHO",
      rawObjective: "OUTCOME_AWARENESS",
      optimizationGoal: "REACH",
      resultType: "REACH" as MetaConversionCategory,
      resultIndicator: "reach",
      cost: 63.56,
      conversions: 50013,
      reach: 50013,
      impressions: 52365,
      clicks: 21,
      allClicks: 52,
      expectedSnippet: "1.000",
    },
    {
      name: "NC | AUDIÊNCIA/SIGA",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "PROFILE_VISIT",
      resultType: "INSTAGRAM_PROFILE" as MetaConversionCategory,
      resultIndicator: "profile_visit_view",
      cost: 50.43,
      conversions: 328,
      reach: 4018,
      impressions: 4175,
      clicks: 334,
      allClicks: 329,
      expectedSnippet: "perfil",
    },
    {
      name: "NC | TRÁFEGO LANDING PAGE",
      rawObjective: "OUTCOME_TRAFFIC",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      resultType: "LANDING_PAGE_VIEWS" as MetaConversionCategory,
      resultIndicator: "actions:landing_page_view",
      cost: 120,
      conversions: 80,
      reach: 6000,
      impressions: 9000,
      clicks: 110,
      allClicks: 150,
      expectedSnippet: "landing",
    },
    {
      name: "NC | LEADS FORMULÁRIO",
      rawObjective: "OUTCOME_LEADS",
      optimizationGoal: "LEAD_GENERATION",
      resultType: "LEADS" as MetaConversionCategory,
      resultIndicator: "actions:lead",
      cost: 200,
      conversions: 20,
      reach: 5000,
      impressions: 7500,
      clicks: 95,
      allClicks: 120,
      expectedSnippet: "lead",
    },
  ];

  const outputs = objectives.map((obj) => {
    const ctx = buildContextFromMetricasItem({
      item: {
        id: `obj_${obj.resultType}`,
        name: obj.name,
        status: "ACTIVE",
        ad_account_id: "act_test",
        adAccountName: "Conta Teste",
        rawObjective: obj.rawObjective,
        optimizationGoal: obj.optimizationGoal,
        resultType: obj.resultType,
        resultIndicator: obj.resultIndicator,
        cost: obj.cost,
        conversions: obj.conversions,
        reach: obj.reach,
        impressions: obj.impressions,
        clicks: obj.clicks,
        allClicks: obj.allClicks,
      },
      surface: "metricas",
      route: "/metricas",
      accountId: "act_test",
      accountName: "Conta Teste",
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      operationalMode: "READ_ONLY_ANALYSIS",
    });
    const text = generateSeniorStructuredAnalysis(ctx);
    assert.equal(hasAllMandatory10Sections(text), true);
    assert.ok(
      text.toLowerCase().includes(obj.expectedSnippet.toLowerCase()),
      `${obj.resultType} deveria conter '${obj.expectedSnippet}' nas recomendações`
    );
    return text;
  });

  // Garante que as seções 6–8 não são genéricas idênticas entre objetivos
  assert.notEqual(outputs[0], outputs[1]);
  assert.notEqual(outputs[1], outputs[2]);
  assert.notEqual(outputs[2], outputs[3]);
});

test("Auditoria Gap 2: enforceVictoriaPostLlmGuardrails preserva citações RAG aprovadas e corrige falsa afirmação de 'Nenhum documento'", () => {
  const ctx = buildContextFromMetricasItem({
    item: {
      id: "camp_rag_test",
      name: "NC - MSG - TEST RAG",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "NC - Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 150.6,
      conversions: 19,
      impressions: 9437,
      reach: 7196,
      clicks: 137,
      allClicks: 167,
    },
    surface: "floating_chat",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "NC - Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    operationalMode: "READ_ONLY_ANALYSIS",
  });

  const baseStructured = generateSeniorStructuredAnalysis(ctx);
  const llmClaimingNoDocs = baseStructured.replace(
    /## 10\. Evidências e rastreabilidade[\s\S]*$/,
    "## 10. Evidências e rastreabilidade\n- **Base RAG Consultada:** Nenhum documento específico da base RAG foi retornado para este recorte.\n- **Contrato:** 2026.11.4"
  );

  const enforced = enforceVictoriaPostLlmGuardrails(llmClaimingNoDocs, ctx, {
    requireFull10Sections: true,
    approvedDocs: [
      {
        id: "doc-meta-1",
        title: "Meta Ads Learning Phase & 50 Conversions Guideline",
        version: "2026.1",
        evidence_level: "OFFICIAL_DOCS",
        approval_status: "APPROVED",
      },
    ],
  });

  assert.equal(enforced.replacedByDeterministic, false);
  assert.ok(enforced.text.includes("Meta Ads Learning Phase & 50 Conversions Guideline"));
  assert.equal(enforced.text.includes("Nenhum documento específico da base RAG foi retornado"), false);
});

test("Auditoria Gap 1: executeGovernedVictoriaDiagnostic distingue Resposta Generativa (SSE) de Fallback Determinístico", async () => {
  const ctx = buildContextFromMetricasItem({
    item: {
      id: "camp_sse_test",
      external_id: "120249884798220254",
      name: "NC - MSG - 29/06 — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_3177396632405159",
      adAccountName: "NC - Fly Garage",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 150.6,
      conversions: 19,
      impressions: 9437,
      reach: 7196,
      clicks: 137,
      allClicks: 167,
    },
    surface: "floating_chat",
    route: "/metricas",
    accountId: "act_3177396632405159",
    accountName: "NC - Fly Garage",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    operationalMode: "READ_ONLY_ANALYSIS",
  });

  const valid10SectionText = generateSeniorStructuredAnalysis(ctx);
  const originalFetch = globalThis.fetch;

  try {
    // Caso 1: Streaming SSE generativo bem-sucedido com victoria_meta + delta + victoria_final
    globalThis.fetch = (async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                victoria_meta: {
                  response_origin: "generative",
                  rag_docs: [
                    {
                      id: "doc-1",
                      title: "Playbook WhatsApp Automotivo",
                      version: "2026.1",
                      evidence_level: "EMPIRICAL_AUDIT",
                      approval_status: "APPROVED",
                    },
                  ],
                },
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                choices: [{ delta: { content: valid10SectionText } }],
              })}\n\n`
            )
          );
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                victoria_final: {
                  used_fallback: false,
                  latency_ms: 1840,
                },
              })}\n\n`
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as typeof fetch;

    const ctrl1 = new VictoriaSessionController();
    const resGen = await executeGovernedVictoriaDiagnostic({
      ctx,
      controller: ctrl1,
      endpointUrl: "https://example.supabase.co/functions/v1/victoria-agent",
      anonKey: "anon",
    });

    assert.equal(resGen.responseOrigin, "generative");
    assert.equal(resGen.timedOut, false);
    assert.equal(resGen.ragCitations.length, 1);
    assert.equal(resGen.ragCitations[0].title, "Playbook WhatsApp Automotivo");

    // Caso 2: Erro HTTP -> fallback determinístico explícito
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "Upstream unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;

    const ctrl2 = new VictoriaSessionController();
    const resFallback = await executeGovernedVictoriaDiagnostic({
      ctx,
      controller: ctrl2,
      endpointUrl: "https://example.supabase.co/functions/v1/victoria-agent",
      anonKey: "anon",
    });

    assert.equal(resFallback.responseOrigin, "deterministic_fallback");
    assert.ok((resFallback.fallbackReason || "").length > 0);
    assert.equal(hasAllMandatory10Sections(resFallback.text), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("BM Bonne21 (OUTCOME_SALES com purchaseValue/ROAS & OUTCOME_ENGAGEMENT com LANDING_PAGE_VIEWS) no contrato Victoria", () => {
  const salesCtx = buildContextFromMetricasItem({
    item: {
      id: "120253223224110659",
      external_id: "120253223224110659",
      name: "NC | CMP de Vendas (05/08) - HC — Cópia x6",
      status: "ACTIVE",
      ad_account_id: "act_904927503704788",
      adAccountName: "BM Bonne21",
      rawObjective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      resultType: "PURCHASES",
      resultIndicator: "actions:offsite_conversion.fb_pixel_purchase",
      cost: 120.48,
      conversions: 28,
      purchaseValue: 267.8,
      impressions: 7629,
      reach: 5200,
      clicks: 82,
      allClicks: 104,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_904927503704788",
    accountName: "BM Bonne21",
    dateFrom: "2026-11-05",
    dateTo: "2026-11-13",
    operationalMode: "READ_ONLY_ANALYSIS",
  });

  assert.equal(salesCtx.optimization.category, "PURCHASES");
  assert.equal(salesCtx.raw_metrics.purchase_value, 267.8);
  assert.ok(Math.abs((salesCtx.raw_metrics.roas ?? 0) - 267.8 / 120.48) < 0.01);

  const salesAnalysis = generateSeniorStructuredAnalysis(salesCtx);
  assert.equal(hasAllMandatory10Sections(salesAnalysis), true);
  assert.ok(salesAnalysis.includes("Valor de Compra"));
  assert.ok(salesAnalysis.includes("ROAS"));

  const lpvCtx = buildContextFromMetricasItem({
    item: {
      id: "camp_bonne_site",
      name: "CMP - NC - SITE — Cópia",
      status: "ACTIVE",
      ad_account_id: "act_904927503704788",
      adAccountName: "BM Bonne21",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      cost: 42.1,
      conversions: 95,
      impressions: 3400,
      reach: 2800,
      clicks: 112,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_904927503704788",
    accountName: "BM Bonne21",
    dateFrom: "2026-11-05",
    dateTo: "2026-11-11",
    operationalMode: "READ_ONLY_ANALYSIS",
  });
  assert.equal(lpvCtx.optimization.category, "LANDING_PAGE_VIEWS");

  // Resultado atribuído com gasto zero (BM Bonne21 2026-11-13) nunca exibe CPA R$ 0,00 na Victoria
  const zeroSpendSalesCtx = buildContextFromMetricasItem({
    item: {
      id: "camp_bonne_zero_spend",
      external_id: "120253223224110659",
      name: "NC | CMP de Vendas (05/08) - HC — Cópia x6",
      status: "ACTIVE",
      stop_time: "2026-11-09T22:51:04+00:00",
      derived_status: { code: "COMPLETED", label: "Concluída" },
      ad_account_id: "act_904927503704788",
      adAccountName: "BM Bonne21",
      rawObjective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      resultType: "PURCHASES",
      resultIndicator: "actions:offsite_conversion.fb_pixel_purchase",
      cost: 0,
      conversions: 3,
      purchaseValue: 267.8,
      impressions: 0,
      reach: 0,
      clicks: 0,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_904927503704788",
    accountName: "BM Bonne21",
    dateFrom: "2026-11-13",
    dateTo: "2026-11-13",
    operationalMode: "READ_ONLY_ANALYSIS",
  });
  assert.equal(zeroSpendSalesCtx.effective_status, "COMPLETED");
  assert.equal(zeroSpendSalesCtx.raw_metrics.cost_per_result, null);
  assert.equal(zeroSpendSalesCtx.raw_metrics.cost_per_result_formatted, "—");
  assert.equal(zeroSpendSalesCtx.raw_metrics.purchase_value, 267.8);
  assert.equal(zeroSpendSalesCtx.raw_metrics.roas, null);
});
