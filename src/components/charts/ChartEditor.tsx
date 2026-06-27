// src/components/charts/ChartEditor.tsx
// NC Performance Suite — Painel e Editor Interativo de Gráficos (Drag & Drop)

import React, { useState, useEffect } from "react";
import { useChartConfig } from "@/hooks/useChartConfig";
import { ChartConfig, ChartType, AVAILABLE_METRICS, MetricDefinition } from "@/types/charts";
import { ChartEngine } from "./ChartEngine";
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragEndEvent 
} from "@dnd-kit/core";
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy,
  useSortable 
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { 
  GripVertical, Trash2, Edit2, Plus, 
  ArrowLeft, ShieldAlert, Sparkles, 
  Eye, Save, LineChart, BarChart2, 
  PieChart, LayoutGrid, Sliders 
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface ChartEditorProps {
  context: "metricas" | "campanhas";
  backUrl: string;
  backLabel: string;
}

// Item ordenável na lista com DnD kit
interface SortableItemProps {
  chart: ChartConfig;
  isActive: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  canEdit: boolean;
}

const SortableChartItem: React.FC<SortableItemProps> = ({ 
  chart, 
  isActive, 
  onSelect, 
  onDelete,
  canEdit
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: chart.id, disabled: !canEdit });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 1,
  };

  const getChartIcon = (type: ChartType) => {
    switch (type) {
      case "bar":
      case "barh":
        return <BarChart2 className="h-4 w-4 text-blue-400" />;
      case "pie":
      case "donut":
        return <PieChart className="h-4 w-4 text-emerald-400" />;
      case "funnel":
        return <LayoutGrid className="h-4 w-4 text-amber-400" />;
      default:
        return <LineChart className="h-4 w-4 text-primary" />;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center justify-between gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer ${
        isActive 
          ? "bg-primary/10 border-primary shadow-glow/5" 
          : "bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10"
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-3 min-w-0">
        {canEdit && (
          <div 
            {...attributes} 
            {...listeners} 
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition p-1"
            title="Arraste para reordenar"
            onClick={(e) => e.stopPropagation()} // impede a seleção do card
          >
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <div className="flex items-center gap-2 min-w-0">
          {getChartIcon(chart.type)}
          <span className="text-xs font-semibold truncate text-foreground">{chart.title}</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition duration-150">
        {canEdit && (
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg border border-red-500/20 bg-red-500/5 text-red-400 hover:bg-red-500/10 transition"
            title="Excluir gráfico"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};

// Gerador de dados fictícios realistas para pré-visualização ao vivo
const generatePreviewData = () => {
  const data = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const dayStr = d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
    
    // Valores base
    const cost = Math.round(500 + Math.random() * 500);
    const conversions = Math.round(15 + Math.random() * 30);
    const clicks = Math.round(150 + Math.random() * 200);
    const impressions = clicks * 10;
    const reach = Math.round(impressions * 0.85);

    // Métricas calculadas
    const cpl = conversions > 0 ? Number((cost / conversions).toFixed(2)) : 0;
    const ctr = impressions > 0 ? Number(((clicks / impressions) * 100).toFixed(2)) : 0;
    const cpc = clicks > 0 ? Number((cost / clicks).toFixed(2)) : 0;
    const cpm = impressions > 0 ? Number(((cost / impressions) * 1000).toFixed(2)) : 0;
    const frequency = 1.1 + Math.random() * 0.4;

    data.push({
      day: dayStr,
      cost,
      conversions,
      cpl,
      ctr,
      clicks,
      impressions,
      reach,
      cpc,
      cpm,
      frequency
    });
  }
  return data;
};

const PREVIEW_DATA = generatePreviewData();

export const ChartEditor: React.FC<ChartEditorProps> = ({ context, backUrl, backLabel }) => {
  const { 
    configs, 
    isLoading, 
    saveChart, 
    isSaving, 
    deleteChart, 
    reorderCharts, 
    canEdit 
  } = useChartConfig(context);

  const [activeChart, setActiveChart] = useState<ChartConfig | null>(null);
  
  // Estados do formulário de edição/criação
  const [title, setTitle] = useState("");
  const [type, setType] = useState<ChartType>("line");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [metricColors, setMetricColors] = useState<Record<string, string>>({});
  const [period, setPeriod] = useState<ChartConfig["period"]>("30d");
  const [groupBy, setGroupBy] = useState<ChartConfig["groupBy"]>("day");

  // Configurar sensores do DnD Kit
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Inicializa a seleção ao carregar os dados
  useEffect(() => {
    if (configs.length > 0 && !activeChart) {
      handleSelectChart(configs[0]);
    }
  }, [configs]);

  const handleSelectChart = (chart: ChartConfig) => {
    setActiveChart(chart);
    setTitle(chart.title);
    setType(chart.type);
    setSelectedMetrics(chart.metrics);
    setMetricColors(chart.colors || {});
    setPeriod(chart.period || "30d");
    setGroupBy(chart.groupBy || "day");
  };

  const handleCreateNew = () => {
    const tempId = `temp-${Date.now()}`;
    const newChart: ChartConfig = {
      id: tempId,
      title: "Novo Gráfico Personalizado",
      type: "line",
      metrics: ["cost"],
      colors: { cost: "#6366f1" },
      period: "30d",
      groupBy: "day",
      showComparison: false,
      context,
      position: configs.length,
    };
    handleSelectChart(newChart);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = configs.findIndex((c) => c.id === active.id);
    const newIndex = configs.findIndex((c) => c.id === over.id);

    const reordered = arrayMove(configs, oldIndex, newIndex);
    const orderedIds = reordered.map((c) => c.id);
    
    // Atualiza no banco de dados
    reorderCharts(orderedIds);
  };

  const handleDelete = (chartId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Tem certeza que deseja excluir permanentemente este gráfico?")) return;
    
    deleteChart(chartId);
    if (activeChart?.id === chartId) {
      setActiveChart(null);
    }
  };

  const handleToggleMetric = (metricKey: string, defaultColor: string) => {
    let nextMetrics = [...selectedMetrics];
    const colors = { ...metricColors };

    if (nextMetrics.includes(metricKey)) {
      // Impede desmarcar tudo
      if (nextMetrics.length === 1) {
        toast.warning("Selecione pelo menos uma métrica para o gráfico.");
        return;
      }
      nextMetrics = nextMetrics.filter((m) => m !== metricKey);
      delete colors[metricKey];
    } else {
      // Limita a quantidade de métricas em gráficos de pizza e rosca para não quebrar o layout
      if ((type === "pie" || type === "donut") && nextMetrics.length >= 5) {
        toast.warning("Gráficos de distribuição suportam no máximo 5 métricas simulâneas.");
        return;
      }
      nextMetrics.push(metricKey);
      colors[metricKey] = defaultColor;
    }

    setSelectedMetrics(nextMetrics);
    setMetricColors(colors);
  };

  const handleColorChange = (metricKey: string, color: string) => {
    setMetricColors({
      ...metricColors,
      [metricKey]: color
    });
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Por favor, dê um título para o seu gráfico.");
      return;
    }

    if (selectedMetrics.length === 0) {
      toast.error("Selecione pelo menos uma métrica.");
      return;
    }

    const payload = {
      id: activeChart?.id,
      title,
      type,
      metrics: selectedMetrics,
      colors: metricColors,
      period,
      groupBy,
      showComparison: false,
      context,
      position: activeChart?.position ?? configs.length,
    };

    try {
      const saved = await saveChart(payload);
      if (saved) {
        handleSelectChart(saved as ChartConfig);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Objeto de pré-visualização reativo instantâneo
  const previewConfig: ChartConfig = {
    id: activeChart?.id || "preview",
    title,
    type,
    metrics: selectedMetrics,
    colors: metricColors,
    period,
    groupBy,
    showComparison: false,
    context,
    position: 0
  };

  return (
    <div className="space-y-6">
      {/* Topo / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/5 pb-4">
        <div className="flex items-center gap-3">
          <Link
            to={backUrl as any}
            search={{ view: "analise" } as any}
            className="p-2 rounded-full border border-white/10 hover:border-primary/30 bg-background/50 text-muted-foreground hover:text-primary transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h3 className="header-sport font-display text-lg font-semibold text-gradient flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary animate-pulse" />
              Editor de Painel de Gráficos
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              Personalize o layout, tipos e métricas de gráficos para a seção de {context === "metricas" ? "Métricas Globais" : "Campanhas"}.
            </p>
          </div>
        </div>
      </div>

      {/* Proteção Visual do Frontend se não for Admin no contexto de Métricas */}
      {!canEdit && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <p className="font-bold text-red-400 uppercase tracking-wider">Acesso Restrito a Administradores</p>
            <p className="text-muted-foreground">
              Você está na seção de **Métricas Globais**. Apenas Administradores do sistema possuem permissão para criar, reordenar ou editar as métricas do painel executivo da agência. Você pode visualizar as opções, mas a opção de salvamento está bloqueada.
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-24">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-12 items-start">
          
          {/* Coluna Esquerda: Listagem e Reordenação (4 cols) */}
          <div className="md:col-span-4 space-y-4">
            <div className="rounded-xl border border-white/5 bg-background/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black tracking-widest text-muted-foreground/60 uppercase">SEUS GRÁFICOS</span>
                {canEdit && (
                  <button
                    onClick={handleCreateNew}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-primary hover:shadow-glow px-2 py-1 rounded bg-primary/10 border border-primary/20 transition"
                  >
                    <Plus className="h-3 w-3" /> NOVO GRÁFICO
                  </button>
                )}
              </div>

              {configs.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  Nenhum gráfico cadastrado. Clique em Novo para iniciar.
                </div>
              ) : (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <SortableContext
                    items={configs.map((c) => c.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {configs.map((chart) => (
                        <SortableChartItem
                          key={chart.id}
                          chart={chart}
                          isActive={activeChart?.id === chart.id}
                          onSelect={() => handleSelectChart(chart)}
                          onDelete={(e) => handleDelete(chart.id, e)}
                          canEdit={canEdit}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}
            </div>
            
            {/* Box explicativo */}
            <div className="rounded-xl border border-white/5 bg-background/20 p-4 text-[10px] text-muted-foreground/60 space-y-1.5">
              <p className="font-bold text-muted-foreground">💡 Dica de Layout:</p>
              <p>Arrastar os cards à esquerda reordena a sequência de exibição dos gráficos automaticamente no Dashboard.</p>
              <p>• Use **Barras / Composed** para investimentos e metas.</p>
              <p>• Use **Área / Linhas** para tendências diárias de CPL/Leads.</p>
              <p>• Use **Funil / Pizza** para distribuições e conversão de cliques.</p>
            </div>
          </div>

          {/* Coluna Direita: Formulário de Configuração e Visualização (8 cols) */}
          <div className="md:col-span-8 space-y-6">
            {activeChart ? (
              <div className="space-y-6">
                
                {/* 1. Box de Visualização ao Vivo */}
                <div className="rounded-xl border border-primary/10 bg-background/35 p-5 space-y-3 relative overflow-hidden">
                  <div className="absolute top-0 right-0 rounded-bl-lg bg-primary/10 border-l border-b border-primary/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-primary flex items-center gap-1">
                    <Eye className="h-2.5 w-2.5" /> Pré-Visualização Dinâmica
                  </div>
                  
                  <div className="flex flex-col gap-1">
                    <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      {title || "Sem título"}
                    </h4>
                    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-widest font-mono">
                      Período padrão: {period} • Agrupamento: {groupBy === "day" ? "Diário" : groupBy === "week" ? "Semanal" : "Mensal"}
                    </span>
                  </div>

                  <div className="pt-2">
                    <ChartEngine config={previewConfig} data={PREVIEW_DATA} height={200} />
                  </div>
                </div>

                {/* 2. Formulário de Configurações */}
                <div className="rounded-xl border border-white/5 bg-background/30 p-5 space-y-4">
                  <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
                    <Sliders className="h-4 w-4 text-primary" />
                    <span className="text-[11px] font-black tracking-widest text-muted-foreground/75 uppercase">Opções de Customização</span>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Título do Gráfico */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground/60 uppercase">Nome do Gráfico</label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: Custo por Lead (CPL)"
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      />
                    </div>

                    {/* Tipo do Gráfico */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground/60 uppercase">Tipo Visual</label>
                      <select
                        value={type}
                        onChange={(e) => {
                          const newType = e.target.value as ChartType;
                          setType(newType);
                          // Garante compatibilidade de limites de métricas em Pizza/Rosca
                          if ((newType === "pie" || newType === "donut") && selectedMetrics.length > 5) {
                            setSelectedMetrics(selectedMetrics.slice(0, 5));
                          }
                        }}
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      >
                        <option value="line" className="bg-background text-foreground">Linhas (Tendência Temporal)</option>
                        <option value="area" className="bg-background text-foreground">Área Gradiente (Volume)</option>
                        <option value="bar" className="bg-background text-foreground">Barras Verticais (Comparativo)</option>
                        <option value="composed" className="bg-background text-foreground">Misto (Barras + Linha)</option>
                        <option value="pie" className="bg-background text-foreground">Pizza (Distribuição Proporcional)</option>
                        <option value="donut" className="bg-background text-foreground">Rosca (Anel Proporcional)</option>
                        <option value="funnel" className="bg-background text-foreground">Funil de Vendas (Conversão Sequencial)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Período Padrão */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground/60 uppercase">Período de Análise</label>
                      <select
                        value={period}
                        onChange={(e) => setPeriod(e.target.value as any)}
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      >
                        <option value="7d" className="bg-background">Últimos 7 dias</option>
                        <option value="14d" className="bg-background">Últimos 14 dias</option>
                        <option value="30d" className="bg-background">Últimos 30 dias</option>
                        <option value="60d" className="bg-background">Últimos 60 dias</option>
                      </select>
                    </div>

                    {/* Agrupamento */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-muted-foreground/60 uppercase">Agrupamento Temporal</label>
                      <select
                        value={groupBy}
                        onChange={(e) => setGroupBy(e.target.value as any)}
                        disabled={!canEdit}
                        className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-xs focus:border-primary focus:outline-none"
                      >
                        <option value="day" className="bg-background">Agrupamento por Dia</option>
                        <option value="week" className="bg-background">Agrupamento por Semana</option>
                        <option value="month" className="bg-background">Agrupamento por Mês</option>
                      </select>
                    </div>
                  </div>

                  {/* 3. Seleção de Métricas e Cores Neon */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-muted-foreground/60 uppercase">
                      Escolha as Métricas e Cores do Gráfico
                    </label>
                    
                    <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                      {AVAILABLE_METRICS.map((metric) => {
                        const isSelected = selectedMetrics.includes(metric.key);
                        const currentColor = metricColors[metric.key] || metric.color;
                        
                        return (
                          <div 
                            key={metric.key} 
                            className={`flex flex-col gap-1.5 p-2 rounded-lg border transition duration-200 ${
                              isSelected 
                                ? "bg-white/[0.03] border-white/10" 
                                : "bg-white/[0.01] border-white/5 opacity-55 hover:opacity-85"
                            }`}
                          >
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-foreground min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleMetric(metric.key, metric.color)}
                                disabled={!canEdit}
                                className="accent-primary h-3.5 w-3.5 rounded border-white/20 bg-background"
                              />
                              <span className="truncate">{metric.label}</span>
                            </label>
                            
                            {isSelected && (
                              <div className="flex items-center gap-1.5 border-t border-white/5 pt-1.5">
                                <span className="text-[9px] text-muted-foreground/60">Cor:</span>
                                <input
                                  type="color"
                                  value={currentColor}
                                  onChange={(e) => handleColorChange(metric.key, e.target.value)}
                                  disabled={!canEdit}
                                  className="h-5 w-8 rounded border border-white/10 bg-transparent p-0 cursor-pointer"
                                />
                                <span className="font-mono text-[9px] text-muted-foreground">{currentColor.toUpperCase()}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Botão de Ação */}
                  {canEdit && (
                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-xs font-black text-primary-foreground hover:shadow-glow transition"
                      >
                        <Save className="h-3.5 w-3.5" /> 
                        {isSaving ? "SALVANDO..." : "SALVAR ALTERAÇÕES"}
                      </button>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl bg-background/10">
                Selecione um gráfico na lista à esquerda ou crie um novo para começar.
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
export default ChartEditor;
