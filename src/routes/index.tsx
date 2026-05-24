import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion, useScroll, useTransform, useMotionValue, useSpring, useInView,
} from "framer-motion";
import {
  ArrowRight, Bot, BarChart3, Zap, Activity,
  Target, Layers, TrendingUp, Shield, Bell,
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

/* ─── animated counter ──────────────────────────────────────────── */
function Counter({ to, prefix = "", suffix = "" }: { to: number; prefix?: string; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  useEffect(() => {
    if (!inView) return;
    const dur = 2000, t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(Math.floor(e * to));
      if (p < 1) requestAnimationFrame(tick);
      else setVal(to);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return <span ref={ref}>{prefix}{val.toLocaleString("pt-BR")}{suffix}</span>;
}

/* ─── animation presets ─────────────────────────────────────────── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.16, 1, 0.3, 1] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.09 } } };

/* ─── speed lines (reusable, dark or light context) ─────────────── */
function SpeedLines({ light = false }: { light?: boolean }) {
  const color = light ? "rgba(0,0,0,0.12)" : "#DC2626";
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity: light ? 0.6 : 0.03 }}>
      {[8, 20, 34, 47, 60, 73, 86].map((pct, i) => (
        <div key={i} className="absolute h-full w-px"
          style={{
            left: `${pct}%`,
            background: `linear-gradient(to bottom,transparent 0%,${color} 35%,${color} 65%,transparent 100%)`,
            transform: "skewX(-17deg)",
            opacity: 0.22 + i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

/* ─── data ──────────────────────────────────────────────────────── */
const TICKER = [
  "META ADS", "BI EM TEMPO REAL", "GESTÃO DE TRÁFEGO", "AUTOMAÇÃO DE ALERTAS",
  "VICTORIA AI", "CPL TRACKING", "BUDGET PACING", "RELATÓRIOS ESTRATÉGICOS",
  "PERFORMANCE AUTOMOTIVA", "NC AGÊNCIA",
];

const MODULES = [
  { icon: BarChart3, label: "Command Center",  desc: "Dashboard consolidado de investimento, CPL e KPIs de todas as contas em tempo real.",     tag: "LIVE", accent: "#EF4444" },
  { icon: Activity,  label: "Métricas & KPIs", desc: "Análise granular com drill-down por conta, período, campanha e criativo.",                  tag: "DATA", accent: "#F97316" },
  { icon: Target,    label: "Gestão de Ads",   desc: "Controle total de campanhas — status, criativos, pacing e frequência real do Meta Ads.",    tag: "OPS",  accent: "#A855F7" },
  { icon: Bot,       label: "Victoria AI",     desc: "IA estratégica que audita contas, identifica padrões e gera insights acionáveis.",          tag: "AI",   accent: "#06B6D4" },
  { icon: Zap,       label: "Automações",      desc: "Regras inteligentes de alerta por CPL, frequência, budget e anomalias de entrega.",         tag: "AUTO", accent: "#EAB308" },
  { icon: Layers,    label: "Criativos",       desc: "Banco de criativos com score de fadiga, ranking de performance e diagnóstico de uso.",      tag: "LAB",  accent: "#EC4899" },
];

/* ─── main component ────────────────────────────────────────────── */
function LandingPage() {
  /* light zone detection via IntersectionObserver — zero scroll math */
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

  /* mouse parallax for dashboard mockup */
  const mx = useMotionValue(0), my = useMotionValue(0);
  const rX = useSpring(useTransform(my, [-500, 500], [4, -4]), { stiffness: 80, damping: 28 });
  const rY = useSpring(useTransform(mx, [-700, 700], [-5, 5]), { stiffness: 80, damping: 28 });
  const { scrollYProgress } = useScroll();
  const heroOp = useTransform(scrollYProgress, [0, 0.14], [1, 0]);
  const heroY  = useTransform(scrollYProgress, [0, 0.14], [0, 60]);

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
        @keyframes flt   { 0%,100%{transform:translateY(0)}50%{transform:translateY(-11px)} }
        @keyframes scp   { 0%,100%{opacity:0}50%{opacity:1} }
        .marquee  { animation: mq 34s linear infinite; }
        .shimmer-text {
          background: linear-gradient(90deg,#fff 20%,#ef4444 40%,#fff 60%,#ef4444 80%,#fff);
          background-size: 200% auto;
          -webkit-background-clip:text; -webkit-text-fill-color:transparent;
          animation: shimx 5s linear infinite;
        }
        .float { animation: flt 7s ease-in-out infinite; }
        .scan::after {
          content:''; position:absolute; inset-x:0; height:2px;
          background:linear-gradient(90deg,transparent,rgba(220,38,38,0.22),transparent);
          animation: scp 3s ease-in-out infinite;
        }
      `}</style>

      {/* ══ NAVBAR — adapts between dark/light zone ══ */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled
          ? navLight
            ? "backdrop-blur-2xl border-b border-black/[0.07] py-3 bg-[#F2F1EE]/92"
            : "backdrop-blur-2xl border-b border-white/[0.06] py-3 bg-[#06060C]/92"
          : "bg-transparent py-5"
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img
              src="/assets/nc-logo.png" alt="NC"
              className="h-9 w-9 object-contain transition-all duration-500"
              style={{ filter: navLight ? "invert(1)" : "none" }}
            />
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
            className={`group inline-flex items-center gap-2 rounded-full border px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] transition-all hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-[0_0_28px_rgba(220,38,38,0.35)] ${
              navLight
                ? "border-red-500/40 text-red-600 bg-red-500/[0.07]"
                : "border-red-500/30 text-red-400 bg-red-600/10"
            }`}>
            Acessar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </header>

      {/* ══════════════════ DARK ZONE ══════════════════ */}
      <div className="bg-[#06060C]">

        {/* HERO */}
        <section
          className="relative flex min-h-screen flex-col items-center justify-center pt-28 pb-0 overflow-hidden"
          onMouseMove={onMM} onMouseLeave={onML}
        >
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute left-1/2 top-[37%] -translate-x-1/2 -translate-y-1/2 h-[800px] w-[1000px] rounded-full bg-red-600/[0.10] blur-[180px]" />
            <div className="absolute left-[12%] top-[68%] h-[350px] w-[350px] rounded-full bg-red-900/[0.06] blur-[120px]" />
            <SpeedLines />
            <div className="absolute inset-0 opacity-[0.12]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "180px" }} />
            <div className="absolute bottom-0 inset-x-0 h-72 bg-gradient-to-t from-[#06060C] to-transparent" />
          </div>

          <motion.div style={{ opacity: heroOp, y: heroY }}
            className="relative z-10 w-full max-w-6xl mx-auto px-6 text-center">

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-red-500/[0.18] bg-black/50 px-5 py-2 text-[9px] font-black uppercase tracking-[0.28em] text-red-400/80 backdrop-blur-xl"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-60" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Tecnologia proprietária · NC Agência · Automotivo
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 60 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.10, ease: [0.16, 1, 0.3, 1] }}
              className="font-black leading-[0.86] tracking-[-0.04em] text-white"
              style={{ fontSize: "clamp(44px,8.5vw,100px)" }}
            >
              Dados que dirigem.<br />
              <span className="shimmer-text">Decisões que aceleram.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className="mx-auto mt-7 max-w-2xl text-base sm:text-lg font-medium leading-relaxed text-white/45"
            >
              NC Performance Suite — plataforma proprietária de BI e IA desenvolvida para centralizar operação,
              tráfego pago e inteligência de dados com a velocidade que o mercado automotivo exige.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.42 }}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <button
                onClick={() => document.getElementById("suite")?.scrollIntoView({ behavior: "smooth" })}
                className="group w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full bg-red-600 px-9 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_50px_rgba(220,38,38,0.5)] active:scale-[0.97]"
              >
                Explorar a Suite
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <Link to="/login"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-9 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white/50 transition-all hover:border-white/20 hover:text-white hover:bg-white/[0.08] active:scale-[0.97]"
              >
                Acesso Restrito
              </Link>
            </motion.div>
          </motion.div>

          {/* 3D Dashboard mockup */}
          <motion.div
            initial={{ opacity: 0, y: 110, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative z-20 mt-16 w-full max-w-[1180px] px-4 sm:px-6 float"
            style={{ perspective: "2200px" }}
          >
            <motion.div style={{ rotateX: rX, rotateY: rY }}>
              <div className="absolute -inset-2 rounded-2xl bg-red-600/[0.06] blur-[50px]" />
              <div
                className="relative rounded-[18px] overflow-hidden border border-white/[0.09]"
                style={{ backgroundColor: "#0C0C12", boxShadow: "0 60px 120px rgba(0,0,0,0.80), 0 0 0 1px rgba(255,255,255,0.04)" }}
              >
                {/* browser title bar */}
                <div className="flex items-center gap-2 px-4 py-3 border-b border-white/[0.05] bg-black/40">
                  <div className="flex gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 mx-6">
                    <div className="mx-auto max-w-xs h-5 rounded bg-white/[0.05] border border-white/[0.05] flex items-center justify-center px-3">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 mr-2" />
                      <span className="text-[9px] font-mono text-white/20">app.ncperformance.com.br</span>
                    </div>
                  </div>
                </div>
                <div className="scan relative">
                  <img
                    src="/assets/mockup-dashboard.png"
                    alt="NC Performance Suite Dashboard"
                    className="w-full h-auto object-cover object-top"
                  />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(to bottom, transparent 50%, #06060C 100%)" }} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* TICKER */}
        <div className="border-y border-white/[0.06] py-3.5 overflow-hidden select-none bg-black/25 backdrop-blur-sm">
          <div className="flex marquee whitespace-nowrap gap-14">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span key={i} className="inline-flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.32em] text-white/20">
                <span className="h-1 w-1 rounded-full bg-red-600 flex-shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* STATS */}
        <section className="py-24">
          <div className="mx-auto max-w-5xl px-6">
            <motion.div
              variants={stagger} initial="hidden" whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y divide-white/[0.06] border border-white/[0.07] rounded-3xl overflow-hidden"
            >
              {[
                { to: 61,    pre: "R$", suf: "M+", label: "em mídia gerenciada" },
                { to: 25048, pre: "",   suf: "+",  label: "leads gerados"       },
                { to: 150,   pre: "",   suf: "+",  label: "campanhas ativas"    },
                { to: 99,    pre: "",   suf: ".9%",label: "disponibilidade"     },
              ].map((s, i) => (
                <motion.div key={i} variants={fadeUp}
                  className="p-8 text-center bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
                  <div className="text-3xl sm:text-[40px] font-black tracking-tight text-white mb-2">
                    <Counter to={s.to} prefix={s.pre} suffix={s.suf} />
                  </div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-white/25">{s.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* SUITE MODULES */}
        <section id="suite" className="pb-28 pt-4">
          <div className="mx-auto max-w-7xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="mb-16"
            >
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">NC PERFORMANCE SUITE</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.88] text-white" style={{ fontSize: "clamp(36px,5.5vw,64px)" }}>
                Seis instrumentos.<br />
                <span className="text-white/25">Uma operação.</span>
              </h2>
            </motion.div>

            <motion.div
              variants={stagger} initial="hidden" whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {MODULES.map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <motion.div key={i} variants={fadeUp}>
                    <motion.div
                      className="group relative rounded-2xl border border-white/[0.08] bg-white/[0.03] p-7 h-full overflow-hidden cursor-default"
                      whileHover={{ y: -6, borderColor: "rgba(220,38,38,0.22)", backgroundColor: "rgba(255,255,255,0.045)", boxShadow: "0 0 40px rgba(220,38,38,0.07)" }}
                      transition={{ type: "spring", damping: 22, stiffness: 280 }}
                    >
                      {/* accent top line — appears on hover */}
                      <div
                        className="absolute top-0 left-6 right-6 h-[1.5px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                        style={{ backgroundColor: mod.accent }}
                      />
                      <div className="flex items-start justify-between mb-6">
                        <div className="h-11 w-11 rounded-xl border border-white/[0.10] bg-white/[0.05] flex items-center justify-center">
                          <Icon className="h-5 w-5" style={{ color: mod.accent }} />
                        </div>
                        <span className="text-[8px] font-black uppercase tracking-[0.28em] text-white/20 border border-white/[0.10] rounded-full px-2.5 py-1 bg-white/[0.03]">
                          {mod.tag}
                        </span>
                      </div>
                      <h3 className="text-[18px] font-black mb-2 text-white">{mod.label}</h3>
                      <p className="text-[13px] text-white/40 leading-relaxed">{mod.desc}</p>
                    </motion.div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </section>
      </div>

      {/* ══ BRIDGE: dark → light (the visible transition moment) ══ */}
      <div className="relative h-[320px] w-full overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #06060C 0%, #F2F1EE 100%)" }}>
        <SpeedLines />
      </div>

      {/* ══════════════════ LIGHT ZONE ══════════════════ */}
      <div ref={lightZoneRef} className="bg-[#F2F1EE]">

        {/* DASHBOARD SHOWCASE */}
        <section className="py-28 relative overflow-hidden border-b border-black/[0.06]">
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-red-500/[0.04] blur-[160px]" />
            <SpeedLines light />
          </div>
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">COMMAND CENTER</span>
                <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6 text-[#0A0A08]" style={{ fontSize: "clamp(34px,4.5vw,56px)" }}>
                  Visão completa.<br />
                  <span className="text-[#0A0A08]/25">Zero dispersão.</span>
                </h2>
                <p className="text-base leading-relaxed mb-10 text-[#0A0A08]/55">
                  Todas as contas Meta Ads consolidadas em um painel. Investimento, CPL, pacing de orçamento
                  e alertas inteligentes — disponíveis instantaneamente para toda a equipe.
                </p>
                <motion.ul variants={stagger} initial="hidden" whileInView="show" viewport={{ once: true }}
                  className="space-y-3">
                  {[
                    { icon: TrendingUp, text: "Sincronização automática com Meta Ads API" },
                    { icon: Bell,       text: "Alertas de CPL fora do limiar configurado" },
                    { icon: Activity,   text: "Budget pacing em tempo real com indicadores visuais" },
                    { icon: Shield,     text: "Sistema de permissões por cargo e hierarquia" },
                  ].map((item, i) => (
                    <motion.li key={i} variants={fadeUp} className="flex items-center gap-3 text-sm text-[#0A0A08]/55">
                      <div className="h-7 w-7 rounded-lg border border-red-500/[0.20] bg-red-500/[0.08] flex items-center justify-center flex-shrink-0">
                        <item.icon className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      {item.text}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 40, scale: 0.97 }} whileInView={{ opacity: 1, x: 0, scale: 1 }}
                viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="absolute -inset-4 bg-red-500/[0.05] rounded-3xl blur-[50px]" />
                <div className="relative rounded-2xl overflow-hidden border border-black/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.10)]">
                  <img src="/assets/mockup-dashboard.png" alt="Command Center" className="w-full h-auto" />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(to top, #F2F1EE 0%, transparent 45%)" }} />
                  {/* floating stat */}
                  <div className="absolute top-4 right-4 rounded-xl bg-white/85 backdrop-blur-md border border-black/[0.07] shadow-md px-3 py-2">
                    <div className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] text-green-600 mb-0.5">Budget pacing</div>
                    <div className="text-base font-black text-[#0A0A08]">55% <span className="text-xs font-normal text-[#0A0A08]/40">do dia</span></div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* VICTORIA AI */}
        <section className="py-28 relative overflow-hidden border-b border-black/[0.06]">
          <div className="mx-auto max-w-7xl px-6">
            <div className="rounded-3xl border border-black/[0.07] bg-white overflow-hidden shadow-[0_4px_40px_rgba(0,0,0,0.06)]">
              <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/20 to-transparent" />
              <div className="grid lg:grid-cols-5">
                <div className="lg:col-span-3 p-10 lg:p-14">
                  <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.9 }}>
                    <span className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-600 mb-4 block">INTELIGÊNCIA ARTIFICIAL · MÓDULO EXCLUSIVO</span>
                    <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5 text-[#0A0A08]" style={{ fontSize: "clamp(34px,4.5vw,56px)" }}>
                      Victoria AI.<br />
                      <span className="text-[#0A0A08]/25">Decisões precisas.</span>
                    </h2>
                    <p className="text-base leading-relaxed mb-8 max-w-lg text-[#0A0A08]/55">
                      Treinada com a metodologia NC. Audita campanhas, identifica criativos vencedores,
                      alerta sobre anomalias e sugere ajustes estratégicos antes que problemas virem prejuízo.
                    </p>
                    <div className="border border-black/[0.07] rounded-2xl overflow-hidden">
                      {[
                        { label: "Análise de Performance",  val: "Automática"  },
                        { label: "Detecção de Anomalias",   val: "Tempo Real"  },
                        { label: "Relatórios Estratégicos", val: "Sob Demanda" },
                        { label: "Otimizações Sugeridas",   val: "Com Dados"   },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b last:border-0 border-black/[0.05] hover:bg-black/[0.01] transition-colors">
                          <span className="text-sm font-medium text-[#0A0A08]/55">{item.label}</span>
                          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600 border border-emerald-500/25 rounded-full px-2.5 py-0.5 bg-emerald-500/[0.07]">
                            {item.val}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </div>
                <div className="lg:col-span-2 relative min-h-[300px] overflow-hidden border-t lg:border-t-0 lg:border-l border-black/[0.06]">
                  <img src="/assets/mockup-victoria.png" alt="Victoria AI"
                    className="absolute inset-0 w-full h-full object-cover object-left-top" />
                  <div className="absolute inset-0 hidden lg:block"
                    style={{ background: "linear-gradient(to right, white 0%, transparent 40%)" }} />
                  <div className="absolute bottom-0 inset-x-0 h-1/2"
                    style={{ background: "linear-gradient(to top, white, transparent)" }} />
                  <div className="absolute top-5 right-5 flex items-center gap-2 rounded-full bg-white/80 backdrop-blur-md border border-black/[0.08] shadow-sm px-3.5 py-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-600">Victoria Online</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* VICTORIA MAIA */}
        <section className="py-28 relative overflow-hidden">
          <div className="mx-auto max-w-7xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-80px" }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
                className="relative order-2 lg:order-1"
              >
                <div className="absolute inset-4 bg-red-500/[0.06] blur-[80px] rounded-full" />
                <div className="relative group rounded-3xl overflow-hidden border border-black/[0.08] shadow-[0_20px_60px_rgba(0,0,0,0.13)]">
                  <img src="/assets/victoria-maia.png" alt="Victoria Maia"
                    className="w-full aspect-[4/5] object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-[1.2s]" />
                  <div className="absolute inset-0 pointer-events-none"
                    style={{ background: "linear-gradient(to top, #111 0%, rgba(17,17,17,0.15) 35%, transparent 60%)" }} />
                  <div className="absolute bottom-0 inset-x-0 p-7">
                    <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-1">Fundadora & Estrategista Chefe</p>
                    <p className="font-black text-2xl text-white">Victoria Maia</p>
                    <p className="text-sm text-white/50 mt-1">NC Agência · Rio de Janeiro</p>
                  </div>
                  <div className="absolute top-5 left-5 rounded-xl bg-black/55 backdrop-blur-md border border-white/[0.10] px-3 py-1.5">
                    <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/55">Agência de Elite</span>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 40 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.9 }}
                className="order-1 lg:order-2"
              >
                <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">A VISÃO POR TRÁS DA TECNOLOGIA</span>
                <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6 text-[#0A0A08]" style={{ fontSize: "clamp(34px,4.5vw,56px)" }}>
                  Construída por quem<br />
                  <span className="text-[#0A0A08]/25">vive a operação.</span>
                </h2>
                <div className="space-y-5 text-[15px] leading-relaxed text-[#0A0A08]/55">
                  <p>A NC Performance Suite não surgiu de uma sala de produto — surgiu da necessidade real de quem gerencia múltiplas contas, múltiplos clientes e múltiplos criativos ao mesmo tempo.</p>
                  <p>Victoria Maia, fundadora da NC Agência, identificou que as ferramentas disponíveis no mercado não entregavam a velocidade e a profundidade que uma agência de alta performance exige. A solução foi construir a própria.</p>
                  <blockquote className="relative border-l-2 border-red-600 pl-6 py-1 italic text-[#0A0A08]/70">
                    <span className="absolute left-3 top-0 text-red-600 text-2xl font-black leading-none select-none">"</span>
                    Não entregamos apenas dados. Entregamos o ecossistema ideal para que nossa equipe opere no mais alto nível de performance — com precisão cirúrgica e velocidade de corrida.
                  </blockquote>
                </div>
                <div className="mt-10 flex items-center gap-4">
                  <img src="/assets/nc-logo.png" alt="NC" className="h-10 w-10 object-contain opacity-20"
                    style={{ filter: "invert(1)" }} />
                  <div className="h-px bg-black/[0.08] flex-1" />
                  <span className="text-[9px] font-mono font-bold uppercase tracking-[0.28em] text-[#0A0A08]/25">Rio de Janeiro · Brasil</span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </div>

      {/* ══ BRIDGE: light → dark ══ */}
      <div className="relative h-[320px] w-full overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #F2F1EE 0%, #06060C 100%)" }}>
        <SpeedLines />
      </div>

      {/* ══════════════════ DARK ZONE: CTA + FOOTER ══════════════════ */}
      <div className="bg-[#06060C]">
        <section className="relative py-44 overflow-hidden">
          <div className="absolute inset-0 -z-10 pointer-events-none">
            <div className="absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-700/[0.12] blur-[170px]" />
            <SpeedLines />
            <div className="absolute inset-0 opacity-[0.11]"
              style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")", backgroundSize: "180px" }} />
          </div>
          <div className="mx-auto max-w-4xl px-6 text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-6 block">ACESSO INTERNO · SISTEMA OPERACIONAL</span>
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
              <img src="/assets/nc-logo.png" alt="NC" className="h-7 w-7 object-contain opacity-30" />
              <span className="text-xs font-black uppercase tracking-[0.22em] text-white/20">NC Agência</span>
            </div>
            <span className="text-[9px] font-mono uppercase tracking-[0.22em] text-white/15">
              © {new Date().getFullYear()} NC Performance Suite · Todos os direitos reservados
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/20">Sistema Online</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
