import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion, useScroll, useTransform, useMotionValue, useSpring, useInView,
} from "framer-motion";
import {
  ArrowRight, Bot, BarChart3, Zap, Activity,
  Target, Layers, TrendingUp, Shield, Bell, ChevronDown,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — O Sistema Operacional da NC Agência" },
      { name: "description", content: "Plataforma proprietária de BI e IA da NC Agência para gestão de tráfego pago de alta performance automotiva." },
    ],
  }),
  component: LandingPage,
});

/* ─── counter ─── */
function Counter({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  useEffect(() => {
    if (!inView) return;
    const dur = 1800, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) requestAnimationFrame(tick);
      else setVal(to);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{prefix}{val.toLocaleString("pt-BR")}{suffix}</span>;
}

/* ─── animation presets ─── */
const up = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

/* ─── speed lines ─── */
function SpeedLines({ light = false, count = 7 }: { light?: boolean; count?: number }) {
  const positions = [6, 17, 30, 43, 57, 70, 83, 92].slice(0, count);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: light ? 0.55 : 0.032 }}>
      {positions.map((pct, i) => (
        <div key={i} className="absolute h-full w-px"
          style={{
            left: `${pct}%`,
            background: light
              ? "linear-gradient(to bottom,transparent,rgba(0,0,0,0.10) 35%,rgba(0,0,0,0.10) 65%,transparent)"
              : "linear-gradient(to bottom,transparent,#DC2626 35%,#DC2626 65%,transparent)",
            transform: "skewX(-17deg)",
            opacity: 0.20 + i * 0.06,
          }}
        />
      ))}
    </div>
  );
}

/* ─── data ─── */
const TICKER = [
  "META ADS","BI EM TEMPO REAL","GESTÃO DE TRÁFEGO","AUTOMAÇÃO DE ALERTAS",
  "VICTORIA AI","CPL TRACKING","BUDGET PACING","PERFORMANCE AUTOMOTIVA","NC AGÊNCIA",
];

const MODULES = [
  { icon: BarChart3, label: "Command Center",  desc: "Visão consolidada de investimento, CPL e KPIs de todas as contas em tempo real.", tag: "LIVE", accent: "#EF4444", size: "large" },
  { icon: Activity,  label: "Métricas & KPIs", desc: "Análise granular com drill-down por conta, data e campanha.",                    tag: "DATA", accent: "#F97316", size: "tall"  },
  { icon: Target,    label: "Gestão de Ads",   desc: "Controle total de campanhas — criativos, pacing e frequência real.",             tag: "OPS",  accent: "#A855F7", size: "small" },
  { icon: Bot,       label: "Victoria AI",     desc: "IA que audita contas, identifica padrões e gera insights acionáveis.",          tag: "AI",   accent: "#06B6D4", size: "small" },
  { icon: Zap,       label: "Automações",      desc: "Regras de alerta por CPL, frequência, budget e anomalias de entrega.",          tag: "AUTO", accent: "#EAB308", size: "small" },
  { icon: Layers,    label: "Criativos",       desc: "Score de fadiga, ranking de performance e diagnóstico de criativos.",           tag: "LAB",  accent: "#EC4899", size: "small" },
];

