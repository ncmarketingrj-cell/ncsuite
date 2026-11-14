import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveUserHeaderIdentity,
  sanitizeExternalUrl,
  extractYouTubeVideoId,
  validatePublicLinkItem,
  validateLeadSubmission,
  buildTrackedPageUrl,
  resolveCrmEmptyState,
  classifyLinkPageKind,
  formatMindMapDisambiguatedLabel,
  computeSocialAuditNetworkSplit,
} from "../src/lib/pageSanitizers.ts";

describe("Identidade do Header (ID 21)", () => {
  it("não vaza prefixo cru de e-mail nem 'Equipe' enquanto perfil carrega sem nome", () => {
    const id = resolveUserHeaderIdentity({
      profileLoading: true,
      fullName: null,
      metadataFullName: null,
      email: "nc.marketingrj@gmail.com",
      position: null,
    });
    assert.equal(id.isLoading, true);
    assert.notEqual(id.firstName, "nc.marketingrj");
    assert.notEqual(id.roleLabel, "Equipe");
  });

  it("usa metadataFullName ou perfil carregado com estabilidade", () => {
    const id = resolveUserHeaderIdentity({
      profileLoading: false,
      fullName: "Henrique Costa",
      email: "nc.marketingrj@gmail.com",
      position: "Gestor de Tráfego",
    });
    assert.equal(id.firstName, "Henrique");
    assert.equal(id.roleLabel, "Gestor de Tráfego");
    assert.equal(id.isLoading, false);
  });
});

describe("Sanitização de Páginas Públicas, YouTube, Leads e UTM (IDs 30, 31, 41)", () => {
  it("bloqueia javascript:/data: e URLs quebradas, normalizando domínios válidos", () => {
    assert.equal(sanitizeExternalUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeExternalUrl("data:text/html,<h1>x</h1>"), null);
    assert.equal(sanitizeExternalUrl("   "), null);
    assert.equal(sanitizeExternalUrl("ncsuite.com.br"), "https://ncsuite.com.br/");
  });

  it("extrai ID de YouTube em watch, youtu.be, shorts e embed, rejeitando inválidos", () => {
    assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractYouTubeVideoId("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractYouTubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractYouTubeVideoId("https://youtube.com/embed/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(extractYouTubeVideoId("nao-eh-youtube"), null);
  });

  it("oculta botões placeholder 'Novo Botão', links vazios, YouTube inválido e WPP incompleto", () => {
    assert.equal(validatePublicLinkItem({ type: "link", title: "Novo Botão", url: "" }).valid, false);
    assert.equal(validatePublicLinkItem({ type: "youtube", title: "Vídeo", url: "https://example.com" }).valid, false);
    assert.equal(validatePublicLinkItem({ type: "whatsapp", title: "WPP", url: "123" }).valid, false);
    const okWpp = validatePublicLinkItem({ type: "whatsapp", title: "Atendimento", url: "(21) 99999-8888" });
    assert.equal(okWpp.valid, true);
    assert.equal(okWpp.whatsappDigits, "21999998888");
  });

  it("rejeita submissões somente com espaços e preserva UTMs", () => {
    const bad = validateLeadSubmission({ name: "   ", phone: "21999998888" });
    assert.equal(bad.valid, false);
    const badPhone = validateLeadSubmission({ name: "Maria", phone: "123" });
    assert.equal(badPhone.valid, false);
    const good = validateLeadSubmission({ name: "  Maria Silva ", phone: " 21999998888 ", email: " maria@x.com " });
    assert.equal(good.valid, true);
    assert.equal(good.sanitized?.name, "Maria Silva");

    const tracked = buildTrackedPageUrl("https://app.ncsuite.com/", "loja-barra", {
      source: "instagram",
      medium: "stories",
      campaign: "feirao",
    });
    assert.equal(tracked, "https://app.ncsuite.com/p/loja-barra?utm_source=instagram&utm_medium=stories&utm_campaign=feirao");
  });

  it("distingue CRM sem leads vs filtros ativos sem resultados (ID 41)", () => {
    const empty = resolveCrmEmptyState({ totalLeads: 0, filteredLeadsCount: 0, hasActiveFilter: false });
    assert.equal(empty.showResetFilters, false);
    assert.match(empty.title, /Nenhum lead capturado ainda/i);

    const filteredEmpty = resolveCrmEmptyState({ totalLeads: 12, filteredLeadsCount: 0, hasActiveFilter: true });
    assert.equal(filteredEmpty.showResetFilters, true);

    assert.equal(classifyLinkPageKind({ template: "garage-premium", lead_form_enabled: true }), "link_bio");
    assert.equal(classifyLinkPageKind({ template: "form_only", lead_form_enabled: true }), "form");
  });
});

describe("Strategy Maps & Social Audit Split (IDs 32, 39)", () => {
  it("desambigua mapas com mesmo título por ID curto, conta e data civil", () => {
    const a = formatMindMapDisambiguatedLabel(
      { id: "abcdef12-3456", title: "Funil Feirão", updated_at: "2026-11-12T18:00:00Z" },
      "Falcão Motos"
    );
    const b = formatMindMapDisambiguatedLabel(
      { id: "99887766-1111", title: "Funil Feirão", updated_at: "2026-11-11T12:00:00Z" },
      "LumaCar"
    );
    assert.notEqual(a, b);
    assert.match(a, /#abcdef/);
    assert.match(a, /Falcão Motos/);
    assert.match(a, /12\/11\/2026/);
  });

  it("separa IG e FB em Social Audit sem diluir engajamento IG por posts FB sem alcance", () => {
    const split = computeSocialAuditNetworkSplit(
      [
        { platform: "instagram", reach_count: 1000, likes_count: 40, comments_count: 10, engagement_rate: 5.0 },
        { platform: "facebook", reach_count: 0, likes_count: 20, comments_count: 5, engagement_rate: 0 },
      ],
      { reachIg: 1000, interactionsIg: 50, interactionsFb: 25 }
    );
    assert.equal(split.instagram.avgEngRate, 5.0);
    assert.equal(split.instagram.postsCount, 1);
    assert.equal(split.facebook.postsCount, 1);
    assert.equal(split.facebook.avgEngRate, null);
    assert.equal(split.combined.totalInteractions, 75);
  });
});
