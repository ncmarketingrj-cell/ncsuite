import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Zap, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function SyncButton() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");

  const triggerSync = async () => {
    setSyncing(true);
    setLastStatus("idle");
    const t = toast.loading("🔄 Sincronizando com Meta Ads...", { duration: 60000 });
    try {
      const { data, error } = await supabase.functions.invoke("sync-meta-ads");
      
      // A função pode retornar 200 mas com erro no corpo (ex: token inválido)
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const msg = data?.message || "Sincronização concluída!";
      toast.success(msg, { id: t, duration: 8000 });
      setLastStatus("success");
      // Atualiza todas as queries do dashboard
      qc.invalidateQueries();
    } catch (err: any) {
      const errMsg = err.message || "Falha na sincronização";
      // Mensagem amigável para erros comuns
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

  return (
    <button 
      onClick={triggerSync}
      disabled={syncing}
      className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition hover:scale-105 active:scale-95 disabled:opacity-50 shadow-glow-sm border ${
        lastStatus === "success"
          ? "bg-success/10 border-success/30 text-success"
          : lastStatus === "error"
          ? "bg-destructive/10 border-destructive/30 text-destructive"
          : "bg-gradient-to-r from-primary/20 to-secondary/20 border-primary/20 text-primary"
      }`}
    >
      {syncing
        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : lastStatus === "success"
        ? <CheckCircle2 className="h-3.5 w-3.5" />
        : lastStatus === "error"
        ? <AlertCircle className="h-3.5 w-3.5" />
        : <Zap className="h-3.5 w-3.5 fill-current" />
      }
      {syncing ? "SINCRONIZANDO..." : "SINCRONIZAR AGORA"}
    </button>
  );
}
