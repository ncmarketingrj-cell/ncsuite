import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  GitCompare,
  History,
  ImagePlus,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import type { CreativeAdRecord } from "@/lib/creativeIntelligenceDomain";
import {
  buildComparisonAnalysis,
  resolveComparisonWorkflowStatus,
  validateCandidateMediaFile,
  validateComparatorScope,
  type CandidateCreativeInput,
  type ComparisonWorkflowStatus,
  type CreativeComparisonAnalysis,
} from "@/lib/creativeComparatorDomain";

export interface CreativeComparisonRow {
  id: string;
  ad_account_id: string;
  client_id: string | null;
  reference_ad_id: string | null;
  reference_ad_external_id: string | null;
  reference_ad_name: string | null;
  objective: string | null;
  result_category: string | null;
  result_indicator: string | null;
  attribution_window: string | null;
  period_start: string | null;
  period_end: string | null;
  candidate_title: string;
  candidate_version: number;
  parent_comparison_id: string | null;
  candidate_payload: Partial<CandidateCreativeInput> | null;
  analysis_payload: CreativeComparisonAnalysis | null;
  workflow_status: ComparisonWorkflowStatus;
  published_ad_id: string | null;
  published_ad_external_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

interface AccountHealthLite {
  hasIssue: boolean;
  kind: string;
  summary: string;
}

interface CreativeComparatorSectionProps {
  accounts: { id: string; name: string; account_name?: string; external_id?: string | null }[];
  clients: { id: string; name: string; meta_ad_account_id?: string | null }[];
  selectedAccountId: string;
  onSelectAccount: (accountId: string) => void;
  allRecords: CreativeAdRecord[];
  activeRecords: CreativeAdRecord[];
  accountHealthById: Map<string, AccountHealthLite>;
  comparisons: CreativeComparisonRow[];
  comparisonsLoading: boolean;
  dateFrom: string;
  dateTo: string;
  canEdit: boolean;
  userId?: string;
  userName?: string;
  preselectedReferenceAd?: CreativeAdRecord | null;
  onClearPreselectedReference?: () => void;
  onComparisonSaved: () => void;
}

const PLACEMENT_OPTIONS = ["Feed", "Stories", "Reels", "Explorar / Marketplace"];

const WORKFLOW_STATUS_LABELS: Record<ComparisonWorkflowStatus, { label: string; tone: string }> = {
  draft: {
    label: "Rascunho",
    tone: "bg-muted text-muted-foreground border-border",
  },
  ready_for_test: {
    label: "Pronto para teste",
    tone: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  },
  running: {
    label: "Em veiculação na Meta",
    tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  result_recorded: {
    label: "Resultado registrado",
    tone: "bg-violet-500/15 text-violet-300 border-violet-500/30",
  },
};

function formatCurrency(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "dado indisponível";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatNumber(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "dado indisponível";
  return v.toLocaleString("pt-BR");
}

function formatPercent(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "dado indisponível";
  return `${v.toFixed(2)}%`;
}

function createEmptyCandidate(accountId: string): CandidateCreativeInput {
  return {
    adAccountId: accountId === "all" ? "" : accountId,
    title: "",
    mediaKind: "image",
    mediaUrl: null,
    mediaFileName: null,
    mediaLoadError: null,
    primaryText: "",
    headline: "",
    description: "",
    cta: "",
    confirmedOffer: "",
    confirmedPrice: "",
    confirmedVehicleSpecs: "",
    destinationUrl: "",
    intendedFormat: "4:5",
    intendedPlacements: ["Feed"],
    userHypothesis: "",
  };
}

export function CreativeComparatorSection({
  accounts,
  clients,
  selectedAccountId,
  onSelectAccount,
  allRecords,
  activeRecords,
  accountHealthById,
  comparisons,
  comparisonsLoading,
  dateFrom,
  dateTo,
  canEdit,
  userId,
  userName,
  preselectedReferenceAd,
  onClearPreselectedReference,
  onComparisonSaved,
}: CreativeComparatorSectionProps) {
  const [selectedReferenceAdId, setSelectedReferenceAdId] = useState<string>("");
  const [adSearch, setAdSearch] = useState("");
  const [candidate, setCandidate] = useState<CandidateCreativeInput>(() =>
    createEmptyCandidate(selectedAccountId)
  );
  const [pendingMediaFile, setPendingMediaFile] = useState<File | null>(null);
  const [mediaValidationError, setMediaValidationError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CreativeComparisonAnalysis | null>(null);
  const [editingComparisonId, setEditingComparisonId] = useState<string | null>(null);
  const [parentVersion, setParentVersion] = useState<number>(0);
  const [workflowStatus, setWorkflowStatus] = useState<ComparisonWorkflowStatus>("draft");
  const [publishedAdId, setPublishedAdId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const objectUrlRef = useRef<string | null>(null);
  const lastAccountRef = useRef<string>(selectedAccountId);

  const revokeObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  useEffect(() => {
    return () => revokeObjectUrl();
  }, []);

  // Limpa estados incompatíveis imediatamente ao trocar de conta
  useEffect(() => {
    if (lastAccountRef.current !== selectedAccountId) {
      lastAccountRef.current = selectedAccountId;
      revokeObjectUrl();
      setSelectedReferenceAdId("");
      setAdSearch("");
      setCandidate(createEmptyCandidate(selectedAccountId));
      setPendingMediaFile(null);
      setMediaValidationError(null);
      setAnalysis(null);
      setEditingComparisonId(null);
      setParentVersion(0);
      setWorkflowStatus("draft");
      setPublishedAdId("");
    }
  }, [selectedAccountId]);

  // Pré-seleciona anúncio ativo quando usuário clica "Comparar com peça nova" na biblioteca
  useEffect(() => {
    if (!preselectedReferenceAd) return;
    if (
      selectedAccountId === "all" ||
      selectedAccountId !== preselectedReferenceAd.adAccountId
    ) {
      onSelectAccount(preselectedReferenceAd.adAccountId);
    }
    setSelectedReferenceAdId(preselectedReferenceAd.id);
    setCandidate((prev) => ({
      ...prev,
      adAccountId: preselectedReferenceAd.adAccountId,
    }));
    onClearPreselectedReference?.();
  }, [preselectedReferenceAd, selectedAccountId, onSelectAccount, onClearPreselectedReference]);

  const isSingleAccountSelected = Boolean(selectedAccountId && selectedAccountId !== "all");
  const accountHealth = isSingleAccountSelected
    ? accountHealthById.get(selectedAccountId)
    : undefined;
  const accountPermissionMissing = Boolean(
    accountHealth?.hasIssue && accountHealth.kind === "permission_denied"
  );

  const accountActiveAds = useMemo(() => {
    if (!isSingleAccountSelected) return [];
    const term = adSearch.trim().toLowerCase();
    return activeRecords
      .filter((r) => r.adAccountId === selectedAccountId)
      .filter((r) => {
        if (!term) return true;
        return (
          r.name.toLowerCase().includes(term) ||
          r.campaignName.toLowerCase().includes(term) ||
          (r.creativeTitle ?? "").toLowerCase().includes(term)
        );
      });
  }, [activeRecords, isSingleAccountSelected, selectedAccountId, adSearch]);

  const sameAccountAllRecords = useMemo(() => {
    if (!isSingleAccountSelected) return [];
    return allRecords.filter((r) => r.adAccountId === selectedAccountId);
  }, [allRecords, isSingleAccountSelected, selectedAccountId]);

  const referenceAd = useMemo(() => {
    if (!selectedReferenceAdId || !isSingleAccountSelected) return null;
    return (
      activeRecords.find(
        (r) => r.id === selectedReferenceAdId && r.adAccountId === selectedAccountId
      ) ?? null
    );
  }, [activeRecords, selectedReferenceAdId, isSingleAccountSelected, selectedAccountId]);

  const scopeValidation = useMemo(
    () =>
      validateComparatorScope({
        selectedAccountId,
        referenceAd,
        candidateAccountId: candidate.adAccountId || selectedAccountId,
        accountPermissionMissing,
      }),
    [selectedAccountId, referenceAd, candidate.adAccountId, accountPermissionMissing]
  );

  const accountComparisons = useMemo(() => {
    if (!isSingleAccountSelected) return comparisons;
    return comparisons.filter((c) => c.ad_account_id === selectedAccountId);
  }, [comparisons, isSingleAccountSelected, selectedAccountId]);

  const handlePickCandidateMedia = async (file: File | undefined) => {
    if (!file) return;
    setMediaValidationError(null);
    const result = await validateCandidateMediaFile(file);
    if (!result.valid || !result.mediaKind) {
      setPendingMediaFile(null);
      setMediaValidationError(result.error ?? "Arquivo inválido.");
      toast.error(result.error ?? "Arquivo inválido.");
      return;
    }

    revokeObjectUrl();
    const previewUrl = URL.createObjectURL(file);
    objectUrlRef.current = previewUrl;
    setPendingMediaFile(file);
    setCandidate((prev) => ({
      ...prev,
      mediaKind: result.mediaKind!,
      mediaUrl: previewUrl,
      mediaFileName: file.name,
      mediaLoadError: null,
      intendedFormat:
        result.mediaKind === "video" && !prev.intendedFormat.startsWith("video")
          ? "video_vertical"
          : prev.intendedFormat,
    }));
    toast.success(`Mídia "${file.name}" validada localmente para comparação.`);
  };

  const handleClearCandidateMedia = () => {
    revokeObjectUrl();
    setPendingMediaFile(null);
    setMediaValidationError(null);
    setCandidate((prev) => ({
      ...prev,
      mediaUrl: null,
      mediaFileName: null,
      mediaLoadError: null,
    }));
  };

  const handleTogglePlacement = (placement: string) => {
    setCandidate((prev) => {
      const exists = prev.intendedPlacements.includes(placement);
      const next = exists
        ? prev.intendedPlacements.filter((p) => p !== placement)
        : [...prev.intendedPlacements, placement];
      return { ...prev, intendedPlacements: next };
    });
  };

  const handleRunComparison = () => {
    if (!scopeValidation.valid || !referenceAd) {
      toast.error(scopeValidation.reason ?? "Escopo inválido para comparação.");
      return;
    }
    const result = buildComparisonAnalysis({
      refAd: referenceAd,
      candidate: {
        ...candidate,
        adAccountId: selectedAccountId,
      },
      sameAccountRecords: sameAccountAllRecords,
      dateFrom,
      dateTo,
    });
    setAnalysis(result);
    toast.success("Comparação criativa e plano de teste gerados.");
  };

  const handleSaveComparison = async (requestedStatus: ComparisonWorkflowStatus) => {
    if (!canEdit) {
      toast.error("Seu perfil possui acesso somente leitura.");
      return;
    }
    if (!scopeValidation.valid || !referenceAd) {
      toast.error(scopeValidation.reason ?? "Selecione conta e anúncio ativo de referência.");
      return;
    }
    if (!candidate.title.trim()) {
      toast.error("Informe um título para identificar esta comparação.");
      return;
    }

    const computedAnalysis =
      analysis ??
      buildComparisonAnalysis({
        refAd: referenceAd,
        candidate: { ...candidate, adAccountId: selectedAccountId },
        sameAccountRecords: sameAccountAllRecords,
        dateFrom,
        dateTo,
      });
    setAnalysis(computedAnalysis);

    const workflowResolution = resolveComparisonWorkflowStatus({
      requestedStatus,
      publishedAdId: publishedAdId || null,
      syncedRecords: sameAccountAllRecords,
      adAccountId: selectedAccountId,
      resultCategory: referenceAd.resultCategory,
    });
    if (workflowResolution.note) {
      toast.info(workflowResolution.note);
    }

    setSaving(true);
    let uploadedStoragePath: string | null = null;
    let persistedMediaUrl = candidate.mediaUrl;

    try {
      // Upload para o Storage somente quando o usuário salva explicitamente
      if (pendingMediaFile) {
        const ext = pendingMediaFile.name.split(".").pop()?.toLowerCase() || "bin";
        const filePath = `comparacoes/${selectedAccountId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("ad-creatives")
          .upload(filePath, pendingMediaFile, {
            cacheControl: "3600",
            upsert: false,
            contentType: pendingMediaFile.type || undefined,
          });
        if (uploadError) {
          throw new Error(`Falha ao enviar mídia candidata: ${uploadError.message}`);
        }
        uploadedStoragePath = filePath;
        const { data: publicData } = supabase.storage
          .from("ad-creatives")
          .getPublicUrl(filePath);
        persistedMediaUrl = publicData.publicUrl;
      } else if (persistedMediaUrl?.startsWith("blob:")) {
        persistedMediaUrl = null;
      }

      const matchedClient = clients.find(
        (c) => c.meta_ad_account_id === selectedAccountId
      );

      const candidatePayloadToSave: CandidateCreativeInput = {
        ...candidate,
        adAccountId: selectedAccountId,
        mediaUrl: persistedMediaUrl,
      };

      const nextVersion = editingComparisonId ? parentVersion + 1 : 1;

      const { data: inserted, error: insertError } = await (supabase as any)
        .from("creative_comparisons")
        .insert({
          ad_account_id: selectedAccountId,
          client_id: matchedClient?.id ?? null,
          reference_ad_id: referenceAd.id,
          reference_ad_external_id: referenceAd.externalId,
          reference_ad_name: referenceAd.name,
          objective: referenceAd.rawObjective,
          result_category: referenceAd.resultCategory,
          result_indicator: referenceAd.resultIndicator,
          attribution_window: referenceAd.attributionWindow,
          period_start: dateFrom,
          period_end: dateTo,
          candidate_title: candidate.title.trim(),
          candidate_version: nextVersion,
          parent_comparison_id: editingComparisonId,
          candidate_payload: candidatePayloadToSave,
          analysis_payload: computedAnalysis,
          workflow_status: workflowResolution.status,
          published_ad_id: workflowResolution.linkedAd?.id ?? null,
          published_ad_external_id: workflowResolution.linkedAd?.externalId ?? null,
          created_by: userId ?? null,
          created_by_name: userName ?? "Gestor",
        })
        .select("id, candidate_version")
        .single();

      if (insertError) {
        if (uploadedStoragePath) {
          await supabase.storage.from("ad-creatives").remove([uploadedStoragePath]);
        }
        throw new Error(insertError.message);
      }

      setPendingMediaFile(null);
      setCandidate(candidatePayloadToSave);
      setEditingComparisonId(inserted?.id ?? null);
      setParentVersion(inserted?.candidate_version ?? nextVersion);
      setWorkflowStatus(workflowResolution.status);
      onComparisonSaved();
      toast.success(
        editingComparisonId
          ? `Nova versão v${nextVersion} salva no histórico sem sobrescrever a anterior.`
          : "Comparação salva como rascunho na biblioteca."
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar comparação.");
    } finally {
      setSaving(false);
    }
  };

  const handleReopenComparison = (row: CreativeComparisonRow) => {
    if (selectedAccountId !== row.ad_account_id) {
      onSelectAccount(row.ad_account_id);
    }
    revokeObjectUrl();
    setPendingMediaFile(null);
    setMediaValidationError(null);
    setSelectedReferenceAdId(row.reference_ad_id ?? "");
    const payload = row.candidate_payload ?? {};
    setCandidate({
      ...createEmptyCandidate(row.ad_account_id),
      ...payload,
      adAccountId: row.ad_account_id,
      title: row.candidate_title || payload.title || "",
    });
    setAnalysis(row.analysis_payload ?? null);
    setEditingComparisonId(row.id);
    setParentVersion(row.candidate_version || 1);
    setWorkflowStatus(row.workflow_status || "draft");
    setPublishedAdId(row.published_ad_id ?? "");
    toast.info(
      `Comparação "${row.candidate_title}" (v${row.candidate_version}) carregada. Ao salvar, será criada a versão v${(row.candidate_version || 1) + 1}.`
    );
  };

  const handleResetNewComparison = () => {
    revokeObjectUrl();
    setPendingMediaFile(null);
    setMediaValidationError(null);
    setCandidate(createEmptyCandidate(selectedAccountId));
    setAnalysis(null);
    setEditingComparisonId(null);
    setParentVersion(0);
    setWorkflowStatus("draft");
    setPublishedAdId("");
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Guardrails de Escopo */}
      <div className="rounded-2xl border border-border bg-card/60 p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary">
              <GitCompare className="h-3.5 w-3.5" />
              Comparador Operacional (Sem Geração por IA)
            </div>
            <h2 className="text-lg font-black tracking-tight text-foreground">
              Comparar Anúncio Ativo × Peça Candidata Não Publicada
            </h2>
            <p className="text-xs text-muted-foreground max-w-3xl">
              Compare um anúncio ativo sincronizado da Meta com uma peça pronta fornecida por você.
              Esta área não gera imagens por IA e não cria nem edita campanhas na Meta Ads.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedAccountId}
              onChange={(e) => onSelectAccount(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground"
            >
              <option value="all">Selecione uma conta específica...</option>
              {accounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name || acc.account_name}
                </option>
              ))}
            </select>

            {editingComparisonId && (
              <button
                type="button"
                onClick={handleResetNewComparison}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold hover:border-primary/40 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" /> Nova Comparação
              </button>
            )}
          </div>
        </div>

        {!isSingleAccountSelected && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
            <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-100 space-y-1">
              <p className="font-bold">Seleção de conta única obrigatória</p>
              <p className="text-amber-200/90">
                Para evitar mistura de clientes, moedas, objetivos ou unidades de resultado,
                selecione uma conta específica acima antes de comparar anúncios.
              </p>
            </div>
          </div>
        )}

        {isSingleAccountSelected && accountPermissionMissing && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs text-rose-100 space-y-1">
              <p className="font-bold">Conta sem permissão ativa na Meta Ads API</p>
              <p className="text-rose-200/90">
                {accountHealth?.summary ||
                  "Não foi possível validar os anúncios e métricas desta conta. Dados ausentes nunca são tratados como zero."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Área Principal: Lado Esquerdo (Referência Ativa) vs Lado Direito (Peça Candidata) */}
      {isSingleAccountSelected && !accountPermissionMissing && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Coluna 1: Anúncio Ativo de Referência */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  1. Anúncio Ativo de Referência (Meta)
                </span>
                <h3 className="text-sm font-black text-foreground">
                  Somente anúncios com status efetivo Ativo nesta conta
                </h3>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                {accountActiveAds.length} ativos
              </span>
            </div>

            <div className="space-y-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={adSearch}
                  onChange={(e) => setAdSearch(e.target.value)}
                  placeholder="Filtrar anúncio ativo por nome, campanha ou título..."
                  className="w-full rounded-xl border border-border bg-background pl-8 pr-3 py-2 text-xs"
                />
              </div>

              <select
                value={selectedReferenceAdId}
                onChange={(e) => {
                  setSelectedReferenceAdId(e.target.value);
                  setAnalysis(null);
                }}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold"
              >
                <option value="">Escolha um anúncio ativo de referência...</option>
                {accountActiveAds.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.name} — {ad.campaignName} ({ad.resultLabel})
                  </option>
                ))}
              </select>
            </div>

            {referenceAd ? (
              <div className="rounded-xl border border-border bg-background/60 p-4 space-y-4">
                <div className="flex items-start gap-3">
                  {referenceAd.hasRealThumbnail && referenceAd.thumbnailUrl ? (
                    <img
                      src={referenceAd.thumbnailUrl}
                      alt={referenceAd.name}
                      className="h-20 w-20 rounded-xl object-cover border border-border shrink-0"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded-xl border border-dashed border-border bg-muted/30 flex items-center justify-center text-[10px] text-muted-foreground text-center p-1 shrink-0">
                      Mídia indisponível
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                        Status Meta: {referenceAd.deliveryLabel}
                      </span>
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                          referenceAd.periodDeliveryState === "with_delivery"
                            ? "bg-sky-500/15 border-sky-500/30 text-sky-300"
                            : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                        }`}
                      >
                        {referenceAd.periodDeliveryLabel}
                      </span>
                    </div>
                    <p className="text-sm font-black text-foreground truncate">
                      {referenceAd.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Conta: <strong className="text-foreground">{referenceAd.accountName}</strong>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Campanha: <strong className="text-foreground">{referenceAd.campaignName}</strong>
                      {" · "}Conjunto: <strong className="text-foreground">{referenceAd.adSetName}</strong>
                    </p>
                    {referenceAd.adsManagerUrl && (
                      <a
                        href={referenceAd.adsManagerUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:underline"
                      >
                        Abrir no Gerenciador de Anúncios <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Contexto técnico de interpretação Meta */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] border-t border-border pt-3">
                  <div>
                    <span className="text-muted-foreground block">Objetivo</span>
                    <span className="font-semibold text-foreground">
                      {referenceAd.rawObjective || "dado indisponível"}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Indicador Oficial</span>
                    <span className="font-semibold text-foreground">
                      {referenceAd.resultLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Janela Atribuição</span>
                    <span className="font-semibold text-foreground">
                      {referenceAd.attributionWindow}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Formato / Posic.</span>
                    <span className="font-semibold text-foreground">
                      {referenceAd.creativeFormat || "não informado"}
                      {referenceAd.placementsSummary.length > 0
                        ? ` (${referenceAd.placementsSummary.join(", ")})`
                        : ""}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">Período</span>
                    <span className="font-semibold text-foreground">
                      {dateFrom} a {dateTo}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block">CTA</span>
                    <span className="font-semibold text-foreground">
                      {referenceAd.callToActionType || "não informado"}
                    </span>
                  </div>
                </div>

                {/* Métricas do Período */}
                {referenceAd.periodDeliveryState === "no_delivery" && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    Este anúncio está ativo na Meta, mas não teve entrega no período ({dateFrom} a{" "}
                    {dateTo}). Não há base de entrega para conclusões de fadiga ou performance.
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] border-t border-border pt-3">
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">Investimento</span>
                    <span className="font-bold text-foreground">
                      {referenceAd.availability === "unavailable"
                        ? "dado indisponível"
                        : formatCurrency(referenceAd.spend)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">Impressões</span>
                    <span className="font-bold text-foreground">
                      {referenceAd.availability === "unavailable"
                        ? "dado indisponível"
                        : formatNumber(referenceAd.impressions)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">Alcance</span>
                    <span className="font-bold text-foreground">
                      {referenceAd.availability === "unavailable"
                        ? "dado indisponível"
                        : formatNumber(referenceAd.reach)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">Frequência</span>
                    <span className="font-bold text-foreground">
                      {referenceAd.frequency !== null
                        ? referenceAd.frequency.toFixed(2)
                        : "dado indisponível"}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">CPM</span>
                    <span className="font-bold text-foreground">
                      {formatCurrency(referenceAd.cpm)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">CTR (Link)</span>
                    <span className="font-bold text-foreground">
                      {formatPercent(referenceAd.ctrLink)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">CPC (Link)</span>
                    <span className="font-bold text-foreground">
                      {formatCurrency(referenceAd.cpcLink)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60">
                    <span className="text-muted-foreground block">Cliques no Link</span>
                    <span className="font-bold text-foreground">
                      {referenceAd.availability === "unavailable"
                        ? "dado indisponível"
                        : formatNumber(referenceAd.linkClicks)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60 col-span-2">
                    <span className="text-muted-foreground block">
                      Resultados ({referenceAd.resultLabel})
                    </span>
                    <span className="font-bold text-foreground">
                      {referenceAd.availability === "unavailable"
                        ? "dado indisponível"
                        : formatNumber(referenceAd.results)}
                    </span>
                  </div>
                  <div className="rounded-lg bg-card p-2 border border-border/60 col-span-2">
                    <span className="text-muted-foreground block">
                      {referenceAd.costLabel}
                    </span>
                    <span className="font-bold text-foreground">
                      {formatCurrency(referenceAd.unitCost)}
                    </span>
                  </div>
                  {referenceAd.resultCategory === "PURCHASES" && (
                    <>
                      <div className="rounded-lg bg-card p-2 border border-border/60 col-span-2">
                        <span className="text-muted-foreground block">Valor de Compra</span>
                        <span className="font-bold text-foreground">
                          {formatCurrency(referenceAd.purchaseValue)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-card p-2 border border-border/60 col-span-2">
                        <span className="text-muted-foreground block">ROAS</span>
                        <span className="font-bold text-foreground">
                          {referenceAd.roas !== null
                            ? `${referenceAd.roas.toFixed(2)}x`
                            : "dado indisponível"}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                {/* Copy & Título do Anúncio Ativo */}
                <div className="space-y-2 border-t border-border pt-3 text-xs">
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      Headline atual:
                    </span>
                    <p className="text-foreground">
                      {referenceAd.creativeTitle || "Não informado na Meta"}
                    </p>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-muted-foreground">
                      Texto principal atual:
                    </span>
                    <p className="text-muted-foreground whitespace-pre-wrap line-clamp-4">
                      {referenceAd.creativeBody || "Não informado na Meta"}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                Selecione um anúncio ativo acima para visualizar métricas oficiais, copy e mídia de referência.
              </div>
            )}
          </div>

          {/* Coluna 2: Peça Candidata Não Publicada */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                  2. Peça Nova Candidata (Não Publicada)
                </span>
                <h3 className="text-sm font-black text-foreground">
                  Envie a peça pronta para análise comparativa
                </h3>
              </div>
              {editingComparisonId && (
                <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary">
                  Base v{parentVersion} → Próxima v{parentVersion + 1}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Título da Comparação / Versão *
                </label>
                <input
                  type="text"
                  value={candidate.title}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder="Ex: Civic EXL 2021 — Gancho entrada reduzida vs anúncio atual"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              {/* Upload de Mídia */}
              <div className="sm:col-span-2 space-y-2">
                <label className="text-[11px] font-bold text-muted-foreground block">
                  Mídia da Peça Candidata (PNG/JPG/WEBP até 8MB ou MP4/MOV/WEBM até 50MB)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold hover:border-primary/40 cursor-pointer">
                    <Upload className="h-3.5 w-3.5 text-primary" />
                    {candidate.mediaFileName ? "Trocar Arquivo" : "Selecionar Imagem ou Vídeo"}
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp,.mp4,.mov,.webm"
                      className="sr-only"
                      onChange={(e) => {
                        void handlePickCandidateMedia(e.target.files?.[0]);
                        e.currentTarget.value = "";
                      }}
                    />
                  </label>

                  {candidate.mediaUrl && (
                    <button
                      type="button"
                      onClick={handleClearCandidateMedia}
                      className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 px-2.5 py-2 text-xs text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover mídia
                    </button>
                  )}
                </div>

                {mediaValidationError && (
                  <p className="text-[11px] text-rose-400 font-medium">{mediaValidationError}</p>
                )}

                {candidate.mediaUrl && (
                  <div className="rounded-xl border border-border bg-background p-2 flex items-center gap-3">
                    {candidate.mediaKind === "video" ? (
                      <video
                        src={candidate.mediaUrl}
                        controls
                        className="h-24 w-24 rounded-lg object-cover border border-border bg-black"
                      />
                    ) : (
                      <img
                        src={candidate.mediaUrl}
                        alt={candidate.mediaFileName ?? "Peça candidata"}
                        className="h-24 w-24 rounded-lg object-cover border border-border"
                      />
                    )}
                    <div className="text-[11px] space-y-0.5 min-w-0">
                      <p className="font-bold text-foreground truncate flex items-center gap-1">
                        {candidate.mediaKind === "video" ? (
                          <Video className="h-3.5 w-3.5 text-primary shrink-0" />
                        ) : (
                          <ImagePlus className="h-3.5 w-3.5 text-primary shrink-0" />
                        )}
                        {candidate.mediaFileName}
                      </p>
                      <p className="text-muted-foreground">
                        {pendingMediaFile
                          ? "Validada localmente — será enviada ao Storage apenas ao salvar."
                          : "Mídia salva nesta comparação."}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Headline da Nova Peça
                </label>
                <input
                  type="text"
                  value={candidate.headline}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, headline: e.target.value }))
                  }
                  placeholder="Ex: Condição especial no seminovo revisado"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  CTA Pretendido
                </label>
                <input
                  type="text"
                  value={candidate.cta}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, cta: e.target.value }))
                  }
                  placeholder="Ex: Enviar mensagem / Saiba mais"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Texto Principal (Copy / Gancho)
                </label>
                <textarea
                  rows={3}
                  value={candidate.primaryText}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, primaryText: e.target.value }))
                  }
                  placeholder="Cole exatamente a legenda/copy que acompanha a peça candidata..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={candidate.description}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder="Texto secundário (opcional)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  URL de Destino / WhatsApp
                </label>
                <input
                  type="text"
                  value={candidate.destinationUrl}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, destinationUrl: e.target.value }))
                  }
                  placeholder="https://... ou wa.me/..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Oferta / Condição Confirmada
                </label>
                <input
                  type="text"
                  value={candidate.confirmedOffer}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, confirmedOffer: e.target.value }))
                  }
                  placeholder="Ex: Laudo cautelar aprovado, entrada facilitada"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Preço Confirmado (Nunca inferido da imagem)
                </label>
                <input
                  type="text"
                  value={candidate.confirmedPrice}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, confirmedPrice: e.target.value }))
                  }
                  placeholder="Ex: R$ 89.900 à vista"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Especificações Confirmadas (Modelo, Ano, KM, Garantia)
                </label>
                <input
                  type="text"
                  value={candidate.confirmedVehicleSpecs}
                  onChange={(e) =>
                    setCandidate((prev) => ({
                      ...prev,
                      confirmedVehicleSpecs: e.target.value,
                    }))
                  }
                  placeholder="Ex: Honda Civic EXL 2021 · 48.000 km · Garantia de 1 ano"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Formato Pretendido
                </label>
                <select
                  value={candidate.intendedFormat}
                  onChange={(e) =>
                    setCandidate((prev) => ({
                      ...prev,
                      intendedFormat: e.target.value as CandidateCreativeInput["intendedFormat"],
                    }))
                  }
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                >
                  <option value="4:5">4:5 (Feed Vertical)</option>
                  <option value="1:1">1:1 (Feed Quadrado)</option>
                  <option value="9:16">9:16 (Stories / Reels)</option>
                  <option value="16:9">16:9 (Horizontal)</option>
                  <option value="video_vertical">Vídeo Vertical (Reels/Stories)</option>
                  <option value="video_feed">Vídeo Feed (4:5 / 1:1)</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Posicionamentos Pretendidos
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEMENT_OPTIONS.map((p) => {
                    const active = candidate.intendedPlacements.includes(p);
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleTogglePlacement(p)}
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                          active
                            ? "border-primary bg-primary/15 text-primary"
                            : "border-border bg-background text-muted-foreground"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="text-[11px] font-bold text-muted-foreground block mb-1">
                  Hipótese do Gestor (O que esta nova peça busca melhorar?)
                </label>
                <input
                  type="text"
                  value={candidate.userHypothesis}
                  onChange={(e) =>
                    setCandidate((prev) => ({ ...prev, userHypothesis: e.target.value }))
                  }
                  placeholder="Ex: Gancho com preço confirmado nos 3s iniciais aumenta qualificação no WhatsApp"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
              <button
                type="button"
                disabled={!scopeValidation.valid}
                onClick={handleRunComparison}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <GitCompare className="h-3.5 w-3.5" /> Gerar Comparação & Plano de Teste
              </button>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={saving || !scopeValidation.valid || !candidate.title.trim()}
                    onClick={() => void handleSaveComparison("draft")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-2 text-xs font-bold hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    {editingComparisonId ? `Salvar Nova Versão v${parentVersion + 1}` : "Salvar Rascunho"}
                  </button>
                  <button
                    type="button"
                    disabled={saving || !scopeValidation.valid || !candidate.title.trim()}
                    onClick={() => void handleSaveComparison("ready_for_test")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <FileCheck2 className="h-3.5 w-3.5" /> Marcar Pronto para Teste
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Resultado da Análise em Duas Camadas */}
      {analysis && (
        <div className="space-y-6">
          {/* Camada A: Comparação Criativa Observável */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-sky-400">
                  Camada A · Comparação Criativa Observável
                </span>
                <h3 className="text-base font-black text-foreground">
                  O que mudou entre o anúncio ativo e a peça candidata
                </h3>
              </div>
              <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold text-foreground">
                {analysis.changedVariables.length} variável(is) alterada(s)
              </span>
            </div>

            {analysis.missingCommercialFacts.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 space-y-1.5">
                <p className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                  Fatos comerciais ausentes (o sistema não inventa preço, km, ano ou garantia):
                </p>
                <ul className="list-disc pl-5 text-[11px] text-amber-100/90 space-y-0.5">
                  {analysis.missingCommercialFacts.map((fact, idx) => (
                    <li key={idx}>{fact}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-[11px] text-muted-foreground">
                    <th className="py-2 pr-3">Dimensão</th>
                    <th className="py-2 pr-3">Anúncio Ativo</th>
                    <th className="py-2 pr-3">Peça Candidata</th>
                    <th className="py-2">Leitura Objetiva</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {analysis.observableDiffs.map((diff) => (
                    <tr key={diff.dimension} className="align-top">
                      <td className="py-2.5 pr-3 font-bold text-foreground whitespace-nowrap">
                        {diff.label}
                        {diff.changed && (
                          <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary">
                            Mudou
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground max-w-xs">
                        {diff.referenceValue}
                      </td>
                      <td className="py-2.5 pr-3 text-foreground max-w-xs">
                        {diff.candidateValue}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {diff.concreteObservation}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Camada B: Performance, Benchmark e Separação Epistêmica */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-400">
                Camada B · Performance, Benchmark & Hipótese
              </span>
              <h3 className="text-base font-black text-foreground">
                Evidências da conta e separação explícita entre fato e hipótese
              </h3>
            </div>

            {/* Resumo do Benchmark */}
            <div className="rounded-xl border border-border bg-background/60 p-4 space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-foreground">
                  Benchmark da mesma conta, objetivo e indicador ({analysis.benchmark.resultUnitLabel})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Período {analysis.benchmark.periodStart} a {analysis.benchmark.periodEnd}
                </span>
              </div>

              {analysis.benchmark.hasSufficientSample ? (
                <div className="space-y-1 text-muted-foreground">
                  <p>
                    Amostra: <strong className="text-foreground">{analysis.benchmark.peerCount}</strong>{" "}
                    anúncio(s) · <strong className="text-foreground">{analysis.benchmark.totalResults}</strong>{" "}
                    {analysis.benchmark.resultUnitLabel} · Custo médio ponderado:{" "}
                    <strong className="text-foreground">
                      {formatCurrency(analysis.benchmark.weightedUnitCost)}
                    </strong>{" "}
                    ({analysis.benchmark.exploratoryRangeLabel}).
                  </p>
                  <p className="text-[11px]">{analysis.benchmark.calculationMethod}</p>
                </div>
              ) : (
                <p className="text-amber-200 font-medium">
                  {analysis.benchmark.insufficientReason}
                </p>
              )}
            </div>

            {/* 4 Blocos Epistêmicos Separados */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-2">
                <p className="text-xs font-black uppercase text-emerald-300">
                  1. Fatos observados na Meta
                </p>
                <ul className="list-disc pl-4 text-xs text-foreground/90 space-y-1">
                  {analysis.observedMetaFacts.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 space-y-2">
                <p className="text-xs font-black uppercase text-sky-300">
                  2. Interpretação do sistema
                </p>
                <ul className="list-disc pl-4 text-xs text-foreground/90 space-y-1">
                  {analysis.systemInterpretation.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-2">
                <p className="text-xs font-black uppercase text-violet-300">
                  3. Hipótese sobre o novo criativo
                </p>
                <p className="text-xs text-foreground/90">{analysis.creativeHypothesis}</p>
              </div>

              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2">
                <p className="text-xs font-black uppercase text-amber-300">
                  4. Validação pós-veiculação
                </p>
                <p className="text-xs text-foreground/90">{analysis.postDeliveryValidationNote}</p>
              </div>
            </div>

            {/* Recomendações Estruturadas */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                Recomendações Acionáveis & Limites
              </h4>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {analysis.recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="rounded-xl border border-border bg-background/60 p-4 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-foreground">{rec.proposedChange}</span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
                        Confiança {rec.confidenceLevel}
                      </span>
                    </div>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Por quê:</strong> {rec.evidenceReason}
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Hipótese:</strong>{" "}
                      {rec.expectedOutcomeHypothesis}
                    </p>
                    <p className="text-muted-foreground">
                      <strong className="text-foreground">Métricas:</strong> Principal:{" "}
                      {rec.primaryMetric} · Secundárias: {rec.secondaryMetrics.join(", ")}
                    </p>
                    <p className="text-[11px] text-amber-200/90">
                      <strong>Condição de validade:</strong> {rec.validityCondition} ({rec.confidenceReason})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Plano de Teste Executável */}
          <div className="rounded-2xl border border-primary/30 bg-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5 text-primary" />
                <div>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-primary">
                    Plano de Teste Executável
                  </span>
                  <h3 className="text-base font-black text-foreground">
                    Roteiro pronto para validação sem publicação automática na Meta
                  </h3>
                </div>
              </div>
              <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                Não publicado na Meta
              </span>
            </div>

            {analysis.testPlan.isMultiVariableChange && analysis.testPlan.multiVariableWarning && (
              <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-1.5 text-xs">
                <p className="font-bold text-amber-200 flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-amber-400" />
                  Teste exploratório multivariável ({analysis.testPlan.changedVariables.length}{" "}
                  variáveis alteradas)
                </p>
                <p className="text-amber-100/90">{analysis.testPlan.multiVariableWarning}</p>
                {analysis.testPlan.controlledTestSuggestion && (
                  <p className="text-amber-200 font-medium">
                    Sugestão controlada: {analysis.testPlan.controlledTestSuggestion}
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="md:col-span-2 rounded-xl border border-border bg-background/60 p-3">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Hipótese testável (1 frase)
                </span>
                <p className="font-semibold text-foreground mt-0.5">
                  {analysis.testPlan.testableHypothesis}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Variável principal testada
                </span>
                <p className="text-foreground mt-0.5">{analysis.testPlan.primaryVariable}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Constantes mantidas
                </span>
                <p className="text-foreground mt-0.5">{analysis.testPlan.keptConstants}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Métrica principal & secundárias
                </span>
                <p className="text-foreground mt-0.5">
                  Principal: <strong>{analysis.testPlan.primaryMetric}</strong> · Secundárias:{" "}
                  {analysis.testPlan.secondaryMetrics.join(", ")}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-background/60 p-3">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Referência & Janela de Leitura
                </span>
                <p className="text-foreground mt-0.5">
                  {analysis.testPlan.referenceAccountName} · {analysis.testPlan.referenceCampaignName} ·{" "}
                  {analysis.testPlan.attributionWindow} ({analysis.testPlan.periodLabel})
                </p>
              </div>
              <div className="md:col-span-2 rounded-xl border border-border bg-background/60 p-3 space-y-1">
                <span className="text-[11px] font-bold text-muted-foreground block">
                  Critério de leitura & amostra mínima
                </span>
                <p className="text-foreground">{analysis.testPlan.readingCriteria}</p>
                <p className="text-[11px] text-muted-foreground">
                  {analysis.testPlan.recommendedMinSampleNote} · {analysis.testPlan.publicationStatusNote}
                </p>
              </div>
            </div>

            {/* Vinculação pós-publicação opcional (somente anúncio sincronizado da mesma conta/objetivo) */}
            {canEdit && (
              <div className="rounded-xl border border-border bg-background/40 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <p className="font-bold text-foreground">
                    Vincular anúncio após publicação manual na Meta (opcional)
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Status como &ldquo;Em veiculação&rdquo; ou &ldquo;Resultado registrado&rdquo; só
                    é liberado após vincular um anúncio sincronizado da mesma conta e objetivo.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={publishedAdId}
                    onChange={(e) => setPublishedAdId(e.target.value)}
                    className="rounded-xl border border-border bg-background px-2.5 py-1.5 text-xs max-w-xs"
                  >
                    <option value="">Ainda não publicado na Meta</option>
                    {sameAccountAllRecords
                      .filter(
                        (r) =>
                          referenceAd &&
                          r.resultCategory === referenceAd.resultCategory &&
                          r.id !== referenceAd.id
                      )
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.deliveryLabel})
                        </option>
                      ))}
                  </select>
                  {publishedAdId && (
                    <button
                      type="button"
                      disabled={saving || !candidate.title.trim()}
                      onClick={() => void handleSaveComparison("running")}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white cursor-pointer"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Registrar Vínculo
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Histórico de Comparações Salvas */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-black text-foreground">
              Histórico & Versões Salvas ({accountComparisons.length})
            </h3>
          </div>
          {comparisonsLoading && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Carregando...
            </span>
          )}
        </div>

        {accountComparisons.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma comparação salva para esta conta ainda.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {accountComparisons.map((row) => {
              const badge = WORKFLOW_STATUS_LABELS[row.workflow_status] ?? WORKFLOW_STATUS_LABELS.draft;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-border bg-background/60 p-3.5 flex items-start justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.tone}`}>
                        {badge.label}
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                        v{row.candidate_version}
                      </span>
                    </div>
                    <p className="text-xs font-black text-foreground truncate">
                      {row.candidate_title}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      Referência: {row.reference_ad_name || "Anúncio removido"} ·{" "}
                      {row.period_start} a {row.period_end}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Por {row.created_by_name || "Gestor"} em{" "}
                      {new Date(row.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleReopenComparison(row)}
                    className="inline-flex items-center gap-1 rounded-xl border border-border bg-card px-2.5 py-1.5 text-[11px] font-bold hover:border-primary/40 shrink-0 cursor-pointer"
                  >
                    Reabrir <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
