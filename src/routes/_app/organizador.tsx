import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Plus, Eye, ExternalLink, Loader2, Edit, Trash2, QrCode, Settings, Layout, GripVertical, X, Smartphone, Car, Phone, MessageSquare, Video, FileText, Image as ImageIcon, MapPin, UploadCloud, Layers, LayoutList, Type, AlignLeft } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/organizador")({
  head: () => ({ meta: [{ title: "Central de Funis — NC Suite" }] }),
  component: OrganizadorPage,
});

// Types
type FunnelItem = {
  id: string; slug: string; title: string; is_active: boolean; created_at: string;
  type: 'link_bio' | 'form' | 'quiz';
  raw_data: any; // The raw row from link_pages or quizzes
};

const TEMPLATES = [
  { id: 'garage-premium', name: 'Garage Premium', emoji: '🏎️', bg: '#0a0a0a', accent: '#e02020', font: 'Outfit', btn: 'rounded' },
  { id: 'racing-neon', name: 'Racing Neon', emoji: '🏁', bg: '#050a14', accent: '#00d4ff', font: 'Inter', btn: 'pill' },
  { id: 'matte-carbon', name: 'Matte Carbon', emoji: '⚫', bg: '#121212', accent: '#8a8a8a', font: 'JetBrains Mono', btn: 'squared' },
];

