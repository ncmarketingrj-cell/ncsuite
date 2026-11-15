import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase-external/client";
import {
  evaluateCreativeTestEvidence,
  type CreativeAdRecord,
  type CreativeTestStatus,
  type CreativeTestType,
} from "@/lib/creativeIntelligenceDomain";

export interface CreativeTestRow {
  id: string;
  ad_account_id: string;
  client_id?: string | null;
  campaign_id?: string | null;
  ad_set_id?: string | null;
  title: string;
  business_question: string;
  test_type: CreativeTestType;
  objective?: string | null;
  optimization_goal?: string | null;
  result_unit?: string | null;
  target_audience_context?: string | null;
  hypothesis_category: string;
  hypothesis_text: string;
  primary_variable: string;
  kept_constants?: string | null;
  evaluation_criteria: string;
  participant_ad_ids: string[];
  participant_asset_ids: string[];
  start_date?: string | null;
  end_date?: string | null;
  status: CreativeTestStatus;
  observed_result_summary?: string | null;
  learning_notes?: string | null;
  next_decision: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

const TEST_TYPE_LABELS: Record<CreativeTestType, string> = {
  controlled_single_var: "Teste controlado (1 variável)",
  concept_exploration: "Exploração de conceito",
  observational_comparison: "Comparação observacional",
};

const TEST_STATUS_STYLE: Record<CreativeTestStatus, { label: string; cls: string }> = {
  planned: { label: "Planejado", cls: "border-border bg-muted text-muted-foreground" },
  running: { label: "Em execução", cls: "border-sky-500/35 bg-sky-500/10 text-sky-400" },
  inconclusive: { label: "Inconclusivo", cls: "border-amber-500/35 bg-amber-500/10 text-amber-400" },
  concluded: { label: "Concluído", cls: "border-emerald-500/35 bg-emerald-500/10 text-emerald-400" },
  archived: { label: "Arquivado", cls: "border-border bg-muted/40 text-muted-foreground" },
};

const HYPOTHESIS_CATEGORIES = [
  { id: "hook", label: "Gancho (primeiros 3s / headline)" },
  { id: "offer", label: "Oferta / condição comercial" },
  { id: "angle", label: "Ângulo / dor principal" },
  { id: "social_proof", label: "Prova social / autoridade" },
  { id: "format", label: "Formato (vídeo, estático, carrossel)" },
  { id: "cta", label: "Chamada para ação (CTA)" },
  { id: "vehicle_presentation", label: "Enquadramento / apresentação do produto" },
  { id: "other", label: "Outro" },
];

export interface CreativeTestsSectionProps {
  tests: CreativeTestRow[];
  records: CreativeAdRecord[];
  recordsById: Map<string, CreativeAdRecord>;
  accounts: Array<{ id: string; name: string }>;
  selectedAccountId: string;
  assets: Array<{ id: string; title: string }>;
  canEdit: boolean;
  userId?: string | null;
  userName?: string | null;
  preselectedAdForTest?: CreativeAdRecord | null;
  onClearPreselectedAd: () => void;
}

export function CreativeTestsSection({
  tests,
  records,
  recordsById,
  accounts,
  selectedAccountId,
  assets,
  canEdit,
  userId,
  userName,
  preselectedAdForTest,
  onClearPreselectedAd,
}: CreativeTestsSectionProps) {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(Boolean(preselectedAdForTest));
  const [editingId, setEditingId] = useState<string | null>(null);

  const initialAcc =
    preselectedAdForTest?.adAccountId ||
    (selectedAccountId !== "all" ? selectedAccountId : accounts[0]?.id || "");

  const [formAccountId, setFormAccountId] = useState(initialAcc);
  const [formCampaignId, setFormCampaignId] = useState(preselectedAdForTest?.campaignId || "");
  const [formTitle, setFormTitle] = useState(
    preselectedAdForTest ? `Teste criativo — ${preselectedAdForTest.campaignName}` : ""
  );
  const [formQuestion, setFormQuestion] = useState("");
  const [formType, setFormType] = useState<CreativeTestType>("controlled_single_var");
  const [formHypCategory, setFormHypCategory] = useState("hook");
  const [formHypText, setFormHypText] = useState("");
  const [formPrimaryVar, setFormPrimaryVar] = useState("Gancho inicial / Headline");
  const [formKeptConstants, setFormKeptConstants] = useState("Mesmo público, orçamento e posicionamento");
  const [formCriteria, setFormCriteria] = useState(
    preselectedAdForTest
      ? `${preselectedAdForTest.costLabel} com mínimo de 1.000 impressões por variação`
      : "Custo por resultado oficial na mesma unidade com amostra mínima estável"
  );
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formStatus, setFormStatus] = useState<CreativeTestStatus>("planned");
  const [formAdIds, setFormAdIds] = useState<string[]>(
    preselectedAdForTest ? [preselectedAdForTest.id] : []
  );
  const [formAssetIds, setFormAssetIds] = useState<string[]>([]);
  const [formLearning, setFormLearning] = useState("");
  const [formDecision, setFormDecision] = useState("collect_more_data");

