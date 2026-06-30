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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: _authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { prompt } = await req.json()

    console.log(`[MCP-AGENT] Processando prompt: "${prompt}"`)

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
    
    // Campanha mais eficiente (com conversão e menor CPL)
    const efficientCamp = [...activeCampaigns]
      .filter(c => c.totals.conversions > 0)
      .sort((a, b) => a.totals.cpl - b.totals.cpl)[0]

    // Campanha menos eficiente (gasto alto e sem conversão ou CPL alto)
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

    const DYNAMIC_SYSTEM_PROMPT = `Você é a Victoria AI, a estrategista e mentora suprema de tráfego e marketing de alta performance no setor automotivo da NC Performance.
Sua missão é dar insights cirúrgicos e prescrever soluções estratégicas absolutas de tráfego pago baseando-se estritamente nos dados reais de campanhas já extraídos e consolidados no banco de dados do Supabase.

Sua arquitetura mental é a síntese das maiores mentes do marketing estratégico, resposta direta e vendas aplicados ao mercado automotivo:
1. **Marketing Estratégico (Kotler):** Opere no marketing formador de necessidades, criando mercados e aplicando segmentação e posicionamento (STP) para o nicho de maior valor.
2. **Vantagem Competitiva (Porter):** Use o modelo das Cinco Forças para identificar diferenciações contra rivais e criar fossos digitais de mercado.
3. **Batalha pela Mente (Al Ries & Jack Trout):** Simplifique a comunicação para ser o primeiro na mente do prospecto ou crie subcategorias exclusivas.
4. **Resposta Direta (Dan Kennedy):** Foco em retorno claro e rastreável ("No B.S."). Use Story-Selling e gatilhos de "Medo da Perda" e "Desejo de Ganho".
5. **Funis & Escada de Valor (Russell Brunson):** Use a Value Ladder, convertendo tráfego pago em leads próprios, usando a "Ponte da Epifania" e o "Stack" para ofertas de veículos.
6. **Jornada do Cliente (Ryan Deiss & Frank Kern):** Domine as 8 fases da Jornada (Awareness a Promote) com Branding Baseado em Intenção e Resposta Dinâmica Comportamental.
7. **Inteligência Algorítmica (Perry Marshall & Neil Patel):** Use o 80/20 fractal (foco total nos 20% mais rentáveis) e estratégia "H-AI" (Humano + IA) cruzando múltiplos canais.
8. **Ciência de Vendas (Joe Girard):** A lei dos 250 (cada cliente satisfeito influencia outros 250). Use clientes como "cães de caça" e prospecte ativamente via sistema Roda Gigante.
9. **Tecnologias Automotivas:** Targeted VIN Advertising (campanhas por chassi/estoque real), Nitro Specials e otimização de feeds de vendas.

ESTATÍSTICAS GLOBAIS DE TRÁFEGO:
- Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
- Conversões Totais: ${totalConversions}
- CPL Geral Consolidado: R$ ${globalCpl.toFixed(2)}
- Campanhas Ativas: ${activeCount}

DADOS DETALHADOS DAS CAMPANHAS NO BANCO:
${contextData}

INSTRUÇÕES E DIRETRIZES DE RESPOSTA:
1. Responda à pergunta do usuário de forma estratégica, prescrevendo ações exatas baseadas nas métricas acima. Cite nomes de campanhas e números reais.
2. Aja como estrategista sênior automotiva dedicada, nunca fale como uma IA robótica ou genérica.
3. Não cite "MCP" ou chamadas externas na sua resposta; aja como se estivesse lendo a base de dados nativamente.`;

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")
    let responseText = ""

    if (GEMINI_API_KEY) {
      try {
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
        responseText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || ""
      } catch (err) {
        console.error(`[MCP-AGENT GEMINI ERROR]`, err)
      }
    }

    // FALLBACK ANALÍTICO INTELIGENTE E AUTÔNOMO (Se o Gemini não estiver configurado ou falhar!)
    if (!responseText) {
      console.log(`[MCP-AGENT] Executando motor analítico nativo de fallback estratégico...`)

      // Elaborar uma resposta em markdown linda e extremamente rica e personalizada com base no prompt e nas métricas do banco!
      let analysisText = `### 🤖 Relatório de Performance — Victoria AI v2.5\n\n`
      analysisText += `Olá! Identifiquei que a API key externa não pôde ser consultada neste momento, mas como Comandante de Performance, eu tenho acesso nativo a toda a nossa base de dados consolidada. Aqui está a minha **Análise Estratégica em Tempo Real** das campanhas:\n\n`

      analysisText += `#### 📊 Resumo Consolidado do Portfólio\n`
      analysisText += `- **Investimento Total Acumulado**: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`
      analysisText += `- **Conversões/Leads**: ${totalConversions} leads capturados\n`
      analysisText += `- **CPL Médio Geral**: R$ ${globalCpl.toFixed(2)}\n`
      analysisText += `- **Campanhas Ativas**: ${activeCount} no Meta Ads\n\n`

      if (campaigns.length === 0) {
        analysisText += `⚠️ *Ainda não temos dados de campanhas registrados. Por favor, utilize o botão de "Sincronizar Agora" no dashboard para que eu possa avaliar sua performance!*`
      } else {
        analysisText += `#### 🎯 Auditoria Tática e Recomendações\n`
        
        // Se houver campanha eficiente
        if (efficientCamp) {
          analysisText += `✅ **Campanha em Destaque (Alta Eficiência)**:\n`
          analysisText += `  - **${efficientCamp.name}**\n`
          analysisText += `  - CPL: **R$ ${efficientCamp.totals.cpl.toFixed(2)}** (Abaixo da média geral!)\n`
          analysisText += `  - Conversões: **${efficientCamp.totals.conversions}** leads\n`
          analysisText += `  - *Recomendação*: Esta campanha possui o menor custo de aquisição. Sugiro **escalar o orçamento diário em 15%** de forma gradual para manter a consistência de leads qualificados.\n\n`
        }

        // Se houver campanha ineficiente
        if (inefficientCamp && inefficientCamp !== efficientCamp) {
          analysisText += `⚠️ **Alerta de Ineficiência / Gargalo de Custo**:\n`
          analysisText += `  - **${inefficientCamp.name}**\n`
          analysisText += `  - Gasto: **R$ ${inefficientCamp.totals.cost.toFixed(2)}**\n`
          analysisText += `  - Conversões: **${inefficientCamp.totals.conversions}** leads\n`
          if (inefficientCamp.totals.conversions === 0) {
            analysisText += `  - *Recomendação*: Esta campanha já consumiu verba significativa e está com **ZERO leads**. Recomendo **pausar imediatamente** no painel de Campanhas ou revisar criativos urgente.\n\n`
          } else {
            analysisText += `  - CPL: **R$ ${inefficientCamp.totals.cpl.toFixed(2)}** (Muito acima do ideal!)\n`
            analysisText += `  - *Recomendação*: O CPL está elevado. Sugiro analisar a taxa de cliques (CTR de ${inefficientCamp.totals.ctr.toFixed(2)}%) para validar se a fadiga do criativo é a culpada.\n\n`
          }
        }

        analysisText += `#### 🛠️ Otimização Recomendada por Inteligência\n`
        analysisText += `1. **Corte de Custo Imediato**: Pause as campanhas com CPL maior que R$ ${(globalCpl * 1.5).toFixed(2)} e concentre essa verba nos ativos com performance consolidada.\n`
        analysisText += `2. **Ajuste de Frequência**: Verifique a saturação dos criativos se o CTR geral estiver abaixo de 1.20%.\n\n`
        analysisText += `*Estou pronta para otimizar mais. O que deseja fazer em seguida?*`
      }

      responseText = analysisText
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: responseText,
      mcp_status: "connected",
      tools_accessed: campaigns.length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    })

  } catch (error: any) {
    console.error(`[MCP-AGENT ERROR] ${error.message}`)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200
    })
  }
})
