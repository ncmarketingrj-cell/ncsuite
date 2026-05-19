// src/hooks/useAlertEngine.ts
// NC Performance Suite — Motor de Alertas Sonoros com Browser Notifications

import { useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// IDs de alertas já disparados nesta sessão (evita loop de duplicatas)
const firedAlerts = new Set<string>();
// Osciladores em execução (para parar o som quando necessário)
const activeOscillators = new Map<string, { stop: () => void }>();

// ─── Web Audio API: Gerar som de alerta urgente ───────────────────────────────
function playAlertSound(alertId: string) {
  if (activeOscillators.has(alertId)) return; // já está tocando

  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();
    let stopped = false;

    const playBeep = (frequency: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.4, startTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, startTime + duration);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    };

    const playSequence = () => {
      if (stopped) return;
      const t = ctx.currentTime;
      // 3 bipes urgentes: 880Hz, 880Hz, 1100Hz
      playBeep(880, t + 0.0, 0.12);
      playBeep(880, t + 0.18, 0.12);
      playBeep(1100, t + 0.36, 0.22);
    };

    // Toca imediatamente e repete a cada 5 segundos
    playSequence();
    const loopInterval = setInterval(() => {
      if (stopped) { clearInterval(loopInterval); return; }
      playSequence();
    }, 5000);

    activeOscillators.set(alertId, {
      stop: () => {
        stopped = true;
        clearInterval(loopInterval);
        try { ctx.close(); } catch (_) {}
        activeOscillators.delete(alertId);
      }
    });
  } catch (e) {
    console.warn("[ALERT-ENGINE] Web Audio API indisponível:", e);
  }
}

function stopAlertSound(alertId: string) {
  const osc = activeOscillators.get(alertId);
  if (osc) osc.stop();
}

// ─── Browser Notifications API ────────────────────────────────────────────────
async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const perm = await Notification.requestPermission();
  return perm === "granted";
}

function showBrowserNotification(
  alertId: string,
  title: string,
  body: string,
  link: string,
  onAcknowledge: () => void
) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const notif = new Notification(title, {
    body,
    icon: "/favicon.ico",
    tag: alertId, // evita duplicar notificações com mesmo ID
    requireInteraction: true, // fica visível até o usuário interagir
    silent: false, // permite o som do sistema também
  });

  notif.onclick = () => {
    window.focus();
    stopAlertSound(alertId);
    onAcknowledge();
    // Navegar para o link da campanha
    if (link && link.startsWith("/")) {
      window.location.href = link;
    }
    notif.close();
  };

  notif.onclose = () => {
    // Se fechar sem clicar, o som continua (só para com clique)
  };
}

// ─── Hook Principal ───────────────────────────────────────────────────────────
export function useAlertEngine() {
  const permissionGranted = useRef(false);

  // Solicitar permissão na inicialização
  useEffect(() => {
    requestNotificationPermission().then(granted => {
      permissionGranted.current = granted;
      if (!granted) {
        console.warn("[ALERT-ENGINE] Permissão de notificações não concedida.");
      } else {
        console.log("[ALERT-ENGINE] Notificações ativadas ✅");
      }
    });
  }, []);

  const acknowledge = useCallback(async (alertId: string) => {
    stopAlertSound(alertId);
    firedAlerts.delete(alertId); // permite re-disparo se o problema persistir
    // Marcar como lida no banco
    await supabase.from("notifications")
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq("id", alertId);
  }, []);

  // Buscar alertas críticos não lidos a cada 15 segundos
  const { data: criticalAlerts = [] } = useQuery({
    queryKey: ["critical_alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("is_critical", true)
        .eq("is_read", false)
        .is("acknowledged_at", null)
        .order("created_at", { ascending: false })
        .limit(10);
      if (error) return [];
      return data || [];
    },
    refetchInterval: 15000,
  });

  // Processar alertas críticos
  useEffect(() => {
    for (const alert of criticalAlerts) {
      if (firedAlerts.has(alert.id)) continue; // já disparado
      firedAlerts.add(alert.id);

      console.log(`[ALERT-ENGINE] 🚨 Alerta crítico detectado: ${alert.title}`);

      // 1. Tocar som em loop
      playAlertSound(alert.id);

      // 2. Mostrar notificação do browser
      if (permissionGranted.current) {
        showBrowserNotification(
          alert.id,
          alert.title,
          alert.message,
          alert.link || "/metricas",
          () => acknowledge(alert.id)
        );
      }
    }

    // Parar sons de alertas que foram reconhecidos (não estão mais na lista)
    for (const [alertId] of activeOscillators) {
      const stillActive = criticalAlerts.some(a => a.id === alertId);
      if (!stillActive) {
        stopAlertSound(alertId);
        firedAlerts.delete(alertId);
      }
    }
  }, [criticalAlerts, acknowledge]);

  return {
    criticalAlerts,
    acknowledge,
    activeSoundCount: activeOscillators.size,
  };
}
