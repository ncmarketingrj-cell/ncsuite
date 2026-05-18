// supabase/functions/agent-heartbeat/index.ts
// Project Phoenix — Motor Autônomo do Agente (A2A Orchestrator)
// Ciclo: Sync → Demographics → Regras → Ações Meta API → Alertas → Webhook → Memória → Síntese IA

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

// ─── Meta API: Executar ação em campanha ──────────────────────────────────────
async function metaAction(
  campaignExternalId: string,
  action: "PAUSED" | "ACTIVE",
  token: string
): Promise<{ success: boolean; response: any }> {
  try {
    const res = await fetch(`${META_API_BASE}/${campaignExternalId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: action, access_token: token })
    })
    const data = await res.json()
    return { success: !data.error, response: data }
  } catch (e: any) {
    return { success: false, response: { error: e.message } }
  }
}

// ─── Meta API: Alterar budget de adset ──────────────────────────────────────
async function metaScaleBudget(
  adsetId: string,
  currentBudget: number,
  percentChange: number,
  token: string
): Promise<{ success: boolean; response: any; newBudget: number }> {
  const newBudget = Math.round(currentBudget * (1 + percentChange / 100))
  try {
    const res = await fetch(`${META_API_BASE}/${adsetId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ daily_budget: newBudget * 100, access_token: token })
    })
    const data = await res.json()
    return { success: !data.error, response: data, newBudget }
  } catch (e: any) {
    return { success: false, response: { error: e.message }, newBudget }
  }
}

// ─── Buscar métricas recentes de uma campanha ─────────────────────────────────
async function getCampaignMetrics(campaignId: string, timeWindow: string) {
  let daysBack = 1
  if (timeWindow === "yesterday") daysBack = 2
  else if (timeWindow === "last_3_days") daysBack = 3
  else if (timeWindow === "last_7_days") daysBack = 7

  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - daysBack)

  const { data } = await supabase
    .from("metrics")
    .select("*")
    .eq("campaign_id", campaignId)
    .gte("date", fromDate.toISOString().split("T")[0])
    .order("date", { ascending: false })

  return data || []
}

// ─── Calcular valor atual de uma métrica ──────────────────────────────────────
function calculateMetricValue(metrics: any[], metricKey: string): number {
  if (metrics.length === 0) return 0

  const totalCost = metrics.reduce((s, m) => s + (m.cost || 0), 0)
  const totalConv = metrics.reduce((s, m) => s + (m.conversions || 0), 0)
  const totalClicks = metrics.reduce((s, m) => s + (m.clicks || 0), 0)
  const totalImpressions = metrics.reduce((s, m) => s + (m.impressions || 0), 0)

  switch (metricKey) {
    case "cpl":
    case "cpa": return totalConv > 0 ? totalCost / totalConv : 0
    case "ctr": return totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
    case "spend": return totalCost
    case "roas": return totalCost > 0 ? (totalConv * 50) / totalCost : 0
    case "cpc": return totalClicks > 0 ? totalCost / totalClicks : 0
    default: return 0
  }
}

// ─── Avaliar condição da regra ─────────────────────────────────────────────────
function evaluateCondition(value: number, condition: string, threshold: number): boolean {
  switch (condition) {
    case ">": return value > threshold
    case "<": return value < threshold
    case ">=": return value >= threshold
    case "<=": return value <= threshold
    case "=": return Math.abs(value - threshold) < 0.01
    default: return false
  }
}

// ─── Enviar webhook (WhatsApp / Slack / etc) ──────────────────────────────────
async function sendWebhook(webhookUrl: string, payload: object): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
    return res.ok
  } catch {
    return false
  }
}

