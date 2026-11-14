import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { 
  Bot, Sparkles, X, Minus, ExternalLink, Send, Loader2, 
  TrendingUp, AlertTriangle, CheckCircle2, Flame, DollarSign, 
  Activity, ArrowUpRight, ChevronDown, ChevronUp, RefreshCw, Zap,
  MessageCircle, Target, HelpCircle, ShieldAlert
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase, EXTERNAL_SUPABASE_URL, EXTERNAL_SUPABASE_ANON_KEY } from "@/integrations/supabase-external/client";
import { META_ADS_MASTER_KNOWLEDGE_DOCS } from "@/lib/metaAlgorithmEngine";
import { toast } from "sonner";

export interface ContextItem {
  id: string;
  name: string;
  type: "campaign" | "adset" | "ad" | "account";
  objective?: string;
  resultType?: string;
  t?: {
    cost: number;
    conversions: number;
    cpl: number;
    ctr: number;
    impressions: number;
    reach: number;
    freq: number;
    cpm: number;
    cpc: number;
  };
  resultDetail?: {
    resultLabel: string;
    costLabel: string;
    shortBadge: string;
  };
}

interface VictoriaFloatingChatProps {
  isOpen: boolean;
  onClose: () => void;
  contextItem?: ContextItem | null;
  accountName?: string;
  avgAccountCpl?: number;
}

interface ChatMsg {
  id: string;
  role: "assistant" | "user";
  content: string;
  created_at: Date;
}

const QUICK_PROMPTS = [
  "Como baixar o CPL dessa campanha?",
  "Vale a pena aumentar o orçamento agora?",
  "O público está saturado ou o criativo enfraqueceu?",
  "Quais criativos funcionam melhor para esse objetivo?"
];

