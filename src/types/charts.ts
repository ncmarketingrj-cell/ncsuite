// src/types/charts.ts
// NC Performance Suite — Tipagem dos Gráficos Customizados

export type ChartType = 
  | "line"      // Linha (Tendência temporal)
  | "area"      // Área (Volume acumulado)
  | "bar"       // Barras Verticais (Comparativo)
  | "barh"      // Barras Horizontais (Rankings)
  | "pie"       // Pizza
  | "donut"     // Rosca (Distribuição)
  | "composed"  // Composto (ex: Investimento em Barras + CPL em Linha)
  | "scatter"   // Dispersão (Correlação de duas variáveis)
  | "funnel";   // Funil de Conversão (Impressões -> Cliques -> Leads)

export interface ChartConfig {
  id: string;
  user_id?: string | null;
  title: string;
  type: ChartType;
  metrics: string[]; // Ex: ["cost", "conversions", "cpl"]
  colors: Record<string, string>; // Ex: {"cost": "#6366f1", "conversions": "#06b6d4"}
  period: "7d" | "14d" | "30d" | "60d" | "custom";
  groupBy: "day" | "week" | "month";
  showComparison: boolean;
  context: "metricas" | "campanhas";
  targetId?: string | null; // Id opcional (ex: campanha ou conta específica)
  position: number;
  created_at?: string;
}

export interface MetricDefinition {
  key: string;
  label: string;
  type: "currency" | "number" | "percentage" | "float";
  color: string;
}

export const AVAILABLE_METRICS: MetricDefinition[] = [
  { key: "cost", label: "Investimento", type: "currency", color: "#6366f1" },
  { key: "conversions", label: "Resultados (Leads)", type: "number", color: "#8b5cf6" },
  { key: "cpl", label: "Custo por Lead (CPL)", type: "currency", color: "#ef4444" },
  { key: "ctr", label: "CTR (%)", type: "percentage", color: "#10b981" },
  { key: "clicks", label: "Cliques", type: "number", color: "#06b6d4" },
  { key: "impressions", label: "Impressões", type: "number", color: "#f59e0b" },
  { key: "reach", label: "Alcance", type: "number", color: "#ec4899" },
  { key: "cpc", label: "Custo por Clique (CPC)", type: "currency", color: "#3b82f6" },
  { key: "cpm", label: "CPM", type: "currency", color: "#84cc16" },
  { key: "frequency", label: "Frequência", type: "float", color: "#a855f7" }
];
