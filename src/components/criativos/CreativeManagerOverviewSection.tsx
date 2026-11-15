import {
  Activity,
  AlertTriangle,
  Bot,
  FlaskConical,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Layers,
  Info,
  CheckCircle2,
} from "lucide-react";
import type {
  CreativeAdRecord,
  CreativeManagerOverview,
  FatigueDiagnostic,
} from "@/lib/creativeIntelligenceDomain";

const fmtBRL = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtInt = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
};

export interface CreativeManagerOverviewSectionProps {
  overview: CreativeManagerOverview;
  records: CreativeAdRecord[];
  fatigueDiagnostics: FatigueDiagnostic[];
  testsSummary: {
    planned: number;
    running: number;
    concluded: number;
    inconclusive: number;
  };
  dateFrom: string;
  dateTo: string;
  accountLabel: string;
  onAnalyzeWithVictoria: (record: CreativeAdRecord) => void;
  onFilterBySignal: (signal: "gaining_volume" | "losing_efficiency" | "insufficient_data") => void;
  onOpenFatigueTab: () => void;
  onOpenTestsTab: () => void;
}

export function CreativeManagerOverviewSection({
  overview,
  records,
  fatigueDiagnostics,
  testsSummary,
  dateFrom,
  dateTo,
  accountLabel,
  onAnalyzeWithVictoria,
  onFilterBySignal,
  onOpenFatigueTab,
  onOpenTestsTab,
}: CreativeManagerOverviewSectionProps) {
  const topCandidateForVictoria =
    records.find((r) => r.performanceSignal === "losing_efficiency") ||
    records.find((r) => r.performanceSignal === "gaining_volume") ||
    records[0] ||
    null;

  const fatigueHighlight = fatigueDiagnostics.find((f) => f.status === "possible_fatigue") || null;

  return (
    <section className="space-y-4" aria-label="Visão do gestor">
      {/* Header informativo de recorte e unidade */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card/80 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5" /> Visão do Gestor
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="font-semibold text-foreground">{accountLabel}</span>
          <span className="text-muted-foreground font-mono text-[11px]">
            ({dateFrom.split("-").reverse().join("/")} – {dateTo.split("-").reverse().join("/")})
          </span>
          {overview.mixedObjectivesDetected && (
            <span className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
              <Info className="h-3 w-3" /> Múltiplos objetivos separados por unidade (sem soma mista)
            </span>
          )}
        </div>
        {topCandidateForVictoria && (
          <button
            type="button"
            onClick={() => onAnalyzeWithVictoria(topCandidateForVictoria)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/35 bg-primary/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-primary hover:bg-primary/20 transition cursor-pointer"
          >
            <Bot className="h-3.5 w-3.5" /> Pedir Leitura da Victoria
          </button>
        )}
      </div>

      {/* Cards de Sinais Operacionais */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="rounded-2xl border border-border bg-card p-3.5">
          <p className="text-[10px] font-mono uppercase text-muted-foreground">Anúncios no Recorte</p>
          <p className="mt-1 text-2xl font-black text-foreground">{overview.totalAds}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {overview.activeWithDeliveryCount} com entrega • {overview.noDeliveryCount} sem entrega
          </p>
          {overview.zeroSpendAttributedCount > 0 && (
            <p className="mt-1 text-[10px] font-bold text-sky-400">
              +{overview.zeroSpendAttributedCount} c/ resultado atribuído e gasto R$ 0
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => onFilterBySignal("gaining_volume")}
          className="text-left rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] hover:bg-emerald-500/10 p-3.5 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-emerald-400">
            <span>Ganhando Volume</span>
            <TrendingUp className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">{overview.gainingVolumeCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Pares competitivos na mesma conta/objetivo
          </p>
        </button>

        <button
          type="button"
          onClick={() => onFilterBySignal("losing_efficiency")}
          className="text-left rounded-2xl border border-rose-500/25 bg-rose-500/[0.06] hover:bg-rose-500/10 p-3.5 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-rose-400">
            <span>Perdendo Eficiência</span>
            <TrendingDown className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">{overview.losingEfficiencyCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Custo/resultado 35%+ acima dos pares ou sem retorno
          </p>
        </button>

        <button
          type="button"
          onClick={() => onFilterBySignal("insufficient_data")}
          className="text-left rounded-2xl border border-border bg-card hover:bg-muted/40 p-3.5 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-muted-foreground">
            <span>Dados Insuficientes</span>
            <Activity className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">{overview.insufficientDataCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Novos no período: {overview.newInPeriodCount}
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenFatigueTab}
          className="text-left rounded-2xl border border-amber-500/25 bg-amber-500/[0.06] hover:bg-amber-500/10 p-3.5 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-amber-400">
            <span>Possível Fadiga</span>
            <AlertTriangle className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">{overview.fatiguePossibleCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            Requer checagem de tendência e fatores externos
          </p>
        </button>

        <button
          type="button"
          onClick={onOpenTestsTab}
          className="text-left rounded-2xl border border-primary/25 bg-primary/[0.05] hover:bg-primary/10 p-3.5 transition cursor-pointer"
        >
          <div className="flex items-center justify-between text-[10px] font-mono uppercase text-primary">
            <span>Testes Criativos</span>
            <FlaskConical className="h-3.5 w-3.5" />
          </div>
          <p className="mt-1 text-2xl font-black text-foreground">
            {testsSummary.running + testsSummary.planned}
          </p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {testsSummary.running} ativos • {testsSummary.concluded} concl. • {testsSummary.inconclusive} inconcl.
          </p>
        </button>
      </div>

      {/* Blocos por Objetivo / Unidade Oficial (NUNCA somando conversas + compras + alcance) */}
      {overview.totalsByObjective.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {overview.totalsByObjective.map((bucket) => (
            <div
              key={bucket.category}
              className="rounded-2xl border border-border bg-card/70 p-4 flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-lg border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-black uppercase text-primary">
                  {bucket.shortBadge} • {bucket.resultLabel}
                </span>
                <span className="text-[11px] font-mono text-muted-foreground">
                  {bucket.deliveredAdCount}/{bucket.adCount} c/ entrega
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <p className="text-[10px] text-muted-foreground">Investimento</p>
                  <p className="text-sm font-black text-foreground">{fmtBRL(bucket.spend)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{bucket.resultLabel}</p>
                  <p className="text-sm font-black text-foreground">{fmtInt(bucket.results)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{bucket.costLabel}</p>
                  <p className="text-sm font-black text-foreground">
                    {bucket.weightedUnitCost !== null ? fmtBRL(bucket.weightedUnitCost) : "—"}
                  </p>
                </div>
              </div>

              {bucket.purchaseValue > 0 && (
                <div className="flex items-center justify-between border-t border-border/50 pt-2 text-[11px]">
                  <span className="text-muted-foreground">
                    Receita atribuída: <strong className="text-emerald-400">{fmtBRL(bucket.purchaseValue)}</strong>
                  </span>
                  <span className="font-mono text-foreground">
                    ROAS: {bucket.roas !== null ? `${bucket.roas.toFixed(2)}x` : "—"}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Recomendações Contextuais Read-Only */}
      {records.length > 0 && (
        <div className="rounded-2xl border border-border bg-muted/20 p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-primary/10 border border-primary/25 p-2 text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="text-xs space-y-1">
              <p className="font-black uppercase tracking-wider text-foreground">
                Recomendações Contextuais (Somente Leitura)
              </p>
              <p className="text-muted-foreground leading-relaxed">
                {fatigueHighlight ? (
                  <>
                    <strong>{fatigueHighlight.adName}</strong> apresenta sinais compatíveis com possível desgaste (
                    {fatigueHighlight.signals.slice(0, 2).join(" • ")}). Avalie variações de gancho antes de qualquer alteração manual na Meta.
                  </>
                ) : overview.losingEfficiencyCount > 0 ? (
                  <>
                    Há <strong>{overview.losingEfficiencyCount}</strong> anúncio(s) com custo por resultado acima dos pares compatíveis da mesma conta. Abra um card para análise detalhada com a Victoria.
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="inline h-3.5 w-3.5 text-emerald-400 mr-1" />
                    Nenhuma divergência crítica detectada neste recorte. Use o Planejador de Testes para estruturar próximas hipóteses de criativo.
                  </>
                )}
              </p>
            </div>
          </div>
          {topCandidateForVictoria && (
            <button
              type="button"
              onClick={() => onAnalyzeWithVictoria(topCandidateForVictoria)}
              className="shrink-0 rounded-xl border border-border bg-card hover:border-primary/40 px-3 py-2 text-[11px] font-bold text-foreground transition cursor-pointer"
            >
              Abrir diagnóstico de {topCandidateForVictoria.name.slice(0, 26)}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
