import {
  detectImageMimeFromMagicBytes,
  type CreativeAdRecord,
} from "./creativeIntelligenceDomain.ts";
import { computeUnitCost, type MetaConversionCategory } from "./metricsDomain.ts";

export type CandidateMediaKind = "image" | "video";

export type ComparisonWorkflowStatus =
  | "draft"
  | "ready_for_test"
  | "running"
  | "result_recorded";

export interface CandidateCreativeInput {
  adAccountId: string;
  title: string;
  mediaKind: CandidateMediaKind;
  mediaUrl: string | null;
  mediaFileName: string | null;
  mediaLoadError?: string | null;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  confirmedOffer: string;
  confirmedPrice: string;
  confirmedVehicleSpecs: string;
  destinationUrl: string;
  intendedFormat: "1:1" | "4:5" | "9:16" | "16:9" | "video_vertical" | "video_feed";
  intendedPlacements: string[];
  userHypothesis: string;
}

export interface ObservableDiffItem {
  dimension: string;
  label: string;
  referenceValue: string;
  candidateValue: string;
  changed: boolean;
  concreteObservation: string;
}

export interface PeerBenchmarkSummary {
  hasSufficientSample: boolean;
  peerCount: number;
  peerAdIds: string[];
  peerAdNames: string[];
  totalResults: number;
  totalSpend: number;
  weightedUnitCost: number | null;
  bestPeerUnitCost: number | null;
  worstPeerUnitCost: number | null;
  periodStart: string;
  periodEnd: string;
  resultCategory: MetaConversionCategory;
  resultUnitLabel: string;
  costUnitLabel: string;
  resultIndicator: string | null;
  calculationMethod: string;
  insufficientReason: string | null;
  exploratoryRangeLabel: string | null;
}

export interface ComparisonRecommendation {
  id: string;
  proposedChange: string;
  evidenceReason: string;
  expectedOutcomeHypothesis: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  validityCondition: string;
  confidenceLevel: "baixa" | "média";
  confidenceReason: string;
  dataLimitations: string[];
}

export interface ExecutableTestPlan {
  testableHypothesis: string;
  primaryVariable: string;
  keptConstants: string;
  primaryMetric: string;
  secondaryMetrics: string[];
  referenceAccountId: string;
  referenceAccountName: string;
  referenceCampaignName: string;
  referenceAdId: string;
  referenceAdName: string;
  periodLabel: string;
  attributionWindow: string;
  recommendedMinSampleNote: string;
  readingCriteria: string;
  isMultiVariableChange: boolean;
  changedVariables: string[];
  multiVariableWarning: string | null;
  controlledTestSuggestion: string | null;
  publicationStatusNote: string;
}

export interface CreativeComparisonAnalysis {
  accountId: string;
  accountName: string;
  referenceAdId: string;
  referenceAdName: string;
  resultCategory: MetaConversionCategory;
  resultIndicator: string | null;
  observableDiffs: ObservableDiffItem[];
  changedVariables: string[];
  missingCommercialFacts: string[];
  benchmark: PeerBenchmarkSummary;
  observedMetaFacts: string[];
  systemInterpretation: string[];
  creativeHypothesis: string;
  postDeliveryValidationNote: string;
  recommendations: ComparisonRecommendation[];
  testPlan: ExecutableTestPlan;
  dataLimitations: string[];
}

export const ALLOWED_CANDIDATE_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
export const ALLOWED_CANDIDATE_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);
export const MAX_CANDIDATE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CANDIDATE_VIDEO_BYTES = 50 * 1024 * 1024;

export function detectVideoMimeFromMagicBytes(
  bytes: Uint8Array
): "video/mp4" | "video/quicktime" | "video/webm" | null {
  if (!bytes || bytes.length < 12) return null;
  // WebM / Matroska EBML header: 1A 45 DF A3
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    return "video/webm";
  }
  // ISO BMFF (MP4 / MOV): 'ftyp' at bytes 4..7
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase();
    if (brand.startsWith("qt")) return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

