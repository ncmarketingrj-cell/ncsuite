import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSocialCacheKey,
  configureSocialCacheTtls,
  evaluateSocialSnapshotFreshness,
  getSocialCacheTtlMs,
  getSocialPerfMetrics,
  recordSocialPerfEvent,
  recordSocialRouteTransition,
  resetSocialCacheForTests,
  resolveSocialDataWithSWR,
  runSharedSocialSync,
} from "../src/lib/socialCacheDomain.ts";

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
