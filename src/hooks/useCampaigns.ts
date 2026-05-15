import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Campaign = {
  id: string;
  name: string;
  client_id: string | null;
  platform: string | null;
  status: string | null;
  budget: number | null;
  link: string | null;
  external_id: string | null;
  ad_account_id: string | null;
  created_at: string | null;
};

export function useCampaigns(filters?: { clientId?: string; status?: string; search?: string }) {
  const qc = useQueryClient();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["campaigns", filters],
    queryFn: async () => {
      let q = supabase.from("campaigns").select("*").order("created_at", { ascending: false });
      if (filters?.clientId) q = q.eq("client_id", filters.clientId);
      if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
      if (filters?.search) q = q.ilike("name", `%${filters.search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data as Campaign[];
    },
  });

  const addCampaign = useMutation({
    mutationFn: async (c: Omit<Campaign, "id" | "created_at">) => {
      const { error } = await (supabase as any).from("campaigns").insert(c);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateCampaign = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Campaign> & { id: string }) => {
      const { error } = await (supabase as any).from("campaigns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanha removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeBulk = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("campaigns").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaigns"] });
      toast.success("Campanhas removidas");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { campaigns, isLoading, addCampaign, updateCampaign, removeCampaign, removeBulk };
}
