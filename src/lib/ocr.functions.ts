import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
});

export type ExtractedCampaign = {
  name: string;
  status?: string;
  budget?: number;
  cost?: number;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  reach?: number;
  cpl?: number;
  result_type?: string;
  platform?: "meta" | "google";
};

export const extractPrintFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const systemPrompt = `Você é um motor de extração de dados de prints de dashboards de tráfego pago (Gerenciador de Anúncios do Meta Ads ou painel do Google Ads). Receba a imagem, identifique a plataforma do print (Meta Ads ou Google Ads) e extraia a lista de campanhas e suas métricas correspondentes.

Instruções cruciais para a extração:
1. Identifique as colunas baseando-se no cabeçalho da tabela:
   - Nome: 'Campanha', 'Nome da campanha' ou 'Campaign name' -> name
   - Impressões: 'Impr.', 'Impressões' ou 'Impressions' -> impressions
   - Cliques: 'Cliques' ou 'Clicks' -> clicks
   - Custo: 'Custo', 'Valor gasto', 'Cost' ou 'Amount spent' -> cost
   - Conversões: 'Conversões', 'Resultados', 'Results' ou 'Conversions' -> conversions (número absoluto)
   - Custo por conversão: 'Custo / conv.', 'Custo por resultado', 'CPL', 'CPA', 'Cost per result' -> cpl (valor monetário unitário)
   - Alcance: 'Alcance' ou 'Reach' -> reach (frequentemente ausente no Google Ads, use null)
   - Tipo de Resultado: 'Tipo de Resultado' ou 'Result type' -> result_type (frequentemente ausente no Google Ads)
2. IGNORE COMPLETAMENTE linhas de Totais (ex: 'Total: conta', 'Total: todas as campanhas'). Extraia APENAS as linhas que representam campanhas individuais.
3. Formatação: remova símbolos de moeda (R$, $) e converta para numérico (ex: "R$ 2.622,07" -> 2622.07, "960.055" -> 960055).

Retorne APENAS um JSON válido com a estrutura:
{
  "platform": "meta" | "google",
  "campaigns": [
    {
      "name": "string",
      "status": "active" | "paused" | "other",
      "budget": number | null,
      "cost": number | null,
      "impressions": number | null,
      "clicks": number | null,
      "conversions": number | null,
      "reach": number | null,
      "cpl": number | null,
      "result_type": "string | null"
    }
  ]
}
Não invente dados. Se não conseguir ler um campo com precisão, use null. Não inclua texto ou formatação Markdown fora do JSON.`;

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
              { type: "text", text: "Extraia as campanhas e identifique a plataforma deste print." },
              { type: "image_url", image_url: { url: `data:${data.mimeType};base64,${data.imageBase64}` } },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error("AI gateway error", res.status, body);
      throw new Error(`Falha na extração (${res.status})`);
    }

    const json = await res.json();
    const content: string = json.choices?.[0]?.message?.content ?? "";
    const cleaned = content.replace(/```json\s*/g, "").replace(/```/g, "").trim();
    let parsed: { platform?: "meta" | "google"; campaigns: ExtractedCampaign[] } = { campaigns: [] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    const detectedPlatform = parsed.platform ?? "meta";
    const mappedCampaigns = (parsed.campaigns ?? []).map(c => ({
      ...c,
      platform: detectedPlatform
    }));
    return { platform: detectedPlatform, campaigns: mappedCampaigns };
  });
