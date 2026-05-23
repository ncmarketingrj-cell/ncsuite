import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Zap, Activity, AlertTriangle, CheckCircle2, XCircle, Clock, Users, TrendingUp, TrendingDown, Loader2, Play, BarChart3, Brain, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";

const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];

export const Route = createFileRoute("/_app/agente")({
  head: () => ({ meta: [{ title: "Agente IA — NC Performance Suite" }] }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
    if (!ADMIN_EMAILS.includes(data.session.user.email ?? "")) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: AgentePage,
});

const AGE_RANGES = ["13-17","18-24","25-34","35-44","45-54","55-64","65+"];
const GENDERS = ["male", "female"];
const GENDER_LABEL: Record<string, string> = { male: "Masc", female: "Fem" };

function AgentePage() {
  const qc = useQueryClient();
  const [runningHeartbeat, setRunningHeartbeat] = useState(false);

  // Config / status
  const { data: config } = useQuery({
    queryKey: ["agent-config"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      return data;
    },
    refetchInterval: 30000,
  });

  // Últimas ações do agente
  const { data: actionLogs = [] } = useQuery({
    queryKey: ["agent-action-logs"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("agent_actions_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // Breakdowns demográficos
  const { data: demoData = [], isLoading: loadingDemo } = useQuery({
    queryKey: ["demographic-heatmap"],
    queryFn: async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const getLocalDateStr = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      const { data } = await (supabase as any)
        .from("demographic_metrics")
        .select("age_range, gender, spend, conversions, clicks, impressions")
        .gte("date", getLocalDateStr(thirtyDaysAgo));
      return data ?? [];
    },
  });

  // Memória do agente
  const { data: memory = [] } = useQuery({
    queryKey: ["agent-memory"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("agent_memory")
        .select("*")
        .order("updated_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
  });

  // Alertas recentes
  const { data: alerts = [] } = useQuery({
    queryKey: ["agent-alerts"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("alerts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    refetchInterval: 15000,
  });

  // Disparar heartbeat
  const triggerHeartbeat = async () => {
    setRunningHeartbeat(true);
    const t = toast.loading("🤖 Agente operando... Sincronizando e avaliando regras...");
    try {
      const { data, error } = await supabase.functions.invoke("agent-heartbeat");
      if (error) throw error;
      toast.success(`✅ Heartbeat concluído: ${data.actions_taken} ações executadas, ${data.alerts_generated} alertas.`, { id: t, duration: 6000 });
      qc.invalidateQueries();
    } catch (err: any) {
      toast.error(err.message || "Falha no heartbeat", { id: t });
    } finally {
      setRunningHeartbeat(false);
    }
  };

  // Calcular heatmap
  const heatmap = buildHeatmap(demoData);
  const maxCpa = Math.max(...Object.values(heatmap).map((v: any) => v.cpa ?? 0).filter(Boolean));
  const minCpa = Math.min(...Object.values(heatmap).filter((v: any) => v.cpa !== null).map((v: any) => v.cpa));

  const lastSync = config?.last_heartbeat_at ? new Date(config.last_heartbeat_at) : null;
  const summary = config?.last_heartbeat_summary as any;
  const isOnline = config?.last_heartbeat_status === "success";

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <PageHeader
        eyebrow="Núcleo Autônomo"
        title="Centro de Controle do Agente"
        description="O agente opera 24/7 — sincroniza dados, avalia regras e executa ações na Meta API sem intervenção manual."
        actions={
          <button
            onClick={triggerHeartbeat}
            disabled={runningHeartbeat}
            className="flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2.5 text-xs font-black text-background shadow-glow transition hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            {runningHeartbeat ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
            {runningHeartbeat ? "AGENTE OPERANDO..." : "DISPARAR HEARTBEAT"}
          </button>
        }
      />

      {/* Status Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatusCard icon={isOnline ? Wifi : WifiOff} label="Status do Agente" value={isOnline ? "Online" : "Aguardando"} color={isOnline ? "text-success" : "text-muted-foreground"} />
        <StatusCard icon={Clock} label="Último Heartbeat" value={lastSync ? formatRelative(lastSync) : "Nunca"} color="text-primary" />
        <StatusCard icon={Zap} label="Ações Executadas" value={summary?.actions_taken ?? 0} color="text-violet-600 dark:text-violet-400" />
        <StatusCard icon={AlertTriangle} label="Alertas Gerados" value={summary?.alerts_generated ?? 0} color="text-accent" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Mapa Demográfico (Idade × Gênero) */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Users className="h-4 w-4 text-primary" />
            </div>
            <h3 className="header-sport font-display font-bold">Mapa Demográfico — CPA por Segmento</h3>
          </div>
          <p className="mb-4 text-xs text-muted-foreground">Menor CPA = melhor conversão. Verde = eficiente, Vermelho = problemático.</p>
          {loadingDemo ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : demoData.length === 0 ? (
            <EmptyDemo />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="pb-2 text-left text-muted-foreground font-mono">Idade \ Gênero</th>
                    {GENDERS.map(g => <th key={g} className="pb-2 text-center font-mono text-muted-foreground">{GENDER_LABEL[g]}</th>)}
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {AGE_RANGES.map(age => (
                    <tr key={age}>
                      <td className="py-1 pr-3 font-mono text-muted-foreground">{age}</td>
                      {GENDERS.map(gender => {
                        const cell = heatmap[`${age}__${gender}`];
                        if (!cell || cell.cpa === null) return (
                          <td key={gender} className="py-1 text-center">
                            <span className="rounded px-2 py-1 bg-white/5 text-muted-foreground/30">—</span>
                          </td>
                        );
                        const intensity = maxCpa > minCpa ? (cell.cpa - minCpa) / (maxCpa - minCpa) : 0;
                        const bg = getHeatColor(intensity);
                        return (
                          <td key={gender} className="py-1 text-center">
                            <div className={`mx-auto w-fit rounded-lg px-2 py-1.5 font-mono text-[11px] font-bold ${bg}`} title={`CPA: R$${cell.cpa.toFixed(2)} | Conv: ${cell.conversions} | Gasto: R$${cell.spend.toFixed(0)}`}>
                              R${cell.cpa.toFixed(0)}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {minCpa !== Infinity && (
                <div className="mt-3 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-emerald-500/40" /> Melhor CPA: R${minCpa.toFixed(2)}</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-red-500/40" /> Pior CPA: R${maxCpa.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Log de Ações do Agente */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-panel card-sport p-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
              <Activity className="h-4 w-4 text-primary" />
            </div>
            <h3 className="header-sport font-display font-bold">Log de Ações do Agente</h3>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar">
            {actionLogs.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma ação executada ainda. Dispare o heartbeat.</p>
            ) : actionLogs.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 rounded-lg border border-white/5 bg-background/30 p-3">
                <div className={`mt-0.5 h-5 w-5 shrink-0 flex items-center justify-center rounded-full ${log.meta_api_success ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"}`}>
                  {log.meta_api_success ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate">{log.target_name || log.target_external_id}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    <span className="rounded bg-primary/10 px-1 text-primary font-bold">{log.action_type}</span>
                    {" "}{log.metric_triggered?.toUpperCase()} = {log.metric_value?.toFixed(2)} (limite: {log.metric_threshold})
                  </p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatRelative(new Date(log.created_at))}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Memória do Agente */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-panel card-sport p-6">
          <div className="mb-4 flex items-center gap-2">
            <Brain className="h-4 w-4 text-violet-600 dark:text-violet-400" />
            <h3 className="font-display font-semibold">Memória Persistente do Agente</h3>
          </div>
          <div className="space-y-2">
            {memory.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sem memória registrada. O agente aprende após o primeiro heartbeat.</p>
            ) : memory.map((m: any) => (
              <div key={m.id} className="rounded-lg border border-white/5 bg-background/30 p-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">{m.key.replace(/_/g, " ")}</p>
                <pre className="text-[10px] text-muted-foreground overflow-x-auto">{JSON.stringify(m.value, null, 2)}</pre>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Alertas Recentes */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-panel card-sport p-6">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-accent" />
            <h3 className="font-display font-semibold">Alertas Recentes</h3>
          </div>
          <div className="space-y-2 max-h-[340px] overflow-y-auto custom-scrollbar">
            {alerts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Nenhum alerta. Tudo dentro dos limites.</p>
            ) : alerts.map((a: any) => (
              <div key={a.id} className={`rounded-lg border p-3 ${a.severity === "critical" ? "border-red-500/30 bg-red-500/5" : "border-amber-500/20 bg-amber-500/5"}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full ${a.severity === "critical" ? "bg-red-400" : "bg-amber-400"}`} />
                  <p className="text-xs font-semibold">{a.title}</p>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">{a.message}</p>
                <p className="mt-1 text-[10px] text-muted-foreground/40">{formatRelative(new Date(a.created_at))}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildHeatmap(rows: any[]) {
  const map: Record<string, any> = {};
  for (const row of rows) {
    const key = `${row.age_range}__${row.gender}`;
    if (!map[key]) map[key] = { spend: 0, conversions: 0, clicks: 0, impressions: 0, age_range: row.age_range, gender: row.gender };
    map[key].spend += row.spend || 0;
    map[key].conversions += row.conversions || 0;
    map[key].clicks += row.clicks || 0;
    map[key].impressions += row.impressions || 0;
  }
  for (const k of Object.keys(map)) {
    const seg = map[k];
    seg.cpa = seg.conversions > 0 ? seg.spend / seg.conversions : null;
    seg.ctr = seg.impressions > 0 ? (seg.clicks / seg.impressions) * 100 : 0;
  }
  return map;
}

function getHeatColor(intensity: number): string {
  if (intensity < 0.25) return "bg-emerald-500/30 text-emerald-300";
  if (intensity < 0.5) return "bg-yellow-500/20 text-yellow-300";
  if (intensity < 0.75) return "bg-orange-500/25 text-orange-300";
  return "bg-red-500/30 text-red-300";
}

function formatRelative(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

function StatusCard({ icon: Icon, label, value, color }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="label-mono text-muted-foreground text-[10px]">{label}</p>
        <Icon className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className={`font-display text-xl font-bold ${color}`}>{value}</p>
    </motion.div>
  );
}

function EmptyDemo() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/20" />
      <p className="text-sm text-muted-foreground font-medium">Dados demográficos não disponíveis.</p>
      <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">Dispare o heartbeat para sincronizar breakdowns de idade × gênero</p>
    </div>
  );
}
