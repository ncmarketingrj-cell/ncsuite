import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase-external/auth-middleware";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { classifyMetaEvent, computeUnitCost } from "@/lib/metricsDomain";
import {
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  VICTORIA_ANALYTICAL_TEMPERATURE,
} from "@/lib/victoriaContract";
import {
  isReadOnlyAnalysisRequest,
  stripJsonActionBlocks,
} from "@/lib/victoriaGovernance";

function getEnvVariable(name: string): string | undefined {
  // 1. Check process.env
  if (process.env[name]) return process.env[name];

  // 2. Check import.meta.env
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv[name]) return metaEnv[name];

  // 3. Manually parse .env in workspace root
  try {
    const envPath = path.resolve(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      const lines = envContent.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
          const parts = trimmed.split("=");
          const key = parts[0].trim();
          let val = parts.slice(1).join("=").trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          if (key === name) {
            return val;
          }
        }
      }
    }
  } catch (err) {
    console.error("Error reading .env manually:", err);
  }

  return undefined;
}

const Input = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    image: z.object({
      base64: z.string(),
      mimeType: z.string()
    }).optional()
  })),
  selectedAccountId: z.string().optional()
});

export const chatWithVictoriaFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data, context }) => {
    const { messages, selectedAccountId } = data;
    const { supabase } = context;

    // 1. Fetch ad accounts for the current logged-in user to ensure isolation
    const userId = context.userId;
    const { data: userAccounts } = await (supabase as any)
      .from("ad_accounts")
      .select("id")
      .eq("user_id", userId);

    const adAccountIds = (userAccounts || []).map((acc: any) => acc.id);

    let dbMetrics: any[] = [];
    if (adAccountIds.length > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDateStr = thirtyDaysAgo.toISOString().split("T")[0];

      let query = supabase
        .from("metrics")
        .select(`
          cost, conversions, clicks, impressions, reach, result_type, date, client_id,
          campaigns!inner(id, name, status, budget, objective, platform, ad_account_id, external_id)
        `)
        .in("campaigns.ad_account_id", adAccountIds)
        .gte("date", startDateStr);

      if (selectedAccountId) {
        query = query.eq("campaigns.ad_account_id", selectedAccountId);
      }

      const { data, error: queryError } = await query;
      if (queryError) {
        console.error("Error querying metrics:", queryError);
      } else {
        dbMetrics = data || [];
      }
    }

    // 2. Process metrics
    const campaignMap = new Map<string, {
      name: string;
      status: string;
      budget: number;
      objective: string;
      result_type: string;
      platform: string;
      external_id?: string;
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
        objective: camp.objective || "",
        result_type: m.result_type || "",
        platform: camp.platform || "Meta Ads",
        external_id: camp.external_id,
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
      if (!existing.result_type && m.result_type) existing.result_type = m.result_type;

      campaignMap.set(campId, existing);
    });

    const campaigns = Array.from(campaignMap.entries()).map(([id, c]) => {
      const cls = classifyMetaEvent({
        campaignName: c.name,
        rawObjective: c.objective,
        resultType: c.result_type,
      });
      const resultDenom = cls.category === "REACH" ? (c.reach > 0 ? c.reach : c.conversions) : c.conversions;
      const unitCost = computeUnitCost(c.cost, resultDenom, cls.category);
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      return {
        id,
        name: c.name,
        status: c.status,
        budget: c.budget,
        platform: c.platform,
        external_id: c.external_id,
        classification: cls,
        totals: {
          cost: c.cost,
          conversions: resultDenom,
          clicks: c.clicks,
          impressions: c.impressions,
          reach: c.reach,
          unitCost,
          ctr
        }
      };
    });

    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);
    const activeCount = campaigns.filter(c => c.status === "ACTIVE").length;
    const msgLeadCamps = campaigns.filter(
      c => c.classification.category === "MESSAGES" || c.classification.category === "LEADS"
    );
    const msgLeadInvest = msgLeadCamps.reduce((s, c) => s + c.totals.cost, 0);
    const msgLeadResults = msgLeadCamps.reduce((s, c) => s + c.totals.conversions, 0);
    const comparableCpl = msgLeadResults > 0 ? msgLeadInvest / msgLeadResults : null;

    const contextData = campaigns.length > 0
      ? campaigns.map(c =>
          `- ID: ${c.id} | ExtID: ${c.external_id} | ${c.name} | ${c.status} | Categoria: ${c.classification.category} | Orç/dia: R$${c.budget.toFixed(2)} | Gasto: R$${c.totals.cost.toFixed(2)} | ${c.classification.unitPlural}: ${c.totals.conversions} | ${c.classification.costUnitLabel}: ${c.totals.unitCost !== null ? `R$${c.totals.unitCost.toFixed(2)}` : "N/D"} | CTR: ${c.totals.ctr.toFixed(2)}%`
        ).join("\n")
      : "Nenhuma campanha ativa ou com investimento encontrada nos últimos 30 dias.";

    // --- Auxiliares de Datas para Grounding Temporal ---
    const getPrevSaturdayAndSunday = (refDate: Date) => {
      const dayOfWeek = refDate.getDay(); // 0 is Sunday, 1 is Monday, ..., 6 is Saturday
      const sat = new Date(refDate);
      const sun = new Date(refDate);
      if (dayOfWeek === 0) { // Domingo
        sat.setDate(refDate.getDate() - 1);
        sun.setDate(refDate.getDate());
      } else if (dayOfWeek === 6) { // Sábado
        sat.setDate(refDate.getDate() - 7);
        sun.setDate(refDate.getDate() - 6);
      } else { // Segunda a Sexta
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

    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user")?.content || "";
    const isReadOnly = isReadOnlyAnalysisRequest(lastUserMessage);

    const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance (Contrato Canônico ${VICTORIA_CONTRACT_VERSION}, Prompt ${VICTORIA_PROMPT_VERSION}, modo ${isReadOnly ? "READ_ONLY_ANALYSIS" : "ACTION_PROPOSAL"}). Você analisa campanhas exclusivamente com base nos dados reais e unidades oficiais registradas na conta.

REGRAS CRÍTICAS DE UNIDADE E GOVERNANÇA:
1. **Respeite o Objetivo Oficial de Cada Campanha:**
   - Campanha de ALCANCE (REACH): a métrica oficial é Pessoas Alcançadas e Custo por 1.000 pessoas alcançadas (NUNCA chame de CPL ou Lead).
   - Campanha de MENSAGENS: a métrica oficial é Conversa iniciada por mensagem e Custo por conversa.
   - Campanha de VISITAS AO PERFIL: Visitas ao perfil do Instagram e Custo por visita ao perfil.
   - Nunca misture métricas ou unidades entre campanhas de objetivos diferentes.
2. **Moderação de Certeza e Limitações:**
   - Se a amostra for curta (ex.: < 3 dias) ou faltarem dados de criativo/copy/público/funil, declare confiança BAIXA/MÉDIA e formule hipóteses sem afirmações categóricas.
3. **Modo Somente Leitura (${isReadOnly ? "ATIVO" : "DESATIVADO"}):**
   - Por padrão, NÃO emita blocos \`json:action\` nem ordens mutáveis de alteração de orçamento ou pausa sem solicitação explícita e confirmação formal.

GROUNDING DE TEMPO E DATAS:
${timeMetadata}

DADOS ATUAIS CONSOLIDADOS (ÚLTIMOS 30 DIAS):
- Investimento Total da Conta: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Campanhas de Leads/Mensagens Elegíveis: ${msgLeadResults} resultados | Custo Médio Homogêneo (CPL/Conversa): ${comparableCpl !== null ? `R$ ${comparableCpl.toFixed(2)}` : "N/D"}
- Campanhas Ativas: ${activeCount}

CAMPANHAS DETALHADAS (MÉTRICA GERAL DE 30 DIAS):
${contextData}

TABELA DE MÉTRICAS DIÁRIAS DETALHADAS:
Data | Plataforma | Campanha | Investimento | Resultados (do objetivo) | Cliques | Impressões
${dailySeriesText}

REGRAS DE RESPOSTA:
1. Responda sempre em Português Brasileiro usando Markdown estruturado.
2. Nunca invente percentuais ou métricas que não estejam explícitas nos dados acima.
3. Bloqueio de Ações em Somente Leitura: se READ_ONLY_ANALYSIS estiver ativo, não gere blocos json:action.`;

    const GEMINI_API_KEY = getEnvVariable("GEMINI_API_KEY");
    const LOVABLE_API_KEY = getEnvVariable("LOVABLE_API_KEY");

    let responseText = "";

    if (GEMINI_API_KEY) {
      try {
        const contents = messages
          .map((m: any) => {
            const parts: any[] = [];
            if (m.content && m.content.trim() !== "") {
              parts.push({ text: m.content });
            }
            if (m.image) {
              parts.push({
                inlineData: {
                  mimeType: m.image.mimeType,
                  data: m.image.base64
                }
              });
            }
            return {
              role: m.role === "assistant" ? "model" : "user",
              parts
            };
          })
          .filter((m: any) => m.parts.length > 0);

        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              },
              generationConfig: { temperature: VICTORIA_ANALYTICAL_TEMPERATURE, maxOutputTokens: 2048 },
            }),
          }
        );

        if (res.ok) {
          const data = await res.json();
          if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
            responseText = data.candidates[0].content.parts[0].text;
            console.log("[VICTORIA Server Fn] ✓ Gemini 2.5 Flash direto");
          } else {
            console.warn("[VICTORIA Server Fn] Gemini respondido sem texto:", JSON.stringify(data));
          }
        } else {
          const errText = await res.text();
          console.error("[VICTORIA Server Fn] Gemini API error:", res.status, errText);
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
            model: "google/gemini-2.5-flash",
            messages: [{ role: "system", content: systemPrompt }, ...messages],
            temperature: VICTORIA_ANALYTICAL_TEMPERATURE,
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

    const safeResponse = isReadOnly
      ? stripJsonActionBlocks(responseText).cleanText
      : responseText;

    return { message: safeResponse };
  });
