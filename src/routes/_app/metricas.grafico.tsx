import { createFileRoute } from "@tanstack/react-router";
import { ChartEditor } from "@/components/charts/ChartEditor";

export const Route = createFileRoute("/_app/metricas/grafico")({
  component: MetricasGraficoPage,
});

function MetricasGraficoPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <ChartEditor 
        context="metricas" 
        backUrl="/metricas" 
        backLabel="Métricas Globais" 
      />
    </div>
  );
}
