import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCAL_SYNC_LOCK_TTL_MS,
  DEFAULT_REMOTE_JOB_LOCK_TTL_MS,
  SYNC_STATUS_STORAGE_KEY,
  computeFreshnessAgeMinutes,
  formatShortSnapshotId,
  formatSyncTimeBRT,
  formatSyncTimestampBRT,
  isLocalSyncLockActive,
  isSyncJobActivelyRunning,
  normalizeTimestampToEpochMs,
  readValidatedLocalSyncStatus,
  resolveSyncBadgePresentation,
  summarizeSyncCoverage,
  type SyncAccountRecord,
  type SyncRunRecord,
} from "../src/lib/syncStatusDomain.ts";

import { createMonotonicRequestGuard } from "../src/lib/metaSnapshotScope.ts";
import { buildVictoriaAnalysisContext } from "../src/lib/victoriaContract.ts";

describe("Contrato Global de Status de Sincronização, Locks, Fuso e Cobertura", () => {
  const sampleAccounts: SyncAccountRecord[] = [
    {
      id: "act_fly",
      name: "NC - Fly Garage",
      last_sync: "2026-11-14T19:51:20.000+00:00",
      status: 1,
      platform: "Meta Ads",
    },
    {
      id: "act_bonne",
      name: "BM Bonne21",
      last_sync: "2026-11-14T19:51:30.000+00:00",
      status: 1,
      platform: "Meta Ads",
    },
    {
      id: "act_blocked",
      name: "13 Car Repasses - ADS",
      last_sync: null,
      status: 1,
      platform: "Meta Ads",
    },
  ];

  it("1. Sync em andamento confirmado exibe status remoto ativo e preserva snapshot anterior no tooltip/subtítulo", () => {
    const nowMs = Date.parse("2026-11-14T19:52:00.000Z");
    const runningJob: SyncRunRecord = {
      id: "running-job-9999-aaaa",
      status: "running",
      started_at: "2026-11-14T19:51:10.000Z",
      heartbeat_at: "2026-11-14T19:51:50.000Z",
    };

    const vm = resolveSyncBadgePresentation({
      isPageLoading: false,
      isMetaSyncing: true,
      snapshotId: "165dc6cd-6775-4800-8c31-715277425d43",
      committedAt: "2026-11-14T11:55:31.791+00:00",
      startedAt: runningJob.started_at,
      latestSyncRun: runningJob,
      nowMs,
    });

    assert.equal(vm.state, "syncing");
    assert.equal(vm.isMetaSyncing, true);
    assert.equal(vm.primaryLabel, "Sincronização Meta em andamento");
    assert.equal(vm.secondaryLabel, "Exibindo snapshot anterior (08:55:31)");
    assert.equal(vm.snapshotId, "165dc6cd-6775-4800-8c31-715277425d43");
    assert.equal(vm.shortSnapshotId, "165dc6cd…5d43");
    assert.equal(formatShortSnapshotId(vm.snapshotId), "165dc6cd…5d43");
  });

  it("2. Sync concluído com sucesso transiciona para terminal fresh com horário concluído em BRT", () => {
    const nowMs = Date.parse("2026-11-14T19:55:34.000Z");
    const completedRun: SyncRunRecord = {
      id: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      status: "success",
      started_at: "2026-11-14T19:49:42.000Z",
      completed_at: "2026-11-14T19:51:34.595+00:00",
      accounts_synced: 2,
      sync_coverage: {
        act_fly: { account_name: "NC - Fly Garage", status: "success", campaigns_listed: 4, campaign_insights: 12 },
        act_bonne: { account_name: "BM Bonne21", status: "success", campaigns_listed: 0, campaign_insights: 0 },
      },
    };

    const vm = resolveSyncBadgePresentation({
      isPageLoading: false,
      isMetaSyncing: false,
      snapshotId: "165dc6cd-6775-4800-8c31-715277425d43",
      committedAt: "2026-11-14T11:55:31.791+00:00",
      latestSyncRun: completedRun,
      accounts: sampleAccounts.slice(0, 2),
      nowMs,
    });

    assert.equal(vm.state, "fresh");
    assert.equal(vm.isStale, false);
    assert.equal(vm.ageMinutes, 4);
    assert.equal(vm.primaryLabel, "Atualizado às 16:51:34");
    assert.equal(vm.snapshotId, "286a0fd2-3bf5-47fb-9c76-36eff69faa02");
    assert.equal(vm.coverage.zeroDeliveryHealthyAccounts, 1);
    assert.equal(vm.coverage.hasPartialOrError, false);
  });

  it("3. Sync parcial (partial_success) mostra cobertura por conta no global, mantém conta saudável como Atualizado e bloqueada como Falha", () => {
    const nowMs = Date.parse("2026-11-14T19:55:34.000Z");
    const partialRun: SyncRunRecord = {
      id: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      status: "partial_success",
      started_at: "2026-11-14T19:49:42.000Z",
      completed_at: "2026-11-14T19:51:34.595+00:00",
      accounts_synced: 2,
      partial_failures: [
        {
          scope: "client_account_access",
          account_id: "act_blocked",
          account_name: "13 Car Repasses - ADS",
          errorKind: "permission_denied",
          error: "(#200) Permissions error",
        },
      ],
      sync_coverage: {
        act_fly: { account_name: "NC - Fly Garage", status: "success", campaigns_listed: 3, campaign_insights: 10 },
        act_bonne: { account_name: "BM Bonne21", status: "success", campaigns_listed: 2, campaign_insights: 5 },
        act_blocked: { account_name: "13 Car Repasses - ADS", status: "permission_denied", error: "(#200) Permissions error" },
      },
    };

    // Visão consolidada global ("all")
    const globalVm = resolveSyncBadgePresentation({
      latestSyncRun: partialRun,
      accounts: sampleAccounts,
      selectedAccountId: "all",
      nowMs,
    });
    assert.equal(globalVm.state, "partial");
    assert.equal(globalVm.primaryLabel, "Concluído parcialmente");
    assert.ok(globalVm.secondaryLabel?.includes("16:51:34"));
    assert.ok(globalVm.secondaryLabel?.includes("2/3 contas"));
    assert.ok(globalVm.secondaryLabel?.includes("1 sem permissão"));

    // Visão filtrada em conta saudável ("act_fly") NÃO herda estado parcial de outra conta
    const flyVm = resolveSyncBadgePresentation({
      latestSyncRun: partialRun,
      accounts: sampleAccounts,
      selectedAccountId: "act_fly",
      nowMs,
    });
    assert.equal(flyVm.state, "fresh");
    assert.equal(flyVm.primaryLabel, "Atualizado às 16:51:20");

    // Visão filtrada na conta bloqueada ("act_blocked") mostra falha própria e NÃO herda horário global 16:51:34
    const blockedVm = resolveSyncBadgePresentation({
      latestSyncRun: partialRun,
      accounts: sampleAccounts,
      selectedAccountId: "act_blocked",
      nowMs,
    });
    assert.equal(blockedVm.state, "error");
    assert.equal(blockedVm.primaryLabel, "Falha na sincronização");
    assert.equal(blockedVm.completedAtFormatted, null);
    assert.ok(blockedVm.secondaryLabel?.includes("(#200) Permissions error"));
  });

  it("4. Sync com falha real exibe 'Falha na sincronização' com causa e nunca sobrescreve se houve snapshot posterior válido", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");
    const failedRun: SyncRunRecord = {
      id: "failed-run-0001",
      status: "error",
      started_at: "2026-11-14T19:58:00.000Z",
      completed_at: "2026-11-14T19:59:00.000Z",
      error_message: "Token OAuth expirado",
    };

    const vmError = resolveSyncBadgePresentation({
      latestSyncRun: failedRun,
      committedAt: "2026-11-14T19:51:34.000Z",
      snapshotId: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      nowMs,
    });
    assert.equal(vmError.state, "error");
    assert.equal(vmError.primaryLabel, "Falha na sincronização");
    assert.equal(vmError.secondaryLabel, "Token OAuth expirado");

    // Erro antigo antes do último snapshot válido não deve mascarar snapshot mais novo
    const staleFailedRun: SyncRunRecord = {
      ...failedRun,
      started_at: "2026-11-14T18:00:00.000Z",
      completed_at: "2026-11-14T18:01:00.000Z",
    };
    const vmRecovered = resolveSyncBadgePresentation({
      latestSyncRun: staleFailedRun,
      committedAt: "2026-11-14T19:51:34.000Z",
      snapshotId: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      nowMs,
    });
    assert.equal(vmRecovered.state, "fresh");
    assert.equal(vmRecovered.primaryLabel, "Atualizado às 16:51:34");
  });

  it("5. Lock zumbi sem heartbeat recente é invalidado automaticamente (remoto e local)", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");
    const zombieRemote: SyncRunRecord = {
      id: "zombie-1",
      status: "running",
      started_at: new Date(nowMs - DEFAULT_REMOTE_JOB_LOCK_TTL_MS - 30_000).toISOString(),
    };
    assert.equal(isSyncJobActivelyRunning(zombieRemote, nowMs), false);

    // Sem isMetaSyncing forçado do cliente, job zumbi não coloca UI em syncing
    const vm = resolveSyncBadgePresentation({
      latestSyncRun: zombieRemote,
      committedAt: "2026-11-14T19:51:34.000Z",
      nowMs,
    });
    assert.equal(vm.isMetaSyncing, false);
    assert.equal(vm.state, "fresh");

    const zombieLocal = {
      isSyncing: true,
      startedAt: new Date(nowMs - DEFAULT_LOCAL_SYNC_LOCK_TTL_MS - 10_000).toISOString(),
    };
    assert.equal(isLocalSyncLockActive(zombieLocal, nowMs), false);
  });

  it("6. Lock com heartbeat recente permanece ativo mesmo após started_at ultrapassar TTL inicial", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");
    const healthyLongRemote: SyncRunRecord = {
      id: "long-running-ok",
      status: "running",
      started_at: new Date(nowMs - 6 * 60_000).toISOString(),
      heartbeat_at: new Date(nowMs - 20_000).toISOString(),
    };
    assert.equal(isSyncJobActivelyRunning(healthyLongRemote, nowMs), true);

    const healthyLocal = {
      isSyncing: true,
      startedAt: new Date(nowMs - 4 * 60_000).toISOString(),
      heartbeatAt: new Date(nowMs - 15_000).toISOString(),
    };
    assert.equal(isLocalSyncLockActive(healthyLocal, nowMs), true);
  });

  it("7. Timeout/recuperação de lock local no localStorage expira lock preso automaticamente", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");
    const originalStorage = (globalThis as any).localStorage;
    const originalWindow = (globalThis as any).window;
    try {
      const store = new Map<string, string>();
      (globalThis as any).window = {};
      (globalThis as any).localStorage = {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      };

      store.set(
        SYNC_STATUS_STORAGE_KEY,
        JSON.stringify({
          isSyncing: true,
          startedAt: new Date(nowMs - 5 * 60_000).toISOString(),
          heartbeatAt: new Date(nowMs - 4 * 60_000).toISOString(),
          lastSync: "2026-11-14T19:51:34.000Z",
          lastResult: "partial",
        })
      );

      const status = readValidatedLocalSyncStatus(nowMs);
      assert.equal(status.isSyncing, false);
      assert.equal(status.lastSync, "2026-11-14T19:51:34.000Z");
      assert.equal(status.lastResult, "partial");
    } finally {
      (globalThis as any).localStorage = originalStorage;
      (globalThis as any).window = originalWindow;
    }
  });

  it("8. Consulta da página termina antes do job Meta => continua exibindo sync Meta remoto + snapshot anterior", () => {
    const nowMs = Date.parse("2026-11-14T19:52:00.000Z");
    const vm = resolveSyncBadgePresentation({
      isPageLoading: false,
      isMetaSyncing: true,
      snapshotId: "165dc6cd-6775-4800-8c31-715277425d43",
      committedAt: "2026-11-14T11:55:31.791+00:00",
      startedAt: "2026-11-14T19:51:10.000Z",
      nowMs,
    });
    assert.equal(vm.state, "syncing");
    assert.equal(vm.isPageLoading, false);
    assert.equal(vm.isMetaSyncing, true);
    assert.equal(vm.primaryLabel, "Sincronização Meta em andamento");
    assert.equal(vm.previousSnapshotNotice, "Exibindo snapshot anterior (08:55:31)");
  });

  it("9. Job Meta já terminou e só consulta local está carregando => exibe 'Carregando dados desta tela', NUNCA 'Sincronização em andamento'", () => {
    const nowMs = Date.parse("2026-11-14T19:55:00.000Z");
    const vm = resolveSyncBadgePresentation({
      isPageLoading: true,
      isMetaSyncing: false,
      snapshotId: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      committedAt: "2026-11-14T19:51:34.595+00:00",
      nowMs,
    });
    assert.equal(vm.state, "loading_page");
    assert.equal(vm.isPageLoading, true);
    assert.equal(vm.isMetaSyncing, false);
    assert.equal(vm.primaryLabel, "Carregando dados desta tela");
    assert.equal(vm.secondaryLabel, "Snapshot: 16:51:34");
  });

  it("10. Dados carregados com snapshot antigo exibem defasagem sem simular sincronização em andamento", () => {
    const nowMs = Date.parse("2026-11-14T19:51:31.791Z"); // exatamente 476 min após 11:55:31.791Z
    const vm = resolveSyncBadgePresentation({
      isPageLoading: false,
      isMetaSyncing: false,
      snapshotId: "165dc6cd-6775-4800-8c31-715277425d43",
      committedAt: "2026-11-14T11:55:31.791+00:00",
      nowMs,
    });
    assert.equal(vm.state, "stale");
    assert.equal(vm.isStale, true);
    assert.equal(vm.ageMinutes, 476);
    assert.equal(vm.primaryLabel, "Dados defasados há 476 min");
    assert.ok(vm.secondaryLabel?.includes("Último: 14/11/2026, 08:55:31"));
    assert.ok(!vm.primaryLabel.toLowerCase().includes("andamento"));
  });

  it("11. Proteção contra corrida out-of-order descarta resposta antiga de escopo superseded", () => {
    const guard = createMonotonicRequestGuard();
    const reqOld = guard.next();
    const reqNew = guard.next();

    assert.equal(guard.isCurrent(reqOld), false);
    assert.equal(guard.isCurrent(reqNew), true);
  });

  it("12. Conversão única UTC -> America/Sao_Paulo respeita virada de dia após 21:00 BRT", () => {
    // 2026-11-15 01:30:00 UTC === 2026-11-14 22:30:00 BRT
    const midnightRolloverUtc = "2026-11-15T01:30:00.000Z";
    assert.equal(formatSyncTimestampBRT(midnightRolloverUtc), "14/11/2026, 22:30:00");
    assert.equal(formatSyncTimeBRT(midnightRolloverUtc), "22:30:00");

    // 2026-11-14T11:55:31.791+00:00 === 14/11/2026, 08:55:31 BRT
    assert.equal(formatSyncTimestampBRT("2026-11-14T11:55:31.791+00:00"), "14/11/2026, 08:55:31");
  });

  it("13. Timestamp sem fuso explícito (Postgres/ISO bare) é tratado inequivocamente como UTC e alinhado ao contrato da Victoria", () => {
    const barePostgres = "2026-11-14 19:51:34.595";
    const bareIso = "2026-11-14T19:51:34";
    const pgPlusZero = "2026-11-14 19:51:34.595+00";

    assert.equal(formatSyncTimestampBRT(barePostgres), "14/11/2026, 16:51:34");
    assert.equal(formatSyncTimestampBRT(bareIso), "14/11/2026, 16:51:34");
    assert.equal(formatSyncTimestampBRT(pgPlusZero), "14/11/2026, 16:51:34");

    const freshBareUtc = new Date(Date.now() - 15 * 60_000).toISOString().replace("Z", "").replace("T", " ");
    const contract = buildVictoriaAnalysisContext({
      source_surface: "command_center",
      route: "/dashboard",
      user_id: "u1",
      ad_account_id: "act_fly",
      entity_level: "campaign",
      entity_id: "123",
      entity_name: "Campanha Teste",
      date_from: "2026-11-14",
      date_to: "2026-11-14",
      odax_objective: "OUTCOME_LEADS",
      optimization_goal: "CONVERSATIONS",
      spend: 100,
      impressions: 1000,
      reach: 900,
      link_clicks: 20,
      all_clicks: 25,
      conversions: 5,
      last_sync_at: freshBareUtc,
    });
    assert.equal(contract.period.data_freshness, "fresh");
  });

  it("14. Timestamps ausentes ou inválidos exibem 'Horário indisponível' e jamais inventam horário atual", () => {
    for (const bad of [null, undefined, "", "invalid-date", "initial", "2026-11-14"]) {
      assert.equal(normalizeTimestampToEpochMs(bad), null);
      assert.equal(formatSyncTimestampBRT(bad), "Horário indisponível");
      assert.equal(computeFreshnessAgeMinutes(bad), null);
    }

    const vm = resolveSyncBadgePresentation({
      snapshotId: "initial",
      committedAt: null,
      latestSyncRun: null,
    });
    assert.equal(vm.state, "unavailable");
    assert.equal(vm.primaryLabel, "Horário indisponível");
    assert.equal(vm.timeFormatted, "Horário indisponível");
  });

  it("15. Consistência entre telas e detecção de janela mista entre contas (>10 min)", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");
    const run: SyncRunRecord = {
      id: "286a0fd2-3bf5-47fb-9c76-36eff69faa02",
      status: "success",
      started_at: "2026-11-14T19:49:42.000Z",
      completed_at: "2026-11-14T19:55:00.000Z",
    };

    const mixedAccounts: SyncAccountRecord[] = [
      { id: "a1", name: "Conta 1", last_sync: "2026-11-14T19:40:00.000Z", platform: "Meta Ads" },
      { id: "a2", name: "Conta 2", last_sync: "2026-11-14T19:55:00.000Z", platform: "Meta Ads" },
    ];

    const cov = summarizeSyncCoverage({ accounts: mixedAccounts, selectedAccountId: "all", nowMs });
    assert.equal(cov.hasMixedAccountTimestamps, true);

    const dashboardBadge = resolveSyncBadgePresentation({
      latestSyncRun: run,
      accounts: mixedAccounts,
      selectedAccountId: "all",
      nowMs,
    });
    const metricasBadge = resolveSyncBadgePresentation({
      latestSyncRun: run,
      accounts: mixedAccounts,
      selectedAccountId: "all",
      nowMs,
    });
    const relatoriosBadge = resolveSyncBadgePresentation({
      latestSyncRun: run,
      accounts: mixedAccounts,
      selectedAccountId: "all",
      nowMs,
    });

    assert.deepEqual(dashboardBadge, metricasBadge);
    assert.deepEqual(metricasBadge, relatoriosBadge);
    assert.equal(dashboardBadge.mixedTimestampsNotice, "Contas entre 16:40:00 e 16:55:00");
  });
});
