import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type AutomationRule = {
  id: string;
  name: string;
  metric: string;
  condition: string;
  value: number;
  action_type: string;
  action_value: any;
  target_level: string;
  target_ids: string[];
  time_window: string;
  evaluation_frequency: string;
  status: string;
  is_active: boolean;
  last_evaluated_at: string | null;
  created_at: string;
  user_id?: string;
};

export type AutomationLog = {
  id: string;
  rule_id: string;
  action_taken: string;
  target_level: string;
  target_id: string;
  old_value: any;
  new_value: any;
  status: string;
  error_message: string | null;
  created_at: string;
  automation_rules?: { name: string };
};

export type CampaignSchedule = {
  id: string;
  target_level: string;
  target_id: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  action: string;
  multiplier_value: number | null;
  timezone: string;
  is_active: boolean;
};

export function useAutomations() {
  const qc = useQueryClient();

  const { data: rules = [], isLoading: isLoadingRules } = useQuery({
    queryKey: ["automation_rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("automation_rules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as AutomationRule[];
    },
  });

  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ["automation_logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("automation_logs")
        .select("*, automation_rules(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as AutomationLog[];
    },
  });

  const { data: schedules = [], isLoading: isLoadingSchedules } = useQuery({
    queryKey: ["campaign_schedules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("campaign_schedules").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as CampaignSchedule[];
    },
  });

  // --- Mutations ---
  const addRule = useMutation({
    mutationFn: async (rule: Partial<AutomationRule>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");
      const { error } = await (supabase as any).from("automation_rules").insert({ ...rule, user_id: user.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation_rules"] });
      toast.success("Regra criada com sucesso");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateRule = useMutation({
    mutationFn: async ({ id, ...patch }: Partial<AutomationRule> & { id: string }) => {
      const { error } = await (supabase as any).from("automation_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation_rules"] });
      toast.success("Regra atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("automation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["automation_rules"] });
      toast.success("Regra removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addSchedule = useMutation({
    mutationFn: async (schedule: Partial<CampaignSchedule>) => {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) throw new Error("Usuário não autenticado");
      const { error } = await (supabase as any).from("campaign_schedules").insert({ ...schedule, user_id: user.user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign_schedules"] });
      toast.success("Agendamento criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeSchedule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("campaign_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["campaign_schedules"] });
      toast.success("Agendamento removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    rules, isLoadingRules, addRule, updateRule, removeRule,
    logs, isLoadingLogs,
    schedules, isLoadingSchedules, addSchedule, removeSchedule
  };
}