export async function validateCandidateMediaFile(
  file: File | null | undefined
): Promise<{ valid: boolean; mediaKind: CandidateMediaKind | null; error: string | null }> {
  if (!file) {
    return { valid: false, mediaKind: null, error: "Selecione uma imagem ou vídeo da peça candidata." };
  }
  const name = String(file.name || "").trim().toLowerCase();
  const mime = String(file.type || "").toLowerCase();
  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return { valid: false, mediaKind: null, error: "Arquivo vazio ou corrompido." };
  }

  const isVideoExt = /\.(mp4|mov|webm)$/.test(name);
  const isImageExt = /\.(png|jpg|jpeg|webp)$/.test(name);

  if (isVideoExt || ALLOWED_CANDIDATE_VIDEO_MIMES.has(mime)) {
    if (!isVideoExt) {
      return { valid: false, mediaKind: null, error: "Vídeo inválido. Utilize .mp4, .mov ou .webm." };
    }
    if (size > MAX_CANDIDATE_VIDEO_BYTES) {
      return { valid: false, mediaKind: null, error: "Vídeo acima de 50 MB. Comprima o arquivo antes de enviar." };
    }
    try {
      const buf = await file.slice(0, 16).arrayBuffer();
      const detected = detectVideoMimeFromMagicBytes(new Uint8Array(buf));
      if (!detected) {
        return {
          valid: false,
          mediaKind: null,
          error: "Assinatura binária de vídeo inválida. Envie um arquivo MP4, MOV ou WEBM válido.",
        };
      }
      return { valid: true, mediaKind: "video", error: null };
    } catch {
      return { valid: false, mediaKind: null, error: "Não foi possível ler o arquivo de vídeo." };
    }
  }

  if (isImageExt || mime.startsWith("image/")) {
    if (!isImageExt) {
      return { valid: false, mediaKind: null, error: "Imagem inválida. Utilize .png, .jpg, .jpeg ou .webp." };
    }
    if (size > MAX_CANDIDATE_IMAGE_BYTES) {
      return { valid: false, mediaKind: null, error: "Imagem acima de 8 MB. Reduza o arquivo antes de enviar." };
    }
    try {
      const buf = await file.slice(0, 16).arrayBuffer();
      const detected = detectImageMimeFromMagicBytes(new Uint8Array(buf));
      if (!detected) {
        return {
          valid: false,
          mediaKind: null,
          error: "Conteúdo binário inválido para imagem. Envie PNG, JPG ou WEBP real.",
        };
      }
      return { valid: true, mediaKind: "image", error: null };
    } catch {
      return { valid: false, mediaKind: null, error: "Não foi possível ler o arquivo de imagem." };
    }
  }

  return {
    valid: false,
    mediaKind: null,
    error: "Formato não suportado. Envie imagem (PNG, JPG, WEBP) ou vídeo (MP4, MOV, WEBM).",
  };
}

export function validateComparatorScope(input: {
  selectedAccountId: string;
  referenceAd: CreativeAdRecord | null;
  candidateAccountId: string;
  accountPermissionMissing?: boolean;
}): { valid: boolean; reason: string | null } {
  if (!input.selectedAccountId || input.selectedAccountId === "all") {
    return {
      valid: false,
      reason: "Selecione explicitamente uma única conta de anúncios para comparar criativos sem cruzar contas.",
    };
  }
  if (input.accountPermissionMissing) {
    return {
      valid: false,
      reason: "Esta conta está sem permissão de leitura na Meta Ads API; não é possível validar a comparação.",
    };
  }
  if (!input.referenceAd) {
    return {
      valid: false,
      reason: "Selecione um anúncio ativo de referência desta conta.",
    };
  }
  if (input.referenceAd.adAccountId !== input.selectedAccountId) {
    return {
      valid: false,
      reason: "O anúncio de referência pertence a outra conta e foi bloqueado para evitar cruzamento de dados.",
    };
  }
  if (input.candidateAccountId && input.candidateAccountId !== input.selectedAccountId) {
    return {
      valid: false,
      reason: "A peça candidata precisa pertencer à mesma conta do anúncio de referência.",
    };
  }
  return { valid: true, reason: null };
}

