import { useMemo, useState } from "react";
import {
  Bot,
  ExternalLink,
  FlaskConical,
  GitCompare,
  ImageOff,
  LayoutGrid,
  List as ListIcon,
  Palette,
  Search,
  Sparkles,
  Video,
} from "lucide-react";
import type {
  AdSituationFilter,
  AdStatusCountsSummary,
  CreativeAdRecord,
  CreativePerformanceSignal,
} from "@/lib/creativeIntelligenceDomain";

const fmtBRL = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const fmtInt = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString("pt-BR");
};

const fmtPct = (v: number | null | undefined) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}%`;
};

const SIGNAL_BADGES: Record<CreativePerformanceSignal, { label: string; cls: string }> = {
  gaining_volume: {
    label: "Ganhando volume",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  losing_efficiency: {
    label: "Perdendo eficiência",
    cls: "border-rose-500/30 bg-rose-500/10 text-rose-400",
  },
  stable: {
    label: "Estável",
    cls: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },
  insufficient_data: {
    label: "Dados insuficientes",
    cls: "border-border bg-muted/50 text-muted-foreground",
  },
  no_delivery: {
    label: "Sem entrega",
    cls: "border-border bg-muted/30 text-muted-foreground/80",
  },
};

export interface CreativeLibrarySectionProps {
  records: CreativeAdRecord[];
  isLoading: boolean;
  canEdit: boolean;
  statusFilter: AdSituationFilter;
  onStatusFilterChange: (val: AdSituationFilter) => void;
  statusCounts?: AdStatusCountsSummary;
  externalSignalFilter: CreativePerformanceSignal | "all";
  onExternalSignalFilterChange: (val: CreativePerformanceSignal | "all") => void;
  linkedAdTestMap: Map<string, string[]>;
  onAnalyzeWithVictoria: (record: CreativeAdRecord) => void;
  onCompareWithCandidate?: (record: CreativeAdRecord) => void;
  onCreateVariation: (record: CreativeAdRecord) => void;
  onLinkToTest: (record: CreativeAdRecord) => void;
}

export function CreativeLibrarySection({
  records,
  isLoading,
  canEdit,
  statusFilter,
  onStatusFilterChange,
  statusCounts,
  externalSignalFilter,
  onExternalSignalFilterChange,
  linkedAdTestMap,
  onAnalyzeWithVictoria,
  onCompareWithCandidate,
  onCreateVariation,
  onLinkToTest,
}: CreativeLibrarySectionProps) {
  const [viewMode, setViewMode] = useState<"cards" | "list">("cards");
  const [searchQuery, setSearchQuery] = useState("");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [adSetFilter, setAdSetFilter] = useState<string>("all");
  const [objectiveFilter, setObjectiveFilter] = useState<string>("all");
  const [deliveryOnly, setDeliveryOnly] = useState<boolean>(false);
  const [visibleLimit, setVisibleLimit] = useState<number>(36);

  const campaignsList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (r.campaignId) map.set(r.campaignId, r.campaignName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [records]);

  const adSetsList = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      if (campaignFilter !== "all" && r.campaignId !== campaignFilter) continue;
      if (r.adSetId) map.set(r.adSetId, r.adSetName);
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [records, campaignFilter]);

  const objectiveCategories = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of records) {
      map.set(r.resultCategory, `${r.shortBadge} (${r.resultLabel})`);
    }
    return Array.from(map.entries());
  }, [records]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return records.filter((r) => {
      if (campaignFilter !== "all" && r.campaignId !== campaignFilter) return false;
      if (adSetFilter !== "all" && r.adSetId !== adSetFilter) return false;
      if (objectiveFilter !== "all" && r.resultCategory !== objectiveFilter) return false;
      if (externalSignalFilter !== "all" && r.performanceSignal !== externalSignalFilter) return false;
      if (statusFilter !== "ALL" && r.effectiveStatus !== statusFilter) return false;
      if (deliveryOnly && r.periodDeliveryState !== "with_delivery") return false;
      if (q) {
        const hay = `${r.name} ${r.externalId || ""} ${r.campaignName} ${r.adSetName} ${r.accountName} ${r.creativeName || ""} ${r.creativeTitle || ""} ${r.creativeBody || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    records,
    searchQuery,
    campaignFilter,
    adSetFilter,
    objectiveFilter,
    externalSignalFilter,
    statusFilter,
    deliveryOnly,
  ]);

  const visibleItems = filtered.slice(0, visibleLimit);

  return (
    <section className="space-y-4" aria-label="Biblioteca de criativos e anúncios">
      {/* Barra de Filtros */}
      <div className="rounded-2xl border border-border bg-card p-3.5 space-y-3">
        <div className="flex flex-col lg:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setVisibleLimit(36);
              }}
              placeholder="Buscar por nome do anúncio, Ad ID, texto do criativo, campanha ou conta..."
              className="w-full rounded-xl border border-border bg-background pl-9 pr-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={campaignFilter}
              onChange={(e) => {
                setCampaignFilter(e.target.value);
                setAdSetFilter("all");
              }}
              className="rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none max-w-[200px]"
              aria-label="Filtrar por campanha"
            >
              <option value="all">Todas campanhas ({campaignsList.length})</option>
              {campaignsList.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            <select
              value={adSetFilter}
              onChange={(e) => setAdSetFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none max-w-[180px]"
              aria-label="Filtrar por conjunto"
            >
              <option value="all">Todos conjuntos ({adSetsList.length})</option>
              {adSetsList.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>

            <select
              value={objectiveFilter}
              onChange={(e) => setObjectiveFilter(e.target.value)}
              className="rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              aria-label="Filtrar por objetivo"
            >
              <option value="all">Todos objetivos</option>
              {objectiveCategories.map(([cat, label]) => (
                <option key={cat} value={cat}>{label}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => onStatusFilterChange(e.target.value as AdSituationFilter)}
              className="rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              aria-label="Filtrar por status na Meta"
            >
              <option value="ACTIVE">
                Ativos{statusCounts ? ` (${statusCounts.ACTIVE})` : ""}
              </option>
              <option value="PAUSED">
                Pausados{statusCounts ? ` (${statusCounts.PAUSED})` : ""}
              </option>
              <option value="COMPLETED">
                Concluídos{statusCounts ? ` (${statusCounts.COMPLETED})` : ""}
              </option>
              <option value="ARCHIVED">
                Arquivados{statusCounts ? ` (${statusCounts.ARCHIVED})` : ""}
              </option>
              <option value="ALL">
                Todos{statusCounts ? ` (${statusCounts.all})` : ""}
              </option>
            </select>

            <select
              value={externalSignalFilter}
              onChange={(e) => onExternalSignalFilterChange(e.target.value as any)}
              className="rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
              aria-label="Filtrar por sinal de desempenho"
            >
              <option value="all">Todos sinais</option>
              <option value="gaining_volume">Ganhando volume</option>
              <option value="losing_efficiency">Perdendo eficiência</option>
              <option value="stable">Estável</option>
              <option value="insufficient_data">Dados insuficientes</option>
              <option value="no_delivery">Sem entrega</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
              <input
                type="checkbox"
                checked={deliveryOnly}
                onChange={(e) => setDeliveryOnly(e.target.checked)}
                className="rounded border-border accent-primary"
              />
              Ocultar itens sem entrega
            </label>
            <span className="font-mono text-[11px] text-muted-foreground">
              Exibindo <strong className="text-foreground">{visibleItems.length}</strong> de {filtered.length} anúncios
            </span>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                viewMode === "cards" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition cursor-pointer ${
                viewMode === "list" ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListIcon className="h-3.5 w-3.5" /> Lista
            </button>
          </div>
        </div>
      </div>

      {/* Estado de carregamento / vazio */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-72 rounded-2xl border border-border bg-card/60 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 py-14 px-6 text-center space-y-2">
          <Sparkles className="h-8 w-8 mx-auto text-muted-foreground/40" />
          <p className="text-sm font-bold text-foreground">Nenhum anúncio encontrado neste recorte</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Ajuste os filtros de campanha, objetivo, status ou período acima para visualizar criativos desta conta.
          </p>
        </div>
      ) : viewMode === "cards" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleItems.map((ad) => {
            const sig = SIGNAL_BADGES[ad.performanceSignal];
            const linkedTests = linkedAdTestMap.get(ad.id) || [];
            return (
              <article
                key={ad.id}
                className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col justify-between hover:border-primary/35 transition"
              >
                <div>
                  {/* Prévia real somente quando sincronizada */}
                  <div className="relative h-44 bg-muted/40 border-b border-border flex items-center justify-center overflow-hidden">
                    {ad.hasRealThumbnail && ad.thumbnailUrl ? (
                      <img
                        src={ad.thumbnailUrl}
                        alt={ad.name}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center gap-1.5 px-4 text-center text-muted-foreground">
                        <ImageOff className="h-6 w-6 opacity-50" />
                        <span className="text-[11px] font-semibold">Prévia visual não sincronizada na Meta</span>
                        <span className="text-[10px] font-mono opacity-75">
                          {ad.creativeFormat || ad.shortBadge}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5">
                      <span className="rounded-lg bg-black/75 backdrop-blur px-2 py-0.5 text-[10px] font-black uppercase text-white">
                        {ad.shortBadge}
                      </span>
                      <span className={`rounded-lg border px-2 py-0.5 text-[10px] font-bold backdrop-blur ${sig.cls}`}>
                        {sig.label}
                      </span>
                    </div>

                    {ad.isNewInPeriod && (
                      <span className="absolute bottom-2.5 left-2.5 rounded-md bg-sky-500/90 px-2 py-0.5 text-[9px] font-black uppercase text-white">
                        Novo no período
                      </span>
                    )}
                    {ad.videoMetrics && (
                      <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                        <Video className="h-3 w-3" /> {fmtInt(ad.videoMetrics.views)} views
                      </span>
                    )}
                  </div>

                  {/* Identificação e Metadados */}
                  <div className="p-4 space-y-2.5">
                    <div>
                      <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-muted-foreground">
                        <span className="truncate font-bold text-foreground/80">{ad.accountName}</span>
                        <span className="truncate">
                          Status Meta: {ad.deliveryLabel} · {ad.periodDeliveryLabel}
                        </span>
                      </div>
                      <h3 className="mt-0.5 text-sm font-black text-foreground leading-snug line-clamp-2">
                        {ad.name}
                      </h3>
                      <p className="text-[11px] text-muted-foreground truncate">
                        Campanha: {ad.campaignName} • Conj: {ad.adSetName}
                      </p>
                      <p className="text-[10px] text-muted-foreground/80 truncate">
                        Janela: {ad.attributionWindow}
                        {ad.optimizationGoal ? ` • Opt: ${ad.optimizationGoal}` : ""}
                        {ad.metaStatusReason ? ` • ${ad.metaStatusReason}` : ""}
                      </p>
                      {ad.effectiveStatus === "ACTIVE" && ad.periodDeliveryState === "no_delivery" && (
                        <p className="mt-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                          Ativo na Meta sem entrega no período selecionado.
                        </p>
                      )}
                      {linkedTests.length > 0 && (
                        <p className="mt-1 inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                          <FlaskConical className="h-3 w-3" /> Em {linkedTests.length} teste(s)
                        </p>
                      )}
                    </div>

                    {ad.availability === "zero_spend_attributed_result" && (
                      <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-300">
                        Resultado atribuído pela Meta no recorte com gasto R$ 0,00 (custo por resultado: —).
                      </div>
                    )}
                    {ad.availability === "unavailable" && (
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-300">
                        {ad.availabilityNote}
                      </div>
                    )}

                    {/* Grade de Métricas Oficiais */}
                    <div className="grid grid-cols-3 gap-2 rounded-xl border border-border/70 bg-muted/20 p-2.5 text-xs">
                      <div>
                        <p className="text-[10px] text-muted-foreground">Gasto</p>
                        <p className="font-black text-foreground">{fmtBRL(ad.spend)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground truncate" title={ad.resultLabel}>
                          {ad.resultLabel}
                        </p>
                        <p className="font-black text-foreground">{fmtInt(ad.results)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground truncate" title={ad.costLabel}>
                          {ad.costLabel}
                        </p>
                        <p className="font-black text-foreground">
                          {ad.unitCost !== null ? fmtBRL(ad.unitCost) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Impressões</p>
                        <p className="font-bold text-foreground">{fmtInt(ad.impressions)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">Alcance / Freq</p>
                        <p className="font-bold text-foreground">
                          {fmtInt(ad.reach)} {ad.frequency !== null ? `(${ad.frequency.toFixed(2)}x)` : ""}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">CTR Link / Todos</p>
                        <p className="font-bold text-foreground">
                          {fmtPct(ad.ctrLink)} <span className="text-[10px] text-muted-foreground">/ {fmtPct(ad.ctrAll)}</span>
                        </p>
                      </div>
                    </div>

                    {ad.purchaseValue !== null && ad.purchaseValue > 0 && (
                      <div className="flex items-center justify-between text-[11px] px-1">
                        <span className="text-muted-foreground">Valor de compra:</span>
                        <span className="font-black text-emerald-400">
                          {fmtBRL(ad.purchaseValue)} {ad.roas !== null ? `• ROAS ${ad.roas.toFixed(2)}x` : ""}
                        </span>
                      </div>
                    )}

                    {(ad.creativeTitle || ad.creativeBody) && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 border-l-2 border-primary/30 pl-2">
                        {ad.creativeTitle ? <strong>{ad.creativeTitle}: </strong> : null}
                        {ad.creativeBody}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ações do Card */}
                <div className="border-t border-border/70 bg-muted/15 px-3 py-2.5 flex flex-wrap items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => onAnalyzeWithVictoria(ad)}
                    className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/20 transition cursor-pointer"
                  >
                    <Bot className="h-3.5 w-3.5" /> Victoria
                  </button>

                  <div className="flex items-center gap-1.5">
                    {onCompareWithCandidate && ad.effectiveStatus === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => onCompareWithCandidate(ad)}
                        className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2 py-1 text-[11px] font-bold text-sky-300 hover:bg-sky-500/20 transition cursor-pointer"
                        title="Comparar este anúncio ativo com uma peça nova no Comparador"
                      >
                        <GitCompare className="h-3 w-3" /> Comparar
                      </button>
                    )}
                    {canEdit && (
                      <>
                        <button
                          type="button"
                          onClick={() => onLinkToTest(ad)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:border-primary/40 transition cursor-pointer"
                          title="Vincular este anúncio a um teste criativo"
                        >
                          <FlaskConical className="h-3 w-3" /> Teste
                        </button>
                        <button
                          type="button"
                          onClick={() => onCreateVariation(ad)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-foreground hover:border-primary/40 transition cursor-pointer"
                          title="Criar variação na Produção de Criativos"
                        >
                          <Palette className="h-3 w-3" /> Variar
                        </button>
                      </>
                    )}
                    {ad.adsManagerUrl && (
                      <a
                        href={ad.adsManagerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground transition"
                        title="Abrir anúncio no Gerenciador de Anúncios da Meta"
                      >
                        <ExternalLink className="h-3 w-3" /> Meta
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted/30 text-[10px] font-mono uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Anúncio / Campanha</th>
                <th className="p-3">Objetivo</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Gasto</th>
                <th className="p-3 text-right">Impr.</th>
                <th className="p-3 text-right">Alcance</th>
                <th className="p-3 text-right">Freq.</th>
                <th className="p-3 text-right">Resultados</th>
                <th className="p-3 text-right">Custo/Unid.</th>
                <th className="p-3 text-right">CTR Link</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visibleItems.map((ad) => {
                const sig = SIGNAL_BADGES[ad.performanceSignal];
                return (
                  <tr key={ad.id} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 max-w-[260px]">
                      <div className="flex items-center gap-2.5">
                        {ad.hasRealThumbnail && ad.thumbnailUrl ? (
                          <img src={ad.thumbnailUrl} alt={ad.name} className="h-10 w-10 rounded-lg object-cover shrink-0 border border-border" />
                        ) : (
                          <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0 border border-border text-muted-foreground">
                            <ImageOff className="h-4 w-4 opacity-50" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-foreground truncate">{ad.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {ad.accountName} • {ad.campaignName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        {ad.shortBadge}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`inline-block rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${sig.cls}`}>
                        {sig.label}
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold">{fmtBRL(ad.spend)}</td>
                    <td className="p-3 text-right">{fmtInt(ad.impressions)}</td>
                    <td className="p-3 text-right">{fmtInt(ad.reach)}</td>
                    <td className="p-3 text-right">{ad.frequency !== null ? `${ad.frequency.toFixed(2)}x` : "—"}</td>
                    <td className="p-3 text-right font-bold">
                      {fmtInt(ad.results)} <span className="text-[10px] font-normal text-muted-foreground">{ad.shortBadge}</span>
                    </td>
                    <td className="p-3 text-right font-bold">{ad.unitCost !== null ? fmtBRL(ad.unitCost) : "—"}</td>
                    <td className="p-3 text-right">{fmtPct(ad.ctrLink)}</td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onAnalyzeWithVictoria(ad)}
                        className="inline-flex items-center gap-1 rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/20 mr-1 cursor-pointer"
                      >
                        <Bot className="h-3 w-3" /> Victoria
                      </button>
                      {ad.adsManagerUrl && (
                        <a
                          href={ad.adsManagerUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center rounded-lg border border-border bg-card p-1 text-muted-foreground hover:text-foreground"
                          title="Abrir no Meta Ads Manager"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length > visibleLimit && (
        <div className="flex justify-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleLimit((n) => n + 36)}
            className="rounded-xl border border-border bg-card px-5 py-2 text-xs font-bold text-foreground hover:border-primary/40 transition cursor-pointer"
          >
            Carregar mais ({filtered.length - visibleLimit} restantes)
          </button>
        </div>
      )}
    </section>
  );
}
