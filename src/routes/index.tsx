import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform, useInView, useMotionValue, useSpring } from "framer-motion";
import {
  ArrowRight, Bot, BarChart3, Zap, Activity,
  Target, Layers, TrendingUp, Shield, Bell,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — O Sistema Operacional da NC Agência" },
      {
        name: "description",
        content:
          "Plataforma proprietária de BI e IA da NC Agência para gestão de tráfego pago de alta performance.",
      },
    ],
  }),
  component: LandingPage,
});

function Counter({
  to,
  prefix = "",
  suffix = "",
}: {
  to: number;
  prefix?: string;
  suffix?: string;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  useEffect(() => {
    if (!inView) return;
    const dur = 1600,
      t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / dur, 1);
      setVal(Math.floor((1 - Math.pow(1 - p, 3)) * to));
      if (p < 1) requestAnimationFrame(tick);
      else setVal(to);
    };
    requestAnimationFrame(tick);
  }, [inView, to]);
  return (
    <span ref={ref}>
      {prefix}
      {val.toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] },
  },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

const TICKER = [
  "META ADS",
  "BI EM TEMPO REAL",
  "GESTÃO DE TRÁFEGO",
  "AUTOMAÇÃO DE ALERTAS",
  "VICTORIA AI",
  "CPL TRACKING",
  "BUDGET PACING",
  "PERFORMANCE AUTOMOTIVA",
  "NC AGÊNCIA",
];

