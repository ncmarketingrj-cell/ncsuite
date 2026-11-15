import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSocialCacheKey,
  configureSocialCacheTtls,
  ensureSocialPerfInitialized,
  evaluateSocialSnapshotFreshness,
  getSocialCacheTtlMs,
  getSocialPerfMetrics,
  readSocialMediaInsightsCache,
  recordSocialCacheHitEvent,
  recordSocialPerfEvent,
  recordSocialRouteTransition,
  resetSocialCacheForTests,
  resolveSocialDataWithSWR,
  runSharedSocialSync,
  SOCIAL_DATA_CLASS_MATRIX,
  writeSocialMediaInsightsCache,
} from "../src/lib/socialCacheDomain.ts";
import {
  canonicalizeSocialPageId,
  getLastKnownTenantId,
  getSocialHubFilterSnapshot,
  normalizeSelectedPageId,
  resetSocialHubFiltersForTests,
  setSocialSelectedNetwork,
  setSocialSelectedPage,
} from "../src/lib/socialHubStore.ts";
import {
  metaFetchPaginatedWithStatus,
  mergeSocialCrosspostRecords,
} from "../src/lib/metaIntegrationCore.ts";

test("1-4. Warm cache across Social Hub screens avoids repeated Meta calls and reuses snapshots on revisit & hub switch", async () => {
  resetSocialCacheForTests();
  let metaCalls = 0;

  const t0 = 1_700_000_000_000;
  const accountsKey = {
    tenantId: "tenant-a",
    accountScope: "all",
    network: "all" as const,
    period: "accounts",
    dataClass: "accounts" as const,
  };
  const insightsKey = {
    tenantId: "tenant-a",
    accountScope: "all",
    network: "all" as const,
    period: "2026-11-01_2026-11-15_d14",
    dataClass: "insights" as const,
  };
  const plannerKey = {
    tenantId: "tenant-a",
    accountScope: "all",
    network: "all" as const,
    period: "planner",
    dataClass: "planner" as const,
  };

  // 1. Primeira abertura de /social (contas + planejador) e /social-insights (insights)
  const acc1 = await resolveSocialDataWithSWR({
    keyParams: accountsKey,
    nowMs: t0,
    fetcher: async () => {
      metaCalls += 1;
      recordSocialPerfEvent("meta_call");
      return { data: { accounts: [{ page_id: "p1", name: "Loja A" }] }, isValidForCache: true };
    },
  });
  assert.equal(acc1.source, "meta_live");
  assert.equal(metaCalls, 1);

  const ins1 = await resolveSocialDataWithSWR({
    keyParams: insightsKey,
    nowMs: t0,
    fetcher: async () => {
      metaCalls += 1;
      recordSocialPerfEvent("meta_call");
      return { data: { reachIg: 42000, followersIg: 12000 }, isValidForCache: true };
    },
  });
  assert.equal(ins1.source, "meta_live");
  assert.equal(metaCalls, 2);

  const plan1 = await resolveSocialDataWithSWR({
    keyParams: plannerKey,
    nowMs: t0,
    fetcher: async () => {
      metaCalls += 1;
      recordSocialPerfEvent("meta_call");
      return { data: { posts: [{ id: "post-1" }] }, isValidForCache: true };
    },
  });
  assert.equal(plan1.source, "meta_live");
  assert.equal(metaCalls, 3);

  // 2. Navegação entre telas (/social -> /social-insights -> /social-audit) dentro do TTL (2 min depois)
  const t2min = t0 + 2 * 60 * 1000;
  const accReuse = await resolveSocialDataWithSWR({
    keyParams: accountsKey,
    nowMs: t2min,
    fetcher: async () => {
      metaCalls += 1;
      return { data: { accounts: [] }, isValidForCache: true };
    },
  });
  const insReuse = await resolveSocialDataWithSWR({
    keyParams: insightsKey,
    nowMs: t2min,
    fetcher: async () => {
      metaCalls += 1;
      return { data: { reachIg: 0, followersIg: 0 }, isValidForCache: true };
    },
  });
  // 3-4. Sair para outro módulo e voltar antes do vencimento -> 0 novas chamadas Meta
  const planRevisit = await resolveSocialDataWithSWR({
    keyParams: plannerKey,
    nowMs: t2min + 60_000,
    fetcher: async () => {
      metaCalls += 1;
      return { data: { posts: [] }, isValidForCache: true };
    },
  });

  assert.equal(accReuse.source, "cache_fresh");
  assert.equal(insReuse.source, "cache_fresh");
  assert.equal(insReuse.data.reachIg, 42000);
  assert.equal(planRevisit.source, "cache_fresh");
  assert.equal(metaCalls, 3);
  assert.equal(getSocialPerfMetrics().cacheHits, 3);
});

