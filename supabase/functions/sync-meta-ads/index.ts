// supabase/functions/sync-meta-ads/index.ts
// NC Performance Suite — Motor de Sincronização com Budgets e Histórico

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const META_API_BASE = "https://graph.facebook.com/v21.0"

async function requireAuth(req: Request): Promise<{ user: any | null, errorResponse: Response | null }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { user: null, errorResponse: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) {
    return { user: null, errorResponse: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }
  return { user, errorResponse: null };
}

async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set("access_token", token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Meta API [${path}]: ${data.error.message}`)
  return data
}

// ─── NOVO: Meta API Helper com Paginação Automática ──────────────────────────
async function metaGetPaginated(path: string, token: string, params: Record<string, string> = {}) {
  let allData: any[] = [];
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set("access_token", token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  
  let nextUrl = url.toString();
  let pages = 0;
  
  while (nextUrl && pages < 50) { // limite de segurança de 50 páginas
    const res = await fetch(nextUrl)
    const data = await res.json()
    if (data.error) throw new Error(`Meta API Paginated [${path}]: ${data.error.message}`)
    
    if (data.data && Array.isArray(data.data)) {
      allData = allData.concat(data.data);
    }
    
    if (data.paging && data.paging.next) {
      nextUrl = data.paging.next;
      pages++;
    } else {
      nextUrl = "";
    }
  }
  
  return allData;
}

// ─── Buscar todas as contas vinculadas ao token ───────────────────────────────
async function fetchAdAccounts(token: string) {
  return await metaGetPaginated("/me/adaccounts", token, {
    fields: "name,currency,account_status,id,timezone_name",
    limit: "50"
  })
}

// ─── NOVO: Buscar campanhas com orçamentos + objetivo + status de entrega ─────
async function fetchCampaignsWithBudgets(adAccountId: string, token: string): Promise<any[]> {
  try {
    const data = await metaGet(`/${adAccountId}/campaigns`, token, {
      fields: "id,name,status,effective_status,daily_budget,lifetime_budget,objective",
      limit: "500"
    })
    return data.data || []
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar campanhas com orçamento de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar insights diários de campanha ─────────────────────────────────────
async function fetchCampaignInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    return await metaGetPaginated(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,reach,impressions,frequency,inline_link_clicks,date_start,date_stop",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      limit: "500",
      ...timeParams
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar insights de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar insights diários de adsets ─────────────────────────────────────
async function fetchAdSetInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    return await metaGetPaginated(`/${adAccountId}/insights`, token, {
      level: "adset",
      fields: "adset_id,adset_name,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,actions,reach,impressions,frequency,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      limit: "500",
      ...timeParams
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro adsets de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar insights diários de ads ─────────────────────────────────────
async function fetchAdInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    return await metaGetPaginated(`/${adAccountId}/insights`, token, {
      level: "ad",
      fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,actions,reach,impressions,frequency,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      limit: "500",
      ...timeParams
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro ads de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar status real de todos os conjuntos de anúncios da conta ────────────
// Necessário pois o endpoint de insights não retorna status — fixa "active" sem isso
async function fetchAdSetsWithStatus(adAccountId: string, token: string): Promise<any[]> {
  try {
    return await metaGetPaginated(`/${adAccountId}/adsets`, token, {
      fields: "id,name,status,campaign_id,daily_budget,lifetime_budget",
      limit: "500"
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar status de adsets de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar status real de todos os anúncios da conta ────────────────────────
// Necessário pois o endpoint de insights não retorna status — fixa "active" sem isso
async function fetchAdsWithStatus(adAccountId: string, token: string): Promise<any[]> {
  try {
    return await metaGetPaginated(`/${adAccountId}/ads`, token, {
      fields: "id,name,status,adset_id,campaign_id",
      limit: "500"
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar status de ads de ${adAccountId}:`, e.message)
    return []
  }
}

async function fetchDemographicBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  try {
    const [dataAgeGender, dataPlatform, dataHourly, dataRegion] = await Promise.all([
      metaGetPaginated(`/${adAccountId}/insights`, token, {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
        breakdowns: "age,gender",
        time_increment: "1",
        limit: "500",
        ...timeParams
      }),
      metaGetPaginated(`/${adAccountId}/insights`, token, {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
        breakdowns: "publisher_platform",
        time_increment: "1",
        limit: "500",
        ...timeParams
      }),
      metaGetPaginated(`/${adAccountId}/insights`, token, {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
        breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
        time_increment: "1",
        limit: "500",
        ...timeParams
      }),
      metaGetPaginated(`/${adAccountId}/insights`, token, {
        level: "campaign",
        fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
        breakdowns: "region",
        time_increment: "1",
        limit: "500",
        ...timeParams
      })
    ]);

    return { 
      demographics: [...dataAgeGender, ...dataPlatform], 
      hourly: dataHourly, 
      region: dataRegion 
    }
  } catch (e: any) {
    console.error(`[SYNC-DEMO] Erro ao buscar breakdowns de ${adAccountId}:`, e.message)
    return { demographics: [], hourly: [], region: [] }
  }
}

