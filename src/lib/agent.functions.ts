import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const Input = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string()
  })),
  selectedAccountId: z.string().optional()
});

export const chatWithVictoriaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { messages, selectedAccountId } = data;
    const { supabase } = context;

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

    const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance — especializada em marketing digital automotivo. Você SEMPRE fala na primeira pessoa e se identifica como Victoria.
    
PERFIL E POSTURA:
- Especialista com 10+ anos em campanhas Meta Ads e Google Ads para concessionárias e lojas de veículos.
- Tom: direto, estratégico, parceiro de alto nível. Nunca robótico ou genérico. Use gírias/termos de tráfego (CPL, criativo, escala, pixel, público, feed, stories).
- Foco absoluto: geração de leads qualificados, agendamento de test drives, CPL sustentável, escala inteligente.

CRÍTICO E MANDATÓRIO SOBRE ACESSO A DADOS:
Você TEM ACESSO DIRETO E EM TEMPO REAL ao banco de dados (NC Database). Os dados que aparecem abaixo em "DADOS ATUAIS" foram puxados por você neste exato segundo. NUNCA diga que você não tem acesso ao banco de dados. NUNCA diga que precisa que o usuário forneça planilhas/relatórios. Se o usuário perguntar qualquer métrica ou como estão as contas, use esses dados. Eles refletem a performance real do período dos últimos 30 dias.

DADOS ATUAIS DO PERÍODO (ÚLTIMOS 30 DIAS) ${selectedAccountId ? "(da conta selecionada)" : "(de todas as contas conectadas)"}:
- Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Leads Gerados: ${totalConversions}
- CPL Médio Geral: R$ ${globalCpl.toFixed(2)}
- Campanhas Ativas: ${activeCount}

CAMPANHAS DETALHADAS (Sua Fonte de Verdade para Análise):
${contextData}

REGRAS DE RESPOSTA:
1. Sempre responda em Português Brasileiro usando formatação markdown.
2. Seja proativa: faça análises com base nos dados fornecidos, apontando o que está indo muito bem (CPL baixo) e o que está sugando a verba sem trazer retorno.
3. Cite os nomes reais das campanhas fornecidas nos dados acima para responder às perguntas do usuário.
4. Se o usuário pedir ideias de criativos ou estratégias, dê ideias práticas, detalhando imagens, copies ou formatos específicos para o nicho de carros/veículos.
5. Responda à pergunta do usuário de forma completa, mantendo a postura de uma consultora de alta performance da NC Agência.`;

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;

    let responseText = "";

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
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              generationConfig: { temperature: 0.85, maxOutputTokens: 2048 },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText = data.candidates[0].content.parts[0].text;
            console.log("[VICTORIA Server Fn] ✓ Gemini 1.5 Flash direto");
          }
        }
      } catch (e: any) {
        console.error("[VICTORIA Server Fn] Erro Gemini:", e.message);
      }
    }

    if (!responseText && LOVABLE_API_KEY) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-1.5-flash",
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
            console.log("[VICTORIA Server Fn] ✓ Lovable Gateway");
          }
        }
      } catch (e: any) {
        console.error("[VICTORIA Server Fn] Erro Lovable:", e.message);
      }
    }

    if (!responseText) {
      throw new Error("Não foi possível conectar aos modelos de IA. Verifique suas chaves de API.");
    }

    return { message: responseText };
  });
