import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Zap, Loader2, CheckCircle2, AlertCircle, Info, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function SyncButton() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");

  // Query inteligente para buscar a sincronização global mais recente
  const { data: lastSyncData, refetch: refetchSyncDate } = useQuery({
    queryKey: ["last-sync-date"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("last_sync")
        .order("last_sync", { ascending: false, nullsFirst: false })
        .limit(1);
      
      if (error || !data || data.length === 0) return null;
      return data[0].last_sync ? new Date(data[0].last_sync) : null;
    },
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  const triggerSync = async () => {
    setSyncing(true);
    setLastStatus("idle");
    const t = toast.loading("🔄 Conectando à Graph API da Meta Ads...", { duration: 60000 });
    
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-ads");
      
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const msg = data?.message || "Sincronização concluída com sucesso!";
      toast.success(msg, { id: t, duration: 8000 });
      setLastStatus("success");
      
      // Invalida todas as chaves do React Query para recarregar todos os dados do banco imediatamente em todo o app!
      await qc.invalidateQueries();
      await refetchSyncDate();
    } catch (err: any) {
      const errMsg = err.message || "Falha na sincronização";
      const friendly = errMsg.includes("Token")
        ? "⚠️ Token Meta inválido ou expirado. Atualize em Configurações → Integrações."
        : errMsg.includes("permission")
        ? "⚠️ Token sem permissões suficientes. Verifique as permissões da app Meta."
        : errMsg.includes("desenvolvimento") || errMsg.includes("development")
        ? "⚠️ App Meta em modo Desenvolvimento. Ative o modo Live no portal Meta."
        : `❌ ${errMsg}`;
      toast.error(friendly, { id: t, duration: 10000 });
      setLastStatus("error");
    } finally {
      setSyncing(false);
    }
  };

  // Formata o tempo transcorrido de forma amigável e legível
  const getSyncLabel = () => {
    if (!lastSyncData) return "Sem registros";
    
    try {
      const distance = formatDistanceToNow(lastSyncData, { locale: ptBR, addSuffix: true });
      const exactTime = format(lastSyncData, "HH:mm", { locale: ptBR });
      
      // Se for menos de um minuto
      if (distance.includes("menos de um minuto")) {
        return "Atualizado agora mesmo";
      }
      
      return `Último Sync: ${distance} (às ${exactTime})`;
    } catch (e) {
      return "Dados sincronizados";
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-2.5 px-4 shadow-inner">
      <div className="text-right">
        <p className="text-[10px] font-black uppercase tracking-[0.15em] text-primary flex items-center gap-1.5 justify-end">
          <Sparkles className="h-3 w-3 text-primary animate-pulse" /> Sincronização Global
        </p>
        <p className="text-[9px] text-muted-foreground font-semibold mt-0.5" title="Os dados sincronizados aqui são salvos centralizados no Supabase e atualizam todas as páginas do sistema instantaneamente.">
          {getSyncLabel()}
        </p>
      </div>

      <div className="relative group">
        <button 
          onClick={triggerSync}
          disabled={syncing}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black uppercase tracking-wider transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 shadow-glow-sm border ${
            syncing
              ? "bg-primary/20 border-primary/30 text-primary"
              : lastStatus === "success"
              ? "bg-success/15 border-success/30 text-success hover:border-success/50"
              : lastStatus === "error"
              ? "bg-destructive/15 border-destructive/30 text-destructive hover:border-destructive/50"
              : "bg-gradient-to-r from-primary to-secondary text-background hover:shadow-glow hover:brightness-110 border-transparent font-black"
          }`}
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : lastStatus === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 animate-bounce" />
          ) : lastStatus === "error" ? (
            <AlertCircle className="h-3.5 w-3.5 animate-shake" />
          ) : (
            <Zap className="h-3.5 w-3.5 fill-current" />
          )}
          {syncing ? "SINCRONIZANDO..." : "SINCRONIZAR AGORA"}
        </button>

        {/* Tooltip informativo explicativo */}
        <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-64 origin-bottom scale-95 rounded-xl border border-white/10 bg-background/95 p-3 text-[10px] leading-relaxed text-muted-foreground opacity-0 shadow-2xl transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 backdrop-blur-md">
          <p className="font-bold text-foreground mb-1 flex items-center gap-1">
            <Info className="h-3 w-3 text-primary" /> Como funciona o Sync?
          </p>
          Conecta via Graph API da Meta, sincroniza todas as contas de anúncios, campanhas, orçamentos, demográficos e métricas no Supabase e atualiza o dashboard globalmente de uma só vez.
        </div>
      </div>
    </div>
  );
}
