import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Plus, Eye, ExternalLink, Edit, Trash2, QrCode, Loader2,
  ArrowRight, Target, CheckCircle2, XCircle, Users, BarChart3, Database,
  TrendingUp, Download, Search, Check, RefreshCw, MessageSquare, AlertCircle, Copy, Link as LinkIcon
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/formulario")({
  component: FormularioPage,
  head: () => ({ meta: [{ title: "Formulários & Capturas — NC Suite" }] }),
});

function FormularioPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<"forms" | "crm" | "metrics">("forms");
  const [showQR, setShowQR] = useState<string | null>(null);
  
  // Search & Filter for CRM
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");

  // UTM Generator State per Form ID
  const [utmStates, setUtmStates] = useState<Record<string, { source: string; medium: string; campaign: string; content: string }>>({});

  // 1. Fetch Forms
  const { data: items = [], isLoading: isLoadingForms } = useQuery({
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

  // 2. Fetch Quizzes (for naming match in leads table)
  const { data: quizzes = [] } = useQuery({
    queryKey: ["quizzes-list-simple"],
    queryFn: async () => {
      const { data } = await supabase.from("quizzes").select("id, title");
      return data || [];
    }
  });

  // 3. Fetch Leads
  const { data: leads = [], isLoading: isLoadingLeads } = useQuery({
    queryKey: ["all-leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lead_captures")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    }
  });

  // Mutations
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["form-items"] });
      toast.success("Excluído com sucesso.");
    },
  });

  const updateLeadStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("lead_captures").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-leads"] });
      toast.success("Status do lead atualizado.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLeadMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("lead_captures").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["all-leads"] });
      toast.success("Lead excluído.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // In-memory mappings
  const formMap = useMemo(() => new Map(items.map((i: any) => [i.id, i.title])), [items]);
  const quizMap = useMemo(() => new Map(quizzes.map((q: any) => [q.id, q.title])), [quizzes]);

  // Filters & Search logic
  const filteredLeads = useMemo(() => {
    return leads.filter((lead: any) => {
      const matchesSearch =
        lead.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.phone?.includes(searchTerm) ||
        lead.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lead.vehicle_interest?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "todos" || lead.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [leads, searchTerm, statusFilter]);

  // CSV Exporter
  const handleExportCSV = () => {
    if (!filteredLeads.length) {
      toast.error("Nenhum lead para exportar.");
      return;
    }
    const headers = ["Nome", "WhatsApp", "E-mail", "Origem", "Formulario/Quiz", "Veiculo de Interesse", "Status", "UTM Source", "UTM Medium", "UTM Campaign", "Data de Criacao"];
    const rows = filteredLeads.map((l: any) => {
      const sourceName = l.source === 'quiz' ? (quizMap.get(l.quiz_id) || "Quiz") : (formMap.get(l.page_id) || "Formulário");
      return [
        l.name,
        l.phone,
        l.email || "",
        l.source || "form",
        sourceName,
        l.vehicle_interest || "",
        l.status || "novo",
        l.utm_source || "Direto / Organico",
        l.utm_medium || "",
        l.utm_campaign || "",
        new Date(l.created_at).toLocaleString("pt-BR")
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
      + [headers.join(";"), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(";"))].join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `leads_ncsuite_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("CSV exportado com sucesso!");
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    const totalLeads = leads.length;
    const totalViews = items.reduce((acc, curr) => acc + (curr.views_count || 0), 0);
    const convRate = totalViews > 0 ? ((totalLeads / totalViews) * 100).toFixed(1) : "0";

    // Status counts
    const statusCounts = {
      novo: leads.filter((l: any) => l.status === 'novo' || !l.status).length,
      atendimento: leads.filter((l: any) => l.status === 'atendimento').length,
      ganho: leads.filter((l: any) => l.status === 'ganho').length,
      perdido: leads.filter((l: any) => l.status === 'perdido').length,
    };

    // Attribution UTM
    const utmAttribution: Record<string, number> = {};
    leads.forEach((l: any) => {
      const src = l.utm_source || "Orgânico / Direto";
      utmAttribution[src] = (utmAttribution[src] || 0) + 1;
    });

    const sortedUtms = Object.entries(utmAttribution)
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count);

    return {
      totalLeads,
      totalViews,
      convRate,
      statusCounts,
      sortedUtms
    };
  }, [leads, items]);

  const handleUTMChange = (formId: string, field: string, val: string) => {
    setUtmStates(prev => ({
      ...prev,
      [formId]: {
        ...(prev[formId] || { source: "", medium: "", campaign: "", content: "" }),
        [field]: val
      }
    }));
  };

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="border-b border-border px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <FileText className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <h1 className="text-lg font-black leading-none">Formulários & Conversões</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Central profissional de captação, CRM de leads e atribuição de marketing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
              className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-60"
            >
              {createMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              Novo Formulário
            </button>
          </div>
        </div>

        {/* Tabs Control */}
        <div className="flex items-center gap-1 mt-6 border-b border-border/60 pb-px">
          <button
            onClick={() => setActiveTab("forms")}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'forms' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <FileText className="w-3.5 h-3.5" />
            Formulários Ativos
          </button>
          <button
            onClick={() => setActiveTab("crm")}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'crm' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <Database className="w-3.5 h-3.5" />
            Central de Leads (CRM)
            {leads.length > 0 && (
              <span className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
                {leads.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("metrics")}
            className={`px-4 py-2 text-xs font-bold transition-all border-b-2 flex items-center gap-2 ${activeTab === 'metrics' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Métricas & Atribuição
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="px-6 py-6 flex-1">
        {activeTab === "forms" && (
          <div className="space-y-6">
            {isLoadingForms ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4">
                  <FileText className="w-7 h-7 text-emerald-500/60" />
                </div>
                <p className="font-black text-foreground/70 text-sm">Nenhum formulário ativo</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                  Crie sua primeira landing page de captação e comece a anunciar.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {items.map((item: any) => {
                  const utmState = utmStates[item.id] || { source: "", medium: "", campaign: "", content: "" };
                  const baseUrl = `${window.location.origin}/p/${item.slug}`;
                  const queryParams = new URLSearchParams();
                  if (utmState.source) queryParams.set("utm_source", utmState.source);
                  if (utmState.medium) queryParams.set("utm_medium", utmState.medium);
                  if (utmState.campaign) queryParams.set("utm_campaign", utmState.campaign);
                  if (utmState.content) queryParams.set("utm_content", utmState.content);
                  const generatedUrl = queryParams.toString() ? `${baseUrl}?${queryParams.toString()}` : baseUrl;

                  return (
                    <div
                      key={item.id}
                      className="bg-card border border-border rounded-2xl overflow-hidden hover:shadow-md transition-all flex flex-col relative"
                    >
                      <div className="h-1.5 w-full bg-gradient-to-r from-emerald-500 to-green-400" />
                      
                      <div className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${item.is_active ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}`}>
                              {item.is_active ? "Ativo" : "Inativo"}
                            </span>
                            <button
                              onClick={() => toggleMutation.mutate({ id: item.id, is_active: !item.is_active })}
                              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-transparent transition-colors ${item.is_active ? "bg-emerald-500" : "bg-muted"}`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${item.is_active ? "translate-x-2.5" : "-translate-x-2.5"}`} />
                            </button>
                          </div>
                          
                          <h3 className="font-black text-sm text-foreground truncate">{item.title}</h3>
                          <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">/p/{item.slug}</p>
                          
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground/75 mt-3">
                            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5 text-primary/60" /> {item.views_count || 0} visitas</span>
                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-emerald-500/70" /> {leads.filter(l => l.page_id === item.id).length} leads</span>
                          </div>
                        </div>

                        {/* UTM Link Generator Panel */}
                        <div className="mt-4 pt-4 border-t border-border/60">
                          <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
                            <LinkIcon className="w-3 h-3 text-emerald-500" /> Gerador de Links Trackeados
                          </p>
                          <div className="grid grid-cols-2 gap-2 mb-2">
                            <input
                              placeholder="Origem (ex: instagram)"
                              value={utmState.source}
                              onChange={(e) => handleUTMChange(item.id, "source", e.target.value)}
                              className="text-[10px] bg-background/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/60"
                            />
                            <input
                              placeholder="Mídia (ex: stories)"
                              value={utmState.medium}
                              onChange={(e) => handleUTMChange(item.id, "medium", e.target.value)}
                              className="text-[10px] bg-background/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/60"
                            />
                            <input
                              placeholder="Campanha"
                              value={utmState.campaign}
                              onChange={(e) => handleUTMChange(item.id, "campaign", e.target.value)}
                              className="text-[10px] bg-background/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/60"
                            />
                            <input
                              placeholder="Conteúdo"
                              value={utmState.content}
                              onChange={(e) => handleUTMChange(item.id, "content", e.target.value)}
                              className="text-[10px] bg-background/50 border border-border rounded-lg px-2 py-1 focus:outline-none focus:border-emerald-500/60"
                            />
                          </div>

                          <div className="bg-background/80 p-2 rounded-xl border border-border flex items-center justify-between gap-2 overflow-hidden">
                            <span className="text-[9px] font-mono text-muted-foreground truncate flex-1 select-all">{generatedUrl}</span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(generatedUrl);
                                toast.success("Link copiado com UTMs!");
                              }}
                              className="p-1 rounded bg-muted hover:bg-emerald-500/10 text-muted-foreground hover:text-emerald-500 transition-colors"
                              title="Copiar Link"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="border-t border-border/60 p-3 bg-muted/10 flex items-center gap-1.5">
                        <a href={`/p/${item.slug}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Ver formulário">
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                        <button onClick={() => setShowQR(item.slug)} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="QR Code">
                          <QrCode className="w-3.5 h-3.5" />
                        </button>
                        
                        <Link
                          to="/organizador"
                          search={{ edit: item.id } as any}
                          className="flex-1 flex items-center justify-center gap-1.5 ml-auto px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold rounded-lg transition-colors"
                        >
                          <Edit className="w-3 h-3" />
                          Configurações
                          <ArrowRight className="w-3 h-3 ml-auto" />
                        </Link>
                        
                        <button
                          onClick={() => { if (confirm("Excluir permanentemente este formulário?")) deleteMutation.mutate(item.id); }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "crm" && (
          <div className="space-y-4">
            {/* Control Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between bg-card p-4 rounded-2xl border border-border shadow-sm">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  placeholder="Buscar leads por nome, WhatsApp ou veículo..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 pr-4 py-2 w-full rounded-xl border border-border bg-background text-xs focus:outline-none focus:border-primary transition-colors"
                />
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-2 text-xs focus:outline-none focus:border-primary flex-1 sm:flex-none"
                >
                  <option value="todos">Todos os Status</option>
                  <option value="novo">Novo</option>
                  <option value="atendimento">Em Atendimento</option>
                  <option value="ganho">Ganho (Fechado)</option>
                  <option value="perdido">Perdido</option>
                </select>

                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 px-3 rounded-xl text-xs transition-colors shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Exportar CSV
                </button>
              </div>
            </div>

            {/* Leads Table */}
            {isLoadingLeads ? (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : filteredLeads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-2xl">
                <Users className="w-8 h-8 text-muted-foreground/50 mb-3" />
                <p className="font-bold text-foreground/70 text-sm">Nenhum lead encontrado</p>
                <p className="text-xs text-muted-foreground mt-0.5">Experimente limpar os filtros de busca.</p>
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-muted/40 border-b border-border text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                        <th className="p-4">Lead</th>
                        <th className="p-4">Contato</th>
                        <th className="p-4">Interesse</th>
                        <th className="p-4">Origem</th>
                        <th className="p-4">UTM Atribuição</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60 text-xs">
                      {filteredLeads.map((lead: any) => {
                        const sourceTitle = lead.source === 'quiz' ? (quizMap.get(lead.quiz_id) || "Quiz") : (formMap.get(lead.page_id) || "Formulário");
                        
                        return (
                          <tr key={lead.id} className="hover:bg-muted/10 transition-colors">
                            <td className="p-4">
                              <div className="font-bold text-foreground">{lead.name}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{new Date(lead.created_at).toLocaleString("pt-BR")}</div>
                            </td>
                            <td className="p-4 space-y-0.5">
                              <div className="font-medium text-foreground">{lead.phone}</div>
                              {lead.email && <div className="text-[10px] text-muted-foreground">{lead.email}</div>}
                            </td>
                            <td className="p-4">
                              {lead.vehicle_interest ? (
                                <span className="font-semibold text-primary">{lead.vehicle_interest}</span>
                              ) : (
                                <span className="text-muted-foreground/60 italic">Nenhum especificado</span>
                              )}
                            </td>
                            <td className="p-4">
                              <div className="flex items-center gap-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${lead.source === 'quiz' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'}`}>
                                  {lead.source || 'form'}
                                </span>
                                <span className="font-medium max-w-[120px] truncate text-muted-foreground" title={sourceTitle}>
                                  {sourceTitle}
                                </span>
                              </div>
                            </td>
                            <td className="p-4">
                              {lead.utm_source ? (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-emerald-500 text-[10px]">{lead.utm_source}</div>
                                  {(lead.utm_medium || lead.utm_campaign) && (
                                    <div className="text-[9px] text-muted-foreground font-mono truncate max-w-[140px]">
                                      {lead.utm_medium} / {lead.utm_campaign}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground/50 italic text-[10px]">Orgânico / Direto</span>
                              )}
                            </td>
                            <td className="p-4">
                              <select
                                value={lead.status || "novo"}
                                onChange={(e) => updateLeadStatusMutation.mutate({ id: lead.id, status: e.target.value })}
                                className={`font-bold text-[10px] uppercase rounded-lg px-2.5 py-1 outline-none border ${
                                  lead.status === 'ganho' ? 'bg-success/10 text-success border-success/20' :
                                  lead.status === 'perdido' ? 'bg-destructive/10 text-destructive border-destructive/20' :
                                  lead.status === 'atendimento' ? 'bg-orange-500/10 text-orange-400 border-orange-500/20' :
                                  'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                                }`}
                              >
                                <option value="novo" className="bg-background text-foreground">Novo</option>
                                <option value="atendimento" className="bg-background text-foreground">Em Atendimento</option>
                                <option value="ganho" className="bg-background text-foreground">Ganho (Vendido)</option>
                                <option value="perdido" className="bg-background text-foreground">Perdido</option>
                              </select>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex justify-end gap-1.5">
                                <a
                                  href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 rounded-lg bg-green-500/10 text-green-500 hover:bg-green-500/20 transition-colors"
                                  title="Iniciar conversa no WhatsApp"
                                >
                                  <MessageSquare className="w-3.5 h-3.5" />
                                </a>
                                <button
                                  onClick={() => { if(confirm("Excluir este lead permanentemente?")) deleteLeadMutation.mutate(lead.id); }}
                                  className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                  title="Remover Lead"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "metrics" && (
          <div className="space-y-6">
            {/* Overview Stats Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Total de Leads Capturados</p>
                <h3 className="text-3xl font-black text-foreground mt-2">{metrics.totalLeads}</h3>
                <span className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1"><TrendingUp className="w-3 h-3 text-emerald-500" /> Todos os formulários e quizzes</span>
              </div>
              
              <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Visualizações de Páginas</p>
                <h3 className="text-3xl font-black text-foreground mt-2">{metrics.totalViews}</h3>
                <span className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1"><Eye className="w-3 h-3 text-blue-500" /> Visitas únicas acumuladas</span>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Taxa Média de Conversão</p>
                <h3 className="text-3xl font-black text-foreground mt-2">{metrics.convRate}%</h3>
                <span className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1"><CheckCircle2 className="w-3 h-3 text-primary" /> Leads / Visualizações</span>
              </div>

              <div className="bg-card border border-border rounded-2xl p-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-orange-500" />
                <p className="text-[10px] font-bold text-muted-foreground uppercase">Em Atendimento Comercial</p>
                <h3 className="text-3xl font-black text-foreground mt-2">{metrics.statusCounts.atendimento}</h3>
                <span className="text-[9px] text-muted-foreground flex items-center gap-1 mt-1"><Users className="w-3 h-3 text-orange-500" /> Em negociação no CRM</span>
              </div>
            </div>

            {/* Attribution Breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* UTM Attribution List */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-black text-sm text-foreground flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-emerald-500" /> Atribuição de Origem (UTM Source)
                </h3>
                
                {metrics.sortedUtms.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60 italic">Nenhum dado de atribuição disponível.</p>
                ) : (
                  <div className="space-y-3.5 pt-2">
                    {metrics.sortedUtms.map((item, idx) => {
                      const percentage = metrics.totalLeads > 0 ? (item.count / metrics.totalLeads) * 100 : 0;
                      return (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold font-mono text-[10.5px] text-muted-foreground">{item.source}</span>
                            <span className="font-black text-foreground">{item.count} leads ({percentage.toFixed(0)}%)</span>
                          </div>
                          <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Status Funnel */}
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
                <h3 className="font-black text-sm text-foreground flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-primary" /> Funil de Status do CRM
                </h3>

                <div className="flex flex-col gap-2 pt-2">
                  {[
                    { name: "Novos Leads", count: metrics.statusCounts.novo, color: "bg-blue-500" },
                    { name: "Em Atendimento", count: metrics.statusCounts.atendimento, color: "bg-orange-500" },
                    { name: "Ganhos / Vendidos", count: metrics.statusCounts.ganho, color: "bg-success" },
                    { name: "Perdidos", count: metrics.statusCounts.perdido, color: "bg-destructive" }
                  ].map((f, i) => {
                    const maxVal = Math.max(metrics.statusCounts.novo, metrics.statusCounts.atendimento, metrics.statusCounts.ganho, metrics.statusCounts.perdido) || 1;
                    const widthPercent = (f.count / maxVal) * 100;
                    return (
                      <div key={i} className="flex items-center gap-4 text-xs">
                        <span className="w-28 font-bold text-muted-foreground">{f.name}</span>
                        <div className="flex-1 bg-muted/40 h-8 rounded-xl overflow-hidden relative border border-border/40">
                          <div className={`h-full ${f.color} opacity-20`} style={{ width: `${widthPercent}%` }} />
                          <div className="absolute inset-0 flex items-center px-3 font-black text-foreground">
                            {f.count}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
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
