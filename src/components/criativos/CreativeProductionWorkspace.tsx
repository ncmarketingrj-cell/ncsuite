import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Bot,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Eye,
  EyeOff,
  FlaskConical,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Palette,
  Plus,
  Redo2,
  RotateCcw,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  EXTERNAL_SUPABASE_ANON_KEY,
  EXTERNAL_SUPABASE_URL,
  supabase,
} from "@/integrations/supabase-external/client";
import { analyzeCreativeFn, type CreativeAIAnalysis } from "@/lib/criativo.functions";
import {
  validateCreativeUploadFile,
  validateCreativeUploadFileBinary,
  type CreativeAdRecord,
} from "@/lib/creativeIntelligenceDomain";
import {
  STUDIO_CREATION_MODES,
  STUDIO_FORMATS,
  STUDIO_PIECE_OBJECTIVES,
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
  getStudioFormatSpec,
  getStudioTemplateSpec,
  pushStudioHistory,
  redoStudioHistory,
  reorderLayerZIndex,
  resolveLibraryAssetBadges,
  resolveStudioAccountContext,
  undoStudioHistory,
  validateStudioExportAndSave,
  validateStudioTestCompatibility,
  type BrandKitLike,
  type ConfirmedCommercialFacts,
  type StudioBackgroundTransform,
  type StudioCreationModeId,
  type StudioExportFormat,
  type StudioFormatId,
  type StudioHistoryStack,
  type StudioLayer,
  type StudioPieceObjective,
  type StudioTemplateCategory,
  type StudioVariationOption,
} from "@/lib/creativeStudioDomain";

export interface BrandKitRow extends BrandKitLike {
  id?: string;
  ad_account_id: string | null;
  client_id?: string | null;
  logo_url?: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  tone_of_voice?: string | null;
  brand_rules?: string | null;
  restrictions?: string | null;
  reference_urls?: string[] | null;
}

export interface SwipeAssetRow {
  id: string;
  title: string;
  media_url?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  ad_account_id?: string | null;
  client_id?: string | null;
  linked_ad_id?: string | null;
  linked_campaign_id?: string | null;
  creative_test_id?: string | null;
  origin?: string | null;
  version?: number | null;
  parent_asset_id?: string | null;
  approval_status?: string | null;
  structured_data?: Record<string, any> | null;
  layer_config?: Record<string, any> | null;
  author_name?: string | null;
  change_history?: Array<{ at: string; by: string; action: string }> | null;
  created_at: string;
}

const APPROVAL_STYLES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "border-border bg-muted text-muted-foreground" },
  pending_review: { label: "Em revisão", cls: "border-amber-500/35 bg-amber-500/10 text-amber-400" },
  in_review: { label: "Em revisão", cls: "border-amber-500/35 bg-amber-500/10 text-amber-400" },
  approved: { label: "Aprovado", cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400" },
  archived: { label: "Arquivado", cls: "border-border bg-muted/40 text-muted-foreground" },
};

const STUDIO_STEPS = [
  { id: 1, label: "1. Conta & Marca" },
  { id: 2, label: "2. Objetivo & Canal" },
  { id: 3, label: "3. Formato & Zonas" },
  { id: 4, label: "4. Fatos Confirmados" },
  { id: 5, label: "5. Modo A/B/C/D" },
  { id: 6, label: "6. Templates & IA" },
  { id: 7, label: "7. Editor de Camadas" },
  { id: 8, label: "8. Exportar & Salvar" },
] as const;

const DEFAULT_FACTS: ConfirmedCommercialFacts = {
  pieceObjective: "mensagens_whatsapp",
  channelDestination: "WhatsApp Direct",
  vehicleOrOfferName: "",
  headlineOffer: "",
  confirmedPrice: "",
  confirmedInstallment: "",
  confirmedDownPayment: "",
  fipeComparison: "",
  confirmedDifferentials: "",
  confirmedCondition: "",
  confirmedCta: "CHAMAR NO WHATSAPP",
  confirmedLocationOrContact: "",
};

const DEFAULT_BG_TRANSFORM: StudioBackgroundTransform = {
  zoom: 1,
  offsetXPct: 0,
  offsetYPct: 0,
  cropMode: "cover",
  overlayOpacity: 0.72,
};

export interface CreativeProductionWorkspaceProps {
  accounts: Array<{ id: string; name: string }>;
  clients: Array<{
    id: string;
    name: string;
    meta_ad_account_id?: string | null;
    niche?: string | null;
    logo_url?: string | null;
    rules?: any;
  }>;
  selectedAccountId: string;
  assets: SwipeAssetRow[];
  brandKits: BrandKitRow[];
  tests: Array<{
    id: string;
    title: string;
    ad_account_id: string;
    objective?: string | null;
    result_unit?: string | null;
  }>;
  records: CreativeAdRecord[];
  canEdit: boolean;
  userId?: string | null;
  userName?: string | null;
  seedVariationAd?: CreativeAdRecord | null;
  onClearSeedVariation: () => void;
}

