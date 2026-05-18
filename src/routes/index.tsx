import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring, useInView } from "framer-motion";
import {
  ArrowRight, Zap, Database, BarChart3, Layers, Workflow, ShieldCheck,
  Upload as UploadIcon, Cpu, LineChart, Rocket, Bot, Target,
  Megaphone, Palette, Link2, FileText, ChevronDown, Sparkles, Activity
} from "lucide-react";
import { useState, useRef } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — Motor de Performance Automotivo" },
      { name: "description", content: "Plataforma de gestão de performance Meta Ads para o segmento automotivo. Dashboards, relatórios e automação de tráfego pago." },
    ],
  }),
  component: Landing,
});

const STATS = [
  { v: "20+", l: "Contas Gerenciadas" },
  { v: "8.600+", l: "Registros Processados" },
  { v: "24/7", l: "IA Monitorando" },
  { v: "100%", l: "Automatizado" },
];

const FEATURES = [
  { icon: BarChart3, title: "Command Center", d: "Visão consolidada de todas as contas com KPIs dinâmicos, sparklines e tendências em tempo real." },
  { icon: LineChart, title: "Métricas Avançadas", d: "Análise demográfica cruzada (Idade × Gênero × Plataforma) com filtros globais por conta." },
  { icon: Megaphone, title: "Gestão de Campanhas", d: "Controle total de campanhas, AdSets e Ads com breakdown profundo de conversão." },
  { icon: FileText, title: "Relatórios Dinâmicos", d: "Geração automática de relatórios com dados reais, filtrados por período e conta." },
  { icon: Bot, title: "IA Victoria", d: "Agente autônomo que analisa seus dados 24/7 e gera insights estratégicos nos bastidores." },
  { icon: Zap, title: "Automações", d: "Regras inteligentes de otimização que pausam, ajustam e escalam suas campanhas automaticamente." },
  { icon: Database, title: "Integração Meta Ads", d: "Sincronização direta com a Graph API v21.0 para extração completa de métricas e demographics." },
  { icon: Palette, title: "Lab de Criativos", d: "Análise visual de performance de cada criativo para identificar os que mais convertem." },
  { icon: UploadIcon, title: "Extração de Dados", d: "Upload de prints do gerenciador. O motor extrai campanhas, custos e conversões em segundos." },
];

const PROCESS = [
  { n: "01", icon: Database, t: "Conecte", d: "Integre seu token Meta Ads e sincronize todas as contas em um clique." },
  { n: "02", icon: Cpu, t: "Processe", d: "O motor extrai métricas, demographics e breakdowns automaticamente." },
  { n: "03", icon: Bot, t: "Analise", d: "A IA Victoria cruza os dados e gera insights estratégicos." },
  { n: "04", icon: Rocket, t: "Escale", d: "Relatórios automáticos, alertas inteligentes e otimização contínua." },
];

