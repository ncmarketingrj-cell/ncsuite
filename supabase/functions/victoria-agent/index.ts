import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";
import {
  detectStrictConversionCategory,
  emptyMetricVector,
  accumulateMetricVector,
  formatMetricVectorSummary,
  type MetricVector,
} from "../_shared/metaCore.ts";
import {
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  VICTORIA_DEFAULT_OPERATIONAL_MODE,
  enforceServerPostLlmGuardrails,
  sanitizeVictoriaServerOutput,
  generateDeterministic10SectionAnalysis,
  type ServerRagCitation,
} from "../_shared/victoriaCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-victoria-contract-version, x-victoria-prompt-version, x-victoria-request-id, x-victoria-context-hash",
};

const EXPECTED_EMBEDDING_DIM = 768;

async function generateGeminiEmbedding(
  text: string,
  apiKey: string
): Promise<{ embedding: number[] | null; modelUsed: string | null; status: number; error?: string }> {
  const inputText = String(text || "").trim().slice(0, 8000);
  if (!inputText || !apiKey) {
    return { embedding: null, modelUsed: null, status: 0, error: "empty_text_or_missing_key" };
  }

  const candidates = [
    {
      model: "gemini-embedding-001",
      body: {
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: inputText }] },
        outputDimensionality: EXPECTED_EMBEDDING_DIM,
      },
    },
    {
      model: "text-embedding-004",
      body: {
        model: "models/text-embedding-004",
        content: { parts: [{ text: inputText }] },
      },
    },
  ];

  let lastStatus = 0;
  let lastError = "embedding_failed";

  for (const cand of candidates) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cand.model}:embedContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cand.body),
        }
      );
      lastStatus = res.status;
      if (!res.ok) {
        lastError = (await res.text().catch(() => "")).slice(0, 240) || `HTTP ${res.status}`;
        continue;
      }
      const data = await res.json();
      const values = data?.embedding?.values;
      if (Array.isArray(values) && values.length === EXPECTED_EMBEDDING_DIM) {
        return { embedding: values, modelUsed: cand.model, status: res.status };
      }
      lastError = `unexpected_dim_${Array.isArray(values) ? values.length : 0}`;
    } catch (e: any) {
      lastError = e?.message || "fetch_exception";
    }
  }

  return { embedding: null, modelUsed: null, status: lastStatus, error: lastError };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: { user }, error: _authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (_authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const {
      action = "chat",
      messages: rawMessages,
      message: singleMessage,
      mode,
      stream: explicitStream,
      analysisContext,
      selectedAccountId: rawSelectedAccountId,
      title,
      content,
      category,
      query,
      externalContext,
      regionalBenchmark,
      articlesToLearn,
      feeds: customFeeds,
      readOnly: explicitReadOnly
    } = body;
    const messages = Array.isArray(rawMessages) && rawMessages.length > 0
      ? rawMessages
      : (typeof singleMessage === "string" && singleMessage.trim()
          ? [{ role: "user", content: singleMessage.trim() }]
          : []);
    const selectedAccountId = rawSelectedAccountId || analysisContext?.ad_account_id || undefined;
    const shouldReturnJson = explicitStream === false || (typeof singleMessage === "string" && !Array.isArray(rawMessages)) || mode === "json" || mode === "social_audit" || mode === "social_caption";
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const detectServerReadOnly = (msgs: any[], explicitFlag?: boolean): boolean => {
      if (explicitFlag === true) return true;
      const lastText = Array.isArray(msgs) && msgs.length > 0 ? String(msgs[msgs.length - 1]?.content || "") : "";
      if (!lastText.trim()) return true;
      if (/somente\s+leitura|apenas\s+analis|s[oó]\s+analis|sem\s+alterar|n[aã]o\s+alter|n[aã]o\s+execut|n[aã]o\s+paus|sem\s+pausar|sem\s+editar|somente\s+diagn[oó]stico|apenas\s+relat[oó]rio/i.test(lastText)) {
        return true;
      }
      if (/\bpausar\b|\bpause\b|\bescalar\s+(verba|or[çc]amento|campanha)|\b(aumentar|aumente|reduzir|reduza|ajustar|ajuste|alterar|altere|atualizar|atualize)\s+(o\s+|a\s+)?(verba|or[çc]amento|budget)|\bclonar\s+funil\b|\baprovo\b/i.test(lastText)) {
        return false;
      }
      return true;
    };
    const isReadOnlyRequest = detectServerReadOnly(messages, explicitReadOnly);
    const ctxDaysCount = Number(analysisContext?.period?.days_count ?? analysisContext?.period?.days ?? 1);
    const operationalMode =
      body.operational_mode === "ACTION_PROPOSAL" && !isReadOnlyRequest && ctxDaysCount >= 3
        ? "ACTION_PROPOSAL"
        : VICTORIA_DEFAULT_OPERATIONAL_MODE;

    // =========================================================================
    // AÇÃO: fetch_market_intel (Pesquisa de Mercado, Marketing e Leis em Tempo Real - R$ 0,00)
    // =========================================================================
    if (action === "fetch_market_intel") {
      try {
        const defaultFeeds = [
          {
            cat: "mercado",
            url: "https://news.google.com/rss/search?q=mercado+automotivo+venda+carros+concessionarias+brasil+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
          },
          {
            cat: "lancamentos",
            url: "https://news.google.com/rss/search?q=lancamento+carros+seminovos+vendas+veiculos+brasil+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
          },
          {
            cat: "trafego",
            url: "https://news.google.com/rss/search?q=trafego+pago+meta+ads+anuncios+carros+whatsapp+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
          },
          {
            cat: "leis",
            url: "https://news.google.com/rss/search?q=(lei+OR+CONTRAN+OR+SENATRAN+OR+DETRAN+OR+IPVA)+veiculos+carros+brasil+when:7d&hl=pt-BR&gl=BR&ceid=BR:pt-419"
          }
        ];

        const feeds = Array.isArray(customFeeds) && customFeeds.length > 0 ? customFeeds : defaultFeeds;

        const allArticles: Array<{
          id: string;
          title: string;
          source: string;
          link: string;
          pubDate: string;
          snippet: string;
          category: string;
        }> = [];
        const seenKeys = new Set<string>();

        await Promise.all(
          feeds.map(async (f: { cat: string; url: string }) => {
            try {
              const res = await fetch(f.url, {
                headers: {
                  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) VictoriaAI/2.0"
                }
              });
              if (!res.ok) return;
              const xml = await res.text();

              const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
              let count = 0;
              for (const match of itemMatches) {
                if (count >= 12) break; // até 12 artigos por feed
                const item = match[1];

                const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/);
                const linkMatch = item.match(/<link>(.*?)<\/link>/) || item.match(/<link><!\[CDATA\[(.*?)\]\]><\/link>/);
                const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
                const sourceMatch = item.match(/<source[^>]*>(.*?)<\/source>/);
                const descMatch = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/);

                const rawTitle = titleMatch ? titleMatch[1] : "";
                const cleanTitle = rawTitle.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
                const source = sourceMatch ? sourceMatch[1].trim() : (cleanTitle.split(" - ").pop() || "Setor Automotivo");
                const pureTitle = cleanTitle.includes(" - ") ? cleanTitle.substring(0, cleanTitle.lastIndexOf(" - ")) : cleanTitle;
                const snippet = descMatch ? descMatch[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim().substring(0, 260) : "";
                const link = linkMatch ? linkMatch[1].trim() : "";

                let safeIso = new Date().toISOString();
                if (pubDateMatch && pubDateMatch[1]) {
                  const parsed = new Date(pubDateMatch[1].trim());
                  if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000) {
                    safeIso = parsed.toISOString();
                  }
                }

                const dedupKey = pureTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
                if (pureTitle && dedupKey.length > 5 && !seenKeys.has(dedupKey)) {
                  seenKeys.add(dedupKey);
                  allArticles.push({
                    id: `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                    title: pureTitle,
                    source,
                    link,
                    pubDate: safeIso,
                    snippet,
                    category: f.cat || "mercado"
                  });
                  count++;
                }
              }
            } catch (err) {
              console.error("Erro ao ler feed RSS:", err);
            }
          })
        );

        allArticles.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

        return new Response(JSON.stringify({
          success: true,
          articles: allArticles,
          scanned_at: new Date().toISOString(),
          provider: "Google News Public RSS Multi-Portais (Custo R$ 0,00)"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err: any) {
        return new Response(JSON.stringify({ error: "Erro na varredura de mercado: " + err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // =========================================================================
    // AÇÃO: learn_market_intel (Absorver aprendizado no RAG vetorial com custo zero)
    // =========================================================================
    if (action === "learn_market_intel") {
      const items = Array.isArray(articlesToLearn) ? articlesToLearn : [];
      if (items.length === 0) {
        return new Response(JSON.stringify({ error: "Nenhum artigo fornecido para aprendizado" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Sintetizar apenas metadados editoriais reais e excertos sanitizados (ID 26)
      const collectedAtIso = new Date().toISOString();
      const nowStr = new Date().toLocaleDateString("pt-BR");
      const sanitizeXmlText = (v?: string) => String(v || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, "$1").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      const summaryContent = items.map((art: any) => {
        const cleanSource = sanitizeXmlText(art.source) || "Fonte externa";
        const cleanTitle = sanitizeXmlText(art.title);
        const cleanExcerpt = sanitizeXmlText(art.snippet);
        const linkStr = String(art.link || "").trim();
        let isHomepageOnly = true;
        try {
          const u = new URL(linkStr);
          isHomepageOnly = (u.pathname.replace(/\/+$/, "") === "" && !u.search);
        } catch {}
        const sourceUrlNote = isHomepageOnly ? `${linkStr || "sem-url"} [referência de portal — não usar como prova numérica]` : linkStr;
        return `- [${cleanSource}] ${cleanTitle}\n  Publicado em: ${art.pubDate || "data não informada"} | Coletado em: ${collectedAtIso}\n  Excerto: ${cleanExcerpt}\n  URL: ${sourceUrlNote}`;
      }).join("\n\n");
      
      const docTitle = `[RADAR MERCADO AUTOMOTIVO] Tendências & Lançamentos — ${nowStr}`;
      const docContent = `SÍNTESE DE NOTÍCIAS COLETADAS EM TEMPO REAL (${nowStr}):\n\n${summaryContent}\n\nDIRETRIZES DE GOVERNANÇA:\n- Cite apenas os excertos e URLs específicas registradas acima como evidência editorial.\n- Nunca invente percentuais ou metas de CPL fora dos dados reais da conta ou metas configuradas.`;

      let embedding: number[] | null = null;
      if (GEMINI_API_KEY) {
        const embRes = await generateGeminiEmbedding(`${docTitle}\n\n${docContent}`, GEMINI_API_KEY);
        embedding = embRes.embedding;
      }

      const insertPayload: any = {
        user_id: user.id,
        category: "strategy",
        title: docTitle,
        content: docContent,
        author: "Victoria Market Radar",
        source: "Google News RSS",
        published_at: collectedAtIso,
        ingested_at: collectedAtIso,
        region: "BR",
        objective: "MARKET_INTEL",
        evidence_level: "MARKET_NEWS",
        version: VICTORIA_CONTRACT_VERSION,
        approval_status: "PENDING_REVIEW",
        rejection_reason: "Notícias externas via RSS permanecem em PENDING_REVIEW até curadoria humana e não entram como regra operacional automática no RAG."
      };
      if (embedding) {
        insertPayload.embedding = embedding;
      }

      const { data: savedDoc, error: insertErr } = await supabase
        .from("victoria_knowledge")
        .insert(insertPayload)
        .select()
        .single();

      if (insertErr) {
        return new Response(JSON.stringify({ error: insertErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        success: true,
        learned_count: items.length,
        document: savedDoc,
        message: "Notícias registradas em quarentena (PENDING_REVIEW) para curadoria humana!"
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: add_knowledge (Geração de embeddings e inserção na base com governança)
    // =========================================================================
    if (action === "add_knowledge") {
      if (!title || !content || !category) {
        return new Response(JSON.stringify({ error: "Missing title, content or category" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY não configurada no servidor");
      }

      const combinedCheck = `${title}\n${content}`;
      const hasProhibitedClaim = /54%\s*mais\s*(conversas|cliques|leads)|cpl\s+(reduzido|efetivo)\s+pela\s+metade|80%\s*(de\s*)?convers[aã]o|sem\s+consulta\s+(ao\s+)?(spc|serasa)|&lt;a\s+href=/i.test(combinedCheck);
      const approvalStatus = hasProhibitedClaim ? "REJECTED" : (body.approval_status || "APPROVED");
      const rejectionReason = hasProhibitedClaim
        ? "Rejeitado automaticamente pela governança RAG: contém alegação numérica sem fonte primária auditável, promessa de crédito sensível ou HTML bruto."
        : null;

      // 1. Obter embedding 768d usando helper unificado (gemini-embedding-001 -> text-embedding-004)
      const embRes = await generateGeminiEmbedding(`${title}\n\n${content}`, GEMINI_API_KEY);
      if (!embRes.embedding && approvalStatus === "APPROVED") {
        throw new Error(`Erro ao gerar embedding: ${embRes.error || embRes.status}`);
      }
      const embedding = approvalStatus === "APPROVED" ? embRes.embedding : null;

      // 2. Salvar na tabela victoria_knowledge
      const { data, error: insertErr } = await supabase
        .from("victoria_knowledge")
        .insert({
          user_id: user.id,
          category,
          title,
          content,
          embedding,
          author: body.author || "NC Performance",
          source: body.source || "Base de Conhecimento NC Suite",
          url: body.url || null,
          canonical_url: body.canonical_url || body.url || null,
          region: body.region || "BR-RJ",
          objective: body.objective || "ALL",
          evidence_level: hasProhibitedClaim ? "UNVERIFIED" : (body.evidence_level || "INTERNAL_RULE"),
          version: VICTORIA_CONTRACT_VERSION,
          approval_status: approvalStatus,
          rejection_reason: rejectionReason
        })
        .select()
        .single();

      if (insertErr) {
        throw insertErr;
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: update_knowledge (Atualização de documento com novo embedding)
    // =========================================================================
    if (action === "update_knowledge") {
      const docId = body.id;
      if (!docId || !title || !content || !category) {
        return new Response(JSON.stringify({ error: "Missing id, title, content or category" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let embedding: number[] | null = null;
      if (GEMINI_API_KEY) {
        const embRes = await generateGeminiEmbedding(`${title}\n\n${content}`, GEMINI_API_KEY);
        embedding = embRes.embedding;
      }

      const updatePayload: Record<string, any> = {
        title,
        category,
        content,
        updated_at: new Date().toISOString()
      };
      if (embedding) {
        updatePayload.embedding = embedding;
      }

      const { data, error: updateErr } = await supabase
        .from("victoria_knowledge")
        .update(updatePayload)
        .eq("id", docId)
        .select()
        .single();

      if (updateErr) {
        return new Response(JSON.stringify({ error: updateErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ success: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: diagnose_alert (Diagnóstico Causal de Alerta por IA)
    // =========================================================================
    if (action === "diagnose_alert") {
      const campaignId = body.campaign_id;
      if (!campaignId) {
        return new Response(JSON.stringify({ error: "Missing campaign_id" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (!GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY não configurada no servidor");
      }

      // 1. Buscar detalhes da campanha incluindo objetivo
      const { data: campaign, error: campErr } = await supabase
        .from("campaigns")
        .select("id, name, objective, daily_budget, budget_currency, ad_account_id, platform")
        .eq("id", campaignId)
        .single();

      if (campErr || !campaign) {
        return new Response(JSON.stringify({ error: "Campaign not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 2. Buscar métricas dos últimos 7 dias preservando result_type
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const startStr = sevenDaysAgo.toISOString().split("T")[0];

      const { data: metrics, error: metErr } = await supabase
        .from("metrics")
        .select("cost, conversions, clicks, impressions, reach, date, frequency, result_type")
        .eq("campaign_id", campaignId)
        .gte("date", startStr)
        .order("date", { ascending: true });

      if (metErr) {
        throw metErr;
      }

      // 3. Formatar dados de métricas para o LLM preservando unidade real
      const formattedMetrics = (metrics || []).map((m: any) => 
        `Data: ${m.date} | TipoResultado: ${m.result_type || campaign.objective || "N/A"} | Gasto: R$ ${Number(m.cost || 0).toFixed(2)} | Cliques: ${m.clicks || 0} | Impressões: ${m.impressions || 0} | Alcance: ${m.reach || 0} | Resultados: ${m.conversions || 0} | Freq: ${Number(m.frequency || 0).toFixed(2)}`
      ).join("\n");

      // 4. Montar o prompt de diagnóstico causal de orçamento do nicho automotivo
      const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance.
Analise os dados de tráfego pago da concessionária a seguir. A campanha estourou o limite de orçamento diário e o gestor precisa entender o porquê.
Gere uma explicação extremamente curta (máximo de 4 linhas), técnica e direta em português.
Seja direto: comece direto com a resposta (ex: "⚠️ O orçamento diário do CBO..."). Não use introduções, não cumprimente, não dê sugestões redundantes.
Explique se o gasto acelerou devido à alta repentina de CPM, queda de CTR (fadiga de criativo), aumento de CPC, aumento de frequência ou simplesmente volume de tráfego nas horas de pico.

Informações da Campanha:
- Nome: ${campaign.name}
- Plataforma: ${campaign.platform === "google" ? "Google Ads" : "Meta Ads"}
- Orçamento Diário: R$ ${Number(campaign.daily_budget || 0).toFixed(2)}

Métricas Recentes (últimos 7 dias):
${formattedMetrics || "Sem métricas no período."}

Escreva em formato altamente profissional, com dados baseados na série de métricas enviada.`;

      // 5. Invocar o Gemini (não-streaming)
      let fetchUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      let fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
      let fetchBody: any = {
        contents: [{ parts: [{ text: "Forneça o diagnóstico causal de estouro do orçamento com base na série temporal de métricas enviada." }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 350, temperature: 0.2 }
      };

      if (LOVABLE_API_KEY) {
        fetchUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
        fetchHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
        fetchBody = {
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: "Forneça o diagnóstico causal de estouro do orçamento com base na série temporal de métricas enviada." }
          ],
          temperature: 0.2,
          max_tokens: 350
        };
      }

      const geminiRes = await fetch(fetchUrl, {
        method: "POST",
        headers: fetchHeaders,
        body: JSON.stringify(fetchBody)
      });

      let text = "";
      if (geminiRes.ok) {
        const resData = await geminiRes.json();
        if (LOVABLE_API_KEY) {
          text = resData.choices?.[0]?.message?.content || "";
        } else {
          text = resData.candidates?.[0]?.content?.parts?.[0]?.text || "";
        }
      } else {
        const errText = await geminiRes.text();
        console.error("Gemini diagnose error:", errText);
        text = "Não foi possível gerar o diagnóstico da IA no momento devido a uma indisponibilidade na API.";
      }

      const safeDiagnosis = sanitizeVictoriaServerOutput(
        text.trim(),
        {
          result_indicator: {
            category: campaign.objective || "UNKNOWN",
            cost_label: "Custo por resultado",
          },
          period: { days_count: 7 },
        },
        VICTORIA_DEFAULT_OPERATIONAL_MODE
      );

      return new Response(JSON.stringify({
        diagnosis: safeDiagnosis,
        contract_version: VICTORIA_CONTRACT_VERSION,
        prompt_version: VICTORIA_PROMPT_VERSION,
        operational_mode: VICTORIA_DEFAULT_OPERATIONAL_MODE,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: search_knowledge (busca vetorial + fallback lexical curado)
    // =========================================================================
    if (action === "search_knowledge") {
      const q = String(query || "").trim();
      if (!q) {
        return new Response(JSON.stringify({ snippets: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let snippets: any[] = [];
      let vectorStatus = "skipped";
      if (GEMINI_API_KEY) {
        try {
          const embRes = await generateGeminiEmbedding(q, GEMINI_API_KEY);
          if (embRes.embedding) {
            const { data: matchData, error: matchErr } = await supabase.rpc("match_victoria_knowledge", {
              query_embedding: embRes.embedding,
              match_threshold: Number(body.match_threshold ?? 0.42),
              match_count: Number(body.limit ?? 5),
              p_user_id: user.id
            });
            vectorStatus = matchErr ? `rpc_err:${matchErr.message}` : `ok_${(matchData || []).length}`;
            snippets = (matchData || [])
              .filter((k: any) => k.approval_status !== "REJECTED" && k.evidence_level !== "UNVERIFIED" && k.evidence_level !== "OPINION")
              .map((k: any) => ({
                id: k.id,
                title: k.title,
                category: k.category,
                similarity: k.similarity ?? null,
                version: k.version || VICTORIA_CONTRACT_VERSION,
                evidence_level: k.evidence_level || "INTERNAL_RULE",
                approval_status: k.approval_status || "APPROVED",
                content: (k.content || "").slice(0, 600)
              }));
          } else {
            vectorStatus = `embed_err:${embRes.error}`;
          }
        } catch (vecErr: any) {
          vectorStatus = `exc:${vecErr?.message || "err"}`;
          console.warn("[VICTORIA] Vector search_knowledge falhou, usando fallback lexical curado:", vecErr);
        }
      }

      if (snippets.length === 0) {
        const { data: docs } = await supabase
          .from("victoria_knowledge")
          .select("id, title, category, content, source, evidence_level, approval_status, version, objective, priority")
          .eq("is_active", true)
          .eq("approval_status", "APPROVED")
          .not("evidence_level", "in", '("UNVERIFIED","OPINION")')
          .or(`user_id.eq.${user.id},evidence_level.in.(OFFICIAL_DOC,INTERNAL_RULE)`)
          .order("priority", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(30);

        const tokens = q.toLowerCase().split(/[^a-zà-ú0-9]+/i).filter((w) => w.length >= 3);
        const scored = (docs || [])
          .filter((d: any) => d.approval_status === "APPROVED" && d.evidence_level !== "UNVERIFIED" && d.evidence_level !== "OPINION")
          .map((d: any) => {
            const hay = `${d.title || ""} ${d.content || ""} ${d.category || ""} ${d.objective || ""}`.toLowerCase();
            const tokenHits = tokens.reduce((s, tok) => s + (hay.includes(tok) ? 2 : 0), 0);
            const score = tokenHits + (tokenHits > 0 && d.evidence_level === "OFFICIAL_DOC" ? 2 : 0);
            return { doc: d, score, tokenHits };
          })
          .filter((entry: any) => entry.tokenHits > 0)
          .sort((a: any, b: any) => b.score - a.score)
          .slice(0, Number(body.limit ?? 5));

        snippets = scored.map(({ doc: k }: any) => ({
          id: k.id,
          title: k.title,
          category: k.category,
          version: k.version || VICTORIA_CONTRACT_VERSION,
          evidence_level: k.evidence_level || "INTERNAL_RULE",
          approval_status: k.approval_status || "APPROVED",
          content: (k.content || "").slice(0, 600)
        }));
      }

      return new Response(JSON.stringify({ snippets, retrieval_status: vectorStatus }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: backfill_embeddings (gera embeddings 768d apenas para docs APPROVED ativos)
    // =========================================================================
    if (action === "backfill_embeddings") {
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ success: false, updated: 0, reason: "GEMINI_API_KEY not configured" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const forceReembed = body.force_reembed === true;
      const limitCount = Math.min(50, Math.max(1, Number(body.limit ?? 30)));
      let qPending = supabase
        .from("victoria_knowledge")
        .select("id, title, content, approval_status, is_active, evidence_level")
        .eq("is_active", true)
        .eq("approval_status", "APPROVED")
        .not("evidence_level", "in", '("UNVERIFIED","OPINION")');
      if (!forceReembed) {
        qPending = qPending.is("embedding", null);
      }
      const { data: pendingDocs, error: pendingErr } = await qPending.limit(limitCount);

      if (pendingErr) {
        return new Response(JSON.stringify({ success: false, updated: 0, error: pendingErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      let updated = 0;
      let modelUsed: string | null = null;
      const errors: Array<{ id: string; error: string }> = [];

      for (const doc of pendingDocs || []) {
        if (
          doc.approval_status !== "APPROVED" ||
          doc.is_active !== true ||
          doc.evidence_level === "UNVERIFIED" ||
          doc.evidence_level === "OPINION"
        ) {
          continue;
        }
        const embRes = await generateGeminiEmbedding(`${doc.title}\n\n${doc.content}`, GEMINI_API_KEY);
        if (embRes.embedding) {
          modelUsed = embRes.modelUsed;
          const { error: uErr } = await supabase
            .from("victoria_knowledge")
            .update({ embedding: embRes.embedding, version: VICTORIA_CONTRACT_VERSION })
            .eq("id", doc.id);
          if (!uErr) {
            updated++;
          } else {
            errors.push({ id: doc.id, error: uErr.message });
          }
        } else {
          errors.push({ id: doc.id, error: embRes.error || `HTTP ${embRes.status}` });
        }
      }

      return new Response(JSON.stringify({
        success: errors.length === 0 || updated > 0,
        updated,
        scanned: (pendingDocs || []).length,
        model_used: modelUsed,
        errors,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: seed_default_knowledge — popula base NC Performance com 1 clique
    // =========================================================================
    if (action === "seed_default_knowledge") {
      if (!GEMINI_API_KEY) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY não configurada" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const DOCS: { title: string; category: string; content: string }[] = [
        {
          title: "Posicionamento e Identidade NC Performance",
          category: "brand_voice",
          content: `NC Performance é uma agência de tráfego pago especializada em marketing automotivo no Rio de Janeiro. Atendemos concessionárias, revendedoras de seminovos e centros automotivos.\n\nNosso diferencial: velocidade de execução, dados em tempo real e linguagem do setor — não entregamos relatórios genéricos, entregamos diagnósticos precisos com ação imediata.\n\nTom de comunicação:\n- Direto, profissional mas acessível\n- Sempre com dados concretos (CPL, CTR, Leads gerados)\n- Proativo com sugestões de otimização\n- Nunca desculpas: se campanha não performa, apresentamos a solução imediatamente\n\nSlogans NC Performance:\n- "Performance em Alta Velocidade"\n- "Motor de Tráfego Automotivo"\n- "Leads que convertem em vendas"\n\nPosicionamento: Agência de médio-alto tier. Não competimos por preço, competimos por resultado. RJSP foco.`
        },
        {
          title: "Benchmarks CPL, CTR e Frequência — Automotivo RJ 2025-2026",
          category: "strategy",
          content: `BENCHMARKS INTERNOS NC PERFORMANCE (REFERÊNCIA INICIAL QUANDO CONTA NÃO TEM HISTÓRICO PRÓPRIO):\n\nVEÍCULOS NOVOS (Campanhas de Leads/Mensagens):\n- Excelente: < R$ 15,00\n- Saudável: R$ 15-35,00\n- Atenção: R$ 35-55,00\n- Crítico (revisar após janela de 3-7 dias): > R$ 55,00\n\nSEMINOVOS POPULARES (HB20, Ônix, Gol até 5 anos):\n- Excelente: < R$ 18,00\n- Saudável: R$ 18-40,00\n- Atenção: R$ 40-65,00\n- Crítico: > R$ 65,00\n\nSEMINOVOS PREMIUM (BMW, Mercedes, Audi):\n- Excelente: < R$ 35,00\n- Saudável: R$ 35-80,00\n- Atenção: R$ 80-130,00\n- Crítico: > R$ 130,00\n\nCTR DE LINK (Campanhas orientadas a clique/conversão):\n- Ideal: > 1.20%\n- Aceitável: 0.80%-1.20%\n- Crítico: < 0.80% → testar fotos reais do pátio em luz natural em vez de imagens genéricas de catálogo.\n\nFREQUÊNCIA DE EXIBIÇÃO (Janela >= 7 dias):\n- Ideal: 1.5-2.5 por pessoa\n- Alerta: > 3.0 (avaliar renovação de criativo)\n- Crítico: > 4.0 → avaliar expansão de público ou renovação de criativos`
        },
        {
          title: "Estrutura de Campanhas Meta Ads — Automotivo",
          category: "strategy",
          content: `ESTRUTURA PADRÃO META ADS PARA CONCESSIONÁRIAS:\n\nCAMPANHA 1 — PROSPECÇÃO (Topo de Funil):\n- Objetivo: Leads ou Tráfego\n- Público: Broad 25-55 anos, interessados em veículos, condução, financiamento\n- Raio: 40-60km da concessionária\n- Criativos: 3-5 fotos reais + 1-2 vídeos 15-30s\n- Budget mínimo: R$ 50/dia por conjunto\n\nCAMPANHA 2 — REMARKETING:\n- Público: Visitantes do site (30 dias) + Engajamento IG/FB (60 dias) + leads que não compraram (90 dias)\n- Criativos: específicos por modelo + oferta especial + depoimentos\n- Budget: 20-30% do budget total\n\nCAMPANHA 3 — LOOKALIKE:\n- Público origem: compradores confirmados ou leads qualificados\n- Tamanho: 1-3% (mais qualificado) ou 3-5% (volume)\n\nORÇAMENTOS MÍNIMOS RJ:\n- Concessionária pequena (1-3 modelos): R$ 150/dia\n- Concessionária média (5-10 modelos): R$ 300/dia\n- Multi-marca seminovos: R$ 200/dia\n\nESTRUTURA DO CONJUNTO:\n- Mínimo 3 anúncios por conjunto (A/B/C)\n- CTA eficaz: "Saiba Mais", "Enviar Mensagem", "Ligue Agora"\n- Formulários nativos: incluir pergunta qualificadora (entrada, troca, financiamento)`
        },
        {
          title: "Funil de Vendas Automotivo — Etapas, KPIs e Taxas",
          category: "strategy",
          content: `FUNIL DE VENDAS AUTOMOTIVO COMPLETO NC PERFORMANCE:\n\nETAPA 1 — AWARENESS (Topo):\n- Canal: Meta Ads, TikTok, Google Display\n- Conteúdo: Vídeos do modelo, tour do pátio, "novo chegou"\n- KPI: CPM, Alcance, Frequência\n\nETAPA 2 — INTERESSE:\n- Canal: Retargeting Meta, Google Search\n- Conteúdo: Especificações, diferenciais, comparativos\n- KPI: CTR, CPC\n\nETAPA 3 — CONSIDERAÇÃO:\n- Canal: WhatsApp, e-mail\n- Ação: Ligação em até 5 min após lead, proposta, agendamento test drive\n- KPI: Taxa de atendimento, taxa de test drive\n\nETAPA 4 — DECISÃO:\n- Canal: Presencial + follow-up WhatsApp\n- Ação: Negociação, financiamento, aprovação crédito\n- KPI: Taxa conversão lead→venda, ticket médio\n\nETAPA 5 — PÓS-VENDA:\n- Ação: NPS, solicitar indicação, depoimento nas redes\n- Compradores viram audiência personalizada para campanha de indicação\n\nTAXAS DE CONVERSÃO SAUDÁVEIS:\n- Lead → Atendimento: 70%+ (< 50% = problema no processo de vendas)\n- Atendimento → Test Drive: 30-40%\n- Test Drive → Proposta: 60-70%\n- Proposta → Venda: 25-40%\n\nMOTIVOS DE PERDA MAIS COMUNS:\n1. Demora no atendimento (> 30 min → lead esfria)\n2. Falta de follow-up (90% das vendas precisam > 1 contato)\n3. Ausência de oferta clara no anúncio\n4. Preço desatualizado vs Mercado Livre`
        },
        {
          title: "Estratégia de Remarketing para Concessionárias",
          category: "strategy",
          content: `PÚBLICOS DE REMARKETING ESSENCIAIS:\n1. Visitantes site (3 dias): interesse quente, mostrar modelo específico visto\n2. Visitantes site (7 dias): oferta especial + facilidade financiamento\n3. Visitantes site (30 dias): depoimentos + novo estoque + urgência\n4. Engajamento Instagram/Facebook (30 dias): conteúdo de consideração\n5. Leads não atendidos (15 dias): impulsionar retomada de contato\n6. Clientes antigos (> 2 anos): campanha de troca/renovação\n\nMENSAGENS DE REMARKETING EFICAZES RJ:\n- "Ainda pensando no [modelo]? Temos condições especiais esta semana."\n- "Seu próximo carro está te esperando. Traga seu usado na troca."\n- "Financiamento aprovado na hora. 0 entrada para clientes CPF limpo."\n- "Test Drive gratuito. Venha nos visitar em [bairro]."\n\nPIXEL META — EVENTOS MÍNIMOS:\n- PageView (todas as páginas)\n- ViewContent (página de modelo específico)\n- Lead (formulário preenchido)\n- Contact (WhatsApp clicado)\n- CompleteRegistration (proposta solicitada)`
        },
        {
          title: "Social Media Automotivo — Frequência, Formatos e Horários",
          category: "strategy",
          content: `FREQUÊNCIA MÍNIMA PARA CONCESSIONÁRIAS:\n- Instagram Feed: 4-5 posts/semana\n- Instagram Stories: diário (8-12 stories)\n- Facebook: 3-4 posts/semana\n- TikTok: 2-3 vídeos/semana\n\nTIPOS DE CONTEÚDO QUE MAIS CONVERTEM:\n1. FOTO REAL DO PÁTIO (40%): "Chegou no estoque", luz natural, carro limpo\n2. VÍDEO TOUR DO VEÍCULO (20%): walk-around 60-90s, interior e exterior\n3. DEPOIMENTO DE CLIENTE (15%): foto/vídeo com frase de impacto\n4. CONTEÚDO EDUCATIVO (15%): "como funciona o financiamento?", "test drive sem compromisso"\n5. OFERTA/PROMOÇÃO (10%): condições especiais, taxa zero, bônus troca\n\nHORÁRIOS MELHOR ENGAJAMENTO RJ — AUTOMOTIVO:\n- Seg-Sex: 7h-9h (commute), 12h-13h (almoço), 18h-20h (saída trabalho)\n- Sábado 9h-12h: MELHOR DIA para publicar novos carros\n- Domingo 10h-12h: família planeja compra\n\nERROS FREQUENTES:\n- Fotos de catálogo (público percebe como impessoal)\n- Posts com texto longo na imagem (plataformas penalizam)\n- Preço desatualizado (gera reclamação)\n- Stories sem link/CTA (perda de conversão)`
        },
        {
          title: "Mercado de Seminovos RJ — Guia Estratégico",
          category: "inventory",
          content: `PANORAMA SEMINOVOS RJ 2025-2026:\n- RJ é o 2º maior mercado de seminovos do Brasil\n- Demanda concentrada: Zona Sul, Barra, Niterói, Nova Iguaçu, Duque de Caxias\n- Ticket médio: R$ 45.000-85.000 (popular) | R$ 120.000-280.000 (premium)\n\nMODELOS MAIS BUSCADOS NO RJ:\n1. Toyota Corolla (XEi, Altis)\n2. Jeep Renegade / Compass\n3. Honda HRV / Civic\n4. Volkswagen T-Cross / Virtus\n5. Hyundai Creta / ix35\n6. Ford Bronco Sport / Territory\n7. Chevrolet Tracker / Onix Plus\n8. BMW Série 3 (premium)\n\nDIFERENCIAIS COMPETITIVOS NOS ANÚNCIOS:\n1. Histórico completo (FIPE, revisões em dia)\n2. Laudo cautelar incluso\n3. Garantia estendida\n4. Análise de financiamento ágil (sujeita a aprovação de crédito)\n5. Avaliação transparente do usado na troca\n6. Condições comerciais claras de IPVA e documentação\n\nGATILHOS DE COMPRA COMPLIANT RJ:\n- "Parcela planejada para o seu orçamento"\n- "Avaliação justa do seu usado na troca"\n- "Simulação rápida de financiamento (sujeita a análise de crédito)"\n- "Laudo cautelar aprovado e histórico revisado"`
        },
        {
          title: "Segmentos de Veículos e Abordagem por Público",
          category: "inventory",
          content: `SEGMENTOS AUTOMOTIVOS E ESTRATÉGIA DE ANÚNCIO:\n\nHATCHBACKS POPULARES (Ônix, HB20, Polo):\n- Público: Jovens 20-35, renda 2-5 SM, primeiro carro\n- Abordagem: Parcela baixa, consumo econômico, custo-benefício\n- Copy: "Seu primeiro carro com parcela de [valor]"\n\nSEDÃS EXECUTIVOS (Corolla, Virtus, Cruze):\n- Público: 30-50 anos, executivos, família pequena\n- Abordagem: Conforto, status, tecnologia embarcada\n- Copy: "Conforto e eficiência para o dia a dia profissional"\n\nSUVs MEDIANOS (Renegade, Compass, Creta, HRV):\n- Público: Famílias 30-50 anos, renda 5-15 SM\n- Abordagem: Espaço, segurança família, aventura urbana\n- Copy: "A família merece espaço e segurança"\n\nSUVs PREMIUM (BMW X3, Audi Q5, Volvo XC60):\n- Público: 40-60 anos, renda > 15 SM, empresários\n- Abordagem: Status, tecnologia avançada, exclusividade\n- Copy: Evitar preço, focar experiência e exclusividade\n\nPICKUPS (Hilux, Ranger, S10, Frontier):\n- Público: 30-55 anos, empresários rurais/construção, custo x robustez\n- Abordagem: Capacidade de carga, durabilidade, versatilidade\n- Copy: "Para quem trabalha de verdade"`
        },
        {
          title: "Protocolo de Lançamento de Campanha NC Performance",
          category: "manual",
          content: `CHECKLIST DE LANÇAMENTO NC PERFORMANCE:\n\nPRÉ-LANÇAMENTO (48h antes):\n☐ Definir objetivo: Leads, Tráfego ou Conversões\n☐ Confirmar URL de destino funcional (site, WhatsApp, formulário)\n☐ Validar Pixel Meta instalado e disparando eventos corretamente\n☐ Criar públicos: Prospecting, Remarketing, Lookalike\n☐ Preparar mínimo 3 criativos por conjunto\n☐ Definir budget diário aprovado com cliente\n☐ Configurar regras automáticas de pausa (CPL > meta × 2)\n☐ Confirmar número WhatsApp ativo\n\nLANÇAMENTO:\n☐ Ativar campanhas entre 6h-8h (melhor horário de leilão)\n☐ Monitorar primeiras 4 horas (taxa de rejeição, CPM inicial)\n☐ Verificar se leads estão chegando ao cliente\n☐ Documentar orçamento ativado no NC Suite\n\nPÓS-LANÇAMENTO (24h-48h):\n☐ Analisar CPL e CTR iniciais\n☐ Pausar criativos CTR < 0.5% após 1.000 impressões\n☐ Escalar budget em 20% se CPL < meta e leads chegando\n☐ Reportar ao cliente: "Campanha ativa, primeiros leads chegando"`
        },
        {
          title: "SLA de Atendimento ao Lead e Script de Abordagem",
          category: "manual",
          content: `SLA PADRÃO NC PERFORMANCE:\n- WhatsApp: Resposta recomendada em até 5 MINUTOS (meta operacional: 2 min)\n- Formulário de site: Contato em até 15 MINUTOS\n- Lead Ads Meta: Resposta em até 10 MINUTOS\n- E-mail: Resposta em até 2 HORAS\n\nDIRETRIZ DE TEMPO DE RESPOSTA:\n- Atendimento nos primeiros 5 minutos preserva a intenção de compra ativa do lead.\n- Demora superior a 30 minutos reduz significativamente a taxa de agendamento presencial.\n\nSCRIPT PRIMEIRO CONTATO WHATSAPP:\n"Oi [Nome]! Aqui é [Consultor] da [Concessionária]. Vi que você demonstrou interesse no [Modelo]. Posso te enviar fotos reais e simular as condições para o seu perfil agora?"\n\nQUALIFICADORES (perguntar nos primeiros 2 min):\n1. "Você está buscando novo ou seminovo?"\n2. "Tem veículo para avaliação na troca?"\n3. "Prefere simular financiamento ou pagamento à vista?"\n4. "Qual melhor dia para ver o carro pessoalmente?"`
        },
        {
          title: "Rotina de Otimização Semanal de Campanhas",
          category: "manual",
          content: `ROTINA NC PERFORMANCE — OTIMIZAÇÃO SEMANAL:\n\nSEGUNDA (Análise do Fim de Semana):\n1. Verificar resultados sáb/dom (melhores dias em automotivo)\n2. Checar CPL acumulado da semana anterior\n3. Identificar melhor e pior campanha/conjunto\n4. Decisão: Escalar ou pausar baseado na meta de CPL\n\nQUARTA (Manutenção):\n1. Revisar criativos com frequência > 3.0 (renovar se necessário)\n2. Atualizar públicos de remarketing (adicionar leads recentes)\n3. Testar novo criativo se CTR médio < 0.90%\n4. Verificar se formulários/WhatsApp estão recebendo leads\n\nSEXTA (Preparo para Fim de Semana):\n1. Aumentar budget 20-30% (volume maior no fim de semana)\n2. Ativar campanhas de "oferta do fim de semana"\n3. Checar criativos ativos (sem erros, link válido)\n4. Enviar relatório semanal ao cliente\n\nSINAIS DE ALERTA PARA AÇÃO IMEDIATA:\n- CPL > 2x meta → Pausar e reformular oferta/público\n- CTR < 0.70% → Trocar criativos imediatamente\n- Frequência > 4.0 → Ampliar público ou pausar conjunto\n- 0 leads em 24h com budget ativo → Checar pixel, formulário e link`
        },
        {
          title: "Capacidades e Comandos da Victoria no NC Suite",
          category: "custom",
          content: `CAPACIDADES DA VICTORIA NO SISTEMA NC SUITE:\n\nANÁLISE E RELATÓRIOS:\n- Analisar performance de campanhas ativas (7/15/30 dias)\n- Calcular CPL, CTR, ROAS por campanha\n- Identificar melhor e pior campanha do período\n- Gerar relatório executivo formatado para enviar ao cliente via WhatsApp\n- Analisar dados de dias específicos (ontem, sábado, domingo, semana)\n\nEXECUÇÃO (com aprovação Human-in-the-Loop):\n- Atualizar orçamento diário de campanha específica\n- Pausar campanha com performance crítica\n- Gerar estrutura de novo funil de vendas\n\nSOCIAL MEDIA:\n- Analisar performance de páginas conectadas\n- Identificar melhores posts por engajamento\n- Sugerir calendário de conteúdo baseado em dados reais\n\nPESQUISA NA INTERNET:\n- Pesquisar tendências de marketing automotivo\n- Buscar novas estratégias e cases de sucesso\n- Monitorar novidades de plataformas (Meta, Google Ads)\n(Ativar com: "pesquise sobre", "procure na internet", "últimas tendências de")\n\nCOMUNICAÇÃO:\n- Responde em português brasileiro\n- Tom estratégico e direto, como uma sênior da agência\n- Nunca se comporta como IA genérica\n- Foca em resultados práticos e ações concretas`
        }
      ];

      let created = 0;
      const errors: string[] = [];
      const batchSize = 3;

      for (let i = 0; i < DOCS.length; i += batchSize) {
        const batch = DOCS.slice(i, i + batchSize);
        await Promise.all(batch.map(async (doc) => {
          try {
            const embRes = await generateGeminiEmbedding(`${doc.title}\n\n${doc.content}`, GEMINI_API_KEY);
            const embedding = embRes.embedding;
            if (!embedding) { errors.push(doc.title); return; }

            const { error } = await supabase.from("victoria_knowledge").insert({
              user_id: user.id,
              category: doc.category,
              title: doc.title,
              content: doc.content,
              embedding,
              author: "NC Performance",
              source: "Manual Interno NC Suite",
              region: "BR-RJ",
              objective: "ALL",
              evidence_level: "INTERNAL_RULE",
              version: VICTORIA_CONTRACT_VERSION,
              approval_status: "APPROVED",
              is_active: true,
              priority: 90
            });
            if (error) { errors.push(doc.title); } else { created++; }
          } catch { errors.push(doc.title); }
        }));
      }

      return new Response(JSON.stringify({ success: true, created, errors }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: chat (Modo Chat principal com RAG e Streaming SSE ou JSON)
    // =========================================================================

    // 0. Obter configurações personalizadas do agente Victoria e nome do usuário
    const [vConfigRes, profileRes] = await Promise.all([
      supabase
        .from("victoria_configs")
        .select("system_prompt, model_name, rag_threshold, rag_count, temperature")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle()
    ]);

    const vConfig = vConfigRes.data;
    const rawFullName = body.user_name || profileRes.data?.full_name || user.user_metadata?.full_name || user.email?.split("@")[0] || "";
    const cleanFirst = rawFullName.trim().split(" ")[0];
    const userName = cleanFirst ? cleanFirst.charAt(0).toUpperCase() + cleanFirst.slice(1) : "Parceiro";

    const userSystemPrompt = vConfig?.system_prompt || null;
    const userModelName = body.model_version || vConfig?.model_name || "gemini-2.5-flash"; // default inteligente
    const userRagThreshold = vConfig?.rag_threshold ? Number(vConfig.rag_threshold) : 0.70;
    const userRagCount = vConfig?.rag_count ? Number(vConfig.rag_count) : 5;
    // Temperatura determinística (0.2) para análises e diagnósticos; 0.65 apenas para geração criativa de legendas
    const isCreativeMode = mode === "social_caption";
    const userTemperature = isCreativeMode
      ? 0.65
      : Math.min(0.3, Math.max(0.1, Number(body.temperature ?? 0.2)));

    const requestStartedAt = Date.now();
    const isScopedSingleEntity =
      Boolean(analysisContext && typeof analysisContext === "object") &&
      ["campaign", "adset", "ad"].includes(String(analysisContext.entity_level || "")) &&
      Boolean(analysisContext.entity_id);
    const scopedEntityExternalId = isScopedSingleEntity ? String(analysisContext.external_id || analysisContext.entity_id || "") : "";
    const scopedEntityInternalId = isScopedSingleEntity && analysisContext.internal_id ? String(analysisContext.internal_id) : "";
    const requireFull10Sections = body.requireFull10Sections !== false;

    // Registrar telemetria inicial do VictoriaAnalysisContext se fornecido
    if (analysisContext && typeof analysisContext === "object" && analysisContext.request_id) {
      try {
        await supabase.from("victoria_analysis_logs").insert({
          user_id: user.id,
          request_id: String(analysisContext.request_id),
          analysis_context_hash: String(analysisContext.analysis_context_hash || "ctx_server"),
          contract_version: VICTORIA_CONTRACT_VERSION,
          prompt_version: VICTORIA_PROMPT_VERSION,
          model_version: String(userModelName),
          source_surface: String(analysisContext.source_surface || "victoria_hub"),
          route: String(analysisContext.route || "/victoria"),
          ad_account_id: String(analysisContext.ad_account_id || selectedAccountId || ""),
          entity_level: String(analysisContext.entity_level || "account"),
          entity_id: String(analysisContext.entity_id || "unknown"),
          entity_name: String(analysisContext.entity_name || ""),
          metric_category: String(analysisContext.result_indicator?.category || "UNKNOWN"),
          official_result_label: String(analysisContext.result_indicator?.cost_label || ""),
          confidence_level: String(analysisContext.confidence_level || "baixa"),
          action_mode: operationalMode,
          validation_status: "PENDING",
          latency_ms: 0,
          used_fallback: false,
          aborted: false,
          context_snapshot: analysisContext
        });
      } catch (_logErr) {
        // non-blocking
      }
    }

    // 1. Ad accounts (sem filtro user_id — sync do Meta pode deixar user_id null)
    const { data: allAdAccounts } = await supabase
      .from("ad_accounts")
      .select("id, name");
    const adAccountNameMap = new Map<string, string>(
      (allAdAccounts || []).map((acc: any) => [acc.id, acc.name] as [string, string])
    );

    // 2. Campanhas com paginação completa (ou estritamente isolada quando entity_level=campaign/adset/ad)
    const allCampaigns: any[] = [];
    if (isScopedSingleEntity) {
      let scopedQ = (supabase as any)
        .from("campaigns")
        .select("id, external_id, name, status, objective, budget, platform, ad_account_id, client_id, clients(id, name)");
      if (selectedAccountId) {
        scopedQ = scopedQ.eq("ad_account_id", selectedAccountId);
      }
      if (scopedEntityInternalId) {
        scopedQ = scopedQ.eq("id", scopedEntityInternalId);
      } else if (scopedEntityExternalId) {
        scopedQ = scopedQ.or(`external_id.eq.${scopedEntityExternalId},id.eq.${scopedEntityExternalId}`);
      }
      const { data: scopedRows, error: scopedErr } = await scopedQ.limit(5);
      if (scopedErr) {
        console.error("Error fetching scoped campaign:", scopedErr);
      } else if (Array.isArray(scopedRows) && scopedRows.length > 0) {
        allCampaigns.push(...scopedRows);
      }
    } else {
      for (let from = 0; from < 5000; from += 1000) {
        let campsQuery = (supabase as any)
          .from("campaigns")
          .select("id, external_id, name, status, objective, budget, platform, ad_account_id, client_id, clients(id, name)")
          .order("id")
          .range(from, from + 999);
        if (selectedAccountId) {
          campsQuery = campsQuery.eq("ad_account_id", selectedAccountId);
        }
        const { data: campPage, error: campsErr } = await campsQuery;
        if (campsErr) {
          console.error("Error fetching campaigns:", campsErr);
          break;
        }
        if (!campPage?.length) break;
        allCampaigns.push(...campPage);
        if (campPage.length < 1000) break;
      }
    }

    // 2b. Buscar meta configurada na tabela alert_thresholds (precedência de metas ID 27)
    let accountThresholdCpl: number | null = null;
    try {
      let thrQ = supabase.from("alert_thresholds").select("ad_account_id, max_cpl").eq("is_active", true);
      if (selectedAccountId) thrQ = thrQ.eq("ad_account_id", selectedAccountId);
      const { data: thrData } = await thrQ.limit(1).maybeSingle();
      if (thrData?.max_cpl && Number(thrData.max_cpl) > 0) {
        accountThresholdCpl = Number(thrData.max_cpl);
      }
    } catch {}

    const campaignInfoMap = new Map<string, any>(allCampaigns.map((c: any) => [c.id, c]));
    const campaignIds = allCampaigns.map((c: any) => c.id);

    // 3. Detecta intenção de data no último message para ajustar janela de consulta
    const rawLastMsg = messages && messages.length > 0
      ? String(messages[messages.length - 1]?.content || "").toLowerCase()
      : "";

    let dynamicStartDate: string | null = null;
    let dynamicEndDate: string | null = null;
    const todayRef = new Date();
    const yearRef = todayRef.getFullYear();
    const isoToday = todayRef.toISOString().split("T")[0];
    const yesterdayRef = new Date(todayRef); yesterdayRef.setDate(yesterdayRef.getDate() - 1);
    const isoYesterday = yesterdayRef.toISOString().split("T")[0];

    // "hoje"
    if (/\bhoje\b/.test(rawLastMsg)) {
      dynamicStartDate = isoToday; dynamicEndDate = isoToday;
    }
    // "ontem" ou "yesterday"
    else if (/\bontem\b|\byesterday\b/.test(rawLastMsg)) {
      dynamicStartDate = isoYesterday; dynamicEndDate = isoYesterday;
    }
    // dd/mm/aaaa ou dd/mm
    else {
      const dateMatch = rawLastMsg.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/);
      if (dateMatch) {
        const d = dateMatch[1].padStart(2, "0");
        const mo = dateMatch[2].padStart(2, "0");
        const yr = dateMatch[3] || String(yearRef);
        dynamicStartDate = `${yr}-${mo}-${d}`;
        dynamicEndDate   = `${yr}-${mo}-${d}`;
      }
    }
    // "dia X de mês"
    if (!dynamicStartDate) {
      const meses: Record<string, string> = {
        janeiro:"01",fevereiro:"02",março:"03",marco:"03",abril:"04",maio:"05",junho:"06",
        julho:"07",agosto:"08",setembro:"09",outubro:"10",novembro:"11",dezembro:"12"
      };
      const ptMatch = rawLastMsg.match(/dia\s+(\d{1,2})\s+de\s+([a-zçã]+)/i);
      if (ptMatch) {
        const d = ptMatch[1].padStart(2, "0");
        const mo = meses[ptMatch[2].toLowerCase()] || null;
        if (mo) { dynamicStartDate = `${yearRef}-${mo}-${d}`; dynamicEndDate = `${yearRef}-${mo}-${d}`; }
      }
    }
    // "essa semana" ou "esta semana" → segunda-feira até hoje
    if (!dynamicStartDate && /essa semana|esta semana/.test(rawLastMsg)) {
      const dow = todayRef.getDay(); // 0=dom
      const monday = new Date(todayRef); monday.setDate(todayRef.getDate() - (dow === 0 ? 6 : dow - 1));
      dynamicStartDate = monday.toISOString().split("T")[0];
      dynamicEndDate   = isoToday;
    }
    // "semana passada" → seg a dom semana anterior
    if (!dynamicStartDate && /semana passada|última semana|semana anterior/.test(rawLastMsg)) {
      const dow = todayRef.getDay();
      const lastSunday = new Date(todayRef); lastSunday.setDate(todayRef.getDate() - (dow === 0 ? 7 : dow));
      const lastMonday = new Date(lastSunday); lastMonday.setDate(lastSunday.getDate() - 6);
      dynamicStartDate = lastMonday.toISOString().split("T")[0];
      dynamicEndDate   = lastSunday.toISOString().split("T")[0];
    }
    // "mês passado"
    if (!dynamicStartDate && /mês passado|último mês|mes passado/.test(rawLastMsg)) {
      const firstOfThisMonth = new Date(todayRef.getFullYear(), todayRef.getMonth(), 1);
      const lastOfLastMonth  = new Date(firstOfThisMonth.getTime() - 1);
      const firstOfLastMonth = new Date(lastOfLastMonth.getFullYear(), lastOfLastMonth.getMonth(), 1);
      dynamicStartDate = firstOfLastMonth.toISOString().split("T")[0];
      dynamicEndDate   = lastOfLastMonth.toISOString().split("T")[0];
    }
    // "esse mês" / "este mês"
    if (!dynamicStartDate && /esse mês|este mês|esse mes|este mes/.test(rawLastMsg)) {
      const firstOfMonth = new Date(todayRef.getFullYear(), todayRef.getMonth(), 1);
      dynamicStartDate = firstOfMonth.toISOString().split("T")[0];
      dynamicEndDate   = isoToday;
    }
    // "últimos X dias" ex: "últimos 7 dias", "últimos 15 dias"
    if (!dynamicStartDate) {
      const xDaysMatch = rawLastMsg.match(/últimos?\s+(\d+)\s+dias?/i);
      if (xDaysMatch) {
        const x = parseInt(xDaysMatch[1], 10);
        const xDaysAgo = new Date(todayRef); xDaysAgo.setDate(xDaysAgo.getDate() - x);
        dynamicStartDate = xDaysAgo.toISOString().split("T")[0];
        dynamicEndDate   = isoToday;
      }
    }

    // Janela: usa estritamente o periodo canônico do analysisContext quando em modo escopado
    const ctxDateFrom = String(analysisContext?.period?.date_from || analysisContext?.period?.start_date || "").slice(0, 10);
    const ctxDateTo = String(analysisContext?.period?.date_to || analysisContext?.period?.end_date || "").slice(0, 10);
    const defaultStart = new Date(todayRef); defaultStart.setDate(defaultStart.getDate() - 30);
    const startDateStr = (isScopedSingleEntity && ctxDateFrom) ? ctxDateFrom : (dynamicStartDate || ctxDateFrom || defaultStart.toISOString().split("T")[0]);
    const endDateStr   = (isScopedSingleEntity && ctxDateTo)   ? ctxDateTo   : (dynamicEndDate   || ctxDateTo   || isoToday);

    let dbMetrics: any[] = [];
    if (campaignIds.length > 0) {
      let useExtendedCols = true;
      for (let i = 0; i < campaignIds.length; i += 200) {
        const chunkIds = campaignIds.slice(i, i + 200);
        for (let from = 0; from < 20000; from += 1000) {
          const selectCols = useExtendedCols
            ? "cost, conversions, purchase_value, clicks, inline_link_clicks, all_clicks, impressions, reach, date, campaign_id, result_type, result_indicator, optimization_goal"
            : "cost, conversions, clicks, impressions, reach, date, campaign_id, result_type";
          let { data, error: queryError } = await supabase
            .from("metrics")
            .select(selectCols)
            .in("campaign_id", chunkIds)
            .gte("date", startDateStr)
            .lte("date", endDateStr)
            .order("date", { ascending: true })
            .order("campaign_id", { ascending: true })
            .range(from, from + 999);
          if (
            queryError &&
            useExtendedCols &&
            (queryError.code === "42703" || queryError.code === "PGRST204" || String(queryError.message || "").includes("column"))
          ) {
            useExtendedCols = false;
            ({ data, error: queryError } = await supabase
              .from("metrics")
              .select("cost, conversions, clicks, impressions, reach, date, campaign_id, result_type")
              .in("campaign_id", chunkIds)
              .gte("date", startDateStr)
              .lte("date", endDateStr)
              .order("date", { ascending: true })
              .order("campaign_id", { ascending: true })
              .range(from, from + 999));
          }
          if (queryError) {
            console.error("Error querying metrics:", queryError);
            break;
          }
          if (!data?.length) break;
          dbMetrics.push(...data);
          if (data.length < 1000) break;
        }
      }
    }

    // Classificador estrito alinhado a metaCore.ts (sem inferência por nome de cliente/campanha)
    const classifyEventForVictoria = (
      _campName: string,
      rawObj = "",
      resultType = "",
      resultIndicator = "",
      optimizationGoal = ""
    ): {
      badge: string;
      category: string;
      unitPlural: string;
      costLabel: string;
    } => {
      const cat = detectStrictConversionCategory({
        rawObjective: rawObj || null,
        storedResultType: resultType || null,
        resultIndicator: resultIndicator || null,
        optimizationGoal: optimizationGoal || null,
      });
      switch (cat) {
        case "INSTAGRAM_PROFILE":
          return { badge: "👤 Visitas ao Perfil IG", category: cat, unitPlural: "visitas ao perfil", costLabel: "Custo por visita ao perfil" };
        case "LANDING_PAGE_VIEWS":
          return { badge: "🌐 Page Views / Site", category: cat, unitPlural: "visualizações da página de destino", costLabel: "Custo por visualização da página de destino" };
        case "MESSAGES":
          return { badge: "💬 Conversas Meta", category: cat, unitPlural: "conversas iniciadas", costLabel: "Custo por conversa" };
        case "LEADS":
          return { badge: "🎯 Leads/Cadastros", category: cat, unitPlural: "leads", costLabel: "CPL (custo por lead)" };
        case "PURCHASES":
        case "CHECKOUT":
        case "ADD_TO_CART":
          return { badge: "🛒 Compras/Conversões", category: cat, unitPlural: "compras", costLabel: "CPA (custo por compra)" };
        case "REACH":
          return { badge: "👁️ Alcance", category: cat, unitPlural: "pessoas alcançadas", costLabel: "Custo por 1.000 pessoas alcançadas" };
        case "LINK_CLICKS":
          return { badge: "👆 Cliques no Link", category: cat, unitPlural: "cliques no link", costLabel: "CPC (custo por clique no link)" };
        case "VIDEO_VIEWS":
          return { badge: "🎬 Vídeo/ThruPlay", category: cat, unitPlural: "visualizações ThruPlay", costLabel: "Custo por visualização de vídeo" };
        case "ENGAGEMENT":
          return { badge: "❤️ Engajamento/Curtidas", category: cat, unitPlural: "engajamentos", costLabel: "Custo por engajamento" };
        default:
          return { badge: "❓ Revisar Objetivo", category: "UNKNOWN", unitPlural: "resultados (revisar)", costLabel: "Custo por resultado" };
      }
    };

    // 4. Process metrics — campaign map com evento, vetor por tipo e clicks distintos
    const campaignMap = new Map<string, {
      name: string; status: string; budget: number; platform: string;
      clientName: string; adAccountName: string; rawObjective: string;
      resultType: string; resultIndicator: string; optimizationGoal: string;
      classification: ReturnType<typeof classifyEventForVictoria>;
      cost: number; conversions: number; purchaseValue: number; clicks: number; allClicks: number; impressions: number; reach: number;
    }>();

    (dbMetrics || []).forEach((m: any) => {
      const campId = m.campaign_id;
      if (!campId) return;
      const camp = campaignInfoMap.get(campId);
      if (!camp) return;
      const clientName = (camp.clients as any)?.name || adAccountNameMap.get(camp.ad_account_id) || "Sem Cliente";
      const adAccountName = adAccountNameMap.get(camp.ad_account_id) || camp.ad_account_id || "—";
      const rt = m.result_type || "";
      const ri = m.result_indicator || "";
      const og = m.optimization_goal || "";
      const existing = campaignMap.get(campId) || {
        name: camp.name,
        status: camp.status?.toUpperCase() || "PAUSED",
        budget: Number(camp.budget || 0),
        platform: camp.platform || "Meta Ads",
        clientName, adAccountName,
        rawObjective: camp.objective || "",
        resultType: rt,
        resultIndicator: ri,
        optimizationGoal: og,
        classification: classifyEventForVictoria(camp.name || "", camp.objective || "", rt, ri, og),
        cost: 0, conversions: 0, purchaseValue: 0, clicks: 0, allClicks: 0, impressions: 0, reach: 0
      };
      if ((!existing.resultType && rt) || (!existing.resultIndicator && ri) || (!existing.optimizationGoal && og)) {
        existing.resultType = existing.resultType || rt;
        existing.resultIndicator = existing.resultIndicator || ri;
        existing.optimizationGoal = existing.optimizationGoal || og;
        existing.classification = classifyEventForVictoria(
          camp.name || "",
          camp.objective || "",
          existing.resultType,
          existing.resultIndicator,
          existing.optimizationGoal
        );
      }
      existing.cost += Number(m.cost || 0);
      existing.conversions += Number(m.conversions || 0);
      existing.purchaseValue += Number(m.purchase_value || 0);
      existing.clicks += Number(m.inline_link_clicks ?? m.clicks ?? 0);
      existing.allClicks += Number(m.all_clicks ?? m.clicks ?? 0);
      existing.impressions += Number(m.impressions || 0);
      existing.reach += Number(m.reach || 0);
      campaignMap.set(campId, existing);
    });

    const campaigns = Array.from(campaignMap.entries()).map(([id, c]) => {
      const isReach = c.classification.category === "REACH";
      const resultValue = isReach
        ? (c.reach > 0 ? c.reach : c.conversions)
        : c.conversions;
      const costPerRes: number | null = resultValue > 0
        ? (isReach ? (c.cost / resultValue) * 1000 : c.cost / resultValue)
        : null;
      const costPerResFormatted = costPerRes !== null ? `R$${costPerRes.toFixed(2)}` : "Não calculável";
      const resultLabel = c.classification.unitPlural;
      const costLabel = c.classification.costLabel;
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      const roas = c.cost > 0 && c.purchaseValue > 0 ? c.purchaseValue / c.cost : null;
      return {
        id, name: c.name, status: c.status, budget: c.budget,
        platform: c.platform, clientName: c.clientName, adAccountName: c.adAccountName,
        objective: c.classification.badge,
        category: c.classification.category,
        totals: {
          cost: c.cost, conversions: c.conversions, purchaseValue: c.purchaseValue, roas, clicks: c.clicks, allClicks: c.allClicks,
          impressions: c.impressions, reach: c.reach,
          resultValue, costPerRes, costPerResFormatted, resultLabel, costLabel, ctr
        }
      };
    });

    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);

    // Resumo por cliente via MetricVector (NUNCA soma conversas + alcance/visitas no mesmo escalar)
    const clientSummaryMap = new Map<string, { invest: number; vector: MetricVector; campaigns: string[] }>();
    campaigns.forEach(c => {
      const key = c.clientName;
      const ex = clientSummaryMap.get(key) || { invest: 0, vector: emptyMetricVector(), campaigns: [] };
      ex.invest += c.totals.cost;
      accumulateMetricVector(ex.vector, c.category as any, c.totals.resultValue, c.totals.reach ? undefined : undefined);
      if (!ex.campaigns.includes(c.name)) ex.campaigns.push(c.name);
      clientSummaryMap.set(key, ex);
    });

    const clientSummaryCtx = clientSummaryMap.size > 0
      ? Array.from(clientSummaryMap.entries())
          .sort((a, b) => b[1].invest - a[1].invest)
          .map(([name, d]) => {
            const entries = formatMetricVectorSummary(d.vector);
            const vectorSummary = entries.length > 0
              ? entries.map(e => `${e.value.toLocaleString("pt-BR")} ${e.label}`).join(" + ")
              : "0 resultados";
            const isMixed = entries.length > 1;
            const single = entries.length === 1 ? entries[0] : null;
            const cpaText = isMixed
              ? "Misto por categoria"
              : single && single.value > 0
              ? (single.key === "reach"
                  ? `R$${((d.invest / single.value) * 1000).toFixed(2)}/1k`
                  : `R$${(d.invest / single.value).toFixed(2)}`)
              : "Não calculável";
            return `- ${name} | Invest: R$${d.invest.toFixed(2)} | Resultados por tipo: ${vectorSummary} | Custo ref.: ${cpaText} | Campanhas: ${d.campaigns.slice(0,3).join(", ")}`;
          }).join("\n")
      : "Nenhum dado de cliente disponível.";

    // Contexto detalhado por campanha com evento real e custo formatado sem 0 artificial
    const contextData = campaigns.length > 0
      ? campaigns.map(c =>
          `- [${c.clientName}] ${c.name} | ${c.objective} | ${c.status} | Invest: R$${c.totals.cost.toFixed(2)} | ${c.totals.resultLabel}: ${c.totals.resultValue} | ${c.totals.costLabel}: ${c.totals.costPerResFormatted}${c.totals.purchaseValue > 0 ? ` | Receita (Compras): R$${c.totals.purchaseValue.toFixed(2)}${c.totals.roas ? ` | ROAS: ${c.totals.roas.toFixed(2)}x` : ""}` : ""} | Alcance: ${c.totals.reach} | Impressões: ${c.totals.impressions} | CTR: ${c.totals.ctr.toFixed(2)}%`
        ).join("\n")
      : "Nenhuma campanha com dados no período selecionado.";

    // Template de resposta formatado (igual ao relatório do sistema)
    const reportTemplate = campaigns.length > 0 ? (() => {
      const fmt = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fmtN = (n: number) => n.toLocaleString("pt-BR");
      const displayPeriod = startDateStr === endDateStr
        ? new Date(startDateStr + "T12:00:00Z").toLocaleDateString("pt-BR")
        : `${new Date(startDateStr + "T12:00:00Z").toLocaleDateString("pt-BR")} a ${new Date(endDateStr + "T12:00:00Z").toLocaleDateString("pt-BR")}`;
      const clients = [...new Set(campaigns.map(c => c.clientName))].join(", ");
      const platforms = [...new Set(campaigns.map(c => c.platform === "google" ? "Google Ads" : "Meta Ads"))].join(" & ");

      // Agrupa por objetivo
      const byObj = new Map<string, { cost: number; results: number; reach: number; imps: number }>();
      campaigns.forEach(c => {
        const cur = byObj.get(c.objective) || { cost: 0, results: 0, reach: 0, imps: 0 };
        cur.cost += c.totals.cost;
        cur.results += c.totals.resultValue;
        cur.reach += c.totals.reach;
        cur.imps += c.totals.impressions;
        byObj.set(c.objective, cur);
      });

      let tpl = `📊 *RELATÓRIO DE PERFORMANCE*\n━━━━━━━━━━━━━━━━━━━━\n`;
      tpl += `🏢 *Cliente:* ${clients}\n📅 *Período:* ${displayPeriod}\n📱 *Plataformas:* ${platforms}\n\n`;
      tpl += `━━━━━━━━━━━━━━━━━━━━\n*RESUMO POR OBJETIVO*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      byObj.forEach((d, obj) => {
        const isReach = obj.includes("Alcance");
        const isClick = obj.includes("Cliques");
        const cpa: number | null = d.results > 0 ? (isReach ? (d.cost / d.results) * 1000 : d.cost / d.results) : null;
        const rLabel = isReach ? "Pessoas alcançadas" : isClick ? "Cliques no Link" : "Resultados";
        const cLabel = isReach ? "Custo por 1.000 contas alcançadas" : isClick ? "CPC (Link)" : "CPA/CPL";
        tpl += `${obj}\n   💵 Investimento: R$ ${fmt(d.cost)}\n   📈 ${rLabel}: ${fmtN(d.results)}\n   💲 ${cLabel}: ${cpa !== null ? `R$ ${fmt(cpa)}` : "Não calculável"}\n`;
        if (d.reach > 0 && !isReach) tpl += `   👥 Alcance (soma diária não deduplicada): ${fmtN(d.reach)}\n`;
        tpl += `\n`;
      });
      tpl += `━━━━━━━━━━━━━━━━━━━━\n*DETALHAMENTO DE CAMPANHAS*\n━━━━━━━━━━━━━━━━━━━━\n\n`;
      campaigns.sort((a,b) => b.totals.cost - a.totals.cost).forEach(c => {
        const isReach = c.category === "REACH";
        tpl += `📌 *${c.name.toUpperCase()}*\n`;
        tpl += `   💵 Invest: R$ ${fmt(c.totals.cost)}\n`;
        tpl += `   📈 ${c.totals.resultLabel}: ${fmtN(c.totals.resultValue)}${isReach ? " alc." : ""}\n`;
        tpl += `   💲 ${c.totals.costLabel}: ${c.totals.costPerRes !== null ? `R$ ${fmt(c.totals.costPerRes)}` : "Não calculável"}\n`;
        if (c.totals.purchaseValue > 0) {
          tpl += `   🛍️ Receita (Compras): R$ ${fmt(c.totals.purchaseValue)}${c.totals.roas ? ` (ROAS: ${c.totals.roas.toFixed(2).replace(".", ",")}x)` : ""}\n`;
        }
        if (c.totals.reach > 0) tpl += `   👥 Alcance (soma diária): ${fmtN(c.totals.reach)}\n`;
        tpl += `\n`;
      });
      tpl += `━━━━━━━━━━━━━━━━━━━━\n💰 *TOTAL INVESTIDO: R$ ${fmt(totalInvest)}*\n⚡ Relatório gerado pela Victoria AI — NC Performance`;
      return tpl;
    })() : "";

    // ─── C8: Dados Expandidos — Social, Clientes, Funis ─────────────────────
    const [socialPagesRes, socialPostsRes, clientsRes, funnelsRes, funnelEventsRes] = await Promise.all([
      supabase.from("social_pages").select("page_name, facebook_followers, instagram_followers").eq("user_id", user.id).limit(10),
      supabase.from("social_posts").select("content, platform, status, scheduled_at, likes_count, comments_count, reach_count").eq("user_id", user.id).order("scheduled_at", { ascending: false }).limit(8),
      supabase.from("clients").select("name").eq("user_id", user.id).order("name").limit(20),
      supabase.from("funnels").select("id, name, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
      supabase.from("funnel_events").select("funnel_id, lead_id, event_type, created_at").order("created_at", { ascending: true }).limit(800)
    ]);

    const socialPages    = socialPagesRes.data   || [];
    const socialPosts    = socialPostsRes.data   || [];
    const clientsList    = clientsRes.data       || [];
    const funnelsList    = funnelsRes.data       || [];
    const funnelEvents   = funnelEventsRes.data  || [];

    // Calcular Time to MQL e SQL baseados nos eventos do funil
    let timeToMQLText = "Sem dados suficientes de MQL";
    let timeToSQLText = "Sem dados suficientes de SQL";

    if (funnelEvents.length > 0) {
      const leadJourneys: Record<string, { view?: Date; mql?: Date; sql?: Date }> = {};
      
      funnelEvents.forEach((ev: any) => {
        const leadId = ev.lead_id;
        if (!leadId) return;
        if (!leadJourneys[leadId]) {
          leadJourneys[leadId] = {};
        }
        
        const date = new Date(ev.created_at);
        if (ev.event_type === "view") {
          leadJourneys[leadId].view = date;
        } else if (ev.event_type === "form_submit" || ev.event_type === "lead_capture") {
          leadJourneys[leadId].mql = date;
        } else if (ev.event_type === "visit_scheduled" || ev.event_type === "checkout") {
          leadJourneys[leadId].sql = date;
        }
      });

      const mqlTimes: number[] = [];
      const sqlTimes: number[] = [];

      Object.values(leadJourneys).forEach((j) => {
        if (j.view && j.mql) {
          mqlTimes.push(j.mql.getTime() - j.view.getTime());
        }
        if (j.mql && j.sql) {
          sqlTimes.push(j.sql.getTime() - j.mql.getTime());
        }
      });

      if (mqlTimes.length > 0) {
        const avgMqlMs = mqlTimes.reduce((a, b) => a + b, 0) / mqlTimes.length;
        const avgMqlMin = Math.round(avgMqlMs / 60000);
        timeToMQLText = `${avgMqlMin} minutos`;
      } else {
        timeToMQLText = "Sem dados suficientes registrados no período";
      }

      if (sqlTimes.length > 0) {
        const avgSqlMs = sqlTimes.reduce((a, b) => a + b, 0) / sqlTimes.length;
        const avgSqlHours = Math.round((avgSqlMs / 3600000) * 10) / 10;
        timeToSQLText = `${avgSqlHours} horas`;
      } else {
        timeToSQLText = "Sem dados suficientes registrados no período";
      }
    }

    // ─── C7: Intent Detection (roteamento multiagente) ───────────────────────
    const lastUserMsg = (messages && messages.length > 0)
      ? String(messages[messages.length - 1]?.content || "").toLowerCase()
      : "";

    const intent: "social" | "funil" | "gestao" | "trafego" =
      /instagram|facebook|social|seguidor|engajamento|reach|stories|reel|conteúdo digital/.test(lastUserMsg)
        ? "social"
        : /funil|funnel|lead|conversão|etapa|whatsapp flow|jornada do cliente/.test(lastUserMsg)
        ? "funil"
        : /cliente|reunião|cobrança|pagamento|contrato|prospectar|crm|relacionamento/.test(lastUserMsg)
        ? "gestao"
        : "trafego";

    const subAgentLabel: Record<string, string> = {
      social:  "🎨 SOCIAL MEDIA STRATEGIST — Especialista em conteúdo, engajamento e crescimento orgânico",
      funil:   "🏗️ FUNNEL ARCHITECT — Especialista em funis de conversão, etapas e jornada do cliente",
      gestao:  "🤝 RELATIONSHIP MANAGER — Especialista em gestão de clientes, CRM e cobranças",
      trafego: "🚀 TRAFFIC ANALYST — Especialista em campanhas de tráfego pago, CPL e otimização de conversão"
    };

    const socialCtx = socialPages.length > 0
      ? socialPages.map((p: any) => `- ${p.page_name} | FB: ${Number(p.facebook_followers||0).toLocaleString("pt-BR")} | IG: ${Number(p.instagram_followers||0).toLocaleString("pt-BR")}`).join("\n")
      : "Nenhuma página conectada.";

    const postsCtx = socialPosts.length > 0
      ? socialPosts.map((p: any) => {
          const d = p.scheduled_at ? new Date(p.scheduled_at).toLocaleDateString("pt-BR") : "?";
          const txt = (p.content || "").slice(0, 55).replace(/\n/g, " ");
          return `- [${d}] ${p.platform||"?"} | "${txt}..." | ${p.status} | ❤️${p.likes_count||0} 💬${p.comments_count||0} 👁️${p.reach_count||0}`;
        }).join("\n")
      : "Nenhum post recente.";

    const clientsCtx = clientsList.length > 0
      ? clientsList.map((c: any) => `- ${c.name}`).join("\n")
      : "Nenhum cliente cadastrado.";

    const funnelsCtx = funnelsList.length > 0
      ? funnelsList.map((f: any) => `- ${f.name}`).join("\n")
      : "Nenhum funil criado.";

    const getPrevSaturdayAndSunday = (refDate: Date) => {
      const dayOfWeek = refDate.getDay();
      const sat = new Date(refDate);
      const sun = new Date(refDate);
      if (dayOfWeek === 0) {
        sat.setDate(refDate.getDate() - 1);
        sun.setDate(refDate.getDate());
      } else if (dayOfWeek === 6) {
        sat.setDate(refDate.getDate() - 7);
        sun.setDate(refDate.getDate() - 6);
      } else {
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

    const dailyRows = (dbMetrics || []).map((m: any) => {
      const camp = campaignInfoMap.get(m.campaign_id);
      const campName = camp?.name || "Sem Nome";
      const clientName = (camp?.clients as any)?.name || adAccountNameMap.get(camp?.ad_account_id) || "Sem Cliente";
      const platform = camp?.platform || "Meta Ads";
      const cost = Number(m.cost || 0);
      const conversions = Number(m.conversions || 0);
      const clicks = Number(m.clicks || 0);
      const impressions = Number(m.impressions || 0);
      const reach = Number(m.reach || 0);
      const cls = classifyEventForVictoria(campName, camp?.objective || "", m.result_type || "");
      const denom = cls.category === "REACH" ? (reach > 0 ? reach : conversions) : conversions;
      const unitCostText = denom > 0
        ? `R$ ${(cls.category === "REACH" ? (cost / denom) * 1000 : cost / denom).toFixed(2)}`
        : "Não calculável";
      return `${m.date} | ${clientName} | ${platform} | ${campName} | Gasto: R$ ${cost.toFixed(2)} | ${cls.unitPlural}: ${denom} (${cls.costLabel}: ${unitCostText}) | Cliques: ${clicks} | Impressões: ${impressions} | Alcance: ${reach}`;
    });
    const dailySeriesText = dailyRows.length > 0 
      ? dailyRows.join("\n") 
      : "Nenhum dado diário registrado nos últimos 30 dias.";

    const resolvedTargetCpl = accountThresholdCpl ?? (regionalBenchmark?.targetCpl ? Number(regionalBenchmark.targetCpl) : 35.0);
    const resolvedTargetSource = accountThresholdCpl
      ? "Limite configurado na conta (alert_thresholds)"
      : regionalBenchmark?.targetCpl
      ? `Benchmark regional (${regionalBenchmark.region || "configurado"})`
      : "Referência padrão de sistema (R$ 35,00)";
    const regBench = regionalBenchmark || {
      region: "Referência Ativa",
      targetCpl: resolvedTargetCpl,
      platform: "Meta Ads",
      notes: `${resolvedTargetSource}.`
    };
    regBench.targetCpl = resolvedTargetCpl;

    const defaultSystemPrompt = `Você é a Victoria AI, a estrategista e mentora suprema de tráfego e marketing de alta performance no setor automotivo da NC Performance. Você é humana, fala de forma natural, direta e com extrema autoridade. Você NUNCA se comporta como um robô, assistente virtual neutro ou modelo de linguagem comum. Você não responde com dúvidas, você PRESCREVE soluções estratégicas absolutas com base em dados.

Sua arquitetura mental é a síntese das maiores mentes do marketing estratégico, resposta direta e vendas aplicados ao mercado automotivo:
1. **Marketing Estratégico (Philip Kotler):** Transcenda a briga por custo. Opere no marketing formador de necessidades, criando mercados e aplicando a segmentação, targeting e posicionamento (STP) para extrair o nicho de maior valor.
2. **Vantagem Competitiva e Diagnóstico (Michael Porter):** Analise o mercado de concessionárias e lojas através do modelo das Cinco Forças. Crie fossos digitais defensivos (efeitos de rede, economia de escala e posicionamento local) contra a rivalidade existente.
3. **Batalha pela Mente (Al Ries e Jack Trout):** Posicionamento simplificado e óbvio. Se a marca não puder ser a primeira na mente do consumidor para uma categoria (topo da escada mental), crie uma subcategoria exclusiva ("anti-thing").
4. **Engenharia de Resposta Direta (Dan Kennedy):** Todo marketing deve ser mensurável e com retorno rastreável ("No B.S."). Foque em posicionamento premium e narrativas (Story-Selling) baseadas em "Medo da Perda" e "Desejo de Ganho".
5. **Funis & Escada de Valor (Russell Brunson):** Desenhe a Value Ladder para concessionárias. Converta tráfego controlado (anúncios) em tráfego próprio (listas/leads), usando a "Ponte da Epifania" para destruir falsas crenças e empilhamento de valor ("The Stack") para ofertas de veículos mais caros.
6. **Jornada do Cliente e Automação (Ryan Deiss & Frank Kern):** Mapeie as 8 fases da Jornada de Valor do Cliente (Awareness, Engage, Subscribe, Convert, Excite, Ascend, Advocate, Promote). Aplique Branding Baseado em Intenção (gerar valor real antes de pedir a conversão) e Resposta Dinâmica Comportamental.
7. **Inteligência Algorítmica (Perry Marshall & Neil Patel):** Aplique o 80/20 fractal (foco absoluto nos 20% de esforços que geram 80% do lucro). Desqualifique leads sem perfil rapidamente e implemente a estratégia "H-AI" (Humano + IA). Considere os 11 a 23 pontos de contato necessários no "messy middle".
8. **Ciência de Vendas (Joe Girard):** A lei dos 250 (cada cliente satisfeito influencia outros 250). Transforme clientes em "cães de caça" que trazem novos compradores. Use o sistema Roda Gigante (Ferris Wheel) para prospecção ininterrupta e organização cirúrgica de CRM.
9. **Arsenal Tecnológico Automotivo:** Targeted VIN Advertising (campanhas baseadas no chassi/VIN do estoque real), Streaming Media & Nitro Specials (ofertas agressivas em tempo real no site), otimização de feeds e gestão de reputação por IA.

PERSONALIDADE E ATITUDE:
- Você fala de forma natural, sênior e objetiva como estrategista da NC Performance. Sem teatralidade, sem chavões ou desculpas.
- REGRA CRÍTICA E INVIOLÁVEL: Dirija-se ao usuário SEMPRE pelo primeiro nome dele: **${userName}**. NUNCA o chame de "Comandante", "Chefe", "Usuário" ou apelidos.
- Quando receber saudações simples (ex.: "oi", "tudo bem?"), responda de forma direta e profissional usando o nome **${userName}** e oferecendo leitura factual dos dados do período ou perguntando qual conta/campanha deseja auditar — PROIBIDO inventar histórias pessoais como "passei o fim de semana olhando os conjuntos".

DIRETRIZES TÉCNICAS E ESTRATÉGICAS DE MARKETING AUTOMOTIVO:
1. **Analise os Períodos com Precisão:**
   - Os dados na tabela cobrem de ${startDateStr} a ${endDateStr}.
   - Para filtrar por data: localize as linhas da data solicitada na TABELA DE MÉTRICAS DIÁRIAS e some os valores. Ex: "como foi dia 10/06?" → filtre por "2026-06-10" na tabela.
   - Para filtrar por cliente: filtre as linhas onde a coluna Cliente contém o nome buscado.
   - "ontem" = ${formattedYesterday} | "fim de semana" = ${lastSat} (sáb) e ${lastSun} (dom) | "hoje" = ${formattedToday}.
   - Se o usuário pedir uma data fora do período carregado, informe que os dados disponíveis são de ${startDateStr} até ${endDateStr} e sugira refinar a pergunta.
2. **BENCHMARK REGIONAL DE MENSAGENS (${regBench.region} - META CUSTO POR CONVERSA WHATSAPP: R$ ${Number(regBench.targetCpl).toFixed(2)} — APLICÁVEL APENAS A CAMPANHAS DE MENSAGENS):**
   - **Regra Estrita de Escopo:** A referência de **R$ ${Number(regBench.targetCpl).toFixed(2)}** aplica-se EXCLUSIVAMENTE a campanhas cujo objetivo/evento oficial seja **Mensagens (MESSAGES — conversas iniciadas)**. É TERMINANTEMENTE PROIBIDO aplicar essa meta a campanhas de Alcance (REACH), Visitas ao Perfil (INSTAGRAM_PROFILE), Landing Page Views ou Cliques no Link.
   - **🟢 Excelente (apenas em Mensagens):** Custo por conversa <= R$ ${Number(regBench.targetCpl).toFixed(2)}. Se a janela tiver >= 3 dias de estabilidade, sugira escalar verba em +15% a +20% a cada 48h.
   - **🟡 Atenção (apenas em Mensagens):** Custo por conversa entre R$ ${(Number(regBench.targetCpl) + 0.01).toFixed(2)} e R$ ${(Number(regBench.targetCpl) * 1.5).toFixed(2)}. Recomende testar vídeos curtos/tours reais no pátio e revisar a rapidez de resposta no WhatsApp.
   - **🔴 Crítico (apenas em Mensagens):** Custo por conversa > R$ ${(Number(regBench.targetCpl) * 1.5).toFixed(2)}. Em janela curta (1 dia), recomende monitorar por 72h antes de pausar definitivamente; em janela >= 3–7 dias, recomende revisar oferta/criativo ou pausar conjuntos sem conversão.
3. **CTR de Link (Taxa de Cliques de Link):**
   - Em campanhas de Mensagens, Tráfego ou Leads: acima de 1,20% é saudável; abaixo de 0,80% sugere testar fotos/vídeos reais do pátio em vez de artes genéricas.
   - Em campanhas de **Alcance (REACH / OUTCOME_AWARENESS)**: CTR de link é uma métrica **SECUNDÁRIA**, pois o algoritmo otimiza alcance único a baixo CPM, não cliques. Nunca condene uma campanha de Alcance apenas pelo CTR de link baixo.
4. **Estratégias Reais e Éticas para Recomendar:**
   - **Leads no WhatsApp:** Resposta rápida (meta operacional até 5 minutos) preserva a intenção de compra ativa.
   - **Formulários nativos (Lead Ads):** Perguntas qualificadoras objetivas (ex.: "Tem veículo para avaliação na troca?", "Prefere simular financiamento ou à vista?").
   - **Compliance Publicitário:** NUNCA sugira promessas enganosas como "Financiamento sem consulta ao SPC/Serasa", "Aprovação garantida 100%" ou percentuais sem fonte primária auditável (como "54% mais conversas" ou "80% de perda").
5. **AUTONOMIA ABSOLUTA PARA ALTERAR DIAGNÓSTICOS (MENTE OFICIAL DO SISTEMA):**
   - Você comanda a Mente Oficial do Sistema. Você TEM AUTONOMIA TOTAL para reclassificar e alterar o diagnóstico de qualquer campanha, conjunto, criativo ou funil com base no que aprendeu na sua BASE DE CONHECIMENTO RAG e nas notícias/leis do RADAR DE MERCADO.
   - Se uma regra aprendida ou notícia/lei (ex: novas regras do CONTRAN/IPVA/SENATRAN, tendência de mercado ou diretriz tática inserida no RAG) contradisser um diagnóstico padrão ou indicar oportunidade/risco iminente, ALTEIRE O DIAGNÓSTICO explicitamente, citando a fonte/documento da Base de Conhecimento ou do Radar e prescrevendo a ação de ajuste imediato.
6. **DOMÍNIO PROFUNDO DA ARQUITETURA ALGORÍTMICA DO META ADS (PARECER TÉCNICO 2026):**
   - **Pipeline Multi-Estágio**: (1) Filtros Rígidos (apenas idade mínima e localização geográfica; interesses/demografia no Advantage+ Audience são apenas sugestões iniciais); (2) **Andromeda Retrieval Engine** (arquitetura MoE em chips MTIA/GH200 com Fused GPU Kernel >1B anúncios/s e indexação diferenciável *Learning To Index* $a_k$, além de *Auction Overlap* sem mito de Entity ID); (3) **GEM — Generative Ads Recommendation Model** (arquitetura *Kunlun* + *OneSeq* de aprendizado de sequência contínua de eventos + *CompSkip* que economiza 43% de FLOPS, elevando conversões em +18,9% e CTR em +12%); (4) **Leilão Final VCG + Pacing ($\lambda$)**.
   - **Equação de Valor Total (Total Value)**: $\\text{Total Value} = (\\text{Bid}_{\\text{efetivo}} \\times \\text{pCTR} \\times \\text{pCVR}) + \\text{User Value}$. Se o CPM dispara com queda de entrega, diagnostique degradação em **User Value** (lentidão na página, rejeição pós-clique, demora no WhatsApp ou clickbait).
   - **Precificação Vickrey-Clarke-Groves (VCG)**: $\\text{Actual Cost} = \\frac{\\text{Total Value}_{2º} - \\text{User Value}_{\\text{Vencedor}}}{\\text{pCTR}_{\\text{Vencedor}} \\times \\text{pCVR}_{\\text{Vencedor}}}$. Criativos com alto pCTR, pCVR e User Value pagam menor eCPM e vencem concorrentes com orçamentos maiores.
   - **Pacing por Preço de Sombra ($\\lambda$ Shadow Price)**: $\\text{Bid}_{\\text{efetivo}} = \\lambda \\cdot \\text{Bid}_{\\text{base}}$. Escalar orçamento acima de **+20% por ciclo** empurra $\\lambda \\to 1.0$ em leilões marginais caros e reinicia a Fase de Aprendizado.
   - **Cold Start, Multi-Armed Bandits e Learning Limited**: O algoritmo usa *Thompson Sampling* / *UCB* na fase de exploração e exige **50 eventos de conversão otimizados por semana por conjunto** para estabilizar na fase de explotação. Conjuntos pulverizados devem ser consolidados em **Advantage+ Campaign Budget (CBO)** (e usar ABO apenas para Incubadora de Testes de Criativos).
   - **Telemetria Server-Side (CAPI) & Event Match Quality (EMQ)**: O Pixel sozinho perde 20% a 40% dos sinais (ATT/ITP/AdBlockers). Exija CAPI redundante com deduplicação estrita por \`event_id\` + \`event_name\` (janela 48h) e parâmetros \`em\` (SHA-256), \`ph\` (SHA-256 E.164) e \`fbc\`/\`fbp\` (texto puro SEM hash) para manter EMQ >= 8.0–8.8.
   - **Atribuição 2026 & Criativos**: Cliques padrão computam estritamente *Link Clicks* direcionais; interações sociais caem em *1-day Engage-Through*; vídeo engajado = 5s. No Andromeda, variações cosméticas caem no mesmo cluster; exija **Diversidade Conceitual Autêntica** (UGC, tour real, estático de oferta, carrossel) para elevar o *Creative Diversity Score* e avalie a verdade contábil por **MER** e **nCAC**.

GROUNDING DE TEMPO E DATAS:
${timeMetadata}

${isScopedSingleEntity ? `ESCOPO ESTRITAMENTE ISOLADO (ENTIDADE ÚNICA — PROIBIDO CITAR OUTRAS CAMPANHAS OU RESUMO GLOBAL DA CONTA):
- Entidade: ${analysisContext?.entity_name || ""} (${analysisContext?.entity_id || ""})
- Conta: ${analysisContext?.ad_account_name || ""} (${analysisContext?.ad_account_id || ""})
- Período: ${startDateStr} até ${endDateStr} (${ctxDaysCount} dia(s))
- Categoria / Evento Oficial: ${analysisContext?.result_indicator?.category || "UNKNOWN"} | Indicador Oficial: ${analysisContext?.result_indicator?.cost_label || "Custo por resultado"}
- REGISTRO DIÁRIO DESTA ENTIDADE:
${dailySeriesText}` : `PERÍODO DOS DADOS CARREGADOS: ${startDateStr} até ${endDateStr} | Total investido: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} | Campanhas com dados: ${campaigns.length}

RESUMO POR CLIENTE (período acima):
${clientSummaryCtx}

CAMPANHAS DETALHADAS — [Cliente] Nome | Objetivo | Status | Invest | Resultado correto pelo objetivo | Custo/Resultado | Alcance | Impressões | CTR:
${contextData}

TABELA DIÁRIA — Data | Cliente | Plataforma | Campanha | Gasto | Leads/Conversões | Cliques | Impressões:
${dailySeriesText}

DADOS SOCIAIS (Meta / Instagram / Facebook):
PÁGINAS CONECTADAS:
${socialCtx}

POSTS RECENTES (últimos 8):
${postsCtx}

PORTFOLIO DE CLIENTES ATIVOS:
${clientsCtx}

FUNIS CADASTRADOS NO SISTEMA:
${funnelsCtx}

LATÊNCIA ATUAL DE JORNADA (MÉTRICA DE EVENTOS DO FUNIL):
- Tempo Médio de Conversão (Time to MQL): ${timeToMQLText}
- Tempo Médio de Agendamento (Time to SQL): ${timeToSQLText}`}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROTEAMENTO MULTIAGENTE — SUB-AGENTE ATIVO:
→ ${subAgentLabel[intent]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DIRETRIZES DE AUDITORIA DE FUNIS E CRO:
1. Analise atritos e fricções reais observados entre etapas sem inventar percentuais não presentes nos dados.
2. Compare apenas métricas e intervalos efetivamente registrados (Time to MQL e Time to SQL reais) antes de recomendar automação ou ajustes.

REGRAS DE RESPOSTA (${VICTORIA_CONTRACT_VERSION}):
1. Sempre responda em Português Brasileiro usando formatação markdown limpa.
2. Aja como estrategista sênior dedicada, clara e factual. Nunca invente números fora dos dados recebidos.
3. **AVALIAÇÃO VISUAL DE IMAGENS (MULTIMODALIDADE):**
   - Se o usuário anexar imagem, comente sobre clareza da oferta, legibilidade mobile e chamada para ação.
4. **MÉTRICAS CORRETAS POR OBJETIVO — REGRA CRÍTICA DE UNIDADES (CONTRATO ${VICTORIA_CONTRACT_VERSION}):**
   - 👁️ *Alcance / Reconhecimento (REACH / OUTCOME_AWARENESS)* → resultado primário = **pessoas alcançadas**, indicador oficial de custo = **Custo por 1.000 pessoas alcançadas** \`(spend / reach) * 1000\`, secundário = **CPM**. **PROIBIDO** usar "CPL", "CPA", "Custo por conversa" ou comparar com campanha de Mensagens!
   - 💬 *Mensagens / WhatsApp (MESSAGES)* → resultado primário = **conversas iniciadas**, indicador oficial = **Custo por conversa**.
   - 📸 *Visitas ao Perfil do Instagram (INSTAGRAM_PROFILE)* → resultado primário = **visitas ao perfil**, indicador oficial = **Custo por visita ao perfil**. **PROIBIDO** usar "CPL".
   - 🌐 *Visualizações da Página de Destino (LANDING_PAGE_VIEWS)* → resultado primário = **visualizações da página de destino**, indicador oficial = **Custo por visualização da página de destino**.
   - 👆 *Cliques no Link (LINK_CLICKS)* → resultado primário = **cliques no link**, indicadores oficiais = **CPC Link (custo por clique no link)** e **CPC Todos (custo por clique geral)**, sempre distinguidos (\`all_clicks\`).
   - 🎯 *Leads / Cadastros (LEADS)* → resultado primário = **leads**, indicador oficial = **CPL (custo por lead)**.
   - 🛒 *Compras (PURCHASES)* → resultado primário = **compras**, indicadores oficiais = **CPA (custo por compra)** e **ROAS**.
   - **PROIBIÇÃO DE COMPARAÇÃO ENTRE UNIDADES DIFERENTES:** Nunca compare grandezas de denominadores diferentes.
   - **ESTRUTURA OBRIGATÓRIA DE RESPOSTA ANALÍTICA (10 SEÇÕES EM ORDEM EXATA):**
     Comece SEMPRE com **"O que esta campanha foi configurada para otimizar?"** e estruture exatamente nestas 10 seções:
     1. \`#### 1. Escopo analisado\`
     2. \`#### 2. Objetivo e evento oficial\`
     3. \`#### 3. Leitura factual\`
     4. \`#### 4. Indicadores primários e secundários\`
     5. \`#### 5. Limitações e dados ausentes\`
     6. \`#### 6. Hipóteses\`
     7. \`#### 7. Recomendações seguras\`
     8. \`#### 8. Plano de validação\`
     9. \`#### 9. Nível de confiança\`
     10. \`#### 10. Fontes e documentos utilizados\`

5. **MODO OPERACIONAL PADRÃO (SOMENTE LEITURA):**
   - ${operationalMode === "ACTION_PROPOSAL"
     ? `APROVAÇÃO EXPLÍCITA DE PROPOSTA ATIVA: Inclua no final proposta \`json:action\` apenas com campaignId numérico do Meta, orçamento atual conhecido, preview e rollback.`
     : "MODO READ_ONLY_ANALYSIS ATIVO: É TERMINANTEMENTE PROIBIDO emitir blocos `json:action`, sugerir orçamento novo ou propor mutação automática no Meta Ads."}`;

    const scopedHeaderSystemPrompt = `Você é a Victoria AI, Estrategista Sênior da NC Performance operando sob o Contrato Canônico ${VICTORIA_CONTRACT_VERSION} (${VICTORIA_PROMPT_VERSION}).
- Trate o usuário pelo primeiro nome: **${userName}**. Nunca use "Comandante", "Chefe" ou apelidos.
- Em análise de campanha única, analise EXCLUSIVAMENTE a entidade informada no Contrato Canônico.`;

    const normalizedSystemPrompt = isScopedSingleEntity
      ? `${scopedHeaderSystemPrompt}\n${defaultSystemPrompt.slice(defaultSystemPrompt.indexOf("ESCOPO ESTRITAMENTE ISOLADO"))}`
      : defaultSystemPrompt;

    // =========================================================================
    // 3. EXECUÇÃO RAG CURADO (APENAS APPROVED + FALLBACK LEXICAL + CITAÇÕES)
    // =========================================================================
    let knowledgeCtx = "";
    const ragCitations: ServerRagCitation[] = [];
    const seenCitationIds = new Set<string>();
    const addCitation = (k: any) => {
      const cid = String(k?.id || "");
      if (!cid || seenCitationIds.has(cid)) return;
      seenCitationIds.add(cid);
      ragCitations.push({
        id: cid,
        title: String(k?.title || "Documento Interno"),
        version: String(k?.version || VICTORIA_CONTRACT_VERSION),
        evidence_level: String(k?.evidence_level || "INTERNAL_RULE"),
        approval_status: String(k?.approval_status || "APPROVED"),
        source: String(k?.source || "Base de Conhecimento NC Suite"),
      });
    };

    try {
      const { data: allKnowledge, error: kErr } = await supabase
        .from("victoria_knowledge")
        .select("id, category, title, content, source, evidence_level, approval_status, version, objective, priority")
        .eq("is_active", true)
        .eq("approval_status", "APPROVED")
        .not("evidence_level", "in", "(UNVERIFIED,OPINION)")
        .or(`user_id.eq.${user.id},evidence_level.in.(OFFICIAL_DOC,INTERNAL_RULE)`)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30);

      if (!kErr && Array.isArray(allKnowledge) && allKnowledge.length > 0) {
        const lastMsgLower = String(messages[messages.length - 1]?.content || "").toLowerCase();
        const catKeyword = String(analysisContext?.result_indicator?.category || "").toLowerCase();
        const entityKeyword = String(analysisContext?.entity_name || "").toLowerCase();
        const combinedQueryTerms = `${lastMsgLower} ${catKeyword} ${entityKeyword}`
          .split(/[^a-zà-ú0-9]+/i)
          .filter((t) => t.length >= 3);

        const rankedDocs = allKnowledge
          .filter((k: any) => k.approval_status === "APPROVED" && k.evidence_level !== "UNVERIFIED" && k.evidence_level !== "OPINION")
          .map((k: any) => {
            const hay = `${k.title || ""} ${k.category || ""} ${k.objective || ""} ${k.content || ""}`.toLowerCase();
            let score = Number(k.priority || 50) / 100;
            if (catKeyword && (String(k.objective || "").toLowerCase().includes(catKeyword) || hay.includes(catKeyword))) {
              score += 5;
            }
            if (k.evidence_level === "OFFICIAL_DOC") score += 2;
            for (const term of combinedQueryTerms) {
              if (hay.includes(term)) score += 1;
            }
            return { doc: k, score };
          })
          .sort((a, b) => b.score - a.score)
          .slice(0, Math.max(4, userRagCount));

        rankedDocs.forEach(({ doc }) => addCitation(doc));
        knowledgeCtx = rankedDocs
          .map(({ doc: k }) => `[ID: ${k.id} | ${String(k.category || "").toUpperCase()} | Fonte: ${String(k.source || "Manual Interno")} | Evidência: ${String(k.evidence_level || "INTERNAL_RULE")} | v${String(k.version || VICTORIA_CONTRACT_VERSION)}] ${String(k.title || "")}:\n${String(k.content || "").slice(0, 650)}`)
          .join("\n\n---\n\n");
      }
    } catch (_kErr) {
      console.warn("[VICTORIA] Falha ao carregar base de conhecimento:", _kErr);
    }

    let ragRetrievalMode = "lexical_only";
    let vectorMatchCount = 0;

    // 3b. Busca vetorial prioritária usando embedding 768d (sem bloquear mesmo quando externalContext é enviado)
    if (GEMINI_API_KEY && messages && messages.length > 0) {
      const lastUserMessage = String(messages[messages.length - 1]?.content || "").trim();
      const semanticQuery = [
        lastUserMessage,
        analysisContext?.result_indicator?.category || "",
        analysisContext?.result_indicator?.cost_label || "",
        analysisContext?.entity_name || "",
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

      if (semanticQuery) {
        try {
          const embRes = await generateGeminiEmbedding(semanticQuery, GEMINI_API_KEY);
          if (embRes.embedding) {
            const effectiveThreshold = Math.min(Number(userRagThreshold || 0.7), 0.44);
            const { data: matchData, error: matchErr } = await supabase.rpc(
              "match_victoria_knowledge",
              {
                query_embedding: embRes.embedding,
                match_threshold: effectiveThreshold,
                match_count: Math.max(4, userRagCount),
                p_user_id: user.id
              }
            );

            if (matchErr) {
              console.error("Erro na busca de similaridade RAG:", matchErr);
            } else if (matchData && matchData.length > 0) {
              const safeVectorDocs = matchData.filter(
                (k: any) =>
                  k.approval_status !== "REJECTED" &&
                  k.evidence_level !== "UNVERIFIED" &&
                  k.evidence_level !== "OPINION"
              );
              if (safeVectorDocs.length > 0) {
                vectorMatchCount = safeVectorDocs.length;
                ragRetrievalMode = "vector+lexical";
                safeVectorDocs.forEach((k: any) => addCitation(k));
                const vectorBlocks = safeVectorDocs
                  .map((k: any) => `[ID: ${k.id} | VETOR sim=${Number(k.similarity || 0).toFixed(2)} | Categoria: ${k.category} | Evidência: ${k.evidence_level || "INTERNAL_RULE"}] ${k.title}: ${String(k.content || "").slice(0, 650)}`)
                  .join("\n\n---\n\n");
                knowledgeCtx = vectorBlocks + (knowledgeCtx ? `\n\n---\n\n${knowledgeCtx}` : "");
              }
            }
          }
        } catch (ragErr) {
          console.error("Falha ao computar RAG vetorial:", ragErr);
        }
      }
    }
    const retrievedContext = externalContext || "";

    // =========================================================================
    // 3c. WEB SEARCH — Gemini Google Grounding quando usuário pede pesquisa
    // =========================================================================
    const hasSearchIntent = /pesquise|procure na internet|busque na web|buscar na internet|últimas tendências|novidades sobre|pesquisa sobre|o que está acontecendo com|pesquise sobre|me traga dados de|me traga informações sobre|tendências de mercado/.test(lastUserMsg);

    let webSearchContext = "";
    if (hasSearchIntent && GEMINI_API_KEY) {
      try {
        const searchQuery = messages[messages.length - 1]?.content || lastUserMsg;
        const searchRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `Pesquise e resuma em português: ${searchQuery}` }], role: "user" }],
              tools: [{ google_search: {} }],
              generationConfig: { maxOutputTokens: 1024, temperature: 0.3 }
            })
          }
        );
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const searchText = searchData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (searchText) {
            webSearchContext = `\n\n[🌐 RESULTADO DE PESQUISA NA INTERNET — ${new Date().toLocaleDateString("pt-BR")}]:\n${searchText}\n[Fim da pesquisa web]`;
            console.log("[VICTORIA] Web search realizado com sucesso.");
          }
        }
      } catch (searchErr) {
        console.warn("[VICTORIA] Falha na pesquisa web:", searchErr);
      }
    }

    let promptWithRAG = isScopedSingleEntity
      ? normalizedSystemPrompt
      : (userSystemPrompt ? `${normalizedSystemPrompt}\n\nPREFERÊNCIA COMPLEMENTAR DO USUÁRIO (SUBORDINADA ÀS REGRAS CANÔNICAS):\n${userSystemPrompt}` : normalizedSystemPrompt);

    promptWithRAG += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nREGRA MANDATÓRIA DE TRATAMENTO & PRECISÃO (${VICTORIA_CONTRACT_VERSION}):\n- Dirija-se ao usuário SEMPRE pelo primeiro nome dele: **${userName}**. PROIBIDO usar "Comandante", "Chefe" ou "Usuário".\n- SEMPRE preserve o evento oficial da entidade (ex: "conversas iniciadas", "visitas ao perfil", "visualizações de página", "pessoas alcançadas") e NUNCA converta para "CPL" quando o objetivo for alcance/visitas/mensagens/cliques.\n- SEMPRE separe e informe explicitamente **CTR Link / CPC Link** e **CTR Todos / CPC Todos**.\n- Quando \`comparable_same_objective_avg\` for \`null\`, afirme literalmente: "Benchmark homogêneo indisponível: não existem outras campanhas comparáveis suficientes no período." — NUNCA compare a campanha consigo mesma.\n- Quando resultados forem 0 e custo não calculável, informe "Não calculável" e NUNCA R$ 0,00.\n- Seja objetivo e direto (máximo ~900–1200 palavras) mantendo rigor factual e as 10 seções exatas.\n- ${operationalMode === "ACTION_PROPOSAL" ? "Ações mutáveis exigem proposta estruturada com aprovação humana explícita." : "MODO READ_ONLY_ANALYSIS ATIVO: PROIBIDO emitir json:action ou propor alteração automática."}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    if (analysisContext && typeof analysisContext === "object") {
      const cat = String(analysisContext.result_indicator?.category || "UNKNOWN");
      const costLbl = String(analysisContext.result_indicator?.cost_label || "Custo por resultado");
      const forbidden = Array.isArray(analysisContext.result_indicator?.forbidden_labels)
        ? analysisContext.result_indicator.forbidden_labels.join(", ")
        : "";
      const siblingNamesRaw = Array.isArray(analysisContext.isolated_sibling_blocklist?.names)
        ? analysisContext.isolated_sibling_blocklist.names
        : Array.isArray(analysisContext.isolated_sibling_blocklist)
        ? analysisContext.isolated_sibling_blocklist
        : [];
      const siblingList = siblingNamesRaw.join(" | ");
      const rawMetricsSnapshot = analysisContext.raw_metrics || analysisContext.metrics || {};
      const financialSnapshot = analysisContext.financial || {};
      const benchSnapshot = analysisContext.governance_and_benchmarks || {};

      promptWithRAG += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nCONTRATO CANÔNICO DE CONTEXTO ATIVO (VictoriaAnalysisContext ${VICTORIA_CONTRACT_VERSION}):\n- Request ID: ${analysisContext.request_id || "n/a"} | Context Hash: ${analysisContext.analysis_context_hash || "n/a"}\n- Modo Operacional: ${operationalMode}\n- Entidade Analisada: [${analysisContext.entity_level || "campaign"}] ${analysisContext.entity_name || ""} (ID: ${analysisContext.entity_id || ""})\n- Conta: ${analysisContext.ad_account_name || ""} (${analysisContext.ad_account_id || ""})\n- Período: ${ctxDateFrom || startDateStr} a ${ctxDateTo || endDateStr} (${ctxDaysCount} dia(s)) | Last Sync: ${analysisContext.period?.last_sync_at || "n/a"} (${analysisContext.period?.data_freshness || "unknown"})\n- Categoria / Evento Oficial: ${cat} | Indicador Oficial de Custo: **${costLbl}**\n- Financeiro Oficial: ${JSON.stringify(financialSnapshot)}\n- Métricas Oficiais no Contrato: ${JSON.stringify(rawMetricsSnapshot)}\n- Benchmarks Homogêneos: avg=${benchSnapshot.comparable_same_objective_avg ?? "null"}, comparáveis=${benchSnapshot.comparable_peer_count ?? 0}, meta_conta=${benchSnapshot.account_max_cpl_target ?? "null"}\n- Rótulos PROIBIDOS para esta entidade: ${forbidden || "Nenhum"}\n- Nível de Confiança Calibrado: **${String(analysisContext.confidence_level || "baixa").toUpperCase()}** (${analysisContext.confidence_justification || analysisContext.confidence_reason || ""})\n- Campos Ausentes: ${Array.isArray(analysisContext.missing_fields) ? analysisContext.missing_fields.join(", ") : "nenhum"}\n- REGRA DE ISOLAMENTO ABSOLUTO: Analise EXCLUSIVAMENTE a entidade "${analysisContext.entity_name || ""}". É TERMINANTEMENTE PROIBIDO citar estas entidades irmãs da conta: ${siblingList || "outras campanhas"}.\n- CITAÇÃO OBRIGATÓRIA DE FONTES (Seção 10): ${ragCitations.length > 0 ? `Cite explicitamente os ${ragCitations.length} documento(s) RAG recuperado(s) abaixo pelo título e ID.` : "Nenhum documento RAG recuperado; informe honestamente que aplicou o contrato canônico sem documentos extras."}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
    if (knowledgeCtx) {
      promptWithRAG += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nBASE DE CONHECIMENTO CURADA NC PERFORMANCE (APENAS APPROVED — Prioridade: 1º Dados Reais da Conta > 2º Metas da Conta > 3º Documentos RAG abaixo):\n\n${knowledgeCtx}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
    if (retrievedContext && retrievedContext !== knowledgeCtx) {
      promptWithRAG += `\n\nCONTEXTO COMPLEMENTAR:\n${retrievedContext.slice(0, 3500)}`;
    }
    if (webSearchContext) {
      promptWithRAG += webSearchContext;
    }

    // =========================================================================
    // 4. PREPARAÇÃO DO PAYLOAD & PROVEDORES COM FALLBACK AUTOMÁTICO
    // =========================================================================
    const openAiMessages = messages.map((m: any) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      if (m.image || m.metadata?.image) {
        const img = m.image || m.metadata.image;
        return {
          role,
          content: [
            { type: "text", text: m.content || "" },
            { type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } }
          ]
        };
      }
      return { role, content: m.content };
    });

    openAiMessages.unshift({
      role: "system",
      content: promptWithRAG
    });

    const maxTokens = isScopedSingleEntity ? 2400 : 3000;
    const providerTargets: Array<{ name: string; url: string; headers: Record<string, string>; body: any }> = [];

    if (LOVABLE_API_KEY) {
      const finalModel = userModelName.startsWith("google/") ? userModelName : `google/${userModelName}`;
      providerTargets.push({
        name: "lovable_gateway",
        url: "https://ai.gateway.lovable.dev/v1/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: {
          model: finalModel,
          messages: openAiMessages,
          temperature: userTemperature,
          max_tokens: maxTokens,
          stream: !shouldReturnJson,
        },
      });
    }

    if (GEMINI_API_KEY) {
      providerTargets.push({
        name: "gemini_direct",
        url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GEMINI_API_KEY}`,
        },
        body: {
          model: userModelName.replace(/^google\//, ""),
          messages: openAiMessages,
          temperature: userTemperature,
          max_tokens: maxTokens,
          stream: !shouldReturnJson,
        },
      });
    }

    const finalizeTelemetry = async (opts: {
      usedFallback: boolean;
      validationStatus: string;
      providerUsed?: string;
    }) => {
      if (!analysisContext?.request_id) return;
      try {
        await supabase
          .from("victoria_analysis_logs")
          .update({
            latency_ms: Date.now() - requestStartedAt,
            used_fallback: opts.usedFallback,
            validation_status: opts.validationStatus,
            retrieved_doc_ids: ragCitations.map((c) => c.id),
            rag_citations: ragCitations,
            action_mode: operationalMode,
            model_version: opts.providerUsed ? `${userModelName}@${opts.providerUsed}` : String(userModelName),
          })
          .eq("request_id", String(analysisContext.request_id));
      } catch {}
    };

    const buildResponseMetadata = (providerUsed?: string, usedFallback?: boolean) => ({
      request_id: analysisContext?.request_id || null,
      analysis_context_hash: analysisContext?.analysis_context_hash || null,
      ad_account_id: analysisContext?.ad_account_id || selectedAccountId || null,
      entity_level: analysisContext?.entity_level || null,
      entity_id: analysisContext?.entity_id || null,
      date_from: ctxDateFrom || startDateStr,
      date_to: ctxDateTo || endDateStr,
      result_indicator: analysisContext?.result_indicator || null,
      contract_version: VICTORIA_CONTRACT_VERSION,
      prompt_version: VICTORIA_PROMPT_VERSION,
      operational_mode: operationalMode,
      model_version: userModelName,
      provider_used: providerUsed || null,
      temperature: userTemperature,
      rag_citations: ragCitations,
      rag_retrieval_mode: ragRetrievalMode,
      vector_match_count: vectorMatchCount,
      response_origin: usedFallback ? "deterministic_fallback" : "generative",
    });

    let activeStreamRes: Response | null = null;
    let activeProviderName = "";
    let lastProviderError = "";

    for (const target of providerTargets) {
      const connectCtrl = new AbortController();
      const connectTimer = setTimeout(() => connectCtrl.abort("PROVIDER_CONNECT_TIMEOUT"), 14000);
      try {
        const candidateRes = await fetch(target.url, {
          method: "POST",
          headers: target.headers,
          body: JSON.stringify(target.body),
          signal: connectCtrl.signal,
        });
        clearTimeout(connectTimer);
        if (candidateRes.ok) {
          activeStreamRes = candidateRes;
          activeProviderName = target.name;
          break;
        }
        const errBody = await candidateRes.text().catch(() => "");
        lastProviderError = `${target.name}_http_${candidateRes.status}:${errBody.slice(0, 140)}`;
        console.warn("[VICTORIA] Provider failed, trying next if available:", lastProviderError);
      } catch (pErr: any) {
        clearTimeout(connectTimer);
        lastProviderError = `${target.name}_err:${pErr?.message || "abort"}`;
        console.warn("[VICTORIA] Provider fetch error, trying next:", lastProviderError);
      }
    }

    if (activeStreamRes) {
      try {
        if (shouldReturnJson) {
          const jsonPayload = await activeStreamRes.json();
          const rawReply = jsonPayload?.choices?.[0]?.message?.content || "";
          const guarded = enforceServerPostLlmGuardrails(
            rawReply,
            analysisContext,
            ragCitations,
            operationalMode,
            requireFull10Sections
          );
          await finalizeTelemetry({
            usedFallback: guarded.replacedByDeterministic,
            validationStatus: guarded.replacedByDeterministic
              ? `DETERMINISTIC_FALLBACK:${guarded.reasons.join("|")}`
              : "PASSED",
            providerUsed: activeProviderName,
          });
          return new Response(JSON.stringify({
            reply: guarded.text,
            diagnosis: guarded.text,
            content: guarded.text,
            replaced_by_deterministic: guarded.replacedByDeterministic,
            guardrail_reasons: guarded.reasons,
            latency_ms: Date.now() - requestStartedAt,
            ...buildResponseMetadata(activeProviderName, guarded.replacedByDeterministic),
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // MODO SSE REAL STREAMING: entrega victoria_meta + tokens em tempo real e valida no encerramento
        if (activeStreamRes.body) {
          const upstreamBody = activeStreamRes.body;
          const encoderSse = new TextEncoder();

          const sseStream = new ReadableStream({
            async start(controller) {
              const sendSse = (obj: unknown) => {
                controller.enqueue(encoderSse.encode(`data: ${JSON.stringify(obj)}\n\n`));
              };

              sendSse({ victoria_meta: buildResponseMetadata(activeProviderName, false) });

              const reader = upstreamBody.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              let assembled = "";

              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  buffer += decoder.decode(value, { stream: true });
                  const lines = buffer.split("\n");
                  buffer = lines.pop() || "";

                  for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith("data: ") || trimmed === "data: [DONE]") continue;
                    try {
                      const parsed = JSON.parse(trimmed.slice(6));
                      const delta = parsed?.choices?.[0]?.delta?.content;
                      if (typeof delta === "string" && delta.length > 0) {
                        assembled += delta;
                        const safeChunk = delta.replace(/\bComandante\b/gi, "Parceiro");
                        sendSse({ choices: [{ delta: { content: safeChunk } }] });
                      }
                    } catch {}
                  }
                }
              } catch (readErr: any) {
                console.error("[VICTORIA] Erro lendo stream SSE upstream:", readErr?.message);
              }

              const hasEntityScope = Boolean(analysisContext && analysisContext.entity_id);
              if (hasEntityScope) {
                const guarded = enforceServerPostLlmGuardrails(
                  assembled,
                  analysisContext,
                  ragCitations,
                  operationalMode,
                  requireFull10Sections
                );
                const latencyMs = Date.now() - requestStartedAt;
                await finalizeTelemetry({
                  usedFallback: guarded.replacedByDeterministic,
                  validationStatus: guarded.replacedByDeterministic
                    ? `SSE_FALLBACK:${guarded.reasons.join("|")}`
                    : "SSE_PASSED",
                  providerUsed: activeProviderName,
                });
                sendSse({
                  victoria_final: {
                    response_origin: guarded.replacedByDeterministic ? "deterministic_fallback" : "generative",
                    replaced_by_deterministic: guarded.replacedByDeterministic,
                    guardrail_reasons: guarded.reasons,
                    rag_citations: ragCitations,
                    final_text: guarded.text,
                    latency_ms: latencyMs,
                    provider_used: activeProviderName,
                  },
                });
              } else {
                const cleanHubText = sanitizeVictoriaServerOutput(assembled, analysisContext, operationalMode);
                const latencyMs = Date.now() - requestStartedAt;
                await finalizeTelemetry({
                  usedFallback: false,
                  validationStatus: "SSE_GENERAL_PASSED",
                  providerUsed: activeProviderName,
                });
                sendSse({
                  victoria_final: {
                    response_origin: "generative",
                    replaced_by_deterministic: false,
                    guardrail_reasons: [],
                    rag_citations: ragCitations,
                    final_text: cleanHubText,
                    latency_ms: latencyMs,
                    provider_used: activeProviderName,
                  },
                });
              }

              controller.enqueue(encoderSse.encode("data: [DONE]\n\n"));
              controller.close();
            },
          });

          return new Response(sseStream, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive",
            }
          });
        }
      } catch (streamErr: any) {
        lastProviderError = streamErr?.message || "stream_processing_error";
        console.error("[VICTORIA] Falha durante processamento de stream:", lastProviderError);
      }
    }

    // Fallback determinístico completo se nenhum provedor respondeu
    const deterministicFallback = analysisContext && analysisContext.entity_id
      ? generateDeterministic10SectionAnalysis(analysisContext, ragCitations)
      : `### Victoria AI (${VICTORIA_CONTRACT_VERSION})\n\nDesculpe, ${userName}, houve indisponibilidade momentânea do provedor de IA (${lastProviderError || "sem conexão"}). Os dados oficiais continuam ativos — informe qual conta ou campanha deseja auditar.`;

    await finalizeTelemetry({
      usedFallback: true,
      validationStatus: `PROVIDER_UNAVAILABLE:${lastProviderError.slice(0, 80)}`,
    });

    if (shouldReturnJson) {
      return new Response(JSON.stringify({
        reply: deterministicFallback,
        diagnosis: deterministicFallback,
        content: deterministicFallback,
        replaced_by_deterministic: true,
        guardrail_reasons: ["provider_unavailable", lastProviderError].filter(Boolean),
        latency_ms: Date.now() - requestStartedAt,
        ...buildResponseMetadata(activeProviderName || "deterministic", true),
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const encoder = new TextEncoder();
    const metaFallback = `data: ${JSON.stringify({ victoria_meta: buildResponseMetadata(activeProviderName || "deterministic", true) })}\n\n`;
    const sseChunk = `data: ${JSON.stringify({
      choices: [{ delta: { content: deterministicFallback } }]
    })}\n\n`;
    const finalFallback = `data: ${JSON.stringify({
      victoria_final: {
        response_origin: "deterministic_fallback",
        replaced_by_deterministic: true,
        guardrail_reasons: ["provider_unavailable", lastProviderError].filter(Boolean),
        rag_citations: ragCitations,
        final_text: deterministicFallback,
        latency_ms: Date.now() - requestStartedAt,
      }
    })}\n\n`;

    return new Response(encoder.encode(`${metaFallback}${sseChunk}${finalFallback}data: [DONE]\n\n`), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      }
    });

  } catch (e: any) {
    console.error("[VICTORIA] Erro fatal:", e.message);
    const encoder = new TextEncoder();
    const sseError = `data: ${JSON.stringify({
      choices: [{ delta: { content: `Erro interno no servidor: ${e.message}` } }]
    })}\n\ndata: [DONE]\n\n`;

    return new Response(encoder.encode(sseError), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  }
});
