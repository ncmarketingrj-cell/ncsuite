import { createFileRoute, Link } from "@tanstack/react-router";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  useInView,
} from "framer-motion";
import {
  ArrowRight,
  Bot,
  BarChart3,
  Zap,
  Activity,
  Target,
  Layers,
  TrendingUp,
  Shield,
  Bell,
} from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — O Sistema Operacional de Marketing da NC Agência" },
      { name: "description", content: "A plataforma proprietária de Business Intelligence e IA da NC Agência para gestão de tráfego pago de alta performance." },
    ],
  }),
  component: LandingPage,
});

/* ───────────────────────────── helpers ───────────────────────────── */

function Counter({ to, prefix = "", suffix = "", decimals = 0 }: {
  to: number; prefix?: string; suffix?: string; decimals?: number;
}) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView) return;
    const start = performance.now();
    const duration = 2000;
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(parseFloat((eased * to).toFixed(decimals)));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [inView, to, decimals]);

  return (
    <span ref={ref}>
      {prefix}
      {decimals > 0 ? val.toFixed(decimals) : Math.floor(val).toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

function GlowCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div
      className={`rounded-3xl border border-white/[0.07] bg-white/[0.02] backdrop-blur-sm overflow-hidden ${className}`}
      whileHover={{
        y: -8,
        boxShadow: "0 0 50px rgba(220,38,38,0.10), 0 0 0 1px rgba(220,38,38,0.14)",
      }}
      transition={{ type: "spring", damping: 22, stiffness: 280 }}
    >
      {children}
    </motion.div>
  );
}

const STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const ITEM = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] } },
};

