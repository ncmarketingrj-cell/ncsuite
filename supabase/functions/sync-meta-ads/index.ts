// supabase/functions/sync-meta-ads/index.ts
// Project Phoenix — Motor de Sincronização com Breakdowns Demográficos

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

// ─── Meta API Helper ─────────────────────────────────────────────────────────
async function metaGet(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`${META_API_BASE}${path}`)
  url.searchParams.set("access_token", token)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString())
  const data = await res.json()
  if (data.error) throw new Error(`Meta API [${path}]: ${data.error.message}`)
  return data
}

// ─── Buscar todas as contas vinculadas ao token ───────────────────────────────
async function fetchAdAccounts(token: string) {
  const data = await metaGet("/me/adaccounts", token, {
    fields: "name,currency,account_status,id,timezone_name"
  })
  return data.data || []
}

// ─── Buscar insights diários de campanha ─────────────────────────────────────
async function fetchCampaignInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    const data = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,spend,actions,reach,impressions,inline_link_clicks,date_start,date_stop",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
    return data.data || []
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar insights de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar insights diários de adsets ─────────────────────────────────────
async function fetchAdSetInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    const data = await metaGet(`/${adAccountId}/insights`, token, {
      level: "adset",
      fields: "adset_id,adset_name,campaign_id,spend,actions,reach,impressions,inline_link_clicks,date_start",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
    return data.data || []
  } catch (e: any) {
    console.error(`[SYNC] Erro adsets de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar insights diários de ads ─────────────────────────────────────
async function fetchAdInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    const data = await metaGet(`/${adAccountId}/insights`, token, {
      level: "ad",
      fields: "ad_id,ad_name,adset_id,campaign_id,spend,actions,reach,impressions,inline_link_clicks,date_start",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
    return data.data || []
  } catch (e: any) {
    console.error(`[SYNC] Erro ads de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar breakdowns demográficos (NOVO — Project Phoenix) ─────────────────
async function fetchDemographicBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<any[]> {
  try {
    const dataAgeGender = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "age,gender",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })
    
    // Meta API não permite combinar age/gender com platform na mesma query com time_increment 1 em alguns casos.
    const dataPlatform = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "publisher_platform",
      time_increment: "1",
      limit: "500",
      ...timeParams
    })

    const result = [...(dataAgeGender.data || []), ...(dataPlatform.data || [])]
    return result
  } catch (e: any) {
    console.error(`[SYNC-DEMO] Erro ao buscar breakdowns de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Extrair conversões (Resultados) do array de actions ───────────────────────
function extractConversions(actions: any[] = []): number {
  const priorityTypes = [
    "purchase", "lead", "complete_registration", "submit_application", "conversion",
    "messaging_conversation_started_7d", "onsite_conversion.messaging_conversation_started_7d",
    "landing_page_view", "link_click",
    "video_view", "thruplay", "video_view_thruplay",
    "post_engagement", "page_engagement"
  ];
  
  for (const type of priorityTypes) {
    const action = actions.find(a => a.action_type === type || a.action_type?.includes(type));
    if (action) return parseInt(action.value || "0") || 0;
  }
  return 0;
}

// ─── Sync principal ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const syncId = crypto.randomUUID()
  console.log(`[SYNC ${syncId}] Iniciando sincronização Project Phoenix...`)

  try {
    // 1. Tentar ler parâmetros de data no corpo da requisição (POST)
    let timeParams: Record<string, string> = { date_preset: "maximum" } // Default to maximum to include today
    let targetAccountId: string | null = null;
    try {
      const body = await req.json()
      if (body.time_range) {
        timeParams = { time_range: JSON.stringify(body.time_range) }
        console.log(`[SYNC ${syncId}] Sincronizando período personalizado: ${JSON.stringify(body.time_range)}`)
      } else if (body.date_preset) {
        timeParams = { date_preset: body.date_preset }
        console.log(`[SYNC ${syncId}] Sincronizando com preset: ${body.date_preset}`)
      }
      if (body.account_id && body.account_id !== "all") {
        targetAccountId = body.account_id;
        console.log(`[SYNC ${syncId}] Filtrando para conta especifica: ${targetAccountId}`)
      }
    } catch (_) {
      console.log(`[SYNC ${syncId}] Nenhum body enviado. Usando preset padrão: maximum`)
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

    // 3. Buscar e salvar contas
    console.log(`[SYNC ${syncId}] Buscando contas vinculadas...`)
    const adAccounts = await fetchAdAccounts(token)
    
    if (adAccounts.length === 0) {
      throw new Error("Nenhuma conta de anúncios encontrada. Verifique as permissões do token.")
    }

    // Filtra se for para sync específico
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

    console.log(`[SYNC ${syncId}] ${adAccounts.length} contas encontradas. Sincronizando insights...`)

    // 4. Sincronizar insights + breakdowns de forma SEQUENCIAL para evitar RATE LIMIT da Meta API
    const syncResults = []
    let apiErrors = []

    for (const acc of adAccounts) {
      try {
        console.log(`[SYNC] Buscando dados da conta: ${acc.id} com parametros ${JSON.stringify(timeParams)}`)
        const [insights, demographics, adsetInsights, adInsights] = await Promise.all([
          fetchCampaignInsights(acc.id, token, timeParams),
          fetchDemographicBreakdowns(acc.id, token, timeParams),
          fetchAdSetInsights(acc.id, token, timeParams),
          fetchAdInsights(acc.id, token, timeParams)
        ])
        syncResults.push({ accountId: acc.id, insights, demographics, adsetInsights, adInsights })
        
        // Sleep para evitar rate limit
        await new Promise(r => setTimeout(r, 500))
      } catch (err: any) {
        console.error(`[SYNC] Erro na conta ${acc.id}:`, err.message)
        apiErrors.push(`Conta ${acc.id}: ${err.message}`)
      }
    }

    let totalMetrics = 0
    let totalDemographics = 0
    let totalCampaigns = 0

    for (const { accountId, insights, demographics, adsetInsights, adInsights } of syncResults) {
      if (insights.length === 0 && demographics.length === 0 && adsetInsights.length === 0 && adInsights.length === 0) continue

      // ── 3a. Upsert campanhas (deduplicado por external_id) ──────────────────
      const campaignMap = new Map<string, any>()
      for (const row of [...insights, ...demographics]) {
        if (!campaignMap.has(row.campaign_id)) {
          campaignMap.set(row.campaign_id, {
            name: row.campaign_name,
            platform: "Meta Ads",
            status: "active",
            external_id: row.campaign_id,
            ad_account_id: accountId
          })
        }
      }
      for (const row of [...adsetInsights, ...adInsights]) {
        if (row.campaign_id && !campaignMap.has(row.campaign_id)) {
          campaignMap.set(row.campaign_id, {
            name: `Campanha Desconhecida (${row.campaign_id})`,
            platform: "Meta Ads",
            status: "active",
            external_id: row.campaign_id,
            ad_account_id: accountId
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
          console.error(`[SYNC] Erro ao upsert campanhas de ${accountId}:`, campErr.message)
          continue
        }
        syncedCamps = data || []
      }

      totalCampaigns += syncedCamps.length
      const idMap = new Map(syncedCamps.map(c => [c.external_id, c.id]))

      // ── 3a2. Upsert AdSets ────────────────────────────────────────────────────
      const adsetMap = new Map<string, any>()
      for (const row of [...adsetInsights, ...adInsights]) {
        if (row.adset_id && !adsetMap.has(row.adset_id)) {
          const campaign_id = idMap.get(row.campaign_id)
          if (campaign_id) {
            adsetMap.set(row.adset_id, {
              campaign_id,
              name: row.adset_name || `Conjunto ${row.adset_id}`,
              external_id: row.adset_id,
              status: "active"
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

      // ── 3a3. Upsert Ads ───────────────────────────────────────────────────────
      const adMap = new Map<string, any>()
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
              status: "active"
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

      // ── 3b. Upsert métricas diárias (Campanhas) ─────────────────────────────
      const metricsToUpsert = insights.map(row => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        return {
          campaign_id,
          date: row.date_start,
          impressions: parseInt(row.impressions) || 0,
          clicks: parseInt(row.inline_link_clicks || "0") || 0,
          cost: parseFloat(row.spend) || 0,
          reach: parseInt(row.reach) || 0,
          conversions: extractConversions(row.actions),
          result_type: row.objective
        }
      }).filter(Boolean)

      if (metricsToUpsert.length > 0) {
        const { error } = await supabase
          .from("metrics")
          .upsert(metricsToUpsert, { onConflict: "campaign_id,date" })
        if (error) console.error(`[SYNC] Erro métricas ${accountId}:`, error.message)
        else totalMetrics += metricsToUpsert.length
      }

      // ── 3c. Upsert breakdowns demográficos (Project Phoenix Core) ───────────
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
          clicks: parseInt(row.inline_link_clicks || "0") || 0,
          spend: parseFloat(row.spend) || 0,
          conversions: extractConversions(row.actions),
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

      // ── 3d. Upsert asset_metrics (AdSets e Ads) ─────────────────────────────
      const assetMetricsToUpsert = []
      
      for (const row of adsetInsights) {
        const ad_set_id = adsetIdMap.get(row.adset_id)
        if (ad_set_id) {
          assetMetricsToUpsert.push({
            ad_set_id,
            date: row.date_start,
            impressions: parseInt(row.impressions) || 0,
            clicks: parseInt(row.inline_link_clicks || "0") || 0,
            cost: parseFloat(row.spend) || 0,
            conversions: extractConversions(row.actions),
            reach: parseInt(row.reach) || 0
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
            clicks: parseInt(row.inline_link_clicks || "0") || 0,
            cost: parseFloat(row.spend) || 0,
            conversions: extractConversions(row.actions),
            reach: parseInt(row.reach) || 0
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
    }

    // 4. Atualizar timestamp do último heartbeat na config
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

    // 4b. Gerar notificação diária da Victoria AI para cada conta sincronizada
    console.log(`[SYNC ${syncId}] Gerando notificações da Victoria para cada conta...`)
    for (const acc of adAccounts) {
      try {
        // Encontrar os insights específicos desta conta
        const accInsights = syncResults.find(r => r.accountId === acc.id)?.insights || []
        if (accInsights.length === 0) continue

        // Agrupar spend e reach por data e pegar a data mais recente com spend > 0
        const dateGroups: Record<string, { spend: number, reach: number }> = {}
        for (const row of accInsights) {
          const d = row.date_start // "YYYY-MM-DD"
          if (!dateGroups[d]) dateGroups[d] = { spend: 0, reach: 0 }
          dateGroups[d].spend += parseFloat(row.spend || "0")
          dateGroups[d].reach += parseInt(row.reach || "0")
        }

        // Ordenar as datas para pegar a mais recente
        const sortedDates = Object.keys(dateGroups).sort((a, b) => b.localeCompare(a))
        const recentDate = sortedDates[0] // A data mais recente sincronizada

        if (recentDate) {
          const stats = dateGroups[recentDate]
          if (stats.spend > 0) {
            // Formatar a data para "DD de MÊS" (ex: "18 de mai")
            const parts = recentDate.split("-") // ["2026", "05", "18"]
            const day = parseInt(parts[2])
            const monthIdx = parseInt(parts[1]) - 1
            const monthsPT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
            const monthPT = monthsPT[monthIdx] || "mai"

            const formattedSpend = stats.spend.toFixed(2)
            const formattedReach = stats.reach.toLocaleString("en-US")

            const alertTitle = `📊 Resumo Diário Victoria: ${acc.name}`
            const alertMsg = `Resumo diário: você gastou R$${formattedSpend} em ${day} de ${monthPT} e alcançou ${formattedReach} pessoas.`

            // Link da notificação clicável, passando o accountId e a data da sincronização!
            const targetLink = `/campanhas?accountId=${acc.id}&date=${recentDate}`

            console.log(`[SYNC] Notificação para ${acc.name}: "${alertMsg}" | Link: ${targetLink}`)

            await supabase.from("notifications").insert({
              user_id: userId,
              title: alertTitle,
              message: alertMsg,
              type: "success",
              link: targetLink,
              metadata: {
                account_id: acc.id,
                date: recentDate,
                spend: stats.spend,
                reach: stats.reach
              }
            })
          }
        }
      } catch (err: any) {
        console.error(`[SYNC-NOTIF] Falha ao gerar notificação para a conta ${acc.id}:`, err.message)
      }
    }


    const summary = {
      sync_id: syncId,
      status: apiErrors.length > 0 ? "partial_success" : "success",
      message: `✅ Sync concluído: ${adAccounts.length} contas processadas. ${totalCampaigns} campanhas, ${totalMetrics} métricas diárias, ${totalDemographics} registros demográficos. ${apiErrors.length > 0 ? `Avisos: ${apiErrors.join('; ')}` : ''}`,
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
    
    // Registrar falha na config
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
