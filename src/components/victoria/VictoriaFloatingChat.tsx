import React, { useState, useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import {
  Bot,
  X,
  Minus,
  ExternalLink,
  Send,
  Loader2,
  TrendingUp,
  DollarSign,
  Activity,
  MessageCircle,
  Database,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import {
  supabase,
  EXTERNAL_SUPABASE_URL,
  EXTERNAL_SUPABASE_ANON_KEY,
} from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import {
  VictoriaSessionController,
  buildSuggestedQuestionsForContext,
  sanitizeVictoriaOutputText,
  generateSeniorStructuredAnalysis,
  matchesCanonicalContextIdentity,
  VICTORIA_BUILD_TAG,
  VICTORIA_ANALYTICAL_TEMPERATURE,
  type VictoriaAnalysisContext,
} from "@/lib/victoriaContract";
import {
  buildContextFromMetricasItem,
  executeGovernedVictoriaDiagnostic,
} from "@/lib/victoriaContextGateway";

export interface ContextItem {
  id: string;
  external_id?: string;
  ad_account_id?: string;
  name: string;
  type: "campaign" | "adset" | "ad" | "account";
  status?: string;
  delivery_status?: string;
  objective?: string;
  resultType?: string;
  result_type?: string;
  result_indicator?: string;
  optimization_goal?: string;
  daily_budget?: number;
  lifetime_budget?: number;
  budget?: number;
  dateFrom?: string;
  dateTo?: string;
  lastSyncAt?: string | null;
  t?: {
    cost: number;
    conversions: number;
    cpl: number;
    ctr: number;
    ctrAll?: number;
    impressions: number;
    reach: number;
    freq: number;
    cpm: number;
    cpc: number;
    cpcAll?: number;
    clicks?: number;
    linkClicks?: number;
    allClicks?: number;
  };
  resultDetail?: {
    resultLabel: string;
    costLabel: string;
    shortBadge: string;
  };
  analysisContext?: VictoriaAnalysisContext;
}

interface VictoriaFloatingChatProps {
  isOpen: boolean;
  onClose: () => void;
  contextItem?: ContextItem | null;
  accountId?: string;
  accountName?: string;
  avgAccountCpl?: number;
  dateFrom?: string;
  dateTo?: string;
  lastSyncAt?: string | null;
}

interface ChatMsg {
  id: string;
  role: "assistant" | "user";
  content: string;
  created_at: Date;
  requestId?: string;
  contextHash?: string;
}

function toIdentityPayload(ctx: VictoriaAnalysisContext) {
  return {
    request_id: ctx.request_id,
    analysis_context_hash: ctx.analysis_context_hash,
    ad_account_id: ctx.ad_account_id,
    entity_level: ctx.entity_level,
    entity_id: ctx.entity_id,
    date_from: ctx.period.date_from,
    date_to: ctx.period.date_to,
    result_indicator: ctx.result_indicator.code,
    contract_version: ctx.contract_version,
    prompt_version: ctx.prompt_version,
  };
}

export const VictoriaFloatingChat: React.FC<VictoriaFloatingChatProps> = ({
  isOpen,
  onClose,
  contextItem,
  accountId = "all",
  accountName = "Conta Meta Ads",
  avgAccountCpl = 0,
  dateFrom,
  dateTo,
  lastSyncAt = null,
}) => {
  const nav = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [hasUnread, setHasUnread] = useState(false);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [showDataUsed, setShowDataUsed] = useState(false);
  const [showWhyRec, setShowWhyRec] = useState(false);
  const [ragSources, setRagSources] = useState<
    Array<{ id: string; title: string; version: string; evidence_level: string; approval_status: string }>
  >([]);

  const sessionCtrlRef = useRef<VictoriaSessionController>(new VictoriaSessionController());
  const conversationContextHashRef = useRef<string | null>(null);
  const [responseOrigin, setResponseOrigin] = useState<"generative" | "deterministic_fallback" | null>(null);
  const [fallbackReason, setFallbackReason] = useState<string | null>(null);
  const [responseLatencyMs, setResponseLatencyMs] = useState<number | null>(null);
  const activeFlowSeqRef = useRef<number>(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const resolvedDateFrom = contextItem?.dateFrom || dateFrom || todayIso;
  const resolvedDateTo = contextItem?.dateTo || dateTo || todayIso;

  // Construir o VictoriaAnalysisContext canônico para a entidade atual
  const activeContext: VictoriaAnalysisContext = useMemo(() => {
    if (contextItem?.analysisContext) {
      return contextItem.analysisContext;
    }
    return buildContextFromMetricasItem({
      item: contextItem || {
        id: accountId || "account_overview",
        name: accountName,
        type: "account",
        objective: "OUTCOME_ENGAGEMENT",
        result_type: "MESSAGES",
        t: {
          cost: 0,
          conversions: 0,
          cpl: 0,
          ctr: 0,
          impressions: 0,
          reach: 0,
          freq: 0,
          cpm: 0,
          cpc: 0,
        },
      },
      surface: "floating_chat",
      route: "/metricas",
      conversationId,
      accountId: contextItem?.ad_account_id || accountId || "all",
      accountName,
      dateFrom: resolvedDateFrom,
      dateTo: resolvedDateTo,
      lastSyncAt: contextItem?.lastSyncAt ?? lastSyncAt,
      sameObjectiveAvgCost: avgAccountCpl > 0 ? avgAccountCpl : null,
    });
  }, [
    contextItem,
    accountId,
    accountName,
    avgAccountCpl,
    resolvedDateFrom,
    resolvedDateTo,
    lastSyncAt,
    conversationId,
  ]);

  const suggestedQuestions = useMemo(
    () => buildSuggestedQuestionsForContext(activeContext),
    [activeContext]
  );

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (!isMinimized && messages.length > 0) {
      scrollToBottom();
      setHasUnread(false);
    }
  }, [messages, isMinimized]);

  // REGRA CRÍTICA DE ISOLAMENTO (Seção 2 / Falha 3):
  // Sempre que a entidade aberta (id) ou o hash de contexto mudar, aborta imediatamente a requisição anterior,
  // limpa mensagens/atalhos da campanha anterior e inicia um novo diagnóstico isolado.
  useEffect(() => {
    if (!isOpen) {
      activeFlowSeqRef.current++;
      sessionCtrlRef.current.abortActive();
      return;
    }

    const seq = ++activeFlowSeqRef.current;
    sessionCtrlRef.current.abortActive();
    setIsMinimized(false);
    setHasUnread(false);
    setErrorState(null);
    setShowDataUsed(false);
    setShowWhyRec(false);
    setInput("");
    setMessages([]);
    setRagSources([]);
    setResponseOrigin(null);
    setFallbackReason(null);
    setResponseLatencyMs(null);
    setConversationId(null);
    conversationContextHashRef.current = null;

    void initiateDiagnosis(activeContext, seq);

    return () => {
      activeFlowSeqRef.current++;
      sessionCtrlRef.current.abortActive();
    };
  }, [
    isOpen,
    activeContext.entity_id,
    activeContext.entity_level,
    activeContext.ad_account_id,
    activeContext.period.date_from,
    activeContext.period.date_to,
    activeContext.analysis_context_hash,
  ]);

  const initiateDiagnosis = async (
    ctxInput: VictoriaAnalysisContext,
    expectedSeq?: number,
    options?: { reuseConversation?: boolean }
  ) => {
    const seq = expectedSeq ?? ++activeFlowSeqRef.current;
    const isStale = () => activeFlowSeqRef.current !== seq;
    const ctxSnapshot: VictoriaAnalysisContext = {
      ...ctxInput,
      operational_mode: "READ_ONLY_ANALYSIS",
      request_id: `vreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };

    setIsLoading(true);
    setErrorState(null);
    setResponseOrigin(null);
    setFallbackReason(null);
    setResponseLatencyMs(null);

    const targetName = ctxSnapshot.entity_name || accountName;
    const title = `Diagnóstico: ${targetName.slice(0, 36)}`;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isStale()) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (isStale()) return;

      const token = session?.access_token || null;

      const canReuseConversation =
        Boolean(options?.reuseConversation) &&
        Boolean(conversationId) &&
        conversationContextHashRef.current === ctxSnapshot.analysis_context_hash;

      let convId: string | null = canReuseConversation ? conversationId : null;
      if (user && !convId) {
        const { data: conv } = await supabase
          .from("victoria_conversations" as any)
          .insert({
            user_id: user.id,
            title,
            ad_account_id: ctxSnapshot.ad_account_id,
            entity_level: ctxSnapshot.entity_level,
            entity_id: ctxSnapshot.entity_id,
            analysis_context_hash: ctxSnapshot.analysis_context_hash,
            contract_version: ctxSnapshot.contract_version,
            legacy_status: null,
          })
          .select()
          .single();

        if (isStale()) return;
        if (conv?.id) {
          convId = conv.id;
          conversationContextHashRef.current = ctxSnapshot.analysis_context_hash;
          setConversationId(convId);
        }
      }

      const result = await executeGovernedVictoriaDiagnostic({
        ctx: {
          ...ctxSnapshot,
          user_id: user?.id ?? null,
          conversation_id: convId,
        },
        controller: sessionCtrlRef.current,
        endpointUrl: `${EXTERNAL_SUPABASE_URL}/functions/v1/victoria-agent`,
        authToken: token,
        anonKey: EXTERNAL_SUPABASE_ANON_KEY,
        onToken: (partialText, validatedCtx) => {
          if (isStale()) return;
          const idCheck = matchesCanonicalContextIdentity(ctxSnapshot, toIdentityPayload(validatedCtx));
          if (!idCheck.valid) return;
          setMessages([
            {
              id: `diag_${validatedCtx.request_id}`,
              role: "assistant",
              content: sanitizeVictoriaOutputText(partialText, validatedCtx),
              created_at: new Date(),
              requestId: validatedCtx.request_id,
              contextHash: validatedCtx.analysis_context_hash,
            },
          ]);
        },
      });

      if (isStale() || result.aborted) {
        return;
      }

      const idCheck = matchesCanonicalContextIdentity(ctxSnapshot, toIdentityPayload(result.context));
      const safeFinalText = idCheck.valid
        ? result.text
        : generateSeniorStructuredAnalysis(ctxSnapshot);

      if (!idCheck.valid) {
        console.warn("[VICTORIA_FLOATING_ID_MISMATCH]", idCheck.mismatches);
      }

      if (result.timedOut) {
        setErrorState(
          "A conexão com o modelo excedeu 20s; exibindo diagnóstico estruturado determinístico da entidade atual."
        );
      } else if (result.status === "CONTEXT_MISMATCH_BLOCKED" || !idCheck.valid) {
        setErrorState(
          "Divergência de contexto detectada e bloqueada; exibindo diagnóstico determinístico isolado desta entidade."
        );
      }

      setRagSources(result.ragCitations || []);
      setResponseOrigin(result.responseOrigin);
      setFallbackReason(result.fallbackReason ?? null);
      setResponseLatencyMs(result.latencyMs ?? null);
      setMessages([
        {
          id: `diag_${ctxSnapshot.request_id}`,
          role: "assistant",
          content: safeFinalText,
          created_at: new Date(),
          requestId: ctxSnapshot.request_id,
          contextHash: ctxSnapshot.analysis_context_hash,
        },
      ]);

      if (convId && user && safeFinalText && !isStale() && idCheck.valid) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: convId,
          role: "assistant",
          content: safeFinalText,
          request_id: ctxSnapshot.request_id,
          analysis_context_hash: ctxSnapshot.analysis_context_hash,
          context_snapshot: ctxSnapshot,
          contract_version: ctxSnapshot.contract_version,
          prompt_version: ctxSnapshot.prompt_version,
          rag_citations: result.ragCitations ?? [],
          legacy_status: null,
        });
      }
    } catch (err: any) {
      if (isStale()) return;
      console.error("[VICTORIA_FLOATING_DIAG_ERR]", err);
      const fallback = generateSeniorStructuredAnalysis(ctxSnapshot);
      setResponseOrigin("deterministic_fallback");
      setFallbackReason(err?.message || "Erro na chamada diagnóstica.");
      setMessages([
        {
          id: `diag_fallback_${ctxSnapshot.request_id}`,
          role: "assistant",
          content: fallback,
          created_at: new Date(),
          requestId: ctxSnapshot.request_id,
          contextHash: ctxSnapshot.analysis_context_hash,
        },
      ]);
      setErrorState("Modo de contingência estruturado ativado.");
    } finally {
      if (!isStale()) {
        setIsLoading(false);
      }
    }
  };

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const seq = activeFlowSeqRef.current;
    const isStale = () => activeFlowSeqRef.current !== seq;

    setInput("");
    setErrorState(null);
    const ctxSnapshot: VictoriaAnalysisContext = {
      ...activeContext,
      operational_mode: "READ_ONLY_ANALYSIS",
      conversation_id: conversationId,
      request_id: `vreq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    };

    const userMsgId = crypto.randomUUID();
    const newMsg: ChatMsg = {
      id: userMsgId,
      role: "user",
      content: text,
      created_at: new Date(),
      requestId: ctxSnapshot.request_id,
      contextHash: ctxSnapshot.analysis_context_hash,
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (isStale()) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (isStale()) return;

      const token = session?.access_token || null;

      if (conversationId && user) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: conversationId,
          role: "user",
          content: text,
          request_id: ctxSnapshot.request_id,
          analysis_context_hash: ctxSnapshot.analysis_context_hash,
          context_snapshot: ctxSnapshot,
          contract_version: ctxSnapshot.contract_version,
          prompt_version: ctxSnapshot.prompt_version,
          legacy_status: null,
        });
      }

      const conversationHistory = [...messages, newMsg].map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const assistantMsgId = crypto.randomUUID();
      const result = await executeGovernedVictoriaDiagnostic({
        ctx: {
          ...ctxSnapshot,
          user_id: user?.id ?? null,
          conversation_id: conversationId,
        },
        controller: sessionCtrlRef.current,
        endpointUrl: `${EXTERNAL_SUPABASE_URL}/functions/v1/victoria-agent`,
        authToken: token,
        anonKey: EXTERNAL_SUPABASE_ANON_KEY,
        userPrompt: text,
        conversationHistory,
        requireFull10Sections: false,
        onToken: (partialText, validatedCtx) => {
          if (isStale()) return;
          if (!matchesCanonicalContextIdentity(ctxSnapshot, toIdentityPayload(validatedCtx)).valid) return;
          const safeText = sanitizeVictoriaOutputText(partialText, validatedCtx);
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId);
            if (existing) {
              return prev.map((m) =>
                m.id === assistantMsgId ? { ...m, content: safeText } : m
              );
            }
            return [
              ...prev,
              {
                id: assistantMsgId,
                role: "assistant",
                content: safeText,
                created_at: new Date(),
                requestId: validatedCtx.request_id,
                contextHash: validatedCtx.analysis_context_hash,
              },
            ];
          });
        },
      });

      if (isStale() || result.aborted) {
        return;
      }

      const idCheck = matchesCanonicalContextIdentity(ctxSnapshot, toIdentityPayload(result.context));
      const finalSafeText = sanitizeVictoriaOutputText(
        idCheck.valid && result.text
          ? result.text
          : generateSeniorStructuredAnalysis(ctxSnapshot),
        ctxSnapshot
      );

      setResponseOrigin(result.responseOrigin);
      setFallbackReason(result.fallbackReason ?? null);
      setResponseLatencyMs(result.latencyMs ?? null);
      if (result.ragCitations && result.ragCitations.length > 0) {
        setRagSources(result.ragCitations);
      }

      if (result.timedOut) {
        setErrorState(
          "A resposta excedeu o limite de 20s; exibindo diagnóstico estruturado determinístico."
        );
      }

      setMessages((prev) => {
        const existing = prev.find((m) => m.id === assistantMsgId);
        if (existing) {
          return prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: finalSafeText } : m
          );
        }
        return [
          ...prev,
          {
            id: assistantMsgId,
            role: "assistant",
            content: finalSafeText,
            created_at: new Date(),
            requestId: ctxSnapshot.request_id,
            contextHash: ctxSnapshot.analysis_context_hash,
          },
        ];
      });

      if (conversationId && user && !isStale() && idCheck.valid) {
        await supabase.from("victoria_messages" as any).insert({
          conversation_id: conversationId,
          role: "assistant",
          content: finalSafeText,
          request_id: ctxSnapshot.request_id,
          analysis_context_hash: ctxSnapshot.analysis_context_hash,
          context_snapshot: ctxSnapshot,
          contract_version: ctxSnapshot.contract_version,
          prompt_version: ctxSnapshot.prompt_version,
          rag_citations: result.ragCitations ?? [],
          legacy_status: null,
        });
      }

      if (isMinimized) {
        setHasUnread(true);
      }
    } catch (err: any) {
      if (isStale()) return;
      setErrorState("Falha temporária na comunicação com a Victoria AI.");
      toast.error("Erro na comunicação com a Victoria AI.");
    } finally {
      if (!isStale()) {
        setIsLoading(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
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

  const confidenceBadgeColor =
    activeContext.confidence_level === "alta"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : activeContext.confidence_level === "media"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-orange-500/15 text-orange-300 border-orange-500/30";

  return (
    <>
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
            <div className="absolute right-16 top-1/2 -translate-y-1/2 bg-card border border-primary/30 px-3 py-1.5 rounded-xl shadow-xl text-xs font-bold text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none hidden sm:block">
              💬 Victoria AI · {activeContext.entity_name}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-16 sm:bottom-5 right-2 sm:right-5 z-50 w-[calc(100vw-1rem)] sm:w-[460px] md:w-[500px] h-[620px] max-h-[88vh] rounded-3xl border border-primary/30 bg-background/95 backdrop-blur-2xl shadow-[0_12px_50px_rgba(0,0,0,0.6)] flex flex-col overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-primary via-rose-500 to-amber-500" />

            {/* HEADER DO CHAT */}
            <div className="px-4 py-3 border-b border-white/10 bg-card/60 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Bot className="h-5 w-5 text-primary" />
                  <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h3 className="text-xs font-black uppercase tracking-wider text-foreground truncate">
                      Victoria AI
                    </h3>
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.2 text-[8px] font-black uppercase text-primary border border-primary/20">
                      Contrato v{activeContext.contract_version} · {VICTORIA_BUILD_TAG}
                    </span>
                    <span className="rounded-full bg-sky-500/10 px-1.5 py-0.2 text-[8px] font-black uppercase text-sky-300 border border-sky-500/20">
                      Somente Leitura
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase border ${confidenceBadgeColor}`}
                      title={activeContext.confidence_justification}
                    >
                      Confiança {activeContext.confidence_level}
                    </span>
                  </div>
                  <p
                    className="text-[10px] text-muted-foreground truncate"
                    title={`${activeContext.entity_name} (${activeContext.entity_id})`}
                  >
                    {activeContext.entity_name} ·{" "}
                    <span className="font-mono text-[9px] opacity-75">
                      {activeContext.period.date_from === activeContext.period.date_to
                        ? activeContext.period.date_from
                        : `${activeContext.period.date_from} a ${activeContext.period.date_to}`}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => {
                    sessionCtrlRef.current.clearCache();
                    void initiateDiagnosis(activeContext, undefined, { reuseConversation: true });
                  }}
                  disabled={isLoading}
                  className="h-8 w-8 rounded-xl hover:bg-white/10 text-muted-foreground hover:text-primary transition-all flex items-center justify-center"
                  title="Regerar diagnóstico desta entidade"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
                </button>
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

            {/* TELEMETRIA RÁPIDA COM UNIDADE DINÂMICA (NUNCA CPL FIXO EM ALCANCE) */}
            <div className="px-3 py-1.5 bg-white/[0.02] border-b border-white/5 flex items-center justify-between text-[10px] font-mono text-muted-foreground shrink-0 overflow-x-auto scrollbar-none gap-3">
              <div className="flex items-center gap-1 whitespace-nowrap">
                <DollarSign className="h-3 w-3 text-red-400" />
                <span>R$ {activeContext.financial.spend.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-1 whitespace-nowrap" title={activeContext.result_indicator.label_plural}>
                <MessageCircle className="h-3 w-3 text-blue-400" />
                <span>
                  {activeContext.raw_metrics.result_value.toLocaleString("pt-BR")}{" "}
                  {activeContext.result_indicator.short_badge}
                </span>
              </div>
              <div className="flex items-center gap-1 whitespace-nowrap" title={activeContext.result_indicator.cost_label}>
                <Activity className="h-3 w-3 text-emerald-400" />
                <span>
                  {activeContext.result_indicator.cost_label}:{" "}
                  {activeContext.raw_metrics.cost_per_result_formatted}
                </span>
              </div>
              <div className="flex items-center gap-1 whitespace-nowrap">
                <TrendingUp className="h-3 w-3 text-amber-400" />
                <span>CTR Link {activeContext.raw_metrics.ctr_link.toFixed(2)}%</span>
                {activeContext.raw_metrics.ctr_all > 0 && (
                  <>
                    <span>·</span>
                    <span>CTR Todos {activeContext.raw_metrics.ctr_all.toFixed(2)}%</span>
                  </>
                )}
                {activeContext.raw_metrics.cpc_link !== null && (
                  <>
                    <span>·</span>
                    <span>CPC Link R$ {activeContext.raw_metrics.cpc_link.toFixed(2)}</span>
                  </>
                )}
                {activeContext.raw_metrics.cpc_all !== null && (
                  <>
                    <span>·</span>
                    <span>CPC Todos R$ {activeContext.raw_metrics.cpc_all.toFixed(2)}</span>
                  </>
                )}
              </div>
            </div>

            {/* BARRA DE TRANSPARÊNCIA: VER DADOS USADOS & POR QUE ESTA RECOMENDAÇÃO */}
            <div className="px-3 py-1.5 bg-card/40 border-b border-white/5 flex items-center justify-between gap-2 text-[9px] shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowDataUsed((v) => !v);
                    setShowWhyRec(false);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10 transition"
                >
                  <Database className="h-2.5 w-2.5 text-primary" />
                  <span>Ver dados usados</span>
                  {showDataUsed ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowWhyRec((v) => !v);
                    setShowDataUsed(false);
                  }}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground border border-white/10 transition"
                >
                  <HelpCircle className="h-2.5 w-2.5 text-amber-400" />
                  <span>Por que esta recomendação?</span>
                  {showWhyRec ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                {responseOrigin && (
                  <span
                    className={`rounded px-1.5 py-0.5 font-mono text-[8px] font-bold border ${
                      responseOrigin === "generative"
                        ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                        : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    }`}
                    title={fallbackReason || undefined}
                  >
                    {responseOrigin === "generative" ? "⚡ IA" : "🛡️ Fallback"}
                    {responseLatencyMs ? ` ${(responseLatencyMs / 1000).toFixed(1)}s` : ""}
                  </span>
                )}
                {ragSources.length > 0 && (
                  <span className="rounded px-1.5 py-0.5 font-mono text-[8px] font-bold bg-violet-500/10 text-violet-300 border border-violet-500/30">
                    📚 {ragSources.length}
                  </span>
                )}
                <span className="font-mono text-[8px] text-muted-foreground/60 truncate">
                  {activeContext.analysis_context_hash}
                </span>
              </div>
            </div>

            {/* PAINEL EXPANSÍVEL: DADOS USADOS */}
            {showDataUsed && (
              <div className="px-3 py-2.5 bg-zinc-950/90 border-b border-white/10 text-[10px] font-mono space-y-1 max-h-40 overflow-y-auto shrink-0">
                <div className="flex items-center justify-between text-primary font-bold">
                  <span>Contrato VictoriaAnalysisContext ({activeContext.contract_version})</span>
                  <span>Fonte: {activeContext.result_indicator.source}</span>
                </div>
                <p className="text-muted-foreground">
                  Entidade: <strong className="text-foreground">{activeContext.entity_name}</strong> ({activeContext.entity_id}) · Nível: {activeContext.entity_level}
                </p>
                <p className="text-muted-foreground">
                  Objetivo Oficial: <strong className="text-foreground">{activeContext.optimization.odax_objective}</strong> · Evento: {activeContext.optimization.official_result_event}
                </p>
                <p className="text-muted-foreground">
                  Métricas Brutas: Spend R$ {activeContext.financial.spend.toFixed(2)} | Impr: {activeContext.raw_metrics.impressions.toLocaleString("pt-BR")} | Reach: {activeContext.raw_metrics.reach.toLocaleString("pt-BR")} | CTR Link: {activeContext.raw_metrics.ctr_link.toFixed(2)}% | CTR Todos: {activeContext.raw_metrics.ctr_all.toFixed(2)}% | CPC Link: {activeContext.raw_metrics.link_clicks > 0 ? `R$ ${activeContext.raw_metrics.cpc_link.toFixed(2)}` : "N/A"} | CPC Todos: {activeContext.raw_metrics.all_clicks > 0 ? `R$ ${activeContext.raw_metrics.cpc_all.toFixed(2)}` : "N/A"} | Link Clicks: {activeContext.raw_metrics.link_clicks} | All Clicks: {activeContext.raw_metrics.all_clicks} | CPM: R$ {activeContext.raw_metrics.cpm.toFixed(2)}
                </p>
                <p className="text-muted-foreground">
                  Snapshot Sync: {activeContext.period.last_sync_at || "N/A"} ({activeContext.period.data_freshness}) · Origem: {responseOrigin === "generative" ? "Resposta Generativa (IA)" : responseOrigin === "deterministic_fallback" ? `Fallback Estruturado Determinístico${fallbackReason ? ` (${fallbackReason})` : ""}` : "Carregando..."}
                </p>
                <p className="text-muted-foreground">
                  Campos ausentes: {activeContext.missing_fields.join(", ") || "Nenhum"}
                </p>
                <p className="text-muted-foreground">
                  Fontes RAG ({ragSources.length}):{" "}
                  {ragSources.length > 0
                    ? ragSources.map((r) => `${r.title} [v${r.version} · ${r.evidence_level}]`).join(" | ")
                    : "Base normativa padrão do contrato"}
                </p>
              </div>
            )}

            {/* PAINEL EXPANSÍVEL: POR QUE ESTA RECOMENDAÇÃO */}
            {showWhyRec && (
              <div className="px-3 py-2.5 bg-zinc-950/90 border-b border-white/10 text-[10px] space-y-1 max-h-40 overflow-y-auto shrink-0">
                <div className="flex items-center gap-1.5 text-amber-400 font-bold">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  <span>Governança & Calibração de Evidência ({activeContext.confidence_level.toUpperCase()})</span>
                </div>
                <p className="text-muted-foreground leading-relaxed">
                  {activeContext.confidence_justification}
                </p>
                <p className="text-muted-foreground leading-relaxed">
                  <strong>Isolamento de Unidade:</strong> Esta análise utiliza estritamente <code>{activeContext.result_indicator.cost_label}</code> (<code>{activeContext.result_indicator.unit}</code>) e bloqueia comparações cruzadas com métricas de outros objetivos.
                </p>
              </div>
            )}

            {/* BANNER DE AVISO / RETRY EM CASO DE TIMEOUT */}
            {errorState && (
              <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-[10px] text-amber-300 shrink-0">
                <div className="flex items-center gap-1.5 truncate">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{errorState}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void initiateDiagnosis(activeContext, undefined, { reuseConversation: true })}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-bold shrink-0"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* CORPO DE MENSAGENS */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-thin text-xs">
              {messages.length === 0 && isLoading && (
                <div className="flex flex-col items-center justify-center h-full gap-3 py-12 text-center">
                  <div className="relative h-12 w-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-xs">
                      Victoria está auditando {activeContext.entity_name}...
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Validando {activeContext.result_indicator.cost_label}, entrega e limitações de amostra
                    </p>
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
                      className={`rounded-2xl p-3.5 max-w-[88%] leading-relaxed ${
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
                      <span
                        className={`block text-[8px] font-mono mt-1.5 opacity-40 ${
                          isAssistant ? "text-left" : "text-right"
                        }`}
                      >
                        {new Date(m.created_at).toLocaleTimeString("pt-BR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                        {m.contextHash ? ` · ${m.contextHash}` : ""}
                      </span>
                    </div>
                  </motion.div>
                );
              })}

              {isLoading && messages.length > 0 && (
                <div className="flex items-center gap-2 text-muted-foreground text-[10px] font-mono">
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>Victoria validando contexto...</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* CHIPS DE PERGUNTAS SUGERIDAS ALINHADAS AO OBJETIVO */}
            {messages.length <= 2 && (
              <div className="px-3 py-1.5 bg-card/40 border-t border-white/5 flex gap-1.5 overflow-x-auto scrollbar-none shrink-0">
                {suggestedQuestions.map((prompt, idx) => (
                  <button
                    key={`${activeContext.analysis_context_hash}_q_${idx}`}
                    onClick={() => void handleSend(prompt)}
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
              onSubmit={(e) => {
                e.preventDefault();
                void handleSend();
              }}
              className="p-3 border-t border-white/10 bg-card/80 flex items-center gap-2 shrink-0"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={`Perguntar sobre ${activeContext.entity_name}...`}
                disabled={isLoading}
                className="flex-1 bg-background/60 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="h-9 w-9 rounded-xl bg-primary text-background flex items-center justify-center hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
