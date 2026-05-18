import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, context } = await req.json();
    const authHeader = req.headers.get('Authorization');
    
    // 1. Setup Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // 2. Get User ID from JWT
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(authHeader?.replace('Bearer ', '') ?? '');
    if (userError || !user) throw new Error("Não autorizado");

    // 3. Fetch Meta Credentials
    const { data: metaConfig } = await supabaseAdmin
      .from('meta_ads_configs')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const isMetaConnected = metaConfig?.is_connected;
    const metaToken = metaConfig?.access_token;
    const adAccountId = metaConfig?.ad_account_id;

    const systemPrompt = `Você é o "HC Traffic Strategist", um gestor de tráfego sênior especializado em Meta Ads.
Sua conexão com o Meta Ads está: ${isMetaConnected ? "ATIVA (OPERACIONAL)" : "INATIVA (MODO SIMULAÇÃO)"}.

${isMetaConnected ? `CONTA CONECTADA: ${adAccountId}` : "AVISO: Peça ao usuário para conectar o Meta Ads nas Configurações para ações reais."}

DIRETRIZES DE OPERAÇÃO:
- Linguagem Claude: Direto, técnico, didático e humano. Sem rodeios.
- Ações Reais: Quando o usuário pedir algo, use as ferramentas para buscar dados REAIS ou executar mudanças.
- Raciocínio Complexo: Analise se o CPA está alto, se a frequência está saturada e tome decisões baseadas nisso.

FERRAMENTAS DISPONÍVEIS:
1. get_metrics: Busca dados reais da conta ${adAccountId}.
2. exec_action: Pausa, retoma ou muda orçamento.
3. list_campaigns: Lista o que está rodando agora.
4. consultar_victoria: Solicita relatórios, dados de clientes ou insights administrativos à Victoria AI (Comandante da Plataforma). Use isso sempre que precisar de algo que não seja diretamente da API de Ads.

${context ? `\nCONTEXTO DE GOVERNANÇA:\n${context}` : ""}`;

    // Ferramentas reais que o LLM pode chamar
    const tools = [
      {
        type: "function",
        function: {
          name: "get_metrics",
          description: "Busca métricas REAIS da conta de anúncios via Facebook API.",
          parameters: {
            type: "object",
            properties: {
              date_preset: { type: "string", enum: ["today", "yesterday", "last_7d", "this_month"] }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "consultar_victoria",
          description: "Pergunta à Victoria AI sobre relatórios, clientes ou dados da NC Performance Suite.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "O que você precisa perguntar à Victoria? Ex: 'Me dê o resumo do relatório do Cliente X'" }
            },
            required: ["query"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_campaigns",
          description: "Lista todas as campanhas ativas e seus status atuais.",
          parameters: { type: "object", properties: {} }
        }
      },
      {
        type: "function",
        function: {
          name: "exec_action",
          description: "Executa uma ação real na conta (Pausar, Retomar, Mudar Orçamento).",
          parameters: {
            type: "object",
            properties: {
              action: { type: "string", enum: ["PAUSE", "RESUME", "UPDATE_BUDGET"] },
              campaign_id: { type: "string" },
              value: { type: "string", description: "Novo orçamento se for UPDATE_BUDGET" }
            },
            required: ["action", "campaign_id"]
          }
        }
      }
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools,
      }),
    });

    const aiResponse = await response.json();

    // Nota: Em um ambiente real, aqui faríamos o loop de execução de ferramentas 
    // se o GPT pedisse (tool_calls). Para este MVP, retornamos a intenção da IA.
    
    return new Response(JSON.stringify(aiResponse), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
