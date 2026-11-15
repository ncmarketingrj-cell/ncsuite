import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AnalyzeInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
  niche: z.string().default("Geral / Negócios"),
  location: z.string().default("Brasil"),
  accountName: z.string().optional(),
  objectiveLabel: z.string().optional(),
  optimizationGoal: z.string().optional(),
  resultUnitLabel: z.string().optional(),
  brandRules: z.string().optional(),
});


export type CreativeAIAnalysis = {
  nicheEvaluation: string;
  conversionProbability: "Alta" | "Média" | "Baixa";
  score: number;
  persuasionScore: number;
  attractionScore: number;
  marketingAlignment: string;
  detectedElements: string[];
  strengths: string[];
  weaknesses: string[];
  actionableImprovements: string[];
  newCreativeIdeas: {
    concept: string;
    hookText: string;
    visualDescription: string;
    psychologicalTriggers: string[];
  }[];
};

export const analyzeCreativeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const isAuto =
      /auto|veic|carro|moto|concession|loja.*auto/i.test(`${data.niche} ${data.accountName || ""}`);

    const objectiveContext = data.objectiveLabel || data.resultUnitLabel
      ? `Objetivo da Campanha: ${data.objectiveLabel || "Conforme conta"} | Optimization Goal: ${data.optimizationGoal || "Não especificado"} | Unidade Oficial de Resultado: ${data.resultUnitLabel || "Conforme objetivo"}`
      : "Objetivo da Campanha: Não vinculado (avaliar clareza visual, oferta, contraste e CTA sem assumir objetivo único)";

    const systemPrompt = `Você é o Diretor Criativo de Performance AI da NC Suite, especialista em análise visual, atenção em feed/stories/reels, clareza de proposta de valor e resposta direta em Meta Ads.

Conta / Cliente: ${data.accountName || "Não especificado"}
Nicho / Mercado informado: ${data.niche}
Localização do Público-Alvo: ${data.location}
${objectiveContext}
${data.brandRules ? `Regras e restrições da marca: ${data.brandRules}` : ""}

REGRAS OBRIGATÓRIAS:
- NÃO invente fatos comerciais (preço, ano, km, estoque, prazo, garantia) que não estejam visíveis na peça ou informados pelo usuário.
- NÃO assuma que a conta otimiza para WhatsApp ou Leads se o objetivo informado for Vendas, Alcance, Tráfego ou Visualizações.
- NÃO cite benchmarks numéricos fixos de CTR ou CPL como verdade universal; comente hipóteses qualitativas e sugestões de teste ligadas ao objetivo real.
${isAuto ? "- Como o nicho informado é automotivo, observe ângulo, iluminação, recorte do veículo, transparência de condições e facilidade de leitura mobile." : "- Avalie o criativo respeitando o nicho real do cliente, sem forçar referências automotivas se não aplicáveis."}

FRAMEWORK DE ANÁLISE:
1. CLAREZA DE PROPOSTA & HIERARQUIA VISUAL (3 segundos, foco mobile, contraste tipográfico)
2. ADERÊNCIA AO OBJETIVO & CTA (compatibilidade entre mensagem visual, destino e ação esperada)
3. OPORTUNIDADES DE TESTE A/B (gancho, ângulo, prova social, formato)

Retorne OBRIGATORIAMENTE um JSON válido:
{
  "nicheEvaluation": "Análise detalhada do alinhamento com o nicho do cliente, objetivo da campanha e público local",
  "conversionProbability": "Alta" | "Média" | "Baixa",
  "score": número de 0 a 100,
  "persuasionScore": número de 0 a 100,
  "attractionScore": número de 0 a 100,
  "marketingAlignment": "Análise do estágio do funil e compatibilidade com o evento de otimização e CTA (sem inventar metas numéricas)",
  "detectedElements": ["elementos visuais observados de fato na imagem: produto/veículo, texto visível, CTA, logo, pessoa, cenário"],
  "strengths": ["pelo menos 3 pontos fortes observados na peça"],
  "weaknesses": ["pelo menos 3 oportunidades de melhoria ou falhas visuais/comunicacionais"],
  "actionableImprovements": ["pelo menos 3 melhorias práticas específicas para teste no nicho do cliente"],
  "newCreativeIdeas": [
    {
      "concept": "Conceito estratégico (sugestão de teste — manter fatos reais fornecidos pelo usuário)",
      "hookText": "Headline/gancho sugerido para o objetivo informado",
      "visualDescription": "Descrição visual sugerida: composição, foco no produto, hierarquia de leitura e espaço para oferta editável",
      "psychologicalTriggers": ["gatilhos sugeridos compatíveis com o objetivo"]
    },
    {
      "concept": "Segundo conceito com ângulo diferente (ex: racional/prova social vs emocional/autoridade)",
      "hookText": "Headline alternativa (sugestão)",
      "visualDescription": "Descrição visual detalhada mantendo consistência com a marca",
      "psychologicalTriggers": ["gatilhos sugeridos"]
    }
  ]
}

Análise rigorosa, profissional e de altíssima qualidade técnica. Em português pt-BR. Somente o JSON, sem texto adicional.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analise este criativo de anúncio focado no nicho de ${data.niche} em ${data.location}. Seja cirúrgico e específico para o mercado automotivo brasileiro.`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` },
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("AI gateway error", res.status, body);
      throw new Error(`Falha na análise do criativo (${res.status})`);
    }

    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    let parsed: CreativeAIAnalysis;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Não foi possível decodificar a resposta da IA como JSON");
      }
    }
    return parsed;
  });

