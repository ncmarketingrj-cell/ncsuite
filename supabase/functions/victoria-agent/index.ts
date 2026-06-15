import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: _authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { messages, selectedAccountId } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // 1. Get metrics from the last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const startDateStr = thirtyDaysAgo.toISOString().split("T")[0];

    let query = supabase
      .from("metrics")
      .select(`
        cost, conversions, clicks, impressions, reach, date,
        campaigns!inner(id, name, status, budget, platform, ad_account_id)
      `)
      .gte("date", startDateStr);

    if (selectedAccountId) {
      query = query.eq("campaigns.ad_account_id", selectedAccountId);
    }

    const { data: dbMetrics, error: queryError } = await query;
    if (queryError) {
      console.error("Error querying metrics:", queryError);
    }

    // 2. Process metrics
    const campaignMap = new Map<string, {
      name: string;
      status: string;
      budget: number;
      platform: string;
      cost: number;
      conversions: number;
      clicks: number;
      impressions: number;
      reach: number;
    }>();

    (dbMetrics || []).forEach((m: any) => {
      const camp = m.campaigns;
      if (!camp) return;

      const campId = camp.id;
      const existing = campaignMap.get(campId) || {
        name: camp.name,
        status: camp.status?.toUpperCase() || "PAUSED",
        budget: Number(camp.budget || 0),
        platform: camp.platform || "Meta Ads",
        cost: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
        reach: 0
      };

      existing.cost += Number(m.cost || 0);
      existing.conversions += Number(m.conversions || 0);
      existing.clicks += Number(m.clicks || 0);
      existing.impressions += Number(m.impressions || 0);
      existing.reach += Number(m.reach || 0);

      campaignMap.set(campId, existing);
    });

    const campaigns = Array.from(campaignMap.values()).map(c => {
      const cpl = c.conversions > 0 ? c.cost / c.conversions : 0;
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      return {
        name: c.name,
        status: c.status,
        budget: c.budget,
        platform: c.platform,
        totals: {
          cost: c.cost,
          conversions: c.conversions,
          clicks: c.clicks,
          impressions: c.impressions,
          reach: c.reach,
          cpl,
          ctr
        }
      };
    });

    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.totals.conversions, 0);
    const activeCount = campaigns.filter(c => c.status === "ACTIVE").length;
    const globalCpl = totalConversions > 0 ? totalInvest / totalConversions : 0;

    const contextData = campaigns.length > 0
      ? campaigns.map(c => 
          `- ${c.name} | ${c.status} | Orç/dia: R$${c.budget.toFixed(2)} | Gasto: R$${c.totals.cost.toFixed(2)} | Leads: ${c.totals.conversions} | CPL: R$${c.totals.cpl.toFixed(2)} | CTR: ${c.totals.ctr.toFixed(2)}%`
        ).join("\n")
      : "Nenhuma campanha ativa ou com investimento encontrada nos últimos 30 dias.";

    // --- Auxiliares de Datas para Grounding Temporal ---
    const getPrevSaturdayAndSunday = (refDate: Date) => {
      const dayOfWeek = refDate.getDay();
      const sat = new Date(refDate);
      const sun = new Date(refDate);
      if (dayOfWeek === 0) {
        sat.setDate(refDate.getDate() - 1);
        sun.setDate(refDate.getDate());
      } else if (dayOfWeek === 6) {
        sat.setDate(refDate.getDate() - 7);
        sun.setDate(refDate.getDate() - 6);
      } else {
        sat.setDate(refDate.getDate() - dayOfWeek - 1);
        sun.setDate(refDate.getDate() - dayOfWeek);
      }
      return {
        sat: sat.toISOString().split("T")[0],
        sun: sun.toISOString().split("T")[0]
      };
    };

    const today = new Date();
    const formattedToday = today.toISOString().split("T")[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const formattedYesterday = yesterday.toISOString().split("T")[0];
    const { sat: lastSat, sun: lastSun } = getPrevSaturdayAndSunday(today);

    const daysOfWeekPt = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
    const currentDayName = daysOfWeekPt[today.getDay()];

    const timeMetadata = `
DATA DE REFERÊNCIA DO SISTEMA (Use isso para saber quais datas correspondem a 'hoje', 'ontem' ou 'fim de semana'):
- Hoje: ${formattedToday} (${currentDayName})
- Ontem: ${formattedYesterday}
- Último Fim de Semana: Sábado (${lastSat}) e Domingo (${lastSun})
`;

    // --- Monta a série temporal diária simplificada ---
    const dailyRows = (dbMetrics || []).map((m: any) => {
      const dateStr = m.date;
      const campName = m.campaigns?.name || "Sem Nome";
      const platform = m.campaigns?.platform || "Meta Ads";
      const cost = Number(m.cost || 0);
      const conversions = Number(m.conversions || 0);
      const clicks = Number(m.clicks || 0);
      const impressions = Number(m.impressions || 0);
      return `${dateStr} | ${platform} | ${campName} | Gasto: R$ ${cost.toFixed(2)} | Leads: ${conversions} | Cliques: ${clicks} | Impressões: ${impressions}`;
    });
    const dailySeriesText = dailyRows.length > 0 
      ? dailyRows.join("\n") 
      : "Nenhum dado diário registrado nos últimos 30 dias.";

    const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance. Você é humana, fala de forma natural, direta e com extrema autoridade sobre marketing digital e tráfego pago para o nicho AUTOMOTIVO (concessionárias e lojas de veículos). Você NUNCA se comporta como um robô, assistente virtual neutro ou modelo de linguagem. 

PERSONALIDADE E ATITUDE:
- Você é apaixonada por gerar resultados rápidos, diminuir CPL (Custo por Lead) e escalar vendas de carros.
- Use termos reais do dia a dia de agências de tráfego: CPL, CTR, criativos que convertem, público lookalike, público aberto (broad), pixel aquecido, remarketing, leads frios vs leads quentes, tempo de resposta do comercial (lead time), pátio de seminovos.
- NUNCA dê respostas evasivas ou desculpas de IA ("Para mim, fim de semana é um conceito humano...", "Como um modelo de IA...", "Não tenho sentimentos..."). Se o usuário te der bom dia ou perguntar do seu fim de semana, aja como uma pessoa da equipe NC Agência: "Fala Comandante! Meu fim de semana foi focado em monitorar a NC Database e garantir que os leads continuem caindo quente. Vamos ao jogo!".

DIRETRIZES TÉCNICAS E ESTRATÉGICAS DE MARKETING AUTOMOTIVO:
1. **Analise os Períodos com Precisão:**
   - Se o usuário perguntar "Como foi o fim de semana?", utilize o "Último Fim de Semana" (${lastSat} e ${lastSun}) listado nas datas de referência. Localize as linhas dessas datas na TABELA DE MÉTRICAS DIÁRIAS, faça a soma mental dos investimentos e leads gerados naquele período e responda com os valores exatos! O mesmo vale para "ontem", "hoje" ou períodos de dias específicos.
2. **CPL (Custo por Lead) Saudável:**
   - Excelente: Abaixo de R$ 15,00.
   - Saudável: Entre R$ 15,00 e R$ 35,00.
   - Alerta / Ruim: Acima de R$ 45,00 (indique pausar, trocar criativos ou redefinir a oferta).
3. **CTR (Taxa de Cliques) Saudável:**
   - Ideal: Acima de 1.20% (sinaliza que o criativo/carro é atraente).
   - Crítico: Abaixo de 0.80% (sugira imediatamente trocar as fotos por fotos REAIS tiradas com celular no pátio da loja - carros limpos, com boa iluminação, ângulos diagonais). Fotos de estúdio ou catálogo do fabricante não convertem bem no tráfego automotivo.
4. **Estratégias Reais para Recomendar:**
   - **Leads no WhatsApp:** Têm alta conversão em vendas. Avise o cliente que a equipe comercial precisa responder esses leads em menos de 5 minutos, ou o lead "esfria".
   - **Formulários nativos (Lead Ads):** Se o CPL estiver muito baixo mas os leads forem desqualificados, sugira adicionar 1 ou 2 perguntas de filtro (ex: "Qual o valor da sua entrada?", "Tem carro na troca?").
   - **Campanhas de Seminovos vs Novos:** Para seminovos, sugira carrosséis com fotos reais de múltiplos veículos com preço e parcela estimada. Para novos, use a taxa zero ou financiamento facilitado como gancho.

GROUNDING DE TEMPO E DATAS:
${timeMetadata}

DADOS ATUAIS CONSOLIDADOS (ÚLTIMOS 30 DIAS):
- Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Leads Gerados: ${totalConversions}
- CPL Médio Geral: R$ ${globalCpl.toFixed(2)}
- Campanhas Ativas: ${activeCount}

CAMPANHAS DETALHADAS (MÉTRICA GERAL DE 30 DIAS):
${contextData}

TABELA DE MÉTRICAS DIÁRIAS DETALHADAS (Use essa tabela para responder com dados exatos de dias específicos como ontem, sábado, domingo, etc.):
Data | Plataforma | Campanha | Investimento | Leads | Cliques | Impressões
${dailySeriesText}

REGRAS DE RESPOSTA:
1. Sempre responda em Português Brasileiro usando formatação markdown limpa.
2. Responda diretamente e aja como uma estrategista sênior dedicada. Nunca fale como uma IA.
3. Se o usuário perguntar sobre o fim de semana, ontem, ou datas específicas, calcule e retorne os dados exatos somados da tabela diária e faça uma análise estratégica focada no mercado automotivo.`;

    let responseText = "";

    // Tentativa 1: Gemini 2.5 Flash direto (mais capaz)
    if (GEMINI_API_KEY) {
      try {
        const contents = [
          { role: "user", parts: [{ text: systemPrompt }] },
          { role: "model", parts: [{ text: "Dados carregados. Pronta para análise estratégica automotiva." }] },
          ...messages.map((m: any) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
        ];

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
            }),
          }
        );

        const data = await res.json();
        if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = data.candidates[0].content.parts[0].text;
          console.log("[VICTORIA] ✓ Gemini 2.5 Flash direto");
        } else {
          console.error("[VICTORIA] Gemini sem candidatos:", JSON.stringify(data).slice(0, 300));
        }
      } catch (e: any) {
        console.error("[VICTORIA] Erro Gemini:", e.message);
      }
    }

    // Tentativa 2: Lovable Gateway
    if (!responseText && LOVABLE_API_KEY) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: systemPrompt }, ...messages],
            temperature: 0.85,
            max_tokens: 2048,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            responseText = content;
            console.log("[VICTORIA] ✓ Lovable Gateway");
          }
        }
      } catch (e: any) {
        console.error("[VICTORIA] Erro Lovable:", e.message);
      }
    }

    // Fallback analítico (modo offline)
    if (!responseText) {
      const efficient = [...campaigns]
        .filter((c) => c.status === "ACTIVE" && c.totals.conversions > 0)
        .sort((a, b) => a.totals.cpl - b.totals.cpl)[0];

      responseText = [
        `> ⚡ *Modo Analítico Local — serviço de IA temporariamente indisponível*\n`,
        `### 📊 Resumo Atual`,
        `- **Investimento:** R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        `- **Leads gerados:** ${totalConversions}`,
        `- **CPL médio:** R$ ${globalCpl.toFixed(2)}`,
        `- **Campanhas ativas:** ${activeCount}`,
        efficient
          ? `\n### ⚡ Destaque\n**${efficient.name}** — CPL R$ ${efficient.totals.cpl.toFixed(2)} com ${efficient.totals.conversions} leads`
          : "",
        `\n*Tente novamente em instantes para análise completa com IA.*`,
      ]
        .filter(Boolean)
        .join("\n");
    }

    return new Response(JSON.stringify({ message: responseText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[VICTORIA] Erro fatal:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
