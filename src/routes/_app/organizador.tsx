import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Link2, Plus, Eye, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/organizador")({
  head: () => ({ meta: [{ title: "Link Pages — NC Suite" }] }),
  component: OrganizadorPage,
});

type LinkPage = { id: string; slug: string; title: string; bio: string | null; views_count: number | null; is_active: boolean | null; created_at: string | null };

function OrganizadorPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["link-pages"],
    queryFn: async () => {
      try {
        const { data, error } = await (supabase as any).from("link_pages").select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return (data ?? []) as LinkPage[];
      } catch { return [] as LinkPage[]; }
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!newTitle.trim() || !newSlug.trim()) throw new Error("Preencha título e slug");
      const { data: u } = await supabase.auth.getUser();
      const { error } = await (supabase as any).from("link_pages").insert({ title: newTitle, slug: newSlug, user_id: u.user?.id, is_active: true });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["link-pages"] }); toast.success("Link page criada"); setShowCreate(false); setNewTitle(""); setNewSlug(""); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader eyebrow="Conversão" title="Link Pages" description="Crie páginas de links personalizadas para cada cliente."
        actions={<button onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"><Plus className="h-4 w-4" /> Nova page</button>}
      />

      {showCreate && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
          <h3 className="font-display text-lg font-semibold mb-4">Criar Link Page</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Título da page" className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            <input value={newSlug} onChange={(e) => setNewSlug(e.target.value)} placeholder="slug-da-page" className="rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setShowCreate(false)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">Cancelar</button>
            <button onClick={() => create.mutate()} className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow">Criar</button>
          </div>
        </motion.div>
      )}

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : !pages.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Link2 className="h-6 w-6 text-primary/60" />Nenhuma link page criada.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel p-5 group">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-base font-semibold">{p.title}</h3>
                <span className={`h-2 w-2 rounded-full ${p.is_active ? "bg-success" : "bg-muted-foreground"}`} />
              </div>
              <p className="label-mono mt-1 text-muted-foreground">/p/{p.slug}</p>
              <div className="mt-4 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {p.views_count ?? 0} views</span>
                <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline"><ExternalLink className="h-3 w-3" /> Ver</a>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
