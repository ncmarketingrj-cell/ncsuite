import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Client = {
  id: string;
  name: string;
  type: string | null;
  monthly_budget: number | null;
  user_id: string | null;
  created_at: string | null;
};

export function useClients() {
  const qc = useQueryClient();

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ["clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Client[];
    },
  });

  const addClient = useMutation({
    mutationFn: async (client: { name: string; type?: string; monthly_budget?: number }) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("clients").insert({
        name: client.name,
        type: client.type ?? null,
        monthly_budget: client.monthly_budget ?? null,
        user_id: u.user?.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente adicionado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateClient = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<Client> & { id: string }) => {
      const { error } = await supabase.from("clients").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeClient = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("clients").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Cliente removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { clients, isLoading, addClient, updateClient, removeClient };
}
