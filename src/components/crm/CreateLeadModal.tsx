import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Loader2, User, Phone, Mail, Car, Thermometer, Building2, Filter } from "lucide-react";
import { supabase } from "@/integrations/supabase-external/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

interface CreateLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  pipelineId: string;
  onSuccess: () => void;
}

export function CreateLeadModal({ isOpen, onClose, pipelineId, onSuccess }: CreateLeadModalProps) {
  const { user } = useAuth();
  
  // Perfil do usuário atual
  const { data: profile } = useQuery({
    queryKey: ["current_user_profile", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("role, client_id")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicleInterest, setVehicleInterest] = useState("");
  const [source, setSource] = useState("Cadastro Manual");
  const [negotiationLevel, setNegotiationLevel] = useState("Frio");
  const [assignedTo, setAssignedTo] = useState("");
  const [loading, setLoading] = useState(false);

  // Queries de dados para os dropdowns
  const { data: clients = [] } = useQuery({
    queryKey: ["clients_list"],
    queryFn: async () => {
      const { data } = await supabase.from("clients").select("id, name").order("name");
      return data || [];
    }
  });

  const { data: pipelines = [] } = useQuery({
    queryKey: ["crm_pipelines", selectedClientId],
    queryFn: async () => {
      if (!selectedClientId) return [];
      const { data, error } = await (supabase as any)
        .from("crm_pipelines")
        .select("id, name")
        .eq("client_id", selectedClientId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedClientId
  });

  const { data: sdrs = [] } = useQuery({
    queryKey: ["crm_sdrs", selectedClientId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, role, client_id")
        .in("role", ["agency_sdr", "admin", "client_store"])
        .order("full_name");
        
      if (error) throw error;
      
      return (data || []).filter((p: any) => 
        p.role !== "client_store" || 
        !selectedClientId || 
        p.client_id === selectedClientId
      );
    },
    enabled: isOpen
  });

  // Filtrar clientes baseados na role
  const userRole = profile?.role;
  const userClientId = profile?.client_id;
  
  const filteredClients = clients.filter((c: any) => {
    if (userRole === "admin" || userRole === "agency_sdr") return true;
    return c.id === userClientId;
  });

  useEffect(() => {
    if (isOpen) {
      // Reset form
      setName("");
      setPhone("");
      setEmail("");
      setVehicleInterest("");
      setSource("Cadastro Manual");
      setNegotiationLevel("Frio");
      setAssignedTo("");
      
      // Tentar inicializar o cliente e funil a partir do pipeline selecionado em background
      const initializeIds = async () => {
        if (pipelineId) {
          setSelectedPipelineId(pipelineId);
          const { data } = await (supabase as any)
            .from("crm_pipelines")
            .select("client_id")
            .eq("id", pipelineId)
            .maybeSingle();
          if (data && data.client_id) {
            setSelectedClientId(data.client_id);
          }
        } else {
          setSelectedPipelineId("");
          setSelectedClientId(userRole === "client_store" && userClientId ? userClientId : "");
        }
      };
      
      initializeIds();
    }
  }, [isOpen, pipelineId, userRole, userClientId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("O nome do lead é obrigatório.");
      return;
    }
    
    if (!selectedClientId) {
      toast.error("Por favor, selecione um cliente/conta.");
      return;
    }

    if (!selectedPipelineId) {
      toast.error("Por favor, selecione um funil de vendas.");
      return;
    }

    setLoading(true);

    try {
      // 1. Obter a primeira etapa do funil
      const { data: stages, error: stagesError } = await (supabase as any)
        .from("crm_pipeline_stages")
        .select("id")
        .eq("pipeline_id", selectedPipelineId)
        .order("stage_order", { ascending: true })
        .limit(1);

      if (stagesError) throw stagesError;

      if (!stages || stages.length === 0) {
        toast.error("Crie pelo menos uma etapa nas configurações do funil antes de adicionar leads.");
        setLoading(false);
        return;
      }

      const firstStageId = stages[0].id;

      // 2. Inserir o lead (Sem lead_value)
      const { error: insertError } = await (supabase as any)
        .from("crm_leads")
        .insert({
          name,
          phone: phone || null,
          email: email || null,
          vehicle_interest: vehicleInterest || null,
          source,
          negotiation_level: negotiationLevel,
          assigned_to: assignedTo || null,
          pipeline_id: selectedPipelineId,
          client_id: selectedClientId,
          stage_id: firstStageId,
          status: "Novo"
        });

      if (insertError) throw insertError;

      toast.success("Lead criado com sucesso!");
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao criar lead.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[100] flex items-center justify-center p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 15 }}
          className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-border bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                <Plus className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-black text-foreground uppercase tracking-wider">Novo Lead</h3>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-all cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form noValidate onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[80vh] custom-scrollbar">
            
            {/* Conta / Cliente */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Building2 className="h-3 w-3" /> Conta / Cliente *
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setSelectedPipelineId(""); // Reset pipeline when client changes
                  setAssignedTo(""); // Reset assigned SDR as well
                }}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer bg-card"
                required
              >
                <option value="">Selecione um cliente...</option>
                {filteredClients.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Funil de Vendas */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Funil de Vendas *
              </label>
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer bg-card"
                required
                disabled={!selectedClientId}
              >
                <option value="">Selecione um funil...</option>
                {pipelines.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t border-border my-2" />

            {/* Nome */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> Nome Completo *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* Telefone */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> Telefone
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: (11) 99999-9999"
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Mail className="h-3 w-3" /> E-mail
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Ex: joao@email.com"
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* Veiculo de Interesse */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Car className="h-3 w-3" /> Veículo de Interesse
              </label>
              <input
                type="text"
                value={vehicleInterest}
                onChange={(e) => setVehicleInterest(e.target.value)}
                placeholder="Ex: Corolla XEI 2023"
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* Origem do Lead (source) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                📍 Origem do Lead
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer bg-card"
              >
                <option value="Cadastro Manual">Cadastro Manual</option>
                <option value="Meta Ads">Meta Ads</option>
                <option value="Google Ads">Google Ads</option>
                <option value="Landing Page">Landing Page</option>
                <option value="Indicação">Indicação</option>
                <option value="WhatsApp/Orgânico">WhatsApp/Orgânico</option>
              </select>
            </div>

            {/* Nivel de Negociação (Temperatura) */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Thermometer className="h-3 w-3" /> Temperatura do Lead
              </label>
              <select
                value={negotiationLevel}
                onChange={(e) => setNegotiationLevel(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer bg-card"
              >
                <option value="Frio">❄ Frio</option>
                <option value="Morno">🔥 Morno</option>
                <option value="Quente">⚡ Quente</option>
              </select>
            </div>

            {/* SDR Responsável */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <User className="h-3 w-3" /> SDR Responsável
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full bg-background border border-border rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground cursor-pointer bg-card"
              >
                <option value="">Não atribuído</option>
                {sdrs.map((sdr: any) => (
                  <option key={sdr.id} value={sdr.id}>
                    {sdr.full_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 text-xs font-bold transition-all shadow-glow-sm flex items-center gap-2 cursor-pointer"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Salvar Lead
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
