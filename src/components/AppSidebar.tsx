import { Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  LayoutDashboard, FileText, Upload, BarChart3, Settings, Briefcase,
  Activity, Palette, Link2, HelpCircle, Megaphone, LineChart, Zap, Layers,
  Bot, ChevronRight, Globe, Sparkles, Cpu, Target
} from "lucide-react";
import { Logo } from "@/components/Logo";

type SidebarItem = {
  to: string;
  icon: any;
  label: string;
  highlight?: boolean;
};

type SidebarGroup = {
  id: string;
  label: string;
  icon: any;
  items: SidebarItem[];
};

const GROUPS: SidebarGroup[] = [
  {
    id: "performance",
    label: "Performance Hub",
    icon: BarChart3,
    items: [
      { to: "/multicanal", icon: BarChart3, label: "Dashboard Métricas" },
      { to: "/upload", icon: Upload, label: "Extração de Dados", highlight: true },
      { to: "/relatorios", icon: FileText, label: "Relatórios", highlight: true },
      { to: "/metricas", icon: LineChart, label: "Controle KPIs" },
    ],
  },
  {
    id: "operacao",
    label: "Operação Meta",
    icon: Target,
    items: [
      { to: "/campanhas", icon: Megaphone, label: "Campanhas" },
      { to: "/contas", icon: Briefcase, label: "Contas de Anúncio" },
      { to: "/portfolios", icon: Layers, label: "Portfólios", highlight: true },
      { to: "/automacoes", icon: Zap, label: "Automações", highlight: true },
    ],
  },
  {
    id: "lab",
    label: "Lab de Conversão",
    icon: Sparkles,
    items: [
      { to: "/criativos", icon: Palette, label: "Análise Criativos" },
      { to: "/organizador", icon: Link2, label: "Link Pages" },
      { to: "/quiz", icon: HelpCircle, label: "Quizzes Interativos" },
      { to: "/utms", icon: Megaphone, label: "UTM Builder" },
    ],
  },
];

export function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [hoveredGroup, setHoveredGroup] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<string | null>(null);

  return (
    <aside className="sticky top-0 hidden h-screen shrink-0 flex md:flex z-50">
      {/* Slim Bar (Level 1) */}
      <div className="w-[72px] h-full flex flex-col items-center border-r border-white/5 bg-sidebar py-6 gap-8">
        <Logo size={32} />
        
        <nav className="flex-1 flex flex-col items-center gap-4">
          <Link
            to="/dashboard"
            className={`p-3 rounded-xl transition-all relative group ${path === "/dashboard" ? "bg-primary/20 text-primary shadow-glow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-white/5"}`}
            onMouseEnter={() => setHoveredGroup(null)}
          >
            <LayoutDashboard className="h-5 w-5" />
            <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              DASHBOARD
            </span>
          </Link>

          <div className="w-8 h-px bg-white/5 my-2" />

          {GROUPS.map((group) => {
            const isGroupActive = group.items.some(it => path.startsWith(it.to)) || activeGroup === group.id;
            return (
              <button
                key={group.id}
                onMouseEnter={() => { setHoveredGroup(group.id); setActiveGroup(group.id); }}
                className={`p-3 rounded-xl transition-all relative group ${isGroupActive ? "bg-secondary/20 text-secondary shadow-glow-sm ring-1 ring-secondary/20" : "text-muted-foreground hover:bg-white/5"}`}
              >
                <group.icon className="h-5 w-5" />
                <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 uppercase tracking-widest">
                  {group.label}
                </span>
              </button>
            );
          })}
          
          <Link
            to="/agente"
            className={`p-3 rounded-xl transition-all relative group mt-auto ${path === "/agente" ? "bg-primary/20 text-primary shadow-glow-sm ring-1 ring-primary/20" : "text-muted-foreground hover:bg-white/5"}`}
            onMouseEnter={() => setHoveredGroup(null)}
          >
            <Bot className="h-5 w-5" />
            <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              AGENTE IA
            </span>
          </Link>

          <Link
            to="/config"
            className={`p-3 rounded-xl transition-all relative group ${path === "/config" ? "bg-white/10 text-foreground shadow-glow-sm ring-1 ring-white/10" : "text-muted-foreground hover:bg-white/5"}`}
            onMouseEnter={() => setHoveredGroup(null)}
          >
            <Settings className="h-5 w-5" />
            <span className="absolute left-full ml-4 px-2 py-1 rounded bg-popover text-popover-foreground text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
              CONFIGURAÇÕES
            </span>
          </Link>
        </nav>
      </div>

      {/* Flyout Panel (Level 2) */}
      <AnimatePresence>
        {activeGroup && (
          <motion.div
            initial={{ width: 0, opacity: 0, x: -10 }}
            animate={{ width: 240, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -10 }}
            onMouseLeave={() => setActiveGroup(null)}
            className="h-full border-r border-white/5 bg-sidebar/80 backdrop-blur-3xl flex flex-col overflow-hidden"
          >
            <div className="p-6">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50 mb-6">
                {GROUPS.find(g => g.id === activeGroup)?.label}
              </h3>
              
              <ul className="space-y-1">
                {GROUPS.find(g => g.id === activeGroup)?.items.map((it) => {
                  const active = path === it.to;
                  return (
                    <li key={it.to}>
                      <Link
                        to={it.to}
                        onClick={() => setActiveGroup(null)}
                        className={`group flex items-center gap-3 rounded-xl px-4 py-2.5 text-xs font-bold transition-all ${active ? "bg-white/5 text-primary" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground"}`}
                      >
                        <it.icon className={`h-3.5 w-3.5 transition-transform group-hover:scale-110 ${active ? "text-primary" : ""}`} />
                        <span className="flex-1">{it.label}</span>
                        {active ? (
                          <ChevronRight className="h-3 w-3" />
                        ) : it.highlight && (
                          <span className="h-1 w-1 rounded-full bg-primary animate-pulse" />
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-auto p-4 border-t border-white/5 bg-white/[0.02]">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-background/50 border border-white/5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center ring-1 ring-white/10">
                   <Cpu className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1 leading-none">
                  <p className="truncate text-[10px] font-black uppercase tracking-widest">Aura v2.0</p>
                  <p className="text-[9px] text-muted-foreground font-bold mt-1">Status: Online</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </aside>
  );
}
