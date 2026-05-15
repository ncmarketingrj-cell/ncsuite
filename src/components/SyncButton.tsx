import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Zap, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SyncButton() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);

  const triggerSync = async () => {
    setSyncing(true);
    const t = toast.loading("Sincronizando com Meta Ads...");
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-ads");
      if (error) throw error;
      toast.success(data.message || "Sincronização concluída!", { id: t });
      // Invalidate all queries to refresh the dashboard, campaigns, etc.
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "Falha na sincronização", { id: t });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <button 
      onClick={triggerSync}
      disabled={syncing}
      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary/20 to-secondary/20 border border-primary/20 px-4 py-2 text-xs font-bold text-primary transition hover:scale-105 active:scale-95 disabled:opacity-50 shadow-glow-sm"
    >
      {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 fill-current" />}
      {syncing ? "SINCRONIZANDO..." : "SINCRONIZAR AGORA"}
    </button>
  );
}
