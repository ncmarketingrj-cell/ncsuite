import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Zap, Check, X, Loader2, Play, Pause, TrendingUp, TrendingDown, Clock, Activity, FileText, History, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useAutomations, type AutomationRule } from "@/hooks/useAutomations";
import { useCampaigns } from "@/hooks/useCampaigns";
import { usePortfolios } from "@/hooks/usePortfolios";

export const Route = createFileRoute("/_app/automacoes")({
  head: () => ({ meta: [{ title: "Automações — NC Suite" }] }),
  component: AutomationsPage,
});

function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<"rules" | "logs" | "schedules">("rules");
  const { rules, logs, isLoadingRules, isLoadingLogs, addRule, updateRule, removeRule } = useAutomations();
  const [modal, setModal] = useState(false);
  
  const { campaigns } = useCampaigns();
  const { portfolios } = usePortfolios();

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-20">
      <PageHeader 
        eyebrow="Inteligência Artificial" 
        title="Motor de Automação" 
        description="Regras de proteção de ROAS, CPA e agendamentos inteligentes (Dayparting) operando em tempo real."
        actions={
          <button onClick={() => setModal(true)} className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-5 py-2.5 text-xs font-bold text-background shadow-glow transition hover:scale-105 active:scale-95">
            <Zap className="h-4 w-4 fill-current" /> Criar Nova Regra
          </button>
        }
      />

      <div className="flex space-x-1 rounded-xl bg-background/50 p-1 w-fit border border-white/5 backdrop-blur-md">
        {[
          { id: "rules", label: "Regras Ativas", icon: ListChecks },
          { id: "schedules", label: "Dayparting", icon: Clock },
          { id: "logs", label: "Histórico (Logs)", icon: History },
        ].map((tab) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold transition ${activeTab === tab.id ? "bg-white/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <tab.icon className="h-3.5 w-3.5" /> {tab.label.toUpperCase()}
          </button>
        ))}
      </div>

      {activeTab === "rules" && (
        <div className="space-y-4">
          {isLoadingRules ? (
            <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary/50" /></div>
          ) : !rules.length ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel py-20 text-center flex flex-col items-center">
              <div className="h-16 w-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <Zap className="h-8 w-8 text-muted-foreground/30" />
              </div>
              <p className="text-sm text-muted-foreground">Nenhuma automação configurada no momento.</p>
              <button onClick={() => setModal(true)} className="mt-4 text-xs font-bold text-primary hover:underline">Configurar minha primeira regra</button>
            </motion.div>
          ) : (
            <div className="grid gap-3">
              {rules.map((rule, i) => (
                <motion.div 
                  key={rule.id} 
                  initial={{ opacity: 0, x: -10 }} 
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-panel flex items-center justify-between p-5 hover:border-primary/30"
                >
                  <div className="flex items-center gap-5">
                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition ${rule.status === 'active' ? 'bg-primary/10 text-primary shadow-glow-sm' : 'bg-white/5 text-muted-foreground'}`}>
                      <Zap className={`h-6 w-6 ${rule.status === 'active' ? 'animate-pulse' : ''}`} />
                    </div>
                    <div>
                      <h4 className="font-bold text-base">{rule.name}</h4>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="label-mono text-primary font-bold">{rule.metric} {rule.condition} {rule.value}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{rule.time_window.replace('_', ' ')}</span>
                        <span className="h-1 w-1 rounded-full bg-white/20" />
                        <span className="text-[10px] text-white font-bold bg-white/10 px-2 py-0.5 rounded-full">{rule.action_type.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-[10px] text-muted-foreground mr-4 hidden md:block">
                      <p className="font-bold uppercase tracking-tighter">NÍVEL: {rule.target_level}</p>
                      <p>FREQUÊNCIA: {rule.evaluation_frequency}</p>
                    </div>
                    <div className="h-8 w-px bg-white/5 hidden md:block" />
                    <button onClick={() => updateRule.mutate({ id: rule.id, status: rule.status === 'active' ? 'paused' : 'active' })} 
                      className={`h-9 w-9 flex items-center justify-center rounded-lg transition ${rule.status === 'active' ? 'bg-white/5 text-muted-foreground hover:bg-white/10' : 'bg-primary/20 text-primary hover:bg-primary/30'}`}
                      title={rule.status === 'active' ? 'Pausar regra' : 'Ativar regra'}
                    >
                      {rule.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}
                    </button>
                    <button onClick={() => removeRule.mutate(rule.id)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-destructive/10 text-destructive transition hover:bg-destructive/20">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === "logs" && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel overflow-hidden">
          <div className="p-4 border-b border-white/5 bg-white/20">
            <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-primary" /> Histórico de Execução do Robô
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/5 bg-white/5">
                <tr>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Timestamp</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Regra</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Ação</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Alvo</th>
                  <th className="p-4 font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Resultado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log, i) => (
                  <motion.tr 
                    key={log.id} 
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                    className="hover:bg-white/[0.03] transition group"
                  >
                    <td className="p-4 font-mono text-[10px] text-muted-foreground">{new Date(log.created_at).toLocaleString('pt-BR')}</td>
                    <td className="p-4 font-bold">{(log.automation_rules as any)?.name || "Regra Excluída"}</td>
                    <td className="p-4">
                      <span className="inline-flex items-center rounded-lg bg-white/10 px-2 py-1 text-[10px] font-bold uppercase">
                        {log.action_taken}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-white uppercase">{log.target_level}</span>
                        <span className="text-[9px] text-muted-foreground font-mono">{log.target_id === 'all' ? 'FULL SCOPE' : `ID: ${log.target_id.substring(0, 12)}...`}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex rounded-full px-3 py-1 text-[9px] font-black tracking-tighter ${log.status === 'success' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                        {log.status.toUpperCase()}
                      </span>
                    </td>
                  </motion.tr>
                ))}
                {!logs.length && (
                  <tr>
                    <td colSpan={5} className="p-12 text-center text-muted-foreground italic text-xs">O motor de automação está aguardando o primeiro gatilho...</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {activeTab === "schedules" && (
         <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="glass-panel py-20 text-center flex flex-col items-center">
            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mb-6 shadow-glow-sm">
              <Clock className="h-8 w-8 text-primary animate-pulse" />
            </div>
            <h3 className="font-display text-xl font-bold mb-2">Agendamentos Inteligentes (Dayparting)</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Em breve você poderá otimizar seus orçamentos por hora e dia da semana automaticamente.
            </p>
            <div className="mt-8 flex gap-3">
              <div className="h-8 w-24 rounded-lg bg-white/5 animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-white/5 animate-pulse" />
              <div className="h-8 w-24 rounded-lg bg-white/5 animate-pulse" />
            </div>
         </motion.div>
      )}

      {/* Modal Nova Regra */}
      <AnimatePresence>
        {modal && <RuleModal 
          onClose={() => setModal(false)}
          onSave={(data: any) => {
             addRule.mutate(data);
             setModal(false);
          }}
          campaigns={campaigns}
          portfolios={portfolios}
        />}
      </AnimatePresence>
    </div>
  );
}

function RuleModal({ onClose, onSave, campaigns, portfolios }: any) {
  const [name, setName] = useState("");
  const [metric, setMetric] = useState("roas");
  const [condition, setCondition] = useState("<");
  const [value, setValue] = useState("");
  const [timeWindow, setTimeWindow] = useState("today");
  const [actionType, setActionType] = useState("pause");
  const [targetLevel, setTargetLevel] = useState("account");

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="glass-panel w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/5 p-6 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center text-primary">
              <Zap className="h-6 w-6 fill-current" />
            </div>
            <div>
              <h3 className="font-display text-xl font-bold">Configurar Automação</h3>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Defina as regras do motor de IA</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10 transition"><X className="h-5 w-5" /></button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-primary">Identificação da Regra</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Pausar Campanha Ruim (ROAS < 1.0)" className="w-full rounded-xl border border-white/10 bg-background/50 px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/30 focus:outline-none transition shadow-inner" />
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-primary">1. Gatilho de Performance</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-white/5 rounded-2xl border border-white/10">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Métrica</label>
                <select value={metric} onChange={(e) => setMetric(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none cursor-pointer">
                  <option value="roas">ROAS</option>
                  <option value="cpa">CPA</option>
                  <option value="cpl">CPL</option>
                  <option value="spend">Gasto Diário</option>
                  <option value="ctr">CTR (%)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Condição</label>
                <select value={condition} onChange={(e) => setCondition(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none cursor-pointer">
                  <option value="<">Abaixo de (&lt;)</option>
                  <option value=">">Acima de (&gt;)</option>
                  <option value="<=">Igual ou Menor (&lt;=)</option>
                  <option value=">=">Igual ou Maior (&gt;=)</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Valor Alvo</label>
                <input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex: 1.50" className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none" />
              </div>
              <div className="col-span-1 sm:col-span-3 space-y-1.5 pt-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Janela de Comparação</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['today', 'yesterday', 'last_3_days', 'last_7_days'].map((w) => (
                    <button key={w} onClick={() => setTimeWindow(w)} className={`px-3 py-2 rounded-lg text-[10px] font-bold border transition ${timeWindow === w ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-background border-white/5 text-muted-foreground hover:border-white/20'}`}>
                      {w.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-primary">2. Ação Inteligente</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-5 bg-white/5 rounded-2xl border border-white/10">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">O que o Robô deve fazer?</label>
                <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none cursor-pointer">
                  <option value="pause">🛑 Pausar Ativo</option>
                  <option value="start">🚀 Ativar Ativo</option>
                  <option value="increase_budget">📈 Escalar Orçamento (+20%)</option>
                  <option value="decrease_budget">📉 Reduzir Orçamento (-20%)</option>
                  <option value="notify">🔔 Apenas Notificar</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase">Em qual nível?</label>
                <select value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)} className="w-full rounded-lg border border-white/10 bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none cursor-pointer">
                  <option value="account">Toda a Conta de Anúncios</option>
                  <option value="portfolio">Portfólios Selecionados</option>
                  <option value="campaign">Campanhas Individuais</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3 justify-end border-t border-white/10 p-6 bg-white/5 backdrop-blur-xl">
          <button onClick={onClose} className="rounded-full border border-white/10 px-6 py-2.5 text-xs font-bold text-muted-foreground hover:bg-white/5 transition">CANCELAR</button>
          <button onClick={() => onSave({ 
              name, metric, condition, value: Number(value), time_window: timeWindow, action_type: actionType, target_level: targetLevel, status: 'active', evaluation_frequency: '1h'
            })} 
            className="rounded-full bg-gradient-to-r from-primary to-secondary px-8 py-2.5 text-xs font-black text-background shadow-glow hover:scale-105 active:scale-95 transition"
          >
            CONFIRMAR E ATIVAR
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