export function buildObservableComparison(
  refAd: CreativeAdRecord,
  candidate: CandidateCreativeInput
): {
  diffs: ObservableDiffItem[];
  changedVariables: string[];
  missingCommercialFacts: string[];
} {
  const norm = (s?: string | null) => (s || "").trim();
  const refTitle = norm(refAd.creativeTitle) || "(sem título sincronizado)";
  const candTitle = norm(candidate.headline) || "(não informado)";
  const titleChanged = norm(candidate.headline) !== "" && norm(candidate.headline) !== norm(refAd.creativeTitle);

  const refBody = norm(refAd.creativeBody) || "(sem texto principal sincronizado)";
  const candBody = norm(candidate.primaryText) || "(não informado)";
  const bodyChanged = norm(candidate.primaryText) !== "" && norm(candidate.primaryText) !== norm(refAd.creativeBody);

  const refCta = norm(refAd.callToActionType) || "(não informado na Meta)";
  const candCta = norm(candidate.cta) || "(não informado)";
  const ctaChanged = norm(candidate.cta) !== "" && norm(candidate.cta).toUpperCase() !== norm(refAd.callToActionType).toUpperCase();

  const refFmt = norm(refAd.creativeFormat) || "(formato não sincronizado)";
  const candFmt = candidate.intendedFormat;
  const fmtChanged = Boolean(norm(refAd.creativeFormat))
    ? !refFmt.toLowerCase().includes(candFmt.toLowerCase())
    : true;

  const refPlacements =
    refAd.placementsSummary.length > 0 ? refAd.placementsSummary.join(", ") : "(posicionamentos não detalhados)";
  const candPlacements =
    candidate.intendedPlacements.length > 0 ? candidate.intendedPlacements.join(", ") : "(não selecionado)";
  const placementsChanged = candidate.intendedPlacements.length > 0;

  const offerChanged = Boolean(norm(candidate.confirmedOffer) || norm(candidate.confirmedPrice));

  const diffs: ObservableDiffItem[] = [
    {
      dimension: "hook",
      label: "Gancho / Título",
      referenceValue: refTitle,
      candidateValue: candTitle,
      changed: titleChanged,
      concreteObservation: titleChanged
        ? `Título alterado de "${refTitle.slice(0, 60)}" para "${candTitle.slice(0, 60)}".`
        : "Título equivalente ou candidato ainda sem título específico.",
    },
    {
      dimension: "copy",
      label: "Texto Principal & Promessa",
      referenceValue: refBody.slice(0, 140),
      candidateValue: candBody.slice(0, 140),
      changed: bodyChanged,
      concreteObservation: bodyChanged
        ? `Copy alterada (${candBody.length} caracteres na candidata vs ${norm(refAd.creativeBody).length} na ativa).`
        : "Sem alteração textual informada ou cópia indisponível na referência.",
    },
    {
      dimension: "offer",
      label: "Oferta & Preço Confirmado",
      referenceValue: "Conforme copy/criativo ativo na Meta",
      candidateValue:
        [norm(candidate.confirmedPrice), norm(candidate.confirmedOffer), norm(candidate.confirmedVehicleSpecs)]
          .filter(Boolean)
          .join(" • ") || "(nenhum valor confirmado informado)",
      changed: offerChanged,
      concreteObservation: offerChanged
        ? "Candidata explícita com oferta/preço confirmado pelo gestor (sem dedução automática da imagem)."
        : "Sem preço/oferta explícita informada na candidata; verifique se o anúncio exige transparência comercial.",
    },
    {
      dimension: "cta",
      label: "Chamada para Ação (CTA)",
      referenceValue: refCta,
      candidateValue: candCta,
      changed: ctaChanged,
      concreteObservation: ctaChanged
        ? `CTA alterado de "${refCta}" para "${candCta}".`
        : "CTA mantido ou não alterado.",
    },
    {
      dimension: "format",
      label: "Formato / Proporção",
      referenceValue: refFmt,
      candidateValue: candFmt,
      changed: fmtChanged,
      concreteObservation: `Formato pretendido "${candFmt}" comparado ao formato da referência ("${refFmt}").`,
    },
    {
      dimension: "placements",
      label: "Posicionamentos & Área Segura",
      referenceValue: refPlacements,
      candidateValue: candPlacements,
      changed: placementsChanged,
      concreteObservation:
        candFmt === "9:16" || candFmt === "video_vertical" || candidate.intendedPlacements.some((p) => /stories|reels/i.test(p))
          ? "Peça vertical para Stories/Reels exige respeitar margem superior (14%) e inferior (20%) para não cobrir preço/CTA."
          : "Verificar legibilidade em tela mobile (Feed 1:1 / 4:5) na pré-visualização.",
    },
    {
      dimension: "media",
      label: "Mídia & Enquadramento",
      referenceValue: refAd.hasRealThumbnail ? "Mídia sincronizada disponível" : "Prévia não sincronizada na Meta",
      candidateValue: candidate.mediaUrl
        ? `${candidate.mediaKind === "video" ? "Vídeo" : "Imagem"} carregado(a) (${candidate.mediaFileName || "arquivo"})`
        : "Mídia ainda não anexada",
      changed: Boolean(candidate.mediaUrl),
      concreteObservation: candidate.mediaUrl
        ? `Peça candidata com ${candidate.mediaKind === "video" ? "vídeo" : "imagem"} pronto para análise visual (não publicado na Meta).`
        : "Anexe a imagem ou vídeo da peça candidata para validação visual completa.",
    },
    {
      dimension: "destination",
      label: "Destino / Coerência com Objetivo",
      referenceValue: `${refAd.resultLabel} (${refAd.rawObjective || "Objetivo Meta"})`,
      candidateValue: norm(candidate.destinationUrl) || "(destino não informado)",
      changed: Boolean(norm(candidate.destinationUrl)),
      concreteObservation: norm(candidate.destinationUrl)
        ? `Destino informado (${norm(candidate.destinationUrl)}) deve ser coerente com "${refAd.resultLabel}".`
        : `Destino não informado; confirme se leva ao mesmo fluxo de "${refAd.resultLabel}" do anúncio ativo.`,
    },
  ];

  const changedVariables = diffs.filter((d) => d.changed).map((d) => d.label);

  const missingCommercialFacts: string[] = [];
  const combinedText = `${refAd.name} ${candidate.title} ${candidate.headline} ${candidate.primaryText} ${candidate.confirmedVehicleSpecs}`.toLowerCase();
  const looksLikeVehicleAd = /(carro|ve[ií]culo|moto|seminov|sedan|suv|hatch|20\d{2}|fipe|km)/i.test(combinedText);
  if (looksLikeVehicleAd) {
    if (!norm(candidate.confirmedPrice) && !norm(candidate.confirmedOffer)) {
      missingCommercialFacts.push("Preço ou condição comercial confirmada (não deduzido pela imagem).");
    }
    if (!norm(candidate.confirmedVehicleSpecs)) {
      missingCommercialFacts.push("Especificações reais do veículo (ano, versão, km ou garantia, se aplicável).");
    }
  }
  if (!norm(candidate.userHypothesis)) {
    missingCommercialFacts.push("Hipótese explícita do gestor sobre o que esta peça busca testar.");
  }

  return { diffs, changedVariables, missingCommercialFacts };
}