export function CreativeProductionWorkspace({
  accounts,
  clients,
  selectedAccountId,
  assets,
  brandKits,
  tests,
  records,
  canEdit,
  userId,
  userName,
  seedVariationAd,
  onClearSeedVariation,
}: CreativeProductionWorkspaceProps) {
  const qc = useQueryClient();

  // Conta explícita no Estúdio — nunca pré-seleciona accounts[0] quando selectedAccountId === "all"
  const [explicitAccountId, setExplicitAccountId] = useState<string>(
    seedVariationAd?.adAccountId || (selectedAccountId !== "all" ? selectedAccountId : "")
  );

  useEffect(() => {
    if (seedVariationAd?.adAccountId) {
      setExplicitAccountId(seedVariationAd.adAccountId);
    } else if (selectedAccountId !== "all") {
      setExplicitAccountId(selectedAccountId);
    } else {
      setExplicitAccountId((prev) => prev || "");
    }
  }, [seedVariationAd, selectedAccountId]);

  const accountCtx = useMemo(
    () =>
      resolveStudioAccountContext({
        selectedAccountId,
        explicitStudioAccountId: explicitAccountId,
        seedAdAccountId: seedVariationAd?.adAccountId,
        accounts,
      }),
    [selectedAccountId, explicitAccountId, seedVariationAd, accounts]
  );

  const studioAccountId = accountCtx.effectiveAccountId;
  const currentAccountName = accountCtx.accountName || "Selecione uma conta Meta Ads";
  const matchedClient = clients.find((c) => c.meta_ad_account_id === studioAccountId) || null;
  const matchedKit = brandKits.find((k) => k.ad_account_id === studioAccountId) || null;
  const brandKitHealth = useMemo(
    () => evaluateBrandKitHealth(matchedKit, studioAccountId ? currentAccountName : null),
    [matchedKit, studioAccountId, currentAccountName]
  );

  // ── Brand Kit State ──
  const [showBrandKitModal, setShowBrandKitModal] = useState(false);
  const [bkPrimary, setBkPrimary] = useState(matchedKit?.primary_color || "#E11D48");
  const [bkSecondary, setBkSecondary] = useState(matchedKit?.secondary_color || "#111827");
  const [bkAccent, setBkAccent] = useState(matchedKit?.accent_color || "#F59E0B");
  const [bkFont, setBkFont] = useState(matchedKit?.font_family || "Inter");
  const [bkLogoUrl, setBkLogoUrl] = useState(matchedKit?.logo_url || matchedClient?.logo_url || "");
  const [bkTone, setBkTone] = useState(matchedKit?.tone_of_voice || "");
  const [bkRules, setBkRules] = useState(matchedKit?.brand_rules || "");
  const [bkRestrictions, setBkRestrictions] = useState(matchedKit?.restrictions || "");
  const [bkReferenceUrlsText, setBkReferenceUrlsText] = useState(
    (matchedKit?.reference_urls || []).join("\n")
  );

  useEffect(() => {
    setBkPrimary(matchedKit?.primary_color || "#E11D48");
    setBkSecondary(matchedKit?.secondary_color || "#111827");
    setBkAccent(matchedKit?.accent_color || "#F59E0B");
    setBkFont(matchedKit?.font_family || "Inter");
    setBkLogoUrl(matchedKit?.logo_url || matchedClient?.logo_url || "");
    setBkTone(matchedKit?.tone_of_voice || "");
    setBkRules(matchedKit?.brand_rules || "");
    setBkRestrictions(matchedKit?.restrictions || "");
    setBkReferenceUrlsText((matchedKit?.reference_urls || []).join("\n"));
  }, [matchedKit, matchedClient, studioAccountId]);

  // ── Upload & Visual AI Analyzer Modal ──
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadNiche, setUploadNiche] = useState(matchedClient?.niche || "Automotivo / Concessionária");
  const [uploadLocation, setUploadLocation] = useState("Brasil");
  const [uploadObjectiveHint, setUploadObjectiveHint] = useState("");
  const [uploadTestId, setUploadTestId] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validatingUploadFile, setValidatingUploadFile] = useState(false);
  const [analyzingUpload, setAnalyzingUpload] = useState(false);
  const [uploadProgressLabel, setUploadProgressLabel] = useState<string | null>(null);

  // ── Analysis & History Modals ──
  const [activeAnalysisModal, setActiveAnalysisModal] = useState<{
    asset: SwipeAssetRow;
    analysis: CreativeAIAnalysis;
  } | null>(null);
  const [historyAsset, setHistoryAsset] = useState<SwipeAssetRow | null>(null);

  // ── 8-Step Studio State ──
  const [studioOpen, setStudioOpen] = useState(Boolean(seedVariationAd));
  const [studioStep, setStudioStep] = useState<number>(1);
  const [creationMode, setCreationMode] = useState<StudioCreationModeId>("faithful_composition");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("promo");
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<StudioTemplateCategory | "all">("all");
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);

  const [aspectId, setAspectId] = useState<StudioFormatId>("1:1");
  const [showSafeAreaGuides, setShowSafeAreaGuides] = useState<boolean>(true);
  const [adaptedFormats, setAdaptedFormats] = useState<
    Partial<
      Record<
        StudioFormatId,
        {
          layers: StudioLayer[];
          reviewed: boolean;
          requiresCropConfirmation: boolean;
          cropConfirmed: boolean;
          cropWarningMessage: string | null;
        }
      >
    >
  >({});

  const [facts, setFacts] = useState<ConfirmedCommercialFacts>(DEFAULT_FACTS);
  const [studioTitle, setStudioTitle] = useState("");
  const [linkedAdId, setLinkedAdId] = useState(seedVariationAd?.id || "");
  const [linkedTestId, setLinkedTestId] = useState("");
  const [parentAssetId, setParentAssetId] = useState<string | null>(null);
  const [parentVersion, setParentVersion] = useState<number>(1);

  const [layerHistory, setLayerHistory] = useState<StudioHistoryStack<StudioLayer[]>>(() => ({
    past: [],
    present: createInitialStudioLayers({
      template: getStudioTemplateSpec("promo"),
      brandKit: null,
      facts: DEFAULT_FACTS,
      formatId: "1:1",
    }),
    future: [],
  }));
  const layers = layerHistory.present;
  const [selectedLayerId, setSelectedLayerId] = useState<string>("layer-headline");
  const [bgTransform, setBgTransform] = useState<StudioBackgroundTransform>(DEFAULT_BG_TRANSFORM);

  const [smartVariations, setSmartVariations] = useState<StudioVariationOption[]>([]);
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [aiCostConfirmed, setAiCostConfirmed] = useState(false);
  const [photoBaseUrl, setPhotoBaseUrl] = useState<string | null>(null);
  const [generatedArtUrl, setGeneratedArtUrl] = useState<string | null>(null);
  const [mediaLoadFailed, setMediaLoadFailed] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [compareBeforeAfter, setCompareBeforeAfter] = useState<"after" | "before">("after");
  const [generatingArt, setGeneratingArt] = useState(false);

  const [fullSizePreviewOpen, setFullSizePreviewOpen] = useState(false);
  const [exportMime, setExportMime] = useState<StudioExportFormat>("image/png");
  const [exportQuality, setExportQuality] = useState<number>(0.92);
  const [exportTransparentBg, setExportTransparentBg] = useState<boolean>(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const setLayersWithHistory = (next: StudioLayer[]) => {
    setLayerHistory((prev) => pushStudioHistory(prev, next));
  };

  const resetStudioWorkspace = (initialFacts: ConfirmedCommercialFacts = DEFAULT_FACTS) => {
    const tpl = getStudioTemplateSpec("promo");
    const initLayers = createInitialStudioLayers({
      template: tpl,
      brandKit: matchedKit,
      facts: initialFacts,
      formatId: "1:1",
    });
    setStudioStep(1);
    setCreationMode("faithful_composition");
    setSelectedTemplateId("promo");
    setAspectId("1:1");
    setFacts(initialFacts);
    setLayerHistory({ past: [], present: initLayers, future: [] });
    setSelectedLayerId(initLayers[1]?.id || initLayers[0]?.id || "");
    setBgTransform(DEFAULT_BG_TRANSFORM);
    setAdaptedFormats({});
    setSmartVariations([]);
    setAiCostConfirmed(false);
    setCompareBeforeAfter("after");
  };

  // Seed variation when triggered from CreativeLibrarySection
  useEffect(() => {
    if (seedVariationAd) {
      const nextFacts: ConfirmedCommercialFacts = {
        ...DEFAULT_FACTS,
        vehicleOrOfferName: seedVariationAd.name,
        headlineOffer: seedVariationAd.creativeTitle || seedVariationAd.name,
        confirmedCondition: seedVariationAd.creativeBody?.slice(0, 140) || "",
      };
      setExplicitAccountId(seedVariationAd.adAccountId);
      setLinkedAdId(seedVariationAd.id);
      setStudioTitle(`Variação — ${seedVariationAd.name}`);
      resetStudioWorkspace(nextFacts);
      if (seedVariationAd.hasRealThumbnail && seedVariationAd.thumbnailUrl) {
        setPhotoBaseUrl(seedVariationAd.thumbnailUrl);
      } else {
        setPhotoBaseUrl(null);
      }
      setGeneratedArtUrl(null);
      setStudioOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedVariationAd]);

  // Ads & Tests filtered strictly for chosen account
  const accountAds = useMemo(
    () => (studioAccountId ? records.filter((r) => r.adAccountId === studioAccountId) : []),
    [records, studioAccountId]
  );

  const accountTestsWithCompatibility = useMemo(() => {
    if (!studioAccountId) return [];
    return tests
      .filter((t) => t.ad_account_id === studioAccountId)
      .map((t) => ({
        test: t,
        compatibility: validateStudioTestCompatibility({
          studioAccountId,
          studioObjective: facts.pieceObjective,
          test: t,
        }),
      }));
  }, [tests, studioAccountId, facts.pieceObjective]);

  const currentFormatSpec = useMemo(() => getStudioFormatSpec(aspectId), [aspectId]);
  const safeZoneWarnings = useMemo(
    () => detectOutOfSafeZoneLayers(layers, aspectId),
    [layers, aspectId]
  );

  const webpSupported = useMemo(() => {
    if (typeof document === "undefined") return false;
    try {
      const c = document.createElement("canvas");
      return c.toDataURL("image/webp").startsWith("data:image/webp");
    } catch {
      return false;
    }
  }, []);

  const exportEstimate = useMemo(
    () =>
      estimateExportMetadata({
        formatId: aspectId,
        mimeType: exportMime,
        quality: exportQuality,
        hasTransparentBackground: exportTransparentBg,
      }),
    [aspectId, exportMime, exportQuality, exportTransparentBg]
  );

  // Storage helper
  const uploadToStorage = async (
    blobOrFile: Blob | File,
    ext: string
  ): Promise<{ publicUrl: string; storagePath: string }> => {
    const fileName = `criativos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(fileName, blobOrFile, {
      contentType: blobOrFile.type || `image/${ext}`,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
    return { publicUrl: data.publicUrl, storagePath: fileName };
  };

  // Brand Kit save mutation
  const handleSaveBrandKit = useMutation({
    mutationFn: async () => {
      if (!studioAccountId) throw new Error("Selecione uma conta antes de salvar o Brand Kit.");
      const refs = bkReferenceUrlsText
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => /^https?:\/\//i.test(s));

      const payload = {
        ad_account_id: studioAccountId,
        client_id: matchedClient?.id || null,
        logo_url: bkLogoUrl.trim() || null,
        primary_color: bkPrimary,
        secondary_color: bkSecondary,
        accent_color: bkAccent,
        font_family: bkFont,
        tone_of_voice: bkTone.trim() || null,
        brand_rules: bkRules.trim() || null,
        restrictions: bkRestrictions.trim() || null,
        reference_urls: refs,
        updated_by: userId || null,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase as any)
        .from("creative_brand_kits")
        .upsert(payload, { onConflict: "ad_account_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Brand Kit da conta salvo!");
      qc.invalidateQueries({ queryKey: ["criativos-brand-kit"] });
      setShowBrandKitModal(false);
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao salvar Brand Kit."),
  });

  // Upload Analyzer File Handler
  const handlePickFileForAnalysis = async (file: File | undefined | null) => {
    setUploadError(null);
    if (!file) {
      setUploadFile(null);
      setUploadPreview(null);
      return;
    }
    setValidatingUploadFile(true);
    try {
      const v = await validateCreativeUploadFileBinary(file);
      if (!v.valid) {
        setUploadFile(null);
        setUploadPreview(null);
        setUploadError(v.error);
        toast.error(v.error);
        return;
      }
      setUploadFile(file);
      if (!uploadTitle.trim()) {
        setUploadTitle(file.name.replace(/\.[^.]+$/, ""));
      }
      const reader = new FileReader();
      reader.onload = () => setUploadPreview(String(reader.result || ""));
      reader.onerror = () => {
        setUploadFile(null);
        setUploadPreview(null);
        setUploadError("Não foi possível ler a imagem selecionada.");
      };
      reader.readAsDataURL(file);
    } finally {
      setValidatingUploadFile(false);
    }
  };

  const handleAnalyzeAndSaveUpload = async () => {
    if (!uploadFile || !uploadPreview) {
      setUploadError("Selecione uma imagem PNG, JPG ou WEBP antes de analisar.");
      return;
    }
    if (!uploadTitle.trim()) {
      setUploadError("Informe um título para identificar esta peça na biblioteca.");
      return;
    }
    const recheck = await validateCreativeUploadFileBinary(uploadFile);
    if (!recheck.valid) {
      setUploadError(recheck.error);
      return;
    }

    setAnalyzingUpload(true);
    setUploadError(null);
    let uploadedStoragePath: string | null = null;
    try {
      setUploadProgressLabel("Analisando imagem por IA...");
      const base64 = uploadPreview.includes(",") ? uploadPreview.split(",")[1] : uploadPreview;
      const analysis = await analyzeCreativeFn({
        data: {
          imageBase64: base64,
          mimeType: uploadFile.type || "image/png",
          niche: uploadNiche || "Geral / Negócios",
          location: uploadLocation || "Brasil",
          accountName: studioAccountId ? currentAccountName : "Conta não vinculada",
          objectiveLabel: uploadObjectiveHint || undefined,
          brandRules: bkRules || bkRestrictions || undefined,
        },
      });
      if (!analysis || typeof analysis.score !== "number") {
        throw new Error("A análise de IA retornou resposta incompleta. Tente novamente.");
      }

      setUploadProgressLabel("Enviando arquivo para o Storage...");
      const ext = uploadFile.type.includes("webp")
        ? "webp"
        : uploadFile.type.includes("jpeg")
        ? "jpg"
        : "png";
      const uploaded = await uploadToStorage(uploadFile, ext);
      uploadedStoragePath = uploaded.storagePath;

      setUploadProgressLabel("Salvando registro na biblioteca...");
      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: studioAccountId || null,
        client_id: matchedClient?.id || null,
        creative_test_id: uploadTestId || null,
        title: uploadTitle.trim(),
        media_url: uploaded.publicUrl,
        notes: JSON.stringify(analysis),
        tags: [uploadNiche, studioAccountId ? currentAccountName : "Sem conta", `score:${analysis.score}`],
        origin: "upload",
        version: 1,
        approval_status: "draft",
        author_id: userId || null,
        author_name: userName || "Gestor",
        change_history: [
          {
            at: new Date().toISOString(),
            by: userName || "Gestor",
            action: "Upload e análise visual por IA",
          },
        ],
      });
      if (error) {
        if (uploadedStoragePath) {
          await supabase.storage.from("media").remove([uploadedStoragePath]).catch(() => {});
        }
        throw error;
      }
      toast.success("Peça analisada e salva na biblioteca de produção!");
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadPreview(null);
      setUploadTitle("");
    } catch (err: any) {
      const msg =
        err?.message || "Falha ao analisar e enviar imagem. Nenhuma alteração incompleta foi gravada.";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setUploadProgressLabel(null);
      setAnalyzingUpload(false);
    }
  };

  // Studio Photo Picker (real vehicle/product photo)
  const handlePickPhotoForStudio = (file: File | undefined | null) => {
    if (!file) return;
    const v = validateCreativeUploadFile(file);
    if (!v.valid) {
      toast.error(v.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoBaseUrl(String(reader.result || ""));
      setGeneratedArtUrl(null);
      setCompareBeforeAfter("before");
    };
    reader.readAsDataURL(file);
  };

  // Apply Template safely (preserves confirmed facts, updates theme + badge)
  const handleApplyTemplate = (templateId: string) => {
    const tpl = getStudioTemplateSpec(templateId);
    setSelectedTemplateId(tpl.id);
    setPreviewTemplateId(null);
    setBgTransform((prev) => ({ ...prev, overlayOpacity: tpl.overlayOpacity }));
    const next = layers.map((l) => {
      if (l.kind === "badge") {
        return {
          ...l,
          text: tpl.badgeText,
          backgroundColor: bkAccent || "#E11D48",
        };
      }
      if (l.kind === "cta") {
        return { ...l, backgroundColor: bkAccent || "#E11D48" };
      }
      if (l.kind === "price") {
        return { ...l, color: bkAccent || "#E11D48", backgroundColor: bkPrimary || "#18181b" };
      }
      return l;
    });
    setLayersWithHistory(next);
    toast.success(`Template "${tpl.name}" aplicado às camadas mantendo seus fatos confirmados.`);
  };

  // Apply Confirmed Commercial Facts cleanly to editable layers
  const handleSyncFactsToLayers = () => {
    const confirmed = buildConfirmedCommercialLines(facts);
    const next = layers.map((l) => {
      if (l.kind === "headline") return { ...l, text: confirmed.headline, visible: true };
      if (l.kind === "price") {
        return {
          ...l,
          text: confirmed.priceLine,
          visible: Boolean(confirmed.priceLine),
          backgroundOpacity: confirmed.priceLine ? 0.85 : 0,
        };
      }
      if (l.kind === "subheadline") {
        return { ...l, text: confirmed.subheadline, visible: Boolean(confirmed.subheadline) };
      }
      if (l.kind === "specs") {
        return {
          ...l,
          text: confirmed.specsLine,
          visible: Boolean(confirmed.specsLine),
          backgroundOpacity: confirmed.specsLine ? 0.6 : 0,
        };
      }
      if (l.kind === "cta") return { ...l, text: confirmed.cta, visible: Boolean(confirmed.cta) };
      return l;
    });
    setLayersWithHistory(next);
    toast.success("Fatos confirmados sincronizados com as camadas!");
  };

  // Switch active Studio format & adapt layers into safe zone
  const handleChangeStudioFormat = (nextFormatId: StudioFormatId) => {
    if (nextFormatId === aspectId) return;
    const savedVersion = adaptedFormats[nextFormatId];
    if (savedVersion) {
      setAdaptedFormats((prev) => ({
        ...prev,
        [aspectId]: {
          layers,
          reviewed: prev[aspectId]?.reviewed ?? true,
          requiresCropConfirmation: prev[aspectId]?.requiresCropConfirmation ?? false,
          cropConfirmed: prev[aspectId]?.cropConfirmed ?? true,
          cropWarningMessage: prev[aspectId]?.cropWarningMessage ?? null,
        },
      }));
      setAspectId(nextFormatId);
      setLayerHistory({ past: [], present: savedVersion.layers, future: [] });
      return;
    }

    const adapted = adaptStudioLayersToFormat({
      sourceLayers: layers,
      sourceFormatId: aspectId,
      targetFormatId: nextFormatId,
    });
    setAdaptedFormats((prev) => ({
      ...prev,
      [aspectId]: {
        layers,
        reviewed: true,
        requiresCropConfirmation: false,
        cropConfirmed: true,
        cropWarningMessage: null,
      },
      [nextFormatId]: {
        layers: adapted.layers,
        reviewed: false,
        requiresCropConfirmation: adapted.requiresCropConfirmation,
        cropConfirmed: !adapted.requiresCropConfirmation,
        cropWarningMessage: adapted.cropWarningMessage,
      },
    }));
    setAspectId(nextFormatId);
    setLayerHistory({ past: [], present: adapted.layers, future: [] });
  };

  // Generate Smart Variations locally (zero API cost, confirmed facts only)
  const handleGenerateSmartVariations = () => {
    const tpl = getStudioTemplateSpec(selectedTemplateId);
    const vars = generateSmartVariations({ facts, template: tpl });
    setSmartVariations(vars);
    toast.success("4 variações geradas a partir dos mesmos fatos confirmados.");
  };

  const handleApplyVariation = (v: StudioVariationOption) => {
    const next = layers.map((l) => {
      if (l.kind === "badge") return { ...l, text: v.badgeText };
      if (l.kind === "headline") return { ...l, text: v.headlineText };
      if (l.kind === "price") {
        return { ...l, text: v.priceText, visible: Boolean(v.priceText) };
      }
      if (l.kind === "subheadline") {
        return { ...l, text: v.subheadlineText, visible: Boolean(v.subheadlineText) };
      }
      if (l.kind === "cta") return { ...l, text: v.ctaText };
      return l;
    });
    setLayersWithHistory(next);
    toast.success(`Variação "${v.angleTitle}" aplicada às camadas!`);
  };

  // Generate paid AI art/scenario (Mode B or C) only with explicit confirmation
  const handleGenerateAiArt = async () => {
    if (creationMode !== "ai_scenario" && creationMode !== "ai_generated_art") {
      toast.info("Selecione o Modo B ou C para gerar cenário ou visual com IA.");
      return;
    }
    if (!aiCostConfirmed) {
      toast.error("Confirme o aviso de custo e fidelidade antes de chamar a geração com IA.");
      return;
    }
    if (creationMode === "ai_scenario" && !photoBaseUrl) {
      toast.error("Modo B (Cenário com IA) exige enviar a foto real do veículo/produto primeiro.");
      return;
    }

    setGeneratingArt(true);
    try {
      const confirmed = buildConfirmedCommercialLines(facts);
      const session = (await supabase.auth.getSession()).data.session;
      const mimeMatch = photoBaseUrl?.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);

      const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/generate-art`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || EXTERNAL_SUPABASE_ANON_KEY}`,
          apikey: EXTERNAL_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          mode: creationMode,
          imageBase64:
            creationMode === "ai_scenario" && photoBaseUrl?.startsWith("data:")
              ? photoBaseUrl.split(",")[1]
              : undefined,
          imageMimeType: mimeMatch?.[1] || "image/jpeg",
          vehicleType: facts.vehicleOrOfferName || undefined,
          prompt: [
            customAiPrompt.trim() ||
              "Modern commercial showroom atmosphere with clean negative space for typography.",
            confirmed.confirmedSummary.length
              ? `Contexto confirmado: ${confirmed.confirmedSummary.join("; ")}.`
              : "",
            bkRestrictions ? `Restrições da marca: ${bkRestrictions}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          aspectRatio: currentFormatSpec.apiAspect,
          brandPalette: `${bkPrimary}, ${bkSecondary}, ${bkAccent}`,
          noTextInImage: true,
        }),
      });
      const json = await res.json();
      const url =
        json?.imageUrl ||
        (json?.imageBase64 ? `data:${json?.mimeType || "image/png"};base64,${json.imageBase64}` : null);
      if (!res.ok || !url) {
        throw new Error(json?.error || "Erro ao gerar visual por IA.");
      }
      setGeneratedArtUrl(url);
      setCompareBeforeAfter("after");
      toast.success("Visual gerado sem texto embutido! Suas camadas permanecem 100% editáveis.");
    } catch (err: any) {
      toast.error(err?.message || "Erro na geração por IA.");
    } finally {
      setGeneratingArt(false);
    }
  };

  // Live Canvas Render (supports transparent bg toggle, zoom/pan, crop cover/contain, Brand Kit logo, safe-area guide preview, dynamic z-ordered layers)
  useEffect(() => {
    if (!studioOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = currentFormatSpec.width;
    canvas.height = currentFormatSpec.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderScene = (mainImg?: HTMLImageElement | null, logoImg?: HTMLImageElement | null) => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (!exportTransparentBg) {
        const tpl = getStudioTemplateSpec(selectedTemplateId);
        const grad = ctx.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, bkSecondary || tpl.gradientColors[0]);
        grad.addColorStop(1, tpl.gradientColors[1]);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }

      if (mainImg) {
        const baseScale =
          bgTransform.cropMode === "contain"
            ? Math.min(w / mainImg.width, h / mainImg.height)
            : Math.max(w / mainImg.width, h / mainImg.height);
        const finalScale = baseScale * bgTransform.zoom;
        const dw = mainImg.width * finalScale;
        const dh = mainImg.height * finalScale;
        const dx = (w - dw) / 2 + (bgTransform.offsetXPct / 100) * w;
        const dy = (h - dh) / 2 + (bgTransform.offsetYPct / 100) * h;
        ctx.drawImage(mainImg, dx, dy, dw, dh);
      }

      if (!exportTransparentBg && bgTransform.overlayOpacity > 0) {
        const botGrad = ctx.createLinearGradient(0, h * 0.42, 0, h);
        botGrad.addColorStop(0, "rgba(0,0,0,0)");
        botGrad.addColorStop(1, `rgba(0,0,0,${Math.min(0.95, bgTransform.overlayOpacity)})`);
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, h * 0.42, w, h * 0.58);
      }

      // Brand Kit real logo only (never invented)
      if (logoImg) {
        const safeRight = (1 - currentFormatSpec.safeArea.rightPct) * w;
        const safeTop = (currentFormatSpec.safeArea.topPct + 0.01) * h;
        const maxLogoW = w * 0.16;
        const maxLogoH = h * 0.08;
        const scale = Math.min(maxLogoW / logoImg.width, maxLogoH / logoImg.height);
        const lw = logoImg.width * scale;
        const lh = logoImg.height * scale;
        ctx.drawImage(logoImg, safeRight - lw, safeTop, lw, lh);
      }

      // Dynamic z-ordered layers
      const sortedLayers = [...layers].sort((a, b) => a.zIndex - b.zIndex);
      for (const layer of sortedLayers) {
        if (!layer.visible || !layer.text.trim()) continue;
        const lx = (layer.xPct / 100) * w;
        const ly = (layer.yPct / 100) * h;
        const lw = (layer.widthPct / 100) * w;
        const scaleFactor = w / 1080;
        const fontSize = Math.max(14, Math.round(layer.fontSizePx * scaleFactor));
        ctx.font = `${layer.fontWeight} ${fontSize}px ${bkFont || "Inter"}, sans-serif`;

        // Wrap words inside layer width
        const words = layer.text.trim().split(/\s+/);
        const lines: string[] = [];
        let line = "";
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (ctx.measureText(candidate).width > lw - 24 && line) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        }
        if (line) lines.push(line);

        const lineHeight = fontSize * 1.24;
        const boxHeight = Math.max(fontSize + 20, lines.length * lineHeight + 18);

        if (layer.backgroundColor && layer.backgroundOpacity > 0) {
          ctx.save();
          ctx.globalAlpha = layer.backgroundOpacity;
          ctx.fillStyle = layer.backgroundColor;
          const r = layer.borderRadiusPx;
          ctx.beginPath();
          ctx.roundRect(lx, ly, lw, boxHeight, r);
          ctx.fill();
          ctx.restore();
        }

        ctx.save();
        ctx.fillStyle = layer.color;
        if (layer.shadow) {
          ctx.shadowColor = "rgba(0,0,0,0.65)";
          ctx.shadowBlur = 10;
          ctx.shadowOffsetY = 3;
        }
        ctx.textAlign = layer.align;
        const textX =
          layer.align === "center" ? lx + lw / 2 : layer.align === "right" ? lx + lw - 12 : lx + 12;
        lines.forEach((txt, idx) => {
          ctx.fillText(txt, textX, ly + fontSize + 6 + idx * lineHeight, lw - 20);
        });
        ctx.restore();
      }
    };

    const effectiveBgSrc =
      creationMode === "faithful_composition"
        ? photoBaseUrl
        : creationMode === "ai_scenario"
          ? compareBeforeAfter === "before"
            ? photoBaseUrl
            : generatedArtUrl || photoBaseUrl
          : generatedArtUrl || photoBaseUrl;

    setMediaLoadFailed(false);
    setMediaLoading(Boolean(effectiveBgSrc));

    const loadImage = (src: string | null | undefined, trackMainBg = false) =>
      new Promise<HTMLImageElement | null>((resolve) => {
        if (!src) return resolve(null);
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
          if (trackMainBg) {
            setMediaLoadFailed(false);
            setMediaLoading(false);
          }
          resolve(img);
        };
        img.onerror = () => {
          if (trackMainBg) {
            setMediaLoadFailed(true);
            setMediaLoading(false);
          }
          resolve(null);
        };
        img.src = src;
      });

    void Promise.all([
      loadImage(effectiveBgSrc, true),
      loadImage(brandKitHealth.hasLogo ? bkLogoUrl : null, false),
    ]).then(([bgImg, logoImg]) => {
      renderScene(bgImg, logoImg);
    });
  }, [
    studioOpen,
    currentFormatSpec,
    creationMode,
    compareBeforeAfter,
    photoBaseUrl,
    generatedArtUrl,
    bkPrimary,
    bkSecondary,
    bkAccent,
    bkFont,
    bkLogoUrl,
    brandKitHealth.hasLogo,
    selectedTemplateId,
    layers,
    bgTransform,
    exportTransparentBg,
  ]);

  const activeEffectiveBgSrc =
    creationMode === "faithful_composition"
      ? photoBaseUrl
      : creationMode === "ai_scenario"
        ? compareBeforeAfter === "before"
          ? photoBaseUrl
          : generatedArtUrl || photoBaseUrl
        : generatedArtUrl || photoBaseUrl;

  const exportSaveGuard = useMemo(
    () =>
      validateStudioExportAndSave({
        studioTitle,
        formatId: aspectId,
        layers,
        hasValidMedia: Boolean(activeEffectiveBgSrc),
        mediaFailedToLoad: mediaLoadFailed,
        isRenderingOrLoading: mediaLoading || generatingArt || savingDraft,
        facts,
      }),
    [
      studioTitle,
      aspectId,
      layers,
      activeEffectiveBgSrc,
      mediaLoadFailed,
      mediaLoading,
      generatingArt,
      savingDraft,
      facts,
    ]
  );

  // Save draft or v+1 to Library (never modifies Meta Ads)
  const handleSaveStudioAsset = async (targetApprovalStatus: "draft" | "approved" = "draft") => {
    const guard = validateStudioExportAndSave({
      studioTitle,
      formatId: aspectId,
      layers,
      hasValidMedia: Boolean(activeEffectiveBgSrc),
      mediaFailedToLoad: mediaLoadFailed,
      isRenderingOrLoading: mediaLoading || generatingArt || savingDraft,
      facts,
    });
    if (!guard.canSave) {
      toast.error(guard.saveBlockedReason || "Preencha título e conteúdo real antes de salvar.");
      return;
    }
    if (!studioAccountId) {
      toast.error("Escolha explicitamente uma conta antes de salvar na biblioteca.");
      setStudioStep(1);
      return;
    }
    const currentVersionCheck = adaptedFormats[aspectId];
    if (currentVersionCheck?.requiresCropConfirmation && !currentVersionCheck.cropConfirmed) {
      toast.error("Confirme a revisão do recorte do formato antes de salvar.");
      setStudioStep(3);
      return;
    }
    if (linkedTestId) {
      const selectedTest = tests.find((t) => t.id === linkedTestId);
      if (selectedTest) {
        const compat = validateStudioTestCompatibility({
          studioAccountId,
          studioObjective: facts.pieceObjective,
          test: selectedTest,
        });
        if (!compat.compatible) {
          toast.error(compat.reason || "Teste incompatível com esta conta/objetivo.");
          return;
        }
      }
    }

    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error("Canvas de renderização não está pronto.");
      return;
    }
    setSavingDraft(true);
    let uploadedStoragePath: string | null = null;
    try {
      const mime = exportMime === "image/webp" && !webpSupported ? "image/png" : exportMime;
      const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, mime === "image/png" ? undefined : exportQuality)
      );
      if (!blob) throw new Error("Falha ao renderizar peça para exportação.");
      const uploaded = await uploadToStorage(blob, ext);
      uploadedStoragePath = uploaded.storagePath;
      const publicUrl = uploaded.publicUrl;
      const nextVersion = parentAssetId ? parentVersion + 1 : 1;

      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: studioAccountId,
        client_id: matchedClient?.id || null,
        linked_ad_id: linkedAdId || null,
        linked_campaign_id: records.find((r) => r.id === linkedAdId)?.campaignId || null,
        creative_test_id: linkedTestId || null,
        title: studioTitle.trim(),
        media_url: publicUrl,
        origin: creationMode,
        version: nextVersion,
        parent_asset_id: parentAssetId,
        approval_status: targetApprovalStatus,
        author_id: userId || null,
        author_name: userName || "Gestor",
        structured_data: {
          ...facts,
          creationMode,
          selectedTemplateId,
          aspectId,
          exportFormat: ext,
        },
        layer_config: {
          template: selectedTemplateId,
          aspectId,
          layers,
          bgTransform,
          adaptedFormats,
          bkPrimary,
          bkSecondary,
          bkAccent,
        },
        change_history: [
          {
            at: new Date().toISOString(),
            by: userName || "Gestor",
            action: parentAssetId
              ? `Nova versão v${nextVersion} (${creationMode}) salva como ${targetApprovalStatus === "approved" ? "Aprovado" : "Rascunho"}`
              : `Peça v1 (${creationMode}, ${currentFormatSpec.label}) criada no Estúdio`,
          },
        ],
      });
      if (error) {
        if (uploadedStoragePath) {
          await supabase.storage.from("media").remove([uploadedStoragePath]).catch(() => {});
        }
        throw error;
      }
      toast.success(
        targetApprovalStatus === "approved"
          ? `Criativo v${nextVersion} salvo e marcado como Aprovado na biblioteca!`
          : `Rascunho v${nextVersion} salvo na biblioteca!`
      );
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
      setStudioOpen(false);
      onClearSeedVariation();
    } catch (err: any) {
      if (uploadedStoragePath) {
        await supabase.storage.from("media").remove([uploadedStoragePath]).catch(() => {});
      }
      toast.error(err?.message || "Erro ao salvar peça no repositório.");
    } finally {
      setSavingDraft(false);
    }
  };

  // Export local file (PNG / JPG / WebP)
  const handleDownloadCanvas = () => {
    const guard = validateStudioExportAndSave({
      studioTitle,
      formatId: aspectId,
      layers,
      hasValidMedia: Boolean(activeEffectiveBgSrc),
      mediaFailedToLoad: mediaLoadFailed,
      isRenderingOrLoading: mediaLoading || generatingArt || savingDraft,
      facts,
    });
    if (!guard.canDownload) {
      toast.error(guard.downloadBlockedReason || "Adicione uma mídia ou conteúdo real para baixar.");
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      toast.error("Canvas de renderização não está pronto.");
      return;
    }
    const mime = exportMime === "image/webp" && !webpSupported ? "image/png" : exportMime;
    const ext = mime === "image/jpeg" ? "jpg" : mime === "image/webp" ? "webp" : "png";
    const dataUrl =
      mime === "image/png" ? canvas.toDataURL("image/png") : canvas.toDataURL(mime, exportQuality);
    const link = document.createElement("a");
    link.download = `${(studioTitle || "criativo-ncsuite").replace(/\s+/g, "-").toLowerCase()}-${aspectId.replace(":", "x")}.${ext}`;
    link.href = dataUrl;
    link.click();
    toast.success(`Download iniciado (${exportEstimate.dimensionsLabel} • ${ext.toUpperCase()}).`);
  };

  const duplicateAssetVersion = async (asset: SwipeAssetRow) => {
    const nextVer = (asset.version || 1) + 1;
    try {
      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: asset.ad_account_id || null,
        client_id: asset.client_id || null,
        linked_ad_id: asset.linked_ad_id || null,
        linked_campaign_id: asset.linked_campaign_id || null,
        creative_test_id: asset.creative_test_id || null,
        title: `${asset.title.replace(/\s*\(v\d+\)$/i, "")} (v${nextVer})`,
        media_url: asset.media_url,
        notes: asset.notes,
        tags: asset.tags,
        origin: asset.origin || "faithful_composition",
        version: nextVer,
        parent_asset_id: asset.id,
        approval_status: "draft",
        author_id: userId || null,
        author_name: userName || "Gestor",
        structured_data: asset.structured_data || {},
        layer_config: asset.layer_config || {},
        change_history: [
          ...(asset.change_history || []),
          { at: new Date().toISOString(), by: userName || "Gestor", action: `Duplicado como v${nextVer}` },
        ],
      });
      if (error) throw error;
      toast.success(`Versão v${nextVer} criada sem sobrescrever a original!`);
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao duplicar criativo.");
    }
  };

  const openAssetAsNewVersionInStudio = (asset: SwipeAssetRow) => {
    if (asset.ad_account_id) setExplicitAccountId(asset.ad_account_id);
    setParentAssetId(asset.id);
    setParentVersion(asset.version || 1);
    setStudioTitle(`${asset.title.replace(/\s*\(v\d+\)$/i, "")} (v${(asset.version || 1) + 1})`);
    setLinkedAdId(asset.linked_ad_id || "");
    setLinkedTestId(asset.creative_test_id || "");

    const sd = (asset.structured_data || {}) as Partial<ConfirmedCommercialFacts> & {
      creationMode?: StudioCreationModeId;
      selectedTemplateId?: string;
      aspectId?: StudioFormatId;
    };
    const nextFacts: ConfirmedCommercialFacts = {
      ...DEFAULT_FACTS,
      ...sd,
    };
    setFacts(nextFacts);
    setCreationMode(sd.creationMode || "faithful_composition");
    setSelectedTemplateId(sd.selectedTemplateId || "promo");
    setAspectId(sd.aspectId || "1:1");

    const lc = (asset.layer_config || {}) as {
      layers?: StudioLayer[];
      bgTransform?: StudioBackgroundTransform;
    };
    const restoredLayers =
      Array.isArray(lc.layers) && lc.layers.length > 0
        ? lc.layers
        : createInitialStudioLayers({
            template: getStudioTemplateSpec(sd.selectedTemplateId || "promo"),
            brandKit: matchedKit,
            facts: nextFacts,
            formatId: sd.aspectId || "1:1",
          });
    setLayerHistory({ past: [], present: restoredLayers, future: [] });
    setSelectedLayerId(restoredLayers[0]?.id || "");
    setBgTransform(lc.bgTransform || DEFAULT_BG_TRANSFORM);
    setPhotoBaseUrl(asset.media_url || null);
    setGeneratedArtUrl(null);
    setStudioStep(7);
    setStudioOpen(true);
  };

  const updateApprovalStatus = async (asset: SwipeAssetRow, status: string) => {
    const { error } = await (supabase as any)
      .from("swipe_files")
      .update({
        approval_status: status,
        updated_at: new Date().toISOString(),
        change_history: [
          ...(asset.change_history || []),
          { at: new Date().toISOString(), by: userName || "Gestor", action: `Status alterado para ${status}` },
        ],
      })
      .eq("id", asset.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Status atualizado.");
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
    }
  };

  const renameAsset = async (asset: SwipeAssetRow) => {
    const nextTitle = window.prompt("Novo título da peça:", asset.title);
    if (!nextTitle || nextTitle.trim() === asset.title) return;
    const { error } = await (supabase as any)
      .from("swipe_files")
      .update({
        title: nextTitle.trim(),
        updated_at: new Date().toISOString(),
        change_history: [
          ...(asset.change_history || []),
          { at: new Date().toISOString(), by: userName || "Gestor", action: `Renomeado para "${nextTitle.trim()}"` },
        ],
      })
      .eq("id", asset.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Título atualizado.");
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
    }
  };

  const deleteAsset = async (id: string) => {
    if (!window.confirm("Remover este criativo produzido da biblioteca?")) return;
    const { error } = await (supabase as any).from("swipe_files").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Peça removida.");
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
    }
  };

  const parsedAssets = useMemo(() => {
    return assets.map((a) => {
      let parsedAnalysis: CreativeAIAnalysis | null = null;
      if (a.notes) {
        try {
          const obj = JSON.parse(a.notes);
          if (obj && typeof obj.score === "number") parsedAnalysis = obj as CreativeAIAnalysis;
        } catch {
          // non-JSON notes
        }
      }
      const linkedAd = a.linked_ad_id ? records.find((r) => r.id === a.linked_ad_id) || null : null;
      const linkedTest = a.creative_test_id ? tests.find((t) => t.id === a.creative_test_id) || null : null;
      const badges = resolveLibraryAssetBadges({
        approvalStatus: a.approval_status || "draft",
        linkedAdName: linkedAd?.name ?? null,
        linkedAdResultLabel: linkedAd ? `${linkedAd.resultLabel} • CPA/CPR ${linkedAd.costLabel}` : null,
        linkedTestTitle: linkedTest?.title ?? null,
      });
      return { asset: a, analysis: parsedAnalysis, badges, linkedAd };
    });
  }, [assets, records, tests]);

  const filteredTemplates = useMemo(
    () =>
      templateCategoryFilter === "all"
        ? STUDIO_TEMPLATES
        : STUDIO_TEMPLATES.filter((t) => t.category === templateCategoryFilter),
    [templateCategoryFilter]
  );

  const activeLayer = useMemo(
    () => layers.find((l) => l.id === selectedLayerId) || layers[0] || null,
    [layers, selectedLayerId]
  );

  const updateActiveLayer = (patch: Partial<StudioLayer>) => {
    if (!activeLayer) return;
    const next = layers.map((l) => (l.id === activeLayer.id ? { ...l, ...patch } : l));
    setLayersWithHistory(next);
  };

  return (
    <section className="space-y-5" aria-label="Produção de Criativos e Análise de Peças">
      {/* Cabeçalho Produção vs Inteligência Meta */}
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary/20 border border-primary/35 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
              Produção & Estúdio Criativo
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              Separado da entrega ao vivo da Meta • Rascunhos nunca alteram campanhas no Gerenciador
            </span>
          </div>
          <h3 className="text-base font-black text-foreground">
            Estúdio Guiado (8 Etapas), Brand Kit por Conta, Variações & Análise Visual
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={studioAccountId}
            onChange={(e) => setExplicitAccountId(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
            aria-label="Selecionar conta/cliente para Brand Kit e Estúdio"
          >
            <option value="">
              {selectedAccountId === "all"
                ? "Escolha uma conta para criar no Estúdio..."
                : "Selecione a conta..."}
            </option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  if (!studioAccountId) {
                    toast.error("Escolha uma conta no seletor ao lado antes de editar o Brand Kit.");
                    return;
                  }
                  setShowBrandKitModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 transition cursor-pointer"
              >
                <Palette className="h-3.5 w-3.5 text-primary" /> Brand Kit
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadFile(null);
                  setUploadPreview(null);
                  setUploadTitle("");
                  setUploadError(null);
                  setUploadProgressLabel(null);
                  setUploadModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 transition cursor-pointer"
              >
                <Upload className="h-3.5 w-3.5 text-primary" /> Analisar Novo Anúncio
              </button>
              <button
                type="button"
                onClick={() => {
                  setParentAssetId(null);
                  setParentVersion(1);
                  setLinkedAdId("");
                  setLinkedTestId("");
                  setStudioTitle("");
                  setPhotoBaseUrl(null);
                  setGeneratedArtUrl(null);
                  resetStudioWorkspace(DEFAULT_FACTS);
                  setStudioOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black uppercase text-white hover:bg-primary/90 shadow-glow-sm transition cursor-pointer"
              >
                <Wand2 className="h-3.5 w-3.5" /> Criar Peça no Estúdio
              </button>
            </>
          )}
        </div>
      </div>

      {/* Resumo Brand Kit da Conta Selecionada */}
      {studioAccountId ? (
        <div className="rounded-xl border border-border bg-card/70 px-4 py-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-bold text-foreground">Brand Kit ({currentAccountName}):</span>
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: bkPrimary }} />
                <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: bkSecondary }} />
                <span className="h-3.5 w-3.5 rounded-full border border-white/20" style={{ background: bkAccent }} />
                <span>Fonte: {bkFont}</span>
              </span>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                  brandKitHealth.hasLogo
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-300"
                }`}
              >
                {brandKitHealth.statusLabel}
              </span>
            </div>
            {bkRestrictions && (
              <span className="text-[11px] text-amber-300 font-semibold">Restrições: {bkRestrictions}</span>
            )}
          </div>
          {brandKitHealth.warningMessage && (
            <p className="text-[11px] text-amber-300/90 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {brandKitHealth.warningMessage}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Com <strong>Todas as Contas</strong> ativo no filtro global, selecione explicitamente uma conta acima antes de aplicar Brand Kit ou salvar uma peça para nunca misturar identidade visual entre lojas.
          </span>
        </div>
      )}

      {/* Grid de Biblioteca de Produção & Análises */}
      {parsedAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-10 text-center space-y-2">
          <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-bold text-foreground">
            Nenhuma peça produzida ou analisada para esta conta ainda
          </p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Envie um criativo existente para diagnóstico de IA ou produza novas peças guiadas em 8 etapas no Estúdio sem alterar suas campanhas na Meta.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {parsedAssets.map(({ asset, analysis, badges }) => {
            const appMeta = APPROVAL_STYLES[asset.approval_status || "draft"] || APPROVAL_STYLES.draft;
            return (
              <div
                key={asset.id}
                className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="relative aspect-[16/10] bg-muted/40 overflow-hidden">
                    {asset.media_url ? (
                      <img src={asset.media_url} alt={asset.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">
                        Sem imagem
                      </div>
                    )}
                    <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5">
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${appMeta.cls}`}>
                        {badges.workflowLabel}
                      </span>
                      <span className="rounded-md border border-border/70 bg-black/70 px-2 py-0.5 text-[10px] font-mono text-white">
                        v{asset.version || 1}
                      </span>
                    </div>
                    {analysis && (
                      <span className="absolute top-2.5 right-2.5 rounded-lg bg-black/80 px-2.5 py-1 text-xs font-black text-primary">
                        Score {analysis.score}/100
                      </span>
                    )}
                  </div>

                  <div className="p-3.5 space-y-2">
                    <h4 className="text-sm font-bold text-foreground truncate">{asset.title}</h4>
                    <p className="text-[11px] font-mono text-muted-foreground">
                      Por {asset.author_name || "Equipe"} •{" "}
                      {new Date(asset.created_at).toLocaleDateString("pt-BR")}
                      {asset.structured_data?.aspectId ? ` • ${asset.structured_data.aspectId}` : ""}
                    </p>

                    <div className="flex flex-wrap gap-1.5">
                      {badges.adUsageBadge && (
                        <span className="rounded-md border border-sky-500/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                          {badges.adUsageBadge}
                        </span>
                      )}
                      {badges.observedResultBadge && (
                        <span className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                          {badges.observedResultBadge}
                        </span>
                      )}
                      {badges.testLinkBadge && (
                        <span className="rounded-md border border-purple-500/35 bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold text-purple-300">
                          {badges.testLinkBadge}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="px-3.5 py-2.5 border-t border-border/60 bg-muted/20 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {analysis && (
                      <button
                        type="button"
                        onClick={() => setActiveAnalysisModal({ asset, analysis })}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold hover:border-primary/40 cursor-pointer"
                      >
                        <Eye className="h-3 w-3 text-primary" /> Análise IA
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setHistoryAsset(asset)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold hover:border-primary/40 cursor-pointer"
                      title="Ver histórico de alterações"
                    >
                      <History className="h-3 w-3" />
                    </button>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <select
                        value={asset.approval_status || "draft"}
                        onChange={(e) => void updateApprovalStatus(asset, e.target.value)}
                        className="rounded-lg border border-border bg-background px-1.5 py-1 text-[10px] font-semibold"
                        aria-label="Alterar aprovação"
                      >
                        <option value="draft">Rascunho</option>
                        <option value="pending_review">Em revisão</option>
                        <option value="approved">Aprovado</option>
                        <option value="archived">Arquivado</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => openAssetAsNewVersionInStudio(asset)}
                        className="rounded-lg border border-border bg-card px-2 py-1 text-[10px] font-bold text-primary hover:border-primary/40 cursor-pointer"
                        title="Abrir no Estúdio para criar nova versão v+1"
                      >
                        Editar v+1
                      </button>
                      <button
                        type="button"
                        onClick={() => void renameAsset(asset)}
                        className="rounded-lg border border-border bg-card p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Renomear"
                      >
                        <Layers className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void duplicateAssetVersion(asset)}
                        className="rounded-lg border border-border bg-card p-1 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Duplicar como nova versão sem sobrescrever"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteAsset(asset.id)}
                        className="rounded-lg border border-border bg-card p-1 text-rose-400 hover:border-rose-500/40 cursor-pointer"
                        title="Excluir peça"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Brand Kit por Conta */}
      {showBrandKitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" /> Brand Kit — {currentAccountName}
              </h3>
              <button
                type="button"
                onClick={() => setShowBrandKitModal(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Cor Primária</label>
                <input
                  type="color"
                  value={bkPrimary}
                  onChange={(e) => setBkPrimary(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Cor Secundária</label>
                <input
                  type="color"
                  value={bkSecondary}
                  onChange={(e) => setBkSecondary(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Cor Destaque</label>
                <input
                  type="color"
                  value={bkAccent}
                  onChange={(e) => setBkAccent(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer"
                />
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Fonte Principal</label>
                <select
                  value={bkFont}
                  onChange={(e) => setBkFont(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                >
                  <option value="Inter">Inter (Moderna / Limpa)</option>
                  <option value="Montserrat">Montserrat (Impacto Automotivo)</option>
                  <option value="Georgia">Georgia (Editorial / Premium)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">URL do Logo da Conta (Opcional)</label>
                <input
                  value={bkLogoUrl}
                  onChange={(e) => setBkLogoUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Tom de Voz</label>
                <input
                  value={bkTone}
                  onChange={(e) => setBkTone(e.target.value)}
                  placeholder="Ex: Direto, transparente, atendimento ágil"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Regras e Restrições da Marca</label>
                <textarea
                  value={bkRestrictions}
                  onChange={(e) => setBkRestrictions(e.target.value)}
                  rows={2}
                  placeholder="Ex: Nunca prometer aprovação garantida; sempre informar ano/versão reais."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2"
                />
              </div>
              <div>
                <label className="block font-bold mb-1">Exemplos Autorizados (1 URL por linha)</label>
                <textarea
                  value={bkReferenceUrlsText}
                  onChange={(e) => setBkReferenceUrlsText(e.target.value)}
                  rows={2}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-[11px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setShowBrandKitModal(false)}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={handleSaveBrandKit.isPending}
                onClick={() => handleSaveBrandKit.mutate()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white cursor-pointer"
              >
                {handleSaveBrandKit.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar Brand Kit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upload & Análise Visual (Preservado + Retry explícito) */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Analisar Novo Anúncio por IA
              </h3>
              <button
                type="button"
                onClick={() => setUploadModalOpen(false)}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 p-6 cursor-pointer transition text-center">
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                  className="sr-only"
                  disabled={analyzingUpload || validatingUploadFile}
                  onChange={(e) => {
                    void handlePickFileForAnalysis(e.target.files?.[0]);
                    e.currentTarget.value = "";
                  }}
                />
                {uploadPreview ? (
                  <img
                    src={uploadPreview}
                    alt="Prévia enviada"
                    className="max-h-44 rounded-xl object-contain mb-2"
                  />
                ) : (
                  <Upload className="h-7 w-7 text-primary mb-2" />
                )}
                <span className="font-bold text-foreground">
                  {validatingUploadFile
                    ? "Validando assinatura do arquivo..."
                    : uploadFile
                    ? `${uploadFile.name} (${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)`
                    : "Clique para selecionar PNG, JPG ou WEBP (máx. 8 MB)"}
                </span>
              </label>

              {uploadError && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-2.5 text-rose-300 font-semibold flex items-center justify-between gap-2">
                  <span>{uploadError}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {uploadFile && uploadPreview && uploadTitle.trim() && (
                      <button
                        type="button"
                        onClick={() => void handleAnalyzeAndSaveUpload()}
                        className="inline-flex items-center gap-1 rounded-lg bg-rose-500/25 border border-rose-500/40 px-2 py-1 text-[10px] font-bold hover:bg-rose-500/35 cursor-pointer"
                      >
                        <RotateCcw className="h-3 w-3" /> Tentar novamente
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUploadFile(null);
                        setUploadPreview(null);
                        setUploadError(null);
                      }}
                      className="rounded-lg border border-rose-500/40 px-2 py-1 text-[10px] font-bold hover:bg-rose-500/20 cursor-pointer"
                    >
                      Limpar
                    </button>
                  </div>
                </div>
              )}

              {uploadProgressLabel && (
                <div className="rounded-xl border border-primary/35 bg-primary/10 px-3 py-2 text-primary font-bold flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>{uploadProgressLabel}</span>
                </div>
              )}

              <div>
                <label className="block font-bold mb-1">Título da Peça *</label>
                <input
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  disabled={analyzingUpload}
                  placeholder="Ex: Creta 2024 — Oferta Entrada"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 disabled:opacity-60"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Nicho / Segmento</label>
                  <input
                    value={uploadNiche}
                    onChange={(e) => setUploadNiche(e.target.value)}
                    disabled={analyzingUpload}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Objetivo do Anúncio</label>
                  <input
                    value={uploadObjectiveHint}
                    onChange={(e) => setUploadObjectiveHint(e.target.value)}
                    disabled={analyzingUpload}
                    placeholder="Ex: Mensagens WhatsApp"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Praça / Cidade</label>
                  <input
                    value={uploadLocation}
                    onChange={(e) => setUploadLocation(e.target.value)}
                    disabled={analyzingUpload}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Vincular a Teste (Opcional)</label>
                  <select
                    value={uploadTestId}
                    onChange={(e) => setUploadTestId(e.target.value)}
                    disabled={analyzingUpload}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2"
                  >
                    <option value="">Nenhum</option>
                    {tests
                      .filter((t) => !studioAccountId || t.ad_account_id === studioAccountId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={analyzingUpload}
                onClick={() => {
                  setUploadFile(null);
                  setUploadPreview(null);
                  setUploadError(null);
                  setUploadProgressLabel(null);
                  setUploadModalOpen(false);
                }}
                className="rounded-xl border border-border px-4 py-2 text-xs font-bold disabled:opacity-50 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  analyzingUpload ||
                  validatingUploadFile ||
                  !uploadFile ||
                  !uploadPreview ||
                  Boolean(uploadError) ||
                  !uploadTitle.trim()
                }
                onClick={() => void handleAnalyzeAndSaveUpload()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {analyzingUpload && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {analyzingUpload ? "Processando..." : "Analisar e Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Estúdio Guiado de Produção (8 Etapas) */}
      {studioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
          <div className="w-full max-w-7xl rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-2xl space-y-4 my-auto max-h-[95vh] overflow-y-auto">
            {/* Header + Stepper 8 Etapas */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" /> Estúdio Profissional —{" "}
                  {studioAccountId ? currentAccountName : "Conta pendente"}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Fluxo guiado em 8 etapas • Rascunhos salvos localmente sem publicar na Meta
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setStudioOpen(false);
                  onClearSeedVariation();
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 pb-1">
              {STUDIO_STEPS.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStudioStep(st.id)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition cursor-pointer ${
                    studioStep === st.id
                      ? "border-primary bg-primary text-white"
                      : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Coluna Esquerda: Etapa Atual */}
              <div className="lg:col-span-7 space-y-4 text-xs">
                {/* ETAPA 1: CONTA & BRAND KIT */}
                {studioStep === 1 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <h4 className="font-black uppercase text-foreground">1. Conta & Brand Kit da Marca</h4>
                    <div>
                      <label className="block font-bold mb-1">Conta de Anúncios (Obrigatória)</label>
                      <select
                        value={studioAccountId}
                        onChange={(e) => {
                          setExplicitAccountId(e.target.value);
                          setLinkedAdId("");
                          setLinkedTestId("");
                        }}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2 font-bold"
                      >
                        <option value="">Selecione explicitamente a conta...</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {studioAccountId && (
                      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold">{brandKitHealth.statusLabel}</span>
                          <button
                            type="button"
                            onClick={() => setShowBrandKitModal(true)}
                            className="text-primary font-bold hover:underline cursor-pointer"
                          >
                            Editar Brand Kit
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                          <span>Primária: {bkPrimary}</span>
                          <span>Secundária: {bkSecondary}</span>
                          <span>Destaque: {bkAccent}</span>
                          <span>Fonte: {bkFont}</span>
                        </div>
                        {bkTone && <p className="text-[11px]">Tom de voz: {bkTone}</p>}
                        {bkRestrictions && (
                          <p className="text-[11px] text-amber-300">Restrições: {bkRestrictions}</p>
                        )}
                        {brandKitHealth.warningMessage && (
                          <p className="text-[11px] text-amber-300">{brandKitHealth.warningMessage}</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* ETAPA 2: OBJETIVO & CANAL */}
                {studioStep === 2 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <h4 className="font-black uppercase text-foreground">
                      2. Objetivo da Peça & Canal / Destino
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STUDIO_PIECE_OBJECTIVES.map((obj) => (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() =>
                            setFacts((prev) => ({
                              ...prev,
                              pieceObjective: obj.id,
                              channelDestination: obj.recommendedChannel,
                              confirmedCta: prev.confirmedCta || obj.defaultCta,
                            }))
                          }
                          className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                            facts.pieceObjective === obj.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <p className="font-bold text-foreground">{obj.label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Destino: {obj.recommendedChannel} • Unidades: {obj.compatibleResultUnits.join(", ")}
                          </p>
                        </button>
                      ))}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block font-bold mb-1">Canal / Destino do Clique</label>
                        <input
                          value={facts.channelDestination}
                          onChange={(e) =>
                            setFacts((prev) => ({ ...prev, channelDestination: e.target.value }))
                          }
                          className="w-full rounded-xl border border-border bg-card px-3 py-2"
                        />
                      </div>
                      <div>
                        <label className="block font-bold mb-1">Vincular a Teste Criativo Compatível</label>
                        <select
                          value={linkedTestId}
                          onChange={(e) => setLinkedTestId(e.target.value)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2"
                        >
                          <option value="">Sem vínculo de teste</option>
                          {accountTestsWithCompatibility.map(({ test, compatibility }) => (
                            <option
                              key={test.id}
                              value={test.id}
                              disabled={!compatibility.compatible}
                            >
                              {test.title}
                              {!compatibility.compatible ? " (Incompatível)" : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ETAPA 3: FORMATO, ZONAS SEGURAS & ADAPTAÇÃO MULTI-FORMATO */}
                {studioStep === 3 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <h4 className="font-black uppercase text-foreground">
                      3. Formato, Zonas Seguras & Adaptação Multi-Formato
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {STUDIO_FORMATS.map((fmt) => {
                        const adaptedEntry = adaptedFormats[fmt.id];
                        return (
                          <button
                            key={fmt.id}
                            type="button"
                            onClick={() => handleChangeStudioFormat(fmt.id)}
                            className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                              aspectId === fmt.id
                                ? "border-primary bg-primary/10"
                                : "border-border bg-card"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-black text-foreground">{fmt.label}</p>
                              {adaptedEntry && (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                                    adaptedEntry.reviewed
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-amber-500/20 text-amber-300"
                                  }`}
                                >
                                  {adaptedEntry.reviewed ? "Revisado" : "Adaptado • Revisar"}
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground">{fmt.placementHint}</p>
                          </button>
                        );
                      })}
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="flex items-center gap-2 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={showSafeAreaGuides}
                            onChange={(e) => setShowSafeAreaGuides(e.target.checked)}
                          />
                          Exibir guias de zona segura ({currentFormatSpec.safeArea.label})
                        </label>
                        {adaptedFormats[aspectId] && (
                          <label className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(adaptedFormats[aspectId]?.reviewed)}
                              onChange={(e) =>
                                setAdaptedFormats((prev) => ({
                                  ...prev,
                                  [aspectId]: {
                                    ...(prev[aspectId] || {
                                      layers,
                                      requiresCropConfirmation: false,
                                      cropConfirmed: true,
                                      cropWarningMessage: null,
                                    }),
                                    reviewed: e.target.checked,
                                  },
                                }))
                              }
                            />
                            Versão {currentFormatSpec.shortLabel} revisada
                          </label>
                        )}
                      </div>

                      {adaptedFormats[aspectId]?.requiresCropConfirmation && (
                        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 space-y-1.5 text-amber-200">
                          <p className="font-semibold">
                            {adaptedFormats[aspectId]?.cropWarningMessage}
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(adaptedFormats[aspectId]?.cropConfirmed)}
                                onChange={(e) =>
                                  setAdaptedFormats((prev) => ({
                                    ...prev,
                                    [aspectId]: {
                                      ...(prev[aspectId] || {
                                        layers,
                                        reviewed: true,
                                        requiresCropConfirmation: true,
                                        cropWarningMessage: null,
                                      }),
                                      cropConfirmed: e.target.checked,
                                      reviewed: true,
                                    },
                                  }))
                                }
                              />
                              Confirmo que revisei o enquadramento desta versão
                            </label>
                            <button
                              type="button"
                              onClick={() =>
                                setBgTransform((prev) => ({ ...prev, cropMode: "contain" }))
                              }
                              className="rounded-lg border border-amber-400/50 px-2 py-1 text-[10px] font-bold hover:bg-amber-500/20 cursor-pointer"
                            >
                              Mudar para Sem Corte (Contain)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ETAPA 4: FATOS COMERCIAIS CONFIRMADOS / IMPORTAÇÃO */}
                {studioStep === 4 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-black uppercase text-foreground">
                        4. Fatos Comerciais Confirmados
                      </h4>
                      {accountAds.length > 0 && (
                        <select
                          value={linkedAdId}
                          onChange={(e) => {
                            const adId = e.target.value;
                            setLinkedAdId(adId);
                            const ad = accountAds.find((r) => r.id === adId);
                            if (ad) {
                              setFacts((prev) => ({
                                ...prev,
                                vehicleOrOfferName: ad.name,
                                headlineOffer: ad.creativeTitle || ad.name,
                                confirmedCondition: ad.creativeBody?.slice(0, 140) || "",
                              }));
                              if (ad.hasRealThumbnail && ad.thumbnailUrl) {
                                setPhotoBaseUrl(ad.thumbnailUrl);
                              }
                            }
                          }}
                          className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px]"
                        >
                          <option value="">Importar referência de anúncio real...</option>
                          {accountAds.slice(0, 40).map((ad) => (
                            <option key={ad.id} value={ad.id}>
                              {ad.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <p className="text-[11px] text-emerald-400 font-semibold">
                      Apenas valores e atributos confirmados abaixo entram na peça. Nenhum preço, desconto, quilometragem ou parcela é inventado.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <input
                        value={facts.vehicleOrOfferName}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, vehicleOrOfferName: e.target.value }))
                        }
                        placeholder="Veículo / Oferta real (Ex: Honda Fit LX 2019)"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.headlineOffer}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, headlineOffer: e.target.value }))
                        }
                        placeholder="Headline principal confirmada"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedPrice}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedPrice: e.target.value }))
                        }
                        placeholder="Preço à vista confirmado (Ex: R$ 58.900)"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedInstallment}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedInstallment: e.target.value }))
                        }
                        placeholder="Parcela confirmada (Opcional)"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedDownPayment}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedDownPayment: e.target.value }))
                        }
                        placeholder="Entrada confirmada (Opcional)"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.fipeComparison}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, fipeComparison: e.target.value }))
                        }
                        placeholder="Comparativo FIPE confirmado (Opcional)"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedDifferentials}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedDifferentials: e.target.value }))
                        }
                        placeholder="Diferenciais reais (Ex: Automático, Laudo 100%, 62 mil km)"
                        className="rounded-xl border border-border bg-card px-3 py-2 sm:col-span-2"
                      />
                      <input
                        value={facts.confirmedCondition}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedCondition: e.target.value }))
                        }
                        placeholder="Condições / Validade / Regras reais"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedLocationOrContact}
                        onChange={(e) =>
                          setFacts((prev) => ({
                            ...prev,
                            confirmedLocationOrContact: e.target.value,
                          }))
                        }
                        placeholder="Unidade / Bairro / Contato"
                        className="rounded-xl border border-border bg-card px-3 py-2"
                      />
                      <input
                        value={facts.confirmedCta}
                        onChange={(e) =>
                          setFacts((prev) => ({ ...prev, confirmedCta: e.target.value }))
                        }
                        placeholder="Texto do CTA"
                        className="rounded-xl border border-border bg-card px-3 py-2 sm:col-span-2 font-bold"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleSyncFactsToLayers}
                      className="rounded-xl bg-primary px-3.5 py-2 text-xs font-black uppercase text-white cursor-pointer"
                    >
                      Aplicar Fatos Confirmados nas Camadas
                    </button>
                  </div>
                )}

                {/* ETAPA 5: MODO DE CRIAÇÃO A / B / C / D */}
                {studioStep === 5 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <h4 className="font-black uppercase text-foreground">
                      5. Escolha o Modo de Criação (A / B / C / D)
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {STUDIO_CREATION_MODES.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setCreationMode(m.id);
                            setAiCostConfirmed(false);
                          }}
                          className={`rounded-xl border p-3 text-left transition cursor-pointer ${
                            creationMode === m.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-black text-foreground">{m.label}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${
                                m.usesPaidAi
                                  ? "bg-amber-500/20 text-amber-300"
                                  : "bg-emerald-500/20 text-emerald-300"
                              }`}
                            >
                              {m.usesPaidAi ? "API Paga IA" : "Determinístico"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1">{m.description}</p>
                          <p className="text-[10px] font-mono text-primary mt-1.5">
                            {m.estimatedCostLabel}
                          </p>
                        </button>
                      ))}
                    </div>

                    {STUDIO_CREATION_MODES.find((m) => m.id === creationMode)?.fidelityNotice && (
                      <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-3 text-amber-200 flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-400" />
                        <span>
                          {STUDIO_CREATION_MODES.find((m) => m.id === creationMode)?.fidelityNotice}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* ETAPA 6: TEMPLATES CATEGORIZADOS (14+), FOTO REAL, VARIAÇÕES OU IA */}
                {studioStep === 6 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-black uppercase text-foreground">
                        6. Templates ({STUDIO_TEMPLATES.length} Categorias), Foto & Geração
                      </h4>
                      <select
                        value={templateCategoryFilter}
                        onChange={(e) => setTemplateCategoryFilter(e.target.value as any)}
                        className="rounded-lg border border-border bg-card px-2.5 py-1 text-[11px]"
                      >
                        <option value="all">Todas as 14 categorias</option>
                        {STUDIO_TEMPLATES.map((t) => (
                          <option key={t.category} value={t.category}>
                            {t.categoryLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
                      {filteredTemplates.map((tpl) => (
                        <div
                          key={tpl.id}
                          className={`rounded-xl border p-2.5 space-y-1.5 ${
                            selectedTemplateId === tpl.id
                              ? "border-primary bg-primary/10"
                              : "border-border bg-card"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground">{tpl.name}</span>
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-mono">
                              {tpl.categoryLabel}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{tpl.visualSummary}</p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setPreviewTemplateId(tpl.id)}
                              className="rounded-lg border border-border px-2 py-1 text-[10px] font-bold cursor-pointer"
                            >
                              Prévia antes de aplicar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApplyTemplate(tpl.id)}
                              className="rounded-lg bg-primary px-2 py-1 text-[10px] font-black text-white cursor-pointer"
                            >
                              Aplicar Template
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {previewTemplateId && (
                      <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-bold text-foreground">
                            Prévia: {getStudioTemplateSpec(previewTemplateId).name}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Selo: {getStudioTemplateSpec(previewTemplateId).badgeText} •{" "}
                            {getStudioTemplateSpec(previewTemplateId).suggestedHook}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleApplyTemplate(previewTemplateId)}
                          className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-black text-white cursor-pointer"
                        >
                          Confirmar Template
                        </button>
                      </div>
                    )}

                    {/* Upload da Foto Real */}
                    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                      <label className="block font-bold">
                        Foto Real do Veículo / Produto (Modos A, B ou referência)
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 font-bold cursor-pointer hover:border-primary/40">
                          <Camera className="h-3.5 w-3.5 text-primary" />
                          <span>{photoBaseUrl ? "Trocar Foto Real" : "Enviar Foto Real (PNG/JPG/WEBP)"}</span>
                          <input
                            type="file"
                            accept=".png,.jpg,.jpeg,.webp"
                            className="sr-only"
                            onChange={(e) => {
                              handlePickPhotoForStudio(e.target.files?.[0]);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                        {photoBaseUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              setPhotoBaseUrl(null);
                              setMediaLoadFailed(false);
                            }}
                            className="rounded-lg border border-border px-2.5 py-1.5 text-[11px] text-rose-400 cursor-pointer"
                          >
                            Remover Foto
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Modo D: Variações Inteligentes Locais */}
                    {creationMode === "smart_variations" && (
                      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-black text-emerald-300">
                            Modo D — Variações Inteligentes (Sem Custo de API)
                          </span>
                          <button
                            type="button"
                            onClick={handleGenerateSmartVariations}
                            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-black text-white cursor-pointer"
                          >
                            Gerar 4 Variações
                          </button>
                        </div>
                        {smartVariations.length > 0 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {smartVariations.map((v) => (
                              <div key={v.id} className="rounded-lg border border-border bg-card p-2.5 space-y-1">
                                <p className="font-bold text-foreground">{v.angleTitle}</p>
                                <p className="text-[10px] text-muted-foreground">{v.hookRationale}</p>
                                <p className="text-[11px] font-semibold text-primary">{v.headlineText}</p>
                                {v.priceText && <p className="text-[10px] font-mono">{v.priceText}</p>}
                                <button
                                  type="button"
                                  onClick={() => handleApplyVariation(v)}
                                  className="rounded-md bg-primary px-2 py-1 text-[10px] font-bold text-white cursor-pointer"
                                >
                                  Aplicar Variação
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Modos B / C: Geração por IA com confirmação de custo e Antes/Depois */}
                    {(creationMode === "ai_scenario" || creationMode === "ai_generated_art") && (
                      <div className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 space-y-2.5">
                        <p className="font-black text-amber-300">
                          {creationMode === "ai_scenario"
                            ? "Modo B — Cenário com IA (DALL-E 3 • Texto fica nas camadas editáveis)"
                            : "Modo C — Arte Ilustrativa por IA (DALL-E 3 • Sem texto embutido na imagem)"}
                        </p>
                        <textarea
                          value={customAiPrompt}
                          onChange={(e) => setCustomAiPrompt(e.target.value)}
                          rows={2}
                          placeholder="Descreva o ambiente/iluminação desejado (Ex: showroom automotivo limpo com iluminação suave)..."
                          className="w-full rounded-xl border border-border bg-card px-3 py-2"
                        />
                        <label className="flex items-center gap-2 font-bold text-amber-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={aiCostConfirmed}
                            onChange={(e) => setAiCostConfirmed(e.target.checked)}
                          />
                          Confirmo consumo de geração de imagem por IA (DALL-E 3 HD) e ciência do aviso de fidelidade.
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={generatingArt || !aiCostConfirmed}
                            onClick={() => void handleGenerateAiArt()}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-black uppercase text-white disabled:opacity-50 cursor-pointer"
                          >
                            {generatingArt ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {generatingArt ? "Gerando visual IA..." : "Gerar Visual com IA"}
                          </button>
                          {creationMode === "ai_scenario" && photoBaseUrl && generatedArtUrl && (
                            <div className="inline-flex rounded-lg border border-border bg-card p-0.5">
                              <button
                                type="button"
                                onClick={() => setCompareBeforeAfter("before")}
                                className={`rounded px-2 py-1 text-[10px] font-bold cursor-pointer ${
                                  compareBeforeAfter === "before" ? "bg-primary text-white" : ""
                                }`}
                              >
                                Antes (Foto Original)
                              </button>
                              <button
                                type="button"
                                onClick={() => setCompareBeforeAfter("after")}
                                className={`rounded px-2 py-1 text-[10px] font-bold cursor-pointer ${
                                  compareBeforeAfter === "after" ? "bg-primary text-white" : ""
                                }`}
                              >
                                Depois (Cenário IA)
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ETAPA 7: EDITOR COMPLETO DE CAMADAS, UNDO/REDO, ALINHAMENTO, CROP */}
                {studioStep === 7 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-black uppercase text-foreground">
                        7. Editor de Camadas & Enquadramento
                      </h4>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={layerHistory.past.length === 0}
                          onClick={() => setLayerHistory((s) => undoStudioHistory(s))}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                          title="Desfazer (Undo)"
                        >
                          <Undo2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={layerHistory.future.length === 0}
                          onClick={() => setLayerHistory((s) => redoStudioHistory(s))}
                          className="rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-bold disabled:opacity-40 cursor-pointer"
                          title="Refazer (Redo)"
                        >
                          <Redo2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const maxZ = layers.reduce((m, l) => Math.max(m, l.zIndex), 0);
                            const nextLayer: StudioLayer = {
                              id: `layer-custom-${Date.now().toString(36)}`,
                              kind: "subheadline",
                              label: "Texto Adicional",
                              text: "Novo texto confirmado",
                              xPct: 8,
                              yPct: 45,
                              widthPct: 84,
                              fontSizePx: 28,
                              fontWeight: "700",
                              align: "left",
                              color: "#FFFFFF",
                              backgroundColor: null,
                              backgroundOpacity: 0,
                              borderRadiusPx: 8,
                              shadow: true,
                              visible: true,
                              zIndex: maxZ + 1,
                            };
                            setLayersWithHistory([...layers, nextLayer]);
                            setSelectedLayerId(nextLayer.id);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-bold cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Camada
                        </button>
                      </div>
                    </div>

                    {/* Lista de camadas + Z-order */}
                    <div className="flex flex-wrap gap-1.5">
                      {[...layers]
                        .sort((a, b) => a.zIndex - b.zIndex)
                        .map((layer) => (
                          <button
                            key={layer.id}
                            type="button"
                            onClick={() => setSelectedLayerId(layer.id)}
                            className={`rounded-lg border px-2 py-1 text-[11px] font-bold flex items-center gap-1 cursor-pointer ${
                              activeLayer?.id === layer.id
                                ? "border-primary bg-primary/15 text-foreground"
                                : "border-border bg-card text-muted-foreground"
                            }`}
                          >
                            {layer.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                            {layer.label}
                          </button>
                        ))}
                    </div>

                    {activeLayer && (
                      <div className="rounded-xl border border-border bg-card p-3 space-y-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold text-foreground">Editando: {activeLayer.label}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateActiveLayer({ visible: !activeLayer.visible })
                              }
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold cursor-pointer"
                            >
                              {activeLayer.visible ? "Ocultar" : "Mostrar"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLayersWithHistory(reorderLayerZIndex(layers, activeLayer.id, "up"))
                              }
                              className="rounded border border-border p-1 cursor-pointer"
                              title="Trazer camada para frente"
                            >
                              <ArrowUp className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLayersWithHistory(
                                  reorderLayerZIndex(layers, activeLayer.id, "down")
                                )
                              }
                              className="rounded border border-border p-1 cursor-pointer"
                              title="Enviar camada para trás"
                            >
                              <ArrowDown className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setLayersWithHistory(duplicateStudioLayer(layers, activeLayer.id))
                              }
                              className="rounded border border-border px-2 py-1 text-[10px] font-bold cursor-pointer"
                              title="Duplicar camada"
                            >
                              Duplicar
                            </button>
                          </div>
                        </div>

                        <input
                          value={activeLayer.text}
                          onChange={(e) => updateActiveLayer({ text: e.target.value })}
                          className="w-full rounded-xl border border-border bg-background px-3 py-2 font-bold"
                        />

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold">X (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={90}
                              value={activeLayer.xPct}
                              onChange={(e) => updateActiveLayer({ xPct: Number(e.target.value) })}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold">Y (%)</label>
                            <input
                              type="number"
                              min={0}
                              max={92}
                              value={activeLayer.yPct}
                              onChange={(e) => updateActiveLayer({ yPct: Number(e.target.value) })}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold">Largura (%)</label>
                            <input
                              type="number"
                              min={15}
                              max={100}
                              value={activeLayer.widthPct}
                              onChange={(e) =>
                                updateActiveLayer({ widthPct: Number(e.target.value) })
                              }
                              className="w-full rounded-lg border border-border bg-background px-2 py-1"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold">Tamanho (px)</label>
                            <input
                              type="number"
                              min={14}
                              max={96}
                              value={activeLayer.fontSizePx}
                              onChange={(e) =>
                                updateActiveLayer({ fontSizePx: Number(e.target.value) })
                              }
                              className="w-full rounded-lg border border-border bg-background px-2 py-1"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-center">
                          <select
                            value={activeLayer.align}
                            onChange={(e) =>
                              updateActiveLayer({
                                align: e.target.value as "left" | "center" | "right",
                              })
                            }
                            className="rounded-lg border border-border bg-background px-2 py-1.5"
                          >
                            <option value="left">Alinhar Esq.</option>
                            <option value="center">Centralizar</option>
                            <option value="right">Alinhar Dir.</option>
                          </select>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold">Texto</span>
                            <input
                              type="color"
                              value={activeLayer.color}
                              onChange={(e) => updateActiveLayer({ color: e.target.value })}
                              className="h-7 w-full rounded border border-border cursor-pointer"
                            />
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold">Fundo</span>
                            <input
                              type="color"
                              value={activeLayer.backgroundColor || "#09090b"}
                              onChange={(e) =>
                                updateActiveLayer({
                                  backgroundColor: e.target.value,
                                  backgroundOpacity: activeLayer.backgroundOpacity || 0.85,
                                })
                              }
                              className="h-7 w-full rounded border border-border cursor-pointer"
                            />
                          </div>
                          <label className="flex items-center gap-1.5 font-bold cursor-pointer">
                            <input
                              type="checkbox"
                              checked={activeLayer.shadow}
                              onChange={(e) => updateActiveLayer({ shadow: e.target.checked })}
                            />
                            Sombra
                          </label>
                        </div>

                        {/* Auxiliares de alinhamento e zona segura */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {(
                            [
                              ["left", "Margem Esq."],
                              ["center-x", "Centro X"],
                              ["right", "Margem Dir."],
                              ["top-safe", "Topo Seguro"],
                              ["bottom-safe", "Base Segura"],
                              ["fit-safe-width", "Largura Útil"],
                            ] as const
                          ).map(([key, label]) => (
                            <button
                              key={key}
                              type="button"
                              onClick={() =>
                                updateActiveLayer(
                                  alignLayerToMargins(activeLayer, aspectId, key)
                                )
                              }
                              className="rounded-md border border-border bg-background px-2 py-1 text-[10px] font-bold hover:border-primary/40 cursor-pointer"
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Ajuste de Foto/Fundo */}
                    <div className="rounded-xl border border-border bg-card p-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold">Zoom Foto ({bgTransform.zoom}x)</label>
                        <input
                          type="range"
                          min={0.7}
                          max={2.2}
                          step={0.05}
                          value={bgTransform.zoom}
                          onChange={(e) =>
                            setBgTransform((p) => ({ ...p, zoom: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold">Pan X ({bgTransform.offsetXPct}%)</label>
                        <input
                          type="range"
                          min={-40}
                          max={40}
                          step={1}
                          value={bgTransform.offsetXPct}
                          onChange={(e) =>
                            setBgTransform((p) => ({ ...p, offsetXPct: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold">Pan Y ({bgTransform.offsetYPct}%)</label>
                        <input
                          type="range"
                          min={-40}
                          max={40}
                          step={1}
                          value={bgTransform.offsetYPct}
                          onChange={(e) =>
                            setBgTransform((p) => ({ ...p, offsetYPct: Number(e.target.value) }))
                          }
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold">Enquadramento</label>
                        <select
                          value={bgTransform.cropMode}
                          onChange={(e) =>
                            setBgTransform((p) => ({
                              ...p,
                              cropMode: e.target.value as "cover" | "contain",
                            }))
                          }
                          className="w-full rounded-lg border border-border bg-background px-2 py-1"
                        >
                          <option value="cover">Preencher (Cover)</option>
                          <option value="contain">Conter (Sem corte)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* ETAPA 8: EXPORTAÇÃO & SALVAR RASCUNHO */}
                {studioStep === 8 && (
                  <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
                    <h4 className="font-black uppercase text-foreground">
                      8. Exportação & Biblioteca (Nunca publica automaticamente na Meta)
                    </h4>

                    <div>
                      <label className="block font-bold mb-1">Título da Peça / Versão</label>
                      <input
                        value={studioTitle}
                        onChange={(e) => setStudioTitle(e.target.value)}
                        placeholder={`Ex: ${facts.vehicleOrOfferName || "Peça"} — ${currentFormatSpec.shortLabel}`}
                        className="w-full rounded-xl border border-border bg-card px-3 py-2"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block font-bold mb-1">Formato do Arquivo</label>
                        <select
                          value={exportMime}
                          onChange={(e) => setExportMime(e.target.value as StudioExportFormat)}
                          className="w-full rounded-xl border border-border bg-card px-3 py-2"
                        >
                          <option value="image/png">PNG (Sem perdas)</option>
                          <option value="image/jpeg">JPG (Leve universal)</option>
                          {webpSupported && <option value="image/webp">WebP (Otimizado)</option>}
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold mb-1">
                          Qualidade ({Math.round(exportQuality * 100)}%)
                        </label>
                        <input
                          type="range"
                          min={0.6}
                          max={0.98}
                          step={0.02}
                          disabled={exportMime === "image/png"}
                          value={exportQuality}
                          onChange={(e) => setExportQuality(Number(e.target.value))}
                          className="w-full mt-2"
                        />
                      </div>
                      <label className="flex items-center gap-2 font-bold pt-5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportTransparentBg}
                          disabled={exportMime === "image/jpeg"}
                          onChange={(e) => setExportTransparentBg(e.target.checked)}
                        />
                        Fundo transparente
                      </label>
                    </div>

                    <div className="rounded-xl border border-border bg-card p-3 space-y-1 text-[11px]">
                      <p className="font-bold text-foreground">
                        Prévia da Exportação: {exportEstimate.dimensionsLabel} •{" "}
                        {exportEstimate.formatLabel} • {exportEstimate.qualityLabel} • Tamanho estimado:{" "}
                        {exportEstimate.estimatedSizeLabel}
                      </p>
                      <p className="text-muted-foreground">{exportEstimate.transparencyNote}</p>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-1">
                      <button
                        type="button"
                        disabled={!exportSaveGuard.canDownload}
                        onClick={handleDownloadCanvas}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2 text-xs font-bold hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Download className="h-3.5 w-3.5 text-primary" /> Baixar Arquivo
                      </button>
                      <button
                        type="button"
                        disabled={savingDraft || !exportSaveGuard.canSave}
                        onClick={() => void handleSaveStudioAsset("draft")}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {savingDraft ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        {parentAssetId ? `Salvar Nova Versão v${parentVersion + 1}` : "Salvar Rascunho na Biblioteca"}
                      </button>
                    </div>
                    {(!exportSaveGuard.canDownload || !exportSaveGuard.canSave) && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200 space-y-1">
                        {!exportSaveGuard.canDownload && exportSaveGuard.downloadBlockedReason && (
                          <p>
                            <span className="font-bold">Download bloqueado:</span>{" "}
                            {exportSaveGuard.downloadBlockedReason}
                          </p>
                        )}
                        {!exportSaveGuard.canSave && exportSaveGuard.saveBlockedReason && (
                          <p>
                            <span className="font-bold">Salvar rascunho bloqueado:</span>{" "}
                            {exportSaveGuard.saveBlockedReason}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Navegação Entre Etapas */}
                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <button
                    type="button"
                    disabled={studioStep <= 1}
                    onClick={() => setStudioStep((s) => Math.max(1, s - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-border px-3 py-1.5 text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" /> Etapa Anterior
                  </button>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Etapa {studioStep} de 8
                  </span>
                  <button
                    type="button"
                    disabled={studioStep >= 8}
                    onClick={() => setStudioStep((s) => Math.min(8, s + 1))}
                    className="inline-flex items-center gap-1 rounded-xl bg-primary px-3 py-1.5 text-xs font-black text-white disabled:opacity-40 cursor-pointer"
                  >
                    Próxima Etapa <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Coluna Direita: Canvas Live Preview + Guias de Zona Segura + Alerta */}
              <div className="lg:col-span-5 flex flex-col items-center justify-start gap-3">
                <div className="w-full rounded-2xl border border-border bg-black/50 p-3 flex flex-col items-center gap-2 relative">
                  <div className="w-full flex items-center justify-between text-[11px]">
                    <span className="font-mono text-muted-foreground">
                      {currentFormatSpec.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFullSizePreviewOpen(true)}
                      className="inline-flex items-center gap-1 text-primary font-bold hover:underline cursor-pointer"
                    >
                      <Maximize2 className="h-3 w-3" /> Prévia 1:1
                    </button>
                  </div>

                  <div className="relative inline-block max-w-full">
                    <canvas
                      ref={canvasRef}
                      className="max-h-[470px] w-auto max-w-full rounded-xl border border-border/60 shadow-lg"
                    />
                    {showSafeAreaGuides && (
                      <div
                        className="pointer-events-none absolute border-2 border-dashed border-cyan-400/75 rounded-lg"
                        style={{
                          top: `${currentFormatSpec.safeArea.topPct * 100}%`,
                          bottom: `${currentFormatSpec.safeArea.bottomPct * 100}%`,
                          left: `${currentFormatSpec.safeArea.leftPct * 100}%`,
                          right: `${currentFormatSpec.safeArea.rightPct * 100}%`,
                        }}
                        aria-hidden="true"
                      >
                        <span className="absolute -top-4 left-1 bg-cyan-950/90 px-1.5 py-0.5 text-[9px] font-mono text-cyan-300 rounded">
                          Zona Segura
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {safeZoneWarnings.length > 0 && (
                  <div className="w-full rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 text-[11px] text-amber-200 space-y-1">
                    <p className="font-black text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> Atenção: elementos próximos ou fora da zona segura
                    </p>
                    {safeZoneWarnings.map((w) => (
                      <p key={w.layerId}>
                        <strong>{w.layerLabel}:</strong> {w.reasons.join("; ")}
                      </p>
                    ))}
                  </div>
                )}

                {linkedTestId && (
                  <div className="w-full rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300 flex items-center gap-2">
                    <FlaskConical className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      Vinculado ao teste: {tests.find((t) => t.id === linkedTestId)?.title}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Prévia 1:1 em Tamanho Real */}
      {fullSizePreviewOpen && canvasRef.current && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4 overflow-auto"
          onClick={() => setFullSizePreviewOpen(false)}
        >
          <div className="space-y-2 max-w-[95vw] max-h-[95vh]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between text-xs text-white">
              <span>
                Prévia em escala 1:1 ({currentFormatSpec.width}×{currentFormatSpec.height})
              </span>
              <button
                type="button"
                onClick={() => setFullSizePreviewOpen(false)}
                className="rounded-lg bg-white/10 px-3 py-1 font-bold cursor-pointer"
              >
                Fechar
              </button>
            </div>
            <img
              src={canvasRef.current.toDataURL("image/png")}
              alt="Prévia 1:1 da peça"
              style={{ width: currentFormatSpec.width, height: currentFormatSpec.height }}
              className="border border-white/20 rounded-xl max-w-none"
            />
          </div>
        </div>
      )}

      {/* Modal Visualização da Análise IA */}
      {activeAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto text-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Análise Visual — {activeAnalysisModal.asset.title}
              </h3>
              <button
                type="button"
                onClick={() => setActiveAnalysisModal(null)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Score Geral</p>
                <p className="text-xl font-black text-primary">
                  {activeAnalysisModal.analysis.score}/100
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Persuasão</p>
                <p className="text-xl font-black text-foreground">
                  {activeAnalysisModal.analysis.persuasionScore}/100
                </p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Atração</p>
                <p className="text-xl font-black text-foreground">
                  {activeAnalysisModal.analysis.attractionScore}/100
                </p>
              </div>
            </div>
            <p className="text-foreground leading-relaxed">
              {activeAnalysisModal.analysis.nicheEvaluation}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1">
                <p className="font-black uppercase text-emerald-400">Pontos Fortes</p>
                <ul className="list-disc pl-4 space-y-1">
                  {activeAnalysisModal.analysis.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-1">
                <p className="font-black uppercase text-amber-400">Melhorias Sugeridas</p>
                <ul className="list-disc pl-4 space-y-1">
                  {activeAnalysisModal.analysis.actionableImprovements.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            </div>
            {activeAnalysisModal.analysis.newCreativeIdeas?.length > 0 && (
              <div className="space-y-2">
                <p className="font-black uppercase text-primary">
                  Ideias de Variação (Aplicar ao Estúdio)
                </p>
                {activeAnalysisModal.analysis.newCreativeIdeas.map((idea, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="font-bold text-foreground">{idea.concept}</p>
                      <p className="text-muted-foreground">Gancho sugerido: {idea.hookText}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          const targetAsset = activeAnalysisModal.asset;
                          if (targetAsset.ad_account_id) {
                            setExplicitAccountId(targetAsset.ad_account_id);
                          }
                          setActiveAnalysisModal(null);
                          setFacts((prev) => ({
                            ...prev,
                            headlineOffer: idea.hookText || idea.concept,
                          }));
                          setCustomAiPrompt(idea.visualDescription || "");
                          setStudioTitle(`Variação ${idx + 1} — ${targetAsset.title}`);
                          setParentAssetId(targetAsset.id);
                          setParentVersion(targetAsset.version || 1);
                          setStudioStep(6);
                          setStudioOpen(true);
                        }}
                        className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 font-bold text-white cursor-pointer"
                      >
                        Usar no Estúdio
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Histórico de Versões */}
      {historyAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-border pb-2.5">
              <h4 className="font-black uppercase text-foreground">
                Histórico — {historyAsset.title}
              </h4>
              <button
                type="button"
                onClick={() => setHistoryAsset(null)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {(historyAsset.change_history || []).length === 0 ? (
                <p className="text-muted-foreground">Sem eventos adicionais registrados.</p>
              ) : (
                (historyAsset.change_history || []).map((ev, i) => (
                  <div key={i} className="rounded-xl border border-border/60 bg-muted/20 p-2.5">
                    <p className="font-bold text-foreground">{ev.action}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ev.by} • {new Date(ev.at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
