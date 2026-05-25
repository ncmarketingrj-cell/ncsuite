// src/hooks/useAlertEngine.ts
// NC Performance Suite — Motor de Alertas: Avaliação de Thresholds + Som + Browser Notifications

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ─── Module-level singletons (shared across React instances) ──────────────────
const firedAlerts = new Set<string>();
const activeOscillators = new Map<string, { stop: () => void }>();
let isCurrentlyEvaluating = false;

// ─── Eval status (persisted in localStorage) ──────────────────────────────────
const EVAL_STATUS_KEY  = "nc_alert_eval_status";
const DEDUP_CACHE_KEY  = "nc_alert_dedup_v2";
const EVAL_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutos
const DEDUP_WINDOW_MS  = 60 * 60 * 1000; // 1 hora — não re-alertar mesma campanha

// Dedup por localStorage — primário, síncrono, sem dependência de rede
function isDedupBlocked(key: string): boolean {
  try {
    const cache: Record<string, string> = JSON.parse(localStorage.getItem(DEDUP_CACHE_KEY) || "{}");
    const last = cache[key];
    return !!last && (Date.now() - new Date(last).getTime()) < DEDUP_WINDOW_MS;
  } catch { return false; }
}

function markDedupFired(key: string): void {
  try {
    const cache: Record<string, string> = JSON.parse(localStorage.getItem(DEDUP_CACHE_KEY) || "{}");
    const cutoff = Date.now() - 2 * DEDUP_WINDOW_MS;
    for (const k in cache) { if (new Date(cache[k]).getTime() < cutoff) delete cache[k]; }
    cache[key] = new Date().toISOString();
    localStorage.setItem(DEDUP_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export const EVAL_REQUEST_EVENT = "nc:eval-request";
export const EVAL_STATUS_EVENT  = "nc:eval-status";

export type EvalStatus = {
  isEvaluating:    boolean;
  lastEval:        string | null;
  nextEval:        string | null;
  violationsFound: number;
  error:           string | null;
};

export function getEvalStatus(): EvalStatus {
  try {
    const s = localStorage.getItem(EVAL_STATUS_KEY);
    return s ? JSON.parse(s) : {
      isEvaluating: false, lastEval: null, nextEval: null, violationsFound: 0, error: null,
    };
  } catch {
    return { isEvaluating: false, lastEval: null, nextEval: null, violationsFound: 0, error: null };
  }
}

function saveEvalStatus(update: Partial<EvalStatus>) {
  const next = { ...getEvalStatus(), ...update };
  try { localStorage.setItem(EVAL_STATUS_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent(EVAL_STATUS_EVENT, { detail: next }));
}

export function triggerEvaluation() {
  window.dispatchEvent(new Event(EVAL_REQUEST_EVENT));
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Classifica o objetivo da campanha em label legível + sigla de custo
function getResultInfo(resultType: string | null | undefined): {
  label: string; metricLabel: string; emoji: string
} {
  const t = (resultType || "").toUpperCase();
  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(t))
    return { label: "Lead", metricLabel: "CPL", emoji: "👤" };
  if (["MESSAGES", "OUTCOME_ENGAGEMENT", "MESSAGING_CONVERSATION_STARTED_BY_PERSON", "MESSAGING_FIRST_REPLY"].includes(t))
    return { label: "Conversa", metricLabel: "Custo/Conversa", emoji: "💬" };
  if (["CONVERSIONS", "OUTCOME_SALES"].includes(t))
    return { label: "Compra", metricLabel: "CPA", emoji: "🛒" };
  if (["OUTCOME_TRAFFIC", "LINK_CLICKS"].includes(t))
    return { label: "Clique no Link", metricLabel: "CPC", emoji: "🖱️" };
  if (["VIDEO_VIEWS", "OUTCOME_VIDEO_VIEWS", "THRUPLAY"].includes(t))
    return { label: "Visualização", metricLabel: "CPV", emoji: "🎬" };
  if (["OUTCOME_AWARENESS", "REACH", "POST_REACH", "BRAND_AWARENESS"].includes(t))
    return { label: "Alcance", metricLabel: "CPM", emoji: "👁️" };
  if (["POST_ENGAGEMENT", "PAGE_LIKES", "ENGAGED_USERS"].includes(t))
    return { label: "Engajamento", metricLabel: "CPE", emoji: "❤️" };
  if (["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(t))
    return { label: "Instalação", metricLabel: "CPI", emoji: "📱" };
  return { label: "Resultado", metricLabel: "Custo/Resultado", emoji: "📊" };
}

// ─── Core Evaluation Engine ───────────────────────────────────────────────────
async function runThresholdEvaluation() {
  if (isCurrentlyEvaluating) return;
  isCurrentlyEvaluating = true;
  saveEvalStatus({ isEvaluating: true, error: null });

  let totalNew = 0;

  try {
    // 1. Buscar regras ativas (tabela fora do schema gerado → cast any)
    const { data: thresholds, error: thErr } = await (supabase as any)
      .from("alert_thresholds")
      .select("*")
      .eq("is_active", true);

    if (thErr) throw thErr;

    if (!thresholds?.length) {
      saveEvalStatus({
        isEvaluating: false,
        lastEval: new Date().toISOString(),
        nextEval: new Date(Date.now() + EVAL_INTERVAL_MS).toISOString(),
        violationsFound: 0,
      });
      return;
    }

    const today      = todayStr();
    const dedupSince = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString();
    const { data: { user } } = await supabase.auth.getUser();

    // Contas com regra específica — a regra global não se aplica a elas
    const accountsWithSpecificRules = new Set(
      (thresholds as any[])
        .filter((t: any) => t.ad_account_id !== null)
        .map((t: any) => t.ad_account_id)
    );

    for (const threshold of thresholds as any[]) {
      // 2. Buscar campanhas ATIVAS — para a conta específica ou todas
      let q = (supabase as any)
        .from("campaigns")
        .select("id, name, status, budget, ad_account_id, created_at, ad_accounts(name), metrics(cost, conversions, date, frequency, result_type)")
        .ilike("status", "ACTIVE");

      if (threshold.ad_account_id) {
        q = q.eq("ad_account_id", threshold.ad_account_id);
      }

      const { data: campaigns } = await q;
      if (!campaigns?.length) continue;

      for (const campaign of campaigns as any[]) {
        // Regra global não avalia contas que têm regra própria (a regra específica tem prioridade)
        if (!threshold.ad_account_id && accountsWithSpecificRules.has(campaign.ad_account_id)) {
          continue;
        }
        // Regra global não avalia contas explicitamente excluídas
        if (!threshold.ad_account_id && (threshold.excluded_account_ids || []).includes(campaign.ad_account_id)) {
          continue;
        }
        // 3. Métricas de HOJE apenas
        const todayMetrics = (campaign.metrics || []).filter(
          (m: any) => m.date?.split("T")[0] === today
        );

        const todayCost = todayMetrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
        const todayConv = todayMetrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);

        // Tipo de resultado: pega do primeiro registro de métrica
        const rawType  = todayMetrics[0]?.result_type || null;
        const result   = getResultInfo(rawType);
        const accName  = (campaign.ad_accounts as any)?.name ?? `Conta ${String(campaign.ad_account_id).slice(-6)}`;
        const daysSince = campaign.created_at
          ? Math.floor((Date.now() - new Date(campaign.created_at).getTime()) / 86_400_000)
          : null;
        const duration = daysSince === null ? "campanha ativa" : daysSince === 0 ? "iniciou hoje" : `${daysSince}d de campanha`;

        // ── Violação de custo por resultado ──────────────────────────────────
        if (threshold.max_cpl !== null && threshold.max_cpl !== undefined && todayCost > 0 && todayConv > 0) {
          const costPerResult = todayCost / todayConv;

          if (costPerResult > threshold.max_cpl) {
            const cplKey = `cpl_${campaign.id}`;
            if (!isDedupBlocked(cplKey)) {
              const { data: dup, error: dupErr } = await (supabase as any)
                .from("notifications")
                .select("id")
                .eq("type", "alert_cpl")
                .eq("user_id", user?.id)
                .gte("created_at", dedupSince)
                .ilike("link", `%${campaign.id}%`)
                .limit(1);

              if (!dupErr && !dup?.length) {
                await (supabase as any).from("notifications").insert({
                  user_id:     user?.id ?? null,
                  title:       `🚨 ${result.metricLabel} Alto — ${campaign.name.slice(0, 35)}`,
                  message:     `${accName} • ${duration} — ${result.metricLabel} hoje R$ ${costPerResult.toFixed(2)} ultrapassou o limite de R$ ${(threshold.max_cpl as number).toFixed(2)}. ${todayConv} ${result.label}(s) gerados. Intervenha imediatamente.`,
                  is_critical: true,
                  is_read:     false,
                  type:        "alert_cpl",
                  link:        `/campanhas?accountId=${campaign.ad_account_id}&date=${today}&campId=${campaign.id}`,
                });
                markDedupFired(cplKey);
                totalNew++;
              }
            }
          }
        }

        // ── Violação de Orçamento ────────────────────────────────────────────
        if (threshold.max_budget_pct !== null && threshold.max_budget_pct !== undefined && todayCost > 0 && campaign.budget > 0) {
          const pct = (todayCost / campaign.budget) * 100;

          if (pct >= (threshold.max_budget_pct as number)) {
            const budgetKey = `budget_${campaign.id}`;
            if (!isDedupBlocked(budgetKey)) {
              const { data: dup, error: dupErr } = await (supabase as any)
                .from("notifications")
                .select("id")
                .eq("type", "alert_budget")
                .eq("user_id", user?.id)
                .gte("created_at", dedupSince)
                .ilike("link", `%${campaign.id}%`)
                .limit(1);

              if (!dupErr && !dup?.length) {
                const isCritical    = pct >= 95;
                const semResultado  = todayConv === 0 ? ` sem nenhum(a) ${result.label.toLowerCase()}` : "";
                await (supabase as any).from("notifications").insert({
                  user_id:     user?.id ?? null,
                  title:       `⚠️ Orçamento ${pct >= 100 ? "Esgotado" : "Crítico"} — ${campaign.name.slice(0, 35)}`,
                  message:     `${accName} — ${pct.toFixed(0)}% do orçamento diário utilizado${semResultado}${pct >= 100 ? " — campanha pausou automaticamente" : " — prestes a esgotar"}. (Limite: ${threshold.max_budget_pct}%)`,
                  is_critical: isCritical,
                  is_read:     false,
                  type:        "alert_budget",
                  link:        `/campanhas?accountId=${campaign.ad_account_id}&date=${today}&campId=${campaign.id}`,
                });
                markDedupFired(budgetKey);
                totalNew++;
              }
            }
          }
        }

        // ── Violação de Frequência ───────────────────────────────────────────
        if (threshold.max_frequency !== null && threshold.max_frequency !== undefined) {
          const freqValues = todayMetrics.map((m: any) => Number(m.frequency || 0)).filter((f: number) => f > 0);
          const avgFreq = freqValues.length > 0 ? freqValues.reduce((s: number, f: number) => s + f, 0) / freqValues.length : 0;

          if (avgFreq > (threshold.max_frequency as number)) {
            const freqKey = `freq_${campaign.id}`;
            if (!isDedupBlocked(freqKey)) {
              const { data: dup, error: dupErr } = await (supabase as any)
                .from("notifications")
                .select("id")
                .eq("type", "alert_frequency")
                .eq("user_id", user?.id)
                .gte("created_at", dedupSince)
                .ilike("link", `%${campaign.id}%`)
                .limit(1);

              if (!dupErr && !dup?.length) {
                const accountNameFreq = (campaign.ad_accounts as any)?.name ?? `Conta ${String(campaign.ad_account_id).slice(-6)}`;
                await (supabase as any).from("notifications").insert({
                  user_id:     user?.id ?? null,
                  title:       `📡 Frequência Alta — ${campaign.name.slice(0, 35)}`,
                  message:     `${accountNameFreq} — Frequência ${avgFreq.toFixed(1)}× ultrapassou o limite de ${(threshold.max_frequency as number).toFixed(1)}×. Audiência saturando — expanda o público ou renove os criativos.`,
                  is_critical: false,
                  is_read:     false,
                  type:        "alert_frequency",
                  link:        `/campanhas?accountId=${campaign.ad_account_id}&date=${today}&campId=${campaign.id}`,
                });
                markDedupFired(freqKey);
                totalNew++;
              }
            }
          }
        }
      }
    }

    saveEvalStatus({
      isEvaluating:    false,
      lastEval:        new Date().toISOString(),
      nextEval:        new Date(Date.now() + EVAL_INTERVAL_MS).toISOString(),
      violationsFound: totalNew,
      error:           null,
    });

    console.log(
      totalNew > 0
        ? `[ALERT-ENGINE] 🔔 ${totalNew} nova(s) violação(ões) detectada(s)`
        : "[ALERT-ENGINE] ✅ Avaliação concluída — sem violações"
    );
  } catch (e: any) {
    console.error("[ALERT-ENGINE] ❌ Erro:", e.message);
    saveEvalStatus({ isEvaluating: false, error: e.message ?? "Erro desconhecido" });
  } finally {
    isCurrentlyEvaluating = false;
  }
}

// ─── Web Audio API ────────────────────────────────────────────────────────────
function playAlertSound(alertId: string) {
  if (activeOscillators.has(alertId)) return;

  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    let stopped = false;

    const beep = (freq: number, t: number, dur: number) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.4, t + 0.01);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    };

    const seq = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      beep(880,  t + 0.00, 0.12);
      beep(880,  t + 0.18, 0.12);
      beep(1100, t + 0.36, 0.22);
    };

    seq();
    const loop = setInterval(() => {
      if (stopped) { clearInterval(loop); return; }
      seq();
    }, 5000);

    activeOscillators.set(alertId, {
      stop: () => {
        stopped = true;
        clearInterval(loop);
        try { ctx.close(); } catch (_) {}
        activeOscillators.delete(alertId);
      },
    });
  } catch (e) {
    console.warn("[ALERT-ENGINE] Web Audio indisponível:", e);
  }
}

function stopAlertSound(alertId: string) {
  activeOscillators.get(alertId)?.stop();
}

// ─── Browser Notifications API ────────────────────────────────────────────────
async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  return (await Notification.requestPermission()) === "granted";
}