test("5. Expired snapshot renders immediately via SWR and revalidates in background without blocking UI", async () => {
  resetSocialCacheForTests();
  configureSocialCacheTtls({ insights: 1000 }); // 1s para teste determinístico
  assert.equal(getSocialCacheTtlMs("insights"), 1000);

  const keyParams = {
    tenantId: "tenant-a",
    accountScope: "p1",
    network: "instagram" as const,
    period: "2026-11-01_2026-11-15_d14",
    dataClass: "insights" as const,
  };

  const t0 = Date.now() - 5000; // snapshot de 5s atrás (já vencido)
  await resolveSocialDataWithSWR({
    keyParams,
    nowMs: t0,
    fetcher: async () => ({
      data: { reachIg: 10000, viewsIg: 15000 },
      isValidForCache: true,
      snapshotAt: new Date(t0).toISOString(),
    }),
  });

  let bgUpdated: any = null;
  let bgResolver!: () => void;
  const bgPromise = new Promise<void>((resolve) => {
    bgResolver = resolve;
  });

  const swrResult = await resolveSocialDataWithSWR({
    keyParams,
    nowMs: Date.now(),
    fetcher: async () => {
      await new Promise((r) => setTimeout(r, 15));
      return {
        data: { reachIg: 12500, viewsIg: 18000 },
        isValidForCache: true,
      };
    },
    onBackgroundRevalidated: (fresh) => {
      bgUpdated = fresh;
      bgResolver();
    },
  });

  // Renderizou imediatamente o último snapshot válido antes da Meta responder
  assert.equal(swrResult.source, "cache_stale_swr");
  assert.equal(swrResult.isStale, true);
  assert.equal(swrResult.revalidatingInBackground, true);
  assert.equal(swrResult.data.reachIg, 10000);

  await bgPromise;
  assert.equal(bgUpdated.source, "meta_live");
  assert.equal(bgUpdated.data.reachIg, 12500);
});

test("6-7. Scope isolation (tenant/account/network/period) and single-flight deduplication + manual sync", async () => {
  resetSocialCacheForTests();
  const keyA = buildSocialCacheKey({
    tenantId: "t1",
    accountScope: "page-1",
    network: "instagram",
    period: "2026-11-01_2026-11-15",
    dataClass: "insights",
  });
  const keyB = buildSocialCacheKey({
    tenantId: "t1",
    accountScope: "page-2",
    network: "instagram",
    period: "2026-11-01_2026-11-15",
    dataClass: "insights",
  });
  const keyTenant2 = buildSocialCacheKey({
    tenantId: "t2",
    accountScope: "page-1",
    network: "instagram",
    period: "2026-11-01_2026-11-15",
    dataClass: "insights",
  });
  assert.notEqual(keyA, keyB);
  assert.notEqual(keyA, keyTenant2);

  // Single-flight: 5 chamadas concorrentes para a mesma chave executam apenas 1 fetch
  let concurrentExecutions = 0;
  const sharedFetch = () =>
    runSharedSocialSync(keyA, async () => {
      concurrentExecutions += 1;
      await new Promise((r) => setTimeout(r, 20));
      return { ok: true, count: concurrentExecutions };
    });

  const results = await Promise.all([
    sharedFetch(),
    sharedFetch(),
    sharedFetch(),
    sharedFetch(),
    sharedFetch(),
  ]);
  assert.equal(concurrentExecutions, 1);
  assert.ok(results.every((r) => r.count === 1));
  assert.equal(getSocialPerfMetrics().dedupedInFlightHits, 4);

  // Manual forceRefresh executa apenas 1 sincronização explícita para o escopo
  let manualCalls = 0;
  const scopeParams = {
    tenantId: "t1",
    accountScope: "page-1",
    network: "instagram" as const,
    period: "2026-11-01_2026-11-15",
    dataClass: "insights" as const,
  };
  await resolveSocialDataWithSWR({
    keyParams: scopeParams,
    fetcher: async () => ({ data: { reachIg: 500 }, isValidForCache: true }),
  });
  const forced = await resolveSocialDataWithSWR({
    keyParams: scopeParams,
    forceRefresh: true,
    fetcher: async () => {
      manualCalls += 1;
      return { data: { reachIg: 900 }, isValidForCache: true };
    },
  });
  assert.equal(manualCalls, 1);
  assert.equal(forced.source, "meta_live");
  assert.equal(forced.data.reachIg, 900);
});

