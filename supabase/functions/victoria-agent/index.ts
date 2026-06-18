import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { action = "chat", messages, selectedAccountId, title, content, category, query, externalContext } = body;
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // =========================================================================
    // AÇÃO: add_knowledge (Geração de embeddings e inserção na base)
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

      // 1. Obter o embedding do texto de conteúdo usando o Gemini text-embedding-004
      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/text-embedding-004",
            content: {
              parts: [{ text: `${title}\n\n${content}` }]
            }
          })
        }
      );

      if (!embedRes.ok) {
        const errText = await embedRes.text();
        throw new Error(`Erro ao gerar embedding: ${errText}`);
      }

      const embedData = await embedRes.json();
      const embedding = embedData.embedding?.values;
      if (!embedding) {
        throw new Error("Resposta de embedding vazia do Gemini");
      }

      // 2. Salvar na tabela victoria_knowledge
      const { data, error: insertErr } = await supabase
        .from("victoria_knowledge")
        .insert({
          user_id: user.id,
          category,
          title,
          content,
          embedding
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
    // AÇÃO: search_knowledge (busca vetorial exposta ao hook — C4)
    // =========================================================================
    if (action === "search_knowledge") {
      if (!query || !GEMINI_API_KEY) {
        return new Response(JSON.stringify({ snippets: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const embedRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text: query }] }
          })
        }
      );

      if (embedRes.ok) {
        const embedData = await embedRes.json();
        const embedding = embedData.embedding?.values;
        if (embedding) {
          const { data: matchData } = await supabase.rpc("match_victoria_knowledge", {
            query_embedding: embedding,
            match_threshold: 0.65,
            match_count: 5,
            p_user_id: user.id
          });

          const snippets = (matchData || []).map((k: any) => ({
            id: k.id,
            title: k.title,
            category: k.category,
            content: (k.content || "").slice(0, 600)
          }));

          return new Response(JSON.stringify({ snippets }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      return new Response(JSON.stringify({ snippets: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AÇÃO: chat (Modo Chat principal com RAG e Streaming SSE)
    // =========================================================================

    // 1. Fetch ad accounts for the current logged-in user to ensure isolation
    const { data: userAccounts, error: accountsErr } = await supabase
      .from("ad_accounts")
      .select("id")
      .eq("user_id", user.id);

    if (accountsErr) {
      console.error("Error fetching ad accounts:", accountsErr);
    }

    const adAccountIds = (userAccounts || []).map((acc: any) => acc.id);

    let dbMetrics: any[] = [];
    if (adAccountIds.length > 0) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDateStr = thirtyDaysAgo.toISOString().split("T")[0];

      let query = supabase
        .from("metrics")
        .select(`
          cost, conversions, clicks, impressions, reach, date, client_id,
          campaigns!inner(id, name, status, budget, platform, ad_account_id)
        `)
        .in("campaigns.ad_account_id", adAccountIds)
        .gte("date", startDateStr);

      if (selectedAccountId) {
        query = query.eq("campaigns.ad_account_id", selectedAccountId);
      }

      const { data, error: queryError } = await query;
      if (queryError) {
        console.error("Error querying metrics:", queryError);
      } else {
        dbMetrics = data || [];
      }
    }

    // 2. Process metrics
    const campaignMap = new Map<string, {
      name: string;
      status: string;
      budget: number;
      platform: string;
      cost: number;
      conversions: number;
      clicks: number;
      impressions: number;
      reach: number;
    }>();

    (dbMetrics || []).forEach((m: any) => {
      const camp = m.campaigns;
      if (!camp) return;

      const campId = camp.id;
      const existing = campaignMap.get(campId) || {
        name: camp.name,
        status: camp.status?.toUpperCase() || "PAUSED",
        budget: Number(camp.budget || 0),
        platform: camp.platform || "Meta Ads",
        cost: 0,
        conversions: 0,
        clicks: 0,
        impressions: 0,
        reach: 0
      };

      existing.cost += Number(m.cost || 0);
      existing.conversions += Number(m.conversions || 0);
      existing.clicks += Number(m.clicks || 0);
      existing.impressions += Number(m.impressions || 0);
      existing.reach += Number(m.reach || 0);

      campaignMap.set(campId, existing);
    });

    const campaigns = Array.from(campaignMap.entries()).map(([id, c]) => {
      const cpl = c.conversions > 0 ? c.cost / c.conversions : 0;
      const ctr = c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0;
      return {
        id,
        name: c.name,
        status: c.status,
        budget: c.budget,
        platform: c.platform,
        totals: {
          cost: c.cost,
          conversions: c.conversions,
          clicks: c.clicks,
          impressions: c.impressions,
          reach: c.reach,
          cpl,
          ctr
        }
      };
    });

    const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);
    const totalConversions = campaigns.reduce((s, c) => s + c.totals.conversions, 0);
    const activeCount = campaigns.filter(c => c.status === "ACTIVE").length;
    const globalCpl = totalConversions > 0 ? totalInvest / totalConversions : 0;

    const contextData = campaigns.length > 0
      ? campaigns.map(c => 
          `- ID: ${c.id} | ${c.name} | ${c.status} | Orç/dia: R$${c.budget.toFixed(2)} | Gasto: R$${c.totals.cost.toFixed(2)} | Leads: ${c.totals.conversions} | CPL: R$${c.totals.cpl.toFixed(2)} | CTR: ${c.totals.ctr.toFixed(2)}%`
        ).join("\n")
      : "Nenhuma campanha ativa ou com investimento encontrada nos últimos 30 dias.";

    // ─── C8: Dados Expandidos — Social, Clientes, Funis ─────────────────────
    const [socialPagesRes, socialPostsRes, clientsRes, funnelsRes] = await Promise.all([
      supabase.from("social_pages").select("page_name, facebook_followers, instagram_followers").limit(10),
      supabase.from("social_posts").select("content, platform, status, scheduled_at, likes_count, comments_count, reach_count").order("scheduled_at", { ascending: false }).limit(8),
      supabase.from("clients").select("name, status").order("name").limit(20),
      supabase.from("funnels").select("name, created_at").order("created_at", { ascending: false }).limit(10)
    ]);

    const socialPages    = socialPagesRes.data   || [];
    const socialPosts    = socialPostsRes.data   || [];
    const clientsList    = clientsRes.data       || [];
    const funnelsList    = funnelsRes.data       || [];

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
      ? clientsList.map((c: any) => `- ${c.name} (${c.status || "ativo"})`).join("\n")
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
      const dateStr = m.date;
      const campName = m.campaigns?.name || "Sem Nome";
      const platform = m.campaigns?.platform || "Meta Ads";
      const cost = Number(m.cost || 0);
      const conversions = Number(m.conversions || 0);
      const clicks = Number(m.clicks || 0);
      const impressions = Number(m.impressions || 0);
      return `${dateStr} | ${platform} | ${campName} | Gasto: R$ ${cost.toFixed(2)} | Leads: ${conversions} | Cliques: ${clicks} | Impressões: ${impressions}`;
    });
    const dailySeriesText = dailyRows.length > 0 
      ? dailyRows.join("\n") 
      : "Nenhum dado diário registrado nos últimos 30 dias.";

    const systemPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago da NC Performance. Você é humana, fala de forma natural, direta e com extrema autoridade sobre marketing digital e tráfego pago para o nicho AUTOMOTIVO (concessionárias e lojas de veículos). Você NUNCA se comporta como um robô, assistente virtual neutro ou modelo de linguagem. 

PERSONALIDADE E ATITUDE:
- Você é apaixonada por gerar resultados rápidos, diminuir CPL (Custo por Lead) e escalar vendas de carros.
- Use termos reais do dia a dia de agências de tráfego: CPL, CTR, criativos que convertem, público lookalike, público aberto (broad), pixel aquecido, remarketing, leads frios vs leads quentes, tempo de resposta do comercial (lead time), pátio de seminovos.
- NUNCA dê respostas evasivas ou desculpas de IA. Se o usuário te der bom dia ou perguntar do seu fim de semana, aja como uma pessoa da equipe NC Agência: "Fala Comandante! Meu fim de semana foi focado em monitorar a NC Database e garantir que os leads continuem caindo quente. Vamos ao jogo!".

DIRETRIZES TÉCNICAS E ESTRATÉGICAS DE MARKETING AUTOMOTIVO:
1. **Analise os Períodos com Precisão:**
   - Se o usuário perguntar "Como foi o fim de semana?", utilize o "Último Fim de Semana" (${lastSat} e ${lastSun}) listado nas datas de referência. Localize as linhas dessas datas na TABELA DE MÉTRICAS DIÁRIAS, faça a soma mental dos investimentos e leads gerados naquele período e responda com os valores exatos! O mesmo vale para "ontem", "hoje" ou períodos de dias específicos.
2. **CPL (Custo por Lead) Saudável:**
   - Excelente: Abaixo de R$ 15,00.
   - Saudável: Entre R$ 15,00 e R$ 35,00.
   - Alerta / Ruim: Acima de R$ 45,00 (indique pausar, trocar criativos ou redefinir a oferta).
3. **CTR (Taxa de Cliques) Saudável:**
   - Ideal: Acima de 1.20% (sinaliza que o criativo/carro é atraente).
   - Crítico: Abaixo de 0.80% (sugira imediatamente trocar as fotos por fotos REAIS tiradas com celular no pátio da loja). Fotos de catálogo do fabricante não convertem bem.
4. **Estratégias Reais para Recomendar:**
   - **Leads no WhatsApp:** Resposta em menos de 5 minutos do comercial.
   - **Formulários nativos (Lead Ads):** Perguntas de filtro (ex: "Qual a entrada?", "Tem carro na troca?").
   - **Campanhas de Seminovos vs Novos:** Carrosséis com fotos reais de múltiplos veículos vs taxa zero e parcelamento facilitado.

GROUNDING DE TEMPO E DATAS:
${timeMetadata}

DADOS ATUAIS CONSOLIDADOS (ÚLTIMOS 30 DIAS):
- Investimento Total: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
- Leads Gerados: ${totalConversions}
- CPL Médio Geral: R$ ${globalCpl.toFixed(2)}
- Campanhas Ativas: ${activeCount}

CAMPANHAS DETALHADAS (MÉTRICA GERAL DE 30 DIAS):
${contextData}

TABELA DE MÉTRICAS DIÁRIAS DETALHADAS (Use essa tabela para responder com dados exatos de dias específicos como ontem, sábado, domingo, etc.):
Data | Plataforma | Campanha | Investimento | Leads | Cliques | Impressões
${dailySeriesText}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ROTEAMENTO MULTIAGENTE — SUB-AGENTE ATIVO:
→ ${subAgentLabel[intent]}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DADOS SOCIAIS (Meta / Instagram / Facebook):
PÁGINAS CONECTADAS:
${socialCtx}

POSTS RECENTES (últimos 8):
${postsCtx}

PORTFOLIO DE CLIENTES ATIVOS:
${clientsCtx}

FUNIS CADASTRADOS NO SISTEMA:
${funnelsCtx}

REGRAS DE RESPOSTA:
1. Sempre responda em Português Brasileiro usando formatação markdown limpa.
2. Responda diretamente e aja como uma estrategista sênior dedicada. Nunca fale como uma IA.
3. Se o usuário perguntar sobre o fim de semana, ontem, ou datas específicas, calcule e retorne os dados exatos somados da tabela diária e faça uma análise estratégica focada no mercado automotivo.
4. **AVALIAÇÃO VISUAL DE IMAGENS (MULTIMODALIDADE):**
   - Se o usuário anexar uma imagem à mensagem, comente sobre fotos reais vs catálogo, legibilidade de textos no mobile, oferta e chamadas para ação. Seja construtiva.
5. **RECOMENDAÇÃO DE AÇÃO EM 1-CLIQUE (ACTION ENGINE):**
   - Se recomendar ação prática de otimização, inclua no final o bloco JSON especial:
   \`\`\`json:action
   {
     "type": "update_budget",
     "campaignId": "ID_DA_CAMPANHA",
     "campaignName": "NOME_DA_CAMPANHA",
     "value": 150.00
   }
   \`\`\`
   Ou:
   \`\`\`json:action
   {
     "type": "pause_campaign",
     "campaignId": "ID_DA_CAMPANHA",
     "campaignName": "NOME_DA_CAMPANHA"
   }
   \`\`\`
   Use apenas uma dessas se e somente se recomendar a ação.`;

    // =========================================================================
    // 3. EXECUÇÃO RAG (RETRIEVAL-AUGMENTED GENERATION)
    // =========================================================================
    let retrievedContext = externalContext || "";
    if (!retrievedContext && GEMINI_API_KEY && messages && messages.length > 0) {
      const lastUserMessage = messages[messages.length - 1].content;
      if (lastUserMessage && lastUserMessage.trim() !== "") {
        try {
          // Obter o embedding da última pergunta do usuário
          const embedRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: "models/text-embedding-004",
                content: {
                  parts: [{ text: lastUserMessage }]
                }
              })
            }
          );

          if (embedRes.ok) {
            const embedData = await embedRes.json();
            const embedding = embedData.embedding?.values;
            if (embedding) {
              // Buscar conhecimentos similares usando a RPC do Supabase
              const { data: matchData, error: matchErr } = await supabase.rpc(
                "match_victoria_knowledge",
                {
                  query_embedding: embedding,
                  match_threshold: 0.70,
                  match_count: 5,
                  p_user_id: user.id
                }
              );

              if (matchErr) {
                console.error("Erro na busca de similaridade RAG:", matchErr);
              } else if (matchData && matchData.length > 0) {
                retrievedContext = matchData
                  .map((k: any) => `[CONHECIMENTO EXTRAÍDO - Categoria: ${k.category}] ${k.title}: ${k.content}`)
                  .join("\n\n");
                console.log(`[VICTORIA] RAG Ativado: ${matchData.length} blocos de conhecimento recuperados.`);
              }
            }
          }
        } catch (ragErr) {
          console.error("Falha ao computar RAG para a pergunta:", ragErr);
        }
      }
    }

    let promptWithRAG = systemPrompt;
    if (retrievedContext) {
      promptWithRAG += `\n\nCONHECIMENTO ADICIONAL DO PROPRIETÁRIO / REGRAS DE NEGÓCIO (Utilize estes dados como verdade absoluta para responder à pergunta atual): \n${retrievedContext}`;
    }

    // =========================================================================
    // 4. PREPARAÇÃO DO PAYLOAD NO PADRÃO OPENAI COMPATÍVEL
    // =========================================================================
    const openAiMessages = messages.map((m: any) => {
      const role = m.role === "assistant" ? "assistant" : "user";
      
      // Se tiver imagem na mensagem
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

    // Injeta a instrução do sistema
    openAiMessages.unshift({
      role: "system",
      content: promptWithRAG
    });

    let fetchUrl = "";
    let fetchHeaders: Record<string, string> = { "Content-Type": "application/json" };
    let fetchBody: any = {};

    if (LOVABLE_API_KEY) {
      fetchUrl = "https://ai.gateway.lovable.dev/v1/chat/completions";
      fetchHeaders["Authorization"] = `Bearer ${LOVABLE_API_KEY}`;
      fetchBody = {
        model: "google/gemini-2.5-flash",
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true
      };
    } else if (GEMINI_API_KEY) {
      fetchUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions?key=${GEMINI_API_KEY}`;
      fetchBody = {
        model: "gemini-2.5-flash",
        messages: openAiMessages,
        temperature: 0.7,
        max_tokens: 2048,
        stream: true
      };
    }

    if (fetchUrl) {
      try {
        const streamRes = await fetch(fetchUrl, {
          method: "POST",
          headers: fetchHeaders,
          body: JSON.stringify(fetchBody)
        });

        if (streamRes.ok) {
          // Repassa a stream de eventos SSE diretamente!
          return new Response(streamRes.body, {
            headers: {
              ...corsHeaders,
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive"
            }
          });
        } else {
          const errText = await streamRes.text();
          console.error("[VICTORIA] Erro na stream do provedor:", errText);
        }
      } catch (streamErr: any) {
        console.error("[VICTORIA] Falha ao iniciar stream:", streamErr.message);
      }
    }

    // Fallback SSE se nenhuma das streams funcionar
    const fallbackText = `### 🤖 Victoria AI — Modo Analítico Local\n\nDesculpe comandante, tive um problema de comunicação com o servidor de IA. Mas os dados do banco de dados continuam ativos. O que deseja auditar especificamente?`;
    const encoder = new TextEncoder();
    const sseChunk = `data: ${JSON.stringify({
      choices: [{ delta: { content: fallbackText } }]
    })}\n\ndata: [DONE]\n\n`;

    return new Response(encoder.encode(sseChunk), {
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
