import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVictoriaAnalysisContext,
  extractUserTargetFromPrompt,
  generateQuickExecutiveAnalysis,
  hasAllMandatory10Sections,
  resolveVictoriaResponseMode,
  stripTechnicalArtifactsForQuickMode,
  enforceVictoriaPostLlmGuardrails,
  VictoriaSessionController,
} from "../src/lib/victoriaContract.ts";

import {
  buildContextFromMetricasItem,
  executeGovernedVictoriaDiagnostic,
} from "../src/lib/victoriaContextGateway.ts";

import {
  resolveServerRequireFull10Sections,
  extractServerUserTarget,
  stripTechnicalArtifactsServerQuick,
  generateQuickExecutiveAnalysisServer,
  enforceServerPostLlmGuardrails,
} from "../supabase/functions/_shared/victoriaCore.ts";

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function assertNoTechnicalLeaks(text: string) {
  assert.equal(/onsite_conversion|offsite_conversion/i.test(text), false, "Não pode expor evento interno da API");
  assert.equal(/\bactions:[a-z0-9_.]+/i.test(text), false, "Não pode expor actions:*");
  assert.equal(/\b(ctx_|vreq_)[a-z0-9_]+/i.test(text), false, "Não pode expor request_id/context_id");
  assert.equal(/\bact_\d+\b/i.test(text), false, "Não pode expor ad_account_id act_*");
  assert.equal(/\b2026\.11\.\d+/i.test(text), false, "Não pode expor versão de contrato/prompt");
  assert.equal(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), false, "Não pode expor UUID");
  assert.equal(/\b(meta_insights_snapshot|asset_metrics|victoria_knowledge)\b/i.test(text), false, "Não pode expor nome de tabela");
}

