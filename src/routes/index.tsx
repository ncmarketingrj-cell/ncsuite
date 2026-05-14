import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, useScroll, useSpring } from "framer-motion";
import {
  ArrowRight, Zap, Database, BarChart3, Layers, Workflow, ShieldCheck,
  Upload as UploadIcon, Cpu, LineChart, Rocket, ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NC Performance Suite — Motor de tráfego automotivo" },
      { name: "description", content: "Plataforma SaaS de gestão de performance Meta Ads para concessionárias e revendas. Relatórios, dashboards e extração de dados em segundos." },
    ],
  }),
  component: Landing,
});

const STATS = [
  { v: "10×", l: "Produtividade" },
  { v: "60s", l: "Setup" },
  { v: "99.9%", l: "Precisão" },
  { v: "24/7", l: "Engine" },
];

const FEATURES = [
  { icon: UploadIcon, title: "Extração de Print", d: "Suba o print do gerenciador. O motor extrai campanhas, custos e conversões em segundos." },
  { icon: BarChart3, title: "Dashboards de Performance", d: "Visão consolidada multi-cliente, multi-campanha, com filtros temporais." },
  { icon: Layers, title: "Relatórios Profissionais", d: "8 formatos prontos, drag-and-drop de campanhas, preview em tempo real." },
  { icon: Workflow, title: "Automações de Envio", d: "Agende disparos recorrentes para clientes — diário, semanal, mensal." },
  { icon: Database, title: "Integração Meta Ads", d: "Sincronize campanhas e métricas direto da Graph API v21.0." },
  { icon: ShieldCheck, title: "Templates de Assinatura", d: "Modelos com identidade da agência reutilizáveis em todos os relatórios." },
];

const PROCESS = [
  { n: "01", icon: UploadIcon, t: "Captura", d: "Sincronia direta ou upload de print." },
  { n: "02", icon: Cpu, t: "Processa", d: "Motor extrai e estrutura os dados." },
  { n: "03", icon: LineChart, t: "Insights", d: "Dashboards e relatórios prontos." },
  { n: "04", icon: Rocket, t: "Escala", d: "Automatize entregas e ganhe horas." },
];

const FAQ = [
  { q: "Preciso saber código?", a: "Não. Toda a operação é visual. Você sobe um print ou conecta a conta Meta Ads e o motor cuida do resto." },
  { q: "Quantos clientes posso gerenciar?", a: "Ilimitado. A plataforma escala para concessionárias, redes e agências multi-marca." },
  { q: "Os relatórios saem com a marca da agência?", a: "Sim. Templates de capa, rodapé, logo, cores e assinatura são totalmente customizáveis." },
  { q: "Como funciona a integração com o Meta Ads?", a: "Você cola seu access token e ID da conta nas configurações. Sincronia em um clique." },
  { q: "Existe modo dark?", a: "A suite é dark-first, projetada para reduzir fadiga em jornadas longas de operação." },
];

const KEYWORDS = ["Performance", "Meta Ads", "Automotivo", "Relatórios", "Dashboards", "Extração", "Multicanal", "Conversão", "ROAS", "Pipeline", "Insights", "Escala"];

function Landing() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 100, damping: 30 });

  return (
    <div className="relative">
      <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-50 h-[2px] origin-left bg-gradient-to-r from-primary via-secondary to-accent" />

      {/* Navbar */}
      <header className="fixed inset-x-0 top-0 z-40 border-b border-white/5 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Logo />
          <nav className="hidden items-center gap-8 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">Features</a>
            <a href="#process" className="hover:text-foreground">Como funciona</a>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <Link
            to="/login"
            className="group inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-2 text-xs font-medium text-primary transition hover:bg-primary hover:text-primary-foreground hover:shadow-glow"
          >
            Acessar Suite <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden pt-40 pb-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/3 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-5xl px-6 text-center">
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="label-mono text-primary">
            Performance Engine • Meta Ads • Automotivo
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="mt-6 font-display text-5xl font-bold leading-[1.05] sm:text-7xl md:text-[88px]"
          >
            <span className="text-gradient">NC Performance</span><br />
            <span className="text-foreground">Suite.</span>
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg"
          >
            O motor que captura, processa e entrega performance de tráfego pago para o segmento automotivo brasileiro — em escala industrial.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/login"
              className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-7 py-3.5 text-sm font-semibold text-background shadow-glow transition hover:scale-[1.02]"
            >
              Iniciar agora <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
            </Link>
            <a href="#process" className="rounded-full border border-white/10 bg-white/[0.02] px-7 py-3.5 text-sm font-medium hover:bg-white/[0.05]">
              Ver como funciona
            </a>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y border-white/5 bg-card/40">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
          {STATS.map((s, i) => (
            <motion.div
              key={s.l}
              initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.06 }}
              className="bg-background/80 px-6 py-10 text-center"
            >
              <div className="text-gradient font-display text-4xl font-bold sm:text-5xl">{s.v}</div>
              <div className="label-mono mt-2 text-muted-foreground">{s.l}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Marquee */}
      <section className="overflow-hidden border-b border-white/5 py-8">
        <div className="flex w-max animate-marquee gap-12 whitespace-nowrap text-2xl font-display font-semibold text-muted-foreground/40 sm:text-4xl">
          {[...KEYWORDS, ...KEYWORDS].map((k, i) => (
            <span key={i} className="flex items-center gap-12">
              {k} <span className="text-primary">◆</span>
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-14 text-center">
          <p className="label-mono text-primary">Capacidades</p>
          <h2 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Tudo que sua operação precisa.</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="glass-panel group p-6 transition hover:border-primary/30"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.d}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Process */}
      <section id="process" className="border-y border-white/5 bg-card/30 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-14 text-center">
            <p className="label-mono text-primary">Pipeline</p>
            <h2 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Quatro passos. Sem fricção.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
            {PROCESS.map((p, i) => (
              <motion.div
                key={p.n}
                initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="bg-background p-8"
              >
                <div className="label-mono text-primary">{p.n}</div>
                <p.icon className="mt-6 h-7 w-7 text-secondary" />
                <h3 className="mt-4 font-display text-xl font-semibold">{p.t}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{p.d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-3xl px-6 py-24">
        <div className="mb-12 text-center">
          <p className="label-mono text-primary">Perguntas</p>
          <h2 className="mt-4 font-display text-4xl font-bold sm:text-5xl">Dúvidas comuns.</h2>
        </div>
        <div className="space-y-3">
          {FAQ.map((f, i) => <FaqItem key={i} {...f} />)}
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-y border-white/5 py-24">
        <div className="absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-1/2 h-[400px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 blur-3xl" />
        </div>
        <div className="mx-auto max-w-3xl px-6 text-center">
          <Zap className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-6 font-display text-4xl font-bold sm:text-5xl">Pronto para escalar?</h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Acesse a suite e conecte sua primeira conta em menos de 60 segundos.
          </p>
          <Link
            to="/login"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-4 text-sm font-semibold text-background shadow-glow"
          >
            Acessar Suite <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 text-xs text-muted-foreground sm:flex-row">
          <Logo size={28} />
          <span className="label-mono">© NC AGÊNCIA · {new Date().getFullYear()}</span>
        </div>
      </footer>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-5 text-left"
      >
        <span className="font-medium">{q}</span>
        <ChevronDown className={`h-4 w-4 text-primary transition ${open ? "rotate-180" : ""}`} />
      </button>
      <motion.div
        initial={false}
        animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
        className="overflow-hidden"
      >
        <p className="px-5 pb-5 text-sm text-muted-foreground">{a}</p>
      </motion.div>
    </div>
  );
}
