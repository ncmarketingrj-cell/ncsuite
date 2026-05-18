import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type CampaignPortfolio = {
  id: string;
  name: string;
  description: string | null;
  target_roas: number | null;
  target_cpa: number | null;
  budget_limit: number | null;
  is_active: boolean;
  created_at: string;
  portfolio_campaigns?: { campaign_id: string }[];
};

export function usePortfolios() {
  const qc = useQueryClient();

  const { data: portfolios = [], isLoading } = useQuery({
    queryKey: ["campaign_portfolios"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("campaign_portfolios")
        .select("*, portfolio_campaigns(campaign_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignPortfolio[];
    },
  });

  const addPortfolio = useMutation({
    mutationFn: async (p: Partial<CampaignPortfolio> & { campaign_ids?: string[] }) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");
      
      const { campaign_ids, ...portfolioData } = p;
      
      const { data: newPortfolio, error } = await (supabase as any)
        .from("campaign_portfolios")
        .insert({ ...portfolioData, user_id: user.user.id })
        .select()
        .single();
        
      if (error) throw error;

      if (campaign_ids && campaign_ids.length > 0) {
        const mappings = campaign_ids.map(id => ({
          portfolio_id: newPortfolio.id,
          campaign_id: id
        }));
        const { error: mappingError } = await (supabase as any).from("portfolio_campaigns").insert(mappings);
        if (mappingError) throw mappingError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign_portfolios"] });
      toast.success("Portfólio criado com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updatePortfolio = useMutation({
    mutationFn: async ({ id, campaign_ids, ...patch }: Partial<CampaignPortfolio> & { id: string, campaign_ids?: string[] }) => {
      const { error } = await (supabase as any).from("campaign_portfolios").update(patch).eq("id", id);
      if (error) throw error;

      if (campaign_ids) {
        // Simple strategy: delete all mappings and re-insert
        await (supabase as any).from("portfolio_campaigns").delete().eq("portfolio_id", id);
        if (campaign_ids.length > 0) {
          const mappings = campaign_ids.map(cid => ({
            portfolio_id: id,
            campaign_id: cid
          }));
          await (supabase as any).from("portfolio_campaigns").insert(mappings);
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign_portfolios"] });
      toast.success("Portfólio atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePortfolio = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("campaign_portfolios").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign_portfolios"] });
      toast.success("Portfólio removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { portfolios, isLoading, addPortfolio, updatePortfolio, removePortfolio };
}
