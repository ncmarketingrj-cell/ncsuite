import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildCreativeAdRecord,
  buildCreativeManagerOverview,
  detectImageMimeFromMagicBytes,
  enrichCreativePeerSignals,
  evaluateCreativeDiversity,
  evaluateCreativeFatigue,
  evaluateCreativeTestEvidence,
  extractConfirmedArtFacts,
  MIN_TREND_WINDOW_DAYS,
  validateCreativeUploadFile,
} from "../src/lib/creativeIntelligenceDomain.ts";
import {
  classifySnapshotFreshness,
  DEFAULT_SYNC_STALE_THRESHOLD_MINUTES,
} from "../src/lib/syncStatusDomain.ts";
import {
  buildVictoriaAnalysisContext,
  matchesCanonicalContextIdentity,
} from "../src/lib/victoriaContract.ts";
import {
  enforceServerPostLlmGuardrails,
  formatVictoriaFreshnessLabelServer,
  selectUsedRagCitations,
} from "../supabase/functions/_shared/victoriaCore.ts";
import { buildContextFromCreativeItem } from "../src/lib/victoriaContextGateway.ts";
import {
  parseNotificationTargetLink,
  selectPendingToastQueue,
} from "../src/lib/notificationPresentation.ts";

const ROOT = process.cwd();

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("Centro de Inteligência Criativa (/criativos) — Regras Canônicas Multi-Conta e Multi-Objetivo", () => {
  it("1. Distingue resultado atribuído com gasto zero (unitCost = null), sem entrega, indisponível e múltiplos objetivos sem soma mista", () => {
    const adBonne21Attributed = buildCreativeAdRecord({
      ad: {
        id: "ad-bonne-1",
        external_id: "120253223224110659",
        name: "Vendas Vestido Linen",
        ad_account_id: "act_904927503704788",
        campaign_id: "camp-b1",
        ad_set_id: "set-b1",
        status: "paused",
        delivery_status: "COMPLETED",
        thumbnail_url: null,
        campaigns: { id: "camp-b1", name: "Campanha Vendas", objective: "OUTCOME_SALES" },
        ad_sets: { id: "set-b1", name: "Conjunto Principal" },
      },
      accountName: "BM Bonne21",
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      dailyRows: [
        {
          ad_id: "ad-bonne-1",
          date: "2026-11-13",
          cost: 0,
          impressions: 0,
          reach: 0,
          clicks: 0,
          inline_link_clicks: 0,
          conversions: 3,
          purchase_value: 267.8,
          raw_objective: "OUTCOME_SALES",
          optimization_goal: "OFFSITE_CONVERSIONS",
          result_type: "purchases",
        },
        // Linha intrusa de outro ad_id que DEVE ser ignorada
        {
          ad_id: "other-ad-id",
          date: "2026-11-13",
          cost: 500,
          impressions: 9000,
          conversions: 99,
        },
      ],
    });

    assert.equal(adBonne21Attributed.availability, "zero_spend_attributed_result");
    assert.equal(adBonne21Attributed.results, 3);
    assert.equal(adBonne21Attributed.spend, 0);
    assert.equal(adBonne21Attributed.unitCost, null);
    assert.equal(adBonne21Attributed.purchaseValue, 267.8);
    assert.equal(adBonne21Attributed.hasRealThumbnail, false);
    assert.equal(adBonne21Attributed.resultCategory, "PURCHASES");

    const adMensagens = buildCreativeAdRecord({
      ad: {
        id: "ad-msg-1",
        external_id: "9991",
        name: "Criativo WhatsApp Onix",
        ad_account_id: "act_1",
        campaign_id: "camp-m1",
        ad_set_id: "set-m1",
        thumbnail_url: "https://example.com/thumb.jpg",
        campaigns: { id: "camp-m1", name: "Mensagens Veículos", objective: "OUTCOME_ENGAGEMENT" },
        ad_sets: { id: "set-m1", name: "Conjunto Loja" },
      },
      accountName: "AlfaCar",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
      periodStat: {
        entity_id: "ad-msg-1",
        spend: 100,
        impressions: 4000,
        reach: 3200,
        frequency: 1.25,
        inline_link_clicks: 80,
        all_clicks: 120,
        conversions: 20,
        optimization_goal: "CONVERSATIONS",
        result_type: "messages",
      },
    });

    const adAlcance = buildCreativeAdRecord({
      ad: {
        id: "ad-reach-1",
        name: "Branding Institucional",
        ad_account_id: "act_1",
        campaign_id: "camp-r1",
        ad_set_id: "set-r1",
        campaigns: { id: "camp-r1", name: "Alcance Local", objective: "OUTCOME_AWARENESS" },
        ad_sets: { id: "set-r1", name: "Raio 15km" },
      },
      accountName: "AlfaCar",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
      periodStat: {
        entity_id: "ad-reach-1",
        spend: 50,
        impressions: 12000,
        reach: 10000,
        frequency: 1.2,
        inline_link_clicks: 40,
        all_clicks: 90,
        conversions: 0,
        optimization_goal: "REACH",
      },
    });

    assert.equal(adMensagens.linkClicks, 80);
    assert.equal(adMensagens.allClicks, 120);
    assert.equal(adMensagens.unitCost, 5);
    assert.equal(adAlcance.resultCategory, "REACH");
    assert.equal(adAlcance.results, 10000);
    assert.equal(adAlcance.unitCost, 5); // R$50 / 10000 * 1000 = R$5,00 por 1k alcançados

    const enriched = enrichCreativePeerSignals([adBonne21Attributed, adMensagens, adAlcance]);
    const overview = buildCreativeManagerOverview(enriched, []);

    assert.equal(overview.mixedObjectivesDetected, true);
    assert.equal(overview.totalsByObjective.length, 3);
    assert.equal(overview.zeroSpendAttributedCount, 1);
  });

  it("2. Fadiga e diversidade criativa exigem evidência temporal e mantêm fatores alternativos explícitos", () => {
    const poucaAmostra = buildCreativeAdRecord({
      ad: {
        id: "ad-low",
        name: "Anúncio Teste Novo",
        ad_account_id: "act_1",
        campaigns: { name: "Campanha X", objective: "MESSAGES" },
        ad_sets: { name: "Set X" },
      },
      accountName: "Conta X",
      dateFrom: "2026-11-10",
      dateTo: "2026-11-15",
      dailyRows: [
        { ad_id: "ad-low", date: "2026-11-14", cost: 10, impressions: 200, reach: 180, conversions: 1 },
        { ad_id: "ad-low", date: "2026-11-15", cost: 8, impressions: 150, reach: 140, conversions: 0 },
      ],
    });
    const diagLow = evaluateCreativeFatigue(poucaAmostra);
    assert.equal(diagLow.status, "insufficient_evidence");
    assert.ok(diagLow.alternativeFactors.length >= 3);

    const desgastado = buildCreativeAdRecord({
      ad: {
        id: "ad-fatigued",
        name: "Anúncio Antigo Saturação",
        ad_account_id: "act_1",
        ad_set_id: "set-dom",
        campaigns: { name: "Campanha Y", objective: "MESSAGES" },
        ad_sets: { name: "Conjunto Dominado" },
      },
      accountName: "Conta Y",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
      dailyRows: [
        { ad_id: "ad-fatigued", date: "2026-11-01", cost: 40, impressions: 1200, reach: 1000, frequency: 1.2, inline_link_clicks: 36, conversions: 10 },
        { ad_id: "ad-fatigued", date: "2026-11-02", cost: 40, impressions: 1200, reach: 900, frequency: 1.33, inline_link_clicks: 34, conversions: 9 },
        { ad_id: "ad-fatigued", date: "2026-11-03", cost: 40, impressions: 1100, reach: 750, frequency: 1.46, inline_link_clicks: 30, conversions: 8 },
        { ad_id: "ad-fatigued", date: "2026-11-08", cost: 45, impressions: 900, reach: 300, frequency: 3.0, inline_link_clicks: 12, conversions: 2 },
        { ad_id: "ad-fatigued", date: "2026-11-09", cost: 45, impressions: 850, reach: 260, frequency: 3.26, inline_link_clicks: 10, conversions: 2 },
        { ad_id: "ad-fatigued", date: "2026-11-10", cost: 45, impressions: 800, reach: 230, frequency: 3.47, inline_link_clicks: 9, conversions: 1 },
      ],
    });
    const diagFatigue = evaluateCreativeFatigue(desgastado);
    assert.equal(diagFatigue.status, "possible_fatigue");
    assert.ok(diagFatigue.signals.length >= 2);
    assert.ok(diagFatigue.alternativeFactors.some((f) => /orçamento|público/i.test(f)));

    const diversity = evaluateCreativeDiversity([desgastado]);
    assert.equal(diversity[0].status, "single_creative_dominant");
  });

  it("3. Planejador de testes bloqueia mistura de objetivos e exige evidência antes de declarar vencedor", () => {
    const adA = buildCreativeAdRecord({
      ad: { id: "a", name: "Var A", ad_account_id: "act_1", campaigns: { objective: "MESSAGES" }, ad_sets: {} },
      accountName: "C1",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
      periodStat: { entity_id: "a", spend: 50, impressions: 1500, conversions: 10, optimization_goal: "CONVERSATIONS" },
    });
    const adB = buildCreativeAdRecord({
      ad: { id: "b", name: "Var B", ad_account_id: "act_1", campaigns: { objective: "OUTCOME_AWARENESS" }, ad_sets: {} },
      accountName: "C1",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-10",
      periodStat: { entity_id: "b", spend: 50, impressions: 4000, reach: 3500, optimization_goal: "REACH" },
    });

    const evalMixed = evaluateCreativeTestEvidence({
      testType: "observational_comparison",
      participantAds: [adA, adB],
    });
    assert.equal(evalMixed.mixedObjectivesWarning, true);
    assert.equal(evalMixed.isComparable, false);
    assert.equal(evalMixed.recommendedStatus, "inconclusive");
    assert.match(evalMixed.causalLimitationNote, /observacional/i);
  });

  it("4. Validação de upload acessível e preservação estrita de fatos comerciais na produção de arte", () => {
    assert.equal(validateCreativeUploadFile({ name: "ok.png", type: "image/png", size: 1024 * 500 }).valid, true);
    assert.equal(validateCreativeUploadFile({ name: "ok.webp", type: "image/webp", size: 2000 }).valid, true);
    assert.equal(validateCreativeUploadFile({ name: "doc.pdf", type: "application/pdf", size: 2000 }).valid, false);
    assert.equal(validateCreativeUploadFile({ name: "heavy.jpg", type: "image/jpeg", size: 12 * 1024 * 1024 }).valid, false);

    const facts = extractConfirmedArtFacts({
      vehicleModel: "Honda Civic Touring",
      year: "2023",
      price: "R$ 164.900",
      cta: "Falar no WhatsApp",
    });
    assert.equal(facts.confirmedFacts["Modelo"], "Honda Civic Touring");
    assert.equal(facts.confirmedFacts["Preço / Entrada"], "R$ 164.900");
    assert.equal(facts.confirmedFacts["Quilometragem"], undefined);
  });

  it("5. Contexto da Victoria em /criativos preserva READ_ONLY_ANALYSIS e isola metas de CPL de campanhas incompatíveis", () => {
    const adReach = buildCreativeAdRecord({
      ad: {
        id: "ad-v1",
        external_id: "777",
        name: "Alcance Showroom",
        ad_account_id: "act_99",
        campaign_id: "camp-99",
        ad_set_id: "set-99",
        campaigns: { id: "camp-99", name: "Branding", objective: "OUTCOME_AWARENESS" },
        ad_sets: { id: "set-99", name: "Local" },
      },
      accountName: "Rio 2",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
      periodStat: {
        entity_id: "ad-v1",
        spend: 120,
        impressions: 24000,
        reach: 20000,
        optimization_goal: "REACH",
      },
    });

    const ctx = buildContextFromCreativeItem({
      record: adReach,
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
      accountMaxCplTarget: 25,
    });
    assert.equal(ctx.source_surface, "criativos");
    assert.equal(ctx.operational_mode, "READ_ONLY_ANALYSIS");
    assert.equal(ctx.optimization.category, "REACH");
    assert.equal(ctx.governance_and_benchmarks.account_max_cpl_target, null);
  });
});

