import { supabase } from "@/integrations/supabase-external/client";

export interface RouteMeta {
  pageLabel: string;
  hubName: string;
}

export interface ActivityDailyRecord {
  id: string;
  user_id: string;
  activity_date: string;
  first_seen_at: string;
  last_seen_at: string;
  last_route: string | null;
  last_page_label: string | null;
  last_hub: string | null;
  active_seconds: number;
  page_views_count: number;
  session_starts_count: number;
  device_info: string | null;
}

export interface ActivityEventRecord {
  id: string;
  user_id: string;
  activity_date: string;
  route: string;
  page_label: string;
  hub_name: string;
  entered_at: string;
  last_ping_at: string;
  duration_seconds: number;
  event_type: string;
}

export function resolveRouteMeta(pathname: string): RouteMeta {
  const path = (pathname || "/").toLowerCase();

  if (path.startsWith("/dashboard")) return { pageLabel: "Command Center", hubName: "Tráfego" };
  if (path.startsWith("/cockpit")) return { pageLabel: "Cockpit de Verba", hubName: "Tráfego" };
  if (path.startsWith("/simulador")) return { pageLabel: "Simulador", hubName: "Tráfego" };
  if (path.startsWith("/metricas")) return { pageLabel: "Métricas & Campanhas", hubName: "Tráfego" };
  if (path.startsWith("/relatorios")) return { pageLabel: "Relatórios", hubName: "Tráfego" };
  if (path.startsWith("/criativos")) return { pageLabel: "Criativos", hubName: "Tráfego" };
  if (path.startsWith("/auditoria")) return { pageLabel: "Auditoria Hub", hubName: "Tráfego" };

  if (path.startsWith("/social-insights")) return { pageLabel: "Insights Meta", hubName: "Social Media" };
  if (path.startsWith("/social-audit")) return { pageLabel: "Auditoria Orgânica", hubName: "Social Media" };
  if (path.startsWith("/social")) return { pageLabel: "Planejador & Feed", hubName: "Social Media" };
  if (path.startsWith("/organizador")) return { pageLabel: "Organizador Visual", hubName: "Social Media" };
  if (path.startsWith("/link-bio")) return { pageLabel: "Link na Bio", hubName: "Social Media" };
  if (path.startsWith("/formulario")) return { pageLabel: "Formulários", hubName: "Social Media" };
  if (path.startsWith("/quiz")) return { pageLabel: "Quiz Interativo", hubName: "Social Media" };

  if (path.startsWith("/clientes")) return { pageLabel: "Clientes & Contas", hubName: "Gestão" };
  if (path.startsWith("/reunioes")) return { pageLabel: "Reuniões", hubName: "Gestão" };
  if (path.startsWith("/cobrancas")) return { pageLabel: "Cobranças", hubName: "Gestão" };
  if (path.startsWith("/crm")) return { pageLabel: "CRM & Pipeline", hubName: "Gestão" };

  if (path.startsWith("/victoria")) return { pageLabel: "Victoria AI & Neural", hubName: "Inteligência IA" };
  if (path.startsWith("/strategy-map")) return { pageLabel: "Mapa Estratégico", hubName: "Estratégia" };
  if (path.startsWith("/regras")) return { pageLabel: "Regras & Diretrizes", hubName: "Regras" };
  if (path.startsWith("/automacoes")) return { pageLabel: "Automações & Alertas", hubName: "Operação" };
  if (path.startsWith("/perfil")) return { pageLabel: "Meu Perfil & Equipe", hubName: "Sistema" };
  if (path.startsWith("/config")) return { pageLabel: "Configurações Gerais", hubName: "Admin" };

  return { pageLabel: path === "/" ? "Início" : path, hubName: "Plataforma" };
}

