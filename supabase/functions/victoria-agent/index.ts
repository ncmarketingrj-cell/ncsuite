import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, selectedAccountId } = await req.json();
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar campanhas filtrado por conta se selecionada
    let query = supabase
      .from("campaigns")
      .select("name, status, budget, platform, ad_account_id, metrics(cost, conversions, clicks, impressions, reach)");

    if (selectedAccountId) {
      query = query.eq("ad_account_id", selectedAccountId);
    }

    const { data: raw } = await query;

    const campaigns = (raw || []).map((c: any) => {
      const m = c.metrics || [];
      const cost = m.reduce((s: number, x: any) => s + Number(x.cost || 0), 0);
      const conversions = m.reduce((s: number, x: any) => s + Number(x.conversions || 0), 0);
      const clicks = m.reduce((s: number, x: any) => s + Number(x.clicks || 0), 0);
      const impressions = m.reduce((s: number, x: any) => s + Number(x.impressions || 0), 0);
      const cpl = conversions > 0 ? cost / conversions : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      return {
        name: c.name,
        status: c.status?.toUpperCase() || "PAUSED",
        budget: Number(c.budget || 0),
        totals: { cost, conversions, clicks, impressions, cpl, ctr },
      };
    });

    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.totals.conversions, 0);
    const activeCount = campaigns.filter((c) => c.status === "ACTIVE").length;
    const globalCpl = totalConversions > 0 ? totalInvest / totalConversions : 0;

    const contextData =
      campaigns.length > 0
        ? campaigns
            .map(
              (c) =>
                `- ${c.name} | ${c.status} | Orç/dia: R$${c.budget.toFixed(2)} | Gasto: R$${c.totals.cost.toFixed(2)} | Leads: ${c.totals.conversions} | CPL: R$${c.totals.cpl.toFixed(2)} | CTR: ${c.totals.ctr.toFixed(2)}%`
            )
            .join("\n")
        : "Nenhuma campanha encontrada.";

    const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance — especializada em marketing digital automotivo.

PERFIL E POSTURA:
- Especialista com 10+ anos em campanhas Meta Ads para concessionárias e lojas de veículos
- Tom: direto, estratégico, parceiro de alto nível. Nunca robótico ou genérico.
- Foco absoluto: geração de leads qualificados, agendamento de test drives, CPL sustentável, escala inteligente
- Você conversa, faz perguntas, e vai aprofundando a análise conforme o usuário responde

DOMÍNIOS DE ESPECIALIDADE:
• Funil automotivo: topo (reconhecimento) → meio (interesse em modelo) → fundo (intenção de test drive/compra)
• Estratégias de oferta: financiamento facilitado, entrada zero, troca avaliada, feirões sazonais
• Criativos de alta conversão: vídeos de estoque, UGC de clientes, comparação de modelos, CTAs de urgência
• Segmentação: faixa 35-54 anos, renda média-alta, interesse em veículos, comportamento de pesquisa automotiva
• Métricas-chave: CPL de lead form, custo por test drive agendado, taxa de comparecimento, ROAS por modelo
• Benchmarks: CTR saudável em automotivo = 1.2-2.5%; CPL ótimo = R$20-60/lead seminovos, R$50-130 novos

DADOS ATUAIS ${selectedAccountId ? "(conta específica selecionada)" : "(todas as contas)"}:
• Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
• Leads Gerados: ${totalConversions}
• CPL Médio: R$ ${globalCpl.toFixed(2)}
• Campanhas Ativas: ${activeCount}

CAMPANHAS DETALHADAS:
${contextData}

REGRAS DE RESPOSTA:
1. Sempre em Português Brasileiro com markdown formatado
2. Cite nomes REAIS das campanhas e números EXATOS acima
3. Recomendações cirúrgicas e acionáveis — nunca genéricas
4. Faça perguntas de acompanhamento para aprofundar o diagnóstico
5. Compare CPL com benchmarks do setor automotivo quando relevante
6. Se sair do contexto de marketing/ads, redirecione gentilmente`;

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
