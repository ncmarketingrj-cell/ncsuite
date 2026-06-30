import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase-external/client";
import { Loader2, ArrowRight, CheckCircle, Car, Send } from "lucide-react";

export const Route = createFileRoute("/q/$slug")({
  head: () => ({ meta: [{ title: "Quiz Automotivo" }] }),
  component: PublicQuizPage,
});

function PublicQuizPage() {
  const { slug } = Route.useParams();
  
  // State for quiz progression
  const [currentStepId, setCurrentStepId] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  // State for final lead form
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ name: "", email: "", phone: "", vehicle: "" });
  const [submitted, setSubmitted] = useState(false);
  const [utms, setUtms] = useState({
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_content: ""
  });

  const { data: quiz, isLoading, error } = useQuery({
    queryKey: ["public-quiz", slug],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("quizzes").select("*").eq("slug", slug).eq("is_active", true).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: steps = [] } = useQuery({
    queryKey: ["public-quiz-steps", quiz?.id],
    enabled: !!quiz?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("quiz_steps").select("*").eq("quiz_id", quiz.id).order("order_index", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Parse UTM parameters from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setUtms({
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || "",
      utm_content: params.get("utm_content") || ""
    });
  }, []);

  // Dynamically load Meta Pixel if configured in theme
  useEffect(() => {
    const theme = quiz?.theme || {};
    const pixelId = theme.pixel_id;
    if (!pixelId) return;

    if (!(window as any).fbq) {
      (function(f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function() {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = '2.0';
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      
      (window as any).fbq('init', pixelId);
    }
    
    (window as any).fbq('track', 'PageView');
  }, [quiz?.id, quiz?.theme?.pixel_id]);

  // Dynamically load Google Font if configured
  useEffect(() => {
    const theme = quiz?.theme || {};
    const font = theme.font_family || 'Outfit';
    if (!font) return;
    
    const linkId = 'dynamic-google-font-link';
    let link = document.getElementById(linkId) as HTMLLinkElement;
    if (!link) {
      link = document.createElement('link');
      link.id = linkId;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    link.href = `https://fonts.googleapis.com/css2?family=${font.replace(/\s+/g, '+')}:wght@300;400;500;700;900&display=swap`;
  }, [quiz?.theme?.font_family]);

  // Determine current step based on ID or default to first step
  const currentStep = useMemo(() => {
    if (!steps.length) return null;
    if (!currentStepId) return steps[0];
    return steps.find((s: any) => s.id === currentStepId) || steps[0];
  }, [steps, currentStepId]);

  // Calculate progress
  const progress = useMemo(() => {
    if (!steps.length) return 0;
    if (showLeadForm || submitted) return 100;
    const answeredCount = Object.keys(answers).length;
    return Math.min(Math.round((answeredCount / steps.length) * 100), 95);
  }, [answers, steps.length, showLeadForm, submitted]);

  const submitQuizMutation = useMutation({
    mutationFn: async (e?: React.FormEvent) => {
      if (e) e.preventDefault();
      
      if (quiz.lead_form_enabled) {
        if (!leadForm.name || !leadForm.phone) throw new Error("Nome e telefone são obrigatórios.");
      }

      // 1. Save quiz submission with UTMs
      const { data: subData, error: subErr } = await (supabase as any).from("quiz_submissions").insert({ 
        quiz_id: quiz.id, 
        answers, 
        lead_name: leadForm.name,
        lead_phone: leadForm.phone,
        lead_email: leadForm.email,
        vehicle_interest: leadForm.vehicle,
        completed: true,
        utm_source: utms.utm_source || null,
        utm_medium: utms.utm_medium || null,
        utm_campaign: utms.utm_campaign || null,
        utm_content: utms.utm_content || null
      }).select().single();
      
      if (subErr) throw subErr;

      // 2. Save lead with UTMs
      if (quiz.lead_form_enabled) {
        await (supabase as any).from("lead_captures").insert({
          quiz_id: quiz.id,
          name: leadForm.name,
          email: leadForm.email,
          phone: leadForm.phone,
          vehicle_interest: leadForm.vehicle,
          source: 'quiz',
          utm_source: utms.utm_source || null,
          utm_medium: utms.utm_medium || null,
          utm_campaign: utms.utm_campaign || null,
          utm_content: utms.utm_content || null,
          status: 'novo'
        });
      }
    },
    onSuccess: () => {
      setSubmitted(true);
      // Trigger Meta Pixel conversion event
      const theme = quiz?.theme || {};
      if ((window as any).fbq && theme.pixel_id) {
        (window as any).fbq('track', 'Lead', {
          content_name: quiz.title,
          status: 'novo'
        });
      }
    },
    onError: (e: Error) => alert(e.message)
  });

  const handleNext = (answerValue: string) => {
    if (!currentStep) return;
    
    // Save answer
    const newAnswers = { ...answers, [currentStep.id]: answerValue };
    setAnswers(newAnswers);

    // Branching Logic
    const nextMap = currentStep.next_step_map || {};
    const nextTarget = nextMap[answerValue];

    if (nextTarget === "end") {
      finishQuiz();
    } else if (nextTarget && nextTarget !== "default") {
      setCurrentStepId(nextTarget);
      setHistory([...history, currentStep.id]);
    } else {
      // Default: go to next by order_index
      const currentIndex = steps.findIndex((s: any) => s.id === currentStep.id);
      if (currentIndex < steps.length - 1) {
        setCurrentStepId(steps[currentIndex + 1].id);
        setHistory([...history, currentStep.id]);
      } else {
        finishQuiz();
      }
    }
  };

  const finishQuiz = () => {
    if (quiz.lead_form_enabled) {
      setShowLeadForm(true);
    } else {
      submitQuizMutation.mutate(undefined as any);
    }
  };

  if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-[#0a0a0a]"><Loader2 className="h-8 w-8 animate-spin text-white" /></div>;
  if (error || !quiz) return (
    <div className="flex min-h-screen items-center justify-center text-center bg-[#0a0a0a] text-white">
      <div><h1 className="text-2xl font-bold">Quiz não encontrado</h1><p className="mt-2 text-sm opacity-60">Este quiz não existe ou foi desativado.</p></div>
    </div>
  );

  const theme = quiz.theme || {};
  const themeColor = theme.button_bg_color || quiz.theme_color || '#e02020';
  const fontStyle = theme.font_family || 'Outfit';

  // Base background styling
  let bgStyle: React.CSSProperties = {
    backgroundColor: quiz.bg_color || '#0a0a0a',
    fontFamily: `${fontStyle}, sans-serif`,
  };

  if (theme.bg_type === 'gradient' && theme.bg_gradient) {
    bgStyle.background = theme.bg_gradient;
  }

  // Border radius override
  const btnRadius = theme.border_radius !== undefined ? `${theme.border_radius}px` : '16px';
  const inputRadius = theme.border_radius !== undefined ? `${Math.min(theme.border_radius, 12)}px` : '12px';

  // Button style overrides
  const customBtnStyle: React.CSSProperties = {
    borderRadius: btnRadius,
    backgroundColor: themeColor,
  };
  if (theme.button_text_color) {
    customBtnStyle.color = theme.button_text_color;
  }

  // Glassmorphism styling
  const isGlass = theme.glassmorphism;
  const glassStyle: React.CSSProperties = isGlass ? {
    backdropFilter: `blur(${theme.blur_intensity || '12px'})`,
    WebkitBackdropFilter: `blur(${theme.blur_intensity || '12px'})`,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    border: theme.border_glow ? `1px solid ${themeColor}60` : '1px solid rgba(255,255,255,0.1)',
    boxShadow: theme.border_glow ? `0 0 20px ${themeColor}20` : 'none',
  } : {};

  // Success State
  if (submitted) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 relative overflow-hidden" style={bgStyle}>
      
      {/* Background Image / Overlay */}
      {theme.bg_type === 'image' && theme.bg_image && (
        <div 
          className="fixed inset-0 pointer-events-none z-0" 
          style={{
            backgroundImage: `url(${theme.bg_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            opacity: theme.bg_image_opacity !== undefined ? theme.bg_image_opacity : 0.3,
            filter: `blur(${theme.bg_image_blur || '0px'})`,
          }}
        />
      )}

      {/* Custom CSS Injection */}
      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}

      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center bg-black/40 p-8 rounded-3xl border border-white/10 max-w-sm w-full backdrop-blur-xl relative z-10" style={glassStyle}>
        <CheckCircle className="mx-auto h-20 w-20 mb-6" style={{ color: themeColor }} />
        <h1 className="text-2xl font-bold text-white mb-2">Tudo Certo!</h1>
        <p className="text-sm text-white/70 leading-relaxed mb-8">Recebemos suas respostas. Em receberá em breve o contato de um consultor com as opções ideais.</p>
        <button onClick={() => window.location.reload()} className="w-full py-3 rounded-xl font-bold text-white shadow-lg" style={customBtnStyle}>Voltar ao Início</button>
      </motion.div>
    </div>
  );

  // Lead Form State
  if (showLeadForm) return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12 relative overflow-hidden" style={bgStyle}>
      
      {/* Background Image / Overlay */}
      {theme.bg_type === 'image' && theme.bg_image && (
        <div 
          className="fixed inset-0 pointer-events-none z-0" 
          style={{
            backgroundImage: `url(${theme.bg_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            opacity: theme.bg_image_opacity !== undefined ? theme.bg_image_opacity : 0.3,
            filter: `blur(${theme.bg_image_blur || '0px'})`,
          }}
        />
      )}

      {/* Custom CSS Injection */}
      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}

      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-full max-w-md relative z-10">
        <div className="bg-black/60 backdrop-blur-xl p-8 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden" style={glassStyle}>
          <div className="absolute top-0 left-0 right-0 h-1" style={{ backgroundColor: themeColor }} />
          
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full flex items-center justify-center border-2" style={{ borderColor: themeColor, backgroundColor: themeColor + '20' }}>
              <Car className="h-8 w-8" style={{ color: themeColor }} />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white text-center mb-2">Quase lá!</h2>
          <p className="text-sm text-white/60 text-center mb-8">Preencha seus dados para que possamos enviar as melhores ofertas baseadas no seu perfil.</p>
          
          <form onSubmit={(e) => submitQuizMutation.mutate(e)} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1 block pl-1">Nome Completo *</label>
              <input required value={leadForm.name} onChange={e=>setLeadForm(p=>({...p, name: e.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors" style={{ borderRadius: inputRadius }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1 block pl-1">WhatsApp *</label>
              <input required type="tel" value={leadForm.phone} onChange={e=>setLeadForm(p=>({...p, phone: e.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors" style={{ borderRadius: inputRadius }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider text-white/50 font-bold mb-1 block pl-1">E-mail</label>
              <input type="email" value={leadForm.email} onChange={e=>setLeadForm(p=>({...p, email: e.target.value}))} className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-sm text-white focus:outline-none focus:border-white/30 transition-colors" style={{ borderRadius: inputRadius }} />
            </div>
            
            <button type="submit" disabled={submitQuizMutation.isPending} className="w-full mt-4 py-4 rounded-xl text-sm font-bold text-white shadow-lg transition-transform active:scale-95 flex items-center justify-center gap-2" style={customBtnStyle}>
              {submitQuizMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <><Send className="h-4 w-4" /> Ver Resultados</>}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );

  // Quiz Steps State
  return (
    <div className="flex flex-col min-h-screen relative overflow-hidden" style={bgStyle}>
      
      {/* Background Image / Overlay */}
      {theme.bg_type === 'image' && theme.bg_image && (
        <div 
          className="fixed inset-0 pointer-events-none z-0" 
          style={{
            backgroundImage: `url(${theme.bg_image})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundAttachment: 'fixed',
            opacity: theme.bg_image_opacity !== undefined ? theme.bg_image_opacity : 0.3,
            filter: `blur(${theme.bg_image_blur || '0px'})`,
          }}
        />
      )}

      {/* Custom CSS Injection */}
      {theme.custom_css && (
        <style dangerouslySetInnerHTML={{ __html: theme.custom_css }} />
      )}

      {/* Progress Bar Top */}
      <div className="h-1.5 w-full bg-white/10 relative z-10">
        <motion.div className="absolute top-0 left-0 h-full" style={{ backgroundColor: themeColor }} initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 relative z-10">
        <div className="w-full max-w-lg">
          
          <div className="text-center mb-10">
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight" style={{ color: themeColor }}>{quiz.title}</h1>
            {quiz.description && <p className="mt-3 text-sm text-white/60">{quiz.description}</p>}
          </div>

          <div className="relative min-h-[300px]">
            <AnimatePresence mode="wait">
              {currentStep && (
                <motion.div 
                  key={currentStep.id} 
                  initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.3 }}
                  className="w-full"
                >
                  <h2 className="text-xl md:text-2xl font-bold text-white mb-2 text-center leading-tight">{currentStep.title}</h2>
                  {currentStep.content && <p className="text-sm text-white/60 text-center mb-8">{currentStep.content}</p>}

                  {/* STEP: CHOICE */}
                  {currentStep.step_type === 'choice' && (
                    <div className="space-y-3 mt-8">
                      {(Array.isArray(currentStep.options) ? currentStep.options : []).map((opt: string, i: number) => {
                        const isSelected = answers[currentStep.id] === opt;
                        return (
                          <button 
                            key={i} 
                            onClick={() => handleNext(opt)} 
                            className="w-full text-left px-5 py-4 rounded-2xl border transition-all duration-200 group relative overflow-hidden"
                            style={{ 
                              backgroundColor: isSelected ? themeColor + '20' : 'rgba(255,255,255,0.05)',
                              borderColor: isSelected ? themeColor : 'rgba(255,255,255,0.1)',
                              borderRadius: btnRadius,
                              ...glassStyle
                            }}
                          >
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `linear-gradient(90deg, transparent, ${themeColor}20, transparent)` }} />
                            <div className="flex items-center justify-between relative z-10">
                              <span className="text-sm md:text-base font-medium text-white">{opt}</span>
                              <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors" style={{ borderColor: isSelected ? themeColor : 'rgba(255,255,255,0.2)' }}>
                                {isSelected && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: themeColor }} />}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* STEP: TEXT INPUT */}
                  {currentStep.step_type === 'text_input' && (
                    <form onSubmit={(e) => { e.preventDefault(); handleNext(answers[currentStep.id] || "Respondido"); }} className="mt-8 space-y-4">
                      <textarea 
                        autoFocus
                        rows={3}
                        value={answers[currentStep.id] || ""}
                        onChange={(e) => setAnswers({...answers, [currentStep.id]: e.target.value})}
                        placeholder="Digite sua resposta aqui..."
                        className="w-full bg-white/5 border border-white/10 rounded-2xl p-5 text-white focus:outline-none focus:border-white/30 resize-none text-lg"
                        style={{ borderRadius: btnRadius, ...glassStyle }}
                      />
                      <button 
                        type="submit" 
                        disabled={!answers[currentStep.id]?.trim()}
                        className="w-full py-4 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        style={customBtnStyle}
                      >
                        Continuar <ArrowRight className="h-4 w-4" />
                      </button>
                    </form>
                  )}

                  {/* STEP: IMAGE CHOICE */}
                  {currentStep.step_type === 'image_choice' && (
                    <div className="mt-8 grid grid-cols-2 gap-3">
                       <p className="col-span-2 text-center text-xs text-white/50 italic mb-4 border border-dashed border-white/20 p-4 rounded-xl">Módulo de Imagens configurado internamente. Exibindo opções padrão temporárias.</p>
                       <button onClick={() => handleNext("Opção A")} className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center text-white hover:bg-white/10" style={{ borderRadius: btnRadius }}>🚗 Opção A</button>
                       <button onClick={() => handleNext("Opção B")} className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center text-white hover:bg-white/10" style={{ borderRadius: btnRadius }}>🚙 Opção B</button>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </div>
  );
}
