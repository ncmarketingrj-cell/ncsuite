// src/lib/notificationService.ts
// NC Performance Suite — Central de Notificações Inteligente (Enriquecimento de Conta, Deduplicação & Controles de Alerta)

import { supabase } from "@/integrations/supabase-external/client";

export const MAX_NOTIFICATIONS_CAP = 100;

export type AlertCategoryKey =
  | "alert_cpl"
  | "alert_budget"
  | "alert_closing"
  | "alert_frequency"
  | "alert_zero_delivery"
  | "alert_perf_drop"
  | "other";

export interface AlertCategoryToggles {
  cplEnabled: boolean;            // Alerta de CPL / Custo por Resultado / Conversa
  budgetEnabled: boolean;         // Alerta de Orçamento Diário (80% - 100%+)
  closingSummaryEnabled: boolean; // Alerta de Fechamento Diário (Resumo D-1)
  frequencyEnabled: boolean;      // Alerta de Frequência Alta
  zeroDeliveryEnabled: boolean;   // Alerta de Campanha Sem Entrega (R$ 0,00)
  perfDropEnabled: boolean;       // Alerta de Queda de Performance
}

const CATEGORY_TOGGLES_KEY = "nc_alert_category_toggles_v1";
export const ALERT_CATEGORY_TOGGLES_EVENT = "nc:alert-category-toggles-changed";

const DEFAULT_CATEGORY_TOGGLES: AlertCategoryToggles = {
  cplEnabled: true,
  budgetEnabled: true,
  closingSummaryEnabled: true,
  frequencyEnabled: true,
  zeroDeliveryEnabled: true,
  perfDropEnabled: true,
};

export function getAlertCategoryToggles(): AlertCategoryToggles {
  try {
    if (typeof window === "undefined" || typeof localStorage === "undefined") {
      return { ...DEFAULT_CATEGORY_TOGGLES };
    }
    const raw = localStorage.getItem(CATEGORY_TOGGLES_KEY);
    return raw ? { ...DEFAULT_CATEGORY_TOGGLES, ...JSON.parse(raw) } : { ...DEFAULT_CATEGORY_TOGGLES };
  } catch {
    return { ...DEFAULT_CATEGORY_TOGGLES };
  }
}

export async function setAlertCategoryToggles(
  patch: Partial<AlertCategoryToggles>,
  syncToDatabase = true
): Promise<AlertCategoryToggles> {
  const next = { ...getAlertCategoryToggles(), ...patch };
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CATEGORY_TOGGLES_KEY, JSON.stringify(next));
    } catch {}
    window.dispatchEvent(new CustomEvent(ALERT_CATEGORY_TOGGLES_EVENT, { detail: next }));
  }

  if (syncToDatabase) {
    try {
      // Sincroniza toggles nas regras ativas de alert_thresholds quando aplicável
      const thresholdPatch: Record<string, any> = {};
      if (patch.cplEnabled !== undefined) thresholdPatch.alert_cpl_enabled = patch.cplEnabled;
      if (patch.budgetEnabled !== undefined) thresholdPatch.alert_budget_enabled = patch.budgetEnabled;
      if (patch.frequencyEnabled !== undefined) thresholdPatch.alert_frequency_enabled = patch.frequencyEnabled;

      if (Object.keys(thresholdPatch).length > 0) {
        await (supabase as any)
          .from("alert_thresholds")
          .update(thresholdPatch)
          .neq("id", "00000000-0000-0000-0000-000000000000");
      }

      // Sincroniza toggles globais em meta_ads_configs quando aplicável
      const configPatch: Record<string, any> = {};
      if (patch.zeroDeliveryEnabled !== undefined) configPatch.zero_delivery_enabled = next.zeroDeliveryEnabled;
      if (patch.perfDropEnabled !== undefined) configPatch.perf_drop_enabled = next.perfDropEnabled;

      if (Object.keys(configPatch).length > 0) {
        const { data: cfg } = await (supabase as any).from("meta_ads_configs").select("id").limit(1).maybeSingle();
        if (cfg?.id) {
          await (supabase as any).from("meta_ads_configs").update(configPatch).eq("id", cfg.id);
        }
      }
    } catch (e) {
      console.warn("[NOTIFICATION-SERVICE] Aviso ao sincronizar toggles no banco:", e);
    }
  }

  return next;
}