function Landing() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="relative bg-[#0A0A0A] text-white overflow-hidden">
      {/* Progress Bar */}
      <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-[2px] origin-left bg-gradient-to-r from-red-600 via-red-500 to-red-700" />

      {/* ═══════════ NAVBAR ═══════════ */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-[#0A0A0A]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-red-600 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.3)]">
              <span className="font-display font-black text-white text-base">NC</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="font-display text-base font-bold tracking-tight text-white">Performance</span>
              <span className="text-[9px] font-mono font-bold uppercase tracking-[0.3em] text-red-500">Suite</span>
            </div>
          </Link>

          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-full bg-red-600 px-6 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-500 hover:shadow-[0_0_30px_rgba(220,38,38,0.4)] active:scale-95"
          >
            Acessar <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </header>

      {/* ═══════════ HERO ═══════════ */}
      <section className="relative min-h-screen flex items-center justify-center pt-20">
        {/* Background effects */}
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[800px] w-[800px] rounded-full bg-red-600/10 blur-[120px]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-600/30 to-transparent" />
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '64px 64px' }} />
        </div>

        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border border-red-600/20 bg-red-600/5 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-red-500 mb-8"
          >
            <Activity className="h-3 w-3 animate-pulse" />
            Motor de Performance Automotivo
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1 }}
            className="font-display text-5xl sm:text-7xl md:text-[88px] font-black leading-[0.95] tracking-tighter"
          >
            <span className="text-white">Gerencie.</span>
            <br />
            <span className="bg-gradient-to-r from-red-500 via-red-400 to-red-600 bg-clip-text text-transparent">Analise.</span>
            <br />
            <span className="text-white">Escale.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mx-auto mt-8 max-w-2xl text-lg text-white/50 font-medium leading-relaxed"
          >
            A plataforma que captura, processa e entrega performance de tráfego pago para o segmento automotivo brasileiro — com inteligência artificial e automação em escala industrial.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-12"
          >
            <Link
              to="/login"
              className="group relative inline-flex items-center gap-3 rounded-2xl bg-red-600 px-10 py-5 text-base font-bold text-white transition-all hover:bg-red-500 hover:shadow-[0_0_60px_rgba(220,38,38,0.4)] active:scale-[0.98]"
            >
              <span>Acessar Suite</span>
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
              {/* Shimmer effect */}
              <div className="absolute inset-0 flex h-full w-full justify-center overflow-hidden rounded-2xl [transform:skew(-12deg)_translateX(-100%)] group-hover:duration-[1.2s] group-hover:[transform:skew(-12deg)_translateX(100%)]">
                <div className="relative h-full w-10 bg-white/10" />
              </div>
            </Link>
          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
            className="mt-24 flex flex-col items-center gap-2 text-white/20"
          >
            <span className="text-[10px] font-mono uppercase tracking-widest">Descubra</span>
            <ChevronDown className="h-4 w-4 animate-bounce" />
          </motion.div>
        </div>
      </section>

      {/* ═══════════ STATS BAR ═══════════ */}
      <section className="border-y border-white/5">
        <div className="mx-auto grid max-w-6xl grid-cols-2 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="border-r border-white/5 last:border-r-0 px-6 py-12 text-center"
            >
              <div className="font-display text-4xl sm:text-5xl font-black tracking-tighter bg-gradient-to-b from-white to-white/50 bg-clip-text text-transparent">{s.v}</div>
              <div className="mt-2 text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/30">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════ FEATURES ═══════════ */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-32">
        <div className="mb-20 text-center">
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            className="text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-red-500"
          >
            Capacidades
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-5 font-display text-4xl sm:text-5xl font-black tracking-tighter"
          >
            Tudo que sua operação precisa.
          </motion.h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group relative rounded-2xl border border-white/5 bg-white/[0.02] p-7 transition-all duration-300 hover:border-red-600/20 hover:bg-red-600/[0.03]"
            >
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-red-600/10 text-red-500 ring-1 ring-red-600/20 transition-all group-hover:bg-red-600/20 group-hover:shadow-[0_0_20px_rgba(220,38,38,0.15)]">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-bold tracking-tight text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/40">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════ PROCESS ═══════════ */}
      <section id="process" className="border-y border-white/5 bg-white/[0.01] py-32">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-20 text-center">
            <p className="text-[11px] font-mono font-bold uppercase tracking-[0.3em] text-red-500">Pipeline</p>
            <h2 className="mt-5 font-display text-4xl sm:text-5xl font-black tracking-tighter">
              Quatro passos. Zero fricção.
            </h2>
          </div>

          <div className="grid gap-px overflow-hidden rounded-3xl border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p, i) => (
              <motion.div
                key={p.n}
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-[#0A0A0A] p-10 group"
              >
                <div className="text-[11px] font-mono font-bold text-red-500 tracking-[0.2em]">{p.n}</div>
                <p.icon className="mt-6 h-8 w-8 text-white/30 group-hover:text-red-500 transition-colors" />
                <h3 className="mt-5 font-display text-xl font-bold">{p.t}</h3>
                <p className="mt-3 text-sm text-white/40 leading-relaxed">{p.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════ CTA FINAL ═══════════ */}
      <section className="relative py-32">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[500px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/10 blur-[120px]" />
        </div>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-red-600/10 text-red-500 ring-1 ring-red-600/20 mb-8">
            <Sparkles className="h-7 w-7" />
          </div>
          <h2 className="font-display text-4xl sm:text-5xl font-black tracking-tighter">
            Pronto para escalar?
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/40 text-lg">
            Acesse a suite e conecte sua primeira conta Meta Ads agora.
          </p>
          <Link
            to="/login"
            className="mt-10 group inline-flex items-center gap-3 rounded-2xl bg-red-600 px-10 py-5 text-base font-bold text-white transition-all hover:bg-red-500 hover:shadow-[0_0_60px_rgba(220,38,38,0.4)] active:scale-[0.98]"
          >
            Acessar Suite <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      {/* ═══════════ FOOTER ═══════════ */}
      <footer className="border-t border-white/5 py-12">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-red-600 flex items-center justify-center">
              <span className="font-display font-black text-white text-xs">NC</span>
            </div>
            <span className="font-display text-sm font-semibold text-white/50">Performance Suite</span>
          </div>
          <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-white/20">
            © NC AGÊNCIA · {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
