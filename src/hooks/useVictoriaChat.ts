import { useState, useEffect } from "react";
import { supabase, EXTERNAL_SUPABASE_URL as VITE_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY as ANON_KEY } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { extractPrintFn } from "@/lib/ocr.functions";
import {
  fetchMarketIntelFn,
  FALLBACK_ARTICLES,
  parseRssXmlToArticles,
  parseSafeIsoDate,
} from "@/lib/market.functions";
import {
  buildRadarFeeds,
  MARKET_PORTALS,
  type RadarTimeFilter,
  type RadarRegionFilter,
} from "@/lib/marketPortals";
import { META_ADS_MASTER_KNOWLEDGE_DOCS } from "@/lib/metaAlgorithmEngine";
import {
  isReadOnlyAnalysisRequest,
  stripJsonActionBlocks,
  buildActionProposal,
  validateActionExecution,
  sanitizeRssText,
  isHomepageOnlyUrl,
  type GovernedActionProposal,
  type ProposalStatus,
} from "@/lib/victoriaGovernance";
import {
  sanitizeVictoriaOutputText,
  VICTORIA_ANALYTICAL_TEMPERATURE,
  VICTORIA_CONTRACT_VERSION,
  VICTORIA_PROMPT_VERSION,
  isLegacyVictoriaVersion,
} from "@/lib/victoriaContract";


export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
  contractVersion?: string | null;
  promptVersion?: string | null;
  legacyStatus?: string | null;
  isLegacy?: boolean;
  metadata?: {
    image?: { base64: string; mimeType: string };
    readOnly?: boolean;
    action?: Partial<GovernedActionProposal> & {
      type: string;
      campaignId?: string;
      campaignName?: string;
      value?: number;
      reportId?: string;
      title?: string;
      description?: string;
      risk?: 'low' | 'medium' | 'high';
      params?: Record<string, any>;
    };
    actionStatus?: ProposalStatus;
  };
};

export type Conversation = {
  id: string;
  title: string;
  pinned: boolean;
  created_at: Date;
};

export type KnowledgeItem = {
  id: string;
  category: 'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom';
  title: string;
  content: string;
  created_at: Date;
};

export interface MarketArticle {
  id: string;
  title: string;
  source: string;
  link: string;
  pubDate: string;
  snippet: string;
  category: string;
}

export interface RegionalBenchmark {
  region: string;
  targetCpl: number;
  platform: string;
  notes: string;
}

