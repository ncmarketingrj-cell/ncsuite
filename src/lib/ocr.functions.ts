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
  result_type?: string;
};

export const extractPrintFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const systemPrompt = `Você é um motor de extração de dados de prints do Gerenciador de Anúncios do Meta (Facebook/Instagram Ads). Receba a imagem e retorne APENAS um JSON válido com a estrutura:
{
  "campaigns": [
    {
      "name": "string",
      "status": "active|paused|other",
      "budget": number|null,
      "cost": number|null,
      "impressions": number|null,
      "clicks": number|null,
      "conversions": number|null,
      "reach": number|null,
      "result_type": "string|null"
    }
  ]
}
Não invente dados. Se não conseguir ler um campo, use null. Valores monetários em reais sem símbolo. Não inclua texto fora do JSON.`;

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
              { type: "text", text: "Extraia as campanhas deste print." },
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
    let parsed: { campaigns: ExtractedCampaign[] } = { campaigns: [] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }
    return { campaigns: parsed.campaigns ?? [] };
  });