/* ─── main ─── */
function LandingPage() {
  const lightZoneRef = useRef<HTMLDivElement>(null);
  const [navLight, setNavLight] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const obs = new IntersectionObserver(
      ([e]) => setNavLight(e.isIntersecting),
      { rootMargin: "-64px 0px 0px 0px", threshold: 0 }
    );
    if (lightZoneRef.current) obs.observe(lightZoneRef.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const mx = useMotionValue(0), my = useMotionValue(0);
  const rX = useSpring(useTransform(my, [-500, 500], [3.5, -3.5]), { stiffness: 80, damping: 28 });
  const rY = useSpring(useTransform(mx, [-700, 700], [-4.5, 4.5]), { stiffness: 80, damping: 28 });
  const { scrollYProgress } = useScroll();
  const heroOp = useTransform(scrollYProgress, [0, 0.12], [1, 0]);
  const heroY  = useTransform(scrollYProgress, [0, 0.12], [0, 50]);

  const onMM = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top  - r.height / 2);
  }, [mx, my]);
  const onML = useCallback(() => { mx.set(0); my.set(0); }, [mx, my]);

  return (
    <div className="relative overflow-x-hidden">
      <style>{`
        @keyframes mq    { to { transform: translateX(-50%); } }
        @keyframes shimx { 0%{background-position:-200% center}100%{background-position:200% center} }
        @keyframes scp   { 0%,100%{opacity:0}50%{opacity:1} }
        @keyframes flt   { 0%,100%{transform:translateY(0px)}50%{transform:translateY(-10px)} }
        .mq { animation: mq 32s linear infinite; }
        .shimmer-text {
          background: linear-gradient(90deg,#fff 20%,#ef4444 40%,#fff 60%,#ef4444 80%,#fff);
          background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          animation: shimx 5s linear infinite;
        }
        .shimmer-dark {
          background: linear-gradient(90deg,#0A0A08 20%,#DC2626 40%,#0A0A08 60%,#DC2626 80%,#0A0A08);
          background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          animation: shimx 5s linear infinite;
        }
        .flt { animation: flt 7s ease-in-out infinite; }
        .scan::after {
          content:''; position:absolute; inset-x:0; height:2px;
          background:linear-gradient(90deg,transparent,rgba(220,38,38,0.22),transparent);
          animation: scp 3s ease-in-out infinite;
        }
      `}</style>

      {/* ══ NAVBAR ══ */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? navLight
            ? "bg-[#F2F1EE]/92 backdrop-blur-2xl border-b border-black/[0.07] py-3"
            : "bg-[#06060C]/92 backdrop-blur-2xl border-b border-white/[0.06] py-3"
          : "bg-transparent py-5"
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC" className="h-9 w-9 object-contain transition-all duration-500"
              style={{ filter: navLight ? "invert(1)" : "none" }} />
            <div className="leading-none">
              <div className={`font-black text-[15px] tracking-tight uppercase transition-colors duration-500 ${navLight ? "text-[#0A0A08]" : "text-white"}`}>
                NC Agência
              </div>
              <div className="text-[8px] font-mono font-bold uppercase tracking-[0.32em] text-red-500/80 mt-0.5">
                Performance Suite
              </div>
            </div>
          </div>
          <Link to="/login"
            className={`group inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-[0_0_28px_rgba(220,38,38,0.4)] ${
              navLight ? "border-red-500/40 text-red-600" : "border-red-500/30 text-red-400"
            }`}>
            Acessar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </header>

      {/* ══════════ DARK ZONE ══════════ */}
      <div className="bg-[#06060C]">

        {/* ── HERO: assimétrico — texto esquerda, mockup direita ── */}
        <section
          className="relative min-h-screen flex flex-col lg:flex-row items-center pt-24 lg:pt-0 overflow-hidden"
          onMouseMove={onMM} onMouseLeave={onML}
        >
          {/* bg */}
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute left-[45%] top-1/2 -translate-y-1/2 h-[900px] w-[900px] rounded-full bg-red-600/[0.09] blur-[200px]" />
            <div className="absolute left-[5%] top-[20%] h-[300px] w-[300px] rounded-full bg-red-900/[0.06] blur-[120px]" />
            <SpeedLines />
            <div className="absolute inset-0 opacity-[0.11]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "180px" }} />
            {/* gradient right side fade */}
            <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-gradient-to-l from-[#06060C] to-transparent hidden lg:block" />
            <div className="absolute bottom-0 inset-x-0 h-40 bg-gradient-to-t from-[#06060C] to-transparent" />
          </div>

          {/* LEFT — text (55%) */}
          <motion.div
            style={{ opacity: heroOp, y: heroY }}
            className="relative z-10 w-full lg:w-[55%] px-6 lg:pl-16 xl:pl-24 lg:pr-0 py-24 lg:py-0 text-left"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mb-7 inline-flex items-center gap-2.5 rounded-full border border-red-500/[0.18] bg-black/50 px-5 py-2 text-[9px] font-black uppercase tracking-[0.28em] text-red-400/80 backdrop-blur-xl"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-60" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Tecnologia proprietária · NC Agência
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
              className="font-black leading-[0.85] tracking-[-0.04em] text-white"
              style={{ fontSize: "clamp(46px, 6.5vw, 88px)" }}
            >
              Dados que<br />dirigem.<br />
              <span className="shimmer-text">Decisões que<br />aceleram.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="mt-7 max-w-md text-base sm:text-[17px] font-medium leading-relaxed text-white/42"
            >
              Plataforma proprietária de BI e IA para centralizar operação,
              tráfego pago e inteligência de dados com a velocidade que a performance exige.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.38 }}
              className="mt-10 flex flex-wrap items-center gap-4"
            >
              <button
                onClick={() => document.getElementById("suite")?.scrollIntoView({ behavior: "smooth" })}
                className="group inline-flex items-center gap-2 rounded-full bg-red-600 px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_50px_rgba(220,38,38,0.5)] active:scale-[0.97]"
              >
                Explorar Suite <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <Link to="/login"
                className="inline-flex items-center gap-2 rounded-full border border-white/[0.10] px-8 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white/45 transition-all hover:text-white hover:border-white/25 hover:bg-white/[0.06] active:scale-[0.97]"
              >
                Acesso Restrito
              </Link>
            </motion.div>

            {/* scroll hint */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              transition={{ delay: 1.8, duration: 0.6 }}
              className="mt-16 flex items-center gap-2 text-white/20"
            >
              <ChevronDown className="h-4 w-4 animate-bounce" />
              <span className="text-[9px] font-mono uppercase tracking-[0.3em]">scroll para explorar</span>
            </motion.div>
          </motion.div>

          {/* RIGHT — 3D mockup (45%) */}
          <motion.div
            initial={{ opacity: 0, x: 60, scale: 0.94 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 1.6, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-20 w-full lg:w-[45%] px-6 lg:px-8 pb-20 lg:pb-0 flt"
            style={{ perspective: "2200px" }}
          >
            <motion.div style={{ rotateX: rX, rotateY: rY }}>
              <div className="absolute -inset-2 rounded-2xl bg-red-600/[0.08] blur-[60px]" />
              <div className="relative rounded-[16px] overflow-hidden border border-white/[0.09]"
                style={{ backgroundColor: "#0B0B10", boxShadow: "0 50px 100px rgba(0,0,0,0.75), 0 0 0 1px rgba(255,255,255,0.04)" }}>
                {/* titlebar */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.05] bg-black/40">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 mx-4">
                    <div className="mx-auto max-w-[220px] h-4.5 rounded bg-white/[0.05] border border-white/[0.04] flex items-center justify-center gap-1.5 px-2 py-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[8px] font-mono text-white/18">app.ncperformance.com.br</span>
                    </div>
                  </div>
                </div>
                <div className="scan relative">
                  <img src="/assets/mockup-dashboard.png" alt="NC Suite" className="w-full h-auto" />
                  <div className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom,transparent 50%,#06060C 100%)" }} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── TICKER ── */}
        <div className="border-y border-white/[0.05] py-3 overflow-hidden select-none">
          <div className="flex mq whitespace-nowrap gap-12">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.32em] text-white/18">
                <span className="h-[3px] w-3 rounded-full bg-red-600 flex-shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── STATS — horizontal, sem bordas pesadas ── */}
        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              variants={stagger} initial="hidden" whileInView="show"
              viewport={{ once: true, margin: "-50px" }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-0"
            >
              {[
                { to: 61,    pre: "R$", suf: "M+", label: "em mídia gerenciada"   },
                { to: 25048, pre: "",   suf: "+",  label: "leads gerados"          },
                { to: 150,   pre: "",   suf: "+",  label: "campanhas ativas"       },
                { to: 99,    pre: "",   suf: ".9%",label: "disponibilidade"        },
              ].map((s, i) => (
                <motion.div key={i} variants={up}
                  className="px-6 py-8 border-r border-white/[0.06] last:border-r-0 first:pl-0">
                  <div className="text-[42px] sm:text-[52px] font-black tracking-tight leading-none text-white mb-2">
                    <Counter to={s.to} prefix={s.pre} suffix={s.suf} />
                  </div>
                  <div className="text-[9px] font-mono uppercase tracking-[0.24em] text-white/22 mt-1">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── MODULES — layout assimétrico ── */}
        <section id="suite" className="pb-28 pt-6">
          <div className="mx-auto max-w-7xl px-6">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-12">
              <div>
                <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-3 block">A SUITE</span>
                <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-white" style={{ fontSize: "clamp(32px,4.5vw,58px)" }}>
                  Seis instrumentos.<br /><span className="text-white/22">Uma operação.</span>
                </h2>
              </div>
              <p className="text-sm text-white/35 max-w-xs leading-relaxed">
                Cada módulo foi construído sob demanda real — sem excessos, sem atalhos.
              </p>
            </div>

            {/* asymmetric grid: featured card + 5 regular */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* FEATURED — Command Center (spans 2 cols) */}
              <motion.div
                initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.65, ease: [0.16, 1, 0.3, 1] }}
                className="lg:col-span-2"
              >
                <motion.div
                  className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-8 h-full min-h-[220px] overflow-hidden cursor-default"
                  whileHover={{ borderColor: "rgba(239,68,68,0.22)", boxShadow: "0 0 50px rgba(239,68,68,0.07)" }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="absolute top-0 left-8 right-8 h-px bg-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  {/* bg graphic */}
                  <div className="absolute right-0 bottom-0 h-48 w-48 bg-red-600/[0.05] rounded-full blur-[60px]" />
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-start justify-between mb-auto">
                      <div className="h-12 w-12 rounded-xl border border-white/[0.10] bg-white/[0.06] flex items-center justify-center">
                        <BarChart3 className="h-5 w-5 text-red-400" />
                      </div>
                      <span className="text-[8px] font-black uppercase tracking-[0.28em] text-white/20 border border-white/[0.10] rounded-full px-2.5 py-1">
                        LIVE
                      </span>
                    </div>
                    <div className="mt-8">
                      <h3 className="text-[22px] font-black text-white mb-2">Command Center</h3>
                      <p className="text-[13px] text-white/38 leading-relaxed max-w-md">
                        Dashboard consolidado de todas as contas Meta Ads — investimento, CPL, pacing de orçamento,
                        alertas automáticos e KPIs operacionais em tempo real. O coração da operação.
                      </p>
                    </div>
                  </div>
                </motion.div>
              </motion.div>

              {/* Métricas */}
              <motion.div
                initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.65, delay: 0.07, ease: [0.16, 1, 0.3, 1] }}
              >
                <motion.div
                  className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 h-full min-h-[220px] overflow-hidden cursor-default"
                  whileHover={{ borderColor: "rgba(249,115,22,0.22)", boxShadow: "0 0 40px rgba(249,115,22,0.06)" }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="absolute top-0 left-6 right-6 h-px bg-orange-400 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="flex items-start justify-between mb-6">
                    <div className="h-11 w-11 rounded-xl border border-white/[0.10] bg-white/[0.05] flex items-center justify-center">
                      <Activity className="h-5 w-5 text-orange-400" />
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-[0.28em] text-white/20 border border-white/[0.10] rounded-full px-2.5 py-1">DATA</span>
                  </div>
                  <h3 className="text-[17px] font-black text-white mb-2">Métricas & KPIs</h3>
                  <p className="text-[12px] text-white/38 leading-relaxed">Análise granular com drill-down por conta, data e campanha.</p>
                </motion.div>
              </motion.div>

              {/* 4 small cards */}
              {MODULES.slice(2).map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <motion.div key={i}
                    initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.65, delay: (i + 2) * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <motion.div
                      className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 h-full min-h-[160px] overflow-hidden cursor-default"
                      whileHover={{ borderColor: `${mod.accent}38`, boxShadow: `0 0 35px ${mod.accent}0A` }}
                      transition={{ duration: 0.3 }}
                    >
                      <div className="absolute top-0 left-5 right-5 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ backgroundColor: mod.accent }} />
                      <div className="flex items-start justify-between mb-5">
                        <div className="h-10 w-10 rounded-xl border border-white/[0.10] bg-white/[0.05] flex items-center justify-center">
                          <Icon className="h-4 w-4" style={{ color: mod.accent }} />
                        </div>
                        <span className="text-[7px] font-black uppercase tracking-[0.28em] text-white/18 border border-white/[0.08] rounded-full px-2 py-0.5">{mod.tag}</span>
                      </div>
                      <h3 className="text-[15px] font-black text-white mb-1.5">{mod.label}</h3>
                      <p className="text-[12px] text-white/35 leading-relaxed">{mod.desc}</p>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ══ BRIDGE dark → light ══ */}
      <div className="relative h-[300px]"
        style={{ background: "linear-gradient(to bottom, #06060C 0%, #F2F1EE 100%)" }}>
        <SpeedLines />
        {/* center marker */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center gap-4 pointer-events-none">
          <div className="h-px flex-1 max-w-xs" style={{ background: "linear-gradient(to right,transparent,rgba(220,38,38,0.2))" }} />
          <div className="flex gap-1">
            <div className="h-1 w-1 rounded-full bg-red-600/40" />
            <div className="h-1 w-1 rounded-full bg-red-600/70" />
            <div className="h-1 w-1 rounded-full bg-red-600/40" />
          </div>
          <div className="h-px flex-1 max-w-xs" style={{ background: "linear-gradient(to left,transparent,rgba(220,38,38,0.2))" }} />
        </div>
      </div>

      {/* ══════════ LIGHT ZONE ══════════ */}
      <div ref={lightZoneRef} className="bg-[#F2F1EE]">

        {/* ── DASHBOARD SHOWCASE — full-bleed screenshot ── */}
        <section className="relative overflow-hidden border-b border-black/[0.06]">
          {/* full-bleed screenshot background */}
          <div className="relative">
            <img src="/assets/mockup-dashboard.png" alt="Command Center"
              className="w-full h-[480px] sm:h-[560px] object-cover object-top" />
            {/* overlay gradients */}
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to bottom, rgba(242,241,238,0.12) 0%, rgba(242,241,238,0.80) 65%, #F2F1EE 100%)" }} />
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to right, #F2F1EE 0%, transparent 50%)" }} />
          </div>

          {/* text overlay */}
          <div className="absolute inset-0 flex items-center">
            <div className="mx-auto max-w-7xl px-6 w-full">
              <motion.div
                initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-lg"
              >
                <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">COMMAND CENTER</span>
                <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-[#0A0A08] mb-5"
                  style={{ fontSize: "clamp(32px,4vw,52px)" }}>
                  Visão completa.<br /><span className="text-[#0A0A08]/25">Zero dispersão.</span>
                </h2>
                <p className="text-[15px] leading-relaxed text-[#0A0A08]/55 mb-8">
                  Todas as contas Meta Ads em um painel. Investimento, CPL, pacing e alertas inteligentes — em tempo real para toda a equipe.
                </p>
                <ul className="space-y-2.5">
                  {[
                    { icon: TrendingUp, text: "Sync automático com Meta Ads API" },
                    { icon: Bell,       text: "Alertas de CPL por conta e limiar" },
                    { icon: Shield,     text: "Permissões granulares por cargo" },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-[#0A0A08]/55">
                      <item.icon className="h-4 w-4 text-red-500 flex-shrink-0" />
                      {item.text}
                    </li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── VICTORIA AI — card branco com mockup ── */}
        <section className="py-28 relative overflow-hidden border-b border-black/[0.06]">
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <SpeedLines light />
          </div>
          <div className="mx-auto max-w-7xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.9 }}
              className="rounded-3xl bg-white border border-black/[0.07] shadow-[0_4px_50px_rgba(0,0,0,0.07)] overflow-hidden"
            >
              <div className="grid lg:grid-cols-2 gap-0">
                {/* text side */}
                <div className="p-10 lg:p-14 border-b lg:border-b-0 lg:border-r border-black/[0.06]">
                  <span className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-600 mb-4 block">IA · MÓDULO EXCLUSIVO</span>
                  <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5 text-[#0A0A08]"
                    style={{ fontSize: "clamp(30px,3.5vw,48px)" }}>
                    Victoria AI.<br /><span className="text-[#0A0A08]/25">Decisões precisas.</span>
                  </h2>
                  <p className="text-[15px] leading-relaxed mb-8 text-[#0A0A08]/55">
                    Treinada com a metodologia NC. Audita campanhas, identifica criativos vencedores e sugere ajustes antes que os problemas virem prejuízo.
                  </p>
                  {/* capability pills */}
                  <div className="flex flex-wrap gap-2">
                    {["Análise Automática","Tempo Real","Relatórios Sob Demanda","Otimizações Com Dados"].map((label, i) => (
                      <span key={i} className="text-[10px] font-black uppercase tracking-[0.18em] rounded-full px-3.5 py-1.5 bg-[#0A0A08]/[0.05] text-[#0A0A08]/55 border border-black/[0.07]">
                        {label}
                      </span>
                    ))}
                  </div>
                  {/* online badge */}
                  <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-600">Victoria Online</span>
                  </div>
                </div>
                {/* image side */}
                <div className="relative min-h-[320px] overflow-hidden bg-[#0A0A0A]">
                  <img src="/assets/mockup-victoria.png" alt="Victoria AI"
                    className="absolute inset-0 w-full h-full object-cover object-left-top opacity-90" />
                  <div className="absolute inset-0"
                    style={{ background: "linear-gradient(to bottom, transparent 50%, #0A0A0A 100%)" }} />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── VICTORIA MAIA — foto full-bleed com texto overlay ── */}
        <section className="relative overflow-hidden">
          <div className="relative h-[600px] sm:h-[700px]">
            <img src="/assets/victoria-maia.png" alt="Victoria Maia"
              className="absolute inset-0 w-full h-full object-cover object-top grayscale"
              style={{ objectPosition: "center 20%" }} />
            {/* overlay */}
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to right, rgba(242,241,238,0.0) 0%, rgba(242,241,238,0.0) 40%, #F2F1EE 65%)" }} />
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, #F2F1EE 0%, transparent 40%)" }} />

            {/* text overlay — right side */}
            <div className="absolute inset-0 flex items-center">
              <div className="mx-auto max-w-7xl px-6 w-full flex justify-end">
                <motion.div
                  initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-md"
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">A VISÃO POR TRÁS</span>
                  <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6 text-[#0A0A08]"
                    style={{ fontSize: "clamp(30px,3.5vw,48px)" }}>
                    Construída por<br />quem vive<br />
                    <span className="shimmer-dark">a operação.</span>
                  </h2>
                  <p className="text-[14px] leading-relaxed text-[#0A0A08]/55 mb-6">
                    Victoria Maia, fundadora da NC Agência, identificou que as ferramentas disponíveis não entregavam a velocidade que uma agência de alta performance exige. A solução foi construir a própria.
                  </p>
                  <blockquote className="border-l-2 border-red-600 pl-5 italic text-[13px] text-[#0A0A08]/65">
                    "Não entregamos dados. Entregamos o ecossistema ideal para operar no mais alto nível — com precisão cirúrgica."
                  </blockquote>
                  <div className="mt-6 flex items-center gap-3">
                    <img src="/assets/nc-logo.png" alt="NC" className="h-8 w-8 object-contain opacity-20"
                      style={{ filter: "invert(1)" }} />
                    <span className="text-[9px] font-mono uppercase tracking-[0.28em] text-[#0A0A08]/25">Victoria Maia · Fundadora & Estrategista</span>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ══ BRIDGE light → dark ══ */}
      <div className="relative h-[300px]"
        style={{ background: "linear-gradient(to bottom, #F2F1EE 0%, #06060C 100%)" }}>
        <SpeedLines />
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center gap-4 pointer-events-none">
          <div className="h-px flex-1 max-w-xs" style={{ background: "linear-gradient(to right,transparent,rgba(220,38,38,0.2))" }} />
          <div className="flex gap-1">
            <div className="h-1 w-1 rounded-full bg-red-600/40" />
            <div className="h-1 w-1 rounded-full bg-red-600/70" />
            <div className="h-1 w-1 rounded-full bg-red-600/40" />
          </div>
          <div className="h-px flex-1 max-w-xs" style={{ background: "linear-gradient(to left,transparent,rgba(220,38,38,0.2))" }} />
        </div>
      </div>

      {/* ══════════ DARK ZONE: CTA + FOOTER ══════════ */}
      <div className="bg-[#06060C]">
        <section className="relative py-44 overflow-hidden">
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-700/[0.12] blur-[170px]" />
            <SpeedLines />
            <div className="absolute inset-0 opacity-[0.10]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "180px" }} />
          </div>
          <div className="mx-auto max-w-4xl px-6 text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-6 block">ACESSO RESTRITO · SISTEMA OPERACIONAL</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.86] mb-8 text-white"
                style={{ fontSize: "clamp(48px,9vw,104px)" }}>
                Operação em<br /><span className="shimmer-text">alta velocidade.</span>
              </h2>
              <p className="text-lg mb-12 max-w-lg mx-auto text-white/40">
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

        <footer className="border-t border-white/[0.06] py-10">
          <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/assets/nc-logo.png" alt="NC" className="h-7 w-7 object-contain opacity-28" />
              <span className="text-xs font-black uppercase tracking-[0.22em] text-white/18">NC Agência</span>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-white/14">
              © {new Date().getFullYear()} NC Performance Suite · Todos os direitos reservados
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/18">Sistema Online</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
