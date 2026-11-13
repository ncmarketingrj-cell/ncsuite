import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Plus,
  Save,
  Trash2,
  Loader2,
  FileText,
  CheckSquare,
  Square,
  Sparkles,
  Eye,
  Code2,
  Layers,
  CheckCircle2,
  Wand2,
  Copy,
  ArrowRight,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import {
  PARAMETER_SECTIONS,
  REPORT_TEMPLATE_PARAMETERS,
  SYSTEM_REPORT_TEMPLATES,
  SAMPLE_PREVIEW_CAMPAIGNS,
  getCheckedParametersFromText,
  toggleParameterInTemplateText,
  buildTemplateFromChecklist,
  generateVariationsFromBaseTemplate,
  renderReportTemplateText,
  saveCustomReportTemplate,
  deleteCustomReportTemplate,
  type ReportTemplateRecord,
  type ReportCampaignItem,
} from "@/lib/reportTemplateEngine";

interface TemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  templates: ReportTemplateRecord[];
  activeReportMode?: string;
  onSelectReportMode?: (modeId: string) => void;
  liveCampaigns?: ReportCampaignItem[];
  liveClientName?: string;
  livePeriodText?: string;
  liveReportLevel?: "campaign" | "adset" | "ad";
  liveIsVehicleContext?: boolean;
  liveSalesRevenue?: string;
  liveSalesOrders?: string;
}

