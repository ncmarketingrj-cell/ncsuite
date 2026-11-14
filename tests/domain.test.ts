import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatPeriodLabel,
  isFullCalendarMonth,
  formatCivilDateBR,
  isDateWithinCivilRange,
  classifyMetaEvent,
  computeUnitCost,
  computeWeightedAggregates,
  computeCvr,
  buildReportSnapshot,
  resolveTargetPrecedence,
  evaluateCampaignHealth,
  normalizeCampaignItem,
} from "../src/lib/metricsDomain.ts";

describe("NC Metrics Domain — Datas Civis & Timezone", () => {
  it("mantém a data civil 2026-11-12 idêntica em UTC e America/Sao_Paulo (ID 22)", () => {
    assert.equal(formatCivilDateBR("2026-11-12"), "12/11/2026");
    assert.equal(formatCivilDateBR("2026-11-12T00:00:00Z"), "12/11/2026");
    assert.equal(isDateWithinCivilRange("2026-11-12", "2026-11-12", "2026-11-12"), true);
    assert.equal(isDateWithinCivilRange("2026-11-11", "2026-11-12", "2026-11-12"), false);
  });

  it("um único dia nunca vira Relatório Mensal e respeita mês completo/bissexto (ID 02)", () => {
    const singleDay = formatPeriodLabel("2026-11-12", "2026-11-12");
    assert.equal(singleDay.label, "12/11/2026");
    assert.equal(singleDay.isFullMonth, false);
    assert.equal(singleDay.reportTitlePrefix, "Relatório diário");

    const partial = formatPeriodLabel("2026-11-01", "2026-11-12");
    assert.equal(partial.label, "01/11/2026 a 12/11/2026");
    assert.equal(partial.isFullMonth, false);
    assert.equal(partial.reportTitlePrefix, "Relatório de performance");

    const crossMonth = formatPeriodLabel("2026-10-25", "2026-11-05");
    assert.equal(crossMonth.label, "25/10/2026 a 05/11/2026");
    assert.equal(crossMonth.isFullMonth, false);

    const fullNov = formatPeriodLabel("2026-11-01", "2026-11-30");
    assert.equal(fullNov.label, "NOVEMBRO 2026");
    assert.equal(fullNov.isFullMonth, true);
    assert.equal(fullNov.reportTitlePrefix, "Relatório mensal");

    assert.equal(isFullCalendarMonth("2024-02-01", "2024-02-29"), true);
    assert.equal(isFullCalendarMonth("2024-02-01", "2024-02-28"), false);
  });
});

describe("NC Metrics Domain — Fixtures A, B, D", () => {
  it("Fixture A (Rio2 2026-11-12): separa conversas (12) de visitas ao perfil (179), nunca soma 191 (ID 04)", () => {
    const rio2Rows = [
      {
        id: "rio2_msg",
        name: "NC | CMP MSG",
        rawObjective: "OUTCOME_ENGAGEMENT",
        optimizationGoal: "CONVERSATIONS",
        resultType: "MESSAGES",
        cost: 106.81,
        conversions: 12,
        clicks: 84,
        impressions: 11665,
        reach: 9800,
      },
      {
        id: "rio2_prof",
        name: "Tráfego Audiência IG",
        rawObjective: "OUTCOME_TRAFFIC",
        optimizationGoal: "VISIT_INSTAGRAM_PROFILE",
        resultType: "INSTAGRAM_PROFILE",
        cost: 50.66,
        conversions: 179,
        clicks: 182,
        impressions: 4341,
        reach: 3800,
      },
    ];

    const agg = computeWeightedAggregates(rio2Rows);
    assert.equal(agg.totalMediaSpend.toFixed(2), "157.47");
    assert.equal(agg.totalImpressions, 16006);
    assert.equal(agg.totalClicks, 266);
    assert.equal(agg.messagesCount, 12);
    assert.equal(agg.conversionResults, 12);
    assert.equal(agg.cpaMessages!.toFixed(2), "8.90");
    assert.equal(agg.blendedMediaCostPerConversion!.toFixed(2), "13.12");
    assert.equal(agg.hasMixedObjectives, true);
  });

  it("Fixture B (MOVE ALUGUEL 2026-11-12): concilia 64,08 / 22 conversas / CPA 2,91 sem fallback de cliques nem divisão errada de Frente 2 (ID 01, 36)", () => {
    const moveRows = [
      { id: "m1", name: "11/11 HONDA FACTOR", rawObjective: "OUTCOME_ENGAGEMENT", resultType: "MESSAGES", cost: 16.08, conversions: 11, clicks: 15, impressions: 565, reach: 500 },
      { id: "m2", name: "NC | MSG — 2", rawObjective: "OUTCOME_ENGAGEMENT", resultType: "MESSAGES", cost: 13.46, conversions: 0, clicks: 3, impressions: 247, reach: 220 },
      { id: "m3", name: "11/11 CBO INS|FB HONDA POP 19 A 45", rawObjective: "OUTCOME_ENGAGEMENT", resultType: "MESSAGES", cost: 12.93, conversions: 4, clicks: 10, impressions: 498, reach: 450 },
      { id: "m4", name: "NC | MSG — 1", rawObjective: "OUTCOME_ENGAGEMENT", resultType: "MESSAGES", cost: 12.08, conversions: 5, clicks: 6, impressions: 346, reach: 310 },
      { id: "m5", name: "NC | MSG — Em torno", rawObjective: "OUTCOME_ENGAGEMENT", resultType: "MESSAGES", cost: 9.53, conversions: 2, clicks: 7, impressions: 456, reach: 410 },
    ];

    const snap = buildReportSnapshot({
      clientName: "MOVE ALUGUEL",
      accountName: "MOVE ALUGUEL",
      dateFrom: "2026-11-12",
      dateTo: "2026-11-12",
      campaigns: moveRows,
      mode: "standard",
    });

    assert.equal(snap.summary.totalMediaSpend.toFixed(2), "64.08");
    assert.equal(snap.summary.messagesCount, 22);
    assert.equal(snap.summary.totalClicks, 41);
    assert.equal(snap.summary.totalImpressions, 2112);
    assert.equal(snap.summary.cpaMessages!.toFixed(2), "2.91");
    assert.equal(snap.summary.groupsByCategory.length, 1);
    assert.equal(snap.summary.groupsByCategory[0].category, "MESSAGES");
    assert.equal(snap.periodLabel, "12/11/2026");
    assert.ok(snap.whatsappText.includes("Total de conversas iniciadas: 22"));
    assert.ok(snap.whatsappText.includes("R$ 2,91"));
    assert.ok(!snap.whatsappText.includes("Relatório mensal"));
    // Garante que NC | MSG — 2 com 0 conversas retorna null no unitCost (nunca R$ 0,00)
    const zeroCamp = snap.items.find((i) => i.id === "m2")!;
    assert.equal(zeroCamp.unitCost, null);
  });

  it("Fixture D (Alcance): aplica multiplicador x1000 para Por 1.000 pessoas alcançadas (ID 07)", () => {
    const costPerThousand = computeUnitCost(633.4, 576413, "REACH");
    assert.ok(costPerThousand !== null);
    assert.equal(costPerThousand.toFixed(2), "1.10");

    // Divisão por zero não vira R$ 0,00
    assert.equal(computeUnitCost(100, 0, "MESSAGES"), null);
    assert.equal(computeUnitCost(100, 0, "REACH"), null);
  });
});

