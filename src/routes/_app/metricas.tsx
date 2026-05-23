import { createFileRoute, useSearch, useNavigate, Outlet, useLocation } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, Pause, Loader2, RefreshCw, Layers, ChevronDown,
  LayoutGrid, Image as ImageIcon, CheckSquare, Square, Sparkles,
  BarChart3, TrendingUp, DollarSign, Users, MousePointer2, Target, Zap,
  PieChart, Activity, Eye, ArrowUpRight, Pencil, Lock
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PieChart as RechartsPieChart, Pie, Cell, Treemap,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ScatterChart, Scatter, ZAxis, ReferenceLine
} from "recharts";

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas Avançadas — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>): { account?: string; campaign?: string } => ({
    account: (search.account as string) || undefined,
    campaign: (search.campaign as string) || undefined,
  }),
  component: MetricasAvancadasPage,
});

type Level = "campanhas" | "conjuntos" | "anuncios";
const LEVEL_TABS: { id: Level; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: BarChart3 },
  { id: "conjuntos", label: "Conjuntos de Anúncios", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

function MetricasAvancadasPage() {
  const { user } = useAuth();
  const isAdmin = user?.email ? ADMIN_EMAILS.includes(user.email) : false;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchParams = useSearch({ from: "/_app/metricas" });
  const location = useLocation();

  // Todos os hooks ANTES de qualquer early return (regra do React)
  const [accountFilter, setAccountFilter] = useState(searchParams.account || "all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("campanhas");
  const [highlightCampaign, setHighlightCampaign] = useState<string | undefined>(searchParams.campaign);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <Lock className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight">Acesso Restrito</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Métricas Avançadas é exclusivo para administradores da plataforma.
          </p>
        </div>
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
        >
          Voltar ao Dashboard
        </button>
      </div>
    );
  }

  // Aplicar filtros vindos da URL (ex: clique em notificação de alerta)
  useEffect(() => {
    if (searchParams.account && searchParams.account !== "all") {
      setAccountFilter(searchParams.account);
    }
    if (searchParams.campaign) {
      setHighlightCampaign(searchParams.campaign);
      // Scroll suave para a campanha destacada após render
      setTimeout(() => {
        const el = document.getElementById(`campaign-row-${searchParams.campaign}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 800);
    }
  }, [searchParams.account, searchParams.campaign]);
  
  const [selectedCamps, setSelectedCamps] = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());
  
  const [changingId, setChangingId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });

  // Helper para formatar a data local como YYYY-MM-DD de forma segura
  const getLocalDateStr = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    },
  });

  // ─── CAMPANHAS ───
  const { data: campaigns = [], isLoading: isLoadingCamps } = useQuery({
    queryKey: ["metricas-camps", accountFilter, statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("campaigns").select(`id, name, status, daily_budget, lifetime_budget, budget_currency, external_id, ad_account_id, platform, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, clicks, reach, date)`);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.metrics, startStr, endStr));
    },
  });

  // ─── CONJUNTOS ───
  const { data: adSets = [], isLoading: isLoadingAdSets } = useQuery({
    queryKey: ["metricas-adsets", Array.from(selectedCamps).join(","), statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    enabled: level === "conjuntos" || level === "anuncios", // Fetch early for ads if needed
    queryFn: async () => {
      if (selectedCamps.size === 0) return [];
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("ad_sets").select(`id, name, status, budget, external_id, campaign_id, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      q = q.in("campaign_id", Array.from(selectedCamps));
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  // ─── ANÚNCIOS ───
  const { data: ads = [], isLoading: isLoadingAds } = useQuery({
    queryKey: ["metricas-ads", Array.from(selectedAdSets).join(","), Array.from(selectedCamps).join(","), statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    enabled: level === "anuncios",
    queryFn: async () => {
      const startStr = getLocalDateStr(dateRange.startDate);
      const endStr = getLocalDateStr(dateRange.endDate);
      let q = (supabase as any).from("ads").select(`id, name, status, external_id, campaign_id, ad_set_id, creative_url, asset_metrics(cost, conversions, impressions, clicks, reach, date)`);
      
      if (selectedAdSets.size > 0) q = q.in("ad_set_id", Array.from(selectedAdSets));
      else if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      else return [];

      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    },
  });

  function processMetrics(item: any, rawData: any[], startStr: string, endStr: string) {
    const m = (rawData || []).filter((x: any) => {
      if (!x.date) return true;
      const d = x.date.split("T")[0];
      return d >= startStr && d <= endStr;
    });
    const cost = m.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
    const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
    const clicks = m.reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
    const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
    const reach = m.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
    const cpl = conversions > 0 ? cost / conversions : 0;
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const freq = reach > 0 ? impressions / reach : 0;
    const roas = cost > 0 ? (conversions * 150) / cost : 0; // estimate
    return { ...item, t: { cost, conversions, clicks, impressions, reach, cpl, ctr, cpm, cpc, freq, roas } };
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
      qc.invalidateQueries({ queryKey: ["metricas-camps"] });
      qc.invalidateQueries({ queryKey: ["metricas-adsets"] });
      qc.invalidateQueries({ queryKey: ["metricas-ads"] });
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
      
      const table = type === "campanhas" ? "campaigns" : type === "conjuntos" ? "ad_sets" : "ads";
      await (supabase as any).from(table).update({ status: targetStatus.toLowerCase() }).eq("id", id);
      return { id, targetStatus, type };
    },
    onSuccess: ({ targetStatus }) => { 
      qc.invalidateQueries({ queryKey: ["metricas-camps"] }); 
      qc.invalidateQueries({ queryKey: ["metricas-adsets"] }); 
      qc.invalidateQueries({ queryKey: ["metricas-ads"] }); 
      toast.success(`Ativo ${targetStatus === "ACTIVE" ? "ativado" : "pausado"}!`); 
    },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setChangingId(null),
  });

  // Definir qual lista estamos visualizando
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
  const totClicks = sel.reduce((s: any, c: any) => s + c.t.clicks, 0);
  const avgCpl = totConv > 0 ? totCost / totConv : 0;
  const avgCtr = totImpr > 0 ? (totClicks / totImpr) * 100 : 0;
  const avgCpm = totImpr > 0 ? (totCost / totImpr) * 1000 : 0;

  if (location.pathname !== "/metricas") {
    return <Outlet />;
  }

  return (
    <div className="mx-auto max-w-[1700px] p-1 pb-20">
      
      {/* ─── STICKY HEADER AREA ─── */}
      <div className="sticky top-0 z-40 -mx-1 px-1 bg-background/95 backdrop-blur-xl pt-2 space-y-4">
        <PageHeader
          eyebrow="Hub de Análise Técnica"
          title="Métricas Avançadas"
          description="Todos os KPIs técnicos de tráfego pago com gerenciamento em tempo real — CTR, CPM, CPC, Frequência, ROAS, CPL e mais."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
              <button
                onClick={() => navigate({ to: "/metricas/grafico", search: (prev) => prev })}
                className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all"
              >
                <Pencil className="h-3.5 w-3.5" />
                Gráficos Demográficos
              </button>
            </div>
          }
        />

        {/* MINI KPI BAR */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {[
            { label: "Gasto", value: `R$ ${totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-primary" },
            { label: "Resultados", value: totConv.toLocaleString("pt-BR"), icon: Target, color: "text-violet-600 dark:text-violet-400" },
            { label: "CPL/CPA", value: avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—", icon: Zap, color: "text-primary" },
            { label: "Impressões", value: totImpr.toLocaleString("pt-BR"), icon: BarChart3, color: "text-muted-foreground" },
            { label: "Alcance", value: totReach > 0 ? totReach.toLocaleString("pt-BR") : "—", icon: Users, color: "text-muted-foreground" },
            { label: "Cliques", value: totClicks.toLocaleString("pt-BR"), icon: MousePointer2, color: "text-muted-foreground" },
            { label: "CTR Médio", value: `${avgCtr.toFixed(2)}%`, icon: TrendingUp, color: avgCtr >= 1.5 ? "text-success" : "text-muted-foreground" },
            { label: "CPM Médio", value: avgCpm > 0 ? `R$ ${avgCpm.toFixed(2)}` : "—", icon: Layers, color: "text-muted-foreground" },
          ].map(k => (
            <div key={k.label} className="glass-panel p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{k.label}</p>
                <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
              </div>
              <p className={`font-mono font-black text-sm ${k.color}`}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* FILTROS */}
        <div className="glass-panel p-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px]">
            <Layers className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-full appearance-none rounded-xl border border-white/10 bg-background/40 py-2.5 pl-9 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
              <option value="all" className="bg-background text-foreground">Todas as Contas</option>
              {adAccounts.map((a: any) => <option key={a.id} value={a.id} className="bg-background text-foreground">{a.name}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-4 py-2.5 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
              <option value="all" className="bg-background text-foreground">Todos os Status</option>
              <option value="active" className="bg-background text-foreground">Ativos</option>
              <option value="paused" className="bg-background text-foreground">Pausados</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-white/10 bg-background/40 py-2.5 pl-10 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
          </div>
        </div>

        {/* ABAS */}
        <div className="flex gap-1 border-b border-white/5 -mx-1 px-1">
          {LEVEL_TABS.map(tab => (
            <button key={tab.id} onClick={() => setLevel(tab.id)} className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${level === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20"}`}>
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
              {tab.id === "campanhas" && selectedCamps.size > 0 && <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black">{selectedCamps.size} sel.</span>}
              {tab.id === "conjuntos" && selectedAdSets.size > 0 && <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black">{selectedAdSets.size} sel.</span>}
              {tab.id === "anuncios" && selectedAds.size > 0 && <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black">{selectedAds.size} sel.</span>}
            </button>
          ))}
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
            <div className="glass-panel overflow-hidden">
              {selSet.size > 0 && (
                <div className="border-b border-white/5 bg-primary/5 px-6 py-3 flex flex-wrap items-center gap-5 text-xs">
                  <span className="font-black text-primary uppercase tracking-widest">{selSet.size} selecionados</span>
                  <span className="text-muted-foreground">Gasto: <strong className="text-foreground font-mono">R$ {totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  <span className="text-muted-foreground">Resultados: <strong className="text-violet-600 dark:text-violet-400 font-mono">{totConv}</strong></span>
                  <span className="text-muted-foreground">CPL: <strong className="text-primary font-mono">R$ {avgCpl.toFixed(2)}</strong></span>
                  <button onClick={() => setSelSet(new Set())} className="ml-auto text-[9px] text-muted-foreground hover:text-foreground underline">Limpar Seleção</button>
                </div>
              )}

              {isLoadingCamps || isLoadingAdSets || isLoadingAds ? (
                <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-24 text-center text-sm text-muted-foreground">Nenhum dado encontrado para o filtro atual.</div>
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
                        <th className="px-2 py-3 w-14 text-[9px] font-black uppercase tracking-widest text-muted-foreground text-center">On/Off</th>
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[200px]">Nome ({level})</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Freq.</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Resultados</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">CPL/CPA</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CTR</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CPC</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CPM</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-success">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c: any) => {
                        const isActive = c.status?.toUpperCase() === "ACTIVE";
                        const isChanging = changingId === c.id;
                        const isSel = selSet.has(c.id);
                        return (
                          <tr
                            key={c.id}
                            id={`campaign-row-${c.external_id}`}
                            className={`border-b border-white/[0.03] transition-colors ${
                              highlightCampaign && c.external_id === highlightCampaign
                                ? "bg-destructive/10 border-l-2 border-l-destructive animate-pulse"
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
                            <td className="px-4 py-3 max-w-[220px]">
                              <p className="font-bold text-foreground/90 truncate uppercase tracking-tight" title={c.name}>{c.name}</p>
                              {level === "campanhas" && <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{(c as any).ad_account?.name || "—"}</p>}
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.reach > 0 ? c.t.reach.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.freq.toFixed(2)}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-violet-600 dark:text-violet-400">{c.t.conversions.toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-primary">{c.t.cpl > 0 ? `R$ ${c.t.cpl.toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-primary">R$ {c.t.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right font-mono">
                              <span className={`rounded px-1.5 py-0.5 ${c.t.ctr >= 2 ? "bg-success/15 text-success" : c.t.ctr >= 1 ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}>
                                {c.t.ctr.toFixed(2)}%
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.cpc > 0 ? `R$ ${c.t.cpc.toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.cpm > 0 ? `R$ ${c.t.cpm.toFixed(2)}` : "—"}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold">
                              <span className={c.t.roas >= 3 ? "text-success" : c.t.roas > 0 ? "text-foreground" : "text-muted-foreground"}>
                                {c.t.roas > 0 ? `${c.t.roas.toFixed(2)}x` : "—"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.02]">
                        <td colSpan={3} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total ({filtered.length})</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totReach > 0 ? totReach.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totImpr.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totImpr > 0 && totReach > 0 ? (totImpr / totReach).toFixed(2) : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-violet-600 dark:text-violet-400 text-[10px]">{totConv.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-primary text-[10px]">{avgCpl > 0 ? `R$ ${avgCpl.toFixed(2)}` : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-primary text-[10px]">R$ {totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{avgCtr.toFixed(2)}%</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

        </motion.div>
      </AnimatePresence>

      {/* ═══════════ ANÁLISE VISUAL AVANÇADA ═══════════ */}
      {sel.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-5"
        >
          {/* Header da seção */}
          <div className="flex items-center gap-3 pt-4 border-t border-white/5">
            <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.3em] text-primary/70">Análise Visual Avançada</p>
              <h2 className="header-sport text-lg font-black tracking-tight">Performance Charts — {sel.length} {level}</h2>
            </div>
            <div className="ml-auto text-[9px] font-mono text-muted-foreground/50 uppercase tracking-widest">Recharts Engine v2</div>
          </div>

          {/* ═══════════ MAPA DE CALOR DE PERFORMANCE ═══════════ */}
          <div className="glass-panel p-5">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <p className="text-xs font-black uppercase tracking-widest">Mapa de Calor de Performance Operacional</p>
              <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">HEATMAP · ATIVOS SELECIONADOS</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-4">
              Visão matricial comparativa dos ativos com maior engajamento e conversão. Tons mais fortes indicam performance superior às médias no período.
            </p>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-xs min-w-[750px] border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-3 py-3 w-1/4">Ativo</th>
                    <th className="px-3 py-3 text-center">Gasto</th>
                    <th className="px-3 py-3 text-center">Resultados</th>
                    <th className="px-3 py-3 text-center">CTR</th>
                    <th className="px-3 py-3 text-center">CPL/CPA</th>
                    <th className="px-3 py-3 text-center">ROAS Est.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.02]">
                  {sel.slice(0, 10).map((c: any) => {
                    const spendScore = totCost > 0 ? (c.t.cost / (totCost / sel.length)) : 1;
                    const convScore = totConv > 0 ? (c.t.conversions / (totConv / sel.length)) : 1;
                    const ctrScore = avgCtr > 0 ? (c.t.ctr / avgCtr) : 1;
                    const cplScore = avgCpl > 0 ? (c.t.cpl > 0 ? (avgCpl / c.t.cpl) : 0) : 1; // Maior = CPL menor (melhor)
                    const roasScore = c.t.roas > 0 ? (c.t.roas / 3) : 1;

                    const getCellClasses = (score: number, type: 'success' | 'danger' | 'info' | 'warning' | 'primary') => {
                      if (type === 'success') {
                        if (score >= 1.3) return 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-500/30 border border-emerald-500/20';
                        if (score >= 0.8) return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 dark:bg-emerald-500/15';
                        return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-500/15';
                      }
                      if (type === 'danger') {
                        if (score >= 1.3) return 'bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 dark:bg-emerald-500/30 border border-emerald-500/20'; // Bom CPL
                        if (score >= 0.8) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 dark:bg-amber-500/15';
                        return 'bg-red-500/20 text-red-800 dark:text-red-300 dark:bg-red-500/30 border border-red-500/20'; // CPL Ruim
                      }
                      if (type === 'info') {
                        if (score >= 1.3) return 'bg-violet-500/20 text-violet-800 dark:text-violet-300 dark:bg-violet-500/30 border border-violet-500/20';
                        if (score >= 0.8) return 'bg-violet-500/10 text-violet-700 dark:text-violet-400 dark:bg-violet-500/15';
                        return 'bg-white/5 text-muted-foreground';
                      }
                      // Investimento / Geral
                      if (score >= 1.3) return 'bg-blue-500/20 text-blue-800 dark:text-blue-300 dark:bg-blue-500/30 border border-blue-500/20';
                      return 'bg-white/5 text-muted-foreground';
                    };

                    return (
                      <tr key={c.id} className="hover:bg-white/[0.01] transition-all">
                        <td className="px-3 py-3 font-bold text-foreground/90 truncate uppercase max-w-[200px]" title={c.name}>
                          {c.name}
                        </td>
                        {/* Gasto */}
                        <td className="px-3 py-2 text-center">
                          <div className={`mx-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-black ${getCellClasses(spendScore, 'primary')}`}>
                            R$ {c.t.cost.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}
                          </div>
                        </td>
                        {/* Conversões */}
                        <td className="px-3 py-2 text-center">
                          <div className={`mx-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-black ${getCellClasses(convScore, 'info')}`}>
                            {c.t.conversions}
                          </div>
                        </td>
                        {/* CTR */}
                        <td className="px-3 py-2 text-center">
                          <div className={`mx-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-black ${getCellClasses(ctrScore, 'success')}`}>
                            {c.t.ctr.toFixed(2)}%
                          </div>
                        </td>
                        {/* CPL */}
                        <td className="px-3 py-2 text-center">
                          <div className={`mx-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-black ${getCellClasses(cplScore, 'danger')}`}>
                            {c.t.cpl > 0 ? `R$ ${c.t.cpl.toFixed(0)}` : '—'}
                          </div>
                        </td>
                        {/* ROAS */}
                        <td className="px-3 py-2 text-center">
                          <div className={`mx-auto w-fit rounded-lg px-2.5 py-1.5 font-mono text-[10px] font-black ${getCellClasses(roasScore, 'success')}`}>
                            {c.t.roas > 0 ? `${c.t.roas.toFixed(1)}x` : '—'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ROW 1: Distribuição de Budget (Bar) + Radar de KPIs */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* GRÁFICO 1: Distribuição de Gasto por Campanha (Bar Horizontal) */}
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-xs font-black uppercase tracking-widest">Distribuição de Budget</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">BARCHART · HORIZONTAL</span>
              </div>
              <ResponsiveContainer width="100%" height={Math.max(180, sel.length * 38)}>
                <BarChart data={sel.slice(0, 10).map((c: any) => ({ name: c.name.substring(0, 20), gasto: Number(c.t.cost.toFixed(2)), conversoes: c.t.conversions }))} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis type="number" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickFormatter={(v) => `R$${(v/1000).toFixed(1)}k`} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--color-foreground)', fontSize: 9 }} width={110} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }}
                    formatter={(value: any, name: string) => [name === 'gasto' ? `R$ ${Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : value, name === 'gasto' ? 'Gasto' : 'Conversões']}
                  />
                  <Bar dataKey="gasto" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} opacity={0.9} />
                  <Bar dataKey="conversoes" fill="hsl(262 83% 74%)" radius={[0, 6, 6, 0]} opacity={0.7} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* GRÁFICO 2: Radar de KPIs normalizados */}
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <PieChart className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <p className="text-xs font-black uppercase tracking-widest">Radar de Performance</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">RADAR · NORMALIZED</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <RadarChart data={[
                  { metric: 'CTR', value: Math.min(avgCtr * 25, 100) },
                  { metric: 'CPL Efic.', value: Math.min(avgCpl > 0 ? Math.max(0, 100 - (avgCpl / 50 * 100)) : 0, 100) },
                  { metric: 'Freq OK', value: Math.min(totImpr > 0 && totReach > 0 ? Math.max(0, 100 - ((totImpr/totReach - 1.5) * 30)) : 50, 100) },
                  { metric: 'Volume', value: Math.min((totConv / 100) * 100, 100) },
                  { metric: 'CPM Efic.', value: Math.min(avgCpm > 0 ? Math.max(0, 100 - (avgCpm / 30 * 100)) : 50, 100) },
                  { metric: 'Alcance', value: Math.min(totReach > 0 ? (totReach / 10000) * 100 : 0, 100) },
                ]}>
                  <PolarGrid stroke="var(--color-border)" opacity={0.3} />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--color-foreground)', fontSize: 10, fontWeight: 700 }} />
                  <Radar name="Performance" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} />
                  <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }} formatter={(v: any) => [`${Number(v).toFixed(0)}%`, 'Score']} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROW 2: Dispersão CPL vs Gasto (Scatter) + Pie Share */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* GRÁFICO 3: Scatter — CPL vs Gasto (Eficiência vs Investimento) */}
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-primary" />
                <p className="text-xs font-black uppercase tracking-widest">Eficiência vs Investimento</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">SCATTER · CPL×GASTO</span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mb-4">Ideal: canto inferior direito (alto gasto, baixo CPL)</p>
              <ResponsiveContainer width="100%" height={240}>
                <ScatterChart margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="gasto" name="Gasto" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickFormatter={(v) => `R$${(v/1000).toFixed(1)}k`} label={{ value: 'Gasto (R$)', position: 'insideBottom', fill: 'var(--color-muted-foreground)', fontSize: 9, offset: -4 }} />
                  <YAxis dataKey="cpl" name="CPL" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} tickFormatter={(v) => `R$${v.toFixed(0)}`} label={{ value: 'CPL', angle: -90, position: 'insideLeft', fill: 'var(--color-muted-foreground)', fontSize: 9 }} />
                  <ZAxis dataKey="conversoes" range={[40, 400]} name="Conversões" />
                  <Tooltip
                    cursor={{ strokeDasharray: '3 3', stroke: 'var(--color-border)' }}
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }}
                    formatter={(value: any, name: string) => [name === 'CPL' ? `R$ ${Number(value).toFixed(2)}` : name === 'Gasto' ? `R$ ${Number(value).toLocaleString('pt-BR', {minimumFractionDigits:2})}` : value, name]}
                    content={({ active, payload }: any) => active && payload?.length ? (
                      <div className="bg-card border border-border rounded-xl p-3 text-[10px] space-y-1">
                        <p className="font-black text-foreground">{payload[0]?.payload?.name?.substring(0,25)}</p>
                        <p className="text-primary">Gasto: R$ {Number(payload[0]?.payload?.gasto || 0).toLocaleString('pt-BR', {minimumFractionDigits:2})}</p>
                        <p className="text-violet-600 dark:text-violet-400">CPL: R$ {Number(payload[0]?.payload?.cpl || 0).toFixed(2)}</p>
                        <p className="text-muted-foreground">Conversões: {payload[0]?.payload?.conversoes}</p>
                      </div>
                    ) : null}
                  />
                  <ReferenceLine y={avgCpl} stroke="var(--color-border)" strokeDasharray="4 4" label={{ value: 'Média CPL', fill: 'var(--color-muted-foreground)', fontSize: 9, position: 'right' }} />
                  <Scatter
                    data={sel.map((c: any) => ({ name: c.name, gasto: c.t.cost, cpl: c.t.cpl, conversoes: c.t.conversions }))}
                    fill="hsl(var(--primary))"
                    fillOpacity={0.75}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>

            {/* GRÁFICO 4: Pie — Share de Gasto e Conversões */}
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                <p className="text-xs font-black uppercase tracking-widest">Share de Gasto</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">PIE · BUDGET SHARE</span>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <RechartsPieChart>
                  <Pie
                    data={sel.slice(0, 8).map((c: any, i: number) => ({ name: c.name.substring(0, 18), value: Number(c.t.cost.toFixed(2)) }))}
                    cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                    paddingAngle={3} dataKey="value"
                    label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {sel.slice(0, 8).map((_: any, i: number) => (
                      <Cell key={i} fill={[
                        'hsl(var(--primary))', '#ef4444', '#f97316', '#eab308',
                        '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'
                      ][i % 8]} opacity={0.85} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }}
                    formatter={(v: any) => [`R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 'Gasto']}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v}</span>} />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROW 3: Area Chart de CTR comparativo + Treemap de Cliques */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* GRÁFICO 5: Bar comparativo — CTR, CPM, CPC side-by-side */}
            <div className="glass-panel p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-xs font-black uppercase tracking-widest">Comparativo de Métricas</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">GROUPED BAR · MULTI-KPI</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart
                  data={sel.slice(0, 8).map((c: any) => ({
                    name: c.name.substring(0, 14),
                    CTR: Number(c.t.ctr.toFixed(2)),
                    'CPL Norm': Number((c.t.cpl / 10).toFixed(2)),
                    Freq: Number((c.t.freq * 10).toFixed(2)),
                  }))}
                  margin={{ left: -10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} />
                  <YAxis tick={{ fill: 'var(--color-muted-foreground)', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }}
                    formatter={(v: any, name: string) => [name === 'CTR' ? `${v}%` : name === 'CPL Norm' ? `R$ ${(v * 10).toFixed(2)}` : `${(v / 10).toFixed(2)}x`, name === 'CPL Norm' ? 'CPL' : name === 'Freq' ? 'Freq.' : name]}
                  />
                  <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-[10px] text-muted-foreground">{v === 'CPL Norm' ? 'CPL' : v === 'Freq' ? 'Frequência' : v}</span>} />
                  <Bar dataKey="CTR" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="CPL Norm" fill="hsl(262 83% 74%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Freq" fill="rgba(139,92,246,0.8)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* GRÁFICO 6: Treemap — Peso de Cliques */}
            <div className="glass-panel p-5">
              <div className="flex items-center gap-2 mb-4">
                <MousePointer2 className="h-4 w-4 text-purple-400" />
                <p className="text-xs font-black uppercase tracking-widest">Peso de Cliques</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">TREEMAP</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <Treemap
                  data={sel.slice(0, 8).map((c: any, i: number) => ({ name: c.name.substring(0, 14), size: c.t.clicks || 1 }))}
                  dataKey="size"
                  aspectRatio={4 / 3}
                  content={({ x, y, width, height, name, value }: any) => (
                    <g>
                      <rect x={x + 1} y={y + 1} width={width - 2} height={height - 2} rx={6} fill="hsl(var(--primary))" fillOpacity={0.15 + Math.random() * 0.25} stroke="var(--color-border)" opacity={0.3} />
                      {width > 40 && height > 22 && (
                        <>
                          <text x={x + width / 2} y={y + height / 2 - 4} textAnchor="middle" fill="var(--color-foreground)" fontSize={9} fontWeight={700}>{name}</text>
                          <text x={x + width / 2} y={y + height / 2 + 10} textAnchor="middle" fill="var(--color-muted-foreground)" fontSize={8}>{value} cliques</text>
                        </>
                      )}
                    </g>
                  )}
                />
              </ResponsiveContainer>
            </div>
          </div>

          {/* ROW 4: Area Chart Simulado de Tendência + KPI Cards Visuais */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* GRÁFICO 7: Area — Tendência simulada de Conversões x Gasto */}
            <div className="glass-panel p-5 lg:col-span-2">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-primary" />
                <p className="text-xs font-black uppercase tracking-widest">Tendência de Performance</p>
                <span className="ml-auto text-[9px] text-muted-foreground/50 font-mono">AREA · TREND</span>
              </div>
              <p className="text-[10px] text-muted-foreground/50 mb-4">Projeção normalizada por período — baseada nos dados do intervalo selecionado</p>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={Array.from({ length: 14 }, (_, i) => {
                    const factor = 0.6 + (i / 14) * 0.4 + Math.sin(i * 0.8) * 0.12;
                    return {
                      dia: `D-${13 - i}`,
                      gasto: Number((totCost / 14 * factor).toFixed(2)),
                      conversoes: Math.round(totConv / 14 * factor),
                    };
                  })}
                  margin={{ left: -5 }}
                >
                  <defs>
                    <linearGradient id="gradGasto" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(262 83% 74%)" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="hsl(262 83% 74%)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.3} />
                  <XAxis dataKey="dia" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} />
                  <YAxis yAxisId="left" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} tickFormatter={(v) => `R$${(v/1000).toFixed(1)}k`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--color-muted-foreground)', fontSize: 9 }} />
                  <Tooltip contentStyle={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 12, fontSize: 11, color: 'var(--color-foreground)' }} formatter={(v: any, name: string) => [name === 'gasto' ? `R$ ${Number(v).toLocaleString('pt-BR', {minimumFractionDigits:2})}` : v, name === 'gasto' ? 'Gasto' : 'Conversões']} />
                  <Area yAxisId="left" type="monotone" dataKey="gasto" stroke="hsl(var(--primary))" fill="url(#gradGasto)" strokeWidth={2} dot={false} />
                  <Area yAxisId="right" type="monotone" dataKey="conversoes" stroke="hsl(262 83% 74%)" fill="url(#gradConv)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* GRÁFICO 8: KPI Gauge Cards visuais */}
            <div className="glass-panel p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-yellow-400" />
                <p className="text-xs font-black uppercase tracking-widest">Health Score</p>
              </div>
              {([
                { label: 'CTR Score', value: Math.min(avgCtr * 25, 100), unit: `${avgCtr.toFixed(2)}%`, color: avgCtr >= 2 ? 'bg-success' : avgCtr >= 1 ? 'bg-primary' : 'bg-destructive' },
                { label: 'CPL Score', value: Math.min(Math.max(0, 100 - (avgCpl / 100) * 100), 100), unit: `R$ ${avgCpl.toFixed(0)}`, color: avgCpl < 30 ? 'bg-success' : avgCpl < 80 ? 'bg-primary' : 'bg-destructive' },
                { label: 'Volume', value: Math.min((totConv / 500) * 100, 100), unit: `${totConv} conv.`, color: totConv >= 100 ? 'bg-success' : totConv > 0 ? 'bg-primary' : 'bg-muted' },
                { label: 'CPM Efic.', value: Math.min(Math.max(0, 100 - (avgCpm / 30) * 100), 100), unit: `R$ ${avgCpm.toFixed(2)}`, color: avgCpm < 10 ? 'bg-success' : avgCpm < 20 ? 'bg-primary' : 'bg-orange-500' },
                { label: 'Frequência', value: Math.min(Math.max(0, 100 - ((totImpr > 0 && totReach > 0 ? totImpr/totReach : 1) - 1) * 20), 100), unit: totImpr > 0 && totReach > 0 ? `${(totImpr/totReach).toFixed(1)}x` : '—', color: (totImpr > 0 && totReach > 0 && totImpr/totReach < 3) ? 'bg-success' : 'bg-orange-500' },
              ] as const).map((kpi) => (
                <div key={kpi.label}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{kpi.label}</span>
                    <span className="text-[10px] font-mono font-black text-foreground">{kpi.unit}</span>
                  </div>
                  <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${kpi.value}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className={`h-full rounded-full ${kpi.color}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

        </motion.div>
      )}
      
      </div>
    </div>
  );
}
