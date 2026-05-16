import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Search, Check, X, Loader2, Layers, FolderDot, TrendingUp, Target } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { usePortfolios, type CampaignPortfolio } from "@/hooks/usePortfolios";
import { useCampaigns } from "@/hooks/useCampaigns";

import { SyncButton } from "@/components/SyncButton";

export const Route = createFileRoute("/_app/portfolios/")({
  head: () => ({ meta: [{ title: "Portfólios — NC Suite" }] }),
  component: PortfoliosPage,
});

function PortfoliosPage() {
  const { portfolios, isLoading, addPortfolio, updatePortfolio, removePortfolio } = usePortfolios();
  const { campaigns } = useCampaigns();
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<CampaignPortfolio | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <PageHeader 
        eyebrow="Gestão Unificada" 
        title="Portfólios e Grupos" 
        description="As campanhas sincronizadas do Meta Ads podem ser agrupadas em portfólios para análise de budget consolidado."
        actions={
          <div className="flex items-center gap-3">
            <SyncButton />
            <button onClick={() => { setEditing(null); setModal(true); }} className="inline-flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-4 py-2 text-xs font-semibold hover:bg-white/10 transition">
              <Plus className="h-4 w-4" /> Novo Portfólio
            </button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : !portfolios.length ? (
        <div className="glass-panel flex flex-col items-center gap-4 py-16 text-center text-sm text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <Layers className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="font-medium text-foreground">Nenhum portfólio criado.</p>
            <p>Agrupe suas campanhas para uma visão macro.</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p, i) => {
            const mappedCampaigns = p.portfolio_campaigns || [];
            const activeCampaigns = campaigns.filter(c => mappedCampaigns.some(mc => mc.campaign_id === c.id));
            const totalBudget = activeCampaigns.reduce((acc, curr) => acc + (curr.budget || 0), 0);

            return (
              <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="glass-panel flex flex-col justify-between p-5 hover:border-primary/30 transition-colors group relative"
              >
                <Link to="/portfolios/$portfolioId" params={{ portfolioId: p.id }} className="absolute inset-0 z-0" aria-label={`Ver detalhes do portfólio ${p.name}`}></Link>
                <div className="space-y-4 relative z-10 pointer-events-none">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-display font-semibold text-lg flex items-center gap-2">
                        <FolderDot className="h-4 w-4 text-primary" />
                        {p.name}
                      </h3>
                      {p.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.description}</p>}
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${p.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>
                      {p.is_active ? "Ativo" : "Pausado"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-lg bg-background/50 p-3">
                      <p className="label-mono mb-1 text-muted-foreground flex items-center gap-1"><Target className="h-3 w-3"/> ROAS Alvo</p>
                      <p className="font-semibold text-primary">{p.target_roas ? `${p.target_roas}x` : "—"}</p>
                    </div>
                    <div className="rounded-lg bg-background/50 p-3">
                      <p className="label-mono mb-1 text-muted-foreground flex items-center gap-1"><TrendingUp className="h-3 w-3"/> Orçamento Max</p>
                      <p className="font-semibold">{p.budget_limit ? `R$ ${p.budget_limit}` : "—"}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between border-t border-white/5 pt-4 relative z-10">
                  <div className="text-xs text-muted-foreground pointer-events-none">
                    <span className="font-semibold text-foreground">{mappedCampaigns.length}</span> campanhas 
                    (R$ {totalBudget.toLocaleString('pt-BR')})
                  </div>
                  <button onClick={(e) => { e.preventDefault(); setEditing(p); setModal(true); }} className="text-xs font-medium text-primary hover:underline cursor-pointer">
                    Editar
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {modal && <PortfolioModal 
            editing={editing} 
            allCampaigns={campaigns}
            onClose={() => setModal(false)} 
            onSave={(data: any) => {
              if (editing) updatePortfolio.mutate({ id: editing.id, ...data });
              else addPortfolio.mutate(data);
              setModal(false);
            }} 
        />}
      </AnimatePresence>
    </div>
  );
}

function PortfolioModal({ editing, allCampaigns, onClose, onSave }: any) {
  const [name, setName] = useState(editing?.name ?? "");
  const [description, setDescription] = useState(editing?.description ?? "");
  const [targetRoas, setTargetRoas] = useState(editing?.target_roas ?? "");
  const [budgetLimit, setBudgetLimit] = useState(editing?.budget_limit ?? "");
  const [isActive, setIsActive] = useState(editing?.is_active ?? true);
  
  const initialCampaignIds = editing?.portfolio_campaigns?.map((pc: any) => pc.campaign_id) || [];
  const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set(initialCampaignIds));

  const toggleCampaign = (id: string) => {
    const s = new Set(selectedCampaigns);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedCampaigns(s);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="glass-panel w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/5 p-6">
          <h3 className="font-display text-xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            {editing ? "Editar Portfólio" : "Novo Portfólio"}
          </h3>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/5"><X className="h-4 w-4" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Nome do Portfólio</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lançamento Black Friday" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
            
            <div className="col-span-2 space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Descrição</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Agrupamento focado no evento X..." className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">ROAS Alvo (Opcional)</label>
              <input type="number" step="0.1" value={targetRoas} onChange={(e) => setTargetRoas(e.target.value)} placeholder="Ex: 3.5" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Orçamento Max Global (R$)</label>
              <input type="number" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)} placeholder="Ex: 15000" className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-medium border-b border-white/5 pb-2">Campanhas Vinculadas ({selectedCampaigns.size})</h4>
            <div className="max-h-[200px] overflow-y-auto rounded-lg border border-white/5 bg-background/20 p-2 custom-scrollbar">
              {allCampaigns.length === 0 ? (
                 <p className="text-xs text-muted-foreground p-2">Nenhuma campanha cadastrada no sistema.</p>
              ) : (
                allCampaigns.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-md cursor-pointer transition">
                    <input type="checkbox" checked={selectedCampaigns.has(c.id)} onChange={() => toggleCampaign(c.id)} className="accent-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{c.name}</p>
                      <p className="text-[10px] text-muted-foreground">{c.platform}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          
          <label className="flex items-center gap-2 cursor-pointer">
             <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="accent-primary" />
             <span className="text-sm">Portfólio Ativo</span>
          </label>
        </div>

        <div className="flex gap-2 justify-end border-t border-white/5 p-6 bg-background/20">
          <button onClick={onClose} className="rounded-full border border-white/10 px-4 py-2 text-xs font-medium hover:bg-white/5">Cancelar</button>
          <button onClick={() => onSave({ 
              name, description, 
              target_roas: targetRoas ? Number(targetRoas) : null, 
              budget_limit: budgetLimit ? Number(budgetLimit) : null, 
              is_active: isActive,
              campaign_ids: Array.from(selectedCampaigns)
            })} 
            className="rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:shadow-glow"
          >
            <Check className="inline h-3.5 w-3.5 mr-1.5" />{editing ? "Salvar Alterações" : "Criar Portfólio"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
