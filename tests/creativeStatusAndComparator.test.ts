import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCreativeAdRecord,
  buildCreativeManagerOverview,
  enrichCreativePeerSignals,
  evaluateCreativeDiversity,
  evaluateCreativeFatigue,
  filterCreativeAdsByStatus,
  resolveAdEffectiveMetaStatus,
  summarizeAdStatusCounts,
  type CreativeAdRecord,
} from "../src/lib/creativeIntelligenceDomain.ts";
import {
  buildComparisonAnalysis,
  detectVideoMimeFromMagicBytes,
  resolveComparisonWorkflowStatus,
  validateComparatorScope,
  type CandidateCreativeInput,
} from "../src/lib/creativeComparatorDomain.ts";

function makeRawAd(overrides: Partial<any> = {}) {
  return {
    id: overrides.id ?? "ad-1",
    external_id: overrides.external_id ?? "12020001",
    name: overrides.name ?? "AD 01 — Civic EXL 2021",
    ad_account_id: overrides.ad_account_id ?? "act_100",
    campaign_id: overrides.campaign_id ?? "camp-1",
    ad_set_id: overrides.ad_set_id ?? "adset-1",
    status: overrides.status ?? "active",
    delivery_status: overrides.delivery_status ?? "ACTIVE",
    configured_status: overrides.configured_status ?? "ACTIVE",
    creative_id: "cr-1",
    creative_name: "Criativo Civic",
    creative_title: overrides.creative_title ?? "Civic EXL 2021 Revisado",
    creative_body:
      overrides.creative_body ??
      "Honda Civic EXL 2021 com laudo cautelar aprovado. Fale no WhatsApp!",
    creative_format: overrides.creative_format ?? "image",
    call_to_action_type: overrides.call_to_action_type ?? "WHATSAPP_MESSAGE",
    thumbnail_url: "https://cdn.example.com/civic.jpg",
    campaigns: {
      id: overrides.campaign_id ?? "camp-1",
      name: overrides.campaign_name ?? "Campanha Mensagens Civic",
      external_id: "2385001",
      ad_account_id: overrides.ad_account_id ?? "act_100",
      objective: overrides.objective ?? "MESSAGES",
      status: overrides.campaign_status ?? "ACTIVE",
      delivery_status: overrides.campaign_delivery_status ?? "ACTIVE",
      configured_status: overrides.campaign_configured_status ?? "ACTIVE",
      stop_time: overrides.campaign_stop_time ?? null,
    },
    ad_sets: {
      id: overrides.ad_set_id ?? "adset-1",
      name: overrides.ad_set_name ?? "Conjunto RJ Interessados",
      status: overrides.ad_set_status ?? "ACTIVE",
      delivery_status: overrides.ad_set_delivery_status ?? "ACTIVE",
      configured_status: overrides.ad_set_configured_status ?? "ACTIVE",
      end_time: overrides.ad_set_end_time ?? null,
    },
    ...overrides,
  };
}

function makeStat(overrides: Partial<any> = {}) {
  return {
    entity_id: overrides.entity_id ?? "ad-1",
    spend: overrides.spend ?? 250,
    impressions: overrides.impressions ?? 12000,
    reach: overrides.reach ?? 8000,
    clicks: overrides.clicks ?? 320,
    link_clicks: overrides.link_clicks ?? 210,
    conversions: overrides.conversions ?? 25,
    purchase_value: overrides.purchase_value ?? 0,
    action_type: overrides.action_type ?? "onsite_conversion.messaging_conversation_started_7d",
    ...overrides,
  };
}

