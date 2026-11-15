import test from "node:test";
import assert from "node:assert/strict";
import {
  STUDIO_CREATION_MODES,
  STUDIO_FORMATS,
  STUDIO_TEMPLATES,
  adaptStudioLayersToFormat,
  alignLayerToMargins,
  buildConfirmedCommercialLines,
  createInitialStudioLayers,
  detectOutOfSafeZoneLayers,
  duplicateStudioLayer,
  estimateExportMetadata,
  evaluateBrandKitHealth,
  generateSmartVariations,
  getStudioTemplateSpec,
  pushStudioHistory,
  redoStudioHistory,
  reorderLayerZIndex,
  resolveLibraryAssetBadges,
  resolveStudioAccountContext,
  undoStudioHistory,
  validateStudioTestCompatibility,
  type ConfirmedCommercialFacts,
  type StudioHistoryStack,
  type StudioLayer,
} from "../src/lib/creativeStudioDomain.ts";

const SAMPLE_ACCOUNTS = [
  { id: "act_187705586671118", name: "13 Car Repasses - ADS" },
  { id: "act_999111", name: "Rio2 Veículos" },
  { id: "act_222333", name: "Nova Era Proteção" },
];

const SAMPLE_FACTS: ConfirmedCommercialFacts = {
  pieceObjective: "mensagens_whatsapp",
  channelDestination: "WhatsApp Direct",
  vehicleOrOfferName: "Honda Fit LX 2019",
  headlineOffer: "Honda Fit LX Automático",
  confirmedPrice: "R$ 62.900",
  confirmedInstallment: "",
  confirmedDownPayment: "",
  fipeComparison: "",
  confirmedDifferentials: "Automático • Único dono",
  confirmedCondition: "IPVA pago",
  confirmedCta: "CHAMAR NO WHATSAPP",
  confirmedLocationOrContact: "Unidade Barra",
};

test("Studio account context: 'Todas as Contas' never auto-selects accounts[0] and requires explicit pick", () => {
  const ctx = resolveStudioAccountContext({
    selectedAccountId: "all",
    explicitStudioAccountId: "",
    accounts: SAMPLE_ACCOUNTS,
  });
  assert.equal(ctx.effectiveAccountId, "");
  assert.equal(ctx.requiresExplicitAccountSelection, true);
  assert.equal(ctx.accountName, null);

  const scoped = resolveStudioAccountContext({
    selectedAccountId: "act_999111",
    accounts: SAMPLE_ACCOUNTS,
  });
  assert.equal(scoped.effectiveAccountId, "act_999111");
  assert.equal(scoped.requiresExplicitAccountSelection, false);
  assert.equal(scoped.accountName, "Rio2 Veículos");

  const seeded = resolveStudioAccountContext({
    selectedAccountId: "all",
    seedAdAccountId: "act_222333",
    accounts: SAMPLE_ACCOUNTS,
  });
  assert.equal(seeded.effectiveAccountId, "act_222333");
  assert.equal(seeded.requiresExplicitAccountSelection, false);
});

test("Brand Kit health: warns clearly when missing kit or missing logo without inventing one", () => {
  const missingKit = evaluateBrandKitHealth(null, "Rio2 Veículos");
  assert.equal(missingKit.hasBrandKit, false);
  assert.equal(missingKit.hasLogo, false);
  assert.equal(missingKit.canContinueWithoutBrandKit, true);
  assert.match(missingKit.warningMessage || "", /Brand Kit/);

  const noLogo = evaluateBrandKitHealth(
    { ad_account_id: "act_999111", primary_color: "#111", logo_url: "" },
    "Rio2 Veículos"
  );
  assert.equal(noLogo.hasBrandKit, true);
  assert.equal(noLogo.hasLogo, false);
  assert.match(noLogo.warningMessage || "", /sem logo/i);

  const complete = evaluateBrandKitHealth(
    { ad_account_id: "act_999111", logo_url: "https://cdn.example.com/logo.png" },
    "Rio2 Veículos"
  );
  assert.equal(complete.hasLogo, true);
  assert.equal(complete.warningMessage, null);
});

