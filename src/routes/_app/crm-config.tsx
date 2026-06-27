import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Plus, Trash2, Edit, X, Check, Loader2, User, Building2, Lock, 
  Settings, Mail, UserCheck, Shield, Eye, EyeOff 
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

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"agency_sdr" | "client_store">("agency_sdr");
  const [clientId, setClientId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Queries
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id,
  });

  const isAdminOrSdr = profile?.role === "admin" || profile?.role === "agency_sdr";

  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list_config"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      return data || [];
    },
    enabled: isAdminOrSdr,
  });

  const { data: crmUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ["crm_users_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*, clients(name)")
        .in("role", ["admin", "agency_sdr", "client_store"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: isAdminOrSdr,
  });

  const openCreateModal = () => {
    setEditingUser(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("agency_sdr");
    setClientId("");
    setShowPassword(false);
    setShowModal(true);
  };

  const openEditModal = (userToEdit: any) => {
    setEditingUser(userToEdit);
    setName(userToEdit.full_name || "");
    setEmail(userToEdit.email || "");
    setPassword("");
    setRole(userToEdit.role === "client_store" ? "client_store" : "agency_sdr");
    setClientId(userToEdit.client_id || "");
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

  if (!isAdminOrSdr) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center p-8">
        <Shield className="h-16 w-16 text-red-500/40 mb-4" />
        <h2 className="text-xl font-bold text-foreground mb-2">Acesso Restrito</h2>
        <p className="text-muted-foreground max-w-md">
          Esta página é destinada apenas para administradores e SDRs gerenciarem os acessos e permissões do CRM.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <PageHeader 
        eyebrow="CRM & Vendas" 
        title="Gestão de Usuários CRM" 
        description="Gerencie os usuários SDR da sua agência e crie acessos de leitura exclusivos para os seus clientes visualizarem o funil de leads." 
      />

      <div className="glass-panel p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-foreground">Equipe CRM e Acessos de Clientes</h3>
            <p className="text-sm text-muted-foreground">Usuários cadastrados no hub de vendas.</p>
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
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {crmUsers.map((u: any) => (
                  <tr key={u.id} className="hover:bg-white/[0.01] transition-colors">
                    <td className="p-4">
                      <div className="font-bold text-foreground">{u.full_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{u.email || "Sem e-mail"}</div>
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                        u.role === "admin" 
                          ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
                          : u.role === "agency_sdr"
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                      }`}>
                        {u.role === "admin" && <Shield className="h-3 w-3" />}
                        {u.role === "agency_sdr" && <UserCheck className="h-3 w-3" />}
                        {u.role === "client_store" && <Building2 className="h-3 w-3" />}
                        {u.role === "admin" ? "Administrador Master" : u.role === "agency_sdr" ? "SDR (Agência)" : "Cliente (Visualização)"}
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
                        className={`p-3 rounded-xl border text-center font-bold text-xs transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          role === "agency_sdr" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <UserCheck className="h-4 w-4" />
                        SDR da Agência
                      </button>
                      <button 
                        type="button"
                        onClick={() => setRole("client_store")}
                        className={`p-3 rounded-xl border text-center font-bold text-xs transition-all flex flex-col items-center gap-1 cursor-pointer ${
                          role === "client_store" 
                            ? "border-primary bg-primary/10 text-primary" 
                            : "border-white/10 bg-black/25 text-muted-foreground hover:border-white/20"
                        }`}
                      >
                        <Building2 className="h-4 w-4" />
                        Cliente / Loja
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
