import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap, Loader2, Play, Pause, Clock, History, AlertTriangle,
  ShieldAlert, Plus, X, Server, CheckCircle2, RefreshCw,
  Bell, TrendingUp, DollarSign, AlertCircle, Timer, Pencil, Radio, Activity,
  Settings2, Volume2, VolumeX, BellOff, BellRing, Moon, RotateCcw, Lock, Sparkles,
  Trash2, CheckCheck, Music, Check, ArrowRight, ExternalLink, ShieldCheck, Flame, Filter, Volume1
} from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";
import { hasPermissionAccess, isMasterAdmin } from "@/lib/userHierarchy";
import { toast } from "sonner";
import { DiagnosisModal } from "@/components/victoria/DiagnosisModal";
import { ThresholdModal } from "@/components/automacoes/ThresholdModal";
import { getSyncStatus, useAutoSync } from "@/hooks/useAutoSync";
import {
  triggerEvaluation, getEvalStatus, EVAL_STATUS_EVENT, type EvalStatus,
  getSoundEnabled, setSoundEnabled, SOUND_CHANGED_EVENT,
  getNotifPrefs, setNotifPrefs, NOTIF_PREFS_CHANGED_EVENT, type NotifPrefs,
} from "@/hooks/useAlertEngine";
import {
  ALERT_SOUNDS, getAlertSoundPreference, setAlertSoundPreference,
  getAlertVolumePreference, setAlertVolumePreference, playAlertTone,
  getAlertIntervalPreference, setAlertIntervalPreference,
  ALERT_SOUND_TYPE_EVENT, ALERT_SOUND_INTERVAL_EVENT, type AlertSoundDef,
} from "@/lib/alertSounds";
import {
  MAX_NOTIFICATIONS_CAP, getRecentNotifications, markAllNotificationsAsRead,
  markNotificationAsRead, clearAllNotifications, deleteNotification,
  enforceNotificationCapacity, type AppNotification,
} from "@/lib/notificationService";
import { formatDistanceToNow, formatDistance } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => ({ meta: [{ title: "Central de Automações & Notificações — NC Suite" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) || "automacoes",
  }),
  component: AutomationsPage,
});

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

