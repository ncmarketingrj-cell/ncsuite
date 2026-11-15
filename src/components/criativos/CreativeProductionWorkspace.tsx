import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  Camera,
  CheckCircle2,
  Copy,
  Download,
  Eye,
  FlaskConical,
  History,
  Image as ImageIcon,
  Layers,
  Loader2,
  Palette,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from "@/integrations/supabase-external/client";
import { analyzeCreativeFn, type CreativeAIAnalysis } from "@/lib/criativo.functions";
import {
  extractConfirmedArtFacts,
  validateCreativeUploadFile,
  type CreativeAdRecord,
} from "@/lib/creativeIntelligenceDomain";

export interface BrandKitRow {
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

const TEMPLATES = [
  { id: "promo", label: "Oferta / Preço", headline: "CONDIÇÃO ESPECIAL", badge: "OFERTA CONFIRMADA", cta: "Falar no WhatsApp" },
  { id: "vip", label: "Premium / Executivo", headline: "SELEÇÃO EXCLUSIVA", badge: "ESTOQUE SELECIONADO", cta: "Agendar Atendimento" },
  { id: "feirao", label: "Feirão / Urgência", headline: "FEIRÃO DE OPORTUNIDADES", badge: "CONDIÇÃO DE PÁTIO", cta: "Simular Condições" },
  { id: "parcela", label: "Parcelas / Entrada", headline: "FACILIDADE NA APROVAÇÃO", badge: "FINANCIAMENTO", cta: "Consultar Simulação" },
  { id: "troca", label: "Troca / Seminovo", headline: "AVALIAÇÃO DO SEU USADO", badge: "TROCA COM TROCO", cta: "Avaliar Veículo" },
  { id: "brand", label: "Institucional", headline: "CONFIANÇA E PROCEDÊNCIA", badge: "MARCA OFICIAL", cta: "Conhecer Loja" },
];

const ASPECT_OPTIONS = [
  { id: "1:1", label: "Feed 1:1 (1080×1080)", w: 1080, h: 1080, apiSize: "1024x1024" },
  { id: "4:5", label: "Vertical 4:5 (1080×1350)", w: 1080, h: 1350, apiSize: "1024x1792" },
  { id: "9:16", label: "Stories/Reels 9:16", w: 1080, h: 1920, apiSize: "1024x1792" },
  { id: "16:9", label: "Horizontal 16:9", w: 1280, h: 720, apiSize: "1792x1024" },
];

const APPROVAL_STYLES: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "border-border bg-muted text-muted-foreground" },
  pending_review: { label: "Em revisão", cls: "border-amber-500/35 bg-amber-500/10 text-amber-400" },
  approved: { label: "Aprovado", cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400" },
  archived: { label: "Arquivado", cls: "border-border bg-muted/40 text-muted-foreground" },
};

export interface CreativeProductionWorkspaceProps {
  accounts: Array<{ id: string; name: string }>;
  clients: Array<{ id: string; name: string; meta_ad_account_id?: string | null; niche?: string | null; logo_url?: string | null; rules?: any }>;
  selectedAccountId: string;
  assets: SwipeAssetRow[];
  brandKits: BrandKitRow[];
  tests: Array<{ id: string; title: string; ad_account_id: string }>;
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

  const resolvedAccountId =
    seedVariationAd?.adAccountId ||
    (selectedAccountId !== "all" ? selectedAccountId : accounts[0]?.id || "");
  const [studioAccountId, setStudioAccountId] = useState(resolvedAccountId);
  useEffect(() => {
    if (seedVariationAd?.adAccountId) setStudioAccountId(seedVariationAd.adAccountId);
    else if (selectedAccountId !== "all") setStudioAccountId(selectedAccountId);
  }, [seedVariationAd, selectedAccountId]);

  const currentAccountName =
    accounts.find((a) => a.id === studioAccountId)?.name || "Conta Meta Ads";
  const matchedClient = clients.find((c) => c.meta_ad_account_id === studioAccountId) || null;
  const matchedKit = brandKits.find((k) => k.ad_account_id === studioAccountId) || null;

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

  useEffect(() => {
    setBkPrimary(matchedKit?.primary_color || "#E11D48");
    setBkSecondary(matchedKit?.secondary_color || "#111827");
    setBkAccent(matchedKit?.accent_color || "#F59E0B");
    setBkFont(matchedKit?.font_family || "Inter");
    setBkLogoUrl(matchedKit?.logo_url || matchedClient?.logo_url || "");
    setBkTone(matchedKit?.tone_of_voice || "");
    setBkRules(matchedKit?.brand_rules || "");
    setBkRestrictions(matchedKit?.restrictions || "");
  }, [matchedKit, matchedClient, studioAccountId]);

