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

async function requireAuth(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  return null;
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
      fields: "campaign_id,campaign_name,objective,spend,actions,reach,impressions,frequency,inline_link_clicks,date_start,date_stop",
      time_increment: "1",
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
      fields: "adset_id,adset_name,campaign_id,spend,actions,reach,impressions,frequency,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start",
      time_increment: "1",
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
      fields: "ad_id,ad_name,adset_id,campaign_id,spend,actions,reach,impressions,frequency,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start",
      time_increment: "1",
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
//   O Gerenciador mostra o "evento de otimização primário" da campanha.
//
function extractConversions(actions: any[] = [], objective?: string, reach: number = 0): number {
  // Se for campanha de Alcance/Reconhecimento, o Gerenciador Meta exibe o próprio Alcance como "Resultado"
  if (objective === "OUTCOME_AWARENESS" || objective === "AWARENESS") {
    return reach;
  }

  if (!Array.isArray(actions) || actions.length === 0) return 0;

  const getVal = (type: string): number => {
    const a = actions.find((x: any) => x.action_type === type);
    return a?.value ? (parseInt(a.value) || 0) : 0;
  };

  // Log diagnóstico — visível em Supabase Dashboard → Logs → Edge Functions
  const available = actions.map((a: any) => `${a.action_type}:${a.value}`).join(" | ");
  console.log(`[CONV] obj=${objective ?? "none"} | ${available}`);

  // Tratar Leads de forma agregada para somar múltiplos canais (Onsite + Offsite)
  if (objective === "OUTCOME_LEADS" || objective === "LEAD_GENERATION") {
    const onsite = Math.max(getVal("onsite_conversion.lead"), getVal("leadgen_grouped"));
    const offsiteStandard = getVal("offsite_conversion.fb_pixel_lead") || 
                            getVal("complete_registration") || 
                            getVal("offsite_conversion.fb_pixel_complete_registration");
    
    let offsiteCustom = getVal("offsite_conversion.fb_pixel_custom.LEAD");
    for (const act of actions) {
      if (act.action_type.startsWith("offsite_conversion.custom.")) {
        offsiteCustom += parseInt(act.value) || 0;
      }
    }

    const offsite = Math.max(offsiteStandard, offsiteCustom);
    return Math.max(getVal("lead"), onsite + offsite);
  }

  // Tratar Vendas/Compras de forma agregada (Onsite Shop + Offsite Pixel)
  if (objective === "CONVERSIONS" || objective === "OUTCOME_SALES") {
    const onsite = getVal("onsite_conversion.purchase");
    const offsiteStandard = getVal("offsite_conversion.fb_pixel_purchase");
    let offsiteCustom = getVal("offsite_conversion.fb_pixel_custom.PURCHASE");
    
    for (const act of actions) {
      if (act.action_type.startsWith("offsite_conversion.custom.")) {
        offsiteCustom += parseInt(act.value) || 0;
      }
    }
    
    const offsite = Math.max(offsiteStandard, offsiteCustom);
    return Math.max(getVal("purchase"), onsite + offsite);
  }

  // Mapeamento objetivo → action_types primários (ordem de prioridade dentro de cada lista)
  //
  // REGRA CORRIGIDA (2026-05): Para campanhas de MENSAGEM (MESSAGES / OUTCOME_ENGAGEMENT messaging),
  // o Meta Ads Manager exibe "messaging_first_reply" ou "messaging_conversation_started_7d"
  // como resultado oficial — NÃO "total_messaging_connection" (que é superset e inclui
  // conversas recorrentes, causando números inflados vs. o Gerenciador Meta).
  const byObjective: Record<string, string[]> = {
    // Campanhas de Mensagens: Meta Ads Manager usa "first_reply" como resultado principal
    // "total_messaging_connection" fica como último fallback pois conta retornos
    "MESSAGES": [
      "onsite_conversion.messaging_conversation_started_7d",
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",
      "onsite_conversion.total_messaging_connection",
    ],
    // Instalações de App
    "APP_INSTALLS":          ["app_install", "mobile_app_install"],
    "OUTCOME_APP_PROMOTION": ["app_install", "mobile_app_install"],
    // Visualizações de Vídeo — Meta Ads Manager mostra ThruPlays como resultado principal
    "VIDEO_VIEWS":       ["thruplay", "video_view"],
    "OUTCOME_AWARENESS": ["thruplay", "video_view"],
    // Tráfego — Meta Ads Manager mostra Landing Page Views por padrão
    "LINK_CLICKS":    ["landing_page_view", "link_click"],
    "OUTCOME_TRAFFIC": ["landing_page_view", "link_click", "outbound_clicks"],
    // Engajamento puro de post (curtidas, comentários, compartilhamentos)
    // SOMENTE para campanhas cujo objetivo DE FATO é engajamento de publicação
    "POST_ENGAGEMENT": ["post_engagement", "page_engagement"],
    // OUTCOME_ENGAGEMENT cobre WhatsApp, DM, Instagram Direct — resultado = mensagens iniciadas
    // ATENÇÃO: post_engagement e page_engagement REMOVIDOS daqui.
    // Esses action_types são sempre > 0 em qualquer campanha ativa (curtidas, etc.)
    // e fariam o app exibir resultados inflados quando não há mensagens reais no dia.
    // O Meta Ads Manager para campanhas de mensagem exibe APENAS as métricas de messaging abaixo.
    "OUTCOME_ENGAGEMENT": [
      "onsite_conversion.messaging_conversation_started_7d", // ← Meta Manager defaults to "Conversas por mensagem iniciada"
      "messaging_conversation_started_7d",
      "onsite_conversion.messaging_first_reply",            
      "onsite_conversion.total_messaging_connection",       // ← superset (inclui retornos)
    ],
  };

  const priority: string[] = objective ? (byObjective[objective] ?? []) : [];

  // 1ª passagem: tipos do objetivo da campanha (match exato com Gerenciador Meta)
  for (const type of priority) {
    const v = getVal(type);
    if (v > 0) return v;
  }

  // 2ª passagem: fallback geral — apenas conversões reais, sem engajamento superficial
  // ATENÇÃO: post_engagement e page_engagement AUSENTES intencionalmente.
  // Engajamento de post (curtidas, reações) é sempre > 0 e causaria resultados
  // inflados em campanhas de mensagem, leads ou tráfego quando não há conversão real.
  const fallback = [
    "lead",
    "offsite_conversion.fb_pixel_lead",
    "offsite_conversion.fb_pixel_custom.LEAD",
    "onsite_conversion.lead",
    "leadgen_grouped",
    "purchase",
    "offsite_conversion.fb_pixel_purchase",
    "onsite_conversion.purchase",
    "offsite_conversion.fb_pixel_custom.PURCHASE",
    "complete_registration",
    "offsite_conversion.fb_pixel_complete_registration",
    "submit_application",
    "onsite_conversion.messaging_first_reply",
    "onsite_conversion.messaging_conversation_started_7d",
    "messaging_conversation_started_7d",
    "app_install",
    "mobile_app_install",
    "thruplay",
    "landing_page_view",
  ];

  for (const type of fallback) {
    if (priority.includes(type)) continue; // já tentou na 1ª passagem
    const v = getVal(type);
    if (v > 0) return v;
  }

  return 0;
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

    try {
      const body = await req.json()
      if (body.action === "toggle-status") {
        action = "toggle-status"
        togglePayload = {
          external_id: body.external_id,
          status: body.status
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

    // 2. Buscar configuração (token master)
    const { data: config, error: configErr } = await supabase
      .from("meta_ads_configs")
      .select("access_token, user_id")
      .maybeSingle()

    if (configErr || !config?.access_token) {
      throw new Error("Meta Token não configurado. Acesse Configurações → Integrações.")
    }

    const token = config.access_token
    const userId = config.user_id

    // ─── MODO AUDITORIA — retorna o que o Meta está enviando sem salvar nada ─────
    // Útil para diagnosticar divergências: mostra todos os action_types recebidos por
    // campanha e o que o extractConversions escolheria — comparar com Meta Ads Manager
    if (action === "audit") {
      console.log(`[AUDIT ${syncId}] Iniciando auditoria de action_types...`)
      let auditAccounts = await fetchAdAccounts(token)
      if (targetAccountId) auditAccounts = auditAccounts.filter((a: any) => a.id === targetAccountId)

      const auditResult: any[] = []
      for (const acc of auditAccounts) {
        const campaignsData = await fetchCampaignsWithBudgets(acc.id, token)
        const objectiveMap = new Map(campaignsData.map((c: any) => [c.id, c.objective as string | undefined]))
        const insights = await fetchCampaignInsights(acc.id, token, timeParams)

        for (const row of insights) {
          const actions: any[] = row.actions || []
          const objective = objectiveMap.get(row.campaign_id)
          const reach = parseInt(row.reach) || 0
          const pickedConversions = extractConversions(actions, objective, reach)
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

    // 3. Registrar início do sync no histórico
    const { data: syncRecord } = await supabase.from("sync_history").insert({
      user_id: userId,
      status: "running",
      triggered_by: triggeredBy
    }).select("id").maybeSingle()
    
    syncHistoryId = syncRecord?.id || null

    // 4. Buscar contas
    console.log(`[SYNC ${syncId}] Buscando contas vinculadas...`)
    let adAccounts = await fetchAdAccounts(token)
    
    if (adAccounts.length === 0) {
      throw new Error("Nenhuma conta de anúncios encontrada. Verifique as permissões do token.")
    }

    if (targetAccountId) {
      adAccounts = adAccounts.filter((a: any) => a.id === targetAccountId);
      if (adAccounts.length === 0) throw new Error("A conta selecionada não pertence a este token.");
    }

    await supabase.from("ad_accounts").upsert(
      adAccounts.map((acc: any) => ({
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        status: acc.account_status,
        user_id: userId,
        last_sync: new Date().toISOString()
      }))
    )

    console.log(`[SYNC ${syncId}] ${adAccounts.length} contas. Sincronizando...`)

    const syncResults = []
    const apiErrors: string[] = []
    let totalMetrics = 0
    let totalDemographics = 0
    let totalCampaigns = 0

    for (const acc of adAccounts) {
      try {
        console.log(`[SYNC] Conta: ${acc.id}`)
        
        // Buscar campanhas com orçamentos (sempre)
        const campaignsWithBudgets = await fetchCampaignsWithBudgets(acc.id, token)
        const budgetMap = new Map(campaignsWithBudgets.map((c: any) => [c.id, {
          name: c.name || "Campanha Meta",
          status: c.status ? c.status.toLowerCase() : "active",
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
          budget_currency: acc.currency || 'BRL',
          objective: c.objective || null,
        }]))
        // Mapa de objective por external_id para usar em adsets e ads
        const campaignObjectiveMap = new Map(campaignsWithBudgets.map((c: any) => [c.id, c.objective as string | undefined]))

        // Buscar TUDO em paralelo — insights (range selecionado) + status completo (toda a conta)
        const [insights, breakDownsData, adsetInsights, adInsights, adsetsWithStatus, adsWithStatus, placementData, deviceData] = await Promise.all([
          fetchCampaignInsights(acc.id, token, timeParams),
          fetchDemographicBreakdowns(acc.id, token, timeParams),
          fetchAdSetInsights(acc.id, token, timeParams),
          fetchAdInsights(acc.id, token, timeParams),
          fetchAdSetsWithStatus(acc.id, token),
          fetchAdsWithStatus(acc.id, token),
          fetchPlacementBreakdowns(acc.id, token, timeParams),
          fetchDeviceBreakdowns(acc.id, token, timeParams)
        ])

        const { demographics = [], hourly = [], region = [] } = breakDownsData;

        console.log(`[SYNC] Conta ${acc.id} (${triggeredBy}): ${insights.length} insights + ${demographics.length} demo + ${hourly.length} hourly + ${region.length} region + ${adInsights.length} ads`)

        syncResults.push({
          accountId: acc.id,
          accountName: acc.name,
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

    for (const { accountId, insights, demographics, hourly, region, placementData = [], deviceData = [], adsetInsights, adInsights, adsetsWithStatus = [], adsWithStatus = [], budgetMap, campaignsWithBudgets = [], campaignObjectiveMap = new Map() } of syncResults) {
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
          const budget = budgetMap.get(row.campaign_id) || {}
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
          const budget = budgetMap.get(row.campaign_id) || {}
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
        return {
          campaign_id,
          date: row.date_start,
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          cost: parseFloat(row.spend) || 0,
          reach: parseInt(row.reach) || 0,
          frequency: parseFloat(row.frequency || "0") || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
          result_type: campaignObjectiveMap.get(row.campaign_id)
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
          metaGetPaginated(`/${accountId}/insights`, token, {
            level: "campaign",
            fields: "campaign_id,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            limit: "500",
            ...timeParams
          }),
          metaGetPaginated(`/${accountId}/insights`, token, {
            level: "adset",
            fields: "adset_id,campaign_id,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
            limit: "500",
            ...timeParams
          }),
          metaGetPaginated(`/${accountId}/insights`, token, {
            level: "ad",
            fields: "ad_id,campaign_id,spend,reach,impressions,frequency,actions,inline_link_clicks,date_start,date_stop",
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
            conversions:  extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
            synced_at:    new Date().toISOString(),
          })
        })

        adsetPeriodRaw.forEach((row: any) => {
          const ad_set_id = adsetIdMap.get(row.adset_id)
          if (!ad_set_id) return
          const reach = parseInt(row.reach) || 0
          const impressions = parseInt(row.impressions) || 0
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
            conversions:  extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
            synced_at:    new Date().toISOString(),
          })
        })

        adPeriodRaw.forEach((row: any) => {
          const ad_id = adIdMap.get(row.ad_id)
          if (!ad_id) return
          const reach = parseInt(row.reach) || 0
          const impressions = parseInt(row.impressions) || 0
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
            conversions:  extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
            clicks:       extractClicks(row.actions, row.inline_link_clicks),
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
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
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
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (hourlyToUpsert.length > 0) {
        const { error } = await supabase
          .from("hourly_metrics")
          .upsert(hourlyToUpsert, { onConflict: "campaign_id,date,hour" })
        if (error) console.error(`[SYNC] Erro hourly_metrics ${accountId}:`, error.message)
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
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
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
          assetMetricsToUpsert.push({
            ad_set_id,
            date: row.date_start,
            impressions: parseInt(row.impressions) || 0,
            clicks: extractClicks(row.actions, row.inline_link_clicks),
            cost: parseFloat(row.spend) || 0,
            conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
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
          assetMetricsToUpsert.push({
            ad_id,
            date: row.date_start,
            impressions: parseInt(row.impressions) || 0,
            clicks: extractClicks(row.actions, row.inline_link_clicks),
            cost: parseFloat(row.spend) || 0,
            conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
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

      // Upsert placement_metrics (Feed vs Stories vs Reels vs Marketplace)
      const placementToUpsert = (placementData || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          placement: row.placement || "unknown",
          publisher: row.publisher_platform || "facebook",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (placementToUpsert.length > 0) {
        const { error } = await supabase
          .from("placement_metrics")
          .upsert(placementToUpsert, { onConflict: "campaign_id,date,placement,publisher" })
        if (error) console.error(`[SYNC] Erro placement_metrics ${accountId}:`, error.message)
      }

      // Upsert device_metrics (mobile vs desktop por plataforma)
      const deviceToUpsert = (deviceData || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          device: row.impression_device || "unknown",
          platform: row.publisher_platform || "unknown",
          impressions: parseInt(row.impressions) || 0,
          clicks: extractClicks(row.actions, row.inline_link_clicks),
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions, campaignObjectiveMap.get(row.campaign_id), parseInt(row.reach) || 0),
          reach: parseInt(row.reach) || 0
        }
      }).filter(Boolean)

      if (deviceToUpsert.length > 0) {
        const { error } = await supabase
          .from("device_metrics" as any)
          .upsert(deviceToUpsert, { onConflict: "campaign_id,date,device,platform" })
        if (error) console.error(`[SYNC] Erro device_metrics ${accountId}:`, error.message)
      }

      // Antiga notificação diária por conta foi removida daqui e transferida para o run-automations (Resumo D-1 unificado às 08h).
    }

    // Atualizar config com heartbeat
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
    }).eq("user_id", userId)

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

    return new Response(JSON.stringify({ error: error.message, sync_id: syncId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
