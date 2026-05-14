import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Upload, FileText, BarChart3, Settings, ArrowUpRight, Activity,
  Sparkles, Layers, Cpu, Link2, Megaphone, LineChart, Palette, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NC Performance Suite" }] }),
  component: Dashboard,
});

const HUB_ITEMS = [
  { to: "/multicanal", icon: BarChart3, title: "Performance Meta Ads", desc: "Visão consolidada de campanhas e métricas.", tag: "Core", tagColor: "bg-primary/20 text-primary" },
  { to: "/criativos", icon: Palette, title: "Laboratório de Criativos", desc: "Galeria de criativos e análise de desempenho.", tag: "Lab", tagColor: "bg-secondary/20 text-secondary" },
  { to: "/organizador", icon: Link2, title: "Central de Links", desc: "Crie link pages personalizadas para cada cliente.", tag: "Conversão", tagColor: "bg-accent/20 text-accent" },
  { to: "/metricas", icon: LineChart, title: "Controle de Indicadores", desc: "KPIs, gráficos e análise de tendência.", tag: "Data", tagColor: "bg-primary/20 text-primary" },
  { to: "/integrations", icon: Zap, title: "Integração Meta API", desc: "Sincronize campanhas direto da Graph API.", tag: "API", tagColor: "bg-success/20 text-success" },
  { to: "/campanhas", icon: Megaphone, title: "Gestão de Campanhas", desc: "CRUD completo e controle de budget.", tag: "Ops", tagColor: "bg-secondary/20 text-secondary" },
];

const OPS_ITEMS = [
  { to: "/upload", icon: Upload, title: "Gerar Relatório", desc: "Suba print do gerenciador." },
  { to: "/campanhas", icon: Activity, title: "Campanhas", desc: "Gerencie todas as campanhas." },
  { to: "/utms", icon: Megaphone, title: "UTM Builder", desc: "Crie URLs rastreáveis." },
  { to: "/metricas", icon: LineChart, title: "Métricas Detalhadas", desc: "Dados granulares." },
];

const STEPS = [
  { n: "01", t: "Conecte a conta", d: "Cole o access token Meta Ads nas configurações." },
  { n: "02", t: "Sincronize dados", d: "O motor importa campanhas e métricas automaticamente." },
  { n: "03", t: "Analise performance", d: "Dashboards e gráficos atualizados em tempo real." },
  { n: "04", t: "Entregue relatórios", d: "Monte e envie relatórios profissionais em segundos." },
];

function Dashboard() {
  const { user } = useAuth();

  const { data: counts } = useQuery({
    queryKey: ["dash-counts"],
    queryFn: async () => {
      const [r, c, cl] = await Promise.all([
        supabase.from("reports").select("id", { count: "exact", head: true }),
        supabase.from("campaigns").select("id", { count: "exact", head: true }),
        supabase.from("clients").select("id", { count: "exact", head: true }),
      ]);
      return { reports: r.count ?? 0, campaigns: c.count ?? 0, clients: cl.count ?? 0 };
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-10">
      {/* Hero */}
      <motion.section
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="glass-panel relative overflow-hidden p-8 sm:p-10"
      >
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <Cpu className="absolute right-8 top-8 h-24 w-24 animate-pulse text-primary/10" />
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
          Ecossistema NC Performance
        </span>
        <h1 className="mt-4 font-display text-3xl font-bold sm:text-4xl">
          Bem-vindo ao <span className="text-gradient">Futuro da Gestão.</span>
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Suite completa de performance Meta Ads para o segmento automotivo. Extraia, analise e entregue em escala.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5">
          <Stat label="Relatórios" value={counts?.reports ?? 0} icon={FileText} />
          <Stat label="Campanhas" value={counts?.campaigns ?? 0} icon={Activity} />
          <Stat label="Clientes" value={counts?.clients ?? 0} icon={Layers} />
        </div>
      </motion.section>

      {/* Hub modules — 6 cards */}
      <section>
        <p className="label-mono mb-4 text-primary">Módulos principais</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_ITEMS.map((m, i) => (
            <motion.div
              key={m.to + m.title}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={m.to}
                className="glass-panel group relative block h-full overflow-hidden p-6 transition hover:border-primary/30 hover:scale-[1.01]"
              >
                <div className="flex items-center justify-between">
                  <m.icon className="h-6 w-6 text-primary" />
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${m.tagColor}`}>{m.tag}</span>
                </div>
                <h3 className="mt-5 font-display text-lg font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                <ArrowUpRight className="absolute right-5 bottom-5 h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Operation modules */}
      <section>
        <p className="label-mono mb-4 text-primary">Módulos de operação</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {OPS_ITEMS.map((m, i) => (
            <motion.div
              key={m.to + m.title}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                to={m.to}
                className="glass-panel group flex items-center gap-4 p-4 transition hover:border-primary/30"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
                  <m.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold">{m.title}</h4>
                  <p className="truncate text-xs text-muted-foreground">{m.desc}</p>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Operation guide */}
      <section className="glass-panel p-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="label-mono text-primary">Guia de operação</p>
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold">Operação em 4 passos</h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="bg-background/60 p-6">
              <div className="label-mono text-primary">{s.n}</div>
              <h4 className="mt-3 font-display text-base font-semibold">{s.t}</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

function Stat({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <div className="bg-background/60 p-5">
      <div className="flex items-center justify-between">
        <span className="label-mono text-muted-foreground">{label}</span>
        <Icon className="h-3.5 w-3.5 text-primary" />
      </div>
      <div className="mt-2 font-display text-3xl font-bold">{value}</div>
    </div>
  );
}
