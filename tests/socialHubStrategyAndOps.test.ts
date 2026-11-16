import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { RealSocialAccount, RealSocialPost, PlannerPost } from "../src/lib/metaSocialService.ts";
import {
  appendContentHistory,
  assertStrategyBelongsToAccount,
  buildConsolidatedScopeSummary,
  buildEmptyAccountStrategy,
  buildOverviewCommandCenter,
  canTransitionContentStage,
  classifySocialAccount,
  CONTENT_PIPELINE_STAGES,
  createTaskPayloadFromRecommendation,
  detectUnconfirmedCommercialClaims,
  evaluateStrategyReadiness,
  formatHumanSyncStatus,
  getActiveSocialNavGroup,
  isSocialHubRoute,
  requiresExplicitAccountForAction,
  resolveMetricDisplayState,
  SOCIAL_HUB_NAV_GROUPS,
  stripUnfoundedGrowthPromises,
  synthesizeStructuredScript,
  validateExperimentConclusion,
  type SocialContentItem,
  type SocialProjectTask,
} from "../src/lib/socialStrategyDomain.ts";

// Matriz exata das 22 contas reais em public.social_pages
const mkAcc = (
  page_id: string,
  page_name: string,
  instagram_account_id: string | null,
  instagram_handle: string | null,
  facebook_followers: number,
  instagram_followers: number
): RealSocialAccount => ({
  page_id,
  page_name,
  access_token: "",
  facebook_followers,
  instagram_account_id,
  instagram_handle,
  instagram_followers,
});

const ALL_22_ACCOUNTS: RealSocialAccount[] = [
  mkAcc("1347708785083374", "AlfaCar Rj", "17841", "alfacarrj", 1200, 3400),
  mkAcc("644700368736850", "Alug Motos Brasil", null, null, 800, 0),
  mkAcc("1160933457110526", "Barbearia A Mídia", "17842", "marcelosilvatrevao", 400, 950),
  mkAcc("1326779710520511", "Br Sound", "17843", "br_sound01", 510, 1800),
  mkAcc("1514133441772310", "Colégio Nova Geração", null, null, 1400, 0),
  mkAcc("853694117831515", "EloCar Multimarcas", "17844", "elocarmultimarcasrj", 900, 2300),
  mkAcc("977422762115184", "Falcão Veiculos e motos", "17845", "_falcaoveiculos", 650, 1900),
  mkAcc("278181322035892", "Fly Garage", "17846", "flygaragebarra", 720, 4200),
  mkAcc("1364799533379567", "Gt Motors Barra", "17847", "gtmotorsbarra_", 500, 3100),
  mkAcc("109546498577020", "Linear Instalações", "17848", "rj.linear", 300, 820),
  mkAcc("217485732472027", "Lucas Lima", "17849", "lucaslima167", 250, 1100),
  mkAcc("381260795398048", "Luma Car", "17850", "lumacar.veiculos", 600, 2100),
  mkAcc("104337142219068", "Montana_veículos", "17851", "montanaveiculos630", 780, 1650),
  mkAcc("1217373498136614", "Move Aluguel", "17852", "move.aluguel", 320, 1200),
  mkAcc("792950513897478", "MVM Brasil Benefícios", "17853", "mvmbrasilbeneficios", 0, 0),
  mkAcc("1336695356195622", "Nc Agencia - Marketing Digital", "17854", "ncagencia", 410, 2900),
  mkAcc("104756548811921", "Pizzaria Bonne21", "17855", "pizzariabonne21", 540, 2500),
  mkAcc("658495467348235", "R.car automóveis", "17856", "r.car_automoveis", 680, 1950),
  mkAcc("1343772638823942", "Rio Automóveis ", "17857", "rioautomoveis_br", 730, 2700),
  mkAcc("101835969336732", "Sandro Car", "17858", "sandrocarrj", 590, 1450),
  mkAcc("995733106951096", "Sarf Engenharia", "17859", "sarf_engenharia_", 210, 690),
  mkAcc("107442020638841", "Super Fast Veículos", "17860", "superfastveiculos", 840, 3800),
];

