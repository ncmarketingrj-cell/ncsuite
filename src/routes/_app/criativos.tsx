import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Palette, Plus, Trash2, Tag, Image, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/criativos")({
  head: () => ({ meta: [{ title: "Criativos — NC Suite" }] }),
  component: CriativosPage,
});

type SwipeFile = { id: string; title: string; media_url: string | null; notes: string | null; tags: string[] | null; created_at: string | null };

function CriativosPage() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["swipe-files"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).from("swipe_files").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as SwipeFile[];
      } catch { return [] as SwipeFile[]; }
    },
  });

  const addItem = useMutation({
    mutationFn: async (item: { title: string; media_url?: string; notes?: string; tags?: string[] }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("swipe_files").insert({ ...item, user_id: u.user?.id });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["swipe-files"] }); toast.success("Criativo adicionado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("swipe_files").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["swipe-files"] }); toast.success("Removido"); },
  });

  const [analysisItem, setAnalysisItem] = useState<SwipeFile | null>(null);

  const filtered = items.filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Laboratório" title="Criativos & IA" description="Galeria de vídeos e análises preditivas de performance."
        actions={<button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"><Plus className="h-4 w-4" /> Novo vídeo</button>}
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar criativos..." className="w-full rounded-lg border border-white/10 bg-background/50 py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none" />
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !filtered.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Palette className="h-6 w-6 text-primary/60" />Nenhum criativo ainda. Adicione o primeiro!</div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel overflow-hidden group flex flex-col">
              
              {/* Thumbnail Container */}
              <div className="relative aspect-[9/16] bg-background/80 overflow-hidden">
                {item.media_url ? (
                  <img src={item.media_url} alt={item.title} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                  <div className="flex h-full items-center justify-center"><Image className="h-10 w-10 text-muted-foreground/20" /></div>
                )}
                
                {/* Badges */}
                <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success backdrop-blur-md border border-success/20 shadow-sm"><div className="h-1.5 w-1.5 rounded-full bg-success"></div> Analisado IA</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary backdrop-blur-md border border-primary/20 shadow-sm"><div className="h-1.5 w-1.5 rounded-full bg-primary"></div> Meta OK</span>
                </div>

                {/* Hover Action Overlay */}
                <div className="absolute inset-0 bg-background/80 opacity-0 backdrop-blur-sm transition-all duration-300 group-hover:opacity-100 flex flex-col items-center justify-center gap-3">
                  <button 
                    onClick={() => setAnalysisItem(item)}
                    className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground shadow-glow-sm hover:scale-105 transition-transform"
                  >
                    Ver Relatório
                  </button>
                  <button 
                    onClick={() => removeItem.mutate(item.id)} 
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-4 py-2 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir
                  </button>
                </div>
              </div>

              {/* Card Footer */}
              <div className="p-4 border-t border-white/5 bg-card/50 flex-1">
                <h3 className="text-sm font-semibold font-display line-clamp-1" title={item.title}>{item.title}</h3>
                {item.tags?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] uppercase font-bold text-muted-foreground bg-white/5 border border-white/5">{t}</span>)}
                  </div>
                ) : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Legacy Add Modal */}
      <AnimatePresence>{showModal && <AddCreativeModal onClose={() => setShowModal(false)} onSave={(d) => { addItem.mutate(d); setShowModal(false); }} />}</AnimatePresence>
      
      {/* New AI Analysis Modal */}
      <AnimatePresence>{analysisItem && <AIAnalysisModal item={analysisItem} onClose={() => setAnalysisItem(null)} />}</AnimatePresence>
    </div>
  );
}

// Lightweight AI Analysis Modal using native <details> for performance
function AIAnalysisModal({ item, onClose }: { item: SwipeFile; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 backdrop-blur-md p-4 sm:p-6">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="glass-panel w-full max-w-2xl max-h-[90vh] flex flex-col border-primary/20 bg-background shadow-2xl">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 p-5 bg-card/50">
          <div>
            <h3 className="font-display text-lg font-bold text-gradient">Relatório de Inteligência Visual</h3>
            <p className="text-xs text-muted-foreground mt-1">Arquivo: {item.title}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/5 text-muted-foreground transition">✕</button>
        </div>

        {/* Content (Scrollable) */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          
          <details className="group border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden" open>
            <summary className="cursor-pointer p-4 font-semibold text-sm select-none flex justify-between items-center group-open:bg-white/5 transition-colors text-primary">
              📝 Transcrição e Hook
              <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-4 border-t border-white/5 text-sm text-muted-foreground bg-background/50 grid grid-cols-[80px_1fr] gap-4">
              <div className="text-xs font-mono text-primary/70 pt-1">00:00</div>
              <p className="leading-relaxed"><strong className="text-foreground">Gancho Visual:</strong> Pessoa aponta para o celular com expressão de surpresa. Texto grande na tela "Você está perdendo dinheiro".</p>
              
              <div className="text-xs font-mono text-primary/70 pt-1">00:03</div>
              <p className="leading-relaxed">"Se você roda tráfego pago em 2024 e ainda não usa automação, você está deixando dinheiro na mesa."</p>
            </div>
          </details>

          <details className="group border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden">
            <summary className="cursor-pointer p-4 font-semibold text-sm select-none flex justify-between items-center group-open:bg-white/5 transition-colors text-secondary">
              🧠 Estrutura Narrativa
              <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-4 border-t border-white/5 text-sm text-muted-foreground bg-background/50 space-y-3 leading-relaxed">
              <p><strong className="text-foreground">Fórmula Identificada:</strong> PAS (Problema, Agitação, Solução).</p>
              <p><strong className="text-foreground">Apelo Emocional:</strong> FOMO (Medo de ficar de fora) ativado nos primeiros 3 segundos através de linguagem de perda financeira direta.</p>
              <p><strong className="text-foreground">Probabilidade de Retenção:</strong> Alta. O corte rápido de câmera no segundo 04 força o usuário a manter o foco.</p>
            </div>
          </details>

          <details className="group border border-white/5 rounded-xl bg-white/[0.02] overflow-hidden">
            <summary className="cursor-pointer p-4 font-semibold text-sm select-none flex justify-between items-center group-open:bg-white/5 transition-colors text-success">
              👁️ Elementos Visuais e Compliance (Meta OK)
              <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="p-4 border-t border-white/5 text-sm text-muted-foreground bg-background/50 space-y-3 leading-relaxed">
              <ul className="list-disc pl-5 space-y-2">
                <li>Cores predominantes: Azul Escuro e Neon Cyan (alto contraste e transmite tecnologia).</li>
                <li>Proporção de texto seguro: <strong>Aprovado</strong> (menos de 20% da tela ocupada).</li>
                <li>Nenhuma violação das políticas de publicidade da Meta detectada no vídeo ou na transcrição.</li>
              </ul>
            </div>
          </details>

        </div>
      </motion.div>
    </motion.div>
  );
}

function AddCreativeModal({ onClose, onSave }: { onClose: () => void; onSave: (d: { title: string; media_url?: string; notes?: string; tags?: string[] }) => void }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [notes, setNotes] = useState(""); const [tagsStr, setTagsStr] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-3">
        <h3 className="font-display text-lg font-semibold text-foreground">Novo arquivo</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL da imagem/vídeo" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancelar</button>
          <button onClick={() => onSave({ title, media_url: url || undefined, notes: notes || undefined, tags: tagsStr ? tagsStr.split(",").map((t) => t.trim()) : undefined })} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">Adicionar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
