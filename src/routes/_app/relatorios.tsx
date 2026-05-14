import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, Trash2, Copy, Save, Loader2, Sparkles, X } from "lucide-react";
import Markdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { ExtractedCampaign } from "@/lib/ocr.functions";

export const Route = createFileRoute("/_app/relatorios")({
  head: () => ({ meta: [{ title: "Relatórios — NC Suite" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ from: s.from as string | undefined }),
  component: ReportsPage,
});

type Report = {
  id: string;
  client_name: string | null;
  period: string | null;
  markdown: string | null;
  total_investment: number | null;
  total_campaigns: number | null;
  created_at: string;
};

function ReportsPage() {
  const search = Route.useSearch();
  const qc = useQueryClient();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [initial, setInitial] = useState<ExtractedCampaign[]>([]);
  const [selected, setSelected] = useState<Report | null>(null);

  useEffect(() => {
    if (search.from === "upload") {
      const raw = sessionStorage.getItem("nc_extracted_campaigns");
      if (raw) {
        try {
          setInitial(JSON.parse(raw));
          setBuilderOpen(true);
          sessionStorage.removeItem("nc_extracted_campaigns");
        } catch { /* noop */ }
      }
    }
  }, [search.from]);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports"],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports")
        .select("id,client_name,period,markdown,total_investment,total_campaigns,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Report[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reports").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success("Relatório removido");
      setSelected(null);
    },
  });

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="flex items-end justify-between">
        <div>
          <p className="label-mono text-primary">Histórico</p>
          <h1 className="mt-2 font-display text-3xl font-bold">Relatórios</h1>
          <p className="mt-1 text-sm text-muted-foreground">Crie, salve e revisite entregas.</p>
        </div>
        <button
          onClick={() => { setInitial([]); setBuilderOpen(true); }}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary px-4 py-2 text-xs font-semibold text-background shadow-glow"
        >
          <Plus className="h-4 w-4" /> Novo relatório
        </button>
      </header>

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <aside className="glass-panel max-h-[70vh] overflow-y-auto p-2 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !reports?.length ? (
            <Empty />
          ) : (
            <ul className="space-y-1">
              {reports.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => setSelected(r)}
                    className={`w-full rounded-lg p-3 text-left text-sm transition ${selected?.id === r.id ? "bg-primary/10 ring-1 ring-primary/30" : "hover:bg-white/[0.03]"}`}
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-primary" />
                      <span className="truncate font-medium">{r.client_name || "Sem cliente"}</span>
                    </div>
                    <div className="label-mono mt-1 flex items-center justify-between text-muted-foreground">
                      <span>{r.period || "—"}</span>
                      <span>{r.total_campaigns ?? 0} camp.</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="glass-panel min-h-[70vh] p-6">
          {selected ? (
            <div>
              <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h2 className="font-display text-xl font-semibold">{selected.client_name}</h2>
                  <p className="label-mono text-muted-foreground">{selected.period}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { navigator.clipboard.writeText(selected.markdown ?? ""); toast.success("Copiado"); }}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs hover:border-primary/30"
                  ><Copy className="h-3 w-3" /> Copiar</button>
                  <button
                    onClick={() => del.mutate(selected.id)}
                    className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-destructive hover:border-destructive/30"
                  ><Trash2 className="h-3 w-3" /> Excluir</button>
                </div>
              </div>
              <article className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-primary">
                <Markdown rehypePlugins={[rehypeRaw]}>{selected.markdown ?? ""}</Markdown>
              </article>
            </div>
          ) : (
            <div className="flex h-full min-h-[60vh] flex-col items-center justify-center text-center">
              <Sparkles className="h-8 w-8 text-primary/60" />
              <p className="mt-4 text-sm text-muted-foreground">Selecione um relatório à esquerda<br />ou crie um novo.</p>
            </div>
          )}
        </section>
      </div>

      <AnimatePresence>
        {builderOpen && (
          <ReportBuilder
            initialCampaigns={initial}
            onClose={() => setBuilderOpen(false)}
            onSaved={() => {
              setBuilderOpen(false);
              qc.invalidateQueries({ queryKey: ["reports"] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
      <FileText className="h-6 w-6 text-primary/60" />
      Nenhum relatório ainda.
    </div>
  );
}

/* ============== ReportBuilder ============== */

const FORMATS = [
  { id: "executive", label: "Executivo (resumo)" },
  { id: "detailed", label: "Detalhado por campanha" },
  { id: "comparative", label: "Comparativo (period vs period)" },
  { id: "creative", label: "Foco em criativos" },
  { id: "funnel", label: "Funil completo" },
] as const;

function ReportBuilder({
  initialCampaigns, onClose, onSaved,
}: {
  initialCampaigns: ExtractedCampaign[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [campaigns, setCampaigns] = useState<ExtractedCampaign[]>(initialCampaigns);
  const [clientName, setClientName] = useState("");
  const [period, setPeriod] = useState(new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" }));
  const [format, setFormat] = useState<typeof FORMATS[number]["id"]>("executive");
  const [analysis, setAnalysis] = useState("");
  const [footer, setFooter] = useState("Relatório gerado por NC AGÊNCIA · Performance Suite");
  const [saving, setSaving] = useState(false);

  const totalCost = campaigns.reduce((s, c) => s + (c.cost ?? 0), 0);
  const totalConv = campaigns.reduce((s, c) => s + (c.conversions ?? 0), 0);
  const totalClicks = campaigns.reduce((s, c) => s + (c.clicks ?? 0), 0);
  const totalImpr = campaigns.reduce((s, c) => s + (c.impressions ?? 0), 0);

  const markdown = generateMarkdown({ clientName, period, format, campaigns, analysis, footer, totalCost, totalConv, totalClicks, totalImpr });

  const addEmpty = () => setCampaigns([...campaigns, { name: "Nova campanha" }]);
  const updateCamp = (i: number, patch: Partial<ExtractedCampaign>) =>
    setCampaigns(campaigns.map((c, idx) => idx === i ? { ...c, ...patch } : c));
  const removeCamp = (i: number) => setCampaigns(campaigns.filter((_, idx) => idx !== i));

  const save = async () => {
    if (!clientName.trim()) { toast.error("Informe o nome do cliente"); return; }
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("reports").insert({
        client_name: clientName,
        period,
        markdown,
        raw_data: { campaigns, format, analysis },
        total_investment: totalCost,
        total_campaigns: campaigns.length,
        user_id: u.user?.id,
      });
      if (error) throw error;
      toast.success("Relatório salvo");
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="absolute inset-4 sm:inset-8 overflow-hidden rounded-2xl border border-white/10 bg-card shadow-glow"
      >
        <header className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div>
            <p className="label-mono text-primary">Builder</p>
            <h2 className="font-display text-lg font-semibold">Montar relatório</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { navigator.clipboard.writeText(markdown); toast.success("Markdown copiado"); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs hover:border-primary/30"
            ><Copy className="h-3 w-3" /> Copiar</button>
            <button
              onClick={save} disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:shadow-glow disabled:opacity-50"
            >{saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar</button>
            <button onClick={onClose} className="rounded-full border border-white/10 p-1.5 hover:bg-white/[0.05]"><X className="h-4 w-4" /></button>
          </div>
        </header>

        <div className="grid h-[calc(100%-65px)] grid-cols-1 lg:grid-cols-2">
          {/* Left: form */}
          <div className="overflow-y-auto border-r border-white/5 p-6 custom-scrollbar">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Cliente" value={clientName} onChange={setClientName} />
                <Field label="Período" value={period} onChange={setPeriod} />
              </div>

              <div>
                <label className="label-mono mb-2 block text-muted-foreground">Formato</label>
                <select
                  value={format} onChange={(e) => setFormat(e.target.value as any)}
                  className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                >
                  {FORMATS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                </select>
              </div>

              <div className="border-t border-white/5 pt-4">
                <div className="mb-3 flex items-center justify-between">
                  <label className="label-mono text-muted-foreground">Campanhas ({campaigns.length})</label>
                  <button onClick={addEmpty} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                </div>
                <ul className="space-y-2">
                  {campaigns.map((c, i) => (
                    <li key={i} className="rounded-lg border border-white/5 bg-background/40 p-3">
                      <div className="flex items-start gap-2">
                        <input
                          value={c.name} onChange={(e) => updateCamp(i, { name: e.target.value })}
                          className="flex-1 bg-transparent text-sm font-medium focus:outline-none"
                        />
                        <button onClick={() => removeCamp(i)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
                        <NumberInput label="Custo" value={c.cost} onChange={(v) => updateCamp(i, { cost: v })} />
                        <NumberInput label="Impr." value={c.impressions} onChange={(v) => updateCamp(i, { impressions: v })} />
                        <NumberInput label="Cliques" value={c.clicks} onChange={(v) => updateCamp(i, { clicks: v })} />
                        <NumberInput label="Conv." value={c.conversions} onChange={(v) => updateCamp(i, { conversions: v })} />
                      </div>
                    </li>
                  ))}
                  {!campaigns.length && (
                    <li className="rounded-lg border border-dashed border-white/10 px-3 py-6 text-center text-xs text-muted-foreground">
                      Nenhuma campanha. Adicione manualmente ou volte ao Upload.
                    </li>
                  )}
                </ul>
              </div>

              <div className="border-t border-white/5 pt-4">
                <label className="label-mono mb-2 block text-muted-foreground">Análise (opcional)</label>
                <textarea
                  value={analysis} onChange={(e) => setAnalysis(e.target.value)} rows={4}
                  placeholder="Comentários estratégicos, próximos passos…"
                  className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="label-mono mb-2 block text-muted-foreground">Rodapé / Assinatura</label>
                <input
                  value={footer} onChange={(e) => setFooter(e.target.value)}
                  className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div className="overflow-y-auto bg-background/40 p-6 custom-scrollbar">
            <p className="label-mono mb-4 text-primary">Preview</p>
            <article className="prose prose-invert prose-sm max-w-none prose-headings:font-display prose-headings:text-foreground prose-p:text-muted-foreground prose-strong:text-primary prose-table:text-xs">
              <Markdown rehypePlugins={[rehypeRaw]}>{markdown}</Markdown>
            </article>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label-mono mb-2 block text-muted-foreground">{label}</label>
      <input
        value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-white/10 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value?: number | null; onChange: (v: number | undefined) => void }) {
  return (
    <div>
      <span className="label-mono block text-[9px] text-muted-foreground">{label}</span>
      <input
        type="number" value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        className="mt-1 w-full rounded border border-white/10 bg-background/50 px-2 py-1 text-xs font-mono focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function generateMarkdown(d: {
  clientName: string; period: string; format: string;
  campaigns: ExtractedCampaign[]; analysis: string; footer: string;
  totalCost: number; totalConv: number; totalClicks: number; totalImpr: number;
}): string {
  const ctr = d.totalImpr ? ((d.totalClicks / d.totalImpr) * 100).toFixed(2) : "0";
  const cpc = d.totalClicks ? (d.totalCost / d.totalClicks).toFixed(2) : "0";
  const cpa = d.totalConv ? (d.totalCost / d.totalConv).toFixed(2) : "—";

  let body = `# Relatório de Performance\n\n**Cliente:** ${d.clientName || "—"}  \n**Período:** ${d.period}  \n**Formato:** ${d.format}\n\n---\n\n## Resumo Consolidado\n\n| Métrica | Valor |\n|---|---|\n| Investimento total | **R$ ${d.totalCost.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}** |\n| Impressões | ${d.totalImpr.toLocaleString("pt-BR")} |\n| Cliques | ${d.totalClicks.toLocaleString("pt-BR")} |\n| Conversões | **${d.totalConv.toLocaleString("pt-BR")}** |\n| CTR | ${ctr}% |\n| CPC médio | R$ ${cpc} |\n| CPA | R$ ${cpa} |\n\n## Campanhas\n\n| # | Campanha | Custo | Impr. | Cliques | Conv. |\n|---|---|---|---|---|---|\n`;

  d.campaigns.forEach((c, i) => {
    body += `| ${i + 1} | ${c.name} | R$ ${(c.cost ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} | ${(c.impressions ?? 0).toLocaleString("pt-BR")} | ${(c.clicks ?? 0).toLocaleString("pt-BR")} | **${c.conversions ?? 0}** |\n`;
  });

  if (d.analysis.trim()) {
    body += `\n## Análise\n\n${d.analysis}\n`;
  }

  body += `\n---\n\n_${d.footer}_\n`;
  return body;
}
