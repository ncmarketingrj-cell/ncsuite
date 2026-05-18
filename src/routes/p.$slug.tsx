import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ExternalLink, MessageSquare, Phone, MapPin, Youtube, Instagram, Facebook, Send, Car } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$slug")({
  head: () => ({ meta: [{ title: "Link Bio" }] }),
  component: PublicLinkPage,
});

function PublicLinkPage() {
  const { slug } = Route.useParams();
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "", vehicle: "" });
  const [submitted, setSubmitted] = useState(false);

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["public-link-page", slug],
    queryFn: async () => {
      const { data, error } = await supabase.from("link_pages").select("*").eq("slug", slug).eq("is_active", true).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["public-link-items", page?.id],
    enabled: !!page?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("link_items").select("*").eq("page_id", page.id).eq("is_active", true).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Track view once
  useEffect(() => {
    if (!page?.id) return;
    const viewKey = `viewed_${page.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      supabase.rpc('increment_page_view', { p_id: page.id }).then(() => {
        // Fallback se a RPC não existir: update manual (ignora RLS se possível, ou usa edge function, mas faremos update direto se permitido)
        supabase.from('link_pages').update({ views_count: (page.views_count || 0) + 1 }).eq('id', page.id).then();
      });
      sessionStorage.setItem(viewKey, 'true');
    }
  }, [page?.id]);

  const clickMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await supabase.from("link_clicks").insert({ item_id: itemId, page_id: page.id, user_agent: navigator.userAgent });
      await supabase.rpc('increment_item_click', { i_id: itemId }).then(() => {
        // Fallback manual
        const item = items.find(i => i.id === itemId);
        if(item) supabase.from('link_items').update({ click_count: (item.click_count || 0) + 1 }).eq('id', itemId).then();
      });
    }
  });

  const submitLeadMutation = useMutation({
    mutationFn: async (e: React.FormEvent) => {
      e.preventDefault();
      if (!leadForm.name || !leadForm.phone) throw new Error("Nome e telefone são obrigatórios.");
      const { error } = await supabase.from("lead_captures").insert({
        page_id: page.id,
        name: leadForm.name,
        email: leadForm.email,
        phone: leadForm.phone,
        vehicle_interest: leadForm.vehicle,
        source: 'link_page'
      });
      if (error) throw error;
    },
    onSuccess: () => { setSubmitted(true); toast.success("Contato enviado com sucesso!"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleLinkClick = (item: any) => {
    clickMutation.mutate(item.id);
    if (item.type === 'whatsapp') {
      const msg = encodeURIComponent(item.whatsapp_message || 'Olá, vim através do seu link.');
      const num = item.url.replace(/\D/g, '');
      window.open(`https://wa.me/${num}?text=${msg}`, '_blank');
    } else {
      window.open(item.url, '_blank');
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>;
  if (error || !page) return (
    <div className="flex min-h-screen items-center justify-center text-center bg-black text-white">
      <div><h1 className="text-2xl font-bold">Página não encontrada</h1><p className="mt-2 text-sm opacity-60">Este link não existe ou foi desativado.</p></div>
    </div>
  );

  const isCarbon = page.template === 'matte-carbon';
  const isNeon = page.template === 'racing-neon';
  const btnRadius = page.button_style === 'pill' ? '999px' : page.button_style === 'squared' ? '4px' : '12px';

  return (
    <div className="min-h-screen w-full flex justify-center selection:bg-white/30" style={{ backgroundColor: page.bg_color, fontFamily: page.font_family || 'system-ui' }}>
      
      {isNeon && <div className="fixed inset-0 pointer-events-none opacity-20" style={{ background: `radial-gradient(circle at 50% 0%, ${page.accent_color}, transparent 60%)` }} />}
      {isCarbon && <div className="fixed inset-0 pointer-events-none opacity-[0.03]" style={{ backgroundImage: `repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000)`, backgroundSize: '10px 10px', backgroundPosition: '0 0, 5px 5px' }} />}

      <div className="w-full max-w-md px-4 py-12 relative z-10 flex flex-col items-center">
        
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: 'spring' }} className="flex flex-col items-center">
          {page.avatar ? (
            <img src={page.avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover ring-4 shadow-xl" style={{ borderColor: page.accent_color, boxShadow: `0 0 30px ${page.accent_color}40` }} />
          ) : (
            <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-3xl shadow-xl" style={{ backgroundColor: page.accent_color + '30', color: page.accent_color, border: `2px solid ${page.accent_color}`, boxShadow: `0 0 30px ${page.accent_color}40` }}>
              {page.title.charAt(0)}
            </div>
          )}
          
          <h1 className="mt-6 text-2xl font-bold text-center" style={{ color: isCarbon ? '#fff' : page.accent_color }}>{page.title}</h1>
          {page.bio && <p className="mt-2 text-sm text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>{page.bio}</p>}
        </motion.div>

        <div className="mt-10 w-full space-y-4">
          <AnimatePresence>
            {items.map((item: any, i: number) => {
              if (item.type === 'youtube') {
                const videoId = item.url.split('v=')[1]?.split('&')[0] || item.url.split('youtu.be/')[1]?.split('?')[0];
                return (
                  <motion.div key={item.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} className="w-full overflow-hidden shadow-lg" style={{ borderRadius: btnRadius, border: `1px solid ${page.accent_color}30` }}>
                    {videoId ? (
                      <iframe width="100%" height="200" src={`https://www.youtube.com/embed/${videoId}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                    ) : (
                      <div className="p-4 text-white text-center">URL do YouTube Inválida</div>
                    )}
                  </motion.div>
                );
              }

              return (
                <motion.button 
                  key={item.id}
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleLinkClick(item)}
                  className="w-full relative group overflow-hidden flex items-center justify-between p-4 shadow-lg transition-all"
                  style={{ 
                    backgroundColor: isCarbon ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)', 
                    border: page.button_style === 'outline' ? `1px solid ${page.accent_color}` : `1px solid ${page.accent_color}40`, 
                    color: '#fff', 
                    borderRadius: btnRadius 
                  }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${page.accent_color}30, transparent)` }} />
                  
                  <div className="flex items-center gap-3 relative z-10 font-medium">
                    {item.type === 'whatsapp' ? <MessageSquare className="h-5 w-5" style={{ color: page.accent_color }} /> : item.type === 'phone' ? <Phone className="h-5 w-5" style={{ color: page.accent_color }} /> : null}
                    {item.title}
                  </div>
                  <ExternalLink className="h-4 w-4 opacity-50 relative z-10" />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {page.lead_form_enabled && (
          <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.5 }} className="mt-12 w-full p-6 shadow-2xl relative overflow-hidden" style={{ borderRadius: btnRadius, backgroundColor: 'rgba(0,0,0,0.4)', border: `1px solid ${page.accent_color}30` }}>
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: page.accent_color }} />
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Car className="h-5 w-5" style={{ color: page.accent_color }}/> Fale com um Consultor</h3>
            <p className="text-xs text-white/60 mb-6">Deixe seus dados e entraremos em contato com as melhores ofertas de veículos.</p>
            
            {submitted ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: page.accent_color + '20', color: page.accent_color }}>
                  <Send className="h-6 w-6" />
                </div>
                <p className="text-white font-medium">Contato enviado!</p>
                <p className="text-xs text-white/50 mt-1">Nossa equipe retornará em breve.</p>
              </div>
            ) : (
              <form onSubmit={(e) => submitLeadMutation.mutate(e)} className="space-y-3">
                <input required value={leadForm.name} onChange={e=>setLeadForm(p=>({...p, name: e.target.value}))} placeholder="Seu nome completo" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input required type="tel" value={leadForm.phone} onChange={e=>setLeadForm(p=>({...p, phone: e.target.value}))} placeholder="Telefone / WhatsApp" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input type="email" value={leadForm.email} onChange={e=>setLeadForm(p=>({...p, email: e.target.value}))} placeholder="E-mail (opcional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input value={leadForm.vehicle} onChange={e=>setLeadForm(p=>({...p, vehicle: e.target.value}))} placeholder="Qual veículo você procura? (opcional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <button type="submit" disabled={submitLeadMutation.isPending} className="w-full mt-2 py-3.5 rounded-lg text-sm font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2" style={{ backgroundColor: page.accent_color }}>
                  {submitLeadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4" /> Solicitar Contato</>}
                </button>
              </form>
            )}
          </motion.div>
        )}

        <div className="mt-16 text-center">
          <p className="text-[10px] uppercase tracking-widest opacity-30 text-white font-mono">Powered by NC Performance Suite</p>
        </div>
      </div>
    </div>
  );
}
