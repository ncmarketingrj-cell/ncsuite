import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase-external/client";
import { Loader2, ExternalLink, MessageSquare, Phone, MapPin, Youtube, Instagram, Facebook, Send, Car, ChevronLeft, ChevronRight, ChevronDown, Twitter, Linkedin } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/p/$slug")({
  head: () => ({ meta: [{ title: "Link Bio" }] }),
  component: PublicLinkPage,
});

// CSS animations injected once
const ATTENTION_ANIMATIONS_CSS = `
@keyframes lb-shake {
  0%, 100% { transform: translateX(0); }
  15% { transform: translateX(-5px) rotate(-1deg); }
  30% { transform: translateX(5px) rotate(1deg); }
  45% { transform: translateX(-4px); }
  60% { transform: translateX(4px); }
  75% { transform: translateX(-2px); }
}
@keyframes lb-glow-pulse {
  0%, 100% { box-shadow: 0 0 8px 2px var(--lb-accent, #e02020), 0 0 0 1px var(--lb-accent, #e02020); }
  50% { box-shadow: 0 0 22px 6px var(--lb-accent, #e02020), 0 0 0 1px var(--lb-accent, #e02020); }
}
.lb-anim-pulse { animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
.lb-anim-bounce { animation: bounce 1s infinite; }
.lb-anim-shake { animation: lb-shake 0.8s ease-in-out infinite; animation-delay: 1.5s; }
.lb-anim-glow { animation: lb-glow-pulse 2s ease-in-out infinite; }
`;

function getSocialUrl(key: string, handle: string): string {
  if (!handle) return "";
  const h = handle.replace(/^@/, "").trim();
  const lower = handle.toLowerCase();
  if (lower.startsWith("http")) return handle;
  switch (key) {
    case "social_instagram": return `https://instagram.com/${h}`;
    case "social_facebook": return `https://facebook.com/${h}`;
    case "social_youtube": return `https://youtube.com/@${h}`;
    case "social_tiktok": return `https://tiktok.com/@${h}`;
    case "social_linkedin": return `https://linkedin.com/in/${h}`;
    case "social_twitter": return `https://x.com/${h}`;
    default: return handle;
  }
}

function SocialIcon({ network }: { network: string }) {
  const cls = "h-5 w-5";
  switch (network) {
    case "social_instagram": return <Instagram className={cls} />;
    case "social_facebook": return <Facebook className={cls} />;
    case "social_youtube": return <Youtube className={cls} />;
    case "social_tiktok":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z"/>
        </svg>
      );
    case "social_linkedin": return <Linkedin className={cls} />;
    case "social_twitter": return <Twitter className={cls} />;
    default: return null;
  }
}

const SOCIAL_KEYS = ["social_instagram", "social_facebook", "social_youtube", "social_tiktok", "social_linkedin", "social_twitter"];

function SocialBar({ theme, accentColor }: { theme: any; accentColor: string }) {
  const links = SOCIAL_KEYS.filter(k => !!theme?.[k]);
  if (!links.length) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="flex items-center justify-center gap-3 mt-5"
    >
      {links.map(key => (
        <a
          key={key}
          href={getSocialUrl(key, theme[key])}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center w-10 h-10 rounded-full transition-all duration-200 hover:scale-110 hover:brightness-125"
          style={{
            backgroundColor: `${accentColor}18`,
            border: `1px solid ${accentColor}40`,
            color: accentColor,
          }}
        >
          <SocialIcon network={key} />
        </a>
      ))}
    </motion.div>
  );
}

