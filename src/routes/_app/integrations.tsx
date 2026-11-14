import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Lock } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { usePagePermission } from "@/hooks/usePagePermission";
import { TabIntegracoes } from "./config";

export const Route = createFileRoute("/_app/integrations")({
  head: () => ({ meta: [{ title: "Integrações & Sincronização — NC Suite" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  const { isLoading, canViewIntegrations, canManageIntegrations } = usePagePermission();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canViewIntegrations) {
    return (
      <div className="mx-auto max-w-lg text-center py-20 space-y-5">
        <div className="h-16 w-16 mx-auto rounded-3xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shadow-lg">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-black text-foreground">Acesso Restrito</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Seu perfil não possui permissão para acessar integrações, tokens ou telemetria de sincronização.
          </p>
        </div>
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-xs font-black uppercase tracking-wider text-primary-foreground shadow-glow transition active:scale-95"
        >
          Voltar ao Command Center
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        eyebrow="Sistema"
        title="Integrações & Sincronização"
        description="Central técnica de conexões Meta/Google, snapshots, cobertura por conta e histórico de execuções."
      />
      <div className="glass-panel p-4 sm:p-8 min-w-0 overflow-hidden">
        <TabIntegracoes canManage={canManageIntegrations} />
      </div>
    </div>
  );
}
