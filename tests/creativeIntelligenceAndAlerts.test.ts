import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  buildCreativeAdRecord,
  buildCreativeManagerOverview,
  enrichCreativePeerSignals,
  evaluateCreativeDiversity,
  evaluateCreativeFatigue,
  evaluateCreativeTestEvidence,
  extractConfirmedArtFacts,
  validateCreativeUploadFile,
} from "../src/lib/creativeIntelligenceDomain.ts";
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