// ─── Extrair conversões — espelha exatamente a coluna "Resultados" do Gerenciador Meta ──
//
// REGRA DO META ADS MANAGER:
//   O Gerenciador mostra o "evento de otimização primário" da campanha / anúncio.
//   Para campanhas automotivas e de tráfego para WhatsApp, o Resultado é EXCLUSIVAMENTE
//   "Conversas por mensagem iniciadas" (onsite_conversion.messaging_conversation_started).
//
function parseMetaActionValue(a: any): number {
  if (!a) return 0;

  // 1. Prioridade absoluta para as janelas de atribuição oficiais configuradas no Ad Set
  // No Gerenciador de Anúncios, a coluna "Resultados" reflete a atribuição ativa (ex: 7d_click + 1d_view).
  const click7d = a["7d_click"] !== undefined && a["7d_click"] !== null ? parseInt(String(a["7d_click"]), 10) : null;
  const view1d = a["1d_view"] !== undefined && a["1d_view"] !== null ? parseInt(String(a["1d_view"]), 10) : null;
  if ((click7d !== null && !isNaN(click7d)) || (view1d !== null && !isNaN(view1d))) {
    const totalWin = (click7d && click7d > 0 ? click7d : 0) + (view1d && view1d > 0 ? view1d : 0);
    if (totalWin > 0) return totalWin;
  }

  // Outras janelas suportadas pelo Meta
  for (const win of ["1d_click", "28d_click", "default"]) {
    if (a[win] !== undefined && a[win] !== null) {
      const parsed = parseInt(String(a[win]), 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  }

  // 2. Valor agregado padrão
  if (typeof a.value === "number" && !isNaN(a.value)) return a.value;
  if (typeof a.value === "string" && a.value.trim() !== "") {
    const parsed = parseInt(a.value, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return 0;
}

function getMessagingConversationsStarted(actions: any[] = []): number {
  if (!Array.isArray(actions) || actions.length === 0) return 0;

  // A coluna "Resultados" do Meta Ads Manager para campanhas de mensagem é ESTRITAMENTE:
  // "onsite_conversion.messaging_conversation_started_7d" (ou messaging_conversation_started).
  // Se esse action_type não existir no array actions, significa que 0 conversas foram iniciadas.
  // NUNCA usar first_reply, conexões de mensagem ou cliques como fallback.
  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act.includes("messaging_conversation_started")) {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  for (const a of actions) {
    const act = String(a.action_type || "").toLowerCase();
    if (act === "whatsapp_conversation_started" || act === "messaging_conversation_started_7d") {
      const val = parseMetaActionValue(a);
      if (val > 0) return val;
    }
  }

  return 0;
}

function detectConversionCategory(
  name?: string,
  objective?: string,
  actions: any[] = [],
  results?: any[],
  optimizationGoal?: string
): string {
  const indicator = results?.[0]?.indicator ? String(results[0].indicator).toLowerCase() : "";
  const opt = String(optimizationGoal || "").toUpperCase();
  const obj = String(objective || "").toUpperCase();
  const n = String(name || "").toUpperCase();

  // 0. Mensagens têm prioridade absoluta (ações de landing_page_view existem em qualquer anúncio com link)
  if (
    !indicator.includes("purchase") &&
    !indicator.includes("profile") &&
    (indicator.includes("messaging") ||
      opt === "REPLIES" ||
      opt === "CONVERSATIONS" ||
      obj === "MESSAGES" ||
      /(^|[^A-Z])MSG([^A-Z]|$)/.test(n) ||
      n.includes("MENSAGEM") ||
      n.includes("MENSAGENS") ||
      n.includes("WHATSAPP") ||
      n.includes("WPP"))
  ) {
    return "MESSAGES";
  }

  // 1. Visitas ao Perfil do Instagram (Tráfego pro perfil IG)
  if (
    indicator.includes("profile_visit") ||
    indicator.includes("instagram_profile") ||
    opt === "PROFILE_VISIT" ||
    opt === "PROFILE_AND_PAGE_ENGAGEMENT" ||
    opt === "VISIT_INSTAGRAM_PROFILE" ||
    obj === "VISIT_INSTAGRAM_PROFILE" ||
    obj === "INSTAGRAM_PROFILE" ||
    n.includes("TRAFEGO NC") ||
    n.includes("TRÁFEGO NC") ||
    n.includes("PERFIL") ||
    n.includes("INSTA") ||
    n.includes("SEGUIDOR") ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("profile_visit") || act.includes("instagram_profile") || act.includes("profile_visit_view");
    }))
  ) {
    return "INSTAGRAM_PROFILE";
  }

  // 2. Compras no site / Pixel / E-commerce (ex: Bonne21 Pixel)
  if (
    indicator.includes("purchase") ||
    opt === "PURCHASE" ||
    opt === "PURCHASES" ||
    obj === "OUTCOME_SALES" ||
    obj === "CONVERSIONS" ||
    obj === "CATALOG_SALES" ||
    n.includes("COMPRA") ||
    n.includes("VENDA") ||
    n.includes("PURCHASE") ||
    n.includes("ECOMMERCE") ||
    (actions && actions.some((a: any) => String(a.action_type || "").toLowerCase().includes("purchase")))
  ) {
    return "PURCHASES";
  }

  // 3. Visualizações da Página de Destino (Landing Page / Site / Cardápio / Grupo de vendedores)
  if (
    indicator.includes("landing_page_view") ||
    indicator.includes("omni_landing_page_view") ||
    opt === "LANDING_PAGE_VIEWS" ||
    obj === "LANDING_PAGE_VIEWS" ||
    n.includes("GRUPO") ||
    n.includes("VENDEDORES") ||
    n.includes("CARDAPIO") ||
    n.includes("CARDÁPIO") ||
    n.includes("DELIVERY") ||
    n.includes("LP") ||
    n.includes("LANDING") ||
    n.includes("SITE") ||
    n.includes("DESTINO") ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("landing_page_view") || act.includes("omni_landing_page_view");
    }))
  ) {
    return "LANDING_PAGE_VIEWS";
  }

  // 4. Cadastros / Leads / Formulários
  if (
    indicator.includes("lead") ||
    indicator.includes("registration") ||
    opt === "LEAD" ||
    opt === "LEADS" ||
    opt === "LEAD_GENERATION" ||
    opt === "QUALITY_LEAD" ||
    obj === "OUTCOME_LEADS" ||
    obj === "LEAD_GENERATION" ||
    n.includes("LEAD") ||
    n.includes("CADASTRO") ||
    n.includes("FORMULARIO") ||
    n.includes("FORMULÁRIO") ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("lead") || act.includes("complete_registration");
    }))
  ) {
    return "LEADS";
  }

  // 5. Mensagens (WhatsApp / Messenger / Direct — Falcão, 13Car, etc.)
  if (
    indicator.includes("messaging_conversation_started") ||
    indicator.includes("messaging") ||
    indicator.includes("contact") ||
    opt === "REPLIES" ||
    opt === "CONVERSATIONS" ||
    obj === "MESSAGES" ||
    obj === "OUTCOME_ENGAGEMENT" || // Campanhas de WhatsApp utilizam OUTCOME_ENGAGEMENT
    n.includes("MSG") ||
    n.includes("MENSAGEM") ||
    n.includes("MENSAGENS") ||
    n.includes("WPP") ||
    n.includes("WHATSAPP") ||
    n.includes("DIRECT") ||
    n.includes("CONVERSA") ||
    n.includes("CONVERSAS") ||
    n.includes("ZAP") ||
    n.includes("VICTOR") ||
    n.includes("YURI") ||
    n.includes("TAYNA") ||
    n.includes("RUTH") ||
    n.includes("6720") ||
    n.includes("7243") ||
    (actions && actions.some((a: any) => {
      const act = String(a.action_type || "").toLowerCase();
      return act.includes("messaging") || act.includes("whatsapp") || act.includes("contact");
    }))
  ) {
    return "MESSAGES";
  }

  // 6. Vídeo / ThruPlay
  if (
    indicator.includes("thruplay") ||
    indicator.includes("video_view") ||
    opt === "THRUPLAY" ||
    opt === "VIDEO_VIEWS" ||
    obj === "VIDEO_VIEWS" ||
    n.includes("VIDEO") ||
    n.includes("VÍDEO") ||
    n.includes("THRUPLAY")
  ) {
    return "VIDEO_VIEWS";
  }

  // 7. Alcance / Reconhecimento
  if (
    indicator === "reach" ||
    opt === "REACH" ||
    obj === "REACH" ||
    obj === "OUTCOME_AWARENESS" ||
    obj === "AWARENESS" ||
    n.includes("ALCANCE")
  ) {
    return "REACH";
  }

  // 8. Engajamento
  if (
    indicator.includes("post_engagement") ||
    opt === "POST_ENGAGEMENT" ||
    obj === "POST_ENGAGEMENT" ||
    n.includes("CURTIDAS") ||
    n.includes("POST")
  ) {
    return "ENGAGEMENT";
  }

  // 9. Se for OUTCOME_TRAFFIC sem outro objetivo:
  if (obj === "OUTCOME_TRAFFIC" || opt === "LINK_CLICKS") {
    if (n.includes("INSTA") || n.includes("PERFIL") || n.includes("NC")) {
      return "INSTAGRAM_PROFILE";
    }
    return "LANDING_PAGE_VIEWS";
  }

  if (obj === "OUTCOME_ENGAGEMENT") {
    return "MESSAGES";
  }

  return "MESSAGES";
}

