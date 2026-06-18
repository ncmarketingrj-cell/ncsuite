// supabase/functions/run-automations/index.ts
// NC Performance Suite — Motor de Alertas por Objetivo de Campanha

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
)

async function sendWhatsAppMessage(gatewayUrl: string, phone: string, text: string) {
  if (!phone || !gatewayUrl) return;
  try {
    let cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone.endsWith("@c.us")) cleanPhone = `${cleanPhone}@c.us`;
    const res = await fetch(`${gatewayUrl}/send-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: cleanPhone, message: text })
    });
    if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
    console.log(`[WHATSAPP] Enviado:`, await res.json());
  } catch (err: any) {
    console.error(`[WHATSAPP] Erro:`, err.message);
  }
}

// Classifica o objetivo da campanha em label legível + sigla de custo
function getResultInfo(resultType: string | null | undefined): {
  label: string        // ex: "Lead", "Compra", "Clique"
  metricLabel: string  // ex: "CPL", "CPA", "CPC"
  emoji: string
} {
  const t = (resultType || "").toUpperCase()

  if (["OUTCOME_LEADS", "LEAD_GENERATION"].includes(t))
    return { label: "Lead", metricLabel: "CPL", emoji: "👤" }

  if (["MESSAGES", "OUTCOME_ENGAGEMENT", "MESSAGING_CONVERSATION_STARTED_BY_PERSON", "MESSAGING_FIRST_REPLY"].includes(t))
    return { label: "Conversa", metricLabel: "Custo/Conversa", emoji: "💬" }

  if (["CONVERSIONS", "OUTCOME_SALES"].includes(t))
    return { label: "Compra", metricLabel: "CPA", emoji: "🛒" }

  if (["OUTCOME_TRAFFIC", "LINK_CLICKS"].includes(t))
    return { label: "Clique no Link", metricLabel: "CPC", emoji: "🖱️" }

  if (["VIDEO_VIEWS", "OUTCOME_VIDEO_VIEWS", "THRUPLAY"].includes(t))
    return { label: "Visualização", metricLabel: "CPV", emoji: "🎬" }

  if (["OUTCOME_AWARENESS", "REACH", "POST_REACH", "BRAND_AWARENESS"].includes(t))
    return { label: "Alcance", metricLabel: "CPM", emoji: "👁️" }

  if (["POST_ENGAGEMENT", "PAGE_LIKES", "ENGAGED_USERS"].includes(t))
    return { label: "Engajamento", metricLabel: "CPE", emoji: "❤️" }

  if (["APP_INSTALLS", "OUTCOME_APP_PROMOTION"].includes(t))
    return { label: "Instalação", metricLabel: "CPI", emoji: "📱" }

  return { label: "Resultado", metricLabel: "Custo/Resultado", emoji: "📊" }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log("[AUTO] Motor de alertas iniciado...")

  try {
    const { data: configMaster } = await supabase
      .from("meta_ads_configs")
      .select("whatsapp_phone, whatsapp_gateway_url")
      .limit(1)
      .maybeSingle()

    const whatsappPhone = configMaster?.whatsapp_phone || ""
    const whatsappGateway = configMaster?.whatsapp_gateway_url || "http://localhost:3001"

    if (whatsappPhone) {
      console.log(`[AUTO] WhatsApp ATIVO para ${whatsappPhone} via ${whatsappGateway}`)
    }

    const { data: thresholds, error: thErr } = await supabase
      .from("alert_thresholds")
      .select("*, ad_accounts(name, currency), min_spend_threshold, alert_cpl_enabled, alert_budget_enabled, alert_frequency_enabled")
      .eq("is_active", true)

    if (thErr || !thresholds?.length) {
      console.log("[AUTO] Nenhum threshold configurado.")
      return new Response(JSON.stringify({ status: "ok", alerts: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Data de hoje no fuso de Brasília (BRT)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric', month: '2-digit', day: '2-digit'
    })
    const parts = formatter.formatToParts(new Date())
    const today = `${parts.find(p => p.type === 'year')?.value}-${parts.find(p => p.type === 'month')?.value}-${parts.find(p => p.type === 'day')?.value}`

    let totalAlerts = 0

    // Buscar todas as campanhas ativas
    const { data: campaigns, error: campErr } = await supabase
      .from("campaigns")
      .select("id, name, status, external_id, daily_budget, budget_currency, ad_account_id, objective")
      .in("status", ["active", "ACTIVE"])

    if (campErr) {
      console.error("[AUTO] Erro ao buscar campanhas:", campErr.message)
    }

    if (campaigns && campaigns.length > 0) {
      for (const campaign of campaigns) {
        // Encontrar a regra mais específica para a campanha
        const specificRule = thresholds.find(t => t.campaign_id === campaign.id);
        const accountRule  = thresholds.find(t => t.ad_account_id === campaign.ad_account_id && !t.campaign_id);
        const globalRule   = thresholds.find(t => !t.ad_account_id && !t.campaign_id);

        const activeRule = specificRule || accountRule || globalRule;
        if (!activeRule) continue;

        // Regra global/conta: pula se a conta estiver na lista de exclusão do threshold
        if (!activeRule.campaign_id && activeRule.excluded_account_ids && activeRule.excluded_account_ids.includes(campaign.ad_account_id)) {
          console.log(`[AUTO] Campanha ${campaign.name} ignorada (conta ${campaign.ad_account_id} está nas exclusões do threshold)`)
          continue;
        }

        const userId = activeRule.user_id
        const maxCpl = activeRule.max_cpl
        const maxBudgetPct = activeRule.max_budget_pct
        const maxFrequency = activeRule.max_frequency
        const minSpend = Number(activeRule.min_spend_threshold || 0)
        const cplEnabled = activeRule.alert_cpl_enabled !== false
        const budgetEnabled = activeRule.alert_budget_enabled !== false
        const freqEnabled = activeRule.alert_frequency_enabled !== false

        const ruleType = specificRule ? "Campanha" : (accountRule ? "Conta" : "Global")
        const accountName = (activeRule.ad_accounts as any)?.name || campaign.ad_account_id || "Global"

        // Métricas de hoje da tabela metrics (tem result_type e frequency)
        const { data: metricsRows } = await supabase
          .from("metrics")
          .select("cost, conversions, impressions, reach, clicks, result_type, frequency")
          .eq("campaign_id", campaign.id)
          .eq("date", today)

        if (!metricsRows?.length) continue

        const spend       = metricsRows.reduce((s, m) => s + Number(m.cost || 0), 0)
        const conversions = metricsRows.reduce((s, m) => s + Number(m.conversions || 0), 0)

        if (spend === 0) continue
        if (spend < minSpend) {
          console.log(`[AUTO] ${campaign.name}: gasto R$${spend.toFixed(2)} < mínimo R$${minSpend.toFixed(2)} — ignorando`)
          continue
        }

        // Frequência: média das linhas com valor registrado
        const freqRows  = metricsRows.filter(m => Number(m.frequency) > 0)
        const frequency = freqRows.length > 0
          ? freqRows.reduce((s, m) => s + Number(m.frequency), 0) / freqRows.length
          : 0

        // Tipo de resultado: prefere result_type da métrica, fallback ao objective da campanha
        const rawType   = metricsRows[0]?.result_type || campaign.objective || null
        const result    = getResultInfo(rawType)

        const dailyBudget   = campaign.daily_budget || 0
        const budgetUsedPct = dailyBudget > 0 ? (spend / dailyBudget) * 100 : 0

        // Custo por resultado — indefinido quando não há resultados
        const costPerResult = conversions > 0 ? spend / conversions : null

        console.log(`[AUTO] ${campaign.name} [${result.label}] (Regra ${ruleType}): R$${spend.toFixed(2)} | ${conversions} ${result.label}(s) | ${result.metricLabel}: ${costPerResult ? `R$${costPerResult.toFixed(2)}` : 'N/A'} | Freq: ${frequency.toFixed(2)} | Budget: ${budgetUsedPct.toFixed(0)}%`)

        const targetAccId = campaign.ad_account_id || activeRule.ad_account_id || ""
        const link        = `/metricas?account=${targetAccId}&campaign=${campaign.external_id}`
        const alertsToInsert: any[] = []

        // ── Alerta de custo por resultado elevado ─────────────────────────────
        if (cplEnabled && maxCpl && costPerResult !== null && costPerResult > maxCpl) {
          alertsToInsert.push({
            user_id:     userId,
            title:       `🚨 ${result.metricLabel} Alto — ${campaign.name}`,
            message:     `${result.metricLabel} hoje R$${costPerResult.toFixed(2)} ultrapassou o limite de R$${maxCpl.toFixed(2)}. Gasto: R$${spend.toFixed(2)} | ${conversions} ${result.label}(s). Intervenha imediatamente.`,
            type:        "alert",
            is_critical: true,
            link,
            metadata: {
              account_id:      targetAccId,
              campaign_id:     campaign.external_id,
              db_campaign_id:  campaign.id,
              campaign_name:   campaign.name,
              result_type:     rawType,
              result_label:    result.label,
              metric_label:    result.metricLabel,
              cost_per_result: costPerResult,
              max_cpl:         maxCpl,
              spend_today:     spend,
              conversions_today: conversions,
              alert_type:      "HIGH_CPR"
            }
          })
          console.log(`[AUTO] ⚠️ ALERTA ${result.metricLabel}: ${campaign.name} → R$${costPerResult.toFixed(2)} > R$${maxCpl.toFixed(2)}`)
        }

        // ── Alerta de orçamento ───────────────────────────────────────────────
        if (budgetEnabled && maxBudgetPct !== null && dailyBudget > 0 && budgetUsedPct >= maxBudgetPct) {
          const semResultado = conversions === 0 ? ` sem nenhum(a) ${result.label.toLowerCase()}` : ""
          alertsToInsert.push({
            user_id:     userId,
            title:       `💸 Orçamento ${budgetUsedPct.toFixed(0)}% — ${campaign.name}`,
            message:     `R$${spend.toFixed(2)} de R$${dailyBudget.toFixed(2)} gastos hoje (${budgetUsedPct.toFixed(0)}%${semResultado}). Clique para monitorar.`,
            type:        "alert",
            is_critical: true,
            link,
            metadata: {
              account_id:       targetAccId,
              campaign_id:      campaign.external_id,
              db_campaign_id:   campaign.id,
              campaign_name:    campaign.name,
              result_type:      rawType,
              result_label:     result.label,
              spend_today:      spend,
              daily_budget:     dailyBudget,
              budget_used_pct:  budgetUsedPct,
              conversions_today: conversions,
              alert_type:       "BUDGET_WARNING"
            }
          })
          console.log(`[AUTO] ⚠️ ALERTA BUDGET: ${campaign.name} → ${budgetUsedPct.toFixed(0)}% | ${conversions} ${result.label}(s)`)
        }

        // ── Alerta de frequência elevada ──────────────────────────────────────
        if (freqEnabled && maxFrequency && frequency > 0 && frequency > maxFrequency) {
          alertsToInsert.push({
            user_id:     userId,
            title:       `🔁 Frequência Alta — ${campaign.name}`,
            message:     `Frequência ${frequency.toFixed(1)}x ultrapassou o limite de ${maxFrequency}x. Audiência saturando — expanda o público ou renove os criativos. Gasto: R$${spend.toFixed(2)} | ${conversions} ${result.label}(s).`,
            type:        "alert",
            is_critical: false,
            link,
            metadata: {
              account_id:       targetAccId,
              campaign_id:      campaign.external_id,
              db_campaign_id:   campaign.id,
              campaign_name:    campaign.name,
              frequency,
              max_frequency:    maxFrequency,
              spend_today:      spend,
              conversions_today: conversions,
              result_label:     result.label,
              alert_type:       "HIGH_FREQUENCY"
            }
          })
          console.log(`[AUTO] ⚠️ ALERTA FREQUÊNCIA: ${campaign.name} → ${frequency.toFixed(1)}x > ${maxFrequency}x`)
        }

        // Inserir alertas sem duplicatas do mesmo dia
        for (const alert of alertsToInsert) {
          const alertType = alert.metadata?.alert_type
          const keyWord   = alertType === 'HIGH_CPR'       ? result.metricLabel
                          : alertType === 'BUDGET_WARNING' ? 'Orçamento'
                          : 'Frequência'

          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .gte("created_at", `${today}T00:00:00Z`)
            .ilike("title", `%${campaign.name}%`)
            .ilike("message", `%${keyWord}%`)
            .limit(1)

          if (!existing?.length) {
            await supabase.from("notifications").insert(alert)
            totalAlerts++

            if (whatsappPhone) {
              const m = alert.metadata
              let text = ""
              if (alertType === "HIGH_CPR") {
                text = `🚨 *ALERTA ${m.metric_label} ALTO — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *${m.metric_label} Atual:* R$ ${m.cost_per_result?.toFixed(2)}\n🎯 *Limite:* R$ ${m.max_cpl?.toFixed(2)}\n💸 *Gasto hoje:* R$ ${m.spend_today?.toFixed(2)}\n✅ *${m.result_label}(s):* ${m.conversions_today}`
              } else if (alertType === "BUDGET_WARNING") {
                const semRes = m.conversions_today === 0 ? `\n⚠️ *Sem ${m.result_label?.toLowerCase()} registrado*` : ``
                text = `💸 *ALERTA ORÇAMENTO — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *Uso:* ${m.budget_used_pct?.toFixed(0)}%\n💵 *Gasto:* R$ ${m.spend_today?.toFixed(2)} de R$ ${m.daily_budget?.toFixed(2)}${semRes}`
              } else {
                text = `🔁 *ALERTA FREQUÊNCIA — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *Frequência:* ${m.frequency?.toFixed(1)}x (limite ${m.max_frequency}x)\n💸 *Gasto hoje:* R$ ${m.spend_today?.toFixed(2)}\n✅ *${m.result_label}(s):* ${m.conversions_today}`
              }
              await sendWhatsAppMessage(whatsappGateway, whatsappPhone, text)
            }
          } else {
            console.log(`[AUTO] Duplicata ignorada: ${campaign.name} (${alertType})`)
          }
        }
      }
    }

    // Regras manuais de automação legadas
    const { data: activeAccounts } = await supabase.from("ad_accounts").select("id, name")
    for (const acc of activeAccounts || []) {
      const { data: rules } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("status", "active")
        .eq("ad_account_id", acc.id)

      for (const rule of rules || []) {
        if (rule.is_active === false) continue;

        const { data: campaignMetrics } = await supabase
          .from("metrics")
          .select("cost, conversions, clicks, impressions, campaign_id")
          .eq("date", today)
          .in("campaign_id", (
            await supabase.from("campaigns").select("id").eq("ad_account_id", acc.id)
          ).data?.map((c: any) => c.id) || [])

        if (!campaignMetrics?.length) continue

        const totalCost   = campaignMetrics.reduce((acc, m) => acc + (m.cost || 0), 0)
        const totalConv   = campaignMetrics.reduce((acc, m) => acc + (m.conversions || 0), 0)
        const totalClicks = campaignMetrics.reduce((acc, m) => acc + (m.clicks || 0), 0)
        const totalImp    = campaignMetrics.reduce((acc, m) => acc + (m.impressions || 0), 0)

        let valorAtual = 0
        if (rule.metric === "cpl" || rule.metric === "cpa") {
          valorAtual = totalCost / (totalConv || 1)
        } else if (rule.metric === "spend") {
          valorAtual = totalCost
        } else if (rule.metric === "ctr") {
          valorAtual = totalImp > 0 ? (totalClicks / totalImp) * 100 : 0
        }

        const isTriggered =
          (rule.condition === ">"  && valorAtual >  rule.value) ||
          (rule.condition === "<"  && valorAtual <  rule.value) ||
          (rule.condition === ">=" && valorAtual >= rule.value)

        if (isTriggered) {
          await supabase.from("notifications").insert({
            user_id:     rule.user_id,
            title:       `⚡ Regra: ${rule.name}`,
            message:     `${rule.metric.toUpperCase()} atual ${valorAtual.toFixed(2)} ${rule.condition} ${rule.value}. Condição atingida na conta ${acc.name}.`,
            type:        "alert",
            is_critical: true,
            link:        `/metricas?account=${acc.id}`
          })
          totalAlerts++

          await supabase.from("automation_rules")
            .update({ last_evaluated_at: new Date().toISOString() })
            .eq("id", rule.id)
        }
      }
    }

    // Resumo diário D-1 às 08h BRT
    try {
      const nowUTC  = new Date()
      const brtTime = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000)

      if (brtTime.getUTCHours() >= 8) {
        const yesterday    = new Date(brtTime.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayStr = yesterday.toISOString().split('T')[0]

        const { data: cfg } = await supabase.from("meta_ads_configs").select("user_id").limit(1).maybeSingle()
        const adminUserId = cfg?.user_id

        if (adminUserId) {
          const { data: existingSummary } = await supabase
            .from("notifications")
            .select("id")
            .eq("type", "success")
            .eq("metadata->>alert_type", "DAILY_SUMMARY_D1")
            .eq("metadata->>summary_date", yesterdayStr)
            .limit(1)

          if (!existingSummary?.length) {
            const { data: ym } = await supabase
              .from("metrics")
              .select("cost, conversions, reach")
              .eq("date", yesterdayStr)

            if (ym && ym.length > 0) {
              const totalSpend = ym.reduce((acc, m) => acc + (m.cost || 0), 0)
              const totalConv  = ym.reduce((acc, m) => acc + (m.conversions || 0), 0)
              const totalReach = ym.reduce((acc, m) => acc + (m.reach || 0), 0)

              if (totalSpend > 0) {
                const yParts   = yesterdayStr.split("-")
                const dayY     = parseInt(yParts[2])
                const monthsPT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"]
                const monthPT  = monthsPT[parseInt(yParts[1]) - 1]

                await supabase.from("notifications").insert({
                  user_id:     adminUserId,
                  title:       `🌅 Fechamento: ${dayY} de ${monthPT}`,
                  message:     `Resumo D-1: R$ ${totalSpend.toFixed(2)} investidos em todas as contas. ${totalConv} resultados totais | Alcance: ${totalReach.toLocaleString("pt-BR")}. Bom dia!`,
                  type:        "success",
                  is_critical: false,
                  link:        `/dashboard`,
                  metadata:    { alert_type: "DAILY_SUMMARY_D1", summary_date: yesterdayStr, spend: totalSpend, conversions: totalConv }
                })

                if (whatsappPhone) {
                  await sendWhatsAppMessage(whatsappGateway, whatsappPhone,
                    `🌅 *FECHAMENTO DIÁRIO — NC PERFORMANCE*\n\n📅 *Período:* Ontem (${dayY} de ${monthPT})\n💸 *Total Investido:* R$ ${totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n🎯 *Resultados Totais:* ${totalConv}\n👥 *Alcance Total:* ${totalReach.toLocaleString("pt-BR")}\n\nBom dia e ótimas campanhas! 🚀`
                  )
                }

                totalAlerts++
                console.log(`[AUTO] ✅ Resumo D-1 (${yesterdayStr}) gerado.`)
              }
            }
          }
        }
      }
    } catch (summaryErr: any) {
      console.error("[AUTO] Erro ao gerar resumo D-1:", summaryErr.message)
    }

    console.log(`[AUTO] Concluído. ${totalAlerts} alertas gerados.`)

    return new Response(JSON.stringify({
      status: "ok",
      alerts: totalAlerts,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error: any) {
    console.error("[AUTO] ERRO:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500
    })
  }
})
