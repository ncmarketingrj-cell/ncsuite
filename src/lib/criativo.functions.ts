import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
  niche: z.string().default("Mercado Automotivo"),
  location: z.string().default("Rio de Janeiro"),
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
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const systemPrompt = `Você é o Diretor Criativo de Performance AI da NC Suite, especializado em neuro-marketing, psicologia de consumo e tráfego pago de alta conversão.
Sua missão é realizar uma Análise Visual e Estrutural extremamente aprofundada de criativos de anúncios (imagens ou frames de vídeos) no nicho/mercado e localização informados pelo usuário.

Nicho/Mercado Atual: ${data.niche}
Localização do Público-Alvo: ${data.location}

Avalie o criativo sob as seguintes técnicas científicas de marketing:
1. Persuasão & Neuro-marketing (Ganchos mentais, contraste de cores, direção do olhar, clareza da proposta de valor, gatilhos de urgência, escassez ou autoridade).
2. Atração Visual & Hook Rate (Foco visual central, legibilidade imediata das fontes, cores predominantes, composição estética, impacto nos primeiros 3 segundos).
3. Alinhamento com Inbound Marketing (Geração de valor implícito, facilidade de entendimento, apelo de conexão e educação do lead).
4. Alinhamento com Outbound Marketing (Força da chamada para ação - CTA direta, oferta irresistível explícita, clareza na dor que resolve).

Retorne OBRIGATORIAMENTE um JSON válido com a seguinte estrutura rica:
{
  "nicheEvaluation": "Descreva com detalhes técnicos o alinhamento com o nicho de mercado especificado e a relevância geográfica informada",
  "conversionProbability": "Alta" | "Média" | "Baixa",
  "score": número de 0 a 100 da nota geral do criativo,
  "persuasionScore": número de 0 a 100 de força persuasiva,
  "attractionScore": número de 0 a 100 de apelo de atração visual,
  "marketingAlignment": "Análise aprofundada da integração entre técnicas Inbound/Outbound e dicas de posicionamento de copy",
  "detectedElements": ["lista de elementos detectados na imagem, ex: carro esportivo, texto em caixa alta, pessoa sorrindo, CTA nítida"],
  "strengths": ["pelo menos 3 pontos fortes do criativo sob o olhar de marketing de alta performance"],
  "weaknesses": ["pelo menos 3 pontos fracos, falhas ou oportunidades perdidas no criativo"],
  "actionableImprovements": ["pelo menos 3 melhorias práticas e acionáveis para otimizar esse criativo na hora"],
  "newCreativeIdeas": [
    {
      "concept": "Conceito inovador do novo criativo sugerido",
      "hookText": "Texto de Gancho/Headline matador recomendado para aplicar no anúncio",
      "visualDescription": "Descrição detalhada do cenário visual, cores e dinâmica que o criativo deve ter",
      "psychologicalTriggers": ["gatilhos psicológicos utilizados, ex: Prova Social, Reciprocidade, Autoridade"]
    },
    {
      "concept": "Outro conceito de criativo alternativo focado em outro ângulo",
      "hookText": "Texto de Gancho/Headline recomendado",
      "visualDescription": "Descrição visual do cenário",
      "psychologicalTriggers": ["gatilhos psicológicos"]
    }
  ]
}

Sua análise deve ser rigorosa, séria, profissional e de altíssima qualidade técnica. Responda em português pt-BR do Brasil. Não inclua nenhuma introdução ou texto fora do JSON.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: `Analise cientificamente este criativo de anúncio focado no nicho de ${data.niche} em ${data.location}.` },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
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
