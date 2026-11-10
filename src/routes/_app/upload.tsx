import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Upload as UploadIcon, Loader2, Check, X, FileSearch, 
  ArrowRight, Zap, Globe, Target, ShoppingBag, Car, 
  Sparkles, DollarSign, Calculator 
} from "lucide-react";
import { toast } from "sonner";
import { extractPrintFn, type ExtractedCampaign, type ExtractedAccountInfo } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_app/upload")({
  head: () => ({ meta: [{ title: "Extração de Dados — NC Suite" }] }),
  component: UploadPage,
});

function UploadPage() {
  const extract = useServerFn(extractPrintFn);
  const nav = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<"meta" | "google" | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("image/png");
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<ExtractedCampaign[] | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<"meta" | "google" | null>(null);

  // Estados inteligentes de conta e template pós-extração
  const [accountInfo, setAccountInfo] = useState<ExtractedAccountInfo | null>(null);
  const [clientName, setClientName] = useState("");
  const [periodText, setPeriodText] = useState("");
  const [salesRevenue, setSalesRevenue] = useState("");
  const [salesOrders, setSalesOrders] = useState("");
  const [templateMode, setTemplateMode] = useState<"standard_auto" | "ecommerce_sales">("standard_auto");

  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMime(file.type || "image/png");
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setPreview(result);
      setBase64(result.split(",")[1] ?? "");
      setCampaigns(null);
      setDetectedPlatform(null);
    };
    reader.readAsDataURL(file);
  };

  const run = async () => {
    if (!base64 || !selectedPlatform) return;
    setLoading(true);
    try {
      const r = await extract({ data: { imageBase64: base64, mimeType: mime, platform: selectedPlatform } });

      // ── Fallback determinístico Meta ───────────────────────────────────────
      // ── Fallback determinístico Google ────────────────────────────────────
      const processed = (r.campaigns ?? []).map(c => {
        // ── GOOGLE: campanhas de tráfego (conv=0 ou nome sugere cliques) ──
        if (selectedPlatform === "google") {
          const noConv = !c.conversions || c.conversions === 0;
          const trafficName = /visita|site|trafego|tráfego|click|clique/i.test(c.name || "");
          if (noConv || trafficName) {
            const derivedCpc = c.cpc || (c.cost && c.clicks ? c.cost / c.clicks : null);
            return {
              ...c,
              conversions: c.clicks || c.conversions || 0,
              cpl: derivedCpc,
              result_type: "Clique no site",
            };
          }
          return c;
        }

        // ── META: fallback matemático para Lead mal extraído ───────────────
        if (selectedPlatform !== "meta") return c;
        if (!c.cpl || c.cpl <= 0 || !c.cost || c.cost <= 0) return c;
        const implied = Math.round(c.cost / c.cpl);
        const noConversions = !c.conversions || c.conversions === 0;
        if (noConversions) return { ...c, conversions: implied };
        if (implied > 0 && c.conversions! > 0 && implied / c.conversions! > 5) {
          return { ...c, conversions: implied, result_type: "Conversa por mensagem iniciada" };
        }
        return c;
      });

      setCampaigns(processed);
      setDetectedPlatform(r.platform as any);

      // Extração de metadados da conta
      const acc = (r as any).account_info as ExtractedAccountInfo | undefined;
      setAccountInfo(acc || null);
      if (acc?.account_name) setClientName(acc.account_name);
      if (acc?.period) setPeriodText(acc.period);

      // Classifica se é e-commerce / cardápio / vendas
      const isEcom = acc?.detected_mode === "ecommerce_sales" || processed.some(c => 
        /visualizaç(?:ão|ões)\s+da\s+página|compra|venda|cardapio|cardápio|site/i.test(c.result_type || "") ||
        /site|cardapio|cardápio|cmp\s+de\s+vendas|vendas|compras/i.test(c.name || "")
      );
      setTemplateMode(isEcom ? "ecommerce_sales" : "standard_auto");

      if (!processed.length) {
        toast.warning("Nenhuma campanha identificada — tente um print mais nítido");
      } else {
        localStorage.setItem("nc_extracted_campaigns", JSON.stringify(processed));
        localStorage.setItem("nc_extracted_platform", r.platform ?? selectedPlatform);
        toast.success(`${processed.length} campanha(s) extraída(s) via ${selectedPlatform === 'meta' ? 'Meta Ads' : 'Google Ads'}`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Falha na extração");
    } finally {
      setLoading(false);
    }
  };

  const goToReport = () => {
    if (!campaigns?.length) return;
    localStorage.setItem("nc_extracted_campaigns", JSON.stringify(campaigns));
    localStorage.setItem("nc_extracted_platform", detectedPlatform ?? selectedPlatform ?? "meta");
    if (clientName) localStorage.setItem("nc_extracted_client", clientName);
    if (periodText) localStorage.setItem("nc_extracted_period", periodText);
    localStorage.setItem("nc_extracted_template_mode", templateMode);
    if (templateMode === "ecommerce_sales") {
      localStorage.setItem("nc_extracted_ecommerce_data", JSON.stringify({
        revenue: salesRevenue,
        orders: salesOrders,
      }));
    }
    nav({ to: "/relatorios", search: { from: "upload" } as any });
  };

  const resetAll = () => {
    setPreview(null);
    setBase64(null);
    setCampaigns(null);
    setDetectedPlatform(null);
    setSelectedPlatform(null);
    setAccountInfo(null);
    setClientName("");
    setPeriodText("");
    setSalesRevenue("");
    setSalesOrders("");
    setTemplateMode("standard_auto");
    localStorage.removeItem("nc_extracted_campaigns");
    localStorage.removeItem("nc_extracted_platform");
    localStorage.removeItem("nc_extracted_client");
    localStorage.removeItem("nc_extracted_period");
    localStorage.removeItem("nc_extracted_template_mode");
    localStorage.removeItem("nc_extracted_ecommerce_data");
  };

  const isGoogle = selectedPlatform === "google" || detectedPlatform === "google";

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-20">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary/20 flex items-center justify-center">
            <FileSearch className="h-3.5 w-3.5 text-primary" />
          </div>
          <p className="label-mono text-primary font-bold tracking-widest uppercase text-[10px]">Visão Computacional</p>
        </div>
        <h1 className="font-display text-4xl font-bold tracking-tight">Motor de <span className="text-gradient">Extração OCR.</span></h1>
        <p className="text-sm text-muted-foreground max-w-2xl">
          Inteligência artificial nichada para cada plataforma. Selecione a origem do print e nossa IA especializada extrairá as métricas com precisão cirúrgica.
        </p>
      </header>

      {/* ═══ ETAPA 1: Seletor de Plataforma ═══ */}
      {!selectedPlatform && !preview && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-center gap-2 ml-1">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/20 text-primary text-[9px] font-black">1</span>
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Selecione a Plataforma do Print</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Meta Ads */}
            <button
              onClick={() => setSelectedPlatform("meta")}
              className="group relative overflow-hidden rounded-2xl border-2 border-white/10 bg-white/[0.02] p-8 text-left transition-all hover:border-[#0668E1]/40 hover:bg-[#0668E1]/[0.03] hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#0668E1]/10 to-transparent opacity-0 group-hover:opacity-100 transition" />
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#0668E1]/10 flex items-center justify-center border border-[#0668E1]/20 group-hover:bg-[#0668E1]/20 transition">
                    <Target className="h-6 w-6 text-[#0668E1]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight">Meta Ads</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#0668E1]">Facebook & Instagram</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Especialista em prints do Gerenciador de Anúncios da Meta. Extrai conversas iniciadas, leads, alcance, impressões e CPL com precisão.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {["Conversas", "Leads", "Alcance", "CPL", "Impressões"].map(tag => (
                      <span key={tag} className="rounded-full bg-[#0668E1]/10 border border-[#0668E1]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#0668E1]">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>

            {/* Google Ads */}
            <button
              onClick={() => setSelectedPlatform("google")}
              className="group relative overflow-hidden rounded-2xl border-2 border-white/10 bg-white/[0.02] p-8 text-left transition-all hover:border-[#4285F4]/40 hover:bg-[#4285F4]/[0.03] hover:scale-[1.01] active:scale-[0.99]"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#4285F4]/10 to-transparent opacity-0 group-hover:opacity-100 transition" />
              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-xl bg-[#4285F4]/10 flex items-center justify-center border border-[#4285F4]/20 group-hover:bg-[#4285F4]/20 transition">
                    <Globe className="h-6 w-6 text-[#4285F4]" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white tracking-tight">Google Ads</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#4285F4]">Search, Display & Performance Max</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Especialista em prints do painel Google Ads. Extrai CPC, CPM, CTR, conversões, tipo de campanha e custo total com identidade Google.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {["CPC", "CPM", "CTR", "Conversões", "Cliques", "PMax"].map(tag => (
                      <span key={tag} className="rounded-full bg-[#4285F4]/10 border border-[#4285F4]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider text-[#4285F4]">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            </button>
          </div>
        </motion.div>
      )}

      {/* ═══ ETAPA 2: Upload do Print ═══ */}
      {selectedPlatform && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport p-1 border-white/10 bg-white/5 overflow-hidden">
          {/* Barra de contexto da plataforma selecionada */}
          <div className={`flex items-center justify-between px-6 py-3 border-b ${isGoogle ? 'border-[#4285F4]/20 bg-[#4285F4]/[0.03]' : 'border-[#0668E1]/20 bg-[#0668E1]/[0.03]'}`}>
            <div className="flex items-center gap-3">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${isGoogle ? 'bg-[#4285F4]/20' : 'bg-[#0668E1]/20'}`}>
                {isGoogle ? <Globe className="h-4 w-4 text-[#4285F4]" /> : <Target className="h-4 w-4 text-[#0668E1]" />}
              </div>
              <div>
                <p className={`text-xs font-black uppercase tracking-widest ${isGoogle ? 'text-[#4285F4]' : 'text-[#0668E1]'}`}>
                  {isGoogle ? "Motor Google Ads" : "Motor Meta Ads"}
                </p>
                <p className="text-[9px] text-muted-foreground">IA nichada para extração de {isGoogle ? "Google Ads" : "Meta Ads"}</p>
              </div>
            </div>
            {!campaigns && (
              <button onClick={resetAll} className="text-[10px] font-bold text-muted-foreground hover:text-white transition uppercase tracking-widest">
                ← Trocar plataforma
              </button>
            )}
          </div>

          <div className="p-8">
            {!preview ? (
              <label className="group relative flex cursor-pointer flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-white/10 bg-background/40 py-24 transition hover:border-primary/40 hover:bg-primary/[0.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition" />
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 transition group-hover:scale-110 group-hover:bg-primary group-hover:text-background shadow-lg">
                  <UploadIcon className="h-8 w-8" />
                </div>
                <div className="text-center relative z-10">
                  <p className="text-lg font-bold">Arraste seu print do {isGoogle ? "Google Ads" : "Meta Ads"} aqui</p>
                  <p className="mt-1 text-xs text-muted-foreground font-medium uppercase tracking-wider">PNG, JPG ou WEBP • Alta Resolução Recomendada</p>
                </div>
                <input type="file" accept="image/*" onChange={onFile} className="hidden" />
              </label>
            ) : (
              <div className="space-y-8">
                <div className="relative group overflow-hidden rounded-2xl border border-white/10 shadow-2xl">
                  <img src={preview} alt="Preview" className="max-h-[500px] w-full object-contain bg-background/80 transition group-hover:scale-[1.01]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent pointer-events-none" />
                  <button
                    onClick={resetAll}
                    className="absolute right-4 top-4 rounded-xl bg-background/90 p-3 backdrop-blur shadow-xl hover:bg-destructive hover:text-white transition"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                {!campaigns && (
                  <button
                    onClick={run} disabled={loading}
                    className="group relative w-full overflow-hidden rounded-xl bg-gradient-to-r from-primary to-secondary p-[1px] transition hover:scale-[1.01] active:scale-95 disabled:opacity-50"
                  >
                    <div className="flex w-full items-center justify-center gap-3 rounded-xl bg-background/90 px-8 py-4 text-sm font-black uppercase tracking-widest text-white backdrop-blur-xl group-hover:bg-transparent transition">
                      {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Processando via {isGoogle ? "Google Engine" : "Meta Engine"}…</>
                        : <><Zap className="h-5 w-5 fill-current" /> Extrair com IA {isGoogle ? "Google" : "Meta"}</>}
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* ═══ ETAPA 3: Resultados Extraídos ═══ */}
      <AnimatePresence>
        {campaigns && (
          <motion.section
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="glass-panel card-sport overflow-hidden border-white/10 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-border/50 bg-white/5 p-6">
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                  <Check className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="header-sport font-display text-xl font-bold">{campaigns.length} Campanhas Identificadas</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Extração concluída com sucesso •</p>
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${isGoogle ? 'bg-[#4285F4]/20 text-[#4285F4] border border-[#4285F4]/30' : 'bg-primary/20 text-primary border border-primary/30'}`}>
                      {isGoogle ? 'Google Ads 🌐' : 'Meta Ads 🎯'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={goToReport}
                disabled={!campaigns.length}
                className="group flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-black text-background uppercase tracking-widest hover:shadow-glow transition hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                Gerar Relatório <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
            </div>

            {/* ═══ INTERFACE INTERATIVA DE CONFIGURAÇÃO PÓS-EXTRAÇÃO ═══ */}
            <div className="p-6 border-b border-white/5 bg-white/[0.01]">
              {templateMode === "ecommerce_sales" ? (
                <div className="rounded-2xl border border-primary/30 bg-primary/[0.03] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shrink-0">
                        <ShoppingBag className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                          Conta de Vendas / E-commerce / Delivery Detectada
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 font-mono">Modo Compras</span>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Informe o fechamento do site/cardápio para o cálculo exato da taxa de conversão e faturamento:
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setTemplateMode("standard_auto")}
                      className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition self-start sm:self-center"
                    >
                      Mudar para Modelo Veículos / Leads
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Nome do Cliente
                      </label>
                      <input
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Ex: Pizza Bonne"
                        className="w-full rounded-xl border border-white/10 bg-background/80 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Período do Relatório
                      </label>
                      <input
                        value={periodText}
                        onChange={(e) => setPeriodText(e.target.value)}
                        placeholder="Ex: OUTUBRO 2026"
                        className="w-full rounded-xl border border-white/10 bg-background/80 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-emerald-400 block mb-1">
                        Faturamento Líquido (R$) *
                      </label>
                      <input
                        value={salesRevenue}
                        onChange={(e) => setSalesRevenue(e.target.value)}
                        placeholder="Ex: 25.538,08"
                        className="w-full rounded-xl border border-emerald-500/30 bg-emerald-950/20 px-3.5 py-2.5 text-xs font-bold text-emerald-300 focus:outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-primary block mb-1">
                        Pedidos Finalizados no Site *
                      </label>
                      <input
                        value={salesOrders}
                        onChange={(e) => setSalesOrders(e.target.value)}
                        placeholder="Ex: 244"
                        className="w-full rounded-xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary font-mono"
                      />
                    </div>
                  </div>

                  {/* Prévia dinâmica do cálculo */}
                  {(() => {
                    const visits = campaigns.filter(c => /visualizaç|site|cardapio|cardápio|página/i.test(c.result_type || c.name || "")).reduce((s, c) => s + (c.conversions || c.clicks || 0), 0);
                    const orders = Number(salesOrders.replace(/\./g, "").replace(",", ".")) || 0;
                    const taxa = visits > 0 && orders > 0 ? ((orders / visits) * 100).toFixed(2).replace(".", ",") : "0,00";
                    return (
                      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-white/10">
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <Sparkles className="h-4 w-4 text-primary" /> Cálculo da Taxa:
                          </span>
                          <span className="font-mono text-white">
                            {orders || 0} pedidos ÷ {visits || 0} visualizações × 100 =
                          </span>
                          <span className="font-mono font-black text-primary px-2.5 py-1 rounded bg-primary/20 border border-primary/30">
                            {taxa}%
                          </span>
                        </div>
                        <button
                          onClick={goToReport}
                          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-background uppercase tracking-wider hover:shadow-glow transition hover:scale-105 active:scale-95"
                        >
                          Gerar Mensagem Pronta <ArrowRight className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 sm:p-6 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/20 border border-primary/40 flex items-center justify-center text-primary shrink-0">
                        <Car className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-tight flex items-center gap-2">
                          Template Padrão: Veículos, Mensagens e Consignado
                          <span className="text-[9px] px-2 py-0.5 rounded-full bg-white/10 text-muted-foreground border border-white/20 font-mono">Modo Padrão</span>
                        </h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          O motor agrupará as campanhas em Mensagens nos veículos, Consignado e Alcance/Impressões.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setTemplateMode("ecommerce_sales")}
                      className="text-[10px] uppercase font-bold text-muted-foreground hover:text-primary transition self-start sm:self-center"
                    >
                      Mudar para Modelo Vendas / Delivery
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Nome do Cliente
                      </label>
                      <input
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Ex: AlfaCar Veículos"
                        className="w-full rounded-xl border border-white/10 bg-background/80 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block mb-1">
                        Período do Relatório
                      </label>
                      <input
                        value={periodText}
                        onChange={(e) => setPeriodText(e.target.value)}
                        placeholder="Ex: OUTUBRO 2026"
                        className="w-full rounded-xl border border-white/10 bg-background/80 px-3.5 py-2.5 text-xs font-bold text-white focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-black/40 border border-white/10">
                    <p className="text-xs text-muted-foreground">
                      Tudo pronto! O relatório será formatado no novo padrão oficial para WhatsApp.
                    </p>
                    <button
                      onClick={goToReport}
                      className="flex items-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-xs font-black text-background uppercase tracking-wider hover:shadow-glow transition hover:scale-105 active:scale-95"
                    >
                      Gerar Mensagem Pronta <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-6 py-4">Campanha</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Custo</th>
                    <th className="px-4 py-4 text-right">Impressões</th>
                    <th className="px-4 py-4 text-right">Cliques</th>
                    {isGoogle ? (
                      <>
                        <th className="px-4 py-4 text-right">CPC</th>
                        <th className="px-4 py-4 text-right">CPM</th>
                        <th className="px-4 py-4 text-right">CTR</th>
                        <th className="px-4 py-4 text-right">Conversões</th>
                        <th className="px-6 py-4 text-right text-primary">Custo/Conv</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-4 text-right">Alcance</th>
                        <th className="px-4 py-4 text-right">Resultado</th>
                        <th className="px-6 py-4 text-right text-primary">CPL/CPA</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaigns.map((c, i) => (
                    <motion.tr 
                      key={i} 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className="hover:bg-white/[0.03] transition"
                    >
                      <td className="px-6 py-4 font-bold text-white">
                        <div>
                          {c.name}
                          {isGoogle && c.campaign_type && (
                            <span className="block text-[8px] font-black uppercase tracking-wider text-[#4285F4] mt-0.5">{c.campaign_type}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-flex rounded-lg px-2 py-1 text-[10px] font-black uppercase ${c.status === 'active' ? 'bg-success/10 text-success' : c.status === 'paused' ? 'bg-amber-500/10 text-amber-400' : 'bg-white/5 text-muted-foreground'}`}>
                          {c.status === 'active' ? 'ATIVO' : c.status === 'paused' ? 'PAUSADO' : (c.status?.toUpperCase() ?? "—")}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs font-medium">{fmt(c.cost)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.impressions, false)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.clicks, false)}</td>
                      {isGoogle ? (
                        <>
                          <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.cpc)}</td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.cpm)}</td>
                          <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{c.ctr != null ? `${c.ctr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}%` : "—"}</td>
                          <td className="px-4 py-4 text-right font-mono text-xs font-black text-white">{fmt(c.conversions, false)}</td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-black text-primary">
                            {c.cpl != null ? fmt(c.cpl) : (c.conversions && c.conversions > 0 && c.cost ? fmt(c.cost / c.conversions) : "—")}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.reach, false)}</td>
                          <td className="px-4 py-4 text-right font-mono text-xs font-black text-white">
                            {fmt(c.conversions, false)}
                            {c.result_type && (
                              <span className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground mt-0.5">{c.result_type}</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-mono text-xs font-black text-primary">
                            {c.cpl != null ? fmt(c.cpl) : (c.conversions && c.conversions > 0 && c.cost ? fmt(c.cost / c.conversions) : "—")}
                          </td>
                        </>
                      )}
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

function fmt(v: number | undefined | null, money = true) {
  if (v == null) return "—";
  if (money) return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  return v.toLocaleString("pt-BR");
}
