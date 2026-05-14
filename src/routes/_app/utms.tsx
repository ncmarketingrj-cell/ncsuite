import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import { Copy, Link as LinkIcon, Check } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/_app/utms")({
  head: () => ({ meta: [{ title: "UTM Builder — NC Suite" }] }),
  component: UtmPage,
});

function UtmPage() {
  const [url, setUrl] = useState("");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState(false);

  const params = new URLSearchParams();
  if (source) params.set("utm_source", source);
  if (medium) params.set("utm_medium", medium);
  if (campaign) params.set("utm_campaign", campaign);
  if (content) params.set("utm_content", content);
  if (term) params.set("utm_term", term);
  const finalUrl = url ? `${url}${url.includes("?") ? "&" : "?"}${params.toString()}` : "";

  const copy = () => {
    if (!finalUrl) return;
    navigator.clipboard.writeText(finalUrl);
    setCopied(true);
    toast.success("URL copiada!");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <PageHeader eyebrow="Conversão" title="UTM Builder" description="Gere URLs rastreáveis com parâmetros UTM para suas campanhas." />

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 space-y-4">
        <div>
          <label className="label-mono mb-1 block text-muted-foreground">URL base *</label>
          <div className="relative">
            <LinkIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seusite.com.br/landing" className="w-full rounded-lg border border-white/10 bg-background/50 py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="utm_source" hint="Ex: facebook, google, instagram" value={source} onChange={setSource} />
          <Field label="utm_medium" hint="Ex: cpc, banner, email" value={medium} onChange={setMedium} />
          <Field label="utm_campaign" hint="Ex: black-friday-2026" value={campaign} onChange={setCampaign} />
          <Field label="utm_content" hint="Ex: hero-banner-v2" value={content} onChange={setContent} />
          <Field label="utm_term" hint="Ex: concessionaria-sp" value={term} onChange={setTerm} />
        </div>
      </motion.div>

      {finalUrl && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6">
          <p className="label-mono mb-3 text-primary">URL gerada</p>
          <div className="rounded-lg border border-white/10 bg-background/60 p-4">
            <p className="break-all font-mono text-xs text-foreground">{finalUrl}</p>
          </div>
          <button onClick={copy} className="mt-4 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:shadow-glow">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado!" : "Copiar URL"}
          </button>
        </motion.div>
      )}
    </div>
  );
}

function Field({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label-mono mb-1 block text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={hint} className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none" />
    </div>
  );
}
