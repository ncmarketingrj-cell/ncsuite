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

REGRA MAIS IMPORTANTE — Coluna de Resultados no Meta Ads:
No Gerenciador de Anúncios do Meta, a coluna "Resultados" frequentemente aparece como "—" (traço/vazio) quando o objetivo da campanha usa uma métrica específica como "Conversas por mensagem iniciadas", "Leads", "Compras", etc. Neste caso, OBRIGATORIAMENTE use o valor numérico da coluna de métrica específica como "conversions":
- Se a coluna "Conversas por mensagem iniciadas" (ou "Conversas iniciadas" ou "Mensagens iniciadas") tiver um número → use como conversions, result_type = "Conversa por mensagem iniciada"
- Se a coluna "Leads" tiver número → use como conversions, result_type = "Lead"
- Se a coluna "Compras" tiver número → use como conversions, result_type = "Compra"
- A coluna de custo unitário correspondente ("Custo por conversa", "Custo por lead", etc.) → use como cpl
NUNCA deixe conversions=null ou 0 se existir QUALQUER coluna com valor numérico de resultado para aquela linha.

Instruções de extração:
1. Identifique as colunas pelo cabeçalho da tabela:
   - Nome: 'Campanha', 'Nome da campanha', 'Campaign name' → name
   - Impressões: 'Impr.', 'Impressões', 'Impressions' → impressions
   - Cliques: 'Cliques', 'Clicks' → clicks
   - Custo total: 'Valor usado', 'Custo', 'Amount spent', 'Cost' → cost
   - Resultados/Conversões: conforme regra acima → conversions + result_type
   - Custo por resultado UNITÁRIO: 'Custo por resultado', 'Custo por conversa por mensagem iniciada', 'Custo por conversa', 'Custo por lead', 'CPL', 'CPA', 'Cost per result' → cpl (é o valor monetário por unidade de resultado, ex: R$ 2,77 por conversa)
   - Alcance: 'Alcance', 'Reach' → reach
2. IGNORE linhas de Totais (ex: 'Resultados totais', 'Total: conta', 'Resultados totais X linhas'). Extraia APENAS linhas de campanhas individuais.
3. Formatação numérica — padrão brasileiro: ponto (.) = separador de milhar, vírgula (,) = decimal.
   - "2.384" → 2384 (inteiro, ponto é milhar)
   - "R$ 2,61" → 2.61 (decimal, vírgula vira ponto)
   - "R$ 2.622,07" → 2622.07
   - "960.055" → 960055
   IMPORTANTE: o Meta Ads adiciona marcadores como "[2]" ou "[1]" após os números (ex: "464 [2]", "2.384 [2]"). IGNORE completamente esses marcadores — extraia apenas o número antes deles.
4. Status: 'Ativo' ou 'Em veiculação' → "active" | 'Pausado' → "paused" | 'Inativo' ou 'Não em veiculação' → "other"

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
