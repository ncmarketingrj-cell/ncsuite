import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, GitBranch, ArrowRight, Search, MoreHorizontal,
  Megaphone, Globe, MessageCircle, ShoppingCart, Target,
  Trash2, Copy, Edit3, TrendingUp, Map, Clock, CheckCircle2,
  PauseCircle, X, Pencil
} from "lucide-react";

export const Route = createFileRoute("/_app/funis")({
  component: FunisPage,
});

const MOCK_FUNNELS = [
  {
    id: "1",
    name: "Lançamento Corolla 2025",
    description: "Funil completo do anúncio ao Checkout com triagem por IA.",
    nodeCount: 4,
    edgeCount: 3,
    lastEdited: "Hoje às 19:54",
    status: "ativo",
    conversionRate: 12.4,
    stages: ["Anúncio", "Landing Page", "WhatsApp", "Checkout"],
    colors: ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"],
  },
  {
    id: "2",
    name: "Remarketing HR-V",
    description: "Leads frios que visitaram mas não converteram.",
    nodeCount: 3,
    edgeCount: 2,
    lastEdited: "Ontem",
    status: "rascunho",
    conversionRate: 6.8,
    stages: ["Meta Ads", "WhatsApp", "Captura de Lead"],
    colors: ["#3b82f6", "#10b981", "#f97316"],
  },
  {
    id: "3",
    name: "Captação de Leads — Agência",
    description: "Funil de prospecção B2B para novas concessionárias parceiras.",
    nodeCount: 5,
    edgeCount: 4,
    lastEdited: "3 dias atrás",
    status: "ativo",
    conversionRate: 18.2,
    stages: ["Anúncio", "Landing Page", "Email", "WhatsApp", "Checkout"],
    colors: ["#3b82f6", "#8b5cf6", "#0ea5e9", "#10b981", "#f59e0b"],
  },
];

const STATUS_CONFIG: Record<string, { label: string; classes: string; icon: any }> = {
  ativo:    { label: "Ativo",    classes: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
  rascunho: { label: "Rascunho", classes: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",       icon: Pencil },
  pausado:  { label: "Pausado",  classes: "bg-slate-500/10 text-slate-500 border-slate-500/20",                            icon: PauseCircle },
};

const STAGE_ICONS: Record<string, any> = {
  "Anúncio": Megaphone,
  "Landing Page": Globe,
  "WhatsApp": MessageCircle,
  "Checkout": ShoppingCart,
  "Meta Ads": Megaphone,
  "Captura de Lead": Target,
  "Email": Globe,
};

function FunisPage() {
  const [search, setSearch] = useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const nav = useNavigate();

  const filtered = MOCK_FUNNELS.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col min-h-full bg-background">

      {/* ── HEADER ── */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
              <GitBranch className="w-5 h-5 text-purple-500" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Meus Funis</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {MOCK_FUNNELS.length} funis criados · Clique para abrir no Mapa Mental
              </p>
            </div>
          </div>

          <Link
            to="/funnel-builder"
            className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Novo Funil
          </Link>
        </div>

        {/* Search */}
        <div className="mt-4 relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar funis..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-muted/40 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
      </div>

      {/* ── GRID ── */}
      <div className="px-6 py-6 flex-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <GitBranch className="w-7 h-7 text-muted-foreground" />
            </div>
            <p className="font-bold text-muted-foreground">Nenhum funil encontrado</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Crie seu primeiro funil para começar</p>
            <Link
              to="/funnel-builder"
              className="mt-5 flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              Criar Funil
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((funnel, i) => {
              const statusCfg = STATUS_CONFIG[funnel.status] || STATUS_CONFIG["rascunho"];
              const StatusIcon = statusCfg.icon;

              return (
                <motion.div
                  key={funnel.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="relative bg-card border border-border rounded-2xl overflow-hidden hover:border-border/80 hover:shadow-lg transition-all flex flex-col"
                >
                  {/* Color stripe */}
                  <div className="flex h-1.5">
                    {funnel.colors.map((c, idx) => (
                      <div key={idx} className="flex-1" style={{ background: c }} />
                    ))}
                  </div>

                  <div className="p-5 flex-1 flex flex-col">
                    {/* Title + status + menu */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCfg.classes}`}>
                            <StatusIcon className="w-2.5 h-2.5" />
                            {statusCfg.label}
                          </span>
                        </div>
                        <h3 className="font-black text-base text-foreground leading-snug">{funnel.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{funnel.description}</p>
                      </div>

                      {/* Context menu */}
                      <div className="relative flex-shrink-0">
                        <button
                          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === funnel.id ? null : funnel.id); }}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>

                        <AnimatePresence>
                          {openMenu === funnel.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                className="absolute right-0 top-8 z-20 w-40 bg-background border border-border rounded-xl shadow-xl overflow-hidden py-1"
                              >
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                  onClick={() => { nav({ to: "/funnel-builder" }); setOpenMenu(null); }}
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-muted-foreground" /> Abrir e editar
                                </button>
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <Copy className="w-3.5 h-3.5 text-muted-foreground" /> Duplicar
                                </button>
                                <div className="my-1 border-t border-border" />
                                <button
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                                  onClick={() => setOpenMenu(null)}
                                >
                                  <Trash2 className="w-3.5 h-3.5" /> Excluir
                                </button>
                              </motion.div>
                            </>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                    {/* Stage pipeline visual */}
                    <div className="flex items-center gap-1 mb-4 flex-wrap">
                      {funnel.stages.map((stage, idx) => {
                        const Icon = STAGE_ICONS[stage] || Globe;
                        const color = funnel.colors[idx];
                        return (
                          <div key={idx} className="flex items-center gap-1">
                            <div
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border"
                              style={{
                                background: `${color}12`,
                                borderColor: `${color}30`,
                                color,
                              }}
                            >
                              <Icon className="w-3 h-3" />
                              {stage}
                            </div>
                            {idx < funnel.stages.length - 1 && (
                              <ArrowRight className="w-2.5 h-2.5 text-muted-foreground/40 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between pt-3 border-t border-border/60 mt-auto">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Map className="w-3 h-3" />
                          {funnel.nodeCount} etapas
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {funnel.lastEdited}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-black">
                        <TrendingUp className="w-3 h-3" />
                        {funnel.conversionRate}% conv.
                      </div>
                    </div>
                  </div>

                  {/* Open CTA */}
                  <div
                    className="px-5 py-3 border-t border-border/60 bg-muted/20 flex items-center justify-between cursor-pointer hover:bg-muted/40 transition-colors"
                    onClick={() => nav({ to: "/funnel-builder" })}
                  >
                    <span className="text-xs font-bold text-foreground">Abrir no Mapa Mental</span>
                    <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-primary/10">
                      <ArrowRight className="w-3.5 h-3.5 text-primary" />
                    </div>
                  </div>
                </motion.div>
              );
            })}

            {/* Create new card */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: filtered.length * 0.06 }}
            >
              <Link
                to="/funnel-builder"
                className="flex flex-col items-center justify-center h-full min-h-[220px] rounded-2xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/[0.03] transition-all gap-4 p-6 text-center group"
              >
                <div className="w-14 h-14 rounded-2xl bg-muted group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <Plus className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <div>
                  <p className="text-sm font-black text-muted-foreground group-hover:text-foreground transition-colors">Criar Novo Funil</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Montar do zero no Mapa Mental</p>
                </div>
              </Link>
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}
