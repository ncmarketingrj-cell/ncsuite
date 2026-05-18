import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Você é a Victoria AI, a Comandante Estratégica da NC Performance Suite. 
Sua personalidade é decidida, profissional, altamente técnica em tráfego pago (Meta Ads) e orientada a resultados.
Seu objetivo é ajudar gestores de tráfego a tomarem decisões rápidas sobre ROAS, CPA e escala de campanhas.
Use um tom de voz autoritário mas parceiro, como uma comandante de operações de elite.
Sempre responda em Português Brasileiro e use markdown para formatar dados.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Instanciar cliente do Supabase com Service Role para leitura nativa
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("[VICTORIA-AGENT] Buscando dados consolidados do banco...");
    
    // 1. Buscar todas as campanhas do banco com suas métricas históricas completas
    const { data: campaignsRaw } = await supabase
      .from('campaigns')
      .select('name, status, budget, platform, metrics(cost, conversions, clicks, impressions)')

    const campaigns = (campaignsRaw || []).map((c: any) => {
      const metrics = c.metrics || []
      const cost = metrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0)
      const conversions = metrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0)
      const clicks = metrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0)
      const impressions = metrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0)

      const cpl = conversions > 0 ? cost / conversions : 0
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0

      return {
        name: c.name,
        status: c.status?.toUpperCase() || "PAUSED",
        budget: Number(c.budget || 0),
        platform: c.platform || "Meta Ads",
        totals: { cost, conversions, clicks, impressions, cpl, ctr }
      }
    })

    // Calcular estatísticas globais
    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0)
    const totalConversions = campaigns.reduce((s, c) => s + c.totals.conversions, 0)
    const activeCount = campaigns.filter(c => c.status === "ACTIVE").length
    const globalCpl = totalConversions > 0 ? totalInvest / totalConversions : 0

    // Ordenar campanhas por gasto e performance
    const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE")
    
    // Campanha mais eficiente
    const efficientCamp = [...activeCampaigns]
      .filter(c => c.totals.conversions > 0)
      .sort((a, b) => a.totals.cpl - b.totals.cpl)[0]

    // Campanha menos eficiente
    const inefficientCamp = [...activeCampaigns]
      .sort((a, b) => {
        if (a.totals.conversions === 0 && b.totals.conversions > 0) return -1
        if (b.totals.conversions === 0 && a.totals.conversions > 0) return 1
        return b.totals.cpl - a.totals.cpl
      })[0]

    let contextData = "Nenhuma campanha encontrada no banco de dados."
    if (campaigns.length > 0) {
      contextData = campaigns.map(c => 
        `- Campanha: ${c.name} | Status: ${c.status} | Orçamento Diário: R$${c.budget.toFixed(2)} | Gasto Acumulado: R$${c.totals.cost.toFixed(2)} | Conversões: ${c.totals.conversions} | CPL Médio: R$${c.totals.cpl.toFixed(2)} | CTR: ${c.totals.ctr.toFixed(2)}%`
      ).join("\n")
    }

    const DYNAMIC_SYSTEM_PROMPT = `${SYSTEM_PROMPT}

ESTATÍSTICAS GLOBAIS DE TRÁFEGO EM TEMPO REAL:
- Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Conversões Totais: ${totalConversions}
- CPL Geral Consolidado: R$ ${globalCpl.toFixed(2)}
- Campanhas Ativas: ${activeCount}

DADOS DETALHADOS DAS CAMPANHAS NO BANCO:
${contextData}

INSTRUÇÕES DE RESPOSTA:
1. Responda à pergunta do usuário de forma estratégica e analítica, citando os nomes reais das campanhas e seus números se for relevante.
2. Dê insights baseados estritamente na base de dados acima.
3. Sugira pausar campanhas com CPL alto, escalar as eficientes, verificar públicos, etc.`;

    let responseText = "";

    // Tentativa 1: Gemini Direto (Mais rápido se a chave estiver ok)
    if (GEMINI_API_KEY) {
      try {
        console.log("Tentando Gemini Direto...");
        const contents = [
          { role: "user", parts: [{ text: DYNAMIC_SYSTEM_PROMPT }] },
          { role: "model", parts: [{ text: "Entendido, Comandante Victoria pronta para operar e analisar o banco de dados." }] },
          ...messages.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
          }))
        ];

        const genUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const res = await fetch(genUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents })
        });

        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = data.candidates[0].content.parts[0].text;
        } else {
          console.error("Gemini Direto falhou, tentando fallback...");
        }
      } catch (e: any) {
        console.error("Erro no Gemini Direto:", e.message);
      }
    }

    // Tentativa 2: Lovable AI Gateway (Fallback Robusto)
    if (!responseText && LOVABLE_API_KEY) {
      try {
        console.log("Tentando Lovable AI Gateway...");
        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: DYNAMIC_SYSTEM_PROMPT },
              ...messages
            ],
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            responseText = content;
          }
        }
      } catch (e: any) {
        console.error("Erro no Lovable Gateway:", e.message);
      }
    }

    // Fallback Analítico Nativo Inteligente e Autônomo se as chaves falharem
    if (!responseText) {
      console.log("[VICTORIA-AGENT] Executando motor analítico nativo de fallback estratégico...");

      let analysisText = `### 🤖 Comandante Estratégica Victoria AI v2.5\n\n`;
      analysisText += `Olá! Nossos sistemas neurais estão operando em **Modo de Contingência Local** no momento (sem chaves de API externas), mas eu tenho acesso direto e nativo a toda a nossa base de dados consolidada. Aqui está a minha **Análise Tática de Performance**:\n\n`;

      analysisText += `#### 📊 Resumo Consolidado do Portfólio\n`;
      analysisText += `- **Investimento Total Acumulado**: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
      analysisText += `- **Leads / Conversões**: ${totalConversions} leads capturados\n`;
      analysisText += `- **CPL Médio Geral**: R$ ${globalCpl.toFixed(2)}\n`;
      analysisText += `- **Campanhas Ativas**: ${activeCount} no Meta Ads\n\n`;

      if (campaigns.length === 0) {
        analysisText += `⚠️ *Ainda não temos dados de campanhas registrados na base. Por favor, acesse a aba "Métricas" e sincronize seus dados para que eu possa fazer uma auditoria estratégica completa.*`;
      } else {
        analysisText += `#### 🎯 Auditoria Tática e Recomendações\n`;
        
        if (efficientCamp) {
          analysisText += `✅ **Campanha de Destaque (Alta Eficiência)**:\n`;
          analysisText += `  - **${efficientCamp.name}**\n`;
          analysisText += `  - CPL: **R$ ${efficientCamp.totals.cpl.toFixed(2)}** (Excepcional, abaixo da média geral!)\n`;
          analysisText += `  - Conversões: **${efficientCamp.totals.conversions}** leads\n`;
          analysisText += `  - *Recomendação*: Esta campanha possui o menor custo por lead. Recomendo **escalar o orçamento diário em 15%** de forma imediata para aproveitar o vento a favor.\n\n`;
        }

        if (inefficientCamp && inefficientCamp !== efficientCamp) {
          analysisText += `⚠️ **Alerta de Ineficiência (Gargalo de CPA)**:\n`;
          analysisText += `  - **${inefficientCamp.name}**\n`;
          analysisText += `  - Gasto Acumulado: **R$ ${inefficientCamp.totals.cost.toFixed(2)}**\n`;
          analysisText += `  - Conversões: **${inefficientCamp.totals.conversions}** leads\n`;
          if (inefficientCamp.totals.conversions === 0) {
            analysisText += `  - *Recomendação*: Esta campanha consumiu orçamento e gerou **ZERO leads**. Recomendo **pausar imediatamente** ou revisar criativos urgente.\n\n`;
          } else {
            analysisText += `  - CPL Atual: **R$ ${inefficientCamp.totals.cpl.toFixed(2)}**\n`;
            analysisText += `  - *Recomendação*: O CPL está elevado. Sugiro analisar se a taxa de cliques (CTR de ${inefficientCamp.totals.ctr.toFixed(2)}%) está caindo, o que indica saturação do criativo.\n\n`;
          }
        }

        analysisText += `#### 🛠️ Plano de Ação Recomendado\n`;
        analysisText += `1. **Otimização de Verba**: Pause os ativos com CPL 50% acima da meta geral e redirecione o orçamento para os campeões de conversão.\n`;
        analysisText += `2. **Renovação de Criativos**: Se o CTR de qualquer campanha ativa estiver abaixo de 1.20%, providencie novos criativos com foco no estoque comercial automotivo.\n\n`;
        analysisText += `*Deseja que eu analise algum ponto específico ou prefere sincronizar novos dados?*`;
      }

      responseText = analysisText;
    }

    return new Response(JSON.stringify({ message: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e: any) {
    console.error("Erro final Victoria Agent:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});

