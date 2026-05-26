import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Search, Play, Pause, Loader2, RefreshCw,
  Layers, ChevronDown, LayoutGrid, Image as ImageIcon,
  CheckSquare, Square, Pencil, FlaskConical, X,
  BookOpen, MessageCircle, Car, Target, Video, Users, Zap
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Meta Ads Manager — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>): { accountId?: string; date?: string; campId?: string } => ({
    accountId: search.accountId as string | undefined,
    date: search.date as string | undefined,
    campId: search.campId as string | undefined,
  }),
  component: MetaAdsManagerPage,
});

type Level = "campanhas" | "conjuntos" | "anuncios";

const OBJECTIVE_MAP: Record<string, { label: string; color: string; icon: any }> = {
  OUTCOME_LEADS:      { label: "Leads",      color: "text-violet-500 bg-violet-500/10 border-violet-500/20", icon: Target },
  LEAD_GENERATION:    { label: "Leads",      color: "text-violet-500 bg-violet-500/10 border-violet-500/20", icon: Target },
  MESSAGES:           { label: "Mensagens",  color: "text-blue-500 bg-blue-500/10 border-blue-500/20",       icon: MessageCircle },
  OUTCOME_ENGAGEMENT: { label: "Engaj.",     color: "text-pink-500 bg-pink-500/10 border-pink-500/20",       icon: Zap },
  OUTCOME_TRAFFIC:    { label: "Tráfego",    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",   icon: Car },
  LINK_CLICKS:        { label: "Tráfego",    color: "text-amber-500 bg-amber-500/10 border-amber-500/20",   icon: Car },
  VIDEO_VIEWS:        { label: "Vídeo",      color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20",      icon: Video },
  OUTCOME_AWARENESS:  { label: "Awareness",  color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20", icon: Users },
  OUTCOME_SALES:      { label: "Vendas",     color: "text-primary bg-primary/10 border-primary/20",         icon: Target },
  CONVERSIONS:        { label: "Conversões", color: "text-primary bg-primary/10 border-primary/20",         icon: Target },
};

const PLACEMENT_MAP: Record<string, string> = {
  feed: "Feed", story: "Stories", reels: "Reels", marketplace: "Marketplace",
  search: "Busca", video_feeds: "Video Feeds", profile_feed: "Perfil",
  right_hand_column: "Coluna Direita", instant_article: "Instant Article",
};
const PUBLISHER_MAP: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram",
  audience_network: "Audience Network", messenger: "Messenger",
};
const PUBLISHER_COLOR: Record<string, string> = {
  facebook: "bg-blue-600/15 text-blue-400 border border-blue-600/20",
  instagram: "bg-pink-500/15 text-pink-400 border border-pink-500/20",
  audience_network: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/20",
  messenger: "bg-violet-500/15 text-violet-400 border border-violet-500/20",
};

function ObjectiveBadge({ objective }: { objective?: string }) {
  if (!objective) return null;
  const def = OBJECTIVE_MAP[objective];
  if (!def) return <span className="text-[8px] font-mono text-muted-foreground/60 uppercase">{objective.replace("OUTCOME_", "")}</span>;
  const Icon = def.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider ${def.color}`}>
      <Icon className="h-2.5 w-2.5" />
      {def.label}
    </span>
  );
}

function LearningBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-wider text-amber-500 animate-pulse">
      <BookOpen className="h-2.5 w-2.5" />
      Aprendendo
    </span>
  );
}

const LEVEL_TABS: { id: Level; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos de Anúncios", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

function MetaAdsManagerPage() {
  const { accountId: defaultAccountId, date: filterDate, campId: alertCampId } = Route.useSearch();
  const highlightRowRef = useRef<HTMLTableRowElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [accountFilter, setAccountFilter] = useState(defaultAccountId || "all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [dateRange, setDateRange] = useState(() => {
    if (filterDate) {
      const parsed = new Date(filterDate + "T12:00:00");
      if (!isNaN(parsed.getTime())) {
        return { startDate: parsed, endDate: parsed };
      }
    }
    return { startDate: subDays(new Date(), 29), endDate: new Date() };
  });

  const [level, setLevel] = useState<Level>("campanhas");
  const [selectedCamps, setSelectedCamps] = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());
  const [changingId, setChangingId] = useState<string | null>(null);

  // Sincroniza query params com o estado interno reativamente
  useEffect(() => {
    if (defaultAccountId) {
      setAccountFilter(defaultAccountId);
    }
  }, [defaultAccountId]);

  useEffect(() => {
    if (filterDate) {
      const parsed = new Date(filterDate + "T12:00:00");
      if (!isNaN(parsed.getTime())) {
        setDateRange({ startDate: parsed, endDate: parsed });
      }
    }
  }, [filterDate]);

  // Scroll to + highlight alerted campaign once data renders
  useEffect(() => {
    if (!alertCampId) return;
    const t = setTimeout(() => {
      highlightRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 600);
    return () => clearTimeout(t);
  }, [alertCampId]);


  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  // Helper para formatar a data local como YYYY-MM-DD de forma segura
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const { data: campaigns = [], isLoading: isLoadingCamps } = useQuery({
    queryKey: ["meta-manager-camps", accountFilter, statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any)
        .from("campaigns").select(`id, name, status, delivery_status, objective, daily_budget, lifetime_budget, budget_currency, external_id, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, reach, frequency, date)`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.metrics, startStr, endStr));
    }
  });

  const { data: adSets = [], isLoading: isLoadingAdSets } = useQuery({
    queryKey: ["meta-manager-adsets", Array.from(selectedCamps).join(","), statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    enabled: level === "conjuntos" || level === "anuncios",
    queryFn: async () => {
      if (selectedCamps.size === 0) return [];
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("ad_sets").select(`
        id, name, status, budget, external_id, campaign_id,
        asset_metrics(cost, conversions, impressions, clicks, reach, date)
      `);q = q.in("campaign_id", Array.from(selectedCamps));
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    }
  });

  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ["meta-manager-ads", Array.from(selectedAdSets).join(","), Array.from(selectedCamps).join(","), statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    enabled: level === "anuncios",
    queryFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("ads").select(`
        id, name, status, external_id, campaign_id, ad_set_id, creative_url,
        asset_metrics(cost, conversions, impressions, clicks, reach, date)
      `);if (selectedAdSets.size > 0) q = q.in("ad_set_id", Array.from(selectedAdSets));
      else if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      else return [];
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    }
  });

  const { data: placementData = [] } = useQuery({
    queryKey: ["placement-breakdown", accountFilter, Array.from(selectedCamps).sort().join(","), dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    enabled: level === "campanhas",
    queryFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("placement_metrics")
        .select("placement, publisher, impressions, clicks, spend, conversions, reach")
        .gte("date", startStr).lte("date", endStr);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      const { data } = await q;
      const grouped: Record<string, any> = {};
      (data || []).forEach((r: any) => {
        const key = `${r.placement}|${r.publisher}`;
        if (!grouped[key]) grouped[key] = { placement: r.placement, publisher: r.publisher, impressions: 0, clicks: 0, spend: 0, conversions: 0, reach: 0 };
        grouped[key].impressions += Number(r.impressions || 0);
        grouped[key].clicks += Number(r.clicks || 0);
        grouped[key].spend += Number(r.spend || 0);
        grouped[key].conversions += Number(r.conversions || 0);
        grouped[key].reach += Number(r.reach || 0);
      });
      return Object.values(grouped)
        .sort((a: any, b: any) => b.spend - a.spend)
        .map((g: any) => ({
          ...g,
          cpl: g.conversions > 0 ? g.spend / g.conversions : 0,
          ctr: g.impressions > 0 ? (g.clicks / g.impressions * 100) : 0,
        }));
    }
  });

  function processMetrics(item: any, rawData: any[], startStr: string, endStr: string) {
    const m = (rawData || []).filter((x: any) => {
      if (!x.date) return true;
      const d = x.date.split("T")[0];
      return d >= startStr && d <= endStr;
    });
    const cost = m.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
    const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
    const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
    const reach = m.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
    const clicks = m.reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);

    let frequency = 0;
    const freqRows = m.filter((x: any) => Number(x.frequency) > 0);
    if (freqRows.length > 0) {
      // Campanhas: usa a frequência diária armazenada pelo sync (média dos dias)
      frequency = freqRows.reduce((s: number, x: any) => s + Number(x.frequency), 0) / freqRows.length;
    } else {
      // Adsets/Anúncios (asset_metrics não tem coluna frequency):
      // calcula freq por dia = impressions_dia / reach_dia e tira a média.
      // SUM(impressions)/SUM(reach) é ERRADO porque reach diário != alcance único do período.
      const dailyFreqs = m
        .filter((x: any) => Number(x.reach) > 0 && Number(x.impressions) > 0)
        .map((x: any) => Number(x.impressions) / Number(x.reach));
      frequency = dailyFreqs.length > 0
        ? dailyFreqs.reduce((s: number, f: number) => s + f, 0) / dailyFreqs.length
        : 0;
    }

    return { ...item, t: { cost, conversions, impressions, reach, clicks, frequency } };
  }

  const syncMutation = useMutation({
    mutationFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      const payload: any = { time_range: { since: startStr, until: endStr } };
      if (accountFilter !== "all") payload.account_id = accountFilter;
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: payload });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-manager-camps"] });
      qc.invalidateQueries({ queryKey: ["meta-manager-adsets"] });
      qc.invalidateQueries({ queryKey: ["meta-manager-ads"] });
      toast.success("Sincronizado com Meta Ads com sucesso!");
    },
    onError: (e: any) => toast.error(`Erro ao sincronizar: ${e.message}`)
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, externalId, currentStatus, type }: any) => {
      if (!externalId) throw new Error("ID externo ausente.");
      const isActive = currentStatus.toUpperCase() === "ACTIVE";
      const targetStatus = isActive ? "PAUSED" : "ACTIVE";
      setChangingId(id);

      // 1. Alterar status real no Facebook Ads
      const { data, error: apiErr } = await supabase.functions.invoke("sync-meta-ads", {
        body: {
          action: "toggle-status",
          external_id: externalId,
          status: targetStatus
        }
      });
      if (apiErr) throw apiErr;
      if (data?.error) throw new Error(data.error);

      // 2. Alterar status local no banco de dados local
      const table = type === "campanhas" ? "campaigns" : type === "conjuntos" ? "ad_sets" : "ads";
      await (supabase as any).from(table).update({ status: targetStatus.toLowerCase() }).eq("id", id);
      return { id, targetStatus, type };
    },
    onSuccess: ({ targetStatus }) => { 
      qc.invalidateQueries({ queryKey: ["meta-manager-camps"] }); 
      qc.invalidateQueries({ queryKey: ["meta-manager-adsets"] }); 
      qc.invalidateQueries({ queryKey: ["meta-manager-ads"] }); 
      toast.success(`Ativo ${targetStatus === "ACTIVE" ? "ativado" : "pausado"}!`); 
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setChangingId(null),
  });

  const [auditData, setAuditData] = useState<any[] | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);

  const runAudit = async () => {
    setIsAuditing(true);
    try {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      const payload: any = { action: "audit", time_range: { since: startStr, until: endStr } };
      if (accountFilter !== "all") payload.account_id = accountFilter;
      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body: payload });
      if (error) throw new Error(error.message);
      setAuditData(data?.audit || []);
    } catch (e: any) {
      toast.error(`Auditoria falhou: ${e.message}`);
    } finally {
      setIsAuditing(false);
    }
  };

  const listData = level === "campanhas" ? campaigns : level === "conjuntos" ? adSets : ads;
  const filtered = useMemo(() => listData.filter((c: any) => !search || c.name?.toLowerCase().includes(search.toLowerCase())), [listData, search]);

  const selSet = level === "campanhas" ? selectedCamps : level === "conjuntos" ? selectedAdSets : selectedAds;
  const setSelSet = level === "campanhas" ? setSelectedCamps : level === "conjuntos" ? setSelectedAdSets : setSelectedAds;

  const allSelected = filtered.length > 0 && filtered.every((c: any) => selSet.has(c.id));
  const someSelected = filtered.some((c: any) => selSet.has(c.id));
  
  const toggleAll = () => allSelected ? setSelSet(new Set()) : setSelSet(new Set(filtered.map((c: any) => c.id)));
  const toggleOne = (id: string) => { const s = new Set(selSet); s.has(id) ? s.delete(id) : s.add(id); setSelSet(s); };

  const sel = selSet.size > 0 ? filtered.filter((c: any) => selSet.has(c.id)) : filtered;
  const totCost = sel.reduce((s: any, c: any) => s + c.t.cost, 0);
  const totConv = sel.reduce((s: any, c: any) => s + c.t.conversions, 0);
  const totImpr = sel.reduce((s: any, c: any) => s + c.t.impressions, 0);
  const totReach = sel.reduce((s: any, c: any) => s + c.t.reach, 0);
  const totCpl = totConv > 0 ? totCost / totConv : 0;

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-20">
      
      {/* ─── STICKY HEADER AREA ─── */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl pt-2 space-y-2">

        {/* Linha 1: título + botões de ação (scrollável no mobile) */}
        <div className="flex items-center justify-between gap-3 pb-1">
          <div className="min-w-0">
            <div className="kpi-tag mb-0.5 text-[9px]">Hub Operacional</div>
            <h1 className="header-sport font-display text-lg sm:text-2xl lg:text-3xl font-black tracking-tight leading-none">Meta Ads Manager</h1>
          </div>
          {/* Botões: scroll horizontal no mobile */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide shrink-0 max-w-[60%] sm:max-w-none">
            <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
            <button
              onClick={() => navigate({ to: "/metricas/grafico", search: { account: accountFilter === "all" ? undefined : accountFilter, campaign: undefined } })}
              className="shrink-0 flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-bold text-primary hover:bg-primary/20 transition-all"
            >
              <Pencil className="h-3 w-3" />
              <span className="hidden sm:inline">Gráficos Demográficos</span>
              <span className="sm:hidden">Gráficos</span>
            </button>
            <button
              onClick={runAudit}
              disabled={isAuditing}
              className="shrink-0 flex items-center gap-1.5 rounded-xl border border-orange-400/30 bg-orange-400/10 px-3 py-2 text-[11px] font-bold text-orange-400 hover:bg-orange-400/20 transition-all disabled:opacity-50"
              title="Diagnóstico Meta"
            >
              {isAuditing ? <Loader2 className="h-3 w-3 animate-spin" /> : <FlaskConical className="h-3 w-3" />}
              <span className="hidden sm:inline">Diagnóstico Meta</span>
            </button>
          </div>
        </div>

        {/* Linha 2: Filtros — scroll horizontal no mobile */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
          <div className="relative shrink-0">
            <Layers className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="appearance-none rounded-xl border border-white/10 bg-background/40 py-2 pl-7 pr-6 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
              <option value="all" className="bg-background text-foreground">Todas as Contas</option>
              {adAccounts.map((a: any) => <option key={a.id} value={a.id} className="bg-background text-foreground">{a.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative shrink-0">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-3 py-2 pr-7 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
              <option value="all" className="bg-background text-foreground">Todos</option>
              <option value="active" className="bg-background text-foreground">Ativos</option>
              <option value="paused" className="bg-background text-foreground">Pausados</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative flex-1 min-w-[140px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-white/10 bg-background/40 py-2 pl-8 pr-3 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
          </div>
        </div>

        {/* Linha 3: Abas — scroll horizontal no mobile */}
        <div className="flex gap-0 overflow-x-auto scrollbar-hide border-b border-white/5">
          {LEVEL_TABS.map(tab => {
            const shortLabel = tab.id === "campanhas" ? "Camps." : tab.id === "conjuntos" ? "Conjuntos" : "Anúncios";
            const selCount = tab.id === "campanhas" ? selectedCamps.size : tab.id === "conjuntos" ? selectedAdSets.size : selectedAds.size;
            return (
              <button
                key={tab.id}
                onClick={() => setLevel(tab.id)}
                className={`shrink-0 flex items-center gap-1.5 px-3 sm:px-5 py-2.5 text-[10px] sm:text-[11px] font-black uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${level === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20"}`}
              >
                <tab.icon className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" />
                <span className="sm:hidden">{shortLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {selCount > 0 && <span className="rounded-full bg-primary/20 text-primary px-1.5 py-0.5 text-[9px] font-black">{selCount}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="pt-4 space-y-5">
      <AnimatePresence mode="wait">
        <motion.div key={level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          
          {(level === "conjuntos" && selectedCamps.size === 0) || (level === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0) ? (
             <div className="glass-panel flex flex-col items-center justify-center gap-5 py-28 text-center border border-dashed border-white/10">
               <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                 {level === "conjuntos" ? <LayoutGrid className="h-8 w-8 text-muted-foreground" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
               </div>
               <div>
                 <h3 className="header-sport text-lg font-display font-bold uppercase tracking-tight mb-2">Selecione o nível superior</h3>
                 <p className="text-sm text-muted-foreground max-w-md mx-auto">Para ver {level}, volte à aba anterior e marque o checkbox dos itens que deseja analisar.</p>
               </div>
             </div>
          ) : (
            <div className="glass-panel card-sport overflow-hidden">
              {selSet.size > 0 && (
                <div className="border-b border-white/5 bg-primary/5 px-4 py-2.5 flex items-center gap-3 overflow-x-auto scrollbar-hide text-xs">
                  <span className="shrink-0 font-black text-primary uppercase tracking-widest text-[11px]">{selSet.size} sel.</span>
                  <span className="shrink-0 text-muted-foreground text-[11px]">R$ <strong className="text-foreground font-mono">{totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  <span className="shrink-0 text-[11px]"><strong className="text-violet-600 dark:text-violet-400 font-mono">{totConv}</strong> <span className="text-muted-foreground">res.</span></span>
                  <span className="shrink-0 text-muted-foreground text-[11px]">Alc. <strong className="text-foreground font-mono">{totReach.toLocaleString("pt-BR")}</strong></span>
                  <button onClick={() => setSelSet(new Set())} className="ml-auto shrink-0 text-[9px] text-muted-foreground hover:text-foreground underline">Limpar</button>
                </div>
              )}

              {isLoadingCamps || isLoadingAdSets || isLoadingAds ? (
                <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-24 text-center text-sm text-muted-foreground">Nenhum dado encontrado.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-white/5 bg-white/[0.02]">
                        <th className="px-4 py-3 w-10">
                          <button onClick={toggleAll} className="text-muted-foreground hover:text-primary transition">
                            {allSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : someSelected ? <CheckSquare className="h-4 w-4 text-primary/50" /> : <Square className="h-4 w-4" />}
                          </button>
                        </th>
                        <th className="px-2 py-3 w-16 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">Status</th>
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Nome ({level})</th>
                        {level === "campanhas" && <th className="px-3 py-3 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground">Objetivo</th>}
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Orçamento</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-amber-500">Freq.</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Resultados</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-emerald-500">CPL</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c: any) => {
                        const isActive = c.status?.toUpperCase() === "ACTIVE";
                        const isLearning = c.delivery_status === "LEARNING";
                        const isChanging = changingId === c.id;
                        const isSel = selSet.has(c.id);
                        const isAlerted = alertCampId === c.id;
                        const cpl = c.t.conversions > 0 ? c.t.cost / c.t.conversions : 0;
                        const freq = c.t.frequency ?? 0;
                        const freqHigh = freq >= 3.5;
                        return (
                          <tr
                            key={c.id}
                            ref={isAlerted ? highlightRowRef : undefined}
                            className={`border-b border-white/[0.03] transition-colors ${
                              isAlerted
                                ? "bg-destructive/10 ring-1 ring-inset ring-destructive/40"
                                : isSel ? "bg-primary/5" : "hover:bg-white/[0.015]"
                            }`}
                          >
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">
                                {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                onClick={() => toggleMutation.mutate({ id: c.id, externalId: c.external_id, currentStatus: c.status, type: level })}
                                disabled={isChanging || !c.external_id}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${isChanging ? "animate-pulse border-white/10 text-muted-foreground" : isActive ? "border-success/30 bg-success/10 text-success hover:bg-destructive/20 hover:text-destructive" : "border-white/10 bg-white/5 text-muted-foreground hover:bg-success/10 hover:text-success"}`}
                              >
                                {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 max-w-[260px]">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-foreground/90 truncate uppercase tracking-tight" title={c.name}>{c.name}</p>
                                {isLearning && <LearningBadge />}
                              </div>
                              {level === "campanhas" && <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{(c as any).ad_account?.name || "—"}</p>}
                            </td>
                            {level === "campanhas" && (
                              <td className="px-3 py-3 text-center">
                                <ObjectiveBadge objective={c.objective} />
                              </td>
                            )}
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.daily_budget > 0 ? `R$ ${c.daily_budget.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}/dia` : c.lifetime_budget > 0 ? `R$ ${c.lifetime_budget.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} total` : "—"}</td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${freqHigh ? "text-destructive" : freq > 0 ? "text-amber-500" : "text-muted-foreground"}`}>
                              {freq > 0 ? (
                                <span title={freqHigh ? "⚠ Frequência alta — risco de saturação" : undefined}>
                                  {freqHigh && "⚠ "}{freq.toFixed(1)}×
                                </span>
                              ) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.t.reach > 0 ? c.t.reach.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.t.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-violet-600 dark:text-violet-400">{c.t.conversions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-emerald-500">R$ {cpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary">R$ {c.t.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.02]">
                        <td colSpan={3} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total ({filtered.length})</td>
                        {level === "campanhas" && <td className="px-3 py-3" />}
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{totReach > 0 ? totReach.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{totImpr.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-violet-600 dark:text-violet-400 text-[10px]">{totConv.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-500 text-[10px]">R$ {totCpl.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-primary text-[10px]">R$ {totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ─── PAINEL DE DIAGNÓSTICO ─── */}
      {auditData && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 glass-panel card-sport overflow-hidden">
          <div className="flex items-center justify-between border-b border-border/50 px-5 py-3">
            <p className="header-sport text-xs font-black uppercase tracking-widest text-orange-400">Diagnóstico Meta — Action Types Recebidos por Campanha</p>
            <button onClick={() => setAuditData(null)} className="rounded-lg p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
          <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead className="sticky top-0 bg-background/90 backdrop-blur">
                <tr className="border-b border-border/50">
                  <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-muted-foreground">Campanha</th>
                  <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-muted-foreground">Objetivo</th>
                  <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-muted-foreground">Data</th>
                  <th className="px-3 py-2 text-right font-black uppercase tracking-wider text-orange-400">App conta</th>
                  <th className="px-3 py-2 text-left font-black uppercase tracking-wider text-muted-foreground">Todos action_types (compare com Gerenciador)</th>
                </tr>
              </thead>
              <tbody>
                {auditData.map((row: any, i: number) => (
                  <tr key={i} className="border-b border-border/20 hover:bg-white/[0.015]">
                    <td className="px-3 py-2 font-semibold max-w-[200px] truncate" title={row.campaign_name}>{row.campaign_name}</td>
                    <td className="px-3 py-2 font-mono text-primary">{row.objective ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{row.date}</td>
                    <td className="px-3 py-2 text-right font-mono font-black text-orange-400">{row.app_conversions}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1.5">
                        {(row.all_actions || []).filter((a: any) => parseFloat(a.value) > 0).map((a: any, j: number) => (
                          <span key={j} className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[9px]">
                            <span className="text-primary">{a.action_type}</span>
                            <span className="text-foreground font-black ml-1">{a.value}</span>
                            {a["7d_click"] && a["7d_click"] !== a.value && <span className="text-muted-foreground ml-1">(7d:{a["7d_click"]})</span>}
                          </span>
                        ))}
                        {(row.all_actions || []).filter((a: any) => parseFloat(a.value) > 0).length === 0 && (
                          <span className="text-muted-foreground italic">nenhuma action com valor &gt; 0</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-3 text-[9px] text-muted-foreground/60">Compare a coluna "App conta" com a coluna "Resultados" do Meta Ads Manager. O action_type correto deve ter o mesmo número.</p>
        </motion.div>
      )}
      {/* ─── PLACEMENT BREAKDOWN ─── */}
      {level === "campanhas" && placementData.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport overflow-hidden">
          <div className="flex items-center gap-3 border-b border-white/5 px-5 py-3">
            <Layers className="h-4 w-4 text-violet-400" />
            <p className="text-xs font-black uppercase tracking-widest header-sport">Breakdown por Placement</p>
            <span className="ml-auto text-[9px] text-muted-foreground/50">
              {selectedCamps.size > 0 ? `${selectedCamps.size} campanha(s) selecionada(s)` : "Todas as campanhas no período"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Placement</th>
                  <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Plataforma</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CTR</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-violet-400">Conv.</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-emerald-500">CPL</th>
                  <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const maxSpend = Math.max(...placementData.map((r: any) => r.spend), 1);
                  return placementData.map((p: any, i: number) => {
                    const spendPct = (p.spend / maxSpend) * 100;
                    return (
                      <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.015] transition-colors">
                        <td className="px-4 py-2.5 font-bold capitalize">{PLACEMENT_MAP[p.placement] || p.placement}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex items-center rounded px-2 py-0.5 text-[9px] font-bold ${PUBLISHER_COLOR[p.publisher] || "bg-white/5 text-muted-foreground"}`}>
                            {PUBLISHER_MAP[p.publisher] || p.publisher}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">{p.impressions.toLocaleString("pt-BR")}</td>
                        <td className={`px-4 py-2.5 text-right font-mono ${p.ctr >= 2 ? "text-emerald-500 font-bold" : p.ctr >= 1 ? "text-foreground" : "text-muted-foreground"}`}>{p.ctr.toFixed(2)}%</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-violet-400">{p.conversions}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-500">{p.cpl > 0 ? `R$ ${p.cpl.toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 rounded-full bg-white/5 overflow-hidden">
                              <div className="h-full rounded-full bg-primary" style={{ width: `${spendPct}%` }} />
                            </div>
                            <span className="font-mono font-bold text-primary">R$ {p.spend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
          <p className="px-5 py-2.5 text-[9px] text-muted-foreground/40 border-t border-white/5">
            Dados atualizados a cada sincronização · Selecione campanhas acima para filtrar por campanha específica
          </p>
        </motion.div>
      )}
      </div>
    </div>
  );
}
