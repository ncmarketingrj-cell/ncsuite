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

      // 4. Invocar a IA Victoria por Streaming SSE
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
            selectedAccountId: selectedAccountId || undefined
          })
        }
      );

      if (!res.ok) {
        throw new Error("Erro de comunicação com o servidor.");
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
    fetchKnowledge
  };
}
