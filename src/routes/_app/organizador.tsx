import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link2, Plus, Eye, ExternalLink, Loader2, Edit, Trash2, QrCode, Settings, Layout, GripVertical, Check, X, Smartphone, Car, Phone, MessageSquare, Video } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_app/organizador")({
  head: () => ({ meta: [{ title: "Link Bio Manager — NC Suite" }] }),
  component: OrganizadorPage,
});

type LinkPage = { id: string; slug: string; title: string; bio: string | null; views_count: number | null; is_active: boolean | null; created_at: string | null; template: string; avatar: string | null; bg_color: string; accent_color: string; font_family: string; button_style: string; lead_form_enabled: boolean; social_links: any };
type LinkItem = { id: string; page_id: string; title: string; url: string; type: string; is_active: boolean; order_index: number; whatsapp_message: string | null; click_count: number };

const TEMPLATES = [
  { id: 'garage-premium', name: 'Garage Premium', emoji: '🏎️', bg: '#0a0a0a', accent: '#e02020', font: 'Outfit', btn: 'rounded' },
  { id: 'racing-neon', name: 'Racing Neon', emoji: '🏁', bg: '#050a14', accent: '#00d4ff', font: 'Inter', btn: 'pill' },
  { id: 'matte-carbon', name: 'Matte Carbon', emoji: '⚫', bg: '#121212', accent: '#8a8a8a', font: 'JetBrains Mono', btn: 'squared' },
];