test("Effective Meta status resolves hierarchy across campaign, ad_set and ad", () => {
  // Ad active, campaign paused -> PAUSED
  const campPaused = resolveAdEffectiveMetaStatus({
    adStatus: "active",
    adDeliveryStatus: "ACTIVE",
    campaignStatus: "PAUSED",
    adSetStatus: "ACTIVE",
  });
  assert.equal(campPaused.code, "PAUSED");

  // Ad active, ad_set paused -> PAUSED
  const setPaused = resolveAdEffectiveMetaStatus({
    adStatus: "active",
    adSetStatus: "PAUSED",
    campaignStatus: "ACTIVE",
  });
  assert.equal(setPaused.code, "PAUSED");

  // Past end_time -> COMPLETED
  const completed = resolveAdEffectiveMetaStatus({
    adStatus: "active",
    adSetStatus: "ACTIVE",
    campaignStatus: "ACTIVE",
    adSetEndTime: "2020-01-01T00:00:00Z",
    now: new Date("2026-11-15T12:00:00Z"),
  });
  assert.equal(completed.code, "COMPLETED");

  // Archived -> ARCHIVED
  const archived = resolveAdEffectiveMetaStatus({
    adStatus: "ARCHIVED",
    campaignStatus: "ACTIVE",
    adSetStatus: "ACTIVE",
  });
  assert.equal(archived.code, "ARCHIVED");
});

test("Default ACTIVE filter isolates paused/completed/archived ads and counters are mutually exclusive", () => {
  const activeWithDelivery = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-active-1" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({ entity_id: "ad-active-1", spend: 300, impressions: 15000, conversions: 30 }),
    dailyRows: [],
  });

  const activeZeroDelivery = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-active-zero", name: "AD 02 — Ativo sem entrega" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({ entity_id: "ad-active-zero", spend: 0, impressions: 0, reach: 0, clicks: 0, link_clicks: 0, conversions: 0 }),
    dailyRows: [],
  });

  const pausedByCampaign = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-paused-1", name: "AD 03 — Campanha Pausada", campaign_status: "PAUSED" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({ entity_id: "ad-paused-1", spend: 500, impressions: 40000, conversions: 5 }),
    dailyRows: [],
  });

  const completedAd = buildCreativeAdRecord({
    ad: makeRawAd({
      id: "ad-completed-1",
      name: "AD 04 — Concluído",
      ad_set_end_time: "2020-05-01T00:00:00Z",
    }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: null,
    dailyRows: [],
  });

  const archivedAd = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-archived-1", name: "AD 05 — Arquivado", status: "ARCHIVED" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: null,
    dailyRows: [],
  });

  const all = enrichCreativePeerSignals([
    activeWithDelivery,
    activeZeroDelivery,
    pausedByCampaign,
    completedAd,
    archivedAd,
  ]);

  const counts = summarizeAdStatusCounts(all);
  assert.equal(counts.all, 5);
  assert.equal(counts.ACTIVE, 2);
  assert.equal(counts.PAUSED, 1);
  assert.equal(counts.COMPLETED, 1);
  assert.equal(counts.ARCHIVED, 1);
  assert.equal(
    counts.ACTIVE + counts.PAUSED + counts.COMPLETED + counts.ARCHIVED,
    counts.all
  );
  assert.equal(counts.activeWithDelivery, 1);
  assert.equal(counts.activeWithoutDelivery, 1);

  // Default filter is ACTIVE -> paused/completed/archived never leak into overview
  const activeOnly = filterCreativeAdsByStatus(all);
  assert.equal(activeOnly.length, 2);
  assert.ok(activeOnly.every((r) => r.effectiveStatus === "ACTIVE"));

  // Active ad with zero delivery stays in ACTIVE and never triggers fatigue
  assert.equal(activeZeroDelivery.periodDeliveryState, "no_delivery");
  const zeroFatigue = evaluateCreativeFatigue(activeZeroDelivery, {
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
  });
  assert.equal(zeroFatigue.status, "insufficient_evidence");

  // Overview computed on filtered activeOnly must sum spend ONLY from active ads (300, NOT 300+500)
  const fatigues = activeOnly.map((r) =>
    evaluateCreativeFatigue(r, { dateFrom: "2026-11-01", dateTo: "2026-11-15" })
  );
  const diversity = evaluateCreativeDiversity(activeOnly);
  const overview = buildCreativeManagerOverview(activeOnly, fatigues, diversity);
  assert.equal(overview.totalAds, 2);
  assert.equal(
    activeOnly.reduce((sum, r) => sum + r.spend, 0),
    300
  );

  // Switching to PAUSED, COMPLETED, ARCHIVED, ALL returns exact subsets
  assert.equal(filterCreativeAdsByStatus(all, "PAUSED").length, 1);
  assert.equal(filterCreativeAdsByStatus(all, "COMPLETED").length, 1);
  assert.equal(filterCreativeAdsByStatus(all, "ARCHIVED").length, 1);
  assert.equal(filterCreativeAdsByStatus(all, "ALL").length, 5);
});

