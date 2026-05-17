import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Megaphone, Search, Shield, Play, Pause, Loader2, Sparkles, 
  Settings, Users, DollarSign, Target, Trophy, HelpCircle, RefreshCw, Layers, Check, ChevronDown
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/campanhas")({
  head: () => ({ meta: [{ title: "Central de Campanhas — NC Performance Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => {
    return {
      accountId: search.accountId as string | undefined,
      search: search.search as string | undefined,
    };
  },
  component: CampanhasPage,
});

function CampanhasPage() {
  const { accountId: defaultAccountId, search: defaultSearch } = Route.useSearch();
  const navigate = useNavigate({ from: Route.id });
  const qc = useQueryClient();

  const [accountFilter, setAccountFilter] = useState(defaultAccountId || "all");
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState(defaultSearch || "");
  
  // Estado para armazenar qual campanha está mudando de status para exibir loader individual
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

  // 3. Query principal consolidada de campanhas reais com suas métricas acumuladas
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
        // Mapeia para formatos comuns retornados do Meta Graph API
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

        return {
          ...c,
          totals: { cost, conversions, cpl, ctr, impressions }
        };
      });
    }
  });

  // 4. Mutação para vincular a campanha a um cliente
  const linkClientMutation = useMutation({
    mutationFn: async ({ campaignId, clientId }: { campaignId: string; clientId: string | null }) => {
      const { error } = await supabase
        .from("campaigns")
        .update({ client_id: clientId })
        .eq("id", campaignId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns-real-performance"] });
      toast.success("Cliente vinculado com sucesso!");
    },
    onError: (err: any) => {
      toast.error(`Falha ao vincular cliente: ${err.message}`);
    }
  });

  // 5. Mutação para alterar o status da campanha diretamente no Meta Ads!
  const toggleCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, externalId, currentStatus }: { campaignId: string; externalId: string; currentStatus: string }) => {
      if (!externalId) throw new Error("A campanha não possui ID externo do Meta Ads.");
      
      const isCurrentlyActive = currentStatus.toUpperCase() === "ACTIVE";
      const action = isCurrentlyActive ? "pause" : "start";
      const targetStatus = isCurrentlyActive ? "PAUSED" : "ACTIVE";

      setChangingStatusId(campaignId);

      // Invoca a Edge Function de gerenciamento de campanhas
      const { data, error } = await supabase.functions.invoke("campaign-manager", {
        body: {
          action,
          payload: externalId,
          ad_account_id: "ALL"
        }
      });

      if (error) throw new Error(error.message);
      if (data?.status === "error" || data?.results?.[0]?.status === "error") {
        throw new Error(data.results?.[0]?.error || "Falha ao aplicar alteração no Meta Ads");
      }

      // Atualiza localmente no banco para resposta instantânea
      const { error: dbErr } = await supabase
        .from("campaigns")
        .update({ status: targetStatus })
        .eq("id", campaignId);

      if (dbErr) throw dbErr;

      return targetStatus;
    },
    onSuccess: (newStatus) => {
      qc.invalidateQueries({ queryKey: ["campaigns-real-performance"] });
      toast.success(`Campanha ${newStatus === "ACTIVE" ? "ativada" : "pausada"} com sucesso no Meta Ads!`);
    },
    onError: (err: any) => {
      toast.error(`Erro ao gerenciar campanha: ${err.message}`);
    },
    onSettled: () => {
      setChangingStatusId(null);
    }
  });

  const handleAccountChange = (val: string) => {
    setAccountFilter(val);
    navigate({ search: (prev) => ({ ...prev, accountId: val === "all" ? undefined : val }) });
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    navigate({ search: (prev) => ({ ...prev, search: val || undefined }) });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-1">
      <PageHeader 
        eyebrow="Operação e Ads" 
        title="Gestão de Ads Real-Time" 
        description="Visualize, pause, ative e gerencie suas campanhas Meta Ads com sincronismo direto na Graph API e proteção da IA Victoria."
        actions={
          <button 
            onClick={() => refetch()} 
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-black uppercase tracking-widest text-foreground transition hover:border-primary/40 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5 text-primary" />
            Atualizar Lista
          </button>
        }
      />

      {/* 🛠️ BARRA DE FILTROS E PESQUISA PREMIUM */}
      <div className="glass-panel p-4 flex flex-wrap items-center gap-4">
        {/* Busca */}
        <div className="relative flex-1 min-w-[260px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input 
            value={search} 
            onChange={(e) => handleSearchChange(e.target.value)} 
            placeholder="Buscar campanha real por nome..." 
            className="w-full rounded-xl border border-white/10 bg-background/30 py-2.5 pl-11 pr-4 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all placeholder:text-muted-foreground/60" 
          />
        </div>

        {/* Conta de Anúncios */}
        <div className="relative min-w-[200px]">
          <select 
            value={accountFilter} 
            onChange={(e) => handleAccountChange(e.target.value)} 
            className="w-full appearance-none rounded-xl border border-white/10 bg-background/30 px-4 py-2.5 pr-10 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todas as Contas Meta</option>
            {adAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Cliente */}
        <div className="relative min-w-[180px]">
          <select 
            value={clientFilter} 
            onChange={(e) => setClientFilter(e.target.value)} 
            className="w-full appearance-none rounded-xl border border-white/10 bg-background/30 px-4 py-2.5 pr-10 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todos os Clientes</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>

        {/* Status */}
        <div className="relative min-w-[140px]">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)} 
            className="w-full appearance-none rounded-xl border border-white/10 bg-background/30 px-4 py-2.5 pr-10 text-xs font-semibold focus:border-primary/50 focus:outline-none transition-all"
          >
            <option value="all">Todos os Status</option>
            <option value="active">Ativas no Meta</option>
            <option value="paused">Pausadas no Meta</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* 📋 LISTAGEM DE CAMPANHAS COM METRICAS INTEGRADAS */}
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground font-black uppercase tracking-widest">Carregando campanhas do Meta Ads...</p>
        </div>
      ) : campaigns.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 py-24 text-center">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center ring-1 ring-white/10 mb-2">
            <Megaphone className="h-6 w-6 text-primary" />
          </div>
          <h3 className="text-md font-bold uppercase tracking-tight">Nenhuma campanha encontrada</h3>
          <p className="text-xs text-muted-foreground max-w-sm">Verifique seus filtros ou clique em Sincronizar para atualizar a base de dados do Meta Ads.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {campaigns.map((c, i) => {
            const isChanging = changingStatusId === c.id;
            const isActive = c.status?.toUpperCase() === "ACTIVE";

            return (
              <motion.div 
                key={c.id} 
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: Math.min(i * 0.02, 0.3) }}
                className={`glass-panel p-5 relative overflow-hidden transition-all duration-300 hover:border-primary/20 ${isActive ? "bg-gradient-to-r from-background to-success/[0.01]" : ""}`}
              >
                {/* Glow decorativo de ativa */}
                {isActive && (
                  <div className="absolute top-0 left-0 w-[3px] h-full bg-success" />
                )}

                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  {/* Informações Básicas */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${isActive ? "bg-success/15 text-success animate-pulse" : "bg-white/5 text-muted-foreground"}`}>
                        <span className={`h-1 w-1 rounded-full ${isActive ? "bg-success" : "bg-muted-foreground"}`} />
                        {isActive ? "Ativa" : "Pausada"}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest flex items-center gap-1">
                        <Layers className="h-3 w-3 text-primary/70" />
                        {c.ad_account?.name || "Conta Desconhecida"}
                      </span>
                    </div>

                    <h3 className="text-sm font-bold truncate text-foreground/90 uppercase tracking-tight" title={c.name}>
                      {c.name}
                    </h3>

                    {/* ID Externo do Meta */}
                    <p className="text-[9px] font-mono text-muted-foreground/60 tracking-wider">
                      META_ID: {c.external_id || "N/A"}
                    </p>
                  </div>

                  {/* 📊 MÉTRICAS ACUMULADAS DA CAMPANHA (REAL-TIME) */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-6 min-w-[280px] lg:min-w-[340px] bg-white/[0.01] border border-white/5 rounded-2xl p-3 px-4">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Investimento</p>
                      <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                        R$ {c.totals.cost.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Resultados</p>
                      <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                        {c.totals.conversions.toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">CPL Médio</p>
                      <p className={`text-xs font-mono font-bold mt-0.5 ${c.totals.cpl > 0 ? "text-primary" : "text-muted-foreground"}`}>
                        {c.totals.cpl > 0 ? `R$ ${c.totals.cpl.toFixed(2)}` : "—"}
                      </p>
                    </div>
                  </div>

                  {/* ⚙️ ASSOCIAÇÃO DE CLIENTE & CONTROLES DE STATUS */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Associação de Cliente */}
                    <div className="relative min-w-[150px]">
                      <select 
                        value={c.client_id || ""} 
                        onChange={(e) => linkClientMutation.mutate({ campaignId: c.id, clientId: e.target.value || null })}
                        className="w-full appearance-none rounded-xl border border-white/10 bg-background/50 px-3.5 py-2 text-[10px] font-black uppercase tracking-widest focus:border-primary/50 focus:outline-none transition-all pr-8"
                      >
                        <option value="">Sem Cliente</option>
                        {clients.map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                      </select>
                      <Users className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                    </div>

                    {/* Switch Toggle Status Meta Ads */}
                    <button 
                      onClick={() => toggleCampaignMutation.mutate({ campaignId: c.id, externalId: c.external_id, currentStatus: c.status })}
                      disabled={isChanging || !c.external_id}
                      className={`flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all duration-300 border ${
                        isChanging
                          ? "bg-white/5 border-white/10 text-muted-foreground"
                          : isActive
                          ? "bg-destructive/10 border-destructive/20 text-destructive hover:bg-destructive hover:text-white"
                          : "bg-success/10 border-success/20 text-success hover:bg-success hover:text-background"
                      }`}
                    >
                      {isChanging ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : isActive ? (
                        <Pause className="h-3 w-3 fill-current" />
                      ) : (
                        <Play className="h-3 w-3 fill-current" />
                      )}
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
  );
}