function OrganizadorPage() {
  const qc = useQueryClient();
  const [editingPage, setEditingPage] = useState<LinkPage | null>(null);
  const [showQR, setShowQR] = useState<string | null>(null);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["link-pages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("link_pages").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LinkPage[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const slug = `bio-${Math.random().toString(36).substring(2, 8)}`;
      const { data, error } = await supabase.from("link_pages").insert({ title: "Nova Link Bio", slug, user_id: u.user?.id }).select().single();
      if (error) throw error;
      return data as LinkPage;
    },
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ["link-pages"] }); setEditingPage(data); toast.success("Página criada! Configure agora."); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("link_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["link-pages"] }); toast.success("Página excluída."); },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader eyebrow="Automotivo" title="Link Bio Manager" description="Crie páginas de captura ilimitadas para seus veículos e ofertas."
        actions={<button onClick={() => createMutation.mutate()} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow" disabled={createMutation.isPending}>{createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Nova Página</button>}
      />

      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div> : !pages.length ? (
        <div className="glass-panel flex flex-col items-center gap-2 py-16 text-center text-sm text-muted-foreground"><Link2 className="h-6 w-6 text-primary/60" />Nenhuma link bio criada. Comece agora!</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pages.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }} className="glass-panel flex flex-col overflow-hidden group">
              <div className="p-5 flex-1 border-b border-border">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-display text-base font-semibold text-foreground truncate max-w-[200px]">{p.title}</h3>
                    <p className="label-mono mt-1 text-muted-foreground truncate max-w-[200px]">/p/{p.slug}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${p.is_active ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>{p.is_active ? "ATIVO" : "INATIVO"}</span>
                </div>
                
                <div className="mt-4 flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-muted/50 border border-border text-[10px] font-mono flex items-center gap-1">
                    {TEMPLATES.find(t => t.id === p.template)?.emoji} {TEMPLATES.find(t => t.id === p.template)?.name || 'Garage Premium'}
                  </div>
                  {p.lead_form_enabled && <div className="px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary text-[10px] font-mono">LEADS ON</div>}
                </div>
              </div>
              
              <div className="bg-card/50 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> {p.views_count || 0}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowQR(p.slug)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="QR Code"><QrCode className="h-4 w-4" /></button>
                  <a href={`/p/${p.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-primary transition-colors" title="Abrir"><ExternalLink className="h-4 w-4" /></a>
                  <button onClick={() => setEditingPage(p)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Edit className="h-4 w-4" /></button>
                  <button onClick={() => { if(confirm('Excluir esta página?')) deleteMutation.mutate(p.id); }} className="p-1.5 rounded-md hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Editor Modal/Drawer */}
      <AnimatePresence>
        {editingPage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-6xl h-[90vh] bg-card border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-border bg-background/50">
                <h2 className="font-display text-lg font-bold">Editor de Link Bio</h2>
                <button onClick={() => setEditingPage(null)} className="p-2 rounded-full hover:bg-muted"><X className="h-5 w-5" /></button>
              </div>
              <div className="flex-1 flex overflow-hidden">
                <div className="w-1/2 md:w-3/5 overflow-y-auto p-6 border-r border-border custom-scrollbar">
                  <EditorForm page={editingPage} onClose={() => setEditingPage(null)} />
                </div>
                <div className="w-1/2 md:w-2/5 bg-background/50 flex flex-col items-center justify-center p-6">
                  <div className="mb-4 flex items-center gap-2 text-xs font-mono text-muted-foreground bg-card px-3 py-1.5 rounded-full border border-border"><Smartphone className="h-3.5 w-3.5" /> Preview ao vivo</div>
                  <LivePreview page={editingPage} />
                </div>
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
                <img src={`https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(window.location.origin + '/p/' + showQR)}`} alt="QR Code" className="w-48 h-48" />
              </div>
              <p className="text-xs text-muted-foreground mt-6 mb-4">Escaneie para acessar /p/{showQR}</p>
              <a href={`https://api.qrserver.com/v1/create-qr-code/?size=1024x1024&data=${encodeURIComponent(window.location.origin + '/p/' + showQR)}`} download="qrcode.png" target="_blank" rel="noreferrer" className="w-full inline-flex justify-center items-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:shadow-glow">
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
// EDITOR FORM COMPONENT
// ---------------------------------------------------------
function EditorForm({ page, onClose }: { page: LinkPage; onClose: () => void }) {
  const qc = useQueryClient();
  const [formData, setFormData] = useState(page);

  const { data: links = [] } = useQuery({
    queryKey: ["link-items", page.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("link_items").select("*").eq("page_id", page.id).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as LinkItem[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: Partial<LinkPage>) => {
      const { error } = await supabase.from("link_pages").update(data).eq("id", page.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["link-pages"] }); toast.success("Salvo com sucesso!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLinkMutation = useMutation({
    mutationFn: async (type: string) => {
      const { error } = await supabase.from("link_items").insert({ page_id: page.id, title: "Novo Link", url: "", type, order_index: links.length });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", page.id] }),
  });

  const updateLinkMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string, data: Partial<LinkItem> }) => {
      const { error } = await supabase.from("link_items").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", page.id] }),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("link_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["link-items", page.id] }),
  });

  const handleChange = (field: keyof LinkPage, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const save = () => {
    updateMutation.mutate(formData);
  };

  return (
    <div className="space-y-8">
      {/* 1. Informações Básicas */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2"><Settings className="h-4 w-4 text-primary" /> Informações Básicas</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Título da Página</label>
            <input value={formData.title} onChange={(e) => handleChange("title", e.target.value)} onBlur={save} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
          <div>
            <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Slug (URL)</label>
            <input value={formData.slug} onChange={(e) => handleChange("slug", e.target.value)} onBlur={save} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Biografia / Descrição (opcional)</label>
          <textarea value={formData.bio || ""} onChange={(e) => handleChange("bio", e.target.value)} onBlur={save} rows={2} className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none" />
        </div>
        <div>
          <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">URL da Foto/Logo</label>
          <input value={formData.avatar || ""} onChange={(e) => handleChange("avatar", e.target.value)} onBlur={save} placeholder="https://..." className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
        </div>
      </div>

      <hr className="border-border" />

      {/* 2. Aparência (Templates) */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center gap-2"><Layout className="h-4 w-4 text-primary" /> Aparência</h3>
        <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Tema Automotivo</label>
        <div className="grid grid-cols-3 gap-3">
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => { handleChange("template", t.id); handleChange("bg_color", t.bg); handleChange("accent_color", t.accent); handleChange("font_family", t.font); handleChange("button_style", t.btn); save(); }} className={`relative p-3 rounded-xl border text-left transition-all ${formData.template === t.id ? 'border-primary bg-primary/10' : 'border-border hover:border-white/20'}`}>
              <div className="text-xl mb-1">{t.emoji}</div>
              <div className="text-xs font-bold">{t.name}</div>
              {formData.template === t.id && <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 mt-4">
          <div>
             <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Fundo</label>
             <div className="flex gap-2">
                <input type="color" value={formData.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} onBlur={save} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
                <input value={formData.bg_color} onChange={(e) => handleChange("bg_color", e.target.value)} onBlur={save} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
             </div>
          </div>
          <div>
             <label className="text-[11px] font-bold text-muted-foreground uppercase mb-1 block">Cor de Destaque</label>
             <div className="flex gap-2">
                <input type="color" value={formData.accent_color} onChange={(e) => handleChange("accent_color", e.target.value)} onBlur={save} className="h-9 w-12 rounded bg-transparent cursor-pointer" />
                <input value={formData.accent_color} onChange={(e) => handleChange("accent_color", e.target.value)} onBlur={save} className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none uppercase font-mono text-xs" />
             </div>
          </div>
        </div>
      </div>

      <hr className="border-border" />

      {/* 3. Links */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /> Links & Botões</h3>
          <div className="flex gap-1">
            <button onClick={() => addLinkMutation.mutate("link")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1"><Plus className="h-3 w-3" /> URL</button>
            <button onClick={() => addLinkMutation.mutate("whatsapp")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-green-500"><MessageSquare className="h-3 w-3" /> WPP</button>
            <button onClick={() => addLinkMutation.mutate("youtube")} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-bold border border-border flex items-center gap-1 text-red-500"><Video className="h-3 w-3" /> YT</button>
          </div>
        </div>

        <div className="space-y-3">
          {links.map((link) => (
             <div key={link.id} className="glass-panel p-3 flex gap-3 relative">
                <div className="flex-shrink-0 pt-2 cursor-grab text-muted-foreground hover:text-foreground"><GripVertical className="h-4 w-4" /></div>
                <div className="flex-1 space-y-2">
                   <div className="flex items-center justify-between gap-2">
                      <input value={link.title} onChange={(e) => updateLinkMutation.mutate({ id: link.id, data: { title: e.target.value } })} placeholder="Título do Botão" className="flex-1 bg-transparent border-b border-border text-sm font-bold focus:border-primary focus:outline-none py-1" />
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted uppercase">{link.type}</span>
                        <button onClick={() => updateLinkMutation.mutate({ id: link.id, data: { is_active: !link.is_active } })} className={`text-[10px] font-bold px-2 py-1 rounded ${link.is_active ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`}>{link.is_active ? 'ON' : 'OFF'}</button>
                        <button onClick={() => { if(confirm('Excluir link?')) deleteLinkMutation.mutate(link.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                   </div>
                   <input value={link.url} onChange={(e) => updateLinkMutation.mutate({ id: link.id, data: { url: e.target.value } })} placeholder={link.type === 'whatsapp' ? "Número: 5511999999999" : "URL completa..."} className="w-full text-xs bg-transparent border-none text-muted-foreground focus:text-foreground focus:outline-none" />
                   {link.type === 'whatsapp' && (
                     <div className="pt-2 border-t border-border mt-2">
                       <input value={link.whatsapp_message || ""} onChange={(e) => updateLinkMutation.mutate({ id: link.id, data: { whatsapp_message: e.target.value } })} placeholder="Mensagem pré-preenchida (ex: Olá, interesse no Civic)" className="w-full text-[11px] bg-background/50 border border-border rounded px-2 py-1.5 text-muted-foreground focus:outline-none focus:border-primary" />
                     </div>
                   )}
                </div>
             </div>
          ))}
          {links.length === 0 && <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">Nenhum link adicionado.</p>}
        </div>
      </div>

      <hr className="border-border" />

      {/* 4. Captura de Leads */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold flex items-center justify-between gap-2">
          <div className="flex items-center gap-2"><Car className="h-4 w-4 text-primary" /> Captura de Leads (Formulário)</div>
          <button onClick={() => { handleChange("lead_form_enabled", !formData.lead_form_enabled); save(); }} className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${formData.lead_form_enabled ? 'bg-primary' : 'bg-muted'}`}>
             <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${formData.lead_form_enabled ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </h3>
        {formData.lead_form_enabled && (
           <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2">
             <p className="text-xs text-muted-foreground">Um formulário de contato será exibido no final da página para capturar leads. Campos:</p>
             <ul className="text-[11px] font-mono text-foreground space-y-1 ml-4 list-disc">
                <li>Nome</li>
                <li>Telefone / WhatsApp</li>
                <li>Email</li>
                <li>Veículo de Interesse</li>
             </ul>
           </div>
        )}
      </div>

    </div>
  );
}

// ---------------------------------------------------------
// LIVE PREVIEW COMPONENT
// ---------------------------------------------------------
function LivePreview({ page }: { page: LinkPage }) {
  const { data: links = [] } = useQuery({
    queryKey: ["link-items", page.id],
    queryFn: async () => {
      const { data } = await supabase.from("link_items").select("*").eq("page_id", page.id).eq("is_active", true).order("order_index", { ascending: true });
      return (data ?? []) as LinkItem[];
    },
  });

  const btnRadius = page.button_style === 'pill' ? '999px' : page.button_style === 'squared' ? '4px' : '12px';

  return (
    <div className="relative w-[300px] h-[600px] bg-black border-[6px] border-[#333] rounded-[2.5rem] shadow-2xl overflow-hidden shadow-primary/20">
      {/* Notch */}
      <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
        <div className="w-32 h-5 bg-[#333] rounded-b-xl"></div>
      </div>

      <div className="w-full h-full overflow-y-auto custom-scrollbar relative" style={{ backgroundColor: page.bg_color, fontFamily: page.font_family }}>
        
        {page.template === 'racing-neon' && (
           <div className="absolute inset-0 bg-gradient-to-br from-transparent to-[#00d4ff]/10 pointer-events-none" />
        )}
        
        <div className="px-5 py-12 relative z-10 flex flex-col items-center">
          {page.avatar ? (
            <img src={page.avatar} alt="Avatar" className="w-20 h-20 rounded-full object-cover ring-2" style={{ borderColor: page.accent_color }} />
          ) : (
            <div className="w-20 h-20 rounded-full flex items-center justify-center font-bold text-2xl" style={{ backgroundColor: page.accent_color + '40', color: page.accent_color }}>
              {page.title.charAt(0)}
            </div>
          )}
          
          <h1 className="mt-4 text-xl font-bold text-center w-full truncate" style={{ color: page.template === 'matte-carbon' ? '#fff' : page.accent_color }}>{page.title}</h1>
          {page.bio && <p className="mt-2 text-xs text-center opacity-80" style={{ color: '#fff' }}>{page.bio}</p>}

          <div className="mt-6 w-full space-y-3">
            {links.map(link => (
              <div key={link.id} className="w-full text-center px-4 py-3 text-sm font-semibold transition-all" style={{ 
                backgroundColor: page.template === 'matte-carbon' ? 'rgba(255,255,255,0.05)' : page.accent_color + '20', 
                border: `1px solid ${page.accent_color}50`, 
                color: '#fff', 
                borderRadius: btnRadius 
              }}>
                {link.title}
              </div>
            ))}
          </div>

          {page.lead_form_enabled && (
             <div className="mt-8 w-full p-4 rounded-xl border border-white/10" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>
                <h3 className="text-sm font-bold text-white mb-3 text-center">Fale Conosco</h3>
                <div className="space-y-2">
                   <div className="h-8 rounded bg-white/10 w-full"></div>
                   <div className="h-8 rounded bg-white/10 w-full"></div>
                   <div className="h-8 rounded w-full mt-4" style={{ backgroundColor: page.accent_color }}></div>
                </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
