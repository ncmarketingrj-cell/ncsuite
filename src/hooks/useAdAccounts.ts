import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AdAccount = {
  id: string;
  name: string;
  currency: string | null;
  status: number | null; // 1 = Active, 2 = Disabled, etc.
  last_sync: string | null;
  campaigns?: { id: string }[];
};

export function useAdAccounts() {
  const { data: adAccounts = [], isLoading, refetch } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      // Fetch ad_accounts along with a count of campaigns
      const { data, error } = await (supabase as any)
        .from("ad_accounts")
        .select("*, campaigns(id)")
        .order("name", { ascending: true });
        
      if (error) throw error;
      return data as AdAccount[];
    },
  });

  return { adAccounts, isLoading, refetch };
}