test("8-9. Rate limit, timeout, permission denied and partial errors preserve last valid snapshot without turning unavailable into 0", async () => {
  resetSocialCacheForTests();
  const keyParams = {
    tenantId: "t1",
    accountScope: "page-1",
    network: "all" as const,
    period: "2026-11-01_2026-11-15",
    dataClass: "insights" as const,
  };

  // Snapshot inicial válido (reachIg = 8400, viewsIg = null indisponível)
  const t0 = Date.now() - 20 * 60 * 1000;
  await resolveSocialDataWithSWR({
    keyParams,
    nowMs: t0,
    fetcher: async () => ({
      data: {
        reachIg: 8400,
        viewsIg: null as number | null,
        errorMessage: null as string | null,
      },
      isValidForCache: true,
      snapshotAt: new Date(t0).toISOString(),
    }),
  });

  // Simula rate limit / timeout / permissão negada no forceRefresh
  for (const errMsg of [
    "Meta API Rate Limit (#4 / #17)",
    "Timeout ao consultar Meta Graph API",
    "Permissão negada (#200)",
  ]) {
    const fallback = await resolveSocialDataWithSWR({
      keyParams,
      forceRefresh: true,
      fetcher: async () => {
        throw new Error(errMsg);
      },
      onErrorPreserve: (prev, msg) => ({
        ...prev,
        errorMessage: msg,
      }),
    });

    assert.equal(fallback.source, "fallback_last_valid");
    assert.equal(fallback.isStale, true);
    assert.equal(fallback.data.reachIg, 8400);
    // Métrica indisponível permanece null — nunca substituída por 0
    assert.equal(fallback.data.viewsIg, null);
    assert.equal(fallback.data.errorMessage, errMsg);
  }

  const evalFresh = evaluateSocialSnapshotFreshness(
    buildSocialCacheKey(keyParams),
    "insights"
  );
  assert.ok(evalFresh.envelope);
});

test("10. Warmed-cache navigation latency benchmark records accurate p50/p95 and 0 Meta calls", async () => {
  resetSocialCacheForTests();
  const keyParams = {
    tenantId: "t1",
    accountScope: "all",
    network: "all" as const,
    period: "2026-11-01_2026-11-15_d14",
    dataClass: "insights" as const,
  };

  await resolveSocialDataWithSWR({
    keyParams,
    fetcher: async () => ({ data: { reachIg: 50000 }, isValidForCache: true }),
  });

  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    const res = await resolveSocialDataWithSWR({
      keyParams,
      fetcher: async () => {
        throw new Error("Não deveria chamar Meta com cache aquecido");
      },
    });
    const elapsed = performance.now() - start;
    recordSocialRouteTransition(elapsed);
    assert.equal(res.source, "cache_fresh");
  }

  const metrics = getSocialPerfMetrics();
  assert.equal(metrics.cacheHits, 20);
  assert.equal(metrics.metaCalls, 0);
  assert.ok(metrics.p50NavigationMs <= 50);
  assert.ok(metrics.p95NavigationMs <= 100);
});

