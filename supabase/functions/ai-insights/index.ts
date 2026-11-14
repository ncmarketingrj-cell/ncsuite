import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const { metrics, context } = await req.json();

    if (!metrics) {
      return new Response(JSON.stringify({ error: "metrics object is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `Você é a Victoria AI (Contrato 2026.11.3), estrategista sênior de tráfego pago especializada em Meta Ads e Google Ads no setor automotivo.
Sua tarefa é analisar os dados de métricas fornecidos com rigor técnico, governança de unidades e calibração de confiança.

REGRAS OBRIGATÓRIAS:
1. Sempre inicie respondendo: "O que esta campanha foi configurada para otimizar?"
2. Respeite estritamente a unidade do objetivo:
   - Mensagens (MESSAGES): Custo por conversa (conversas iniciadas).
   - Alcance (REACH / OUTCOME_AWARENESS): Custo por 1.000 pessoas alcançadas (NUNCA chame de CPL!).
   - Visitas ao perfil (INSTAGRAM_PROFILE): Custo por visita ao perfil (NUNCA chame de CPL!).
   - Landing Page Views: Custo por visualização da página de destino.
   - Cliques no link: CPC (custo por clique no link).
   - Leads (LEADS): CPL (custo por lead).
3. PROIBIDO comparar métricas de unidades diferentes (ex.: CPM por 1.000 impressões com Custo por conversa ou CPL).
4. Em campanhas de Alcance, trate CTR de link como métrica secundária (o algoritmo otimiza alcance único, não cliques).
5. Separe claramente [FATO OBSERVADO], [INFERÊNCIA], [HIPÓTESE] e [RECOMENDAÇÃO].
6. Calibre a confiança pelo tamanho da janela: em janela de 1 dia, declare confiança baixa/moderada e recomende monitorar antes de pausar definitivamente.
7. NUNCA invente benchmarks não verificados (como "54% mais conversas", "80% de perda em 5 min" ou "sem consulta SPC/Serasa").
8. Responda SEMPRE em português brasileiro em Markdown estruturado.`;

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
        temperature: 0.2,
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
