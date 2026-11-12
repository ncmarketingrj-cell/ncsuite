// ──────────────────────────────────────────────────────────────────────────────
// MindMapManagerModal.tsx — Central de Gestão Completa de Mapas Mentais
// ──────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Plus, Trash2, Copy, Edit3, Search, Calendar, Folder,
  Check, X, Sparkles, ChevronRight, LayoutTemplate, Layers, GitBranch,
} from "lucide-react";
import { toast } from "sonner";
import { type MindMapRecord, duplicateMindMap, renameMindMap, deleteMindMap } from "./mindMapService";
import { MIND_MAP_TEMPLATES, type MindMapTemplate } from "./mindMapTemplates";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  maps: MindMapRecord[];
  activeMapId: string | null;
  onSelectMap: (mapId: string) => void;
  onCreateNew: (title: string, template?: MindMapTemplate | null) => void;
  onRefreshList: () => void;
}

export function MindMapManagerModal({
  isOpen,
  onClose,
  maps,
  activeMapId,
  onSelectMap,
  onCreateNew,
  onRefreshList,
}: Props) {
  const [tab, setTab] = useState<"meus_mapas" | "templates">("meus_mapas");
  const [search, setSearch] = useState("");
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [newTitleValue, setNewTitleValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const filteredMaps = maps.filter((m) =>
    (m.title || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleStartRename = (map: MindMapRecord) => {
    setEditingTitleId(map.id);
    setNewTitleValue(map.title);
  };

  const handleConfirmRename = async (mapId: string) => {
    if (!newTitleValue.trim()) return;
    setIsProcessing(true);
    const ok = await renameMindMap(mapId, newTitleValue.trim());
    setIsProcessing(false);
    if (ok) {
      toast.success("Mapa renomeado com sucesso!");
      setEditingTitleId(null);
      onRefreshList();
    } else {
      toast.error("Falha ao renomear mapa.");
    }
  };

  const handleDuplicate = async (map: MindMapRecord) => {
    setIsProcessing(true);
    toast.info("Duplicando mapa...");
    const duplicated = await duplicateMindMap(map);
    setIsProcessing(false);
    if (duplicated) {
      toast.success("Mapa duplicado com sucesso!");
      onRefreshList();
      onSelectMap(duplicated.id);
      onClose();
    } else {
      toast.error("Falha ao duplicar mapa.");
    }
  };

  const handleDelete = async (map: MindMapRecord) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir permanentemente o mapa mental "${map.title}"?\n\nEsta ação apagará todos os nós e tópicos deste mapa.`
      )
    ) {
      return;
    }

    setIsProcessing(true);
    const ok = await deleteMindMap(map.id);
    setIsProcessing(false);
    if (ok) {
      toast.success("Mapa mental excluído.");
      onRefreshList();
    } else {
      toast.error("Erro ao excluir mapa.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="glass-panel w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl border border-white/15 overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-glow-sm">
              <Brain className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-foreground">
                Central de Mapas Mentais
              </h3>
              <p className="text-xs text-muted-foreground">
                Gerencie, renomeie, duplique ou crie novas estratégias a partir de modelos profissionais.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground transition"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Abas e Barra de Ações Rápidas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-3 border-b border-white/5 bg-black/20">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab("meus_mapas")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                tab === "meus_mapas"
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <Folder className="h-3.5 w-3.5" />
              <span>Meus Mapas ({maps.length})</span>
            </button>

            <button
              onClick={() => setTab("templates")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
                tab === "templates"
                  ? "bg-primary text-primary-foreground shadow-glow-sm"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-foreground"
              }`}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              <span>Modelos Estratégicos ({MIND_MAP_TEMPLATES.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {tab === "meus_mapas" && (
              <div className="relative w-full sm:w-56">
                <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Pesquisar mapas..."
                  className="w-full rounded-xl border border-white/10 bg-background/50 pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-primary"
                />
              </div>
            )}

            <button
              onClick={() => {
                onCreateNew("Novo Mapa Mental", null);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-1.5 text-xs font-bold uppercase tracking-wider text-primary-foreground shadow-glow hover:shadow-glow-lg transition active:scale-95 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Mapa em Branco</span>
            </button>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {tab === "meus_mapas" && (
            <div className="space-y-4">
              {filteredMaps.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center space-y-3">
                  <Brain className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                  <p className="text-sm font-bold text-foreground">Nenhum mapa encontrado</p>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                    Crie um novo mapa mental em branco ou selecione um modelo pronto na aba "Modelos Estratégicos".
                  </p>
                  <button
                    onClick={() => {
                      onCreateNew("Novo Mapa Mental", null);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:shadow-glow-lg transition"
                  >
                    <Plus className="h-3.5 w-3.5" /> Criar Primeiro Mapa
                  </button>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                  {filteredMaps.map((map) => {
                    const isActive = map.id === activeMapId;
                    const isRenaming = editingTitleId === map.id;

                    return (
                      <div
                        key={map.id}
                        onClick={() => {
                          if (!isRenaming) {
                            onSelectMap(map.id);
                            onClose();
                          }
                        }}
                        className={`group relative rounded-2xl border p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between space-y-3 ${
                          isActive
                            ? "border-primary/50 bg-gradient-to-b from-primary/10 to-background shadow-lg shadow-primary/5"
                            : "border-white/10 bg-background/50 hover:border-white/20 hover:bg-white/[0.04]"
                        }`}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-muted-foreground">
                              {map.layout === "radial" ? <Layers className="h-2.5 w-2.5" /> : <GitBranch className="h-2.5 w-2.5" />}
                              {map.layout || "radial"}
                            </span>

                            {isActive && (
                              <span className="rounded-full bg-primary/20 text-primary border border-primary/30 px-2 py-0.5 text-[9px] font-black uppercase">
                                Ativo
                              </span>
                            )}
                          </div>

                          {/* Título do Mapa com Edição Inline */}
                          {isRenaming ? (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="flex items-center gap-1"
                            >
                              <input
                                autoFocus
                                value={newTitleValue}
                                onChange={(e) => setNewTitleValue(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleConfirmRename(map.id);
                                  if (e.key === "Escape") setEditingTitleId(null);
                                }}
                                className="flex-1 rounded-lg border border-primary bg-background px-2 py-1 text-xs font-bold text-foreground outline-none"
                              />
                              <button
                                onClick={() => handleConfirmRename(map.id)}
                                className="p-1 rounded bg-primary text-primary-foreground"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition line-clamp-2">
                              {map.title}
                            </h4>
                          )}

                          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {map.updated_at ? new Date(map.updated_at).toLocaleDateString("pt-BR") : "Recente"}
                            {map.node_count ? ` • ${map.node_count} tópicos` : ""}
                          </p>
                        </div>

                        {/* Barra de Ações */}
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center justify-between border-t border-white/5 pt-2"
                        >
                          <span className="text-[9px] font-bold text-primary group-hover:underline flex items-center gap-0.5">
                            Abrir no Canvas <ChevronRight className="h-2.5 w-2.5" />
                          </span>

                          <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                            <button
                              onClick={() => handleStartRename(map)}
                              title="Renomear mapa"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDuplicate(map)}
                              title="Duplicar mapa"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10 transition"
                            >
                              <Copy className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => handleDelete(map)}
                              title="Excluir mapa"
                              className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Aba de Templates Estratégicos */}
          {tab === "templates" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 flex items-center gap-2.5 text-xs text-foreground">
                <Sparkles className="h-4 w-4 text-primary shrink-0" />
                <p>
                  Escolha um dos modelos validados para inicializar seu mapa mental estratégico com ramificações estruturadas e cores harmoniosas no estilo MindMeister.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {MIND_MAP_TEMPLATES.map((tmpl) => (
                  <div
                    key={tmpl.id}
                    className="rounded-2xl border border-white/10 bg-background/50 hover:border-primary/40 hover:bg-white/[0.03] p-4 transition duration-200 flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-2xl">{tmpl.rootEmoji}</span>
                        <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                          {tmpl.category}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-foreground">
                        {tmpl.title}
                      </h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {tmpl.description}
                      </p>
                      <p className="text-[10px] text-primary/80 font-mono">
                        {tmpl.nodes.length} nós pré-estruturados
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        onCreateNew(tmpl.title, tmpl);
                        onClose();
                      }}
                      className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/10 hover:bg-primary hover:border-primary hover:text-primary-foreground py-2 text-xs font-bold uppercase tracking-wider transition"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>Usar Este Modelo</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
