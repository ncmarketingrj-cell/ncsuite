import { useEffect, useRef } from "react";
import { sendWorkflowPixelPulse } from "@/lib/activityPixelService";

const HEARTBEAT_INTERVAL_MS = 30_000;
const SESSION_KEY = "nc_pixel_session_logged_v1";

/**
 * Pixel automático de monitoramento de presença e fluxo de trabalho.
 * Registra login diário, navegação entre páginas/hubs e tempo ativo real enquanto a aba está visível.
 */
export function useWorkflowPixel(userId?: string | null, pathname?: string) {
  const currentEventIdRef = useRef<string | null>(null);
  const currentRouteRef = useRef<string | null>(null);
  const lastPulseAtRef = useRef<number>(Date.now());
  const disabledBySchemaRef = useRef<boolean>(false);

  // Mudança de rota ou inicialização do usuário
  useEffect(() => {
    if (!userId || !pathname || disabledBySchemaRef.current) return;

    const now = Date.now();
    const prevRoute = currentRouteRef.current;
    const prevEventId = currentEventIdRef.current;

    // Se mudou de rota e havia um evento anterior ativo, descarrega os últimos segundos antes de iniciar o próximo
    if (prevRoute && prevRoute !== pathname && prevEventId) {
      const elapsedSec = Math.max(0, Math.round((now - lastPulseAtRef.current) / 1000));
      if (elapsedSec > 0) {
        void sendWorkflowPixelPulse({
          route: prevRoute,
          eventId: prevEventId,
          deltaSeconds: elapsedSec,
        });
      }
      currentEventIdRef.current = null;
    }

    if (prevRoute === pathname && currentEventIdRef.current) {
      return;
    }

    currentRouteRef.current = pathname;
    lastPulseAtRef.current = now;

    const isFirstLoginInSession =
      typeof window !== "undefined" && !sessionStorage.getItem(SESSION_KEY);

    let cancelled = false;
    void (async () => {
      const res = await sendWorkflowPixelPulse({
        route: pathname,
        eventId: null,
        deltaSeconds: 0,
        isLogin: isFirstLoginInSession,
      });

      if (res.schemaMissing) {
        disabledBySchemaRef.current = true;
        return;
      }

      if (isFirstLoginInSession && typeof window !== "undefined") {
        sessionStorage.setItem(SESSION_KEY, new Date().toISOString());
      }

      if (!cancelled && currentRouteRef.current === pathname) {
        currentEventIdRef.current = res.eventId;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, pathname]);

  // Heartbeat periódico + flush quando alterna aba ou sai da página
  useEffect(() => {
    if (!userId || !pathname || disabledBySchemaRef.current) return;

    const flushPulse = async () => {
      if (disabledBySchemaRef.current || !currentRouteRef.current) return;
      const now = Date.now();
      const deltaSeconds =
        document.visibilityState === "visible"
          ? Math.max(1, Math.round((now - lastPulseAtRef.current) / 1000))
          : 0;
      lastPulseAtRef.current = now;

      const res = await sendWorkflowPixelPulse({
        route: currentRouteRef.current,
        eventId: currentEventIdRef.current,
        deltaSeconds,
      });

      if (res.schemaMissing) {
        disabledBySchemaRef.current = true;
        return;
      }

      if (res.eventId) {
        currentEventIdRef.current = res.eventId;
      }
    };

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void flushPulse();
      } else {
        lastPulseAtRef.current = Date.now();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        void flushPulse();
      } else {
        lastPulseAtRef.current = Date.now();
        void flushPulse();
      }
    };

    const handlePageHide = () => {
      void flushPulse();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [userId, pathname]);
}

