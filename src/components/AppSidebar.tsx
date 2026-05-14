import { Link, useRouterState } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, BarChart3, Settings, Briefcase,
} from "lucide-react";
import { Logo } from "@/components/Logo";

const GROUPS = [
  {
    label: "Geral",
    items: [{ to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" }],
  },
  {
    label: "Performance",
    items: [
      { to: "/relatorios", icon: FileText, label: "Relatórios", highlight: true },
      { to: "/upload", icon: Upload, label: "Extração de Dados", highlight: true },
    ],
  },
  {
    label: "Sistema",
    items: [
      { to: "/config", icon: Settings, label: "Configurações" },
    ],
  },
] as const;

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/5 bg-sidebar md:flex">
      <div className="flex h-14 items-center border-b border-white/5 px-5">
        <Logo size={30} />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-6 custom-scrollbar">
        {GROUPS.map((g) => (
          <div key={g.label}>
            <p className="label-mono mb-2 px-3 text-muted-foreground/60">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = path.startsWith(it.to);
                const highlight = "highlight" in it && it.highlight;
                return (
                  <li key={it.to}>
                    <Link
                      to={it.to}
                      className="group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-white/[0.03] hover:text-foreground"
                    >
                      {active && (
                        <motion.span
                          layoutId="sidebar-active"
                          className="absolute -left-3 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-primary to-secondary"
                        />
                      )}
                      <it.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                      <span className={active ? "text-foreground" : ""}>{it.label}</span>
                      {highlight && !active && (
                        <span className="ml-auto h-1.5 w-1.5 animate-pulse-dot rounded-full bg-primary" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-4">
        <div className="glass-panel flex items-center gap-2 p-3">
          <Briefcase className="h-4 w-4 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium">NC AGÊNCIA</p>
            <p className="label-mono text-muted-foreground">workspace</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
