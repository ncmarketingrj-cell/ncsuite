import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText, Plus, Eye, ExternalLink, Edit, Trash2, QrCode, Loader2,
  ArrowRight, Target, CheckCircle2, XCircle, Users
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/formulario")({
  component: FormularioPage,
});

function FormularioPage() {
  const qc = useQueryClient();
  const [showQR, setShowQR] = useState<string | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["form-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("link_pages")
        .select("*")
        .or("template.eq.form_only,lead_form_enabled.eq.true")
        .order("created_at", { ascending: false });
      if (error) return [];
      return (data || []).filter((p: any) => p.template === "form_only" || p.lead_form_enabled);
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const slug = `form-${Math.random().toString(36).substring(2, 8)}`;
      const { data, error } = await (supabase as any)
        .from("link_pages")
        .insert({
          title: "Nova Página de Captação",
          slug,
          user_id: u.user?.id,
          lead_form_enabled: true,
          template: "form_only",
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-items"] });
      toast.success("Formulário criado! Acesse o editor para personalizar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("link_pages").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["form-items"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("link_pages").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["form-items"] }); toast.success("Excluído."); },
  });

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Formulários de Captação</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Landing pages focadas em capturar leads automotivos
              </p>
            </div>
          </div>
          <button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm disabled:opacity-60"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Novo Formulário
          </button>
        </div>

        {/* What is this */}
        <div className="mt-4 p-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl flex items-start gap-3">
          <Target className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            <span className="font-bold text-foreground">Formulário de Captação</span> é uma Landing Page objetiva
            com campos de nome, WhatsApp, e-mail e veículo de interesse. Ideal como destino de anúncios.
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6 flex-1">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
              <FileText className="w-7 h-7 text-emerald-500/60" />
            </div>
            <p className="font-black text-foreground/70">Nenhum formulário criado</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Crie sua primeira landing page de captação de leads.
            </p>
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="mt-5 flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-2.5 rounded-xl text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              Criar Primeiro Formulário
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item: any, i: number) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-lg transition-all flex flex-col"
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-green-400" />

                <div className="p-4 flex-1">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.is_active ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                          {item.is_active ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                          {item.is_active ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                      <h3 className="font-black text-sm text-foreground truncate">{item.title}</h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">/p/{item.slug}</p>
                    </div>
                    <button
                      onClick={() => toggleMutation.mutate({ id: item.id, is_active: !item.is_active })}
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center justify-center rounded-full border-2 border-transparent transition-colors ${item.is_active ? "bg-emerald-500" : "bg-muted"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.is_active ? "translate-x-2" : "-translate-x-2"}`} />
                    </button>
                  </div>

                  {/* Fields info */}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{item.views_count || 0} visitas</span>
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" />Captura nome, WPP, email, veículo</span>
                  </div>
                </div>

                <div className="border-t border-border p-3 flex items-center gap-1.5">
                  <a href={`/p/${item.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Ver formulário">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button onClick={() => setShowQR(item.slug)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="QR Code">
                    <QrCode className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    to="/organizador"
                    className="flex-1 flex items-center justify-center gap-1.5 ml-auto px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg transition-colors"
                  >
                    <Edit className="w-3 h-3" />
                    Editar
                    <ArrowRight className="w-3 h-3 ml-auto" />
                  </Link>
                  <button
                    onClick={() => { if (confirm("Excluir este formulário?")) deleteMutation.mutate(item.id); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            ))}

            {/* Create card */}
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex flex-col items-center justify-center min-h-[160px] rounded-2xl border-2 border-dashed border-border hover:border-emerald-500/40 hover:bg-emerald-500/[0.03] transition-all gap-3 p-6 text-center group"
            >
              <div className="w-12 h-12 rounded-2xl bg-muted group-hover:bg-emerald-500/10 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500 transition-colors" />
              </div>
              <div>
                <p className="text-sm font-black text-muted-foreground group-hover:text-foreground transition-colors">Novo Formulário</p>
                <p className="text-xs text-muted-foreground/60 mt-0.5">Criar nova landing page</p>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* QR Modal */}
      {showQR && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setShowQR(null)}>
          <div className="bg-card border border-border rounded-2xl p-6 max-w-xs w-full text-center shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-black text-base mb-4">QR Code</h3>
            <div className="bg-white p-3 rounded-xl inline-block">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(window.location.origin + "/p/" + showQR)}`} alt="QR Code" className="w-40 h-40" />
            </div>
            <p className="text-xs text-muted-foreground mt-4 mb-3">/p/{showQR}</p>
            <button onClick={() => setShowQR(null)} className="w-full bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors">Fechar</button>
          </div>
        </div>
      )}
    </div>
  );
}