export const VictoriaFloatingChat: React.FC<VictoriaFloatingChatProps> = ({
  isOpen,
  onClose,
  contextItem,
  accountName = "Conta Meta Ads",
  avgAccountCpl = 0,
}) => {
  const nav = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [initialDiagnosisDone, setInitialDiagnosisDone] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll para a última mensagem
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!isMinimized && messages.length > 0) {
      scrollToBottom();
      setHasUnread(false);
    }
  }, [messages, isMinimized]);

  // Inicializar conversa e disparar diagnóstico quando aberto com uma campanha
  useEffect(() => {
    if (isOpen) {
      setIsMinimized(false);
      setHasUnread(false);
      if (!initialDiagnosisDone) {
        initiateDiagnosis();
      }
    }
  }, [isOpen, contextItem?.id]);

  const initiateDiagnosis = async () => {
    setIsLoading(true);
    setInitialDiagnosisDone(true);

    const targetName = contextItem?.name || accountName;
    const title = `Diagnóstico: ${targetName.slice(0, 30)}`;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      let convId = conversationId;

      if (!convId && user) {
        const { data: conv } = await supabase
          .from("victoria_conversations" as any)
          .insert({
            user_id: user.id,
            title,
          })
          .select()
          .single();

        if (conv?.id) {
          convId = conv.id;
          setConversationId(convId);
        }
      }

      // Montar dados detalhados para a Victoria
      const cost = contextItem?.t?.cost ?? 0;
      const convs = contextItem?.t?.conversions ?? 0;
      const cpl = contextItem?.t?.cpl ?? 0;
      const ctr = contextItem?.t?.ctr ?? 0;
      const freq = contextItem?.t?.freq ?? 1;
      const cpm = contextItem?.t?.cpm ?? 0;
      const impr = contextItem?.t?.impressions ?? 0;
      const resLabel = contextItem?.resultDetail?.resultLabel || "conversões";

      const systemDiagnosticPrompt = `Você é a Victoria AI, Estrategista Sênior de Tráfego Pago e Performance Automotiva da NC Performance.
Acabo de selecionar esta campanha no Gerenciador de Métricas e preciso do seu diagnóstico real, profundo e estratégico para tomada de decisão imediata.

Dados Reais da Campanha Selecionada:
- Nome: "${targetName}"
- Conta: "${accountName}"
- Objetivo / Conversão Real: ${contextItem?.resultDetail?.shortBadge || contextItem?.objective || "MENSAGENS"} (${resLabel})
- Investimento Gasto: R$ ${cost.toFixed(2)}
- Resultados Entregues: ${convs} ${resLabel}
- Custo por Resultado (${contextItem?.resultDetail?.costLabel || "CPL/CPA"}): ${convs > 0 && cpl > 0 ? `R$ ${cpl.toFixed(2)}` : "Não calculável (0 resultados)"}
- Média/Referência da Conta: ${avgAccountCpl > 0 ? `R$ ${avgAccountCpl.toFixed(2)}` : "Não calculável (sem referência configurada)"}
- CTR Médio: ${ctr.toFixed(2)}%
- Frequência: ${freq.toFixed(1)}x
- CPM: R$ ${cpm.toFixed(2)}
- Impressões: ${impr.toLocaleString("pt-BR")}

Diretrizes da sua resposta:
1. Comece de forma direta e técnica, cumprimentando como uma estrategista sênior da agência ("Olá! Analisei minuciosamente a campanha...").
2. Avaliação de Eficiência: O CPL está bom ou alto? O volume de conversões é aceitável para o gasto de R$ ${cost.toFixed(2)}?
3. Raio-X Técnico: Analise se o criativo está cansando (CTR baixo < 1% ou Frequência > 3.0x), se o CPM está caro no leilão ou se a entrega está com vazamento de verba.
4. Plano de Ação Estratégico (3 pontos concretos): Recomende se deve Escalar Orçamento, Renovar Criativo, Trocar de Público ou Pausar.
5. Finalize com uma pergunta provocativa e aberta, me convidando para traçar o próximo passo agora mesmo.
Use markdown com tópicos, negrito e destaques visuais elegantes.`;

      // Mensagem inicial de sistema enviada para o backend
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(
        `${EXTERNAL_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || EXTERNAL_SUPABASE_ANON_KEY}`,
            apikey: EXTERNAL_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: "chat",
            messages: [
              { role: "user", content: systemDiagnosticPrompt }
            ],
            selectedAccountId: contextItem?.id,
            externalContext: `Campanha: ${targetName} | Gasto: R$ ${cost.toFixed(2)} | Resultados: ${convs} | CPL: R$ ${cpl.toFixed(2)} | CTR: ${ctr.toFixed(2)}% | Freq: ${freq.toFixed(1)}x\n\n` +
              META_ADS_MASTER_KNOWLEDGE_DOCS.map(d => `[BASE TREINADA] ${d.title}:\n${d.content}`).join("\n\n")
          })
        }
      );

      let assistantText = "";
      if (response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
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
                  assistantText += chunk;
                  
                  // Atualizar mensagem em streaming
                  setMessages([
                    {
                      id: "init-diag",
                      role: "assistant",
                      content: assistantText,
                      created_at: new Date(),
                    }
                  ]);
                } catch {}
              }
            }
          }
        }
      }

      // Se por algum motivo o stream vier vazio, gera diagnóstico local de contingência imediata
      if (!assistantText) {
        const isGood = cpl > 0 && avgAccountCpl > 0 && cpl <= avgAccountCpl * 0.9;
        const isBad = convs === 0 && cost > 25;
        const fallback = `### 🤖 Diagnóstico Estratégico — Victoria AI\n\nAnalisei a campanha **${targetName}** com base nos dados reais do período:\n\n- **Gasto:** R$ ${cost.toFixed(2)} | **Resultados:** ${convs} ${resLabel}\n- **CPL Atual:** R$ ${cpl.toFixed(2)} *(Meta benchmark: R$ ${avgAccountCpl.toFixed(2)})*\n- **CTR:** ${ctr.toFixed(2)}% | **Frequência:** ${freq.toFixed(1)}x\n\n${
          isBad 
            ? "⚠️ **Alerta Crítico:** A campanha gastou mais de R$ 25,00 sem gerar nenhum lead/mensagem. Recomendo **pausar imediatamente** e testar novo gancho criativo."
            : isGood
            ? "🔥 **Alta Performance:** O custo por lead está abaixo da média e com boa tração. Essa campanha está pronta para **escala gradual de 15% a 20% ao dia**."
            : "⚡ **Performance Estável:** A entrega está dentro dos parâmetros normais. Mantenha o monitoramento da frequência e do CTR nos próximos dias."
        }\n\n**O que você gostaria de explorar agora?** Posso analisar o público-alvo, sugerir novas copies de anúncio ou simular o ajuste de orçamento.`;

        assistantText = fallback;
        setMessages([
          {
            id: "init-diag",
            role: "assistant",
            content: fallback,
            created_at: new Date(),
          }
        ]);
      }

      // Salvar a mensagem no Supabase se houver conversa criada
      if (convId && user) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: convId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
        });
      }

    } catch (err: any) {
      console.error("Erro ao gerar diagnóstico:", err);
      toast.error("Victoria AI não conseguiu conectar ao leilão no momento.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    setInput("");
    const userMsgId = crypto.randomUUID();
    const newMsg: ChatMsg = {
      id: userMsgId,
      role: "user",
      content: text,
      created_at: new Date(),
    };

    setMessages(prev => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (conversationId && user) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "user",
          content: text,
        });
      }

      // Preparar histórico para a API
      const conversationHistory = [...messages, newMsg].map(m => ({
        role: m.role,
        content: m.content
      }));

      const response = await fetch(
        `${EXTERNAL_SUPABASE_URL}/functions/v1/victoria-agent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token || EXTERNAL_SUPABASE_ANON_KEY}`,
            apikey: EXTERNAL_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            action: "chat",
            messages: conversationHistory,
            selectedAccountId: contextItem?.id,
            externalContext: `Campanha em discussão: ${contextItem?.name || accountName} | Gasto: R$ ${contextItem?.t?.cost?.toFixed(2) || "0"} | Conversões: ${contextItem?.t?.conversions || 0} | CPL: R$ ${contextItem?.t?.cpl?.toFixed(2) || "0"}\n\n` +
              META_ADS_MASTER_KNOWLEDGE_DOCS.map(d => `[BASE TREINADA] ${d.title}:\n${d.content}`).join("\n\n")
          })
        }
      );

      let assistantText = "";
      const assistantMsgId = crypto.randomUUID();

      if (response.ok) {
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
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
                  assistantText += chunk;

                  setMessages(prev => {
                    const existing = prev.find(m => m.id === assistantMsgId);
                    if (existing) {
                      return prev.map(m => m.id === assistantMsgId ? { ...m, content: assistantText } : m);
                    } else {
                      return [...prev, {
                        id: assistantMsgId,
                        role: "assistant",
                        content: assistantText,
                        created_at: new Date(),
                      }];
                    }
                  });
                } catch {}
              }
            }
          }
        }
      }

      if (!assistantText) {
        assistantText = "Entendido! Estou monitorando os dados dessa campanha em tempo real. Se precisar de ajuste no orçamento ou criação de novos anúncios, conte comigo.";
        setMessages(prev => [...prev, {
          id: assistantMsgId,
          role: "assistant",
          content: assistantText,
          created_at: new Date(),
        }]);
      }

      if (conversationId && user) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
        });
      }

      if (isMinimized) {
        setHasUnread(true);
      }

    } catch (err: any) {
      toast.error("Erro na comunicação com a Victoria AI.");
    } finally {
      setIsLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleOpenInHub = () => {
    if (conversationId) {
      localStorage.setItem("nc_victoria_active_conversation_id", conversationId);
    }
    toast.info("Transferindo conversa para o Victoria AI Hub...");
    nav({ to: "/victoria" });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* ═══════════════════════════════════════════════
          BOLHA MINIMIZADA (Estilo Facebook Messenger)
          ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {isMinimized && (
          <motion.div
            initial={{ scale: 0, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 20 }}
            onClick={() => setIsMinimized(false)}
            className="fixed bottom-20 sm:bottom-6 right-4 sm:right-6 z-50 group cursor-pointer"
            title="Abrir Diagnóstico Victoria AI"
          >
            <div className="relative h-14 w-14 rounded-full bg-gradient-to-tr from-primary via-rose-600 to-amber-500 p-[2px] shadow-[0_8px_32px_rgba(220,38,38,0.45)] hover:scale-105 active:scale-95 transition-transform flex items-center justify-center">
              <div className="h-full w-full rounded-full bg-card/95 backdrop-blur-md flex items-center justify-center">
                <Bot className="h-7 w-7 text-primary animate-pulse" />
              </div>
              <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-green-500 border-2 border-background animate-pulse" />
              {hasUnread && (
                <span className="absolute top-0 left-0 h-3.5 w-3.5 rounded-full bg-amber-400 border border-background animate-ping" />
              )}
            </div>
            {/* Tooltip flutuante */}
            <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-card border border-primary/30 px-3 py-1.5 rounded-xl shadow-xl text-xs font-bold text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
              💬 Victoria AI: Diagnóstico Ativo
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════
          JANELA DE CONVERSA FLUTUANTE (Subindo no Canto)
          ═══════════════════════════════════════════════ */}
      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-16 sm:bottom-5 right-2 sm:right-5 z-50 w-[calc(100vw-1rem)] sm:w-[440px] md:w-[470px] h-[580px] max-h-[85vh] rounded-3xl border border-primary/30 bg-background/95 backdrop-blur-2xl shadow-[0_12px_50px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
          >
            {/* Linha de brilho superior */}
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-rose-500 to-amber-500" />

            {/* HEADER DO CHAT */}
            <div className="px-4 py-3 border-b border-white/10 bg-card/60 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground truncate">
                      Victoria AI
                    </h3>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[8px] font-black uppercase text-primary border border-primary/20">
                      Sênior
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate" title={contextItem?.name || accountName}>
                    {contextItem ? `Diagnóstico · ${contextItem.name}` : `Visão Geral · ${accountName}`}
                  </p>
                </div>
              </div>

              {/* Botões de Ação do Header (Minimizar, Hub Victoria, Fechar) */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={handleOpenInHub}
                  className="h-8 w-8 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-primary transition-all flex items-center justify-center"
                  title="Continuar conversa em tela cheia no Victoria Hub"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setIsMinimized(true)}
                  className="h-8 w-8 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all flex items-center justify-center"
                  title="Minimizar conversa em bolha flutuante"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <button
                  onClick={onClose}
                  className="h-8 w-8 rounded-xl hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all flex items-center justify-center"
                  title="Fechar diagnóstico"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* TELEMETRIA RÁPIDA DA CAMPANHA (Pill Contextual) */}
            {contextItem && (
              <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-muted-foreground shrink-0 overflow-x-auto scrollbar-none gap-3">
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <DollarSign className="h-3 w-3 text-red-400" />
                  <span>R$ {(contextItem.t?.cost || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <MessageCircle className="h-3 w-3 text-blue-400" />
                  <span>{contextItem.t?.conversions || 0} {contextItem.resultDetail?.shortBadge || "RES"}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <Activity className="h-3 w-3 text-emerald-400" />
                  <span>CPL R$ {(contextItem.t?.cpl || 0).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-1 whitespace-nowrap">
                  <TrendingUp className="h-3 w-3 text-amber-400" />
                  <span>CTR {(contextItem.t?.ctr || 0).toFixed(2)}%</span>
                </div>
              </div>
            )}

            {/* CORPO DE MENSAGENS COM SCROLL */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin text-xs">
              {messages.length === 0 && isLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
                  <div className="relative h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-xs">Victoria está auditando os dados...</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">Cruzando CPL, criativos e benchmarks do leilão</p>
                  </div>
                </div>
              )}

              {messages.map((m) => {
                const isAssistant = m.role === "assistant";
                return (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-2.5 ${isAssistant ? "items-start" : "items-end justify-end"}`}
                  >
                    {isAssistant && (
                      <div className="h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl p-3.5 max-w-[85%] leading-relaxed ${
                        isAssistant
                          ? "bg-card border border-white/10 text-foreground shadow-md"
                          : "bg-primary text-background font-medium shadow-[0_4px_16px_rgba(220,38,38,0.25)]"
                      }`}
                    >
                      {isAssistant ? (
                        <div className="prose prose-invert prose-xs max-w-none space-y-2">
                          <ReactMarkdown>{m.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{m.content}</p>
                      )}
                      <span className={`block text-[8px] font-mono mt-1.5 opacity-40 ${isAssistant ? "text-left" : "text-right"}`}>
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </motion.div>
                );
              })}

              {isLoading && messages.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>Victoria digitando...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* CHIPS DE SUGESTÕES RÁPIDAS */}
            {messages.length <= 2 && (
              <div className="px-3 py-1.5 bg-card/40 border-t border-white/5 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                {QUICK_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleSend(prompt)}
                    disabled={isLoading}
                    className="shrink-0 text-[10px] font-bold rounded-lg px-2.5 py-1 bg-white/[0.03] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground border border-white/5 transition-all whitespace-nowrap"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}

            {/* INPUT DE CONVERSA */}
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="p-3 border-t border-white/10 bg-card/80 flex items-center gap-2 shrink-0"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Converse com a Victoria sobre a campanha..."
                disabled={isLoading}
                className="flex-1 bg-background/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 rounded-xl bg-primary text-background flex items-center justify-center hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all shrink-0"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