describe("Sistema Global de Notificações e Alertas — Preservação de Regras & UX Não Destrutiva", () => {
  it("6. Navegação e fila de alertas pendentes preservam contexto completo e não repetem toast já visto", () => {
    const parsed = parseNotificationTargetLink("/campanhas?account=act_123&campaign=uuid-1&date=2026-11-14");
    assert.equal(parsed.to, "/metricas");
    assert.equal(parsed.search.account, "act_123");
    assert.equal(parsed.search.campaign, "uuid-1");
    assert.equal(parsed.search.date, "2026-11-14");

    const seen = new Set<string>(["n-already-toasted"]);
    const items = [
      { id: "n-read", title: "Lida", message: "m", created_at: "2026-11-14T10:00:00Z", is_read: true, is_dismissed: false },
      { id: "n-dismissed", title: "Disp.", message: "m", created_at: "2026-11-14T11:00:00Z", is_read: false, is_dismissed: true },
      { id: "n-already-toasted", title: "Visto", message: "m", created_at: "2026-11-14T12:00:00Z", is_read: false, is_dismissed: false },
      { id: "n-offline-pending", title: "Chegou Offline", message: "m", created_at: "2026-11-14T08:00:00Z", is_read: false, is_dismissed: false },
    ];
    const q = selectPendingToastQueue(items, seen, 3);
    assert.equal(q.queue.length, 1);
    assert.equal(q.queue[0].id, "n-offline-pending");
    assert.equal(q.pendingUnreadTotal, 2); // n-already-toasted + n-offline-pending seguem não lidos na caixa
  });

  it("7. notificationService.ts não destrói histórico na tabela notifications e usa notification_user_states", () => {
    const svcSrc = readFile("src/lib/notificationService.ts");
    assert.ok(svcSrc.includes("notification_user_states"));
    assert.equal(svcSrc.includes('.from("notifications").delete()'), false);
    assert.equal(svcSrc.includes('.from("notifications")\n        .delete()'), false);
    assert.equal(svcSrc.includes('.from("notifications")\n      .delete()'), false);
  });
});