export interface AppNotification {
  id: string;
  user_id?: string | null;
  title: string;
  message: string;
  is_critical?: boolean;
  is_read: boolean;
  type?: string;
  link?: string;
  metadata?: Record<string, any> | null;
  created_at: string;
  acknowledged_at?: string | null;
  // Campos enriquecidos em tempo de execução para exibição didática:
  category?: AlertCategoryKey;
  categoryLabel?: string;
  accountName?: string;
  campaignName?: string;
  displayTitle?: string;
  displayMessage?: string;
  duplicateCount?: number;
}

// ─── Cache leve de Contas e Campanhas para enriquecer notificações ────────────
interface LookupCache {
  timestamp: number;
  accountsById: Map<string, string>;
  campaignsById: Map<string, { name: string; accountId: string; accountName: string }>;
  campaignsByName: Map<string, { name: string; accountId: string; accountName: string }>;
}

let lookupCache: LookupCache | null = null;
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

async function getAccountAndCampaignLookup(): Promise<LookupCache> {
  if (lookupCache && Date.now() - lookupCache.timestamp < CACHE_TTL_MS) {
    return lookupCache;
  }

  const accountsById = new Map<string, string>();
  const campaignsById = new Map<string, { name: string; accountId: string; accountName: string }>();
  const campaignsByName = new Map<string, { name: string; accountId: string; accountName: string }>();

  try {
    const [{ data: accs }, { data: camps }] = await Promise.all([
      (supabase as any).from("ad_accounts").select("id, name"),
      (supabase as any).from("campaigns").select("id, external_id, name, ad_account_id"),
    ]);

    for (const a of accs || []) {
      const cleanName = String(a.name || "").trim();
      if (a.id) accountsById.set(String(a.id), cleanName);
      if (a.external_id) {
        accountsById.set(String(a.external_id), cleanName);
        accountsById.set(`act_${String(a.external_id).replace(/^act_/, "")}`, cleanName);
      }
    }

    for (const c of camps || []) {
      const cName = String(c.name || "").trim();
      const accId = String(c.ad_account_id || "");
      const accName = accountsById.get(accId) || "";
      const entry = { name: cName, accountId: accId, accountName: accName };

      if (c.id) campaignsById.set(String(c.id), entry);
      if (c.external_id) campaignsById.set(String(c.external_id), entry);
      if (cName && accName) {
        campaignsByName.set(cName.toUpperCase(), entry);
      }
    }
  } catch (err) {
    console.warn("[NOTIFICATION-SERVICE] Falha ao carregar lookup de contas/campanhas:", err);
  }

  lookupCache = {
    timestamp: Date.now(),
    accountsById,
    campaignsById,
    campaignsByName,
  };
  return lookupCache;
}

/**
 * Classifica a categoria canônica de uma notificação (mesmo para registros legados).
 */
export function classifyNotificationCategory(n: AppNotification): AlertCategoryKey {
  const t = String(n.type || "").toLowerCase();
  const titleUpper = String(n.title || "").toUpperCase();
  const msgUpper = String(n.message || "").toUpperCase();
  const metaType = String(n.metadata?.alert_type || "").toUpperCase();

  if (
    metaType === "DAILY_SUMMARY_D1" ||
    titleUpper.includes("FECHAMENTO:") ||
    titleUpper.includes("FECHAMENTO DIÁRIO") ||
    msgUpper.includes("RESUMO D-1")
  ) {
    return "alert_closing";
  }

  if (
    t === "alert_budget" ||
    metaType === "BUDGET_WARNING" ||
    titleUpper.includes("ORÇAMENTO")
  ) {
    return "alert_budget";
  }

  if (
    t === "alert_frequency" ||
    metaType === "HIGH_FREQUENCY" ||
    titleUpper.includes("FREQUÊNCIA")
  ) {
    return "alert_frequency";
  }

  if (
    metaType === "ZERO_DELIVERY" ||
    titleUpper.includes("SEM ENTREGA") ||
    titleUpper.includes("ZERO DELIVERY")
  ) {
    return "alert_zero_delivery";
  }

  if (
    metaType === "PERFORMANCE_DROP" ||
    titleUpper.includes("QUEDA DE PERFORMANCE")
  ) {
    return "alert_perf_drop";
  }

  if (
    t === "alert_cpl" ||
    metaType === "HIGH_CPR" ||
    metaType === "CLIENT_HIGH_CPA" ||
    titleUpper.includes("CUSTO/") ||
    titleUpper.includes("CPL ALTO") ||
    titleUpper.includes("CPA ALTO") ||
    titleUpper.includes("CPA CRÍTICO") ||
    titleUpper.includes("CPC ALTO")
  ) {
    return "alert_cpl";
  }

  return "other";
}

