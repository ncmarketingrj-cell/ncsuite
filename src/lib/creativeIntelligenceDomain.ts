import {
  classifyMetaEvent,
  computeUnitCost,
  deriveEffectiveCampaignStatus,
  hasEntityDelivery,
  type MetaConversionCategory,
} from "./metricsDomain.ts";

export type CreativeMetricAvailability =
  | "active_delivery"
  | "real_zero_results"
  | "zero_spend_attributed_result"
  | "no_delivery"
  | "unavailable"
  | "permission_missing"
  | "loading";

export type CreativePerformanceSignal =
  | "gaining_volume"
  | "losing_efficiency"
  | "stable"
  | "insufficient_data"
  | "no_delivery";

export type CreativeFatigueStatus =
  | "possible_fatigue"
  | "insufficient_evidence"
  | "not_detected";

export type CreativeTestType =
  | "controlled_single_var"
  | "concept_exploration"
  | "observational_comparison";

export type CreativeTestStatus =
  | "planned"
  | "running"
  | "inconclusive"
  | "concluded"
  | "archived";

export interface CreativeDailyPoint {
  date: string;
  cost: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  purchaseValue: number;
  videoViews: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95: number;
}

export interface CreativeAdRecord {
  id: string;
  externalId: string | null;
  name: string;
  adAccountId: string;
  accountName: string;
  campaignId: string | null;
  campaignName: string;
  campaignExternalId: string | null;
  adSetId: string | null;
  adSetName: string;
  configuredStatus: string;
  effectiveStatus: string;
  deliveryLabel: string;
  rawObjective: string | null;
  optimizationGoal: string | null;
  resultCategory: MetaConversionCategory;
  resultIndicator: string | null;
  resultLabel: string;
  costLabel: string;
  shortBadge: string;
  attributionWindow: string;
  creativeId: string | null;
  creativeName: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  creativeFormat: string | null;
  callToActionType: string | null;
  thumbnailUrl: string | null;
  hasRealThumbnail: boolean;
  adsManagerUrl: string | null;
  placementsSummary: string[];
  createdAt: string | null;
  isNewInPeriod: boolean;
  availability: CreativeMetricAvailability;
  availabilityNote: string | null;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  results: number;
  unitCost: number | null;
  linkClicks: number;
  allClicks: number;
  ctrLink: number | null;
  ctrAll: number | null;
  cpcLink: number | null;
  cpcAll: number | null;
  cpm: number | null;
  purchaseValue: number | null;
  roas: number | null;
  videoMetrics: {
    views: number;
    p25: number;
    p50: number;
    p75: number;
    p95: number;
    hookRatePct: number | null;
    holdRatePct: number | null;
  } | null;
  dailySeries: CreativeDailyPoint[];
  performanceSignal: CreativePerformanceSignal;
  signalReason: string;
  peerBaselineUnitCost: number | null;
  peerCount: number;
  metricOrigin: "meta_period_stats" | "asset_metrics_daily" | "none";
}

export interface ObjectiveBucketSummary {
  category: MetaConversionCategory;
  resultLabel: string;
  costLabel: string;
  shortBadge: string;
  adCount: number;
  deliveredAdCount: number;
  spend: number;
  results: number;
  weightedUnitCost: number | null;
  impressions: number;
  linkClicks: number;
  purchaseValue: number;
  roas: number | null;
}

export interface CreativeManagerOverview {
  totalAds: number;
  activeWithDeliveryCount: number;
  zeroSpendAttributedCount: number;
  noDeliveryCount: number;
  newInPeriodCount: number;
  gainingVolumeCount: number;
  losingEfficiencyCount: number;
  insufficientDataCount: number;
  fatiguePossibleCount: number;
  concentratedGroupsCount: number;
  lowDiversityGroupsCount: number;
  totalsByObjective: ObjectiveBucketSummary[];
  mixedObjectivesDetected: boolean;
}

export interface FatigueDiagnostic {
  adId: string;
  adName: string;
  campaignName: string;
  adAccountId: string;
  resultCategory: MetaConversionCategory;
  costLabel: string;
  status: CreativeFatigueStatus;
  confidence: "low" | "medium" | "high";
  activeDaysCount: number;
  selectedWindowDays: number;
  periodTooShort: boolean;
  firstHalfSpend: number;
  secondHalfSpend: number;
  firstHalfFreq: number | null;
  secondHalfFreq: number | null;
  firstHalfCtrLink: number | null;
  secondHalfCtrLink: number | null;
  firstHalfUnitCost: number | null;
  secondHalfUnitCost: number | null;
  signals: string[];
  alternativeFactors: string[];
  dataCoverageNotes: string[];
  recommendation: string;
}

export interface CreativeDiversityGroup {
  groupId: string;
  groupName: string;
  campaignName: string;
  adAccountId: string;
  activeDeliveredAds: number;
  totalAds: number;
  totalSpend: number;
  topAdName: string | null;
  topAdSpendSharePct: number | null;
  status: "balanced" | "low_diversity" | "single_creative_dominant" | "insufficient_data";
  summary: string;
}

export interface TestEvaluationSummary {
  isComparable: boolean;
  mixedObjectivesWarning: boolean;
  mixedAccountsWarning: boolean;
  recommendedStatus: CreativeTestStatus;
  missingEvidence: string[];
  causalLimitationNote: string;
  variantSummaries: Array<{
    adId: string;
    adName: string;
    resultCategory: MetaConversionCategory;
    costLabel: string;
    spend: number;
    impressions: number;
    results: number;
    unitCost: number | null;
    ctrLink: number | null;
  }>;
}