describe("Auditoria /criativos — Frescor Único, Victoria FIT 2009, RAG Parity, Fadiga/Janela e Magic Bytes", () => {
  it("8. Fonte única de frescor: 33 min é 'stale' em classifySnapshotFreshness, buildVictoriaAnalysisContext e servidor", () => {
    const nowMs = Date.UTC(2026, 10, 15, 16, 0, 0);
    const thirtyThreeMinAgo = new Date(nowMs - 33 * 60_000).toISOString();

    const freshness = classifySnapshotFreshness(thirtyThreeMinAgo, {
      nowMs,
      staleThresholdMinutes: DEFAULT_SYNC_STALE_THRESHOLD_MINUTES,
    });
    assert.equal(freshness.status, "stale");
    assert.equal(freshness.isStale, true);
    assert.equal(freshness.ageMinutes, 33);
    assert.match(freshness.label, /33|defasado/i);

    const ctx = buildVictoriaAnalysisContext({
      entity_id: "camp-fresh-1",
      entity_level: "campaign",
      entity_name: "Campanha Teste",
      ad_account_id: "act_1",
      ad_account_name: "Conta Teste",
      surface: "criativos",
      route: "/criativos",
      raw_objective: "OUTCOME_ENGAGEMENT",
      optimization_goal: "CONVERSATIONS",
      destination_type: "WHATSAPP",
      spend: 100,
      conversions: 10,
      impressions: 1000,
      reach: 900,
      clicks: 30,
      date_from: "2026-11-10",
      date_to: "2026-11-15",
      last_sync_at: new Date(Date.now() - 33 * 60_000).toISOString(),
    });
    assert.equal(ctx.period.data_freshness, "stale");

    const serverLabel = formatVictoriaFreshnessLabelServer(ctx.period);
    assert.match(serverLabel, /defasado/i);
    assert.doesNotMatch(serverLabel, /recente|fresh/i);
  });

  it("9. FIT 2009 / Rio2 (OUTCOME_ENGAGEMENT + CONVERSATIONS) preserva result_indicator string canônica e evita context_mismatch", () => {
    const adFit = buildCreativeAdRecord({
      ad: {
        id: "ad-fit-2009",
        external_id: "1202555009",
        name: "FIT 2009",
        ad_account_id: "act_243135681723027",
        campaign_id: "camp-fit",
        ad_set_id: "set-fit",
        campaigns: { id: "camp-fit", name: "Rio 2 — Mensagens", objective: "OUTCOME_ENGAGEMENT" },
        ad_sets: { id: "set-fit", name: "Local Rio 2" },
      },
      accountName: "NC - Rio 2 Veículos",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
      periodStat: {
        entity_id: "ad-fit-2009",
        spend: 185.4,
        impressions: 5400,
        reach: 4100,
        inline_link_clicks: 82,
        conversions: 24,
        optimization_goal: "CONVERSATIONS",
        result_indicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      },
    });

    assert.equal(
      adFit.resultIndicator,
      "actions:onsite_conversion.messaging_conversation_started_7d"
    );

    const ctx = buildContextFromCreativeItem({
      record: adFit,
      dateFrom: "2026-11-01",
      dateTo: "2026-11-15",
    });
    assert.equal(
      ctx.result_indicator.code,
      "onsite_conversion.messaging_conversation_started_7d"
    );

    const okCheck = matchesCanonicalContextIdentity(ctx, {
      request_id: ctx.request_id,
      analysis_context_hash: ctx.analysis_context_hash,
      ad_account_id: ctx.ad_account_id,
      entity_level: ctx.entity_level,
      entity_id: ctx.entity_id,
      date_from: ctx.period.date_from,
      date_to: ctx.period.date_to,
      result_indicator: ctx.result_indicator.code,
      contract_version: ctx.contract_version,
      prompt_version: ctx.prompt_version,
    });
    assert.equal(okCheck.valid, true);
    assert.deepEqual(okCheck.mismatches, []);

    const mismatchCheck = matchesCanonicalContextIdentity(ctx, {
      request_id: ctx.request_id,
      analysis_context_hash: ctx.analysis_context_hash,
      ad_account_id: ctx.ad_account_id,
      entity_level: ctx.entity_level,
      entity_id: ctx.entity_id,
      date_from: ctx.period.date_from,
      date_to: ctx.period.date_to,
      result_indicator: "[object Object]",
      contract_version: ctx.contract_version,
      prompt_version: ctx.prompt_version,
    });
    assert.equal(mismatchCheck.valid, false);
    assert.ok(mismatchCheck.mismatches.some((m) => m.includes("result_indicator")));
  });

  it("10. Paridade de citações RAG: selectUsedRagCitations e enforceServerPostLlmGuardrails alinham candidatas vs efetivamente citadas", () => {
    const candidates = [
      { id: "doc-meta-1", title: "Guia WhatsApp Meta", version: "1.0", evidence_level: "oficial", approval_status: "approved" },
      { id: "doc-meta-2", title: "Guia Instagram Visits", version: "1.0", evidence_level: "oficial", approval_status: "approved" },
      { id: "doc-meta-3", title: "Guia Alcance e CPM", version: "1.0", evidence_level: "oficial", approval_status: "approved" },
    ];
    const citedOnlyOne = `
### O que esta campanha foi configurada para otimizar?
Mensagens no WhatsApp.
1. Escopo analisado
2. Objetivo e evento oficial
3. Leitura factual
4. Indicadores primários e secundários
5. Limitações e dados ausentes
6. Hipóteses
7. Recomendações seguras
8. Plano de validação
9. Nível de confiança
10. Fontes e documentos utilizados
- [doc-meta-1] **Guia WhatsApp Meta** aplicada ao diagnóstico.
    `.trim();

    const used = selectUsedRagCitations(citedOnlyOne, candidates);
    assert.equal(used.length, 1);
    assert.equal(used[0].id, "doc-meta-1");

    const guarded = enforceServerPostLlmGuardrails(
      citedOnlyOne,
      {
        entity_id: "ad-fit-2009",
        entity_level: "ad",
        entity_name: "FIT 2009",
        ad_account_id: "act_243135681723027",
        ad_account_name: "NC - Rio 2 Veículos",
        optimization: { official_objective: "OUTCOME_ENGAGEMENT", optimization_goal: "CONVERSATIONS", category: "MESSAGES" },
        result_indicator: { unit_label: "conversa", cost_label: "Custo por conversa", official_indicator: "actions:onsite_conversion.messaging_conversation_started_7d" },
        financial: { spend: 100, spend_label: "R$ 100,00" },
        raw_metrics: { result_value: 10, cost_per_result: 10, impressions: 1000, reach: 800, link_clicks: 20, frequency: 1.25 },
        period: { date_from: "2026-11-01", date_to: "2026-11-15", days_count: 15, sync_freshness: "fresh" },
      },
      candidates,
      "READ_ONLY_ANALYSIS",
      true
    );
    assert.equal(guarded.replacedByDeterministic, false);
    assert.deepEqual(guarded.citationsUsed.map((c) => c.id), ["doc-meta-1"]);
  });

  it("11. Separação explícita entre fadiga criativa e concentração de investimento + isolamento por conta/objetivo", () => {
    const activeStableA = buildCreativeAdRecord({
      ad: { id: "ad-s1", name: "Estável 1", ad_account_id: "act_1", campaign_id: "c1", ad_set_id: "shared-set", campaigns: { objective: "OUTCOME_ENGAGEMENT" }, ad_sets: { id: "shared-set", name: "Conjunto A" } },
      accountName: "Conta 1",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-08",
      periodStat: { entity_id: "ad-s1", spend: 180, impressions: 4000, reach: 3800, frequency: 1.05, inline_link_clicks: 120, conversions: 20, optimization_goal: "CONVERSATIONS" },
      dailyRows: [
        { ad_id: "ad-s1", date: "2026-11-01", cost: 30, impressions: 650, reach: 620, frequency: 1.05, inline_link_clicks: 20, conversions: 3 },
        { ad_id: "ad-s1", date: "2026-11-02", cost: 30, impressions: 680, reach: 650, frequency: 1.05, inline_link_clicks: 21, conversions: 4 },
        { ad_id: "ad-s1", date: "2026-11-05", cost: 60, impressions: 1320, reach: 1250, frequency: 1.06, inline_link_clicks: 40, conversions: 7 },
        { ad_id: "ad-s1", date: "2026-11-06", cost: 60, impressions: 1350, reach: 1280, frequency: 1.05, inline_link_clicks: 39, conversions: 6 },
      ],
    });
    const otherAccountSameSet = buildCreativeAdRecord({
      ad: { id: "ad-s2", name: "Outra Conta", ad_account_id: "act_2", campaign_id: "c2", ad_set_id: "shared-set", campaigns: { objective: "OUTCOME_AWARENESS" }, ad_sets: { id: "shared-set", name: "Conjunto A" } },
      accountName: "Conta 2",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-08",
      periodStat: { entity_id: "ad-s2", spend: 90, impressions: 10000, reach: 9000, optimization_goal: "REACH" },
    });

    const diagA = evaluateCreativeFatigue(activeStableA, { dateFrom: "2026-11-01", dateTo: "2026-11-08" });
    const diversity = evaluateCreativeDiversity([activeStableA, otherAccountSameSet]);
    assert.equal(diversity.length, 2); // Nunca mistura act_1/MESSAGES com act_2/REACH mesmo com id igual

    const overview = buildCreativeManagerOverview([activeStableA], [diagA], diversity);
    assert.equal(overview.fatiguePossibleCount, 0);
    assert.ok(overview.concentratedGroupsCount >= 1);
  });

  it("12. Janela temporal < 4 dias marca 'Período insuficiente' e dias com entrega zero nunca disparam fadiga ou estabilidade", () => {
    const oneDayAd = buildCreativeAdRecord({
      ad: { id: "ad-1d", name: "Hoje", ad_account_id: "act_1", campaigns: { objective: "MESSAGES" }, ad_sets: {} },
      accountName: "C1",
      dateFrom: "2026-11-15",
      dateTo: "2026-11-15",
      periodStat: { entity_id: "ad-1d", spend: 50, impressions: 1200, reach: 1100, conversions: 8, optimization_goal: "CONVERSATIONS" },
      dailyRows: [
        { ad_id: "ad-1d", date: "2026-11-15", cost: 50, impressions: 1200, reach: 1100, frequency: 1.09, inline_link_clicks: 25, conversions: 8 },
      ],
    });
    const diag1d = evaluateCreativeFatigue(oneDayAd, { dateFrom: "2026-11-15", dateTo: "2026-11-15" });
    assert.equal(diag1d.status, "insufficient_evidence");
    assert.equal(diag1d.periodTooShort, true);
    assert.equal(diag1d.selectedWindowDays, 1);
    assert.ok(diag1d.selectedWindowDays < MIN_TREND_WINDOW_DAYS);

    const zeroDeliveryRowsAd = buildCreativeAdRecord({
      ad: { id: "ad-zero", name: "Sem Entrega", ad_account_id: "act_1", campaigns: { objective: "MESSAGES" }, ad_sets: {} },
      accountName: "C1",
      dateFrom: "2026-11-01",
      dateTo: "2026-11-07",
      periodStat: { entity_id: "ad-zero", spend: 0, impressions: 0, reach: 0, conversions: 0, optimization_goal: "CONVERSATIONS" },
      dailyRows: [
        { ad_id: "ad-zero", date: "2026-11-01", cost: 0, impressions: 0, reach: 0, inline_link_clicks: 0, conversions: 0 },
        { ad_id: "ad-zero", date: "2026-11-02", cost: 0, impressions: 0, reach: 0, inline_link_clicks: 0, conversions: 0 },
        { ad_id: "ad-zero", date: "2026-11-03", cost: 0, impressions: 0, reach: 0, inline_link_clicks: 0, conversions: 0 },
        { ad_id: "ad-zero", date: "2026-11-04", cost: 0, impressions: 0, reach: 0, inline_link_clicks: 0, conversions: 0 },
        { ad_id: "ad-zero", date: "2026-11-05", cost: 0, impressions: 0, reach: 0, inline_link_clicks: 0, conversions: 0 },
      ],
    });
    const diagZero = evaluateCreativeFatigue(zeroDeliveryRowsAd, { dateFrom: "2026-11-01", dateTo: "2026-11-07" });
    assert.equal(diagZero.status, "insufficient_evidence");
    assert.equal(diagZero.signals.length, 0);
  });

  it("13. Upload valida magic bytes reais (PNG/JPG/WEBP) e rejeita PDF/texto disfarçado", () => {
    const validPng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const validJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    const validWebp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x00, 0x00, 0x00]);

    assert.equal(detectImageMimeFromMagicBytes(validPng), "image/png");
    assert.equal(detectImageMimeFromMagicBytes(validJpg), "image/jpeg");
    assert.equal(detectImageMimeFromMagicBytes(validWebp), "image/webp");
    assert.equal(detectImageMimeFromMagicBytes(fakePdf), null);
  });

  it("14. Privacidade de sync em /criativos, RBAC backend em sync-meta-ads e guardrails no planejador", () => {
    const criativosSrc = readFile("src/routes/_app/criativos.tsx");
    assert.equal(criativosSrc.includes("SnapshotStatusBadge"), false);
    assert.equal(criativosSrc.includes("{activeSnapshot.snapshotId}"), false);
    assert.equal(criativosSrc.includes("Sincronizar contas"), false);
    assert.equal(criativosSrc.includes("from(\"sync_history\")"), false);

    const syncEdgeSrc = readFile("supabase/functions/sync-meta-ads/index.ts");
    assert.ok(syncEdgeSrc.includes('.select("email, role, position, permissions, status")'));
    assert.equal(syncEdgeSrc.includes('.select("role, cargo, permissions, active")'), false);

    const testsModalSrc = readFile("src/components/criativos/CreativeTestsSection.tsx");
    assert.ok(testsModalSrc.includes("selectedAccountHealth"));
    assert.ok(testsModalSrc.includes("-- Selecione uma conta de anúncios --"));
    assert.ok(testsModalSrc.includes("ads_read/ads_management"));
  });
});
