import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Zap, Wifi, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/integrations")({
  head: () => ({ meta: [{ title: "Integrações — NC Suite" }] }),
  component: IntegrationsPage,
});

function IntegrationsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader eyebrow="Sistema" title="Integrações" description="Conecte plataformas externas para sincronização de dados." />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="header-sport font-display text-lg font-semibold">Meta Ads (Graph API v21.0)</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Sincronize campanhas, métricas e insights diretamente do gerenciador de anúncios do Meta.
            </p>
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <Link to="/config" className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 border border-primary/20 px-4 py-2 text-xs font-bold text-primary hover:bg-primary/20 transition">
                Configurações de Token <ArrowRight className="h-3 w-3" />
              </Link>
              <Link to="/config" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-xs font-medium hover:bg-white/5 transition">
                Sync Máximo <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </div>
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel card-sport p-6 opacity-50">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-muted/30">
            <Wifi className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <h3 className="header-sport font-display text-lg font-semibold">Google Ads</h3>
            <p className="mt-1 text-sm text-muted-foreground">Em breve — integração com Google Ads para campanhas de Search e Display.</p>
            <span className="mt-3 inline-block rounded-full bg-muted px-3 py-1 text-[10px] font-semibold text-muted-foreground">Em breve</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