const MODULES = [
  {
    icon: BarChart3,
    label: "Command Center",
    desc: "Dashboard consolidado. Todas as contas Meta Ads, KPIs e pacing em tempo real.",
    tag: "LIVE",
    accent: "#EF4444",
  },
  {
    icon: Activity,
    label: "Métricas & KPIs",
    desc: "Análise granular com drill-down por conta, período e campanha.",
    tag: "DATA",
    accent: "#F97316",
  },
  {
    icon: Target,
    label: "Gestão de Ads",
    desc: "Controle de campanhas, criativos, pacing e frequência real no Meta.",
    tag: "OPS",
    accent: "#A855F7",
  },
  {
    icon: Bot,
    label: "Victoria AI",
    desc: "IA treinada com metodologia NC. Audita contas e gera insights acionáveis.",
    tag: "AI",
    accent: "#06B6D4",
  },
  {
    icon: Zap,
    label: "Automações",
    desc: "Alertas por CPL, frequência, budget e anomalias de entrega.",
    tag: "AUTO",
    accent: "#EAB308",
  },
  {
    icon: Layers,
    label: "Criativos",
    desc: "Score de fadiga, ranking de performance e diagnóstico por campanha.",
    tag: "LAB",
    accent: "#EC4899",
  },
];

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
    const fn = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const { scrollY } = useScroll();
  const screenshotParallax = useTransform(scrollY, [0, 800], [0, 60]);

  // mouse parallax tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotateX = useSpring(useTransform(my, [-300, 300], [6, -6]), { stiffness: 60, damping: 22 });
  const rotateY = useSpring(useTransform(mx, [-500, 500], [-7, 7]), { stiffness: 60, damping: 22 });

  const heroRef = useRef<HTMLElement>(null);
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = heroRef.current?.getBoundingClientRect();
    if (!r) return;
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top  - r.height / 2);
  }, [mx, my]);
  const onMouseLeave = useCallback(() => { mx.set(0); my.set(0); }, [mx, my]);

  return (
    <div className="relative overflow-x-hidden">
      <style>{`
        @keyframes marquee { to { transform: translateX(-50%); } }
        @keyframes shimx   { 0%{background-position:-200% center}100%{background-position:200% center} }
        @keyframes scanpulse { 0%,100%{opacity:0}50%{opacity:1} }
        @keyframes floatY  { 0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)} }
        @keyframes glowPulse { 0%,100%{opacity:0.55}50%{opacity:1} }
        .float-screen { animation: floatY 6s ease-in-out infinite; }

        .ticker-wrap  { animation: marquee 36s linear infinite; }

        .shimmer-text {
          background: linear-gradient(90deg,#fff 20%,#ef4444 40%,#fff 60%,#ef4444 80%,#fff);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimx 4.5s linear infinite;
        }
        .shimmer-dark {
          background: linear-gradient(90deg,#111 20%,#DC2626 40%,#111 60%,#DC2626 80%,#111);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimx 4.5s linear infinite;
        }

        .screen-glow {
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.06),
            0 30px 80px rgba(0,0,0,0.70),
            0 0 80px rgba(220,38,38,0.08),
            0 0 160px rgba(139,92,246,0.05);
        }

        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 28px 28px;
        }

        .scan-line::before {
          content: '';
          position: absolute;
          inset-x: 0;
          top: 0;
          height: 1px;
          background: linear-gradient(90deg, transparent, rgba(239,68,68,0.5), transparent);
          animation: scanpulse 3.5s ease-in-out infinite;
        }

        .card-hover:hover .card-line { opacity: 1; }
        .card-line { opacity: 0; transition: opacity 0.35s; }
      `}</style>

      {/* ── NAVBAR ── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? navLight
              ? "bg-white/95 backdrop-blur-2xl border-b border-black/[0.08] py-2.5 shadow-sm"
              : "bg-[#06060C]/95 backdrop-blur-2xl border-b border-white/[0.05] py-2.5"
            : "bg-transparent py-4"
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img
              src="/assets/nc-logo.png"
              alt="NC"
              className="h-9 w-9 object-contain"
              style={{ filter: navLight ? "none" : "none" }}
            />
            <div className="leading-none">
              <div
                className={`font-black text-[14px] tracking-tight uppercase transition-colors duration-500 ${navLight ? "text-[#0A0A08]" : "text-white"}`}
              >
                NC Performance
              </div>
              <div className="text-[7px] font-mono font-bold uppercase tracking-[0.35em] text-red-500 mt-0.5">
                Suite
              </div>
            </div>
          </div>
          <Link
            to="/login"
            className={`group inline-flex items-center gap-2 rounded-full border px-5 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all hover:bg-red-600 hover:border-red-600 hover:text-white ${
              navLight
                ? "border-red-500/40 text-red-600"
                : "border-red-500/25 text-red-400"
            }`}
          >
            Acessar{" "}
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* ════════════════════════════════════
          ZONA ESCURA
      ════════════════════════════════════ */}
      <div className="bg-[#06060C] dot-grid">

        {/* ── HERO ── */}
        <section ref={heroRef} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}
          className="relative pt-28 pb-0 overflow-hidden min-h-screen flex flex-col">
          {/* radial glows */}
          <div className="absolute inset-0 pointer-events-none -z-10">
            <div
              className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 900,
                height: 600,
                background:
                  "radial-gradient(ellipse at center, rgba(220,38,38,0.10) 0%, transparent 70%)",
              }}
            />
            <div
              className="absolute right-[15%] top-[20%] rounded-full"
              style={{
                width: 300,
                height: 300,
                background:
                  "radial-gradient(ellipse at center, rgba(139,92,246,0.07) 0%, transparent 70%)",
              }}
            />
          </div>

          {/* hero text — centered */}
          <div className="relative mx-auto max-w-4xl px-6 text-center z-10">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-white/[0.09] bg-white/[0.03] px-4 py-1.5 text-[8.5px] font-black uppercase tracking-[0.32em] text-white/35"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              Tecnologia proprietária · NC Agência
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 36 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1.0, delay: 0.07, ease: [0.16, 1, 0.3, 1] }}
              className="font-black leading-[0.87] tracking-[-0.045em] text-white"
              style={{ fontSize: "clamp(48px, 7.5vw, 96px)" }}
            >
              O sistema operacional<br />
              <span className="shimmer-text">da alta performance.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="mt-6 text-[16px] sm:text-[18px] text-zinc-400 max-w-xl mx-auto leading-relaxed"
            >
              BI proprietário + IA + automações. Tudo em um painel —
              construído para quem opera no mais alto nível do tráfego pago.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.32 }}
              className="mt-10 flex items-center justify-center gap-4 flex-wrap"
            >
              <button
                onClick={() =>
                  document
                    .getElementById("suite")
                    ?.scrollIntoView({ behavior: "smooth" })
                }
                className="group inline-flex items-center gap-2 rounded-full bg-red-600 px-8 py-3.5 text-[10.5px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_48px_rgba(220,38,38,0.50)] active:scale-[0.97]"
              >
                Explorar Suite{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                to="/login"
                className="text-[10.5px] font-black uppercase tracking-[0.2em] text-white/28 hover:text-white/55 transition-colors"
              >
                Acesso Restrito →
              </Link>
            </motion.div>
          </div>

          {/* dashboard screenshot — produto como herói */}
          <motion.div
            initial={{ opacity: 0, y: 56, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 1.5, delay: 0.50, ease: [0.16, 1, 0.3, 1] }}
            style={{ y: screenshotParallax, perspective: 1800 }}
            className="relative mt-16 mx-auto w-full max-w-6xl px-4 sm:px-8 lg:px-12 flex-1"
          >
            {/* glow pulsante */}
            <div
              className="absolute -inset-8 rounded-3xl pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center 30%, rgba(220,38,38,0.11) 0%, transparent 60%)",
                animation: "glowPulse 3.5s ease-in-out infinite",
              }}
            />
            <div
              className="absolute -inset-4 rounded-2xl pointer-events-none"
              style={{
                background: "radial-gradient(ellipse at center, rgba(139,92,246,0.05) 0%, transparent 70%)",
                animation: "glowPulse 5s ease-in-out infinite reverse",
              }}
            />

            {/* tilt 3D + float */}
            <motion.div
              className="float-screen"
              style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
            >
              {/* browser frame */}
              <div className="relative rounded-[14px] overflow-hidden screen-glow border border-white/[0.10]">
                {/* title bar */}
                <div className="flex items-center gap-2 h-9 px-4 bg-[#0E0E14] border-b border-white/[0.06]">
                  <div className="flex gap-1.5 flex-shrink-0">
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
                    <div className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
                  </div>
                  <div className="flex-1 flex justify-center">
                    <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.05] rounded-md px-3 py-0.5">
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                      <span className="text-[8.5px] font-mono text-white/18">
                        app.ncperformance.com.br
                      </span>
                    </div>
                  </div>
                </div>

                {/* screenshot */}
                <div className="scan-line relative bg-[#0A0A0E]">
                  <img
                    src="/assets/mockup-reports.png"
                    alt="NC Performance Suite — Command Center"
                    className="w-full h-auto block"
                  />
                  {/* bottom fade */}
                  <div
                    className="absolute bottom-0 inset-x-0 h-48 pointer-events-none"
                    style={{ background: "linear-gradient(to top, #06060C 0%, transparent 100%)" }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* ── TICKER ── */}
        <div className="border-y border-white/[0.05] py-2.5 overflow-hidden select-none">
          <div className="ticker-wrap flex whitespace-nowrap gap-12">
            {[...TICKER, ...TICKER].map((item, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.3em] text-white/16"
              >
                <span className="h-[3px] w-3 rounded-full bg-red-600 flex-shrink-0" />
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── STATS ── */}
        <section className="py-16">
          <div className="mx-auto max-w-5xl px-6">
            <motion.div
              variants={stagger}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-50px" }}
              className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/[0.06]"
            >
              {[
                { to: 61, pre: "R$", suf: "M+", label: "investimento gerenciado" },
                { to: 25048, pre: "", suf: "+", label: "leads gerados" },
                { to: 150, pre: "", suf: "+", label: "campanhas ativas" },
                { to: 99, pre: "", suf: ".9%", label: "disponibilidade" },
              ].map((s, i) => (
                <motion.div
                  key={i}
                  variants={fadeUp}
                  className="px-8 py-10 first:pl-0 last:border-r-0"
                >
                  <div
                    className="font-black tracking-tight leading-none text-white mb-2"
                    style={{ fontSize: "clamp(36px, 5vw, 62px)" }}
                  >
                    <Counter to={s.to} prefix={s.pre} suffix={s.suf} />
                  </div>
                  <div className="text-[8.5px] font-mono uppercase tracking-[0.26em] text-white/22 mt-1">
                    {s.label}
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ── MÓDULOS ── */}
        <section id="suite" className="pb-24 pt-4">
          <div className="mx-auto max-w-6xl px-6">
            <div className="mb-14">
              <span className="text-[8.5px] font-black uppercase tracking-[0.34em] text-red-500 mb-3 block">
                A SUITE
              </span>
              <h2
                className="font-black tracking-[-0.04em] leading-[0.88] text-white"
                style={{ fontSize: "clamp(34px, 4.5vw, 60px)" }}
              >
                Seis módulos.
                <br />
                <span className="text-white/18">Uma operação completa.</span>
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {MODULES.map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 18 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{
                      duration: 0.6,
                      delay: i * 0.06,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <motion.div
                      className="card-hover group relative rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6 h-full overflow-hidden cursor-default"
                      whileHover={{
                        borderColor: `${mod.accent}28`,
                        backgroundColor: "rgba(255,255,255,0.035)",
                      }}
                      transition={{ duration: 0.25 }}
                    >
                      {/* top accent line */}
                      <div
                        className="card-line absolute top-0 inset-x-0 h-px"
                        style={{
                          background: `linear-gradient(90deg, transparent, ${mod.accent}90, transparent)`,
                        }}
                      />
                      {/* glow blob */}
                      <div
                        className="absolute -top-4 -right-4 h-28 w-28 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-2xl pointer-events-none"
                        style={{ backgroundColor: `${mod.accent}18` }}
                      />

                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-6">
                          <div
                            className="h-10 w-10 rounded-xl flex items-center justify-center"
                            style={{
                              backgroundColor: `${mod.accent}10`,
                              border: `1px solid ${mod.accent}20`,
                            }}
                          >
                            <Icon
                              className="h-[18px] w-[18px]"
                              style={{ color: mod.accent }}
                            />
                          </div>
                          <span className="text-[7px] font-black uppercase tracking-[0.3em] text-white/18 border border-white/[0.08] rounded-full px-2 py-0.5">
                            {mod.tag}
                          </span>
                        </div>
                        <h3 className="text-[15.5px] font-black text-white mb-2">
                          {mod.label}
                        </h3>
                        <p className="text-[12px] text-white/50 leading-relaxed">
                          {mod.desc}
                        </p>
                      </div>
                    </motion.div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* ════════ BRIDGE dark → light ════════ */}
      <div
        className="relative h-[260px] overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #06060C 0%, #EEEDE7 100%)" }}
      >
        {/* diagonal speed lines */}
        {[8, 22, 38, 52, 65, 79, 92].map((p, i) => (
          <div
            key={i}
            className="absolute h-full w-px pointer-events-none"
            style={{
              left: `${p}%`,
              background:
                "linear-gradient(to bottom, transparent, rgba(220,38,38,0.14), transparent)",
              transform: "skewX(-20deg)",
              opacity: 0.3 + i * 0.05,
            }}
          />
        ))}
        {/* center dot marker */}
        <div className="absolute inset-x-0 bottom-8 flex items-center justify-center gap-2 pointer-events-none">
          <div className="h-px w-24" style={{ background: "linear-gradient(to right, transparent, rgba(220,38,38,0.25))" }} />
          <div className="flex gap-1">
            <div className="h-1 w-1 rounded-full bg-red-600/35" />
            <div className="h-1 w-4 rounded-full bg-red-600/55" />
            <div className="h-1 w-1 rounded-full bg-red-600/35" />
          </div>
          <div className="h-px w-24" style={{ background: "linear-gradient(to left, transparent, rgba(220,38,38,0.25))" }} />
        </div>
      </div>

      {/* ════════════════════════════════════
          ZONA CLARA
      ════════════════════════════════════ */}
      <div ref={lightZoneRef} className="bg-[#EEEDE7]">

        {/* ── FEATURE: Command Center ── */}
        <section className="pt-20 pb-20 border-b border-black/[0.07]">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              >
                <span className="text-[8.5px] font-black uppercase tracking-[0.34em] text-red-500 mb-4 block">
                  COMMAND CENTER
                </span>
                <h2
                  className="font-black tracking-[-0.04em] leading-[0.88] text-[#0A0A08] mb-5"
                  style={{ fontSize: "clamp(30px, 3.8vw, 50px)" }}
                >
                  Tudo que importa.
                  <br />
                  <span className="text-[#0A0A08]/20">Em um lugar.</span>
                </h2>
                <p className="text-[15px] leading-relaxed text-[#0A0A08]/70 mb-8">
                  Todas as contas Meta Ads consolidadas. Investimento, CPL,
                  pacing de orçamento, alertas inteligentes e KPIs operacionais
                  — visibilidade total para toda a equipe, em tempo real.
                </p>
                <ul className="space-y-3">
                  {[
                    { icon: TrendingUp, text: "Sync automático com Meta Ads API" },
                    { icon: Bell, text: "Alertas de CPL por conta e limiar" },
                    { icon: Shield, text: "Permissões granulares por cargo" },
                  ].map((item, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-3 text-[13px] text-[#0A0A08]/50"
                    >
                      <div className="h-7 w-7 rounded-lg bg-red-500/[0.09] flex items-center justify-center flex-shrink-0">
                        <item.icon className="h-3.5 w-3.5 text-red-500" />
                      </div>
                      {item.text}
                    </li>
                  ))}
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                className="relative"
              >
                <div className="absolute -inset-4 rounded-3xl bg-black/[0.04] blur-[40px]" />
                <div
                  className="relative rounded-2xl overflow-hidden border border-black/[0.10]"
                  style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.10)" }}
                >
                  <img
                    src="/assets/mockup-dashboard.png"
                    alt="Command Center"
                    className="w-full h-auto block"
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── VICTORIA AI — card escuro dentro da zona clara ── */}
        <section className="py-20 border-b border-black/[0.07]">
          <div className="mx-auto max-w-6xl px-6">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9 }}
              className="rounded-3xl overflow-hidden border border-black/[0.08]"
              style={{
                background: "#0A0A0E",
                boxShadow: "0 8px 60px rgba(0,0,0,0.14)",
              }}
            >
              <div className="grid lg:grid-cols-2">
                {/* text */}
                <div className="p-8 lg:p-12 border-b lg:border-b-0 lg:border-r border-white/[0.05]">
                  <span className="text-[8.5px] font-black uppercase tracking-[0.34em] text-cyan-400 mb-4 block">
                    IA · MÓDULO EXCLUSIVO
                  </span>
                  <h2
                    className="font-black tracking-[-0.04em] leading-[0.88] mb-5 text-white"
                    style={{ fontSize: "clamp(28px, 3.2vw, 46px)" }}
                  >
                    Victoria AI.
                    <br />
                    <span className="text-white/20">Decisões precisas.</span>
                  </h2>
                  <p className="text-[14.5px] leading-relaxed mb-8 text-white/60">
                    Treinada com a metodologia NC. Audita campanhas, identifica
                    criativos vencedores e sugere ajustes antes que os problemas
                    virem prejuízo.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-8">
                    {[
                      "Análise Automática",
                      "Tempo Real",
                      "Relatórios",
                      "Otimizações",
                    ].map((label, i) => (
                      <span
                        key={i}
                        className="text-[9px] font-black uppercase tracking-[0.18em] rounded-full px-3.5 py-1.5 bg-white/[0.05] text-white/38 border border-white/[0.07]"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/[0.07] px-4 py-2">
                    <span className="h-2 w-2 rounded-full bg-cyan-500 animate-pulse" />
                    <span className="text-[8.5px] font-black uppercase tracking-[0.26em] text-cyan-400">
                      Victoria Online
                    </span>
                  </div>
                </div>

                {/* mockup */}
                <div className="relative min-h-[300px] overflow-hidden">
                  <img
                    src="/assets/mockup-victoria.png"
                    alt="Victoria AI"
                    className="absolute inset-0 w-full h-full object-cover object-left-top"
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to right, #0A0A0E 0%, transparent 28%)",
                    }}
                  />
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── VICTORIA MAIA ── */}
        <section className="py-24">
          <div className="mx-auto max-w-6xl px-6">
            <div className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9 }}
              >
                <span className="text-[8.5px] font-black uppercase tracking-[0.34em] text-red-500 mb-4 block">
                  A VISÃO POR TRÁS
                </span>
                <h2
                  className="font-black tracking-[-0.04em] leading-[0.88] mb-6 text-[#0A0A08]"
                  style={{ fontSize: "clamp(28px, 3.5vw, 48px)" }}
                >
                  Construída por
                  <br />
                  quem vive
                  <br />
                  <span className="shimmer-dark">a operação.</span>
                </h2>
                <p className="text-[14px] leading-relaxed text-[#0A0A08]/52 mb-7">
                  Victoria Maia, fundadora da NC Agência, identificou que as
                  ferramentas disponíveis não entregavam a velocidade que uma
                  agência de alta performance exige. A solução foi construir a
                  própria.
                </p>
                <blockquote className="border-l-2 border-red-600 pl-5 italic text-[13.5px] text-[#0A0A08]/58 mb-8 leading-relaxed">
                  "Não entregamos dados. Entregamos o ecossistema ideal para
                  operar no mais alto nível — com precisão cirúrgica."
                </blockquote>
                <div className="flex items-center gap-3">
                  <img
                    src="/assets/nc-logo.png"
                    alt="NC"
                    className="h-7 w-7 object-contain"
                    style={{ opacity: 0.22 }}
                  />
                  <span className="text-[8.5px] font-mono uppercase tracking-[0.28em] text-[#0A0A08]/28">
                    Victoria Maia · Fundadora &amp; Estrategista
                  </span>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.9, delay: 0.1 }}
                className="relative"
              >
                <div
                  className="absolute -inset-4 rounded-3xl blur-[50px] pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(ellipse, rgba(220,38,38,0.06), transparent)",
                  }}
                />
                <div
                  className="relative rounded-3xl overflow-hidden"
                  style={{ boxShadow: "0 24px 64px rgba(0,0,0,0.14)" }}
                >
                  <img
                    src="/assets/victoria-maia.png"
                    alt="Victoria Maia"
                    className="w-full h-[520px] object-cover grayscale"
                    style={{ objectPosition: "center 15%" }}
                  />
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(238,237,231,0.35) 0%, transparent 60%)",
                    }}
                  />
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </div>

      {/* ════════ BRIDGE light → dark ════════ */}
      <div
        className="relative h-[260px] overflow-hidden"
        style={{ background: "linear-gradient(to bottom, #EEEDE7 0%, #06060C 100%)" }}
      >
        {[8, 22, 38, 52, 65, 79, 92].map((p, i) => (
          <div
            key={i}
            className="absolute h-full w-px pointer-events-none"
            style={{
              left: `${p}%`,
              background:
                "linear-gradient(to bottom, transparent, rgba(220,38,38,0.12), transparent)",
              transform: "skewX(-20deg)",
              opacity: 0.3 + i * 0.05,
            }}
          />
        ))}
      </div>

      {/* ════════════════════════════════════
          ZONA ESCURA: CTA + FOOTER
      ════════════════════════════════════ */}
      <div className="bg-[#06060C] dot-grid">
        <section className="relative py-32 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none -z-10">
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: 900,
                height: 600,
                background:
                  "radial-gradient(ellipse at center, rgba(220,38,38,0.12) 0%, transparent 65%)",
              }}
            />
          </div>
          <div className="mx-auto max-w-3xl px-6 text-center relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[8.5px] font-black uppercase tracking-[0.34em] text-red-500/55 mb-6 block">
                ACESSO RESTRITO · SISTEMA OPERACIONAL
              </span>
              <h2
                className="font-black tracking-[-0.045em] leading-[0.86] mb-8 text-white"
                style={{ fontSize: "clamp(48px, 8vw, 100px)" }}
              >
                Operação em<br />
                <span className="shimmer-text">alta velocidade.</span>
              </h2>
              <p className="text-[17px] mb-12 text-white/50 max-w-sm mx-auto leading-relaxed">
                O acesso ao NC Performance Suite é restrito a colaboradores e
                parceiros autorizados da NC Agência.
              </p>
              <Link
                to="/login"
                className="group inline-flex items-center gap-3 rounded-full bg-red-600 px-12 py-5 text-[10.5px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_70px_rgba(220,38,38,0.55)] hover:scale-[1.02] active:scale-[0.97]"
              >
                Acessar Portal Operacional
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>
          </div>
        </section>

        <footer className="border-t border-white/[0.05] py-8">
          <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/assets/nc-logo.png"
                alt="NC"
                className="h-7 w-7 object-contain"
                style={{ opacity: 0.28 }}
              />
              <span className="text-[11px] font-black uppercase tracking-[0.22em] text-white/18">
                NC Agência
              </span>
            </div>
            <span className="text-[8.5px] font-mono uppercase tracking-[0.2em] text-white/14">
              © {new Date().getFullYear()} NC Performance Suite · Todos os
              direitos reservados
            </span>
            <div className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[8.5px] font-mono uppercase tracking-widest text-white/18">
                Sistema Online
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
