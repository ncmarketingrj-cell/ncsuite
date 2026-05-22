// supabase/functions/run-automations/index.ts
// NC Performance Suite — Motor de Alertas de CPL e Orçamento Diário

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

// Helper sênior para disparo de mensagens via Gateway WhatsApp (Baileys)
async function sendWhatsAppMessage(gatewayUrl: string, phone: string, text: string) {
  if (!phone || !gatewayUrl) return;
  try {
    console.log(`[WHATSAPP] Tentando disparar alerta para ${phone} via gateway ${gatewayUrl}...`)
    
    // Formatar telefone mantendo apenas números
    let cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone.endsWith("@c.us")) {
      cleanPhone = `${cleanPhone}@c.us`;
    }

    const res = await fetch(`${gatewayUrl}/send-message`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        phone: cleanPhone,
        message: text
      })
    });
    
    if (!res.ok) {
      throw new Error(`HTTP Status ${res.status}`);
    }
    const data = await res.json();
    console.log(`[WHATSAPP] Sucesso no envio:`, data);
  } catch (err: any) {
    console.error(`[WHATSAPP] Erro no gateway ao enviar para ${phone}:`, err.message);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  console.log("[AUTO] Motor de alertas CPL/Budget iniciado...")

  try {
    // 0. Carregar configurações globais do WhatsApp
    const { data: configMaster } = await supabase
      .from("meta_ads_configs")
      .select("whatsapp_phone, whatsapp_gateway_url")
      .limit(1)
      .maybeSingle()

    const whatsappPhone = configMaster?.whatsapp_phone || ""
    const whatsappGateway = configMaster?.whatsapp_gateway_url || "http://localhost:3001"

    if (whatsappPhone) {
      console.log(`[AUTO] Alertas WhatsApp ATIVOS para o número ${whatsappPhone} via ${whatsappGateway}`)
    } else {
      console.log("[AUTO] Alertas WhatsApp inativos (número não configurado).")
    }

    // 1. Buscar todas as configurações de alertas ativas (CPL máx e % budget)
    const { data: thresholds, error: thErr } = await supabase
      .from("alert_thresholds")
      .select("*, ad_accounts(name, currency)")
      .eq("is_active", true)

    if (thErr || !thresholds?.length) {
      console.log("[AUTO] Nenhum threshold configurado. Nada a avaliar.")
      return new Response(JSON.stringify({ status: "ok", alerts: 0, message: "Nenhum threshold ativo." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      })
    }

    // Obter data de hoje YYYY-MM-DD segura no fuso horário de Brasília (BRT)
    const formatter = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(new Date())
    const day = parts.find(p => p.type === 'day')?.value
    const month = parts.find(p => p.type === 'month')?.value
    const year = parts.find(p => p.type === 'year')?.value
    const today = `${year}-${month}-${day}` // YYYY-MM-DD
    let totalAlerts = 0

    for (const threshold of thresholds) {
      const accountId = threshold.ad_account_id
      const accountName = (threshold.ad_accounts as any)?.name || (accountId === null ? "Todas as Contas Meta (Global)" : accountId)
      const userId = threshold.user_id
      const maxCpl = threshold.max_cpl
      const maxBudgetPct = threshold.max_budget_pct

      console.log(`[AUTO] Avaliando conta ${accountName} | Max CPL: ${maxCpl ? `R$${maxCpl}` : 'OFF'} | Max Budget: ${maxBudgetPct ? `${maxBudgetPct}%` : 'OFF'}`)

      // 2. Buscar campanhas ativas desta conta (tolerante a case e sem restrição de orçamento para o CPL funcionar sempre)
      let campQuery = supabase
        .from("campaigns")
        .select("id, name, status, external_id, daily_budget, budget_currency, ad_account_id")
        .in("status", ["active", "ACTIVE"])

      if (accountId) {
        campQuery = campQuery.eq("ad_account_id", accountId)
      }

      const { data: campaigns } = await campQuery

      if (!campaigns?.length) {
        console.log(`[AUTO] Nenhuma campanha ativa na conta ${accountId || 'global'}`)
        continue
      }

      for (const campaign of campaigns) {
        // 3. Buscar métricas de HOJE somando de todos os anúncios (asset_metrics) para refletir 100% a interface
        const { data: adsData } = await supabase.from("ads").select("id").eq("campaign_id", campaign.id)
        const adIds = adsData?.map((a: any) => a.id) || []
        
        let spend = 0
        let conversions = 0
        
        if (adIds.length > 0) {
          const { data: adMetrics } = await supabase
            .from("asset_metrics")
            .select("cost, conversions")
            .eq("date", today)
            .in("ad_id", adIds)
            
          if (adMetrics) {
            spend = adMetrics.reduce((acc: number, m: any) => acc + (m.cost || 0), 0)
            conversions = adMetrics.reduce((acc: number, m: any) => acc + (m.conversions || 0), 0)
          }
        }

        if (spend === 0 && conversions === 0) {
          console.log(`[AUTO] Sem dados de hoje para campanha ${campaign.name}`)
          continue
        }

        const dailyBudget = campaign.daily_budget || 0

        // 4. Calcular CPL do dia (ou custo atual se gastou e tem zero leads para alertar CPL de gasto sem conversão!)
        const cpl = conversions > 0 ? spend / conversions : (conversions === 0 && spend > 0 ? spend : null)
        const budgetUsedPct = dailyBudget > 0 ? (spend / dailyBudget) * 100 : 0

        console.log(`[AUTO] ${campaign.name}: Gasto R$${spend.toFixed(2)} / Budget R$${dailyBudget} (${budgetUsedPct.toFixed(0)}%) | Leads: ${conversions} | CPL: ${cpl ? `R$${cpl.toFixed(2)}` : 'N/A'}`)

        const alertsToInsert = []

        // ── Alerta de CPL elevado ─────────────────────────────────────────────
        if (maxCpl && cpl !== null && cpl > maxCpl) {
          const targetAccId = campaign.ad_account_id || accountId || ""
          const link = `/metricas?account=${targetAccId}&campaign=${campaign.external_id}`
          alertsToInsert.push({
            user_id: userId,
            title: `🚨 CPL Alto: ${campaign.name}`,
            message: `CPL atual R$${cpl.toFixed(2)} está acima do limite de R$${maxCpl.toFixed(2)}. Gasto: R$${spend.toFixed(2)} | ${conversions} lead(s) hoje. Clique para ver a campanha.`,
            type: "alert",
            is_critical: true,
            link,
            metadata: {
              account_id: targetAccId,
              campaign_id: campaign.external_id,
              campaign_name: campaign.name,
              current_cpl: cpl,
              max_cpl: maxCpl,
              spend_today: spend,
              conversions_today: conversions,
              alert_type: "HIGH_CPL"
            }
          })
          console.log(`[AUTO] ⚠️ ALERTA CPL: ${campaign.name} → CPL R$${cpl.toFixed(2)} > limite R$${maxCpl.toFixed(2)}`)
        }

        // ── Alerta de orçamento quase esgotado ────────────────────────────────
        if (maxBudgetPct !== null && dailyBudget > 0 && budgetUsedPct >= maxBudgetPct) {
          const targetAccId = campaign.ad_account_id || accountId || ""
          const link = `/metricas?account=${targetAccId}&campaign=${campaign.external_id}`
          alertsToInsert.push({
            user_id: userId,
            title: `💸 Orçamento ${budgetUsedPct.toFixed(0)}%: ${campaign.name}`,
            message: `R$${spend.toFixed(2)} de R$${dailyBudget.toFixed(2)} gastos hoje (${budgetUsedPct.toFixed(0)}% do orçamento diário). Clique para monitorar.`,
            type: "alert",
            is_critical: true,
            link,
            metadata: {
              account_id: targetAccId,
              campaign_id: campaign.external_id,
              campaign_name: campaign.name,
              spend_today: spend,
              daily_budget: dailyBudget,
              budget_used_pct: budgetUsedPct,
              alert_type: "BUDGET_WARNING"
            }
          })
          console.log(`[AUTO] ⚠️ ALERTA BUDGET: ${campaign.name} → ${budgetUsedPct.toFixed(0)}% do orçamento usado`)
        }

        // 5. Inserir alertas evitando duplicatas do mesmo dia
        for (const alert of alertsToInsert) {
          // Verifica se já existe alerta idêntico hoje para esta campanha
          const alertType = alert.metadata?.alert_type
          const { data: existing } = await supabase
            .from("notifications")
            .select("id")
            .eq("user_id", userId)
            .eq("is_critical", true)
            .gte("created_at", `${today}T00:00:00Z`)
            .ilike("title", `%${campaign.name}%`)
            .ilike("message", `%${alertType === 'HIGH_CPL' ? 'CPL' : 'Orçamento'}%`)
            .limit(1)

          if (!existing?.length) {
            await supabase.from("notifications").insert(alert)
            totalAlerts++

            // Disparar WhatsApp em tempo real se cadastrado!
            if (whatsappPhone) {
              let text = ""
              if (alertType === "HIGH_CPL") {
                text = `🚨 *ALERTA CPL ALTO - NC PERFORMANCE*\n\n📈 *Campanha:* ${alert.metadata?.campaign_name}\n🔴 *CPL Atual:* R$ ${alert.metadata?.current_cpl?.toFixed(2)}\n🎯 *Limite:* R$ ${alert.metadata?.max_cpl?.toFixed(2)}\n💸 *Gasto hoje:* R$ ${alert.metadata?.spend_today?.toFixed(2)}\n👥 *Resultados:* ${alert.metadata?.conversions_today} leads`
              } else {
                text = `💸 *ALERTA ORÇAMENTO - NC PERFORMANCE*\n\n📈 *Campanha:* ${alert.metadata?.campaign_name}\n🔴 *Uso:* ${alert.metadata?.budget_used_pct?.toFixed(0)}%\n💵 *Gasto:* R$ ${alert.metadata?.spend_today?.toFixed(2)} de R$ ${alert.metadata?.daily_budget?.toFixed(2)}`
              }
              await sendWhatsAppMessage(whatsappGateway, whatsappPhone, text)
            }
          } else {
            console.log(`[AUTO] Alerta duplicado ignorado para ${campaign.name} (${alertType})`)
          }
        }
      }

      // 6. Avaliar também as regras manuais de automação (do sistema antigo)
      const { data: rules } = await supabase
        .from("automation_rules")
        .select("*")
        .eq("status", "active")
        .eq("ad_account_id", accountId)

      for (const rule of rules || []) {
        if (rule.is_active === false) continue;
        
        // Buscar campanha desta regra (simplificado: pega a mais recente da conta)
        const { data: campaignMetrics } = await supabase
          .from("metrics")
          .select("cost, conversions, clicks, impressions, campaign_id")
          .eq("date", today)
          .in("campaign_id", (
            await supabase.from("campaigns").select("id").eq("ad_account_id", accountId)
          ).data?.map((c: any) => c.id) || [])
          
        if (!campaignMetrics?.length) continue

        const totalCost = campaignMetrics.reduce((acc, m) => acc + (m.cost || 0), 0)
        const totalConv = campaignMetrics.reduce((acc, m) => acc + (m.conversions || 0), 0)
        const totalClicks = campaignMetrics.reduce((acc, m) => acc + (m.clicks || 0), 0)
        const totalImp = campaignMetrics.reduce((acc, m) => acc + (m.impressions || 0), 0)

        let valorAtual = 0
        if (rule.metric === "cpl" || rule.metric === "cpa") {
          valorAtual = totalCost / (totalConv || 1)
        } else if (rule.metric === "spend") {
          valorAtual = totalCost
        } else if (rule.metric === "ctr") {
          valorAtual = totalImp > 0 ? (totalClicks / totalImp) * 100 : 0
        }

        let isTriggered = false
        if (rule.condition === ">" && valorAtual > rule.value) isTriggered = true
        else if (rule.condition === "<" && valorAtual < rule.value) isTriggered = true
        else if (rule.condition === ">=" && valorAtual >= rule.value) isTriggered = true

        if (isTriggered) {
          await supabase.from("notifications").insert({
            user_id: rule.user_id,
            title: `⚡ Regra: ${rule.name}`,
            message: `${rule.metric.toUpperCase()} atual ${valorAtual.toFixed(2)} ${rule.condition} ${rule.value}. Condição atingida na conta ${accountName}.`,
            type: "alert",
            is_critical: true,
            link: `/metricas?account=${accountId}`
          })
          totalAlerts++

          await supabase.from("automation_rules")
            .update({ last_evaluated_at: new Date().toISOString() })
            .eq("id", rule.id)
        }
      }
    }

    // 7. --- NOVA LÓGICA DE RESUMO DIÁRIO UNIFICADO (D-1) ÀS 08:00 BRT ---
    try {
      const nowUTC = new Date()
      // Converter UTC para BRT (UTC-3)
      const brtTime = new Date(nowUTC.getTime() - 3 * 60 * 60 * 1000)
      const is8AMorLater = brtTime.getUTCHours() >= 8

      if (is8AMorLater) {
        // Data de ontem em YYYY-MM-DD
        const yesterday = new Date(brtTime.getTime() - 24 * 60 * 60 * 1000)
        const yesterdayStr = yesterday.toISOString().split('T')[0]
        
        // Pega o ID do administrador principal via config para enviar o alerta
        const { data: configMaster } = await supabase.from("meta_ads_configs").select("user_id").limit(1).maybeSingle()
        const adminUserId = configMaster?.user_id

        if (adminUserId) {
          // Checar se já enviamos resumo unificado para D-1
          const { data: existingSummary } = await supabase
            .from("notifications")
            .select("id")
            .eq("type", "success")
            .eq("metadata->>alert_type", "DAILY_SUMMARY_D1")
            .eq("metadata->>summary_date", yesterdayStr)
            .limit(1)

          if (!existingSummary?.length) {
            // Soma todas as métricas de D-1 (todas as contas e campanhas)
            const { data: yesterdayMetrics } = await supabase
              .from("metrics")
              .select("cost, conversions, reach")
              .eq("date", yesterdayStr)
            
            if (yesterdayMetrics && yesterdayMetrics.length > 0) {
              const totalSpend = yesterdayMetrics.reduce((acc, m) => acc + (m.cost || 0), 0)
              const totalConv = yesterdayMetrics.reduce((acc, m) => acc + (m.conversions || 0), 0)
              const totalReach = yesterdayMetrics.reduce((acc, m) => acc + (m.reach || 0), 0)

              if (totalSpend > 0) {
                const parts = yesterdayStr.split("-")
                const day = parseInt(parts[2])
                const monthsPT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
                const monthPT = monthsPT[parseInt(parts[1]) - 1]

                await supabase.from("notifications").insert({
                  user_id: adminUserId,
                  title: `🌅 Fechamento: ${day} de ${monthPT}`,
                  message: `Resumo de Ontem (D-1): Você investiu R$ ${totalSpend.toFixed(2)} em todas as contas e obteve ${totalConv} resultados (Alcance: ${totalReach.toLocaleString("pt-BR")}). Bom dia e ótimas campanhas!`,
                  type: "success",
                  is_critical: false,
                  link: `/dashboard`,
                  metadata: { alert_type: "DAILY_SUMMARY_D1", summary_date: yesterdayStr, spend: totalSpend, conversions: totalConv }
                })

                // Enviar por WhatsApp!
                if (whatsappPhone) {
                  const whatsappMsg = `🌅 *FECHAMENTO DIÁRIO - NC PERFORMANCE*\n\n📅 *Período:* Ontem (${day} de ${monthPT})\n💸 *Total Investido:* R$ ${totalSpend.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n🎯 *Resultados Totais:* ${totalConv}\n👥 *Alcance Total:* ${totalReach.toLocaleString("pt-BR")}\n\nBom dia e ótimas campanhas! 🚀`;
                  await sendWhatsAppMessage(whatsappGateway, whatsappPhone, whatsappMsg);
                }
                
                totalAlerts++
                console.log(`[AUTO] ✅ Resumo D-1 (${yesterdayStr}) gerado com sucesso às 08h.`)
              }
            }
          }
        }
      }
    } catch (summaryErr: any) {
      console.error("[AUTO] Erro ao gerar resumo D-1:", summaryErr.message)
    }
    // -------------------------------------------------------

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