function showBrowserNotification(
  alertId: string, title: string, body: string, link: string, onAck: () => void
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notif = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: alertId,
    requireInteraction: true,
    silent: false,
  });

  notif.onclick = () => {
    window.focus();
    stopAlertSound(alertId);
    onAck();
    if (link?.startsWith("/")) window.location.href = link;
    notif.close();
  };
}

// ─── Hook Principal ───────────────────────────────────────────────────────────
export function useAlertEngine() {
  const permissionGranted = useRef(false);

  useEffect(() => {
    requestNotificationPermission().then(ok => { permissionGranted.current = ok; });
  }, []);

  // Motor de avaliação: roda ao montar + a cada 5 min + sob demanda (triggerEvaluation)
  useEffect(() => {
    runThresholdEvaluation();
    const interval = setInterval(runThresholdEvaluation, EVAL_INTERVAL_MS);
    const onRequest = () => runThresholdEvaluation();
    window.addEventListener(EVAL_REQUEST_EVENT, onRequest);
    return () => {
      clearInterval(interval);
      window.removeEventListener(EVAL_REQUEST_EVENT, onRequest);
    };
  }, []);

  const acknowledge = useCallback(async (alertId: string) => {
    stopAlertSound(alertId);
    firedAlerts.delete(alertId);
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq("id", alertId);
  }, []);

  const acknowledgeAll = useCallback(async () => {
    for (const [id] of activeOscillators) stopAlertSound(id);
    firedAlerts.clear();
    await (supabase as any)
      .from("notifications")
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq("is_read", false)
      .eq("is_critical", true);
  }, []);

  // Buscar alertas críticos não lidos a cada 15 s
  const { data: criticalAlerts = [] } = useQuery({
    queryKey: ["critical_alerts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("notifications")
        .select("*")
        .eq("is_critical", true)
        .eq("is_read", false)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      return (data as any[]) || [];
    },
    refetchInterval: 15000,
  });

  // Disparar som + browser notification para cada alerta novo
  useEffect(() => {
    for (const alert of criticalAlerts as any[]) {
      if (firedAlerts.has(alert.id)) continue;
      firedAlerts.add(alert.id);

      playAlertSound(alert.id);

      if (permissionGranted.current) {
        showBrowserNotification(
          alert.id, alert.title, alert.message,
          alert.link || "/automacoes",
          () => acknowledge(alert.id)
        );
      }
    }

    // Parar sons de alertas resolvidos
    for (const [alertId] of activeOscillators) {
      if (!(criticalAlerts as any[]).some((a: any) => a.id === alertId)) {
        stopAlertSound(alertId);
        firedAlerts.delete(alertId);
      }
    }
  }, [criticalAlerts, acknowledge]);

  return {
    criticalAlerts,
    acknowledge,
    acknowledgeAll,
    activeSoundCount: activeOscillators.size,
  };
}
