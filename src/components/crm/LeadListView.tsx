import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase-external/client";
import { 
  Trash2, 
  UserPlus, 
  Download, 
  ExternalLink,
  ChevronDown,
  Loader2,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";

interface LeadListViewProps {
  pipelineId?: string;
  clientId?: string;
  searchQuery: string;
  myLeadsOnly: boolean;
  currentUserId?: string;
  onClickLead: (lead: any) => void;
  refetchTrigger: number;
  inModal?: boolean;
}

export function LeadListView({
  pipelineId,
  clientId,
  searchQuery,
  myLeadsOnly,
  currentUserId,
  onClickLead,
  refetchTrigger,
  inModal = false
}: LeadListViewProps) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    async function loadUserProfile() {
      if (!user?.id) return;
      const { data } = await (supabase as any)
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setProfile(data);
      }
    }
    loadUserProfile();
  }, [user]);

  const isAdminOrSdr = profile?.role === "admin" || profile?.role === "agency_sdr";

  const [leads, setLeads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  
  // Local Filters
  const [tempFilter, setTempFilter] = useState<string>("ALL");
  const [sdrFilter, setSdrFilter] = useState<string>("ALL");

  // Bulk operation states
  const [bulkSdrOpen, setBulkSdrOpen] = useState(false);
  const [bulkSdrSelected, setBulkSdrSelected] = useState("");
  const [operatingBulk, setOperatingBulk] = useState(false);

  useEffect(() => {
    fetchLeads();
  }, [pipelineId, clientId, myLeadsOnly, currentUserId, refetchTrigger]);

  const { data: sdrs = [] } = useQuery({
    queryKey: ["profiles_sdrs_list", clientId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, role, client_id")
        .in("role", ["agency_sdr", "admin", "client_store"]);
      if (!data) return [];
      
      return data.filter((p: any) => 
        p.role !== "client_store" || 
        !clientId || 
        p.client_id === clientId
      );
    }
  });

  const fetchLeads = async () => {
    if (!pipelineId) {
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = (supabase as any)
        .from("crm_leads")
        .select(`*, profiles:assigned_to(full_name)`)
        .eq("pipeline_id", pipelineId);

      if (clientId) query = query.eq("client_id", clientId);
      if (myLeadsOnly && currentUserId) query = query.eq("assigned_to", currentUserId);

      let { data, error } = await query.order("created_at", { ascending: false });

      // Se o join falhar (ex: FK ainda não mapeada), tenta sem o join
      if (error) {
        let q2 = (supabase as any)
          .from("crm_leads")
          .select("*")
          .eq("pipeline_id", pipelineId);
        if (clientId) q2 = q2.eq("client_id", clientId);
        if (myLeadsOnly && currentUserId) q2 = q2.eq("assigned_to", currentUserId);
        const res2 = await q2.order("created_at", { ascending: false });
        if (res2.error) throw res2.error;
        data = res2.data;
      }

      setLeads(data || []);
    } catch (err: any) {
      console.error("Erro ao carregar leads:", err);
      setLeads([]);
      if (err?.code !== "42P01") {
        toast.error("Erro ao carregar lista de leads.");
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtragem local
  const filteredLeads = leads.filter(l => {
    // 1. Pesquisa
    const q = searchQuery.toLowerCase();
    const matchesSearch = !searchQuery.trim() || (
      (l.name && l.name.toLowerCase().includes(q)) ||
      (l.phone && l.phone.includes(q)) ||
      (l.email && l.email.toLowerCase().includes(q)) ||
      (l.vehicle_interest && l.vehicle_interest.toLowerCase().includes(q))
    );

    // 2. Temperatura
    const matchesTemp = tempFilter === "ALL" || l.negotiation_level === tempFilter;

    // 3. SDR Responsável
    const matchesSdr = sdrFilter === "ALL" || (
      sdrFilter === "UNASSIGNED" ? !l.assigned_to : l.assigned_to === sdrFilter
    );

    return matchesSearch && matchesTemp && matchesSdr;
  });

  // Checkboxes
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedLeadIds(filteredLeads.map(l => l.id));
    } else {
      setSelectedLeadIds([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedLeadIds(prev => [...prev, id]);
    } else {
      setSelectedLeadIds(prev => prev.filter(x => x !== id));
    }
  };

  // Ações em Lote: Excluir
  const handleBulkDelete = async () => {
    if (selectedLeadIds.length === 0) return;
    if (!window.confirm(`Deseja realmente excluir ${selectedLeadIds.length} leads em lote? Esta operação é irreversível.`)) return;

    setOperatingBulk(true);
    try {
      const { error } = await (supabase as any)
        .from("crm_leads")
        .delete()
        .in("id", selectedLeadIds);

      if (error) throw error;

      toast.success(`${selectedLeadIds.length} leads excluídos com sucesso.`);
      setSelectedLeadIds([]);
      fetchLeads();
    } catch (err) {
      toast.error("Erro ao excluir leads em lote.");
    } finally {
      setOperatingBulk(false);
    }
  };

  // Ações em Lote: Reatribuir SDR
  const handleBulkReassign = async () => {
    if (selectedLeadIds.length === 0 || !bulkSdrSelected) return;

    setOperatingBulk(true);
    try {
      const sdrId = bulkSdrSelected === "UNASSIGNED" ? null : bulkSdrSelected;
      const sdrName = sdrId ? sdrs.find(s => s.id === sdrId)?.full_name : "Não Atribuído";

      const { error } = await (supabase as any)
        .from("crm_leads")
        .update({ assigned_to: sdrId, updated_at: new Date().toISOString() })
        .in("id", selectedLeadIds);

      if (error) throw error;

      // Registrar atividade em lote
      const activityInserts = selectedLeadIds.map(id => ({
        lead_id: id,
        user_id: user?.id,
        type: "Atribuição",
        description: `Lead reatribuído via lote para: ${sdrName}`
      }));
      await (supabase as any).from("crm_activities").insert(activityInserts);

      toast.success(`SDR atualizado para ${selectedLeadIds.length} leads.`);
      setSelectedLeadIds([]);
      setBulkSdrOpen(false);
      setBulkSdrSelected("");
      fetchLeads();
    } catch (err) {
      toast.error("Erro ao reatribuir leads em lote.");
    } finally {
      setOperatingBulk(false);
    }
  };

  // Exportar para CSV
  const handleExportCSV = () => {
    if (filteredLeads.length === 0) {
      toast.error("Nenhum lead disponível para exportar.");
      return;
    }

    const headers = ["Nome", "Telefone", "E-mail", "Interesse", "Temperatura", "SDR", "Origem", "Criado Em"];
    const csvRows = [headers.join(",")];

    filteredLeads.forEach(l => {
      const row = [
        `"${(l.name || "").replace(/"/g, '""')}"`,
        `"${l.phone || ""}"`,
        `"${l.email || ""}"`,
        `"${(l.vehicle_interest || "").replace(/"/g, '""')}"`,
        `"${l.negotiation_level || "Frio"}"`,
        `"${(l.profiles?.full_name || "").replace(/"/g, '""')}"`,
        `"${(l.source || "Manual").replace(/"/g, '""')}"`,
        `"${new Date(l.created_at).toLocaleDateString()}"`
      ];
      csvRows.push(row.join(","));
    });

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `crm_leads_export_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Leads exportados com sucesso!");
  };

  // Checar se o lead estourou o SLA (15 min sem atendimento nas etapas de entrada)
  const isSlaBreached = (lead: any) => {
    const created = new Date(lead.created_at);
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const isNew = ["Novo Lead", "Entrada"].includes(lead.status);
    return isNew && created < fifteenMinsAgo && (!lead.updated_at || lead.updated_at === lead.created_at);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className={`bg-card border border-white/10 rounded-2xl p-4 space-y-4 flex flex-col ${inModal ? "h-full" : "h-[calc(100vh-200px)]"}`}>
      {/* Barra de Filtros e Exportação */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between pb-3 border-b border-white/5">
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {/* Filtro Temperatura */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">Temperatura:</span>
            <select
              value={tempFilter}
              onChange={(e) => setTempFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none font-bold text-foreground cursor-pointer bg-card"
            >
              <option value="ALL" className="bg-card text-foreground">Todas</option>
              <option value="Quente" className="bg-card text-foreground">Quente</option>
              <option value="Morno" className="bg-card text-foreground">Morno</option>
              <option value="Frio" className="bg-card text-foreground">Frio</option>
            </select>
          </div>

          {/* Filtro SDR */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-xs">
            <span className="text-muted-foreground">SDR:</span>
            <select
              value={sdrFilter}
              onChange={(e) => setSdrFilter(e.target.value)}
              className="bg-transparent border-none focus:outline-none font-bold text-foreground cursor-pointer bg-card"
            >
              <option value="ALL" className="bg-card text-foreground">Todos</option>
              <option value="UNASSIGNED" className="bg-card text-foreground">Não Atribuídos</option>
              {sdrs.map(s => (
                <option key={s.id} value={s.id} className="bg-card text-foreground">{s.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Botão Exportar */}
        <button
          onClick={handleExportCSV}
          className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-foreground text-xs font-bold rounded-xl px-4 py-2 transition-all cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" />
          Exportar CSV
        </button>
      </div>

      {/* Ações em Lote (Se tiver seleção) */}
      {selectedLeadIds.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3 items-center justify-between p-3 bg-primary/10 border border-primary/20 rounded-xl animate-fade-in">
          <span className="text-xs font-bold text-foreground font-mono">
            {selectedLeadIds.length} lead(s) selecionado(s)
          </span>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {/* Reatribuição em Lote */}
            <div className="relative w-full sm:w-auto">
              <button
                onClick={() => setBulkSdrOpen(!bulkSdrOpen)}
                className="w-full flex items-center justify-center gap-2 bg-card border border-white/10 text-foreground text-xs font-bold rounded-xl px-3 py-1.5 hover:bg-white/5 transition-all cursor-pointer"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Mudar SDR
                <ChevronDown className="h-3 w-3" />
              </button>
              
              {bulkSdrOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-card border border-white/10 rounded-xl shadow-2xl p-2 z-[99] space-y-2">
                  <select
                    value={bulkSdrSelected}
                    onChange={(e) => setBulkSdrSelected(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 text-xs rounded-lg px-2 py-1 focus:outline-none bg-card text-foreground"
                  >
                    <option value="">Selecione o SDR</option>
                    <option value="UNASSIGNED">Ninguém (Remover)</option>
                    {sdrs.map(s => (
                      <option key={s.id} value={s.id}>{s.full_name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkReassign}
                    disabled={!bulkSdrSelected || operatingBulk}
                    className="w-full bg-primary text-primary-foreground text-xs font-bold rounded-lg py-1 hover:bg-primary/95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            {/* Exclusão em Lote */}
            <button
              onClick={handleBulkDelete}
              disabled={operatingBulk}
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-red-500/20 border border-red-500/30 text-red-500 text-xs font-bold rounded-xl px-3 py-1.5 hover:bg-red-500/35 transition-all disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </button>
          </div>
        </div>
      )}

      {/* Grid de Dados / Tabela */}
      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-white/5 text-muted-foreground uppercase font-black tracking-widest text-[9px] sticky top-0 bg-card z-10">
              <th className="py-3 px-2 w-8">
                <input
                  type="checkbox"
                  checked={filteredLeads.length > 0 && selectedLeadIds.length === filteredLeads.length}
                  onChange={handleSelectAll}
                  className="rounded border-white/10 accent-primary"
                />
              </th>
              <th className="py-3 px-4">Nome</th>
              <th className="py-3 px-4">Contato</th>
              <th className="py-3 px-4">Interesse</th>
              <th className="py-3 px-4">Origem</th>
              <th className="py-3 px-4 text-center">Temperatura</th>
              <th className="py-3 px-4">Responsável</th>
              <th className="py-3 px-4 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map(l => {
              const checked = selectedLeadIds.includes(l.id);
              const hasSlaError = isSlaBreached(l);

              return (
                <tr 
                  key={l.id}
                  className={`border-b border-white/5 hover:bg-white/[0.02] transition-colors group ${hasSlaError ? "bg-red-500/[0.02] border-l-2 border-l-red-500" : ""}`}
                >
                  <td className="py-3 px-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => handleSelectOne(l.id, e.target.checked)}
                      className="rounded border-white/10 accent-primary"
                    />
                  </td>
                  <td className="py-3 px-4 font-bold text-foreground flex items-center gap-2">
                    {l.name}
                    {hasSlaError && (
                      <span className="shrink-0 flex items-center gap-1 bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest px-1 py-0.5 rounded border border-red-500/20 animate-pulse">
                        <AlertCircle className="h-2.5 w-2.5" />
                        SLA Estourado
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-muted-foreground font-mono">
                    <div className="flex flex-col">
                      <span>{l.phone || "Sem Telefone"}</span>
                      {l.email && <span className="text-[10px] opacity-50">{l.email}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {l.vehicle_interest ? (
                      <span className="text-[10px] font-bold text-primary uppercase tracking-widest bg-primary/10 px-2 py-0.5 rounded">
                        {l.vehicle_interest}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/30 font-mono">-</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-medium text-muted-foreground">{l.source || "Manual"}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${l.negotiation_level === 'Quente' ? 'bg-red-500/20 text-red-500' : l.negotiation_level === 'Morno' ? 'bg-amber-500/20 text-amber-500' : 'bg-blue-500/20 text-blue-500'}`}>
                      {l.negotiation_level || "Frio"}
                    </span>
                  </td>
                  <td className="py-3 px-4 font-bold text-foreground">
                    {l.profiles?.full_name || <span className="text-muted-foreground/30">Ninguém</span>}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => onClickLead(l)}
                      className="inline-flex items-center gap-1.5 text-primary hover:text-primary/80 font-bold transition-all cursor-pointer"
                    >
                      Detalhar
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredLeads.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nenhum lead encontrado com os filtros selecionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
