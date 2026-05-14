import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const metaToken = Deno.env.get("META_ACCESS_TOKEN")! // Token Geral (System User)

const supabase = createClient(supabaseUrl, supabaseServiceKey)

interface MetaCampaign {
  id: string;
  name: string;
  objective: string;
  spend: string;
  cpc: string;
  ctr: string;
  reach: string;
  impressions: string;
  actions?: Array<{ action_type: string, value: string }>;
}

async function fetchAdAccountInsights(adAccountId: string): Promise<MetaCampaign[]> {
  const url = `https://graph.facebook.com/v19.0/${adAccountId}/insights?level=campaign&fields=campaign_name,objective,spend,actions,reach,impressions,cpc,ctr&date_preset=maximum&access_token=${metaToken}`
  const response = await fetch(url)
  const data = await response.json()

  if (data.error) {
    throw new Error(data.error.message)
  }

  return data.data.map((c: any) => ({
    id: c.campaign_id || Math.random().toString(),
    name: c.campaign_name,
    objective: c.objective || "CONVERSIONS",
    spend: c.spend || "0",
    cpc: c.cpc || "0",
    ctr: c.ctr || "0",
    reach: c.reach || "0",
    impressions: c.impressions || "0",
    actions: c.actions || []
  }))
}

serve(async (req) => {
  try {
    if (!metaToken) throw new Error("META_ACCESS_TOKEN não configurado no ambiente Supabase.");

    // 1. Busca todos os clientes que possuem uma conta Meta Ads vinculada
    const { data: clients, error: clientErr } = await supabase
      .from("clients")
      .select("id, name, meta_ad_account_id")
      .not("meta_ad_account_id", "is", null)

    if (clientErr) throw clientErr

    let syncedAccounts = 0;
    let failedAccounts = 0;

    // 2. Itera sobre cada cliente e sincroniza sua conta de anúncios
    for (const client of clients) {
      const adAccountId = client.meta_ad_account_id
      if (!adAccountId) continue

      try {
        console.log(`[SYNC] Iniciando extração para o cliente ${client.name} (Conta: ${adAccountId})`)
        const campaigns = await fetchAdAccountInsights(adAccountId)
        
        // 3. Traduzir o JSON do Meta para o nosso array padrão "raw_data"
        const rawCampaigns = campaigns.map(c => {
          // Achar a métrica principal (ex: leads, purchases)
          const results = c.actions?.find(a => a.action_type === "lead" || a.action_type === "offsite_conversion.fb_pixel_purchase" || a.action_type === "onsite_conversion.messaging_first_reply")?.value || "0"
          
          return {
            id: c.id,
            name: c.name,
            investment: parseFloat(c.spend),
            results: parseInt(results),
            result_type: c.objective,
            cost_per_result: parseFloat(c.spend) / (parseInt(results) || 1),
            reach: parseInt(c.reach),
            impressions: parseInt(c.impressions),
            ctr: parseFloat(c.ctr),
            cpc: parseFloat(c.cpc)
          }
        })

        const totalInvestment = rawCampaigns.reduce((acc, c) => acc + (c.investment || 0), 0);
        const periodText = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
        
        const rawData = {
          campaigns: rawCampaigns,
          total_investment: totalInvestment,
          total_campaigns: rawCampaigns.length,
          groups: [],
          format: "general"
        }

        // 4. Salvar como um relatório do tipo "Integração"
        await supabase
          .from("reports")
          .insert({
            client_name: client.name,
            period: periodText,
            total_investment: totalInvestment,
            total_campaigns: rawCampaigns.length,
            raw_data: rawData,
            markdown: `## Sincronização Automática - ${client.name}\n\nOs dados desta tabela foram importados da conta ${adAccountId} no Meta Ads via integração nativa.\n`
          })

        syncedAccounts++

      } catch (err: any) {
        console.error(`[ERRO] Falha ao sincronizar ${client.name}:`, err.message)
        failedAccounts++
        // Disparar notificação de erro ou email de alerta para a agência
        // (Seria o mesmo fluxo do run-automations se passasse de um limite de CPL)
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Sincronização Meta Ads finalizada",
        details: { syncedAccounts, failedAccounts }
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error: any) {
    console.error("Erro Fatal:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500
    })
  }
})