export function getLocalIsoDate(d = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDurationCompact(seconds?: number | null): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  if (total === 0) return "0s";
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function isUserOnlineNow(lastSeenAt?: string | null, status?: string | null): boolean {
  if (status === "inativo") return false;
  if (!lastSeenAt) return false;
  const diffMs = Date.now() - new Date(lastSeenAt).getTime();
  return diffMs >= 0 && diffMs <= 2 * 60 * 1000; // 2 minutos
}

function getDeviceSummary(): string {
  if (typeof navigator === "undefined") return "web";
  const ua = navigator.userAgent || "";
  const isMobile = /Mobi|Android|iPhone/i.test(ua);
  const browser = /Edg/i.test(ua)
    ? "Edge"
    : /Chrome/i.test(ua)
    ? "Chrome"
    : /Firefox/i.test(ua)
    ? "Firefox"
    : /Safari/i.test(ua)
    ? "Safari"
    : "Navegador";
  return `${isMobile ? "Mobile" : "Desktop"} · ${browser}`;
}

export function isMissingPixelSchemaError(error: any): boolean {
  const msg = String(error?.message || "");
  const code = String(error?.code || "");
  return (
    code === "42P01" ||
    code === "42883" ||
    code === "PGRST202" ||
    /does not exist|schema cache|could not find the function/i.test(msg)
  );
}

let pixelSchemaMissingCached = false;

export async function sendWorkflowPixelPulse(params: {
  route: string;
  eventId?: string | null;
  deltaSeconds?: number;
  isLogin?: boolean;
}): Promise<{ eventId: string | null; schemaMissing: boolean }> {
  if (pixelSchemaMissingCached) {
    return { eventId: null, schemaMissing: true };
  }

  const meta = resolveRouteMeta(params.route);
  const today = getLocalIsoDate();

  try {
    const { data, error } = await (supabase as any).rpc("track_user_pixel", {
      p_route: params.route,
      p_page_label: meta.pageLabel,
      p_hub: meta.hubName,
      p_event_id: params.eventId || null,
      p_delta_seconds: Math.max(0, Math.round(params.deltaSeconds || 0)),
      p_is_login: Boolean(params.isLogin),
      p_device: getDeviceSummary(),
      p_activity_date: today,
    });

    if (error) {
      if (isMissingPixelSchemaError(error)) {
        pixelSchemaMissingCached = true;
        return { eventId: null, schemaMissing: true };
      }
      console.warn("[WorkflowPixel] Erro ao registrar pulso:", error.message);
      return { eventId: params.eventId || null, schemaMissing: false };
    }

    return { eventId: (data as string) || params.eventId || null, schemaMissing: false };
  } catch (err: any) {
    if (isMissingPixelSchemaError(err)) {
      pixelSchemaMissingCached = true;
      return { eventId: null, schemaMissing: true };
    }
    return { eventId: params.eventId || null, schemaMissing: false };
  }
}

export async function fetchTeamActivitySnapshot(params: {
  selectedDate: string;
  matrixDays?: number;
}) {
  const matrixDays = params.matrixDays || 7;
  const endDate = params.selectedDate;
  const startObj = new Date(`${endDate}T12:00:00`);
  startObj.setDate(startObj.getDate() - (matrixDays - 1));
  const startDate = getLocalIsoDate(startObj);

  const [profilesRes, dailyRes] = await Promise.all([
    (supabase as any)
      .from("profiles")
      .select("id, full_name, email, position, role, avatar_url, status, updated_at, last_seen_at, last_route, last_page_label")
      .order("full_name", { ascending: true }),
    (supabase as any)
      .from("user_activity_daily")
      .select("*")
      .gte("activity_date", startDate)
      .lte("activity_date", endDate)
      .order("last_seen_at", { ascending: false }),
  ]);

  // Fallback caso profiles ainda não tenha last_seen_at/last_route no banco remoto
  let profiles = profilesRes.data || [];
  if (profilesRes.error && /last_seen_at|last_route|last_page_label/i.test(profilesRes.error.message || "")) {
    const fallbackProf = await (supabase as any)
      .from("profiles")
      .select("id, full_name, email, position, role, avatar_url, status, updated_at")
      .order("full_name", { ascending: true });
    profiles = fallbackProf.data || [];
  }

  const migrationPending = Boolean(dailyRes.error && isMissingPixelSchemaError(dailyRes.error));
  const rangeDaily: ActivityDailyRecord[] = migrationPending ? [] : dailyRes.data || [];
  const selectedDayRows = rangeDaily.filter((r) => r.activity_date === params.selectedDate);

  // Gera lista de datas ordenadas para matriz
  const matrixDates: string[] = [];
  for (let i = matrixDays - 1; i >= 0; i--) {
    const d = new Date(`${endDate}T12:00:00`);
    d.setDate(d.getDate() - i);
    matrixDates.push(getLocalIsoDate(d));
  }

  return {
    profiles,
    selectedDayRows,
    rangeDaily,
    matrixDates,
    migrationPending,
  };
}

export async function fetchUserWorkflowTrail(userId: string, activityDate: string): Promise<ActivityEventRecord[]> {
  const { data, error } = await (supabase as any)
    .from("user_activity_events")
    .select("*")
    .eq("user_id", userId)
    .eq("activity_date", activityDate)
    .order("entered_at", { ascending: false })
    .limit(120);

  if (error) {
    if (!isMissingPixelSchemaError(error)) {
      console.warn("[WorkflowPixel] Erro ao buscar trilha:", error.message);
    }
    return [];
  }
  return (data || []) as ActivityEventRecord[];
}

