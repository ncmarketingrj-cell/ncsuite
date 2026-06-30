import { useState, useEffect, useRef, useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  Bot, Send, Paperclip, X, Trash2, Pin, Plus, Search, 
  Loader2, User, Sparkles, TrendingUp, BarChart3, MessageSquare, 
  ShieldAlert, Settings, ArrowLeft, ArrowUpRight, Check, Play,
  BookOpen, FolderClosed, Zap, Share2, Mic, MicOff, UploadCloud, FileText, Database,
  Pencil
} from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { useVictoriaChat, type Message, type Conversation } from "@/hooks/useVictoriaChat";
import { ActionCard } from "@/components/victoria/ActionCard";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/victoria")({
  head: () => ({ meta: [{ title: "Victoria AI — NC Performance Suite" }] }),
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isKnowledgeOpen, setIsKnowledgeOpen] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState("");

  // Estados de Nova Base de Conhecimento
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState("");
  const [newKnowledgeContent, setNewKnowledgeContent] = useState("");
  const [newKnowledgeCategory, setNewKnowledgeCategory] = useState<'inventory' | 'brand_voice' | 'manual' | 'strategy' | 'custom'>("inventory");
  const [knowledgeSearchTerm, setKnowledgeSearchTerm] = useState("");
  const [savingKnowledge, setSavingKnowledge] = useState(false);
  const [extractingFile, setExtractingFile] = useState(false);
  const [seedingKnowledge, setSeedingKnowledge] = useState(false);

  // Estados de Entrada por Voz
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  // Hook customizado com lógica e persistência de conversas
  const chat = useVictoriaChat(selectedAccountId, setSelectedAccountId);

  // Buscar contas de anúncio para o dropdown
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts-victoria"],
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

  // Rolar para o final do chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    <div className="flex h-[calc(100vh-64px)] w-full overflow-hidden bg-background">
      {/* 1. SIDEBAR DE CONVERSAS */}
      <AnimatePresence initial={false}>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="flex flex-col h-full bg-card/40 border-r border-border/60 shrink-0 z-20 backdrop-blur-md"
          >
            {/* Cabeçalho do Sidebar */}
            <div className="p-4 flex flex-col gap-3">
              <button
                onClick={() => {
                  setIsKnowledgeOpen(false);
                  chat.setActiveConversationId(null);
                }}
                className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-all font-bold text-xs uppercase tracking-wider active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" />
                Nova Conversa
              </button>

              <button
                onClick={() => {
                  setIsKnowledgeOpen(true);
                  chat.setActiveConversationId(null);
                }}
                className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl border transition-all font-bold text-xs uppercase tracking-wider active:scale-[0.98] ${
                  isKnowledgeOpen 
                    ? "bg-amber-500/10 border-amber-500/30 text-amber-500" 
                    : "bg-input/20 border-border/50 text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"
                }`}
              >
                <BookOpen className="h-4 w-4" />
                Base de Conhecimento
              </button>

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
                      const isActive = !isKnowledgeOpen && chat.activeConversationId === c.id;
                      const isEditing = editingConversationId === c.id;

                      return (
                        <div
                          key={c.id}
                          onClick={() => {
                            if (!isEditing) {
                              setIsKnowledgeOpen(false);
                              chat.setActiveConversationId(c.id);
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
        )}
      </AnimatePresence>

      {/* 2. ÁREA CENTRAL DO CONTEÚDO */}
      <div className="flex-1 flex flex-col h-full bg-background relative z-10">
        {/* Topo do Painel */}
        <header className="px-6 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-background/50 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 -ml-2 rounded-xl hover:bg-white/5 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
              title={sidebarOpen ? "Ocultar painel" : "Mostrar painel"}
            >
              <ArrowLeft className={`h-4 w-4 transition-transform duration-300 ${sidebarOpen ? "" : "rotate-180"}`} />
            </button>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-glow-sm">
                <Bot className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h2 className="text-xs font-black text-foreground uppercase tracking-tight">
                  {isKnowledgeOpen ? "Central de Conhecimento" : "Victoria AI"}
                </h2>
                <p className="text-[9px] font-bold text-muted-foreground flex items-center gap-1 mt-0.5">
                  <span className="h-1 w-1 rounded-full bg-green-500" />
                  {isKnowledgeOpen ? "Base de Dados Vetorial RAG" : "Estrategista Digital e Mentora Sênior"}
                </p>
              </div>
            </div>
          </div>

          {/* Seletor de Conta de Anúncios */}
          <div className="flex items-center gap-2">
            <label className="text-[9px] font-black uppercase tracking-wider text-muted-foreground hidden sm:inline">Foco da IA:</label>
            <select
              value={selectedAccountId}
              onChange={(e) => handleSelectAccount(e.target.value)}
              className="bg-card border border-border/80 rounded-xl px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/30 transition-all font-medium min-w-[150px] max-w-[220px]"
            >
              <option value="">-- Nenhuma Conta Focada --</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>
          </div>
        </header>

        {isKnowledgeOpen ? (
          /* ===================================================================
             INTERFACES DA CENTRAL DE CONHECIMENTO (RAG)
             =================================================================== */
          <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar max-w-6xl mx-auto w-full">
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between border-b border-border/40 pb-3">
                <div>
                  <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                    <Database className="h-4 w-4" /> Alimentar a Inteligência
                  </h3>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mt-1">
                    Cadastre fichas de estoque, tom de voz ou manuais em PDF. Os documentos serão convertidos em vetores geométricos de 768 dimensões para grounding semântico nas respostas.
                  </p>
                </div>
                <button
                  onClick={() => setIsKnowledgeOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-border hover:bg-white/5 text-[10px] uppercase font-bold text-muted-foreground hover:text-foreground transition-all"
                >
                  Voltar ao Chat
                </button>
              </div>

              {/* Botão de seed NC Performance */}
              <div className="flex items-center gap-3 p-4 bg-amber-500/8 border border-amber-500/20 rounded-2xl">
                <div className="flex-1">
                  <p className="text-xs font-black text-amber-400">Base de Conhecimento NC Performance</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">Importa 12 documentos estratégicos: benchmarks, funis, protocolos, mercado automotivo RJ e capacidades da Victoria.</p>
                </div>
                <button
                  onClick={handleSeedKnowledge}
                  disabled={seedingKnowledge}
                  className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:brightness-110 text-black font-extrabold text-[10px] uppercase tracking-wider transition-all disabled:opacity-50 shadow-[0_0_12px_rgba(245,158,11,0.3)]"
                >
                  {seedingKnowledge ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {seedingKnowledge ? "Importando..." : "Importar Base"}
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                {/* Formulário de Envio (2 colunas) */}
                <div className="lg:col-span-2 flex flex-col gap-4 p-5 bg-card/30 border border-border/40 rounded-2xl backdrop-blur-md relative overflow-hidden">
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-amber-500/30 to-yellow-600/10" />
                  <h4 className="text-xs font-black uppercase text-foreground">Novo Documento</h4>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase text-muted-foreground/80">Título</label>
                    <input
                      type="text"
                      placeholder="Ex: Ficha do Corolla XEi 2023"
                      value={newKnowledgeTitle}
                      onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                      className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[9px] font-black uppercase text-muted-foreground/80">Categoria</label>
                      <select
                        value={newKnowledgeCategory}
                        onChange={(e: any) => setNewKnowledgeCategory(e.target.value)}
                        className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none"
                      >
                        <option value="inventory">Estoque de Carros</option>
                        <option value="brand_voice">Voz da Marca</option>
                        <option value="manual">Manuais e Fichas</option>
                        <option value="strategy">Estratégia</option>
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
                        disabled={extractingFile}
                        onClick={() => docInputRef.current?.click()}
                        className="w-full py-2 px-3 bg-background border border-border hover:bg-white/5 text-[10px] font-bold rounded-xl transition-all uppercase text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 disabled:opacity-50"
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
                      className="w-full bg-input/20 border border-border/60 rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-amber-500/30 focus:border-amber-500/30 font-mono resize-none"
                    />
                  </div>

                  <button
                    onClick={handleSaveKnowledge}
                    disabled={savingKnowledge || extractingFile || !newKnowledgeTitle.trim() || !newKnowledgeContent.trim()}
                    className="w-full py-2.5 rounded-xl bg-amber-500 hover:brightness-110 text-black font-extrabold text-xs uppercase tracking-wider transition-all disabled:opacity-40 flex items-center justify-center gap-2 mt-2 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                  >
                    {savingKnowledge ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    Treinar Victoria AI
                  </button>
                </div>

                {/* Lista de Conhecimentos Cadastrados (3 colunas) */}
                <div className="lg:col-span-3 flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase text-foreground">Documentos Treinados ({chat.knowledgeList.length})</h4>
                    
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

                  <div className="flex flex-col gap-3 max-h-[450px] overflow-y-auto pr-1 custom-scrollbar">
                    {chat.loadingKnowledge ? (
                      <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin text-amber-500" /> Carregando base...
                      </div>
                    ) : chat.knowledgeList.length === 0 ? (
                      <div className="text-center py-16 p-4 bg-card/10 border border-dashed border-border/60 rounded-2xl text-[10px] uppercase text-muted-foreground/60 tracking-widest leading-relaxed">
                        Nenhum documento cadastrado. Adicione um à esquerda.
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
                              <button
                                onClick={() => chat.deleteKnowledge(k.id)}
                                className="p-1.5 rounded-lg border border-transparent hover:border-red-500/20 hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors shrink-0"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
             INTERFACE TRADICIONAL DO CHAT COM IA
             =================================================================== */
          <>
            {/* Corpo do Chat / Mensagens */}
            <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-6 custom-scrollbar">
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
                      Fala, Comandante! Sou a Victoria AI.
                    </h1>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed max-w-md">
                      Sou a estrategista sênior da NC Performance. Tenho acesso total ao banco de dados (funis, métricas, social, clientes) e estou pronta para auditar campanhas, clonar estruturas ou gerar relatórios em segundos.
                    </p>
                  </div>

                  {/* Seletor de Conta Alerta se nenhuma selecionada */}
                  {!selectedAccountId && (
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-400 max-w-md text-left flex items-start gap-3">
                      <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                      <div>
                        <strong className="font-extrabold uppercase text-[10px] tracking-wider">Atenção Comandante:</strong>
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

            {/* Rodapé / Input de Chat */}
            <footer className="p-4 border-t border-border/60 bg-background/50 backdrop-blur-md">
              <div className="max-w-3xl mx-auto flex flex-col gap-3">
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
    </div>
  );
}
