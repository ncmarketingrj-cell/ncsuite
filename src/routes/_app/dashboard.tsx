import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  Upload, FileText, BarChart3, Settings, ArrowUpRight, Activity,
  Sparkles, Layers,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — NC Performance Suite" }] }),
  component: Dashboard,
});

const MODULES = [
  { to: "/upload", icon: Upload, title: "Extrair dados", desc: "Suba um print do gerenciador.", color: "from-primary/20 to-primary/5" },
  { to: "/relatorios", icon: FileText, title: "Relatórios", desc: "Gere e gerencie entregas.", color: "from-secondary/20 to-secondary/5" },
  { to: "/relatorios", icon: BarChart3, title: "Performance", desc: "Visão consolidada.", color: "from-accent/20 to-accent/5" },
  { to: "/config", icon: Settings, title: "Configurações", desc: "Time, integrações, sistema.", color: "from-muted/40 to-muted/10" },
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
        <p className="label-mono text-primary">Hub central</p>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
          Bem-vindo de volta, <span className="text-gradient">{user?.email?.split("@")[0]}</span>.
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Tudo pronto para operar. Comece pela extração ou abra um relatório.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5">
          <Stat label="Relatórios" value={counts?.reports ?? 0} icon={FileText} />
          <Stat label="Campanhas" value={counts?.campaigns ?? 0} icon={Activity} />
          <Stat label="Clientes" value={counts?.clients ?? 0} icon={Layers} />
        </div>
      </motion.section>

      {/* Modules grid */}
      <section>
        <p className="label-mono mb-4 text-primary">Módulos</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m, i) => (
            <motion.div
              key={m.to}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link
                to={m.to}
                className={`glass-panel group relative block h-full overflow-hidden bg-gradient-to-br ${m.color} p-6 transition hover:border-primary/30`}
              >
                <m.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-6 font-display text-lg font-semibold">{m.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{m.desc}</p>
                <ArrowUpRight className="absolute right-5 top-5 h-4 w-4 text-muted-foreground transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Operation guide */}
      <section className="glass-panel p-8">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <p className="label-mono text-primary">Guia rápido</p>
        </div>
        <h2 className="mt-2 font-display text-2xl font-semibold">Operação em 3 passos</h2>
        <ol className="mt-6 grid gap-px overflow-hidden rounded-xl border border-white/5 bg-white/5 sm:grid-cols-3">
          <Step n="01" t="Extrair print" d="Abra Upload e envie a captura do gerenciador. O motor extrai campanhas em segundos." />
          <Step n="02" t="Montar relatório" d="O ReportBuilder abre automaticamente. Arraste campanhas, escolha um formato e revise." />
          <Step n="03" t="Entregar" d="Copie o markdown ou salve no histórico. A próxima entrega leva metade do tempo." />
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

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="bg-background/60 p-6">
      <div className="label-mono text-primary">{n}</div>
      <h4 className="mt-3 font-display text-base font-semibold">{t}</h4>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{d}</p>
    </div>
  );
}
