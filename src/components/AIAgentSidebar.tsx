import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Bot, Sparkles, TrendingUp, Search, Loader2, User, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Message = { role: "user" | "assistant"; content: string; timestamp: Date };

interface AIAgentSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AIAgentSidebar({ isOpen, onClose }: AIAgentSidebarProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Olá! Sou seu assistente NC Performance. Como posso ajudar com suas campanhas hoje?", timestamp: new Date() }
  ]);

  useEffect(() => {
    const handleSetPrompt = (e: any) => {
      if (e.detail?.prompt) {
        setPrompt(e.detail.prompt);
      }
    };
    window.addEventListener('set-ai-prompt', handleSetPrompt);
    return () => window.removeEventListener('set-ai-prompt', handleSetPrompt);
  }, []);

  const handleSend = async () => {
    if (!prompt.trim() || loading) return;

    const userMsg: Message = { role: "user", content: prompt, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setPrompt("");
    setLoading(true);

    try {
      const requestMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));
      
      let responseText = "";
      try {
        const { data, error } = await supabase.functions.invoke("victoria-agent", {
          body: { messages: requestMessages }
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        responseText = data.message || "Comando processado com sucesso.";
      } catch (err: any) {
        console.warn("Victoria Edge Function failed, executing advanced frontend database-grounded fallback...", err);
        
        // 1. Buscar todas as campanhas do banco com suas métricas históricas completas
        const { data: campaignsRaw } = await supabase
          .from('campaigns')
          .select('name, status, budget, platform, metrics(cost, conversions, clicks, impressions)')
          .order('name');

        const campaigns = (campaignsRaw || []).map((c: any) => {
          const metrics = c.metrics || [];
          const cost = metrics.reduce((s: number, m: any) => s + Number(m.cost || 0), 0);
          const conversions = metrics.reduce((s: number, m: any) => s + Number(m.conversions || 0), 0);
          const clicks = metrics.reduce((s: number, m: any) => s + Number(m.clicks || 0), 0);
          const impressions = metrics.reduce((s: number, m: any) => s + Number(m.impressions || 0), 0);

          const cpl = conversions > 0 ? cost / conversions : 0;
          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

          return {
            name: c.name,
            status: c.status?.toUpperCase() || "PAUSED",
            budget: Number(c.budget || 0),
            platform: c.platform || "Meta Ads",
            totals: { cost, conversions, clicks, impressions, cpl, ctr }
          };
        });

        // Calcular estatísticas globais
        const totalInvest = campaigns.reduce((s, c) => s + c.totals.cost, 0);
        const totalConversions = campaigns.reduce((s, c) => s + c.totals.conversions, 0);
        const activeCount = campaigns.filter(c => c.status === "ACTIVE").length;
        const globalCpl = totalConversions > 0 ? totalInvest / totalConversions : 0;

        // Ordenar campanhas por gasto e performance
        const activeCampaigns = campaigns.filter(c => c.status === "ACTIVE");
        
        // Campanha mais eficiente
        const efficientCamp = [...activeCampaigns]
          .filter(c => c.totals.conversions > 0)
          .sort((a, b) => a.totals.cpl - b.totals.cpl)[0];

        // Campanha menos eficiente
        const inefficientCamp = [...activeCampaigns]
          .sort((a, b) => {
            if (a.totals.conversions === 0 && b.totals.conversions > 0) return -1;
            if (b.totals.conversions === 0 && a.totals.conversions > 0) return 1;
            return b.totals.cpl - a.totals.cpl;
          })[0];

        let analysisText = `### 🤖 Comandante Estratégica Victoria AI v2.5\n\n`;
        analysisText += `Olá! Estou operando em **Modo Tático Local** conectada diretamente ao NC Database. Aqui está a minha **Auditoria de Performance das Campanhas**:\n\n`;

        analysisText += `#### 📊 Resumo Consolidado do Portfólio\n`;
        analysisText += `- **Investimento Total Acumulado**: R$ ${totalInvest.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}\n`;
        analysisText += `- **Leads / Conversões**: ${totalConversions} leads capturados\n`;
        analysisText += `- **CPL Médio Geral**: R$ ${globalCpl.toFixed(2)}\n`;
        analysisText += `- **Campanhas Ativas**: ${activeCount} no Meta Ads\n\n`;

        if (campaigns.length === 0) {
          analysisText += `⚠️ *Ainda não temos dados de campanhas registrados na base. Por favor, acesse a aba "Métricas" e sincronize seus dados para que eu possa fazer uma auditoria estratégica completa.*`;
        } else {
          analysisText += `#### 🎯 Auditoria Tática e Recomendações\n`;
          
          if (efficientCamp) {
            analysisText += `✅ **Campanha de Destaque (Alta Eficiência)**:\n`;
            analysisText += `  - **${efficientCamp.name}**\n`;
            analysisText += `  - CPL: **R$ ${efficientCamp.totals.cpl.toFixed(2)}** (Excepcional, abaixo da média geral!)\n`;
            analysisText += `  - Conversões: **${efficientCamp.totals.conversions}** leads\n`;
            analysisText += `  - *Recomendação*: Esta campanha possui o menor custo por lead. Recomendo **escalar o orçamento diário em 15%** para acelerar a aquisição de clientes.\n\n`;
          }

          if (inefficientCamp && inefficientCamp !== efficientCamp) {
            analysisText += `⚠️ **Alerta de Ineficiência (Gargalo de CPA)**:\n`;
            analysisText += `  - **${inefficientCamp.name}**\n`;
            analysisText += `  - Gasto Acumulado: **R$ ${inefficientCamp.totals.cost.toFixed(2)}**\n`;
            analysisText += `  - Conversões: **${inefficientCamp.totals.conversions}** leads\n`;
            if (inefficientCamp.totals.conversions === 0) {
              analysisText += `  - *Recomendação*: Esta campanha consumiu orçamento e gerou **ZERO leads**. Recomendo **pausar imediatamente** ou revisar a copy/público.\n\n`;
            } else {
              analysisText += `  - CPL Atual: **R$ ${inefficientCamp.totals.cpl.toFixed(2)}**\n`;
              analysisText += `  - *Recomendação*: O custo por lead está elevado. Sugiro analisar se a taxa de cliques (CTR de ${inefficientCamp.totals.ctr.toFixed(2)}%) está caindo, o que indica saturação do criativo.\n\n`;
            }
          }

          analysisText += `#### 🛠️ Plano de Ação Recomendado\n`;
          analysisText += `1. **Redirecionamento de Verba**: Pause os ativos com CPL muito alto e concentre o budget nas campanhas com performance sólida.\n`;
          analysisText += `2. **Ajuste Criativo**: Renove as peças se o CTR geral estiver abaixo de 1.20%.\n\n`;
          analysisText += `*Estou pronta para analisar breakdowns ou tirar mais dúvidas estratégicas. Como posso ajudar agora?*`;
        }
        responseText = analysisText;
      }

      const assistantMsg: Message = { 
        role: "assistant", 
        content: responseText, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      toast.error("Falha na comunicação com a Victoria.");
      console.error(err);
      const errorMsg: Message = { 
        role: "assistant", 
        content: `❌ Ocorreu um erro ao processar sua solicitação: ${err.message || "Serviço indisponível."}`, 
        timestamp: new Date() 
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  };

  const quickActions = [
    { icon: TrendingUp, label: "Como tá a performance?", prompt: "Analise a performance das minhas campanhas ativas nos últimos 7 dias." },
    { icon: Sparkles, label: "Escala budget em 15%", prompt: "Quais campanhas estão com ROI alto e podem ter o orçamento escalado em 15%?" },
    { icon: Search, label: "Analisa os breakdowns", prompt: "Faça um breakdown de idade e gênero das minhas campanhas de conversão." },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop on mobile */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 lg:hidden"
          />
          
          <motion.aside 
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 z-50 flex flex-col w-full sm:w-[380px] h-screen border-l border-white/5 bg-background/95 backdrop-blur-2xl overflow-hidden shadow-2xl"
          >
            <div className="p-5 border-b border-white/5 flex items-center justify-between bg-background/40">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center ring-1 ring-white/10 shadow-glow-sm">
                  <Bot className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-display font-bold text-sm tracking-tight text-foreground">Victoria AI</h3>
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1.5 uppercase font-black tracking-widest">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                    </span>
                    Sincronizada via NC Database
                  </p>
                </div>
              </div>
              <button 
                onClick={onClose} 
                className="p-2 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

      <div className="flex-1 overflow-y-auto p-5 custom-scrollbar flex flex-col gap-5">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
            >
              <div className={`flex items-center gap-2 mb-1 text-[10px] font-bold uppercase tracking-tighter ${msg.role === "user" ? "flex-row-reverse text-primary" : "text-muted-foreground"}`}>
                {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                {msg.role === "user" ? "Você" : "Victoria AI"}
              </div>
              <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs leading-relaxed shadow-sm ${
                msg.role === "user" 
                  ? "bg-primary text-primary-foreground font-medium rounded-tr-none" 
                  : "bg-white/5 border border-white/5 text-foreground rounded-tl-none"
              }`}>
                {msg.content}
              </div>
            </motion.div>
          ))}
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-xs text-muted-foreground animate-pulse px-2">
              <Loader2 className="h-3 w-3 animate-spin" /> Processando comando...
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 border-t border-white/5 bg-background/60 backdrop-blur-md">
        <div className="flex gap-2 flex-wrap mb-4">
          {quickActions.map((action, i) => (
            <button
              key={i}
              onClick={() => { setPrompt(action.prompt); }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all text-[10px] font-bold text-muted-foreground hover:text-primary active:scale-95"
            >
              <action.icon className="h-3 w-3" />
              {action.label}
            </button>
          ))}
        </div>
        
        <div className="relative group">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Comando para Meta Ads..."
            className="w-full bg-input/40 border border-white/10 rounded-xl pl-4 pr-12 py-3.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 focus:border-primary/40 transition-all placeholder:text-muted-foreground/30 shadow-inner"
          />
          <button 
            onClick={handleSend}
            disabled={loading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-primary text-primary-foreground rounded-lg hover:brightness-110 transition-all shadow-glow-sm disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[9px] text-center text-muted-foreground/30 mt-3 uppercase font-bold tracking-widest">
          IA Especialista em Tráfego Pago Automotivo
        </p>
      </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