test("Caso obrigatório R$ 5: análise rápida de anúncio de mensagens por 7 dias sem mídia nem CRM", () => {
  const userPrompt =
    "Analise este anúncio nos últimos 7 dias: esse criativo está bom? O que devo mudar para conseguir conversas abaixo de R$ 5?";
  const target = extractUserTargetFromPrompt(userPrompt);
  assert.ok(target);
  assert.equal(target.amount, 5);

  const ctx = buildContextFromMetricasItem({
    item: {
      id: "120299887766554433",
      external_id: "120299887766554433",
      name: "Anúncio SUV Pátio - Conversa Direta",
      entityLevel: "ad",
      status: "ACTIVE",
      ad_account_id: "act_243135681723027",
      adAccountName: "NC - Rio 2 Veículos",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      resultIndicator: "actions:onsite_conversion.messaging_conversation_started_7d",
      cost: 281.2,
      conversions: 43,
      impressions: 12517,
      reach: 11787,
      link_clicks: 139,
      clicks: 435,
      frequency: 1.06,
      last_sync_at: "2026-11-15T18:00:00Z",
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_243135681723027",
    accountName: "NC - Rio 2 Veículos",
    dateFrom: "2026-11-09",
    dateTo: "2026-11-15",
    sameObjectiveAvgCost: 8.43,
    comparablePeerCount: 5,
    userPrompt,
    ragDocuments: [
      {
        id: "550e8400-e29b-41d4-a716-446655440000",
        title: "Playbook WhatsApp Automotivo",
        evidence_level: "INTERNAL_RULE",
        approval_status: "APPROVED",
        version: "1.0",
        source: "Base NC",
      },
    ],
  });

  assert.equal(ctx.creative.has_media, false);
  assert.equal(ctx.user_target?.amount, 5);

  const output = generateQuickExecutiveAnalysis(ctx, { userPrompt });
  const words = countWords(output);
  assert.ok(words >= 100 && words <= 240, `Esperado ~120-200 palavras, recebido ${words}:\n${output}`);

  assert.equal(hasAllMandatory10Sections(output), false, "Modo rápido não pode impor 10 seções");
  assert.ok(output.includes("1. Veredito"));
  assert.ok(output.includes("2. Resultado principal"));
  assert.ok(output.includes("3. Leitura do funil"));
  assert.ok(output.includes("4. O que fazer agora"));
  assert.ok(output.includes("5. Como validar"));

  assert.ok(output.includes("281,20"));
  assert.ok(output.includes("43"));
  assert.ok(output.includes("6,54"));
  assert.ok(output.includes("1,54"), "Deve informar R$ 1,54 acima da meta de R$ 5");
  assert.ok(output.includes("8,43"), "Deve comparar com referência comparável de R$ 8,43");
  assert.ok(output.includes("139"));
  assert.ok(output.includes("1,11%"));
  assert.ok(output.includes("2,02"));
  assert.ok(output.includes("435"));
  assert.ok(output.includes("31%"), "Deve citar relação observada (~31%) sem causalidade");
  assert.ok(output.includes("1,06") && output.includes("satura"));
  assert.ok(
    output.includes(
      "Consegui analisar os resultados, mas não tive acesso à imagem ou ao vídeo para avaliar o criativo visualmente."
    ),
    "Deve declarar honestamente ausência de mídia visual"
  );
  assert.ok(/CRM/i.test(output), "Deve citar impossibilidade de validar qualidade comercial sem CRM");
  assert.ok(/uma vari[aá]vel|varia[çc][õo]es/i.test(output), "Deve orientar teste controlado de 1 variável");
  assert.equal(/esperar\s+3\s+a\s+7\s+dias/i.test(output), false);
  assert.equal(/garant[ie]|com\s+certeza/i.test(output), false);
  assert.equal(output.includes("120299887766554433"), false, "Não pode expor ID do anúncio");
  assert.equal(output.includes(ctx.analysis_context_hash), false, "Não pode expor hash de contexto");
  assertNoTechnicalLeaks(output);

  // Paridade com versão server-side
  const serverOutput = generateQuickExecutiveAnalysisServer(ctx, userPrompt);
  assert.ok(serverOutput.includes("6,54") && serverOutput.includes("8,43"));
  assertNoTechnicalLeaks(serverOutput);
});

test("Cobertura multi-objetivo e multi-nível (campaign, adset, ad) preserva unidade oficial sem mistura", () => {
  const cases = [
    {
      level: "campaign" as const,
      objective: "OUTCOME_AWARENESS",
      goal: "REACH",
      resultType: "REACH",
      spend: 150,
      results: 25000,
      impressions: 34000,
      reach: 25000,
      linkClicks: 90,
      allClicks: 140,
      expectedToken: "pessoas alcançadas",
      forbiddenToken: "CPL",
    },
    {
      level: "adset" as const,
      objective: "OUTCOME_TRAFFIC",
      goal: "LANDING_PAGE_VIEWS",
      resultType: "LANDING_PAGE_VIEWS",
      spend: 180,
      results: 120,
      impressions: 8000,
      reach: 6200,
      linkClicks: 160,
      allClicks: 210,
      expectedToken: "visualiza",
      forbiddenToken: "Custo por conversa",
    },
    {
      level: "campaign" as const,
      objective: "OUTCOME_SALES",
      goal: "OFFSITE_CONVERSIONS",
      resultType: "PURCHASES",
      spend: 400,
      results: 8,
      purchaseValue: 3200,
      impressions: 9500,
      reach: 7100,
      linkClicks: 180,
      allClicks: 240,
      expectedToken: "ROAS",
      forbiddenToken: "Custo por 1.000",
    },
    {
      level: "ad" as const,
      objective: "OUTCOME_LEADS",
      goal: "LEAD_GENERATION",
      resultType: "LEADS",
      spend: 220,
      results: 22,
      impressions: 6000,
      reach: 5100,
      linkClicks: 95,
      allClicks: 130,
      expectedToken: "CPL",
      forbiddenToken: "ROAS",
    },
    {
      level: "adset" as const,
      objective: "OUTCOME_ENGAGEMENT",
      goal: "POST_ENGAGEMENT",
      resultType: "ENGAGEMENT",
      spend: 90,
      results: 300,
      impressions: 5400,
      reach: 4500,
      linkClicks: 45,
      allClicks: 310,
      expectedToken: "engajamentos",
      forbiddenToken: "CPL",
    },
  ];

  for (const c of cases) {
    const ctx = buildContextFromMetricasItem({
      item: {
        id: `ent_${c.level}_${c.resultType}`,
        external_id: `ent_${c.level}_${c.resultType}`,
        name: `Entidade ${c.resultType}`,
        entityLevel: c.level,
        status: "ACTIVE",
        ad_account_id: "act_1001",
        adAccountName: "Conta Teste",
        rawObjective: c.objective,
        optimizationGoal: c.goal,
        resultType: c.resultType,
        cost: c.spend,
        conversions: c.results,
        purchaseValue: (c as any).purchaseValue || 0,
        impressions: c.impressions,
        reach: c.reach,
        link_clicks: c.linkClicks,
        clicks: c.allClicks,
        frequency: c.impressions / c.reach,
      },
      surface: "metricas",
      route: "/metricas",
      accountId: "act_1001",
      accountName: "Conta Teste",
      dateFrom: "2026-11-09",
      dateTo: "2026-11-15",
    });

    const txt = generateQuickExecutiveAnalysis(ctx);
    assert.ok(
      txt.toLowerCase().includes(c.expectedToken.toLowerCase()),
      `Objetivo ${c.resultType} deveria conter "${c.expectedToken}" em:\n${txt}`
    );
    assert.equal(
      txt.toLowerCase().includes(c.forbiddenToken.toLowerCase()),
      false,
      `Objetivo ${c.resultType} não pode conter "${c.forbiddenToken}"`
    );
    assertNoTechnicalLeaks(txt);
  }
});

test("Metas (usuário vs configurada vs ausente), mídia acessível e casos de borda", () => {
  // 1. Sem meta, sem benchmark, MAS com mídia acessível
  const withMediaCtx = buildContextFromMetricasItem({
    item: {
      id: "ad_with_media",
      name: "Criativo Vídeo Feirão",
      entityLevel: "ad",
      ad_account_id: "act_2002",
      adAccountName: "Concessionária Sul",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 120,
      conversions: 15,
      impressions: 4200,
      reach: 3800,
      link_clicks: 84,
      clicks: 150,
      frequency: 1.11,
      creative_image_url: "https://cdn.example.com/criativo-feirao.jpg",
      creative_title: "Taxa zero no estoque 2026",
      creative_body: "Fale no WhatsApp agora e simule na hora.",
      call_to_action_type: "WHATSAPP_MESSAGE",
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_2002",
    accountName: "Concessionária Sul",
    dateFrom: "2026-11-09",
    dateTo: "2026-11-15",
  });

  assert.equal(withMediaCtx.creative.has_media, true);
  const noTargetText = generateQuickExecutiveAnalysis(withMediaCtx);
  assert.ok(noTargetText.includes("nenhuma meta definida"));
  assert.ok(noTargetText.includes("Sem referência comparável"));
  assert.equal(
    noTargetText.includes("não tive acesso à imagem ou ao vídeo"),
    false,
    "Quando mídia está acessível, não deve dizer que não teve acesso"
  );

  // 2. Meta configurada na conta apenas
  const configTargetCtx = buildContextFromMetricasItem({
    item: {
      id: "ad_cfg_target",
      name: "Criativo Seminovos",
      entityLevel: "ad",
      ad_account_id: "act_2002",
      adAccountName: "Concessionária Sul",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 150,
      conversions: 20,
      impressions: 5000,
      reach: 4500,
      link_clicks: 100,
      clicks: 160,
      frequency: 1.11,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_2002",
    accountName: "Concessionária Sul",
    dateFrom: "2026-11-09",
    dateTo: "2026-11-15",
    accountMaxCplTarget: 10,
  });
  const cfgText = generateQuickExecutiveAnalysis(configTargetCtx);
  assert.ok(cfgText.includes("meta configurada na conta") && cfgText.includes("10,00"));

  // 3. Gasto > 0 com 0 resultados -> "não calculável"
  const zeroConvCtx = buildContextFromMetricasItem({
    item: {
      id: "ad_zero_res",
      name: "Criativo Sem Conversões",
      entityLevel: "ad",
      ad_account_id: "act_2002",
      adAccountName: "Concessionária Sul",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 85,
      conversions: 0,
      impressions: 2400,
      reach: 2100,
      link_clicks: 42,
      clicks: 70,
      frequency: 1.14,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_2002",
    accountName: "Concessionária Sul",
    dateFrom: "2026-11-09",
    dateTo: "2026-11-15",
  });
  const zeroResTxt = generateQuickExecutiveAnalysis(zeroConvCtx);
  assert.ok(zeroResTxt.toLowerCase().includes("não calculável"));
  assert.equal(zeroResTxt.includes("R$ 0,00"), false);

  // 4. Amostra pequena (1 dia)
  const shortCtx = buildContextFromMetricasItem({
    item: {
      id: "ad_short",
      name: "Criativo Novo",
      entityLevel: "ad",
      ad_account_id: "act_2002",
      adAccountName: "Concessionária Sul",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 22,
      conversions: 2,
      impressions: 420,
      reach: 390,
      link_clicks: 9,
      clicks: 14,
      frequency: 1.07,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_2002",
    accountName: "Concessionária Sul",
    dateFrom: "2026-11-15",
    dateTo: "2026-11-15",
  });
  const shortTxt = generateQuickExecutiveAnalysis(shortCtx);
  assert.ok(/amostra curta/i.test(shortTxt));

  // 5. Gasto zerado
  const zeroSpendCtx = buildContextFromMetricasItem({
    item: {
      id: "ad_idle",
      name: "Criativo Pausado",
      entityLevel: "ad",
      ad_account_id: "act_2002",
      adAccountName: "Concessionária Sul",
      rawObjective: "OUTCOME_ENGAGEMENT",
      optimizationGoal: "CONVERSATIONS",
      resultType: "MESSAGES",
      cost: 0,
      conversions: 0,
      impressions: 0,
      reach: 0,
      link_clicks: 0,
      clicks: 0,
      frequency: 0,
    },
    surface: "metricas",
    route: "/metricas",
    accountId: "act_2002",
    accountName: "Concessionária Sul",
    dateFrom: "2026-11-09",
    dateTo: "2026-11-15",
  });
  assert.ok(/não houve investimento/i.test(generateQuickExecutiveAnalysis(zeroSpendCtx)));
});

test("Guardrails cliente + servidor bloqueiam vazamentos e 10 seções no modo rápido, preservando auditoria explícita", async () => {
  assert.equal(resolveVictoriaResponseMode({ userPrompt: "Esse anúncio tá bom?" }), "quick_executive");
  assert.equal(resolveVictoriaResponseMode({ userPrompt: "Quero uma auditoria completa detalhada" }), "detailed_audit");
  assert.equal(resolveServerRequireFull10Sections(undefined, "Analise esse anúncio"), false);
  assert.equal(resolveServerRequireFull10Sections(undefined, "Faça uma análise aprofundada em 10 seções"), true);
  assert.equal(extractServerUserTarget("como baixar para abaixo de R$ 5,50?")?.amount, 5.5);

  const ctx = buildVictoriaAnalysisContext({
    source_surface: "metricas",
    route: "/metricas",
    ad_account_id: "act_3003",
    ad_account_name: "Auto Center",
    entity_level: "ad",
    entity_id: "1202000111222",
    entity_name: "Oferta Troca de Óleo",
    date_from: "2026-11-09",
    date_to: "2026-11-15",
    odax_objective: "OUTCOME_ENGAGEMENT",
    optimization_goal: "CONVERSATIONS",
    result_type: "MESSAGES",
    spend: 281.2,
    conversions: 43,
    impressions: 12517,
    reach: 11787,
    link_clicks: 139,
    all_clicks: 435,
    frequency: 1.06,
    comparable_same_objective_avg: 8.43,
    user_target_amount: 5,
    user_target_raw_text: "abaixo de R$ 5",
  });

  // LLM devolve resposta rápida válida, mas com vazamentos técnicos -> guardrails limpam sem substituir
  const leakyQuickLlm = `
**1. Veredito:** Abaixo da meta de R$ 5,00, mas melhor que R$ 8,43.
**2. Resultado principal:** Investiu R$ 281,20 e gerou 43 conversas via onsite_conversion.messaging_conversation_started_7d na conta act_3003 (Contrato 2026.11.4).
**3. Leitura do funil:** CTR de link 1,11%, sem mídia acessível.
**4. O que fazer agora:** Manter ativo e testar nova abertura [550e8400-e29b-41d4-a716-446655440000].
**5. Como validar:** Comparar custo por conversa em janela equivalente.
Fontes RAG citadas: [550e8400-e29b-41d4-a716-446655440000]
  `.trim();

  const clientGuarded = enforceVictoriaPostLlmGuardrails(leakyQuickLlm, ctx, {
    userPrompt: "quero abaixo de R$ 5",
  });
  assert.equal(clientGuarded.replacedByDeterministic, false);
  assertNoTechnicalLeaks(clientGuarded.text);
  assertNoTechnicalLeaks(stripTechnicalArtifactsForQuickMode(leakyQuickLlm));

  const serverGuarded = enforceServerPostLlmGuardrails(
    leakyQuickLlm,
    ctx,
    [{ id: "550e8400-e29b-41d4-a716-446655440000", title: "Guia", version: "1", evidence_level: "oficial", approval_status: "approved" }],
    "READ_ONLY_ANALYSIS",
    false,
    "quero abaixo de R$ 5"
  );
  assert.equal(serverGuarded.replacedByDeterministic, false);
  assertNoTechnicalLeaks(serverGuarded.text);
  assertNoTechnicalLeaks(stripTechnicalArtifactsServerQuick(leakyQuickLlm));

  // LLM devolve resposta antiga gigante de 10 seções em pedido comum -> bloqueada e trocada por resumo rápido
  const bloated10SectionLlm = `
O que esta campanha foi configurada para otimizar?
#### 1. Escopo analisado
ID 1202000111222
#### 2. Objetivo e evento oficial
Mensagens
#### 3. Leitura factual
R$ 281,20
#### 4. Indicadores primários e secundários
CTR
#### 5. Limitações e dados ausentes
Sem CRM
#### 6. Hipóteses
Criativo
#### 7. Recomendações seguras
Aguardar 3 a 7 dias
#### 8. Plano de validação
7 dias
#### 9. Nível de confiança
Médio
#### 10. Fontes e documentos utilizados
[550e8400-e29b-41d4-a716-446655440000]
  `.trim();

  const blockedClient = enforceVictoriaPostLlmGuardrails(bloated10SectionLlm, ctx, {
    userPrompt: "Esse anúncio está bom?",
  });
  assert.equal(blockedClient.replacedByDeterministic, true);
  assert.ok(blockedClient.reasons.includes("bloated_10_sections_in_quick_mode"));
  assert.equal(hasAllMandatory10Sections(blockedClient.text), false);
  assertNoTechnicalLeaks(blockedClient.text);

  const blockedServer = enforceServerPostLlmGuardrails(
    bloated10SectionLlm,
    ctx,
    [],
    "READ_ONLY_ANALYSIS",
    false,
    "Esse anúncio está bom?"
  );
  assert.equal(blockedServer.replacedByDeterministic, true);
  assert.equal(hasAllMandatory10Sections(blockedServer.text), false);
  assertNoTechnicalLeaks(blockedServer.text);

  // Pedido explícito de auditoria completa preserva as 10 seções
  const allowedDetailed = enforceVictoriaPostLlmGuardrails(bloated10SectionLlm, ctx, {
    userPrompt: "Quero uma auditoria completa detalhada desse anúncio",
  });
  assert.equal(allowedDetailed.replacedByDeterministic, false);
  assert.equal(hasAllMandatory10Sections(allowedDetailed.text), true);

  // Gateway envia requireFull10Sections=false por padrão
  const originalFetch = globalThis.fetch;
  let capturedBody: any = null;
  try {
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(String(init?.body || "{}"));
      return new Response(JSON.stringify({ error: "fallback check" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const ctrl = new VictoriaSessionController();
    const res = await executeGovernedVictoriaDiagnostic({
      ctx,
      controller: ctrl,
      endpointUrl: "https://example.supabase.co/functions/v1/victoria-agent",
      anonKey: "anon",
      userPrompt: "Esse criativo está bom? Como chegar em R$ 5?",
    });

    assert.equal(capturedBody.requireFull10Sections, false);
    assert.equal(capturedBody.response_mode, "quick_executive");
    assert.equal(res.responseOrigin, "deterministic_fallback");
    assert.equal(hasAllMandatory10Sections(res.text), false);
    assertNoTechnicalLeaks(res.text);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
