import { useMemo, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Info, Layers } from "lucide-react";
import type {
  CreativeAdRecord,
  CreativeDiversityGroup,
  CreativeFatigueStatus,
  FatigueDiagnostic,
} from "@/lib/creativeIntelligenceDomain";

const STATUS_STYLE: Record<CreativeFatigueStatus, { label: string; badge: string }> = {
  possible_fatigue: {
    label: "Possível fadiga",
    badge: "border-amber-500/35 bg-amber-500/10 text-amber-400",
  },
  insufficient_evidence: {
    label: "Evidência insuficiente",
    badge: "border-border bg-muted/50 text-muted-foreground",
  },
  not_detected: {
    label: "Sem sinal de fadiga",
    badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
};

export interface CreativeFatigueSectionProps {
  diagnostics: FatigueDiagnostic[];
  diversityGroups: CreativeDiversityGroup[];
  recordsById: Map<string, CreativeAdRecord>;
  onAnalyzeWithVictoria: (record: CreativeAdRecord, fatigue: FatigueDiagnostic) => void;
}

export function CreativeFatigueSection({
  diagnostics,
  diversityGroups,
  recordsById,
  onAnalyzeWithVictoria,
}: CreativeFatigueSectionProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | CreativeFatigueStatus>("all");

  const counts = useMemo(() => {
    return {
      possible: diagnostics.filter((d) => d.status === "possible_fatigue").length,
      insufficient: diagnostics.filter((d) => d.status === "insufficient_evidence").length,
      ok: diagnostics.filter((d) => d.status === "not_detected").length,
    };
  }, [diagnostics]);

  const filtered = useMemo(() => {
    const list =
      statusFilter === "all" ? diagnostics : diagnostics.filter((d) => d.status === statusFilter);
    // Ordena priorizando possível fadiga -> não detectada -> evidência insuficiente
    const rank: Record<CreativeFatigueStatus, number> = {
      possible_fatigue: 0,
      not_detected: 1,
      insufficient_evidence: 2,
    };
    return [...list].sort((a, b) => rank[a.status] - rank[b.status] || b.secondHalfSpend - a.secondHalfSpend);
  }, [diagnostics, statusFilter]);

  return (
    <section className="space-y-6" aria-label="Sinais de fadiga e diversidade criativa">
      {/* Concentração e Diversidade Criativa */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" /> Diversidade e Concentração de Verba por Conjunto
            </h3>
            <p className="text-xs text-muted-foreground">
              Identifica conjuntos/campanhas dependentes de apenas 1 criativo ou com baixa variação ativa.
            </p>
          </div>
          <span className="text-[11px] font-mono text-muted-foreground">
            {diversityGroups.filter((g) => g.status === "single_creative_dominant").length} grupo(s) concentrado(s)
          </span>
        </div>

        {diversityGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4">Nenhum grupo com dados no recorte atual.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {diversityGroups.slice(0, 9).map((grp) => (
              <div key={grp.groupId} className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-foreground truncate">{grp.groupName}</span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                      grp.status === "single_creative_dominant"
                        ? "border-amber-500/35 bg-amber-500/10 text-amber-400"
                        : grp.status === "low_diversity"
                          ? "border-sky-500/35 bg-sky-500/10 text-sky-400"
                          : grp.status === "balanced"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                            : "border-border bg-muted text-muted-foreground"
                    }`}
                  >
                    {grp.activeDeliveredAds}/{grp.totalAds} ativos
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground truncate">{grp.campaignName}</p>
                <p className="text-[11px] text-foreground/90 leading-snug">{grp.summary}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Diagnóstico Temporal por Anúncio */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              Diagnóstico de Tendência por Criativo (Primeira vs Segunda Metade do Recorte)
            </h3>
            <p className="text-xs text-muted-foreground">
              Compara frequência, CTR de link e custo por resultado na mesma unidade, mantendo causas alternativas explícitas.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {[
              { id: "all", label: `Todos (${diagnostics.length})` },
              { id: "possible_fatigue", label: `Possível fadiga (${counts.possible})` },
              { id: "not_detected", label: `Estáveis (${counts.ok})` },
              { id: "insufficient_evidence", label: `Insuficiente (${counts.insufficient})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id as any)}
                className={`rounded-xl border px-3 py-1.5 font-bold transition cursor-pointer ${
                  statusFilter === tab.id
                    ? "border-primary bg-primary text-white"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center text-xs text-muted-foreground">
            Nenhum anúncio nesta categoria de diagnóstico de fadiga para o filtro selecionado.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filtered.slice(0, 30).map((diag) => {
              const badge = STATUS_STYLE[diag.status];
              const record = recordsById.get(diag.adId);
              return (
                <article key={diag.adId} className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10px] font-black uppercase ${badge.badge}`}>
                        {diag.status === "possible_fatigue" ? (
                          <AlertTriangle className="h-3 w-3" />
                        ) : diag.status === "not_detected" ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <Info className="h-3 w-3" />
                        )}
                        {badge.label} • confiança {diag.confidence}
                      </span>
                      <h4 className="mt-1.5 text-sm font-black text-foreground truncate">{diag.adName}</h4>
                      <p className="text-[11px] text-muted-foreground truncate">
                        Campanha: {diag.campaignName} • {diag.activeDaysCount} dia(s) com entrega
                      </p>
                    </div>

                    {record && (
                      <button
                        type="button"
                        onClick={() => onAnalyzeWithVictoria(record, diag)}
                        className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
                      >
                        <Bot className="h-3.5 w-3.5" /> Victoria
                      </button>
                    )}
                  </div>

                  {diag.status !== "insufficient_evidence" && (
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Frequência (1ª → 2ª)</p>
                        <p className="font-bold text-foreground">
                          {diag.firstHalfFreq !== null ? `${diag.firstHalfFreq.toFixed(2)}x` : "—"} →{" "}
                          {diag.secondHalfFreq !== null ? `${diag.secondHalfFreq.toFixed(2)}x` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">CTR Link (1ª → 2ª)</p>
                        <p className="font-bold text-foreground">
                          {diag.firstHalfCtrLink !== null ? `${diag.firstHalfCtrLink.toFixed(2)}%` : "—"} →{" "}
                          {diag.secondHalfCtrLink !== null ? `${diag.secondHalfCtrLink.toFixed(2)}%` : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground truncate">{diag.costLabel} (1ª → 2ª)</p>
                        <p className="font-bold text-foreground">
                          {diag.firstHalfUnitCost !== null ? `R$ ${diag.firstHalfUnitCost.toFixed(2)}` : "—"} →{" "}
                          {diag.secondHalfUnitCost !== null ? `R$ ${diag.secondHalfUnitCost.toFixed(2)}` : "—"}
                        </p>
                      </div>
                    </div>
                  )}

                  {diag.signals.length > 0 && (
                    <ul className="space-y-1 text-xs text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-xl p-2.5">
                      {diag.signals.map((s, idx) => (
                        <li key={idx}>• {s}</li>
                      ))}
                    </ul>
                  )}

                  {diag.dataCoverageNotes.map((note, idx) => (
                    <p key={idx} className="text-[11px] text-muted-foreground">{note}</p>
                  ))}

                  <div className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 space-y-1">
                    <p className="font-bold text-foreground/90">Fatores alternativos a validar antes de pausar/alterar:</p>
                    <p>{diag.alternativeFactors.join(" • ")}</p>
                    <p className="text-primary font-semibold pt-0.5">{diag.recommendation}</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
