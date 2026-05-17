import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Megaphone, Search, Shield, Play, Pause, Loader2, Sparkles, 
  Settings, Users, DollarSign, Target, Trophy, HelpCircle, RefreshCw, Layers, Check, ChevronDown, FolderDot, LayoutGrid, Image as ImageIcon
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "NC Ads Manager — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      accountId: search.accountId as string | undefined,
      search: search.search as string | undefined,
    };
  },
  component: GestaoUnificadaPage,
});

const TABS = [
  { id: "portfolios", label: "Portfólios (BMs)", icon: FolderDot },
  { id: "contas", label: "Contas de Anúncios", icon: Layers },
  { id: "campanhas", label: "Campanhas", icon: Megaphone },
  { id: "conjuntos", label: "Conjuntos (Ad Sets)", icon: LayoutGrid },
  { id: "anuncios", label: "Anúncios (Ads)", icon: ImageIcon },
];

function GestaoUnificadaPage() {
  const { accountId: defaultAccountId, search: defaultSearch } = Route.useSearch();
  const navigate = useNavigate({ from: Route.id });
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState("campanhas");
  const [accountFilter, setAccountFilter] = useState(defaultAccountId || "all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(defaultSearch || "");
  
  const [changingStatusId, setChangingStatusId] = useState<string | null>(null);

  // 1. Buscar Ad Accounts
  const { data: adAccounts = [] } = useQuery({
    queryKey: ["ad-accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  // 2. Buscar Clientes
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("*").order("name");
      return data || [];
    }
  });

  // 3. Query principal de campanhas reais com métricas (Usada para Campanhas e para consolidar Contas)
  const { data: campaigns = [], isLoading, refetch } = useQuery({
    queryKey: ["campaigns-real-performance", accountFilter, clientFilter, statusFilter, search],
    queryFn: async () => {
      let q = supabase
        .from("campaigns")
        .select(`
          id, name, status, budget, external_id, ad_account_id, client_id, platform,
          ad_account:ad_accounts(name),
          metrics(cost, conversions, impressions, clicks)
        `);

      if (accountFilter !== "all") {
        q = q.eq("ad_account_id", accountFilter);
      }
      if (clientFilter !== "all") {
        q = q.eq("client_id", clientFilter);
      }
      if (statusFilter !== "all") {
        const statusVal = statusFilter === "active" ? "ACTIVE" : "PAUSED";
        q = q.ilike("status", statusVal);
      }
      if (search) {
        q = q.ilike("name", `%${search}%`);
      }

      const { data, error } = await q.order("name");
      if (error) throw error;

      return (data || []).map((c: any) => {
        const metrics = c.metrics || [];
        const cost = metrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const conversions = metrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
        const clicks = metrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
        const impressions = metrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);
        const cpl = conversions > 0 ? cost / conversions : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

        return { ...c, totals: { cost, conversions, cpl, ctr, impressions } };
      });
    }
  });

  // Mutação para vincular a campanha a um cliente
  const linkClientMutation = useMutation({
    mutationFn: async ({ campaignId, clientId }: { campaignId: string; clientId: string | null }) => {
      const { error } = await supabase.from("campaigns").update({ client_id: clientId }).eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns-real-performance"] });
      toast.success("Cliente vinculado com sucesso!");
    },
  });

  // Mutação para Play/Pause via Meta API
  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, externalId, currentStatus }: { campaignId: string; externalId: string; currentStatus: string }) => {
      if (!externalId) throw new Error("ID externo do Meta ausente.");
      
      const isCurrentlyActive = currentStatus.toUpperCase() === "ACTIVE";
      const action = isCurrentlyActive ? "pause" : "start";
      const targetStatus = isCurrentlyActive ? "PAUSED" : "ACTIVE";

      setChangingStatusId(campaignId);

      const { data, error } = await supabase.functions.invoke("campaign-manager", {
        body: { action, payload: externalId, ad_account_id: "ALL" }
      });

      if (error) throw new Error(error.message);
      if (data?.status === "error" || data?.results?.[0]?.status === "error") {
        throw new Error(data.results?.[0]?.error || "Falha na Meta API");
      }

      const { error: dbErr } = await supabase.from("campaigns").update({ status: targetStatus }).eq("id", campaignId);
      if (dbErr) throw dbErr;

      return targetStatus;
    },
    onSuccess: (newStatus) => {
      qc.invalidateQueries({ queryKey: ["campaigns-real-performance"] });
      toast.success(`Campanha ${newStatus === "ACTIVE" ? "ativada" : "pausada"} no Meta Ads!`);
    },
    onError: (err: any) => toast.error(`Erro: ${err.message}`),
    onSettled: () => setChangingStatusId(null)
  });

  const handleAccountChange = (val: string) => {
    setAccountFilter(val);
    navigate({ search: (prev) => ({ ...prev, accountId: val === "all" ? undefined : val }) });
  };

  // Processar dados para a Aba de Contas
  const contasConsolidadas = adAccounts.map(account => {
    const accountCampaigns = campaigns.filter(c => c.ad_account_id === account.id);
    const cost = accountCampaigns.reduce((s, c) => s + c.totals.cost, 0);
    const conversions = accountCampaigns.reduce((s, c) => s + c.totals.conversions, 0);
    const cpl = conversions > 0 ? cost / conversions : 0;
    return { ...account, total_campaigns: accountCampaigns.length, cost, conversions, cpl };
  }).filter(a => a.total_campaigns > 0 || a.cost > 0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-1 pb-20">
      <PageHeader 
        eyebrow="Operação Estratégica" 
        title="NC Ads Manager Unificado" 
        description="Gerencie portfólios, contas, campanhas, conjuntos e anúncios em um único Command Center profundo e reativo."
        actions={
          <button 
            onClick={() => refetch()} 
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-foreground transition hover:border-primary/40 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5 text-primary" /> Atualizar Dados
          </button>
        }
      />

      {/* 🚀 TABS NAVEGAÇÃO SUPERIOR (A "ARQUITETURA ABSURDA") */}
      <div className="flex gap-2 p-1.5 bg-background/60 backdrop-blur-xl rounded-2xl border border-white/10 overflow-x-auto custom-scrollbar shadow-2xl">
        {TABS.map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3.5 rounded-xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap outline-none ${
              activeTab === tab.id 
                ? 'bg-gradient-to-br from-primary to-secondary text-white shadow-glow' 
                : 'text-muted-foreground hover:bg-white/5 hover:text-foreground'
            }`}
          >
            <tab.icon className={`h-4 w-4 ${activeTab === tab.id ? "text-white" : "text-muted-foreground"}`} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div 
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {/* TAB: PORTFÓLIOS */}
          {activeTab === "portfolios" && (
            <div className="glass-panel flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/30 mb-2 shadow-glow-sm">
                <FolderDot className="h-7 w-7 text-primary" />
              </div>
              <h3 className="text-xl font-display font-bold uppercase tracking-tight">Business Managers (Portfólios Meta)</h3>
              <p className="text-sm text-muted-foreground max-w-lg">
                Os Business Managers associados às contas de anúncios serão sincronizados automaticamente pela IA nas próximas atualizações da Graph API.
              </p>
            </div>
          )}

          {/* TAB: CONTAS DE ANÚNCIOS */}
          {activeTab === "contas" && (
            <div className="space-y-4">
              <div className="glass-panel p-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                <p className="text-xs font-black uppercase tracking-widest text-primary">Consolidado por Contas Meta</p>
              </div>
              {contasConsolidadas.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">Nenhuma conta com dados sincronizados no período.</div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {contasConsolidadas.map(acc => (
                    <div key={acc.id} className="glass-panel p-5 hover:border-primary/30 transition-all cursor-pointer" onClick={() => { setAccountFilter(acc.id); setActiveTab("campanhas"); }}>
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-10 w-10 rounded-full bg-white/5 flex items-center justify-center"><Layers className="h-5 w-5 text-secondary" /></div>
                        <div>
                          <h4 className="font-bold uppercase text-sm tracking-tight">{acc.name}</h4>
                          <p className="text-[10px] text-muted-foreground font-mono">{acc.id}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 mb-4">
                         <div className="bg-background/50 rounded-lg p-3">
                           <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Gasto Consolidado</p>
                           <p className="font-mono font-bold text-sm">R$ {acc.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                         </div>
                         <div className="bg-background/50 rounded-lg p-3">
                           <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">CPL Médio</p>
                           <p className="font-mono font-bold text-sm text-primary">R$ {acc.cpl.toFixed(2)}</p>
                         </div>
                      </div>
                      <div className="text-[10px] uppercase font-black tracking-widest text-muted-foreground text-center pt-2 border-t border-white/5">
                        {acc.total_campaigns} Campanhas Vinculadas • Clique para Ver
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: CAMPANHAS */}
          {activeTab === "campanhas" && (
            <div className="space-y-6">
              <div className="glass-panel p-4 flex flex-wrap items-center gap-4">
                <div className="relative flex-1 min-w-[260px]">
                  <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input 
                    value={search} 
                    onChange={(e) => handleSearchChange(e.target.value)} 
                    placeholder="Buscar campanha..." 
                    className="w-full rounded-xl border border-white/10 bg-background/30 py-2.5 pl-11 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/60" 
                  />
                </div>
                <select value={accountFilter} onChange={(e) => handleAccountChange(e.target.value)} className="rounded-xl border border-white/10 bg-background/30 px-4 py-2.5 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all">
                  <option value="all">Todas as Contas Meta</option>
                  {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} className="rounded-xl border border-white/10 bg-background/30 px-4 py-2.5 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all">
                  <option value="all">Todos os Clientes</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {isLoading ? (
                <div className="flex justify-center py-20"><Loader2 className="h-10 w-10 animate-spin text-primary" /></div>
              ) : campaigns.length === 0 ? (
                <div className="glass-panel py-24 text-center text-muted-foreground">Nenhuma campanha encontrada.</div>
              ) : (
                <div className="grid gap-4">
                  {campaigns.map((c, i) => {
                    const isChanging = changingStatusId === c.id;
                    const isActive = c.status?.toUpperCase() === "ACTIVE";

                    return (
                      <motion.div key={c.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.3) }} className={`glass-panel p-5 relative overflow-hidden transition-all duration-300 hover:border-primary/20 ${isActive ? "bg-gradient-to-r from-background to-success/[0.01]" : ""}`}>
                        {isActive && <div className="absolute top-0 left-0 w-[3px] h-full bg-success" />}
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${isActive ? "bg-success/15 text-success animate-pulse" : "bg-white/5 text-muted-foreground"}`}>
                                <span className={`h-1 w-1 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground"}`} />{isActive ? "Ativa" : "Pausada"}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1">
                                <Layers className="h-3 w-3 text-primary/70" />{c.ad_account?.name || "Desconhecida"}
                              </span>
                            </div>
                            <h3 className="text-sm font-bold truncate text-foreground/90 uppercase tracking-tight" title={c.name}>{c.name}</h3>
                            <p className="text-[9px] font-mono text-muted-foreground/60 tracking-wider">META_ID: {c.external_id || "N/A"}</p>
                          </div>

                          <div className="grid grid-cols-3 gap-2 sm:gap-6 min-w-[280px] lg:min-w-[340px] bg-white/[0.01] border border-white/5 rounded-2xl p-3 px-4">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Gasto</p>
                              <p className="text-xs font-mono font-bold">R$ {c.totals.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Leads</p>
                              <p className="text-xs font-mono font-bold">{c.totals.conversions.toLocaleString("pt-BR")}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">CPL</p>
                              <p className={`text-xs font-mono font-bold ${c.totals.cpl > 0 ? "text-primary" : "text-muted-foreground"}`}>{c.totals.cpl > 0 ? `R$ ${c.totals.cpl.toFixed(2)}` : "—"}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-4">
                            <select value={c.client_id || ""} onChange={(e) => linkClientMutation.mutate({ campaignId: c.id, clientId: e.target.value || null })} className="rounded-xl border border-white/10 bg-background/50 px-3.5 py-2 text-[10px] font-black uppercase focus:border-primary/50 transition-all">
                              <option value="">Sem Cliente</option>
                              {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                            </select>
                            <button onClick={() => toggleCampaignMutation.mutate({ campaignId: c.id, externalId: c.external_id, currentStatus: c.status })} disabled={isChanging || !c.external_id} className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest border ${isChanging ? "bg-white/5 text-muted-foreground" : isActive ? "bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive hover:text-white" : "bg-success/10 text-success border-success/20 hover:bg-success hover:text-background"}`}>
                              {isChanging ? <Loader2 className="h-3 w-3 animate-spin" /> : isActive ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                              {isChanging ? "ALTERANDO..." : isActive ? "PAUSAR" : "ATIVAR"}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB: CONJUNTOS E ANÚNCIOS */}
          {(activeTab === "conjuntos" || activeTab === "anuncios") && (
            <div className="glass-panel flex flex-col items-center justify-center gap-4 py-24 text-center">
              <div className="h-14 w-14 rounded-2xl bg-secondary/10 flex items-center justify-center ring-1 ring-secondary/30 mb-2 shadow-glow-sm">
                {activeTab === "conjuntos" ? <LayoutGrid className="h-7 w-7 text-secondary" /> : <ImageIcon className="h-7 w-7 text-secondary" />}
              </div>
              <h3 className="text-xl font-display font-bold uppercase tracking-tight">Integração Profunda (Ad Sets / Ads)</h3>
              <p className="text-sm text-muted-foreground max-w-lg">
                Esta camada hiper-granular do Meta Ads Manager está sendo mapeada na sua base de dados e os controles estarão disponíveis nativamente em breve.
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
