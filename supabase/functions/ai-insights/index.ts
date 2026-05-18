import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { metrics, context } = await req.json();

    if (!metrics) {
      return new Response(JSON.stringify({ error: "metrics object is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um analista de tráfego pago sênior especializado em performance de anúncios digitais (Meta Ads, Google Ads).
Sua tarefa é analisar os dados de métricas fornecidos e gerar um insight acionável e estratégico.

REGRAS:
1. Seja direto e objetivo — máximo 4 parágrafos.
2. Comece com um diagnóstico rápido (a performance está boa, mediana ou preocupante).
3. Identifique o que mais se destaca (positivo ou negativo) nos dados.
4. Dê 2-3 recomendações práticas de otimização.
5. Use emojis estratégicos (📈 📉 💡 ⚠️ 🎯 🔥) para facilitar a leitura.
6. Formate a resposta em markdown.
7. Se houver dados de CPR (Custo por Resultado), avalie se está dentro de um range saudável.
8. Se houver dados de CTR, avalie se está acima de 1% (bom) ou abaixo (precisa melhorar).
9. Responda SEMPRE em português brasileiro.
10. Contexto do usuário: gestor de tráfego automotivo que trabalha com concessionárias e revendas.`;

    const userMessage = `Analise os seguintes dados de performance e gere um insight estratégico:

CONTEXTO: ${context || "Dados gerais de performance"}

DADOS:
${JSON.stringify(metrics, null, 2)}

Gere sua análise agora:`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      throw new Error(`AI error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const insight = aiData.choices?.[0]?.message?.content || "Não foi possível gerar o insight.";

    return new Response(JSON.stringify({ insight }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
