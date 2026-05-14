import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authErr } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, copyText, objective, audience } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um diretor de arte e copywriter sênior, especialista em tráfego pago e marketing digital de alta performance.
Sua missão é analisar o conjunto de criativo (Arte/Imagem + Copy) enviado pelo usuário.

Use metodologias consolidadas como AIDA (Atenção, Interesse, Desejo, Ação) ou PAS (Problema, Agitação, Solução) para embasar sua análise.

Avalie rigorosamente:
1. Potencial de Conversão (0-100): Quão provável é que o público realize a ação desejada?
2. Potencial de Viralidade/Engajamento (0-100): Quão compartilhável ou cativante é a junção?
3. Pontos Fortes: O que está excelente?
4. Pontos Fracos: Gargalos, confusões ou falhas na mensagem/design.
5. Recomendações: Ações diretas e detalhadas para aumentar o CTR e a conversão.

Você deve SEMPRE usar a ferramenta 'return_creative_analysis' para estruturar sua resposta.`;

    const userPrompt = `
Por favor, analise este criativo.
Objetivo da Campanha: ${objective || "Não especificado"}
Público-Alvo: ${audience || "Geral"}

Copy do Anúncio:
"""
${copyText || "[Sem copy]"}
"""
${imageBase64 ? "A imagem do anúncio está anexada a esta mensagem." : "Nenhuma imagem foi enviada, analise apenas a copy."}
`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: [] }
    ];

    if (imageBase64) {
      messages[1].content.push({ type: "image_url", image_url: { url: imageBase64 } });
    }
    messages[1].content.push({ type: "text", text: userPrompt });

    const tools = [{
      type: "function",
      function: {
        name: "return_creative_analysis",
        description: "Retorna a análise estruturada do criativo",
        parameters: {
          type: "object",
          properties: {
            conversion_score: { type: "number", description: "Nota de 0 a 100" },
            virality_score: { type: "number", description: "Nota de 0 a 100" },
            strengths: { type: "array", items: { type: "string" }, description: "Lista de pontos fortes" },
            weaknesses: { type: "array", items: { type: "string" }, description: "Lista de pontos fracos/gargalos" },
            recommendations: { type: "array", items: { type: "string" }, description: "Dicas detalhadas para alta performance" },
            analysis: { type: "string", description: "Resumo executivo da análise (1 a 2 parágrafos)" }
          },
          required: ["conversion_score", "virality_score", "strengths", "weaknesses", "recommendations", "analysis"],
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
        model: "google/gemini-2.5-pro",
        messages,
        tools,
        tool_choice: { type: "function", function: { name: "return_creative_analysis" } },
      }),
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error("AI gateway error:", response.status, errTxt);
      throw new Error(`Erro na IA: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Sem análise retornada pela IA");

    const analysisResult = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("analyze-creative error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
