// supabase/functions/campaign-manager/index.ts
// Project Phoenix — Ads CLI Mode (Mass Deployment & Provisioning)

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

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: _authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { action, payload, ad_account_id } = await req.json()
    // action: 'mass_deploy', 'pause', 'scale', 'delete'
    // payload: array of campaign/ad configurations
    
    // 1. Buscar token do sistema
    const { data: config } = await supabase.from("meta_ads_configs").select("access_token").maybeSingle()
    if (!config?.access_token) throw new Error("Meta Token não configurado.")
    const token = config.access_token

    console.log(`[CAMPAIGN MANAGER] Iniciando ação: ${action} na conta ${ad_account_id}`)

    const results = []

    if (action === 'mass_deploy') {
      // Implementação do "Ads CLI Mode": Criar estrutura completa de anúncios
      for (const item of payload) {
        try {
          // A. Criar Campanha
          const campRes = await fetch(`${META_API_BASE}/act_${ad_account_id}/campaigns`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: item.campaign_name || "Campanha Phoenix",
              objective: item.objective || "OUTCOME_LEADS",
              status: "PAUSED",
              special_ad_categories: "NONE",
              access_token: token
            })
          }).then(r => r.json())

          if (campRes.error) throw new Error(`Erro Campanha: ${campRes.error.message}`)

          // B. Criar AdSet
          const adsetRes = await fetch(`${META_API_BASE}/act_${ad_account_id}/adsets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: `AdSet - ${item.campaign_name}`,
              campaign_id: campRes.id,
              daily_budget: (item.budget || 20) * 100, // em centavos
              billing_event: "IMPRESSIONS",
              optimization_goal: "LEADS",
              bid_strategy: "LOWEST_COST_WITHOUT_CAP",
              targeting: { geo_locations: { countries: ["BR"] } },
              status: "PAUSED",
              access_token: token
            })
          }).then(r => r.json())

          results.push({ id: campRes.id, status: "created", name: item.campaign_name })
        } catch (e: any) {
          results.push({ name: item.campaign_name, status: "error", error: e.message })
        }
      }
    } else if (action === 'pause' || action === 'start') {
      const status = action === 'pause' ? 'PAUSED' : 'ACTIVE'
      const ids = Array.isArray(payload) ? payload : [payload]
      
      for (const id of ids) {
        const res = await fetch(`${META_API_BASE}/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, access_token: token })
        }).then(r => r.json())
        results.push({ id, status: res.success ? action : 'error', error: res.error?.message })
      }
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Processadas ${results.length} operações via Ads CLI Mode.`,
      results
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })

  } catch (error: any) {
    console.error("Erro campaign-manager:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})
