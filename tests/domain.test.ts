import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatPeriodLabel,
  isFullCalendarMonth,
  formatCivilDateBR,
  isDateWithinCivilRange,
  classifyMetaEvent,
  classifyDeliveryState,
  deriveEffectiveCampaignStatus,
  computeUnitCost,
  computeWeightedAggregates,
  computeCvr,
  buildReportSnapshot,
  resolveTargetPrecedence,
  evaluateCampaignHealth,
  normalizeCampaignItem,
  computeCampaignBudgetDistribution,
  computeHomogeneousBenchmark,
  hasEntityDelivery,
  getCampaignSelectorResultDisplay,
} from "../src/lib/metricsDomain.ts";
import {
  buildSocialSourceTelemetry,
  deriveOverallSocialState,
  isVictoriaSocialContextUsable,
  classifySocialErrorState,
} from "../src/lib/metaSocialErrors.ts";

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

describe("Command Center — Distribuição da Verba Publicitária (10 Cenários Obrigatórios)", () => {
  it("1. 0 campanhas -> retorna contagens zero, média null e fatias vazias", () => {
    const res = computeCampaignBudgetDistribution([]);
    assert.equal(res.totalConfiguredCampaigns, 0);
    assert.equal(res.deliveringCampaigns, 0);
    assert.equal(res.spendingCampaigns, 0);
    assert.equal(res.totalSpend, 0);
    assert.equal(res.averageSpendPerSpendingCampaign, null);
    assert.equal(res.slicesCount, 0);
    assert.equal(res.sumSliceSpend, 0);
    assert.equal(res.sumSlicePercentage, 0);
  });

  it("2. 1 campanha com gasto -> 1 fatia (100%), média igual ao gasto da campanha", () => {
    const res = computeCampaignBudgetDistribution([
      { id: "c1", name: "Campanha Única", cost: 184.08, conversions: 28, impressions: 4500 },
    ]);
    assert.equal(res.totalConfiguredCampaigns, 1);
    assert.equal(res.deliveringCampaigns, 1);
    assert.equal(res.spendingCampaigns, 1);
    assert.equal(res.totalSpend, 184.08);
    assert.equal(res.averageSpendPerSpendingCampaign, 184.08);
    assert.equal(res.slicesCount, 1);
    assert.equal(res.sumSliceSpend, 184.08);
    assert.equal(res.sumSlicePercentage, 100);
    assert.equal(res.slices[0].isOtherSlice, false);
  });

  it("3. 5 campanhas com gasto -> 5 fatias sem grupo Outras, sum(sliceSpend)=totalSpend e sum(slicePct)=100%", () => {
    const camps = [
      { id: "1", name: "C1", cost: 100 },
      { id: "2", name: "C2", cost: 80 },
      { id: "3", name: "C3", cost: 60 },
      { id: "4", name: "C4", cost: 40 },
      { id: "5", name: "C5", cost: 20 },
    ];
    const res = computeCampaignBudgetDistribution(camps, 7);
    assert.equal(res.spendingCampaigns, 5);
    assert.equal(res.totalSpend, 300);
    assert.equal(res.averageSpendPerSpendingCampaign, 60);
    assert.equal(res.slicesCount, 5);
    assert.equal(res.sumSliceSpend, 300);
    assert.equal(res.sumSlicePercentage, 100);
    assert.equal(res.slices.some((s) => s.isOtherSlice), false);
  });

  it("4. 7 campanhas com gasto -> exatamente 7 fatias Top 7 sem grupo Outras", () => {
    const camps = Array.from({ length: 7 }, (_, i) => ({
      id: `c${i + 1}`,
      name: `Campanha ${i + 1}`,
      cost: (7 - i) * 15.25,
    }));
    const res = computeCampaignBudgetDistribution(camps, 7);
    assert.equal(res.spendingCampaigns, 7);
    assert.equal(res.slicesCount, 7);
    assert.equal(res.sumSliceSpend, res.totalSpend);
    assert.equal(res.sumSlicePercentage, 100);
    assert.equal(res.slices.some((s) => s.isOtherSlice), false);
  });

  it("5. 8 campanhas com gasto -> 8 fatias (Top 7 + Outras (1)) com sum(sliceSpend)=totalSpend", () => {
    const camps = Array.from({ length: 8 }, (_, i) => ({
      id: `c${i + 1}`,
      name: `Campanha ${i + 1}`,
      cost: (8 - i) * 10,
    }));
    const res = computeCampaignBudgetDistribution(camps, 7);
    assert.equal(res.spendingCampaigns, 8);
    assert.equal(res.totalSpend, 360);
    assert.equal(res.averageSpendPerSpendingCampaign, 45);
    assert.equal(res.slicesCount, 8);
    assert.equal(res.slices[7].name, "Outras (1)");
    assert.equal(res.slices[7].isOtherSlice, true);
    assert.equal(res.slices[7].groupedCampaignsCount, 1);
    assert.equal(res.slices[7].value, 10);
    assert.equal(res.sumSliceSpend, 360);
    assert.equal(res.sumSlicePercentage, 100);
  });

  it("6. Caso Real 13/11/2026: 23 campanhas com gasto e 293 cadastradas (Total R$ 1.257,69 -> Média R$ 54,68, nunca R$ 4,29)", () => {
    const top7Spends = [318.23, 242.59, 63.56, 50.43, 43.34, 34.48, 33.6]; // = 786.23
    const other16Spends = [
      33.58, 33.54, 33.54, 33.48, 33.42, 33.4, 33.36, 33.34,
      33.24, 33.22, 33.18, 25.0, 23.08, 22.42, 20.78, 12.88,
    ]; // = 471.46
    const spendingCamps = [...top7Spends, ...other16Spends].map((cost, idx) => ({
      id: `spend_${idx + 1}`,
      name: `Campanha Gasto ${idx + 1}`,
      cost,
      impressions: 1200,
    }));
    const deliveringZeroSpendCamp = {
      id: "deliv_24",
      name: "Campanha Entrega Sem Gasto",
      cost: 0,
      conversions: 3,
      impressions: 0,
    };
    const zeroCamps = Array.from({ length: 269 }, (_, idx) => ({
      id: `zero_${idx + 1}`,
      name: `Campanha Pausada ${idx + 1}`,
      status: "paused",
      cost: 0,
      impressions: 0,
      reach: 0,
      conversions: 0,
    }));

    const res = computeCampaignBudgetDistribution([
      ...spendingCamps,
      deliveringZeroSpendCamp,
      ...zeroCamps,
    ]);

    assert.equal(res.totalConfiguredCampaigns, 293);
    assert.equal(res.deliveringCampaigns, 24);
    assert.equal(res.spendingCampaigns, 23);
    assert.equal(res.totalSpend, 1257.69);
    assert.equal(res.averageSpendPerSpendingCampaign, 54.68);
    assert.notEqual(res.averageSpendPerSpendingCampaign, 4.29);
    assert.equal(res.slicesCount, 8);
    assert.equal(res.slices[7].name, "Outras (16)");
    assert.equal(res.slices[7].groupedCampaignsCount, 16);
    assert.equal(res.slices[7].value, 471.46);
    assert.equal(Number(res.slices[7].percentage.toFixed(1)), 37.5);
    assert.equal(res.sumSliceSpend, 1257.69);
    assert.equal(res.sumSlicePercentage, 100);
  });

  it("7. Campanhas com entrega e gasto zero -> contam em deliveringCampaigns mas nunca em spendingCampaigns nem em Outras", () => {
    const res = computeCampaignBudgetDistribution([
      { id: "c1", name: "Com Gasto", cost: 90, impressions: 1000 },
      { id: "c2", name: "Orgânica / Residual", cost: 0, impressions: 450, reach: 400 },
      { id: "c3", name: "Conversão Tardia", cost: 0, conversions: 2 },
    ]);
    assert.equal(res.totalConfiguredCampaigns, 3);
    assert.equal(res.deliveringCampaigns, 3);
    assert.equal(res.spendingCampaigns, 1);
    assert.equal(res.averageSpendPerSpendingCampaign, 90);
    assert.equal(res.slicesCount, 1);
    assert.equal(res.slices.some((s) => s.isOtherSlice), false);
  });

  it("8. Campanhas pausadas com gasto histórico no período -> entram normalmente em spendingCampaigns e na média", () => {
    const res = computeCampaignBudgetDistribution([
      { id: "p1", name: "Ativa", status: "active", cost: 120 },
      { id: "p2", name: "Pausada com Gasto no Período", status: "paused", cost: 80 },
    ]);
    assert.equal(res.totalConfiguredCampaigns, 2);
    assert.equal(res.deliveringCampaigns, 2);
    assert.equal(res.spendingCampaigns, 2);
    assert.equal(res.totalSpend, 200);
    assert.equal(res.averageSpendPerSpendingCampaign, 100);
    assert.equal(res.sumSliceSpend, 200);
    assert.equal(res.sumSlicePercentage, 100);
  });

  it("9. Campanhas pausadas sem gasto no período -> contam apenas em totalConfiguredCampaigns, sem diluir a média", () => {
    const res = computeCampaignBudgetDistribution([
      { id: "a1", name: "Ativa 1", status: "active", cost: 150 },
      { id: "p1", name: "Pausada 1", status: "paused", cost: 0 },
      { id: "p2", name: "Pausada 2", status: "paused", cost: 0 },
      { id: "p3", name: "Pausada 3", status: "paused", cost: 0 },
    ]);
    assert.equal(res.totalConfiguredCampaigns, 4);
    assert.equal(res.deliveringCampaigns, 1);
    assert.equal(res.spendingCampaigns, 1);
    assert.equal(res.averageSpendPerSpendingCampaign, 150);
    assert.equal(res.slicesCount, 1);
  });

  it("10. Múltiplas contas consolidadas -> agrega corretamente fatias, Top 2 e soma 100%", () => {
    const res = computeCampaignBudgetDistribution([
      { id: "fg1", adAccountId: "act_3177396632405159", name: "Fly Garage MSG", cost: 150.58 },
      { id: "fg2", adAccountId: "act_3177396632405159", name: "Fly Garage Reach", cost: 63.56 },
      { id: "r1", adAccountId: "act_243135681723027", name: "Rio2 MSG", cost: 184.08 },
      { id: "r2", adAccountId: "act_243135681723027", name: "Rio2 IG Profile", cost: 50.43 },
      { id: "a1", adAccountId: "act_2196562711259476", name: "AlfaCar MSG", cost: 43.34 },
      { id: "a2", adAccountId: "act_2196562711259476", name: "AlfaCar Reach", cost: 12.88 },
      { id: "z1", adAccountId: "act_2196562711259476", name: "AlfaCar Pausada", cost: 0 },
    ]);
    assert.equal(res.totalConfiguredCampaigns, 7);
    assert.equal(res.deliveringCampaigns, 6);
    assert.equal(res.spendingCampaigns, 6);
    assert.equal(res.totalSpend, 504.87);
    assert.equal(res.averageSpendPerSpendingCampaign, 84.15);
    assert.equal(res.sumSliceSpend, 504.87);
    assert.equal(res.sumSlicePercentage, 100);
    assert.equal(res.leader?.name, "Rio2 MSG");
  });
});

