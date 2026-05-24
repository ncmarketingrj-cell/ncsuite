import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion, useScroll, useTransform, useMotionValue,
  useSpring, useInView, useMotionValueEvent,
} from "framer-motion";
import {
  ArrowRight, Bot, BarChart3, Zap, Activity,
  Target, Layers, TrendingUp, Shield, Bell,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — O Sistema Operacional de Marketing da NC Agência" },
      { name: "description", content: "A plataforma proprietária de BI e IA da NC Agência para gestão de tráfego pago de alta performance." },
    ],
  }),
  component: LandingPage,
});

/* ─── color interpolation ─────────────────────────────────────── */
const lr = (a: number, b: number, t: number) => a + (b - a) * t;
const rgb  = (f:[number,number,number], t:[number,number,number], p:number) =>
  `rgb(${Math.round(lr(f[0],t[0],p))},${Math.round(lr(f[1],t[1],p))},${Math.round(lr(f[2],t[2],p))})`;
const rgba = (f:[number,number,number,number], t:[number,number,number,number], p:number) =>
  `rgba(${Math.round(lr(f[0],t[0],p))},${Math.round(lr(f[1],t[1],p))},${Math.round(lr(f[2],t[2],p))},${lr(f[3],t[3],p).toFixed(3)})`;

// Maps scroll 0–1 to a light factor 0–1
function lightFactor(v: number): number {
  //        0    0.18  0.40  0.54  0.78  0.88  0.96  1
  const xs = [0, 0.18, 0.40, 0.54, 0.78, 0.88, 0.96, 1];
  const ys = [0, 0,    0.55, 1,    1,    0.40, 0.04, 0];
  for (let i = 0; i < xs.length - 1; i++) {
    if (v >= xs[i] && v <= xs[i + 1]) {
      const t = (v - xs[i]) / (xs[i + 1] - xs[i]);
      // ease-in-out per segment
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      return lr(ys[i], ys[i + 1], e);
    }
  }
  return 0;
}

function applyTheme(el: HTMLElement, lf: number) {
  // bg
  el.style.setProperty("--lp-bg",      rgb([2,2,5],[245,245,248],lf));
  // nav bg (opaque)
  el.style.setProperty("--lp-nav",     rgba([2,2,5,0.90],[245,245,248,0.90],lf));
  // primary text
  el.style.setProperty("--lp-text",    rgb([255,255,255],[10,10,10],lf));
  // muted text
  el.style.setProperty("--lp-dim",     rgba([255,255,255,0.38],[10,10,10,0.52],lf));
  // very dim text
  el.style.setProperty("--lp-vdim",    rgba([255,255,255,0.20],[10,10,10,0.32],lf));
  // borders
  el.style.setProperty("--lp-bdr",     rgba([255,255,255,0.07],[0,0,0,0.10],lf));
  el.style.setProperty("--lp-bdr2",    rgba([255,255,255,0.05],[0,0,0,0.07],lf));
  // card fill
  el.style.setProperty("--lp-card",    rgba([255,255,255,0.02],[0,0,0,0.025],lf));
  // ticker bar
  el.style.setProperty("--lp-ticker",  rgba([0,0,0,0.40],[245,245,248,0.70],lf));
  // speed-line opacity
  el.style.setProperty("--lp-speed",   String(lr(0.025, 0.018, lf)));
  // ambient glow (red stays, just fades slightly in light mode)
  el.style.setProperty("--lp-glow",    String(lr(0.11, 0.06, lf)));
  // badge tag
  el.style.setProperty("--lp-tag",     rgba([255,255,255,0.20],[0,0,0,0.30],lf));
  el.style.setProperty("--lp-tag-bdr", rgba([255,255,255,0.08],[0,0,0,0.10],lf));
  el.style.setProperty("--lp-tag-bg",  rgba([255,255,255,0.04],[0,0,0,0.04],lf));
  // bg update directly (no extra re-render)
  el.style.backgroundColor = rgb([2,2,5],[245,245,248],lf);
}

/* ─── sub-components ─────────────────────────────────────────── */

