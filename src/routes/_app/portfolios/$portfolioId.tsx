import { createFileRoute, Link } from "@tanstack/react-router";
import { usePortfolios } from "@/hooks/usePortfolios";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useAdAccounts } from "@/hooks/useAdAccounts";
import { PageHeader } from "@/components/PageHeader";
import { Loader2, ArrowLeft, FolderDot, BriefcaseBusiness, ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export const Route = createFileRoute("/_app/portfolios/$portfolioId")({
  component: PortfolioDetail,
});

function PortfolioDetail() {
  const { portfolioId } = Route.useParams();
  const { portfolios, isLoading: isPortfoliosLoading } = usePortfolios();
  const { campaigns, isLoading: isCampaignsLoading } = useCampaigns();
  const { adAccounts, isLoading: isAccountsLoading } = useAdAccounts();

  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);

  if (isPortfoliosLoading || isCampaignsLoading || isAccountsLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const portfolio = portfolios.find(p => p.id === portfolioId);

  if (!portfolio) {
    return (
      <div className="mx-auto max-w-6xl pb-20 text-center">
        <p className="text-muted-foreground mt-20">Portfólio não encontrado.</p>
        <Link to="/portfolios" className="mt-4 text-primary hover:underline">Voltar aos portfólios</Link>
      </div>
    );
  }

  // Encontrar as campanhas que pertencem a este portfólio
  const mappedCampaignIds = new Set(portfolio.portfolio_campaigns?.map(pc => pc.campaign_id) || []);
  const portfolioCampaigns = campaigns.filter(c => mappedCampaignIds.has(c.id));

  // Encontrar as contas de anúncio distintas dessas campanhas
  const accountIdsInPortfolio = new Set(portfolioCampaigns.map(c => c.ad_account_id).filter(Boolean) as string[]);
  const accountsInPortfolio = adAccounts.filter(acc => accountIdsInPortfolio.has(acc.id));

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <div>
        <Link to="/portfolios" className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>
        <PageHeader 
          eyebrow="Detalhes do Portfólio" 
          title={portfolio.name} 
          description={portfolio.description || "Agrupamento de campanhas para gestão consolidada."}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="glass-panel p-4">
          <p className="label-mono text-muted-foreground">ROAS Alvo</p>
          <p className="font-display text-2xl font-semibold mt-1">{portfolio.target_roas ? `${portfolio.target_roas}x` : "—"}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="label-mono text-muted-foreground">Orçamento Global</p>
          <p className="font-display text-2xl font-semibold mt-1">{portfolio.budget_limit ? `R$ ${portfolio.budget_limit}` : "—"}</p>
        </div>
        <div className="glass-panel p-4">
          <p className="label-mono text-muted-foreground">Status</p>
          <p className="font-display text-2xl font-semibold mt-1 text-primary">{portfolio.is_active ? "Ativo" : "Pausado"}</p>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-display text-xl font-semibold flex items-center gap-2">
          <BriefcaseBusiness className="h-5 w-5 text-primary" />
          Contas de Anúncio neste Portfólio
        </h3>
        
        {accountsInPortfolio.length === 0 ? (
          <div className="glass-panel py-8 text-center text-muted-foreground text-sm">
            Nenhuma conta de anúncios vinculada a este portfólio.
          </div>
        ) : (
          <div className="space-y-3">
            {accountsInPortfolio.map((acc) => {
              const accCampaigns = portfolioCampaigns.filter(c => c.ad_account_id === acc.id);
              const isExpanded = expandedAccount === acc.id;

              return (
                <div key={acc.id} className="glass-panel overflow-hidden">
                  <button 
                    onClick={() => setExpandedAccount(isExpanded ? null : acc.id)}
                    className="w-full flex items-center justify-between p-4 bg-white/[0.02] hover:bg-white/[0.04] transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`p-2 rounded-lg ${isExpanded ? 'bg-primary/20 text-primary' : 'bg-white/5 text-muted-foreground'}`}>
                        <BriefcaseBusiness className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <p className="font-medium">{acc.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">ID: {acc.id}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-semibold">{accCampaigns.length}</p>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Campanhas</p>
                      </div>
                      {isExpanded ? <ChevronDown className="h-5 w-5 text-muted-foreground" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-white/5 bg-background/50"
                      >
                        <div className="p-4 space-y-2">
                          {accCampaigns.map(camp => (
                            <div key={camp.id} className="flex items-center justify-between p-3 rounded-lg border border-white/5 bg-white/[0.01] hover:border-primary/20 transition-colors">
                              <div>
                                <p className="text-sm font-medium">{camp.name}</p>
                                <p className="text-[10px] text-muted-foreground uppercase">{camp.status || "Desconhecido"}</p>
                              </div>
                              <Link 
                                to="/campanhas" 
                                search={{ search: camp.name, accountId: undefined }}
                                className="text-xs font-medium text-primary hover:underline"
                              >
                                Analisar
                              </Link>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
