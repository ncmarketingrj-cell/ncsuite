// src/hooks/useChartConfig.ts
// NC Performance Suite — Hook para persistência e gestão dos gráficos

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { usePagePermission } from "./usePagePermission";
import { ChartConfig, ChartType } from "@/types/charts";
import { toast } from "sonner";

// Gráficos padrão para Métricas (Visão Global da Agência/Admin)
const DEFAULT_METRICAS_CHARTS = (userId: string | null): Omit<ChartConfig, "id">[] => [
  {
    user_id: null, // Compartilhado para todos
    title: "Investimento vs Custo por Lead (CPL)",
    type: "composed",
    metrics: ["cost", "cpl"],
    colors: { cost: "#6366f1", cpl: "#ef4444" },
    period: "30d",
    groupBy: "day",
    showComparison: false,
    context: "metricas",
    position: 0
  },
  {
    user_id: null,
    title: "Volume de Leads (Conversões)",
    type: "area",
    metrics: ["conversions"],
    colors: { conversions: "#8b5cf6" },
    period: "30d",
    groupBy: "day",
    showComparison: false,
    context: "metricas",
    position: 1
  },
  {
    user_id: null,
    title: "Funil de Vendas (Impressões -> Cliques -> Leads)",
    type: "funnel",
    metrics: ["impressions", "clicks", "conversions"],
    colors: { impressions: "#f59e0b", clicks: "#06b6d4", conversions: "#8b5cf6" },
    period: "30d",
    groupBy: "day",
    showComparison: false,
    context: "metricas",
    position: 2
  }
];

// Gráficos padrão para Campanhas (Visão Individual do Analista)
const DEFAULT_CAMPANHAS_CHARTS = (userId: string | null): Omit<ChartConfig, "id">[] => [
  {
    user_id: userId, // Individual de cada usuário
    title: "Tendência de Custo por Lead (CPL)",
    type: "line",
    metrics: ["cpl"],
    colors: { cpl: "#ef4444" },
    period: "30d",
    groupBy: "day",
    showComparison: false,
    context: "campanhas",
    position: 0
  },
  {
    user_id: userId,
    title: "Cliques vs Conversões",
    type: "bar",
    metrics: ["clicks", "conversions"],
    colors: { clicks: "#06b6d4", conversions: "#8b5cf6" },
    period: "30d",
    groupBy: "day",
    showComparison: false,
    context: "campanhas",
    position: 1
  }
];

export function useChartConfig(context: "metricas" | "campanhas") {
  const { user } = useAuth();
  const { isAdmin } = usePagePermission();
  const queryClient = useQueryClient();

  const queryKey = ["chart_configs", context, user?.id];

  // 1. Carregar Configurações de Gráficos
  const { data: configs = [], isLoading } = useQuery<ChartConfig[]>({
    queryKey,
    queryFn: async () => {
      let query = supabase.from("chart_configs").select("*");

      if (context === "metricas") {
        // Métricas é global/compartilhado (geralmente user_id é nulo ou qualquer um cadastrado para métricas)
        query = query.eq("context", "metricas");
      } else {
        // Campanhas é individual por usuário
        if (!user?.id) return [];
        query = query.eq("context", "campanhas").eq("user_id", user.id);
      }

      const { data, error } = await query.order("position", { ascending: true });

      if (error) {
        console.error("Erro ao carregar configurações de gráficos:", error);
        throw error;
      }

      // Se não houver configurações salvas, carrega os padrões
      if (!data || data.length === 0) {
        const defaults = context === "metricas" 
          ? DEFAULT_METRICAS_CHARTS(user?.id || null) 
          : DEFAULT_CAMPANHAS_CHARTS(user?.id || null);

        // Retorna os padrões de forma otimista enquanto não são salvos definitivamente
        return defaults.map((d, index) => ({
          ...d,
          id: `default-${index}`,
        })) as ChartConfig[];
      }

      return data as ChartConfig[];
    },
    enabled: context === "metricas" || !!user?.id,
  });

  // 2. Salvar/Criar ou Atualizar Gráfico
  const saveMutation = useMutation({
    mutationFn: async (chart: Omit<ChartConfig, "id"> & { id?: string }) => {
      if (context === "metricas" && !isAdmin) {
        throw new Error("Apenas administradores podem gerenciar gráficos de métricas.");
      }

      const payload = {
        title: chart.title,
        type: chart.type,
        metrics: chart.metrics,
        colors: chart.colors,
        period: chart.period,
        group_by: chart.groupBy,
        show_comparison: chart.showComparison,
        context: chart.context,
        target_id: chart.targetId || null,
        position: chart.position,
        user_id: context === "metricas" ? null : user?.id // Em métricas é nulo para ser global
      };

      if (chart.id && !chart.id.startsWith("default-")) {
        // Update
        const { data, error } = await supabase
          .from("chart_configs")
          .update(payload)
          .eq("id", chart.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Insert
        const { data, error } = await supabase
          .from("chart_configs")
          .insert([payload])
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Configuração do gráfico salva com sucesso!");
    },
    onError: (err: any) => {
      console.error("Erro ao salvar gráfico:", err);
      toast.error(err.message || "Erro ao salvar a configuração do gráfico.");
    }
  });

  // 3. Deletar Gráfico
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (context === "metricas" && !isAdmin) {
        throw new Error("Apenas administradores podem remover gráficos de métricas.");
      }

      if (id.startsWith("default-")) {
        // Se for gráfico padrão (que ainda não está no banco), não precisa rodar delete no BD
        return { id };
      }

      const { error } = await supabase
        .from("chart_configs")
        .delete()
        .eq("id", id);

      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      toast.success("Gráfico removido com sucesso!");
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao remover o gráfico.");
    }
  });

  // 4. Reordenar Gráficos (Drag and Drop)
  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (context === "metricas" && !isAdmin) {
        throw new Error("Apenas administradores podem ordenar gráficos de métricas.");
      }

      // Para cada ID, atualizamos sua posição
      const promises = orderedIds.map((id, index) => {
        if (id.startsWith("default-")) return Promise.resolve(); // Ignora temporários não salvos
        return supabase
          .from("chart_configs")
          .update({ position: index })
          .eq("id", id);
      });

      await Promise.all(promises);
      return orderedIds;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
    onError: (err: any) => {
      toast.error(err.message || "Erro ao reordenar gráficos.");
    }
  });

  return {
    configs,
    isLoading,
    isAdmin,
    saveChart: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    deleteChart: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
    reorderCharts: reorderMutation.mutate,
    canEdit: context === "metricas" ? isAdmin : true // O admin pode editar métricas, campanhas é livre
  };
}
