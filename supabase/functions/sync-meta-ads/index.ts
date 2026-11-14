// supabase/functions/sync-meta-ads/index.ts
// NC Performance Suite — Motor de Sincronização Integral Meta Graph API v21.0

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"
import {
  META_GRAPH_BASE,
  extractMetaInsightMetrics,
  metaFetchJsonWithRetry,
  metaFetchPaginatedWithStatus,
  type MetaPaginatedResult,
} from "../_shared/metaCore.ts"

const SYNC_VERSION = "2026-11-14-integral-v2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

const META_API_BASE = META_GRAPH_BASE
const INSIGHT_ATTRIBUTION_WINDOWS = JSON.stringify(["7d_click", "1d_view", "1d_click", "default"])

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

function emptyPaginatedResult<T = any>(error: string | null = null): MetaPaginatedResult<T> {
  return {
    ok: false,
    data: [],
    pagesFetched: 0,
    truncated: false,
    statusCode: null,
    attempts: 0,
    error,
    errorCode: null,
    errorKind: error ? "unknown" : "none",
    rateLimitUsagePct: null,
  }
}

async function safePaginatedFetch(
  path: string,
  token: string,
  params: Record<string, string>,
  label: string,
  maxPages = 100
): Promise<MetaPaginatedResult<any>> {
  try {
    const res = await metaFetchPaginatedWithStatus<any>(path, token, params, {
      maxRetries: 4,
      baseDelayMs: 600,
      maxDelayMs: 10000,
      maxPages,
    })
    if (!res.ok || res.truncated) {
      console.warn(`[SYNC] Fetch parcial/erro em ${label} (${path}): ok=${res.ok}, truncated=${res.truncated}, error=${res.error}`)
    }
    return res
  } catch (e: any) {
    console.error(`[SYNC] Exceção em ${label} (${path}):`, e?.message || String(e))
    return emptyPaginatedResult(e?.message || String(e))
  }
}

async function safeUpsertWithExtendedColumns(
  table: string,
  rows: Record<string, any>[],
  onConflict: string,
  extendedKeys: string[],
  selectCols?: string
): Promise<{ data: any[] | null; error: string | null; degradedSchema: boolean; missingTable: boolean }> {
  if (rows.length === 0) return { data: [], error: null, degradedSchema: false, missingTable: false }

  const execUpsert = async (payload: Record<string, any>[]) => {
    const q = supabase.from(table).upsert(payload, { onConflict })
    if (selectCols) return await q.select(selectCols)
    return await q
  }

  const primary = await execUpsert(rows)
  if (!primary.error) {
    return { data: (primary as any).data || [], error: null, degradedSchema: false, missingTable: false }
  }

  const msg = String(primary.error.message || "")
  const code = String((primary.error as any).code || "")

  if (code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("Could not find the table")) {
    return { data: null, error: msg, degradedSchema: true, missingTable: true }
  }

  if (code === "PGRST204" || msg.includes("Could not find") || msg.includes("column")) {
    const stripped = rows.map((row) => {
      const clone: Record<string, any> = {}
      for (const [k, v] of Object.entries(row)) {
        if (!extendedKeys.includes(k)) clone[k] = v
      }
      return clone
    })
    const fallback = await execUpsert(stripped)
    if (!fallback.error) {
      console.warn(`[SYNC] Schema legado detectado na tabela ${table}; gravado sem colunas estendidas (${msg}).`)
      return { data: (fallback as any).data || [], error: null, degradedSchema: true, missingTable: false }
    }
    return { data: null, error: fallback.error.message, degradedSchema: true, missingTable: false }
  }

  return { data: null, error: primary.error.message, degradedSchema: false, missingTable: false }
}

// ─── Buscar todas as contas vinculadas ao token ───────────────────────────────
async function fetchAdAccountsWithStatus(token: string) {
  return await safePaginatedFetch("/me/adaccounts", token, {
    fields: "name,currency,account_status,disable_reason,id,timezone_name",
    limit: "100"
  }, "me/adaccounts")
}

// ─── Buscar campanhas com orçamentos + objetivo + metadados completos ────────
async function fetchCampaignsWithBudgets(adAccountId: string, token: string): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/campaigns`, token, {
    fields: "id,name,status,effective_status,configured_status,buying_type,bid_strategy,daily_budget,lifetime_budget,budget_remaining,spend_cap,start_time,stop_time,special_ad_categories,objective",
    limit: "250"
  }, `campaigns:${adAccountId}`)
}

// ─── Insights diários em nível de conta (alcance deduplicado por dia) ────────
async function fetchAccountInsightsDaily(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "account",
    fields: "account_id,spend,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,date_start,date_stop",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    limit: "250",
    ...timeParams
  }, `account_daily:${adAccountId}`)
}

// ─── Insights de período em nível de conta (alcance deduplicado do período) ──
async function fetchAccountInsightsPeriod(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "account",
    fields: "account_id,spend,reach,impressions,frequency,clicks,inline_link_clicks,actions,action_values,results,date_start,date_stop",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "100",
    ...timeParams
  }, `account_period:${adAccountId}`)
}

// ─── Buscar insights diários de campanha ─────────────────────────────────────
async function fetchCampaignInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "campaign",
    fields: "campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,ctr,cpc,cpm,date_start,date_stop",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "500",
    ...timeParams
  }, `campaign_insights:${adAccountId}`)
}

// ─── Buscar insights diários de adsets ───────────────────────────────────────
async function fetchAdSetInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "adset",
    fields: "adset_id,adset_name,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start,date_stop",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "500",
    ...timeParams
  }, `adset_insights:${adAccountId}`)
}

// ─── Buscar insights diários de ads ──────────────────────────────────────────
async function fetchAdInsights(adAccountId: string, token: string, timeParams: Record<string, string>): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "ad",
    fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,actions,action_values,reach,impressions,frequency,clicks,inline_link_clicks,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,date_start,date_stop",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "500",
    ...timeParams
  }, `ad_insights:${adAccountId}`)
}

// ─── Buscar metadados completos de conjuntos de anúncios ─────────────────────
async function fetchAdSetsWithStatus(adAccountId: string, token: string): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/adsets`, token, {
    fields: "id,name,status,effective_status,configured_status,campaign_id,daily_budget,lifetime_budget,budget_remaining,optimization_goal,billing_event,bid_strategy,bid_amount,destination_type,attribution_spec,promoted_object,targeting,start_time,end_time",
    limit: "250"
  }, `adsets:${adAccountId}`)
}

// ─── Buscar metadados completos de anúncios + criativo ───────────────────────
async function fetchAdsWithStatus(adAccountId: string, token: string): Promise<MetaPaginatedResult<any>> {
  return await safePaginatedFetch(`/${adAccountId}/ads`, token, {
    fields: "id,name,status,effective_status,configured_status,adset_id,campaign_id,creative{id,name,effective_object_story_id,call_to_action_type,thumbnail_url}",
    limit: "250"
  }, `ads:${adAccountId}`)
}

