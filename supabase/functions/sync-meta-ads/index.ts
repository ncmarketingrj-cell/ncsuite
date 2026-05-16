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
async function fetchCampaignInsights(adAccountId: string, token: string): Promise<any[]> {
  try {
    const data = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,spend,actions,reach,impressions,inline_link_clicks,date_start,date_stop",
      time_increment: "1",
      date_preset: "last_30d",
      limit: "500"
    })
    return data.data || []
  } catch (e: any) {
    console.error(`[SYNC] Erro ao buscar insights de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Buscar breakdowns demográficos (NOVO — Project Phoenix) ─────────────────
async function fetchDemographicBreakdowns(adAccountId: string, token: string): Promise<any[]> {
  try {
    const dataAgeGender = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "age,gender",
      time_increment: "1",
      date_preset: "last_30d",
      limit: "500"
    })
    
    // Meta API não permite combinar age/gender com platform na mesma query com time_increment 1 em alguns casos.
    const dataPlatform = await metaGet(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,spend,actions,reach,impressions,inline_link_clicks,date_start",
      breakdowns: "publisher_platform",
      time_increment: "1",
      date_preset: "last_30d",
      limit: "500"
    })

    const result = [...(dataAgeGender.data || []), ...(dataPlatform.data || [])]
    return result
  } catch (e: any) {
    console.error(`[SYNC-DEMO] Erro ao buscar breakdowns de ${adAccountId}:`, e.message)
    return []
  }
}

// ─── Extrair conversões do array de actions ───────────────────────────────────
function extractConversions(actions: any[] = []): number {
  const conversionTypes = ["lead", "purchase", "conversion", "complete_registration", "submit_application"]
  const action = actions.find(a => conversionTypes.some(t => a.action_type?.includes(t)))
  return parseInt(action?.value || "0") || 0
}

// ─── Sync principal ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const syncId = crypto.randomUUID()
  console.log(`[SYNC ${syncId}] Iniciando sincronização Project Phoenix...`)

  try {
    // 1. Buscar configuração (token master)
    const { data: config, error: configErr } = await supabase
      .from("meta_ads_configs")
      .select("access_token, user_id")
      .maybeSingle()

    if (configErr || !config?.access_token) {
      throw new Error("Meta Token não configurado. Acesse Configurações → Integrações.")
    }

    const token = config.access_token
    const userId = config.user_id

    // 2. Buscar e salvar contas
    console.log(`[SYNC ${syncId}] Buscando contas vinculadas...`)
    const adAccounts = await fetchAdAccounts(token)
    
    if (adAccounts.length === 0) {
      throw new Error("Nenhuma conta de anúncios encontrada. Verifique as permissões do token.")
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

    // 3. Sincronizar insights + breakdowns de forma SEQUENCIAL para evitar RATE LIMIT da Meta API
    const syncResults = []
    let apiErrors = []

    for (const acc of adAccounts) {
      try {
        console.log(`[SYNC] Buscando dados da conta: ${acc.id}`)
        const insights = await fetchCampaignInsights(acc.id, token)
        const demographics = await fetchDemographicBreakdowns(acc.id, token)
        syncResults.push({ accountId: acc.id, insights, demographics })
        
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

    for (const { accountId, insights, demographics } of syncResults) {
      if (insights.length === 0 && demographics.length === 0) continue

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

      const { data: syncedCamps, error: campErr } = await supabase
        .from("campaigns")
        .upsert(Array.from(campaignMap.values()), { onConflict: "external_id" })
        .select("id, external_id")

      if (campErr) {
        console.error(`[SYNC] Erro ao upsert campanhas de ${accountId}:`, campErr.message)
        continue
      }

      totalCampaigns += syncedCamps.length
      const idMap = new Map(syncedCamps.map(c => [c.external_id, c.id]))

      // ── 3b. Upsert métricas diárias ─────────────────────────────────────────
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