export function TemplateModal({
  isOpen,
  onClose,
  onSuccess,
  templates,
  activeReportMode = "standard_auto",
  onSelectReportMode,
  liveCampaigns = [],
  liveClientName = "",
  livePeriodText = "",
  liveReportLevel = "campaign",
  liveIsVehicleContext = true,
  liveSalesRevenue = "",
  liveSalesOrders = "",
}: TemplateModalProps) {
  const [activeTab, setActiveTab] = useState<"list" | "create">("list");
  const [isLoading, setIsLoading] = useState(false);

  // Estado do Construtor Didático
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [messageTemplate, setMessageTemplate] = useState("");
  const [pdfLayout, setPdfLayout] = useState<"classic" | "analytical" | "minimalist">("classic");
  const [activeVariantPreview, setActiveVariantPreview] = useState<
    "current" | "objective" | "campaigns" | "complete" | "sector"
  >("current");
  const [rightPaneMode, setRightPaneMode] = useState<"preview" | "raw">("preview");
  const [autoGenerateVariations, setAutoGenerateVariations] = useState<boolean>(true);
  const [activeSectionFilter, setActiveSectionFilter] = useState<string>("all");

  // Combina templates customizados salvos + templates oficiais do sistema
  const customTemplates = useMemo(
    () => (templates || []).filter((t) => !t.is_system),
    [templates]
  );

  // Identifica o template atualmente selecionado no relatório (seja do sistema ou customizado)
  const currentActiveTemplate = useMemo<ReportTemplateRecord>(() => {
    const foundCustom = customTemplates.find((t) => t.id === activeReportMode);
    if (foundCustom) return foundCustom;
    const foundSystem = SYSTEM_REPORT_TEMPLATES.find((t) => t.id === activeReportMode);
    return foundSystem || SYSTEM_REPORT_TEMPLATES[0];
  }, [activeReportMode, customTemplates]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("list");
    }
  }, [isOpen]);

  const startFromTemplate = (tpl: ReportTemplateRecord, asNewCopy = false) => {
    if (tpl.is_system || asNewCopy) {
      setEditingId(null);
      const cleanTitle = tpl.name.replace(/^[⭐🎯📌📊🍕]\s*/, "");
      setName(`${cleanTitle} (Personalizado)`);
    } else {
      setEditingId(tpl.id);
      setName(tpl.name);
    }
    setMessageTemplate(tpl.message_template);
    setPdfLayout((tpl.pdf_layout as any) || "classic");
    setActiveVariantPreview("current");
    setRightPaneMode("preview");
    setActiveTab("create");
  };

  const resetFormNew = () => {
    setEditingId(null);
    setName("Meu Padrão Executivo NC");
    const defaultChecked: Record<string, boolean> = {};
    for (const p of REPORT_TEMPLATE_PARAMETERS) {
      defaultChecked[p.key] = Boolean(p.defaultChecked);
    }
    setMessageTemplate(buildTemplateFromChecklist(defaultChecked, { variant: "complete" }));
    setPdfLayout("classic");
    setActiveVariantPreview("current");
    setRightPaneMode("preview");
  };

  // Mapa reativo de quais parâmetros do checklist estão presentes no texto atual
  const checkedMap = useMemo(
    () => getCheckedParametersFromText(messageTemplate),
    [messageTemplate]
  );

  // Variações geradas automaticamente a partir do template base em edição
  const generatedVariations = useMemo(
    () => generateVariationsFromBaseTemplate(name || "Meu Modelo", messageTemplate),
    [name, messageTemplate]
  );

  // Texto efetivo mostrado na prévia (o texto atual ou uma das 4 variações automáticas)
  const effectiveTemplateText = useMemo(() => {
    if (activeVariantPreview === "current") return messageTemplate;
    const found = generatedVariations.find((v) => v.variantKey === activeVariantPreview);
    return found ? found.templateText : messageTemplate;
  }, [activeVariantPreview, messageTemplate, generatedVariations]);

  // Campanhas reais selecionadas ou exemplo realista para a prévia nunca ficar em branco
  const previewCampaigns = useMemo(() => {
    const selectedLive = (liveCampaigns || []).filter((c) => c.selected);
    return selectedLive.length > 0 ? selectedLive : SAMPLE_PREVIEW_CAMPAIGNS;
  }, [liveCampaigns]);

  const isUsingSampleData = useMemo(
    () => (liveCampaigns || []).filter((c) => c.selected).length === 0,
    [liveCampaigns]
  );

  // Texto final renderizado com dados para a Prévia de WhatsApp em tempo real
  const renderedPreviewText = useMemo(() => {
    const agencyName =
      typeof window !== "undefined"
        ? localStorage.getItem("nc_agency_name") || "NC AGÊNCIA"
        : "NC AGÊNCIA";
    return renderReportTemplateText({
      templateText: effectiveTemplateText,
      campaigns: previewCampaigns,
      clientName:
        liveClientName && liveClientName !== "Consolidado"
          ? liveClientName
          : "LumaCar Multimarcas",
      periodText: livePeriodText || "NOVEMBRO 2026",
      agencyName,
      reportLevel: liveReportLevel,
      isVehicleContext: liveIsVehicleContext,
      salesRevenue: liveSalesRevenue || "25.538,08",
      salesOrders: liveSalesOrders || "244",
    });
  }, [
    effectiveTemplateText,
    previewCampaigns,
    liveClientName,
    livePeriodText,
    liveReportLevel,
    liveIsVehicleContext,
    liveSalesRevenue,
    liveSalesOrders,
  ]);

  // Alterna um item no Checklist e insere/remove no local designado do template
  const handleToggleChecklistParam = (paramKey: string) => {
    const currentlyChecked = Boolean(checkedMap[paramKey]);
    const nextText = toggleParameterInTemplateText(
      messageTemplate,
      paramKey,
      !currentlyChecked
    );
    setMessageTemplate(nextText);
    setActiveVariantPreview("current");
  };

  // Aplica uma das 4 estruturas automáticas diretamente ao editor principal
  const handleApplyStructureVariant = (
    variantKey: "objective" | "campaigns" | "complete" | "sector"
  ) => {
    const found = generatedVariations.find((v) => v.variantKey === variantKey);
    if (!found) return;
    setMessageTemplate(found.templateText);
    setPdfLayout(found.pdfLayout);
    setActiveVariantPreview("current");
    toast.success(`Estrutura "${found.badge}" aplicada ao modelo!`);
  };

  const handleDelete = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteCustomReportTemplate(id);
      toast.success("Template excluído com sucesso!");
      onSuccess();
    } catch {
      toast.error("Erro ao excluir template");
    } finally {
      setIsLoading(false);
    }
  };

  // Gera as 4 variações a partir de qualquer template salvo na lista com 1 clique
  const handleGenerateFamilyFromExisting = async (tpl: ReportTemplateRecord) => {
    setIsLoading(true);
    try {
      const groupId = `grp-${Date.now()}`;
      const variations = generateVariationsFromBaseTemplate(tpl.name, tpl.message_template);
      let firstId: string | null = null;
      for (const v of variations) {
        const saved = await saveCustomReportTemplate({
          name: v.title,
          message_template: v.templateText,
          pdf_layout: v.pdfLayout,
          variant_type: v.variantKey,
          group_id: groupId,
          description: v.description,
        });
        if (!firstId) firstId = saved.id;
      }
      onSuccess();
      if (firstId && onSelectReportMode) {
        onSelectReportMode(firstId);
      }
      toast.success(
        "As 4 variações (Por Objetivo, Por Campanha, Detalhe de Campanha e Setorial) foram criadas e salvas!"
      );
    } catch (err) {
      console.error(err);
      toast.error("Erro ao gerar variações do template");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || !effectiveTemplateText.trim()) {
      toast.warning("Dê um nome ao template e selecione ao menos um parâmetro no checklist.");
      return;
    }

    setIsLoading(true);
    try {
      const groupId = `grp-${Date.now()}`;

      // 1. Salva o template principal
      const primarySaved = await saveCustomReportTemplate({
        id: editingId || undefined,
        name: trimmedName,
        message_template: effectiveTemplateText,
        pdf_layout: pdfLayout,
        variant_type: "custom",
        group_id: groupId,
        description: "Template personalizado criado no Checklist Didático.",
      });

      // 2. Se marcado para gerar automaticamente os derivados (Por Objetivo, Por Campanha, Detalhe de Campanha)
      if (autoGenerateVariations && !editingId) {
        const variations = generateVariationsFromBaseTemplate(
          trimmedName,
          effectiveTemplateText
        );
        for (const v of variations) {
          await saveCustomReportTemplate({
            name: v.title,
            message_template: v.templateText,
            pdf_layout: v.pdfLayout,
            variant_type: v.variantKey,
            group_id: groupId,
            description: v.description,
          });
        }
        toast.success(
          "Template principal + variações (Por Objetivo, Por Campanha e Detalhe) salvos e aplicados!"
        );
      } else {
        toast.success(
          editingId ? "Template atualizado com sucesso!" : "Template salvo e aplicado!"
        );
      }

      onSuccess();
      if (onSelectReportMode && primarySaved?.id) {
        onSelectReportMode(primarySaved.id);
      }
      setActiveTab("list");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar template");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const checkedCount = Object.values(checkedMap).filter(Boolean).length;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-background/85 backdrop-blur-md"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        className="relative w-full max-w-6xl bg-card border border-border rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100dvh - 24px)" }}
      >
        {/* CABEÇALHO DO MODAL */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/12 flex items-center justify-center border border-primary/25 shrink-0">
              <FileText className="h-4.5 w-4.5 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm sm:text-base font-black uppercase tracking-wider text-foreground">
                  Central Inteligente de Templates
                </h2>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">
                  Checklist + Prévia em Tempo Real
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                Marque no checklist o que deseja exibir no relatório e gere automaticamente as versões Por Objetivo, Por Campanha e Detalhada.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground flex items-center justify-center transition border border-transparent hover:border-border shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ABAS DE NAVEGAÇÃO */}
        <div className="flex border-b border-border bg-muted/40 shrink-0">
          <button
            onClick={() => setActiveTab("list")}
            className={`flex-1 py-3 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-2 ${
              activeTab === "list"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>Meus Templates & Modelo Atual</span>
            <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[10px]">
              {customTemplates.length + SYSTEM_REPORT_TEMPLATES.length}
            </span>
          </button>
          <button
            onClick={() => {
              resetFormNew();
              setActiveTab("create");
            }}
            className={`flex-1 py-3 px-3 text-[11px] sm:text-xs font-black uppercase tracking-widest transition-colors border-b-2 flex items-center justify-center gap-1.5 ${
              activeTab === "create"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            <span>{editingId ? "Editando Template no Checklist" : "Criar / Personalizar com Checklist"}</span>
          </button>
        </div>

        {/* CONTEÚDO PRINCIPAL */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
          {activeTab === "list" && (
            <div className="space-y-6">
              {/* 1. DESTAQUE: MODELO ATUALMENTE ATIVO NO RELATÓRIO */}
              <div className="rounded-2xl border-2 border-primary/40 bg-primary/[0.04] p-4 sm:p-5 space-y-3 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/35 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-500">
                        <CheckCircle2 className="h-3 w-3" /> Modelo Ativo Agora no Relatório
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase">
                        Layout PDF: {currentActiveTemplate.pdf_layout}
                      </span>
                    </div>
                    <h3 className="text-sm sm:text-base font-black text-foreground">
                      {currentActiveTemplate.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {currentActiveTemplate.description ||
                        "Este é o modelo que está gerando a mensagem de WhatsApp do seu relatório neste momento."}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap shrink-0">
                    <button
                      type="button"
                      onClick={() => startFromTemplate(currentActiveTemplate, false)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground hover:brightness-110 transition shadow-glow-sm"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Personalizar no Checklist
                    </button>
                    <button
                      type="button"
                      onClick={() => handleGenerateFamilyFromExisting(currentActiveTemplate)}
                      disabled={isLoading}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-background/80 hover:bg-primary/10 px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-primary transition"
                      title="Gera automaticamente as versões Por Objetivo, Por Campanha e Detalhada com base neste modelo"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Gerar 4 Variações Deste
                    </button>
                  </div>
                </div>

                {/* Mini prévia da estrutura do modelo atual */}
                <div className="rounded-xl border border-border/70 bg-background/70 p-3 max-h-36 overflow-y-auto custom-scrollbar">
                  <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                    Estrutura do Modelo Ativo:
                  </p>
                  <pre className="text-[11px] font-mono text-foreground/85 whitespace-pre-wrap leading-relaxed">
                    {currentActiveTemplate.message_template}
                  </pre>
                </div>
              </div>

              {/* 2. MEUS TEMPLATES PERSONALIZADOS SALVOS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-foreground flex items-center gap-2">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      Meus Templates Personalizados ({customTemplates.length})
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Modelos criados ou personalizados por você e suas variações automáticas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      resetFormNew();
                      setActiveTab("create");
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-primary/12 border border-primary/30 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Novo Modelo
                  </button>
                </div>

                {customTemplates.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-center space-y-2">
                    <p className="text-xs font-bold text-foreground">
                      Você ainda não salvou um modelo customizado próprio
                    </p>
                    <p className="text-[11px] text-muted-foreground max-w-lg mx-auto">
                      Clique em <strong>"Personalizar no Checklist"</strong> no modelo ativo acima ou escolha qualquer modelo base do sistema abaixo para criar o seu e gerar todas as variações com 1 clique.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {customTemplates.map((t) => {
                      const isCurrent = activeReportMode === t.id;
                      return (
                        <div
                          key={t.id}
                          className={`flex flex-col justify-between p-4 rounded-2xl border transition ${
                            isCurrent
                              ? "border-primary bg-primary/[0.05] shadow-glow-sm"
                              : "border-border bg-card/70 hover:border-primary/30"
                          }`}
                        >
                          <div className="space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <h4 className="text-xs font-black text-foreground uppercase truncate">
                                    {t.name}
                                  </h4>
                                  {isCurrent && (
                                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-500">
                                      Em Uso
                                    </span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">
                                  {t.description || `Layout PDF: ${t.pdf_layout}`}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleDelete(t.id)}
                                className="h-7 w-7 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 flex items-center justify-center transition shrink-0"
                                title="Excluir este template"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            <pre className="text-[10px] font-mono text-muted-foreground bg-background/60 border border-border/50 rounded-xl p-2.5 max-h-24 overflow-hidden whitespace-pre-wrap leading-relaxed">
                              {t.message_template}
                            </pre>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-border/50">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => startFromTemplate(t, false)}
                                className="px-3 py-1.5 rounded-lg bg-muted border border-border text-[10px] font-bold text-foreground hover:bg-muted/80 transition uppercase tracking-wider"
                              >
                                Editar no Checklist
                              </button>
                              <button
                                type="button"
                                onClick={() => handleGenerateFamilyFromExisting(t)}
                                className="px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/25 text-[10px] font-bold text-primary hover:bg-primary/20 transition uppercase tracking-wider"
                                title="Gerar versões Por Objetivo, Por Campanha e Detalhada com base neste template"
                              >
                                + Variações
                              </button>
                            </div>

                            {onSelectReportMode && (
                              <button
                                type="button"
                                onClick={() => {
                                  onSelectReportMode(t.id);
                                  toast.success(`Modelo "${t.name}" aplicado ao relatório!`);
                                  onClose();
                                }}
                                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${
                                  isCurrent
                                    ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                                    : "bg-primary text-primary-foreground hover:brightness-110"
                                }`}
                              >
                                {isCurrent ? "Aplicado" : "Usar no Relatório"}
                                <ArrowRight className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. MODELOS BASE OFICIAIS DO SISTEMA (SEMPRE VISÍVEIS) */}
              <div className="space-y-3 pt-2 border-t border-border/60">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
                    Modelos Oficiais do Sistema (Base Pronta)
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Todos os formatos nativos do gerador de relatórios. Você pode aplicar qualquer um diretamente ou abri-lo no Checklist para customizar do seu jeito.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {SYSTEM_REPORT_TEMPLATES.map((sysTpl) => {
                    const isCurrent = activeReportMode === sysTpl.id;
                    return (
                      <div
                        key={sysTpl.id}
                        className={`flex flex-col justify-between p-4 rounded-2xl border transition ${
                          isCurrent
                            ? "border-primary/60 bg-primary/[0.04]"
                            : "border-border bg-card/40 hover:border-border/90"
                        }`}
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-xs font-black text-foreground">{sysTpl.name}</h4>
                            {isCurrent && (
                              <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-500 shrink-0">
                                Ativo Agora
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed">
                            {sysTpl.description}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-3 mt-3 border-t border-border/40">
                          <button
                            type="button"
                            onClick={() => startFromTemplate(sysTpl, true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted border border-border text-[10px] font-bold text-foreground hover:border-primary/40 hover:text-primary transition uppercase tracking-wider"
                          >
                            <Wand2 className="h-3 w-3" /> Personalizar no Checklist
                          </button>

                          {onSelectReportMode && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectReportMode(sysTpl.id);
                                toast.success(`Modelo "${sysTpl.name}" selecionado no relatório!`);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary/12 border border-primary/30 text-[10px] font-black text-primary hover:bg-primary hover:text-primary-foreground transition uppercase tracking-wider"
                            >
                              {isCurrent ? "Selecionado" : "Aplicar no Relatório"}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {activeTab === "create" && (
            <div className="space-y-5">
              {/* LINHA SUPERIOR: NOME DO MODELO + LAYOUT PDF + BOTÕES DE GERAÇÃO DE FORMATO */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 p-4 rounded-2xl border border-border bg-muted/20">
                <div className="lg:col-span-5 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Nome Base do Seu Template
                  </label>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Relatório Executivo VIP"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-xs sm:text-sm font-bold text-foreground focus:border-primary focus:outline-none"
                  />
                </div>

                <div className="lg:col-span-3 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Estilo Visual do PDF
                  </label>
                  <select
                    value={pdfLayout}
                    onChange={(e) => setPdfLayout(e.target.value as any)}
                    className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-xs font-bold text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="classic">Clássico (Completo)</option>
                    <option value="analytical">Analítico (Por Objetivo)</option>
                    <option value="minimalist">Minimalista (Enxuto)</option>
                  </select>
                </div>

                <div className="lg:col-span-4 space-y-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                    <Wand2 className="h-3 w-3" /> Gerar Formato Automaticamente:
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleApplyStructureVariant("objective")}
                      className="rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/10 px-2 py-1.5 text-[10px] font-bold text-foreground hover:text-primary transition truncate"
                      title="Organiza os parâmetros marcados no formato Por Objetivo"
                    >
                      🎯 Por Objetivo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyStructureVariant("campaigns")}
                      className="rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/10 px-2 py-1.5 text-[10px] font-bold text-foreground hover:text-primary transition truncate"
                      title="Organiza os parâmetros marcados no formato Por Campanha"
                    >
                      📌 Por Campanha
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyStructureVariant("complete")}
                      className="rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/10 px-2 py-1.5 text-[10px] font-bold text-foreground hover:text-primary transition truncate"
                      title="Organiza os parâmetros marcados no formato Completo (Objetivo + Detalhe de Campanha)"
                    >
                      📊 Detalhe Completo
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApplyStructureVariant("sector")}
                      className="rounded-lg border border-border bg-background hover:border-primary/40 hover:bg-primary/10 px-2 py-1.5 text-[10px] font-bold text-foreground hover:text-primary transition truncate"
                      title="Organiza no formato enxuto por Frentes (Veículos, Alcance, Consignado, Perfil)"
                    >
                      ⭐ Padrão Frentes
                    </button>
                  </div>
                </div>
              </div>

              {/* PAINEL DUPLO: CHECKLIST EXPLICATIVO (ESQUERDA) + PRÉVIA / TEXTO DESIGNADO (DIREITA) */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* COLUNA ESQUERDA: CHECKLIST DIDÁTICO DE PARÂMETROS */}
                <div className="lg:col-span-6 space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
                  <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <CheckSquare className="h-4 w-4 text-primary" />
                        Checklist de Parâmetros do Relatório
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Marque o que deseja mostrar. Cada item marcado entra automaticamente no local certo da mensagem.
                      </p>
                    </div>
                    <span className="rounded-full bg-primary/15 border border-primary/30 px-2.5 py-1 text-[10px] font-black text-primary shrink-0">
                      {checkedCount} ativos
                    </span>
                  </div>

                  {/* Filtro rápido por seção */}
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                    {[
                      { id: "all", label: "Todos" },
                      { id: "header", label: "1. Cabeçalho" },
                      { id: "totals", label: "2. Totais" },
                      { id: "objectives", label: "3. Por Objetivo" },
                      { id: "campaigns", label: "4. Por Campanha" },
                      { id: "footer", label: "5. Rodapé" },
                    ].map((sec) => (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => setActiveSectionFilter(sec.id)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap transition ${
                          activeSectionFilter === sec.id
                            ? "bg-primary text-primary-foreground"
                            : "bg-background border border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {sec.label}
                      </button>
                    ))}
                  </div>

                  {/* Lista de Seções e Checkboxes Explicativos */}
                  <div className="space-y-4 max-h-[460px] overflow-y-auto pr-1 custom-scrollbar">
                    {PARAMETER_SECTIONS.filter(
                      (s) => activeSectionFilter === "all" || s.id === activeSectionFilter
                    ).map((section) => {
                      const sectionItems = REPORT_TEMPLATE_PARAMETERS.filter(
                        (p) => p.section === section.id
                      );
                      return (
                        <div key={section.id} className="space-y-2">
                          <div className="flex items-center justify-between bg-background/70 border border-border/60 rounded-xl px-3 py-2">
                            <div>
                              <h4 className="text-[11px] font-black uppercase tracking-wider text-foreground">
                                {section.title}
                              </h4>
                              <p className="text-[10px] text-muted-foreground">
                                {section.subtitle}
                              </p>
                            </div>
                            <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
                              {section.badge}
                            </span>
                          </div>

                          <div className="space-y-2 pl-1">
                            {sectionItems.map((param) => {
                              const isChecked = Boolean(checkedMap[param.key]);
                              return (
                                <div
                                  key={param.key}
                                  onClick={() => handleToggleChecklistParam(param.key)}
                                  className={`group cursor-pointer rounded-xl border p-3 transition-all select-none ${
                                    isChecked
                                      ? "border-primary/50 bg-primary/[0.06] shadow-xs"
                                      : "border-border/70 bg-card/60 hover:border-primary/30 hover:bg-muted/30"
                                  }`}
                                >
                                  <div className="flex items-start gap-2.5">
                                    <div className="mt-0.5 shrink-0">
                                      {isChecked ? (
                                        <CheckSquare className="h-4 w-4 text-primary" />
                                      ) : (
                                        <Square className="h-4 w-4 text-muted-foreground group-hover:text-foreground" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <span className="text-xs font-black text-foreground">
                                          {param.label}
                                        </span>
                                        <span className="rounded bg-background/90 border border-border px-1.5 py-0.5 text-[9px] font-mono text-primary">
                                          {param.tag}
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        {param.explanation}
                                      </p>
                                      <div className="flex items-center justify-between gap-2 pt-1 text-[10px]">
                                        <span className="text-muted-foreground/80 flex items-center gap-1">
                                          <Info className="h-3 w-3 text-primary/70 shrink-0" />
                                          Local: <strong>{param.whereItAppears}</strong>
                                        </span>
                                      </div>
                                      <div className="mt-1 rounded-lg bg-background/80 border border-border/50 px-2.5 py-1.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400 whitespace-pre-wrap">
                                        Ex: {param.exampleOutput}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* COLUNA DIREITA: PRÉVIA EM TEMPO REAL + SIMULADOR DAS 4 VARIAÇÕES + TEXTO */}
                <div className="lg:col-span-6 space-y-3 rounded-2xl border border-border bg-muted/15 p-4">
                  {/* Barra Superior da Prévia: Alternar entre Prévia WhatsApp e Editor de Texto */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/60 pb-3">
                    <div>
                      <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                        <Eye className="h-4 w-4 text-emerald-500" />
                        Prévia da Mensagem no Local Designado
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {isUsingSampleData
                          ? "Exibindo prévia com dados de exemplo (selecione campanhas no relatório para ver os dados da conta)."
                          : `Exibindo prévia em tempo real com as ${(liveCampaigns || []).filter((c) => c.selected).length} campanhas marcadas no seu relatório!`}
                      </p>
                    </div>

                    <div className="flex rounded-xl bg-background p-1 border border-border shrink-0">
                      <button
                        type="button"
                        onClick={() => setRightPaneMode("preview")}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition ${
                          rightPaneMode === "preview"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Eye className="h-3 w-3" /> Prévia Pronta
                      </button>
                      <button
                        type="button"
                        onClick={() => setRightPaneMode("raw")}
                        className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-[10px] font-black uppercase transition ${
                          rightPaneMode === "raw"
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Code2 className="h-3 w-3" /> Editar Texto
                      </button>
                    </div>
                  </div>

                  {/* SELETOR DE VISUALIZAÇÃO DAS VARIAÇÕES GERADAS A PARTIR DO SEU TEMPLATE */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground block">
                      Veja como seu template fica em cada formato do relatório:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                      {[
                        { id: "current", label: "✍️ Seu Modelo Atual" },
                        { id: "objective", label: "🎯 Gerado: Por Objetivo" },
                        { id: "campaigns", label: "📌 Gerado: Por Campanha" },
                        { id: "complete", label: "📊 Gerado: Detalhe de Campanha" },
                        { id: "sector", label: "⭐ Gerado: Padrão Frentes" },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveVariantPreview(tab.id as any)}
                          className={`px-2.5 py-1.5 rounded-xl text-[10px] font-bold whitespace-nowrap transition border ${
                            activeVariantPreview === tab.id
                              ? "bg-primary/15 text-primary border-primary/40 font-black"
                              : "bg-background border-border text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ÁREA DA PRÉVIA DE WHATSAPP OU EDITOR DE TEXTO */}
                  {rightPaneMode === "preview" ? (
                    <div className="space-y-2">
                      <div className="relative rounded-2xl border border-emerald-500/30 bg-background/95 p-4 shadow-inner">
                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/50">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            📱 Simulação Real da Mensagem (WhatsApp)
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(renderedPreviewText);
                              toast.success("Prévia copiada para a área de transferência!");
                            }}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="h-3 w-3" /> Copiar Prévia
                          </button>
                        </div>
                        <pre className="text-xs font-mono text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap leading-relaxed max-h-[380px] overflow-y-auto custom-scrollbar">
                          {renderedPreviewText ||
                            "Selecione ao menos um parâmetro no checklist ao lado para visualizar a mensagem."}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[10px] text-muted-foreground">
                        Você também pode editar livremente os títulos, linhas ou emojis abaixo. O checklist à esquerda permanece sincronizado:
                      </p>
                      <textarea
                        value={effectiveTemplateText}
                        onChange={(e) => {
                          setActiveVariantPreview("current");
                          setMessageTemplate(e.target.value);
                        }}
                        rows={16}
                        className="w-full rounded-2xl border border-border bg-background p-4 text-xs font-mono text-emerald-600 dark:text-emerald-400 focus:outline-none focus:border-primary resize-none whitespace-pre-wrap leading-relaxed custom-scrollbar"
                      />
                    </div>
                  )}

                  {/* OPÇÃO DE GERAÇÃO AUTOMÁTICA DE FAMÍLIA DE TEMPLATES + BOTÃO SALVAR */}
                  <div className="pt-2 border-t border-border/60 space-y-3">
                    {!editingId && (
                      <label
                        onClick={() => setAutoGenerateVariations(!autoGenerateVariations)}
                        className="flex items-start gap-2.5 p-3 rounded-xl border border-primary/30 bg-primary/[0.05] cursor-pointer select-none"
                      >
                        <div className="mt-0.5 shrink-0">
                          {autoGenerateVariations ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="text-[11px] leading-snug">
                          <span className="font-black text-foreground block">
                            Gerar automaticamente os outros formatos a partir deste template
                          </span>
                          <span className="text-muted-foreground">
                            Cria também as versões <strong>Por Objetivo</strong>, <strong>Por Campanha</strong> e <strong>Detalhe de Campanha</strong> seguindo a mesma identidade que você montou.
                          </span>
                        </div>
                      </label>
                    )}

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3.5 text-xs font-black uppercase tracking-widest text-primary-foreground hover:brightness-110 transition shadow-glow-sm disabled:opacity-50"
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {editingId
                        ? "Salvar Alterações e Aplicar ao Relatório"
                        : autoGenerateVariations
                        ? "Salvar Template + Gerar Variações (Objetivo, Campanha e Detalhe)"
                        : "Salvar Template e Aplicar ao Relatório"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