describe("Social Hub Evolution — Navegação, Contas, IA, Pipeline e Operação", () => {
  it("1. Arquitetura de navegação organiza 6 blocos e preserva todas as rotas existentes", () => {
    assert.equal(SOCIAL_HUB_NAV_GROUPS.length, 6);
    assert.deepEqual(
      SOCIAL_HUB_NAV_GROUPS.map((g) => g.label),
      ["Visão Geral", "Estratégia", "Conteúdo", "Inteligência", "Projetos", "Ferramentas"]
    );

    // Preservação das URLs existentes no módulo Social
    const legacyAndNewRoutes = [
      "/social-hub",
      "/social-estrategia",
      "/social-conteudo",
      "/social",
      "/social-insights",
      "/social-audit",
      "/social-testes",
      "/social-projetos",
      "/link-bio",
      "/formulario",
      "/quiz",
      "/organizador",
    ];
    for (const r of legacyAndNewRoutes) {
      assert.equal(isSocialHubRoute(r), true, `Rota ${r} deve pertencer ao módulo Social`);
    }

    assert.equal(getActiveSocialNavGroup("/social-hub"), "visao_geral");
    assert.equal(getActiveSocialNavGroup("/social-estrategia"), "estrategia");
    assert.equal(getActiveSocialNavGroup("/social-conteudo"), "conteudo");
    assert.equal(getActiveSocialNavGroup("/social"), "conteudo");
    assert.equal(getActiveSocialNavGroup("/social-insights"), "inteligencia");
    assert.equal(getActiveSocialNavGroup("/social-audit"), "inteligencia");
    assert.equal(getActiveSocialNavGroup("/social-testes"), "inteligencia");
    assert.equal(getActiveSocialNavGroup("/social-projetos"), "projetos");
    assert.equal(getActiveSocialNavGroup("/link-bio"), "ferramentas");
    assert.equal(getActiveSocialNavGroup("/formulario"), "ferramentas");
    assert.equal(getActiveSocialNavGroup("/quiz"), "ferramentas");
  });

  it("2. Matriz das 22 contas classifica corretamente IG+FB, Somente FB, MVM restrita e automotivas", () => {
    assert.equal(ALL_22_ACCOUNTS.length, 22);
    const classified = ALL_22_ACCOUNTS.map((a) => classifySocialAccount(a));

    const fbOnly = classified.filter((c) => c.networkCapability === "fb_only");
    assert.deepEqual(
      fbOnly.map((c) => c.name).sort(),
      ["Alug Motos Brasil", "Colégio Nova Geração"]
    );

    const mvm = classified.find((c) => c.pageId === "792950513897478");
    assert.ok(mvm?.isMvmRestrictedCase);

    const automotiveCount = classified.filter((c) => c.isAutomotive).length;
    assert.equal(automotiveCount, 13, "13 contas automotivas devem receber trava comercial rígida");

    // Nenhuma conta Somente FB recebe número falso em métrica exclusiva de Instagram
    for (const acc of fbOnly) {
      const igMetric = resolveMetricDisplayState({
        rawValue: 0,
        isInstagramExclusive: true,
        accountClassification: acc,
        sectionState: "success",
      });
      assert.equal(igMetric.displayText, "N/A");
      assert.equal(igMetric.visualState, "unavailable_fb_only");
      assert.equal(igMetric.numericValue, null);
    }
  });

  it("3. Estados de loading, permission_denied, rate_limited, error, indisponível e zero real são estritamente distintos", () => {
    const loading = resolveMetricDisplayState({ rawValue: 0, isLoading: true });
    assert.equal(loading.visualState, "loading");
    assert.notEqual(loading.displayText, "0");

    const permDenied = resolveMetricDisplayState({
      rawValue: 0,
      sectionState: "permission_denied",
    });
    assert.equal(permDenied.visualState, "permission_denied");
    assert.equal(permDenied.numericValue, null);
    assert.notEqual(permDenied.displayText, "0");

    const rateLimited = resolveMetricDisplayState({
      rawValue: 0,
      sectionState: "rate_limited",
    });
    assert.equal(rateLimited.visualState, "rate_limited");
    assert.equal(rateLimited.numericValue, null);

    const errored = resolveMetricDisplayState({
      rawValue: 0,
      sectionState: "error",
    });
    assert.equal(errored.visualState, "error");
    assert.equal(errored.numericValue, null);

    const realZero = resolveMetricDisplayState({
      rawValue: 0,
      sectionState: "success",
      fieldAvailability: "available",
    });
    assert.equal(realZero.visualState, "available");
    assert.equal(realZero.numericValue, 0);
    assert.equal(realZero.displayText, "0");
  });

  it("4. Consolidação explicita escopo e exige conta específica para estratégia, ideia e roteiro", () => {
    const restricted = new Map<string, string>([
      ["792950513897478", "Permissão insuficiente na Meta (fora do fluxo operacional)"],
    ]);
    const consolidated = buildConsolidatedScopeSummary({
      selectedPage: "all",
      targetAccounts: ALL_22_ACCOUNTS.slice(0, 6),
      allAccounts: ALL_22_ACCOUNTS,
      restrictedAccountMessages: restricted,
    });
    assert.equal(consolidated.isConsolidated, true);
    assert.equal(consolidated.includedAccounts.length, 6);
    assert.ok(consolidated.fbOnlyNames.includes("Alug Motos Brasil"));
    assert.ok(consolidated.comparableWarning);
    assert.ok(
      consolidated.excludedOrLimitedNotes.some((n) => n.includes("MVM Brasil Benefícios"))
    );

    assert.equal(requiresExplicitAccountForAction("all", "strategy").allowed, false);
    assert.equal(requiresExplicitAccountForAction("all", "script").allowed, false);
    assert.equal(requiresExplicitAccountForAction("1347708785083374", "strategy").allowed, true);
  });

  it("5. Estratégia isolada por conta + proteção anti-fabricação automotiva e 3 camadas na IA", () => {
    const alfacar = ALL_22_ACCOUNTS[0];
    const strategy = buildEmptyAccountStrategy(alfacar);
    assert.equal(strategy.is_automotive, true);
    assert.equal(assertStrategyBelongsToAccount(strategy, alfacar.page_id), true);
    assert.equal(assertStrategyBelongsToAccount(strategy, "644700368736850"), false);

    // Verifica que concorrente sem origem/data gera aviso na estratégia
    strategy.primary_objective = "Gerar mensagens no WhatsApp";
    strategy.editorial_pillars = ["Oferta confirmada"];
    strategy.competitors = [
      { name: "Loja X", handleOrUrl: "@lojax", source: "", observedAt: "", notes: "" },
    ];
    const readiness = evaluateStrategyReadiness(strategy);
    assert.ok(readiness.validationWarnings.some((w) => w.includes("origem e data")));

    // Detecção de preço/km/parcela não confirmados em texto
    const flagged = detectUnconfirmedCommercialClaims(
      "Leve hoje por R$ 58.900 com apenas 32.000 km e parcela fixa de R$ 990!",
      strategy
    );
    assert.ok(flagged.includes("preço ou valor em reais"));
    assert.ok(flagged.includes("quilometragem"));

    // Geração estruturada em 3 camadas remove promessa de viralização e sinaliza pendências automotivas
    const sanitizedPromise = stripUnfoundedGrowthPromises(
      "Esse Reels vai viralizar com 100% de alcance e crescimento garantido!"
    );
    assert.equal(/viraliza|crescimento garantido/i.test(sanitizedPromise), false);

    const draft = synthesizeStructuredScript({
      account: classifySocialAccount(alfacar, strategy),
      strategy,
      pillar: "Critérios de compra",
      objective: "Mensagens no WhatsApp",
      audienceSegment: "Troca com usado",
      format: "Reels",
      originInsight: "Clientes perguntam sobre vistoria cautelar",
      hypothesis: "Explicar vistoria aumenta contatos qualificados",
      periodLabel: "2026-11-01 a 2026-11-15",
      cachedKpisSummary: "Alcance IG: 12.400 | Interações: 420",
      topPostTitles: ["Como avaliamos cada carro antes de ir ao pátio"],
    });

    assert.ok(draft.grounding.factsUsed.length >= 3);
    assert.ok(draft.grounding.interpretation.length > 10);
    assert.ok(draft.grounding.creativeHypothesis.length > 10);
    assert.ok(
      draft.grounding.pendingConfirmations.some((p) =>
        p.includes("preço exato, ano/modelo, versão, quilometragem")
      )
    );
  });

  it("6. Pipeline de 8 estágios respeita permissões, auditoria e guardrails de testes orgânicos", () => {
    assert.equal(CONTENT_PIPELINE_STAGES.length, 8);
    assert.equal(
      canTransitionContentStage({
        fromStage: "idea",
        toStage: "briefing",
        canEditSocial: false,
      }).allowed,
      false
    );
    assert.equal(
      canTransitionContentStage({
        fromStage: "client_approval",
        toStage: "published",
        canEditSocial: true,
        isApproverOrAdmin: false,
      }).allowed,
      false
    );
    assert.equal(
      canTransitionContentStage({
        fromStage: "client_approval",
        toStage: "scheduled",
        canEditSocial: true,
        isApproverOrAdmin: true,
      }).allowed,
      true
    );

    const hist = appendContentHistory([], {
      actorName: "Henrique",
      action: "Movido para Aprovação",
      fromStage: "internal_review",
      toStage: "client_approval",
    });
    assert.equal(hist.length, 1);
    assert.equal(hist[0].toStage, "client_approval");

    // Guardrail de amostra insuficiente em experimentos orgânicos
    const blockedExp = validateExperimentConclusion({
      conclusionStatus: "validated",
      sampleCount: 2,
      primaryVariable: "Gancho nos primeiros 3s",
      closureCriteria: "Mínimo 4 posts publicados por variação em 14 dias",
    });
    assert.equal(blockedExp.normalizedStatus, "insufficient_sample");

    const okExp = validateExperimentConclusion({
      conclusionStatus: "validated",
      sampleCount: 5,
      primaryVariable: "Gancho nos primeiros 3s",
      closureCriteria: "Mínimo 4 posts publicados por variação em 14 dias",
    });
    assert.equal(okExp.normalizedStatus, "validated");
    assert.ok(okExp.warning?.includes("direcional"));
  });

  it("7. Visão Geral consolida prioridades diárias, semana e converte recomendação em tarefa", () => {
    const strategy = {
      ...buildEmptyAccountStrategy(ALL_22_ACCOUNTS[0]),
      primary_objective: "Gerar mensagens",
      editorial_pillars: ["Oferta confirmada", "Bastidores"],
    };
    const tasks: SocialProjectTask[] = [
      {
        id: "t1",
        page_id: ALL_22_ACCOUNTS[0].page_id,
        account_name: "AlfaCar Rj",
        title: "Revisar legenda da entrega",
        description: "",
        task_type: "revisao",
        priority: "alta",
        status: "todo",
        assignee_name: "Marina",
        due_at: "2026-11-10T18:00:00.000Z",
        source_type: "manual",
        tags: [],
        history: [],
        created_at: "2026-11-01T10:00:00.000Z",
        updated_at: "2026-11-01T10:00:00.000Z",
      },
    ];
    const contents: SocialContentItem[] = [
      {
        id: "c1",
        page_id: ALL_22_ACCOUNTS[0].page_id,
        account_name: "AlfaCar Rj",
        title: "Reels Entrega Semana",
        stage: "client_approval",
        format: "Reels",
        platform: "instagram",
        objective: "Prova social",
        editorial_pillar: "Oferta confirmada",
        audience_segment: "",
        origin_insight: "",
        hypothesis: "",
        priority: "alta",
        effort: "medio",
        hook_variations: [],
        script_scenes: [],
        shot_list: [],
        on_screen_text: "",
        caption: "",
        cta: "",
        cover_suggestion: "",
        brief_notes: "",
        related_materials: [],
        ai_grounding: null,
        assignee_name: "Marina",
        approver_name: "Cliente",
        due_at: "2026-11-16T18:00:00.000Z",
        comments: [],
        history: [],
        created_at: "2026-11-14T10:00:00.000Z",
        updated_at: "2026-11-14T10:00:00.000Z",
      },
    ];
    const posts: RealSocialPost[] = [
      {
        id: "p1",
        accountName: "AlfaCar Rj",
        accountHandle: "@alfacarrj",
        title: "Bastidores da preparação técnica",
        content: "Bastidores da preparação técnica antes da entrega",
        post_type: "reels",
        platform: "instagram",
        likes_count: 90,
        comments_count: 14,
        shares_count: 8,
        saved_count: 12,
        reach_count: 2400,
        views_count: 3000,
        total_interactions: 124,
        engagement_rate: 5.1,
        media_url: null,
        thumbnail_url: null,
        permalink: "https://instagram.com/p/123",
        published_at: "2026-11-12T15:00:00.000Z",
        ai_sentiment: "positivo",
        ai_recommendation: "",
      },
      {
        id: "p2",
        accountName: "AlfaCar Rj",
        accountHandle: "@alfacarrj",
        title: "Foto institucional",
        content: "Foto institucional de fachada",
        post_type: "image",
        platform: "instagram",
        likes_count: 10,
        comments_count: 1,
        shares_count: 0,
        saved_count: 0,
        reach_count: 450,
        views_count: 500,
        total_interactions: 11,
        engagement_rate: 2.4,
        media_url: null,
        thumbnail_url: null,
        permalink: "https://instagram.com/p/456",
        published_at: "2026-11-10T15:00:00.000Z",
        ai_sentiment: "neutro",
        ai_recommendation: "",
      },
    ];
    const plannerPosts: PlannerPost[] = [];

    const overview = buildOverviewCommandCenter({
      selectedPage: ALL_22_ACCOUNTS[0].page_id,
      accountName: "AlfaCar Rj",
      strategy,
      tasks,
      contentItems: contents,
      plannerPosts,
      recentPosts: posts,
      periodLabel: "2026-11-01 a 2026-11-15",
      now: new Date("2026-11-15T12:00:00.000Z"),
    });

    assert.equal(overview.todayPriorities.overdueTasks.length, 1);
    assert.equal(overview.todayPriorities.awaitingApprovalContent.length, 1);
    assert.deepEqual(overview.weekSummary.pillarGaps, ["Bastidores"]);
    assert.equal(overview.performanceSignals.highlights.length, 2);
    assert.ok(overview.performanceSignals.recommendations.length >= 1);

    const taskFromRec = createTaskPayloadFromRecommendation({
      recommendation: overview.performanceSignals.recommendations[0],
      assigneeName: "Marina",
    });
    assert.equal(taskFromRec.source_type, "recommendation");
    assert.equal(taskFromRec.page_id, ALL_22_ACCOUNTS[0].page_id);
    assert.equal(taskFromRec.assignee_name, "Marina");
  });

  it("8. Componentes novos não vazam textos técnicos proibidos nem misturam UX de sync interno", () => {
    const human = formatHumanSyncStatus({
      isLoading: false,
      isFetching: false,
      dataState: "success",
      snapshotAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    });
    assert.ok(human.label.includes("Dados atualizados"));

    const files = [
      "src/components/social/SocialHubChrome.tsx",
      "src/routes/_app/social-hub.tsx",
      "src/routes/_app/social-estrategia.tsx",
      "src/routes/_app/social-conteudo.tsx",
      "src/routes/_app/social-testes.tsx",
      "src/routes/_app/social-projetos.tsx",
    ];
    const forbidden = [
      "SnapshotStatusBadge",
      "social-manual-sync-btn",
      "social-state-machine-panel",
      "Último sync:",
      "Re-sincronizar Período",
      "Forçar Sincronização Total",
    ];
    for (const f of files) {
      const text = fs.readFileSync(path.join(process.cwd(), f), "utf8");
      for (const pat of forbidden) {
        assert.equal(text.includes(pat), false, `${f} não deve conter '${pat}'`);
      }
    }
    const edgeSyncSocial = fs.readFileSync(
      path.join(process.cwd(), "supabase/functions/sync-social-media/index.ts"),
      "utf8"
    );
    assert.ok(edgeSyncSocial.includes('if (action === "delete-post")'));
    assert.ok(edgeSyncSocial.includes("unsupportedByMetaApi: true"));

    const socialRoute = fs.readFileSync(
      path.join(process.cwd(), "src/routes/_app/social.tsx"),
      "utf8"
    );
    assert.ok(socialRoute.includes("deleteMetaPostViaEdge"));
    assert.ok(socialRoute.includes("Excluir do Facebook"));
  });
});