test("Studio formats match exact dimensions and 4 creation modes enforce cost/fidelity contracts", () => {
  assert.deepEqual(
    STUDIO_FORMATS.map((f) => [f.id, f.label, f.width, f.height]),
    [
      ["1:1", "Feed 1:1 (1080×1080)", 1080, 1080],
      ["4:5", "Feed 4:5 (1080×1350)", 1080, 1350],
      ["9:16", "Stories/Reels 9:16 (1080×1920)", 1080, 1920],
      ["16:9", "Horizontal 16:9 (1920×1080)", 1920, 1080],
    ]
  );

  assert.equal(STUDIO_CREATION_MODES.length, 4);
  const modeA = STUDIO_CREATION_MODES.find((m) => m.id === "faithful_composition")!;
  const modeB = STUDIO_CREATION_MODES.find((m) => m.id === "ai_scenario")!;
  const modeC = STUDIO_CREATION_MODES.find((m) => m.id === "ai_generated_art")!;
  const modeD = STUDIO_CREATION_MODES.find((m) => m.id === "smart_variations")!;

  assert.equal(modeA.usesPaidAi, false);
  assert.equal(modeA.preservesRealSubject, true);
  assert.equal(modeB.usesPaidAi, true);
  assert.equal(modeB.requiresUserCostConfirmation, true);
  assert.equal(modeC.usesPaidAi, true);
  assert.equal(modeC.preservesRealSubject, false);
  assert.match(modeC.fidelityNotice || "", /NÃO representa uma foto real/);
  assert.equal(modeD.usesPaidAi, false);
});

test("Studio templates cover all 14+ categories and never embed fake commercial numbers", () => {
  const categories = new Set(STUDIO_TEMPLATES.map((t) => t.category));
  for (const expected of [
    "oferta_preco",
    "abaixo_fipe",
    "feirao_urgencia",
    "parcelas_entrada",
    "troca_seminovo",
    "premium_executivo",
    "queima_estoque",
    "prova_social",
    "diferenciais",
    "institucional",
    "aluguel_motos",
    "motos",
    "protecao_veicular",
    "servico_local",
  ] as const) {
    assert.ok(categories.has(expected), `Missing template category ${expected}`);
  }

  for (const tpl of STUDIO_TEMPLATES) {
    assert.doesNotMatch(tpl.badgeText, /R\$|\d+%/i);
    assert.doesNotMatch(tpl.name, /R\$|\d+%/i);
  }
});

test("Confirmed commercial facts and smart variations never fabricate unconfirmed prices or claims", () => {
  const lines = buildConfirmedCommercialLines({
    ...SAMPLE_FACTS,
    confirmedPrice: "",
    confirmedInstallment: "",
    confirmedDownPayment: "",
    fipeComparison: "",
  });
  assert.equal(lines.priceLine, "");

  const vars = generateSmartVariations({
    facts: {
      ...SAMPLE_FACTS,
      confirmedPrice: "",
      confirmedInstallment: "",
      confirmedDownPayment: "",
      fipeComparison: "",
    },
    template: getStudioTemplateSpec("abaixo_fipe"),
  });
  assert.equal(vars.length, 4);
  for (const v of vars) {
    assert.equal(v.confirmedFactsOnly, true);
    assert.equal(v.priceText, "");
    assert.doesNotMatch(v.headlineText + v.subheadlineText, /R\$\s*\d+/);
  }
});

test("Stories/Reels 9:16 safe-zone detection catches intrusion and multi-format adaptation flags crop loss", () => {
  const layers = createInitialStudioLayers({
    template: getStudioTemplateSpec("promo"),
    brandKit: null,
    facts: SAMPLE_FACTS,
    formatId: "9:16",
  });
  const initialWarnings = detectOutOfSafeZoneLayers(layers, "9:16");
  assert.equal(initialWarnings.length, 0);

  // Move badge into top 5% (Stories profile bar danger zone < 14%) and CTA to y=88% (bottom danger zone > 80%)
  const unsafe = layers.map((l) =>
    l.kind === "badge" ? { ...l, yPct: 4 } : l.kind === "cta" ? { ...l, yPct: 88 } : l
  );
  const warnings = detectOutOfSafeZoneLayers(unsafe, "9:16");
  assert.ok(warnings.some((w) => w.layerId === "layer-badge"));
  assert.ok(warnings.some((w) => w.layerId === "layer-cta"));

  // Adapt 16:9 -> 9:16 requires crop confirmation because ratio shift > 25%
  const adapted = adaptStudioLayersToFormat({
    sourceLayers: createInitialStudioLayers({
      template: getStudioTemplateSpec("promo"),
      brandKit: null,
      facts: SAMPLE_FACTS,
      formatId: "16:9",
    }),
    sourceFormatId: "16:9",
    targetFormatId: "9:16",
  });
  assert.equal(adapted.requiresCropConfirmation, true);
  assert.ok(adapted.cropLossRatio >= 0.25);
  assert.equal(detectOutOfSafeZoneLayers(adapted.layers, "9:16").length, 0);
});

