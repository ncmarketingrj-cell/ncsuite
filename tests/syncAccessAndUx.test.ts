import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  canUserAccessConfig,
  canUserManageIntegrations,
  canUserViewIntegrations,
  getCargoDefinition,
} from "../src/lib/userHierarchy.ts";
import {
  DEFAULT_LOCAL_SYNC_LOCK_TTL_MS,
  DEFAULT_REMOTE_JOB_LOCK_TTL_MS,
  formatSyncDuration,
  resolveHeaderSpinnerState,
} from "../src/lib/syncStatusDomain.ts";

const ROOT = process.cwd();

function readWorkspaceFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

describe("RBAC e Simplificação da Experiência de Sincronização (Perfis, Estados & Rotas)", () => {
  it("1. Matriz de autorização: apenas admin/master_admin ou permissão explícita em gerenciar_integracoes acessa ou dispara sync", () => {
    assert.equal(
      canUserViewIntegrations({ role: "admin", email: "admin@nc.com", permissions: {} }),
      true
    );
    assert.equal(
      canUserManageIntegrations({ role: "master_admin", email: "master@nc.com", permissions: {} }),
      true
    );

    // Gestor de Tráfego padrão sem gerenciar_integracoes: bloqueado
    const gestorSemIntegracao = {
      role: "gestor",
      cargo: "Gestor de Tráfego",
      permissions: { dashboard: "edit", metricas: "edit", cockpit: "edit", relatorios: "edit" },
    };
    assert.equal(canUserViewIntegrations(gestorSemIntegracao), false);
    assert.equal(canUserManageIntegrations(gestorSemIntegracao), false);
    assert.equal(canUserAccessConfig(gestorSemIntegracao), false);

    // Social Media / Designer / Usuário comum: bloqueados
    for (const restricted of [
      { role: "social_media", cargo: "Social Media", permissions: { social: "edit", criativos: "edit" } },
      { role: "designer", cargo: "Designer", permissions: { criativos: "edit" } },
      { role: "user", permissions: { dashboard: "view", metricas: "view" } },
      { role: null, permissions: {} },
    ]) {
      assert.equal(canUserViewIntegrations(restricted), false);
      assert.equal(canUserManageIntegrations(restricted), false);
    }

    // Gestor com permissão somente leitura em gerenciar_integracoes pode visualizar telemetria mas não disparar/editar
    const gestorViewIntegracoes = {
      role: "gestor",
      cargo: "Gestor de Tráfego",
      permissions: { dashboard: "edit", gerenciar_integracoes: "view" },
    };
    assert.equal(canUserViewIntegrations(gestorViewIntegracoes), true);
    assert.equal(canUserManageIntegrations(gestorViewIntegracoes), false);
    assert.equal(canUserAccessConfig(gestorViewIntegracoes), true);

    // Gestor com permissão de edição em gerenciar_integracoes pode visualizar e disparar
    const gestorEditIntegracoes = {
      role: "gestor",
      cargo: "Gestor de Tráfego",
      permissions: { dashboard: "edit", gerenciar_integracoes: "edit" },
    };
    assert.equal(canUserViewIntegrations(gestorEditIntegracoes), true);
    assert.equal(canUserManageIntegrations(gestorEditIntegracoes), true);
    assert.equal(canUserAccessConfig(gestorEditIntegracoes), true);

    // Catálogo padrão de cargos mantém gerenciar_integracoes restrito por padrão fora de Administrador/CEO
    assert.equal(getCargoDefinition("Administrador")?.defaultPermissions.gerenciar_integracoes, "edit");
    assert.equal(getCargoDefinition("CEO")?.defaultPermissions.gerenciar_integracoes, "edit");
    assert.equal(getCargoDefinition("Diretor")?.defaultPermissions.gerenciar_integracoes, "none");
    assert.equal(getCargoDefinition("Gerente")?.defaultPermissions.gerenciar_integracoes, "none");
    assert.equal(getCargoDefinition("Gestor de Tráfego")?.defaultPermissions.gerenciar_integracoes, "none");
    assert.equal(getCargoDefinition("Social Media")?.defaultPermissions.gerenciar_integracoes, "none");
    assert.equal(getCargoDefinition("Designer")?.defaultPermissions.gerenciar_integracoes, "none");
  });

  it("2. Spinner da barra superior: gira só durante execução ativa confirmada e nunca durante carregamento de tela ou após expiração", () => {
    const nowMs = Date.parse("2026-11-14T20:00:00.000Z");

    // Execução remota ativa dentro do TTL => gira com texto acessível
    const runningState = resolveHeaderSpinnerState({
      latestSyncRun: {
        id: "run-1",
        status: "running",
        started_at: "2026-11-14T19:59:00.000Z",
        heartbeat_at: "2026-11-14T19:59:50.000Z",
      },
      localLock: null,
      isPageLoading: false,
      nowMs,
    });
    assert.equal(runningState.showSpinner, true);
    assert.equal(runningState.ariaLabel, "Sincronização em andamento");

    // Lock local ativo dentro do TTL (mesmo antes de linha remota aparecer) => gira
    const localLockState = resolveHeaderSpinnerState({
      latestSyncRun: null,
      localLock: {
        isSyncing: true,
        startedAt: "2026-11-14T19:59:30.000Z",
        heartbeatAt: "2026-11-14T19:59:55.000Z",
      },
      nowMs,
    });
    assert.equal(localLockState.showSpinner, true);

    // Carregamento normal de tela (React Query loading/fetching) => NÃO gira
    const pageLoadState = resolveHeaderSpinnerState({
      latestSyncRun: {
        id: "run-done",
        status: "success",
        started_at: "2026-11-14T19:50:00.000Z",
        completed_at: "2026-11-14T19:51:00.000Z",
      },
      localLock: null,
      isPageLoading: true,
      nowMs,
    });
    assert.equal(pageLoadState.showSpinner, false);
    assert.equal(pageLoadState.ariaLabel, null);

    // Lock remoto expirado (zumbi além de TTL) => timeout visual encerra spinner
    const expiredRemoteState = resolveHeaderSpinnerState({
      latestSyncRun: {
        id: "run-zombie",
        status: "running",
        started_at: new Date(nowMs - DEFAULT_REMOTE_JOB_LOCK_TTL_MS - 30_000).toISOString(),
        heartbeat_at: new Date(nowMs - DEFAULT_REMOTE_JOB_LOCK_TTL_MS - 1_000).toISOString(),
      },
      localLock: null,
      isMetaSyncRunning: true,
      nowMs,
    });
    assert.equal(expiredRemoteState.showSpinner, false);

    // Lock local expirado além do TTL => timeout visual encerra spinner
    const expiredLocalState = resolveHeaderSpinnerState({
      latestSyncRun: null,
      localLock: {
        isSyncing: true,
        startedAt: new Date(nowMs - DEFAULT_LOCAL_SYNC_LOCK_TTL_MS - 10_000).toISOString(),
        heartbeatAt: new Date(nowMs - DEFAULT_LOCAL_SYNC_LOCK_TTL_MS - 1_000).toISOString(),
      },
      nowMs,
    });
    assert.equal(expiredLocalState.showSpinner, false);

    // Estados terminais (completed, success, partial_success, error, rate_limit/failed) => NÃO gira
    for (const status of ["completed", "success", "partial_success", "error", "failed", "timeout"]) {
      const terminal = resolveHeaderSpinnerState({
        latestSyncRun: {
          id: `run-${status}`,
          status,
          started_at: "2026-11-14T19:50:00.000Z",
          completed_at: "2026-11-14T19:51:00.000Z",
          error_message: status === "error" ? "Rate limit atingido" : null,
        },
        localLock: null,
        nowMs,
      });
      assert.equal(terminal.showSpinner, false, `Status terminal ${status} não deve girar spinner`);
    }
  });

  it("3. Cálculo de duração de execução formata segundos, minutos e fallback indisponível", () => {
    assert.equal(
      formatSyncDuration("2026-11-14T19:50:00.000Z", "2026-11-14T19:50:42.000Z"),
      "42s"
    );
    assert.equal(
      formatSyncDuration("2026-11-14T19:49:42.000Z", "2026-11-14T19:51:34.000Z"),
      "1m 52s"
    );
    assert.equal(
      formatSyncDuration("2026-11-14T18:00:00.000Z", "2026-11-14T19:05:00.000Z"),
      "1h 05m"
    );
    assert.equal(formatSyncDuration(null, "2026-11-14T19:51:00.000Z"), "Horário indisponível");
    assert.equal(
      formatSyncDuration("2026-11-14T19:55:00.000Z", "2026-11-14T19:50:00.000Z"),
      "Horário indisponível"
    );
  });

  it("4. Páginas de trabalho não expõem faixas, badges, snapshot IDs ou botões técnicos de sincronização", () => {
    const workingRoutes = [
      "src/routes/_app/dashboard.tsx",
      "src/routes/_app/metricas.tsx",
      "src/routes/_app/relatorios.tsx",
      "src/routes/_app/cockpit.tsx",
      "src/routes/_app/auditoria.tsx",
      "src/routes/_app/cobrancas.tsx",
      "src/routes/_app/simulador.tsx",
      "src/routes/_app/victoria.tsx",
      "src/routes/_app/automacoes.tsx",
      "src/routes/_app/social-insights.tsx",
      "src/routes/_app/regras.tsx",
    ];

    const forbiddenPatterns = [
      "SnapshotStatusBadge",
      "Sincronização Meta em andamento",
      "Exibindo snapshot anterior",
      "Re-sincronizar Período",
      "Forçar Sincronização Total",
      "VALIDANDO CONEXÃO META",
      "social-manual-sync-btn",
      "social-state-machine-panel",
      "Último sync:",
    ];

    for (const file of workingRoutes) {
      const content = readWorkspaceFile(file);
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          content.includes(pattern),
          false,
          `Vazamento técnico '${pattern}' encontrado em página de trabalho: ${file}`
        );
      }
    }

    const floatingChat = readWorkspaceFile("src/components/victoria/VictoriaFloatingChat.tsx");
    assert.equal(floatingChat.includes("Snapshot Sync:"), false);
  });

  it("5. Topbar, ações cliente e Edge Function garantem isolamento de acesso e autorização de ponta a ponta", () => {
    const appShell = readWorkspaceFile("src/routes/_app.tsx");
    assert.equal(appShell.includes('aria-label="Sincronizar contas Meta Ads"'), false);
    assert.equal(appShell.includes("Sincronizar Meta"), false);
    assert.ok(appShell.includes("resolveHeaderSpinnerState"));
    assert.ok(appShell.includes("Sincronização em andamento"));
    assert.ok(appShell.includes('pathname.startsWith("/integrations")'));
    assert.ok(appShell.includes("useAutoSync({ enabled: canManageIntegrations })"));

    const syncButton = readWorkspaceFile("src/components/SyncButton.tsx");
    assert.ok(syncButton.includes("canManageIntegrations"));
    assert.equal(syncButton.includes('hasAccess("metricas")'), false);

    const autoSync = readWorkspaceFile("src/hooks/useAutoSync.ts");
    assert.ok(autoSync.includes("if (!enabledRef.current)"));

    const configPage = readWorkspaceFile("src/routes/_app/config.tsx");
    assert.ok(configPage.includes("Integrações & Sincronização"));
    assert.ok(configPage.includes("canViewIntegrations"));
    assert.ok(configPage.includes("canManageIntegrations"));

    const integrationsPage = readWorkspaceFile("src/routes/_app/integrations.tsx");
    assert.ok(integrationsPage.includes("canViewIntegrations"));
    assert.ok(integrationsPage.includes("canManageIntegrations"));
    assert.ok(integrationsPage.includes("TabIntegracoes"));

    const edgeSync = readWorkspaceFile("supabase/functions/sync-meta-ads/index.ts");
    assert.ok(edgeSync.includes("if (errorResponse) return errorResponse;"));
    assert.ok(edgeSync.includes("FORBIDDEN_INTEGRATION_SYNC"));
    assert.ok(edgeSync.includes("isServiceRole"));
    assert.ok(edgeSync.includes("status: 401"));
    assert.ok(edgeSync.includes("status: 403"));
  });
});