function OrganizadorPage() {
  const qc = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FunnelItem | null>(null);
  const [showQR, setShowQR] = useState<{slug: string, type: string} | null>(null);

  // Fetch all pages and quizzes and unify them
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["funnel-items"],
    queryFn: async () => {
      const [pagesRes, quizzesRes] = await Promise.all([
        (supabase as any).from("link_pages").select("*").order("created_at", { ascending: false }),
        (supabase as any).from("quizzes").select("*").order("created_at", { ascending: false })
      ]);
      
      const pages = (pagesRes.data || []).map((p: any) => ({
        id: p.id, slug: p.slug, title: p.title, is_active: p.is_active, created_at: p.created_at,
        type: (p.template === 'form_only' || (!p.template && p.lead_form_enabled)) ? 'form' : 'link_bio',
        raw_data: p
      }));
      
      const quizzes = (quizzesRes.data || []).map((q: any) => ({
        id: q.id, slug: q.slug, title: q.title, is_active: q.is_active, created_at: q.created_at,
        type: 'quiz', raw_data: q
      }));

      return [...pages, ...quizzes].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) as FunnelItem[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (type: 'link_bio' | 'form' | 'quiz') => {
      const { data: u } = await supabase.auth.getUser();
      const slug = `${type}-${Math.random().toString(36).substring(2, 8)}`;
      
      if (type === 'quiz') {
        const { data, error } = await (supabase as any).from("quizzes").insert({ title: "Novo Quiz Automotivo", slug, user_id: u.user?.id }).select().single();
        if (error) throw error;
        return { id: data.id, slug: data.slug, title: data.title, is_active: data.is_active, created_at: data.created_at, type: 'quiz', raw_data: data } as FunnelItem;
      } else {
        const isForm = type === 'form';
        const { data, error } = await (supabase as any).from("link_pages").insert({ 
          title: isForm ? "Nova Página de Captura" : "Nova Link Bio", 
          slug, user_id: u.user?.id,
          lead_form_enabled: isForm,
          template: isForm ? 'form_only' : 'garage-premium'
        }).select().single();
        if (error) throw error;
        return { id: data.id, slug: data.slug, title: data.title, is_active: data.is_active, created_at: data.created_at, type, raw_data: data } as FunnelItem;
      }
    },
    onSuccess: (data) => { 
      qc.invalidateQueries({ queryKey: ["funnel-items"] }); 
      setShowCreateModal(false);
      setEditingItem(data); 
      toast.success("Criado com sucesso! Configure agora."); 
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, type, is_active }: { id: string, type: string, is_active: boolean }) => {
      const table = type === 'quiz' ? 'quizzes' : 'link_pages';
      const { error } = await (supabase as any).from(table).update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["funnel-items"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async ({ id, type }: { id: string, type: string }) => {
      const table = type === 'quiz' ? 'quizzes' : 'link_pages';
      const { error } = await (supabase as any).from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["funnel-items"] }); toast.success("Excluído com sucesso."); },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Automotivo" title="Central de Funis" description="Gerencie suas Link Bios, Páginas de Captura e Quizzes Interativos em um só lugar."
        actions={<button onClick={() => setShowCreateModal(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"><Plus className="h-4 w-4" /> Nova Página</button>}
      />

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : !items.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Layers className="h-6 w-6 text-primary/60" />Nenhum funil criado. Comece agora!</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <motion.div key={item.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel card-sport flex flex-col overflow-hidden group">
              <div className="p-5 flex-1 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="header-sport font-display text-base font-semibold text-foreground truncate max-w-[200px]">{item.title}</h3>
                    <p className="label-mono mt-1 text-muted-foreground truncate max-w-[200px]">/{item.type === 'quiz' ? 'q' : 'p'}/{item.slug}</p>
                  </div>
                  
                  {/* Ativar / Desativar Rápido */}
                  <button 
                    onClick={() => toggleStatusMutation.mutate({ id: item.id, type: item.type, is_active: !item.is_active })}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${item.is_active ? 'bg-success' : 'bg-muted'}`}
                    title={item.is_active ? "Desativar Página" : "Ativar Página"}
                  >
                     <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${item.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </div>
                
                <div className="mt-4 flex items-center gap-2">
                  {item.type === 'link_bio' && <div className="px-2 py-1 rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 text-[10px] font-bold flex items-center gap-1"><Link2 className="h-3 w-3"/> LINK BIO</div>}
                  {item.type === 'form' && <div className="px-2 py-1 rounded bg-green-500/10 text-green-500 border border-green-500/20 text-[10px] font-bold flex items-center gap-1"><FileText className="h-3 w-3"/> FORMULÁRIO</div>}
                  {item.type === 'quiz' && <div className="px-2 py-1 rounded bg-purple-500/10 text-purple-500 border border-purple-500/20 text-[10px] font-bold flex items-center gap-1"><LayoutList className="h-3 w-3"/> QUIZ</div>}
                </div>
              </div>
              
              <div className="bg-card/50 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {item.raw_data.views_count || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowQR({slug: item.slug, type: item.type})} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="QR Code"><QrCode className="h-4 w-4" /></button>
                  <a href={`/${item.type === 'quiz' ? 'q' : 'p'}/${item.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Abrir"><ExternalLink className="h-4 w-4" /></a>
                  <button onClick={() => setEditingItem(item)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => { if(confirm('Excluir este funil?')) deleteMutation.mutate({id: item.id, type: item.type}); }} className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Modal Nova Página */}
      <AnimatePresence>
        {showCreateModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-panel p-6 max-w-lg w-full relative">
              <button onClick={() => setShowCreateModal(false)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
              <h3 className="header-sport font-display text-xl font-bold mb-2">Qual tipo de funil você quer criar?</h3>
              <p className="text-sm text-muted-foreground mb-6">Escolha a melhor estrutura para sua campanha automotiva.</p>
              
              <div className="grid gap-4">
                 <button onClick={() => createMutation.mutate('link_bio')} disabled={createMutation.isPending} className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 text-left transition-all">
                    <div className="p-3 rounded-lg bg-blue-500/20 text-blue-400"><Link2 className="h-6 w-6" /></div>
                    <div>
                       <h4 className="font-bold text-foreground">Link Bio (Árvore de Links)</h4>
                       <p className="text-xs text-muted-foreground mt-1">Agrupe WhatsApp, Catálogo de Veículos, Instagram e Localização em um único link perfeito para a bio.</p>
                    </div>
                 </button>
                 
                 <button onClick={() => createMutation.mutate('form')} disabled={createMutation.isPending} className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 text-left transition-all">
                    <div className="p-3 rounded-lg bg-green-500/20 text-green-400"><FileText className="h-6 w-6" /></div>
                    <div>
                       <h4 className="font-bold text-foreground">Formulário de Captação</h4>
                       <p className="text-xs text-muted-foreground mt-1">Uma Landing Page direta e objetiva, focada apenas em captar Nome, WhatsApp e Veículo de Interesse.</p>
                    </div>
                 </button>
                 
                 <button onClick={() => createMutation.mutate('quiz')} disabled={createMutation.isPending} className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 hover:border-primary/50 text-left transition-all">
                    <div className="p-3 rounded-lg bg-purple-500/20 text-purple-400"><LayoutList className="h-6 w-6" /></div>
                    <div>
                       <h4 className="font-bold text-foreground">Quiz Interativo</h4>
                       <p className="text-xs text-muted-foreground mt-1">Crie um fluxo de perguntas com imagens e lógica condicional para qualificar o cliente antes de captar o lead.</p>
                    </div>
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Editor Modal */}
      <AnimatePresence>
        {editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-6xl h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
                <h2 className="font-display text-lg font-bold flex items-center gap-2">
                   {editingItem.type === 'quiz' ? <LayoutList className="h-5 w-5 text-purple-500" /> : editingItem.type === 'form' ? <FileText className="h-5 w-5 text-green-500" /> : <Link2 className="h-5 w-5 text-blue-500" />}
                   Editor — {editingItem.type === 'quiz' ? 'Quiz Interativo' : editingItem.type === 'form' ? 'Formulário' : 'Link Bio'}
                </h2>
                <button onClick={() => { setEditingItem(null); qc.invalidateQueries({queryKey:["funnel-items"]}); }} className="p-2 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 overflow-hidden">
                {editingItem.type === 'quiz' ? (
                   <div className="h-full overflow-y-auto p-6 custom-scrollbar">
                      <QuizEditorForm pageId={editingItem.id} />
                   </div>
                ) : (
                   <div className="flex h-full">
                      <div className="w-1/2 md:w-3/5 overflow-y-auto p-6 border-r border-border custom-scrollbar">
                        <LinkBioEditorForm pageId={editingItem.id} type={editingItem.type} />
                      </div>
                      <div className="w-1/2 md:w-2/5 bg-background/50 flex flex-col items-center justify-center p-6">
                        <div className="mb-4 flex items-center gap-2 text-xs font-mono text-muted-foreground bg-card px-3 py-1.5 rounded-full border border-border"><Smartphone className="h-3.5 w-3.5" /> Preview ao vivo</div>
                        <LivePreview pageId={editingItem.id} />
                      </div>
                   </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="glass-panel p-8 max-w-sm w-full text-center relative">
              <button onClick={() => setShowQR(null)} className="absolute top-4 right-4 p-1 rounded-full hover:bg-muted"><X className="h-4 w-4" /></button>
              <h3 className="font-display text-xl font-bold mb-6">QR Code</h3>
              <div className="bg-white p-4 rounded-xl inline-block">
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + '/' + (showQR.type==='quiz'?'q':'p') + '/' + showQR.slug)}`} alt="QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-muted-foreground mt-6 mb-4">Escaneie para acessar</p>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&data=${encodeURIComponent(window.location.origin + '/' + (showQR.type==='quiz'?'q':'p') + '/' + showQR.slug)}`} download="qrcode.png" target="_blank" rel="noreferrer" className="w-full inline-flex justify-center items-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:shadow-glow">
                Download em Alta Resolução
              </a>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------
// IMAGE UPLOAD COMPONENT (Nativo Supabase Storage)
// ---------------------------------------------------------
function ImageUpload({ value, onChange, label, className = "" }: { value: string|null, onChange: (url: string)=>void, label: string, className?: string }) {
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setLoading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `uploads/${fileName}`;

      const { error: uploadError } = await supabase.storage.from('media').upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('media').getPublicUrl(filePath);
      onChange(data.publicUrl);
    } catch (error: any) {
      toast.error("Erro no upload: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className}>
      <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">{label}</label>
      <div className="flex items-center gap-4">
         {value ? (
            <div className="relative group w-16 h-16 shrink-0">
               <img src={value} alt="Upload preview" className="w-full h-full rounded-xl object-cover border border-white/20" />
               <button onClick={() => onChange("")} className="absolute -top-2 -right-2 bg-destructive text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><X className="h-3 w-3" /></button>
            </div>
         ) : (
            <div className="w-16 h-16 shrink-0 rounded-xl border border-dashed border-white/20 bg-white/5 flex items-center justify-center">
               <ImageIcon className="h-6 w-6 text-muted-foreground/50" />
            </div>
         )}
         <div className="flex-1">
            <input type="file" ref={fileInputRef} onChange={handleUpload} accept="image/*" className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} disabled={loading} className="px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold flex items-center gap-2 text-foreground transition-colors disabled:opacity-50">
               {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
               {loading ? "Enviando..." : value ? "Trocar Imagem" : "Fazer Upload"}
            </button>
         </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// LINK BIO / FORM EDITOR
// ---------------------------------------------------------
function LinkBioEditorForm({ pageId, type }: { pageId: string, type: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["link-pages", pageId],
    queryFn: async () => { const { data } = await (supabase as any).from("link_pages").select("*").eq("id", pageId).single(); return data as any; }
  });
  const page: any = data;

  const { data: links = [] } = useQuery({
    queryKey: ["link-items", pageId],
    queryFn: async () => { const { data } = await (supabase as any).from("link_items").select("*").eq("page_id", pageId).order("order_index", { ascending: true }); return data || []; }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => { await (supabase as any).from("link_pages").update(data).eq("id", pageId); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["link-pages", pageId] }); qc.invalidateQueries({ queryKey: ["funnel-items"] }); },
  });

  const addLinkMutation = useMutation({
    mutationFn: async (lType: string) => { await (supabase as any).from("link_items").insert({ page_id: pageId, title: "Novo Botão", url: "", type: lType, order_index: links.length }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", pageId] }),
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => { await (supabase as any).from("link_items").update(data).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", pageId] }),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => { await (supabase as any).from("link_items").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", pageId] }),
  });

  if (isLoading || !page) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const handleChange = (field: string, value: any) => { updateMutation.mutate({ [field]: value }); };

  return (
    <div className="space-y-8 pb-10">
      {/* 1. Informações Básicas */}
      <div className="space-y-4">
        <h3 className="header-sport text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Informações Básicas</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Título</label>
            <input defaultValue={page.title} onBlur={(e) => handleChange("title", e.target.value)} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Slug (URL)</label>
            <input defaultValue={page.slug} onBlur={(e) => handleChange("slug", e.target.value)} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Biografia / Descrição</label>
          <textarea defaultValue={page.bio || ""} onBlur={(e) => handleChange("bio", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" />
        </div>
        
        <ImageUpload value={page.avatar} onChange={(url) => handleChange("avatar", url)} label="Logo ou Foto de Perfil" />
      </div>

      <hr className="border-border" />

      {/* 2. Aparência */}
      <div className="space-y-4">
        <h3 className="header-sport text-sm font-bold flex items-center gap-2"><Layout className="h-4 w-4 text-primary" /> Aparência</h3>
        <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Tema Automotivo</label>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => { updateMutation.mutate({ template: t.id, bg_color: t.bg, accent_color: t.accent, font_family: t.font, button_style: t.btn }); }} className={`relative p-3 rounded-xl border text-left transition-all ${page.template === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-white/20'}`}>
              <div className="text-xl mb-1">{t.emoji}</div>
              <div className="text-xs font-bold">{t.name}</div>
              {page.template === t.id && <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <div>
             <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Fundo</label>
             <div className="flex gap-2">
                <input type="color" value={page.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
                <input value={page.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
             </div>
          </div>
          <div>
             <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Destaque</label>
             <div className="flex gap-2">
                <input type="color" value={page.accent_color} onChange={(e) => handleChange("accent_color", e.target.value)} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
                <input value={page.accent_color} onChange={(e) => handleChange("accent_color", e.target.value)} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
             </div>
          </div>
        </div>
      </div>

      {/* 3. Links (Esconder se for só Formulário e usuário não quiser links) */}
      {type !== 'form' && (
        <>
          <hr className="border-border" />
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="header-sport text-sm font-bold flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> Links & Botões</h3>
              <div className="flex gap-1 flex-wrap justify-end">
                <button onClick={() => addLinkMutation.mutate("link")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1"><Plus className="h-3 w-3" /> URL</button>
                <button onClick={() => addLinkMutation.mutate("whatsapp")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-green-500"><MessageSquare className="h-3 w-3" /> WPP</button>
                <button onClick={() => addLinkMutation.mutate("maps")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-orange-400"><MapPin className="h-3 w-3" /> MAPS</button>
                <button onClick={() => addLinkMutation.mutate("youtube")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-red-500"><Video className="h-3 w-3" /> YT</button>
              </div>
            </div>

            <div className="space-y-3">
              {links.map((link: any) => (
                 <div key={link.id} className="glass-panel p-3 flex gap-3 relative">
                    <div className="flex-shrink-0 pt-2 cursor-grab text-muted-foreground hover:text-foreground"><GripVertical className="h-4 w-4" /></div>
                    <div className="flex-1 space-y-2">
                       <div className="flex items-center justify-between gap-2">
                          <input defaultValue={link.title} onBlur={(e) => updateLinkMutation.mutate({ id: link.id, data: { title: e.target.value } })} placeholder="Título do Botão" className="flex-1 bg-transparent border-b border-border text-sm font-bold focus:border-primary focus:outline-none py-1" />
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted uppercase">{link.type}</span>
                            <button onClick={() => updateLinkMutation.mutate({ id: link.id, data: { is_active: !link.is_active } })} className={`text-[10px] font-bold px-2 py-1 rounded ${link.is_active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{link.is_active ? 'ON' : 'OFF'}</button>
                            <button onClick={() => { if(confirm('Excluir link?')) deleteLinkMutation.mutate(link.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                       </div>
                       <input defaultValue={link.url} onBlur={(e) => updateLinkMutation.mutate({ id: link.id, data: { url: e.target.value } })} placeholder={link.type === 'whatsapp' ? "Número: 5511999999999" : link.type === 'maps' ? "URL do Google Maps" : "URL completa..."} className="w-full text-xs bg-transparent border-none text-muted-foreground focus:text-foreground focus:outline-none" />
                       {link.type === 'whatsapp' && (
                         <div className="pt-2 border-t border-border mt-2">
                           <input defaultValue={link.whatsapp_message || ""} onBlur={(e) => updateLinkMutation.mutate({ id: link.id, data: { whatsapp_message: e.target.value } })} placeholder="Mensagem pré-preenchida (ex: Olá, interesse no Civic)" className="w-full text-[11px] bg-background/50 border border-border rounded px-2 py-1.5 text-muted-foreground focus:outline-none focus:border-primary" />
                         </div>
                       )}
                    </div>
                 </div>
              ))}
              {links.length === 0 && <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">Nenhum link adicionado.</p>}
            </div>
          </div>
        </>
      )}

      <hr className="border-border" />

      {/* 4. Captura de Leads */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Captura de Leads (Formulário)</div>
          <button onClick={() => handleChange("lead_form_enabled", !page.lead_form_enabled)} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${page.lead_form_enabled ? 'bg-primary' : 'bg-muted'}`}>
             <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${page.lead_form_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </h3>
        {page.lead_form_enabled && (
           <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
             <p className="text-xs text-muted-foreground">Um formulário de contato será exibido no final da página. Campos capturados:</p>
             <ul className="text-[11px] font-mono text-foreground space-y-1 ml-4 list-disc">
                <li>Nome</li><li>Telefone / WhatsApp</li><li>Email</li><li>Veículo de Interesse</li>
             </ul>
           </div>
        )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------
// QUIZ EDITOR FORM (Integração)
// ---------------------------------------------------------
function QuizEditorForm({ pageId }: { pageId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["quizzes", pageId],
    queryFn: async () => { const { data } = await (supabase as any).from("quizzes").select("*").eq("id", pageId).single(); return data as any; }
  });
  const quiz: any = data;

  const { data: steps = [] } = useQuery({
    queryKey: ["quiz-steps", pageId],
    queryFn: async () => { const { data } = await (supabase as any).from("quiz_steps").select("*").eq("quiz_id", pageId).order("order_index", { ascending: true }); return data || []; }
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => { await (supabase as any).from("quizzes").update(data).eq("id", pageId); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["quizzes", pageId] }); qc.invalidateQueries({ queryKey: ["funnel-items"] }); },
  });

  const addStepMutation = useMutation({
    mutationFn: async (type: string) => { await (supabase as any).from("quiz_steps").insert({ quiz_id: pageId, title: "Nova Pergunta", step_type: type, order_index: steps.length }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", pageId] }),
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: any }) => { await (supabase as any).from("quiz_steps").update(data).eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", pageId] }),
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (id: string) => { await (supabase as any).from("quiz_steps").delete().eq("id", id); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quiz-steps", pageId] }),
  });

  if (isLoading || !quiz) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const handleChange = (field: string, value: any) => { updateMutation.mutate({ [field]: value }); };

  return (
    <div className="space-y-10 max-w-3xl mx-auto pb-10">
      <div className="glass-panel p-6 space-y-4">
        <h3 className="header-sport text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Configurações do Quiz</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Título</label><input defaultValue={quiz.title} onBlur={(e) => handleChange("title", e.target.value)} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
          <div><label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Slug (URL)</label><input defaultValue={quiz.slug} onBlur={(e) => handleChange("slug", e.target.value)} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" /></div>
        </div>
        <div><label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Descrição / Subtítulo</label><textarea defaultValue={quiz.description || ""} onBlur={(e) => handleChange("description", e.target.value)} rows={2} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Fundo</label><div className="flex gap-2"><input type="color" value={quiz.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} className="h-9 w-12 rounded bg-transparent cursor-pointer" /><input value={quiz.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm uppercase font-mono text-xs" /></div></div>
          <div><label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Destaque</label><div className="flex gap-2"><input type="color" value={quiz.theme_color} onChange={(e) => handleChange("theme_color", e.target.value)} className="h-9 w-12 rounded bg-transparent cursor-pointer" /><input value={quiz.theme_color} onChange={(e) => handleChange("theme_color", e.target.value)} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm uppercase font-mono text-xs" /></div></div>
        </div>
        <div className="pt-2 flex items-center justify-between border-t border-border mt-2">
           <span className="text-[11px] font-bold text-muted-foreground uppercase">Formulário de Lead Final Ativado</span>
           <button onClick={() => handleChange("lead_form_enabled", !quiz.lead_form_enabled)} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ${quiz.lead_form_enabled ? 'bg-primary' : 'bg-muted'}`}><span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${quiz.lead_form_enabled ? 'translate-x-4' : 'translate-x-0'}`} /></button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="header-sport text-sm font-bold flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> Passos do Quiz</h3>
          <div className="flex gap-1">
            <button onClick={() => addStepMutation.mutate("choice")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1"><LayoutList className="h-3 w-3" /> Múltipla Escolha</button>
            <button onClick={() => addStepMutation.mutate("image_choice")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-blue-400"><ImageIcon className="h-3 w-3" /> Imagens</button>
            <button onClick={() => addStepMutation.mutate("text_input")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-green-400"><Type className="h-3 w-3" /> Texto</button>
          </div>
        </div>

        <div className="space-y-4">
          {steps.map((step: any, idx: number) => (
            <div key={step.id} className="glass-panel flex flex-col relative overflow-hidden">
              <div className="bg-muted/30 px-3 py-2 border-b border-border flex items-center justify-between">
                 <div className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">{idx + 1}</span><span className="text-[10px] font-mono uppercase text-muted-foreground">{step.step_type.replace('_', ' ')}</span></div>
                 <button onClick={() => { if(confirm('Excluir passo?')) deleteStepMutation.mutate(step.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="h-3 w-3" /></button>
              </div>
              
              <div className="p-4 space-y-3">
                 <input defaultValue={step.title} onBlur={(e) => updateStepMutation.mutate({ id: step.id, data: { title: e.target.value } })} placeholder="Qual a sua pergunta?" className="w-full bg-transparent border-b border-border text-base font-bold focus:border-primary focus:outline-none py-1" />
                 <input defaultValue={step.content || ""} onBlur={(e) => updateStepMutation.mutate({ id: step.id, data: { content: e.target.value } })} placeholder="Subtítulo ou instrução (opcional)" className="w-full text-xs bg-transparent border-none text-muted-foreground focus:text-foreground focus:outline-none" />

                 {step.step_type === 'choice' && (
                    <div className="pt-2 space-y-2 border-t border-border mt-2">
                       <label className="text-[10px] font-bold text-muted-foreground uppercase">Opções</label>
                       {(Array.isArray(step.options) ? step.options : []).map((opt: string, i: number) => (
                          <div key={i} className="flex gap-2 items-center">
                             <input defaultValue={opt} onBlur={(e) => { const newOpts = [...(step.options||[])]; newOpts[i] = e.target.value; updateStepMutation.mutate({ id: step.id, data: { options: newOpts } }); }} className="flex-1 bg-background/50 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary" />
                             <button onClick={() => { const newOpts = (step.options||[]).filter((_:any, j:number) => j !== i); updateStepMutation.mutate({ id: step.id, data: { options: newOpts } }); }} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                             <select value={step.next_step_map?.[opt] || "default"} onChange={(e) => updateStepMutation.mutate({ id: step.id, data: { next_step_map: { ...(step.next_step_map || {}), [opt]: e.target.value === 'default' ? null : e.target.value } } })} className="bg-background border border-border rounded px-2 py-1.5 text-[10px] text-muted-foreground max-w-[130px] outline-none">
                                <option value="default">Padrão</option>
                                {steps.filter((s:any) => s.id !== step.id).map((s:any) => <option key={s.id} value={s.id}>Ir para: {s.title.substring(0, 10)}...</option>)}
                                <option value="end">Fim</option>
                             </select>
                          </div>
                       ))}
                       <button onClick={() => updateStepMutation.mutate({ id: step.id, data: { options: [...(step.options||[]), "Nova Opção"] } })} className="text-[10px] font-bold text-primary hover:underline">+ Adicionar Opção</button>
                    </div>
                 )}

                 {step.step_type === 'image_choice' && (
                    <div className="pt-2 space-y-2 border-t border-border mt-2">
                       <label className="text-[10px] font-bold text-muted-foreground uppercase">Opções com Imagem (Upload Nativo)</label>
                       {(Array.isArray(step.image_options) ? step.image_options : []).map((opt: any, i: number) => (
                          <div key={i} className="flex gap-3 items-center border border-white/10 p-2 rounded-xl bg-white/5">
                             <ImageUpload value={opt.url} onChange={(url) => { const newOpts = [...(step.image_options||[])]; newOpts[i] = {...newOpts[i], url}; updateStepMutation.mutate({ id: step.id, data: { image_options: newOpts } }); }} label="" className="shrink-0" />
                             <div className="flex-1 space-y-2">
                                <input defaultValue={opt.label} onBlur={(e) => { const newOpts = [...(step.image_options||[])]; newOpts[i] = {...newOpts[i], label: e.target.value, value: e.target.value}; updateStepMutation.mutate({ id: step.id, data: { image_options: newOpts } }); }} placeholder="Título da Opção" className="w-full bg-background/50 border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-primary" />
                                <select value={step.next_step_map?.[opt.value] || "default"} onChange={(e) => updateStepMutation.mutate({ id: step.id, data: { next_step_map: { ...(step.next_step_map || {}), [opt.value]: e.target.value === 'default' ? null : e.target.value } } })} className="w-full bg-background border border-border rounded px-2 py-1.5 text-[10px] text-muted-foreground outline-none">
                                  <option value="default">Padrão (Próximo Passo)</option>
                                  {steps.filter((s:any) => s.id !== step.id).map((s:any) => <option key={s.id} value={s.id}>Ir para: {s.title.substring(0, 15)}...</option>)}
                                  <option value="end">Fim do Quiz</option>
                               </select>
                             </div>
                             <button onClick={() => { const newOpts = (step.image_options||[]).filter((_:any, j:number) => j !== i); updateStepMutation.mutate({ id: step.id, data: { image_options: newOpts } }); }} className="text-muted-foreground hover:text-destructive self-start"><X className="h-3.5 w-3.5" /></button>
                          </div>
                       ))}
                       <button onClick={() => updateStepMutation.mutate({ id: step.id, data: { image_options: [...(step.image_options||[]), {url: '', label: 'Nova Opção', value: 'Nova Opção'}] } })} className="text-[10px] font-bold text-primary hover:underline">+ Adicionar Opção de Imagem</button>
                    </div>
                 )}
                 {step.step_type === 'text_input' && <div className="text-xs text-muted-foreground italic mt-2"><AlignLeft className="h-3 w-3 inline mr-1"/> Campo de texto livre será exibido ao usuário.</div>}
              </div>
            </div>
          ))}
          {steps.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">Nenhuma pergunta adicionada.</p>}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// LIVE PREVIEW COMPONENT
// ---------------------------------------------------------
function LivePreview({ pageId }: { pageId: string }) {
  const { data: page } = useQuery({ queryKey: ["link-pages", pageId], queryFn: async () => { const { data } = await (supabase as any).from("link_pages").select("*").eq("id", pageId).single(); return data as any; } });
  const { data: links = [] } = useQuery({ queryKey: ["link-items", pageId], queryFn: async () => { const { data } = await (supabase as any).from("link_items").select("*").eq("page_id", pageId).eq("is_active", true).order("order_index", { ascending: true }); return data || []; } });

  if (!page) return null;
  const btnRadius = page.button_style === 'pill' ? '999px' : page.button_style === 'squared' ? '4px' : '12px';

  return (
    <div className="relative w-[300px] h-[600px] bg-black border-[6px] border-[#333] rounded-[2.5rem] shadow-2xl overflow-hidden shadow-primary/20">
      <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50"><div className="w-32 h-5 bg-[#333] rounded-b-xl"></div></div>
      <div className="w-full h-full overflow-y-auto custom-scrollbar relative" style={{ backgroundColor: page.bg_color, fontFamily: page.font_family }}>
        {page.template === 'racing-neon' && <div className="absolute inset-0 bg-gradient-to-br from-transparent to-[#00d4ff]/10 pointer-events-none" />}
        <div className="px-5 py-12 relative z-10 flex flex-col items-center">
          {page.avatar ? <img src={page.avatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover ring-2" style={{ borderColor: page.accent_color }} /> : <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl" style={{ backgroundColor: page.accent_color + '40', color: page.accent_color }}>{page.title.charAt(0)}</div>}
          <h1 className="mt-4 text-xl font-bold text-center w-full truncate" style={{ color: page.template === 'matte-carbon' ? '#fff' : page.accent_color }}>{page.title}</h1>
          {page.bio && <p className="mt-2 text-xs text-center opacity-80 text-white">{page.bio}</p>}
          <div className="mt-6 w-full space-y-3">
            {links.map((link:any) => (
              <div key={link.id} className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold transition-all" style={{ backgroundColor: page.template === 'matte-carbon' ? 'rgba(255,255,255,0.05)' : page.accent_color + '20', border: `1px solid ${page.accent_color}50`, color: '#fff', borderRadius: btnRadius }}>
                {link.type === 'whatsapp' && <MessageSquare className="h-4 w-4" />}
                {link.type === 'maps' && <MapPin className="h-4 w-4" />}
                {link.title}
              </div>
            ))}
          </div>
          {page.lead_form_enabled && (
             <div className="mt-8 w-full p-4 rounded-xl border border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <h3 className="text-sm font-bold text-white mb-3 text-center">Fale Conosco</h3>
                <div className="space-y-2"><div className="h-8 rounded bg-white/10 w-full"></div><div className="h-8 rounded bg-white/10 w-full"></div><div className="h-8 rounded w-full mt-4" style={{ backgroundColor: page.accent_color }}></div></div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
