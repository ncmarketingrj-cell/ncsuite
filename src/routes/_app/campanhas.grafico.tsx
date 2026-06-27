import { createFileRoute } from "@tanstack/react-router";
import { ChartEditor } from "@/components/charts/ChartEditor";

export const Route = createFileRoute("/_app/campanhas/grafico")({
  component: CampanhasGraficoPage,
});

function CampanhasGraficoPage() {
  return (
    <div className="container mx-auto p-4 sm:p-6 max-w-7xl">
      <ChartEditor 
        context="campanhas" 
        backUrl="/metricas" 
        backLabel="Análise de Campanhas" 
      />
    </div>
  );
}