  useEffect(() => {
    if (preselectedAdForTest) {
      openNewModal(preselectedAdForTest);
    }
  }, [preselectedAdForTest]);

  const openNewModal = (seedAd?: CreativeAdRecord | null) => {
    setEditingId(null);
    const acc = seedAd?.adAccountId || (selectedAccountId !== "all" ? selectedAccountId : accounts[0]?.id || "");
    setFormAccountId(acc);
    setFormCampaignId(seedAd?.campaignId || "");
    setFormTitle(seedAd ? `Teste criativo — ${seedAd.campaignName}` : "");
    setFormQuestion("");
    setFormType("controlled_single_var");
    setFormHypCategory("hook");
    setFormHypText("");
    setFormPrimaryVar("Gancho inicial / Headline");
    setFormKeptConstants("Mesmo conjunto, público e janela de atribuição");
    setFormCriteria(
      seedAd
        ? `${seedAd.costLabel} com mínimo de 1.000 impressões por variação`
        : "Custo por resultado oficial na mesma unidade"
    );
    setFormStartDate(new Date().toISOString().slice(0, 10));
    setFormStatus("planned");
    setFormAdIds(seedAd ? [seedAd.id] : []);
    setFormAssetIds([]);
    setFormLearning("");
    setFormDecision("collect_more_data");
    setModalOpen(true);
  };

  const openEditModal = (t: CreativeTestRow) => {
    setEditingId(t.id);
    setFormAccountId(t.ad_account_id);
    setFormCampaignId(t.campaign_id || "");
    setFormTitle(t.title);
    setFormQuestion(t.business_question);
    setFormType(t.test_type);
    setFormHypCategory(t.hypothesis_category);
    setFormHypText(t.hypothesis_text);
    setFormPrimaryVar(t.primary_variable);
    setFormKeptConstants(t.kept_constants || "");
    setFormCriteria(t.evaluation_criteria);
    setFormStartDate(t.start_date || new Date().toISOString().slice(0, 10));
    setFormStatus(t.status);
    setFormAdIds(Array.isArray(t.participant_ad_ids) ? t.participant_ad_ids : []);
    setFormAssetIds(Array.isArray(t.participant_asset_ids) ? t.participant_asset_ids : []);
    setFormLearning(t.learning_notes || "");
    setFormDecision(t.next_decision || "collect_more_data");
    setModalOpen(true);
  };

  const accountAds = useMemo(() => {
    return records.filter((r) => !formAccountId || r.adAccountId === formAccountId);
  }, [records, formAccountId]);

