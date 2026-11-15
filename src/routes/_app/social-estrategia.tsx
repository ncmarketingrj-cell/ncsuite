import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { SocialHubChrome } from "@/components/social/SocialHubChrome";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useSocialHubFilters } from "@/lib/socialHubStore";
import { useSocialAccountsQuery } from "@/hooks/useSocialHubData";
import {
  useSocialAccountStrategyQuery,
  useSocialClientsQuery,
  useUpsertSocialStrategyMutation,
} from "@/lib/socialHubService";
import {
  assertStrategyBelongsToAccount,
  buildEmptyAccountStrategy,
  evaluateStrategyReadiness,
  type SocialAccountStrategy,
} from "@/lib/socialStrategyDomain";

export const Route = createFileRoute("/_app/social-estrategia")({
  component: SocialStrategyPage,
});

function ChipListEditor({
  label,
  hint,
  items,
  placeholder,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  items: string[];
  placeholder: string;
  disabled: boolean;
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    if (!items.includes(clean)) onChange([...items, clean]);
    setDraft("");
  };
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-foreground block">{label}</label>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
      <div className="flex flex-wrap gap-1.5">
        {items.map((item, idx) => (
          <span
            key={`${item}-${idx}`}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/60 px-2.5 py-1 text-xs"
          >
            <span>{item}</span>
            {!disabled && (
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== idx))}
                className="text-muted-foreground hover:text-rose-500"
                aria-label={`Remover ${item}`}
              >
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-xs"
          />
          <button
            type="button"
            onClick={add}
            className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted inline-flex items-center gap-1"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        </div>
      )}
    </div>
  );
}

