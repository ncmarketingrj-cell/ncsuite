import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Wallet, Receipt,
  ChevronDown, ChevronUp, ShieldCheck, Coins, Play, Pause,
  DollarSign, Activity, Sparkles, AlertTriangle
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { toast } from "sonner";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { DiagnosisModal } from "@/components/victoria/DiagnosisModal";

export const Route = createFileRoute("/_app/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças & Despesas — NC Suite" }] }),
  component: CobrancasPage,
});

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined, currency = "BRL") {
  if (value === null || value === undefined) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseDate(val: string | number | null | undefined): Date | null {
  if (val === null || val === undefined || val === "" || val === 0) return null;
  let d: Date;
  if (typeof val === "number") {
    d = new Date(val * 1000);
  } else if (/^\d{9,11}$/.test(String(val))) {
    d = new Date(Number(val) * 1000);
  } else {
    d = new Date(val);
  }
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(val: string | number | null | undefined) {
  if (!val) return "—";
  try {
    const d = parseDate(val);
    if (!d) return "—";
    return format(d, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return String(val);
  }
}

const BILLING_REASON_LABEL: Record<string, string> = {
  THRESHOLD:     "Limite do cartão atingido",
  MONTHLY:       "Fechamento mensal",
  BALANCE_RELOAD:"Recarga de saldo",
  REFUND:        "Estorno",
  PREPAY:        "Pré-pagamento",
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  COMPLETED: { label: "Concluído",  color: "text-green-400 bg-green-500/10 border-green-500/20", icon: CheckCircle2 },
  PENDING:   { label: "Pendente",   color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20", icon: Clock },
  FAILED:    { label: "Falhou",     color: "text-red-400 bg-red-500/10 border-red-500/20", icon: AlertCircle },
};

const FUNDING_TYPE_LABEL: Record<string, string> = {
  CREDIT_CARD:  "Cartão de Crédito",
  DEBIT_CARD:   "Cartão de Débito",
  PAYPAL:       "PayPal",
  BANK_TRANSFER:"Transferência Bancária",
  PREPAY:       "Saldo Pré-pago",
};

// ─── Component ──────────────────────────────────────────────────────────────

function CobrancasPage() {
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"todos" | "meta" | "google">("todos");
  const [fetching, setFetching] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => subDays(new Date(), 30));
  const [endDate, setEndDate] = useState<Date>(() => new Date());
  const [selectedDiagnoseCampId, setSelectedDiagnoseCampId] = useState<string | null>(null);
  const [selectedDiagnoseCampName, setSelectedDiagnoseCampName] = useState<string>("");
  const [isDiagnoseOpen, setIsDiagnoseOpen] = useState(false);

  // Deduplica e carrega snapshots de faturamento
  const { data: snapshots = [], refetch: refetchSnapshots, isLoading: loadingSnapshots } = useQuery<any[]>({
    queryKey: ["billing_snapshots"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("billing_snapshots")
        .select("*")
        .order("fetched_at", { ascending: false });
      if (error) throw error;

      const seen = new Set<string>();
      return (data ?? []).filter((s: any) => {
        if (seen.has(s.ad_account_id)) return false;
        seen.add(s.ad_account_id);
        return true;
      });
    },
  });

  // Carrega despesas das campanhas e progresso de hoje
  const { data: campaignStats = [], isLoading: loadingStats } = useQuery<any[]>({
    queryKey: ["campaign_billing_stats", startDate.toISOString(), endDate.toISOString()],
    queryFn: async () => {
      const { data: campaigns, error: campErr } = await (supabase as any)
        .from("campaigns")
        .select("id, name, status, daily_budget, budget_currency, ad_account_id, platform");
      if (campErr) throw campErr;

      const startStr = startOfDay(startDate).toISOString().split("T")[0];
      const endStr = endOfDay(endDate).toISOString().split("T")[0];
      const todayStr = new Date().toISOString().split("T")[0];

      // Busca métricas agregadas por dia
      const { data: metrics, error: metErr } = await (supabase as any)
        .from("metrics")
        .select("campaign_id, cost, date")
        .gte("date", startStr)
        .lte("date", endStr);
      if (metErr) throw metErr;

      const statsMap = new Map<string, { totalSpend: number; todaySpend: number }>();
      (metrics || []).forEach((m: any) => {
        const cost = Number(m.cost || 0);
        const existing = statsMap.get(m.campaign_id) || { totalSpend: 0, todaySpend: 0 };
        existing.totalSpend += cost;
        if (m.date === todayStr) {
          existing.todaySpend += cost;
        }
        statsMap.set(m.campaign_id, existing);
      });

      return (campaigns || []).map((c: any) => {
        const stats = statsMap.get(c.id) || { totalSpend: 0, todaySpend: 0 };
        return {
          ...c,
          totalSpend: stats.totalSpend,
          todaySpend: stats.todaySpend
        };
      });
    }
  });

  const lastFetch = snapshots.length > 0
    ? snapshots.reduce((a: any, b: any) =>
        new Date(a.fetched_at) > new Date(b.fetched_at) ? a : b
      ).fetched_at
    : null;

  // Atualiza dados na API Meta
  const handleFetch = async () => {
    setFetching(true);
    try {
      const { error } = await supabase.functions.invoke("get-meta-billing");
      if (error) throw error;
      await refetchSnapshots();
      toast.success("Dados de cobrança sincronizados!");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao buscar dados de cobrança.");
    } finally {
      setFetching(false);
    }
  };

  // Filtragem
  const filteredSnapshots = snapshots.filter((snap: any) => {
    if (activeTab === "meta") return snap.ad_account_id.startsWith("act_") || !snap.ad_account_id.includes("-");
    if (activeTab === "google") return snap.ad_account_id.includes("-");
    return true;
  });

  // Métricas Consolidadas Gerais
  const totalSpentToday = campaignStats.reduce((sum, c) => sum + c.todaySpend, 0);
  const totalSpentPeriod = campaignStats.reduce((sum, c) => sum + c.totalSpend, 0);
  const activeCampaignsCount = campaignStats.filter(c => ["active", "ACTIVE"].includes(c.status)).length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Finanças e Performance"
        title="Cobranças & Investimentos"
        description="Acompanhe o consumo diário de orçamento e os gastos das campanhas em tempo real."
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
            />
            <button
              onClick={handleFetch}
              disabled={fetching}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:shadow-glow transition disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
              {fetching ? "Sincronizando..." : "Sincronizar"}
            </button>
          </div>
        }
      />

      {lastFetch && (
        <p className="text-[10px] text-muted-foreground font-mono -mt-6">
          Última atualização de faturamento: {fmtDate(lastFetch)} (Sincronização global automática a cada 3 minutos)
        </p>
      )}

      {/* Cards de Resumo Geral */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="glass-panel p-5 space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform">
            <DollarSign className="h-16 w-16 text-primary" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Activity className="h-4 w-4 text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-wider">Investido Hoje</span>
          </div>
          <p className="text-2xl font-black text-gradient">{fmtBRL(totalSpentToday)}</p>
          <p className="text-[10px] text-muted-foreground">soma de todas as campanhas ativas</p>
        </div>

        <div className="glass-panel p-5 space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform">
            <TrendingUp className="h-16 w-16 text-primary" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Coins className="h-4 w-4 text-primary" />
            <span className="text-[10px] font-black uppercase tracking-wider">Investido no Período</span>
          </div>
          <p className="text-2xl font-black text-white">{fmtBRL(totalSpentPeriod)}</p>
          <p className="text-[10px] text-muted-foreground">acumulado de {format(startDate, "dd/MM")} a {format(endDate, "dd/MM")}</p>
        </div>

        <div className="glass-panel p-5 space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:scale-110 transition-transform">
            <Play className="h-16 w-16 text-primary" />
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-wider">Campanhas Ativas</span>
          </div>
          <p className="text-2xl font-black text-white">{activeCampaignsCount} ativas</p>
          <p className="text-[10px] text-muted-foreground">gerando tráfego e leads agora</p>
        </div>
      </div>

      {/* Tabs por canal */}
      <div className="flex gap-2 border-b border-white/5 pb-2">
        <button
          onClick={() => setActiveTab("todos")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeTab === "todos" ? "bg-white/10 text-white" : "text-muted-foreground hover:bg-white/[0.03]"}`}
        >
          Todas as Contas
        </button>
        <button
          onClick={() => setActiveTab("meta")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeTab === "meta" ? "bg-[#1877F2]/10 text-[#1877F2] border border-[#1877F2]/20" : "text-muted-foreground hover:bg-white/[0.03]"}`}
        >
          Meta Ads
        </button>
        <button
          onClick={() => setActiveTab("google")}
          className={`px-4 py-2 rounded-full text-xs font-bold transition ${activeTab === "google" ? "bg-[#4285F4]/10 text-[#4285F4] border border-[#4285F4]/20" : "text-muted-foreground hover:bg-white/[0.03]"}`}
        >
          Google Ads
        </button>
      </div>

      {/* Loader */}
      {(loadingSnapshots || loadingStats) && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Estado Vazio */}
      {!loadingSnapshots && filteredSnapshots.length === 0 && (
        <div className="text-center py-16 border border-dashed border-white/5 rounded-2xl">
          <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-bold">Nenhum snapshot de cobrança localizado.</p>
          <p className="text-xs text-muted-foreground mt-1">Conecte contas de anúncios nas configurações para ver despesas.</p>
        </div>
      )}

      {/* Lista de Contas */}
      {!loadingSnapshots && !loadingStats && filteredSnapshots.length > 0 && (
        <div className="space-y-6">
          {filteredSnapshots.map((snap: any, idx: number) => {
            const isExpanded = expandedAccount === snap.ad_account_id;
            const funding = snap.funding_source;
            const allTxs: any[] = snap.transactions ?? [];
            const rangeStart = startOfDay(startDate);
            const rangeEnd = endOfDay(endDate);

            // Transações filtradas
            const txs = allTxs.filter((tx: any) => {
              const d = parseDate(tx.created_at);
              if (!d) return false;
              return d >= rangeStart && d <= rangeEnd;
            });
            const txsNoDate = allTxs.filter((tx: any) => !parseDate(tx.created_at));

            // Campanhas vinculadas a esta conta de anúncios
            const accountCampaigns = campaignStats.filter(c => c.ad_account_id === snap.ad_account_id);
            const totalAccountSpentToday = accountCampaigns.reduce((sum, c) => sum + c.todaySpend, 0);
            const activeAccountCampaigns = accountCampaigns.filter(c => ["active", "ACTIVE"].includes(c.status));
            const totalDailyBudget = activeAccountCampaigns.reduce((sum, c) => sum + (c.daily_budget || 0), 0);
            const pctUsed = totalDailyBudget > 0 ? (totalAccountSpentToday / totalDailyBudget) * 100 : 0;

            return (
              <motion.div
                key={snap.ad_account_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.04 }}
                className="glass-panel overflow-hidden border border-white/5 hover:border-white/10 transition"
              >
                {/* Cabeçalho do Card da Conta */}
                <div className="p-5 space-y-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`h-10 w-10 rounded-xl flex items-center justify-center border ${
                        snap.ad_account_id.includes("-") 
                          ? "bg-[#4285F4]/10 border-[#4285F4]/20 text-[#4285F4]" 
                          : "bg-[#1877F2]/10 border-[#1877F2]/20 text-[#1877F2]"
                      }`}>
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{snap.ad_account_name || snap.ad_account_id}</h4>
                        <span className="text-[9px] font-mono text-muted-foreground uppercase bg-white/5 px-2 py-0.5 rounded mt-1 inline-block">
                          ID: {snap.ad_account_id}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-muted-foreground uppercase block font-bold tracking-wider">Consumido Hoje</span>
                      <p className="text-base font-black text-gradient">{fmtBRL(totalAccountSpentToday, snap.currency)}</p>
                    </div>
                  </div>

                  {/* KPIs Internos */}
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 pt-2">
                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                      <span className="text-[9px] font-black text-muted-foreground/60 uppercase block">Gasto Total Acumulado</span>
                      <p className="text-sm font-bold text-white mt-1">{fmtBRL(snap.amount_spent, snap.currency)}</p>
                    </div>

                    <div className={`bg-white/[0.02] border rounded-xl p-3 relative overflow-hidden ${snap.balance !== null && totalDailyBudget > 0 && snap.balance < totalDailyBudget * 1.5 ? "border-emerald-500/50 bg-emerald-500/10" : "border-white/5"}`}>
                      {snap.balance !== null && totalDailyBudget > 0 && snap.balance < totalDailyBudget * 1.5 && (
                        <div className="absolute top-0 right-0 p-2 opacity-10">
                          <AlertTriangle className="h-10 w-10 text-emerald-400" />
                        </div>
                      )}
                      <span className={`text-[9px] font-black uppercase block flex items-center gap-1 ${snap.balance !== null && totalDailyBudget > 0 && snap.balance < totalDailyBudget * 1.5 ? "text-emerald-400" : "text-muted-foreground/60"}`}>
                        {snap.balance !== null ? "Saldo Pré-Pago" : "Não Faturado (Ciclo)"}
                        {snap.balance !== null && totalDailyBudget > 0 && snap.balance < totalDailyBudget * 1.5 && (
                          <span className="bg-emerald-500/20 text-emerald-400 px-1 py-0.5 rounded text-[8px] animate-pulse">BAIXO</span>
                        )}
                      </span>
                      <p className={`text-sm font-bold mt-1 ${snap.balance !== null && totalDailyBudget > 0 && snap.balance < totalDailyBudget * 1.5 ? "text-emerald-400" : "text-white"}`}>
                        {snap.balance !== null 
                          ? fmtBRL(snap.balance, snap.currency) 
                          : snap.bill_immature !== null 
                            ? fmtBRL(snap.bill_immature, snap.currency) 
                            : "—"}
                      </p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                      <span className="text-[9px] font-black text-muted-foreground/60 uppercase block">Limite de Faturamento</span>
                      <p className="text-sm font-bold text-white mt-1">{fmtBRL(snap.spend_cap, snap.currency)}</p>
                    </div>

                    <div className="bg-white/[0.02] border border-white/5 rounded-xl p-3">
                      <span className="text-[9px] font-black text-muted-foreground/60 uppercase block">Forma de Pagamento</span>
                      <p className="text-xs font-bold text-white truncate mt-1">
                        {funding ? `${FUNDING_TYPE_LABEL[funding.type] || funding.type} (${funding.display_string || ""})` : "Não cadastrado"}
                      </p>
                    </div>
                  </div>

                  {/* Monitoramento de Orçamento Diário */}
                  <div className="pt-2">
                    <h5 className="text-[10px] font-black uppercase text-muted-foreground/70 tracking-wider mb-3 flex items-center gap-1.5">
                      <Activity className="h-3 w-3 text-primary animate-pulse" /> Monitoramento de Orçamento Diário ({activeAccountCampaigns.length} campanhas ativas)
                    </h5>

                    <div className="bg-white/[0.01] border border-white/5 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-2">
                          <Wallet className="h-4 w-4 text-muted-foreground" />
                          <span className="font-semibold text-white">Consumo Global das Campanhas</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground font-mono font-bold">
                            {fmtBRL(totalAccountSpentToday, snap.currency)} / {totalDailyBudget > 0 ? fmtBRL(totalDailyBudget, snap.currency) : "Sem limite"}
                          </span>
                          {pctUsed >= 100 && totalDailyBudget > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-0.5 rounded-full">
                              <AlertTriangle className="h-3 w-3" /> Orçamento Estourado
                            </span>
                          )}
                        </div>
                      </div>

                      {totalDailyBudget > 0 && (
                        <div className="space-y-1.5">
                          <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full transition-all duration-500 ${
                                pctUsed >= 100 ? "bg-destructive shadow-glow-sm" :
                                pctUsed >= 85 ? "bg-amber-400" :
                                "bg-primary"
                              }`}
                              style={{ width: `${Math.min(100, pctUsed)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center text-[10px] text-muted-foreground/60 font-bold">
                            <span>Progresso do gasto diário</span>
                            <span className={pctUsed >= 100 ? "text-destructive" : ""}>{pctUsed.toFixed(1)}%</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Toggle Transações de Faturamento */}
                  {allTxs.length > 0 && (
                    <button
                      onClick={() => setExpandedAccount(isExpanded ? null : snap.ad_account_id)}
                      className="w-full flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-muted-foreground transition-all cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Receipt className="h-4 w-4" />
                        Histórico de Faturas ({txs.length} no período)
                      </span>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                  )}
                </div>

                {/* Bloco Expandido: Transações */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-white/5 overflow-hidden bg-black/20"
                    >
                        <table className="hidden md:table w-full text-xs">
                          <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                              <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Data</th>
                              <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Motivo de Faturamento</th>
                              <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Valor Faturado</th>
                              <th className="px-5 py-3 text-center text-[9px] font-black uppercase tracking-wider text-muted-foreground/60">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txs.map((tx: any) => {
                              const cfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.PENDING;
                              return (
                                <tr key={tx.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] transition">
                                  <td className="px-5 py-3 text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                                    {fmtDate(tx.created_at)}
                                  </td>
                                  <td className="px-5 py-3 text-white">
                                    {BILLING_REASON_LABEL[tx.billing_reason] ?? tx.billing_reason ?? "—"}
                                  </td>
                                  <td className="px-5 py-3 text-right font-bold text-white font-mono">
                                    {fmtBRL(tx.amount, tx.currency ?? snap.currency)}
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${cfg.color}`}>
                                      <cfg.icon className="h-2.5 w-2.5" />
                                      {cfg.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                            {txsNoDate.map((tx: any) => {
                              const cfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.PENDING;
                              return (
                                <tr key={tx.id} className="border-b border-white/[0.02] hover:bg-white/[0.01] opacity-65 transition">
                                  <td className="px-5 py-3 text-muted-foreground/50 font-mono text-[10px] italic">
                                    sem data registrada
                                  </td>
                                  <td className="px-5 py-3 text-white/70">
                                    {BILLING_REASON_LABEL[tx.billing_reason] ?? tx.billing_reason ?? "—"}
                                  </td>
                                  <td className="px-5 py-3 text-right font-bold text-white/70 font-mono">
                                    {fmtBRL(tx.amount, tx.currency ?? snap.currency)}
                                  </td>
                                  <td className="px-5 py-3 text-center">
                                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${cfg.color}`}>
                                      <cfg.icon className="h-2.5 w-2.5" />
                                      {cfg.label}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        
                        {/* --- MOBILE CARDS FOR INVOICES --- */}
                        <div className="flex flex-col gap-2 p-3 md:hidden">
                          {txs.map((tx: any) => {
                            const cfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.PENDING;
                            return (
                              <div key={tx.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                                <div className="flex items-start justify-between">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-white">{BILLING_REASON_LABEL[tx.billing_reason] ?? tx.billing_reason ?? "—"}</span>
                                    <span className="text-[9px] text-muted-foreground font-mono">{fmtDate(tx.created_at)}</span>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${cfg.color}`}>
                                    <cfg.icon className="h-2.5 w-2.5" />
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Valor</span>
                                  <span className="text-sm font-bold text-white font-mono">{fmtBRL(tx.amount, tx.currency ?? snap.currency)}</span>
                                </div>
                              </div>
                            );
                          })}
                          {txsNoDate.map((tx: any) => {
                            const cfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.PENDING;
                            return (
                              <div key={tx.id} className="bg-white/[0.01] border border-white/5 rounded-xl p-3 flex flex-col gap-2 opacity-65">
                                <div className="flex items-start justify-between">
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-white">{BILLING_REASON_LABEL[tx.billing_reason] ?? tx.billing_reason ?? "—"}</span>
                                    <span className="text-[9px] text-muted-foreground/50 font-mono italic">sem data registrada</span>
                                  </div>
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase shrink-0 ${cfg.color}`}>
                                    <cfg.icon className="h-2.5 w-2.5" />
                                    {cfg.label}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground">Valor</span>
                                  <span className="text-sm font-bold text-white/70 font-mono">{fmtBRL(tx.amount, tx.currency ?? snap.currency)}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Informação Legal */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          Os dados de faturamento e consumo diário das campanhas são coletados em tempo real diretamente das APIs de anúncios (Meta e Google Ads). Para as contas pós-pagas, o valor "Não Faturado" indica as despesas acumuladas desde a última cobrança.
        </p>
      </div>

      {/* Diagnosis Modal */}
      <DiagnosisModal
        isOpen={isDiagnoseOpen}
        onClose={() => setIsDiagnoseOpen(false)}
        campaignId={selectedDiagnoseCampId}
        campaignName={selectedDiagnoseCampName}
      />
    </div>
  );
}
