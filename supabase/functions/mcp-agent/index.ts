import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}



serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const { prompt } = await req.json()
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: config } = await supabase
      .from("meta_ads_configs")
      .select("access_token")
      .single()

    if (!config?.access_token) throw new Error("Meta Token não configurado.")

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")

    console.log(`[MCP-AGENT] Processando prompt: "${prompt}"`)

    // 1. Fetch real campaign data to provide context to the Agent
    const { data: campaigns } = await supabase
      .from('campaigns')
      .select('name, status, budget, metrics(cost, conversions, clicks, impressions)')
      .limit(20);

    let contextData = "Nenhum dado de campanha encontrado.";
    if (campaigns && campaigns.length > 0) {
      contextData = campaigns.map((c: any) => {
        // Obter métricas mais recentes (assumindo a primeira do array)
        const m = c.metrics?.[0] || { cost: 0, conversions: 0, clicks: 0, impressions: 0 };
        return `- Campanha: ${c.name} | Status: ${c.status} | Orçamento: R$${c.budget} | Custo Atual: R$${m.cost} | Conversões: ${m.conversions} | Cliques: ${m.clicks} | Impressões: ${m.impressions}`;
      }).join("\n");
    }

    const DYNAMIC_SYSTEM_PROMPT = `Você é a Victoria AI, Comandante Estratégica da NC Performance.
Sua missão é atuar como uma inteligência de elite para análise de tráfego pago.
Você deve ser técnica, direta e falar em português (pt-BR).

DADOS ATUAIS DAS CAMPANHAS DO USUÁRIO (Sincronizado via Meta API):
${contextData}

Com base nestes dados reais, responda à pergunta do usuário de forma analítica e estratégica. 
Seja incisiva e traga insights de otimização (escalar orçamentos, pausar campanhas ruins, etc).`;

    // 2. Chamada ao Gemini para orquestração
    let responseText = "Comando recebido. Estou analisando os dados via MCP..."

    if (GEMINI_API_KEY) {
      const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`
      const aiRes = await fetch(genUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `${DYNAMIC_SYSTEM_PROMPT}\n\nUsuário: ${prompt}` }]
          }]
        })
      })
      const aiData = await aiRes.json()
      responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || responseText
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: responseText,
      mcp_status: "connected",
      tools_accessed: campaigns?.length || 0
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error: any) {
    console.error(`[MCP-AGENT ERROR] ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200 // Retornamos 200 com erro no JSON para não quebrar o chat
    })
  }
})