function extractConversions(
  actions: any[] = [],
  objective?: string,
  reach: number = 0,
  campaignName?: string,
  results?: any[],
  optimizationGoal?: string
): number {
  // 1. Prioridade máxima: valor nativo do array results da Meta Graph API
  if (Array.isArray(results) && results.length > 0) {
    const valStr = results[0]?.values?.[0]?.value;
    if (valStr !== undefined && valStr !== null && !isNaN(parseFloat(valStr))) {
      return parseFloat(valStr);
    }
    // Se a Meta retornou o indicator mas sem values (ex: 0 conversões registradas):
    if (results[0]?.indicator) {
      return 0;
    }
  }

  const category = detectConversionCategory(campaignName, objective, actions, results, optimizationGoal);

  if (category === "REACH") {
    return reach;
  }

  if (!Array.isArray(actions) || actions.length === 0) return 0;

  const getVal = (type: string): number => {
    const a = actions.find((x: any) => String(x.action_type || "").toLowerCase() === type.toLowerCase());
    return parseMetaActionValue(a);
  };

  switch (category) {
    case "MESSAGES": {
      return getMessagingConversationsStarted(actions);
    }

    case "INSTAGRAM_PROFILE": {
      const visits = Math.max(
        getVal("profile_visit"),
        getVal("instagram_profile_visit"),
        getVal("instagram_profile_view"),
        getVal("visit_instagram_profile"),
        getVal("onsite_conversion.instagram_profile_visit")
      );
      if (visits > 0) return visits;

      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.includes("profile") && (act.includes("visit") || act.includes("view"))) {
          const val = parseMetaActionValue(a);
          if (val > 0) return val;
        }
      }

      const lpv = Math.max(getVal("landing_page_view"), getVal("onsite_conversion.landing_page_view"));
      if (lpv > 0) return lpv;

      return 0;
    }

    case "LANDING_PAGE_VIEWS": {
      return Math.max(
        getVal("landing_page_view"),
        getVal("onsite_conversion.landing_page_view")
      );
    }

    case "PURCHASES": {
      const onsite = Math.max(getVal("onsite_conversion.purchase"), getVal("purchase"));
      const offsite = Math.max(
        getVal("offsite_conversion.fb_pixel_purchase"),
        getVal("offsite_conversion.fb_pixel_custom.PURCHASE")
      );
      const omni = getVal("omni_purchase");
      let customPurchase = 0;
      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.startsWith("offsite_conversion.custom.") && act.includes("purchase")) {
          customPurchase += parseMetaActionValue(a);
        }
      }
      return Math.max(onsite, offsite, omni, customPurchase, onsite + offsite);
    }

    case "LEADS": {
      const onsite = Math.max(getVal("onsite_conversion.lead"), getVal("leadgen_grouped"));
      const offsite = Math.max(
        getVal("offsite_conversion.fb_pixel_lead"),
        getVal("complete_registration"),
        getVal("offsite_conversion.fb_pixel_complete_registration"),
        getVal("offsite_conversion.fb_pixel_custom.LEAD")
      );
      let customLead = 0;
      for (const a of actions) {
        const act = String(a.action_type || "").toLowerCase();
        if (act.startsWith("offsite_conversion.custom.") && act.includes("lead")) {
          customLead += parseMetaActionValue(a);
        }
      }
      return Math.max(getVal("lead"), onsite + offsite, customLead);
    }

    case "VIDEO_VIEWS": {
      return Math.max(
        getVal("thruplay"),
        getVal("video_thruplay_watched_actions"),
        getVal("video_view")
      );
    }

    case "ENGAGEMENT": {
      return Math.max(
        getVal("post_engagement"),
        getVal("page_engagement"),
        getVal("post_reaction")
      );
    }

    case "REACH": {
      return reach;
    }

    case "LINK_CLICKS": {
      return getVal("link_click");
    }

    default: {
      return 0; // NUNCA retornar link_click por fallback!
    }
  }
}

// ─── Extrair métrica de vídeo (p25/p50/p75/p95) de actions ou campo dedicado ─
function extractVideoMetric(row: any, fieldName: string): number {
  // Meta retorna video_pXX_watched_actions como array de { action_type, value }
  const arr = row[fieldName];
  if (Array.isArray(arr) && arr.length > 0) {
    return parseInt(arr[0]?.value || "0") || 0;
  }
  return 0;
}