test("Missing metrics / permission missing remain unavailable instead of fake zero", () => {
  const unavailable = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-perm" }),
    accountName: "Conta Sem Permissão",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: null,
    dailyRows: [],
    hasPermissionError: true,
  });
  assert.equal(unavailable.availability, "unavailable");
  assert.equal(unavailable.periodDeliveryState, "unavailable");
  const enriched = enrichCreativePeerSignals([unavailable]);
  assert.equal(enriched[0].performanceSignal, "insufficient_data");
});

test("Comparator scope guard blocks multi-account, cross-account, cross-tenant and permission-missing states", () => {
  const refAd = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-ref", ad_account_id: "act_100" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({ entity_id: "ad-ref" }),
    dailyRows: [],
  });

  // "all" blocked
  assert.equal(
    validateComparatorScope({
      selectedAccountId: "all",
      referenceAd: refAd,
      candidateAccountId: "act_100",
    }).valid,
    false
  );

  // Permission missing blocked
  assert.equal(
    validateComparatorScope({
      selectedAccountId: "act_100",
      referenceAd: refAd,
      candidateAccountId: "act_100",
      accountPermissionMissing: true,
    }).valid,
    false
  );

  // Cross-account reference ad blocked
  assert.equal(
    validateComparatorScope({
      selectedAccountId: "act_200",
      referenceAd: refAd,
      candidateAccountId: "act_200",
    }).valid,
    false
  );

  // Cross-account candidate blocked
  assert.equal(
    validateComparatorScope({
      selectedAccountId: "act_100",
      referenceAd: refAd,
      candidateAccountId: "act_999",
    }).valid,
    false
  );

  // Same account valid
  assert.equal(
    validateComparatorScope({
      selectedAccountId: "act_100",
      referenceAd: refAd,
      candidateAccountId: "act_100",
    }).valid,
    true
  );
});

