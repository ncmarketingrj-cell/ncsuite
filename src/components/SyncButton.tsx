import { useState } from "react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Zap, Loader2, CheckCircle2, AlertCircle, Info, Sparkles, Database, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow, format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/lib/auth";

interface SyncButtonProps {
  mode?: "quick" | "full" | "max" | "month1" | "month2" | "month3";
}

function getLocalDateStr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getMonthRange(monthsAgo: number) {
  const ref = subMonths(new Date(), monthsAgo);
  return {
    since: getLocalDateStr(startOfMonth(ref)),
    until: getLocalDateStr(endOfMonth(ref)),
    label: format(ref, "MMMM 'de' yyyy", { locale: ptBR }),
    labelShort: format(ref, "MMM/yyyy", { locale: ptBR }).toUpperCase(),
  };
}

export function SyncButton({ mode = "quick" }: SyncButtonProps) {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [lastStatus, setLastStatus] = useState<"idle" | "success" | "error">("idle");
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["sync-button-profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
      return data;
    },
    enabled: !!user
  });

  const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
  const isAdmin = profile?.role === "admin" || (user?.email && ADMIN_EMAILS.includes(user.email));

  const { data: lastSyncData, refetch: refetchSyncDate } = useQuery({
    queryKey: ["last-sync-date"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ad_accounts")
        .select("last_sync")
        .order("last_sync", { ascending: false, nullsFirst: false })
        .limit(1);
      if (error || !data?.length) return null;
      return data[0].last_sync ? new Date(data[0].last_sync) : null;
    },
    refetchInterval: 30000,
  });

  const isQuick  = mode === "quick";
  const isMax    = mode === "max";
  const isMonth1 = mode === "month1";
  const isMonth2 = mode === "month2";
  const isMonth3 = mode === "month3";
  const isMonthMode = isMonth1 || isMonth2 || isMonth3;

  const monthsAgo = isMonth1 ? 1 : isMonth2 ? 2 : isMonth3 ? 3 : 0;
  const monthRange = isMonthMode ? getMonthRange(monthsAgo) : null;

  const triggerSync = async () => {
    setSyncing(true);
    setLastStatus("idle");

    const loadingMsg = isQuick
      ? "🔄 Atualizando últimos 7 dias..."
      : isMax
      ? "🔄 Buscando máximo histórico possível (pode levar vários minutos)..."
      : isMonthMode
      ? `🔄 Sincronizando ${monthRange!.label}...`
      : "🔄 Sync completo em andamento (pode levar alguns minutos)...";
    const t = toast.loading(loadingMsg, { duration: isMax ? 600000 : isQuick ? 30000 : 180000 });

    try {
      let body: Record<string, any> = { triggered_by: "manual" };

      if (isQuick) {
        const today = new Date();
        body.time_range = { since: getLocalDateStr(subDays(today, 7)), until: getLocalDateStr(today) };
      } else if (isMax) {
        body.date_preset = "maximum";
      } else if (isMonthMode) {
        body.time_range = { since: monthRange!.since, until: monthRange!.until };
      } else {
        const today = new Date();
        body.time_range = { since: getLocalDateStr(subDays(today, 60)), until: getLocalDateStr(today) };
      }

      const { data, error } = await supabase.functions.invoke("sync-meta-ads", { body });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      const msg = data?.message || (
        isQuick ? "7 dias atualizados!" :
        isMax ? "Histórico máximo sincronizado!" :
        isMonthMode ? `${monthRange!.label} sincronizado!` :
        "Sync completo concluído!"
      );
      toast.success(msg, { id: t, duration: 8000 });
      setLastStatus("success");
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

  const getSyncLabel = () => {
    if (!lastSyncData) return "Sem registros";
    try {
      const distance = formatDistanceToNow(lastSyncData, { locale: ptBR, addSuffix: true });
      const exactTime = format(lastSyncData, "HH:mm", { locale: ptBR });
      if (distance.includes("menos de um minuto")) return "Atualizado agora mesmo";
      return `Último sync: ${distance} (às ${exactTime})`;
    } catch {
      return "Dados sincronizados";
    }
  };

  const monthRelativeLabel = isMonth1 ? "MÊS PASSADO" : isMonth2 ? "2 MESES ATRÁS" : "3 MESES ATRÁS";

  const buttonLabel = syncing
    ? "SINCRONIZANDO..."
    : isQuick
    ? "ATUALIZAR (7 DIAS)"
    : isMax
    ? "SYNC MÁXIMO"
    : isMonthMode
    ? `SYNC ${monthRelativeLabel}`
    : "SYNC COMPLETO (60 DIAS)";

  const Icon = isMonthMode ? CalendarDays : isQuick ? Zap : Database;

  const buttonColorClass = isMonthMode
    ? "bg-violet-600 text-white hover:bg-violet-700 border-transparent"
    : isQuick
    ? "bg-primary text-primary-foreground hover:bg-primary/90 border-transparent"
    : isMax
    ? "bg-red-600 text-white hover:bg-red-700 border-transparent"
    : "bg-orange-500 text-white hover:bg-orange-600 border-transparent";

  const tooltipTitle = isQuick ? "Sync Rápido — 7 dias"
    : isMax ? "Sync Máximo — tudo disponível"
    : isMonthMode ? `Sync Mensal — ${monthRange!.label}`
    : "Sync Completo — 60 dias";

  const tooltipBody = isQuick
    ? "Busca os últimos 7 dias de todas as contas. Rápido, sem risco de timeout. Use para manter os dados do dia atualizados."
    : isMax
    ? "Busca o máximo histórico disponível. Use apenas na carga inicial ou ao adicionar contas novas. Pode levar vários minutos."
    : isMonthMode
    ? `Busca todos os dados de ${monthRange!.label} (${monthRange!.since} a ${monthRange!.until}). Ideal para preencher lacunas de meses anteriores.`
    : "Busca 60 dias de histórico. Use na carga inicial ou ao começar um novo mês.";

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-4 bg-white/[0.02] border border-white/5 rounded-2xl p-2.5 px-4 shadow-inner">
      {!isMonthMode && (
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-[0.15em] text-primary flex items-center gap-1.5 justify-end">
            <Sparkles className="h-3 w-3 text-primary animate-pulse" />
            {isQuick ? "Sync Rápido" : isMax ? "Sync Máximo" : "Sync Histórico"}
          </p>
          <p className="text-[9px] text-muted-foreground font-semibold mt-0.5">
            {getSyncLabel()}
          </p>
        </div>
      )}

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
              : buttonColorClass
          }`}
        >
          {syncing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : lastStatus === "success" ? (
            <CheckCircle2 className="h-3.5 w-3.5 animate-bounce" />
          ) : lastStatus === "error" ? (
            <AlertCircle className="h-3.5 w-3.5" />
          ) : (
            <Icon className="h-3.5 w-3.5" />
          )}
          {buttonLabel}
        </button>

        <div className="pointer-events-none absolute bottom-full right-0 z-50 mb-2 w-72 origin-bottom scale-95 rounded-xl border border-white/10 bg-background/95 p-3 text-[10px] leading-relaxed text-muted-foreground opacity-0 shadow-2xl transition-all duration-200 group-hover:scale-100 group-hover:opacity-100 backdrop-blur-md">
          <p className="font-bold text-foreground mb-1 flex items-center gap-1">
            <Info className="h-3 w-3 text-primary" />
            {tooltipTitle}
          </p>
          {tooltipBody}
        </div>
      </div>
    </div>
  );
}