test("Layer editing ops (undo/redo, duplicate, reorder, align) work deterministically", () => {
  const initial = createInitialStudioLayers({
    template: getStudioTemplateSpec("promo"),
    brandKit: null,
    facts: SAMPLE_FACTS,
    formatId: "1:1",
  });

  let stack: StudioHistoryStack<StudioLayer[]> = { past: [], present: initial, future: [] };
  const duplicated = duplicateStudioLayer(stack.present, "layer-headline");
  assert.equal(duplicated.length, initial.length + 1);

  stack = pushStudioHistory(stack, duplicated);
  assert.equal(stack.past.length, 1);
  stack = undoStudioHistory(stack);
  assert.equal(stack.present.length, initial.length);
  stack = redoStudioHistory(stack);
  assert.equal(stack.present.length, initial.length + 1);

  const reordered = reorderLayerZIndex(initial, "layer-badge", "up");
  assert.ok(reordered.length === initial.length);

  const centered = alignLayerToMargins(initial[0], "1:1", "center-x");
  assert.equal(centered.align, "center");
});

test("Export metadata, test compatibility guard, and library lifecycle badges enforce isolation & honesty", () => {
  const jpgMeta = estimateExportMetadata({
    formatId: "16:9",
    mimeType: "image/jpeg",
    quality: 0.9,
    hasTransparentBackground: true,
  });
  assert.equal(jpgMeta.dimensionsLabel, "1920×1080 px");
  assert.equal(jpgMeta.transparencyApplicable, false);

  const pngMeta = estimateExportMetadata({
    formatId: "4:5",
    mimeType: "image/png",
    quality: 1,
    hasTransparentBackground: true,
  });
  assert.equal(pngMeta.dimensionsLabel, "1080×1350 px");
  assert.equal(pngMeta.transparencyApplicable, true);

  // Cross-account test blocked
  const crossAcc = validateStudioTestCompatibility({
    studioAccountId: "act_999111",
    studioObjective: "mensagens_whatsapp",
    test: {
      id: "t1",
      title: "Teste Conta B",
      ad_account_id: "act_222333",
      objective: "MESSAGES",
      result_unit: "conversations",
    },
  });
  assert.equal(crossAcc.compatible, false);

  // Different objective / unit blocked
  const mismatchObj = validateStudioTestCompatibility({
    studioAccountId: "act_999111",
    studioObjective: "mensagens_whatsapp",
    test: {
      id: "t2",
      title: "Teste Compras",
      ad_account_id: "act_999111",
      objective: "OUTCOME_SALES",
      result_unit: "purchases",
    },
  });
  assert.equal(mismatchObj.compatible, false);

  // Draft without ad link never fakes ad usage or result
  const draftBadges = resolveLibraryAssetBadges({
    approvalStatus: "draft",
    linkedAdName: null,
    linkedAdResultLabel: null,
  });
  assert.equal(draftBadges.workflowLabel, "Rascunho");
  assert.equal(draftBadges.adUsageBadge, null);
  assert.equal(draftBadges.observedResultBadge, null);

  // Approved + linked ad shows separate badges
  const liveBadges = resolveLibraryAssetBadges({
    approvalStatus: "approved",
    linkedAdName: "AD 01 — Fit 2019",
    linkedAdResultLabel: "18 conversas • CPA/CPR R$ 11,40",
    linkedTestTitle: "Hook Preço vs Troca",
  });
  assert.equal(liveBadges.workflowLabel, "Aprovado");
  assert.match(liveBadges.adUsageBadge || "", /Usado em anúncio/);
  assert.match(liveBadges.observedResultBadge || "", /Resultado observado: 18 conversas/);
});
