import { useState, useEffect } from "react";
import { createFileRoute, Outlet, redirect, Link, useRouterState } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, FileText, Upload, Settings, LogOut, Loader2,
  ChevronRight, Bell, Search, User, Bot, Sparkles, Activity, ShieldCheck, Zap, Info
} from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/AppSidebar";
import { Logo } from "@/components/Logo";
import { AIAgentSidebar } from "@/components/AIAgentSidebar";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: () => (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  ),
});

function Shell() {
  const { loading, user, signOut } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [isAgentOpen, setIsAgentOpen] = useState(false);
  const [showNotification, setShowNotification] = useState(false);

  useEffect(() => {
    const handleOpenAI = () => setIsAgentOpen(true);
    window.addEventListener('open-ai-agent', handleOpenAI);
    return () => window.removeEventListener('open-ai-agent', handleOpenAI);
  }, []);

  // Monitora as ações em tempo real do Agente de Automação
  const { data: recentLogs = [] } = useQuery({
    queryKey: ["header_automation_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_logs")
        .select("*, automation_rules(name)")
        .order("created_at", { ascending: false })
        .limit(3);
      
      if (error) return [];
      return data as any[];
    },
    refetchInterval: 30000, // Atualiza a cada 30 segundos
  });

  // Dispara uma notificação flutuante suave quando o agente executa uma ação
  useEffect(() => {
    if (recentLogs.length > 0) {
      const lastLog = recentLogs[0];
      const logTime = new Date(lastLog.created_at).getTime();
      const now = new Date().getTime();
      
      // Se a ação ocorreu nos últimos 2 minutos, exibe uma notificação para o usuário sentir a IA ativa!
      if (now - logTime < 120000) {
        setShowNotification(true);
        const timer = setTimeout(() => setShowNotification(false), 8000);
        return () => clearTimeout(timer);
      }
    }
  }, [recentLogs]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const segments = path.split("/").filter(Boolean);
  const breadcrumb = segments.length > 0 
    ? segments.map(s => s.charAt(0).toUpperCase() + s.slice(1).replace("-", " "))
    : ["Dashboard"];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/30">
      <AppSidebar />
      
      <div className="flex min-w-0 flex-1 flex-col relative overflow-hidden">
        <header className="h-14 border-b border-white/5 bg-background/50 backdrop-blur-xl flex items-center justify-between px-8 z-40 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/50">
              <span className="hover:text-primary transition-colors cursor-pointer hidden md:inline">NC Performance Suite</span>
              {breadcrumb.map((b, i) => (
                <div key={i} className="flex items-center gap-2">
                  <ChevronRight className="h-2.5 w-2.5 hidden md:block" />
                  <span className={i === breadcrumb.length - 1 ? "text-foreground" : ""}>{b}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6">
             <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/5 group focus-within:border-primary/50 transition-all">
                <Search className="h-3.5 w-3.5 text-muted-foreground group-focus-within:text-primary" />
                <input 
                  placeholder="Pesquisar métricas..." 
                  className="bg-transparent border-none outline-none text-[11px] w-32 focus:w-48 transition-all"
                />
             </div>

             <div className="flex items-center gap-4 border-l border-white/5 pl-6">
                
                {/* 🤖 MONITOR DE INTELIGÊNCIA ARTIFICIAL - VICTORIA AGENT */}
                <div className="relative group/agent">
                  <button 
                    onClick={() => setIsAgentOpen(!isAgentOpen)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-all duration-300 cursor-pointer shadow-glow-sm hover:scale-105 active:scale-95"
                  >
                     <Bot className="h-3.5 w-3.5 text-primary animate-pulse" />
                     <span className="text-[9px] font-black uppercase tracking-widest text-primary hidden sm:inline">Victoria IA Ativa</span>
                     <div className="h-1.5 w-1.5 rounded-full bg-success animate-ping" />
                  </button>

                  {/* Flyout detalhando a atividade do orquestrador de IA */}
                  <div className="pointer-events-none absolute right-0 top-full z-50 mt-2 w-80 origin-top-right scale-95 rounded-2xl border border-white/10 bg-background/95 p-4 opacity-0 shadow-2xl transition-all duration-200 group-hover/agent:pointer-events-auto group-hover/agent:scale-100 group-hover/agent:opacity-100 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2.5 mb-3">
                      <p className="text-[10px] font-black uppercase tracking-wider text-primary flex items-center gap-1.5">
                        <Sparkles className="h-3 w-3 text-primary animate-pulse" /> Victoria AI Engine
                      </p>
                      <span className="rounded-full bg-success/15 px-1.5 py-0.5 text-[8px] font-bold uppercase text-success flex items-center gap-1">
                        <span className="h-1 w-1 rounded-full bg-success animate-pulse" /> Autônomo
                      </span>
                    </div>

                    <div className="space-y-3">
                      <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Atividade Recente do Agente</p>
                      
                      {recentLogs.length > 0 ? (
                        <div className="space-y-2 max-h-[180px] overflow-y-auto custom-scrollbar pr-1">
                          {recentLogs.map((log: any) => (
                            <div key={log.id} className="rounded-lg bg-white/[0.02] border border-white/5 p-2 text-[10px]">
                              <p className="font-bold text-foreground flex items-center justify-between">
                                <span>{log.automation_rules?.name || "Regra de Otimização"}</span>
                                <span className="text-primary font-mono text-[8px]">
                                  {formatDistanceToNow(new Date(log.created_at), { locale: ptBR, addSuffix: false })}
                                </span>
                              </p>
                              <p className="text-muted-foreground mt-1 text-[9px] leading-relaxed">
                                {log.action_taken} {log.new_value !== null && `(Ajustado de ${log.old_value} para ${log.new_value})`}
                              </p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="rounded-xl bg-white/[0.02] border border-white/5 p-4 text-center">
                          <ShieldCheck className="h-6 w-6 text-success/70 mx-auto mb-2" />
                          <p className="text-[10px] text-foreground font-bold">Modo de Proteção Ativo</p>
                          <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed">
                            A IA está monitorando os KPIs de ROAS, CPA e orçamentos ativamente. Nenhuma intervenção ou desvio crítico nas últimas 24 horas.
                          </p>
                        </div>
                      )}

                      <div className="border-t border-white/5 pt-2.5 mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
                        <span className="font-medium">Sessão da IA: 24/7</span>
                        <button 
                          onClick={() => { setIsAgentOpen(true); }}
                          className="text-primary font-bold hover:underline uppercase tracking-tighter"
                        >
                          Abrir Console de Insights →
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button className="relative text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-white/5">
                  <Bell className="h-4 w-4" />
                  <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
                </button>
                
                <div className="flex items-center gap-3 pl-2 border-l border-white/5">
                   <div className="hidden text-right lg:block">
                      <p className="text-[10px] font-bold leading-none">{user?.email?.split('@')[0]}</p>
                      <button onClick={signOut} className="text-[9px] text-muted-foreground hover:text-destructive transition-colors font-bold uppercase tracking-tighter mt-1">Sair da conta</button>
                   </div>
                   <div className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 border border-white/10 flex items-center justify-center ring-1 ring-white/5 shadow-glow-sm">
                      <User className="h-4 w-4 text-primary" />
                   </div>
                </div>
             </div>
          </div>
        </header>
        
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-[radial-gradient(circle_at_top_right,rgba(var(--primary-rgb),0.03),transparent_40%)]">
          <div className="mx-auto max-w-[1400px] p-6 md:p-10 relative">
            
            {/* Notificação Flutuante de Ação Autônoma da IA */}
            <AnimatePresence>
              {showNotification && recentLogs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 50, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.9 }}
                  className="fixed bottom-6 right-6 z-50 max-w-sm rounded-2xl border border-primary/30 bg-background/95 p-4 shadow-2xl backdrop-blur-xl"
                >
                  <div className="flex items-start gap-3">
                    <div className="rounded-xl bg-primary/10 p-2 text-primary">
                      <Sparkles className="h-4 w-4 animate-spin-slow" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black uppercase tracking-wider text-primary">Ação de IA Executada!</p>
                      <p className="text-[11px] font-bold text-foreground mt-0.5">{recentLogs[0].automation_rules?.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{recentLogs[0].action_taken}</p>
                      <div className="mt-2.5 flex justify-end">
                        <Link to="/automacoes" className="text-[9px] font-black uppercase text-primary hover:underline">Ver Histórico de Logs</Link>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <Outlet />
          </div>
        </main>
      </div>

      <AIAgentSidebar isOpen={isAgentOpen} onClose={() => setIsAgentOpen(false)} />
    </div>
  );
}
