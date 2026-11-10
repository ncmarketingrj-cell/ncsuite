import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Input = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().default("image/png"),
  platform: z.enum(["meta", "google"]).default("meta"),
});

export type ExtractedAccountInfo = {
  account_name?: string | null;
  period?: string | null;
  detected_mode?: "ecommerce_sales" | "standard_auto";
};

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

REGRAS DE OURO:

1. LIMPEZA TOTAL DE TAGS E BADGES NO NOME DA CAMPANHA:
No Meta Ads, é comum aparecerem badges e avisos dentro da célula de nome da campanha:
- "Edições não publicadas" ou "Edição não publicada"
- "Alto desempenho"
- "1 recomendação", "X recomendações", "Recomendações"
- Avisos de veiculação (Ex: "Ativo", "Pausado", "Concluído")
NUNCA inclua esses textos no campo "name"!
Exemplo: Se o texto for "NC | RAISSA - MENSAGENS Edições não publicadas", extraia ESTRITAMENTE: "NC | RAISSA - MENSAGENS".
Se for "6697 - Consignado", extraia "6697 - Consignado".
Preserve maiúsculas, códigos numéricos, colchetes e símbolos reais da campanha.

2. COLUNA DE RESULTADOS E RESULT_TYPE:
A coluna "Resultados" define a métrica principal:
- Se a coluna indicar "Conversas por mensagem iniciadas" (ou nome da campanha tiver "MENSAGENS", "WHATSAPP", "QUALIDADE", "MSG") → result_type = "Conversas por mensagem iniciadas", conversions = número de conversas, cpl = custo por resultado.
- Se indicar "Visualizações da página de destino" ou visitas a site/cardápio (ex: campanhas com "SITE", "CARDAPIO", "PÁGINA") → result_type = "Visualizações da página de destino", conversions = visualizações da página, cpl = custo por visualização.
- Se indicar "Compras no site" ou compras/pedidos/vendas (ex: "NC | CMP de Vendas", "Compras") → result_type = "Compras no site", conversions = número de compras, cpl = custo por compra (CPA).
- Se indicar "Visitas ao perfil do Instagram" ou reconhecimento → result_type = "Visitas ao perfil do Instagram".
- Se indicar "Alcance", "Impressões" ou reproduções de vídeo/plays → result_type = "Alcance".
- Caso a coluna Resultados mostre "—", busque o valor numérico na coluna lateral específica. NUNCA deixe conversions = null ou 0 se existir qualquer coluna com resultado numérico.

3. DETECÇÃO DO CLIENTE / CONTA E PERÍODO:
- Verifique se no topo há o seletor de conta de anúncios (ex: "pizzariabonne21", "AlfaCar", "NC Veículos") → preencha "account_name".
- Verifique o seletor de período no canto superior direito (ex: "Mês passado: 1 de abr de 2026 a 30 de abr de 2026" → "ABRIL 2026", ou "OUTUBRO 2026") → preencha "period".
- Classifique "detected_mode":
  - "ecommerce_sales" se as campanhas envolverem Compras no site, Visualizações da página de destino, Site, Cardápio, Vendas.
  - "standard_auto" se as campanhas forem de Mensagens, Veículos, Consignado, Leads, WhatsApp.

4. FORMATAÇÃO NUMÉRICA BRASILEIRA:
- Ponto (.) = separador de milhar: "1.559" → 1559, "36.675" → 36675.
- Vírgula (,) = separador decimal: "R$ 299,88" → 299.88, "R$ 0,19" → 0.19.
- Ignore sufixos como "[2]" ou "[1]".

Retorne APENAS um JSON válido no formato:
{
  "platform": "meta",
  "account_info": {
    "account_name": "string | null",
    "period": "string | null",
    "detected_mode": "ecommerce_sales" | "standard_auto"
  },
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
Não invente dados. Sem Markdown.`;

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
    let parsed: { 
      platform?: "meta" | "google"; 
      account_info?: ExtractedAccountInfo; 
      campaigns: ExtractedCampaign[];
    } = { campaigns: [] };

    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    }

    const detectedPlatform = data.platform; // Usa a plataforma escolhida pelo usuário

    // Sanitização rigorosa do nome das campanhas para remover tags da interface do Meta
    const cleanCampaignName = (rawName: string = "") => {
      return rawName
        .replace(/\bEdiç(?:ão|ões)\s+não\s+publicadas?\b/gi, "")
        .replace(/\bAlto\s+desempenho\b/gi, "")
        .replace(/\b\d+\s+recomendaç(?:ão|ões)\b/gi, "")
        .replace(/\bRecomendações\b/gi, "")
        .replace(/\[\d+\]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    };

    const mappedCampaigns = (parsed.campaigns ?? []).map(c => ({
      ...c,
      name: cleanCampaignName(c.name),
      platform: detectedPlatform
    }));

    // Detectar automaticamente o modo de conta caso a IA não tenha inferido
    let detectedMode: "ecommerce_sales" | "standard_auto" = parsed.account_info?.detected_mode || "standard_auto";
    const hasSalesOrSite = mappedCampaigns.some(c => 
      /visualizaç(?:ão|ões)\s+da\s+página|compra|venda|cardapio|cardápio|site/i.test(c.result_type || "") ||
      /site|cardapio|cardápio|cmp\s+de\s+vendas|vendas|compras/i.test(c.name || "")
    );
    if (hasSalesOrSite) {
      detectedMode = "ecommerce_sales";
    }

    const accountInfo: ExtractedAccountInfo = {
      account_name: parsed.account_info?.account_name || null,
      period: parsed.account_info?.period || null,
      detected_mode: detectedMode
    };

    return { 
      platform: detectedPlatform, 
      account_info: accountInfo, 
      campaigns: mappedCampaigns 
    };
  });