test("11. Canonical shared account selection persists across Audit -> Insights -> Planner and supports FB-only, IG+FB, and consolidated", () => {
  resetSocialHubFiltersForTests();

  const mockAccounts = [
    {
      page_id: "1001",
      page_name: "Fly Garage",
      instagram_account_id: "178414001",
      instagram_handle: "flygaragebarra",
    },
    {
      page_id: "2002",
      page_name: "Alug Motos Brasil",
      instagram_account_id: null,
      instagram_handle: null,
    },
  ];

  // Selecionar Fly Garage na Auditoria Orgânica
  setSocialSelectedPage("1001", "Fly Garage (@flygaragebarra)");
  assert.equal(getSocialHubFilterSnapshot().selectedPage, "1001");
  assert.equal(getSocialHubFilterSnapshot().selectedAccountLabel, "Fly Garage (@flygaragebarra)");

  // Canonicaliza se um ID do Instagram vier via URL ?account=
  assert.equal(canonicalizeSocialPageId("178414001", mockAccounts), "1001");
  // Preserva enquanto accounts ainda está vazio (carregando)
  assert.equal(canonicalizeSocialPageId("1001", []), "1001");

  // Conta somente Facebook permanece selecionada sem resetar para consolidated
  setSocialSelectedPage("2002", "Alug Motos Brasil (Somente FB)");
  assert.equal(canonicalizeSocialPageId("2002", mockAccounts), "2002");
  assert.equal(getSocialHubFilterSnapshot().selectedPage, "2002");

  // Troca de rede não altera conta selecionada
  setSocialSelectedNetwork("facebook");
  assert.equal(getSocialHubFilterSnapshot().selectedPage, "2002");

  // Retorno explícito para Consolidado ("all")
  assert.equal(normalizeSelectedPageId("consolidated"), "all");
  setSocialSelectedPage("all");
  assert.equal(getSocialHubFilterSnapshot().selectedPage, "all");
  assert.equal(getSocialHubFilterSnapshot().selectedAccountLabel, null);

  // Tenant fallback nunca regrede se tenant real for conhecido
  assert.equal(getLastKnownTenantId("user-uuid-99"), "user-uuid-99");
  assert.equal(getLastKnownTenantId(null), "default");
});

test("12. Instrumentation matrix, React Query cache-hit tracking, call lifecycle, and anonymized scope tags work without exposing tokens", async () => {
  resetSocialCacheForTests();

  // Matriz formal cobre todas as classes
  for (const cls of ["accounts", "profile", "insights", "posts", "planner"] as const) {
    assert.ok(SOCIAL_DATA_CLASS_MATRIX[cls].ttlMs > 0);
    assert.ok(SOCIAL_DATA_CLASS_MATRIX[cls].keyDimensions.includes("tenantId"));
  }

  // Simula hit em cache do React Query + chamada single-flight completa
  recordSocialCacheHitEvent({
    dataClass: "insights",
    accountScope: "100199998888",
    network: "all",
    period: "2026-11-01_2026-11-15_d14",
  });

  await runSharedSocialSync(
    "k1",
    async () => ({ ok: true }),
    { dataClass: "planner", accountScope: "100199998888", network: "all", period: "planner" }
  );

  recordSocialRouteTransition(14.2, { from: "/social-audit", to: "/social-insights", cacheWarm: true });

  const perf = getSocialPerfMetrics();
  assert.equal(perf.cacheHits, 1);
  assert.equal(perf.callsStarted, 1);
  assert.equal(perf.callsCompleted, 1);
  assert.equal(perf.routeTransitions.length, 1);
  assert.equal(perf.routeTransitions[0].from, "/social-audit");
  assert.equal(perf.routeTransitions[0].to, "/social-insights");
  const serialized = JSON.stringify(perf);
  assert.ok(!serialized.includes("EAAG"));
  assert.ok(!serialized.includes("access_token"));
});