export interface CreativeUploadValidationResult {
  valid: boolean;
  error: string | null;
}

export const ALLOWED_CREATIVE_UPLOAD_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const ALLOWED_CREATIVE_UPLOAD_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export const MAX_CREATIVE_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export const MIN_TREND_WINDOW_DAYS = 4;
export const MIN_FATIGUE_ACTIVE_DAYS = 4;
export const MIN_FATIGUE_IMPRESSIONS = 800;
export const MIN_FATIGUE_SPEND = 25;
export const MIN_FATIGUE_SECOND_HALF_IMPRESSIONS = 300;

export function detectImageMimeFromMagicBytes(
  bytes: Uint8Array
): "image/png" | "image/jpeg" | "image/webp" | null {
  if (!bytes || bytes.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export function validateCreativeUploadFile(file: {
  name?: string | null;
  type?: string | null;
  size?: number | null;
}): CreativeUploadValidationResult {
  const mime = String(file?.type || "").toLowerCase();
  const size = Number(file?.size ?? 0);
  const rawName = String(file?.name || "").trim().toLowerCase();
  if (rawName) {
    const extMatch = rawName.match(/\.[a-z0-9]+$/);
    if (!extMatch || !ALLOWED_CREATIVE_UPLOAD_EXTENSIONS.has(extMatch[0])) {
      return {
        valid: false,
        error: "Extensão de arquivo inválida. Utilize apenas arquivos .png, .jpg, .jpeg ou .webp.",
      };
    }
  }
  if (!ALLOWED_CREATIVE_UPLOAD_MIME_TYPES.includes(mime as any)) {
    return {
      valid: false,
      error: "Formato não suportado. Envie apenas arquivos PNG, JPG/JPEG ou WEBP.",
    };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      error: "Arquivo vazio ou corrompido. Selecione outra imagem.",
    };
  }
  if (size > MAX_CREATIVE_UPLOAD_BYTES) {
    return {
      valid: false,
      error: "Imagem acima de 8 MB. Reduza o tamanho do arquivo antes de enviar.",
    };
  }
  return { valid: true, error: null };
}

export async function validateCreativeUploadFileBinary(
  file: File | null | undefined
): Promise<CreativeUploadValidationResult> {
  if (!file) {
    return {
      valid: false,
      error: "Selecione uma imagem válida (PNG, JPG ou WEBP) antes de analisar.",
    };
  }
  const metaCheck = validateCreativeUploadFile(file);
  if (!metaCheck.valid) return metaCheck;

  try {
    if (typeof file.slice === "function") {
      const headerBuffer = await file.slice(0, 16).arrayBuffer();
      const detectedMime = detectImageMimeFromMagicBytes(new Uint8Array(headerBuffer));
      if (!detectedMime) {
        return {
          valid: false,
          error: "Conteúdo binário inválido ou arquivo corrompido. Envie uma imagem PNG, JPG ou WEBP real.",
        };
      }
    }
    return { valid: true, error: null };
  } catch {
    return {
      valid: false,
      error: "Não foi possível validar o conteúdo do arquivo selecionado.",
    };
  }
}

export interface ArtFactualValidationResult {
  confirmedFacts: Record<string, string>;
  missingConfirmedFacts: string[];
  canExportWithoutHallucination: boolean;
}

export function extractConfirmedArtFacts(facts: {
  vehicleModel?: string;
  version?: string;
  year?: string;
  price?: string;
  mileage?: string;
  conditions?: string;
  benefits?: string;
  validity?: string;
  cta?: string;
}): ArtFactualValidationResult {
  const entries: Array<[string, string | undefined]> = [
    ["Modelo", facts.vehicleModel],
    ["Versão", facts.version],
    ["Ano", facts.year],
    ["Preço / Entrada", facts.price],
    ["Quilometragem", facts.mileage],
    ["Condições comerciais", facts.conditions],
    ["Benefícios", facts.benefits],
    ["Validade da oferta", facts.validity],
    ["CTA", facts.cta],
  ];
  const confirmedFacts: Record<string, string> = {};
  const missingConfirmedFacts: string[] = [];
  for (const [label, val] of entries) {
    const clean = String(val || "").trim();
    if (clean) {
      confirmedFacts[label] = clean;
    } else if (["Modelo", "CTA"].includes(label)) {
      missingConfirmedFacts.push(label);
    }
  }
  return {
    confirmedFacts,
    missingConfirmedFacts,
    canExportWithoutHallucination: Object.keys(confirmedFacts).length > 0,
  };
}

export function buildMetaAdsManagerAdUrl(adAccountId: string | null | undefined, externalAdId: string | null | undefined): string | null {
  if (!adAccountId || !externalAdId) return null;
  const cleanAccount = String(adAccountId).replace(/^act_/i, "").trim();
  const cleanAdId = String(externalAdId).trim();
  if (!cleanAccount || !cleanAdId) return null;
  return `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${encodeURIComponent(cleanAccount)}&selected_ad_ids=${encodeURIComponent(cleanAdId)}`;
}

function aggregateDailyRowsByDate(rows: any[], dateFrom: string, dateTo: string): CreativeDailyPoint[] {
  const byDate = new Map<string, CreativeDailyPoint>();
  for (const r of rows || []) {
    const d = String(r?.date || "").slice(0, 10);
    if (!d || d < dateFrom || d > dateTo) continue;
    const prev = byDate.get(d) || {
      date: d,
      cost: 0,
      impressions: 0,
      reach: 0,
      frequency: 0,
      clicks: 0,
      linkClicks: 0,
      conversions: 0,
      purchaseValue: 0,
      videoViews: 0,
      videoP25: 0,
      videoP50: 0,
      videoP75: 0,
      videoP95: 0,
    };
    const cost = Number(r.cost || 0);
    const impressions = Number(r.impressions || 0);
    const reach = Number(r.reach || 0);
    const linkClicks = Number(r.inline_link_clicks ?? r.clicks ?? 0);
    const allClicks = Number(r.all_clicks ?? r.clicks ?? 0);
    const conversions = Number(r.conversions || 0);
    const purchaseValue = Number(r.purchase_value || 0);

    prev.cost += cost;
    prev.impressions += impressions;
    prev.reach += reach;
    prev.clicks += allClicks;
    prev.linkClicks += linkClicks;
    prev.conversions += conversions;
    prev.purchaseValue += purchaseValue;
    prev.videoViews += Number(r.video_views || 0);
    prev.videoP25 += Number(r.video_p25 || 0);
    prev.videoP50 += Number(r.video_p50 || 0);
    prev.videoP75 += Number(r.video_p75 || 0);
    prev.videoP95 += Number(r.video_p95 || 0);
    const explicitFreq = Number(r.frequency || 0);
    if (explicitFreq > 0) prev.frequency = explicitFreq;
    byDate.set(d, prev);
  }
  return Array.from(byDate.values())
    .map((pt) => ({
      ...pt,
      frequency: pt.frequency > 0 ? pt.frequency : pt.reach > 0 && pt.impressions > 0 ? pt.impressions / pt.reach : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface BuildCreativeAdRecordInput {
  ad: any;
  accountName: string;
  dateFrom: string;
  dateTo: string;
  periodStat?: any | null;
  dailyRows?: any[];
  placementsSummary?: string[];
  isLoadingMetrics?: boolean;
  permissionMissing?: boolean;
}

export function buildCreativeAdRecord(input: BuildCreativeAdRecordInput): CreativeAdRecord {
  const { ad, periodStat, dailyRows = [], dateFrom, dateTo } = input;
  const camp = ad.campaigns || {};
  const adSet = ad.ad_sets || {};
  const adAccountId = String(ad.ad_account_id || camp.ad_account_id || "");

  // Strict ad_id daily rows only (never mix ad_set_id rows into ad totals)
  const ownDailyRows = dailyRows.filter((r: any) => !r.ad_id || r.ad_id === ad.id);
  const dailySeries = aggregateDailyRowsByDate(ownDailyRows, dateFrom, dateTo);

  const firstSampleRow = ownDailyRows.find((r: any) => r.result_type || r.optimization_goal || r.raw_objective) || {};
  const rawObjective = periodStat?.raw_objective || camp.objective || firstSampleRow.raw_objective || null;
  const optimizationGoal = periodStat?.optimization_goal || firstSampleRow.optimization_goal || null;
  const resultType = periodStat?.result_type || firstSampleRow.result_type || null;
  const resultIndicator = periodStat?.result_indicator || firstSampleRow.result_indicator || null;
  const attributionWindow = periodStat?.attribution_window || firstSampleRow.attribution_window || "7d_click_1d_view";

  const cls = classifyMetaEvent({
    campaignName: camp.name || ad.name || "",
    rawObjective,
    optimizationGoal,
    resultType,
    resultsIndicator: resultIndicator,
  });

  const hasPeriodStat = Boolean(periodStat && periodStat.entity_id === ad.id);
  const hasDaily = dailySeries.length > 0;
  const metricOrigin: CreativeAdRecord["metricOrigin"] = hasPeriodStat
    ? "meta_period_stats"
    : hasDaily
      ? "asset_metrics_daily"
      : "none";

  const sumDaily = dailySeries.reduce(
    (acc, d) => {
      acc.spend += d.cost;
      acc.impressions += d.impressions;
      acc.reach += d.reach;
      acc.linkClicks += d.linkClicks;
      acc.allClicks += d.clicks;
      acc.conversions += d.conversions;
      acc.purchaseValue += d.purchaseValue;
      acc.videoViews += d.videoViews;
      acc.videoP25 += d.videoP25;
      acc.videoP50 += d.videoP50;
      acc.videoP75 += d.videoP75;
      acc.videoP95 += d.videoP95;
      return acc;
    },
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      linkClicks: 0,
      allClicks: 0,
      conversions: 0,
      purchaseValue: 0,
      videoViews: 0,
      videoP25: 0,
      videoP50: 0,
      videoP75: 0,
      videoP95: 0,
    }
  );

  const spend = hasPeriodStat ? Number(periodStat.spend || 0) : sumDaily.spend;
  const impressions = hasPeriodStat ? Number(periodStat.impressions || 0) : sumDaily.impressions;
  const reach = hasPeriodStat ? Number(periodStat.reach || 0) : sumDaily.reach;
  const frequencyRaw = hasPeriodStat
    ? Number(periodStat.frequency || 0) || (reach > 0 && impressions > 0 ? impressions / reach : 0)
    : reach > 0 && impressions > 0
      ? impressions / reach
      : 0;
  const frequency = frequencyRaw > 0 ? frequencyRaw : null;

  const linkClicks = hasPeriodStat
    ? Number(periodStat.inline_link_clicks ?? periodStat.clicks ?? 0)
    : sumDaily.linkClicks;
  const allClicks = hasPeriodStat
    ? Number(periodStat.all_clicks ?? periodStat.clicks ?? linkClicks)
    : sumDaily.allClicks;

  const rawConversions = hasPeriodStat ? Number(periodStat.conversions || 0) : sumDaily.conversions;
  const results =
    cls.category === "REACH" && rawConversions === 0
      ? reach
      : cls.category === "LINK_CLICKS" && rawConversions === 0
        ? linkClicks
        : rawConversions;

  const rawPurchaseVal = hasPeriodStat ? Number(periodStat.purchase_value || 0) : sumDaily.purchaseValue;
  const purchaseValue = cls.category === "PURCHASES" || rawPurchaseVal > 0 ? rawPurchaseVal : null;
  const roas = purchaseValue !== null && spend > 0 ? purchaseValue / spend : null;

  const unitCost = computeUnitCost(spend, results, cls.category);

  const ctrLink = impressions > 0 ? (linkClicks / impressions) * 100 : null;
  const ctrAll = impressions > 0 ? (allClicks / impressions) * 100 : null;
  const cpcLink = linkClicks > 0 && spend > 0 ? spend / linkClicks : null;
  const cpcAll = allClicks > 0 && spend > 0 ? spend / allClicks : null;
  const cpm = impressions > 0 && spend > 0 ? (spend / impressions) * 1000 : null;

  const hasVideoData =
    cls.category === "VIDEO_VIEWS" ||
    sumDaily.videoViews > 0 ||
    sumDaily.videoP25 > 0 ||
    String(ad.creative_format || "").toUpperCase().includes("VIDEO");

  const videoMetrics =
    hasVideoData && sumDaily.videoViews > 0
      ? {
          views: sumDaily.videoViews,
          p25: sumDaily.videoP25,
          p50: sumDaily.videoP50,
          p75: sumDaily.videoP75,
          p95: sumDaily.videoP95,
          hookRatePct: impressions > 0 ? (sumDaily.videoViews / impressions) * 100 : null,
          holdRatePct: sumDaily.videoViews > 0 && sumDaily.videoP95 > 0 ? (sumDaily.videoP95 / sumDaily.videoViews) * 100 : null,
        }
      : null;

  const derivedCampStatus = deriveEffectiveCampaignStatus({
    status: ad.delivery_status || ad.status,
    delivery_status: ad.delivery_status,
    configured_status: ad.configured_status,
    stop_time: camp.stop_time || adSet.end_time,
  });

  let availability: CreativeMetricAvailability = "active_delivery";
  let availabilityNote: string | null = null;

  if (input.isLoadingMetrics) {
    availability = "loading";
    availabilityNote = "Carregando métricas do período...";
  } else if (input.permissionMissing) {
    availability = "permission_missing";
    availabilityNote = "Sem permissão de leitura completa de métricas nesta conta.";
  } else if (!hasPeriodStat && !hasDaily) {
    availability = "unavailable";
    availabilityNote = "Sem registro sincronizado para este período.";
  } else if (spend === 0 && impressions === 0 && reach === 0 && results > 0) {
    availability = "zero_spend_attributed_result";
    availabilityNote = "Resultado atribuído pela Meta no período sem gasto registrado nestas datas.";
  } else if (!hasEntityDelivery({ spend, impressions, reach, conversions: results })) {
    availability = "no_delivery";
    availabilityNote = "Sem entrega no período selecionado.";
  } else if (results === 0) {
    availability = "real_zero_results";
    availabilityNote = "Houve entrega no período, com zero resultados no evento oficial.";
  }

  const createdDate = ad.created_at ? String(ad.created_at).slice(0, 10) : null;
  const isNewInPeriod =
    Boolean(createdDate && createdDate >= dateFrom && createdDate <= dateTo) ||
    (dailySeries.length > 0 && dailySeries[0].date > dateFrom && dailySeries[0].date <= dateTo);

  const thumb = ad.creative_image_url || ad.thumbnail_url || ad.creative_url || null;

  return {
    id: String(ad.id),
    externalId: ad.external_id ? String(ad.external_id) : null,
    name: ad.name || `Anúncio ${ad.id}`,
    adAccountId,
    accountName: input.accountName,
    campaignId: ad.campaign_id ? String(ad.campaign_id) : null,
    campaignName: camp.name || "Campanha não identificada",
    campaignExternalId: camp.external_id ? String(camp.external_id) : null,
    adSetId: ad.ad_set_id ? String(ad.ad_set_id) : null,
    adSetName: adSet.name || "Conjunto não identificado",
    configuredStatus: String(ad.configured_status || ad.status || "ACTIVE").toUpperCase(),
    effectiveStatus: String(ad.delivery_status || derivedCampStatus.code || "UNKNOWN").toUpperCase(),
    deliveryLabel: derivedCampStatus.label || "Ativo",
    rawObjective,
    optimizationGoal,
    resultCategory: cls.category,
    resultIndicator,
    resultLabel: cls.unitPlural,
    costLabel: cls.costUnitLabel,
    shortBadge: cls.shortBadge,
    attributionWindow,
    creativeId: ad.creative_id ? String(ad.creative_id) : null,
    creativeName: ad.creative_name || null,
    creativeTitle: ad.creative_title || null,
    creativeBody: ad.creative_body || null,
    creativeFormat: ad.creative_format || null,
    callToActionType: ad.call_to_action_type || null,
    thumbnailUrl: thumb,
    hasRealThumbnail: Boolean(thumb),
    adsManagerUrl: buildMetaAdsManagerAdUrl(adAccountId, ad.external_id),
    placementsSummary: input.placementsSummary || [],
    createdAt: ad.created_at || null,
    isNewInPeriod,
    availability,
    availabilityNote,
    spend,
    impressions,
    reach,
    frequency,
    results,
    unitCost,
    linkClicks,
    allClicks,
    ctrLink,
    ctrAll,
    cpcLink,
    cpcAll,
    cpm,
    purchaseValue,
    roas,
    videoMetrics,
    dailySeries,
    performanceSignal: availability === "no_delivery" ? "no_delivery" : "insufficient_data",
    signalReason: "Aguardando comparação com pares compatíveis.",
    peerBaselineUnitCost: null,
    peerCount: 0,
    metricOrigin,
  };
}

/**
 * Classifica o sinal comparativo somente entre anúncios da MESMA conta + MESMO objetivo/evento.
 */
export function enrichCreativePeerSignals(records: CreativeAdRecord[]): CreativeAdRecord[] {
  const buckets = new Map<string, CreativeAdRecord[]>();
  for (const r of records) {
    if (r.availability === "no_delivery" || r.availability === "unavailable" || r.spend <= 0 || r.results <= 0) continue;
    const key = `${r.adAccountId}::${r.resultCategory}::${r.optimizationGoal || "NONE"}`;
    const list = buckets.get(key) || [];
    list.push(r);
    buckets.set(key, list);
  }

  return records.map((r) => {
    if (r.availability === "no_delivery") {
      return {
        ...r,
        performanceSignal: "no_delivery",
        signalReason: "Sem entrega (R$ 0 e 0 impressões) no período.",
      };
    }
    if (r.availability === "zero_spend_attributed_result") {
      return {
        ...r,
        performanceSignal: "gaining_volume",
        signalReason: `${r.results} ${r.resultLabel.toLowerCase()} atribuído(s) sem gasto no recorte.`,
      };
    }
    if (r.impressions < 400 || r.spend < 15) {
      return {
        ...r,
        performanceSignal: "insufficient_data",
        signalReason: "Dados insuficientes (< 400 impressões ou < R$ 15 investidos) para classificar eficiência.",
      };
    }

    const key = `${r.adAccountId}::${r.resultCategory}::${r.optimizationGoal || "NONE"}`;
    const peers = buckets.get(key) || [];
    const peerSpend = peers.reduce((s, p) => s + p.spend, 0);
    const peerResults = peers.reduce((s, p) => s + p.results, 0);
    const baseline =
      peers.length >= 2 && peerResults > 0 && peerSpend > 0
        ? computeUnitCost(peerSpend, peerResults, r.resultCategory)
        : null;

    if (r.results === 0) {
      return {
        ...r,
        peerBaselineUnitCost: baseline,
        peerCount: peers.length,
        performanceSignal: r.spend >= 30 ? "losing_efficiency" : "insufficient_data",
        signalReason:
          r.spend >= 30
            ? `R$ ${r.spend.toFixed(2)} investidos sem ${r.resultLabel.toLowerCase()} registrados no período.`
            : "Ainda com volume baixo de gasto e zero resultados no recorte.",
      };
    }

    if (baseline !== null && r.unitCost !== null) {
      if (r.unitCost >= baseline * 1.35) {
        return {
          ...r,
          peerBaselineUnitCost: baseline,
          peerCount: peers.length,
          performanceSignal: "losing_efficiency",
          signalReason: `${r.costLabel} 35%+ acima da média ponderada dos ${peers.length} pares compatíveis da mesma conta.`,
        };
      }
      if (r.unitCost <= baseline * 0.9 || r.results >= 5) {
        return {
          ...r,
          peerBaselineUnitCost: baseline,
          peerCount: peers.length,
          performanceSignal: "gaining_volume",
          signalReason: `${r.results} ${r.resultLabel.toLowerCase()} com ${r.costLabel} competitivo frente aos pares da mesma conta.`,
        };
      }
    }

    return {
      ...r,
      peerBaselineUnitCost: baseline,
      peerCount: peers.length,
      performanceSignal: r.results >= 3 ? "stable" : "insufficient_data",
      signalReason:
        r.results >= 3
          ? "Desempenho compatível com a base da conta no período."
          : "Volume de resultados ainda reduzido para comparação conclusiva.",
    };
  });
}

export function computeInclusiveWindowDays(dateFrom?: string | null, dateTo?: string | null): number | null {
  if (!dateFrom || !dateTo) return null;
  const fromMs = Date.parse(`${String(dateFrom).slice(0, 10)}T00:00:00Z`);
  const toMs = Date.parse(`${String(dateTo).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return null;
  return Math.floor((toMs - fromMs) / 86_400_000) + 1;
}

export function evaluateCreativeFatigue(
  record: CreativeAdRecord,
  options: { dateFrom?: string | null; dateTo?: string | null; minWindowDays?: number } = {}
): FatigueDiagnostic {
  const activeDays = record.dailySeries.filter((d) => d.impressions > 0 || d.cost > 0);
  const minWindowDays = options.minWindowDays ?? MIN_TREND_WINDOW_DAYS;
  const parsedWindowDays = computeInclusiveWindowDays(options.dateFrom, options.dateTo);
  const selectedWindowDays = parsedWindowDays ?? Math.max(activeDays.length, record.dailySeries.length);
  const periodTooShort = parsedWindowDays !== null && parsedWindowDays < minWindowDays;

  const baseAltFactors = [
    "Alteração de orçamento ou público no conjunto de anúncios",
    "Sazonalidade semanal (dias úteis vs fim de semana)",
    "Janela de atribuição e atraso de reporte da Meta",
    "Diferença de posicionamento (Reels, Stories, Feed)",
  ];

  if (
    periodTooShort ||
    activeDays.length < MIN_FATIGUE_ACTIVE_DAYS ||
    record.impressions < MIN_FATIGUE_IMPRESSIONS ||
    record.spend < MIN_FATIGUE_SPEND
  ) {
    const missing: string[] = [];
    if (periodTooShort) {
      missing.push(`período selecionado de ${selectedWindowDays} dia(s) (mín. para tendência: ${minWindowDays} dias)`);
    }
    if (activeDays.length < MIN_FATIGUE_ACTIVE_DAYS) {
      missing.push(
        activeDays.length === 0
          ? "0 dias com entrega registrada no recorte"
          : `apenas ${activeDays.length} dia(s) com entrega (mín.: ${MIN_FATIGUE_ACTIVE_DAYS})`
      );
    }
    if (record.impressions < MIN_FATIGUE_IMPRESSIONS) {
      missing.push(`${record.impressions} impressões (mín.: ${MIN_FATIGUE_IMPRESSIONS})`);
    }
    if (record.spend < MIN_FATIGUE_SPEND) {
      missing.push(`R$ ${record.spend.toFixed(2)} investidos (mín.: R$ ${MIN_FATIGUE_SPEND})`);
    }
    return {
      adId: record.id,
      adName: record.name,
      campaignName: record.campaignName,
      adAccountId: record.adAccountId,
      resultCategory: record.resultCategory,
      costLabel: record.costLabel,
      status: "insufficient_evidence",
      confidence: "low",
      activeDaysCount: activeDays.length,
      selectedWindowDays,
      periodTooShort,
      firstHalfSpend: 0,
      secondHalfSpend: 0,
      firstHalfFreq: null,
      secondHalfFreq: null,
      firstHalfCtrLink: null,
      secondHalfCtrLink: null,
      firstHalfUnitCost: null,
      secondHalfUnitCost: null,
      signals: [],
      alternativeFactors: baseAltFactors,
      dataCoverageNotes: [
        periodTooShort
          ? `Período insuficiente (${selectedWindowDays} dia(s)): ${missing.join("; ")}.`
          : `Evidência insuficiente: ${missing.join("; ")}.`,
      ],
      recommendation: periodTooShort
        ? `Período insuficiente (${selectedWindowDays} dia(s)) para inferir fadiga ou estabilidade. Amplie a janela selecionada para pelo menos 7 dias.`
        : activeDays.length === 0
          ? "Sem dias com entrega neste período; dias zerados não indicam estabilidade nem fadiga."
          : "Manter observação em modo leitura até acumular histórico diário suficiente (mín. 4 dias com entrega, 800 impressões e R$ 25) antes de substituir o criativo.",
    };
  }

  const mid = Math.floor(activeDays.length / 2);
  const firstHalf = activeDays.slice(0, mid);
  const secondHalf = activeDays.slice(mid);

  const summarize = (pts: CreativeDailyPoint[]) => {
    const spend = pts.reduce((s, p) => s + p.cost, 0);
    const impressions = pts.reduce((s, p) => s + p.impressions, 0);
    const reach = pts.reduce((s, p) => s + p.reach, 0);
    const linkClicks = pts.reduce((s, p) => s + p.linkClicks, 0);
    const results = record.resultCategory === "REACH" ? reach : pts.reduce((s, p) => s + p.conversions, 0);
    const explicitFreqPts = pts.filter((p) => p.frequency > 0);
    const freq =
      explicitFreqPts.length > 0
        ? explicitFreqPts.reduce((s, p) => s + p.frequency, 0) / explicitFreqPts.length
        : reach > 0 && impressions > 0
          ? impressions / reach
          : null;
    const ctrLink = impressions > 0 ? (linkClicks / impressions) * 100 : null;
    const unitCost = computeUnitCost(spend, results, record.resultCategory);
    return { spend, impressions, reach, linkClicks, results, freq, ctrLink, unitCost };
  };

  const h1 = summarize(firstHalf);
  const h2 = summarize(secondHalf);
  const signals: string[] = [];

  if (h1.freq !== null && h2.freq !== null && h2.freq >= 2.2 && h2.freq >= h1.freq * 1.15) {
    signals.push(`Frequência subiu de ${h1.freq.toFixed(2)}x para ${h2.freq.toFixed(2)}x`);
  }
  if (h1.ctrLink !== null && h2.ctrLink !== null && h1.ctrLink > 0 && h2.ctrLink <= h1.ctrLink * 0.8) {
    signals.push(`CTR de link recuou de ${h1.ctrLink.toFixed(2)}% para ${h2.ctrLink.toFixed(2)}%`);
  }
  if (h1.unitCost !== null && h2.unitCost !== null && h1.unitCost > 0 && h2.unitCost >= h1.unitCost * 1.25) {
    signals.push(`${record.costLabel} subiu de R$ ${h1.unitCost.toFixed(2)} para R$ ${h2.unitCost.toFixed(2)}`);
  } else if (h1.results >= 3 && h2.results === 0 && h2.spend >= 20) {
    signals.push(`Queda para zero ${record.resultLabel.toLowerCase()} na segunda metade com R$ ${h2.spend.toFixed(2)} gastos`);
  }

  const hasEnoughSecondHalfDelivery = h2.impressions >= MIN_FATIGUE_SECOND_HALF_IMPRESSIONS;
  let status: CreativeFatigueStatus = "not_detected";
  let confidence: "low" | "medium" | "high" = "medium";

  if (!hasEnoughSecondHalfDelivery) {
    status = "insufficient_evidence";
    confidence = "low";
  } else if (signals.length >= 2) {
    status = "possible_fatigue";
    confidence = activeDays.length >= 8 && h1.impressions >= 1000 && h2.impressions >= 1000 ? "high" : "medium";
  } else if (signals.length === 1 && h2.freq !== null && h2.freq >= 3.0) {
    status = "possible_fatigue";
    confidence = "low";
  }

  return {
    adId: record.id,
    adName: record.name,
    campaignName: record.campaignName,
    adAccountId: record.adAccountId,
    resultCategory: record.resultCategory,
    costLabel: record.costLabel,
    status,
    confidence,
    activeDaysCount: activeDays.length,
    selectedWindowDays,
    periodTooShort: false,
    firstHalfSpend: h1.spend,
    secondHalfSpend: h2.spend,
    firstHalfFreq: h1.freq,
    secondHalfFreq: h2.freq,
    firstHalfCtrLink: h1.ctrLink,
    secondHalfCtrLink: h2.ctrLink,
    firstHalfUnitCost: h1.unitCost,
    secondHalfUnitCost: h2.unitCost,
    signals,
    alternativeFactors: baseAltFactors,
    dataCoverageNotes: [
      `Comparação entre ${firstHalf.length} dia(s) iniciais (${h1.impressions} impr.) e ${secondHalf.length} dia(s) finais (${h2.impressions} impr.) no recorte.`,
    ],
    recommendation:
      status === "possible_fatigue"
        ? "Preparar variação de gancho ou ângulo em rascunho/teste controlado para validar recuperação de eficiência, após confirmar orçamento e público."
        : status === "insufficient_evidence"
          ? "Volume recente na segunda metade ainda reduzido; continuar observação antes de concluir fadiga."
          : "Sem convergência de desgaste criativo detectada no recorte diário atual.",
  };
}

export function evaluateCreativeDiversity(records: CreativeAdRecord[]): CreativeDiversityGroup[] {
  const byAdSet = new Map<string, CreativeAdRecord[]>();
  for (const r of records) {
    const key = `${r.adAccountId}::${r.resultCategory}::${r.adSetId || r.campaignId || "group"}`;
    const list = byAdSet.get(key) || [];
    list.push(r);
    byAdSet.set(key, list);
  }

  const out: CreativeDiversityGroup[] = [];
  for (const [groupId, items] of byAdSet.entries()) {
    const delivered = items.filter((i) => i.spend > 0 || i.impressions > 0);
    const totalSpend = delivered.reduce((s, i) => s + i.spend, 0);
    const sortedBySpend = [...delivered].sort((a, b) => b.spend - a.spend);
    const top = sortedBySpend[0] || null;
    const topShare = top && totalSpend > 0 ? (top.spend / totalSpend) * 100 : null;

    let status: CreativeDiversityGroup["status"] = "balanced";
    let summary = "Distribuição de verba equilibrada entre múltiplos criativos ativos.";

    if (delivered.length === 0 || totalSpend < 15) {
      status = "insufficient_data";
      summary = "Sem entrega ou gasto suficiente para avaliar concentração criativa.";
    } else if (delivered.length === 1) {
      status = "single_creative_dominant";
      summary = "Apenas 1 criativo entregando neste conjunto/campanha; dependência total de uma única peça.";
    } else if (topShare !== null && topShare >= 80) {
      status = "single_creative_dominant";
      summary = `1 criativo concentra ${topShare.toFixed(0)}% do investimento deste grupo.`;
    } else if (delivered.length <= 2) {
      status = "low_diversity";
      summary = `Apenas ${delivered.length} criativos com entrega no período.`;
    }

    out.push({
      groupId,
      groupName: items[0]?.adSetName || items[0]?.campaignName || "Grupo",
      campaignName: items[0]?.campaignName || "",
      adAccountId: items[0]?.adAccountId || "",
      activeDeliveredAds: delivered.length,
      totalAds: items.length,
      totalSpend,
      topAdName: top?.name || null,
      topAdSpendSharePct: topShare,
      status,
      summary,
    });
  }

  return out.sort((a, b) => b.totalSpend - a.totalSpend);
}

export function buildCreativeManagerOverview(
  records: CreativeAdRecord[],
  fatigueDiagnostics: FatigueDiagnostic[],
  diversityGroups: CreativeDiversityGroup[] = []
): CreativeManagerOverview {
  const fatigueMap = new Map(fatigueDiagnostics.map((f) => [f.adId, f]));
  const bucketMap = new Map<MetaConversionCategory, ObjectiveBucketSummary>();

  let activeWithDeliveryCount = 0;
  let zeroSpendAttributedCount = 0;
  let noDeliveryCount = 0;
  let newInPeriodCount = 0;
  let gainingVolumeCount = 0;
  let losingEfficiencyCount = 0;
  let insufficientDataCount = 0;
  let fatiguePossibleCount = 0;

  for (const r of records) {
    if (r.availability === "active_delivery" || r.availability === "real_zero_results") activeWithDeliveryCount += 1;
    if (r.availability === "zero_spend_attributed_result") zeroSpendAttributedCount += 1;
    if (r.availability === "no_delivery") noDeliveryCount += 1;
    if (r.isNewInPeriod) newInPeriodCount += 1;
    if (r.performanceSignal === "gaining_volume") gainingVolumeCount += 1;
    if (r.performanceSignal === "losing_efficiency") losingEfficiencyCount += 1;
    if (r.performanceSignal === "insufficient_data") insufficientDataCount += 1;
    if (fatigueMap.get(r.id)?.status === "possible_fatigue") fatiguePossibleCount += 1;

    const bucket = bucketMap.get(r.resultCategory) || {
      category: r.resultCategory,
      resultLabel: r.resultLabel,
      costLabel: r.costLabel,
      shortBadge: r.shortBadge,
      adCount: 0,
      deliveredAdCount: 0,
      spend: 0,
      results: 0,
      weightedUnitCost: null,
      impressions: 0,
      linkClicks: 0,
      purchaseValue: 0,
      roas: null,
    };

    bucket.adCount += 1;
    if (r.spend > 0 || r.impressions > 0 || r.results > 0) bucket.deliveredAdCount += 1;
    bucket.spend += r.spend;
    bucket.results += r.results;
    bucket.impressions += r.impressions;
    bucket.linkClicks += r.linkClicks;
    bucket.purchaseValue += r.purchaseValue || 0;
    bucketMap.set(r.resultCategory, bucket);
  }

  const totalsByObjective = Array.from(bucketMap.values())
    .map((b) => ({
      ...b,
      weightedUnitCost: computeUnitCost(b.spend, b.results, b.category),
      roas: b.purchaseValue > 0 && b.spend > 0 ? b.purchaseValue / b.spend : null,
    }))
    .sort((a, b) => b.spend - a.spend || b.results - a.results);

  const concentratedGroupsCount = diversityGroups.filter((g) => g.status === "single_creative_dominant").length;
  const lowDiversityGroupsCount = diversityGroups.filter((g) => g.status === "low_diversity").length;

  return {
    totalAds: records.length,
    activeWithDeliveryCount,
    zeroSpendAttributedCount,
    noDeliveryCount,
    newInPeriodCount,
    gainingVolumeCount,
    losingEfficiencyCount,
    insufficientDataCount,
    fatiguePossibleCount,
    concentratedGroupsCount,
    lowDiversityGroupsCount,
    totalsByObjective,
    mixedObjectivesDetected: totalsByObjective.length > 1,
  };
}

export function evaluateCreativeTestEvidence(params: {
  testType: CreativeTestType;
  participantAds: CreativeAdRecord[];
}): TestEvaluationSummary {
  const { testType, participantAds } = params;
  const distinctAccounts = new Set(participantAds.map((a) => a.adAccountId));
  const distinctCategories = new Set(participantAds.map((a) => a.resultCategory));
  const mixedAccountsWarning = distinctAccounts.size > 1;
  const mixedObjectivesWarning = distinctCategories.size > 1;
  const missingEvidence: string[] = [];

  if (participantAds.length < 2) {
    missingEvidence.push("Vincule pelo menos 2 anúncios/variações participantes para comparar.");
  }
  if (mixedAccountsWarning) {
    missingEvidence.push("Participantes pertencem a contas de anúncios diferentes.");
  }
  if (mixedObjectivesWarning) {
    missingEvidence.push("Participantes possuem objetivos/unidades de resultado diferentes; comparação direta bloqueada.");
  }

  const deliveredParticipants = participantAds.filter((a) => a.impressions >= 500 && a.spend >= 15);
  if (participantAds.length >= 2 && deliveredParticipants.length < 2) {
    missingEvidence.push("Menos de 2 variantes atingiram amostra mínima (500 impressões e R$ 15 investidos).");
  }
  const withPrimaryResults = participantAds.filter((a) => a.results > 0);
  if (participantAds.length >= 2 && withPrimaryResults.length === 0) {
    missingEvidence.push("Nenhuma variante registrou resultado no evento oficial ainda.");
  }

  const causalLimitationNote =
    testType === "observational_comparison"
      ? "Comparação observacional: diferenças de orçamento, conjunto, público ou período podem explicar o resultado; não declarar causalidade definitiva."
      : testType === "concept_exploration"
        ? "Exploração de conceito: múltiplos elementos variaram; indica direção de ângulo, não efeito isolado de uma única variável."
        : "Teste controlado de variável única: confirme se público, orçamento e janela estiveram estáveis antes de declarar vencedor.";

  return {
    isComparable: !mixedAccountsWarning && !mixedObjectivesWarning && participantAds.length >= 2,
    mixedObjectivesWarning,
    mixedAccountsWarning,
    recommendedStatus: missingEvidence.length > 0 ? "inconclusive" : "running",
    missingEvidence,
    causalLimitationNote,
    variantSummaries: participantAds.map((a) => ({
      adId: a.id,
      adName: a.name,
      resultCategory: a.resultCategory,
      costLabel: a.costLabel,
      spend: a.spend,
      impressions: a.impressions,
      results: a.results,
      unitCost: a.unitCost,
      ctrLink: a.ctrLink,
    })),
  };
}
