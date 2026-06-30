import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, Trash2, Edit, X, Check, Loader2, User, Building2, Lock, 
  Settings, Mail, UserCheck, Shield, Eye, EyeOff, Users, ArrowRightLeft, 
  AlertTriangle, ShieldCheck, UserX, ToggleLeft, ToggleRight
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase-external/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/crm-config")({
  head: () => ({ meta: [{ title: "Configurações CRM — NC Suite" }] }),
  component: CrmConfigPage,
});

function CrmConfigPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"users" | "operations">("users");
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "gerente" | "agency_sdr" | "client_store">("agency_sdr");
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState<"ativo" | "inativo">("ativo");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Lead Transfer States
  const [sourceSdrId, setSourceSdrId] = useState("");
  const [targetSdrId, setTargetSdrId] = useState("");
  const [transferClientId, setTransferClientId] = useState("");
  const [transferPipelineId, setTransferPipelineId] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Queries
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      
      // Auto-criação de perfil para resiliência de ambiente no crm-config
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

  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list_config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      return data || [];
    },
    enabled: isManager,
  });

  const { data: crmUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["crm_users_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, clients(name)")
        .in("role", ["admin", "ceo", "gerente", "agency_sdr", "client_store"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isManager,
  });

  // Filter pipelines dynamically based on selected client in Lead Transfer
  const { data: transferPipelines = [] } = useQuery({
    queryKey: ["pipelines_for_transfer", transferClientId],
    queryFn: async () => {
      if (!transferClientId) return [];
      const { data } = await supabase
        .from("crm_pipelines")
        .select("id, name")
        .eq("client_id", transferClientId)
        .order("name");
      return data || [];
    },
    enabled: !!transferClientId && isManager
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("agency_sdr");
    setClientId("");
    setStatus("ativo");
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (userToEdit: any) => {
    setEditingUser(userToEdit);
    setName(userToEdit.full_name || "");
    setEmail(userToEdit.email || "");
    setPassword("");
    setRole(userToEdit.role || "agency_sdr");
    setClientId(userToEdit.client_id || "");
    setStatus((userToEdit.status as any) || "ativo");
    setShowPassword(false);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Nome é obrigatório.");
      return;
    }

    if (!editingUser) {
      if (!email.trim() || !password.trim()) {
        toast.error("Email e senha são obrigatórios para novos usuários.");
        return;
      }
      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres.");
        return;
      }
    }

    if (role === "client_store" && !clientId) {
      toast.error("Por favor, selecione a loja/cliente para o usuário Cliente.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingUser) {
        // Update user
        const { error } = await supabase.rpc("crm_manage_user", {
          action_type: "update",
          target_user_id: editingUser.id,
          new_name: name.trim(),
          new_role: role,
          new_client_id: role === "client_store" ? clientId : null,
          new_password: password.trim() || null,
          new_status: status
        });

        if (error) throw error;
        toast.success("Usuário atualizado com sucesso!");
      } else {
        // Create user
        const { error } = await supabase.rpc("crm_manage_user", {
          action_type: "create",
          new_email: email.trim().toLowerCase(),
          new_password: password.trim(),
          new_name: name.trim(),
          new_role: role,
          new_client_id: role === "client_store" ? clientId : null,
          new_status: status
        });

        if (error) throw error;
        toast.success("Usuário criado com sucesso!");
      }

      setShowModal(false);
      qc.invalidateQueries({ queryKey: ["crm_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar usuário.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (userId === user?.id) {
      toast.error("Você não pode excluir seu próprio usuário.");
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir permanentemente o usuário ${userName}? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const { error } = await supabase.rpc("crm_manage_user", {
        action_type: "delete",
        target_user_id: userId,
      });

      if (error) throw error;
      toast.success("Usuário excluído com sucesso!");
      qc.invalidateQueries({ queryKey: ["crm_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao excluir usuário.");
    }
  };

  // Toggle user status quickly from the list
  const toggleUserStatus = async (userItem: any) => {
    if (userItem.id === user?.id) {
      toast.error("Você não pode desativar seu próprio usuário.");
      return;
    }
    const newStatusVal = userItem.status === "inativo" ? "ativo" : "inativo";
    try {
      const { error } = await supabase.rpc("crm_manage_user", {
        action_type: "update",
        target_user_id: userItem.id,
        new_status: newStatusVal
      });
      if (error) throw error;
      toast.success(`Usuário ${newStatusVal === "ativo" ? "ativado" : "desativado"} com sucesso!`);
      qc.invalidateQueries({ queryKey: ["crm_users_list"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao alterar status.");
    }
  };

  // Execute lead transfer RPC
  const handleTransferLeads = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceSdrId) {
      toast.error("Selecione o SDR de origem.");
      return;
    }
    if (!targetSdrId) {
      toast.error("Selecione o SDR de destino.");
      return;
    }
    if (sourceSdrId === targetSdrId) {
      toast.error("O SDR de origem e de destino devem ser diferentes.");
      return;
    }

    const sourceName = crmUsers.find((u: any) => u.id === sourceSdrId)?.full_name || "SDR Origem";
    const targetName = crmUsers.find((u: any) => u.id === targetSdrId)?.full_name || "SDR Destino";

    if (!confirm(`Confirmar transferência de leads de "${sourceName}" para "${targetName}"?`)) {
      return;
    }

    setTransferring(true);
    try {
      const { data: count, error } = await supabase.rpc("crm_transfer_leads", {
        source_sdr_id: sourceSdrId,
        destination_sdr_id: targetSdrId,
        filter_client_id: transferClientId || null,
        filter_pipeline_id: transferPipelineId || null
      });

      if (error) throw error;
      toast.success(`${count} leads transferidos com sucesso de "${sourceName}" para "${targetName}"!`);
      
      // Reset transfer form
      setSourceSdrId("");
      setTargetSdrId("");
      setTransferClientId("");
      setTransferPipelineId("");
      
      qc.invalidateQueries({ queryKey: ["crm_leads"] });
    } catch (err: any) {
      toast.error(err.message || "Erro ao transferir leads.");
    } finally {
      setTransferring(false);
    }
  };

  if (!isManager) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <Shield className="h-16 w-16 text-red-500/40 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-md">
          Esta página é destinada apenas para administradores e gestores gerenciarem os acessos, permissões e operações do CRM.
        </p>
      </div>
    );
  }

  // Active SDRs list for transfer selectors
  const activeSdrs = crmUsers.filter((u: any) => u.role === "agency_sdr" || u.role === "gerente" || u.role === "admin");

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-10">
      <PageHeader 
        eyebrow="Configurações & Painel Gestor" 
        title="Gestão de Equipe & CRM" 
        description="Gerencie os usuários do CRM, crie acessos de gestores e clientes, e controle a distribuição de oportunidades entre os SDRs." 
      />

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-2">
        <button
          onClick={() => setActiveTab("users")}
          className={`flex items-center gap-2 pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${
            activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-4 w-4" />
          Usuários do CRM
        </button>

        <button
          onClick={() => setActiveTab("operations")}
          className={`flex items-center gap-2 pb-3 text-xs font-black uppercase tracking-widest border-b-2 px-4 transition-all cursor-pointer ${
            activeTab === "operations" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <ArrowRightLeft className="h-4 w-4" />
          Operações de Leads & SDRs
        </button>
      </div>

      {activeTab === "users" && (
        <div className="glass-panel p-6 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-foreground">Equipe CRM e Acessos de Clientes</h3>
              <p className="text-sm text-muted-foreground">Adicione e edite credenciais de acesso para a equipe comercial.</p>
            </div>
            <button 
              onClick={openCreateModal}
              className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm cursor-pointer"
            >
              <Plus className="h-4 w-4" /> Novo Usuário CRM
            </button>
          </div>

          {usersLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : crmUsers.length === 0 ? (
            <div className="text-center py-12 border border-white/5 rounded-2xl bg-white/[0.01]">
              <User className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum usuário CRM cadastrado ainda.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/5">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/5 text-muted-foreground font-bold">
                    <th className="p-4">Nome</th>
                    <th className="p-4">Cargo / Nível</th>
                    <th className="p-4">Empresa / Loja</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {crmUsers.map((u: any) => (
                    <tr key={u.id} className="hover:bg-white/[0.01] transition-colors">
                      <td className="p-4">
                        <div className="font-bold text-foreground flex items-center gap-2">
                          {u.full_name}
                          {u.id === user?.id && (
                            <span className="text-[10px] bg-white/10 text-muted-foreground px-2 py-0.5 rounded font-medium">Você</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{u.email || "Sem e-mail"}</div>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                          u.role === "admin" || u.role === "ceo"
                            ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
                            : u.role === "gerente"
                            ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                            : u.role === "agency_sdr"
                            ? "bg-primary/10 text-primary border border-primary/20"
                            : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                        }`}>
                          {(u.role === "admin" || u.role === "ceo") && <Shield className="h-3 w-3" />}
                          {u.role === "gerente" && <ShieldCheck className="h-3 w-3" />}
                          {u.role === "agency_sdr" && <UserCheck className="h-3 w-3" />}
                          {u.role === "client_store" && <Building2 className="h-3 w-3" />}
                          {u.role === "admin" || u.role === "ceo" 
                            ? "Administrador Master" 
                            : u.role === "gerente" 
                            ? "Gestor de Vendas" 
                            : u.role === "agency_sdr" 
                            ? "SDR (Agência)" 
                            : "Cliente (Visualização)"}
                        </span>
                      </td>
                      <td className="p-4 text-muted-foreground">
                        {u.role === "client_store" ? (
                          <div className="flex items-center gap-1.5 font-medium text-foreground">
                            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                            {u.clients?.name || "Sem loja vinculada"}
                          </div>
                        ) : (
                          <span className="text-xs italic text-muted-foreground/60">Acesso à Agência</span>
                        )}
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleUserStatus(u)}
                          disabled={u.id === user?.id}
                          className="flex items-center gap-2 group cursor-pointer disabled:opacity-50"
                        >
                          {u.status !== "inativo" ? (
                            <span className="flex items-center gap-1 text-success text-xs font-bold bg-success/10 border border-success/20 px-2 py-0.5 rounded-full">
                              <Shield className="h-3 w-3" /> Ativo
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-400 text-xs font-bold bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded-full">
                              <UserX className="h-3 w-3" /> Inativo
                            </span>
                          )}
                          {u.id !== user?.id && (
                            <span className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground transition-opacity">Alterar</span>
                          )}
                        </button>
                      </td>
                      <td className="p-4 text-right space-x-2">
                        <button 
                          onClick={() => openEditModal(u)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors cursor-pointer"
                          title="Editar Usuário"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleDeleteUser(u.id, u.full_name)}
                          disabled={u.id === user?.id || u.role === "admin"}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                          title="Excluir Usuário"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === "operations" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card - Transferência de Leads */}
          <div className="md:col-span-2 glass-panel p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                <ArrowRightLeft className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">Transferência de Leads em Lote</h3>
                <p className="text-sm text-muted-foreground">Mova oportunidades entre operadores de forma instantânea para remarketing ou follow-up.</p>
              </div>
            </div>

            <form onSubmit={handleTransferLeads} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* SDR Origem */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">SDR Origem (De quem tirar os leads)</label>
                  <select 
                    required
                    value={sourceSdrId}
                    onChange={(e) => setSourceSdrId(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    <option value="" disabled>Selecione o SDR...</option>
                    {activeSdrs.map((u: any) => (
                      <option key={u.id} value={u.id} className="bg-card text-foreground">{u.full_name} ({u.status || "ativo"})</option>
                    ))}
                  </select>
                </div>

                {/* SDR Destino */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">SDR Destino (Quem irá assumir os leads)</label>
                  <select 
                    required
                    value={targetSdrId}
                    onChange={(e) => setTargetSdrId(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    <option value="" disabled>Selecione o SDR...</option>
                    {activeSdrs.filter(u => u.id !== sourceSdrId && u.status !== "inativo").map((u: any) => (
                      <option key={u.id} value={u.id} className="bg-card text-foreground">{u.full_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Cliente/Loja filtro (Opcional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cliente/Loja (Opcional)</label>
                  <select 
                    value={transferClientId}
                    onChange={(e) => {
                      setTransferClientId(e.target.value);
                      setTransferPipelineId("");
                    }}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  >
                    <option value="">Todos os clientes</option>
                    {clients.map((c: any) => (
                      <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Funil filtro (Opcional) */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Funil Comercial (Opcional)</label>
                  <select 
                    value={transferPipelineId}
                    disabled={!transferClientId}
                    onChange={(e) => setTransferPipelineId(e.target.value)}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground disabled:opacity-50"
                  >
                    <option value="">Todos os funis</option>
                    {transferPipelines.map((p: any) => (
                      <option key={p.id} value={p.id} className="bg-card text-foreground">{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-white/[0.02] border border-white/5 p-4 rounded-xl space-y-2">
                <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-foreground">Aviso Importante:</span> Os leads serão migrados e reatribuídos ao novo operador mantendo seus respectivos históricos de tarefas, agendamentos e status atuais. A redistribuição é instantânea.
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={transferring || !sourceSdrId || !targetSdrId}
                  className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-6 py-3 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
                >
                  {transferring ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Transferindo...
                    </>
                  ) : (
                    <>
                      <ArrowRightLeft className="h-4 w-4" /> Transferir Leads em Lote
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Dicas e Operação */}
          <div className="glass-panel p-6 space-y-6">
            <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Settings className="h-4 w-4" /> Dicas de Fluxo de SDRs
            </h4>
            
            <div className="space-y-4 text-xs text-muted-foreground leading-relaxed">
              <p>
                <strong className="text-foreground">SDR Inativo:</strong> Ao desligar ou afastar um SDR da agência, altere seu status para <span className="text-red-400 font-bold">Inativo</span>. Ele não conseguirá fazer login nem aparecerá para novas distribuições de leads.
              </p>
              <p>
                <strong className="text-foreground">Recuperação de Leads:</strong> Utilize o filtro de transferência de lote selecionando um funil específico para direcionar oportunidades frias a outro SDR especialista em reengajamento.
              </p>
              <p>
                <strong className="text-foreground">Cargos Elevados:</strong> Usuários com o cargo <span className="text-amber-400 font-bold">Gestor de Vendas</span> podem cadastrar lojas, gerenciar pipelines de todos os clientes e reatribuir leads, além de analisar os gráficos do dashboard.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal - Cadastro e Edição */}
      <AnimatePresence>
        {showModal && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-card border border-white/10 rounded-3xl p-6 w-full max-w-md shadow-2xl relative space-y-6"
              >
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">
                      {editingUser ? "Editar Usuário CRM" : "Novo Usuário CRM"}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {editingUser ? "Atualize as credenciais e acessos do usuário" : "Cadastre uma nova credencial no portal CRM"}
                    </p>
                  </div>
                  <button 
                    onClick={() => setShowModal(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* Nome */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Nome Completo</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <input 
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Ex: João da Silva"
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email (Login)</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <input 
                        type="email"
                        required
                        disabled={!!editingUser}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Ex: joao@email.com"
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                      />
                    </div>
                  </div>

                  {/* Senha */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      {editingUser ? "Nova Senha (Opcional)" : "Senha de Acesso"}
                    </label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <input 
                        type={showPassword ? "text" : "password"}
                        required={!editingUser}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder={editingUser ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"}
                        className="w-full bg-black/30 border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-3.5 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Nível/Cargo */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cargo / Tipo de Acesso</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        type="button"
                        onClick={() => setRole("agency_sdr")}
                        className={`p-2.5 rounded-xl border text-center font-bold text-[10px] tracking-wider uppercase transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          role === "agency_sdr" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <UserCheck className="h-4 w-4" />
                        SDR Operador
                      </button>
                      <button 
                        type="button"
                        onClick={() => setRole("gerente")}
                        className={`p-2.5 rounded-xl border text-center font-bold text-[10px] tracking-wider uppercase transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          role === "gerente" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        Gestor Vendas
                      </button>
                      <button 
                        type="button"
                        onClick={() => setRole("admin")}
                        className={`p-2.5 rounded-xl border text-center font-bold text-[10px] tracking-wider uppercase transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          role === "admin" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <Shield className="h-4 w-4" />
                        Admin Master
                      </button>
                      <button 
                        type="button"
                        onClick={() => setRole("client_store")}
                        className={`p-2.5 rounded-xl border text-center font-bold text-[10px] tracking-wider uppercase transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                          role === "client_store" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <Building2 className="h-4 w-4" />
                        Cliente/Loja
                      </button>
                    </div>
                  </div>

                  {/* Seleção do Cliente (apenas se for client_store) */}
                  {role === "client_store" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Vincular à Loja / Cliente</label>
                      <select 
                        required
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      >
                        <option value="" disabled className="bg-card">Selecione uma loja...</option>
                        {clients.map((c: any) => (
                          <option key={c.id} value={c.id} className="bg-card text-foreground">{c.name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Status (Ativo/Inativo) - Apenas edição */}
                  {editingUser && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Status do Usuário</label>
                      <select 
                        value={status}
                        onChange={(e) => setStatus(e.target.value as any)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                      >
                        <option value="ativo" className="bg-card">Ativo</option>
                        <option value="inativo" className="bg-card">Inativo</option>
                      </select>
                    </div>
                  )}

                  {/* Ações */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5 mt-6">
                    <button 
                      type="button"
                      onClick={() => setShowModal(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={submitting}
                      className="flex items-center gap-2 bg-primary text-primary-foreground font-bold text-xs px-5 py-2.5 rounded-xl hover:bg-primary/95 transition-all shadow-glow-sm disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4" /> Salvar Credencial
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