export function buildPeerBenchmarkSummary(input: {
  refAd: CreativeAdRecord;
  sameAccountRecords: CreativeAdRecord[];
  dateFrom: string;
  dateTo: string;
}): PeerBenchmarkSummary {
  const { refAd, sameAccountRecords, dateFrom, dateTo } = input;
  const peers = sameAccountRecords.filter(
    (r) =>
      r.adAccountId === refAd.adAccountId &&
      r.resultCategory === refAd.resultCategory &&
      (!refAd.optimizationGoal || !r.optimizationGoal || r.optimizationGoal === refAd.optimizationGoal) &&
      r.availability !== "no_delivery" &&
      r.availability !== "unavailable" &&
      r.availability !== "permission_missing" &&
      r.spend > 0 &&
      r.impressions > 0
  );

  const totalSpend = peers.reduce((s, p) => s + p.spend, 0);
  const totalResults = peers.reduce((s, p) => s + p.results, 0);
  const weightedUnitCost = computeUnitCost(totalSpend, totalResults, refAd.resultCategory);
  const unitCosts = peers
    .map((p) => p.unitCost)
    .filter((v): v is number => v !== null && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  const hasSufficientSample = peers.length >= 3 && totalResults >= 15 && weightedUnitCost !== null;
  const insufficientReason = hasSufficientSample
    ? null
    : peers.length < 3
      ? `Amostra interna insuficiente: apenas ${peers.length} anúncio(s) compatível(is) na mesma conta e objetivo (mínimo recomendado: 3).`
      : `Volume insuficiente na amostra (${totalResults} ${refAd.resultLabel.toLowerCase()}; mínimo recomendado: 15).`;

  const exploratoryRangeLabel =
    hasSufficientSample && weightedUnitCost !== null
      ? `Estimativa exploratória (banda ±20% sobre pares): R$ ${(weightedUnitCost * 0.8).toFixed(2)} a R$ ${(weightedUnitCost * 1.2).toFixed(2)} por ${refAd.costLabel}`
      : null;

  return {
    hasSufficientSample,
    peerCount: peers.length,
    peerAdIds: peers.map((p) => p.id),
    peerAdNames: peers.map((p) => p.name),
    totalResults,
    totalSpend,
    weightedUnitCost,
    bestPeerUnitCost: unitCosts[0] ?? null,
    worstPeerUnitCost: unitCosts[unitCosts.length - 1] ?? null,
    periodStart: dateFrom,
    periodEnd: dateTo,
    resultCategory: refAd.resultCategory,
    resultUnitLabel: refAd.resultLabel,
    costUnitLabel: refAd.costLabel,
    resultIndicator: refAd.resultIndicator,
    calculationMethod: "Média ponderada (soma de gasto / soma de resultados oficiais) apenas entre anúncios da mesma conta e mesmo objetivo/evento no período.",
    insufficientReason,
    exploratoryRangeLabel,
  };
}

export function buildComparisonAnalysis(input: {
  refAd: CreativeAdRecord;
  candidate: CandidateCreativeInput;
  sameAccountRecords: CreativeAdRecord[];
  dateFrom: string;
  dateTo: string;
}): CreativeComparisonAnalysis {
  const { refAd, candidate, sameAccountRecords, dateFrom, dateTo } = input;
  const { diffs, changedVariables, missingCommercialFacts } = buildObservableComparison(
    refAd,
    candidate
  );
  const benchmark = buildPeerBenchmarkSummary({
    refAd,
    sameAccountRecords,
    dateFrom,
    dateTo,
  });

  const dataLimitations: string[] = [...missingCommercialFacts];
  if (!refAd.hasRealThumbnail) {
    dataLimitations.push("Mídia do anúncio de referência não estava sincronizada; comparação visual parcial.");
  }
  if (!refAd.creativeBody && !refAd.creativeTitle) {
    dataLimitations.push("Copy/título do anúncio de referência não sincronizados na Meta.");
  }
  if (refAd.availability === "no_delivery") {
    dataLimitations.push("Anúncio de referência está ativo na Meta, mas teve entrega zero no período selecionado.");
  } else if (refAd.availability === "unavailable" || refAd.availability === "permission_missing") {
    dataLimitations.push(refAd.availabilityNote || "Métricas do anúncio de referência indisponíveis no período.");
  }
  if (!benchmark.hasSufficientSample && benchmark.insufficientReason) {
    dataLimitations.push(benchmark.insufficientReason);
  }

  const observedMetaFacts: string[] = [
    `Conta: ${refAd.accountName} | Campanha: ${refAd.campaignName} | Conjunto: ${refAd.adSetName}`,
    `Status no Meta: ${refAd.deliveryLabel} | Entrega no período: ${refAd.periodDeliveryLabel}`,
    `Objetivo/Indicador: ${refAd.resultLabel} (${refAd.rawObjective || "N/D"} • janela ${refAd.attributionWindow})`,
    refAd.availability === "unavailable" || refAd.availability === "permission_missing"
      ? `Métricas no período (${dateFrom} a ${dateTo}): dado indisponível (${refAd.availabilityNote || "sem registro"}).`
      : `Período ${dateFrom} a ${dateTo}: Gasto R$ ${refAd.spend.toFixed(2)}, ${refAd.impressions.toLocaleString("pt-BR")} impressões, ${refAd.results.toLocaleString("pt-BR")} ${refAd.resultLabel.toLowerCase()}${refAd.unitCost !== null ? `, ${refAd.costLabel}: R$ ${refAd.unitCost.toFixed(2)}` : ", custo por resultado: —"}.`,
  ];

  const systemInterpretation: string[] = [];
  if (refAd.availability === "no_delivery") {
    systemInterpretation.push(
      "O anúncio de referência está ativo sem entrega no período; não é possível afirmar fadiga ou ineficiência criativa a partir de gasto zero."
    );
  } else if (refAd.performanceSignal === "losing_efficiency") {
    systemInterpretation.push(refAd.signalReason);
  } else if (refAd.performanceSignal === "gaining_volume") {
    systemInterpretation.push(refAd.signalReason);
  } else {
    systemInterpretation.push(refAd.signalReason);
  }

  if (!benchmark.hasSufficientSample) {
    systemInterpretation.push(
      "Ainda não há dados para prever resultado; esta é uma hipótese criativa a validar."
    );
  } else if (benchmark.exploratoryRangeLabel) {
    systemInterpretation.push(
      `Referência interna com ${benchmark.peerCount} anúncios compatíveis (${benchmark.totalResults} ${benchmark.resultUnitLabel.toLowerCase()}): ${benchmark.exploratoryRangeLabel}.`
    );
  }

  const creativeHypothesis =
    candidate.userHypothesis.trim() ||
    (changedVariables.length > 0
      ? `Testar se alterar ${changedVariables.slice(0, 3).join(", ")} melhora ${refAd.costLabel} em "${refAd.campaignName}" mantendo o mesmo público e objetivo (${refAd.resultLabel}).`
      : "Definir claramente qual variável a peça candidata altera antes de iniciar o teste.");

  const recommendations: ComparisonRecommendation[] = [];

  if (changedVariables.length === 0) {
    recommendations.push({
      id: "rec-clarify-change",
      proposedChange: "Diferenciar explicitamente ao menos 1 elemento na peça candidata (gancho, oferta confirmada ou CTA).",
      evidenceReason: "Não foram detectadas diferenças objetivas entre o anúncio ativo e os campos preenchidos da candidata.",
      expectedOutcomeHypothesis: "Sem variação clara, o teste não gera aprendizado útil sobre o que altera a resposta do público.",
      primaryMetric: refAd.costLabel,
      secondaryMetrics: ["CTR (Link)", "Impressões", refAd.resultLabel],
      validityCondition: "Mesma conta, campanha/conjunto compatível e mesma janela de atribuição.",
      confidenceLevel: "baixa",
      confidenceReason: "Peça candidata ainda sem diferenciação observável registrada.",
      dataLimitations,
    });
  } else {
    if (diffs.find((d) => d.dimension === "hook")?.changed) {
      recommendations.push({
        id: "rec-hook",
        proposedChange: `Validar novo gancho ("${candidate.headline.slice(0, 50)}") mantendo o restante do anúncio próximo à referência.`,
        evidenceReason: `Anúncio ativo usa "${refAd.creativeTitle || "sem título destacado"}" e apresentou CTR Link ${refAd.ctrLink !== null ? `${refAd.ctrLink.toFixed(2)}%` : "indisponível"}.`,
        expectedOutcomeHypothesis: `Hipótese: maior clareza inicial pode elevar CTR de link sem comprometer a qualificação em ${refAd.resultLabel.toLowerCase()}.`,
        primaryMetric: refAd.costLabel,
        secondaryMetrics: ["CTR (Link)", "CPC (Link)", refAd.resultLabel],
        validityCondition: "Veicular na mesma conta, mesmo objetivo e público equivalente ao anúncio ativo.",
        confidenceLevel: benchmark.hasSufficientSample ? "média" : "baixa",
        confidenceReason: benchmark.hasSufficientSample
          ? `Baseado em ${benchmark.peerCount} pares compatíveis da mesma conta.`
          : "Sem garantia prévia; depende de validação ao vivo após publicação.",
        dataLimitations,
      });
    }

    if (diffs.find((d) => d.dimension === "offer")?.changed || missingCommercialFacts.length > 0) {
      recommendations.push({
        id: "rec-offer-clarity",
        proposedChange:
          missingCommercialFacts.length > 0
            ? `Completar fatos comerciais confirmados antes de publicar: ${missingCommercialFacts.join(" ")}`
            : "Manter a oferta confirmada visível dentro da zona segura para leitura rápida.",
        evidenceReason:
          missingCommercialFacts.length > 0
            ? "Faltam informações comerciais confirmadas; o sistema não deduz preço, km ou garantia pela imagem."
            : "Oferta comercial explícita diferencia a candidata da referência ativa.",
        expectedOutcomeHypothesis: "Hipótese: transparência de condição reduz cliques curiosos e melhora taxa de conversão.",
        primaryMetric: refAd.costLabel,
        secondaryMetrics: [refAd.resultLabel, "CTR (Link)"],
        validityCondition: "Usar somente valores e condições aprovados pelo cliente/lojista.",
        confidenceLevel: "baixa",
        confidenceReason: "Depende da aderência real da oferta no mercado local.",
        dataLimitations,
      });
    }

    if (diffs.find((d) => d.dimension === "cta")?.changed) {
      recommendations.push({
        id: "rec-cta",
        proposedChange: `Alinhar CTA "${candidate.cta}" exatamente ao evento oficial "${refAd.resultLabel}".`,
        evidenceReason: `Referência usa CTA "${refAd.callToActionType || "não informado"}" enquanto a candidata propõe "${candidate.cta}".`,
        expectedOutcomeHypothesis: "Hipótese: alinhar promessa e CTA reduz abandono entre clique e evento final.",
        primaryMetric: refAd.costLabel,
        secondaryMetrics: ["Cliques no Link", refAd.resultLabel],
        validityCondition: "Destino/URL compatível com o evento medido na Meta.",
        confidenceLevel: "baixa",
        confidenceReason: "Impacto varia conforme fricção da etapa de destino.",
        dataLimitations,
      });
    }
  }

  const isMultiVariableChange = changedVariables.length >= 3;
  const minVolumeByCategory: Record<MetaConversionCategory, string> = {
    PURCHASES: "Aguardar amostra mínima significativa para compras (ex.: pelo menos 15–30 compras ou 7–14 dias na janela 7d_click_1d_view antes de concluir).",
    LEADS: "Aguardar pelo menos 15–25 cadastros por variação ou 1.000+ impressões antes de declarar tendência.",
    MESSAGES: "Aguardar pelo menos 15–20 conversas iniciadas por variação ou 1.000+ impressões antes de decidir.",
    LANDING_PAGE_VIEWS: "Aguardar pelo menos 1.500 impressões e 30+ visualizações de página por variação.",
    INSTAGRAM_PROFILE: "Aguardar pelo menos 1.500 impressões e 30+ visitas ao perfil por variação.",
    CHECKOUT: "Aguardar pelo menos 15–25 finalizações de compra iniciadas por variação antes de concluir.",
    ADD_TO_CART: "Aguardar pelo menos 20–30 adições ao carrinho por variação antes de concluir.",
    REACH: "Avaliar frequência e CPM/alcance após atingir pelo menos 3.000 impressões na janela planejada.",
    ENGAGEMENT: "Aguardar pelo menos 1.500 impressões e engajamentos consistentes antes de concluir.",
    VIDEO_VIEWS: "Aguardar pelo menos 1.500 impressões para comparar hook rate (3s) e hold rate.",
    LINK_CLICKS: "Aguardar pelo menos 1.500 impressões e 40+ cliques no link por variação.",
    UNKNOWN: "Aguardar volume mínimo configurável conforme meta e indicador oficial da conta antes de concluir.",
  };

  const testPlan: ExecutableTestPlan = {
    testableHypothesis: creativeHypothesis,
    primaryVariable:
      changedVariables.length === 1
        ? changedVariables[0]
        : changedVariables.length > 1
          ? `Pacote combinado (${changedVariables.slice(0, 4).join(" + ")})`
          : "Definir variável principal",
    keptConstants: `Mesma conta (${refAd.accountName}), mesma campanha/objetivo (${refAd.resultLabel}), mesmo público/conjunto de comparação e janela ${refAd.attributionWindow}.`,
    primaryMetric: refAd.costLabel,
    secondaryMetrics: ["CTR (Link)", "CPC (Link)", "CPM", refAd.resultLabel],
    referenceAccountId: refAd.adAccountId,
    referenceAccountName: refAd.accountName,
    referenceCampaignName: refAd.campaignName,
    referenceAdId: refAd.id,
    referenceAdName: refAd.name,
    periodLabel: `${dateFrom} a ${dateTo}`,
    attributionWindow: refAd.attributionWindow,
    recommendedMinSampleNote: minVolumeByCategory[refAd.resultCategory],
    readingCriteria:
      "Se houver diferença menor que 15% ou volume abaixo do mínimo, classificar como Inconclusivo / Amostra Insuficiente — nunca forçar vencedor sem dados.",
    isMultiVariableChange,
    changedVariables,
    multiVariableWarning: isMultiVariableChange
      ? `Atenção: a candidata altera ${changedVariables.length} elementos ao mesmo tempo (${changedVariables.join(", ")}). Este teste avaliará o pacote inteiro e não permitirá atribuir o resultado a uma mudança isolada.`
      : null,
    controlledTestSuggestion: isMultiVariableChange
      ? `Versão controlada sugerida: mantenha a copy, oferta e CTA da referência e teste primeiro apenas "${changedVariables[0]}" em uma variação 1:1.`
      : null,
    publicationStatusNote:
      "Peça candidata ainda NÃO publicada na Meta Ads. Nenhuma campanha, conjunto ou anúncio será criado ou alterado automaticamente.",
  };

  return {
    accountId: refAd.adAccountId,
    accountName: refAd.accountName,
    referenceAdId: refAd.id,
    referenceAdName: refAd.name,
    resultCategory: refAd.resultCategory,
    resultIndicator: refAd.resultIndicator,
    observableDiffs: diffs,
    changedVariables,
    missingCommercialFacts,
    benchmark,
    observedMetaFacts,
    systemInterpretation,
    creativeHypothesis,
    postDeliveryValidationNote:
      "Resultado real somente poderá ser confirmado após publicação manual no Meta Ads Manager e coleta de entrega no período correspondente.",
    recommendations,
    testPlan,
    dataLimitations,
  };
}

export function resolveComparisonWorkflowStatus(input: {
  requestedStatus: ComparisonWorkflowStatus;
  publishedAdId?: string | null;
  syncedRecords: CreativeAdRecord[];
  adAccountId: string;
  resultCategory: MetaConversionCategory;
}): {
  status: ComparisonWorkflowStatus;
  linkedAd: CreativeAdRecord | null;
  note: string | null;
} {
  if (!input.publishedAdId) {
    if (input.requestedStatus === "running" || input.requestedStatus === "result_recorded") {
      return {
        status: "ready_for_test",
        linkedAd: null,
        note: "Sem anúncio sincronizado vinculado na Meta, o status não pode ser marcado como em veiculação ou resultado registrado.",
      };
    }
    return { status: input.requestedStatus, linkedAd: null, note: null };
  }

  const matched = input.syncedRecords.find(
    (r) =>
      r.id === input.publishedAdId &&
      r.adAccountId === input.adAccountId &&
      r.resultCategory === input.resultCategory
  );

  if (!matched) {
    return {
      status: "ready_for_test",
      linkedAd: null,
      note: "O anúncio vinculado não foi encontrado nesta conta/objetivo; mantendo como Pronto para teste.",
    };
  }

  const hasObservedResult =
    matched.availability === "active_delivery" ||
    matched.availability === "real_zero_results" ||
    matched.availability === "zero_spend_attributed_result";

  return {
    status: hasObservedResult ? "result_recorded" : "running",
    linkedAd: matched,
    note: null,
  };
}
