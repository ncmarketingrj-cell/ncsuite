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
  budget?: number | null;
  cost?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  conversions?: number | null;
  reach?: number | null;
  cpl?: number | null;
  cpc?: number | null;
  cpm?: number | null;
  ctr?: number | null;
  interaction_rate?: number | null;
  conv_value?: number | null;
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

LAYOUT TÍPICO DO GOOGLE ADS — colunas da tabela de campanhas (esquerda → direita):
Checkbox | Campanha (nome) | Orçamento | Status | Opt. | Tipo de campanha | Impr. | Cliques | CPM médio | Interações | Taxa de interação | Conv. | Custo médio | Custo | CPC méd. | Bid strategy type | Taxa de conv. | Custo/conv.

ATENÇÃO CRÍTICA — CUSTO vs CUSTO MÉDIO (erro mais comum):
- "Custo" = gasto TOTAL da campanha no período. Exemplo: R$ 2.599,37 ou R$ 7.082,08. Esta é a coluna mais importante.
- "Custo médio" = custo por clique individual (CPC). Exemplo: R$ 0,08 ou R$ 0,05. É muito menor que o Custo total.
- "CPC méd." = mesma coisa que Custo médio — custo por clique.
- NUNCA confunda: se você vê R$ 0,08 ao lado de R$ 2.599,37, o custo da campanha é R$ 2.599,37, e R$ 0,08 é o CPC.
- O Custo total de cada campanha NUNCA é menor que R$ 1,00 em uma conta ativa.

REGRAS DE EXTRAÇÃO — MAPEAMENTO DE COLUNAS:
- 'Campanha' → name
- 'Orçamento' → budget (ex: "R$ 100,00" → 100.0)
- 'Status': "Qualificada"/"Ativada"/"Ativa"/"Limitada pelo orçamento" → "active", "Pausada" → "paused"
- 'Tipo de campanha' → campaign_type (Performance Max, Pesquisa, Display, Geração de demanda, etc.)
- 'Impr.' / 'Impressões' → impressions
- 'Cliques' → clicks (ex: "23.621" → 23621)
- 'Conv.' / 'Conversões' → conversions (número de conversões rastreadas pelo Google)
- 'Custo' → cost (gasto TOTAL — o número maior em R$, ex: "R$ 2.599,37" → 2599.37)
- 'Custo médio' / 'CPC méd.' → cpc (custo por clique — número pequeno, ex: "R$ 0,11" → 0.11)
- 'CPM médio' → cpm
- 'Taxa de interação' → interaction_rate (ex: "4,08%" → 4.08)
- 'Custo/conv.' → (ignorar se "—"; se houver valor, usar como cpl)
- Google Ads NÃO tem alcance → reach: null sempre

REGRA PARA CAMPANHAS DE TRÁFEGO (cliques para o site):
Quando a campanha NÃO é de lead/venda mas sim de tráfego para o site:
  Indicadores: Conv. = 0,00 OU nome contém "VISITA"/"SITE"/"TRAFEGO"/"TRÁFEGO"/"CLICK"/"CLIQUE" OU Custo/conv. = "—"
  Nesses casos OBRIGATORIAMENTE:
  - result_type = "Clique no site"
  - conversions = valor da coluna "Cliques" (NÃO da coluna "Conv.")
  - cpl = valor de "CPC méd." (custo por clique)

Quando a campanha é de conversão (leads, vendas, formulários):
  - result_type = "Conversão"
  - conversions = valor da coluna "Conv."
  - cpl = valor de "Custo/conv." (se disponível)

IGNORAR COMPLETAMENTE:
- Linhas "Total: All enabled ca..." ou "Total: conta" — são totais, NÃO são campanhas
- Os cards de resumo no topo da página (ex: o card azul "Impr. 1.094.799 | Custo R$ 9.681,46 | Conversões 414 | Cliques 25.711") — esses são TOTAIS GLOBAIS, não dados de campanhas individuais
- Extraia APENAS as linhas individuais de campanhas

FORMATAÇÃO NUMÉRICA — padrão brasileiro:
- Ponto (.) = separador de milhar: "25.711" → 25711, "1.094.799" → 1094799
- Vírgula (,) = decimal: "R$ 2.599,37" → 2599.37, "R$ 0,11" → 0.11
- Percentual: "4,08%" → 4.08
- "—" ou vazio → null

Retorne APENAS um JSON válido (sem Markdown, sem explicações):
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
}`;

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
