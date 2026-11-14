import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  META_GRAPH_VERSION,
  detectStrictConversionCategory,
  extractMetaInsightMetrics,
  formatCurrencyBRLStrict,
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
});