export function useVictoriaChat(
  selectedAccountId: string,
  setSelectedAccountId: (id: string) => void,
  userName?: string
) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Estados do RAG / Base de Conhecimento
  const [knowledgeList, setKnowledgeList] = useState<KnowledgeItem[]>([]);
  const [loadingKnowledge, setLoadingKnowledge] = useState(false);
  const [ragSnippets, setRagSnippets] = useState<{ id: string; title: string; category: string; content: string }[]>([]);

  // ═══════════════════════════════════════════════════════════════════════
  // Benchmark Regional de CPL (Padrão: Rio de Janeiro R$ 5,00)
  // ═══════════════════════════════════════════════════════════════════════
  const [regionalBenchmark, setRegionalBenchmarkState] = useState<RegionalBenchmark>(() => {
    try {
      const saved = localStorage.getItem("nc_regional_benchmark");
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      region: "Rio de Janeiro (RJ)",
      targetCpl: 5.0,
      platform: "Meta WhatsApp",
      notes: "Média de mercado para mensagens iniciadas em veículos e seminovos no RJ é R$ 5,00."
    };
  });

  const updateRegionalBenchmark = (newBench: RegionalBenchmark) => {
    setRegionalBenchmarkState(newBench);
    localStorage.setItem("nc_regional_benchmark", JSON.stringify(newBench));
    toast.success(`Meta de CPL atualizada: ${newBench.region} (R$ ${newBench.targetCpl.toFixed(2)})`);
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Pesquisa de Mercado em Tempo Real & Aprendizado Autônomo (Custo R$ 0,00)
  // Acumulativo até 100 artigos com persistência em localStorage
  // ═══════════════════════════════════════════════════════════════════════
  const [marketArticles, setMarketArticles] = useState<MarketArticle[]>(() => {
    try {
      const stored = localStorage.getItem("nc_market_radar_articles_v2");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("Erro ao carregar radar de mercado do storage:", e);
    }
    return FALLBACK_ARTICLES;
  });
  const [isScanningMarket, setIsScanningMarket] = useState(false);
  const [isLearningMarket, setIsLearningMarket] = useState(false);
  const [lastMarketScan, setLastMarketScan] = useState<Date | null>(() => {
    const s = localStorage.getItem("nc_last_market_scan");
    return s ? new Date(s) : null;
  });

  // Filtros do Radar de Notícias (Período, Região/Estado e Checklist dos 30 Portais)
  const [radarTimeFilter, setRadarTimeFilterState] = useState<RadarTimeFilter>(() => {
    const saved = localStorage.getItem("nc_radar_time_filter");
    return saved === "1d" || saved === "7d" || saved === "30d" ? saved : "7d";
  });
  const setRadarTimeFilter = (tf: RadarTimeFilter) => {
    setRadarTimeFilterState(tf);
    localStorage.setItem("nc_radar_time_filter", tf);
  };

  const [radarRegionFilter, setRadarRegionFilterState] = useState<RadarRegionFilter>(() => {
    const saved = localStorage.getItem("nc_radar_region_filter");
    if (saved === "BR" || saved === "RJ" || saved === "SP" || saved === "MG" || saved === "SUL" || saved === "NE") {
      return saved;
    }
    return "BR";
  });
  const setRadarRegionFilter = (rf: RadarRegionFilter) => {
    setRadarRegionFilterState(rf);
    localStorage.setItem("nc_radar_region_filter", rf);
  };

  const [selectedPortalIds, setSelectedPortalIdsState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("nc_radar_selected_portals");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return MARKET_PORTALS.map((p) => p.id);
  });
  const setSelectedPortalIds = (ids: string[] | ((prev: string[]) => string[])) => {
    setSelectedPortalIdsState((prev) => {
      const next = typeof ids === "function" ? ids(prev) : ids;
      try {
        localStorage.setItem("nc_radar_selected_portals", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Carregar conversas do usuário
  const fetchConversations = async () => {
    setLoadingConversations(true);
    try {
      const { data, error } = await supabase
        .from("victoria_conversations" as any)
        .select("*")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });

      if (error) throw error;
      setConversations(
        (data || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          pinned: c.pinned,
          created_at: new Date(c.created_at),
        }))
      );
    } catch (err) {
      console.error("Erro ao carregar conversas:", err);
    } finally {
      setLoadingConversations(false);
    }
  };

  // Carregar base de conhecimento (e auto-treinar o Parecer Técnico Meta Ads 2026 se ainda não constar no banco)
  const fetchKnowledge = async () => {
    setLoadingKnowledge(true);
    try {
      const { data, error } = await supabase
        .from("victoria_knowledge" as any)
        .select("id, category, title, content, created_at, approval_status, evidence_level")
        .neq("approval_status", "REJECTED")
        .order("created_at", { ascending: false });

      if (error) throw error;
      const dbItems: KnowledgeItem[] = (data || []).map((k: any) => ({
        id: k.id,
        category: k.category,
        title: k.title,
        content: k.content,
        created_at: new Date(k.created_at)
      }));

      // Garantir que os 4 documentos do Parecer Técnico e Estrutural do Meta Ads estejam na base da Victoria AI
      const existingTitles = new Set(dbItems.map(item => item.title.trim().toLowerCase()));
      const missingMasterDocs = META_ADS_MASTER_KNOWLEDGE_DOCS.filter(
        doc => !existingTitles.has(doc.title.trim().toLowerCase())
      );

      if (missingMasterDocs.length > 0 && dbItems.length + missingMasterDocs.length <= 50) {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (user?.id) {
            for (const doc of missingMasterDocs) {
              const { data: inserted } = await (supabase
                .from("victoria_knowledge" as any)
                .insert({
                  user_id: user.id,
                  category: doc.category,
                  title: doc.title,
                  content: doc.content,
                })
                .select("id, category, title, content, created_at")
                .maybeSingle() as any);

              if (inserted?.id) {
                dbItems.unshift({
                  id: inserted.id,
                  category: inserted.category,
                  title: inserted.title,
                  content: inserted.content,
                  created_at: new Date(inserted.created_at),
                });
              } else {
                dbItems.unshift({
                  id: doc.id,
                  category: doc.category,
                  title: doc.title,
                  content: doc.content,
                  created_at: new Date(),
                });
              }
            }
          } else {
            for (const doc of missingMasterDocs) {
              dbItems.unshift({
                id: doc.id,
                category: doc.category,
                title: doc.title,
                content: doc.content,
                created_at: new Date(),
              });
            }
          }
        } catch {
          for (const doc of missingMasterDocs) {
            dbItems.unshift({
              id: doc.id,
              category: doc.category,
              title: doc.title,
              content: doc.content,
              created_at: new Date(),
            });
          }
        }
      }

      setKnowledgeList(dbItems);
    } catch (err: any) {
      console.error("Erro ao carregar base de conhecimento:", err);
      // Fallback local imediato com os documentos mestres do Meta Ads
      setKnowledgeList(
        META_ADS_MASTER_KNOWLEDGE_DOCS.map(doc => ({
          id: doc.id,
          category: doc.category,
          title: doc.title,
          content: doc.content,
          created_at: new Date(),
        }))
      );
    } finally {
      setLoadingKnowledge(false);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchKnowledge();
  }, []);

  // Carregar mensagens quando a conversa ativa muda
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      setLoadingMessages(true);
      try {
        const { data, error } = await supabase
          .from("victoria_messages" as any)
          .select("*")
          .eq("conversation_id", activeConversationId)
          .order("created_at", { ascending: true });

        if (error) throw error;
        setMessages(
          (data || []).map((m: any) => {
            const legacy =
              m.legacy_status === "diagnóstico legado" ||
              isLegacyVictoriaVersion(m.contract_version);
            return {
              id: m.id,
              role: m.role,
              content: m.content,
              created_at: new Date(m.created_at),
              contractVersion: m.contract_version ?? null,
              promptVersion: m.prompt_version ?? null,
              legacyStatus: m.legacy_status ?? (legacy ? "diagnóstico legado" : null),
              isLegacy: legacy,
              metadata: m.metadata || {},
            };
          })
        );
      } catch (err) {
        console.error("Erro ao carregar mensagens:", err);
        toast.error("Não foi possível carregar as mensagens.");
      } finally {
        setLoadingMessages(false);
      }
    };

    const fetchMessagesPromise = fetchMessages();
  }, [activeConversationId]);

  // Criar nova conversa
  const createConversation = async (title = "Nova Conversa") => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error } = await (supabase
        .from("victoria_conversations" as any)
        .insert({
          user_id: user.id,
          title,
          contract_version: VICTORIA_CONTRACT_VERSION,
          legacy_status: null,
        })
        .select()
        .single() as any);

      if (error) throw error;
      
      const newConv: Conversation = {
        id: data.id,
        title: data.title,
        pinned: data.pinned,
        created_at: new Date(data.created_at),
      };

      setConversations(prev => [newConv, ...prev]);
      setActiveConversationId(data.id);
      return data.id;
    } catch (err: any) {
      toast.error("Erro ao criar conversa: " + err.message);
      return null;
    }
  };

  // Excluir conversa
  const deleteConversation = async (id: string) => {
    try {
      const { error } = await supabase
        .from("victoria_conversations" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversationId === id) {
        setActiveConversationId(null);
      }
      toast.success("Conversa excluída.");
    } catch (err: any) {
      toast.error("Erro ao excluir conversa: " + err.message);
    }
  };

  // Renomear conversa
  const renameConversation = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;
    try {
      const { error } = await supabase
        .from("victoria_conversations" as any)
        .update({ title: newTitle, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      setConversations(prev =>
        prev.map(c => (c.id === id ? { ...c, title: newTitle } : c))
      );
    } catch (err: any) {
      toast.error("Erro ao renomear conversa: " + err.message);
    }
  };

  // Alternar fixação
  const togglePinConversation = async (id: string, currentPinned: boolean) => {
    try {
      const { error } = await supabase
        .from("victoria_conversations" as any)
        .update({ pinned: !currentPinned })
        .eq("id", id);

      if (error) throw error;
      setConversations(prev => {
        const updated = prev.map(c => (c.id === id ? { ...c, pinned: !currentPinned } : c));
        return [...updated].sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.created_at.getTime() - a.created_at.getTime();
        });
      });
      toast.success(!currentPinned ? "Conversa fixada topo." : "Conversa desafixada.");
    } catch (err: any) {
      toast.error("Erro ao fixar conversa: " + err.message);
    }
  };

  // Auto-gerar título a partir do primeiro bloco de mensagens
  const generateAutoTitle = async (convId: string, firstMsg: string) => {
    try {
      const prompt = `Gere um título super curto, de no máximo 4 palavras, em português, que resuma esta mensagem: "${firstMsg}". Não use aspas, nem pontuação, apenas o título direto.`;
      
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "chat",
            messages: [{ role: "user", content: prompt }]
          })
        }
      );
      
      if (!res.ok) return;

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let responseText = "";
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith("data: ")) {
              try {
                const jsonStr = trimmed.slice(6);
                if (jsonStr === "[DONE]") continue;
                const parsed = JSON.parse(jsonStr);
                const chunk = parsed.choices?.[0]?.delta?.content || "";
                responseText += chunk;
              } catch {}
            }
          }
        }
      }

      const title = (responseText || firstMsg.slice(0, 25)).replace(/["'‘’.?!]/g, "").trim();
      await renameConversation(convId, title);
    } catch (e) {
      console.warn("Falha ao gerar auto-título, mantendo padrão", e);
    }
  };

  // Enviar mensagem (com suporte a SSE streaming)
  const sendMessage = async (content: string, image?: { base64: string; mimeType: string }) => {
    let convId = activeConversationId;
    
    // Se não há conversa ativa, cria uma automaticamente
    if (!convId) {
      convId = await createConversation(content.slice(0, 30) + "...");
      if (!convId) return;
    }

    const userMessageId = crypto.randomUUID();
    const userMsg: Message = {
      id: userMessageId,
      role: "user",
      content,
      created_at: new Date(),
      metadata: image ? { image } : {},
    };

    // Atualizar UI otimista
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      // 1. Salvar mensagem do usuário no banco
      const { error: userMsgErr } = await supabase
        .from("victoria_messages" as any)
        .insert({
          id: userMessageId,
          conversation_id: convId,
          role: "user",
          content,
          contract_version: VICTORIA_CONTRACT_VERSION,
          prompt_version: VICTORIA_PROMPT_VERSION,
          legacy_status: null,
          metadata: userMsg.metadata
        });
      if (userMsgErr) throw userMsgErr;

      // 2. Fluxo OCR se tiver imagem e prompt solicitar análise/relatório
      let ocrCampaigns: any[] = [];
      let detectedPlatform = "meta";
      let ocrReportId = "";
      
      const isOcrRequest = image && (
        content.toLowerCase().includes("relatório") ||
        content.toLowerCase().includes("extrair") ||
        content.toLowerCase().includes("print") ||
        content.toLowerCase().includes("campanha") ||
        content.trim() === ""
      );

      if (isOcrRequest && image) {
        try {
          toast.loading("Lendo print do painel de anúncios (OCR)...", { id: "ocr-toast" });
          const ocrRes = await extractPrintFn({
            data: {
              imageBase64: image.base64,
              mimeType: image.mimeType
            }
          });
          ocrCampaigns = ocrRes.campaigns;
          detectedPlatform = ocrRes.platform;
          toast.success("Métricas extraídas com sucesso!", { id: "ocr-toast" });
        } catch (ocrErr: any) {
          console.error("Falha no OCR, seguindo fluxo comum", ocrErr);
          toast.error("Não conseguimos ler a imagem como tabela de tráfego. Respondendo normalmente.", { id: "ocr-toast" });
        }
      }

      // 3. Preparar histórico de mensagens para a IA (limitado às últimas 15 para evitar estouro de contexto/tokens)
      const { data: dbMsgs } = await supabase
        .from("victoria_messages" as any)
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(15);

      const requestMessages = (dbMsgs || [])
        .slice()
        .reverse()
        .map((m: any) => ({
          role: m.role,
          content: m.content
        }));

      if (ocrCampaigns.length > 0) {
        const ocrDataStr = JSON.stringify(ocrCampaigns, null, 2);
        requestMessages.push({
          role: "user",
          content: `Aqui estão os dados estruturados do print de tráfego que acabei de fazer upload (Plataforma: ${detectedPlatform}):\n${ocrDataStr}\n\nPor favor, formate um relatório estratégico ultra profissional em Markdown com base nesses dados, destacando KPIs principais, melhor campanha, pior campanha e 3 recomendações claras de otimização.`
        });
      }

      // 4. Busca vetorial no hook antes de chamar o chat (C4) + Injeção garantida do Parecer Técnico Meta Ads 2026
      const ragResults = (content.trim() && knowledgeList.length > 0)
        ? await searchKnowledge(content)
        : [];
      const masterMetaContext = META_ADS_MASTER_KNOWLEDGE_DOCS
        .map(d => `[BASE DE CONHECIMENTO TREINADA — ${d.category.toUpperCase()}] ${d.title}:\n${d.content}`)
        .join("\n\n");
      const ragText = ragResults.length > 0
        ? ragResults.map(s => `[CONHECIMENTO — ${s.category.toUpperCase()}] ${s.title}: ${s.content}`).join("\n\n")
        : "";
      const externalContext = [masterMetaContext, ragText].filter(Boolean).join("\n\n---\n\n");

      // 5. Invocar a IA Victoria por Streaming SSE
      const isReadOnly = isReadOnlyAnalysisRequest(content);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "chat",
            messages: requestMessages,
            selectedAccountId: selectedAccountId || undefined,
            user_name: userName || undefined,
            externalContext,
            regionalBenchmark,
            readOnly: isReadOnly,
            operational_mode: isReadOnly ? "READ_ONLY_ANALYSIS" : "ACTION_PROPOSAL",
            contract_version: VICTORIA_CONTRACT_VERSION,
            prompt_version: VICTORIA_PROMPT_VERSION,
            temperature: VICTORIA_ANALYTICAL_TEMPERATURE,
          })
        }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200) || "Erro de comunicação com o servidor."}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) {
        throw new Error("Falha ao abrir stream.");
      }

      // Criar mensagem temporária de resposta
      const assistantMessageId = crypto.randomUUID();
      const tempAssistantMsg: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        created_at: new Date(),
        metadata: {}
      };
      setMessages(prev => [...prev, tempAssistantMsg]);

      let responseText = "";
      let buffer = "";
      let responseOrigin: "generative" | "deterministic_fallback" = "generative";
      let fallbackReason: string | null = null;
      let responseLatencyMs: number | null = null;
      let streamRagCitations: any[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const jsonStr = trimmed.slice(6);
              const parsed = JSON.parse(jsonStr);
              if (parsed?.victoria_meta) {
                if (parsed.victoria_meta.response_origin === "deterministic_fallback") {
                  responseOrigin = "deterministic_fallback";
                }
                if (Array.isArray(parsed.victoria_meta.rag_docs) && parsed.victoria_meta.rag_docs.length > 0) {
                  streamRagCitations = parsed.victoria_meta.rag_docs;
                }
                continue;
              }
              if (parsed?.victoria_final) {
                if (parsed.victoria_final.used_fallback) {
                  responseOrigin = "deterministic_fallback";
                  fallbackReason = parsed.victoria_final.fallback_reason || null;
                }
                if (typeof parsed.victoria_final.latency_ms === "number") {
                  responseLatencyMs = parsed.victoria_final.latency_ms;
                }
                if (Array.isArray(parsed.victoria_final.rag_citations) && parsed.victoria_final.rag_citations.length > 0) {
                  streamRagCitations = parsed.victoria_final.rag_citations;
                }
                continue;
              }
              const chunk = parsed.choices?.[0]?.delta?.content || "";
              if (chunk) {
                responseText += chunk;
                // Atualizar o chat progressivamente
                setMessages(prev =>
                  prev.map(m => (m.id === assistantMessageId ? { ...m, content: responseText } : m))
                );
              }
            } catch (err) {
              console.warn("Erro ao ler chunk SSE:", err, trimmed);
            }
          }
        }
      }

      // 5. Detectar blocos json:action com bloqueio determinístico em modo somente-leitura (ID 09)
      const parsedBlock = stripJsonActionBlocks(responseText);
      responseText = sanitizeVictoriaOutputText(parsedBlock.cleanText);
      let responseAction: any = parsedBlock.parsedAction
        ? buildActionProposal(parsedBlock.parsedAction, {
            accountId: selectedAccountId || null,
            readOnly: isReadOnly,
          })
        : null;

      // 6. Configurar relatório se for OCR
      if (ocrCampaigns.length > 0) {
        ocrReportId = `report-ocr-${Date.now()}`;
        const newReport = {
          id: ocrReportId,
          createdAt: new Date().toISOString(),
          clientName: detectedPlatform === "meta" ? "Meta Ads Import" : "Google Ads Import",
          periodText: "Período Extraído",
          reportMode: "complete",
          source: "upload" as const,
          campaigns: ocrCampaigns.map((c: any, index: number) => ({
            id: `ocr-${index}`,
            name: c.name || "Campanha Importada",
            cost: Number(c.cost || 0),
            impressions: Number(c.impressions || 0),
            clicks: Number(c.clicks || 0),
            conversions: Number(c.conversions || 0),
            reach: Number(c.reach || 0),
            objective: "Outros",
            platform: detectedPlatform,
            selected: true
          })),
          generatedText: responseText,
          reportLevel: "campaign" as const
        };

        const savedReportsRaw = localStorage.getItem("nc_saved_reports");
        let reportsList = [];
        if (savedReportsRaw) {
          try {
            reportsList = JSON.parse(savedReportsRaw);
          } catch {}
        }
        reportsList.unshift(newReport);
        localStorage.setItem("nc_saved_reports", JSON.stringify(reportsList));

        responseAction = {
          type: "open_report_config",
          reportId: ocrReportId,
          title: "Configurar Relatório Avançado",
          description: "Personalize este relatório gerado a partir do print, filtre campanhas, adicione WhatsApp e exporte em PDF premium.",
          risk: "low"
        };
      }

      // 7. Salvar resposta no banco
      const assistantMsgMetadata: any = {
        readOnly: isReadOnly,
        responseOrigin,
        fallbackReason,
        latencyMs: responseLatencyMs,
        ragCitations: streamRagCitations,
      };
      if (responseAction) {
        assistantMsgMetadata.action = responseAction;
        assistantMsgMetadata.actionStatus = "pending";
      }

      const { error: assistantMsgErr } = await supabase
        .from("victoria_messages" as any)
        .insert({
          id: assistantMessageId,
          conversation_id: convId,
          role: "assistant",
          content: responseText,
          contract_version: VICTORIA_CONTRACT_VERSION,
          prompt_version: VICTORIA_PROMPT_VERSION,
          legacy_status: null,
          metadata: assistantMsgMetadata
        });
      if (assistantMsgErr) throw assistantMsgErr;

      // Sincronizar UI final
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: responseText, metadata: assistantMsgMetadata }
            : m
        )
      );

      // Atualizar auto-título se for 1º interação
      if (messages.length === 0 || (messages.length === 1 && messages[0].role === "user")) {
        generateAutoTitle(convId, content || "Nova Análise");
      }

    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao enviar mensagem: " + err.message);
    } finally {
      setIsTyping(false);
    }
  };

  // Executar uma ação proposta com validação de governança (IDs 10 e 44)
  const executeAction = async (messageId: string, action: any, confirmPhrase?: string) => {
    try {
      const { data: currentMsg } = await (supabase
        .from("victoria_messages" as any)
        .select("metadata")
        .eq("id", messageId)
        .single() as any);

      const persistedStatus: ProposalStatus = currentMsg?.metadata?.actionStatus || "pending";
      const validation = validateActionExecution({
        proposal: action,
        status: persistedStatus,
        readOnly: Boolean(currentMsg?.metadata?.readOnly),
        userConfirmed: true,
        confirmPhrase: confirmPhrase || (action?.risk === "high" ? undefined : "CONFIRMAR"),
        currentAccountId: selectedAccountId || null,
      });

      if (!validation.allowed) {
        toast.error(validation.reason || "Execução bloqueada pela governança da Victoria.");
        if (validation.code === "EXPIRED") {
          const expiredMeta = { ...(currentMsg?.metadata || {}), actionStatus: "expired" };
          await supabase.from("victoria_messages" as any).update({ metadata: expiredMeta }).eq("id", messageId);
          setMessages(prev =>
            prev.map(m => m.id === messageId ? { ...m, metadata: { ...m.metadata, actionStatus: "expired" } } : m)
          );
        }
        return;
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, metadata: { ...m.metadata, actionStatus: "pending" as any } } : m
        )
      );

      if (action.type === "update_budget") {
        if (!action.campaignId || action.value === undefined) {
          throw new Error("Parâmetros de orçamento incompletos.");
        }
        const { error } = await supabase
          .from("campaigns")
          .update({ budget: action.value })
          .eq("id", action.campaignId);
        if (error) throw error;
        toast.success(`Orçamento atualizado para R$ ${Number(action.value).toFixed(2)}/dia.`);
      } else if (action.type === "pause_campaign") {
        if (!action.campaignId) throw new Error("ID da campanha não especificado.");
        const { error } = await supabase
          .from("campaigns")
          .update({ status: "PAUSED" })
          .eq("id", action.campaignId);
        if (error) throw error;
        toast.success("Campanha pausada com sucesso.");
      } else if (action.type === "clone_funnel_snapshot") {
        const { error } = await (supabase as any).rpc("clone_funnel_snapshot", action.params);
        if (error) throw error;
        toast.success("Funil clonado com sucesso!");
      } else {
        toast.info(`Ação do tipo "${action.type}" executada.`);
      }

      const newMetadata = {
        ...(currentMsg?.metadata || {}),
        actionStatus: "approved",
        executedAt: new Date().toISOString(),
      };

      await supabase
        .from("victoria_messages" as any)
        .update({ metadata: newMetadata })
        .eq("id", messageId);

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, metadata: { ...m.metadata, actionStatus: "approved" as any } } : m
        )
      );
    } catch (err: any) {
      console.error(err);
      toast.error(`Falha ao executar ação: ${err.message}`);
      
      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, metadata: { ...m.metadata, actionStatus: "error" as any } } : m
        )
      );
    }
  };

  // Rejeitar uma ação proposta
  const rejectAction = async (messageId: string) => {
    try {
      const { data: currentMsg } = await (supabase
        .from("victoria_messages" as any)
        .select("metadata")
        .eq("id", messageId)
        .single() as any);

      const newMetadata = { ...(currentMsg?.metadata || {}), actionStatus: "rejected" };

      await supabase
        .from("victoria_messages" as any)
        .update({ metadata: newMetadata })
        .eq("id", messageId);

      setMessages(prev =>
        prev.map(m =>
          m.id === messageId ? { ...m, metadata: { ...m.metadata, actionStatus: "rejected" as any } } : m
        )
      );
      toast.success("Recomendação arquivada.");
    } catch (err) {
      console.error(err);
    }
  };

  // Busca vetorial na base de conhecimento — exposta ao hook (C4)
  const searchKnowledge = async (query: string): Promise<{ id: string; title: string; category: string; content: string }[]> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({ action: "search_knowledge", query })
        }
      );
      if (!res.ok) return [];
      const data = await res.json();
      const snippets = (data.snippets || []) as { id: string; title: string; category: string; content: string }[];
      setRagSnippets(snippets);
      return snippets;
    } catch (e) {
      console.warn("[VICTORIA] RAG hook search falhou:", e);
      return [];
    }
  };

  // Adicionar Conhecimento (RAG) com limite estrito de até 50 documentos
  const addKnowledge = async (title: string, content: string, category: 'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom') => {
    if (knowledgeList.length >= 50) {
      toast.error("Capacidade máxima atingida: 50/50 documentos treinados. Exclua ou edite um documento para liberar espaço.");
      return false;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "add_knowledge",
            title,
            content,
            category
          })
        }
      );

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const bodyData = await res.json();
      if (bodyData.success && bodyData.data) {
        const newItem: KnowledgeItem = {
          id: bodyData.data.id,
          category: bodyData.data.category,
          title: bodyData.data.title,
          content: bodyData.data.content,
          created_at: new Date(bodyData.data.created_at)
        };
        setKnowledgeList(prev => [newItem, ...prev]);
        toast.success(`Documento treinado adicionado com sucesso! (${knowledgeList.length + 1}/50)`);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Erro ao adicionar conhecimento:", err);
      toast.error("Erro ao processar documento: " + err.message);
      return false;
    }
  };

  // Editar / Atualizar Conhecimento existente (com re-embedding e sincronização)
  const updateKnowledge = async (
    id: string,
    title: string,
    category: KnowledgeItem['category'],
    content: string
  ): Promise<boolean> => {
    try {
      // 1. Tentar atualizar via Edge Function para recalcular embedding geométrico
      let updatedViaFn = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/victoria-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "update_knowledge",
            id,
            title,
            content,
            category
          })
        });

        if (res.ok) {
          const bodyData = await res.json();
          if (bodyData.success) {
            updatedViaFn = true;
          }
        }
      } catch (fnErr) {
        console.warn("[UPDATE_KNOWLEDGE] Edge function indisponível, aplicando fallback direto:", fnErr);
      }

      // 2. Se a Edge Function não concluiu, fazer o update direto no Supabase
      if (!updatedViaFn) {
        const { error } = await supabase
          .from("victoria_knowledge" as any)
          .update({
            title,
            category,
            content,
            updated_at: new Date().toISOString()
          })
          .eq("id", id);

        if (error) throw error;
      }

      // 3. Atualizar estado local
      setKnowledgeList(prev => prev.map(k => k.id === id ? { ...k, title, category, content } : k));
      toast.success("Documento treinado atualizado com sucesso!");
      return true;
    } catch (err: any) {
      console.error("Erro ao atualizar conhecimento:", err);
      toast.error("Erro ao atualizar documento: " + (err?.message || "Tente novamente."));
      return false;
    }
  };

  // Deletar Conhecimento
  const deleteKnowledge = async (id: string) => {
    try {
      const { error } = await supabase
        .from("victoria_knowledge" as any)
        .delete()
        .eq("id", id);

      if (error) throw error;
      setKnowledgeList(prev => prev.filter(k => k.id !== id));
      toast.success("Documento removido da base de conhecimento.");
      return true;
    } catch (err: any) {
      toast.error("Erro ao remover documento: " + err.message);
      return false;
    }
  };

  // Importar base de conhecimento NC Performance (12 documentos estratégicos)
  const seedDefaultKnowledge = async (onProgress?: (current: number, total: number) => void): Promise<{ success: boolean; created: number }> => {
    const SEED_DOCS: { title: string; category: 'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom'; content: string }[] = [
      {
        title: "Posicionamento e Identidade NC Performance",
        category: "brand_voice",
        content: "NC Performance é uma agência de tráfego pago especializada em marketing automotivo no Rio de Janeiro. Atendemos concessionárias, revendedoras de seminovos e centros automotivos.\n\nNosso diferencial: velocidade de execução, dados em tempo real e linguagem do setor — não entregamos relatórios genéricos, entregamos diagnósticos precisos com ação imediata.\n\nTom de comunicação:\n- Direto, profissional mas acessível\n- Sempre com dados concretos (CPL, CTR, Leads gerados)\n- Proativo com sugestões de otimização\n- Nunca desculpas: se campanha não performa, apresentamos a solução imediatamente\n\nSlogans: 'Performance em Alta Velocidade', 'Motor de Tráfego Automotivo', 'Leads que convertem em vendas'.\nPosicionamento: Médio-alto tier. Não competimos por preço, competimos por resultado."
      },
      {
        title: "Benchmarks Operacionais por Unidade — Automotivo RJ 2025-2026",
        category: "strategy",
        content: "REFERÊNCIAS INTERNAS DE CUSTO POR CONVERSA / CADASTRO (SOMENTE PARA OBJETIVOS DE MENSAGENS OU LEADS — NUNCA APLICAR A ALCANCE OU VISITAS):\n\nVEÍCULOS NOVOS (CADASTRO/CONVERSA):\n- Faixa saudável de referência: R$ 15,00 a R$ 35,00 | Atenção: R$ 35,00 a R$ 55,00\n\nSEMINOVOS POPULARES (CONVERSA INICIADA WHATSAPP):\n- Referência operacional conforme meta configurada na conta\n\nCTR (LINK):\n- Em campanhas de tráfego/mensagens: > 1.20% indica boa tração direcional; em campanhas de alcance (REACH), o CTR é apenas sinal secundário.\n- Hipótese criativa para teste: alternar fotos e vídeos reais do estoque no pátio para validar ganho de CTR na própria conta.\n\nFREQUÊNCIA DE EXIBIÇÃO:\n- Saudável em janelas de 7 dias: 1.5 a 2.5 | Atenção para repetição: > 3.0"
      },
      {
        title: "Estrutura de Campanhas Meta Ads — Automotivo",
        category: "strategy",
        content: "ESTRUTURA PADRÃO META ADS PARA CONCESSIONÁRIAS:\n\nCAMPANHA 1 — PROSPECÇÃO:\n- Objetivo: Leads | Público: Broad 25-55 anos, interesse em veículos, financiamento | Raio: 40-60km\n- Criativos: 3-5 fotos reais + 1-2 vídeos 15-30s | Budget mínimo: R$ 50/dia por conjunto\n\nCAMPANHA 2 — REMARKETING:\n- Público: Visitantes site 30 dias + Engajamento IG/FB 60 dias + leads não comprados 90 dias\n- Budget: 20-30% do total | Criativos: modelo específico + oferta + depoimentos\n\nCAMPANHA 3 — LOOKALIKE:\n- Origem: compradores confirmados | Tamanho: 1-3% (qualidade) ou 3-5% (volume)\n\nORÇAMENTOS MÍNIMOS RJ:\n- Concessionária pequena: R$ 150/dia | Média: R$ 300/dia | Multi-marca seminovos: R$ 200/dia\n\nCTA eficazes: 'Saiba Mais', 'Enviar Mensagem', 'Ligue Agora'. Formulários: incluir filtro de qualificação (entrada, troca, financiamento)."
      },
      {
        title: "Funil de Vendas Automotivo — Etapas, KPIs e Taxas",
        category: "strategy",
        content: "FUNIL DE VENDAS AUTOMOTIVO NC PERFORMANCE:\n\nETAPA 1 — AWARENESS: Meta Ads, TikTok, Google Display. KPI: CPM, Alcance.\nETAPA 2 — INTERESSE: Retargeting Meta, Google Search. KPI: CTR, CPC.\nETAPA 3 — CONSIDERAÇÃO: WhatsApp/e-mail. Ação: Ligar em até 5 min após lead. KPI: Taxa test drive.\nETAPA 4 — DECISÃO: Presencial + follow-up WhatsApp. Negociação, financiamento. KPI: Taxa conversão.\nETAPA 5 — PÓS-VENDA: NPS, indicação, depoimento. Compradores viram audiência de indicação.\n\nTAXAS SAUDÁVEIS:\n- Lead → Atendimento: 70%+ (< 50% = problema no processo)\n- Atendimento → Test Drive: 30-40%\n- Test Drive → Proposta: 60-70%\n- Proposta → Venda: 25-40%\n\nPRINCIPAIS PERDAS: demora no atendimento (> 30 min esfria lead), sem follow-up, oferta confusa, preço desatualizado."
      },
      {
        title: "Estratégia de Remarketing para Concessionárias",
        category: "strategy",
        content: "PÚBLICOS DE REMARKETING ESSENCIAIS:\n1. Visitantes site 3 dias: interesse quente, mostrar modelo visto\n2. Visitantes site 7 dias: oferta especial + financiamento\n3. Visitantes site 30 dias: depoimentos + novo estoque + urgência\n4. Engajamento IG/FB 30 dias: conteúdo de consideração\n5. Leads não atendidos 15 dias: retomada de contato\n6. Clientes antigos > 2 anos: campanha de troca/renovação\n\nMENSAGENS EFICAZES RJ:\n- 'Ainda pensando no [modelo]? Condições especiais esta semana.'\n- 'Seu próximo carro está te esperando. Traga seu usado na troca.'\n- 'Financiamento aprovado na hora. 0 entrada para CPF limpo.'\n- 'Test Drive gratuito. Venha nos visitar em [bairro].'\n\nPIXEL META EVENTOS MÍNIMOS: PageView, ViewContent, Lead, Contact (WhatsApp), CompleteRegistration."
      },
      {
        title: "Social Media Automotivo — Frequência, Formatos e Horários RJ",
        category: "strategy",
        content: "FREQUÊNCIA MÍNIMA: Instagram Feed 4-5 posts/sem | Stories diário 8-12 | Facebook 3-4/sem | TikTok 2-3/sem\n\nCONTEÚDO QUE MAIS CONVERTE:\n1. Foto real do pátio (40%): 'chegou no estoque', luz natural, carro limpo\n2. Vídeo tour do veículo (20%): walk-around 60-90s\n3. Depoimento de cliente (15%): foto/vídeo com frase de impacto\n4. Conteúdo educativo (15%): 'como funciona o financiamento?'\n5. Oferta/promoção (10%): taxa zero, bônus troca\n\nHORÁRIOS RJ: Seg-Sex 7-9h, 12-13h, 18-20h | SÁBADO 9-12h: melhor dia para novos carros | Dom 10-12h\n\nERROS: fotos de catálogo (impessoal), texto longo na imagem, preço desatualizado, stories sem link."
      },
      {
        title: "Google Ads vs Meta Ads — Quando Usar no Automotivo",
        category: "strategy",
        content: "META ADS (Facebook/Instagram): Ideal para criar desejo antes da busca, remarketing agressivo, conteúdo visual de showroom, lançamentos, público por interesse. Budget recomendado: 60-70% do total.\n\nGOOGLE ADS SEARCH: Ideal para capturar demanda ativa ('comprar [modelo] RJ'), leads altamente qualificados, defender marca. Budget: 25-30%.\n\nGOOGLE PERFORMANCE MAX: Combina Search/Display/YouTube/Shopping. Ideal para catálogos amplos. Budget: 10-15%.\n\nCPL COMPARATIVO RJ:\n- Meta Ads Lead Gen: R$ 20-40 (volume alto, qualificação média)\n- Google Search: R$ 35-70 (volume menor, qualificação alta)\n- Orgânico SEO: R$ 8-15 (longo prazo)\n\nMIGRAR PARA GOOGLE quando Meta CPL > R$ 50 por 2 semanas consecutivas."
      },
      {
        title: "Mercado de Seminovos RJ — Guia Estratégico 2025-2026",
        category: "inventory",
        content: "PANORAMA RJ: 2º maior mercado de seminovos do Brasil. Demanda concentrada em Zona Sul, Barra, Niterói, Nova Iguaçu, Duque de Caxias. Ticket médio: R$ 45-85k (popular) | R$ 120-280k (premium).\n\nMODELOS MAIS BUSCADOS NO RJ:\n1. Toyota Corolla (XEi, Altis) 2. Jeep Renegade/Compass 3. Honda HRV/Civic\n4. VW T-Cross/Virtus 5. Hyundai Creta/ix35 6. Chevrolet Tracker/Onix Plus 7. BMW Série 3\n\nDIFERENCIAIS NOS ANÚNCIOS: Histórico FIPE, laudo cautelar, garantia em contrato, avaliação de usado na troca, condições claras de financiamento (sujeito à análise formal de crédito).\n\nCONFORMIDADE PUBLICITÁRIA: Nunca prometer aprovação garantida de crédito sem análise da instituição financeira."
      },
      {
        title: "Segmentos de Veículos e Abordagem por Público",
        category: "inventory",
        content: "HATCHBACKS POPULARES (Ônix, HB20, Polo): Público jovem 20-35, renda 2-5 SM. Copy: 'Seu primeiro carro com parcela de [valor]'.\n\nSEDÃS EXECUTIVOS (Corolla, Virtus, Cruze): 30-50 anos, executivos. Abordagem: conforto, status, tecnologia. Copy: 'Conforto e eficiência para o profissional'.\n\nSUVs MEDIANOS (Renegade, Compass, Creta): Famílias 30-50, renda 5-15 SM. Copy: 'A família merece espaço e segurança'.\n\nSUVs PREMIUM (BMW X3, Audi Q5, Volvo XC60): 40-60 anos, empresários. Evitar preço, focar experiência e exclusividade.\n\nPICKUPS (Hilux, Ranger, S10): 30-55 anos, empresários/rural. Copy: 'Para quem trabalha de verdade'. Foco em carga, durabilidade, versatilidade."
      },
      {
        title: "Protocolo de Lançamento de Campanha NC Performance",
        category: "manual",
        content: "CHECKLIST PRÉ-LANÇAMENTO (48h antes):\n☐ Definir objetivo: Leads, Tráfego ou Conversões\n☐ URL de destino funcional (site, WhatsApp, formulário)\n☐ Pixel Meta instalado e disparando eventos\n☐ Públicos criados: Prospecting, Remarketing, Lookalike\n☐ Mínimo 3 criativos por conjunto\n☐ Budget aprovado com cliente\n☐ Regras automáticas de pausa (CPL > meta × 2)\n☐ WhatsApp ativo para receber leads\n\nLANÇAMENTO: Ativar 6h-8h (melhor leilão). Monitorar 4 primeiras horas.\n\nPÓS 24h: Analisar custo na unidade do objetivo e CTR. Avaliar ajustes graduais de até +20% após janela mínima de validação."
      },
      {
        title: "SLA de Atendimento ao Lead e Script de Abordagem",
        category: "manual",
        content: "SLA OPERACIONAL NC PERFORMANCE: WhatsApp até 5 min (meta operacional 2 min) | Formulário site 15 min | Lead Ads Meta 10 min | E-mail 2h.\n\nPRINCÍPIO OPERACIONAL: Menor tempo de resposta preserva a intenção de contato do lead (a Victoria não observa o CRM diretamente a menos que integrado no contexto).\n\nSCRIPT WHATSAPP: 'Oi [Nome]! Aqui é [Consultor] da [Concessionária]. Vi seu interesse no [Modelo]. Tenho condições especiais! Qual o melhor horário? 😊'\n\nQUALIFICADORES (primeiros 2 min): novo ou seminovo? tem troca? à vista ou financiado (sujeito a crédito)? para quando precisa?\n\nFOLLOW-UP: Dia 1 → mensagem | Dia 2 → foto + link | Dia 4 → oferta com prazo | Dia 7 → retomada | Dia 14 → novos modelos"
      },
      {
        title: "Capacidades e Comandos da Victoria no NC Suite",
        category: "custom",
        content: "CAPACIDADES DA VICTORIA:\n\nANÁLISE: campanhas 7/15/30 dias, CPL/CTR por campanha, melhor/pior campanha, relatório executivo formatado, dados de dias específicos (ontem, sábado, fim de semana).\n\nEXECUÇÃO (com aprovação): atualizar orçamento, pausar campanha, criar estrutura de funil.\n\nSOCIAL: análise de páginas conectadas, melhores posts, sugestão de calendário de conteúdo.\n\nPESQUISA WEB: ativar com 'pesquise sobre', 'procure na internet', 'últimas tendências de'. Victoria usa Google Search via Gemini Grounding.\n\nCOMUNICAÇÃO: português brasileiro, tom estratégico sênior, nunca age como IA genérica, foca em ações concretas e resultados.\n\nCOMANDOS ÚTEIS: 'Diagnóstico das campanhas', 'Gere relatório executivo', 'Como melhorar o CPL?', 'Crie funil para [produto]', 'Pesquise tendências de tráfego pago automotivo'."
      },
      ...META_ADS_MASTER_KNOWLEDGE_DOCS.map(d => ({
        title: d.title,
        category: d.category,
        content: d.content,
      }))
    ];

    // Obter user_id atual
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, created: 0 };

    let created = 0;
    let lastError = "";
    for (let i = 0; i < SEED_DOCS.length; i++) {
      const doc = SEED_DOCS[i];
      if (onProgress) onProgress(i + 1, SEED_DOCS.length);
      try {
        // Insere diretamente via Supabase client (embedding null por enquanto)
        const { error } = await supabase
          .from("victoria_knowledge" as any)
          .insert({
            user_id: user.id,
            category: doc.category,
            title: doc.title,
            content: doc.content,
          });
        if (error) {
          lastError = error.message;
          console.error("[VICTORIA SEED]", doc.title, error.message);
        } else {
          created++;
        }
      } catch (e: any) {
        lastError = e?.message || "Erro desconhecido";
        console.error("[VICTORIA SEED] Exception:", e);
      }
    }

    if (created > 0) await fetchKnowledge();
    if (lastError && created === 0) toast.error(`Erro no seed: ${lastError}`);
    return { success: created > 0, created };
  };

  // Editar uma mensagem do usuário, apagar as posteriores e pedir nova resposta da IA
  const editMessage = async (messageId: string, newContent: string) => {
    try {
      setIsTyping(true);

      // 1. Obter a mensagem que está sendo editada
      const { data: editedMsg, error: fetchErr } = await supabase
        .from("victoria_messages" as any)
        .select("created_at, conversation_id")
        .eq("id", messageId)
        .single();

      if (fetchErr || !editedMsg) throw new Error("Mensagem não encontrada.");

      const convId = editedMsg.conversation_id;

      // 2. Apagar todas as mensagens posteriores nesta conversa (reescrever histórico)
      const { error: deleteErr } = await supabase
        .from("victoria_messages" as any)
        .delete()
        .eq("conversation_id", convId)
        .gt("created_at", editedMsg.created_at);

      if (deleteErr) throw deleteErr;

      // 3. Atualizar o conteúdo da mensagem editada
      const { error: updateErr } = await supabase
        .from("victoria_messages" as any)
        .update({ content: newContent })
        .eq("id", messageId);

      if (updateErr) throw updateErr;

      // 4. Recarregar histórico local de mensagens
      const { data: dbMsgs } = await supabase
        .from("victoria_messages" as any)
        .select("*")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      setMessages(
        (dbMsgs || []).map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: new Date(m.created_at),
          metadata: m.metadata || {},
        }))
      );

      // 5. Preparar histórico limitado (últimas 15 mensagens)
      const { data: historyMsgs } = await supabase
        .from("victoria_messages" as any)
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: false })
        .limit(15);

      const requestMessages = (historyMsgs || [])
        .slice()
        .reverse()
        .map((m: any) => ({
          role: m.role,
          content: m.content
        }));

      // 6. Chamar a IA Victoria via SSE Streaming
      const isReadOnlyEdit = isReadOnlyAnalysisRequest(newContent);
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "chat",
            messages: requestMessages,
            selectedAccountId: selectedAccountId || undefined,
            user_name: userName || undefined,
            readOnly: isReadOnlyEdit,
            operational_mode: isReadOnlyEdit ? "READ_ONLY_ANALYSIS" : "ACTION_PROPOSAL",
            contract_version: VICTORIA_CONTRACT_VERSION,
            prompt_version: VICTORIA_PROMPT_VERSION,
            temperature: VICTORIA_ANALYTICAL_TEMPERATURE,
          })
        }
      );

      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errBody.slice(0, 200) || "Erro de comunicação."}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Falha ao abrir stream.");

      // Criar mensagem temporária do assistente
      const assistantMessageId = crypto.randomUUID();
      const tempAssistantMsg: Message = {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        created_at: new Date(),
        metadata: {}
      };
      setMessages(prev => [...prev, tempAssistantMsg]);

      let responseText = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;

          if (trimmed.startsWith("data: ")) {
            try {
              const jsonStr = trimmed.slice(6);
              const parsed = JSON.parse(jsonStr);
              const chunk = parsed.choices?.[0]?.delta?.content || "";
              if (chunk) {
                responseText += chunk;
                setMessages(prev =>
                  prev.map(m => (m.id === assistantMessageId ? { ...m, content: responseText } : m))
                );
              }
            } catch {}
          }
        }
      }

      // Processar action block respeitando bloqueio de leitura (ID 09)
      const parsedEditBlock = stripJsonActionBlocks(responseText);
      responseText = parsedEditBlock.cleanText;
      const responseAction: any = parsedEditBlock.parsedAction
        ? buildActionProposal(parsedEditBlock.parsedAction, {
            accountId: selectedAccountId || null,
            readOnly: isReadOnlyEdit,
          })
        : null;

      // Salvar a resposta no banco
      const assistantMsgMetadata: any = { readOnly: isReadOnlyEdit };
      if (responseAction) {
        assistantMsgMetadata.action = responseAction;
        assistantMsgMetadata.actionStatus = "pending";
      }

      const { error: assistantMsgErr } = await supabase
        .from("victoria_messages" as any)
        .insert({
          id: assistantMessageId,
          conversation_id: convId,
          role: "assistant",
          content: responseText,
          contract_version: VICTORIA_CONTRACT_VERSION,
          prompt_version: VICTORIA_PROMPT_VERSION,
          legacy_status: null,
          metadata: assistantMsgMetadata
        });
      if (assistantMsgErr) throw assistantMsgErr;

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessageId
            ? { ...m, content: responseText, metadata: assistantMsgMetadata }
            : m
        )
      );

    } catch (err: any) {
      console.error(err);
      toast.error("Erro ao regenerar resposta: " + err.message);
    } finally {
      setIsTyping(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Gerenciamento Acumulativo de Artigos do Radar de Mercado (Até 100 itens)
  // ═══════════════════════════════════════════════════════════════════════

  // Excluir artigos selecionados ou individuais
  const deleteMarketArticles = (articleIds: string[]) => {
    if (!articleIds || articleIds.length === 0) return;
    const toDeleteSet = new Set(articleIds);
    setMarketArticles(prev => {
      const remaining = prev.filter(art => !toDeleteSet.has(art.id));
      try {
        localStorage.setItem("nc_market_radar_articles_v2", JSON.stringify(remaining));
      } catch (e) {
        console.warn("Falha ao salvar no storage:", e);
      }
      return remaining;
    });
    toast.success(`${articleIds.length} artigo(s) removido(s) do Radar.`);
  };

  // Limpar todos os artigos do Radar
  const clearMarketArticles = () => {
    setMarketArticles([]);
    localStorage.removeItem("nc_market_radar_articles_v2");
    toast.info("Radar de notícias foi limpo.");
  };

  // Rastrear Notícias Reais do Setor, Marketing e Leis (Acumulativo até 100 Artigos Únicos)
  const fetchMarketIntel = async (
    showToast = true,
    overrideFilters?: {
      timeFilter?: RadarTimeFilter;
      regionFilter?: RadarRegionFilter;
      selectedPortalIds?: string[];
    }
  ): Promise<MarketArticle[]> => {
    const activeTime = overrideFilters?.timeFilter || radarTimeFilter;
    const activeRegion = overrideFilters?.regionFilter || radarRegionFilter;
    const activePortals = overrideFilters?.selectedPortalIds || selectedPortalIds;

    if (activePortals.length === 0) {
      if (showToast) toast.error("Marque pelo menos 1 portal no checklist de fontes para rastrear notícias.");
      return [];
    }

    setIsScanningMarket(true);
    try {
      const feeds = buildRadarFeeds({
        timeFilter: activeTime,
        regionFilter: activeRegion,
        selectedPortalIds: activePortals,
      });

      let fetched: MarketArticle[] = [];

      // CAMADA 1: Edge Function `victoria-agent` (Deno server-side, sem CORS)
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const edgeRes = await fetch(`${VITE_SUPABASE_URL}/functions/v1/victoria-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY,
          },
          body: JSON.stringify({
            action: "fetch_market_intel",
            feeds,
          }),
        });
        if (edgeRes.ok) {
          const edgeJson = await edgeRes.json();
          if (edgeJson?.success && Array.isArray(edgeJson.articles) && edgeJson.articles.length > 0) {
            fetched = edgeJson.articles;
          }
        }
      } catch (edgeErr) {
        console.warn("[RADAR] Camada 1 (Edge Function) falhou, tentando Camada 2:", edgeErr);
      }

      // CAMADA 2: TanStack Server Function (se disponível no ambiente)
      if (fetched.length === 0) {
        try {
          const response = await fetchMarketIntelFn({
            data: {
              timeFilter: activeTime,
              regionFilter: activeRegion,
              selectedPortalIds: activePortals,
            },
          });
          if (response && response.success && Array.isArray(response.articles) && response.articles.length > 0) {
            fetched = response.articles;
          }
        } catch (fnErr) {
          console.warn("[RADAR] Camada 2 (Server Function) indisponível, tentando Camada 3 (RSS Bridge):", fnErr);
        }
      }

      // CAMADA 3: Ponte CORS pública no navegador (rss2json / allorigins) para garantir notícias REAIS no client SPA
      if (fetched.length === 0) {
        const clientArticles: MarketArticle[] = [];
        const seenClientKeys = new Set<string>();

        await Promise.all(
          feeds.map(async (f) => {
            // Tentativa 3A: api.rss2json.com
            try {
              const r2jUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(f.url)}`;
              const r = await fetch(r2jUrl);
              if (r.ok) {
                const json = await r.json();
                if (json?.status === "ok" && Array.isArray(json.items)) {
                  for (const item of json.items.slice(0, 12)) {
                    const rawTitle = String(item.title || "").trim();
                    const source = rawTitle.includes(" - ")
                      ? rawTitle.split(" - ").pop() || item.author || "Notícias Automotivas"
                      : item.author || "Notícias Automotivas";
                    const pureTitle = rawTitle.includes(" - ")
                      ? rawTitle.substring(0, rawTitle.lastIndexOf(" - "))
                      : rawTitle;
                    const key = pureTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
                    if (pureTitle && key.length > 5 && !seenClientKeys.has(key)) {
                      seenClientKeys.add(key);
                      clientArticles.push({
                        id: `art_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
                        title: pureTitle,
                        source,
                        link: item.link || "",
                        pubDate: parseSafeIsoDate(item.pubDate),
                        snippet: String(item.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().substring(0, 260),
                        category: f.cat,
                      });
                    }
                  }
                  return;
                }
              }
            } catch {}

            // Tentativa 3B: api.allorigins.win/raw
            try {
              const aoUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(f.url)}`;
              const r = await fetch(aoUrl);
              if (r.ok) {
                const xml = await r.text();
                const parsed = parseRssXmlToArticles(xml, f.cat, 12);
                for (const art of parsed) {
                  const key = art.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                  if (key.length > 5 && !seenClientKeys.has(key)) {
                    seenClientKeys.add(key);
                    clientArticles.push(art);
                  }
                }
              }
            } catch {}
          })
        );

        fetched = clientArticles;
      }

      // Filtragem temporal estrita no cliente (1d = até 36h, 7d = até 8 dias, 30d = até 32 dias)
      const maxAgeMs =
        activeTime === "1d"
          ? 36 * 60 * 60 * 1000
          : activeTime === "7d"
          ? 8 * 24 * 60 * 60 * 1000
          : 32 * 24 * 60 * 60 * 1000;
      const nowMs = Date.now();

      const freshFetched = fetched
        .filter((a) => {
          const t = new Date(a.pubDate).getTime();
          if (isNaN(t)) return true;
          return nowMs - t <= maxAgeMs;
        })
        .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());

      if (freshFetched.length === 0) {
        if (showToast) {
          toast.warning("Nenhuma notícia recente encontrada para os filtros selecionados. Tente ampliar o período (ex: Última Semana) ou marcar mais portais.");
        }
        return [];
      }

      let newCount = 0;
      let totalAccumulated = marketArticles.length;

      setMarketArticles(prev => {
        // Quando notícias reais chegam, removemos os placeholders iniciais `fb_*`
        const realPrev = prev.filter(a => !a.id.startsWith("fb_"));

        const existingKeys = new Set(
          realPrev.map(a => (a.link || a.title).toLowerCase().trim().replace(/[^a-z0-9]/g, ""))
        );

        const newArticles = freshFetched.filter(a => {
          const linkKey = a.link ? a.link.toLowerCase().trim().replace(/[^a-z0-9]/g, "") : "";
          const titleKey = a.title.toLowerCase().trim().replace(/[^a-z0-9]/g, "");
          const isDup = (linkKey && existingKeys.has(linkKey)) || existingKeys.has(titleKey);
          return titleKey.length > 5 && !isDup;
        });

        newCount = newArticles.length;

        // Acumula os novos no topo, preserva os existentes e limita ao teto de 100 artigos!
        const combined = [...newArticles, ...realPrev]
          .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime())
          .slice(0, 100);
        totalAccumulated = combined.length;

        try {
          localStorage.setItem("nc_market_radar_articles_v2", JSON.stringify(combined));
        } catch (e) {
          console.warn("Falha ao gravar artigos no storage:", e);
        }
        return combined;
      });

      const now = new Date();
      setLastMarketScan(now);
      localStorage.setItem("nc_last_market_scan", now.toISOString());

      if (showToast) {
        if (newCount > 0) {
          toast.success(`Radar atualizado com notícias reais: +${newCount} novas notícias (${totalAccumulated}/100 acumuladas).`);
        } else {
          toast.info(`Varredura concluída: ${freshFetched.length} notícias recentes verificadas, sem novidades duplicadas.`);
        }
      }
      return freshFetched;
    } catch (err: any) {
      console.warn("Falha ao buscar radar de notícias:", err);
      if (showToast) toast.error("Erro ao consultar portais de notícias: " + (err?.message || "Tente novamente."));
      return [];
    } finally {
      setIsScanningMarket(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // Absorver Artigos Selecionados no RAG Vetorial da Victoria (Até 50 Documentos)
  // ═══════════════════════════════════════════════════════════════════════
  const learnMarketIntel = async (articles: MarketArticle[]): Promise<boolean> => {
    if (!articles || articles.length === 0) {
      toast.error("Selecione ao menos um artigo para absorver no RAG.");
      return false;
    }

    if (knowledgeList.length >= 50) {
      toast.error("Capacidade máxima atingida: 50/50 documentos treinados. Exclua ou edite algum documento para liberar espaço.");
      return false;
    }

    setIsLearningMarket(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error("Usuário não autenticado.");
      }

      const collectedAtIso = new Date().toISOString();
      const nowStr = new Date().toLocaleDateString("pt-BR");
      const summaryContent = articles
        .map((art) => {
          const cleanTitle = sanitizeRssText(art.title);
          const cleanExcerpt = sanitizeRssText(art.snippet);
          const hasSpecificArticleUrl = !isHomepageOnlyUrl(art.link);
          const urlLabel = hasSpecificArticleUrl
            ? art.link
            : `${art.link || "sem-url"} [referência genérica — não usar como prova numérica]`;
          return `- [${sanitizeRssText(art.source)}] ${cleanTitle}\n  Publicado em: ${art.pubDate} | Coletado em: ${collectedAtIso}\n  Excerto: ${cleanExcerpt}\n  Fonte: ${urlLabel}`;
        })
        .join("\n\n");

      const docTitle = articles.length === 1
        ? `[RADAR MERCADO] ${sanitizeRssText(articles[0].title).slice(0, 75)}`
        : `[RADAR MERCADO AUTOMOTIVO] Inteligência & Tendências — ${nowStr} (${articles.length} notícias)`;

      const docContent = `SÍNTESE DE NOTÍCIAS COLETADAS (${nowStr}):\n\n${summaryContent}\n\nNOTAS DE GOVERNANÇA RAG:\n- Utilize apenas os excertos e URLs específicas registradas acima como evidência editorial.\n- Metas numéricas e métricas operacionais de conta devem vir exclusivamente da base de campanhas ou metas configuradas (nunca de valores estáticos).`;

      // 1. Tentar absorver via Edge Function (gera embedding geométrico com Gemini)
      let savedViaFn = false;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`${VITE_SUPABASE_URL}/functions/v1/victoria-agent`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": ANON_KEY
          },
          body: JSON.stringify({
            action: "learn_market_intel",
            articlesToLearn: articles
          })
        });

        if (res.ok) {
          const bodyData = await res.json();
          if (bodyData.success) {
            savedViaFn = true;
          }
        }
      } catch (fnErr) {
        console.warn("[LEARN_MARKET] Edge function indisponível, aplicando inserção direta:", fnErr);
      }

      // 2. Se a Edge Function não inseriu, inserir diretamente na tabela do Supabase
      if (!savedViaFn) {
        const { error: insertErr } = await supabase
          .from("victoria_knowledge" as any)
          .insert({
            user_id: user.id,
            category: "strategy",
            title: docTitle,
            content: docContent,
          });

        if (insertErr) {
          throw new Error(insertErr.message);
        }
      }

      toast.success(`🧠 Victoria absorveu ${articles.length} notícia(s) na sua Base de Conhecimento! (${knowledgeList.length + 1}/50)`);
      await fetchKnowledge();
      return true;
    } catch (err: any) {
      console.error("Erro ao aprender tendências:", err);
      toast.error("Erro ao absorver aprendizado: " + (err?.message || "Tente novamente."));
      return false;
    } finally {
      setIsLearningMarket(false);
    }
  };

  return {
    conversations,
    activeConversationId,
    setActiveConversationId,
    messages,
    loadingConversations,
    loadingMessages,
    isTyping,
    createConversation,
    deleteConversation,
    renameConversation,
    togglePinConversation,
    sendMessage,
    editMessage,
    executeAction,
    rejectAction,
    knowledgeList,
    loadingKnowledge,
    addKnowledge,
    updateKnowledge,
    deleteKnowledge,
    fetchKnowledge,
    ragSnippets,
    searchKnowledge,
    seedDefaultKnowledge,
    regionalBenchmark,
    updateRegionalBenchmark,
    marketArticles,
    isScanningMarket,
    isLearningMarket,
    lastMarketScan,
    radarTimeFilter,
    setRadarTimeFilter,
    radarRegionFilter,
    setRadarRegionFilter,
    selectedPortalIds,
    setSelectedPortalIds,
    fetchMarketIntel,
    learnMarketIntel,
    deleteMarketArticles,
    clearMarketArticles
  };
}
