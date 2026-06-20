import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { Filter, Search, Plus } from "lucide-react";

export const Route = createFileRoute("/_app/crm")({
  head: () => ({ meta: [{ title: "Pipeline SDR — NC Performance Suite" }] }),
  component: CrmPage,
});

function CrmPage() {
  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-4">
      <PageHeader 
        eyebrow="Multi-Tenant CRM" 
        title="Pipeline de SDR" 
        description="Gestão de Leads e Cadência Comercial (Modelo 8x8)."
        actions={
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                type="text" 
                placeholder="Buscar lead, telefone..."
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary transition-all"
              />
            </div>
            <button className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-4 py-2 text-sm font-bold transition-all w-10 sm:w-auto shrink-0">
              <Filter className="h-4 w-4" />
              <span className="hidden sm:inline">Filtros</span>
            </button>
            <button className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-2 text-sm font-bold transition-all w-10 sm:w-auto shrink-0 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Novo Lead</span>
            </button>
          </div>
        }
      />

      <div className="flex-1 mt-4">
        <KanbanBoard readOnly={false} />
      </div>
    </div>
  );
}