// ─── Buscar placement breakdown (Feed vs Stories vs Reels vs Marketplace) ────
async function fetchPlacementBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  try {
    return await metaGetPaginated(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "publisher_platform,placement",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro placement breakdown de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar breakdown por dispositivo (mobile/desktop) ───────────────────────
async function fetchDeviceBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  try {
    return await metaGetPaginated(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "publisher_platform,impression_device",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
  } catch (e: any) {
    console.error(`[SYNC] Erro device breakdown de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Extrair cliques — espelha "Cliques no link" do Gerenciador Meta ─────────
//
// O campo inline_link_clicks usa janela fixa de 1 dia.
// O Gerenciador usa action_type "link_click" com a janela de atribuição da campanha
// (padrão: 7 dias clique + 1 dia visualização). A diferença pode ser 10–30%.
// Usamos link_click da array actions como primário, com fallback para inline_link_clicks.
function extractClicks(actions: any[] = [], inlineLinkClicks: string | number = 0): number {
  const linkClickAction = actions?.find((a: any) => a.action_type === "link_click");
  if (linkClickAction?.value) return parseInt(linkClickAction.value) || 0;
  return parseInt(String(inlineLinkClicks) || "0") || 0;
}

// ─── Sync principal ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const syncId = crypto.randomUUID()
  let syncHistoryId: string | null = null
  console.log(`[SYNC ${syncId}] Iniciando sincronização NC Performance...`)

  try {
    const { user: authUser } = await requireAuth(req);
    // 1. Ler parâmetros
    // Padrão: últimos 2 dias (hoje + ontem) no fuso de Brasília
    const brtFormatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const brtParts = brtFormatter.formatToParts(new Date())
    const brtDay = brtParts.find(p => p.type === 'day')?.value
    const brtMonth = brtParts.find(p => p.type === 'month')?.value
    const brtYear = brtParts.find(p => p.type === 'year')?.value
    const todayStr = `${brtYear}-${brtMonth}-${brtDay}`
    const yesterdayDate = new Date(new Date().getTime() - 3 * 60 * 60 * 1000 - 24 * 60 * 60 * 1000)
    const yParts = brtFormatter.formatToParts(yesterdayDate)
    const yesterdayStr = `${yParts.find(p => p.type === 'year')?.value}-${yParts.find(p => p.type === 'month')?.value}-${yParts.find(p => p.type === 'day')?.value}`
    
    let timeParams: Record<string, string> = {
      time_range: JSON.stringify({ since: yesterdayStr, until: todayStr })
    }
    let targetAccountId: string | null = null;
    let triggeredBy = "auto"
    let action = "sync"
    let togglePayload: { external_id: string; status: string } | null = null
    let budgetPayload: { external_id: string; budget: number } | null = null

    try {
      const body = await req.json()
      if (body.action === "toggle-status") {
        action = "toggle-status"
        togglePayload = {
          external_id: body.external_id,
          status: body.status
        }
      }
      if (body.action === "update-budget") {
        action = "update-budget"
        budgetPayload = {
          external_id: body.external_id,
          budget: body.budget
        }
      }
      // Se veio um range explícito do frontend (seletor de datas), respeitar
      if (body.time_range) {
        timeParams = { time_range: JSON.stringify(body.time_range) }
      } else if (body.date_preset) {
        timeParams = { date_preset: body.date_preset }
      }
      if (body.account_id && body.account_id !== "all") {
        targetAccountId = body.account_id;
      }
      if (body.triggered_by) triggeredBy = body.triggered_by
      if (body.action === "audit") action = "audit"
    } catch (_) {
      console.log(`[SYNC ${syncId}] Body vazio — usando janela padrão D0+D-1 (${yesterdayStr} → ${todayStr})`)
    }

    // 2. Buscar TODAS as configurações com token — a agência pode ter múltiplos
    // tokens (BMs diferentes), cada um enxergando um conjunto distinto de contas.
    // Usar apenas um token deixava contas dos outros BMs permanentemente sem sync.
    const { data: allConfigs, error: configErr } = await supabase
      .from("meta_ads_configs")
      .select("access_token, user_id")
      .not("access_token", "is", null)
      .order("created_at", { ascending: false });

    if (configErr || !allConfigs || allConfigs.length === 0) {
      throw new Error("Meta Token não configurado. Acesse Configurações → Integrações.")
    }

    // Token do usuário logado tem prioridade (primário para toggle/budget)
    const orderedConfigs = authUser?.id
      ? [...allConfigs].sort((a, b) => (b.user_id === authUser.id ? 1 : 0) - (a.user_id === authUser.id ? 1 : 0))
      : allConfigs;

    const token = orderedConfigs[0].access_token
    const userId = orderedConfigs[0].user_id

    // ─── MODO AUDITORIA — retorna o que o Meta está enviando sem salvar nada ─────
    // Útil para diagnosticar divergências: mostra todos os action_types recebidos por
    // campanha e o que o extractConversions escolheria — comparar com Meta Ads Manager
    if (action === "audit") {
      console.log(`[AUDIT ${syncId}] Iniciando auditoria de action_types...`)
      let auditEntries: { acc: any; token: string }[] = []
      const auditSeen = new Set<string>()
      for (const cfg of orderedConfigs) {
        try {
          const accounts = await fetchAdAccounts(cfg.access_token)
          for (const acc of accounts) {
            if (auditSeen.has(acc.id)) continue
            auditSeen.add(acc.id)
            auditEntries.push({ acc, token: cfg.access_token })
          }
        } catch (e: any) {
          console.error(`[AUDIT ${syncId}] Token falhou ao listar contas:`, e.message)
        }
      }
      if (targetAccountId) auditEntries = auditEntries.filter(e => e.acc.id === targetAccountId)

      const auditResult: any[] = []
      for (const { acc, token: accToken } of auditEntries) {
        const campaignsData = await fetchCampaignsWithBudgets(acc.id, accToken)
        const objectiveMap = new Map(campaignsData.map((c: any) => [c.id, c.objective as string | undefined]))
        const insights = await fetchCampaignInsights(acc.id, accToken, timeParams)

        for (const row of insights) {
          const actions: any[] = row.actions || []
          const objective = objectiveMap.get(row.campaign_id)
          const reach = parseInt(row.reach) || 0
          const pickedConversions = extractConversions(actions, objective, reach, row.campaign_name)
          auditResult.push({
            account: acc.name,
            account_id: acc.id,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            objective: objective ?? null,
            date: row.date_start,
            spend: parseFloat(row.spend) || 0,
            impressions: parseInt(row.impressions) || 0,
            app_conversions: pickedConversions,
            all_actions: actions.map((a: any) => ({
              action_type: a.action_type,
              value: a.value,
              "7d_click": a["7d_click"],
              "1d_view": a["1d_view"],
            })),
          })
        }
      }

      return new Response(JSON.stringify({ audit: auditResult, time_range: timeParams }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Se for ação de toggle de status, executa diretamente no Facebook Ads e encerra!
    if (action === "toggle-status" && togglePayload) {
      console.log(`[TOGGLE ${syncId}] Alterando status do objeto ${togglePayload.external_id} para ${togglePayload.status} no Meta...`)
      
      const res = await fetch(`${META_API_BASE}/${togglePayload.external_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: togglePayload.status,
          access_token: token
        })
      })
      
      const resData = await res.json()
      if (resData.error) {
        console.error(`[TOGGLE ${syncId}] Erro na API do Meta:`, resData.error)
        throw new Error(`Erro na API do Meta: ${resData.error.message}`)
      }
      
      console.log(`[TOGGLE ${syncId}] Status alterado no Meta com sucesso!`)
      return new Response(JSON.stringify({
        success: true,
        external_id: togglePayload.external_id,
        status: togglePayload.status
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Se for ação de atualizar orçamento, executa diretamente no Facebook Ads e encerra!
    if (action === "update-budget" && budgetPayload) {
      console.log(`[BUDGET ${syncId}] Alterando orçamento do objeto ${budgetPayload.external_id} para R$ ${budgetPayload.budget} no Meta...`)
      
      const res = await fetch(`${META_API_BASE}/${budgetPayload.external_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          daily_budget: Math.round(budgetPayload.budget * 100),
          access_token: token
        })
      })
      
      const resData = await res.json()
      if (resData.error) {
        console.error(`[BUDGET ${syncId}] Erro na API do Meta:`, resData.error)
        throw new Error(`Erro na API do Meta: ${resData.error.message}`)
      }
      
      console.log(`[BUDGET ${syncId}] Orçamento alterado no Meta com sucesso!`)
      return new Response(JSON.stringify({
        success: true,
        external_id: budgetPayload.external_id,
        daily_budget: budgetPayload.budget
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 3. Registrar início do sync no histórico
    const { data: syncRecord } = await supabase.from("sync_history").insert({
      user_id: userId,
      status: "running",
      triggered_by: triggeredBy
    }).select("id").maybeSingle()
    
    syncHistoryId = syncRecord?.id || null

    // 4. Montar lista de contas autorizadas pelo token atual diretamente da Meta API
    const configByUser = new Map(orderedConfigs.map((c: any) => [c.user_id, c.access_token]))
    const accountEntries: { acc: any; token: string; userId: string }[] = []
    const seenAccounts = new Set<string>()

    console.log(`[SYNC ${syncId}] Buscando lista oficial de contas na Meta API para os tokens configurados...`)
    for (const cfg of orderedConfigs) {
      try {
        const accounts = await fetchAdAccounts(cfg.access_token)
        for (const acc of accounts) {
          if (seenAccounts.has(acc.id)) continue
          seenAccounts.add(acc.id)
          accountEntries.push({ acc, token: cfg.access_token, userId: cfg.user_id })
        }
      } catch (e: any) {
        console.error(`[SYNC ${syncId}] Token de ${cfg.user_id} falhou ao listar contas:`, e.message)
      }
    }

    // Se a listagem pela API foi bem-sucedida, PURGA do banco qualquer conta que não pertença mais ao token
    if (accountEntries.length > 0 && !targetAccountId) {
      const activeIds = new Set(accountEntries.map(e => e.acc.id))
      const { data: dbAccounts } = await supabase.from("ad_accounts").select("id")
      const obsoleteIds = (dbAccounts || []).map((a: any) => a.id).filter((id: string) => !activeIds.has(id))

      if (obsoleteIds.length > 0) {
        console.log(`[SYNC ${syncId}] 🧹 Purgando ${obsoleteIds.length} conta(s) órfã(s) que não pertencem ao token ativo: ${obsoleteIds.join(", ")}...`)
        try {
          // 1. Limpar tabelas analíticas vinculadas às contas obsoletas
          await supabase.from("meta_device_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("meta_placement_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("device_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("placement_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("hourly_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("region_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("demographic_metrics").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("campaign_period_stats").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("meta_period_stats").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("billing_snapshots").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("alert_thresholds").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("automation_rules").delete().in("ad_account_id", obsoleteIds)
          await supabase.from("client_accounts").delete().in("ad_account_id", obsoleteIds)

          // 2. Localizar e limpar campanhas, conjuntos, anúncios e métricas
          const { data: obsoleteCamps } = await supabase.from("campaigns").select("id").in("ad_account_id", obsoleteIds)
          const obsoleteCampIds = (obsoleteCamps || []).map((c: any) => c.id)

          if (obsoleteCampIds.length > 0) {
            const { data: obsoleteSets } = await supabase.from("ad_sets").select("id").in("campaign_id", obsoleteCampIds)
            const obsoleteSetIds = (obsoleteSets || []).map((s: any) => s.id)
            if (obsoleteSetIds.length > 0) {
              await supabase.from("asset_metrics").delete().in("ad_set_id", obsoleteSetIds)
              await supabase.from("ads").delete().in("ad_set_id", obsoleteSetIds)
              await supabase.from("ad_sets").delete().in("id", obsoleteSetIds)
            }
            await supabase.from("metrics").delete().in("campaign_id", obsoleteCampIds)
            await supabase.from("campaigns").delete().in("id", obsoleteCampIds)
          }

          // 3. Deletar as contas de anúncios órfãs
          const { error: delErr } = await supabase.from("ad_accounts").delete().in("id", obsoleteIds)
          if (delErr) {
            console.error(`[SYNC ${syncId}] Falha ao deletar ad_accounts:`, delErr.message)
          } else {
            console.log(`[SYNC ${syncId}] ✅ Contas obsoletas removidas com sucesso: ${obsoleteIds.join(", ")}`)
          }
        } catch (purgeErr: any) {
          console.error(`[SYNC ${syncId}] Erro ao purgar contas antigas:`, purgeErr.message)
        }
      }
    } else if (accountEntries.length === 0) {
      // Fallback de emergência (apenas se a Meta API retornar erro de rede/rate limit na listagem)
      const { data: dbAccounts } = await supabase.from("ad_accounts").select("id, name, currency, status, user_id")
      for (const a of dbAccounts || []) {
        const cfgToken = configByUser.get(a.user_id)
        if (!cfgToken || seenAccounts.has(a.id)) continue
        seenAccounts.add(a.id)
        accountEntries.push({
          acc: { id: a.id, name: a.name, currency: a.currency, account_status: a.status },
          token: cfgToken,
          userId: a.user_id
        })
      }
    }

    if (accountEntries.length === 0) {
      throw new Error("Nenhuma conta de anúncios encontrada. Verifique as permissões dos tokens.")
    }

    let entriesToSync = accountEntries
    if (targetAccountId) {
      entriesToSync = accountEntries.filter(e => e.acc.id === targetAccountId)
      if (entriesToSync.length === 0) throw new Error(`A conta ${targetAccountId} não é visível por nenhum token configurado. Reconecte em Configurações → Integrações a conta Meta que tem acesso a ela.`)
    }

    const adAccounts = entriesToSync.map(e => e.acc)

    await supabase.from("ad_accounts").upsert(
      entriesToSync.map(({ acc, userId: accUserId }) => ({
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        status: acc.account_status,
        user_id: accUserId,
        last_sync: new Date().toISOString()
      }))
    )

    console.log(`[SYNC ${syncId}] ${entriesToSync.length} contas. Sincronizando...`)

    const syncResults = []
    const apiErrors: string[] = []
    let totalMetrics = 0
    let totalDemographics = 0
    let totalCampaigns = 0

    for (const { acc, token: accToken } of entriesToSync) {
      try {
        console.log(`[SYNC] Conta: ${acc.id}`)

        // Buscar campanhas com orçamentos (sempre)
        const campaignsWithBudgets = await fetchCampaignsWithBudgets(acc.id, accToken)
        const budgetMap = new Map(campaignsWithBudgets.map((c: any) => {
          const n = (c.name || "").toUpperCase();
          const isMsg = n.includes("MSG") || n.includes("MENSAGEM") || n.includes("MENSAGENS") || n.includes("WPP") || n.includes("WHATSAPP") || n.includes("DIRECT") || n.includes("CONVERSA") || n.includes("CONVERSAS") || n.includes("ZAP");
          const effObjective = isMsg ? "MESSAGES" : (c.objective || null);
          return [c.id, {
            name: c.name || "Campanha Meta",
            status: c.status ? c.status.toLowerCase() : "active",
            daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
            lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
            budget_currency: acc.currency || 'BRL',
            objective: effObjective,
          }];
        }))
        // Mapa de objective por external_id para usar em adsets e ads
        const campaignObjectiveMap = new Map(campaignsWithBudgets.map((c: any) => {
          const n = (c.name || "").toUpperCase();
          const isMsg = n.includes("MSG") || n.includes("MENSAGEM") || n.includes("MENSAGENS") || n.includes("WPP") || n.includes("WHATSAPP") || n.includes("DIRECT") || n.includes("CONVERSA") || n.includes("CONVERSAS") || n.includes("ZAP");
          return [c.id, (isMsg ? "MESSAGES" : (c.objective as string | undefined))];
        }))

        // Buscar TUDO em paralelo — insights (range selecionado) + status completo (toda a conta)
        const [insights, breakDownsData, adsetInsights, adInsights, adsetsWithStatus, adsWithStatus, placementData, deviceData] = await Promise.all([
          fetchCampaignInsights(acc.id, accToken, timeParams),
          fetchDemographicBreakdowns(acc.id, accToken, timeParams),
          fetchAdSetInsights(acc.id, accToken, timeParams),
          fetchAdInsights(acc.id, accToken, timeParams),
          fetchAdSetsWithStatus(acc.id, accToken),
          fetchAdsWithStatus(acc.id, accToken),
          fetchPlacementBreakdowns(acc.id, accToken, timeParams),
          fetchDeviceBreakdowns(acc.id, accToken, timeParams)
        ])

        const { demographics = [], hourly = [], region = [] } = breakDownsData;

        console.log(`[SYNC] Conta ${acc.id} (${triggeredBy}): ${insights.length} insights + ${demographics.length} demo + ${hourly.length} hourly + ${region.length} region + ${adInsights.length} ads`)

        syncResults.push({
          accountId: acc.id,
          accountName: acc.name,
          accountToken: accToken,
          insights,
          demographics,
          hourly,
          region,
          placementData,
          deviceData,
          adsetInsights,
          adInsights,
          adsetsWithStatus,
          adsWithStatus,
          budgetMap,
          campaignsWithBudgets,
          campaignObjectiveMap,
        })
        
        await new Promise(r => setTimeout(r, 300))
      } catch (err: any) {
        console.error(`[SYNC] Erro na conta ${acc.id}:`, err.message)
        apiErrors.push(`Conta ${acc.id}: ${err.message}`)
      }
    }

    for (const { accountId, accountToken, insights, demographics, hourly, region, placementData = [], deviceData = [], adsetInsights, adInsights, adsetsWithStatus = [], adsWithStatus = [], budgetMap, campaignsWithBudgets = [], campaignObjectiveMap = new Map() } of syncResults) {
      // Upsert campanhas com status reais
      const campaignMap = new Map<string, any>()

      // 1. Alimentar o mapa primeiro com TODAS as campanhas retornadas na listagem real do Facebook Ads (status real)
      for (const c of campaignsWithBudgets) {
        // effective_status = LEARNING | ELIGIBLE | LIMITED | ACTIVE | PAUSED (estado real de entrega)
        const deliveryStatus = c.effective_status ? c.effective_status.toUpperCase() : null
        campaignMap.set(c.id, {
          name: c.name || "Campanha Meta",
          platform: "Meta Ads",
          status: c.status ? c.status.toLowerCase() : "active",
          delivery_status: deliveryStatus,
          objective: c.objective || null,
          external_id: c.id,
          ad_account_id: accountId,
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
          budget_currency: budgetMap.get(c.id)?.budget_currency || 'BRL'
        })
      }

      // 2. Adicionar redundâncias vindas dos insights de histórico
      for (const row of [...insights, ...demographics, ...hourly, ...region, ...placementData, ...deviceData]) {
        if (!campaignMap.has(row.campaign_id)) {
          const budget: any = budgetMap.get(row.campaign_id) || {}
          campaignMap.set(row.campaign_id, {
            name: row.campaign_name,
            platform: "Meta Ads",
            status: budget.status || "active",
            delivery_status: null,
            objective: row.objective || budget.objective || null,
            external_id: row.campaign_id,
            ad_account_id: accountId,
            daily_budget: budget.daily_budget || 0,
            lifetime_budget: budget.lifetime_budget || 0,
            budget_currency: budget.budget_currency || 'BRL'
          })
        }
      }
      for (const row of [...adsetInsights, ...adInsights]) {
        if (row.campaign_id && !campaignMap.has(row.campaign_id)) {
          const budget: any = budgetMap.get(row.campaign_id) || {}
          campaignMap.set(row.campaign_id, {
            name: `Campanha Desconhecida (${row.campaign_id})`,
            platform: "Meta Ads",
            status: budget.status || "active",
            delivery_status: null,
            objective: budget.objective || null,
            external_id: row.campaign_id,
            ad_account_id: accountId,
            daily_budget: budget.daily_budget || 0,
            lifetime_budget: budget.lifetime_budget || 0,
            budget_currency: budget.budget_currency || 'BRL'
          })
        }
      }

      let syncedCamps: any[] = []
      if (campaignMap.size > 0) {
        const { data, error: campErr } = await supabase
          .from("campaigns")
          .upsert(Array.from(campaignMap.values()), { onConflict: "external_id" })
          .select("id, external_id")

        if (campErr) {
          console.error(`[SYNC] Erro campanhas ${accountId}:`, campErr.message)
          continue
        }
        syncedCamps = data || []
      }

      totalCampaigns += syncedCamps.length
      const idMap = new Map(syncedCamps.map(c => [c.external_id, c.id]))

      // Upsert AdSets — status real via fetchAdSetsWithStatus (não mais "active" fixo)
      const adsetStatusMap = new Map(adsetsWithStatus.map((a: any) => [a.id, a.status?.toLowerCase() || "active"]))
      const adsetMap = new Map<string, any>()

      // 1. Todos os adsets da conta (inclui pausados que não aparecem em insights)
      for (const a of adsetsWithStatus) {
        const campaign_id = idMap.get(a.campaign_id)
        if (campaign_id) {
          adsetMap.set(a.id, {
            campaign_id,
            name: a.name || `Conjunto ${a.id}`,
            external_id: a.id,
            status: a.status?.toLowerCase() || "active",
            budget: a.daily_budget ? parseFloat(a.daily_budget) / 100 : (a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : 0)
          })
        }
      }
      // 2. Complementa com adsets que aparecem em insights mas não na lista de status
      for (const row of [...adsetInsights, ...adInsights]) {
        if (row.adset_id && !adsetMap.has(row.adset_id)) {
          const campaign_id = idMap.get(row.campaign_id)
          if (campaign_id) {
            adsetMap.set(row.adset_id, {
              campaign_id,
              name: row.adset_name || `Conjunto ${row.adset_id}`,
              external_id: row.adset_id,
              status: adsetStatusMap.get(row.adset_id) || "active",
              budget: 0 // Default since we don't have budget from insights
            })
          }
        }
      }
      let syncedAdsets: any[] = []
      if (adsetMap.size > 0) {
        const { data, error: adsetErr } = await supabase
          .from("ad_sets")
          .upsert(Array.from(adsetMap.values()), { onConflict: "external_id" })
          .select("id, external_id")
        if (adsetErr) console.error(`[SYNC] Erro adsets ${accountId}:`, adsetErr.message)
        syncedAdsets = data || []
      }
      
      const adsetIdMap = new Map((syncedAdsets || []).map(a => [a.external_id, a.id]))

      // Upsert Ads — status real via fetchAdsWithStatus (não mais "active" fixo)
      const adStatusMap = new Map(adsWithStatus.map((a: any) => [a.id, a.status?.toLowerCase() || "active"]))
      const adMap = new Map<string, any>()

      // 1. Todos os anúncios da conta (inclui pausados que não aparecem em insights)
      for (const a of adsWithStatus) {
        const ad_set_id = adsetIdMap.get(a.adset_id)
        const campaign_id = idMap.get(a.campaign_id)
        if (ad_set_id && campaign_id) {
          adMap.set(a.id, {
            ad_set_id,
            campaign_id,
            name: a.name || `Anúncio ${a.id}`,
            external_id: a.id,
            status: a.status?.toLowerCase() || "active"
          })
        }
      }
      // 2. Complementa com ads que aparecem em insights mas não na lista de status
      for (const row of adInsights) {
        if (row.ad_id && !adMap.has(row.ad_id)) {
          const ad_set_id = adsetIdMap.get(row.adset_id)
          const campaign_id = idMap.get(row.campaign_id)
          if (ad_set_id && campaign_id) {
            adMap.set(row.ad_id, {
              ad_set_id,
              campaign_id,
              name: row.ad_name || `Anúncio ${row.ad_id}`,
              external_id: row.ad_id,
              status: adStatusMap.get(row.ad_id) || "active"
            })
          }
        }
      }
      let syncedAds: any[] = []
      if (adMap.size > 0) {
        const { data, error: adErr } = await supabase
          .from("ads")
          .upsert(Array.from(adMap.values()), { onConflict: "external_id" })
          .select("id, external_id")
        if (adErr) console.error(`[SYNC] Erro ads ${accountId}:`, adErr.message)
        syncedAds = data || []
      }

      const adIdMap = new Map((syncedAds || []).map(a => [a.external_id, a.id]))

      // Upsert métricas diárias de campanhas
      const metricsToUpsert = insights.map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const campObj = campaignObjectiveMap.get(row.campaign_id);
        const campName = row.campaign_name || budgetMap.get(row.campaign_id)?.name;
        const resultType = detectConversionCategory(campName, campObj, row.actions, row.results, row.optimization_goal);
        const conv = extractConversions(row.actions, resultType, parseInt(row.reach) || 0, campName, row.results, row.optimization_goal);
        return {
          campaign_id,
          date: row.date_start,
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          cost: parseFloat(row.spend) || 0,
          reach: parseInt(row.reach) || 0,
          frequency: parseFloat(row.frequency || "0") || 0,
          conversions: conv,
          result_type: resultType
        }
      }).filter(Boolean)

      if (metricsToUpsert.length > 0) {
        const { error } = await supabase
          .from("metrics")
          .upsert(metricsToUpsert, { onConflict: "campaign_id,date" })
        if (error) console.error(`[SYNC] Erro métricas ${accountId}:`, error.message)
        else totalMetrics += metricsToUpsert.length
      }

      // ── Period stats (sem time_increment) → alcance e frequência reais do período ──
      // Esta query retorna um único row por campanha com o total do período completo,
      // que é exatamente o que o Gerenciador de Anúncios mostra.
      try {
        let periodStart = yesterdayStr
        let periodEnd   = todayStr
        try {
          if (timeParams.time_range) {
            const tr = JSON.parse(timeParams.time_range)
            periodStart = tr.since
            periodEnd   = tr.until
          }
        } catch (_) {}

        const [campaignPeriodRaw, adsetPeriodRaw, adPeriodRaw] = await Promise.all([
          metaGetPaginated(`/${accountId}/insights`, accountToken, {
            level: "campaign",
            fields: "campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            use_unified_attribution_setting: "true",
            limit: "500",
            ...timeParams
          }),
          metaGetPaginated(`/${accountId}/insights`, accountToken, {
            level: "adset",
            fields: "adset_id,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            use_unified_attribution_setting: "true",
            limit: "500",
            ...timeParams
          }),
          metaGetPaginated(`/${accountId}/insights`, accountToken, {
            level: "ad",
            fields: "ad_id,campaign_id,campaign_name,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,inline_link_clicks,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,date_start,date_stop",
            use_unified_attribution_setting: "true",
            limit: "500",
            ...timeParams
          })
        ])

        const periodStatsToUpsert: any[] = []

        campaignPeriodRaw.forEach((row: any) => {
          const campaign_id = idMap.get(row.campaign_id)
          if (!campaign_id) return
          const reach = parseInt(row.reach) || 0
          const impressions = parseInt(row.impressions) || 0
          const campObj = campaignObjectiveMap.get(row.campaign_id);
          const campName = row.campaign_name || budgetMap.get(row.campaign_id)?.name;
          const resultType = detectConversionCategory(campName, campObj, row.actions, row.results, row.optimization_goal);
          const conv = extractConversions(row.actions, resultType, reach, campName, row.results, row.optimization_goal);
          periodStatsToUpsert.push({
            entity_type: 'campaign',
            entity_id: campaign_id,
            ad_account_id: accountId,
            start_date:   row.date_start || periodStart,
            end_date:     row.date_stop  || periodEnd,
            reach,
            impressions,
            frequency:    reach > 0 ? impressions / reach : (parseFloat(row.frequency || "0") || 0),
            spend:        parseFloat(row.spend || "0") || 0,
            conversions:  conv,
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
            synced_at:    new Date().toISOString(),
          })
        })

        adsetPeriodRaw.forEach((row: any) => {
          const ad_set_id = adsetIdMap.get(row.adset_id)
          if (!ad_set_id) return
          const reach = parseInt(row.reach) || 0
          const impressions = parseInt(row.impressions) || 0
          const campObj = campaignObjectiveMap.get(row.campaign_id);
          const name = `${row.adset_name || ""} ${row.campaign_name || ""}`.trim();
          const conv = extractConversions(row.actions, campObj, reach, name, row.results, row.optimization_goal);
          periodStatsToUpsert.push({
            entity_type: 'adset',
            entity_id: ad_set_id,
            ad_account_id: accountId,
            start_date:   row.date_start || periodStart,
            end_date:     row.date_stop  || periodEnd,
            reach,
            impressions,
            frequency:    reach > 0 ? impressions / reach : (parseFloat(row.frequency || "0") || 0),
            spend:        parseFloat(row.spend || "0") || 0,
            conversions:  conv,
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
            synced_at:    new Date().toISOString(),
          })
        })

        adPeriodRaw.forEach((row: any) => {
          const ad_id = adIdMap.get(row.ad_id)
          if (!ad_id) return
          const reach = parseInt(row.reach) || 0
          const impressions = parseInt(row.impressions) || 0
          const campObj = campaignObjectiveMap.get(row.campaign_id);
          const name = `${row.ad_name || ""} ${row.campaign_name || ""}`.trim();
          const conv = extractConversions(row.actions, campObj, reach, name, row.results, row.optimization_goal);
          periodStatsToUpsert.push({
            entity_type: 'ad',
            entity_id: ad_id,
            ad_account_id: accountId,
            start_date:   row.date_start || periodStart,
            end_date:     row.date_stop  || periodEnd,
            reach,
            impressions,
            frequency:    reach > 0 ? impressions / reach : (parseFloat(row.frequency || "0") || 0),
            spend:        parseFloat(row.spend || "0") || 0,
            conversions:  conv,
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
            quality_ranking: row.quality_ranking || null,
            engagement_rate_ranking: row.engagement_rate_ranking || null,
            conversion_rate_ranking: row.conversion_rate_ranking || null,
            synced_at:    new Date().toISOString(),
          })
        })

        if (periodStatsToUpsert.length > 0) {
          const chunkSize = 500
          for (let i = 0; i < periodStatsToUpsert.length; i += chunkSize) {
            const chunk = periodStatsToUpsert.slice(i, i + chunkSize)
            const { error } = await supabase
              .from("meta_period_stats")
              .upsert(chunk, { onConflict: "entity_type,entity_id,start_date,end_date" })
            if (error) console.warn(`[SYNC] Period stats upsert: ${error.message}`)
          }
        }
      } catch (periodErr: any) {
        console.warn(`[SYNC] Period stats fetch failed for ${accountId}:`, periodErr.message)
      }

      // Upsert breakdowns demográficos
      const demoToUpsert = demographics.map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          age_range: row.age || "unknown",
          gender: row.gender || "unknown",
          platform: row.publisher_platform || "facebook",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0, row.campaign_name || budgetMap.get(row.campaign_id)?.name),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (demoToUpsert.length > 0) {
        const { error } = await supabase
          .from("demographic_metrics")
          .upsert(demoToUpsert, { onConflict: "campaign_id,date,age_range,gender,platform" })
        if (error) console.error(`[SYNC] Erro demographics ${accountId}:`, error.message)
        else totalDemographics += demoToUpsert.length
      }

      // Upsert hourly metrics
      const hourlyToUpsert = (hourly || []).map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          hour: row.hourly_stats_aggregated_by_advertiser_time_zone || "unknown",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0, row.campaign_name || budgetMap.get(row.campaign_id)?.name),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (hourlyToUpsert.length > 0) {
        const { error } = await supabase
          .from("hourly_metrics")
          .upsert(hourlyToUpsert, { onConflict: "campaign_id,date,hour" })
        if (error) console.error(`[SYNC] Erro hourly_metrics ${accountId}:`, error.message)
      }

      // Upsert Placement Metrics
      const placementToUpsert = (placementData || []).map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          platform: row.publisher_platform || "facebook",
          placement: row.placement || "unknown",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0, row.campaign_name || budgetMap.get(row.campaign_id)?.name),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (placementToUpsert.length > 0) {
        const { error } = await supabase
          .from("meta_placement_metrics")
          .upsert(placementToUpsert, { onConflict: "campaign_id,date,platform,placement" })
        if (error) console.error(`[SYNC] Erro placement_metrics ${accountId}:`, error.message)
      }

      // Upsert Device Metrics
      const deviceToUpsert = (deviceData || []).map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          platform: row.publisher_platform || "facebook",
          device: row.impression_device || "unknown",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0, row.campaign_name || budgetMap.get(row.campaign_id)?.name),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (deviceToUpsert.length > 0) {
        const { error } = await supabase
          .from("meta_device_metrics")
          .upsert(deviceToUpsert, { onConflict: "campaign_id,date,platform,device" })
        if (error) console.error(`[SYNC] Erro device_metrics ${accountId}:`, error.message)
      }


      // Upsert region metrics
      const regionToUpsert = (region || []).map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          region: row.region || "unknown",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0, row.campaign_name || budgetMap.get(row.campaign_id)?.name),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (regionToUpsert.length > 0) {
        const { error } = await supabase
          .from("region_metrics")
          .upsert(regionToUpsert, { onConflict: "campaign_id,date,region" })
        if (error) console.error(`[SYNC] Erro region_metrics ${accountId}:`, error.message)
      }

      // Upsert asset_metrics (AdSets e Ads)
      const assetMetricsToUpsert: any[] = []
      
      for (const row of adsetInsights) {
        const ad_set_id = adsetIdMap.get(row.adset_id)
        if (ad_set_id) {
          const campObj = campaignObjectiveMap.get(row.campaign_id);
          const name = `${row.adset_name || ""} ${row.campaign_name || budgetMap.get(row.campaign_id)?.name || ""}`.trim();
          const conv = extractConversions(row.actions, campObj, parseInt(row.reach) || 0, name, row.results, row.optimization_goal);
          assetMetricsToUpsert.push({
            ad_set_id,
            date: row.date_start,
            impressions: parseInt(row.impressions) || 0,
            clicks: extractClicks(row.actions, row.inline_link_clicks),
            cost: parseFloat(row.spend) || 0,
            conversions: conv,
            reach: parseInt(row.reach) || 0,
            frequency: parseFloat(row.frequency || "0") || 0,
            video_p25: extractVideoMetric(row, "video_p25_watched_actions"),
            video_p50: extractVideoMetric(row, "video_p50_watched_actions"),
            video_p75: extractVideoMetric(row, "video_p75_watched_actions"),
            video_p95: extractVideoMetric(row, "video_p95_watched_actions"),
            video_views: extractVideoMetric(row, "video_view")
          })
        }
      }

      for (const row of adInsights) {
        const ad_id = adIdMap.get(row.ad_id)
        if (ad_id) {
          const campObj = campaignObjectiveMap.get(row.campaign_id);
          const name = `${row.ad_name || ""} ${row.campaign_name || budgetMap.get(row.campaign_id)?.name || ""}`.trim();
          const conv = extractConversions(row.actions, campObj, parseInt(row.reach) || 0, name, row.results, row.optimization_goal);
          assetMetricsToUpsert.push({
            ad_id,
            date: row.date_start,
            impressions: parseInt(row.impressions) || 0,
            clicks: extractClicks(row.actions, row.inline_link_clicks),
            cost: parseFloat(row.spend) || 0,
            conversions: conv,
            reach: parseInt(row.reach) || 0,
            frequency: parseFloat(row.frequency || "0") || 0,
            video_p25: extractVideoMetric(row, "video_p25_watched_actions"),
            video_p50: extractVideoMetric(row, "video_p50_watched_actions"),
            video_p75: extractVideoMetric(row, "video_p75_watched_actions"),
            video_p95: extractVideoMetric(row, "video_p95_watched_actions"),
            video_views: extractVideoMetric(row, "video_view")
          })
        }
      }

      if (assetMetricsToUpsert.length > 0) {
        const chunkSize = 500
        for (let i = 0; i < assetMetricsToUpsert.length; i += chunkSize) {
          const chunk = assetMetricsToUpsert.slice(i, i + chunkSize)
          const adSetChunk = chunk.filter(c => c.ad_set_id);
          const adChunk = chunk.filter(c => c.ad_id);
          
          if (adSetChunk.length > 0) {
             const { error } = await supabase.from("asset_metrics").upsert(adSetChunk, { onConflict: "ad_set_id, date" })
             if (error) console.error(`[SYNC] Erro adset_metrics ${accountId}:`, error.message)
          }
          if (adChunk.length > 0) {
             const { error } = await supabase.from("asset_metrics").upsert(adChunk, { onConflict: "ad_id, date" })
             if (error) console.error(`[SYNC] Erro ad_metrics ${accountId}:`, error.message)
          }
        }
      }

      // Antiga notificação diária por conta foi removida daqui e transferida para o run-automations (Resumo D-1 unificado às 08h).
    }

    // Atualizar heartbeat de todas as configs cujas contas participaram do sync
    const involvedUserIds = [...new Set(entriesToSync.map(e => e.userId))]
    for (const uid of involvedUserIds) {
      await supabase.from("meta_ads_configs").update({
        is_connected: true,
        last_heartbeat_at: new Date().toISOString(),
        last_heartbeat_status: "success",
        last_heartbeat_summary: {
          accounts: adAccounts.length,
          campaigns: totalCampaigns,
          metrics: totalMetrics,
          demographic_records: totalDemographics,
          sync_id: syncId
        }
      }).eq("user_id", uid)
    }

    // Atualizar histórico de sync
    if (syncHistoryId) {
      await supabase.from("sync_history").update({
        status: apiErrors.length > 0 ? "partial_success" : "success",
        completed_at: new Date().toISOString(),
        accounts_synced: adAccounts.length,
        campaigns_synced: totalCampaigns,
        metrics_synced: totalMetrics,
        error_message: apiErrors.length > 0 ? apiErrors.join("; ") : null
      }).eq("id", syncHistoryId)
    }

    const summary = {
      sync_id: syncId,
      status: apiErrors.length > 0 ? "partial_success" : "success",
      message: `✅ Sync concluído: ${adAccounts.length} contas, ${totalCampaigns} campanhas, ${totalMetrics} métricas diárias, ${totalDemographics} demográficos.`,
      accounts: adAccounts.length,
      campaigns: totalCampaigns,
      metrics: totalMetrics,
      demographic_records: totalDemographics,
      errors: apiErrors,
      timestamp: new Date().toISOString()
    }

    console.log(`[SYNC ${syncId}] Concluído:`, JSON.stringify(summary))

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error: any) {
    console.error(`[SYNC ${syncId}] ERRO FATAL:`, error.message)
    
    if (syncHistoryId) {
      await supabase.from("sync_history").update({
        status: "error",
        completed_at: new Date().toISOString(),
        error_message: error.message
      }).eq("id", syncHistoryId)
    }

    try {
      await supabase.from("meta_ads_configs").update({
        last_heartbeat_at: new Date().toISOString(),
        last_heartbeat_status: "error",
        last_heartbeat_summary: { error: error.message, sync_id: syncId }
      }).neq("id", "00000000-0000-0000-0000-000000000000")
    } catch(_) {}

    // Return status 500 with detailed error so the frontend can display it
    return new Response(JSON.stringify({ error: error.stack || error.message, sync_id: syncId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})