async function fetchDemographicBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  const [dataAgeGender, dataPlatform, dataHourly, dataRegion] = await Promise.all([
    safePaginatedFetch(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
      breakdowns: "age,gender",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
      limit: "500",
      ...timeParams
    }, `breakdown_age_gender:${adAccountId}`),
    safePaginatedFetch(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
      breakdowns: "publisher_platform",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
      limit: "500",
      ...timeParams
    }, `breakdown_platform:${adAccountId}`),
    safePaginatedFetch(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
      limit: "500",
      ...timeParams
    }, `breakdown_hourly:${adAccountId}`),
    safePaginatedFetch(`/${adAccountId}/insights`, token, {
      level: "campaign",
      fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
      breakdowns: "region",
      time_increment: "1",
      use_unified_attribution_setting: "true",
      action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
      limit: "500",
      ...timeParams
    }, `breakdown_region:${adAccountId}`)
  ]);

  return {
    demographics: [...dataAgeGender.data, ...dataPlatform.data],
    hourly: dataHourly.data,
    region: dataRegion.data,
    failures: [dataAgeGender, dataPlatform, dataHourly, dataRegion]
      .filter((r) => !r.ok || r.truncated)
      .map((r) => r.error || "breakdown_truncated"),
  }
}

// ─── Extrair métrica de vídeo (p25/p50/p75/p95) de actions ou campo dedicado ─
function extractVideoMetric(row: any, fieldName: string): number {
  const arr = row[fieldName];
  if (Array.isArray(arr) && arr.length > 0) {
    return parseInt(arr[0]?.value || "0") || 0;
  }
  return 0;
}

// ─── Buscar placement breakdown (Feed vs Stories vs Reels vs Marketplace) ────
async function fetchPlacementBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "campaign",
    fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
    breakdowns: "publisher_platform,platform_position",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "500",
    ...timeParams
  }, `breakdown_placement:${adAccountId}`)
}

// ─── Buscar breakdown por dispositivo (mobile/desktop) ───────────────────────
async function fetchDeviceBreakdowns(adAccountId: string, token: string, timeParams: Record<string, string>) {
  return await safePaginatedFetch(`/${adAccountId}/insights`, token, {
    level: "campaign",
    fields: "campaign_id,campaign_name,objective,optimization_goal,results,spend,actions,action_values,reach,impressions,clicks,inline_link_clicks,date_start",
    breakdowns: "publisher_platform,impression_device",
    time_increment: "1",
    use_unified_attribution_setting: "true",
    action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
    limit: "500",
    ...timeParams
  }, `breakdown_device:${adAccountId}`)
}

function summarizeAttributionSpec(spec: any): string {
  if (!Array.isArray(spec) || spec.length === 0) return "unified_or_default";
  return spec
    .map((s: any) => `${s.event_type || "EVENT"}:${s.window_days ?? "?"}d`)
    .join("+");
}

