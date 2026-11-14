import { createFileRoute, redirect } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { useGlobalDate } from "@/contexts/DateContext";
import { DateRangePicker } from "@/components/DateRangePicker";
import { PageHeader } from "@/components/PageHeader";
import { VictoriaFloatingChat, type ContextItem } from "@/components/victoria/VictoriaFloatingChat";
import {
  calibrateCampaignMetricsArray,
  ensureDatabaseCalibrated,
  detectConversionCategory,
} from "@/lib/metaConversionCalibrator";
import { classifyMetaEvent, computeCvr, computeUnitCost, EVENT_MODEL_VERSION } from "@/lib/metricsDomain";
import { buildMetaSnapshotKey, DEFAULT_META_TIMEZONE, useActiveMetaSnapshot } from "@/lib/metaSnapshotCache";
import { SnapshotStatusBadge } from "@/components/SnapshotStatusBadge";
import {
  SIM_OBJECTIVES,
  DIDACTIC_SIMULATION_PRESETS,
  simulateMetaAdsImpact,
  type SimObjectiveId,
  type BidStrategyId,
  type BudgetStructureId,
  type CreativeDiversityLevel,
  type BaselineMetrics,
  type SimulationParams,
  type SimulationResult,
  type DidacticPreset,
} from "@/lib/metaAlgorithmEngine";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ComposedChart,
  Area,
  Line,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  Zap,
  Target,
  DollarSign,
  Users,
  BarChart3,
  Bookmark,
  Trash2,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Brain,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Info,
  Sliders,
  Calculator,
  Eye,
  EyeOff,
  Layers,
  Cpu,
  Activity,
  Bot,
  HelpCircle,
  Play,
  Filter,
  Lock,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

// ─── ROUTE ──────────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/_app/simulador")({
  head: () => ({ meta: [{ title: "Simulador Algorítmico Meta Ads — NC Suite" }] }),
  beforeLoad: async () => {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const { data: r } = await supabase.auth.refreshSession();
      session = r.session;
    }
    if (!session) throw redirect({ to: "/login" });
  },
  component: SimuladorPage,
});

const getLocalDateStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ─── ANIMATED VALUE HOOK ─────────────────────────────────────────────────────────
function useAnimVal(target: number) {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (Math.abs(diff) < 0.001) {
      setVal(target);
      return;
    }
    let frame = 0;
    const total = 18;
    const id = setInterval(() => {
      frame++;
      const ease = 1 - Math.pow(1 - frame / total, 3);
      setVal(start + diff * ease);
      if (frame >= total) {
        setVal(target);
        prev.current = target;
        clearInterval(id);
      }
    }, 16);
    return () => clearInterval(id);
  }, [target]);
  return val;
}

// ─── MAPEAMENTO DE CATEGORIA PARA OBJETIVO DO SIMULADOR ─────────────────────────
function mapCategoryToSimObjective(cat: string): Exclude<SimObjectiveId, "AUTO"> {
  switch (cat) {
    case "MESSAGES":
      return "MESSAGES";
    case "LEADS":
      return "OUTCOME_LEADS";
    case "PURCHASES":
    case "CHECKOUT":
    case "ADD_TO_CART":
      return "OUTCOME_SALES";
    case "LANDING_PAGE_VIEWS":
    case "LINK_CLICKS":
      return "LANDING_PAGE_VIEWS";
    case "INSTAGRAM_PROFILE":
      return "INSTAGRAM_PROFILE";
    case "REACH":
    case "VIDEO_VIEWS":
      return "OUTCOME_AWARENESS";
    default:
      return "MESSAGES";
  }
}

// ─── SLIDER REFINADO (LIGHT & DARK MODE READY) ──────────────────────────────────
function SimSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format: fmt,
  color = "#ef4444",
  hint,
  badge,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  color?: string;
  hint?: string;
  badge?: string;
}) {
  const pct = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-black uppercase tracking-wider text-foreground/80 truncate">
            {label}
          </span>
          {badge && (
            <span className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider bg-muted text-muted-foreground">
              {badge}
            </span>
          )}
        </div>
        <span className="text-xs font-black font-mono shrink-0" style={{ color }}>
          {fmt(value)}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute w-full h-1.5 rounded-full bg-muted border border-border/60" />
        <div
          className="absolute h-1.5 rounded-full transition-all duration-75"
          style={{ width: `${pct}%`, background: color }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute w-full appearance-none bg-transparent cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow-md"
        />
      </div>
      {hint && <p className="text-[9px] text-muted-foreground leading-snug">{hint}</p>}
    </div>
  );
}

