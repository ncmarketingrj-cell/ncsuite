import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  BarChart3, TrendingUp, Users, Globe, Eye, Sparkles, Heart, MessageSquare, 
  Share2, ArrowLeft, RefreshCw, AlertCircle, Info, Calendar, Download, FileText,
  Instagram, Facebook, ThumbsUp, ChevronDown, Check, Loader2, Bot, ArrowRight
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_app/social-insights")({
  head: () => ({ meta: [{ title: "Insights de Redes Sociais — NC Suite" }] }),
  component: SocialInsightsPage,
});

function SocialInsightsPage() {
  const qc = useQueryClient();
  const [selectedPage, setSelectedPage] = useState("all");
  const [timeRange, setTimeRange] = useState("30");
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);

  // Fetch meta configs
  const { data: metaConfig, isLoading: loadingConfig } = useQuery({
    queryKey: ["meta_social_configs_insights"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("meta_ads_configs").select("*").maybeSingle();
      return data as any;
    }
  });

  // Query social pages
  const { data: socialPages = [] } = useQuery({
    queryKey: ["social_pages_insights"],
    queryFn: async () => {
      const { data } = await supabase.from("social_pages").select("*").order("page_name");
      return data || [];
    }
  });

  const selectedPageObj = socialPages.find((sp: any) => sp.page_id === selectedPage);
  const isMetaConnected = socialPages.length > 0;

  // Mock insights data (in a real app, we would query the Facebook Graph API)
  const mockInsights = {
    followers_instagram: 15420,
    followers_facebook: 8940,
    followers_growth_insta: 4.8,
    followers_growth_fb: 1.2,
    reach_instagram: 48920,
    reach_facebook: 21300,
    reach_growth_insta: 12.4,
    reach_growth_fb: -3.5,
    visits_instagram: 12400,
    visits_facebook: 5410,
    visits_growth_insta: 8.9,
    visits_growth_fb: 2.1,
    engagement_instagram: 3420,
    engagement_facebook: 1150,
    engagement_growth_insta: 6.2,
    engagement_growth_fb: 0.8,
    demographics: {
      gender: { male: 68, female: 32 },
      age: [
        { range: "18-24", pct: 15 },
        { range: "25-34", pct: 42 },
        { range: "35-44", pct: 28 },
        { range: "45-54", pct: 11 },
        { range: "55+", pct: 4 }
      ]
    },
    top_posts: [
      { id: "1", title: "Lançamento Nova Tracker 2025", type: "reels", platform: "instagram", reach: 18400, likes: 1240, comments: 88, engRate: 7.2 },
      { id: "2", title: "Feirão Taxa Zero Especial", type: "feed", platform: "both", reach: 14200, likes: 920, comments: 120, engRate: 7.3 },
      { id: "3", title: "Dicas de Manutenção no Inverno", type: "stories", platform: "instagram", reach: 8900, likes: 310, comments: 15, engRate: 3.6 }
    ]
  };

  const handleSyncInsights = () => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1500)),
      {
        loading: "Conectando ao Graph API do Meta...",
        success: "Dados de Insights sincronizados com sucesso!",
        error: "Erro ao sincronizar dados."
      }
    );
  };

  const generateAiInsights = () => {
    setIsGeneratingAi(true);
    setTimeout(() => {
      setAiReport(
        `🤖 **Diagnóstico de Performance — Victoria AI**\n\n` +
        `📈 **Destaque do Período:** Seu alcance no **Instagram** cresceu **+12.4%**, impulsionado principalmente pelo formato **Reels**. O post sobre a *Nova Tracker 2025* obteve a melhor taxa de engajamento do período (${mockInsights.top_posts[0].engRate}%).\n\n` +
        `👥 **Público Automotivo:** A audiência é predominantemente **masculina (68%)** e concentrada na faixa de **25 a 34 anos (42%)**. Isso valida a abordagem de anúncios focada em custo-benefício e parcelas facilitadas, já que é um público jovem adulto buscando o primeiro SUV ou troca de categoria.\n\n` +
        `💡 **Recomendação Estratégica:**\n` +
        `1. Aumentar a frequência de publicações de Reels com foco em tours rápidos de veículos do estoque.\n` +
        `2. No Facebook, a audiência está mais estagnada (-3.5% em alcance). Recomendamos investir em posts com CTAs diretos para o WhatsApp de vendas nos fins de semana.\n` +
        `3. O melhor horário de engajamento para a sua página tem sido às **19:45** das terças e quintas.`
      );
      setIsGeneratingAi(false);
      toast.success("Insights estratégicos gerados pela Victoria AI!");
    }, 1800);
  };

  return (
    <div className="space-y-6">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/social" className="flex items-center justify-center h-10 w-10 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/10">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div>
            <span className="label-mono text-primary text-[10px] uppercase tracking-widest">Analytics de Redes Sociais</span>
            <h2 className="text-2xl font-black tracking-tight text-foreground flex items-center gap-2 mt-0.5">
              <BarChart3 className="h-6 w-6 text-primary animate-pulse" /> Insights do Meta
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Analise o desempenho orgânico das páginas do Facebook e perfis do Instagram integrados.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          <button 
            onClick={handleSyncInsights} 
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-card px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground transition cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar Insights
          </button>
          <button 
            onClick={generateAiInsights}
            disabled={isGeneratingAi}
            className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer"
          >
            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Gerar Diagnóstico IA
          </button>
        </div>
      </div>

      {/* Warnings & Meta Connection status */}
      {!isMetaConnected && (
        <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
          <div className="text-left">
            <p className="text-xs font-bold text-yellow-400">Meta Ads Config não integrada para Social Media Insights</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
              Suas páginas e contas não estão vinculadas nas configurações. Os dados abaixo são simulações realistas e interativas
              da NC Performance para demonstração comercial. Acesse **Configurações → Integrações Master** para vincular a conta oficial.
            </p>
          </div>
        </div>
      )}

      {/* Top Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 border border-white/5 bg-white/[0.01] rounded-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-bold">Página/Conta:</span>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="rounded-lg border border-white/10 bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none"
            >
              <option value="all">Todas as Contas (Meta)</option>
              {socialPages.map((sp: any) => (
                <option key={sp.page_id} value={sp.page_id}>
                  {sp.page_name} {sp.instagram_handle ? `(@${sp.instagram_handle})` : ""}
                </option>
              ))}
              {socialPages.length === 0 && (
                <>
                  <option value="instagram">@ncperformance (Instagram)</option>
                  <option value="facebook">NC Seminovos (Facebook)</option>
                </>
              )}
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-bold">Período:</span>
          <div className="flex rounded-lg bg-white/5 p-0.5 border border-white/5">
            {["7", "30", "90"].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`rounded-md px-3 py-1 text-xs font-bold transition-all ${timeRange === days ? "bg-primary text-background" : "text-muted-foreground hover:text-white"}`}
              >
                Últimos {days} dias
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Seguidores Totais */}
        <div className="glass-panel p-5 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-pink-500 to-primary" />
          <div className="flex items-center justify-between">
            <span className="label-mono text-[9px] text-muted-foreground uppercase">Seguidores Totais</span>
            <Users className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-black text-2xl tracking-tight text-white">
              {selectedPage === "facebook" ? mockInsights.followers_facebook.toLocaleString("pt-BR") : selectedPage === "instagram" ? mockInsights.followers_instagram.toLocaleString("pt-BR") : (mockInsights.followers_instagram + mockInsights.followers_facebook).toLocaleString("pt-BR")}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-bold ${
                (selectedPage === "facebook" ? mockInsights.followers_growth_fb : mockInsights.followers_growth_insta) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {(selectedPage === "facebook" ? mockInsights.followers_growth_fb : mockInsights.followers_growth_insta) >= 0 ? "+" : ""}{selectedPage === "facebook" ? mockInsights.followers_growth_fb : mockInsights.followers_growth_insta}%
              </span>
              <span className="text-[9px] text-muted-foreground">vs últimos {timeRange} dias</span>
            </div>
          </div>
        </div>

        {/* Card 2: Alcance de Conteúdo */}
        <div className="glass-panel p-5 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-violet-500 to-indigo-500" />
          <div className="flex items-center justify-between">
            <span className="label-mono text-[9px] text-muted-foreground uppercase">Alcance Orgânico</span>
            <Eye className="h-4.5 w-4.5 text-violet-500" />
          </div>
          <div>
            <h3 className="font-display font-black text-2xl tracking-tight text-white">
              {selectedPage === "facebook" ? mockInsights.reach_facebook.toLocaleString("pt-BR") : selectedPage === "instagram" ? mockInsights.reach_instagram.toLocaleString("pt-BR") : (mockInsights.reach_instagram + mockInsights.reach_facebook).toLocaleString("pt-BR")}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-bold ${
                (selectedPage === "facebook" ? mockInsights.reach_growth_fb : mockInsights.reach_growth_insta) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {(selectedPage === "facebook" ? mockInsights.reach_growth_fb : mockInsights.reach_growth_insta) >= 0 ? "+" : ""}{selectedPage === "facebook" ? mockInsights.reach_growth_fb : mockInsights.reach_growth_insta}%
              </span>
              <span className="text-[9px] text-muted-foreground">vs últimos {timeRange} dias</span>
            </div>
          </div>
        </div>

        {/* Card 3: Visitas à Página / Perfil */}
        <div className="glass-panel p-5 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-cyan-500 to-blue-500" />
          <div className="flex items-center justify-between">
            <span className="label-mono text-[9px] text-muted-foreground uppercase">Visitas ao Perfil</span>
            <Globe className="h-4.5 w-4.5 text-cyan-500" />
          </div>
          <div>
            <h3 className="font-display font-black text-2xl tracking-tight text-white">
              {selectedPage === "facebook" ? mockInsights.visits_facebook.toLocaleString("pt-BR") : selectedPage === "instagram" ? mockInsights.visits_instagram.toLocaleString("pt-BR") : (mockInsights.visits_instagram + mockInsights.visits_facebook).toLocaleString("pt-BR")}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-bold ${
                (selectedPage === "facebook" ? mockInsights.visits_growth_fb : mockInsights.visits_growth_insta) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {(selectedPage === "facebook" ? mockInsights.visits_growth_fb : mockInsights.visits_growth_insta) >= 0 ? "+" : ""}{selectedPage === "facebook" ? mockInsights.visits_growth_fb : mockInsights.visits_growth_insta}%
              </span>
              <span className="text-[9px] text-muted-foreground">vs últimos {timeRange} dias</span>
            </div>
          </div>
        </div>

        {/* Card 4: Engajamento (Curtidas/Comentários) */}
        <div className="glass-panel p-5 space-y-3 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-emerald-500 to-teal-500" />
          <div className="flex items-center justify-between">
            <span className="label-mono text-[9px] text-muted-foreground uppercase">Conteúdo Engajado</span>
            <ThumbsUp className="h-4.5 w-4.5 text-emerald-500" />
          </div>
          <div>
            <h3 className="font-display font-black text-2xl tracking-tight text-white">
              {selectedPage === "facebook" ? mockInsights.engagement_facebook.toLocaleString("pt-BR") : selectedPage === "instagram" ? mockInsights.engagement_instagram.toLocaleString("pt-BR") : (mockInsights.engagement_instagram + mockInsights.engagement_facebook).toLocaleString("pt-BR")}
            </h3>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[10px] font-bold ${
                (selectedPage === "facebook" ? mockInsights.engagement_growth_fb : mockInsights.engagement_growth_insta) >= 0 ? "text-green-400" : "text-red-400"
              }`}>
                {(selectedPage === "facebook" ? mockInsights.engagement_growth_fb : mockInsights.engagement_growth_insta) >= 0 ? "+" : ""}{selectedPage === "facebook" ? mockInsights.engagement_growth_fb : mockInsights.engagement_growth_insta}%
              </span>
              <span className="text-[9px] text-muted-foreground">vs últimos {timeRange} dias</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Insights Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Esquerda/Centro: Gráficos de Evolução e Top Posts */}
        <div className="lg:col-span-2 space-y-6">
          {/* Chart Card mockup */}
          <div className="glass-panel p-6 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-xs font-black uppercase text-primary tracking-widest">Evolução do Alcance Orgânico</h4>
                <p className="text-[9px] text-muted-foreground mt-0.5">Total de contas únicas alcançadas no período.</p>
              </div>
              <span className="rounded bg-primary/10 border border-primary/20 px-2 py-0.5 text-[9px] font-mono text-primary font-bold">META ORGANIC</span>
            </div>

            {/* Sparkline Graphic Mockup */}
            <div className="h-60 flex items-end gap-1.5 pt-6 relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                <div className="border-b border-white/5 w-full h-px" />
                <div className="border-b border-white/5 w-full h-px" />
                <div className="border-b border-white/5 w-full h-px" />
              </div>
              
              {/* Graphic bars representing day-by-day stats */}
              {[40, 52, 48, 62, 70, 58, 65, 80, 75, 92, 110, 85, 95, 120, 105, 130, 142, 125, 138, 150, 165, 148, 160, 182, 175, 195, 210, 188, 205, 220].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1 group relative cursor-pointer z-10">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-card border border-white/10 px-2 py-1 rounded text-[8px] font-mono whitespace-nowrap pointer-events-none">
                    Alcance: {(h * 150).toLocaleString("pt-BR")}
                  </div>
                  <div 
                    style={{ height: `${(h / 220) * 100}%` }}
                    className="w-full bg-gradient-to-t from-primary/30 to-primary rounded-t-sm group-hover:from-primary group-hover:to-pink-500 transition-all duration-300"
                  />
                  <span className="text-[7px] text-muted-foreground/60 font-mono hidden md:inline">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Posts Section */}
          <div className="glass-panel p-6 space-y-4">
            <h4 className="text-xs font-black uppercase text-primary tracking-widest">Publicações com Maior Alcance</h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-[9px] font-bold text-muted-foreground uppercase tracking-widest">
                    <th className="py-2.5 px-3">Post</th>
                    <th className="py-2.5 px-3">Tipo</th>
                    <th className="py-2.5 px-3 text-center">Alcance</th>
                    <th className="py-2.5 px-3 text-center">Curtidas</th>
                    <th className="py-2.5 px-3 text-center">Comentários</th>
                    <th className="py-2.5 px-3 text-center">Engajamento</th>
                  </tr>
                </thead>
                <tbody>
                  {mockInsights.top_posts.map((post) => (
                    <tr key={post.id} className="border-b border-white/5 hover:bg-white/[0.01] transition-all">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          {post.platform === "instagram" ? <Instagram className="h-3.5 w-3.5 text-pink-500" /> : <Facebook className="h-3.5 w-3.5 text-blue-500" />}
                          <span className="font-semibold text-white">{post.title}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 capitalize font-mono text-[10px] text-muted-foreground">{post.type}</td>
                      <td className="py-3 px-3 text-center font-mono font-bold text-white">{post.reach.toLocaleString("pt-BR")}</td>
                      <td className="py-3 px-3 text-center font-mono text-red-400">{post.likes}</td>
                      <td className="py-3 px-3 text-center font-mono text-blue-400">{post.comments}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="rounded bg-primary/10 px-2 py-0.5 font-bold font-mono text-primary text-[10px]">
                          {post.engRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Direita: Victoria AI Insights e Demográficos */}
        <div className="space-y-6">
          {/* AI Diagnostic Board */}
          <div className="glass-panel border-primary/20 bg-primary/5 p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-16 w-16 bg-primary/5 rounded-full blur-xl pointer-events-none" />
            <div className="flex items-center gap-2 text-primary">
              <Bot className="h-5 w-5 animate-pulse" />
              <h4 className="text-xs font-black uppercase tracking-widest">Diagnóstico Victoria AI</h4>
            </div>

            <AnimatePresence mode="wait">
              {aiReport ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 text-xs leading-relaxed text-muted-foreground whitespace-pre-line text-left"
                >
                  {aiReport}
                  <div className="pt-3 border-t border-white/5 flex justify-end">
                    <button 
                      onClick={() => setAiReport(null)}
                      className="text-[9px] font-black uppercase text-primary hover:underline"
                    >
                      Limpar Relatório
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="py-6 text-center space-y-3">
                  <Sparkles className="h-8 w-8 text-primary/40 mx-auto animate-pulse" />
                  <p className="text-xs font-bold text-white">Pronto para analisar sua audiência</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed px-4">
                    Nossa IA cruza métricas de publicações, crescimento de seguidores e demográficos para sugerir sua melhor estratégia.
                  </p>
                  <button
                    onClick={generateAiInsights}
                    disabled={isGeneratingAi}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-glow hover:opacity-90 active:scale-95 transition cursor-pointer"
                  >
                    {isGeneratingAi ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    Gerar Análise Estratégica
                  </button>
                </div>
              )}
            </AnimatePresence>
          </div>

          {/* Demographic Section */}
          <div className="glass-panel p-5 space-y-4">
            <div>
              <h4 className="text-xs font-black uppercase text-primary tracking-widest">Distribuição Demográfica</h4>
              <p className="text-[9px] text-muted-foreground mt-0.5">Perfil de gênero e idade dos seguidores da página.</p>
            </div>

            {/* Gender bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-white">
                <span>Homens (68%)</span>
                <span>Mulheres (32%)</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-white/5 overflow-hidden flex">
                <div className="h-full bg-primary" style={{ width: "68%" }} />
                <div className="h-full bg-pink-500" style={{ width: "32%" }} />
              </div>
            </div>

            <div className="my-2 border-t border-white/5" />

            {/* Age Range list */}
            <div className="space-y-3">
              <label className="label-mono text-[9px] text-muted-foreground uppercase">Faixa Etária</label>
              <div className="space-y-2.5">
                {mockInsights.demographics.age.map((item) => (
                  <div key={item.range} className="space-y-1">
                    <div className="flex justify-between text-[10px] font-bold text-muted-foreground">
                      <span className="text-white">{item.range} anos</span>
                      <span>{item.pct}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${item.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
