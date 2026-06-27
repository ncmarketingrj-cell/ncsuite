import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Loader2, Play, Pause, Clock, History, AlertTriangle,
  ShieldAlert, Plus, X, Server, CheckCircle2, RefreshCw,
  Bell, TrendingUp, DollarSign, AlertCircle, Timer, Pencil, Radio,
  Settings2, Volume2, VolumeX, BellOff, BellRing, Moon, RotateCcw, Lock, Sparkles
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { DiagnosisModal } from "@/components/victoria/DiagnosisModal";
import { getSyncStatus, useAutoSync } from "@/hooks/useAutoSync";
import {
  triggerEvaluation, getEvalStatus, EVAL_STATUS_EVENT, type EvalStatus,
  getSoundEnabled, setSoundEnabled, SOUND_CHANGED_EVENT,
  getNotifPrefs, setNotifPrefs, NOTIF_PREFS_CHANGED_EVENT, type NotifPrefs,
} from "@/hooks/useAlertEngine";
import { formatDistanceToNow, formatDistance } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => ({ meta: [{ title: "Automações e Alertas — NC Suite" }] }),
  component: AutomationsPage,
});

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<"thresholds" | "sync" | "logs" | "prefs">("thresholds");
  const [modal, setModal] = useState(false);
  const [editingThreshold, setEditingThreshold] = useState<any | null>(null);
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await (supabase as any).from("profiles").select("role, permissions").eq("id", user.id).maybeSingle();
      return data as { role: string; permissions: Record<string, boolean> } | null;
    },
    enabled: !!user?.id,
  });
  const hasAccess = (user?.email ? ADMIN_EMAILS.includes(user.email) : false)
    || profileData?.role === "admin"
    || !!profileData?.permissions?.automacoes;
  const syncStatus = getSyncStatus();
  const { runSync } = useAutoSync();

  // ── Eval status ─────────────────────────────────────────────────────────────
  const [evalStatus, setEvalStatus] = useState<EvalStatus>(getEvalStatus);

  // ── Preferências de notificação (localStorage) ───────────────────────────────
  const [soundOn, setSoundOn]     = useState(getSoundEnabled);
  const [prefs, setPrefsState]    = useState<NotifPrefs>(getNotifPrefs);
  const [selectedDiagnoseCampId, setSelectedDiagnoseCampId] = useState<string | null>(null);
  const [selectedDiagnoseCampName, setSelectedDiagnoseCampName] = useState<string>("");
  const [isDiagnoseOpen, setIsDiagnoseOpen] = useState(false);

  useEffect(() => {
    const onSound = (e: Event) => setSoundOn((e as CustomEvent).detail);
    const onPrefs = (e: Event) => setPrefsState((e as CustomEvent).detail);
    window.addEventListener(SOUND_CHANGED_EVENT, onSound as EventListener);
    window.addEventListener(NOTIF_PREFS_CHANGED_EVENT, onPrefs as EventListener);
    return () => {
      window.removeEventListener(SOUND_CHANGED_EVENT, onSound as EventListener);
      window.removeEventListener(NOTIF_PREFS_CHANGED_EVENT, onPrefs as EventListener);
    };
  }, []);

  const toggleSound = () => setSoundEnabled(!getSoundEnabled());
  const updatePrefs = (patch: Partial<NotifPrefs>) => setNotifPrefs(patch);

  useEffect(() => {
    const handler = (e: CustomEvent) => setEvalStatus(e.detail);
    window.addEventListener(EVAL_STATUS_EVENT, handler as EventListener);
    return () => window.removeEventListener(EVAL_STATUS_EVENT, handler as EventListener);
  }, []);

  // ── Contas ──────────────────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    },
  });

  // ── Thresholds ──────────────────────────────────────────────────────────────
  const { data: thresholds = [], isLoading: loadingThresholds } = useQuery({
    queryKey: ["alert_thresholds"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("alert_thresholds")
        .select("*, ad_accounts(name), campaigns(name)")
        .order("created_at", { ascending: false });
      return (data as any[]) || [];
    },
  });

  // ── Violações ativas (notificações não lidas de alerta) ──────────────────────
  const { data: activeViolations = [], refetch: refetchViolations } = useQuery({
    queryKey: ["active_violations"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("notifications")
        .select("*")
        .in("type", ["alert_cpl", "alert_budget", "alert_frequency"])
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
    refetchInterval: 15000,
  });

  // Atualizar violations quando o eval termina
  useEffect(() => {
    if (!evalStatus.isEvaluating) refetchViolations();
  }, [evalStatus.isEvaluating, refetchViolations]);

  // ── Histórico sync ──────────────────────────────────────────────────────────
  const { data: syncHistory = [], isLoading: loadingSync } = useQuery({
    queryKey: ["sync_history"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sync_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return (data as any[]) || [];
    },
  });

  const toggleThreshold = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("alert_thresholds").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      toast.success("Status atualizado!");
    },
  });

  const deleteThreshold = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("alert_thresholds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      toast.success("Regra removida!");
    },
  });

  const markViolationRead = async (id: string) => {
    await (supabase as any).from("notifications").update({ is_read: true }).eq("id", id);
    refetchViolations();
  };

  const markAllViolationsRead = async () => {
    const ids = activeViolations.map((v: any) => v.id);
    if (!ids.length) return;
    await (supabase as any).from("notifications").update({ is_read: true }).in("id", ids);
    refetchViolations();
    toast.success("Todos alertas marcados como lidos");
  };

  const handleVerifyNow = () => {
    triggerEvaluation();
    toast.info("Avaliando campanhas...", { duration: 2500 });
  };

  if (profileLoading) return null;

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
        <div className="h-16 w-16 rounded-2xl bg-destructive/10 border border-destructive/20 flex items-center justify-center">
          <Lock className="h-7 w-7 text-destructive" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black tracking-tight">Acesso Restrito</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Você não tem acesso às Automações e Alertas. Solicite ao administrador.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-20">
      <PageHeader
        eyebrow="Monitoramento Inteligente"
        title="Motor de Alertas"
        description="Configure tetos de CPL e monitore o orçamento diário das suas campanhas."
        compact
        actions={
          <button
            onClick={() => setModal(true)}
            className="shrink-0 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-bold text-background shadow-glow transition hover:scale-105 active:scale-95"
          >
            <ShieldAlert className="h-3.5 w-3.5 fill-current" />
            <span className="hidden sm:inline">Novo Alerta de Conta</span>
            <span className="sm:hidden">Novo Alerta</span>
          </button>
        }
      />

      {/* Tabs — scrollável no mobile */}
      <div className="flex overflow-x-auto scrollbar-hide gap-1 rounded-xl bg-background/50 p-1 border border-white/5 backdrop-blur-md">
        {[
          { id: "thresholds", label: "Limites de Alerta",       short: "Limites",   icon: AlertTriangle },
          { id: "prefs",      label: "Preferências",            short: "Prefs",     icon: Settings2 },
          { id: "sync",       label: "Motor de Sincronização",  short: "Sync",      icon: Server },
          { id: "logs",       label: "Histórico de Sync",       short: "Histórico", icon: History },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`shrink-0 flex items-center gap-1.5 rounded-lg px-3 sm:px-4 py-2 text-xs font-bold transition whitespace-nowrap ${
              activeTab === tab.id ? "bg-white/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5 shrink-0" />
            <span className="sm:hidden">{tab.short.toUpperCase()}</span>
            <span className="hidden sm:inline">{tab.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* ══ TAB: THRESHOLDS ══════════════════════════════════════════════════════ */}
      {activeTab === "thresholds" && (
        <div className="space-y-5">

          {/* ── Motor Status Card ────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            {/* Info */}
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                {evalStatus.isEvaluating ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : evalStatus.error ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-success" />
                )}
                <span className="text-xs font-bold text-foreground">
                  {evalStatus.isEvaluating
                    ? "Avaliando campanhas..."
                    : evalStatus.error
                    ? "Erro na última avaliação"
                    : "Motor de alertas ativo"}
                </span>
                {!evalStatus.isEvaluating && evalStatus.violationsFound > 0 && (
                  <span className="rounded-full bg-destructive/20 text-destructive px-2 py-0.5 text-[9px] font-black">
                    {evalStatus.violationsFound} nova{evalStatus.violationsFound !== 1 ? "s" : ""}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted-foreground font-mono">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {evalStatus.lastEval
                    ? `Última: ${formatDistanceToNow(new Date(evalStatus.lastEval), { addSuffix: true, locale: ptBR })}`
                    : "Aguardando primeira avaliação…"}
                </span>
                {evalStatus.nextEval && !evalStatus.isEvaluating && (
                  <span className="flex items-center gap-1">
                    <Timer className="h-3 w-3" />
                    Próxima em{" "}
                    {formatDistance(new Date(), new Date(evalStatus.nextEval), { locale: ptBR })}
                  </span>
                )}
                {evalStatus.error && (
                  <span className="text-destructive">{evalStatus.error}</span>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                Avalia CPL e orçamento de todas as campanhas ativas a cada 5 min.
                Quando uma regra é violada, cria notificação no sino e emite alerta sonoro.
              </p>
            </div>

            {/* Verify Now */}
            <button
              onClick={handleVerifyNow}
              disabled={evalStatus.isEvaluating}
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all active:scale-95 disabled:opacity-50 shrink-0"
            >
              {evalStatus.isEvaluating
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <RefreshCw className="h-3.5 w-3.5" />}
              Verificar Agora
            </button>
          </div>

          {/* ── Active Violations ─────────────────────────────────────────────── */}
          <AnimatePresence>
            {activeViolations.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="rounded-2xl border border-destructive/30 bg-destructive/5 overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-destructive/20">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4 text-destructive animate-pulse" />
                    <span className="text-xs font-bold text-destructive uppercase tracking-widest">
                      {activeViolations.length} Alerta{activeViolations.length !== 1 ? "s" : ""} Ativos
                    </span>
                  </div>
                  <button
                    onClick={markAllViolationsRead}
                    className="text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Marcar todos como lidos
                  </button>
                </div>

                <div className="divide-y divide-white/5">
                  {activeViolations.map((v: any, i: number) => (
                    <motion.div
                      key={v.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                    >
                      <div className={`mt-0.5 shrink-0 h-8 w-8 rounded-xl flex items-center justify-center ${
                        v.type === "alert_cpl"
                          ? "bg-red-500/15 text-red-400"
                          : v.type === "alert_frequency"
                          ? "bg-orange-500/15 text-orange-400"
                          : "bg-yellow-500/15 text-yellow-400"
                      }`}>
                        {v.type === "alert_cpl"
                          ? <TrendingUp className="h-4 w-4" />
                          : v.type === "alert_frequency"
                          ? <Radio className="h-4 w-4" />
                          : <DollarSign className="h-4 w-4" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-foreground/90 leading-snug">{v.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{v.message}</p>
                        <p className="text-[10px] text-muted-foreground/50 font-mono mt-1">
                          {formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                        {v.metadata?.db_campaign_id && (
                          <div className="mt-2">
                            <button
                              onClick={() => {
                                setSelectedDiagnoseCampId(v.metadata.db_campaign_id);
                                setSelectedDiagnoseCampName(v.metadata.campaign_name || "Campanha");
                                setIsDiagnoseOpen(true);
                              }}
                              className="inline-flex items-center gap-1 text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full hover:bg-primary/20 transition cursor-pointer"
                            >
                              <Sparkles className="h-2.5 w-2.5" /> Ver Motivo (IA)
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={() => markViolationRead(v.id)}
                        className="shrink-0 h-7 w-7 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                        title="Marcar como lido"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── How it works ──────────────────────────────────────────────────── */}
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm">
            <h5 className="font-bold text-primary flex items-center gap-2 mb-1.5">
              <span>💡</span> Como funcionam os Alertas Críticos?
            </h5>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O NC Suite avalia todas as campanhas ativas a cada 5 minutos. Se o CPL atual ultrapassar
              o teto configurado, ou se a campanha estiver prestes a esgotar o orçamento diário,
              o sistema cria uma notificação no sino, emite um alerta sonoro contínuo e envia uma
              notificação de browser (mesmo com o dashboard minimizado).
            </p>
          </div>

          {/* ── Rules list ────────────────────────────────────────────────────── */}
          {loadingThresholds ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary/50" />
            </div>
          ) : !thresholds.length ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-panel py-20 text-center flex flex-col items-center"
            >
              <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4 ring-1 ring-white/10">
                <ShieldAlert className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma regra de alerta configurada.</p>
              <button
                onClick={() => setModal(true)}
                className="mt-4 text-xs font-bold text-primary hover:underline"
              >
                Configurar primeira regra
              </button>
            </motion.div>
          ) : (
            <div className="grid gap-3">
              {(thresholds as any[]).map((th: any, i: number) => (
                <motion.div
                  key={th.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel card-sport flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:border-primary/30 gap-4"
                >
                  <div className="flex items-center gap-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${
                      th.is_active ? "bg-primary/10 text-primary shadow-glow-sm" : "bg-white/5 text-muted-foreground"
                    }`}>
                      <AlertTriangle className={`h-6 w-6 ${th.is_active ? "animate-pulse" : ""}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-base text-foreground/90">
                          {th.campaigns?.name ? `Campanha: ${th.campaigns.name}` : (th.ad_accounts?.name || (th.ad_account_id === null ? "Todas as Contas Meta" : "Conta Desconhecida"))}
                        </h4>
                        {th.campaign_id !== null && (
                          <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-primary/20 text-primary border border-primary/30">
                            CAMPANHA
                          </span>
                        )}
                        {th.campaign_id === null && th.ad_account_id !== null && (
                          <span className="inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-secondary/20 text-secondary border border-secondary/30">
                            EXCEÇÃO CONTA
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                        {th.max_cpl !== null && th.max_cpl !== undefined && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            MAX CPL:{" "}
                            <strong className="text-primary text-[11px]">
                              R$ {Number(th.max_cpl).toFixed(2)}
                            </strong>
                          </span>
                        )}
                        {th.max_budget_pct !== null && th.max_budget_pct !== undefined && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            ALERTA BUDGET:{" "}
                            <strong className="text-orange-400 text-[11px]">{th.max_budget_pct}%</strong>
                          </span>
                        )}
                        {th.max_frequency !== null && th.max_frequency !== undefined && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            FREQ MAX:{" "}
                            <strong className="text-orange-400 text-[11px]">{Number(th.max_frequency).toFixed(1)}×</strong>
                          </span>
                        )}
                        {th.alert_account_balance_enabled && th.min_account_balance !== null && th.min_account_balance !== undefined && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            MIN SALDO:{" "}
                            <strong className="text-emerald-400 text-[11px]">R$ {Number(th.min_account_balance).toFixed(2)}</strong>
                          </span>
                        )}
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[10px] font-bold ${
                          th.is_active
                            ? "bg-success/10 text-success"
                            : "bg-white/5 text-muted-foreground"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${th.is_active ? "bg-success animate-pulse" : "bg-muted-foreground"}`} />
                          {th.is_active ? "ATIVO" : "PAUSADO"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 sm:ml-auto">
                    <button
                      onClick={() => toggleThreshold.mutate({ id: th.id, is_active: !th.is_active })}
                      className={`h-9 px-3 flex items-center justify-center rounded-lg transition text-xs font-bold ${
                        th.is_active
                          ? "bg-white/5 text-muted-foreground hover:bg-white/10"
                          : "bg-primary/20 text-primary hover:bg-primary/30"
                      }`}
                    >
                      {th.is_active
                        ? <><Pause className="h-3.5 w-3.5 mr-1" /> PAUSAR</>
                        : <><Play className="h-3.5 w-3.5 mr-1 fill-current" /> ATIVAR</>}
                    </button>
                    <button
                      onClick={() => { setEditingThreshold(th); setModal(true); }}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 transition hover:bg-blue-500/20"
                      title="Editar regra"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => deleteThreshold.mutate(th.id)}
                      className="h-9 w-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive transition hover:bg-destructive/20"
                      title="Excluir regra"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══ TAB: PREFERÊNCIAS ═══════════════════════════════════════════════════ */}
      {activeTab === "prefs" && (
        <div className="space-y-4 max-w-2xl">

          {/* Som */}
          <div className="glass-panel p-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${soundOn ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Som dos alertas</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Alertas críticos emitem beep contínuo até ser reconhecido.</p>
              </div>
            </div>
            <button
              onClick={toggleSound}
              className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${soundOn ? "bg-primary" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${soundOn ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
            </button>
          </div>

          {/* Notificações de browser */}
          <div className="glass-panel p-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${prefs.browserEnabled ? "bg-primary/15 text-primary" : "bg-muted/30 text-muted-foreground"}`}>
                {prefs.browserEnabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Notificações de browser</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Popup na área de trabalho mesmo com o dashboard minimizado.</p>
              </div>
            </div>
            <button
              onClick={() => updatePrefs({ browserEnabled: !prefs.browserEnabled })}
              className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${prefs.browserEnabled ? "bg-primary" : "bg-white/10"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs.browserEnabled ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
            </button>
          </div>

          {/* Horário de silêncio */}
          <div className="glass-panel p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${prefs.quietHoursEnabled ? "bg-orange-500/15 text-orange-400" : "bg-muted/30 text-muted-foreground"}`}>
                  <Moon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-foreground">Horário de silêncio</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Sem som e sem notificações de browser neste período. Alertas continuam gravados no sino.</p>
                </div>
              </div>
              <button
                onClick={() => updatePrefs({ quietHoursEnabled: !prefs.quietHoursEnabled })}
                className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${prefs.quietHoursEnabled ? "bg-orange-400" : "bg-white/10"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs.quietHoursEnabled ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {prefs.quietHoursEnabled && (
              <div className="flex items-center gap-3 pl-13">
                <div className="flex items-center gap-2">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase">Das</label>
                  <input
                    type="time" value={prefs.quietStart}
                    onChange={e => updatePrefs({ quietStart: e.target.value })}
                    className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm font-mono focus:border-orange-400 focus:outline-none"
                  />
                </div>
                <span className="text-muted-foreground text-sm">até</span>
                <input
                  type="time" value={prefs.quietEnd}
                  onChange={e => updatePrefs({ quietEnd: e.target.value })}
                  className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm font-mono focus:border-orange-400 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Intervalo de re-alerta */}
          <div className="glass-panel p-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-secondary/15 text-secondary">
                <RotateCcw className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-foreground">Intervalo entre re-alertas</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Mesma campanha não será re-alertada antes deste período.</p>
              </div>
            </div>
            <select
              value={prefs.dedupWindowH}
              onChange={e => updatePrefs({ dedupWindowH: Number(e.target.value) })}
              className="rounded-lg border border-white/10 bg-background px-3 py-2 text-sm font-bold focus:border-primary focus:outline-none cursor-pointer shrink-0"
            >
              <option value={0.5}>30 min</option>
              <option value={1}>1 hora</option>
              <option value={2}>2 horas</option>
              <option value={4}>4 horas</option>
              <option value={8}>8 horas</option>
              <option value={24}>1 dia</option>
            </select>
          </div>

          <p className="text-[10px] text-muted-foreground/50 px-1">
            Todas as preferências são salvas localmente neste dispositivo.
          </p>
        </div>
      )}

      {/* ══ TAB: SYNC ════════════════════════════════════════════════════════════ */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          <div className="glass-panel p-6 flex flex-col md:flex-row gap-6 items-center justify-between border-primary/20">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="header-sport text-lg font-bold flex items-center gap-2 justify-center md:justify-start">
                <Server className="h-5 w-5 text-primary" /> Status do Motor de Auto-Sync
              </h3>
              <p className="text-sm text-muted-foreground max-w-xl">
                O motor sincroniza automaticamente com a Meta API a cada 3 minutos em background,
                processando todas as contas vinculadas.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white/5 rounded-xl p-5 min-w-[200px] border border-white/10">
              {syncStatus.isSyncing ? (
                <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                  <Loader2 className="h-8 w-8 text-primary animate-spin" />
                </div>
              ) : (
                <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center mb-3 ring-2 ring-success/30">
                  <Clock className="h-8 w-8 text-success" />
                </div>
              )}
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                {syncStatus.isSyncing ? "SINCRONIZANDO AGORA" : "PRÓXIMA SINCRONIZAÇÃO EM"}
              </p>
              {!syncStatus.isSyncing && syncStatus.nextSync && (
                <p className="text-xl font-mono font-black text-foreground">
                  {formatDistanceToNow(new Date(syncStatus.nextSync), { locale: ptBR })}
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => runSync("manual")}
              disabled={syncStatus.isSyncing}
              className="rounded-full bg-primary/20 text-primary border border-primary/30 px-8 py-3 text-sm font-bold shadow-glow hover:bg-primary/30 active:scale-95 transition disabled:opacity-50"
            >
              {syncStatus.isSyncing ? "Sincronização em Andamento..." : "Forçar Sincronização Agora"}
            </button>
          </div>
        </div>
      )}

      {/* ══ TAB: LOGS ════════════════════════════════════════════════════════════ */}
      {activeTab === "logs" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/20 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" />
            <h3 className="text-xs font-bold uppercase tracking-widest">Histórico de Extrações (Últimos 20)</h3>
          </div>
          <div className="w-full">
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="border-b border-white/5 bg-white/5">
                <tr>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Data/Hora</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-center">Contas</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-center">Campanhas</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Gatilho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingSync ? (
                  <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50 mx-auto" /></td></tr>
                ) : !syncHistory.length ? (
                  <tr><td colSpan={5} className="p-12 text-center text-muted-foreground italic text-xs">Nenhuma sincronização registrada.</td></tr>
                ) : syncHistory.map((log: any, i: number) => (
                  <motion.tr
                    key={log.id}
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/[0.03] transition"
                  >
                    <td className="p-4 font-mono text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black tracking-tighter ${
                        log.status === "success" ? "bg-success/20 text-success" :
                        log.status === "running" ? "bg-primary/20 text-primary animate-pulse" :
                        log.status === "partial_success" ? "bg-orange-500/20 text-orange-400" :
                        "bg-destructive/20 text-destructive"
                      }`}>
                        {log.status.toUpperCase()}
                      </span>
                      {log.error_message && (
                        <p className="text-[9px] text-destructive mt-1 max-w-xs truncate" title={log.error_message}>
                          {log.error_message}
                        </p>
                      )}
                    </td>
                    <td className="p-4 text-center font-mono font-bold">{log.accounts_synced || 0}</td>
                    <td className="p-4 text-center font-mono font-bold">{log.campaigns_synced || 0}</td>
                    <td className="p-4">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase bg-white/5 px-2 py-1 rounded">
                        {log.triggered_by === "auto" ? "BACKGROUND" : "MANUAL"}
                      </span>
                    </td>
                  </motion.tr>
                ))}
                </tbody>
              </table>
            </div>

            {/* --- MOBILE CARDS FOR LOGS --- */}
            <div className="flex flex-col gap-2 p-3 md:hidden">
              {loadingSync ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50" /></div>
              ) : !syncHistory.length ? (
                <div className="p-12 text-center text-muted-foreground italic text-xs">Nenhuma sincronização registrada.</div>
              ) : syncHistory.map((log: any, i: number) => (
                <motion.div
                  key={`mobile-${log.id}`}
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                  className="bg-white/[0.02] border border-white/5 rounded-xl p-3 flex flex-col gap-2"
                >
                  <div className="flex items-start justify-between">
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(log.created_at).toLocaleString("pt-BR")}
                    </span>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[8px] font-black tracking-tighter shrink-0 ${
                      log.status === "success" ? "bg-success/20 text-success" :
                      log.status === "running" ? "bg-primary/20 text-primary animate-pulse" :
                      log.status === "partial_success" ? "bg-orange-500/20 text-orange-400" :
                      "bg-destructive/20 text-destructive"
                    }`}>
                      {log.status.toUpperCase()}
                    </span>
                  </div>
                  
                  {log.error_message && (
                    <p className="text-[9px] text-destructive leading-tight bg-destructive/10 p-1.5 rounded" title={log.error_message}>
                      {log.error_message}
                    </p>
                  )}

                  <div className="flex items-center justify-between border-t border-white/5 pt-2 mt-1">
                    <div className="flex items-center gap-4">
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-widest text-muted-foreground">Contas</span>
                        <span className="font-mono font-bold text-[11px] text-foreground">{log.accounts_synced || 0}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-widest text-muted-foreground">Campanhas</span>
                        <span className="font-mono font-bold text-[11px] text-foreground">{log.campaigns_synced || 0}</span>
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase bg-white/5 px-2 py-1 rounded">
                      {log.triggered_by === "auto" ? "BACKGROUND" : "MANUAL"}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Modal Novo / Editar Threshold */}
      <AnimatePresence>
        {modal && (
          <ThresholdModal
            onClose={() => { setModal(false); setEditingThreshold(null); }}
            accounts={accounts}
            userId={user?.id}
            qc={qc}
            editing={editingThreshold}
          />
        )}
      </AnimatePresence>

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

function ThresholdModal({ onClose, accounts, userId, qc, editing }: any) {
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
    const targetAccountId = accountId === "all" ? null : accountId;
    if (!alertCplEnabled && !alertBudgetEnabled && !alertFrequencyEnabled) {
      return toast.error("Ative pelo menos um tipo de alerta (CPL, Orçamento ou Frequência)");
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

    setIsSubmitting(true);
    try {
      const commonFields = {
        ad_account_id:           targetAccountId,
        campaign_id:             campaignId === "all" ? null : campaignId,
        max_cpl:                 maxCpl ? parseFloat(maxCpl) : null,
        max_budget_pct:          maxBudgetPct ? parseInt(maxBudgetPct) : null,
        max_frequency:           maxFrequency ? parseFloat(maxFrequency) : null,
        min_spend_threshold:     minSpend ? parseFloat(minSpend) : 0,
        min_account_balance:     minAccountBalance ? parseFloat(minAccountBalance) : 0,
        alert_cpl_enabled:       alertCplEnabled,
        alert_budget_enabled:    alertBudgetEnabled,
        alert_frequency_enabled: alertFrequencyEnabled,
        alert_account_balance_enabled: alertAccountBalanceEnabled,
        excluded_account_ids:    accountId === "all" && excludedIds.size > 0 ? Array.from(excludedIds) : [],
      };

      if (isEditing) {
        // ── UPDATE ──────────────────────────────────────────────────────────
        const { error } = await (supabase as any)
          .from("alert_thresholds")
          .update(commonFields)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Regra atualizada com sucesso!");
      } else {
        // ── INSERT ──────────────────────────────────────────────────────────
        const { error } = await (supabase as any).from("alert_thresholds").insert({
          user_id:   userId,
          is_active: true,
          ...commonFields,
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
