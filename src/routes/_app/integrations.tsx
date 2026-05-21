import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Zap, Wifi, ArrowRight, Database, AlertTriangle } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { SyncButton } from "@/components/SyncButton";

export const Route = createFileRoute("/_app/integrations")({
  head: () => ({ meta: [{ title: "Integrações — NC Suite" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader eyebrow="Sistema" title="Integrações" description="Conecte plataformas externas para sincronização de dados." />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Meta Ads (Graph API v21.0)</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Sincronize campanhas, métricas e insights diretamente do gerenciador de anúncios do Meta.
              </p>
            </div>

            {/* Sync Completo */}
            <div className="rounded-2xl border border-orange-500/20 bg-orange-500/5 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <Database className="h-5 w-5 text-orange-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-foreground">Sync Histórico Completo</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Busca 60 dias de histórico de <strong>todas as contas</strong>, incluindo contas recém-adicionadas.
                    Use na carga inicial do mês ou ao vincular uma nova conta. Operação manual e pode levar alguns minutos.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <SyncButton mode="full" />
                <Link to="/config" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-medium hover:bg-white/5">
                  Configurações de Token <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-orange-500/20 bg-orange-500/5 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                <p className="text-[10px] text-orange-300 leading-relaxed">
                  Após a carga inicial do mês, não é necessário rodar novamente. O sync automático de 3 minutos e o botão do Dashboard (7 dias) mantêm os dados atualizados.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel p-6 opacity-50">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/30">
            <Wifi className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="font-display text-lg font-semibold">Google Ads</h3>
            <p className="mt-1 text-sm text-muted-foreground">Em breve — integração com Google Ads para campanhas de Search e Display.</p>
            <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-[10px] font-semibold text-muted-foreground">Em breve</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