function SocialStrategyPage() {
  const { user } = useAuth();
  const { canEdit } = usePagePermission();
  const canEditSocial = canEdit("social");
  const tenantId = user?.id ?? null;

  const { selectedPage } = useSocialHubFilters();
  const accountsQuery = useSocialAccountsQuery({ tenantId });
  const accounts = accountsQuery.data?.accounts || [];
  const selectedAccount = accounts.find((a) => a.page_id === selectedPage) || null;

  const clientsQuery = useSocialClientsQuery(tenantId);
  const strategyQuery = useSocialAccountStrategyQuery({
    tenantId,
    pageId: selectedPage,
    accountName: selectedAccount?.page_name || "",
  });
  const upsertStrategy = useUpsertSocialStrategyMutation(tenantId);

  const [draft, setDraft] = useState<SocialAccountStrategy>(() =>
    buildEmptyAccountStrategy(selectedAccount)
  );

  useEffect(() => {
    if (selectedPage === "all" || !selectedAccount) {
      setDraft(buildEmptyAccountStrategy(null));
      return;
    }
    if (strategyQuery.data && assertStrategyBelongsToAccount(strategyQuery.data, selectedPage)) {
      setDraft({
        ...strategyQuery.data,
        account_name: selectedAccount.page_name,
      });
    } else {
      setDraft(buildEmptyAccountStrategy(selectedAccount));
    }
  }, [selectedPage, selectedAccount, strategyQuery.data]);

  const readiness = useMemo(() => evaluateStrategyReadiness(draft), [draft]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditSocial) {
      toast.error("Você tem permissão somente leitura em Social.");
      return;
    }
    if (selectedPage === "all" || !selectedAccount) {
      toast.error("Selecione uma conta específica antes de salvar.");
      return;
    }
    if (!draft.primary_objective.trim()) {
      toast.error("Informe ao menos o objetivo principal da conta.");
      return;
    }
    const invalidCompetitor = draft.competitors.find(
      (c) => !c.name.trim() || !c.source.trim() || !c.observedAt.trim()
    );
    if (invalidCompetitor) {
      toast.error("Todo concorrente/referência precisa de nome, origem e data.");
      return;
    }

    try {
      await upsertStrategy.mutateAsync({
        ...draft,
        page_id: selectedPage,
        account_name: selectedAccount.page_name,
      });
      toast.success(`Estratégia salva para ${selectedAccount.page_name}.`);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao salvar estratégia.");
    }
  };

  const applyCleanTemplate = () => {
    if (!selectedAccount || !canEditSocial) return;
    setDraft((prev) => ({
      ...prev,
      primary_objective:
        prev.primary_objective ||
        (prev.is_automotive
          ? "Gerar conversas qualificadas no WhatsApp/Direct a partir do estoque confirmado."
          : "Fortalecer autoridade local e gerar pedidos de orçamento/atendimento."),
      editorial_pillars:
        prev.editorial_pillars.length > 0
          ? prev.editorial_pillars
          : prev.is_automotive
            ? ["Destaques confirmados de estoque", "Critérios de compra e revisão", "Prova social e entregas reais", "Bastidores da loja"]
            : ["Educação do público", "Prova social e resultados reais", "Oferta/Serviço confirmado", "Bastidores e posicionamento"],
      tone_of_voice: prev.tone_of_voice || "Claro, direto, consultivo e próximo da linguagem local.",
    }));
    toast.info("Estrutura inicial aplicada sem inventar ofertas comerciais. Preencha e salve.");
  };

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <PageHeader
        eyebrow="Social Hub"
        title="Estratégia da Conta"
        description="Posicionamento, público, pilares, ofertas confirmadas, restrições e referências isoladas por cliente."
      />

      <SocialHubChrome
        tenantId={tenantId}
        requireExplicitAccount="strategy"
      />

      {selectedPage !== "all" && selectedAccount && (
        <form onSubmit={handleSave} className="space-y-5">
          {/* Painel de Prontidão & Proteção */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-black">{selectedAccount.page_name}</h2>
                <span className="rounded-lg bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary">
                  Completude: {readiness.completionPercent}%
                </span>
                {readiness.isReadyForAi ? (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Pronta para guiar IA & pautas
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-lg bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" /> Preencha objetivo e pilares
                  </span>
                )}
              </div>
              {readiness.validationWarnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 dark:text-amber-400">
                  • {w}
                </p>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canEditSocial && (
                <>
                  <button
                    type="button"
                    onClick={applyCleanTemplate}
                    className="h-9 rounded-xl border border-border bg-background px-3 text-xs font-semibold hover:bg-muted inline-flex items-center gap-1.5"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Estrutura base
                  </button>
                  <button
                    type="submit"
                    disabled={upsertStrategy.isPending}
                    className="h-9 rounded-xl bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-1.5 disabled:opacity-60"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {upsertStrategy.isPending ? "Salvando..." : "Salvar estratégia"}
                  </button>
                </>
              )}
            </div>
          </section>

          {/* Identidade & Objetivo */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold block mb-1">Cliente vinculado no CRM/Hub</label>
                  <select
                    disabled={!canEditSocial}
                    value={draft.client_id || ""}
                    onChange={(e) => setDraft({ ...draft, client_id: e.target.value || null })}
                    className="w-full h-9 rounded-xl border border-border bg-background px-2.5 text-xs"
                  >
                    <option value="">Sem vínculo específico</option>
                    {(clientsQuery.data || []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={!canEditSocial}
                      checked={draft.is_automotive}
                      onChange={(e) => setDraft({ ...draft, is_automotive: e.target.checked })}
                      className="rounded border-border"
                    />
                    Conta automotiva (trava rígida de preço/km/estoque)
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Objetivo principal *</label>
                <textarea
                  rows={2}
                  disabled={!canEditSocial}
                  value={draft.primary_objective}
                  onChange={(e) => setDraft({ ...draft, primary_objective: e.target.value })}
                  placeholder="Ex.: Gerar contatos qualificados no WhatsApp sem depender de promessa irreal."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                  required
                />
              </div>

              <ChipListEditor
                label="Objetivos secundários"
                items={draft.secondary_objectives}
                placeholder="Ex.: Retenção em Reels, salvamentos, visitas ao perfil..."
                disabled={!canEditSocial}
                onChange={(next) => setDraft({ ...draft, secondary_objectives: next })}
              />

              <div>
                <label className="text-xs font-bold block mb-1">Público prioritário</label>
                <textarea
                  rows={2}
                  disabled={!canEditSocial}
                  value={draft.target_audience}
                  onChange={(e) => setDraft({ ...draft, target_audience: e.target.value })}
                  placeholder="Quem esta conta precisa atrair prioritariamente na região/nicho."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <ChipListEditor
                label="Segmentos relevantes"
                items={draft.audience_segments}
                placeholder="Ex.: Primeiro carro, troca com usado, família..."
                disabled={!canEditSocial}
                onChange={(next) => setDraft({ ...draft, audience_segments: next })}
              />
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold block mb-1">Posicionamento da marca</label>
                <textarea
                  rows={2}
                  disabled={!canEditSocial}
                  value={draft.positioning}
                  onChange={(e) => setDraft({ ...draft, positioning: e.target.value })}
                  placeholder="Como a marca quer ser percebida no mercado local."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <ChipListEditor
                label="Diferenciais reais"
                items={draft.differentials}
                placeholder="Ex.: Atendimento consultivo, vistoria cautelar..."
                disabled={!canEditSocial}
                onChange={(next) => setDraft({ ...draft, differentials: next })}
              />

              <div>
                <label className="text-xs font-bold block mb-1">Tom de voz</label>
                <input
                  type="text"
                  disabled={!canEditSocial}
                  value={draft.tone_of_voice}
                  onChange={(e) => setDraft({ ...draft, tone_of_voice: e.target.value })}
                  placeholder="Ex.: Direto, transparente, sem jargões exagerados"
                  className="w-full h-9 rounded-xl border border-border bg-background px-3 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Diretrizes de linguagem</label>
                <textarea
                  rows={2}
                  disabled={!canEditSocial}
                  value={draft.language_guidelines}
                  onChange={(e) => setDraft({ ...draft, language_guidelines: e.target.value })}
                  placeholder="Palavras preferidas, gírias permitidas ou termos a evitar."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>
            </div>
          </section>

          {/* Pilares, Ofertas Confirmadas e Restrições */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-4">
              <ChipListEditor
                label="Pilares editoriais e temas permitidos *"
                hint="A Visão Geral e o gerador de pautas verificam a cobertura destes pilares."
                items={draft.editorial_pillars}
                placeholder="Ex.: Prova social, Bastidores, Educação..."
                disabled={!canEditSocial}
                onChange={(next) => setDraft({ ...draft, editorial_pillars: next })}
              />

              <ChipListEditor
                label="Ofertas, serviços, produtos e provas confirmadas"
                hint="A IA só pode citar ofertas comerciais que estejam explicitamente confirmadas aqui."
                items={draft.confirmed_offers}
                placeholder="Ex.: Avaliação presencial gratuita na loja mediante agendamento"
                disabled={!canEditSocial}
                onChange={(next) => setDraft({ ...draft, confirmed_offers: next })}
              />
            </div>

            <div className="space-y-3">
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 space-y-2">
                <label className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4" /> Fatos que NÃO podem ser inventados / Proibições
                </label>
                <textarea
                  rows={3}
                  disabled={!canEditSocial}
                  value={draft.forbidden_claims}
                  onChange={(e) => setDraft({ ...draft, forbidden_claims: e.target.value })}
                  placeholder="Ex.: Não informar preços sem tabela confirmada do dia."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>

              <div>
                <label className="text-xs font-bold block mb-1">Restrições operacionais ou legais</label>
                <textarea
                  rows={2}
                  disabled={!canEditSocial}
                  value={draft.restrictions}
                  onChange={(e) => setDraft({ ...draft, restrictions: e.target.value })}
                  placeholder="Restrições jurídicas, de imagem ou aprovação prévia obrigatória."
                  className="w-full rounded-xl border border-border bg-background p-2.5 text-xs"
                />
              </div>
            </div>
          </section>

          {/* CTAs, Concorrentes Manuais & Sazonalidades */}
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
            {/* CTAs por objetivo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold">Chamadas para ação (CTA) por objetivo</label>
                {canEditSocial && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        ctas_by_objective: [...draft.ctas_by_objective, { objective: "", cta: "" }],
                      })
                    }
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar CTA
                  </button>
                )}
              </div>
              {draft.ctas_by_objective.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum CTA específico cadastrado.</p>
              )}
              <div className="space-y-2">
                {draft.ctas_by_objective.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <input
                      type="text"
                      disabled={!canEditSocial}
                      value={row.objective}
                      onChange={(e) => {
                        const next = [...draft.ctas_by_objective];
                        next[idx] = { ...next[idx], objective: e.target.value };
                        setDraft({ ...draft, ctas_by_objective: next });
                      }}
                      placeholder="Objetivo (ex.: Conversa WhatsApp)"
                      className="sm:col-span-4 h-9 rounded-xl border border-border bg-background px-3 text-xs"
                    />
                    <input
                      type="text"
                      disabled={!canEditSocial}
                      value={row.cta}
                      onChange={(e) => {
                        const next = [...draft.ctas_by_objective];
                        next[idx] = { ...next[idx], cta: e.target.value };
                        setDraft({ ...draft, ctas_by_objective: next });
                      }}
                      placeholder="Texto do CTA aprovado"
                      className="sm:col-span-7 h-9 rounded-xl border border-border bg-background px-3 text-xs"
                    />
                    {canEditSocial && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            ctas_by_objective: draft.ctas_by_objective.filter((_, i) => i !== idx),
                          })
                        }
                        className="sm:col-span-1 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Concorrentes incluídos manualmente (origem + data) */}
            <div className="space-y-2 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold block">Concorrentes e referências manuais</label>
                  <p className="text-[11px] text-muted-foreground">
                    Exige origem e data da observação para evitar referências sem contexto.
                  </p>
                </div>
                {canEditSocial && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        competitors: [
                          ...draft.competitors,
                          {
                            name: "",
                            handleOrUrl: "",
                            source: "Observação manual Instagram",
                            observedAt: new Date().toISOString().slice(0, 10),
                            notes: "",
                          },
                        ],
                      })
                    }
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar referência
                  </button>
                )}
              </div>
              {draft.competitors.map((comp, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-2 rounded-xl border border-border/70 p-2.5 bg-background/50">
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={comp.name}
                    onChange={(e) => {
                      const next = [...draft.competitors];
                      next[idx] = { ...next[idx], name: e.target.value };
                      setDraft({ ...draft, competitors: next });
                    }}
                    placeholder="Nome *"
                    className="md:col-span-3 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                  />
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={comp.handleOrUrl}
                    onChange={(e) => {
                      const next = [...draft.competitors];
                      next[idx] = { ...next[idx], handleOrUrl: e.target.value };
                      setDraft({ ...draft, competitors: next });
                    }}
                    placeholder="@perfil ou URL"
                    className="md:col-span-2 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                  />
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={comp.source}
                    onChange={(e) => {
                      const next = [...draft.competitors];
                      next[idx] = { ...next[idx], source: e.target.value };
                      setDraft({ ...draft, competitors: next });
                    }}
                    placeholder="Origem *"
                    className="md:col-span-3 h-8 rounded-lg border border-border bg-background px-2.5 text-xs"
                  />
                  <input
                    type="date"
                    disabled={!canEditSocial}
                    value={comp.observedAt}
                    onChange={(e) => {
                      const next = [...draft.competitors];
                      next[idx] = { ...next[idx], observedAt: e.target.value };
                      setDraft({ ...draft, competitors: next });
                    }}
                    className="md:col-span-2 h-8 rounded-lg border border-border bg-background px-2 text-xs"
                  />
                  <div className="md:col-span-2 flex gap-1.5">
                    <input
                      type="text"
                      disabled={!canEditSocial}
                      value={comp.notes}
                      onChange={(e) => {
                        const next = [...draft.competitors];
                        next[idx] = { ...next[idx], notes: e.target.value };
                        setDraft({ ...draft, competitors: next });
                      }}
                      placeholder="Nota"
                      className="flex-1 min-w-0 h-8 rounded-lg border border-border bg-background px-2 text-xs"
                    />
                    {canEditSocial && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            competitors: draft.competitors.filter((_, i) => i !== idx),
                          })
                        }
                        className="h-8 w-8 shrink-0 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-rose-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Sazonalidades e datas importantes */}
            <div className="space-y-2 border-t border-border/70 pt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" /> Sazonalidades, eventos locais e datas importantes
                </label>
                {canEditSocial && (
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        seasonality: [
                          ...draft.seasonality,
                          { title: "", dateLabel: "", objective: "", notes: "" },
                        ],
                      })
                    }
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar data
                  </button>
                )}
              </div>
              {draft.seasonality.map((saz, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={saz.title}
                    onChange={(e) => {
                      const next = [...draft.seasonality];
                      next[idx] = { ...next[idx], title: e.target.value };
                      setDraft({ ...draft, seasonality: next });
                    }}
                    placeholder="Evento / Campanha"
                    className="sm:col-span-4 h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  />
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={saz.dateLabel}
                    onChange={(e) => {
                      const next = [...draft.seasonality];
                      next[idx] = { ...next[idx], dateLabel: e.target.value };
                      setDraft({ ...draft, seasonality: next });
                    }}
                    placeholder="Período (ex.: 20-30 Nov)"
                    className="sm:col-span-3 h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  />
                  <input
                    type="text"
                    disabled={!canEditSocial}
                    value={saz.notes}
                    onChange={(e) => {
                      const next = [...draft.seasonality];
                      next[idx] = { ...next[idx], notes: e.target.value };
                      setDraft({ ...draft, seasonality: next });
                    }}
                    placeholder="Ângulo recomendado"
                    className="sm:col-span-4 h-9 rounded-xl border border-border bg-background px-3 text-xs"
                  />
                  {canEditSocial && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          seasonality: draft.seasonality.filter((_, i) => i !== idx),
                        })
                      }
                      className="sm:col-span-1 h-9 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-rose-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