  const accountCampaigns = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of accountAds) {
      if (r.campaignId) map.set(r.campaignId, r.campaignName);
    }
    return Array.from(map.entries());
  }, [accountAds]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!formAccountId || !formTitle.trim() || !formQuestion.trim() || !formHypText.trim()) {
        throw new Error("Preencha conta, título, pergunta de negócio e hipótese.");
      }
      const firstAd = formAdIds.map((id) => recordsById.get(id)).find(Boolean);
      const payload = {
        ad_account_id: formAccountId,
        campaign_id: formCampaignId || firstAd?.campaignId || null,
        ad_set_id: firstAd?.adSetId || null,
        title: formTitle.trim(),
        business_question: formQuestion.trim(),
        test_type: formType,
        objective: firstAd?.rawObjective || null,
        optimization_goal: firstAd?.optimizationGoal || null,
        result_unit: firstAd?.resultLabel || null,
        hypothesis_category: formHypCategory,
        hypothesis_text: formHypText.trim(),
        primary_variable: formPrimaryVar.trim() || "Variável criativa",
        kept_constants: formKeptConstants.trim() || null,
        evaluation_criteria: formCriteria.trim() || "Custo por resultado oficial",
        participant_ad_ids: formAdIds,
        participant_asset_ids: formAssetIds,
        start_date: formStartDate || null,
        status: formStatus,
        learning_notes: formLearning.trim() || null,
        next_decision: formDecision,
        created_by: userId || null,
        created_by_name: userName || null,
        updated_at: new Date().toISOString(),
      };

      if (editingId) {
        const { error } = await (supabase as any).from("creative_tests").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("creative_tests").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Teste criativo atualizado!" : "Teste criativo criado!");
      qc.invalidateQueries({ queryKey: ["criativos-tests"] });
      setModalOpen(false);
      onClearPreselectedAd();
    },
    onError: (err: any) => {
      toast.error(err?.message || "Erro ao salvar teste criativo.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("creative_tests").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Teste removido.");
      qc.invalidateQueries({ queryKey: ["criativos-tests"] });
    },
    onError: (err: any) => toast.error(err?.message || "Erro ao remover teste."),
  });

  return (
    <section className="space-y-4" aria-label="Planejador de testes criativos">
      <div className="rounded-2xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-primary" /> Planejador de Testes & Hipóteses Criativas
          </h3>
          <p className="text-xs text-muted-foreground">
            Estruture perguntas de negócio, variáveis isoladas e leitura científica sem misturar objetivos ou declarar vencedor sem amostra.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => openNewModal(null)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-black uppercase text-white hover:bg-primary/90 transition shrink-0 cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" /> Novo Teste Criativo
          </button>
        )}
      </div>

      {tests.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-14 px-6 text-center space-y-2">
          <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground">Nenhum teste criativo registrado para este filtro</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Crie um plano de teste vinculando anúncios ativos ou novas variações produzidas para registrar hipóteses, resultados e próximos passos.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {tests.map((test) => {
            const participants = (test.participant_ad_ids || [])
              .map((id) => recordsById.get(id))
              .filter(Boolean) as CreativeAdRecord[];
            const evaluation = evaluateCreativeTestEvidence({
              testType: test.test_type,
              participantAds: participants,
            });
            const badge = TEST_STATUS_STYLE[test.status] || TEST_STATUS_STYLE.planned;

            return (
              <article key={test.id} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <span className="rounded-lg border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-bold text-foreground">
                        {TEST_TYPE_LABELS[test.test_type] || test.test_type}
                      </span>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {accounts.find((a) => a.id === test.ad_account_id)?.name || test.ad_account_id}
                      </span>
                    </div>
                    <h4 className="text-base font-black text-foreground">{test.title}</h4>
                    <p className="text-xs text-muted-foreground">
                      <strong className="text-foreground">Pergunta:</strong> {test.business_question}
                    </p>
                  </div>

                  {canEdit && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEditModal(test)}
                        className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Editar teste"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm("Excluir este planejamento de teste?")) {
                            deleteMutation.mutate(test.id);
                          }
                        }}
                        className="rounded-lg border border-border bg-background p-1.5 text-muted-foreground hover:text-rose-400 cursor-pointer"
                        title="Excluir teste"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-xs rounded-xl border border-border/70 bg-muted/20 p-3">
                  <div>
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">Hipótese ({test.hypothesis_category})</p>
                    <p className="text-foreground mt-0.5">{test.hypothesis_text}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">Variável Principal vs Constantes</p>
                    <p className="text-foreground mt-0.5">
                      <strong>Varia:</strong> {test.primary_variable}
                    </p>
                    {test.kept_constants && (
                      <p className="text-muted-foreground text-[11px]">Constante: {test.kept_constants}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-mono uppercase text-muted-foreground">Critério de Avaliação</p>
                    <p className="text-foreground mt-0.5">{test.evaluation_criteria}</p>
                  </div>
                </div>

                {/* Tabela Comparativa dos Participantes */}
                {evaluation.variantSummaries.length > 0 && (
                  <div className="rounded-xl border border-border overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/30 text-[10px] font-mono uppercase text-muted-foreground">
                        <tr>
                          <th className="p-2.5">Anúncio Participante</th>
                          <th className="p-2.5">Unidade</th>
                          <th className="p-2.5 text-right">Investimento</th>
                          <th className="p-2.5 text-right">Impressões</th>
                          <th className="p-2.5 text-right">Resultados</th>
                          <th className="p-2.5 text-right">Custo/Unid.</th>
                          <th className="p-2.5 text-right">CTR Link</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {evaluation.variantSummaries.map((v) => (
                          <tr key={v.adId}>
                            <td className="p-2.5 font-semibold text-foreground">{v.adName}</td>
                            <td className="p-2.5 font-mono text-[11px]">{v.resultCategory}</td>
                            <td className="p-2.5 text-right">R$ {v.spend.toFixed(2)}</td>
                            <td className="p-2.5 text-right">{v.impressions.toLocaleString("pt-BR")}</td>
                            <td className="p-2.5 text-right font-bold">{v.results.toLocaleString("pt-BR")}</td>
                            <td className="p-2.5 text-right font-bold">
                              {v.unitCost !== null ? `R$ ${v.unitCost.toFixed(2)}` : "—"}
                            </td>
                            <td className="p-2.5 text-right">
                              {v.ctrLink !== null ? `${v.ctrLink.toFixed(2)}%` : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Alertas metodológicos / Evidência ausente */}
                <div className="space-y-1.5 text-[11px]">
                  <p className="text-muted-foreground">{evaluation.causalLimitationNote}</p>
                  {evaluation.missingEvidence.length > 0 ? (
                    <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-300">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Evidência pendente (manter inconclusivo/em andamento):</strong>{" "}
                        {evaluation.missingEvidence.join(" • ")}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Variantes comparáveis na mesma conta e unidade oficial.
                    </div>
                  )}
                  {test.learning_notes && (
                    <p className="rounded-xl border border-border/60 bg-background/60 p-2.5 text-foreground">
                      <strong>Aprendizado registrado:</strong> {test.learning_notes}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Criar / Editar Teste Criativo */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-2xl space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-sm font-black uppercase text-foreground flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                {editingId ? "Editar Teste Criativo" : "Novo Planejamento de Teste Criativo"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  onClearPreselectedAd();
                }}
                className="text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-bold text-foreground mb-1">Conta de Anúncios *</label>
                <select
                  value={formAccountId}
                  onChange={(e) => {
                    setFormAccountId(e.target.value);
                    setFormCampaignId("");
                    setFormAdIds([]);
                  }}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-foreground mb-1">Campanha (Opcional)</label>
                <select
                  value={formCampaignId}
                  onChange={(e) => setFormCampaignId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="">Selecionar automaticamente ou geral</option>
                  {accountCampaigns.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">Título do Teste *</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="Ex: Teste de gancho oferta direta vs prova social"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">Pergunta de Negócio *</label>
                <input
                  value={formQuestion}
                  onChange={(e) => setFormQuestion(e.target.value)}
                  placeholder="Ex: Um gancho focado na parcela reduz o custo por conversa nesta campanha?"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>

              <div>
                <label className="block font-bold text-foreground mb-1">Tipo de Teste</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as CreativeTestType)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                >
                  {Object.entries(TEST_TYPE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>{lbl}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-foreground mb-1">Categoria da Hipótese</label>
                <select
                  value={formHypCategory}
                  onChange={(e) => setFormHypCategory(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                >
                  {HYPOTHESIS_CATEGORIES.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">Hipótese *</label>
                <textarea
                  value={formHypText}
                  onChange={(e) => setFormHypText(e.target.value)}
                  rows={2}
                  placeholder="Explique o que se espera melhorar e por quê..."
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>

              <div>
                <label className="block font-bold text-foreground mb-1">Variável Principal *</label>
                <input
                  value={formPrimaryVar}
                  onChange={(e) => setFormPrimaryVar(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-foreground mb-1">Constantes Mantidas</label>
                <input
                  value={formKeptConstants}
                  onChange={(e) => setFormKeptConstants(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">Critério de Avaliação Oficial *</label>
                <input
                  value={formCriteria}
                  onChange={(e) => setFormCriteria(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>

              <div>
                <label className="block font-bold text-foreground mb-1">Data de Início</label>
                <input
                  type="date"
                  value={formStartDate}
                  onChange={(e) => setFormStartDate(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>
              <div>
                <label className="block font-bold text-foreground mb-1">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as CreativeTestStatus)}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                >
                  {Object.entries(TEST_STATUS_STYLE).map(([k, st]) => (
                    <option key={k} value={k}>{st.label}</option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">
                  Anúncios Participantes ({formAdIds.length} selecionado(s))
                </label>
                <div className="max-h-36 overflow-y-auto rounded-xl border border-border bg-background p-2 space-y-1">
                  {accountAds.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">Nenhum anúncio sincronizado nesta conta no período.</p>
                  ) : (
                    accountAds.slice(0, 60).map((a) => {
                      const checked = formAdIds.includes(a.id);
                      return (
                        <label key={a.id} className="flex items-center gap-2 text-[11px] cursor-pointer hover:bg-muted/30 px-1.5 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setFormAdIds((prev) =>
                                e.target.checked ? [...prev, a.id] : prev.filter((x) => x !== a.id)
                              );
                            }}
                            className="accent-primary"
                          />
                          <span className="truncate font-semibold text-foreground">{a.name}</span>
                          <span className="text-muted-foreground ml-auto shrink-0">{a.shortBadge}</span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              {assets.length > 0 && (
                <div className="sm:col-span-2">
                  <label className="block font-bold text-foreground mb-1">
                    Artes / Criativos Produzidos Vinculados ({formAssetIds.length})
                  </label>
                  <div className="max-h-24 overflow-y-auto rounded-xl border border-border bg-background p-2 space-y-1">
                    {assets.map((asset) => (
                      <label key={asset.id} className="flex items-center gap-2 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formAssetIds.includes(asset.id)}
                          onChange={(e) => {
                            setFormAssetIds((prev) =>
                              e.target.checked ? [...prev, asset.id] : prev.filter((x) => x !== asset.id)
                            );
                          }}
                          className="accent-primary"
                        />
                        <span className="truncate text-foreground">{asset.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <div className="sm:col-span-2">
                <label className="block font-bold text-foreground mb-1">Aprendizados & Próxima Decisão</label>
                <textarea
                  value={formLearning}
                  onChange={(e) => setFormLearning(e.target.value)}
                  rows={2}
                  placeholder="Registre observações e limitações (não force conclusão se a amostra for insuficiente)"
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-foreground"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <button
                type="button"
                onClick={() => {
                  setModalOpen(false);
                  onClearPreselectedAd();
                }}
                className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold text-foreground hover:bg-muted transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-xs font-black uppercase text-white hover:bg-primary/90 disabled:opacity-50 transition cursor-pointer"
              >
                {saveMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Salvar Teste
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
