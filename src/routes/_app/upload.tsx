import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload as UploadIcon, Loader2, ImageIcon, Sparkles, Check, X, FileSearch, ArrowRight, Zap } from "lucide-react";
import { toast } from "sonner";
import { extractPrintFn, type ExtractedCampaign } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_app/upload")({
  head: () => ({ meta: [{ title: "Extração de Dados — NC Suite" }] }),
  component: UploadPage,
});

function UploadPage() {
  const extract = useServerFn(extractPrintFn);
  const nav = useNavigate();
  const [preview, setPreview] = useState<string | null>(null);
  const [base64, setBase64] = useState<string | null>(null);
  const [mime, setMime] = useState<string>("image/png");
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<ExtractedCampaign[] | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<"meta" | "google" | null>(null);

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
    if (!base64) return;
    setLoading(true);
    try {
      const r = await extract({ data: { imageBase64: base64, mimeType: mime } });
      setCampaigns(r.campaigns);
      setDetectedPlatform(r.platform as any);
      if (!r.campaigns.length) toast.warning("Nenhuma campanha identificada — tente um print mais nítido");
      else {
        localStorage.setItem("nc_extracted_campaigns", JSON.stringify(r.campaigns));
        localStorage.setItem("nc_extracted_platform", r.platform ?? "meta");
        toast.success(`${r.campaigns.length} campanha(s) extraída(s) via ${r.platform === 'meta' ? 'Meta Ads' : 'Google Ads'}`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Falha na extração");
    } finally {
      setLoading(false);
    }
  };

  const goToReport = () => {
    if (!campaigns?.length || !detectedPlatform) return;
    nav({ to: "/relatorios", search: { from: "upload" } as any });
  };

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
          Nossa inteligência artificial identifica automaticamente métricas de prints do Gerenciador de Anúncios da Meta, convertendo imagens em dados estruturados.
        </p>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel card-sport p-1 border-white/10 bg-white/5 overflow-hidden">
        <div className="p-8">
          {!preview ? (
            <label className="group relative flex cursor-pointer flex-col items-center justify-center gap-6 rounded-2xl border-2 border-dashed border-white/10 bg-background/40 py-24 transition hover:border-primary/40 hover:bg-primary/[0.02]">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition" />
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 transition group-hover:scale-110 group-hover:bg-primary group-hover:text-background shadow-lg">
                <UploadIcon className="h-8 w-8" />
              </div>
              <div className="text-center relative z-10">
                <p className="text-lg font-bold">Arraste seu print aqui</p>
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
                  onClick={() => { setPreview(null); setBase64(null); setCampaigns(null); }}
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
                    {loading ? <><Loader2 className="h-5 w-5 animate-spin" /> Processando Imagem…</>
                      : <><Zap className="h-5 w-5 fill-current" /> Iniciar Extração Inteligente</>}
                  </div>
                </button>
              )}
            </div>
          )}
        </div>
      </motion.div>

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
                    <span className={`inline-flex rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${detectedPlatform === 'meta' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-secondary/20 text-secondary border border-secondary/30'}`}>
                      {detectedPlatform === 'meta' ? 'Meta Ads 🎯' : 'Google Ads 🌐'}
                    </span>
                  </div>
                </div>
              </div>
              <button
                onClick={goToReport}
                disabled={!campaigns.length}
                className="group flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-xs font-black text-background uppercase tracking-widest hover:shadow-glow transition hover:scale-105 active:scale-95 disabled:opacity-50"
              >
                Gerar Relatório Profissional <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
              </button>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 bg-white/[0.02] text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    <th className="px-6 py-4">Campanha</th>
                    <th className="px-4 py-4">Status</th>
                    <th className="px-4 py-4 text-right">Custo</th>
                    <th className="px-4 py-4 text-right">Alcance</th>
                    <th className="px-4 py-4 text-right">Impressões</th>
                    <th className="px-4 py-4 text-right">Cliques</th>
                    <th className="px-4 py-4 text-right">Resultado</th>
                    <th className="px-6 py-4 text-right text-primary">CPL/CPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {campaigns.map((c, i) => (
                    <motion.tr 
                      key={i} 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                      className="hover:bg-white/[0.03] transition"
                    >
                      <td className="px-6 py-4 font-bold text-white">{c.name}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-lg bg-success/10 px-2 py-1 text-[10px] font-black text-success uppercase">
                          {c.status?.toUpperCase() ?? "ATIVO"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right font-mono text-xs font-medium">{fmt(c.cost)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.reach, false)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.impressions, false)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs text-muted-foreground">{fmt(c.clicks, false)}</td>
                      <td className="px-4 py-4 text-right font-mono text-xs font-black text-white">
                        {fmt(c.conversions, false)}
                        {c.result_type && (
                          <span className="block text-[8px] font-black uppercase tracking-wider text-muted-foreground mt-0.5">{c.result_type}</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-xs font-black text-primary">
                        {c.cpl != null ? fmt(c.cpl) : (c.conversions && c.conversions > 0 && c.cost ? fmt(c.cost / c.conversions) : "—")}
                      </td>
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
