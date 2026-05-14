import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";
import { Upload as UploadIcon, Loader2, ImageIcon, Sparkles, Check, X } from "lucide-react";
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
    };
    reader.readAsDataURL(file);
  };

  const run = async () => {
    if (!base64) return;
    setLoading(true);
    try {
      const r = await extract({ data: { imageBase64: base64, mimeType: mime } });
      setCampaigns(r.campaigns);
      if (!r.campaigns.length) toast.warning("Nenhuma campanha identificada — tente um print mais nítido");
      else toast.success(`${r.campaigns.length} campanha(s) extraída(s)`);
    } catch (err: any) {
      toast.error(err.message ?? "Falha na extração");
    } finally {
      setLoading(false);
    }
  };

  const goToReport = () => {
    if (!campaigns?.length) return;
    sessionStorage.setItem("nc_extracted_campaigns", JSON.stringify(campaigns));
    nav({ to: "/relatorios", search: { from: "upload" } as any });
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <p className="label-mono text-primary">Motor de extração</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Upload de Print</h1>
        <p className="mt-1 text-sm text-muted-foreground">Suba a captura do Gerenciador de Anúncios. O motor identifica e estrutura os dados.</p>
      </header>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8">
        {!preview ? (
          <label className="flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-white/10 bg-background/40 py-20 transition hover:border-primary/40 hover:bg-primary/[0.02]">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-secondary/20">
              <UploadIcon className="h-6 w-6 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-medium">Clique para enviar</p>
              <p className="mt-1 text-xs text-muted-foreground">PNG, JPG ou WEBP • até 20MB</p>
            </div>
            <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          </label>
        ) : (
          <div className="space-y-6">
            <div className="relative overflow-hidden rounded-xl border border-white/5">
              <img src={preview} alt="Preview" className="max-h-[420px] w-full object-contain bg-background/60" />
              <button
                onClick={() => { setPreview(null); setBase64(null); setCampaigns(null); }}
                className="absolute right-3 top-3 rounded-full bg-background/80 p-2 backdrop-blur hover:bg-destructive hover:text-destructive-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {!campaigns && (
              <button
                onClick={run} disabled={loading}
                className="group flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-secondary py-3 text-sm font-semibold text-background shadow-glow transition hover:scale-[1.01] disabled:opacity-50"
              >
                {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Extraindo…</>
                  : <><Sparkles className="h-4 w-4" /> Extrair dados do print</>}
              </button>
            )}
          </div>
        )}
      </motion.div>

      {campaigns && (
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel overflow-hidden">
          <header className="flex items-center justify-between border-b border-white/5 p-5">
            <div>
              <p className="label-mono text-primary">Resultado</p>
              <h2 className="font-display text-xl font-semibold">{campaigns.length} campanha(s)</h2>
            </div>
            <button
              onClick={goToReport}
              disabled={!campaigns.length}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:shadow-glow disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" /> Montar relatório
            </button>
          </header>
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5 text-left label-mono text-muted-foreground">
                  <th className="px-5 py-3">Campanha</th>
                  <th className="px-2 py-3">Status</th>
                  <th className="px-2 py-3 text-right">Custo</th>
                  <th className="px-2 py-3 text-right">Impressões</th>
                  <th className="px-2 py-3 text-right">Cliques</th>
                  <th className="px-5 py-3 text-right">Conversões</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c, i) => (
                  <tr key={i} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-5 py-3 font-medium">{c.name}</td>
                    <td className="px-2 py-3"><span className="label-mono rounded bg-success/10 px-2 py-0.5 text-success">{c.status ?? "—"}</span></td>
                    <td className="px-2 py-3 text-right font-mono text-xs">{fmt(c.cost)}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs">{fmt(c.impressions, false)}</td>
                    <td className="px-2 py-3 text-right font-mono text-xs">{fmt(c.clicks, false)}</td>
                    <td className="px-5 py-3 text-right font-mono text-xs text-primary">{fmt(c.conversions, false)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.section>
      )}
    </div>
  );
}

function fmt(v: number | undefined | null, money = true) {
  if (v == null) return "—";
  if (money) return `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  return v.toLocaleString("pt-BR");
}
