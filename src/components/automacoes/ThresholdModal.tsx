import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  X, Loader2, Pencil, ShieldAlert, AlertTriangle,
  TrendingUp, Radio, DollarSign, BellRing, Sparkles
} from "lucide-react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { triggerEvaluation } from "@/hooks/useAlertEngine";

export function ThresholdModal({ onClose, accounts, userId, qc, editing }: any) {
  const isEditing = !!editing;

  const [accountId, setAccountId] = useState<string>(
    isEditing ? (editing.ad_account_id ?? "all") : "all"
  );
  const [campaignId, setCampaignId] = useState<string>(
    isEditing ? (editing.campaign_id ?? "all") : "all"
  );
  const [excludedIds, setExcludedIds] = useState<Set<string>>(
    isEditing && editing.excluded_account_ids
      ? new Set<string>(editing.excluded_account_ids)
      : new Set<string>()
  );
  const [maxCpl, setMaxCpl] = useState(
    isEditing && editing.max_cpl != null ? String(editing.max_cpl) : ""
  );
  const [maxBudgetPct, setMaxBudgetPct] = useState(
    isEditing && editing.max_budget_pct != null ? String(editing.max_budget_pct) : "90"
  );
  const [maxFrequency, setMaxFrequency] = useState(
    isEditing && editing.max_frequency != null ? String(editing.max_frequency) : "3.5"
  );
  const [minSpend, setMinSpend] = useState(
    isEditing && editing.min_spend_threshold != null ? String(editing.min_spend_threshold) : "0"
  );
  const [minAccountBalance, setMinAccountBalance] = useState(
    isEditing && editing.min_account_balance != null ? String(editing.min_account_balance) : "100"
  );
  const [alertCplEnabled,       setAlertCplEnabled]       = useState(isEditing ? editing.alert_cpl_enabled       !== false : true);
  const [alertBudgetEnabled,    setAlertBudgetEnabled]    = useState(isEditing ? editing.alert_budget_enabled    !== false : true);
  const [alertFrequencyEnabled, setAlertFrequencyEnabled] = useState(isEditing ? editing.alert_frequency_enabled !== false : true);
  const [alertAccountBalanceEnabled, setAlertAccountBalanceEnabled] = useState(isEditing ? editing.alert_account_balance_enabled === true : false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redes sociais
  const [socialPageId, setSocialPageId] = useState<string>(
    isEditing ? (editing.social_page_id ?? "none") : "none"
  );
  const [minIgFollowers, setMinIgFollowers] = useState<string>(
    isEditing && editing.min_ig_followers != null ? String(editing.min_ig_followers) : ""
  );
  const [minFbFollowers, setMinFbFollowers] = useState<string>(
    isEditing && editing.min_fb_followers != null ? String(editing.min_fb_followers) : ""
  );
  const [maxDaysWithoutPosts, setMaxDaysWithoutPosts] = useState<string>(
    isEditing && editing.max_days_without_posts != null ? String(editing.max_days_without_posts) : ""
  );
  const [minPostEngagementRate, setMinPostEngagementRate] = useState<string>(
    isEditing && editing.min_post_engagement_rate != null ? String(editing.min_post_engagement_rate) : ""
  );
  const [ruleType, setRuleType] = useState<"traffic" | "social">(
    isEditing && editing.social_page_id ? "social" : "traffic"
  );

  // Carregar páginas de redes sociais
  const { data: socialPages = [] } = useQuery({
    queryKey: ["social_pages_for_modal"],
    queryFn: async () => {
      const { data } = await supabase.from("social_pages").select("id, page_name").order("page_name");
      return data || [];
    }
  });

  // Carregar campanhas da conta ativa
  const { data: campaigns = [], isLoading: loadingCampaigns } = useQuery({
    queryKey: ["campaigns_for_threshold_modal", accountId],
    queryFn: async () => {
      if (!accountId || accountId === "all") return [];
      const { data, error } = await (supabase as any)
        .from("campaigns")
        .select("id, name")
        .eq("ad_account_id", accountId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!accountId && accountId !== "all",
  });

  // Resetar a campanha selecionada se mudar a conta
  useEffect(() => {
    if (!isEditing) {
      setCampaignId("all");
    }
  }, [accountId]);

  const toggleExclusion = (id: string) => {
    setExcludedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (ruleType === "traffic") {
      const targetAccountId = accountId === "all" ? null : accountId;
      if (!alertCplEnabled && !alertBudgetEnabled && !alertFrequencyEnabled && !alertAccountBalanceEnabled) {
        return toast.error("Ative pelo menos um tipo de alerta (CPL, Orçamento, Frequência ou Saldo)");
      }
      if (alertCplEnabled && (!maxCpl || parseFloat(maxCpl) <= 0)) {
        return toast.error("Informe o CPL Máximo para ativar o alerta de CPL");
      }
      if (alertBudgetEnabled && (!maxBudgetPct || parseInt(maxBudgetPct) <= 0)) {
        return toast.error("Informe o % de Orçamento para ativar o alerta de budget");
      }
      if (alertFrequencyEnabled && (!maxFrequency || parseFloat(maxFrequency) <= 0)) {
        return toast.error("Informe a Frequência Máxima para ativar o alerta de frequência");
      }
      if (alertAccountBalanceEnabled && (!minAccountBalance || parseFloat(minAccountBalance) < 0)) {
        return toast.error("Informe o Saldo Mínimo para ativar o alerta de saldo da conta");
      }
    } else {
      if (socialPageId === "none") {
        return toast.error("Selecione uma Página de Redes Sociais para monitorar");
      }
      if (!minIgFollowers && !minFbFollowers && !maxDaysWithoutPosts && !minPostEngagementRate) {
        return toast.error("Informe pelo menos um limite ou métrica para monitorar (Seguidores, Dias sem postar ou Engajamento)");
      }
    }

    setIsSubmitting(true);
    try {
      let payload: any = {};
      if (ruleType === "traffic") {
        payload = {
          ad_account_id:           accountId === "all" ? null : accountId,
          campaign_id:             campaignId !== "all" ? campaignId : null,
          max_cpl:                 alertCplEnabled && maxCpl ? parseFloat(maxCpl) : null,
          max_budget_pct:          alertBudgetEnabled && maxBudgetPct ? parseInt(maxBudgetPct) : null,
          max_frequency:           alertFrequencyEnabled && maxFrequency ? parseFloat(maxFrequency) : null,
          min_spend_threshold:     minSpend ? parseFloat(minSpend) : 0,
          min_account_balance:     alertAccountBalanceEnabled && minAccountBalance ? parseFloat(minAccountBalance) : 0,
          alert_cpl_enabled:       alertCplEnabled,
          alert_budget_enabled:    alertBudgetEnabled,
          alert_frequency_enabled: alertFrequencyEnabled,
          alert_account_balance_enabled: alertAccountBalanceEnabled,
          excluded_account_ids:    accountId === "all" && excludedIds.size > 0 ? Array.from(excludedIds) : [],
        };
      } else {
        payload = {
          social_page_id:          socialPageId !== "none" ? socialPageId : null,
          min_ig_followers:        minIgFollowers ? parseInt(minIgFollowers) : null,
          min_fb_followers:        minFbFollowers ? parseInt(minFbFollowers) : null,
          max_days_without_posts:  maxDaysWithoutPosts ? parseInt(maxDaysWithoutPosts) : null,
          min_post_engagement_rate: minPostEngagementRate ? parseFloat(minPostEngagementRate) : null,
        };
      }

      if (isEditing) {
        // ── UPDATE ──────────────────────────────────────────────────────────
        const { error } = await (supabase as any)
          .from("alert_thresholds")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Regra atualizada com sucesso!");
      } else {
        // ── INSERT ──────────────────────────────────────────────────────────
        const { error } = await (supabase as any).from("alert_thresholds").insert({
          user_id:   userId,
          is_active: true,
          ...payload,
        });
        if (error) throw error;
        toast.success("Regra de alerta configurada! O sistema avaliará campanhas a cada 5 min.");
      }
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      triggerEvaluation();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end bg-background/80 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 32, stiffness: 320 }}
        className="glass-panel w-full max-w-md h-full flex flex-col shadow-2xl border-l border-primary/20 bg-card rounded-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Fixo no topo) */}
        <div className="shrink-0 flex items-center justify-between border-b border-white/5 p-6 bg-white/5">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              isEditing ? "bg-blue-500/20 text-blue-400" : "bg-primary/20 text-primary"
            }`}>
              {isEditing ? <Pencil className="h-5 w-5" /> : <ShieldAlert className="h-5 w-5 fill-current" />}
            </div>
            <div>
              <h3 className="font-display text-base font-bold leading-tight">
                {isEditing ? "Editar Regra de Alerta" : "Novo Alerta de Conta"}
              </h3>
              <p className="text-[9px] text-muted-foreground uppercase tracking-widest font-bold font-mono">
                {isEditing ? "Altere os parâmetros da regra" : "Monitoramento de CPL e Orçamento"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10 transition text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulário Scrollable (Corpo com min-h-0 para forçar flexbox scroll) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          
          {/* Segmented Control de Tipo de Regra */}
          {!isEditing ? (
            <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/5 shrink-0">
              <button
                type="button"
                onClick={() => setRuleType("traffic")}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  ruleType === "traffic"
                    ? "bg-primary text-black shadow-glow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                Tráfego Pago
              </button>
              <button
                type="button"
                onClick={() => setRuleType("social")}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  ruleType === "social"
                    ? "bg-blue-500 text-white shadow-glow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
              >
                Redes Sociais
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between bg-white/5 px-4 py-2.5 rounded-xl border border-white/5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase">Tipo de Regra</span>
              <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                ruleType === "social" ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-primary/20 text-primary border border-primary/30"
              }`}>
                {ruleType === "social" ? "Redes Sociais" : "Tráfego Pago"}
              </span>
            </div>
          )}

          {ruleType === "traffic" && (
            <>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">
                  Conta de Anúncios
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="all">Todas as Contas Meta (Alerta Global)</option>
                  {accounts.map((a: any) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>

              {accountId !== "all" && (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">
                    Campanha (Opcional)
                  </label>
                  {loadingCampaigns ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando campanhas...
                    </div>
                  ) : (
                    <select
                      value={campaignId}
                      onChange={(e) => setCampaignId(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none cursor-pointer"
                    >
                      <option value="all">Todas as Campanhas da Conta (Alerta Geral da Conta)</option>
                      {campaigns.map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  )}
                  <p className="text-[9px] text-muted-foreground">
                    Selecione uma campanha específica para monitorar o CPL, Frequência e Orçamento dela.
                  </p>
                </div>
              )}

              {accountId !== "all" && campaignId === "all" && (
                <div className="rounded-xl border border-secondary/30 bg-secondary/10 px-4 py-3 text-[11px] text-secondary leading-relaxed">
                  <strong>Exceção de conta:</strong> esta regra substituirá o alerta global para a conta selecionada. A regra global não será avaliada para ela.
                </div>
              )}

              {accountId === "all" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">
                      Excluir Contas (opcional)
                    </label>
                    {excludedIds.size > 0 && (
                      <span className="text-[9px] font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        {excludedIds.size} excluída{excludedIds.size > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-white/10 bg-background divide-y divide-white/5">
                    {accounts.map((a: any) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => toggleExclusion(a.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-xs transition hover:bg-white/5 ${excludedIds.has(a.id) ? "text-destructive" : "text-foreground"}`}
                      >
                        <span className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 transition ${excludedIds.has(a.id) ? "bg-destructive/20 border-destructive text-destructive" : "border-white/20"}`}>
                          {excludedIds.has(a.id) && <X className="h-2.5 w-2.5" />}
                        </span>
                        {a.name}
                      </button>
                    ))}
                  </div>
                  {excludedIds.size > 0 && (
                    <p className="text-[9px] text-muted-foreground">
                      O alerta global não será disparado para as contas marcadas acima.
                    </p>
                  )}
                </div>
              )}

              {/* ── ALERTA DE CPL ───────────────────────────────────────────────── */}
              <div className={`rounded-xl border p-4 space-y-3 transition-all ${
                alertCplEnabled ? "border-red-500/40 bg-red-500/5" : "border-white/10 bg-white/[0.02]"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className={`h-4 w-4 ${alertCplEnabled ? "text-red-400" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${alertCplEnabled ? "text-red-400" : "text-muted-foreground"}`}>Alerta de CPL</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60">Custo Por Lead</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlertCplEnabled(v => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${alertCplEnabled ? "bg-red-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${alertCplEnabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
                {alertCplEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">CPL Máximo (R$)</label>
                    <input
                      type="number" step="0.01" min="0.01" value={maxCpl}
                      onChange={(e) => setMaxCpl(e.target.value)}
                      placeholder="Ex: 15.50"
                      className="w-full rounded-lg border border-red-500/30 bg-background px-3 py-2.5 text-sm focus:border-red-400 focus:outline-none"
                    />
                    <p className="text-[9px] text-muted-foreground">Alerta quando CPL do dia superar este valor</p>
                  </div>
                )}
              </div>

              {/* ── ALERTA DE ORÇAMENTO ─────────────────────────────────────────── */}
              <div className={`rounded-xl border p-4 space-y-3 transition-all ${
                alertBudgetEnabled ? "border-yellow-500/40 bg-yellow-500/5" : "border-white/10 bg-white/[0.02]"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className={`h-4 w-4 ${alertBudgetEnabled ? "text-yellow-400" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${alertBudgetEnabled ? "text-yellow-400" : "text-muted-foreground"}`}>Alerta de Orçamento</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60">Budget Diário</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlertBudgetEnabled(v => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${alertBudgetEnabled ? "bg-yellow-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${alertBudgetEnabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
                {alertBudgetEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Aviso quando atingir (%)</label>
                    <input
                      type="number" min="1" max="100" value={maxBudgetPct}
                      onChange={(e) => setMaxBudgetPct(e.target.value)}
                      placeholder="Ex: 90"
                      className="w-full rounded-lg border border-yellow-500/30 bg-background px-3 py-2.5 text-sm focus:border-yellow-400 focus:outline-none"
                    />
                    <p className="text-[9px] text-muted-foreground">Alerta quando orçamento diário atingir este % do total</p>
                  </div>
                )}
              </div>

              {/* ── ALERTA DE FREQUÊNCIA ────────────────────────────────────────── */}
              <div className={`rounded-xl border p-4 space-y-3 transition-all ${
                alertFrequencyEnabled ? "border-orange-500/40 bg-orange-500/5" : "border-white/10 bg-white/[0.02]"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Radio className={`h-4 w-4 ${alertFrequencyEnabled ? "text-orange-400" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${alertFrequencyEnabled ? "text-orange-400" : "text-muted-foreground"}`}>Alerta de Frequência</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60">Saturação de Audiência</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlertFrequencyEnabled(v => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${alertFrequencyEnabled ? "bg-orange-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${alertFrequencyEnabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
                {alertFrequencyEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Frequência Máxima (×)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" step="0.1" min="1" max="10" value={maxFrequency}
                        onChange={(e) => setMaxFrequency(e.target.value)}
                        placeholder="3.5"
                        className="w-full rounded-lg border border-orange-500/30 bg-background px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none"
                      />
                      <span className="text-sm font-bold text-muted-foreground shrink-0">×</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground">Alerta quando a frequência média ultrapassar este valor. Padrão 3.5× para automotivo.</p>
                  </div>
                )}
              </div>

              {/* ── ALERTA DE SALDO DA CONTA ────────────────────────────────────── */}
              <div className={`rounded-xl border p-4 space-y-3 transition-all ${
                alertAccountBalanceEnabled ? "border-emerald-500/40 bg-emerald-500/5" : "border-white/10 bg-white/[0.02]"
              }`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className={`h-4 w-4 ${alertAccountBalanceEnabled ? "text-emerald-400" : "text-muted-foreground"}`} />
                    <span className={`text-sm font-bold ${alertAccountBalanceEnabled ? "text-emerald-400" : "text-muted-foreground"}`}>Alerta de Saldo da Conta</span>
                    <span className="text-[9px] font-mono text-muted-foreground/60">Saldo Global</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAlertAccountBalanceEnabled(v => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${alertAccountBalanceEnabled ? "bg-emerald-500" : "bg-white/15"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${alertAccountBalanceEnabled ? "left-4" : "left-0.5"}`} />
                  </button>
                </div>
                {alertAccountBalanceEnabled && (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Saldo Mínimo de Aviso (R$)</label>
                    <input
                      type="number" step="0.01" min="0" value={minAccountBalance}
                      onChange={(e) => setMinAccountBalance(e.target.value)}
                      placeholder="Ex: 100.00"
                      className="w-full rounded-lg border border-emerald-500/30 bg-background px-3 py-2.5 text-sm focus:border-emerald-400 focus:outline-none"
                    />
                    <p className="text-[9px] text-muted-foreground">Alerta de emergência caso o saldo restante na conta (contas pré-pagas) ou não-faturado fique abaixo deste valor. Evita pausas nas campanhas.</p>
                  </div>
                )}
              </div>

              {/* ── Gasto mínimo ───────────────────────────────────────────────── */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">
                  Gasto mínimo para alertar (R$)
                </label>
                <input
                  type="number" step="0.01" min="0" value={minSpend}
                  onChange={(e) => setMinSpend(e.target.value)}
                  placeholder="0 = sempre alertar"
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground">Ignora campanhas com gasto abaixo deste valor — evita ruído de campanhas com budget muito baixo.</p>
              </div>
            </>
          )}

          {ruleType === "social" && (
            <>
              {/* Seleção de Página Social */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">
                  Página de Redes Sociais
                </label>
                <select
                  value={socialPageId}
                  onChange={(e) => setSocialPageId(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none cursor-pointer"
                >
                  <option value="none">Selecione uma Página...</option>
                  {socialPages.map((sp: any) => (
                    <option key={sp.id} value={sp.id}>{sp.page_name}</option>
                  ))}
                </select>
                <p className="text-[9px] text-muted-foreground">
                  Escolha a página do Instagram/Facebook vinculada que deseja monitorar.
                </p>
              </div>

              {/* Métrica: Instagram Followers */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Seguidores Mínimos (Instagram)</span>
                </div>
                <input
                  type="number"
                  placeholder="Ex: 5000 (deixe em branco se não quiser monitorar)"
                  value={minIgFollowers}
                  onChange={(e) => setMinIgFollowers(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground">Alerta se os seguidores caírem abaixo deste valor.</p>
              </div>

              {/* Métrica: Facebook Followers */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Seguidores Mínimos (Facebook)</span>
                </div>
                <input
                  type="number"
                  placeholder="Ex: 1000 (deixe em branco se não quiser monitorar)"
                  value={minFbFollowers}
                  onChange={(e) => setMinFbFollowers(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground">Alerta se as curtidas/seguidores caírem abaixo deste valor.</p>
              </div>

              {/* Inatividade (Dias sem postar) */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Dias Máximos sem Postar</span>
                </div>
                <input
                  type="number"
                  placeholder="Ex: 7 (deixe em branco se não quiser monitorar)"
                  value={maxDaysWithoutPosts}
                  onChange={(e) => setMaxDaysWithoutPosts(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground">Alerta se o perfil ficar inativo (sem novos posts) por mais que este número de dias.</p>
              </div>

              {/* Taxa de Engajamento Mínima */}
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">Taxa de Engajamento Mínima (%)</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 1.5 (deixe em branco se não quiser monitorar)"
                  value={minPostEngagementRate}
                  onChange={(e) => setMinPostEngagementRate(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
                <p className="text-[9px] text-muted-foreground">Alerta se a média de engajamento do post cair abaixo deste percentual.</p>
              </div>
            </>
          )}
        </div>

        {/* Footer (Fixo embaixo) */}
        <div className="shrink-0 flex gap-3 justify-end border-t border-white/10 p-6 bg-white/5 pb-safe">
          <button
            onClick={onClose}
            className="rounded-full px-5 py-2.5 text-xs font-bold text-muted-foreground hover:bg-white/10 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className={`rounded-full px-6 py-2.5 text-xs font-black text-background hover:scale-105 active:scale-95 transition flex items-center gap-2 ${
              isEditing ? "bg-blue-500 hover:bg-blue-400" : "bg-primary"
            }`}
          >
            {isSubmitting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : isEditing
              ? <Pencil className="h-4 w-4" />
              : <ShieldAlert className="h-4 w-4" />}
            {isEditing ? "SALVAR ALTERAÇÕES" : "SALVAR E ATIVAR"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