test("Comparator two-layer analysis separates facts from hypothesis, avoids cross-objective mixing, and detects missing commercial facts", () => {
  const refAd = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-ref", ad_account_id: "act_100", objective: "MESSAGES" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({
      entity_id: "ad-ref",
      spend: 400,
      impressions: 20000,
      conversions: 40,
      action_type: "onsite_conversion.messaging_conversation_started_7d",
    }),
    dailyRows: [],
  });

  // Peer from DIFFERENT objective (OUTCOME_SALES) in same account -> must be excluded from benchmark
  const purchasePeer = buildCreativeAdRecord({
    ad: makeRawAd({
      id: "ad-sales",
      ad_account_id: "act_100",
      objective: "OUTCOME_SALES",
    }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({
      entity_id: "ad-sales",
      spend: 500,
      impressions: 10000,
      conversions: 10,
      purchase_value: 25000,
      action_type: "purchase",
    }),
    dailyRows: [],
  });

  const candidate: CandidateCreativeInput = {
    adAccountId: "act_100",
    title: "Civic 2021 — Novo Gancho + Preço",
    mediaKind: "image",
    mediaUrl: "https://cdn.example.com/candidate.jpg",
    mediaFileName: "civic-novo.jpg",
    primaryText: "Entrada facilitada no Civic EXL 2021 revisado. Fale agora!",
    headline: "Civic EXL 2021 com Laudo",
    description: "",
    cta: "LEARN_MORE",
    confirmedOffer: "",
    confirmedPrice: "", // intentionally missing to trigger commercial fact warning
    confirmedVehicleSpecs: "",
    destinationUrl: "https://wa.me/5521999999999",
    intendedFormat: "9:16",
    intendedPlacements: ["Stories", "Reels"],
    userHypothesis: "Novo gancho nos 3s iniciais reduz custo por conversa",
  };

  const analysis = buildComparisonAnalysis({
    refAd,
    candidate,
    sameAccountRecords: [refAd, purchasePeer],
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
  });

  // Missing commercial facts detected without inventing price/km/year
  assert.ok(analysis.missingCommercialFacts.length >= 2);
  assert.doesNotMatch(analysis.creativeHypothesis, /R\$\s*\d+/);

  // Benchmark must NOT include purchasePeer (insufficient sample -> no point prediction)
  assert.equal(analysis.benchmark.hasSufficientSample, false);
  assert.match(
    analysis.benchmark.insufficientReason || "",
    /Amostra interna insuficiente: apenas 1 anúncio/i
  );
  assert.ok(
    analysis.systemInterpretation.some((line) =>
      /Ainda não há dados para prever resultado; esta é uma hipótese criativa a validar/i.test(
        line
      )
    )
  );

  // Multi-variable warning (>= 3 changes: hook/copy, cta, format/placements)
  assert.equal(analysis.testPlan.isMultiVariableChange, true);
  assert.ok(analysis.testPlan.multiVariableWarning);
  assert.ok(analysis.testPlan.controlledTestSuggestion);

  // Epistemic separation present
  assert.ok(analysis.observedMetaFacts.length > 0);
  assert.ok(analysis.systemInterpretation.length > 0);
  assert.ok(analysis.creativeHypothesis.length > 0);
  assert.match(analysis.postDeliveryValidationNote, /publica[cç][aã]o manual|coleta de entrega/i);
});

test("Comparator workflow status blocks 'running'/'result_recorded' without a verified same-account/same-objective Meta ad and validates video magic bytes", () => {
  const refAd = buildCreativeAdRecord({
    ad: makeRawAd({ id: "ad-ref", ad_account_id: "act_100", objective: "MESSAGES" }),
    accountName: "Loja Alfa",
    dateFrom: "2026-11-01",
    dateTo: "2026-11-15",
    periodStat: makeStat({ entity_id: "ad-ref" }),
    dailyRows: [],
  });

  // Attempting to mark running without linked ad -> downgraded to ready_for_test
  const unlinked = resolveComparisonWorkflowStatus({
    requestedStatus: "running",
    publishedAdId: null,
    syncedRecords: [refAd],
    adAccountId: "act_100",
    resultCategory: refAd.resultCategory,
  });
  assert.equal(unlinked.status, "ready_for_test");

  // Linked to valid synced same-account same-objective ad with delivery -> result_recorded
  const linked = resolveComparisonWorkflowStatus({
    requestedStatus: "running",
    publishedAdId: "ad-ref",
    syncedRecords: [refAd],
    adAccountId: "act_100",
    resultCategory: refAd.resultCategory,
  });
  assert.equal(linked.status, "result_recorded");
  assert.equal(linked.linkedAd?.id, "ad-ref");

  // Video magic bytes: MP4 ftyp header & WEBM EBML header
  const mp4Bytes = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32]);
  assert.equal(detectVideoMimeFromMagicBytes(mp4Bytes), "video/mp4");
  const webmBytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]);
  assert.equal(detectVideoMimeFromMagicBytes(webmBytes), "video/webm");
  const bogusBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // PDF
  assert.equal(detectVideoMimeFromMagicBytes(bogusBytes), null);
});
