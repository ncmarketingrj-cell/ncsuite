import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isReadOnlyAnalysisRequest,
  stripJsonActionBlocks,
  buildActionProposal,
  validateActionExecution,
  formatVictoriaUnitCost,
  buildVictoriaCampaignMetricsLine,
  sanitizeRssText,
  isHomepageOnlyUrl,
} from "../src/lib/victoriaGovernance.ts";

describe("Victoria AI — Fixture C & Modo Somente Leitura (IDs 09, 44)", () => {
  it("classifica consultas analíticas (Fixture C) como somente leitura e bloqueia ações mutáveis", () => {
    assert.equal(isReadOnlyAnalysisRequest("Analisar conta Rio2 no período 12/11/2026"), true);
    assert.equal(isReadOnlyAnalysisRequest("Quais as melhores e piores campanhas?"), true);
    assert.equal(isReadOnlyAnalysisRequest("Qual o CPL e o resumo de hoje?"), true);
    assert.equal(isReadOnlyAnalysisRequest("Pausar campanha ruim agora, mas não altere orçamento"), true);

    assert.equal(isReadOnlyAnalysisRequest("Pausar campanha NC | MSG 2"), false);
    assert.equal(isReadOnlyAnalysisRequest("Ajuste o orçamento da campanha A para 120"), false);

    const aiResponseWithAccidentalAction = `Resumo da conta:\nGasto R$ 64,08\n\`\`\`json:action\n{"type":"pause_campaign","campaignId":"c1","campaignName":"NC MSG"}\n\`\`\``;
    const parsed = stripJsonActionBlocks(aiResponseWithAccidentalAction);
    assert.equal(parsed.cleanText.includes("json:action"), false);
    assert.equal(parsed.parsedAction?.type, "pause_campaign");

    const blockedProposal = buildActionProposal(parsed.parsedAction, { readOnly: true });
    assert.equal(blockedProposal, null);
  });

  it("bloqueia reexecução, rejeição, expiração, divergência de conta e alto risco sem CONFIRMAR (IDs 10, 44)", () => {
    const proposal = buildActionProposal(
      {
        type: "pause_campaign",
        campaignId: "camp_123",
        campaignName: "Rio2 Mensagens",
        ruleId: "rule-high-cpl",
      },
      {
        accountId: "act_rio2",
        accountName: "NC - Rio 2",
        windowStart: "2026-11-12",
        windowEnd: "2026-11-12",
        nowIso: "2026-11-12T12:00:00.000Z",
        ttlMinutes: 30,
        readOnly: false,
      }
    );

    assert.ok(proposal);
    assert.equal(proposal.risk, "high");

    // Rejeitada não executa
    const rejectedCheck = validateActionExecution({
      proposal,
      status: "rejected",
      userConfirmed: true,
      confirmPhrase: "CONFIRMAR",
    });
    assert.equal(rejectedCheck.allowed, false);
    assert.equal(rejectedCheck.code, "REJECTED");

    // Já aprovada (idempotência) não executa 2x
    const approvedCheck = validateActionExecution({
      proposal,
      status: "approved",
      userConfirmed: true,
      confirmPhrase: "CONFIRMAR",
    });
    assert.equal(approvedCheck.allowed, false);
    assert.equal(approvedCheck.code, "ALREADY_EXECUTED");

    // Expirada não executa
    const expiredCheck = validateActionExecution({
      proposal,
      status: "pending",
      userConfirmed: true,
      confirmPhrase: "CONFIRMAR",
      nowIso: "2026-11-12T13:00:00.000Z",
    });
    assert.equal(expiredCheck.allowed, false);
    assert.equal(expiredCheck.code, "EXPIRED");

    // Conta divergente não executa
    const wrongAccount = validateActionExecution({
      proposal,
      status: "pending",
      userConfirmed: true,
      confirmPhrase: "CONFIRMAR",
      currentAccountId: "act_outra",
      nowIso: "2026-11-12T12:05:00.000Z",
    });
    assert.equal(wrongAccount.allowed, false);
    assert.equal(wrongAccount.code, "CONTEXT_MISMATCH");

    // Alto risco sem frase CONFIRMAR bloqueia
    const missingConfirm = validateActionExecution({
      proposal,
      status: "pending",
      userConfirmed: true,
      confirmPhrase: "ok",
      currentAccountId: "act_rio2",
      nowIso: "2026-11-12T12:05:00.000Z",
    });
    assert.equal(missingConfirm.allowed, false);
    assert.equal(missingConfirm.code, "CONFIRMATION_REQUIRED");

    // Válida dentro da janela com CONFIRMAR permite execução
    const valid = validateActionExecution({
      proposal,
      status: "pending",
      userConfirmed: true,
      confirmPhrase: "CONFIRMAR",
      currentAccountId: "act_rio2",
      currentWindowStart: "2026-11-12",
      currentWindowEnd: "2026-11-12",
      nowIso: "2026-11-12T12:10:00.000Z",
    });
    assert.equal(valid.allowed, true);
  });
});

describe("Victoria AI — Preservação de Evento Real & Custo Zero (IDs 11, 12)", () => {
  it("exibe 'Não calculável' em vez de R$ 0,00 quando resultados = 0", () => {
    const res = formatVictoriaUnitCost({ cost: 28.4, resultCount: 0, category: "MESSAGES" });
    assert.equal(res.value, null);
    assert.equal(res.formatted, "Não calculável");
  });

  it("preserva 'conversas iniciadas' vs 'visitas ao perfil' vs 'pessoas alcançadas' (x1000) sem chamar de lead de formulário", () => {
    const msgLine = buildVictoriaCampaignMetricsLine({
      clientName: "Rio 2",
      campaignName: "Rio2 - Mensagens",
      status: "ACTIVE",
      resultType: "MESSAGING_CONVERSATION_STARTED",
      cost: 60,
      conversions: 12,
      clicks: 80,
      impressions: 2000,
      reach: 1800,
    });
    assert.match(msgLine.line, /conversas iniciadas/i);
    assert.equal(msgLine.costPerRes, 5);

    const profileLine = buildVictoriaCampaignMetricsLine({
      clientName: "Rio 2",
      campaignName: "Rio2 - Visitas Perfil",
      status: "ACTIVE",
      resultType: "PROFILE_VISIT",
      cost: 17.9,
      conversions: 179,
      clicks: 210,
      impressions: 5000,
      reach: 4500,
    });
    assert.match(profileLine.line, /visitas ao perfil/i);

    const reachLine = buildVictoriaCampaignMetricsLine({
      clientName: "Falcão",
      campaignName: "Campanha Alcance Institucional",
      status: "ACTIVE",
      resultType: "REACH",
      cost: 215.47,
      conversions: 49589,
      clicks: 120,
      impressions: 60000,
      reach: 49589,
    });
    assert.ok(reachLine.costPerRes !== null && Math.abs(reachLine.costPerRes - (215.47 / 49589) * 1000) < 0.01);
  });
});

describe("Radar & RAG — Sanitização RSS e Proveniência de URL (ID 26)", () => {
  it("remove HTML/CDATA e marca homepages genéricas como não válidas para prova numérica", () => {
    const clean = sanitizeRssText("<![CDATA[Texto <b>automotivo</b> &amp; mercado&nbsp;2026]]>");
    assert.equal(clean, "Texto automotivo & mercado 2026");
    assert.equal(isHomepageOnlyUrl("https://fenabrave.org.br"), true);
    assert.equal(isHomepageOnlyUrl("https://fenabrave.org.br/"), true);
    assert.equal(isHomepageOnlyUrl("https://news.google.com/rss/articles/CBMi123"), false);
  });
});