describe("Social Insights — Máquina de Estados & Governança Victoria AI", () => {
  it("classifica erros OAuth 190, 200, 4/17/32/613 e Timeout deterministicamente", () => {
    assert.equal(classifySocialErrorState({ code: 190, message: "Error validating access token" }).state, "token_expired");
    assert.equal(classifySocialErrorState({ code: 200, message: "Permissions error" }).state, "permission_denied");
    assert.equal(classifySocialErrorState({ code: 17, message: "User request limit reached" }).state, "rate_limited");
    assert.equal(classifySocialErrorState(new Error("AbortError: The operation was aborted due to timeout")).state, "error");
  });

  it("deriva estado geral e habilita Victoria AI somente quando há contexto utilizável", () => {
    const accOk = buildSocialSourceTelemetry({
      source: "accounts",
      state: "success",
      startedAt: "2026-11-14T10:00:00.000Z",
      finishedAt: "2026-11-14T10:00:00.450Z",
      timeoutMs: 15000,
      itemCount: 22,
      dataSource: "meta_graph_v21",
    });
    const ovOk = buildSocialSourceTelemetry({
      source: "overview",
      state: "success",
      startedAt: "2026-11-14T10:00:00.000Z",
      finishedAt: "2026-11-14T10:00:02.100Z",
      timeoutMs: 18000,
      itemCount: 1,
      dataSource: "meta_graph_v21",
    });
    const postsErr = buildSocialSourceTelemetry({
      source: "posts",
      state: "error",
      startedAt: "2026-11-14T10:00:00.000Z",
      finishedAt: "2026-11-14T10:00:02.500Z",
      timeoutMs: 18000,
      itemCount: 0,
      dataSource: "none",
      error: "Simulated posts failure",
    });

    // Overview ok + posts error -> estado parcial, mas Victoria pode rodar com contexto parcial sinalizado
    assert.equal(
      deriveOverallSocialState({
        accounts: accOk.state,
        overview: ovOk.state,
        dailySeries: "success",
        posts: postsErr.state,
      }),
      "partial"
    );
    assert.equal(
      isVictoriaSocialContextUsable({
        accountsState: accOk.state,
        overviewState: ovOk.state,
        postsState: postsErr.state,
        accountsCount: 22,
      }),
      true
    );

    // Durante loading de overview e posts -> Victoria desabilitada
    assert.equal(
      isVictoriaSocialContextUsable({
        accountsState: "success",
        overviewState: "loading",
        postsState: "loading",
        accountsCount: 22,
      }),
      false
    );
  });
});

