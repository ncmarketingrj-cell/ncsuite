// src/components/charts/ChartEngine.tsx
// NC Performance Suite — Motor de Gráficos Recharts Dinâmico e Premium

import React from "react";
import {
  ResponsiveContainer,
  AreaChart, Area,
  LineChart, Line,
  BarChart, Bar,
  ComposedChart,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
import { ChartConfig, AVAILABLE_METRICS, ChartType } from "@/types/charts";

interface ChartEngineProps {
  config: ChartConfig;
  data: any[];
  height?: number | string;
}

// Utilitários de formatação de valores
const formatCurrency = (val: number) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(val);
};

const formatNumber = (val: number) => {
  return new Intl.NumberFormat("pt-BR").format(val);
};

const formatPercent = (val: number) => {
  return `${val.toFixed(2).replace(".", ",")}%`;
};

const formatValue = (value: number, key: string) => {
  const metric = AVAILABLE_METRICS.find(m => m.key === key);
  if (!metric) return formatNumber(value);

  switch (metric.type) {
    case "currency":
      return formatCurrency(value);
    case "percentage":
      return formatPercent(value);
    case "float":
      return value.toFixed(2).replace(".", ",");
    default:
      return formatNumber(value);
  }
};

const getMetricLabel = (key: string) => {
  return AVAILABLE_METRICS.find(m => m.key === key)?.label || key;
};

// Tooltip customizado premium
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-background/90 px-3 py-2.5 text-xs shadow-2xl backdrop-blur-md space-y-1">
        <p className="font-mono text-[10px] text-muted-foreground font-semibold uppercase">{label}</p>
        <div className="space-y-1 pt-1 border-t border-white/5">
          {payload.map((item: any, idx: number) => (
            <div key={idx} className="flex items-center justify-between gap-6">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color || item.fill }} />
                {getMetricLabel(item.name || item.dataKey)}
              </span>
              <span className="font-mono font-bold text-foreground">
                {formatValue(item.value, item.name || item.dataKey)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return null;
};

export const ChartEngine: React.FC<ChartEngineProps> = ({ config, data, height = 320 }) => {
  const { type, metrics, colors } = config;

  if (!data || data.length === 0) {
    return (
      <div style={{ height }} className="flex flex-col items-center justify-center text-xs text-muted-foreground border border-dashed border-white/10 rounded-xl bg-background/20">
        Nenhum dado disponível para o período selecionado.
      </div>
    );
  }

  // Se o tipo for Pizza ou Rosca (Pie/Donut), precisamos reestruturar os dados de série temporal
  // para dados de distribuição, somando o total acumulado de cada métrica
  if (type === "pie" || type === "donut") {
    const pieData = metrics.map(metricKey => {
      const total = data.reduce((acc, curr) => acc + (Number(curr[metricKey]) || 0), 0);
      return {
        name: metricKey,
        value: total,
        color: colors[metricKey] || "#6366f1"
      };
    });

    const isDonut = type === "donut";

    return (
      <div style={{ height }} className="w-full flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={isDonut ? 60 : 0}
              outerRadius={85}
              paddingAngle={isDonut ? 4 : 0}
              dataKey="value"
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              formatter={(value) => <span className="text-xs text-muted-foreground">{getMetricLabel(value)}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  }

  // Se for gráfico de Funil
  if (type === "funnel") {
    // Organiza as métricas por ordem decrescente (ex: Impressões -> Cliques -> Leads)
    // para formar a imagem visual do funil
    const funnelData = metrics.map((metricKey) => {
      const total = data.reduce((acc, curr) => acc + (Number(curr[metricKey]) || 0), 0);
      return {
        name: metricKey,
        value: total,
        color: colors[metricKey] || "#6366f1"
      };
    }).sort((a, b) => b.value - a.value); // Ordena decrescente

    return (
      <div style={{ height }} className="w-full flex flex-col justify-center">
        <div className="flex-1 flex flex-col justify-around py-3">
          {funnelData.map((item, idx) => {
            const maxValue = funnelData[0]?.value || 1;
            const percentage = (item.value / maxValue) * 100;
            return (
              <div key={idx} className="space-y-1 px-4">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                    {getMetricLabel(item.name)}
                  </span>
                  <span className="font-mono font-bold text-foreground">
                    {formatValue(item.value, item.name)}
                  </span>
                </div>
                <div className="h-3 w-full bg-white/[0.03] border border-white/5 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ 
                      width: `${percentage}%`, 
                      background: `linear-gradient(90deg, ${item.color}33, ${item.color})` 
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Gráficos temporais (Série Temporal)
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        {type === "area" ? (
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <defs>
              {metrics.map((metricKey, idx) => (
                <linearGradient key={idx} id={`color_${metricKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors[metricKey] || "#6366f1"} stopOpacity={0.4}/>
                  <stop offset="95%" stopColor={colors[metricKey] || "#6366f1"} stopOpacity={0}/>
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis 
              dataKey="day" 
              stroke="rgba(255,255,255,0.3)" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              dy={10}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.3)" 
              fontSize={10} 
              tickLine={false}
              axisLine={false}
              dx={-5}
              tickFormatter={(v) => {
                if (v >= 1000) return `${(v / 1000).toFixed(0)}k`;
                return v;
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            {metrics.map((metricKey, idx) => (
              <Area
                key={idx}
                type="monotone"
                dataKey={metricKey}
                stroke={colors[metricKey] || "#6366f1"}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#color_${metricKey})`}
              />
            ))}
          </AreaChart>
        ) : type === "bar" ? (
          <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dx={-5} />
            <Tooltip content={<CustomTooltip />} />
            {metrics.map((metricKey, idx) => (
              <Bar
                key={idx}
                dataKey={metricKey}
                fill={colors[metricKey] || "#6366f1"}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        ) : type === "composed" ? (
          <ComposedChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dx={-5} />
            <Tooltip content={<CustomTooltip />} />
            {metrics.map((metricKey, idx) => {
              // Se tiver mais de uma métrica, renderiza a primeira em barras e a segunda em linha (ideal para Investimento vs CPL)
              const isLine = idx > 0;
              if (isLine) {
                return (
                  <Line
                    key={idx}
                    type="monotone"
                    dataKey={metricKey}
                    stroke={colors[metricKey] || "#ef4444"}
                    strokeWidth={3}
                    dot={{ r: 3, strokeWidth: 1 }}
                  />
                );
              }
              return (
                <Bar
                  key={idx}
                  dataKey={metricKey}
                  fill={colors[metricKey] || "#6366f1"}
                  radius={[4, 4, 0, 0]}
                />
              );
            })}
          </ComposedChart>
        ) : (
          // Default: Line Chart (Linhas)
          <LineChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="day" stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dy={10} />
            <YAxis stroke="rgba(255,255,255,0.3)" fontSize={10} tickLine={false} axisLine={false} dx={-5} />
            <Tooltip content={<CustomTooltip />} />
            {metrics.map((metricKey, idx) => (
              <Line
                key={idx}
                type="monotone"
                dataKey={metricKey}
                stroke={colors[metricKey] || "#6366f1"}
                strokeWidth={2.5}
                dot={{ r: 2 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
};
export default ChartEngine;