function Counter({ to, prefix = "", suffix = "", decimals = 0 }: {
  to: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  useEffect(() => {
    if (!inView) return;
    const dur = 2000, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(parseFloat((e * to).toFixed(decimals)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, decimals]);
  return (
    <span ref={ref} style={{ color: "var(--lp-text)" }}>
      {prefix}{decimals > 0 ? val.toFixed(decimals) : Math.floor(val).toLocaleString("pt-BR")}{suffix}
    </span>
  );
}

function GlowCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={`rounded-3xl border overflow-hidden ${className}`}
      style={{ borderColor: "var(--lp-bdr)", backgroundColor: "var(--lp-card)" }}
      whileHover={{ y: -8, boxShadow: "0 0 50px rgba(220,38,38,0.09),0 0 0 1px rgba(220,38,38,0.13)" }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };
const ITEM    = {
  hidden: { opacity: 0, y: 22 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

function SpeedLines() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none"
      style={{ opacity: "var(--lp-speed, 0.025)" }}>
      {[10,22,34,46,58,70,82].map((pct, i) => (
        <div key={i} className="absolute h-full w-px"
          style={{
            left: `${pct}%`,
            background: "linear-gradient(to bottom, transparent 0%, #DC2626 40%, #DC2626 60%, transparent 100%)",
            transform: "skewX(-18deg)",
            opacity: 0.28 + i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

function Divider({ from, to }: { from: string; to: string }) {
  return <div className="h-40 w-full pointer-events-none"
    style={{ background: `linear-gradient(to bottom, ${from}, ${to})` }} />;
}

/* ─── constants ─────────────────────────────────────────────── */
const TICKER = [
  "META ADS","BI EM TEMPO REAL","GESTÃO DE TRÁFEGO","AUTOMAÇÃO DE ALERTAS",
  "VICTORIA AI","CPL TRACKING","BUDGET PACING","RELATÓRIOS ESTRATÉGICOS",
  "DIAGNÓSTICO DE CRIATIVOS","MULTICANAL","NC AGÊNCIA",
];
const MODULES = [
  { icon: BarChart3, label: "Command Center",  desc: "Dashboard consolidado de investimento, CPL e KPIs de todas as contas.",      tag: "LIVE",  color: "text-red-400",    glow: "from-red-950/50" },
  { icon: Activity,  label: "Métricas & KPIs", desc: "Análise granular de performance com drill-down por conta, data e campanha.",   tag: "DATA",  color: "text-orange-400", glow: "from-orange-950/50" },
  { icon: Target,    label: "Gestão de Ads",   desc: "Controle total de campanhas — status, criativos, pacing e frequência real.",   tag: "OPS",   color: "text-purple-400", glow: "from-purple-950/50" },
  { icon: Bot,       label: "Victoria AI",     desc: "IA estratégica que audita campanhas, identifica padrões e gera insights.",     tag: "AI",    color: "text-cyan-400",   glow: "from-cyan-950/50" },
  { icon: Zap,       label: "Automações",      desc: "Regras inteligentes de alerta por CPL, frequência, budget e anomalias.",       tag: "AUTO",  color: "text-yellow-400", glow: "from-yellow-950/50" },
  { icon: Layers,    label: "Criativos",       desc: "Banco de criativos com score de fadiga e ranking de performance.",             tag: "LAB",   color: "text-pink-400",   glow: "from-pink-950/50" },
];

/* ─── main ─────────────────────────────────────────────────── */
function LandingPage() {
  const mainRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();

  /* Scroll-driven theme: updates CSS vars directly, no re-render */
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    if (mainRef.current) applyTheme(mainRef.current, lightFactor(v));
  });

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  /* Mouse parallax for dashboard */
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rX = useSpring(useTransform(my, [-500,500], [4,-4]), { stiffness:80, damping:28 });
  const rY = useSpring(useTransform(mx, [-700,700], [-5,5]), { stiffness:80, damping:28 });
  const heroOpacity = useTransform(scrollYProgress, [0,0.14], [1,0]);
  const heroY       = useTransform(scrollYProgress, [0,0.14], [0,70]);
  const onMM = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width/2);
    my.set(e.clientY - r.top  - r.height/2);
  }, [mx,my]);
  const onML = useCallback(() => { mx.set(0); my.set(0); }, [mx,my]);

  return (
    <div
      ref={mainRef}
      className="relative min-h-screen overflow-x-hidden"
      style={{
        backgroundColor: "#020205",
        // CSS var defaults (dark mode initial state)
        "--lp-bg":      "#020205",
        "--lp-nav":     "rgba(2,2,5,0.90)",
        "--lp-text":    "#ffffff",
        "--lp-dim":     "rgba(255,255,255,0.38)",
        "--lp-vdim":    "rgba(255,255,255,0.20)",
        "--lp-bdr":     "rgba(255,255,255,0.07)",
        "--lp-bdr2":    "rgba(255,255,255,0.05)",
        "--lp-card":    "rgba(255,255,255,0.02)",
        "--lp-ticker":  "rgba(0,0,0,0.40)",
        "--lp-speed":   "0.025",
        "--lp-glow":    "0.11",
        "--lp-tag":     "rgba(255,255,255,0.20)",
        "--lp-tag-bdr": "rgba(255,255,255,0.08)",
        "--lp-tag-bg":  "rgba(255,255,255,0.04)",
      } as React.CSSProperties}
    >
      <style>{`
        @keyframes marquee   { to { transform: translateX(-50%); } }
        @keyframes shimmerTx { 0%{background-position:-200% center}100%{background-position:200% center} }
        @keyframes floatY    { 0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)} }
        @keyframes scanPulse { 0%,100%{opacity:0}50%{opacity:1} }
        .marquee-inner { animation: marquee 35s linear infinite; }
        .text-shimmer {
          background: linear-gradient(90deg,#fff 20%,#ef4444 40%,#fff 60%,#ef4444 80%,#fff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: shimmerTx 5s linear infinite;
        }
        .float { animation: floatY 7s ease-in-out infinite; }
        .scan-line::after {
          content:''; position:absolute; inset-x:0; height:2px;
          background:linear-gradient(90deg,transparent,rgba(220,38,38,0.22),transparent);
          animation: scanPulse 2.8s ease-in-out infinite;
        }
        /* smooth transition on all dynamic elements */
        [data-th] {
          transition:
            background-color 0.55s ease,
            color            0.55s ease,
            border-color     0.55s ease,
            opacity          0.55s ease;
        }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header
        data-th=""
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled ? "backdrop-blur-2xl border-b py-3" : "bg-transparent py-5"
        }`}
        style={scrolled ? {
          backgroundColor: "var(--lp-nav)",
          borderColor:     "var(--lp-bdr2)",
        } : undefined}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC" className="h-9 w-9 object-contain" />
            <div className="leading-none">
              <div className="font-black text-[15px] tracking-tight uppercase"
                style={{ color: "var(--lp-text)" }}>NC Agência</div>
              <div className="text-[8px] font-mono font-bold uppercase tracking-[0.32em] text-red-500/80 mt-0.5">
                Performance Suite
              </div>
            </div>
          </div>
          <Link to="/login"
            className="group inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-600/10 px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-red-400 transition-all hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-[0_0_28px_rgba(220,38,38,0.35)]"
          >
            Acessar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </header>

      {/* ══ HERO ══ */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-center pt-28 pb-0 overflow-hidden"
        onMouseMove={onMM} onMouseLeave={onML}
      >
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 h-[800px] w-[1000px] rounded-full blur-[170px]"
            style={{ backgroundColor: `rgba(220,38,38,var(--lp-glow,0.11))` }} />
          <div className="absolute left-[15%] top-[70%] h-[350px] w-[350px] rounded-full blur-[120px]"
            style={{ backgroundColor: "rgba(185,28,28,0.06)" }} />
          <SpeedLines />
          <div className="absolute inset-0 opacity-[0.13]"
            style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize:"180px" }} />
          <div className="absolute bottom-0 inset-x-0 h-72" style={{ background:"linear-gradient(to top, var(--lp-bg), transparent)" }} />
        </div>

        <motion.div style={{ opacity: heroOpacity, y: heroY }}
          className="relative z-10 w-full max-w-6xl mx-auto px-6 text-center">

          <motion.div
            initial={{ opacity:0, scale:0.9, y:16 }}
            animate={{ opacity:1, scale:1,   y:0  }}
            transition={{ duration:0.7, ease:[0.16,1,0.3,1] }}
            className="mb-8 inline-flex items-center gap-2.5 rounded-full border px-5 py-2 text-[9px] font-black uppercase tracking-[0.28em] text-red-400/80 backdrop-blur-xl"
            style={{ borderColor:"var(--lp-bdr)", backgroundColor:"rgba(0,0,0,0.20)" }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-60" />
              <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
            </span>
            Tecnologia Proprietária · NC Agência · Automotivo
          </motion.div>

          <motion.h1
            initial={{ opacity:0, y:60 }}
            animate={{ opacity:1, y:0  }}
            transition={{ duration:1, delay:0.1, ease:[0.16,1,0.3,1] }}
            className="font-black leading-[0.86] tracking-[-0.04em]"
            style={{ fontSize:"clamp(44px,8.5vw,100px)" }}
          >
            <span className="block" style={{ color:"var(--lp-text)" }}>O sistema que</span>
            <span className="block text-shimmer">acelera resultados</span>
            <span className="block" style={{ color:"var(--lp-dim)" }}>da NC Agência.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity:0, y:24 }}
            animate={{ opacity:1, y:0  }}
            transition={{ duration:0.9, delay:0.28, ease:[0.16,1,0.3,1] }}
            className="mx-auto mt-7 max-w-2xl text-base sm:text-lg font-medium leading-relaxed"
            style={{ color:"var(--lp-dim)" }}
          >
            Plataforma de Business Intelligence + IA desenvolvida para centralizar operação,
            tráfego pago e tomada de decisão com a velocidade que a alta performance exige.
          </motion.p>

          <motion.div
            initial={{ opacity:0, y:20 }}
            animate={{ opacity:1, y:0  }}
            transition={{ duration:0.8, delay:0.42 }}
            className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <button
              onClick={() => document.getElementById("suite")?.scrollIntoView({ behavior:"smooth" })}
              className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-9 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_50px_rgba(220,38,38,0.5)] active:scale-[0.97]"
            >
              Explorar a Suite <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </button>
            <Link to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border px-9 py-4 text-[11px] font-black uppercase tracking-[0.2em] transition-all active:scale-[0.97] backdrop-blur-sm"
              style={{ borderColor:"var(--lp-bdr)", color:"var(--lp-dim)" }}
            >
              Acesso Restrito
            </Link>
          </motion.div>
        </motion.div>

        {/* 3D Dashboard */}
        <motion.div
          initial={{ opacity:0, y:110, scale:0.94 }}
          animate={{ opacity:1, y:0, scale:1 }}
          transition={{ duration:1.5, delay:0.55, ease:[0.16,1,0.3,1] }}
          className="relative z-20 mt-16 w-full max-w-[1180px] px-4 sm:px-6 float"
          style={{ perspective:"2200px" }}
        >
          <motion.div style={{ rotateX:rX, rotateY:rY }}>
            <div className="absolute -inset-1 rounded-2xl blur-[40px]"
              style={{ backgroundColor:"rgba(220,38,38,0.08)" }} />
            <div className="relative rounded-[18px] overflow-hidden border"
              style={{ borderColor:"var(--lp-bdr)", boxShadow:"0 60px 120px rgba(0,0,0,0.75),0 0 0 1px rgba(255,255,255,0.04)", backgroundColor:"#0C0C0E" }}>
              <div className="flex items-center gap-2 px-4 py-3 border-b"
                style={{ borderColor:"var(--lp-bdr2)", backgroundColor:"rgba(0,0,0,0.40)" }}>
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                  <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                </div>
                <div className="flex-1 mx-6">
                  <div className="mx-auto max-w-xs h-5 rounded border flex items-center justify-center px-3"
                    style={{ borderColor:"var(--lp-bdr2)", backgroundColor:"rgba(255,255,255,0.04)" }}>
                    <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-2" />
                    <span className="text-[9px] font-mono" style={{ color:"var(--lp-vdim)" }}>
                      app.ncperformance.com.br
                    </span>
                  </div>
                </div>
              </div>
              <div className="scan-line relative">
                <img src="/assets/mockup-dashboard.png" alt="NC Performance Suite — Dashboard" className="w-full h-auto object-cover object-top" />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background:"linear-gradient(to bottom,transparent 50%,var(--lp-bg) 100%)" }} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ══ TICKER ══ */}
      <div data-th="" className="relative border-y py-3.5 overflow-hidden select-none backdrop-blur-sm"
        style={{ borderColor:"var(--lp-bdr)", backgroundColor:"var(--lp-ticker)" }}>
        <div className="flex marquee-inner whitespace-nowrap gap-14">
          {[...TICKER,...TICKER].map((item,i) => (
            <span key={i} className="inline-flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.32em]"
              style={{ color:"var(--lp-vdim)" }}>
              <span className="inline-block h-1 w-1 rounded-full bg-red-600 flex-shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ══ STATS ══ */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once:true, margin:"-60px" }}
            className="grid grid-cols-2 lg:grid-cols-4 border rounded-3xl overflow-hidden"
            style={{ borderColor:"var(--lp-bdr)" }}>
            {[
              { to:61,    pre:"R$", suf:"M+", label:"em mídia gerenciada" },
              { to:25048, pre:"",   suf:"+",  label:"leads gerados"       },
              { to:150,   pre:"",   suf:"+",  label:"campanhas ativas"    },
              { to:99,    pre:"",   suf:".9%",label:"disponibilidade"     },
            ].map((s,i) => (
              <motion.div key={i} variants={ITEM} data-th=""
                className="p-8 text-center transition-colors border-r border-b last:border-r-0"
                style={{ borderColor:"var(--lp-bdr2)", backgroundColor:"var(--lp-card)" }}>
                <div className="text-3xl sm:text-[40px] font-black tracking-tight mb-2">
                  <Counter to={s.to} prefix={s.pre} suffix={s.suf} />
                </div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-[0.22em]"
                  style={{ color:"var(--lp-vdim)" }}>{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══ SUITE MODULES ══ */}
      <section id="suite" className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute right-0 top-1/3 h-[600px] w-[600px] rounded-full blur-[160px]"
            style={{ backgroundColor:"rgba(185,28,28,0.07)" }} />
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <motion.div initial={{ opacity:0, y:30 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, margin:"-80px" }} transition={{ duration:0.8, ease:[0.16,1,0.3,1] }}
            className="text-center max-w-3xl mx-auto mb-16">
            <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">NC PERFORMANCE SUITE</span>
            <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5" style={{ fontSize:"clamp(36px,5.5vw,64px)" }}>
              <span style={{ color:"var(--lp-text)" }}>Seis módulos.</span><br />
              <span style={{ color:"var(--lp-dim)" }}>Uma operação.</span>
            </h2>
            <p className="text-base sm:text-lg leading-relaxed" style={{ color:"var(--lp-dim)" }}>
              Cada módulo foi construído sob demanda real da operação — sem excessos, sem atalhos.
            </p>
          </motion.div>
          <motion.div variants={STAGGER} initial="hidden" whileInView="show"
            viewport={{ once:true, margin:"-60px" }} className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {MODULES.map((mod,i) => {
              const Icon = mod.icon;
              return (
                <motion.div key={i} variants={ITEM}>
                  <GlowCard className="h-full">
                    <div className="relative p-7 h-full">
                      <div className={`absolute inset-0 bg-gradient-to-br ${mod.glow} to-transparent opacity-60`} />
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-5">
                          <div className="h-11 w-11 rounded-xl border flex items-center justify-center"
                            style={{ borderColor:"var(--lp-bdr)", backgroundColor:"var(--lp-card)" }}>
                            <Icon className={`h-5 w-5 ${mod.color}`} />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-[0.28em] border rounded-full px-2.5 py-1"
                            style={{ color:"var(--lp-tag)", borderColor:"var(--lp-tag-bdr)", backgroundColor:"var(--lp-tag-bg)" }}>
                            {mod.tag}
                          </span>
                        </div>
                        <h3 className="text-[18px] font-black mb-2" style={{ color:"var(--lp-text)" }}>{mod.label}</h3>
                        <p className="text-[13px] leading-relaxed" style={{ color:"var(--lp-dim)" }}>{mod.desc}</p>
                      </div>
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══ DASHBOARD SHOWCASE ══ */}
      <section className="py-28 relative overflow-hidden border-y"
        style={{ borderColor:"var(--lp-bdr)" }}>
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full blur-[160px]"
            style={{ backgroundColor:"rgba(185,28,28,0.07)" }} />
          <SpeedLines />
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity:0, x:-40 }} whileInView={{ opacity:1, x:0 }}
              viewport={{ once:true, margin:"-80px" }} transition={{ duration:0.9, ease:[0.16,1,0.3,1] }}>
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">COMMAND CENTER</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6" style={{ fontSize:"clamp(34px,4.5vw,56px)" }}>
                <span style={{ color:"var(--lp-text)" }}>Visão completa.</span><br />
                <span style={{ color:"var(--lp-dim)" }}>Zero dispersão.</span>
              </h2>
              <p className="text-base leading-relaxed mb-10" style={{ color:"var(--lp-dim)" }}>
                Todas as contas Meta Ads consolidadas em um painel. Investimento, CPL, pacing de orçamento
                e alertas inteligentes — disponíveis instantaneamente para toda a equipe.
              </p>
              <motion.ul variants={STAGGER} initial="hidden" whileInView="show" viewport={{ once:true }}
                className="space-y-3">
                {[
                  { icon: TrendingUp, text: "Sincronização automática com Meta Ads API" },
                  { icon: Bell,       text: "Alertas de CPL fora do limiar configurado" },
                  { icon: Activity,   text: "Budget pacing em tempo real com indicadores visuais" },
                  { icon: Shield,     text: "Sistema de permissões por cargo e hierarquia" },
                ].map((item,i) => (
                  <motion.li key={i} variants={ITEM} className="flex items-center gap-3 text-sm"
                    style={{ color:"var(--lp-dim)" }}>
                    <div className="h-7 w-7 rounded-lg border flex items-center justify-center flex-shrink-0"
                      style={{ borderColor:"rgba(220,38,38,0.18)", backgroundColor:"rgba(220,38,38,0.08)" }}>
                      <item.icon className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    {item.text}
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>

            <motion.div initial={{ opacity:0, x:40, scale:0.97 }} whileInView={{ opacity:1, x:0, scale:1 }}
              viewport={{ once:true, margin:"-80px" }} transition={{ duration:1, ease:[0.16,1,0.3,1] }}
              className="relative">
              <div className="absolute -inset-6 rounded-3xl blur-[60px]"
                style={{ backgroundColor:"rgba(220,38,38,0.05)" }} />
              <div className="relative rounded-2xl overflow-hidden border shadow-2xl"
                style={{ borderColor:"var(--lp-bdr)" }}>
                <img src="/assets/mockup-dashboard.png" alt="Command Center" className="w-full h-auto" />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background:"linear-gradient(to top,var(--lp-bg) 0%,transparent 50%)" }} />
                <div className="absolute top-4 right-4 rounded-xl backdrop-blur-md border px-3 py-2"
                  style={{ backgroundColor:"rgba(2,2,5,0.70)", borderColor:"var(--lp-bdr)" }}>
                  <div className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] text-green-400 mb-0.5">Budget pacing</div>
                  <div className="text-base font-black text-white">55% <span className="text-xs font-normal text-white/40">do dia</span></div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ VICTORIA AI ══ */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full blur-[150px]"
            style={{ backgroundColor:"rgba(8,145,178,0.07)" }} />
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl border overflow-hidden relative"
            style={{ borderColor:"var(--lp-bdr)", backgroundColor:"var(--lp-card)" }}>
            <div className="absolute top-0 inset-x-0 h-px"
              style={{ background:"linear-gradient(to right,transparent,rgba(220,38,38,0.25),transparent)" }} />
            <div className="grid lg:grid-cols-5">
              <div className="lg:col-span-3 p-10 lg:p-14">
                <motion.div initial={{ opacity:0, y:30 }} whileInView={{ opacity:1, y:0 }}
                  viewport={{ once:true, margin:"-80px" }} transition={{ duration:0.9 }}>
                  <span className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-400 mb-4 block">INTELIGÊNCIA ARTIFICIAL · MÓDULO EXCLUSIVO</span>
                  <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5" style={{ fontSize:"clamp(34px,4.5vw,56px)" }}>
                    <span style={{ color:"var(--lp-text)" }}>Victoria AI.</span><br />
                    <span style={{ color:"var(--lp-dim)" }}>Decisões precisas.</span>
                  </h2>
                  <p className="text-base leading-relaxed mb-8 max-w-lg" style={{ color:"var(--lp-dim)" }}>
                    Treinada com a metodologia NC. Audita campanhas, identifica criativos vencedores,
                    alerta sobre anomalias de entrega e sugere ajustes estratégicos antes que os problemas virem prejuízo.
                  </p>
                  <div className="border rounded-2xl overflow-hidden" style={{ borderColor:"var(--lp-bdr)" }}>
                    {[
                      { label:"Análise de Performance",  val:"Automática"  },
                      { label:"Detecção de Anomalias",   val:"Tempo Real"  },
                      { label:"Relatórios Estratégicos", val:"Sob Demanda" },
                      { label:"Otimizações Sugeridas",   val:"Com Dados"   },
                    ].map((item,i) => (
                      <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b last:border-0"
                        style={{ borderColor:"var(--lp-bdr2)" }}>
                        <span className="text-sm font-medium" style={{ color:"var(--lp-dim)" }}>{item.label}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5 bg-green-500/[0.06]">
                          {item.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>
              <div className="lg:col-span-2 relative min-h-[300px] overflow-hidden border-t lg:border-t-0 lg:border-l"
                style={{ borderColor:"var(--lp-bdr)", backgroundColor:"rgba(0,0,0,0.15)" }}>
                <img src="/assets/mockup-victoria.png" alt="Victoria AI"
                  className="absolute inset-0 w-full h-full object-cover object-left-top opacity-80" />
                <div className="absolute inset-0 hidden lg:block"
                  style={{ background:"linear-gradient(to right,var(--lp-bg) 0%,transparent 40%)" }} />
                <div className="absolute bottom-0 inset-x-0 h-1/2"
                  style={{ background:"linear-gradient(to top,var(--lp-bg),transparent)" }} />
                <div className="absolute top-5 right-5 flex items-center gap-2 rounded-full backdrop-blur-md border px-3.5 py-2"
                  style={{ backgroundColor:"rgba(2,2,5,0.65)", borderColor:"var(--lp-bdr)" }}>
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Victoria Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══ VICTORIA MAIA ══ */}
      <section className="py-28 relative overflow-hidden border-t" style={{ borderColor:"var(--lp-bdr)" }}>
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-0 top-1/2 h-[700px] w-[700px] -translate-y-1/2 rounded-full blur-[170px]"
            style={{ backgroundColor:"rgba(185,28,28,0.06)" }} />
          <SpeedLines />
        </div>
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div initial={{ opacity:0, scale:0.96 }} whileInView={{ opacity:1, scale:1 }}
              viewport={{ once:true, margin:"-80px" }} transition={{ duration:1.1, ease:[0.16,1,0.3,1] }}
              className="relative order-2 lg:order-1">
              <div className="absolute inset-4 blur-[80px] rounded-full"
                style={{ backgroundColor:"rgba(220,38,38,0.07)" }} />
              <div className="relative group rounded-3xl overflow-hidden border shadow-2xl"
                style={{ borderColor:"var(--lp-bdr)" }}>
                <img src="/assets/victoria-maia.png" alt="Victoria Maia — Fundadora NC Agência"
                  className="w-full aspect-[4/5] object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-[1.2s]" />
                <div className="absolute inset-0 pointer-events-none"
                  style={{ background:"linear-gradient(to top,#020205 0%,rgba(2,2,5,0.3) 40%,transparent 70%)" }} />
                <div className="absolute bottom-0 inset-x-0 p-7">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-1">Fundadora & Estrategista Chefe</p>
                  <p className="font-black text-2xl text-white">Victoria Maia</p>
                  <p className="text-sm text-white/40 mt-1">NC Agência · Rio de Janeiro</p>
                </div>
                <div className="absolute top-5 left-5 rounded-xl backdrop-blur-md border px-3 py-1.5"
                  style={{ backgroundColor:"rgba(2,2,5,0.60)", borderColor:"var(--lp-bdr)" }}>
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/50">Agência de Elite</span>
                </div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity:0, x:40 }} whileInView={{ opacity:1, x:0 }}
              viewport={{ once:true, margin:"-80px" }} transition={{ duration:0.9, ease:[0.16,1,0.3,1] }}
              className="order-1 lg:order-2">
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">A VISÃO POR TRÁS DA TECNOLOGIA</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6" style={{ fontSize:"clamp(34px,4.5vw,56px)" }}>
                <span style={{ color:"var(--lp-text)" }}>Construída por quem</span><br />
                <span style={{ color:"var(--lp-dim)" }}>vive a operação.</span>
              </h2>
              <div className="space-y-5 text-[15px] leading-relaxed" style={{ color:"var(--lp-dim)" }}>
                <p>
                  A NC Performance Suite não surgiu de uma sala de produto — surgiu da necessidade real
                  de quem gerencia múltiplas contas, múltiplos clientes e múltiplos criativos ao mesmo tempo.
                </p>
                <p>
                  Victoria Maia, fundadora da NC Agência, identificou que as ferramentas disponíveis no mercado
                  não entregavam a velocidade e a profundidade que uma agência de alta performance exige.
                  A solução foi construir a própria.
                </p>
                <blockquote className="relative border-l-2 border-red-600 pl-6 py-1 italic"
                  style={{ color:"var(--lp-text)", opacity:0.80 }}>
                  <span className="absolute left-3 top-0 text-red-600 text-2xl font-black leading-none select-none">"</span>
                  Não entregamos apenas dados. Entregamos o ecossistema ideal para que nossa equipe opere
                  no mais alto nível de performance — com precisão cirúrgica e velocidade de corrida.
                </blockquote>
              </div>
              <div className="mt-10 flex items-center gap-4">
                <img src="/assets/nc-logo.png" alt="NC" className="h-10 w-10 object-contain opacity-25" />
                <div className="h-px flex-1" style={{ backgroundColor:"var(--lp-bdr)" }} />
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.28em]"
                  style={{ color:"var(--lp-vdim)" }}>Rio de Janeiro · Brasil</span>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══ CTA ══ */}
      <section className="relative py-44 overflow-hidden border-t" style={{ borderColor:"var(--lp-bdr)" }}>
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[170px]"
            style={{ backgroundColor:"rgba(185,28,28,0.13)" }} />
          <SpeedLines />
          <div className="absolute inset-0 opacity-[0.12]"
            style={{ backgroundImage:"url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize:"180px" }} />
        </div>
        <div className="mx-auto max-w-4xl px-6 text-center relative z-10">
          <motion.div initial={{ opacity:0, y:40 }} whileInView={{ opacity:1, y:0 }}
            viewport={{ once:true, margin:"-60px" }} transition={{ duration:0.9, ease:[0.16,1,0.3,1] }}>
            <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-6 block">ACESSO INTERNO · SISTEMA OPERACIONAL</span>
            <h2 className="font-black tracking-[-0.04em] leading-[0.86] mb-8"
              style={{ fontSize:"clamp(48px,9vw,104px)", color:"var(--lp-text)" }}>
              Operação em<br /><span className="text-shimmer">alta velocidade.</span>
            </h2>
            <p className="text-lg mb-12 max-w-lg mx-auto" style={{ color:"var(--lp-dim)" }}>
              O acesso ao NC Performance Suite é restrito a colaboradores e parceiros autorizados da NC Agência.
            </p>
            <Link to="/login"
              className="group inline-flex items-center gap-3 rounded-full bg-red-600 px-12 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_70px_rgba(220,38,38,0.55)] hover:scale-105 active:scale-[0.97] shadow-2xl"
            >
              Acessar Portal Operacional
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1.5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══ FOOTER ══ */}
      <footer data-th="" className="border-t py-10 backdrop-blur-sm"
        style={{ borderColor:"var(--lp-bdr)", backgroundColor:"rgba(0,0,0,0.35)" }}>
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC" className="h-7 w-7 object-contain opacity-35" />
            <span className="text-xs font-black uppercase tracking-[0.22em]" style={{ color:"var(--lp-vdim)" }}>
              NC Agência
            </span>
          </div>
          <span className="text-[9px] font-mono uppercase tracking-[0.22em]" style={{ color:"var(--lp-vdim)", opacity:0.7 }}>
            © {new Date().getFullYear()} NC Performance Suite · Todos os direitos reservados
          </span>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[9px] font-mono uppercase tracking-widest" style={{ color:"var(--lp-vdim)", opacity:0.7 }}>
              Sistema Online
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
