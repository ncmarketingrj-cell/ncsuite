import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  VICTORIA_DEFAULT_OPERATIONAL_MODE,
  enforceServerPostLlmGuardrails,
  sanitizeVictoriaServerOutput,
  generateDeterministic10SectionAnalysis,
} from "../_shared/victoriaCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-victoria-contract-version, x-victoria-prompt-version, x-victoria-request-id, x-victoria-context-hash",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const _authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const {
      data: { user },
      error: _authErr,
    } = await _authClient.auth.getUser(authHeader.replace("Bearer ", ""));

    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { metrics, context, analysisContext } = body || {};

    if (!metrics && !analysisContext) {
      return new Response(
        JSON.stringify({ error: "analysisContext or metrics object is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const operationalMode = VICTORIA_DEFAULT_OPERATIONAL_MODE;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    const systemPrompt = `Você é a Victoria AI (Contrato Canônico ${VICTORIA_CONTRACT_VERSION} | Prompt ${VICTORIA_PROMPT_VERSION}), estrategista sênior de tráfego pago no setor automotivo.
MODO OPERACIONAL: ${operationalMode} (terminantemente proibido emitir json:action ou propor alteração de orçamento em janelas < 3 dias).

REGRAS OBRIGATÓRIAS:
1. Inicie respondendo: "O que esta campanha foi configurada para otimizar?"
2. Estruture obrigatoriamente nas 10 seções oficiais:
   1. Escopo analisado
   2. Objetivo e evento oficial
   3. Leitura factual
   4. Indicadores primários e secundários
   5. Limitações e dados ausentes
   6. Hipóteses
   7. Recomendações seguras
   8. Plano de validação
   9. Nível de confiança
   10. Fontes e documentos utilizados
3. Respeite estritamente a unidade do objetivo:
   - Mensagens (MESSAGES): Custo por conversa (conversas iniciadas).
   - Alcance (REACH / OUTCOME_AWARENESS): Custo por 1.000 pessoas alcançadas (TERMINANTEMENTE PROIBIDO chamar de CPL!).
   - Visitas ao perfil (INSTAGRAM_PROFILE): Custo por visita ao perfil (PROIBIDO chamar de CPL!).
   - Landing Page Views: Custo por visualização da página de destino (PROIBIDO chamar de CPL!).
   - Cliques no link: CPC (custo por clique no link) (PROIBIDO chamar de CPL!).
   - Leads (LEADS): CPL (custo por lead).
4. PROIBIDO comparar métricas de unidades diferentes (ex.: CPM com Custo por conversa ou CPL).
5. Em Alcance, trate CTR de link como métrica estritamente secundária.
6. Em janela de 1–2 dias, declare Confiança BAIXA e não prescreva pausas definitivas nem alteração de verba.
7. Analise EXCLUSIVAMENTE a entidade fornecida; nunca mencione outras campanhas ou invente benchmarks.`;

    const userMessage = `Analise os dados abaixo seguindo rigorosamente as 10 seções do Contrato ${VICTORIA_CONTRACT_VERSION}:

CONTEXTO: ${context || "Análise isolada"}
CONTRATO CANÔNICO:
${JSON.stringify(analysisContext || metrics, null, 2)}`;

    let rawInsight = "";
    try {
      if (LOVABLE_API_KEY) {
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
            max_tokens: 1800,
          }),
        });
        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          rawInsight = aiData.choices?.[0]?.message?.content || "";
        }
      } else if (GEMINI_API_KEY) {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${GEMINI_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
              ],
              temperature: 0.2,
              max_tokens: 1800,
            }),
          }
        );
        if (gRes.ok) {
          const gData = await gRes.json();
          rawInsight = gData.choices?.[0]?.message?.content || "";
        }
      }
    } catch (modelErr) {
      console.warn("ai-insights model fallback:", modelErr);
    }

    const effectiveCtx = analysisContext || {
      contract_version: VICTORIA_CONTRACT_VERSION,
      prompt_version: VICTORIA_PROMPT_VERSION,
      entity_id: String(metrics?.id || metrics?.name || "legacy_metrics"),
      entity_level: String(metrics?.type || "campaign"),
      entity_name: String(metrics?.name || "Campanha"),
      ad_account_name: "Conta Meta Ads",
      ad_account_id: String(metrics?.ad_account_id || "all"),
      period: { date_from: "", date_to: "", days_count: 1 },
      optimization: {
        odax_objective: metrics?.objective || "UNSPECIFIED",
        optimization_goal: metrics?.optimization_goal || "UNSPECIFIED",
        category: String(metrics?.result_type || metrics?.objective || "").toUpperCase().includes("AWARENESS") ||
          String(metrics?.result_type || "").toUpperCase() === "REACH"
          ? "REACH"
          : "MESSAGES",
      },
      result_indicator: {
        code: String(metrics?.result_type || "unknown").toLowerCase(),
        label_plural:
          String(metrics?.result_type || "").toUpperCase() === "REACH"
            ? "pessoas alcançadas"
            : "resultados",
        cost_label:
          String(metrics?.result_type || "").toUpperCase() === "REACH"
            ? "Custo por 1.000 pessoas alcançadas"
            : "Custo por resultado",
        unit: "BRL",
        source: "metrics",
      },
      financial: { spend: Number(metrics?.spend || 0) },
      raw_metrics: {
        result_value: Number(metrics?.conversions || 0),
        cost_per_result: metrics?.cpl ?? null,
        impressions: Number(metrics?.impressions || 0),
        reach: Number(metrics?.reach || 0),
        frequency: Number(metrics?.frequency || 0),
        link_clicks: Number(metrics?.clicks || 0),
        all_clicks: Number(metrics?.clicks || 0),
        ctr_link: Number(metrics?.ctr || 0),
        ctr_all: Number(metrics?.ctr || 0),
        cpm: Number(metrics?.cpm || 0),
        cpc_link: Number(metrics?.cpc || 0),
      },
    };

    const guarded = rawInsight
      ? enforceServerPostLlmGuardrails(rawInsight, effectiveCtx, [], operationalMode)
      : {
          text: sanitizeVictoriaServerOutput(
            generateDeterministic10SectionAnalysis(effectiveCtx, []),
            effectiveCtx,
            operationalMode
          ),
          replacedByDeterministic: true,
          reasons: ["model_unavailable"],
        };

    return new Response(
      JSON.stringify({
        insight: guarded.text,
        reply: guarded.text,
        request_id: analysisContext?.request_id || null,
        analysis_context_hash: analysisContext?.analysis_context_hash || null,
        ad_account_id: analysisContext?.ad_account_id || null,
        entity_level: analysisContext?.entity_level || null,
        entity_id: analysisContext?.entity_id || null,
        date_from: analysisContext?.period?.date_from || null,
        date_to: analysisContext?.period?.date_to || null,
        result_indicator: analysisContext?.result_indicator?.code || null,
        contract_version: VICTORIA_CONTRACT_VERSION,
        prompt_version: VICTORIA_PROMPT_VERSION,
        operational_mode: operationalMode,
        replaced_by_deterministic: guarded.replacedByDeterministic,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "X-Victoria-Contract-Version": VICTORIA_CONTRACT_VERSION,
          "X-Victoria-Prompt-Version": VICTORIA_PROMPT_VERSION,
        },
      }
    );
  } catch (e: any) {
    console.error("ai-insights error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
