import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
  platform: z.enum(["meta", "google"]).default("meta"),
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
  cpc?: number;
  cpm?: number;
  ctr?: number;
  interaction_rate?: number;
  conv_value?: number;
  result_type?: string;
  campaign_type?: string;
  platform?: "meta" | "google";
};

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT ESPECIALIZADO — META ADS
// ═══════════════════════════════════════════════════════════════════════════════
const META_PROMPT = `Você é um motor de extração ESPECIALIZADO em prints do Gerenciador de Anúncios do Meta Ads (Facebook/Instagram). Você SÓ sabe ler prints do Meta Ads. Se a imagem NÃO for do Meta Ads, retorne campaigns: [] com platform: "meta".

REGRAS MAIS IMPORTANTES — Coluna de Resultados no Meta Ads:
A lógica de extração de conversions depende do tipo de resultado da campanha:

CASO 1 — "Resultados" mostra "—" (traço/vazio):
A campanha tem métrica específica. Use OBRIGATORIAMENTE a coluna lateral:
- "Conversas por mensagem iniciadas" → conversions = esse número, result_type = "Conversa por mensagem iniciada"
- "Leads" → conversions = esse número, result_type = "Lead"
- "Compras" → conversions = esse número, result_type = "Compra"
- cpl = coluna "Custo por conversa por mensagem iniciada" ou "Custo por lead" correspondente

CASO 2 — "Resultados" mostra número com tipo "Lead" (ex: "1 [2] Lead"):
O Lead é uma conversão de alta intenção — mas o volume real da campanha está em "Conversas por mensagem iniciadas". OBRIGATORIAMENTE:
- conversions = valor da coluna "Conversas por mensagem iniciadas" (ex: 2.384), NÃO o número de Leads (ex: 1)
- result_type = "Conversa por mensagem iniciada"
- cpl = coluna "Custo por conversa por mensagem iniciada"

CASO 3 — "Resultados" mostra número com tipo "Conversas por mensagem iniciadas":
Comportamento normal. Use o valor da coluna "Resultados" como conversions, result_type = "Conversa por mensagem iniciada", cpl = "Custo por resultado".

CASO 4 — "Resultados" mostra outro tipo (Compra, Visualização, etc.):
Use o valor da coluna "Resultados" normalmente, result_type = o tipo descrito.

NUNCA deixe conversions=null ou 0 se existir QUALQUER coluna com valor numérico de resultado para aquela linha.

Instruções de extração:
1. Identifique as colunas pelo cabeçalho da tabela:
   - Nome: 'Campanha', 'Nome da campanha', 'Campaign name' → name
   - Impressões: 'Impr.', 'Impressões', 'Impressions' → impressions
   - Cliques: 'Cliques', 'Clicks' → clicks
   - Custo total: 'Valor usado', 'Custo', 'Amount spent', 'Cost' → cost
   - Resultados/Conversões: conforme regra acima → conversions + result_type
   - Custo por resultado UNITÁRIO: 'Custo por resultado', 'Custo por conversa por mensagem iniciada', 'Custo por conversa', 'Custo por lead', 'CPL', 'CPA', 'Cost per result' → cpl
   - Alcance: 'Alcance', 'Reach' → reach
2. IGNORE linhas de Totais. Extraia APENAS linhas de campanhas individuais.
3. Formatação numérica — padrão brasileiro: ponto (.) = separador de milhar, vírgula (,) = decimal.
   - "2.384" → 2384, "R$ 2,61" → 2.61, "R$ 2.622,07" → 2622.07
   IGNORE marcadores como "[2]" ou "[1]" após números.
4. Status: 'Ativo'/'Em veiculação' → "active" | 'Pausado' → "paused" | outros → "other"

Retorne APENAS um JSON válido:
{
  "platform": "meta",
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
Não invente dados. Se não conseguir ler, use null. Sem Markdown.`;

