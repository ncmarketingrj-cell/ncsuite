import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { 
  FileText, Download, Printer, ArrowLeft, Target, 
  Calendar, CheckCircle2, Loader2, Globe, Brain,
  TrendingUp, Users, PieChart
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Gerador de Relatórios — NC Suite" }] }),
  component: RelatoriosPage,
});

function RelatoriosPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [days, setDays] = useState<number>(30);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedReport, setGeneratedReport] = useState<any>(null);

  const reportRef = useRef<HTMLDivElement>(null);

  // Fetch das contas
  const { data: accounts = [] } = useQuery({
    queryKey: ["ad-accounts-reports"],
    queryFn: async () => {
      const { data } = await supabase.from("ad_accounts").select("*").order("name");
      return (data as any[]) ?? [];
    },
  });

  const handleGenerate = async () => {
    setIsGenerating(true);
    setGeneratedReport(null);

    try {
      const dateLimit = subDays(new Date(), days).toISOString();

      // Puxar métricas globais
      let qMetrics = supabase.from("metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qMetrics = qMetrics.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: metrics } = await qMetrics;

      // Puxar demográficos
      let qDemos = supabase.from("demographic_metrics").select(`*, campaigns!inner(ad_account_id)`).gte('date', dateLimit);
      if (selectedAccountId !== "all") {
        qDemos = qDemos.eq("campaigns.ad_account_id", selectedAccountId);
      }
      const { data: demos } = await qDemos;

      // Cálculos
      let cost = 0, conversions = 0, clicks = 0, impressions = 0, reach = 0;
      (metrics || []).forEach((m: any) => {
        cost += Number(m.cost || 0);
        conversions += Number(m.conversions || 0);
        clicks += Number(m.clicks || 0);
        impressions += Number(m.impressions || 0);
        reach += Number(m.reach || 0);
      });

      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpa = conversions > 0 ? cost / conversions : 0;

      // Top Público
      const demoMap = new Map();
      (demos || []).forEach((d: any) => {
        if (!d.age_range || !d.gender || d.gender === 'unknown') return;
        const key = `${d.age_range}-${d.gender}`;
        const cur = demoMap.get(key) || { name: key, conversions: 0 };
        cur.conversions += Number(d.conversions || 0);
        demoMap.set(key, cur);
      });
      const topDemo = Array.from(demoMap.values()).sort((a, b) => b.conversions - a.conversions)[0];

      // Top Plataforma
      const platMap = new Map();
      (demos || []).forEach((d: any) => {
        if (!d.platform) return;
        const p = d.platform;
        const cur = platMap.get(p) || { name: p, spend: 0 };
        cur.spend += Number(d.spend || 0);
        platMap.set(p, cur);
      });
      const topPlatform = Array.from(platMap.values()).sort((a, b) => b.spend - a.spend)[0];

      const accountName = selectedAccountId === "all" ? "Múltiplas Contas" : accounts.find(a => a.id === selectedAccountId)?.name;

      setTimeout(() => {
        setGeneratedReport({
          dateGenerated: new Date().toISOString(),
          period: `${days} dias`,
          accountName,
          cost, conversions, clicks, impressions, reach, ctr, cpa,
          topDemo: topDemo ? `${topDemo.name.split('-')[1] === 'female' ? 'Mulheres' : 'Homens'} ${topDemo.name.split('-')[0]}` : "N/D",
          topPlatform: topPlatform?.name || "N/D"
        });
        setIsGenerating(false);
      }, 1500); // Finge um processamento para efeito visual
      
    } catch (e) {
      console.error(e);
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-20">
      
      {/* HEADER TÉCNICO */}
      <div className="flex items-center gap-3 border-b border-white/5 pb-8 print:hidden">
        <Link to="/dashboard" className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </Link>
        <div>
          <h1 className="text-3xl font-black tracking-tighter text-gradient uppercase">Motor de Relatórios</h1>
          <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase mt-1">Extração Dinâmica de Performance</p>
        </div>
      </div>

      {/* ÁREA DE CONTROLES (Não aparece na impressão) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:hidden">
        <div className="glass-panel p-6 md:col-span-2 flex flex-col sm:flex-row gap-4 items-end">
          
          <div className="flex-1 w-full space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Conta Analisada</label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              <select 
                value={selectedAccountId} 
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-background/50 pl-10 pr-4 py-3 text-sm font-bold focus:border-primary focus:outline-none appearance-none"
              >
                <option value="all">Visão Consolidada (Global)</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="w-full sm:w-48 space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Período de Extração</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
              <select 
                value={days} 
                onChange={(e) => setDays(Number(e.target.value))}
                className="w-full rounded-xl border border-white/10 bg-background/50 pl-10 pr-4 py-3 text-sm font-bold focus:border-primary focus:outline-none appearance-none"
              >
                <option value={7}>Últimos 7 dias</option>
                <option value={14}>Últimos 14 dias</option>
                <option value={30}>Últimos 30 dias</option>
                <option value={90}>Últimos 90 dias</option>
              </select>
            </div>
          </div>

        </div>

        <div className="glass-panel p-6 flex flex-col justify-center border-primary/20 bg-primary/[0.02]">
           <button 
             onClick={handleGenerate}
             disabled={isGenerating}
             className="w-full group relative flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-primary px-5 py-4 text-sm font-black uppercase tracking-widest text-primary-foreground transition-all hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
           >
             {isGenerating ? (
               <><Loader2 className="h-5 w-5 animate-spin" /> Compilando...</>
             ) : (
               <><FileText className="h-5 w-5" /> Gerar Documento</>
             )}
           </button>
        </div>
      </div>

      {/* ÁREA DO RELATÓRIO GERADO */}
      <AnimatePresence>
        {generatedReport && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex justify-end gap-3 print:hidden">
              <button 
                onClick={handlePrint}
                className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition"
              >
                <Printer className="h-4 w-4" /> Imprimir / PDF
              </button>
            </div>

            {/* DOCUMENTO (Visível na tela e na impressão) */}
            <div ref={reportRef} className="glass-panel p-10 bg-background border-white/10 print:shadow-none print:border-none print:p-0 print:bg-white print:text-black">
              
              <div className="border-b border-white/10 print:border-black/10 pb-8 mb-8 flex justify-between items-start">
                <div>
                  <h2 className="text-3xl font-black tracking-tighter uppercase print:text-black">Relatório de Performance</h2>
                  <p className="text-primary font-mono text-sm mt-1 print:text-black/60">Sistema de Inteligência NC Suite</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Data da Extração</p>
                  <p className="text-sm font-mono font-bold print:text-black">{format(new Date(generatedReport.dateGenerated), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-8 mb-12">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Conta/Portfólio</p>
                  <p className="text-xl font-bold mt-1 print:text-black">{generatedReport.accountName}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Janela de Análise</p>
                  <p className="text-xl font-bold mt-1 print:text-black">{generatedReport.period}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-12">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Alcance</p>
                   <p className="text-xl font-mono font-black mt-2 print:text-black">{generatedReport.reach.toLocaleString('pt-BR')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Impressões</p>
                   <p className="text-xl font-mono font-black mt-2 print:text-black">{generatedReport.impressions.toLocaleString('pt-BR')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Investimento</p>
                   <p className="text-xl font-mono font-black mt-2 print:text-black">R$ {generatedReport.cost.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Resultados</p>
                   <p className="text-xl font-mono font-black mt-2 text-secondary print:text-black">+{generatedReport.conversions.toLocaleString('pt-BR')}</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 print:bg-gray-100 print:border-gray-200">
                   <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Custo por Resultado</p>
                   <p className="text-xl font-mono font-black mt-2 print:text-black">R$ {generatedReport.cpa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>

              <div className="border-t border-white/10 print:border-black/10 pt-8 mt-8">
                 <h3 className="text-lg font-black uppercase tracking-tight mb-6 print:text-black flex items-center gap-2">
                   <Brain className="h-5 w-5 text-primary print:text-black" />
                   Análise e Breakdowns
                 </h3>
                 
                 <div className="grid lg:grid-cols-2 gap-6">
                   <div className="flex items-center gap-4 p-5 rounded-xl bg-primary/5 border border-primary/20 print:bg-white print:border-gray-300">
                      <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Público de Alta Conversão</p>
                        <p className="text-lg font-bold print:text-black">{generatedReport.topDemo}</p>
                      </div>
                   </div>

                   <div className="flex items-center gap-4 p-5 rounded-xl bg-secondary/5 border border-secondary/20 print:bg-white print:border-gray-300">
                      <div className="h-12 w-12 rounded-full bg-secondary/20 flex items-center justify-center">
                        <PieChart className="h-6 w-6 text-secondary" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground print:text-black/50">Plataforma Principal</p>
                        <p className="text-lg font-bold print:text-black capitalize">{generatedReport.topPlatform}</p>
                      </div>
                   </div>
                 </div>
              </div>

              <div className="mt-16 pt-8 border-t border-white/5 print:border-black/5 text-center">
                <p className="text-[10px] font-mono text-muted-foreground print:text-black/40">Este documento foi gerado de forma autônoma pela Inteligência Artificial do NC Performance Suite.</p>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .glass-panel { background: white !important; box-shadow: none !important; }
          .text-gradient { background: none !important; -webkit-text-fill-color: black !important; color: black !important; }
        }
      `}</style>
    </div>
  );
}
