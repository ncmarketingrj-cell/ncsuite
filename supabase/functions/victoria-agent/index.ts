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
          content: `BENCHMARKS CPL (CUSTO POR LEAD) MERCADO AUTOMOTIVO RJ:\n\nVEÍCULOS NOVOS:\n- Excelente: < R$ 15,00\n- Saudável: R$ 15-35,00\n- Atenção: R$ 35-55,00\n- Crítico (pausar e revisar): > R$ 55,00\n\nSEMINOVOS POPULARES (HB20, Ônix, Gol até 5 anos):\n- Excelente: < R$ 18,00\n- Saudável: R$ 18-40,00\n- Atenção: R$ 40-65,00\n- Crítico: > R$ 65,00\n\nSEMINOVOS PREMIUM (BMW, Mercedes, Audi):\n- Excelente: < R$ 35,00\n- Saudável: R$ 35-80,00\n- Atenção: R$ 80-130,00\n- Crítico: > R$ 130,00\n\nCTR (TAXA DE CLIQUE):\n- Ideal: > 1.20%\n- Aceitável: 0.80%-1.20%\n- Crítico: < 0.80% → trocar criativos por fotos reais do pátio imediatamente\nAção imediata CTR baixo: Substituir fotos de catálogo por fotos reais tiradas com celular no pátio, luz natural. Fotos reais convertem 40-60% melhor no segmento automotivo.\n\nFREQUÊNCIA DE EXIBIÇÃO:\n- Ideal: 1.5-2.5 por pessoa\n- Alerta: > 3.0 (criativo saturando o público, renovar)\n- Crítico: > 4.0 → pausar conjunto e reformular segmentação`
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
          content: `PANORAMA SEMINOVOS RJ 2025-2026:\n- RJ é o 2º maior mercado de seminovos do Brasil\n- Demanda concentrada: Zona Sul, Barra, Niterói, Nova Iguaçu, Duque de Caxias\n- Ticket médio: R$ 45.000-85.000 (popular) | R$ 120.000-280.000 (premium)\n\nMODELOS MAIS BUSCADOS NO RJ:\n1. Toyota Corolla (XEi, Altis)\n2. Jeep Renegade / Compass\n3. Honda HRV / Civic\n4. Volkswagen T-Cross / Virtus\n5. Hyundai Creta / ix35\n6. Ford Bronco Sport / Territory\n7. Chevrolet Tracker / Onix Plus\n8. BMW Série 3 (premium)\n\nDIFERENCIAIS COMPETITIVOS NOS ANÚNCIOS:\n1. Histórico completo (FIPE, revisões em dia)\n2. Laudo cautelar incluso\n3. Garantia estendida\n4. Financiamento aprovado em 24h\n5. Aceita troca\n6. IPVA e seguro inclusos\n\nGATILHOS DE COMPRA MAIS EFICAZES RJ:\n- "Parcela que cabe no seu bolso"\n- "Sem saída"\n- "Financiamento sem consulta SPC/Serasa"\n- "Entrega em domicílio"\n- "Documentação 100% inclusa"`
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
          content: `SLA PADRÃO NC PERFORMANCE:\n- WhatsApp: Resposta em até 5 MINUTOS (meta: 2 min)\n- Formulário de site: Ligação em até 15 MINUTOS\n- Lead Ads Meta: Resposta em até 10 MINUTOS\n- E-mail: Resposta em até 2 HORAS\n\nIMPACTO DA DEMORA NA CONVERSÃO:\n- 0-5 min: Taxa 80%+\n- 5-30 min: Taxa 60%\n- 30-60 min: Taxa 40%\n- 1-24h: Taxa 20%\n- Após 24h: < 5%\n\nSCRIPT PRIMEIRO CONTATO WHATSAPP:\n"Oi [Nome]! Aqui é [Consultor] da [Concessionária]. Vi que você demonstrou interesse no [Modelo]. Tenho condições especiais que vão te interessar! Qual o melhor horário para eu te passar os detalhes? 😊"\n\nQUALIFICADORES (perguntar nos primeiros 2 min):\n1. "Você está buscando novo ou seminovo?"\n2. "Tem veículo para dar de entrada/troca?"\n3. "Pensou em financiar ou pagar à vista?"\n4. "Para quando você precisaria do carro?"\n\nSEQUÊNCIA FOLLOW-UP (leads que não responderam):\n- Dia 1: Mensagem inicial\n- Dia 2: Foto específica do carro + link\n- Dia 4: "Oferta especial disponível até [data]"\n- Dia 7: "Última oportunidade, carro pode ser vendido"\n- Dia 14: "Temos novos modelos, posso te mandar?"`
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
            const embedRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  model: "models/text-embedding-004",
                  content: { parts: [{ text: `${doc.title}\n\n${doc.content}` }] }
                })
              }
            );
            if (!embedRes.ok) { errors.push(doc.title); return; }
            const embedData = await embedRes.json();
            const embedding = embedData.embedding?.values;
            if (!embedding) { errors.push(doc.title); return; }

            const { error } = await supabase.from("victoria_knowledge").insert({
              user_id: user.id,
              category: doc.category,
              title: doc.title,
              content: doc.content,
              embedding
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
      supabase.from("social_pages").select("page_name, facebook_followers, instagram_followers").eq("user_id", user.id).limit(10),
      supabase.from("social_posts").select("content, platform, status, scheduled_at, likes_count, comments_count, reach_count").eq("user_id", user.id).order("scheduled_at", { ascending: false }).limit(8),
      supabase.from("clients").select("name").eq("user_id", user.id).order("name").limit(20),
      supabase.from("funnels").select("name, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10)
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
    // ─── Injetar documentos de conhecimento no prompt (sem depender de embedding) ─
    let knowledgeCtx = "";
    try {
      const { data: allKnowledge, error: kErr } = await supabase
        .from("victoria_knowledge")
        .select("category, title, content")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!kErr && allKnowledge && allKnowledge.length > 0) {
        knowledgeCtx = allKnowledge
          .map((k: any) => `[${String(k.category || "").toUpperCase()}] ${String(k.title || "")}:\n${String(k.content || "").slice(0, 600)}`)
          .join("\n\n---\n\n");
      }
    } catch (_kErr) {
      console.warn("[VICTORIA] Falha ao carregar base de conhecimento:", _kErr);
    }

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

    // =========================================================================
    // 3b. WEB SEARCH — Gemini Google Grounding quando usuário pede pesquisa
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

    let promptWithRAG = systemPrompt;
    if (knowledgeCtx) {
      promptWithRAG += `\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\nBASE DE CONHECIMENTO NC PERFORMANCE (Utilize como verdade absoluta para todas as respostas):\n\n${knowledgeCtx}\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
    }
    if (retrievedContext && retrievedContext !== knowledgeCtx) {
      promptWithRAG += `\n\nCONHECIMENTO ESPECÍFICO RECUPERADO POR SIMILARIDADE:\n${retrievedContext}`;
    }
    if (webSearchContext) {
      promptWithRAG += webSearchContext;
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
          console.error("[VICTORIA] Erro na stream do provedor:", streamRes.status, errText);
          // Retorna o erro real no SSE para diagnóstico
          const encoder2 = new TextEncoder();
          const debugMsg = `[ERRO ${streamRes.status}] ${errText.slice(0, 300)}`;
          const debugSse = `data: ${JSON.stringify({ choices: [{ delta: { content: debugMsg } }] })}\n\ndata: [DONE]\n\n`;
          return new Response(encoder2.encode(debugSse), {
            headers: { ...corsHeaders, "Content-Type": "text/event-stream" }
          });
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