test("13. ensureSocialPerfInitialized exposes global telemetry, tracks reactQueryHits, byDataClass, source, durationMs, reason, and warmed transitions", async () => {
  const sessionStore = new Map<string, string>();
  const prevWindow = (globalThis as any).window;
  const prevStorage = (globalThis as any).sessionStorage;
  const mockWin: Record<string, unknown> = {};
  (globalThis as any).window = mockWin;
  (globalThis as any).sessionStorage = {
    getItem: (k: string) => sessionStore.get(k) ?? null,
    setItem: (k: string, v: string) => {
      sessionStore.set(k, v);
    },
    removeItem: (k: string) => {
      sessionStore.delete(k);
    },
  };

  try {
    resetSocialCacheForTests();
    const initial = ensureSocialPerfInitialized();
    assert.ok((globalThis as any).__ncSocialPerf);
    assert.ok(mockWin.__ncSocialPerf);
    assert.equal(typeof mockWin.__getNcSocialPerf, "function");
    assert.equal(initial.reactQueryHits, 0);
    assert.ok(sessionStore.get("nc_social_perf_v1"));

    // Simula hits e chamadas reais por classe de dado e transições Audit -> Insights -> Planner -> Audit
    recordSocialCacheHitEvent({
      dataClass: "accounts",
      accountScope: "all",
      network: "all",
      period: "accounts",
      reason: "react_query_cache_hit",
      durationMs: 1.5,
    });
    recordSocialPerfEvent("supabase_read", {
      dataClass: "planner",
      accountScope: "1001",
      reason: "supabase_social_posts_read",
      source: "supabase",
      durationMs: 12,
    });
    recordSocialPerfEvent("meta_call", {
      dataClass: "profile",
      accountScope: "1001",
      reason: "meta_ig_profile",
      source: "meta",
      durationMs: 85,
      status: "ok",
    });
    recordSocialCacheHitEvent({
      dataClass: "insights",
      accountScope: "1001",
      network: "all",
      period: "2026-11-01_2026-11-15_d14",
      reason: "react_query_cache_hit",
    });
    recordSocialCacheHitEvent({
      dataClass: "posts",
      accountScope: "1001",
      network: "all",
      period: "2026-11-01_2026-11-15_d14",
      reason: "swr_memory_hit",
    });
    recordSocialRouteTransition(9.4, { from: "/social-audit", to: "/social-insights", cacheWarm: true });
    recordSocialRouteTransition(6.1, { from: "/social-insights", to: "/social", cacheWarm: true });
    recordSocialRouteTransition(4.2, { from: "/social", to: "/social-audit", cacheWarm: true });

    const live = (mockWin.__getNcSocialPerf as () => ReturnType<typeof getSocialPerfMetrics>)();
    assert.equal(live.reactQueryHits, 2);
    assert.equal(live.cacheHits, 3);
    assert.equal(live.supabaseReads, 1);
    assert.equal(live.metaCalls, 1);
    assert.equal(live.byDataClass.accounts.reactQueryHits, 1);
    assert.equal(live.byDataClass.planner.supabaseReads, 1);
    assert.equal(live.byDataClass.profile.metaCalls, 1);
    assert.equal(live.byDataClass.insights.reactQueryHits, 1);
    assert.equal(live.byDataClass.posts.cacheHits, 1);
    assert.equal(live.routeTransitions.length, 3);

    const lastEvent = live.recentEvents[live.recentEvents.length - 1];
    assert.equal(lastEvent.event, "route_transition");
    assert.equal(typeof lastEvent.durationMs, "number");
    assert.ok(lastEvent.reason?.includes("/social"));

    const persisted = JSON.parse(sessionStore.get("nc_social_perf_v1") || "{}");
    assert.equal(persisted.reactQueryHits, 2);
    assert.equal(persisted.byDataClass?.profile?.metaCalls, 1);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as any).window;
    } else {
      (globalThis as any).window = prevWindow;
    }
    if (prevStorage === undefined) {
      delete (globalThis as any).sessionStorage;
    } else {
      (globalThis as any).sessionStorage = prevStorage;
    }
  }
});

test("14. Per-media insights cache isolates account/tenant scopes and avoids duplicate individual calls across routes", () => {
  resetSocialCacheForTests();

  writeSocialMediaInsightsCache(
    {
      tenantId: "tenant-1",
      accountScope: "page-luma",
      network: "all",
      period: "planner",
      mediaId: "ig_media_1",
    },
    {
      mediaId: "ig_media_1",
      platform: "instagram",
      reach: 4200,
      views: 5100,
      saved: 34,
      shares: 12,
      available: true,
    }
  );

  // Mesmo tenant + conta reutiliza imediatamente
  const hit = readSocialMediaInsightsCache({
    tenantId: "tenant-1",
    accountScope: "page-luma",
    network: "all",
    period: "planner",
    mediaId: "ig_media_1",
  });
  assert.ok(hit);
  assert.equal(hit.reach, 4200);
  assert.equal(hit.views, 5100);
  assert.equal(hit.saved, 34);
  assert.equal(hit.shares, 12);

  // Outra conta ou outro tenant não vaza cache
  assert.equal(
    readSocialMediaInsightsCache({
      tenantId: "tenant-1",
      accountScope: "page-fly",
      network: "all",
      period: "planner",
      mediaId: "ig_media_1",
    }),
    null
  );
  assert.equal(
    readSocialMediaInsightsCache({
      tenantId: "tenant-2",
      accountScope: "page-luma",
      network: "all",
      period: "planner",
      mediaId: "ig_media_1",
    }),
    null
  );
});