function parseMetaTimestamp(val: any): string | null {
  if (!val) return null;
  const d = new Date(val);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ─── Sync principal ───────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const syncId = crypto.randomUUID()
  let syncHistoryId: string | null = null
  let involvedUserIds: string[] = []
  console.log(`[SYNC ${syncId}] Iniciando sincronização integral NC Performance...`)

  try {
    const { user: authUser } = await requireAuth(req);
    if (authUser?.id) involvedUserIds = [authUser.id];

    // 1. Ler parâmetros — Padrão: últimos 2 dias (hoje + ontem) no fuso de Brasília
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

    // 2. Buscar TODAS as configurações com token
    const { data: allConfigs, error: configErr } = await supabase
      .from("meta_ads_configs")
      .select("access_token, user_id")
      .not("access_token", "is", null)
      .order("created_at", { ascending: false });

    if (configErr || !allConfigs || allConfigs.length === 0) {
      throw new Error("Meta Token não configurado. Acesse Configurações → Integrações.")
    }

    const orderedConfigs = authUser?.id
      ? [...allConfigs].sort((a, b) => (b.user_id === authUser.id ? 1 : 0) - (a.user_id === authUser.id ? 1 : 0))
      : allConfigs;

    const token = orderedConfigs[0].access_token
    const userId = orderedConfigs[0].user_id
    involvedUserIds = [...new Set(orderedConfigs.map((c: any) => c.user_id).filter(Boolean))]

    // ─── MODO AUDITORIA — retorna o payload bruto normalizado sem gravar no DB ─
    if (action === "audit") {
      console.log(`[AUDIT ${syncId}] Iniciando auditoria integral de objetos & action_types...`)
      let auditEntries: { acc: any; token: string }[] = []
      const auditSeen = new Set<string>()
      const auditErrors: string[] = []

      for (const cfg of orderedConfigs) {
        const res = await fetchAdAccountsWithStatus(cfg.access_token)
        if (!res.ok || res.truncated) {
          auditErrors.push(`Token ${cfg.user_id}: ${res.error || "listagem truncada"}`)
        }
        for (const acc of res.data) {
          if (auditSeen.has(acc.id)) continue
          auditSeen.add(acc.id)
          auditEntries.push({ acc, token: cfg.access_token })
        }
      }
      if (targetAccountId) auditEntries = auditEntries.filter(e => e.acc.id === targetAccountId)

      const auditResult: any[] = []
      for (const { acc, token: accToken } of auditEntries) {
        const [campaignsRes, adsetsRes, insightsRes, accountPeriodRes] = await Promise.all([
          fetchCampaignsWithBudgets(acc.id, accToken),
          fetchAdSetsWithStatus(acc.id, accToken),
          fetchCampaignInsights(acc.id, accToken, timeParams),
          fetchAccountInsightsPeriod(acc.id, accToken, timeParams),
        ])
        const objectiveMap = new Map(campaignsRes.data.map((c: any) => [c.id, c.objective as string | undefined]))
        const adsetGoalByCampaign = new Map<string, { optimizationGoal: string | null; destinationType: string | null }>()
        for (const s of adsetsRes.data) {
          if (s.campaign_id && !adsetGoalByCampaign.has(s.campaign_id)) {
            adsetGoalByCampaign.set(s.campaign_id, {
              optimizationGoal: s.optimization_goal || null,
              destinationType: s.destination_type || null,
            })
          }
        }

        const acctPeriodRow = accountPeriodRes.data[0] || null
        for (const row of insightsRes.data) {
          const actions: any[] = row.actions || []
          const rawObjective = row.objective || objectiveMap.get(row.campaign_id) || null
          const adsetCtx = adsetGoalByCampaign.get(row.campaign_id)
          const extracted = extractMetaInsightMetrics(row, {
            rawObjective,
            optimizationGoal: row.optimization_goal || adsetCtx?.optimizationGoal || null,
            destinationType: adsetCtx?.destinationType || null,
          })
          auditResult.push({
            account: acc.name,
            account_id: acc.id,
            account_period_dedup_reach: acctPeriodRow ? parseInt(acctPeriodRow.reach || "0", 10) : null,
            campaign_id: row.campaign_id,
            campaign_name: row.campaign_name,
            raw_objective: rawObjective,
            optimization_goal: row.optimization_goal || adsetCtx?.optimizationGoal || null,
            destination_type: adsetCtx?.destinationType || null,
            date: row.date_start,
            spend: extracted.spend,
            impressions: extracted.impressions,
            reach: extracted.reach,
            inline_link_clicks: extracted.inlineLinkClicks,
            all_clicks: extracted.allClicks,
            ctr_link_pct: extracted.ctrLink,
            ctr_all_pct: extracted.ctrAll,
            normalized_category: extracted.category,
            result_count: extracted.resultCount,
            result_indicator: extracted.resultIndicator,
            result_source: extracted.resultSource,
            purchase_value: extracted.purchaseValue,
            roas: extracted.roas,
            raw_results: row.results || [],
            all_actions: actions.map((a: any) => ({
              action_type: a.action_type,
              value: a.value,
              "7d_click": a["7d_click"],
              "1d_view": a["1d_view"],
            })),
          })
        }
      }

      return new Response(JSON.stringify({
        audit: auditResult,
        errors: auditErrors,
        time_range: timeParams,
        sync_version: SYNC_VERSION,
      }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ─── Toggle status no Meta ────────────────────────────────────────────────
    if (action === "toggle-status" && togglePayload) {
      console.log(`[TOGGLE ${syncId}] Alterando status do objeto ${togglePayload.external_id} para ${togglePayload.status} no Meta...`)
      const res = await fetch(`${META_API_BASE}/${togglePayload.external_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({
        success: true,
        external_id: togglePayload.external_id,
        status: togglePayload.status
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // ─── Update budget no Meta ────────────────────────────────────────────────
    if (action === "update-budget" && budgetPayload) {
      console.log(`[BUDGET ${syncId}] Alterando orçamento do objeto ${budgetPayload.external_id} para R$ ${budgetPayload.budget} no Meta...`)
      const res = await fetch(`${META_API_BASE}/${budgetPayload.external_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
      return new Response(JSON.stringify({
        success: true,
        external_id: budgetPayload.external_id,
        daily_budget: budgetPayload.budget
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // 3. Registrar início do sync no histórico (limpa eventuais locks zumbis >5m)
    try {
      const staleCutoffIso = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await supabase
        .from("sync_history")
        .update({
          status: "error",
          completed_at: new Date().toISOString(),
          error_message: "Execução anterior interrompida por timeout (>5m)",
        })
        .eq("status", "running")
        .lt("started_at", staleCutoffIso)
    } catch (_) {}

    const { data: syncRecord } = await supabase.from("sync_history").insert({
      user_id: userId,
      status: "running",
      triggered_by: triggeredBy,
    }).select("id").maybeSingle()

    syncHistoryId = syncRecord?.id || null

    // 4. Listar contas autorizadas com controle explícito de completude (nunca purgar se parcial!)
    const configByUser = new Map(orderedConfigs.map((c: any) => [c.user_id, c.access_token]))
    const accountEntries: { acc: any; token: string; userId: string }[] = []
    const seenAccounts = new Set<string>()
    const partialFailures: any[] = []
    let allAccountListingsComplete = true

    console.log(`[SYNC ${syncId}] Buscando lista oficial de contas na Meta API...`)
    for (const cfg of orderedConfigs) {
      const accountsRes = await fetchAdAccountsWithStatus(cfg.access_token)
      if (!accountsRes.ok || accountsRes.truncated) {
        allAccountListingsComplete = false
        partialFailures.push({
          scope: "ad_accounts",
          user_id: cfg.user_id,
          error: accountsRes.error || "listagem truncada",
          errorKind: accountsRes.errorKind,
        })
      }
      for (const acc of accountsRes.data) {
        if (seenAccounts.has(acc.id)) continue
        seenAccounts.add(acc.id)
        accountEntries.push({ acc, token: cfg.access_token, userId: cfg.user_id })
      }
    }

    // Somente purga contas órfãs quando TODAS as listagens de token foram 100% íntegras (sem erros ou truncamentos)
    if (allAccountListingsComplete && accountEntries.length > 0 && !targetAccountId) {
      const activeIds = new Set(accountEntries.map(e => e.acc.id))
      const { data: dbAccounts } = await supabase.from("ad_accounts").select("id")
      const obsoleteIds = (dbAccounts || []).map((a: any) => a.id).filter((id: string) => !activeIds.has(id))

      if (obsoleteIds.length > 0) {
        console.log(`[SYNC ${syncId}] Purgando ${obsoleteIds.length} conta(s) órfã(s): ${obsoleteIds.join(", ")}`)
        try {
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

          await supabase.from("ad_accounts").delete().in("id", obsoleteIds)
        } catch (purgeErr: any) {
          console.error(`[SYNC ${syncId}] Erro ao purgar contas antigas:`, purgeErr.message)
          partialFailures.push({ scope: "purge_orphans", error: purgeErr.message })
        }
      }
    } else if (accountEntries.length === 0) {
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
      if (entriesToSync.length === 0) {
        throw new Error(`A conta ${targetAccountId} não é visível por nenhum token configurado.`)
      }
    }

    const adAccounts = entriesToSync.map(e => e.acc)

    // Registrar metadados básicos da conta SEM marcar last_sync ainda (só marca após sync bem-sucedido)
    await supabase.from("ad_accounts").upsert(
      entriesToSync.map(({ acc, userId: accUserId }) => ({
        id: acc.id,
        name: acc.name,
        currency: acc.currency,
        status: acc.account_status,
        user_id: accUserId,
      })),
      { onConflict: "id" }
    )

    console.log(`[SYNC ${syncId}] ${entriesToSync.length} contas. Iniciando coleta integral...`)

    const syncResults: any[] = []
    const apiErrors: string[] = []
    const coverageByAccount: Record<string, any> = {}
    let totalMetrics = 0
    let totalDemographics = 0
    let totalCampaigns = 0

    for (const { acc, token: accToken, userId: accUserId } of entriesToSync) {
      try {
        console.log(`[SYNC] Coletando conta ${acc.id} (${acc.name})...`)

        const [
          campaignsRes,
          insightsRes,
          breakDownsData,
          adsetInsightsRes,
          adInsightsRes,
          adsetsRes,
          adsRes,
          placementRes,
          deviceRes,
          accountDailyRes,
          accountPeriodRes,
        ] = await Promise.all([
          fetchCampaignsWithBudgets(acc.id, accToken),
          fetchCampaignInsights(acc.id, accToken, timeParams),
          fetchDemographicBreakdowns(acc.id, accToken, timeParams),
          fetchAdSetInsights(acc.id, accToken, timeParams),
          fetchAdInsights(acc.id, accToken, timeParams),
          fetchAdSetsWithStatus(acc.id, accToken),
          fetchAdsWithStatus(acc.id, accToken),
          fetchPlacementBreakdowns(acc.id, accToken, timeParams),
          fetchDeviceBreakdowns(acc.id, accToken, timeParams),
          fetchAccountInsightsDaily(acc.id, accToken, timeParams),
          fetchAccountInsightsPeriod(acc.id, accToken, timeParams),
        ])

        const stepFailures: string[] = []
        const trackRes = (name: string, r: MetaPaginatedResult<any>) => {
          if (!r.ok || r.truncated) {
            const msg = `${name}: ${r.error || "truncado"}`
            stepFailures.push(msg)
            partialFailures.push({
              account_id: acc.id,
              step: name,
              error: r.error || "paginação truncada",
              errorKind: r.errorKind,
              statusCode: r.statusCode,
            })
          }
        }
        trackRes("campaigns", campaignsRes)
        trackRes("campaign_insights", insightsRes)
        trackRes("adset_insights", adsetInsightsRes)
        trackRes("ad_insights", adInsightsRes)
        trackRes("adsets", adsetsRes)
        trackRes("ads", adsRes)
        trackRes("placement_breakdowns", placementRes)
        trackRes("device_breakdowns", deviceRes)
        trackRes("account_daily_insights", accountDailyRes)
        trackRes("account_period_insights", accountPeriodRes)
        if (breakDownsData.failures.length > 0) {
          stepFailures.push(`breakdowns: ${breakDownsData.failures.join(", ")}`)
          partialFailures.push({ account_id: acc.id, step: "breakdowns", errors: breakDownsData.failures })
        }

        const campaignsWithBudgets = campaignsRes.data
        // Preserva o objetivo nativo da Meta Graph API sem inventar nem sobrescrever por nome
        const budgetMap = new Map(campaignsWithBudgets.map((c: any) => [
          c.id,
          {
            name: c.name || "Campanha Meta",
            status: c.status ? String(c.status).toLowerCase() : "active",
            daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
            lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
            budget_currency: acc.currency || 'BRL',
            objective: c.objective || null,
          }
        ]))
        const campaignObjectiveMap = new Map(campaignsWithBudgets.map((c: any) => [c.id, (c.objective as string | null) || null]))

        const adsetMetaById = new Map<string, { optimizationGoal: string | null; destinationType: string | null; attributionWindow: string }>()
        for (const s of adsetsRes.data) {
          adsetMetaById.set(s.id, {
            optimizationGoal: s.optimization_goal || null,
            destinationType: s.destination_type || null,
            attributionWindow: summarizeAttributionSpec(s.attribution_spec),
          })
        }

        const primaryAdsetMetaByCampaign = new Map<string, { optimizationGoal: string | null; destinationType: string | null; attributionWindow: string }>()
        for (const s of adsetsRes.data) {
          if (s.campaign_id && !primaryAdsetMetaByCampaign.has(s.campaign_id)) {
            primaryAdsetMetaByCampaign.set(s.campaign_id, {
              optimizationGoal: s.optimization_goal || null,
              destinationType: s.destination_type || null,
              attributionWindow: summarizeAttributionSpec(s.attribution_spec),
            })
          }
        }

        coverageByAccount[acc.id] = {
          campaigns_listed: campaignsWithBudgets.length,
          campaign_insights: insightsRes.data.length,
          adsets_listed: adsetsRes.data.length,
          adset_insights: adsetInsightsRes.data.length,
          ads_listed: adsRes.data.length,
          ad_insights: adInsightsRes.data.length,
          account_daily_rows: accountDailyRes.data.length,
          account_period_rows: accountPeriodRes.data.length,
          partial_errors: stepFailures,
        }

        syncResults.push({
          accountId: acc.id,
          accountName: acc.name,
          accountUserId: accUserId,
          accountToken: accToken,
          insights: insightsRes.data,
          demographics: breakDownsData.demographics || [],
          hourly: breakDownsData.hourly || [],
          region: breakDownsData.region || [],
          placementData: placementRes.data,
          deviceData: deviceRes.data,
          adsetInsights: adsetInsightsRes.data,
          adInsights: adInsightsRes.data,
          adsetsWithStatus: adsetsRes.data,
          adsWithStatus: adsRes.data,
          accountDailyRows: accountDailyRes.data,
          accountPeriodRows: accountPeriodRes.data,
          budgetMap,
          campaignsWithBudgets,
          campaignObjectiveMap,
          adsetMetaById,
          primaryAdsetMetaByCampaign,
          hasPartialErrors: stepFailures.length > 0,
        })

        await new Promise(r => setTimeout(r, 250))
      } catch (err: any) {
        console.error(`[SYNC] Erro na conta ${acc.id}:`, err.message)
        apiErrors.push(`Conta ${acc.id}: ${err.message}`)
        partialFailures.push({ account_id: acc.id, step: "fetch", error: err.message })
      }
    }

    const nowIso = new Date().toISOString()

    for (const item of syncResults) {
      const {
        accountId,
        accountToken,
        insights,
        demographics,
        hourly,
        region,
        placementData = [],
        deviceData = [],
        adsetInsights,
        adInsights,
        adsetsWithStatus = [],
        adsWithStatus = [],
        accountDailyRows = [],
        accountPeriodRows = [],
        budgetMap,
        campaignsWithBudgets = [],
        campaignObjectiveMap = new Map(),
        adsetMetaById = new Map(),
        primaryAdsetMetaByCampaign = new Map(),
        hasPartialErrors,
      } = item

      // 1. Consolidar TODAS as campanhas observadas (listagem + insights + adsets + ads) para zero perda silenciosa
      const campaignMap = new Map<string, any>()
      for (const c of campaignsWithBudgets) {
        const deliveryStatus = c.effective_status ? String(c.effective_status).toUpperCase() : null
        campaignMap.set(c.id, {
          name: c.name || "Campanha Meta",
          platform: "Meta Ads",
          status: c.status ? String(c.status).toLowerCase() : "active",
          delivery_status: deliveryStatus,
          configured_status: c.configured_status ? String(c.configured_status).toUpperCase() : null,
          buying_type: c.buying_type || null,
          bid_strategy: c.bid_strategy || null,
          objective: c.objective || null,
          external_id: c.id,
          ad_account_id: accountId,
          daily_budget: c.daily_budget ? parseFloat(c.daily_budget) / 100 : 0,
          lifetime_budget: c.lifetime_budget ? parseFloat(c.lifetime_budget) / 100 : 0,
          budget_remaining: c.budget_remaining !== undefined && c.budget_remaining !== null ? parseFloat(c.budget_remaining) / 100 : null,
          spend_cap: c.spend_cap !== undefined && c.spend_cap !== null ? parseFloat(c.spend_cap) / 100 : null,
          budget_currency: budgetMap.get(c.id)?.budget_currency || 'BRL',
          start_time: parseMetaTimestamp(c.start_time),
          stop_time: parseMetaTimestamp(c.stop_time),
          special_ad_categories: Array.isArray(c.special_ad_categories) ? c.special_ad_categories : [],
          meta_synced_at: nowIso,
        })
      }

      for (const row of [...insights, ...demographics, ...hourly, ...region, ...placementData, ...deviceData]) {
        if (row.campaign_id && !campaignMap.has(row.campaign_id)) {
          const budget: any = budgetMap.get(row.campaign_id) || {}
          campaignMap.set(row.campaign_id, {
            name: row.campaign_name || `Campanha ${row.campaign_id}`,
            platform: "Meta Ads",
            status: budget.status || "active",
            delivery_status: null,
            configured_status: null,
            buying_type: null,
            bid_strategy: null,
            objective: row.objective || budget.objective || null,
            external_id: row.campaign_id,
            ad_account_id: accountId,
            daily_budget: budget.daily_budget || 0,
            lifetime_budget: budget.lifetime_budget || 0,
            budget_remaining: null,
            spend_cap: null,
            budget_currency: budget.budget_currency || 'BRL',
            start_time: null,
            stop_time: null,
            special_ad_categories: [],
            meta_synced_at: nowIso,
          })
        }
      }

      for (const row of [...adsetsWithStatus, ...adsWithStatus, ...adsetInsights, ...adInsights]) {
        if (row.campaign_id && !campaignMap.has(row.campaign_id)) {
          const budget: any = budgetMap.get(row.campaign_id) || {}
          campaignMap.set(row.campaign_id, {
            name: row.campaign_name || `Campanha (${row.campaign_id})`,
            platform: "Meta Ads",
            status: budget.status || "active",
            delivery_status: null,
            configured_status: null,
            buying_type: null,
            bid_strategy: null,
            objective: row.objective || budget.objective || null,
            external_id: row.campaign_id,
            ad_account_id: accountId,
            daily_budget: budget.daily_budget || 0,
            lifetime_budget: budget.lifetime_budget || 0,
            budget_remaining: null,
            spend_cap: null,
            budget_currency: budget.budget_currency || 'BRL',
            start_time: null,
            stop_time: null,
            special_ad_categories: [],
            meta_synced_at: nowIso,
          })
        }
      }

      let syncedCamps: any[] = []
      if (campaignMap.size > 0) {
        const campUpsert = await safeUpsertWithExtendedColumns(
          "campaigns",
          Array.from(campaignMap.values()),
          "external_id",
          ["configured_status", "buying_type", "bid_strategy", "budget_remaining", "spend_cap", "start_time", "stop_time", "special_ad_categories", "meta_synced_at"],
          "id, external_id"
        )
        if (campUpsert.error) {
          console.error(`[SYNC] Erro campanhas ${accountId}:`, campUpsert.error)
          apiErrors.push(`Campanhas ${accountId}: ${campUpsert.error}`)
          continue
        }
        syncedCamps = campUpsert.data || []
      }

      totalCampaigns += syncedCamps.length
      const idMap = new Map(syncedCamps.map(c => [c.external_id, c.id]))

      // 2. Upsert AdSets (listagem completa + insights + pais referenciados por ads)
      const adsetStatusMap = new Map(adsetsWithStatus.map((a: any) => [a.id, String(a.status || "active").toLowerCase()]))
      const adsetMap = new Map<string, any>()

      for (const a of adsetsWithStatus) {
        const campaign_id = idMap.get(a.campaign_id)
        if (!campaign_id) continue
        const dailyB = a.daily_budget ? parseFloat(a.daily_budget) / 100 : 0
        const lifeB = a.lifetime_budget ? parseFloat(a.lifetime_budget) / 100 : 0
        adsetMap.set(a.id, {
          campaign_id,
          ad_account_id: accountId,
          name: a.name || `Conjunto ${a.id}`,
          external_id: a.id,
          status: a.status ? String(a.status).toLowerCase() : "active",
          delivery_status: a.effective_status ? String(a.effective_status).toUpperCase() : null,
          configured_status: a.configured_status ? String(a.configured_status).toUpperCase() : null,
          budget: dailyB > 0 ? dailyB : lifeB,
          daily_budget: dailyB,
          lifetime_budget: lifeB,
          budget_remaining: a.budget_remaining !== undefined && a.budget_remaining !== null ? parseFloat(a.budget_remaining) / 100 : null,
          optimization_goal: a.optimization_goal || null,
          billing_event: a.billing_event || null,
          bid_strategy: a.bid_strategy || null,
          bid_amount: a.bid_amount ? parseFloat(a.bid_amount) / 100 : null,
          destination_type: a.destination_type || null,
          attribution_spec: Array.isArray(a.attribution_spec) ? a.attribution_spec : null,
          promoted_object: a.promoted_object || null,
          targeting: a.targeting || null,
          start_time: parseMetaTimestamp(a.start_time),
          end_time: parseMetaTimestamp(a.end_time),
          meta_synced_at: nowIso,
        })
      }

      for (const row of [...adsetInsights, ...adInsights, ...adsWithStatus]) {
        if (!row.adset_id || adsetMap.has(row.adset_id)) continue
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) continue
        adsetMap.set(row.adset_id, {
          campaign_id,
          ad_account_id: accountId,
          name: row.adset_name || `Conjunto ${row.adset_id}`,
          external_id: row.adset_id,
          status: adsetStatusMap.get(row.adset_id) || "active",
          delivery_status: null,
          configured_status: null,
          budget: 0,
          daily_budget: 0,
          lifetime_budget: 0,
          budget_remaining: null,
          optimization_goal: row.optimization_goal || null,
          billing_event: null,
          bid_strategy: null,
          bid_amount: null,
          destination_type: null,
          attribution_spec: null,
          promoted_object: null,
          targeting: null,
          start_time: null,
          end_time: null,
          meta_synced_at: nowIso,
        })
      }

      let syncedAdsets: any[] = []
      if (adsetMap.size > 0) {
        const adsetUpsert = await safeUpsertWithExtendedColumns(
          "ad_sets",
          Array.from(adsetMap.values()),
          "external_id",
          ["ad_account_id", "delivery_status", "configured_status", "optimization_goal", "billing_event", "bid_strategy", "bid_amount", "destination_type", "attribution_spec", "promoted_object", "targeting", "daily_budget", "lifetime_budget", "budget_remaining", "start_time", "end_time", "meta_synced_at"],
          "id, external_id"
        )
        if (adsetUpsert.error) console.error(`[SYNC] Erro adsets ${accountId}:`, adsetUpsert.error)
        syncedAdsets = adsetUpsert.data || []
      }
      const adsetIdMap = new Map(syncedAdsets.map(a => [a.external_id, a.id]))

      // 3. Upsert Ads (com metadados de entrega e criativo)
      const adStatusMap = new Map(adsWithStatus.map((a: any) => [a.id, String(a.status || "active").toLowerCase()]))
      const adMap = new Map<string, any>()

      for (const a of adsWithStatus) {
        const ad_set_id = adsetIdMap.get(a.adset_id)
        const campaign_id = idMap.get(a.campaign_id)
        if (!ad_set_id || !campaign_id) continue
        adMap.set(a.id, {
          ad_set_id,
          campaign_id,
          ad_account_id: accountId,
          name: a.name || `Anúncio ${a.id}`,
          external_id: a.id,
          status: a.status ? String(a.status).toLowerCase() : "active",
          delivery_status: a.effective_status ? String(a.effective_status).toUpperCase() : null,
          configured_status: a.configured_status ? String(a.configured_status).toUpperCase() : null,
          creative_id: a.creative?.id || null,
          creative_name: a.creative?.name || null,
          effective_object_story_id: a.creative?.effective_object_story_id || null,
          call_to_action_type: a.creative?.call_to_action_type || null,
          thumbnail_url: a.creative?.thumbnail_url || null,
          meta_synced_at: nowIso,
        })
      }

      for (const row of adInsights) {
        if (!row.ad_id || adMap.has(row.ad_id)) continue
        const ad_set_id = adsetIdMap.get(row.adset_id)
        const campaign_id = idMap.get(row.campaign_id)
        if (!ad_set_id || !campaign_id) continue
        adMap.set(row.ad_id, {
          ad_set_id,
          campaign_id,
          ad_account_id: accountId,
          name: row.ad_name || `Anúncio ${row.ad_id}`,
          external_id: row.ad_id,
          status: adStatusMap.get(row.ad_id) || "active",
          delivery_status: null,
          configured_status: null,
          creative_id: null,
          creative_name: null,
          effective_object_story_id: null,
          call_to_action_type: null,
          thumbnail_url: null,
          meta_synced_at: nowIso,
        })
      }

      let syncedAds: any[] = []
      if (adMap.size > 0) {
        const adUpsert = await safeUpsertWithExtendedColumns(
          "ads",
          Array.from(adMap.values()),
          "external_id",
          ["ad_account_id", "delivery_status", "configured_status", "creative_id", "creative_name", "effective_object_story_id", "call_to_action_type", "thumbnail_url", "meta_synced_at"],
          "id, external_id"
        )
        if (adUpsert.error) console.error(`[SYNC] Erro ads ${accountId}:`, adUpsert.error)
        syncedAds = adUpsert.data || []
      }
      const adIdMap = new Map(syncedAds.map(a => [a.external_id, a.id]))

      // 4. Upsert Account-level daily deduplicated reach
      if (accountDailyRows.length > 0) {
        const accountDailyToUpsert = accountDailyRows.map((row: any) => ({
          ad_account_id: accountId,
          date: row.date_start,
          reach: parseInt(row.reach || "0", 10) || 0,
          impressions: parseInt(row.impressions || "0", 10) || 0,
          frequency: parseFloat(row.frequency || "0") || 0,
          spend: parseFloat(row.spend || "0") || 0,
          clicks: parseInt(row.clicks || "0", 10) || 0,
          inline_link_clicks: parseInt(row.inline_link_clicks || "0", 10) || 0,
          synced_at: nowIso,
        }))
        const accDailyRes = await safeUpsertWithExtendedColumns(
          "meta_account_daily_stats",
          accountDailyToUpsert,
          "ad_account_id,date",
          [],
        )
        if (accDailyRes.error && !accDailyRes.missingTable) {
          console.warn(`[SYNC] meta_account_daily_stats ${accountId}: ${accDailyRes.error}`)
        }
      }

      // 5. Upsert métricas diárias de campanhas (sem heurísticas de nome)
      const metricsToUpsert = insights.map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const rawObjective = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
        const campCtx = primaryAdsetMetaByCampaign.get(row.campaign_id)
        const optGoal = row.optimization_goal || campCtx?.optimizationGoal || null
        const extracted = extractMetaInsightMetrics(row, {
          rawObjective,
          optimizationGoal: optGoal,
          destinationType: campCtx?.destinationType || null,
        })
        return {
          campaign_id,
          date: row.date_start,
          impressions: extracted.impressions,
          clicks: extracted.inlineLinkClicks,
          inline_link_clicks: extracted.inlineLinkClicks,
          all_clicks: extracted.allClicks,
          cost: extracted.spend,
          reach: extracted.reach,
          frequency: extracted.frequency,
          conversions: extracted.resultCount ?? 0,
          result_type: extracted.category,
          raw_objective: rawObjective,
          optimization_goal: optGoal,
          result_indicator: extracted.resultIndicator,
          attribution_window: campCtx?.attributionWindow || "unified_or_default",
          purchase_value: extracted.purchaseValue ?? 0,
          actions_json: Array.isArray(row.actions) ? row.actions : null,
          results_json: Array.isArray(row.results) ? row.results : null,
          cost_per_result_json: Array.isArray(row.cost_per_result) ? row.cost_per_result : null,
          sync_version: SYNC_VERSION,
        }
      }).filter(Boolean) as Record<string, any>[]

      if (metricsToUpsert.length > 0) {
        const metricsRes = await safeUpsertWithExtendedColumns(
          "metrics",
          metricsToUpsert,
          "campaign_id,date",
          ["raw_objective", "optimization_goal", "result_indicator", "attribution_window", "inline_link_clicks", "all_clicks", "purchase_value", "actions_json", "results_json", "cost_per_result_json", "sync_version"]
        )
        if (metricsRes.error) console.error(`[SYNC] Erro métricas ${accountId}:`, metricsRes.error)
        else totalMetrics += metricsToUpsert.length
      }

      // 6. Period stats (nível account + campaign + adset + ad — sem time_increment → alcance real deduplicado)
      try {
        let periodStart = yesterdayStr
        let periodEnd = todayStr
        try {
          if (timeParams.time_range) {
            const tr = JSON.parse(timeParams.time_range)
            periodStart = tr.since
            periodEnd = tr.until
          }
        } catch (_) {}

        if (accountPeriodRows.length > 0) {
          const accountPeriodToUpsert = accountPeriodRows.map((row: any) => {
            const extracted = extractMetaInsightMetrics(row, {})
            return {
              ad_account_id: accountId,
              start_date: row.date_start || periodStart,
              end_date: row.date_stop || periodEnd,
              reach: extracted.reach,
              impressions: extracted.impressions,
              frequency: extracted.frequency,
              spend: extracted.spend,
              clicks: extracted.allClicks,
              inline_link_clicks: extracted.inlineLinkClicks,
              conversions: extracted.resultCount ?? 0,
              purchase_value: extracted.purchaseValue ?? 0,
              attribution_window: "unified_or_default",
              synced_at: nowIso,
            }
          })
          const accPeriodUpsert = await safeUpsertWithExtendedColumns(
            "meta_account_period_stats",
            accountPeriodToUpsert,
            "ad_account_id,start_date,end_date",
            []
          )
          if (accPeriodUpsert.error && !accPeriodUpsert.missingTable) {
            console.warn(`[SYNC] meta_account_period_stats ${accountId}: ${accPeriodUpsert.error}`)
          }
        }

        const [campPeriodRes, adsetPeriodRes, adPeriodRes] = await Promise.all([
          safePaginatedFetch(`/${accountId}/insights`, accountToken, {
            level: "campaign",
            fields: "campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start,date_stop",
            use_unified_attribution_setting: "true",
            action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
            limit: "500",
            ...timeParams
          }, `period_campaign:${accountId}`),
          safePaginatedFetch(`/${accountId}/insights`, accountToken, {
            level: "adset",
            fields: "adset_id,adset_name,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,date_start,date_stop",
            use_unified_attribution_setting: "true",
            action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
            limit: "500",
            ...timeParams
          }, `period_adset:${accountId}`),
          safePaginatedFetch(`/${accountId}/insights`, accountToken, {
            level: "ad",
            fields: "ad_id,ad_name,adset_id,campaign_id,campaign_name,objective,optimization_goal,results,cost_per_result,spend,reach,impressions,frequency,actions,action_values,clicks,inline_link_clicks,quality_ranking,engagement_rate_ranking,conversion_rate_ranking,date_start,date_stop",
            use_unified_attribution_setting: "true",
            action_attribution_windows: INSIGHT_ATTRIBUTION_WINDOWS,
            limit: "500",
            ...timeParams
          }, `period_ad:${accountId}`),
        ])

        for (const [lvl, pr] of [["period_campaign", campPeriodRes], ["period_adset", adsetPeriodRes], ["period_ad", adPeriodRes]] as const) {
          if (!pr.ok || pr.truncated) {
            partialFailures.push({ account_id: accountId, step: lvl, error: pr.error || "truncado" })
          }
        }

        const periodStatsToUpsert: Record<string, any>[] = []

        for (const row of campPeriodRes.data) {
          const campaign_id = idMap.get(row.campaign_id)
          if (!campaign_id) continue
          const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
          const campCtx = primaryAdsetMetaByCampaign.get(row.campaign_id)
          const optGoal = row.optimization_goal || campCtx?.optimizationGoal || null
          const extracted = extractMetaInsightMetrics(row, {
            rawObjective: rawObj,
            optimizationGoal: optGoal,
            destinationType: campCtx?.destinationType || null,
          })
          periodStatsToUpsert.push({
            entity_type: 'campaign',
            entity_id: campaign_id,
            ad_account_id: accountId,
            start_date: row.date_start || periodStart,
            end_date: row.date_stop || periodEnd,
            reach: extracted.reach,
            impressions: extracted.impressions,
            frequency: extracted.frequency,
            spend: extracted.spend,
            conversions: extracted.resultCount ?? 0,
            clicks: extracted.inlineLinkClicks,
            inline_link_clicks: extracted.inlineLinkClicks,
            all_clicks: extracted.allClicks,
            result_type: extracted.category,
            result_indicator: extracted.resultIndicator,
            optimization_goal: optGoal,
            attribution_window: campCtx?.attributionWindow || "unified_or_default",
            purchase_value: extracted.purchaseValue ?? 0,
            actions_json: Array.isArray(row.actions) ? row.actions : null,
            results_json: Array.isArray(row.results) ? row.results : null,
            synced_at: nowIso,
          })
        }

        for (const row of adsetPeriodRes.data) {
          const ad_set_id = adsetIdMap.get(row.adset_id)
          if (!ad_set_id) continue
          const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
          const adsetCtx = adsetMetaById.get(row.adset_id)
          const optGoal = row.optimization_goal || adsetCtx?.optimizationGoal || null
          const extracted = extractMetaInsightMetrics(row, {
            rawObjective: rawObj,
            optimizationGoal: optGoal,
            destinationType: adsetCtx?.destinationType || null,
          })
          periodStatsToUpsert.push({
            entity_type: 'adset',
            entity_id: ad_set_id,
            ad_account_id: accountId,
            start_date: row.date_start || periodStart,
            end_date: row.date_stop || periodEnd,
            reach: extracted.reach,
            impressions: extracted.impressions,
            frequency: extracted.frequency,
            spend: extracted.spend,
            conversions: extracted.resultCount ?? 0,
            clicks: extracted.inlineLinkClicks,
            inline_link_clicks: extracted.inlineLinkClicks,
            all_clicks: extracted.allClicks,
            result_type: extracted.category,
            result_indicator: extracted.resultIndicator,
            optimization_goal: optGoal,
            attribution_window: adsetCtx?.attributionWindow || "unified_or_default",
            purchase_value: extracted.purchaseValue ?? 0,
            actions_json: Array.isArray(row.actions) ? row.actions : null,
            results_json: Array.isArray(row.results) ? row.results : null,
            synced_at: nowIso,
          })
        }

        for (const row of adPeriodRes.data) {
          const ad_id = adIdMap.get(row.ad_id)
          if (!ad_id) continue
          const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
          const adsetCtx = adsetMetaById.get(row.adset_id) || primaryAdsetMetaByCampaign.get(row.campaign_id)
          const optGoal = row.optimization_goal || adsetCtx?.optimizationGoal || null
          const extracted = extractMetaInsightMetrics(row, {
            rawObjective: rawObj,
            optimizationGoal: optGoal,
            destinationType: adsetCtx?.destinationType || null,
          })
          periodStatsToUpsert.push({
            entity_type: 'ad',
            entity_id: ad_id,
            ad_account_id: accountId,
            start_date: row.date_start || periodStart,
            end_date: row.date_stop || periodEnd,
            reach: extracted.reach,
            impressions: extracted.impressions,
            frequency: extracted.frequency,
            spend: extracted.spend,
            conversions: extracted.resultCount ?? 0,
            clicks: extracted.inlineLinkClicks,
            inline_link_clicks: extracted.inlineLinkClicks,
            all_clicks: extracted.allClicks,
            result_type: extracted.category,
            result_indicator: extracted.resultIndicator,
            optimization_goal: optGoal,
            attribution_window: adsetCtx?.attributionWindow || "unified_or_default",
            purchase_value: extracted.purchaseValue ?? 0,
            actions_json: Array.isArray(row.actions) ? row.actions : null,
            results_json: Array.isArray(row.results) ? row.results : null,
            quality_ranking: row.quality_ranking || null,
            engagement_rate_ranking: row.engagement_rate_ranking || null,
            conversion_rate_ranking: row.conversion_rate_ranking || null,
            synced_at: nowIso,
          })
        }

        if (periodStatsToUpsert.length > 0) {
          const chunkSize = 500
          for (let i = 0; i < periodStatsToUpsert.length; i += chunkSize) {
            const chunk = periodStatsToUpsert.slice(i, i + chunkSize)
            const psRes = await safeUpsertWithExtendedColumns(
              "meta_period_stats",
              chunk,
              "entity_type,entity_id,start_date,end_date",
              ["result_type", "result_indicator", "optimization_goal", "attribution_window", "inline_link_clicks", "all_clicks", "purchase_value", "actions_json", "results_json"]
            )
            if (psRes.error) {
              console.warn(`[SYNC] Period stats upsert: ${psRes.error}`)
              partialFailures.push({ account_id: accountId, step: "meta_period_stats_upsert", error: psRes.error })
            }
          }
        }
      } catch (periodErr: any) {
        console.warn(`[SYNC] Period stats fetch failed for ${accountId}:`, periodErr.message)
        partialFailures.push({ account_id: accountId, step: "meta_period_stats", error: periodErr.message })
      }

      const breakdownExtract = (row: any) => {
        const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
        const campCtx = primaryAdsetMetaByCampaign.get(row.campaign_id)
        return extractMetaInsightMetrics(row, {
          rawObjective: rawObj,
          optimizationGoal: row.optimization_goal || campCtx?.optimizationGoal || null,
          destinationType: campCtx?.destinationType || null,
        })
      }

      // 7. Upsert breakdowns
      const demoToUpsert = demographics.map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const ex = breakdownExtract(row)
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          age_range: row.age || "unknown",
          gender: row.gender || "unknown",
          platform: row.publisher_platform || "facebook",
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          spend: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
        }
      }).filter(Boolean)

      if (demoToUpsert.length > 0) {
        const { error } = await supabase
          .from("demographic_metrics")
          .upsert(demoToUpsert, { onConflict: "campaign_id,date,age_range,gender,platform" })
        if (error) console.error(`[SYNC] Erro demographics ${accountId}:`, error.message)
        else totalDemographics += demoToUpsert.length
      }

      const hourlyToUpsert = (hourly || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const ex = breakdownExtract(row)
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          hour: row.hourly_stats_aggregated_by_advertiser_time_zone || "unknown",
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          spend: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
        }
      }).filter(Boolean)

      if (hourlyToUpsert.length > 0) {
        const { error } = await supabase
          .from("hourly_metrics")
          .upsert(hourlyToUpsert, { onConflict: "campaign_id,date,hour" })
        if (error) console.error(`[SYNC] Erro hourly_metrics ${accountId}:`, error.message)
      }

      const placementToUpsert = (placementData || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const ex = breakdownExtract(row)
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          platform: row.publisher_platform || "facebook",
          placement: row.platform_position || row.placement || "unknown",
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          spend: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
        }
      }).filter(Boolean)

      if (placementToUpsert.length > 0) {
        const { error } = await supabase
          .from("meta_placement_metrics")
          .upsert(placementToUpsert, { onConflict: "campaign_id,date,platform,placement" })
        if (error) console.error(`[SYNC] Erro placement_metrics ${accountId}:`, error.message)
      }

      const deviceToUpsert = (deviceData || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const ex = breakdownExtract(row)
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          platform: row.publisher_platform || "facebook",
          device: row.impression_device || "unknown",
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          spend: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
        }
      }).filter(Boolean)

      if (deviceToUpsert.length > 0) {
        const { error } = await supabase
          .from("meta_device_metrics")
          .upsert(deviceToUpsert, { onConflict: "campaign_id,date,platform,device" })
        if (error) console.error(`[SYNC] Erro device_metrics ${accountId}:`, error.message)
      }

      const regionToUpsert = (region || []).map((row: any) => {
        const campaign_id = idMap.get(row.campaign_id)
        if (!campaign_id) return null
        const ex = breakdownExtract(row)
        return {
          campaign_id,
          ad_account_id: accountId,
          date: row.date_start,
          region: row.region || "unknown",
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          spend: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
        }
      }).filter(Boolean)

      if (regionToUpsert.length > 0) {
        const { error } = await supabase
          .from("region_metrics")
          .upsert(regionToUpsert, { onConflict: "campaign_id,date,region" })
        if (error) console.error(`[SYNC] Erro region_metrics ${accountId}:`, error.message)
      }

      // 8. Upsert asset_metrics (AdSets e Ads) com contexto completo de optimization_goal & purchase_value
      const adsetMetricsToUpsert: Record<string, any>[] = []
      const adMetricsToUpsert: Record<string, any>[] = []

      for (const row of adsetInsights) {
        const ad_set_id = adsetIdMap.get(row.adset_id)
        if (!ad_set_id) continue
        const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
        const adsetCtx = adsetMetaById.get(row.adset_id)
        const optGoal = row.optimization_goal || adsetCtx?.optimizationGoal || null
        const ex = extractMetaInsightMetrics(row, {
          rawObjective: rawObj,
          optimizationGoal: optGoal,
          destinationType: adsetCtx?.destinationType || null,
        })
        adsetMetricsToUpsert.push({
          ad_set_id,
          date: row.date_start,
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          inline_link_clicks: ex.inlineLinkClicks,
          all_clicks: ex.allClicks,
          cost: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
          frequency: ex.frequency,
          raw_objective: rawObj,
          optimization_goal: optGoal,
          result_type: ex.category,
          result_indicator: ex.resultIndicator,
          attribution_window: adsetCtx?.attributionWindow || "unified_or_default",
          purchase_value: ex.purchaseValue ?? 0,
          actions_json: Array.isArray(row.actions) ? row.actions : null,
          results_json: Array.isArray(row.results) ? row.results : null,
          sync_version: SYNC_VERSION,
          video_p25: extractVideoMetric(row, "video_p25_watched_actions"),
          video_p50: extractVideoMetric(row, "video_p50_watched_actions"),
          video_p75: extractVideoMetric(row, "video_p75_watched_actions"),
          video_p95: extractVideoMetric(row, "video_p95_watched_actions"),
          video_views: extractVideoMetric(row, "video_view")
        })
      }

      for (const row of adInsights) {
        const ad_id = adIdMap.get(row.ad_id)
        if (!ad_id) continue
        const rawObj = row.objective || campaignObjectiveMap.get(row.campaign_id) || null
        const adsetCtx = adsetMetaById.get(row.adset_id) || primaryAdsetMetaByCampaign.get(row.campaign_id)
        const optGoal = row.optimization_goal || adsetCtx?.optimizationGoal || null
        const ex = extractMetaInsightMetrics(row, {
          rawObjective: rawObj,
          optimizationGoal: optGoal,
          destinationType: adsetCtx?.destinationType || null,
        })
        adMetricsToUpsert.push({
          ad_id,
          date: row.date_start,
          impressions: ex.impressions,
          clicks: ex.inlineLinkClicks,
          inline_link_clicks: ex.inlineLinkClicks,
          all_clicks: ex.allClicks,
          cost: ex.spend,
          conversions: ex.resultCount ?? 0,
          reach: ex.reach,
          frequency: ex.frequency,
          raw_objective: rawObj,
          optimization_goal: optGoal,
          result_type: ex.category,
          result_indicator: ex.resultIndicator,
          attribution_window: adsetCtx?.attributionWindow || "unified_or_default",
          purchase_value: ex.purchaseValue ?? 0,
          actions_json: Array.isArray(row.actions) ? row.actions : null,
          results_json: Array.isArray(row.results) ? row.results : null,
          sync_version: SYNC_VERSION,
          video_p25: extractVideoMetric(row, "video_p25_watched_actions"),
          video_p50: extractVideoMetric(row, "video_p50_watched_actions"),
          video_p75: extractVideoMetric(row, "video_p75_watched_actions"),
          video_p95: extractVideoMetric(row, "video_p95_watched_actions"),
          video_views: extractVideoMetric(row, "video_view")
        })
      }

      const extendedAssetKeys = ["raw_objective", "optimization_goal", "result_type", "result_indicator", "attribution_window", "inline_link_clicks", "all_clicks", "purchase_value", "actions_json", "results_json", "sync_version"]
      const chunkSize = 500
      for (let i = 0; i < adsetMetricsToUpsert.length; i += chunkSize) {
        const res = await safeUpsertWithExtendedColumns("asset_metrics", adsetMetricsToUpsert.slice(i, i + chunkSize), "ad_set_id, date", extendedAssetKeys)
        if (res.error) console.error(`[SYNC] Erro adset_metrics ${accountId}:`, res.error)
      }
      for (let i = 0; i < adMetricsToUpsert.length; i += chunkSize) {
        const res = await safeUpsertWithExtendedColumns("asset_metrics", adMetricsToUpsert.slice(i, i + chunkSize), "ad_id, date", extendedAssetKeys)
        if (res.error) console.error(`[SYNC] Erro ad_metrics ${accountId}:`, res.error)
      }

      // Atualizar last_sync da conta somente agora que os dados foram persistidos!
      if (!hasPartialErrors) {
        await supabase.from("ad_accounts").update({ last_sync: new Date().toISOString() }).eq("id", accountId)
      }
    }

    // Atualizar heartbeat apenas dos user_ids envolvidos no sync
    const syncStatus = apiErrors.length > 0 || partialFailures.length > 0 ? "partial_success" : "success"
    for (const uid of involvedUserIds) {
      await supabase.from("meta_ads_configs").update({
        is_connected: true,
        last_heartbeat_at: new Date().toISOString(),
        last_heartbeat_status: syncStatus,
        last_heartbeat_summary: {
          accounts: adAccounts.length,
          campaigns: totalCampaigns,
          metrics: totalMetrics,
          demographic_records: totalDemographics,
          partial_failures_count: partialFailures.length,
          sync_id: syncId,
          sync_version: SYNC_VERSION,
        }
      }).eq("user_id", uid)
    }

    // Atualizar histórico de sync com cobertura e eventuais falhas parciais
    if (syncHistoryId) {
      await safeUpsertWithExtendedColumns(
        "sync_history",
        [{
          id: syncHistoryId,
          user_id: userId,
          status: syncStatus,
          completed_at: new Date().toISOString(),
          accounts_synced: adAccounts.length,
          campaigns_synced: totalCampaigns,
          metrics_synced: totalMetrics,
          error_message: apiErrors.length > 0 ? apiErrors.join("; ") : null,
          sync_coverage: coverageByAccount,
          partial_failures: partialFailures,
          sync_version: SYNC_VERSION,
        }],
        "id",
        ["sync_coverage", "partial_failures", "sync_version"]
      )
    }

    const summary = {
      sync_id: syncId,
      sync_version: SYNC_VERSION,
      status: syncStatus,
      message: `Sync concluído: ${adAccounts.length} contas, ${totalCampaigns} campanhas, ${totalMetrics} métricas diárias, ${totalDemographics} demográficos.`,
      accounts: adAccounts.length,
      campaigns: totalCampaigns,
      metrics: totalMetrics,
      demographic_records: totalDemographics,
      coverage: coverageByAccount,
      partial_failures: partialFailures,
      errors: apiErrors,
      timestamp: new Date().toISOString()
    }

    console.log(`[SYNC ${syncId}] Concluído:`, JSON.stringify({ status: summary.status, accounts: summary.accounts, campaigns: summary.campaigns, metrics: summary.metrics, partial_failures: partialFailures.length }))

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

    // Somente marca erro nos user_ids realmente envolvidos nesta execução (nunca sobrescreve globalmente)
    if (involvedUserIds.length > 0) {
      try {
        await supabase.from("meta_ads_configs").update({
          last_heartbeat_at: new Date().toISOString(),
          last_heartbeat_status: "error",
          last_heartbeat_summary: { error: error.message, sync_id: syncId, sync_version: SYNC_VERSION }
        }).in("user_id", involvedUserIds)
      } catch (_) {}
    }

    return new Response(JSON.stringify({ error: error.stack || error.message, sync_id: syncId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
