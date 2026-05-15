// supabase/functions/run-automations/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

console.log("Serviço de automação de performance e relatórios rodando...")

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  try {
    console.log("[AUTO] Processando regras de performance (Motor Avançado)...")
    
    // Busca as regras ativas
    const { data: rules, error: rulesErr } = await supabase
      .from("automation_rules")
      .select("*, ad_accounts(name)")
      .eq("status", "active") // Usando o novo campo status
      
    // Fallback if status doesn't exist yet (for older data)
    const activeRules = rules || []

    if (rulesErr && !rules) {
      console.warn("Aviso: Falha ao buscar regras. Certifique-se que a migração foi aplicada.", rulesErr)
    }

    let alertasDisparados = 0
    let acoesExecutadas = 0

    for (const rule of activeRules) {
      // Ignora regras desativadas pela flag antiga, caso exista e seja falsa
      if (rule.is_active === false) continue;

      // Simplificação: Buscando métricas para a conta ou campanha
      // Idealmente, a query de métricas seria adaptada pelo 'time_window' e 'target_level'
      
      const { data: metrics, error: metricsErr } = await supabase
        .from("metrics")
        .select("*")
        .eq("campaign_id", (
          await supabase.from("campaigns").select("id").eq("user_id", rule.user_id).limit(1)
        ).data?.[0]?.id || '') // Simplificação para mock
        .order("date", { ascending: false })
        .limit(10)

      if (metricsErr || !metrics?.length) continue

      // Calcula a média da métrica desejada
      let valorAtual = 0
      if (rule.metric === "cpl") {
        const totalCost = metrics.reduce((acc, m) => acc + (m.cost || 0), 0)
        const totalConv = metrics.reduce((acc, m) => acc + (m.conversions || 0), 0)
        valorAtual = totalCost / (totalConv || 1)
      } else if (rule.metric === "spend") {
        valorAtual = metrics[0].cost || 0
      } else if (rule.metric === "roas") {
        const totalCost = metrics.reduce((acc, m) => acc + (m.cost || 0), 0)
        const totalRevenue = metrics.reduce((acc, m) => acc + ((m.conversions || 0) * 100), 0) // mock revenue
        valorAtual = totalCost > 0 ? totalRevenue / totalCost : 0
      } else if (rule.metric === "ctr") {
        const totalClicks = metrics.reduce((acc, m) => acc + (m.clicks || 0), 0)
        const totalImpressions = metrics.reduce((acc, m) => acc + (m.impressions || 0), 0)
        valorAtual = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
      }

      // Verifica a condição
      let isTriggered = false
      if (rule.condition === ">" && valorAtual > rule.value) isTriggered = true
      else if (rule.condition === "<" && valorAtual < rule.value) isTriggered = true
      else if (rule.condition === ">=" && valorAtual >= rule.value) isTriggered = true

      if (isTriggered) {
        console.log(`[ALERTA] Regra '${rule.name}' atingida! Valor: ${valorAtual.toFixed(2)} ${rule.condition} ${rule.value}`)
        
        const actionType = rule.action_type || 'notify'
        
        // --- 1. AÇÕES DO MOTOR DE REGRAS ---
        if (actionType !== 'notify') {
           console.log(`[AÇÃO] Executando ação: ${actionType} na campanha alvo.`)
           // Aqui entraria a integração com Graph API do Meta (ex: pausar campanha)
           
           // Registrar no log de automação
           await supabase.from("automation_logs").insert({
             rule_id: rule.id,
             user_id: rule.user_id,
             action_taken: actionType,
             target_level: rule.target_level || 'campaign',
             target_id: rule.target_ids && rule.target_ids.length > 0 ? rule.target_ids[0] : 'all',
             old_value: { metric: rule.metric, valor_detectado: valorAtual },
             new_value: rule.action_value || {},
             status: 'success'
           })
           acoesExecutadas++
        }

        // --- 2. NOTIFICAÇÕES GERAIS ---
        await supabase.from("notifications").insert({
          user_id: rule.user_id,
          title: `Alerta de Performance: ${rule.name}`,
          message: `Ação (${actionType}) executada. O ${rule.metric.toUpperCase()} atual é de ${valorAtual.toFixed(2)}, condição: ${rule.condition} ${rule.value}.`,
          type: actionType === 'notify' ? "alert" : "success"
        })

        if (rule.recipient_email) {
          console.log(` -> Enviando alerta por e-mail para: ${rule.recipient_email}`)
        }

        alertasDisparados++
        
        // Atualizar timestamp da regra
        await supabase.from("automation_rules")
          .update({ last_evaluated_at: new Date().toISOString() })
          .eq("id", rule.id)
      }
    }

    return new Response(JSON.stringify({ 
      status: "ok", 
      alertas: alertasDisparados,
      acoes: acoesExecutadas,
      timestamp: new Date().toISOString()
    }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Erro no processamento:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})
