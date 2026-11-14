import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  META_GRAPH_VERSION,
  META_INDICATOR_SPEC_VERSION,
  detectStrictConversionCategory,
  extractMetaInsightMetrics,
  formatCurrencyBRLStrict,
  formatMetricVectorSummary,
  mergeSocialCrosspostRecords,
  metaFetchJsonWithRetry,
  metaFetchPaginatedWithStatus,
  normalizeMetaBillingAccount,
  reconcileAccountSummary,
} from "../src/lib/metaIntegrationCore.ts";

import * as edgeMetaCore from "../supabase/functions/_shared/metaCore.ts";

import {
  buildReportSnapshot,
  classifyMetaEvent,
  computeWeightedAggregates,
  formatCivilDateBR,
  formatPeriodLabel,
  roundCurrency,
} from "../src/lib/metricsDomain.ts";

describe("Meta Integration — Contrato Meta v21.0, Paridade Rio2 & MOVE, Paginacao, Billing, Social & Edge Parity", () => {
  it("usa Graph API v21.0 e preserva Rio2 (act_243135681723027, 2026-11-12) sem soma inflada nem mistura de CTR", () => {
    assert.equal(META_GRAPH_VERSION, "v21.0");
    assert.equal(edgeMetaCore.META_GRAPH_VERSION, "v21.0");

    // Campanha 1 (Rio2): OUTCOME_TRAFFIC + VISIT_INSTAGRAM_PROFILE -> 179 visitas ao perfil
    // CTR link = 0.72% (inline_link_clicks=90 sobre 12500 imp) vs CTR all = 2.46% (clicks=308 sobre 12500 imp)
    const trafficInsight = extractMetaInsightMetrics(
      {
        spend: "94.50",
        impressions: "12500",
        reach: "11800",
        inline_link_clicks: "90",
        clicks: "308",
        inline_link_click_ctr: "0.72",
        ctr: "2.464",
        results: [{ indicator: "profile_visit", values: [{ value: "179" }] }],
        actions: [
          { action_type: "link_click", value: "90" },
          { action_type: "post_engagement", value: "308" },
        ],
      },
      {
        rawObjective: "OUTCOME_TRAFFIC",
        optimizationGoal: "VISIT_INSTAGRAM_PROFILE",
      }
    );

    assert.equal(trafficInsight.category, "INSTAGRAM_PROFILE");
    assert.equal(trafficInsight.resultCount, 179);
    assert.equal(trafficInsight.resultSource, "meta_results");
    assert.equal(trafficInsight.inlineLinkClicks, 90);
    assert.equal(trafficInsight.allClicks, 308);
    assert.ok(Math.abs((trafficInsight.ctrLink ?? 0) - 0.72) < 0.01);
    assert.ok(Math.abs((trafficInsight.ctrAll ?? 0) - 2.464) < 0.01);

    // Campanha 2 (Rio2): OUTCOME_ENGAGEMENT + WHATSAPP CONVERSATIONS -> 12 conversas (nunca somadas a 179 = 191, nunca multiplicadas por 4 anuncios = 48)
    const messagesInsight = extractMetaInsightMetrics(
      {
        spend: "120.00",
        impressions: "4200",
        reach: "3441",
        inline_link_clicks: "45",
        clicks: "89",
        actions: [
          { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "12" },
          { action_type: "post_reaction", value: "18" },
        ],
      },
      {
        rawObjective: "OUTCOME_ENGAGEMENT",
        optimizationGoal: "CONVERSATIONS",
        destinationType: "WHATSAPP",
      }
    );

    assert.equal(messagesInsight.category, "MESSAGES");
    assert.equal(messagesInsight.resultCount, 12);

    // 4 anuncios sob a campanha de mensagens cuja soma nativa tambem totaliza 12 (nunca 48)
    const adRows = [
      { adId: "ad_1", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "5" }], spend: "40.00", impressions: "1400", reach: "1200" },
      { adId: "ad_2", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" }], spend: "35.00", impressions: "1200", reach: "1000" },
      { adId: "ad_3", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "3" }], spend: "25.00", impressions: "900", reach: "800" },
      { adId: "ad_4", actions: [], spend: "20.00", impressions: "700", reach: "600" },
    ];
    const adSumResults = adRows
      .map((r) =>
        extractMetaInsightMetrics(r, {
          rawObjective: "OUTCOME_ENGAGEMENT",
          optimizationGoal: "CONVERSATIONS",
          destinationType: "WHATSAPP",
        }).resultCount ?? 0
      )
      .reduce((acc, n) => acc + n, 0);
    assert.equal(adSumResults, 12);

    // Alcance deduplicado da conta (14.883) != soma das campanhas (11.800 + 3.441 = 15.241)
    const accountSummary = reconcileAccountSummary({
      deduplicatedAccountReach: 14883,
      items: [
        {
          id: "rio2_traffic",
          externalId: "rio2_traffic",
          name: "Rio2 | Visitas ao Perfil",
          category: trafficInsight.category,
          spend: trafficInsight.spend,
          results: trafficInsight.resultCount,
          impressions: trafficInsight.impressions,
          reach: trafficInsight.reach,
          inlineLinkClicks: trafficInsight.inlineLinkClicks,
          allClicks: trafficInsight.allClicks,
        },
        {
          id: "rio2_msg",
          externalId: "rio2_msg",
          name: "Rio2 | WhatsApp",
          category: messagesInsight.category,
          spend: messagesInsight.spend,
          results: messagesInsight.resultCount,
          impressions: messagesInsight.impressions,
          reach: messagesInsight.reach,
          inlineLinkClicks: messagesInsight.inlineLinkClicks,
          allClicks: messagesInsight.allClicks,
        },
      ],
    });

    assert.equal(accountSummary.accountReach, 14883);
    assert.equal(accountSummary.campaignReachSum, 15241);
    assert.equal(accountSummary.reachIsDeduplicated, true);
    assert.equal(accountSummary.reachDisplayLabel, "Alcance da conta (deduplicado)");

    // Sem mixing silencioso: no domain model cada categoria fica no seu grupo, sem "191 resultados"
    const weighted = computeWeightedAggregates(
      [
        {
          id: "rio2_traffic",
          externalId: "rio2_traffic",
          name: "Rio2 | Visitas ao Perfil",
          rawObjective: "OUTCOME_TRAFFIC",
          optimizationGoal: "VISIT_INSTAGRAM_PROFILE",
          resultType: "INSTAGRAM_PROFILE",
          cost: 94.5,
          impressions: 12500,
          reach: 11800,
          clicks: 90,
          conversions: 179,
        },
        {
          id: "rio2_msg",
          externalId: "rio2_msg",
          name: "Rio2 | WhatsApp",
          rawObjective: "OUTCOME_ENGAGEMENT",
          optimizationGoal: "CONVERSATIONS",
          resultType: "MESSAGES",
          cost: 120.0,
          impressions: 4200,
          reach: 3441,
          clicks: 45,
          conversions: 12,
        },
      ],
      { deduplicatedAccountReach: 14883 }
    );
    assert.equal(weighted.conversionResults, 12); // apenas objetivos comerciais diretos (MESSAGES), nao soma 179 visitas
    assert.equal(weighted.accountDeduplicatedReach, 14883);
  });

  it("MOVE (act_521887042208137, 2026-11-12): preserva 22 mensagens, R$ 64,08, CPL exato R$ 2,91 e arredondamento unico (14,3/3 = 4,77)", () => {
    const moveSummary = reconcileAccountSummary({
      deduplicatedAccountReach: 3200,
      items: [
        {
          id: "move_msg_1",
          externalId: "move_msg_1",
          name: "MOVE | Mensagens",
          category: "MESSAGES",
          spend: 64.08,
          results: 22,
          impressions: 3500,
          reach: 3200,
          inlineLinkClicks: 50,
          allClicks: 75,
        },
      ],
    });

    assert.equal(roundCurrency(moveSummary.totalSpend), 64.08);
    assert.equal(moveSummary.totalResultsKnown, 22);
    assert.equal(moveSummary.unitCostFormatted, "2,91");

    // Arredondamento único no final: 14.3 / 3 = 4.766666... -> "4,77"
    assert.equal(formatCurrencyBRLStrict(14.3 / 3), "4,77");

    // Snapshot de relatorio MOVE para 12/11/2026 sem frase vaga ("Em torno") e com R$ 2,91
    const snapshot = buildReportSnapshot({
      clientName: "MOVE",
      accountName: "act_521887042208137",
      dateFrom: "2026-11-12",
      dateTo: "2026-11-12",
      deduplicatedAccountReach: 3200,
      campaigns: [
        {
          id: "move_msg_1",
          name: "MOVE | Mensagens",
          rawObjective: "OUTCOME_ENGAGEMENT",
          optimizationGoal: "CONVERSATIONS",
          resultType: "MESSAGES",
          cost: 64.08,
          impressions: 3500,
          reach: 3200,
          clicks: 50,
          conversions: 22,
        },
      ],
    });

    assert.equal(snapshot.whatsappText.includes("64,08"), true);
    assert.equal(snapshot.whatsappText.includes("22"), true);
    assert.equal(snapshot.whatsappText.includes("2,91"), true);
    assert.equal(snapshot.whatsappText.includes("Em torno"), false);
  });

  it("paginacao completa (>100 / >500 itens via paging.next), retry 429/503 e falha explicita sem truncate silencioso", async () => {
    const pages: string[] = [];
    const totalItems = 520; // > 500 itens distribuidos em 6 paginas (100+100+100+100+100+20)
    const mockFetchPaginated = (async (input: string) => {
      pages.push(input);
      const u = new URL(input);
      const cursor = Number(u.searchParams.get("after") || "0");
      const nextCursor = cursor + 100;
      const chunk = Array.from({ length: Math.min(100, totalItems - cursor) }, (_, i) => ({
        id: `obj_${cursor + i + 1}`,
      }));
      const nextUrl =
        nextCursor < totalItems
          ? `https://graph.facebook.com/v21.0/act_123/ads?after=${nextCursor}`
          : undefined;

      return new Response(
        JSON.stringify({
          data: chunk,
          paging: nextUrl ? { next: nextUrl } : {},
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as unknown as typeof fetch;

    const paginated = await metaFetchPaginatedWithStatus<{ id: string }>(
      "/act_123/ads",
      "tok_test",
      { limit: "100" },
      { fetchFn: mockFetchPaginated, sleepFn: async () => {} }
    );

    assert.equal(paginated.ok, true);
    assert.equal(paginated.truncated, false);
    assert.equal(paginated.pagesFetched, 6);
    assert.equal(paginated.data.length, 520);
    assert.equal(paginated.data[0].id, "obj_1");
    assert.equal(paginated.data[519].id, "obj_520");

    // Teste retry/backoff em 429 e 503 recuperando na 3a tentativa
    let callCount = 0;
    const sleepCalls: number[] = [];
    const mockRetryFetch = (async () => {
      callCount++;
      if (callCount === 1) {
        return new Response(
          JSON.stringify({ error: { message: "User request limit reached", code: 17 } }),
          { status: 429, headers: { "Content-Type": "application/json", "Retry-After": "1" } }
        );
      }
      if (callCount === 2) {
        return new Response(
          JSON.stringify({ error: { message: "Temporary service unavailable", code: 2 } }),
          { status: 503, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ data: [{ id: "ok_1" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json", "x-app-usage": '{"call_count":22,"total_cputime":5,"total_time":8}' },
      });
    }) as unknown as typeof fetch;

    const retried = await metaFetchJsonWithRetry("https://graph.facebook.com/v21.0/act_123/campaigns", {
      fetchFn: mockRetryFetch,
      sleepFn: async (ms) => {
        sleepCalls.push(ms);
      },
      baseDelayMs: 100,
      maxRetries: 3,
    });

    assert.equal(retried.ok, true);
    assert.equal(retried.attempts, 3);
    assert.equal(sleepCalls.length, 2);
    assert.equal(retried.rateLimitUsagePct, 22);

    // Erro de permissao (code 200 / HTTP 403) nao fica mudo nem retenta eternamente
    const deniedRes = await metaFetchPaginatedWithStatus(
      "/act_123/insights",
      "tok_test",
      {},
      {
        fetchFn: (async () =>
          new Response(
            JSON.stringify({ error: { message: "(#200) Missing ads_read permission", code: 200 } }),
            { status: 403, headers: { "Content-Type": "application/json" } }
          )) as unknown as typeof fetch,
        sleepFn: async () => {},
      }
    );
    assert.equal(deniedRes.ok, false);
    assert.equal(deniedRes.errorKind, "permission_denied");
    assert.equal(deniedRes.attempts, 1);
  });

  it("classificacao estrita: UNKNOWN sem inferencia pelo nome da campanha e retencao de gasto zero sem ROAS artificial", () => {
    // Nunca coerces OUTCOME_ENGAGEMENT ambiguo para MESSAGES mesmo que nome contenha "WHATSAPP" / "TRAFEGO NC"
    const ambiguous = detectStrictConversionCategory({
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: null,
      destinationType: null,
      results: null,
      actions: [],
      storedResultType: null,
    });
    assert.equal(ambiguous, "UNKNOWN");

    const classifiedDomain = classifyMetaEvent({
      campaignName: "TRAFEGO NC WHATSAPP MSG",
      rawObjective: "OUTCOME_ENGAGEMENT",
    });
    assert.equal(classifiedDomain.category, "UNKNOWN");
    assert.equal(classifiedDomain.requiresReview, true);

    // Campanhas e conjuntos com gasto R$ 0,00 sao retidos com roas: null (nunca conversions * 150)
    const zeroSpend = extractMetaInsightMetrics(
      {
        spend: "0",
        impressions: "0",
        reach: "0",
        inline_link_clicks: "0",
        clicks: "0",
        actions: [{ action_type: "lead", value: "2" }],
      },
      {
        rawObjective: "OUTCOME_LEADS",
        optimizationGoal: "LEAD_GENERATION",
      }
    );
    assert.equal(zeroSpend.spend, 0);
    assert.equal(zeroSpend.resultCount, 2);
    assert.equal(zeroSpend.roas, null);
    assert.equal(zeroSpend.unitCost, 0);

    // Zero resultados com gasto > 0 deve manter unitCost: null (nunca R$ 0,00) e roas: null
    const zeroResults = extractMetaInsightMetrics(
      {
        spend: "13.46",
        impressions: "247",
        reach: "220",
        inline_link_clicks: "3",
        clicks: "3",
        actions: [],
      },
      {
        rawObjective: "OUTCOME_ENGAGEMENT",
        optimizationGoal: "CONVERSATIONS",
        destinationType: "WHATSAPP",
      }
    );
    assert.equal(zeroResults.spend, 13.46);
    assert.equal(zeroResults.resultCount, 0);
    assert.equal(zeroResults.unitCost, null);
    assert.equal(zeroResults.roas, null);
  });

  it("billing Meta: distingue spend_cap='0' (sem teto) de ausente (indisponivel) e converte minor units corretamente", () => {
    const brlNoCap = normalizeMetaBillingAccount({
      id: "act_243135681723027",
      currency: "BRL",
      is_prepay_account: true,
      balance: "154320", // R$ 1.543,20
      amount_spent: "987650", // R$ 9.876,50
      spend_cap: "0",
      min_billing_threshold: "5000", // R$ 50,00
      account_status: 1,
      disable_reason: 0,
    });
    assert.equal(brlNoCap.balance, 1543.2);
    assert.equal(brlNoCap.amountSpent, 9876.5);
    assert.equal(brlNoCap.spendCapState, "no_cap");
    assert.equal(brlNoCap.spendCap, null);
    assert.equal(brlNoCap.minBillingThreshold, 50);

    const unavailableCap = normalizeMetaBillingAccount(
      {
        id: "act_999",
        currency: "BRL",
        account_status: 2,
        disable_reason: 3,
      },
      ["ads_management_read_billing_restricted"]
    );
    assert.equal(unavailableCap.spendCapState, "unavailable");
    assert.equal(unavailableCap.spendCap, null);
    assert.equal(unavailableCap.accountStatus, 2);
    assert.equal(unavailableCap.disableReason, 3);
    assert.deepEqual(unavailableCap.permissionGaps, ["ads_management_read_billing_restricted"]);

    // Moeda sem casas decimais (JPY) nao deve dividir por 100
    const jpyAccount = normalizeMetaBillingAccount({
      id: "act_jpy",
      currency: "JPY",
      balance: "5000",
      spend_cap: "120000",
    });
    assert.equal(jpyAccount.balance, 5000);
    assert.equal(jpyAccount.spendCapState, "configured");
    assert.equal(jpyAccount.spendCap, 120000);
  });

  it("social crosspost ('both'): preserva FB e IG separados com estado observado vs indisponivel sem alcance inventado", () => {
    const merged = mergeSocialCrosspostRecords({
      dbRows: [
        {
          id: "local_1",
          page_id: "pg_1",
          account_name: "Falcão Veículos",
          account_handle: "@_falcaoveiculos",
          title: "Feirão Especial",
          content: "Oferta real",
          post_type: "feed",
          status: "published",
          platform: "both",
          published_at: "2026-11-12T14:00:00Z",
          meta_post_id: "fb_111,ig_222",
        },
      ],
      metaLivePosts: [
        {
          id: "fb_111",
          platform: "facebook",
          metaPostId: "fb_111",
          pageId: "pg_1",
          accountName: "Falcão Veículos",
          accountHandle: "fb/pg_1",
          title: "Feirão Especial",
          content: "Oferta real",
          postType: "feed",
          status: "published",
          publishedAt: "2026-11-12T14:00:00Z",
          scheduledAt: null,
          likesCount: 9,
          commentsCount: 1,
          sharesCount: 2,
          savesCount: null,
          reachCount: null, // Page post insight indisponivel sem read_insights -> nunca inventar likes*12
          impressionsCount: null,
          reachState: "indisponivel",
          impressionsState: "indisponivel",
          permalink: "https://facebook.com/111",
          mediaUrl: null,
          thumbnailUrl: null,
          source: "meta_live",
        },
        {
          id: "ig_222",
          platform: "instagram",
          metaPostId: "ig_222",
          pageId: "pg_1",
          accountName: "Falcão Veículos",
          accountHandle: "@_falcaoveiculos",
          title: "Feirão Especial",
          content: "Oferta real",
          postType: "feed",
          status: "published",
          publishedAt: "2026-11-12T14:00:00Z",
          scheduledAt: null,
          likesCount: 40,
          commentsCount: 0,
          sharesCount: 25,
          savesCount: 1,
          reachCount: 1584,
          impressionsCount: 2179,
          reachState: "observado",
          impressionsState: "observado",
          permalink: "https://instagram.com/p/222",
          mediaUrl: null,
          thumbnailUrl: null,
          source: "meta_live",
        },
      ],
    });

    assert.equal(merged.length, 2);
    const fb = merged.find((p) => p.platform === "facebook");
    const ig = merged.find((p) => p.platform === "instagram");
    assert.ok(fb);
    assert.ok(ig);
    assert.equal(fb.id, "local_1_facebook");
    assert.equal(fb.reachCount, null);
    assert.equal(fb.reachState, "indisponivel");
    assert.equal(ig.id, "local_1_instagram");
    assert.equal(ig.reachCount, 1584);
    assert.equal(ig.reachState, "observado");
  });

  it("paridade estrita Frontend (src/lib/metaIntegrationCore.ts) vs Edge (_shared/metaCore.ts)", () => {
    const sampleInsight = {
      spend: "64.08",
      impressions: "3500",
      reach: "3100",
      inline_link_clicks: "50",
      clicks: "82",
      inline_link_click_ctr: "1.428",
      ctr: "2.342",
      actions: [
        { action_type: "onsite_conversion.messaging_conversation_started_7d", value: "22" },
        { action_type: "purchase", value: "1" },
      ],
      action_values: [{ action_type: "purchase", value: "320.40" }],
    };
    const context = {
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      destinationType: "WHATSAPP",
    };

    assert.deepEqual(
      detectStrictConversionCategory({ ...context, actions: sampleInsight.actions }),
      edgeMetaCore.detectStrictConversionCategory({ ...context, actions: sampleInsight.actions })
    );

    const feMetrics = extractMetaInsightMetrics(sampleInsight, context);
    const beMetrics = edgeMetaCore.extractMetaInsightMetrics(sampleInsight, context);
    assert.deepEqual(feMetrics, beMetrics);

    const feSummary = reconcileAccountSummary({
      deduplicatedAccountReach: 3100,
      items: [
        {
          id: "c1",
          name: "Camp 1",
          category: feMetrics.category,
          spend: feMetrics.spend,
          results: feMetrics.resultCount,
          impressions: feMetrics.impressions,
          reach: feMetrics.reach,
          inlineLinkClicks: feMetrics.inlineLinkClicks,
          allClicks: feMetrics.allClicks,
        },
      ],
    });
    const beSummary = edgeMetaCore.reconcileAccountSummary({
      deduplicatedAccountReach: 3100,
      items: [
        {
          id: "c1",
          name: "Camp 1",
          category: beMetrics.category,
          spend: beMetrics.spend,
          results: beMetrics.resultCount,
          impressions: beMetrics.impressions,
          reach: beMetrics.reach,
          inlineLinkClicks: beMetrics.inlineLinkClicks,
          allClicks: beMetrics.allClicks,
        },
      ],
    });
    assert.deepEqual(feSummary, beSummary);

    const rawBilling = { id: "act_1", currency: "BRL", balance: "10000", spend_cap: "0", account_status: 1, disable_reason: 0 };
    assert.deepEqual(
      normalizeMetaBillingAccount(rawBilling, ["none"]),
      edgeMetaCore.normalizeMetaBillingAccount(rawBilling, ["none"])
    );
  });

  it("datas civis e rotulos de periodo invariantes sob UTC e America/Sao_Paulo", () => {
    assert.equal(formatCivilDateBR("2026-11-12"), "12/11/2026");
    assert.equal(formatCivilDateBR("2026-11-01"), "01/11/2026");

    const singleDay = formatPeriodLabel("2026-11-12", "2026-11-12");
    assert.equal(singleDay.isSingleDay, true);
    assert.equal(singleDay.label, "12/11/2026");

    const range = formatPeriodLabel("2026-11-01", "2026-11-12");
    assert.equal(range.isSingleDay, false);
    assert.equal(range.isFullMonth, false);
    assert.equal(range.label, "01/11/2026 a 12/11/2026");

    const fullMonth = formatPeriodLabel("2026-11-01", "2026-11-30");
    assert.equal(fullMonth.isFullMonth, true);
    assert.equal(fullMonth.label, "NOVEMBRO 2026");
  });

  it("Contrato 2026.11.2: novos tokens Meta (page_visit_view, contact_website, like, profile_visit_view)", () => {
    assert.equal(META_INDICATOR_SPEC_VERSION, "2026.11.2");
    assert.equal(edgeMetaCore.META_INDICATOR_SPEC_VERSION, "2026.11.2");

    // 1. profile_visit_view exclusivamente em results[0].indicator (sem actions[])
    const rio2Profile = extractMetaInsightMetrics(
      {
        spend: "50.43",
        reach: "4018",
        impressions: "4175",
        clicks: "329",
        inline_link_clicks: "334",
        results: [{ indicator: "profile_visit_view", values: [{ value: "328" }] }],
        actions: [],
      },
      { rawObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "PROFILE_VISIT" }
    );
    assert.equal(rio2Profile.category, "INSTAGRAM_PROFILE");
    assert.equal(rio2Profile.resultCount, 328);
    assert.equal(rio2Profile.resultIndicator, "profile_visit_view");

    // 2. page_visit_view (visita a Pagina FB -> ENGAGEMENT) & landing_page_view (-> LANDING_PAGE_VIEWS)
    const fbPageVisit = extractMetaInsightMetrics(
      {
        spend: "30.00",
        reach: "1000",
        impressions: "1200",
        clicks: "80",
        inline_link_clicks: "60",
        results: [{ indicator: "page_visit_view", values: [{ value: "42" }] }],
      },
      { rawObjective: "OUTCOME_ENGAGEMENT" }
    );
    assert.equal(fbPageVisit.category, "ENGAGEMENT");
    assert.equal(fbPageVisit.resultCount, 42);
    assert.equal(
      classifyMetaEvent({ campaignName: "X", rawObjective: "OUTCOME_ENGAGEMENT", resultsIndicator: "page_visit_view" }).shortBadge,
      "VISITAS PÁGINA"
    );

    const lpv = extractMetaInsightMetrics(
      {
        spend: "30.00",
        reach: "1000",
        impressions: "1200",
        clicks: "80",
        inline_link_clicks: "60",
        results: [{ indicator: "landing_page_view", values: [{ value: "27" }] }],
      },
      { rawObjective: "OUTCOME_TRAFFIC" }
    );
    assert.equal(lpv.category, "LANDING_PAGE_VIEWS");
    assert.equal(lpv.resultCount, 27);

    // 3. conversions:contact_website
    const contactSite = extractMetaInsightMetrics(
      {
        spend: "80.00",
        reach: "2000",
        impressions: "2500",
        clicks: "100",
        inline_link_clicks: "75",
        results: [{ indicator: "conversions:contact_website", values: [{ value: "9" }] }],
      },
      { rawObjective: "OUTCOME_LEADS" }
    );
    assert.equal(contactSite.category, "LEADS");
    assert.equal(contactSite.resultCount, 9);

    // 4. actions:like (Facebook Page Likes -> ENGAGEMENT)
    const likes = extractMetaInsightMetrics(
      {
        spend: "25.00",
        reach: "1500",
        impressions: "1800",
        clicks: "90",
        inline_link_clicks: "12",
        results: [{ indicator: "actions:like", values: [{ value: "31" }] }],
      },
      { rawObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "PAGE_LIKES" }
    );
    assert.equal(likes.category, "ENGAGEMENT");
    assert.equal(likes.resultCount, 31);
  });

  it("MOVE (2026-11-13) e Fly Garage (2026-11-13): zero mixing, snapshotId consistente e alcance com custo por 1k", () => {
    // Fixture 1: MOVE 2026-11-13 (18 conversas, R$ 43,49, 29 link clicks, 1.557 impr, 1.211 account reach)
    const moveSnapshot = buildReportSnapshot({
      clientName: "MOVE",
      accountName: "act_521887042208137",
      dateFrom: "2026-11-13",
      dateTo: "2026-11-13",
      deduplicatedAccountReach: 1211,
      campaigns: [
        { id: "m1", name: "NC | MSG — 1", cost: 7.76, conversions: 6, clicks: 6, allClicks: 14, impressions: 258, reach: 226, resultType: "MESSAGES" },
        { id: "m2", name: "NC | MSG — Em torno", cost: 6.66, conversions: 1, clicks: 4, allClicks: 9, impressions: 277, reach: 223, resultType: "MESSAGES" },
        { id: "m3", name: "11/11 CBO INS|FB HONDA POP 19 A 45", cost: 8.78, conversions: 4, clicks: 9, allClicks: 16, impressions: 420, reach: 331, resultType: "MESSAGES" },
        { id: "m4", name: "11/11 HONDA FACTOR", cost: 8.0, conversions: 5, clicks: 8, allClicks: 15, impressions: 281, reach: 238, resultType: "MESSAGES" },
        { id: "m5", name: "NC | MSG — 2", cost: 12.29, conversions: 2, clicks: 2, allClicks: 7, impressions: 321, reach: 261, resultType: "MESSAGES" },
      ],
    });
    assert.equal(roundCurrency(moveSnapshot.summary.totalMediaSpend), 43.49);
    assert.equal(moveSnapshot.summary.metricVector.conversations, 18);
    assert.equal(moveSnapshot.summary.hasMixedObjectives, false);
    assert.equal(moveSnapshot.summary.inlineLinkClicks, 29);
    assert.equal(moveSnapshot.summary.allClicks, 61);
    assert.equal(moveSnapshot.summary.totalImpressions, 1557);
    assert.equal(moveSnapshot.summary.accountDeduplicatedReach, 1211);
    assert.ok(moveSnapshot.snapshotId.length > 0);

    // Fixture 2: Fly Garage 2026-11-13 (19 mensagens + 50.013 alcance -> hasMixedObjectives = true, CPA = R$ 7,92)
    const flyWeighted = computeWeightedAggregates([
      {
        id: "fg1",
        name: "NC - MSG - 29/06 — Cópia",
        cost: 150.57,
        conversions: 19,
        clicks: 137,
        allClicks: 167,
        impressions: 9433,
        reach: 7196,
        rawObjective: "OUTCOME_ENGAGEMENT",
        resultType: "MESSAGES",
      },
      {
        id: "fg2",
        name: "CMP | NC  - ALCANCE JOJO TODYNHO",
        cost: 63.56,
        conversions: 50013,
        clicks: 21,
        allClicks: 52,
        impressions: 52358,
        reach: 50013,
        rawObjective: "OUTCOME_AWARENESS",
        resultType: "REACH",
      },
    ]);
    assert.equal(flyWeighted.hasMixedObjectives, true);
    assert.equal(flyWeighted.metricVector.conversations, 19);
    assert.equal(flyWeighted.metricVector.reach, 50013);
    assert.equal(roundCurrency(flyWeighted.totalMediaSpend), 214.13);
    assert.equal(flyWeighted.inlineLinkClicks, 158);
    assert.equal(flyWeighted.allClicks, 219);
    assert.ok(flyWeighted.cpaEligible !== null && Math.abs(flyWeighted.cpaEligible - 150.57 / 19) < 0.01);
    const vecLabels = formatMetricVectorSummary(flyWeighted.metricVector).map(e => `${e.value}:${e.label}`).join("|");
    assert.ok(vecLabels.includes("19:Conversas"));
    assert.ok(vecLabels.includes("50013:Alcance"));
  });

  it("Contrato 2026.11.2: results[].values prioriza attribution_windows ['default'] sobre ['7d_click'] (Fly Garage 19 / Rio2 28)", () => {
    const flyMultiWindow = extractMetaInsightMetrics(
      {
        spend: "150.58",
        impressions: "9436",
        reach: "7196",
        clicks: "167",
        inline_link_clicks: "137",
        results: [
          {
            indicator: "actions:onsite_conversion.messaging_conversation_started_7d",
            values: [
              { value: "17", attribution_windows: ["7d_click"] },
              { value: "2", attribution_windows: ["1d_view"] },
              { value: "16", attribution_windows: ["1d_click"] },
              { value: "19", attribution_windows: ["default"] },
            ],
          },
        ],
      },
      { rawObjective: "MESSAGES", optimizationGoal: "REPLIES" }
    );
    assert.equal(flyMultiWindow.category, "MESSAGES");
    assert.equal(flyMultiWindow.resultCount, 19);
    assert.equal(
      edgeMetaCore.extractMetaInsightMetrics(
        {
          spend: "183.97",
          impressions: "13494",
          reach: "11311",
          results: [
            {
              indicator: "actions:onsite_conversion.messaging_conversation_started_7d",
              values: [
                { value: "27", attribution_windows: ["7d_click"] },
                { value: "1", attribution_windows: ["1d_view"] },
                { value: "28", attribution_windows: ["default"] },
              ],
            },
          ],
        },
        { rawObjective: "OUTCOME_ENGAGEMENT", optimizationGoal: "REPLIES" }
      ).resultCount,
      28
    );
  });
});
