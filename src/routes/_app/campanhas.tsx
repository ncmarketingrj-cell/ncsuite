import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Megaphone, Search, Play, Pause, Loader2, RefreshCw,
  Layers, ChevronDown, LayoutGrid, Image as ImageIcon,
  CheckSquare, Square, ArrowUpDown, DollarSign, Users, MousePointer,
  Eye, Target, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { subDays } from "date-fns";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Meta Ads Manager — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    accountId: search.accountId as string | undefined,
  }),
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
  const navigate = useNavigate({ from: Route.id });
  const qc = useQueryClient();

  // === FILTROS GLOBAIS ===
  const [accountFilter, setAccountFilter] = useState(defaultAccountId || "all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "paused">("all");
  const [dateRange, setDateRange] = useState({ startDate: subDays(new Date(), 29), endDate: new Date() });

  // === ESTADO DE NÍVEL E SELEÇÃO CRUZADA ===
  const [level, setLevel] = useState<Level>("campanhas");
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<Set<string>>(new Set());
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  // === QUERIES ===
  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["meta-manager-campaigns", accountFilter, statusFilter, dateRange.startDate.toISOString(), dateRange.endDate.toISOString()],
    queryFn: async () => {
      const startStr = dateRange.startDate.toISOString().split("T")[0];
      const endStr = dateRange.endDate.toISOString().split("T")[0];

      let q = supabase
        .from("campaigns")
        .select(`
          id, name, status, budget, external_id, ad_account_id, platform,
          ad_account:ad_accounts(name),
          metrics(cost, conversions, impressions, clicks, date)
        `);

      if (accountFilter !== "all") q = q.eq("ad_account_id", accountFilter);
      if (statusFilter !== "all") q = q.ilike("status", statusFilter === "active" ? "ACTIVE" : "PAUSED");

      const { data, error } = await q.order("name");
      if (error) throw error;

      return (data || []).map((c: any) => {
        const filtered = (c.metrics || []).filter((m: any) => {
          if (!m.date) return true;
          const d = m.date.split("T")[0];
          return d >= startStr && d <= endStr;
        });
        const cost = filtered.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const conversions = filtered.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const clicks = filtered.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
        const impressions = filtered.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const cpl = conversions > 0 ? cost / conversions : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpm = impressions > 0 ? (cost / impressions) * 1000 : 0;
        return { ...c, totals: { cost, conversions, clicks, impressions, cpl, ctr, cpm } };
      });
    }
  });

  // Play/Pause campanha no Meta
  const toggleMutation = useMutation({
    mutationFn: async ({ campaignId, externalId, currentStatus }: { campaignId: string; externalId: string; currentStatus: string }) => {
      if (!externalId) throw new Error("ID externo do Meta ausente.");
      const isActive = currentStatus.toUpperCase() === "ACTIVE";
      const action = isActive ? "pause" : "start";
      const targetStatus = isActive ? "PAUSED" : "ACTIVE";
      setChangingStatusId(campaignId);
      const { data, error } = await supabase.functions.invoke("campaign-manager", {
        body: { action, payload: externalId, ad_account_id: "ALL" }
      });
      if (error) throw new Error(error.message);
      if (data?.status === "error") throw new Error(data.results?.[0]?.error || "Falha Meta API");
      await supabase.from("campaigns").update({ status: targetStatus }).eq("id", campaignId);
      return targetStatus;
    },
    onSuccess: (s) => { qc.invalidateQueries({ queryKey: ["meta-manager-campaigns"] }); toast.success(`Campanha ${s === "ACTIVE" ? "ativada" : "pausada"}!`); },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setChangingStatusId(null),
  });

  // === FILTRO POR TEXTO E SELEÇÃO ===
  const filteredCampaigns = useMemo(() =>
    campaigns.filter(c => !search || c.name?.toLowerCase().includes(search.toLowerCase())),
    [campaigns, search]
  );

  const allSelected = filteredCampaigns.length > 0 && filteredCampaigns.every(c => selectedCampaignIds.has(c.id));
  const someSelected = filteredCampaigns.some(c => selectedCampaignIds.has(c.id));

  const toggleAll = () => {
    if (allSelected) setSelectedCampaignIds(new Set());
    else setSelectedCampaignIds(new Set(filteredCampaigns.map(c => c.id)));
  };

  const toggleOne = (id: string) => {
    const s = new Set(selectedCampaignIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedCampaignIds(s);
  };

  // Totais da seleção ou de todos
  const activeCampaigns = selectedCampaignIds.size > 0
    ? filteredCampaigns.filter(c => selectedCampaignIds.has(c.id))
    : filteredCampaigns;

  const totalCost = activeCampaigns.reduce((s, c) => s + c.totals.cost, 0);
  const totalConversions = activeCampaigns.reduce((s, c) => s + c.totals.conversions, 0);
  const totalImpressions = activeCampaigns.reduce((s, c) => s + c.totals.impressions, 0);
  const totalCpl = totalConversions > 0 ? totalCost / totalConversions : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-1 pb-20">
      <PageHeader
        eyebrow="Gerenciador de Anúncios"
        title="Meta Ads Manager"
        description="Gerencie e analise campanhas, conjuntos e anúncios com visão unificada por período personalizado."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              onChange={(start, end) => setDateRange({ startDate: start, endDate: end })}
            />
            <button onClick={() => refetch()} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest transition hover:border-primary/40 hover:bg-white/10">
              <RefreshCw className="h-3.5 w-3.5 text-primary" /> Atualizar
            </button>
          </div>
        }
      />

      {/* BARRA DE FILTROS GLOBAL */}
      <div className="glass-panel p-3 flex flex-wrap items-center gap-3">
        {/* Conta */}
        <div className="relative min-w-[200px]">
          <Layers className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="w-full appearance-none rounded-xl border border-white/10 bg-background/40 py-2.5 pl-9 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todas as Contas</option>
            {adAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Status */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="appearance-none rounded-xl border border-white/10 bg-background/40 px-4 py-2.5 pr-8 text-xs font-bold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativas</option>
            <option value="paused">Pausadas</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Busca */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
            className="w-full rounded-xl border border-white/10 bg-background/40 py-2.5 pl-10 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* ABAS DE NÍVEL (CAMPANHAS / CONJUNTOS / ANÚNCIOS) */}
      <div className="flex gap-1 border-b border-white/5">
        {LEVEL_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setLevel(tab.id)}
            className={`flex items-center gap-2 px-5 py-3 text-[11px] font-black uppercase tracking-widest border-b-2 transition-all ${
              level === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-white/20"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            {tab.label}
            {tab.id === "campanhas" && selectedCampaignIds.size > 0 && (
              <span className="ml-1.5 rounded-full bg-primary/20 text-primary px-2 py-0.5 text-[9px] font-black">
                {selectedCampaignIds.size} sel.
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={level} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* NÍVEL: CAMPANHAS */}
          {level === "campanhas" && (
            <div className="glass-panel overflow-hidden">
              {/* Cabeçalho da Tabela + Summary Bar */}
              {selectedCampaignIds.size > 0 && (
                <div className="border-b border-white/5 bg-primary/5 px-6 py-3 flex flex-wrap items-center gap-6 text-xs">
                  <span className="font-black text-primary uppercase tracking-widest">{selectedCampaignIds.size} selecionadas</span>
                  <span className="text-muted-foreground">Gasto: <strong className="text-foreground font-mono">R$ {totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong></span>
                  <span className="text-muted-foreground">Resultados: <strong className="text-foreground font-mono">{totalConversions}</strong></span>
                  <span className="text-muted-foreground">CPL: <strong className="text-primary font-mono">R$ {totalCpl.toFixed(2)}</strong></span>
                  <span className="text-muted-foreground">Impressões: <strong className="text-foreground font-mono">{totalImpressions.toLocaleString("pt-BR")}</strong></span>
                  <button onClick={() => { setLevel("conjuntos"); }} className="ml-auto text-[10px] font-black uppercase tracking-widest text-secondary hover:text-white transition">
                    Ver Conjuntos →
                  </button>
                </div>
              )}

              {isLoading ? (
                <div className="flex justify-center py-24"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : filteredCampaigns.length === 0 ? (
                <div className="py-24 text-center text-sm text-muted-foreground">Nenhuma campanha encontrada para os filtros aplicados.</div>
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
                        <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground">Campanha</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Orçamento</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Alcance</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground">Impressões</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-secondary">Resultados</th>
                        <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-widest text-primary">Gasto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCampaigns.map((c) => {
                        const isActive = c.status?.toUpperCase() === "ACTIVE";
                        const isChanging = changingStatusId === c.id;
                        const isSelected = selectedCampaignIds.has(c.id);

                        return (
                          <tr
                            key={c.id}
                            className={`border-b border-white/[0.03] transition-colors ${isSelected ? "bg-primary/5" : "hover:bg-white/[0.015]"}`}
                          >
                            <td className="px-4 py-3 text-center">
                              <button onClick={() => toggleOne(c.id)} className="text-muted-foreground hover:text-primary transition">
                                {isSelected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                              </button>
                            </td>
                            <td className="px-2 py-3 text-center">
                              <button
                                onClick={() => toggleMutation.mutate({ campaignId: c.id, externalId: c.external_id, currentStatus: c.status })}
                                disabled={isChanging || !c.external_id}
                                title={isActive ? "Pausar campanha" : "Ativar campanha"}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-all ${
                                  isChanging ? "animate-pulse border-white/10 text-muted-foreground" :
                                  isActive ? "border-success/30 bg-success/10 text-success hover:bg-destructive/20 hover:border-destructive/30 hover:text-destructive" :
                                  "border-white/10 bg-white/5 text-muted-foreground hover:bg-success/10 hover:border-success/30 hover:text-success"
                                }`}
                              >
                                {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current" />}
                              </button>
                            </td>
                            <td className="px-4 py-3 max-w-[280px]">
                              <div>
                                <p className="font-bold text-foreground/90 truncate uppercase tracking-tight text-xs" title={c.name}>{c.name}</p>
                                <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{c.ad_account?.name || "Conta desconhecida"}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">R$ {(c.budget || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{(c.totals as any).reach ? (c.totals as any).reach.toLocaleString("pt-BR") : "—"}</td>
                            <td className="px-4 py-3 text-right font-mono text-muted-foreground">{c.totals.impressions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-secondary">{c.totals.conversions.toLocaleString("pt-BR")}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-primary">R$ {c.totals.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                          </tr>
                        );
                      })}
                    </tbody>

                    {/* Linha de totais */}
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/[0.02]">
                        <td colSpan={3} className="px-4 py-3 text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                          Total ({filteredCampaigns.length} campanhas)
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">—</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[10px]">{filteredCampaigns.reduce((s, c) => s + c.totals.impressions, 0).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-secondary text-[10px]">{filteredCampaigns.reduce((s, c) => s + c.totals.conversions, 0).toLocaleString("pt-BR")}</td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-primary text-[10px]">R$ {filteredCampaigns.reduce((s, c) => s + c.totals.cost, 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* NÍVEL: CONJUNTOS E ANÚNCIOS (Em Mapeamento) */}
          {(level === "conjuntos" || level === "anuncios") && (
            <div className="glass-panel overflow-hidden">
              {selectedCampaignIds.size > 0 && (
                <div className="border-b border-white/5 bg-secondary/5 px-6 py-3 flex items-center gap-4 text-xs">
                  <span className="text-[9px] font-black uppercase tracking-widest text-secondary">Filtrando por {selectedCampaignIds.size} campanha(s) selecionada(s)</span>
                  <button onClick={() => setSelectedCampaignIds(new Set())} className="text-[9px] text-muted-foreground hover:text-foreground underline">Limpar seleção</button>
                </div>
              )}
              <div className="flex flex-col items-center justify-center gap-5 py-28 text-center">
                <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-secondary/20 to-primary/10 flex items-center justify-center ring-1 ring-white/10 shadow-glow-sm">
                  {level === "conjuntos" ? <LayoutGrid className="h-8 w-8 text-secondary" /> : <ImageIcon className="h-8 w-8 text-primary" />}
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold uppercase tracking-tight mb-2">
                    {level === "conjuntos" ? "Conjuntos de Anúncios" : "Anúncios (Criativo)"}
                  </h3>
                  <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                    A sincronização de <strong>{level === "conjuntos" ? "Ad Sets" : "Ads"}</strong> está sendo mapeada pela IA Victoria via Graph API. Assim que os dados forem ingeridos no banco, esta tabela será populada com as mesmas colunas e controles das campanhas.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-primary font-black uppercase tracking-widest">
                  <Sparkles className="h-3.5 w-3.5 animate-pulse" />
                  Victoria AI Engine — Mapeamento em Progresso
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
