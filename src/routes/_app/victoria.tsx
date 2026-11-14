import { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { 
  Bot, Send, Paperclip, X, Trash2, Pin, Plus, Search, 
  Loader2, User, Sparkles, TrendingUp, BarChart3, MessageSquare, 
  ShieldAlert, Settings, ArrowLeft, ArrowUpRight, Check, Play,
  BookOpen, FolderClosed, Zap, Share2, Mic, MicOff, UploadCloud, FileText, Database,
  Pencil, Radio, Target, ExternalLink, Brain, RefreshCw, ArrowDown,
  CheckSquare, Square, Sliders, Cpu, Lock, ShieldCheck, Layers,
  Scale, Filter, ChevronDown, ChevronUp, MapPin, Clock
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "@/hooks/usePagePermission";
import { supabase } from "@/integrations/supabase-external/client";
import { useVictoriaChat, type Message, type Conversation, type KnowledgeItem } from "@/hooks/useVictoriaChat";
import { formatArticleDate } from "@/lib/market.functions";
import {
  MARKET_PORTALS,
  PORTAL_CATEGORY_LABELS,
  RADAR_TIME_OPTIONS,
  RADAR_REGION_OPTIONS,
  type PortalCategory,
} from "@/lib/marketPortals";
import { ActionCard } from "@/components/victoria/ActionCard";
import { SnapshotStatusBadge } from "@/components/SnapshotStatusBadge";
import { useActiveMetaSnapshot } from "@/lib/metaSnapshotCache";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/victoria")({
  head: () => ({ meta: [{ title: "Victoria AI — NC Performance Suite" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: string; account?: string } => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    account: typeof search.account === "string" ? search.account : undefined,
  }),
  component: VictoriaHubPage,
});

function VictoriaHubPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>(() => {
    return localStorage.getItem("nc_victoria_selected_account_id") || "";
  });
  
  const [searchTerm, setSearchTerm] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedImage, setSelectedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1024 : true
  );
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");

  const search = Route.useSearch();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, hasAccess, canEdit } = usePagePermission();
  const canManageVictoriaMind = isAdmin || hasAccess("gestao_victoria") || canEdit("gestao_victoria");

  const [isVictoriaMindOpen, setIsVictoriaMindOpen] = useState<boolean>(() => {
    return search.tab === "mente" || search.tab === "radar" || search.tab === "conhecimento" || search.tab === "calibracao";
  });
  const [mindSubTab, setMindSubTab] = useState<"radar" | "conhecimento" | "calibracao">(() => {
    if (search.tab === "conhecimento") return "conhecimento";
    if (search.tab === "calibracao") return "calibracao";
    return "radar";
  });
  const [isPortalChecklistOpen, setIsPortalChecklistOpen] = useState(false);

  // Sincronizar se o query param da rota mudar
  useEffect(() => {
    if (search.tab === "mente" || search.tab === "radar") {
      setIsVictoriaMindOpen(true);
      setMindSubTab("radar");
    } else if (search.tab === "conhecimento") {
      setIsVictoriaMindOpen(true);
      setMindSubTab("conhecimento");
    } else if (search.tab === "calibracao") {
      setIsVictoriaMindOpen(true);
      setMindSubTab("calibracao");
    }
  }, [search.tab]);

  // Estados da Calibração Neural (transferidos da página de Configurações)
  const [modelName, setModelName] = useState("gemini-2.5-flash");
  const [temperature, setTemperature] = useState(0.7);
  const [ragThreshold, setRagThreshold] = useState(0.70);
  const [ragCount, setRagCount] = useState(5);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [savingNeuralConfig, setSavingNeuralConfig] = useState(false);

  // Carregar configurações de IA do Supabase
  const { data: aiConfig, isLoading: loadingAiConfig } = useQuery({
    queryKey: ["victoria_config_user", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from("victoria_configs")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) {
        console.warn("Aviso ao carregar configs da Victoria:", error);
        return null;
      }
      return data;
    },
    enabled: !!user?.id,
  });

  useEffect(() => {
    if (aiConfig) {
      if (aiConfig.model_name) setModelName(aiConfig.model_name);
      if (aiConfig.temperature !== undefined && aiConfig.temperature !== null) setTemperature(Number(aiConfig.temperature));
      if (aiConfig.rag_threshold !== undefined && aiConfig.rag_threshold !== null) setRagThreshold(Number(aiConfig.rag_threshold));
      if (aiConfig.rag_count !== undefined && aiConfig.rag_count !== null) setRagCount(Number(aiConfig.rag_count));
      if (aiConfig.system_prompt !== undefined && aiConfig.system_prompt !== null) setSystemPrompt(aiConfig.system_prompt);
    }
  }, [aiConfig]);

  // Salvar calibração neural
  const handleSaveNeuralConfig = async () => {
    if (!user?.id) return;
    setSavingNeuralConfig(true);
    try {
      const { error } = await (supabase as any)
        .from("victoria_configs")
        .upsert({
          user_id: user.id,
          model_name: modelName,
          temperature,
          rag_threshold: ragThreshold,
          rag_count: ragCount,
          system_prompt: systemPrompt,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });

      if (error) throw error;
      toast.success("🧠 Calibração Neural salva! Parâmetros da Victoria AI atualizados.");
      qc.invalidateQueries({ queryKey: ["victoria_config_user", user?.id] });
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao salvar calibração neural da Victoria.");
    } finally {
      setSavingNeuralConfig(false);
    }
  };

  // Estados de Nova Base de Conhecimento
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState("");
  const [newKnowledgeContent, setNewKnowledgeContent] = useState("");
  const [newKnowledgeCategory, setNewKnowledgeCategory] = useState<'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom'>("inventory");
  const [knowledgeSearchTerm, setKnowledgeSearchTerm] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [extractingFile, setExtractingFile] = useState(false);
  const [seedingKnowledge, setSeedingKnowledge] = useState(false);

  // Estados do Radar de Mercado (Seleção Múltipla e Exclusão Acumulativa)
  const [selectedArticleIds, setSelectedArticleIds] = useState<Set<string>>(new Set());

  // Estados de Edição de Documento Treinado (RAG)
  const [editingDoc, setEditingDoc] = useState<KnowledgeItem | null>(null);
  const [editDocTitle, setEditDocTitle] = useState("");
  const [editDocCategory, setEditDocCategory] = useState<KnowledgeItem['category']>("strategy");
  const [editDocContent, setEditDocContent] = useState("");
  const [savingDocEdit, setSavingDocEdit] = useState(false);

  // Estados de Entrada por Voz
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const { data: userProfile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const userName = useMemo(() => {
    const raw = userProfile?.full_name || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "";
    const first = raw.trim().split(" ")[0];
    return first ? first.charAt(0).toUpperCase() + first.slice(1) : "Parceiro";
  }, [userProfile, user]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const isAutoScrollEnabled = useRef(true);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Hook customizado com lógica e persistência de conversas
  const chat = useVictoriaChat(selectedAccountId, setSelectedAccountId, userName);
  const activeSnapshot = useActiveMetaSnapshot({ accountId: selectedAccountId || "all" });

  // Buscar contas de anúncio para o dropdown
  const { data: accounts = [], isFetching: isFetchingAccounts } = useQuery({
    queryKey: ["ad-accounts-victoria", activeSnapshot.snapshotId],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("id, name").order("name");
      return data || [];
    }
  });

  // Salvar conta selecionada no localStorage
  const handleSelectAccount = (id: string) => {
    setSelectedAccountId(id);
    localStorage.setItem("nc_victoria_selected_account_id", id);
    toast.success(`Foco travado na conta selecionada!`);
  };

  // Controle inteligente de rolagem: permite ao usuário rolar para cima livremente sem travar
  const handleChatScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Se o usuário estiver a menos de 100px do fundo, acompanha o streaming
    const nearBottom = distanceFromBottom < 100;
    isAutoScrollEnabled.current = nearBottom;
    setShowScrollBottomBtn(!nearBottom);
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior,
      });
    } else {
      chatEndRef.current?.scrollIntoView({ behavior });
    }
  };

  // Quando troca de conversa: rola suave para o final e reativa auto-scroll
  useEffect(() => {
    isAutoScrollEnabled.current = true;
    setShowScrollBottomBtn(false);
    scrollToBottom("smooth");
  }, [chat.activeConversationId]);

  // Durante a digitação/streaming da Victoria:
  useEffect(() => {
    // SÓ rola para baixo se o usuário NÃO tiver rolado para cima manualmente!
    if (isAutoScrollEnabled.current && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chat.messages, chat.isTyping]);

  // Upload de Imagem
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione apenas arquivos de imagem.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(",")[1];
      setSelectedImage({
        base64: base64String,
        mimeType: file.type
      });
      toast.success("Imagem carregada com sucesso.");
    };
    reader.readAsDataURL(file);
  };

  // Enviar Mensagem
  const handleSend = async () => {
    if ((!prompt.trim() && !selectedImage) || chat.isTyping) return;

    isAutoScrollEnabled.current = true;
    setShowScrollBottomBtn(false);
    scrollToBottom("smooth");

    const currentPrompt = prompt;
    const currentImage = selectedImage;

    setPrompt("");
    setSelectedImage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";

    await chat.sendMessage(currentPrompt, currentImage || undefined);
  };

  // Iniciar edição de título
  const startEditing = (c: Conversation) => {
    setEditingConversationId(c.id);
    setEditingTitle(c.title);
  };

  // Salvar novo título
  const saveTitle = async (id: string) => {
    if (editingTitle.trim() && editingTitle !== chat.conversations.find(c => c.id === id)?.title) {
      await chat.renameConversation(id, editingTitle);
      toast.success("Conversa renomeada!");
    }
    setEditingConversationId(null);
  };

  // Filtrar conversas por termo de busca
  const filteredConversations = useMemo(() => {
    return chat.conversations.filter(c =>
      c.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [chat.conversations, searchTerm]);

  // Agrupar conversas por data
  const groupedConversations = useMemo(() => {
    const groups: { [key: string]: Conversation[] } = {
      "Fixadas": [],
      "Hoje": [],
      "Ontem": [],
      "Anteriores": []
    };

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    filteredConversations.forEach(c => {
      if (c.pinned) {
        groups["Fixadas"].push(c);
        return;
      }
      
      const date = new Date(c.created_at);
      const cDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      if (cDate.getTime() === today.getTime()) {
        groups["Hoje"].push(c);
      } else if (cDate.getTime() === yesterday.getTime()) {
        groups["Ontem"].push(c);
      } else {
        groups["Anteriores"].push(c);
      }
    });

    return Object.entries(groups).filter(([_, list]) => list.length > 0);
  }, [filteredConversations]);

  // Filtrar base de conhecimento
  const filteredKnowledgeList = useMemo(() => {
    return chat.knowledgeList.filter(k => 
      k.title.toLowerCase().includes(knowledgeSearchTerm.toLowerCase()) ||
      k.content.toLowerCase().includes(knowledgeSearchTerm.toLowerCase())
    );
  }, [chat.knowledgeList, knowledgeSearchTerm]);

  // Cadastrar conhecimento na base
  const handleSaveKnowledge = async () => {
    if (!newKnowledgeTitle.trim() || !newKnowledgeContent.trim()) {
      toast.error("Por favor, preencha o título e o conteúdo do documento.");
      return;
    }

    setSavingKnowledge(true);
    const success = await chat.addKnowledge(newKnowledgeTitle, newKnowledgeContent, newKnowledgeCategory);
    setSavingKnowledge(false);

    if (success) {
      setNewKnowledgeTitle("");
      setNewKnowledgeContent("");
      if (docInputRef.current) docInputRef.current.value = "";
    }
  };

  // Importar base de conhecimento NC Performance com 1 clique
  const handleSeedKnowledge = async () => {
    setSeedingKnowledge(true);
    const toastId = toast.loading("Importando documento 1/12...");
    const result = await chat.seedDefaultKnowledge((current, total) => {
      toast.loading(`Importando documento ${current}/${total}...`, { id: toastId });
    });
    toast.dismiss(toastId);
    if (result.success) {
      toast.success(`${result.created} documentos NC Performance importados!`);
    } else {
      toast.error("Nenhum documento pôde ser importado. Verifique a conexão.");
    }
    setSeedingKnowledge(false);
  };

  // Funções do Radar de Mercado (Seleção Múltipla & Exclusão Acumulativa)
  const toggleSelectArticle = (id: string) => {
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllArticles = () => {
    if (selectedArticleIds.size === chat.marketArticles.length && chat.marketArticles.length > 0) {
      setSelectedArticleIds(new Set());
    } else {
      setSelectedArticleIds(new Set(chat.marketArticles.map(a => a.id)));
    }
  };

  const handleDeleteSelectedArticles = () => {
    if (selectedArticleIds.size === 0) return;
    chat.deleteMarketArticles(Array.from(selectedArticleIds));
    setSelectedArticleIds(new Set());
  };

  const handleAbsorbSelectedArticles = async () => {
    const targetArticles = selectedArticleIds.size > 0
      ? chat.marketArticles.filter(a => selectedArticleIds.has(a.id))
      : chat.marketArticles;

    if (targetArticles.length === 0) {
      toast.error("Nenhum artigo selecionado para absorver no RAG.");
      return;
    }

    const success = await chat.learnMarketIntel(targetArticles);
    if (success) {
      setSelectedArticleIds(new Set());
    }
  };

  // Funções de Edição de Documento Treinado (RAG)
  const handleOpenEditDoc = (doc: KnowledgeItem) => {
    setEditingDoc(doc);
    setEditDocTitle(doc.title);
    setEditDocCategory(doc.category);
    setEditDocContent(doc.content);
  };

  const handleSaveEditDoc = async () => {
    if (!editingDoc || !editDocTitle.trim() || !editDocContent.trim()) {
      toast.error("Por favor, preencha o título e o conteúdo do documento.");
      return;
    }

    setSavingDocEdit(true);
    const ok = await chat.updateKnowledge(
      editingDoc.id,
      editDocTitle.trim(),
      editDocCategory,
      editDocContent.trim()
    );
    setSavingDocEdit(false);

    if (ok) {
      setEditingDoc(null);
    }
  };

  // Extrair texto de documentos (PDF, TXT, MD) localmente no navegador
  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExtractingFile(true);
    const toastId = toast.loading("Extraindo texto do documento...");

    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      
      if (extension === "txt" || extension === "md") {
        const reader = new FileReader();
        reader.onload = (event) => {
          setNewKnowledgeContent(event.target?.result as string);
          setNewKnowledgeTitle(file.name.replace(/\.[^/.]+$/, ""));
          toast.success("Texto extraído com sucesso!", { id: toastId });
          setExtractingFile(false);
        };
        reader.readAsText(file);
      } else if (extension === "pdf") {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const typedarray = new Uint8Array(reader.result as ArrayBuffer);
            
            // Carrega pdfjs dinamicamente se necessário
            if (!(window as any).pdfjsLib) {
              const script = document.createElement("script");
              script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js";
              document.head.appendChild(script);
              await new Promise((resolveScript) => {
                script.onload = () => {
                  (window as any).pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
                  resolveScript(true);
                };
              });
            }
            
            const pdfjsLib = (window as any).pdfjsLib;
            const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
            let fullText = "";
            
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              const pageText = textContent.items.map((item: any) => item.str).join(" ");
              fullText += pageText + "\n";
            }

            if (!fullText.trim()) {
              throw new Error("Não encontramos texto legível no arquivo PDF.");
            }
            
            setNewKnowledgeContent(fullText);
            setNewKnowledgeTitle(file.name.replace(/\.[^/.]+$/, ""));
            toast.success("Texto do PDF extraído com sucesso!", { id: toastId });
          } catch (pdfErr: any) {
            console.error(pdfErr);
            toast.error("Falha ao ler PDF: " + pdfErr.message, { id: toastId });
          } finally {
            setExtractingFile(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } else {
        toast.error("Formato não suportado. Use TXT, MD ou PDF.", { id: toastId });
        setExtractingFile(false);
      }
    } catch (err: any) {
      console.error(err);
      toast.error("Erro no processamento: " + err.message, { id: toastId });
      setExtractingFile(false);
    }
  };

  // Entrada de Voz (Web Speech API)
  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast.error("O reconhecimento de voz não é suportado pelo seu navegador.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
      toast.success("Ouvindo... Fale agora.");
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(prev => prev ? prev + " " + transcript : transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Erro no reconhecimento de voz:", event.error);
      setIsListening(false);
      toast.error("Erro na escuta: " + event.error);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Ações Rápidas (Chips de quick-action)
  const quickActions = [
    {
      title: "Diagnóstico de Saúde",
      description: "Como está a saúde das minhas campanhas ativas?",
      prompt: "Como está a saúde geral das minhas campanhas de anúncios ativas nos últimos 7 dias? Destaque o CPL e se há algum criativo saturando.",
      icon: TrendingUp,
      type: "analysis"
    },
    {
      title: "Relatório Executivo",
      description: "Monte um relatório detalhado da semana",
      prompt: "Gere um relatório executivo de performance consolidado para esta conta. Quero KPI de leads, investimento e recomendações táticas.",
      icon: BarChart3,
      type: "analysis"
    },
    {
      title: "Lançar Novo Funil",
      description: "Crie um funil de Test Drive para Civic",
      prompt: "Prepare e proponha a estrutura de um novo funil de conversão focado em 'Test Drive do Civic'. Agende posts e estruture as etapas de WhatsApp.",
      icon: Zap,
      type: "action"
    },
    {
      title: "Auditoria de Nós do Funil",
      description: "Analise e otimize gargalos do funil ativo",
      prompt: "Analise a estrutura dos nossos funis ativos no banco de dados e me mostre quais etapas/nós estão com taxas de conversão críticas.",
      icon: Settings,
      type: "action"
    }
  ];

  return (
    <div className="relative flex h-[calc(100dvh-124px)] lg:h-[calc(100vh-64px)] w-full max-w-full overflow-hidden bg-background">
      {/* 1. SIDEBAR DE CONVERSAS (Drawer no Mobile, Estático no Desktop lg+) */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 280, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="fixed inset-y-0 left-0 z-40 lg:static lg:z-20 flex flex-col h-full bg-card lg:bg-card/40 border-r border-border/60 shrink-0 shadow-2xl lg:shadow-none backdrop-blur-md"
            >
              {/* Cabeçalho do Sidebar */}
              <div className="p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between lg:hidden pb-1 border-b border-border/40">
                  <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    Histórico & Mente IA
                  </span>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    setIsVictoriaMindOpen(false);
                    chat.setActiveConversationId(null);
                    if (typeof window !== "undefined" && window.innerWidth < 1024) {
                      setSidebarOpen(false);
                    }
                  }}
                  className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-all font-bold text-xs uppercase tracking-wider active:scale-[0.98]"
                >
                  <Plus className="h-4 w-4" />
                  Nova Conversa
                </button>

                {/* Botão Unificado: Central Neural / Mente da Victoria AI */}
                {canManageVictoriaMind && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsVictoriaMindOpen(true);
                      chat.setActiveConversationId(null);
                      if (chat.marketArticles.length === 0) {
                        chat.fetchMarketIntel(false);
                      }
                      if (typeof window !== "undefined" && window.innerWidth < 1024) {
                        setSidebarOpen(false);
                      }
                    }}
                    className={`flex items-center justify-between gap-2.5 w-full py-2.5 px-3 rounded-xl border transition-all font-bold text-xs uppercase tracking-wider active:scale-[0.98] ${
                      isVictoriaMindOpen 
                        ? "bg-gradient-to-r from-primary/20 via-primary/10 to-transparent border-primary/50 text-foreground shadow-glow-sm" 
                        : "bg-input/20 border-border/50 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground hover:border-primary/30"
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Brain className="h-4 w-4 text-primary shrink-0 animate-pulse" />
                      <span className="truncate">Mente da Victoria AI</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-primary/20 text-primary border border-primary/30">
                        GESTAO
                      </span>
                    </div>
                  </button>
                )}

              {/* Input de Busca */}
              <div className="relative flex items-center mt-1">
                <Search className="absolute left-3 h-3.5 w-3.5 text-muted-foreground/50" />
                <input
                  type="text"
                  placeholder="Pesquisar chats..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-input/30 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all text-foreground placeholder:text-muted-foreground/45"
                />
              </div>
            </div>

            {/* Lista de Conversas com Scroll */}
            <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-4 custom-scrollbar">
              {chat.loadingConversations ? (
                <div className="flex items-center justify-center py-8 gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando chats...
                </div>
              ) : chat.conversations.length === 0 ? (
                <div className="text-center py-12 text-[10px] text-muted-foreground/60 uppercase tracking-widest leading-relaxed">
                  Nenhuma conversa encontrada.
                </div>
              ) : (
                groupedConversations.map(([groupName, list]) => (
                  <div key={groupName} className="flex flex-col gap-1">
                    <span className="px-3 text-[9px] font-black uppercase tracking-wider text-muted-foreground/40">{groupName}</span>
                    {list.map((c) => {
                      const isActive = !isVictoriaMindOpen && chat.activeConversationId === c.id;
                      const isEditing = editingConversationId === c.id;

                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (!isEditing) {
                              setIsVictoriaMindOpen(false);
                              chat.setActiveConversationId(c.id);
                              if (typeof window !== "undefined" && window.innerWidth < 1024) {
                                setSidebarOpen(false);
                              }
                            }
                          }}
                          onDoubleClick={() => startEditing(c)}
                          className={`group relative flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-200 cursor-pointer ${
                            isActive
                              ? "bg-primary/10 border border-primary/20 text-foreground font-bold"
                              : "hover:bg-white/[0.02] border border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <MessageSquare className={`h-3.5 w-3.5 shrink-0 ${isActive ? "text-primary" : "text-muted-foreground/60"}`} />
                            {isEditing ? (
                              <input
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => saveTitle(c.id)}
                                onKeyDown={(e) => e.key === "Enter" && saveTitle(c.id)}
                                autoFocus
                                className="bg-background/80 border border-primary/30 rounded px-1.5 py-0.5 text-xs text-foreground focus:outline-none w-full font-normal"
                              />
                            ) : (
                              <span className="truncate pr-4">{c.title}</span>
                            )}
                          </div>

                          {/* Ações Rápidas no Hover */}
                          {!isEditing && (
                            <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1 absolute right-2 bg-gradient-to-l from-card/90 via-card/80 to-transparent pl-3 py-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  chat.togglePinConversation(c.id, c.pinned);
                                }}
                                className={`p-1 rounded-md border border-transparent hover:border-border hover:bg-background/80 transition-colors ${
                                  c.pinned ? "text-primary" : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <Pin className="h-3 w-3 fill-current" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  chat.deleteConversation(c.id);
                                }}
                                className="p-1 rounded-md border border-transparent hover:border-red-500/20 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Rodapé do Sidebar */}
            <div className="p-4 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
              <span className="label-mono flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                Victoria AI v2.7
              </span>
              <span>NC Performance</span>
            </div>
          </motion.aside>
        </>
        )}
      </AnimatePresence>

      {/* 2. ÁREA CENTRAL DO CONTEÚDO */}
      <div className="flex-1 min-w-0 flex flex-col h-full bg-background relative z-10 overflow-x-hidden">
        {/* Topo do Painel */}
        <header className="px-3 lg:px-6 py-2.5 lg:py-3 border-b border-border/60 flex items-center justify-between gap-2 shrink-0 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-2 lg:gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-1 lg:-ml-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground shrink-0"
              title={sidebarOpen ? "Ocultar painel" : "Mostrar painel"}
            >
              <ArrowLeft className={`h-4 w-4 transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`} />
            </button>
            <div className="flex items-center gap-2 lg:gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-glow-sm shrink-0">
                <Bot className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[11px] sm:text-xs font-black text-foreground uppercase tracking-tight truncate">
                  {isVictoriaMindOpen
                    ? "Central Neural — Mente & Conhecimento IA"
                    : "Victoria AI"}
                </h2>
                <p className="text-[9px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5 truncate">
                  <span className="h-1 w-1 rounded-full bg-green-500 animate-pulse shrink-0" />
                  <span className="truncate">
                    {isVictoriaMindOpen
                      ? "Inteligência Contínua, RAG e Parâmetros Neurais"
                      : "Estrategista Digital e Mentora Sênior"}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Seletor de Conta de Anúncios */}
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground hidden sm:inline">Foco da IA:</label>
            <select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="bg-card border border-border/80 rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all font-medium max-w-[145px] sm:min-w-[150px] sm:max-w-[220px]"
            >
              <option value="">-- Nenhuma Conta Focada --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </header>

        {isVictoriaMindOpen ? (
          /* ===================================================================
             CENTRAL NEURAL — MENTE OFICIAL DA VICTORIA AI (UNIFICADA)
             =================================================================== */
          !canManageVictoriaMind ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="max-w-md w-full p-8 rounded-2xl bg-card border border-border/80 text-center space-y-4 shadow-xl">
                <div className="h-14 w-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500 mx-auto">
                  <Lock className="h-7 w-7" />
                </div>
                <h3 className="text-base font-black text-foreground uppercase tracking-tight">Acesso Restrito à Mente da Victoria</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Você não possui a permissão de "Mente da Victoria AI" habilitada para gerenciar os parâmetros neurais e a base de conhecimento. Solicite ao administrador da sua agência.
                </p>
                <button
                  type="button"
                  onClick={() => setIsVictoriaMindOpen(false)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs uppercase hover:brightness-110 transition active:scale-95"
                >
                  <ArrowLeft className="h-4 w-4" /> Voltar ao Chat
                </button>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-6 custom-scrollbar max-w-6xl mx-auto w-full space-y-6">
              {/* Cabeçalho da Central Neural */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Mente Oficial do Sistema • Agente Autônomo Ativo</span>
                    <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 uppercase tracking-wider">
                      Autonomia de Diagnóstico Ativa
                    </span>
                  </div>
                  <h1 className="text-xl font-black text-foreground uppercase tracking-tight mt-1.5 flex items-center gap-2.5">
                    <Brain className="h-6 w-6 text-primary" /> Central Neural — Mente & Conhecimento da Victoria AI
                  </h1>
                  <p className="text-xs text-muted-foreground mt-0.5 max-w-3xl leading-relaxed">
                    Mente oficial de todo o ecossistema comandada pela Victoria AI. Rastreamento contínuo de notícias, base de conhecimento RAG para grounding semântico e calibração de parâmetros neurais com autonomia total de intervenção e alteração de diagnósticos.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setIsVictoriaMindOpen(false)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border/70 hover:bg-white/5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all uppercase"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao Chat
                  </button>
                </div>
              </div>

              {/* BARRA DE NAVEGAÇÃO DAS 3 SUB-ABAS */}
              <div className="flex flex-wrap items-center gap-2 bg-card/40 p-1.5 rounded-2xl border border-border/60">
                <button
                  type="button"
                  onClick={() => setMindSubTab("radar")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    mindSubTab === "radar"
                      ? "bg-red-500/20 text-red-400 border-red-500/40 shadow-glow-sm"
                      : "bg-transparent border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Radio className="h-3.5 w-3.5 text-current animate-pulse" />
                  <span>Radar de Mercado & Notícias</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-black/40 text-foreground border border-white/10">
                    {chat.marketArticles.length}/100
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMindSubTab("conhecimento")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    mindSubTab === "conhecimento"
                      ? "bg-amber-500/20 text-amber-400 border-amber-500/40 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                      : "bg-transparent border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Database className="h-3.5 w-3.5 text-current" />
                  <span>Base de Conhecimento & RAG</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-black/40 text-foreground border border-white/10">
                    {chat.knowledgeList.length}/50
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setMindSubTab("calibracao")}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${
                    mindSubTab === "calibracao"
                      ? "bg-primary/20 text-primary border-primary/40 shadow-glow-sm"
                      : "bg-transparent border-transparent text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                  }`}
                >
                  <Sliders className="h-3.5 w-3.5 text-current" />
                  <span>Personalidade & Calibração Neural</span>
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-black/40 text-foreground border border-white/10">
                    {modelName.split("-")[1] || "2.5"}
                  </span>
                </button>
              </div>

              {/* 1. ABA RADAR DE MERCADO */}
              {mindSubTab === "radar" && (
                <div className="space-y-6">
                  {/* CARDS DE DESTAQUE: Benchmark Regional & Custo Zero */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Card 1: Benchmark Regional RJ Ativo */}
                    <div className="md:col-span-2 rounded-2xl border border-primary/25 bg-card/60 backdrop-blur-md p-4 sm:p-5 shadow-lg relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-2xl pointer-events-none" />
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                            <Target className="h-3.5 w-3.5 shrink-0" /> Benchmark Regional Calibrado
                          </span>
                          <h3 className="text-sm sm:text-base font-black text-foreground mt-1">
                            {chat.regionalBenchmark.region} — Meta de CPL WhatsApp: R$ {chat.regionalBenchmark.targetCpl.toFixed(2)}
                          </h3>
                          <p className="text-[11px] text-muted-foreground mt-1 max-w-xl">
                            Victoria analisa 100% das campanhas, Cockpit e Auditoria comparando os custos reais contra este teto de <strong className="text-foreground">R$ {chat.regionalBenchmark.targetCpl.toFixed(2)}</strong>.
                          </p>
                        </div>
                        <div className="text-left sm:text-right shrink-0 flex sm:block items-baseline gap-2 border-t sm:border-t-0 border-border/30 pt-2 sm:pt-0">
                          <span className="text-xl sm:text-2xl font-black text-primary">R$ {chat.regionalBenchmark.targetCpl.toFixed(2)}</span>
                          <p className="text-[9px] font-bold text-muted-foreground uppercase">CPL Alvo WhatsApp</p>
                        </div>
                      </div>

                      {/* Seletores Rápidos de Regiões */}
                      <div className="mt-4 pt-4 border-t border-border/40">
                        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-2">Alterar Região de Referência:</p>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { region: "Rio de Janeiro (RJ)", targetCpl: 5.0, label: "🏖️ RJ (R$ 5,00 - Padrão)", note: "Média real validada no RJ para leads de WhatsApp" },
                            { region: "São Paulo (SP)", targetCpl: 8.5, label: "🏙️ SP Capital/Int (R$ 8,50)", note: "Leilão mais concorrido no Estado de SP" },
                            { region: "Minas Gerais (MG)", targetCpl: 6.0, label: "⛰️ Minas Gerais (R$ 6,00)", note: "Média estadual MG" },
                            { region: "Região Sul", targetCpl: 7.0, label: "🌲 Sul (R$ 7,00)", note: "PR, SC e RS" },
                            { region: "Brasil Geral", targetCpl: 6.5, label: "🇧🇷 Brasil Geral (R$ 6,50)", note: "Média nacional de concessionárias" },
                          ].map(item => (
                            <button
                              key={item.region}
                              type="button"
                              onClick={() => chat.updateRegionalBenchmark({
                                region: item.region,
                                targetCpl: item.targetCpl,
                                platform: "Meta WhatsApp",
                                notes: item.note
                              })}
                              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                                chat.regionalBenchmark.region === item.region
                                  ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                                  : "bg-input/20 border-border/50 text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Card 2: Arquitetura Custo R$ 0,00 */}
                    <div className="rounded-2xl border border-emerald-500/20 bg-card/60 backdrop-blur-md p-5 shadow-lg flex flex-col justify-between">
                      <div>
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5" /> Arquitetura de Custo Zero
                        </span>
                        <h4 className="text-base font-black text-foreground mt-1">Custo: R$ 0,00</h4>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                          Pesquisa pública contínua via Google News RSS sem necessidade de APIs pagas de terceiros.
                        </p>
                      </div>
                      <div className="mt-4 pt-3 border-t border-border/40 text-[10px] text-muted-foreground/80 space-y-1">
                        <div className="flex justify-between">
                          <span>Última Varredura:</span>
                          <span className="font-bold text-foreground">{chat.lastMarketScan ? chat.lastMarketScan.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "Agora"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Fontes Mapeadas:</span>
                          <span className="font-bold text-foreground">{chat.selectedPortalIds.length} / {MARKET_PORTALS.length} portais ativos</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* PAINEL DE DIRECIONAMENTO DO RADAR (QUANDO + ESTADO + 30 PORTAIS) */}
                  <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-md p-4 sm:p-5 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* Filtro: Quando */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-primary" /> Janela Temporal (Quando)
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {RADAR_TIME_OPTIONS.map((opt) => {
                            const active = chat.radarTimeFilter === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => chat.setRadarTimeFilter(opt.id)}
                                title={opt.desc}
                                className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                                  active
                                    ? "bg-primary text-primary-foreground border-primary shadow-glow-sm"
                                    : "bg-card/80 text-muted-foreground border-border/60 hover:text-foreground hover:border-border"
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Filtro: Abrangência / Estado */}
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
                          <MapPin className="h-3 w-3 text-emerald-500" /> Estado / Abrangência (Mercado &amp; Leis)
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {RADAR_REGION_OPTIONS.map((reg) => {
                            const active = chat.radarRegionFilter === reg.id;
                            return (
                              <button
                                key={reg.id}
                                type="button"
                                onClick={() => chat.setRadarRegionFilter(reg.id)}
                                className={`px-2.5 py-1.5 rounded-xl text-[11px] font-bold border transition-all ${
                                  active
                                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/40"
                                    : "bg-card/80 text-muted-foreground border-border/60 hover:text-foreground hover:border-border"
                                }`}
                              >
                                {reg.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Checklist dos 30 Portais */}
                    <div className="pt-3 border-t border-border/40">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => setIsPortalChecklistOpen((v) => !v)}
                          className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-foreground hover:text-primary transition-colors"
                        >
                          <Filter className="h-3.5 w-3.5 text-primary" />
                          Checklist de Portais ({chat.selectedPortalIds.length} / {MARKET_PORTALS.length} selecionados)
                          {isPortalChecklistOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => chat.setSelectedPortalIds(MARKET_PORTALS.map((p) => p.id))}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border border-border/60 bg-card/80 hover:border-primary/40 hover:text-primary transition-colors"
                          >
                            Todos ({MARKET_PORTALS.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => chat.setSelectedPortalIds([])}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border border-border/60 bg-card/80 hover:border-red-500/40 hover:text-red-400 transition-colors"
                          >
                            Limpar
                          </button>
                          {(["automotivo", "marketing", "leis"] as PortalCategory[]).map((cat) => (
                            <button
                              key={cat}
                              type="button"
                              onClick={() =>
                                chat.setSelectedPortalIds(
                                  MARKET_PORTALS.filter((p) => p.category === cat).map((p) => p.id)
                                )
                              }
                              className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase border border-border/60 bg-card/80 hover:border-primary/40 hover:text-foreground transition-colors"
                            >
                              Só {PORTAL_CATEGORY_LABELS[cat].badge}
                            </button>
                          ))}
                        </div>
                      </div>

                      {isPortalChecklistOpen && (
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                          {(["automotivo", "marketing", "leis"] as PortalCategory[]).map((cat) => {
                            const portals = MARKET_PORTALS.filter((p) => p.category === cat);
                            const catMeta = PORTAL_CATEGORY_LABELS[cat];
                            const selectedCount = portals.filter((p) => chat.selectedPortalIds.includes(p.id)).length;
                            return (
                              <div key={cat} className="rounded-xl border border-border/50 bg-background/40 p-3 space-y-2">
                                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                                  <span className={`text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 ${catMeta.color}`}>
                                    {cat === "leis" && <Scale className="h-3 w-3" />}
                                    {catMeta.label}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const catIds = portals.map((p) => p.id);
                                      const allInCat = selectedCount === portals.length;
                                      chat.setSelectedPortalIds((prev) =>
                                        allInCat
                                          ? prev.filter((id) => !catIds.includes(id))
                                          : Array.from(new Set([...prev, ...catIds]))
                                      );
                                    }}
                                    className="text-[10px] font-bold text-primary hover:underline"
                                  >
                                    {selectedCount}/{portals.length}
                                  </button>
                                </div>
                                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                                  {portals.map((portal) => {
                                    const checked = chat.selectedPortalIds.includes(portal.id);
                                    return (
                                      <label
                                        key={portal.id}
                                        className={`flex items-start gap-2 p-1.5 rounded-lg cursor-pointer transition-colors ${
                                          checked ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40 opacity-70"
                                        }`}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => {
                                            chat.setSelectedPortalIds((prev) =>
                                              prev.includes(portal.id)
                                                ? prev.filter((id) => id !== portal.id)
                                                : [...prev, portal.id]
                                            );
                                          }}
                                          className="mt-0.5 rounded border-border accent-primary cursor-pointer"
                                        />
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center justify-between gap-1">
                                            <span className="text-[11px] font-bold text-foreground truncate">{portal.name}</span>
                                            {portal.scope !== "BR" && (
                                              <span className="shrink-0 px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-400 text-[9px] font-black">
                                                {portal.scope}
                                              </span>
                                            )}
                                          </div>
                                          <p className="text-[9px] text-muted-foreground truncate">{portal.domain}</p>
                                        </div>
                                      </label>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SEÇÃO DE NOTÍCIAS EM TEMPO REAL ACUMULATIVAS (ATÉ 100 ARTIGOS) */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card/40 border border-border/60 rounded-2xl p-4">
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                          <Radio className="h-4 w-4 text-primary" /> Notícias e Tendências Mapeadas do Mercado Automotivo
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Banco de notícias acumulativas (até 100 artigos). Selecione para absorver no RAG ou exclua individualmente.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${
                          chat.marketArticles.length >= 90
                            ? "bg-red-500/15 border-red-500/30 text-red-400"
                            : "bg-primary/10 border-primary/30 text-primary"
                        }`}>
                          {chat.marketArticles.length} / 100 Artigos Acumulados
                        </span>

                        <button
                          type="button"
                          onClick={() => chat.fetchMarketIntel(true)}
                          disabled={chat.isScanningMarket}
                          className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-glow-sm disabled:opacity-50"
                        >
                          {chat.isScanningMarket ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="h-3.5 w-3.5" />
                          )}
                          {chat.isScanningMarket ? "Varrendo..." : "Rastrear Notícias Agora"}
                        </button>
                      </div>
                    </div>

                    {/* BARRA DE AÇÕES EM LOTE: SELEÇÃO, EXCLUSÃO E ABSORÇÃO */}
                    <div className="flex flex-wrap items-center justify-between gap-3 bg-card/25 border border-border/50 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={toggleSelectAllArticles}
                          disabled={chat.marketArticles.length === 0}
                          className="flex items-center gap-1.5 text-xs font-bold text-foreground hover:text-primary transition-colors disabled:opacity-40"
                        >
                          {selectedArticleIds.size > 0 && selectedArticleIds.size === chat.marketArticles.length ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>
                            {selectedArticleIds.size === chat.marketArticles.length && chat.marketArticles.length > 0
                              ? "Desmarcar Todos"
                              : "Selecionar Todos"}
                          </span>
                        </button>

                        {selectedArticleIds.size > 0 && (
                          <span className="text-[10px] font-bold text-primary bg-primary/10 px-2.5 py-0.5 rounded-lg border border-primary/25">
                            {selectedArticleIds.size} de {chat.marketArticles.length} selecionado(s)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {selectedArticleIds.size > 0 && (
                          <button
                            type="button"
                            onClick={handleDeleteSelectedArticles}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 font-bold text-[10px] uppercase tracking-wider transition-all"
                            title="Excluir artigos selecionados"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Excluir Selecionados ({selectedArticleIds.size})
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={handleAbsorbSelectedArticles}
                          disabled={chat.isLearningMarket || chat.marketArticles.length === 0}
                          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-primary-foreground font-black text-[10px] uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all shadow-glow-sm disabled:opacity-50"
                        >
                          {chat.isLearningMarket ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Brain className="h-3.5 w-3.5" />
                          )}
                          {chat.isLearningMarket
                            ? "Absorvendo no RAG..."
                            : selectedArticleIds.size > 0
                            ? `Absorver Selecionados no RAG (${selectedArticleIds.size})`
                            : "Absorver Todos no RAG"}
                        </button>
                      </div>
                    </div>

                    {chat.isScanningMarket ? (
                      <div className="py-16 text-center rounded-2xl border border-dashed border-border/60 bg-card/20">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                        <p className="text-xs font-bold text-foreground mt-3 uppercase tracking-wider">Varrendo portais de notícias e tráfego pago em tempo real...</p>
                      </div>
                    ) : chat.marketArticles.length === 0 ? (
                      <div className="py-16 text-center rounded-2xl border border-dashed border-border/60 bg-card/20 space-y-2">
                        <Radio className="h-8 w-8 text-muted-foreground/40 mx-auto" />
                        <p className="text-xs font-bold text-foreground uppercase tracking-wider">Nenhum artigo no radar no momento.</p>
                        <p className="text-[11px] text-muted-foreground">Clique em "Rastrear Notícias Agora" para fazer uma busca completa na web.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {chat.marketArticles.map(art => {
                          const isSelected = selectedArticleIds.has(art.id);
                          return (
                            <div
                              key={art.id}
                              className={`group p-4 rounded-xl border transition-all flex flex-col justify-between cursor-pointer ${
                                isSelected
                                  ? "border-primary bg-primary/[0.08] shadow-glow-sm"
                                  : "border-border/60 bg-card/40 hover:bg-card/70 hover:border-border"
                              }`}
                              onClick={() => toggleSelectArticle(art.id)}
                            >
                              <div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSelectArticle(art.id);
                                      }}
                                      className="text-foreground hover:text-primary transition-colors"
                                    >
                                      {isSelected ? (
                                        <CheckSquare className="h-4 w-4 text-primary" />
                                      ) : (
                                        <Square className="h-4 w-4 text-muted-foreground/60" />
                                      )}
                                    </button>
                                    <span className="font-black uppercase tracking-wider text-primary truncate max-w-[180px]">{art.source}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-muted-foreground font-medium">{formatArticleDate(art.pubDate)}</span>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        chat.deleteMarketArticles([art.id]);
                                        setSelectedArticleIds(prev => {
                                          const next = new Set(prev);
                                          next.delete(art.id);
                                          return next;
                                        });
                                      }}
                                      title="Excluir este artigo do Radar"
                                      className="p-1 rounded-md text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                                <h4 className={`text-xs font-bold leading-snug transition-colors ${
                                  isSelected ? "text-primary" : "text-foreground group-hover:text-primary"
                                }`}>
                                  {art.title}
                                </h4>
                                {art.snippet && (
                                  <p className="text-[11px] text-muted-foreground mt-2 line-clamp-3 leading-relaxed">
                                    {art.snippet}
                                  </p>
                                )}
                              </div>
                              {art.link && (
                                <div className="mt-3 pt-2 border-t border-border/30 flex items-center justify-between">
                                  <span className={`text-[9px] font-bold uppercase ${
                                    art.category === "leis"
                                      ? "text-emerald-400"
                                      : art.category === "trafego"
                                      ? "text-amber-400"
                                      : "text-muted-foreground/70"
                                  }`}>
                                    {art.category === "mercado"
                                      ? "Mercado Automotivo"
                                      : art.category === "trafego"
                                      ? "Tráfego & Marketing"
                                      : art.category === "leis"
                                      ? "Leis & Governo"
                                      : "Lançamentos"}
                                  </span>
                                  <a
                                    href={art.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-[10px] font-bold uppercase text-primary hover:underline flex items-center gap-1"
                                  >
                                    Ler Fonte Original <ExternalLink className="h-3 w-3" />
                                  </a>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* DIRETRIZES VALIDADAS DE TRÁFEGO AUTOMOTIVO */}
                  <div className="rounded-2xl border border-border/60 bg-card/30 p-5 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider text-foreground flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" /> Estratégias Validadas de Tráfego Automotivo Embutidas na Victoria
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3.5 rounded-xl border border-border/40 bg-background/50 space-y-1.5">
                        <p className="text-xs font-black text-foreground">🏎️ Fotos no Pátio vs Catálogo</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Hipótese criativa recomendada para testes A/B: fotos e vídeos reais gravados no pátio da loja tendem a gerar maior percepção de autenticidade do estoque do que imagens genéricas de catálogo.
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-border/40 bg-background/50 space-y-1.5">
                        <p className="text-xs font-black text-foreground">⚡ Meta Operacional de Atendimento (5 Minutos)</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Diretriz interna de SLA comercial: priorizar o primeiro contato no WhatsApp nos primeiros 5 minutos para preservar a intenção de compra (requer telemetria de CRM para aferição causal).
                        </p>
                      </div>
                      <div className="p-3.5 rounded-xl border border-border/40 bg-background/50 space-y-1.5">
                        <p className="text-xs font-black text-foreground">🎯 Qualificador de Troca</p>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          Anúncios com pergunta qualificadora de entrada ("Tem carro na troca?") filtram curiosos e entregam compradores prontos para o consultor.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 2. ABA BASE DE CONHECIMENTO & RAG */}
              {mindSubTab === "conhecimento" && (
                <div className="space-y-6">
                  {/* Botão de seed NC Performance */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-amber-500/10 border border-amber-500/25 rounded-2xl">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-amber-400" />
                        <h4 className="text-xs font-black text-amber-400 uppercase tracking-wider">Base de Conhecimento Estratégica NC Performance</h4>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
                        Importa 12 documentos fundamentais: benchmarks de CPL regional, SLAs de atendimento de 5 minutos, funis validados, protocolo de criativos no pátio e capacidades da Victoria.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSeedKnowledge}
                      disabled={seedingKnowledge}
                      className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:brightness-110 text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-50 shadow-[0_0_15px_rgba(245,158,11,0.3)] cursor-pointer"
                    >
                      {seedingKnowledge ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                      {seedingKnowledge ? "Importando..." : "Importar Base Estratégica"}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                    {/* Formulário de Envio (2 colunas) */}
                    <div className="lg:col-span-2 flex flex-col gap-4 p-5 bg-card/30 border border-border/40 rounded-2xl backdrop-blur-md relative overflow-hidden">
                      <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-500/30 to-yellow-600/10" />
                      
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black uppercase text-foreground">Novo Documento</h4>
                        <span className="text-[9px] font-bold text-muted-foreground uppercase">Capacidade: {chat.knowledgeList.length}/50</span>
                      </div>

                      {chat.knowledgeList.length >= 50 && (
                        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-[10px] text-red-400 font-bold flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4 shrink-0 text-red-500" />
                          <span>Limite de 50 documentos atingido. Edite ou exclua para liberar espaço.</span>
                        </div>
                      )}
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-black uppercase text-muted-foreground/80">Título</label>
                        <input
                          type="text"
                          placeholder="Ex: Ficha do Corolla XEi 2023"
                          value={newKnowledgeTitle}
                          onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                          disabled={chat.knowledgeList.length >= 50}
                          className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30 disabled:opacity-50"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[9px] font-black uppercase text-muted-foreground/80">Categoria</label>
                          <select
                            value={newKnowledgeCategory}
                            onChange={(e: any) => setNewKnowledgeCategory(e.target.value)}
                            disabled={chat.knowledgeList.length >= 50}
                            className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none disabled:opacity-50"
                          >
                            <option value="inventory">Estoque de Carros</option>
                            <option value="brand_voice">Voz da Marca</option>
                            <option value="manual">Manuais e Fichas</option>
                            <option value="strategy">Estratégia / Tráfego</option>
                            <option value="custom">Personalizado</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[9px] font-black uppercase text-muted-foreground/80">Carregar Arquivo</label>
                          <input
                            type="file"
                            ref={docInputRef}
                            accept=".txt,.md,.pdf"
                            onChange={handleDocumentUpload}
                            className="hidden"
                          />
                          <button
                            type="button"
                            disabled={chat.knowledgeList.length >= 50 || extractingFile}
                            onClick={() => docInputRef.current?.click()}
                            className="w-full py-2 px-3 bg-background border border-border hover:bg-white/5 text-[10px] font-bold rounded-xl transition-all uppercase text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {extractingFile ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
                            ) : (
                              <UploadCloud className="h-3.5 w-3.5" />
                            )}
                            PDF / TXT / MD
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-[9px] font-black uppercase text-muted-foreground/80">Conteúdo do Grounding</label>
                        <textarea
                          rows={6}
                          placeholder="Cole aqui o texto do documento ou deixe que a extração de arquivo preencha esta área..."
                          value={newKnowledgeContent}
                          onChange={(e) => setNewKnowledgeContent(e.target.value)}
                          disabled={chat.knowledgeList.length >= 50}
                          className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30 font-mono resize-none disabled:opacity-50"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveKnowledge}
                        disabled={chat.knowledgeList.length >= 50 || savingKnowledge || extractingFile || !newKnowledgeTitle.trim() || !newKnowledgeContent.trim()}
                        className="w-full py-2.5 rounded-xl bg-amber-500 hover:brightness-110 text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-2 shadow-[0_0_15px_rgba(245,158,11,0.2)] cursor-pointer"
                      >
                        {savingKnowledge ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Sparkles className="h-4 w-4" />
                        )}
                        {chat.knowledgeList.length >= 50 ? "Capacidade Máxima (50/50)" : "Treinar Victoria AI"}
                      </button>
                    </div>

                    {/* Lista de Conhecimentos Cadastrados (3 colunas) */}
                    <div className="lg:col-span-3 flex flex-col gap-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs font-black uppercase text-foreground">Documentos Treinados</h4>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                            chat.knowledgeList.length >= 50
                              ? "bg-red-500/20 text-red-400 border-red-500/40"
                              : chat.knowledgeList.length >= 40
                              ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                          }`}>
                            {chat.knowledgeList.length} / 50
                          </span>
                        </div>
                        
                        {/* Busca Local */}
                        <div className="relative flex items-center w-48">
                          <Search className="absolute left-2.5 h-3 w-3 text-muted-foreground/50" />
                          <input
                            type="text"
                            placeholder="Buscar base..."
                            value={knowledgeSearchTerm}
                            onChange={(e) => setKnowledgeSearchTerm(e.target.value)}
                            className="w-full bg-input/20 border border-border/60 rounded-lg pl-7 pr-3 py-1 text-[10px] focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30"
                          />
                        </div>
                      </div>

                      <div className="flex flex-col gap-3 max-h-[480px] overflow-y-auto pr-1 custom-scrollbar">
                        {chat.loadingKnowledge ? (
                          <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> Carregando base...
                          </div>
                        ) : chat.knowledgeList.length === 0 ? (
                          <div className="text-center py-16 p-4 bg-card/10 border border-dashed border-border/60 rounded-2xl text-[10px] uppercase text-muted-foreground/60 tracking-widest leading-relaxed">
                            Nenhum documento cadastrado. Adicione um à esquerda ou importe a Base Estratégica.
                          </div>
                        ) : (
                          filteredKnowledgeList.map((k) => {
                            const catLabels: Record<string, string> = {
                              inventory: "Estoque",
                              brand_voice: "Tom da Voz",
                              manual: "Fichas",
                              strategy: "Tráfego",
                              custom: "Manual"
                            };
                            const catColors: Record<string, string> = {
                              inventory: "bg-blue-500/10 border-blue-500/25 text-blue-400",
                              brand_voice: "bg-purple-500/10 border-purple-500/25 text-purple-400",
                              manual: "bg-emerald-500/10 border-emerald-500/25 text-emerald-400",
                              strategy: "bg-red-500/10 border-red-500/25 text-red-400",
                              custom: "bg-amber-500/10 border-amber-500/25 text-amber-400"
                            };

                            return (
                              <div
                                key={k.id}
                                className="p-4 bg-card/10 hover:bg-card/25 border border-border/50 hover:border-amber-500/25 rounded-xl transition-all duration-200 flex items-start justify-between gap-4 group"
                              >
                                <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border shrink-0 ${catColors[k.category] || catColors.custom}`}>
                                      {catLabels[k.category] || "Geral"}
                                    </span>
                                    <h5 className="text-xs font-bold text-foreground truncate">{k.title}</h5>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground/80 line-clamp-2 leading-relaxed">
                                    {k.content}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditDoc(k)}
                                    title="Editar Documento Treinado"
                                    className="p-1.5 rounded-lg border border-transparent hover:border-amber-500/30 hover:bg-amber-500/10 text-muted-foreground hover:text-amber-400 transition-colors cursor-pointer"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => chat.deleteKnowledge(k.id)}
                                    title="Excluir Documento"
                                    className="p-1.5 rounded-lg border border-transparent hover:border-red-500/30 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 3. ABA CALIBRAÇÃO NEURAL */}
              {mindSubTab === "calibracao" && (
                <div className="space-y-6">
                  {/* CARD DE AUTONOMIA DE DIAGNÓSTICO E GOVERNANÇA */}
                  <div className="rounded-2xl border border-primary/30 bg-primary/[0.04] p-5 shadow-lg relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-[9px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" /> Autonomia Neural de Diagnósticos & Ações
                        </span>
                        <h3 className="text-base font-black text-foreground">
                          Autonomia de Alterar Diagnósticos com Base no Aprendizado
                        </h3>
                        <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
                          A Victoria AI possui autorização de comando para confrontar métricas de campanhas contra as diretrizes aprendidas (Base de Conhecimento + Radar em tempo real). Quando uma campanha ultrapassar a meta de CPL de R$ 5,00 no RJ, usar criativos sem conformidade ou estourar o SLA de atendimento de 5 minutos, ela tem autonomia total para reclassificar o diagnóstico para Crítico e prescrever alterações de verba e criativo.
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> Autonomia Ativa
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* FORMULÁRIO DE GERAÇÃO E PARÂMETROS NEURAIS */}
                  <div className="p-6 space-y-6 rounded-2xl border border-border/60 bg-card/40">
                    <div className="flex items-center justify-between border-b border-white/5 pb-3">
                      <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                        <Sliders className="h-4 w-4 text-primary" /> Parâmetros de Inferência e Geração
                      </h4>
                      <span className="text-[10px] font-mono text-muted-foreground">Persistência em Supabase victoria_configs</span>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                      {/* Modelo Gemini */}
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                          <Cpu className="h-3.5 w-3.5 text-primary" /> Modelo da Linguagem (Gemini)
                        </label>
                        <select
                          value={modelName}
                          onChange={(e) => setModelName(e.target.value)}
                          className="w-full rounded-xl border border-white/10 bg-background/60 px-3.5 py-2.5 text-xs text-foreground focus:border-primary focus:outline-none cursor-pointer"
                        >
                          <option value="gemini-2.5-flash">Gemini 2.5 Flash (Padrão e Rápido)</option>
                          <option value="gemini-1.5-pro">Gemini 1.5 Pro (Mais Analítico & Profundo)</option>
                          <option value="gemini-1.5-flash">Gemini 1.5 Flash (Leve)</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground/70">
                          O Gemini 2.5 Flash oferece o melhor equilíbrio de raciocínio tático e velocidade em tempo real.
                        </p>
                      </div>

                      {/* Temperatura */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Criatividade (Temperatura)
                          </label>
                          <span className="text-[11px] font-mono font-bold text-primary">{temperature.toFixed(1)}</span>
                        </div>
                        <input
                          type="range"
                          min="0.0"
                          max="1.5"
                          step="0.1"
                          value={temperature}
                          onChange={(e) => setTemperature(parseFloat(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                        />
                        <div className="flex justify-between text-[9px] text-muted-foreground/60">
                          <span>0.0 (Mais Preciso & Cirúrgico)</span>
                          <span>0.7 (Recomendado)</span>
                          <span>1.5 (Mais Criativo)</span>
                        </div>
                      </div>

                      {/* RAG Threshold */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Filtro de Similaridade RAG (Threshold)
                          </label>
                          <span className="text-[11px] font-mono font-bold text-primary">{ragThreshold.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0.30"
                          max="0.95"
                          step="0.05"
                          value={ragThreshold}
                          onChange={(e) => setRagThreshold(parseFloat(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground/70">
                          Pontuação mínima de similaridade de cosseno para recuperar documentos treinados.
                        </p>
                      </div>

                      {/* RAG Count */}
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            Máximo de Fragmentos no RAG
                          </label>
                          <span className="text-[11px] font-mono font-bold text-primary">{ragCount} blocos</span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="15"
                          step="1"
                          value={ragCount}
                          onChange={(e) => setRagCount(parseInt(e.target.value))}
                          className="w-full h-1.5 rounded-lg appearance-none bg-white/10 cursor-pointer accent-primary"
                        />
                        <p className="text-[10px] text-muted-foreground/70">
                          Quantidade máxima de documentos de contexto injetados por inferência da IA.
                        </p>
                      </div>
                    </div>

                    {/* System Prompt */}
                    <div className="space-y-2 pt-2 border-t border-white/5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                          Instruções de Personalidade (System Prompt)
                        </label>
                        {!systemPrompt && (
                          <span className="text-[9px] bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold">
                            Usando Prompt Padrão da Victoria
                          </span>
                        )}
                      </div>
                      <textarea
                        value={systemPrompt}
                        onChange={(e) => setSystemPrompt(e.target.value)}
                        placeholder="Se deixado em branco, a Victoria usará sua personalidade de Estrategista Sênior de Tráfego Pago Automotivo da NC Performance (Philip Kotler, Dan Kennedy, Michael Porter, Russel Brunson). Digite aqui diretrizes personalizadas..."
                        className="w-full min-h-[220px] rounded-xl border border-white/10 bg-background/50 p-3.5 text-xs text-foreground focus:border-primary focus:outline-none font-mono leading-relaxed resize-y"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <p className="text-[11px] text-muted-foreground">
                        Todas as alterações entram em vigor imediatamente para todo o sistema.
                      </p>
                      <button
                        type="button"
                        onClick={handleSaveNeuralConfig}
                        disabled={savingNeuralConfig}
                        className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-black uppercase tracking-wider text-primary-foreground hover:brightness-110 active:scale-95 transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {savingNeuralConfig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Salvar Calibração Neural
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )
        ) : (
          /* ===================================================================
             INTERFACE TRADICIONAL DO CHAT COM IA
             =================================================================== */
          <>
            {/* Corpo do Chat / Mensagens com scroll livre sem travamentos */}
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              className="relative flex-1 overflow-y-auto overflow-x-hidden px-3 sm:px-6 py-4 sm:py-6 flex flex-col gap-5 sm:gap-6 custom-scrollbar"
            >
              {chat.messages.length === 0 ? (
                /* TELA DE BOAS VINDAS (WELCOME SCREEN) */
                <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto py-8 text-center gap-8">
                  <div className="flex flex-col items-center gap-3">
                    {/* Logo e Badge da Victoria */}
                    <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-500/20 to-yellow-600/10 border border-amber-500/28 flex items-center justify-center shadow-[0_0_30px_rgba(245,158,11,0.15)]">
                      <div className="absolute inset-x-0 top-0 h-[4px] bg-white/20 rounded-t-2xl" />
                      <Bot className="h-8 w-8 text-amber-500 animate-pulse" />
                    </div>
                    <h1 className="text-xl font-display font-black tracking-tight text-foreground mt-2">
                      Olá, {userName}! Sou a Victoria AI.
                    </h1>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-md">
                      Sou a estrategista sênior da NC Performance. Tenho acesso total ao banco de dados (funis, métricas, social, clientes) e estou pronta para auditar campanhas, clonar estruturas ou gerar relatórios em segundos.
                    </p>
                    <SnapshotStatusBadge
                      snapshotId={activeSnapshot.snapshotId}
                      committedAt={activeSnapshot.committedAt}
                      isUpdating={isFetchingAccounts}
                    />
                  </div>

                  {/* Seletor de Conta Alerta se nenhuma selecionada */}
                  {!selectedAccountId && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-400 max-w-md text-left flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold uppercase text-[10px] tracking-wider">Atenção, {userName}:</strong>
                        <p className="mt-0.5 leading-relaxed text-muted-foreground/90">Para realizar auditorias financeiras e análises demográficas exatas de tráfego, selecione uma conta de anúncios no canto superior direito.</p>
                      </div>
                    </div>
                  )}

                  {/* Painel de Quick Actions — C5: Análise / Execução */}
                  <div className="w-full flex flex-col gap-5 text-left">
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/50 border-b border-border/40 pb-2">Como posso alavancar seus resultados hoje?</span>

                    {/* RAG indicator — C4: mostra snippets recuperados */}
                    {chat.ragSnippets.length > 0 && (
                      <div className="flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[10px] font-bold text-amber-500">
                        <Database className="h-3 w-3 shrink-0" />
                        {chat.ragSnippets.length} documento{chat.ragSnippets.length > 1 ? "s" : ""} da base de conhecimento aplicado{chat.ragSnippets.length > 1 ? "s" : ""} na última resposta
                      </div>
                    )}

                    {(["analysis", "action"] as const).map(group => {
                      const grouped = quickActions.filter(a => a.type === group);
                      if (!grouped.length) return null;
                      return (
                        <div key={group} className="flex flex-col gap-2">
                          <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40 flex items-center gap-1.5">
                            {group === "analysis" ? (
                              <><BarChart3 className="h-3 w-3" /> Análise</>
                            ) : (
                              <><Zap className="h-3 w-3 text-amber-500" /> <span className="text-amber-500">Execução</span></>
                            )}
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {grouped.map((action, index) => {
                              const Icon = action.icon;
                              return (
                                <button
                                  key={index}
                                  onClick={() => {
                                    if (!selectedAccountId && action.type === "analysis") {
                                      toast.warning("Selecione uma conta de anúncios no cabeçalho primeiro!");
                                      return;
                                    }
                                    setPrompt(action.prompt);
                                  }}
                                  className={`card-sport p-4 border rounded-2xl transition-all duration-200 text-left flex gap-3 group active:scale-[0.98] ${
                                    group === "action"
                                      ? "bg-amber-500/5 border-amber-500/20 hover:bg-amber-500/10 hover:border-amber-500/40"
                                      : "bg-card/30 border-border/40 hover:bg-primary/5 hover:border-primary/28"
                                  }`}
                                >
                                  <div className={`h-8 w-8 rounded-xl bg-background flex items-center justify-center shrink-0 border shadow-sm transition-colors ${
                                    group === "action"
                                      ? "border-amber-500/20 group-hover:border-amber-500/40"
                                      : "border-border/60 group-hover:border-primary/20"
                                  }`}>
                                    <Icon className={`h-4 w-4 transition-colors ${
                                      group === "action"
                                        ? "text-amber-500/70 group-hover:text-amber-500"
                                        : "text-muted-foreground group-hover:text-primary"
                                    }`} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <h4 className={`text-xs font-bold transition-colors ${
                                        group === "action"
                                          ? "text-foreground group-hover:text-amber-500"
                                          : "text-foreground group-hover:text-primary"
                                      }`}>{action.title}</h4>
                                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                                    </div>
                                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{action.description}</p>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                /* CONTEÚDO DAS MENSAGENS DO CHAT */
                <div className="max-w-3xl mx-auto w-full flex flex-col gap-6">
                  {chat.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-4 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
                    >
                      {/* Avatar */}
                      <div className={`h-8 w-8 rounded-xl shrink-0 flex items-center justify-center border shadow-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground border-primary/20"
                          : "bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border-amber-500/20 text-amber-500"
                      }`}>
                        {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </div>

                      {/* Conteúdo da Mensagem */}
                      <div className={`flex-1 flex flex-col gap-2 max-w-[85%] ${msg.role === "user" ? "items-end" : ""}`}>
                        {/* Metadados da mensagem: Nome e Data */}
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                          <span>{msg.role === "user" ? "Você" : "Victoria AI"}</span>
                          <span>•</span>
                          <span>{msg.created_at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          {msg.role === "user" && editingMessageId !== msg.id && (
                            <button
                              onClick={() => {
                                setEditingMessageId(msg.id);
                                setEditingMessageText(msg.content);
                              }}
                              className="p-1 hover:bg-white/5 rounded text-muted-foreground hover:text-foreground transition-all ml-1.5"
                              title="Editar mensagem"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                          )}
                        </div>

                        {/* Bloco de Mensagem */}
                        <div className={`rounded-2xl px-5 py-4 text-xs leading-relaxed shadow-sm border ${
                          msg.role === "user"
                            ? "bg-primary/5 border-primary/10 text-foreground"
                            : "bg-card/40 border-border/40 text-foreground"
                        }`}>
                          {/* Se houver imagem anexada na mensagem do usuário */}
                          {msg.metadata?.image && (
                            <div className="mb-3 max-w-sm rounded-lg overflow-hidden border border-border/80 shadow-md">
                              <img
                                src={`data:${msg.metadata.image.mimeType};base64,${msg.metadata.image.base64}`}
                                alt="Anexo do Print"
                                className="w-full max-h-56 object-cover"
                              />
                            </div>
                          )}

                          {editingMessageId === msg.id ? (
                            <div className="flex flex-col gap-2 w-full min-w-[280px] sm:min-w-[400px]">
                              <textarea
                                value={editingMessageText}
                                onChange={(e) => setEditingMessageText(e.target.value)}
                                className="w-full bg-input/20 border border-primary/30 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground resize-none"
                                rows={3}
                                autoFocus
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() => setEditingMessageId(null)}
                                  className="px-2.5 py-1 rounded-lg border border-border text-[10px] font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all uppercase"
                                >
                                  Cancelar
                                </button>
                                <button
                                  onClick={async () => {
                                    const textToSubmit = editingMessageText.trim();
                                    if (!textToSubmit) return;
                                    setEditingMessageId(null);
                                    await chat.editMessage(msg.id, textToSubmit);
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-black hover:brightness-110 transition-all uppercase"
                                >
                                  Salvar e Enviar
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* Renderizador de Markdown */
                            <ReactMarkdown
                              components={{
                                p: ({node, ...props}) => <p className="mb-3 last:mb-0 leading-relaxed text-foreground/90" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-xs font-black text-amber-500 mt-4 mb-2 uppercase tracking-wider border-b border-border/45 pb-1 first:mt-0" {...props} />,
                                h4: ({node, ...props}) => <h4 className="text-[11px] font-black text-foreground mt-3 mb-1 uppercase tracking-tight" {...props} />,
                                ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-3 space-y-1 text-foreground/85" {...props} />,
                                ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-foreground/85" {...props} />,
                                li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
                                strong: ({node, ...props}) => <strong className="font-extrabold text-foreground" {...props} />,
                                code: ({node, ...props}) => <code className="bg-white/5 px-1.5 py-0.5 rounded text-[11px] font-mono border border-white/5" {...props} />,
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>
                          )}

                          {/* Renderizador de Action Card (Human-in-the-loop) */}
                          {msg.metadata?.action && (
                            <ActionCard
                              messageId={msg.id}
                              action={msg.metadata.action}
                              status={msg.metadata.actionStatus || "pending"}
                              onApprove={chat.executeAction}
                              onReject={chat.rejectAction}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Indicador de Digitação (Typing Indicator) */}
                  {chat.isTyping && (
                    <div className="flex gap-4">
                      <div className="h-8 w-8 rounded-xl shrink-0 flex items-center justify-center bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border border-amber-500/20 text-amber-500 shadow-sm animate-pulse">
                        <Bot className="h-4 w-4" />
                      </div>
                      <div className="flex-1 max-w-[85%] flex flex-col gap-2">
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                          <span>Victoria AI</span>
                          <span>•</span>
                          <span className="italic">Digitando...</span>
                        </div>
                        <div className="rounded-2xl px-5 py-4 bg-card/30 border border-border/40 text-foreground w-20 flex justify-center gap-1.5 items-center">
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>
              )}
            </div>

            {/* Botão flutuante para rolar para o final quando o usuário subiu a conversa */}
            <AnimatePresence>
              {showScrollBottomBtn && (
                <motion.button
                  type="button"
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  onClick={() => {
                    isAutoScrollEnabled.current = true;
                    setShowScrollBottomBtn(false);
                    scrollToBottom("smooth");
                  }}
                  className="fixed bottom-24 right-8 z-30 flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-card/95 border border-primary/40 text-primary text-xs font-bold shadow-2xl backdrop-blur-md hover:bg-muted transition-all active:scale-95"
                >
                  <ArrowDown className="h-3.5 w-3.5 animate-bounce" />
                  <span>Rolar para o final</span>
                </motion.button>
              )}
            </AnimatePresence>

            {/* Rodapé / Input de Chat */}
            <footer className="p-2.5 sm:p-4 border-t border-border/60 bg-background/80 lg:bg-background/50 backdrop-blur-md shrink-0">
              <div className="max-w-3xl mx-auto flex flex-col gap-2 sm:gap-3">
                {/* Visualização de Imagem Selecionada */}
                {selectedImage && (
                  <div className="relative inline-block self-start p-1.5 bg-card border border-border/80 rounded-2xl shadow-md">
                    <img
                      src={`data:${selectedImage.mimeType};base64,${selectedImage.base64}`}
                      alt="Anexo de Print"
                      className="h-20 w-28 object-cover rounded-xl border border-border/40"
                    />
                    <button
                      onClick={() => setSelectedImage(null)}
                      className="absolute -top-2 -right-2 p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors shadow-lg active:scale-95"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}

                {/* Caixa de Texto e Botões */}
                <div className="relative flex items-center bg-card/60 border border-border/80 rounded-2xl px-4 py-1 focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/30 transition-all shadow-inner">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                  
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={chat.isTyping}
                      className="p-2.5 bg-background border border-border hover:bg-white/5 rounded-xl transition-all flex items-center justify-center disabled:opacity-40 cursor-pointer"
                      title="Anexar print do painel"
                    >
                      <Paperclip className="h-4 w-4 text-muted-foreground hover:text-foreground transition-colors" />
                    </button>

                    <button
                      type="button"
                      onClick={toggleListening}
                      disabled={chat.isTyping}
                      className={`p-2.5 bg-background border rounded-xl transition-all flex items-center justify-center cursor-pointer ${
                        isListening 
                          ? "border-red-500/40 text-red-500 bg-red-500/5 animate-pulse" 
                          : "border-border text-muted-foreground hover:bg-white/5 hover:text-foreground"
                      }`}
                      title={isListening ? "Parar gravação" : "Digitar por voz"}
                    >
                      {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder={
                      !selectedAccountId
                        ? "Digite sua pergunta ou selecione a conta de tráfego acima..."
                        : "Pergunte sobre CPL, decole vendas, ou anexe um print para gerar relatório..."
                    }
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    disabled={chat.isTyping}
                    className="w-full bg-transparent border-none focus:outline-none pl-4 pr-12 py-3 text-xs text-foreground placeholder:text-muted-foreground/30 shadow-none"
                  />

                  <button
                    onClick={handleSend}
                    disabled={chat.isTyping || (!prompt.trim() && !selectedImage)}
                    className="absolute right-2 p-2 bg-primary text-primary-foreground rounded-xl hover:brightness-110 transition-all shadow-glow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {chat.isTyping ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* Rodapé do rodapé */}
                <div className="flex items-center justify-center gap-2 mt-1">
                  <div className="h-px flex-1 bg-border/30" />
                  <p className="label-mono text-[9px] text-muted-foreground/30 uppercase tracking-widest">
                    NC Performance Suite · IA de Alta Performance Automotiva
                  </p>
                  <div className="h-px flex-1 bg-border/30" />
                </div>
              </div>
            </footer>
          </>
        )}
      </div>

      {/* MODAL DE EDIÇÃO DE DOCUMENTO TREINADO (RAG) */}
      {editingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-card border border-border/80 rounded-2xl shadow-2xl p-6 flex flex-col gap-4 relative">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Pencil className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground uppercase tracking-tight">Editar Documento Treinado</h3>
                  <p className="text-[10px] text-muted-foreground">Atualize o grounding e re-calibre a memória da Victoria AI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black uppercase text-muted-foreground/80">Título do Documento</label>
              <input
                type="text"
                value={editDocTitle}
                onChange={(e) => setEditDocTitle(e.target.value)}
                className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black uppercase text-muted-foreground/80">Categoria</label>
              <select
                value={editDocCategory}
                onChange={(e: any) => setEditDocCategory(e.target.value)}
                className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
              >
                <option value="inventory">Estoque de Carros</option>
                <option value="brand_voice">Voz da Marca</option>
                <option value="manual">Manuais e Fichas</option>
                <option value="strategy">Estratégia & Tráfego</option>
                <option value="custom">Personalizado</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[9px] font-black uppercase text-muted-foreground/80">Conteúdo do Grounding</label>
              <textarea
                rows={9}
                value={editDocContent}
                onChange={(e) => setEditDocContent(e.target.value)}
                className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30 font-mono resize-none leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <button
                type="button"
                onClick={() => setEditingDoc(null)}
                disabled={savingDocEdit}
                className="px-4 py-2 rounded-xl border border-border hover:bg-white/5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all uppercase"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveEditDoc}
                disabled={savingDocEdit || !editDocTitle.trim() || !editDocContent.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-xl bg-amber-500 hover:brightness-110 text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-40 shadow-[0_0_15px_rgba(245,158,11,0.25)]"
              >
                {savingDocEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {savingDocEdit ? "Salvando Alterações..." : "Salvar Alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
