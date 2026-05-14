import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Metric = {
  id: string;
  campaign_id: string | null;
  client_id: string | null;
  date: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  cost: number | null;
  reach: number | null;
  result_type: string | null;
  created_at: string | null;
};

export function useMetrics(filters?: { clientId?: string; days?: number }) {
  return useQuery({
    queryKey: ["metrics", filters],
    queryFn: async () => {
      let q = supabase.from("metrics").select("*").order("date", { ascending: true });
      if (filters?.clientId) q = q.eq("client_id", filters.clientId);
      if (filters?.days) {
        const from = new Date();
        from.setDate(from.getDate() - filters.days);
        q = q.gte("date", from.toISOString().split("T")[0]);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Metric[];
    },
  });
}