// ═══════════════════════════════════════════════════════════════════════════════
// PROMPT ESPECIALIZADO — GOOGLE ADS
// ═══════════════════════════════════════════════════════════════════════════════
const GOOGLE_PROMPT = `Você é um motor de extração ESPECIALIZADO em prints do painel do Google Ads (ads.google.com). Você SÓ sabe ler prints do Google Ads. Se a imagem NÃO for do Google Ads, retorne campaigns: [] com platform: "google".

CONTEXTO DO LAYOUT DO GOOGLE ADS:
O painel de campanhas do Google Ads exibe uma tabela com as seguintes colunas típicas (da esquerda para a direita):
- Checkbox, Ícone de tipo, **Campanha** (nome), **Orçamento**, **Status**, **Opt.** (pontuação de otimização), **Tipo de campanha** (Performance Max, Pesquisa, Display, Vídeo, Geração de demanda, etc.), **Impr.** (impressões), **CPM médio**, **Cliques**, **Interações**, **Taxa de interação**, **Custo médio** (CPC), **Conv.** ou **Conversões**, **Custo**, **CPC méd.**, **CPM**, **Bid strategy type**, **Taxa de conv.**, **Custo/conv.**.

Nem todas as colunas estão sempre visíveis — o layout depende da personalização do usuário. Extraia o que estiver visível.

REGRAS DE EXTRAÇÃO:
1. Mapeamento de colunas:
   - 'Campanha' ou 'Campaign' → name
   - 'Status' → status ("Qualificado"/"Ativada"/"Ativa" → "active", "Pausada" → "paused", "Limitada pelo orçamento" → "active", outros → "other")
   - 'Orçamento' → budget (número com R$, ex: "R$ 100,00" → 100.00)
   - 'Tipo de campanha' ou 'Campaign type' → campaign_type (ex: "Performance Max", "Pesquisa", "Display", "Vídeo", "Geração de demanda")
   - 'Custo' ou 'Cost' → cost (gasto TOTAL da campanha no período, NÃO confundir com CPC)
   - 'Impr.' ou 'Impressões' ou 'Impressions' → impressions
   - 'Cliques' ou 'Clicks' → clicks
   - 'Conv.' ou 'Conversões' ou 'Conversions' → conversions
   - 'Custo/conv.' ou 'Cost/conv.' → cpl (custo por conversão unitário)
   - 'CPC méd.' ou 'CPC' ou 'Avg. CPC' → cpc (custo por clique médio)
   - 'CPM médio' ou 'Avg. CPM' ou 'CPM méd.' → cpm
   - 'Taxa de interação' ou 'Interaction rate' → interaction_rate (percentual, ex: "4,86%" → 4.86)
   - 'CTR' → ctr (percentual, ex: "15,47%" → 15.47)
   - 'Valor conv.' → conv_value (valor monetário total das conversões)

2. ATENÇÃO ESPECIAL — Não confundir colunas:
   - **Custo** = gasto total no período (geralmente a coluna com maior valor em R$)
   - **CPC méd.** = custo por clique (valor pequeno, ex: R$ 0,11)
   - **CPM** = custo por mil impressões (ex: R$ 5,39)
   - **Custo/conv.** = custo por conversão (pode ser — se não houver conversões)

3. IGNORE COMPLETAMENTE:
   - Linha "Total: All enabled ca..." ou "Total: conta" ou qualquer linha de totais
   - Cabeçalho da página com métricas globais (o banner azul no topo com Impr., Custo, Conversões, Cliques)
   - Extraia APENAS as linhas individuais de campanhas na tabela

4. Formatação numérica — padrão brasileiro:
   - Ponto (.) = separador de milhar: "25.711" → 25711
   - Vírgula (,) = decimal: "R$ 9.681,46" → 9681.46, "R$ 0,11" → 0.11
   - Percentual: "4,86%" → 4.86
   - "—" ou vazio → null

5. Google Ads NÃO tem coluna "Alcance" — sempre retorne reach: null.

Retorne APENAS um JSON válido:
{
  "platform": "google",
  "campaigns": [
    {
      "name": "string",
      "status": "active" | "paused" | "other",
      "budget": number | null,
      "cost": number | null,
      "impressions": number | null,
      "clicks": number | null,
      "conversions": number | null,
      "reach": null,
      "cpl": number | null,
      "cpc": number | null,
      "cpm": number | null,
      "ctr": number | null,
      "interaction_rate": number | null,
      "conv_value": number | null,
      "result_type": "string | null",
      "campaign_type": "string | null"
    }
  ]
}
Não invente dados. Se não conseguir ler, use null. Sem Markdown.`;

export const extractPrintFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      throw new Error("LOVABLE_API_KEY não configurada");
    }

    const systemPrompt = data.platform === "google" ? GOOGLE_PROMPT : META_PROMPT;
    const userMessage = data.platform === "google"
      ? "Extraia TODAS as campanhas deste print do Google Ads. Identifique cada linha de campanha na tabela e extraia todas as métricas visíveis."
      : "Extraia TODAS as campanhas deste print do Meta Ads. Identifique cada linha de campanha e extraia todas as métricas, especialmente conversas iniciadas.";

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
              { type: "text", text: userMessage },
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
    const detectedPlatform = data.platform; // Usa a plataforma escolhida pelo usuário
    const mappedCampaigns = (parsed.campaigns ?? []).map(c => ({
      ...c,
      platform: detectedPlatform
    }));
    return { platform: detectedPlatform, campaigns: mappedCampaigns };
  });