  // ── Upload & Visual AI Analyzer Modal (Preserved & Evolved) ──
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadNiche, setUploadNiche] = useState(matchedClient?.niche || "Automotivo / Concessionária");
  const [uploadLocation, setUploadLocation] = useState("Brasil");
  const [uploadObjectiveHint, setUploadObjectiveHint] = useState("");
  const [uploadTestId, setUploadTestId] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [analyzingUpload, setAnalyzingUpload] = useState(false);

  // ── Viewing Analysis Drawer / Modal ──
  const [activeAnalysisModal, setActiveAnalysisModal] = useState<{
    asset: SwipeAssetRow;
    analysis: CreativeAIAnalysis;
  } | null>(null);
  const [historyAsset, setHistoryAsset] = useState<SwipeAssetRow | null>(null);

  // ── Studio Creator Modal (Canvas Safe Composition OR DALL-E 3 + Brand Kit + Factual Form) ──
  const [studioOpen, setStudioOpen] = useState(Boolean(seedVariationAd));
  const [studioMode, setStudioMode] = useState<"safe_canvas" | "ai_scratch" | "ai_photo_transform">("safe_canvas");
  const [selectedTemplateId, setSelectedTemplateId] = useState("promo");
  const [aspectId, setAspectId] = useState("1:1");
  const [studioTitle, setStudioTitle] = useState("");
  const [linkedAdId, setLinkedAdId] = useState(seedVariationAd?.id || "");
  const [linkedTestId, setLinkedTestId] = useState("");
  const [parentAssetId, setParentAssetId] = useState<string | null>(null);
  const [parentVersion, setParentVersion] = useState<number>(1);

  // Factual Client Confirmed Data (never invented by AI)
  const [factModel, setFactModel] = useState("");
  const [factVersion, setFactVersion] = useState("");
  const [factYear, setFactYear] = useState("");
  const [factPrice, setFactPrice] = useState("");
  const [factMileage, setFactMileage] = useState("");
  const [factConditions, setFactConditions] = useState("");
  const [factBenefits, setFactBenefits] = useState("");
  const [factValidity, setFactValidity] = useState("");
  const [factCta, setFactCta] = useState("Falar com Consultor");

  // Editable Overlay Text Layers
  const [layerHeadline, setLayerHeadline] = useState("CONDIÇÃO ESPECIAL");
  const [layerSubheadline, setLayerSubheadline] = useState("");
  const [layerBadge, setLayerBadge] = useState("OFERTA CONFIRMADA");
  const [customAiPrompt, setCustomAiPrompt] = useState("");
  const [photoBaseUrl, setPhotoBaseUrl] = useState<string | null>(null);
  const [generatedArtUrl, setGeneratedArtUrl] = useState<string | null>(null);
  const [generatingArt, setGeneratingArt] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (seedVariationAd) {
      setStudioOpen(true);
      setLinkedAdId(seedVariationAd.id);
      setStudioTitle(`Variação — ${seedVariationAd.name}`);
      setLayerHeadline(seedVariationAd.creativeTitle || "NOVA VARIAÇÃO DE GANCHO");
      setLayerSubheadline(seedVariationAd.creativeBody?.slice(0, 120) || "");
      if (seedVariationAd.hasRealThumbnail && seedVariationAd.thumbnailUrl) {
        setPhotoBaseUrl(seedVariationAd.thumbnailUrl);
      }
    }
  }, [seedVariationAd]);

  // Helper: Upload dataURL or File into Supabase Storage 'media'
  const uploadToStorage = async (blobOrFile: Blob | File, ext: string): Promise<string> => {
    const fileName = `criativos/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("media").upload(fileName, blobOrFile, {
      contentType: blobOrFile.type || `image/${ext}`,
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from("media").getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSaveBrandKit = useMutation({
    mutationFn: async () => {
      if (!studioAccountId) throw new Error("Selecione uma conta para salvar o Brand Kit.");
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

  // Accessible File Picker Handler (Upload + Analyze)
  const handlePickFileForAnalysis = (file: File | undefined | null) => {
    setUploadError(null);
    if (!file) return;
    const v = validateCreativeUploadFile(file);
    if (!v.valid) {
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
    reader.onerror = () => setUploadError("Não foi possível ler a imagem selecionada.");
    reader.readAsDataURL(file);
  };

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
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyzeAndSaveUpload = async () => {
    if (!uploadFile || !uploadPreview) {
      setUploadError("Selecione uma imagem PNG, JPG ou WEBP antes de analisar.");
      return;
    }
    setAnalyzingUpload(true);
    setUploadError(null);
    try {
      const base64 = uploadPreview.includes(",") ? uploadPreview.split(",")[1] : uploadPreview;
      const analysis = await analyzeCreativeFn({
        data: {
          imageBase64: base64,
          mimeType: uploadFile.type || "image/png",
          niche: uploadNiche || "Geral / Negócios",
          location: uploadLocation || "Brasil",
          accountName: currentAccountName,
          objectiveLabel: uploadObjectiveHint || undefined,
          brandRules: bkRules || bkRestrictions || undefined,
        },
      });
      const ext = uploadFile.type.includes("webp") ? "webp" : uploadFile.type.includes("jpeg") ? "jpg" : "png";
      const publicUrl = await uploadToStorage(uploadFile, ext);
      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: studioAccountId || null,
        client_id: matchedClient?.id || null,
        creative_test_id: uploadTestId || null,
        title: uploadTitle.trim() || "Criativo Analisado",
        media_url: publicUrl,
        notes: JSON.stringify(analysis),
        tags: [uploadNiche, currentAccountName, `score:${analysis.score}`],
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
      if (error) throw error;
      toast.success("Peça analisada e salva na biblioteca de produção!");
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
      setUploadModalOpen(false);
      setUploadFile(null);
      setUploadPreview(null);
      setUploadTitle("");
    } catch (err: any) {
      const msg = err?.message || "Falha ao analisar e enviar imagem.";
      setUploadError(msg);
      toast.error(msg);
    } finally {
      setAnalyzingUpload(false);
    }
  };

  // Canvas Live Composition Rendering (Preserves real vehicle photo 100% + editable factual layers)
  useEffect(() => {
    if (!studioOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const aspect = ASPECT_OPTIONS.find((a) => a.id === aspectId) || ASPECT_OPTIONS[0];
    canvas.width = aspect.w;
    canvas.height = aspect.h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const drawComposition = (bgImg?: HTMLImageElement | null) => {
      const w = canvas.width;
      const h = canvas.height;
      // Fundo com Brand Kit
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, bkSecondary || "#111827");
      grad.addColorStop(1, "#09090b");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Imagem base (foto preservada ou gerada por IA)
      if (bgImg) {
        const scale = Math.max(w / bgImg.width, h / bgImg.height);
        const dw = bgImg.width * scale;
        const dh = bgImg.height * scale;
        ctx.drawImage(bgImg, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }

      // Vinheta superior/inferior para legibilidade sem esconder veículo central
      const topGrad = ctx.createLinearGradient(0, 0, 0, h * 0.34);
      topGrad.addColorStop(0, "rgba(0,0,0,0.82)");
      topGrad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = topGrad;
      ctx.fillRect(0, 0, w, h * 0.34);

      const botGrad = ctx.createLinearGradient(0, h * 0.56, 0, h);
      botGrad.addColorStop(0, "rgba(0,0,0,0)");
      botGrad.addColorStop(1, "rgba(0,0,0,0.92)");
      ctx.fillStyle = botGrad;
      ctx.fillRect(0, h * 0.56, w, h * 0.44);

      const pad = Math.round(w * 0.055);
      // Tarja Badge superior
      if (layerBadge.trim()) {
        ctx.fillStyle = bkPrimary || "#E11D48";
        ctx.font = `900 ${Math.round(w * 0.024)}px ${bkFont || "Inter"}, sans-serif`;
        const bw = ctx.measureText(layerBadge.toUpperCase()).width + 36;
        ctx.fillRect(pad, pad, Math.min(bw, w - pad * 2), 42);
        ctx.fillStyle = "#ffffff";
        ctx.fillText(layerBadge.toUpperCase(), pad + 18, pad + 29);
      }

      // Headline editável
      const headlineY = pad + 92;
      ctx.fillStyle = "#ffffff";
      ctx.font = `900 ${Math.round(w * 0.052)}px ${bkFont || "Inter"}, sans-serif`;
      const headlineWords = layerHeadline.trim().split(/\s+/);
      let line = "";
      let y = headlineY;
      for (const word of headlineWords) {
        const test = line ? `${line} ${word}` : word;
        if (ctx.measureText(test).width > w - pad * 2 && line) {
          ctx.fillText(line, pad, y);
          line = word;
          y += Math.round(w * 0.058);
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, pad, y);

      if (layerSubheadline.trim()) {
        ctx.fillStyle = "rgba(255,255,255,0.86)";
        ctx.font = `600 ${Math.round(w * 0.027)}px ${bkFont || "Inter"}, sans-serif`;
        ctx.fillText(layerSubheadline.trim().slice(0, 70), pad, y + Math.round(w * 0.042));
      }

      // Camada inferior com Fatos Confirmados pelo usuário
      const specParts = [factModel, factVersion, factYear, factMileage].filter((s) => s.trim());
      const bottomBase = h - pad;
      if (factCta.trim()) {
        ctx.fillStyle = bkAccent || "#F59E0B";
        ctx.font = `900 ${Math.round(w * 0.028)}px ${bkFont || "Inter"}, sans-serif`;
        const ctaText = factCta.toUpperCase();
        const ctaW = Math.min(ctx.measureText(ctaText).width + 48, w - pad * 2);
        ctx.fillRect(pad, bottomBase - 54, ctaW, 54);
        ctx.fillStyle = "#09090b";
        ctx.fillText(ctaText, pad + 24, bottomBase - 18);
      }

      let curBottomY = bottomBase - (factCta.trim() ? 82 : 18);
      if (factConditions.trim() || factValidity.trim()) {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.font = `500 ${Math.round(w * 0.023)}px ${bkFont || "Inter"}, sans-serif`;
        const condLine = [factConditions, factValidity].filter(Boolean).join(" • ");
        ctx.fillText(condLine.slice(0, 76), pad, curBottomY);
        curBottomY -= Math.round(w * 0.036);
      }

      if (factPrice.trim()) {
        ctx.fillStyle = bkAccent || "#F59E0B";
        ctx.font = `900 ${Math.round(w * 0.056)}px ${bkFont || "Inter"}, sans-serif`;
        ctx.fillText(factPrice.trim(), pad, curBottomY);
        curBottomY -= Math.round(w * 0.058);
      }

      if (specParts.length > 0) {
        ctx.fillStyle = "#ffffff";
        ctx.font = `800 ${Math.round(w * 0.032)}px ${bkFont || "Inter"}, sans-serif`;
        ctx.fillText(specParts.join(" • "), pad, curBottomY);
      }
    };

    const imgSrc = studioMode === "safe_canvas" ? photoBaseUrl : generatedArtUrl || photoBaseUrl;
    if (imgSrc) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => drawComposition(img);
      img.onerror = () => drawComposition(null);
      img.src = imgSrc;
    } else {
      drawComposition(null);
    }
  }, [
    studioOpen,
    aspectId,
    studioMode,
    photoBaseUrl,
    generatedArtUrl,
    bkPrimary,
    bkSecondary,
    bkAccent,
    bkFont,
    layerBadge,
    layerHeadline,
    layerSubheadline,
    factModel,
    factVersion,
    factYear,
    factPrice,
    factMileage,
    factConditions,
    factValidity,
    factCta,
  ]);

  const handleGenerateAiArt = async () => {
    const confirmedFacts = extractConfirmedArtFacts({
      vehicleModel: factModel,
      version: factVersion,
      year: factYear,
      price: factPrice,
      mileage: factMileage,
      conditions: factConditions,
      benefits: factBenefits,
      validity: factValidity,
      cta: factCta,
    });

    if (studioMode === "ai_photo_transform" && !photoBaseUrl) {
      toast.error("Envie uma foto antes de usar Transformar Foto com IA.");
      return;
    }

    setGeneratingArt(true);
    try {
      const aspect = ASPECT_OPTIONS.find((a) => a.id === aspectId) || ASPECT_OPTIONS[0];
      const session = (await supabase.auth.getSession()).data.session;
      const factualSummary = Object.entries(confirmedFacts.confirmedFacts)
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");

      const promptPieces = [
        `Marca/Cliente: ${currentAccountName}. Cores da marca: ${bkPrimary}, ${bkSecondary}, ${bkAccent}.`,
        customAiPrompt || "Arte publicitária de alta legibilidade mobile para Meta Ads com espaço limpo para texto em camadas.",
        factualSummary ? `Fatos confirmados pelo cliente (não inventar outros números): ${factualSummary}.` : "",
        bkRestrictions ? `Restrições: ${bkRestrictions}.` : "",
      ]
        .filter(Boolean)
        .join(" ");

      const res = await fetch(`${EXTERNAL_SUPABASE_URL}/functions/v1/generate-art`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || EXTERNAL_SUPABASE_ANON_KEY}`,
          apikey: EXTERNAL_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          mode: studioMode === "ai_photo_transform" ? "photo" : "scratch",
          imageBase64: studioMode === "ai_photo_transform" && photoBaseUrl?.startsWith("data:") ? photoBaseUrl.split(",")[1] : undefined,
          prompt: promptPieces,
          aspectRatio: aspect.apiSize,
          template: selectedTemplateId,
          headline: layerHeadline,
          offerText: factPrice,
          ctaText: factCta,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.imageUrl) {
        throw new Error(json?.error || "Erro ao gerar fundo visual por IA.");
      }
      setGeneratedArtUrl(json.imageUrl);
      toast.success("Fundo gerado! Revise o preview editável antes de exportar/salvar.");
    } catch (err: any) {
      toast.error(err?.message || "Erro na geração por IA.");
    } finally {
      setGeneratingArt(false);
    }
  };

  const handleSaveStudioAsset = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Falha ao renderizar preview para PNG.");
      const publicUrl = await uploadToStorage(blob, "png");
      const nextVersion = parentAssetId ? parentVersion + 1 : 1;

      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: studioAccountId || null,
        client_id: matchedClient?.id || null,
        linked_ad_id: linkedAdId || null,
        linked_campaign_id: records.find((r) => r.id === linkedAdId)?.campaignId || null,
        creative_test_id: linkedTestId || null,
        title: studioTitle.trim() || `${layerHeadline.slice(0, 40)} v${nextVersion}`,
        media_url: publicUrl,
        origin: studioMode === "safe_canvas" ? "canvas_composition" : studioMode,
        version: nextVersion,
        parent_asset_id: parentAssetId,
        approval_status: "draft",
        author_id: userId || null,
        author_name: userName || "Gestor",
        structured_data: {
          factModel,
          factVersion,
          factYear,
          factPrice,
          factMileage,
          factConditions,
          factBenefits,
          factValidity,
          factCta,
        },
        layer_config: {
          template: selectedTemplateId,
          aspectId,
          layerHeadline,
          layerSubheadline,
          layerBadge,
          bkPrimary,
          bkSecondary,
          bkAccent,
        },
        change_history: [
          {
            at: new Date().toISOString(),
            by: userName || "Gestor",
            action: parentAssetId ? `Nova versão v${nextVersion} criada` : "Criativo produzido no Estúdio",
          },
        ],
      });
      if (error) throw error;
      toast.success(`Criativo salvo (v${nextVersion})!`);
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
      setStudioOpen(false);
      setParentAssetId(null);
      setParentVersion(1);
      onClearSeedVariation();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar criativo.");
    }
  };

  const handleDownloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = `${(studioTitle || "criativo-nc").replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  const updateAssetMutation = useMutation({
    mutationFn: async (params: { id: string; patch: Record<string, any>; historyNote: string; prevHistory: any[] }) => {
      const nextHistory = [
        ...(Array.isArray(params.prevHistory) ? params.prevHistory : []),
        { at: new Date().toISOString(), by: userName || "Gestor", action: params.historyNote },
      ];
      const { error } = await (supabase as any)
        .from("swipe_files")
        .update({ ...params.patch, change_history: nextHistory, updated_at: new Date().toISOString() })
        .eq("id", params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
      toast.success("Criativo atualizado!");
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao atualizar criativo."),
  });

  const duplicateAsset = async (asset: SwipeAssetRow) => {
    try {
      const nextVer = (asset.version || 1) + 1;
      const { error } = await (supabase as any).from("swipe_files").insert({
        user_id: userId,
        ad_account_id: asset.ad_account_id || studioAccountId || null,
        client_id: asset.client_id || null,
        linked_ad_id: asset.linked_ad_id || null,
        linked_campaign_id: asset.linked_campaign_id || null,
        creative_test_id: asset.creative_test_id || null,
        title: `${asset.title} (v${nextVer})`,
        media_url: asset.media_url,
        notes: asset.notes,
        tags: asset.tags,
        origin: asset.origin || "canvas_composition",
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
      toast.success(`Versão v${nextVer} criada!`);
      qc.invalidateQueries({ queryKey: ["swipe-files"] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao duplicar criativo.");
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
      return { asset: a, analysis: parsedAnalysis };
    });
  }, [assets]);

  return (
    <section className="space-y-5" aria-label="Produção de Criativos e Análise de Peças">
      {/* Divisor claro separando Inteligência Analítica da Meta vs Produção de Criativos */}
      <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-primary/20 border border-primary/35 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
              Produção & Estúdio Criativo
            </span>
            <span className="text-[11px] font-mono text-muted-foreground">
              Separado da entrega ao vivo da Meta • Rascunhos não alteram campanhas no Gerenciador
            </span>
          </div>
          <h3 className="text-base font-black text-foreground">
            Brand Kit, Composição Segura de Fotos, Criador com IA e Análise Visual
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={studioAccountId}
            onChange={(e) => setStudioAccountId(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold text-foreground"
            aria-label="Selecionar conta/cliente para Brand Kit"
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setShowBrandKitModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 transition cursor-pointer"
              >
                <Palette className="h-3.5 w-3.5 text-primary" /> Brand Kit
              </button>
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
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
                  setStudioOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black uppercase text-white hover:bg-primary/90 transition cursor-pointer"
              >
                <Wand2 className="h-3.5 w-3.5" /> Criar Criativo / Arte
              </button>
            </>
          )}
        </div>
      </div>

      {/* Biblioteca de Peças Produzidas & Analisadas (swipe_files) */}
      {parsedAssets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 py-14 px-6 text-center space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground">Nenhuma peça produzida ou analisada salva neste espaço</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Suba uma imagem para análise visual com IA ou abra o Estúdio para compor peças preservando fotos reais e regras do Brand Kit.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {parsedAssets.map(({ asset, analysis }) => {
            const st = APPROVAL_STYLES[asset.approval_status || "draft"] || APPROVAL_STYLES.draft;
            return (
              <article key={asset.id} className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col justify-between">
                <div>
                  <div className="relative h-44 bg-muted/40 border-b border-border flex items-center justify-center overflow-hidden">
                    {asset.media_url ? (
                      <img src={asset.media_url} alt={asset.title} className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                    )}
                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5">
                      <span className="rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-black text-white">
                        v{asset.version || 1} • {asset.origin || "upload"}
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-bold backdrop-blur ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 space-y-2">
                    <h4 className="text-sm font-black text-foreground truncate">{asset.title}</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Autor: {asset.author_name || "Equipe NC"} •{" "}
                      {new Date(asset.created_at).toLocaleDateString("pt-BR")}
                    </p>
                    {analysis && (
                      <div className="rounded-xl border border-primary/25 bg-primary/5 p-2.5 text-xs flex items-center justify-between">
                        <span>Score IA: <strong className="text-primary">{analysis.score}/100</strong></span>
                        <span className="font-bold">{analysis.conversionProbability}</span>
                      </div>
                    )}
                    {canEdit && (
                      <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                        <select
                          value={asset.approval_status || "draft"}
                          onChange={(e) =>
                            updateAssetMutation.mutate({
                              id: asset.id,
                              patch: { approval_status: e.target.value },
                              historyNote: `Status alterado para ${e.target.value}`,
                              prevHistory: asset.change_history || [],
                            })
                          }
                          className="rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground flex-1"
                          aria-label="Alterar aprovação"
                        >
                          <option value="draft">Rascunho</option>
                          <option value="pending_review">Em revisão</option>
                          <option value="approved">Aprovado</option>
                          <option value="archived">Arquivado</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                <div className="border-t border-border/70 bg-muted/15 px-3 py-2 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {analysis && (
                      <button
                        type="button"
                        onClick={() => setActiveAnalysisModal({ asset, analysis })}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary cursor-pointer"
                      >
                        <Eye className="h-3 w-3" /> Diagnóstico
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setHistoryAsset(asset)}
                      className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground cursor-pointer"
                      title="Ver histórico de alterações"
                    >
                      <History className="h-3 w-3" /> Histórico
                    </button>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const newName = window.prompt("Novo título da peça:", asset.title);
                          if (newName && newName.trim() && newName.trim() !== asset.title) {
                            updateAssetMutation.mutate({
                              id: asset.id,
                              patch: { title: newName.trim() },
                              historyNote: `Renomeado para "${newName.trim()}"`,
                              prevHistory: asset.change_history || [],
                            });
                          }
                        }}
                        className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Renomear"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateAsset(asset)}
                        className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Criar nova versão"
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteAsset(asset.id)}
                        className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-rose-400 cursor-pointer"
                        title="Excluir peça"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Brand Kit */}
      {showBrandKitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" /> Brand Kit — {currentAccountName}
              </h3>
              <button type="button" onClick={() => setShowBrandKitModal(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Cor Primária</label>
                <input type="color" value={bkPrimary} onChange={(e) => setBkPrimary(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer" />
              </div>
              <div>
                <label className="block font-bold mb-1">Cor Secundária</label>
                <input type="color" value={bkSecondary} onChange={(e) => setBkSecondary(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer" />
              </div>
              <div>
                <label className="block font-bold mb-1">Cor Destaque</label>
                <input type="color" value={bkAccent} onChange={(e) => setBkAccent(e.target.value)} className="h-9 w-full rounded-lg border border-border bg-background cursor-pointer" />
              </div>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Fonte Principal</label>
                <select value={bkFont} onChange={(e) => setBkFont(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
                  <option value="Inter">Inter (Moderna / Limpa)</option>
                  <option value="Montserrat">Montserrat (Impacto Automotivo)</option>
                  <option value="Georgia">Georgia (Editorial / Premium)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">URL do Logo (Opcional)</label>
                <input value={bkLogoUrl} onChange={(e) => setBkLogoUrl(e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-border bg-background px-3 py-2" />
              </div>
              <div>
                <label className="block font-bold mb-1">Tom de Voz</label>
                <input value={bkTone} onChange={(e) => setBkTone(e.target.value)} placeholder="Ex: Direto, transparente, foco em atendimento ágil" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
              </div>
              <div>
                <label className="block font-bold mb-1">Regras e Restrições da Marca</label>
                <textarea value={bkRules} onChange={(e) => setBkRules(e.target.value)} rows={2} placeholder="Ex: Nunca prometer aprovação garantida; sempre informar ano/versão exatos." className="w-full rounded-xl border border-border bg-background px-3 py-2" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <button type="button" onClick={() => setShowBrandKitModal(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold cursor-pointer">
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

      {/* Modal Upload & Análise Visual (Preservado e Acessível) */}
      {uploadModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Analisar Novo Criativo por IA
              </h3>
              <button type="button" onClick={() => setUploadModalOpen(false)} className="text-muted-foreground hover:text-foreground cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border hover:border-primary/50 bg-muted/20 p-6 cursor-pointer transition text-center">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => handlePickFileForAnalysis(e.target.files?.[0])}
                />
                {uploadPreview ? (
                  <img src={uploadPreview} alt="Prévia enviada" className="max-h-44 rounded-xl object-contain mb-2" />
                ) : (
                  <Upload className="h-7 w-7 text-primary mb-2" />
                )}
                <span className="font-bold text-foreground">
                  {uploadFile ? uploadFile.name : "Clique para selecionar PNG, JPG ou WEBP (máx. 8 MB)"}
                </span>
              </label>

              {uploadError && (
                <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-2.5 text-rose-300 font-semibold">
                  {uploadError}
                </div>
              )}

              <div>
                <label className="block font-bold mb-1">Título da Peça</label>
                <input value={uploadTitle} onChange={(e) => setUploadTitle(e.target.value)} placeholder="Ex: Carrossel Oferta Dezembro v1" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold mb-1">Nicho / Mercado</label>
                  <input value={uploadNiche} onChange={(e) => setUploadNiche(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Localização / Praça</label>
                  <input value={uploadLocation} onChange={(e) => setUploadLocation(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold mb-1">Objetivo / Destino (Opcional)</label>
                  <input value={uploadObjectiveHint} onChange={(e) => setUploadObjectiveHint(e.target.value)} placeholder="Ex: Conversas WhatsApp, Compras Site" className="w-full rounded-xl border border-border bg-background px-3 py-2" />
                </div>
                <div>
                  <label className="block font-bold mb-1">Vincular a Teste (Opcional)</label>
                  <select value={uploadTestId} onChange={(e) => setUploadTestId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2">
                    <option value="">Sem vínculo</option>
                    {tests.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <button type="button" onClick={() => setUploadModalOpen(false)} className="rounded-xl border border-border px-4 py-2 text-xs font-bold cursor-pointer">
                Cancelar
              </button>
              <button
                type="button"
                disabled={analyzingUpload}
                onClick={handleAnalyzeAndSaveUpload}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50 cursor-pointer"
              >
                {analyzingUpload && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Analisar e Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Estúdio de Criação com Canvas Editável + Preservação da Foto + Fatos Confirmados */}
      {studioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
          <div className="w-full max-w-6xl rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto max-h-[94vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                  <Wand2 className="h-4 w-4 text-primary" /> Estúdio de Criação — {currentAccountName}
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Separe fatos comerciais confirmados por você das camadas de gancho/estilo. Revise o preview ao lado antes de salvar.
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

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Coluna Esquerda: Controles, Fatos e Camadas */}
              <div className="lg:col-span-7 space-y-4 text-xs">
                {/* Modo de Produção */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {[
                    { id: "safe_canvas", label: "Composição Original", desc: "Preserva 100% da foto real + camadas", icon: Layers },
                    { id: "ai_scratch", label: "Fundo IA do Zero", desc: "DALL-E 3 + texto editável", icon: Sparkles },
                    { id: "ai_photo_transform", label: "Transformar Foto IA", desc: "Cenário IA (aviso de fidelidade)", icon: Camera },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setStudioMode(m.id as any)}
                        className={`rounded-xl border p-2.5 text-left transition cursor-pointer ${
                          studioMode === m.id ? "border-primary bg-primary/10" : "border-border bg-background"
                        }`}
                      >
                        <div className="font-black text-foreground flex items-center gap-1.5">
                          <Icon className="h-3.5 w-3.5 text-primary" /> {m.label}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{m.desc}</p>
                      </button>
                    );
                  })}
                </div>

                {studioMode === "ai_photo_transform" && (
                  <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-2.5 flex items-start gap-2 text-amber-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      <strong>Aviso de fidelidade:</strong> a geração por IA regenera a imagem e pode alterar placa, grade, faróis ou detalhes do veículo. Use <strong>Composição Original</strong> se precisar preservar a foto exata do estoque.
                    </span>
                  </div>
                )}

                {/* Foto Base + Templates + Formato */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold mb-1">Template de Gancho</label>
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => {
                        const tpl = TEMPLATES.find((t) => t.id === e.target.value);
                        setSelectedTemplateId(e.target.value);
                        if (tpl) {
                          setLayerHeadline(tpl.headline);
                          setLayerBadge(tpl.badge);
                          setFactCta(tpl.cta);
                        }
                      }}
                      className="w-full rounded-xl border border-border bg-background px-2.5 py-2"
                    >
                      {TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Formato</label>
                    <select value={aspectId} onChange={(e) => setAspectId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2">
                      {ASPECT_OPTIONS.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Foto Real (PNG/JPG/WEBP)</label>
                    <label className="flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background hover:border-primary/40 px-2.5 py-2 cursor-pointer font-bold">
                      <Upload className="h-3.5 w-3.5 text-primary" />
                      {photoBaseUrl ? "Trocar foto" : "Enviar foto"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => handlePickPhotoForStudio(e.target.files?.[0])} />
                    </label>
                  </div>
                </div>

                {/* Dados Fatuais Confirmados pelo Usuário */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2.5">
                  <p className="font-black uppercase text-[11px] text-emerald-400">
                    Fatos Comerciais Confirmados (exibidos exatamente como digitados)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <input value={factModel} onChange={(e) => setFactModel(e.target.value)} placeholder="Modelo (ex: Onix)" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factVersion} onChange={(e) => setFactVersion(e.target.value)} placeholder="Versão (ex: LTZ)" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factYear} onChange={(e) => setFactYear(e.target.value)} placeholder="Ano (ex: 2022/2023)" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factMileage} onChange={(e) => setFactMileage(e.target.value)} placeholder="KM (ex: 38.000 km)" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factPrice} onChange={(e) => setFactPrice(e.target.value)} placeholder="Preço/Entrada (ex: R$ 69.900)" className="col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factConditions} onChange={(e) => setFactConditions(e.target.value)} placeholder="Condições (ex: IPVA pago / revisão)" className="col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factValidity} onChange={(e) => setFactValidity(e.target.value)} placeholder="Validade (ex: Até 30/11)" className="col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={factCta} onChange={(e) => setFactCta(e.target.value)} placeholder="CTA" className="col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                  </div>
                </div>

                {/* Camadas de Texto Editáveis (Hook / Conceito) */}
                <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
                  <p className="font-black uppercase text-[11px] text-primary">
                    Camadas Editáveis de Conceito / Gancho
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input value={studioTitle} onChange={(e) => setStudioTitle(e.target.value)} placeholder="Nome interno da peça (Biblioteca)" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={layerBadge} onChange={(e) => setLayerBadge(e.target.value)} placeholder="Selo superior" className="rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={layerHeadline} onChange={(e) => setLayerHeadline(e.target.value)} placeholder="Headline principal" className="sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                    <input value={layerSubheadline} onChange={(e) => setLayerSubheadline(e.target.value)} placeholder="Subtítulo / ângulo (opcional)" className="sm:col-span-2 rounded-lg border border-border bg-background px-2.5 py-1.5" />
                  </div>
                </div>

                {studioMode !== "safe_canvas" && (
                  <div className="space-y-2">
                    <label className="block font-bold">Direção Visual para Fundo com IA (sem inventar preço)</label>
                    <div className="flex gap-2">
                      <input value={customAiPrompt} onChange={(e) => setCustomAiPrompt(e.target.value)} placeholder="Ex: Estúdio escuro com iluminação lateral dramática..." className="flex-1 rounded-xl border border-border bg-background px-3 py-2" />
                      <button
                        type="button"
                        disabled={generatingArt}
                        onClick={handleGenerateAiArt}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 font-black uppercase text-white disabled:opacity-50 cursor-pointer"
                      >
                        {generatingArt ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                        Gerar Fundo
                      </button>
                    </div>
                  </div>
                )}

                {/* Vínculo opcional a anúncio e teste */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block font-bold mb-1">Anúncio de Referência (Opcional)</label>
                    <select value={linkedAdId} onChange={(e) => setLinkedAdId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2">
                      <option value="">Sem vínculo direto</option>
                      {records.filter((r) => r.adAccountId === studioAccountId).slice(0, 50).map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold mb-1">Teste Criativo Vinculado (Opcional)</label>
                    <select value={linkedTestId} onChange={(e) => setLinkedTestId(e.target.value)} className="w-full rounded-xl border border-border bg-background px-2.5 py-2">
                      <option value="">Sem teste vinculado</option>
                      {tests.filter((t) => t.ad_account_id === studioAccountId).map((t) => (
                        <option key={t.id} value={t.id}>{t.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Coluna Direita: Preview Ao Vivo + Export/Save */}
              <div className="lg:col-span-5 flex flex-col items-center justify-between gap-3 rounded-2xl border border-border bg-background p-4">
                <div className="w-full flex items-center justify-between text-xs">
                  <span className="font-black uppercase text-muted-foreground">Preview Editável Ao Vivo</span>
                  <span className="font-mono text-[11px] text-primary">{aspectId}</span>
                </div>
                <canvas
                  ref={canvasRef}
                  className="max-h-[420px] max-w-full rounded-xl border border-border shadow-lg object-contain bg-black"
                />
                <div className="w-full flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={handleDownloadCanvas}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:border-primary/40 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" /> Baixar PNG
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveStudioAsset}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white hover:bg-primary/90 cursor-pointer"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Salvar na Biblioteca
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Ver Análise Detalhada */}
      {activeAnalysisModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto text-xs">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground">
                Diagnóstico Visual IA — {activeAnalysisModal.asset.title}
              </h3>
              <button type="button" onClick={() => setActiveAnalysisModal(null)} className="cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Score Geral</p>
                <p className="text-xl font-black text-primary">{activeAnalysisModal.analysis.score}/100</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Persuasão</p>
                <p className="text-xl font-black text-foreground">{activeAnalysisModal.analysis.persuasionScore}/100</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/20 p-3">
                <p className="text-muted-foreground">Atração</p>
                <p className="text-xl font-black text-foreground">{activeAnalysisModal.analysis.attractionScore}/100</p>
              </div>
            </div>
            <p className="text-foreground leading-relaxed">{activeAnalysisModal.analysis.nicheEvaluation}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3 space-y-1">
                <p className="font-black uppercase text-emerald-400">Pontos Fortes</p>
                <ul className="list-disc pl-4 space-y-1">
                  {activeAnalysisModal.analysis.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-1">
                <p className="font-black uppercase text-amber-400">Melhorias Sugeridas</p>
                <ul className="list-disc pl-4 space-y-1">
                  {activeAnalysisModal.analysis.actionableImprovements.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            </div>
            {activeAnalysisModal.analysis.newCreativeIdeas?.length > 0 && (
              <div className="space-y-2">
                <p className="font-black uppercase text-primary">Ideias de Variação (Aplicar ao Estúdio)</p>
                {activeAnalysisModal.analysis.newCreativeIdeas.map((idea, idx) => (
                  <div key={idx} className="rounded-xl border border-border bg-muted/20 p-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-foreground">{idea.concept}</p>
                      <p className="text-muted-foreground">Gancho sugerido: {idea.hookText}</p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveAnalysisModal(null);
                          setLayerHeadline(idea.hookText || idea.concept);
                          setCustomAiPrompt(idea.visualDescription || "");
                          setStudioTitle(`Variação ${idx + 1} — ${activeAnalysisModal.asset.title}`);
                          setParentAssetId(activeAnalysisModal.asset.id);
                          setParentVersion(activeAnalysisModal.asset.version || 1);
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
              <h4 className="font-black uppercase text-foreground">Histórico — {historyAsset.title}</h4>
              <button type="button" onClick={() => setHistoryAsset(null)} className="cursor-pointer">
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
