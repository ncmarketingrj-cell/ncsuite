import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { CrmDashboard } from "@/components/crm/CrmDashboard";
import { LeadListView } from "@/components/crm/LeadListView";
import { SdrAgenda } from "@/components/crm/SdrAgenda";
import { ImportLeadsModal } from "@/components/crm/ImportLeadsModal";
import { LeadDrawer } from "@/components/crm/LeadDrawer";
import { 
  Filter, Search, Plus, Settings, User, LayoutDashboard, Trello, 
  List, CalendarRange, Upload, ArrowLeft, ArrowRight, Users, 
  FolderPlus, Building2, UserPlus, Check, Target, ChevronRight, Loader2,
  Lock, RefreshCw
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase-external/client";
import { PipelineManagerModal } from "@/components/crm/PipelineManagerModal";
import { CreateLeadModal } from "@/components/crm/CreateLeadModal";
import { MyLeadsModal } from "@/components/crm/MyLeadsModal";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/crm")({
  head: () => ({ meta: [{ title: "CRM Suite — NC Performance & Vendas" }] }),
  component: CrmPage,
});

function CrmPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  // 1. Roles & Profile query
  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();

      // Auto-criação de perfil para resiliência
      if (!data && !error) {
        const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
        const isUserAdmin = user.email ? ADMIN_EMAILS.includes(user.email) : false;
        const defaultRole = isUserAdmin ? "admin" : "agency_sdr";
        
        const newProfile = {
          id: user.id,
          email: user.email,
          full_name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Usuário",
          role: defaultRole,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { data: inserted, error: insertError } = await supabase
          .from("profiles")
          .insert(newProfile)
          .select("role, client_id")
          .maybeSingle();
          
        if (!insertError && inserted) {
          return inserted;
        }
      }
      
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const ADMIN_EMAILS = ["nc.marketingrj@gmail.com", "hc.marketing.dgt@gmail.com"];
  const isManager = profile?.role === "admin" || profile?.role === "gerente" || profile?.role === "ceo" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const isSdr = profile?.role === "agency_sdr";
  const isClient = profile?.role === "client_store";
  const userClientId = profile?.client_id;

  // 2. Active Wizard State
  // 'client' | 'funnel' | 'sdrs' | 'board' | 'sdr-selection' | 'sdr-no-access' | 'loading'
  const [crmStep, setCrmStep] = useState<string>("loading");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  // Step 1 - Client selection inputs
  const [clientSearch, setClientSearch] = useState("");
  const [newClientFormOpen, setNewClientFormOpen] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  // Step 2 - Funnel selection inputs
  const [newPipelineFormOpen, setNewPipelineFormOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState("");

  // Step 3 - SDR selection list
  const [checkedSdrIds, setCheckedSdrIds] = useState<string[]>([]);
  const [savingSdrs, setSavingSdrs] = useState(false);

  // CRM Tabs & Views
  const [activeTab, setActiveTab] = useState<"dashboard" | "funnel" | "agenda">("funnel");
  const [funnelView, setFunnelView] = useState<"kanban" | "list">("kanban");
  const [searchQuery, setSearchQuery] = useState("");
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Modals
  const [showManager, setShowManager] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [showImportLeads, setShowImportLeads] = useState(false);
  const [showMyLeads, setShowMyLeads] = useState(false);
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Queries for Clients
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["clients_list_crm"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data || [];
    },
    enabled: isManager
  });

  // Queries for Funnels (Pipelines)
  const { data: pipelines = [], isLoading: loadingPipelines } = useQuery({
    queryKey: ["crm_pipelines_list", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data } = await supabase
        .from("crm_pipelines")
        .select("id, name, client_id, clients(name)")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: false });
      return data || [];
    },
    enabled: !!selectedClientId
  });

  // SDR Assignments Query
  const { data: sdrAssignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ["sdr_pipeline_assignments", user?.id],
    queryFn: async () => {
      if (!user?.id || !isSdr) return [];
      const { data } = await supabase
        .from("crm_pipeline_sdrs")
        .select("pipeline_id, crm_pipelines(id, name, client_id, clients(name))")
        .eq("sdr_id", user.id);
      return data || [];
    },
    enabled: !!user?.id && isSdr
  });

  // Query for all active commercial profiles (SDRs, Managers, Admins)
  const { data: allActiveProfiles = [] } = useQuery({
    queryKey: ["all_active_commercial_profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, role")
        .in("role", ["admin", "ceo", "gerente", "agency_sdr"])
        .eq("status", "ativo")
        .order("full_name");
      return data || [];
    },
    enabled: isManager
  });

  // Query SDRs currently assigned to selected pipeline (Step 3)
  const { data: currentPipelineSdrs = [], refetch: refetchPipelineSdrs } = useQuery({
    queryKey: ["current_pipeline_sdrs", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return [];
      const { data } = await supabase
        .from("crm_pipeline_sdrs")
        .select("sdr_id")
        .eq("pipeline_id", selectedPipelineId);
      return data?.map((d: any) => d.sdr_id) || [];
    },
    enabled: !!selectedPipelineId && isManager
  });

  // Profiles of active SDRs assigned to current board (Step 4 Header)
  const { data: boardActiveSdrs = [] } = useQuery({
    queryKey: ["board_active_sdrs", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return [];
      const { data } = await supabase
        .from("crm_pipeline_sdrs")
        .select("profiles(id, full_name, role, avatar_url)")
        .eq("pipeline_id", selectedPipelineId);
      return data?.map((d: any) => d.profiles).filter(Boolean) || [];
    },
    enabled: !!selectedPipelineId
  });

  // Sync checklist selection when entering Step 3
  useEffect(() => {
    if (crmStep === "sdrs") {
      setCheckedSdrIds(currentPipelineSdrs);
    }
  }, [crmStep, currentPipelineSdrs]);

  // Initial routing selection logic
  useEffect(() => {
    if (profileLoading) return;
    
    if (isClient) {
      // Auto-load client funnel
      const fetchClientFunnels = async () => {
        if (!userClientId) {
          setCrmStep("sdr-no-access");
          return;
        }
        const { data } = await supabase
          .from("crm_pipelines")
          .select("id")
          .eq("client_id", userClientId)
          .order("created_at", { ascending: false });
        
        if (data && data.length > 0) {
          setSelectedClientId(userClientId);
          setSelectedPipelineId(data[0].id);
          setCrmStep("board");
        } else {
          setCrmStep("sdr-no-access");
        }
      };
      fetchClientFunnels();
    } else if (isSdr) {
      if (loadingAssignments) return;

      if (sdrAssignments.length === 0) {
        setCrmStep("sdr-no-access");
      } else if (sdrAssignments.length === 1) {
        const single = sdrAssignments[0];
        setSelectedClientId(single.crm_pipelines.client_id);
        setSelectedPipelineId(single.pipeline_id);
        setCrmStep("board");
      } else {
        setCrmStep("sdr-selection");
      }
    } else if (isManager) {
      // Check localStorage
      const cachedClient = localStorage.getItem("nc_crm_active_client_id");
      const cachedPipe = localStorage.getItem("nc_crm_active_pipeline_id");
      if (cachedClient && cachedPipe) {
        setSelectedClientId(cachedClient);
        setSelectedPipelineId(cachedPipe);
        setCrmStep("board");
      } else {
        setCrmStep("client");
      }
    }
  }, [profile, profileLoading, sdrAssignments, loadingAssignments]);

  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    localStorage.setItem("nc_crm_active_client_id", clientId);
    setSelectedPipelineId("");
    localStorage.removeItem("nc_crm_active_pipeline_id");
    setCrmStep("funnel");
  };

  const handleSelectPipeline = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    localStorage.setItem("nc_crm_active_pipeline_id", pipelineId);
    setCrmStep("sdrs");
  };

  const handleConfirmSdrs = async () => {
    if (!selectedPipelineId) return;
    setSavingSdrs(true);
    try {
      // Remove old assignments
      await supabase.from("crm_pipeline_sdrs").delete().eq("pipeline_id", selectedPipelineId);
      
      // Save new assignments
      if (checkedSdrIds.length > 0) {
        const payload = checkedSdrIds.map(id => ({
          pipeline_id: selectedPipelineId,
          sdr_id: id
        }));
        const { error } = await supabase.from("crm_pipeline_sdrs").insert(payload);
        if (error) throw error;
      }
      toast.success("SDRs alocados com sucesso no funil!");
      refetchPipelineSdrs();
      setCrmStep("board");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar equipe.");
    } finally {
      setSavingSdrs(false);
    }
  };

  const handleCreateClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) return;
    try {
      const { data, error } = await supabase
        .from("clients")
        .insert({ name: newClientName.trim(), type: "automotivo" })
        .select()
        .single();
      if (error) throw error;
      
      toast.success(`Cliente ${data.name} criado com sucesso!`);
      setNewClientName("");
      setNewClientFormOpen(false);
      qc.invalidateQueries({ queryKey: ["clients_list_crm"] });
      handleSelectClient(data.id);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar cliente.");
    }
  };

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPipelineName.trim() || !selectedClientId) return;
    try {
      const { data: pipe, error } = await supabase
        .from("crm_pipelines")
        .insert({ name: newPipelineName.trim(), client_id: selectedClientId })
        .select()
        .single();
      if (error) throw error;

      // Create default stages for automotive commercial funnel
      const defaultStages = [
        { pipeline_id: pipe.id, name: "Novo Lead", stage_order: 0, color: "neutral" },
        { pipeline_id: pipe.id, name: "Tentativa de Contato", stage_order: 1, color: "amber" },
        { pipeline_id: pipe.id, name: "Em Negociação", stage_order: 2, color: "blue" },
        { pipeline_id: pipe.id, name: "Visita Agendada", stage_order: 3, color: "purple" },
        { pipeline_id: pipe.id, name: "Vendido", stage_order: 4, color: "success" },
        { pipeline_id: pipe.id, name: "Perdido", stage_order: 5, color: "red" },
      ];
      await supabase.from("crm_pipeline_stages").insert(defaultStages);

      toast.success(`Funil ${pipe.name} criado com etapas comercial padrão!`);
      setNewPipelineName("");
      setNewPipelineFormOpen(false);
      qc.invalidateQueries({ queryKey: ["crm_pipelines_list", selectedClientId] });
      handleSelectPipeline(pipe.id);
    } catch (err: any) {
      toast.error(err.message || "Erro ao cadastrar funil.");
    }
  };

  const resetSelection = () => {
    localStorage.removeItem("nc_crm_active_client_id");
    localStorage.removeItem("nc_crm_active_pipeline_id");
    setSelectedClientId("");
    setSelectedPipelineId("");
    setCrmStep("client");
  };

  const handleOpenLeadDrawer = (lead: any) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  const handleLeadUpdate = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  // Filter clients by search query in Step 1
  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  // Loading screen
  if (crmStep === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-xs text-muted-foreground font-semibold">Carregando painel de vendas...</p>
      </div>
    );
  }

  // SDR No access warning
  if (crmStep === "sdr-no-access") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <Lock className="h-16 w-16 text-primary/40 mb-4 animate-pulse" />
        <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">Sem Funil Vinculado</h2>
        <p className="text-muted-foreground text-sm max-w-sm">
          Seu perfil ainda não foi associado a nenhum funil de vendas ativo. Solicite ao gestor da agência sua alocação comercial.
        </p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 flex items-center gap-2 bg-white/5 border border-white/10 px-4 py-2 rounded-xl text-xs font-bold hover:bg-white/10 text-foreground transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Recarregar
        </button>
      </div>
    );
  }

  // SDR Multi-funnel Selection screen
  if (crmStep === "sdr-selection") {
    return (
      <div className="mx-auto max-w-4xl space-y-8 p-4">
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-black text-foreground uppercase tracking-widest">Painel de Vendas</h2>
          <p className="text-muted-foreground text-sm">Selecione o funil comercial no qual irá operar hoje.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {sdrAssignments.map((assign: any) => (
            <div 
              key={assign.pipeline_id}
              onClick={() => {
                setSelectedClientId(assign.crm_pipelines.client_id);
                setSelectedPipelineId(assign.pipeline_id);
                setCrmStep("board");
              }}
              className="glass-panel p-6 border border-white/5 hover:border-primary/50 cursor-pointer transition-all flex flex-col justify-between group relative overflow-hidden h-40"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full">
                  {assign.crm_pipelines.clients?.name || "Cliente Local"}
                </span>
                <h3 className="text-lg font-black text-foreground mt-3 group-hover:text-primary transition-colors">
                  {assign.crm_pipelines.name}
                </h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-semibold group-hover:text-foreground transition-colors self-end mt-4">
                Entrar no Pipeline <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Step 1: Client Selection (Managers)
  if (crmStep === "client") {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">Passo 1 de 3</span>
            <h2 className="text-xl font-black text-foreground uppercase tracking-wider">Selecione o Cliente / Conta</h2>
            <p className="text-xs text-muted-foreground">Escolha a conta comercial para gerenciar ou criar pipelines de vendas.</p>
          </div>
          <button 
            onClick={() => setNewClientFormOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm cursor-pointer"
          >
            <UserPlus className="h-4 w-4" /> Cadastrar Novo Cliente
          </button>
        </div>

        {/* Modal Inline - New Client Form */}
        {newClientFormOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-5 border border-primary/30 max-w-md"
          >
            <form onSubmit={handleCreateClient} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Building2 className="h-4 w-4 text-primary" /> Novo Cliente do CRM
                </h4>
                <button type="button" onClick={() => setNewClientFormOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
              <input 
                type="text" 
                required
                value={newClientName}
                onChange={(e) => setNewClientName(e.target.value)}
                placeholder="Nome da loja/empresa (ex: Alfa Motors)"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setNewClientFormOpen(false)} className="px-3 py-1.5 hover:bg-white/5 rounded-lg text-muted-foreground">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90">Criar Cliente</button>
              </div>
            </form>
          </motion.div>
        )}

        <div className="flex items-center gap-2 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input 
            type="text"
            value={clientSearch}
            onChange={(e) => setClientSearch(e.target.value)}
            placeholder="Buscar por cliente..."
            className="w-full bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
          />
        </div>

        {loadingClients ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredClients.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum cliente cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {filteredClients.map((c: any) => (
              <div 
                key={c.id}
                onClick={() => handleSelectClient(c.id)}
                className="glass-panel p-5 border border-white/5 hover:border-primary/40 cursor-pointer transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary group-hover:scale-105 transition-transform">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{c.name}</h3>
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase mt-0.5">Automotivo</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Step 2: Pipeline Selection (Managers)
  if (crmStep === "funnel") {
    const selectedClientObj = clients.find(c => c.id === selectedClientId);

    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
          <button onClick={() => setCrmStep("client")} className="hover:text-foreground flex items-center gap-1 transition-colors">
            <ArrowLeft className="h-3 w-3" /> Clientes
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{selectedClientObj?.name}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">Passo 2 de 3</span>
            <h2 className="text-xl font-black text-foreground uppercase tracking-wider">Selecione o Funil de Vendas</h2>
            <p className="text-xs text-muted-foreground">Cada cliente pode gerenciar múltiplos pipelines comerciais (ex: Novos, Seminovos).</p>
          </div>
          <button 
            onClick={() => setNewPipelineFormOpen(true)}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm cursor-pointer"
          >
            <FolderPlus className="h-4 w-4" /> Criar Novo Funil
          </button>
        </div>

        {/* Modal Inline - New Funnel */}
        {newPipelineFormOpen && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-5 border border-primary/30 max-w-md"
          >
            <form onSubmit={handleCreatePipeline} className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                  <Target className="h-4 w-4 text-primary" /> Novo Funil Comercial
                </h4>
                <button type="button" onClick={() => setNewPipelineFormOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
              <input 
                type="text" 
                required
                value={newPipelineName}
                onChange={(e) => setNewPipelineName(e.target.value)}
                placeholder="Ex: Funil Seminovos, Pós-Venda"
                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <p className="text-[10px] text-muted-foreground">O funil será inicializado automaticamente com as etapas padrão de vendas.</p>
              <div className="flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setNewPipelineFormOpen(false)} className="px-3 py-1.5 hover:bg-white/5 rounded-lg text-muted-foreground">Cancelar</button>
                <button type="submit" className="px-4 py-1.5 bg-primary text-primary-foreground font-bold rounded-lg hover:bg-primary/90">Criar Funil</button>
              </div>
            </form>
          </motion.div>
        )}

        {loadingPipelines ? (
          <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : pipelines.length === 0 ? (
          <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.01]">
            <Target className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum funil ativo para este cliente.</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Crie um funil comercial para começar a gerenciar os leads.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {pipelines.map((p: any) => (
              <div 
                key={p.id}
                onClick={() => handleSelectPipeline(p.id)}
                className="glass-panel p-5 border border-white/5 hover:border-primary/40 cursor-pointer transition-all flex flex-col justify-between group h-36"
              >
                <div>
                  <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{p.name}</h3>
                  <div className="flex flex-wrap gap-1 mt-3">
                    <span className="text-[9px] bg-white/5 text-muted-foreground px-1.5 py-0.5 rounded">6 Etapas</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[11px] text-muted-foreground group-hover:text-foreground font-bold mt-4 self-end transition-colors">
                  Alocar SDRs <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Step 3: SDR allocation (Managers)
  if (crmStep === "sdrs") {
    const selectedClientObj = clients.find(c => c.id === selectedClientId);
    const selectedPipelineObj = pipelines.find(p => p.id === selectedPipelineId);

    const toggleSdrSelection = (id: string) => {
      setCheckedSdrIds(prev => 
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
      );
    };

    return (
      <div className="mx-auto max-w-5xl space-y-6 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-bold">
          <button onClick={() => setCrmStep("client")} className="hover:text-foreground transition-colors">Clientes</button>
          <ChevronRight className="h-3 w-3" />
          <button onClick={() => setCrmStep("funnel")} className="hover:text-foreground transition-colors">{selectedClientObj?.name}</button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-foreground">{selectedPipelineObj?.name}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <span className="text-[10px] uppercase tracking-widest font-bold text-primary">Passo 3 de 3</span>
            <h2 className="text-xl font-black text-foreground uppercase tracking-wider">Atribuir Equipe de SDRs</h2>
            <p className="text-xs text-muted-foreground">Defina quais operadores comerciais têm permissão para acessar os leads deste funil.</p>
          </div>
          <button 
            onClick={handleConfirmSdrs}
            disabled={savingSdrs}
            className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-5 py-3 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
          >
            {savingSdrs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Confirmar e Entrar no CRM
          </button>
        </div>

        {allActiveProfiles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">Nenhum SDR ou Gestor cadastrado no sistema.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Cadastre usuários na tela de Configuração do CRM primeiro.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {allActiveProfiles.map((prof: any) => {
              const isChecked = checkedSdrIds.includes(prof.id);
              return (
                <div 
                  key={prof.id}
                  onClick={() => toggleSdrSelection(prof.id)}
                  className={`glass-panel p-5 border cursor-pointer transition-all flex items-center justify-between group ${
                    isChecked ? "border-primary bg-primary/5 shadow-glow-sm" : "border-white/5 hover:border-white/20"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-white/5 rounded-full flex items-center justify-center font-bold text-foreground text-sm uppercase border border-white/10 shrink-0">
                      {prof.full_name?.substring(0, 2) || "SD"}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">{prof.full_name}</h3>
                      <span className="text-[9px] bg-white/5 text-muted-foreground px-1.5 py-0.5 rounded font-black uppercase mt-1 inline-block">
                        {prof.role === "agency_sdr" ? "SDR" : "Gestor"}
                      </span>
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-md border flex items-center justify-center transition-colors ${
                    isChecked ? "bg-primary border-primary text-primary-foreground" : "border-white/20 group-hover:border-white/40"
                  }`}>
                    {isChecked && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Step 4: Active Work Board (Kanban, List, Agenda, Dashboard)
  const clientName = clients.find(c => c.id === selectedClientId)?.name || "Cliente Local";
  const pipelineName = pipelines.find(p => p.id === selectedPipelineId)?.name || "Funil Padrão";

  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-4">
      {/* Top Header - Consolidated Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-muted-foreground">
            <span>CRM & Vendas</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-foreground">{clientName}</span>
            <ChevronRight className="h-3.5 w-3.5" />
            <span className="text-primary">{pipelineName}</span>
          </div>
          <p className="text-xs text-muted-foreground font-semibold">Operação ativa para leads qualificados e controle de agendamentos.</p>
        </div>

        {/* Top Active SDR Avatars + Actions */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Active SDRs Avatars */}
          {boardActiveSdrs.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white/[0.02] border border-white/5 rounded-full px-3 py-1.5 text-xs font-bold">
              <span className="text-muted-foreground mr-1 text-[10px] uppercase font-black tracking-wider">Equipe:</span>
              <div className="flex -space-x-2 overflow-hidden">
                {boardActiveSdrs.map((sdr: any) => (
                  <div 
                    key={sdr.id} 
                    title={sdr.full_name}
                    className="inline-block h-6 w-6 rounded-full ring-2 ring-background bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold uppercase cursor-help"
                  >
                    {sdr.full_name?.substring(0, 2) || "S"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions Menu */}
          <div className="flex items-center gap-2.5">
            {/* Reset / Go back to client selection */}
            {isManager && (
              <button 
                onClick={resetSelection}
                className="flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Mudar Funil
              </button>
            )}

            {/* SDR Multi-funnel selector shortcut */}
            {isSdr && sdrAssignments.length > 1 && (
              <button 
                onClick={() => setCrmStep("sdr-selection")}
                className="flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Meus Funis
              </button>
            )}

            {/* Configure Pipeline stages (managers only) */}
            {isManager && (
              <button 
                onClick={() => setShowManager(true)}
                className="flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Settings className="h-3.5 w-3.5" />
                Etapas
              </button>
            )}

            {/* Manage SDR allocation for this specific pipeline directly */}
            {isManager && (
              <button 
                onClick={() => setCrmStep("sdrs")}
                className="flex items-center justify-center gap-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <Users className="h-3.5 w-3.5" />
                Alocar SDRs
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar - Funnel view only */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.01] border border-white/5 p-3 rounded-2xl">
        <div className="flex border-b border-white/5 pb-px gap-2">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 pb-2 text-[10px] font-black uppercase tracking-widest border-b-2 px-3 transition-all cursor-pointer ${activeTab === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard Geral
          </button>

          <button
            onClick={() => setActiveTab("funnel")}
            className={`flex items-center gap-2 pb-2 text-[10px] font-black uppercase tracking-widest border-b-2 px-3 transition-all cursor-pointer ${activeTab === "funnel" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Trello className="h-4 w-4" />
            Funis & Vendas
          </button>

          <button
            onClick={() => setActiveTab("agenda")}
            className={`flex items-center gap-2 pb-2 text-[10px] font-black uppercase tracking-widest border-b-2 px-3 transition-all cursor-pointer ${activeTab === "agenda" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarRange className="h-4 w-4" />
            Minha Agenda
          </button>
        </div>

        {activeTab === "funnel" && (
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* My Leads (SDR filter modal shortcut) */}
            {isManager && (
              <button 
                onClick={() => setShowMyLeads(true)}
                className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer"
              >
                <User className="h-3.5 w-3.5" />
                <span>Meus Leads</span>
              </button>
            )}

            {/* Search Input */}
            <div className="relative w-full sm:w-48 lg:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar lead, fone..."
                className="w-full bg-card border border-border rounded-xl pl-9 pr-4 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary transition-all text-foreground font-medium"
              />
            </div>

            {/* CSV Import */}
            <button
              onClick={() => setShowImportLeads(true)}
              className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Importar</span>
            </button>
            
            {/* New Lead */}
            <button 
              onClick={() => setShowCreateLead(true)}
              className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-1.5 text-xs font-bold transition-all shrink-0 shadow-lg shadow-primary/20 cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Novo Lead</span>
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 mt-2 overflow-hidden relative">
        {activeTab === "dashboard" && (
          <div className="h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar pr-1">
            <CrmDashboard 
              clientId={selectedClientId} 
              isAdminOrSdr={isManager} 
            />
          </div>
        )}

        {activeTab === "funnel" && (
          <div className="h-full flex flex-col space-y-3">
            {/* View Switcher: Kanban / List */}
            <div className="flex justify-end gap-2 bg-white/[0.02] border border-white/5 p-1 rounded-xl w-fit self-end text-xs">
              <button
                onClick={() => setFunnelView("kanban")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${funnelView === "kanban" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <Trello className="h-3.5 w-3.5" />
                Quadro Kanban
              </button>
              <button
                onClick={() => setFunnelView("list")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${funnelView === "list" ? "bg-primary/20 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                <List className="h-3.5 w-3.5" />
                Visão de Lista
              </button>
            </div>

            <div className="flex-1 overflow-hidden relative">
              {funnelView === "kanban" ? (
                <KanbanBoard 
                  key={`kb-${refetchTrigger}-${selectedPipelineId}`}
                  readOnly={false} 
                  clientId={selectedClientId}
                  pipelineId={selectedPipelineId} 
                  myLeadsOnly={false} 
                  searchQuery={searchQuery}
                  currentUserId={user?.id}
                />
              ) : (
                <LeadListView 
                  pipelineId={selectedPipelineId}
                  clientId={selectedClientId}
                  searchQuery={searchQuery}
                  myLeadsOnly={false}
                  currentUserId={user?.id}
                  onClickLead={handleOpenLeadDrawer}
                  refetchTrigger={refetchTrigger}
                />
              )}
            </div>
          </div>
        )}

        {activeTab === "agenda" && (
          <div className="h-[calc(100vh-220px)] overflow-y-auto custom-scrollbar pr-1">
            <SdrAgenda 
              clientId={selectedClientId} 
              onClickLead={handleOpenLeadDrawer}
              refetchTrigger={refetchTrigger}
            />
          </div>
        )}
      </div>

      {/* Share Modals */}
      <PipelineManagerModal 
        isOpen={showManager} 
        onClose={() => {
          setShowManager(false);
          // Invalidate pipelines query to reflect changes
          qc.invalidateQueries({ queryKey: ["crm_pipelines_list", selectedClientId] });
        }} 
        preselectedClientId={selectedClientId} 
      />
      
      <CreateLeadModal 
        isOpen={showCreateLead} 
        onClose={() => setShowCreateLead(false)} 
        pipelineId={selectedPipelineId} 
        onSuccess={handleLeadUpdate}
      />

      <ImportLeadsModal 
        isOpen={showImportLeads}
        onClose={() => setShowImportLeads(false)}
        pipelineId={selectedPipelineId}
        clientId={selectedClientId}
        onSuccess={handleLeadUpdate}
      />

      <MyLeadsModal
        isOpen={showMyLeads}
        onClose={() => setShowMyLeads(false)}
        pipelineId={selectedPipelineId}
        clientId={selectedClientId}
        currentUserId={user?.id}
        onClickLead={handleOpenLeadDrawer}
        refetchTrigger={refetchTrigger}
      />

      <LeadDrawer 
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onUpdate={handleLeadUpdate}
        readOnly={false}
      />
    </div>
  );
}