/**
 * Enriquecimento didático: descobre Conta, Campanha e reescreve Título e Mensagem
 * de forma clara e autoexplicativa para o gestor.
 */
function enrichNotificationItem(n: AppNotification, lookup: LookupCache): AppNotification {
  const category = classifyNotificationCategory(n);

  // 1. Extrair parâmetros da URL de link (?account=...&campaign=...)
  let linkAccountId = "";
  let linkCampaignId = "";
  if (n.link && n.link.includes("?")) {
    try {
      const qs = n.link.split("?")[1] || "";
      const params = new URLSearchParams(qs);
      linkAccountId = params.get("account") || "";
      linkCampaignId = params.get("campaign") || "";
    } catch {}
  }

  const metaAccountId = String(n.metadata?.account_id || linkAccountId || "");
  const metaCampaignId = String(n.metadata?.campaign_id || n.metadata?.db_campaign_id || linkCampaignId || "");

  // 2. Extrair nome da campanha a partir do título ou metadata
  let rawCampName = String(n.metadata?.campaign_name || "").trim();
  if (!rawCampName && n.title.includes("—")) {
    rawCampName = n.title.split("—").slice(1).join("—").trim();
  }

  // 3. Resolver nome da Conta e da Campanha usando o Lookup
  const campFromId = metaCampaignId ? lookup.campaignsById.get(metaCampaignId) : undefined;
  const campFromName = !campFromId && rawCampName ? lookup.campaignsByName.get(rawCampName.toUpperCase()) : undefined;
  const resolvedCamp = campFromId || campFromName;

  let accountName =
    String(n.metadata?.account_name || "").trim() ||
    (metaAccountId ? lookup.accountsById.get(metaAccountId) || "" : "") ||
    resolvedCamp?.accountName ||
    "";

  // Caso o texto já comece com "Nome da Conta • 1d de campanha — ..."
  if (!accountName && n.message.includes("•") && n.message.includes("—")) {
    const firstBullet = n.message.split("•")[0]?.trim() || "";
    if (firstBullet.length > 2 && firstBullet.length < 55 && !firstBullet.startsWith("R$")) {
      accountName = firstBullet;
    }
  }

  const campaignName = resolvedCamp?.name || rawCampName || "";

  // 4. Construir textos didáticos por categoria
  let categoryLabel = "Notificação";
  let displayTitle = n.title;
  let displayMessage = n.message;

  if (category === "alert_closing") {
    categoryLabel = "Fechamento Diário (D-1)";
    accountName = "Todas as Contas Ativas";
    const datePart = n.title.includes(":") ? n.title.split(":")[1]?.trim() : "Ontem";

    // Extrair valores do resumo D-1 para formatação limpa
    const spendMatch = n.message.match(/R\$\s*([\d.,]+)/i);
    const resultsMatch = n.message.match(/([\d.]+)\s+resultados/i);
    const reachMatch = n.message.match(/Alcance:\s*([\d.]+)/i);

    const spendVal = spendMatch ? Number(spendMatch[1].replace(",", ".")) : null;
    const resultsVal = resultsMatch ? Number(resultsMatch[1].replace(/\./g, "")) : null;
    const reachVal = reachMatch ? reachMatch[1] : null;

    displayTitle = `🌅 Fechamento Diário Consolidado — ${datePart}`;
    if (spendVal !== null) {
      const spendFormatted = spendVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const resFormatted = resultsVal !== null ? resultsVal.toLocaleString("pt-BR") : "0";
      displayMessage = `Balanço de ontem (${datePart}) em todas as contas: R$ ${spendFormatted} investidos • ${resFormatted} conversões/resultados gerados${reachVal ? ` • Alcance de ${reachVal} pessoas` : ""}.`;
    }
  } else if (category === "alert_budget") {
    categoryLabel = "Alerta de Orçamento";
    const pctMatch = (n.title + " " + n.message).match(/(\d+)\s*%/);
    const pct = pctMatch ? Number(pctMatch[1]) : null;
    const spendMatch = n.message.match(/R\$\s*([\d.,]+)\s*de\s*R\$\s*([\d.,]+)/i);

    const statusWord = pct && pct >= 100 ? "Orçamento Diário Atingiu 100%+" : `Orçamento Diário em ${pct || 90}%`;
    displayTitle = campaignName ? `💸 ${statusWord} — ${campaignName}` : n.title;

    if (spendMatch) {
      const spent = Number(spendMatch[1].replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const budget = Number(spendMatch[2].replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      displayMessage = `${accountName ? `Conta: ${accountName} • ` : ""}Campanha consumiu R$ ${spent} do orçamento diário de R$ ${budget} (${pct || 90}%). ${
        pct && pct >= 100
          ? "O teto diário foi atingido; verifique se deseja escalar verba ou manter o limite."
          : "Próximo do limite diário programado."
      }`;
    } else if (accountName && !n.message.toLowerCase().includes(accountName.toLowerCase())) {
      displayMessage = `Conta: ${accountName} • ${n.message}`;
    }
  } else if (category === "alert_cpl") {
    categoryLabel = "Custo Acima da Meta";
    // Extrair custo atual e limite
    const costMatch = n.message.match(/hoje\s*R\$\s*([\d.,]+)\s*ultrapassou\s*o\s*limite\s*de\s*R\$\s*([\d.,]+)/i);
    const metricType = n.title.toUpperCase().includes("CONVERSA")
      ? "Custo por Conversa"
      : n.title.toUpperCase().includes("CPL")
      ? "CPL (Custo por Lead)"
      : "Custo por Resultado";

    displayTitle = campaignName ? `🚨 ${metricType} Alto — ${campaignName}` : n.title;

    if (costMatch) {
      const currentCost = Number(costMatch[1].replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const maxCost = Number(costMatch[2].replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const convMatch = n.message.match(/(\d+)\s*(Resultado|Conversa|Lead|Compra)/i);
      const spendMatch = n.message.match(/Gasto:\s*R\$\s*([\d.,]+)/i);

      const convPart = convMatch ? ` • ${convMatch[1]} ${convMatch[2].toLowerCase()}(s) hoje` : "";
      const spendPart = spendMatch ? ` • Gasto: R$ ${Number(spendMatch[1].replace(",", ".")).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "";

      displayMessage = `${accountName ? `Conta: ${accountName} • ` : ""}${metricType} atual em R$ ${currentCost} (Meta máxima: R$ ${maxCost})${spendPart}${convPart}. Avalie criativos ou ajuste de lance.`;
    } else if (accountName && !n.message.toLowerCase().includes(accountName.toLowerCase())) {
      displayMessage = `Conta: ${accountName} • ${n.message}`;
    }
  } else if (category === "alert_frequency") {
    categoryLabel = "Saturação de Frequência";
    displayTitle = campaignName ? `📡 Frequência Alta — ${campaignName}` : n.title;
    if (accountName && !n.message.toLowerCase().includes(accountName.toLowerCase())) {
      displayMessage = `Conta: ${accountName} • ${n.message}`;
    }
  } else if (category === "alert_zero_delivery") {
    categoryLabel = "Sem Entrega (R$ 0,00)";
    displayTitle = campaignName ? `⚠️ Campanha Sem Entrega — ${campaignName}` : n.title;
    if (accountName && !n.message.toLowerCase().includes(accountName.toLowerCase())) {
      displayMessage = `Conta: ${accountName} • ${n.message}`;
    }
  } else if (category === "alert_perf_drop") {
    categoryLabel = "Queda de Performance";
    displayTitle = campaignName ? `📉 Queda de Performance — ${campaignName}` : n.title;
    if (accountName && !n.message.toLowerCase().includes(accountName.toLowerCase())) {
      displayMessage = `Conta: ${accountName} • ${n.message}`;
    }
  }

  return {
    ...n,
    category,
    categoryLabel,
    accountName: accountName || "Conta Meta Ads",
    campaignName: campaignName || undefined,
    displayTitle,
    displayMessage,
  };
}

/**
 * Busca até 100 notificações acumulativas ordenadas pela data mais recente,
 * enriquecendo com o Nome da Conta, formatando o texto didaticamente e
 * removendo duplicatas geradas para a mesma campanha/categoria no mesmo dia.
 */
export async function getRecentNotifications(
  limit = MAX_NOTIFICATIONS_CAP,
  options?: { includeDisabledCategories?: boolean }
): Promise<AppNotification[]> {
  try {
    const [{ data, error }, lookup] = await Promise.all([
      (supabase as any)
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit),
      getAccountAndCampaignLookup(),
    ]);

    if (error) {
      console.error("[NOTIFICATION-SERVICE] Erro ao buscar notificações:", error);
      return [];
    }

    const rawList = (data || []) as AppNotification[];
    const enrichedList = rawList.map((item) => enrichNotificationItem(item, lookup));

    // Deduplicação inteligente por (Dia + Categoria + Conta + Campanha)
    const seenKeys = new Map<string, AppNotification>();
    const duplicateIdsToDelete: string[] = [];

    for (const item of enrichedList) {
      const dayKey = (item.created_at || "").slice(0, 10);
      const normCamp = (item.campaignName || item.title || "").trim().toUpperCase();
      const normAcc = (item.accountName || "").trim().toUpperCase();
      const dedupKey = `${dayKey}__${item.category}__${normAcc}__${normCamp}`;

      const existing = seenKeys.get(dedupKey);
      if (!existing) {
        seenKeys.set(dedupKey, { ...item, duplicateCount: 1 });
      } else {
        existing.duplicateCount = (existing.duplicateCount || 1) + 1;
        duplicateIdsToDelete.push(item.id);
      }
    }

    // Remove silenciosamente do banco as duplicatas antigas para manter a tabela limpa
    if (duplicateIdsToDelete.length > 0) {
      (supabase as any)
        .from("notifications")
        .delete()
        .in("id", duplicateIdsToDelete)
        .then(() => {
          console.log(`[NOTIFICATION-SERVICE] 🧹 ${duplicateIdsToDelete.length} notificação(ões) duplicada(s) consolidada(s).`);
        })
        .catch(() => {});
    }

    let result = Array.from(seenKeys.values());

    // Filtra categorias desativadas pelo usuário (salvo se includeDisabledCategories = true)
    if (!options?.includeDisabledCategories) {
      const toggles = getAlertCategoryToggles();
      result = result.filter((item) => {
        if (item.category === "alert_cpl" && !toggles.cplEnabled) return false;
        if (item.category === "alert_budget" && !toggles.budgetEnabled) return false;
        if (item.category === "alert_closing" && !toggles.closingSummaryEnabled) return false;
        if (item.category === "alert_frequency" && !toggles.frequencyEnabled) return false;
        if (item.category === "alert_zero_delivery" && !toggles.zeroDeliveryEnabled) return false;
        if (item.category === "alert_perf_drop" && !toggles.perfDropEnabled) return false;
        return true;
      });
    }

    return result;
  } catch (err) {
    console.error("[NOTIFICATION-SERVICE] Exceção ao buscar notificações:", err);
    return [];
  }
}

/**
 * Verifica capacidade: se atingir ou ultrapassar 100 notificações,
 * executa limpeza automática para abrir espaço imediatamente para novos alertas.
 */
export async function enforceNotificationCapacity(): Promise<{ purged: boolean; countPurged: number }> {
  try {
    const { count, error } = await (supabase as any)
      .from("notifications")
      .select("id", { count: "exact", head: true });

    if (error || typeof count !== "number") return { purged: false, countPurged: 0 };

    if (count >= MAX_NOTIFICATIONS_CAP) {
      console.warn(`[NOTIFICATION-SERVICE] ⚠️ Limite de ${MAX_NOTIFICATIONS_CAP} notificações atingido (${count}). Executando reciclagem automática...`);

      const { data: latest } = await (supabase as any)
        .from("notifications")
        .select("id")
        .order("created_at", { ascending: false })
        .limit(MAX_NOTIFICATIONS_CAP);

      if (latest && latest.length >= MAX_NOTIFICATIONS_CAP) {
        const { error: delErr } = await (supabase as any)
          .from("notifications")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");

        if (!delErr) {
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

/**
 * Exclui todas as notificações de uma categoria específica (ex: ao desativar orçamento ou fechamento).
 */
export async function deleteNotificationsByCategory(category: AlertCategoryKey): Promise<number> {
  try {
    const all = await getRecentNotifications(MAX_NOTIFICATIONS_CAP, { includeDisabledCategories: true });
    const targetIds = all.filter((n) => n.category === category).map((n) => n.id);
    if (targetIds.length === 0) return 0;
    await (supabase as any).from("notifications").delete().in("id", targetIds);
    return targetIds.length;
  } catch {
    return 0;
  }
}
