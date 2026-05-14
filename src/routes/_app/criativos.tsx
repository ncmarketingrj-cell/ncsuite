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

  const filtered = items.filter((i) => !search || i.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Laboratório" title="Criativos" description="Galeria de criativos salvos, análise e categorização."
        actions={<button onClick={() => setShowModal(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"><Plus className="h-4 w-4" /> Novo criativo</button>}
      />

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-full rounded-lg border border-white/10 bg-background/50 py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none" />
      </div>

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !filtered.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Palette className="h-6 w-6 text-primary/60" />Nenhum criativo ainda. Adicione o primeiro!</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel overflow-hidden group">
              {item.media_url ? (
                <div className="aspect-video bg-background/60"><img src={item.media_url} alt={item.title} className="h-full w-full object-cover" /></div>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-background/60"><Image className="h-8 w-8 text-muted-foreground/40" /></div>
              )}
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <button onClick={() => removeItem.mutate(item.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                {item.notes && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{item.notes}</p>}
                {item.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{item.tags.map((t) => <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary"><Tag className="h-2.5 w-2.5" />{t}</span>)}</div> : null}
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>{showModal && <AddCreativeModal onClose={() => setShowModal(false)} onSave={(d) => { addItem.mutate(d); setShowModal(false); }} />}</AnimatePresence>
    </div>
  );
}

function AddCreativeModal({ onClose, onSave }: { onClose: () => void; onSave: (d: { title: string; media_url?: string; notes?: string; tags?: string[] }) => void }) {
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [notes, setNotes] = useState(""); const [tagsStr, setTagsStr] = useState("");
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-md p-6 space-y-3">
        <h3 className="font-display text-lg font-semibold">Novo criativo</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" autoFocus />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL da imagem (opcional)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <input value={tagsStr} onChange={(e) => setTagsStr(e.target.value)} placeholder="Tags (separadas por vírgula)" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
          <button onClick={() => onSave({ title, media_url: url || undefined, notes: notes || undefined, tags: tagsStr ? tagsStr.split(",").map((t) => t.trim()) : undefined })} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">Criar</button>
        </div>
      </motion.div>
    </motion.div>
  );
}