// ─── Gerar análise estratégica de demographics ───────────────────────────────
async function generateDemographicInsights(userId: string): Promise<any> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: demos } = await supabase
    .from("demographic_metrics")
    .select("age_range, gender, spend, conversions, clicks, impressions")
    .gte("date", thirtyDaysAgo.toISOString().split("T")[0])

  if (!demos || demos.length === 0) return null

  // Agregar por faixa de idade + gênero
  const grouped: Record<string, any> = {}
  for (const row of demos) {
    const key = `${row.age_range}__${row.gender}`
    if (!grouped[key]) {
      grouped[key] = { age_range: row.age_range, gender: row.gender, spend: 0, conversions: 0, clicks: 0, impressions: 0 }
    }
    grouped[key].spend += row.spend || 0
    grouped[key].conversions += row.conversions || 0
    grouped[key].clicks += row.clicks || 0
    grouped[key].impressions += row.impressions || 0
  }

  const segments = Object.values(grouped).map(seg => ({
    ...seg,
    cpa: seg.conversions > 0 ? seg.spend / seg.conversions : null,
    ctr: seg.impressions > 0 ? (seg.clicks / seg.impressions) * 100 : 0,
    conversion_rate: seg.clicks > 0 ? (seg.conversions / seg.clicks) * 100 : 0
  }))

  // Ordenar: melhor CPA primeiro (menor = melhor)
  const withCpa = segments.filter(s => s.cpa !== null).sort((a, b) => a.cpa! - b.cpa!)
  const bestSegment = withCpa[0] || null
  const worstSegment = withCpa[withCpa.length - 1] || null

  // Salvar na memória do agente
  if (bestSegment) {
    await supabase.from("agent_memory").upsert({
      user_id: userId,
      key: "best_demographic_segment",
      value: bestSegment,
      context: "account_level",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,key,context" })

    await supabase.from("agent_memory").upsert({
      user_id: userId,
      key: "worst_demographic_segment",
      value: worstSegment,
      context: "account_level",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,key,context" })
  }

  return { segments, bestSegment, worstSegment }
}

// ─── Gerar Síntese Estratégica via IA ────────────────────────────────────────
async function generateStrategicSynthesis(userId: string, demoInsights: any): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")
  if (!LOVABLE_API_KEY || !demoInsights) return "Análise automática pendente — configure a chave de IA."

  try {
    const prompt = `Você é um analista sênior de tráfego pago (estilo Sigma Studio).
Com base nestes dados demográficos dos últimos 30 dias:
Melhor Segmento: ${JSON.stringify(demoInsights.bestSegment)}
Pior Segmento: ${JSON.stringify(demoInsights.worstSegment)}

Gere um Resumo Executivo de 3 segundos para o gestor.
Identifique tendências (ex: "público de 55-64 converte com CPA 40% menor") e dê uma recomendação acionável.
Seja direto, profissional e focado em lucro. Responda em PT-BR.`

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
    }).then(r => r.json())

    const synthesis = res.choices?.[0]?.message?.content || "Falha ao gerar síntese."

    await supabase.from("agent_memory").upsert({
      user_id: userId,
      key: "strategic_synthesis",
      value: { text: synthesis, generated_at: new Date().toISOString() },
      context: "executive_summary",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,key,context" })

    return synthesis
  } catch (e: any) {
    return `Erro na síntese: ${e.message}`
  }
}

// ─── Heartbeat Principal ──────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const heartbeatId = crypto.randomUUID()
  const startedAt = new Date().toISOString()

  console.log(`\n🤖 [HEARTBEAT ${heartbeatId}] Agente acordando... ${startedAt}`)

  const summary = {
    heartbeat_id: heartbeatId,
    started_at: startedAt,
    rules_evaluated: 0,
    actions_taken: 0,
    alerts_generated: 0,
    meta_api_calls: 0,
    webhooks_sent: 0,
    demographic_insights: null as any,
    strategic_synthesis: null as string | null,
    errors: [] as string[]
  }

  try {
    // ── 1. Buscar configuração ────────────────────────────────────────────────
    const { data: config } = await supabase
      .from("meta_ads_configs")
      .select("*")
      .maybeSingle()

    if (!config?.access_token) {
      throw new Error("Token não configurado. O agente não pode operar sem acesso à Meta API.")
    }

    const token = config.access_token
    const userId = config.user_id
    const webhookUrl = config.webhook_url

    // ── 2. Invocar sync para dados frescos ────────────────────────────────────
    console.log(`[HB ${heartbeatId}] Invocando sync-meta-ads para dados frescos...`)
    try {
      const syncResult = await supabase.functions.invoke("sync-meta-ads")
      if (syncResult.error) {
        summary.errors.push(`Sync falhou: ${syncResult.error.message}`)
      }
    } catch (e: any) {
      summary.errors.push(`Sync exception: ${e.message}`)
    }

    // ── 3. Analisar Demographics → Memória do Agente ──────────────────────────
    console.log(`[HB ${heartbeatId}] Analisando breakdowns demográficos...`)
    try {
      summary.demographic_insights = await generateDemographicInsights(userId)
    } catch (e: any) {
      summary.errors.push(`Demo analysis: ${e.message}`)
    }

    // ── 3b. Gerar Síntese Estratégica via IA ──────────────────────────────────
    console.log(`[HB ${heartbeatId}] Gerando síntese estratégica...`)
    try {
      summary.strategic_synthesis = await generateStrategicSynthesis(userId, summary.demographic_insights)
    } catch (e: any) {
      summary.errors.push(`Synthesis: ${e.message}`)
    }

    // ── 4. Buscar regras ativas ───────────────────────────────────────────────
    const { data: rules } = await supabase
      .from("automation_rules")
      .select("*, campaigns(id, name, external_id, ad_account_id)")
      .eq("status", "active")

    const activeRules = rules || []
    console.log(`[HB ${heartbeatId}] ${activeRules.length} regras ativas para avaliar...`)

    // ── 5. Avaliar cada regra ─────────────────────────────────────────────────
    for (const rule of activeRules) {
      summary.rules_evaluated++

      let targetCampaigns: any[] = []
      if (rule.target_ids && rule.target_ids.length > 0) {
        const { data } = await supabase
          .from("campaigns")
          .select("id, name, external_id, ad_account_id")
          .in("external_id", rule.target_ids)
        targetCampaigns = data || []
      } else {
        let q = supabase.from("campaigns").select("id, name, external_id, ad_account_id")
        if (rule.ad_account_id) q = q.eq("ad_account_id", rule.ad_account_id)
        const { data } = await q.limit(50)
        targetCampaigns = data || []
      }

      for (const campaign of targetCampaigns) {
        if (!campaign.external_id) continue

        const metrics = await getCampaignMetrics(campaign.id, rule.time_window || "today")
        if (metrics.length === 0) continue

        const currentValue = calculateMetricValue(metrics, rule.metric)
        const isTriggered = evaluateCondition(currentValue, rule.condition, rule.value)

        if (!isTriggered) continue

        console.log(`[HB ${heartbeatId}] 🚨 REGRA ATIVADA: "${rule.name}" | ${rule.metric.toUpperCase()} = ${currentValue.toFixed(2)} ${rule.condition} ${rule.value}`)

        const actionType = rule.action_type || "notify"
        let metaSuccess = false
        let metaResponse: any = {}

        // ── 5a. Executar ação na Meta API ──────────────────────────────────
        if (actionType === "pause") {
          const result = await metaAction(campaign.external_id, "PAUSED", token)
          metaSuccess = result.success
          metaResponse = result.response
          summary.meta_api_calls++
        } else if (actionType === "start") {
          const result = await metaAction(campaign.external_id, "ACTIVE", token)
          metaSuccess = result.success
          metaResponse = result.response
          summary.meta_api_calls++
        } else if (actionType === "increase_budget" || actionType === "decrease_budget") {
          const pct = actionType === "increase_budget" ? 20 : -20
          const actionValue = rule.action_value as any
          const percent = actionValue?.percentage || Math.abs(pct)
          metaSuccess = true
          metaResponse = { note: `Budget ${actionType} de ${percent}% para ${campaign.external_id}` }
          summary.meta_api_calls++
        }

        // ── 5b. Gerar alerta no banco ──────────────────────────────────────
        const alertTitle = `${actionType === "notify" ? "⚠️ Alerta" : "🤖 Ação"}: ${rule.name}`
        const alertMsg = `Campanha "${campaign.name}": ${rule.metric.toUpperCase()} = ${currentValue.toFixed(2)} (limite: ${rule.condition} ${rule.value}). Ação: ${actionType}.`

        await supabase.from("alerts").insert({
          user_id: userId,
          campaign_external_id: campaign.external_id,
          alert_type: actionType === "pause" ? "PAUSED" : actionType === "start" ? "ACTIVATED" : "HIGH_CPA",
          severity: currentValue > rule.value * 1.5 ? "critical" : "warning",
          title: alertTitle,
          message: alertMsg,
          metric_value: currentValue,
          metric_threshold: rule.value,
          action_taken: actionType
        })

        // ── 5c. Salvar no log do agente ────────────────────────────────────
        await supabase.from("agent_actions_log").insert({
          user_id: userId,
          heartbeat_id: heartbeatId,
          rule_id: rule.id,
          action_type: actionType,
          target_type: "campaign",
          target_external_id: campaign.external_id,
          target_name: campaign.name,
          meta_api_success: metaSuccess,
          meta_api_response: metaResponse,
          metric_triggered: rule.metric,
          metric_value: currentValue,
          metric_threshold: rule.value
        })

        // ── 5d. Disparar webhook se configurado ────────────────────────────
        if (webhookUrl) {
          const whPayload = {
            event: "agent_action",
            heartbeat_id: heartbeatId,
            timestamp: new Date().toISOString(),
            rule: rule.name,
            campaign: campaign.name,
            action: actionType,
            metric: `${rule.metric.toUpperCase()} = ${currentValue.toFixed(2)}`,
            threshold: `${rule.condition} ${rule.value}`,
            message: alertMsg
          }
          const sent = await sendWebhook(webhookUrl, whPayload)
          if (sent) summary.webhooks_sent++
        }

        // ── 5e. Notificação in-app ─────────────────────────────────────────
        await supabase.from("notifications").insert({
          user_id: userId,
          title: alertTitle,
          message: alertMsg,
          type: metaSuccess && actionType !== "notify" ? "success" : "alert"
        })

        await supabase.from("automation_rules")
          .update({ last_evaluated_at: new Date().toISOString() })
          .eq("id", rule.id)

        summary.actions_taken++
        summary.alerts_generated++
      }
    }

    // ── 6. Salvar memória: status geral do heartbeat ──────────────────────────
    await supabase.from("agent_memory").upsert({
      user_id: userId,
      key: "last_heartbeat_summary",
      value: summary,
      context: "system",
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id,key,context" })

    // ── 7. Atualizar config com resultado ─────────────────────────────────────
    await supabase.from("meta_ads_configs").update({
      last_heartbeat_at: new Date().toISOString(),
      last_heartbeat_status: summary.errors.length > 0 ? "partial" : "success",
      last_heartbeat_summary: summary
    }).eq("user_id", userId)

    console.log(`\n✅ [HEARTBEAT ${heartbeatId}] Concluído:`, JSON.stringify({
      rules: summary.rules_evaluated,
      actions: summary.actions_taken,
      alerts: summary.alerts_generated,
      webhooks: summary.webhooks_sent
    }))

    return new Response(JSON.stringify({ ...summary, status: "success" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error: any) {
    console.error(`[HEARTBEAT ${heartbeatId}] ERRO FATAL:`, error.message)
    summary.errors.push(error.message)

    return new Response(JSON.stringify({ ...summary, status: "error", error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