/* ─── speed lines decorative ─── */
function SpeedLines({ opacity = 0.025 }: { opacity?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" style={{ opacity }}>
      {[10, 22, 34, 46, 58, 70, 82].map((pct, i) => (
        <div
          key={i}
          className="absolute h-full w-px"
          style={{
            left: `${pct}%`,
            background: "linear-gradient(to bottom, transparent 0%, #DC2626 40%, #DC2626 60%, transparent 100%)",
            transform: "skewX(-18deg)",
            opacity: 0.3 + i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

/* ─── marquee ticker ─── */
const TICKER = [
  "META ADS", "BI EM TEMPO REAL", "GESTÃO DE TRÁFEGO", "AUTOMAÇÃO DE ALERTAS",
  "VICTORIA AI", "CPL TRACKING", "BUDGET PACING", "RELATÓRIOS ESTRATÉGICOS",
  "DIAGNÓSTICO DE CRIATIVOS", "MULTICANAL", "ALTO CPM", "NC AGÊNCIA",
];

/* ─── modules ─── */
const MODULES = [
  { icon: BarChart3, label: "Command Center", desc: "Dashboard consolidado de investimento, CPL e KPIs operacionais de todas as contas.", tag: "LIVE", color: "text-red-400", glow: "from-red-950/50" },
  { icon: Activity,  label: "Métricas & KPIs",  desc: "Análise granular de performance com drill-down por conta, data e campanha.", tag: "DATA", color: "text-orange-400", glow: "from-orange-950/50" },
  { icon: Target,    label: "Gestão de Ads",    desc: "Controle total de campanhas ativas — status, criativos, pacing e frequência real.", tag: "OPS",  color: "text-purple-400", glow: "from-purple-950/50" },
  { icon: Bot,       label: "Victoria AI",      desc: "IA estratégica que audita campanhas, identifica padrões e gera insights acionáveis.", tag: "AI",   color: "text-cyan-400",   glow: "from-cyan-950/50" },
  { icon: Zap,       label: "Automações",       desc: "Regras inteligentes de alerta por CPL, frequência, budget e anomalias de entrega.", tag: "AUTO", color: "text-yellow-400", glow: "from-yellow-950/50" },
  { icon: Layers,    label: "Criativos",        desc: "Banco de criativos com score de fadiga, ranking de performance e troca automatizada.", tag: "LAB",  color: "text-pink-400",   glow: "from-pink-950/50" },
];

/* ───────────────────────────── main ───────────────────────────── */

function LandingPage() {
  const { scrollYProgress } = useScroll();
  const heroOpacity = useTransform(scrollYProgress, [0, 0.14], [1, 0]);
  const heroY       = useTransform(scrollYProgress, [0, 0.14], [0, 70]);

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  /* mouse parallax for dashboard */
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rX = useSpring(useTransform(my, [-500, 500], [4, -4]), { stiffness: 80, damping: 28 });
  const rY = useSpring(useTransform(mx, [-700, 700], [-5, 5]), { stiffness: 80, damping: 28 });

  const onMouseMove = useCallback((e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set(e.clientX - r.left - r.width / 2);
    my.set(e.clientY - r.top - r.height / 2);
  }, [mx, my]);

  const onMouseLeave = useCallback(() => { mx.set(0); my.set(0); }, [mx, my]);

  return (
    <div className="relative min-h-screen bg-[#020205] text-white selection:bg-red-600/30 selection:text-red-200 overflow-x-hidden">

      {/* ── global keyframes ── */}
      <style>{`
        @keyframes marquee   { to { transform: translateX(-50%); } }
        @keyframes shimmerTx { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
        @keyframes scanPulse { 0%,100% { opacity: 0; } 50% { opacity: 1; } }
        @keyframes floatY    { 0%,100% { transform: translateY(0px); } 50% { transform: translateY(-12px); } }
        .marquee-inner { animation: marquee 35s linear infinite; }
        .text-shimmer {
          background: linear-gradient(90deg, #fff 20%, #ef4444 40%, #fff 60%, #ef4444 80%, #fff 100%);
          background-size: 200% auto;
          -webkit-background-clip: text; -webkit-text-fill-color: transparent;
          animation: shimmerTx 5s linear infinite;
        }
        .float { animation: floatY 7s ease-in-out infinite; }
        .scan-line::after {
          content: ''; position: absolute; inset-x: 0; height: 2px;
          background: linear-gradient(90deg, transparent, rgba(220,38,38,0.25), transparent);
          animation: scanPulse 2.5s ease-in-out infinite;
        }
      `}</style>

      {/* ══════════════════════════ NAVBAR ══════════════════════════ */}
      <header className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        scrolled ? "bg-[#020205]/88 backdrop-blur-2xl border-b border-white/[0.06] py-3" : "bg-transparent py-5"
      }`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC" className="h-9 w-9 object-contain" />
            <div className="leading-none">
              <div className="font-black text-[15px] tracking-tight uppercase">NC Agência</div>
              <div className="text-[8px] font-mono font-bold uppercase tracking-[0.32em] text-red-500/80 mt-0.5">Performance Suite</div>
            </div>
          </div>
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-600/10 px-6 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-red-400 transition-all hover:bg-red-600 hover:text-white hover:border-red-600 hover:shadow-[0_0_28px_rgba(220,38,38,0.35)]"
          >
            Acessar <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </header>

      {/* ══════════════════════════ HERO ══════════════════════════ */}
      <section
        className="relative flex min-h-screen flex-col items-center justify-center pt-28 pb-0 overflow-hidden"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {/* backgrounds */}
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 h-[800px] w-[1000px] rounded-full bg-red-600/[0.11] blur-[170px]" />
          <div className="absolute left-[15%] top-[70%] h-[350px] w-[350px] rounded-full bg-red-900/[0.07] blur-[120px]" />
          <div className="absolute right-[10%] top-[30%] h-[250px] w-[250px] rounded-full bg-red-800/[0.06] blur-[100px]" />
          <SpeedLines opacity={0.028} />
          {/* grain */}
          <div
            className="absolute inset-0 opacity-[0.14]"
            style={{
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
              backgroundSize: "180px",
            }}
          />
          <div className="absolute bottom-0 inset-x-0 h-72 bg-gradient-to-t from-[#020205] to-transparent" />
        </div>

        {/* text content */}
        <motion.div style={{ opacity: heroOpacity, y: heroY }} className="relative z-10 w-full max-w-6xl mx-auto px-6 text-center">

          {/* badge */}
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
            Tecnologia Proprietária · NC Agência · Automotivo
          </motion.div>

          {/* headline */}
          <motion.h1
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="font-black leading-[0.86] tracking-[-0.04em] mb-0"
            style={{ fontSize: "clamp(44px, 8.5vw, 100px)" }}
          >
            <span className="block text-white">O sistema que</span>
            <span className="block text-shimmer">acelera resultados</span>
            <span className="block text-white/25">da NC Agência.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-7 max-w-2xl text-base sm:text-lg text-white/40 font-medium leading-relaxed"
          >
            Plataforma de Business Intelligence + IA desenvolvida internamente para centralizar operação,
            tráfego pago e tomada de decisão com a velocidade que a alta performance exige.
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
            <Link
              to="/login"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.1] bg-white/[0.04] px-9 py-4 text-[11px] font-black uppercase tracking-[0.2em] text-white/50 transition-all hover:border-white/20 hover:text-white hover:bg-white/[0.07] active:scale-[0.97] backdrop-blur-sm"
            >
              Acesso Restrito
            </Link>
          </motion.div>
        </motion.div>

        {/* dashboard 3D mockup */}
        <motion.div
          initial={{ opacity: 0, y: 110, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.5, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-20 mt-16 w-full max-w-[1180px] px-4 sm:px-6 float"
          style={{ perspective: "2200px" }}
        >
          <motion.div style={{ rotateX: rX, rotateY: rY }} className="relative">
            {/* outer glow ring */}
            <div className="absolute -inset-1 rounded-2xl bg-red-600/[0.08] blur-[40px]" />
            {/* browser window */}
            <div className="relative rounded-[18px] bg-[#0C0C0E] border border-white/[0.09] shadow-[0_60px_120px_rgba(0,0,0,0.8),0_0_0_1px_rgba(255,255,255,0.04)] overflow-hidden">
              {/* title bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-black/50 border-b border-white/[0.05]">
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
                <div className="flex gap-1">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-5 w-5 rounded bg-white/[0.04] border border-white/[0.05]" />
                  ))}
                </div>
              </div>
              {/* screenshot */}
              <div className="scan-line relative">
                <img
                  src="/assets/mockup-dashboard.png"
                  alt="NC Performance Suite — Dashboard"
                  className="w-full h-auto object-cover object-top"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#020205] pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent 55%, #020205 100%)" }} />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </section>

      {/* ══════════════════════════ TICKER ══════════════════════════ */}
      <div className="relative border-y border-white/[0.06] bg-black/40 backdrop-blur-sm overflow-hidden py-3.5 select-none">
        <div className="flex marquee-inner whitespace-nowrap gap-14">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span key={i} className="inline-flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.32em] text-white/18">
              <span className="inline-block h-1 w-1 rounded-full bg-red-600 flex-shrink-0" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* ══════════════════════════ STATS ══════════════════════════ */}
      <section className="py-24 relative">
        <div className="mx-auto max-w-5xl px-6">
          <motion.div
            variants={STAGGER}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid grid-cols-2 lg:grid-cols-4 border border-white/[0.07] rounded-3xl overflow-hidden"
          >
            {[
              { to: 61, pre: "R$", suf: "M+", label: "em mídia gerenciada" },
              { to: 25048, pre: "", suf: "+", label: "leads gerados" },
              { to: 150, pre: "", suf: "+", label: "campanhas ativas" },
              { to: 99, pre: "", suf: ".9%", label: "disponibilidade" },
            ].map((s, i) => (
              <motion.div
                key={i}
                variants={ITEM}
                className="p-8 text-center border-r border-b border-white/[0.06] last:border-r-0 [&:nth-child(2)]:border-r-0 lg:[&:nth-child(2)]:border-r lg:[&:nth-child(4)]:border-r-0 [&:nth-child(3)]:border-b-0 [&:nth-child(4)]:border-b-0 bg-white/[0.01] hover:bg-white/[0.025] transition-colors"
              >
                <div className="text-3xl sm:text-[40px] font-black tracking-tight text-white mb-2">
                  <Counter to={s.to} prefix={s.pre} suffix={s.suf} />
                </div>
                <div className="text-[9px] font-mono font-bold uppercase tracking-[0.22em] text-white/30">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════ SUITE MODULES ══════════════════════════ */}
      <section id="suite" className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute right-0 top-1/3 h-[600px] w-[600px] rounded-full bg-red-900/[0.07] blur-[160px]" />
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
            className="text-center max-w-3xl mx-auto mb-16"
          >
            <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">NC PERFORMANCE SUITE</span>
            <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5" style={{ fontSize: "clamp(36px, 5.5vw, 64px)" }}>
              Seis módulos.<br /><span className="text-white/25">Uma operação.</span>
            </h2>
            <p className="text-white/35 text-base sm:text-lg leading-relaxed">
              Cada módulo foi construído sob demanda real da operação — sem excessos, sem atalhos, sem compromissos.
            </p>
          </motion.div>

          <motion.div
            variants={STAGGER}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-60px" }}
            className="grid md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {MODULES.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <motion.div key={i} variants={ITEM}>
                  <GlowCard className="h-full">
                    <div className="relative p-7 h-full">
                      <div className={`absolute inset-0 bg-gradient-to-br ${mod.glow} to-transparent opacity-60`} />
                      <div className="relative z-10">
                        <div className="flex items-start justify-between mb-5">
                          <div className="h-11 w-11 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                            <Icon className={`h-5 w-5 ${mod.color}`} />
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-[0.28em] text-white/20 border border-white/[0.08] rounded-full px-2.5 py-1 bg-white/[0.04]">
                            {mod.tag}
                          </span>
                        </div>
                        <h3 className="text-[18px] font-black mb-2 text-white">{mod.label}</h3>
                        <p className="text-[13px] text-white/35 leading-relaxed">{mod.desc}</p>
                      </div>
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════ DASHBOARD SHOWCASE ══════════════════════════ */}
      <section className="py-28 relative overflow-hidden border-y border-white/[0.06] bg-black/25">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[800px] rounded-full bg-red-900/[0.08] blur-[160px]" />
          <SpeedLines opacity={0.015} />
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">COMMAND CENTER</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6" style={{ fontSize: "clamp(34px, 4.5vw, 56px)" }}>
                Visão completa.<br /><span className="text-white/25">Zero dispersão.</span>
              </h2>
              <p className="text-white/35 text-base leading-relaxed mb-10">
                Todas as contas Meta Ads consolidadas em um único painel. Investimento, conversões, CPL, pacing de orçamento e alertas inteligentes — disponíveis instantaneamente para cada membro do time.
              </p>
              <motion.ul
                variants={STAGGER}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="space-y-3"
              >
                {[
                  { icon: TrendingUp, text: "Sincronização automática com Meta Ads API" },
                  { icon: Bell,       text: "Alertas de CPL fora do limiar configurado" },
                  { icon: Activity,   text: "Budget pacing em tempo real com indicadores visuais" },
                  { icon: Shield,     text: "Sistema de permissões por cargo e hierarquia" },
                ].map((item, i) => (
                  <motion.li key={i} variants={ITEM} className="flex items-center gap-3 text-sm text-white/50">
                    <div className="h-7 w-7 rounded-lg bg-red-600/[0.12] border border-red-500/[0.15] flex items-center justify-center flex-shrink-0">
                      <item.icon className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    {item.text}
                  </motion.li>
                ))}
              </motion.ul>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 40, scale: 0.97 }}
              whileInView={{ opacity: 1, x: 0, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="absolute -inset-6 bg-red-600/[0.06] rounded-3xl blur-[60px]" />
              <div className="relative rounded-2xl overflow-hidden border border-white/[0.09] shadow-2xl">
                <img src="/assets/mockup-dashboard.png" alt="Command Center Dashboard" className="w-full h-auto" />
                <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, #020205 0%, transparent 50%)" }} />
                {/* floating stat badge */}
                <div className="absolute top-4 right-4 rounded-xl bg-black/70 backdrop-blur-md border border-white/[0.1] px-3 py-2">
                  <div className="text-[8px] font-mono font-bold uppercase tracking-[0.2em] text-green-400 mb-0.5">Budget pacing</div>
                  <div className="text-base font-black text-white">55% <span className="text-xs font-normal text-white/40">do dia</span></div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ VICTORIA AI ══════════════════════════ */}
      <section className="py-28 relative overflow-hidden">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute right-0 bottom-0 h-[400px] w-[500px] rounded-full bg-cyan-900/[0.08] blur-[150px]" />
          <div className="absolute left-[5%] top-1/2 h-[300px] w-[300px] rounded-full bg-red-900/[0.06] blur-[120px]" />
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <div className="rounded-3xl border border-white/[0.07] bg-white/[0.01] overflow-hidden relative">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-red-500/25 to-transparent" />
            <div className="absolute bottom-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-cyan-500/15 to-transparent" />

            <div className="grid lg:grid-cols-5 gap-0">
              {/* text — 3 cols */}
              <div className="lg:col-span-3 p-10 lg:p-14">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.9 }}
                >
                  <span className="text-[9px] font-black uppercase tracking-[0.32em] text-cyan-400 mb-4 block">INTELIGÊNCIA ARTIFICIAL · MÓDULO EXCLUSIVO</span>
                  <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-5" style={{ fontSize: "clamp(34px, 4.5vw, 56px)" }}>
                    Victoria AI.<br /><span className="text-white/25">Decisões precisas.</span>
                  </h2>
                  <p className="text-white/35 text-base leading-relaxed mb-8 max-w-lg">
                    Treinada com a metodologia NC. Audita campanhas, identifica criativos vencedores, alerta sobre anomalias de entrega e sugere ajustes estratégicos — antes que os problemas virem prejuízo.
                  </p>

                  <div className="space-y-0 border border-white/[0.07] rounded-2xl overflow-hidden">
                    {[
                      { label: "Análise de Performance",    val: "Automática" },
                      { label: "Detecção de Anomalias",     val: "Tempo Real" },
                      { label: "Relatórios Estratégicos",   val: "Sob Demanda" },
                      { label: "Otimizações Sugeridas",     val: "Com Dados" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.05] last:border-0 hover:bg-white/[0.02] transition-colors">
                        <span className="text-sm text-white/40 font-medium">{item.label}</span>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-green-400 border border-green-500/20 rounded-full px-2.5 py-0.5 bg-green-500/[0.06]">
                          {item.val}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              </div>

              {/* image — 2 cols */}
              <div className="lg:col-span-2 relative min-h-[300px] lg:min-h-0 overflow-hidden bg-black/30 border-t lg:border-t-0 lg:border-l border-white/[0.06]">
                <img
                  src="/assets/mockup-victoria.png"
                  alt="Victoria AI"
                  className="absolute inset-0 w-full h-full object-cover object-left-top opacity-75"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#020205] via-transparent to-transparent hidden lg:block" style={{ background: "linear-gradient(to right, #020205 0%, transparent 40%)" }} />
                <div className="absolute bottom-0 inset-x-0 h-1/2 bg-gradient-to-t from-[#020205] to-transparent" />

                <div className="absolute top-5 right-5 flex items-center gap-2 rounded-full bg-black/65 backdrop-blur-md border border-white/[0.1] px-3.5 py-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-400">Victoria Online</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════ VICTORIA MAIA (founder) ══════════════════════════ */}
      <section className="py-28 relative overflow-hidden border-t border-white/[0.06]">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-0 top-1/2 h-[700px] w-[700px] -translate-y-1/2 rounded-full bg-red-900/[0.07] blur-[170px]" />
          <SpeedLines opacity={0.018} />
        </div>

        <div className="mx-auto max-w-7xl px-6">
          <div className="grid lg:grid-cols-2 gap-16 items-center">

            {/* photo */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
              className="relative order-2 lg:order-1"
            >
              <div className="absolute inset-4 bg-red-600/[0.07] blur-[80px] rounded-full" />
              <div className="relative group rounded-3xl overflow-hidden border border-white/[0.09] shadow-[0_40px_80px_rgba(0,0,0,0.6)]">
                <img
                  src="/assets/victoria-maia.png"
                  alt="Victoria Maia — Fundadora NC Agência"
                  className="w-full aspect-[4/5] object-cover object-top grayscale group-hover:grayscale-0 transition-all duration-[1.2s]"
                />
                <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, #020205 0%, rgba(2,2,5,0.3) 40%, transparent 70%)" }} />
                {/* overlay info */}
                <div className="absolute bottom-0 inset-x-0 p-7">
                  <p className="text-[9px] font-black uppercase tracking-[0.3em] text-red-400 mb-1">Fundadora & Estrategista Chefe</p>
                  <p className="font-black text-2xl text-white">Victoria Maia</p>
                  <p className="text-sm text-white/40 mt-1">NC Agência · Rio de Janeiro</p>
                </div>
                {/* corner badge */}
                <div className="absolute top-5 left-5 rounded-xl bg-black/60 backdrop-blur-md border border-white/[0.1] px-3 py-1.5">
                  <span className="text-[9px] font-black uppercase tracking-[0.22em] text-white/50">Agência de Elite</span>
                </div>
              </div>
            </motion.div>

            {/* text */}
            <motion.div
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              className="order-1 lg:order-2"
            >
              <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-4 block">A VISÃO POR TRÁS DA TECNOLOGIA</span>
              <h2 className="font-black tracking-[-0.04em] leading-[0.88] mb-6" style={{ fontSize: "clamp(34px, 4.5vw, 56px)" }}>
                Construída por quem<br /><span className="text-white/25">vive a operação.</span>
              </h2>

              <div className="space-y-5 text-white/40 text-[15px] leading-relaxed">
                <p>
                  A NC Performance Suite não surgiu de uma sala de produto — surgiu da necessidade real de quem gerencia múltiplas contas, múltiplos clientes e múltiplos criativos ao mesmo tempo.
                </p>
                <p>
                  Victoria Maia, fundadora da NC Agência, identificou que as ferramentas disponíveis no mercado não entregavam a velocidade e a profundidade que uma agência de alta performance exige. A solução foi construir a própria.
                </p>
                <blockquote className="relative border-l-2 border-red-600 pl-6 py-1 text-white/65 italic">
                  <span className="absolute left-3.5 top-0 text-red-600 text-2xl font-black leading-none select-none">"</span>
                  Não entregamos apenas dados. Entregamos o ecossistema ideal para que nossa equipe opere no mais alto nível de performance — com precisão cirúrgica e velocidade de corrida.
                </blockquote>
              </div>

              <div className="mt-10 flex items-center gap-4">
                <img src="/assets/nc-logo.png" alt="NC" className="h-10 w-10 object-contain opacity-25" />
                <div className="h-px bg-white/[0.08] flex-1" />
                <span className="text-[9px] font-mono font-bold uppercase tracking-[0.28em] text-white/20">Rio de Janeiro · Brasil</span>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ══════════════════════════ CTA ══════════════════════════ */}
      <section className="relative py-44 overflow-hidden border-t border-white/[0.06]">
        <div className="absolute inset-0 -z-10 pointer-events-none">
          <div className="absolute left-1/2 top-1/2 h-[700px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-700/[0.13] blur-[170px]" />
          <SpeedLines opacity={0.035} />
          <div className="absolute inset-0 opacity-[0.12]" style={{
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            backgroundSize: "180px",
          }} />
        </div>

        <div className="mx-auto max-w-4xl px-6 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-[9px] font-black uppercase tracking-[0.32em] text-red-500 mb-6 block">ACESSO INTERNO · SISTEMA OPERACIONAL</span>
            <h2
              className="font-black tracking-[-0.04em] leading-[0.86] mb-8"
              style={{ fontSize: "clamp(48px, 9vw, 104px)" }}
            >
              Operação em<br /><span className="text-shimmer">alta velocidade.</span>
            </h2>
            <p className="text-white/35 text-lg mb-12 max-w-lg mx-auto">
              O acesso ao NC Performance Suite é restrito a colaboradores e parceiros autorizados da NC Agência.
            </p>
            <Link
              to="/login"
              className="group inline-flex items-center gap-3 rounded-full bg-red-600 px-12 py-5 text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all hover:bg-red-500 hover:shadow-[0_0_70px_rgba(220,38,38,0.55)] hover:scale-105 active:scale-[0.97] shadow-2xl"
            >
              Acessar Portal Operacional
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1.5" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ══════════════════════════ FOOTER ══════════════════════════ */}
      <footer className="border-t border-white/[0.06] bg-black/50 py-10">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src="/assets/nc-logo.png" alt="NC" className="h-7 w-7 object-contain opacity-35" />
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
  );
}
