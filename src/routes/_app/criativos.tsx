import { useMemo, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Bot,
  FlaskConical,
  Layers,
  LayoutGrid,
  Palette,
  Store,
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { useGlobalDate } from "@/contexts/DateContext";
import { DateRangePicker } from "@/components/DateRangePicker";
import { PageHeader } from "@/components/PageHeader";
import {
  buildMetaSnapshotKey,
  DEFAULT_META_TIMEZONE,
  useActiveMetaSnapshot,
} from "@/lib/metaSnapshotCache";
import { summarizeSyncCoverage } from "@/lib/syncStatusDomain";
import { EVENT_MODEL_VERSION } from "@/lib/metricsDomain";
import {
  buildCreativeAdRecord,
  buildCreativeManagerOverview,
  enrichCreativePeerSignals,
  evaluateCreativeDiversity,
  evaluateCreativeFatigue,
  type CreativeAdRecord,
  type CreativePerformanceSignal,
  type FatigueDiagnostic,
} from "@/lib/creativeIntelligenceDomain";
import { buildContextFromCreativeItem } from "@/lib/victoriaContextGateway";
import { VictoriaFloatingChat, type ContextItem } from "@/components/victoria/VictoriaFloatingChat";
import { CreativeManagerOverviewSection } from "@/components/criativos/CreativeManagerOverviewSection";
import { CreativeLibrarySection } from "@/components/criativos/CreativeLibrarySection";
import { CreativeFatigueSection } from "@/components/criativos/CreativeFatigueSection";
import { CreativeTestsSection, type CreativeTestRow } from "@/components/criativos/CreativeTestsSection";
import {
  CreativeProductionWorkspace,
  type BrandKitRow,
  type SwipeAssetRow,
} from "@/components/criativos/CreativeProductionWorkspace";

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

export const Route = createFileRoute("/_app/criativos")({
  head: () => ({ meta: [{ title: "Criativos & Testes — NC Suite" }] }),
  beforeLoad: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      session = refreshed.session;
    }
    if (!session) throw redirect({ to: "/login" });
    if (ADMIN_EMAILS.includes(session.user.email || "")) return;
    await (supabase as any)
      .from("profiles")
      .select("role, permissions")
      .eq("id", session.user.id)
      .maybeSingle();
  },
  component: CriativosHubPage,
});

type WorkspaceTab = "inteligencia" | "fadiga" | "testes" | "producao";

function getLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function CriativosHubPage() {
  const { user } = useAuth();
  const { profile, canEdit, canViewIntegrations } = usePagePermission();
  const canEditCriativos = canEdit("criativos");

  const { dateFrom, dateTo, setDateFrom, setDateTo, accountId: globalAccountId, setAccountId: setGlobalAccountId } = useGlobalDate();
  const [accountFilter, setAccountFilterState] = useState<string>(globalAccountId || "all");
  const setAccountFilter = (next: string) => {
    setAccountFilterState(next);
    setGlobalAccountId(next || "all");
  };

  const [activeTab, setActiveTab] = useState<WorkspaceTab>("inteligencia");
  const [signalFilter, setSignalFilter] = useState<CreativePerformanceSignal | "all">("all");
  const [preselectedAdForTest, setPreselectedAdForTest] = useState<CreativeAdRecord | null>(null);
  const [seedVariationAd, setSeedVariationAd] = useState<CreativeAdRecord | null>(null);

  // Victoria contextual floating drawer state
  const [victoriaOpen, setVictoriaOpen] = useState(false);
  const [victoriaContext, setVictoriaContext] = useState<ContextItem | null>(null);

  const dateRange = useMemo(
    () => ({
      startDate: new Date(dateFrom + "T12:00:00"),
      endDate: new Date(dateTo + "T12:00:00"),
    }),
    [dateFrom, dateTo]
  );

  const setDateRange = (range: { startDate: Date; endDate: Date }) => {
    setDateFrom(getLocalDateStr(range.startDate));
    setDateTo(getLocalDateStr(range.endDate));
  };

  const activeSnapshot = useActiveMetaSnapshot({ accountId: accountFilter });

  // 1. Contas e Clientes (suporta todas as contas reconhecidas no banco)
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts", "criativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ad_accounts")
        .select("id, name, status, currency, last_sync")
        .order("name");
      if (error) throw error;
      return (data || []) as Array<{ id: string; name: string; status?: number; currency?: string; last_sync?: string | null }>;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "criativos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("clients")
        .select("id, name, meta_ad_account_id, niche, logo_url, rules")
        .order("name");
      if (error) return [];
      return (data || []) as Array<{ id: string; name: string; meta_ad_account_id?: string | null; niche?: string | null; logo_url?: string | null; rules?: any }>;
    },
  });

  const accountNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts) map.set(a.id, a.name || a.id);
    return map;
  }, [accounts]);

  // 2. Anúncios sincronizados da Meta + Métricas diárias (asset_metrics) + Estatísticas exatas de período (meta_period_stats)
  const {
    data: rawAdsBundle,
    isLoading: loadingAds,
    isFetching: fetchingAds,
    error: adsError,
  } = useQuery({
    queryKey: buildMetaSnapshotKey(
      "criativos-ads",
      {
        accountId: accountFilter,
        dateFrom,
        dateTo,
        timezone: DEFAULT_META_TIMEZONE,
        level: "ad",
        snapshotId: activeSnapshot.snapshotId,
        eventModelVersion: EVENT_MODEL_VERSION,
      },
      ["criativos-v1"]
    ),
    queryFn: async () => {
      // Paginar todos os anúncios da conta/workspace respeitando cap seguro
      const adsList: any[] = [];
      let useExtendedAdCols = true;
      const selectExtended =
        "id, name, external_id, ad_account_id, campaign_id, ad_set_id, status, delivery_status, configured_status, creative_id, creative_name, creative_title, creative_body, creative_format, creative_image_url, call_to_action_type, thumbnail_url, creative_url, created_at, campaigns(id, name, external_id, ad_account_id, objective, status, delivery_status, stop_time), ad_sets(id, name, end_time)";
      const selectLegacy =
        "id, name, external_id, ad_account_id, campaign_id, ad_set_id, status, delivery_status, configured_status, creative_id, creative_name, call_to_action_type, thumbnail_url, creative_url, created_at, campaigns(id, name, external_id, ad_account_id, objective, status, delivery_status, stop_time), ad_sets(id, name, end_time)";

      for (let from = 0; from < 10000; from += 1000) {
        let q = (supabase as any)
          .from("ads")
          .select(useExtendedAdCols ? selectExtended : selectLegacy)
          .order("name")
          .order("id")
          .range(from, from + 999);
        if (accountFilter !== "all") {
          q = q.eq("ad_account_id", accountFilter);
        }
        let { data, error } = await q;
        if (
          error &&
          useExtendedAdCols &&
          (error.code === "42703" || error.code === "PGRST204" || String(error.message || "").includes("column"))
        ) {
          useExtendedAdCols = false;
          let fallbackQ = (supabase as any)
            .from("ads")
            .select(selectLegacy)
            .order("name")
            .order("id")
            .range(from, from + 999);
          if (accountFilter !== "all") fallbackQ = fallbackQ.eq("ad_account_id", accountFilter);
          ({ data, error } = await fallbackQ);
        }
        if (error) throw error;
        adsList.push(...(data || []));
        if (!data || data.length < 1000) break;
      }

      if (adsList.length === 0) {
        return { ads: [], periodStats: [], dailyMetrics: [] };
      }

      // Buscar meta_period_stats exatos de anúncio para o período selecionado
      let pQuery = (supabase as any)
        .from("meta_period_stats")
        .select("*")
        .eq("entity_type", "ad")
        .eq("start_date", dateFrom)
        .eq("end_date", dateTo)
        .limit(5000);
      if (accountFilter !== "all") {
        pQuery = pQuery.eq("ad_account_id", accountFilter);
      }
      const { data: periodStats } = await pQuery;

      // Buscar métricas diárias estritamente por ad_id (nunca ad_set_id sem ad_id) em chunks de ad_id
      const adIds = adsList.map((a) => a.id);
      const dailyMetrics: any[] = [];
      for (let i = 0; i < adIds.length; i += 200) {
        const chunk = adIds.slice(i, i + 200);
        for (let from = 0; from < 10000; from += 1000) {
          const { data: dRows, error: dErr } = await (supabase as any)
            .from("asset_metrics")
            .select(
              "ad_id, date, cost, impressions, reach, frequency, clicks, inline_link_clicks, all_clicks, conversions, purchase_value, video_views, video_p25, video_p50, video_p75, video_p95, raw_objective, optimization_goal, result_type, result_indicator, attribution_window"
            )
            .in("ad_id", chunk)
            .gte("date", dateFrom)
            .lte("date", dateTo)
            .order("date", { ascending: true })
            .range(from, from + 999);
          if (dErr) break;
          dailyMetrics.push(...(dRows || []));
          if (!dRows || dRows.length < 1000) break;
        }
      }

      return {
        ads: adsList,
        periodStats: periodStats || [],
        dailyMetrics,
      };
    },
  });

  // 3. Testes Criativos (creative_tests), Brand Kits e Peças Produzidas (swipe_files)
  const { data: creativeTests = [] } = useQuery({
    queryKey: ["criativos-tests", accountFilter],
    queryFn: async () => {
      let q = (supabase as any).from("creative_tests").select("*").order("updated_at", { ascending: false });
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as CreativeTestRow[];
    },
  });

  const { data: brandKits = [] } = useQuery({
    queryKey: ["criativos-brand-kit"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("creative_brand_kits").select("*");
      if (error) return [];
      return (data || []) as BrandKitRow[];
    },
  });

  const { data: swipeAssets = [] } = useQuery({
    queryKey: ["swipe-files", accountFilter],
    queryFn: async () => {
      let q = (supabase as any).from("swipe_files").select("*").order("created_at", { ascending: false });
      if (accountFilter !== "all") {
        q = q.or(`ad_account_id.eq.${accountFilter},ad_account_id.is.null`);
      }
      const { data, error } = await q;
      if (error) return [];
      return (data || []) as SwipeAssetRow[];
    },
  });

  // 4. Normalização Canônica + Fadiga + Visão do Gestor
  const {
    records,
    recordsById,
    fatigueDiagnostics,
    diversityGroups,
    managerOverview,
    linkedAdTestMap,
  } = useMemo(() => {
    const ads = rawAdsBundle?.ads || [];
    const periodMap = new Map<string, any>();
    for (const ps of rawAdsBundle?.periodStats || []) {
      if (ps.entity_id) periodMap.set(String(ps.entity_id), ps);
    }
    const dailyByAd = new Map<string, any[]>();
    for (const dm of rawAdsBundle?.dailyMetrics || []) {
      if (!dm.ad_id) continue;
      const arr = dailyByAd.get(String(dm.ad_id)) || [];
      arr.push(dm);
      dailyByAd.set(String(dm.ad_id), arr);
    }

    const baseRecords = ads.map((ad: any) =>
      buildCreativeAdRecord({
        ad,
        accountName: accountNameMap.get(String(ad.ad_account_id || "")) || "Conta Meta Ads",
        dateFrom,
        dateTo,
        periodStat: periodMap.get(String(ad.id)) || null,
        dailyRows: dailyByAd.get(String(ad.id)) || [],
        isLoadingMetrics: loadingAds,
      })
    );

    const enriched = enrichCreativePeerSignals(baseRecords);
    const byId = new Map(enriched.map((r) => [r.id, r]));
    const fatigues = enriched.map((r) => evaluateCreativeFatigue(r, { dateFrom, dateTo }));
    const diversity = evaluateCreativeDiversity(enriched);
    const overview = buildCreativeManagerOverview(enriched, fatigues, diversity);

    const testLinkMap = new Map<string, string[]>();
    for (const t of creativeTests) {
      for (const aid of t.participant_ad_ids || []) {
        const list = testLinkMap.get(aid) || [];
        list.push(t.id);
        testLinkMap.set(aid, list);
      }
    }

    return {
      records: enriched,
      recordsById: byId,
      fatigueDiagnostics: fatigues,
      diversityGroups: diversity,
      managerOverview: overview,
      linkedAdTestMap: testLinkMap,
    };
  }, [rawAdsBundle, accountNameMap, dateFrom, dateTo, loadingAds, creativeTests]);

  const testsSummary = useMemo(
    () => ({
      planned: creativeTests.filter((t) => t.status === "planned").length,
      running: creativeTests.filter((t) => t.status === "running").length,
      concluded: creativeTests.filter((t) => t.status === "concluded").length,
      inconclusive: creativeTests.filter((t) => t.status === "inconclusive").length,
    }),
    [creativeTests]
  );

  const openVictoriaForAd = (record: CreativeAdRecord, fatigue?: FatigueDiagnostic | null) => {
    const matchedClient = clients.find((c) => c.meta_ad_account_id === record.adAccountId);
    const clientTargetCpl = matchedClient?.rules?.max_cpl ?? null;
    const analysisCtx = buildContextFromCreativeItem({
      record,
      fatigue: fatigue ?? fatigueDiagnostics.find((f) => f.adId === record.id) ?? null,
      sameObjectivePeers: records,
      dateFrom,
      dateTo,
      lastSyncAt: activeSnapshot.committedAt || null,
      userId: user?.id || null,
      accountMaxCplTarget: clientTargetCpl,
    });

    setVictoriaContext({
      id: record.id,
      external_id: record.externalId || undefined,
      ad_account_id: record.adAccountId,
      name: record.name,
      type: "ad",
      status: record.configuredStatus,
      delivery_status: record.effectiveStatus,
      objective: record.rawObjective || undefined,
      result_type: record.resultLabel,
      result_indicator: record.resultIndicator || record.resultLabel,
      optimization_goal: record.optimizationGoal || undefined,
      dateFrom,
      dateTo,
      lastSyncAt: activeSnapshot.committedAt || null,
      t: {
        cost: record.spend,
        conversions: record.results,
        cpl: record.unitCost ?? 0,
        ctr: record.ctrLink ?? 0,
        ctrAll: record.ctrAll ?? 0,
        impressions: record.impressions,
        reach: record.reach,
        freq: record.frequency ?? 0,
        cpm: record.cpm ?? 0,
        cpc: record.cpcLink ?? 0,
        cpcAll: record.cpcAll ?? 0,
        clicks: record.linkClicks,
        linkClicks: record.linkClicks,
        allClicks: record.allClicks,
      },
      resultDetail: {
        resultLabel: record.resultLabel,
        costLabel: record.costLabel,
        shortBadge: record.shortBadge,
      },
      analysisContext: analysisCtx,
    });
    setVictoriaOpen(true);
  };

  const accountHealthById = useMemo(() => {
    const map = new Map<string, { hasIssue: boolean; kind: string; summary: string }>();
    const coverage = activeSnapshot.latestSyncRun
      ? summarizeSyncCoverage({
          syncCoverage: activeSnapshot.latestSyncRun.sync_coverage,
          partialFailures: activeSnapshot.latestSyncRun.partial_failures,
          accounts,
        })
      : null;

    for (const acc of accounts) {
      const issue = coverage?.issues.find((i) => i.accountId === acc.id);
      if (issue) {
        map.set(acc.id, {
          hasIssue: true,
          kind: issue.kind,
          summary:
            issue.kind === "permission_denied"
              ? "Sem permissão de leitura/anúncios na Meta Ads API para esta conta."
              : "Conta com falha parcial de coleta neste ciclo.",
        });
      } else if (acc.status !== undefined && acc.status !== null && Number(acc.status) !== 1) {
        map.set(acc.id, {
          hasIssue: true,
          kind: "inactive_or_unpermitted",
          summary: "Conta desativada ou sem permissão ativa para sincronização na Meta.",
        });
      } else if (!acc.last_sync) {
        map.set(acc.id, {
          hasIssue: true,
          kind: "no_sync_yet",
          summary: "Conta sem dados sincronizados no período atual.",
        });
      }
    }
    return map;
  }, [accounts, activeSnapshot.latestSyncRun]);

  const selectedAccountLabel =
    accountFilter === "all"
      ? `Todas as Contas (${accounts.length})`
      : accountNameMap.get(accountFilter) || accountFilter;

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        eyebrow="CENTRO DE INTELIGÊNCIA CRIATIVA & PRODUÇÃO"
        title="Criativos, Performance & Testes"
        description="Conecte anúncios sincronizados da Meta, diagnósticos por objetivo oficial, detecção de fadiga, planejamento de testes e estúdio de produção com Brand Kit."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* Filtro Global de Conta + Período */}
            <div className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1.5">
              <Store className="h-3.5 w-3.5 text-primary shrink-0" />
              <select
                value={accountFilter}
                onChange={(e) => setAccountFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none max-w-[200px]"
                aria-label="Selecionar conta de anúncios"
              >
                <option value="all">Todas as Contas ({accounts.length})</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
          </div>
        }
      />

      {adsError && (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 flex items-center gap-3 text-xs text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Falha ao carregar anúncios desta conta. Verifique sua conexão e recarregue o recorte.</span>
        </div>
      )}

      {/* Navegação clara separando Inteligência/Testes vs Estúdio de Produção */}
      <nav className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "inteligencia", label: "Inteligência & Biblioteca", icon: LayoutGrid, count: records.length },
            {
              id: "fadiga",
              label: "Fadiga & Concentração",
              icon: Layers,
              badgeText: `${managerOverview.fatiguePossibleCount} fadiga • ${managerOverview.concentratedGroupsCount} conc.`,
            },
            { id: "testes", label: "Testes Criativos", icon: FlaskConical, badgeText: String(creativeTests.length) },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as WorkspaceTab)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-black uppercase transition cursor-pointer ${
                  active
                    ? "bg-primary text-white shadow"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                    active ? "bg-black/25 text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  {tab.badgeText}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setActiveTab("producao")}
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-black uppercase transition cursor-pointer ${
            activeTab === "producao"
              ? "border-primary bg-primary text-white shadow"
              : "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
          }`}
        >
          <Palette className="h-3.5 w-3.5" />
          <span>Estúdio de Produção & IA</span>
          <span className="rounded-full bg-black/20 px-1.5 py-0.2 text-[10px] font-mono">
            {swipeAssets.length}
          </span>
        </button>
      </nav>

      {/* ABA 1: VISÃO DO GESTOR + BIBLIOTECA COMPLETA */}
      {activeTab === "inteligencia" && (
        <div className="space-y-6">
          <CreativeManagerOverviewSection
            overview={managerOverview}
            records={records}
            fatigueDiagnostics={fatigueDiagnostics}
            testsSummary={testsSummary}
            dateFrom={dateFrom}
            dateTo={dateTo}
            accountLabel={selectedAccountLabel}
            onAnalyzeWithVictoria={(rec) => openVictoriaForAd(rec)}
            onFilterBySignal={(sig) => setSignalFilter((prev) => (prev === sig ? "all" : sig))}
            onOpenFatigueTab={() => setActiveTab("fadiga")}
            onOpenTestsTab={() => setActiveTab("testes")}
          />

          <CreativeLibrarySection
            records={records}
            isLoading={loadingAds}
            canEdit={canEditCriativos}
            externalSignalFilter={signalFilter}
            onExternalSignalFilterChange={setSignalFilter}
            linkedAdTestMap={linkedAdTestMap}
            onAnalyzeWithVictoria={(rec) => openVictoriaForAd(rec)}
            onCreateVariation={(rec) => {
              setSeedVariationAd(rec);
              setActiveTab("producao");
            }}
            onLinkToTest={(rec) => {
              setPreselectedAdForTest(rec);
              setActiveTab("testes");
            }}
          />
        </div>
      )}

      {/* ABA 2: FADIGA E DIVERSIDADE CRIATIVA */}
      {activeTab === "fadiga" && (
        <CreativeFatigueSection
          diagnostics={fatigueDiagnostics}
          diversityGroups={diversityGroups}
          recordsById={recordsById}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onAnalyzeWithVictoria={(rec, diag) => openVictoriaForAd(rec, diag)}
        />
      )}

      {/* ABA 3: PLANEJADOR DE TESTES CRIATIVOS */}
      {activeTab === "testes" && (
        <CreativeTestsSection
          tests={creativeTests}
          records={records}
          recordsById={recordsById}
          accounts={accounts}
          selectedAccountId={accountFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          accountHealthById={accountHealthById}
          assets={swipeAssets.map((a) => ({ id: a.id, title: a.title }))}
          canEdit={canEditCriativos}
          userId={user?.id || null}
          userName={(profile as any)?.full_name || (profile as any)?.name || user?.email || "Gestor"}
          preselectedAdForTest={preselectedAdForTest}
          onClearPreselectedAd={() => setPreselectedAdForTest(null)}
        />
      )}

      {/* ABA 4: PRODUÇÃO DE CRIATIVOS, BRAND KIT, CANVAS & ANÁLISE VISUAL */}
      {activeTab === "producao" && (
        <CreativeProductionWorkspace
          accounts={accounts}
          clients={clients}
          selectedAccountId={accountFilter}
          assets={swipeAssets}
          brandKits={brandKits}
          tests={creativeTests.map((t) => ({ id: t.id, title: t.title, ad_account_id: t.ad_account_id }))}
          records={records}
          canEdit={canEditCriativos}
          userId={user?.id || null}
          userName={(profile as any)?.full_name || (profile as any)?.name || user?.email || "Gestor"}
          seedVariationAd={seedVariationAd}
          onClearSeedVariation={() => setSeedVariationAd(null)}
        />
      )}

      {/* Victoria AI Contextual Chat Drawer (Somente Leitura) */}
      <VictoriaFloatingChat
        isOpen={victoriaOpen}
        onClose={() => setVictoriaOpen(false)}
        contextItem={victoriaContext}
        accountId={victoriaContext?.ad_account_id || accountFilter}
        accountName={
          accountNameMap.get(victoriaContext?.ad_account_id || accountFilter) ||
          selectedAccountLabel
        }
        dateFrom={dateFrom}
        dateTo={dateTo}
        lastSyncAt={activeSnapshot.committedAt || null}
      />

      {victoriaContext && !victoriaOpen && (
        <button
          type="button"
          onClick={() => setVictoriaOpen(true)}
          className="fixed bottom-5 left-5 z-40 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-card/95 backdrop-blur px-4 py-2 text-xs font-black text-primary shadow-xl hover:bg-primary/15 transition cursor-pointer"
        >
          <Bot className="h-4 w-4" /> Reabrir Victoria ({victoriaContext.name.slice(0, 20)})
        </button>
      )}
    </div>
  );
}
