import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Loader2, Play, Pause, Clock, History, AlertTriangle, ShieldAlert, Plus, X, Server } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { getSyncStatus, useAutoSync } from "@/hooks/useAutoSync";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => ({ meta: [{ title: "Automações e Alertas — NC Suite" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<"thresholds" | "sync" | "logs">("thresholds");
  const [modal, setModal] = useState(false);
  const { user } = useAuth();
  const qc = useQueryClient();
  const syncStatus = getSyncStatus();
  const { runSync } = useAutoSync();

  // Buscar contas conectadas
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad_accounts"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return data || [];
    }
  });

  // Buscar thresholds
  const { data: thresholds = [], isLoading: loadingThresholds } = useQuery({
    queryKey: ["alert_thresholds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alert_thresholds")
        .select("*, ad_accounts(name)")
        .order("created_at", { ascending: false });
      return data || [];
    }
  });

  // Buscar histórico de sync
  const { data: syncHistory = [], isLoading: loadingSync } = useQuery({
    queryKey: ["sync_history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sync_history")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    }
  });

  const toggleThreshold = useMutation({
    mutationFn: async ({ id, is_active }: { id: string, is_active: boolean }) => {
      const { error } = await supabase.from("alert_thresholds").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      toast.success("Status atualizado!");
    }
  });

  const deleteThreshold = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("alert_thresholds").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      toast.success("Alerta removido!");
    }
  });

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20 p-2">
      <PageHeader 
        eyebrow="Monitoramento Inteligente" 
        title="Motor de Alertas e Sincronização" 
        description="Configure tetos de CPL e monitore o orçamento diário das suas campanhas. O sistema notificará visual e sonoramente caso os limites sejam ultrapassados."
        actions={
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2.5 text-xs font-bold text-background shadow-glow transition hover:scale-105 active:scale-95">
            <ShieldAlert className="h-4 w-4 fill-current" /> Novo Alerta de Conta
          </button>
        }
      />

      <div className="flex space-x-1 rounded-xl bg-background/50 p-1 w-fit border border-white/5 backdrop-blur-md">
        {[
          { id: "thresholds", label: "Limites de Alerta (CPL)", icon: AlertTriangle },
          { id: "sync", label: "Motor de Sincronização", icon: Server },
          { id: "logs", label: "Histórico de Sync", icon: History },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === tab.id ? "bg-white/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <tab.icon className="h-3.5 w-3.5" /> {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {activeTab === "thresholds" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 text-sm mb-6">
            <h5 className="font-bold text-primary flex items-center gap-2 mb-1.5">
              <span>💡</span> Como funcionam os Alertas Críticos?
            </h5>
            <p className="text-xs text-muted-foreground leading-relaxed">
              O NC Suite avalia todas as campanhas ativas de uma conta a cada 30 minutos. Se o CPL atual ultrapassar o teto configurado, ou se a campanha estiver prestes a esgotar o Orçamento Diário estipulado no Meta Ads, o sistema emitirá um alerta sonoro contínuo e uma notificação de browser (mesmo com o dashboard minimizado) para que o gestor intervenha imediatamente.
            </p>
          </div>

          {loadingThresholds ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/50" /></div>
          ) : !thresholds.length ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel py-20 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4 ring-1 ring-white/10">
                <ShieldAlert className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhum limite de alerta configurado.</p>
              <button onClick={() => setModal(true)} className="mt-4 text-xs font-bold text-primary hover:underline">Configurar Limite de Conta</button>
            </motion.div>
          ) : (
            <div className="grid gap-3">
              {thresholds.map((th: any, i: number) => (
                <motion.div 
                  key={th.id} 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel flex flex-col sm:flex-row sm:items-center justify-between p-5 hover:border-primary/30 gap-4"
                >
                  <div className="flex items-center gap-5">
                    <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition ${th.is_active ? 'bg-primary/10 text-primary shadow-glow-sm' : 'bg-white/5 text-muted-foreground'}`}>
                      <AlertTriangle className={`h-6 w-6 ${th.is_active ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-foreground/90">
                        {th.ad_accounts?.name || (th.ad_account_id === null ? 'Todas as Contas Meta' : 'Conta Desconhecida')}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5">
                        {th.max_cpl !== null && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            MAX CPL: <strong className="text-primary text-[11px]">R$ {th.max_cpl.toFixed(2)}</strong>
                          </span>
                        )}
                        {th.max_budget_pct !== null && (
                          <span className="inline-flex items-center gap-1 rounded bg-white/5 px-2 py-1 text-[10px] font-mono text-muted-foreground">
                            ALERTA BUDGET: <strong className="text-orange-400 text-[11px]">{th.max_budget_pct}%</strong>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 sm:ml-auto">
                    <button onClick={() => toggleThreshold.mutate({ id: th.id, is_active: !th.is_active })} 
                      className={`h-9 px-3 flex items-center justify-center rounded-lg transition text-xs font-bold ${th.is_active ? 'bg-white/5 text-muted-foreground hover:bg-white/10' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
                    >
                      {th.is_active ? <><Pause className="h-3.5 w-3.5 mr-1" /> PAUSAR</> : <><Play className="h-3.5 w-3.5 mr-1 fill-current" /> ATIVAR</>}
                    </button>
                    <button onClick={() => deleteThreshold.mutate(th.id)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive transition hover:bg-destructive/20">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "sync" && (
        <div className="space-y-6">
          <div className="glass-panel p-6 flex flex-col md:flex-row gap-6 items-center justify-between border-primary/20">
            <div className="space-y-2 text-center md:text-left">
              <h3 className="text-lg font-bold flex items-center gap-2 justify-center md:justify-start">
                <Server className="h-5 w-5 text-primary" /> Status do Motor de Auto-Sync
              </h3>
              <p className="text-sm text-muted-foreground max-w-xl">
                O motor está configurado para sincronizar automaticamente com a Meta API a cada 30 minutos em background, processando todas as contas vinculadas.
              </p>
            </div>
            <div className="flex flex-col items-center justify-center bg-white/5 rounded-xl p-5 min-w-[200px] border border-white/10">
              <div className="relative">
                {syncStatus.isSyncing ? (
                  <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center mb-3">
                    <Loader2 className="h-8 w-8 text-primary animate-spin" />
                  </div>
                ) : (
                  <div className="h-16 w-16 rounded-full bg-success/20 flex items-center justify-center mb-3 ring-2 ring-success/30">
                    <Clock className="h-8 w-8 text-success" />
                  </div>
                )}
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">
                {syncStatus.isSyncing ? "SINCRONIZANDO AGORA" : "PRÓXIMA SINCRONIZAÇÃO EM"}
              </p>
              {!syncStatus.isSyncing && syncStatus.nextSync && (
                <p className="text-xl font-mono font-black text-foreground">
                  {formatDistanceToNow(new Date(syncStatus.nextSync), { locale: ptBR })}
                </p>
              )}
            </div>
          </div>
          
          <div className="flex justify-center">
             <button
                onClick={() => runSync("manual")}
                disabled={syncStatus.isSyncing}
                className="rounded-full bg-primary/20 text-primary border border-primary/30 px-8 py-3 text-sm font-bold shadow-glow hover:bg-primary/30 active:scale-95 transition disabled:opacity-50"
              >
                {syncStatus.isSyncing ? "Sincronização em Andamento..." : "Forçar Sincronização Agora"}
              </button>
          </div>
        </div>
      )}

      {activeTab === "logs" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/20 flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> 
            <h3 className="text-xs font-bold uppercase tracking-widest">Histórico de Extrações (Últimos 20)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/5 bg-white/5">
                <tr>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Data/Hora</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Status</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-center">Contas</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-center">Campanhas</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Gatilho</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loadingSync ? (
                   <tr><td colSpan={5} className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin text-primary/50 mx-auto" /></td></tr>
                ) : !syncHistory.length ? (
                   <tr><td colSpan={5} className="p-12 text-center text-muted-foreground italic text-xs">Nenhuma sincronização registrada.</td></tr>
                ) : syncHistory.map((log: any, i: number) => (
                   <motion.tr 
                     key={log.id} 
                     initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                     className="hover:bg-white/[0.03] transition group"
                   >
                     <td className="p-4 font-mono text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                     <td className="p-4">
                       <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black tracking-tighter ${
                         log.status === 'success' ? 'bg-success/20 text-success' : 
                         log.status === 'running' ? 'bg-primary/20 text-primary animate-pulse' : 
                         log.status === 'partial_success' ? 'bg-orange-500/20 text-orange-400' :
                         'bg-destructive/20 text-destructive'
                       }`}>
                         {log.status.toUpperCase()}
                       </span>
                       {log.error_message && <p className="text-[9px] text-destructive mt-1 max-w-xs truncate" title={log.error_message}>{log.error_message}</p>}
                     </td>
                     <td className="p-4 text-center font-mono font-bold">{log.accounts_synced || 0}</td>
                     <td className="p-4 text-center font-mono font-bold">{log.campaigns_synced || 0}</td>
                     <td className="p-4">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase bg-white/5 px-2 py-1 rounded">
                          {log.triggered_by === 'auto' ? 'BACKGROUND' : 'MANUAL'}
                        </span>
                     </td>
                   </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* Modal Novo Threshold */}
      <AnimatePresence>
        {modal && <ThresholdModal 
          onClose={() => setModal(false)}
          accounts={accounts}
          userId={user?.id}
          qc={qc}
        />}
      </AnimatePresence>
    </div>
  );
}

function ThresholdModal({ onClose, accounts, userId, qc }: any) {
  const [accountId, setAccountId] = useState("all");
  const [maxCpl, setMaxCpl] = useState("");
  const [maxBudgetPct, setMaxBudgetPct] = useState("90");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSave = async () => {
    const targetAccountId = accountId === "all" ? null : accountId;
    if (!maxCpl && !maxBudgetPct) return toast.error("Preencha pelo menos um alerta (CPL ou Orçamento)");
    
    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("alert_thresholds").insert({
        user_id: userId,
        ad_account_id: targetAccountId,
        max_cpl: maxCpl ? parseFloat(maxCpl) : null,
        max_budget_pct: maxBudgetPct ? parseInt(maxBudgetPct) : null,
        is_active: true
      });
      if (error) throw error;
      toast.success("Alerta configurado com sucesso!");
      qc.invalidateQueries({ queryKey: ["alert_thresholds"] });
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="glass-panel w-full max-w-lg overflow-hidden shadow-2xl border border-primary/20">
        <div className="flex items-center justify-between border-b border-white/5 p-6 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <ShieldAlert className="h-5 w-5 fill-current" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold">Novo Alerta de Conta</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Monitoramento de Orçamento e CPL</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10 transition"><X className="h-5 w-5" /></button>
        </div>
        
        <div className="p-6 space-y-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-muted-foreground uppercase">Conta de Anúncios</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none cursor-pointer">
              <option value="all">Todas as Contas Meta (Alerta Global)</option>
              {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">CPL Máximo Tolerado (R$)</label>
              <input type="number" step="0.01" value={maxCpl} onChange={(e) => setMaxCpl(e.target.value)} placeholder="Opcional: Ex: 15.50" className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none" />
              <p className="text-[9px] text-muted-foreground">Deixe em branco para ignorar</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-muted-foreground uppercase">Aviso de Orçamento (%)</label>
              <input type="number" value={maxBudgetPct} onChange={(e) => setMaxBudgetPct(e.target.value)} placeholder="Ex: 100" className="w-full rounded-lg border border-white/10 bg-background px-3 py-3 text-sm focus:border-primary focus:outline-none" />
              <p className="text-[9px] text-muted-foreground">Ex: 100% (Alerta se gastar todo o orçamento diário). Deixe em branco para ignorar</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end border-t border-white/10 p-6 bg-white/5">
          <button onClick={onClose} className="rounded-full px-5 py-2 text-xs font-bold text-muted-foreground hover:bg-white/10 transition">Cancelar</button>
          <button onClick={handleSave} disabled={isSubmitting} className="rounded-full bg-primary px-6 py-2 text-xs font-black text-background hover:scale-105 active:scale-95 transition flex items-center gap-2">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldAlert className="h-4 w-4" />} SALVAR ALERTA
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
