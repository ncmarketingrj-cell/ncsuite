import { supabase } from "@/integrations/supabase-external/client";

/**
 * Remove com segurança uma conta de anúncios e TODOS os seus registros dependentes
 * em cascata, evitando qualquer violação de chave estrangeira (FK constraints).
 */
export async function purgeAdAccount(adAccountId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const accountIds = [adAccountId];

    // 1. Limpar todas as tabelas analíticas vinculadas diretamente a esta conta
    await supabase.from("meta_device_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("meta_placement_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("device_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("placement_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("hourly_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("region_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("demographic_metrics" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("campaign_period_stats" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("meta_period_stats" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("billing_snapshots" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("alert_thresholds" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("automation_rules" as any).delete().in("ad_account_id", accountIds);
    await supabase.from("client_accounts" as any).delete().in("ad_account_id", accountIds);

    // 2. Buscar todas as campanhas desta conta para limpar seus anúncios e conjuntos
    const { data: camps } = await supabase
      .from("campaigns" as any)
      .select("id")
      .eq("ad_account_id", adAccountId);

    const campIds = (camps || []).map((c: any) => c.id);

    if (campIds.length > 0) {
      // Buscar conjuntos de anúncios
      const { data: adSets } = await supabase
        .from("ad_sets" as any)
        .select("id")
        .in("campaign_id", campIds);

      const adSetIds = (adSets || []).map((s: any) => s.id);

      if (adSetIds.length > 0) {
        // Limpar asset_metrics e ads
        await supabase.from("asset_metrics" as any).delete().in("ad_set_id", adSetIds);
        await supabase.from("ads" as any).delete().in("ad_set_id", adSetIds);
        await supabase.from("ad_sets" as any).delete().in("id", adSetIds);
      }

      // Limpar métricas diárias e campanhas
      await supabase.from("metrics" as any).delete().in("campaign_id", campIds);
      await supabase.from("campaigns" as any).delete().in("id", campIds);
    }

    // 3. Deletar o registro mestre da conta de anúncios
    const { error: delError } = await supabase
      .from("ad_accounts" as any)
      .delete()
      .eq("id", adAccountId);

    if (delError) {
      throw delError;
    }

    return { success: true };
  } catch (err: any) {
    console.error(`[PURGE] Falha ao excluir conta ${adAccountId}:`, err);
    return { success: false, error: err.message || "Falha ao excluir conta de anúncios." };
  }
}

