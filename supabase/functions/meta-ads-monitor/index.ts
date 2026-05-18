import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ─── Meta Ads API Helper ────────────────────────────────────────────────────
async function callMetaAPI(path: string, token: string, params: Record<string, string> = {}) {
  const url = new URL(`https://graph.facebook.com/v21.0${path}`);
  url.searchParams.set("access_token", token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Meta API Error: ${res.status} - ${errText}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // ─── Inicializar Supabase Admin ─────────────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Iniciando rotina de monitoramento do Meta Ads...");

    // 1. Buscar o token de acesso principal (agência)
    const { data: configs, error: configError } = await supabaseAdmin
      .from("meta_ads_configs")
      .select("*")
      .eq("is_connected", true)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (configError || !configs || configs.length === 0) {
      throw new Error("Nenhuma conta do Meta Ads conectada para usar como token master.");
    }
    
    const masterConfig = configs[0];
    const masterToken = masterConfig.access_token;

    if (!masterToken) {
      throw new Error("Token de acesso inválido no master config.");
    }

    // 2. Buscar todos os clientes que possuem meta_ad_account_id
    const { data: clients, error: clientsError } = await supabaseAdmin
      .from("clients")
      .select("id, name, meta_ad_account_id, target_cpa")
      .not("meta_ad_account_id", "is", null);

    if (clientsError) throw new Error(`Erro ao buscar clientes: ${clientsError.message}`);

    console.log(`Encontrados ${clients?.length || 0} clientes para monitoramento.`);

    const alertsToInsert = [];

    // 3. Iterar sobre os clientes e checar as métricas
    for (const client of clients || []) {
      const { id: clientId, name: clientName, meta_ad_account_id: adAccountId, target_cpa: targetCpa } = client;
      
      try {
        console.log(`Verificando cliente ${clientName} (Conta: ${adAccountId})...`);
        
        // Puxar insights dos últimos 7 dias a nível de campanha
        const insights = await callMetaAPI(
          `/${adAccountId.startsWith('act_') ? adAccountId : 'act_' + adAccountId}/insights`,
          masterToken,
          {
            date_preset: "last_7d",
            level: "account", // Puxa o resumo da conta para simplificar
            fields: "spend,actions"
          }
        );

        if (insights.data && insights.data.length > 0) {
          const data = insights.data[0];
          const spend = parseFloat(data.spend || "0");
          
          // Calcular leads (geralmente 'lead' ou conversão principal)
          let leads = 0;
          if (data.actions) {
            const leadAction = data.actions.find((a: any) => a.action_type === 'lead');
            if (leadAction) leads = parseInt(leadAction.value || "0");
          }

          if (leads > 0 && targetCpa) {
            const currentCpa = spend / leads;
            console.log(`${clientName} -> Gasto: R$${spend}, Leads: ${leads}, CPA Atual: R$${currentCpa.toFixed(2)}, CPA Alvo: R$${targetCpa}`);

            // 4. Analisar Regra: CPA Atual > CPA Alvo?
            if (currentCpa > targetCpa) {
              const msg = `🚨 Alerta para ${clientName}:\nO CPA atual (R$ ${currentCpa.toFixed(2)}) está acima do limite aceitável (R$ ${targetCpa.toFixed(2)}).\nÚltimos 7 dias: R$ ${spend.toFixed(2)} gastos para ${leads} leads.`;
              
              alertsToInsert.push({
                client_id: clientId,
                type: "HIGH_CPA",
                message: msg,
                status: "UNREAD",
                notification_sent: false
              });
              console.log(`[ALERTA GERADO] ${msg}`);
            }
          } else {
             // Caso não tenha leads, mas tenha gasto alto, podemos gerar um alerta diferente
             if (spend > targetCpa && leads === 0 && targetCpa > 0) {
                 const msg = `🚨 Alerta para ${clientName}:\nGasto de R$ ${spend.toFixed(2)} nos últimos 7 dias sem nenhuma conversão/lead registrada (CPA alvo era R$ ${targetCpa.toFixed(2)}).`;
                 alertsToInsert.push({
                    client_id: clientId,
                    type: "NO_CONVERSIONS",
                    message: msg,
                    status: "UNREAD",
                    notification_sent: false
                 });
             }
          }
        } else {
            console.log(`Sem dados de performance para ${clientName} nos últimos 7 dias.`);
        }

      } catch (err: any) {
        console.error(`Erro ao processar cliente ${clientName}:`, err.message);
      }
    }

    // 5. Salvar alertas no banco
    if (alertsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("alerts")
        .insert(alertsToInsert);
        
      if (insertError) {
        console.error("Erro ao salvar alertas no banco:", insertError);
      } else {
        console.log(`${alertsToInsert.length} alertas salvos com sucesso no banco.`);
      }

      // 6. Enviar Notificações (WhatsApp/Email)
      // Aqui simulamos a chamada para o seu Webhook (ex: Z-API / Evolution API)
      const WEBHOOK_URL = Deno.env.get("WHATSAPP_WEBHOOK_URL");
      if (WEBHOOK_URL) {
        for (const alert of alertsToInsert) {
           try {
             await fetch(WEBHOOK_URL, {
               method: "POST",
               headers: { "Content-Type": "application/json" },
               body: JSON.stringify({ message: alert.message, client_id: alert.client_id })
             });
             // Idealmente, após sucesso, você marca o notification_sent como true na tabela alerts
           } catch(e) {
             console.error("Erro ao notificar via webhook:", e);
           }
        }
      }
    } else {
        console.log("Nenhum alerta gerado nesta execução. Tudo dentro do limite!");
    }

    return new Response(JSON.stringify({ success: true, alerts_generated: alertsToInsert.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("meta-ads-monitor error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
