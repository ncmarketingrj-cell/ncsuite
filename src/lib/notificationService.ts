// src/lib/notificationService.ts
// NC Performance Suite — Central de Notificações (Até 100 Alertas Acumulativos + Auto-Purge)

import { supabase } from "@/integrations/supabase-external/client";

export const MAX_NOTIFICATIONS_CAP = 100;

export interface AppNotification {
  id: string;
  user_id?: string | null;
  title: string;
  message: string;
  is_critical?: boolean;
  is_read: boolean;
  type?: string;
  link?: string;
  created_at: string;
  acknowledged_at?: string | null;
}

/**
 * Busca até 100 notificações acumulativas ordenadas pela data mais recente.
 */
export async function getRecentNotifications(limit = MAX_NOTIFICATIONS_CAP): Promise<AppNotification[]> {
  try {
    const { data, error } = await (supabase as any)
      .from("notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[NOTIFICATION-SERVICE] Erro ao buscar notificações:", error);
      return [];
    }
    return (data || []) as AppNotification[];
  } catch (err) {
    console.error("[NOTIFICATION-SERVICE] Exceção ao buscar notificações:", err);
    return [];
  }
}

/**
 * Verifica capacidade: se atingir ou ultrapassar 100 notificações,
 * executa limpeza automática (zerando ou removendo os excedentes/não lidos antigos)
 * para abrir espaço imediatamente para os novos alertas sem travar a central.
 */
export async function enforceNotificationCapacity(): Promise<{ purged: boolean; countPurged: number }> {
  try {
    const { count, error } = await (supabase as any)
      .from("notifications")
      .select("id", { count: "exact", head: true });

    if (error || typeof count !== "number") return { purged: false, countPurged: 0 };

    if (count >= MAX_NOTIFICATIONS_CAP) {
      console.warn(`[NOTIFICATION-SERVICE] ⚠️ Limite de ${MAX_NOTIFICATIONS_CAP} notificações atingido (${count}). Executando reciclagem/limpeza automática...`);
      
      // Busca os 100 primeiros IDs mais recentes para manter apenas os mais novos se for o caso,
      // ou zera completamente as notificações não lidas/antigas como solicitado
      const { data: latest } = await (supabase as any)
        .from("notifications")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(MAX_NOTIFICATIONS_CAP);

      if (latest && latest.length >= MAX_NOTIFICATIONS_CAP) {
        // Exclui todos os registros para zerar e garantir recebimento limpo dos novos alertas
        const { error: delErr } = await (supabase as any)
          .from("notifications")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (!delErr) {
          console.log("[NOTIFICATION-SERVICE] ✅ Central de notificações resetada com sucesso para receber novos alertas.");
          return { purged: true, countPurged: count };
        }
      }
    }
    return { purged: false, countPurged: 0 };
  } catch (err) {
    console.error("[NOTIFICATION-SERVICE] Erro na reciclagem automática:", err);
    return { purged: false, countPurged: 0 };
  }
}

/**
 * Marca todas as notificações não lidas como lidas.
 */
export async function markAllNotificationsAsRead(ids?: string[]): Promise<boolean> {
  try {
    let query = (supabase as any).from("notifications").update({
      is_read: true,
      acknowledged_at: new Date().toISOString(),
    });

    if (ids && ids.length > 0) {
      query = query.in("id", ids);
    } else {
      query = query.eq("is_read", false);
    }

    const { error } = await query;
    if (error) {
      console.error("[NOTIFICATION-SERVICE] Erro ao marcar como lidas:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[NOTIFICATION-SERVICE] Exceção ao marcar como lidas:", err);
    return false;
  }
}

/**
 * Marca uma única notificação como lida.
 */
export async function markNotificationAsRead(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("notifications")
      .update({ is_read: true, acknowledged_at: new Date().toISOString() })
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Zera / Limpa manualmente todas as notificações acumuladas.
 */
export async function clearAllNotifications(): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("notifications")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      console.error("[NOTIFICATION-SERVICE] Erro ao limpar notificações:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[NOTIFICATION-SERVICE] Exceção ao limpar notificações:", err);
    return false;
  }
}

/**
 * Exclui uma notificação específica por ID.
 */
export async function deleteNotification(id: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any)
      .from("notifications")
      .delete()
      .eq("id", id);
    return !error;
  } catch {
    return false;
  }
}