function BannerCarousel({ banners, accentColor, btnRadius, onBannerClick }: {
  banners: any[];
  accentColor: string;
  btnRadius: string;
  onBannerClick: (banner: any) => void;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (banners.length <= 1) return;
    const timer = setInterval(() => setIdx(i => (i + 1) % banners.length), 4000);
    return () => clearInterval(timer);
  }, [banners.length]);

  if (!banners.length) return null;

  const prev = () => setIdx(i => (i - 1 + banners.length) % banners.length);
  const next = () => setIdx(i => (i + 1) % banners.length);
  const current = banners[idx];

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="w-full relative overflow-hidden mb-6"
      style={{ borderRadius: btnRadius }}
    >
      <div
        className="relative cursor-pointer overflow-hidden"
        style={{ borderRadius: btnRadius }}
        onClick={() => current.url && onBannerClick(current)}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={idx}
            src={current.image}
            alt={current.title || `Banner ${idx + 1}`}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.35 }}
            className="w-full object-cover"
            style={{ maxHeight: 200, minHeight: 140 }}
          />
        </AnimatePresence>

        {current.title && (
          <div
            className="absolute bottom-0 inset-x-0 px-4 py-2 text-sm font-semibold text-white"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75), transparent)" }}
          >
            {current.title}
          </div>
        )}

        {current.url && (
          <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1">
            <ExternalLink className="h-3 w-3 text-white" />
          </div>
        )}
      </div>

      {banners.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center bg-black/50 hover:bg-black/70 text-white transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="flex justify-center gap-1.5 mt-2">
            {banners.map((_, i) => (
              <button
                key={i}
                onClick={() => setIdx(i)}
                className="rounded-full transition-all duration-200"
                style={{
                  width: i === idx ? 18 : 6,
                  height: 6,
                  backgroundColor: i === idx ? accentColor : `${accentColor}50`,
                }}
              />
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}

function FaqAccordion({ faqs, accentColor, btnRadius }: { faqs: any[]; accentColor: string; btnRadius: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!faqs.length) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="w-full mt-10 space-y-2"
    >
      <p className="text-xs uppercase tracking-widest text-center mb-4" style={{ color: `${accentColor}80` }}>
        Perguntas Frequentes
      </p>
      {faqs.map((faq: any) => (
        <div
          key={faq.id}
          className="overflow-hidden"
          style={{
            borderRadius: btnRadius,
            border: `1px solid ${accentColor}25`,
            backgroundColor: "rgba(0,0,0,0.3)",
          }}
        >
          <button
            className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white"
            onClick={() => setOpen(open === faq.id ? null : faq.id)}
          >
            <span>{faq.question}</span>
            <ChevronDown
              className="h-4 w-4 shrink-0 ml-2 transition-transform duration-300"
              style={{
                color: accentColor,
                transform: open === faq.id ? "rotate(180deg)" : "rotate(0deg)",
              }}
            />
          </button>
          <AnimatePresence>
            {open === faq.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <p className="px-4 pb-4 text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>
                  {faq.answer}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </motion.div>
  );
}

function PublicLinkPage() {
  const { slug } = Route.useParams();
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "", vehicle: "" });
  const [submitted, setSubmitted] = useState(false);
  const [utms, setUtms] = useState({ utm_source: "", utm_medium: "", utm_campaign: "", utm_content: "" });

  const { data: page, isLoading, error } = useQuery({
    queryKey: ["public-link-page", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("link_pages").select("*").eq("slug", slug).eq("is_active", true).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["public-link-items", page?.id],
    enabled: !!page?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("link_items").select("*").eq("page_id", page.id).eq("is_active", true).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!page?.id) return;
    const viewKey = `viewed_${page.id}`;
    if (!sessionStorage.getItem(viewKey)) {
      (supabase as any).rpc('increment_page_view', { p_id: page.id }).then(() => {
        (supabase as any).from('link_pages').update({ views_count: (page.views_count || 0) + 1 }).eq('id', page.id).then();
      });
      sessionStorage.setItem(viewKey, 'true');
    }
  }, [page?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUtms({
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || ""
    });
  }, []);

  useEffect(() => {
    const theme = page?.theme || {};
    const pixelId = theme.pixel_id;
    if (!pixelId) return;
    if (!(window as any).fbq) {
      (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function() { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
        if (!f._fbq) f._fbq = n;
        n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
        t = b.createElement(e); t.async = !0; t.src = v;
        s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      (window as any).fbq('init', pixelId);
    }
    (window as any).fbq('track', 'PageView');
  }, [page?.id, page?.theme?.pixel_id]);

  useEffect(() => {
    const font = page?.font_family || page?.theme?.font_family || 'Outfit';
    if (!font) return;
    const linkId = 'dynamic-google-font-link';
    let link = document.getElementById(linkId) as HTMLLinkElement;
    if (!link) { link = document.createElement('link'); link.id = linkId; link.rel = 'stylesheet'; document.head.appendChild(link); }
    link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@300;400;500;700;900&display=swap`;
  }, [page?.font_family, page?.theme?.font_family]);

  const clickMutation = useMutation({
    mutationFn: async (itemId: string) => {
      await (supabase as any).from("link_clicks").insert({ item_id: itemId, page_id: page.id, user_agent: navigator.userAgent });
      await (supabase as any).rpc('increment_item_click', { i_id: itemId } as any).then(() => {
        const item = items.find((i: any) => i.id === itemId);
        if (item) (supabase as any).from('link_items').update({ click_count: (item.click_count || 0) + 1 }).eq('id', itemId).then();
      });
    }
  });

  const submitLeadMutation = useMutation({
    mutationFn: async (e: React.FormEvent) => {
      e.preventDefault();
      if (!leadForm.name || !leadForm.phone) throw new Error("Nome e telefone são obrigatórios.");
      const { error } = await (supabase as any).from("lead_captures").insert({
        page_id: page.id, name: leadForm.name, email: leadForm.email, phone: leadForm.phone,
        vehicle_interest: leadForm.vehicle, source: 'link_page',
        utm_source: utms.utm_source || null, utm_medium: utms.utm_medium || null,
        utm_campaign: utms.utm_campaign || null, utm_content: utms.utm_content || null, status: 'novo'
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast.success("Contato enviado com sucesso!");
      const theme = page?.theme || {};
      if ((window as any).fbq && theme.pixel_id) {
        (window as any).fbq('track', 'Lead', { content_name: page.title, status: 'novo' });
      }
    },
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

  const handleBannerClick = (banner: any) => {
    window.open(banner.url, '_blank');
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-black"><Loader2 className="h-6 w-6 animate-spin text-white" /></div>;
  if (error || !page) return (
    <div className="flex min-h-screen items-center justify-center text-center bg-black text-white">
      <div><h1 className="text-2xl font-bold">Página não encontrada</h1><p className="mt-2 text-sm opacity-60">Este link não existe ou foi desativado.</p></div>
    </div>
  );

  const isCarbon = page.template === 'matte-carbon';
  const isNeon = page.template === 'racing-neon';
  const theme = page.theme || {};
  const fontStyle = theme.font_family || page.font_family || 'Outfit';
  const accentColor = page.accent_color || '#e02020';

  let bgStyle: React.CSSProperties = {
    backgroundColor: page.bg_color || '#0a0a0a',
    fontFamily: `${fontStyle}, sans-serif`,
    ['--lb-accent' as any]: accentColor,
  };
  if (theme.bg_type === 'gradient' && theme.bg_gradient) bgStyle.background = theme.bg_gradient;

  const btnRadius = theme.border_radius !== undefined
    ? `${theme.border_radius}px`
    : (page.button_style === 'pill' ? '999px' : page.button_style === 'squared' ? '4px' : '12px');

  const customBtnStyle: React.CSSProperties = { borderRadius: btnRadius };
  if (theme.button_bg_color) { customBtnStyle.backgroundColor = theme.button_bg_color; customBtnStyle.borderColor = theme.button_bg_color; }
  else if (accentColor) { customBtnStyle.backgroundColor = accentColor; customBtnStyle.borderColor = accentColor; }
  if (theme.button_text_color) customBtnStyle.color = theme.button_text_color;

  const isGlass = theme.glassmorphism;
  const glassStyle: React.CSSProperties = isGlass ? {
    backdropFilter: `blur(${theme.blur_intensity || '12px'})`,
    WebkitBackdropFilter: `blur(${theme.blur_intensity || '12px'})`,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    border: theme.border_glow ? `1px solid ${accentColor}60` : '1px solid rgba(255,255,255,0.1)',
    boxShadow: theme.border_glow ? `0 0 20px ${accentColor}20` : 'none',
  } : {};

  const banners: any[] = Array.isArray(theme.banners) ? theme.banners.filter((b: any) => b.image) : [];
  const faqs: any[] = Array.isArray(theme.faq) ? theme.faq.filter((f: any) => f.question) : [];

  function getAnimClass(style: string) {
    switch (style) {
      case 'pulse': return 'lb-anim-pulse';
      case 'bounce': return 'lb-anim-bounce';
      case 'shake': return 'lb-anim-shake';
      case 'glow': return 'lb-anim-glow';
      default: return '';
    }
  }

  return (
    <div className="min-h-screen w-full flex justify-center selection:bg-white/30 relative overflow-x-hidden" style={bgStyle}>
      <style dangerouslySetInnerHTML={{ __html: ATTENTION_ANIMATIONS_CSS }} />

      {theme.bg_type === 'image' && theme.bg_image && (
        <div
          className="fixed inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${theme.bg_image})`, backgroundSize: 'cover', backgroundPosition: 'center',
            backgroundAttachment: 'fixed', opacity: theme.bg_image_opacity !== undefined ? theme.bg_image_opacity : 0.3,
            filter: `blur(${theme.bg_image_blur || '0px'})`,
          }}
        />
      )}

      {theme.custom_css && <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />}

      {isNeon && <div className="fixed inset-0 pointer-events-none opacity-20 z-0" style={{ background: `radial-gradient(circle at 50% 0%, ${accentColor}, transparent 60%)` }} />}
      {isCarbon && <div className="fixed inset-0 pointer-events-none opacity-[0.03] z-0" style={{ backgroundImage: `repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000), repeating-linear-gradient(45deg, #000 25%, transparent 25%, transparent 75%, #000 75%, #000)`, backgroundSize: '10px 10px', backgroundPosition: '0 0, 5px 5px' }} />}

      <div className="w-full max-w-md px-4 py-12 relative z-10 flex flex-col items-center">

        {/* Avatar + Title + Bio */}
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, type: 'spring' }} className="flex flex-col items-center w-full">
          {page.avatar ? (
            <img src={page.avatar} alt="Avatar" className="w-24 h-24 rounded-full object-cover ring-4 shadow-xl" style={{ borderColor: accentColor, boxShadow: `0 0 30px ${accentColor}40` }} />
          ) : (
            <div className="w-24 h-24 rounded-full flex items-center justify-center font-bold text-3xl shadow-xl" style={{ backgroundColor: accentColor + '30', color: accentColor, border: `2px solid ${accentColor}`, boxShadow: `0 0 30px ${accentColor}40` }}>
              {page.title.charAt(0)}
            </div>
          )}
          <h1 className="mt-6 text-2xl font-bold text-center" style={{ color: isCarbon ? '#fff' : accentColor }}>{page.title}</h1>
          {page.bio && <p className="mt-2 text-sm text-center leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>{page.bio}</p>}

          {/* Social Bar */}
          <SocialBar theme={theme} accentColor={accentColor} />
        </motion.div>

        {/* Banner Carousel */}
        {banners.length > 0 && (
          <div className="mt-8 w-full">
            <BannerCarousel
              banners={banners}
              accentColor={accentColor}
              btnRadius={btnRadius}
              onBannerClick={handleBannerClick}
            />
          </div>
        )}

        {/* Links */}
        <div className="mt-6 w-full space-y-4">
          <AnimatePresence>
            {items.map((item: any, i: number) => {
              if (item.type === 'youtube') {
                const videoId = item.url.split('v=')[1]?.split('&')[0] || item.url.split('youtu.be/')[1]?.split('?')[0];
                return (
                  <motion.div key={item.id} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }} className="w-full overflow-hidden shadow-lg" style={{ borderRadius: btnRadius, border: `1px solid ${accentColor}30` }}>
                    {videoId ? (
                      <iframe width="100%" height="200" src={`https://www.youtube.com/embed/${videoId}`} title="YouTube" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen></iframe>
                    ) : (
                      <div className="p-4 text-white text-center">URL do YouTube Inválida</div>
                    )}
                  </motion.div>
                );
              }

              const animClass = getAnimClass(item.animation_style);

              return (
                <motion.button
                  key={item.id}
                  initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.1 }}
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => handleLinkClick(item)}
                  className={`w-full relative group overflow-hidden flex items-center justify-between p-4 shadow-lg transition-all ${animClass}`}
                  style={{
                    backgroundColor: isGlass ? 'rgba(0,0,0,0.2)' : (isCarbon ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.03)'),
                    border: page.button_style === 'outline' ? `1px solid ${accentColor}` : `1px solid ${accentColor}40`,
                    color: '#fff',
                    borderRadius: btnRadius,
                    ...glassStyle
                  }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${accentColor}30, transparent)` }} />
                  <div className="flex items-center gap-3 relative z-10 font-medium">
                    {item.type === 'whatsapp' ? <MessageSquare className="h-5 w-5" style={{ color: accentColor }} /> : item.type === 'phone' ? <Phone className="h-5 w-5" style={{ color: accentColor }} /> : item.type === 'maps' ? <MapPin className="h-5 w-5" style={{ color: accentColor }} /> : null}
                    {item.title}
                  </div>
                  <ExternalLink className="h-4 w-4 opacity-50 relative z-10" />
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* FAQ Accordion */}
        {faqs.length > 0 && (
          <FaqAccordion faqs={faqs} accentColor={accentColor} btnRadius={btnRadius} />
        )}

        {/* Lead Form */}
        {page.lead_form_enabled && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-12 w-full p-6 shadow-2xl relative overflow-hidden"
            style={{
              borderRadius: btnRadius,
              backgroundColor: isGlass ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.4)',
              border: `1px solid ${accentColor}30`,
              ...glassStyle
            }}
          >
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: accentColor }} />
            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2"><Car className="h-5 w-5" style={{ color: accentColor }} /> Fale com um Consultor</h3>
            <p className="text-xs text-white/60 mb-6">Deixe seus dados e entraremos em contato com as melhores ofertas de veículos.</p>

            {submitted ? (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-full mx-auto flex items-center justify-center mb-3" style={{ backgroundColor: accentColor + '20', color: accentColor }}>
                  <Send className="h-6 w-6" />
                </div>
                <p className="text-white font-medium">Contato enviado!</p>
                <p className="text-xs text-white/50 mt-1">Nossa equipe retornará em breve.</p>
              </div>
            ) : (
              <form onSubmit={(e) => submitLeadMutation.mutate(e)} className="space-y-3">
                <input required value={leadForm.name} onChange={e => setLeadForm(p => ({ ...p, name: e.target.value }))} placeholder="Seu nome completo" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input required type="tel" value={leadForm.phone} onChange={e => setLeadForm(p => ({ ...p, phone: e.target.value }))} placeholder="Telefone / WhatsApp" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input type="email" value={leadForm.email} onChange={e => setLeadForm(p => ({ ...p, email: e.target.value }))} placeholder="E-mail (opcional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <input value={leadForm.vehicle} onChange={e => setLeadForm(p => ({ ...p, vehicle: e.target.value }))} placeholder="Qual veículo você procura? (opcional)" className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30" />
                <button type="submit" disabled={submitLeadMutation.isPending} className="w-full mt-2 py-3.5 rounded-lg text-sm font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2" style={customBtnStyle}>
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
