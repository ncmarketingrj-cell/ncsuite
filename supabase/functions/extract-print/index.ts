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
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claimsData, error: authErr } = await supabaseAuth.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (authErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { imageBase64, clientName, period } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é um analista sênior de performance da NC AGÊNCIA, especialista em ler prints de gerenciadores de anúncios (Meta Ads, Google Ads, TikTok Ads).

OBJETIVO: extrair com PRECISÃO ABSOLUTA cada campanha visível no print, sem inventar e sem omitir.

REGRAS RÍGIDAS:
1. Liste CADA linha de campanha visível com seu NOME EXATO (preserve maiúsculas, símbolos, emojis, "|", traços).
2. Determine o TIPO DE RESULTADO (result_type) mapeando de forma INTELIGENTE cruzando o nome da campanha com a coluna de resultados/custo por resultado.
   - Se o nome da campanha tiver "mensagem" mas a métrica de resultado não for custo por mensagem, mensure pela métrica real que estiver lá.
   - Se o nome tiver "mensagem" e a métrica for "custo por mensagem", a categoria é "Mensagens".
   - Se o nome da campanha for "alcance" e o resultado for "alcance", a categoria é "Alcance".
   - Se o nome tiver "audiência" ou "alcance", mas o resultado ou custo apontar para "visualizações de página", a categoria é "Visualizações de página".
   - Cruze sempre o nome da campanha com o nome da métrica real da tabela. Categorias canônicas aceitas:
   - "Mensagens", "Leads", "Cliques", "Visualizações de página", "Conversões", "Engajamentos", "Alcance", "Visualizações de vídeo", "Outros".
3. Para cada campanha extraia TODOS os números visíveis: investimento (R$), resultados (qtd), custo por resultado (CPL), alcance, impressões, frequência, CTR.
4. NÃO agrupe automaticamente. Retorne cada campanha separada.
5. SUGIRA agrupamentos em "suggested_groups" quando dois ou mais nomes parecem ser variações da mesma campanha (ex: "NC | CMP MENSAGENS RAQUEL" + "NC | CMP MSG RAQUEL"). Inclua justificativa curta.
6. Coloque em "ambiguities" qualquer dúvida (texto cortado, números ilegíveis, etc).
7. Calcule corretamente "total_investment" e "total_campaigns" (count das campanhas individuais — antes de agrupar).
8. Se o print tiver TOTAL/SUBTOTAIS visíveis, use-os para validar; se divergirem, use os totais visíveis no print.
9. Valores monetários sempre em número (sem "R$", sem milhar). Ex: "R$ 1.234,56" → 1234.56.

Retorne APENAS via tool call extract_campaign_data.`;

    const tools = [{
      type: "function",
      function: {
        name: "extract_campaign_data",
        description: "Estrutura os dados extraídos do print",
        parameters: {
          type: "object",
          properties: {
            campaigns: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Nome exato como aparece no print" },
                  result_type: {
                    type: "string",
                    description: "Categoria canônica: Mensagens, Leads, Cliques, Visualizações de página, Conversões, Engajamentos, Alcance, Visualizações de vídeo, Outros",
                  },
                  result_label: { type: "string", description: "Texto exato da coluna resultado, ex: 'Conversas por mensagem iniciadas'" },
                  investment: { type: "number" },
                  results: { type: "number" },
                  cost_per_result: { type: "number" },
                  reach: { type: "number" },
                  impressions: { type: "number" },
                  frequency: { type: "number" },
                  ctr: { type: "number" },
                },
                required: ["name", "result_type", "investment", "results"],
              },
            },
            total_investment: { type: "number" },
            total_campaigns: { type: "number" },
            suggested_groups: {
              type: "array",
              description: "Sugestões de agrupamento por similaridade de nome — usuário decide se aceita",
              items: {
                type: "object",
                properties: {
                  group_name: { type: "string", description: "Nome sugerido para o grupo" },
                  campaign_names: { type: "array", items: { type: "string" } },
                  reason: { type: "string" },
                },
                required: ["group_name", "campaign_names", "reason"],
              },
            },
            ambiguities: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["campaigns", "total_investment", "total_campaigns"],
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
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Cliente: ${clientName || "N/A"}. Período: ${period || "N/A"}. Extraia TODAS as campanhas visíveis com máxima precisão.` },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "extract_campaign_data" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Limite de requisições atingido. Tente novamente em alguns instantes." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados. Adicione fundos no workspace Lovable." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "Erro na IA" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("Sem tool_call retornado");

    const extracted = JSON.parse(toolCall.function.arguments);

    // Garantir IDs estáveis para drag-and-drop no client
    extracted.campaigns = (extracted.campaigns || []).map((c: any, i: number) => ({
      id: `c_${i}_${Date.now()}`,
      ...c,
    }));

    return new Response(JSON.stringify({ data: extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-print error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
