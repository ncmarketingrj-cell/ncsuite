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

async function sendWhatsAppMessages(gatewayUrl: string, phones: string[], text: string) {
  if (!gatewayUrl || !phones || !phones.length) return;
  for (const phone of phones) {
    if (!phone) continue;
    try {
      let cleanPhone = phone.replace(/\D/g, "");
      if (!cleanPhone.endsWith("@c.us")) cleanPhone = `${cleanPhone}@c.us`;
      const res = await fetch(`${gatewayUrl}/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: cleanPhone, message: text })
      });
      if (!res.ok) throw new Error(`HTTP Status ${res.status}`);
      console.log(`[WHATSAPP] Enviado para ${cleanPhone}`);
    } catch (err: any) {
      console.error(`[WHATSAPP] Erro no disparo para ${phone}:`, err.message);
    }
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
      .select("whatsapp_phone, whatsapp_gateway_url, zero_delivery_enabled, zero_delivery_hour, perf_drop_enabled, perf_drop_spend_pct, client_cpa_enabled, alert_dedup_hours, user_id")
      .limit(1)
      .maybeSingle()

    const whatsappPhone = configMaster?.whatsapp_phone || ""
    const whatsappGateway = configMaster?.whatsapp_gateway_url || "http://localhost:3001"
    const zeroDeliveryEnabled = configMaster?.zero_delivery_enabled !== false
    const zeroDeliveryHour = configMaster?.zero_delivery_hour ?? 14
    const perfDropEnabled = configMaster?.perf_drop_enabled !== false
    const perfDropSpendPct = Number(configMaster?.perf_drop_spend_pct ?? 50)
    const clientCpaEnabled = configMaster?.client_cpa_enabled !== false
    const alertDedupHours = Number(configMaster?.alert_dedup_hours ?? 2)

    // [HIERARQUIA] Busca profiles para roteamento inteligente de WhatsApp
    const { data: profilesData } = await supabase.from("profiles").select("id, role, whatsapp_numbers")
    const adminPhones: string[] = []
    const userPhonesMap = new Map<string, string[]>()

    if (profilesData) {
      for (const p of profilesData) {
        const phones = p.whatsapp_numbers || []
        userPhonesMap.set(p.id, phones)
        if (["admin", "master_admin", "ceo"].includes(p.role) && phones.length > 0) {
          adminPhones.push(...phones)
        }
      }
    }
    // Adiciona o telefone global como fallback caso exista
    if (whatsappPhone) {
      adminPhones.push(whatsappPhone)
    }

    if (adminPhones.length > 0 || userPhonesMap.size > 0) {
      console.log(`[AUTO] Roteamento de WhatsApp ATIVO via ${whatsappGateway}. Admins encontrados: ${adminPhones.length}`)
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

    const nowUTC  = new Date()
    const brtTime = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000)
    const currentHourBrt = brtTime.getUTCHours()

    const last7DaysDate = new Date(brtTime.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    
    // Buscar métricas dos últimos 7 dias em chunks para evitar erro de URL muito grande
    const avg7dMap = new Map();
    if (campaigns && campaigns.length > 0) {
      const campIds = campaigns.map(c => c.id);
      for (let i = 0; i < campIds.length; i += 100) {
        const chunk = campIds.slice(i, i + 100);
        const { data: m7d } = await supabase
          .from("metrics")
          .select("campaign_id, cost, conversions, date")
          .gte("date", last7DaysDate)
          .lt("date", today)
          .in("campaign_id", chunk);
          
        if (m7d) {
          m7d.forEach(m => {
            const cur = avg7dMap.get(m.campaign_id) || { cost: 0, conv: 0, days: new Set() };
            cur.cost += Number(m.cost || 0);
            cur.conv += Number(m.conversions || 0);
            cur.days.add(m.date);
            avg7dMap.set(m.campaign_id, cur);
          });
        }
      }
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

        if (spend === 0) {
          // SMART TRIGGER: Zero Delivery (Falta de Entrega)
          if (zeroDeliveryEnabled && currentHourBrt >= zeroDeliveryHour && dailyBudget > 0) {
            alertsToInsert.push({
              user_id:     userId,
              title:       `⚠️ Sem Entrega (Zero Delivery) — ${campaign.name}`,
              message:     `A campanha está ATIVA mas gastou R$ 0,00 até agora (${currentHourBrt}h). Verifique o saldo, pagamentos ou rejeições de anúncios urgentes.`,
              type:        "alert",
              is_critical: true,
              link:        `/metricas?account=${campaign.ad_account_id}&campaign=${campaign.external_id}`,
              metadata: {
                account_id:      campaign.ad_account_id,
                campaign_id:     campaign.external_id,
                db_campaign_id:  campaign.id,
                campaign_name:   campaign.name,
                spend_today:     0,
                daily_budget:    dailyBudget,
                alert_type:      "ZERO_DELIVERY"
              }
            });
            console.log(`[AUTO] ⚠️ ALERTA ZERO DELIVERY: ${campaign.name}`);
          }
          continue; // Pula as outras regras já que spend é 0
        }

        if (spend < minSpend) {
          console.log(`[AUTO] ${campaign.name}: gasto R$${spend.toFixed(2)} < mínimo R$${minSpend.toFixed(2)} — ignorando regras de CPA`)
        } else {

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
        } // Fim do else de minSpend

        if (perfDropEnabled && hist7d && hist7d.days.size > 0 && currentHourBrt >= 14) {
          const avgDailyConv = hist7d.conv / 7;
          // Se a campanha costuma dar > 1 conversão/dia, já gastou mais de perfDropSpendPct hoje, e tem 0 conversões.
          if (avgDailyConv >= 1 && conversions === 0 && budgetUsedPct >= perfDropSpendPct) {
            alertsToInsert.push({
              user_id:     userId,
              title:       `📉 Queda de Performance — ${campaign.name}`,
              message:     `Anomalia: A campanha costuma gerar resultados, já gastou ${budgetUsedPct.toFixed(0)}% (R$ ${spend.toFixed(2)}) do diário, mas está com ZERO conversões hoje.`,
              type:        "alert",
              is_critical: true,
              link,
              metadata: {
                account_id:      targetAccId,
                campaign_id:     campaign.external_id,
                db_campaign_id:  campaign.id,
                campaign_name:   campaign.name,
                spend_today:     spend,
                budget_used_pct: budgetUsedPct,
                conversions_today: conversions,
                avg_daily_conv:  avgDailyConv,
                alert_type:      "PERFORMANCE_DROP"
              }
            });
            console.log(`[AUTO] ⚠️ ALERTA PERFORMANCE DROP: ${campaign.name}`);
          }
        }

        // Inserir alertas sem duplicatas do mesmo dia
        for (const alert of alertsToInsert) {
          const alertType = alert.metadata?.alert_type
          const keyWord   = alertType === 'HIGH_CPR'       ? result.metricLabel
                          : alertType === 'BUDGET_WARNING' ? 'Orçamento'
                          : alertType === 'PERFORMANCE_DROP' ? 'Queda de Performance'
                          : alertType === 'ZERO_DELIVERY' ? 'Sem Entrega'
                          : 'Frequência'

          const dedupLimitTime = new Date(Date.now() - alertDedupHours * 60 * 60 * 1000).toISOString()
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .gte("created_at", dedupLimitTime)
            .ilike("title", `%${campaign.name}%`)
            .ilike("message", `%${keyWord}%`)
            .limit(1)

          if (!existing?.length) {
            await supabase.from("notifications").insert(alert)
            totalAlerts++

            // ── Disparo Inteligente de WhatsApp ──
            const phonesToNotify = new Set<string>(adminPhones)
            if (userId) {
              const uPhones = userPhonesMap.get(userId) || []
              uPhones.forEach(p => phonesToNotify.add(p))
            }
            const targetPhones = Array.from(phonesToNotify)

            if (targetPhones.length > 0 && whatsappGateway) {
              const m = alert.metadata
              let text = ""
              if (alertType === "HIGH_CPR") {
                text = `🚨 *ALERTA ${m.metric_label} ALTO — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *${m.metric_label} Atual:* R$ ${m.cost_per_result?.toFixed(2)}\n🎯 *Limite:* R$ ${m.max_cpl?.toFixed(2)}\n💸 *Gasto hoje:* R$ ${m.spend_today?.toFixed(2)}\n✅ *${m.result_label}(s):* ${m.conversions_today}`
              } else if (alertType === "BUDGET_WARNING") {
                const semRes = m.conversions_today === 0 ? `\n⚠️ *Sem ${m.result_label?.toLowerCase()} registrado*` : ``
                text = `💸 *ALERTA ORÇAMENTO — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *Uso:* ${m.budget_used_pct?.toFixed(0)}%\n💵 *Gasto:* R$ ${m.spend_today?.toFixed(2)} de R$ ${m.daily_budget?.toFixed(2)}${semRes}`
              } else if (alertType === "ZERO_DELIVERY") {
                text = `⚠️ *ZERO ENTREGA (ALERTA) — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🔴 A campanha está ATIVA, passou das 14h e gastou R$ 0,00.\n🔍 *Verifique:* Saldo da conta, pagamentos ou anúncios rejeitados no Meta.`
              } else if (alertType === "PERFORMANCE_DROP") {
                text = `📉 *QUEDA DE PERFORMANCE — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🔴 *Anomalia Detectada!*\nA campanha gastou ${m.budget_used_pct?.toFixed(0)}% (R$ ${m.spend_today?.toFixed(2)}) e gerou ZERO conversões.\n📊 *Histórico (7D):* Média de ${m.avg_daily_conv?.toFixed(1)}/dia.`
              } else {
                text = `🔁 *ALERTA FREQUÊNCIA — NC PERFORMANCE*\n\n📣 *Campanha:* ${m.campaign_name}\n🎯 *Objetivo:* ${m.result_label}\n🔴 *Frequência:* ${m.frequency?.toFixed(1)}x (limite ${m.max_frequency}x)\n💸 *Gasto hoje:* R$ ${m.spend_today?.toFixed(2)}\n✅ *${m.result_label}(s):* ${m.conversions_today}`
              }
              await sendWhatsAppMessages(whatsappGateway, targetPhones, text)
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

    // ── MIGRADO DE meta-ads-monitor: Lógica de Target CPA por Cliente (7 Dias) ──
    try {
      if (clientCpaEnabled) {
        const { data: clients } = await supabase
          .from("clients")
          .select("id, name, meta_ad_account_id, target_cpa, user_id")
          .not("meta_ad_account_id", "is", null);

        if (clients && clients.length > 0) {
          for (const client of clients) {
            if (!client.target_cpa || client.target_cpa <= 0) continue;

            let accountCost = 0;
            let accountConv = 0;
            
            // Somar as métricas de 7 dias (avg7dMap) de todas as campanhas da conta do cliente
            const clientCampaigns = campaigns?.filter(c => c.ad_account_id === client.meta_ad_account_id) || [];
            for (const c of clientCampaigns) {
              const hist = avg7dMap.get(c.id);
              if (hist) {
                accountCost += hist.cost;
                accountConv += hist.conv;
              }
            }

            if (accountCost > 0) {
              const dedupLimitTime = new Date(Date.now() - alertDedupHours * 60 * 60 * 1000).toISOString()
              if (accountConv > 0) {
                const currentCpa = accountCost / accountConv;
                if (currentCpa > client.target_cpa) {
                  const msg = `O CPA da conta (R$ ${currentCpa.toFixed(2)}) nos últimos 7 dias está acima do limite aceitável (R$ ${client.target_cpa.toFixed(2)}). Gasto: R$ ${accountCost.toFixed(2)} para ${accountConv} conversões.`;
                  
                  // Checar duplicata no intervalo
                  const { data: existingClientAlert } = await supabase
                    .from("notifications")
                    .select("id")
                    .eq("type", "alert")
                    .ilike("title", `%CPA Crítico — Cliente ${client.name}%`)
                    .gte("created_at", dedupLimitTime)
                    .limit(1);

                  if (!existingClientAlert?.length) {
                    await supabase.from("notifications").insert({
                      user_id:     client.user_id || configMaster?.user_id || '00000000-0000-0000-0000-000000000000',
                      title:       `🔴 CPA Crítico — Cliente ${client.name}`,
                      message:     msg,
                      type:        "alert",
                      is_critical: true,
                      link:        `/metricas?account=${client.meta_ad_account_id}`,
                      metadata:    { alert_type: "CLIENT_HIGH_CPA", client_id: client.id, spend: accountCost, conv: accountConv }
                    });
                    totalAlerts++;
                    
                    // Roteamento de WhatsApp hierárquico
                    const waMsg = `🔴 *CPA CRÍTICO — CLIENTE ${client.name}*\n\n${msg}`;
                    const recipientPhones = new Set<string>();
                    const cUser = client.user_id || configMaster?.user_id;
                    if (cUser) {
                      const uPhones = userPhonesMap.get(cUser) || [];
                      uPhones.forEach(p => recipientPhones.add(p));
                    }
                    adminPhones.forEach(p => recipientPhones.add(p));

                    if (recipientPhones.size > 0 && whatsappGateway) {
                      await sendWhatsAppMessages(whatsappGateway, Array.from(recipientPhones), waMsg);
                    }
                    console.log(`[AUTO] ⚠️ ALERTA CLIENT CPA: ${client.name} (R$${currentCpa.toFixed(2)} > R$${client.target_cpa.toFixed(2)})`);
                  }
                }
              } else if (accountCost > client.target_cpa) {
                // Sem conversões mas gastou mais que o CPA Alvo
                const msg = `Gasto de R$ ${accountCost.toFixed(2)} nos últimos 7 dias sem NENHUMA conversão registrada. (CPA Alvo: R$ ${client.target_cpa.toFixed(2)}).`;
                
                const { data: existingClientAlert } = await supabase
                  .from("notifications")
                  .select("id")
                  .eq("type", "alert")
                  .ilike("title", `%Alerta de Gasto — Cliente ${client.name}%`)
                  .gte("created_at", dedupLimitTime)
                  .limit(1);

                if (!existingClientAlert?.length) {
                  await supabase.from("notifications").insert({
                    user_id:     client.user_id || configMaster?.user_id || '00000000-0000-0000-0000-000000000000',
                    title:       `🔴 Alerta de Gasto — Cliente ${client.name}`,
                    message:     msg,
                    type:        "alert",
                    is_critical: true,
                    link:        `/metricas?account=${client.meta_ad_account_id}`,
                    metadata:    { alert_type: "CLIENT_NO_CONV", client_id: client.id, spend: accountCost }
                  });
                  totalAlerts++;
                  
                  // Roteamento de WhatsApp hierárquico
                  const waMsg = `🔴 *ALERTA DE GASTO — CLIENTE ${client.name}*\n\n${msg}`;
                  const recipientPhones = new Set<string>();
                  const cUser = client.user_id || configMaster?.user_id;
                  if (cUser) {
                    const uPhones = userPhonesMap.get(cUser) || [];
                    uPhones.forEach(p => recipientPhones.add(p));
                  }
                  adminPhones.forEach(p => recipientPhones.add(p));

                  if (recipientPhones.size > 0 && whatsappGateway) {
                    await sendWhatsAppMessages(whatsappGateway, Array.from(recipientPhones), waMsg);
                  }
                  console.log(`[AUTO] ⚠️ ALERTA CLIENT NO CONV: ${client.name}`);
                }
              }
            }
          }
        }
      }
    } catch (clientErr: any) {
      console.error("[AUTO] Erro ao processar Target CPA de Clientes:", clientErr.message);
    }

    // ── NOVO: Monitoramento de Alertas de Redes Sociais (Social Media) ──────────
    try {
      console.log("[AUTO] Iniciando verificação de alertas de Redes Sociais...")
      const { data: socialRules } = await supabase
        .from("alert_thresholds")
        .select("*, social_pages(*)")
        .not("social_page_id", "is", null)
        .eq("is_active", true);

      if (socialRules && socialRules.length > 0) {
        for (const rule of socialRules) {
          const page = rule.social_pages;
          if (!page) continue;

          const alertsToInsert: any[] = [];
          const userId = rule.user_id;

          // 1. Seguidores Mínimos
          if (rule.min_ig_followers && page.instagram_followers < rule.min_ig_followers) {
            alertsToInsert.push({
              user_id: userId,
              title: `📉 Seguidores IG Baixo — ${page.page_name}`,
              message: `Os seguidores do Instagram (${page.instagram_followers}) caíram abaixo do limite configurado de ${rule.min_ig_followers}.`,
              type: "social_media_alert",
              is_critical: true,
              link: `/social-insights`,
              metadata: { alert_type: "MIN_IG_FOLLOWERS", page_id: page.id, current: page.instagram_followers, min: rule.min_ig_followers }
            });
          }

          if (rule.min_fb_followers && page.facebook_followers < rule.min_fb_followers) {
            alertsToInsert.push({
              user_id: userId,
              title: `📉 Seguidores FB Baixo — ${page.page_name}`,
              message: `Os seguidores do Facebook (${page.facebook_followers}) caíram abaixo do limite configurado de ${rule.min_fb_followers}.`,
              type: "social_media_alert",
              is_critical: true,
              link: `/social-insights`,
              metadata: { alert_type: "MIN_FB_FOLLOWERS", page_id: page.id, current: page.facebook_followers, min: rule.min_fb_followers }
            });
          }

          // 2. Dias sem Postar (Inatividade)
          if (rule.max_days_without_posts) {
            // Buscar último post publicado
            const { data: lastPosts } = await supabase
              .from("social_posts")
              .select("published_at")
              .eq("page_id", page.page_id)
              .eq("status", "published")
              .order("published_at", { ascending: false })
              .limit(1);

            let daysWithout = 999;
            if (lastPosts && lastPosts.length > 0 && lastPosts[0].published_at) {
              const diffMs = Date.now() - new Date(lastPosts[0].published_at).getTime();
              daysWithout = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            }

            if (daysWithout > rule.max_days_without_posts) {
              alertsToInsert.push({
                user_id: userId,
                title: `📭 Inatividade de Posts — ${page.page_name}`,
                message: `O perfil está há ${daysWithout} dias sem novas postagens (limite máximo: ${rule.max_days_without_posts} dias).`,
                type: "social_media_alert",
                is_critical: false,
                link: `/organizador`,
                metadata: { alert_type: "MAX_DAYS_WITHOUT_POSTS", page_id: page.id, days_without: daysWithout, max: rule.max_days_without_posts }
              });
            }
          }

          // 3. Taxa de Engajamento Mínima
          if (rule.min_post_engagement_rate && page.instagram_followers > 0) {
            // Média de engajamento dos últimos 5 posts
            const { data: recentPosts } = await supabase
              .from("social_posts")
              .select("likes_count, comments_count")
              .eq("page_id", page.page_id)
              .eq("status", "published")
              .order("published_at", { ascending: false })
              .limit(5);

            if (recentPosts && recentPosts.length > 0) {
              const totalEngagement = recentPosts.reduce((acc, p) => acc + (p.likes_count || 0) + (p.comments_count || 0), 0);
              const avgEngagementPerPost = totalEngagement / recentPosts.length;
              const engagementRate = (avgEngagementPerPost / page.instagram_followers) * 100;

              if (engagementRate < rule.min_post_engagement_rate) {
                alertsToInsert.push({
                  user_id: userId,
                  title: `📉 Engajamento Baixo — ${page.page_name}`,
                  message: `A taxa média de engajamento recente (${engagementRate.toFixed(2)}%) está abaixo da meta de ${rule.min_post_engagement_rate}%.`,
                  type: "social_media_alert",
                  is_critical: false,
                  link: `/social-insights`,
                  metadata: { alert_type: "MIN_POST_ENGAGEMENT_RATE", page_id: page.id, rate: engagementRate, min: rule.min_post_engagement_rate }
                });
              }
            }
          }

          // Inserir alertas de Social Media respeitando o de-duplicador
          for (const alert of alertsToInsert) {
            const dedupLimitTime = new Date(Date.now() - alertDedupHours * 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
              .from("notifications")
              .select("id")
              .eq("user_id", userId)
              .gte("created_at", dedupLimitTime)
              .ilike("title", `%${alert.title}%`)
              .limit(1);

            if (!existing?.length) {
              await supabase.from("notifications").insert(alert);
              totalAlerts++;

              // Roteamento inteligente de WhatsApp
              const cleanTitle = alert.title.replace(/[🚨⚠️🔴📭📉🔁⚡🌅💸]/g, "").trim();
              const waMsg = `📱 *ALERTA REDE SOCIAL: ${cleanTitle}*\n\n${alert.message}\n\nNC Suite Dashboard`;
              
              const recipientPhones = new Set<string>();
              // Envia para o criador
              const creatorPhones = userPhonesMap.get(userId) || [];
              creatorPhones.forEach(ph => recipientPhones.add(ph));
              // Cópia para admins/chefes
              adminPhones.forEach(ph => recipientPhones.add(ph));

              if (recipientPhones.size > 0 && whatsappGateway) {
                await sendWhatsAppMessages(whatsappGateway, Array.from(recipientPhones), waMsg);
              }
            }
          }
        }
      }
    } catch (socialErr: any) {
      console.error("[AUTO] Erro ao processar alertas de Redes Sociais:", socialErr.message);
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
