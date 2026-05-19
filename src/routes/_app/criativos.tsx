import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Palette, Plus, Trash2, Tag, Image as ImageIcon, Loader2, Search,
  Sparkles, Check, AlertTriangle, AlertCircle, TrendingUp, Gauge, FileSearch, 
  Layers, Lightbulb, Compass, MapPin, Upload, X, ChevronRight, Zap
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { analyzeCreativeFn, type CreativeAIAnalysis } from "@/lib/criativo.functions";

export const Route = createFileRoute("/_app/criativos")({
  head: () => ({ meta: [{ title: "Criativos & IA — NC Suite" }] }),
  component: CriativosPage,
});

type SwipeFile = { 
  id: string; 
  title: string; 
  media_url: string | null; 
  notes: string | null; 
  tags: string[] | null; 
  created_at: string | null 
};

function CriativosPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");
  const [analysisItem, setAnalysisItem] = useState<SwipeFile | null>(null);

  // Busca criativos no Supabase
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["swipe-files"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("swipe_files")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as SwipeFile[];
      } catch { 
        return [] as SwipeFile[]; 
      }
    },
  });

  // Remove criativo
  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("swipe_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { 
      qc.invalidateQueries({ queryKey: ["swipe-files"] }); 
      toast.success("Criativo removido do laboratório local"); 
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = items.filter((i) => 
    !search || 
    i.title.toLowerCase().includes(search.toLowerCase()) ||
    (i.tags && i.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-20">
      
      {/* HEADER DE ALTÍSSIMO NÍVEL */}
      <PageHeader 
        eyebrow="Laboratório Criativo AI" 
        title="Criativos & Inteligência Visual" 
        description="Biblioteca de anúncios e inteligência visual preditiva para alta performance e neuro-marketing."
        actions={
          <button 
            onClick={() => setShowModal(true)} 
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-secondary px-5 py-3 text-xs font-black uppercase tracking-widest text-background shadow-glow transition hover:scale-102 active:scale-98"
          >
            <Plus className="h-4.5 w-4.5 stroke-[3px]" /> ANALISAR NOVO ANÚNCIO
          </button>
        }
      />

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="relative max-w-md print:hidden">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          placeholder="Buscar criativos, nichos ou localizações..." 
          className="w-full rounded-xl border border-white/10 bg-background/50 py-3 pl-12 pr-4 text-sm font-bold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/60" 
        />
      </div>

      {/* RENDERIZAÇÃO DA BIBLIOTECA DE CRIATIVOS */}
      {isLoading ? (
        <div className="flex justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : !filtered.length ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-3 py-24 text-center border-white/10 bg-white/5">
          <Palette className="h-10 w-10 text-primary/40 animate-pulse" />
          <h3 className="font-bold text-sm text-white uppercase tracking-wider">Nenhum anúncio analisado no laboratório</h3>
          <p className="text-xs text-muted-foreground max-w-sm">Suba seus criativos locais de tráfego pago para receber análises profundas de persuasão e novas ideias de conversão.</p>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item, i) => {
            let aiReport: CreativeAIAnalysis | null = null;
            try {
              if (item.notes) {
                aiReport = JSON.parse(item.notes);
              }
            } catch (e) {
              console.error("Erro ao fazer parse das notas de IA:", e);
            }

            return (
              <motion.div 
                key={item.id} 
                initial={{ opacity: 0, y: 12 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.03 }} 
                className="glass-panel overflow-hidden group flex flex-col border-white/10 bg-white/5 hover:border-primary/20 hover:bg-white/[0.07] transition-all duration-300"
              >
                
                {/* Imagem do Criativo */}
                <div className="relative aspect-[4/5] bg-background/80 overflow-hidden border-b border-white/5">
                  {item.media_url ? (
                    <img 
                      src={item.media_url} 
                      alt={item.title} 
                      className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-102" 
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-card">
                      <ImageIcon className="h-12 w-12 text-muted-foreground/20" />
                    </div>
                  )}
                  
                  {/* Badges Holográficas de IA */}
                  {aiReport && (
                    <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none z-10">
                      <span className="inline-flex items-center gap-1 rounded-lg bg-primary/20 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-primary backdrop-blur-md border border-primary/20 shadow-lg">
                        <Gauge className="h-3 w-3 text-primary animate-pulse" /> Score {aiReport.score}/100
                      </span>
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-black uppercase tracking-wider backdrop-blur-md border shadow-lg ${
                        aiReport.conversionProbability === "Alta" 
                          ? "bg-success/20 text-success border-success/20" 
                          : aiReport.conversionProbability === "Média"
                          ? "bg-warning/20 text-warning border-warning/20"
                          : "bg-destructive/20 text-destructive border-destructive/20"
                      }`}>
                        <Sparkles className="h-3 w-3" /> Conversão {aiReport.conversionProbability}
                      </span>
                    </div>
                  )}

                  {/* Ações em Hover (Overlay de Altíssima Sofisticação) */}
                  <div className="absolute inset-0 bg-background/90 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 flex flex-col items-center justify-center gap-3.5 z-20">
                    <button 
                      onClick={() => setAnalysisItem(item)}
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-xs font-black text-background uppercase tracking-widest shadow-glow-sm hover:scale-[1.02] active:scale-98 transition-all"
                    >
                      <FileSearch className="h-4 w-4" /> Diagnóstico IA
                    </button>
                    <button 
                      onClick={() => removeItem.mutate(item.id)} 
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-destructive/20 hover:text-destructive hover:border-destructive/30 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-muted-foreground transition-all"
                    >
                      <Trash2 className="h-4 w-4" /> Excluir
                    </button>
                  </div>
                </div>

                {/* Dados da Galeria */}
                <div className="p-4 bg-card/40 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-black text-white uppercase tracking-wider line-clamp-1 group-hover:text-primary transition" title={item.title}>
                      {item.title}
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-1 font-medium font-mono">
                      Subido em: {item.created_at ? new Date(item.created_at).toLocaleDateString('pt-BR') : 'Sem data'}
                    </p>
                  </div>

                  {item.tags?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {item.tags.map((t, idx) => (
                        <span 
                          key={idx} 
                          className="inline-flex items-center gap-1 rounded-lg bg-muted border border-border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-foreground"
                        >
                          {idx === 1 ? <MapPin className="h-3 w-3 text-primary animate-pulse" /> : <Tag className="h-3 w-3 text-violet-600 dark:text-violet-400" />}
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* MODAL DE NOVO CRIATIVO COM UPLOAD REAL E PARÂMETROS */}
      <AnimatePresence>
        {showModal && (
          <AddCreativeModal 
            onClose={() => setShowModal(false)} 
            onSuccess={() => qc.invalidateQueries({ queryKey: ["swipe-files"] })} 
          />
        )}
      </AnimatePresence>
      
      {/* MODAL DE DIAGNÓSTICO COMPLETO "NÍVEL ABSURDO" DE IA */}
      <AnimatePresence>
        {analysisItem && (
          <AIAnalysisModal 
            item={analysisItem} 
            onClose={() => setAnalysisItem(null)} 
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ==========================================
// MODAL DE ADIÇÃO E ANÁLISE DE CRIATIVO COM UPLOAD REAL DE ARQUIVO
// ==========================================
interface AddModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

function AddCreativeModal({ onClose, onSuccess }: AddModalProps) {
  const analyzeCreative = useServerFn(analyzeCreativeFn);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [niche, setNiche] = useState("Mercado Automotivo");
  const [location, setLocation] = useState("Rio de Janeiro");
  
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/png");
  
  const [loading, setLoading] = useState(false);
  const [scanStep, setScanStep] = useState(0);

  // Efeito para simular scanner avançado visual com textos de IA durante o loading
  useEffect(() => {
    if (!loading) return;
    const steps = [
      "Decodificando layout visual do criativo...",
      "Processando ganchos emocionais e atração visual...",
      "Mapeando com dados do Mercado Automotivo...",
      "Avaliando legibilidade, cores e CTA do anúncio...",
      "Simulando conversão no público-alvo informado...",
      "Gerando relatórios de neuro-marketing e ideias criativas..."
    ];
    const interval = setInterval(() => {
      setScanStep((prev) => (prev + 1) % steps.length);
    }, 2500);
    return () => clearInterval(interval);
  }, [loading]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setMimeType(file.type || "image/png");
    
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setBase64(result.split(",")[1] ?? "");
    };
    reader.readAsDataURL(file);
  };

  const handleSelectFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleAnalyze = async () => {
    if (!title) {
      toast.warning("Por favor, dê um título a este criativo!");
      return;
    }
    if (!base64) {
      toast.warning("Por favor, selecione um arquivo de criativo!");
      return;
    }

    setLoading(true);
    setScanStep(0);
    try {
      // 1. Chamar server function do Gemini
      const analysisResult = await analyzeCreative({
        data: {
          imageBase64: base64,
          mimeType,
          niche,
          location
        }
      });

      // 2. Gravar no banco de dados swipe_files
      const { data: u } = await supabase.auth.getUser();
      const payload = {
        title,
        media_url: `data:${mimeType};base64,${base64}`,
        notes: JSON.stringify(analysisResult),
        tags: [niche, location, `Conversão: ${analysisResult.conversionProbability}`],
        user_id: u.user?.id
      };

      const { error } = await (supabase as any).from("swipe_files").insert(payload);
      if (error) throw error;

      toast.success("Análise de inteligência visual concluída com sucesso!");
      onSuccess();
      onClose();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Erro durante a análise do criativo");
    } finally {
      setLoading(false);
    }
  };

  const stepsText = [
    "Decodificando layout visual do criativo...",
    "Processando ganchos emocionais e atração visual...",
    "Mapeando com dados do Mercado Automotivo...",
    "Avaliando legibilidade, cores e CTA do anúncio...",
    "Simulando conversão no público-alvo informado...",
    "Gerando relatórios de neuro-marketing e ideias criativas..."
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        className="glass-panel w-full max-w-2xl border-white/10 bg-background flex flex-col max-h-[90vh] shadow-2xl relative overflow-hidden"
      >
        
        {/* EFEITO DE CORRIDA DE IA (SCANNER LASER) */}
        <AnimatePresence>
          {loading && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-background/95 backdrop-blur-xl z-50 flex flex-col items-center justify-center p-8 space-y-6"
            >
              <div className="relative h-64 w-64 rounded-2xl border border-primary/20 overflow-hidden shadow-2xl bg-white/5">
                {preview && (
                  <img src={preview} alt="Scanning preview" className="h-full w-full object-cover opacity-60" />
                )}
                {/* Laser horizontal */}
                <div className="absolute left-0 right-0 h-1.5 bg-gradient-to-r from-primary/10 via-primary to-primary/10 shadow-[0_0_15px_rgba(var(--primary),1)] animate-[bounce_3s_infinite]" />
              </div>
              
              <div className="flex flex-col items-center text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <h4 className="text-sm font-black uppercase tracking-widest text-primary">Victoria AI Engine</h4>
                <p className="text-xs text-white/80 font-semibold font-mono animate-pulse min-h-[20px]">
                  {stepsText[scanStep]}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 bg-card/50">
          <div>
            <h3 className="font-display text-lg font-black text-gradient flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Analisador de Criativos Pro
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Carregue um arquivo local e defina o público para análise de neuro-marketing.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-muted-foreground transition">✕</button>
        </div>

        {/* CORPO DO FORMULÁRIO */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Campo Título */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Título do Anúncio</label>
              <input 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                placeholder="Ex: LumaCar Feirão Maio" 
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" 
              />
            </div>

            {/* Localização */}
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Localização de Veiculação</label>
              <input 
                value={location} 
                onChange={(e) => setLocation(e.target.value)} 
                placeholder="Ex: Rio de Janeiro" 
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" 
              />
            </div>
            
            {/* Nicho / Mercado */}
            <div className="space-y-2 md:col-span-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Nicho ou Segmento de Mercado</label>
              <input 
                value={niche} 
                onChange={(e) => setNiche(e.target.value)} 
                placeholder="Ex: Mercado Automotivo" 
                className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm font-bold focus:border-primary focus:outline-none" 
              />
            </div>
          </div>

          {/* ÁREA DE DRAG & DROP E FILE UPLOAD REAL */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Imagem / Arte do Criativo (Upload)</label>
            <input 
              type="file" 
              ref={fileInputRef} 
              accept="image/*" 
              onChange={handleFileChange} 
              className="hidden" 
            />

            {!preview ? (
              <div 
                onClick={handleSelectFileClick}
                className="group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-white/10 bg-background/40 py-12 transition hover:border-primary/40 hover:bg-primary/[0.02]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 group-hover:scale-105 group-hover:bg-primary group-hover:text-background transition shadow-lg">
                  <Upload className="h-6 w-6" />
                </div>
                <div className="text-center">
                  <p className="text-xs font-bold uppercase tracking-wider text-white">Selecionar arquivo de imagem</p>
                  <p className="mt-1 text-[9px] text-muted-foreground font-mono">PNG, JPG, WEBP • Max 8MB</p>
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl border border-white/10 overflow-hidden shadow-2xl bg-white/5 p-2 flex justify-center items-center">
                <img src={preview} alt="Upload preview" className="max-h-[300px] object-contain rounded-lg" />
                <button
                  onClick={() => { setPreview(null); setBase64(null); }}
                  className="absolute right-4 top-4 rounded-xl bg-background/80 p-2 backdrop-blur shadow-xl hover:bg-destructive hover:text-white transition"
                  title="Remover arquivo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RODAPÉ E BOTÕES DE ENVIO */}
        <div className="flex items-center justify-end gap-3 border-t border-white/10 p-5 bg-card/50">
          <button 
            onClick={onClose} 
            className="rounded-xl border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-white transition"
          >
            Cancelar
          </button>
          <button 
            onClick={handleAnalyze} 
            disabled={!preview || !title}
            className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-widest text-background hover:shadow-glow transition hover:scale-[1.01] active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Zap className="h-4.5 w-4.5 fill-current" /> INICIAR ANÁLISE IA
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ==========================================
// MODAL DE DIAGNÓSTICO "NÍVEL ABSURDO" DE IA
// ==========================================
function AIAnalysisModal({ item, onClose }: { item: SwipeFile; onClose: () => void }) {
  let report: CreativeAIAnalysis | null = null;
  try {
    if (item.notes) {
      report = JSON.parse(item.notes);
    }
  } catch (e) {
    console.error("Erro ao ler JSON de notas de IA:", e);
  }

  // Fallback se não for JSON válido
  if (!report) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4">
        <div className="glass-panel max-w-md p-6 space-y-4 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mx-auto animate-pulse" />
          <h3 className="text-white font-bold">Erro de Diagnóstico</h3>
          <p className="text-xs text-muted-foreground">O relatório não contém dados de inteligência válidos no banco.</p>
          <button onClick={onClose} className="rounded-xl bg-white/10 px-4 py-2 text-xs font-bold uppercase">Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4 sm:p-6 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }} 
        animate={{ scale: 1, opacity: 1 }} 
        exit={{ scale: 0.95, opacity: 0 }} 
        className="glass-panel w-full max-w-4xl max-h-[90vh] flex flex-col border-white/10 bg-background shadow-2xl overflow-hidden"
      >
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 bg-card/50 flex-shrink-0">
          <div>
            <h3 className="font-display text-lg font-black text-gradient flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" /> Relatório de Inteligência Visual AI
            </h3>
            <p className="text-xs text-muted-foreground mt-1">Análise baseada em princípios científicos de neuro-marketing e conversão.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-muted-foreground transition">✕</button>
        </div>

        {/* CORPO DE CONTEÚDO SCROLLABLE */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
          
          {/* PAINEL HOLOGRÁFICO DE PONTUAÇÃO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center p-6 rounded-2xl border border-white/10 bg-white/5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
            
            {/* Score Geral */}
            <div className="flex flex-col items-center text-center">
              <div className="h-28 w-28 rounded-full border-4 border-primary/20 flex flex-col items-center justify-center bg-background relative shadow-glow-sm">
                <span className="text-3xl font-black tracking-tighter text-white font-mono">{report.score}</span>
                <span className="text-[9px] font-black uppercase text-primary tracking-widest mt-0.5">SCORE GERAL</span>
              </div>
            </div>

            {/* Persuasão & Atração */}
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <span>Força Persuasiva</span>
                  <span className="text-white font-mono">{report.persuasionScore}/100</span>
                </div>
                <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" style={{ width: `${report.persuasionScore}%` }} />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                  <span>Atração Visual</span>
                  <span className="text-white font-mono">{report.attractionScore}/100</span>
                </div>
                <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-secondary to-primary rounded-full" style={{ width: `${report.attractionScore}%` }} />
                </div>
              </div>
            </div>

            {/* Probabilidade de Conversão */}
            <div className="flex flex-col items-center justify-center p-4 rounded-xl border border-white/5 bg-background/50 text-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Probabilidade de Conversão</span>
              <span className={`text-2xl font-black uppercase tracking-tighter mt-1.5 ${
                report.conversionProbability === "Alta" ? "text-success" : report.conversionProbability === "Média" ? "text-warning" : "text-destructive"
              }`}>
                {report.conversionProbability}
              </span>
              <p className="text-[9px] text-muted-foreground/80 mt-1 font-semibold leading-relaxed">
                Reflete o impacto no público das localizações e nichos avaliados.
              </p>
            </div>
          </div>

          {/* DIAGNÓSTICO DO NICHO E MERCADO */}
          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary border-b border-white/5 pb-2 flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" /> Análise do Mercado e Públicos locais
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              <div className="glass-panel p-5 border-white/5 bg-white/[0.02] space-y-2">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">Avaliação no Nicho</h5>
                <p className="text-xs text-muted-foreground leading-relaxed">{report.nicheEvaluation}</p>
              </div>

              <div className="glass-panel p-5 border-white/5 bg-white/[0.02] space-y-2">
                <h5 className="text-xs font-bold text-white uppercase tracking-wider">Acoplamento de Técnicas</h5>
                <p className="text-xs text-muted-foreground leading-relaxed">{report.marketingAlignment}</p>
              </div>
            </div>
          </div>

          {/* ELEMENTOS DETECTADOS VISUALMENTE */}
          {report.detectedElements && report.detectedElements.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-widest text-primary border-b border-white/5 pb-2 flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" /> Elementos Identificados por Visão Computacional
              </h4>
              <div className="flex flex-wrap gap-2">
                {report.detectedElements.map((el, index) => (
                  <span 
                    key={index} 
                    className="inline-flex rounded-lg bg-muted border border-border px-3 py-1.5 text-xs font-black uppercase tracking-wider text-foreground shadow-sm"
                  >
                    {el}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* PONTOS FORTES E FRACOS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Pontos Fortes */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-widest text-success border-b border-white/5 pb-2 flex items-center gap-2">
                <Check className="h-4 w-4 text-success" /> Pontos Fortes (Neuro-marketing)
              </h4>
              <ul className="space-y-2">
                {report.strengths.map((str, index) => (
                  <li key={index} className="flex gap-2.5 items-start p-3 rounded-xl bg-success/5 border border-success/20 text-xs text-foreground font-medium leading-relaxed">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/20 text-success text-[10px] font-black font-mono mt-0.5">
                      {index + 1}
                    </span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Pontos Fracos */}
            <div className="space-y-3">
              <h4 className="text-sm font-black uppercase tracking-widest text-warning border-b border-white/5 pb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" /> Oportunidades Perdidas
              </h4>
              <ul className="space-y-2">
                {report.weaknesses.map((wk, index) => (
                  <li key={index} className="flex gap-2.5 items-start p-3 rounded-xl bg-warning/5 border border-warning/20 text-xs text-foreground font-medium leading-relaxed">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-warning/20 text-warning text-[10px] font-black font-mono mt-0.5">
                      {index + 1}
                    </span>
                    <span>{wk}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* MELHORIAS ACIONÁVEIS (CHECKLIST INTERATIVO) */}
          <div className="space-y-4 p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
            <h4 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Checklist de Otimização Imediata
            </h4>
            <div className="grid grid-cols-1 gap-3">
              {report.actionableImprovements.map((imp, index) => (
                <div key={index} className="flex gap-3 items-center p-3 rounded-xl border border-white/5 bg-background/50">
                  <input type="checkbox" className="h-4.5 w-4.5 rounded border-white/20 bg-background text-primary focus:ring-primary/20 accent-primary" />
                  <p className="text-xs text-white/90 font-medium">{imp}</p>
                </div>
              ))}
            </div>
          </div>

          {/* SUGESTÕES DE NOVOS CRIATIVOS (IA CRIATIVIDADE INFINITA) */}
          <div className="space-y-4">
            <h4 className="text-sm font-black uppercase tracking-widest text-violet-600 dark:text-violet-400 border-b border-white/5 pb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-violet-600 dark:text-violet-400" /> Próximas Ideias Criativas Recomendadas pela IA
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {report.newCreativeIdeas.map((idea, index) => (
                <div key={index} className="glass-panel p-5 border-white/10 bg-white/5 space-y-4 hover:border-violet-500/30 transition-all duration-300">
                  
                  {/* Conceito */}
                  <div className="space-y-1">
                    <span className="text-[9px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">IDEIA RECOMENDADA #{index + 1}</span>
                    <h5 className="text-sm font-black text-white uppercase tracking-wider">{idea.concept}</h5>
                  </div>
                  
                  {/* Hook Text */}
                  <div className="p-3.5 rounded-xl border border-dashed border-white/10 bg-background/40">
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground block mb-1">Headline/Gancho de Copy</span>
                    <p className="text-xs font-black text-primary italic">"{idea.hookText}"</p>
                  </div>

                  {/* Descrição Visual */}
                  <div className="space-y-1.5">
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground block">Direção e Roteiro Visual</span>
                    <p className="text-[11px] text-muted-foreground leading-relaxed">{idea.visualDescription}</p>
                  </div>

                  {/* Gatilhos */}
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {idea.psychologicalTriggers.map((trig, idx) => (
                      <span key={idx} className="inline-flex rounded-lg bg-muted border border-border px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-foreground">
                        🧠 {trig}
                      </span>
                    ))}
                  </div>

                </div>
              ))}
            </div>
          </div>

        </div>

        {/* RODAPÉ DO RELATÓRIO */}
        <div className="flex items-center justify-between border-t border-white/10 p-5 bg-card/50 flex-shrink-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Diagnóstico Processado pelo Modelo Gemini 2.5</p>
          <button 
            onClick={onClose} 
            className="rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-white transition"
          >
            Fechar
          </button>
        </div>

      </motion.div>
    </div>
  );
}