test("15. Explicit Meta cursor pagination loads 120 -> 180 -> 210 without silent truncation and deduplicates cross-endpoint records safely", async () => {
  const buildPage = (prefix: string, start: number, count: number) =>
    Array.from({ length: count }, (_, idx) => ({
      id: `${prefix}_${start + idx}`,
      timestamp: `2026-11-${String(Math.max(1, 28 - Math.floor((start + idx) / 10))).padStart(2, "0")}T12:00:00+0000`,
    }));

  const makePaginatedFetch = (prefix: string) => {
    const pages: Record<string, { data: Array<{ id: string; timestamp: string }>; nextCursor?: string }> = {
      root: { data: buildPage(prefix, 1, 30), nextCursor: `${prefix}_cursor_p2` },
      [`${prefix}_cursor_p2`]: { data: buildPage(prefix, 31, 30), nextCursor: `${prefix}_cursor_p3` },
      [`${prefix}_cursor_p3`]: { data: buildPage(prefix, 61, 30), nextCursor: `${prefix}_cursor_p4` },
      [`${prefix}_cursor_p4`]: { data: buildPage(prefix, 91, 15) },
    };

    return async (url: string | URL | Request) => {
      const parsed = new URL(typeof url === "string" ? url : url.toString());
      const after = parsed.searchParams.get("after") || "root";
      const page = pages[after] || { data: [] };
      const body = page.nextCursor
        ? {
            data: page.data,
            paging: {
              cursors: { after: page.nextCursor },
              next: `${parsed.origin}${parsed.pathname}?after=${page.nextCursor}`,
            },
          }
        : { data: page.data };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
  };

  const igFetch = makePaginatedFetch("ig");
  const fbFetch = makePaginatedFetch("fb");

  // 1) Carga inicial rápida (maxPages: 2) para em 120 itens (60 IG + 60 FB) com cursor explícito para página 3
  const [igStage1, fbStage1] = await Promise.all([
    metaFetchPaginatedWithStatus<{ id: string }>("/17841402722228965/media", "tok", { limit: "30" }, { maxPages: 2, fetchFn: igFetch }),
    metaFetchPaginatedWithStatus<{ id: string }>("/381260795398048/posts", "tok", { limit: "30" }, { maxPages: 2, fetchFn: fbFetch }),
  ]);

  assert.equal(igStage1.data.length + fbStage1.data.length, 120);
  assert.equal(igStage1.truncated, true);
  assert.equal(fbStage1.truncated, true);
  assert.equal(igStage1.hasMore, true);
  assert.equal(fbStage1.hasMore, true);
  assert.equal(igStage1.nextAfterCursor, "ig_cursor_p3");
  assert.equal(fbStage1.nextAfterCursor, "fb_cursor_p3");

  // 2) Continuação progressiva da página 3 alcança 180 itens (ainda com hasMore: true para página 4)
  const [igStage2, fbStage2] = await Promise.all([
    metaFetchPaginatedWithStatus<{ id: string }>(
      "/17841402722228965/media",
      "tok",
      { limit: "30", after: igStage1.nextAfterCursor! },
      { maxPages: 1, fetchFn: igFetch }
    ),
    metaFetchPaginatedWithStatus<{ id: string }>(
      "/381260795398048/posts",
      "tok",
      { limit: "30", after: fbStage1.nextAfterCursor! },
      { maxPages: 1, fetchFn: fbFetch }
    ),
  ]);

  const totalAfterPage3 =
    igStage1.data.length + fbStage1.data.length + igStage2.data.length + fbStage2.data.length;
  assert.equal(totalAfterPage3, 180);
  assert.equal(igStage2.hasMore, true);
  assert.equal(fbStage2.hasMore, true);
  assert.equal(igStage2.nextAfterCursor, "ig_cursor_p4");
  assert.equal(fbStage2.nextAfterCursor, "fb_cursor_p4");

  // 3) Página 4 completa os 210 itens sem truncated nem nextAfterCursor
  const [igStage3, fbStage3] = await Promise.all([
    metaFetchPaginatedWithStatus<{ id: string }>(
      "/17841402722228965/media",
      "tok",
      { limit: "30", after: igStage2.nextAfterCursor! },
      { maxPages: 1, fetchFn: igFetch }
    ),
    metaFetchPaginatedWithStatus<{ id: string }>(
      "/381260795398048/posts",
      "tok",
      { limit: "30", after: fbStage2.nextAfterCursor! },
      { maxPages: 1, fetchFn: fbFetch }
    ),
  ]);

  const allPaginatedIds = new Set([
    ...igStage1.data.map((x) => x.id),
    ...fbStage1.data.map((x) => x.id),
    ...igStage2.data.map((x) => x.id),
    ...fbStage2.data.map((x) => x.id),
    ...igStage3.data.map((x) => x.id),
    ...fbStage3.data.map((x) => x.id),
  ]);
  assert.equal(allPaginatedIds.size, 210);
  assert.equal(igStage3.truncated, false);
  assert.equal(fbStage3.truncated, false);
  assert.equal(igStage3.hasMore, false);
  assert.equal(fbStage3.hasMore, false);
  assert.equal(igStage3.nextAfterCursor, null);
  assert.equal(fbStage3.nextAfterCursor, null);

  // 4) Deduplicação preserva /media, /posts, /scheduled_posts, /promotable_posts e /stories e descarta duplicatas exatas
  const makeMetaRecord = (overrides: Record<string, unknown>) => ({
    id: "meta_item_1",
    platform: "instagram" as const,
    metaPostId: "18019822568745786",
    pageId: "381260795398048",
    accountName: "Luma Car",
    accountHandle: "lumacar.veiculos",
    title: "Post Meta",
    content: "Conteúdo",
    postType: "feed" as const,
    status: "published" as const,
    scheduledAt: null,
    publishedAt: "2026-11-13T15:00:00.000Z",
    likesCount: 10,
    commentsCount: 2,
    sharesCount: 1,
    savesCount: 0,
    reachCount: null,
    impressionsCount: null,
    reachState: "indisponivel" as const,
    impressionsState: "indisponivel" as const,
    permalink: null,
    mediaUrl: null,
    thumbnailUrl: null,
    source: "meta_live" as const,
    ...overrides,
  });

  const merged = mergeSocialCrosspostRecords({
    dbRows: [],
    metaLivePosts: [
      makeMetaRecord({ id: "meta_ig_180", metaPostId: "180", platform: "instagram", postType: "reels", status: "published" }),
      // Duplicata exata de /media vinda de paginação repetida -> deve ser deduplicada
      makeMetaRecord({ id: "meta_ig_180_dup", metaPostId: "180", platform: "instagram", postType: "reels", status: "published" }),
      // Facebook /posts com outro canal
      makeMetaRecord({ id: "meta_fb_200", metaPostId: "200", platform: "facebook", postType: "feed", status: "published" }),
      // Story ativo do IG não colide com feed
      makeMetaRecord({ id: "meta_story_300", metaPostId: "300", platform: "instagram", postType: "stories", status: "published" }),
      // Scheduled + Promotable no FB (/scheduled_posts + /promotable_posts) distintos preservados, duplicata removida
      makeMetaRecord({ id: "meta_sched_400", metaPostId: "400", platform: "facebook", postType: "feed", status: "scheduled", publishedAt: null, scheduledAt: "2026-11-20T14:00:00.000Z" }),
      makeMetaRecord({ id: "meta_promo_400", metaPostId: "400", platform: "facebook", postType: "feed", status: "scheduled", publishedAt: null, scheduledAt: "2026-11-20T14:00:00.000Z" }),
      makeMetaRecord({ id: "meta_promo_500", metaPostId: "500", platform: "facebook", postType: "feed", status: "scheduled", publishedAt: null, scheduledAt: "2026-11-21T14:00:00.000Z" }),
    ],
  });

  assert.equal(merged.length, 5);
  assert.deepEqual(
    merged.map((m) => `${m.platform}:${m.status}:${m.postType}:${m.metaPostId}`).sort(),
    [
      "facebook:published:feed:200",
      "facebook:scheduled:feed:400",
      "facebook:scheduled:feed:500",
      "instagram:published:reels:180",
      "instagram:published:stories:300",
    ]
  );
});
