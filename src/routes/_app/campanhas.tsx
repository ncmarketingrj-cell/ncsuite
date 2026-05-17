import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Search, Play, Pause, Loader2, RefreshCw,
  Layers, ChevronDown, LayoutGrid, Image as ImageIcon,
  CheckSquare, Square
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Meta Ads Manager — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => ({ accountId: search.accountId as string | undefined }),
  component: MetaAdsManagerPage,
});

type Level = "campanhas" | "conjuntos" | "anuncios";

const LEVEL_TABS: { id: Level; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos de Anúncios", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

function MetaAdsManagerPage() {
  const { accountId: defaultAccountId } = Route.useSearch();
  const qc = useQueryClient();

  const [accountFilter, setAccountFilter] = useState(defaultAccountId || "all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });

  const [level, setLevel] = useState<Level>("campanhas");
  const [selectedCamps, setSelectedCamps] = useState<Set<string>>(new Set());
  const [selectedAdSets, setSelectedAdSets] = useState<Set<string>>(new Set());
  const [selectedAds, setSelectedAds] = useState<Set<string>>(new Set());
  const [changingId, setChangingId] = useState<string | null>(null);

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  const { data: campaigns = [], isLoading: isLoadingCamps } = useQuery({
    queryKey: ["meta-manager-camps", accountFilter, statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];
      let q = supabase.from("campaigns").select(`id, name, status, budget, external_id, ad_account_id, ad_account:ad_accounts(name), metrics(cost, conversions, impressions, reach, date)`);
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
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];
      let q = supabase.from("ad_sets").select(`id, name, status, budget, external_id, campaign_id, asset_metrics(cost, conversions, impressions, reach, date)`);
      q = q.in("campaign_id", Array.from(selectedCamps));
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
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];
      let q = supabase.from("ads").select(`id, name, status, external_id, campaign_id, ad_set_id, asset_metrics(cost, conversions, impressions, reach, date)`);
      if (selectedAdSets.size > 0) q = q.in("ad_set_id", Array.from(selectedAdSets));
      else if (selectedCamps.size > 0) q = q.in("campaign_id", Array.from(selectedCamps));
      else return [];
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data || []).map((c: any) => processMetrics(c, c.asset_metrics, startStr, endStr));
    }
  });

  function processMetrics(item: any, metrics: any[], startStr: string, endStr: string) {
    const m = (metrics || []).filter((x: any) => {
      if (!x.date) return true;
      const d = x.date.split("T")[0];
      return d >= startStr && d <= endStr;
    });
    const cost = m.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
    const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
    const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
    const reach = m.reduce((s: number, x: any) => s + Number(x.reach || 0), 0);
    return { ...item, t: { cost, conversions, impressions, reach } };
  }

  const syncMutation = useMutation({
    mutationFn: async () => {
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];
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
      const table = type === "campanhas" ? "campaigns" : type === "conjuntos" ? "ad_sets" : "ads";
      await supabase.from(table).update({ status: targetStatus }).eq("id", id);
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

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-1 pb-20">
      <PageHeader
        eyebrow="Hub Operacional"
        title="Meta Ads Manager"
        description="Gestão centralizada de contas e campanhas. Selecione itens para ações em massa."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
            <button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10 disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 text-primary ${syncMutation.isPending ? "animate-spin" : ""}`} /> 
              {syncMutation.isPending ? "Sincronizando..." : "Sincronizar Meta"}
            </button>
          </div>
        }
      />

      {/* FILTROS GLOBAIS */}
      <div className="glass-panel p-3 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[200px]">
          <Layers className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)} className="w-full appearance-none rounded-xl border border-white/10 bg-background/40 py-2.5 pl-9 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
            <option value="all">Todas as Contas</option>
            {adAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-4 py-2.5 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
            <option value="all">Todos os Status</option>
            <option value="active">Ativos</option>
            <option value="paused">Pausados</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${level}...`} className="w-full rounded-xl border border-white/10 bg-background/40 py-2.5 pl-10 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
        </div>
      </div>

      {/* ABAS */}
      <div className="flex gap-1 border-b border-white/5">
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

      <AnimatePresence mode="wait">
        <motion.div key={level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          
          {(level === "conjuntos" && selectedCamps.size === 0) || (level === "anuncios" && selectedCamps.size === 0 && selectedAdSets.size === 0) ? (
             <div className="glass-panel flex flex-col items-center justify-center gap-5 py-28 text-center border border-dashed border-white/10">
               <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10">
                 {level === "conjuntos" ? <LayoutGrid className="h-8 w-8 text-muted-foreground" /> : <ImageIcon className="h-8 w-8 text-muted-foreground" />}
               </div>
               <div>
                 <h3 className="text-lg font-display font-bold uppercase tracking-tight mb-2">Selecione o nível superior</h3>
                 <p className="text-sm text-muted-foreground max-w-md mx-auto">Para ver {level}, volte à aba anterior e marque o checkbox dos itens que deseja analisar.</p>
               </div>
             </div>
          ) : (
            <div className="glass-panel overflow-hidden">
              {selSet.size > 0 && (
                <div className="border-b border-white/5 bg-primary/5 px-6 py-3 flex flex-wrap items-center gap-5 text-xs">
                  <span className="font-black text-primary uppercase tracking-widest">{selSet.size} selecionados</span>
                  <span className="text-muted-foreground">Gasto: <strong className="text-foreground font-mono">R$ {totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  <span className="text-muted-foreground">Resultados: <strong className="text-secondary font-mono">{totConv}</strong></span>
                  <span className="text-muted-foreground">Alcance: <strong className="text-foreground font-mono">{totReach.toLocaleString("pt-BR")}</strong></span>
                  <button onClick={() => setSelSet(new Set())} className="ml-auto text-[9px] text-muted-foreground hover:text-foreground underline">Limpar Seleção</button>
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
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Orçamento</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-secondary">Resultados</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((c: any) => {
                        const isActive = c.status?.toUpperCase() === "ACTIVE";
                        const isChanging = changingId === c.id;
                        const isSel = selSet.has(c.id);
                        return (
                          <tr key={c.id} className={`border-b border-white/[0.03] transition-colors ${isSel ? "bg-primary/5" : "hover:bg-white/[0.015]"}`}>
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
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{(c.budget > 0) ? `R$ ${c.budget.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.t.reach > 0 ? c.t.reach.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.t.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-secondary">{c.t.conversions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary">R$ {c.t.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.02]">
                        <td colSpan={3} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">Total ({filtered.length})</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{totReach > 0 ? totReach.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{totImpr.toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-secondary text-[10px]">{totConv.toLocaleString("pt-BR")}</td>
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
    </div>
  );
}
