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
  Filter, 
  Search, 
  Plus, 
  Settings, 
  User, 
  LayoutDashboard, 
  Trello, 
  List, 
  CalendarRange, 
  Upload
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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

  // Load current user profile (role, client_id)
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      
      // Auto-criação de perfil para resiliência de ambiente
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
        
        const { data: inserted, error: insertError } = await (supabase as any)
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
  const isAdmin = profile?.role === "admin" || (user?.email ? ADMIN_EMAILS.includes(user.email) : false);
  const isAdminOrSdr = isAdmin || profile?.role === "agency_sdr";
  const userClientId = profile?.client_id;
  const userRole = isAdmin ? "admin" : profile?.role;

  // CRM Tabs: "dashboard" | "funnel" | "agenda"
  const [activeTab, setActiveTab] = useState<"dashboard" | "funnel" | "agenda">("funnel");
  
  // Funnel Sub-views: "kanban" | "list"
  const [funnelView, setFunnelView] = useState<"kanban" | "list">("kanban");

  // Shared Filters
  const [globalClientId, setGlobalClientId] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  // Modals
  const [showManager, setShowManager] = useState(false);
  const [showCreateLead, setShowCreateLead] = useState(false);
  const [showImportLeads, setShowImportLeads] = useState(false);
  const [showMyLeads, setShowMyLeads] = useState(false);

  // Lead Drawer (For List and Agenda views)
  const [selectedLead, setSelectedLead] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [refetchTrigger, setRefetchTrigger] = useState(0);

  // Load clients for global filter
  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list_crm"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("clients").select("id, name").order("name");
      return data || [];
    },
    enabled: isAdminOrSdr
  });

  // Load available pipelines
  const { data: pipelines = [], isLoading: loadingPipelines } = useQuery({
    queryKey: ["crm_pipelines_dropdown", userRole, userClientId, globalClientId],
    queryFn: async () => {
      let query = (supabase as any)
        .from("crm_pipelines")
        .select("id, name, client_id, clients(name)");
      
      // Se for client_store, filtra no client_id dele.
      if (userRole === "client_store" && userClientId) {
        query = query.eq("client_id", userClientId);
      } else if (globalClientId !== "ALL") {
        query = query.eq("client_id", globalClientId);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile,
  });

  // Auto-select the first pipeline
  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    } else if (pipelines.length === 0 && !loadingPipelines) {
      setSelectedPipelineId("");
    }
  }, [pipelines, selectedPipelineId, loadingPipelines]);

  const handleOpenLeadDrawer = (lead: any) => {
    setSelectedLead(lead);
    setDrawerOpen(true);
  };

  const handleLeadUpdate = () => {
    setRefetchTrigger(prev => prev + 1);
  };

  return (
    <div className="mx-auto max-w-[1600px] h-full flex flex-col p-1 space-y-4">
      <PageHeader 
        eyebrow="Commercial Hub" 
        title="CRM & Pipeline Comercial" 
        description="Gestão de leads, funis de vendas, agendamentos de visitas e cadência comercial dos SDRs."
        actions={
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Tab Switched Header Actions */}
            {activeTab === "funnel" && (
              <>
                {/* Global Client Selector (Only Admin/SDR) */}
                {isAdminOrSdr && (
                  <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold w-full sm:w-auto">
                    <User className="h-3.5 w-3.5 text-primary" />
                    <select 
                      value={globalClientId}
                      onChange={(e) => {
                        setGlobalClientId(e.target.value);
                        setSelectedPipelineId(""); // Reset pipeline when client changes
                      }}
                      className="bg-transparent border-none text-foreground font-black focus:outline-none cursor-pointer w-full sm:w-auto bg-card"
                    >
                      <option value="ALL">Todas as Contas</option>
                      {clients.map((c: any) => (
                        <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Pipeline Selector */}
                <div className="flex items-center gap-2 bg-white/[0.03] border border-white/10 rounded-full px-3 py-1.5 text-xs font-bold w-full sm:w-auto">
                  <Filter className="h-3.5 w-3.5 text-primary" />
                  <select 
                    value={selectedPipelineId}
                    onChange={(e) => setSelectedPipelineId(e.target.value)}
                    className="bg-transparent border-none text-foreground font-black focus:outline-none cursor-pointer w-full sm:w-auto bg-card"
                  >
                    {pipelines.length === 0 ? (
                      <option value="">Nenhum funil ativo</option>
                    ) : (
                      pipelines.map((p: any) => (
                        <option key={p.id} value={p.id} className="bg-card text-foreground">
                          {p.name} {p.clients?.name && globalClientId === "ALL" ? `(${p.clients.name})` : ""}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Settings Pipeline (Only Admin/SDR) */}
                {isAdminOrSdr && (
                  <button 
                    onClick={() => setShowManager(true)}
                    className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Configurar Funil</span>
                  </button>
                )}

                {/* My Leads Button (Opens Modal) */}
                {isAdminOrSdr && (
                  <button 
                    onClick={() => {
                      if (!selectedPipelineId) {
                        toast.error("Selecione um funil primeiro para ver seus leads.");
                        return;
                      }
                      setShowMyLeads(true);
                    }}
                    className="flex items-center justify-center gap-2 bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 cursor-pointer"
                  >
                    <User className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Meus Leads</span>
                  </button>
                )}

                {/* Search */}
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

                {/* Import leads */}
                <button
                  onClick={() => {
                    if (!selectedPipelineId) {
                      toast.error("Por favor, selecione um funil primeiro.");
                      return;
                    }
                    setShowImportLeads(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Importar CSV</span>
                </button>
                
                {/* Novo lead */}
                <button 
                  onClick={() => {
                    if (!selectedPipelineId) {
                      toast.error("Por favor, selecione ou crie um funil primeiro.");
                      return;
                    }
                    setShowCreateLead(true);
                  }}
                  className="flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-xl px-4 py-1.5 text-xs font-bold transition-all shrink-0 shadow-lg shadow-primary/20 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Novo Lead</span>
                </button>
              </>
            )}
          </div>
        }
      />

      {/* Navegação entre Abas do CRM */}
      <div className="flex border-b border-white/5 pb-px gap-2">
        <button
          onClick={() => setActiveTab("dashboard")}
          className={`flex items-center gap-2 pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${activeTab === "dashboard" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <LayoutDashboard className="h-4 w-4" />
          Dashboard Geral
        </button>

        <button
          onClick={() => setActiveTab("funnel")}
          className={`flex items-center gap-2 pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${activeTab === "funnel" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Trello className="h-4 w-4" />
          Funis & Vendas
        </button>

        <button
          onClick={() => setActiveTab("agenda")}
          className={`flex items-center gap-2 pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${activeTab === "agenda" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <CalendarRange className="h-4 w-4" />
          Minha Agenda (SDR)
        </button>
      </div>

      {/* Área de Conteúdo Centralizada */}
      <div className="flex-1 mt-2 overflow-hidden relative">
        {activeTab === "dashboard" && (
          <div className="h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar pr-1">
            <CrmDashboard 
              clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId} 
              isAdminOrSdr={isAdminOrSdr} 
            />
          </div>
        )}

        {activeTab === "funnel" && (
          <div className="h-full flex flex-col space-y-3">
            {/* Alternador Kanban / Lista */}
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
              {pipelines.length === 0 && !loadingPipelines ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <Filter className="h-12 w-12 opacity-20 mb-3" />
                  <p className="text-sm font-bold">Nenhum funil comercial ativo</p>
                  {isAdminOrSdr && (
                    <>
                      <p className="text-xs mt-1">Crie um funil comercial para começar a gerenciar contatos.</p>
                      <button 
                        onClick={() => setShowManager(true)}
                        className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-bold hover:bg-primary/90 transition-colors"
                      >
                        Gerenciar Funis
                      </button>
                    </>
                  )}
                </div>
              ) : funnelView === "kanban" ? (
                <KanbanBoard 
                  key={`kb-${refetchTrigger}`}
                  readOnly={false} 
                  clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId}
                  pipelineId={selectedPipelineId} 
                  myLeadsOnly={false} 
                  searchQuery={searchQuery}
                  currentUserId={user?.id}
                />
              ) : (
                <LeadListView 
                  pipelineId={selectedPipelineId}
                  clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId}
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
          <div className="h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar pr-1">
            <SdrAgenda 
              clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId} 
              onClickLead={handleOpenLeadDrawer}
              refetchTrigger={refetchTrigger}
            />
          </div>
        )}
      </div>

      {/* Modais Compartilhados */}
      <PipelineManagerModal 
        isOpen={showManager} 
        onClose={() => setShowManager(false)} 
        preselectedClientId={globalClientId !== "ALL" ? globalClientId : undefined} 
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
        clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId}
        onSuccess={handleLeadUpdate}
      />

      <MyLeadsModal
        isOpen={showMyLeads}
        onClose={() => setShowMyLeads(false)}
        pipelineId={selectedPipelineId}
        clientId={isAdminOrSdr && globalClientId !== "ALL" ? globalClientId : userClientId}
        currentUserId={user?.id}
        onClickLead={handleOpenLeadDrawer}
        refetchTrigger={refetchTrigger}
      />

      {/* Shared Lead Drawer (opened from List or Agenda) */}
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
