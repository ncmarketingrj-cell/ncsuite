import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractPrintFn } from "@/lib/ocr.functions";
import { toast } from "sonner";

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: Date;
  metadata?: {
    image?: { base64: string; mimeType: string };
    action?: {
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
    actionStatus?: "pending" | "approved" | "rejected" | "error";
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

export function useVictoriaChat(selectedAccountId: string, setSelectedAccountId: (id: string) => void) {
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

  // Carregar base de conhecimento
  const fetchKnowledge = async () => {
    setLoadingKnowledge(true);
    try {
      const { data, error } = await supabase
        .from("victoria_knowledge" as any)
        .select("id, category, title, content, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setKnowledgeList(
        (data || []).map((k: any) => ({
          id: k.id,
          category: k.category,
          title: k.title,
          content: k.content,
          created_at: new Date(k.created_at)
        }))
      );
    } catch (err: any) {
      console.error("Erro ao carregar base de conhecimento:", err);
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
          (data || []).map((m: any) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: new Date(m.created_at),
            metadata: m.metadata || {},
          }))
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
        .insert({ user_id: user.id, title })
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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || ""
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

      // 3. Preparar histórico de mensagens para a IA
      const { data: dbMsgs } = await supabase
        .from("victoria_messages" as any)
        .select("role, content")
        .eq("conversation_id", convId)
        .order("created_at", { ascending: true });

      const requestMessages = (dbMsgs || []).map((m: any) => ({
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

      // 4. Busca vetorial no hook antes de chamar o chat (C4)
      // Só chama a Gemini API se houver documentos cadastrados na base de conhecimento
      const ragResults = (content.trim() && knowledgeList.length > 0)
        ? await searchKnowledge(content)
        : [];
      const externalContext = ragResults.length > 0
        ? ragResults.map(s => `[CONHECIMENTO — ${s.category.toUpperCase()}] ${s.title}: ${s.content}`).join("\n\n")
        : undefined;

      // 5. Invocar a IA Victoria por Streaming SSE
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || ""
          },
          body: JSON.stringify({
            action: "chat",
            messages: requestMessages,
            selectedAccountId: selectedAccountId || undefined,
            externalContext
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

      // 5. Detectar blocos json:action
      let responseAction: any = null;
      const actionMatch = responseText.match(/```json:action\s*([\s\S]*?)\s*```/);
      if (actionMatch) {
        try {
          responseAction = JSON.parse(actionMatch[1]);
          responseText = responseText.replace(/```json:action[\s\S]*?```/, "").trim();
        } catch (e) {
          console.error("Erro ao fazer parse da action da Victoria:", e);
        }
      }

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
      const assistantMsgMetadata: any = {};
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

  // Executar uma ação proposta (Human-in-the-loop)
  const executeAction = async (messageId: string, action: any) => {
    try {
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
        toast.success(`Orçamento atualizado para R$ ${action.value.toFixed(2)}/dia.`);
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

      const { data: currentMsg } = await (supabase
        .from("victoria_messages" as any)
        .select("metadata")
        .eq("id", messageId)
        .single() as any);

      const newMetadata = { ...(currentMsg?.metadata || {}), actionStatus: "approved" };

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
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || ""
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

  // Adicionar Conhecimento (RAG) via Edge Function
  const addKnowledge = async (title: string, content: string, category: 'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom') => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token || ""}`,
            "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || ""
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
        toast.success("Documento adicionado com sucesso!");
        return true;
      }
      return false;
    } catch (err: any) {
      console.error("Erro ao adicionar conhecimento:", err);
      toast.error("Erro ao processar documento: " + err.message);
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
        title: "Benchmarks CPL, CTR e Frequência — Automotivo RJ 2025-2026",
        category: "strategy",
        content: "BENCHMARKS CPL (CUSTO POR LEAD) MERCADO AUTOMOTIVO RJ:\n\nVEÍCULOS NOVOS:\n- Excelente: < R$ 15,00 | Saudável: R$ 15-35 | Atenção: R$ 35-55 | Crítico: > R$ 55\n\nSEMINOVOS POPULARES:\n- Excelente: < R$ 18 | Saudável: R$ 18-40 | Atenção: R$ 40-65 | Crítico: > R$ 65\n\nSEMINOVOS PREMIUM (BMW, Mercedes, Audi):\n- Excelente: < R$ 35 | Saudável: R$ 35-80 | Crítico: > R$ 130\n\nCTR (TAXA DE CLIQUE):\n- Ideal: > 1.20% | Aceitável: 0.80-1.20% | Crítico: < 0.80% → trocar criativos por fotos reais do pátio\nAção CTR baixo: Fotos reais (celular, luz natural, pátio) convertem 40-60% melhor que catálogo.\n\nFREQUÊNCIA DE EXIBIÇÃO:\n- Ideal: 1.5-2.5 | Alerta: > 3.0 (renovar criativos) | Crítico: > 4.0 → pausar conjunto"
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
        content: "PANORAMA RJ: 2º maior mercado de seminovos do Brasil. Demanda concentrada em Zona Sul, Barra, Niterói, Nova Iguaçu, Duque de Caxias. Ticket médio: R$ 45-85k (popular) | R$ 120-280k (premium).\n\nMODELOS MAIS BUSCADOS NO RJ:\n1. Toyota Corolla (XEi, Altis) 2. Jeep Renegade/Compass 3. Honda HRV/Civic\n4. VW T-Cross/Virtus 5. Hyundai Creta/ix35 6. Chevrolet Tracker/Onix Plus 7. BMW Série 3\n\nDIFERENCIAIS NOS ANÚNCIOS: Histórico FIPE, laudo cautelar, garantia estendida, financiamento 24h, aceita troca, IPVA incluso.\n\nGATILHOS EFICAZES RJ: 'Parcela que cabe no bolso', 'Sem saída', 'Financiamento sem consulta SPC', 'Entrega em domicílio', 'Documentação 100% inclusa'."
      },
      {
        title: "Segmentos de Veículos e Abordagem por Público",
        category: "inventory",
        content: "HATCHBACKS POPULARES (Ônix, HB20, Polo): Público jovem 20-35, renda 2-5 SM. Copy: 'Seu primeiro carro com parcela de [valor]'.\n\nSEDÃS EXECUTIVOS (Corolla, Virtus, Cruze): 30-50 anos, executivos. Abordagem: conforto, status, tecnologia. Copy: 'Conforto e eficiência para o profissional'.\n\nSUVs MEDIANOS (Renegade, Compass, Creta): Famílias 30-50, renda 5-15 SM. Copy: 'A família merece espaço e segurança'.\n\nSUVs PREMIUM (BMW X3, Audi Q5, Volvo XC60): 40-60 anos, empresários. Evitar preço, focar experiência e exclusividade.\n\nPICKUPS (Hilux, Ranger, S10): 30-55 anos, empresários/rural. Copy: 'Para quem trabalha de verdade'. Foco em carga, durabilidade, versatilidade."
      },
      {
        title: "Protocolo de Lançamento de Campanha NC Performance",
        category: "manual",
        content: "CHECKLIST PRÉ-LANÇAMENTO (48h antes):\n☐ Definir objetivo: Leads, Tráfego ou Conversões\n☐ URL de destino funcional (site, WhatsApp, formulário)\n☐ Pixel Meta instalado e disparando eventos\n☐ Públicos criados: Prospecting, Remarketing, Lookalike\n☐ Mínimo 3 criativos por conjunto\n☐ Budget aprovado com cliente\n☐ Regras automáticas de pausa (CPL > meta × 2)\n☐ WhatsApp ativo para receber leads\n\nLANÇAMENTO: Ativar 6h-8h (melhor leilão). Monitorar 4 primeiras horas.\n\nPÓS 24h: Analisar CPL/CTR. Pausar criativos CTR < 0.5% após 1.000 impressões. Escalar +20% se CPL < meta."
      },
      {
        title: "SLA de Atendimento ao Lead e Script de Abordagem",
        category: "manual",
        content: "SLA NC PERFORMANCE: WhatsApp 5 min (meta 2 min) | Formulário site 15 min | Lead Ads Meta 10 min | E-mail 2h.\n\nIMPACTO DA DEMORA: 0-5 min → 80% conversão | 5-30 min → 60% | 30-60 min → 40% | 1-24h → 20% | após 24h → < 5%\n\nSCRIPT WHATSAPP: 'Oi [Nome]! Aqui é [Consultor] da [Concessionária]. Vi seu interesse no [Modelo]. Tenho condições especiais! Qual o melhor horário? 😊'\n\nQUALIFICADORES (primeiros 2 min): novo ou seminovo? tem troca? à vista ou financiado? para quando precisa?\n\nFOLLOW-UP: Dia 1 → mensagem | Dia 2 → foto + link | Dia 4 → oferta com prazo | Dia 7 → urgência | Dia 14 → novos modelos"
      },
      {
        title: "Capacidades e Comandos da Victoria no NC Suite",
        category: "custom",
        content: "CAPACIDADES DA VICTORIA:\n\nANÁLISE: campanhas 7/15/30 dias, CPL/CTR por campanha, melhor/pior campanha, relatório executivo formatado, dados de dias específicos (ontem, sábado, fim de semana).\n\nEXECUÇÃO (com aprovação): atualizar orçamento, pausar campanha, criar estrutura de funil.\n\nSOCIAL: análise de páginas conectadas, melhores posts, sugestão de calendário de conteúdo.\n\nPESQUISA WEB: ativar com 'pesquise sobre', 'procure na internet', 'últimas tendências de'. Victoria usa Google Search via Gemini Grounding.\n\nCOMUNICAÇÃO: português brasileiro, tom estratégico sênior, nunca age como IA genérica, foca em ações concretas e resultados.\n\nCOMANDOS ÚTEIS: 'Diagnóstico das campanhas', 'Gere relatório executivo', 'Como melhorar o CPL?', 'Crie funil para [produto]', 'Pesquise tendências de tráfego pago automotivo'."
      }
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
    executeAction,
    rejectAction,
    knowledgeList,
    loadingKnowledge,
    addKnowledge,
    deleteKnowledge,
    fetchKnowledge,
    ragSnippets,
    searchKnowledge,
    seedDefaultKnowledge
  };
}