function AutomationsPage() {
  const search = Route.useSearch();
  const [activeTab, setActiveTab] = useState<"automacoes" | "notificacoes" | "personalizacao" | "sync">(() => {
    if (search.tab === "notificacoes" || search.tab === "personalizacao" || search.tab === "sync") {
      return search.tab as any;
    }
    return "automacoes";
  });

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

  const hasAccess =
    isMasterAdmin({ email: user?.email, id: user?.id }) ||
    profileData?.role === "admin" ||
    profileData?.role === "master_admin" ||
    hasPermissionAccess(profileData?.permissions as any, "automacoes");

  const syncStatus = getSyncStatus();
  const { runSync } = useAutoSync();

  // ── Eval status do motor ────────────────────────────────────────────────────
  const [evalStatus, setEvalStatus] = useState<EvalStatus>(getEvalStatus);

  // ── Preferências sonoras & personalização ────────────────────────────────────
  const [soundOn, setSoundOn]                           = useState(getSoundEnabled);
  const [prefs, setPrefsState]                          = useState<NotifPrefs>(getNotifPrefs);
  const [selectedSound, setSelectedSound]               = useState(getAlertSoundPreference);
  const [alertVolume, setAlertVolume]                   = useState(getAlertVolumePreference);
  const [alertInterval, setAlertInterval]               = useState(getAlertIntervalPreference);
  const [playingSoundId, setPlayingSoundId]             = useState<string | null>(null);
  const [isSimulatingInterval, setIsSimulatingInterval] = useState(false);
  const [simulationProgress, setSimulationProgress]     = useState(0);
  const [simulationStep, setSimulationStep]             = useState<1 | 2 | null>(null);
  const simulationTimerRef                              = useRef<any>(null);

  // ── Diagnóstico Victoria AI ──────────────────────────────────────────────────
  const [selectedDiagnoseCampId, setSelectedDiagnoseCampId]     = useState<string | null>(null);
  const [selectedDiagnoseCampName, setSelectedDiagnoseCampName] = useState<string>("");
  const [isDiagnoseOpen, setIsDiagnoseOpen]                     = useState(false);

  // ── Filtro da Central de Notificações ────────────────────────────────────────
  const [notifFilter, setNotifFilter] = useState<"all" | "unread" | "alert_cpl" | "alert_budget" | "alert_frequency">("all");

  useEffect(() => {
    const onSound = (e: Event) => setSoundOn((e as CustomEvent).detail);
    const onPrefs = (e: Event) => setPrefsState((e as CustomEvent).detail);
    const onSoundType = (e: Event) => setSelectedSound((e as CustomEvent).detail);
    const onInterval = (e: Event) => setAlertInterval((e as CustomEvent).detail);
    window.addEventListener(SOUND_CHANGED_EVENT, onSound as EventListener);
    window.addEventListener(NOTIF_PREFS_CHANGED_EVENT, onPrefs as EventListener);
    window.addEventListener(ALERT_SOUND_TYPE_EVENT, onSoundType as EventListener);
    window.addEventListener(ALERT_SOUND_INTERVAL_EVENT, onInterval as EventListener);
    return () => {
      window.removeEventListener(SOUND_CHANGED_EVENT, onSound as EventListener);
      window.removeEventListener(NOTIF_PREFS_CHANGED_EVENT, onPrefs as EventListener);
      window.removeEventListener(ALERT_SOUND_TYPE_EVENT, onSoundType as EventListener);
      window.removeEventListener(ALERT_SOUND_INTERVAL_EVENT, onInterval as EventListener);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (simulationTimerRef.current) {
        clearInterval(simulationTimerRef.current);
      }
    };
  }, []);

  const toggleSound = () => setSoundEnabled(!getSoundEnabled());
  const updatePrefs = (patch: Partial<NotifPrefs>) => setNotifPrefs(patch);

  useEffect(() => {
    const handler = (e: CustomEvent) => setEvalStatus(e.detail);
    window.addEventListener(EVAL_STATUS_EVENT, handler as EventListener);
    return () => window.removeEventListener(EVAL_STATUS_EVENT, handler as EventListener);
  }, []);

  // ── Contas de Anúncios ──────────────────────────────────────────────────────
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    },
  });

  // ── Regras de Automação (Thresholds) ─────────────────────────────────────────
  const { data: thresholds = [], isLoading: loadingThresholds } = useQuery({
    queryKey: ["alert_thresholds"],
    queryFn: async () => {
      const { data: thresholdsData, error } = await (supabase as any)
        .from("alert_thresholds")
        .select("*, ad_accounts(name)")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar regras de automação:", error);
        return [];
      }

      const campaignIds = (thresholdsData || []).map((t: any) => t.campaign_id).filter(Boolean);
      let campaignMap: Record<string, string> = {};
      if (campaignIds.length > 0) {
        try {
          const { data: campData } = await (supabase as any)
            .from("campaigns")
            .select("id, name")
            .in("id", campaignIds);
          (campData || []).forEach((c: any) => { campaignMap[c.id] = c.name; });
        } catch {}
      }

      return (thresholdsData || []).map((t: any) => ({
        ...t,
        campaigns: t.campaign_id ? { name: campaignMap[t.campaign_id] || "Campanha específica" } : null,
      }));
    },
  });

  // ── Central de Notificações (Até 100 notificações acumulativas) ───────────────
  const {
    data: allNotifications = [],
    refetch: refetchNotifications,
    isLoading: loadingNotifications,
  } = useQuery({
    queryKey: ["all_notifications_central"],
    queryFn: async () => {
      await enforceNotificationCapacity();
      return await getRecentNotifications(MAX_NOTIFICATIONS_CAP);
    },
    refetchInterval: 15000,
  });

  // Atualizar notificações quando eval termina
  useEffect(() => {
    if (!evalStatus.isEvaluating) {
      refetchNotifications();
    }
  }, [evalStatus.isEvaluating, refetchNotifications]);

  // ── Configurações globais do Motor ──────────────────────────────────────────
  const { data: configData, refetch: refetchConfig } = useQuery({
    queryKey: ["meta_ads_configs_alerts"],
    queryFn: async () => {
      try {
        const { data } = await supabase
          .from("meta_ads_configs")
          .select("*")
          .limit(1)
          .maybeSingle();
        return {
          zero_delivery_enabled: data?.zero_delivery_enabled ?? true,
          zero_delivery_hour: data?.zero_delivery_hour ?? 14,
          perf_drop_enabled: data?.perf_drop_enabled ?? true,
          perf_drop_spend_pct: data?.perf_drop_spend_pct ?? 50,
          client_cpa_enabled: data?.client_cpa_enabled ?? true,
          alert_dedup_hours: data?.alert_dedup_hours ?? 2,
        };
      } catch {
        return {
          zero_delivery_enabled: true,
          zero_delivery_hour: 14,
          perf_drop_enabled: true,
          perf_drop_spend_pct: 50,
          client_cpa_enabled: true,
          alert_dedup_hours: 2,
        };
      }
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async (patch: any) => {
      try {
        const { data: current } = await supabase.from("meta_ads_configs").select("id").limit(1).maybeSingle();
        if (current?.id) {
          const { error } = await supabase.from("meta_ads_configs").update(patch).eq("id", current.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("meta_ads_configs").insert({ ...patch, user_id: user?.id });
          if (error) throw error;
        }
      } catch (err: any) {
        console.warn("Salvando configuração do motor localmente:", err.message);
        localStorage.setItem("nc_motor_smart_configs", JSON.stringify(patch));
      }
    },
    onSuccess: () => {
      refetchConfig();
      toast.success("Configurações do motor atualizadas com sucesso!");
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar: ${err.message}`);
    },
  });

  // ── Histórico de sync ───────────────────────────────────────────────────────
  const { data: syncHistory = [], isLoading: loadingSync } = useQuery({
    queryKey: ["sync_history"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("sync_history")
        .select("*")
        .order("started_at", { ascending: false })
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
      toast.success("Regra de automação removida!");
    },
  });

  // ── Ações da Central de Notificações ────────────────────────────────────────
  const handleMarkAllAsRead = async () => {
    const unreadIds = allNotifications.filter(n => !n.is_read).map(n => n.id);
    if (!unreadIds.length) return;
    await markAllNotificationsAsRead(unreadIds);
    refetchNotifications();
    toast.success("Todas as notificações foram marcadas como lidas");
  };

  const handleClearAllNotifications = async () => {
    const ok = await clearAllNotifications();
    if (ok) {
      refetchNotifications();
      toast.success("Central de notificações limpa e zerada com sucesso");
    }
  };

  const handleMarkSingleRead = async (id: string) => {
    await markNotificationAsRead(id);
    refetchNotifications();
  };

  const handleDeleteSingle = async (id: string) => {
    const ok = await deleteNotification(id);
    if (ok) {
      refetchNotifications();
      toast.success("Notificação removida");
    }
  };

  const handleVerifyNow = () => {
    triggerEvaluation();
    toast.info("Avaliando campanhas ativas em segundo plano...", { duration: 2500 });
  };

  // ── Testes de Áudio & Alertas ───────────────────────────────────────────────
  const handlePlaySound = (soundId: string) => {
    setPlayingSoundId(soundId);
    playAlertTone(soundId, alertVolume);
    setTimeout(() => {
      setPlayingSoundId(prev => (prev === soundId ? null : prev));
    }, 1200);
  };

  const handleSelectSound = (sound: AlertSoundDef) => {
    setAlertSoundPreference(sound.id);
    setSelectedSound(sound.id);
    handlePlaySound(sound.id);
    toast.success(`Toque "${sound.name}" ativado como padrão!`);
  };

  const handleVolumeChange = (vol: number) => {
    setAlertVolume(vol);
    setAlertVolumePreference(vol);
  };

  const handleIntervalChange = (sec: number) => {
    const clamped = Math.max(5, Math.min(60, Math.round(sec)));
    setAlertInterval(clamped);
    setAlertIntervalPreference(clamped);
  };

  const handleStopSimulation = () => {
    if (simulationTimerRef.current) {
      clearInterval(simulationTimerRef.current);
      simulationTimerRef.current = null;
    }
    setIsSimulatingInterval(false);
    setSimulationProgress(0);
    setSimulationStep(null);
  };

  const handleSimulateIntervalSequence = () => {
    handleStopSimulation();
    setIsSimulatingInterval(true);
    setSimulationStep(1);
    setSimulationProgress(0);

    // 1º toque imediato
    playAlertTone(selectedSound, alertVolume);
    toast.info(`🔔 Toque 1 disparado! Temporizador aguardando ${alertInterval}s até o próximo toque...`, { duration: 3000 });

    const totalDurationMs = alertInterval * 1000;
    const startTime = Date.now();

    simulationTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / totalDurationMs) * 100);
      setSimulationProgress(progress);

      if (elapsed >= totalDurationMs) {
        if (simulationTimerRef.current) {
          clearInterval(simulationTimerRef.current);
          simulationTimerRef.current = null;
        }
        setSimulationStep(2);
        setSimulationProgress(100);
        playAlertTone(selectedSound, alertVolume);
        toast.success(`🔔 Toque 2 disparado após ${alertInterval}s de intervalo!`, { duration: 4000 });
        setTimeout(() => {
          setIsSimulatingInterval(false);
          setSimulationProgress(0);
          setSimulationStep(null);
        }, 1200);
      }
    }, 50);
  };

  const handleTestVolume = () => {
    playAlertTone(selectedSound, alertVolume);
    toast.info(`Volume calibrado em ${(alertVolume * 100).toFixed(0)}%`);
  };

  const handleTestNotificationDemo = async () => {
    playAlertTone(selectedSound, alertVolume);
    toast.info("🚨 Demonstração de Alerta da NC Suite", {
      description: `Disparo com toque padrão "${ALERT_SOUNDS.find(s => s.id === selectedSound)?.name || selectedSound}" e volume ${(alertVolume * 100).toFixed(0)}%.`,
      duration: 5000,
    });
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted" && prefs.browserEnabled) {
      if ("serviceWorker" in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg && reg.showNotification) {
            await reg.showNotification("🚨 Alerta de Teste — NC Suite", {
              body: "Demonstração do sistema de notificações em segundo plano.",
              icon: "/favicon.ico",
            });
            return;
          }
        } catch (_) {}
      }
      try {
        new Notification("🚨 Alerta de Teste — NC Suite", {
          body: "Demonstração do sistema de notificações em segundo plano.",
          icon: "/favicon.ico",
        });
      } catch (e) {
        console.warn("[Automacoes] Notificação bloqueada pelo navegador móvel:", e);
      }
    }
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

  // Filtragem das notificações na Central
  const filteredNotifications = allNotifications.filter((n) => {
    if (notifFilter === "unread") return !n.is_read;
    if (notifFilter === "alert_cpl") return n.type === "alert_cpl" || n.type === "alert";
    if (notifFilter === "alert_budget") return n.type === "alert_budget";
    if (notifFilter === "alert_frequency") return n.type === "alert_frequency";
    return true;
  });

  const unreadCount = allNotifications.filter(n => !n.is_read).length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-24">
      {/* ── HEADER EXECUTIVO ─────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow="SISTEMA DE AUTOMAÇÃO & MONITORAMENTO CONTÍNUO"
        title="Central de Automações & Notificações"
        description="Regras de automação de campanhas, limites de segurança de CPL/CPA e personalização avançada de alertas e toques sonoros da NC Suite."
        compact
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleVerifyNow}
              disabled={evalStatus.isEvaluating}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-xs font-bold text-foreground hover:bg-muted/50 transition active:scale-95 disabled:opacity-50"
            >
              {evalStatus.isEvaluating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-primary" />
              )}
              <span className="hidden sm:inline">Avaliar Agora</span>
            </button>

            <button
              onClick={() => { setEditingThreshold(null); setModal(true); }}
              className="shrink-0 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-bold text-background shadow-glow transition hover:scale-105 active:scale-95"
            >
              <ShieldAlert className="h-3.5 w-3.5 fill-current" />
              <span className="hidden sm:inline">Nova Regra de Automação</span>
              <span className="sm:hidden">Nova Regra</span>
            </button>
          </div>
        }
      />

      {/* ── NAVEGAÇÃO DE TABS ───────────────────────────────────────────────── */}
      <div className="flex overflow-x-auto scrollbar-hide gap-1.5 rounded-2xl bg-card/60 p-1.5 border border-border/60 backdrop-blur-md">
        {[
          {
            id: "automacoes",
            label: "Regras de Automação",
            badge: `${thresholds.length}`,
            icon: Zap,
          },
          {
            id: "notificacoes",
            label: "Central de Notificações",
            badge: unreadCount > 0 ? `${unreadCount} não lidas` : `${allNotifications.length}/${MAX_NOTIFICATIONS_CAP}`,
            badgeColor: unreadCount > 0 ? "bg-primary text-background" : "bg-white/10 text-muted-foreground",
            icon: Bell,
          },
          {
            id: "personalizacao",
            label: "Personalização & 10 Toques",
            badge: "Áudio & Push",
            icon: Music,
          },
          {
            id: "sync",
            label: "Sincronização Meta Ads",
            badge: syncStatus.isSyncing ? "Sincronizando..." : "Meta API",
            icon: Server,
          },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`shrink-0 flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-all whitespace-nowrap ${
                isActive
                  ? "bg-primary text-background shadow-glow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
              }`}
            >
              <tab.icon className="h-3.5 w-3.5 shrink-0" />
              <span>{tab.label.toUpperCase()}</span>
              {tab.badge && (
                <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-bold ${
                  isActive ? "bg-black/20 text-background" : tab.badgeColor || "bg-white/10 text-muted-foreground"
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 1: REGRAS DE AUTOMAÇÃO DE CAMPANHAS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "automacoes" && (
        <div className="space-y-6">
          {/* Card de Status do Motor */}
          <div className="rounded-2xl border border-border bg-card p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                {evalStatus.isEvaluating ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : evalStatus.error ? (
                  <AlertCircle className="h-4 w-4 text-destructive" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <span className="text-sm font-black text-foreground uppercase tracking-wide">
                  {evalStatus.isEvaluating
                    ? "Avaliando Campanhas Agora..."
                    : evalStatus.error
                    ? "Alerta na última verificação"
                    : "Motor Autônomo Ativo & Monitorando"}
                </span>
                {!evalStatus.isEvaluating && evalStatus.violationsFound > 0 && (
                  <span className="rounded-full bg-destructive/15 text-destructive px-2 py-0.5 text-[10px] font-black">
                    {evalStatus.violationsFound} anomalia(s) hoje
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground font-mono">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {evalStatus.lastEval
                    ? `Última verificação: ${formatDistanceToNow(new Date(evalStatus.lastEval), { addSuffix: true, locale: ptBR })}`
                    : "Aguardando primeira checagem…"}
                </span>
                {evalStatus.nextEval && !evalStatus.isEvaluating && (
                  <span className="flex items-center gap-1.5">
                    <Timer className="h-3.5 w-3.5 text-muted-foreground" />
                    Próxima rodada em{" "}
                    {formatDistance(new Date(), new Date(evalStatus.nextEval), { locale: ptBR })}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl pt-1">
                O motor monitora CPL, orçamento diário e frequência de todas as campanhas em tempo real a cada 5 minutos.
                Se uma regra for violada, o alerta é registrado na Central de Notificações com som instantâneo.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <button
                onClick={handleVerifyNow}
                disabled={evalStatus.isEvaluating}
                className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-xs font-bold text-primary hover:bg-primary/20 transition-all active:scale-95 disabled:opacity-50"
              >
                {evalStatus.isEvaluating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Verificar Campanhas Agora
              </button>
            </div>
          </div>

          {/* Cards de Métricas do Motor */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-border bg-card p-4">
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Regras Ativas</span>
              <p className="text-2xl font-black text-foreground mt-1">
                {thresholds.filter((t: any) => t.is_active).length}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">/ {thresholds.length} total</span>
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Alertas Armazenados</span>
              <p className="text-2xl font-black text-primary mt-1">
                {allNotifications.length}
                <span className="text-xs font-normal text-muted-foreground ml-1.5">/ {MAX_NOTIFICATIONS_CAP} max</span>
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Contas Conectadas</span>
              <p className="text-2xl font-black text-foreground mt-1">{accounts.length}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4">
              <span className="text-[10px] font-mono uppercase text-muted-foreground">Toque Padrão Ativo</span>
              <p className="text-sm font-black text-foreground truncate mt-1">
                {ALERT_SOUNDS.find(s => s.id === selectedSound)?.name.split("(")[0] || "Ferrari Pulse"}
              </p>
            </div>
          </div>

          {/* Lista de Regras de Automação */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Regras de Proteção de Campanha</h3>
                <p className="text-xs text-muted-foreground">Tetos de CPL, limites de orçamento e controle de frequência configurados.</p>
              </div>
              <button
                onClick={() => { setEditingThreshold(null); setModal(true); }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline"
              >
                <Plus className="h-3.5 w-3.5" /> Adicionar Regra
              </button>
            </div>

            {loadingThresholds ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-7 w-7 animate-spin text-primary/50" />
              </div>
            ) : !thresholds.length ? (
              <div className="rounded-2xl border border-border bg-card py-16 text-center flex flex-col items-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-3">
                  <ShieldAlert className="h-6 w-6 text-primary" />
                </div>
                <h4 className="text-sm font-bold text-foreground">Nenhuma regra de automação criada</h4>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Crie sua primeira regra para proteger campanhas contra estouro de orçamento ou CPL acima do teto.
                </p>
                <button
                  onClick={() => setModal(true)}
                  className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-background transition hover:opacity-90"
                >
                  Criar Primeira Regra
                </button>
              </div>
            ) : (
              <div className="grid gap-3">
                {(thresholds as any[]).map((th: any, i: number) => (
                  <motion.div
                    key={th.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="rounded-2xl border border-border bg-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-primary/30 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${
                        th.is_active
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-muted/40 text-muted-foreground border border-border"
                      }`}>
                        <AlertTriangle className={`h-5 w-5 ${th.is_active ? "animate-pulse" : ""}`} />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-foreground">
                            {th.campaigns?.name
                              ? `Campanha: ${th.campaigns.name}`
                              : (th.ad_accounts?.name || (th.ad_account_id === null ? "Regra Global — Todas as Contas" : "Conta Específica"))
                            }
                          </h4>
                          {th.campaign_id !== null && (
                            <span className="rounded bg-primary/15 text-primary border border-primary/25 px-1.5 py-0.5 text-[9px] font-black uppercase">
                              CAMPANHA
                            </span>
                          )}
                          {th.campaign_id === null && th.ad_account_id !== null && (
                            <span className="rounded bg-secondary/15 text-secondary border border-secondary/25 px-1.5 py-0.5 text-[9px] font-black uppercase">
                              CONTA
                            </span>
                          )}
                          {th.ad_account_id === null && (
                            <span className="rounded bg-white/10 text-foreground border border-white/20 px-1.5 py-0.5 text-[9px] font-black uppercase">
                              GLOBAL
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {th.max_cpl != null && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              TETO CPL: <strong className="text-primary font-bold">R$ {Number(th.max_cpl).toFixed(2)}</strong>
                            </span>
                          )}
                          {th.max_budget_pct != null && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              ALERTA BUDGET: <strong className="text-amber-500 font-bold">{th.max_budget_pct}%</strong>
                            </span>
                          )}
                          {th.max_frequency != null && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              FREQ MÁX: <strong className="text-foreground font-bold">{Number(th.max_frequency).toFixed(1)}×</strong>
                            </span>
                          )}
                          {th.alert_account_balance_enabled && th.min_account_balance != null && (
                            <span className="inline-flex items-center gap-1 rounded bg-muted/60 border border-border px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                              SALDO MÍN: <strong className="text-emerald-500 font-bold">R$ {Number(th.min_account_balance).toFixed(2)}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:ml-auto">
                      <button
                        onClick={() => toggleThreshold.mutate({ id: th.id, is_active: !th.is_active })}
                        className={`h-8 px-3 flex items-center justify-center rounded-lg transition text-xs font-bold ${
                          th.is_active
                            ? "bg-muted text-muted-foreground hover:bg-muted/80"
                            : "bg-primary/20 text-primary hover:bg-primary/30"
                        }`}
                      >
                        {th.is_active ? (
                          <><Pause className="h-3 w-3 mr-1" /> Pausar</>
                        ) : (
                          <><Play className="h-3 w-3 mr-1 fill-current" /> Ativar</>
                        )}
                      </button>

                      <button
                        onClick={() => { setEditingThreshold(th); setModal(true); }}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 transition"
                        title="Editar regra"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => deleteThreshold.mutate(th.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition"
                        title="Excluir regra"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {/* Configurações Globais do Motor (Robô) */}
          {["admin", "master_admin", "ceo"].includes(profileData?.role || "") && (
            <div className="space-y-4 pt-6 border-t border-border">
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Configurações Globais do Motor Autônomo
                </h4>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Zero Delivery */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">Falta de Entrega (Zero Delivery)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Alerta se a campanha está ativa mas gastou exatamente R$ 0,00.</p>
                    </div>
                    <button
                      onClick={() => updateConfigMutation.mutate({ zero_delivery_enabled: configData?.zero_delivery_enabled === false ? true : false })}
                      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${configData?.zero_delivery_enabled !== false ? "bg-red-500" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${configData?.zero_delivery_enabled !== false ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>

                {/* Queda de Performance */}
                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-foreground">Queda de Performance (Anomalia)</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Alerta se a campanha consumiu verba relevante com zero conversões hoje.</p>
                    </div>
                    <button
                      onClick={() => updateConfigMutation.mutate({ perf_drop_enabled: configData?.perf_drop_enabled === false ? true : false })}
                      className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${configData?.perf_drop_enabled !== false ? "bg-amber-500" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${configData?.perf_drop_enabled !== false ? "left-5.5 translate-x-0.5" : "left-0.5"}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 2: CENTRAL DE NOTIFICAÇÕES (ATÉ 100 ALERTAS COM AUTO-PURGE)
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "notificacoes" && (
        <div className="space-y-6">
          {/* Card de Capacidade da Central (Até 100 notificações) */}
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                    Armazenamento Acumulativo de Alertas
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">
                  A Central retém até <strong className="text-foreground">100 notificações simultâneas</strong>.
                  Ao atingir a capacidade máxima, uma limpeza inteligente automática zera os registros antigos para assegurar o recebimento ininterrupto de novos eventos.
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition active:scale-95"
                  >
                    <CheckCheck className="h-3.5 w-3.5" />
                    Marcar Todas Lidas
                  </button>
                )}

                {allNotifications.length > 0 && (
                  <button
                    onClick={handleClearAllNotifications}
                    className="flex items-center gap-1.5 rounded-xl border border-border bg-card hover:bg-destructive/10 hover:border-destructive/30 px-3.5 py-2 text-xs font-bold text-muted-foreground hover:text-destructive transition active:scale-95"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Limpar / Zerar Notificações
                  </button>
                )}
              </div>
            </div>

            {/* Barra de Progresso de Capacidade */}
            <div className="space-y-1.5 pt-2 border-t border-border/60">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-muted-foreground">Capacidade em uso:</span>
                <span className={allNotifications.length >= 90 ? "text-destructive font-black" : "text-foreground font-bold"}>
                  {allNotifications.length} de {MAX_NOTIFICATIONS_CAP} notificações ({((allNotifications.length / MAX_NOTIFICATIONS_CAP) * 100).toFixed(0)}%)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 rounded-full ${
                    allNotifications.length >= 90
                      ? "bg-destructive"
                      : allNotifications.length >= 70
                      ? "bg-amber-500"
                      : "bg-primary"
                  }`}
                  style={{ width: `${Math.min(100, (allNotifications.length / MAX_NOTIFICATIONS_CAP) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Filtros Rápidos */}
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: "all", label: "Todas", count: allNotifications.length },
              { id: "unread", label: "Não Lidas", count: unreadCount },
              { id: "alert_cpl", label: "CPL Alto", count: allNotifications.filter(n => n.type === "alert_cpl" || n.type === "alert").length },
              { id: "alert_budget", label: "Orçamento", count: allNotifications.filter(n => n.type === "alert_budget").length },
              { id: "alert_frequency", label: "Frequência", count: allNotifications.filter(n => n.type === "alert_frequency").length },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setNotifFilter(f.id as any)}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  notifFilter === f.id
                    ? "bg-primary text-background"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                <span>{f.label}</span>
                <span className={`rounded-full px-1.5 py-0.2 text-[10px] font-mono ${
                  notifFilter === f.id ? "bg-black/20 text-background" : "bg-muted text-muted-foreground"
                }`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>

          {/* Feed de Notificações */}
          {loadingNotifications ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-7 w-7 animate-spin text-primary/50" />
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card py-20 text-center flex flex-col items-center">
              <Bell className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <h4 className="text-sm font-bold text-foreground">Nenhuma notificação encontrada</h4>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {notifFilter === "unread"
                  ? "Parabéns! Todas as notificações foram visualizadas e tratadas."
                  : "A Central está limpa e pronta para capturar novos eventos das suas contas."}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredNotifications.map((notif, index) => {
                const timeAgo = formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR });
                const isCPL = notif.type === "alert_cpl" || notif.type === "alert";
                const isBudget = notif.type === "alert_budget";
                const isFreq = notif.type === "alert_frequency";

                return (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.02 }}
                    className={`rounded-2xl border p-4 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                      !notif.is_read
                        ? "bg-card border-primary/30 shadow-glow-sm"
                        : "bg-card/60 border-border opacity-85 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                      <div className={`mt-0.5 h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                        isCPL
                          ? "bg-red-500/15 text-red-400 border border-red-500/30"
                          : isBudget
                          ? "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                          : isFreq
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : "bg-primary/15 text-primary border border-primary/30"
                      }`}>
                        {isCPL ? (
                          <TrendingUp className="h-5 w-5" />
                        ) : isBudget ? (
                          <DollarSign className="h-5 w-5" />
                        ) : isFreq ? (
                          <Radio className="h-5 w-5" />
                        ) : (
                          <BellRing className="h-5 w-5" />
                        )}
                      </div>

                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black uppercase text-foreground leading-snug">
                            {notif.title}
                          </span>
                          {!notif.is_read && (
                            <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2 py-0.2 text-[9px] font-black uppercase">
                              NOVO
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {timeAgo}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground leading-relaxed">
                          {notif.message}
                        </p>
                      </div>
                    </div>

                    {/* Ações da Notificação */}
                    <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
                      {notif.link && (
                        <a
                          href={notif.link}
                          onClick={() => handleMarkSingleRead(notif.id)}
                          className="flex items-center gap-1 text-[11px] font-bold text-foreground bg-muted hover:bg-muted/80 px-2.5 py-1.5 rounded-lg transition"
                        >
                          Ver Campanha <ArrowRight className="h-3 w-3" />
                        </a>
                      )}

                      {!notif.is_read && (
                        <button
                          onClick={() => handleMarkSingleRead(notif.id)}
                          title="Marcar como lida"
                          className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-foreground transition"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteSingle(notif.id)}
                        title="Excluir notificação"
                        className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 3: PERSONALIZAÇÃO DE ALERTAS & 10 TOQUES SONOROS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "personalizacao" && (
        <div className="space-y-8">
          {/* Top Bar de Controles Globais de Som */}
          <div className="rounded-2xl border border-border bg-card p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 border ${
                  soundOn ? "bg-primary/10 text-primary border-primary/30" : "bg-muted text-muted-foreground border-border"
                }`}>
                  {soundOn ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
                </div>
                <div>
                  <h3 className="text-base font-black uppercase text-foreground">Alertas Sonoros Executivos</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
                    Sintetizador Web Audio API de alta fidelidade: reproduz áudio imediato direto no navegador, sem delay de download ou dependência de servidores externos.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleTestNotificationDemo}
                  className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition active:scale-95"
                >
                  <Sparkles className="h-3.5 w-3.5" /> Disparar Demonstração
                </button>

                <button
                  onClick={toggleSound}
                  className={`relative h-7 w-12 rounded-full transition-colors shrink-0 ${
                    soundOn ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    soundOn ? "left-6" : "left-1"
                  }`} />
                </button>
              </div>
            </div>

            {/* Slider de Volume Master */}
            <div className="pt-4 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1 max-w-md">
                <Volume1 className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={alertVolume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-full accent-primary cursor-pointer"
                />
                <span className="text-xs font-mono font-bold text-foreground w-12 text-right">
                  {(alertVolume * 100).toFixed(0)}%
                </span>
              </div>

              <button
                onClick={handleTestVolume}
                className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition"
              >
                <Play className="h-3 w-3 fill-current" /> Testar Volume
              </button>
            </div>

            {/* Temporizador Configurável entre Toques */}
            <div className="pt-5 border-t border-border space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Timer className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-foreground flex items-center gap-2 flex-wrap">
                      Temporizador entre Toques (Intermitência)
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-mono font-black uppercase ${
                        alertInterval <= 8
                          ? "bg-red-500/15 text-red-400 border border-red-500/30"
                          : alertInterval <= 15
                          ? "bg-primary/15 text-primary border border-primary/30"
                          : alertInterval <= 30
                          ? "bg-blue-500/15 text-blue-400 border border-blue-500/30"
                          : "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                      }`}>
                        {alertInterval <= 8 ? "⚡ Rápido" : alertInterval <= 15 ? "🎯 Equilibrado (Padrão)" : alertInterval <= 30 ? "☕ Espaçado" : "🌿 Discreto (1 min)"}
                      </span>
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 max-w-xl">
                      Ajuste a intermitência de <strong>5 segundos a 1 minuto</strong> entre um toque e outro. Aumente para espaçar o tempo ou diminua para uma cadência mais rápida e urgente.
                    </p>
                  </div>
                </div>

                {/* Botão de Simulação do Temporizador */}
                <div className="flex items-center gap-2 shrink-0 sm:self-center">
                  {isSimulatingInterval ? (
                    <button
                      onClick={handleStopSimulation}
                      className="flex items-center gap-1.5 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-xs font-bold text-destructive hover:bg-destructive/20 transition active:scale-95 shadow-sm"
                    >
                      <X className="h-3.5 w-3.5" /> Parar Teste
                    </button>
                  ) : (
                    <button
                      onClick={handleSimulateIntervalSequence}
                      className="flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition active:scale-95 shadow-sm"
                      title="Toca o 1º som, aguarda a intermitência configurada e toca o 2º som para você validar o espaçamento exato"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" /> Simular Sequência (2 Toques)
                    </button>
                  )}
                </div>
              </div>

              {/* Barra de Progresso da Simulação (quando ativa) */}
              <AnimatePresence>
                {isSimulatingInterval && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-primary/30 bg-primary/5 p-3.5 space-y-2 overflow-hidden"
                  >
                    <div className="flex items-center justify-between text-xs font-mono font-bold">
                      <span className="text-primary flex items-center gap-2">
                        <Clock className="h-4 w-4 animate-spin text-primary" />
                        {simulationStep === 1
                          ? `Toque 1 disparado • Temporizador aguardando ${alertInterval}s até o Toque 2...`
                          : `✅ Toque 2 disparado com sucesso após ${alertInterval}s!`}
                      </span>
                      <span className="text-foreground font-black">{simulationProgress.toFixed(0)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full bg-primary rounded-full shadow-glow-sm"
                        style={{ width: `${simulationProgress}%` }}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Slider de Tempo + Presets Rápidos */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                <div className="lg:col-span-7 flex items-center gap-3">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <input
                    type="range"
                    min="5"
                    max="60"
                    step="1"
                    value={alertInterval}
                    onChange={(e) => handleIntervalChange(parseInt(e.target.value, 10))}
                    className="w-full accent-primary cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <input
                      type="number"
                      min="5"
                      max="60"
                      value={alertInterval}
                      onChange={(e) => handleIntervalChange(parseInt(e.target.value, 10) || 5)}
                      className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-xs font-mono font-black text-foreground text-center focus:border-primary outline-none"
                    />
                    <span className="text-xs font-mono font-bold text-muted-foreground">seg</span>
                  </div>
                </div>

                {/* Presets Rápidos */}
                <div className="lg:col-span-5 flex items-center gap-1.5 flex-wrap lg:justify-end">
                  {[
                    { label: "5s", sec: 5, hint: "Rápido" },
                    { label: "10s", sec: 10, hint: "Padrão NC" },
                    { label: "15s", sec: 15, hint: "Moderado" },
                    { label: "20s", sec: 20, hint: "Espaçado" },
                    { label: "30s", sec: 30, hint: "Tranquilo" },
                    { label: "60s", sec: 60, hint: "1 minuto" },
                  ].map((preset) => (
                    <button
                      key={preset.sec}
                      onClick={() => handleIntervalChange(preset.sec)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-mono font-bold transition active:scale-95 ${
                        alertInterval === preset.sec
                          ? "bg-primary text-background shadow-glow-sm"
                          : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border/60"
                      }`}
                      title={`${preset.label} (${preset.hint})`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Regra de 3 Minutos de Auto-Silenciamento */}
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex items-start gap-3">
                <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="space-y-0.5 text-xs">
                  <div className="font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                    Regra de 3 Minutos de Auto-Silenciamento
                    <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2 py-0.2 text-[9px] font-mono font-bold">
                      Automático
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Caso um alerta toque e não seja visualizado por <strong>3 minutos contínuos</strong>, os toques sonoros cessam automaticamente para não perturbar o ambiente. O som retornará normalmente na <strong>próxima ativação de alerta</strong> ou ao receber novos eventos das campanhas.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Catálogo dos 10 Toques de Alertas Exclusivos */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
                  Catálogo dos 10 Toques de Alertas
                </h3>
                <p className="text-xs text-muted-foreground">
                  Selecione o perfil acústico que melhor combina com o ritmo da sua agência.
                </p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary border border-primary/20 px-3 py-1 text-xs font-mono font-bold">
                10 perfis sintetizados
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {ALERT_SOUNDS.map((sound) => {
                const isSelected = selectedSound === sound.id;
                const isPlaying = playingSoundId === sound.id;

                return (
                  <div
                    key={sound.id}
                    className={`rounded-2xl border p-4.5 transition-all flex items-start justify-between gap-4 relative overflow-hidden ${
                      isSelected
                        ? "bg-card border-primary/60 shadow-glow-sm"
                        : "bg-card/70 border-border hover:border-primary/30"
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-foreground truncate">
                          {sound.name}
                        </span>
                        <span className={`rounded-full px-2 py-0.2 text-[9px] font-black uppercase ${
                          sound.category === "Padrão"
                            ? "bg-primary/20 text-primary"
                            : sound.category === "Crítico"
                            ? "bg-destructive/20 text-destructive"
                            : sound.category === "Tático"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-white/10 text-muted-foreground"
                        }`}>
                          {sound.category}
                        </span>
                        {isSelected && (
                          <span className="flex items-center gap-1 rounded-full bg-primary text-background px-2 py-0.2 text-[9px] font-black uppercase">
                            <Check className="h-2.5 w-2.5" /> ATIVO
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {sound.description}
                      </p>
                    </div>

                    {/* Botões de Ação do Som */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handlePlaySound(sound.id)}
                        title="Ouvir e testar toque"
                        className={`h-9 px-3 rounded-xl border flex items-center gap-1.5 text-xs font-bold transition active:scale-95 ${
                          isPlaying
                            ? "border-primary bg-primary text-background shadow-glow-sm"
                            : "border-border bg-muted text-foreground hover:bg-muted/80"
                        }`}
                      >
                        <Play className={`h-3 w-3 ${isPlaying ? "fill-current animate-spin" : "fill-current"}`} />
                        {isPlaying ? "Tocando..." : "Ouvir"}
                      </button>

                      <button
                        onClick={() => handleSelectSound(sound)}
                        disabled={isSelected}
                        title={isSelected ? "Já é o toque ativo" : "Definir como som padrão"}
                        className={`h-9 px-3 rounded-xl text-xs font-bold transition active:scale-95 ${
                          isSelected
                            ? "bg-primary/10 text-primary border border-primary/20 cursor-default"
                            : "bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-border"
                        }`}
                      >
                        {isSelected ? "Padrão" : "Definir"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Preferências Avançadas de Notificação (Push, Horário Silencioso, Deduplicação) */}
          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">
              Canais & Horários Silenciosos
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Notificações de Navegador (Desktop Push) */}
              <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                    prefs.browserEnabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                  }`}>
                    {prefs.browserEnabled ? <BellRing className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">Push no Navegador</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Receba alertas na área de trabalho mesmo se a aba estiver minimizada.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => updatePrefs({ browserEnabled: !prefs.browserEnabled })}
                  className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                    prefs.browserEnabled ? "bg-primary" : "bg-muted"
                  }`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                    prefs.browserEnabled ? "left-5.5 translate-x-0.5" : "left-0.5"
                  }`} />
                </button>
              </div>

              {/* Horário de Silêncio */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                      prefs.quietHoursEnabled ? "bg-amber-500/15 text-amber-400" : "bg-muted text-muted-foreground"
                    }`}>
                      <Moon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Horário de Silêncio Noturno</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Muta o som e notificações fora do expediente comercial.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => updatePrefs({ quietHoursEnabled: !prefs.quietHoursEnabled })}
                    className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                      prefs.quietHoursEnabled ? "bg-amber-500" : "bg-muted"
                    }`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      prefs.quietHoursEnabled ? "left-5.5 translate-x-0.5" : "left-0.5"
                    }`} />
                  </button>
                </div>

                {prefs.quietHoursEnabled && (
                  <div className="flex items-center gap-3 pt-2">
                    <span className="text-xs font-mono text-muted-foreground">Das:</span>
                    <input
                      type="time"
                      value={prefs.quietStart}
                      onChange={e => updatePrefs({ quietStart: e.target.value })}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono"
                    />
                    <span className="text-xs font-mono text-muted-foreground">até:</span>
                    <input
                      type="time"
                      value={prefs.quietEnd}
                      onChange={e => updatePrefs({ quietEnd: e.target.value })}
                      className="rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          TAB 4: SINCRONIZAÇÃO META ADS
      ════════════════════════════════════════════════════════════════════════ */}
      {activeTab === "sync" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6 flex flex-col md:flex-row gap-6 items-center justify-between">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-base font-black uppercase text-foreground flex items-center gap-2 justify-center md:justify-start">
                <Server className="h-5 w-5 text-primary" /> Motor de Sincronização Meta Ads
              </h3>
              <p className="text-xs text-muted-foreground max-w-xl">
                O motor busca métricas a cada 1 hora ou sob demanda manual. Todas as campanhas, conjuntos de anúncios e conversões do WhatsApp são calibrados diretamente pelo Graph API.
              </p>
              <div className="flex flex-wrap gap-4 text-xs font-mono text-muted-foreground pt-1">
                <span>Último sync: {syncStatus.lastSync ? formatDistanceToNow(new Date(syncStatus.lastSync), { addSuffix: true, locale: ptBR }) : "Nunca"}</span>
                <span>Status: <strong className="text-foreground">{syncStatus.isSyncing ? "Sincronizando..." : "Aguardando"}</strong></span>
              </div>
            </div>

            <button
              onClick={() => runSync("manual")}
              disabled={syncStatus.isSyncing}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs font-bold text-background transition hover:opacity-90 active:scale-95 disabled:opacity-50 shrink-0"
            >
              {syncStatus.isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Forçar Sincronização Total
            </button>
          </div>

          {/* Histórico de Sync */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
              <span className="text-xs font-black uppercase text-foreground">Histórico de Execuções Recentes</span>
              <span className="text-xs font-mono text-muted-foreground">{syncHistory.length} registros</span>
            </div>

            {loadingSync ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-primary/50" />
              </div>
            ) : !syncHistory.length ? (
              <div className="py-12 text-center text-xs text-muted-foreground">Nenhum log de sync registrado.</div>
            ) : (
              <div className="divide-y divide-border text-xs">
                {syncHistory.map((s: any) => (
                  <div key={s.id} className="p-4 flex items-center justify-between hover:bg-muted/20 transition">
                    <div className="space-y-0.5">
                      <p className="font-mono font-bold text-foreground">
                        {new Date(s.started_at).toLocaleString("pt-BR")}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.accounts_synced ?? 0} contas • {s.campaigns_synced ?? 0} campanhas atualizadas
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-mono font-bold ${
                      s.status === "completed" || s.status === "success"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-destructive/15 text-destructive"
                    }`}>
                      {s.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
