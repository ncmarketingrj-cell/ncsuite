import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Share2, Calendar, Layout, BarChart2, Plus, ArrowRight, Sparkles, Clock, MapPin, 
  Trash2, Edit, AlertCircle, CheckCircle2, FileText, Send, Check, Loader2, RefreshCw, 
  Instagram, Facebook, Eye, ChevronLeft, ChevronRight, MessageSquare, Heart, Bookmark,
  ThumbsUp, MessageCircle, Info, CalendarCheck, HelpCircle, X, Upload
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { 
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, 
  addMonths, subMonths, parseISO, isAfter, isBefore 
} from "date-fns";
import { ptBR } from "date-fns/locale";

// Drag and Drop imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export const Route = createFileRoute("/_app/social")({
  head: () => ({ meta: [{ title: "Social Media — NC Suite" }] }),
  component: SocialMediaPage,
});

// Datas Comemorativas Automotivas Fictícias e Reais
const AUTOMOTIVE_HOLIDAYS = [
  { day: 12, month: 5, name: "Dia dos Namorados", suggestion: "Presenteie quem você ama com um seminovo premium. Copie essa ideia!" },
  { day: 20, month: 5, name: "Feirão de Inverno", suggestion: "Prepare seu carro para as viagens frias. Faça revisão gratuita aqui!" },
  { day: 25, month: 6, name: "Dia do Motorista", suggestion: "Homenagem a quem move o país. Ofertas especiais de taxa zero!" },
  { day: 15, month: 8, name: "Dia do Cliente", suggestion: "Condições especiais e IPVA grátis para agradecer sua parceria!" },
  { day: 10, month: 9, name: "Feirão Especial NC", suggestion: "O maior feirão de seminovos com entrada facilitada em 18x." },
  { day: 27, month: 10, name: "Black Friday", suggestion: "Descontos reais de até R$ 10.000 no estoque. Aproveite já!" },
  { day: 18, month: 11, name: "Dia do Vendedor de Carros", suggestion: "Valorize o profissional que ajuda você a conquistar seu sonho." }
];

type TabType = "calendario" | "feed" | "timeline" | "analytics";

function SocialMediaPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabType>("calendario");
  const [currentMonth, setCurrentMonth] = useState(new Date());
  
  // Drawer states
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  
  // Form states
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [postType, setPostType] = useState<"feed" | "stories" | "reels">("feed");
  const [platform, setPlatform] = useState<"instagram" | "facebook" | "both">("instagram");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("12:00");
  const [status, setStatus] = useState<"draft" | "pending_approval" | "scheduled">("scheduled");
  const [uploading, setUploading] = useState(false);
  const [targetPageId, setTargetPageId] = useState("");

  // AI assistant states
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiTone, setAiTone] = useState("descontraído");
  const [generatingCaption, setGeneratingCaption] = useState(false);
  
  // Instagram shopping tag state
  const [carTag, setCarTag] = useState("");
  const [tagPosition, setTagPosition] = useState<{ x: number; y: number } | null>(null);

  const { data: metaConfig } = useQuery({
    queryKey: ["meta_social_configs"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      return data as any;
    }
  });

  const { data: socialPages = [] } = useQuery({
    queryKey: ["social_pages"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("social_pages").select("*").order("page_name");
      return (data || []) as any[];
    }
  });

  const [selectedPageId, setSelectedPageId] = useState<string>("all");

  const { data: posts = [], isLoading: loadingPosts } = useQuery({
    queryKey: ["social_posts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("social_posts")
        .select("*")
        .order("scheduled_at", { ascending: true, nullsFirst: true });
      return (data || []) as any[];
    }
  });

  const filteredPosts = posts.filter(p => selectedPageId === "all" || p.page_id === selectedPageId);

  // Fetch Meta Pages list (for fallback/display warnings)
  const isMetaConnected = socialPages.length > 0;

  // Mutation to create/update post
  const savePostMutation = useMutation({
    mutationFn: async (postData: any) => {
      if (postData.id) {
        const { error } = await (supabase as any)
          .from("social_posts")
          .update(postData)
          .eq("id", postData.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("social_posts")
          .insert({ ...postData, user_id: user?.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      toast.success("Publicação salva com sucesso!");
      setIsDrawerOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      toast.error(`Erro ao salvar publicação: ${err.message}`);
    }
  });

  // Mutation to delete post
  const deletePostMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await (supabase as any)
        .from("social_posts")
        .delete()
        .eq("id", postId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      toast.success("Publicação deletada!");
    }
  });

  // Mutation to trigger immediate publish via Edge Function
  const publishNowMutation = useMutation({
    mutationFn: async (postId: string) => {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "publish-now", post_id: postId }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      toast.success("Postagem veiculada no Meta com sucesso!");
    },
    onError: (err: any) => {
      toast.error(`Erro ao publicar: ${err.message}`);
    }
  });

  // Mutation to sync analytics metrics
  const syncMetricsMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "sync-metrics" }
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["social_posts"] });
      toast.success("Métricas atualizadas do Meta!");
    },
    onError: (err: any) => {
      toast.error(`Erro ao atualizar métricas: ${err.message}`);
    }
  });

  // Reset Form fields
  const resetForm = () => {
    setTitle("");
    setContent("");
    setMediaUrl("");
    setPostType("feed");
    setPlatform("instagram");
    setScheduledDate("");
    setScheduledTime("12:00");
    setStatus("scheduled");
    setEditingPost(null);
    setCarTag("");
    setTagPosition(null);
    setAiPrompt("");
    setTargetPageId("");
  };

  // Open drawer for editing
  const openEdit = (post: any) => {
    setEditingPost(post);
    setTitle(post.title || "");
    setContent(post.content || "");
    setMediaUrl(post.media_url || "");
    setPostType(post.post_type || "feed");
    setPlatform(post.platform || "instagram");
    setStatus(post.status || "scheduled");
    setTargetPageId(post.page_id || "");
    
    if (post.scheduled_at) {
      const dateObj = new Date(post.scheduled_at);
      setScheduledDate(format(dateObj, "yyyy-MM-dd"));
      setScheduledTime(format(dateObj, "HH:mm"));
    } else {
      setScheduledDate("");
      setScheduledTime("12:00");
    }
    
    if (post.product_tags && post.product_tags.length > 0) {
      setCarTag(post.product_tags[0].name || "");
      setTagPosition({ x: post.product_tags[0].x || 50, y: post.product_tags[0].y || 50 });
    } else {
      setCarTag("");
      setTagPosition(null);
    }
    
    setIsDrawerOpen(true);
  };

  // Handle media upload
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}.${fileExt}`;
      const filePath = `social/${user?.id}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('media')
        .upload(filePath, file);

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('media')
        .getPublicUrl(filePath);

      setMediaUrl(publicUrl);
      toast.success("Mídia enviada com sucesso!");
    } catch (err: any) {
      toast.error(`Erro no upload: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Submit Post creation/update
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("Legenda é obrigatória.");
      return;
    }

    let isoScheduled = null;
    if (status !== "draft" && scheduledDate) {
      isoScheduled = new Date(`${scheduledDate}T${scheduledTime}:00`).toISOString();
    }

    const payload: any = {
      title: title || "Nova Publicação",
      content,
      media_url: mediaUrl || null,
      post_type: postType,
      platform,
      status: status,
      scheduled_at: isoScheduled,
      product_tags: carTag && tagPosition ? [{ name: carTag, x: tagPosition.x, y: tagPosition.y }] : [],
      page_id: targetPageId || null
    };

    if (editingPost) {
      payload.id = editingPost.id;
    }

    savePostMutation.mutate(payload);
  };

  // AI Assist Caption Generator
  const generateCaption = async () => {
    if (!aiPrompt.trim()) {
      toast.error("Descreva o que deseja postar para a IA.");
      return;
    }

    setGeneratingCaption(true);
    try {
      const { data, error } = await supabase.functions.invoke("sync-social-media", {
        body: { action: "ai-generate-caption", prompt: aiPrompt, tone: aiTone }
      });
      if (error) throw error;
      setContent(data.caption);
      toast.success("Legenda gerada com IA!");
    } catch (err: any) {
      toast.error(`Erro ao gerar legenda: ${err.message}`);
    } finally {
      setGeneratingCaption(false);
    }
  };

  // Automatically suggest posting time
  const suggestPostingTime = () => {
    // mLabs simulator: suggests high traffic hours for auto niche (12:30 or 19:15)
    const times = ["12:15", "18:30", "19:45"];
    const picked = times[Math.floor(Math.random() * times.length)];
    setScheduledTime(picked);
    toast.success(`Horário nobre sugerido: ${picked}!`);
  };

  // Click on a preview image to tag a product (Facebook/Instagram Shop)
  const handlePreviewImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mediaUrl) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    setTagPosition({ x, y });
    setCarTag("SUV Chevrolet Tracker 2024"); // prefill sample
    toast.info("Posição da tag definida! Insira o nome do veículo ao lado.");
  };

  // Drag and drop sensor configuration for the Feed Planner Grid
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handles drag reorder of scheduled posts inside the feed preview
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const scheduledPosts = posts.filter(p => p.status === "scheduled");
    const activeIndex = scheduledPosts.findIndex(p => p.id === active.id);
    const overIndex = scheduledPosts.findIndex(p => p.id === over.id);

    if (activeIndex !== -1 && overIndex !== -1) {
      const reordered = arrayMove(scheduledPosts, activeIndex, overIndex);
      
      // 1. Calcula as novas datas localmente
      const baseDate = reordered[0].scheduled_at ? new Date(reordered[0].scheduled_at) : new Date();
      const updatedDatesMap = new Map<string, string>();
      reordered.forEach((post, i) => {
        const newDate = new Date(baseDate);
        newDate.setDate(baseDate.getDate() + i);
        updatedDatesMap.set(post.id, newDate.toISOString());
      });

      // 2. Atualização Otimista no Cache da Query (Zero Lag Visual)
      qc.setQueryData(["social_posts"], (oldPosts: any[] | undefined) => {
        if (!oldPosts) return [];
        return oldPosts.map(post => {
          if (updatedDatesMap.has(post.id)) {
            return { ...post, scheduled_at: updatedDatesMap.get(post.id) };
          }
          return post;
        });
      });

      toast.info("Ajustando datas de postagem conforme a nova ordem visual...");

      // 3. Atualizações no banco em paralelo via Promise.all
      try {
        await Promise.all(
          reordered.map((post) => {
            const newDateStr = updatedDatesMap.get(post.id);
            return (supabase as any)
              .from("social_posts")
              .update({ scheduled_at: newDateStr })
              .eq("id", post.id);
          })
        );
        toast.success("Grade de postagem atualizada!");
      } catch (err: any) {
        toast.error("Erro ao salvar ordem no servidor.");
        qc.invalidateQueries({ queryKey: ["social_posts"] });
      }
    }
  };

  // Calendar calculations
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Group posts by status
  const scheduledPosts = filteredPosts.filter(p => p.status === "scheduled");
  const publishedPosts = filteredPosts.filter(p => p.status === "published");
  const draftPosts = filteredPosts.filter(p => p.status === "draft" || p.status === "pending_approval");

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="label-mono text-primary text-[10px] uppercase tracking-widest">Social Media Planner</span>
          <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2 mt-0.5">
            <Share2 className="h-6 w-6 text-primary animate-pulse" /> Inteligência Editorial
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Agende postagens orgânicas (Feed, Reels, Stories) e otimize com IA no Meta.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {socialPages.length > 0 && (
            <select
              value={selectedPageId}
              onChange={(e) => setSelectedPageId(e.target.value)}
              className="rounded-xl border border-white/10 bg-card px-3 py-2 text-xs font-bold text-muted-foreground focus:outline-none"
            >
              <option value="all">Todas as Páginas / Contas</option>
              {socialPages.map((sp: any) => (
                <option key={sp.page_id} value={sp.page_id}>
                  {sp.page_name} {sp.instagram_handle ? `(@${sp.instagram_handle})` : ""}
                </option>
              ))}
            </select>
          )}
          <button 
            onClick={() => syncMetricsMutation.mutate()} 
            disabled={syncMetricsMutation.isPending}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition disabled:opacity-50 cursor-pointer"
          >
            {syncMetricsMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sincronizar Métricas
          </button>
          <button 
            onClick={() => { resetForm(); setIsDrawerOpen(true); }}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" /> Criar Publicação
          </button>
        </div>
      </div>

      {/* Warnings & Meta Connection status */}
      {!isMetaConnected && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-xs font-bold text-yellow-400">Meta Ads Config não integrada para Social Media</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
              Suas páginas e contas não estão vinculadas nas configurações do aplicativo. As publicações serão salvas localmente
              com IDs simulados para demonstração comercial. Acesse **Configurações → Integrações Master** para vincular.
            </p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1 overflow-x-auto scrollbar-none">
        {(["calendario", "feed", "timeline", "analytics"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`relative rounded-t-xl px-5 py-3 text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
              activeTab === t 
                ? "text-primary border-b-2 border-primary bg-primary/5 font-black" 
                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2">
              {t === "calendario" && <Calendar className="h-3.5 w-3.5" />}
              {t === "feed" && <Layout className="h-3.5 w-3.5" />}
              {t === "timeline" && <FileText className="h-3.5 w-3.5" />}
              {t === "analytics" && <BarChart2 className="h-3.5 w-3.5" />}
              <span className="capitalize">{t === "calendario" ? "Calendário Editorial" : t === "feed" ? "Instagram Grid Planner" : t === "timeline" ? "Lista de Posts" : "Desempenho"}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      <div className="min-h-[400px]">
        {/* ====================================================
            TAB: CALENDÁRIO EDITORIAL
            ==================================================== */}
        {activeTab === "calendario" && (
          <div className="space-y-4">
            {/* Header Calendário */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase text-foreground">
                {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
              </h3>
              <div className="flex gap-1">
                <button 
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 border border-white/10 rounded-lg hover:bg-white/5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button 
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 border border-white/10 rounded-lg hover:bg-white/5 cursor-pointer text-muted-foreground hover:text-foreground"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Grid de dias da semana */}
            <div className="grid grid-cols-7 gap-2 text-center text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map(day => (
                <div key={day} className="py-1">{day}</div>
              ))}
            </div>

            {/* Grid do mês */}
            <div className="grid grid-cols-7 gap-2">
              {calendarDays.map((day, idx) => {
                const dayPosts = filteredPosts.filter(p => p.scheduled_at && isSameDay(parseISO(p.scheduled_at), day));
                const isToday = isSameDay(day, new Date());
                const holiday = AUTOMOTIVE_HOLIDAYS.find(h => h.day === day.getDate() && h.month === day.getMonth());

                return (
                  <div 
                    key={idx}
                    className={`min-h-[90px] border rounded-2xl p-2.5 flex flex-col justify-between transition-all ${
                      isToday 
                        ? "bg-primary/5 border-primary/40 shadow-glow-sm" 
                        : "bg-white/[0.01] border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className={`text-xs font-bold ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                        {day.getDate()}
                      </span>
                      {holiday && (
                        <div 
                          className="h-1.5 w-1.5 rounded-full bg-amber-500 cursor-help"
                          title={`${holiday.name}: ${holiday.suggestion}`}
                          onClick={() => {
                            resetForm();
                            setScheduledDate(format(day, "yyyy-MM-dd"));
                            setTitle(`Especial ${holiday.name}`);
                            setContent(`🚗 ${holiday.suggestion}\n\n#NCPerformance #Seminovos #Estoque`);
                            setIsDrawerOpen(true);
                          }}
                        />
                      )}
                    </div>

                    {/* Posts do dia */}
                    <div className="space-y-1">
                      {dayPosts.map((post) => (
                        <button
                          key={post.id}
                          onClick={() => openEdit(post)}
                          className={`w-full text-left truncate text-[9px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1 ${
                            post.status === "published"
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : post.status === "pending_approval"
                              ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                              : "bg-primary/10 text-primary border border-primary/20"
                          }`}
                        >
                          {post.platform === "instagram" ? <Instagram className="h-2 w-2" /> : post.platform === "facebook" ? <Facebook className="h-2 w-2" /> : <Share2 className="h-2 w-2" />}
                          {post.title || "Sem título"}
                        </button>
                      ))}
                    </div>

                    {/* Add button inside empty day cell */}
                    {dayPosts.length === 0 && (
                      <button 
                        onClick={() => {
                          resetForm();
                          setScheduledDate(format(day, "yyyy-MM-dd"));
                          setIsDrawerOpen(true);
                        }}
                        className="opacity-0 hover:opacity-100 w-full flex items-center justify-center p-1 border border-dashed border-white/10 rounded-lg text-muted-foreground hover:text-primary transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Dica do Calendário */}
            <div className="rounded-xl border border-white/5 bg-white/[0.01] p-4 flex items-center gap-3 mt-4">
              <Info className="h-4.5 w-4.5 text-amber-500" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                <span className="text-amber-400 font-bold">Dica Editorial:</span> Os círculos âmbar <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"></span> no calendário indicam datas comerciais ou comemorativas para o mercado automotivo. Clique nelas para criar uma postagem com sugestões persuasivas pré-configuradas!
              </p>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB: INSTAGRAM GRID PLANNER (DRAG & DROP)
            ==================================================== */}
        {activeTab === "feed" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Esquerda: Instruções e listagem lateral */}
            <div className="space-y-4 lg:col-span-1">
              <h4 className="text-sm font-black uppercase tracking-wider text-primary">Harmonia Visual do Feed</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Arraste e solte as miniaturas das postagens agendadas dentro do feed móvel fictício ao lado.
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                O planejador recalculará as datas (`scheduled_at`) de forma contígua a partir da primeira data de postagem agendada, facilitando a harmonia estética do perfil do Instagram.
              </p>

              <div className="rounded-2xl border border-white/5 bg-white/[0.01] p-4 space-y-3">
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Legenda dos Status:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-green-500/10 border border-green-500/20 px-2 py-0.5 text-[9px] text-green-400 font-bold">Publicado</span>
                  <span className="rounded-full bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] text-primary font-bold">Agendado</span>
                  <span className="rounded-full bg-yellow-500/10 border border-yellow-500/20 px-2 py-0.5 text-[9px] text-yellow-400 font-bold">Em Aprovação</span>
                </div>
              </div>
            </div>

            {/* Centro: O Celular Mockup com Feed Grid */}
            <div className="lg:col-span-2 flex justify-center py-4">
              <div className="relative w-80 rounded-[40px] border-4 border-white/10 bg-black p-3 shadow-2xl">
                {/* Speaker e Câmera */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-36 h-5 bg-black rounded-b-xl flex items-center justify-center gap-1.5 z-20">
                  <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
                  <div className="w-12 h-1 bg-zinc-800 rounded-full" />
                </div>

                {/* Top header do Instagram mockup */}
                <div className="mt-6 flex justify-between items-center px-4 pb-2 border-b border-white/5">
                  <span className="text-[11px] font-bold">{metaConfig?.instagram_handle ? `@${metaConfig.instagram_handle}` : "@ncperformance"}</span>
                  <Instagram className="h-4 w-4 text-primary" />
                </div>

                {/* Perfil Header */}
                <div className="px-4 py-3 flex gap-3 items-center">
                  <div className="h-12 w-12 rounded-full border border-primary/45 p-0.5">
                    <div className="h-full w-full rounded-full bg-zinc-800 flex items-center justify-center text-xs font-bold text-white uppercase">NC</div>
                  </div>
                  <div className="flex-1 text-[10px]">
                    <p className="font-bold">{metaConfig?.facebook_page_name || "NC Seminovos"}</p>
                    <p className="text-muted-foreground leading-normal mt-0.5">Veículos Premium & Atendimento Personalizado</p>
                  </div>
                </div>

                {/* Grid 3 Colunas com DndContext */}
                <div className="mt-2 min-h-[300px]">
                  <DndContext 
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext 
                      items={scheduledPosts.map(p => p.id)}
                      strategy={rectSortingStrategy}
                    >
                      <div className="grid grid-cols-3 gap-1">
                        {/* 1. Primeiro renderiza os posts publicados (estáticos, não arrastáveis) */}
                        {publishedPosts.map((post) => (
                          <div 
                            key={post.id} 
                            onClick={() => openEdit(post)}
                            className="relative aspect-square rounded overflow-hidden border border-white/5 bg-white/[0.01] cursor-pointer"
                          >
                            <img 
                              src={post.media_url || "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60"} 
                              alt="Published" 
                              className="w-full h-full object-cover grayscale-[30%]"
                            />
                            <div className="absolute top-1 right-1 h-3 w-3 bg-green-500 rounded-full border border-black flex items-center justify-center">
                              <Check className="h-2 w-2 text-white" />
                            </div>
                          </div>
                        ))}

                        {/* 2. Em seguida renderiza os posts agendados (dinâmicos, arrastáveis) */}
                        {scheduledPosts.map((post) => (
                          <SortableGridItem 
                            key={post.id} 
                            id={post.id} 
                            post={post} 
                            onClick={() => openEdit(post)}
                          />
                        ))}

                        {/* Fallback de grid vazia */}
                        {filteredPosts.length === 0 && (
                          <div className="col-span-3 py-16 text-center text-xs text-muted-foreground flex flex-col items-center justify-center">
                            <Instagram className="h-8 w-8 opacity-30 mb-2" />
                            Nenhuma foto no feed
                          </div>
                        )}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB: TIMELINE / LISTA DE POSTS
            ==================================================== */}
        {activeTab === "timeline" && (
          <div className="space-y-6">
            {/* Abas internas de Status */}
            <div className="grid gap-4">
              <div className="glass-panel p-6 space-y-4">
                <h3 className="text-xs font-black uppercase text-primary tracking-widest">Publicações Agendadas e Rascunhos</h3>
                {loadingPosts ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : filteredPosts.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">Nenhuma postagem cadastrada.</p>
                ) : (
                  <div className="grid gap-3">
                    {filteredPosts.map((post) => (
                      <div 
                        key={post.id} 
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 border border-white/5 bg-background/20 rounded-2xl transition hover:border-primary/20"
                      >
                        <div className="flex items-start gap-4 flex-1 min-w-0">
                          {/* Mídia miniatura */}
                          <div className="h-14 w-14 rounded-xl overflow-hidden bg-zinc-900 shrink-0 border border-white/5">
                            {post.media_url ? (
                              <img src={post.media_url} alt="Miniatura" className="h-full w-full object-cover" />
                            ) : (
                              <div className="h-full w-full flex items-center justify-center text-[9px] font-black text-muted-foreground bg-white/5 uppercase">Texto</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground truncate">{post.title || "Nova Publicação"}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[8px] font-bold ${
                                post.status === "published"
                                  ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                  : post.status === "pending_approval"
                                  ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                                  : "bg-primary/10 text-primary border border-primary/20"
                              }`}>
                                {post.status === "published" ? "PUBLICADO" : post.status === "pending_approval" ? "APROVAÇÃO PENDENTE" : "AGENDADO"}
                              </span>
                              <span className="text-[9px] text-muted-foreground font-semibold uppercase">{post.post_type}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 pr-6">{post.content}</p>
                            {post.scheduled_at && (
                              <p className="text-[9px] text-primary flex items-center gap-1">
                                <Clock className="h-3 w-3" /> 
                                {format(parseISO(post.scheduled_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {post.status !== "published" && (
                            <button
                              onClick={() => publishNowMutation.mutate(post.id)}
                              disabled={publishNowMutation.isPending}
                              className="inline-flex items-center gap-1 bg-primary px-3 py-1.5 rounded-xl text-[10px] font-bold text-primary-foreground hover:shadow-glow transition cursor-pointer"
                            >
                              Publicar Agora
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(post)}
                            className="p-2 border border-white/5 hover:border-primary/20 hover:text-primary rounded-xl transition cursor-pointer text-muted-foreground"
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => deletePostMutation.mutate(post.id)}
                            className="p-2 border border-white/5 hover:border-destructive hover:text-destructive rounded-xl transition cursor-pointer text-muted-foreground"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====================================================
            TAB: ANALYTICS / DESEMPENHO
            ==================================================== */}
        {activeTab === "analytics" && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-4">
              {[
                { label: "Curtidas Totais", val: filteredPosts.reduce((acc, p) => acc + (p.likes_count || 0), 0), icon: Heart, color: "text-red-500 bg-red-500/10" },
                { label: "Comentários", val: filteredPosts.reduce((acc, p) => acc + (p.comments_count || 0), 0), icon: MessageSquare, color: "text-blue-500 bg-blue-500/10" },
                { label: "Alcance Orgânico", val: filteredPosts.reduce((acc, p) => acc + (p.reach_count || 0), 0), icon: Share2, color: "text-primary bg-primary/10" },
                { label: "Impressões", val: filteredPosts.reduce((acc, p) => acc + (p.impressions_count || 0), 0), icon: Eye, color: "text-violet-500 bg-violet-500/10" }
              ].map((kpi, idx) => (
                <div key={idx} className="glass-panel p-5 space-y-2 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="label-mono text-[9px] text-muted-foreground uppercase">{kpi.label}</span>
                    <div className={`h-7 w-7 rounded-lg flex items-center justify-center ${kpi.color}`}>
                      <kpi.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <h3 className="font-display font-black text-xl tracking-tight text-foreground mt-2">{kpi.val.toLocaleString("pt-BR")}</h3>
                </div>
              ))}
            </div>

            {/* Tabela de performance de posts */}
            <div className="glass-panel p-6 space-y-4">
              <h4 className="text-xs font-black uppercase tracking-widest text-primary">Relatório de Posts Veiculados</h4>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-white/5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                      <th className="py-3 px-4">Post</th>
                      <th className="py-3 px-4">Canal</th>
                      <th className="py-3 px-4">Format</th>
                      <th className="py-3 px-4 text-center">Curtidas</th>
                      <th className="py-3 px-4 text-center">Comentários</th>
                      <th className="py-3 px-4 text-center">Alcance</th>
                      <th className="py-3 px-4 text-center">Engajamento</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publishedPosts.map((post) => {
                      const totalEng = (post.likes_count || 0) + (post.comments_count || 0);
                      const reach = post.reach_count || 1;
                      const engRate = ((totalEng / reach) * 100).toFixed(1);

                      return (
                        <tr key={post.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-all">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              {post.media_url ? (
                                <img src={post.media_url} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                              ) : (
                                <div className="h-8 w-8 rounded-lg bg-zinc-800 flex items-center justify-center text-[7px] font-black text-muted-foreground uppercase shrink-0">Txt</div>
                              )}
                              <span className="font-semibold text-foreground truncate max-w-[150px]">{post.title || "Post"}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 capitalize">{post.platform}</td>
                          <td className="py-3 px-4 capitalize font-semibold">{post.post_type}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-red-400">{post.likes_count || 0}</td>
                          <td className="py-3 px-4 text-center font-mono font-bold text-blue-400">{post.comments_count || 0}</td>
                          <td className="py-3 px-4 text-center font-mono">{post.reach_count || 0}</td>
                          <td className="py-3 px-4 text-center">
                            <span className="rounded bg-primary/10 px-2 py-0.5 font-bold font-mono text-primary text-[10px]">
                              {engRate}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {publishedPosts.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-muted-foreground text-xs font-semibold">Nenhuma postagem publicada para exibir análise de performance.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ====================================================
          POST CREATOR DRAWER / MODAL
          ==================================================== */}
      <AnimatePresence>
        {isDrawerOpen && (
          <>
            {/* Dark overlay backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDrawerOpen(false)}
              className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 250 }}
              className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-2xl bg-card border-l border-white/5 p-6 shadow-2xl overflow-y-auto"
            >
              {/* Header drawer */}
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h3 className="font-display font-black text-lg text-gradient flex items-center gap-2">
                    <Share2 className="h-5 w-5 text-primary" /> {editingPost ? "Editar Publicação" : "Nova Publicação"}
                  </h3>
                  <p className="text-[10px] text-muted-foreground uppercase mt-0.5">Planejamento Visual NC</p>
                </div>
                <button 
                  onClick={() => setIsDrawerOpen(false)} 
                  className="rounded-full bg-white/5 p-2 text-muted-foreground hover:text-foreground cursor-pointer hover:bg-white/10"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  
                  {/* ESQUERDA: Editor de Formulário */}
                  <div className="space-y-4">
                    {/* Título Identificador */}
                    <div className="space-y-1.5">
                      <label className="label-mono text-[9px] text-muted-foreground uppercase">Título do Post (Interno)</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Tracker 2024 - Feirão"
                        className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Página / Perfil de Destino */}
                    {socialPages.length > 0 && (
                      <div className="space-y-1.5">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Página / Perfil de Destino</label>
                        <select
                          value={targetPageId}
                          onChange={(e) => setTargetPageId(e.target.value)}
                          className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="">Selecione a Página Alvo</option>
                          {socialPages.map((sp: any) => (
                            <option key={sp.page_id} value={sp.page_id}>
                              {sp.page_name} {sp.instagram_handle ? `(@${sp.instagram_handle})` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Canais / Plataformas */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1.5">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Plataforma</label>
                        <select
                          value={platform}
                          onChange={(e) => setPlatform(e.target.value as any)}
                          className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="instagram">Instagram</option>
                          <option value="facebook">Facebook</option>
                          <option value="both">Ambos (Meta)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Formato</label>
                        <select
                          value={postType}
                          onChange={(e) => setPostType(e.target.value as any)}
                          className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none font-bold"
                        >
                          <option value="feed">Feed</option>
                          <option value="stories">Stories</option>
                          <option value="reels">Reels (Vídeo)</option>
                        </select>
                      </div>
                    </div>

                    {/* Media Upload */}
                    <div className="space-y-1.5">
                      <label className="label-mono text-[9px] text-muted-foreground uppercase">Mídia da Postagem</label>
                      <div className="flex gap-2">
                        <input
                          value={mediaUrl}
                          onChange={(e) => setMediaUrl(e.target.value)}
                          placeholder="Link da imagem/vídeo..."
                          className="flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none font-mono"
                        />
                        <label className="rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2 text-xs font-semibold flex items-center justify-center shrink-0 cursor-pointer transition">
                          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          <input type="file" onChange={handleUpload} accept="image/*,video/*" className="hidden" />
                        </label>
                      </div>
                    </div>

                    {/* Tagging / Instagram Shopping Simulator */}
                    {mediaUrl && postType === "feed" && (
                      <div className="space-y-1.5 border border-white/5 bg-white/[0.01] p-3 rounded-xl">
                        <label className="label-mono text-[9px] text-primary uppercase flex items-center gap-1">
                          <Bookmark className="h-3.5 w-3.5" /> Instagram Shopping
                        </label>
                        <p className="text-[10px] text-muted-foreground">Clique na foto do preview ao lado para posicionar a tag de veículo.</p>
                        <input
                          value={carTag}
                          onChange={(e) => setCarTag(e.target.value)}
                          placeholder="Marca/Modelo do veículo (ex: Tracker 2024)"
                          className="w-full mt-2 rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>
                    )}

                    {/* Copy Caption Editor */}
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Legenda do Post</label>
                        <span className="text-[9px] text-muted-foreground font-mono">{content.length}/2200</span>
                      </div>
                      <textarea
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Escreva a legenda e hashtags..."
                        rows={4}
                        className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none resize-none leading-relaxed"
                      />
                    </div>

                    {/* AI ASSISTANT SECTION */}
                    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center gap-2 text-primary">
                        <Sparkles className="h-4.5 w-4.5 animate-pulse" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">Assistente AI Copywriter</h4>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Descreva resumidamente os ganchos de venda do veículo e gere a legenda ideal.</p>
                      <input 
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                        placeholder="Ex: Oferta de Compass 2023 Longitude por R$ 139.900"
                        className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                      />
                      <div className="flex items-center justify-between gap-2">
                        <select
                          value={aiTone}
                          onChange={(e) => setAiTone(e.target.value)}
                          className="rounded-lg border border-white/10 bg-background px-2.5 py-1.5 text-[10px] text-foreground focus:border-primary focus:outline-none"
                        >
                          <option value="descontraído">Descontraído</option>
                          <option value="técnico">Técnico/Especificações</option>
                          <option value="promocional">Promocional/Urgente</option>
                        </select>
                        <button
                          type="button"
                          onClick={generateCaption}
                          disabled={generatingCaption || !aiPrompt}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-[10px] font-bold text-primary-foreground hover:shadow-glow disabled:opacity-50 transition cursor-pointer"
                        >
                          {generatingCaption ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                          Gerar Legenda
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* DIREITA: Mockup de Celular (Live Preview) */}
                  <div className="space-y-4">
                    <label className="label-mono text-[9px] text-muted-foreground uppercase">Pré-visualização em tempo real</label>
                    
                    {/* Mockup Instagram */}
                    <div className="rounded-3xl border border-white/10 bg-black p-3.5 shadow-xl max-w-sm mx-auto">
                      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                        <div className="h-6 w-6 rounded-full bg-zinc-800 flex items-center justify-center text-[8px] font-bold">NC</div>
                        <div className="flex-1 text-[9px] font-bold leading-none">
                          <p>{metaConfig?.facebook_page_name || "NC Performance"}</p>
                          <p className="text-[7px] text-muted-foreground font-normal mt-0.5">{scheduledDate ? `Agendado para ${scheduledDate}` : "Publicação Imediata"}</p>
                        </div>
                        {platform === "instagram" ? <Instagram className="h-3 w-3 text-pink-500" /> : platform === "facebook" ? <Facebook className="h-3 w-3 text-blue-500" /> : <Share2 className="h-3 w-3 text-primary" />}
                      </div>

                      {/* Conteúdo de mídia do preview */}
                      <div 
                        onClick={handlePreviewImageClick}
                        className="relative aspect-square bg-zinc-900 rounded-xl overflow-hidden mt-3 cursor-crosshair group/tag"
                      >
                        {mediaUrl ? (
                          mediaUrl.endsWith(".mp4") || postType === "reels" ? (
                            <video src={mediaUrl} autoPlay loop muted className="w-full h-full object-cover" />
                          ) : (
                            <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                          )
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-2 text-center p-4">
                            <Eye className="h-8 w-8 opacity-30" />
                            <p className="text-[10px] font-bold">Sem imagem ou vídeo</p>
                            <p className="text-[8px] opacity-60">Suba um arquivo para gerar o preview de feed</p>
                          </div>
                        )}

                        {/* Interactive shopping tag indicator */}
                        {tagPosition && carTag && (
                          <div 
                            style={{ left: `${tagPosition.x}%`, top: `${tagPosition.y}%` }}
                            className="absolute -translate-x-1/2 -translate-y-1/2 bg-black/85 border border-white/10 text-white font-bold text-[9px] px-2 py-0.5 rounded shadow-xl flex items-center gap-1 z-10 whitespace-nowrap animate-bounce"
                          >
                            <Bookmark className="h-2.5 w-2.5 text-primary" /> {carTag}
                            <button 
                              type="button" 
                              onClick={(e) => { e.stopPropagation(); setTagPosition(null); setCarTag(""); }} 
                              className="text-red-400 hover:text-red-300 font-bold ml-1"
                            >
                              x
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Mockup de botões de interação */}
                      <div className="mt-3 flex justify-between items-center text-muted-foreground">
                        <div className="flex gap-3">
                          <Heart className="h-4 w-4" />
                          <MessageCircle className="h-4 w-4" />
                          <Send className="h-4 w-4" />
                        </div>
                        <Bookmark className="h-4 w-4" />
                      </div>

                      {/* Legenda Mockup */}
                      <div className="mt-2 text-[10px] leading-relaxed">
                        <span className="font-bold mr-1">{metaConfig?.instagram_handle || "ncperformance"}</span>
                        <span className="text-muted-foreground whitespace-pre-line">{content || "Escreva a legenda para vê-la formatada aqui..."}</span>
                      </div>
                    </div>

                    {/* Date/Time pickers */}
                    <div className="space-y-3 border border-white/5 bg-white/[0.01] p-4 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Agendamento de Postagem</label>
                        <button 
                          type="button" 
                          onClick={suggestPostingTime}
                          className="text-[9px] text-primary font-bold hover:underline"
                        >
                          Sugerir Horário Nobre
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                        <input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className="rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary focus:outline-none"
                        />
                      </div>

                      {/* Workflow editorial status */}
                      <div className="space-y-1.5 pt-2">
                        <label className="label-mono text-[9px] text-muted-foreground uppercase">Fluxo Editorial</label>
                        <select
                          value={status}
                          onChange={(e) => setStatus(e.target.value as any)}
                          className="w-full rounded-lg border border-white/10 bg-background px-3 py-2 text-xs text-foreground focus:border-primary"
                        >
                          <option value="scheduled">Agendar Publicação</option>
                          <option value="pending_approval">Aguardando Aprovação (Gente/Gestor)</option>
                          <option value="draft">Salvar como Rascunho</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex gap-2 justify-end border-t border-white/5 pt-4 mt-6">
                  <button 
                    type="button" 
                    onClick={() => setIsDrawerOpen(false)} 
                    className="rounded-full border border-white/10 px-5 py-2 text-xs font-semibold text-muted-foreground hover:bg-white/5 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={savePostMutation.isPending}
                    className="rounded-full bg-primary px-6 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 disabled:opacity-50 transition cursor-pointer"
                  >
                    {savePostMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Post"}
                  </button>
                </div>
              </form>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// COMPONENT: Item do Grid Sortable (Dnd-Kit)
// ==========================================
interface SortableGridItemProps {
  id: string;
  post: any;
  onClick: () => void;
}

function SortableGridItem({ id, post, onClick }: SortableGridItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className="relative aspect-square rounded overflow-hidden border border-primary/20 bg-primary/5 cursor-grab active:cursor-grabbing group shadow-inner"
    >
      <img 
        src={post.media_url || "https://images.unsplash.com/photo-1549399542-7e3f8b79c341?w=300&auto=format&fit=crop&q=60"} 
        alt="" 
        className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
      />
      {/* Platform badge */}
      <div className="absolute top-1 left-1 flex gap-0.5">
        {post.platform === "instagram" ? (
          <span className="bg-pink-500 p-0.5 rounded text-white"><Instagram className="h-2.5 w-2.5" /></span>
        ) : post.platform === "facebook" ? (
          <span className="bg-blue-600 p-0.5 rounded text-white"><Facebook className="h-2.5 w-2.5" /></span>
        ) : (
          <span className="bg-primary p-0.5 rounded text-white"><Share2 className="h-2.5 w-2.5" /></span>
        )}
      </div>

      {/* Hover visual details */}
      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center p-2 text-center pointer-events-none">
        <p className="text-[9px] font-black uppercase text-primary">Agendado</p>
        {post.scheduled_at && (
          <p className="text-[8px] text-white mt-0.5">
            {format(parseISO(post.scheduled_at), "dd/MM 'às' HH:mm")}
          </p>
        )}
      </div>
    </div>
  );
}