// ─── CARD DE MÉTRICA PROJETADA ──────────────────────────────────────────────────
function SimMetricCard({
  label,
  sublabel,
  current,
  projected,
  format: fmt,
  inverse = false,
  icon: Icon,
  highlight = false,
}: {
  label: string;
  sublabel?: string;
  current: number;
  projected: number;
  format: (v: number) => string;
  inverse?: boolean;
  icon: any;
  highlight?: boolean;
}) {
  const animProjected = useAnimVal(projected);
  const delta = projected - current;
  const pctDelta = current > 0 ? (delta / current) * 100 : 0;
  const isNeutral = Math.abs(pctDelta) < 0.8;
  const isGood = inverse ? delta <= 0 : delta >= 0;

  const badgeClass = isNeutral
    ? "bg-muted text-muted-foreground border-border"
    : isGood
    ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/25"
    : "bg-red-500/12 text-red-400 border-red-500/25";

  const valueClass = isNeutral
    ? "text-foreground"
    : isGood
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div
      className={`rounded-2xl border p-4 transition-all ${
        highlight
          ? "border-primary/35 bg-primary/[0.04] shadow-sm"
          : "border-border bg-card/80"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-7 w-7 rounded-xl border border-border bg-muted/50 flex items-center justify-center shrink-0">
            <Icon className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-foreground truncate">
              {label}
            </p>
            {sublabel && (
              <p className="text-[8px] font-mono text-muted-foreground truncate">
                {sublabel}
              </p>
            )}
          </div>
        </div>

        <span
          className={`inline-flex items-center gap-0.5 rounded-lg border px-1.5 py-0.5 text-[9px] font-black font-mono shrink-0 ${badgeClass}`}
        >
          {!isNeutral &&
            (isGood ? (
              <ArrowUpRight className="h-2.5 w-2.5" />
            ) : (
              <ArrowDownRight className="h-2.5 w-2.5" />
            ))}
          {delta >= 0 ? "+" : ""}
          {pctDelta.toFixed(1)}%
        </span>
      </div>

      <p className={`text-xl font-black font-mono leading-tight ${valueClass}`}>
        {fmt(animProjected)}
      </p>

      <div className="mt-1.5 flex items-center justify-between text-[9px] font-mono text-muted-foreground border-t border-border/50 pt-1.5">
        <span>Base equivalente:</span>
        <span className="font-bold text-foreground/80">{fmt(current)}</span>
      </div>
    </div>
  );
}

// ─── CENÁRIO SALVO ──────────────────────────────────────────────────────────────
interface SavedScenario {
  id: string;
  name: string;
  objectiveLabel: string;
  params: SimulationParams;
  result: SimulationResult;
  color: string;
}

const SCENARIO_COLORS = ["#ef4444", "#8b5cf6", "#06b6d4", "#f59e0b"];

type MetricFocusGroup = "all" | "conversions" | "auction" | "financial" | "algorithm";

// ─── PÁGINA PRINCIPAL DO SIMULADOR ──────────────────────────────────────────────
function SimuladorPage() {
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    accountId,
    setAccountId,
    campaignId,
    setCampaignId,
  } = useGlobalDate();

  const dateRange = useMemo(
    () => ({
      startDate: new Date(dateFrom + "T12:00:00"),
      endDate: new Date(dateTo + "T12:00:00"),
    }),
    [dateFrom, dateTo]
  );

  const handleDateChange = useCallback(
    (start: Date, end: Date) => {
      setDateFrom(getLocalDateStr(start));
      setDateTo(getLocalDateStr(end));
    },
    [setDateFrom, setDateTo]
  );

  // Estados de UI Didática, Cálculos Ocultos e Victoria AI
  const [showDidacticGuide, setShowDidacticGuide] = useState(true);
  const [activePreset, setActivePreset] = useState<DidacticPreset | null>(null);
  const [showHiddenMath, setShowHiddenMath] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState(true);
  const [metricFocus, setMetricFocus] = useState<MetricFocusGroup>("all");
  const [isVictoriaOpen, setIsVictoriaOpen] = useState(false);
  const [victoriaContext, setVictoriaContext] = useState<ContextItem | null>(null);

  // Cenários salvos para comparação lado a lado
  const [scenarios, setScenarios] = useState<SavedScenario[]>([]);
  const [scenarioName, setScenarioName] = useState("");
  const [showSaveInput, setShowSaveInput] = useState(false);

  const activeSnapshot = useActiveMetaSnapshot({ accountId });

  // ── 1. Buscar Contas de Anúncio ──────────────────────────────────────────────
  const {
    data: adAccounts = [],
    isLoading: isLoadingAccounts,
    isError: isAccountsError,
  } = useQuery({
    queryKey: ["simulador-ad-accounts", activeSnapshot.snapshotId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("id, name, currency, status, platform, last_sync")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // ── 2. Buscar Campanhas e Métricas Reais Calibradas ──────────────────────────
  const { data: allCampaigns = [], isLoading: isLoadingCampaigns, isFetching: isFetchingCampaigns } = useQuery({
    queryKey: buildMetaSnapshotKey("simulador-campaigns", {
      accountId,
      dateFrom,
      dateTo,
      timezone: DEFAULT_META_TIMEZONE,
      level: "campaign",
      snapshotId: activeSnapshot.snapshotId,
      eventModelVersion: EVENT_MODEL_VERSION,
    }),
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      ensureDatabaseCalibrated(supabase).catch(() => {});
      const fetchCampaignPage = async (selectCols: string) => {
        const rows: any[] = [];
        let from = 0;
        const pageSize = 500;
        while (from < 5000) {
          let q = (supabase as any)
            .from("campaigns")
            .select(selectCols)
            .order("name")
            .range(from, from + pageSize - 1);
          if (accountId !== "all") {
            q = q.eq("ad_account_id", accountId);
          }
          const { data, error } = await q;
          if (error) return { data: null as any, error };
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return { data: rows, error: null };
      };

      const fullCols =
        "id, name, status, delivery_status, objective, daily_budget, lifetime_budget, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, inline_link_clicks, reach, frequency, date, result_type, optimization_goal, result_indicator)";
      const baseCols =
        "id, name, status, delivery_status, objective, daily_budget, lifetime_budget, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, reach, frequency, date, result_type)";

      let res = await fetchCampaignPage(fullCols);
      if (res.error) {
        res = await fetchCampaignPage(baseCols);
      }
      if (res.error) {
        console.warn("Aviso ao carregar campanhas no simulador:", res.error);
        return [];
      }
      return (res.data || []).map((c: any) => {
        const calibrated = calibrateCampaignMetricsArray(c.name, c.metrics || []);
        const category = detectConversionCategory(c.name, c.objective);
        const mappedObj = mapCategoryToSimObjective(category);
        return {
          ...c,
          calibratedMetrics: calibrated,
          detectedSimObjective: mappedObj,
        };
      });
    },
  });

  // ── 3. Estado dos Parâmetros do Simulador ────────────────────────────────────
  const [params, setParams] = useState<SimulationParams>({
    objective: "AUTO",
    budgetMult: 1.2, // Inicia já demonstrando uma simulação realista (+20% Escala Segura)
    periodDays: 30,
    targetFreq: 2.1,
    cpmMarketPressure: 1.0,
    ctrCreativeBoost: 1.1,
    creativeDiversity: "MEDIUM",
    userValueScore: 84,
    emqScore: 8.2,
    capiDeduplicated: true,
    budgetStructure: "CBO",
    bidStrategy: "LOWEST_COST",
    activeAdSetsCount: 3,
    closeRatePct: 8.0,
    avgTicketBRL: 4500,
  });

  const updateParam = useCallback(
    <K extends keyof SimulationParams>(key: K, val: SimulationParams[K]) => {
      setParams((prev) => ({ ...prev, [key]: val }));
    },
    []
  );

  // Filtrar lista de campanhas exibidas no dropdown conforme conta e objetivo
  const filteredCampaignOptions = useMemo(() => {
    return allCampaigns.filter((c: any) => {
      if (accountId !== "all" && c.ad_account_id !== accountId) return false;
      if (params.objective !== "AUTO" && c.detectedSimObjective !== params.objective) {
        return false;
      }
      return true;
    });
  }, [allCampaigns, accountId, params.objective]);

  // ── 4. Calcular Baseline Real (Período Selecionado -> Histórico Conta -> Benchmark)
  const baseline: BaselineMetrics = useMemo(() => {
    const daysInWindow = Math.max(
      1,
      Math.round(
        (new Date(dateTo + "T12:00:00").getTime() -
          new Date(dateFrom + "T12:00:00").getTime()) /
          86400000
      ) + 1
    );

    const targetCamps = allCampaigns.filter((c: any) => {
      if (accountId !== "all" && c.ad_account_id !== accountId) return false;
      if (campaignId !== "all" && c.id !== campaignId) return false;
      if (
        campaignId === "all" &&
        params.objective !== "AUTO" &&
        c.detectedSimObjective !== params.objective
      ) {
        return false;
      }
      return true;
    });

    // Determinar objetivo predominante
    const objCounts: Record<string, number> = {};
    for (const c of targetCamps) {
      const o = c.detectedSimObjective || "MESSAGES";
      objCounts[o] = (objCounts[o] || 0) + 1;
    }
    const dominantObjective = (Object.entries(objCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      (params.objective !== "AUTO" ? params.objective : "MESSAGES")) as Exclude<
      SimObjectiveId,
      "AUTO"
    >;

    // 4A. Somar métricas dentro da janela exata (dateFrom .. dateTo) sem misturar eventos incompatíveis na CVR
    let periodCost = 0;
    let periodConv = 0;
    let periodFunnelConv = 0;
    let periodFunnelCost = 0;
    let periodFunnelClicks = 0;
    let periodImpr = 0;
    let periodClicks = 0;
    let periodReach = 0;
    let freqWeightedSum = 0;
    let freqWeight = 0;
    const activeDates = new Set<string>();
    const activeCampIds = new Set<string>();
    const incompatibleObjectivesExcluded = new Set<string>();

    for (const c of targetCamps) {
      const campCls = classifyMetaEvent({
        campaignName: c.name,
        rawObjective: c.objective,
        isVehicleContext: true,
      });
      const isFunnelEvent =
        campCls.isConversionGoal || campCls.category === "LANDING_PAGE_VIEWS";

      for (const m of c.calibratedMetrics || []) {
        if (m.date >= dateFrom && m.date <= dateTo) {
          const cost = Number(m.cost || 0);
          const conv = Number(m.conversions || 0);
          const impr = Number(m.impressions || 0);
          const clicks = Number(m.clicks || 0);
          const reach = Number(m.reach || 0);
          const freq = Number(m.frequency || 0);

          periodCost += cost;
          periodConv += conv;
          periodImpr += impr;
          periodClicks += clicks;
          periodReach += reach;

          if (isFunnelEvent) {
            periodFunnelConv += conv;
            periodFunnelCost += cost;
            periodFunnelClicks += clicks;
          } else if (conv > 0 || cost > 0) {
            incompatibleObjectivesExcluded.add(campCls.category);
          }

          if (freq > 0 && impr > 0) {
            freqWeightedSum += freq * impr;
            freqWeight += impr;
          }
          if (cost > 0 || impr > 0) {
            activeDates.add(m.date);
            activeCampIds.add(c.id);
          }
        }
      }
    }

    if (periodCost > 0 && periodImpr > 0) {
      const effectiveDays = Math.max(1, activeDates.size || daysInWindow);
      const dailyCost = periodCost / effectiveDays;
      const cpm = (periodCost / periodImpr) * 1000;
      const ctr = periodClicks / periodImpr;

      const useFunnel = periodFunnelClicks > 0 || periodFunnelConv > 0;
      const cvrBaseConv = useFunnel ? periodFunnelConv : 0;
      const cvrBaseClicks = useFunnel ? periodFunnelClicks : 0;
      const safeCvrRes =
        dominantObjective === "OUTCOME_AWARENESS"
          ? null
          : computeCvr(cvrBaseConv, cvrBaseClicks, useFunnel ? "MESSAGES" : "UNKNOWN");
      const cvr =
        safeCvrRes?.value !== null && safeCvrRes?.value !== undefined
          ? Math.min(0.65, Math.max(0.005, safeCvrRes.value / 100))
          : 0.06;

      const cpl =
        dominantObjective === "OUTCOME_AWARENESS"
          ? computeUnitCost(periodCost, periodReach > 0 ? periodReach : periodConv, "REACH") ?? cpm
          : useFunnel && periodFunnelConv > 0
          ? periodFunnelCost / periodFunnelConv
          : periodConv > 0 && incompatibleObjectivesExcluded.size === 0
          ? periodCost / periodConv
          : cpm * 0.6;
      const cpc = periodClicks > 0 ? periodCost / periodClicks : 1.2;
      const freq =
        freqWeight > 0
          ? freqWeightedSum / freqWeight
          : periodReach > 0
          ? Math.max(1.1, periodImpr / periodReach)
          : 1.95;

      const exclusionNote =
        incompatibleObjectivesExcluded.size > 0
          ? ` (${incompatibleObjectivesExcluded.size} objetivo(s) incompatível(is) isolado(s) da CVR)`
          : "";

      return {
        cost: periodCost,
        dailyCost,
        conversions: useFunnel ? periodFunnelConv : periodConv,
        impressions: periodImpr,
        reach: periodReach,
        clicks: periodClicks,
        cpl,
        ctr: Math.max(0.002, ctr),
        cvr,
        cpm: Math.max(4, cpm),
        cpc,
        freq: Math.min(8, Math.max(1.05, freq)),
        days: effectiveDays,
        activeCampaignsCount: Math.max(1, activeCampIds.size),
        estimatedAdSetsCount: Math.max(1, Math.min(8, activeCampIds.size * 2)),
        detectedObjective: dominantObjective,
        sourceType: "real_period",
        sourceLabel: `Dados reais sincronizados (${effectiveDays}d com veiculação no período)${exclusionNote}`,
      };
    }

    // 4B. Se o período filtrado não teve gasto, usar histórico acumulado mantendo compatibilidade de evento
    let histCost = 0;
    let histConv = 0;
    let histFunnelConv = 0;
    let histFunnelCost = 0;
    let histFunnelClicks = 0;
    let histImpr = 0;
    let histClicks = 0;
    let histReach = 0;
    const histDates = new Set<string>();
    const sourceCamps = targetCamps.length > 0 ? targetCamps : allCampaigns;

    for (const c of sourceCamps) {
      const campCls = classifyMetaEvent({
        campaignName: c.name,
        rawObjective: c.objective,
        isVehicleContext: true,
      });
      const isFunnelEvent =
        campCls.isConversionGoal || campCls.category === "LANDING_PAGE_VIEWS";

      for (const m of c.calibratedMetrics || []) {
        const cost = Number(m.cost || 0);
        const impr = Number(m.impressions || 0);
        if (cost > 0 || impr > 0) {
          const conv = Number(m.conversions || 0);
          const clicks = Number(m.clicks || 0);
          histCost += cost;
          histConv += conv;
          histImpr += impr;
          histClicks += clicks;
          histReach += Number(m.reach || 0);
          if (isFunnelEvent) {
            histFunnelConv += conv;
            histFunnelCost += cost;
            histFunnelClicks += clicks;
          }
          if (m.date) histDates.add(m.date);
        }
      }
    }

    if (histCost > 0 && histImpr > 0) {
      const effectiveDays = Math.max(1, histDates.size);
      const dailyCost = histCost / effectiveDays;
      const cpm = (histCost / histImpr) * 1000;
      const ctr = histClicks / histImpr;
      const useFunnel = histFunnelClicks > 0 || histFunnelConv > 0;
      const safeHistCvrRes =
        dominantObjective === "OUTCOME_AWARENESS"
          ? null
          : computeCvr(useFunnel ? histFunnelConv : 0, useFunnel ? histFunnelClicks : 0, useFunnel ? "MESSAGES" : "UNKNOWN");
      const cvr =
        safeHistCvrRes?.value !== null && safeHistCvrRes?.value !== undefined
          ? Math.min(0.65, Math.max(0.005, safeHistCvrRes.value / 100))
          : 0.06;
      const cpl =
        dominantObjective === "OUTCOME_AWARENESS"
          ? computeUnitCost(histCost, histReach > 0 ? histReach : histConv, "REACH") ?? cpm
          : useFunnel && histFunnelConv > 0
          ? histFunnelCost / histFunnelConv
          : cpm * 0.6;
      const cpc = histClicks > 0 ? histCost / histClicks : 1.2;
      const freq = histReach > 0 ? Math.min(6, Math.max(1.1, histImpr / histReach)) : 2.05;

      return {
        cost: histCost,
        dailyCost,
        conversions: useFunnel ? histFunnelConv : histConv,
        impressions: histImpr,
        reach: histReach > 0 ? histReach : Math.round(histImpr / freq),
        clicks: histClicks,
        cpl,
        ctr: Math.max(0.002, ctr),
        cvr,
        cpm: Math.max(4, cpm),
        cpc,
        freq,
        days: effectiveDays,
        activeCampaignsCount: Math.max(1, sourceCamps.length),
        estimatedAdSetsCount: Math.max(1, Math.min(6, sourceCamps.length)),
        detectedObjective: dominantObjective,
        sourceType: "historical_account",
        sourceLabel: `Histórico real da conta (${effectiveDays}d acumulados — normalizado para janela simulada)`,
      };
    }

    // 4C. Fallback de Benchmark Calibrado (nunca trava a tela caso o banco esteja vazio)
    const objCfg = SIM_OBJECTIVES[dominantObjective] || SIM_OBJECTIVES.MESSAGES;
    const demoDailyCost = 120;
    const demoCost = demoDailyCost * 30;
    const demoCpm = 24.5;
    const demoImpr = Math.round((demoCost / demoCpm) * 1000);
    const demoCtr = objCfg.benchmarkCtrPct / 100;
    const demoClicks = Math.round(demoImpr * demoCtr);
    const demoConv = Math.max(1, Math.round(demoCost / objCfg.benchmarkCpaBRL));
    const demoCvr = demoClicks > 0 ? demoConv / demoClicks : 0.08;
    const demoFreq = 2.1;

    return {
      cost: demoCost,
      dailyCost: demoDailyCost,
      conversions: demoConv,
      impressions: demoImpr,
      reach: Math.round(demoImpr / demoFreq),
      clicks: demoClicks,
      cpl: objCfg.benchmarkCpaBRL,
      ctr: demoCtr,
      cvr: demoCvr,
      cpm: demoCpm,
      cpc: demoClicks > 0 ? demoCost / demoClicks : 1.5,
      freq: demoFreq,
      days: 30,
      activeCampaignsCount: 3,
      estimatedAdSetsCount: 3,
      detectedObjective: dominantObjective,
      sourceType: "benchmark_demo",
      sourceLabel: `Benchmark teórico sintético (${objCfg.shortLabel}) — sem histórico real no escopo (não representa conta sincronizada)`,
    };
  }, [allCampaigns, accountId, campaignId, params.objective, dateFrom, dateTo]);

  // Atualizar valores padrão dependentes do objetivo quando o objetivo muda
  const activeObjectiveConfig = useMemo(() => {
    const id = params.objective === "AUTO" ? baseline.detectedObjective : params.objective;
    return SIM_OBJECTIVES[id] || SIM_OBJECTIVES.MESSAGES;
  }, [params.objective, baseline.detectedObjective]);

  const handleObjectiveSelect = (objId: SimObjectiveId) => {
    const resolved = objId === "AUTO" ? baseline.detectedObjective : objId;
    const cfg = SIM_OBJECTIVES[resolved] || SIM_OBJECTIVES.MESSAGES;
    setParams((prev) => ({
      ...prev,
      objective: objId,
      closeRatePct: cfg.defaultCloseRatePct,
      avgTicketBRL: cfg.defaultAvgTicketBRL,
    }));
    if (campaignId !== "all") {
      setCampaignId("all");
    }
  };

  // Aplicar Preset de Exemplo em 1 Clique
  const handleApplyPreset = (preset: DidacticPreset) => {
    setActivePreset(preset);
    setParams((prev) => preset.apply(baseline, prev));
    toast.success(`Cenário aplicado: ${preset.title}`);
  };

  const handleReset = () => {
    setActivePreset(null);
    setParams({
      objective: "AUTO",
      budgetMult: 1.0,
      periodDays: 30,
      targetFreq: Number((baseline.freq || 2.1).toFixed(1)),
      cpmMarketPressure: 1.0,
      ctrCreativeBoost: 1.0,
      creativeDiversity: "MEDIUM",
      userValueScore: 80,
      emqScore: 8.0,
      capiDeduplicated: true,
      budgetStructure: "CBO",
      bidStrategy: "LOWEST_COST",
      activeAdSetsCount: baseline.estimatedAdSetsCount || 3,
      closeRatePct: activeObjectiveConfig.defaultCloseRatePct,
      avgTicketBRL: activeObjectiveConfig.defaultAvgTicketBRL,
    });
    toast.info("Parâmetros restaurados para a baseline atual (100%).");
  };

  // ── 5. Executar Simulação Algorítmica 100% Determinística ───────────────────
  const simResult = useMemo(
    () => simulateMetaAdsImpact(baseline, params),
    [baseline, params]
  );

  // ── 6. Série Temporal Diária Projetada (Curva de Aprendizado & Escala) ──────
  const trajectoryData = useMemo(() => {
    const totalDays = params.periodDays;
    const points: {
      dia: string;
      custoBase: number;
      custoProj: number;
      resBase: number;
      resProj: number;
      cpaProj: number;
    }[] = [];

    const dailyBaseRes = simResult.basePeriodConversions / totalDays;
    const dailyProjResTarget = simResult.projTotalConversions / totalDays;
    const dailyBaseCost = simResult.basePeriodCost / totalDays;
    const dailyProjCost = simResult.projDailyCost;

    for (let d = 1; d <= totalDays; d++) {
      // Se houve reset da fase de aprendizado (budget > +20%), nos primeiros 5 dias
      // o algoritmo Multi-Armed Bandit está em exploração (menor eficiência inicial, estabilizando depois)
      let learningCurveFactor = 1.0;
      if (simResult.learningResetRisk) {
        if (d <= 4) learningCurveFactor = 0.78 + d * 0.04;
        else if (d <= 8) learningCurveFactor = 0.96 + (d - 4) * 0.02;
        else learningCurveFactor = 1.05;
      } else {
        learningCurveFactor = 0.95 + Math.min(0.08, (d / totalDays) * 0.08);
      }

      const dayResProj = Math.max(0, Number((dailyProjResTarget * learningCurveFactor).toFixed(1)));
      const dayResBase = Number(dailyBaseRes.toFixed(1));
      const dayCpaProj = dayResProj > 0 ? Number((dailyProjCost / dayResProj).toFixed(2)) : 0;

      points.push({
        dia: `D+${d}`,
        custoBase: Math.round(dailyBaseCost * d),
        custoProj: Math.round(dailyProjCost * d),
        resBase: Math.round(dayResBase * d),
        resProj: Math.round(dayResProj * d),
        cpaProj: dayCpaProj,
      });
    }
    return points;
  }, [params.periodDays, simResult]);

  // Dados para o Gráfico de Barras Comparativo
  const comparisonChartData = useMemo(() => {
    return [
      {
        metric: activeObjectiveConfig.resultName,
        Atual: simResult.basePeriodConversions,
        Projetado: simResult.projTotalConversions,
        inverse: false,
      },
      {
        metric: activeObjectiveConfig.costMetricName,
        Atual: Number(baseline.cpl.toFixed(2)),
        Projetado: Number(simResult.projCPA.toFixed(2)),
        inverse: true,
      },
      {
        metric: "eCPM Leilão (R$)",
        Atual: Number(baseline.cpm.toFixed(2)),
        Projetado: Number(simResult.projCPM.toFixed(2)),
        inverse: true,
      },
      {
        metric: "Vendas Est.",
        Atual: simResult.basePeriodSales,
        Projetado: simResult.projSalesCount,
        inverse: false,
      },
    ];
  }, [activeObjectiveConfig, baseline, simResult]);

  // Salvar cenário para comparação
  const handleSaveScenario = () => {
    if (scenarios.length >= 4) {
      toast.error("Máximo de 4 cenários simultâneos. Remova um para salvar outro.");
      return;
    }
    const name =
      scenarioName.trim() ||
      activePreset?.title.replace(/^\d+\.\s*/, "") ||
      `Cenário ${scenarios.length + 1} (${(params.budgetMult * 100).toFixed(0)}% Budget)`;
    setScenarios((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        name,
        objectiveLabel: activeObjectiveConfig.shortLabel,
        params: { ...params },
        result: simResult,
        color: SCENARIO_COLORS[scenarios.length % SCENARIO_COLORS.length],
      },
    ]);
    setScenarioName("");
    setShowSaveInput(false);
    toast.success(`Cenário "${name}" salvo na tabela comparativa!`);
  };

  // Abrir Victoria AI com o contexto completo da simulação
  const handleConsultVictoria = () => {
    const selectedAccountName =
      accountId === "all"
        ? "Todas as Contas Ativas"
        : adAccounts.find((a: any) => a.id === accountId)?.name || "Conta Selecionada";
    const selectedCampName =
      campaignId === "all"
        ? `Simulação (${activeObjectiveConfig.shortLabel} · Budget ${(params.budgetMult * 100).toFixed(0)}%)`
        : allCampaigns.find((c: any) => c.id === campaignId)?.name || "Campanha Selecionada";

    setVictoriaContext({
      id: accountId === "all" ? "" : accountId,
      name: `${selectedCampName} [Projeção ${params.periodDays}d: ${simResult.projTotalConversions} ${activeObjectiveConfig.resultName} a R$ ${simResult.projCPA.toFixed(2)} | Shadow Price λ=${simResult.shadowPriceLambda.toFixed(2)} | EMQ=${params.emqScore}]`,
      type: campaignId === "all" ? "account" : "campaign",
      objective: activeObjectiveConfig.id,
      t: {
        cost: simResult.projCost,
        conversions: simResult.projTotalConversions,
        cpl: simResult.projCPA,
        ctr: simResult.projCTR * 100,
        impressions: simResult.projImpressions,
        reach: simResult.projReach,
        freq: simResult.projFreq,
        cpm: simResult.projCPM,
        cpc: simResult.projCPC,
      },
      resultDetail: {
        resultLabel: activeObjectiveConfig.resultName,
        costLabel: activeObjectiveConfig.costMetricName,
        shortBadge: activeObjectiveConfig.shortLabel,
      },
    });
    setIsVictoriaOpen(true);
  };

  const fmt = {
    brl: (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
    brlExact: (v: number) =>
      `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    num: (v: number) => Math.round(v).toLocaleString("pt-BR"),
    pct: (v: number) => `${(v * 100).toFixed(2)}%`,
    mult: (v: number) => `${v.toFixed(2)}×`,
  };

  return (
    <div className="min-h-screen pb-24 space-y-6">
      <div className="max-w-[1440px] mx-auto px-2 sm:px-4 pt-2 space-y-6">
        {/* ══════════════════════════════════════════════════════════════════
            1. CABEÇALHO EXECUTIVO + AÇÕES RÁPIDAS
            ══════════════════════════════════════════════════════════════════ */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <PageHeader
            eyebrow="Modelo Estimativo · Leilão Meta Ads (Parâmetros Ajustáveis)"
            title="Simulador Algorítmico de Impacto & Decisão"
            description="Simule cenários heurísticos de orçamento, diversidade criativa, lances e premissas CAPI/EMQ (estimativa de apoio — resultados reais permanecem nas abas Métricas e Cockpit)."
            compact
          />

          <div className="flex flex-wrap items-center gap-2">
            <SnapshotStatusBadge
              snapshotId={activeSnapshot.snapshotId}
              committedAt={activeSnapshot.committedAt}
              startedAt={activeSnapshot.startedAt}
              latestSyncRun={activeSnapshot.latestSyncRun}
              accounts={adAccounts?.length ? adAccounts : activeSnapshot.accounts}
              selectedAccountId={accountId}
              accountLastSyncAt={activeSnapshot.accountLastSyncAt}
              isPageLoading={isLoadingCampaigns || isFetchingCampaigns}
              isMetaSyncing={Boolean(activeSnapshot.isMetaSyncRunning)}
            />
            <button
              onClick={() => setShowDidacticGuide((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                showDidacticGuide
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              <HelpCircle className="h-3.5 w-3.5" />
              {showDidacticGuide ? "Ocultar Guia & Exemplos" : "Como Usar / Exemplos Práticos"}
            </button>

            <button
              onClick={() => setShowHiddenMath((v) => !v)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-all ${
                showHiddenMath
                  ? "border-violet-500/40 bg-violet-500/12 text-violet-400"
                  : "border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {showHiddenMath ? <EyeOff className="h-3.5 w-3.5" /> : <Calculator className="h-3.5 w-3.5" />}
              {showHiddenMath ? "Ocultar Modo Técnico" : "Modo Técnico (Fórmulas)"}
            </button>

            <button
              onClick={handleConsultVictoria}
              className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary text-primary-foreground px-3.5 py-2 text-[10px] font-black uppercase tracking-wider shadow-sm hover:opacity-95 active:scale-95 transition-all"
            >
              <Bot className="h-3.5 w-3.5" />
              Validar com Victoria AI
            </button>

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
              title="Restaurar variáveis para o estado atual (100%)"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Resetar
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            2. GUIA AUTO-EXPLICATIVO + EXEMPLOS PRÁTICOS EM 1 CLIQUE
            ══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {showDidacticGuide && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="rounded-2xl border border-border bg-card/90 p-5 space-y-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border pb-3.5">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/25 flex items-center justify-center text-primary shrink-0 mt-0.5">
                      <Brain className="h-4.5 w-4.5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                          Como Usar o Simulador para Tomada de Decisão (Passo a Passo)
                        </h3>
                        <span className="rounded-full bg-emerald-500/12 border border-emerald-500/25 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-400">
                          Calibrado com a Arquitetura Meta Ads 2026
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        <strong>1º Passo:</strong> Selecione abaixo a <strong>Conta</strong>, a <strong>Campanha</strong>, o <strong>Período do Calendário</strong> e o <strong>Objetivo</strong>.{" "}
                        <strong>2º Passo:</strong> Clique em um dos <strong>4 Exemplos Práticos abaixo</strong> (ou ajuste os controles manualmente) para ver como os motores <em>Andromeda (MoE)</em>, <em>GEM (pCTR/pCVR)</em>, <em>Leilão VCG</em> e <em>Pacing (λ)</em> reagem.{" "}
                        <strong>3º Passo:</strong> Siga o <strong>Veredito & Plano de Ação</strong> à direita antes de alterar o orçamento no Gerenciador.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4 Presets de Simulação Prática em 1 Clique */}
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2.5 flex items-center gap-1.5">
                    <Play className="h-3 w-3 text-primary" />
                    Teste Agora — Clique em um Exemplo Real de Decisão:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    {DIDACTIC_SIMULATION_PRESETS.map((preset) => {
                      const isSelected = activePreset?.id === preset.id;
                      return (
                        <button
                          key={preset.id}
                          onClick={() => handleApplyPreset(preset)}
                          className={`text-left rounded-xl border p-3.5 transition-all hover:scale-[1.01] active:scale-[0.99] ${
                            isSelected
                              ? "border-primary bg-primary/[0.07] shadow-sm"
                              : "border-border bg-background/50 hover:border-primary/40 hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span
                              className="rounded px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider"
                              style={{
                                backgroundColor: `${preset.color}18`,
                                color: preset.color,
                                border: `1px solid ${preset.color}35`,
                              }}
                            >
                              {preset.badge}
                            </span>
                            <span className="text-[9px] font-black uppercase text-primary">
                              {isSelected ? "Ativo ✓" : "Simular →"}
                            </span>
                          </div>
                          <p className="text-xs font-black text-foreground leading-snug">
                            {preset.title}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">
                            {preset.subtitle}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Explicação Didática do Exemplo Selecionado */}
                {activePreset && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-primary/30 bg-primary/[0.05] p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5" />
                        O que está acontecendo no Algoritmo do Meta Ads neste Exemplo ({activePreset.title}):
                      </p>
                      <p className="text-[11px] text-foreground leading-relaxed">
                        {activePreset.algorithmicLesson}
                      </p>
                      <p className="text-[10px] font-bold text-muted-foreground">
                        🎯 <span className="text-foreground">Conclusão Prática:</span> {activePreset.decisionOutcome}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══════════════════════════════════════════════════════════════════
            3. BARRA DE FILTROS DO TRÁFEGO (CONTA, CAMPANHA, CALENDÁRIO, OBJETIVO, MÉTRICAS)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-border bg-card/90 p-4 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-3 items-end">
            {/* Filtro 1: Conta de Anúncio */}
            <div className="xl:col-span-3 space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Filter className="h-3 w-3 text-primary" />
                1. Conta de Anúncios (Cliente)
              </label>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:border-primary transition-colors"
              >
                <option value="all">
                  {isLoadingAccounts
                    ? "Carregando contas de anúncios..."
                    : isAccountsError
                    ? "Erro ao carregar contas sincronizadas"
                    : adAccounts.length === 0
                    ? "Nenhuma conta sincronizada"
                    : `Todas as Contas Conectadas (${adAccounts.length})`}
                </option>
                {adAccounts.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro 2: Seletor de Objetivo */}
            <div className="xl:col-span-3 space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Target className="h-3 w-3 text-primary" />
                2. Objetivo de Conversão Meta Ads
              </label>
              <select
                value={params.objective}
                onChange={(e) => handleObjectiveSelect(e.target.value as SimObjectiveId)}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:border-primary transition-colors"
              >
                {Object.values(SIM_OBJECTIVES).map((obj) => (
                  <option key={obj.id} value={obj.id}>
                    {obj.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Filtro 3: Campanha Específica */}
            <div className="xl:col-span-3 space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-primary" />
                3. Campanha Alvo ({filteredCampaignOptions.length} disponíveis)
              </label>
              <select
                value={campaignId}
                onChange={(e) => setCampaignId(e.target.value)}
                className="w-full h-10 rounded-xl border border-border bg-background px-3 text-xs font-bold text-foreground outline-none focus:border-primary transition-colors"
              >
                <option value="all">
                  Consolidado de Todas as Campanhas Filtradas ({filteredCampaignOptions.length})
                </option>
                {filteredCampaignOptions.map((c: any) => {
                  const totalSpend = (c.calibratedMetrics || []).reduce(
                    (acc: number, m: any) => acc + Number(m.cost || 0),
                    0
                  );
                  const st = String(c.status || "").toUpperCase() === "ACTIVE" ? "🟢" : "⏸️";
                  return (
                    <option key={c.id} value={c.id}>
                      {st} {c.name} ({fmt.brl(totalSpend)})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Filtro 4: Calendário Padrão do Tráfego */}
            <div className="xl:col-span-3 space-y-1.5">
              <label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                <Activity className="h-3 w-3 text-primary" />
                4. Janela Histórica Base (Calendário)
              </label>
              <DateRangePicker
                startDate={dateRange.startDate}
                endDate={dateRange.endDate}
                onChange={handleDateChange}
                className="w-full"
              />
            </div>
          </div>

          {/* Sub-barra: Seletor de Foco de Métricas + Status da Baseline */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mr-1">
                Foco de Métricas:
              </span>
              {(
                [
                  { id: "all", label: "Visão Completa (360°)" },
                  { id: "conversions", label: "Volume & CPA" },
                  { id: "auction", label: "Leilão (CPM / CTR / CVR)" },
                  { id: "financial", label: "Financeiro (ROAS / Custo / Retorno)" },
                  { id: "algorithm", label: "Ritmo de Entrega & Aprendizado" },
                ] as { id: MetricFocusGroup; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setMetricFocus(tab.id)}
                  className={`rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider transition-all ${
                    metricFocus === tab.id
                      ? "border-primary bg-primary/12 text-primary"
                      : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span
                className={`h-2 w-2 rounded-full ${
                  baseline.sourceType === "real_period"
                    ? "bg-emerald-500"
                    : baseline.sourceType === "historical_account"
                    ? "bg-amber-500"
                    : "bg-blue-500"
                }`}
              />
              <span className="text-muted-foreground font-bold">{baseline.sourceLabel}</span>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            4. GRID PRINCIPAL DE 3 COLUNAS:
               [COL 1: BASELINE REAL] | [COL 2: VARIÁVEIS & ALGORITMO] | [COL 3: PROJEÇÃO & DECISÃO]
            ══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* ── COLUNA 1: BASELINE ATUAL DA CONTA/CAMPANHA (3 cols) ──────── */}
          <div className="lg:col-span-3 rounded-2xl border border-border bg-card/90 p-5 space-y-4 shadow-sm">
            {isAccountsError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-[11px] font-bold text-rose-400">
                Falha ao carregar contas sincronizadas no Supabase. Projeção impedida de reivindicar baseline real da conta.
              </div>
            )}
            {!isAccountsError && baseline.sourceType === "benchmark_demo" && !isLoadingCampaigns && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] font-semibold text-amber-300">
                Modo sintético ativo: a seleção atual não possui métricas reais no período; os números abaixo são apenas benchmark de referência.
              </div>
            )}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                  Ponto de Partida
                </span>
                <h3 className="text-sm font-black uppercase tracking-wide text-foreground">
                  Baseline Atual
                </h3>
              </div>
              <span className="rounded-lg bg-muted px-2 py-1 text-[9px] font-black font-mono text-foreground">
                {activeObjectiveConfig.shortLabel}
              </span>
            </div>

            {isLoadingCampaigns ? (
              <div className="py-8 flex flex-col items-center justify-center gap-2 text-muted-foreground text-xs font-mono">
                <div className="h-5 w-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                Sincronizando métricas reais...
              </div>
            ) : (
              <div className="space-y-2.5">
                {[
                  {
                    label: "Gasto no Período Base",
                    val: fmt.brlExact(baseline.cost),
                    sub: `${baseline.days} dia(s) analisados`,
                    icon: DollarSign,
                  },
                  {
                    label: "Investimento Diário Médio",
                    val: `${fmt.brlExact(baseline.dailyCost)}/dia`,
                    sub: `${baseline.activeCampaignsCount} campanha(s) na amostra`,
                    icon: Activity,
                  },
                  {
                    label: activeObjectiveConfig.resultName,
                    val: fmt.num(baseline.conversions),
                    sub: `Equiv. ${params.periodDays}d: ${fmt.num(simResult.basePeriodConversions)}`,
                    icon: Users,
                  },
                  {
                    label: activeObjectiveConfig.costMetricName,
                    val: fmt.brlExact(baseline.cpl),
                    sub: `Benchmark: R$ ${activeObjectiveConfig.benchmarkCpaBRL.toFixed(2)}`,
                    icon: Target,
                  },
                  {
                    label: "eCPM Médio de Leilão",
                    val: fmt.brlExact(baseline.cpm),
                    sub: `${fmt.num(baseline.impressions)} impressões`,
                    icon: Zap,
                  },
                  {
                    label: "CTR de Link Direcional",
                    val: fmt.pct(baseline.ctr),
                    sub: `${fmt.num(baseline.clicks)} cliques no link`,
                    icon: Sparkles,
                  },
                  {
                    label: "Taxa de Conversão (CVR)",
                    val: fmt.pct(baseline.cvr),
                    sub: "Conversões ÷ Link Clicks",
                    icon: BarChart3,
                  },
                  {
                    label: "Frequência Média",
                    val: `${baseline.freq.toFixed(2)}×`,
                    sub: `Alcance: ${fmt.num(baseline.reach)} únicos`,
                    icon: TrendingUp,
                  },
                ].map((item, idx) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={idx}
                      className="flex items-center justify-between py-2 border-b border-border/50 last:border-0"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-7 w-7 rounded-lg bg-muted/60 flex items-center justify-center shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold text-foreground truncate">
                            {item.label}
                          </p>
                          <p className="text-[8px] font-mono text-muted-foreground truncate">
                            {item.sub}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs font-black font-mono text-foreground shrink-0 ml-2">
                        {item.val}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Resumo da Equação de Leilão Atual */}
            <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-1.5">
              <p className="text-[9px] font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Gauge className="h-3.5 w-3.5 text-primary" />
                Diagnóstico Base do Leilão
              </p>
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                {baseline.freq > 3.0
                  ? "⚠️ Frequência base elevada (>3.0×): audiência atual apresenta sinais de saturação no cluster do Andromeda."
                  : baseline.ctr < 0.01
                  ? "⚠️ CTR de link abaixo de 1.0%: oportunidade clara de reduzir o eCPM via novos ganchos criativos."
                  : "✅ Sinais de leilão equilibrados: base saudável para simulação de escala e otimização VCG."}
              </p>
            </div>
          </div>

          {/* ── COLUNA 2: CONTROLES & PARÂMETROS DO ALGORITMO (4 cols) ───── */}
          <div className="lg:col-span-4 rounded-2xl border border-primary/25 bg-card/95 p-5 space-y-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                  Alavancas Operacionais
                </span>
                <h3 className="text-sm font-black uppercase tracking-wide text-foreground">
                  Variáveis da Simulação
                </h3>
              </div>

              {/* Seletor de Período Projetado */}
              <div className="flex items-center gap-1 rounded-xl bg-muted p-1 border border-border">
                {([7, 14, 30, 60] as const).map((d) => (
                  <button
                    key={d}
                    onClick={() => updateParam("periodDays", d)}
                    className={`rounded-lg px-2 py-1 text-[9px] font-black uppercase transition-all ${
                      params.periodDays === d
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders Principais */}
            <div className="space-y-4">
              <SimSlider
                label="1. Multiplicador de Orçamento (Budget)"
                badge={params.budgetMult <= 1.2 ? "Zona Segura ≤+20%" : "Alerta Reset >+20%"}
                value={params.budgetMult}
                min={0.3}
                max={3.0}
                step={0.05}
                onChange={(v) => updateParam("budgetMult", v)}
                format={(v) =>
                  `${(v * 100).toFixed(0)}% (${fmt.brl(baseline.dailyCost * v)}/dia)`
                }
                color={params.budgetMult > 1.2 ? "#f59e0b" : "#ef4444"}
                hint="Aumentos > +20% por ciclo elevam o Shadow Price (λ → 1.0) e reiniciam a Fase de Aprendizado."
              />

              <SimSlider
                label="2. Boost Criativo (Impacto no pCTR do GEM)"
                value={params.ctrCreativeBoost}
                min={0.6}
                max={2.5}
                step={0.05}
                onChange={(v) => updateParam("ctrCreativeBoost", v)}
                format={(v) => `${(v * 100).toFixed(0)}% (CTR → ${fmt.pct(simResult.projCTR)})`}
                color="#10b981"
                hint="Ganho de atração visual nos primeiros 3s. Maior pCTR reduz o eCPM pela regra VCG."
              />

              {/* Seletor de Diversidade Criativa */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-foreground/80">
                    3. Diversidade Criativa
                  </span>
                  <span className="text-[9px] font-mono font-bold text-primary">
                    Aderência: {simResult.andromedaAffinityScore}/100
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "LOW", label: "Baixa", sub: "Variação Simples" },
                      { id: "MEDIUM", label: "Média", sub: "2 Formatos" },
                      { id: "HIGH", label: "Alta", sub: "Conceitos Distintos" },
                    ] as { id: CreativeDiversityLevel; label: string; sub: string }[]
                  ).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => updateParam("creativeDiversity", item.id)}
                      className={`rounded-xl border p-2 text-center transition-all ${
                        params.creativeDiversity === item.id
                          ? "border-primary bg-primary/12 text-primary font-black"
                          : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <p className="text-[10px] font-black uppercase">{item.label}</p>
                      <p className="text-[8px] opacity-80 truncate">{item.sub}</p>
                    </button>
                  ))}
                </div>
              </div>

              <SimSlider
                label="4. Frequência Alvo Desejada"
                value={params.targetFreq}
                min={1.1}
                max={5.0}
                step={0.1}
                onChange={(v) => updateParam("targetFreq", v)}
                format={(v) => `${v.toFixed(1)}×`}
                color="#06b6d4"
                hint="Frequência ideal: 1.5× a 2.5×. Acima de 2.8× com baixa diversidade gera fadiga severa."
              />

              <SimSlider
                label="5. User Value Pós-Clique (Página / SLA WhatsApp)"
                value={params.userValueScore}
                min={40}
                max={100}
                step={2}
                onChange={(v) => updateParam("userValueScore", v)}
                format={(v) => `${v}/100 pts`}
                color="#8b5cf6"
                hint="Velocidade da LP (<2.5s), resposta rápida (<5min) e anúncio sem clickbait somam direto no Total Value."
              />

              <SimSlider
                label="6. Pressão Externa de Leilão (Sazonalidade CPM)"
                value={params.cpmMarketPressure}
                min={0.7}
                max={1.6}
                step={0.05}
                onChange={(v) => updateParam("cpmMarketPressure", v)}
                format={(v) => `${v >= 1 ? "+" : ""}${((v - 1) * 100).toFixed(0)}%`}
                color="#f97316"
                hint="Simula concorrência externa no leilão (ex: fim de mês, feirão automotivo, Black Friday)."
              />
            </div>

            {/* Acordeão: Parâmetros Avançados de Arquitetura (CBO/ABO, Bidding, CAPI/EMQ, Comercial) */}
            <div className="pt-3 border-t border-border space-y-3">
              <button
                onClick={() => setShowAdvancedControls((v) => !v)}
                className="w-full flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-1.5">
                  <Sliders className="h-3.5 w-3.5 text-primary" />
                  Parâmetros de Arquitetura, CAPI/EMQ & Fechamento Comercial
                </span>
                {showAdvancedControls ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>

              <AnimatePresence>
                {showAdvancedControls && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="space-y-4 overflow-hidden pt-1"
                  >
                    {/* CBO vs ABO + Nº de Conjuntos */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          Estrutura de Budget
                        </label>
                        <div className="grid grid-cols-2 gap-1">
                          {(["CBO", "ABO"] as BudgetStructureId[]).map((st) => (
                            <button
                              key={st}
                              onClick={() => updateParam("budgetStructure", st)}
                              className={`rounded-lg border py-1.5 text-[10px] font-black uppercase transition-all ${
                                params.budgetStructure === st
                                  ? "border-primary bg-primary/15 text-primary"
                                  : "border-border bg-background/60 text-muted-foreground"
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          Conjuntos Ativos
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={params.activeAdSetsCount}
                          onChange={(e) =>
                            updateParam(
                              "activeAdSetsCount",
                              Math.max(1, Math.min(25, parseInt(e.target.value || "1", 10)))
                            )
                          }
                          className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono font-bold text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>

                    {/* Estratégia de Lance (Bid Strategy) */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                        Estratégia de Lance no Leilão
                      </label>
                      <select
                        value={params.bidStrategy}
                        onChange={(e) => updateParam("bidStrategy", e.target.value as BidStrategyId)}
                        className="w-full h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-bold text-foreground outline-none focus:border-primary"
                      >
                        <option value="LOWEST_COST">Volume Máximo / Menor Custo (Padrão)</option>
                        <option value="COST_CAP">Meta de Custo (Cost Cap — Protege CPA)</option>
                        <option value="TARGET_ROAS">Meta de ROAS / Valor Mais Alto (pLTV)</option>
                        <option value="BID_CAP">Limite de Lance Rígido (Bid Cap)</option>
                      </select>
                    </div>

                    {/* Telemetria CAPI + EMQ Score */}
                    <div className="rounded-xl border border-border bg-background/50 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-wider text-foreground">
                          Premissa CAPI + Deduplicação (Editável)
                        </span>
                        <button
                          onClick={() => updateParam("capiDeduplicated", !params.capiDeduplicated)}
                          className={`rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase transition-all ${
                            params.capiDeduplicated
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                              : "bg-red-500/15 text-red-400 border border-red-500/30"
                          }`}
                        >
                          {params.capiDeduplicated ? "CAPI Ativo ✓" : "Só Pixel (Perda 30%)"}
                        </button>
                      </div>

                      <SimSlider
                        label="Event Match Quality (EMQ)"
                        value={params.emqScore}
                        min={3.0}
                        max={10.0}
                        step={0.2}
                        onChange={(v) => updateParam("emqScore", v)}
                        format={(v) => `${v.toFixed(1)} / 10`}
                        color="#06b6d4"
                        hint="Meta recomendada: ≥ 8.0 (enviando em + ph em SHA-256 + fbc/fbp sem hash)."
                      />
                    </div>

                    {/* Parâmetros Financeiros do Negócio (Para cálculo de ROAS, MER e nCAC) */}
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          Taxa Fechamento (%)
                        </label>
                        <input
                          type="number"
                          min={0.5}
                          max={100}
                          step={0.5}
                          value={params.closeRatePct}
                          onChange={(e) =>
                            updateParam(
                              "closeRatePct",
                              Math.max(0.1, Math.min(100, parseFloat(e.target.value || "5")))
                            )
                          }
                          className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono font-bold text-foreground outline-none focus:border-primary"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
                          Ticket Médio Est. (R$)
                        </label>
                        <input
                          type="number"
                          min={50}
                          step={100}
                          value={params.avgTicketBRL}
                          onChange={(e) =>
                            updateParam(
                              "avgTicketBRL",
                              Math.max(10, parseFloat(e.target.value || "1000"))
                            )
                          }
                          className="w-full h-8 rounded-lg border border-border bg-background px-2.5 text-xs font-mono font-bold text-foreground outline-none focus:border-primary"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Botão de Salvar Cenário na Tabela Comparativa */}
            <div className="pt-2 border-t border-border">
              {showSaveInput ? (
                <div className="space-y-2">
                  <input
                    autoFocus
                    value={scenarioName}
                    onChange={(e) => setScenarioName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveScenario()}
                    placeholder="Ex: Escala +20% com Vídeo Pátio..."
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-primary"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveScenario}
                      className="flex-1 rounded-xl bg-primary py-2 text-[10px] font-black uppercase tracking-wider text-primary-foreground hover:opacity-90 transition"
                    >
                      Confirmar & Comparar
                    </button>
                    <button
                      onClick={() => setShowSaveInput(false)}
                      className="rounded-xl border border-border px-3 py-2 text-[10px] font-bold text-muted-foreground hover:text-foreground transition"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowSaveInput(true)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 py-2.5 text-[10px] font-black uppercase tracking-widest text-primary hover:bg-primary/20 transition-all"
                >
                  <Bookmark className="h-3.5 w-3.5" />
                  Salvar Cenário p/ Comparar ({scenarios.length}/4)
                </button>
              )}
            </div>
          </div>

          {/* ── COLUNA 3: PROJEÇÃO ALGORÍTMICA & VEREDITO DE DECISÃO (5 cols) ─ */}
          <div className="lg:col-span-5 space-y-4">
            {/* Banner de Veredito Executivo para Tomada de Decisão */}
            <div
              className={`rounded-2xl border p-4 shadow-sm ${
                simResult.verdictLevel === "OPTIMAL_SCALE"
                  ? "border-emerald-500/35 bg-emerald-500/[0.07]"
                  : simResult.verdictLevel === "CAUTION_OPTIMIZE"
                  ? "border-amber-500/35 bg-amber-500/[0.07]"
                  : "border-red-500/35 bg-red-500/[0.07]"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    simResult.verdictLevel === "OPTIMAL_SCALE"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : simResult.verdictLevel === "CAUTION_OPTIMIZE"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-red-500/20 text-red-400"
                  }`}
                >
                  {simResult.verdictLevel === "OPTIMAL_SCALE" ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : simResult.verdictLevel === "CAUTION_OPTIMIZE" ? (
                    <AlertTriangle className="h-5 w-5" />
                  ) : (
                    <Lock className="h-5 w-5" />
                  )}
                </div>
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span
                      className={`text-[9px] font-black uppercase tracking-widest ${
                        simResult.verdictLevel === "OPTIMAL_SCALE"
                          ? "text-emerald-400"
                          : simResult.verdictLevel === "CAUTION_OPTIMIZE"
                          ? "text-amber-400"
                          : "text-red-400"
                      }`}
                    >
                      Veredito Algorítmico — Projeção para {params.periodDays} Dias
                    </span>
                    <span className="rounded-md bg-background/70 border border-border px-2 py-0.5 text-[9px] font-mono font-bold text-foreground">
                      Total Value: {simResult.totalValueIndex} pts
                    </span>
                  </div>
                  <h4 className="text-xs sm:text-sm font-black text-foreground leading-snug">
                    {simResult.verdictTitle}
                  </h4>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {simResult.verdictSummary}
                  </p>
                </div>
              </div>
            </div>

            {/* Grid de Cards de Métricas Projetadas (Filtra conforme metricFocus) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {(metricFocus === "all" || metricFocus === "conversions") && (
                <>
                  <SimMetricCard
                    label={activeObjectiveConfig.resultName}
                    sublabel={`Click Direto: ${fmt.num(simResult.projDirectClickConv)} | 1d Engage: ${fmt.num(simResult.projEngageThroughConv)}`}
                    current={simResult.basePeriodConversions}
                    projected={simResult.projTotalConversions}
                    format={fmt.num}
                    icon={Users}
                    highlight
                  />
                  <SimMetricCard
                    label={activeObjectiveConfig.costMetricName}
                    sublabel="Custo unitário pós-leilão VCG"
                    current={baseline.cpl}
                    projected={simResult.projCPA}
                    format={fmt.brlExact}
                    icon={Target}
                    inverse
                    highlight
                  />
                </>
              )}

              {(metricFocus === "all" || metricFocus === "conversions" || metricFocus === "financial") && (
                <>
                  <SimMetricCard
                    label={`Investimento (${params.periodDays}d)`}
                    sublabel={`Diário: ${fmt.brlExact(simResult.projDailyCost)}/dia`}
                    current={simResult.basePeriodCost}
                    projected={simResult.projCost}
                    format={fmt.brl}
                    icon={DollarSign}
                  />
                  <SimMetricCard
                    label="Faturamento Projetado"
                    sublabel={`${fmt.num(simResult.projSalesCount)} vendas · ROAS ${simResult.projROAS.toFixed(2)}×`}
                    current={simResult.basePeriodRevenue}
                    projected={simResult.projRevenueBRL}
                    format={fmt.brl}
                    icon={TrendingUp}
                  />
                </>
              )}

              {(metricFocus === "all" || metricFocus === "auction") && (
                <>
                  <SimMetricCard
                    label="CPM Projetado no Leilão"
                    sublabel={`Ajuste de relevância: ${simResult.vcgEcpmDiscountPct >= 0 ? "+" : ""}${simResult.vcgEcpmDiscountPct.toFixed(1)}%`}
                    current={baseline.cpm}
                    projected={simResult.projCPM}
                    format={fmt.brlExact}
                    icon={Zap}
                    inverse
                  />
                  <SimMetricCard
                    label="Alcance Único Estimado"
                    sublabel={`Freq. Projetada: ${simResult.projFreq.toFixed(2)}× · ${fmt.num(simResult.projImpressions)} impr.`}
                    current={simResult.basePeriodReach}
                    projected={simResult.projReach}
                    format={fmt.num}
                    icon={Activity}
                  />
                </>
              )}
            </div>

            {/* Painel de Telemetria de Leilão & Eficiência Operacional */}
            <div className="rounded-2xl border border-border bg-card/90 p-4 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <Cpu className="h-3.5 w-3.5 text-primary" />
                  Premissas & Eficiência Estimada
                </span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase ${
                    simResult.learningPhaseStatus === "STABLE_EXPLOITATION"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : simResult.learningPhaseStatus === "LEARNING_EXPLORATION"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {simResult.learningPhaseLabel}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="rounded-xl border border-border bg-background/60 p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    CTR Estimado
                  </p>
                  <p className="text-sm font-black font-mono text-foreground mt-0.5">
                    {fmt.pct(simResult.projCTR)}
                  </p>
                  <p className="text-[8px] font-mono text-muted-foreground">
                    base: {fmt.pct(baseline.ctr)}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    Conversão Estimada (CVR)
                  </p>
                  <p className="text-sm font-black font-mono text-foreground mt-0.5">
                    {fmt.pct(simResult.projCVR)}
                  </p>
                  <p className="text-[8px] font-mono text-muted-foreground">
                    base: {fmt.pct(baseline.cvr)}
                  </p>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    Pressão de Ritmo
                  </p>
                  <p className="text-sm font-black font-mono text-primary mt-0.5">
                    {simResult.shadowPriceLambda.toFixed(2)}
                  </p>
                  <p className="text-[8px] font-mono text-muted-foreground">
                    Lance Efetivo: {simResult.effectiveBidMultiplier.toFixed(2)}×
                  </p>
                  <details className="mt-1">
                    <summary className="text-[8px] text-muted-foreground cursor-pointer hover:text-foreground">Detalhe técnico (λ)</summary>
                    <p className="text-[8px] text-muted-foreground mt-0.5">Shadow Price de pacing algorítmico no leilão VCG.</p>
                  </details>
                </div>

                <div className="rounded-xl border border-border bg-background/60 p-2.5">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    Eventos / Sem / Conj.
                  </p>
                  <p
                    className={`text-sm font-black font-mono mt-0.5 ${
                      simResult.weeklyConvPerAdSet >= 50
                        ? "text-emerald-400"
                        : simResult.weeklyConvPerAdSet >= 25
                        ? "text-amber-400"
                        : "text-red-400"
                    }`}
                  >
                    {simResult.weeklyConvPerAdSet.toFixed(1)} / 50
                  </p>
                  <p className="text-[8px] font-mono text-muted-foreground">
                    {params.activeAdSetsCount} conj. em {params.budgetStructure}
                  </p>
                </div>
              </div>

              {/* Linha Financeira: ROAS de Clique Puro vs ROAS Total, MER e nCAC */}
              <div className="grid grid-cols-3 gap-2.5 pt-1 border-t border-border/60">
                <div className="text-center sm:text-left">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    ROAS Clique Puro vs Total
                  </p>
                  <p className="text-xs font-black font-mono text-foreground">
                    {simResult.projPureClickROAS.toFixed(2)}× / {simResult.projROAS.toFixed(2)}×
                  </p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    MER (Eficiência Global)
                  </p>
                  <p className="text-xs font-black font-mono text-emerald-400">
                    {simResult.projMER.toFixed(2)}×
                  </p>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-[8px] font-black uppercase tracking-wider text-muted-foreground">
                    nCAC (Custo Novo Cliente)
                  </p>
                  <p className="text-xs font-black font-mono text-foreground">
                    {simResult.projNCAC > 0 ? fmt.brl(simResult.projNCAC) : "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Plano de Ação Prático para Tomada de Decisão */}
            <div className="rounded-2xl border border-border bg-card/90 p-4 space-y-2.5 shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5" />
                Plano de Ação Recomendado para o Gestor:
              </p>
              <ul className="space-y-2">
                {simResult.actionPlan.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[11px] text-foreground leading-relaxed bg-background/50 rounded-xl p-2.5 border border-border/60"
                  >
                    <span className="h-4 w-4 rounded-full bg-primary/15 text-primary text-[9px] font-black flex items-center justify-center shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            5. DIAGNÓSTICO POR SUBSISTEMA DO META ADS (ANDROMEDA, GEM, VCG, PACING, BANDIT)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-border bg-card/90 p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                Raio-X dos 5 Motores Algorítmicos do Meta Ads nesta Simulação
              </h3>
              <p className="text-[10px] text-muted-foreground">
                Como cada estágio do pipeline de entrega reage aos parâmetros que você selecionou:
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
            {simResult.causalDiagnostics.map((diag, idx) => {
              const borderCol =
                diag.status === "positive"
                  ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                  : diag.status === "warning"
                  ? "border-amber-500/30 bg-amber-500/[0.04]"
                  : "border-red-500/30 bg-red-500/[0.04]";
              const badgeCol =
                diag.status === "positive"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : diag.status === "warning"
                  ? "bg-amber-500/15 text-amber-400"
                  : "bg-red-500/15 text-red-400";

              return (
                <div
                  key={idx}
                  className={`rounded-xl border p-3.5 space-y-1.5 flex flex-col justify-between ${borderCol}`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`rounded px-1.5 py-0.5 text-[8px] font-black uppercase ${badgeCol}`}>
                        {diag.engine}
                      </span>
                    </div>
                    <p className="text-[11px] font-black text-foreground leading-snug">
                      {diag.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      {diag.explanation}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            6. MOSTRAGEM DE CÁLCULOS DE FORMA OCULTA (MEMÓRIA DE CÁLCULO & EQUAÇÕES REAIS)
            ══════════════════════════════════════════════════════════════════ */}
        <div className="rounded-2xl border border-border bg-card/90 overflow-hidden shadow-sm">
          <button
            onClick={() => setShowHiddenMath((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-violet-500/12 border border-violet-500/25 flex items-center justify-center text-violet-400">
                <Calculator className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Memória de Cálculo & Auditoria Matemática do Leilão (Oculto por Padrão)
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Clique para {showHiddenMath ? "ocultar" : "revelar"} as equações exatas de Total Value, Precificação VCG, Pacing (λ), Andromeda LTI e Multi-Armed Bandit aplicadas nos números acima.
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-[10px] font-black uppercase tracking-wider text-foreground shrink-0">
              {showHiddenMath ? (
                <>
                  <EyeOff className="h-3.5 w-3.5 text-violet-400" /> Ocultar Cálculos
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5 text-violet-400" /> Mostrar Cálculos
                </>
              )}
            </span>
          </button>

          <AnimatePresence>
            {showHiddenMath && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="border-t border-border p-5 bg-background/40 space-y-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {/* Equação 1: Total Value */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-violet-400">
                      1. Equação Fundamental de Total Value
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      Total Value = (Bid_efetivo × pCTR × pCVR) + User Value
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• Multiplicador Bid_efetivo: <strong className="text-foreground">{simResult.effectiveBidMultiplier.toFixed(3)}×</strong></p>
                      <p>• pCTR projetado (GEM): <strong className="text-foreground">{(simResult.projCTR * 100).toFixed(2)}%</strong> ({simResult.gemPctrMultiplier.toFixed(2)}× base)</p>
                      <p>• pCVR projetado (GEM): <strong className="text-foreground">{(simResult.projCVR * 100).toFixed(2)}%</strong> ({simResult.gemPcvrMultiplier.toFixed(2)}× base)</p>
                      <p>• Fator User Value ({params.userValueScore}/100): <strong className="text-foreground">{simResult.userValueFactor.toFixed(2)}×</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = Índice Total Value: {simResult.totalValueIndex} pts (Base = 100)
                      </p>
                    </div>
                  </div>

                  {/* Equação 2: Precificação VCG */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                      2. Precificação Vickrey-Clarke-Groves (VCG)
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      Actual Cost = (TotalValue_2º - UserValue) / (pCTR × pCVR)
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• CPM Base Histórico: <strong className="text-foreground">R$ {baseline.cpm.toFixed(2)}</strong></p>
                      <p>• Pressão Externa Sazonal: <strong className="text-foreground">{(params.cpmMarketPressure * 100).toFixed(0)}%</strong></p>
                      <p>• Desconto/Ágio de Relevância VCG: <strong className="text-foreground">{simResult.vcgEcpmDiscountPct >= 0 ? "+" : ""}{simResult.vcgEcpmDiscountPct.toFixed(1)}%</strong></p>
                      <p>• Impressões Compradas: <strong className="text-foreground">{fmt.num(simResult.projImpressions)} impr.</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = eCPM Efetivo VCG: R$ {simResult.projCPM.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Equação 3: Pacing & Shadow Price λ */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">
                      3. Modulação de Pacing & Preço de Sombra (λ)
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      Bid_efetivo = λ · Bid_base , onde λ ∈ (0, 1]
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• Escala Solicitada: <strong className="text-foreground">{(params.budgetMult * 100).toFixed(0)}%</strong> ({params.budgetStructure})</p>
                      <p>• Coeficiente Shadow Price (λ): <strong className="text-foreground">{simResult.shadowPriceLambda.toFixed(3)}</strong> (Base = 0.620)</p>
                      <p>• Risco Underdelivery ({params.bidStrategy}): <strong className="text-foreground">{simResult.underdeliveryRiskPct}%</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = Orçamento Diário Efetivo: {fmt.brlExact(simResult.projDailyCost)}/dia
                      </p>
                    </div>
                  </div>

                  {/* Equação 4: Andromeda Soft Assignment (LTI) */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400">
                      4. Andromeda Retrieval (Learning To Index)
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      a_k = exp(-α·||v_j - c_k||₂) / Σ exp(-α·||v_j - c_k'||₂)
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• Creative Diversity Score: <strong className="text-foreground">{params.creativeDiversity}</strong></p>
                      <p>• Frequência Efetiva no Cluster: <strong className="text-foreground">{simResult.projFreq.toFixed(2)}×</strong></p>
                      <p>• Alcance Único Desbloqueado: <strong className="text-foreground">{fmt.num(simResult.projReach)} pessoas</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = Afinidade de Cluster MoE: {simResult.andromedaAffinityScore}/100
                      </p>
                    </div>
                  </div>

                  {/* Equação 5: Telemetria CAPI + EMQ + Atribuição 2026 */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-primary">
                      5. Telemetria CAPI/EMQ & Atribuição 2026
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      Conv_Total = Conv_LinkClick + Conv_1d_EngageThrough
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• Score EMQ / CAPI: <strong className="text-foreground">{params.emqScore.toFixed(1)}/10 ({params.capiDeduplicated ? "Deduplicado" : "Sem CAPI"})</strong></p>
                      <p>• Cliques Direcionais (Link Clicks): <strong className="text-foreground">{fmt.num(simResult.projLinkClicks)}</strong></p>
                      <p>• Conv. Clique Direto (7d/1d click): <strong className="text-foreground">{fmt.num(simResult.projDirectClickConv)}</strong></p>
                      <p>• Conv. 1-Day Engage-Through: <strong className="text-foreground">{fmt.num(simResult.projEngageThroughConv)}</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = Total: {fmt.num(simResult.projTotalConversions)} {activeObjectiveConfig.resultName}
                      </p>
                    </div>
                  </div>

                  {/* Equação 6: Multi-Armed Bandit & Verdade Contábil */}
                  <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-400">
                      6. Densidade Bandit (50/sem) & MER / nCAC
                    </span>
                    <div className="rounded-lg bg-muted/60 p-2.5 font-mono text-[10px] text-foreground">
                      MER = Receita / Gasto | nCAC = Gasto / Novos Clientes
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground space-y-1">
                      <p>• Densidade Semanal/Conjunto: <strong className="text-foreground">{simResult.weeklyConvPerAdSet.toFixed(1)} conv/sem</strong> (Limiar = 50)</p>
                      <p>• Vendas Projetadas ({params.closeRatePct}% conv.): <strong className="text-foreground">{fmt.num(simResult.projSalesCount)} vendas</strong></p>
                      <p>• Receita Projetada: <strong className="text-foreground">{fmt.brl(simResult.projRevenueBRL)}</strong></p>
                      <p className="pt-1 border-t border-border/50 text-foreground font-bold">
                        = nCAC: {simResult.projNCAC > 0 ? fmt.brlExact(simResult.projNCAC) : "—"} · ROAS: {simResult.projROAS.toFixed(2)}×
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            7. GRÁFICOS DE PROJEÇÃO: TRAJETÓRIA ACUMULADA & COMPARATIVO DIRETO
            ══════════════════════════════════════════════════════════════════ */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Gráfico 1: Curva de Evolução Diária (7cols) */}
          <div className="lg:col-span-7 rounded-2xl border border-border bg-card/90 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Curva de Trajetória Acumulada ({params.periodDays} Dias)
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Evolução diária de {activeObjectiveConfig.resultName} (inclui impacto de exploração Multi-Armed Bandit nos primeiros dias)
                </p>
              </div>
              <div className="flex items-center gap-3 text-[9px] font-black uppercase">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-4 rounded bg-muted-foreground/40" /> Ritmo Atual
                </span>
                <span className="flex items-center gap-1.5 text-primary">
                  <span className="h-2 w-4 rounded bg-primary" /> Curva Simulada
                </span>
              </div>
            </div>

            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trajectoryData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.12)" vertical={false} />
                  <XAxis
                    dataKey="dia"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "currentColor", opacity: 0.6 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "currentColor", opacity: 0.6 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="resBase"
                    name={`Base (${activeObjectiveConfig.resultName})`}
                    fill="rgba(148,163,184,0.15)"
                    stroke="rgba(148,163,184,0.6)"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="resProj"
                    name={`Projetado (${activeObjectiveConfig.resultName})`}
                    stroke="hsl(var(--primary))"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Gráfico 2: Comparativo Direto Atual vs Projetado (5cols) */}
          <div className="lg:col-span-5 rounded-2xl border border-border bg-card/90 p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                  Comparativo Direto: Base vs Projeção
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Verde = ganho de eficiência · Vermelho = aumento de custo/queda
                </p>
              </div>
            </div>

            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={comparisonChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  barGap={6}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(150,150,150,0.12)" vertical={false} />
                  <XAxis
                    dataKey="metric"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "currentColor", opacity: 0.7, fontWeight: 700 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "currentColor", opacity: 0.6 }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      borderColor: "hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 11,
                      color: "hsl(var(--foreground))",
                    }}
                  />
                  <Bar dataKey="Atual" name="Base Atual" fill="rgba(148,163,184,0.35)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Projetado" name="Projetado" radius={[6, 6, 0, 0]}>
                    {comparisonChartData.map((entry, i) => {
                      const isBetter = entry.inverse
                        ? entry.Projetado <= entry.Atual
                        : entry.Projetado >= entry.Atual;
                      return (
                        <Cell
                          key={i}
                          fill={isBetter ? "#10b981" : "#ef4444"}
                          fillOpacity={0.88}
                        />
                      );
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            8. TABELA DE CENÁRIOS SALVOS (COMPARAÇÃO LADO A LADO)
            ══════════════════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {scenarios.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-2xl border border-border bg-card/90 overflow-hidden shadow-sm"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-foreground">
                    Matriz Comparativa de Cenários Salvos ({scenarios.length}/4)
                  </h3>
                  <p className="text-[10px] text-muted-foreground">
                    Clique em um cenário salvo para recarregar seus parâmetros no simulador.
                  </p>
                </div>
                <button
                  onClick={() => setScenarios([])}
                  className="text-[10px] font-bold uppercase text-muted-foreground hover:text-destructive transition-colors"
                >
                  Limpar Todos
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {[
                        "Cenário",
                        "Objetivo",
                        "Budget",
                        "Diversidade",
                        "CAPI / EMQ",
                        "Pacing λ",
                        "Resultados",
                        "CPA / CPL",
                        "eCPM VCG",
                        "ROAS / Receita",
                        "",
                      ].map((h, i) => (
                        <th
                          key={i}
                          className="px-4 py-3 text-[9px] font-black uppercase tracking-wider text-muted-foreground"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {scenarios.map((sc) => (
                      <tr
                        key={sc.id}
                        onClick={() => setParams(sc.params)}
                        className="border-b border-border/50 hover:bg-muted/20 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sc.color }}
                            />
                            <span className="text-xs font-black text-foreground">{sc.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                          {sc.objectiveLabel}
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono font-bold text-foreground">
                          {(sc.params.budgetMult * 100).toFixed(0)}% ({fmt.brl(sc.result.projCost)})
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                          {sc.params.creativeDiversity}
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                          {sc.params.emqScore.toFixed(1)} ({sc.params.capiDeduplicated ? "CAPI" : "Pixel"})
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-primary font-bold">
                          λ={sc.result.shadowPriceLambda.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-xs font-black font-mono text-foreground">
                          {fmt.num(sc.result.projTotalConversions)}
                        </td>
                        <td className="px-4 py-3 text-xs font-black font-mono text-emerald-400">
                          {fmt.brlExact(sc.result.projCPA)}
                        </td>
                        <td className="px-4 py-3 text-[10px] font-mono text-muted-foreground">
                          {fmt.brlExact(sc.result.projCPM)}
                        </td>
                        <td className="px-4 py-3 text-xs font-black font-mono text-foreground">
                          {sc.result.projROAS.toFixed(2)}× ({fmt.brl(sc.result.projRevenueBRL)})
                        </td>
                        <td
                          className="px-4 py-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScenarios((prev) => prev.filter((item) => item.id !== sc.id));
                          }}
                        >
                          <button className="text-muted-foreground hover:text-destructive transition-colors p-1">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat Flutuante da Victoria AI alimentado com os cálculos do Simulador e Base Treinada */}
      <VictoriaFloatingChat
        isOpen={isVictoriaOpen}
        onClose={() => setIsVictoriaOpen(false)}
        contextItem={victoriaContext}
        accountName={
          accountId === "all"
            ? "Simulador Algorítmico Meta Ads"
            : adAccounts.find((a: any) => a.id === accountId)?.name || "Conta Meta Ads"
        }
        avgAccountCpl={baseline.cpl}
      />
    </div>
  );
}