describe("NC Metrics Domain — Modelo de Eventos & Diagnóstico", () => {
  it("separa objetivo bruto de evento real (CMP - NC - SITE com indicator LPV -> LANDING_PAGE_VIEWS, ID 05)", () => {
    const cls = classifyMetaEvent({
      campaignName: "CMP - NC - SITE",
      rawObjective: "OUTCOME_ENGAGEMENT",
      resultsIndicator: "actions:landing_page_view",
    });
    assert.equal(cls.category, "LANDING_PAGE_VIEWS");
    assert.equal(cls.isConversionGoal, false);
  });

  it("evento desconhecido não inventa lead/conversa e marca requiresReview", () => {
    const cls = classifyMetaEvent({
      campaignName: "Campanha X Genérica 2026",
    });
    assert.equal(cls.category, "UNKNOWN");
    assert.equal(cls.requiresReview, true);
    assert.equal(cls.isConversionGoal, false);
  });

  it("CVR > 100% ou incompatível não é anunciada como conversão de funil (ID 14)", () => {
    const cvr = computeCvr(500, 20, "MESSAGES");
    assert.equal(cvr.isFunnelCompatible, false);
  });

  it("Awareness não recomenda pausa por zero WhatsApp (ID 06) e gasto zero não escala (ID 37)", () => {
    const awarenessItem = normalizeCampaignItem({
      id: "aw1",
      name: "Alcance Institucional",
      rawObjective: "OUTCOME_AWARENESS",
      resultType: "REACH",
      cost: 120,
      conversions: 0,
      clicks: 40,
      impressions: 12000,
      reach: 9500,
    });
    const evalAw = evaluateCampaignHealth({ item: awarenessItem });
    assert.notEqual(evalAw.status, "PAUSAR");
    assert.equal(evalAw.eligibility.canPause, false);

    const zeroSpendPositiveConv = normalizeCampaignItem({
      id: "zs1",
      name: "NC | MSG",
      resultType: "MESSAGES",
      cost: 0,
      conversions: 2,
      clicks: 5,
      impressions: 100,
      reach: 90,
    });
    const evalZs = evaluateCampaignHealth({ item: zeroSpendPositiveConv });
    assert.equal(evalZs.status, "AGUARDAR_AMOSTRA");
    assert.equal(evalZs.eligibility.canScale, false);
  });

  it("veredito único não mistura 'custo acima da meta' com 'escalar' (ID 03) e respeita precedência de metas (ID 27)", () => {
    const target = resolveTargetPrecedence({
      campaignRuleMaxCpl: 15,
      accountThresholdMaxCpl: 12,
      regionalBenchmarkCpl: 5,
      category: "MESSAGES",
    });
    assert.equal(target.source, "campaign_rule");
    assert.equal(target.targetValue, 15);
    assert.ok(target.conflicts.length >= 1);

    const item = normalizeCampaignItem({
      id: "r1",
      name: "NC | MSG",
      resultType: "MESSAGES",
      cost: 100,
      conversions: 5, // CPA = 20 > meta 15
      clicks: 50,
      impressions: 5000,
      reach: 4200,
    });
    const ev = evaluateCampaignHealth({
      item,
      targetCandidates: { campaignRuleMaxCpl: 15 },
    });
    assert.equal(ev.status, "OTIMIZAR");
    assert.equal(ev.eligibility.canScale, false);
  });
});
