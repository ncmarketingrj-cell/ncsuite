import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarPlus,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  History,
  ListTodo,
  MessageSquare,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SocialHubChrome } from "@/components/social/SocialHubChrome";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useGlobalDate } from "@/contexts/DateContext";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import {
  useSocialAccountsQuery,
  useSocialOverviewQuery,
  useSocialPostsQuery,
} from "@/hooks/useSocialHubData";
import {
  generateStructuredSocialScript,
  useDeleteSocialContentMutation,
  useSaveSocialContentMutation,
  useSaveSocialTaskMutation,
  useSocialAccountStrategyQuery,
  useSocialContentItemsQuery,
  useSocialLearningsQuery,
  useSocialTeamMembersQuery,
} from "@/lib/socialHubService";
import {
  canTransitionContentStage,
  classifySocialAccount,
  CONTENT_PIPELINE_STAGES,
  type AiStructuredScriptDraft,
  type ContentPipelineStage,
  type SocialContentItem,
} from "@/lib/socialStrategyDomain";
import { supabase } from "@/integrations/supabase-external/client";

export const Route = createFileRoute("/_app/social-conteudo")({
  component: SocialContentWorkspacePage,
});

function SocialContentWorkspacePage() {
  const { user } = useAuth();
  const { canEdit, profile, isAdmin } = usePagePermission();
  const canEditSocial = canEdit("social");
  const tenantId = user?.id ?? null;

  const { dateFrom, dateTo } = useGlobalDate();
  const { selectedPage, selectedNetwork } = useSocialHubFilters();

  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];
  const masterToken = accountsQuery.data?.masterToken ?? null;
  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;

  const strategyQuery = useSocialAccountStrategyQuery({
    tenantId,
    pageId: selectedPage,
    accountName: selectedAccount?.page_name || "",
  });

  const overviewQuery = useSocialOverviewQuery({
    tenantId,
    accounts,
    selectedPage,
    network: selectedNetwork,
    masterToken,
    dateFrom,
    dateTo,
    enabled: Boolean(tenantId) && selectedPage !== "all" && !accountsQuery.isLoading,
  });

  const postsQuery = useSocialPostsQuery({
    tenantId,
    accounts,
    selectedPage,
    network: selectedNetwork,
    masterToken,
    dateFrom,
    dateTo,
    onlyInPeriod: false,
    enabled: Boolean(tenantId) && selectedPage !== "all" && !accountsQuery.isLoading,
  });

  const learningsQuery = useSocialLearningsQuery({ tenantId, pageId: selectedPage });
  const contentItemsQuery = useSocialContentItemsQuery({ tenantId, pageId: selectedPage });
  const teamMembersQuery = useSocialTeamMembersQuery(tenantId);

  const saveContent = useSaveSocialContentMutation();
  const deleteContent = useDeleteSocialContentMutation();
  const saveTask = useSaveSocialTaskMutation();

  const [activeTab, setActiveTab] = useState<"pipeline" | "generator">("pipeline");
  const [stageFilter, setStageFilter] = useState<ContentPipelineStage | "all">("all");
  const [selectedItem, setSelectedItem] = useState<SocialContentItem | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  // Estado do formulário de nova ideia / roteiro
  const [formTitle, setFormTitle] = useState("");
  const [formFormat, setFormFormat] = useState("Reels");
  const [formPlatform, setFormPlatform] = useState<"instagram" | "facebook" | "both">("instagram");
  const [formObjective, setFormObjective] = useState("");
  const [formPillar, setFormPillar] = useState("");
  const [formAudience, setFormAudience] = useState("");
  const [formInsight, setFormInsight] = useState("");
  const [formHypothesis, setFormHypothesis] = useState("");
  const [formPriority, setFormPriority] = useState<SocialContentItem["priority"]>("media");
  const [formEffort, setFormEffort] = useState<SocialContentItem["effort"]>("medio");
  const [formAssigneeId, setFormAssigneeId] = useState("");
  const [formApproverId, setFormApproverId] = useState("");
  const [formDueAt, setFormDueAt] = useState("");
  const [generatedDraft, setGeneratedDraft] = useState<AiStructuredScriptDraft | null>(null);

  const items = useMemo(() => {
    const all = contentItemsQuery.data || [];
    if (stageFilter === "all") return all;
    return all.filter((i) => i.stage === stageFilter);
  }, [contentItemsQuery.data, stageFilter]);

  const handleGenerateWithAi = async () => {
    if (!selectedAccount || !strategyQuery.data) {
      toast.error("Selecione uma conta específica antes de gerar roteiro.");
      return;
    }
    setIsGenerating(true);
    try {
      const cls = classifySocialAccount(selectedAccount, strategyQuery.data);
      const ov = overviewQuery.data;
      const totalInter = ov ? (ov.kpis.interactionsIg || 0) + (ov.kpis.interactionsFb || 0) : null;
      const kpisSummary = ov
        ? `Alcance IG: ${cls.hasInstagram ? ov.kpis.reachIg ?? "N/D" : "N/A (somente FB)"} | Interações: ${totalInter ?? "N/D"} | Seguidores IG: ${cls.hasInstagram ? ov.kpis.followersIg ?? "N/D" : "N/A"} | Fãs FB: ${ov.kpis.followersFb ?? "N/D"}`
        : null;

      const topPostTitles = (postsQuery.data?.allRecentPosts || [])
        .slice(0, 3)
        .map((p) => (p.content || p.title || "").slice(0, 60))
        .filter(Boolean);

      const confirmedLearnings = (learningsQuery.data || [])
        .filter((l) => l.validation_status === "confirmed")
        .slice(0, 2)
        .map((l) => l.title);

      const draft = await generateStructuredSocialScript({
        account: cls,
        strategy: strategyQuery.data,
        pillar: formPillar || strategyQuery.data.editorial_pillars[0] || "Conteúdo principal",
        objective: formObjective || strategyQuery.data.primary_objective || "Engajamento qualificado",
        audienceSegment: formAudience || strategyQuery.data.target_audience || "Público da conta",
        format: formFormat,
        originInsight: formInsight,
        hypothesis: formHypothesis,
        periodLabel: `${dateFrom} a ${dateTo}`,
        cachedKpisSummary: kpisSummary,
        topPostTitles,
        learningsSummary: confirmedLearnings,
      });
      setGeneratedDraft(draft);
      if (!formTitle.trim()) setFormTitle(draft.title);
      toast.success("Proposta gerada em 3 camadas (Fatos, Interpretação e Hipótese).");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao gerar proposta.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveNewContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSocial) {
      toast.error("Seu perfil tem acesso somente leitura.");
      return;
    }
    if (!selectedAccount || selectedPage === "all") {
      toast.error("Selecione uma conta específica para salvar a pauta.");
      return;
    }
    if (!formTitle.trim()) {
      toast.error("Informe um título para a ideia/conteúdo.");
      return;
    }

    const members = teamMembersQuery.data || [];
    const assignee = members.find((m) => m.id === formAssigneeId);
    const approver = members.find((m) => m.id === formApproverId);

    try {
      await saveContent.mutateAsync({
        page_id: selectedPage,
        client_id: strategyQuery.data?.client_id ?? null,
        account_name: selectedAccount.page_name,
        title: formTitle.trim(),
        stage: generatedDraft ? "briefing" : "idea",
        format: formFormat,
        platform: selectedAccount.instagram_account_id ? formPlatform : "facebook",
        objective: formObjective || strategyQuery.data?.primary_objective || "",
        editorial_pillar: formPillar,
        audience_segment: formAudience,
        origin_insight: formInsight,
        hypothesis: formHypothesis,
        priority: formPriority,
        effort: formEffort,
        hook_variations: generatedDraft?.hookVariations || [],
        script_scenes: generatedDraft?.scriptScenes || [],
        shot_list: generatedDraft?.shotList || [],
        on_screen_text: generatedDraft?.onScreenText || "",
        caption: generatedDraft?.caption || "",
        cta: generatedDraft?.cta || "",
        cover_suggestion: generatedDraft?.coverSuggestion || "",
        brief_notes: generatedDraft?.briefNotes || "",
        ai_grounding: generatedDraft?.grounding || null,
        assignee_id: assignee?.id || null,
        assignee_name: assignee?.full_name || "",
        approver_id: approver?.id || null,
        approver_name: approver?.full_name || "",
        due_at: formDueAt ? new Date(`${formDueAt}T18:00:00`).toISOString() : null,
        actorName: profile?.full_name || "Equipe",
        historyAction: generatedDraft ? "Criado com roteiro assistido" : "Ideia registrada",
        fromStage: null,
      });

      toast.success("Conteúdo salvo na esteira de produção.");
      setFormTitle("");
      setFormInsight("");
      setFormHypothesis("");
      setGeneratedDraft(null);
      setActiveTab("pipeline");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar conteúdo.");
    }
  };

  const handleStageChange = async (item: SocialContentItem, toStage: ContentPipelineStage) => {
    const check = canTransitionContentStage({
      fromStage: item.stage,
      toStage,
      canEditSocial,
      isApproverOrAdmin: isAdmin || canEditSocial,
    });
    if (!check.allowed) {
      toast.error(check.reason || "Sem permissão para alterar este estágio.");
      return;
    }
    try {
      const updated = await saveContent.mutateAsync({
        ...item,
        stage: toStage,
        actorName: profile?.full_name || "Equipe",
        historyAction: `Status alterado para ${CONTENT_PIPELINE_STAGES.find((s) => s.id === toStage)?.label || toStage}`,
        fromStage: item.stage,
      });
      if (selectedItem?.id === item.id) setSelectedItem(updated);
      toast.success("Estágio atualizado com histórico registrado.");
    } catch (err: any) {
      toast.error(err?.message || "Falha ao atualizar estágio.");
    }
  };

  const handleAddComment = async () => {
    if (!selectedItem || !commentDraft.trim() || !canEditSocial) return;
    const nextComments = [
      ...selectedItem.comments,
      {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        authorName: profile?.full_name || "Equipe",
        authorId: user?.id ?? null,
        text: commentDraft.trim(),
      },
    ];
    try {
      const updated = await saveContent.mutateAsync({
        ...selectedItem,
        comments: nextComments,
        actorName: profile?.full_name || "Equipe",
        historyAction: "Novo comentário de revisão",
        fromStage: selectedItem.stage,
      });
      setSelectedItem(updated);
      setCommentDraft("");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao adicionar comentário.");
    }
  };

  const handleCreateLinkedTask = async (item: SocialContentItem) => {
    if (!canEditSocial) return;
    try {
      await saveTask.mutateAsync({
        page_id: item.page_id,
        client_id: item.client_id ?? null,
        account_name: item.account_name,
        title: `Produzir/Revisar: ${item.title}`,
        description: `Pilar: ${item.editorial_pillar || "Geral"} | Formato: ${item.format} | Hipótese: ${item.hypothesis || "N/D"}`,
        task_type: "producao_conteudo",
        priority: item.priority,
        status: "todo",
        assignee_id: item.assignee_id ?? null,
        assignee_name: item.assignee_name || "",
        due_at: item.due_at ?? null,
        source_type: "content",
        source_id: item.id,
        linked_content_id: item.id,
        tags: [item.format, item.editorial_pillar].filter(Boolean),
        actorName: profile?.full_name || "Equipe",
        changeLabel: "Tarefa criada a partir de item de conteúdo",
      });
      toast.success("Tarefa vinculada criada em Projetos.");
    } catch (err: any) {
      toast.error(err?.message || "Erro ao vincular tarefa.");
    }
  };

  const handleSendDraftToPlanner = async (item: SocialContentItem) => {
    if (!canEditSocial || !user?.id) {
      toast.error("Sem permissão para criar rascunho no Planejador.");
      return;
    }
    try {
      const scheduledIso =
        item.scheduled_at || item.due_at || new Date(Date.now() + 86_400_000).toISOString();
      const formatMap: Record<string, string> = {
        Reels: "reels",
        Carrossel: "carousel",
        Stories: "stories",
      };
      const { data: postRow, error } = await (supabase as any)
        .from("social_posts")
        .insert({
          user_id: user.id,
          page_id: item.page_id,
          platform: item.platform === "facebook" ? "facebook" : "instagram",
          post_format: formatMap[item.format] || "post",
          caption: item.caption || item.title,
          scheduled_at: scheduledIso,
          status: "draft",
          account_name: item.account_name,
          client_id: item.client_id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;

      const updated = await saveContent.mutateAsync({
        ...item,
        planner_post_id: postRow?.id ?? null,
        actorName: profile?.full_name || "Equipe",
        historyAction: "Rascunho enviado ao Planejador & Feed (sem publicação automática na Meta)",
        fromStage: item.stage,
      });
      setSelectedItem(updated);
      toast.success(
        "Rascunho salvo no Planejador & Feed! Agendamento/publicação na Meta exige ação explícita lá."
      );
    } catch (err: any) {
      toast.error(err?.message || "Erro ao enviar rascunho para o Planejador.");
    }
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <PageHeader
        eyebrow="Social Hub"
        title="Conteúdo & Aprovação"
        description="Crie pautas, acompanhe a produção e aprove posts antes de ir para o calendário."
      />

      <SocialHubChrome
        tenantId={tenantId}
        requireExplicitAccount={activeTab === "generator" ? "script" : null}
        rightSlot={
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab("pipeline")}
              className={`rounded-xl px-3 py-2 sm:py-1.5 text-xs font-semibold transition-all min-h-[38px] sm:min-h-0 ${
                activeTab === "pipeline"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              Aprovações
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("generator")}
              className={`rounded-xl px-3 py-2 sm:py-1.5 text-xs font-semibold transition-all inline-flex items-center justify-center gap-1.5 min-h-[38px] sm:min-h-0 ${
                activeTab === "generator"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-background hover:bg-muted"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" /> Nova Ideia
            </button>
          </div>
        }
      />

      {activeTab === "generator" ? (
        selectedPage !== "all" && selectedAccount ? (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
            {/* Formulário da Pauta */}
            <form
              onSubmit={handleSaveNewContent}
              className="xl:col-span-5 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3.5"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black">Registrar Pauta — {selectedAccount.page_name}</h3>
                {!selectedAccount.instagram_account_id && (
                  <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[10px] font-bold text-blue-500">
                    Somente Facebook
                  </span>
                )}
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Título da pauta / conteúdo *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex.: Checklist prático antes de avaliar seminovo"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold block mb-1">Formato</label>
                  <select
                    value={formFormat}
                    onChange={(e) => setFormFormat(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="Reels">Reels / Vídeo curto</option>
                    <option value="Carrossel">Carrossel</option>
                    <option value="Post Estático">Post Estático</option>
                    <option value="Stories">Sequência Stories</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Plataforma</label>
                  <select
                    value={selectedAccount.instagram_account_id ? formPlatform : "facebook"}
                    disabled={!selectedAccount.instagram_account_id}
                    onChange={(e) => setFormPlatform(e.target.value as any)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
                  >
                    {selectedAccount.instagram_account_id && (
                      <>
                        <option value="instagram">Instagram</option>
                        <option value="both">Instagram + Facebook</option>
                      </>
                    )}
                    <option value="facebook">Facebook</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-bold block mb-1">Pilar editorial</label>
                  <select
                    value={formPillar}
                    onChange={(e) => setFormPillar(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Selecionar pilar...</option>
                    {(strategyQuery.data?.editorial_pillars || []).map((pil) => (
                      <option key={pil} value={pil}>
                        {pil}
                      </option>
                    ))}
                    <option value="Educação do público">Educação do público</option>
                    <option value="Prova social">Prova social</option>
                    <option value="Oferta confirmada">Oferta confirmada</option>
                    <option value="Bastidores">Bastidores</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Objetivo</label>
                  <input
                    type="text"
                    value={formObjective}
                    onChange={(e) => setFormObjective(e.target.value)}
                    placeholder={strategyQuery.data?.primary_objective || "Ex.: Mensagens / Autoridade"}
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Público-alvo</label>
                <input
                  type="text"
                  value={formAudience}
                  onChange={(e) => setFormAudience(e.target.value)}
                  placeholder={strategyQuery.data?.target_audience || "Segmento prioritário"}
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">
                  Insight, pergunta ou dado de origem
                </label>
                <textarea
                  rows={2}
                  value={formInsight}
                  onChange={(e) => setFormInsight(e.target.value)}
                  placeholder="O que gerou esta ideia (dúvida de atendimento, post anterior, sazonalidade...)"
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">
                  Hipótese que o conteúdo pretende testar
                </label>
                <textarea
                  rows={2}
                  value={formHypothesis}
                  onChange={(e) => setFormHypothesis(e.target.value)}
                  placeholder="Ex.: Mostrar critérios práticos antes do preço aumenta perguntas qualificadas."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <label className="text-xs font-bold block mb-1">Prioridade</label>
                  <select
                    value={formPriority}
                    onChange={(e) => setFormPriority(e.target.value as any)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2 text-xs"
                  >
                    <option value="baixa">Baixa</option>
                    <option value="media">Média</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Esforço</label>
                  <select
                    value={formEffort}
                    onChange={(e) => setFormEffort(e.target.value as any)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2 text-xs"
                  >
                    <option value="baixo">Baixo</option>
                    <option value="medio">Médio</option>
                    <option value="alto">Alto</option>
                  </select>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-xs font-bold block mb-1">Prazo</label>
                  <input
                    type="date"
                    value={formDueAt}
                    onChange={(e) => setFormDueAt(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold block mb-1">Responsável</label>
                  <select
                    value={formAssigneeId}
                    onChange={(e) => setFormAssigneeId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Selecionar...</option>
                    {(teamMembersQuery.data || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">Aprovador</label>
                  <select
                    value={formApproverId}
                    onChange={(e) => setFormApproverId(e.target.value)}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2 text-xs"
                  >
                    <option value="">Selecionar...</option>
                    {(teamMembersQuery.data || []).map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={handleGenerateWithAi}
                  className="flex-1 h-10 rounded-xl border border-primary/40 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/15 inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {isGenerating ? "Gerando roteiro..." : "Gerar roteiro & briefing IA"}
                </button>
                {canEditSocial && (
                  <button
                    type="submit"
                    disabled={saveContent.isPending}
                    className="flex-1 h-10 rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground hover:bg-primary/90 inline-flex items-center justify-center gap-1.5"
                  >
                    <Plus className="h-3.5 w-3.5" /> Salvar na esteira
                  </button>
                )}
              </div>
            </form>

            {/* Painel de Saída Estruturada em 3 Camadas */}
            <div className="xl:col-span-7 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              {!generatedDraft ? (
                <div className="py-12 text-center space-y-2">
                  <Sparkles className="h-8 w-8 text-primary mx-auto opacity-80" />
                  <h3 className="text-sm font-black">Roteiro e Briefing em 3 Camadas</h3>
                  <p className="text-xs text-muted-foreground max-w-md mx-auto">
                    Clique em "Gerar roteiro & briefing IA" ao lado para criar ganchos, cenas por tempo, lista de tomadas, texto na tela, legenda e capa separados claramente em Fatos Usados, Interpretação e Hipótese Criativa.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Alertas de dados comerciais pendentes (automotivo / não confirmado) */}
                  {generatedDraft.grounding.pendingConfirmations.length > 0 && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200 space-y-1">
                      <p className="font-bold flex items-center gap-1.5">
                        <AlertTriangle className="h-4 w-4 text-amber-500" /> Confirmações obrigatórias antes de produzir/publicar
                      </p>
                      {generatedDraft.grounding.pendingConfirmations.map((p, idx) => (
                        <p key={idx} className="text-[11px]">
                          • {p}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* 3 Camadas explícitas */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
                      <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                        1. Dados / fatos usados
                      </span>
                      <ul className="space-y-1 text-[11px]">
                        {generatedDraft.grounding.factsUsed.map((f, idx) => (
                          <li key={idx}>
                            • {f.fact}{" "}
                            <span className="text-muted-foreground">
                              ({f.source} • {f.period})
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
                      <span className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400">
                        2. Interpretação (leitura)
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {generatedDraft.grounding.interpretation}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-background/60 p-3 space-y-1.5">
                      <span className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400">
                        3. Hipótese criativa
                      </span>
                      <p className="text-[11px] leading-relaxed">
                        {generatedDraft.grounding.creativeHypothesis}
                      </p>
                    </div>
                  </div>

                  {/* Ganchos & Cenas */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-1.5">
                      <p className="text-xs font-bold">Variações de gancho</p>
                      <ul className="space-y-1 text-xs">
                        {generatedDraft.hookVariations.map((h, i) => (
                          <li key={i} className="rounded-lg bg-card border border-border/60 px-2.5 py-1.5">
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-1.5">
                      <p className="text-xs font-bold">Lista de tomadas / planos</p>
                      <ul className="space-y-1 text-xs text-muted-foreground">
                        {generatedDraft.shotList.map((s, i) => (
                          <li key={i}>• {s}</li>
                        ))}
                      </ul>
                      <p className="text-[11px] pt-1">
                        <strong>Capa sugerida:</strong> {generatedDraft.coverSuggestion}
                      </p>
                    </div>
                  </div>

                  {/* Roteiro por cena */}
                  <div className="space-y-2">
                    <p className="text-xs font-bold">Roteiro por cena e tempo</p>
                    <div className="space-y-2">
                      {generatedDraft.scriptScenes.map((sc, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-border/80 bg-background/50 p-3 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span>{sc.scene}</span>
                            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] text-primary">
                              {sc.timeRange}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            <strong>Visual:</strong> {sc.visualAction}
                          </p>
                          <p className="text-xs">
                            <strong>Fala:</strong> "{sc.spokenLine}"
                          </p>
                          <p className="text-[11px] text-primary font-semibold">
                            <strong>Texto na tela:</strong> {sc.onScreenText}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Legenda, CTA e Variações de Teste */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-1">
                      <p className="font-bold">Legenda + CTA sugeridos</p>
                      <p className="whitespace-pre-line text-muted-foreground">
                        {generatedDraft.caption}
                      </p>
                    </div>
                    <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-1.5">
                      <p className="font-bold">Briefing & Variações para Teste</p>
                      <p className="text-[11px] text-muted-foreground">{generatedDraft.briefNotes}</p>
                      {generatedDraft.testApproachVariations.map((v, i) => (
                        <p key={i} className="text-[11px]">
                          • {v}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null
      ) : (
        /* TAB 2: ESTEIRA DE PRODUÇÃO E APROVAÇÃO EM 8 ESTÁGIOS */
        <div className="space-y-4">
          {/* Filtros de Estágio */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
            <button
              type="button"
              onClick={() => setStageFilter("all")}
              className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold border ${
                stageFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              Todos ({contentItemsQuery.data?.length || 0})
            </button>
            {CONTENT_PIPELINE_STAGES.map((st) => {
              const count = (contentItemsQuery.data || []).filter((i) => i.stage === st.id).length;
              return (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => setStageFilter(st.id)}
                  className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold border ${
                    stageFilter === st.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Grid de Itens + Painel Lateral de Detalhes */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className={`${selectedItem ? "lg:col-span-6" : "lg:col-span-12"} space-y-2.5`}>
              {items.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center space-y-2">
                  <ClipboardCheck className="h-8 w-8 text-muted-foreground mx-auto" />
                  <p className="text-sm font-bold">Nenhum conteúdo neste filtro</p>
                  <p className="text-xs text-muted-foreground">
                    Crie uma nova ideia/roteiro com o contexto da conta selecionada ou envie rascunhos direto para o Planejador.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("generator")}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    <Plus className="h-3.5 w-3.5" /> Nova Ideia / Roteiro
                  </button>
                </div>
              ) : (
                items.map((item) => {
                  const stageMeta = CONTENT_PIPELINE_STAGES.find((s) => s.id === item.stage);
                  const isSel = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedItem(item)}
                      className={`cursor-pointer rounded-2xl border p-4 transition-all ${
                        isSel
                          ? "border-primary bg-primary/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                              {stageMeta?.label || item.stage}
                            </span>
                            <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-semibold">
                              {item.format}
                            </span>
                            <span className="text-[11px] font-semibold text-muted-foreground">
                              {item.account_name}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-foreground truncate">{item.title}</h4>
                          <p className="text-[11px] text-muted-foreground">
                            Pilar: {item.editorial_pillar || "Geral"} • Resp.:{" "}
                            {item.assignee_name || "A definir"} • Aprov.:{" "}
                            {item.approver_name || "A definir"}
                          </p>
                        </div>

                        {item.due_at && (
                          <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {new Date(item.due_at).toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {selectedItem && (
              <div className="lg:col-span-6 rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold text-primary uppercase">
                      {selectedItem.account_name} • {selectedItem.format}
                    </span>
                    <h3 className="text-base font-black">{selectedItem.title}</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedItem(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    Fechar
                  </button>
                </div>

                {/* Fluxo de status + permissões */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold block">Estágio do conteúdo</label>
                  <select
                    disabled={!canEditSocial || saveContent.isPending}
                    value={selectedItem.stage}
                    onChange={(e) =>
                      handleStageChange(selectedItem, e.target.value as ContentPipelineStage)
                    }
                    className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold"
                  >
                    {CONTENT_PIPELINE_STAGES.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Ações integradas */}
                <div className="flex flex-wrap gap-2">
                  {canEditSocial && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleSendDraftToPlanner(selectedItem)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        <CalendarPlus className="h-3.5 w-3.5 text-primary" /> Enviar rascunho ao Planejador
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCreateLinkedTask(selectedItem)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        <ListTodo className="h-3.5 w-3.5 text-primary" /> Criar tarefa vinculada
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await deleteContent.mutateAsync(selectedItem.id);
                          setSelectedItem(null);
                          toast.success("Item removido.");
                        }}
                        className="inline-flex items-center gap-1 rounded-xl border border-rose-500/30 px-2.5 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Excluir
                      </button>
                    </>
                  )}
                  <Link
                    to="/social"
                    className="inline-flex items-center gap-1 rounded-xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20"
                  >
                    Abrir Planejador <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>

                {/* Roteiro e legenda */}
                <div className="rounded-xl border border-border/80 bg-background/50 p-3 space-y-2 text-xs">
                  {selectedItem.hypothesis && (
                    <p>
                      <strong>Hipótese:</strong> {selectedItem.hypothesis}
                    </p>
                  )}
                  {selectedItem.caption && (
                    <p className="whitespace-pre-line text-muted-foreground">
                      <strong className="text-foreground">Legenda:</strong>{"\n"}
                      {selectedItem.caption}
                    </p>
                  )}
                  {selectedItem.published_url && (
                    <a
                      href={selectedItem.published_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary font-semibold hover:underline"
                    >
                      Ver publicação veiculada <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>

                {/* Comentários de revisão / aprovação */}
                <div className="space-y-2 border-t border-border/70 pt-3">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-primary" /> Comentários ({selectedItem.comments.length})
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedItem.comments.map((c) => (
                      <div key={c.id} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                        <span className="font-bold">{c.authorName}: </span>
                        <span>{c.text}</span>
                      </div>
                    ))}
                  </div>
                  {canEditSocial && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={commentDraft}
                        onChange={(e) => setCommentDraft(e.target.value)}
                        placeholder="Registrar feedback de revisão ou aprovação..."
                        className="flex-1 h-8 rounded-xl border border-border bg-background px-3 text-xs"
                      />
                      <button
                        type="button"
                        onClick={handleAddComment}
                        className="h-8 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground inline-flex items-center gap-1"
                      >
                        <Send className="h-3 w-3" /> Enviar
                      </button>
                    </div>
                  )}
                </div>

                {/* Histórico de alterações */}
                <div className="space-y-1.5 border-t border-border/70 pt-3">
                  <p className="text-xs font-bold flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5 text-muted-foreground" /> Histórico de alterações
                  </p>
                  <ul className="space-y-1 max-h-32 overflow-y-auto text-[11px] text-muted-foreground">
                    {selectedItem.history.map((h, i) => (
                      <li key={i} className="flex items-center justify-between gap-2">
                        <span>
                          <strong className="text-foreground">{h.actorName}</strong>: {h.action}
                        </span>
                        <span className="shrink-0">
                          {new Date(h.at).toLocaleDateString("pt-BR")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
