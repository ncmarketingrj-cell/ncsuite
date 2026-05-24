// supabase/functions/analyze-creative/index.ts
// Project Phoenix — Módulo Creative Vision (Sigma Style)
// Análise de criativos com decodificação visual e gatilhos psicológicos

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const _authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user }, error: _authErr } = await _authClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { imageBase64, copyText, objective, audience } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY não configurado.");

    const systemPrompt = `Você é o Módulo Creative Vision (Sigma Style). Sua missão é decodificar anúncios com precisão cirúrgica.
    
    Analise a Imagem/Criativo e a Copy sob os seguintes prismas:
    1. SWOT de Performance (Strengths, Weaknesses, Opportunities, Threats).
    2. Gatilhos Psicológicos (Ganância, Novidade, Urgência, Autoridade, Curiosidade).
    3. Análise de Gancho (Hook): Os primeiros 3 segundos são eficazes? Por quê?
    4. Qualidade Visual e Hierarquia: Cores, elementos de dashboard (se houver), speaker.
    
    Sempre responda em Português (PT-BR) usando a ferramenta 'return_creative_analysis'.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: [
        { type: "text", text: `Objetivo: ${objective || "Conversão"}\nPúblico: ${audience || "Geral"}\nCopy: ${copyText || "[Sem texto]"}` }
      ] }
    ];

    if (imageBase64) {
      messages[1].content.push({ type: "image_url", image_url: { url: imageBase64 } });
    }

    const tools = [{
      type: "function",
      function: {
        name: "return_creative_analysis",
        description: "Retorna a análise estratégica do criativo estilo Sigma Studio",
        parameters: {
          type: "object",
          properties: {
            conversion_score: { type: "number" },
            virality_score: { type: "number" },
            hook_analysis: { type: "string", description: "Análise dos primeiros segundos e retenção" },
            psychological_triggers: { type: "array", items: { type: "string" }, description: "Gatilhos identificados" },
            swot: {
              type: "object",
              properties: {
                strengths: { type: "array", items: { type: "string" } },
                weaknesses: { type: "array", items: { type: "string" } },
                opportunities: { type: "array", items: { type: "string" } },
                threats: { type: "array", items: { type: "string" } }
              }
            },
            recommendations: { type: "array", items: { type: "string" } },
            executive_summary: { type: "string", description: "Resumo executivo de 3 segundos para o gestor" }
          },
          required: ["conversion_score", "hook_analysis", "psychological_triggers", "swot", "recommendations", "executive_summary"],
        },
      },
    }];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Rápido e eficaz para visão
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "return_creative_analysis" } },
      }),
    });

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("A IA falhou em gerar a análise SWOT.");

    return new Response(toolCall.function.arguments, {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("Creative Vision Error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