describe("NC Metrics Domain — Benchmark Homogêneo & CPC Link vs CPC Todos", () => {
  it("calcula CPC Link e CPC Todos separados em normalizeCampaignItem e computeWeightedAggregates", () => {
    const flyMsg = normalizeCampaignItem({
      id: "camp_fg_msg",
      name: "NC - MSG - 29/06 — Cópia",
      adAccountId: "act_3177396632405159",
      resultType: "MESSAGES",
      cost: 150.6,
      conversions: 19,
      impressions: 9437,
      reach: 7196,
      clicks: 137,
      inlineLinkClicks: 137,
      allClicks: 167,
    });
    assert.ok(Math.abs((flyMsg.cpc ?? 0) - 150.6 / 137) < 0.001);
    assert.ok(Math.abs((flyMsg.cpcAll ?? 0) - 150.6 / 167) < 0.001);
    assert.ok(Math.abs((flyMsg.ctr ?? 0) - (137 / 9437) * 100) < 0.001);
    assert.ok(Math.abs((flyMsg.ctrAll ?? 0) - (167 / 9437) * 100) < 0.001);

    const zeroClicks = normalizeCampaignItem({
      id: "camp_zero_clk",
      name: "Zero Clicks",
      resultType: "REACH",
      cost: 20,
      conversions: 5000,
      impressions: 6000,
      reach: 5000,
      clicks: 0,
      inlineLinkClicks: 0,
      allClicks: 0,
    });
    assert.equal(zeroClicks.cpc, null);
    assert.equal(zeroClicks.cpcAll, null);

    const agg = computeWeightedAggregates([
      {
        id: "1",
        name: "A",
        cost: 150.6,
        conversions: 19,
        impressions: 9437,
        reach: 7196,
        clicks: 137,
        inlineLinkClicks: 137,
        allClicks: 167,
        resultType: "MESSAGES",
      },
      {
        id: "2",
        name: "B",
        cost: 63.56,
        conversions: 50013,
        impressions: 52365,
        reach: 50013,
        clicks: 21,
        inlineLinkClicks: 21,
        allClicks: 52,
        resultType: "REACH",
      },
    ]);
    assert.ok(Math.abs((agg.cpc ?? 0) - 214.16 / 158) < 0.001);
    assert.ok(Math.abs((agg.cpcAll ?? 0) - 214.16 / 219) < 0.001);
  });

  it("exclui estritamente a própria entidade do benchmark homogêneo (nunca self-benchmark)", () => {
    const targetMsg = {
      id: "camp_msg",
      external_id: "120249884798220254",
      name: "NC - MSG - 29/06 — Cópia",
      category: "MESSAGES",
      ad_account_id: "act_3177396632405159",
      level: "campaign",
      cost: 150.6,
      conversions: 19,
      reach: 7196,
      clicks: 137,
    };
    const siblingReach = {
      id: "camp_reach",
      external_id: "120238955348150254",
      name: "CMP | NC  - ALCANCE JOJO TODYNHO",
      category: "REACH",
      ad_account_id: "act_3177396632405159",
      level: "campaign",
      cost: 63.56,
      conversions: 50013,
      reach: 50013,
      clicks: 21,
    };

    const singlePeerRes = computeHomogeneousBenchmark(targetMsg, [targetMsg, siblingReach]);
    assert.equal(singlePeerRes.avg, null);
    assert.equal(singlePeerRes.peerCount, 0);
    assert.match(singlePeerRes.reason || "", /Benchmark homogêneo indisponível/i);

    // Com mais duas campanhas de MESSAGES na mesma conta, calcula média ponderada apenas dos peers
    const peerMsg2 = {
      id: "camp_msg_2",
      external_id: "12024999900001",
      name: "NC - MSG Peer 2",
      category: "MESSAGES",
      ad_account_id: "act_3177396632405159",
      level: "campaign",
      cost: 100,
      conversions: 10,
      reach: 3000,
      clicks: 80,
    };
    const peerMsg3 = {
      id: "camp_msg_3",
      external_id: "12024999900002",
      name: "NC - MSG Peer 3",
      category: "MESSAGES",
      ad_account_id: "act_3177396632405159",
      level: "campaign",
      cost: 200,
      conversions: 20,
      reach: 6000,
      clicks: 140,
    };
    const multiPeerRes = computeHomogeneousBenchmark(targetMsg, [
      targetMsg,
      siblingReach,
      peerMsg2,
      peerMsg3,
    ]);
    assert.equal(multiPeerRes.peerCount, 2);
    assert.equal(multiPeerRes.avg, 10); // (100+200)/(10+20) = 10.00 (sem contaminar com 150.6/19 = 7.93)
  });

  it("BM Bonne21: detecta atribuição tardia de compras (cost=0, conv=3, receita=267.80), ROAS e OUTCOME_ENGAGEMENT + LANDING_PAGE_VIEWS", () => {
    // 1. Atribuição tardia (janela 7d) após saldo zero não pode ser ocultada em 'Sem entrega'
    assert.equal(
      hasEntityDelivery({
        cost: 0,
        impressions: 0,
        reach: 0,
        conversions: 3,
        purchaseValue: 267.8,
      }),
      true
    );
    assert.equal(
      hasEntityDelivery({
        cost: 0,
        impressions: 0,
        reach: 0,
        conversions: 0,
        purchaseValue: 0,
      }),
      false
    );

    // 2. CMP - NC - SITE (OUTCOME_ENGAGEMENT + optimizationGoal LANDING_PAGE_VIEWS)
    const siteEv = classifyMetaEvent({
      campaignName: "CMP - NC - SITE — Cópia",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "LANDING_PAGE_VIEWS",
      isVehicleContext: false,
    });
    assert.equal(siteEv.category, "LANDING_PAGE_VIEWS");

    // 3. OUTCOME_SALES com receita/ROAS no domínio e no snapshot de relatório
    const salesNorm = normalizeCampaignItem({
      id: "120253223224110659",
      name: "NC | CMP de Vendas (05/08) - HC — Cópia x6",
      rawObjective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      resultType: "PURCHASES",
      cost: 120.48,
      conversions: 28,
      purchaseValue: 267.8,
      impressions: 7629,
      reach: 5200,
      clicks: 82,
    });
    assert.equal(salesNorm.purchaseValue, 267.8);
    assert.equal(salesNorm.roas, 2.22);

    const snap = buildReportSnapshot({
      clientName: "BM Bonne21",
      accountName: "BM Bonne21",
      dateFrom: "2026-11-05",
      dateTo: "2026-11-13",
      source: "api",
      campaigns: [
        {
          id: "120253223224110659",
          name: "NC | CMP de Vendas (05/08) - HC — Cópia x6",
          rawObjective: "OUTCOME_SALES",
          optimizationGoal: "OFFSITE_CONVERSIONS",
          resultType: "PURCHASES",
          cost: 120.48,
          conversions: 28,
          purchaseValue: 267.8,
          impressions: 7629,
          reach: 5200,
          clicks: 82,
        },
      ],
    });
    assert.equal(snap.summary.totalPurchaseValue, 267.8);
    assert.equal(snap.summary.roasPurchases, 2.22);
    assert.ok(snap.whatsappText.includes("Receita (Valor de Compra)"));
    assert.ok(snap.whatsappText.includes("ROAS"));
  });

  it("BM Bonne21 (2026-11-13): resultado atribuído com gasto zero (3 compras, R$ 267,80), CPA null (nunca R$ 0,00), status Concluída e 4 estados de entrega", () => {
    // 1. Fixture real BM Bonne21 (campanha 120253223224110659 em 2026-11-13)
    const bonne21Row = {
      id: "46f47b29-48b6-4868-a81e-d24979a91652",
      name: "NC | CMP de Vendas (05/08) - HC — Cópia — Cópia — Cópia — Cópia — Cópia — Cópia",
      rawObjective: "OUTCOME_SALES",
      optimizationGoal: "OFFSITE_CONVERSIONS",
      resultType: "PURCHASES",
      resultsIndicator: "actions:offsite_conversion.fb_pixel_purchase",
      cost: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      conversions: 3,
      purchaseValue: 267.8,
    };

    // Guard principal: CPA com gasto zero nunca retorna 0 (seria exibido como R$ 0,00)
    assert.equal(computeUnitCost(0, 3, "PURCHASES"), null);
    assert.equal(computeUnitCost(0, 0, "PURCHASES"), null);
    assert.equal(computeUnitCost(12.5, 5, "PURCHASES"), 2.5);

    const norm = normalizeCampaignItem(bonne21Row);
    assert.equal(norm.cost, 0);
    assert.equal(norm.conversions, 3);
    assert.equal(norm.purchaseValue, 267.8);
    assert.equal(norm.unitCost, null);
    assert.equal(norm.roas, null);

    // Status efetivo "Concluída" quando stop_time já encerrou (mesmo se Graph status="ACTIVE")
    const effCompleted = deriveEffectiveCampaignStatus({
      status: "active",
      delivery_status: "ACTIVE",
      stop_time: "2026-11-09T22:51:04+00:00",
      now: new Date("2026-11-13T18:00:00Z"),
    });
    assert.equal(effCompleted.code, "COMPLETED");
    assert.equal(effCompleted.label, "Concluída");
    assert.equal(effCompleted.isCompleted, true);
    assert.equal(effCompleted.isActive, false);

    const effPaused = deriveEffectiveCampaignStatus({ status: "PAUSED" });
    assert.equal(effPaused.code, "PAUSED");
    assert.equal(effPaused.label, "Pausada");

    const effArchived = deriveEffectiveCampaignStatus({ status: "ARCHIVED" });
    assert.equal(effArchived.code, "ARCHIVED");
    assert.equal(effArchived.label, "Arquivada");

    // 4 estados operacionais distintos
    assert.equal(
      classifyDeliveryState({ cost: 0, impressions: 0, reach: 0, conversions: 0, purchaseValue: 0 }).code,
      "no_delivery"
    );
    assert.equal(
      classifyDeliveryState({ cost: 0, impressions: 150, reach: 120, conversions: 0, purchaseValue: 0 }).code,
      "no_spend"
    );
    assert.equal(
      classifyDeliveryState({ cost: 45, impressions: 1200, reach: 900, conversions: 0, purchaseValue: 0 }).code,
      "no_results"
    );
    const attrZero = classifyDeliveryState(bonne21Row);
    assert.equal(attrZero.code, "attributed_zero_spend");
    assert.equal(attrZero.isAttributedOnly, true);
    assert.equal(attrZero.hasActivity, true);

    // Seletor e snapshot de relatório nunca exibem R$ 0,00 para CPA e trazem Receita + explicação de atribuição
    const selectorDisp = getCampaignSelectorResultDisplay(bonne21Row);
    assert.equal(selectorDisp.label, "Compras");
    assert.equal(selectorDisp.value, 3);
    assert.ok(selectorDisp.summaryText.includes("Receita: R$ 267,80"));
    assert.ok(selectorDisp.summaryText.includes("Atribuído (gasto zero)"));

    const zeroSpendReport = buildReportSnapshot({
      clientName: "BM Bonne21",
      accountName: "act_904927503704788",
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      source: "api",
      mode: "standard",
      campaigns: [bonne21Row],
    });
    assert.equal(zeroSpendReport.summary.cpaEligible, null);
    assert.equal(zeroSpendReport.summary.totalMediaSpend, 0);
    assert.equal(zeroSpendReport.summary.conversionResults, 3);
    assert.equal(zeroSpendReport.summary.totalPurchaseValue, 267.8);
    assert.ok(zeroSpendReport.whatsappText.includes("Não calculável (gasto zero)"));
    assert.ok(zeroSpendReport.whatsappText.includes("267,80"));
    assert.ok(zeroSpendReport.whatsappText.includes("janela de conversão Meta"));
    assert.ok(!zeroSpendReport.whatsappText.includes("CPA: R$ 0,00"));

    // Consistência hierárquica por nível (2 anúncios somam 2+1 = 3 e 182.90+84.90 = 267.80) sem soma entre níveis
    const adsAgg = computeWeightedAggregates([
      { ...bonne21Row, id: "ad_bonne_meme_1", name: "Bonne Meme 1", conversions: 2, purchaseValue: 182.9 },
      { ...bonne21Row, id: "ad_motoboy", name: "MOTOBOY", conversions: 1, purchaseValue: 84.9 },
    ]);
    assert.equal(adsAgg.conversionResults, 3);
    assert.equal(adsAgg.totalPurchaseValue, 267.8);
    assert.equal(adsAgg.cpaEligible, null);

    // Caso de borda: compra atribuída sem purchase_value e gasto zero
    const noValueAgg = computeWeightedAggregates([
      { ...bonne21Row, conversions: 2, purchaseValue: 0 },
    ]);
    assert.equal(noValueAgg.conversionResults, 2);
    assert.equal(noValueAgg.totalPurchaseValue, 0);
    assert.equal(noValueAgg.roasPurchases, null);
    assert.equal(noValueAgg.cpaEligible, null);
  });
});
