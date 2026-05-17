import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search, Play, Pause, Loader2, RefreshCw, Layers, ChevronDown,
  LayoutGrid, Image as ImageIcon, CheckSquare, Square, Sparkles,
  BarChart3, TrendingUp, DollarSign, Users, MousePointer2, Target, Zap
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_app/metricas")({
  head: () => ({ meta: [{ title: "Métricas Avançadas — NC Suite" }] }),
  component: MetricasAvancadasPage,
});

type Level = "campanhas" | "conjuntos" | "anuncios";
const LEVEL_TABS: { id: Level; label: string; icon: any }[] = [
  { id: "campanhas", label: "Campanhas", icon: BarChart3 },
  { id: "conjuntos", label: "Conjuntos de Anúncios", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios", icon: ImageIcon },
];

function MetricasAvancadasPage() {
  const qc = useQueryClient();
  const [accountFilter, setAccountFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<Level>("campanhas");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [changingId, setChangingId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState({
    startDate: subDays(new Date(), 29),
    endDate: new Date(),
  });

  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    },
  });

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["metricas-avancadas", accountFilter, statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];

      let q = supabase.from("campaigns").select(`
        id, name, status, budget, external_id, ad_account_id, platform,
        ad_account:ad_accounts(name),
        metrics(cost, conversions, impressions, clicks, reach, date)
      `);
      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");
      const { data, error } = await q.order("name");
      if (error) throw error;

      return (data || []).map((c: any) => {
        const m = (c.metrics || []).filter((x: any) => {
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
        const roas = cost > 0 ? (conversions * 150) / cost : 0;
        return { ...c, t: { cost, conversions, clicks, impressions, reach, cpl, ctr, cpm, cpc, freq, roas } };
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ campaignId, externalId, currentStatus }: any) => {
      if (!externalId) throw new Error("ID externo ausente.");
      const isActive = currentStatus.toUpperCase() === "ACTIVE";
      const action = isActive ? "pause" : "start";
      const targetStatus = isActive ? "PAUSED" : "ACTIVE";
      setChangingId(campaignId);
      const { data, error } = await supabase.functions.invoke("campaign-manager", {
        body: { action, payload: externalId, ad_account_id: "ALL" },
      });
      if (error) throw new Error(error.message);
      if (data?.status === "error") throw new Error("Falha Meta API");
      await supabase.from("campaigns").update({ status: targetStatus }).eq("id", campaignId);
      return targetStatus;
    },
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ["metricas-avancadas"] }); toast.success(`Campanha ${s === "ACTIVE" ? "ativada" : "pausada"}!`); },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setChangingId(null),
  });

  const filtered = useMemo(() =>
    campaigns.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase())),
    [campaigns, search]
  );

  const allSelected = filtered.length > 0 && filtered.every(c => selectedIds.has(c.id));
  const someSelected = filtered.some(c => selectedIds.has(c.id));
  const toggleAll = () => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(filtered.map(c => c.id)));
  const toggleOne = (id: string) => { const s = new Set(selectedIds); s.has(id) ? s.delete(id) : s.add(id); setSelectedIds(s); };

  const sel = selectedIds.size > 0 ? filtered.filter(c => selectedIds.has(c.id)) : filtered;
  const totCost = sel.reduce((s, c) => s + c.t.cost, 0);
  const totConv = sel.reduce((s, c) => s + c.t.conversions, 0);
  const totImpr = sel.reduce((s, c) => s + c.t.impressions, 0);
  const totReach = sel.reduce((s, c) => s + c.t.reach, 0);
  const totClicks = sel.reduce((s, c) => s + c.t.clicks, 0);
  const avgCpl = totConv > 0 ? totCost / totConv : 0;
  const avgCtr = totImpr > 0 ? (totClicks / totImpr) * 100 : 0;
  const avgCpm = totImpr > 0 ? (totCost / totImpr) * 1000 : 0;

  return (
    <div className="mx-auto max-w-[1700px] space-y-5 p-1 pb-20">
      <PageHeader
        eyebrow="Hub de Análise Técnica"
        title="Métricas Avançadas"
        description="Todos os KPIs técnicos de tráfego pago com gerenciamento em tempo real — CTR, CPM, CPC, Frequência, ROAS, CPL e mais."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker startDate={dateRange.startDate} endDate={dateRange.endDate} onChange={(s, e) => setDateRange({ startDate: s, endDate: e })} />
            <button onClick={() => refetch()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10">
              <RefreshCw className="h-3.5 w-3.5 text-primary" /> Atualizar
            </button>
          </div>
        }
      />

      {/* MINI KPI BAR */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {[
          { label: "Gasto", value: `R$ ${totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`, icon: DollarSign, color: "text-primary" },
          { label: "Resultados", value: totConv.toLocaleString("pt-BR"), icon: Target, color: "text-secondary" },
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
            <option value="all">Todas as Contas</option>
            {adAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)} className="appearance-none rounded-xl border border-white/10 bg-background/40 px-4 py-2.5 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all">
            <option value="all">Todos os Status</option>
            <option value="active">Ativas</option>
            <option value="paused">Pausadas</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar campanha..." className="w-full rounded-xl border border-white/10 bg-background/40 py-2.5 pl-10 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50" />
        </div>
      </div>

      {/* ABAS */}
      <div className="flex gap-1 border-b border-white/5">
        {LEVEL_TABS.map(tab => (
          <button key={tab.id} onClick={() => setLevel(tab.id)} className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${level === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20"}`}>
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {tab.id === "campanhas" && selectedIds.size > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black">{selectedIds.size} sel.</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {level === "campanhas" && (
            <div className="glass-panel overflow-hidden">
              {selectedIds.size > 0 && (
                <div className="border-b border-white/5 bg-primary/5 px-6 py-3 flex flex-wrap items-center gap-5 text-xs">
                  <span className="font-black text-primary uppercase tracking-widest">{selectedIds.size} selecionadas</span>
                  <span className="text-muted-foreground">Gasto: <strong className="text-foreground font-mono">R$ {totCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  <span className="text-muted-foreground">Resultados: <strong className="text-secondary font-mono">{totConv}</strong></span>
                  <span className="text-muted-foreground">CPL: <strong className="text-primary font-mono">R$ {avgCpl.toFixed(2)}</strong></span>
                  <span className="text-muted-foreground">CTR: <strong className={`font-mono ${avgCtr >= 1.5 ? "text-success" : "text-foreground"}`}>{avgCtr.toFixed(2)}%</strong></span>
                  <span className="text-muted-foreground">CPM: <strong className="text-foreground font-mono">R$ {avgCpm.toFixed(2)}</strong></span>
                  <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-[9px] text-muted-foreground hover:text-foreground underline">Limpar</button>
                </div>
              )}

              {isLoading ? (
                <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-24 text-center text-sm text-muted-foreground">Nenhuma campanha encontrada.</div>
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
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground min-w-[200px]">Campanha</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Orçamento</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Freq.</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-secondary">Resultados</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">CPL/CPA</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CTR</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CPC</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">CPM</th>
                        <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-widest text-success">ROAS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(c => {
                        const isActive = c.status?.toUpperCase() === "ACTIVE";
                        const isChanging = changingId === c.id;
                        const isSel = selectedIds.has(c.id);
                        return (
                          <tr key={c.id} className={`border-b border-white/[0.03] transition-colors ${isSel ? "bg-primary/5" : "hover:bg-white/[0.015]"}`}>
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">
                                {isSel ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                onClick={() => toggleMutation.mutate({ campaignId: c.id, externalId: c.external_id, currentStatus: c.status })}
                                disabled={isChanging || !c.external_id}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${isChanging ? "animate-pulse border-white/10 text-muted-foreground" : isActive ? "border-success/30 bg-success/10 text-success hover:bg-destructive/20 hover:text-destructive" : "border-white/10 bg-white/5 text-muted-foreground hover:bg-success/10 hover:text-success"}`}
                              >
                                {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 max-w-[220px]">
                              <p className="font-bold text-foreground/90 truncate uppercase tracking-tight" title={c.name}>{c.name}</p>
                              <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{(c as any).ad_account?.name || "—"}</p>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">R$ {(c.budget || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.reach > 0 ? c.t.reach.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-3 py-3 text-right font-mono text-muted-foreground">{c.t.freq.toFixed(2)}</td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-secondary">{c.t.conversions.toLocaleString("pt-BR")}</td>
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
                        <td className="px-3 py-3 text-right font-mono text-[10px]">—</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totReach > 0 ? totReach.toLocaleString("pt-BR") : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totImpr.toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-3 text-right font-mono text-[10px]">{totImpr > 0 && totReach > 0 ? (totImpr / totReach).toFixed(2) : "—"}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-secondary text-[10px]">{totConv.toLocaleString("pt-BR")}</td>
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

          {(level === "conjuntos" || level === "anuncios") && (
            <div className="glass-panel flex flex-col items-center justify-center gap-5 py-28 text-center">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-secondary/20 to-primary/10 flex items-center justify-center ring-1 ring-white/10">
                {level === "conjuntos" ? <LayoutGrid className="h-8 w-8 text-secondary" /> : <ImageIcon className="h-8 w-8 text-primary" />}
              </div>
              <div>
                <h3 className="text-lg font-display font-bold uppercase tracking-tight mb-2">{level === "conjuntos" ? "Conjuntos de Anúncios" : "Anúncios"}</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">Mapeamento em andamento pela IA Victoria via Graph API.</p>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-primary font-black uppercase tracking-widest">
                <Sparkles className="h-3.5 w-3.5 animate-pulse" /> Victoria AI — Em Progresso
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
