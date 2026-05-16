import { createFileRoute, Link } from "@tanstack/react-router";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { PageHeader } from "@/components/PageHeader";
import { SyncButton } from "@/components/SyncButton";
import { Loader2, BriefcaseBusiness, ChevronRight, Activity, Ban } from "lucide-react";
import { motion } from "framer-motion";

export const Route = createFileRoute("/_app/contas")({
  head: () => ({ meta: [{ title: "Contas de Anúncio — NC Suite" }] }),
  component: ContasPage,
});

function ContasPage() {
  const { adAccounts, isLoading } = useAdAccounts();

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <PageHeader 
        eyebrow="Operação" 
        title="Contas de Anúncio" 
        description="Gerencie todas as suas contas de anúncios sincronizadas a partir do seu Business Manager."
        actions={<SyncButton />}
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !adAccounts.length ? (
        <div className="glass-panel flex flex-col items-center gap-4 py-16 text-center text-sm text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <BriefcaseBusiness className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Nenhuma conta de anúncios encontrada.</p>
            <p>Certifique-se de que o token da Meta está configurado e clique em Sincronizar Agora.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {adAccounts.map((account, i) => {
            const isActive = account.status === 1; // Meta API status: 1 = Active
            
            return (
              <motion.div 
                key={account.id} 
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                transition={{ delay: i * 0.05 }}
                className="glass-panel flex flex-col justify-between p-5 hover:border-primary/30 transition-colors group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                        {account.name}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 font-mono">ID: {account.id}</p>
                    </div>
                    {isActive ? (
                      <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                        <Activity className="h-3 w-3" /> Ativa
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                        <Ban className="h-3 w-3" /> Inativa
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-background/50 p-3">
                      <p className="label-mono mb-1 text-muted-foreground">Campanhas Sinc.</p>
                      <p className="font-semibold">{account.campaigns?.length || 0}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-3">
                      <p className="label-mono mb-1 text-muted-foreground">Moeda</p>
                      <p className="font-semibold text-primary">{account.currency || "USD"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 border-t border-white/5 pt-4">
                  <Link
                    to="/campanhas"
                    search={{ accountId: account.id, search: undefined }}
                    className="flex w-full items-center justify-between rounded-lg bg-white/5 px-4 py-2 text-xs font-medium transition hover:bg-primary hover:text-primary-foreground"
                  >
                    <span>Ver Campanhas</span>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
