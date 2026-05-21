import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const AnalyzeInput = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
  niche: z.string().default("Mercado Automotivo"),
  location: z.string().default("Rio de Janeiro"),
});

const GenerateInput = z.object({
  prompt: z.string().min(1),
  aspectRatio: z.enum(["1:1", "16:9", "9:16", "4:3"]).default("1:1"),
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

export type GeneratedImage = {
  imageBase64: string;
  mimeType: string;
};

export const analyzeCreativeFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => AnalyzeInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const systemPrompt = `Você é o Diretor Criativo de Performance AI da NC Suite, especializado em neuro-marketing automotivo, psicologia de consumo e tráfego pago de alta conversão para concessionárias e lojas de veículos.

Nicho/Mercado: ${data.niche}
Localização do Público-Alvo: ${data.location}

FRAMEWORK DE ANÁLISE:

1. PERSUASÃO & NEURO-MARKETING AUTOMOTIVO
- Ganchos emocionais: aspiração (status, liberdade, família), praticidade (econômico, seguro, espaçoso) ou urgência (estoque limitado, condição especial)
- Gatilhos específicos do setor: facilidade de crédito, parcelamento acessível, garantia, procedência, blindagem
- Direção do olhar e hierarquia visual (modelo do veículo → oferta → CTA)
- Clareza da proposta de valor em 3 segundos

2. ATRAÇÃO VISUAL & HOOK RATE
- Qualidade fotográfica/visual do veículo (ângulo, iluminação, fundo)
- Legibilidade imediata das condições comerciais (preço, parcela, entrada)
- Impacto visual para Mobile (96% das conversões vêm do celular no automotivo)
- Contraste e hierarquia tipográfica

3. FUNIL DE CONVERSÃO AUTOMOTIVO
- Adequação ao estágio do funil: TOPO (awareness de marca/modelo) | MEIO (comparação/interesse) | FUNDO (intenção de test drive/compra)
- Eficiência do CTA: test drive, simulação de financiamento, "saiba o preço", WhatsApp, ligação direta
- Presença de elementos de confiança: nome da concessionária, CNPJ, prazo de oferta

4. BENCHMARKS DO SETOR
- CTR saudável em automotivo: 1.2% – 2.5%
- CPL alvo: R$20-60 (seminovos populares) a R$50-130 (novos/premium)
- Criativos de melhor performance: vídeo de estoque com narração, foto de destaque + condição clara, UGC com cliente na entrega

Retorne OBRIGATORIAMENTE um JSON válido:
{
  "nicheEvaluation": "Análise detalhada do alinhamento com o nicho automotivo e mercado local, incluindo adequação ao perfil do comprador da região",
  "conversionProbability": "Alta" | "Média" | "Baixa",
  "score": número de 0 a 100,
  "persuasionScore": número de 0 a 100,
  "attractionScore": número de 0 a 100,
  "marketingAlignment": "Análise do posicionamento Inbound/Outbound e do estágio no funil automotivo, com recomendações de copy e CTA",
  "detectedElements": ["elementos visuais detectados: modelo do veículo, texto de oferta, CTA, logo, pessoa, cenário..."],
  "strengths": ["pelo menos 3 pontos fortes sob olhar de marketing automotivo de alta performance"],
  "weaknesses": ["pelo menos 3 oportunidades perdidas ou falhas críticas de conversão"],
  "actionableImprovements": ["pelo menos 3 melhorias práticas e imediatas específicas para o nicho automotivo"],
  "newCreativeIdeas": [
    {
      "concept": "Conceito estratégico do novo criativo — ângulo criativo e objetivo de conversão",
      "hookText": "Headline/gancho matador específico para o mercado automotivo brasileiro",
      "visualDescription": "Descrição visual detalhada: cenário, veículo, modelo, cores, composição, elementos de oferta, CTA visual — suficiente para um designer ou IA gerar a imagem",
      "psychologicalTriggers": ["gatilhos psicológicos: ex. Urgência por Estoque, Prova Social, Facilidade de Crédito, Status Social"]
    },
    {
      "concept": "Segundo conceito com ângulo diferente (ex: se o primeiro é emocional, esse é racional/oferta)",
      "hookText": "Headline alternativa",
      "visualDescription": "Descrição visual detalhada para geração",
      "psychologicalTriggers": ["gatilhos psicológicos"]
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
        response_format: { type: "json_object" },
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

export const generateCreativeImageFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => GenerateInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada");

    const enhancedPrompt = `Professional Brazilian automotive advertisement, high quality commercial photography, ${data.prompt}, modern dealership marketing material, ultra-realistic, vibrant colors, sharp focus, 4K quality`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instances: [{ prompt: enhancedPrompt }],
          parameters: {
            sampleCount: 1,
            aspectRatio: data.aspectRatio,
            safetyFilterLevel: "block_few",
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text();
      console.error("Imagen API error:", res.status, body);
      throw new Error(`Falha na geração de imagem (${res.status})`);
    }

    const json = await res.json();
    const prediction = json.predictions?.[0];
    if (!prediction?.bytesBase64Encoded) {
      throw new Error("Nenhuma imagem foi gerada pela IA");
    }

    return {
      imageBase64: prediction.bytesBase64Encoded,
      mimeType: prediction.mimeType || "image/png",
    } as GeneratedImage;
  });
