import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  CreditCard, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Clock, TrendingUp, Wallet, Receipt,
  ChevronDown, ChevronUp, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { DateRangePicker } from "@/components/DateRangePicker";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/cobrancas")({
  head: () => ({ meta: [{ title: "Cobranças — NC Suite" }] }),
  component: CobrancasPage,
});

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined, currency = "BRL") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currency || "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

function parseDate(val: string | number | null | undefined): Date | null {
  if (!val) return null;
  // Unix timestamp em segundos (número) → converte para ms
  if (typeof val === "number") return new Date(val * 1000);
  // Se for string numérica (legado de dados já gravados)
  if (/^\d{9,11}$/.test(val)) return new Date(Number(val) * 1000);
  return new Date(val);
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
  const [fetching, setFetching] = useState(false);
  const [startDate, setStartDate] = useState<Date>(() => subDays(new Date(), 29));
  const [endDate, setEndDate] = useState<Date>(() => new Date());

  // Último snapshot salvo no banco
  const { data: snapshots = [], refetch: refetchSnapshots, isLoading } = useQuery({
    queryKey: ["billing_snapshots"],
    queryFn: async () => {
      // Pega o snapshot mais recente de cada conta
      const { data, error } = await (supabase as any)
        .from("billing_snapshots")
        .select("*")
        .order("fetched_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      // Deduplica: apenas o snapshot mais recente por conta
      const seen = new Set<string>();
      return (data ?? []).filter((s: any) => {
        if (seen.has(s.ad_account_id)) return false;
        seen.add(s.ad_account_id);
        return true;
      });
    },
  });

  const lastFetch = snapshots.length > 0
    ? snapshots.reduce((a: any, b: any) =>
        new Date(a.fetched_at) > new Date(b.fetched_at) ? a : b
      ).fetched_at
    : null;

  // Busca dados frescos da API Meta
  const handleFetch = async () => {
    setFetching(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error("Sessão expirada.");

      const { data, error } = await supabase.functions.invoke("get-meta-billing", {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      await refetchSnapshots();
    } catch (err: any) {
      alert(err.message ?? "Erro ao buscar dados de cobrança.");
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Meta Ads · Cobrança"
        title="Cobranças & Pagamentos"
        description="Saldo, forma de pagamento e histórico de transações das contas de anúncios."
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
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 transition disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${fetching ? "animate-spin" : ""}`} />
              {fetching ? "Buscando..." : "Atualizar Dados"}
            </button>
          </div>
        }
      />

      {lastFetch && (
        <p className="text-[10px] text-muted-foreground font-mono -mt-4">
          Última atualização: {fmtDate(lastFetch)}
        </p>
      )}

      {/* Estado vazio */}
      {!isLoading && snapshots.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col items-center gap-4 py-20 text-center"
        >
          <div className="h-16 w-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Receipt className="h-7 w-7 text-primary/60" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-bold">Nenhum dado de cobrança ainda</p>
            <p className="text-xs text-muted-foreground max-w-sm">
              Clique em "Atualizar Dados" para buscar as informações de cobrança das contas Meta Ads conectadas.
            </p>
          </div>
          <button
            onClick={handleFetch}
            disabled={fetching}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90 transition"
          >
            <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "Buscando..." : "Buscar Agora"}
          </button>
        </motion.div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {/* Cards de contas */}
      {!isLoading && snapshots.length > 0 && (
        <div className="space-y-4">
          {snapshots.map((snap: any, i: number) => {
            const isExpanded = expandedAccount === snap.ad_account_id;
            const funding = snap.funding_source;
            const allTxs: any[] = snap.transactions ?? [];
            const rangeStart = startOfDay(startDate);
            const rangeEnd = endOfDay(endDate);
            const txs = allTxs.filter((tx: any) => {
              const d = parseDate(tx.created_at);
              if (!d) return true;
              return d >= rangeStart && d <= rangeEnd;
            });
            const lastTx = allTxs[0] ?? null;
            const statusCfg = lastTx ? (STATUS_CONFIG[lastTx.status] ?? STATUS_CONFIG.PENDING) : null;

            return (
              <motion.div
                key={snap.ad_account_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="rounded-2xl border border-white/5 bg-background/40 overflow-hidden"
              >
                {/* Header do card */}
                <div className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    {/* Info da conta */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold truncate">{snap.ad_account_name || snap.ad_account_id}</p>
                        <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">{snap.ad_account_id}</p>
                      </div>
                    </div>

                    {/* Status do último pagamento */}
                    {statusCfg && lastTx && (
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider shrink-0 ${statusCfg.color}`}>
                        <statusCfg.icon className="h-3 w-3" />
                        {statusCfg.label}
                      </span>
                    )}
                  </div>

                  {/* KPI row */}
                  <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Gasto total */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Gasto Total</span>
                      </div>
                      <p className="text-base font-black text-foreground leading-none">
                        {fmtBRL(snap.amount_spent, snap.currency)}
                      </p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">lifetime acumulado</p>
                    </div>

                    {/* Saldo / não faturado */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <Wallet className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">
                          {snap.balance !== null ? "Saldo" : "Não Faturado"}
                        </span>
                      </div>
                      <p className="text-base font-black text-foreground leading-none">
                        {snap.balance !== null
                          ? fmtBRL(snap.balance, snap.currency)
                          : snap.bill_immature !== null
                            ? fmtBRL(snap.bill_immature, snap.currency)
                            : "—"}
                      </p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">
                        {snap.balance !== null ? "conta pré-paga" : "ciclo atual"}
                      </p>
                    </div>

                    {/* Limite de gasto */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <ShieldCheck className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Limite Gasto</span>
                      </div>
                      <p className="text-base font-black text-foreground leading-none">
                        {fmtBRL(snap.spend_cap, snap.currency)}
                      </p>
                      <p className="text-[9px] text-muted-foreground/50 mt-0.5">spend cap</p>
                    </div>

                    {/* Forma de pagamento */}
                    <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3">
                      <div className="flex items-center gap-1.5 mb-1">
                        <CreditCard className="h-3 w-3 text-muted-foreground/50" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Pagamento</span>
                      </div>
                      {funding ? (
                        <>
                          <p className="text-[11px] font-bold text-foreground leading-none">
                            {FUNDING_TYPE_LABEL[funding.type] ?? funding.type ?? "—"}
                          </p>
                          {funding.display_string && (
                            <p className="text-[9px] text-muted-foreground/60 font-mono mt-0.5">{funding.display_string}</p>
                          )}
                        </>
                      ) : (
                        <p className="text-[11px] font-bold text-muted-foreground/40">Não informado</p>
                      )}
                    </div>
                  </div>

                  {/* Toggle transações */}
                  {allTxs.length > 0 && (
                    <button
                      onClick={() => setExpandedAccount(isExpanded ? null : snap.ad_account_id)}
                      className="mt-4 w-full flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-muted-foreground transition-all"
                    >
                      <span className="flex items-center gap-2">
                        <Receipt className="h-3.5 w-3.5" />
                        {txs.length} transaç{txs.length === 1 ? "ão" : "ões"} no período
                        {txs.length < allTxs.length && (
                          <span className="text-[9px] font-normal opacity-50">({allTxs.length} no total)</span>
                        )}
                      </span>
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>

                {/* Tabela de transações */}
                {isExpanded && txs.length > 0 && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="border-t border-white/5 overflow-hidden"
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-white/5 bg-white/[0.02]">
                            <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Data</th>
                            <th className="px-4 py-2.5 text-left text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Motivo</th>
                            <th className="px-4 py-2.5 text-right text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Valor</th>
                            <th className="px-4 py-2.5 text-center text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {txs.map((tx: any) => {
                            const cfg = STATUS_CONFIG[tx.status] ?? STATUS_CONFIG.PENDING;
                            return (
                              <tr key={tx.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors">
                                <td className="px-4 py-3 text-muted-foreground font-mono text-[10px] whitespace-nowrap">
                                  {fmtDate(tx.created_at)}
                                </td>
                                <td className="px-4 py-3 text-foreground">
                                  {BILLING_REASON_LABEL[tx.billing_reason] ?? tx.billing_reason ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-right font-bold text-foreground whitespace-nowrap">
                                  {fmtBRL(tx.amount, tx.currency ?? snap.currency)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cfg.color}`}>
                                    <cfg.icon className="h-2.5 w-2.5" />
                                    {cfg.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </motion.div>
                )}

                {/* Sem transações no período */}
                {isExpanded && txs.length === 0 && (
                  <div className="border-t border-white/5 px-4 py-6 text-center">
                    <p className="text-xs text-muted-foreground/50">
                      {allTxs.length > 0
                        ? "Nenhuma transação no período selecionado. Ajuste o filtro de datas."
                        : "Nenhuma transação encontrada para esta conta."}
                    </p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Aviso */}
      <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4 flex items-start gap-3">
        <AlertCircle className="h-4 w-4 text-muted-foreground/40 shrink-0 mt-0.5" />
        <p className="text-[11px] text-muted-foreground/50 leading-relaxed">
          Os dados de cobrança são fornecidos diretamente pela API do Meta Ads. O saldo disponível aparece apenas em contas pré-pagas. Para contas pós-pagas (cartão de crédito), o campo "Não Faturado" mostra os gastos do ciclo atual ainda não cobrados.
        </p>
      </div>
    </div>
  );
}
